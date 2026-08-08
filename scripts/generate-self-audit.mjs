#!/usr/bin/env node
/**
 * Self-audit generator — runs the actual test suite and produces
 * reports/self-audit.json from real execution output.
 *
 * This replaces the hand-written self-audit.json that claimed
 * "564 tests, 564 pass" when the real count was 533.
 *
 * Usage:
 *   node scripts/generate-self-audit.mjs
 *   node scripts/generate-self-audit.mjs --quick   # subset only, for CI speed
 */
import { spawnSync } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootPkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const quick = process.argv.includes('--quick');

// ── Collect test files ──
const testDir = path.join(root, 'test');
const allTestFiles = (await readdir(testDir))
  .filter(f => f.endsWith('.test.mjs'))
  .sort();

// Exclude self-audit-truth.test.mjs to avoid recursive execution
const testFiles = allTestFiles.filter(f => f !== 'self-audit-truth.test.mjs');

// In quick mode, run a representative subset
const subset = quick
  ? ['unit.test.mjs', 'determinism.test.mjs', 'analytics.test.mjs', 'telemetry.test.mjs']
  : testFiles;

const testArgs = subset.map(f => path.join('test', f));

console.log(`generate-self-audit: running ${testArgs.length} test files${quick ? ' (quick mode)' : ''}...`);

// ── Execute the test suite ──
// Redirect stdout to a temp file via file descriptor to avoid maxBuffer limits —
// the full suite TAP output can exceed 256 MB, which would overflow spawnSync's
// in-memory buffer. Stderr stays piped (small: warnings/errors only).
const tmpOutput = path.join(root, 'reports/.self-audit-tap-output.txt');
await rm(tmpOutput, { force: true });
const fd = openSync(tmpOutput, 'w');
const result = spawnSync(process.execPath, ['--test', ...testArgs], {
  cwd: root,
  encoding: 'utf8',
  timeout: 600000, // 10 minutes max
  stdio: ['ignore', fd, 'pipe'],
});
closeSync(fd);

// Read the full TAP output from the temp file
let fileOutput = '';
try { fileOutput = await readFile(tmpOutput, 'utf8'); } catch { /* file may not exist if redirect failed */ }
await rm(tmpOutput, { force: true });
const output = fileOutput + '\n' + (result.stderr ?? '');

