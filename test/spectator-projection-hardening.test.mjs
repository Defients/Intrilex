// ═══════════════════════════════════════════════════════════════
// spectator-projection-hardening.test.mjs — v0.24.2 Truth Closure II
//
// Adversarial tests for the spectator projection boundary.
// Verifies that buildSpectatorView() does not leak:
//   - nested hands (own or opponent)
//   - draw-pile identities
//   - private choice data
//   - command payloads
//   - legal action arrays
//   - hidden Swap identities
//   - participant/reconnect tokens
//   - RNG/seed state
//
// The spectator projection is currently built by starting from a
// participant-authorized view and stripping private data. These tests
// ensure the stripping is complete.
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSpectatorView, buildNetworkPlayerView, validateNetworkViewPrivacy } from '../packages/match-authority/src/player-projection.mjs';
import { createAuthoritativeMatch, MatchStatus } from '../packages/match-authority/src/authoritative-match-session.mjs';
import { randomBytes } from 'node:crypto';

function makeToken() { return randomBytes(32).toString('base64url'); }

function createRunningMatch() {
  const match = createAuthoritativeMatch({
    matchId: `M-${randomBytes(8).toString('hex')}`,
    profileId: 'core-unrestricted-authority',
    seed: 42,
  });
  const t1 = makeToken();
  const t2 = makeToken();
  match.addParticipant('P-aaa', t1);
  match.addParticipant('P-bbb', t2);
  match.setReady('P-aaa');
  match.setReady('P-bbb');
  match.start();
  return { match, t1, t2 };
}

// ── Tests ──

test('spectator-hardening: spectator view has isSpectator=true and playerId=null', () => {
  const { match } = createRunningMatch();
  const view = match.getAuthorizedView('P-aaa');
  const specView = buildSpectatorView(view);
  assert.ok(specView, 'spectator view must not be null');
  assert.equal(specView.isSpectator, true);
  assert.equal(specView.playerId, null);
});

test('spectator-hardening: spectator view has NO legal actions', () => {
  const { match } = createRunningMatch();
  const view = match.getAuthorizedView('P-aaa');
  const specView = buildSpectatorView(view);
  assert.equal(specView.decision?.legalActions, undefined,
    'spectator view must NOT include legalActions');
});

test('spectator-hardening: spectator view has NO opponent info', () => {
  const { match } = createRunningMatch();
  const view = match.getAuthorizedView('P-aaa');
  const specView = buildSpectatorView(view);
  assert.equal(specView.opponent, null, 'spectator view must have opponent=null');
});

test('spectator-hardening: spectator board view hides BOTH players\' hands', () => {
  const { match } = createRunningMatch();
  const view = match.getAuthorizedView('P-aaa');
  const specView = buildSpectatorView(view);
  const pv = specView.playerView;
  assert.ok(pv, 'spectator view must have playerView');
  // Own hand must be replaced with count
  if (pv.own) {
    assert.equal(pv.own.hand, undefined, 'spectator own hand must be hidden');
    assert.ok(typeof pv.own.handCount === 'number', 'spectator own handCount must be a number');
  }
  // Opponent hands must be hidden
  if (pv.opponents) {
    for (const opp of pv.opponents) {
      assert.equal(opp.hand, undefined, 'spectator opponent hand must be hidden');
    }
  }
});

test('spectator-hardening: spectator view has NO draw-pile identities', () => {
  const { match } = createRunningMatch();
  const view = match.getAuthorizedView('P-aaa');
  const specView = buildSpectatorView(view);
  const pv = specView.playerView;
  if (pv) {
    assert.equal(pv.drawPile, undefined, 'drawPile array must not be exposed');
    assert.equal(pv.dp, undefined, 'dp array must not be exposed');
  }
});

test('spectator-hardening: spectator view has NO forbidden fields (rng, seed, commandVault, etc.)', () => {
  const { match } = createRunningMatch();
  const view = match.getAuthorizedView('P-aaa');
  const specView = buildSpectatorView(view);
  const forbidden = ['rng', 'seed', 'setupSeed', 'rawState', 'commandVault', 'command', 'commands', 'engineCommand', 'privateChoiceToken', 'privateChoiceTokens', 'opponentHandIdentities', 'drawPileIdentities', 'omniscientState', 'authorityHash'];
  const checkObj = (obj, path) => {
    if (!obj || typeof obj !== 'object') return;
    for (const key of forbidden) {
      assert.equal(obj[key], undefined, `spectator view must not expose forbidden field '${key}' at ${path}`);
    }
    for (const [key, val] of Object.entries(obj)) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        checkObj(val, `${path}.${key}`);
      }
    }
  };
  checkObj(specView, 'root');
  checkObj(specView.playerView, 'playerView');
});

test('spectator-hardening: spectator view has NO hidden Swap Bar identities', () => {
  const { match } = createRunningMatch();
  const view = match.getAuthorizedView('P-aaa');
  const specView = buildSpectatorView(view);
  const pv = specView.playerView;
  if (pv?.swapBar) {
    for (const card of pv.swapBar) {
      if (card.faceDown) {
        assert.equal(card.identity, 'HIDDEN', 'face-down swap card identity must be HIDDEN');
      }
    }
  }
});

test('spectator-hardening: spectator view has NO pending choice data', () => {
  const { match } = createRunningMatch();
  const view = match.getAuthorizedView('P-aaa');
  const specView = buildSpectatorView(view);
  const pv = specView.playerView;
  if (pv) {
    assert.equal(pv.pendingChoice, null, 'pendingChoice must be null in spectator view');
  }
});

