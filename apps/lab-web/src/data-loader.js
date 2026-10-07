// ═══════════════════════════════════════════════════════════════
// data-loader.js — Observatory data bootstrapping and replay loading
// ═══════════════════════════════════════════════════════════════

import { state,   shell,   landingContainer,   data,   text,   parseNdjsonSafe,   computeVariantAnalyticsFromSummaries } from './state.js';
import { route, isPlayRoute, LANDING_MODES, renderNavigation } from './router.js';
import { renderExperimentControls, bindGlobal } from './experiment-controls.js';
import { ensureReplayFrames } from './replay-frames.js';
import { rerender } from './rerender.js';
import { openReplay as openReplayDescriptor } from './replay-resolver.js';
import { classifyIndexRecord, REPLAY_ARTIFACT_CLASS } from './replay-contract.mjs';

// ── Replay loading ────────────────────────────────────────────────
// Replay acquisition flows through the resolver layer (replay-resolver.js):
// a descriptor says WHERE a replay comes from (bundled corpus/autonomy file,
// IndexedDB record, caller-supplied object); resolveReplay() normalizes it
// into a frame-bearing replay for Watch. loadReplay() keeps its existing
// signature for the boot/render path; all new integrations call openReplay().

async function getLocalReplayRecord(replayId) {
  const { getReplay } = await import('./play/persistence.js');
  return getReplay(replayId);
}

/**
 * Join a replay id to its index record and match summary, so the resolver
 * can attach the Watch completeness contract (replay-contract.mjs).
 * Autonomy retained matches live in lab-replay-index; corpus conformance
 * fixtures and retained records live in replay-index; per-match summaries
 * (match-summaries.ndjson) carry winner/termination evidence.
 */
export function replayLookupMeta(id) {
  if (!id) return { indexRecord: null, matchSummary: null };
  const indexRecord = state.index?.records?.find(r => r.fixtureId === id)
    ?? state.autonomyIndex?.records?.find(r => r.fixtureId === id) ?? null;
  const matchSummary = state.observatory?.summaries?.find(s => s.matchId === id) ?? null;
  return { indexRecord, matchSummary };
}

/**
 * Open a replay from any supported source and route it into Watch.
 * @param {object} descriptor - { kind:'corpus'|'autonomy', fixtureId } |
 *   { kind:'local', replayId } | { kind:'object', replay, id?, label? }
 * @param {object} [opts] - { navigate?: boolean } (default true → #/watch)
 * @returns {Promise<object>} resolveReplay result ({status, replay?, ...})
 */
export async function openReplay(descriptor, opts = {}) {
  const navigate = opts.navigate ?? true;
  return openReplayDescriptor(descriptor, {
    state,
    fetchJson: (url) => data(url),
    getLocalReplay: getLocalReplayRecord,
    ensureFrames: ensureReplayFrames,
    availability: state.replayAvailability,
    lookupMeta: replayLookupMeta,
    loadAuthorized: () => loadAuthorized(),
    navigate: navigate ? () => { location.hash = '#/watch'; } : null,
    rerender,
  });
}

export async function loadReplay(fixtureId) {
  // Honor an explicit pending request descriptor (e.g. a local or injected
  // replay); otherwise resolve the fixture from the static index.
  const descriptor = state.replayRequest
    ?? { kind: state.replayKind === 'autonomy' ? 'autonomy' : 'corpus', fixtureId };
  await openReplay(descriptor, { navigate: false });
}

export async function loadAuthorized() {
  if (!state.replay) return;
  try {
    const kind = state.replayKind;
    const url = kind === 'autonomy'
      ? `data/autonomy/lab-replays/authorized/${state.fixtureId}.json`
      : `data/replays/authorized/${state.fixtureId}.json`;
    state.authorized = await data(url, null);
  } catch { state.authorized = null; }
}

/**
 * Refresh the local (IndexedDB) replay index — lightweight summaries used
 * by the Replay Library's local section and by the Watch standby's
 * "latest retained match" action. Safe no-op when IndexedDB is absent.
 */
export async function refreshLocalReplayIndex() {
  try {
    const { listReplays } = await import('./play/persistence.js');
    const records = await listReplays();
    state.localReplays = records.map(r => ({
      replayId: r.replayId,
      completedAt: r.completedAt ?? null,
      profileId: r.profileId ?? null,
      mode: r.mode ?? null,
      winner: r.winner ?? null,
      terminationReason: r.terminationReason ?? null,
      fullTurnSequence: r.fullTurnSequence ?? null,
      decisionCount: r.decisionCount ?? null,
      commandCount: r.certifiedReplay?.commands?.length ?? null,
      certified: Boolean(r.certifiedReplayHash),
      hasBody: Boolean(r.certifiedReplay),
    }));
  } catch {
    state.localReplays = [];
  }
  return state.localReplays;
}

