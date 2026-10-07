// combo-analytics.mjs — Derived Combo Intelligence analytics.
//
// Aggregates first-class Combo telemetry (summary.comboTelemetry, schema 1.0.0)
// and — for legacy datasets recorded before combo telemetry existed — falls
// back to the retained rankDecisions legal-action sets, which still carry
// authoritative opportunities and declarations (lifecycle is unavailable
// there and reported as such; nothing is fabricated).
//
// Canonical semantics (rulebook §8): a Combo is ONE declared multi-card play
// resolved as a single atomic stack item. The super/ultra classes are Combo
// classes; royal-marriage, queens-court, rank10 (incl. 10♦ paired mimics),
// voltage and the K♠ counter are NOT combos. Comboing = the propensity to
// accept legal Combo opportunities (declarations / opportunities), not a raw
// declaration count.
//
// Shared canonical + browser module: scripts/build.mjs mirrors this file to
// apps/lab-web/dist/shared-analytics/ and rewrites the estimators import. It
// may only import '@intrilex/statistics/estimators' and sibling
// shared-analytics modules — the classifier below therefore duplicates
// packages/simulation-runtime/src/combo-telemetry.mjs (keep in parity).

import { wilsonInterval, differenceInProportions, evidenceGradeLegacy } from '@intrilex/statistics/estimators';
import { unitDecisive, unitWon, stratumKey } from './observatory-core.mjs';

export const COMBO_ANALYTICS_SCHEMA_VERSION = '1.0.0';

// ── Classification (parity with simulation-runtime/combo-telemetry.mjs) ────

const kindOf = (action) => action?.semantics?.effectKind ?? action?.advanced?.kind ?? action?.kind ?? null;

export function comboClassOf(action) {
  if (!action) return null;
  const family = action.family ?? null;
  const mode = action.mode ?? null;
  const kind = kindOf(action);
  if (kind === 'declare-combo' || kind === 'core-declare-combo') return 'generic';
  if (family === 'super' || (typeof kind === 'string' && kind.startsWith('advanced-super-')) || kind === 'core-declare-super-ace-counter') return 'super';
  if (family === 'ultra' || (typeof kind === 'string' && kind.startsWith('advanced-ultra-')) || kind === 'core-declare-ultra-three-red') return 'ultra';
  if (family === 'counter' && mode === 'super-ace') return 'super';
  return null;
}

export const isComboAction = (action) => comboClassOf(action) !== null;

export function comboRecipeId(action) {
  const cls = comboClassOf(action);
  if (!cls) return null;
  const mode = String(action.mode ?? '');
  const kind = kindOf(action);
  if (cls === 'generic') return 'combo:generic';
  if (mode === 'super-ace' || kind === 'core-declare-super-ace-counter') return 'super:ace-counter';
  if (mode === 'three-red-counter' || kind === 'core-declare-ultra-three-red') return 'ultra:three-red-counter';
  if (mode.startsWith('four-exchange-')) return 'super:four-exchange';
  return `${cls}:${mode || 'unknown'}`;
}

export const COMBO_RECIPE_LABELS = Object.freeze({
  'super:two-score': '⭐2 · Secure',
  'super:two-hold': '⭐2 · Hold',
  'super:three-raid': '⭐3 · Raid',
  'super:four-exchange': '⭐4 · Exchange',
  'super:five-recycle': '⭐5 · Recycle',
  'super:six-dig': '⭐6 · Dig',
  'super:seven-topdeck': '⭐7 · Topdeck',
  'super:eight-absolute-scuttle': '⭐8 · Absolute Scuttle',
  'super:jack-tempo': '⭐J · Tempo',
  'super:ace-counter': '⭐A · Counter',
  'ultra:three-red-counter': '🌠3R · Counter',
  'ultra:2-black-2-red-draw': '🌠2B2R · Draw',
  'ultra:2-black-2-red-rummage': '🌠2B2R · Rummage',
  'combo:generic': '⚡ Combo (recipe-defined)',
});

export const comboRecipeLabel = (recipeId) =>
  COMBO_RECIPE_LABELS[recipeId]
  ?? (recipeId.startsWith('ultra:three-black-') ? `🌠3B · ${recipeId.slice('ultra:three-black-'.length)}` : `⚡ ${recipeId}`);

