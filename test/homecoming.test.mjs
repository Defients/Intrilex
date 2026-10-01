import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { buildNetworkPlayerView, buildSpectatorView } from '../packages/match-authority/src/player-projection.mjs';
import { createAuthoritativeMatch } from '../packages/match-authority/src/authoritative-match-session.mjs';
import { createMatchHandlers } from '../apps/match-server/src/handlers/match-handlers.mjs';
import { renderTerminal } from '../apps/lab-web/src/play/ranked-duel-terminal.mjs';
import { NetworkPlaySession } from '../apps/lab-web/src/play/network/network-session.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({
  stdin: { contents: "export * from './apps/lab-web/src/client/gameplay/action-family.ts'; export * from './apps/lab-web/src/client/gameplay/suggestions.ts'; export * from './apps/lab-web/src/client/game-model.ts'; export * from './apps/lab-web/src/client/game-store.ts';", resolveDir: root, loader: 'ts' },
  bundle: true, write: false, platform: 'browser', format: 'esm', metafile: true,
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const { buildActionEntries, compatibleVariants, parameterOptions, parameterVisible, upstreamSelection, optionLabel, resolvedAction, reconcileSelection, selectOption, boardOptions, buildSemanticGame, createGameStore, decisionBoundary, suggestedMoves } = api;
const action = (id, sources = [], targets = [], mode = 'ordinary', family = 'scuttle', extra = {}) => ({ id, sources, targets, mode, family, label: 'Copy may change', timing: 'Action', facts: [], ...extra });
const familyOf = actions => {
  const entry = buildActionEntries(actions)[0]; assert.equal(entry.kind, 'family'); return entry.family;
};
const card = (id, identity = '5♥') => ({ id, identity, label: identity, markers: [] });

test('Homecoming server permits terminal-seat rematch admission but preserves active binding and invalid-invite defenses', async () => {
  const previous = createAuthoritativeMatch({ matchId: 'M-previous', seed: 12345 });
  const one = previous.addParticipant('one', 'a'.repeat(43));
  const two = previous.addParticipant('two', 'b'.repeat(43));
  previous.setReady(one.participantId); previous.setReady(two.participantId); previous.start();
  const next = createAuthoritativeMatch({ matchId: 'M-next', seed: 54321 });
  next.addParticipant('next-creator', 'c'.repeat(43));
  const connection = { matchId: previous.matchId, participantId: two.participantId, account: null };
  const sent = [];
  const handlers = createMatchHandlers({
    connections: new Map([['connection', connection]]),
    getMatchStore: () => ({ get: id => id === previous.matchId ? previous : next, findByInviteCode: code => code === 'ABC123' ? next : null, save: () => {} }),
    buildPublicProfile: () => ({}), findConnectionByParticipant: () => null,
    send: (_ws, message) => sent.push(message), logEvent: () => {},
  });
  await handlers.handleJoinMatch('connection', {}, { inviteCode: 'ABC123' }, 'active');
  assert.equal(sent.pop().payload.code, 'MATCH_ALREADY_JOINED');
  previous.forfeit(one.participantId);
  await handlers.handleJoinMatch('connection', {}, { inviteCode: 'BAD123' }, 'bad');
  assert.equal(sent.pop().payload.code, 'MATCH_NOT_FOUND');
  assert.equal(connection.matchId, previous.matchId);
  await handlers.handleJoinMatch('connection', {}, { inviteCode: 'ABC123' }, 'valid');
  assert.equal(connection.matchId, next.matchId);
  assert.equal(next.participants.size, 2);
  assert.equal(sent[0].type, 'MATCH_JOINED');
  assert.ok(next.validateToken(connection.participantId, sent[0].payload.participantToken));
});

test('Homecoming rematch admission starts a new lobby while same-match status regression stays blocked', async () => {
  const session = new NetworkPlaySession('ws://127.0.0.1:1');
  session.status = 'TERMINAL'; session.matchId = 'M-old'; session.participantToken = 'a'.repeat(43);
  session._transition('IN_LOBBY'); assert.equal(session.status, 'TERMINAL');
  session._request = async () => ({ type: 'MATCH_CREATED', payload: { matchId: 'M-new', inviteCode: 'ABC123', participantToken: 'b'.repeat(43) } });
  assert.equal((await session.requestRematch()).ok, true);
  assert.equal(session.status, 'IN_LOBBY'); assert.equal(session.matchId, 'M-new');
  session.status = 'TERMINAL';
  session._request = async () => ({ type: 'MATCH_JOINED', payload: { matchId: 'M-joined', seat: 'P2', participantToken: 'c'.repeat(43) } });
  await session.acceptRematchInvite('DEF456');
  assert.equal(session.status, 'IN_LOBBY'); assert.equal(session.playerId, 'P2');
});

