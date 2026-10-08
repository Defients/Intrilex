// ═══════════════════════════════════════════════════════════════
// research-package.mjs — browser glue for the Research Evidence Package.
//
// Assembles one portable bundle for the active experiment:
//   manifest.json + analysis/dossier.json (+ dossier.md) +
//   runs/<runId>.json per resolvable run + strategy/evidence-N.json only
//   when decision evidence genuinely exists + README.md.
//
// Completeness is derived, never assumed: runs that cannot resolve to a
// durable artifact are named in manifest.runArtifacts.missingRunIds and the
// package reports PARTIAL/ANALYSIS_ONLY — an export that omits evidence
// always says so.
// ═══════════════════════════════════════════════════════════════

import { showToast } from '../state.js';
import {
  collectExperimentEvidence, exportRunArtifactEnvelope, importResearchPackage,
  experimentsReady, getExperiment,
} from './experiment-controller.mjs';
import {
  researchPackageManifest, buildResearchPackage, runDecisionFidelity,
  replayCoverageForSummaries, runEvidenceBearing, DECISION_FIDELITY,
} from '../../../../packages/simulation-runtime/src/experiment-portability.mjs';
import { BUNDLED_RUN_ID } from '../../../../packages/simulation-runtime/src/experiment-domain.mjs';
import { LAB_IDENTITY } from '../evolution/identity.mjs';
import { ENGINE_VERSION, RULES_VERSION, LAB_VERSION } from '../version.js';

function _evidenceSummaries(evidence) {
  if (!evidence) return [];
  if (evidence.kind === 'batches') return (evidence.batches ?? []).flatMap(b => b.summaries ?? []);
  if (evidence.kind === 'summaries') return evidence.summaries ?? [];
  return [];
}

/**
 * Strategy evidence scoped to this experiment's runs. Experiment campaign
 * runs do not stream into the Strategy store — decision evidence rides inside
 * the run artifacts themselves — so this returns a bundle only when sources
 * genuinely reference the experiment's runIds (e.g. evidence ingested
 * through another surface for the same run identity).
 */
async function _experimentStrategyBundle(runIds) {
  try {
    const { StrategyStore } = await import('../strategy/strategy-store.mjs');
    const store = new StrategyStore();
    try {
      const wanted = new Set(runIds);
      const sources = (await store.listSources()).filter(s => wanted.has(s.runId));
      if (!sources.length) return null;
      const scopes = [...new Map(sources.map(s => [`${s.fingerprint}|${s.rulesProfile}|${s.eraId}`, { fingerprint: s.fingerprint, rulesProfile: s.rulesProfile, eraId: s.eraId }])).values()];
      const bundles = [];
      for (const scope of scopes) bundles.push(await store.exportBundle(scope));
      return bundles;
    } finally { store.close(); }
  } catch { return null; }
}

/**
 * Build the research package envelope for the active experiment.
 * @returns {{pkg: object, report: object}}
 */
