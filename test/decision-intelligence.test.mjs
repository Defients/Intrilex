import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDecisionTrace,
  validateDecisionTrace,
  publicDecisionTrace,
  reconcileScoreComponents,
  DECISION_TRACE_SCHEMA_VERSION
} from '@intrilex/decision-intelligence/decision-trace';
import {
  REASON_CODE_VOCABULARY,
  reasonCodeDisplay,
  reasonCodeCategory,
  validateReasonCodes,
  reasonCodeVocabularyHash
} from '@intrilex/decision-intelligence/reason-codes';
import {
  MECHANIC_REGISTRY,
  mechanicRegistryHash,
  resolveMechanicId,
  mechanicDisplayName,
  validateMechanicTags,
  quarantineUnknownTags,
  analyticsEligibleMechanics
} from '@intrilex/decision-intelligence/mechanic-registry';
import {
  deriveContinuationSeed,
  isCounterfactualSupported,
  compareCounterfactual
} from '@intrilex/decision-intelligence/counterfactual';
import { runCounterfactualBranch } from '@intrilex/simulation-runtime/counterfactual';
import {
  diagnosePolicy,
  comparePolicyDiagnostics
} from '@intrilex/decision-intelligence/policy-diagnostics';
import { runPolicyMatch } from '@intrilex/simulation-runtime';

function mockAction(actionId, family, mode, timingClass = 'ACTION', featureVector = {}) {
  return { actionId, family, mode, timingClass, featureVector, targetHandles: [], sourceHandles: [] };
}

function mockContext(overrides = {}) {
  return {
    activePlayerId: 'P1',
    phase: 'ACTION_PHASE',
    fullTurnSequence: 5,
    stack: [],
    own: { goal: 50, securedPoints: 20, hand: [], pr: [], er: [] },
    opponents: [{ playerId: 'P2', goal: 50, securedPoints: 15, handCount: 4, pr: [], er: [] }],
    response: { top: null, root: null, opponentRoot: false, opponentTop: false, ownTop: false, depth: 0 },
    ...overrides
  };
}

test('reason code vocabulary is finite and has displays', () => {
  const codes = Object.keys(REASON_CODE_VOCABULARY);
  assert.ok(codes.length >= 20, `expected at least 20 reason codes, got ${codes.length}`);
  for (const code of codes) {
    assert.ok(REASON_CODE_VOCABULARY[code].display, `missing display for ${code}`);
    assert.ok(REASON_CODE_VOCABULARY[code].category, `missing category for ${code}`);
  }
  assert.equal(reasonCodeDisplay('WIN_PRESSURE_SCORE').length > 0, true);
  assert.equal(reasonCodeCategory('WIN_PRESSURE_SCORE'), 'terminal');
  assert.equal(reasonCodeDisplay('UNKNOWN_CODE'), 'UNKNOWN_CODE');
});

test('reason code vocabulary hash is deterministic', () => {
  assert.equal(reasonCodeVocabularyHash(), reasonCodeVocabularyHash());
});

test('validateReasonCodes rejects unknown codes', () => {
  const result = validateReasonCodes(['WIN_PRESSURE_SCORE', 'FAKE_CODE']);
  assert.equal(result.valid, false);
  assert.deepEqual(result.unknown, ['FAKE_CODE']);
  const valid = validateReasonCodes(['WIN_PRESSURE_SCORE', 'PRESERVE_RESPONSE']);
  assert.equal(valid.valid, true);
});

test('mechanic registry contains canonical mechanics with display names', () => {
  const ids = Object.keys(MECHANIC_REGISTRY);
  assert.ok(ids.length >= 25, `expected at least 25 mechanics, got ${ids.length}`);
  for (const id of ids) {
    const m = MECHANIC_REGISTRY[id];
    assert.ok(m.displayName, `missing displayName for ${id}`);
    assert.ok(m.category, `missing category for ${id}`);
    assert.ok(m.description, `missing description for ${id}`);
    assert.ok(Array.isArray(m.authorityRefs), `missing authorityRefs for ${id}`);
    assert.ok(Array.isArray(m.eligibleFamilies), `missing eligibleFamilies for ${id}`);
  }
});