test('Homecoming replay requests carry distinct protocol correlation IDs', async () => {
  const session = new NetworkPlaySession('ws://127.0.0.1:1');
  session.status = 'TERMINAL'; session.matchId = 'M-replay'; session.participantToken = 'a'.repeat(43);
  const requests = [];
  session._request = async message => {
    requests.push(message);
    assert.equal(message.type, 'GET_REPLAY');
    assert.ok(typeof message.requestId === 'string' && message.requestId.length > 0);
    assert.deepEqual(message.payload, { matchId: session.matchId, participantToken: session.participantToken });
    return { type: 'REPLAY_DATA', payload: { replay: { commands: [] } } };
  };
  assert.deepEqual(await session.getReplay(), { commands: [] });
  assert.deepEqual(await session.getReplay(), { commands: [] });
  assert.notEqual(requests[0].requestId, requests[1].requestId);
});

test('Homecoming online terminal identifies the human opponent and escapes their display name', () => {
  const html = renderTerminal({ match: { winner: 'P2', terminationReason: 'FORFEIT' }, human: { playerId: 'P1' }, opponent: { displayName: 'Guest <Two>' } }, { isNetworkMatch: true, rematchInvite: { fromDisplayName: 'Guest <Two>', inviteCode: 'ABC123' } });
  assert.match(html, /data-testid="terminal-winner">Guest &lt;Two&gt;<\/dd>/);
  assert.ok(html.includes('data-testid="download-replay"'));
  assert.ok(html.includes('data-testid="network-rematch"'));
  assert.ok(html.includes('data-action="accept-rematch" data-invite-code="ABC123"'));
  assert.ok(html.includes('data-action="decline-rematch"'));
  assert.ok(html.includes('Guest &lt;Two&gt; requested a rematch.'));
});

test('Homecoming explicit online forfeit finalizes once and preserves authenticated terminal bindings', async () => {
  const match = createAuthoritativeMatch({ matchId: 'M-homecoming-forfeit', seed: 12345 });
  const token = 'a'.repeat(43);
  const first = match.addParticipant('seat-one', token);
  const second = match.addParticipant('seat-two', 'b'.repeat(43));
  match.setReady(first.participantId); match.setReady(second.participantId); match.start();
  const connection = { matchId: match.matchId, participantId: first.participantId };
  const sent = [];
  let finalizations = 0;
  const handlers = createMatchHandlers({
    connections: new Map([['connection', connection]]),
    getMatchStore: () => ({ get: () => match, save: () => {} }),
    pendingForfeits: new Map(),
    broadcastMatchEnded: async terminal => {
      finalizations++;
      assert.equal(connection.matchId, terminal.matchId);
      assert.equal(terminal.status, 'TERMINAL');
      assert.equal(terminal.winner, second.playerId);
      assert.equal(terminal.terminalReason, 'FORFEIT');
      return true;
    },
    broadcastToSpectators: () => {}, send: (_ws, message) => sent.push(message), logEvent: () => {},
  });
  await handlers.handleLeaveMatch('connection', {}, { matchId: match.matchId, participantToken: 'c'.repeat(43) }, 'bad');
  assert.equal(match.status, 'RUNNING');
  assert.equal(finalizations, 0);
  assert.equal(sent.pop().type, 'ERROR');
  await handlers.handleLeaveMatch('connection', {}, { matchId: match.matchId, participantToken: token }, 'first');
  await handlers.handleLeaveMatch('connection', {}, { matchId: match.matchId, participantToken: token }, 'duplicate');
  assert.equal(finalizations, 1);
  assert.equal(connection.participantId, first.participantId);
  assert.equal(connection.matchId, match.matchId);
  assert.ok(match.validateToken(connection.participantId, token));
  assert.deepEqual(sent.map(message => message.type), ['LEFT_MATCH', 'LEFT_MATCH']);
  assert.equal(match.commandVault, null);
  assert.equal(match.legalActionFrame, null);
});
function fixture() {
  return {
    sessionId: 'homecoming-test', status: 'HUMAN_DECISION', human: { playerId: 'P1' }, opponent: { displayName: 'Opponent' },
    match: { winner: null, terminationReason: null },
    decision: { actorId: 'P1', isHuman: true, stateRevision: 3, frameHash: 'frame-3', legalActions: [
      { actionId: 'swap-0', family: 'swap-bar', mode: 'face-down', timingClass: 'SETUP', sourceHandles: ['h1'], targetHandles: ['private-swap-id'] },
      { actionId: 'swap-1', family: 'swap-bar', mode: 'face-down', timingClass: 'SETUP', sourceHandles: ['h2'], targetHandles: ['private-swap-id'] },
    ] },
    playerView: { actorId: 'P1', revision: 3, phase: 'Start', fullTurnSequence: 2, activePlayerId: 'P1', priority: null,
      own: { securedPoints: 0, goal: 21, hand: [card('h1'), card('h2', 'A♣')], pr: [], er: [] },
      opponents: [{ playerId: 'P2', securedPoints: 0, goal: 21, handCount: 5, pr: [], er: [] }],
      dpCount: 35, gyCount: 0, gyTopCard: null, exileCount: 0,
      swapBar: [{ id: 'private-swap-id', identity: 'HIDDEN', faceDown: true }, card('public-swap', '8♦')], stack: [],
    }, recentEvents: [],
  };
}

