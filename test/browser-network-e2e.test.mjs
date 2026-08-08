// ═══════════════════════════════════════════════════════════════
// browser-network-e2e.test.mjs
// Gate 3b — Verifies the network lobby E2E certification report
// exists and all scenarios passed (or was gracefully skipped).
//
// This test is environment-dependent — it requires Chrome/Chromium
// and the match authority server. If Chrome is not available, the
// script writes a SKIPPED report and this test passes.
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const reportPath = join(root, 'reports', 'browser-network-e2e.json');

test('browser-network-e2e: certification report exists', () => {
  assert.ok(existsSync(reportPath), 'browser-network-e2e.json must exist — run scripts/browser-network-e2e.mjs');
});

test('browser-network-e2e: report has valid status (PASS or SKIPPED)', async () => {
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.ok(report.status === 'PASS' || report.status === 'SKIPPED' || report.allPassed !== undefined,
    `Report must have a valid status, got: ${report.status}`);
});

test('browser-network-e2e: all scenarios passed or skipped', async () => {
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  if (report.status === 'SKIPPED') {
    assert.equal(report.scenarioCount, 0, 'Skipped report must have 0 scenarios');
    return;
  }
  assert.equal(report.allPassed, true, 'All scenarios must pass');
  assert.equal(report.failedCount, 0, 'Must have 0 failures');
});

test('browser-network-e2e: network-lobby-renders scenario passed', async () => {
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  if (report.status === 'SKIPPED') return;
  const scenario = report.results.find(r => r.scenario === 'network-lobby-renders');
  assert.ok(scenario, 'network-lobby-renders scenario must exist');
  assert.equal(scenario.passed, true, 'network-lobby-renders must pass');
  assert.ok(scenario.details.hasLobby, 'Lobby must be rendered');
});

test('browser-network-e2e: network-create-match scenario passed', async () => {
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  if (report.status === 'SKIPPED') return;
  const scenario = report.results.find(r => r.scenario === 'network-create-match');
  assert.ok(scenario, 'network-create-match scenario must exist');
  assert.equal(scenario.passed, true, 'network-create-match must pass');
  assert.ok(scenario.details.inviteCode, 'Must have an invite code');
});

test('browser-network-e2e: network-join-match scenario passed', async () => {
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  if (report.status === 'SKIPPED') return;
  const scenario = report.results.find(r => r.scenario === 'network-join-match');
  assert.ok(scenario, 'network-join-match scenario must exist');
  assert.equal(scenario.passed, true, 'network-join-match must pass');
});

test('browser-network-e2e: network-opponent-connected scenario passed', async () => {
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  if (report.status === 'SKIPPED') return;
  const scenario = report.results.find(r => r.scenario === 'network-opponent-connected');
  assert.ok(scenario, 'network-opponent-connected scenario must exist');
  assert.equal(scenario.passed, true, 'network-opponent-connected must pass');
});

test('browser-network-e2e: network-ready-check scenario passed', async () => {
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  if (report.status === 'SKIPPED') return;
  const scenario = report.results.find(r => r.scenario === 'network-ready-check');
  assert.ok(scenario, 'network-ready-check scenario must exist');
  assert.equal(scenario.passed, true, 'network-ready-check must pass');
});

test('browser-network-e2e: network-privacy-check scenario passed', async () => {
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  if (report.status === 'SKIPPED') return;
  const scenario = report.results.find(r => r.scenario === 'network-privacy-check');
  assert.ok(scenario, 'network-privacy-check scenario must exist');
  assert.equal(scenario.passed, true, 'network-privacy-check must pass');
  assert.equal(scenario.details.hasSeed, false, 'No seed in DOM');
  assert.equal(scenario.details.hasCommandVault, false, 'No command vault in DOM');
});
