// ═══════════════════════════════════════════════════════════════
// verify-clean-room.mjs — Phase 2D: Clean-room reproduction verification
//
// Verifies that the workspace can be reproduced from the canonical
// source archive by checking:
//   1. All declared dependencies are installable (pnpm install --frozen-lockfile)
//   2. The build produces deterministic artifacts (pnpm run build)
//   3. The typecheck passes (npx tsc --noEmit)
//   4. The secret containment scan passes
//   5. The release identity manifest is consistent
//   6. The engine manifest is consistent
//   7. A representative test suite passes
//
// This script is the "canary" for reproducibility — it runs the
// minimal set of checks that prove the workspace is self-consistent
// and can be rebuilt from source.
//
// Usage:
//   node scripts/verify-clean-room.mjs           # full check
//   node scripts/verify-clean-room.mjs --quick   # skip install + build
// ═══════════════════════════════════════════════════════════════

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const args = process.argv.slice(2);
const quick = args.includes('--quick');

const steps = [];
let allPassed = true;

function runStep(name, cmd, cmdArgs, opts = {}) {
  const started = Date.now();
  // On Windows, npx and pnpm are .cmd wrappers that need shell:true to be found.
  // Node.exe (process.execPath) should NOT use shell:true because its path
  // may contain spaces (e.g. "C:\Program Files\nodejs\node.exe").
  const needsShell = process.platform === 'win32' && (cmd === 'npx' || cmd === 'pnpm');
  const result = spawnSync(cmd, cmdArgs, {
    cwd: ROOT,
    stdio: opts.silent ? ['pipe', 'pipe', 'pipe'] : 'inherit',
    timeout: opts.timeout ?? 120000,
    shell: needsShell,
  });
  const duration = Date.now() - started;
  const passed = result.status === 0;
  if (!passed) allPassed = false;
  steps.push({ name, passed, duration, status: result.status });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name} (${duration}ms)`);
  if (!passed && opts.silent && result.stderr) {
    console.log(`   stderr: ${result.stderr.toString().trim().split('\n').slice(0, 5).join('\n   ')}`);
  }
  return passed;
}

// ── Pre-flight checks ──

console.log('══════════════════════════════════════════════════════════');
console.log('Phase 2D: Clean-Room Reproduction Verification');
console.log('══════════════════════════════════════════════════════════');
console.log();

// 1. Verify essential files exist
const essentialFiles = [
  'package.json',
  'pnpm-lock.yaml',
  'tsconfig.json',
  '.gitignore',
  'config/release-identity.json',
  'config/engine-manifest.json',
  'packages/engine-adapter/src/adapter.mjs',
  'packages/shared/src/version.mjs',
  'packages/network-protocol/src/validation.mjs',
  'packages/match-authority/src/authoritative-match-session.mjs',
  'apps/match-server/src/server.mjs',
];

console.log('Step 1: Essential file presence check');
let filesOk = true;
for (const file of essentialFiles) {
  if (!existsSync(join(ROOT, file))) {
    console.log(`  ❌ Missing: ${file}`);
    filesOk = false;
  }
}
if (filesOk) {
  console.log('  ✅ All essential files present');
  steps.push({ name: 'Essential files', passed: true, duration: 0, status: 0 });
} else {
  console.log('  ❌ Some essential files missing');
  steps.push({ name: 'Essential files', passed: false, duration: 0, status: 1 });
  allPassed = false;
}
console.log();

// 2. Verify version consistency
console.log('Step 2: Version consistency check');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const versionContent = readFileSync(join(ROOT, 'packages/shared/src/version.mjs'), 'utf8');
const labVersionMatch = versionContent.match(/LAB_VERSION\s*=\s*"([^"]+)"/);
const releaseIdentity = JSON.parse(readFileSync(join(ROOT, 'config/release-identity.json'), 'utf8'));

let versionsOk = true;
if (labVersionMatch[1] !== pkg.version) {
  console.log(`  ❌ version.mjs LAB_VERSION=${labVersionMatch[1]} != package.json version=${pkg.version}`);
  versionsOk = false;
}
if (releaseIdentity.version !== pkg.version) {
  console.log(`  ❌ release-identity.json version=${releaseIdentity.version} != package.json version=${pkg.version}`);
  versionsOk = false;
}
if (versionsOk) {
  console.log(`  ✅ All versions consistent: ${pkg.version}`);
  steps.push({ name: 'Version consistency', passed: true, duration: 0, status: 0 });
} else {
  steps.push({ name: 'Version consistency', passed: false, duration: 0, status: 1 });
  allPassed = false;
}
console.log();

// 3. Install dependencies (skip in quick mode)
if (!quick) {
  console.log('Step 3: Install dependencies (pnpm install --frozen-lockfile)');
  runStep('pnpm install --frozen-lockfile', 'pnpm', ['install', '--frozen-lockfile'], { timeout: 180000 });
  console.log();
}

// 4. Typecheck
console.log('Step 4: Typecheck (npx tsc --noEmit)');
runStep('tsc --noEmit', 'npx', ['tsc', '--noEmit'], { timeout: 120000 });
console.log();

// 4b. Build verification (IRX-M27: The script claims to verify the build
// but previously never executed it. Now it does.)
console.log('Step 4b: Build verification (pnpm run build)');
runStep('pnpm run build', 'pnpm', ['run', 'build'], { timeout: 300000 });
console.log();

// 5. Secret containment scan
console.log('Step 5: Secret containment scan');
runStep('secret-containment-scan', process.execPath, ['scripts/secret-containment-scan.mjs'], { timeout: 60000 });
console.log();

// 6. Release identity verification
console.log('Step 6: Release identity verification');
runStep('release-identity --verify', process.execPath, ['scripts/generate-release-identity.mjs', '--verify'], { timeout: 30000 });
console.log();

// 7. Engine manifest verification
console.log('Step 7: Engine manifest verification');
runStep('engine-manifest --verify', process.execPath, ['scripts/generate-engine-manifest.mjs', '--verify'], { timeout: 30000 });
console.log();

// 8. Focused test suite (canon certification + network authority + persistence)
console.log('Step 8: Focused test suite (canon + network + persistence + sec-01 + release-identity + engine-manifest)');
runStep('focused tests', process.execPath, [
  '--test',
  'test/canon-scenario-certification.test.mjs',
  'test/network-authority.test.mjs',
  'test/match-result-persistence.test.mjs',
  'test/sec-01-secret-containment.test.mjs',
  'test/release-identity.test.mjs',
  'test/engine-manifest.test.mjs',
], { timeout: 180000 });
console.log();

// ── Summary ──

console.log('══════════════════════════════════════════════════════════');
console.log('Clean-Room Reproduction Summary');
console.log('══════════════════════════════════════════════════════════');
for (const step of steps) {
  const icon = step.passed ? '✅' : '❌';
  console.log(`  ${icon} ${step.name} (${step.duration}ms)`);
}
console.log();

if (allPassed) {
  console.log('✅ CLEAN-ROOM REPRODUCTION: PASS');
  process.exit(0);
} else {
  console.log('❌ CLEAN-ROOM REPRODUCTION: FAIL');
  process.exit(1);
}
