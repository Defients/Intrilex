// ═══════════════════════════════════════════════════════════════
// deterministic-statistics.mjs — Factual checks computed BEFORE the
// LLM is invoked. These are objective, reproducible warnings the UI
// shows separately from LLM-generated interpretations (per spec §13).
// ═══════════════════════════════════════════════════════════════

export const DET_CHECK = Object.freeze({
  RECONCILIATION: 'RECONCILIATION',
  MISSING_FIELD: 'MISSING_FIELD',
  INVALID_VALUE: 'INVALID_VALUE',
  IMPOSSIBLE_PERCENT: 'IMPOSSIBLE_PERCENT',
  ZERO_DENOMINATOR: 'ZERO_DENOMINATOR',
  USAGE_VS_OPPORTUNITY: 'USAGE_VS_OPPORTUNITY',
  SEAT_ASYMMETRY: 'SEAT_ASYMMETRY',
  WIN_RATE_UNCERTAINTY: 'WIN_RATE_UNCERTAINTY',
  SAMPLE_SIZE: 'SAMPLE_SIZE',
  VERSION_MISMATCH: 'VERSION_MISMATCH',
  DUPLICATED_CATEGORY: 'DUPLICATED_CATEGORY',
  VARIANT_MIXING: 'VARIANT_MIXING',
  OUTLIER: 'OUTLIER',
  MISSING_TELEMETRY: 'MISSING_TELEMETRY'
});

export const DET_SEVERITY = Object.freeze({
  INFO: 'info',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
});

/**
 * Run all deterministic checks against an analytics bundle.
 *
 * @param {object} bundle - { observatory, aggregate, variantAnalytics, engineVersion, rulesVersion, analyticsSchemaVersion }
 * @returns {Array<object>} warnings — each { check, severity, title, detail, metric, value, sourceId }
 */
export function runDeterministicChecks(bundle = {}) {
  const warnings = [];
  const { observatory = {}, aggregate = {}, variantAnalytics = null, engineVersion, rulesVersion } = bundle;
  const sourceId = 'deterministic-checks';

  // ── Version reconciliation ──
  checkVersions(warnings, { observatory, aggregate, engineVersion, rulesVersion, sourceId });

  // ── Sample size sufficiency ──
  checkSampleSize(warnings, { aggregate, observatory, sourceId });

  // ── Seat asymmetry ──
  checkSeatAsymmetry(warnings, { aggregate, sourceId });

  // ── Win-rate uncertainty ──
  checkWinRateUncertainty(warnings, { aggregate, observatory, sourceId });

  // ── Metric reconciliation (totals) ──
  checkReconciliation(warnings, { aggregate, observatory, sourceId });

  // ── Impossible percentages / zero denominators ──
  checkPercentages(warnings, { observatory, sourceId });

  // ── Usage vs opportunity ──
  checkUsageVsOpportunity(warnings, { observatory, sourceId });

  // ── Missing telemetry / fields ──
  checkMissingFields(warnings, { observatory, aggregate, sourceId });

  // ── Variant mixing (Normal vs Super) ──
  checkVariantMixing(warnings, { observatory, variantAnalytics, sourceId });

  // ── Duplicated categories ──
  checkDuplicatedCategories(warnings, { observatory, sourceId });

  // ── Outlier detection ──
  checkOutliers(warnings, { observatory, sourceId });

  return warnings;
}

function add(warnings, w) {
  warnings.push({ sourceId: w.sourceId || 'deterministic-checks', ...w });
}