test('Homecoming HUD reads only authorized own Mini-Turn and Swap limits', () => {
  const input = fixture();
  input.playerView.own.limits = { miniTurnsRemaining: 2, swapBarUsedThisFT: true, secret: 'never copy this' };
  input.playerView.opponents[0].limits = { miniTurnsRemaining: 3, swapBarUsedThisFT: false };
  const game = buildSemanticGame(input);
  assert.equal(game.self.miniTurnsRemaining, 2);
  assert.equal(game.self.swapUsed, true);
  assert.equal(game.opponent.miniTurnsRemaining, undefined);
  assert.equal(JSON.stringify(game).includes('never copy this'), false);
  const publicGame = buildSemanticGame(input, { visibility: 'public' });
  assert.equal(publicGame.self.miniTurnsRemaining, null);
  assert.equal(publicGame.self.swapUsed, null);
  input.playerView.own.limits.miniTurnsRemaining = -1;
  assert.equal(buildSemanticGame(input).status, 'unavailable');
});

test('Homecoming groups structured families independently of display copy', () => {
  const actions = [action('a', ['h1'], ['t1']), action('b', ['h2'], ['t2'])];
  const before = buildActionEntries(actions);
  const after = buildActionEntries(actions.map(a => ({ ...a, label: 'Swap Counter Ultra made-up label' })));
  assert.equal(before[0].family.id, after[0].family.id);
  assert.deepEqual(before[0].family.variants.map(a => a.id), ['a', 'b']);
  assert.equal(before[0].family.title, 'Scuttle');
});
test('Homecoming never offers impossible source-target Cartesian combinations', () => {
  const family = familyOf([action('a', ['h1'], ['t1']), action('b', ['h2'], ['t2'])]);
  const picked = selectOption(family, {}, 'sources', 'h1');
  const target = family.parameters.find(p => p.key === 'targets');
  assert.deepEqual(parameterOptions(family, target, picked), ['t1']);
  assert.equal(resolvedAction(family, { sources: 'h1', targets: 't2' }), undefined);
  assert.equal(selectOption(family, picked, 'targets', 't2'), picked);
  assert.equal(resolvedAction(family, picked).id, 'a');
});
test('Homecoming exact one-card costs win over supersets, with no subset promotion', () => {
  const family = familyOf([action('one', ['source'], ['a'], 'six-dig', 'effect-six'), action('two', ['source'], ['a', 'b'], 'six-dig', 'effect-six'), action('other', ['source'], ['b', 'c'], 'six-dig', 'effect-six')]);
  assert.equal(resolvedAction(family, { targets: ['a'] }).id, 'one');
  assert.equal(resolvedAction(family, { targets: ['b'] }), undefined);
  assert.equal(resolvedAction(family, { targets: ['b', 'a'] }).id, 'two');
  assert.equal(resolvedAction(family, {}), undefined);
});
test('Homecoming a sole surviving multi-card variant still requires the complete set', () => {
  const family = familyOf([action('a', ['a', 'b'], ['x']), action('b', ['c', 'd'], ['y'])]);
  assert.equal(compatibleVariants(family, { sources: ['a'] }).length, 1);
  assert.equal(resolvedAction(family, { sources: ['a'] }), undefined);
  assert.equal(resolvedAction(family, { sources: ['a', 'b'] }).id, 'a');
});
test('Homecoming exact ordered-role ambiguity requires an explicit original variant ID', () => {
  const family = familyOf([action('ab', ['a', 'b']), action('ba', ['b', 'a'])]);
  assert.ok(family.parameters.some(p => p.key === 'variant'));
  assert.equal(resolvedAction(family, { sources: ['a', 'b'] }), undefined);
  assert.equal(resolvedAction(family, { sources: ['a', 'b'], variant: 'ba' }).id, 'ba');
});
test('Homecoming private assignment preserves hand and generated-play roles', () => {
  const family = familyOf([action('ab', [], ['a', 'b'], 'rank7-hand-and-effect', 'private-choice'), action('ba', [], ['b', 'a'], 'rank7-hand-and-effect', 'private-choice')]);
  assert.deepEqual(family.parameters.map(p => p.key), ['target:0', 'target:1']);
  assert.equal(resolvedAction(family, { 'target:0': 'b', 'target:1': 'a' }).id, 'ba');
});
test('Homecoming multi-card options are restricted to sets containing existing picks', () => {
  const family = familyOf([action('ab', ['a', 'b']), action('ac', ['a', 'c']), action('de', ['d', 'e'])]);
  const source = family.parameters.find(p => p.key === 'sources');
  assert.deepEqual(parameterOptions(family, source, { sources: ['a'] }), ['a', 'b', 'c']);
  assert.equal(selectOption(family, { sources: ['a'] }, 'sources', 'd').sources[0], 'a');
});
test('Homecoming reconciliation drops obsolete picks and retains provably compatible choices', () => {
  const family = familyOf([action('a', ['h1'], ['t1']), action('b', ['h1'], ['t2'])]);
  assert.deepEqual(reconcileSelection(family, { sources: 'removed', targets: 't2' }), { targets: 't2' });
  assert.equal(resolvedAction(family, { targets: 't2' }).id, 'b');
});
test('Homecoming families never collapse timing differences', () => {
  const entries = buildActionEntries([action('a'), action('b', [], [], 'ordinary', 'scuttle', { timing: 'Quick' })]);
  assert.equal(entries.length, 2);
  assert.ok(entries.every(entry => entry.kind === 'action'));
});

