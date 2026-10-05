// observatory-bridge.mjs — Convert Evolution Lab game records into the
// campaign-style match summary contract consumed by buildObservatoryAnalytics
// and campaignAggregate (Mechanics, Synergies, Ranks, Compare, History).
//
// Honesty contract: fields are copied only from data the record actually
// retained. Records written before telemetry retention (or produced by
// foreign/older implementations) fall back to seatBehavior-derived
// participants with mechanicCounts only — opportunity counts, response
// timing and rankDecisions stay absent rather than fabricated.

/** Per-seat participant row in the Observatory summary contract. */
function participantRow(record, run, seatIndex, seatStat) {
  const profileId = run.config?.profileId ?? run.profileId ?? null;
  const seat = seatIndex + 1;
  const playerId = `P${seat}`;
  const result = record.winner === 'DRAW' ? 'draw'
    : record.winner === 'ABORTED' ? 'abort'
    : record.winner === playerId ? 'win' : 'loss';
  const families = seatStat?.actionCounts ?? {};
  return {
    participantId: `${record.matchId}:seat-${seat}`, matchId: record.matchId, seat, playerId,
    policyId: record.policyIds?.[seatIndex] ?? null, profileId, result,
    scoreFor: seat === 1 ? record.scoreP1 : record.scoreP2,
    scoreAgainst: seat === 1 ? record.scoreP2 : record.scoreP1,
    decisionCount: seatStat?.decisions ?? 0,
    mechanicCounts: seatStat?.mechanicCounts ?? {},
    // Newer records retain full participants — preferred upstream.
    ...(seatStat?.primaryMechanicCounts ? { primaryMechanicCounts: seatStat.primaryMechanicCounts } : {}),
    ...(seatStat?.mechanicOpportunityCounts ? { mechanicOpportunityCounts: seatStat.mechanicOpportunityCounts } : {}),
    ...(seatStat?.primaryMechanicOpportunityCounts ? { primaryMechanicOpportunityCounts: seatStat.primaryMechanicOpportunityCounts } : {}),
    // decisionFamilyCounts are keyed per family on participant rows.
    ...(families.voltage != null ? { voltageDecisionCount: families.voltage } : {}),
    ...(families.ultra != null ? { ultraDecisionCount: families.ultra } : {}),
    ...(families['private-choice'] != null ? { privateChoiceDecisionCount: families['private-choice'] } : {}),
  };
}

/** Sum a per-key counter across participant rows. */
function sumParticipantCounts(participants, key) {
  const out = {};
  let any = false;
  for (const p of participants) for (const [k, v] of Object.entries(p[key] ?? {})) { out[k] = (out[k] ?? 0) + v; any = true; }
  return any ? out : null;
}

/**
 * Convert one lab game record into an Observatory summary row.
 * `pairId` is supplied by observatorySummariesForRun once AB/BA pairing is
 * verified against the sibling record.
 */
