// paired-abba.mjs — canonical paired AB/BA analysis.
//
// SEMANTIC MODEL (documented per experimental-integrity audit):
//   - `policyIds[i]` is ALWAYS the policy bound to physical seat i+1. The
//     runtime binds policies to seats in array order; `seatOrder` only decides
//     which player label (P1/P2) occupies which seat. Therefore reversing
//     `seatOrder` alone does NOT swap policy↔seat assignment — that was the
//     historical label-only swap defect (LEGACY_LABEL_ONLY_SWAP).
//   - A valid AB/BA block: two legs with complementary seat assignments —
//     leg1 [A@seat1, B@seat2], leg2 [B@seat1, A@seat2].
//   - `pairedRunId` identifies the block; `pairedLeg` ('AB'|'BA') or the
//     legacy `seatSwapped` flag declares leg orientation. Declarations are
//     never trusted — verification compares actual policy↔seat assignments.
//   - Statistical unit = the paired block, aggregated per matchup.
//
// This module is mirrored verbatim into apps/lab-web/dist/shared-analytics by
// scripts/build.mjs — pure math/data only, no Node-specific imports.

import { wilsonInterval } from '@intrilex/statistics/estimators';
import { binomialSignTest, mcnemarPairedTest, pairedBootstrapABBA } from '@intrilex/statistics/paired-tests';
import { ANALYTICS_SCHEMA_VERSION } from './metric-registry.mjs';

export const PAIRED_ABBA_SCHEMA_VERSION = '2.0.0';

export const PAIR_BLOCK_REASON = Object.freeze({
  INCOMPLETE_PAIR: 'INCOMPLETE_PAIR',
  BLOCK_SIZE_UNEXPECTED: 'BLOCK_SIZE_UNEXPECTED',
  SEAT_ASSIGNMENT_UNRESOLVABLE: 'SEAT_ASSIGNMENT_UNRESOLVABLE',
  PAIR_POLICY_MISMATCH: 'PAIR_POLICY_MISMATCH',
  SEAT_ASSIGNMENT_MISMATCH: 'SEAT_ASSIGNMENT_MISMATCH',
  SEAT_ASSIGNMENT_NOT_REVERSED: 'SEAT_ASSIGNMENT_NOT_REVERSED',
  LEGACY_LABEL_ONLY_SWAP: 'LEGACY_LABEL_ONLY_SWAP',
});

export const PAIR_DESIGN_STATUS = Object.freeze({
  VERIFIED: 'verified',
  VERIFIED_UNBALANCED: 'verified-unbalanced',
  INCOMPLETE: 'incomplete',
  MALFORMED: 'malformed',
  UNPAIRED: 'unpaired',
  SELF_PLAY_ONLY: 'self-play-only',
  NO_DATA: 'no-data',
});

const num = (v) => (Number.isFinite(v) ? v : 0);

function policiesOf(row) {
  if (Array.isArray(row?.policyIds) && row.policyIds.length) return row.policyIds.filter((p) => p != null);
  if (Array.isArray(row?.participants)) return row.participants.map((p) => p?.policyId).filter((p) => p != null);
  return [];
}

/** Policy bound to a physical seat in one summary row. */
export function seatPolicyOf(row, seat) {
  if (Array.isArray(row?.participants)) {
    const p = row.participants.find((x) => x?.seat === seat);
    if (p?.policyId != null) return p.policyId;
  }
  return row?.policyIds?.[seat - 1] ?? null;
}

/** [seat1Policy, seat2Policy] for one summary row. */
export function seatAssignmentOf(row) {
  return [seatPolicyOf(row, 1), seatPolicyOf(row, 2)];
}

/** Declared leg orientation — explicit `pairedLeg`, else legacy `seatSwapped`. */
export function declaredLegOf(row) {
  if (row?.pairedLeg === 'AB' || row?.pairedLeg === 'BA') return row.pairedLeg;
  return row?.seatSwapped === true ? 'BA' : 'AB';
}