test('Homecoming unknown mechanics retain separate original actions', () => {
  const entries = buildActionEntries([action('a', [], [], null, 'unknown'), action('b', [], [], null, 'unknown')]);
  assert.deepEqual(entries.map(entry => entry.kind), ['action', 'action']);
});
test('Homecoming safely maps hidden Swap Bar targets to public positions', () => {
  const game = buildSemanticGame(fixture());
  assert.equal(game.status, 'ready');
  assert.equal(game.actions[0].swapSlot, 0);
  assert.deepEqual(game.actions[0].targets, ['hidden:swap:0']);
  assert.doesNotMatch(JSON.stringify(game), /private-swap-id/);
  const family = familyOf(game.actions);
  assert.equal(resolvedAction(family, { sources: 'h2' }).id, 'swap-1');
});
test('Homecoming network transport resolves the same slot before privacy scrubbing', () => {
  const local = fixture();
  const dto = buildNetworkPlayerView({ matchId: local.sessionId, playerId: 'P1', playerView: local.playerView,
    decision: { isMyDecision: true, actorId: 'P1', stateRevision: 3, frameHash: 'frame-3', legalActions: local.decision.legalActions.map(a => ({ ...a, sourceCardIds: a.sourceHandles, targetCardIds: a.targetHandles })) } });
  assert.equal(dto.playerView.swapBar[0].id, 'HIDDEN');
  assert.equal(dto.decision.legalActions[0].swapSlot, 0);
  const network = { ...local, playerView: dto.playerView, decision: { ...dto.decision, isHuman: true } };
  assert.deepEqual(buildSemanticGame(network).actions, buildSemanticGame(local).actions);
  assert.equal(buildSpectatorView(dto).decision.legalActions, undefined);
});
test('Homecoming invalid transported slots fail closed', () => {
  for (const value of [-1, 2, 2.5, '0']) {
    const input = fixture(); input.decision.legalActions[0].swapSlot = value;
    assert.equal(buildSemanticGame(input).status, 'unavailable');
  }
});
test('Homecoming private choice cards are whitelisted, frozen, and removed for spectators', () => {
  const input = fixture();
  input.playerView.pendingChoice = { kind: 'core-rank6-dig', optionCards: [card('choice-card', '8♠')], context: { secret: 'CONTEXT_SECRET' } };
  const game = buildSemanticGame(input);
  assert.equal(game.choice.cards[0].identity, '8♠');
  assert.ok(Object.isFrozen(game.choice.cards));
  assert.doesNotMatch(JSON.stringify(game), /CONTEXT_SECRET/);
  assert.equal(buildSemanticGame(input, { readOnly: true }).choice, null);
});
test('Homecoming board highlights equal current Composer options', () => {
  const game = buildSemanticGame(fixture());
  const family = familyOf(game.actions);
  assert.deepEqual(boardOptions(game, family, {}, 'sources').map(o => o.entityId), ['h1', 'h2']);
  assert.deepEqual(boardOptions(game, family, {}, 'mode'), []);
});
test('Homecoming decision identity includes session, player, revision and frame', () => {
  const game = buildSemanticGame(fixture());
  for (const field of ['sessionId', 'revision', 'frameHash']) assert.notEqual(decisionBoundary(game), decisionBoundary({ ...game, [field]: 'different' }));
  assert.notEqual(decisionBoundary(game), decisionBoundary({ ...game, self: { ...game.self, id: 'P2' } }));
});
test('Homecoming selection cannot cross a decision revision and fabricate a command', async () => {
  const submitted = [];
  const store = createGameStore(async intent => { submitted.push(intent); return { accepted: true }; });
  const input = fixture(); store.update(input); store.select('swap-0');
  input.playerView.revision = 4; input.decision.stateRevision = 4; input.decision.frameHash = 'frame-4'; store.update(input);
  assert.equal(await store.submit(), false);
  store.select('fabricated-id'); assert.equal(await store.submit(), false);
  store.select('swap-1'); assert.equal(await store.submit(), true);
  assert.deepEqual(submitted, [{ sessionId: input.sessionId, stateRevision: 4, decisionFrameHash: 'frame-4', actionId: 'swap-1' }]);
  store.dispose();
});
test('Homecoming pure presentation bundle imports no authority runtime or donor engine', () => {
  assert.ok(Object.keys(bundle.metafile.inputs).every(input => !/engine-adapter|core-autonomy|browserTabletop|play-controller|match-authority/.test(input)));
});

