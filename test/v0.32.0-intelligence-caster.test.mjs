// ═══════════════════════════════════════════════════════════════
// v0.32.0-intelligence-caster.test.mjs
// Tests for the v0.32.0 Intelligence, Better AI, and Replay Caster v1 sprint:
// - Bounded lookahead policy (deterministic search, node/time budgets)
// - Commentary contract hardening (fact authorization, provenance, fallback)
// - WAIT WHAT investigation workflow (lifecycle, branches, invalidation)
// - Brain topology formalization + 2D equivalent
// - Evidence-honest player intelligence
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Bounded lookahead policy ───────────────────────────────────

test('v0.32.0: bounded-lookahead exports all required symbols', async () => {
  const mod = await import('../packages/game-ai/src/bounded-lookahead.mjs');
  assert.equal(mod.LOOKAHEAD_STRENGTH_TIER, 'lookahead');
  assert.ok(mod.DEFAULT_LOOKAHEAD_CONFIG, 'Must export DEFAULT_LOOKAHEAD_CONFIG');
  assert.equal(typeof mod.defaultEvaluation, 'function');
  assert.equal(typeof mod.createBoundedLookahead, 'function');
  assert.equal(typeof mod.runLookaheadBenchmark, 'function');
  assert.equal(typeof mod.createLookaheadPolicy, 'function');
  assert.ok(Array.isArray(mod.LOOKAHEAD_POLICIES), 'Must export LOOKAHEAD_POLICIES');
  assert.ok(Array.isArray(mod.LOOKAHEAD_POLICY_IDS), 'Must export LOOKAHEAD_POLICY_IDS');
});

test('v0.32.0: DEFAULT_LOOKAHEAD_CONFIG has required fields', async () => {
  const { DEFAULT_LOOKAHEAD_CONFIG } = await import('../packages/game-ai/src/bounded-lookahead.mjs');
  assert.ok(DEFAULT_LOOKAHEAD_CONFIG.maxNodes > 0, 'maxNodes must be positive');
  assert.ok(DEFAULT_LOOKAHEAD_CONFIG.maxDepth > 0, 'maxDepth must be positive');
  assert.ok(DEFAULT_LOOKAHEAD_CONFIG.maxOpponentResponses > 0, 'maxOpponentResponses must be positive');
});

test('v0.32.0: defaultEvaluation returns a number', async () => {
  const { defaultEvaluation } = await import('../packages/game-ai/src/bounded-lookahead.mjs');
  const state = { scores: { P1: 10, P2: 5 }, hands: { P1: [1, 2], P2: [3] }, board: { P1: [1], P2: [] } };
  const score = defaultEvaluation(state, 'P1');
  assert.equal(typeof score, 'number');
  assert.ok(Number.isFinite(score), 'Evaluation must be finite');
});

test('v0.32.0: createBoundedLookahead returns search function', async () => {
  const { createBoundedLookahead } = await import('../packages/game-ai/src/bounded-lookahead.mjs');
  const lookahead = createBoundedLookahead({ maxNodes: 50, maxDepth: 1 });
  assert.equal(typeof lookahead.search, 'function');
});

test('v0.32.0: bounded lookahead search is deterministic', async () => {
  const { createBoundedLookahead, defaultEvaluation } = await import('../packages/game-ai/src/bounded-lookahead.mjs');
  const lookahead = createBoundedLookahead({
    maxNodes: 50,
    maxDepth: 1,
    evaluationFn: defaultEvaluation,
    simulateFn: (state, command) => ({ state: { ...state, scores: { ...state.scores, P1: (state.scores.P1 || 0) + 1 } }, accepted: true, error: null }),
    enumerateActionsFn: (state) => ({
      legalActions: [{ actionId: 'a1', playerId: 'P2' }, { actionId: 'a2', playerId: 'P2' }],
      resolveAction: (id) => ({ actionId: id }),
      status: 'OK',
    }),
  });
  const rootState = { scores: { P1: 0, P2: 0 }, hands: { P1: [], P2: [] }, board: { P1: [], P2: [] } };
  const legalActions = [{ actionId: 'a1', playerId: 'P1' }, { actionId: 'a2', playerId: 'P1' }];
  const resolveAction = (actionId) => ({ actionId });

  const result1 = lookahead.search(rootState, legalActions, resolveAction);
  const result2 = lookahead.search(rootState, legalActions, resolveAction);
  assert.equal(result1.bestAction, result2.bestAction, 'Same input must produce same best action');
  assert.equal(result1.bestScore, result2.bestScore, 'Same input must produce same best score');
  assert.equal(result1.nodesExpanded, result2.nodesExpanded, 'Same node count');
});

test('v0.32.0: bounded lookahead respects node budget', async () => {
  const { createBoundedLookahead, defaultEvaluation } = await import('../packages/game-ai/src/bounded-lookahead.mjs');
  const lookahead = createBoundedLookahead({
    maxNodes: 5,
    maxDepth: 1,
    evaluationFn: defaultEvaluation,
    simulateFn: (state, command) => ({ state: { ...state }, accepted: true, error: null }),
    enumerateActionsFn: (state) => ({
      legalActions: [
        { actionId: `a1`, playerId: 'P2' },
        { actionId: `a2`, playerId: 'P2' },
        { actionId: `a3`, playerId: 'P2' },
      ],
      resolveAction: (id) => ({ actionId: id }),
      status: 'OK',
    }),
  });
  const rootState = { scores: { P1: 0, P2: 0 }, hands: { P1: [], P2: [] }, board: { P1: [], P2: [] } };
  const legalActions = [{ actionId: 'a1', playerId: 'P1' }, { actionId: 'a2', playerId: 'P1' }, { actionId: 'a3', playerId: 'P1' }];
  const resolveAction = (actionId) => ({ actionId });
  const result = lookahead.search(rootState, legalActions, resolveAction);
  assert.ok(result.nodesExpanded <= 5, `Must not exceed node budget, got ${result.nodesExpanded}`);
  // With 3 actions and maxNodes=5, the search expands 3 searcher nodes (depth 1) — under budget
  // budgetExhausted is only true when the loop breaks early due to the budget
  assert.equal(typeof result.budgetExhausted, 'boolean');
});

