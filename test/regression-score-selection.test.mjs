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

test('Stage: no cancel-selection button when no card selected', () => {
  const html = renderBoard(makeMockSnapshot(), {});
  assert.ok(!html.includes('data-action="cancel-selection"'), 'Cancel selection button should NOT be present');
});

test('Stage: no scoreline in board context (score moved to Score Rail)', () => {
  const html = renderBoard(makeMockSnapshot({ humanScore: 5, oppScore: 3, goal: 21 }), {});
  assert.ok(!html.includes('rd-stage-scoreline'), 'Stage should NOT have scoreline (moved to Score Rail)');
});
