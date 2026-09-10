import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { actionLabel, timingLabel } from '../apps/lab-web/src/play/action-presenter.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({
  stdin: {
    contents: "export * from './apps/lab-web/src/client/game-model.ts'; export * from './apps/lab-web/src/client/game-store.ts';",
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  metafile: true,
});
const { buildSemanticGame, createGameStore } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

function fixture(humanId = 'P1') {
  const opponentId = humanId === 'P1' ? 'P2' : 'P1';
  return {
    schemaVersion: '1.0.0',
    sessionId: 'session-1',
    status: 'HUMAN_DECISION',
    human: { playerId: humanId, seat: humanId === 'P1' ? 1 : 2, displayName: 'Local player' },
    opponent: { displayName: 'Remote player' },
    match: { phase: 'ACTION', fullTurnSequence: 3, activePlayerId: humanId, winner: null, terminationReason: null },
    decision: {
      actorId: humanId,
      isHuman: true,
      stateRevision: 7,
      frameHash: 'frame-7',
      legalActions: [
        { actionId: 'draw-1', family: 'draw', mode: 'top-dp', timingClass: 'ACTION', sourceHandles: [], targetHandles: [] },
        { actionId: 'score-1', family: 'score', mode: 'score-pr', timingClass: 'ACTION', sourceHandles: ['own-card'], targetHandles: [] },
        { actionId: 'counter-1', family: 'counter', mode: 'ace-base', timingClass: 'INSTANT', sourceHandles: ['own-card'], targetHandles: ['stack-1'] },
      ],
    },
    playerView: {
      schemaVersion: '4.0.0',
      actorId: humanId,
      revision: 7,
      phase: 'ACTION',
      fullTurnSequence: 3,
      activePlayerId: humanId,
      priority: { ownerId: humanId },
      own: {
        securedPoints: 6, goal: 21,
        hand: [{ id: 'own-card', identity: '6H' }],
        pr: [{ id: 'own-point', identity: '5S', tapped: true, aegis: true }],
        er: [{ id: 'own-enduring', identity: 'JC', jackHostId: 'own-point', providesGuard: true, exileBound: true }],
      },
      opponents: [{
        playerId: opponentId, securedPoints: 3, goal: 18, handCount: 5,
        pr: [{ id: 'opponent-point', identity: '3D', jackAttachmentId: 'attachment-card' }],
        er: [{ id: 'opponent-enduring', identity: 'QS', revealedUntilStart: true }],
      }],
      dpCount: 32,
      gyCount: 2,
      gyTopCard: { id: 'discard-top', identity: '8C' },
      exileCount: 1,
      swapBar: [{ id: 'swap-public', identity: '4C', swapBarFaceUp: true }, { id: 'swap-hidden-secret', identity: 'KH', faceDown: true }],
      stack: [{ id: 'stack-1', controllerId: opponentId, actionType: 'score', sourceCardIds: ['opponent-point'] }],
    },
    recentEvents: [{ type: 'CORE_CARD_SCORED', controllerId: opponentId, payload: { cardId: 'opponent-point' } }],
  };
}

