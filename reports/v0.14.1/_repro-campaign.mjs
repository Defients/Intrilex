import { hashCanonical } from '@intrilex/shared';
import { POLICY_CATALOG } from '@intrilex/simulation-runtime/policy-catalog';
import { runPolicyMatch, deriveMatchSeed } from '@intrilex/simulation-runtime';

const BASE_POLICY_IDS = POLICY_CATALOG.filter(p => !p.policyId.startsWith('hybrix-')).map(p => p.policyId);
const policyPairs = BASE_POLICY_IDS.flatMap(left => BASE_POLICY_IDS.map(right => [left, right]));
const matchCount = 5000;
const semantic = {
  schemaVersion: '4.0.0', profileId: 'core-advanced-authority', matchCount,
  seatOrder: ['P1', 'P2'], policyPairs,
  decisionLimit: 1800, engineVersion: '4.2.5', rulesVersion: '4.1.2',
  labVersion: '0.10.1', policySurfaceVersion: '4.0.0', telemetrySchemaVersion: '4.0.0', analyticsSchemaVersion: '4.0.0'
};
const experimentHash = hashCanonical(semantic);
console.log('experimentHash:', experimentHash);
console.log('BASE_POLICY_IDS:', BASE_POLICY_IDS.length, JSON.stringify(BASE_POLICY_IDS));
console.log('policyPairs:', policyPairs.length);

const ordinal = 2555;
const seed = deriveMatchSeed(experimentHash, ordinal);
const pair = policyPairs[ordinal % policyPairs.length];
const swap = Math.floor(ordinal / policyPairs.length) % 2 === 1;
const seatOrder = swap ? ['P2', 'P1'] : ['P1', 'P2'];
console.log('ordinal', ordinal, 'seed', seed, 'pair', JSON.stringify(pair), 'swap', swap, 'seatOrder', seatOrder);

const result = runPolicyMatch({
  ordinal, seed, profileId: 'core-advanced-authority',
  seatOrder, policyIds: pair, decisionLimit: 1800, includeReplay: true
});
const s = result.summary;
console.log(JSON.stringify({
  matchId: s.matchId, seed, terminationReason: s.terminationReason,
  errorCode: s.errorCode, errorDetail: s.errorDetail,
  ruleCompliance: s.ruleCompliance?.status, replayHash: s.replayHash,
  winner: s.winner
}, null, 2));
