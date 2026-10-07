import { hashCanonical } from '../shared-browser.js';
import { wilsonInterval, differenceInProportions } from '../shared-analytics/estimators.mjs';
import { assertIdentity, STATIC_POLICIES } from './evolution-domain.mjs';
import {
  DISCOVERY_LIMITS, PROMOTION_GATES, TERMINAL_HYPOTHESIS_STATES,
  createHypothesis, planStage, scoreCandidate, stageSeed,
  transitionTo, appendJournal, warn, evaluatePromotion, createDiscoveryArtifact,
  rawEstimatePValue,
} from './discovery-domain.mjs';
import { scanEvidence, projectGameRow } from './discovery-scan.mjs';

// ═══════════════════════════════════════════════════════════════
// discovery-engine.mjs — Research orchestration (pure logic, no I/O).
//
// Turns candidates into falsifiable hypotheses, plans the smallest
// useful controlled experiment per claim, executes stages through a
// caller-supplied series runner (runLabSeries in Node,
// executeBrowserSeries in the browser), actively challenges signals,
// replicates survivors, and applies deterministic promotion gates.
// ═══════════════════════════════════════════════════════════════

const fail = (code, detail) => { throw Object.assign(new Error(detail !== undefined ? `${code}:${detail}` : code), { code }); };
const isFiniteNum = (v) => Number.isFinite(v);
const pairKey = (a, b) => [a, b].sort().join('|');

// ── Hypothesis construction ──────────────────────────────────────

/**
 * Convert a candidate signal into an explicit falsifiable hypothesis
 * with a minimal controlled experiment plan. Returns null when the
 * candidate is not testable with the available pairing information.
 */
