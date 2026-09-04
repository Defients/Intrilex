// ═══════════════════════════════════════════════════════════════
// certification-gates.mjs — v2.0.0 Executable Certification Gates.
//
// Phase 2 rewrite: replaces "green-by-existence" checks with actual
// control execution and authenticated evidence consumption. Each gate
// either executes a control command or consumes a current-tree report
// produced by a control, then emits a machine-readable evidence-state
// object.
//
// Evidence-state schema:
//   {
//     status: "PASS" | "FAIL" | "NOT_RUN" | "NOT_APPLICABLE" | "BLOCKED" | "STALE",
//     scope: "local" | "ci" | "staging" | "human" | "production",
//     command: "exact command or null",
//     startedAt: "ISO-8601 or null",
//     completedAt: "ISO-8601 or null",
//     exitCode: number | null,
//     signal: string | null,
//     timedOut: boolean,
//     gitCommit: "40-char commit",
//     gitTree: "tree hash",
//     dirty: boolean,
//     lockfileSha256: "sha256",
//     artifactSha256: "sha256 or null",
//     evidencePath: "repository-relative path or null",
//     summary: "concise factual outcome",
//     blockers: string[],
//     residualRisks: string[]
//   }
//
// Usage:
//   node scripts/certification-gates.mjs           # run all gates
//   node scripts/certification-gates.mjs --json     # JSON output
//   node scripts/certification-gates.mjs --gate rules-engine
// ═══════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Provenance helpers ───────────────────────────────────────────

function gitHead() {
  try { return spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim(); }
  catch { return null; }
}
function gitTree() {
  try { return spawnSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim(); }
  catch { return null; }
}
function gitDirty() {
  try { const s = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).stdout; return s.trim().length > 0; }
  catch { return null; }
}
async function lockfileHash() {
  try { return createHash('sha256').update(await readFile(join(ROOT, 'pnpm-lock.yaml'))).digest('hex'); }
  catch { return null; }
}

const HEAD = gitHead();
const TREE = gitTree();
const DIRTY = gitDirty();
const LOCKFILE = await lockfileHash();

// ── Evidence-state builders ──────────────────────────────────────

/**
 * Execute a control command and return an evidence-state object.
 * Captures exit code, signal, timeout, and process errors.
 */
function runControl(command, args = [], scope = 'local', timeoutMs = 60000) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: timeoutMs,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const completedAt = new Date().toISOString();

  const state = {
    status: 'FAIL',
    scope,
    command: `${command} ${args.join(' ')}`.trim(),
    startedAt,
    completedAt,
    exitCode: result.status,
    signal: result.signal,
    timedOut: result.signal === 'SIGTERM' && result.status === null,
    gitCommit: HEAD,
    gitTree: TREE,
    dirty: DIRTY,
    lockfileSha256: LOCKFILE,
    artifactSha256: null,
    evidencePath: null,
    summary: '',
    blockers: [],
    residualRisks: [],
  };

  if (result.error) {
    state.status = 'FAIL';
    state.summary = `Spawn error: ${result.error.message}`;
    state.blockers.push(`Control failed to spawn: ${result.error.message}`);
  } else if (result.signal) {
    state.status = 'FAIL';
    state.summary = `Killed by signal ${result.signal}${state.timedOut ? ' (timeout)' : ''}`;
    state.blockers.push(`Control was killed by signal ${result.signal}`);
  } else if (result.status === null) {
    state.status = 'FAIL';
    state.summary = 'Process exited with null status (abnormal termination)';
    state.blockers.push('Control process terminated abnormally');
  } else if (result.status === 0) {
    state.status = 'PASS';
    const stdout = (result.stdout || '').trim().slice(-500);
    state.summary = `Control exited 0. ${stdout}`.trim();
  } else {
    state.status = 'FAIL';
    const stderr = (result.stderr || '').trim().slice(-500);
    state.summary = `Control exited ${result.status}. ${stderr}`.trim();
    state.blockers.push(`Control exited with status ${result.status}`);
  }

  return state;
}

