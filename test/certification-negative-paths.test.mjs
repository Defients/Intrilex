// ═══════════════════════════════════════════════════════════════
// certification-negative-paths.test.mjs
// Phase 2 negative-path tests: prove the certification gates fail
// closed on stale, failed, timed-out, missing, and NOT_RUN evidence.
// These tests prevent "green-by-existence" regressions.
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── Test: consumeReport rejects stale reports (wrong gitCommit) ──

test('Phase 2 negative: consumeReport returns STALE for wrong gitCommit', async () => {
  const { consumeReport } = await import('../scripts/certification-gates.mjs');
  // Create a temporary stale report
  const tmpDir = path.join(root, 'reports/_neg-test');
  await mkdir(tmpDir, { recursive: true });
  const tmpReport = path.join(tmpDir, 'stale-report.json');
  const staleReport = {
    status: 'PASS',
    provenance: {
      gitCommit: '0000000000000000000000000000000000000000',
      mode: 'full',
    },
  };
  await writeFile(tmpReport, JSON.stringify(staleReport, null, 2));
  // consumeReport uses ROOT-relative paths, so we need to use the relative path
  const relPath = 'reports/_neg-test/stale-report.json';
  const state = consumeReport(relPath, 'local', 'PASS');
  assert.equal(state.status, 'STALE',
    `consumeReport should return STALE for wrong gitCommit, got ${state.status}`);
  assert.ok(state.blockers.length > 0, 'STALE state must have blockers');
  // Cleanup
  await rm(tmpDir, { recursive: true, force: true });
});

// ── Test: consumeReport rejects failed reports ──

test('Phase 2 negative: consumeReport returns FAIL for failed report', async () => {
  const { consumeReport } = await import('../scripts/certification-gates.mjs');
  const tmpDir = path.join(root, 'reports/_neg-test');
  await mkdir(tmpDir, { recursive: true });
  const tmpReport = path.join(tmpDir, 'failed-report.json');
  const failedReport = { status: 'FAIL' };
  await writeFile(tmpReport, JSON.stringify(failedReport, null, 2));
  const relPath = 'reports/_neg-test/failed-report.json';
  const state = consumeReport(relPath, 'local', 'PASS');
  assert.equal(state.status, 'FAIL',
    `consumeReport should return FAIL for failed report, got ${state.status}`);
  assert.ok(state.blockers.length > 0, 'FAIL state must have blockers');
  await rm(tmpDir, { recursive: true, force: true });
});

// ── Test: consumeReport returns NOT_RUN for missing reports ──

test('Phase 2 negative: consumeReport returns NOT_RUN for missing report', async () => {
  const { consumeReport } = await import('../scripts/certification-gates.mjs');
  const state = consumeReport('reports/nonexistent-report.json', 'local', 'PASS');
  assert.equal(state.status, 'NOT_RUN',
    `consumeReport should return NOT_RUN for missing report, got ${state.status}`);
  assert.ok(state.blockers.length > 0, 'NOT_RUN state must have blockers');
});

// ── Test: consumeReport rejects quick-mode reports as STALE ──

test('Phase 2 negative: consumeReport rejects quick-mode report as STALE', async () => {
  const { consumeReport, gitHead } = await import('../scripts/certification-gates.mjs');
  const tmpDir = path.join(root, 'reports/_neg-test');
  await mkdir(tmpDir, { recursive: true });
  const tmpReport = path.join(tmpDir, 'quick-report.json');
  const quickReport = {
    status: 'PASS',
    provenance: {
      gitCommit: gitHead(), // correct commit but quick mode
      mode: 'quick',
    },
  };
  await writeFile(tmpReport, JSON.stringify(quickReport, null, 2));
  const relPath = 'reports/_neg-test/quick-report.json';
  const state = consumeReport(relPath, 'local', 'PASS');
  assert.equal(state.status, 'STALE',
    `consumeReport should return STALE for quick-mode report, got ${state.status}`);
  await rm(tmpDir, { recursive: true, force: true });
});

// ── Test: runControl captures failing commands ──

test('Phase 2 negative: runControl returns FAIL for failing command', async () => {
  const { runControl } = await import('../scripts/certification-gates.mjs');
  // Run a command that exits with status 1
  const state = runControl('node', ['-e', 'process.exit(1)'], 'local', 5000);
  assert.equal(state.status, 'FAIL',
    `runControl should return FAIL for exit(1), got ${state.status}`);
  assert.equal(state.exitCode, 1, 'exitCode should be 1');
  assert.ok(state.blockers.length > 0, 'FAIL state must have blockers');
});

// ── Test: runControl captures timeout ──

