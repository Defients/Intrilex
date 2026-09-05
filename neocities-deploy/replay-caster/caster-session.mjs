// ═══════════════════════════════════════════════════════════════
// caster-session.mjs — Replay Caster session orchestrator.
//
// Ties together: match generation/loading, beat building, playback
// direction, narrative threads, diagnostics, commentary planning,
// provider dispatch + caching, commentary history with provenance,
// and WAIT WHAT captures.
//
// Authority invariants enforced here:
//   - The match is ALWAYS pre-generated (runPolicyMatch). Commentary
//     never generates or resolves the match.
//   - No LLM output is sent to IntrilexEngine.execute.
//   - Replay hashes / final-state hashes are captured from the
//     completed match and never mutated.
//   - Commentary output is NOT part of canonical match identity.
//   - Ollama failure never pauses or corrupts playback.
// ═══════════════════════════════════════════════════════════════

import { hashCanonical } from '@intrilex/shared';
// NOTE: runPolicyMatch and reconstructAuthorityCheckpoints are imported
// dynamically inside generateMatch() because @intrilex/simulation-runtime
// and @intrilex/engine-adapter are not browser-bundleable. The browser
// UI uses loadCompletedMatch() with its own browser-built match result.
import {
  CASTER_SCHEMA_VERSION, COMMENTARY_PROMPT_VERSION, COMMENTARY_MODE, VIEWER_MODE,
  buildSessionEnvelope
} from './schemas.mjs';
import { buildBeats } from './beat-builder.mjs';
import { PlaybackDirector, SUPPORTED_SPEEDS } from './playback-director.mjs';
import { buildThreadRegistry } from './narrative-thread.mjs';
import { runDiagnostics } from './diagnostics.mjs';
import { buildCommentaryInput } from './commentary-planner.mjs';
import { DeterministicCommentaryProvider } from './commentary-provider.mjs';
import { captureWaitWhat } from './wait-what.mjs';

/**
 * @param {object} opts
 * @param {CommentaryProvider} [opts.provider] - defaults to DeterministicCommentaryProvider
 * @param {string} [opts.mode] - COMMENTARY_MODE (default BROADCAST)
 * @param {string} [opts.viewerMode] - VIEWER_MODE (default PUBLIC)
 * @param {object} [opts.settings] - { model, density }
 */
export class CasterSession {
  constructor({ provider, mode, viewerMode, settings } = {}) {
    this._provider = provider || new DeterministicCommentaryProvider();
    this._mode = mode === COMMENTARY_MODE.DEV_OBSERVATORY ? mode : COMMENTARY_MODE.BROADCAST;
    this._viewerMode = viewerMode ?? VIEWER_MODE.PUBLIC;
    this._settings = settings || {};
    this._cache = new Map();
    this._commentaryHistory = []; // { commentaryId, beatId, decisionId, checkpointHash, mode, text, sourceFacts, generatedBy }
    this._waitWhatCaptures = [];
    this._telemetry = { beatsViewed: 0, commentaryGenerated: 0, cacheHits: 0, cacheMisses: 0, failedGenerations: 0, waitWhatCaptures: 0 };

    // Match state (populated by generateMatch / loadCompletedMatch)
    this.matchResult = null;
    this.frames = null;
    this.beats = [];
    this.threads = [];
    this.diagnostics = [];
    this.director = null;
    this.matchId = null;
    this.replayHash = null;
    this.finalStateHash = null;
    this.engineVersion = null;
    this.rulesVersion = null;
    this.profileId = null;
    this.policyIds = [];
  }

  get mode() { return this._mode; }
  get viewerMode() { return this._viewerMode; }
  get commentaryHistory() { return this._commentaryHistory; }
  get waitWhatCaptures() { return this._waitWhatCaptures; }
  get telemetry() { return this._telemetry; }