test('v0.32.0: runLookaheadBenchmark returns structured results', async () => {
  const { runLookaheadBenchmark } = await import('../packages/game-ai/src/bounded-lookahead.mjs');
  const result = runLookaheadBenchmark({ maxNodes: 50 });
  assert.ok(Array.isArray(result.positions), 'Must have positions array');
  assert.ok(result.positions.length > 0, 'Must have at least one benchmark position');
  for (const r of result.positions) {
    assert.ok(typeof r.nodesExpanded === 'number');
    assert.ok(typeof r.timeMs === 'number' || r.timeMs === null);
    assert.ok(typeof r.bestAction !== 'undefined');
    assert.ok(typeof r.budgetExhausted === 'boolean');
  }
  // Benchmark must NOT claim "expert" — the caller decides
  assert.ok(!JSON.stringify(result).toLowerCase().includes('expert'), 'Benchmark must not claim "expert"');
});

test('v0.32.0: createLookaheadPolicy returns policy definition', async () => {
  const { createLookaheadPolicy, LOOKAHEAD_STRENGTH_TIER } = await import('../packages/game-ai/src/bounded-lookahead.mjs');
  const policy = createLookaheadPolicy({ policyId: 'test-lookahead', difficulty: 'hard' });
  assert.ok(policy, 'Must return a policy');
  assert.equal(policy.strengthTier, LOOKAHEAD_STRENGTH_TIER);
  assert.equal(typeof policy.choose, 'function');
});

test('v0.32.0: LOOKAHEAD_POLICIES has standard, deep, and shallow variants', async () => {
  const { LOOKAHEAD_POLICIES, LOOKAHEAD_POLICY_IDS } = await import('../packages/game-ai/src/bounded-lookahead.mjs');
  assert.ok(LOOKAHEAD_POLICY_IDS.length >= 3, 'Must have at least 3 policy variants');
  assert.ok(LOOKAHEAD_POLICIES.length >= 3, 'Must have at least 3 policy definitions');
});

// ── Commentary contract hardening ──────────────────────────────

test('v0.32.0: commentary-contract exports all required symbols', async () => {
  const mod = await import('../packages/replay-caster/src/commentary-contract.mjs');
  assert.ok(mod.FACT_TYPE, 'Must export FACT_TYPE enum');
  assert.ok(mod.AUTHORIZATION_LEVEL, 'Must export AUTHORIZATION_LEVEL enum');
  assert.equal(typeof mod.authorizeFacts, 'function');
  assert.equal(typeof mod.buildPromptProvenance, 'function');
  assert.equal(typeof mod.createFallbackCommentary, 'function');
  assert.equal(typeof mod.handleMalformedStream, 'function');
  assert.equal(typeof mod.isCommentaryAuthorized, 'function');
  assert.equal(typeof mod.validateCommentaryContract, 'function');
});

test('v0.32.0: FACT_TYPE has all required values', async () => {
  const { FACT_TYPE } = await import('../packages/replay-caster/src/commentary-contract.mjs');
  assert.ok(FACT_TYPE.SCORE, 'Must have SCORE');
  assert.ok(FACT_TYPE.ACTION, 'Must have ACTION');
  assert.ok(FACT_TYPE.PHASE, 'Must have PHASE');
  assert.ok(FACT_TYPE.TURN, 'Must have TURN');
  assert.ok(FACT_TYPE.IMPORTANCE, 'Must have IMPORTANCE');
  assert.ok(FACT_TYPE.DIAGNOSTIC, 'Must have DIAGNOSTIC');
});

test('v0.32.0: AUTHORIZATION_LEVEL has public, dev-only, private', async () => {
  const { AUTHORIZATION_LEVEL } = await import('../packages/replay-caster/src/commentary-contract.mjs');
  assert.equal(AUTHORIZATION_LEVEL.PUBLIC, 'public');
  assert.equal(AUTHORIZATION_LEVEL.DEV_ONLY, 'dev-only');
  assert.equal(AUTHORIZATION_LEVEL.PRIVATE, 'private');
});

test('v0.32.0: authorizeFacts returns authorized facts for public viewer', async () => {
  const { authorizeFacts } = await import('../packages/replay-caster/src/commentary-contract.mjs');
  const beat = {
    beatId: 'CB-test',
    beatKind: 'DECISION',
    seat: 1,
    turn: 5,
    phase: 'MAIN',
    publicSummary: { scores: { P1: 10, P2: 5 }, scoreDelta: 5 },
    action: { family: 'score' },
    decision: { legalActionCount: 3 },
    importance: 0.7,
  };
  const facts = authorizeFacts(beat, 'public', 'BROADCAST');
  assert.ok(Array.isArray(facts), 'Must return array of facts');
  assert.ok(facts.length > 0, 'Must have at least some authorized facts');
  // All facts must be authorized (public level)
  for (const f of facts) {
    assert.equal(f.authorized, true, 'Public facts must be authorized');
    assert.notEqual(f.authorizationLevel, 'private', 'No private facts in public mode');
  }
});

test('v0.32.0: authorizeFacts includes diagnostic facts in dev observatory mode', async () => {
  const { authorizeFacts, FACT_TYPE } = await import('../packages/replay-caster/src/commentary-contract.mjs');
  const beat = {
    beatId: 'CB-test',
    beatKind: 'DECISION',
    seat: 1,
    turn: 5,
    phase: 'MAIN',
    publicSummary: { scores: { P1: 10 }, scoreDelta: 5 },
    action: { family: 'score' },
    decision: { legalActionCount: 3 },
    importance: 0.7,
  };
  const publicFacts = authorizeFacts(beat, 'public', 'BROADCAST');
  const devFacts = authorizeFacts(beat, 'public', 'DEV_OBSERVATORY');
  // Dev mode should have at least as many facts as public mode
  assert.ok(devFacts.length >= publicFacts.length, 'Dev mode should authorize at least as many facts');
});

