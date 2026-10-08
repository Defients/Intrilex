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
    this._viewerMode = viewerMode === VIEWER_MODE.OMNISCIENT ? viewerMode : VIEWER_MODE.PUBLIC;
    this._settings = settings || {};
    this._cache = new Map();
    this._commentaryRevision = 0;
    this._commentaryHistory = []; // { commentaryId, beatId, decisionId, checkpointHash, mode, text, sourceFacts, generatedBy }
    // Prepared commentary index: beatId →
    //   { status:'ready', record, commentaryId, cacheKey }
    //   { status:'skipped' } — beat deliberately has no commentary
    //   { status:'failed', error } — preparation stopped here
    // Populated by prepareCommentary() (and mirrored by live
    // generation so playback can always resolve synchronously).
    this._prepared = new Map();
    this._preparedComplete = false;
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
    // Cumulative viewer-visible event stream (Game Log evidence).
    // _eventEndByBeat[i] = count of events in frames[0..maxFrame(i)].
    this._eventStream = [];
    this._eventEndByBeat = [];
    // True when the loaded replay actually carries hand card identities
    // (local matches + authorized envelopes). False for privacy-redacted
    // artifacts — the UI must never fabricate identities for them.
    this._handsAuthorized = false;
  }

  get mode() { return this._mode; }
  get viewerMode() { return this._viewerMode; }
  get commentaryHistory() { return this._commentaryHistory; }
  get waitWhatCaptures() { return this._waitWhatCaptures; }
  get telemetry() { return this._telemetry; }
  /** Name of the provider that would generate commentary right now. */
  get providerName() { return this._provider?.name ?? 'deterministic'; }
  /** Configured commentary model (provenance label; null when unset). */
  get providerModel() { return this._settings?.model ?? null; }
  /** True once prepareCommentary() finished a complete pass. */
  get commentaryPrepared() { return this._preparedComplete; }
  /** True when frame evidence carries real hand card identities. */
  get handsAuthorized() { return this._handsAuthorized; }
  /** Total viewer-visible events in the cumulative Game Log stream. */
  get eventCount() { return this._eventStream.length; }

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
    this.cancelCommentary();
    // Authorization is established BEFORE any viewer-scoped derived state
    // (beats, cumulative event index, diagnostics, commentary inputs) is
    // built. A redacted or hand-less replay fails closed to PUBLIC even if
    // the caller requested OMNISCIENT — the request is never the grant.
    this._handsAuthorized = detectHandAuthorization(frames);
    this._viewerMode = this._viewerMode === VIEWER_MODE.OMNISCIENT && this._handsAuthorized
      ? VIEWER_MODE.OMNISCIENT : VIEWER_MODE.PUBLIC;
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
    this._prepared.clear();
    this._preparedComplete = false;
    this._waitWhatCaptures.length = 0;
    this._telemetry = { beatsViewed: 0, commentaryGenerated: 0, cacheHits: 0, cacheMisses: 0, failedGenerations: 0, waitWhatCaptures: 0 };

    // Build the cumulative event index (Game Log) under the RESOLVED
    // viewer mode — never the caller's requested mode.
    this._buildEventIndex();

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
    this.clearCache();
    this._commentaryHistory.length = 0;
  }

  setViewerMode(viewerMode) {
    // Fail closed: OMNISCIENT is granted only when the loaded replay's hand
    // authorization was positively established at load time. A requested
    // upgrade on a redacted artifact resolves to PUBLIC — never a grant.
    const next = viewerMode === VIEWER_MODE.OMNISCIENT && this._handsAuthorized
      ? VIEWER_MODE.OMNISCIENT : VIEWER_MODE.PUBLIC;
    if (next === this._viewerMode) return;
    this._viewerMode = next;
    // Viewer mode change invalidates cache (different projection).
    this.clearCache();
    // Captures and commentary can contain omniscient context. Never carry
    // that context into a subsequent public-view investigation or prompt.
    this._commentaryHistory.length = 0;
    this._waitWhatCaptures.length = 0;
    // Derived viewer-scoped state must be rebuilt — a downgrade cannot
    // leave omniscient-projected beats or the authorized event stream
    // reachable after the switch.
    if (this.matchResult && this.frames) {
      const position = this.director?.index ?? 0;
      const speed = this.director?.speed ?? 1;
      const wasPlaying = this.director?.playing === true;
      const built = buildBeats(this.matchResult, this.frames, { viewerMode: this._viewerMode });
      this.beats = built.beats;
      this.threads = buildThreadRegistry(this.beats);
      this.diagnostics = runDiagnostics(this.matchResult, this.beats, this.frames);
      this.director = new PlaybackDirector({ beats: this.beats });
      try { this.director.setSpeed(speed); } catch { /* keep default speed */ }
      this.director.stepTo(Math.min(position, Math.max(0, this.beats.length - 1)));
      if (wasPlaying) this.director.play();
      this._buildEventIndex();
    }
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
    const revision = ++this._commentaryRevision;
    if (!this.director) return { ok: false, record: null, commentaryId: null, cached: false, error: 'NO_SESSION' };
    const beat = this.director.currentBeat();
    if (!beat) return { ok: false, record: null, commentaryId: null, cached: false, error: 'NO_BEAT' };
    const isCurrent = () => revision === this._commentaryRevision && this.currentBeat === beat;
    const stale = () => ({ ok: false, record: null, commentaryId: null, cached: false, error: 'STALE_COMMENTARY', stale: true });
    this._telemetry.beatsViewed += 1;

    // The planner only consults frame state under OMNISCIENT viewer
    // mode (authorized hand identities); in PUBLIC mode it is ignored.
    const input = this._commentaryInputAt(this.director.index);

    if (!input.eligible) {
      this._prepared.set(beat.beatId, { status: 'skipped' });
      return { ok: true, record: null, commentaryId: null, cached: false, error: null, skipped: true };
    }

    // Cache lookup.
    if (this._cache.has(input.cacheKey)) {
      this._telemetry.cacheHits += 1;
      const cached = this._cache.get(input.cacheKey);
      this._prepared.set(beat.beatId, { status: 'ready', record: cached.record, commentaryId: cached.commentaryId, cacheKey: input.cacheKey, generatedBy: { provider: this.providerName, model: this._settings.model || null } });
      return { ok: true, record: cached.record, commentaryId: cached.commentaryId, cached: true, error: null };
    }
    this._telemetry.cacheMisses += 1;

    let result;
    try {
      result = await this._provider.generateCommentary(input, {
        onToken: typeof onToken === 'function' ? chunk => { if (isCurrent()) onToken(chunk); } : undefined
      });
    } catch (error) {
      if (!isCurrent()) return stale();
      this._telemetry.failedGenerations += 1;
      this._prepared.set(beat.beatId, { status: 'failed', error: { code: error?.category ?? 'COMMENTARY_FAILED', message: error?.message ?? String(error) } });
      return { ok: false, record: null, commentaryId: null, cached: false, error: error?.message || 'COMMENTARY_FAILED' };
    }
    if (!isCurrent()) return stale();
    if (!result.ok || !result.record) {
      this._telemetry.failedGenerations += 1;
      this._prepared.set(beat.beatId, { status: 'failed', error: { code: result.error ?? 'GENERATION_FAILED', message: result.error ?? 'GENERATION_FAILED' } });
      return { ok: false, record: result.record, commentaryId: null, cached: false, error: result.error };
    }

    this._telemetry.commentaryGenerated += 1;
    const commentaryId = `CM-${hashCanonical({ beatId: beat.beatId, cacheKey: input.cacheKey }).slice(0, 16)}`;
    this._recordCommentaryHistory(beat, result.record, commentaryId);
    this._cache.set(input.cacheKey, { record: result.record, commentaryId });
    this._prepared.set(beat.beatId, { status: 'ready', record: result.record, commentaryId, cacheKey: input.cacheKey, generatedBy: { provider: this.providerName, model: this._settings.model || null } });
    return { ok: true, record: result.record, commentaryId, cached: false, error: null };
  }

  /**
   * Synchronous lookup of prepared commentary for a beat. Returns
   *   { status:'ready', record, commentaryId, cacheKey }
   *   { status:'skipped' }
   *   { status:'failed', error }
   * or null when the beat was never prepared (pre-prep session or a
   * provider/mode change that invalidated the prepared set).
   * Presentation only — never mutates match, replay, or hashes.
   */
  preparedFor(beatIndex) {
    const beat = this.beats[beatIndex];
    if (!beat) return null;
    return this._prepared.get(beat.beatId) ?? null;
  }

  /**
   * Pre-generate commentary for every beat before playback begins.
   *
   * This is the broadcast-preparation path: it iterates the beat
   * sequence WITHOUT moving the playback director, asks the planner
   * which beats are commentary-worthy, reuses the session cache, and
   * records per-beat results in the prepared index so playback can
   * resolve commentary synchronously.
   *
   * Commentary never touches engine state, replay identity, or hashes —
   * it only reads completed-match evidence and writes session-scoped
   * presentation records.
   *
   * @param {object} [opts]
   * @param {AbortSignal} [opts.signal] - cancellation; aborting returns
   *   { ok:false, cancelled:true } and leaves completed entries usable.
   * @param {function} [opts.onProgress] - called after each beat with
   *   { completed, total, generated, cached, skipped, beatId }
   * @returns {Promise<{
   *   ok:boolean, cancelled?:boolean, completed:number, total:number,
   *   generated:number, cached:number, skipped:number,
   *   error?:{code:string, message:string, provider:string, model:string|null, beatId:string}
   * }>}
   */
  async prepareCommentary({ signal, onProgress } = {}) {
    const fail = (extra) => ({ ok: false, cancelled: false, completed: 0, total: this.beats.length, generated: 0, cached: 0, skipped: 0, ...extra });
    if (!this.director || !this.beats.length) return fail({ error: { code: 'NO_SESSION', message: 'No match loaded', provider: this.providerName, model: this._settings.model ?? null, beatId: null } });

    const revision = ++this._commentaryRevision;
    const isActive = () => !signal?.aborted && revision === this._commentaryRevision;
    const beats = this.beats;
    const total = beats.length;
    let generated = 0;
    let cached = 0;
    let skipped = 0;
    const summary = () => ({ completed: generated + cached + skipped, total, generated, cached, skipped });
    const progress = (beatId) => { try { onProgress?.({ ...summary(), beatId }); } catch { /* UI callback must never break preparation */ } };

    // A preparation pass owns the commentary narrative: rebuilt history
    // in canonical beat order so prior-commentary context is honest.
    this._prepared.clear();
    this._preparedComplete = false;
    this._commentaryHistory.length = 0;

    for (let i = 0; i < total; i += 1) {
      if (!isActive()) return { ok: false, cancelled: true, ...summary() };
      const beat = beats[i];
      const input = this._commentaryInputAt(i);
      if (!input.eligible) {
        this._prepared.set(beat.beatId, { status: 'skipped' });
        skipped += 1;
        progress(beat.beatId);
        continue;
      }

      const hit = this._cache.get(input.cacheKey);
      if (hit) {
        this._telemetry.cacheHits += 1;
        this._prepared.set(beat.beatId, { status: 'ready', record: hit.record, commentaryId: hit.commentaryId, cacheKey: input.cacheKey, generatedBy: { provider: this.providerName, model: this._settings.model || null } });
        this._recordCommentaryHistory(beat, hit.record, hit.commentaryId);
        cached += 1;
        progress(beat.beatId);
        continue;
      }
      this._telemetry.cacheMisses += 1;

      let result;
      try {
        result = await this._provider.generateCommentary(input, { signal });
      } catch (error) {
        if (!isActive()) return { ok: false, cancelled: true, ...summary() };
        this._telemetry.failedGenerations += 1;
        const failure = { code: error?.category ?? 'COMMENTARY_FAILED', message: error?.message ?? String(error), provider: this.providerName, model: this._settings.model ?? null, beatId: beat.beatId };
        this._prepared.set(beat.beatId, { status: 'failed', error: failure });
        return { ok: false, cancelled: false, ...summary(), error: failure };
      }
      if (!isActive()) return { ok: false, cancelled: true, ...summary() };
      if (!result?.ok || !result.record) {
        this._telemetry.failedGenerations += 1;
        const code = result?.error ?? 'GENERATION_FAILED';
        if (code === 'CANCELLED') return { ok: false, cancelled: true, ...summary() };
        const failure = { code, message: providerErrorMessage(code), provider: this.providerName, model: this._settings.model ?? null, beatId: beat.beatId };
        this._prepared.set(beat.beatId, { status: 'failed', error: failure });
        return { ok: false, cancelled: false, ...summary(), error: failure };
      }

      this._telemetry.commentaryGenerated += 1;
      const commentaryId = `CM-${hashCanonical({ beatId: beat.beatId, cacheKey: input.cacheKey }).slice(0, 16)}`;
      this._cache.set(input.cacheKey, { record: result.record, commentaryId });
      this._recordCommentaryHistory(beat, result.record, commentaryId);
      this._prepared.set(beat.beatId, { status: 'ready', record: result.record, commentaryId, cacheKey: input.cacheKey, generatedBy: { provider: this.providerName, model: this._settings.model || null } });
      generated += 1;
      progress(beat.beatId);
    }

    this._preparedComplete = true;
    return { ok: true, ...summary() };
  }

  /**
   * Swap the commentary provider. Provenance changes, so the prepared
   * set, cache, and history are invalidated — a subsequent
   * prepareCommentary() pass produces a coherent single-source set.
   */
  setProvider(provider) {
    if (!provider) return;
    this._provider = provider;
    this.clearCache();
    this._commentaryHistory.length = 0;
  }

  /**
   * Cumulative viewer-visible event stream through a beat index —
   * the Game Log evidence. Events are derived once from replay frames
   * in loadCompletedMatch(), ordered chronologically, deduplicated by
   * event id, and filtered to visibility the viewer is authorized for
   * ('public' always; 'authorized' under OMNISCIENT viewer mode).
   * Returns a stable slice — callers must not mutate it.
   */
  eventsThroughBeat(beatIndex) {
    if (!Number.isInteger(beatIndex)) return [];
    const end = this._eventEndByBeat[beatIndex];
    return this._eventStream.slice(0, Number.isInteger(end) ? end : 0);
  }

  /** Build the commentary planner input for a beat index (no side effects). */
  _commentaryInputAt(beatIndex) {
    const beat = this.beats[beatIndex];
    const currentFrame = this.frames?.[beat?.frameIndex];
    const currentFrameState = this._viewerMode === VIEWER_MODE.OMNISCIENT
      ? (currentFrame?.state ?? currentFrame?.omniscientState ?? null)
      : null;
    return buildCommentaryInput({
      beats: this.beats,
      beatIndex,
      mode: this._mode,
      viewerMode: this._viewerMode,
      threads: this.threads,
      diagnostics: this.diagnostics,
      commentaryHistory: this._commentaryHistory,
      matchMeta: {
        matchId: this.matchId,
        policyIds: this.policyIds,
        seatOrder: this.matchResult?.summary?.seatOrder ?? null,
        engineVersion: this.engineVersion,
        rulesVersion: this.rulesVersion,
        profileId: this.profileId,
        winner: this.matchResult?.summary?.winner,
        terminationReason: this.matchResult?.summary?.terminationReason
      },
      settings: this._settings,
      currentFrameState
    });
  }

  /** Append a history entry, replacing any prior entry for the same beat. */
  _recordCommentaryHistory(beat, record, commentaryId) {
    const entry = {
      commentaryId,
      beatId: beat.beatId,
      decisionId: beat.decisionId,
      checkpointHash: beat.checkpointHashAfter ?? beat.checkpointHashBefore,
      mode: this._mode,
      viewerMode: this._viewerMode,
      text: record.commentary,
      sourceFacts: [beat.beatId, beat.action?.family].filter(Boolean),
      generatedBy: { provider: this._provider.name, model: this._settings.model || null, promptVersion: COMMENTARY_PROMPT_VERSION }
    };
    const existing = this._commentaryHistory.findIndex(h => h.beatId === beat.beatId);
    if (existing >= 0) this._commentaryHistory.splice(existing, 1);
    this._commentaryHistory.push(entry);
  }

  /**
   * Build the cumulative event index. One pass over the frame stream —
   * O(frames + beats) — so the Game Log never rescans the replay per
   * render. Events lacking ids get stable frame-local ids; duplicate
   * event ids (shared frames across beats) collapse to one entry.
   */
  _buildEventIndex() {
    const includeAuthorized = this._viewerMode === VIEWER_MODE.OMNISCIENT;
    const stream = [];
    const endByFrame = [];
    const seen = new Set();
    const frames = this.frames ?? [];
    for (let f = 0; f < frames.length; f += 1) {
      const events = frames[f]?.events;
      if (Array.isArray(events)) {
        let localSeq = 0;
        for (const e of events) {
          if (!e) continue;
          const visibility = e.visibility ?? 'public';
          if (visibility !== 'public' && !(includeAuthorized && visibility === 'authorized')) continue;
          localSeq += 1;
          const id = e.id ?? `frame-${f}-event-${localSeq}`;
          if (seen.has(id)) continue;
          seen.add(id);
          stream.push({
            id,
            type: e.type ?? 'EVENT',
            controllerId: e.controllerId ?? e.payload?.controllerId ?? e.payload?.playerId ?? e.payload?.actorId ?? null,
            payload: e.payload ?? null
          });
        }
      }
      endByFrame[f] = stream.length;
    }
    this._eventStream = stream;
    this._eventEndByBeat = [];
    let maxFrame = -1;
    for (let i = 0; i < this.beats.length; i += 1) {
      const fi = this.beats[i]?.frameIndex;
      if (Number.isInteger(fi)) maxFrame = Math.max(maxFrame, fi);
      this._eventEndByBeat[i] = maxFrame >= 0 ? (endByFrame[maxFrame] ?? stream.length) : 0;
    }
  }

  /**
   * Capture a WAIT WHAT investigation envelope at the current position.
   * @returns {object} validated WaitWhatCapture
   */
  waitWhat() {
    if (!this.director) return null;
    this._telemetry.waitWhatCaptures += 1;
    const beat = this.director.currentBeat();
    const decisionIndex = this._decisionIndexForBeat(beat);
    // Browser matches lack decisionTraces but carry the canonical
    // decision transcript — it supplies the same actor/action evidence.
    const trace = this.matchResult?.decisionTraces?.[decisionIndex]
      ?? this.matchResult?.decisions?.[decisionIndex]
      ?? null;
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
  clearCache() {
    this.cancelCommentary();
    this._cache.clear();
    // Prepared entries resolved through cache keys are no longer valid.
    this._prepared.clear();
    this._preparedComplete = false;
  }

  /** Invalidate pending output without discarding completed replay evidence. */
  cancelCommentary() { this._commentaryRevision += 1; }

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

/**
 * True when the reconstructed frames carry real hand card identities —
 * i.e. the viewer is authorized for face-up hands. Privacy-redacted
 * artifacts mark cards 'HIDDEN'/'OPAQUE-HIDDEN'; those must never be
 * presented face-up. Fails closed: no hand evidence → not authorized.
 */
function detectHandAuthorization(frames) {
  if (!Array.isArray(frames)) return false;
  let seen = 0;
  const scanLimit = Math.min(frames.length, 50);
  for (let f = 0; f < scanLimit; f += 1) {
    const state = frames[f]?.state ?? frames[f]?.omniscientState;
    const players = state?.players;
    const cards = state?.cards ?? {};
    if (!players || typeof players !== 'object') continue;
    for (const playerId of Object.keys(players)) {
      for (const cardId of players[playerId]?.hand ?? []) {
        seen += 1;
        const identity = cards[cardId]?.identity;
        if (identity == null || identity === 'HIDDEN' || String(cardId).startsWith('OPAQUE-HIDDEN')) return false;
      }
    }
  }
  return seen > 0;
}

/** Human-readable provider failure for honest UI reporting. */
function providerErrorMessage(code) {
  switch (code) {
    case 'UNREACHABLE': return 'Commentary provider is unreachable.';
    case 'TIMEOUT': return 'Commentary request timed out.';
    case 'MODEL_NOT_FOUND': return 'The configured model is not available on the server.';
    case 'HTTP_ERROR': return 'Commentary provider returned an HTTP error.';
    case 'MALFORMED_RESPONSE': return 'Commentary provider returned malformed output.';
    case 'NO_BEAT': return 'No beat available for commentary.';
    default: return `Commentary generation failed (${code}).`;
  }
}

export { SUPPORTED_SPEEDS, COMMENTARY_MODE, VIEWER_MODE, CASTER_SCHEMA_VERSION };
