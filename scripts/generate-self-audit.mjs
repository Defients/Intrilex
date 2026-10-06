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
import { openSync, closeSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile, writeFile, readdir, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureProvenance, releaseProvenanceProblems, evidenceProvenanceProblems } from './release-provenance.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootPkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const quick = process.argv.includes('--quick');
const releaseMode = process.argv.includes('--release');
const initialProvenance = captureProvenance(root);
if (releaseMode) {
  const blockers = releaseProvenanceProblems(initialProvenance);
  if (quick) blockers.push('Release audit cannot use --quick.');
  if (blockers.length) { console.error(blockers.join('\n')); process.exit(1); }
  const integrity = spawnSync(process.execPath, ['scripts/engine-patch-integrity.mjs', 'verify'], {
    cwd: root, stdio: 'inherit', env: { ...process.env, INTRILEX_WRITE_REPORTS: '0' },
  });
  if (integrity.status !== 0) process.exit(1);
}

const configuredConcurrency = Number.parseInt(process.env.INTRILEX_TEST_CONCURRENCY ?? '4', 10);
const testConcurrency = Number.isInteger(configuredConcurrency) && configuredConcurrency > 0
  ? configuredConcurrency
  : 4;
const configuredTimeoutMs = Number.parseInt(process.env.INTRILEX_SELF_AUDIT_TIMEOUT_MS ?? '1200000', 10);
const auditTimeoutMs = Number.isInteger(configuredTimeoutMs) && configuredTimeoutMs >= 60000
  ? configuredTimeoutMs
  : 1200000;

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

console.log(`generate-self-audit: running ${testArgs.length} test files${quick ? ' (quick mode)' : ''}; concurrency=${testConcurrency}; timeout=${auditTimeoutMs}ms...`);

// ── Execute the test suite ──
// Redirect stdout to a temp file via file descriptor to avoid maxBuffer limits —
// the full suite TAP output can exceed 256 MB, which would overflow spawnSync's
// in-memory buffer. Stderr stays piped (small: warnings/errors only).
const tmpOutput = path.join(root, 'reports/.self-audit-tap-output.txt');
await rm(tmpOutput, { force: true });
const fd = openSync(tmpOutput, 'w');
const result = spawnSync(process.execPath, ['--test', `--test-concurrency=${testConcurrency}`, ...testArgs], {
  cwd: root,
  encoding: 'utf8',
  timeout: auditTimeoutMs,
  stdio: ['ignore', fd, 'pipe'],
});
closeSync(fd);

// Read the full TAP output from the temp file
let fileOutput = '';
try { fileOutput = await readFile(tmpOutput, 'utf8'); } catch { /* file may not exist if redirect failed */ }
const output = fileOutput + '\n' + (result.stderr ?? '');

// ── Process status validation (Phase 1.3) ──
// The audit must fail closed on ANY abnormal child-process termination.
// A killed/timed-out process can leave partial TAP that parses as 0 failures,
// which would produce a false PASS if we only checked totalFail.
const processStatus = {
  spawnError: result.error ? (result.error.message || String(result.error)) : null,
  signal: result.signal ?? null,
  timedOut: result.signal === 'SIGTERM' && result.status === null,
  exitStatus: result.status,
  abnormal: false,
  reason: null,
};
if (processStatus.spawnError) {
  processStatus.abnormal = true;
  processStatus.reason = `spawn error: ${processStatus.spawnError}`;
} else if (processStatus.signal) {
  processStatus.abnormal = true;
  processStatus.reason = `killed by signal ${processStatus.signal}${processStatus.timedOut ? ' (timeout)' : ''}`;
} else if (processStatus.exitStatus === null) {
  processStatus.abnormal = true;
  processStatus.reason = 'process exited with null status (abnormal termination)';
}
if (processStatus.abnormal) {
  console.error(`generate-self-audit: ABNORMAL PROCESS TERMINATION — ${processStatus.reason}`);
  console.error(`Output tail: ${output.slice(-2000)}`);
}