function checkVersions(warnings, { observatory, aggregate, engineVersion, rulesVersion, sourceId }) {
  const obsEngine = observatory.engineVersion || aggregate.engineVersion;
  const obsRules = observatory.rulesVersion || aggregate.rulesVersion;
  if (engineVersion && obsEngine && obsEngine !== engineVersion) {
    add(warnings, { check: DET_CHECK.VERSION_MISMATCH, severity: DET_SEVERITY.HIGH, title: 'Engine version mismatch', detail: `Observatory reports engine ${obsEngine} but expected ${engineVersion}.`, metric: 'engineVersion', value: obsEngine, expected: engineVersion, sourceId });
  }
  if (rulesVersion && obsRules && obsRules !== rulesVersion) {
    add(warnings, { check: DET_CHECK.VERSION_MISMATCH, severity: DET_SEVERITY.HIGH, title: 'Rules version mismatch', detail: `Observatory reports rules ${obsRules} but expected ${rulesVersion}.`, metric: 'rulesVersion', value: obsRules, expected: rulesVersion, sourceId });
  }
  if (aggregate.engineVersion && observatory.engineVersion && aggregate.engineVersion !== observatory.engineVersion) {
    add(warnings, { check: DET_CHECK.VERSION_MISMATCH, severity: DET_SEVERITY.MEDIUM, title: 'Engine version drift between aggregate and observatory', detail: `Aggregate=${aggregate.engineVersion}, Observatory=${observatory.engineVersion}`, metric: 'engineVersion', sourceId });
  }
}

function checkSampleSize(warnings, { aggregate, observatory, sourceId }) {
  const matchCount = aggregate.matchCount ?? observatory.summaryCount ?? 0;
  if (!matchCount) {
    add(warnings, { check: DET_CHECK.SAMPLE_SIZE, severity: DET_SEVERITY.CRITICAL, title: 'No matches in dataset', detail: 'matchCount is zero; no statistics are meaningful.', metric: 'matchCount', value: 0, sourceId });
    return;
  }
  if (matchCount < 30) {
    add(warnings, { check: DET_CHECK.SAMPLE_SIZE, severity: DET_SEVERITY.HIGH, title: 'Insufficient sample size', detail: `Only ${matchCount} matches. Confidence intervals will be very wide; per-mechanic estimates are unreliable.`, metric: 'matchCount', value: matchCount, sourceId });
  } else if (matchCount < 100) {
    add(warnings, { check: DET_CHECK.SAMPLE_SIZE, severity: DET_SEVERITY.MEDIUM, title: 'Small sample size', detail: `${matchCount} matches. Treat per-card and per-rank estimates as exploratory.`, metric: 'matchCount', value: matchCount, sourceId });
  }
  // Per-policy sample size
  const policies = aggregate.policies || {};
  for (const [pid, p] of Object.entries(policies)) {
    const games = p.games ?? 0;
    if (games > 0 && games < 30) {
      add(warnings, { check: DET_CHECK.SAMPLE_SIZE, severity: DET_SEVERITY.MEDIUM, title: `Small per-policy sample: ${pid}`, detail: `Policy "${pid}" has only ${games} games. Its win rate is unstable.`, metric: `policies.${pid}.games`, value: games, sourceId });
    }
  }
}

function checkSeatAsymmetry(warnings, { aggregate, sourceId }) {
  const seatWins = aggregate.seatWins || {};
  const seats = Object.keys(seatWins).map(Number).filter(n => Number.isFinite(n));
  if (seats.length < 2) return;
  const total = seats.reduce((s, k) => s + (seatWins[k] || 0), 0);
  if (total === 0) return;
  const rates = seats.map(k => ({ seat: k, wins: seatWins[k], rate: seatWins[k] / total }));
  rates.sort((a, b) => b.rate - a.rate);
  const gap = rates[0].rate - rates[rates.length - 1].rate;
  // A gap > 0.10 with a decent sample is worth flagging deterministically.
  if (gap > 0.10 && total >= 50) {
    add(warnings, {
      check: DET_CHECK.SEAT_ASYMMETRY,
      severity: gap > 0.20 ? DET_SEVERITY.HIGH : DET_SEVERITY.MEDIUM,
      title: 'Seat win-rate asymmetry detected',
      detail: `Seat ${rates[0].seat} wins ${(rates[0].rate * 100).toFixed(1)}% vs Seat ${rates[rates.length - 1].seat} at ${(rates[rates.length - 1].rate * 100).toFixed(1)}% (gap ${(gap * 100).toFixed(1)} pts across ${total} decisive matches). This is a factual observation, not a balance verdict.`,
      metric: 'seatWinRateGap',
      value: gap,
      seats: rates,
      sourceId
    });
  }
}