/** Canonical matchup key — order-free policy pair. */
export function matchupKeyOf(row) {
  const policies = policiesOf(row);
  return policies.length ? [...policies].sort().join('__vs__') : 'unknown';
}

/** Physical seat of the winning player label (1|2|null). */
export function winningSeatOf(row) {
  if (row?.winningSeat === 1 || row?.winningSeat === 2) return row.winningSeat;
  const idx = Array.isArray(row?.seatOrder) ? row.seatOrder.indexOf(row?.winner) : -1;
  return idx >= 0 ? idx + 1 : null;
}

/** Policy credited with the win (null on draw/abort/unresolvable). */
export function winningPolicyOf(row) {
  const seat = winningSeatOf(row);
  return seat == null ? null : seatPolicyOf(row, seat);
}

/**
 * Verify one candidate AB/BA block (rows sharing a pairedRunId, or an
 * adjacency pair under legacy schedules). Returns the legs with resolved
 * seat assignments plus a fail-closed reason code when the block cannot be
 * proven to be a true policy↔seat reversal.
 */
export function verifyPairBlock(rows) {
  const legs = (rows ?? []).map((row) => ({
    row,
    seat1Policy: seatPolicyOf(row, 1),
    seat2Policy: seatPolicyOf(row, 2),
    declaredLeg: declaredLegOf(row),
  }));
  if (legs.length !== 2) {
    return { complete: false, verified: false, selfPlay: false, legs,
      reason: legs.length < 2 ? PAIR_BLOCK_REASON.INCOMPLETE_PAIR : PAIR_BLOCK_REASON.BLOCK_SIZE_UNEXPECTED };
  }
  const [x, y] = legs;
  const assignmentsKnown = [x.seat1Policy, x.seat2Policy, y.seat1Policy, y.seat2Policy].every((p) => p != null);
  if (!assignmentsKnown) {
    return { complete: true, verified: false, selfPlay: false, legs, reason: PAIR_BLOCK_REASON.SEAT_ASSIGNMENT_UNRESOLVABLE };
  }
  const samePool = [...policiesOf(x.row)].sort().join('|') === [...policiesOf(y.row)].sort().join('|');
  if (!samePool) {
    return { complete: true, verified: false, selfPlay: false, legs, reason: PAIR_BLOCK_REASON.PAIR_POLICY_MISMATCH };
  }
  const selfPlay = x.seat1Policy === x.seat2Policy && y.seat1Policy === y.seat2Policy;
  const identical = x.seat1Policy === y.seat1Policy && x.seat2Policy === y.seat2Policy;
  if (identical) {
    if (selfPlay) return { complete: true, verified: true, selfPlay: true, legs, reason: null };
    const claimedSwap = x.declaredLeg !== y.declaredLeg
      || JSON.stringify(x.row.seatOrder ?? null) !== JSON.stringify(y.row.seatOrder ?? null);
    return { complete: true, verified: false, selfPlay: false, legs,
      reason: claimedSwap ? PAIR_BLOCK_REASON.LEGACY_LABEL_ONLY_SWAP : PAIR_BLOCK_REASON.SEAT_ASSIGNMENT_NOT_REVERSED };
  }
  const complementary = x.seat1Policy === y.seat2Policy && x.seat2Policy === y.seat1Policy;
  if (!complementary) {
    return { complete: true, verified: false, selfPlay: false, legs, reason: PAIR_BLOCK_REASON.SEAT_ASSIGNMENT_MISMATCH };
  }
  const warnings = [];
  if (x.declaredLeg === y.declaredLeg) warnings.push('LEG_DECLARED_CONFLICT');
  return { complete: true, verified: true, selfPlay, legs, reason: null, warnings };
}

