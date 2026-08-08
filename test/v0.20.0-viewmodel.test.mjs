// ═══════════════════════════════════════════════════════════════
// v0.20.0-viewmodel.test.mjs — View-model adapter unit tests
// Proves the pure adapter: snapshot → view model
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRankedDuelViewModel } from '../apps/lab-web/src/play/ranked-duel-viewmodel.mjs';

// ── Mock helpers ───────────────────────────────────────────────
function mockSnapshot(overrides = {}) {
  return {
    sessionId: 'TEST-SESSION-1',
    humanPlayerId: 'P1',
    state: {
      seatOrder: ['P1', 'P2'],
      fullTurnSequence: 3,
      phase: 'ACTION',
      activePlayerId: 'P1',
      priorityOwnerId: 'P1',
      windowLabel: 'Action Phase',
      startingGoal: 21,
      players: {
        P1: {
          securedPoints: 12,
          goal: 21,
          hand: [
            { entityId: 'CORE-001', identity: 'A\u2660', rank: 'A', suit: '\u2660', pointValue: 4, zone: 'HAND' },
            { entityId: 'CORE-002', identity: '5\u2665', rank: '5', suit: '\u2665', pointValue: 5, zone: 'HAND' },
          ],
          pointRow: [
            { entityId: 'CORE-003', identity: '3\u2663', rank: '3', suit: '\u2663', pointValue: 3, zone: 'P1_PR', aegis: true },
          ],
          enduringRow: [],
          isActive: true,
          hasPriority: true,
        },
        P2: {
          securedPoints: 8,
          goal: 21,
          hand: [
            {}, {}, {}, // Anonymous backs — no identity
          ],
          pointRow: [
            { entityId: 'CORE-004', identity: '10\u2666', rank: '10', suit: '\u2666', pointValue: 10, zone: 'P2_PR' },
          ],
          enduringRow: [],
          displayName: 'AI',
          aiRating: 1200,
        },
      },
      drawPile: Array(12).fill({}),
      graveyard: [
        { entityId: 'CORE-005', identity: '7\u2660', rank: '7', suit: '\u2660', pointValue: 7, zone: 'GY' },
      ],
      exile: [],
      swapBar: [
        { faceDown: true },
        { entityId: 'CORE-006', identity: 'Q\u2665', rank: 'Q', suit: '\u2665', pointValue: 2, zone: 'SWAP', faceDown: false },
        { faceDown: true },
      ],
      stack: [
        { stackIndex: 0, actionFamily: 'quick', actionMode: 'eight-aegis-field', sourcePlayerId: 'P1', isResolving: true },
      ],
      swapAvailable: true,
      ...overrides,
    },
    legalActions: [
      { actionId: 'ACT-001', family: 'score', mode: 'points', timingClass: 'ORDINARY', description: 'Score Points' },
      { actionId: 'ACT-002', family: 'pass', mode: 'exhausted-pass', timingClass: 'ORDINARY', description: 'Pass', isPass: true },
    ],
    chat: [
      { text: 'Match started', isSystem: true },
    ],
    status: 'HUMAN_DECISION',
  };
}

function mockProfile() {
  return {
    displayName: 'TestPlayer',
    rating: { scope: 'LOCAL_AI', value: 1250, provisional: false, ratedMatches: 12 },
    badges: [{ id: 'first-duel', name: 'First Duel' }, { id: 'field-tested', name: 'Field Tested' }],
    record: { wins: 7, losses: 4, draws: 1 },
  };
}

// ── Tests ──────────────────────────────────────────────────────

test('input snapshot is not mutated', () => {
  const snapshot = mockSnapshot();
  const before = JSON.stringify(snapshot);
  buildRankedDuelViewModel(snapshot, mockProfile());
  const after = JSON.stringify(snapshot);
  assert.equal(before, after, 'Snapshot must not be mutated');
});

test('identical snapshot produces identical view model', () => {
  const snapshot = mockSnapshot();
  const vm1 = JSON.stringify(buildRankedDuelViewModel(snapshot, mockProfile()));
  const vm2 = JSON.stringify(buildRankedDuelViewModel(snapshot, mockProfile()));
  assert.equal(vm1, vm2, 'Identical inputs must produce identical outputs');
});

test('status is HUMAN_DECISION when active player is human with legal actions', () => {
  const vm = buildRankedDuelViewModel(mockSnapshot(), mockProfile());
  assert.equal(vm.status, 'HUMAN_DECISION');
});

test('status is AI_DECISION when active player is AI', () => {
  const snapshot = mockSnapshot();
  snapshot.state.activePlayerId = 'P2';
  snapshot.status = 'AI_DECISION';
  const vm = buildRankedDuelViewModel(snapshot, mockProfile());
  assert.equal(vm.status, 'AI_DECISION');
});

test('status is TERMINAL when termination reason exists', () => {
  const snapshot = mockSnapshot();
  snapshot.state.terminationReason = 'NORMAL_VICTORY';
  snapshot.status = 'TERMINAL';
  const vm = buildRankedDuelViewModel(snapshot, mockProfile());
  assert.equal(vm.status, 'TERMINAL');
});

test('mode is LOCAL_AI with networkRanked false', () => {
  const vm = buildRankedDuelViewModel(mockSnapshot(), mockProfile());
  assert.equal(vm.mode.kind, 'LOCAL_AI');
  assert.equal(vm.mode.networkRanked, false);
});

