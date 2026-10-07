// ═══════════════════════════════════════════════════════════════
// replay-resolver.js — Replay acquisition and normalization layer
//
// Watch is a general replay viewer. Match/result sources produce a
// replay descriptor; resolveReplay() turns it into a normalized,
// frame-bearing replay object; openReplay() applies it to shared
// observatory state and (optionally) navigates to Watch.
//
//   match/result source → descriptor → resolveReplay → openReplay → Watch
//
// Descriptor kinds:
//   { kind:'corpus',   fixtureId }            — bundled certified replay JSON
//   { kind:'autonomy', fixtureId }            — Lab campaign replay JSON
//                                               (excluded from normal builds)
//   { kind:'local',    replayId }             — IndexedDB replay record
//   { kind:'object',   replay, id?, label? }  — caller-supplied replay object
//                                               (arena/evolution/network/session)
//
// This module is deliberately free of DOM and app-state imports so it can
// be exercised directly in Node tests with injected dependencies.
// ═══════════════════════════════════════════════════════════════

import { ensureReplayFrames } from './replay-frames.js?v=943d1ec6c237';
import { classifyReplayBody, classifyIndexRecord, artifactHeadline, REPLAY_ARTIFACT_CLASS } from './replay-contract.mjs?v=943d1ec6c237';
export { REPLAY_ARTIFACT_CLASS };

export const REPLAY_STATUS = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  UNAVAILABLE: 'unavailable',
  ERROR: 'error',
});

export const REPLAY_FAILURE = Object.freeze({
  NO_DESCRIPTOR: 'NO_DESCRIPTOR',
  EXCLUDED_FROM_BUILD: 'EXCLUDED_FROM_BUILD',
  FETCH_FAILED: 'FETCH_FAILED',
  NORMALIZE_FAILED: 'NORMALIZE_FAILED',
  NOT_FOUND: 'NOT_FOUND',
});

// Static (bundled-file) kinds. Everything else is resolved at runtime.
export const STATIC_REPLAY_KINDS = new Set(['corpus', 'autonomy']);

/** Stable identity for a descriptor — used to deduplicate load attempts. */
export function replayDescriptorKey(descriptor) {
  if (!descriptor || typeof descriptor !== 'object') return null;
  if (descriptor.kind === 'corpus' || descriptor.kind === 'autonomy') {
    return descriptor.fixtureId ? `${descriptor.kind}:${descriptor.fixtureId}` : null;
  }
  if (descriptor.kind === 'local') return descriptor.replayId ? `local:${descriptor.replayId}` : null;
  if (descriptor.kind === 'object') {
    const id = descriptor.id ?? descriptor.replay?.fixtureId ?? descriptor.replay?.matchId ?? 'session';
    return `object:${id}`;
  }
  return null;
}

/** Best identifier a descriptor exposes for labelling/cross-links. */
export function replayDescriptorId(descriptor) {
  if (!descriptor || typeof descriptor !== 'object') return null;
  return descriptor.fixtureId ?? descriptor.replayId ?? descriptor.id
    ?? descriptor.replay?.fixtureId ?? descriptor.replay?.matchId ?? null;
}

/**
 * Availability of a replay source kind on this deployment.
 * `manifest` is the parsed data/replay-availability.json written by
 * scripts/build.mjs ({ sources: { <kind>: { status, bundledFixtureIds } } }).
 * `bundledFixtureIds` is the representative retained-match allowlist — those
 * bodies ship even when the source's bulk status is 'excluded'. A missing
 * manifest returns 'unknown' — resolution then attempts a fetch and reports
 * an honest error if the body is absent. Runtime kinds (local/object) are
 * always 'runtime'.
 */
export function replayAvailability(kind, manifest, id = null) {
  if (kind === 'local' || kind === 'object') return 'runtime';
  const source = manifest?.sources?.[kind];
  if (id && Array.isArray(source?.bundledFixtureIds) && source.bundledFixtureIds.includes(id)) {
    return 'bundled';
  }
  const status = source?.status;
  return status === 'bundled' || status === 'excluded' ? status : 'unknown';
}