test('Homecoming identical chat refreshes retain board identity and selected action', () => {
  const store = createGameStore(async () => ({ accepted: true }));
  store.update(fixture()); store.select('swap-0');
  const before = store.getSnapshot(); let calls = 0;
  const unsubscribe = store.subscribe(() => calls++);
  store.update(fixture());
  assert.equal(store.getSnapshot(), before); assert.equal(calls, 0);
  unsubscribe(); store.dispose();
});

test('Homecoming suggestions use the safe projection and discard forged or duplicate IDs', () => {
  const input = fixture(); input.playerView.pendingChoice = { kind: 'core-rank6-dig', optionCards: [card('choice', '8♠')], context: { secret: 'PRIVATE_CONTEXT' } };
  const game = buildSemanticGame(input);
  let seen;
  const result = suggestedMoves(game, (policy, actions, context) => {
    seen = { policy, actions, context };
    return [{ action: { actionId: 'forged' }, scoreComponents: {} }, ...[actions[0], actions[0], actions[1]].map(action => ({ action, scoreComponents: { resource: 1 } }))];
  });
  assert.deepEqual(result.map(item => item.actionId), ['swap-0', 'swap-1']);
  assert.equal(seen.policy, 'value'); assert.equal(seen.actions[0].timingClass, 'SETUP');
  assert.doesNotMatch(JSON.stringify(seen), /PRIVATE_CONTEXT|private-swap-id|commandVault|rng|seed/);
  assert.equal(seen.context.authorizedView.knownCards.choice.pointValue, 8);
  assert.equal(suggestedMoves(game, () => { throw new Error('Policy unavailable'); }).length, 0);
  assert.equal(suggestedMoves({ ...game, status: 'waiting' }, () => assert.fail('Must not rank a waiting seat')).length, 0);
});