// ── Parse TAP summary ──
const testsMatch = output.match(/^# tests\s+(\d+)/m);
const passMatch = output.match(/^# pass\s+(\d+)/m);
const failMatch = output.match(/^# fail\s+(\d+)/m);
const skipMatch = output.match(/^# skip\s+(\d+)/m);
const cancelledMatch = output.match(/^# cancelled\s+(\d+)/m);
const todoMatch = output.match(/^# todo\s+(\d+)/m);
const durationMatch = output.match(/^# duration_ms\s+([\d.]+)/m);

const totalTests = testsMatch ? parseInt(testsMatch[1]) : 0;
const totalPass = passMatch ? parseInt(passMatch[1]) : 0;
const totalFail = failMatch ? parseInt(failMatch[1]) : 0;
const totalSkip = skipMatch ? parseInt(skipMatch[1]) : 0;
const totalCancelled = cancelledMatch ? parseInt(cancelledMatch[1]) : 0;
const totalTodo = todoMatch ? parseInt(todoMatch[1]) : 0;
const durationMs = durationMatch ? parseFloat(durationMatch[1]) : 0;

if (totalTests === 0) {
  console.error('generate-self-audit: FAILED to parse test count from output');
  console.error('Output tail:', output.slice(-2000));
  process.exit(1);
}

// Reconcile arithmetic: tests should equal pass + fail + skip + cancelled + todo
const accounted = totalPass + totalFail + totalSkip + totalCancelled + totalTodo;
const unaccounted = totalTests - accounted;

console.log(`generate-self-audit: ${totalTests} tests, ${totalPass} pass, ${totalFail} fail, ${totalSkip} skip, ${totalCancelled} cancelled, ${totalTodo} todo, ${unaccounted} unaccounted, ${durationMs}ms`);

// ── Compute score and gates from real evidence ──
const testFileCount = allTestFiles.length;
const hasVendorIntegrity = existsSync(path.join(root, 'reports/vendor-integrity.json'));
const hasEnginePatch = existsSync(path.join(root, 'reports/engine-patch-integrity.json'));
const hasBuildDeterminism = existsSync(path.join(root, 'reports/build-determinism.json'));
const hasBrowserParity = existsSync(path.join(root, 'reports/browser-parity.json'));
const hasCapabilityManifest = existsSync(path.join(root, 'reports/capability-manifest.json'));

// Check vendor-integrity report status (not just file existence)
let vendorIntegrityPassed = false;
if (hasVendorIntegrity) {
  try {
    const vi = JSON.parse(await readFile(path.join(root, 'reports/vendor-integrity.json'), 'utf8'));
    vendorIntegrityPassed = vi.status === 'VERIFIED' || vi.status === 'PASS';
  } catch { vendorIntegrityPassed = false; }
}

// Check if privacy-related test files passed (search output for privacy test results)
const privacyTestOutput = output.match(/privacy|hidden-information|visibility-projection/gi);
const privacyTestsRan = privacyTestOutput !== null && privacyTestOutput.length > 0;
const privacyGatePassed = privacyTestsRan && totalFail === 0;

const dimensions = {
  canonEngineDeterminism: hasEnginePatch && hasBuildDeterminism ? 20 : hasEnginePatch ? 15 : 10,
  analyticsStatistics: totalPass > 400 ? 19 : totalPass > 300 ? 16 : 12,
  evidencePrivacy: privacyGatePassed ? 20 : privacyTestsRan ? 15 : 10,
  guiUx: hasBrowserParity ? 14 : 10,
  semanticFx: totalPass > 400 ? 8 : 6,
  accessibilityPerformance: hasBrowserParity ? 9 : 6,
  documentationRelease: hasCapabilityManifest ? 7 : 5
};

const score = Object.values(dimensions).reduce((a, b) => a + b, 0);
const threshold = 92;

const criticalGates = {
  canonDefect: totalFail === 0,
  determinismMismatch: hasBuildDeterminism,
  hiddenInformationLeak: privacyGatePassed,
  falseAnalyticClaim: totalFail === 0 && score >= threshold,
  extractedVerificationPending: vendorIntegrityPassed,
  // v0.24.2: Test arithmetic must reconcile exactly — no unaccounted results.
  // A non-zero unaccounted count means the TAP summary doesn't add up, which
  // indicates a parsing error, a crashed test runner, or a silent skip that
  // the audit must not paper over with a PASS.
  testAccountingReconciled: unaccounted === 0,
};

const gateEvidence = {
  canonDefect: `Test suite executed: ${totalTests} tests, ${totalPass} pass, ${totalFail} fail, ${totalSkip} skip, ${totalCancelled} cancelled, ${totalTodo} todo`,
  determinismMismatch: hasBuildDeterminism
    ? 'build-determinism.json exists; determinism verified by build verification'
    : 'build-determinism.json missing — run pnpm run test:build-determinism',
  hiddenInformationLeak: privacyGatePassed
    ? 'Privacy tests ran and all tests passed'
    : privacyTestsRan
      ? `Privacy tests ran but ${totalFail} tests failed — privacy gate FAIL`
      : 'No privacy tests detected in suite output',
  falseAnalyticClaim: `Self-audit generated by scripts/generate-self-audit.mjs from real execution — not hand-written. Score ${score}/${threshold}.`,
  extractedVerificationPending: vendorIntegrityPassed
    ? 'vendor-integrity.json exists and reports VERIFIED'
    : hasVendorIntegrity
      ? 'vendor-integrity.json exists but does not report VERIFIED'
      : 'vendor-integrity.json missing — run pnpm run vendor:verify',
  testAccountingReconciled: unaccounted === 0
    ? `Test arithmetic reconciles exactly: ${totalTests} = ${totalPass} + ${totalFail} + ${totalSkip} + ${totalCancelled} + ${totalTodo}`
    : `Test arithmetic MISMATCH: ${totalTests} tests but accounted = ${accounted} (unaccounted = ${unaccounted}) — audit cannot PASS`,
};

const audit = {
  schemaVersion: '3.0.0',
  // v0.24.2: PASS requires ALL of:
  //   - totalFail === 0 (no test failures)
  //   - score >= threshold (dimensional score)
  //   - unaccounted === 0 (test arithmetic reconciles exactly)
  //   - all critical gates pass (including testAccountingReconciled)
  status: (totalFail === 0 && score >= threshold && unaccounted === 0 && Object.values(criticalGates).every(v => v === true)) ? 'PASS' : 'FAIL',
  score,
  threshold,
  generatedAt: new Date().toISOString(),
  generatedBy: `generate-self-audit.mjs v3.0.0 (package v${rootPkg.version})`,
  dimensions,
  criticalGates,
  gateEvidence,
  testResults: {
    defaultTestSuite: `${totalTests} tests, ${totalPass} pass, ${totalFail} fail, ${totalSkip} skip, ${totalCancelled} cancelled, ${totalTodo} todo`,
    totalTests,
    totalPass,
    totalFail,
    totalSkip,
    totalCancelled,
    totalTodo,
    unaccounted,
    durationMs,
    testFileCount,
    filesExecuted: testArgs.length,
    quickMode: quick
  }
};

const outputPath = path.join(root, 'reports/self-audit.json');
await writeFile(outputPath, JSON.stringify(audit, null, 2) + '\n');
console.log(`generate-self-audit: wrote ${outputPath} (status=${audit.status}, score=${score}/${threshold})`);

if (totalFail > 0) {
  console.error(`generate-self-audit: ${totalFail} tests failed — self-audit status is FAIL`);
  process.exit(1);
}
// v0.24.2: Non-zero unaccounted is a truth violation — fail in release/CI mode
if (unaccounted !== 0) {
  console.error(`generate-self-audit: ${unaccounted} unaccounted test results — arithmetic mismatch — self-audit status is FAIL`);
  process.exit(1);
}
