import { runPolicyMatch } from '@intrilex/simulation-runtime';

const seed = 3068743422;
const ordinal = 2555;
const result = runPolicyMatch({
  ordinal,
  seed,
  profileId: 'core-advanced-authority',
  policyIds: ['random-legal', 'random-legal'],
  seatOrder: ['P1', 'P2'],
  includeReplay: true
});

const s = result.summary;
console.log(JSON.stringify({
  seed,
  ordinal,
  matchId: s.matchId,
  terminationReason: s.terminationReason,
  errorCode: s.errorCode,
  errorDetail: s.errorDetail,
  ruleCompliance: s.ruleCompliance,
  replayHash: s.replayHash,
}, null, 2));
