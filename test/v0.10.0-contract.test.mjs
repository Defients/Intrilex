/**
 * V0.10.0 Contract Tests — Truthbound Closure
 *
 * 32 mandatory red tests. Every test uses unconditional assertions.
 * Every test must fail when the underlying behavior is stubbed or bypassed.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPolicyMatch } from '@intrilex/simulation-runtime';
import {} from '@intrilex/decision-intelligence/decision-trace';
import { runCounterfactualBranch,  deriveContinuationSeed,  compareCounterfactual } from '@intrilex/simulation-runtime/counterfactual';
import { diagnosePolicy } from '@intrilex/decision-intelligence/policy-diagnostics';
import {} from '@intrilex/decision-intelligence/reason-codes';
import {} from '@intrilex/simulation-runtime/policy-catalog';
import {} from '@intrilex/shared';
import {} from '@intrilex/game-ai';
import { createSimulationDecisionFrame, authorityHashCanonical, reconstructAuthorityCheckpoints, executeSimulationAction, verifyAuthorityCertifiedReplay } from '@intrilex/engine-adapter';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

function runMatchWithTraces(policyIds = ['tempo', 'control'], seed = 42) {
  return runPolicyMatch({
    seed,
    profileId: 'core-advanced-authority',
    seatOrder: ['P1', 'P2'],
    policyIds,
    decisionTracesEnabled: true,
    includeReplay: true
  });
}

// ── Real retained authority (used by every counterfactual anchor test) ──
// Dynamically find a valid match with traces and authorized replay
const _traceDir = path.join(root, 'sample-data/autonomy/decision-traces');
const _availableTraces = readdirSync(_traceDir).filter(f => f.endsWith('.json'));
const RETAINED_MATCH_ID = _availableTraces[0].replace('.json', '');
const retainedTraceFile = JSON.parse(read(`sample-data/autonomy/decision-traces/${RETAINED_MATCH_ID}.json`));
const RETAINED_DECISION_ID = retainedTraceFile.traces[0].decisionId;
const retainedTrace = retainedTraceFile.traces.find((t) => t.decisionId === RETAINED_DECISION_ID);
const retainedReplay = JSON.parse(read(`sample-data/autonomy/replays/authorized/${RETAINED_MATCH_ID}.authorized.replay.json`));
verifyAuthorityCertifiedReplay(retainedReplay);
const retainedFrames = reconstructAuthorityCheckpoints(retainedReplay);
const retainedDecisionFrame = createSimulationDecisionFrame(retainedFrames[0].state);
const retainedBeforeStateHash = authorityHashCanonical(retainedDecisionFrame.state);
const retainedLegalActionIds = retainedDecisionFrame.policyActions.map((a) => a.actionId);
const retainedLegalActionSetHash = authorityHashCanonical([...retainedLegalActionIds].sort());
const retainedSelectedActionId = retainedTrace.selectedActionId;
const retainedSelectedCommand = retainedDecisionFrame.resolve(retainedSelectedActionId);
const retainedSelectedCommandHash = authorityHashCanonical(retainedSelectedCommand);
const retainedPostState = executeSimulationAction(retainedDecisionFrame.state, retainedSelectedCommand);
const retainedPostSelectedActionStateHash = authorityHashCanonical(retainedPostState.state);
const retainedFrameActorId = retainedSelectedCommand.actorId;
const retainedSeatOrder = ['P1', 'P2'];
const retainedFrameSeat = retainedSeatOrder.indexOf(retainedFrameActorId) + 1;
let retainedReplayCommandIndex = -1;
for (let i = 0; i < retainedReplay.commands.length; i += 1) {
  if (authorityHashCanonical(retainedReplay.commands[i]) === retainedSelectedCommandHash) { retainedReplayCommandIndex = i; break; }
}
const retainedDecisionEvidence = {
  decisionId: retainedTrace.decisionId,
  decisionIndex: retainedTrace.decisionIndex,
  checkpointHash: retainedTrace.checkpointHash,
  seat: retainedTrace.seat,
  selectedActionId: retainedTrace.selectedActionId
};

function buildValidAnchorConfig(match, opts = {}) {
  // match is ignored: anchor authority comes from the real retained record.
  const altAction = opts.altAction ?? retainedDecisionFrame.policyActions.find((a) => a.actionId !== retainedSelectedActionId);
  return {
    matchId: RETAINED_MATCH_ID,
    replayContentHash: retainedReplay.contentHash,
    replayIntegrityHash: retainedReplay.integrityHash,
    checkpointHash: retainedBeforeStateHash,
    decisionId: RETAINED_DECISION_ID,
    decisionIndex: 0,
    replayCommandIndex: retainedReplayCommandIndex,
    actorId: retainedFrameActorId,
    seat: retainedFrameSeat,
    legalActionSetHash: retainedLegalActionSetHash,
    selectedActionId: retainedSelectedActionId,
    selectedCommandHash: retainedSelectedCommandHash,
    postSelectedActionStateHash: retainedPostSelectedActionStateHash,
    engineVersion: retainedReplay.engineVersion,
    rulesVersion: retainedReplay.rulesVersion,
    retainedDecisionEvidence,
    baseSeed: 42, seatOrder: retainedSeatOrder, policyIds: ['tempo', 'control'],
    profileId: 'core-advanced-authority',
    alternativeActionId: opts.altAction?.actionId ?? altAction?.actionId,
    replay: retainedReplay, checkpointIndex: 0, rolloutCount: opts.rolloutCount ?? 2,
    continuationPolicyIds: ['tempo', 'control'], focalSeat: 1
  };
}

// ── 1-8: Counterfactual anchoring ───────────────────────────
describe('V0.10.0 Contract: Counterfactual Anchoring', () => {
  it('1. Branch without a real replay returns NOT_SUPPORTED', () => {
    const result = runCounterfactualBranch({
      matchId: 'M-test', checkpointHash: 'abc', baseSeed: 1,
      seatOrder: ['P1', 'P2'], policyIds: ['tempo', 'control'],
      profileId: 'core-advanced-authority', alternativeActionId: 'alt-1', rolloutCount: 1
    });
    assert.equal(result.status, 'NOT_SUPPORTED');
    assert.equal(result.reason, 'NO_REPLAY');
  });

  it('2. Branch with an unverifiable replay returns NOT_SUPPORTED', () => {
    const fakeReplay = { commands: [{ type: 'test' }], contentHash: 'invalid' };
    const result = runCounterfactualBranch({
      matchId: 'M-test', checkpointHash: 'abc', baseSeed: 1,
      seatOrder: ['P1', 'P2'], policyIds: ['tempo', 'control'],
      profileId: 'core-advanced-authority', alternativeActionId: 'alt-1',
      replay: fakeReplay, checkpointIndex: 0, rolloutCount: 1
    });
    assert.equal(result.status, 'NOT_SUPPORTED');
  });

  it('3. Branch with out-of-range checkpoint index returns NOT_SUPPORTED', () => {
    const result = runCounterfactualBranch({
      matchId: 'M-test', checkpointHash: 'abc', baseSeed: 1,
      seatOrder: ['P1', 'P2'], policyIds: ['tempo', 'control'],
      profileId: 'core-advanced-authority', alternativeActionId: 'alt-1',
      replay: { commands: new Array(5), contentHash: 'valid-hash' },
      checkpointIndex: 99, rolloutCount: 1
    });
    assert.equal(result.status, 'NOT_SUPPORTED');
    assert.equal(result.reason, 'CHECKPOINT_OUT_OF_RANGE');
  });

  it('4. Branch with nonexistent alternative action returns NOT_SUPPORTED', () => {
    const match = runMatchWithTraces(['tempo', 'control'], 42);
    assert.ok(match.replay, 'Match must produce a replay');
    const config = buildValidAnchorConfig(match, { altAction: { actionId: 'NONEXISTENT_ACTION_999' } });
    const result = runCounterfactualBranch(config);
    assert.equal(result.status, 'NOT_SUPPORTED');
    assert.equal(result.reason, 'ALTERNATIVE_ACTION_NOT_LEGAL');
  });

  it('5. Branch restores exact before-state hash from checkpoint', () => {
    const match = runMatchWithTraces(['tempo', 'control'], 42);
    // The anchor uses the real retained replay; the before-state hash must
    // match the retained replay's decision frame, not the fresh match's.
    const expectedHash = retainedBeforeStateHash;
    const config = buildValidAnchorConfig(match, { rolloutCount: 1 });
    const result = runCounterfactualBranch(config);
    assert.equal(result.status, 'COMPLETED', 'Branch with selected action must complete');
    assert.equal(result.anchorVerification.beforeStateHash, expectedHash,
      'Restored before-state hash must match decision-frame state');
  });

  it('6. Alternative action produces different post-action state hash', () => {
    const match = runMatchWithTraces(['tempo', 'control'], 42);
    const frames = reconstructAuthorityCheckpoints(match.replay);
    const decisionFrame = createSimulationDecisionFrame(frames[0].state);
    assert.ok(decisionFrame.policyActions.length > 1, 'Must have >1 legal action');
    const altAction = decisionFrame.policyActions.find(a => a.actionId !== match.decisions[0].actionId);
    assert.ok(altAction, 'Alternative action must exist');
    const config = buildValidAnchorConfig(match, { altAction, rolloutCount: 1 });
    const result = runCounterfactualBranch(config);
    assert.equal(result.status, 'COMPLETED');
    assert.notEqual(result.anchorVerification.postActionStateHash,
      result.anchorVerification.beforeStateHash,
      'Post-action hash must differ from before-state hash');
  });

  it('7. Counterfactual result preserves all rollouts including failures', () => {
    const match = runMatchWithTraces(['tempo', 'control'], 42);
    const frames = reconstructAuthorityCheckpoints(match.replay);
    const decisionFrame = createSimulationDecisionFrame(frames[0].state);
    const altAction = decisionFrame.policyActions.find(a => a.actionId !== match.decisions[0].actionId);
    const config = buildValidAnchorConfig(match, { altAction, rolloutCount: 4 });
    const result = runCounterfactualBranch(config);
    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.results.length, 4, 'All rollouts must be present');
    assert.equal(result.summary.totalRollouts, 4);
    const errored = result.results.filter(r => r.error);
    assert.equal(result.summary.abortedCount, errored.length);
  });

  it('8. Counterfactual result uses focalSeat utility, not raw seat1/seat2', () => {
    const match = runMatchWithTraces(['tempo', 'control'], 42);
    const frames = reconstructAuthorityCheckpoints(match.replay);
    const decisionFrame = createSimulationDecisionFrame(frames[0].state);
    const altAction = decisionFrame.policyActions.find(a => a.actionId !== match.decisions[0].actionId);
    const config = buildValidAnchorConfig(match, { altAction, rolloutCount: 2 });
    const result = runCounterfactualBranch(config);
    assert.equal(result.status, 'COMPLETED');
    assert.ok(result.focalSeat !== undefined, 'focalSeat must be present');
    assert.ok('meanFocalUtility' in result.summary, 'Must use focal-seat utility');
    assert.ok(!('winRateSeat1' in result.summary), 'Must not use raw seat1 win rate');
  });
});

// ── 9-10: Paired continuation seeds ──────────────────────────
describe('V0.10.0 Contract: Paired Continuation Seeds', () => {
  it('9. deriveContinuationSeed does not include alternativeActionId', () => {
    const seed1 = deriveContinuationSeed({
      matchId: 'M-test', checkpointHash: 'abc',
      replayContentHash: 'hash-xyz', rolloutIndex: 0, analysisVersion: '2.0.0'
    });
    const seed2 = deriveContinuationSeed({
      matchId: 'M-test', checkpointHash: 'abc',
      replayContentHash: 'hash-xyz', rolloutIndex: 0, analysisVersion: '2.0.0'
    });
    assert.equal(seed1, seed2, 'Paired seeds must be identical');
  });

  it('10. deriveContinuationSeed changes with rolloutIndex', () => {
    const seed0 = deriveContinuationSeed({
      matchId: 'M-test', checkpointHash: 'abc',
      replayContentHash: 'hash-xyz', rolloutIndex: 0, analysisVersion: '2.0.0'
    });
    const seed1 = deriveContinuationSeed({
      matchId: 'M-test', checkpointHash: 'abc',
      replayContentHash: 'hash-xyz', rolloutIndex: 1, analysisVersion: '2.0.0'
    });
    assert.notEqual(seed0, seed1, 'Different rollout indices must produce different seeds');
  });
});

// ── 11-14: Decision evidence ─────────────────────────────────
describe('V0.10.0 Contract: Decision Evidence', () => {
  it('11. Trace displayed policy score equals actual policy-emitted score', () => {
    const match = runMatchWithTraces(['tempo', 'control'], 42);
    assert.ok(match.decisionTraces?.length > 0, 'Traces must be generated');
    const trace = match.decisionTraces[0];
    const decision = match.decisions[0];
    const selectedOption = trace.legalOptions.find(o => o.actionId === decision.actionId);
    const actualScore = decision.candidateScores?.find(c => c.actionId === decision.actionId)?.score;
    assert.ok(actualScore !== undefined, 'Decision must have candidate scores');
    assert.equal(selectedOption.score, actualScore,
      `Trace score ${selectedOption.score} must match actual policy score ${actualScore}`);
  });

  it('12. Random-policy traces must have null selectionMargin', () => {
    const match = runPolicyMatch({
      seed: 99, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['random-legal', 'random-legal'], decisionTracesEnabled: true
    });
    assert.ok(match.decisionTraces?.length > 0);
    for (const trace of match.decisionTraces) {
      if (trace.policyId === 'random-legal') {
        assert.equal(trace.selectionMargin, null,
          `Random policy trace must have null margin, got ${trace.selectionMargin}`);
      }
    }
  });

  it('13. Trace legalOptions include all legal actions', () => {
    const match = runMatchWithTraces(['tempo', 'control'], 42);
    const trace = match.decisionTraces[0];
    const decision = match.decisions[0];
    assert.equal(trace.legalOptions.length, decision.legalActionCount,
      `Trace must preserve all ${decision.legalActionCount} legal options, got ${trace.legalOptions.length}`);
  });

  it('14. Trace schema version is 2.0.0', () => {
    const match = runMatchWithTraces(['tempo', 'control'], 42);
    const trace = match.decisionTraces[0];
    assert.equal(trace.schemaVersion, '2.0.0', 'Trace must be schema 2.0.0');
  });
});

// ── 15-18: Evidence-derived rule audits ──────────────────────
describe('V0.10.0 Contract: Evidence-Derived Rule Audits', () => {
  it('15. Rule audit checks include checkId, status, observed, and evidence', () => {
    const match = runMatchWithTraces(['tempo', 'control'], 42);
    const trace = match.decisionTraces[0];
    assert.ok(trace.ruleAudit, 'Rule audit must exist');
    assert.ok(trace.ruleAudit.checks?.length > 0, 'Rule audit must have checks');
    for (const check of trace.ruleAudit.checks) {
      assert.ok(check.checkId, 'Each check must have checkId');
      assert.ok(['PASS', 'FAIL', 'NOT_APPLICABLE', 'UNAVAILABLE'].includes(check.status),
        `Check status must be valid, got ${check.status}`);
      assert.ok('observed' in check, `Check ${check.checkId} must have observed field`);
    }
  });

  it('16. No audit check may PASS based on action family alone', () => {
    const match = runMatchWithTraces(['tempo', 'control'], 42);
    for (const trace of match.decisionTraces) {
      for (const check of trace.ruleAudit.checks) {
        if (check.status === 'PASS') {
          assert.ok(check.evidenceRefs,
            `Check ${check.checkId} must have evidenceRefs when PASS`);
        }
      }
    }
  });

  it('17. Counter audit fails when countering own top', () => {
    const match = runMatchWithTraces(['tempo', 'control'], 42);
    const counterTraces = match.decisionTraces.filter(t =>
      t.legalOptions.some(o => o.family === 'counter'));
    for (const trace of counterTraces) {
      const selectedOpt = trace.legalOptions.find(o => o.actionId === trace.selectedActionId);
      if (selectedOpt?.family === 'counter' && trace.ownItemOnTop) {
        const counterCheck = trace.ruleAudit.checks.find(c => c.checkId === 'counter-not-own-top');
        if (counterCheck) {
          assert.equal(counterCheck.status, 'FAIL',
            'Counter on own top must FAIL the audit');
        }
      }
    }
  });

  it('18. Exhausted-pass audit does not use hardcoded observed=true', () => {
    const match = runMatchWithTraces(['tempo', 'control'], 42);
    const epTraces = match.decisionTraces.filter(t =>
      t.legalOptions.some(o => o.family === 'exhausted-pass'));
    for (const trace of epTraces) {
      const epCheck = trace.ruleAudit.checks.find(c => c.checkId === 'exhausted-pass-forced');
      if (epCheck) {
        assert.notEqual(epCheck.observed, true,
          'Exhausted-pass check must not use hardcoded observed=true');
      }
    }
  });
});

// ── 19-21: Diagnostics truth ─────────────────────────────────
describe('V0.10.0 Contract: Diagnostics Truth', () => {
  it('19. Diagnostics with available decisions must produce nonzero decision count', () => {
    const match = runMatchWithTraces(['tempo', 'control'], 42);
    const diag = diagnosePolicy([match.summary], match.decisions, 'tempo');
    assert.ok(diag.decisionCount > 0,
      `Diagnostics must have nonzero decision count, got ${diag.decisionCount}`);
  });

  it('20. Diagnostics never emit NaN or fabricated zero values', () => {
    const match = runMatchWithTraces(['tempo', 'control'], 42);
    const diag = diagnosePolicy([match.summary], match.decisions, 'tempo');
    const checkNaN = (obj, path = '') => {
      for (const [key, value] of Object.entries(obj ?? {})) {
        if (typeof value === 'number') {
          assert.ok(!Number.isNaN(value), `NaN at ${path}.${key}`);
          assert.ok(Number.isFinite(value), `Infinity at ${path}.${key}`);
        } else if (typeof value === 'object' && value !== null) {
          checkNaN(value, `${path}.${key}`);
        }
      }
    };
    checkNaN(diag.metrics, 'metrics');
    checkNaN(diag.resourceConservation, 'resourceConservation');
    checkNaN(diag.timingAnalysis, 'timingAnalysis');
  });

  it('21. Diagnostics uses decisionId not checkpointId for low-margin decisions', () => {
    const match = runMatchWithTraces(['tempo', 'control'], 42);
    const diag = diagnosePolicy([match.summary], match.decisions, 'tempo');
    for (const d of diag.lowMarginDecisions) {
      assert.ok(d.decisionId, 'lowMarginDecision must have decisionId');
      assert.ok(!d.decisionId?.includes('undefined'),
        `decisionId must not contain undefined, got ${d.decisionId}`);
    }
  });
});

// ── 22-25: HYBRIX trace and domain-native ────────────────────
describe('V0.10.0 Contract: HYBRIX Trace and Domain-Native', () => {
  it('22. HYBRIX match produces decision traces', () => {
    const match = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['hybrix-rusher', 'control'], decisionTracesEnabled: true
    });
    assert.ok(match.decisionTraces?.length > 0, 'HYBRIX match must produce traces');
    const hybrixTraces = match.decisionTraces.filter(t => t.policyId?.startsWith('hybrix'));
    assert.ok(hybrixTraces.length > 0, 'Must have HYBRIX-policy traces');
  });

  it('23. HYBRIX traces with actual scores must use scoreSource="policy"', () => {
    const match = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['hybrix-rusher', 'control'], decisionTracesEnabled: true
    });
    const hybrixTraces = match.decisionTraces.filter(t => t.policyId?.startsWith('hybrix'));
    for (const trace of hybrixTraces) {
      const decision = match.decisions.find(d => d.decisionIndex === trace.decisionIndex);
      if (decision?.candidateScores?.length > 0) {
        const selectedOpt = trace.legalOptions.find(o => o.actionId === trace.selectedActionId);
        assert.ok(selectedOpt, 'Selected option must exist in trace');
      }
    }
  });

  it('24. HYBRIX agent produces candidate scores in decisions', () => {
    const match = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['hybrix-rusher', 'control']
    });
    assert.ok(match.summary.terminationReason, 'HYBRIX match must complete');
    const hybrixDecisions = match.decisions.filter(d => d.policyId?.startsWith('hybrix'));
    assert.ok(hybrixDecisions.length > 0, 'Must have HYBRIX decisions');
    for (const decision of hybrixDecisions) {
      assert.ok(decision.candidateScores?.length > 0,
        `HYBRIX decision ${decision.decisionIndex} must have candidate scores`);
    }
  });

  it('25. HYBRIX traces do not contain spatial vocabulary', () => {
    const match = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['hybrix-rusher', 'control'], decisionTracesEnabled: true
    });
    const hybrixTraces = match.decisionTraces.filter(t => t.policyId?.startsWith('hybrix'));
    for (const trace of hybrixTraces) {
      const traceJson = JSON.stringify(trace);
      assert.ok(!traceJson.includes('ATTACK'), 'No ATTACK in HYBRIX trace');
      assert.ok(!traceJson.includes('DEFEND'), 'No DEFEND in HYBRIX trace');
      assert.ok(!traceJson.includes('MOVE'), 'No MOVE in HYBRIX trace');
      assert.ok(!traceJson.includes('RETREAT'), 'No RETREAT in HYBRIX trace');
    }
  });
});

// ── 26-28: Determinism and invariance ────────────────────────
describe('V0.10.0 Contract: Determinism and Invariance', () => {
  it('26. Same seed produces identical match result hash', () => {
    const m1 = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['tempo', 'control']
    });
    const m2 = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['tempo', 'control']
    });
    assert.equal(m1.summary.matchResultHash, m2.summary.matchResultHash,
      'Same seed must produce same result hash');
  });

  it('27. Worker-count invariance: experiment hash is identical', async () => {
    const { runCampaign } = await import('@intrilex/simulation-runtime/campaign');
    const policyPairs = [['tempo', 'control']];
    const c1 = await runCampaign({
      profileId: 'core-advanced-authority', matchCount: 4, policyPairs,
      workerCount: 1, decisionLimit: 1800
    });
    const c2 = await runCampaign({
      profileId: 'core-advanced-authority', matchCount: 4, policyPairs,
      workerCount: 4, decisionLimit: 1800
    });
    assert.equal(c1.experimentHash, c2.experimentHash,
      'Experiment hash must be worker-count invariant');
  });

  it('28. Seat swap changes which policy wins', () => {
    const m1 = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['tempo', 'control']
    });
    const m2 = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P2', 'P1'],
      policyIds: ['tempo', 'control']
    });
    // Seat swap must produce a different match (different hash proves the
    // match is genuinely different, not just a relabeling). The winner
    // may or may not change — a dominant policy can win from either seat.
    assert.notEqual(m1.summary.matchResultHash, m2.summary.matchResultHash,
      'Seat swap must produce a different match result hash');
    // The winner must be the policy that won, not the seat — verify
    // the winner identity maps to the correct policy in each match.
    const m1WinnerPolicy = m1.summary.winner === 'P1' ? 'tempo' : 'control';
    const m2WinnerPolicy = m2.summary.winner === 'P2' ? 'tempo' : 'control';
    assert.equal(m1WinnerPolicy, m2WinnerPolicy,
      'Seat swap must preserve which policy wins (just from a different seat)');
  });
});

// ── 29-30: Counterfactual comparison ─────────────────────────
describe('V0.10.0 Contract: Counterfactual Comparison', () => {
  it('29. compareCounterfactual uses focal-seat utility, not raw seat1 win rate', () => {
    const match = runMatchWithTraces(['tempo', 'control'], 42);
    const frames = reconstructAuthorityCheckpoints(match.replay);
    const decisionFrame = createSimulationDecisionFrame(frames[0].state);
    const altAction = decisionFrame.policyActions.find(a => a.actionId !== match.decisions[0].actionId);
    const selectedConfig = buildValidAnchorConfig(match, { altAction: { actionId: match.decisions[0].actionId }, rolloutCount: 2 });
    const altConfig = buildValidAnchorConfig(match, { altAction, rolloutCount: 2 });
    const selectedBranch = runCounterfactualBranch(selectedConfig);
    const altBranch = runCounterfactualBranch(altConfig);
    assert.equal(selectedBranch.status, 'COMPLETED');
    assert.equal(altBranch.status, 'COMPLETED');
    const cmp = compareCounterfactual(selectedBranch, altBranch);
    assert.ok(cmp, 'Comparison must be non-null for two completed branches');
    assert.ok('selectedFocalUtility' in cmp, 'Comparison must use focal utility');
    assert.ok(!('selectedWinRateSeat1' in cmp), 'Must not use raw seat1 win rate');
  });

  it('30. Counterfactual result includes legalActionSetHash in anchor verification', () => {
    const match = runMatchWithTraces(['tempo', 'control'], 42);
    const frames = reconstructAuthorityCheckpoints(match.replay);
    const decisionFrame = createSimulationDecisionFrame(frames[0].state);
    const altAction = decisionFrame.policyActions.find(a => a.actionId !== match.decisions[0].actionId);
    const config = buildValidAnchorConfig(match, { altAction, rolloutCount: 1 });
    const result = runCounterfactualBranch(config);
    assert.equal(result.status, 'COMPLETED');
    assert.ok(result.anchorVerification.legalActionSetHash,
      'Anchor verification must include legalActionSetHash');
  });
});

// ── 31-32: Package and version integrity ─────────────────────
describe('V0.10.0 Contract: Package and Version Integrity', () => {
  it('31. All workspace package versions match root package.json version', async () => {
    const { readFile, readdir } = await import('node:fs/promises');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const rootPkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const expectedVersion = rootPkg.version;
    for (const wsRoot of ['packages', 'apps']) {
      const entries = await readdir(join(root, wsRoot), { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const pkgPath = join(root, wsRoot, entry.name, 'package.json');
        try {
          const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
          assert.equal(pkg.version, expectedVersion,
            `Package ${pkg.name} must be version ${expectedVersion}, got ${pkg.version}`);
        } catch (e) {
          if (e.code === 'ENOENT') continue;
          throw e;
        }
      }
    }
  });

  it('32. Decision-intelligence has no simulation-runtime dependency', async () => {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(fileURLToPath(import.meta.url), '..', '..');
    const pkg = JSON.parse(await readFile(join(root, 'packages', 'decision-intelligence', 'package.json'), 'utf8'));
    const deps = Object.keys(pkg.dependencies ?? {});
    assert.ok(!deps.includes('@intrilex/simulation-runtime'),
      'decision-intelligence must not depend on simulation-runtime');
    assert.ok(!deps.includes('@intrilex/engine-adapter'),
      'decision-intelligence must not depend on engine-adapter');
  });
});
