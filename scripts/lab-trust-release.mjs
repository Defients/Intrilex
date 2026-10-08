import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { evolutionIdentity } from './evolution-identity.mjs';
import { captureProvenance, GENERATED_OUTPUT_ROOTS } from './release-provenance.mjs';
import { BROWSER_CAPACITY } from '../packages/simulation-runtime/src/browser-capacity.mjs';
import { LAB_TRUST_POLICY } from '../packages/simulation-runtime/src/lab-trust-policy.mjs';
import assert from 'node:assert/strict';

export const REQUIRED_SCENARIOS = Object.freeze(['two-tab run start', 'owner takeover', 'stale writer', 'duplicate/conflicting commit',
  'middle-batch quota failure', 'worker failure', 'cancel/restart race', 'reload/resume', 'version-incompatible resume',
  'concurrent first challenge', 'changed Head', 'invalid import', 'legacy classification', 'genome-distinct propagation',
  'duplicate sample inclusion', 'mixed-cohort view', 'failed recomputation', 'memory fallback', 'bounded large-run behavior']);

/** Local lab gate only. A passing report never certifies a deployed release. */
export function labTrustVerdict(report) {
  const blockers = [];
  if (!report.sourceBefore?.digest || report.sourceBefore.digest !== report.sourceAfter?.digest) blockers.push('SOURCE_CHANGED_OR_MISSING');
  if (!report.gates?.length || report.gates.some(gate => gate.status !== 'PASS' || gate.exitCode !== 0)) blockers.push('GATE_FAILED_OR_NOT_RUN');
  const t = report.testResults;
  if (!t || !['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].every(key => Number.isInteger(t[key]) && t[key] >= 0) ||
    t.tests < 1 || t.tests !== t.pass + t.fail + t.cancelled + t.skipped + t.todo || t.fail || t.cancelled || t.todo) blockers.push('TEST_ACCOUNTING_INVALID');
  if (!Array.isArray(report.scenarios) || report.scenarios.length !== REQUIRED_SCENARIOS.length ||
    REQUIRED_SCENARIOS.some(name => report.scenarios.filter(s => s.name === name && s.status === 'PASS' && s.evidence?.length).length !== 1)) blockers.push('SCENARIO_EVIDENCE_INCOMPLETE');
  const c = report.capabilities;
  if (!c || c.automaticPromotion !== false || c.confirmatoryComparison !== false || c.browserGames !== 100 || c.deepGames !== 10 ||
    c.workers !== 4 || ![1000, 10000].every(n => c.restrictedGames?.includes(n))) blockers.push('CAPABILITY_RESTRICTIONS_CHANGED');
  const identities = report.browserIdentities;
  if (!report.identity?.fingerprint || !report.identity?.analysisFingerprint || identities?.length !== 3 ||
    identities.some(i => i?.fingerprint !== report.identity.fingerprint || i?.analysisFingerprint !== report.identity.analysisFingerprint)) blockers.push('IMPLEMENTATION_IDENTITY_MISMATCH');
  if (report.baselineGameplay?.status !== 'PASS' || report.baselineGameplay?.checks?.length !== 3 || report.baselineGameplay.checks.some(c => c.status !== 'PASS')) blockers.push('BASELINE_GAMEPLAY_UNVERIFIED');
  return { status: blockers.length ? 'FAIL' : 'PASS', scope: 'local supported lab capabilities', productionApproval: false, blockers };
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function readBuiltIdentity() {
  const { LAB_IDENTITY } = await import(pathToFileURL(path.join(root, 'apps/lab-web/dist/evolution/identity.mjs')).href);
  return LAB_IDENTITY;
}
export async function verifyBaselineGameplay() {
  const fixture = 'sample-data/autonomy/match-summaries.ndjson';
  const original = spawnSync('git', ['show', `HEAD:${fixture}`], { cwd: root, maxBuffer: 32 * 1024 * 1024 });
  assert.equal(original.status, 0, 'the committed baseline fixture must be available');
  const rows = original.stdout.toString('utf8').trim().split('\n').map(line => JSON.parse(line));
  const { runPolicyMatch } = await import('../packages/simulation-runtime/src/runtime.mjs');
  const checks = [];
  for (const ordinal of [0, 1, 6]) {
    const row = rows.find(r => r.matchOrdinal === ordinal); assert.ok(row, `baseline ordinal ${ordinal}`);
    const summary = runPolicyMatch({ ordinal, seed: row.seed, profileId: row.profileId, policyIds: row.policyIds, seatOrder: row.seatOrder,
      includeReplay: false, telemetryEnabled: false }).summary;
    for (const key of ['finalStateHash', 'winner', 'terminationReason', 'finalScores']) assert.deepEqual(summary[key], row[key], `baseline ${ordinal}: ${key}`);
    checks.push({ status: 'PASS', ordinal, seed: row.seed, policyIds: row.policyIds, finalStateHash: summary.finalStateHash,
      winner: summary.winner, terminationReason: summary.terminationReason, finalScores: summary.finalScores });
  }
  return { status: 'PASS', fixture, baselineCommit: captureProvenance(root).gitCommit, fixtureSha256: createHash('sha256').update(original.stdout).digest('hex'),
    checks, scope: 'gameplay outcomes; legacy fixture identity does not confer scientific authority' };
}
async function sourceSnapshot() {
  const result = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error('SOURCE_ENUMERATION_FAILED');
  const files = [...new Set(result.stdout.split('\0').filter(Boolean))].filter(name => !GENERATED_OUTPUT_ROOTS.some(prefix => name.startsWith(prefix))).sort();
  const inputs = [];
  for (const name of files) inputs.push({ path: name, sha256: createHash('sha256').update(await readFile(path.join(root, name))).digest('hex') });
  return { contract: 'intrilex-source-snapshot@1', digest: createHash('sha256').update(JSON.stringify(inputs)).digest('hex'), files: inputs };
}

async function main() {
  const outputArg = process.argv.indexOf('--evidence-dir');
  const output = outputArg >= 0 ? path.resolve(process.argv[outputArg + 1]) : path.join(root, 'reports/local/lab-trust-wave5');
  // Arbitrary evidence paths within source would make the source snapshot self-referential.
  const relative = path.relative(root, output).replaceAll('\\', '/');
  if (!relative.startsWith('../') && !path.isAbsolute(relative) && !relative.startsWith('reports/local/')) throw new Error('EVIDENCE_DIRECTORY_MUST_BE_OUTSIDE_SOURCE_OR_REPORTS_LOCAL');
  await mkdir(output, { recursive: true });
  const report = { contract: 'intrilex-lab-release@1', startedAt: new Date().toISOString(), gates: [], scenarios: [],
    capabilities: { automaticPromotion: LAB_TRUST_POLICY.automaticPromotion, confirmatoryComparison: LAB_TRUST_POLICY.confirmatoryComparison,
      browserGames: BROWSER_CAPACITY.games, deepGames: BROWSER_CAPACITY.deepGames, workers: BROWSER_CAPACITY.workers, restrictedGames: [1000, 10000] },
    notRun: ['deployed-origin migration', 'production release certification', '1000/10000-game browser execution', 'cross-browser and low-memory device validation'] };
  const run = async (name, args, timeoutMs = 240000) => {
    const startedAt = new Date().toISOString();
    console.log(`START ${name}`);
    const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, INTRILEX_SKIP_AUTONOMY_REPLAY_REGEN: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    const parts = []; child.stdout.on('data', x => parts.push(x)); child.stderr.on('data', x => parts.push(x));
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    const exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); }).finally(() => clearTimeout(timer));
    const body = Buffer.concat(parts), evidence = `${name}.log`;
    await writeFile(path.join(output, evidence), body);
    const gate = { name, status: exitCode === 0 && !timedOut ? 'PASS' : 'FAIL', command: [process.execPath, ...args], exitCode,
      timedOut, startedAt, completedAt: new Date().toISOString(), evidence, sha256: createHash('sha256').update(body).digest('hex') };
    report.gates.push(gate); console.log(`${gate.status} ${name}`);
    if (gate.status !== 'PASS') throw new Error('GATE_FAILED:' + name);
    return body.toString('utf8');
  };
  try {
    await run('engine-build', ['scripts/build-engine-patch.mjs']);
    await run('build', ['scripts/build.mjs']);
    report.provenance = captureProvenance(root); report.identity = await evolutionIdentity();
    report.sourceBefore = await sourceSnapshot();
    report.baselineGameplay = JSON.parse(await run('baseline-gameplay', ['scripts/lab-trust-release.mjs', '--baseline']));
    const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    if (!pkg.scripts.test.startsWith('node --test ')) throw new Error('UNKNOWN_ROOT_TEST_COMMAND');
    const full = await run('full-suite', pkg.scripts.test.slice(5).split(/\s+/), 900000);
    report.testResults = Object.fromEntries(['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map(key => [key, Number(full.match(new RegExp(`^# ${key} (\\d+)$`, 'm'))?.[1]) ]));
    report.existingSuiteLimitations = { canonUnproven: Number(full.match(/ENGINE CANON COMPLIANCE: INCOMPLETE[^\n]*?(\d+) fixture/)?.[1] ?? 0),
      skippedChecks: full.split('\n').filter(line => line.includes('# SKIP')).map(line => line.trim()),
      scope: 'Existing rules certification and disabled checks; these are not new lab trust regression failures.' };
    await run('lint', ['node_modules/eslint/bin/eslint.js', 'apps/lab-web/src/**/*.js', 'apps/lab-web/src/client/**/*.ts', 'apps/lab-web/src/client/**/*.tsx', 'apps/match-server/src/**/*.mjs', 'packages/**/*.mjs', 'scripts/**/*.mjs', 'test/**/*.mjs']);
    await run('typecheck', ['node_modules/typescript/bin/tsc', '--noEmit']);
    await run('typecheck-client', ['node_modules/typescript/bin/tsc', '--noEmit', '--project', '.devin/tsconfig.client.json']);
    const containment = JSON.parse(await run('browser-regression', ['scripts/browser-proof-lab-trust-wave0.mjs', '--strict']));
    const capacity = JSON.parse(await run('browser-capacity', ['scripts/browser-proof-lab-trust-wave4.mjs']));
    const integrated = JSON.parse(await run('browser-integration', ['scripts/browser-proof-lab-trust-wave5.mjs']));
    if (containment.pageErrors?.length || containment.deferred?.length || containment.containment?.length !== 6 || containment.containment.some(s => s.status !== 'PASS') ||
      capacity.status !== 'PASS' || capacity.pageErrors?.length || integrated.status !== 'PASS' || integrated.pageErrors?.length) throw new Error('NATIVE_PROOF_INCOMPLETE');
    const mappings = { 'two-tab run start': 'twoTabStart', 'owner takeover': 'ownerTakeover', 'stale writer': 'staleWriter',
      'duplicate/conflicting commit': 'duplicateConflictingCommit', 'worker failure': 'workerFailure', 'cancel/restart race': 'cancelRestartRace',
      'version-incompatible resume': 'versionIncompatibleResume', 'concurrent first challenge': 'concurrentFirstChallenge', 'changed Head': 'changedHead',
      'legacy classification': 'legacyClassification', 'duplicate sample inclusion': 'duplicateSampleInclusion', 'mixed-cohort view': 'mixedCohortView' };
    for (const name of REQUIRED_SCENARIOS) {
      const key = mappings[name];
      if (key) {
        if (integrated.scenarios[key]?.status !== 'PASS') throw new Error('NATIVE_SCENARIO_MISSING:' + name);
        report.scenarios.push({ name, status: 'PASS', evidence: [`browser-integration.log#/scenarios/${key}`] });
      } else {
        const index = name === 'memory fallback' ? 4 : ['middle-batch quota failure', 'reload/resume'].includes(name) ? 2 : 3;
        report.scenarios.push({ name, status: 'PASS', evidence: name === 'bounded large-run behavior' ? ['browser-capacity.log#/normal', 'browser-capacity.log#/deep', 'browser-capacity.log#/restricted'] : [`browser-regression.log#/containment/${index}`] });
      }
    }
    const built = await readBuiltIdentity();
    report.browserIdentities = [built, capacity.identity, integrated.identity].map(i => ({ fingerprint: i.fingerprint, analysisFingerprint: i.analysisFingerprint }));
    report.nativeProofs = { containment, capacity, integrated };
  } catch (error) { report.error = error.stack; }
  report.sourceAfter = await sourceSnapshot(); report.completedAt = new Date().toISOString();
  report.verdict = labTrustVerdict(report);
  if (report.error) { report.verdict.status = 'FAIL'; report.verdict.blockers.push('EXECUTION_ERROR'); }
  await writeFile(path.join(output, 'WAVE5_VERIFICATION.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report.verdict, tests: report.testResults, evidence: path.join(output, 'WAVE5_VERIFICATION.json') }, null, 2));
  if (report.verdict.status !== 'PASS') process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--baseline')) console.log(JSON.stringify(await verifyBaselineGameplay(), null, 2));
  else await main();
}