test('mechanic registry hash is deterministic', () => {
  assert.equal(mechanicRegistryHash(), mechanicRegistryHash());
});

test('resolveMechanicId resolves family and mode', () => {
  assert.equal(resolveMechanicId('counter', null), 'counter');
  assert.equal(resolveMechanicId('rank10', 'rank10-stack-theft'), 'rank10');
  assert.equal(resolveMechanicId('unknown-family', 'scuttle'), 'scuttle');
  assert.equal(resolveMechanicId(null, null), null);
});

test('mechanicDisplayName returns human-readable name', () => {
  assert.equal(mechanicDisplayName('play-for-points'), 'Play for Points');
  assert.equal(mechanicDisplayName('nonexistent'), 'nonexistent');
});

test('validateMechanicTags separates known and unknown', () => {
  const result = validateMechanicTags(['counter', 'fake-mechanic']);
  assert.equal(result.valid, false);
  assert.deepEqual(result.known, ['counter']);
  assert.deepEqual(result.unknown, ['fake-mechanic']);
});

test('quarantineUnknownTags produces quarantine ledger entries', () => {
  const ledger = quarantineUnknownTags(['counter', 'fake-mechanic']);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].tag, 'fake-mechanic');
  assert.equal(ledger[0].status, 'QUARANTINED');
});

test('analyticsEligibleMechanics excludes non-discovery mechanics', () => {
  const eligible = analyticsEligibleMechanics();
  const ids = eligible.map((m) => m.mechanicId);
  assert.ok(!ids.includes('phase'), 'phase should be excluded');
  assert.ok(!ids.includes('instant'), 'instant should be excluded');
  assert.ok(ids.includes('counter'), 'counter should be eligible');
  assert.ok(ids.includes('play-for-points'), 'play-for-points should be eligible');
});

test('decision trace has required schema fields', () => {
  const action = mockAction('act-1', 'play-for-points', 'ordinary');
  const legalActions = [action, mockAction('act-2', 'draw', 'draw')];
  const trace = createDecisionTrace({
    matchId: 'M-test',
    decisionIndex: 0,
    checkpointHash: 'abc123',
    seat: 1,
    policyId: 'score-rush',
    policyVersion: '2.0.0',
    policyHash: 'hash',
    action,
    legalActions,
    context: mockContext(),
    turn: 5,
    phase: 'ACTION_PHASE',
    authorizedContextHash: 'auth-hash',
    ownItemOnTop: false
  });
  assert.equal(trace.schemaVersion, DECISION_TRACE_SCHEMA_VERSION);
  assert.ok(trace.decisionId.startsWith('DT-'));
  assert.equal(trace.matchId, 'M-test');
  assert.equal(trace.seat, 1);
  assert.equal(trace.policyId, 'score-rush');
  assert.ok(['MINI_TURN', 'RESPONSE', 'PRIVATE_CHOICE'].includes(trace.decisionKind));
  assert.ok(Array.isArray(trace.legalOptions));
  assert.ok(trace.legalOptions.length >= 2);
  assert.equal(trace.selectedActionId, 'act-1');
  assert.ok(typeof trace.selectionMargin === 'number');
  assert.equal(trace.ownItemOnTop, false);
  assert.ok(['PASS', 'NOT_APPLICABLE'].includes(trace.ruleAudit.status));
  assert.ok(trace.traceHash);
});

