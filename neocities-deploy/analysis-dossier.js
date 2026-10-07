// analysis-dossier.js — canonical "Analysis Dossier" export for the Intrilex
// Observatory / Evolution Lab.
//
// One authoritative structured JSON document that captures the current
// analytical research state: Observatory corpus analytics, Evolution Lab runs,
// Arena analytics, Batch Matrix results, research projects and the strategy
// evidence corpus. Markdown is rendered deterministically FROM the same
// canonical object — the two formats can never diverge semantically.
//
// Honesty contract: this module synthesizes and references; it never recomputes
// statistics that authoritative analytics already produce, never invents
// telemetry, and never substitutes 0 for "not measured". Absent domains carry
// an explicit { available: false, reason } declaration instead of a crash or a
// fabricated empty result. Historical artifacts whose identity fingerprint
// differs from the current lab identity are flagged `historical: true` and are
// never merged into current-authority claims.
//
// This file is isomorphic: it runs in Node (tests import it from src/) and in
// the browser (build.mjs rewrites the two packages/ imports to dist shims).
import { canonicalize, hashCanonical } from './shared-browser.js?v=46b6024f32eb';
import { arenaAnalytics, researchAnalytics } from './evolution/evolution-analytics-model.mjs?v=46b6024f32eb';
import { summarizeRecords, LAB_SCHEMA } from './evolution/evolution-domain.mjs?v=46b6024f32eb';
import { observatorySummariesForRun, observatoryCoverage } from './evolution/observatory-bridge.mjs?v=46b6024f32eb';
import { batchMatrixView } from './evolution/batch-matrix.mjs?v=46b6024f32eb';

export const DOSSIER_FORMAT = 'intrilex-analysis-dossier';
export const DOSSIER_VERSION = '1.1.0';

const unavailable = (reason, extra = {}) => ({ available: false, reason, ...extra });
const available = (extra = {}) => ({ available: true, ...extra });
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const sorted = (rows, key) => [...rows].sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? '')));

// Compact per-record projection: identity, plan, outcome, evidence hashes and
// telemetry-presence flags only. Replay payloads, seat telemetry bodies and
// per-decision traces stay in the authoritative run artifacts — the dossier
// records that they exist and where, not their contents.
const RECORD_ROW_FIELDS = ['ordinal', 'seed', 'swapped', 'winner', 'winningSeat', 'terminationReason', 'scoreP1', 'scoreP2', 'turns', 'miniTurns', 'decisions', 'policyActionCount', 'actionCount', 'passActionCount', 'commandCount', 'durationMs', 'ruleCompliance', 'initialStateHash', 'actionSequenceHash', 'finalStateHash', 'resultHash', 'replayId', 'matchId', 'evidenceOrigin', 'fingerprint'];
function recordRow(record) {
  const row = {};
  for (const field of RECORD_ROW_FIELDS) if (record[field] !== undefined) row[field] = record[field];
  if (Array.isArray(record.policyIds)) row.policyIds = [...record.policyIds];
  if (Array.isArray(record.checkpointIds)) row.checkpointIds = [...record.checkpointIds];
  row.telemetry = {
    seatBehavior: Array.isArray(record.seatBehavior) && record.seatBehavior.length > 0,
    strategicTelemetry: record.strategicTelemetry?.schemaVersion === 1,
    decisionEvents: Array.isArray(record.strategyDecisions) ? record.strategyDecisions.length : null,
    rankDecisions: Array.isArray(record.rankDecisions) ? record.rankDecisions.length : null,
  };
  return row;
}

function checkpointRow(checkpoint) {
  if (!checkpoint) return null;
  return {
    checkpointId: checkpoint.checkpointId ?? null, schemaVersion: checkpoint.schemaVersion ?? null,
    policyId: checkpoint.policyId ?? null, policyVersion: checkpoint.policyVersion ?? null,
    agentId: checkpoint.agentId ?? null, lineageId: checkpoint.lineageId ?? null,
    parentCheckpointId: checkpoint.parentCheckpointId ?? null, generation: checkpoint.generation ?? null,
    experimentId: checkpoint.experimentId ?? null, tags: Array.isArray(checkpoint.tags) ? [...checkpoint.tags] : [],
    fingerprint: checkpoint.identity?.fingerprint ?? null,
  };
}

/** Compact read-only projection of one lab run artifact for the dossier. */
export function labRunProjection(run, { fingerprint = null, contentHash = null } = {}) {
  if (!run || typeof run !== 'object') return null;
  const records = Array.isArray(run.records) ? run.records : [];
  let metrics = null, coverage = null;
  try { metrics = summarizeRecords(records); } catch { metrics = null; }
  try { coverage = observatoryCoverage(observatorySummariesForRun(run)); } catch { coverage = null; }
  const runFingerprint = run.identity?.fingerprint ?? null;
  return {
    runId: run.runId ?? null, kind: run.kind ?? null, researchPurpose: run.researchPurpose ?? null,
    status: run.status ?? null, createdAt: run.createdAt ?? null, elapsedMs: run.elapsedMs ?? null,
    config: isObject(run.config) ? {
      botA: run.config.botA ?? null, botB: run.config.botB ?? null, profileId: run.config.profileId ?? null,
      gameCount: run.config.gameCount ?? null, seed: run.config.seed ?? null,
      mirrorSeats: run.config.mirrorSeats ?? null, kind: run.config.kind ?? null,
      strategicTrace: run.config.strategicTrace ?? null, decisionLimit: run.config.decisionLimit ?? null,
    } : null,
    fingerprint: runFingerprint,
    historical: fingerprint !== null && runFingerprint !== null ? runFingerprint !== fingerprint : null,
    evidenceOrigin: run.evidenceOrigin ?? 'LOCAL', archival: run.archival === true,
    matrixCell: run.matrixCell ?? null,
    arenaProfileSnapshots: Array.isArray(run.arenaProfiles?.snapshots)
      ? run.arenaProfiles.snapshots.map(s => ({ profileId: s?.profile?.profileId ?? null, headVersion: s?.profile?.headVersion ?? null }))
      : null,
    checkpoints: (run.checkpoints ?? []).map(checkpointRow),
    notes: typeof run.notes === 'string' && run.notes ? run.notes : null,
    artifactContentHash: contentHash,
    metrics,
    observatoryCoverage: coverage,
    replayRetention: {
      retainedCount: Array.isArray(run.replays) ? run.replays.length : 0,
      replayIds: (run.replays ?? []).map(r => r.replayId).filter(Boolean),
      bookmarkedIds: Array.isArray(run.bookmarks) ? [...run.bookmarks] : [],
    },
    records: records.map(recordRow),
  };
}

/** Arena analytics projection — full analytic surface, record bodies removed. */
function arenaProjection(run, options = {}) {
  let model;
  try { model = arenaAnalytics(run, options); } catch (error) {
    return unavailable(`arenaAnalytics rejected the run: ${error?.message ?? 'unknown error'}`, { source: 'arenaAnalytics' });
  }
  return available({
    filters: {
      from: options.from ?? null, to: options.to ?? null, winner: options.winner ?? 'all',
      seat: options.seat ?? 'all', termination: options.termination ?? 'all',
      relation: options.relation ?? 'all', policy: options.policy ?? 'all',
      marginMin: options.marginMin ?? null, marginMax: options.marginMax ?? null,
      turnMin: options.turnMin ?? null, turnMax: options.turnMax ?? null,
      decisionMin: options.decisionMin ?? null, decisionMax: options.decisionMax ?? null,
      window: options.window ?? 100,
    },
    summary: model.summary, seats: model.seats, terminations: model.terminations,
    pairs: model.pairs, families: model.families, opportunityRows: model.opportunityRows,
    coverage: model.coverage, strategy: model.strategy, fingerprints: model.fingerprints,
    similarityDistance: model.similarityDistance, telemetryGames: model.telemetryGames,
    curves: model.curves, turnBins: model.turnBins, decisionBins: model.decisionBins,
    marginBins: model.marginBins,
    // Diagnostics keep verdicts and hashes; the embedded terminalEvidence
    // payload stays in the run artifact.
    diagnostics: (model.diagnostics ?? []).map(d => ({ ...d, terminalEvidence: d.terminalEvidence ? 'RETAINED_IN_ARTIFACT' : null })),
    scatter: (model.scatter ?? []).map(p => ({ x: p.x, y: p.y, ordinal: p.record?.ordinal ?? null })),
  });
}

/** Persisted batch matrix manifest → compact dossier row. */
function matrixManifestRow(manifest) {
  const payload = manifest?.payload ?? manifest ?? {};
  const refs = Array.isArray(payload.runRefs) ? payload.runRefs : [];
  return {
    matrixId: payload.matrixId ?? null, status: payload.status ?? null,
    createdAt: payload.createdAt ?? null, contentHash: manifest?.contentHash ?? null,
    profileId: payload.config?.profileId ?? null, gamesPerMatchup: payload.config?.gamesPerMatchup ?? null,
    participants: (payload.participants ?? []).map(p => ({
      participantId: p.participantId ?? null, displayName: p.displayName ?? null,
      kind: p.kind ?? null, policyId: p.policyId ?? null, headVersion: p.snapshot?.profile?.headVersion ?? null,
    })),
    checkpointIds: (payload.checkpoints ?? []).map(c => c?.checkpointId ?? null),
    cellsTotal: payload.participants ? payload.participants.length * (payload.participants.length - 1) / 2 : null,
    cellsComplete: refs.filter(r => r.status === 'COMPLETE').length,
    acceptedGames: refs.reduce((n, r) => n + (r.records ?? 0), 0),
    runRefs: refs.map(r => ({ seatA: r.seatA ?? null, seatB: r.seatB ?? null, runId: r.runId ?? null, status: r.status ?? null, records: r.records ?? null })),
    provenanceNote: 'Compact manifest — cell evidence lives in the referenced run artifacts, which remain authoritative.',
  };
}

/** Live (unfrozen) matrix lab → verified view projection or manifest row. */
function matrixLabProjection(lab) {
  if (!lab) return null;
  try {
    const view = batchMatrixView(lab);
    return { verified: true, ...view };
  } catch (error) {
    return { verified: false, verificationError: error?.message ?? 'MATRIX_VIEW_FAILED', ...matrixManifestRow(lab) };
  }
}

/** Research project → compact dossier projection over researchAnalytics. */
function researchProjection(project, { contentHash = null } = {}) {
  if (!project || typeof project !== 'object') return null;
  const experiment = project.experiment ?? {};
  let analysis = null;
  try { analysis = researchAnalytics(project); } catch { analysis = null; }
  const rows = (analysis?.rows ?? []).map(row => ({
    checkpointId: row.cp?.checkpointId ?? null, generation: row.cp?.generation ?? null,
    lineageId: row.cp?.lineageId ?? null, policyId: row.cp?.policyId ?? null,
    evaluationStatus: row.evaluation?.status ?? 'NONE', evaluationId: row.evaluation?.evaluationId ?? null,
    matchups: (row.matchups ?? []).map(m => ({ opponent: m.opponent ?? null, metrics: m.metrics ?? null })),
  }));
  return {
    experimentId: experiment.experimentId ?? null, name: experiment.name ?? null,
    status: experiment.status ?? null, type: experiment.type ?? null,
    scientificId: experiment.scientificId ?? null, hypothesis: experiment.hypothesis ?? null,
    description: experiment.description ?? null,
    parentExperimentId: experiment.parentExperimentId ?? null,
    fingerprint: experiment.identity?.fingerprint ?? project.identity?.fingerprint ?? null,
    contentHash,
    checkpointCount: (project.checkpoints ?? []).length,
    generationCount: (project.generations ?? []).length,
    evaluationCount: (project.evaluations ?? []).length,
    completedEvaluations: (project.evaluations ?? []).filter(e => e.status === 'COMPLETE').length,
    regressionCount: (project.regressions ?? []).length,
    faultCount: (project.faults ?? []).length,
    faults: (project.faults ?? []).map(f => ({ phase: f.phase ?? null, message: f.message ?? f.reason ?? null })),
    suiteId: project.suite?.suiteId ?? null,
    packIds: (project.packs ?? []).map(p => p.packId),
    startingCheckpointIds: experiment.scientific?.startingCheckpointIds ?? [],
    conclusion: project.conclusion ?? project.conclusions ?? null,
    generations: (project.generations ?? []).map(g => ({
      generationId: g.generationId ?? null, generation: g.generation ?? null,
      lineageId: g.lineageId ?? null, selectedCheckpointId: g.selectedCheckpointId ?? null,
    })),
    leaderboard: rows,
  };
}

/**
 * Rule Mutation experiment → compact dossier projection. Arm aggregates,
 * comparison rows, verdict and execution-ledger evidence are copied verbatim
 * from the artifact — the dossier synthesizes, it never recomputes them.
 * Unreadable/corrupt envelopes project to an explicit disclosed stub.
 */
