import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { captureProvenance, releaseProvenanceProblems, evidenceProvenanceProblems, releaseAuditProblems } from '../scripts/release-provenance.mjs';

test('release provenance requires clean Git and exact commit/tree/lock/engine bindings', () => {
  const root = mkdtempSync(join(tmpdir(), 'intrilex-provenance-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  try {
    assert.ok(releaseProvenanceProblems(captureProvenance(root)).length);
    git('init');
    mkdirSync(join(root, 'upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix'), { recursive: true });
    writeFileSync(join(root, 'upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix/PRIORITY_PASS_HOTFIX_MANIFEST.json'), JSON.stringify({ payloadHash: 'a'.repeat(64), version: '4.2.6' }));
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
    writeFileSync(join(root, 'package.json'), '{"version":"1.0.0"}\n');
    git('add', '.');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture');
    const clean = captureProvenance(root);
    assert.deepEqual(releaseProvenanceProblems(clean), []);
    const report = { status: 'PASS', provenance: { ...clean, mode: 'full' } };
    assert.deepEqual(evidenceProvenanceProblems(report, clean), []);
    const audit = { ...report, provenance: { ...report.provenance, auditKind: 'release' }, criticalGates: { executed: true },
      processStatus: { abnormal: false, exitStatus: 0 },
      testResults: { totalTests: 3, totalPass: 2, totalFail: 0, totalSkip: 1, totalCancelled: 0, totalTodo: 0 } };
    assert.deepEqual(releaseAuditProblems(audit, clean), []);
    for (const invalid of [
      { provenance: { ...audit.provenance, auditKind: 'development' } }, { criticalGates: {} }, { criticalGates: { executed: false } },
      { status: 'NOT_RUN' }, { testResults: {} },
      { testResults: { ...audit.testResults, totalTests: 0 } },
      { testResults: { ...audit.testResults, totalTests: 4 } },
      { testResults: { ...audit.testResults, totalPass: 1, totalFail: 1 } },
      { processStatus: { abnormal: true, exitStatus: 0 } },
      { processStatus: { abnormal: false, exitStatus: null } },
    ]) assert.ok(releaseAuditProblems({ ...audit, ...invalid }, clean).length);

    for (const key of ['gitCommit', 'gitTree', 'lockfileSha256', 'enginePayloadHash']) {
      assert.ok(evidenceProvenanceProblems({ ...report, provenance: { ...report.provenance, [key]: '0'.repeat(clean[key].length) } }, clean).length, key);
    }
    for (const dirty of [true, null, undefined]) {
      assert.ok(evidenceProvenanceProblems({ provenance: { ...report.provenance, dirty } }, clean).length);
    }
    assert.ok(evidenceProvenanceProblems({ status: 'PASS' }, clean).length);
    assert.ok(evidenceProvenanceProblems({ ...report, quickMode: true }, clean).length);
    writeFileSync(join(root, 'untracked.txt'), 'uncommitted');
    assert.equal(captureProvenance(root).dirty, true);
    assert.ok(evidenceProvenanceProblems(report, captureProvenance(root)).length, 'clean historical report cannot certify dirty current source');
    assert.ok(evidenceProvenanceProblems(report, captureProvenance(root)).length, 'clean historical report cannot certify dirty current source');
    assert.ok(releaseProvenanceProblems(captureProvenance(root)).length);
    rmSync(join(root, 'untracked.txt'));
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 10\n');
    assert.ok(evidenceProvenanceProblems(report, captureProvenance(root)).length);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
