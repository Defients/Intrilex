// Regression test: score formatting and selected-card flow
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBoard } from '../apps/lab-web/src/play/ranked-duel-renderer.mjs';

function makeMockSnapshot(opts = {}) {
  const humanScore = opts.humanScore ?? 0;
  const oppScore = opts.oppScore ?? 0;
  const goal = opts.goal ?? 21;
  return {
    schemaVersion: '1.0.0',
    sessionId: 'test',
    status: 'HUMAN_DECISION',
    human: { playerId: 'P1', seat: 1 },
    opponent: { displayName: 'AI', policyId: 'random-legal', archetype: '', difficulty: '' },
    match: { fullTurnSequence: 1, phase: 'ACTION', activePlayerId: 'P1', winner: null, terminationReason: null },
    decision: {
      actorId: 'P1', kind: 'mini-turn', stateRevision: 1, frameHash: 'abc',
      legalActions: [
        { actionId: 'a1', family: 'score', mode: 'points', sourceHandles: ['C1'], timingClass: 'ACTION' },
        { actionId: 'a2', family: 'play-for-points', mode: 'ordinary', sourceHandles: ['C1'], timingClass: 'ACTION' },
      ],
      isHuman: true,
    },
    playerView: {
      schemaVersion: '4.0.0', actorId: 'P1', activePlayerId: 'P1', phase: 'ACTION',
      fullTurnSequence: 1, dpCount: 40, gyCount: 0, exileCount: 0, swapBar: [], stack: [],
      priority: { ownerId: 'P1', windowLabel: '' },
      own: {
        goal, securedPoints: humanScore,
        hand: [{ id: 'C1', identity: '6♥', controllerId: 'P1', zone: 'hand', pointValue: 6 }],
        pr: [], er: [], limits: {},
      },
      opponents: [{ playerId: 'P2', goal, securedPoints: oppScore, handCount: 5, pr: [], er: [] }],
    },
    recentEvents: [],
  };
}

// ── Score Rail tests (v0.25: score moved from profiles to Score Rail) ──

test('Score Rail: rendered with data-testid score-rail', () => {
  const html = renderBoard(makeMockSnapshot(), {});
  assert.ok(html.includes('data-testid="score-rail"'), 'Score Rail should be rendered');
  assert.ok(html.includes('data-testid="score-rail-inner"'), 'Score Rail inner should be rendered');
});

test('Score Rail: OPP cell on top, YOU cell on bottom', () => {
  const html = renderBoard(makeMockSnapshot(), {});
  const oppIdx = html.indexOf('rd-score-cell opp');
  const youIdx = html.indexOf('rd-score-cell you');
  assert.ok(oppIdx >= 0, 'OPP score cell should exist');
  assert.ok(youIdx >= 0, 'YOU score cell should exist');
  assert.ok(oppIdx < youIdx, 'OPP cell should appear before YOU cell in DOM');
});

test('Score Rail: renders current/goal correctly (not 0/0/21)', () => {
  const html = renderBoard(makeMockSnapshot({ humanScore: 0, oppScore: 0, goal: 21 }), {});
  assert.ok(!html.match(/0\/0\/21/), 'Must NOT render 0/0/21');
  // Score Rail should have data-score="0" and data-goal="21"
  assert.ok(html.includes('data-score="0"'), 'Score data attribute should be 0');
  assert.ok(html.includes('data-goal="21"'), 'Goal data attribute should be 21');
});

test('Score Rail: renders 14/21 correctly', () => {
  const html = renderBoard(makeMockSnapshot({ humanScore: 14, goal: 21 }), {});
  assert.ok(html.includes('data-score="14"'), 'Score should be 14');
  assert.ok(html.includes('data-goal="21"'), 'Goal should be 21');
  assert.ok(!html.match(/14\/14\/21/), 'Must NOT render 14/14/21');
});

