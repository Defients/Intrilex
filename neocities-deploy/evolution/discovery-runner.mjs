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
import { createDiscoveryRun, createEvidenceSnapshot } from './discovery-domain.mjs';
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
  const priorDiscoveries = run.mode === 'auditor' ? (await store.listDiscoveries()).filter((d) => !d.corrupt) : [];

  const persist = async () => { await store.saveDiscoveryRun(run); await onPersist?.(run); };

  const finished = await runDiscovery(run, {
    evidenceRuns,
    priorDiscoveries,
    signal,
    executeSeries: (series, opts) => executeBrowserSeries(series, opts),
    // Persist stage evidence into the shared runs store. A STOPPED stage
    // also stamps its runId on the stage so resumeStageRun can find the
    // partial run; the engine overwrites it with the same id on completion.
    persistStageRun: async (_h, stage, stageRun) => {
      stage.experimentRunId = stageRun.runId;
      try { await store.save(stageRun); } catch { /* persistence never alters judgment */ }
      await persist();
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

/** Build a fresh discovery run over the store's current evidence.
 * loadForInspection returns foreign-fingerprint runs rather than throwing,
 * so createEvidenceSnapshot counts them as excluded instead of silently
 * dropping them from the scope. */
export async function prepareDiscoveryRun(store, input, identity) {
  const history = await store.list();
  const runs = [];
  for (const row of history.slice(0, input?.maxEvidenceRuns ?? 96)) {
    try { runs.push((await store.loadForInspection(row.runId)).run); } catch { /* unreadable rows cannot be claimed as evidence */ }
  }
  return createDiscoveryRun(input, createEvidenceSnapshot(runs, identity), identity);
}