function mutationExperimentProjection(entry) {
  const record = entry?.record ?? entry ?? null;
  if (!record || typeof record !== 'object') return null;
  if (entry?.unreadable === true || record.status === 'UNREADABLE') {
    return {
      experimentId: record.experimentId ?? 'unreadable', status: 'UNREADABLE',
      unavailable: true,
      reason: 'Persisted envelope failed hash or schema validation — recorded as corrupt, not dropped.',
      evidenceOrigin: record.evidenceOrigin ?? null, artifactContentHash: entry?.contentHash ?? null,
    };
  }
  const cfg = record.config ?? {};
  const mutation = record.mutation ?? {};
  const control = record.arms?.control?.summary ?? null;
  const mutant = record.arms?.mutant?.summary ?? null;
  const armSummary = (s) => s ? {
    games: s.games ?? null, decisive: s.decisive ?? null, draws: s.draws ?? null, aborted: s.aborted ?? null,
    seat1Wins: s.seat1Wins ?? null, seat1WinRate: s.seat1WinRate ?? null, seat1Wilson: s.seat1Wilson ?? null,
    meanTurns: s.turns?.mean ?? null, meanMargin: s.meanMargin ?? null,
    abortRate: s.abortRate ?? null, longGameRate: s.longGameRate ?? null,
    terminationReasons: s.terminationReasons ?? null, errorCodes: s.errorCodes ?? null,
    complianceFailures: s.complianceFailures ?? null, complianceUnavailable: s.complianceUnavailable ?? null,
  } : null;
  const impactRows = (record.comparison?.rows ?? []).map((row) => ({
    key: row.key ?? null, label: row.label ?? null, unit: row.unit ?? null,
    control: row.control ?? null, mutant: row.mutant ?? null, delta: row.delta ?? null,
    interval: row.interval ?? null, pValue: row.pValue ?? null,
    paired: row.paired ?? null, pairedN: row.pairedN ?? null,
    grade: row.grade ?? null, gradeReasons: row.gradeReasons ?? null,
    n: row.n ?? null,
  }));
  return {
    experimentId: record.experimentId ?? null,
    experimentType: record.experimentType ?? 'rule-mutation',
    schemaVersion: record.schemaVersion ?? null,
    createdAt: record.createdAt ?? null, status: record.status ?? null,
    baseline: record.baseline ? {
      engineVersion: record.baseline.engineVersion ?? null, rulesVersion: record.baseline.rulesVersion ?? null,
      labVersion: record.baseline.labVersion ?? null, authorityHash: record.baseline.authorityHash ?? null,
      profileId: record.baseline.profileId ?? null,
    } : null,
    mutation: {
      id: mutation.id ?? null, targetId: mutation.targetId ?? null, label: mutation.label ?? null,
      baselineValue: mutation.baselineValue ?? null, mutatedValue: mutation.mutatedValue ?? null,
      type: mutation.type ?? null,
    },
    hypothesis: record.hypothesis ?? null,
    config: {
      profileId: cfg.profileId ?? null, population: Array.isArray(cfg.population) ? [...cfg.population] : [],
      gamesPerArm: cfg.gamesPerArm ?? null, matchedSeeds: cfg.matchedSeeds ?? null,
      swapSides: cfg.swapSides ?? null, seedBase: cfg.seedBase ?? null, decisionLimit: cfg.decisionLimit ?? null,
      objective: cfg.objective ?? null,
    },
    execution: record.execution ? {
      plannedSpecCount: record.execution.plannedSpecCount ?? null,
      completedSpecCount: record.execution.completedSpecCount ?? null,
      matchedSeeds: record.execution.matchedSeeds ?? null,
      pairedCoverage: record.execution.pairedCoverage ?? null,
      pairedMutantCoverage: record.execution.pairedMutantCoverage ?? null,
      pairedExact: record.execution.pairedExact ?? null,
      unpairedControl: record.execution.unpairedControl ?? null,
      unpairedMutant: record.execution.unpairedMutant ?? null,
      ledgerExact: record.execution.ledger?.exact ?? null,
      ledgerMissing: record.execution.ledger?.missing?.length ?? null,
      ledgerDuplicates: record.execution.ledger?.duplicates?.length ?? null,
      ledgerUnexpected: record.execution.ledger?.unexpected?.length ?? null,
      ledgerMismatched: record.execution.ledger?.mismatched?.length ?? null,
      ledgerFaults: record.execution.ledger?.faults ?? null,
      planHash: record.execution.ledger?.planHash ?? null,
      cancelled: record.execution.cancelled === true || null,
    } : null,
    arms: {
      control: armSummary(control), mutant: armSummary(mutant),
      controlRetained: record.arms?.control?.summariesRetained ?? (Array.isArray(record.arms?.control?.summaries) ? record.arms.control.summaries.length : null),
      mutantRetained: record.arms?.mutant?.summariesRetained ?? (Array.isArray(record.arms?.mutant?.summaries) ? record.arms.mutant.summaries.length : null),
      controlDropped: record.arms?.control?.summariesDropped ?? null,
      mutantDropped: record.arms?.mutant?.summariesDropped ?? null,
    },
    impactRows,
    policyDeltas: record.comparison?.policyDeltas ?? null,
    pairedN: record.comparison?.pairedN ?? null,
    regressions: record.regressions ? {
      status: record.regressions.status ?? null,
      findings: record.regressions.findings ?? [],
      checked: record.regressions.checked ?? [], unmeasured: record.regressions.unmeasured ?? [],
    } : null,
    outcome: record.outcome ? {
      verdict: record.outcome.verdict ?? null, provisional: record.outcome.provisional ?? null,
      reasons: record.outcome.reasons ?? [], supportedMetrics: record.outcome.supportedMetrics ?? [],
    } : null,
    evidenceOrigin: record.evidenceOrigin ?? 'LOCAL',
    artifactContentHash: entry?.contentHash ?? record.contentHash ?? null,
  };
}

// ── Finding normalization ────────────────────────────────────────────────
// Findings project existing analytical verdicts into a uniform machine-readable
// contract. Fields are copied verbatim from the source analysis — a null means
// the underlying model did not measure it, never a fabricated default.
function mechanicFinding(m) {
  return {
    findingId: `mechanic:${m.metricId ?? m.mechanic}`, domain: 'mechanic',
    subject: m.displayName ?? m.mechanic ?? 'unknown',
    claim: `${m.mechanic}: selected in ${m.selectionCount ?? '?'} of ${m.legalOpportunityCount ?? '?'} legal opportunities; adjusted win association ${fmtPlain(m.adjustedWinAssociation)}`,
    status: m.status ?? (m.evidenceGrade ? 'measured' : 'unavailable'),
    evidenceGrade: m.evidenceGrade ?? null, evidenceGradeLegacy: m.evidenceGradeLegacy ?? null,
    evidenceReasons: Array.isArray(m.evidenceReasons) ? m.evidenceReasons : [],
    sampleSize: m.sampleSize ?? m.legalOpportunityCount ?? null,
    opportunityDenominator: m.legalOpportunityCount ?? null,
    effect: m.adjustedWinAssociation ?? m.rawWinAssociation ?? null,
    confidenceInterval: m.adjustedWinAssociation95 ?? m.rawWinAssociation95 ?? null,
    pValue: m.pValue ?? null, qValue: m.associationQValue ?? null,
    registryVerified: m.registryVerified ?? null, quarantined: m.quarantined === true,
    choiceSupport: m.choiceSupport ?? null,
    humanSummary: m.entityDescription ?? null,
    interpretationBoundary: m.inferential === false
      ? 'Descriptive/prevalence measurement — not an inferential association.'
      : 'Adjusted association is model- and policy-conditioned; it is not causal proof of balance effect.',
    sourceRefs: { metricId: m.metricId ?? null, formulaHash: m.formulaHash ?? null, outcomeFormulaHash: m.outcomeFormulaHash ?? null, replayRefs: m.replayRefs ?? [], counterexampleRefs: m.counterexampleRefs ?? [] },
  };
}

function policyFinding(p) {
  const record = p.record ?? {};
  return {
    findingId: `policy:${p.policyId}`, domain: 'policy', subject: p.policyId,
    claim: `${p.policyId}: ${record.wins ?? 0}W/${record.losses ?? 0}L/${record.draws ?? 0}D in ${record.games ?? 0} cross-policy games — win rate ${fmtPlain(record.winRate)}`,
    status: record.games > 0 ? 'measured' : 'unavailable',
    evidenceGrade: null, sampleSize: record.decisive ?? record.games ?? null,
    effect: record.winRate ?? null, confidenceInterval: record.wilson95 ?? null,
    pValue: null, qValue: null,
    humanSummary: null,
    interpretationBoundary: 'Observed win rate conditioned on the executed schedule and opponent pool; not a universal strength claim.',
    sourceRefs: { policyId: p.policyId, opponents: p.opponents ?? [] },
  };
}

function synergyFinding(s) {
  return {
    findingId: `synergy:${s.id ?? `${s.source}::${s.target}`}`, domain: 'synergy',
    subject: s.displayName ?? `${s.source} × ${s.target}`,
    claim: `${s.displayName ?? `${s.source} × ${s.target}`}: ${s.relationshipClass ?? 'unclassified'} (model OR ${fmtPlain(s.modelOR)})`,
    status: s.cellStatus ?? 'measured',
    evidenceGrade: s.evidenceQualified === true ? 'qualified' : s.evidenceQualified === false ? 'unqualified' : null,
    sampleSize: s.jointOpportunityCount ?? s.opportunityCount ?? null,
    effect: s.shrunkOR ?? s.modelOR ?? null,
    confidenceInterval: s.modelCI95 ?? s.confidenceInterval ?? null,
    pValue: s.pValue ?? null, qValue: s.qValue ?? null,
    humanSummary: `${s.relationshipClass ?? 'unclassified'} — model direction ${s.modelDirection ?? 'unknown'}, marginal direction ${s.marginalDirection ?? 'unknown'}${s.directionAgreement === false ? ' (directions disagree)' : ''}`,
    interpretationBoundary: 'Synergy interaction is the A×B odds-ratio from a stratified logistic model — model-dependent, not a causal claim.',
    sourceRefs: { source: s.source, target: s.target, estimand: s.estimand ?? null },
  };
}

function anomalyFinding(a) {
  return {
    findingId: `anomaly:${a.type}:${a.matchId ?? 'dataset'}`, domain: 'integrity',
    subject: a.type, claim: a.detail ?? `${a.type} flagged on ${a.matchId ?? 'dataset'}`,
    status: 'flagged', severity: a.severity ?? null, evidenceGrade: null,
    sampleSize: null, effect: a.value ?? null, confidenceInterval: null,
    pValue: null, qValue: null, humanSummary: a.detail ?? null,
    interpretationBoundary: 'Anomaly detectors flag statistical outliers for review; a flag is a prompt to investigate, not a finding of defect.',
    sourceRefs: { matchId: a.matchId ?? null, threshold: a.threshold ?? null, baseline: a.baseline ?? null, unit: a.unit ?? null },
  };
}

function fmtPlain(value) {
  if (value === null || value === undefined) return 'unavailable';
  return Number.isFinite(Number(value)) ? Number(Number(value).toFixed(4)) : 'unavailable';
}

function collectFindings({ observatory, extract }) {
  const findings = [];
  for (const p of observatory?.policies ?? []) findings.push(policyFinding(p));
  for (const m of observatory?.mechanics ?? []) findings.push(mechanicFinding(m));
  for (const s of observatory?.synergies ?? []) findings.push(synergyFinding(s));
  for (const a of observatory?.anomalies ?? []) findings.push(anomalyFinding(a));
  for (const row of observatory?.pairedABBA?.pairResults ?? []) {
    findings.push({
      findingId: `paired-abba:${row.policyPair}`, domain: 'paired-analysis', subject: row.policyPair,
      claim: `${row.policyA} vs ${row.policyB}: paired score analysis over ${row.pairedBlocks} matched AB/BA block(s) — ${row.interpretation ?? 'no interpretation'}`,
      status: row.pairedBlocks > 0 ? 'measured' : 'inconclusive', evidenceGrade: null,
      sampleSize: row.pairedBlocks ?? null, effect: row.mcnemar?.oddsRatio ?? null,
      confidenceInterval: row.bootstrap?.interval95 ?? row.bootstrap?.ci ?? null,
      pValue: row.mcnemar?.pValue ?? null, qValue: null,
      humanSummary: row.interpretation ?? null,
      interpretationBoundary: row.seatSwapVerified ? 'Matched AB/BA seat-swap verified by pairedRunId.' : 'Pair blocks matched heuristically — seat-swap not verified.',
      sourceRefs: { policyPair: row.policyPair, mcnemar: row.mcnemar ?? null, bootstrap: row.bootstrap ?? null },
    });
  }
  for (const f of extract?.mechanicFindings ?? []) {
    if (f.recommendation === 'needs-more-data' || f.dataSufficiency === 'insufficient') {
      findings.push({ findingId: `insufficient:${f.mechanic ?? f.metricId}`, domain: 'evidence-gap', subject: f.displayName ?? f.mechanic, claim: 'Insufficient measured evidence for an inferential claim', status: 'inconclusive', evidenceGrade: f.evidenceGrade ?? null, sampleSize: f.sampleSize ?? f.legalOpportunityCount ?? null, effect: null, confidenceInterval: null, pValue: null, qValue: null, humanSummary: null, interpretationBoundary: 'Reported opportunity counts fall below the model\'s inference thresholds.', sourceRefs: { metricId: f.metricId ?? null } });
    }
  }
  return findings.sort((a, b) => a.domain.localeCompare(b.domain) || String(a.findingId).localeCompare(String(b.findingId)));
}