function checkWinRateUncertainty(warnings, { aggregate, observatory, sourceId }) {
  // Flag policies whose 95% Wilson interval is very wide.
  const policies = aggregate.policies || {};
  for (const [pid, p] of Object.entries(policies)) {
    const ci = p.wilson95 || p.winWilson95;
    if (Array.isArray(ci) && ci.length === 2) {
      const width = ci[1] - ci[0];
      if (width > 0.25) {
        add(warnings, { check: DET_CHECK.WIN_RATE_UNCERTAINTY, severity: DET_SEVERITY.MEDIUM, title: `Wide confidence interval: ${pid}`, detail: `Policy "${pid}" 95% Wilson interval width is ${(width * 100).toFixed(1)} pts [${(ci[0] * 100).toFixed(1)}%, ${(ci[1] * 100).toFixed(1)}%]. Point estimate is imprecise.`, metric: `policies.${pid}.wilson95`, value: ci, sourceId });
      }
    }
  }
  // Rank power confidence
  const ladder = observatory.rankPower?.ladder || [];
  for (const r of ladder) {
    if (r.confidence === 'INSUFFICIENT' || r.confidence === 'LOW') {
      add(warnings, { check: DET_CHECK.WIN_RATE_UNCERTAINTY, severity: DET_SEVERITY.LOW, title: `Low-confidence rank estimate: ${r.rank}`, detail: `Rank ${r.rank} RPI=${r.rpi?.toFixed(3)} has confidence ${r.confidence}.`, metric: `rankPower.${r.rank}.confidence`, value: r.confidence, sourceId });
    }
  }
}

function checkReconciliation(warnings, { aggregate, sourceId }) {
  const matchCount = aggregate.matchCount ?? 0;
  const completed = aggregate.completedMatchCount ?? matchCount;
  if (matchCount && completed !== matchCount) {
    add(warnings, { check: DET_CHECK.RECONCILIATION, severity: DET_SEVERITY.MEDIUM, title: 'Match count mismatch', detail: `matchCount=${matchCount} but completedMatchCount=${completed}.`, metric: 'completedMatchCount', value: completed, expected: matchCount, sourceId });
  }
  const termination = aggregate.terminationCounts || {};
  const termSum = Object.values(termination).reduce((s, n) => s + (Number(n) || 0), 0);
  if (matchCount && termSum && termSum !== matchCount) {
    add(warnings, { check: DET_CHECK.RECONCILIATION, severity: DET_SEVERITY.MEDIUM, title: 'Termination counts do not reconcile', detail: `Sum of terminationCounts=${termSum} differs from matchCount=${matchCount}.`, metric: 'terminationCounts.sum', value: termSum, expected: matchCount, sourceId });
  }
  const seatWins = aggregate.seatWins || {};
  const seatSum = Object.values(seatWins).reduce((s, n) => s + (Number(n) || 0), 0);
  const decisive = matchCount - (aggregate.drawCount || 0) - (aggregate.abortCount || 0);
  if (decisive > 0 && seatSum && Math.abs(seatSum - decisive) > 1) {
    add(warnings, { check: DET_CHECK.RECONCILIATION, severity: DET_SEVERITY.MEDIUM, title: 'Seat wins do not reconcile with decisive matches', detail: `Sum of seatWins=${seatSum} vs decisive matches=${decisive}.`, metric: 'seatWins.sum', value: seatSum, expected: decisive, sourceId });
  }
}

