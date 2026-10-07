import { differenceInProportions } from '../shared-analytics/estimators.mjs';
import { CLEAN_REASONS } from './evolution-domain.mjs';
import { createCandidate, DISCOVERY_LIMITS } from './discovery-domain.mjs';

// ═══════════════════════════════════════════════════════════════
// discovery-scan.mjs — Evidence projection and candidate detection.
//
// Reads stored Lab run evidence (per-game records) and produces
// anomalous-signal candidates. Every signal is observational: a
// candidate is a reason to run a controlled experiment, never a
// conclusion. Baselines are only used where they are defensible —
// when no defensible expectation exists, Surprise is left null.
// ═══════════════════════════════════════════════════════════════

const pairKey = (a, b) => [a, b].sort().join('|');
const isFiniteNum = (v) => Number.isFinite(v);

/** Squash a stored game record into the slim row the scan needs.
 * Per-seat mechanic telemetry is mapped from seat to side (A/B) so
 * orientation never leaks into behavioral attribution. */
export function projectGameRow(run, record) {
  const botA = run.config.botA, botB = run.config.botB;
  const swapped = record.swapped === true;
  const seat1Policy = swapped ? botB : botA;
  const clean = CLEAN_REASONS.includes(record.terminationReason);
  const winner = record.winner; // 'P1' | 'P2' | 'DRAW' | 'ABORTED'
  const aWon = !clean || winner === 'DRAW' ? null : (winner === 'P1' ? !swapped : swapped);
  const seatBehavior = Array.isArray(record.seatBehavior) ? record.seatBehavior : [];
  const seatMechanics = (seatIndex) => seatBehavior[seatIndex]?.mechanicCounts ?? null;
  // Canonical Combo propensity telemetry (§8): legal opportunities and
  // accepted declarations per seat. Absent telemetry is unknown — never 0.
  const comboSeats = Array.isArray(record.comboTelemetry?.seats) ? record.comboTelemetry.seats : null;
  const comboFor = (seatIndex) => {
    const s = comboSeats?.[seatIndex];
    return s && Number.isFinite(Number(s.opportunityFrames))
      ? { opportunities: Number(s.opportunityFrames) || 0, declarations: Number(s.declarations) || 0 }
      : null;
  };
  return {
    runId: run.runId, ordinal: record.ordinal, seed: record.seed, swapped,
    policyA: botA, policyB: botB, seat1Policy, seat2Policy: swapped ? botA : botB,
    clean, draw: winner === 'DRAW', winner,
    terminationReason: record.terminationReason,
    turns: Number(record.turns) || 0, miniTurns: Number(record.miniTurns) || 0,
    decisions: Number(record.decisions) || 0,
    scoreDiffA: swapped ? (record.scoreP2 ?? 0) - (record.scoreP1 ?? 0) : (record.scoreP1 ?? 0) - (record.scoreP2 ?? 0),
    aWon, seat1Won: clean && winner !== 'DRAW' ? winner === 'P1' : null,
    mechanicsA: seatMechanics(swapped ? 1 : 0),
    mechanicsB: seatMechanics(swapped ? 0 : 1),
    comboA: comboFor(swapped ? 1 : 0),
    comboB: comboFor(swapped ? 0 : 1),
    profileId: run.config.profileId ?? null,
  };
}

/**
 * Aggregate projected rows into the analysis index. The index is
 * ephemeral — recomputed per run — so the run artifact stores only the
 * evidence snapshot, not these rows (storage budget).
 */