test('Homecoming legacy private-choice kinds expose only the chooser options', () => {
  for (const kind of ['nine-anchor-discard', 'rank7-scoring-trigger']) {
    const input = fixture(); input.playerView.pendingChoice = { kind, optionCards: [card('choice', '8♠')] };
    assert.equal(buildSemanticGame(input).choice.kind, kind);
    assert.equal(buildSemanticGame(input, { visibility: 'public' }).choice, null);
  }
});

test('Homecoming resolves every offered family variant in real canonical decision frames', async t => {
  const { createSimulationState, createSimulationDecisionFrame, executeSimulationAction, strictPolicyView, FIRST_CONTACT_TRIGGER_CLOSURE_PROFILE } = await import('@intrilex/engine-adapter');
  const families = new Set(); let frames = 0; let variants = 0;
  for (const profileId of ['core-advanced-authority', 'core-unrestricted-authority', FIRST_CONTACT_TRIGGER_CLOSURE_PROFILE.id]) {
    for (const seed of [12345, 67890]) {
      let state = createSimulationState({ profileId, playerIds: ['P1', 'P2'], seatOrder: ['P1', 'P2'], seed, enabledModules: [] });
      for (let step = 0; step < 150; step++) {
        const frame = createSimulationDecisionFrame(state);
        state = frame.state;
        if (frame.status !== 'PLAYER_DECISION_REQUIRED') break;
        const actorId = frame.decisionActorId;
        const view = strictPolicyView(state, actorId);
        const snapshot = { sessionId: 'authority-sample', status: 'HUMAN_DECISION', human: { playerId: actorId }, opponent: { displayName: 'Opponent' }, match: { winner: null, terminationReason: null },
          playerView: view, recentEvents: [], decision: { actorId, isHuman: true, stateRevision: state.revision, frameHash: frame.legalActionFrame.frameHash, legalActions: frame.policyActions } };
        const game = buildSemanticGame(snapshot, { coalesceIdenticalActions: true });
        assert.equal(game.status, 'ready', `${profileId}: frame ${step} must project safely; ${frame.policyActions.length} actions; max ID length ${Math.max(...frame.policyActions.map(a => a.actionId.length))}; max mode length ${Math.max(...frame.policyActions.map(a => a.mode?.length ?? 0))}; choice ${view.pendingChoice?.kind ?? 'none'}`);
        const wire = buildNetworkPlayerView({ matchId: snapshot.sessionId, playerId: actorId, playerView: view,
          decision: { ...snapshot.decision, isMyDecision: true, legalActions: frame.policyActions.map(action => ({ ...action, sourceCardIds: action.sourceHandles, targetCardIds: action.targetHandles })) } });
        assert.deepEqual(buildSemanticGame({ ...snapshot, playerView: wire.playerView, decision: { ...wire.decision, isHuman: true } }, { coalesceIdenticalActions: true }).actions, game.actions, 'Local and network tuple identities must match');
        for (const entry of buildActionEntries(game.actions)) {
          if (entry.kind === 'action') { variants++; continue; }
          for (const action of entry.family.variants) {
            const selection = Object.fromEntries(entry.family.parameters.map(parameter => [parameter.key, parameter.value(action)]));
            assert.equal(resolvedAction(entry.family, selection)?.id, action.id, `${profileId}: exact variant must resolve to its original ID`);
            variants++;
          }
        }
        const selected = frame.policyActions.find(action => !families.has(action.family)) ?? frame.policyActions[(step * 13 + seed) % frame.policyActions.length];
        families.add(selected.family); frames++;
        const result = executeSimulationAction(state, frame.resolve(selected.actionId));
        assert.equal(result.accepted, true, 'Sampled exact action must be accepted by the canonical engine');
        state = result.state;
      }
    }
  }
  assert.ok(frames > 50 && variants > 100);
  assert.ok(families.has('score') && families.has('private-choice') && families.has('counter'));
  t.diagnostic(`${frames} real decision frames; ${variants} original action variants; families: ${[...families].sort().join(', ')}`);
});

