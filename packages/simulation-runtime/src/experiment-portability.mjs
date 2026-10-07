// ═══════════════════════════════════════════════════════════════
// experiment-portability.mjs — portable evidence contracts for the
// Experiment subsystem (platform-neutral, no I/O).
//
// Two envelope formats:
//
//   intrilex-experiment-run — one durable run artifact: the sealed run
//     record plus its committed evidence (batch records with summaries,
//     or a legacy whole-payload for pre-batched runs). The artifact is
//     self-verifying: contentHash covers the payload, the payload binds
//     run.runHash / run.payloadHash, and every batch re-verifies its own
//     summariesHash. Importing re-splits evidence into the store shape —
//     descriptor chain in `payloads`, committed summaries in `runBatches`.
//
//   intrilex-research-package — one Experiment's portable evidence bundle:
//     manifest.json  — the authoritative completeness/fidelity index
//     analysis/      — dossier.json (authoritative) + dossier.md (projection)
//     runs/          — one intrilex-experiment-run envelope per resolvable run
//     strategy/      — decision-evidence bundle, only when genuinely present
//     README.md      — human orientation
//
// Honesty rules enforced here:
//   - a package never reports COMPLETE while expected artifacts are missing
//   - Markdown is a projection of dossier.json, never independent evidence
//   - decision-evidence fidelity reflects what is actually retained in the
//     committed evidence, not what the run configuration requested
//   - replay coverage distinguishes retained transcripts from ordinals that
//     are merely re-executable by seed+configuration
// ═══════════════════════════════════════════════════════════════

import { hashCanonical } from '@intrilex/shared';
import {
  validateRunRecord, verifyRunPayload,
  batchSummariesHash, RUN_STATUS,
} from './experiment-domain.mjs';

export const EXPERIMENT_RUN_FORMAT = 'intrilex-experiment-run';
export const EXPERIMENT_RUN_SCHEMA_VERSION = 1;
export const RESEARCH_PACKAGE_FORMAT = 'intrilex-research-package';
export const RESEARCH_PACKAGE_SCHEMA_VERSION = 1;

// Decision-evidence fidelity — shared vocabulary with the Strategy evidence
// contract (strategy-evidence.mjs uses the same labels for sealed sources).
// UNRESOLVED is the honest "not inspected" state: a configuration flag is a
// collection request, never proof that decision evidence survived.
export const DECISION_FIDELITY = Object.freeze({
  NONE: 'NONE',
  SUMMARY: 'SUMMARY_ONLY',
  FULL: 'FULL_DECISION_EVIDENCE',
  MIXED: 'MIXED',
  UNRESOLVED: 'UNRESOLVED',
});

const fail = code => { throw Object.assign(new Error(code), { code }); };

// ── Run artifact (export) ───────────────────────────────────────

/**
 * Evidence predicate: does a retained summary set actually carry
 * decision-level capture? candidateScores on decisions, the
 * strategicTelemetry blob, or strategyDecisions are the durable signals.
 * Shared by runDecisionFidelity and the controller's artifact probe so
 * every surface applies the identical evidence test.
 */
export function summariesCarryDecisionEvidence(summaries) {
  return (summaries ?? []).some(s =>
    Array.isArray(s?.decisions) && s.decisions.some(d => Array.isArray(d?.candidateScores) && d.candidateScores.length > 0)
    || s?.strategicTelemetry != null
    || (Array.isArray(s?.strategyDecisions) && s.strategyDecisions.length > 0));
}

/**
 * Classify a run's retained decision evidence.
 * FULL  — committed summaries provably carry decision-level detail
 *         (decisions arrays with candidate scores, strategicTelemetry, or
 *         strategyDecisions). Evidence presence — not the strategicTrace
 *         request flag — is the only basis for FULL.
 * SUMMARY — evidence inspected: match-level summaries only.
 * NONE  — evidence inspected and empty / no analyzable evidence retained.
 * UNRESOLVED — no retained evidence was supplied for inspection. Callers
 *         MUST surface this rather than inferring fidelity from config.
 */
export function runDecisionFidelity(run, { sampleSummaries = null } = {}) {
  if (Array.isArray(sampleSummaries)) {
    if (!sampleSummaries.length) return DECISION_FIDELITY.NONE;
    return summariesCarryDecisionEvidence(sampleSummaries)
      ? DECISION_FIDELITY.FULL : DECISION_FIDELITY.SUMMARY;
  }
  void run;
  return DECISION_FIDELITY.UNRESOLVED;
}

