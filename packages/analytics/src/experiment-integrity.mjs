// experiment-integrity.mjs — experiment self-audit + descriptive diagnostics.
//
// Produces the "EXPERIMENT INTEGRITY" trust dashboard for research packages:
// every check reports PASS / WARN / FAIL / NOT_TESTED / NOT_APPLICABLE and is
// derived from the exported evidence itself — nothing is marked PASS unless
// the data actually proves it. Also contains the descriptive diagnostics
// (early-victory, decisiveness) that turn corpus oddities into analyzable
// signals instead of guesses.
//
// Mirrored verbatim into apps/lab-web/dist/shared-analytics — pure data only.

export const EXPERIMENT_INTEGRITY_SCHEMA = '1.0.0';

export const INTEGRITY_STATUS = Object.freeze({
  PASS: 'PASS',
  WARN: 'WARN',
  FAIL: 'FAIL',
  NOT_TESTED: 'NOT_TESTED',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
});

const num = (v) => (Number.isFinite(v) ? v : 0);
const pct = (a, b) => (b ? Math.round((a / b) * 10000) / 10000 : null);
const check = (status, detail, extra = {}) => ({ status, detail, ...extra });

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

/**
 * Compact trust dashboard for an exported corpus.
 * @param {Array} summaries
 * @param {{ aggregate?: object | null, pairedABBA?: object | null, combo?: object | null }} [ctx]
 */
