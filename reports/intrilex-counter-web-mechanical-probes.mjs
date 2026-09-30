import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createSimulationState, createSimulationDecisionFrame, executeSimulationAction } from '../packages/engine-adapter/src/adapter.mjs';
import { targetAcceptsCounter } from '../runtime/autonomy-engine-dist/src/core-response.js';

const deck = [...['A','2','3','4','5','6','7','8','9','10','J','Q','K'].flatMap(rank => ['♣','♦','♥','♠'].map(suit => rank + suit)), 'RJ', 'BJ'];
const output = new URL('./intrilex-counter-web-mechanical-probes-complete.json', import.meta.url);
const sources = ['runtime/autonomy-engine-dist/src/core-authority.js', 'runtime/autonomy-engine-dist/src/core-response.js', 'runtime/autonomy-engine-dist/src/core-advanced.js', 'runtime/autonomy-engine-dist/src/core-autonomy.js', 'runtime/autonomy-engine-dist/src/ranks.js', 'docs/INTRILEX_v4.3.1_COMPLETE_PLAYER_RULEBOOK.md'];
const hashes = Object.fromEntries(await Promise.all(sources.map(async file => [file, createHash('sha256').update(await readFile(new URL('../' + file, import.meta.url))).digest('hex')])));

function probe(name, first, choose) {
  const seed = 81001;
  let state = createSimulationState({ profileId: 'core-unrestricted-authority', playerIds: ['P1','P2'], seatOrder: ['P1','P2'], enabledModules: [], seed, predeterminedIdentities: [...first, ...deck.filter(card => !first.includes(card))] });
  const events = [], declarations = [];
  let steps = 0;
  for (; steps < 80; steps++) {
    const frame = createSimulationDecisionFrame(state);
    state = frame.state;
    events.push(...frame.events);
    if (state.fullTurnSequence > 1 || !frame.policyActions.length) break;
    let action = frame.policyActions.find(a => a.family === 'response-decline') ?? frame.policyActions.find(a => a.family === 'phase' && a.mode === 'enter-action');
    if (!action && state.phase === 'Action') {
      action = choose(frame, declarations.length);
      if (action) declarations.push({ ordinal: declarations.length + 1, family: action.family, mode: action.mode, usedBefore: state.players.P1.limits.miniTurnsUsed, remainingBefore: state.players.P1.limits.miniTurnsRemaining });
    }
    assert.ok(action, name + ': unexpected decision');
    const result = executeSimulationAction(state, frame.resolve(action.actionId));
    assert.equal(result.accepted, true, name + ': rejected command');
    events.push(...result.events);
    state = result.state;
  }
  assert.ok(steps < 80, name + ': step cap');
  return { name, seed, predeterminedPrefix: first, firstPlayer: 'P1', responsePolicy: 'decline every optional response', declarations, events, resultingFullTurnSequence: state.fullTurnSequence, firstPlayerLimits: state.players.P1.limits, firstPlayerHand: state.players.P1.hand.map(id => state.cards[id].identity), firstPlayerPR: state.players.P1.pr.map(id => ({ identity: state.cards[id].identity, state: state.cards[id].state })), winner: state.winner };
}

const cap = probe('two accelerators in one Full Turn', ['10♥','J♣','J♦','7♣','8♣','2♣','2♦','2♠','3♣','3♦','4♣'], (frame, n) => n === 0 ? frame.policyActions.find(a => a.mode === 'heart-tempo') : n === 1 ? frame.policyActions.find(a => a.mode === 'jack-tempo') : frame.policyActions.find(a => ['score','play-for-points'].includes(a.family)));
const scoring = ['7♣','10♣','BJ'].map(identity => probe('ordinary score ' + identity, [identity,'2♣','3♣','4♣','5♣','2♦','3♦','4♦','5♦','6♦','9♦'], frame => frame.policyActions.find(a => ['score','play-for-points'].includes(a.family) && JSON.stringify(frame.resolve(a.actionId)).includes('CORE-001'))));
const classes = ['ordinary-effect','rank10','super','ultra','sudden-death','anchor','queens-court','royal-marriage','points','scuttle'];
const counters = ['base-ace-counter','spade-ace-counter','super-ace-counter','ultra-three-red','king-spade-counter'];
const counterMatrix = Object.fromEntries(classes.map(stackClass => [stackClass, Object.fromEntries(counters.map(counter => [counter, targetAcceptsCounter({ coreAuthority: { kind: 'primary', stackClass } }, counter)]))]));
const result = { generatedAt: new Date().toISOString(), system: 'Intrilex', productVersion: '1.0.0', rulesVersion: '4.3.1', engineVersion: '4.2.6', profileId: 'core-unrestricted-authority', nodeVersion: process.version, sourceHashes: hashes, interpretation: 'Constructed-state diagnostics, not random match samples or balance win-rate evidence. Counter matrix probes exported class predicate, not full declaration legality.', cap, scoring, counterMatrix };
await writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output: output.href, capActions: cap.declarations.length, capUsed: cap.firstPlayerLimits.miniTurnsUsed, capFizzles: cap.events.filter(e => e.type === 'CORE_ROOT_FIZZLED'), scoring: scoring.map(s => ({ name: s.name, handCount: s.firstPlayerHand.length, pr: s.firstPlayerPR, events: s.events.map(e => e.type) })), counterMatrix }, null, 2));