test('Homecoming host coalesces identical canonical enumerations but rejects conflicting IDs', () => {
  const input = fixture(); input.decision.legalActions.push({ ...input.decision.legalActions[0] });
  assert.equal(buildSemanticGame(input).status, 'unavailable', 'Strict external model retains its duplicate defense');
  const game = buildSemanticGame(input, { coalesceIdenticalActions: true });
  assert.equal(game.status, 'ready'); assert.equal(game.actions.length, 2); assert.equal(game.frameHash, 'frame-3');
  input.decision.legalActions[2].mode = 'face-up';
  assert.equal(buildSemanticGame(input, { coalesceIdenticalActions: true }).status, 'unavailable');
});

// ── Wild Sovereignty progressive composer ──
// The engine thinks in legal action variants; the player thinks in game
// decisions. `composition` (extracted at the authority boundary) lets the
// composer stage copy → effect → target/cost instead of dumping variants.
const wild = (id, mode, copy, effect, row, costs = [], targets = []) =>
  action(id, ['ks'], targets, mode, 'wild-sovereignty', { composition: { copy, effect, row, costs } });
const wildVariants = () => [
  wild('w-b1', 'three-bounce', '3', 'three-bounce', null, [], ['t1']),
  wild('w-b2', 'three-bounce', '3', 'three-bounce', null, [], ['t2']),
  wild('w-pr', 'four-row-clear-pr', '4', 'four-row-clear', 'pr'),
  wild('w-er', 'four-row-clear-er', '4', 'four-row-clear', 'er'),
  wild('w-tc1', 'total-clear', '4', 'total-clear', null, ['c1']),
  wild('w-tc2', 'total-clear', '4', 'total-clear', null, ['c2']),
  wild('w-d1', 'deep-draw', '6', 'deep-draw-six-spade', null, ['d1']),
  wild('w-d2', 'deep-draw', '6', 'deep-draw-six-spade', null, ['d2']),
  wild('w-r5', 'recycle-five', '5', 'recycle-five', null),
  wild('w-td7', 'topdeck-seven', '7', 'topdeck-seven', null),
];
const visibleKeys = (family, selection) => family.parameters.filter(p => parameterVisible(family, p, selection)).map(p => p.key);

test('Wild Sovereignty composer stages copy → effect → target/cost with no variant dump', () => {
  const family = familyOf(wildVariants());
  // Command-only distinctions (discard cost) are real parameters now, so
  // the lossy 'Exact declaration' fallback is never needed here.
  assert.deepEqual(family.parameters.map(p => p.key), ['copy', 'mode', 'targets', 'cost']);
  assert.ok(family.parameters.every(p => p.key !== 'variant'));
  // Nothing but the copied-effect choice renders first — no premature target.
  assert.deepEqual(visibleKeys(family, {}), ['copy']);
  const copy = family.parameters.find(p => p.key === 'copy');
  assert.deepEqual([...parameterOptions(family, copy, {})].sort(), ['3', '4', '5', '6', '7']);
  // A copied effect with no remaining decisions resolves immediately.
  assert.equal(resolvedAction(family, selectOption(family, {}, 'copy', '5'))?.id, 'w-r5');
  // copy 3 → only the bounce target remains.
  let sel = selectOption(family, {}, 'copy', '3');
  assert.deepEqual(visibleKeys(family, sel), ['copy', 'targets']);
  assert.equal(resolvedAction(family, sel), undefined, 'target still open → not yet resolved');
  sel = selectOption(family, sel, 'targets', 't2');
  assert.equal(resolvedAction(family, sel)?.id, 'w-b2');
  // copy 6 → only the discard cost remains.
  sel = selectOption(family, {}, 'copy', '6');
  assert.deepEqual(visibleKeys(family, sel), ['copy', 'cost']);
  sel = selectOption(family, sel, 'cost', 'd2');
  assert.equal(resolvedAction(family, sel)?.id, 'w-d2');
  // copy 4 → pick the effect first; the cost step appears only for total-clear.
  sel = selectOption(family, {}, 'copy', '4');
  assert.deepEqual(visibleKeys(family, sel), ['copy', 'mode']);
  sel = selectOption(family, sel, 'mode', 'total-clear');
  assert.deepEqual(visibleKeys(family, sel), ['copy', 'mode', 'cost']);
  sel = selectOption(family, sel, 'cost', 'c1');
  assert.equal(resolvedAction(family, sel)?.id, 'w-tc1');
  // A row clear needs no cost — the copy+effect pair resolves alone.
  sel = selectOption(family, selectOption(family, {}, 'copy', '4'), 'mode', 'four-row-clear-er');
  assert.equal(resolvedAction(family, sel)?.id, 'w-er');
});