function checkPercentages(warnings, { observatory, sourceId }) {
  const mechanics = observatory.mechanics || [];
  for (const m of mechanics) {
    const pickRate = m.pickRateWhenLegal ?? m.pickRate ?? null;
    if (pickRate != null && (pickRate < 0 || pickRate > 1)) {
      add(warnings, { check: DET_CHECK.IMPOSSIBLE_PERCENT, severity: DET_SEVERITY.HIGH, title: `Impossible pick rate: ${m.mechanic || m.metricId}`, detail: `pickRate=${pickRate} is outside [0,1].`, metric: `${m.metricId}.pickRate`, value: pickRate, sourceId });
    }
    const opp = m.legalOpportunityCount ?? m.opportunityCount ?? null;
    const sel = m.selectionCount ?? m.count ?? null;
    if (opp != null && opp === 0 && sel != null && sel > 0) {
      add(warnings, { check: DET_CHECK.ZERO_DENOMINATOR, severity: DET_SEVERITY.HIGH, title: `Zero denominator with usage: ${m.mechanic || m.metricId}`, detail: `selectionCount=${sel} but legalOpportunityCount=0. Pick rate is undefined.`, metric: `${m.metricId}.opportunityCount`, value: 0, sourceId });
    }
  }
}

function checkUsageVsOpportunity(warnings, { observatory, sourceId }) {
  const mechanics = observatory.mechanics || [];
  for (const m of mechanics) {
    const opp = m.legalOpportunityCount ?? m.opportunityCount ?? null;
    const sel = m.selectionCount ?? m.count ?? null;
    if (opp != null && sel != null && opp > 0 && sel > opp) {
      add(warnings, { check: DET_CHECK.USAGE_VS_OPPORTUNITY, severity: DET_SEVERITY.HIGH, title: `Usage exceeds opportunity: ${m.mechanic || m.metricId}`, detail: `selectionCount=${sel} > legalOpportunityCount=${opp}. This suggests either double-counting or an opportunity-denominator bug.`, metric: `${m.metricId}.selectionCount`, value: sel, expected: opp, sourceId });
    }
  }
}

function checkMissingFields(warnings, { observatory, aggregate, sourceId }) {
  if (!observatory.mechanics || observatory.mechanics.length === 0) {
    add(warnings, { check: DET_CHECK.MISSING_TELEMETRY, severity: DET_SEVERITY.MEDIUM, title: 'No mechanic telemetry', detail: 'observatory.mechanics is empty. Balance analysis will have no per-card evidence.', metric: 'observatory.mechanics', value: 0, sourceId });
  }
  if (observatory.hasOpportunityTelemetry === false) {
    add(warnings, { check: DET_CHECK.MISSING_TELEMETRY, severity: DET_SEVERITY.HIGH, title: 'Opportunity telemetry missing', detail: 'hasOpportunityTelemetry=false. Usage rates cannot be opportunity-adjusted; high/low usage cannot be interpreted as power.', metric: 'hasOpportunityTelemetry', value: false, sourceId });
  }
  if (!aggregate.matchCount) {
    add(warnings, { check: DET_CHECK.MISSING_FIELD, severity: DET_SEVERITY.MEDIUM, title: 'aggregate.matchCount missing', detail: 'Aggregate match count is absent; sample-size checks skipped.', metric: 'aggregate.matchCount', value: null, sourceId });
  }
}

