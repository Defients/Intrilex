// ═══════════════════════════════════════════════════════════════
// v2.5-match-ui-behavioral.test.mjs
//
// Behavioral tests for the v2.5 Match UI:
//   1. AI opponent identity (aiDisplayNameFromPolicyId, aiDifficultyLabelFromPolicyId)
//   5. Privacy/hidden information firewall (viewmodel rejects opponent hand)
//   6. Viewmodel schema and structure
//   7. Renderer output structure (terminal/error rendering)
//
// NOTE: Active match play is now rendered by the Astra React board
// (client/mount.tsx), tested by test/astra-client.test.mjs. The classic
// active-board renderer (renderMatch and helpers) has been removed from
// ranked-duel-renderer.mjs, which now only renders TERMINAL and ERROR
// screens. The former behavioral sections for draw pile depletion tiers
// (2), event log actor labels (3), and resolution stack empty state (4)
// asserted on active-board DOM produced by renderRankedDuel with ACTIVE
// snapshots (which now returns '') and have been removed.
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
  const _opponentPlayerId = humanPlayerId === 'P1' ? 'P2' : 'P1';
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

// ── 7. Renderer output structure (terminal/error) ────────────────

describe('Renderer output structure', () => {
  const { renderRankedDuel } = rankedDuelRenderer;

  test('Renderer returns error HTML for null snapshot', () => {
    const html = renderRankedDuel(null, { isReadOnly: true });
    assert.ok(typeof html === 'string');
    assert.ok(html.length > 0);
    // Should contain some error indication
    assert.match(html, /error|ERROR|missing|MISSING/i);
  });
});
