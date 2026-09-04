import { createPolicyDefinition } from '@intrilex/policy-sdk';
import { rankPolicyActions} from './scoring.mjs';

const lexical = (actions) => [...actions].sort((a, b) => a.actionId.localeCompare(b.actionId));
const decision = (action, reasonCode, evaluatedCount, candidateScores = []) => ({
  actionId: action.actionId,
  metadata: { reasonCode, evaluatedCount, candidateScores }
});

function strategicPolicy(policyId, version, traits, reasonCode, strengthTier = 'heuristic') {
  return createPolicyDefinition({
    policyId,
    version,
    traits,
    strengthTier,
    choose(context) {
      const ranked = rankPolicyActions(policyId, context.legalActions, context);
      const selected = ranked[0]?.action;
      if (!selected) throw Object.assign(new Error('NO_LEGAL_ACTION'), { code: 'NO_LEGAL_ACTION' });
      return decision(selected, reasonCode, ranked.length, ranked.slice(0, 8).map(({ action, score }) => ({ actionId: action.actionId, score })));
    }
  });
}

export const RANDOM_LEGAL = createPolicyDefinition({
  policyId: 'random-legal', version: '2.0.0', traits: { explorationRate: 1 }, strengthTier: 'fixture',
  choose(context) {
    const actions = lexical(context.legalActions);
    const selected = actions[context.rng.nextIndex(actions.length)];
    return decision(selected, 'UNIFORM_RANDOM', actions.length);
  }
});

export const SCORE_RUSH = strategicPolicy('score-rush', '2.0.0', { immediateScorePreference: 1, aggression: 0.35, counterConservation: 0.65 }, 'MAX_SCORE_PRESSURE', 'heuristic');
export const CONTROL = strategicPolicy('control', '2.0.0', { disruptionPreference: 1, aggression: 0.85, counterConservation: 0.2 }, 'MAX_BOARD_AND_RESPONSE_CONTROL', 'heuristic');
export const TEMPO = strategicPolicy('tempo', '2.0.0', { aggression: 0.55, handValuePreservation: 0.35, counterConservation: 0.45 }, 'MAX_TEMPO', 'heuristic');
export const VALUE = strategicPolicy('value', '2.0.0', { handValuePreservation: 0.8, riskTolerance: 0.35, counterConservation: 0.55 }, 'MAX_EXPECTED_VALUE', 'heuristic');

export const CORE_POLICY_CATALOG = Object.freeze([RANDOM_LEGAL, SCORE_RUSH, CONTROL, TEMPO, VALUE]);
export const CORE_POLICY_BY_ID = Object.freeze(Object.fromEntries(CORE_POLICY_CATALOG.map((policy) => [policy.policyId, policy])));
export { rankPolicyActions, selectPolicyAction, decomposePolicyScore, rankPolicyActionsWithDecomposition, SCORING_WEIGHTS, createScoringWeights, scoringWeightsHash, scorePolicyAction } from './scoring.mjs';