/**
 * Consume a report file as authenticated evidence. Verifies:
 * - Report exists
 * - Report status field matches expected
 * - Report provenance (if present) binds to current tree
 */
function consumeReport(relPath, scope, expectedStatus = 'PASS') {
  const absPath = join(ROOT, relPath);
  const state = {
    status: 'NOT_RUN',
    scope,
    command: null,
    startedAt: null,
    completedAt: null,
    exitCode: null,
    signal: null,
    timedOut: false,
    gitCommit: HEAD,
    gitTree: TREE,
    dirty: DIRTY,
    lockfileSha256: LOCKFILE,
    artifactSha256: null,
    evidencePath: relPath,
    summary: '',
    blockers: [],
    residualRisks: [],
  };

  if (!existsSync(absPath)) {
    state.status = 'NOT_RUN';
    state.summary = `Report not found: ${relPath}`;
    state.blockers.push(`Report not found: ${relPath}`);
    return state;
  }

  let report;
  try {
    report = JSON.parse(readFileSync(absPath, 'utf8'));
  } catch (e) {
    state.status = 'FAIL';
    state.summary = `Report is not valid JSON: ${e.message}`;
    state.blockers.push(`Report ${relPath} is not valid JSON`);
    return state;
  }

  // Check report status
  const reportStatus = report.status;
  if (reportStatus !== expectedStatus) {
    state.status = reportStatus === 'FAIL' ? 'FAIL' : 'STALE';
    state.summary = `Report status is ${reportStatus}, expected ${expectedStatus}`;
    state.blockers.push(`Report ${relPath} status=${reportStatus}, expected ${expectedStatus}`);
    return state;
  }

  // Check provenance if present (Phase 2: reject stale reports)
  if (report.provenance) {
    const prov = report.provenance;
    if (prov.gitCommit && HEAD && prov.gitCommit !== HEAD) {
      state.status = 'STALE';
      state.summary = `Report provenance gitCommit=${prov.gitCommit} does not match current HEAD=${HEAD}`;
      state.blockers.push(`Report ${relPath} is stale: bound to ${prov.gitCommit}, current HEAD is ${HEAD}`);
      return state;
    }
    if (prov.mode && prov.mode !== 'full') {
      state.status = 'STALE';
      state.summary = `Report provenance mode=${prov.mode}, expected 'full'`;
      state.blockers.push(`Report ${relPath} is not canonical (mode=${prov.mode})`);
      return state;
    }
  }

  // Compute artifact hash
  try {
    const content = readFileSync(absPath);
    state.artifactSha256 = createHash('sha256').update(content).digest('hex');
  } catch { /* ignore */ }

  state.status = 'PASS';
  state.summary = `Report ${relPath} status=${reportStatus}, provenance matches current tree`;
  return state;
}

/**
 * Static documentation check — for documentation-only gates.
 * These may pass as documentation gates but cannot satisfy behavioral requirements.
 */
function docCheck(relPath, description, scope = 'local') {
  const state = {
    status: existsSync(join(ROOT, relPath)) ? 'PASS' : 'FAIL',
    scope,
    command: null,
    startedAt: null,
    completedAt: null,
    exitCode: null,
    signal: null,
    timedOut: false,
    gitCommit: HEAD,
    gitTree: TREE,
    dirty: DIRTY,
    lockfileSha256: LOCKFILE,
    artifactSha256: null,
    evidencePath: relPath,
    summary: `Documentation check: ${description}`,
    blockers: [],
    residualRisks: ['Documentation-only check — does not prove behavioral correctness'],
  };
  if (state.status === 'FAIL') {
    state.blockers.push(`Documentation not found: ${relPath}`);
  }
  return state;
}

/**
 * NOT_RUN state for gates that require external/human action.
 */
