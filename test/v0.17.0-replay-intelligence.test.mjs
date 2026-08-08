// V0.17.0 Phase 6 — Replay and intelligence tests
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDecisionEvidence,
  buildCheckpoints,
  buildMatchSummary,
  buildHistoryEntry,
  buildTraceEntry,
} from '../apps/lab-web/src/play/intelligence/decision-evidence.js';

// ─── Decision Evidence Tests ────────────────────────────────────

test('buildDecisionEvidence: empty journal returns empty', () => {
  const session = { decisionJournal: [] };
  const evidence = buildDecisionEvidence(session);
  assert.deepEqual(evidence, []);
});

test('buildDecisionEvidence: builds evidence for each decision', () => {
  const session = {
    decisionJournal: [
      {
        decisionId: 'd1',
        actorId: 'P1',
        kind: 'PROACTIVE',
        phase: 'MAIN',
        fullTurnSequence: 0,
        legalActions: [{ actionId: 'a1', family: 'draw' }, { actionId: 'a2', family: 'score' }],
        chosenActionId: 'a1',
        chosenActionFamily: 'draw',
        chosenActionLabel: 'Draw',
        stateRevision: 1,
        frameHash: 'hash1',
      },
      {
        decisionId: 'd2',
        actorId: 'P2',
        kind: 'REACTIVE',
        legalActions: [{ actionId: 'a3', family: 'pass' }],
        chosenActionId: 'a3',
        chosenActionFamily: 'pass',
        chosenActionLabel: 'Pass',
        stateRevision: 2,
      },
    ],
  };
  const evidence = buildDecisionEvidence(session);
  assert.equal(evidence.length, 2);
  assert.equal(evidence[0].index, 1);
  assert.equal(evidence[0].actorLabel, 'Player 1');
  assert.equal(evidence[0].kindLabel, 'Proactive');
  assert.equal(evidence[0].chosenActionFamily, 'draw');
  assert.equal(evidence[0].legalActionCount, 2);
  assert.deepEqual(evidence[0].legalActionFamilies, ['draw', 'score']);
  assert.equal(evidence[1].index, 2);
  assert.equal(evidence[1].actorLabel, 'Player 2');
});

test('buildDecisionEvidence: includes legal action summaries', () => {
  const session = {
    decisionJournal: [{
      actorId: 'P1',
      kind: 'PROACTIVE',
      legalActions: [
        { actionId: 'a1', family: 'draw', shortLabel: 'Draw', isResponse: false },
        { actionId: 'a2', family: 'counter', shortLabel: 'Counter', isResponse: true, isSuper: false },
      ],
    }],
  };
  const evidence = buildDecisionEvidence(session);
  assert.ok(evidence[0].legalActions);
  assert.equal(evidence[0].legalActions.length, 2);
  assert.equal(evidence[0].legalActions[0].family, 'draw');
  assert.equal(evidence[0].legalActions[1].isResponse, true);
});

test('buildDecisionEvidence: includes Rank Anatomy links when requested', () => {
  const session = {
    decisionJournal: [{
      actorId: 'P1',
      kind: 'PROACTIVE',
      chosenActionFamily: 'score',
    }],
  };
  const evidence = buildDecisionEvidence(session, { includeRankAnatomy: true });
  assert.ok(evidence[0].rankAnatomyLinks);
  assert.ok(evidence[0].rankAnatomyLinks.length > 0);
  assert.ok(evidence[0].rankAnatomyLinks[0].url.startsWith('#/ranks/'));
});

test('buildDecisionEvidence: Rank Anatomy links for counter actions', () => {
  const session = {
    decisionJournal: [{
      actorId: 'P2',
      kind: 'COUNTER',
      chosenActionFamily: 'counter',
    }],
  };
  const evidence = buildDecisionEvidence(session, { includeRankAnatomy: true });
  const links = evidence[0].rankAnatomyLinks;
  assert.ok(links.some(l => l.conceptId === 'stack-interaction'));
  assert.ok(links.some(l => l.conceptId === 'stack-resolution'));
});

