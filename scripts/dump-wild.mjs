import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSimulationState, advanceSimulationToDecision, authorizedActionView } from '@intrilex/engine-adapter';

const runtimeDir = path.resolve('runtime/autonomy-engine-dist/src');
const moduleUrl = (f) => pathToFileURL(path.join(runtimeDir, f)).href;
const { IntrilexEngine } = await import(moduleUrl('engine.js'));
const { moveCard } = await import(moduleUrl('state.js'));

const setup = { profileId: 'core-unrestricted-authority', playerIds: ['P1','P2'], enabledModules: [], seed: 0x51BD01, seatOrder: ['P1','P2'] };
const engine = new IntrilexEngine();
let state = createSimulationState(setup);
let d = advanceSimulationToDecision(state);
const enter = d.legalActionFrame.actions.find(a => a.mode === 'enter-action');
state = engine.execute(d.state, enter.command).state;

const cardBy = (s, id) => Object.values(s.cards).find(c => c.identity === id)?.id;
const ks = cardBy(state, 'K♠');
moveCard(state, ks, 'P1_HAND', 'P1');
for (const t of ['A♣','6♥','2♣','8♦','9♣']) moveCard(state, cardBy(state, t), 'P2_PR', 'P2');
for (const c of ['3♣','5♦','J♥']) moveCard(state, cardBy(state, c), 'P1_HAND', 'P1');

d = advanceSimulationToDecision(state);
const wild = d.legalActionFrame.actions.filter(a => a.family === 'wild-sovereignty');
console.log('wild count:', wild.length);
for (const a of wild) {
  const ra = a.command?.action?.action?.action ?? a.command?.action;
  console.log(JSON.stringify({
    mode: a.mode, tgt: a.targetCardIds,
    fv: a.featureVector,
    rankKind: ra?.kind, copyKind: ra?.copiedAction?.kind, copyRow: ra?.copiedAction?.row,
    discardCost: ra?.discardCostCardId, copyDiscard: ra?.copiedAction?.discardCardIds,
  }));
}
const av = authorizedActionView(wild[0], 'core-unrestricted-authority');
console.log('authorized keys:', Object.keys(av));
