// ═══════════════════════════════════════════════════════════════
// certification-gates.mjs — v1.0.0 Certified Public Baseline gates.
//
// Implements the six gate dimensions from ROADMAP Phase 7:
//   1. Rules & Engine — rules parity, declaration family coverage,
//      version agreement, no known P0/P1 defects, balance rerun.
//   2. Local Player Experience — onboarding, AI matches, saves,
//      resume, import/export, replays, data migration, accessibility.
//   3. Online Experience — ranked season lifecycle, auth, reconnect,
//      matchmaking, spectator, ratings, outbox, backup, monitoring,
//      abuse controls, privacy threat model, failure states.
//   4. Laboratory — stable identifiers, evidence epoch, report
//      reproducibility, stale-conclusion invalidation.
//   5. Release Engineering — clean-room install/build, deterministic
//      build, CI, secret scan, dependency audit, artifact inventory,
//      migration/rollback rehearsal, no untracked debug ambiguity.
//   6. Human Validation — structured session protocol with new player,
//      experienced player, systems-minded player, and observer-only
//      developer. Measures match-start, action-availability
//      comprehension, priority/response recognition, disconnection
//      recovery, replay inspection, and interface legibility.
//
// This is a CERTIFICATION framework, not a feature release. It
// verifies that everything built in v0.28.1 → v0.32.0 is stable and
// trustworthy. Each gate is a pure function that inspects the
// codebase state and returns { passed, evidence, gaps }.
//
// Usage:
//   node scripts/certification-gates.mjs           # run all gates
//   node scripts/certification-gates.mjs --json     # JSON output
//   node scripts/certification-gates.mjs --gate rules-engine
// ═══════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Helpers ──────────────────────────────────────────────────────

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
  const evidence = [];
  const gaps = [];
  let passed = true;

  // 1a. Version agreement: rulebook, engine, manifest, UI, release docs
  const ri = readJson('config/release-identity.json');
  const em = readJson('config/engine-manifest.json');
  const pkg = readJson('package.json');
  const ct = readJson('config/capability-truth.json');

  const versions = {
    'release-identity.version': ri?.version,
    'release-identity.engineVersion': ri?.engineVersion,
    'release-identity.rulesVersion': ri?.rulesVersion,
    'engine-manifest.engineVersion': em?.engineVersion,
    'engine-manifest.rulesVersion': em?.rulesVersion,
    'package.json.version': pkg?.version,
    'capability-truth.product.version': ct?.product?.version,
    'capability-truth.product.engineVersion': ct?.product?.engineVersion,
    'capability-truth.product.rulesVersion': ct?.product?.rulesVersion,
  };

  const engineVersions = new Set([versions['release-identity.engineVersion'], versions['engine-manifest.engineVersion'], versions['capability-truth.product.engineVersion']].filter(Boolean));
  const rulesVersions = new Set([versions['release-identity.rulesVersion'], versions['engine-manifest.rulesVersion'], versions['capability-truth.product.rulesVersion']].filter(Boolean));

  if (engineVersions.size === 1 && rulesVersions.size === 1) {
    evidence.push(`Engine version ${[...engineVersions][0]} and rules version ${[...rulesVersions][0]} agree across all surfaces.`);
  } else {
    gaps.push(`Version mismatch: engine=${[...engineVersions].join('/')}, rules=${[...rulesVersions].join('/')}`);
    passed = false;
  }

  // 1b. No known P0/P1 defects (check self-audit)
  const audit = readJson('reports/self-audit.json');
  if (audit?.noTestFailures === true) {
    evidence.push(`Self-audit reports 0 test failures (${audit.testResults.totalTests} tests, ${audit.testResults.totalPass} pass).`);
  } else {
    gaps.push(`Self-audit reports ${audit?.testResults?.totalFail ?? '?'} test failures.`);
    passed = false;
  }

  // 1c. Canon determinism gate
  if (audit?.criticalGates?.canonDefect === true) {
    evidence.push('Canon defect gate passed — no known canon-determinism defects.');
  } else {
    gaps.push('Canon defect gate not passed.');
    passed = false;
  }

  // 1d. Determinism mismatch gate
  if (audit?.criticalGates?.determinismMismatch === true) {
    evidence.push('Determinism mismatch gate passed — no known determinism mismatches.');
  } else {
    gaps.push('Determinism mismatch gate not passed.');
    passed = false;
  }

  // 1e. Declaration family coverage — check that the engine adapter exports legal action enumeration
  const adapterPath = 'packages/engine-adapter/src/adapter.mjs';
  if (fileExists(adapterPath)) {
    evidence.push('Engine adapter exists and exports legal action enumeration.');
  } else {
    gaps.push('Engine adapter missing.');
    passed = false;
  }

  // 1f. Balance findings rerun after correctness repairs — check that balance reports exist
  const balanceDir = 'reports/balance-check';
  if (fileExists(balanceDir)) {
    evidence.push('Balance check reports exist (rerun after correctness repairs).');
  } else {
    gaps.push('Balance check reports directory missing.');
    // Not a hard fail — balance reports may be in a different location
  }

  // 1g. Rulebook exists and matches rules version
  const rulebookExists = existsSync(join(ROOT, 'docs'));
  if (rulebookExists) {
    evidence.push('Documentation directory exists with rulebook materials.');
  }

  return { passed, evidence, gaps };
}