test('Score Rail: renders 5/21 and 3/21 for both players', () => {
  const html = renderBoard(makeMockSnapshot({ humanScore: 5, oppScore: 3, goal: 21 }), {});
  // Should have both scores in the rail
  assert.ok(html.includes('data-score="5"'), 'Human score 5 should be present');
  assert.ok(html.includes('data-score="3"'), 'Opponent score 3 should be present');
  assert.ok(!html.match(/5\/5\/21/), 'Must NOT render 5/5/21');
  assert.ok(!html.match(/3\/3\/21/), 'Must NOT render 3/3/21');
});

test('Score Rail: score cell has bg placeholder for future prestige', () => {
  const html = renderBoard(makeMockSnapshot(), {});
  assert.ok(html.includes('rd-score-cell-bg'), 'Score cell bg placeholder should exist');
});

test('Score Rail: labels are OPP and YOU', () => {
  const html = renderBoard(makeMockSnapshot(), {});
  assert.ok(html.includes('>OPP<'), 'OPP label should be present');
  assert.ok(html.includes('>YOU<'), 'YOU label should be present');
});

// ── Profile score removal tests ──

test('Profile: prestige banner does NOT contain score', () => {
  const html = renderBoard(makeMockSnapshot(), {});
  assert.ok(!html.includes('rd-prestige-banner-score'), 'Prestige banner should NOT have score');
  assert.ok(!html.includes('rd-prestige-banner-goal'), 'Prestige banner should NOT have goal');
});

test('Profile: opponent profile does NOT contain rd-profile-score', () => {
  const html = renderBoard(makeMockSnapshot(), {});
  assert.ok(!html.includes('rd-profile-score'), 'Profile should NOT have rd-profile-score');
  assert.ok(!html.includes('rd-profile-secured'), 'Profile should NOT have rd-profile-secured');
});

test('Profile: player plate does NOT contain score', () => {
  const html = renderBoard(makeMockSnapshot(), {});
  assert.ok(!html.includes('rd-plate-score'), 'Plate should NOT have score');
  assert.ok(!html.includes('rd-plate-secured'), 'Plate should NOT have secured');
});

// ── Active Stage tests ──

test('Stage: shows card identity (6♥) not generic "Selected"', () => {
  const html = renderBoard(makeMockSnapshot(), { selectedSourceCardId: 'C1' });
  assert.ok(html.includes('6♥'), 'Stage should show card identity 6♥');
  const stageCardMatch = html.match(/rd-stage-card-inner[^>]*>([^<]+)</);
  assert.ok(stageCardMatch, 'Stage card inner should exist');
  assert.equal(stageCardMatch[1].trim(), '6♥', 'Stage card should show 6♥, not "Selected"');
});

test('Stage: cancel-selection button present when card selected', () => {
  const html = renderBoard(makeMockSnapshot(), { selectedSourceCardId: 'C1' });
  assert.ok(html.includes('data-action="cancel-selection"'), 'Cancel selection button should be present');
});

test('Stage: no cancel-selection button when no card selected', () => {
  const html = renderBoard(makeMockSnapshot(), {});
  assert.ok(!html.includes('data-action="cancel-selection"'), 'Cancel selection button should NOT be present');
});

test('Stage: no scoreline in board context (score moved to Score Rail)', () => {
  const html = renderBoard(makeMockSnapshot({ humanScore: 5, oppScore: 3, goal: 21 }), {});
  assert.ok(!html.includes('rd-stage-scoreline'), 'Stage should NOT have scoreline (moved to Score Rail)');
});

// ── Actions tests ──

test('Actions: group buttons present when card selected', () => {
  const html = renderBoard(makeMockSnapshot(), { selectedSourceCardId: 'C1' });
  assert.ok(html.includes('rd-group-btn'), 'Group buttons should be present');
  assert.ok(!html.includes('awaiting-selection'), 'Should not show awaiting-selection');
});

test('Actions: available (non-disabled) buttons exist when card matches source', () => {
  const html = renderBoard(makeMockSnapshot(), { selectedSourceCardId: 'C1' });
  assert.ok(html.includes('rd-group-btn') && html.includes('available'),
    'Should have available group buttons for selected card');
});