const BREAKER_REASON = '4♥ Combo Breaker has no implementation in this engine build — broken is reported as unavailable, never inferred.';

// ── Per-summary normalization ─────────────────────────────────────────────

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const rate = (n, d) => (d > 0 ? n / d : null);

/**
 * Normalize one match summary into combo observations.
 * @returns {{ source: string, lifecycleCovered: boolean, records: Array,
 *   seatOpportunities: Map<number, number>, seatRecipeOpportunities: Map<string, number>,
 *   seatContexts: Map<number, {action:number,response:number,ahead:number,tied:number,behind:number}> }}
 */
function matchObservations(summary) {
  const telemetry = summary?.comboTelemetry;
  const participants = summary?.participants ?? [];
  const seatOfPlayer = new Map(participants.map((p) => [p.playerId, p.seat]));
  const policyOfSeat = new Map(participants.map((p) => [p.seat, p.policyId]));
  const resultOfSeat = new Map(participants.map((p) => [p.seat, p.result]));
  if (telemetry && (Array.isArray(telemetry.records) || Array.isArray(telemetry.seats))) {
    const seatOpportunities = new Map();
    const seatRecipeOpportunities = new Map();
    const seatContexts = new Map();
    for (const seat of telemetry.seats ?? []) {
      seatOpportunities.set(seat.seat, num(seat.opportunityFrames));
      seatContexts.set(seat.seat, {
        action: num(seat.actionOpportunityFrames),
        response: num(seat.responseOpportunityFrames),
        ahead: num(seat.opportunityContexts?.ahead),
        tied: num(seat.opportunityContexts?.tied),
        behind: num(seat.opportunityContexts?.behind),
      });
      for (const [recipeId, r] of Object.entries(seat.recipes ?? {})) {
        const key = `${seat.seat}|${recipeId}`;
        seatRecipeOpportunities.set(key, num(r.opportunities));
      }
    }
    const records = (telemetry.records ?? []).map((r) => ({
      ...r,
      policyId: r.policyId ?? policyOfSeat.get(r.seat) ?? null,
      wonMatch: r.wonMatch ?? (resultOfSeat.get(r.seat) === 'win' ? true : resultOfSeat.get(r.seat) === 'loss' ? false : null),
      lifecycleStatus: ['resolved', 'countered', 'fizzled', 'broken', 'pending'].includes(r.status) ? r.status : 'pending',
    }));
    return { source: 'combo-telemetry', lifecycleCovered: true, records, seatOpportunities, seatRecipeOpportunities, seatContexts, capability: telemetry.capability ?? null };
  }
  // Legacy fallback: rankDecisions retain the full authorized legal sets, so
  // opportunities and declarations are real. Lifecycle is unobserved.
  const records = [];
  const seatOpportunities = new Map();
  const seatRecipeOpportunities = new Map();
  const seatContexts = new Map();
  for (const rd of summary?.rankDecisions ?? []) {
    const seat = seatOfPlayer.get(rd.participantId);
    if (seat == null) continue;
    const recipeCounts = new Map();
    for (const la of rd.legalActions ?? []) {
      const recipeId = comboRecipeId(la);
      if (!recipeId) continue;
      recipeCounts.set(recipeId, (recipeCounts.get(recipeId) ?? 0) + 1);
    }
    if (recipeCounts.size) {
      seatOpportunities.set(seat, (seatOpportunities.get(seat) ?? 0) + 1);
      for (const [recipeId] of recipeCounts) {
        const key = `${seat}|${recipeId}`;
        seatRecipeOpportunities.set(key, (seatRecipeOpportunities.get(key) ?? 0) + 1);
      }
    }
    if (isComboActionRecord(rd.action)) {
      const ranks = rd.rankAttribution?.sourceRanks?.length ? [...new Set(rd.rankAttribution.sourceRanks)] : [];
      records.push({
        comboId: `CBF-${summary.matchId}:${rd.decisionIndex}`,
        matchId: summary.matchId, seat, actorId: rd.participantId,
        policyId: policyOfSeat.get(seat) ?? null,
        decisionOrdinal: rd.decisionIndex, fullTurn: null, phase: null,
        comboClass: comboClassOf(rd.action), recipeId: comboRecipeId(rd.action),
        mode: rd.action?.mode ?? null, timingClass: rd.action?.timingClass ?? null,
        declarationContext: rd.action?.timingClass === 'ACTION' ? 'action' : 'response',
        committedCardCount: rd.rankAttribution?.sourceRanks?.length ?? null,
        componentRanks: ranks, componentSuits: [], componentIdentities: [],
        status: 'unobserved', lifecycleStatus: 'unobserved',
        failureReason: null, counterKind: null, breakerCardId: null,
        scoreBefore: null, scoreAfter: null, scoreDelta: null,
        scoreDiffBefore: null,
        wonMatch: resultOfSeat.get(seat) === 'win' ? true : resultOfSeat.get(seat) === 'loss' ? false : null,
        evidence: ['rank-decisions-fallback'],
      });
    }
  }
  return { source: records.length || [...seatOpportunities.values()].some((v) => v > 0) ? 'rank-decisions-fallback' : 'none', lifecycleCovered: false, records, seatOpportunities, seatRecipeOpportunities, seatContexts, capability: null };
}

