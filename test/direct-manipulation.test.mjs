import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createSimulationState, createSimulationDecisionFrame, executeSimulationAction, strictPolicyView } from '@intrilex/engine-adapter';
import { createAuthoritativeMatch } from '../packages/match-authority/src/authoritative-match-session.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({ stdin: { contents: "export * from './apps/lab-web/src/client/gameplay/drag-intent.ts'; export * from './apps/lab-web/src/client/game-model.ts'; export * from './apps/lab-web/src/client/game-store.ts'; export { decisionBoundary } from './apps/lab-web/src/client/gameplay/action-family.ts';", resolveDir: root, loader: 'ts' }, bundle: true, write: false, platform: 'browser', format: 'esm' });
const { resolveDragIntent, dragDestinations, dragNeedsConfirmation, hitDragTarget, buildSemanticGame, createGameStore, decisionBoundary, rowRef } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

function realFrame(seed = 1) {
  let frame = createSimulationDecisionFrame(createSimulationState({ profileId: 'core-unrestricted-authority', playerIds: ['P1', 'P2'], seatOrder: ['P1', 'P2'], seed, enabledModules: [] }));
  const enter = frame.policyActions.find(action => action.family === 'phase' && action.mode === 'enter-action');
  assert.ok(enter);
  frame = createSimulationDecisionFrame(executeSimulationAction(frame.state, frame.resolve(enter.actionId)).state);
  return frame;
}
function snapshot(frame) {
  return { sessionId: 'gesture-authority', status: 'HUMAN_DECISION', human: { playerId: frame.decisionActorId }, opponent: { displayName: 'Opponent' }, match: { winner: null, terminationReason: null }, playerView: strictPolicyView(frame.state, frame.decisionActorId), recentEvents: [],
    decision: { actorId: frame.decisionActorId, isHuman: true, stateRevision: frame.state.revision, frameHash: frame.legalActionFrame.frameHash, legalActions: frame.policyActions } };
}
function kingContext() {
  const frame = realFrame(), input = snapshot(frame), game = buildSemanticGame(input, { coalesceIdenticalActions: true });
  assert.equal(game.status, 'ready');
  const king = game.self.hand.find(card => card.identity.startsWith('K'));
  assert.ok(king);
  return { frame, input, game, king, intent: { boundary: decisionBoundary(game), source: { kind: 'card', id: king.id }, destination: rowRef(game.self.id, 'enduring') } };
}

