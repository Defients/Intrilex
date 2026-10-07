// analysis-dossier-export.js — browser glue for the Analysis Dossier.
// Collects the live lab snapshot (IndexedDB stores + the Evolution Lab's
// read-only liveLabSnapshot boundary), builds the canonical dossier and
// downloads it. All analytics live in analysis-dossier.js — this module only
// does I/O. Browser-only; tests exercise the builder directly.
import { state } from './state.js?v=5c298831b65d';
import { buildAnalysisDossier, serializeAnalysisDossier, renderAnalysisDossierMarkdown, analysisDossierFileNames, deriveEvidenceStatus } from './analysis-dossier.js?v=5c298831b65d';
import { EvolutionStore } from './evolution/evolution-store.mjs?v=5c298831b65d';
import { StrategyStore } from './strategy/strategy-store.mjs?v=5c298831b65d';
import { LAB_IDENTITY } from './evolution/identity.mjs?v=5c298831b65d';
import { liveLabSnapshot } from './workspaces/evolution-dashboard.js?v=5c298831b65d';
import { collectExperimentEvidence, verifyRunArtifacts } from './experiments/experiment-controller.mjs?v=5c298831b65d';
import { LAB_VERSION, ENGINE_VERSION, RULES_VERSION, OFFICIAL_RULES_VERSION, SCHEMA_VERSION } from './version.js?v=5c298831b65d';

const STRATEGY_STORES = ['evidence', 'sources', 'events', 'replays', 'studies', 'claims', 'archives', 'informationSets', 'informationPlans', 'informationStudies', 'provenance'];

/**
 * Gather the Evolution Lab / strategy evidence snapshot through the clean
 * store APIs. Returns { available:false, reason } shells rather than throwing
 * so an absent IndexedDB never blocks the Observatory dossier.
 */
export async function collectLabEvidence() {
  const live = liveLabSnapshot();
  const lab = {
    available: true, reason: null, identity: LAB_IDENTITY,
    liveRun: live.liveRun ?? null, liveStatus: live.liveStatus ?? null,
    liveAggregator: live.liveAggregator ?? null, liveArchiveRef: live.liveArchiveRef ?? null,
    analyticsFilters: live.analyticsFilters ?? null, liveMatrix: live.liveMatrix ?? null,
    persistedRuns: [], matrices: [], researchProjects: [], mutations: [], strategy: null,
    experiments: null,
    collectionNotes: [],
  };
  try {
    lab.experiments = collectExperimentEvidence();
  } catch (error) {
    lab.experiments = { available: false, reason: `Experiment evidence projection failed: ${error?.message ?? 'unknown error'}` };
  }
  // Durable-artifact resolution is the async truth layer — it probes the
  // store (payload row + committed chunks) rather than trusting the run
  // record's persistence label.
  if (lab.experiments?.available === true) {
    try { lab.experiments.artifactStatus = await verifyRunArtifacts(); }
    catch (error) { lab.collectionNotes.push(`Experiment artifact verification failed: ${error?.message ?? 'unknown error'}`); }
  }
  if (live.researchProject) lab.researchProjects.push({ project: live.researchProject, contentHash: null });
  if (live.researchArchive) lab.collectionNotes.push('A historical research archive is open for inspection; it is not merged into current evidence.');

  try {
    const strategies = new StrategyStore();
    try {
      const counts = {};
      for (const name of STRATEGY_STORES) counts[name] = await strategies.scan(name);
      lab.strategy = { sources: await strategies.listSources(), provenance: await strategies.listProvenance(), counts };
    } finally { strategies.close(); }
  } catch (error) {
    lab.strategy = null;
    lab.collectionNotes.push(`Strategy evidence store unavailable: ${error?.message ?? 'unknown error'}`);
  }

  try {
    const store = new EvolutionStore(LAB_IDENTITY);
    try {
      for (const row of await store.list()) {
        try {
          const { run, envelope } = await store.loadForInspection(row.runId);
          lab.persistedRuns.push({ run, contentHash: envelope?.contentHash ?? null });
        } catch (error) {
          lab.collectionNotes.push(`Persisted run ${row.runId} unreadable: ${error?.message ?? 'unknown error'}`);
          lab.persistedRuns.push({ run: { runId: row.runId, status: 'UNREADABLE', records: [], checkpoints: [], replays: [], bookmarks: [], config: null, identity: null }, contentHash: null });
        }
      }
      for (const m of await store.listMatrices()) {
        if (m.corrupt) { lab.collectionNotes.push(`Persisted matrix ${m.matrixId} failed manifest validation — recorded as corrupt.`); lab.matrices.push({ payload: { matrixId: m.matrixId, status: 'CORRUPT', participants: [], runRefs: [] }, contentHash: null }); continue; }
        try { lab.matrices.push(await store.loadMatrix(m.matrixId)); }
        catch (error) { lab.collectionNotes.push(`Persisted matrix ${m.matrixId} unreadable: ${error?.message ?? 'unknown error'}`); }
      }
      for (const r of await store.listResearch()) {
        try { lab.researchProjects.push({ project: await store.loadResearch(r.experimentId), contentHash: null }); }
        catch (error) { lab.collectionNotes.push(`Research project ${r.experimentId} unreadable: ${error?.message ?? 'unknown error'}`); }
      }
      // Rule Mutation experiments are first-class dossier evidence. Corrupt or
      // unverifiable envelopes are disclosed as UNREADABLE entries — they must
      // never silently disappear from the record of what was run.
      for (const m of await store.listMutations()) {
        try {
          const record = await store.loadMutation(m.experimentId);
          lab.mutations.push({ record, contentHash: record.contentHash ?? null });
        } catch (error) {
          lab.collectionNotes.push(`Persisted mutation experiment ${m.experimentId} unreadable/corrupt: ${error?.message ?? 'unknown error'}`);
          lab.mutations.push({ record: { experimentType: 'rule-mutation', experimentId: m.experimentId, status: 'UNREADABLE' }, contentHash: null, unreadable: true });
        }
      }
    } finally { store.close(); }
  } catch (error) {
    lab.available = false;
    lab.reason = `Evolution Lab storage unavailable: ${error?.message ?? 'unknown error'}`;
  }
  return lab;
}