function emptyMatchupResult(key) {
  return {
    policyPair: key, policyA: null, policyB: null,
    legs: 0, pairedBlocks: 0, incompleteBlocks: 0, malformedBlocks: 0,
    malformedReasons: {}, warnings: [],
    seatSwapVerified: false, designStatus: PAIR_DESIGN_STATUS.NO_DATA,
    design: 'matched AB/BA seat-swap', pairingBasis: null,
    seatExposure: {}, seatExposureBalanced: false,
    outcomes: { aWins: 0, bWins: 0, draws: 0, unresolved: 0 },
    winRates: null, seatConditioned: null, seatEffects: null,
    mcnemar: mcnemarPairedTest([]), bootstrap: pairedBootstrapABBA([]),
    interpretation: 'No data.',
  };
}

function matchupDesignStatus({ legs, pairedBlocks, incompleteBlocks, malformedBlocks, selfPlayOnly, exposureBalanced }) {
  if (!legs) return PAIR_DESIGN_STATUS.NO_DATA;
  if (selfPlayOnly) return PAIR_DESIGN_STATUS.SELF_PLAY_ONLY;
  if (malformedBlocks > 0) return PAIR_DESIGN_STATUS.MALFORMED;
  if (pairedBlocks === 0) return incompleteBlocks > 0 ? PAIR_DESIGN_STATUS.INCOMPLETE : PAIR_DESIGN_STATUS.UNPAIRED;
  if (incompleteBlocks > 0 || !exposureBalanced) return PAIR_DESIGN_STATUS.VERIFIED_UNBALANCED;
  return PAIR_DESIGN_STATUS.VERIFIED;
}

/**
 * Build the canonical paired AB/BA analysis over a summary set.
 * Rows are grouped by order-free matchup key, blocks are verified against
 * actual policy↔seat assignments, and inference aggregates across ALL
 * verified blocks of each matchup (never one test per block).
 */