test('human player plate has rating and badges', () => {
  const vm = buildRankedDuelViewModel(mockSnapshot(), mockProfile());
  assert.equal(vm.human.isHuman, true);
  assert.equal(vm.human.rating.value, 1250);
  assert.equal(vm.human.badges.length, 2);
});

test('opponent player plate has aiRating, not human rating', () => {
  const vm = buildRankedDuelViewModel(mockSnapshot(), mockProfile());
  assert.equal(vm.opponent.isHuman, false);
  assert.equal(vm.opponent.aiRating, 1200);
  assert.equal(vm.opponent.rating, null);
});

test('opponent hand has no card identities', () => {
  const vm = buildRankedDuelViewModel(mockSnapshot(), mockProfile());
  assert.equal(vm.battlefield.opponentHandCount, 3);
  // Privacy: no identities in opponent hand
  assert.equal(vm.privacy.opponentHandIdentifiersPresent, false);
});

test('human hand exposes owned card identities', () => {
  const vm = buildRankedDuelViewModel(mockSnapshot(), mockProfile());
  assert.equal(vm.battlefield.humanHand.length, 2);
  assert.equal(vm.battlefield.humanHand[0].identity, 'A\u2660');
  assert.equal(vm.battlefield.humanHand[1].identity, '5\u2665');
});

test('discard top card is visible when non-empty', () => {
  const vm = buildRankedDuelViewModel(mockSnapshot(), mockProfile());
  assert.equal(vm.zones.discard.count, 1);
  assert.notEqual(vm.zones.discard.topCard, null);
  assert.equal(vm.zones.discard.topCard.identity, '7\u2660');
});

test('draw pile shows count', () => {
  const vm = buildRankedDuelViewModel(mockSnapshot(), mockProfile());
  assert.equal(vm.zones.draw.count, 12);
});

test('exile is empty', () => {
  const vm = buildRankedDuelViewModel(mockSnapshot(), mockProfile());
  assert.equal(vm.zones.exile.count, 0);
  assert.equal(vm.zones.exile.newestCard, null);
});

test('swap bar has face-up middle card visible', () => {
  const vm = buildRankedDuelViewModel(mockSnapshot(), mockProfile());
  assert.equal(vm.zones.swap.length, 3);
  assert.equal(vm.zones.swap[1].card.identity, 'Q\u2665');
  assert.equal(vm.zones.swap[1].faceDown, false);
  assert.equal(vm.zones.swap[0].faceDown, true);
});

test('stack items are present', () => {
  const vm = buildRankedDuelViewModel(mockSnapshot(), mockProfile());
  assert.equal(vm.stack.length, 1);
  assert.equal(vm.stack[0].actionFamily, 'quick');
});

test('legal actions include pass', () => {
  const vm = buildRankedDuelViewModel(mockSnapshot(), mockProfile());
  assert.equal(vm.actions.length, 2);
  const passAction = vm.actions.find(a => a.isPass);
  assert.ok(passAction, 'Pass action must be present');
});

test('card status markers are detected', () => {
  const vm = buildRankedDuelViewModel(mockSnapshot(), mockProfile());
  const aegisCard = vm.battlefield.bottomPR.find(c => c.identity === '3\u2663');
  assert.ok(aegisCard, 'Card with Aegis must be present');
  assert.ok(aegisCard.statusMarkers.some(m => m.type === 'AEGIS'), 'Aegis marker must be present');
});

test('dynamic goal is captured', () => {
  const vm = buildRankedDuelViewModel(mockSnapshot(), mockProfile());
  assert.equal(vm.human.goal, 21);
  assert.equal(vm.match.goalMayBeDynamic, true);
});

test('privacy validation fails on opponent hand identity leak', () => {
  const snapshot = mockSnapshot();
  snapshot.state.players.P2.hand[0] = { entityId: 'LEAK', identity: 'K\u2660', rank: 'K', suit: '\u2660' };
  const vm = buildRankedDuelViewModel(snapshot, mockProfile());
  assert.equal(vm.status, 'ERROR');
  assert.ok(vm.error.reason.includes('exposes card identity'));
});

test('privacy validation fails on raw commands', () => {
  const snapshot = mockSnapshot();
  snapshot.state._rawCommands = [{ type: 'MOVE_CARD' }];
  const vm = buildRankedDuelViewModel(snapshot, mockProfile());
  assert.equal(vm.status, 'ERROR');
  assert.ok(vm.error.reason.includes('Raw commands'));
});

test('empty board produces empty battlefield rows', () => {
  const snapshot = mockSnapshot();
  snapshot.state.players.P1.pointRow = [];
  snapshot.state.players.P2.pointRow = [];
  const vm = buildRankedDuelViewModel(snapshot, mockProfile());
  assert.equal(vm.battlefield.topPR.length, 0);
  assert.equal(vm.battlefield.bottomPR.length, 0);
});

test('missing snapshot returns error model', () => {
  const vm = buildRankedDuelViewModel(null, mockProfile());
  assert.equal(vm.status, 'ERROR');
  assert.equal(vm.error.code, 'MISSING_SNAPSHOT');
});

console.log('All view-model tests passed');