// ── Parse TAP summary ──
// When running multiple test files, node --test emits a summary block per
// file AND a final aggregate summary. We must use the LAST (aggregate) match,
// not the first (per-file) match. Use global regex + take the last match.
function lastMatch(str, re) {
  const matches = str.matchAll(re);
  let last = null;
  for (const m of matches) last = m;
  return last;
}

const testsMatch = lastMatch(output, /^# tests\s+(\d+)/gm);
const passMatch = lastMatch(output, /^# pass\s+(\d+)/gm);
const failMatch = lastMatch(output, /^# fail\s+(\d+)/gm);
const skipMatch = lastMatch(output, /^# skip(?:ped)?\s+(\d+)/gm);
const cancelledMatch = lastMatch(output, /^# cancelled\s+(\d+)/gm);
const todoMatch = lastMatch(output, /^# todo\s+(\d+)/gm);
const durationMatch = lastMatch(output, /^# duration_ms\s+([\d.]+)/gm);

const totalTests = testsMatch ? parseInt(testsMatch[1]) : 0;
const totalPass = passMatch ? parseInt(passMatch[1]) : 0;
const totalFail = failMatch ? parseInt(failMatch[1]) : 0;
const totalSkip = skipMatch ? parseInt(skipMatch[1]) : 0;
const totalCancelled = cancelledMatch ? parseInt(cancelledMatch[1]) : 0;
const totalTodo = todoMatch ? parseInt(todoMatch[1]) : 0;
const durationMs = durationMatch ? parseFloat(durationMatch[1]) : 0;
const failedTests = [...new Set(
  [...output.matchAll(/^not ok \d+ - (.+)$/gm)]
    .map(match => match[1].trim())
)];

if (totalTests === 0 || processStatus.abnormal) {
  if (totalTests === 0) {
    console.error('generate-self-audit: FAILED to parse test count from output');
    console.error('Output tail:', output.slice(-2000));
  }
  if (processStatus.abnormal) {
    console.error(`generate-self-audit: REFUSING TO PASS — process terminated abnormally (${processStatus.reason})`);
  }
  process.exit(1);
}

// Reconcile arithmetic: tests should equal pass + fail + skip + cancelled + todo
const accounted = totalPass + totalFail + totalSkip + totalCancelled + totalTodo;
const unaccounted = totalTests - accounted;

console.log(`generate-self-audit: ${totalTests} tests, ${totalPass} pass, ${totalFail} fail, ${totalSkip} skip, ${totalCancelled} cancelled, ${totalTodo} todo, ${unaccounted} unaccounted, ${durationMs}ms`);

// ── Compute score and gates from real evidence ──
const _testFileCount = allTestFiles.length;
const hasVendorIntegrity = existsSync(path.join(root, 'reports/vendor-integrity.json'));
const hasEnginePatch = existsSync(path.join(root, 'reports/engine-patch-integrity.json'));
const hasBuildDeterminism = existsSync(path.join(root, 'reports/build-determinism.json'));
const hasCapabilityManifest = existsSync(path.join(root, 'reports/capability-manifest.json'));

// Generated report existence and old PASS fields cannot establish current evidence.
const evidenceControls = {};
function executeEvidenceControl(name, script, args = []) {
  const control = spawnSync(process.execPath, [script, ...args], {
    cwd: root, encoding: 'utf8', timeout: auditTimeoutMs,
    maxBuffer: 50 * 1024 * 1024,
    env: { ...process.env, INTRILEX_WRITE_REPORTS: '0', INTRILEX_SKIP_BUILD: '1' },
  });
  // Preserve the first failure and its context, not just the end of a stack.
  // Ignored logs cannot change the source tree being certified.
  const outputPath = `reports/local/self-audit-controls/${name}.log`;
  mkdirSync(path.join(root, 'reports/local/self-audit-controls'), { recursive: true });
  writeFileSync(path.join(root, outputPath), `${control.stdout ?? ''}\n${control.stderr ?? ''}`);
  evidenceControls[name] = {
    command: `${process.execPath} ${script} ${args.join(' ')}`.trim(),
    status: control.status === 0 && !control.error && !control.signal ? 'PASS' : 'FAIL',
    exitCode: control.status, signal: control.signal, error: control.error?.message ?? null,
    outputPath,
    outputTail: `${control.stdout ?? ''}\n${control.stderr ?? ''}`.slice(-2000),
  };
  return evidenceControls[name].status === 'PASS';
}
const vendorIntegrityPassed = !quick && executeEvidenceControl('vendor', 'scripts/vendor-verify.mjs');
const enginePatchIntegrityPassed = !quick && executeEvidenceControl('engine', 'scripts/engine-patch-integrity.mjs', ['verify']);
const buildDeterminismPassed = !quick && executeEvidenceControl('determinism', 'scripts/verify-build-determinism.mjs');
const browserParityPassed = !quick && executeEvidenceControl('browser-parity', 'scripts/browser-parity.mjs');

// Check if privacy-related test files passed (search output for privacy test results)
const privacyTestOutput = output.match(/privacy|hidden-information|visibility-projection/gi);
const privacyTestsRan = privacyTestOutput !== null && privacyTestOutput.length > 0;
const privacyGatePassed = privacyTestsRan && totalFail === 0;

const dimensions = {
  canonEngineDeterminism: enginePatchIntegrityPassed && buildDeterminismPassed ? 20 : enginePatchIntegrityPassed ? 15 : 10,
  analyticsStatistics: totalPass > 400 ? 19 : totalPass > 300 ? 16 : 12,
  evidencePrivacy: privacyGatePassed ? 20 : privacyTestsRan ? 15 : 10,
  guiUx: browserParityPassed ? 14 : 10,
  semanticFx: totalPass > 400 ? 8 : 6,
  accessibilityPerformance: browserParityPassed ? 9 : 6,
  documentationRelease: hasCapabilityManifest ? 7 : 5
};

const score = Object.values(dimensions).reduce((a, b) => a + b, 0);
const threshold = 92;

// Phase 1.3: filesCompleted — only count files as executed if the process
// completed normally. If the process was killed/timed out, we cannot know
// how many files completed, so we report 0 and fail the audit.
const filesScheduled = testArgs.length;
const filesDiscovered = allTestFiles.length;
const filesStarted = processStatus.spawnError ? 0 : testArgs.length;
const filesCompleted = processStatus.abnormal ? 0 : testArgs.length;

// Capture both ends; release evidence is invalid if controls changed the tree.
const finalProvenance = captureProvenance(root);
const releaseProblems = releaseMode ? [
  ...releaseProvenanceProblems(finalProvenance),
  ...evidenceProvenanceProblems({ provenance: { ...initialProvenance, mode: 'full' } }, finalProvenance),
] : [];
const { gitCommit, gitTree, gitBranch, lockfileSha256 } = initialProvenance;
const gitDirty = initialProvenance.dirty;

const criticalGates = {
  canonDefect: totalFail === 0,
  determinismMismatch: buildDeterminismPassed,
  hiddenInformationLeak: privacyGatePassed,
  falseAnalyticClaim: totalFail === 0 && score >= threshold,
  extractedVerificationPending: vendorIntegrityPassed,
  // v0.24.2: Test arithmetic must reconcile exactly — no unaccounted results.
  // A non-zero unaccounted count means the TAP summary doesn't add up, which
  // indicates a parsing error, a crashed test runner, or a silent skip that
  // the audit must not paper over with a PASS.
  testAccountingReconciled: unaccounted === 0,
  // Phase 1.3: Process must have terminated normally. A killed/timed-out
  // process can leave partial TAP that parses as 0 failures — a false PASS.
  processTerminatedNormally: !processStatus.abnormal,
  // Phase 1.3: Engine-patch integrity must actually PASS, not just exist.
  enginePatchIntegrity: enginePatchIntegrityPassed,
  // Phase 1.3: Nonzero cancelled tests indicate incomplete execution.
  noCancelledTests: totalCancelled === 0,
  // Phase 1.3: All scheduled files must have completed.
  allFilesCompleted: filesCompleted === filesScheduled,
};

const gateEvidence = {
  canonDefect: `Test suite executed: ${totalTests} tests, ${totalPass} pass, ${totalFail} fail, ${totalSkip} skip, ${totalCancelled} cancelled, ${totalTodo} todo`,
  determinismMismatch: buildDeterminismPassed
    ? 'Current two-build determinism control exited 0'
    : hasBuildDeterminism
      ? 'build-determinism.json exists but does not report PASS'
      : 'build-determinism.json missing — run pnpm run test:build-determinism',
  hiddenInformationLeak: privacyGatePassed
    ? 'Privacy tests ran and all tests passed'
    : privacyTestsRan
      ? `Privacy tests ran but ${totalFail} tests failed — privacy gate FAIL`
      : 'No privacy tests detected in suite output',
  falseAnalyticClaim: `Self-audit generated by scripts/generate-self-audit.mjs from real execution — not hand-written. Score ${score}/${threshold}.`,
  extractedVerificationPending: vendorIntegrityPassed
    ? 'Current vendor integrity control exited 0'
    : hasVendorIntegrity
      ? 'vendor-integrity.json exists but does not report VERIFIED'
      : 'vendor-integrity.json missing — run pnpm run vendor:verify',
  testAccountingReconciled: unaccounted === 0
    ? `Test arithmetic reconciles exactly: ${totalTests} = ${totalPass} + ${totalFail} + ${totalSkip} + ${totalCancelled} + ${totalTodo}`
    : `Test arithmetic MISMATCH: ${totalTests} tests but accounted = ${accounted} (unaccounted = ${unaccounted}) — audit cannot PASS`,
  processTerminatedNormally: !processStatus.abnormal
    ? `Process exited normally (status=${processStatus.exitStatus}, signal=${processStatus.signal})`
    : `ABNORMAL TERMINATION: ${processStatus.reason}`,
  enginePatchIntegrity: enginePatchIntegrityPassed
    ? 'Current engine payload integrity control exited 0'
    : hasEnginePatch
      ? 'engine-patch-integrity.json exists but does not report PASS'
      : 'engine-patch-integrity.json missing — run pnpm run engine-patch:verify',
  noCancelledTests: totalCancelled === 0
    ? 'No cancelled tests'
    : `${totalCancelled} cancelled tests — incomplete execution`,
  allFilesCompleted: filesCompleted === filesScheduled
    ? `All ${filesCompleted}/${filesScheduled} scheduled files completed`
    : `Only ${filesCompleted}/${filesScheduled} scheduled files completed (process may have been killed)`,
};

const audit = {
  schemaVersion: '3.2.0',
  // v0.24.2: PASS requires ALL of:
  //   - totalFail === 0 (no test failures)
  //   - score >= threshold (dimensional score)
  //   - unaccounted === 0 (test arithmetic reconciles exactly)
  //   - all critical gates pass (including testAccountingReconciled)
  //   - totalCancelled === 0 (no cancelled tests)
  //   - process terminated normally (not killed/timed out)
  // v0.25: quickMode reports are never canonical (written to .quick.json)
  // IRX-M29: Explicit scorePassed and criticalGatesPassed fields prevent the
  // apparent contradiction where score meets threshold but status is FAIL.
  // A report can have scorePassed=true but criticalGatesPassed=false → status=FAIL.
  // Phase 1.3: processTerminatedNormally prevents partial-run false PASS.
  status: (releaseProblems.length === 0 && totalFail === 0 && totalCancelled === 0 && score >= threshold && unaccounted === 0 && !processStatus.abnormal && Object.values(criticalGates).every(v => v === true)) ? 'PASS' : 'FAIL',
  quickMode: quick,
  score,
  threshold,
  // IRX-M29: Explicit sub-status fields for non-contradictory semantics
  scorePassed: score >= threshold,
  criticalGatesPassed: Object.values(criticalGates).every(v => v === true),
  noTestFailures: totalFail === 0,
  noCancelledTests: totalCancelled === 0,
  testAccountingReconciled: unaccounted === 0,
  processTerminatedNormally: !processStatus.abnormal,
  generatedAt: new Date().toISOString(),
  generatedBy: `generate-self-audit.mjs v3.2.0 (package v${rootPkg.version})`,
  // v0.25: Provenance for freshness verification — the canonical audit must
  // correspond to the current repository state. These fields allow a release
  // gate to mechanically reject stale or incompatible audits.
  // Phase 1.3: Added gitTree, dirty, lockfileSha256 for exact-tree binding.
  provenance: {
    ...initialProvenance,
    auditKind: releaseMode ? 'release' : 'development',
    finalDirty: finalProvenance.dirty,
    labVersion: rootPkg.version,
    mode: quick ? 'quick' : 'full',
    testFileCount: allTestFiles.length,
    filesDiscovered,
    filesScheduled,
    filesStarted,
    filesCompleted,
    filesExecuted: filesCompleted,
    testConcurrency,
    timeoutMs: auditTimeoutMs,
    gitCommit,
    gitTree,
    gitBranch,
    dirty: gitDirty,
    lockfileSha256,
  },
  processStatus,
  dimensions,
  evidenceControls,
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
    failedTests,
    unaccounted,
    durationMs,
    testFileCount: allTestFiles.length,
    filesDiscovered,
    filesScheduled,
    filesStarted,
    filesCompleted,
    filesExecuted: filesCompleted,
    testConcurrency,
    timeoutMs: auditTimeoutMs,
    quickMode: quick
  }
};

// Release evidence lives in ignored output, avoiding self-referential commit hashes.
if (releaseProblems.length) { audit.status = 'FAIL'; audit.releaseBlockers = releaseProblems; }
const outputDir = path.join(root, releaseMode ? 'reports/release' : 'reports/local');
await mkdir(outputDir, { recursive: true });
const outputPath = path.join(outputDir, quick ? 'self-audit.quick.json' : 'self-audit.json');
await writeFile(outputPath, JSON.stringify(audit, null, 2) + '\n');
console.log(`generate-self-audit: wrote ${outputPath} (status=${audit.status}, score=${score}/${threshold}, ${releaseMode ? 'RELEASE' : 'DEVELOPMENT'})`);
if (releaseProblems.length) console.error(releaseProblems.join('\n'));
if (audit.status !== 'PASS') process.exitCode = 1;

// The complete TAP stream can exceed hundreds of megabytes, so it is not kept
// as a report artifact. Preserve the useful failure identities in the JSON
// report and stderr before removing the temporary stream.
await rm(tmpOutput, { force: true });

if (totalFail > 0) {
  console.error(`generate-self-audit: ${totalFail} tests failed — self-audit status is FAIL`);
  for (const failedTest of failedTests) {
    console.error(`  - ${failedTest}`);
  }
  process.exit(1);
}
// v0.24.2: Non-zero unaccounted is a truth violation — fail in release/CI mode
if (unaccounted !== 0) {
  console.error(`generate-self-audit: ${unaccounted} unaccounted test results — arithmetic mismatch — self-audit status is FAIL`);
  process.exit(1);
}
// Phase 1.3: Abnormal process termination is a truth violation — a killed/timed-out
// process can leave partial TAP that parses as 0 failures. Fail closed.
if (processStatus.abnormal) {
  console.error(`generate-self-audit: process terminated abnormally (${processStatus.reason}) — self-audit status is FAIL`);
  process.exit(1);
}
// Phase 1.3: Non-zero cancelled tests indicate incomplete execution — fail closed.
if (totalCancelled > 0) {
  console.error(`generate-self-audit: ${totalCancelled} cancelled tests — incomplete execution — self-audit status is FAIL`);
  process.exit(1);
}