const isComboActionRecord = (action) => comboClassOf(action) !== null;

// ── Stratified association (same inverse-variance estimator as the
//    Mechanics Atlas, keyed on an arbitrary predicate) ─────────────────────

function stratifiedAssociation(units, hasIt) {
  const strata = new Map();
  for (const row of units.filter(unitDecisive)) {
    const key = stratumKey(row);
    if (!strata.has(key)) strata.set(key, { used: [], unused: [] });
    const group = strata.get(key);
    if (hasIt(row)) group.used.push(row); else group.unused.push(row);
  }
  let pooledDiff = 0, pooledWeight = 0, contributingStrata = 0, skippedStrata = 0;
  for (const group of strata.values()) {
    if (!group.used.length || !group.unused.length) { skippedStrata += 1; continue; }
    const usedWins = group.used.reduce((s, r) => s + unitWon(r), 0);
    const unusedWins = group.unused.reduce((s, r) => s + unitWon(r), 0);
    const p1 = usedWins / group.used.length, p0 = unusedWins / group.unused.length;
    const v = (p1 * (1 - p1)) / group.used.length + (p0 * (1 - p0)) / group.unused.length;
    if (v <= 0) { skippedStrata += 1; continue; }
    const w = 1 / v;
    pooledDiff += (p1 - p0) * w; pooledWeight += w; contributingStrata += 1;
  }
  if (pooledWeight === 0) return { estimate: null, interval: [null, null], contributingStrata: 0, skippedStrata };
  const estimate = pooledDiff / pooledWeight;
  const se = Math.sqrt(1 / pooledWeight);
  return { estimate, interval: [estimate - 1.959963984540054 * se, estimate + 1.959963984540054 * se], contributingStrata, skippedStrata };
}

// ── Main aggregator ───────────────────────────────────────────────────────

/**
 * Build the Combo Atlas + Combo Intelligence analytics block from match
 * summaries. Every metric carries an explicit availability contract — missing
 * telemetry, zero opportunities, and unavailable engine behavior are distinct.
 */