export function buildPairedABBAAnalysis(summaries) {
  const rows = summaries ?? [];
  const hasPairedRunIds = rows.some((r) => r.pairedRunId != null);

  const matchups = new Map();
  for (const row of rows) {
    const key = matchupKeyOf(row);
    if (!matchups.has(key)) matchups.set(key, []);
    matchups.get(key).push(row);
  }

  const pairResults = [];
  let totalPairedBlocks = 0;
  let incompletePairs = 0;
  let malformedBlocks = 0;
  const blockReasonCounts = {};
  const globalSeat = { seat1Wins: 0, seat2Wins: 0, drawLegs: 0, unresolvedLegs: 0 };

  for (const [key, mrows] of [...matchups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    mrows.sort((a, b) => num(a.matchOrdinal) - num(b.matchOrdinal));
    const result = emptyMatchupResult(key);
    result.legs = mrows.length;
    result.pairingBasis = hasPairedRunIds ? 'paired-run-id' : 'adjacency-heuristic';

    // ── Form candidate blocks ────────────────────────────────────────────
    const blocks = [];
    if (hasPairedRunIds) {
      const byPair = new Map();
      const orphans = [];
      for (const row of mrows) {
        if (row.pairedRunId != null) {
          if (!byPair.has(row.pairedRunId)) byPair.set(row.pairedRunId, []);
          byPair.get(row.pairedRunId).push(row);
        } else orphans.push(row);
      }
      for (const [, block] of [...byPair.entries()].sort(([a], [b]) => String(a).localeCompare(String(b)))) {
        block.sort((a, b) => num(a.matchOrdinal) - num(b.matchOrdinal));
        blocks.push(block);
      }
      for (let i = 0; i < orphans.length; i += 2) blocks.push(orphans.slice(i, i + 2));
    } else {
      for (let i = 0; i < mrows.length; i += 2) blocks.push(mrows.slice(i, i + 2));
    }
    blocks.sort((a, b) => num(a[0]?.matchOrdinal) - num(b[0]?.matchOrdinal));

    // ── Canonical A/B orientation: seat-1 policy of the earliest leg that
    //    declares AB (or is unmarked) — under the fixed scheduler that is
    //    the first-listed policy of the pair. ─────────────────────────────
    const policies = [...new Set(mrows.flatMap(policiesOf))].sort();
    const anchor = mrows.find((r) => declaredLegOf(r) === 'AB') ?? mrows[0];
    const canonicalA = seatPolicyOf(anchor, 1) ?? policies[0] ?? null;
    const canonicalB = policies.find((p) => p !== canonicalA) ?? null;
    result.policyA = canonicalA;
    result.policyB = canonicalB;

    // ── Seat exposure over every leg in the matchup ─────────────────────
    const exposure = {};
    for (const row of mrows) {
      const [s1, s2] = seatAssignmentOf(row);
      for (const [seat, policy] of [[1, s1], [2, s2]]) {
        if (policy == null) continue;
        exposure[policy] ??= { seat1: 0, seat2: 0 };
        exposure[policy][seat === 1 ? 'seat1' : 'seat2'] += 1;
      }
    }
    result.seatExposure = exposure;
    result.seatExposureBalanced = Object.values(exposure).every((e) => e.seat1 === e.seat2) && Object.keys(exposure).length > 0;

    // ── Verify blocks and aggregate pair-level outcomes ─────────────────
    const mcnemarPairs = [];
    const seatConditioned = {};
    const seat = { seat1Wins: 0, seat2Wins: 0, drawLegs: 0, unresolvedLegs: 0 };
    const outcomes = { aWins: 0, bWins: 0, draws: 0, unresolved: 0 };
    let selfPlayBlocks = 0, verifiedBlocks = 0;

    for (const block of blocks) {
      const v = verifyPairBlock(block);
      if (!v.complete) {
        result.incompleteBlocks += 1;
        blockReasonCounts[v.reason] = (blockReasonCounts[v.reason] ?? 0) + 1;
        continue;
      }
      if (!v.verified) {
        result.malformedBlocks += 1;
        result.malformedReasons[v.reason] = (result.malformedReasons[v.reason] ?? 0) + 1;
        blockReasonCounts[v.reason] = (blockReasonCounts[v.reason] ?? 0) + 1;
        continue;
      }
      verifiedBlocks += 1;
      if (v.warnings?.length) result.warnings.push(...v.warnings);
      if (v.selfPlay) { selfPlayBlocks += 1; continue; }

      const abLeg = v.legs.find((l) => l.seat1Policy === canonicalA) ?? v.legs[0];
      const baLeg = v.legs.find((l) => l !== abLeg);
      if (abLeg.seat1Policy !== canonicalA || baLeg.seat1Policy !== canonicalB) {
        result.warnings.push('ORIENTATION_INCONSISTENT');
      }
      const abWinner = winningPolicyOf(abLeg.row);
      const baWinner = winningPolicyOf(baLeg.row);
      const pair = {
        pairedRunId: abLeg.row.pairedRunId ?? baLeg.row.pairedRunId ?? null,
        seatSwapped: true,
        aSeat1Win: abWinner === canonicalA,
        bSeat2Win: abWinner === canonicalB,
        aSeat2Win: baWinner === canonicalA,
        bSeat1Win: baWinner === canonicalB,
      };
      mcnemarPairs.push(pair);
      for (const leg of [abLeg, baLeg]) {
        const winner = winningPolicyOf(leg.row);
        const winnerSeat = winningSeatOf(leg.row);
        if (winner == null) {
          if (leg.row.winner === 'DRAW' || leg.row.terminationReason === 'CANONICAL_DRAW') { seat.drawLegs += 1; outcomes.draws += 1; }
          else { seat.unresolvedLegs += 1; outcomes.unresolved += 1; }
          continue;
        }
        if (winnerSeat === 1) seat.seat1Wins += 1; else if (winnerSeat === 2) seat.seat2Wins += 1;
        if (winner === canonicalA) outcomes.aWins += 1; else if (winner === canonicalB) outcomes.bWins += 1;
        for (const [seatIdx, policy] of [[1, leg.seat1Policy], [2, leg.seat2Policy]]) {
          seatConditioned[policy] ??= { seat1: { wins: 0, games: 0 }, seat2: { wins: 0, games: 0 } };
          const cell = seatConditioned[policy][seatIdx === 1 ? 'seat1' : 'seat2'];
          cell.games += 1;
          if (winner === policy) cell.wins += 1;
        }
      }
      for (const leg of [abLeg, baLeg]) {
        const winner = winningPolicyOf(leg.row);
        if (winner == null) { if (leg.row.winner === 'DRAW' || leg.row.terminationReason === 'CANONICAL_DRAW') globalSeat.drawLegs += 1; else globalSeat.unresolvedLegs += 1; }
        else if (winningSeatOf(leg.row) === 1) globalSeat.seat1Wins += 1;
        else globalSeat.seat2Wins += 1;
      }
    }

    result.pairedBlocks = mcnemarPairs.length;
    totalPairedBlocks += mcnemarPairs.length;
    incompletePairs += result.incompleteBlocks;
    malformedBlocks += result.malformedBlocks;
    result.outcomes = outcomes;
    result.seatSwapVerified = mcnemarPairs.length > 0 && result.malformedBlocks === 0;
    const selfPlayOnly = verifiedBlocks > 0 && selfPlayBlocks === verifiedBlocks;
    result.designStatus = matchupDesignStatus({
      legs: result.legs, pairedBlocks: result.pairedBlocks,
      incompleteBlocks: result.incompleteBlocks, malformedBlocks: result.malformedBlocks,
      selfPlayOnly, exposureBalanced: result.seatExposureBalanced,
    });

    const decisive = seat.seat1Wins + seat.seat2Wins;
    result.seatEffects = {
      seat1Wins: seat.seat1Wins, seat2Wins: seat.seat2Wins, decisiveLegs: decisive,
      drawLegs: seat.drawLegs, unresolvedLegs: seat.unresolvedLegs,
      seat1WinRate: decisive ? Math.round((seat.seat1Wins / decisive) * 10000) / 10000 : null,
      wilson95: decisive ? wilsonInterval(seat.seat1Wins, decisive) : null,
      signTest: binomialSignTest(seat.seat1Wins, decisive),
    };
    const cond = {};
    for (const [policy, cells] of Object.entries(seatConditioned)) {
      cond[policy] = {
        seat1: { ...cells.seat1, winRate: cells.seat1.games ? Math.round((cells.seat1.wins / cells.seat1.games) * 10000) / 10000 : null },
        seat2: { ...cells.seat2, winRate: cells.seat2.games ? Math.round((cells.seat2.wins / cells.seat2.games) * 10000) / 10000 : null },
      };
    }
    result.seatConditioned = cond;
    const decisiveOutcomes = outcomes.aWins + outcomes.bWins;
    result.winRates = decisiveOutcomes ? {
      [canonicalA ?? 'A']: { wins: outcomes.aWins, decisive: decisiveOutcomes, winRate: Math.round((outcomes.aWins / decisiveOutcomes) * 10000) / 10000, wilson95: wilsonInterval(outcomes.aWins, decisiveOutcomes) },
      [canonicalB ?? 'B']: { wins: outcomes.bWins, decisive: decisiveOutcomes, winRate: Math.round((outcomes.bWins / decisiveOutcomes) * 10000) / 10000, wilson95: wilsonInterval(outcomes.bWins, decisiveOutcomes) },
    } : null;

    result.mcnemar = mcnemarPairedTest(mcnemarPairs);
    result.bootstrap = pairedBootstrapABBA(mcnemarPairs, { seed: `abba:${key}:${mrows.length}` });
    const verifiedDesign = result.designStatus === PAIR_DESIGN_STATUS.VERIFIED || result.designStatus === PAIR_DESIGN_STATUS.VERIFIED_UNBALANCED;
    const mcnemarText = result.mcnemar.discordantPairs === 0
      ? `McNemar: no discordant blocks (n=${result.mcnemar.sampleSize}) — cannot distinguish policy performance.`
      : `McNemar b=${result.mcnemar.b}, c=${result.mcnemar.c} (${result.mcnemar.method}), p=${result.mcnemar.pValue}; seat-concordant s1=${result.mcnemar.seatEffectConcordant.seat1AlwaysWins}, s2=${result.mcnemar.seatEffectConcordant.seat2AlwaysWins}.`;
    result.interpretation = result.designStatus === PAIR_DESIGN_STATUS.MALFORMED
      ? 'Malformed AB/BA structure — policy↔seat reversal could not be verified; no policy-effect inference is licensed.'
      : result.designStatus === PAIR_DESIGN_STATUS.SELF_PLAY_ONLY
        ? 'Self-play matchup — excluded from cross-policy inference.'
        : !mcnemarPairs.length
          ? 'No verified complete pairs — insufficient data for paired inference.'
          : result.designStatus === PAIR_DESIGN_STATUS.VERIFIED
            ? `${mcnemarText} Policy↔seat assignment verified balanced across ${result.pairedBlocks} paired block(s).`
            : verifiedDesign
              ? `${mcnemarText} Seat exposure not fully balanced — treat the policy contrast as observational.`
              : `${mcnemarText} Pairing incomplete — inference covers verified blocks only.`;
    pairResults.push(result);
  }

  const decisive = globalSeat.seat1Wins + globalSeat.seat2Wins;
  const seatBalance = {
    seat1Wins: globalSeat.seat1Wins, seat2Wins: globalSeat.seat2Wins,
    decisiveLegs: decisive, drawLegs: globalSeat.drawLegs, unresolvedLegs: globalSeat.unresolvedLegs,
    seat1WinRate: decisive ? Math.round((globalSeat.seat1Wins / decisive) * 10000) / 10000 : null,
    wilson95: decisive ? wilsonInterval(globalSeat.seat1Wins, decisive) : null,
    signTest: binomialSignTest(globalSeat.seat1Wins, decisive),
    status: decisive === 0 ? 'not-applicable' : null,
  };
  seatBalance.status = decisive === 0 ? 'not-applicable'
    : (seatBalance.signTest.significantAt != null ? 'imbalanced' : 'balanced');

  const designStatus = pairResults.some((r) => r.designStatus === PAIR_DESIGN_STATUS.MALFORMED)
    ? 'malformed'
    : pairResults.some((r) => r.designStatus === PAIR_DESIGN_STATUS.UNPAIRED || r.designStatus === PAIR_DESIGN_STATUS.INCOMPLETE || r.designStatus === PAIR_DESIGN_STATUS.VERIFIED_UNBALANCED)
      ? 'unverified'
      : totalPairedBlocks === 0 ? 'not-applicable' : 'verified';

  const scheduleNote = malformedBlocks > 0
    ? `${malformedBlocks} block(s) failed policy↔seat verification (${Object.entries(blockReasonCounts).map(([k, v]) => `${k}×${v}`).join(', ')}).`
    : hasPairedRunIds && totalPairedBlocks === 0 && rows.length > 0
      ? 'pairedRunId values present but no complete two-run pairs were resolved — pairing may be per-run unique.'
      : null;

  return {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    pairedAbbaSchemaVersion: PAIRED_ABBA_SCHEMA_VERSION,
    design: 'matched AB/BA seat-swap',
    designStatus,
    hasPairedRunIds,
    pairingMode: hasPairedRunIds ? 'paired-run-id' : 'adjacency-heuristic',
    totalPairedBlocks,
    completePairs: totalPairedBlocks,
    incompletePairs,
    malformedBlocks,
    malformedReasons: blockReasonCounts,
    pairCount: pairResults.length,
    seatBalance,
    scheduleNote,
    pairResults,
    interpretationBoundary: designStatus === 'verified'
      ? 'Policy↔seat reversal verified for all paired blocks; aggregate paired inference is design-licensed (observational study — not a randomized trial).'
      : 'Seat-swap verification failed or is incomplete — policy win rates are confounded with seat assignment; no causal policy interpretation is licensed.',
  };
}