export function observatorySummaryForRecord(record, run, { pairId = null } = {}) {
  const profileId = run.config?.profileId ?? run.profileId ?? null;
  const participants = Array.isArray(record.participants) && record.participants.length
    ? record.participants
    : (record.seatBehavior ?? []).map((b, i) => participantRow(record, run, i, b));
  const summary = {
    schemaVersion: '4.1.0', analyticsSchemaVersion: '4.2.0',
    matchId: record.matchId, matchOrdinal: record.ordinal, seed: record.seed,
    profileId, seatOrder: ['P1', 'P2'], policyIds: [...(record.policyIds ?? [])],
    ...(pairId ? { pairedRunId: pairId } : {}),
    seatSwapped: record.swapped === true,
    winner: record.winner, winningSeat: record.winningSeat ?? null,
    terminationReason: record.terminationReason,
    completedFullTurns: record.turns ?? 0,
    policyDecisionCount: record.decisions ?? 0,
    policyActionCount: record.policyActionCount ?? 0,
    actionCount: record.actionCount ?? 0,
    passActionCount: record.passActionCount ?? 0,
    miniTurnCount: record.miniTurns ?? 0,
    commandCount: record.commandCount ?? 0,
    finalScores: { P1: record.scoreP1 ?? 0, P2: record.scoreP2 ?? 0 },
    scoreMargin: (record.scoreP1 ?? 0) - (record.scoreP2 ?? 0),
    finalStateHash: record.finalStateHash ?? null,
    matchResultHash: record.resultHash ?? null,
    participants,
    mechanicCounts: record.mechanicCounts ?? sumParticipantCounts(participants, 'mechanicCounts') ?? {},
    // Match-level counters copied verbatim when the record retained them —
    // never synthesized for older records.
    decisionFamilyCounts: record.decisionFamilyCounts ?? record.actionCounts ?? {},
    eventTypeCounts: record.eventTypeCounts ?? record.eventCounts ?? {},
    ...(record.mechanicOpportunityCounts ? { mechanicOpportunityCounts: record.mechanicOpportunityCounts } : (sumParticipantCounts(participants, 'mechanicOpportunityCounts') ? { mechanicOpportunityCounts: sumParticipantCounts(participants, 'mechanicOpportunityCounts') } : {})),
    ...(record.primaryMechanicCounts ? { primaryMechanicCounts: record.primaryMechanicCounts } : (sumParticipantCounts(participants, 'primaryMechanicCounts') ? { primaryMechanicCounts: sumParticipantCounts(participants, 'primaryMechanicCounts') } : {})),
    ...(record.primaryMechanicOpportunityCounts ? { primaryMechanicOpportunityCounts: record.primaryMechanicOpportunityCounts } : {}),
    ...(record.rankDecisions ? { rankDecisions: record.rankDecisions } : {}),
    ruleCompliance: { status: record.ruleCompliance ?? 'UNAVAILABLE' },
    // Provenance: Observatory rows keep lab lineage for filtering/reporting.
    telemetryOrigin: 'EVOLUTION_LAB',
    labRunId: run.runId,
    evidenceOrigin: record.evidenceOrigin ?? 'LOCAL',
    fingerprint: record.fingerprint ?? run.identity?.fingerprint ?? null,
  };
  for (const key of ['responseOpportunityCount', 'responsePlayedCount', 'responseDeclinedWithOptionsCount', 'meaningfulResponseDecisionCount', 'miniTurnActionCount', 'exhaustedPassActionCount', 'triggerCount', 'privateChoiceDecisionCount', 'advancedDecisionCount', 'voltageDecisionCount', 'ultraDecisionCount']) {
    if (record[key] != null) summary[key] = record[key];
  }
  return summary;
}

/**
 * Convert all records of a run. AB/BA pairing is derived honestly from the
 * run's own design: ordinals 2k/2k+1 share a seed and have complementary
 * swapped flags when config.mirrorSeats is on.
 */
export function observatorySummariesForRun(run) {
  const records = run?.records ?? [];
  const byOrdinal = new Map(records.map(r => [r.ordinal, r]));
  return records.map(record => {
    let pairId = null;
    if (run.config?.mirrorSeats) {
      const partnerOrdinal = record.ordinal % 2 === 0 ? record.ordinal + 1 : record.ordinal - 1;
      const partner = byOrdinal.get(partnerOrdinal);
      if (partner && partner.seed === record.seed && partner.swapped !== record.swapped) {
        pairId = `${run.runId}:pair:${Math.floor(record.ordinal / 2)}`;
      }
    }
    return observatorySummaryForRecord(record, run, { pairId });
  });
}

/**
 * Report which telemetry families the converted summaries actually carry —
 * surfaced to the user so partial-fidelity datasets are not mistaken for
 * campaign-grade telemetry.
 */
export function observatoryCoverage(summaries) {
  const total = summaries.length;
  const has = pred => summaries.filter(pred).length;
  return {
    matches: total,
    withParticipants: has(s => s.participants?.some(p => p.mechanicCounts && Object.keys(p.mechanicCounts).length)),
    withOpportunityCounts: has(s => s.mechanicOpportunityCounts && Object.keys(s.mechanicOpportunityCounts).length),
    withRankDecisions: has(s => s.rankDecisions?.length),
    withResponseCounters: has(s => s.responseOpportunityCount != null),
    imported: has(s => s.evidenceOrigin === 'IMPORTED_UNVERIFIED'),
  };
}