export function buildEvidenceIndex(rows) {
  const pairings = new Map();
  const policies = new Map();
  const seats = { decisive: 0, seat1Wins: 0, seat2Wins: 0 };
  const pair = (k) => {
    if (!pairings.has(k)) {
      pairings.set(k, {
        key: k, games: 0, decisive: 0, winsA: 0, draws: 0, faulted: 0,
        seat1Wins: 0, turnsSum: 0, miniTurnsSum: 0, runIds: new Set(),
        // usage[policy][tag] = {used:{decisive,wins}, unused:{decisive,wins}}
        usage: new Map(),
        // comboUsage[policy] = {opportunities, declarations} — canonical
        // Combo propensity under legal choice (declarations/opportunities).
        comboUsage: new Map(),
      });
    }
    return pairings.get(k);
  };
  const policy = (id) => {
    if (!policies.has(id)) policies.set(id, { policyId: id, clean: 0, wins: 0, losses: 0, draws: 0, pairings: new Set() });
    return policies.get(id);
  };
  let totalGames = 0, totalDecisive = 0, totalFaulted = 0, turnsSum = 0;
  const usageFor = (cell, policyId) => {
    if (!cell.usage.has(policyId)) cell.usage.set(policyId, new Map());
    return cell.usage.get(policyId);
  };
  // Mechanic used/unused cohorts are built in two passes. A tag first
  // observed late in the dataset still owns every earlier decisive row
  // in its "unused" cohort — but only rows whose mechanic telemetry was
  // actually present. Telemetry-missing rows are excluded outright:
  // absent telemetry is unknown, never "mechanic not used".
  const mechRows = [];
  for (const row of rows) {
    const cell = pair(pairKey(row.policyA, row.policyB));
    cell.games += 1; totalGames += 1;
    cell.runIds.add(row.runId);
    if (!cell.policyA) { const [a, b] = row.policyA < row.policyB ? [row.policyA, row.policyB] : [row.policyB, row.policyA]; cell.policyA = a; cell.policyB = b; }
    if (!row.clean) { cell.faulted += 1; totalFaulted += 1; continue; }
    cell.turnsSum += row.turns; cell.miniTurnsSum += row.miniTurns; turnsSum += row.turns;
    const aWonThis = row.policyA === cell.policyA ? row.aWon : (row.aWon === null ? null : !row.aWon);
    const pA = policy(cell.policyA), pB = policy(cell.policyB);
    pA.pairings.add(cell.key); pB.pairings.add(cell.key);
    pA.clean += 1; pB.clean += 1;
    if (row.draw) { cell.draws += 1; pA.draws += 1; pB.draws += 1; }
    else {
      cell.decisive += 1; totalDecisive += 1;
      if (aWonThis) { cell.winsA += 1; pA.wins += 1; pB.losses += 1; } else { pB.wins += 1; pA.losses += 1; }
      seats.decisive += 1;
      if (row.seat1Won) { seats.seat1Wins += 1; cell.seat1Wins += 1; } else seats.seat2Wins += 1;
    }
    // Combo propensity: accumulate legal opportunities/declarations for
    // every telemetry-covered clean row (draws included — propensity is
    // behavioral, not outcome-conditioned). Missing telemetry is skipped.
    for (const [pid, combo] of [[row.policyA, row.comboA], [row.policyB, row.comboB]]) {
      if (!combo) continue;
      if (!cell.comboUsage.has(pid)) cell.comboUsage.set(pid, { opportunities: 0, declarations: 0 });
      const cu = cell.comboUsage.get(pid);
      cu.opportunities += combo.opportunities;
      cu.declarations += combo.declarations;
    }
    if (!row.draw && row.aWon !== null) {
      // Wins-only association needs decisive rows; draws are excluded to
      // keep the estimand clean. Collect the row (mechanics already
      // oriented to the normalized pairing) for the second pass.
      const aSide = row.policyA === cell.policyA;
      mechRows.push({ cell, mechA: aSide ? row.mechanicsA : row.mechanicsB, mechB: aSide ? row.mechanicsB : row.mechanicsA, aWon: aWonThis === true });
    }
  }
  // Pass 1 — the union of observed mechanic tags per (pairing, policy).
  const tagUniverse = new Map();
  for (const r of mechRows) {
    for (const [pid, mech] of [[r.cell.policyA, r.mechA], [r.cell.policyB, r.mechB]]) {
      if (!mech) continue;
      let pu = tagUniverse.get(r.cell);
      if (!pu) { pu = new Map(); tagUniverse.set(r.cell, pu); }
      for (const tag of Object.keys(mech)) {
        if ((mech[tag] ?? 0) > 0) {
          if (!pu.has(pid)) pu.set(pid, new Set());
          pu.get(pid).add(tag);
        }
      }
    }
  }
  // Pass 2 — classify every telemetry-covered decisive row against the
  // complete tag universe as used or unused.
  for (const r of mechRows) {
    const pu = tagUniverse.get(r.cell);
    if (!pu) continue;
    for (const [pid, mech, won] of [[r.cell.policyA, r.mechA, r.aWon === true], [r.cell.policyB, r.mechB, r.aWon === false]]) {
      if (!mech) continue;
      const tags = pu.get(pid);
      if (!tags?.size) continue;
      const u = usageFor(r.cell, pid);
      for (const tag of tags) {
        if (!u.has(tag)) u.set(tag, { used: { decisive: 0, wins: 0 }, unused: { decisive: 0, wins: 0 } });
        const cohort = (mech[tag] ?? 0) > 0 ? u.get(tag).used : u.get(tag).unused;
        cohort.decisive += 1;
        if (won) cohort.wins += 1;
      }
    }
  }
  const globalFaultRate = totalGames ? totalFaulted / totalGames : 0;
  const globalMeanTurns = totalGames - totalFaulted > 0 ? turnsSum / (totalGames - totalFaulted) : null;
  for (const cell of pairings.values()) {
    cell.meanTurns = cell.games - cell.faulted > 0 ? cell.turnsSum / (cell.games - cell.faulted) : null;
    cell.miniTurnShare = cell.turnsSum > 0 ? cell.miniTurnsSum / cell.turnsSum : null;
    cell.faultRate = cell.games ? cell.faulted / cell.games : 0;
    cell.scoreRateA = cell.decisive ? (cell.winsA + cell.draws / 2) / (cell.decisive + cell.draws) : null;
    cell.runIds = [...cell.runIds].sort();
  }
  for (const p of policies.values()) {
    // Shrunken global strength: pseudo-count toward 0.5 so a policy with
    // few games cannot dominate the baseline. Same prior-strength convention
    // as empiricalBayesShrinkage (priorStrength 25).
    p.strength = (p.wins + p.draws / 2 + 12.5) / (p.clean + 25);
    p.scoreRate = p.clean ? (p.wins + p.draws / 2) / p.clean : null;
    p.pairings = [...p.pairings].sort();
  }
  return {
    gameCount: totalGames, decisiveCount: totalDecisive, faultedCount: totalFaulted,
    pairings, policies, seats, globalFaultRate, globalMeanTurns,
    runIds: [...new Set(rows.map((r) => r.runId))].sort(),
  };
}