export function buildHypothesis(candidate, run, index, config, at = null) {
  const seedFor = (key) => stageSeed(config.seed, `pending-${candidate.candidateId}`, key);
  const G = config.confirmGames;
  const repStages = () => Array.from({ length: config.replicationBatches }, (_, i) => `replicate-${i + 1}`);
  const cell = (key) => index.pairings.get(key);
  let draft = null;

  if (candidate.auditTarget) {
    // Auditor mode: re-examine a prior discovery. Policies come from the
    // artifact's tested set; the metric and direction are taken verbatim.
    const d = candidate.auditTarget;
    const policies = Array.isArray(d.scope?.policies) && d.scope.policies.length >= 2 ? d.scope.policies.slice(0, 2) : d.policiesTested?.slice(0, 2);
    if (!policies || policies.length < 2 || !policies.every((p) => STATIC_POLICIES.includes(p))) return null;
    const stages = [
      { key: 'confirm', kind: 'confirm', series: { botA: policies[0], botB: policies[1], gameCount: G, seed: 0, profileId: config.profileId, workerCount: config.workerCount }, note: `audit re-test of ${d.discoveryId}` },
      ...repStages().map((key, i) => ({ key, kind: 'replicate', series: { botA: policies[0], botB: policies[1], gameCount: DISCOVERY_LIMITS.replicationGames, seed: 0, profileId: config.profileId, workerCount: config.workerCount }, note: `independent replication batch ${i + 1}` })),
    ];
    draft = { policies, metric: d.effect?.metric === 'mechanicDelta' || d.scope?.mechanic ? 'mechanicDelta' : 'winRateA', direction: d.effect?.direction === -1 ? -1 : 1,
      minEffect: Math.max(PROMOTION_GATES.minEffect, Math.abs(d.effect?.estimate ?? 0) * 0.5),
      null0: 0, claim: `Prior discovery ${d.discoveryId} reproduces under a fresh independent batch.`,
      confounders: [{ kind: 'staleness', status: 'untested' }, { kind: 'seat-bias', status: 'untested' }],
      stages, mechanic: d.scope?.mechanic ?? null, focalPolicy: d.scope?.focalPolicy ?? null };
  }

  const matchupPlan = (cellKey, null0, claim, confounders, direction) => {
    const c = cell(cellKey);
    if (!c) return null;
    const stages = [
      { key: 'confirm', kind: 'confirm', series: { botA: c.policyA, botB: c.policyB, gameCount: G, seed: 0, profileId: config.profileId, workerCount: config.workerCount }, note: 'fresh mirrored series on the anomalous pairing' },
      ...repStages().map((key, i) => ({ key, kind: 'replicate', series: { botA: c.policyA, botB: c.policyB, gameCount: DISCOVERY_LIMITS.replicationGames, seed: 0, profileId: config.profileId, workerCount: config.workerCount }, note: `independent replication batch ${i + 1}` })),
    ];
    return { policies: [c.policyA, c.policyB], stages, claim, confounders, metric: 'winRateA', null0, direction };
  };

  if (draft === null && candidate.category === 'matchup') {
    const expected = candidate.signal.expected;
    if (!isFiniteNum(expected)) return null;
    draft = matchupPlan(candidate.subjectKey.split(':')[1], expected,
      `${candidate.subjectKey.split(':')[1].replace('|', ' vs ')} deviates from the aggregate-strength expectation (${(expected * 100).toFixed(1)}%) in mirrored play.`,
      [{ kind: 'seat-bias', status: 'untested' }, { kind: 'sample-expansion', status: 'untested' }]);
  } else if (candidate.category === 'profile') {
    const c = cell(candidate.subjectKey.split('@')[1]);
    if (!c) return null;
    const strong = (index.policies.get(c.policyA)?.scoreRate ?? 0) >= (index.policies.get(c.policyB)?.scoreRate ?? 0) ? c.policyA : c.policyB;
    const weak = strong === c.policyA ? c.policyB : c.policyA;
    draft = matchupPlan(c.key, 0.5,
      `Aggregate-stronger ${strong} wins less than half of decisive games against ${weak}, beyond seat effects.`,
      [{ kind: 'seat-bias', status: 'untested' }, { kind: 'sample-expansion', status: 'untested' }], -1);
    if (draft) {
      draft.policies = [strong, weak];
      for (const s of draft.stages) s.series = { ...s.series, botA: strong, botB: weak };
    }
  } else if (candidate.category === 'seat') {
    const key = candidate.subjectKey.split(':')[1];
    let policies = null;
    if (key && key !== 'global') { const c = cell(key); policies = c ? [c.policyA, c.policyB] : null; }
    if (!policies) {
      // Global seat claim: pick the most balanced pairing available so the
      // seat term is not swamped by a strength gap.
      let best = null;
      for (const c of index.pairings.values()) {
        if (c.decisive < DISCOVERY_LIMITS.minScanDecisive) continue;
        const a = index.policies.get(c.policyA), b = index.policies.get(c.policyB);
        const gap = Math.abs((a?.strength ?? 0) - (b?.strength ?? 0));
        if (a && b && (best == null || gap < best.gap)) best = { gap, c };
      }
      policies = best ? [best.c.policyA, best.c.policyB] : null;
    }
    if (!policies) return null;
    draft = { policies, metric: 'seat1WinRate', null0: 0.5,
      claim: 'Seat 1 confers a first-mover win-probability advantage beyond policy strength.',
      confounders: [{ kind: 'policy-strength', status: 'untested' }, { kind: 'sample-expansion', status: 'untested' }],
      stages: [
        { key: 'confirm', kind: 'confirm', series: { botA: policies[0], botB: policies[1], gameCount: G, seed: 0, profileId: config.profileId, workerCount: config.workerCount }, note: 'fresh mirrored series; the metric is the seat-1 share of decisive games' },
        ...repStages().map((key, i) => ({ key, kind: 'replicate', series: { botA: policies[0], botB: policies[1], gameCount: DISCOVERY_LIMITS.replicationGames, seed: 0, profileId: config.profileId, workerCount: config.workerCount }, note: `independent replication batch ${i + 1}` })),
      ] };
  } else if (candidate.category === 'card') {
    const [, key, policyId, tag] = candidate.subjectKey.split(':');
    const c = cell(key);
    if (!c || !tag || !policyId) return null;
    // Control population: the most-played other opponent of the focal policy.
    let control = null;
    for (const other of index.pairings.values()) {
      if (!other.key.includes(policyId)) continue;
      const opp = other.policyA === policyId ? other.policyB : other.policyA;
      if (opp !== (policyId === c.policyA ? c.policyB : c.policyA) && (!control || other.decisive > control.decisive)) control = { opp, decisive: other.decisive };
    }
    const opponent = policyId === c.policyA ? c.policyB : c.policyA;
    const stages = [
      { key: 'confirm', kind: 'confirm', series: { botA: policyId, botB: opponent, gameCount: G, seed: 0, profileId: config.profileId, workerCount: config.workerCount }, note: 'fresh series on the originating pairing' },
    ];
    if (control) stages.push({ key: 'challenge-population', kind: 'challenge-population', series: { botA: policyId, botB: control.opp, gameCount: DISCOVERY_LIMITS.controlGames, seed: 0, profileId: config.profileId, workerCount: config.workerCount }, note: `does the ${tag} association survive a different opponent (${control.opp})?` });
    stages.push(...repStages().map((key, i) => ({ key, kind: 'replicate', series: { botA: policyId, botB: opponent, gameCount: DISCOVERY_LIMITS.replicationGames, seed: 0, profileId: config.profileId, workerCount: config.workerCount }, note: `independent replication batch ${i + 1}` })));
    draft = { policies: [policyId, opponent], metric: 'mechanicDelta', null0: 0,
      claim: `${policyId} wins more when it deploys ${tag} than when it does not (within ${candidate.subjectKey.split(':')[1]}).`,
      confounders: [{ kind: 'opponent-context', status: 'untested' }, { kind: 'seat-bias', status: 'untested' }],
      stages, mechanic: tag, focalPolicy: policyId };
  } else if (candidate.category === 'turn-phase') {
    const c = cell(candidate.subjectKey.split(':')[1]);
    if (!c || !isFiniteNum(candidate.signal.expected)) return null;
    draft = { policies: [c.policyA, c.policyB], metric: 'meanTurns', null0: candidate.signal.expected,
      claim: `${c.policyA} vs ${c.policyB} produces game lengths far from the cross-pairing mean (descriptive anomaly, not a balance claim).`,
      confounders: [{ kind: 'sample-expansion', status: 'untested' }],
      stages: [
        { key: 'confirm', kind: 'confirm', series: { botA: c.policyA, botB: c.policyB, gameCount: G, seed: 0, profileId: config.profileId, workerCount: config.workerCount }, note: 'fresh series; metric is mean full-turn length' },
        ...repStages().map((key, i) => ({ key, kind: 'replicate', series: { botA: c.policyA, botB: c.policyB, gameCount: DISCOVERY_LIMITS.replicationGames, seed: 0, profileId: config.profileId, workerCount: config.workerCount }, note: `independent replication batch ${i + 1}` })),
      ] };
  } else if (candidate.category === 'integrity') {
    const c = cell(candidate.subjectKey.split(':')[1]);
    if (!c) return null;
    draft = { policies: [c.policyA, c.policyB], metric: 'faultRate', null0: candidate.signal.expected ?? 0,
      claim: `${c.policyA} vs ${c.policyB} produces non-clean terminations above the corpus baseline.`,
      confounders: [{ kind: 'seed-batch', status: 'untested' }],
      stages: [
        { key: 'confirm', kind: 'confirm', series: { botA: c.policyA, botB: c.policyB, gameCount: G, seed: 0, profileId: config.profileId, workerCount: config.workerCount }, note: 'fresh series; metric is the non-clean termination share' },
        ...repStages().map((key, i) => ({ key, kind: 'replicate', series: { botA: c.policyA, botB: c.policyB, gameCount: DISCOVERY_LIMITS.replicationGames, seed: 0, profileId: config.profileId, workerCount: config.workerCount }, note: `independent replication batch ${i + 1}` })),
      ] };
  }
  if (!draft) return null;

  const direction = draft.direction ?? (Math.sign(candidate.signal.deviation ?? (isFiniteNum(candidate.signal.observed) && isFiniteNum(draft.null0) ? candidate.signal.observed - draft.null0 : 1)) || 1);
  const stages = draft.stages.map((s) => planStage({
    key: s.key, kind: s.kind, note: s.note,
    series: { ...s.series, seed: seedFor(s.key) },
  }));
  return createHypothesis({
    candidate,
    metric: draft.metric,
    direction,
    minEffect: draft.minEffect ?? (draft.metric === 'meanTurns' ? Math.abs((draft.null0 ?? 1) * 0.1) : PROMOTION_GATES.minEffect),
    expected: { value: draft.null0, method: candidate.signal.method },
    scope: { policies: draft.policies, mechanic: draft.mechanic ?? null, focalPolicy: draft.focalPolicy ?? null, pairing: pairKey(draft.policies[0], draft.policies[1]) },
    claim: draft.claim,
    falsification: 'Controlled mirrored series fails to reproduce the claimed direction, or the estimate interval contains the null.',
    confounders: draft.confounders,
    stages,
    estimatedGames: stages.reduce((n, s) => n + s.series.gameCount, 0),
    at: at ?? undefined,
  });
}

