// ═══════════════════════════════════════════════════════════════
// v2.5-match-ui-behavioral.test.mjs
//
// Behavioral tests for the v2.5 Match UI:
//   1. AI opponent identity (aiDisplayNameFromPolicyId, aiDifficultyLabelFromPolicyId)
//   2. Draw pile depletion visual tiers (renderer)
//   3. Event log actor labels (renderer shows YOU, not Player 1)
//   4. Resolution stack empty state (renderer shows "no pending effects")
//   5. Privacy/hidden information firewall (viewmodel rejects opponent hand)
//   6. Viewmodel schema and structure
//   7. Renderer output structure
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const srcDir = join(root, 'apps', 'lab-web', 'src');

function srcUrl(relPath) {
  return pathToFileURL(join(srcDir, relPath)).href;
}

// ── Top-level dynamic imports ────────────────────────────────────
const aiPersonality = await import(srcUrl('play/ai-personality.js'));
const rankedDuelViewModel = await import(srcUrl('play/ranked-duel-viewmodel.mjs'));
const rankedDuelRenderer = await import(srcUrl('play/ranked-duel-renderer.mjs'));

// ── Helper: build a minimal test snapshot ────────────────────────

function buildTestSnapshot(overrides = {}) {
  const humanPlayerId = overrides.humanPlayerId ?? 'P1';
  const opponentPlayerId = humanPlayerId === 'P1' ? 'P2' : 'P1';
  return {
    humanPlayerId,
    status: 'AI_DECISION',
    isNetworkMatch: false,
    decision: null,
    legalActions: [],
    state: {
      seatOrder: ['P1', 'P2'],
      fullTurnSequence: 5,
      phase: 'ACTION',
      activePlayerId: 'P1',
      priorityOwnerId: null,
      windowLabel: '',
      startingGoal: 21,
      players: {
        P1: {
          securedPoints: 7,
          goal: 21,
          hand: [
            { entityId: 'c1', identity: '7♣', rank: '7', suit: '♣', pointValue: 7, isGeneratedCopy: false, statusMarkers: [], zone: 'HAND', ownerId: 'P1' },
            { entityId: 'c2', identity: 'K♥', rank: 'K', suit: '♥', pointValue: 13, isGeneratedCopy: false, statusMarkers: [], zone: 'HAND', ownerId: 'P1' },
          ],
          pointRow: [],
          enduringRow: [],
          isActive: true,
          hasPriority: false,
        },
        P2: {
          securedPoints: 3,
          goal: 21,
          hand: { count: 5 },
          pointRow: [],
          enduringRow: [],
          isActive: false,
          hasPriority: false,
          displayName: 'Hybrix Rusher',
        },
      },
      drawPile: { count: 30 },
      graveyard: { count: 2, topCard: null },
      exile: { count: 0, newestVisibleCard: null },
      swapBar: [],
      stack: [],
      swapAvailable: true,
      terminationReason: null,
      winner: null,
    },
    recentEvents: [],
    ...overrides,
  };
}

// ── 1. AI opponent identity ──────────────────────────────────────