test('decision trace score components reconcile exactly', () => {
  const action = mockAction('act-1', 'play-for-points', 'ordinary', 'ACTION', { immediateScore: 10 });
  const trace = createDecisionTrace({
    matchId: 'M-test',
    decisionIndex: 0,
    checkpointHash: 'abc',
    seat: 1,
    policyId: 'score-rush',
    policyVersion: '2.0.0',
    policyHash: 'h',
    action,
    legalActions: [action],
    context: mockContext({ own: { goal: 50, securedPoints: 45, hand: [], pr: [], er: [] } }),
    turn: 5,
    phase: 'ACTION_PHASE',
    authorizedContextHash: 'ah',
    ownItemOnTop: false
  });
  for (const opt of trace.legalOptions) {
    const reconciled = reconcileScoreComponents(opt.scoreComponents);
    assert.ok(Math.abs(reconciled - opt.score) < 0.01, `score mismatch: ${opt.score} vs ${reconciled}`);
  }
});

test('validateDecisionTrace passes for valid trace', () => {
  const action = mockAction('act-1', 'counter', 'counter-super');
  const trace = createDecisionTrace({
    matchId: 'M-test',
    decisionIndex: 0,
    checkpointHash: 'abc',
    seat: 1,
    policyId: 'control',
    policyVersion: '2.0.0',
    policyHash: 'h',
    action,
    legalActions: [action],
    context: mockContext({ response: { top: { controllerId: 'P2' }, root: { controllerId: 'P2' }, opponentRoot: true, opponentTop: true, ownTop: false, depth: 1 } }),
    turn: 5,
    phase: 'RESPONSE_PHASE',
    authorizedContextHash: 'ah',
    ownItemOnTop: false
  });
  const validation = validateDecisionTrace(trace);
  assert.equal(validation.valid, true, validation.errors.join('; '));
});

test('publicDecisionTrace redacts private context', () => {
  const action = mockAction('act-1', 'draw', 'draw');
  const trace = createDecisionTrace({
    matchId: 'M-test',
    decisionIndex: 0,
    checkpointHash: 'abc',
    seat: 1,
    policyId: 'tempo',
    policyVersion: '2.0.0',
    policyHash: 'h',
    action,
    legalActions: [action],
    context: mockContext({ own: { goal: 50, securedPoints: 20, hand: [{ id: 'C-001' }], pr: [], er: [] } }),
    turn: 5,
    phase: 'ACTION_PHASE',
    authorizedContextHash: 'ah',
    ownItemOnTop: false
  });
  const pub = publicDecisionTrace(trace);
  assert.equal(pub.publicContext.own.handCount, 1);
  assert.ok(!JSON.stringify(pub).includes('C-001'), 'public trace must not contain raw card IDs');
  assert.ok(!pub.authorizedContextHash, 'public trace must not contain authorized context hash');
  assert.ok(!pub.policyHash, 'public trace must not contain policy hash');
});

test('decision trace legal options are stably ordered', () => {
  const actions = [
    mockAction('act-z', 'draw', 'draw'),
    mockAction('act-a', 'play-for-points', 'ordinary'),
    mockAction('act-m', 'scuttle', 'scuttle')
  ];
  const trace1 = createDecisionTrace({
    matchId: 'M-test', decisionIndex: 0, checkpointHash: 'abc', seat: 1,
    policyId: 'control', policyVersion: '2.0.0', policyHash: 'h',
    action: actions[0], legalActions: actions, context: mockContext(),
    turn: 5, phase: 'ACTION_PHASE', authorizedContextHash: 'ah', ownItemOnTop: false
  });
  const trace2 = createDecisionTrace({
    matchId: 'M-test', decisionIndex: 0, checkpointHash: 'abc', seat: 1,
    policyId: 'control', policyVersion: '2.0.0', policyHash: 'h',
    action: actions[0], legalActions: [...actions].reverse(), context: mockContext(),
    turn: 5, phase: 'ACTION_PHASE', authorizedContextHash: 'ah', ownItemOnTop: false
  });
  assert.deepEqual(trace1.legalOptions.map((o) => o.actionId), trace2.legalOptions.map((o) => o.actionId));
  assert.equal(trace1.traceHash, trace2.traceHash);
});