test('Phase 2 negative: runControl returns FAIL for timed-out command', async () => {
  const { runControl } = await import('../scripts/certification-gates.mjs');
  // Run a command that sleeps longer than the timeout
  const state = runControl('node', ['-e', 'setTimeout(() => {}, 10000)'], 'local', 500);
  assert.equal(state.status, 'FAIL',
    `runControl should return FAIL for timeout, got ${state.status}`);
  assert.equal(state.timedOut, true, 'timedOut should be true');
  assert.ok(state.blockers.length > 0, 'timed-out state must have blockers');
});

// ── Test: runControl captures spawn errors ──

test('Phase 2 negative: runControl returns FAIL for spawn error', async () => {
  const { runControl } = await import('../scripts/certification-gates.mjs');
  // Try to run a nonexistent command
  const state = runControl('nonexistent-command-xyz', [], 'local', 5000);
  assert.equal(state.status, 'FAIL',
    `runControl should return FAIL for spawn error, got ${state.status}`);
  assert.ok(state.blockers.length > 0, 'spawn-error state must have blockers');
});

// ── Test: notRunState produces NOT_RUN with blockers ──

test('Phase 2 negative: notRunState produces NOT_RUN with blockers', async () => {
  const { notRunState } = await import('../scripts/certification-gates.mjs');
  const state = notRunState('human', 'No sessions conducted', ['Sessions must be conducted']);
  assert.equal(state.status, 'NOT_RUN', 'notRunState should return NOT_RUN');
  assert.equal(state.scope, 'human', 'scope should be human');
  assert.ok(state.blockers.length > 0, 'NOT_RUN state must have blockers');
});

// ── Test: human validation gate returns passed=false when no sessions ──

test('Phase 2 negative: human validation gate fails when no session records exist', async () => {
  const { CERTIFICATION_GATES } = await import('../scripts/certification-gates.mjs');
  const result = CERTIFICATION_GATES['human-validation'].fn();
  assert.equal(result.passed, false,
    'Human validation gate must return passed=false when no session records exist');
  assert.ok(result.gaps.some(g => g.includes('NOT_RUN') || g.includes('BLOCKING')),
    'Human validation gaps must mention NOT_RUN or BLOCKING');
  // Verify the session-records control is NOT_RUN
  const sessionControl = result.controls?.find(c => c.name === 'session-records');
  assert.ok(sessionControl, 'Must have session-records control');
  assert.equal(sessionControl.status, 'NOT_RUN',
    `session-records control must be NOT_RUN, got ${sessionControl.status}`);
});

// ── Test: NOT_RUN never counts as PASS in the overall verdict ──

test('Phase 2 negative: NOT_RUN gates do not count as passed in overall verdict', async () => {
  const { runAllGates } = await import('../scripts/certification-gates.mjs');
  const result = runAllGates();
  // Human validation should be NOT_RUN → overall should NOT be passed
  // (unless actual sessions exist, which they don't)
  if (!existsSync(path.join(root, 'reports/human-validation-sessions.json'))) {
    assert.equal(result.passed, false,
      'Overall certification must not pass when human validation is NOT_RUN');
    assert.ok(result.failedCriticalGates.includes('human-validation'),
      'human-validation must be in failedCriticalGates');
  }
  // Verify external blockers are collected
  assert.ok(result.externalBlockers.length > 0,
    'Must have external blockers (at minimum, human validation and CI)');
});

// ── Test: evidence-state objects have required schema fields ──

test('Phase 2 negative: evidence-state objects have required schema fields', async () => {
  const { runControl, consumeReport, notRunState } = await import('../scripts/certification-gates.mjs');
  const requiredFields = [
    'status', 'scope', 'command', 'startedAt', 'completedAt',
    'exitCode', 'signal', 'timedOut', 'gitCommit', 'gitTree',
    'dirty', 'lockfileSha256', 'artifactSha256', 'evidencePath',
    'summary', 'blockers', 'residualRisks',
  ];

  const states = [
    runControl('node', ['-e', 'process.exit(0)'], 'local', 5000),
    consumeReport('reports/self-audit.json', 'local', 'PASS'),
    notRunState('ci', 'CI not run', ['Must push and verify']),
  ];

  for (const state of states) {
    for (const field of requiredFields) {
      assert.ok(field in state, `Evidence state must have field '${field}': ${JSON.stringify(Object.keys(state))}`);
    }
    assert.ok(['PASS', 'FAIL', 'NOT_RUN', 'NOT_APPLICABLE', 'BLOCKED', 'STALE'].includes(state.status),
      `status must be a valid evidence state, got ${state.status}`);
  }
});
