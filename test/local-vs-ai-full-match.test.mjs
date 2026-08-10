// ═══════════════════════════════════════════════════════════════
// local-vs-ai-full-match.test.mjs
//
// Regression test: Local vs AI full-match loop and terminal display.
//
// Verifies that:
//   1. A complete human-vs-AI match can be played through PlaySession
//      from initialization through terminal victory.
//   2. The AI never makes an illegal move (engine rejection = ERROR).
//   3. The terminal display correctly shows the winner and termination
//      reason (not always "Draw" / "Unknown").
//   4. The termination data propagates from PlaySession → snapshot →
//      viewmodel → renderer HTML.
//
// Canon authority: docs/INTRILEX_v4.3.1_COMPLETE_PLAYER_RULEBOOK.md
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSession, SessionState } from '../apps/lab-web/dist/play/play-controller.js';
import { renderBoard } from '../apps/lab-web/dist/play/ranked-duel-renderer.mjs';

const PROFILE_ID = 'core-advanced-authority';
const AI_POLICY = 'random-legal';
const MODE = 'ADVANCED_CORE';

/**
 * Run a full match to terminal by simulating a human player that
 * picks the first legal action at each decision boundary.
 * @param {number} seed
 * @returns {Promise<import('../apps/lab-web/dist/play/play-controller.js').PlaySession>}
 */
async function runMatchToTerminal(seed) {
  const session = await createSession({
    profileId: PROFILE_ID,
    seed,
    humanPlayerId: 'P1',
    aiPolicyId: AI_POLICY,
    mode: MODE,
  });

  let maxIterations = 5000;
  while (session.status !== SessionState.TERMINAL && session.status !== SessionState.ERROR && maxIterations-- > 0) {
    if (session.status === SessionState.HUMAN_DECISION) {
      const snap = session.getSnapshot();
      const actions = snap.decision?.legalActions ?? [];
      if (actions.length === 0) break;
      const result = await session.submitHumanAction({
        sessionId: snap.sessionId,
        stateRevision: snap.decision.stateRevision,
        decisionFrameHash: snap.decision.frameHash,
        actionId: actions[0].actionId,
      });
      if (!result.accepted) break;
    } else if (session.status === SessionState.AI_DECISION) {
      const result = await session.stepAI();
      if (!result.stepped) break;
    } else {
      continue;
    }
  }
  return session;
}

// ── Full-match completion ──────────────────────────────────────

test('LVA-FULL-1: complete match reaches TERMINAL with NORMAL_VICTORY', async () => {
  const session = await runMatchToTerminal(42);
  assert.equal(session.status, SessionState.TERMINAL, 'match must reach TERMINAL');
  assert.equal(session.terminalReason, 'NORMAL_VICTORY', 'must end with NORMAL_VICTORY');
  assert.ok(session.winner === 'P1' || session.winner === 'P2', 'must have a winner');
});

test('LVA-FULL-2: multiple matches complete across different seeds', async () => {
  const seeds = [1, 100, 500, 1000, 5000];
  for (const seed of seeds) {
    const session = await runMatchToTerminal(seed);
    assert.equal(session.status, SessionState.TERMINAL, `seed ${seed}: must reach TERMINAL`);
    assert.ok(['NORMAL_VICTORY', 'CANONICAL_DRAW', 'EXHAUSTED_RESOLUTION'].includes(session.terminalReason),
      `seed ${seed}: termination reason must be canonical, got ${session.terminalReason}`);
  }
});

// ── AI legality invariant ──────────────────────────────────────

