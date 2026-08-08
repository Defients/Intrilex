import { CORE_POLICY_CATALOG} from '@intrilex/policies';
import { HYBRIX_POLICIES } from '@intrilex/game-ai/policy-adapter';

export const POLICY_CATALOG = Object.freeze([...CORE_POLICY_CATALOG, ...HYBRIX_POLICIES]);
export const POLICY_BY_ID = Object.freeze(Object.fromEntries(POLICY_CATALOG.map((policy) => [policy.policyId, policy])));
export { HYBRIX_POLICIES } from '@intrilex/game-ai/policy-adapter';