test('drag matches one real King anchor by semantic identity and preserves the original action object', () => {
  const { game, king, intent } = kingContext();
  const result = resolveDragIntent(game, intent);
  assert.equal(result.status, 'single-action');
  assert.equal(result.actions[0], game.actions.find(action => action.family === 'anchor' && action.sources.includes(king.id)));
  assert.equal(dragNeedsConfirmation(game, result.actions[0]), false);
});
test('zero matches, wrong source, wrong row and stale revisions fail closed', () => {
  const { game, intent } = kingContext();
  for (const gesture of [{ ...intent, destination: rowRef(game.opponent.id, 'enduring') }, { ...intent, source: { kind: 'card', id: 'absent' } }, { ...intent, boundary: 'old-frame' }]) {
    assert.deepEqual(resolveDragIntent(game, gesture), { status: 'invalid', actions: [] });
  }
  assert.equal(resolveDragIntent({ ...game, revision: game.revision + 1 }, intent).status, 'invalid');
  assert.equal(resolveDragIntent({ ...game, actions: [] }, intent).status, 'invalid');
  for (const status of ['waiting', 'completed', 'unavailable']) assert.equal(resolveDragIntent({ ...game, status }, intent).status, 'invalid');
});
test('two material action choices are retained; labels and ranks do not decide resolution', () => {
  const { game, intent } = kingContext();
  const first = resolveDragIntent(game, intent).actions[0];
  const second = { ...first, id: 'other-legal-variant', mode: 'alternate', label: 'Unrelated copy' };
  const result = resolveDragIntent({ ...game, actions: [first, second], self: { ...game.self, hand: game.self.hand.map(card => ({ ...card, identity: 'Q♦' })) } }, intent);
  assert.equal(result.status, 'ambiguous'); assert.deepEqual(result.actions, [first, second]);
});
test('scoring, card targets, pending-play targets and public Swap Bar slots share the matcher', () => {
  const { game, king, intent } = kingContext();
  const base = resolveDragIntent(game, intent).actions[0];
  const cases = [
    [{ ...base, family: 'score' }, rowRef(game.self.id, 'points')],
    [{ ...base, family: 'scuttle', targets: [game.self.hand[0].id] }, { kind: 'card', id: game.self.hand[0].id }],
    [{ ...base, family: 'counter', targets: ['pending'] }, { kind: 'pending-play', id: 'pending' }],
    [{ ...base, family: 'swap-bar', swapSlot: 1, targets: ['hidden:swap:1'] }, { kind: 'zone', id: 'swap:1' }],
  ];
  for (const [action, destination] of cases) {
    const view = { ...game, actions: [action], stack: [{ id: 'pending', label: 'Pending play', controllerId: game.opponent.id }] };
    assert.equal(resolveDragIntent(view, { ...intent, destination }).actions[0], action);
    assert.ok(dragDestinations(view, { kind: 'card', id: king.id }).some(ref => ref.id === destination.id));
  }
});
test('a single source cannot implicitly submit a composite declaration; Composer confirmation remains required', () => {
  const { game, intent } = kingContext();
  const action = resolveDragIntent(game, intent).actions[0];
  assert.equal(resolveDragIntent({ ...game, actions: [{ ...action, sources: [...action.sources, 'component'] }] }, intent).status, 'invalid');
  const multiTarget = { ...action, targets: [game.self.hand[0].id, game.self.hand[1].id] };
  assert.equal(dragNeedsConfirmation({ ...game, actions: [multiTarget] }, multiTarget), true);
  const variants = [action, { ...action, id: 'variant', sources: [game.self.hand[0].id], targets: ['target'], mode: 'other' }];
  assert.equal(dragNeedsConfirmation({ ...game, actions: variants.map(a => ({ ...a, family: 'scuttle' })) }, { ...action, family: 'scuttle' }), true);
});
test('magnetic geometry uses viewport rectangles, nested targets, bounded radius and zero-size rejection', () => {
  const targets = [{ key: 'row', left: 100, top: 100, right: 500, bottom: 200 }, { key: 'card', left: 180, top: 120, right: 240, bottom: 190 }, { key: 'gone', left: 0, top: 0, right: 0, bottom: 0 }];
  assert.equal(hitDragTarget(targets, 200, 150), 'card');
  assert.equal(hitDragTarget(targets, 300, 90), 'row');
  assert.equal(hitDragTarget(targets, 300, 60), null);
  assert.equal(hitDragTarget(targets, 0, 0), null);
});
test('future ability and pending-play sources use metadata adapters without changing the gesture core', () => {
  const { game } = kingContext();
  const action = game.actions[0];
  for (const kind of ['ability', 'pending-play']) {
    const source = { kind, id: 'control' }, destination = { kind: 'player', id: game.opponent.id };
    const describe = (_game, candidate) => candidate.id === action.id ? { sources: [source], destinations: [destination] } : { sources: [], destinations: [] };
    const resolution = resolveDragIntent(game, { boundary: decisionBoundary(game), source, destination }, describe);
    assert.equal(resolution.status, 'single-action'); assert.equal(resolution.actions[0], action);
    assert.deepEqual(dragDestinations(game, source, describe), [destination]);
    assert.equal(resolveDragIntent({ ...game, actions: [] }, { boundary: decisionBoundary(game), source, destination }, describe).status, 'invalid');
  }
});
test('real drag and normal invocation yield identical canonical state and semantic events', () => {
  const { frame, game, intent } = kingContext();
  const resolved = resolveDragIntent(game, intent).actions[0];
  const normal = frame.policyActions.find(action => action.actionId === resolved.id);
  const before = structuredClone(frame.state);
  const manualResult = executeSimulationAction(frame.state, frame.resolve(normal.actionId));
  const dragResult = executeSimulationAction(frame.state, frame.resolve(resolved.id));
  assert.equal(dragResult.accepted, true); assert.deepEqual(dragResult, manualResult);
  assert.deepEqual(frame.state, before, 'gesture matching and execution do not mutate the input state');
  assert.ok(dragResult.events.some(event => /DECLAR|ANCHOR/.test(event.type)));
});
test('drag submits exactly the existing intent through GameStore; repeated attempts and rejection are bounded', async () => {
  const { input, intent } = kingContext();
  const submitted = [];
  const store = createGameStore(async action => { submitted.push(action); return { accepted: true }; });
  store.update(input, { coalesceIdenticalActions: true });
  const action = resolveDragIntent(store.getSnapshot().game, intent).actions[0];
  store.select(action.id);
  assert.deepEqual(await Promise.all([store.submit(), store.submit()]), [true, false]);
  assert.deepEqual(submitted, [{ sessionId: input.sessionId, stateRevision: input.decision.stateRevision, decisionFrameHash: input.decision.frameHash, actionId: action.id }]);
  assert.equal(await store.submit(), false);
  const rejected = createGameStore(async () => ({ accepted: false })); rejected.update(input, { coalesceIdenticalActions: true }); rejected.select(action.id);
  assert.equal(await rejected.submit(), false); assert.equal(rejected.getSnapshot().interaction, 'rejected');
});
test('server authority accepts the drag-selected ID, rejects the other seat and stale decision, and records normal events', async () => {
  const match = createAuthoritativeMatch({ matchId: 'drag-online', seed: 1, profileId: 'core-unrestricted-authority' });
  const one = match.addParticipant('one', 'a'.repeat(43)), two = match.addParticipant('two', 'b'.repeat(43));
  match.setReady(one.participantId); match.setReady(two.participantId); match.start();
  const participants = [one, two];
  const actor = () => participants.find(p => p.playerId === match.currentDecisionActor);
  const submission = actionId => ({ clientCommandId: `drag-${match._stateRevision}-${actionId}`, expectedRevision: match._stateRevision, decisionFrameHash: match.decisionFrameHash, actionId });
  const enter = match.legalActionFrame.find(action => action.family === 'phase' && action.mode === 'enter-action');
  assert.equal((await match.submitAction(actor().participantId, submission(enter.actionId))).accepted, true);
  const seat = actor(), view = match.getAuthorizedView(seat.participantId);
  const game = buildSemanticGame({ ...view, sessionId: match.matchId, human: { playerId: seat.playerId }, decision: { ...view.decision, isHuman: true } }, { coalesceIdenticalActions: true });
  assert.equal(game.status, 'ready');
  const king = game.self.hand.find(card => card.identity.startsWith('K'));
  const resolution = resolveDragIntent(game, { boundary: decisionBoundary(game), source: { kind: 'card', id: king.id }, destination: rowRef(game.self.id, 'enduring') });
  assert.equal(resolution.status, 'single-action');
  const intent = submission(resolution.actions[0].id);
  const opponent = participants.find(p => p !== seat);
  assert.equal((await match.submitAction(opponent.participantId, { ...intent, clientCommandId: 'wrong-seat' })).accepted, false);
  assert.equal((await match.submitAction(seat.participantId, intent)).accepted, true);
  assert.equal((await match.submitAction(seat.participantId, { ...intent, clientCommandId: 'stale' })).accepted, false);
  assert.ok(match.recentSafeEvents.some(event => /DECLAR|ANCHOR/.test(event.type)));
});