  /**
   * Generate a new AI-vs-AI match and prepare it for casting.
   * The match is fully generated BEFORE playback; Ollama is never
   * required to generate or resolve it.
   *
   * Uses dynamic imports of @intrilex/simulation-runtime and
   * @intrilex/engine-adapter (Node-only). The browser UI should use
   * loadCompletedMatch() with its own browser-built match result.
   *
   * @param {object} config - runPolicyMatch config
   * @returns {object} session envelope
   */
  async generateMatch(config = {}) {
    // Dynamic imports are constructed with string concatenation so esbuild
    // cannot statically resolve them at bundle time. The browser never calls
    // generateMatch (it uses loadCompletedMatch with its own match result);
    // these imports are Node-only and resolve at runtime on Node.
    const runtimePath = '@intrilex/' + 'simulation-runtime';
    const adapterPath = '@intrilex/' + 'engine-adapter';
    const { runPolicyMatch } = await import(runtimePath);
    const { reconstructAuthorityCheckpoints } = await import(adapterPath);
    const cfg = {
      profileId: config.profileId,
      seatOrder: config.seatOrder ?? ['P1', 'P2'],
      policyIds: config.policyIds ?? ['hybrix-baseline', 'hybrix-rusher'],
      seed: config.seed ?? 1,
      decisionLimit: config.decisionLimit ?? 1200,
      includeReplay: true,
      decisionTracesEnabled: true
    };
    const matchResult = runPolicyMatch(cfg);
    const frames = reconstructAuthorityCheckpoints(matchResult.replay);
    return this.loadCompletedMatch(matchResult, frames);
  }

  /**
   * Load an already-completed match (e.g. a retained replay) into the
   * session. The match must be complete; Caster never generates it live.
   *
   * @param {object} matchResult - runPolicyMatch result (with replay)
   * @param {Array} frames - reconstructed authority frames
   * @returns {object} session envelope
   */
  loadCompletedMatch(matchResult, frames) {
    this.matchResult = matchResult;
    this.frames = frames;
    const built = buildBeats(matchResult, frames, { viewerMode: this._viewerMode });
    this.beats = built.beats;
    this.threads = buildThreadRegistry(this.beats);
    this.diagnostics = runDiagnostics(matchResult, this.beats, frames);
    this.director = new PlaybackDirector({ beats: this.beats });

    const s = matchResult.summary;
    this.matchId = s.matchId;
    this.replayHash = s.replayHash ?? s.matchResultHash ?? matchResult.replay?.contentHash ?? null;
    this.finalStateHash = s.finalStateHash;
    this.engineVersion = matchResult.provenance?.engineVersion ?? null;
    this.rulesVersion = matchResult.provenance?.rulesVersion ?? null;
    this.profileId = s.profileId;
    this.policyIds = s.policyIds ?? [];

    // Reset per-session state.
    this._cache.clear();
    this._commentaryHistory.length = 0;
    this._waitWhatCaptures.length = 0;
    this._telemetry = { beatsViewed: 0, commentaryGenerated: 0, cacheHits: 0, cacheMisses: 0, failedGenerations: 0, waitWhatCaptures: 0 };

    return this.envelope();
  }

  envelope() {
    return buildSessionEnvelope(this);
  }

  // ── Playback (delegates to director) ──────────────────────────
  play() { this.director?.play(); }
  pause() { this.director?.pause(); }
  toggle() { this.director?.toggle(); }
  stepForward() { return this.director?.stepForward() ?? false; }
  stepBackward() { return this.director?.stepBackward() ?? false; }
  nextMajorBeat() { return this.director?.nextMajorBeat() ?? false; }
  prevMajorBeat() { return this.director?.prevMajorBeat() ?? false; }
  skipToEnd() { this.director?.skipToEnd(); }
  setSpeed(s) { this.director?.setSpeed(s); }
  tick() { return this.director?.tick() ?? false; }
  get index() { return this.director?.index ?? 0; }
  get currentBeat() { return this.director?.currentBeat() ?? null; }

  setMode(mode) {
    this._mode = mode === COMMENTARY_MODE.DEV_OBSERVATORY ? mode : COMMENTARY_MODE.BROADCAST;
    // Mode change invalidates commentary cache (different prompt intent).
    this._cache.clear();
  }

  setViewerMode(viewerMode) {
    this._viewerMode = viewerMode ?? VIEWER_MODE.PUBLIC;
    // Viewer mode change invalidates cache (different projection).
    this._cache.clear();
  }