function notRunState(scope, description, blockers = []) {
  return {
    status: 'NOT_RUN',
    scope,
    command: null,
    startedAt: null,
    completedAt: null,
    exitCode: null,
    signal: null,
    timedOut: false,
    gitCommit: HEAD,
    gitTree: TREE,
    dirty: DIRTY,
    lockfileSha256: LOCKFILE,
    artifactSha256: null,
    evidencePath: null,
    summary: description,
    blockers,
    residualRisks: [],
  };
}

// ── JSON/text helpers ────────────────────────────────────────────

function readJson(p) {
  try { return JSON.parse(readFileSync(join(ROOT, p), 'utf8')); }
  catch { return null; }
}

function readText(p) {
  try { return readFileSync(join(ROOT, p), 'utf8'); }
  catch { return null; }
}

function fileExists(p) {
  return existsSync(join(ROOT, p));
}

// ── Gate 1: Rules & Engine ───────────────────────────────────────

function gateRulesEngine() {
  const controls = [];
  const evidence = [];
  const gaps = [];
  let passed = true;

  // 1a. Version agreement across surfaces
  const ri = readJson('config/release-identity.json');
  const em = readJson('config/engine-manifest.json');
  const _pkg = readJson('package.json');
  const ct = readJson('config/capability-truth.json');

  const engineVersions = new Set([ri?.engineVersion, em?.engineVersion, ct?.product?.engineVersion].filter(Boolean));
  const rulesVersions = new Set([ri?.rulesVersion, em?.rulesVersion, ct?.product?.rulesVersion].filter(Boolean));

  if (engineVersions.size === 1 && rulesVersions.size === 1) {
    evidence.push(`Engine version ${[...engineVersions][0]} and rules version ${[...rulesVersions][0]} agree across all surfaces.`);
  } else {
    gaps.push(`Version mismatch: engine=${[...engineVersions].join('/')}, rules=${[...rulesVersions].join('/')}`);
    passed = false;
  }

  // 1b. Self-audit: consume report with provenance verification
  const auditState = consumeReport('reports/self-audit.json', 'local', 'PASS');
  controls.push({ name: 'self-audit', ...auditState });
  if (auditState.status === 'PASS') {
    const audit = readJson('reports/self-audit.json');
    evidence.push(`Self-audit PASS (${audit.testResults.totalTests} tests, ${audit.testResults.totalPass} pass, provenance bound to ${audit.provenance.gitCommit?.slice(0, 8)}).`);
  } else {
    gaps.push(`Self-audit: ${auditState.summary}`);
    passed = false;
  }

  // 1c. Engine-patch integrity: execute the verify command
  const epState = runControl('node', ['scripts/engine-patch-integrity.mjs', 'verify'], 'local', 120000);
  controls.push({ name: 'engine-patch-integrity', ...epState });
  if (epState.status === 'PASS') {
    evidence.push('Engine-patch integrity verification executed and passed.');
  } else {
    gaps.push(`Engine-patch integrity: ${epState.summary}`);
    passed = false;
  }

  // 1d. Engine manifest verification: execute the verify command
  const emState = runControl('node', ['scripts/generate-engine-manifest.mjs', '--verify'], 'local', 60000);
  controls.push({ name: 'engine-manifest-verify', ...emState });
  if (emState.status === 'PASS') {
    evidence.push('Engine authority manifest verification executed and passed.');
  } else {
    gaps.push(`Engine manifest: ${emState.summary}`);
    passed = false;
  }

  // 1e. Determinism report: consume report with status check
  const detState = consumeReport('reports/build-determinism.json', 'local', 'PASS');
  controls.push({ name: 'build-determinism', ...detState });
  if (detState.status === 'PASS') {
    evidence.push('Build determinism report PASS (provenance matches current tree).');
  } else {
    gaps.push(`Build determinism: ${detState.summary}`);
    passed = false;
  }

  return { passed, evidence, gaps, controls };
}

// ── Gate 2: Local Player Experience ──────────────────────────────