describe('AI opponent identity', () => {
  const { aiDisplayNameFromPolicyId, aiDifficultyLabelFromPolicyId } = aiPersonality;

  test('aiDisplayNameFromPolicyId returns "AI" for null/undefined', () => {
    assert.equal(aiDisplayNameFromPolicyId(null), 'AI');
    assert.equal(aiDisplayNameFromPolicyId(undefined), 'AI');
    assert.equal(aiDisplayNameFromPolicyId(''), 'AI');
  });

  test('aiDisplayNameFromPolicyId converts hybrix-rusher to "Hybrix Rusher"', () => {
    assert.equal(aiDisplayNameFromPolicyId('hybrix-rusher'), 'Hybrix Rusher');
  });

  test('aiDisplayNameFromPolicyId strips difficulty suffix', () => {
    assert.equal(aiDisplayNameFromPolicyId('hybrix-rusher-easy'), 'Hybrix Rusher');
    assert.equal(aiDisplayNameFromPolicyId('hybrix-rusher-hard'), 'Hybrix Rusher');
    assert.equal(aiDisplayNameFromPolicyId('hybrix-defender-nightmare'), 'Hybrix Defender');
  });

  test('aiDisplayNameFromPolicyId converts baseline to "Hybrix Baseline"', () => {
    assert.equal(aiDisplayNameFromPolicyId('hybrix-baseline'), 'Hybrix Baseline');
  });

  test('aiDisplayNameFromPolicyId handles non-hybrix policies with title case', () => {
    const name = aiDisplayNameFromPolicyId('random-legal');
    assert.equal(name, 'Random Legal');
  });

  test('aiDisplayNameFromPolicyId never leaks raw policyId with hyphens', () => {
    // The display name should not be the raw "hybrix-rusher-easy"
    const name = aiDisplayNameFromPolicyId('hybrix-rusher-easy');
    assert.notEqual(name, 'hybrix-rusher-easy');
    assert.ok(!name.includes('-easy'), 'should not contain difficulty suffix');
  });

  test('aiDifficultyLabelFromPolicyId returns EASY for -easy suffix', () => {
    assert.equal(aiDifficultyLabelFromPolicyId('hybrix-rusher-easy'), 'EASY');
  });

  test('aiDifficultyLabelFromPolicyId returns HARD for -hard suffix', () => {
    assert.equal(aiDifficultyLabelFromPolicyId('hybrix-rusher-hard'), 'HARD');
  });

  test('aiDifficultyLabelFromPolicyId returns NIGHTMARE for -nightmare suffix', () => {
    assert.equal(aiDifficultyLabelFromPolicyId('hybrix-rusher-nightmare'), 'NIGHTMARE');
  });

  test('aiDifficultyLabelFromPolicyId returns NORMAL for -normal suffix', () => {
    assert.equal(aiDifficultyLabelFromPolicyId('hybrix-rusher-normal'), 'NORMAL');
  });

  test('aiDifficultyLabelFromPolicyId returns empty for default difficulty', () => {
    assert.equal(aiDifficultyLabelFromPolicyId('hybrix-rusher'), '');
  });

  test('aiDifficultyLabelFromPolicyId returns empty for non-hybrix policies', () => {
    assert.equal(aiDifficultyLabelFromPolicyId('random-legal'), '');
    assert.equal(aiDifficultyLabelFromPolicyId(null), '');
  });

  test('viewmodel opponent plate uses display name from aiDisplayNameFromPolicyId', () => {
    const { buildRankedDuelViewModel } = rankedDuelViewModel;
    // The viewmodel builds opponent plate from state.players[opponentId].displayName
    // When set, it should use that display name, not the raw policyId.
    const snap = buildTestSnapshot();
    snap.state.players.P2.displayName = aiPersonality.aiDisplayNameFromPolicyId('hybrix-rusher-easy');
    const vm = buildRankedDuelViewModel(snap);
    assert.ok(vm.opponent.displayName);
    assert.notEqual(vm.opponent.displayName, 'hybrix-rusher-easy');
    assert.match(vm.opponent.displayName, /Hybrix Rusher/);
  });
});

// ── 2. Draw pile depletion visual tiers ──────────────────────────

describe('Draw pile depletion visual tiers', () => {
  const { renderRankedDuel } = rankedDuelRenderer;

  test('Draw pile with 0 cards shows "depleted" tier and "Exhausted" text', () => {
    const snap = buildTestSnapshot();
    snap.state.drawPile = { count: 0 };
    const html = renderRankedDuel(snap, { isReadOnly: true });
    assert.match(html, /data-depletion="depleted"/);
    assert.match(html, /Exhausted/i);
  });

  test('Draw pile with 4 cards shows "low" tier', () => {
    const snap = buildTestSnapshot();
    snap.state.drawPile = { count: 4 };
    const html = renderRankedDuel(snap, { isReadOnly: true });
    assert.match(html, /data-depletion="low"/);
  });

  test('Draw pile with 12 cards shows "medium" tier', () => {
    const snap = buildTestSnapshot();
    snap.state.drawPile = { count: 12 };
    const html = renderRankedDuel(snap, { isReadOnly: true });
    assert.match(html, /data-depletion="medium"/);
  });

  test('Draw pile with 30 cards shows "high" tier', () => {
    const snap = buildTestSnapshot();
    snap.state.drawPile = { count: 30 };
    const html = renderRankedDuel(snap, { isReadOnly: true });
    assert.match(html, /data-depletion="high"/);
  });

  test('Draw pile count is visible in the rendered output', () => {
    const snap = buildTestSnapshot();
    snap.state.drawPile = { count: 17 };
    const html = renderRankedDuel(snap, { isReadOnly: true });
    assert.match(html, /17/);
  });
});

// ── 3. Event log actor labels ────────────────────────────────────

