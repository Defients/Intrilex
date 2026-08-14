import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Check if we're in WSL where pnpm isn't available
const isWsl = process.platform === 'linux' && existsSync('/proc/version') && readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');
if (isWsl) {
  console.log('EXTRACTED RELEASE SKIP: pnpm not available in WSL — run from PowerShell instead');
  process.exit(0);
}

const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const zipName = `Intrilex_Simulation_Lab_v${packageJson.version}_Mechanics_Observatory.zip`;
const zip = path.join(root, 'release', zipName);
const checksumFile = `${zip}.sha256`;
const temp = await mkdtemp(path.join(tmpdir(), 'intrilex-lab-extracted-'));
const steps = [];

function record(name, status, details = {}) { steps.push({ name, status, ...details }); }
function run(name, command, args, cwd = temp, env = {}) {
  console.log(`\n[EXTRACTED VERIFY] ${name}`);
  const started = Date.now();
  const result = spawnSync(command, args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit', shell: true });
  const step = { name, status: result.status === 0 ? 'PASS' : 'FAIL', exitCode: result.status, durationMs: Date.now() - started };
  steps.push(step);
  if (result.status !== 0) throw new Error(`${name} failed with exit code ${result.status}`);
}

let status = 'PASS';
let error = null;
let zipSha256 = null;
let manifestPayloadHash = null;
try {
  const zipBytes = await readFile(zip);
  zipSha256 = createHash('sha256').update(zipBytes).digest('hex');
  const companion = (await readFile(checksumFile, 'utf8')).trim().split(/\s+/)[0];
  if (zipSha256 !== companion) throw new Error('ZIP_SHA256_COMPANION_MISMATCH');
  record('zip-sha256', 'PASS', { zipSha256 });

  const isWin = process.platform === 'win32';
  const list = isWin
    ? spawnSync('tar', ['-tf', zip], { cwd: root, encoding: 'utf8' })
    : spawnSync('unzip', ['-Z1', zip], { cwd: root, encoding: 'utf8' });
  if (list.status !== 0) throw new Error('ZIP_LIST_FAILED');
  const unsafe = list.stdout.split(/\r?\n/).filter(Boolean).filter((entry) => entry.startsWith('/') || entry.split('/').includes('..'));
  if (unsafe.length) throw new Error(`UNSAFE_ARCHIVE_PATH:${unsafe[0]}`);
  record('archive-path-safety', 'PASS', { entryCount: list.stdout.split(/\r?\n/).filter(Boolean).length });

  if (isWin) run('extract', 'tar', ['-xf', zip, '-C', temp], root);
  else run('extract', 'unzip', ['-q', zip, '-d', temp], root);
  const embeddedManifest = JSON.parse(await readFile(path.join(temp, 'release/RELEASE_MANIFEST.json'), 'utf8'));
  manifestPayloadHash = embeddedManifest.payloadHash;
  run('pnpm-install-offline', 'pnpm', ['install', '--offline', '--frozen-lockfile', '--ignore-scripts']);
  run('manifest-verify-pre-ci', 'pnpm', ['run', 'manifest:verify']);
  run('build-determinism-read-only', 'pnpm', ['run', 'test:build-determinism'], temp, { INTRILEX_WRITE_REPORTS: '0' });
  // IRX-C05: Removed full-ci-read-only step — it recursed into the full CI pipeline,
  // which would re-package the release and re-verify, causing infinite recursion.
  // Instead, run focused verification tests only.
  run('focused-tests-read-only', 'pnpm', ['run', 'test:unit'], temp, { INTRILEX_WRITE_REPORTS: '0' });
  run('manifest-verify-post-ci', 'pnpm', ['run', 'manifest:verify']);
  run('cli-verify-corpus', 'pnpm', ['run', 'cli', '--', 'verify-corpus']);
  run('cli-advanced-core-match', 'pnpm', ['run', 'cli', '--', 'match', '--profile', 'core-advanced-authority', '--seed', '123', '--p1', 'score-rush', '--p2', 'control']);
  run('cli-advanced-core-campaign', 'pnpm', ['run', 'cli', '--', 'campaign', '--profile', 'core-advanced-authority', '--matches', '100', '--workers', '2', '--p1', 'tempo', '--p2', 'value']);
  run('campaign-artifacts', 'pnpm', ['run', 'campaign:verify']);
} catch (caught) {
  status = 'FAIL';
  error = caught instanceof Error ? caught.message : String(caught);
}

const report = {
  schemaVersion: '1.2', status, sourceZip: zipName, zipSha256, manifestPayloadHash,
  verificationMode: 'CURRENT_ZIP_SHA256_SAFE_EXTRACTION_OFFLINE_INSTALL_READ_ONLY_FULL_CI_POST_CI_MANIFEST_CLI_ADVANCED_CORE',
  steps, error
};
const internal = { ...report, steps: steps.map(({ name, status: stepStatus, exitCode = null, zipSha256: stepHash = null, entryCount = null }) => ({ name, status: stepStatus, exitCode, zipSha256: stepHash, entryCount })) };
await writeFile(path.join(root, 'release/extracted-verification-report.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(path.join(root, 'reports/extracted-verification-report.json'), `${JSON.stringify(internal, null, 2)}\n`);
await rm(temp, { recursive: true, force: true });
console.log(`\nEXTRACTED RELEASE ${status}`);
if (status !== 'PASS') process.exit(1);