export function buildComboAtlas(summaries) {
  const rows = (summaries ?? []).filter(Boolean);
  const observations = rows.map((summary) => ({ summary, obs: matchObservations(summary) }));
  const telemetryMatches = observations.filter((o) => o.obs.source === 'combo-telemetry').length;
  const fallbackMatches = observations.filter((o) => o.obs.source === 'rank-decisions-fallback').length;
  const lifecycleCoveredMatches = observations.filter((o) => o.obs.lifecycleCovered).length;

  const allRecords = [];
  const participantUnits = [];
  const recipeMap = new Map();
  const rankMap = new Map();
  const cardMap = new Map();
  const suitMap = new Map();
  const policyMap = new Map();
  const committedDistribution = {};
  const counterAuthorities = {};
  const contextTotals = {
    action: { opportunities: 0, declarations: 0 },
    response: { opportunities: 0, declarations: 0 },
    ahead: { opportunities: 0, declarations: 0 },
    tied: { opportunities: 0, declarations: 0 },
    behind: { opportunities: 0, declarations: 0 },
  };
  const trends = [];
  let gamesWithCombo = 0;

  const policyEntry = (policyId) => {
    if (!policyMap.has(policyId)) policyMap.set(policyId, {
      policyId, participations: 0, decisive: 0, wins: 0,
      opportunities: 0, declarations: 0,
      resolved: 0, countered: 0, fizzled: 0, broken: 0, pending: 0, unobserved: 0,
      contexts: { action: 0, response: 0, ahead: 0, tied: 0, behind: 0 },
      recipes: new Set(),
    });
    return policyMap.get(policyId);
  };
  const recipeEntry = (recipeId) => {
    if (!recipeMap.has(recipeId)) recipeMap.set(recipeId, {
      recipeId, label: comboRecipeLabel(recipeId), comboClass: recipeId.split(':')[0],
      uses: 0, opportunities: 0,
      resolved: 0, countered: 0, fizzled: 0, broken: 0, pending: 0, unobserved: 0,
      committedCards: [],
      wins: 0, decisive: 0,
    });
    return recipeMap.get(recipeId);
  };

  for (const { summary, obs } of observations) {
    const declarations = obs.records.length;
    if (declarations > 0) gamesWithCombo += 1;
    trends.push({ matchId: summary.matchId, declarations, resolved: obs.records.filter((r) => r.lifecycleStatus === 'resolved').length });
    for (const [seat, opportunities] of obs.seatOpportunities) {
      const policyId = summary.participants?.find((p) => p.seat === seat)?.policyId ?? null;
      if (policyId) policyEntry(policyId).opportunities += opportunities;
      const ctx = obs.seatContexts.get(seat);
      if (ctx) {
        contextTotals.action.opportunities += ctx.action;
        contextTotals.response.opportunities += ctx.response;
        contextTotals.ahead.opportunities += ctx.ahead;
        contextTotals.tied.opportunities += ctx.tied;
        contextTotals.behind.opportunities += ctx.behind;
      }
    }
    for (const [key, opportunities] of obs.seatRecipeOpportunities) {
      const recipeId = key.slice(key.indexOf('|') + 1);
      recipeEntry(recipeId).opportunities += opportunities;
    }
    for (const record of obs.records) {
      allRecords.push(record);
      const status = record.lifecycleStatus ?? 'pending';
      committedDistribution[record.committedCardCount] = (committedDistribution[record.committedCardCount] ?? 0) + 1;
      if (record.counterKind) counterAuthorities[record.counterKind] = (counterAuthorities[record.counterKind] ?? 0) + 1;
      const policy = record.policyId ? policyEntry(record.policyId) : null;
      if (policy) {
        policy.declarations += 1;
        policy[status] = (policy[status] ?? 0) + 1;
        if (record.recipeId) policy.recipes.add(record.recipeId);
        if (record.declarationContext === 'action') policy.contexts.action += 1; else policy.contexts.response += 1;
        const diff = record.scoreDiffBefore;
        if (Number.isFinite(diff)) policy.contexts[diff > 0 ? 'ahead' : diff < 0 ? 'behind' : 'tied'] += 1;
      }
      if (record.declarationContext === 'action') contextTotals.action.declarations += 1; else contextTotals.response.declarations += 1;
      const diff = record.scoreDiffBefore;
      if (Number.isFinite(diff)) contextTotals[diff > 0 ? 'ahead' : diff < 0 ? 'behind' : 'tied'].declarations += 1;
      if (record.recipeId) {
        const recipe = recipeEntry(record.recipeId);
        recipe.uses += 1;
        recipe[status] = (recipe[status] ?? 0) + 1;
        if (Number.isFinite(record.committedCardCount)) recipe.committedCards.push(record.committedCardCount);
        if (record.wonMatch === true) { recipe.wins += 1; recipe.decisive += 1; }
        else if (record.wonMatch === false) recipe.decisive += 1;
      }
      for (const rank of record.componentRanks ?? []) {
        const e = rankMap.get(rank) ?? { rank, declarations: 0, resolved: 0, countered: 0, fizzled: 0 };
        e.declarations += 1;
        if (status === 'resolved') e.resolved += 1;
        else if (status === 'countered') e.countered += 1;
        else if (status === 'fizzled') e.fizzled += 1;
        rankMap.set(rank, e);
      }
      for (const identity of record.componentIdentities ?? []) {
        const e = cardMap.get(identity) ?? { identity, declarations: 0, resolved: 0 };
        e.declarations += 1;
        if (status === 'resolved') e.resolved += 1;
        cardMap.set(identity, e);
      }
      for (const suit of record.componentSuits ?? []) {
        const e = suitMap.get(suit) ?? { suit, declarations: 0 };
        e.declarations += 1;
        suitMap.set(suit, e);
      }
    }
    // Per-participant analysis units (win association + propensity).
    for (const participant of summary.participants ?? []) {
      const seatRecords = obs.records.filter((r) => r.seat === participant.seat);
      const opportunities = num(participant.comboOpportunityCount) || num(obs.seatOpportunities.get(participant.seat));
      participantUnits.push({
        matchId: summary.matchId, profileId: summary.profileId, seat: participant.seat,
        policyId: participant.policyId,
        _decisive: participant.result === 'win' || participant.result === 'loss',
        _won: participant.result === 'win' ? 1 : 0,
        _stratum: `${summary.profileId}|${participant.policyId}|seat:${participant.seat}`,
        comboUsed: seatRecords.length > 0 || num(participant.comboDeclarationCount) > 0,
        comboDeclarations: Math.max(seatRecords.length, num(participant.comboDeclarationCount)),
        comboOpportunities: opportunities,
        comboResolved: seatRecords.filter((r) => r.lifecycleStatus === 'resolved').length,
        recipesUsed: new Set(seatRecords.map((r) => r.recipeId).filter(Boolean)),
      });
      const policy = policyEntry(participant.policyId);
      policy.participations += 1;
      if (participant.result === 'win' || participant.result === 'loss') {
        policy.decisive += 1;
        if (participant.result === 'win') policy.wins += 1;
      }
    }
  }

  const totalDeclarations = allRecords.length;
  const totalOpportunities = participantUnits.reduce((s, u) => s + u.comboOpportunities, 0);
  const statusCount = (status) => allRecords.filter((r) => r.lifecycleStatus === status).length;
  const resolved = statusCount('resolved'), countered = statusCount('countered'),
    fizzled = statusCount('fizzled'), broken = statusCount('broken'),
    pending = statusCount('pending'), unobserved = statusCount('unobserved');
  const lifecycleTotal = resolved + countered + fizzled + broken + pending;
  const lifecycleCovered = lifecycleCoveredMatches === rows.length && rows.length > 0;
  const committed = allRecords.map((r) => r.committedCardCount).filter((v) => Number.isFinite(v));

  // Win association units: combo-users vs non-users (participant level).
  const usedUnits = participantUnits.filter((u) => u.comboUsed);
  const unusedUnits = participantUnits.filter((u) => !u.comboUsed);
  const usedDecisive = usedUnits.filter(unitDecisive), unusedDecisive = unusedUnits.filter(unitDecisive);
  const rawAssociation = differenceInProportions(
    usedDecisive.reduce((s, u) => s + unitWon(u), 0), usedDecisive.length,
    unusedDecisive.reduce((s, u) => s + unitWon(u), 0), unusedDecisive.length,
  );
  const adjustedAssociation = stratifiedAssociation(participantUnits, (u) => u.comboUsed);

  const recipes = [...recipeMap.values()].map((r) => {
    const settled = r.resolved + r.countered + r.fizzled + r.broken;
    const association = stratifiedAssociation(participantUnits, (u) => u.recipesUsed?.has?.(r.recipeId) ?? false);
    return {
      ...r,
      committedCards: undefined,
      avgCommittedCards: r.committedCards.length ? r.committedCards.reduce((a, b) => a + b, 0) / r.committedCards.length : null,
      pickRate: rate(r.uses, r.opportunities),
      pickRateStatus: r.opportunities > 0 ? { status: 'available', numerator: r.uses, denominator: r.opportunities }
        : r.uses > 0 ? { status: 'missing-telemetry', reasonCode: 'MISSING_OPPORTUNITY_TELEMETRY' }
        : { status: 'zero-opportunities', reasonCode: 'NO_LEGAL_OPPORTUNITIES' },
      resolveRate: lifecycleCoveredMatches > 0 ? rate(r.resolved, settled) : null,
      counterRate: lifecycleCoveredMatches > 0 ? rate(r.countered, settled) : null,
      fizzleRate: lifecycleCoveredMatches > 0 ? rate(r.fizzled, settled) : null,
      breakRate: null,
      breakRateStatus: { status: 'unavailable', reasonCode: 'BREAKER_NOT_IMPLEMENTED', detail: BREAKER_REASON },
      winRate: rate(r.wins, r.decisive),
      adjustedAssociation: association.estimate, adjustedAssociation95: association.interval,
      adjustedAssociationStatus: association.estimate != null
        ? { status: 'available', contributingStrata: association.contributingStrata }
        : { status: 'insufficient-sample', reasonCode: 'INSUFFICIENT_STRATA', detail: 'No stratum had both recipe-users and non-users.' },
      evidenceGrade: evidenceGradeLegacy({ sampleSize: r.uses, interval: association.interval, qValue: 1 }),
      lifecycleCoverage: lifecycleCovered ? 'covered' : lifecycleCoveredMatches > 0 ? 'partial' : 'unavailable',
    };
  }).sort((a, b) => b.uses - a.uses);

  const policies = [...policyMap.values()].map((p) => {
    const propensity = rate(p.declarations, p.opportunities);
    const decisive = p.decisive;
    const winRate = rate(p.wins, decisive);
    // Within-policy association: units where this policy comboed vs not.
    const policyUnits = participantUnits.filter((u) => u.policyId === p.policyId);
    const association = stratifiedAssociation(policyUnits, (u) => u.comboUsed);
    return {
      policyId: p.policyId,
      participations: p.participations, decisiveGames: decisive,
      wins: p.wins, winRate, winRate95: wilsonInterval(p.wins, decisive),
      opportunities: p.opportunities, declarations: p.declarations,
      comboPropensity: propensity,
      comboPropensityStatus: p.opportunities > 0 ? { status: 'available', numerator: p.declarations, denominator: p.opportunities }
        : { status: 'zero-opportunities', reasonCode: 'NO_LEGAL_OPPORTUNITIES' },
      resolveRate: lifecycleCoveredMatches > 0 ? rate(p.resolved, p.resolved + p.countered + p.fizzled + p.broken) : null,
      lifecycle: { resolved: p.resolved, countered: p.countered, fizzled: p.fizzled, broken: p.broken, pending: p.pending, unobserved: p.unobserved },
      contexts: p.contexts,
      recipeDiversity: p.recipes.size,
      adjustedAssociation: association.estimate, adjustedAssociation95: association.interval,
      evidenceGrade: evidenceGradeLegacy({ sampleSize: p.declarations, interval: association.interval, qValue: 1 }),
    };
  }).sort((a, b) => (b.comboPropensity ?? -1) - (a.comboPropensity ?? -1));

  const pickRate = rate(totalDeclarations, totalOpportunities);
  const settleDenominator = resolved + countered + fizzled + broken;
  return {
    schemaVersion: COMBO_ANALYTICS_SCHEMA_VERSION,
    coverage: {
      matches: rows.length,
      telemetryMatches, fallbackMatches, lifecycleCoveredMatches,
      lifecycleStatus: rows.length === 0 ? 'no-data' : lifecycleCovered ? 'covered' : lifecycleCoveredMatches > 0 ? 'partial' : 'unavailable',
      opportunitiesStatus: totalOpportunities > 0 || participantUnits.length > 0 ? 'covered' : 'unavailable',
      brokenStatus: 'unavailable',
      brokenReason: BREAKER_REASON,
    },
    totals: {
      opportunities: totalOpportunities,
      declarations: totalDeclarations,
      pickRate,
      pickRateStatus: totalOpportunities > 0 ? { status: 'available', numerator: totalDeclarations, denominator: totalOpportunities }
        : { status: 'zero-opportunities', reasonCode: 'NO_LEGAL_OPPORTUNITIES', detail: 'No legal Combo opportunities in this dataset.' },
      uncountered: resolved + fizzled + pending,
      resolved, countered, fizzled, broken, pending, unobserved,
      resolveRate: lifecycleCoveredMatches > 0 ? rate(resolved, settleDenominator) : null,
      counterRate: lifecycleCoveredMatches > 0 ? rate(countered, settleDenominator) : null,
      fizzleRate: lifecycleCoveredMatches > 0 ? rate(fizzled, settleDenominator) : null,
      gamesWithCombo,
      combosPerGame: rate(totalDeclarations, rows.length),
      combosPerParticipantGame: rate(totalDeclarations, participantUnits.length),
      avgCommittedCards: committed.length ? committed.reduce((a, b) => a + b, 0) / committed.length : null,
      maxCommittedCards: committed.length ? Math.max(...committed) : null,
      rawWinAssociation: rawAssociation.estimate, rawWinAssociation95: rawAssociation.interval,
      adjustedWinAssociation: adjustedAssociation.estimate, adjustedWinAssociation95: adjustedAssociation.interval,
      adjustedWinAssociationStatus: adjustedAssociation.estimate != null
        ? { status: 'available', contributingStrata: adjustedAssociation.contributingStrata, skippedStrata: adjustedAssociation.skippedStrata }
        : { status: 'insufficient-sample', reasonCode: 'INSUFFICIENT_STRATA' },
    },
    funnel: {
      opportunities: totalOpportunities, declared: totalDeclarations,
      uncountered: resolved + fizzled + pending, resolved, countered, fizzled,
      broken, brokenStatus: 'unavailable',
      coverage: lifecycleCoveredMatches > 0 ? 'covered' : 'unavailable',
    },
    lifecycle: {
      counts: { resolved, countered, fizzled, broken, pending, unobserved },
      counterAuthorities: Object.fromEntries(Object.entries(counterAuthorities).sort((a, b) => b[1] - a[1])),
      brokenStatus: 'unavailable',
      brokenReason: BREAKER_REASON,
      coverage: lifecycleCoveredMatches > 0 ? 'covered' : 'unavailable',
      settledTotal: lifecycleTotal,
    },
    committedDistribution: Object.fromEntries(Object.entries(committedDistribution).sort(([a], [b]) => Number(a) - Number(b))),
    recipes,
    components: {
      ranks: [...rankMap.values()].sort((a, b) => b.declarations - a.declarations),
      cards: [...cardMap.values()].sort((a, b) => b.declarations - a.declarations),
      suits: [...suitMap.values()].sort((a, b) => b.declarations - a.declarations),
    },
    policies,
    contexts: {
      byDeclarationContext: contextTotals.action || contextTotals.response ? {
        action: { ...contextTotals.action, pickRate: rate(contextTotals.action.declarations, contextTotals.action.opportunities) },
        response: { ...contextTotals.response, pickRate: rate(contextTotals.response.declarations, contextTotals.response.opportunities) },
      } : null,
      byScoreDifferential: {
        ahead: { ...contextTotals.ahead, pickRate: rate(contextTotals.ahead.declarations, contextTotals.ahead.opportunities) },
        tied: { ...contextTotals.tied, pickRate: rate(contextTotals.tied.declarations, contextTotals.tied.opportunities) },
        behind: { ...contextTotals.behind, pickRate: rate(contextTotals.behind.declarations, contextTotals.behind.opportunities) },
      },
    },
    trends,
    records: allRecords,
    limitations: [
      'Combo opportunity counts are decision frames where ≥1 canonical Combo action was legal — not per-target/permutation counts.',
      lifecycleCovered
        ? 'Lifecycle (resolved/countered/fizzled) is derived from authority events.'
        : lifecycleCoveredMatches > 0
          ? `Lifecycle coverage is partial — ${lifecycleCoveredMatches}/${rows.length} matches carry combo telemetry.`
          : 'Lifecycle unavailable — dataset predates combo telemetry; only opportunities and declarations are measured.',
      BREAKER_REASON,
      'Win association is an observational association, not causal proof.',
    ],
  };
}