/**
 * Find the most recent replay Watch can prove is a complete match and open
 * it. Candidates: local retained replays first (user/session evidence),
 * then bundled index records that classify as FULL_MATCH with terminal
 * evidence. Returns the opened result, or null when none qualifies.
 */
export async function openLatestRetainedMatch() {
  const locals = Array.isArray(state.localReplays) ? state.localReplays : await refreshLocalReplayIndex();
  const completeLocal = locals
    .filter(r => r.hasBody && (r.winner != null || r.terminationReason != null))
    .sort((a, b) => String(b.completedAt ?? '').localeCompare(String(a.completedAt ?? '')));
  if (completeLocal.length) {
    return openReplay({ kind: 'local', replayId: completeLocal[0].replayId });
  }
  const autonomyBundledIds = new Set(state.replayAvailability?.sources?.autonomy?.bundledFixtureIds ?? []);
  const autonomyFullyBundled = state.replayAvailability?.sources?.autonomy?.status === 'bundled';
  const autonomyCandidates = (state.autonomyIndex?.records ?? [])
    .filter(r => autonomyFullyBundled || autonomyBundledIds.has(r.fixtureId));
  if (autonomyCandidates.length) {
    const candidates = autonomyCandidates
      .map(r => ({ record: r, cls: classifyIndexRecord(r, {
        availability: 'bundled',
        summary: state.observatory?.summaries?.find(s => s.matchId === r.fixtureId) ?? null }) }))
      .filter(c => c.cls.class === REPLAY_ARTIFACT_CLASS.FULL_MATCH);
    if (candidates.length) {
      candidates.sort((a, b) => (b.cls.evidence?.turns ?? 0) - (a.cls.evidence?.turns ?? 0));
      return openReplay({ kind: 'autonomy', fixtureId: candidates[0].record.fixtureId });
    }
  }
  const corpusCandidates = (state.index?.records ?? [])
    .map(r => ({ record: r, cls: classifyIndexRecord(r, {
      availability: recordAvailability(r, 'corpus'),
      summary: state.observatory?.summaries?.find(s => s.matchId === r.fixtureId) ?? null }) }))
    .filter(c => c.cls.class === REPLAY_ARTIFACT_CLASS.FULL_MATCH);
  const openable = corpusCandidates.filter(c => recordAvailability(c.record, 'corpus') !== 'excluded');
  if (openable.length) {
    openable.sort((a, b) => (b.cls.evidence?.turns ?? 0) - (a.cls.evidence?.turns ?? 0));
    return openReplay({ kind: descriptorKindForRecord(openable[0].record, 'corpus'), fixtureId: openable[0].record.fixtureId });
  }
  return null;
}

/**
 * Which resolver kind actually serves a record's body. Retained match
 * artifacts (ADVANCED_CORE_RETAINED, the M-* records) are dual-indexed —
 * they appear in replay-index.json AND lab-replay-index.json — but their
 * bodies only exist under the autonomy artifact directories.
 */
export function descriptorKindForRecord(record, indexKind) {
  return /RETAINED|FULL_MATCH|COMPLETE_MATCH/i.test(String(record?.replayKind ?? ''))
    ? 'autonomy' : indexKind;
}

/** Build-manifest availability for the artifact that would serve a record. */
export function recordAvailability(record, indexKind) {
  const kind = descriptorKindForRecord(record, indexKind);
  const source = state.replayAvailability?.sources?.[kind];
  const id = record?.fixtureId ?? record?.replayId ?? null;
  if (id && Array.isArray(source?.bundledFixtureIds) && source.bundledFixtureIds.includes(id)) return 'bundled';
  return source?.status ?? 'unknown';
}

// ── Trace index/data loading ──────────────────────────────────────
export async function loadTraceIndex() {
  if (state.traceIndex) return state.traceIndex;
  try {
    state.traceIndex = await data('data/autonomy/decision-trace-index.json', null);
  } catch { state.traceIndex = null; }
  return state.traceIndex;
}

export async function loadTraceData(matchId) {
  try {
    return await data(`data/autonomy/decision-traces/${matchId}.traces.json`, null);
  } catch { return null; }
}

// ── Boot sequence ─────────────────────────────────────────────────

// Background observatory boot promise — started by boot() for landing/play
// routes so the data is ready when the user navigates to an observatory route.
// render() awaits this before rendering any observatory workspace.
// Set to null once complete so render() knows the data is ready.
let _observatoryBootPromise = null;

