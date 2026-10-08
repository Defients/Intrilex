import { evolutionIdentity } from '../../scripts/evolution-identity.mjs';
import { sampleIdentity, outcomeIdentity, commandStreamStart } from '../../packages/simulation-runtime/src/evidence-identity.mjs';
import { hashCanonical } from '../../packages/shared/src/canonical.mjs';
export const currentIdentity = await evolutionIdentity();

/** Synthetic outcomes with internally valid provenance for storage tests. */
export function trustedSummary(input, config = {}) {
  const ordinal = input.matchOrdinal ?? input.ordinal ?? 0;
  const row = { schemaVersion:'4.1.0', profileId:'core-advanced-authority', seed:ordinal+1,
    finalStateHash:hashCanonical({ordinal}),finalScores:{P1:0,P2:0},...input };
  row.identity={...sampleIdentity({...config,profileId:row.profileId,seed:row.seed,policyIds:row.policyIds},currentIdentity),
    ...outcomeIdentity(row,commandStreamStart())};
  return row;
}