/**
 * Replay coverage for a run. Experiment campaign summaries carry no retained
 * command transcripts; every accepted match is re-executable from
 * seed+ordinal+configuration, which is reproducibility, not a replay.
 */
export function replayCoverageForSummaries(summaries) {
  const list = summaries ?? [];
  return {
    gamesWithFullTranscript: list.filter(s => Array.isArray(s?.replay?.commands)).length,
    gamesReproducible: list.filter(s => s?.seed != null || s?.matchOrdinal != null).length,
    totalGames: list.length,
  };
}

/**
 * Assemble the exportable evidence block for a sealed run.
 * @param run     sealed run record (payloadKind 'indexeddb-batches' | 'indexeddb' | 'session')
 * @param payload stored payload row content — for 'indexeddb-batches' the
 *                descriptor chain ({kind:'batches',batches:[descriptors],aggregate});
 *                for 'indexeddb'/'session' the {summaries, aggregate} body
 * @param batches for 'indexeddb-batches', the committed batch records
 *                (descriptor + summaries) loaded from the runBatches store
 */
export function artifactEvidenceForRun(run, payload, batches = null) {
  const kind = run?.payloadKind ?? 'none';
  if (kind === 'indexeddb-batches') {
    const descriptors = (payload?.batches ?? []);
    const byIndex = new Map((batches ?? []).map(b => [b.batchIndex, b]));
    const ordered = descriptors.slice()
      .sort((a, b) => (a.ordinalStart ?? 0) - (b.ordinalStart ?? 0) || (a.batchIndex ?? 0) - (b.batchIndex ?? 0));
    const full = ordered.map(d => {
      const batch = byIndex.get(d.batchIndex);
      if (!batch) fail('RUN_CHUNK_MISSING');
      if (batchSummariesHash(batch.summaries) !== d.summariesHash) fail('RUN_PAYLOAD_HASH_MISMATCH');
      return {
        batchIndex: d.batchIndex, segmentIndex: d.segmentIndex ?? batch.segmentIndex ?? 0,
        ordinalStart: d.ordinalStart, ordinalEnd: d.ordinalEnd,
        matchCount: d.matchCount, summariesHash: d.summariesHash,
        committedAt: batch.committedAt ?? d.committedAt ?? null,
        summaries: batch.summaries,
      };
    });
    return { kind: 'batches', batches: full, aggregate: payload?.aggregate ?? null };
  }
  if (kind === 'indexeddb' || kind === 'session') {
    if (!payload || !Array.isArray(payload.summaries)) fail('RUN_PAYLOAD_MISSING');
    return { kind: 'summaries', summaries: payload.summaries, aggregate: payload.aggregate ?? null };
  }
  if (kind === 'none') return { kind: 'none' };
  fail('RUN_ARTIFACT_NOT_EXPORTABLE');
}

/** Wrap assembled evidence in the self-verifying artifact envelope. */
export function experimentRunArtifact({ run, evidence, versions = {}, exportedAt = null }) {
  validateRunRecord(run);
  const payload = {
    run,
    evidence,
    provenance: {
      exportedAt: exportedAt ?? new Date().toISOString(),
      engineVersion: versions.engineVersion ?? run.provenance?.engineVersion ?? null,
      rulesVersion: versions.rulesVersion ?? run.provenance?.rulesVersion ?? null,
      labVersion: versions.labVersion ?? run.provenance?.labVersion ?? null,
      compatibilityFingerprint: run.compatibilityFingerprint ?? null,
    },
  };
  return {
    format: EXPERIMENT_RUN_FORMAT,
    schemaVersion: EXPERIMENT_RUN_SCHEMA_VERSION,
    payload,
    contentHash: hashCanonical(payload),
  };
}

// ── Run artifact (import / verify) ──────────────────────────────

/**
 * Validate an experiment-run artifact and split it back into store shape:
 *   { run, payload, batches } — payload holds the descriptor chain for
 *   'batches' evidence (what saveRun/finalizeRun persist), batches are the
 *   committed runBatches rows (with summaries).
 * Throws a stable code on any integrity failure. `historical` artifacts —
 * sealed under a different rules/engine/profile fingerprint — validate
 * under their own identity and are flagged, never silently promoted.
 */