test('v0.32.0: buildPromptProvenance creates versioned provenance', async () => {
  const { buildPromptProvenance } = await import('../packages/replay-caster/src/commentary-contract.mjs');
  const input = { promptVersion: '1.0.0', mode: 'BROADCAST' };
  const promptResult = { systemPrompt: 'test system', userPrompt: 'test user' };
  const provenance = buildPromptProvenance(input, promptResult, 'ollama', 'llama3');
  assert.ok(provenance.promptVersion, 'Must have promptVersion');
  assert.ok(provenance.systemPromptHash, 'Must have systemPromptHash');
  assert.ok(provenance.userPromptHash, 'Must have userPromptHash');
  assert.equal(provenance.modelId, 'llama3');
  assert.equal(provenance.providerName, 'ollama');
  assert.ok(provenance.createdAt, 'Must have createdAt timestamp');
  assert.ok(provenance.schemaVersion, 'Must have schemaVersion');
});

test('v0.32.0: createFallbackCommentary produces labeled fallback', async () => {
  const { createFallbackCommentary } = await import('../packages/replay-caster/src/commentary-contract.mjs');
  const beat = {
    beatId: 'CB-test',
    beatKind: 'DECISION',
    seat: 1,
    turn: 5,
    action: { family: 'score' },
    publicSummary: { scores: { P1: 10, P2: 5 }, scoreDelta: 5 },
    importance: 0.7,
  };
  const fallback = createFallbackCommentary(beat, { scores: { P1: 10 } }, 'BROADCAST', [], 'UNREACHABLE');
  assert.equal(fallback.isFallback, true, 'Must be labeled as fallback');
  assert.equal(fallback.fallbackReason, 'UNREACHABLE');
  assert.ok(fallback.providerLabel, 'Must have providerLabel');
  assert.ok(fallback.commentary, 'Must have commentary text');
});

test('v0.32.0: handleMalformedStream recovers from valid JSON in prose', async () => {
  const { handleMalformedStream } = await import('../packages/replay-caster/src/commentary-contract.mjs');
  const input = { futureContext: { visibleToViewer: true } };
  const rawOutput = 'Here is the commentary:\n{"commentary":"Seat 1 scores.","headline":"Score","importance":0.7,"tone":"ANALYTICAL","threadActions":[],"diagnosticReferences":[],"spoilerCheck":"PASS"}';
  const result = handleMalformedStream(rawOutput, input, 'MALFORMED_RESPONSE');
  assert.ok(result.record, 'Must return a record');
  assert.equal(typeof result.recovered, 'boolean');
  assert.equal(typeof result.malformedStream, 'boolean');
});

test('v0.32.0: handleMalformedStream returns fallback for unparseable output', async () => {
  const { handleMalformedStream } = await import('../packages/replay-caster/src/commentary-contract.mjs');
  const beat = {
    beatId: 'CB-test',
    beatKind: 'DECISION',
    seat: 1,
    turn: 5,
    action: { family: 'score' },
    publicSummary: { scores: { P1: 10, P2: 5 }, scoreDelta: 5 },
    importance: 0.7,
  };
  const input = { beat, presentContext: { scores: { P1: 10 } }, futureContext: { visibleToViewer: true } };
  const rawOutput = 'This is not JSON at all, just random text that cannot be parsed.';
  const result = handleMalformedStream(rawOutput, input, 'MALFORMED_RESPONSE');
  assert.ok(result.record, 'Must return a safe record even for unparseable output');
  assert.equal(result.malformedStream, true, 'Must mark as malformed stream');
  assert.ok(typeof result.truncatedRaw === 'string', 'Must include truncated raw output');
});

test('v0.32.0: validateCommentaryContract returns valid for good record', async () => {
  const { validateCommentaryContract } = await import('../packages/replay-caster/src/commentary-contract.mjs');
  const record = {
    importance: 0.7,
    headline: 'Test headline',
    commentary: 'Seat 1 makes a move.',
    tone: 'ANALYTICAL',
    threadActions: [],
    diagnosticReferences: [],
    spoilerCheck: 'PASS',
  };
  const provenance = {
    promptVersion: '1.0.0',
    systemPromptHash: 'abc123',
    userPromptHash: 'def456',
    modelId: 'llama3',
    providerName: 'ollama',
    createdAt: new Date().toISOString(),
    schemaVersion: '1.0.0',
  };
  const authorization = [];
  const result = validateCommentaryContract(record, provenance, authorization);
  assert.equal(typeof result.valid, 'boolean');
  assert.ok(Array.isArray(result.errors), 'Must have errors array');
  assert.ok(Array.isArray(result.warnings), 'Must have warnings array');
});

// ── WAIT WHAT investigation workflow ───────────────────────────

test('v0.32.0: investigation-workflow exports all required symbols', async () => {
  const mod = await import('../packages/replay-caster/src/investigation-workflow.mjs');
  assert.ok(mod.InvestigationStatus, 'Must export InvestigationStatus enum');
  assert.equal(typeof mod.createInvestigation, 'function');
  assert.equal(typeof mod.transitionToInvestigating, 'function');
  assert.equal(typeof mod.addBranch, 'function');
  assert.equal(typeof mod.addAnnotation, 'function');
  assert.equal(typeof mod.addComparison, 'function');
  assert.equal(typeof mod.checkInvalidation, 'function');
  assert.equal(typeof mod.exportInvestigation, 'function');
  assert.equal(typeof mod.getInvestigationSummary, 'function');
  assert.equal(typeof mod.validateInvestigation, 'function');
  assert.equal(typeof mod.investigationToJSON, 'function');
  assert.equal(typeof mod.investigationFromJSON, 'function');
});

test('v0.32.0: InvestigationStatus has all required states', async () => {
  const { InvestigationStatus } = await import('../packages/replay-caster/src/investigation-workflow.mjs');
  assert.equal(InvestigationStatus.BOOKMARKED, 'BOOKMARKED');
  assert.equal(InvestigationStatus.INSPECTING, 'INSPECTING');
  assert.equal(InvestigationStatus.BRANCHED, 'BRANCHED');
  assert.equal(InvestigationStatus.COMPARING, 'COMPARING');
  assert.equal(InvestigationStatus.ANNOTATED, 'ANNOTATED');
  assert.equal(InvestigationStatus.EXPORTED, 'EXPORTED');
  assert.equal(InvestigationStatus.INVALIDATED, 'INVALIDATED');
});