// ── Stage measurement ────────────────────────────────────────────

/**
 * Reduce a finished experiment series to the hypothesis' metric cell.
 * The cell is a set of counts — pooling across stages never loses
 * provenance because each stage keeps its own run reference.
 */
export function measureStage(hypothesis, run) {
  const rows = (run.records ?? []).map((r) => projectGameRow(run, r));
  const cell = {
    games: rows.length, decisive: 0, wins: 0, draws: 0, faulted: 0,
    seat1Wins: 0, turnSum: 0, turnSq: 0,
    mechUsed: { wins: 0, decisive: 0 }, mechUnused: { wins: 0, decisive: 0 },
    orientA1: { wins: 0, decisive: 0 }, orientA2: { wins: 0, decisive: 0 },
    mechOrient1: { usedWins: 0, usedN: 0, unusedWins: 0, unusedN: 0 },
    mechOrient2: { usedWins: 0, usedN: 0, unusedWins: 0, unusedN: 0 },
  };
  const focal = hypothesis.scope?.focalPolicy ?? run.config.botA;
  const tag = hypothesis.scope?.mechanic ?? null;
  for (const row of rows) {
    cell.turnSum += row.turns; cell.turnSq += row.turns * row.turns;
    if (!row.clean) { cell.faulted += 1; continue; }
    if (row.draw) { cell.draws += 1; continue; }
    cell.decisive += 1;
    const aWon = row.policyA === run.config.botA ? row.aWon : !row.aWon;
    if (aWon) cell.wins += 1;
    if (row.seat1Won) cell.seat1Wins += 1;
    // Orientation splits: A in seat 1 (!swapped) vs A in seat 2 (swapped).
    const orient = row.swapped ? cell.orientA2 : cell.orientA1;
    orient.decisive += 1;
    if (aWon) orient.wins += 1;
    if (tag) {
      const focalIsA = focal === row.policyA;
      const mechanics = focalIsA ? row.mechanicsA : row.mechanicsB;
      const won = focalIsA ? aWon : !aWon;
      const used = Boolean(mechanics && (mechanics[tag] ?? 0) > 0);
      const bucket = used ? cell.mechUsed : cell.mechUnused;
      bucket.decisive += 1;
      if (won) bucket.wins += 1;
      const oc = row.swapped ? cell.mechOrient2 : cell.mechOrient1;
      if (used) { oc.usedN += 1; if (won) oc.usedWins += 1; }
      else { oc.unusedN += 1; if (won) oc.unusedWins += 1; }
    }
  }
  return cell;
}

export function mergeCells(a, b) {
  const out = { ...a };
  for (const k of ['games', 'decisive', 'wins', 'draws', 'faulted', 'seat1Wins', 'turnSum', 'turnSq']) out[k] = a[k] + b[k];
  for (const k of ['mechUsed', 'mechUnused']) out[k] = { wins: a[k].wins + b[k].wins, decisive: a[k].decisive + b[k].decisive };
  for (const k of ['orientA1', 'orientA2']) out[k] = { wins: a[k].wins + b[k].wins, decisive: a[k].decisive + b[k].decisive };
  for (const k of ['mechOrient1', 'mechOrient2']) out[k] = { usedWins: a[k].usedWins + b[k].usedWins, usedN: a[k].usedN + b[k].usedN, unusedWins: a[k].unusedWins + b[k].unusedWins, unusedN: a[k].unusedN + b[k].unusedN };
  return out;
}

export const EMPTY_CELL = Object.freeze({
  games: 0, decisive: 0, wins: 0, draws: 0, faulted: 0, seat1Wins: 0, turnSum: 0, turnSq: 0,
  mechUsed: Object.freeze({ wins: 0, decisive: 0 }), mechUnused: Object.freeze({ wins: 0, decisive: 0 }),
  orientA1: Object.freeze({ wins: 0, decisive: 0 }), orientA2: Object.freeze({ wins: 0, decisive: 0 }),
  mechOrient1: Object.freeze({ usedWins: 0, usedN: 0, unusedWins: 0, unusedN: 0 }),
  mechOrient2: Object.freeze({ usedWins: 0, usedN: 0, unusedWins: 0, unusedN: 0 }),
});