/** Map a standard-normal-style deviation to a bounded 0–100 Surprise
 * score: z≈2→39, z≈3→68, z≈4→86, z≈6→99. */
export function surpriseScore(z) {
  if (!isFiniteNum(z)) return null;
  return Math.min(100, Math.round(100 * (1 - Math.exp(-(z * z) / 8))));
}

const BASE_SCORES = { novelty: 0, impact: 0, signal: 0, evidenceGap: 0, computeCost: 0 };
function scoreParts({ z, absDev, n, category: _category, estGames }) {
  const surprise = surpriseScore(z);
  return {
    surprise,
    scores: {
      ...BASE_SCORES,
      novelty: surprise ?? Math.min(60, Math.round(Math.abs(absDev ?? 0) * 300)),
      impact: Math.min(100, Math.round(Math.abs(absDev ?? 0) * 350)),
      signal: surprise ?? 0,
      evidenceGap: Math.round(100 * (1 - Math.min(1, n / 400))),
      computeCost: estGames,
    },
  };
}

function pairingZ(observed, expected, n) {
  const variance = expected * (1 - expected);
  if (!isFiniteNum(observed) || !isFiniteNum(expected) || variance <= 0 || n <= 0) return null;
  return (observed - expected) / Math.sqrt(variance / n);
}

/**
 * Detect candidate anomalies across all five V1 investigation domains
 * plus the integrity surface that Bug Hunter mode prefers.
 * @returns {Array} unsorted candidate records (engine sorts by priority)
 */