// ── Open questions / evidence gaps ───────────────────────────────────────
function deriveOpenQuestions({ observatory, labSection, integrity, experiment }) {
  const questions = [];
  const quarantined = (observatory?.mechanics ?? []).filter(m => m.quarantined).length;
  if (quarantined > 0) questions.push(`${quarantined} tracked entit(ies) are quarantined pending canonical mechanic registry classification — their measurements are descriptive, not canonical.`);
  const insufficient = (observatory?.mechanics ?? []).filter(m => m.choiceSupport?.status === 'insufficient' || (m.evidenceGrade && m.evidenceGrade !== 'A' && m.evidenceGrade !== 'B')).length;
  if (insufficient > 0) questions.push(`${insufficient} mechanic entit(ies) lack identified choice-support or carry weak evidence grades — additional matched-opportunity data is required before preference claims.`);
  const rejectedPairs = observatory?.campaignHealth?.rejectedSynergyPairs ?? 0;
  if (rejectedPairs > 0) questions.push(`${rejectedPairs} candidate synergy pair(s) were rejected or remain unmodelled (${canonicalize(observatory?.campaignHealth?.synergyCellStatusCounts ?? {})}) — interactions in those cells are unmeasured, not absent.`);
  const incomplete = observatory?.pairedABBA?.incompletePairs ?? 0;
  if (incomplete > 0) questions.push(`${incomplete} incomplete AB/BA pair block(s) reduce paired seat-swap power; seat effects on those blocks are unresolved.`);
  if (observatory?.pairedABBA?.scheduleNote) questions.push(observatory.pairedABBA.scheduleNote);
  for (const anomaly of (observatory?.anomalies ?? []).filter(a => a.severity === 'error' || a.severity === 'critical')) {
    questions.push(`Unresolved ${anomaly.severity} anomaly ${anomaly.type} on ${anomaly.matchId ?? 'dataset'}: ${anomaly.detail ?? 'no detail recorded'}`);
  }
  const imported = labSection?.strategy?.origins?.IMPORTED_UNVERIFIED ?? 0;
  if (imported > 0) questions.push(`${imported} imported evidence source(s) remain IMPORTED_UNVERIFIED — external claims not yet reproduced under the current authority.`);
  const historical = (labSection?.runs ?? []).filter(r => r.historical === true).length;
  if (historical > 0) questions.push(`${historical} persisted run(s) carry a historical identity fingerprint — they are retained for inspection and are excluded from current-authority aggregation.`);
  const incompleteMatrices = (labSection?.batchMatrices ?? []).filter(m => m.status !== 'COMPLETE').length;
  if (incompleteMatrices > 0) questions.push(`${incompleteMatrices} batch matr(ix/ices) are not COMPLETE — pending cells are unmeasured matchups, not draws.`);
  for (const project of labSection?.researchProjects ?? []) {
    if (project.status === 'RUNNING' || project.status === 'PAUSED') questions.push(`Research project "${project.name ?? project.experimentId}" is ${project.status} — conclusions are provisional.`);
  }
  for (const m of labSection?.ruleMutations ?? []) {
    if (m.unavailable === true) { questions.push(`Rule-mutation experiment ${m.experimentId} is unreadable/corrupt — disclosed but unverifiable.`); continue; }
    if (m.status === 'incomplete' || m.execution?.ledgerExact === false) questions.push(`Rule-mutation experiment ${m.experimentId} did not execute the full declared plan (${m.execution?.completedSpecCount ?? '?'}/${m.execution?.plannedSpecCount ?? '?'} specs) — verdict ${m.outcome?.verdict ?? 'none'} is bounded by partial evidence.`);
    if (m.evidenceOrigin === 'IMPORTED_UNVERIFIED') questions.push(`Rule-mutation experiment ${m.experimentId} is IMPORTED_UNVERIFIED — its verdict was not reproduced under the current authority.`);
    if (m.outcome?.provisional === true) questions.push(`Rule-mutation experiment ${m.experimentId} is provisional — small per-arm samples limit inferential confidence.`);
  }
  const choice = observatory?.choiceAnalysis?.coverage;
  if (choice && choice.decisionsSeen > 0 && choice.decisionsUsable < choice.decisionsSeen) {
    questions.push(`Choice analysis used ${choice.decisionsUsable}/${choice.decisionsSeen} decision frames — ${choice.decisionsSeen - choice.decisionsUsable} frame(s) lacked usable legal-action structure.`);
  }
  if (integrity?.completeness?.status && integrity.completeness.status !== 'PASS') questions.push(`Taxonomy completeness is ${integrity.completeness.status} — ${integrity.completeness.unclassifiedCount} entit(ies) are unclassified beyond tolerance.`);
  if (experiment?.available === true && experiment.selectedExperimentIncluded === false && (experiment.totalRuns ?? 0) > 0) {
    questions.push(`Experiment ${experiment.experimentId ?? '(unknown)'} has ${experiment.totalRuns} recorded run(s) but none contribute to this dossier's dataset — ${experiment.exclusionReason ?? 'reason not recorded'}`);
  }
  if (experiment?.available === true && experiment.datasetLinked === true && experiment.selectedExperimentIncluded !== true) {
    questions.push(`Dataset origin claims EXPERIMENT_RUNS but the experiment evidence store reports no contributing run — scope cannot be verified.`);
  }
  return questions;
}

function deriveEvidenceGaps({ observatory, labSection }) {
  const gaps = [];
  if (!observatory?.hasOpportunityTelemetry) gaps.push({ domain: 'mechanics', gap: 'Mechanic opportunity telemetry absent or partial — pick rates may be unmeasurable for some entities', severity: 'high', suggestedEvidence: 'Campaign runs with opportunity-bearing telemetry (schema ≥ current)' });
  if ((observatory?.pairedABBA?.totalPairedBlocks ?? 0) === 0) gaps.push({ domain: 'paired-analysis', gap: 'No complete matched AB/BA pair blocks in the Observatory dataset', severity: 'high', suggestedEvidence: 'Mirror-seats campaign or Arena runs with pairedRunId linkage' });
  if ((observatory?.synergies ?? []).length === 0) gaps.push({ domain: 'synergies', gap: 'No synergy pairs cleared the modelling threshold', severity: 'medium', suggestedEvidence: 'More joint-opportunity observations for candidate pairs' });
  if (!labSection?.arena?.available) gaps.push({ domain: 'arena', gap: 'No Arena run analytics in this export', severity: 'medium', suggestedEvidence: 'Run an Arena series in the Evolution Lab' });
  if ((labSection?.batchMatrices ?? []).length === 0) gaps.push({ domain: 'batch-experiments', gap: 'No Batch Matrix results persisted or live', severity: 'low', suggestedEvidence: 'Create and execute a Batch Matrix round robin' });
  if ((labSection?.researchProjects ?? []).length === 0) gaps.push({ domain: 'evolution', gap: 'No research projects persisted', severity: 'low', suggestedEvidence: 'Commit an experiment in the Evolution Lab Research panel' });
  if ((labSection?.ruleMutations ?? []).length === 0) gaps.push({ domain: 'rule-mutation', gap: 'No Rule Mutation Chamber experiments persisted', severity: 'low', suggestedEvidence: 'Run a mutation experiment in the Mutation Chamber' });
  if ((observatory?.anomalies ?? []).length > 0) gaps.push({ domain: 'integrity', gap: `${observatory.anomalies.length} anomal${observatory.anomalies.length === 1 ? 'y' : 'ies'} flagged for review`, severity: 'medium', suggestedEvidence: 'Manual inspection of flagged matchIds / retained replays' });
  return gaps;
}

// ── Observatory section projections ─────────────────────────────────────
function observatorySections(observatory, aggregate) {
  if (!observatory || typeof observatory !== 'object') {
    return {
      observatory: unavailable('No Observatory analytics loaded — the dossier covers lab evidence only.'),
      policies: unavailable('Observatory analytics unavailable'), mechanics: unavailable('Observatory analytics unavailable'),
      synergies: unavailable('Observatory analytics unavailable'), motifs: unavailable('Observatory analytics unavailable'),
      ranks: unavailable('Observatory analytics unavailable'), variants: unavailable('Observatory analytics unavailable'),
      anomalies: unavailable('Observatory analytics unavailable'), pairedAnalysis: unavailable('Observatory analytics unavailable'),
      combo: unavailable('Observatory analytics unavailable'),
      choiceAnalysis: unavailable('Observatory analytics unavailable'),
      integrity: unavailable('Observatory analytics unavailable'),
      executiveSummary: null, findings: [], interpretationBoundaries: [],
    };
  }
  const rankPower = observatory.rankPower ?? null;
  // Quarantine reconciliation — two related but distinct counts that were
  // previously conflated in prose:
  //   unregisteredTags        — unregistered telemetry tags appearing on any
  //                             tracked entity (the quarantine ledger size).
  //                             Includes discovery-exempt pseudo-entities
  //                             (e.g. 'unclassified').
  //   quarantinedEntities     — tracked entities actually quarantined:
  //                             unregistered AND not discovery-exempt.
  //   discoveryExemptUnregistered — unregistered tags on exempt entities:
  //                             in the ledger but intentionally not
  //                             quarantined. unregisteredTags =
  //                             quarantinedEntities + exempt.
  const unregisteredTags = (observatory.quarantineLedger ?? []).length;
  const quarantinedEntities = (observatory.mechanics ?? []).filter(m => m.quarantined).length;
  const integrity = {
    completeness: observatory.completeness ?? null,
    reconciliation: observatory.reconciliation ?? null,
    campaignHealth: observatory.campaignHealth ?? null,
    quarantineLedger: observatory.quarantineLedger ?? [],
    quarantine: {
      unregisteredTags,
      quarantinedEntities,
      discoveryExemptUnregistered: Math.max(0, unregisteredTags - quarantinedEntities),
    },
    taxonomyDimensions: observatory.taxonomyDimensions ?? null,
    hasOpportunityTelemetry: observatory.hasOpportunityTelemetry ?? null,
    legacySchema: observatory.legacySchema ?? null,
    ruleCompliance: aggregate?.ruleCompliance ?? null,
    choiceAnalysisError: observatory.choiceAnalysisError ?? null,
    variantAnalyticsError: observatory.variantAnalyticsError ?? null,
  };
  return {
    observatory: available({
      schemaVersion: observatory.schemaVersion ?? null,
      summaryCount: observatory.summaryCount ?? null,
      detailedMatchCount: observatory.detailedMatchCount ?? null,
      datasetOrigin: observatory.datasetOrigin ?? 'CERTIFIED_CORPUS',
      evidenceEpoch: observatory.evidenceEpoch ?? null,
      postRulesParityRepair: observatory.postRulesParityRepair ?? null,
      mechanicRegistryHash: observatory.mechanicRegistryHash ?? null,
      observatoryHash: observatory.observatoryHash ?? null,
      aggregateHash: observatory.aggregateHash ?? null,
    }),
    policies: Array.isArray(observatory.policies)
      ? available({ count: observatory.policies.length, selfPlayExcluded: aggregate?.selfPlayExcluded ?? null, items: observatory.policies })
      : unavailable('No policy analytics in the Observatory payload'),
    mechanics: Array.isArray(observatory.mechanics)
      ? available({ count: observatory.mechanics.length, items: observatory.mechanics })
      : unavailable('No mechanic analytics in the Observatory payload'),
    synergies: available({
      items: observatory.synergies ?? [], diagnostics: observatory.synergyDiagnostics ?? null,
      candidateSet: observatory.synergyCandidateSet ?? null,
    }),
    motifs: available({ items: observatory.motifs ?? [] }),
    ranks: rankPower || observatory.rankCounters || observatory.swapMatrix
      ? available({
        rankPower, rankCounters: observatory.rankCounters ?? null,
        swapMatrix: observatory.swapMatrix ?? null,
        tenSuitExpansion: observatory.tenSuitExpansion ?? null,
        rankAuthority: null, // populated by caller from rankAuthority input
      })
      : unavailable('No rank analytics in the Observatory payload'),
    variants: observatory.variantAnalytics
      ? available({ ...observatory.variantAnalytics })
      : unavailable(observatory.variantAnalyticsError ? `Variant analytics failed: ${observatory.variantAnalyticsError}` : 'No variant analytics in the Observatory payload'),
    anomalies: available({ items: observatory.anomalies ?? [] }),
    pairedAnalysis: observatory.pairedABBA
      ? available({ ...observatory.pairedABBA })
      : unavailable('No paired AB/BA analysis in the Observatory payload'),
    combo: observatory.combo
      ? available({ ...observatory.combo })
      : unavailable('No Combo analytics in the Observatory payload'),
    choiceAnalysis: observatory.choiceAnalysis
      ? available({ ...observatory.choiceAnalysis })
      : unavailable(observatory.choiceAnalysisError ? `Choice analysis failed: ${observatory.choiceAnalysisError}` : 'No choice analysis in the Observatory payload'),
    integrity,
    executiveSummary: null,
    findings: [],
    interpretationBoundaries: [observatory.interpretationBoundary, aggregate?.interpretationBoundary, observatory.pairedABBA?.interpretationBoundary, observatory.choiceAnalysis?.contractNote].filter(Boolean),
  };
}

function labSections(lab) {
  const empty = {
    arena: unavailable('No lab snapshot provided — Arena state not accessible to this export.'),
    runs: [], batchMatrices: [], researchProjects: [], ruleMutations: [],
    strategy: unavailable('No lab snapshot provided — strategy evidence corpus not accessible.'),
    labIdentity: null, liveState: null, historicalArtifacts: [],
  };
  if (!lab || lab.available === false) {
    const reason = lab?.reason ?? 'Evolution Lab storage not reachable from this context.';
    return { ...empty, arena: unavailable(reason), strategy: unavailable(reason) };
  }
  const fingerprint = lab.identity?.fingerprint ?? null;
  const liveRun = lab.liveRun ?? null;
  const runProjections = (lab.persistedRuns ?? []).map(entry =>
    labRunProjection(entry.run ?? entry, { fingerprint, contentHash: entry.contentHash ?? null }));
  if (liveRun && !runProjections.some(r => r?.runId === liveRun.runId)) {
    runProjections.push(labRunProjection(liveRun, { fingerprint, contentHash: null }));
  }
  const sortedRuns = runProjections.filter(Boolean).sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));
  const focusRun = liveRun ?? (lab.persistedRuns ?? []).map(e => e.run ?? e).filter(r => r?.status === 'COMPLETE' || r?.records?.length).at(-1) ?? null;
  const arena = focusRun
    ? arenaProjection(focusRun, lab.analyticsFilters ?? {})
    : unavailable('No Arena run exists — no live session and no persisted runs.');
  const matrices = (lab.matrices ?? []).map(matrixManifestRow).filter(Boolean);
  if (lab.liveMatrix) matrices.push(matrixLabProjection(lab.liveMatrix));
  const research = (lab.researchProjects ?? []).map(p => researchProjection(p.project ?? p, { contentHash: p.contentHash ?? null })).filter(Boolean);
  const mutations = (lab.mutations ?? []).map(mutationExperimentProjection).filter(Boolean);
  const sources = lab.strategy?.sources ?? [];
  const origins = {}, fidelities = {};
  for (const s of sources) { origins[s.origin ?? 'UNKNOWN'] = (origins[s.origin ?? 'UNKNOWN'] ?? 0) + 1; fidelities[s.fidelity ?? 'UNKNOWN'] = (fidelities[s.fidelity ?? 'UNKNOWN'] ?? 0) + 1; }
  const strategy = lab.strategy
    ? available({
      provenance: (lab.strategy.provenance ?? []).map(p => ({ id: p.id ?? null, fingerprint: p.fingerprint ?? null, rulesProfile: p.rulesProfile ?? null, eraId: p.eraId ?? null, producer: p.producer ?? p.kind ?? null, origin: p.origin ?? null, runId: p.runId ?? null, matrixId: p.matrixId ?? null })),
      sourceCount: sources.length,
      decisionEventTotal: sources.reduce((n, s) => n + (s.eventCount ?? 0), 0),
      retainedEventTotal: sources.reduce((n, s) => n + (s.retainedEvents ?? 0), 0),
      origins, fidelities,
      sources: sorted(sources, 'artifactId').map(s => ({
        artifactId: s.artifactId ?? null, origin: s.origin ?? null, fidelity: s.fidelity ?? null,
        clean: s.clean ?? null, fingerprint: s.fingerprint ?? null, rulesProfile: s.rulesProfile ?? null,
        eraId: s.eraId ?? null, policyIds: s.policyIds ?? [], subjects: s.subjects ?? [],
        eventCount: s.eventCount ?? null, retainedEvents: s.retainedEvents ?? null,
        checkpointIds: s.checkpointIds ?? [], replayHash: s.replayHash ?? null,
      })),
      storeCounts: lab.strategy.counts ?? null,
      scopeNote: 'Strategy evidence is scoped by (fingerprint, rulesProfile, eraId) cohorts. Imported/unverified sources are listed but never merged into current-authority claims. The specialized Strategy export bundle remains authoritative for decision-level evidence.',
    })
    : unavailable('Strategy evidence store not included in the lab snapshot.');
  return {
    arena, runs: sortedRuns, batchMatrices: matrices.filter(Boolean), researchProjects: research,
    ruleMutations: mutations,
    strategy, labIdentity: lab.identity ?? null,
    liveState: {
      liveRunId: liveRun?.runId ?? null, status: lab.liveStatus ?? null,
      aggregator: lab.liveAggregator ?? null, archiveRef: lab.liveArchiveRef ?? null,
      analyticsFilters: lab.analyticsFilters ?? null,
    },
    historicalArtifacts: sortedRuns.filter(r => r.historical === true).map(r => ({ runId: r.runId, fingerprint: r.fingerprint, evidenceOrigin: r.evidenceOrigin })),
  };
}