/**
 * Estimate + 95% interval for a hypothesis' metric over pooled cells,
 * expressed as a deviation from the hypothesis' null. All uncertainty
 * is on the probability scale except meanTurns (turn units).
 */
export function estimateFromCell(hypothesis, cell) {
  const null0 = hypothesis.expected?.value ?? 0;
  switch (hypothesis.outcome) {
    case 'winRateA': {
      if (!cell.decisive) return { estimate: null, interval: [null, null] };
      const [lo, hi] = wilsonInterval(cell.wins, cell.decisive);
      return { estimate: cell.wins / cell.decisive - null0, interval: [lo - null0, hi - null0], raw: cell.wins / cell.decisive };
    }
    case 'seat1WinRate': {
      if (!cell.decisive) return { estimate: null, interval: [null, null] };
      const [lo, hi] = wilsonInterval(cell.seat1Wins, cell.decisive);
      return { estimate: cell.seat1Wins / cell.decisive - 0.5, interval: [lo - 0.5, hi - 0.5], raw: cell.seat1Wins / cell.decisive };
    }
    case 'mechanicDelta': {
      const d = differenceInProportions(cell.mechUsed.wins, cell.mechUsed.decisive, cell.mechUnused.wins, cell.mechUnused.decisive);
      return { estimate: d.estimate, interval: d.interval, raw: d };
    }
    case 'meanTurns': {
      const n = cell.games - cell.faulted;
      if (n < 2) return { estimate: null, interval: [null, null] };
      const mean = cell.turnSum / n;
      const variance = Math.max(0, cell.turnSq / n - mean * mean);
      const half = 1.96 * Math.sqrt(variance / n);
      return { estimate: mean - null0, interval: [mean - null0 - half, mean - null0 + half], raw: mean };
    }
    case 'faultRate': {
      if (!cell.games) return { estimate: null, interval: [null, null] };
      const [lo, hi] = wilsonInterval(cell.faulted, cell.games);
      return { estimate: cell.faulted / cell.games - null0, interval: [lo - null0, hi - null0], raw: cell.faulted / cell.games };
    }
    default: return { estimate: null, interval: [null, null] };
  }
}

/** Orientation consistency check — does the effect hold in both seat
 * arrangements, or is it seating masquerading as signal? The claim fails
 * when the effect is absent (or reversed) in one orientation; a magnitude
 * gap with preserved direction is an interaction, recorded but not fatal. */
export function seatConsistencyCheck(hypothesis, cell) {
  const dir = hypothesis.direction;
  const orientBias = Math.abs(cell.orientA1.wins / (cell.orientA1.decisive || 1) - cell.orientA2.wins / (cell.orientA2.decisive || 1));
  if (!['matchup', 'card', 'profile'].includes(hypothesis.category)) {
    return { kind: 'seat-mirror', verdict: 'not-applicable', detail: `seat consistency not required for ${hypothesis.category}`, seatBias: null };
  }
  if (hypothesis.outcome === 'mechanicDelta') {
    const d1 = cell.mechOrient1.usedN >= 10 && cell.mechOrient1.unusedN >= 10
      ? differenceInProportions(cell.mechOrient1.usedWins, cell.mechOrient1.usedN, cell.mechOrient1.unusedWins, cell.mechOrient1.unusedN) : null;
    const d2 = cell.mechOrient2.usedN >= 10 && cell.mechOrient2.unusedN >= 10
      ? differenceInProportions(cell.mechOrient2.usedWins, cell.mechOrient2.usedN, cell.mechOrient2.unusedWins, cell.mechOrient2.unusedN) : null;
    if (!d1?.estimate || !d2?.estimate) return { kind: 'seat-mirror', verdict: 'inconclusive', detail: 'insufficient per-orientation mechanic cohorts', seatBias: orientBias };
    const w1 = d1.estimate * dir, w2 = d2.estimate * dir;
    const sameDir = Math.sign(d1.estimate) === dir && Math.sign(d2.estimate) === dir;
    const verdict = sameDir && Math.min(w1, w2) >= hypothesis.minEffect / 2 ? 'passed' : 'failed';
    return { kind: 'seat-mirror', verdict,
      detail: `orientation deltas ${d1.estimate.toFixed(3)} / ${d2.estimate.toFixed(3)} (gap ${Math.abs(d1.estimate - d2.estimate).toFixed(3)})`,
      seatBias: orientBias };
  }
  if (cell.orientA1.decisive < 10 || cell.orientA2.decisive < 10) return { kind: 'seat-mirror', verdict: 'inconclusive', detail: 'insufficient decisive games per orientation', seatBias: orientBias };
  const r1 = cell.orientA1.wins / cell.orientA1.decisive, r2 = cell.orientA2.wins / cell.orientA2.decisive;
  const e1 = r1 - (hypothesis.expected?.value ?? 0.5), e2 = r2 - (hypothesis.expected?.value ?? 0.5);
  const w1 = e1 * dir, w2 = e2 * dir;
  const sameDir = Math.sign(e1) === dir && Math.sign(e2) === dir;
  const verdict = sameDir && Math.min(w1, w2) >= hypothesis.minEffect / 2 ? 'passed' : 'failed';
  return { kind: 'seat-mirror', verdict,
    detail: `A-in-seat-1 est ${e1.toFixed(3)} / A-in-seat-2 est ${e2.toFixed(3)} (gap ${Math.abs(e1 - e2).toFixed(3)})`,
    seatBias: orientBias };
}

// ── Stage judgment ───────────────────────────────────────────────