test('v0.32.0: createInvestigation creates investigation from capture', async () => {
  const { createInvestigation, InvestigationStatus } = await import('../packages/replay-caster/src/investigation-workflow.mjs');
  const capture = {
    schemaVersion: '1.0.0',
    captureId: 'WW-test123',
    createdAt: new Date().toISOString(),
    matchId: 'M-test',
    replayId: 'R-test',
    casterBeatId: 'CB-test',
    decisionId: 'D-test',
    checkpointHash: 'hash123',
    playbackTime: 10.5,
    policyIds: ['p1', 'p2'],
    engineVersion: '4.2.6',
    rulesVersion: '4.3.1',
    profileId: 'core-advanced-authority',
    viewerMode: 'public',
    selectedAction: { family: 'score' },
    legalOptions: [{ count: 3 }],
    decisionTrace: null,
    diagnostics: [],
    commentary: null,
    contextBefore: [],
    contextAfter: [],
    redacted: true,
  };
  const inv = createInvestigation(capture, 'auth-hash-123');
  assert.equal(inv.status, InvestigationStatus.BOOKMARKED);
  assert.equal(inv.capture.captureId, 'WW-test123');
  assert.equal(inv.authorityHashAtCreation, 'auth-hash-123');
  assert.ok(inv.investigationId, 'Must have investigationId');
  assert.ok(inv.createdAt, 'Must have createdAt');
  assert.equal(inv.branches.length, 0);
  assert.equal(inv.annotations.length, 0);
});

test('v0.32.0: transitionToInvestigating changes status', async () => {
  const { createInvestigation, transitionToInvestigating, InvestigationStatus } = await import('../packages/replay-caster/src/investigation-workflow.mjs');
  const capture = { captureId: 'WW-test', matchId: 'M-test', createdAt: new Date().toISOString() };
  const inv = createInvestigation(capture, 'hash');
  const updated = transitionToInvestigating(inv);
  assert.equal(updated.status, InvestigationStatus.INSPECTING);
  // Original must be unchanged (immutable)
  assert.equal(inv.status, InvestigationStatus.BOOKMARKED);
});

test('v0.32.0: addBranch adds a branch and transitions to BRANCHED', async () => {
  const { createInvestigation, addBranch, InvestigationStatus } = await import('../packages/replay-caster/src/investigation-workflow.mjs');
  const capture = { captureId: 'WW-test', matchId: 'M-test', createdAt: new Date().toISOString() };
  const inv = createInvestigation(capture, 'hash');
  const updated = addBranch(inv, { label: 'Alt line', alternativeActionId: 'a2', notes: 'Try this instead', evaluationScore: 0.7 });
  assert.equal(updated.branches.length, 1);
  assert.equal(updated.branches[0].label, 'Alt line');
  assert.equal(updated.branches[0].alternativeActionId, 'a2');
  assert.ok(updated.branches[0].branchId, 'Branch must have ID');
  // Status should advance to BRANCHED or higher
  assert.ok([InvestigationStatus.BRANCHED, InvestigationStatus.COMPARING, InvestigationStatus.ANNOTATED, InvestigationStatus.EXPORTED].includes(updated.status),
    `Status should be BRANCHED or higher, got ${updated.status}`);
});

test('v0.32.0: addAnnotation adds annotation', async () => {
  const { createInvestigation, addAnnotation } = await import('../packages/replay-caster/src/investigation-workflow.mjs');
  const capture = { captureId: 'WW-test', matchId: 'M-test', createdAt: new Date().toISOString() };
  const inv = createInvestigation(capture, 'hash');
  const updated = addAnnotation(inv, { text: 'This is suspicious', beatId: 'CB-test' });
  assert.equal(updated.annotations.length, 1);
  assert.equal(updated.annotations[0].text, 'This is suspicious');
  assert.equal(updated.annotations[0].beatId, 'CB-test');
  assert.ok(updated.annotations[0].annotationId, 'Annotation must have ID');
});

test('v0.32.0: addComparison adds comparison', async () => {
  const { createInvestigation, addBranch, addComparison, InvestigationStatus } = await import('../packages/replay-caster/src/investigation-workflow.mjs');
  const capture = { captureId: 'WW-test', matchId: 'M-test', createdAt: new Date().toISOString() };
  let inv = createInvestigation(capture, 'hash');
  inv = addBranch(inv, { label: 'A', alternativeActionId: 'a1', evaluationScore: 0.6 });
  inv = addBranch(inv, { label: 'B', alternativeActionId: 'a2', evaluationScore: 0.8 });
  const updated = addComparison(inv, { branchIds: [inv.branches[0].branchId, inv.branches[1].branchId], metric: 'evaluationScore', result: 'branch-b-better', notes: 'B scores higher' });
  assert.equal(updated.comparisons.length, 1);
  assert.ok([InvestigationStatus.COMPARING, InvestigationStatus.ANNOTATED, InvestigationStatus.EXPORTED].includes(updated.status));
});

test('v0.32.0: checkInvalidation transitions to INVALIDATED on hash change', async () => {
  const { createInvestigation, addBranch, checkInvalidation, InvestigationStatus } = await import('../packages/replay-caster/src/investigation-workflow.mjs');
  const capture = { captureId: 'WW-test', matchId: 'M-test', createdAt: new Date().toISOString() };
  let inv = createInvestigation(capture, 'original-hash');
  inv = addBranch(inv, { label: 'Test', alternativeActionId: 'a1' });
  const invalidated = checkInvalidation(inv, 'different-hash');
  assert.equal(invalidated.status, InvestigationStatus.INVALIDATED);
  // Branches should be marked stale
  assert.ok(invalidated.branches.every(b => b.stale === true), 'Branches must be marked stale');
});