/** Build the canonical dossier from the current application state. */
export async function buildCurrentAnalysisDossier() {
  const lab = await collectLabEvidence();
  let analysisExtract = null;
  try {
    analysisExtract = state._extractModule?.extractAnalysis({ analytics: state.observatory, aggregate: state.aggregate }) ?? null;
  } catch { analysisExtract = null; }
  const dossier = buildAnalysisDossier({
    observatory: state.observatory ?? null, aggregate: state.aggregate ?? null,
    corpusAnalytics: state.corpusAnalytics ?? null, capabilities: state.capabilities ?? null,
    rankAuthority: state.rankAuthority ?? null, rankAnatomyRegistry: state.rankAnatomyRegistry ?? null,
    replayIndex: state.index ?? null, autonomyIndex: state.autonomyIndex ?? null,
    versions: { labVersion: LAB_VERSION, engineVersion: ENGINE_VERSION, rulesVersion: RULES_VERSION, officialRulesVersion: OFFICIAL_RULES_VERSION, observatorySchemaVersion: SCHEMA_VERSION },
    analysisExtract, lab, experiments: lab.experiments,
  });
  return dossier;
}

/**
 * Compact Evidence Status for the export hub overlay — derived from the same
 * evidence stores as the dossier (same source of truth) but at metadata
 * level only: no run bodies, no full dossier serialization. Called every
 * time the overlay opens so counts can never go stale.
 */
export async function dossierEvidenceStatus() {
  const live = liveLabSnapshot();
  let experiments = null;
  try { experiments = collectExperimentEvidence(); }
  catch (error) { experiments = { available: false, reason: `Experiment evidence projection failed: ${error?.message ?? 'unknown error'}` }; }
  let strategySources = [], strategyReachable = false;
  try {
    const strategies = new StrategyStore();
    try { strategySources = await strategies.listSources(); strategyReachable = true; }
    finally { strategies.close(); }
  } catch { strategyReachable = false; }
  let labRunCount = 0;
  try {
    const store = new EvolutionStore(LAB_IDENTITY);
    try { labRunCount = (await store.list()).length; }
    finally { store.close(); }
  } catch { labRunCount = 0; }
  return deriveEvidenceStatus({
    observatory: state.observatory ?? null,
    experiments,
    strategySources,
    strategyReachable,
    labRunCount,
    liveRunStrategicTrace: live.liveRun?.config?.strategicTrace === true,
    labFingerprint: LAB_IDENTITY?.fingerprint ?? null,
  });
}

function downloadFile(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Export the Analysis Dossier.
 * @param {'json'|'markdown'|'both'} format
 * @returns {{ dossier: object, files: string[] }}
 */
export async function exportAnalysisDossier(format = 'json') {
  const dossier = await buildCurrentAnalysisDossier();
  const names = analysisDossierFileNames(dossier);
  const files = [];
  if (format === 'json' || format === 'both') {
    // Pretty-printed canonical JSON: key order and values are identical to the
    // canonical serialization — only whitespace is added for readability.
    files.push([names.json, JSON.stringify(JSON.parse(serializeAnalysisDossier(dossier)), null, 2), 'application/json']);
  }
  if (format === 'markdown' || format === 'both') {
    files.push([names.markdown, renderAnalysisDossierMarkdown(dossier), 'text/markdown']);
  }
  for (const [name, text, type] of files) downloadFile(name, text, type);
  return { dossier, files: files.map(([name]) => name) };
}

/**
 * Legacy 'Extract analysis' contract, repaired: builds the canonical dossier
 * and copies the requested serialization to the clipboard. Kept under the old
 * action name for callers that still invoke showExtract.
 */
export async function extractAnalysisToClipboard(format = 'json') {
  const dossier = await buildCurrentAnalysisDossier();
  return format === 'markdown' ? renderAnalysisDossierMarkdown(dossier) : JSON.stringify(JSON.parse(serializeAnalysisDossier(dossier)), null, 2);
}