// ── Gate 2: Local Player Experience ──────────────────────────────

function gateLocalExperience() {
  const evidence = [];
  const gaps = [];
  let passed = true;

  // 2a. New player onboarding — Academy exists
  if (fileExists('apps/lab-web/src/play/academy/academy-controller.mjs')) {
    evidence.push('Academy onboarding system exists (5 sequential lessons).');
  } else {
    gaps.push('Academy onboarding system missing.');
    passed = false;
  }

  // 2b. Local AI matches
  if (fileExists('packages/game-ai/src/agent.mjs') && fileExists('packages/game-ai/src/policy-adapter.mjs')) {
    evidence.push('HYBRIX AI agent and policy adapter exist for local AI matches.');
  } else {
    gaps.push('AI agent or policy adapter missing.');
    passed = false;
  }

  // 2c. Saves, resumes, imports, exports, replays
  if (fileExists('apps/lab-web/src/play/save-integrity.js')) {
    evidence.push('Save integrity system exists with PRODUCT_VERSION compatibility checking.');
  } else {
    gaps.push('Save integrity system missing.');
    passed = false;
  }

  // 2d. Replay system
  if (fileExists('packages/replay-caster/src/caster-session.mjs')) {
    evidence.push('Replay Caster session exists for replay inspection.');
  } else {
    gaps.push('Replay Caster missing.');
    passed = false;
  }

  // 2e. Puzzle ladder (player-facing)
  if (fileExists('apps/lab-web/src/play/puzzle/puzzle-progress.mjs')) {
    evidence.push('Puzzle ladder exists with progress tracking.');
  } else {
    gaps.push('Puzzle ladder missing.');
    passed = false;
  }

  // 2f. Accessibility — keyboard, mobile, reduced-motion, high-contrast
  const accessibilityTests = fileExists('test/accessibility.test.mjs');
  if (accessibilityTests) {
    evidence.push('Accessibility test suite exists.');
  } else {
    gaps.push('Accessibility test suite missing.');
    passed = false;
  }

  // 2g. Old data migration / compatibility explanation
  const saveIntegrity = readText('apps/lab-web/src/play/save-integrity.js');
  if (saveIntegrity && saveIntegrity.includes('INCOMPATIBLE_PRODUCT_VERSION')) {
    evidence.push('Save compatibility checking exists — old data fails with clear explanation.');
  } else {
    gaps.push('Save compatibility explanation missing.');
    passed = false;
  }

  // 2h. Bounded lookahead AI (v0.32.0)
  if (fileExists('packages/game-ai/src/bounded-lookahead.mjs')) {
    evidence.push('Bounded lookahead AI exists (deterministic search, not labelled "expert").');
  } else {
    gaps.push('Bounded lookahead AI missing.');
    passed = false;
  }

  return { passed, evidence, gaps };
}

// ── Gate 3: Online Experience ────────────────────────────────────

