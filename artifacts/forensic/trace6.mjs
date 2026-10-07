import {actionFixture} from '../../packages/policies/test/action-fixtures.mjs';
import {createSimulationDecisionFrame, strictPolicyView} from '../../packages/engine-adapter/src/adapter.mjs';
import {rankPolicyActions} from '../../packages/policies/src/index.mjs';
import {evaluateAction} from '../../packages/policies/src/action-evaluation.mjs';

const state=actionFixture({hand:['6♣','2♦','A♠','3♣'],enemyHand:['9♦','5♥','8♣']});
const frame=createSimulationDecisionFrame(state);
const view=strictPolicyView(frame.state,'P1');
const ctx={actorId:'P1',authorizedView:view,legalActions:frame.policyActions};
for (const a of frame.policyActions.filter(x=>x.family==='effect-private-choice')) {
  console.log(a.mode, JSON.stringify(evaluateAction(a,ctx)));
}
const draw=frame.policyActions.find(x=>x.family==='draw');
console.log('draw-top', JSON.stringify(evaluateAction(draw,ctx)));
