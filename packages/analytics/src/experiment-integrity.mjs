// experiment-integrity.mjs — experiment self-audit + descriptive diagnostics.
//
// Produces the "EXPERIMENT INTEGRITY" trust dashboard for research packages:
// every check reports PASS / WARN / FAIL / NOT_TESTED / NOT_APPLICABLE /
// INSUFFICIENT and is derived from the exported evidence itself — nothing is
// marked PASS unless the data actually proves it. Also contains the
// descriptive diagnostics (early-victory, decisiveness) that turn corpus
// oddities into analyzable signals instead of guesses.
//
// Status contract:
//   PASS           — the check's obligations were positively established.
//   WARN           — a meaningful concern or a limited qualification.
//   FAIL           — a demonstrated invariant violation.
//   INSUFFICIENT   — the evidence cannot support the requested conclusion
//                    (missing/empty/malformed inputs are never successes).
//   NOT_TESTED     — the required verification was not performed.
//   NOT_APPLICABLE — legitimately outside scope for this corpus (explicit
//                    applicability contract, e.g. no paired-design rows).
//
// Aggregation: FAIL dominates; any required check left NOT_TESTED or
// INSUFFICIENT blocks PASS and yields INSUFFICIENT; any WARN yields WARN.
// PASS requires at least one required check to have passed. An empty or
// non-evidenced corpus can therefore never produce a headline PASS.
//
// Mirrored verbatim into apps/lab-web/dist/shared-analytics — pure data only.

export const EXPERIMENT_INTEGRITY_SCHEMA = '1.1.0';

export const INTEGRITY_STATUS = Object.freeze({
  PASS: 'PASS',
  WARN: 'WARN',
  FAIL: 'FAIL',
  INSUFFICIENT: 'INSUFFICIENT',
  NOT_TESTED: 'NOT_TESTED',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
});

const num = (v) => (Number.isFinite(v) ? v : 0);
const pct = (a, b) => (b ? Math.round((a / b) * 10000) / 10000 : null);
// `required` marks checks that gate the headline. Optional checks (design
// metadata, advisory diagnostics) may inform but can never carry a PASS.
const check = (status, detail, { required = true, ...extra } = {}) => ({ status, detail, required, ...extra });

function uniqueCounts(rows, key) {
  const seen = new Set();
  let missing = 0;
  let duplicates = 0;
  for (const row of rows) {
    const v = row?.[key];
    if (v == null) { missing += 1; continue; }
    if (seen.has(v)) duplicates += 1; else seen.add(v);
  }
  return { unique: seen.size, missing, duplicates };
}

/** Deterministic sample identity of a summary row (R01 contract). */
function sampleIdOf(row) {
  return row?.identity?.deterministicSampleId ?? row?.matchId ?? null;
}

/**
 * Compact trust dashboard for an exported corpus.
 * @param {Array} summaries
 * @param {{ aggregate?: object | null, pairedABBA?: object | null, combo?: object | null,
 *           design?: { seedStrategy?: string | null } | null }} [ctx]
 */