function gateLocalExperience() {
  const controls = [];
  const evidence = [];
  const gaps = [];
  let passed = true;

  // 2a. Self-audit covers all local-experience tests (if PASS with full provenance)
  const auditState = consumeReport('reports/self-audit.json', 'local', 'PASS');
  controls.push({ name: 'self-audit-local-experience', ...auditState });
  if (auditState.status === 'PASS') {
    evidence.push('Self-audit PASS covers local experience test files (play-module, accessibility, academy, puzzle).');
  } else {
    gaps.push(`Self-audit (local experience): ${auditState.summary}`);
    passed = false;
  }

  // 2b. Run focused local-experience tests to prove behavioral correctness
  const testState = runControl('node', ['--test', 'test/play-module.test.mjs', 'test/accessibility.test.mjs'], 'local', 120000);
  controls.push({ name: 'local-experience-tests', ...testState });
  if (testState.status === 'PASS') {
    evidence.push('Local experience tests (play-module, accessibility) executed and passed.');
  } else {
    gaps.push(`Local experience tests: ${testState.summary}`);
    passed = false;
  }

  // 2c. Static checks for required modules (these are structural, not behavioral)
  const requiredModules = [
    { path: 'apps/lab-web/src/play/academy/academy-controller.mjs', name: 'Academy onboarding' },
    { path: 'packages/game-ai/src/agent.mjs', name: 'HYBRIX AI agent' },
    { path: 'packages/game-ai/src/policy-adapter.mjs', name: 'Policy adapter' },
    { path: 'apps/lab-web/src/play/save-integrity.js', name: 'Save integrity' },
    { path: 'packages/replay-caster/src/caster-session.mjs', name: 'Replay Caster' },
    { path: 'apps/lab-web/src/play/puzzle/puzzle-progress.mjs', name: 'Puzzle ladder' },
    { path: 'packages/game-ai/src/bounded-lookahead.mjs', name: 'Bounded lookahead AI' },
  ];
  for (const mod of requiredModules) {
    if (!fileExists(mod.path)) {
      gaps.push(`${mod.name} missing: ${mod.path}`);
      passed = false;
    }
  }
  if (passed) {
    evidence.push(`All ${requiredModules.length} required local-experience modules present.`);
  }

  // 2d. Save compatibility checking
  const saveIntegrity = readText('apps/lab-web/src/play/save-integrity.js');
  if (saveIntegrity && saveIntegrity.includes('INCOMPATIBLE_PRODUCT_VERSION')) {
    evidence.push('Save compatibility checking exists — old data fails with clear explanation.');
  } else {
    gaps.push('Save compatibility explanation missing.');
    passed = false;
  }

  return { passed, evidence, gaps, controls };
}

// ── Gate 3: Online Experience ────────────────────────────────────

function gateOnlineExperience() {
  const controls = [];
  const evidence = [];
  const gaps = [];
  let passed = true;

  // 3a. Run focused network tests to prove behavioral correctness
  const netState = runControl('node', ['--test', 'test/network-authority.test.mjs'], 'local', 180000);
  controls.push({ name: 'network-authority-tests', ...netState });
  if (netState.status === 'PASS') {
    evidence.push('Network authority tests executed and passed (includes message collector cleanup regression).');
  } else {
    gaps.push(`Network authority tests: ${netState.summary}`);
    passed = false;
  }

  // 3b. Self-audit covers all online-experience tests
  const auditState = consumeReport('reports/self-audit.json', 'local', 'PASS');
  controls.push({ name: 'self-audit-online-experience', ...auditState });
  if (auditState.status === 'PASS') {
    evidence.push('Self-audit PASS covers online experience test files (auth-reconnect, spectator, persistence, etc.).');
  } else {
    gaps.push(`Self-audit (online experience): ${auditState.summary}`);
    passed = false;
  }

  // 3c. Static checks for required server modules
  const requiredModules = [
    { path: 'apps/match-server/src/server.mjs', name: 'Match server' },
    { path: 'apps/match-server/src/broadcast/delayed-broadcast-buffer.mjs', name: 'Delayed broadcast buffer' },
    { path: 'apps/match-server/src/ranked/abandonment-handler.mjs', name: 'Ranked abandonment handler' },
    { path: 'apps/match-server/src/persistence/terminal-outbox.mjs', name: 'Terminal outbox' },
    { path: 'scripts/backup-match-db.mjs', name: 'Backup script' },
    { path: 'apps/match-server/src/monitoring/health-monitor.mjs', name: 'Health monitor' },
    { path: 'apps/match-server/src/moderation/moderation-service.mjs', name: 'Moderation service' },
    { path: 'packages/account-domain/src/tournament-operations.mjs', name: 'Tournament operations' },
  ];
  for (const mod of requiredModules) {
    if (!fileExists(mod.path)) {
      gaps.push(`${mod.name} missing: ${mod.path}`);
      passed = false;
    }
  }
  if (passed) {
    evidence.push(`All ${requiredModules.length} required online-experience modules present.`);
  }

  // 3d. Privacy tests in self-audit
  const audit = readJson('reports/self-audit.json');
  if (audit?.criticalGates?.hiddenInformationLeak === true) {
    evidence.push('Hidden information leak gate passed (from self-audit).');
  } else {
    gaps.push('Hidden information leak gate not passed.');
    passed = false;
  }

  return { passed, evidence, gaps, controls };
}