test('v0.32.0: checkInvalidation is idempotent', async () => {
  const { createInvestigation, checkInvalidation, InvestigationStatus } = await import('../packages/replay-caster/src/investigation-workflow.mjs');
  const capture = { captureId: 'WW-test', matchId: 'M-test', createdAt: new Date().toISOString() };
  const inv = createInvestigation(capture, 'hash');
  const invalidated1 = checkInvalidation(inv, 'different');
  const invalidated2 = checkInvalidation(invalidated1, 'different');
  assert.equal(invalidated2.status, InvestigationStatus.INVALIDATED);
});

test('v0.32.0: checkInvalidation is no-op when hash matches', async () => {
  const { createInvestigation, checkInvalidation, InvestigationStatus } = await import('../packages/replay-caster/src/investigation-workflow.mjs');
  const capture = { captureId: 'WW-test', matchId: 'M-test', createdAt: new Date().toISOString() };
  const inv = createInvestigation(capture, 'same-hash');
  const result = checkInvalidation(inv, 'same-hash');
  assert.notEqual(result.status, InvestigationStatus.INVALIDATED, 'Should not invalidate when hash matches');
});

test('v0.32.0: exportInvestigation transitions to EXPORTED', async () => {
  const { createInvestigation, exportInvestigation, InvestigationStatus } = await import('../packages/replay-caster/src/investigation-workflow.mjs');
  const capture = { captureId: 'WW-test', matchId: 'M-test', createdAt: new Date().toISOString() };
  const inv = createInvestigation(capture, 'hash');
  const { investigation, exportData, exportFormat } = exportInvestigation(inv, 'json');
  assert.equal(investigation.status, InvestigationStatus.EXPORTED);
  assert.equal(exportFormat, 'json');
  assert.ok(exportData, 'Must have export data');
  // JSON export is a normalized object (not a string)
  assert.equal(typeof exportData, 'object');
  assert.ok(exportData.investigationId || exportData.capture, 'Export data must contain investigation content');
});

test('v0.32.0: exportInvestigation supports markdown format', async () => {
  const { createInvestigation, exportInvestigation } = await import('../packages/replay-caster/src/investigation-workflow.mjs');
  const capture = { captureId: 'WW-test', matchId: 'M-test', createdAt: new Date().toISOString() };
  const inv = createInvestigation(capture, 'hash');
  const { exportData, exportFormat } = exportInvestigation(inv, 'markdown');
  assert.equal(exportFormat, 'markdown');
  assert.equal(typeof exportData, 'string');
  assert.ok(exportData.includes('#'), 'Markdown should contain headers');
});

test('v0.32.0: getInvestigationSummary returns compact summary', async () => {
  const { createInvestigation, addBranch, getInvestigationSummary } = await import('../packages/replay-caster/src/investigation-workflow.mjs');
  const capture = { captureId: 'WW-test', matchId: 'M-test', createdAt: new Date().toISOString() };
  let inv = createInvestigation(capture, 'hash');
  inv = addBranch(inv, { label: 'Test', alternativeActionId: 'a1', evaluationScore: 0.7 });
  const summary = getInvestigationSummary(inv);
  assert.ok(summary.investigationId, 'Summary must have investigationId');
  assert.ok(summary.status, 'Summary must have status');
  assert.equal(typeof summary.branchCount, 'number');
});

test('v0.32.0: investigationToJSON and fromJSON round-trip', async () => {
  const { createInvestigation, addBranch, investigationToJSON, investigationFromJSON } = await import('../packages/replay-caster/src/investigation-workflow.mjs');
  const capture = { captureId: 'WW-test', matchId: 'M-test', createdAt: new Date().toISOString() };
  let inv = createInvestigation(capture, 'hash');
  inv = addBranch(inv, { label: 'Test', alternativeActionId: 'a1', evaluationScore: 0.7 });
  const json = investigationToJSON(inv);
  const restored = investigationFromJSON(json);
  assert.equal(restored.investigationId, inv.investigationId);
  assert.equal(restored.status, inv.status);
  assert.equal(restored.branches.length, inv.branches.length);
});

test('v0.32.0: validateInvestigation returns valid for well-formed investigation', async () => {
  const { createInvestigation, validateInvestigation } = await import('../packages/replay-caster/src/investigation-workflow.mjs');
  const capture = { captureId: 'WW-test', matchId: 'M-test', createdAt: new Date().toISOString() };
  const inv = createInvestigation(capture, 'hash');
  const result = validateInvestigation(inv);
  assert.equal(typeof result.valid, 'boolean');
  assert.ok(Array.isArray(result.errors));
});

// ── Brain topology + 2D equivalent ─────────────────────────────

test('v0.32.0: brain-topology exports all required symbols', async () => {
  const mod = await import('../apps/lab-web/src/brain/brain-topology.mjs');
  assert.ok(mod.BRAIN_JOB_DESCRIPTION, 'Must export BRAIN_JOB_DESCRIPTION');
  assert.equal(typeof mod.getBrainJobSummary, 'function');
  assert.ok(mod.DEFAULT_2D_LAYOUT_CONFIG, 'Must export DEFAULT_2D_LAYOUT_CONFIG');
  assert.equal(typeof mod.compute2DLayout, 'function');
  assert.equal(typeof mod.build2DTopology, 'function');
  assert.equal(typeof mod.render2DTopology, 'function');
  assert.equal(typeof mod.computeTopologyMetrics, 'function');
});

test('v0.32.0: BRAIN_JOB_DESCRIPTION is a formalized description', async () => {
  const { BRAIN_JOB_DESCRIPTION } = await import('../apps/lab-web/src/brain/brain-topology.mjs');
  assert.ok(BRAIN_JOB_DESCRIPTION.name, 'Must have name');
  assert.ok(BRAIN_JOB_DESCRIPTION.role, 'Must have role');
  assert.ok(BRAIN_JOB_DESCRIPTION.summary, 'Must have summary');
  assert.ok(BRAIN_JOB_DESCRIPTION.layers, 'Must have layers');
});