export function buildExperimentIntegrity(summaries, { aggregate = null, pairedABBA = null, combo = null } = {}) {
  const rows = summaries ?? [];
  const matches = rows.length;
  const ids = uniqueCounts(rows, 'matchId');
  const ordinals = uniqueCounts(rows, 'matchOrdinal');
  const seeds = uniqueCounts(rows, 'seed');

  const checks = {};
  checks.uniqueMatchIds = check(
    ids.duplicates === 0 ? INTEGRITY_STATUS.PASS : INTEGRITY_STATUS.FAIL,
    `${ids.unique}/${matches} unique match IDs${ids.duplicates ? ` (${ids.duplicates} duplicates)` : ''}`,
    { unique: ids.unique, duplicates: ids.duplicates, missing: ids.missing },
  );
  checks.uniqueOrdinals = check(
    ordinals.duplicates === 0 ? INTEGRITY_STATUS.PASS : INTEGRITY_STATUS.WARN,
    `${ordinals.unique}/${matches} unique ordinals${ordinals.duplicates ? ` (${ordinals.duplicates} duplicates)` : ''}`,
    { unique: ordinals.unique, duplicates: ordinals.duplicates },
  );
  checks.uniqueSeeds = check(
    seeds.duplicates === 0 ? INTEGRITY_STATUS.PASS
      : seeds.duplicates <= Math.max(1, Math.floor(matches * 0.01)) ? INTEGRITY_STATUS.WARN : INTEGRITY_STATUS.FAIL,
    `${seeds.unique}/${matches} unique seeds${seeds.duplicates ? ` (${seeds.duplicates} reused)` : ''}`,
    { unique: seeds.unique, duplicates: seeds.duplicates },
  );

  // Paired-design provenance: fraction of rows carrying explicit leg metadata.
  const legTagged = rows.filter((r) => r?.pairedLeg === 'AB' || r?.pairedLeg === 'BA').length;
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
    { rowsWithLegMetadata: legTagged },
  );

  if (pairedABBA) {
    const ds = pairedABBA.designStatus ?? 'not-applicable';
    checks.pairedDesign = check(
      ds === 'verified' ? INTEGRITY_STATUS.PASS
        : ds === 'not-applicable' ? INTEGRITY_STATUS.NOT_APPLICABLE
          : ds === 'malformed' ? INTEGRITY_STATUS.FAIL : INTEGRITY_STATUS.WARN,
      ds === 'verified'
        ? `Paired design verified — ${pairedABBA.totalPairedBlocks} complete AB/BA block(s)`
        : ds === 'malformed'
          ? `Malformed paired design — ${pairedABBA.malformedBlocks} block(s) failed policy↔seat verification`
          : ds === 'unverified'
            ? `Paired structure incomplete — ${pairedABBA.totalPairedBlocks} verified block(s), ${pairedABBA.incompletePairs} incomplete, ${pairedABBA.malformedBlocks} malformed`
            : 'No paired structure detected',
      { completePairs: pairedABBA.totalPairedBlocks ?? 0, incompletePairs: pairedABBA.incompletePairs ?? 0, malformedBlocks: pairedABBA.malformedBlocks ?? 0, malformedReasons: pairedABBA.malformedReasons ?? {} },
    );
    const sb = pairedABBA.seatBalance;
    checks.seatBalance = check(
      !sb || sb.status === 'not-applicable' ? INTEGRITY_STATUS.NOT_APPLICABLE
        : ds === 'verified' || ds === 'unverified'
          ? (sb.status === 'balanced' ? INTEGRITY_STATUS.PASS : INTEGRITY_STATUS.WARN)
          : INTEGRITY_STATUS.FAIL,
      !sb || sb.status === 'not-applicable'
        ? 'No decisive legs in verified pairs'
        : `Seat 1 ${sb.seat1Wins}W vs Seat 2 ${sb.seat2Wins}W over ${sb.decisiveLegs} decisive legs (p=${sb.signTest?.pValue ?? '—'})`,
      sb ? { seat1Wins: sb.seat1Wins, seat2Wins: sb.seat2Wins, decisiveLegs: sb.decisiveLegs, seat1WinRate: sb.seat1WinRate, signTestPValue: sb.signTest?.pValue ?? null } : {},
    );
    const exposures = (pairedABBA.pairResults ?? []).flatMap((r) => Object.entries(r.seatExposure ?? {}));
    const imbalanced = exposures.filter(([, e]) => e.seat1 !== e.seat2);
    checks.policySeatExposure = check(
      ds === 'not-applicable' || !exposures.length ? INTEGRITY_STATUS.NOT_APPLICABLE
        : imbalanced.length === 0 ? INTEGRITY_STATUS.PASS : INTEGRITY_STATUS.FAIL,
      !exposures.length ? 'No seat exposure data'
        : imbalanced.length === 0
          ? 'Every policy occupies each seat equally across its matchup'
          : `${imbalanced.length} policy↔matchup exposure imbalance(s): ${imbalanced.slice(0, 4).map(([p, e]) => `${p} seat1=${e.seat1}/seat2=${e.seat2}`).join('; ')}`,
    );
  } else {
    checks.pairedDesign = check(INTEGRITY_STATUS.NOT_TESTED, 'Paired analysis not supplied');
    checks.seatBalance = check(INTEGRITY_STATUS.NOT_TESTED, 'Paired analysis not supplied');
    checks.policySeatExposure = check(INTEGRITY_STATUS.NOT_TESTED, 'Paired analysis not supplied');
  }

  const compliance = rows.filter((r) => r?.ruleCompliance?.status === 'PASS').length;
  const complianceKnown = rows.filter((r) => r?.ruleCompliance?.status != null && r.ruleCompliance.status !== 'UNAVAILABLE').length;
  checks.ruleCompliance = check(
    matches === 0 || complianceKnown === 0 ? INTEGRITY_STATUS.NOT_APPLICABLE
      : compliance === complianceKnown ? INTEGRITY_STATUS.PASS : INTEGRITY_STATUS.FAIL,
    complianceKnown === 0 ? 'Rule compliance not recorded'
      : `${compliance}/${complianceKnown} matches rule-compliant`,
    { pass: compliance, known: complianceKnown },
  );

  const rec = combo?.reconciliation;
  checks.telemetryReconciliation = check(
    !rec ? INTEGRITY_STATUS.NOT_TESTED
      : rec.status === 'not-applicable' ? INTEGRITY_STATUS.NOT_APPLICABLE
        : rec.status === 'pass' ? INTEGRITY_STATUS.PASS : INTEGRITY_STATUS.FAIL,
    !rec ? 'Combo reconciliation not computed'
      : rec.status === 'not-applicable' ? 'No Combo lifecycle telemetry present'
        : rec.status === 'pass'
          ? `Combo lifecycle reconciles: ${rec.declarations} declared = ${rec.lifecycleTotal} terminal states`
          : `${rec.failureCount} Combo reconciliation failure(s)`,
    rec ? { declarations: rec.declarations, lifecycleTotal: rec.lifecycleTotal, failureCount: rec.failureCount } : {},
  );

  checks.tracingNeutrality = check(INTEGRITY_STATUS.NOT_TESTED,
    'Deep Tracking gameplay-neutrality is proven by deterministic replay tests, not derivable from exported summaries');

  const failures = Object.values(checks).filter((c) => c.status === INTEGRITY_STATUS.FAIL).length;
  const warnings = Object.values(checks).filter((c) => c.status === INTEGRITY_STATUS.WARN).length;
  const tested = Object.values(checks).filter((c) => c.status !== INTEGRITY_STATUS.NOT_APPLICABLE && c.status !== INTEGRITY_STATUS.NOT_TESTED);
  const overall = failures > 0 ? INTEGRITY_STATUS.FAIL
    : warnings > 0 ? INTEGRITY_STATUS.WARN
      : tested.length === 0 ? INTEGRITY_STATUS.NOT_APPLICABLE
        : INTEGRITY_STATUS.PASS;

  return {
    schemaVersion: EXPERIMENT_INTEGRITY_SCHEMA,
    matches, overall, checks,
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
 * Score-margin and decisiveness summary: margin distribution, zero-score
 * losers, winner/loser mean scores, termination mix. Descriptive game-design
 * telemetry — not a defect signal.
 */
export function analyzeDecisiveness(summaries) {
  const rows = summaries ?? [];
  const decisive = rows.filter((r) => r?.winner === 'P1' || r?.winner === 'P2');
  const margins = [];
  const winnerScores = [];
  const loserScores = [];
  let zeroScoreLosers = 0;
  for (const r of decisive) {
    const s1 = num(r.finalScores?.P1);
    const s2 = num(r.finalScores?.P2);
    margins.push(Math.abs(num(r.scoreMargin ?? s1 - s2)));
    if (r.winningSeat === 2 || (r.winningSeat == null && Array.isArray(r.seatOrder) && r.seatOrder.indexOf(r.winner) === 1)) {
      winnerScores.push(s2); loserScores.push(s1);
    } else {
      winnerScores.push(s1); loserScores.push(s2);
    }
    if (s1 === 0 || s2 === 0) zeroScoreLosers += 1;
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
    turnCounts: summarize(decisive.map((r) => num(r.completedFullTurns))),
    terminations,
  };
}