export function buildExperimentIntegrity(summaries, { aggregate = null, pairedABBA = null, combo = null, design = null } = {}) {
  const rows = summaries ?? [];
  const matches = rows.length;
  const ids = uniqueCounts(rows, 'matchId');
  const ordinals = uniqueCounts(rows, 'matchOrdinal');
  const seeds = uniqueCounts(rows, 'seed');

  const checks = {};

  // ── Identity completeness ──────────────────────────────────────
  // A missing identifier is not "unique" — absent values can never produce
  // a positive uniqueness result. Empty corpora cannot PASS either.
  checks.uniqueMatchIds = check(
    matches === 0 || ids.missing > 0 ? INTEGRITY_STATUS.INSUFFICIENT
      : ids.duplicates > 0 ? INTEGRITY_STATUS.FAIL : INTEGRITY_STATUS.PASS,
    matches === 0 ? 'No matches to evaluate'
      : ids.missing > 0 ? `${ids.missing}/${matches} rows lack a matchId — uniqueness cannot be established`
        : `${ids.unique}/${matches} unique match IDs${ids.duplicates ? ` (${ids.duplicates} duplicates)` : ''}`,
    { unique: ids.unique, duplicates: ids.duplicates, missing: ids.missing },
  );
  checks.uniqueOrdinals = check(
    matches === 0 || ordinals.missing > 0 ? INTEGRITY_STATUS.INSUFFICIENT
      : ordinals.duplicates > 0 ? INTEGRITY_STATUS.WARN : INTEGRITY_STATUS.PASS,
    matches === 0 ? 'No matches to evaluate'
      : ordinals.missing > 0 ? `${ordinals.missing}/${matches} rows lack a matchOrdinal — ordering cannot be established`
        : `${ordinals.unique}/${matches} unique ordinals${ordinals.duplicates ? ` (${ordinals.duplicates} duplicates)` : ''}`,
    { unique: ordinals.unique, duplicates: ordinals.duplicates, missing: ordinals.missing },
  );

  // Seed reuse is design-aware: a declared fixed-seed design or within-pair
  // seed sharing is an intentional qualification (WARN), while unexplained
  // seed collisions across distinct executions weaken sample independence
  // (FAIL beyond a small tolerance).
  const seedReuse = new Map();
  for (const row of rows) {
    if (row?.seed == null) continue;
    seedReuse.set(row.seed, (seedReuse.get(row.seed) ?? []).concat(row));
  }
  let withinPairSeedReuse = 0;
  let unexplainedSeedReuse = 0;
  for (const group of seedReuse.values()) {
    if (group.length < 2) continue;
    const pairIds = new Set(group.map((r) => r?.pairedRunId ?? null));
    if (pairIds.size === 1 && !pairIds.has(null)) withinPairSeedReuse += group.length - 1;
    else unexplainedSeedReuse += group.length - 1;
  }
  const declaredFixedSeed = design?.seedStrategy === 'fixed'
    || /fixed/i.test(String(aggregate?.experimentDesign?.seedPolicy ?? ''));
  checks.seedProvenance = check(
    matches === 0 || seeds.missing > 0 ? INTEGRITY_STATUS.INSUFFICIENT
      : seeds.duplicates === 0 ? INTEGRITY_STATUS.PASS
        : unexplainedSeedReuse > 0
          ? (unexplainedSeedReuse <= Math.max(1, Math.floor(matches * 0.01)) ? INTEGRITY_STATUS.WARN : INTEGRITY_STATUS.FAIL)
          : INTEGRITY_STATUS.WARN, // declared fixed-seed or within-pair reuse — intentional but not independent
    seeds.missing > 0 ? `${seeds.missing}/${matches} rows lack seed provenance`
      : seeds.duplicates === 0 ? `${seeds.unique}/${matches} unique seeds`
        : unexplainedSeedReuse > 0
          ? `${seeds.unique}/${matches} unique seeds — ${unexplainedSeedReuse} unexplained reuse(s) across distinct executions`
          : `${seeds.unique}/${matches} unique seeds — ${withinPairSeedReuse} intentional reuse(s) (${declaredFixedSeed ? 'declared fixed-seed design' : 'within paired blocks'}); reused seeds are not independent samples`,
    { unique: seeds.unique, duplicates: seeds.duplicates, missing: seeds.missing, withinPairReuse: withinPairSeedReuse, unexplainedReuse: unexplainedSeedReuse, declaredFixedSeed },
  );

  // ── Executable/sample identity (R01) ───────────────────────────
  // A unique label or hash does not establish what executed. The versioned
  // identity record carries the executable subject hash and the deterministic
  // sample identity; corpora without it cannot prove subject distinctness
  // or sample independence from this artifact alone.
  const executableKnown = rows.filter((r) => r?.identity?.executableHash != null);
  const matchIdExecutableConflicts = new Map();
  for (const r of executableKnown) {
    const k = r.matchId;
    const prev = matchIdExecutableConflicts.get(k);
    if (prev === undefined) matchIdExecutableConflicts.set(k, r.identity.executableHash);
    else if (prev !== r.identity.executableHash) matchIdExecutableConflicts.set(k, Symbol('conflict'));
  }
  const executableConflicts = [...matchIdExecutableConflicts.values()].filter((v) => typeof v === 'symbol').length;
  checks.executableIdentity = check(
    matches === 0 ? INTEGRITY_STATUS.INSUFFICIENT
      : executableConflicts > 0 ? INTEGRITY_STATUS.FAIL
        : executableKnown.length === 0
          ? INTEGRITY_STATUS.INSUFFICIENT
          : executableKnown.length === matches ? INTEGRITY_STATUS.PASS : INTEGRITY_STATUS.WARN,
    executableConflicts > 0
      ? `${executableConflicts} matchId value(s) map to distinct executable identities — subject collapse`
      : executableKnown.length === 0
        ? 'No executable identity recorded — policy labels cannot establish what actually decided'
        : executableKnown.length === matches
          ? 'Every row carries a versioned executable identity'
          : `${executableKnown.length}/${matches} rows carry an executable identity — remainder unprovable`,
    { executableKnown: executableKnown.length, executableConflicts },
  );

  // Sample independence: executions of the same deterministic sample are
  // repeats, not new evidence. Conflicting outcome digests for the same
  // complete sample identity are integrity failures.
  const bySample = new Map();
  for (const row of rows) {
    const sid = sampleIdOf(row);
    if (sid == null) continue;
    if (!bySample.has(sid)) bySample.set(sid, []);
    bySample.get(sid).push(row);
  }
  let repeatedExecutions = 0;
  let digestConflicts = 0;
  for (const group of bySample.values()) {
    if (group.length > 1) repeatedExecutions += group.length - 1;
    const digests = new Set(group.map((r) => r?.matchResultHash ?? null));
    digests.delete(null);
    if (digests.size > 1) digestConflicts += 1;
  }
  const independentSamples = bySample.size;
  checks.sampleIndependence = check(
    matches === 0 ? INTEGRITY_STATUS.INSUFFICIENT
      : digestConflicts > 0 ? INTEGRITY_STATUS.FAIL
        : repeatedExecutions > 0 ? INTEGRITY_STATUS.WARN : INTEGRITY_STATUS.PASS,
    matches === 0 ? 'No samples to evaluate'
      : digestConflicts > 0
        ? `${digestConflicts} sample identit${digestConflicts === 1 ? 'y has' : 'ies have'} conflicting outcome digests — integrity failure`
        : repeatedExecutions > 0
          ? `${independentSamples} independent samples behind ${matches} executions — repeats do not increase effective sample size`
          : `${independentSamples} independent samples — one execution each`,
    { independentSamples, executions: matches, repeatedExecutions, digestConflicts },
  );

  // ── Design checks ──────────────────────────────────────────────
  const legTagged = rows.filter((r) => r?.pairedLeg === 'AB' || r?.pairedLeg === 'BA').length;
  const pairTagged = rows.filter((r) => r?.pairedRunId != null).length;
  // The paired-design checks are required only when the corpus claims paired
  // structure — an unpaired corpus cannot fail a design it never claimed.
  const designClaimed = legTagged > 0 || pairTagged > 0;

  checks.designMetadata = check(
    matches === 0 ? INTEGRITY_STATUS.NOT_APPLICABLE
      : legTagged === matches ? INTEGRITY_STATUS.PASS
        : legTagged === 0 ? INTEGRITY_STATUS.NOT_APPLICABLE
          : INTEGRITY_STATUS.WARN,
    legTagged === matches
      ? 'All rows carry explicit AB/BA leg metadata'
      : legTagged === 0
        ? 'No explicit leg metadata (legacy schedule — orientation inferred)'
        : `${legTagged}/${matches} rows carry explicit leg metadata`,
    { required: false, rowsWithLegMetadata: legTagged },
  );

  if (pairedABBA) {
    const ds = pairedABBA.designStatus ?? 'not-applicable';
    checks.pairedDesign = check(
      ds === 'verified' ? INTEGRITY_STATUS.PASS
        : ds === 'not-applicable' ? (designClaimed ? INTEGRITY_STATUS.INSUFFICIENT : INTEGRITY_STATUS.NOT_APPLICABLE)
          : ds === 'malformed' ? INTEGRITY_STATUS.FAIL : INTEGRITY_STATUS.WARN,
      ds === 'verified'
        ? `Paired design verified — ${pairedABBA.totalPairedBlocks} complete AB/BA block(s)`
        : ds === 'malformed'
          ? `Malformed paired design — ${pairedABBA.malformedBlocks} block(s) failed policy↔seat verification`
          : ds === 'unverified'
            ? `Paired structure incomplete — ${pairedABBA.totalPairedBlocks} verified block(s), ${pairedABBA.incompletePairs} incomplete, ${pairedABBA.malformedBlocks} malformed`
            : designClaimed ? 'Corpus claims paired structure but no complete block verified' : 'No paired structure detected',
      { required: designClaimed, completePairs: pairedABBA.totalPairedBlocks ?? 0, incompletePairs: pairedABBA.incompletePairs ?? 0, malformedBlocks: pairedABBA.malformedBlocks ?? 0, malformedReasons: pairedABBA.malformedReasons ?? {} },
    );
    // Exposure balance is a DESIGN property (did each policy occupy each seat
    // equally?). It is evaluated independently of any statistical test.
    const exposures = (pairedABBA.pairResults ?? []).flatMap((r) => Object.entries(r.seatExposure ?? {}));
    const imbalanced = exposures.filter(([, e]) => e.seat1 !== e.seat2);
    checks.policySeatExposure = check(
      ds === 'not-applicable' || !exposures.length ? (designClaimed ? INTEGRITY_STATUS.INSUFFICIENT : INTEGRITY_STATUS.NOT_APPLICABLE)
        : imbalanced.length === 0 ? INTEGRITY_STATUS.PASS : INTEGRITY_STATUS.FAIL,
      !exposures.length ? 'No seat exposure data'
        : imbalanced.length === 0
          ? 'Every policy occupies each seat equally across its matchup'
          : `${imbalanced.length} policy↔matchup exposure imbalance(s): ${imbalanced.slice(0, 4).map(([p, e]) => `${p} seat1=${e.seat1}/seat2=${e.seat2}`).join('; ')}`,
      { required: designClaimed },
    );
    // The seat-effect check evaluates the OBSERVED seat win-rate difference.
    // A non-significant sign test is NOT proof of balance — equivalence
    // requires a separately justified equivalence framework. Small decisive
    // counts are INSUFFICIENT, never silently "balanced".
    const sb = pairedABBA.seatBalance;
    const sbStatus = sb?.status ?? null;
    checks.seatEffect = check(
      !sb || sbStatus === 'not-applicable' ? (designClaimed ? INTEGRITY_STATUS.INSUFFICIENT : INTEGRITY_STATUS.NOT_APPLICABLE)
        : sbStatus === 'insufficient-data' ? INTEGRITY_STATUS.INSUFFICIENT
          : sbStatus === 'seat-effect-detected' ? INTEGRITY_STATUS.WARN
            : INTEGRITY_STATUS.PASS, // 'no-significant-seat-effect' — evaluated, none detected (not proof of equivalence)
      !sb || sbStatus === 'not-applicable'
        ? 'No decisive legs in verified pairs'
        : sbStatus === 'insufficient-data'
          ? `Only ${sb.decisiveLegs} decisive legs — too few to detect even a large seat effect`
          : sbStatus === 'seat-effect-detected'
            ? `Detected seat effect: seat 1 won ${sb.seat1Wins}/${sb.decisiveLegs} decisive legs (p=${sb.signTest?.pValue ?? '—'}) — seat-controlled inference is confounded`
            : `No significant seat effect detected: seat 1 ${sb.seat1Wins}W vs seat 2 ${sb.seat2Wins}W over ${sb.decisiveLegs} decisive legs (p=${sb.signTest?.pValue ?? '—'}) — absence of evidence, not proof of equivalence`,
      { required: designClaimed, seat1Wins: sb?.seat1Wins, seat2Wins: sb?.seat2Wins, decisiveLegs: sb?.decisiveLegs, seat1WinRate: sb?.seat1WinRate, signTestPValue: sb?.signTest?.pValue ?? null, seatExposureBalanced: pairedABBA.seatExposureBalanced ?? null },
    );
  } else {
    checks.pairedDesign = check(
      designClaimed ? INTEGRITY_STATUS.NOT_TESTED : INTEGRITY_STATUS.NOT_APPLICABLE,
      designClaimed ? 'Corpus claims paired structure but paired analysis was not supplied' : 'No paired-design claim',
      { required: designClaimed },
    );
    checks.policySeatExposure = check(
      designClaimed ? INTEGRITY_STATUS.NOT_TESTED : INTEGRITY_STATUS.NOT_APPLICABLE,
      designClaimed ? 'Paired analysis not supplied' : 'No paired-design claim',
      { required: designClaimed },
    );
    checks.seatEffect = check(
      designClaimed ? INTEGRITY_STATUS.NOT_TESTED : INTEGRITY_STATUS.NOT_APPLICABLE,
      designClaimed ? 'Paired analysis not supplied' : 'No paired-design claim',
      { required: designClaimed },
    );
  }

  // ── Rule compliance ────────────────────────────────────────────
  const compliance = rows.filter((r) => r?.ruleCompliance?.status === 'PASS').length;
  const complianceKnown = rows.filter((r) => r?.ruleCompliance?.status != null && r.ruleCompliance.status !== 'UNAVAILABLE').length;
  checks.ruleCompliance = check(
    matches === 0 || complianceKnown === 0 ? INTEGRITY_STATUS.INSUFFICIENT
      : compliance < complianceKnown ? INTEGRITY_STATUS.FAIL
        : complianceKnown < matches ? INTEGRITY_STATUS.WARN : INTEGRITY_STATUS.PASS,
    complianceKnown === 0 ? 'Rule compliance not recorded — headline cannot assert compliance'
      : compliance < complianceKnown ? `${complianceKnown - compliance}/${complianceKnown} evaluated matches FAILED rule compliance`
        : complianceKnown < matches ? `${compliance}/${complianceKnown} evaluated matches rule-compliant — ${matches - complianceKnown} row(s) lack compliance evidence`
          : `${compliance}/${complianceKnown} matches rule-compliant`,
    { pass: compliance, known: complianceKnown },
  );

  // ── Telemetry reconciliation ───────────────────────────────────
  // Required only when the corpus carries combo telemetry — a corpus with no
  // combo lifecycle data has nothing to reconcile.
  const comboPresent = rows.some((r) => r?.comboTelemetry != null);
  const rec = combo?.reconciliation;
  checks.telemetryReconciliation = check(
    !rec ? (comboPresent ? INTEGRITY_STATUS.NOT_TESTED : INTEGRITY_STATUS.NOT_APPLICABLE)
      : rec.status === 'not-applicable' ? INTEGRITY_STATUS.NOT_APPLICABLE
        : rec.status === 'pass' ? INTEGRITY_STATUS.PASS : INTEGRITY_STATUS.FAIL,
    !rec ? (comboPresent ? 'Combo telemetry present but reconciliation was not computed' : 'No combo telemetry in corpus')
      : rec.status === 'not-applicable' ? 'No Combo lifecycle telemetry present'
        : rec.status === 'pass'
          ? `Combo lifecycle reconciles: ${rec.declarations} declared = ${rec.lifecycleTotal} terminal states`
          : `${rec.failureCount} Combo reconciliation failure(s)`,
    { required: comboPresent, declarations: rec?.declarations ?? null, lifecycleTotal: rec?.lifecycleTotal ?? null, failureCount: rec?.failureCount ?? null },
  );

  // Tracing neutrality is a property of the execution, not the summaries —
  // it can never be established from an exported corpus. It is required only
  // when the corpus actually carries Deep Tracking output.
  const tracedRows = rows.filter((r) => r?.strategicTelemetry != null).length;
  checks.tracingNeutrality = check(INTEGRITY_STATUS.NOT_TESTED,
    tracedRows > 0
      ? 'Corpus carries Deep Tracking output; gameplay-neutrality is proven by deterministic replay tests, not derivable from exported summaries'
      : 'Deep Tracking gameplay-neutrality is proven by deterministic replay tests, not derivable from exported summaries',
    { required: tracedRows > 0, tracedRows });

  // ── Aggregation ────────────────────────────────────────────────
  const values = Object.values(checks);
  const requiredChecks = values.filter((c) => c.required !== false);
  const failures = values.filter((c) => c.status === INTEGRITY_STATUS.FAIL).length;
  const warnings = values.filter((c) => c.status === INTEGRITY_STATUS.WARN).length;
  const untestedRequired = requiredChecks.filter((c) => c.status === INTEGRITY_STATUS.NOT_TESTED).length;
  const insufficientRequired = requiredChecks.filter((c) => c.status === INTEGRITY_STATUS.INSUFFICIENT).length;
  const passedRequired = requiredChecks.filter((c) => c.status === INTEGRITY_STATUS.PASS).length;
  const overall = failures > 0 ? INTEGRITY_STATUS.FAIL
    : untestedRequired > 0 || insufficientRequired > 0 ? INTEGRITY_STATUS.INSUFFICIENT
      : matches === 0 ? INTEGRITY_STATUS.INSUFFICIENT
        : passedRequired === 0 ? INTEGRITY_STATUS.INSUFFICIENT
          : warnings > 0 ? INTEGRITY_STATUS.WARN
            : INTEGRITY_STATUS.PASS;

  return {
    schemaVersion: EXPERIMENT_INTEGRITY_SCHEMA,
    matches, overall, checks,
    sampleAccounting: {
      executions: matches,
      independentSamples,
      repeatedExecutions,
      digestConflicts,
    },
    provenance: {
      engineVersion: aggregate?.engineVersion ?? null,
      rulesVersion: aggregate?.rulesVersion ?? null,
      profileId: aggregate?.profileId ?? null,
      aggregateHash: aggregate?.aggregateHash ?? null,
    },
  };
}