test('Wild Sovereignty upstream copy switch clears invalid downstream picks', () => {
  const variants = [...wildVariants(),
    wild('w-tcx', 'total-clear', '4', 'total-clear', null, ['x']),
    wild('w-dx', 'deep-draw', '6', 'deep-draw-six-spade', null, ['x'])];
  const family = familyOf(variants);
  // A still-legal downstream pick survives an upstream switch.
  let sel = selectOption(family, selectOption(family, selectOption(family, {}, 'copy', '4'), 'mode', 'total-clear'), 'cost', 'x');
  sel = selectOption(family, sel, 'copy', '6');
  assert.equal(sel.copy, '6');
  assert.equal(sel.mode, undefined, 'total-clear is not a 6♠ effect — dropped');
  assert.equal(sel.cost, 'x', 'x remains a legal deep-draw discard — retained');
  assert.equal(resolvedAction(family, sel)?.id, 'w-dx');
  // An incompatible downstream pick is dropped, never silently submitted.
  sel = selectOption(family, { copy: '6', cost: 'd1' }, 'copy', '4');
  assert.equal(sel.cost, undefined, 'd1 is not a legal copy-4 cost — dropped');
});

test('Wild Sovereignty staged controls expose real effect labels, never Default', () => {
  const family = familyOf(wildVariants());
  const input = fixture();
  input.playerView.own.hand.push(card('ks', 'K♠'));
  const game = buildSemanticGame(input);
  const mode = family.parameters.find(p => p.key === 'mode');
  const sel = selectOption(family, {}, 'copy', '4');
  const labels = parameterOptions(family, mode, upstreamSelection(family, mode, sel)).map(v => optionLabel(game, family, mode, v));
  assert.deepEqual(labels.sort(), ['clear Enduring Row', 'clear Point Row', 'total clear']);
  // Copy options present canonical card ranks, not opaque action IDs.
  const copy = family.parameters.find(p => p.key === 'copy');
  assert.deepEqual(parameterOptions(family, copy, {}).map(v => optionLabel(game, family, copy, v)).sort(), ['3♠', '4♠', '5♠', '6♠', '7♠']);
});

test('Homecoming composition parses into semantic actions and survives the network allowlist', () => {
  const input = fixture();
  input.decision.legalActions[0].composition = { copy: '6', effect: 'deep-draw-six-spade', row: null, costs: ['h1'] };
  const game = buildSemanticGame(input);
  assert.deepEqual(JSON.parse(JSON.stringify(game.actions[0].composition)), { copy: '6', effect: 'deep-draw-six-spade', row: null, costs: ['h1'] });
  const dto = buildNetworkPlayerView({
    matchId: 'm-comp', playerId: 'P1', playerView: input.playerView,
    decision: {
      isMyDecision: true, actorId: 'P1', stateRevision: 3, frameHash: 'f',
      legalActions: [{
        actionId: 'w1', family: 'wild-sovereignty', mode: 'deep-draw', timingClass: 'ACTION',
        sourceCardIds: ['ks'], targetCardIds: [],
        composition: { copy: '6', effect: 'deep-draw-six-spade', row: null, costs: ['h1'] },
        command: { action: { secret: 'NO_LEAK' } }, featureVector: { secret: 'NO_LEAK' },
      }],
    },
  });
  assert.deepEqual(dto.decision.legalActions[0].composition, { copy: '6', effect: 'deep-draw-six-spade', row: null, costs: ['h1'] });
  assert.doesNotMatch(JSON.stringify(dto), /NO_LEAK|command|featureVector/);
});