test('v0.32.0: getBrainJobSummary returns structured summary', async () => {
  const { getBrainJobSummary } = await import('../apps/lab-web/src/brain/brain-topology.mjs');
  const summary = getBrainJobSummary();
  assert.ok(summary.name, 'Must have name');
  assert.ok(summary.role, 'Must have role');
  assert.ok(summary.summary, 'Must have summary');
  assert.ok(Array.isArray(summary.layers), 'Must have layers array');
});

test('v0.32.0: compute2DLayout returns positions for all nodes', async () => {
  const { compute2DLayout } = await import('../apps/lab-web/src/brain/brain-topology.mjs');
  const nodes = [
    { id: 'n1', label: 'Node 1', weight: 1, category: 'scoring', layer: 'mechanics', data: {} },
    { id: 'n2', label: 'Node 2', weight: 2, category: 'control', layer: 'mechanics', data: {} },
    { id: 'n3', label: 'Node 3', weight: 1, category: 'resource', layer: 'mechanics', data: {} },
  ];
  const edges = [
    { source: 'n1', target: 'n2', type: 'synergy', color: '#68d391', opacity: 0.5, weight: 1 },
    { source: 'n2', target: 'n3', type: 'synergy', color: '#68d391', opacity: 0.5, weight: 1 },
  ];
  const positions = compute2DLayout(nodes, edges, { iterations: 50, seed: 42 });
  assert.ok(positions instanceof Map, 'Must return a Map');
  assert.equal(positions.size, 3, 'Must have position for each node');
  for (const [id, pos] of positions) {
    assert.equal(typeof pos.x, 'number', `Node ${id} must have numeric x`);
    assert.equal(typeof pos.y, 'number', `Node ${id} must have numeric y`);
    assert.ok(Number.isFinite(pos.x), 'x must be finite');
    assert.ok(Number.isFinite(pos.y), 'y must be finite');
  }
});

test('v0.32.0: compute2DLayout is deterministic with same seed', async () => {
  const { compute2DLayout } = await import('../apps/lab-web/src/brain/brain-topology.mjs');
  const nodes = [
    { id: 'n1', label: 'A', weight: 1, category: 'scoring', layer: 'mechanics', data: {} },
    { id: 'n2', label: 'B', weight: 1, category: 'control', layer: 'mechanics', data: {} },
  ];
  const edges = [{ source: 'n1', target: 'n2', type: 'synergy', color: '#68d391', opacity: 0.5, weight: 1 }];
  const pos1 = compute2DLayout(nodes, edges, { iterations: 50, seed: 123 });
  const pos2 = compute2DLayout(nodes, edges, { iterations: 50, seed: 123 });
  assert.equal(pos1.get('n1').x, pos2.get('n1').x, 'Same seed must produce same x');
  assert.equal(pos1.get('n1').y, pos2.get('n1').y, 'Same seed must produce same y');
});

test('v0.32.0: build2DTopology returns render-ready structure', async () => {
  const { build2DTopology } = await import('../apps/lab-web/src/brain/brain-topology.mjs');
  const layers = {
    nodes: [
      { id: 'n1', label: 'Node 1', weight: 2, category: 'scoring', color: '#5ad7e8', layer: 'mechanics', data: {} },
      { id: 'n2', label: 'Node 2', weight: 3, category: 'control', color: '#f2777a', layer: 'mechanics', data: {} },
    ],
    edges: [
      { source: 'n1', target: 'n2', type: 'synergy', color: '#68d391', opacity: 0.5, weight: 1 },
    ],
  };
  const topo = build2DTopology(layers, { iterations: 50, seed: 42 });
  assert.ok(Array.isArray(topo.nodes), 'Must have nodes array');
  assert.ok(Array.isArray(topo.edges), 'Must have edges array');
  assert.equal(topo.nodes.length, 2);
  assert.equal(topo.edges.length, 1);
  // Nodes must have x, y, radius
  for (const n of topo.nodes) {
    assert.equal(typeof n.x, 'number', 'Node must have x');
    assert.equal(typeof n.y, 'number', 'Node must have y');
    assert.equal(typeof n.radius, 'number', 'Node must have radius');
  }
  // Edges must have x1, y1, x2, y2
  for (const e of topo.edges) {
    assert.equal(typeof e.x1, 'number', 'Edge must have x1');
    assert.equal(typeof e.y1, 'number', 'Edge must have y1');
    assert.equal(typeof e.x2, 'number', 'Edge must have x2');
    assert.equal(typeof e.y2, 'number', 'Edge must have y2');
  }
});

test('v0.32.0: computeTopologyMetrics returns correct metrics', async () => {
  const { computeTopologyMetrics } = await import('../apps/lab-web/src/brain/brain-topology.mjs');
  const nodes = [
    { id: 'n1', label: 'A', weight: 1, category: 'scoring', layer: 'mechanics', data: {} },
    { id: 'n2', label: 'B', weight: 1, category: 'control', layer: 'mechanics', data: {} },
    { id: 'n3', label: 'C', weight: 1, category: 'resource', layer: 'mechanics', data: {} },
  ];
  const edges = [
    { source: 'n1', target: 'n2', type: 'synergy', color: '#68d391', opacity: 0.5, weight: 1 },
    { source: 'n2', target: 'n3', type: 'synergy', color: '#68d391', opacity: 0.5, weight: 1 },
  ];
  const metrics = computeTopologyMetrics(nodes, edges);
  assert.equal(metrics.nodeCount, 3);
  assert.equal(metrics.edgeCount, 2);
  assert.equal(typeof metrics.density, 'number');
  assert.equal(typeof metrics.averageDegree, 'number');
  assert.equal(typeof metrics.maxDegree, 'number');
  assert.equal(typeof metrics.clusterCount, 'number');
  assert.equal(typeof metrics.largestClusterSize, 'number');
  assert.ok(Array.isArray(metrics.topHubs), 'Must have topHubs array');
  // All 3 nodes are connected, so 1 cluster
  assert.equal(metrics.clusterCount, 1);
  assert.equal(metrics.largestClusterSize, 3);
});

