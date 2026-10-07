import { runPolicyMatch } from '@intrilex/simulation-runtime';
import { WEIGHTED_POLICY_ID } from '../packages/policies/src/weighted-heuristic.mjs';
import { compileTraits, ZERO_GENOME } from '../packages/simulation-runtime/src/profile-contracts.mjs';
import { ADAPTIVE_CONTRACT } from '../packages/simulation-runtime/src/adaptive-strategy.mjs';

// Adaptive Strategy validation harness (research, not CI-gated).
// Compares one baseline genome under OFF vs RULED across varied opponent
// styles on identical seeds. Usage:
//   node scripts/adaptive-profile-compare.mjs [--seeds N] [--decisions N]

const numberArg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? Number(process.argv[i + 1]) : fallback; };
const SEEDS = numberArg('--seeds', 12);
const DECISION_LIMIT = numberArg('--decisions', 1800);

const basePolicy = compileTraits({
  traits: { scoringDrive: 35, resourceAppetite: 15, initiative: 30, guard: 40, combinationPlay: 20, riskAppetite: 25 },
  baseGenome: ZERO_GENOME(),
}).policyState;

const RULED_CONFIG = {
  contract: ADAPTIVE_CONTRACT, mode: 'RULED',
  modifiers: {
    AHEAD: { defense: 15, risk: -20 },
    DOMINANT: { points: 20, tempo: 10, resource: -15 },
    BEHIND: { tempo: 20, risk: 15, defense: -10 },
    DESPERATE: { tempo: 30, risk: 30, defense: -25 },
    WIN_OPPORTUNITY: { points: 40, tempo: 30, resource: -30, synergy: -20 },
    DEFENSIVE_EMERGENCY: { defense: 40, risk: 10, tempo: -10 },
  },
};
const OFF_CONFIG = { contract: ADAPTIVE_CONTRACT, mode: 'OFF' };

const OPPONENTS = ['control', 'tempo', 'score-rush', 'value', 'random-legal'];

// Mirrored seats: the adaptive profile plays each seed from both seats, so the
// OFF→RULED delta is seat-adjusted rather than confounded by first-player edge.
// `seat` is the seat the adaptive profile occupies; the opponent takes the other.
const run = ({ seed, adaptive, opponent, seat = 'P1' }) => runPolicyMatch({
  seed, ordinal: 0, profileId: 'core-advanced-authority',
  policyIds: seat === 'P1' ? [WEIGHTED_POLICY_ID, opponent] : [opponent, WEIGHTED_POLICY_ID],
  seatOrder: ['P1', 'P2'],
  policyStates: seat === 'P1' ? [basePolicy, null] : [null, basePolicy],
  adaptiveConfigs: seat === 'P1' ? [adaptive, null] : [null, adaptive],
  decisionLimit: DECISION_LIMIT, telemetryEnabled: false,
});

const summarize = (matches, seat) => {
  const seatNumber = seat === 'P1' ? 1 : 2;
  const seatEntry = m => m.summary.adaptiveTelemetry?.seats?.find(s => s.seat === seatNumber);
  return {
    wins: matches.filter(m => m.summary.winner === seat).length,
    losses: matches.filter(m => m.summary.winner && m.summary.winner !== seat).length,
    draws: matches.filter(m => !m.summary.winner).length,
    scoreDiff: Number((matches.reduce((s, m) => s + (m.summary.finalScores?.[seat] ?? 0) - (m.summary.finalScores?.[seat === 'P1' ? 'P2' : 'P1'] ?? 0), 0) / matches.length).toFixed(2)),
    avgDecisions: Math.round(matches.reduce((s, m) => s + m.decisions.length, 0) / matches.length),
    states: matches.reduce((acc, m) => { const sd = seatEntry(m)?.stateDecisions ?? {}; for (const [k, v] of Object.entries(sd)) acc[k] = (acc[k] ?? 0) + v; return acc; }, {}),
    transitions: matches.reduce((s, m) => s + (seatEntry(m)?.transitionCount ?? 0), 0),
    hysteresisSuppressions: matches.reduce((s, m) => s + (seatEntry(m)?.hysteresisSuppressions ?? 0), 0),
  };
};
const winRate = s => s.wins + s.losses + s.draws ? Number((s.wins / (s.wins + s.losses + s.draws)).toFixed(3)) : null;

const report = { seeds: SEEDS, decisionLimit: DECISION_LIMIT, opponents: OPPONENTS, mirroredSeats: true, matchups: {}, determinism: {}, perf: {} };
let changed = 0, identical = 0;
for (const opponent of OPPONENTS) {
  const arms = { OFF: {}, RULED: {} }, t = {};
  for (const arm of ['OFF', 'RULED']) {
    const t0 = performance.now();
    for (const seat of ['P1', 'P2']) {
      const matches = [];
      for (let seed = 1; seed <= SEEDS; seed += 1) matches.push(run({ seed, adaptive: arm === 'OFF' ? OFF_CONFIG : RULED_CONFIG, opponent, seat }));
      arms[arm][seat] = matches;
    }
    t[arm] = performance.now() - t0;
  }
  for (let i = 0; i < SEEDS; i += 1) for (const seat of ['P1', 'P2']) (arms.OFF[seat][i].summary.matchResultHash === arms.RULED[seat][i].summary.matchResultHash ? identical++ : changed++);
  const bySeat = seat => ({ OFF: summarize(arms.OFF[seat], seat), RULED: summarize(arms.RULED[seat], seat) });
  const p1 = bySeat('P1'), p2 = bySeat('P2');
  // Seat-adjusted delta: mean of the two per-seat arm deltas on identical seeds.
  const seatAdjusted = { winRateP1: { OFF: winRate(p1.OFF), RULED: winRate(p1.RULED) }, winRateP2: { OFF: winRate(p2.OFF), RULED: winRate(p2.RULED) } };
  seatAdjusted.delta = { P1: seatAdjusted.winRateP1.RULED - seatAdjusted.winRateP1.OFF, P2: seatAdjusted.winRateP2.RULED - seatAdjusted.winRateP2.OFF };
  seatAdjusted.delta.mean = Number(((seatAdjusted.delta.P1 + seatAdjusted.delta.P2) / 2).toFixed(3));
  report.matchups[opponent] = { P1: p1, P2: p2, seatAdjusted };
  report.perf[opponent] = { offMsPerMatch: Number((t.OFF / (2 * SEEDS)).toFixed(1)), ruledMsPerMatch: Number((t.RULED / (2 * SEEDS)).toFixed(1)) };
}
report.determinism = { decisionDivergenceSeeds: changed, identicalSeeds: identical, note: 'identical hash = same decisions; divergence proves RULED actually changed play' };
// OFF vs absent equivalence (structural invariant).
const absent = run({ seed: 1, adaptive: null, opponent: 'control' });
const offRun = run({ seed: 1, adaptive: OFF_CONFIG, opponent: 'control' });
report.offEquivalence = { matchResultHashIdentical: absent.summary.matchResultHash === offRun.summary.matchResultHash };
console.log(JSON.stringify(report, null, 2));
