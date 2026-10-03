import { scorePolicyAction, decomposePolicyScore } from './scoring.mjs';

// Residuals over shipped control scoring. Each feature comes from the existing
// authorized-view decomposition; no hidden state or duplicated legal rules.
export const WEIGHTED_POLICY_ID = 'weighted-heuristic-v1';
export const WEIGHT_FEATURES = Object.freeze(['points','resource','tempo','defense','synergy','risk']);
export const WEIGHT_BOUND = 2000;
export function baselinePolicyState() {
  return { schemaVersion:1, basePolicyId:'control', weights:Object.fromEntries(WEIGHT_FEATURES.map(k=>[k,0])) };
}
export function validatePolicyState(state) {
  if (!state || state.schemaVersion !== 1 || state.basePolicyId !== 'control' || Object.keys(state).sort().join() !== 'basePolicyId,schemaVersion,weights' || !state.weights || Object.keys(state.weights).sort().join() !== [...WEIGHT_FEATURES].sort().join() || WEIGHT_FEATURES.some(k=>!Number.isFinite(state.weights[k]) || Math.abs(state.weights[k])>WEIGHT_BOUND)) throw new Error('INVALID_WEIGHTED_POLICY_STATE');
  return state;
}
export function chooseWeightedAction(state, context) {
  validatePolicyState(state);
  const ranked=context.legalActions.map(action=>{
    const features=decomposePolicyScore(state.basePolicyId,action,context);
    const score=scorePolicyAction(state.basePolicyId,action,context)+WEIGHT_FEATURES.reduce((sum,k)=>sum+features[k]*state.weights[k],0);
    return {action,score};
  }).sort((a,b)=>b.score-a.score || a.action.actionId.localeCompare(b.action.actionId));
  return ranked[0]?.action ?? null;
}