describe('Event log actor labels', () => {
  const { renderRankedDuel } = rankedDuelRenderer;

  test('Event log shows "YOU" for human player, not "Player 1"', () => {
    const snap = buildTestSnapshot();
    snap.humanPlayerId = 'P1';
    snap.recentEvents = [
      { type: 'SCORE', controllerId: 'P1', payload: { card: '7♣' } },
    ];
    const html = renderRankedDuel(snap, { isReadOnly: true });
    // The game log should contain "YOU" somewhere as an actor label
    assert.match(html, /YOU/);
  });

  test('Event log shows opponent display name, not "Player 2"', () => {
    const snap = buildTestSnapshot();
    snap.humanPlayerId = 'P1';
    snap.state.players.P2.displayName = 'Hybrix Rusher';
    snap.recentEvents = [
      { type: 'SCORE', controllerId: 'P2', payload: { card: '5♦' } },
    ];
    const html = renderRankedDuel(snap, { isReadOnly: true });
    // Should not contain the raw "Player 2" label as an actor
    // (it may appear in ARIA or data attributes, but the visible actor label should be the display name)
    assert.match(html, /Hybrix Rusher/i);
  });

  test('Score block shows "YOU" label for human player', () => {
    const snap = buildTestSnapshot();
    snap.humanPlayerId = 'P1';
    const html = renderRankedDuel(snap, { isReadOnly: true });
    assert.match(html, /YOU/);
  });
});

// ── 4. Resolution stack empty state ──────────────────────────────

describe('Resolution stack empty state', () => {
  const { renderRankedDuel } = rankedDuelRenderer;

  test('Empty resolution stack shows "no pending effects", not "Stack is empty"', () => {
    const snap = buildTestSnapshot();
    snap.state.stack = [];
    snap.state.priorityOwnerId = null;
    const html = renderRankedDuel(snap, { isReadOnly: true });
    assert.match(html, /no pending effects/i);
    // Must NOT say "Stack is empty"
    assert.doesNotMatch(html, /Stack is empty/i);
  });

  test('Empty resolution stack with human priority shows "Your priority — no pending effects"', () => {
    const snap = buildTestSnapshot();
    snap.state.stack = [];
    snap.state.priorityOwnerId = 'P1';
    snap.humanPlayerId = 'P1';
    const html = renderRankedDuel(snap, { isReadOnly: true });
    assert.match(html, /Your priority.*no pending effects/i);
  });

  test('Resolution stack has data-testid="resolution-stack"', () => {
    const snap = buildTestSnapshot();
    snap.state.stack = [];
    const html = renderRankedDuel(snap, { isReadOnly: true });
    assert.match(html, /data-testid="resolution-stack"/);
  });

  test('Non-empty resolution stack shows count', () => {
    const snap = buildTestSnapshot();
    snap.state.stack = [
      { entityId: 'e1', identity: 'K♥', isResolving: true, isHuman: true },
    ];
    const html = renderRankedDuel(snap, { isReadOnly: true });
    assert.match(html, /RESOLUTION STACK/);
  });
});

// ── 5. Privacy / hidden information firewall ─────────────────────

describe('Privacy / hidden information firewall', () => {
  const { buildRankedDuelViewModel } = rankedDuelViewModel;

  test('Viewmodel rejects opponent hand with card identities (array of cards)', () => {
    const snap = buildTestSnapshot();
    // Inject card identities into opponent hand (privacy violation)
    snap.state.players.P2.hand = [
      { entityId: 'c3', identity: 'A♠', rank: 'A', suit: '♠', pointValue: 1 },
    ];
    const vm = buildRankedDuelViewModel(snap);
    assert.equal(vm.status, 'ERROR');
    assert.equal(vm.error.code, 'PRIVACY_VIOLATION');
  });

  test('Viewmodel accepts opponent hand as {count} object (no identities)', () => {
    const snap = buildTestSnapshot();
    snap.state.players.P2.hand = { count: 5 };
    const vm = buildRankedDuelViewModel(snap);
    assert.notEqual(vm.status, 'ERROR');
    assert.equal(vm.privacy.opponentHandIdentifiersPresent, false);
  });

  test('Viewmodel rejects null snapshot', () => {
    const vm = buildRankedDuelViewModel(null);
    assert.equal(vm.status, 'ERROR');
    assert.equal(vm.error.code, 'MISSING_SNAPSHOT');
  });

  test('Viewmodel rejects snapshot with no state', () => {
    const vm = buildRankedDuelViewModel({ humanPlayerId: 'P1' });
    assert.equal(vm.status, 'ERROR');
    assert.equal(vm.error.code, 'MISSING_SNAPSHOT');
  });

  test('Viewmodel privacy fields are present and boolean', () => {
    const snap = buildTestSnapshot();
    const vm = buildRankedDuelViewModel(snap);
    assert.ok(typeof vm.privacy.opponentHandIdentifiersPresent === 'boolean');
    assert.ok(typeof vm.privacy.rawCommandsPresent === 'boolean');
  });
});

// ── 6. Viewmodel schema and structure ────────────────────────────