export function getObservatoryBootPromise() { return _observatoryBootPromise; }

export async function boot() {
  const r = route();
  if (isPlayRoute(r)) {
    if (shell) shell.style.display = 'none';
    if (landingContainer) landingContainer.style.display = 'block';
    // Start observatory data loading in the background (non-blocking)
    _observatoryBootPromise = loadObservatoryData();
    return;
  }
  if (LANDING_MODES.has(r)) {
    // Landing/play routes don't need observatory data to render.
    // Start loading it in the background so it's ready if the user
    // navigates to an observatory route, but don't block the landing render.
    _observatoryBootPromise = loadObservatoryData();
    return;
  }
  // Observatory route loaded directly — must load data before rendering
  await loadObservatoryData();
}

async function loadObservatoryData() {
  try {
    await _loadObservatoryDataInner();
  } finally {
    _observatoryBootPromise = null;
  }
}

async function _loadObservatoryDataInner() {
  const summariesText = await text('data/autonomy/match-summaries.ndjson');
  const summaries = parseNdjsonSafe(summariesText);
  [state.index, state.autonomyIndex, state.replayAvailability, state.corpusAnalytics, state.aggregate, state.observatory, state.capabilities, state.rankAuthority] = await Promise.all([
    data('data/replay-index.json'),
    data('data/autonomy/lab-replay-index.json'),
    // Written by scripts/build.mjs — says which replay bodies are bundled.
    // Null (pre-manifest deployments) means "unknown": resolution attempts
    // the fetch and reports an honest error on failure.
    data('data/replay-availability.json', null),
    data('data/corpus-analytics.json'),
    data('data/autonomy/aggregate.json'),
    data('data/observatory/analytics.json', { schemaVersion: '4.0.0', mechanics: [], synergies: [], motifs: [], policies: [], anomalies: [], metricRegistry: {}, summaries }),
    data('data/release/capability-manifest.json'),
    data('data/release/rank-authority.json', null)
  ]);
  state.observatory.summaries ??= summaries;
  state.rankPower = state.observatory.rankPower ?? null;
  state.swapMatrix = state.observatory.swapMatrix ?? null;
  state._extractModule = await import('./browser-analytics.js');
  state._variantModule = state._extractModule;
  // Load pre-computed variant analytics from server-side pipeline (P5.5)
  // Falls back to null if the file doesn't exist (graceful degradation)
  state.variantAnalytics = await data('data/observatory/variant-analytics.json', null);
  if (!state.variantAnalytics) {
    // Fallback: compute from observatory summaries if pre-computed artifact is missing
    state.variantAnalytics = await computeVariantAnalyticsFromSummaries(state.observatory.summaries ?? []);
  }
  state.rankAnatomyRegistry = await data('data/observatory/rank-anatomy-registry.json', null);
  state._rankAnatomyModule = await import('./workspaces/ranks/rank-anatomy-workspace.js');
  state.bootState = { aggregate: structuredClone(state.aggregate), observatory: structuredClone(state.observatory), rankPower: structuredClone(state.rankPower), swapMatrix: structuredClone(state.swapMatrix), variantAnalytics: structuredClone(state.variantAnalytics) };
  // Initialize the experiment evidence store: loads persisted runs + the
  // active analysis set, and rebuilds state.observatory from the included
  // runs when a saved selection exists. Without this, campaigns are never
  // recorded and exported dossiers cannot report experiment scope.
  try {
    const { initExperiments, applySelection, experimentsReady } = await import('./experiments/experiment-controller.mjs');
    const { hasActiveSelection } = await initExperiments({ bootSummaries: state.observatory?.summaries ?? [], bootAggregate: state.aggregate });
    if (experimentsReady() && hasActiveSelection) await applySelection();
  } catch (err) {
    console.warn('[experiments] evidence store init failed — experiment runs disabled this session:', err);
  }
  // Local (IndexedDB) replay index — feeds the Replay Library's retained
  // section and the Watch standby "latest full match" action. Failure is
  // non-fatal: the library simply shows no local section.
  await refreshLocalReplayIndex();
  // FULL-MATCH WATCH CONTRACT: no automatic fixture selection. Every bundled
  // corpus body is a certification fixture (CT-*), never a complete match —
  // auto-loading one presented a truncated scenario as if it were a game.
  // Watch opens on an honest standby instead; explicit selection comes from
  // the Replay Library, History, Traces, or the standby actions.
  renderNavigation();
  renderExperimentControls();
  bindGlobal();
  const r = route();
  if (!LANDING_MODES.has(r) && !isPlayRoute(r) && state.fixtureId) await loadReplay(state.fixtureId);
}