test('spectator-hardening: spectator view passes validateNetworkViewPrivacy', () => {
  const { match } = createRunningMatch();
  const view = match.getAuthorizedView('P-aaa');
  const specView = buildSpectatorView(view);
  const validation = validateNetworkViewPrivacy(specView);
  assert.ok(validation.valid, `spectator view must pass privacy validation: ${validation.reason ?? ''}`);
});

test('spectator-hardening: spectator view from P1 and P2 produce equivalent public state', () => {
  const { match } = createRunningMatch();
  const view1 = match.getAuthorizedView('P-aaa');
  const view2 = match.getAuthorizedView('P-bbb');
  const spec1 = buildSpectatorView(view1);
  const spec2 = buildSpectatorView(view2);
  // Both must have the same matchId, status, and phase
  assert.equal(spec1.matchId, spec2.matchId);
  assert.equal(spec1.status, spec2.status);
  assert.equal(spec1.match?.phase, spec2.match?.phase);
  // Both must have isSpectator=true
  assert.equal(spec1.isSpectator, true);
  assert.equal(spec2.isSpectator, true);
});

test('spectator-hardening: participant tokens are not in spectator view', () => {
  const { match, t1, t2 } = createRunningMatch();
  const view = match.getAuthorizedView('P-aaa');
  const specView = buildSpectatorView(view);
  const specJson = JSON.stringify(specView);
  assert.ok(!specJson.includes(t1), 'spectator view must not contain participant token 1');
  assert.ok(!specJson.includes(t2), 'spectator view must not contain participant token 2');
});

test('spectator-hardening: spectator view does not expose reconnect tokens', () => {
  const { match } = createRunningMatch();
  const view = match.getAuthorizedView('P-aaa');
  const specView = buildSpectatorView(view);
  const specJson = JSON.stringify(specView);
  // Reconnect tokens are participant tokens — verify they're not in the view
  assert.ok(!specJson.match(/token/i) || specJson.match(/token/i)?.length === 0 ||
    !specJson.includes('participantToken'),
    'spectator view must not contain participantToken field');
});

// IRX-C02: Spectator knownCards must not include hand-zone card identities.
// The engine uses uppercase zone names like "P1_HAND", "P2_HAND".
// The previous filter only checked for lowercase "hand", allowing hand card
// identities to survive into the spectator view.
test('spectator-hardening: knownCards filters out P1_HAND/P2_HAND zone cards', () => {
  const mockView = {
    matchId: 'M-test',
    status: 'RUNNING',
    profileId: 'core-unrestricted-authority',
    playerId: 'P1',
    match: { fullTurnSequence: 3, phase: 'ACTION', activePlayerId: 'P1', winner: null, terminationReason: null },
    decision: { actorId: 'P1', stateRevision: 2, frameHash: 'abc', isMyDecision: true },
    playerView: {
      own: { hand: [{ id: 'c1', identity: 'A♠' }], securedPoints: 0, goal: 21, pr: [], er: [] },
      opponents: [{ playerId: 'P2', handCount: 1, securedPoints: 0, goal: 21, pr: [], er: [] }],
      knownCards: {
        'c1': { id: 'c1', identity: 'A♠', zone: 'P1_HAND' },
        'c2': { id: 'c2', identity: 'K♥', zone: 'P2_HAND' },
        'c3': { id: 'c3', identity: 'Q♦', zone: 'P1_PR' },
        'c4': { id: 'c4', identity: 'J♣', zone: 'P2_ER' },
        'c5': { id: 'c5', identity: '10♠', zone: 'hand' },
      },
      activePlayerId: 'P1',
      phase: 'ACTION',
    },
    recentEvents: [],
    opponent: null,
  };
  const specView = buildSpectatorView(mockView);
  const pv = specView.playerView;
  assert.ok(pv, 'spectator view must have playerView');
  assert.ok(pv.knownCards, 'spectator view must have knownCards');
  // Hand-zone cards must be filtered out
  assert.ok(!pv.knownCards['c1'], 'P1_HAND card must not be in spectator knownCards');
  assert.ok(!pv.knownCards['c2'], 'P2_HAND card must not be in spectator knownCards');
  assert.ok(!pv.knownCards['c5'], 'lowercase hand card must not be in spectator knownCards');
  // Public-zone cards must remain
  assert.ok(pv.knownCards['c3'], 'P1_PR card must remain in spectator knownCards');
  assert.ok(pv.knownCards['c4'], 'P2_ER card must remain in spectator knownCards');
});

// IRX-C02: Spectator view must not include viewHash or frameHash
// (participant-specific state oracles).
test('spectator-hardening: spectator view excludes viewHash and frameHash', () => {
  const mockView = {
    matchId: 'M-test',
    status: 'RUNNING',
    profileId: 'core-unrestricted-authority',
    viewHash: 'participant-specific-hash-abc',
    playerId: 'P1',
    match: { fullTurnSequence: 3, phase: 'ACTION', activePlayerId: 'P1', winner: null, terminationReason: null },
    decision: { actorId: 'P1', stateRevision: 2, frameHash: 'frame-hash-xyz', isMyDecision: true },
    playerView: { own: { hand: [], pr: [], er: [] }, opponents: [], knownCards: {} },
    recentEvents: [],
    opponent: null,
  };
  const specView = buildSpectatorView(mockView);
  assert.ok(!('viewHash' in specView), 'spectator view must not include viewHash');
  assert.ok(!('frameHash' in (specView.decision ?? {})), 'spectator decision must not include frameHash');
});