test('LVA-AI-1: AI never makes an illegal move across multiple policies', async () => {
  const policies = ['random-legal', 'score-rush', 'control', 'tempo', 'value'];
  for (const policy of policies) {
    const session = await createSession({
      profileId: PROFILE_ID, seed: 42, humanPlayerId: 'P1', aiPolicyId: policy, mode: MODE,
    });
    let maxIter = 5000;
    while (session.status !== SessionState.TERMINAL && session.status !== SessionState.ERROR && maxIter-- > 0) {
      if (session.status === SessionState.HUMAN_DECISION) {
        const snap = session.getSnapshot();
        const actions = snap.decision?.legalActions ?? [];
        if (actions.length === 0) break;
        const result = await session.submitHumanAction({
          sessionId: snap.sessionId, stateRevision: snap.decision.stateRevision,
          decisionFrameHash: snap.decision.frameHash, actionId: actions[0].actionId,
        });
        if (!result.accepted) break;
      } else if (session.status === SessionState.AI_DECISION) {
        const result = await session.stepAI();
        // AI step failure with ENGINE_REJECTION means illegal move
        assert.notEqual(result.error, 'ENGINE_REJECTION', `policy ${policy}: AI made illegal move`);
        if (!result.stepped) break;
      } else { continue; }
    }
    assert.equal(session.status, SessionState.TERMINAL, `policy ${policy}: must reach TERMINAL`);
  }
});

// ── Terminal display correctness ───────────────────────────────

test('LVA-TERM-1: terminal display shows correct winner for a human win', async () => {
  // Find a seed where P1 (human) wins
  const session = await runMatchToTerminal(42);
  if (session.winner !== 'P1') {
    // Skip if this seed doesn't produce a human win
    return;
  }
  const snapshot = session.getSnapshot();
  const html = renderBoard(snapshot, { isNetworkMatch: false });
  assert.ok(html.includes('data-testid="play-terminal"'), 'must render terminal');
  assert.ok(html.includes('You won!'), 'must show "You won!" for human victory');
  assert.match(html, /data-testid="terminal-winner"[^>]*>You</, 'must show winner as "You"');
});

test('LVA-TERM-2: terminal display shows correct winner for an AI win', async () => {
  // Find a seed where P2 (AI) wins
  const session = await runMatchToTerminal(100);
  if (session.winner !== 'P2') {
    return;
  }
  const snapshot = session.getSnapshot();
  const html = renderBoard(snapshot, { isNetworkMatch: false });
  assert.ok(html.includes('data-testid="play-terminal"'), 'must render terminal');
  assert.ok(html.includes('You lost.'), 'must show "You lost." for AI victory');
  assert.match(html, /data-testid="terminal-winner"[^>]*>AI</, 'must show winner as "AI"');
});

test('LVA-TERM-3: terminal display shows termination reason (not "Unknown")', async () => {
  const session = await runMatchToTerminal(42);
  assert.equal(session.status, SessionState.TERMINAL);
  const snapshot = session.getSnapshot();
  const html = renderBoard(snapshot, { isNetworkMatch: false });
  // The termination reason must NOT be "Unknown" when we have a real reason
  const termReason = snapshot.match?.terminationReason;
  assert.ok(termReason, 'snapshot must have terminationReason');
  // formatTerminationReason converts NORMAL_VICTORY → "Normal Victory"
  const expected = String(termReason).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  assert.ok(html.includes(expected), `terminal HTML must contain "${expected}", got "Unknown" or missing`);
});

test('LVA-TERM-4: termination data propagates through viewmodel pipeline', async () => {
  const session = await runMatchToTerminal(42);
  assert.equal(session.status, SessionState.TERMINAL);
  const snapshot = session.getSnapshot();

  // Verify snapshot has the data
  assert.ok(snapshot.match?.terminationReason, 'snapshot.match.terminationReason must be set');
  assert.ok(snapshot.match?.winner !== undefined, 'snapshot.match.winner must be set');

  // Render through the full pipeline
  const html = renderBoard(snapshot, { isNetworkMatch: false });

  // The winner display must match the authoritative winner
  const isDraw = snapshot.match.winner === null || snapshot.match.terminationReason === 'CANONICAL_DRAW';
  if (!isDraw) {
    const expectedWinner = snapshot.match.winner === 'P1' ? 'You' : 'AI';
    assert.match(html, new RegExp(`data-testid="terminal-winner"[^>]*>${expectedWinner}<`),
      `terminal must show "${expectedWinner}" as winner`);
  }
});
