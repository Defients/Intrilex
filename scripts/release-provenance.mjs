import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

/** Fail closed when Git or a required input cannot be read. */
export function captureProvenance(root) {
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    return result.status === 0 ? result.stdout.trim() : null;
  };
  const json = (file) => { try { return JSON.parse(readFileSync(join(root, file), 'utf8')); } catch { return null; } };
  let lockfileSha256 = null;
  try { lockfileSha256 = createHash('sha256').update(readFileSync(join(root, 'pnpm-lock.yaml'))).digest('hex'); } catch { /* unavailable is not clean */ }
  const status = git('status', '--porcelain', '--untracked-files=all');
  const engine = json('upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix/PRIORITY_PASS_HOTFIX_MANIFEST.json');
  const identity = json('config/release-identity.json');
  return {
    gitCommit: git('rev-parse', 'HEAD'), gitTree: git('rev-parse', 'HEAD^{tree}'),
    gitBranch: git('rev-parse', '--abbrev-ref', 'HEAD'),
    dirty: status === null ? null : status.length > 0, lockfileSha256,
    enginePayloadHash: engine?.payloadHash ?? null, engineVersion: engine?.version ?? null,
    rulesVersion: identity?.rulesVersion ?? null, officialRulesVersion: identity?.officialRulesVersion ?? null,
    productVersion: json('package.json')?.version ?? null,
    nodeVersion: process.version, platform: process.platform, arch: process.arch,
    generatedAt: new Date().toISOString(),
  };
}

export function releaseProvenanceProblems(provenance) {
  const p = provenance ?? {};
  const problems = [];
  if (p.dirty !== false) problems.push('Release certification requires a clean Git working tree (including untracked files).');
  for (const key of ['gitCommit', 'gitTree']) {
    if (!/^[0-9a-f]{40,64}$/.test(p[key] ?? '')) problems.push(`Missing or invalid ${key}.`);
  }
  for (const key of ['lockfileSha256', 'enginePayloadHash']) {
    if (!/^[0-9a-f]{64}$/.test(p[key] ?? '')) problems.push(`Missing or invalid ${key}.`);
  }
  return problems;
}

export function evidenceProvenanceProblems(report, current) {
  const problems = [...releaseProvenanceProblems(report?.provenance), ...releaseProvenanceProblems(current)];
  if (report?.quickMode || report?.provenance?.mode !== 'full') problems.push('Only a full audit can be release evidence.');
  for (const key of ['gitCommit', 'gitTree', 'lockfileSha256', 'enginePayloadHash']) {
    if (!current?.[key] || report?.provenance?.[key] !== current[key]) problems.push(`Evidence ${key} does not match the current checkout.`);
  }
  return problems;
}

/** A matching report still needs complete, internally consistent execution results. */
export function releaseAuditProblems(report, current) {
  const problems = evidenceProvenanceProblems(report, current);
  if (report?.status !== 'PASS') problems.push('Release self-audit is not PASS.');
  const gates = Object.values(report?.criticalGates ?? {});
  if (!gates.length || gates.some(value => value !== true)) problems.push('Release audit requires explicit passing critical gates.');
  const results = report?.testResults ?? {};
  const keys = ['totalTests', 'totalPass', 'totalFail', 'totalSkip', 'totalCancelled', 'totalTodo'];
  if (keys.some(key => !Number.isInteger(results[key]) || results[key] < 0) || results.totalTests < 1) {
    problems.push('Release audit requires complete nonnegative execution counts and at least one test.');
  } else {
    if (results.totalTests !== keys.slice(1).reduce((sum, key) => sum + results[key], 0)) problems.push('Release test accounting does not reconcile.');
    if (results.totalFail || results.totalCancelled || results.totalTodo) problems.push('Release tests include failures, cancellations or unfinished TODOs.');
  }
  if (report?.processStatus?.abnormal !== false || report?.processStatus?.exitStatus !== 0) problems.push('Release audit requires normal successful test process termination.');
  return problems;
}
