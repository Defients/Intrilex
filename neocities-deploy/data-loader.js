// ═══════════════════════════════════════════════════════════════
// data-loader.js — Observatory data bootstrapping and replay loading
// ═══════════════════════════════════════════════════════════════

import { state,   shell,   landingContainer,   data,   text,   parseNdjsonSafe,   computeVariantAnalyticsFromSummaries } from './state.js';
import { route, isPlayRoute, LANDING_MODES, renderNavigation } from './router.js';
import { renderExperimentControls, bindGlobal } from './experiment-controls.js';

// ── Replay loading ────────────────────────────────────────────────
export async function loadReplay(fixtureId) {
  try {
    const kind = state.replayKind;
    const index = kind === 'autonomy' ? state.autonomyIndex : state.index;
    const record = index?.records?.find(r => r.fixtureId === fixtureId);
    if (!record) { state.replay = null; state.authorized = null; return; }
    const url = kind === 'autonomy'
      ? `data/autonomy/replays/public/${record.fixtureId}.public.replay.json`
      : `data/certified-replays/${record.fixtureId}.certified.replay.json`;
    state.replay = await data(url);
    state.authorized = null;
    if (state.visibility !== 'public') await loadAuthorized();
  } catch (err) {
    console.warn('loadReplay failed:', fixtureId, err.message);
    state.replay = null;
    state.authorized = null;
  }
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
export async function boot() {
  const r = route();
  if (isPlayRoute(r)) {
    if (shell) shell.style.display = 'none';
    if (landingContainer) landingContainer.style.display = 'block';
    return;
  }
  const summariesText = await text('data/autonomy/match-summaries.ndjson');
  const summaries = parseNdjsonSafe(summariesText);
  [state.index, state.autonomyIndex, state.corpusAnalytics, state.aggregate, state.observatory, state.capabilities, state.rankAuthority] = await Promise.all([
    data('data/replay-index.json'),
    data('data/autonomy/lab-replay-index.json'),
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
  state.bootState = { aggregate: structuredClone(state.aggregate), observatory: structuredClone(state.observatory) };
  if (state.autonomyIndex?.records?.length) {
    state.replayKind = 'autonomy';
    state.fixtureId = state.autonomyIndex.records[0].fixtureId;
  } else {
    state.replayKind = 'corpus';
    state.fixtureId = state.index?.records[0]?.fixtureId ?? 'CT-001';
  }
  renderNavigation();
  renderExperimentControls();
  bindGlobal();
  if (!LANDING_MODES.has(r)) await loadReplay(state.fixtureId);
}