test('buildDecisionEvidence: Rank Anatomy links for response actions', () => {
  const session = {
    decisionJournal: [{
      actorId: 'P2',
      kind: 'RESPONSE',
      chosenActionFamily: 'pass',
    }],
  };
  const evidence = buildDecisionEvidence(session, { includeRankAnatomy: true });
  const links = evidence[0].rankAnatomyLinks;
  assert.ok(links.some(l => l.conceptId === 'tempo-management'));
  assert.ok(links.some(l => l.conceptId === 'stack-resolution'));
});

// ─── Checkpoint Tests ───────────────────────────────────────────

test('buildCheckpoints: builds checkpoint for each decision', () => {
  const session = {
    decisionJournal: [
      { actorId: 'P1', kind: 'PROACTIVE', fullTurnSequence: 0, chosenActionLabel: 'Draw' },
      { actorId: 'P2', kind: 'REACTIVE', fullTurnSequence: 0, chosenActionLabel: 'Pass' },
      { actorId: 'P1', kind: 'PROACTIVE', fullTurnSequence: 1, chosenActionLabel: 'Score' },
    ],
  };
  const checkpoints = buildCheckpoints(session);
  assert.equal(checkpoints.length, 3);
  assert.equal(checkpoints[0].checkpointId, 'cp-1');
  assert.equal(checkpoints[0].decisionIndex, 0);
  assert.equal(checkpoints[0].actorLabel, 'Player 1');
  assert.equal(checkpoints[1].actorLabel, 'Player 2');
  assert.equal(checkpoints[2].turn, 1);
});

test('buildCheckpoints: empty journal returns empty', () => {
  assert.deepEqual(buildCheckpoints({ decisionJournal: [] }), []);
});

// ─── Match Summary Tests ────────────────────────────────────────

test('buildMatchSummary: builds summary from session', () => {
  const session = {
    sessionId: 'S1',
    setup: {
      profileId: 'first-contact-trigger-closure',
      seed: 12345,
      aiPolicyId: 'hybrix-defender-easy',
      aiArchetype: 'defender',
      aiDifficulty: 'easy',
      mode: 'TUTORIAL',
      humanPlayerId: 'P1',
    },
    match: {
      winner: 'P1',
      terminationReason: 'GOAL_REACHED',
      fullTurnSequence: 12,
    },
    decisionJournal: [
      { actorId: 'P1' },
      { actorId: 'P2' },
      { actorId: 'P1' },
    ],
    startedAt: '2025-01-01T00:00:00Z',
    completedAt: '2025-01-01T00:30:00Z',
  };
  const summary = buildMatchSummary(session);
  assert.equal(summary.sessionId, 'S1');
  assert.equal(summary.profileId, 'first-contact-trigger-closure');
  assert.equal(summary.seed, 12345);
  assert.equal(summary.winner, 'P1');
  assert.equal(summary.fullTurns, 12);
  assert.equal(summary.decisionCount, 3);
  assert.equal(summary.humanDecisionCount, 2);
  assert.equal(summary.aiDecisionCount, 1);
});

test('buildMatchSummary: handles missing fields', () => {
  const summary = buildMatchSummary({});
  assert.equal(summary.sessionId, null);
  assert.equal(summary.decisionCount, 0);
});

// ─── History Entry Tests ────────────────────────────────────────

test('buildHistoryEntry: builds public history entry', () => {
  const session = {
    sessionId: 'S1',
    setup: { profileId: 'p1', seed: 1, humanPlayerId: 'P1' },
    match: { winner: 'P1', fullTurnSequence: 5 },
    decisionJournal: [{ actorId: 'P1' }, { actorId: 'P2' }],
  };
  const entry = buildHistoryEntry(session);
  assert.equal(entry.type, 'match-history');
  assert.equal(entry.version, 1);
  assert.equal(entry.sessionId, 'S1');
  assert.equal(entry.winner, 'P1');
});

