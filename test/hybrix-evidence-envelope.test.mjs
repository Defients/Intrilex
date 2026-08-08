import test from 'node:test';
import assert from 'node:assert/strict';
import { runPolicyMatch } from '@intrilex/simulation-runtime';
import { hashCanonical } from '@intrilex/shared';

const baseMatch = (overrides = {}) => ({
  ordinal: 1, seed: 42, profileId: 'core-advanced-authority',
  seatOrder: ['P1', 'P2'], policyIds: ['hybrix-rusher', 'score-rush'],
  decisionLimit: 200, ...overrides
});

function firstHybrixDecision(result) {
  const traces = result.decisionTraces ?? [];
  const hybrixTraces = traces.filter(t => t.policyId?.startsWith('hybrix-'));
  return hybrixTraces[0] ?? null;
}

function decisionEnvelope(trace) {
  if (!trace) return null;
  return {
    policyId: trace.policyId,
    decisionKind: trace.decisionKind,
    turn: trace.turn,
    phase: trace.phase,
    selectionMargin: trace.selectionMargin,
    actionId: trace.actionId,
    reasonCodes: trace.reasonCodes,
    ruleAuditStatus: trace.ruleAudit?.status,
    hybrixTraceKeys: trace.hybrixTrace ? Object.keys(trace.hybrixTrace).sort() : (trace.metadata?.hybrixTrace ? Object.keys(trace.metadata.hybrixTrace).sort() : null)
  };
}

test('HYBRIX repeat: two identical runs produce identical first-decision envelopes', () => {
  const r1 = runPolicyMatch(baseMatch({ decisionTracesEnabled: true }));
  const r2 = runPolicyMatch(baseMatch({ decisionTracesEnabled: true }));
  const d1 = firstHybrixDecision(r1);
  const d2 = firstHybrixDecision(r2);
  if (!d1 || !d2) return; // No HYBRIX traces — skip if match has none
  assert.deepEqual(decisionEnvelope(d1), decisionEnvelope(d2),
    'First HYBRIX decision envelope must be identical across repeats');
});

test('HYBRIX repeat: two identical runs produce identical match result hashes', () => {
  const r1 = runPolicyMatch(baseMatch());
  const r2 = runPolicyMatch(baseMatch());
  assert.equal(r1.summary.matchResultHash, r2.summary.matchResultHash,
    'Match result hash must be identical across repeats');
});

test('HYBRIX repeat: two identical runs produce identical canonical result hashes', () => {
  const r1 = runPolicyMatch(baseMatch());
  const r2 = runPolicyMatch(baseMatch());
  assert.equal(hashCanonical(r1.summary), hashCanonical(r2.summary),
    'Canonical summary hash must be identical across repeats');
});

test('HYBRIX interleave: running match A between two runs of match B does not change B', () => {
  const rB1 = runPolicyMatch(baseMatch({ decisionTracesEnabled: true }));
  runPolicyMatch(baseMatch({ ordinal: 2, seed: 99, policyIds: ['hybrix-rusher', 'control'] }));
  const rB2 = runPolicyMatch(baseMatch({ decisionTracesEnabled: true }));
  assert.equal(rB1.summary.matchResultHash, rB2.summary.matchResultHash,
    'Match B result hash must not change after interleaving match A');
  const d1 = firstHybrixDecision(rB1);
  const d2 = firstHybrixDecision(rB2);
  if (d1 && d2) {
    assert.deepEqual(decisionEnvelope(d1), decisionEnvelope(d2),
      'First HYBRIX decision envelope must not change after interleaving');
  }
});

test('HYBRIX interleave: different opponents produce different match outcomes', () => {
  const r1 = runPolicyMatch(baseMatch({ policyIds: ['hybrix-rusher', 'score-rush'], decisionTracesEnabled: true }));
  const r2 = runPolicyMatch(baseMatch({ policyIds: ['hybrix-rusher', 'control'], decisionTracesEnabled: true }));
  // Match result hashes must differ when facing different opponents
  assert.notEqual(r1.summary.matchResultHash, r2.summary.matchResultHash,
    'Match result hash must differ when facing different opponents');
  // At least one HYBRIX decision in the trace should differ (not necessarily the first)
  const t1 = (r1.decisionTraces ?? []).filter(t => t.policyId?.startsWith('hybrix-'));
  const t2 = (r2.decisionTraces ?? []).filter(t => t.policyId?.startsWith('hybrix-'));
  if (t1.length && t2.length) {
    const minLen = Math.min(t1.length, t2.length);
    let anyDiff = false;
    for (let i = 0; i < minLen; i++) {
      const e1 = decisionEnvelope(t1[i]);
      const e2 = decisionEnvelope(t2[i]);
      if (e1.selectionMargin !== e2.selectionMargin || e1.actionId !== e2.actionId) {
        anyDiff = true;
        break;
      }
    }
    assert.ok(anyDiff, 'At least one HYBRIX decision should differ when facing different opponents');
  }
});

