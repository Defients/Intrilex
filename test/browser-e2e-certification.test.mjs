// ═══════════════════════════════════════════════════════════════
// browser-e2e-certification.test.mjs
// Gate 3 — Verifies the browser E2E certification report exists
// and all 6 scenarios passed with real Chrome.
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const reportPath = join(root, 'reports', 'browser-e2e-certification.json');

test('browser-e2e: certification report exists', () => {
  assert.ok(existsSync(reportPath), 'browser-e2e-certification.json must exist — run scripts/browser-e2e-certification.mjs');
});

test('browser-e2e: report has Chrome version', async () => {
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.ok(report.chromeVersion, 'Report must include Chrome version');
  assert.match(report.chromeVersion, /Chrome|Chromium/, 'Must be a real Chrome/Chromium version');
});

test('browser-e2e: all 6 scenarios passed', async () => {
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.equal(report.allPassed, true, 'All scenarios must pass');
  assert.equal(report.passedCount, 6, 'Must have 6 passing scenarios');
  assert.equal(report.failedCount, 0, 'Must have 0 failures');
});

test('browser-e2e: active-match-e2e scenario passed', async () => {
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const scenario = report.results.find(r => r.scenario === 'active-match-e2e');
  assert.ok(scenario, 'active-match-e2e scenario must exist');
  assert.equal(scenario.passed, true, 'active-match-e2e must pass');
  assert.ok(scenario.details.matchStarted, 'Match must have started');
  assert.ok(scenario.details.actionCount > 0, 'Must have actions available');
});

test('browser-e2e: two-tab-lease-conflict scenario passed', async () => {
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const scenario = report.results.find(r => r.scenario === 'two-tab-lease-conflict');
  assert.ok(scenario, 'two-tab-lease-conflict scenario must exist');
  assert.equal(scenario.passed, true, 'two-tab-lease-conflict must pass');
});

test('browser-e2e: save-reload-roundtrip scenario passed', async () => {
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const scenario = report.results.find(r => r.scenario === 'save-reload-roundtrip');
  assert.ok(scenario, 'save-reload-roundtrip scenario must exist');
  assert.equal(scenario.passed, true, 'save-reload-roundtrip must pass');
});

test('browser-e2e: tampered-import-rejection scenario passed', async () => {
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const scenario = report.results.find(r => r.scenario === 'tampered-import-rejection');
  assert.ok(scenario, 'tampered-import-rejection scenario must exist');
  assert.equal(scenario.passed, true, 'tampered-import-rejection must pass');
  assert.ok(scenario.details.results.length >= 7, 'Must test at least 7 tamper cases');
});

test('browser-e2e: privacy-accessibility-responsive scenario passed', async () => {
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const scenario = report.results.find(r => r.scenario === 'privacy-accessibility-responsive');
  assert.ok(scenario, 'privacy-accessibility-responsive scenario must exist');
  assert.equal(scenario.passed, true, 'privacy-accessibility-responsive must pass');
  assert.equal(scenario.details.privacy.visiblePrivateCount, 0, 'No private info must be visible');
  assert.ok(scenario.details.accessibility.hasSkipLink, 'Must have skip link');
});

test('browser-e2e: terminal-evidence-navigation scenario passed', async () => {
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const scenario = report.results.find(r => r.scenario === 'terminal-evidence-navigation');
  assert.ok(scenario, 'terminal-evidence-navigation scenario must exist');
  assert.equal(scenario.passed, true, 'terminal-evidence-navigation must pass');
  assert.ok(scenario.details.reachedTerminal, 'Must reach terminal state');
});