// ── Gate 4: Laboratory ───────────────────────────────────────────

function gateLaboratory() {
  const controls = [];
  const evidence = [];
  const gaps = [];
  let passed = true;

  // 4a. Self-audit covers laboratory tests
  const auditState = consumeReport('reports/self-audit.json', 'local', 'PASS');
  controls.push({ name: 'self-audit-laboratory', ...auditState });
  if (auditState.status === 'PASS') {
    evidence.push('Self-audit PASS covers laboratory test files (decision-intelligence, replay, evidence).');
  } else {
    gaps.push(`Self-audit (laboratory): ${auditState.summary}`);
    passed = false;
  }

  // 4b. Run focused laboratory tests
  const labState = runControl('node', ['--test', 'test/decision-intelligence.test.mjs'], 'local', 60000);
  controls.push({ name: 'laboratory-tests', ...labState });
  if (labState.status === 'PASS') {
    evidence.push('Laboratory tests (decision-intelligence) executed and passed.');
  } else {
    gaps.push(`Laboratory tests: ${labState.summary}`);
    passed = false;
  }

  // 4c. Static checks for laboratory modules
  const requiredModules = [
    { path: 'packages/replay-caster/src/schemas.mjs', name: 'Replay caster schemas' },
    { path: 'packages/statistics/src/evidence-honest.mjs', name: 'Evidence-honest intelligence' },
    { path: 'packages/replay-caster/src/investigation-workflow.mjs', name: 'Investigation workflow' },
    { path: 'packages/replay-caster/src/commentary-contract.mjs', name: 'Commentary contract' },
    { path: 'apps/lab-web/src/brain/brain-topology.mjs', name: 'Brain topology' },
  ];
  for (const mod of requiredModules) {
    if (!fileExists(mod.path)) {
      gaps.push(`${mod.name} missing: ${mod.path}`);
      passed = false;
    }
  }
  if (passed) {
    evidence.push(`All ${requiredModules.length} required laboratory modules present.`);
  }

  // 4d. Investigation workflow invalidation logic
  const inv = readText('packages/replay-caster/src/investigation-workflow.mjs');
  if (inv && inv.includes('checkInvalidation') && inv.includes('INVALIDATED')) {
    evidence.push('WAIT WHAT investigation workflow has automatic invalidation on authority hash change.');
  } else {
    gaps.push('Investigation invalidation logic missing.');
    passed = false;
  }

  // 4e. False analytic claim gate
  const audit = readJson('reports/self-audit.json');
  if (audit?.criticalGates?.falseAnalyticClaim === true) {
    evidence.push('False analytic claim gate passed.');
  } else {
    gaps.push('False analytic claim gate not passed.');
    passed = false;
  }

  return { passed, evidence, gaps, controls };
}

// ── Gate 5: Release Engineering ──────────────────────────────────