export function detectCandidates(index, { detectedAt = new Date().toISOString(), estGames = 128 } = {}) {
  const candidates = [];
  const push = (category, subjectKey, summary, signal, scores, extra = {}) => {
    candidates.push(createCandidate({ category, subjectKey, summary, signal, scores, detectedAt, ...extra }));
  };
  const L = DISCOVERY_LIMITS;
  const cells = [...index.pairings.values()];

  // ── Matchup anomalies ─────────────────────────────────────────
  for (const cell of cells) {
    if (cell.decisive < L.minScanDecisive) continue;
    const a = index.policies.get(cell.policyA), b = index.policies.get(cell.policyB);
    if (!a || !b || a.clean < 60 || b.clean < 60) continue; // no defensible baseline
    // Leave-one-out baseline: the focal pairing is excluded from each
    // side's aggregate strength so the observation cannot partially
    // define its own expectation. With too little external evidence the
    // baseline is not defensible and the pairing is skipped.
    const cellClean = cell.games - cell.faulted;
    const extA = a.clean - cellClean, extB = b.clean - cellClean;
    if (extA < L.minScanDecisive || extB < L.minScanDecisive) continue;
    const sA = (a.wins - cell.winsA + (a.draws - cell.draws) / 2 + 12.5) / (extA + 25);
    const sB = (b.wins - (cell.decisive - cell.winsA) + (b.draws - cell.draws) / 2 + 12.5) / (extB + 25);
    const expected = sA / (sA + sB);
    const observed = cell.winsA / cell.decisive;
    const z = pairingZ(observed, expected, cell.decisive);
    const dev = observed - expected;
    if (z == null || Math.abs(z) < 2 || Math.abs(dev) < 0.06) continue;
    const { surprise, scores } = scoreParts({ z, absDev: dev, n: cell.decisive, category: 'matchup', estGames });
    push('matchup', `matchup:${cell.key}`, `${cell.policyA} scored ${(observed * 100).toFixed(1)}% vs ${cell.policyB} — expected ${(expected * 100).toFixed(1)}% from leave-one-out aggregate strength.`,
      { observed, expected, deviation: dev, unit: 'probability', sampleSize: cell.decisive, method: 'strength-model-deviation', surprise }, scores);
  }

  // ── Profile anomalies: aggregate-dominant policy losing a pairing ──
  for (const cell of cells) {
    if (cell.decisive < L.minPairingDecisive) continue;
    const a = index.policies.get(cell.policyA), b = index.policies.get(cell.policyB);
    if (!a || !b || a.scoreRate == null || b.scoreRate == null) continue;
    const [strong, weak] = a.scoreRate >= b.scoreRate ? [a, b] : [b, a];
    if (strong.scoreRate - weak.scoreRate < 0.05) continue;
    const strongIsA = strong.policyId === cell.policyA;
    const strongRate = strongIsA ? cell.winsA / cell.decisive : 1 - cell.winsA / cell.decisive;
    if (strongRate >= 0.44) continue;
    const z = pairingZ(strongRate, 0.5, cell.decisive);
    const { surprise, scores } = scoreParts({ z, absDev: 0.5 - strongRate, n: cell.decisive, category: 'profile', estGames });
    push('profile', `profile:${strong.policyId}@${cell.key}`, `${strong.policyId} (${(strong.scoreRate * 100).toFixed(1)}% aggregate) loses ${((1 - strongRate) * 100).toFixed(1)}% of decisive games to ${weak.policyId}.`,
      { observed: strongRate, expected: 0.5, deviation: strongRate - 0.5, unit: 'probability', sampleSize: cell.decisive, method: 'dominance-reversal', surprise }, scores);
  }

  // ── Seat anomalies ────────────────────────────────────────────
  const seatDev = (wins, n) => (n ? wins / n - 0.5 : 0);
  {
    const { decisive, seat1Wins } = index.seats;
    if (decisive >= 200) {
      const dev = seatDev(seat1Wins, decisive);
      const z = pairingZ(seat1Wins / decisive, 0.5, decisive);
      if (Math.abs(dev) >= 0.03 && z != null && Math.abs(z) >= 2) {
        const { surprise, scores } = scoreParts({ z, absDev: dev, n: decisive, category: 'seat', estGames });
        push('seat', 'seat:global', `Seat 1 won ${(seat1Wins / decisive * 100).toFixed(1)}% of ${decisive} pooled decisive games.`,
          { observed: seat1Wins / decisive, expected: 0.5, deviation: dev, unit: 'probability', sampleSize: decisive, method: 'pooled-seat-share', surprise }, scores);
      }
    }
    for (const cell of cells) {
      if (cell.decisive < L.minPairingDecisive) continue;
      const dev = seatDev(cell.seat1Wins, cell.decisive);
      const z = pairingZ(cell.seat1Wins / cell.decisive, 0.5, cell.decisive);
      if (Math.abs(dev) < 0.08 || z == null || Math.abs(z) < 2) continue;
      const { surprise, scores } = scoreParts({ z, absDev: dev, n: cell.decisive, category: 'seat', estGames });
      push('seat', `seat:${cell.key}`, `In ${cell.policyA} vs ${cell.policyB}, seat 1 won ${(cell.seat1Wins / cell.decisive * 100).toFixed(1)}% of decisive games.`,
        { observed: cell.seat1Wins / cell.decisive, expected: 0.5, deviation: dev, unit: 'probability', sampleSize: cell.decisive, method: 'pairing-seat-share', surprise }, scores);
    }
  }

  // ── Card / mechanic anomalies ─────────────────────────────────
  for (const cell of cells) {
    for (const [policyId, tags] of cell.usage) {
      for (const [tag, cohorts] of tags) {
        const { used, unused } = cohorts;
        if (used.decisive < L.minMechanicCohort || unused.decisive < L.minMechanicCohort) continue;
        const diff = differenceInProportions(used.wins, used.decisive, unused.wins, unused.decisive);
        if (diff.estimate == null || diff.standardError == null || diff.standardError === 0) continue;
        const z = diff.estimate / diff.standardError;
        if (Math.abs(z) < 2 || Math.abs(diff.estimate) < 0.07) continue;
        const { surprise, scores } = scoreParts({ z, absDev: diff.estimate, n: used.decisive + unused.decisive, category: 'card', estGames });
        push('card', `card:${cell.key}:${policyId}:${tag}`, `${policyId} won ${(used.wins / used.decisive * 100).toFixed(1)}% of decisive games using ${tag} vs ${(unused.wins / unused.decisive * 100).toFixed(1)}% without (vs ${cell.policyA === policyId ? cell.policyB : cell.policyA}).`,
          { observed: used.wins / used.decisive, expected: unused.wins / unused.decisive, deviation: diff.estimate, unit: 'probability', sampleSize: used.decisive + unused.decisive, method: 'conditional-usage-association', surprise }, scores);
      }
    }
  }

  // ── Combo propensity anomalies ────────────────────────────────
  // Canonical Comboing (rulebook §8) is a behavioral rate: declarations
  // ÷ legal Combo opportunities — not a raw declaration count. Compare
  // the two policies' propensity inside the same pairing (same opponent,
  // same ruleset; only the chooser differs).
  for (const cell of cells) {
    const a = cell.comboUsage.get(cell.policyA), b = cell.comboUsage.get(cell.policyB);
    if (!a || !b) continue;
    if (a.opportunities < L.minComboOpportunities || b.opportunities < L.minComboOpportunities) continue;
    const diff = differenceInProportions(a.declarations, a.opportunities, b.declarations, b.opportunities);
    if (diff.estimate == null || diff.standardError == null || diff.standardError === 0) continue;
    const z = diff.estimate / diff.standardError;
    if (Math.abs(z) < 2 || Math.abs(diff.estimate) < 0.10) continue;
    const [hi, lo] = diff.estimate >= 0 ? [cell.policyA, cell.policyB] : [cell.policyB, cell.policyA];
    const hiC = diff.estimate >= 0 ? a : b, loC = diff.estimate >= 0 ? b : a;
    const hiRate = hiC.declarations / hiC.opportunities, loRate = loC.declarations / loC.opportunities;
    const ratio = loRate > 0 ? `${(hiRate / loRate).toFixed(1)}×` : 'a nonzero rate vs zero';
    const { surprise, scores } = scoreParts({ z, absDev: Math.abs(diff.estimate), n: a.opportunities + b.opportunities, category: 'card', estGames });
    push('card', `combo-propensity:${cell.key}`, `${hi} accepted ${(hiRate * 100).toFixed(1)}% of legal Combo opportunities vs ${(loRate * 100).toFixed(1)}% for ${lo} (${ratio}) in the ${cell.key} pairing.`,
      { observed: hiRate, expected: loRate, deviation: diff.estimate, unit: 'probability', sampleSize: a.opportunities + b.opportunities, method: 'combo-propensity-divergence', surprise }, scores);
  }

  // ── Turn / phase anomalies ────────────────────────────────────
  const turnCells = cells.filter((c) => c.meanTurns != null && c.games - c.faulted >= L.minScanDecisive);
  if (turnCells.length >= 4 && index.globalMeanTurns != null) {
    const means = turnCells.map((c) => c.meanTurns);
    const mean = means.reduce((a, b) => a + b, 0) / means.length;
    const sd = Math.sqrt(means.reduce((s, v) => s + (v - mean) ** 2, 0) / (means.length - 1));
    if (sd > 0) {
      for (const cell of turnCells) {
        const z = (cell.meanTurns - mean) / sd;
        if (Math.abs(z) < 2.5) continue;
        const relDev = (cell.meanTurns - mean) / mean;
        const { surprise, scores } = scoreParts({ z, absDev: relDev, n: cell.games - cell.faulted, category: 'turn-phase', estGames });
        push('turn-phase', `turn-phase:${cell.key}`, `${cell.policyA} vs ${cell.policyB} averaged ${cell.meanTurns.toFixed(1)} full turns — ${(relDev * 100).toFixed(0)}% ${relDev > 0 ? 'above' : 'below'} the cross-pairing mean (${mean.toFixed(1)}).`,
          { observed: cell.meanTurns, expected: mean, deviation: cell.meanTurns - mean, unit: 'full-turns', sampleSize: cell.games - cell.faulted, method: 'pairing-mean-outlier', surprise }, scores);
      }
    }
  }

  // ── Integrity anomalies (Bug Hunter feedstock) ────────────────
  for (const cell of cells) {
    if (cell.games < 50 || index.globalFaultRate <= 0) continue;
    // Leave-one-cell-out baseline: the focal cell's own faults must not
    // contribute to the global rate it is measured against. A zero
    // external fault rate is a legitimate baseline — "every other
    // pairing is clean" — not a missing one.
    const restFaulted = index.faultedCount - cell.faulted;
    const restGames = index.gameCount - cell.games;
    const restRate = restGames > 0 ? restFaulted / restGames : 0;
    if (restGames < 50) continue;
    const diff = differenceInProportions(cell.faulted, cell.games, restFaulted, restGames);
    if (diff.estimate == null || diff.estimate < 0.05) continue;
    const z = diff.standardError ? diff.estimate / diff.standardError : null;
    if (z == null || z < 2) continue;
    const { surprise, scores } = scoreParts({ z, absDev: diff.estimate, n: cell.games, category: 'integrity', estGames });
    push('integrity', `integrity:${cell.key}`, `${cell.policyA} vs ${cell.policyB} faulted in ${(cell.faultRate * 100).toFixed(1)}% of games vs a ${(restRate * 100).toFixed(1)}% leave-one-out baseline.`,
      { observed: cell.faultRate, expected: restRate, deviation: diff.estimate, unit: 'probability', sampleSize: cell.games, method: 'fault-rate-excess', surprise }, scores);
  }

  // Dedupe by content-derived candidateId; keep the strongest signal.
  const byId = new Map();
  for (const c of candidates) {
    const existing = byId.get(c.candidateId);
    if (!existing || (c.signal.surprise ?? 0) > (existing.signal.surprise ?? 0)) byId.set(c.candidateId, c);
  }
  return [...byId.values()].sort((a, b) => (b.signal.surprise ?? 0) - (a.signal.surprise ?? 0) || a.candidateId.localeCompare(b.candidateId)).slice(0, DISCOVERY_LIMITS.candidatesMax);
}

/**
 * Index over stored runs. Only rows from runs passing the evidence
 * snapshot are read; the identity check happens upstream in
 * createEvidenceSnapshot so this projector never mixes fingerprints.
 */
export function scanEvidence(runs, snapshot, options = {}) {
  const wanted = new Set(snapshot.runIds);
  const rows = [];
  for (const run of runs) {
    if (!wanted.has(run.runId)) continue;
    for (const record of run.records ?? []) rows.push(projectGameRow(run, record));
  }
  const index = buildEvidenceIndex(rows);
  const candidates = detectCandidates(index, options);
  return { index, candidates, rowCount: rows.length };
}
