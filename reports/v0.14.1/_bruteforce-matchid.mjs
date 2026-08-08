import { hashCanonical } from '@intrilex/shared';
import { POLICY_CATALOG } from '@intrilex/simulation-runtime/policy-catalog';

const targetMatchId = 'M-60477c97e290713acf46';
const seed = 3068743422;
const profileId = 'core-advanced-authority';
const allPolicyIds = POLICY_CATALOG.map(p => p.policyId);
const seatOrders = [['P1','P2'], ['P2','P1']];

let found = false;
for (const seatOrder of seatOrders) {
  for (const a of allPolicyIds) {
    for (const b of allPolicyIds) {
      const policyIds = [a, b];
      const mid = `M-${hashCanonical({ profileId, seed, seatOrder, policyIds }).slice(0, 20)}`;
      if (mid === targetMatchId) {
        console.log('FOUND:', JSON.stringify({ seatOrder, policyIds, matchId: mid }));
        found = true;
      }
    }
  }
}
if (!found) console.log('NOT FOUND among', allPolicyIds.length, 'policies');
console.log('All policy IDs:', JSON.stringify(allPolicyIds));