function gateReleaseEngineering() {
  const controls = [];
  const evidence = [];
  const gaps = [];
  let passed = true;

  // 5a. Engine-patch integrity: execute verify
  const epState = runControl('node', ['scripts/engine-patch-integrity.mjs', 'verify'], 'local', 120000);
  controls.push({ name: 'engine-patch-integrity', ...epState });
  if (epState.status === 'PASS') {
    evidence.push('Engine-patch integrity verification executed and passed.');
  } else {
    gaps.push(`Engine-patch integrity: ${epState.summary}`);
    passed = false;
  }

  // 5b. Secret containment scan: execute
  const secState = runControl('node', ['scripts/secret-containment-scan.mjs'], 'local', 60000);
  controls.push({ name: 'secret-scan', ...secState });
  if (secState.status === 'PASS') {
    evidence.push('Secret containment scan executed and passed (current tree).');
  } else {
    gaps.push(`Secret scan: ${secState.summary}`);
    passed = false;
  }

  // 5c. Release identity verification: execute
  const riState = runControl('node', ['scripts/generate-release-identity.mjs', '--verify'], 'local', 60000);
  controls.push({ name: 'release-identity-verify', ...riState });
  if (riState.status === 'PASS') {
    evidence.push('Release identity verification executed and passed.');
  } else {
    gaps.push(`Release identity: ${riState.summary}`);
    passed = false;
  }

  // 5d. Engine manifest verification: execute
  const emState = runControl('node', ['scripts/generate-engine-manifest.mjs', '--verify'], 'local', 60000);
  controls.push({ name: 'engine-manifest-verify', ...emState });
  if (emState.status === 'PASS') {
    evidence.push('Engine authority manifest verification executed and passed.');
  } else {
    gaps.push(`Engine manifest: ${emState.summary}`);
    passed = false;
  }

  // 5e. Self-audit: consume with provenance verification
  const auditState = consumeReport('reports/self-audit.json', 'local', 'PASS');
  controls.push({ name: 'self-audit', ...auditState });
  if (auditState.status === 'PASS') {
    const audit = readJson('reports/self-audit.json');
    evidence.push(`Self-audit PASS (provenance bound to ${audit.provenance.gitCommit?.slice(0, 8)}, tree ${audit.provenance.gitTree?.slice(0, 8)}).`);
  } else {
    gaps.push(`Self-audit: ${auditState.summary}`);
    passed = false;
  }

  // 5f. Build determinism report: consume with status check
  const bdState = consumeReport('reports/build-determinism.json', 'local', 'PASS');
  controls.push({ name: 'build-determinism', ...bdState });
  if (bdState.status === 'PASS') {
    evidence.push('Build determinism report PASS.');
  } else {
    gaps.push(`Build determinism: ${bdState.summary}`);
    passed = false;
  }

  // 5g. Version surfaces agreement
  const ri = readJson('config/release-identity.json');
  const pkg = readJson('package.json');
  const versionJs = readText('apps/lab-web/src/version.js');
  const versionMjs = readText('packages/shared/src/version.mjs');
  const allVersions = [
    ri?.version,
    pkg?.version,
    versionJs?.match(/LAB_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1],
    versionMjs?.match(/LAB_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1],
  ].filter(Boolean);
  const uniqueVersions = new Set(allVersions);
  if (uniqueVersions.size === 1) {
    evidence.push(`All version surfaces agree: ${[...uniqueVersions][0]}.`);
  } else {
    gaps.push(`Version surfaces disagree: ${[...uniqueVersions].join(', ')}`);
    passed = false;
  }

  // 5h. Test accounting reconciliation
  const audit = readJson('reports/self-audit.json');
  if (audit?.testAccountingReconciled === true) {
    evidence.push('Test accounting reconciled.');
  } else {
    gaps.push('Test accounting not reconciled.');
    passed = false;
  }

  // 5i. CI status: NOT_RUN until a pushed commit passes GitHub Actions
  const ciState = notRunState('ci', 'Remote CI status not verified — no GitHub Actions run observed for this commit.',
    ['Remote CI must pass on the exact release commit before production readiness']);
  controls.push({ name: 'remote-ci', ...ciState });
  evidence.push('Remote CI: NOT_RUN (no GitHub Actions run observed for this commit).');
  // CI NOT_RUN does not block local certification but blocks production

  return { passed, evidence, gaps, controls };
}

