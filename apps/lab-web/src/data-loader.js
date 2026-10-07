// ═══════════════════════════════════════════════════════════════
// data-loader.js — Observatory data bootstrapping and replay loading
// ═══════════════════════════════════════════════════════════════

import { state,   shell,   landingContainer,   data,   text,   parseNdjsonSafe,   computeVariantAnalyticsFromSummaries } from './state.js';
import { route, isPlayRoute, LANDING_MODES, renderNavigation } from './router.js';
import { renderExperimentControls, bindGlobal } from './experiment-controls.js';
import { ensureReplayFrames } from './replay-frames.js';
import { rerender } from './rerender.js';
import { openReplay as openReplayDescriptor } from './replay-resolver.js';

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
      ? `data/autonomy/replays/authorized/${state.fixtureId}.authorized.replay.json`
      : `data/replays/authorized/${state.fixtureId}.json`;
    state.authorized = await data(url, null);
  } catch { state.authorized = null; }
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
  // Default replay selection: prefer autonomy replays only when their bodies
  // are actually bundled in this build; the certified corpus is always
  // shipped, so it is the reliable default.
  const autonomyBundled = state.replayAvailability?.sources?.autonomy?.status === 'bundled';
  if (autonomyBundled && state.autonomyIndex?.records?.length) {
    state.replayKind = 'autonomy';
    state.fixtureId = state.autonomyIndex.records[0].fixtureId;
  } else {
    state.replayKind = 'corpus';
    state.fixtureId = state.index?.records[0]?.fixtureId ?? 'CT-001';
  }
  renderNavigation();
  renderExperimentControls();
  bindGlobal();
  const r = route();
  if (!LANDING_MODES.has(r) && !isPlayRoute(r)) await loadReplay(state.fixtureId);
}