test('HYBRIX worker parity: single-worker and multi-worker produce identical results', () => {
  const r1 = runPolicyMatch(baseMatch({ workerCount: 1 }));
  const r2 = runPolicyMatch(baseMatch({ workerCount: 4 }));
  assert.equal(r1.summary.matchResultHash, r2.summary.matchResultHash,
    'Worker count must not affect HYBRIX match result hash');
});

test('HYBRIX self-play: both HYBRIX agents produce independent traces', () => {
  const result = runPolicyMatch(baseMatch({
    policyIds: ['hybrix-rusher', 'hybrix-defender'],
    decisionTracesEnabled: true
  }));
  const traces = result.decisionTraces ?? [];
  const rusherTraces = traces.filter(t => t.policyId === 'hybrix-rusher');
  const defenderTraces = traces.filter(t => t.policyId === 'hybrix-defender');
  assert.ok(rusherTraces.length > 0, 'HYBRIX rusher must produce traces');
  assert.ok(defenderTraces.length > 0, 'HYBRIX defender must produce traces');
  // Both agents should have independent decision envelopes
  if (rusherTraces[0] && defenderTraces[0]) {
    const rEnv = decisionEnvelope(rusherTraces[0]);
    const dEnv = decisionEnvelope(defenderTraces[0]);
    assert.notEqual(rEnv.policyId, dEnv.policyId,
      'Self-play HYBRIX agents must have distinct policy IDs');
  }
});

test('HYBRIX trace provenance: decision traces carry hybrixTrace evidence from agent', () => {
  const result = runPolicyMatch(baseMatch({ decisionTracesEnabled: true }));
  const traces = result.decisionTraces ?? [];
  const hybrixTraces = traces.filter(t => t.policyId?.startsWith('hybrix-'));
  if (hybrixTraces.length > 0) {
    const first = hybrixTraces[0];
    const hybrixTrace = first.hybrixTrace ?? first.metadata?.hybrixTrace;
    assert.ok(hybrixTrace,
      'HYBRIX decision trace must carry hybrixTrace evidence');
  }
});

test('HYBRIX trace provenance: hybrixTrace contains expected agent evidence fields', () => {
  const result = runPolicyMatch(baseMatch({ decisionTracesEnabled: true }));
  const traces = result.decisionTraces ?? [];
  const hybrixTraces = traces.filter(t => t.policyId?.startsWith('hybrix-'));
  if (hybrixTraces.length > 0) {
    const first = hybrixTraces[0];
    const hybrixTrace = first.hybrixTrace ?? first.metadata?.hybrixTrace;
    if (hybrixTrace) {
      // Known-positive fixture: verify the agent evidence envelope
      assert.ok(hybrixTrace.selectedAction, 'hybrixTrace must contain selectedAction');
      assert.ok(hybrixTrace.score !== undefined, 'hybrixTrace must contain score');
      assert.ok(hybrixTrace.btNode, 'hybrixTrace must contain btNode (behavior tree node)');
      assert.ok(hybrixTrace.personalityModifiers, 'hybrixTrace must contain personalityModifiers');
      assert.ok(hybrixTrace.memoryPatterns !== undefined, 'hybrixTrace must contain memoryPatterns');
      assert.ok(hybrixTrace.failsafeTriggered !== undefined, 'hybrixTrace must contain failsafeTriggered');
    }
  }
});

test('HYBRIX determinism: match result hash is stable across 8 consecutive runs', () => {
  const hashes = [];
  for (let i = 0; i < 8; i++) {
    const result = runPolicyMatch(baseMatch());
    hashes.push(result.summary.matchResultHash);
  }
  const unique = new Set(hashes);
  assert.equal(unique.size, 1,
    `8 identical runs should produce 1 unique hash, got ${unique.size}`);
});