function nextFrame(snapshot, revision = snapshot.playerView.revision + 1) {
  const next = structuredClone(snapshot);
  next.playerView.revision = revision;
  next.decision.stateRevision = revision;
  next.decision.frameHash = `frame-${revision}`;
  return next;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function assertUnavailable(input, options) {
  const game = buildSemanticGame(input, options);
  assert.equal(game.status, 'unavailable');
  assert.equal(game.error, 'Game snapshot unavailable.');
  assert.equal(game.sessionId, '');
  assert.equal(game.revision, null);
  assert.equal(game.frameHash, null);
  assert.deepEqual(game.actions, []);
  assert.deepEqual(game.events, []);
  assert.deepEqual(game.self.hand, []);
  assert.deepEqual(game.opponent.hand, []);
  return game;
}

test('browser bundle has no engine, canonical state, or session dependencies', () => {
  assert.deepEqual(Object.keys(bundle.metafile.inputs).sort(), [
    '<stdin>',
    'apps/lab-web/src/client/game-model.ts',
    'apps/lab-web/src/client/game-store.ts',
    'apps/lab-web/src/play/action-presenter.js',
  ]);
});

test('projects an authorized session and preserves own and public card details', () => {
  const input = fixture();
  const game = buildSemanticGame(input);
  assert.equal(game.schemaVersion, 1);
  assert.equal(game.status, 'ready');
  assert.equal(game.sessionId, 'session-1');
  assert.equal(game.revision, 7);
  assert.equal(game.frameHash, 'frame-7');
  assert.equal(game.phase, 'ACTION');
  assert.equal(game.turn, 3);
  assert.equal(game.activePlayerId, 'P1');
  assert.equal(game.priorityOwnerId, 'P1');
  assert.deepEqual(game.self.hand, [{ id: 'own-card', identity: '6H', label: '6H', markers: [] }]);
  assert.deepEqual(game.self.points[0].markers, ['Tapped', 'Aegis']);
  assert.deepEqual(game.self.enduring[0].markers, ['Guard', 'Exile-bound', 'Attached']);
  assert.deepEqual(game.opponent.points[0].markers, ['Has attachment']);
  assert.deepEqual(game.opponent.enduring[0].markers, ['Revealed']);
  assert.equal(game.opponent.handCount, 5);
  assert.deepEqual(game.opponent.hand, []);
  assert.equal(game.self.score, 6);
  assert.equal(game.opponent.goal, 18);
  assert.equal(game.drawCount, 32);
  assert.equal(game.discardCount, 2);
  assert.equal(game.exileCount, 1);
  assert.equal(game.discardTop.identity, '8C');
  assert.equal(game.swap[0].identity, '4C');
  assert.equal(game.swap[1].identity, null);
  assert.equal(game.swap[1].label, 'Hidden card');
  assert.equal(JSON.stringify(game).includes('swap-hidden-secret'), false);
  assert.deepEqual(game.stack, [{ id: 'stack-1', label: 'Play for Points', controllerId: 'P2' }]);
  assert.deepEqual(game.events, [{ id: 'event:0', type: 'CORE_CARD_SCORED', label: 'Card scored', actorId: 'P2', cardRefs: ['opponent-point'] }]);
  assert.deepEqual(input, fixture());
});

test('P2 uses the authorized viewer seat instead of assuming P1', () => {
  const game = buildSemanticGame(fixture('P2'));
  assert.equal(game.status, 'ready');
  assert.equal(game.self.id, 'P2');
  assert.equal(game.opponent.id, 'P1');
  assert.equal(game.activePlayerId, 'P2');
  assert.equal(game.priorityOwnerId, 'P2');
  assert.equal(game.stack[0].controllerId, 'P1');
  assert.equal(game.events[0].actorId, 'P1');
  assert.equal(game.self.name, 'Local player');
  assert.equal(game.opponent.name, 'Remote player');
});

test('allowlists output without reading private fields, payloads, or canonical state', () => {
  const input = fixture();
  const hostile = { privateSecret: 'DO_NOT_EXPOSE', seed: 'SEED_SECRET', rng: 'RNG_SECRET', command: { hidden: 'COMMAND_SECRET' } };
  Object.assign(input, hostile);
  Object.assign(input.playerView, hostile, { knownCards: { secret: { identity: 'OPPONENT_SECRET' } }, drawPile: ['DRAW_SECRET'], pendingChoice: hostile });
  Object.assign(input.playerView.opponents[0], { hand: [{ id: 'OPPONENT_ID_SECRET', identity: 'OPPONENT_SECRET' }] });
  Object.assign(input.playerView.own.hand[0], hostile, { label: 'INJECTED_CARD_LABEL', markers: ['INJECTED_MARKER'] });
  Object.assign(input.decision.legalActions[0], hostile, { label: 'INJECTED_ACTION_LABEL', displayLabel: 'INJECTED_DISPLAY_LABEL', facts: ['INVENTED_TACTIC'] });
  Object.assign(input.playerView.stack[0], hostile, { label: 'INJECTED_STACK_LABEL' });
  Object.assign(input.recentEvents[0], { label: 'INJECTED_EVENT_LABEL', id: 'PRIVATE_EVENT_ID', payload: hostile });
  for (const [object, key] of [[input, 'state'], [input, 'rawState'], [input, 'toJSON'], [input.playerView, 'knownCards'], [input.playerView.opponents[0], 'hand'], [input.recentEvents[0], 'payload'], [input.decision.legalActions[0], 'command']]) {
    Object.defineProperty(object, key, { get() { throw new Error('PRIVATE_GETTER_SECRET'); } });
  }
  const game = buildSemanticGame(input);
  assert.equal(game.status, 'ready');
  assert.doesNotMatch(JSON.stringify(game), /SECRET|INJECTED|INVENTED|DO_NOT_EXPOSE|PRIVATE_EVENT_ID|"payload"|"command"|"seed"|"rng"/u);
  assert.deepEqual(Object.keys(game.self.hand[0]).sort(), ['id', 'identity', 'label', 'markers']);
  assert.deepEqual(Object.keys(game.actions[0]).sort(), ['facts', 'family', 'id', 'label', 'mode', 'sources', 'targets', 'timing']);
  assert.deepEqual(Object.keys(game.events[0]).sort(), ['actorId', 'cardRefs', 'id', 'label', 'type']);
});

test('nullable and hidden card identities never decode their IDs', () => {
  const input = fixture();
  input.playerView.own.hand = [
    { id: null, identity: null },
    { id: 'C_KS_ID_SECRET', identity: null },
    { id: 'C_AD_ID_SECRET', identity: 'HIDDEN' },
    { id: 'C_QH_ID_SECRET', identity: 'QH', swapBarFaceDown: true },
  ];
  const game = buildSemanticGame(input);
  assert.equal(game.status, 'ready');
  assert.equal(game.self.handCount, 4);
  assert.equal(new Set(game.self.hand.map(card => card.id)).size, 4);
  assert.ok(game.self.hand.every(card => card.identity === null && card.label === 'Hidden card'));
  assert.doesNotMatch(JSON.stringify(game), /ID_SECRET|QH/u);
});

test('public and readonly policies independently mask both hands and suppress private frame/actions', () => {
  for (const options of [{ visibility: 'public' }, { readOnly: true }, { readOnly: true, visibility: 'public' }]) {
    const input = fixture('P2');
    input.playerView.own.hand[0] = { id: 'PRIVATE_HAND_ID', identity: 'PRIVATE_HAND_IDENTITY' };
    input.playerView.opponents[0].hand = [{ id: 'OTHER_PRIVATE_HAND_ID', identity: 'OTHER_PRIVATE_HAND_IDENTITY' }];
    Object.defineProperty(input.decision, 'legalActions', { get() { throw new Error('ACTION_SECRET'); } });
    const game = buildSemanticGame(input, options);
    assert.equal(game.status, 'waiting');
    assert.equal(game.self.id, 'P2');
    assert.equal(game.self.handCount, 1);
    assert.equal(game.opponent.handCount, 5);
    assert.deepEqual(game.self.hand, []);
    assert.deepEqual(game.opponent.hand, []);
    assert.deepEqual(game.actions, []);
    assert.equal(game.frameHash, null);
    assert.equal(game.self.points[0].identity, '5S');
    assert.doesNotMatch(JSON.stringify(game), /PRIVATE_HAND|frame-7|ACTION_SECRET/u);
  }
});

test('neutral spectator session accepts count-only own hand, no seat, and absent private frame', () => {
  const input = fixture();
  input.human.playerId = null;
  input.opponent = null;
  input.status = 'SPECTATING';
  input.playerView.own.handCount = input.playerView.own.hand.length;
  delete input.playerView.own.hand;
  input.decision.isHuman = false;
  delete input.decision.frameHash;
  delete input.decision.legalActions;
  const game = buildSemanticGame(input, { visibility: 'public' });
  assert.equal(game.status, 'waiting');
  assert.equal(game.self.handCount, 1);
  assert.equal(game.frameHash, null);
  assert.deepEqual(game.actions, []);
  assertUnavailable(input);
});

test('only human-owned decisions enumerate actions, regardless of attached actions', () => {
  for (const mismatch of ['not-human', 'other-actor', 'both']) {
    const input = fixture();
    if (mismatch !== 'other-actor') input.decision.isHuman = false;
    if (mismatch !== 'not-human') input.decision.actorId = 'P2';
    Object.defineProperty(input.decision, 'legalActions', { get() { throw new Error('OPPONENT_ACTION_SECRET'); } });
    const game = buildSemanticGame(input);
    assert.equal(game.status, 'waiting');
    assert.deepEqual(game.actions, []);
  }
});

test('labels retain presenter semantics and explanations contain only enumeration evidence', () => {
  const input = fixture();
  const game = buildSemanticGame(input);
  for (const [index, action] of game.actions.entries()) {
    const raw = input.decision.legalActions[index];
    assert.equal(action.label, actionLabel(raw));
    assert.equal(action.timing, timingLabel(raw.timingClass));
    assert.deepEqual(action.sources, raw.sourceHandles);
    assert.deepEqual(action.targets, raw.targetHandles);
    assert.deepEqual(action.facts, [
      `Enumerated action: ${raw.actionId}`, 'Revision: 7', 'Decision frame: frame-7',
      `Timing: ${timingLabel(raw.timingClass)}`, `Sources: ${raw.sourceHandles.length}`, `Targets: ${raw.targetHandles.length}`,
      `Alternative action IDs: ${input.decision.legalActions.filter(other => other !== raw).map(other => other.actionId).join(', ')}`,
    ]);
    assert.doesNotMatch(action.facts.join(' '), /win|optimal|damage|counterable|consumes|full.turn|response.window/iu);
  }
});

test('network card-handle aliases and private-choice presenter semantics remain supported', () => {
  const input = fixture();
  input.decision.legalActions = [{
    actionId: 'choice-1', family: 'private-choice', mode: 'select-OPAQUE_CARD_1', timingClass: 'SETUP',
    sourceCardIds: ['choice-source'], targetCardIds: ['OPAQUE_CARD_1'],
  }];
  const game = buildSemanticGame(input);
  assert.equal(game.status, 'ready');
  assert.equal(game.actions[0].label, actionLabel(input.decision.legalActions[0]));
  assert.deepEqual(game.actions[0].targets, ['OPAQUE_CARD_1']);
  assert.equal(game.actions[0].facts.at(-1), 'Alternative action IDs: none');
});

test('voltage guess labels preserve known rank and suit semantics without accepting arbitrary suffixes', () => {
  const input = fixture();
  input.decision.legalActions[0].family = 'voltage';
  input.decision.legalActions[0].mode = 'four-guess-6-\u2665';
  assert.equal(buildSemanticGame(input).actions[0].label, actionLabel(input.decision.legalActions[0]));
});

test('large enumerations keep alternative evidence bounded and explicitly scoped to actual member IDs', () => {
  const input = fixture();
  const template = input.decision.legalActions[0];
  input.decision.legalActions = Array.from({ length: 100 }, (_, index) => ({ ...template, actionId: `action-${index}` }));
  const game = buildSemanticGame(input);
  assert.equal(game.status, 'ready');
  assert.equal(game.actions.length, 100);
  for (const action of game.actions) {
    const evidence = action.facts.at(-1);
    assert.ok(evidence.startsWith('Alternative action IDs (first 8 of 99): '));
    const ids = evidence.split(': ')[1].split(', ');
    assert.equal(ids.length, 8);
    assert.ok(ids.every(id => id !== action.id && game.actions.some(other => other.id === id)));
  }
});

test('unknown family and mode labels never echo arbitrary presenter fallback text', () => {
  const input = fixture();
  input.decision.legalActions[0].mode = 'MODE_SECRET';
  input.decision.legalActions[1].family = 'FAMILY_SECRET';
  input.decision.legalActions[2].mode = 'four-guess-PRIVATE_SECRET';
  const game = buildSemanticGame(input);
  assert.equal(game.status, 'ready');
  assert.equal(game.actions[0].label, 'Draw');
  assert.equal(game.actions[1].label, 'Action');
  assert.equal(game.actions[1].family, 'unknown');
  assert.equal(game.actions[2].label, 'Counter');
  assert.doesNotMatch(JSON.stringify(game), /SECRET/u);
});

test('private, authorized-only, and unknown events are discarded without payload inspection', () => {
  const input = fixture();
  input.recentEvents.push(
    { type: 'CORE_CARD_SCORED', visibility: 'private', controllerId: 'P1', payload: { secret: 'PRIVATE_SECRET' } },
    { type: 'CORE_CARD_SCORED', visibility: 'authorized', controllerId: 'P1' },
    { type: 'CORE_CARD_SCORED', private: true, controllerId: 'P1' },
    { type: 'CORE_PRIVATE_CHOICE_SUBMITTED', controllerId: 'P1' },
    { type: 'CORE_DRAW_RESOLVED', controllerId: 'P1' },
    { type: 'EVENT_SECRET', controllerId: 'P1' },
    { type: 'CORE_COUNTER_DECLARED', actorId: 'P1', visibility: 'public' },
  );
  const game = buildSemanticGame(input);
  assert.equal(game.status, 'ready');
  assert.deepEqual(game.events.map(event => [event.type, event.actorId]), [['CORE_CARD_SCORED', 'P2'], ['CORE_COUNTER_DECLARED', 'P1']]);
  assert.doesNotMatch(JSON.stringify(game), /SECRET|PRIVATE_CHOICE|CORE_DRAW_RESOLVED/u);
});

test('terminal and waiting snapshots need no actionable decision and never invent actions', () => {
  const input = fixture();
  input.status = 'TERMINAL';
  input.decision = null;
  input.match.winner = 'P2';
  input.match.terminationReason = 'NORMAL_VICTORY';
  const game = buildSemanticGame(input);
  assert.equal(game.status, 'completed');
  assert.equal(game.winner, 'P2');
  assert.equal(game.terminationReason, 'NORMAL_VICTORY');
  assert.equal(game.frameHash, null);
  assert.equal(game.revision, 7);
  assert.deepEqual(game.actions, []);
  const waiting = fixture();
  waiting.status = 'ADVANCING';
  waiting.decision = null;
  assert.equal(buildSemanticGame(waiting).status, 'waiting');
});

test('malformed required shape, finite revisions, frames, and action enumeration fail closed', () => {
  for (const value of [null, undefined, false, 2, 'SECRET', [], {}, { state: fixture() }]) assertUnavailable(value);
  const mutations = [
    input => { delete input.playerView; },
    input => { input.sessionId = ''; },
    input => { input.sessionId = { toString() { throw new Error('SECRET'); } }; },
    input => { input.status = 'UNKNOWN'; },
    input => { input.status = 'ERROR'; input.error = 'SERVER_SECRET'; },
    input => { input.playerView.actorId = 'P2'; },
    input => { input.human.playerId = 'P2'; },
    input => { input.playerView.opponents = []; },
    input => { input.playerView.opponents[0].playerId = 'P1'; },
    input => { input.playerView.own.hand = {}; },
    input => { input.playerView.own.pr = [null]; },
    input => { input.playerView.own.pr = [{}]; },
    input => { delete input.playerView.own.hand[0].identity; },
    input => { delete input.playerView.own.hand[0].id; },
    input => { input.playerView.own.er[0].tapped = 'yes'; },
    input => { input.playerView.own.hand[0].id = 2; },
    input => { input.playerView.own.hand[0].identity = {}; },
    input => { input.playerView.dpCount = -1; },
    input => { input.playerView.gyCount = Infinity; },
    input => { input.playerView.exileCount = NaN; },
    input => { input.playerView.own.securedPoints = NaN; },
    input => { input.playerView.own.goal = Infinity; },
    input => { input.playerView.opponents[0].handCount = 0.5; },
    input => { input.playerView.fullTurnSequence = '3'; },
    input => { input.playerView.revision = NaN; },
    input => { input.playerView.revision = Infinity; },
    input => { input.playerView.revision = -1; },
    input => { input.decision.stateRevision = 8; },
    input => { input.decision.stateRevision = Number.MAX_SAFE_INTEGER + 1; },
    input => { input.decision.frameHash = ''; },
    input => { input.decision.frameHash = null; },
    input => { input.decision.frameHash = 7; },
    input => { input.decision.isHuman = 'true'; },
    input => { input.decision.actorId = 'P3'; },
    input => { input.decision.legalActions = {}; },
    input => { input.decision.legalActions = [null]; },
    input => { input.decision.legalActions.push(input.decision.legalActions[0]); },
    input => { input.decision.legalActions[0].actionId = ''; },
    input => { input.decision.legalActions[0].timingClass = 'TIMING_SECRET'; },
    input => { input.decision.legalActions[0].sourceHandles = [undefined]; },
    input => { input.decision.legalActions[0].targetHandles = {}; },
    input => { input.playerView.gyTopCard = null; },
    input => { input.playerView.stack[0].id = null; },
    input => { input.recentEvents = {}; },
    input => { Object.defineProperty(input, 'playerView', { get() { throw new Error('GETTER_SECRET'); } }); },
  ];
  for (const mutate of mutations) {
    const input = fixture();
    mutate(input);
    assertUnavailable(input);
  }
  assertUnavailable(fixture(), { visibility: 'omniscient' });
  assertUnavailable(fixture(), { readOnly: 'false' });
  assertUnavailable(new Proxy({}, { getOwnPropertyDescriptor() { throw new Error('PROXY_SECRET'); } }));
});

test('model and store snapshots are deeply readonly and detached from input objects', () => {
  const input = fixture();
  const game = buildSemanticGame(input);
  assert.ok(Object.isFrozen(game));
  assert.ok(Object.isFrozen(game.self));
  assert.ok(Object.isFrozen(game.self.hand));
  assert.ok(Object.isFrozen(game.self.hand[0]));
  assert.ok(Object.isFrozen(game.actions[0].facts));
  assert.throws(() => { game.self.hand[0].label = 'MUTATED'; }, TypeError);
  input.playerView.own.hand[0].identity = 'INPUT_MUTATED';
  input.decision.legalActions[0].sourceHandles.push('INPUT_MUTATED');
  assert.equal(game.self.hand[0].identity, '6H');
  assert.deepEqual(game.actions[0].sources, []);
  const store = createGameStore(async () => ({ accepted: true }));
  store.update(fixture());
  assert.ok(Object.isFrozen(store));
  assert.ok(Object.isFrozen(store.getSnapshot()));
  assert.throws(() => { store.getSnapshot().selectedActionId = 'draw-1'; }, TypeError);
});

test('store getSnapshot is stable and subscriptions clean up on unsubscribe and dispose', () => {
  const store = createGameStore(async () => ({ accepted: true }));
  assert.equal(store.getSnapshot(), store.getSnapshot());
  let calls = 0;
  const stop = store.subscribe(() => { calls += 1; });
  store.update(fixture());
  const ready = store.getSnapshot();
  assert.equal(store.getSnapshot(), ready);
  assert.equal(calls, 1);
  store.select('draw-1');
  const selected = store.getSnapshot();
  assert.notEqual(ready, selected);
  assert.equal(selected.selectedActionId, 'draw-1');
  assert.equal(selected.interaction, 'selected');
  store.select('draw-1');
  assert.equal(store.getSnapshot(), selected);
  assert.equal(calls, 2);
  stop();
  store.select(null);
  assert.equal(calls, 2);
  store.dispose();
  const disposed = store.getSnapshot();
  store.subscribe(() => { calls += 1; });
  store.update(nextFrame(fixture()));
  store.select('draw-1');
  assert.equal(store.getSnapshot(), disposed);
  assert.equal(calls, 2);
});

test('stale revision, frame, session, and revoked enumeration clear selection', async () => {
  for (const change of [
    input => nextFrame(input),
    input => ({ ...input, decision: { ...input.decision, frameHash: 'new-frame' } }),
    input => ({ ...input, sessionId: 'session-2' }),
    input => ({ ...input, decision: { ...input.decision, legalActions: [] } }),
    () => null,
  ]) {
    let calls = 0;
    const store = createGameStore(async () => { calls += 1; return { accepted: true }; });
    store.update(fixture());
    store.select('draw-1');
    store.update(change(fixture()));
    assert.equal(store.getSnapshot().selectedActionId, null);
    assert.equal(await store.submit(), false);
    assert.equal(calls, 0);
  }
});

test('readonly updates and non-enumerated selections cannot submit', async () => {
  let calls = 0;
  const store = createGameStore(async () => { calls += 1; return { accepted: true }; });
  assert.equal(await store.submit(), false);
  store.update(fixture());
  store.select('not-enumerated');
  assert.equal(store.getSnapshot().interaction, 'rejected');
  assert.equal(await store.submit(), false);
  store.select('draw-1');
  store.update(fixture(), { readOnly: true });
  assert.equal(store.getSnapshot().selectedActionId, null);
  store.select('draw-1');
  assert.equal(await store.submit(), false);
  assert.equal(calls, 0);
});

test('submit preserves selected session/revision/frame, blocks duplicates, and never mutates game authority', async () => {
  const pending = deferred();
  const intents = [];
  const store = createGameStore(intent => { intents.push(intent); return pending.promise; });
  const input = fixture();
  store.update(input);
  const game = store.getSnapshot().game;
  store.select('score-1');
  input.decision.frameHash = 'MUTATED_AFTER_SELECTION';
  input.decision.stateRevision = 200;
  const submitting = store.submit();
  assert.equal(store.getSnapshot().interaction, 'submitting');
  assert.equal(await store.submit(), false);
  store.select('draw-1');
  assert.equal(store.getSnapshot().selectedActionId, 'score-1');
  assert.deepEqual(intents, [{ sessionId: 'session-1', stateRevision: 7, decisionFrameHash: 'frame-7', actionId: 'score-1' }]);
  assert.ok(Object.isFrozen(intents[0]));
  pending.resolve({ accepted: true });
  assert.equal(await submitting, true);
  assert.equal(store.getSnapshot().interaction, 'idle');
  assert.equal(store.getSnapshot().selectedActionId, null);
  assert.equal(store.getSnapshot().game, game);
  store.select('draw-1');
  assert.equal(await store.submit(), false);
  store.update(fixture());
  store.select('draw-1');
  assert.equal(await store.submit(), false);
  assert.equal(intents.length, 1);
  store.update(nextFrame(fixture()));
  store.select('draw-1');
  assert.equal(await store.submit(), true);
  assert.equal(intents.length, 2);
});

test('rejected, throwing, and malformed promises are contained with safe errors and retry', async () => {
  for (const failure of [
    async () => ({ accepted: false, error: 'RAW_SERVER_SECRET' }),
    async () => { throw new Error('PRIVATE_THROW_SECRET'); },
    () => { throw new Error('SYNC_SECRET'); },
    async () => null,
    async () => ({ accepted: 'true' }),
    async () => ({ get accepted() { throw new Error('GETTER_SECRET'); } }),
  ]) {
    let calls = 0;
    const store = createGameStore(intent => { calls += 1; return calls === 1 ? failure(intent) : Promise.resolve({ accepted: true }); });
    store.update(fixture());
    store.select('draw-1');
    assert.equal(await store.submit(), false);
    assert.equal(store.getSnapshot().interaction, 'rejected');
    assert.equal(store.getSnapshot().selectedActionId, 'draw-1');
    assert.doesNotMatch(store.getSnapshot().error, /SECRET/u);
    assert.equal(await store.submit(), true);
  }
});

test('late completion cannot overwrite a new session or a newer in-flight submission', async () => {
  for (const rejectOld of [false, true]) {
    const first = deferred();
    const second = deferred();
    let calls = 0;
    const store = createGameStore(() => (++calls === 1 ? first.promise : second.promise));
    store.update(fixture());
    store.select('draw-1');
    const oldSubmit = store.submit();
    const next = fixture('P2');
    next.sessionId = 'session-2';
    store.update(next);
    assert.equal(store.getSnapshot().interaction, 'idle');
    assert.equal(store.getSnapshot().error, null);
    store.select('score-1');
    const newSubmit = store.submit();
    const newSnapshot = store.getSnapshot();
    if (rejectOld) first.reject(new Error('LATE_SECRET'));
    else first.resolve({ accepted: true });
    assert.equal(await oldSubmit, false);
    assert.equal(store.getSnapshot(), newSnapshot);
    assert.equal(store.getSnapshot().interaction, 'submitting');
    second.resolve({ accepted: true });
    assert.equal(await newSubmit, true);
    assert.equal(store.getSnapshot().game.sessionId, 'session-2');
  }
});

test('pending requests survive same-frame refresh but not newer revision or dispose', async () => {
  const pending = deferred();
  const store = createGameStore(() => pending.promise);
  store.update(fixture());
  store.select('draw-1');
  const submit = store.submit();
  store.update(fixture());
  assert.equal(store.getSnapshot().interaction, 'submitting');
  store.update(nextFrame(fixture()));
  store.select('score-1');
  const current = store.getSnapshot();
  pending.resolve({ accepted: false, error: 'STALE_SECRET' });
  assert.equal(await submit, false);
  assert.equal(store.getSnapshot(), current);
  const afterDispose = deferred();
  const disposed = createGameStore(() => afterDispose.promise);
  disposed.update(fixture());
  disposed.select('draw-1');
  const disposedSubmit = disposed.submit();
  disposed.dispose();
  const last = disposed.getSnapshot();
  afterDispose.resolve({ accepted: true });
  assert.equal(await disposedSubmit, false);
  assert.equal(disposed.getSnapshot(), last);
  assert.equal(await disposed.submit(), false);
});

test('subscription errors and reentrant disposal cannot trigger an obsolete submit', async () => {
  let calls = 0;
  const store = createGameStore(async () => { calls += 1; return { accepted: true }; });
  store.subscribe(() => { throw new Error('LISTENER_SECRET'); });
  store.update(fixture());
  store.select('draw-1');
  store.subscribe(() => { if (store.getSnapshot().interaction === 'submitting') store.dispose(); });
  assert.equal(await store.submit(), false);
  assert.equal(calls, 0);
});
