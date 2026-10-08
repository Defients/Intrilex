import test from 'node:test';
import assert from 'node:assert/strict';
import { labTrustVerdict, REQUIRED_SCENARIOS, verifyBaselineGameplay, readBuiltIdentity } from '../scripts/lab-trust-release.mjs';

const evidence = () => ({ sourceBefore: { digest: 'final-tree' }, sourceAfter: { digest: 'final-tree' },
  gates: [{ status: 'PASS', exitCode: 0 }], testResults: { tests: 7, pass: 6, fail: 0, cancelled: 0, skipped: 1, todo: 0 },
  scenarios: REQUIRED_SCENARIOS.map(name => ({ name, status: 'PASS', evidence: ['native-proof.log'] })),
  capabilities: { automaticPromotion: false, confirmatoryComparison: false, browserGames: 100, deepGames: 10, workers: 4, restrictedGames: [1000, 10000] },
  identity: { fingerprint: 'execution', analysisFingerprint: 'analysis' }, browserIdentities: Array.from({ length: 3 }, () => ({ fingerprint: 'execution', analysisFingerprint: 'analysis' })),
  baselineGameplay: { status: 'PASS', checks: Array.from({ length: 3 }, () => ({ status: 'PASS' })) } });
test('R10: complete local evidence remains explicitly separate from production approval', () => {
  const result = labTrustVerdict(evidence()); assert.equal(result.status, 'PASS'); assert.equal(result.productionApproval, false);
});
test('R10: missing, duplicated or unexecuted scenario evidence cannot pass', () => {
  for (const modify of [r => r.scenarios.pop(), r => { r.scenarios[1] = r.scenarios[0]; }, r => { r.scenarios[0].status = 'NOT_RUN'; }, r => { r.scenarios[0].evidence = []; }]) {
    const r = evidence(); modify(r); assert.ok(labTrustVerdict(r).blockers.includes('SCENARIO_EVIDENCE_INCOMPLETE'));
  }
});
test('R10: source drift, stale implementation or failed process invalidates release evidence', () => {
  for (const modify of [r => { r.sourceAfter.digest = 'changed'; }, r => { r.browserIdentities[0].fingerprint = 'old-build'; },
    r => { r.gates[0].exitCode = 1; }, r => { r.gates[0].status = 'NOT_RUN'; }, r => { r.browserIdentities = []; }, r => { r.baselineGameplay.status = 'NOT_RUN'; }]) {
    const r = evidence(); modify(r); assert.equal(labTrustVerdict(r).status, 'FAIL');
  }
});
test('R10: actual deterministic outcomes preserve the committed baseline fixture', async () => {
  const baseline = await verifyBaselineGameplay(); assert.equal(baseline.status, 'PASS'); assert.equal(baseline.checks.length, 3);
});
test('R10: built browser identity loads through a file URL on Windows and other platforms', async () => {
  const identity = await readBuiltIdentity(); assert.match(identity.fingerprint, /^[a-f0-9]{64}$/); assert.match(identity.analysisFingerprint, /^[a-f0-9]{64}$/);
});
test('R10: cancelled, unfinished and unreconciled test counts cannot appear as PASS', () => {
  for (const counts of [{ tests: 99 }, { cancelled: 1, pass: 5 }, { todo: 1, pass: 5 }, { fail: 1, pass: 5 }, { tests: 0, pass: 0, skipped: 0 }]) {
    const r = evidence(); Object.assign(r.testResults, counts); assert.ok(labTrustVerdict(r).blockers.includes('TEST_ACCOUNTING_INVALID'));
  }
});
test('R10: unvalidated scientific authority or larger browser tiers fail the local gate', () => {
  for (const caps of [{ automaticPromotion: true }, { confirmatoryComparison: true }, { browserGames: 1000 }, { deepGames: 100 }, { workers: 8 }, { restrictedGames: [] }]) {
    const r = evidence(); Object.assign(r.capabilities, caps); assert.ok(labTrustVerdict(r).blockers.includes('CAPABILITY_RESTRICTIONS_CHANGED'));
  }
});