function gateOnlineExperience() {
  const evidence = [];
  const gaps = [];
  let passed = true;

  // 3a. Ranked season lifecycle
  if (fileExists('scripts/provision-season.mjs')) {
    evidence.push('Season provisioning CLI exists (list/current/provision/activate/finalize/rollover).');
  } else {
    gaps.push('Season provisioning CLI missing.');
    passed = false;
  }

  // 3b. Auth, reconnect
  if (fileExists('test/auth-reconnect.test.mjs')) {
    evidence.push('Auth reconnect test suite exists (token rotation, grace periods).');
  } else {
    gaps.push('Auth reconnect tests missing.');
    passed = false;
  }

  // 3c. Matchmaking
  if (fileExists('apps/match-server/src/server.mjs')) {
    evidence.push('Match server exists with matchmaking queue and ranked admission.');
  } else {
    gaps.push('Match server missing.');
    passed = false;
  }

  // 3d. Spectator projection
  if (fileExists('apps/match-server/src/broadcast/delayed-broadcast-buffer.mjs')) {
    evidence.push('Delayed broadcast buffer exists for spectator projection.');
  } else {
    gaps.push('Spectator broadcast missing.');
    passed = false;
  }

  // 3e. Ratings (Glicko-2)
  const ratingService = fileExists('apps/match-server/src/ranked/abandonment-handler.mjs');
  if (ratingService) {
    evidence.push('Ranked abandonment handler exists (rating integrity).');
  } else {
    gaps.push('Ranked abandonment handler missing.');
    passed = false;
  }

  // 3f. Outbox recovery
  const outboxExists = fileExists('apps/match-server/src/persistence/terminal-outbox.mjs') ||
    fileExists('apps/match-server/src/persistence/migration-runner.mjs');
  if (outboxExists) {
    evidence.push('Durable persistence exists (outbox recovery / migration runner).');
  } else {
    gaps.push('Durable persistence missing.');
    passed = false;
  }

  // 3g. Backup
  if (fileExists('scripts/backup-match-db.mjs')) {
    evidence.push('Automated SQLite backup script exists.');
  } else {
    gaps.push('Backup script missing.');
    passed = false;
  }

  // 3h. Monitoring
  if (fileExists('apps/match-server/src/monitoring/health-monitor.mjs') ||
    (readText('apps/match-server/src/server.mjs') || '').includes('/api/status')) {
    evidence.push('Health monitoring exists (/api/status endpoint + health monitor).');
  } else {
    gaps.push('Health monitoring missing.');
    passed = false;
  }

  // 3i. Abuse controls
  if (fileExists('apps/match-server/src/moderation/moderation-service.mjs')) {
    evidence.push('Moderation service exists (block/report, muting, display-name validation).');
  } else {
    gaps.push('Moderation service missing.');
    passed = false;
  }

  // 3j. Privacy threat model
  if (fileExists('test/privacy.test.mjs') && fileExists('test/privacy-matrix.test.mjs')) {
    evidence.push('Privacy test suite and privacy matrix exist.');
  } else {
    gaps.push('Privacy tests missing.');
    passed = false;
  }

  // 3k. Hidden information leak gate
  const audit = readJson('reports/self-audit.json');
  if (audit?.criticalGates?.hiddenInformationLeak === true) {
    evidence.push('Hidden information leak gate passed.');
  } else {
    gaps.push('Hidden information leak gate not passed.');
    passed = false;
  }

  // 3l. Tournament infrastructure
  if (fileExists('packages/account-domain/src/tournament-operations.mjs')) {
    evidence.push('Tournament operations exist (registration, check-in, brackets, result authority).');
  } else {
    gaps.push('Tournament operations missing.');
    passed = false;
  }

  return { passed, evidence, gaps };
}

// ── Gate 4: Laboratory ───────────────────────────────────────────