export function validateExperimentRunArtifact(envelope) {
  if (!envelope || typeof envelope !== 'object') fail('RUN_ARTIFACT_INVALID');
  if (envelope.format !== EXPERIMENT_RUN_FORMAT) fail('RUN_ARTIFACT_FORMAT_UNKNOWN');
  if (envelope.schemaVersion !== EXPERIMENT_RUN_SCHEMA_VERSION) fail('RUN_ARTIFACT_VERSION_UNSUPPORTED');
  if (!envelope.payload || typeof envelope.payload !== 'object') fail('RUN_ARTIFACT_PAYLOAD_INVALID');
  if (hashCanonical(envelope.payload) !== envelope.contentHash) fail('RUN_ARTIFACT_HASH_MISMATCH');
  const { run, evidence } = envelope.payload;
  validateRunRecord(run); // verifies runHash — sealed identity/config/metrics
  if (!evidence || typeof evidence !== 'object') fail('RUN_ARTIFACT_EVIDENCE_INVALID');

  if (evidence.kind === 'batches') {
    if (!Array.isArray(evidence.batches)) fail('RUN_ARTIFACT_EVIDENCE_INVALID');
    const descriptors = [];
    const batches = [];
    const seenOrdinals = new Set();
    for (const b of evidence.batches) {
      if (!Array.isArray(b.summaries)) fail('RUN_CHUNK_MISSING');
      if (batchSummariesHash(b.summaries) !== b.summariesHash) fail('RUN_PAYLOAD_HASH_MISMATCH');
      for (const s of b.summaries) {
        const o = s?.matchOrdinal;
        if (o != null) {
          if (seenOrdinals.has(o)) fail('RUN_ARTIFACT_DUPLICATE_ORDINAL');
          seenOrdinals.add(o);
        }
      }
      descriptors.push({
        batchIndex: b.batchIndex, ordinalStart: b.ordinalStart, ordinalEnd: b.ordinalEnd,
        matchCount: b.matchCount ?? b.summaries.length, summariesHash: b.summariesHash,
      });
      batches.push({
        batchId: `${run.runId}#${b.batchIndex}`, runId: run.runId,
        batchIndex: b.batchIndex, segmentIndex: b.segmentIndex ?? 0,
        ordinalStart: b.ordinalStart, ordinalEnd: b.ordinalEnd,
        matchCount: b.matchCount ?? b.summaries.length, summariesHash: b.summariesHash,
        committedAt: b.committedAt ?? null, summaries: b.summaries,
      });
    }
    const payload = { kind: 'batches', batches: descriptors, aggregate: evidence.aggregate ?? null };
    const verdict = verifyRunPayload(run, payload);
    if (!verdict.ok) fail(verdict.code);
    return { run, payload, batches };
  }
  if (evidence.kind === 'summaries') {
    const payload = { summaries: evidence.summaries ?? [], aggregate: evidence.aggregate ?? null };
    const verdict = verifyRunPayload(run, payload);
    if (!verdict.ok) fail(verdict.code);
    return { run, payload, batches: null };
  }
  if (evidence.kind === 'none') {
    return { run, payload: null, batches: null };
  }
  fail('RUN_ARTIFACT_EVIDENCE_INVALID');
}

export function parseExperimentRunArtifact(text, { importBytes = 0 } = {}) {
  if (typeof text !== 'string') fail('RUN_ARTIFACT_INVALID');
  if (importBytes > 0 && new TextEncoder().encode(text).byteLength > importBytes) fail('IMPORT_TOO_LARGE');
  let envelope;
  try { envelope = JSON.parse(text); } catch { fail('RUN_ARTIFACT_INVALID_JSON'); }
  return validateExperimentRunArtifact(envelope);
}

// ── Research package ────────────────────────────────────────────

/**
 * Aggregate a package-level decision-evidence fidelity from per-run labels.
 * MIXED when included runs disagree; NONE when no evidence-bearing runs.
 */
export function packageDecisionFidelity(perRunFidelities) {
  // UNRESOLVED contributes no fidelity claim — unverified evidence must not
  // count toward FULL, nor drag a cohort to MIXED on an unproven basis.
  const set = new Set((perRunFidelities ?? []).filter(f => f && f !== DECISION_FIDELITY.UNRESOLVED));
  if (!set.size) return DECISION_FIDELITY.NONE;
  if (set.size > 1) return DECISION_FIDELITY.MIXED;
  const only = [...set][0];
  return only === DECISION_FIDELITY.FULL ? DECISION_FIDELITY.FULL
    : only === DECISION_FIDELITY.SUMMARY ? DECISION_FIDELITY.SUMMARY : DECISION_FIDELITY.NONE;
}

export const PACKAGE_COMPLETENESS = Object.freeze({
  COMPLETE: 'COMPLETE',
  PARTIAL: 'PARTIAL',
  ANALYSIS_ONLY: 'ANALYSIS_ONLY',
});