/** Static URL for corpus/autonomy descriptors; null for runtime kinds. */
export function staticReplayUrl(descriptor) {
  if (descriptor?.kind === 'corpus') {
    return `data/certified-replays/${descriptor.fixtureId}.certified.replay.json`;
  }
  if (descriptor?.kind === 'autonomy') {
    // The retained frame-embedded artifact — its public frames are real
    // recorded public views. The certified public envelope
    // (autonomy/replays/public/*.public.replay.json) carries a privacy-
    // redacted initialState, so command re-execution against it diverges;
    // it is certification evidence, not a Watchable body.
    return `data/autonomy/lab-replays/public/${descriptor.fixtureId}.json`;
  }
  return null;
}

async function defaultFetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const ct = response.headers.get('content-type') || '';
  if (ct.includes('text/html')) throw new Error(`HTML response (not JSON) for ${url}`);
  return response.json();
}

function fail(status, code, message, meta) {
  return { status, code, message, meta };
}

/**
 * Resolve a replay descriptor into a normalized replay object whose
 * `frames` array is populated.
 *
 * @param {object} descriptor - Replay source descriptor (see header).
 * @param {object} [deps]
 * @param {function} [deps.fetchJson] - (url) => Promise<json>
 * @param {function} [deps.getLocalReplay] - (replayId) => Promise<record|null>
 * @param {function} [deps.ensureFrames] - (replay) => Promise<replay>
 * @param {object} [deps.availability] - replay-availability manifest
 * @returns {Promise<{status:'ready', replay:object, meta:object}
 *   | {status:'unavailable'|'error', code:string, message:string, meta:object}>}
 */