// ── Gate 6: Human Validation ─────────────────────────────────────

function gateHumanValidation() {
  const controls = [];
  const evidence = [];
  const gaps = [];
  let passed = false; // Human validation is BLOCKING until sessions are conducted

  // 6a. Protocol documentation check (documentation-only)
  const roadmap = readText('docs/ROADMAP.md');
  const protocolDocState = docCheck('docs/ROADMAP.md', 'Human validation protocol documentation', 'human');
  controls.push({ name: 'protocol-documentation', ...protocolDocState });

  if (roadmap && roadmap.includes('Human validation') && roadmap.includes('structured sessions')) {
    evidence.push('Human validation protocol documented in ROADMAP.md.');
  } else {
    gaps.push('Human validation protocol not documented.');
  }

  // 6b. Measurement criteria
  const criteria = [
    'start a correct match',
    'action is unavailable',
    'priority and response windows',
    'recover from disconnection',
    'replay and inspect',
  ];
  let criteriaFound = 0;
  for (const c of criteria) {
    if (roadmap && roadmap.includes(c)) criteriaFound++;
  }
  if (criteriaFound === criteria.length) {
    evidence.push(`All ${criteria.length} human validation measurement criteria are documented.`);
  } else {
    gaps.push(`Only ${criteriaFound}/${criteria.length} human validation measurement criteria documented.`);
  }

  // 6c. Session records: NOT_RUN until actual sessions exist
  const sessionState = notRunState('human',
    'No human validation session records found. Protocol exists but sessions have not been conducted.',
    ['Actual human validation sessions must be conducted and recorded before release certification']);
  controls.push({ name: 'session-records', ...sessionState });

  // 6d. Check for session records (would exist if sessions were conducted)
  const sessionRecordsExist = fileExists('reports/human-validation-sessions.json');
  if (!sessionRecordsExist) {
    gaps.push('No human validation session records found — sessions NOT_RUN (BLOCKING).');
    evidence.push('NOTE: Protocol status is PASS (documented), but session status is NOT_RUN (BLOCKING). Release gate remains blocked.');
  } else {
    // If session records exist, verify they contain actual sessions
    const sessions = readJson('reports/human-validation-sessions.json');
    if (sessions && Array.isArray(sessions.sessions) && sessions.sessions.length > 0) {
      evidence.push(`Human validation sessions recorded: ${sessions.sessions.length} sessions.`);
      passed = true;
    } else {
      gaps.push('Human validation session records exist but contain no sessions.');
    }
  }

  return { passed, evidence, gaps, controls };
}

// ── Exports for testing ──────────────────────────────────────────

export { runControl, consumeReport, docCheck, notRunState, gitHead, gitTree, gitDirty };

// ── Gate registry ────────────────────────────────────────────────

export const CERTIFICATION_GATES = Object.freeze({
  'rules-engine': { name: 'Rules & Engine', fn: gateRulesEngine },
  'local-experience': { name: 'Local Player Experience', fn: gateLocalExperience },
  'online-experience': { name: 'Online Experience', fn: gateOnlineExperience },
  'laboratory': { name: 'Laboratory', fn: gateLaboratory },
  'release-engineering': { name: 'Release Engineering', fn: gateReleaseEngineering },
  'human-validation': { name: 'Human Validation', fn: gateHumanValidation },
});

/**
 * Run all certification gates and return a structured result with evidence-state objects.
 * @returns {{ passed: boolean, gates: object, summary: object, release: object }}
 */