function checkVariantMixing(warnings, { observatory, variantAnalytics, sourceId }) {
  // Mechanics whose id contains both a normal and a super/special marker.
  const mechanics = observatory.mechanics || [];
  const variantMarkers = ['super', 'ultra', 'spade', 'joker', 'special'];
  for (const m of mechanics) {
    const id = String(m.mechanic || m.metricId || '').toLowerCase();
    const matches = variantMarkers.filter(v => id.includes(v));
    if (matches.length > 1) {
      add(warnings, { check: DET_CHECK.VARIANT_MIXING, severity: DET_SEVERITY.MEDIUM, title: `Possible variant mixing: ${m.mechanic}`, detail: `Mechanic id "${m.mechanic}" contains multiple variant markers (${matches.join(', ')}). Normal and special variants should be reported separately.`, metric: m.metricId, value: matches, sourceId });
    }
  }
  if (variantAnalytics && Array.isArray(variantAnalytics.variantKeys)) {
    // Ensure variant keys are disjoint from normal mechanic ids (heuristic).
    const variantSet = new Set(variantAnalytics.variantKeys.map(k => String(k).toLowerCase()));
    for (const m of mechanics) {
      const id = String(m.mechanic || '').toLowerCase();
      if (variantSet.has(id) && !variantMarkers.some(v => id.includes(v))) {
        add(warnings, { check: DET_CHECK.VARIANT_MIXING, severity: DET_SEVERITY.LOW, title: `Variant key overlaps normal mechanic: ${m.mechanic}`, detail: `"${m.mechanic}" appears in both normal mechanics and variant keys. Confirm they are not double-counted.`, metric: m.metricId, sourceId });
      }
    }
  }
}

function checkDuplicatedCategories(warnings, { observatory, sourceId }) {
  const mechanics = observatory.mechanics || [];
  const byName = new Map();
  for (const m of mechanics) {
    const name = m.mechanic || m.metricId;
    if (!name) continue;
    if (byName.has(name)) {
      byName.get(name).push(m);
    } else {
      byName.set(name, [m]);
    }
  }
  for (const [name, group] of byName) {
    if (group.length > 1) {
      add(warnings, { check: DET_CHECK.DUPLICATED_CATEGORY, severity: DET_SEVERITY.MEDIUM, title: `Duplicated mechanic entry: ${name}`, detail: `Mechanic "${name}" appears ${group.length} times in observatory.mechanics. Possible double-counting.`, metric: name, value: group.length, sourceId });
    }
  }
}

function checkOutliers(warnings, { observatory, sourceId }) {
  const mechanics = observatory.mechanics || [];
  const rates = mechanics.map(m => ({ name: m.mechanic || m.metricId, pick: m.pickRateWhenLegal ?? m.pickRate ?? null })).filter(r => r.pick != null && Number.isFinite(r.pick));
  if (rates.length < 5) return;
  const sorted = rates.map(r => r.pick).sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  if (iqr === 0) return;
  const upper = q3 + 1.5 * iqr;
  const lower = q1 - 1.5 * iqr;
  for (const r of rates) {
    if (r.pick > upper || r.pick < lower) {
      add(warnings, { check: DET_CHECK.OUTLIER, severity: DET_SEVERITY.LOW, title: `Pick-rate outlier: ${r.name}`, detail: `"${r.name}" pick rate ${r.pick.toFixed(3)} is outside the 1.5×IQR fence [${lower.toFixed(3)}, ${upper.toFixed(3)}]. Investigate before labeling as over/underpowered.`, metric: `${r.name}.pickRate`, value: r.pick, fence: [lower, upper], sourceId });
    }
  }
}

/**
 * Summarize deterministic warnings into a compact object suitable for
 * inclusion in the LLM context (so the model is aware of pre-computed
 * facts and does not re-derive them).
 */
export function summarizeDeterministicChecks(warnings) {
  const byCheck = {};
  let high = 0, critical = 0;
  for (const w of warnings) {
    byCheck[w.check] = (byCheck[w.check] || 0) + 1;
    if (w.severity === DET_SEVERITY.HIGH) high += 1;
    if (w.severity === DET_SEVERITY.CRITICAL) critical += 1;
  }
  return { total: warnings.length, high, critical, byCheck, warnings: warnings.map(w => ({ check: w.check, severity: w.severity, title: w.title, detail: w.detail })) };
}