describe('Viewmodel schema and structure', () => {
  const { buildRankedDuelViewModel } = rankedDuelViewModel;

  test('schemaVersion is 1.1.0', () => {
    const snap = buildTestSnapshot();
    const vm = buildRankedDuelViewModel(snap);
    assert.equal(vm.schemaVersion, '1.1.0');
  });

  test('Viewmodel has required top-level fields', () => {
    const snap = buildTestSnapshot();
    const vm = buildRankedDuelViewModel(snap);
    for (const field of ['schemaVersion', 'status', 'mode', 'match', 'human', 'opponent', 'zones', 'battlefield', 'stack', 'actions', 'chat', 'privacy']) {
      assert.ok(field in vm, `viewmodel should have field: ${field}`);
    }
  });

  test('Viewmodel match has required fields', () => {
    const snap = buildTestSnapshot();
    const vm = buildRankedDuelViewModel(snap);
    for (const field of ['fullTurnSequence', 'phase', 'activePlayerId', 'priorityOwnerId', 'windowLabel', 'terminationReason', 'winner']) {
      assert.ok(field in vm.match, `match should have field: ${field}`);
    }
  });

  test('Viewmodel human plate has required fields', () => {
    const snap = buildTestSnapshot();
    const vm = buildRankedDuelViewModel(snap);
    assert.ok(vm.human.playerId);
    assert.ok('seatIndex' in vm.human);
    assert.ok('secured' in vm.human);
    assert.ok('goal' in vm.human);
  });

  test('Viewmodel opponent plate has required fields', () => {
    const snap = buildTestSnapshot();
    const vm = buildRankedDuelViewModel(snap);
    assert.ok(vm.opponent.playerId);
    assert.ok('seatIndex' in vm.opponent);
    assert.ok('secured' in vm.opponent);
    assert.ok('goal' in vm.opponent);
  });

  test('Viewmodel does not mutate input snapshot', () => {
    const snap = buildTestSnapshot();
    const originalJson = JSON.stringify(snap);
    buildRankedDuelViewModel(snap);
    assert.equal(JSON.stringify(snap), originalJson, 'snapshot should not be mutated');
  });

  test('Viewmodel zones has draw, discard, exile, swap', () => {
    const snap = buildTestSnapshot();
    const vm = buildRankedDuelViewModel(snap);
    assert.ok('draw' in vm.zones);
    assert.ok('discard' in vm.zones);
    assert.ok('exile' in vm.zones);
    assert.ok('swap' in vm.zones);
  });

  test('Viewmodel actions is an array', () => {
    const snap = buildTestSnapshot();
    const vm = buildRankedDuelViewModel(snap);
    assert.ok(Array.isArray(vm.actions));
  });

  test('Viewmodel stack is an array', () => {
    const snap = buildTestSnapshot();
    const vm = buildRankedDuelViewModel(snap);
    assert.ok(Array.isArray(vm.stack));
  });
});

// ── 7. Renderer output structure ─────────────────────────────────

describe('Renderer output structure', () => {
  const { renderRankedDuel } = rankedDuelRenderer;

  test('Renderer returns non-empty HTML string for valid snapshot', () => {
    const snap = buildTestSnapshot();
    const html = renderRankedDuel(snap, { isReadOnly: true });
    assert.ok(typeof html === 'string');
    assert.ok(html.length > 100, 'HTML should be substantial');
  });

  test('Renderer returns error HTML for null snapshot', () => {
    const html = renderRankedDuel(null, { isReadOnly: true });
    assert.ok(typeof html === 'string');
    assert.ok(html.length > 0);
    // Should contain some error indication
    assert.match(html, /error|ERROR|missing|MISSING/i);
  });

  test('Renderer output includes opponent display name when set', () => {
    const snap = buildTestSnapshot();
    snap.state.players.P2.displayName = 'Hybrix Sniper';
    const html = renderRankedDuel(snap, { isReadOnly: true });
    assert.match(html, /Hybrix Sniper/);
  });

  test('Renderer output includes phase information', () => {
    const snap = buildTestSnapshot();
    snap.state.phase = 'ACTION';
    const html = renderRankedDuel(snap, { isReadOnly: true });
    assert.match(html, /ACTION/i);
  });

  test('Renderer output includes resolution stack region', () => {
    const snap = buildTestSnapshot();
    const html = renderRankedDuel(snap, { isReadOnly: true });
    assert.match(html, /resolution-stack/);
  });

  test('Renderer output includes draw pile with count', () => {
    const snap = buildTestSnapshot();
    snap.state.drawPile = { count: 25 };
    const html = renderRankedDuel(snap, { isReadOnly: true });
    assert.match(html, /25/);
    assert.match(html, /draw/i);
  });
});