function stageVerdict(hypothesis, cell) {
  const { estimate, interval } = estimateFromCell(hypothesis, cell);
  if (!isFiniteNum(estimate)) return { verdict: 'inconclusive', estimate: null, interval, reason: 'no measurable evidence' };
  const dir = hypothesis.direction;
  const lo = interval[0], hi = interval[1];
  const excludesNull = isFiniteNum(lo) && isFiniteNum(hi) && (dir > 0 ? lo > 0 : hi < 0);
  const refutes = isFiniteNum(lo) && isFiniteNum(hi) && (dir > 0 ? hi <= 0 : lo >= 0);
  const meetsEffect = Math.abs(estimate) >= hypothesis.minEffect;
  if (refutes) return { verdict: 'refuted', estimate, interval, reason: `interval excludes the claimed direction` };
  if (excludesNull && meetsEffect) return { verdict: 'supported', estimate, interval, reason: 'direction and magnitude reproduced' };
  if (excludesNull && !meetsEffect) return { verdict: 'refuted', estimate, interval, reason: `real but below minimum effect (${Math.abs(estimate).toFixed(3)} < ${hypothesis.minEffect})` };
  if (Math.sign(estimate) === dir && meetsEffect) return { verdict: 'leaning', estimate, interval, reason: 'direction holds but interval crosses null' };
  return { verdict: 'inconclusive', estimate, interval, reason: 'signal did not reproduce' };
}

function replicationVerdict(hypothesis, cell) {
  const { estimate, interval } = estimateFromCell(hypothesis, cell);
  const n = hypothesis.outcome === 'meanTurns' || hypothesis.outcome === 'faultRate' ? cell.games - cell.faulted : cell.decisive;
  if (!isFiniteNum(estimate) || n < PROMOTION_GATES.replicationMinDecisive) {
    return { verdict: 'inconclusive', estimate, reason: 'insufficient observations in batch' };
  }
  const dir = hypothesis.direction;
  const lo = interval[0], hi = interval[1];
  const contradicts = isFiniteNum(lo) && isFiniteNum(hi) && (dir > 0 ? hi <= 0 : lo >= 0);
  if (contradicts) return { verdict: 'failed', estimate, reason: 'replication interval excludes the claimed direction' };
  if (Math.sign(estimate) === dir && Math.abs(estimate) >= hypothesis.minEffect / 2) return { verdict: 'passed', estimate, reason: 'direction-consistent within tolerance' };
  return { verdict: 'inconclusive', estimate, reason: 'estimate too weak to count as replication' };
}

// ── Orchestrator ─────────────────────────────────────────────────

/**
 * Drive a Discovery Run to completion (or STOPPED/PAUSED on signal).
 * executeSeries must resolve to `{ run }` — the completed lab series —
 * matching the runLabSeries/executeBrowserSeries contract.
 *
 * @param {object} run discovery run artifact (mutated in place)
 * @param {object} deps { evidenceRuns, executeSeries, resumeStageRun,
 *   persistStageRun, priorDiscoveries, signal, onJournal, onStage,
 *   onProgress, now }
 */