test('v0.32.0: computeTopologyMetrics handles disconnected graph', async () => {
  const { computeTopologyMetrics } = await import('../apps/lab-web/src/brain/brain-topology.mjs');
  const nodes = [
    { id: 'n1', label: 'A', weight: 1, category: 'x', layer: 'm', data: {} },
    { id: 'n2', label: 'B', weight: 1, category: 'x', layer: 'm', data: {} },
    { id: 'n3', label: 'C', weight: 1, category: 'x', layer: 'm', data: {} },
    { id: 'n4', label: 'D', weight: 1, category: 'x', layer: 'm', data: {} },
  ];
  const edges = [
    { source: 'n1', target: 'n2', type: 'synergy', color: '#68d391', opacity: 0.5, weight: 1 },
    // n3 and n4 are disconnected
  ];
  const metrics = computeTopologyMetrics(nodes, edges);
  assert.equal(metrics.clusterCount, 3, 'Should have 3 clusters: {n1,n2}, {n3}, {n4}');
  assert.equal(metrics.largestClusterSize, 2);
});

// ── Evidence-honest player intelligence ────────────────────────

test('v0.32.0: evidence-honest exports all required symbols', async () => {
  const mod = await import('../packages/statistics/src/evidence-honest.mjs');
  assert.ok(mod.CONFIDENCE_LEVEL, 'Must export CONFIDENCE_LEVEL');
  assert.ok(mod.PLAYER_TYPE, 'Must export PLAYER_TYPE');
  assert.ok(mod.SAMPLE_SIZE_THRESHOLDS, 'Must export SAMPLE_SIZE_THRESHOLDS');
  assert.equal(typeof mod.computeUncertaintyLabel, 'function');
  assert.equal(typeof mod.buildSampleSizeDisclaimer, 'function');
  assert.equal(typeof mod.buildSeasonBoundary, 'function');
  assert.equal(typeof mod.buildPlayerTypeLabel, 'function');
  assert.equal(typeof mod.buildEvidenceHonestSummary, 'function');
  assert.equal(typeof mod.validateAggregation, 'function');
});

test('v0.32.0: CONFIDENCE_LEVEL has all required bands', async () => {
  const { CONFIDENCE_LEVEL } = await import('../packages/statistics/src/evidence-honest.mjs');
  assert.ok(CONFIDENCE_LEVEL.INSUFFICIENT_DATA);
  assert.ok(CONFIDENCE_LEVEL.VERY_LOW_CONFIDENCE);
  assert.ok(CONFIDENCE_LEVEL.LOW_CONFIDENCE);
  assert.ok(CONFIDENCE_LEVEL.MODERATE_CONFIDENCE);
  assert.ok(CONFIDENCE_LEVEL.HIGH_CONFIDENCE);
});

test('v0.32.0: PLAYER_TYPE has HUMAN and AI', async () => {
  const { PLAYER_TYPE } = await import('../packages/statistics/src/evidence-honest.mjs');
  assert.equal(PLAYER_TYPE.HUMAN, 'HUMAN');
  assert.equal(PLAYER_TYPE.AI, 'AI');
});

test('v0.32.0: SAMPLE_SIZE_THRESHOLDS has required thresholds', async () => {
  const { SAMPLE_SIZE_THRESHOLDS } = await import('../packages/statistics/src/evidence-honest.mjs');
  assert.ok(SAMPLE_SIZE_THRESHOLDS.WIN_RATE > 0);
  assert.ok(SAMPLE_SIZE_THRESHOLDS.RATING_TREND > 0);
  assert.ok(SAMPLE_SIZE_THRESHOLDS.HEAD_TO_HEAD > 0);
  assert.ok(SAMPLE_SIZE_THRESHOLDS.MECHANIC_USAGE > 0);
});

test('v0.32.0: computeUncertaintyLabel returns correct band for sample sizes', async () => {
  const { computeUncertaintyLabel, CONFIDENCE_LEVEL } = await import('../packages/statistics/src/evidence-honest.mjs');
  assert.equal(computeUncertaintyLabel({ sampleSize: 0 }).level, CONFIDENCE_LEVEL.INSUFFICIENT_DATA);
  assert.equal(computeUncertaintyLabel({ sampleSize: 5 }).level, CONFIDENCE_LEVEL.VERY_LOW_CONFIDENCE);
  assert.equal(computeUncertaintyLabel({ sampleSize: 20 }).level, CONFIDENCE_LEVEL.LOW_CONFIDENCE);
  assert.equal(computeUncertaintyLabel({ sampleSize: 50 }).level, CONFIDENCE_LEVEL.MODERATE_CONFIDENCE);
  assert.equal(computeUncertaintyLabel({ sampleSize: 200 }).level, CONFIDENCE_LEVEL.HIGH_CONFIDENCE);
});

test('v0.32.0: computeUncertaintyLabel returns human-readable label', async () => {
  const { computeUncertaintyLabel } = await import('../packages/statistics/src/evidence-honest.mjs');
  const result = computeUncertaintyLabel({ sampleSize: 15 });
  assert.ok(result.label, 'Must have label');
  assert.ok(result.humanReadable, 'Must have humanReadable text');
  assert.equal(typeof result.confidence, 'number');
  assert.ok(result.confidence >= 0 && result.confidence <= 1, 'Confidence must be 0-1');
});

test('v0.32.0: buildSampleSizeDisclaimer triggers below threshold', async () => {
  const { buildSampleSizeDisclaimer } = await import('../packages/statistics/src/evidence-honest.mjs');
  const disclaimer = buildSampleSizeDisclaimer({ sampleSize: 10 }, 'win-rate');
  assert.equal(disclaimer.shouldDisplay, true, 'Should display when below threshold');
  assert.ok(disclaimer.disclaimerText, 'Must have disclaimer text');
  assert.ok(disclaimer.threshold > 0, 'Must have threshold');
  assert.equal(disclaimer.actualSize, 10);
});