export async function resolveReplay(descriptor, deps = {}) {
  const fetchJson = deps.fetchJson ?? defaultFetchJson;
  const ensureFrames = deps.ensureFrames ?? ensureReplayFrames;
  const meta = {
    kind: descriptor?.kind ?? null,
    id: replayDescriptorId(descriptor),
    label: descriptor?.label ?? null,
  };
  // Optional metadata join: (id) => { indexRecord, matchSummary } — lets the
  // resolver attach the Watch completeness contract without importing state.
  const lookupMeta = (id) => deps.lookupMeta?.(id) ?? { indexRecord: null, matchSummary: null };
  const availabilityOf = (kind, id) => replayAvailability(kind, deps.availability, id);
  const classify = (replay, availability) => {
    const { indexRecord, matchSummary } = lookupMeta(meta.id);
    const classification = classifyReplayBody(replay, {
      kind: meta.kind, indexRecord, matchSummary, availability });
    if (replay) replay._contract = classification;
    return classification;
  };
  const classifyRecord = (availability) => {
    const { indexRecord, matchSummary } = lookupMeta(meta.id);
    return classifyIndexRecord(indexRecord ?? { fixtureId: meta.id }, { availability, summary: matchSummary });
  };
  const normalizeFailure = (replay, fallback) => {
    const reason = replay?._frameAnalysis?.reason;
    const diverged = replay?._frameIntegrity === 'diverged';
    return diverged
      ? 'The recorded command stream does not reproduce the recorded final state — playback refused rather than fabricated.'
      : (reason ? `${fallback} (${reason})` : fallback);
  };
  if (!descriptor || typeof descriptor !== 'object' || !descriptor.kind) {
    return fail(REPLAY_STATUS.ERROR, REPLAY_FAILURE.NO_DESCRIPTOR,
      'No replay source was selected.', meta);
  }
  try {
    if (descriptor.kind === 'object') {
      if (!descriptor.replay || typeof descriptor.replay !== 'object') {
        return fail(REPLAY_STATUS.ERROR, REPLAY_FAILURE.NO_DESCRIPTOR,
          'This result does not contain a replay artifact.', meta);
      }
      const replay = structuredClone(descriptor.replay);
      await ensureFrames(replay);
      if (!Array.isArray(replay.frames) || replay.frames.length === 0) {
        return fail(REPLAY_STATUS.ERROR, REPLAY_FAILURE.NORMALIZE_FAILED,
          normalizeFailure(replay, 'This result does not contain enough information for frame-by-frame playback.'),
          { ...meta, classification: classify(replay, 'runtime') });
      }
      return { status: REPLAY_STATUS.READY, replay, meta: { ...meta, classification: classify(replay, 'runtime') } };
    }
    if (descriptor.kind === 'local') {
      const record = deps.getLocalReplay ? await deps.getLocalReplay(descriptor.replayId) : null;
      const raw = record?.certifiedReplay;
      if (!raw) {
        return fail(REPLAY_STATUS.ERROR, REPLAY_FAILURE.NOT_FOUND,
          'The saved replay record was not found in local storage.', meta);
      }
      const replay = structuredClone(raw);
      await ensureFrames(replay);
      if (!meta.id) meta.id = record.sessionId ?? descriptor.replayId;
      if (!Array.isArray(replay.frames) || replay.frames.length === 0) {
        return fail(REPLAY_STATUS.ERROR, REPLAY_FAILURE.NORMALIZE_FAILED,
          normalizeFailure(replay, 'The saved replay could not be reconstructed for playback.'),
          { ...meta, classification: classify(replay, 'runtime') });
      }
      return { status: REPLAY_STATUS.READY, replay, meta: { ...meta, classification: classify(replay, 'runtime') } };
    }
    if (descriptor.kind === 'corpus' || descriptor.kind === 'autonomy') {
      if (!descriptor.fixtureId) {
        return fail(REPLAY_STATUS.ERROR, REPLAY_FAILURE.NO_DESCRIPTOR,
          'No replay was selected.', meta);
      }
      const availability = availabilityOf(descriptor.kind, descriptor.fixtureId);
      if (availability === 'excluded') {
        return fail(REPLAY_STATUS.UNAVAILABLE, REPLAY_FAILURE.EXCLUDED_FROM_BUILD,
          'Replay metadata exists, but the full replay was not included in this build.',
          { ...meta, classification: classifyRecord(availability) });
      }
      const url = staticReplayUrl(descriptor);
      let replay;
      try {
        replay = await fetchJson(url);
      } catch {
        return fail(REPLAY_STATUS.ERROR, REPLAY_FAILURE.FETCH_FAILED,
          'The replay artifact could not be loaded from this deployment.',
          { ...meta, classification: classifyRecord(availability) });
      }
      await ensureFrames(replay);
      if (!Array.isArray(replay?.frames) || replay.frames.length === 0) {
        return fail(REPLAY_STATUS.ERROR, REPLAY_FAILURE.NORMALIZE_FAILED,
          normalizeFailure(replay, 'The replay artifact is malformed or cannot be reconstructed.'),
          { ...meta, classification: classify(replay, availability) });
      }
      return { status: REPLAY_STATUS.READY, replay, meta: { ...meta, classification: classify(replay, availability) } };
    }
    return fail(REPLAY_STATUS.ERROR, REPLAY_FAILURE.NO_DESCRIPTOR,
      'Unsupported replay source.', meta);
  } catch (error) {
    return fail(REPLAY_STATUS.ERROR, REPLAY_FAILURE.NORMALIZE_FAILED,
      `Replay normalization failed: ${error?.message ?? error}`, meta);
  }
}