export async function buildResearchEvidencePackage({ onProgress = null } = {}) {
  if (!experimentsReady()) throw Object.assign(new Error('EXPERIMENTS_NOT_READY'), { code: 'EXPERIMENTS_NOT_READY' });
  const experiment = getExperiment();
  const evidence = collectExperimentEvidence();
  const files = {};
  const warnings = [];
  const perRun = [];

  // ── Run artifacts — serialized one at a time so the resident set stays
  // bounded to a single run's evidence during assembly.
  for (const row of evidence.runs ?? []) {
    if (row.runId === BUNDLED_RUN_ID) continue;
    const runStub = { runId: row.runId, ordinal: row.ordinal, matchCount: row.matchCount, included: row.included, persistence: row.persistence };
    const bearing = row.status === 'COMPLETED';
    try {
      const envelope = await exportRunArtifactEnvelope(row.runId);
      const summaries = _evidenceSummaries(envelope.payload?.evidence);
      perRun.push({
        ...runStub,
        evidenceBearing: bearing && envelope.payload?.evidence?.kind !== 'none',
        fidelity: runDecisionFidelity(envelope.payload.run, { sampleSummaries: summaries }),
        replayCoverage: replayCoverageForSummaries(summaries,{run:envelope.payload.run,implementation:LAB_IDENTITY}),
        artifactFile: `runs/${row.runId}.json`,
      });
      files[`runs/${row.runId}.json`] = JSON.stringify(envelope);
      onProgress?.({ phase: 'runs', done: perRun.length });
    } catch (error) {
      perRun.push({
        ...runStub, evidenceBearing: bearing,
        fidelity: DECISION_FIDELITY.NONE, artifactFile: null,
        missingReason: error?.code ?? String(error?.message ?? error),
      });
      onProgress?.({ phase: 'runs', done: perRun.length, missing: row.runId });
    }
  }

  // ── Analysis dossier — authoritative JSON + optional Markdown projection.
  let analysisPresent = false;
  try {
    const { buildCurrentAnalysisDossier } = await import('../analysis-dossier-export.js');
    const { serializeAnalysisDossier, renderAnalysisDossierMarkdown } = await import('../analysis-dossier.js');
    const dossier = await buildCurrentAnalysisDossier();
    files['analysis/dossier.json'] = JSON.stringify(JSON.parse(serializeAnalysisDossier(dossier)), null, 2);
    files['analysis/dossier.md'] = renderAnalysisDossierMarkdown(dossier);
    analysisPresent = true;
  } catch (error) {
    warnings.push(`Analysis dossier could not be built for this package: ${error?.message ?? error}`);
  }

  // ── Decision-evidence bundle — only when genuinely present.
  let strategyFiles = null;
  try {
    const bundles = await _experimentStrategyBundle(perRun.map(r => r.runId));
    if (bundles?.length) {
      strategyFiles = {};
      bundles.forEach((b, i) => {
        const path = bundles.length === 1 ? 'strategy/evidence.json' : `strategy/evidence-${i + 1}.json`;
        files[path] = JSON.stringify(b);
        strategyFiles[path] = true;
      });
    }
  } catch (error) {
    warnings.push(`Strategy evidence bundle could not be exported: ${error?.message ?? error}`);
  }

  const manifest = researchPackageManifest({
    experimentId: experiment?.experimentId ?? evidence.experimentId ?? null,
    identity: { engineVersion: ENGINE_VERSION, rulesVersion: RULES_VERSION, labVersion: LAB_VERSION, fingerprint: LAB_IDENTITY?.fingerprint ?? null },
    cohort: { matches: evidence.includedGames ?? 0, runs: evidence.includedRunCount ?? 0 },
    perRun,
    analysisPresent,
    markdownProjection: files['analysis/dossier.md'] != null,
    strategyBundle: strategyFiles ? { file: Object.keys(strategyFiles)[0], files: Object.keys(strategyFiles) } : null,
    warnings,
  });
  const pkg = buildResearchPackage({ manifest, files });
  return {
    pkg,
    report: {
      experimentId: manifest.experimentId,
      completeness: manifest.completeness,
      artifactsIncluded: manifest.runArtifacts.included,
      artifactsExpected: manifest.runArtifacts.expected,
      missingRunIds: manifest.runArtifacts.missingRunIds,
      warnings: manifest.warnings,
    },
  };
}

/** Build + download the package as a single JSON file. */
export async function downloadResearchPackage({ onProgress = null } = {}) {
  const { pkg, report } = await buildResearchEvidencePackage({ onProgress });
  const name = `${pkg.manifest.experimentId ?? 'experiment'}.research-package.json`;
  const url = URL.createObjectURL(new Blob([JSON.stringify(pkg)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { name, report };
}

/**
 * Import a research package from file text. Returns the controller's
 * admission report (imported/duplicates/foreign/failed + membership).
 */
export async function importResearchPackageText(text) {
  const report = await importResearchPackage(text);
  const parts = [`${report.imported.length} imported`, `${report.duplicates.length} already present`];
  if (report.foreign.length) parts.push(`${report.foreign.length} under a different experiment`);
  if (report.failed.length) parts.push(`${report.failed.length} failed`);
  showToast(`Research package: ${parts.join(' · ')}${report.completeness ? ` — ${report.completeness}` : ''}`, {
    type: report.failed.length ? 'warning' : 'success', title: 'Package import',
  });
  return report;
}