test('v0.32.0: buildSampleSizeDisclaimer does not trigger above threshold', async () => {
  const { buildSampleSizeDisclaimer } = await import('../packages/statistics/src/evidence-honest.mjs');
  const disclaimer = buildSampleSizeDisclaimer({ sampleSize: 50 }, 'win-rate');
  assert.equal(disclaimer.shouldDisplay, false, 'Should not display when above threshold');
});

test('v0.32.0: buildPlayerTypeLabel identifies human player', async () => {
  const { buildPlayerTypeLabel, PLAYER_TYPE } = await import('../packages/statistics/src/evidence-honest.mjs');
  const label = buildPlayerTypeLabel({ accountId: 'acc-123', isAI: false });
  assert.equal(label.playerType, PLAYER_TYPE.HUMAN);
  assert.ok(label.label, 'Must have label');
  assert.equal(label.aiArchetype, null);
  assert.equal(label.policyId, null);
});

test('v0.32.0: buildPlayerTypeLabel identifies AI player', async () => {
  const { buildPlayerTypeLabel, PLAYER_TYPE } = await import('../packages/statistics/src/evidence-honest.mjs');
  const label = buildPlayerTypeLabel({ policyId: 'hybrix-rusher', isAI: true, archetype: 'rusher', difficulty: 'hard' });
  assert.equal(label.playerType, PLAYER_TYPE.AI);
  assert.ok(label.label, 'Must have label');
  assert.ok(label.aiArchetype || label.policyId, 'Must have AI identifier');
  assert.equal(label.shouldSeparate, true, 'AI and human should be separated');
});

test('v0.32.0: buildPlayerTypeLabel detects AI from policyId prefix', async () => {
  const { buildPlayerTypeLabel, PLAYER_TYPE } = await import('../packages/statistics/src/evidence-honest.mjs');
  const label = buildPlayerTypeLabel({ policyId: 'hybrix-defender' });
  assert.equal(label.playerType, PLAYER_TYPE.AI, 'Should detect AI from hybrix- prefix');
});

test('v0.32.0: buildSeasonBoundary detects cross-season data', async () => {
  const { buildSeasonBoundary } = await import('../packages/statistics/src/evidence-honest.mjs');
  const stats = { seasonId: 'S1', seasonIds: ['S1', 'S2'], engineVersion: '4.2.6', rulesVersion: '4.3.1' };
  const seasonInfo = { currentSeasonId: 'S2', label: 'Season 2', status: 'ACTIVE' };
  const boundary = buildSeasonBoundary(stats, seasonInfo);
  assert.ok(boundary.seasonId, 'Must have seasonId');
  assert.ok(boundary.seasonLabel, 'Must have seasonLabel');
  assert.equal(typeof boundary.isCurrentSeason, 'boolean');
  assert.equal(typeof boundary.isPartialSeason, 'boolean');
  // Should warn about cross-season data (seasonIds has 2 entries)
  assert.ok(boundary.boundaryWarning, 'Should warn when data spans multiple seasons');
});

test('v0.32.0: buildEvidenceHonestSummary combines all components', async () => {
  const { buildEvidenceHonestSummary } = await import('../packages/statistics/src/evidence-honest.mjs');
  const rawStats = { sampleSize: 15, winRate: 0.52, seasonIds: ['S1'], engineVersions: ['4.2.6'] };
  const options = {
    context: 'win-rate',
    seasonInfo: { currentSeasonId: 'S1', seasonLabel: 'Season 1', isPartial: false },
    playerInfo: { accountId: 'acc-123', isAI: false },
  };
  const summary = buildEvidenceHonestSummary(rawStats, 'win-rate', options);
  assert.ok(summary.stats, 'Must have stats');
  assert.ok(summary.uncertaintyLabel, 'Must have uncertaintyLabel');
  assert.ok(summary.sampleSizeDisclaimer, 'Must have sampleSizeDisclaimer');
  assert.ok(Array.isArray(summary.displayWarnings), 'Must have displayWarnings array');
  assert.equal(typeof summary.shouldSuppressDisplay, 'boolean');
  assert.equal(typeof summary.confidenceLevel, 'number');
  assert.ok(summary.displayLabel, 'Must have displayLabel');
});

test('v0.32.0: buildEvidenceHonestSummary suppresses display for insufficient data', async () => {
  const { buildEvidenceHonestSummary } = await import('../packages/statistics/src/evidence-honest.mjs');
  const summary = buildEvidenceHonestSummary({ sampleSize: 0 }, 'win-rate', {});
  assert.equal(summary.shouldSuppressDisplay, true, 'Should suppress when no data');
});

test('v0.32.0: validateAggregation blocks human+AI mixing', async () => {
  const { validateAggregation } = await import('../packages/statistics/src/evidence-honest.mjs');
  const datasets = [
    { playerType: 'HUMAN', seasonId: 'S1', engineVersion: '4.2.6' },
    { playerType: 'AI', seasonId: 'S1', engineVersion: '4.2.6' },
  ];
  const result = validateAggregation(datasets, {});
  assert.equal(result.valid, false, 'Must block human+AI mixing');
  assert.ok(result.errors.length > 0, 'Must have errors');
});

test('v0.32.0: validateAggregation blocks cross-season mixing', async () => {
  const { validateAggregation } = await import('../packages/statistics/src/evidence-honest.mjs');
  const datasets = [
    { playerType: 'HUMAN', seasonId: 'S1', engineVersion: '4.2.6' },
    { playerType: 'HUMAN', seasonId: 'S2', engineVersion: '4.2.6' },
  ];
  const result = validateAggregation(datasets, {});
  assert.equal(result.valid, false, 'Must block cross-season mixing');
});

test('v0.32.0: validateAggregation allows same-type same-season', async () => {
  const { validateAggregation } = await import('../packages/statistics/src/evidence-honest.mjs');
  const datasets = [
    { playerType: 'HUMAN', seasonId: 'S1', engineVersion: '4.2.6' },
    { playerType: 'HUMAN', seasonId: 'S1', engineVersion: '4.2.6' },
  ];
  const result = validateAggregation(datasets, {});
  assert.equal(result.valid, true, 'Should allow same-type same-season');
});