/**
 * The package manifest — the authoritative index of what the bundle
 * contains and, critically, what it does NOT contain. `expected` counts
 * evidence-bearing attached runs (payloadKind !== 'none'); a failed run
 * record is listed under `runs` but is not expected to produce an artifact.
 */
export function researchPackageManifest({
  experimentId,
  identity = {},
  cohort = {},
  perRun = [],            // [{runId, ordinal, matchCount, included, persistence, fidelity, artifactFile|null, artifactMissing, replayCoverage}]
  analysisPresent = false,
  markdownProjection = false,
  strategyBundle = null,  // null → absent; {file, decisionEventCount?} → present
  exportedAt = null,
  warnings = [],
} = {}) {
  const evidenceRuns = perRun.filter(r => r.evidenceBearing !== false);
  const included = evidenceRuns.filter(r => r.artifactFile != null);
  const missing = evidenceRuns.filter(r => r.artifactFile == null).map(r => r.runId);
  const fidelity = packageDecisionFidelity(included.map(r => r.fidelity));
  const replay = {
    gamesWithFullTranscript: perRun.reduce((n, r) => n + (r.replayCoverage?.gamesWithFullTranscript ?? 0), 0),
    gamesReproducible: perRun.reduce((n, r) => n + (r.replayCoverage?.gamesReproducible ?? 0), 0),
    totalGames: cohort.matches ?? perRun.reduce((n, r) => n + (r.matchCount ?? 0), 0),
  };
  const completeness = missing.length === 0 && included.length > 0 && analysisPresent
    ? PACKAGE_COMPLETENESS.COMPLETE
    : included.length === 0 ? PACKAGE_COMPLETENESS.ANALYSIS_ONLY : PACKAGE_COMPLETENESS.PARTIAL;
  const warns = [...warnings];
  if (missing.length) warns.push(`PACKAGE_INCOMPLETE: ${missing.length} attached run artifact(s) could not be resolved: ${missing.join(', ')}`);
  if (completeness === PACKAGE_COMPLETENESS.ANALYSIS_ONLY) warns.push('ANALYSIS_ONLY package: no run artifacts could be resolved — dossier/analysis layers only.');
  return {
    format: RESEARCH_PACKAGE_FORMAT,
    schemaVersion: RESEARCH_PACKAGE_SCHEMA_VERSION,
    experimentId: experimentId ?? null,
    exportedAt: exportedAt ?? new Date().toISOString(),
    identity: {
      engineVersion: identity.engineVersion ?? null,
      rulesVersion: identity.rulesVersion ?? null,
      labVersion: identity.labVersion ?? null,
      fingerprint: identity.fingerprint ?? null,
    },
    cohort: {
      matches: cohort.matches ?? 0,
      runs: cohort.runs ?? evidenceRuns.length,
    },
    analysis: {
      present: analysisPresent === true,
      authoritativeFormat: 'json',
      markdownProjectionPresent: markdownProjection === true,
    },
    runArtifacts: {
      expected: evidenceRuns.length,
      included: included.length,
      missingRunIds: missing,
      perRun: perRun.map(r => ({
        runId: r.runId, ordinal: r.ordinal ?? null, matchCount: r.matchCount ?? 0,
        includedInAnalysis: r.included === true, persistence: r.persistence ?? 'unknown',
        fidelity: r.fidelity ?? DECISION_FIDELITY.NONE,
        artifactFile: r.artifactFile ?? null,
        artifactMissing: r.artifactFile == null && r.evidenceBearing !== false,
        missingReason: r.missingReason ?? null,
        evidenceBearing: r.evidenceBearing !== false,
      })),
    },
    strategyEvidence: {
      fidelity,
      present: strategyBundle != null,
      file: strategyBundle?.file ?? null,
    },
    replayCoverage: replay,
    completeness,
    warnings: warns,
  };
}