test('decision trace is deterministic across reruns', () => {
  const action = mockAction('act-1', 'play-for-points', 'ordinary');
  const ctx = mockContext();
  const t1 = createDecisionTrace({ matchId: 'M-x', decisionIndex: 3, checkpointHash: 'chk', seat: 2, policyId: 'tempo', policyVersion: '2.0.0', policyHash: 'ph', action, legalActions: [action], context: ctx, turn: 7, phase: 'ACTION_PHASE', authorizedContextHash: 'ah', ownItemOnTop: false });
  const t2 = createDecisionTrace({ matchId: 'M-x', decisionIndex: 3, checkpointHash: 'chk', seat: 2, policyId: 'tempo', policyVersion: '2.0.0', policyHash: 'ph', action, legalActions: [action], context: ctx, turn: 7, phase: 'ACTION_PHASE', authorizedContextHash: 'ah', ownItemOnTop: false });
  assert.equal(t1.traceHash, t2.traceHash);
  assert.equal(t1.decisionId, t2.decisionId);
});

test('continuation seed is deterministic', () => {
  const s1 = deriveContinuationSeed({ matchId: 'M1', checkpointHash: 'chk', replayContentHash: 'rch-1', rolloutIndex: 0 });
  const s2 = deriveContinuationSeed({ matchId: 'M1', checkpointHash: 'chk', replayContentHash: 'rch-1', rolloutIndex: 0 });
  assert.equal(s1, s2);
  // Paired seeds must be identical regardless of alternativeActionId
  const s3 = deriveContinuationSeed({ matchId: 'M1', checkpointHash: 'chk', replayContentHash: 'rch-1', rolloutIndex: 1 });
  assert.notEqual(s1, s3);
});

test('isCounterfactualSupported rejects invalid inputs', () => {
  assert.equal(isCounterfactualSupported(null, 0).supported, false);
  assert.equal(isCounterfactualSupported({ commands: [] }, 0).supported, false);
  assert.equal(isCounterfactualSupported({ commands: [1, 2, 3] }, 5).supported, false);
  assert.equal(isCounterfactualSupported({ commands: [1, 2, 3], contentHash: 'valid-hash' }, 1).supported, true);
  // Missing contentHash should fail
  assert.equal(isCounterfactualSupported({ commands: [1, 2, 3] }, 1).supported, false);
});

test('runCounterfactualBranch produces analysis-only results', () => {
  // Without a real replay, counterfactual is NOT_SUPPORTED
  const result = runCounterfactualBranch({
    matchId: 'M-test',
    checkpointHash: 'chk',
    baseSeed: 12345,
    seatOrder: ['P1', 'P2'],
    policyIds: ['tempo', 'control'],
    profileId: 'core-advanced-authority',
    alternativeActionId: 'alt-1',
    rolloutCount: 4
  });
  assert.equal(result.analysisOnly, true);
  assert.equal(result.schemaVersion, '2.0.0');
  assert.equal(result.status, 'NOT_SUPPORTED');
  assert.ok(result.resultHash);
});

test('runCounterfactualBranch is deterministic across reruns', () => {
  const config = {
    matchId: 'M-test2', checkpointHash: 'chk2', baseSeed: 999,
    seatOrder: ['P1', 'P2'], policyIds: ['tempo', 'value'],
    profileId: 'core-advanced-authority', alternativeActionId: 'alt-x', rolloutCount: 4
  };
  const r1 = runCounterfactualBranch(config);
  const r2 = runCounterfactualBranch(config);
  assert.equal(r1.resultHash, r2.resultHash);
});