export async function runDiscovery(run, deps = {}) {
  const { evidenceRuns = [], executeSeries, resumeStageRun = null, persistStageRun = null, priorDiscoveries = [], signal, onJournal = () => {}, onStage = () => {}, onProgress = () => {}, now = () => new Date().toISOString() } = deps;
  assertIdentity(run.identity);
  if (typeof executeSeries !== 'function') fail('EXECUTE_SERIES_REQUIRED');
  const config = run.config;
  const note = (type, message, ref) => {
    const before = run.journal.length;
    appendJournal(run, type, message, ref, now());
    if (run.journal.length > before) onJournal(run.journal.at(-1));
  };
  let evidenceIndex = null;

  if (run.status === 'IDLE') {
    run.status = 'RUNNING';
    // ── Evidence scan → candidates ──
    const eligible = evidenceRuns.filter((r) => run.evidence.runIds.includes(r.runId));
    const { index, candidates, rowCount } = scanEvidence(eligible, run.evidence, { detectedAt: now(), estGames: config.confirmGames });
    evidenceIndex = index;
    const exclusionText = () => Object.entries(run.evidence.exclusionReasons ?? {}).map(([k, v]) => `${v}× ${k.toLowerCase().replaceAll('_', ' ')}`).join(', ');
    note('evidence-resolution', `Evidence resolution: ${run.evidence.selectedGameCount ?? run.evidence.gameCount} selected game(s) in ${run.evidence.selectedRunCount ?? run.evidence.runCount} stored run(s) → ${run.evidence.gameCount} admissible games in ${run.evidence.runCount} source run(s)${run.evidence.excludedCount ? ` · ${run.evidence.excludedCount} excluded (${exclusionText() || 'inadmissible'})` : ''}`, run.evidence.snapshotId);
    if (eligible.length < run.evidence.runIds.length) warn(run, 'EVIDENCE_RUNS_MISSING', `${run.evidence.runIds.length - eligible.length} snapshot-referenced run(s) could not be loaded — the frozen scope and the store disagree`);
    run.candidates = candidates.map((c) => ({ ...c, scores: scoreCandidate(c, run.mode) }));
    run.candidates.sort((a, b) => b.scores.priority - a.scores.priority || a.candidateId.localeCompare(b.candidateId));
    note('scan', `Evidence scan complete: ${run.evidence.gameCount} games across ${run.evidence.runCount} runs → ${candidates.length} candidates`, run.evidence.snapshotId);
    if (run.evidence.excludedCount > 0) warn(run, 'EVIDENCE_EXCLUDED', `${run.evidence.excludedCount} runs skipped (${exclusionText() || 'foreign fingerprint or unverified import'})`);

    // A run whose frozen scope resolves to zero admissible game rows is
    // an input-resolution failure — evidence never reached the scanner —
    // never a scientific result. It blocks before research execution so
    // it cannot masquerade as a completed zero-discovery run. Auditor
    // mode is exempt when prior discoveries supply falsification targets
    // of their own; the scan is not its evidence input.
    if (rowCount === 0 && !(run.mode === 'auditor' && priorDiscoveries.length)) {
      const detail = run.evidence.runCount > 0
        ? (eligible.length === 0
          ? `the snapshot references ${run.evidence.runCount} source run(s) but none could be loaded — stored ids and the artifact store disagree`
          : 'eligible source run(s) contain no game records')
        : (run.evidence.excludedCount > 0
          ? `all ${run.evidence.excludedCount} stored run(s) were excluded (${exclusionText() || 'inadmissible'})`
          : 'no stored Lab series evidence exists on this origin');
      warn(run, 'EVIDENCE_RESOLUTION_FAILED', detail);
      note('evidence-blocked', `Evidence resolution failed — ${detail}. 0 games reached the scanner; blocked before research execution.`, run.evidence.snapshotId);
      run.status = 'BLOCKED';
      run.completedAt = now();
      return run;
    }

    // Auditor mode: prior discoveries become falsification targets.
    if (run.mode === 'auditor' && priorDiscoveries.length) {
      for (const d of priorDiscoveries.slice(0, 6)) {
        const auditCandidate = {
          schemaVersion: 1, candidateId: `C-${hashCanonical({ audit: d.discoveryId }).slice(0, 10)}`,
          category: ['matchup', 'card', 'turn-phase', 'profile', 'seat', 'integrity'].includes(d.category) ? d.category : 'matchup',
          subjectKey: `audit:${d.discoveryId}`,
          summary: `Audit prior discovery ${d.discoveryId}: ${String(d.claim ?? '').slice(0, 120)}`,
          signal: { observed: d.effect?.estimate ?? null, expected: null, deviation: null, unit: 'probability', sampleSize: d.effect?.decisive ?? 0, method: 'prior-discovery-audit', surprise: null },
          scores: { novelty: 30, impact: 85, signal: 70, evidenceGap: 20, testability: 90, computeCost: config.confirmGames },
          detectedAt: now(), auditTarget: d,
        };
        auditCandidate.scores = scoreCandidate(auditCandidate, run.mode);
        run.candidates.unshift(auditCandidate);
      }
      run.candidates.length = Math.min(run.candidates.length, DISCOVERY_LIMITS.candidatesMax);
      note('audit-targets', `Auditor mode queued ${Math.min(priorDiscoveries.length, 6)} prior discoveries for re-examination`);
    }

    // ── Hypotheses: top candidates within the estimated budget ──
    let estimateTotal = 0;
    const seenSubjects = new Set();
    for (const candidate of run.candidates) {
      if (run.hypotheses.length >= DISCOVERY_LIMITS.hypothesesMax) break;
      const subject = candidate.subjectKey.split(':').slice(0, 2).join(':');
      if (seenSubjects.has(subject) && !candidate.auditTarget) continue; // one hypothesis per subject
      const h = buildHypothesis(candidate, run, index, config, now());
      if (!h) continue;
      if (estimateTotal + h.estimatedGames > config.gameBudget * 1.5 && run.hypotheses.length) continue;
      estimateTotal += h.estimatedGames;
      seenSubjects.add(subject);
      transitionTo(h, 'queued', 'admitted to research queue', now());
      run.hypotheses.push(h);
      note('hypothesis', `${h.hypothesisId} queued — ${h.claim}`, h.hypothesisId);
    }
    if (!run.hypotheses.length) note('scan-empty', 'No candidate met minimum detectability thresholds; nothing to investigate.');
  } else if (run.status === 'PAUSED') {
    run.status = 'RUNNING';
    note('resume', `Discovery run resumed with ${run.budget.consumed}/${run.budget.allocated} games consumed`);
  } else {
    fail('DISCOVERY_RUN_STATE', run.status);
  }

  const remaining = () => run.budget.allocated - run.budget.consumed;
  // Promotion judgment is deferred until every hypothesis has been
  // measured: Benjamini–Hochberg adjustment needs the complete family
  // of raw p-values, so no hypothesis is promoted until the family is
  // fixed. Aborted runs keep pending judgments for a deterministic
  // resume rather than judging a partial family.
  const pendingJudgment = [];

  // ── Investigation loop ──
  for (const h of run.hypotheses) {
    if (signal?.aborted) break;
    if (TERMINAL_HYPOTHESIS_STATES.includes(h.status) || h.status === 'abandoned') continue;
    if (h.status === 'queued') {
      const confirm = h.plan.stages[0];
      if (remaining() < Math.min(confirm.series.gameCount, DISCOVERY_LIMITS.confirmGamesMin)) {
        transitionTo(h, 'unresolved', 'game budget exhausted before investigation', now());
        note('budget-skip', `${h.hypothesisId} left unresolved — remaining budget ${remaining()} below minimum viable stage`, h.hypothesisId);
        continue;
      }
    }

    let terminal = null;
    for (const stage of h.plan.stages) {
      if (signal?.aborted) break;
      if (stage.status === 'complete' || stage.status === 'skipped') continue;
      const needed = stage.series.gameCount;
      if (remaining() < needed && stage.kind !== 'confirm') { stage.status = 'skipped'; note('stage-skip', `${h.hypothesisId} ${stage.key} skipped — budget`, h.hypothesisId); continue; }
      if (remaining() < needed && stage.kind === 'confirm') {
        // Shrink the confirm stage rather than dying on the floor — but
        // never below the minimum viable pair count.
        const affordable = Math.floor(remaining() / 2) * 2;
        if (affordable < DISCOVERY_LIMITS.confirmGamesMin) { stage.status = 'skipped'; continue; }
        stage.series = { ...stage.series, gameCount: affordable };
      }
      stage.status = 'running';
      transitionTo(h, stage.kind === 'replicate' ? 'replicating' : stage.kind === 'challenge-population' ? 'challenging' : 'testing', `${stage.key} started`, now());
      note('stage', `${h.hypothesisId} → ${stage.key} (${stage.series.gameCount} games, seed ${stage.series.seed})`, h.hypothesisId);
      const prepared = resumeStageRun ? await resumeStageRun(h, stage) : null;
      const result = await executeSeries(stage.series, {
        identity: run.identity, signal, run: prepared,
        onProgress: (p) => onProgress({ hypothesisId: h.hypothesisId, stageKey: stage.key, ...p, budgetConsumed: run.budget.consumed + p.completed }),
      });
      const persisted = persistStageRun ? await persistStageRun(h, stage, result.run) : null;
      if (result.run.status === 'STOPPED' || signal?.aborted) {
        // Stage interrupted mid-flight — keep it pending so a later resume
        // continues the prepared series rather than re-running it.
        stage.status = 'pending';
        break;
      }
      if (persisted === false) {
        // The stage executed but its run artifact is not durably stored.
        // The run id must not enter provenance, and the persistence gap
        // must block promotion — a discovery may only cite evidence that
        // actually exists.
        stage.persisted = false;
        warn(run, 'STAGE_EVIDENCE_NOT_PERSISTED', `${h.hypothesisId} ${stage.key}: stage run ${result.run.runId} could not be durably stored`);
        note('persistence-failure', `${h.hypothesisId} ${stage.key}: executed but not durably persisted — this stage cannot back a promoted discovery`, h.hypothesisId);
      } else {
        stage.experimentRunId = result.run.runId;
      }
      stage.status = 'complete';
      run.budget.consumed += result.run.records.length;
      run.experiments.push({ hypothesisId: h.hypothesisId, stageKey: stage.key, runId: persisted === false ? null : result.run.runId, games: result.run.records.length, seed: stage.series.seed, ...(persisted === false ? { persisted: false } : {}) });
      const cell = measureStage(h, result.run);
      // Only confirm/replicate batches contribute to the primary estimand —
      // a population challenge deliberately measures a different pairing and
      // must not dilute the claimed effect.
      if (stage.kind !== 'challenge-population') h.evidence.cells.push(cell);
      const verdict = stage.kind === 'replicate' ? replicationVerdict(h, cell) : stageVerdict(h, cell);
      stage.result = { verdict: verdict.verdict, estimate: verdict.estimate, interval: verdict.interval ?? null, reason: verdict.reason, games: cell.games, decisive: cell.decisive };
      onStage(h, stage, cell);
      note('stage-result', `${h.hypothesisId} ${stage.key}: ${verdict.verdict.toUpperCase()}${isFiniteNum(verdict.estimate) ? ` (est ${verdict.estimate >= 0 ? '+' : ''}${(verdict.estimate * (h.outcome === 'meanTurns' ? 1 : 100)).toFixed(h.outcome === 'meanTurns' ? 1 : 1)}${h.outcome === 'meanTurns' ? ' turns' : 'pp'})` : ''} — ${verdict.reason}`, h.hypothesisId);

      if (stage.kind === 'confirm') {
        const seat = seatConsistencyCheck(h, cell);
        h.checks.push(seat);
        if (seat.verdict === 'failed') {
          terminal = { state: 'rejected', reason: `seat-mirror challenge failed: ${seat.detail}` };
          note('confound', `${h.hypothesisId} seat confound detected — signal may be first-player advantage`, h.hypothesisId);
          // Emergent candidate: a genuine seat signal deserves its own investigation.
          const seatPair = pairKey(stage.series.botA, stage.series.botB);
          const alreadySpawned = run.hypotheses.some((h2) => h2.outcome === 'seat1WinRate' && h2.scope?.pairing === seatPair);
          if ((seat.seatBias ?? 0) >= 0.08 && cell.decisive >= 100 && !alreadySpawned && evidenceIndex
            && run.hypotheses.length < DISCOVERY_LIMITS.hypothesesMax + 12) {
            const seatCandidate = {
              schemaVersion: 1, candidateId: `C-${hashCanonical({ seat: h.hypothesisId, bias: seat.seatBias }).slice(0, 10)}`,
              category: 'seat', subjectKey: `seat:${seatPair}`,
              summary: `Seat effect detected while investigating ${h.hypothesisId}: orientation win gap ${(seat.seatBias * 100).toFixed(1)}pp.`,
              signal: { observed: null, expected: 0.5, deviation: seat.seatBias, unit: 'probability', sampleSize: cell.decisive, method: 'in-run-orientation-gap', surprise: null },
              scores: scoreCandidate({ category: 'seat', scores: { novelty: 70, impact: 80, signal: 75, evidenceGap: 50, testability: 95, computeCost: DISCOVERY_LIMITS.replicationGames } }, run.mode),
              detectedAt: now(),
            };
            seatCandidate.scores = scoreCandidate(seatCandidate, run.mode);
            const seatH = buildHypothesis(seatCandidate, run, evidenceIndex, config, now());
            if (seatH) {
              seatH.lifecycle = [{ state: 'hypothesis', reason: `spawned mid-run from ${h.hypothesisId}`, at: now() }];
              transitionTo(seatH, 'queued', 'queued for investigation', now());
              run.hypotheses.push(seatH);
              if (run.candidates.length < DISCOVERY_LIMITS.candidatesMax) run.candidates.push(seatCandidate);
              note('spawned', `Unexpected interaction detected; ${seatH.hypothesisId} spawned`, seatH.hypothesisId);
            }
          }
          break;
        }
        if (verdict.verdict === 'refuted') { terminal = { state: 'rejected', reason: `confirm stage refuted: ${verdict.reason}` }; break; }
        if (verdict.verdict === 'inconclusive') { terminal = { state: 'unresolved', reason: `confirm stage inconclusive: ${verdict.reason}` }; break; }
        transitionTo(h, 'supported_finding', 'initial signal reproduced under controlled conditions', now());
        note('supported', `${h.hypothesisId} initial signal reproduced — entering challenge/replication`, h.hypothesisId);
      } else if (stage.kind === 'challenge-population') {
        const d = estimateFromCell(h, cell);
        const survived = isFiniteNum(d.estimate) && Math.sign(d.estimate) === h.direction && Math.abs(d.estimate) >= h.minEffect / 2;
        const verdictText = survived ? 'association survives a different opponent' : 'association absent against control opponent';
        h.checks.push({ kind: 'challenge-population', verdict: survived ? 'passed' : 'failed', detail: `${verdictText} (est ${isFiniteNum(d.estimate) ? d.estimate.toFixed(3) : 'n/a'} vs ${stage.series.botB})` });
        note('challenge', `${h.hypothesisId} population challenge ${survived ? 'PASSED' : 'FAILED'} — ${verdictText}`, h.hypothesisId);
        if (!survived) {
          // The pairing-specific claim may still hold, but the general
          // mechanism did not transfer → scope narrows to conditional.
          h.scopeNote = `Effect did not reproduce against control opponent ${stage.series.botB}; scope limited to ${pairKey(stage.series.botA, h.scope.policies?.[1] ?? stage.series.botB)}.`;
        }
      } else if (stage.kind === 'replicate') {
        h.replication.attempted += 1;
        if (verdict.verdict === 'passed') { h.replication.passed += 1; note('replication', `${h.hypothesisId} replication ${h.replication.passed}/${h.replication.attempted} passed`, h.hypothesisId); }
        else if (verdict.verdict === 'failed') { h.checks.push({ kind: 'replication', verdict: 'failed', detail: `${stage.key}: ${verdict.reason}` }); terminal = { state: 'rejected', reason: `replication failed: ${verdict.reason}` }; break; }
        else h.checks.push({ kind: 'replication', verdict: 'inconclusive', detail: `${stage.key}: ${verdict.reason}` });
      }
    }

    if (terminal == null && !signal?.aborted && !TERMINAL_HYPOTHESIS_STATES.includes(h.status)) {
      // Pool all measured cells → promotion judgment.
      const pooled = (h.evidence.cells ?? []).reduce((a, c) => mergeCells(a, c), structuredClone(EMPTY_CELL));
      const est = estimateFromCell(h, pooled);
      h.evidence.estimate = est.estimate;
      h.evidence.interval = est.interval;
      // For non-outcome metrics the estimand's denominator is clean games.
      h.evidence.decisive = h.outcome === 'meanTurns' || h.outcome === 'faultRate' ? pooled.games - pooled.faulted : pooled.decisive;
      h.evidence.games = pooled.games;
      h.evidence.experimentRunIds = h.plan.stages.map((s) => s.experimentRunId).filter(Boolean);
      // Re-run the seat-consistency check over ALL mirrored batches; a pooled
      // verdict supersedes the confirm-only one (pooled evidence is stronger).
      const seatIdx = (h.checks ?? []).findIndex((c) => c.kind === 'seat-mirror');
      if (seatIdx >= 0) {
        const pooledSeat = seatConsistencyCheck(h, pooled);
        if (pooledSeat.verdict !== 'inconclusive') h.checks[seatIdx] = pooledSeat;
      }
      h.evidence.pValue = rawEstimatePValue(est.estimate, est.interval);
      pendingJudgment.push(h);
    }

    if (terminal) {
      transitionTo(h, terminal.state, terminal.reason, now());
      note(terminal.state, `${h.hypothesisId} ${terminal.state} — ${terminal.reason}`, h.hypothesisId);
    }
  }

  if (!signal?.aborted) {
    // The measured family is now fixed — judge every hypothesis against
    // a real Benjamini–Hochberg q-value computed over all of them.
    const family = pendingJudgment
      .filter((h) => h.evidence.pValue != null)
      .map((h) => ({ id: h.hypothesisId, pValue: h.evidence.pValue }));
    for (const h of pendingJudgment) {
      const judgment = evaluatePromotion(h, { familyPValues: family });
      h.evidence.qValue = judgment.qValue ?? null;
      if (judgment.verdict === 'promote' || judgment.verdict === 'conditional') {
        transitionTo(h, 'replicated_finding', `replication ${h.replication.passed}/${h.replication.attempted}, grade ${judgment.grade}`, now());
        const discovery = createDiscoveryArtifact(h, run, judgment, now());
        run.discoveries.push(discovery);
        transitionTo(h, judgment.verdict === 'conditional' ? 'conditional_discovery' : 'discovery', `promoted to ${discovery.discoveryId} (${discovery.confidence} confidence)`, now());
        note('discovery', `✦ ${discovery.discoveryId} promoted — ${h.claim}`, discovery.discoveryId);
      } else {
        const state = judgment.verdict === 'reject' ? 'rejected' : 'unresolved';
        const reason = `promotion gates: ${judgment.reasons.filter((r) => !r.passed).map((r) => r.code).join(', ') || 'passed'}`;
        transitionTo(h, state, reason, now());
        note(state, `${h.hypothesisId} ${state} — ${reason}`, h.hypothesisId);
      }
    }
  }

  if (signal?.aborted) {
    run.status = 'PAUSED';
    note('paused', `Run paused at ${run.budget.consumed}/${run.budget.allocated} games`);
  } else {
    for (const h of run.hypotheses) {
      if (['queued', 'testing', 'challenging', 'replicating'].includes(h.status)) {
        transitionTo(h, 'unresolved', 'run ended before investigation completed', now());
      }
    }
    const summary = { evaluated: run.hypotheses.filter((h2) => TERMINAL_HYPOTHESIS_STATES.includes(h2.status)).length, discoveries: run.discoveries.length };
    run.status = 'COMPLETE';
    run.completedAt = now();
    note('complete', `DISCOVER complete — ${summary.evaluated} hypotheses evaluated, ${run.discoveries.length} discoveries promoted, ${run.budget.consumed} games consumed`);
  }
  return run;
}
