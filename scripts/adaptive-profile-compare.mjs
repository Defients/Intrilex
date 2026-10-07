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

const run = ({ seed, adaptive, opponent }) => runPolicyMatch({
  seed, ordinal: 0, profileId: 'core-advanced-authority',
  policyIds: [WEIGHTED_POLICY_ID, opponent], seatOrder: ['P1', 'P2'],
  policyStates: [basePolicy, null], adaptiveConfigs: [adaptive, null],
  decisionLimit: DECISION_LIMIT, telemetryEnabled: false,
});

const summarize = matches => ({
  wins: matches.filter(m => m.summary.winner === 'P1').length,
  losses: matches.filter(m => m.summary.winner === 'P2').length,
  draws: matches.filter(m => !m.summary.winner).length,
  scoreDiff: Number((matches.reduce((s, m) => s + (m.summary.finalScores?.P1 ?? 0) - (m.summary.finalScores?.P2 ?? 0), 0) / matches.length).toFixed(2)),
  avgDecisions: Math.round(matches.reduce((s, m) => s + m.decisions.length, 0) / matches.length),
  states: matches.reduce((acc, m) => { const sd = m.summary.adaptiveTelemetry?.seats?.[0]?.stateDecisions ?? {}; for (const [k, v] of Object.entries(sd)) acc[k] = (acc[k] ?? 0) + v; return acc; }, {}),
  transitions: matches.reduce((s, m) => s + (m.summary.adaptiveTelemetry?.seats?.[0]?.transitionCount ?? 0), 0),
  hysteresisSuppressions: matches.reduce((s, m) => s + (m.summary.adaptiveTelemetry?.seats?.[0]?.hysteresisSuppressions ?? 0), 0),
});

const report = { seeds: SEEDS, decisionLimit: DECISION_LIMIT, opponents: OPPONENTS, matchups: {}, determinism: {}, perf: {} };
let changed = 0, identical = 0;
for (const opponent of OPPONENTS) {
  const off = [], ruled = [];
  const t0 = performance.now();
  for (let seed = 1; seed <= SEEDS; seed += 1) off.push(run({ seed, adaptive: OFF_CONFIG, opponent }));
  const offMs = performance.now() - t0;
  const t1 = performance.now();
  for (let seed = 1; seed <= SEEDS; seed += 1) ruled.push(run({ seed, adaptive: RULED_CONFIG, opponent }));
  const ruledMs = performance.now() - t1;
  for (let i = 0; i < SEEDS; i += 1) (off[i].summary.matchResultHash === ruled[i].summary.matchResultHash ? identical++ : changed++);
  report.matchups[opponent] = { OFF: summarize(off), RULED: summarize(ruled) };
  report.perf[opponent] = { offMsPerMatch: Number((offMs / SEEDS).toFixed(1)), ruledMsPerMatch: Number((ruledMs / SEEDS).toFixed(1)) };
}
report.determinism = { decisionDivergenceSeeds: changed, identicalSeeds: identical, note: 'identical hash = same decisions; divergence proves RULED actually changed play' };
// OFF vs absent equivalence (structural invariant).
const absent = run({ seed: 1, adaptive: null, opponent: 'control' });
const offRun = run({ seed: 1, adaptive: OFF_CONFIG, opponent: 'control' });
report.offEquivalence = { matchResultHashIdentical: absent.summary.matchResultHash === offRun.summary.matchResultHash };
console.log(JSON.stringify(report, null, 2));