// ── Experiment scope projection ────────────────────────────────────────
// `experiments` is the collectExperimentEvidence() projection: the active
// Experiment + Analysis Set — which runs contribute, which are excluded and
// why. The dossier records this verbatim, including the honest case where
// recorded runs exist but do NOT contribute to the exported dataset.
function experimentSection(experiments, datasetOrigin) {
  if (!experiments || experiments.available !== true) {
    return unavailable(experiments?.reason ?? 'Experiment evidence store not supplied to this export.', {
      experimentId: experiments?.experimentId ?? null,
      selectedExperimentIncluded: null,
      exclusionReason: 'Experiment evidence unavailable — run inclusion cannot be verified.',
    });
  }
  const linked = datasetOrigin === 'EXPERIMENT_RUNS';
  const includedRunCount = experiments.includedRunCount ?? experiments.includedRunIds?.length ?? 0;
  const included = linked && includedRunCount > 0;
  let exclusionReason = null;
  if (!included) {
    if (linked) exclusionReason = 'Dataset origin claims experiment runs but no recorded run contributes — inconsistent scope state.';
    else if (includedRunCount > 0) exclusionReason = `${includedRunCount} run(s) are included in the active analysis set but the exported dataset is ${datasetOrigin ?? 'CERTIFIED_CORPUS'} — the experiment selection is not reflected in this dossier's dataset.`;
    else if ((experiments.totalRuns ?? 0) > 0) exclusionReason = `${experiments.totalRuns} experiment run(s) recorded but none contribute (excluded, invalidated, archived, quarantined, or failed) — the exported dataset is ${datasetOrigin ?? 'CERTIFIED_CORPUS'}.`;
    else exclusionReason = 'No experiment runs recorded — the exported dataset is the certified baseline.';
  }
  // Artifact truth: verifyRunArtifacts() probes the store for the payload
  // row and every committed chunk — a run can record 'persisted' yet still
  // resolve 'missing-chunks'. Exportability follows the artifact, not the
  // record.
  const artifactById = new Map((experiments.artifactStatus ?? []).map(a => [a.runId, a]));
  const artifactRows = experiments.artifactStatus ?? null;
  const artifactSummary = artifactRows
    ? {
      durable: artifactRows.filter(a => a.artifact === 'durable').length,
      sessionOnly: artifactRows.filter(a => a.artifact === 'session').length,
      unresolvable: artifactRows.filter(a => !['durable', 'session', 'none'].includes(a.artifact)).length,
      unresolvableRunIds: artifactRows.filter(a => !['durable', 'session', 'none'].includes(a.artifact)).map(a => a.runId),
      portablePackageCompleteness: artifactRows.every(a => ['durable', 'session', 'none'].includes(a.artifact)) && artifactRows.some(a => a.artifact === 'durable' || a.artifact === 'session') ? 'resolvable' : artifactRows.length ? 'incomplete' : 'none',
    }
    : null;
  return available({
    experimentId: experiments.experimentId ?? null,
    analysisSetId: experiments.analysisSetId ?? null,
    persisted: experiments.persisted === true,
    datasetLinked: linked,
    selectedExperimentIncluded: included,
    exclusionReason,
    includedRunIds: experiments.includedRunIds ?? [],
    includedRunCount,
    includedGames: experiments.includedGames ?? 0,
    excludedRunCount: experiments.excludedRunCount ?? 0,
    excludedGames: experiments.excludedGames ?? 0,
    totalRuns: experiments.totalRuns ?? 0,
    invalidatedCount: experiments.invalidatedCount ?? 0,
    archivedCount: experiments.archivedCount ?? 0,
    failedCount: experiments.failedCount ?? 0,
    corruptCount: experiments.corruptCount ?? 0,
    quarantinedCount: experiments.quarantinedCount ?? 0,
    payloadUnavailableCount: experiments.payloadUnavailableCount ?? 0,
    integrityFailures: experiments.integrityFailures ?? [],
    memoryOnlyRunCount: experiments.memoryOnlyRunCount ?? 0,
    sessionPayloadRunCount: experiments.sessionPayloadRunCount ?? 0,
    bundledBaselineContributing: experiments.bundledBaselineContributing === true,
    fallback: experiments.fallback ?? null,
    runArtifacts: artifactSummary,
    artifactVerification: artifactRows ? 'resolved' : 'not-run',
    runs: (experiments.runs ?? []).map(r => ({
      runId: r.runId ?? null, ordinal: r.ordinal ?? null, status: r.status ?? null,
      lifecycle: r.lifecycle ?? 'active', pinned: r.pinned === true,
      included: r.included === true, origin: r.origin ?? 'session',
      persistence: r.persistence ?? 'persisted',
      artifact: artifactById.get(r.runId)?.artifact ?? null,
      exportable: artifactById.get(r.runId)?.exportable ?? null,
      // Fidelity is evidence-grounded: artifact verification scanned the
      // retained summaries. When verification did not run, the honest value
      // is UNRESOLVED — a strategicTrace request flag is never proof that
      // decision evidence survived.
      decisionFidelity: artifactById.get(r.runId)?.fidelity ?? 'UNRESOLVED',
      strategicTrace: r.strategicTrace === true,
      createdAt: r.createdAt ?? null, matchCount: r.matchCount ?? 0,
      compatibility: r.compatibility ?? null,
      exclusionReason: r.exclusionReason ?? null, exclusionNote: r.exclusionNote ?? null,
      rulesVersion: r.rulesVersion ?? null, engineVersion: r.engineVersion ?? null,
      profileId: r.profileId ?? null, policyIds: r.policyIds ?? null,
      canonicalResultHash: r.canonicalResultHash ?? null, runHash: r.runHash ?? null,
      payloadHash: r.payloadHash ?? null,
      integrity: r.integrity ?? 'ok', integrityCode: r.integrityCode ?? null,
      integrityNote: r.integrityNote ?? null,
    })),
    warnings: experiments.warnings ?? [],
    storeNote: 'Run records live in the experiment evidence store (IndexedDB intrilex-experiment-lab); excluded runs are retained, never deleted. Run artifacts export as self-verifying intrilex-experiment-run envelopes; the research package (intrilex-research-package) bundles manifest + dossier + all resolvable artifacts.',
  });
}

// ── Companion-artifact manifest ────────────────────────────────────────
// The dossier is a synthesis layer: it says WHAT richer evidence exists and
// where it lives — it does not contain run envelopes, replay bodies or
// per-decision strategy traces. available:true means companion artifacts of
// that type exist and are enumerable; available:false + reason distinguishes
// "none recorded" from "store unreachable".
function companionArtifacts({ lab, labSection, experiment, dataset }) {
  const labReachable = lab != null && lab.available !== false;
  const strategySources = labSection.strategy?.available ? (labSection.strategy.sources ?? []) : [];
  const replayIds = [
    ...new Set([
      ...(labSection.runs ?? []).flatMap(r => r.replayRetention?.replayIds ?? []),
      ...(dataset.retainedReplayRefs ?? []).map(r => r.matchId).filter(Boolean),
    ].filter(Boolean)),
  ].sort();
  return {
    strategy: !labSection.strategy?.available
      ? unavailable(labSection.strategy?.reason ?? 'Strategy evidence store not accessible.')
      : strategySources.length === 0
        ? unavailable('Strategy evidence store reachable — no evidence sources recorded.', { decisionEventCount: 0 })
        : available({
          authoritativeArtifact: 'Strategy export bundle (Strategy workspace) — authoritative for decision-level evidence',
          sourceCount: labSection.strategy.sourceCount,
          decisionEventCount: labSection.strategy.decisionEventTotal ?? 0,
          retainedDecisionEventCount: labSection.strategy.retainedEventTotal ?? 0,
          artifactIds: strategySources.map(s => s.artifactId).filter(Boolean).sort(),
          cohorts: [...new Set(strategySources.map(s => `${s.fingerprint ?? '?'}/${s.rulesProfile ?? '?'}/${s.eraId ?? '?'}`))].sort(),
          origins: labSection.strategy.origins ?? {}, fidelities: labSection.strategy.fidelities ?? {},
          storeCounts: labSection.strategy.storeCounts ?? null,
        }),
    runs: (labSection.runs ?? []).length
      ? available({
        authoritativeArtifact: 'Evolution run envelopes (Evolution Lab → Runs & artifacts)',
        runCount: labSection.runs.length,
        runIds: labSection.runs.map(r => r.runId).filter(Boolean).sort(),
        historicalRunIds: labSection.runs.filter(r => r.historical === true).map(r => r.runId).filter(Boolean).sort(),
      })
      : unavailable(labReachable ? 'No persisted lab runs recorded.' : 'Evolution Lab store not supplied or unreachable.'),
    experimentRuns: !experiment?.available
      ? unavailable(experiment?.reason ?? 'Experiment evidence store not accessible.')
      : (experiment.totalRuns ?? 0) === 0
        ? unavailable('Experiment store reachable — no session runs recorded.')
        : available({
          authoritativeArtifact: 'Experiment evidence store (IndexedDB intrilex-experiment-lab) — run records, analysis-set membership, per-run payloads',
          experimentId: experiment.experimentId ?? null,
          analysisSetId: experiment.analysisSetId ?? null,
          persisted: experiment.persisted === true,
          runCount: experiment.totalRuns ?? 0,
          runIds: (experiment.runs ?? []).map(r => r.runId).filter(Boolean).sort(),
          includedRunIds: experiment.includedRunIds ?? [],
          excludedRunCount: experiment.excludedRunCount ?? 0,
        }),
    batchMatrices: (labSection.batchMatrices ?? []).length
      ? available({ matrixIds: labSection.batchMatrices.map(m => m.matrixId).filter(Boolean).sort(), matrixCount: labSection.batchMatrices.length })
      : unavailable('No batch matrix artifacts recorded.'),
    researchProjects: (labSection.researchProjects ?? []).length
      ? available({ experimentIds: labSection.researchProjects.map(p => p.experimentId).filter(Boolean).sort(), projectCount: labSection.researchProjects.length })
      : unavailable('No research project envelopes recorded.'),
    ruleMutations: (labSection.ruleMutations ?? []).length
      ? available({ experimentIds: labSection.ruleMutations.map(m => m.experimentId).filter(Boolean).sort(), experimentCount: labSection.ruleMutations.length })
      : unavailable('No rule-mutation experiment envelopes recorded.'),
    replays: replayIds.length
      ? available({
        retainedReplayCount: replayIds.length,
        refs: replayIds,
        observatoryRetainedCount: (dataset.retainedReplayRefs ?? []).length,
        authoritativeArtifact: 'Replay bodies live in the certified replay index, the lab replay index, and Evolution run envelopes.',
      })
      : unavailable('No retained replay references in this dossier.'),
  };
}