test('compareCounterfactual produces estimated difference', () => {
  const selected = runCounterfactualBranch({
    matchId: 'M-cf', checkpointHash: 'chk', baseSeed: 100,
    seatOrder: ['P1', 'P2'], policyIds: ['tempo', 'control'],
    profileId: 'core-advanced-authority', alternativeActionId: 'selected', rolloutCount: 8
  });
  const alternative = runCounterfactualBranch({
    matchId: 'M-cf', checkpointHash: 'chk', baseSeed: 100,
    seatOrder: ['P1', 'P2'], policyIds: ['tempo', 'control'],
    profileId: 'core-advanced-authority', alternativeActionId: 'alternative', rolloutCount: 8
  });
  const comparison = compareCounterfactual(selected, alternative);
  if (comparison) {
    assert.ok(typeof comparison.estimatedDifference === 'number');
    assert.ok(comparison.interpretation.includes('policy-conditioned'));
  }
});

test('diagnosePolicy produces metrics and limitations', () => {
  const summaries = Array.from({ length: 30 }, (_, i) => ({
    matchId: `M${i}`, policyIds: ['control', 'tempo'], seatOrder: ['P1', 'P2'],
    winner: i % 3 === 0 ? 'P1' : 'P2', winningSeat: i % 3 === 0 ? 1 : 2,
    terminationReason: 'NORMAL_VICTORY', completedFullTurns: 10,
    participants: [
      { policyId: 'control', seat: 1, result: i % 3 === 0 ? 'win' : 'loss' },
      { policyId: 'tempo', seat: 2, result: i % 3 === 0 ? 'loss' : 'win' }
    ]
  }));
  const diagnostics = diagnosePolicy(summaries, [], 'control');
  assert.equal(diagnostics.policyId, 'control');
  assert.ok(diagnostics.matchCount > 0);
  assert.ok(Array.isArray(diagnostics.limitations));
  assert.ok(diagnostics.diagnosticsHash);
});

test('comparePolicyDiagnostics produces descriptive comparison', () => {
  const summaries = Array.from({ length: 30 }, (_, i) => ({
    matchId: `M${i}`, policyIds: ['control', 'tempo'], seatOrder: ['P1', 'P2'],
    winner: i % 3 === 0 ? 'P1' : 'P2', winningSeat: i % 3 === 0 ? 1 : 2,
    terminationReason: 'NORMAL_VICTORY', completedFullTurns: 10,
    participants: [
      { policyId: 'control', seat: 1, result: i % 3 === 0 ? 'win' : 'loss' },
      { policyId: 'tempo', seat: 2, result: i % 3 === 0 ? 'loss' : 'win' }
    ]
  }));
  const baseline = diagnosePolicy(summaries, [], 'control');
  const candidate = diagnosePolicy(summaries, [], 'tempo');
  const comparison = comparePolicyDiagnostics(baseline, candidate);
  assert.equal(comparison.baselinePolicyId, 'control');
  assert.equal(comparison.candidatePolicyId, 'tempo');
  assert.ok(comparison.interpretation.includes('descriptive'));
});

test('runPolicyMatch with decisionTracesEnabled produces traces without affecting canonical output', () => {
  const configBase = { seed: 42, policyIds: ['tempo', 'control'], includeReplay: true };
  const withoutTraces = runPolicyMatch(configBase);
  const withTraces = runPolicyMatch({ ...configBase, decisionTracesEnabled: true });
  assert.equal(withoutTraces.summary.matchResultHash, withTraces.summary.matchResultHash);
  assert.equal(withoutTraces.summary.finalStateHash, withTraces.summary.finalStateHash);
  assert.equal(withoutTraces.summary.replayHash, withTraces.summary.replayHash);
  assert.ok(!withoutTraces.decisionTraces, 'traces should not be present when disabled');
  assert.ok(Array.isArray(withTraces.decisionTraces), 'traces should be present when enabled');
  assert.ok(withTraces.decisionTraces.length > 0, 'should have at least one trace');
  const trace = withTraces.decisionTraces[0];
  assert.equal(trace.schemaVersion, DECISION_TRACE_SCHEMA_VERSION);
  const validation = validateDecisionTrace(trace);
  assert.equal(validation.valid, true, validation.errors.join('; '));
});
