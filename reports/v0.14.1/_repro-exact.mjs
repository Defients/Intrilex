import { runPolicyMatch } from '@intrilex/simulation-runtime';

const seed = 3068743422;
const result = runPolicyMatch({
  ordinal: 2555,
  seed,
  profileId: 'core-advanced-authority',
  policyIds: ['hybrix-rusher-nightmare', 'hybrix-rusher-hard'],
  seatOrder: ['P1', 'P2'],
  includeReplay: true,
  decisionLimit: 1800
});
const s = result.summary;
console.log(JSON.stringify({
  matchId: s.matchId, seed, terminationReason: s.terminationReason,
  errorCode: s.errorCode, errorDetail: s.errorDetail,
  ruleCompliance: s.ruleCompliance?.status,
  replayHash: s.replayHash, winner: s.winner,
  completedFullTurns: s.completedFullTurns
}, null, 2));