// ── Export-overlay Evidence Status ─────────────────────────────────────
// Derives the compact status the sidebar export hub displays. Takes the same
// collected inputs as the dossier (observatory + experiments + strategy
// sources + persisted lab run count) so the panel can never disagree with
// the exported document. Pure — tested in Node.
export function deriveEvidenceStatus({ observatory = null, experiments = null, strategySources = null, strategyReachable = false, labRunCount = 0, liveRunStrategicTrace = false, labFingerprint = null } = {}) {
  const origin = observatory?.datasetOrigin ?? 'CERTIFIED_CORPUS';
  const experimentLinked = origin === 'EXPERIMENT_RUNS';
  const expAvailable = experiments?.available === true;
  const sourceLabel = experimentLinked
    ? `Experiment · ${experiments?.experimentId ?? 'unknown'}`
    : origin === 'EVOLUTION_LAB' ? 'Evolution Lab dataset' : 'Certified Corpus';
  const matches = observatory?.summaryCount ?? observatory?.summaries?.length ?? null;

  const warnings = [];
  if (experimentLinked && (!expAvailable || (experiments.includedRunCount ?? 0) === 0)) {
    warnings.push(`⚠ Selected Experiment ${experiments?.experimentId ?? ''} is not included — run inclusion cannot be verified.`.trim());
  } else if (origin === 'CERTIFIED_CORPUS' && expAvailable && (experiments.totalRuns ?? 0) > 0) {
    warnings.push(`⚠ ${experiments.totalRuns} experiment run(s) recorded but none contribute — this dossier covers the certified corpus.`);
  }

  let deepTracking;
  if (!strategyReachable) deepTracking = { state: 'unavailable', decisionEvents: null, retainedEvents: null, sourceCount: null };
  else if (!strategySources?.length) {
    deepTracking = liveRunStrategicTrace === true
      ? { state: 'enabled-no-evidence', decisionEvents: 0, retainedEvents: 0, sourceCount: 0 }
      : { state: 'none', decisionEvents: 0, retainedEvents: 0, sourceCount: 0 };
  } else {
    const decisionEvents = strategySources.reduce((n, s) => n + (s.eventCount ?? 0), 0);
    const retainedEvents = strategySources.reduce((n, s) => n + (s.retainedEvents ?? 0), 0);
    const origins = [...new Set(strategySources.map(s => s.origin ?? 'UNKNOWN'))].sort();
    const fingerprints = [...new Set(strategySources.map(s => s.fingerprint ?? null))];
    let state_ = 'persisted';
    if (origins.every(o => o === 'IMPORTED_UNVERIFIED')) state_ = 'imported-unverified';
    else if (labFingerprint && fingerprints.every(f => f !== null && f !== labFingerprint)) state_ = 'historical-only';
    if (state_ === 'historical-only') warnings.push('⚠ Strategy evidence exists, but only for a different research fingerprint.');
    deepTracking = { state: state_, decisionEvents, retainedEvents, sourceCount: strategySources.length, origins };
  }

  const labRuns = experimentLinked
    ? { count: experiments?.includedRunCount ?? 0, label: `${experiments?.includedRunCount ?? 0} attached` }
    : { count: labRunCount, label: `${labRunCount} recorded` };

  return {
    origin, sourceLabel, matches,
    detailedMatches: observatory?.detailedMatchCount ?? null,
    deepTracking, labRuns, warnings,
    experiment: expAvailable ? {
      experimentId: experiments.experimentId ?? null,
      included: experimentLinked && (experiments.includedRunCount ?? 0) > 0,
      includedRunCount: experiments.includedRunCount ?? 0,
      totalRuns: experiments.totalRuns ?? 0,
      persisted: experiments.persisted === true,
    } : null,
  };
}

/**
 * Build the canonical Analysis Dossier.
 * @param {object} input — see docs/ANALYSIS_DOSSIER.md for the full contract.
 * @param {{ generatedAt?: string }} [options]
 */
export function buildAnalysisDossier(input = {}, options = {}) {
  const {
    observatory = null, aggregate = null, corpusAnalytics = null,
    capabilities = null, rankAuthority = null, rankAnatomyRegistry = null,
    replayIndex = null, autonomyIndex = null,
    versions = {}, analysisExtract = null, lab = null, experiments = null,
  } = input;
  const generatedAt = options.generatedAt ?? new Date().toISOString();

  const sections = observatorySections(observatory, aggregate);
  if (sections.ranks?.available) sections.ranks.rankAuthority = rankAuthority ? { ranks: rankAuthority.ranks ?? rankAuthority, authorityHash: rankAuthority.authorityHash ?? null } : null;
  if (rankAnatomyRegistry) sections.ranks = { ...(sections.ranks.available ? sections.ranks : available({})), available: true, rankAnatomyRegistry };
  const labSection = labSections(lab);
  const datasetOrigin = observatory?.datasetOrigin ?? 'CERTIFIED_CORPUS';
  const experiment = experimentSection(experiments, datasetOrigin);

  const unavailableDomains = [];
  for (const [domain, section] of Object.entries({
    observatory: sections.observatory, policies: sections.policies, mechanics: sections.mechanics,
    synergies: sections.synergies.available === false ? sections.synergies : null,
    ranks: sections.ranks, variants: sections.variants, pairedAnalysis: sections.pairedAnalysis,
    choiceAnalysis: sections.choiceAnalysis, combo: sections.combo, arena: labSection.arena, strategy: labSection.strategy,
    experiment,
    aggregate: aggregate ? null : unavailable('No campaign aggregate loaded'),
    corpusAnalytics: corpusAnalytics ? null : unavailable('Corpus analytics not loaded'),
    capabilities: capabilities ? null : unavailable('Capability manifest not loaded'),
    analysisExtract: analysisExtract ? null : unavailable('extractAnalysis projection not supplied'),
  })) {
    if (section && section.available === false) unavailableDomains.push({ domain, reason: section.reason ?? 'unavailable', source: section.source ?? null });
  }

  const dataset = {
    observatorySummaries: observatory?.summaryCount ?? observatory?.summaries?.length ?? null,
    detailedMatches: observatory?.detailedMatchCount ?? null,
    retainedReplayRefs: (observatory?.retainedReplayIndex ?? []).map(r => ({ matchId: r.matchId ?? null, reasons: r.reasons ?? [] })),
    retainedReplayCount: (observatory?.retainedReplayIndex ?? []).length || null,
    aggregate: aggregate ? {
      matchCount: aggregate.matchCount ?? null, completedMatchCount: aggregate.completedMatchCount ?? null,
      abortCount: aggregate.abortCount ?? null, drawCount: aggregate.drawCount ?? null,
      terminationCounts: aggregate.terminationCounts ?? null, seatWins: aggregate.seatWins ?? null,
      seat1WinRate: aggregate.seat1WinRate ?? null, seat1Wilson95: aggregate.seat1Wilson95 ?? null,
      selfPlayExcluded: aggregate.selfPlayExcluded ?? null,
      experimentHash: aggregate.experimentHash ?? null, canonicalResultHash: aggregate.canonicalResultHash ?? null,
    } : null,
    corpus: corpusAnalytics ? {
      corpusKind: corpusAnalytics.corpusKind ?? null, replayCount: corpusAnalytics.replayCount ?? null,
      commandCount: corpusAnalytics.commandCount ?? null, eventCount: corpusAnalytics.eventCount ?? null,
      acceptedCommandCount: corpusAnalytics.acceptedCommandCount ?? null, rejectedCommandCount: corpusAnalytics.rejectedCommandCount ?? null,
      visibility: corpusAnalytics.visibility ?? null, fixtureGroups: corpusAnalytics.fixtureGroups ?? null,
      aggregateHash: corpusAnalytics.aggregateHash ?? null,
    } : null,
    replayIndex: replayIndex ? { schemaVersion: replayIndex.schemaVersion ?? null, replayCount: replayIndex.replayCount ?? replayIndex.records?.length ?? null, indexHash: replayIndex.indexHash ?? null } : null,
    autonomyIndex: autonomyIndex ? { schemaVersion: autonomyIndex.schemaVersion ?? null, replayCount: autonomyIndex.replayCount ?? autonomyIndex.records?.length ?? null, experimentHash: autonomyIndex.experimentHash ?? null, indexHash: autonomyIndex.indexHash ?? null } : null,
    lab: {
      persistedRunCount: labSection.runs.length,
      persistedRecords: labSection.runs.reduce((n, r) => n + r.records.length, 0),
      matrixCount: labSection.batchMatrices.length,
      researchProjectCount: labSection.researchProjects.length,
      mutationExperimentCount: labSection.ruleMutations.length,
      mutationExperimentUnreadable: labSection.ruleMutations.filter(m => m.unavailable === true).length,
      strategySourceCount: labSection.strategy.available ? labSection.strategy.sourceCount : null,
    },
    experiment: experiment.available ? {
      experimentId: experiment.experimentId,
      analysisSetId: experiment.analysisSetId,
      runCount: experiment.totalRuns,
      includedRunCount: experiment.includedRunCount,
      includedGames: experiment.includedGames,
      excludedRunCount: experiment.excludedRunCount,
      persisted: experiment.persisted,
    } : null,
  };

  const findings = collectFindings({ observatory, extract: analysisExtract });
  const interpretationBoundaries = [
    ...sections.interpretationBoundaries,
    ...(analysisExtract?.interpretationBoundary ? [analysisExtract.interpretationBoundary] : []),
    'Associations, win rates and adjusted estimates in this dossier are policy-, seat-, profile- and telemetry-conditioned observations — not causal proof and not balance canon.',
    'Zero and "unavailable" are distinct: a null or available:false marks unmeasured domains; a measured zero is reported as the number 0.',
    'Historical artifacts whose identity fingerprint differs from the current lab identity are flagged historical:true and are not merged into current-authority claims.',
    'Specialized artifacts (Evolution run envelopes, Batch Matrix artifacts/manifests, research envelopes, strategy bundles) remain the authoritative records for their own domains; this dossier is a synthesis layer above them.',
  ];

  const dossier = {
    format: DOSSIER_FORMAT,
    schemaVersion: DOSSIER_VERSION,
    dossierVersion: DOSSIER_VERSION,
    generatedAt,
    hashScope: 'SHA-256 over canonical JSON of this dossier excluding generatedAt, exportId and dossierHash. Rebuilding from the same analytical state reproduces the hash.',
    identity: {
      labVersion: versions.labVersion ?? null, engineVersion: versions.engineVersion ?? observatory?.engineVersion ?? aggregate?.engineVersion ?? null,
      rulesVersion: versions.rulesVersion ?? observatory?.rulesVersion ?? aggregate?.rulesVersion ?? null,
      officialRulesVersion: versions.officialRulesVersion ?? null,
      analyticsSchemaVersion: observatory?.schemaVersion ?? aggregate?.analyticsSchemaVersion ?? null,
      telemetrySchemaVersion: aggregate?.telemetrySchemaVersion ?? null,
      labArtifactSchema: LAB_SCHEMA,
      authorityProfile: observatory?.profileId ?? aggregate?.profileId ?? null,
      authorityHash: observatory?.authorityHash ?? aggregate?.authorityHash ?? rankAuthority?.authorityHash ?? null,
      releaseIdentityHash: observatory?.releaseIdentityHash ?? aggregate?.releaseIdentityHash ?? null,
      capabilityHash: capabilities?.capabilityHash ?? null,
      labFingerprint: labSection.labIdentity?.fingerprint ?? null,
      policyImplementationHash: labSection.labIdentity?.policyImplementationHash ?? null,
      runtimeHash: labSection.labIdentity?.runtimeHash ?? null,
      engineHash: labSection.labIdentity?.engineHash ?? null,
    },
    scope: {
      datasetOrigin,
      authorityProfileId: observatory?.profileId ?? aggregate?.profileId ?? null,
      experimentHash: aggregate?.experimentHash ?? null,
      canonicalResultHash: aggregate?.canonicalResultHash ?? null,
      arenaFilters: labSection.liveState?.analyticsFilters ?? null,
      experiment: {
        available: experiment.available === true,
        experimentId: experiment.experimentId ?? null,
        analysisSetId: experiment.analysisSetId ?? null,
        selectedExperimentIncluded: experiment.selectedExperimentIncluded ?? null,
        exclusionReason: experiment.exclusionReason ?? null,
        includedRunIds: experiment.includedRunIds ?? [],
        includedRunCount: experiment.includedRunCount ?? 0,
        includedGames: experiment.includedGames ?? 0,
        excludedRunCount: experiment.excludedRunCount ?? 0,
        totalRuns: experiment.totalRuns ?? 0,
      },
      labScope: {
        runIds: labSection.runs.map(r => r.runId), matrixIds: labSection.batchMatrices.map(m => m.matrixId),
        experimentIds: labSection.researchProjects.map(p => p.experimentId),
        mutationExperimentIds: labSection.ruleMutations.map(m => m.experimentId),
        checkpointIds: [...new Set(labSection.runs.flatMap(r => (r.checkpoints ?? []).map(c => c?.checkpointId).filter(Boolean)))].sort(),
      },
    },
    provenance: {
      observatoryHash: observatory?.observatoryHash ?? null,
      aggregateHash: observatory?.aggregateHash ?? aggregate?.aggregateHash ?? null,
      sourceHashes: observatory?.sourceHashes ?? null,
      evidenceEpoch: observatory?.evidenceEpoch ?? aggregate?.evidenceEpoch ?? null,
      postRulesParityRepair: observatory?.postRulesParityRepair ?? aggregate?.postRulesParityRepair ?? null,
      corpusAggregateHash: corpusAnalytics?.aggregateHash ?? null,
      replayIndexHash: replayIndex?.indexHash ?? null,
      labReplayIndexHash: autonomyIndex?.indexHash ?? null,
      extractHash: analysisExtract?.extractHash ?? null,
      artifacts: {
        runs: labSection.runs.map(r => ({ runId: r.runId, contentHash: r.artifactContentHash, fingerprint: r.fingerprint, evidenceOrigin: r.evidenceOrigin, historical: r.historical })),
        matrices: labSection.batchMatrices.map(m => ({ matrixId: m.matrixId, contentHash: m.contentHash ?? null, status: m.status })),
        research: labSection.researchProjects.map(p => ({ experimentId: p.experimentId, contentHash: p.contentHash, status: p.status })),
        mutations: labSection.ruleMutations.map(m => ({ experimentId: m.experimentId, contentHash: m.artifactContentHash, status: m.status, evidenceOrigin: m.evidenceOrigin ?? null })),
        experiment: experiment.available ? {
          experimentId: experiment.experimentId, analysisSetId: experiment.analysisSetId,
          runIds: (experiment.runs ?? []).map(r => r.runId), includedRunIds: experiment.includedRunIds,
          runHashes: (experiment.runs ?? []).map(r => r.runHash).filter(Boolean),
        } : null,
      },
      collectionNotes: Array.isArray(lab?.collectionNotes) ? lab.collectionNotes : [],
      generator: 'lab-web analysis-dossier', dossierSchemaVersion: DOSSIER_VERSION,
    },
    executiveSummary: buildExecutiveSummary({ observatory, aggregate, dataset, sections, labSection, experiment }),
    dataset,
    experiment,
    companionArtifacts: companionArtifacts({ lab, labSection, experiment, dataset }),
    observatory: sections.observatory,
    integrity: sections.integrity,
    policies: sections.policies, mechanics: sections.mechanics, synergies: sections.synergies,
    motifs: sections.motifs, ranks: sections.ranks, variants: sections.variants,
    pairedAnalysis: sections.pairedAnalysis, choiceAnalysis: sections.choiceAnalysis,
    combo: sections.combo,
    anomalies: sections.anomalies,
    strategy: labSection.strategy,
    arena: labSection.arena,
    batchExperiments: { matrices: labSection.batchMatrices, liveState: labSection.liveState },
    evolution: { researchProjects: labSection.researchProjects, ruleMutations: labSection.ruleMutations, labIdentity: labSection.labIdentity, runs: labSection.runs, historicalArtifacts: labSection.historicalArtifacts },
    findings,
    uncertainties: collectUncertainties(observatory, labSection),
    recommendations: collectRecommendations(analysisExtract, observatory, labSection),
    openQuestions: deriveOpenQuestions({ observatory, labSection, integrity: sections.integrity, experiment }),
    evidenceGaps: deriveEvidenceGaps({ observatory, labSection }),
    interpretationBoundaries: [...new Set(interpretationBoundaries)],
    unavailable: unavailableDomains,
    analysisExtract: analysisExtract ?? null,
    metricRegistry: observatory?.metricRegistry ?? null,
    rankAnatomyRegistry: rankAnatomyRegistry ?? null,
  };
  dossier.dossierHash = hashCanonical(dossierBody(dossier));
  dossier.exportId = `${generatedAt.replace(/[-:T]/g, '').slice(0, 14)}-${dossier.dossierHash.slice(0, 12)}`;
  return dossier;
}