const README_TEMPLATE = pkg => `# Intrilex Research Evidence Package

Experiment: ${pkg.manifest.experimentId}
Exported:   ${pkg.manifest.exportedAt}
Completeness: ${pkg.manifest.completeness}

## Layers

- manifest.json          — authoritative index (completeness, fidelity, coverage, hashes)
- analysis/dossier.json  — Analysis Dossier (authoritative structured output)
- analysis/dossier.md    — human-readable projection of the same dossier (not independent evidence)
- runs/*.json            — one intrilex-experiment-run artifact per resolvable run
${pkg.manifest.strategyEvidence.present ? '- strategy/evidence.json  — decision-evidence bundle\n' : ''}## Evidence status

- Run artifacts: ${pkg.manifest.runArtifacts.included}/${pkg.manifest.runArtifacts.expected} included${pkg.manifest.runArtifacts.missingRunIds.length ? ` (missing: ${pkg.manifest.runArtifacts.missingRunIds.join(', ')})` : ''}
- Decision evidence: ${pkg.manifest.strategyEvidence.fidelity}
- Replay transcripts: ${pkg.manifest.replayCoverage.gamesWithFullTranscript} retained / ${pkg.manifest.replayCoverage.totalGames} games (${pkg.manifest.replayCoverage.gamesReproducible} reproducible by ordinal+seed)
${pkg.manifest.warnings.length ? `\n## Warnings\n${pkg.manifest.warnings.map(w => `- ${w}`).join('\n')}\n` : ''}`;

/**
 * Assemble the portable package. `files` is an ordered map path→text so the
 * downloader can serialize once; every file's canonical hash is recorded in
 * the manifest's `files` index for independent verification.
 */
export function buildResearchPackage({ manifest, files }) {
  const fileHashes = {};
  for (const [path, text] of Object.entries(files)) fileHashes[path] = hashCanonical(text);
  const fullManifest = { ...manifest, files: fileHashes };
  const out = { manifest: fullManifest, files };
  out.files['manifest.json'] = JSON.stringify(fullManifest, null, 2);
  out.files['README.md'] = README_TEMPLATE({ manifest: fullManifest });
  return {
    format: RESEARCH_PACKAGE_FORMAT,
    schemaVersion: RESEARCH_PACKAGE_SCHEMA_VERSION,
    manifest: fullManifest,
    files: out.files,
    contentHash: hashCanonical({ manifest: fullManifest, files: out.files }),
  };
}

/**
 * Validate a research package. Returns { manifest, runArtifacts:[{run,payload,batches}],
 * analysis:{dossierJson,dossierMarkdown}, strategyJson }.
 * Every file's hash is re-verified against manifest.files; every embedded run
 * artifact is fully validated (contentHash → runHash → payload chain →
 * batch hashes). Any mismatch fails the package, never a silent partial load.
 */
export function validateResearchPackage(pkg) {
  if (!pkg || typeof pkg !== 'object') fail('PACKAGE_INVALID');
  if (pkg.format !== RESEARCH_PACKAGE_FORMAT) fail('PACKAGE_FORMAT_UNKNOWN');
  if (pkg.schemaVersion !== RESEARCH_PACKAGE_SCHEMA_VERSION) fail('PACKAGE_VERSION_UNSUPPORTED');
  if (!pkg.manifest || !pkg.files || typeof pkg.files !== 'object') fail('PACKAGE_INVALID');
  if (hashCanonical({ manifest: pkg.manifest, files: pkg.files }) !== pkg.contentHash) fail('PACKAGE_HASH_MISMATCH');
  for (const [path, hash] of Object.entries(pkg.manifest.files ?? {})) {
    if (pkg.files[path] === undefined) fail('PACKAGE_FILE_MISSING');
    if (path !== 'manifest.json' && path !== 'README.md' && hashCanonical(pkg.files[path]) !== hash) fail('PACKAGE_HASH_MISMATCH');
  }
  const runArtifacts = [];
  for (const [path, text] of Object.entries(pkg.files)) {
    if (!path.startsWith('runs/') || !path.endsWith('.json')) continue;
    runArtifacts.push({ path, ...parseExperimentRunArtifact(text) });
  }
  return {
    manifest: pkg.manifest,
    runArtifacts,
    analysis: {
      dossierJson: pkg.files['analysis/dossier.json'] ?? null,
      dossierMarkdown: pkg.files['analysis/dossier.md'] ?? null,
    },
    strategyJson: pkg.files['strategy/evidence.json'] ?? null,
  };
}

export function parseResearchPackage(text, { importBytes = 0 } = {}) {
  if (typeof text !== 'string') fail('PACKAGE_INVALID');
  if (importBytes > 0 && new TextEncoder().encode(text).byteLength > importBytes) fail('IMPORT_TOO_LARGE');
  let pkg;
  try { pkg = JSON.parse(text); } catch { fail('PACKAGE_INVALID_JSON'); }
  return validateResearchPackage(pkg);
}

/** True when a run's status/kind makes it evidence-bearing for manifests. */
export function runEvidenceBearing(run) {
  return run?.status === RUN_STATUS.COMPLETED && run?.payloadKind && run.payloadKind !== 'none';
}