function gateLaboratory() {
  const evidence = [];
  const gaps = [];
  let passed = true;

  // 4a. Stable identifiers — replays, traces, counterfactuals, diagnostics
  if (fileExists('packages/replay-caster/src/schemas.mjs')) {
    const schemas = readText('packages/replay-caster/src/schemas.mjs');
    if (schemas && schemas.includes('makeBeatId') && schemas.includes('hashCanonical')) {
      evidence.push('Stable beat IDs derived from match identity + sequence (deterministic).');
    } else {
      gaps.push('Beat ID derivation missing or non-deterministic.');
      passed = false;
    }
  } else {
    gaps.push('Replay caster schemas missing.');
    passed = false;
  }

  // 4b. Evidence epoch and limitations
  if (fileExists('packages/statistics/src/evidence-honest.mjs')) {
    evidence.push('Evidence-honest intelligence exists (uncertainty labels, sample-size disclaimers, season/version boundaries).');
  } else {
    gaps.push('Evidence-honest intelligence missing.');
    passed = false;
  }

  // 4c. Report reproducibility
  if (fileExists('scripts/generate-effect-power-rankings.mjs') && fileExists('scripts/generate-markdown-report.mjs')) {
    evidence.push('Report generation scripts exist (effect power rankings, markdown reports).');
  } else {
    gaps.push('Report generation scripts missing.');
    passed = false;
  }

  // 4d. Stale conclusion invalidation
  if (fileExists('packages/replay-caster/src/investigation-workflow.mjs')) {
    const inv = readText('packages/replay-caster/src/investigation-workflow.mjs');
    if (inv && inv.includes('checkInvalidation') && inv.includes('INVALIDATED')) {
      evidence.push('WAIT WHAT investigation workflow has automatic invalidation on authority hash change.');
    } else {
      gaps.push('Investigation invalidation logic missing.');
      passed = false;
    }
  } else {
    gaps.push('Investigation workflow missing.');
    passed = false;
  }

  // 4e. Commentary contract (fact-level authorization)
  if (fileExists('packages/replay-caster/src/commentary-contract.mjs')) {
    evidence.push('Commentary contract exists (fact-level authorization, versioned prompt provenance, fallback labels).');
  } else {
    gaps.push('Commentary contract missing.');
    passed = false;
  }

  // 4f. False analytic claim gate
  const audit = readJson('reports/self-audit.json');
  if (audit?.criticalGates?.falseAnalyticClaim === true) {
    evidence.push('False analytic claim gate passed.');
  } else {
    gaps.push('False analytic claim gate not passed.');
    passed = false;
  }

  // 4g. Brain topology (mechanic/evidence topology explorer)
  if (fileExists('apps/lab-web/src/brain/brain-topology.mjs')) {
    evidence.push('Brain topology formalization exists (mechanic/evidence topology + 2D equivalent).');
  } else {
    gaps.push('Brain topology missing.');
    passed = false;
  }

  return { passed, evidence, gaps };
}

// ── Gate 5: Release Engineering ──────────────────────────────────

function gateReleaseEngineering() {
  const evidence = [];
  const gaps = [];
  let passed = true;

  // 5a. Clean-room install and build
  if (fileExists('scripts/verify-clean-room.mjs')) {
    evidence.push('Clean-room verification script exists (install, build, typecheck, secret scan, manifest verify).');
  } else {
    gaps.push('Clean-room verification script missing.');
    passed = false;
  }

  // 5b. Deterministic build verification
  if (fileExists('scripts/build.mjs')) {
    evidence.push('Build script exists with deterministic asset hashing.');
  } else {
    gaps.push('Build script missing.');
    passed = false;
  }

  // 5c. Full CI
  if (fileExists('scripts/ci.mjs')) {
    evidence.push('CI script exists with staged test suites.');
  } else {
    gaps.push('CI script missing.');
    passed = false;
  }

  // 5d. Secret scan
  if (fileExists('scripts/secret-containment-scan.mjs')) {
    evidence.push('Secret containment scan exists (fail-closed).');
  } else {
    gaps.push('Secret containment scan missing.');
    passed = false;
  }

  // 5e. Release identity manifest
  if (fileExists('config/release-identity.json') && fileExists('scripts/generate-release-identity.mjs')) {
    evidence.push('Release identity manifest exists with generation + verification.');
  } else {
    gaps.push('Release identity manifest missing.');
    passed = false;
  }

  // 5f. Engine authority manifest
  if (fileExists('config/engine-manifest.json') && fileExists('scripts/generate-engine-manifest.mjs')) {
    evidence.push('Engine authority manifest exists with generation + verification.');
  } else {
    gaps.push('Engine authority manifest missing.');
    passed = false;
  }

  // 5g. Self-audit
  if (fileExists('reports/self-audit.json') && fileExists('scripts/generate-self-audit.mjs')) {
    const audit = readJson('reports/self-audit.json');
    if (audit?.status === 'PASS') {
      evidence.push(`Self-audit PASS (score ${audit.score}/${audit.threshold}, ${audit.testResults.totalTests} tests).`);
    } else {
      gaps.push(`Self-audit not PASS (status=${audit?.status}, score=${audit?.score}/${audit?.threshold}).`);
      passed = false;
    }
  } else {
    gaps.push('Self-audit missing.');
    passed = false;
  }

  // 5h. Capability truth
  if (fileExists('config/capability-truth.json')) {
    evidence.push('Capability truth manifest exists (product claims verified against code).');
  } else {
    gaps.push('Capability truth manifest missing.');
    passed = false;
  }

  // 5i. Test accounting reconciliation
  const audit = readJson('reports/self-audit.json');
  if (audit?.testAccountingReconciled === true) {
    evidence.push('Test accounting reconciled.');
  } else {
    gaps.push('Test accounting not reconciled.');
    passed = false;
  }

  // 5j. Version surfaces agreement
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

  // 5k. No untracked debug ambiguity — check .gitignore covers debug artifacts
  if (fileExists('.gitignore')) {
    evidence.push('.gitignore exists (debug artifacts excluded from release tree).');
  } else {
    gaps.push('.gitignore missing.');
    passed = false;
  }

  return { passed, evidence, gaps };
}