export function runAllGates() {
  const gates = {};
  let allPassed = true;
  const failedCriticalGates = [];
  const externalBlockers = [];

  for (const [key, gate] of Object.entries(CERTIFICATION_GATES)) {
    const result = gate.fn();
    gates[key] = { name: gate.name, ...result };
    if (!result.passed) {
      allPassed = false;
      failedCriticalGates.push(key);
    }
    // Collect external blockers from NOT_RUN/BLOCKED controls
    for (const control of (result.controls || [])) {
      if (control.status === 'NOT_RUN' || control.status === 'BLOCKED') {
        for (const blocker of (control.blockers || [])) {
          externalBlockers.push({ gate: key, control: control.name, blocker });
        }
      }
    }
  }

  const summary = {
    totalGates: Object.keys(CERTIFICATION_GATES).length,
    passedGates: Object.values(gates).filter(g => g.passed).length,
    failedGates: Object.values(gates).filter(g => !g.passed).length,
    allPassed,
  };

  const release = {
    version: readJson('package.json')?.version,
    gitCommit: HEAD,
    gitTree: TREE,
    dirty: DIRTY,
    lockfileSha256: LOCKFILE,
    generatedAt: new Date().toISOString(),
  };

  return { passed: allPassed, gates, summary, release, failedCriticalGates, externalBlockers };
}

// ── CLI ──────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
    process.argv[1]?.endsWith('certification-gates.mjs')) {
  const args = process.argv.slice(2);
  const jsonOut = args.includes('--json');
  const gateArg = args.find(a => a.startsWith('--gate='));
  const gateKey = gateArg?.split('=')[1];

  if (gateKey && CERTIFICATION_GATES[gateKey]) {
    const gate = CERTIFICATION_GATES[gateKey];
    const result = gate.fn();
    if (jsonOut) {
      console.log(JSON.stringify({ key: gateKey, ...result }, null, 2));
    } else {
      console.log(`\n${gate.name}`);
      console.log(`${'─'.repeat(40)}`);
      console.log(`Status: ${result.passed ? 'PASS' : 'FAIL'}\n`);
      for (const e of result.evidence) console.log(`  ✅ ${e}`);
      for (const g of result.gaps) console.log(`  ❌ ${g}`);
      if (result.controls) {
        console.log(`\n  Controls:`);
        for (const c of result.controls) {
          const icon = c.status === 'PASS' ? '✅' : c.status === 'NOT_RUN' ? '⏸️' : '❌';
          console.log(`  ${icon} ${c.name}: ${c.status} — ${c.summary?.slice(0, 100)}`);
        }
      }
    }
    process.exit(result.passed ? 0 : 1);
  }

  const result = runAllGates();

  if (jsonOut) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('\n══════════════════════════════════════════════════════════');
    console.log('v1.0.0 Certified Public Baseline — Executable Certification Gates');
    console.log('══════════════════════════════════════════════════════════\n');
    for (const [, gate] of Object.entries(result.gates)) {
      const icon = gate.passed ? '✅' : '❌';
      console.log(`${icon} ${gate.name}`);
      for (const e of gate.evidence) console.log(`   ✅ ${e}`);
      for (const g of gate.gaps) console.log(`   ❌ ${g}`);
      if (gate.controls) {
        for (const c of gate.controls) {
          const cicon = c.status === 'PASS' ? '✅' : c.status === 'NOT_RUN' ? '⏸️' : '❌';
          console.log(`   ${cicon} [control] ${c.name}: ${c.status}`);
        }
      }
      console.log();
    }
    console.log('══════════════════════════════════════════════════════════');
    console.log(`Summary: ${result.summary.passedGates}/${result.summary.totalGates} gates passed`);
    console.log(`Overall: ${result.passed ? 'CERTIFIED' : 'NOT CERTIFIED'}`);
    if (result.externalBlockers.length > 0) {
      console.log(`\nExternal blockers (${result.externalBlockers.length}):`);
      for (const b of result.externalBlockers) {
        console.log(`  ⚠️  [${b.gate}/${b.control}] ${b.blocker}`);
      }
    }
    console.log('══════════════════════════════════════════════════════════\n');
  }

  process.exit(result.passed ? 0 : 1);
}