test('buildHistoryEntry: does not contain private card information', () => {
  const session = {
    sessionId: 'S1',
    setup: { profileId: 'p1', seed: 1 },
    match: {},
    decisionJournal: [],
  };
  const entry = buildHistoryEntry(session);
  // History entries should not have card IDs, hand contents, etc.
  assert.ok(!entry.cards);
  assert.ok(!entry.hand);
  assert.ok(!entry.privateData);
});

// ─── Trace Entry Tests ──────────────────────────────────────────

test('buildTraceEntry: builds decision trace', () => {
  const session = {
    sessionId: 'S1',
    decisionJournal: [
      { actorId: 'P1', kind: 'PROACTIVE', fullTurnSequence: 0, chosenActionLabel: 'Draw' },
      { actorId: 'P2', kind: 'REACTIVE', fullTurnSequence: 0, chosenActionLabel: 'Pass' },
    ],
  };
  const trace = buildTraceEntry(session);
  assert.equal(trace.type, 'decision-trace');
  assert.equal(trace.version, 1);
  assert.equal(trace.sessionId, 'S1');
  assert.equal(trace.checkpointCount, 2);
  assert.equal(trace.checkpoints[0].actor, 'Player 1');
  assert.equal(trace.checkpoints[0].action, 'Draw');
  assert.equal(trace.checkpoints[1].actor, 'Player 2');
});

test('buildTraceEntry: does not contain private information', () => {
  const session = {
    sessionId: 'S1',
    decisionJournal: [{ actorId: 'P1', kind: 'PROACTIVE', chosenActionLabel: 'Draw' }],
  };
  const trace = buildTraceEntry(session);
  assert.ok(!trace.cards);
  assert.ok(!trace.hand);
  assert.ok(!trace.privateData);
  // Checkpoints should only have structural metadata
  for (const cp of trace.checkpoints) {
    assert.ok(!cp.cardId);
    assert.ok(!cp.handContents);
  }
});

// ─── Conservation Tests ─────────────────────────────────────────

test('CONSERVATION: decision evidence never invents outcomes', () => {
  const session = {
    decisionJournal: [{
      actorId: 'P1',
      kind: 'PROACTIVE',
      chosenActionFamily: 'draw',
      outcome: null, // No outcome recorded
    }],
  };
  const evidence = buildDecisionEvidence(session);
  assert.equal(evidence[0].outcome, null); // Must not invent an outcome
});

test('CONSERVATION: Rank Anatomy links are references, not claims', () => {
  const session = {
    decisionJournal: [{
      actorId: 'P1',
      kind: 'PROACTIVE',
      chosenActionFamily: 'score',
    }],
  };
  const evidence = buildDecisionEvidence(session, { includeRankAnatomy: true });
  for (const link of evidence[0].rankAnatomyLinks) {
    // Links should be URLs, not claims about the decision
    assert.ok(link.url.startsWith('#/ranks/'));
    assert.ok(!link.claim);
    assert.ok(!link.assertion);
  }
});

test('CONSERVATION: history and trace entries have no private data', () => {
  const session = {
    sessionId: 'S1',
    setup: { profileId: 'p1', seed: 1, humanPlayerId: 'P1' },
    match: { winner: 'P1' },
    decisionJournal: [{ actorId: 'P1', kind: 'PROACTIVE', chosenActionLabel: 'Draw' }],
  };
  const history = buildHistoryEntry(session);
  const trace = buildTraceEntry(session);

  // Neither should contain card IDs or hand contents
  const historyStr = JSON.stringify(history);
  const traceStr = JSON.stringify(trace);
  assert.ok(!historyStr.includes('cardId'));
  assert.ok(!historyStr.includes('handContents'));
  assert.ok(!traceStr.includes('cardId'));
  assert.ok(!traceStr.includes('handContents'));
});