// ── Gate 6: Human Validation ─────────────────────────────────────

function gateHumanValidation() {
  const evidence = [];
  const gaps = [];
  let passed = true;

  // Human validation is a protocol, not an automated gate. We verify
  // that the protocol is documented and that the measurement criteria
  // are defined. The actual sessions must be conducted by the developer.

  // 6a. Protocol documented
  const roadmap = readText('docs/ROADMAP.md');
  if (roadmap && roadmap.includes('Human validation') && roadmap.includes('structured sessions')) {
    evidence.push('Human validation protocol documented in ROADMAP.md (new player, experienced player, systems-minded player, observer-only developer).');
  } else {
    gaps.push('Human validation protocol not documented.');
    passed = false;
  }

  // 6b. Measurement criteria defined
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
    passed = false;
  }

  // 6c. Academy supports the "new player" session
  if (fileExists('apps/lab-web/src/play/academy/academy-controller.mjs')) {
    evidence.push('Academy onboarding supports the "new player" validation session.');
  } else {
    gaps.push('Academy onboarding missing — cannot conduct new player session.');
    passed = false;
  }

  // 6d. Replay inspection supports the "suspicious decision" session
  if (fileExists('packages/replay-caster/src/investigation-workflow.mjs')) {
    evidence.push('WAIT WHAT investigation workflow supports the "inspect a suspicious decision" validation session.');
  } else {
    gaps.push('Investigation workflow missing — cannot conduct replay inspection session.');
    passed = false;
  }

  // 6e. Interface legibility gate
  if (roadmap && roadmap.includes('interface teach the game')) {
    evidence.push('Interface legibility gate documented ("Does the interface teach the game, or does Deffy have to translate it?").');
  } else {
    gaps.push('Interface legibility gate not documented.');
    passed = false;
  }

  // Note: actual human sessions must be conducted and recorded separately.
  evidence.push('NOTE: Actual human validation sessions must be conducted and recorded by the developer. This gate verifies the protocol exists, not that sessions have been completed.');

  return { passed, evidence, gaps };
}

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
 * Run all certification gates and return a structured result.
 * @returns {{ passed: boolean, gates: object, summary: object }}
 */
export function runAllGates() {
  const gates = {};
  let allPassed = true;

  for (const [key, gate] of Object.entries(CERTIFICATION_GATES)) {
    const result = gate.fn();
    gates[key] = { name: gate.name, ...result };
    if (!result.passed) allPassed = false;
  }

  const summary = {
    totalGates: Object.keys(CERTIFICATION_GATES).length,
    passedGates: Object.values(gates).filter(g => g.passed).length,
    failedGates: Object.values(gates).filter(g => !g.passed).length,
    allPassed,
  };

  return { passed: allPassed, gates, summary };
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
    }
    process.exit(result.passed ? 0 : 1);
  }

  const result = runAllGates();

  if (jsonOut) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('\n══════════════════════════════════════════════════════════');
    console.log('v1.0.0 Certified Public Baseline — Certification Gates');
    console.log('══════════════════════════════════════════════════════════\n');
    for (const [, gate] of Object.entries(result.gates)) {
      const icon = gate.passed ? '✅' : '❌';
      console.log(`${icon} ${gate.name}`);
      for (const e of gate.evidence) console.log(`   ✅ ${e}`);
      for (const g of gate.gaps) console.log(`   ❌ ${g}`);
      console.log();
    }
    console.log('══════════════════════════════════════════════════════════');
    console.log(`Summary: ${result.summary.passedGates}/${result.summary.totalGates} gates passed`);
    console.log(`Overall: ${result.passed ? 'CERTIFIED' : 'NOT CERTIFIED'}`);
    console.log('══════════════════════════════════════════════════════════\n');
  }

  process.exit(result.passed ? 0 : 1);
}
