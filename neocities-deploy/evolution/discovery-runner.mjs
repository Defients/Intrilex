// discovery-runner.mjs — Browser execution adapter for DISCOVER.
//
// The pure orchestrator (discovery-engine.mjs, shared with Node tests)
// decides what to investigate; this adapter supplies the three runtime
// dependencies it cannot supply itself:
//   executeSeries   — the existing worker-based series executor
//   persistStageRun — every stage series is saved into the `runs` store,
//                     including STOPPED partials so a paused discovery run
//                     can resume mid-stage instead of restarting it
//   resumeStageRun  — reload a stopped stage's partial run for resumption
// Evidence and prior discoveries come from the same EvolutionStore, so a
// discovery run only ever investigates evidence this origin produced.
import { executeBrowserSeries } from './evolution-browser-runner.mjs';
import { createDiscoveryRun, createEvidenceSnapshot, warn, DISCOVERY_LIMITS } from './discovery-domain.mjs';
import { runDiscovery } from './discovery-engine.mjs';

/** Load validated lab-run payloads for an evidence snapshot. Runs that
 * fail validation are skipped — the snapshot already counted exclusions. */
async function loadEvidenceRuns(store, snapshot) {
  const runs = [];
  for (const runId of snapshot.runIds) {
    try { runs.push(await store.load(runId)); } catch { /* excluded at scan time via snapshot.runIds mismatch */ }
  }
  return runs;
}

/** Auditor mode needs the full validated discovery artifact — scope,
 * policiesTested, effect and provenance — to rebuild a falsification
 * experiment. `listDiscoveries()` returns compact summaries for display;
 * audit targets must therefore be loaded individually by id. Rows that
 * fail validation are skipped and disclosed, never silently ignored or
 * reconstructed from summary fields. */
async function loadAuditTargets(store, run) {
  const discoveries = [];
  let rows = [];
  try { rows = await store.listDiscoveries(); } catch { rows = []; }
  for (const row of rows ?? []) {
    const id = row?.discoveryId;
    if (row?.corrupt || typeof id !== 'string' || id === 'unreadable') {
      warn(run, 'AUDIT_TARGET_UNREADABLE', `discovery row ${typeof id === 'string' ? id : 'unreadable'} is corrupt — excluded from audit targets`);
      continue;
    }
    try {
      discoveries.push(await store.loadDiscovery(id));
    } catch {
      warn(run, 'AUDIT_TARGET_UNREADABLE', `discovery ${id} could not be loaded as a full artifact — excluded from audit targets`);
    }
  }
  return discoveries;
}

/**
 * Execute (or resume) a discovery run in the browser.
 * @param {object} run   discovery run payload (IDLE or PAUSED)
 * @param {object} deps
 * @param {object} deps.store       EvolutionStore
 * @param {AbortSignal} deps.signal abort → run transitions to PAUSED
 * @param {Function} deps.onJournal (entry)      live research journal
 * @param {Function} deps.onStage   (h, stage, cell) stage completion
 * @param {Function} deps.onProgress({hypothesisId, stageKey, completed, total, budgetConsumed})
 * @param {Function} deps.onPersist (run)        called after every durable save
 */
export async function executeDiscoveryRun(run, { store, signal, onJournal, onStage, onProgress, onPersist } = {}) {
  const evidenceRuns = run.status === 'IDLE' ? await loadEvidenceRuns(store, run.evidence) : [];
  const priorDiscoveries = run.mode === 'auditor' ? await loadAuditTargets(store, run) : [];

  const persist = async () => { await store.saveDiscoveryRun(run); await onPersist?.(run); };

  const finished = await runDiscovery(run, {
    evidenceRuns,
    priorDiscoveries,
    signal,
    executeSeries: (series, opts) => executeBrowserSeries(series, opts),
    // Persist stage evidence into the shared runs store. The stage's
    // experimentRunId is stamped only after the save succeeds — a
    // provenance reference may never point at a run that is not durably
    // stored. A failed save is reported back to the engine (false) so it
    // can block promotion and disclose the gap; it is never swallowed.
    // A STOPPED stage follows the same path so resumeStageRun can find
    // its partial run.
    persistStageRun: async (_h, stage, stageRun) => {
      try {
        await store.save(stageRun);
      } catch {
        await persist();
        return false;
      }
      stage.experimentRunId = stageRun.runId;
      await persist();
      return true;
    },
    resumeStageRun: async (_h, stage) => {
      if (stage.status !== 'pending' || !stage.experimentRunId) return null;
      try { return await store.load(stage.experimentRunId); } catch { return null; }
    },
    onJournal,
    onStage,
    onProgress,
  });

  await persist();
  for (const discovery of finished.discoveries) {
    try { await store.saveDiscovery(discovery); } catch { /* run artifact remains the record */ }
  }
  if (finished.discoveries.length) await persist();
  return finished;
}

/**
 * Resolve what a discovery run would actually scan — without creating a
 * run. The workspace shows this before launch so a selected-but-empty
 * scope is visible (and blocked) up front instead of being discovered
 * as a zero-game run after the fact.
 *
 * Scope is the Lab series store only: `history` rows enumerate stored
 * runs; each payload is loaded via loadForInspection (which returns
 * foreign-fingerprint runs rather than throwing so they can be counted
 * as exclusions). Rows whose payloads fail to load are disclosed as
 * UNREADABLE exclusions — never silently dropped from the ledger.
 */
export async function resolveEvidenceScope(store, input = {}, identity) {
  const history = await store.list();
  const rows = history.slice(0, Math.min(input?.maxEvidenceRuns ?? 96, DISCOVERY_LIMITS.evidenceRunsMax));
  const runs = [];
  const unreadableRunIds = [];
  for (const row of rows) {
    try { runs.push((await store.loadForInspection(row.runId)).run); }
    catch { unreadableRunIds.push(row.runId); }
  }
  const snapshot = createEvidenceSnapshot(runs, identity, {
    unreadableRunIds,
    historyRunCount: history.length,
    truncatedRunCount: Math.max(0, history.length - rows.length),
  });
  return {
    snapshot,
    historyRunCount: history.length,
    selectedRunCount: snapshot.selectedRunCount,
    selectedGameCount: snapshot.selectedGameCount,
    eligibleRunCount: snapshot.runCount,
    eligibleGameCount: snapshot.gameCount,
    excludedRunCount: snapshot.excludedCount,
    exclusionReasons: snapshot.exclusionReasons ?? {},
    truncatedRunCount: snapshot.truncatedRunCount ?? 0,
  };
}

/** Build a fresh discovery run over the store's current evidence.
 * loadForInspection returns foreign-fingerprint runs rather than throwing,
 * so createEvidenceSnapshot counts them as excluded instead of silently
 * dropping them from the scope. */
export async function prepareDiscoveryRun(store, input, identity) {
  const scope = await resolveEvidenceScope(store, input, identity);
  return createDiscoveryRun(input, scope.snapshot, identity);
}