/**
 * Resolve a replay descriptor and apply the outcome to shared state.
 * Sets replayStatus/replayError/replaySource honestly; a failed load marks
 * only that descriptor's key as attempted, so selecting another replay
 * (or re-selecting the same one) is never blocked by an earlier failure.
 *
 * @param {object} descriptor - Replay source descriptor.
 * @param {object} ctx
 * @param {object} ctx.state - Shared observatory state object.
 * @param {function} [ctx.navigate] - Called to route to Watch (default no-op).
 * @param {function} [ctx.rerender] - Called after the outcome is applied.
 * @param {function} [ctx.loadAuthorized] - Called after a ready static replay
 *   when a non-public visibility is active.
 * @param {...*} ctx - Remaining deps are passed to resolveReplay.
 * @returns {Promise<object>} The resolveReplay result.
 */
export async function openReplay(descriptor, ctx = {}) {
  const { state } = ctx;
  if (!state) throw new Error('openReplay requires ctx.state');
  const key = replayDescriptorKey(descriptor);
  const id = replayDescriptorId(descriptor);
  state.replayRequest = descriptor;
  state._replayLoadedFor = key;
  state.replayStatus = REPLAY_STATUS.LOADING;
  state.replayError = null;
  state.replaySource = { kind: descriptor?.kind ?? null, id, label: descriptor?.label ?? null };
  state.replayContract = null;
  state.replay = null;
  state.authorized = null;
  state.frame = 0;
  state.playing = false;
  if (id) state.fixtureId = id;
  if (descriptor?.kind === 'corpus' || descriptor?.kind === 'autonomy') {
    state.replayKind = descriptor.kind;
  } else {
    // Runtime sources (local/object) have no authorized overlay — reset to
    // the public view so a stale viewer mode can't conceal information.
    state.visibility = 'public';
  }
  ctx.navigate?.();
  const result = await resolveReplay(descriptor, ctx);
  // A newer request may have superseded this one while resolving — never
  // let a stale resolution clobber current state.
  if (state.replayRequest !== descriptor || state._replayLoadedFor !== key) return result;
  if (result.status === REPLAY_STATUS.READY) {
    state.replay = result.replay;
    state.replayContract = result.meta?.classification ?? null;
    state.replayStatus = REPLAY_STATUS.READY;
    if (state.visibility !== 'public' && STATIC_REPLAY_KINDS.has(descriptor.kind)) {
      await ctx.loadAuthorized?.(descriptor, result.replay);
    }
  } else {
    state.replayStatus = result.status;
    state.replayContract = result.meta?.classification ?? null;
    state.replayError = { code: result.code, message: result.message };
  }
  ctx.rerender?.();
  return result;
}

/**
 * Classify the Watch standby state for honest empty/error UX.
 * @param {object} state - Shared observatory state.
 * @returns {{variant:'loading'|'unavailable'|'error'|'idle', headline:string, detail:string}}
 */
export function describeWatchStandby(state) {
  const cls = state?.replayContract;
  const artifactLine = cls && cls.class && cls.class !== REPLAY_ARTIFACT_CLASS.UNKNOWN
    ? artifactHeadline(cls) : null;
  if (state?.replayStatus === REPLAY_STATUS.LOADING) {
    return { variant: 'loading', headline: 'Loading replay…',
      detail: 'Resolving the replay source and reconstructing frames.' };
  }
  if (state?.replayStatus === REPLAY_STATUS.UNAVAILABLE) {
    return { variant: 'unavailable', headline: 'Replay metadata available',
      detail: artifactLine ? `${artifactLine} — body not in this build`
        : (state?.replayError?.message ?? 'The full replay was not included in this build.') };
  }
  if (state?.replayStatus === REPLAY_STATUS.ERROR) {
    return { variant: 'error', headline: 'Replay unavailable',
      detail: artifactLine ? `${artifactLine} — ${state?.replayError?.message ?? 'not playable'}`
        : (state?.replayError?.message ?? 'This result does not contain enough information for frame-by-frame playback.') };
  }
  return { variant: 'idle', headline: 'No replay loaded.',
    detail: 'No replay selected — choose a replay from the Replay Library to inspect canonical state, decision flow, and causal evidence.' };
}