// ── Early-victory diagnostics ───────────────────────────────────────────────

const EARLY_BUCKETS = [
  { id: 'turn-zero', label: 'Turn-zero victories', maxTurns: 0 },
  { id: 'turn-one', label: 'Turn-one victories', maxTurns: 1 },
  { id: 'early', label: 'Early victories (≤3 turns)', maxTurns: 3 },
];

function mechanicTagUsage(row) {
  const out = new Set();
  for (const p of row?.participants ?? []) {
    for (const k of Object.keys(p?.mechanicCounts ?? {})) if (num(p.mechanicCounts[k]) > 0) out.add(k);
  }
  for (const k of Object.keys(row?.mechanicCounts ?? {})) if (num(row.mechanicCounts[k]) > 0) out.add(k);
  return out;
}

/**
 * Early-victory diagnostic report. Buckets completed matches by
 * completedFullTurns and reports seat/policy splits plus mechanic-tag
 * enrichment vs the full dataset. Descriptive only — no card changes are
 * implied by enrichment.
 */
export function analyzeEarlyVictories(summaries) {
  const rows = (summaries ?? []).filter((r) => r?.winner === 'P1' || r?.winner === 'P2');
  const total = rows.length;
  // Dataset-level mechanic usage rates for enrichment denominators.
  const datasetTagCounts = new Map();
  for (const row of rows) for (const tag of mechanicTagUsage(row)) datasetTagCounts.set(tag, (datasetTagCounts.get(tag) ?? 0) + 1);

  const buckets = EARLY_BUCKETS.map(({ id, label, maxTurns }) => {
    const members = rows.filter((r) => num(r.completedFullTurns) <= maxTurns && (id !== 'early' || num(r.completedFullTurns) > 1));
    const seat1Wins = members.filter((r) => {
      const seat = r.winningSeat ?? (Array.isArray(r.seatOrder) ? r.seatOrder.indexOf(r.winner) + 1 : null);
      return seat === 1;
    }).length;
    const policyWins = {};
    const tagCounts = new Map();
    for (const m of members) {
      const winnerPolicy = (() => {
        const seat = m.winningSeat ?? (Array.isArray(m.seatOrder) ? m.seatOrder.indexOf(m.winner) + 1 : null);
        return seat == null ? null : (m.participants?.find((p) => p.seat === seat)?.policyId ?? m.policyIds?.[seat - 1] ?? null);
      })();
      if (winnerPolicy != null) policyWins[winnerPolicy] = (policyWins[winnerPolicy] ?? 0) + 1;
      for (const tag of mechanicTagUsage(m)) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
    const enrichment = [...tagCounts.entries()]
      .map(([tag, count]) => ({
        tag, count,
        bucketRate: members.length ? count / members.length : 0,
        datasetRate: total ? (datasetTagCounts.get(tag) ?? 0) / total : 0,
      }))
      .filter((e) => e.datasetRate > 0)
      .map((e) => ({ ...e, enrichmentRatio: Math.round((e.bucketRate / e.datasetRate) * 100) / 100 }))
      .sort((a, b) => b.enrichmentRatio - a.enrichmentRatio)
      .slice(0, 10);
    return {
      id, label, maxTurns,
      count: members.length,
      shareOfDataset: pct(members.length, total),
      seat1Wins, seat2Wins: members.length - seat1Wins,
      policyWins,
      meanActionCount: members.length ? Math.round(members.reduce((s, m) => s + num(m.policyActionCount ?? m.actionCount), 0) / members.length * 10) / 10 : null,
      meanScoreMargin: members.length ? Math.round(members.reduce((s, m) => s + Math.abs(num(m.scoreMargin)), 0) / members.length * 10) / 10 : null,
      mechanicEnrichment: enrichment,
      matchIds: members.slice(0, 25).map((m) => m.matchId ?? null).filter(Boolean),
      minimumSampleWarning: members.length > 0 && members.length < 30
        ? `Only ${members.length} match(es) — enrichment ratios are unstable below ~30.`
        : null,
    };
  });
  return { totalDecisiveMatches: total, buckets };
}

// ── Decisiveness / score-margin diagnostics ─────────────────────────────────

/**
 * Resolve the losing PLAYER id of a decisive match — never inferred from a
 * physical seat index (seat order may be swapped). Prefers the score map's
 * own keys, then recorded participants/seat order. Returns null when the
 * record cannot attribute a loser without inventing a value.
 */
function loserPlayerIdOf(row, winnerId, scoreIds) {
  const fromScores = scoreIds.find((id) => id !== winnerId);
  if (fromScores != null) return fromScores;
  const fromParticipants = (row?.participants ?? [])
    .map((p) => p?.playerId)
    .find((id) => id != null && id !== winnerId);
  if (fromParticipants != null) return fromParticipants;
  const fromSeats = (row?.seatOrder ?? []).find((id) => id !== winnerId);
  return fromSeats ?? null;
}

/**
 * Score-margin and decisiveness summary: margin distribution, zero-score
 * losers, winner/loser mean scores, termination mix. Winner/loser scores are
 * resolved by player id — physical seat position is never used, so a seat
 * swap cannot reverse attribution. Descriptive game-design telemetry — not a
 * defect signal.
 */
export function analyzeDecisiveness(summaries) {
  const rows = summaries ?? [];
  const decisive = rows.filter((r) => r?.winner === 'P1' || r?.winner === 'P2');
  const margins = [];
  const winnerScores = [];
  const loserScores = [];
  let zeroScoreLosers = 0;
  let unattributable = 0;
  for (const r of decisive) {
    const scores = r?.finalScores ?? {};
    const scoreIds = Object.keys(scores);
    // `winner` is a player id (P1/P2), not a seat. When it is malformed or
    // absent from the score map, fall back to the physical winning seat only
    // to recover the player id via the recorded seat order.
    const winnerId = scoreIds.includes(r.winner) ? r.winner
      : (Array.isArray(r.seatOrder) && Number.isInteger(r.winningSeat) ? r.seatOrder[r.winningSeat - 1] : null);
    const loserId = winnerId != null ? loserPlayerIdOf(r, winnerId, scoreIds) : null;
    const wScore = winnerId != null ? scores[winnerId] : null;
    const lScore = loserId != null ? scores[loserId] : null;
    if (Number.isFinite(wScore) && Number.isFinite(lScore)) {
      winnerScores.push(wScore);
      loserScores.push(lScore);
      if (lScore === 0) zeroScoreLosers += 1;
    } else {
      // Never invent winner/loser values for incomplete or malformed rows.
      unattributable += 1;
    }
    const margin = Number.isFinite(r?.scoreMargin) ? r.scoreMargin
      : (Number.isFinite(wScore) && Number.isFinite(lScore) ? Math.abs(wScore - lScore) : null);
    if (margin != null) margins.push(Math.abs(margin));
  }
  const summarize = (values) => {
    if (!values.length) return { count: 0, mean: null, median: null, min: null, max: null, p95: null };
    const sorted = [...values].sort((a, b) => a - b);
    const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    return { count: sorted.length, mean: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length * 100) / 100, median: q(0.5), min: sorted[0], max: sorted[sorted.length - 1], p95: q(0.95) };
  };
  const terminations = {};
  for (const r of rows) terminations[r?.terminationReason ?? 'UNKNOWN'] = (terminations[r?.terminationReason ?? 'UNKNOWN'] ?? 0) + 1;
  return {
    matches: rows.length,
    decisiveMatches: decisive.length,
    decisiveRate: pct(decisive.length, rows.length),
    scoreMargin: summarize(margins),
    winnerScore: summarize(winnerScores),
    loserScore: summarize(loserScores),
    zeroScoreLosers,
    zeroScoreLoserRate: pct(zeroScoreLosers, decisive.length),
    unattributableDecisive: unattributable,
    turnCounts: summarize(decisive.map((r) => num(r.completedFullTurns))),
    terminations,
  };
}