  /**
   * Generate (or retrieve from cache) commentary for the current beat.
   * Never blocks playback; the UI calls this after a beat change.
   *
   * @param {object} [opts]
   * @param {function} [opts.onToken] - streaming callback (textChunk) => void
   * @returns {Promise<{ok, record, commentaryId, cached, error}>}
   */
  async generateCommentaryForCurrentBeat({ onToken } = {}) {
    if (!this.director) return { ok: false, record: null, commentaryId: null, cached: false, error: 'NO_SESSION' };
    const beat = this.director.currentBeat();
    if (!beat) return { ok: false, record: null, commentaryId: null, cached: false, error: 'NO_BEAT' };
    this._telemetry.beatsViewed += 1;

    const input = buildCommentaryInput({
      beats: this.beats,
      beatIndex: this.director.index,
      mode: this._mode,
      viewerMode: this._viewerMode,
      threads: this.threads,
      diagnostics: this.diagnostics,
      commentaryHistory: this._commentaryHistory,
      matchMeta: {
        matchId: this.matchId,
        policyIds: this.policyIds,
        engineVersion: this.engineVersion,
        rulesVersion: this.rulesVersion,
        profileId: this.profileId,
        winner: this.matchResult?.summary?.winner,
        terminationReason: this.matchResult?.summary?.terminationReason
      },
      settings: this._settings
    });

    if (!input.eligible) {
      return { ok: true, record: null, commentaryId: null, cached: false, error: null, skipped: true };
    }

    // Cache lookup.
    if (this._cache.has(input.cacheKey)) {
      this._telemetry.cacheHits += 1;
      const cached = this._cache.get(input.cacheKey);
      return { ok: true, record: cached.record, commentaryId: cached.commentaryId, cached: true, error: null };
    }
    this._telemetry.cacheMisses += 1;

    const result = await this._provider.generateCommentary(input, { onToken });
    if (!result.ok || !result.record) {
      this._telemetry.failedGenerations += 1;
      return { ok: false, record: result.record, commentaryId: null, cached: false, error: result.error };
    }

    this._telemetry.commentaryGenerated += 1;
    const commentaryId = `CM-${hashCanonical({ beatId: beat.beatId, cacheKey: input.cacheKey }).slice(0, 16)}`;
    const historyEntry = {
      commentaryId,
      beatId: beat.beatId,
      decisionId: beat.decisionId,
      checkpointHash: beat.checkpointHashAfter ?? beat.checkpointHashBefore,
      mode: this._mode,
      text: result.record.commentary,
      sourceFacts: [beat.beatId, beat.action?.family].filter(Boolean),
      generatedBy: { provider: this._provider.name, model: this._settings.model || null, promptVersion: COMMENTARY_PROMPT_VERSION }
    };
    this._commentaryHistory.push(historyEntry);
    this._cache.set(input.cacheKey, { record: result.record, commentaryId });
    return { ok: true, record: result.record, commentaryId, cached: false, error: null };
  }

  /**
   * Capture a WAIT WHAT investigation envelope at the current position.
   * @returns {object} validated WaitWhatCapture
   */
  waitWhat() {
    if (!this.director) return null;
    this._telemetry.waitWhatCaptures += 1;
    const beat = this.director.currentBeat();
    const trace = this.matchResult?.decisionTraces?.[this._decisionIndexForBeat(beat)] ?? null;
    const capture = captureWaitWhat({
      beats: this.beats,
      beatIndex: this.director.index,
      session: this.envelope(),
      diagnostics: this.diagnostics,
      commentary: this._commentaryHistory.find(c => c.beatId === beat?.beatId)?.text ?? null,
      playbackTime: this.director.playbackTimeSeconds(),
      decisionTrace: trace
    });
    this._waitWhatCaptures.push(capture);
    return capture;
  }

  /** Jump playback to the beat referenced by a commentary entry. */
  jumpToCommentary(commentaryId) {
    const entry = this._commentaryHistory.find(c => c.commentaryId === commentaryId);
    if (!entry) return false;
    const idx = this.beats.findIndex(b => b.beatId === entry.beatId);
    if (idx < 0) return false;
    this.director?.stepTo(idx);
    return true;
  }

  /** Jump playback to a beat by id (evidence navigation). */
  jumpToBeat(beatId) {
    const idx = this.beats.findIndex(b => b.beatId === beatId);
    if (idx < 0) return false;
    this.director?.stepTo(idx);
    return true;
  }

  /** Clear the commentary cache (e.g. on settings change). */
  clearCache() { this._cache.clear(); }

  _decisionIndexForBeat(beat) {
    if (!beat) return -1;
    let seen = 0;
    for (const b of this.beats) {
      if (b.beatKind === 'DECISION' || b.beatKind === 'RESPONSE') {
        if (b.beatId === beat.beatId) return seen;
        seen += 1;
      }
    }
    return -1;
  }
}

export { SUPPORTED_SPEEDS, COMMENTARY_MODE, VIEWER_MODE, CASTER_SCHEMA_VERSION };