function dossierBody(dossier) {
  const { generatedAt: _generatedAt, exportId: _exportId, dossierHash: _dossierHash, ...body } = dossier;
  return body;
}

function buildExecutiveSummary({ observatory, aggregate, dataset, sections: _sections, labSection, experiment }) {
  const lines = [];
  if (observatory) {
    lines.push(`Observatory dataset: ${dataset.observatorySummaries ?? 'unknown'} match summaries under authority profile "${observatory.profileId ?? aggregate?.profileId ?? 'unknown'}" (rules ${observatory.rulesVersion ?? aggregate?.rulesVersion ?? '?'}, engine ${observatory.engineVersion ?? aggregate?.engineVersion ?? '?'}, epoch ${observatory.evidenceEpoch ?? '?'}${observatory.postRulesParityRepair ? ', post-parity-repair' : ''}).`);
    if (observatory.datasetOrigin === 'EXPERIMENT_RUNS') {
      lines.push(`Dataset origin: EXPERIMENT_RUNS — analytics describe experiment ${experiment?.experimentId ?? '(unknown)'} analysis set ${experiment?.analysisSetId ?? '(unknown)'}: ${experiment?.includedRunCount ?? 0} contributing run(s), ${experiment?.includedGames ?? 0} games, ${experiment?.excludedRunCount ?? 0} recorded run(s) excluded; telemetry coverage may differ from the certified corpus.`);
    } else if (observatory.datasetOrigin === 'EVOLUTION_LAB') {
      lines.push('Dataset origin: EVOLUTION_LAB propagated lab games — not the certified corpus; telemetry coverage may be partial.');
    }
    if (experiment?.available === true && experiment.selectedExperimentIncluded === false && (experiment.totalRuns ?? 0) > 0) {
      lines.push(`Experiment scope: ${experiment.totalRuns} run(s) recorded under ${experiment.experimentId ?? 'the experiment'} but none contribute to this dataset — ${experiment.exclusionReason ?? 'reason not recorded'}`);
    }
    if (aggregate) lines.push(`Campaign aggregate: ${aggregate.matchCount ?? '?'} matches, ${aggregate.completedMatchCount ?? '?'} completed, ${aggregate.abortCount ?? 0} aborts, ${aggregate.drawCount ?? 0} draws; seat-1 win rate ${pctText(aggregate.seat1WinRate)} (Wilson95 ${formatInterval(aggregate.seat1Wilson95)}).`);
    lines.push(`${observatory.mechanics?.length ?? 0} mechanic entities tracked (${observatory.reconciliation?.registered ?? '?'} registry-registered), ${observatory.synergies?.length ?? 0} modelled synergies, ${observatory.policies?.length ?? 0} policies, ${observatory.anomalies?.length ?? 0} anomalies, completeness ${observatory.completeness?.status ?? 'UNKNOWN'}.`);
    const qualified = observatory.rankPower?.balanceQualification;
    if (qualified) lines.push(`Rank power: ${qualified.qualifiedCount}/${qualified.entryCount} ladder entries are balance-qualified${qualified.descriptiveLeader ? `; descriptive leader ${qualified.descriptiveLeader}` : ''}${qualified.qualifiedLeader ? `; qualified leader ${qualified.qualifiedLeader}` : ''}.`);
  } else {
    lines.push('No Observatory analytics were loaded — this dossier covers lab evidence only.');
  }
  if (labSection.runs.length || labSection.ruleMutations.length) lines.push(`Evolution Lab: ${labSection.runs.length} run artifact(s), ${dataset.lab.persistedRecords} accepted game records, ${labSection.batchMatrices.length} matrix artifact(s), ${labSection.researchProjects.length} research project(s), ${labSection.ruleMutations.length} rule-mutation experiment(s).`);
  if (labSection.strategy.available) lines.push(`Strategy corpus: ${labSection.strategy.sourceCount} evidence source(s), ${labSection.strategy.decisionEventTotal} decision events (${labSection.strategy.origins.IMPORTED_UNVERIFIED ?? 0} imported-unverified).`);
  return { lines, analysisExtractSummary: null };
}

function collectUncertainties(observatory, labSection) {
  const out = [];
  if (observatory?.pairedABBA) out.push({ domain: 'paired-analysis', uncertainty: `AB/BA pairing: ${observatory.pairedABBA.totalPairedBlocks ?? 0} complete paired blocks, ${observatory.pairedABBA.incompletePairs ?? 0} incomplete` });
  if (observatory?.rankPower?.axisCoverage) out.push({ domain: 'ranks', uncertainty: `Axis coverage ${canonicalize(Object.fromEntries(Object.entries(observatory.rankPower.axisCoverage).map(([k, v]) => [k, v.rate ?? null])))}` });
  if (labSection.arena?.available && labSection.arena.pairs) out.push({ domain: 'arena', uncertainty: `Paired score interval ${formatInterval(labSection.arena.pairs.interval)} over ${labSection.arena.pairs.n ?? 0} pairs` });
  return out;
}

function collectRecommendations(extract, observatory, labSection) {
  const recommendations = [...(extract?.recommendations ?? [])];
  if ((observatory?.quarantineLedger ?? []).length > 0) recommendations.push(`${observatory.quarantineLedger.length} telemetry tag(s) are quarantined pending canonical mechanic registry entries — extend the registry before treating them as canonical mechanics.`);
  if (labSection.historicalArtifacts.length) recommendations.push('Re-run or exclude historical-fingerprint artifacts before drawing current-authority conclusions from lab evidence.');
  if (!recommendations.length) recommendations.push('No action required — dataset is internally consistent and statistically sound.');
  return [...new Set(recommendations)];
}

// ── Serialization ────────────────────────────────────────────────────────
/** Canonical JSON string — sorted keys, deterministic, locale-independent. */
export function serializeAnalysisDossier(dossier) {
  return canonicalize(dossier);
}

export function analysisDossierFileNames(dossier, { generatedAt = null } = {}) {
  const stamp = (generatedAt ?? dossier?.generatedAt ?? new Date().toISOString()).replace(/[-:T]/g, '').replace(/\..*$/, '').replace('Z', '');
  const hash = (dossier?.dossierHash ?? 'draft').slice(0, 12);
  return {
    json: `intrilex-analysis-dossier-${stamp}-${hash}.json`,
    markdown: `intrilex-analysis-dossier-${stamp}-${hash}.md`,
  };
}

// ── Deterministic Markdown renderer ─────────────────────────────────────
// Renders the canonical dossier object. The JSON remains the source of truth —
// every number here is read from the dossier, never recomputed.
const pctText = v => v === null || v === undefined ? 'unavailable' : Number.isFinite(Number(v)) ? `${(Number(v) * 100).toFixed(1)}%` : 'unavailable';
const numText = v => v === null || v === undefined ? '—' : Number.isFinite(Number(v)) ? String(Math.round(Number(v) * 10000) / 10000) : '—';
function formatInterval(ci) {
  return Array.isArray(ci) && ci.length >= 2 && ci.every(v => Number.isFinite(Number(v)))
    ? `[${Number(ci[0]).toFixed(3)}, ${Number(ci[1]).toFixed(3)}]` : 'unavailable';
}
function mdTable(headers, rows) {
  if (!rows.length) return '_None._\n';
  const esc = v => String(v ?? '—').replaceAll('|', '\\|');
  return `| ${headers.map(esc).join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n${rows.map(r => `| ${r.map(esc).join(' | ')} |`).join('\n')}\n`;
}
const mdSectionStatus = section => !section ? '_Unavailable — section not present._\n'
  : section.available === false ? `_Unavailable — ${section.reason ?? 'no reason recorded'}._\n` : null;

export function renderAnalysisDossierMarkdown(dossier) {
  if (!dossier || dossier.format !== DOSSIER_FORMAT) throw new Error('NOT_AN_ANALYSIS_DOSSIER');
  const id = dossier.identity ?? {}, prov = dossier.provenance ?? {}, scope = dossier.scope ?? {}, ds = dossier.dataset ?? {};
  const out = [];
  out.push(`# Intrilex Analysis Dossier\n`);
  out.push(`Schema \`${dossier.schemaVersion}\` · generated ${dossier.generatedAt ?? 'unknown'} · dossier hash \`${dossier.dossierHash ?? 'unavailable'}\`\n`);
  out.push(`> The JSON export is authoritative — this document is a deterministic projection of it. Associations are conditioned on policies, seats, profiles and telemetry; they are not causal proof.\n`);

  out.push(`## Executive Summary\n`);
  for (const line of dossier.executiveSummary?.lines ?? []) out.push(`- ${line}`);
  if (!dossier.executiveSummary?.lines?.length) out.push('_No executive summary available._');
  out.push('');

  out.push(`## Build / Rules / Research Identity\n`);
  out.push(mdTable(['Field', 'Value'], [
    ['Engine', id.engineVersion], ['Rules', id.rulesVersion], ['Official rules', id.officialRulesVersion],
    ['Lab version', id.labVersion], ['Analytics schema', id.analyticsSchemaVersion], ['Lab artifact schema', id.labArtifactSchema],
    ['Authority profile', id.authorityProfile], ['Authority hash', id.authorityHash], ['Release identity hash', id.releaseIdentityHash],
    ['Capability hash', id.capabilityHash], ['Lab fingerprint', id.labFingerprint],
  ]));
  out.push(`## Evidence Scope\n`);
  const expScope = scope.experiment ?? {};
  const scopeRows = [
    ['Dataset origin', scope.datasetOrigin ?? 'unknown'],
    ['Authority profile', scope.authorityProfileId ?? 'unknown'],
    ['Experiment hash', scope.experimentHash ?? 'none'],
    ['Canonical result', scope.canonicalResultHash ?? 'none'],
    ['Lab runs', (scope.labScope?.runIds ?? []).join(', ') || 'none'],
    ['Matrices', (scope.labScope?.matrixIds ?? []).join(', ') || 'none'],
    ['Research', (scope.labScope?.experimentIds ?? []).join(', ') || 'none'],
    ['Rule mutations', (scope.labScope?.mutationExperimentIds ?? []).join(', ') || 'none'],
  ];
  if (expScope.available === true) {
    scopeRows.push(
      ['Experiment', `${expScope.experimentId ?? 'unknown'} · analysis set ${expScope.analysisSetId ?? 'unknown'}`],
      ['Experiment included', expScope.selectedExperimentIncluded === true ? 'yes' : `no${expScope.exclusionReason ? ` — ${expScope.exclusionReason}` : ''}`],
      ['Contributing runs', `${expScope.includedRunCount ?? 0} (${(expScope.includedRunIds ?? []).join(', ') || 'none'}) · ${expScope.includedGames ?? 0} games`],
      ['Recorded runs', `${expScope.totalRuns ?? 0} total · ${expScope.excludedRunCount ?? 0} excluded`],
    );
  } else {
    scopeRows.push(['Experiment', `unavailable — ${dossier.experiment?.reason ?? 'not supplied'}`]);
  }
  out.push(mdTable(['Field', 'Value'], scopeRows));
  if (dossier.experiment?.available === true && dossier.experiment.warnings?.length) {
    out.push(`Experiment compatibility warnings: ${dossier.experiment.warnings.length} run(s) differ from the contributing baseline — see JSON \`experiment.runs\` for per-run diffs.\n`);
  }

  out.push(`## Evidence Coverage\n`);
  out.push(mdTable(['Source', 'Count', 'Hash / provenance'], [
    ['Observatory summaries', ds.observatorySummaries, prov.observatoryHash?.slice(0, 16)],
    ['Detailed matches', ds.detailedMatches ?? 'unavailable (not collected)', ''],
    ['Retained replays', ds.retainedReplayCount ?? '—', ''],
    ['Campaign aggregate', ds.aggregate?.matchCount, prov.aggregateHash?.slice(0, 16)],
    ['Corpus replays', ds.corpus?.replayCount, ds.corpus?.aggregateHash?.slice(0, 16)],
    ['Certified replay index', ds.replayIndex?.replayCount, ds.replayIndex?.indexHash?.slice(0, 16)],
    ['Lab replay index', ds.autonomyIndex?.replayCount, ds.autonomyIndex?.indexHash?.slice(0, 16)],
    ['Lab runs', ds.lab?.persistedRunCount, `${ds.lab?.persistedRecords ?? 0} records`],
    ['Matrices', ds.lab?.matrixCount, ''], ['Research projects', ds.lab?.researchProjectCount, ''],
    ['Mutation experiments', ds.lab?.mutationExperimentCount, ds.lab?.mutationExperimentUnreadable ? `${ds.lab.mutationExperimentUnreadable} unreadable` : ''],
    ['Strategy sources', ds.lab?.strategySourceCount, ''],
  ]));

  out.push(`## Companion Evidence\n`);
  out.push(`_Richer evidence that exists outside this dossier — the dossier is a synthesis layer; the listed artifacts remain authoritative._\n`);
  const companions = dossier.companionArtifacts ?? {};
  const caRows = [
    ['Strategy decision evidence', companions.strategy?.available === true ? `${companions.strategy.sourceCount} source(s), ${companions.strategy.decisionEventCount} decision events (${companions.strategy.retainedDecisionEventCount} retained)` : `unavailable — ${companions.strategy?.reason ?? 'not supplied'}`, companions.strategy?.authoritativeArtifact ?? ''],
    ['Lab run envelopes', companions.runs?.available === true ? `${companions.runs.runCount} run(s): ${(companions.runs.runIds ?? []).join(', ')}` : `unavailable — ${companions.runs?.reason ?? 'not supplied'}`, companions.runs?.authoritativeArtifact ?? ''],
    ['Experiment run records', companions.experimentRuns?.available === true ? `${companions.experimentRuns.runCount} run(s) under ${companions.experimentRuns.experimentId ?? '?'} (${(companions.experimentRuns.includedRunIds ?? []).length} contributing)${companions.experimentRuns.persisted === false ? ' · session-only' : ''}` : `unavailable — ${companions.experimentRuns?.reason ?? 'not supplied'}`, companions.experimentRuns?.authoritativeArtifact ?? ''],
    ['Retained replays', companions.replays?.available === true ? `${companions.replays.retainedReplayCount} ref(s)` : `unavailable — ${companions.replays?.reason ?? 'none'}`, companions.replays?.authoritativeArtifact ?? ''],
    ['Batch matrices', companions.batchMatrices?.available === true ? `${companions.batchMatrices.matrixCount}: ${(companions.batchMatrices.matrixIds ?? []).join(', ')}` : 'none', ''],
    ['Research projects', companions.researchProjects?.available === true ? `${companions.researchProjects.projectCount}: ${(companions.researchProjects.experimentIds ?? []).join(', ')}` : 'none', ''],
    ['Rule mutations', companions.ruleMutations?.available === true ? `${companions.ruleMutations.experimentCount}: ${(companions.ruleMutations.experimentIds ?? []).join(', ')}` : 'none', ''],
  ];
  out.push(mdTable(['Domain', 'Companion evidence', 'Authoritative artifact'], caRows));

  out.push(`## Integrity & Completeness\n`);
  const ig = dossier.integrity;
  if (!ig?.completeness && !ig?.reconciliation) out.push('_Unavailable — Observatory analytics not loaded._\n');
  else {
    out.push(`- Completeness: **${ig.completeness?.status ?? 'UNKNOWN'}** (${ig.completeness?.unclassifiedCount ?? '?'} unclassified, tolerance ${ig.completeness?.tolerance ?? '?'})`);
    out.push(`- Reconciliation: invariant ${ig.reconciliation?.invariantHolds === true ? 'HOLDS' : ig.reconciliation?.invariantHolds === false ? 'VIOLATED' : 'unknown'} · ${ig.reconciliation?.unregisteredTags ?? '?'} unregistered telemetry tag(s) on tracked entities`);
    const q = ig.quarantine ?? {};
    out.push(`- Quarantine: ${q.unregisteredTags ?? (ig.quarantineLedger ?? []).length} unregistered tag(s) → ${q.quarantinedEntities ?? '?'} quarantined entit(ies)${(q.discoveryExemptUnregistered ?? 0) > 0 ? ` + ${q.discoveryExemptUnregistered} unregistered tag(s) on discovery-exempt entit(ies) (ledger-only, not quarantined)` : ''}`);
    out.push(`- Opportunity telemetry: ${ig.hasOpportunityTelemetry === true ? 'present' : ig.hasOpportunityTelemetry === false ? 'ABSENT' : 'unknown'} · legacy schema: ${ig.legacySchema === true ? 'yes' : ig.legacySchema === false ? 'no' : 'unknown'}`);
    if (ig.campaignHealth) {
      const h = ig.campaignHealth;
      out.push(`- Campaign health: ${h.trackedEntities ?? '?'} entities, ${h.entitiesWithOpportunityData ?? '?'} with opportunity data, ${h.entitiesWithAdjustedAssociation ?? '?'} with adjusted association, ${h.eligibleSynergyPairs ?? '?'} eligible synergy pairs (${h.rejectedSynergyPairs ?? 0} rejected), ${h.incompleteABBA ?? '?'} incomplete AB/BA blocks`);
    }
    out.push('');
  }

  out.push(`## Policy / Profile Performance\n`);
  const pol = mdSectionStatus(dossier.policies);
  if (pol) out.push(pol); else {
    out.push(mdTable(['Policy', 'Games', 'W-L-D', 'Win rate', 'Wilson 95%', 'Score margin'], (dossier.policies.items ?? []).map(p => [
      p.policyId, p.record?.games ?? p.games, `${p.record?.wins ?? '?'}-${p.record?.losses ?? '?'}-${p.record?.draws ?? '?'}`,
      pctText(p.record?.winRate), formatInterval(p.record?.wilson95), p.scoreMarginTotal,
    ])));
  }

  out.push(`## Rank Analysis\n`);
  const rk = mdSectionStatus(dossier.ranks);
  if (rk) out.push(rk); else {
    const rp = dossier.ranks.rankPower;
    if (rp?.ladder?.length) {
      out.push(`Balance qualification: ${rp.balanceQualification?.qualifiedCount ?? '?'}/${rp.balanceQualification?.entryCount ?? '?'} ladder entries qualified.\n`);
      out.push(mdTable(['Rank', 'RPI', 'Status', 'Confidence', 'Balance qualified', 'Integrity'], rp.ladder.map(r => [r.rank, numText(r.rpi), r.rpiStatus, r.confidence, r.balanceQualified, r.integrityStatus])));
    }
    if (rp?.watchlist?.length) out.push(`Watchlist: ${rp.watchlist.map(w => w.rank ?? w).join(', ')}\n`);
    if (dossier.ranks.swapMatrix) out.push(`Swap matrix present (${Object.keys(dossier.ranks.swapMatrix).length} keys). Ten-suit expansion ${dossier.ranks.tenSuitExpansion ? 'present' : 'absent'}.\n`);
  }

  out.push(`## Variant Analysis\n`);
  const va = mdSectionStatus(dossier.variants);
  if (va) out.push(va); else {
    const v = dossier.variants;
    const entities = (v.entities ?? []).filter(e => e.tier === 'rank');
    out.push(`${v.variantKeys?.length ?? 0} variant keys tracked${v.metricRegistryHash ? ` · metric registry ${v.metricRegistryHash.slice(0, 12)}` : ''}.\n`);
    if (entities.length) out.push(mdTable(['Rank variant', 'Win rate', 'Play rate', 'Selection power', 'Victory power', 'Confidence'], entities.map(e => {
      const m = v.variantMetrics?.[e.variantKey] ?? {}, p = v.variantPower?.[e.variantKey]?.axes ?? {};
      return [e.displayName ?? e.variantKey, pctText(m.variantWinRate), pctText(m.variantPlayRate), numText(p.selectionPower), numText(p.victoryPower), v.confidence?.[e.variantKey] ?? '—'];
    })));
    out.push('_Per-participant, per-seat, per-profile and sensitivity metrics are in the JSON `variants` section._\n');
  }

  out.push(`## Mechanics\n`);
  const mc = mdSectionStatus(dossier.mechanics);
  if (mc) out.push(mc); else {
    const items = dossier.mechanics.items ?? [];
    const quarantined = items.filter(m => m.quarantined).length;
    out.push(`${items.length} tracked entities (${quarantined} quarantined). Top by legal-opportunity count:\n`);
    out.push(mdTable(['Mechanic', 'Category', 'Pick rate', 'Opportunities', 'Adj. win assoc', '95% CI', 'q-value', 'Grade', 'Quarantined'],
      [...items].sort((a, b) => (b.legalOpportunityCount ?? 0) - (a.legalOpportunityCount ?? 0)).slice(0, 40).map(m => [
        m.displayName ?? m.mechanic, m.category, pctText(m.pickRateWhenLegal), m.legalOpportunityCount,
        numText(m.adjustedWinAssociation), formatInterval(m.adjustedWinAssociation95), numText(m.associationQValue), m.evidenceGrade ?? '—', m.quarantined ? 'yes' : 'no',
      ])));
    if (items.length > 40) out.push(`_${items.length - 40} additional mechanics in the JSON export._\n`);
  }

  out.push(`## Combo Atlas\n`);
  const cb = mdSectionStatus(dossier.combo);
  if (cb) out.push(cb); else {
    const c = dossier.combo, t = c.totals ?? {}, cov = c.coverage ?? {};
    out.push(`Canonical Combo (§8) analytics — lifecycle coverage **${cov.lifecycleStatus ?? 'unknown'}** (${cov.lifecycleCoveredMatches ?? '?'}/${cov.matches ?? '?'} matches); broken-by-4♥ is ${cov.brokenStatus ?? 'unknown'}${cov.brokenReason ? ` — ${cov.brokenReason}` : ''}.\n`);
    out.push(mdTable(['Metric', 'Value'], [
      ['Legal opportunities', t.opportunities], ['Declarations', t.declarations],
      ['Pick rate', pctText(t.pickRate)], ['Resolved', t.resolved], ['Countered', t.countered],
      ['Fizzled', t.fizzled], ['Broken (4♥)', cov.brokenStatus === 'unavailable' ? 'n/a' : t.broken],
      ['Resolve rate', pctText(t.resolveRate)], ['Games with ≥1 Combo', t.gamesWithCombo],
      ['Combos per game', numText(t.combosPerGame)], ['Raw win assoc', numText(t.rawWinAssociation)],
      ['Adj. win assoc', numText(t.adjustedWinAssociation)],
    ]));
    const recipes = c.recipes ?? [];
    if (recipes.length) {
      out.push(`### Recipes\n`);
      out.push(mdTable(['Recipe', 'Uses', 'Opportunities', 'Pick%', 'Resolve%', 'Adj. assoc', 'Grade'], recipes.slice(0, 30).map(r => [
        r.label ?? r.recipeId, r.uses, r.opportunities, pctText(r.pickRate), pctText(r.resolveRate), numText(r.adjustedAssociation), r.evidenceGrade ?? '—',
      ])));
      if (recipes.length > 30) out.push(`_${recipes.length - 30} additional recipes in the JSON export._\n`);
    }
    const policies = c.policies ?? [];
    if (policies.length) {
      out.push(`### Combo propensity by policy\n`);
      out.push(mdTable(['Policy', 'Opportunities', 'Declared', 'Propensity', 'Resolve%', 'Win%'], policies.map(p => [
        p.policyId, p.opportunities, p.declarations, pctText(p.comboPropensity), pctText(p.resolveRate), pctText(p.winRate),
      ])));
    }
    for (const lim of c.limitations ?? []) out.push(`- _${lim}_`);
    out.push('');
  }

  out.push(`## Synergies & Anti-Synergies\n`);
  const sy = mdSectionStatus(dossier.synergies);
  if (sy) out.push(sy); else {
    const items = dossier.synergies.items ?? [];
    out.push(items.length ? mdTable(['Pair', 'Class', 'Model OR', 'Shrunk OR', 'Agreement'], items.map(s => [
      s.displayName ?? `${s.source}×${s.target}`, s.relationshipClass, numText(s.modelOR), numText(s.shrunkOR), s.directionAgreement,
    ])) : '_No modelled synergy pairs._\n');
    const rej = dossier.integrity?.campaignHealth?.rejectedSynergyPairs;
    if (rej != null) out.push(`${rej} candidate pair(s) rejected/unmodelled — see integrity section for status counts.\n`);
  }

  out.push(`## Motifs / Repeated Patterns\n`);
  const mt = mdSectionStatus(dossier.motifs);
  if (mt) out.push(mt); else {
    const items = dossier.motifs.items ?? [];
    out.push(items.length ? mdTable(['Motif', 'Count', 'Outcomes'], [...items].sort((a, b) => (b.count ?? 0) - (a.count ?? 0)).slice(0, 30).map(m => [
      m.motif, m.count, Object.entries(m.outcomes ?? {}).map(([k, v]) => `${k}:${v}`).join(' '),
    ])) : '_No motifs._\n');
    if (items.length > 30) out.push(`_${items.length - 30} additional motifs in the JSON export._\n`);
  }

  out.push(`## AB/BA & Seat Effects\n`);
  const pa = mdSectionStatus(dossier.pairedAnalysis);
  if (pa) out.push(pa); else {
    const abba = dossier.pairedAnalysis;
    out.push(`Design: ${abba.design ?? 'unknown'} · ${abba.totalPairedBlocks ?? 0} complete paired blocks · ${abba.incompletePairs ?? 0} incomplete · pairing by ${abba.hasPairedRunIds ? 'pairedRunId' : 'policy-pair block (legacy)'}\n`);
    if (abba.scheduleNote) out.push(`> ${abba.scheduleNote}\n`);
    if (abba.pairResults?.length) out.push(mdTable(['Pair', 'Blocks', 'Seat-swap verified', 'McNemar p', 'Interpretation'], abba.pairResults.map(r => [
      r.policyPair, r.pairedBlocks, r.seatSwapVerified, numText(r.mcnemar?.pValue), r.interpretation,
    ])));
  }

  out.push(`## Choice Analysis\n`);
  const choiceStatus = mdSectionStatus(dossier.choiceAnalysis);
  if (choiceStatus) out.push(choiceStatus); else {
    const c = dossier.choiceAnalysis.coverage ?? {};
    out.push(`Coverage: ${c.decisionsUsable ?? '?'}/${c.decisionsSeen ?? '?'} usable decision frames (${c.multiOptionDecisions ?? '?'} multi-option). ${dossier.choiceAnalysis.contextCount ?? 0} contexts, ${Object.keys(dossier.choiceAnalysis.entities ?? {}).length} entities.\n`);
    if (dossier.choiceAnalysis.contractNote) out.push(`> ${dossier.choiceAnalysis.contractNote}\n`);
  }

  out.push(`## Strategy Analysis\n`);
  const st = mdSectionStatus(dossier.strategy);
  if (st) out.push(st); else {
    const s = dossier.strategy;
    out.push(`Evidence corpus: ${s.sourceCount} source(s), ${s.decisionEventTotal} decision events (${s.retainedEventTotal} retained rows). Origins: ${Object.entries(s.origins ?? {}).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}. Fidelities: ${Object.entries(s.fidelities ?? {}).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}.\n`);
    if (s.storeCounts) out.push(`Stores: ${Object.entries(s.storeCounts).map(([k, v]) => `${k}=${v}`).join(', ')}\n`);
    out.push(`> ${s.scopeNote}\n`);
    const strat = dossier.arena?.strategy;
    if (strat) out.push(`Arena strategic telemetry is reported under Arena Results.\n`);
  }

  out.push(`## Arena Results\n`);
  const ar = mdSectionStatus(dossier.arena);
  if (ar) out.push(ar); else {
    const a = dossier.arena, s = a.summary ?? {};
    out.push(`Accepted ${s.accepted ?? '?'}/${s.requested ?? '?'} games · clean ${s.clean ?? '?'} · faults ${s.faults ?? '?'} · telemetry games ${a.telemetryGames ?? '?'}\n`);
    out.push(mdTable(['Seat', 'Games', 'A wins', 'B wins', 'Draws'], (a.seats ?? []).map(x => [x.label, x.n, x.A, x.B, x.Draw])));
    if (a.pairs?.n) out.push(`Paired score: ${pctText(a.pairs.score)} ± 95% bound → interval ${formatInterval(a.pairs.interval)} over ${a.pairs.n} pairs (${a.pairs.incompleteGames ?? 0} incomplete games).\n`);
    out.push(`Policy fingerprint distance A↔B: ${numText(a.similarityDistance)}\n`);
    if (a.terminations?.length) out.push(`Terminations: ${a.terminations.map(t => `${t.key}=${t.count}`).join(', ')}\n`);
    const stratA = a.strategy?.A, stratB = a.strategy?.B;
    if (stratA || stratB) {
      out.push(`### Strategic telemetry\n`);
      out.push(mdTable(['Bot', 'Games', 'Immediate conversion', 'Deferred conversion', 'Declined value mean', 'Win rate in decline games'], ['A', 'B'].map(k => {
        const b = a.strategy?.[k] ?? {};
        return [k, b.games, pctText(b.immediateConversion), pctText(b.deferredConversion), numText(b.meanDeclinedValue), pctText(b.winRateInDeclineGames)];
      })));
    }
    const unexpected = (a.diagnostics ?? []).filter(d => d.status === 'UNEXPECTED');
    if (unexpected.length) out.push(`**${unexpected.length} UNEXPECTED winner-score diagnostic(s)** — see JSON diagnostics.\n`);
  }

  out.push(`## Batch Experiment Results\n`);
  const matrices = dossier.batchExperiments?.matrices ?? [];
  if (!matrices.length) out.push('_No batch matrices._\n');
  else for (const m of matrices) {
    out.push(`### Matrix ${m.matrixId ?? 'unidentified'} — ${m.status ?? 'unknown'}${m.verified === false ? ` (view verification failed: ${m.verificationError})` : ''}\n`);
    out.push(`${m.cellsComplete ?? 0}/${m.cellsTotal ?? '?'} cells complete · ${m.acceptedGames ?? 0} accepted games\n`);
    if (m.leaderboard?.length) out.push(mdTable(['Rank', 'Participant', 'Games', 'W-L-D', 'Score rate'], m.leaderboard.map(r => [r.rank, r.displayName ?? r.participantId, r.games, `${r.wins}-${r.losses}-${r.draws}`, pctText(r.scoreRate)])));
    if (m.cells?.length) out.push(mdTable(['Cell', 'Status', 'Records', 'A-B-Draw'], m.cells.map(c => [`${c.displayA} vs ${c.displayB}`, c.status, c.records, `${c.metrics?.winsA ?? '?'}-${c.metrics?.winsB ?? '?'}-${c.metrics?.draws ?? '?'}`])));
    if (m.runRefs?.length) out.push(`Run refs: ${m.runRefs.map(r => r.runId).filter(Boolean).join(', ')}\n`);
  }

  out.push(`## Evolution / Learning Results\n`);
  const projects = dossier.evolution?.researchProjects ?? [];
  if (!projects.length) out.push('_No research projects._\n');
  else for (const p of projects) {
    out.push(`### ${p.name ?? p.experimentId} — ${p.status ?? 'unknown'} (${p.type ?? 'unknown type'})\n`);
    if (p.hypothesis) out.push(`> Hypothesis: ${p.hypothesis}\n`);
    out.push(`${p.checkpointCount} checkpoints · ${p.generationCount} generations · ${p.evaluationCount} evaluations (${p.completedEvaluations} complete) · ${p.regressionCount} regressions · ${p.faultCount} faults\n`);
    if (p.leaderboard?.length) out.push(mdTable(['Checkpoint', 'Gen', 'Lineage', 'Evaluation', 'Matchup metrics'], p.leaderboard.map(r => [
      r.checkpointId?.slice(0, 18), r.generation, r.lineageId?.slice(0, 12), r.evaluationStatus,
      r.matchups.map(m => `${m.opponent}: ${m.metrics ? JSON.stringify(m.metrics) : '—'}`).join('; '),
    ])));
  }
  const runs = dossier.evolution?.runs ?? [];
  if (runs.length) {
    out.push(`### Run artifacts\n`);
    out.push(mdTable(['Run', 'Kind', 'Status', 'Games', 'Clean', 'A-B-D', 'Paired score', 'Origin', 'Historical'], runs.map(r => [
      r.runId, r.kind ?? r.config?.kind, r.status, r.metrics?.games ?? 0, r.metrics?.clean ?? 0,
      `${r.metrics?.winsA ?? '?'}-${r.metrics?.winsB ?? '?'}-${r.metrics?.draws ?? '?'}`,
      r.metrics?.pairedScore != null ? `${pctText(r.metrics.pairedScore)} ${formatInterval(r.metrics.pairedScoreInterval95)}` : '—',
      r.evidenceOrigin, r.historical === null ? 'unknown' : r.historical,
    ])));
  }

  out.push(`## Rule Mutation Experiments\n`);
  const muts = dossier.evolution?.ruleMutations ?? [];
  if (!muts.length) out.push('_No rule-mutation experiments persisted._\n');
  else {
    for (const m of muts) {
      if (m.unavailable === true) {
        out.push(`### ${m.experimentId ?? 'unreadable'} — UNREADABLE\n`);
        out.push(`> ${m.reason ?? 'Persisted envelope failed validation.'}\n`);
        continue;
      }
      const mut = m.mutation ?? {};
      out.push(`### ${m.experimentId} — ${m.status ?? 'unknown'}${m.outcome?.verdict ? ` · verdict ${m.outcome.verdict}${m.outcome.provisional ? ' (provisional)' : ''}` : ''}\n`);
      out.push(`Mutation: ${mut.label ?? mut.targetId ?? '?'} (${mut.targetId ?? '?'}: ${mut.baselineValue ?? '?'} → ${mut.mutatedValue ?? '?'}) · created ${m.createdAt ?? 'unknown'} · origin ${m.evidenceOrigin ?? 'LOCAL'}\n`);
      if (m.baseline) out.push(`Authority: engine ${m.baseline.engineVersion ?? '?'} · rules ${m.baseline.rulesVersion ?? '?'} · lab ${m.baseline.labVersion ?? '?'} · profile ${m.baseline.profileId ?? '?'}\n`);
      if (m.hypothesis) out.push(`> Hypothesis: ${m.hypothesis}\n`);
      const obj = m.config?.objective;
      out.push(`Objective: ${obj ? `${obj.direction} ${obj.metric ?? ''}${obj.minimumMeaningfulEffect ? ` (min Δ ${obj.minimumMeaningfulEffect})` : ''}` : 'exploratory (no predeclared direction — supported movement is never reported as beneficial)'}\n`);
      const ex = m.execution;
      if (ex) out.push(`Execution: ${ex.completedSpecCount ?? '?'}/${ex.plannedSpecCount ?? '?'} specs · exact ledger ${ex.ledgerExact === true ? 'YES' : 'NO'} · exact pairing ${ex.pairedExact === true ? 'YES' : 'NO'} · coverage ${pctText(ex.pairedCoverage)}/${pctText(ex.pairedMutantCoverage)}${ex.ledgerFaults ? ` · ${ex.ledgerFaults} worker fault(s)` : ''}${ex.cancelled ? ' · CANCELLED' : ''}\n`);
      const ac = m.arms?.control, am = m.arms?.mutant;
      if (ac || am) out.push(mdTable(['Arm', 'Games', 'Decisive', 'Draws', 'Aborts', 'Seat-1 win rate (self-play)', 'Mean turns'], [
        ['control', ac?.games, ac?.decisive, ac?.draws, ac?.aborted, pctText(ac?.seat1WinRate), numText(ac?.meanTurns)],
        ['mutant', am?.games, am?.decisive, am?.draws, am?.aborted, pctText(am?.seat1WinRate), numText(am?.meanTurns)],
      ]));
      if (m.impactRows?.length) out.push(mdTable(['Metric', 'Control', 'Mutant', 'Δ', '95% CI', 'p', 'n(c/m)', 'Grade'], m.impactRows.map(r => [
        r.label ?? r.key, numText(r.control), numText(r.mutant), numText(r.delta), formatInterval(r.interval), numText(r.pValue), `${r.n?.control ?? '?'}/${r.n?.mutant ?? '?'}`, r.grade ?? '—',
      ])));
      if (m.regressions?.findings?.length) out.push(`Regressions: ${m.regressions.findings.map(f => `${f.code ?? '?'} (${f.severity ?? '?'})`).join(', ')}\n`);
      else if (m.regressions) out.push(`Regressions: ${m.regressions.status ?? 'CLEAR'} (${m.regressions.checked?.length ?? 0} checks run)\n`);
      if (m.outcome?.reasons?.length) for (const r of m.outcome.reasons) out.push(`- ${r}`);
      out.push('');
    }
  }

  out.push(`## Anomalies\n`);
  const an = dossier.anomalies;
  if (!an?.items?.length) out.push('_No anomalies flagged._\n');
  else out.push(mdTable(['Type', 'Severity', 'Match', 'Value', 'Baseline', 'Detail'], an.items.map(a => [a.type, a.severity, a.matchId, a.value, a.baseline, a.detail])));

  out.push(`## Statistical Uncertainty\n`);
  for (const u of dossier.uncertainties ?? []) out.push(`- **${u.domain}:** ${u.uncertainty}`);
  if (!dossier.uncertainties?.length) out.push('_No uncertainty statements recorded._');
  out.push('');

  out.push(`## Findings\n`);
  const findings = dossier.findings ?? [];
  const byStatus = {};
  for (const f of findings) (byStatus[f.status ?? 'unrecorded'] ??= []).push(f);
  if (!findings.length) out.push('_No normalized findings._\n');
  for (const [status, list] of Object.entries(byStatus).sort(([a], [b]) => a.localeCompare(b))) {
    out.push(`### ${status} (${list.length})\n`);
    out.push(mdTable(['Domain', 'Subject', 'Claim', 'Effect', 'CI', 'p', 'q', 'n', 'Grade'], list.map(f => [
      f.domain, f.subject, f.claim, numText(f.effect), formatInterval(f.confidenceInterval), numText(f.pValue), numText(f.qValue), f.sampleSize, f.evidenceGrade ?? '—',
    ])));
  }

  out.push(`## Recommendations\n`);
  for (const r of dossier.recommendations ?? []) out.push(`- ${r}`);
  out.push('');

  out.push(`## Open Questions\n`);
  for (const q of dossier.openQuestions ?? []) out.push(`- ${q}`);
  if (!dossier.openQuestions?.length) out.push('_None recorded._');
  out.push('');

  out.push(`## Evidence Gaps\n`);
  const gaps = dossier.evidenceGaps ?? [];
  out.push(gaps.length ? mdTable(['Domain', 'Gap', 'Severity', 'Suggested evidence'], gaps.map(g => [g.domain, g.gap, g.severity, g.suggestedEvidence])) : '_None recorded._\n');

  out.push(`## Interpretation Boundaries\n`);
  for (const b of dossier.interpretationBoundaries ?? []) out.push(`- ${b}`);
  out.push('');

  out.push(`## Provenance\n`);
  out.push(mdTable(['Field', 'Value'], [
    ['Observatory hash', prov.observatoryHash], ['Aggregate hash', prov.aggregateHash],
    ['Evidence epoch', prov.evidenceEpoch], ['Post-rules parity repair', prov.postRulesParityRepair],
    ['Source hashes', prov.sourceHashes ? JSON.stringify(prov.sourceHashes) : null],
    ['Extract hash', prov.extractHash], ['Replay index hash', prov.replayIndexHash], ['Lab replay index hash', prov.labReplayIndexHash],
  ]));
  const artifacts = prov.artifacts ?? {};
  if (artifacts.runs?.length) out.push(`Run artifacts: ${artifacts.runs.map(r => `${r.runId}${r.historical ? ' (historical)' : ''}${r.contentHash ? ` hash=${r.contentHash.slice(0, 12)}` : ''}`).join(', ')}\n`);
  if (artifacts.matrices?.length) out.push(`Matrix artifacts: ${artifacts.matrices.map(m => `${m.matrixId} (${m.status})`).join(', ')}\n`);
  if (artifacts.research?.length) out.push(`Research artifacts: ${artifacts.research.map(p => p.experimentId).join(', ')}\n`);
  if (artifacts.mutations?.length) out.push(`Mutation artifacts: ${artifacts.mutations.map(m => `${m.experimentId} (${m.status}${m.evidenceOrigin === 'IMPORTED_UNVERIFIED' ? ', imported-unverified' : ''})`).join(', ')}\n`);

  if (dossier.unavailable?.length) {
    out.push(`## Unavailable Domains\n`);
    out.push(mdTable(['Domain', 'Reason'], dossier.unavailable.map(u => [u.domain, u.reason])));
  }

  out.push(`## Structured Appendix\n`);
  out.push(`The authoritative machine-readable content (full mechanic rows, synergy diagnostics, metric registry, choice entities, run record rows, and the analysis extract) is in the JSON export — this Markdown is a faithful projection of the same object.\n`);
  out.push(`- Metric registry entries: ${Object.keys(dossier.metricRegistry ?? {}).length}`);
  out.push(`- Rank anatomy registry: ${dossier.rankAnatomyRegistry ? 'present' : 'absent'}`);
  out.push(`- Analysis extract embedded: ${dossier.analysisExtract ? `yes (extractHash ${dossier.analysisExtract.extractHash ?? 'n/a'})` : 'no'}`);
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}
