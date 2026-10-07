#!/usr/bin/env node
/**
 * verify-release-audit.mjs — release-domain attestation gate.
 *
 * The release audit is produced ONCE by `pnpm run self-audit:release`
 * (a dedicated release CI step before this domain runs). This stage
 * verifies that evidence exists, is release-mode, PASS, complete, and
 * bound to the current commit — it deliberately does NOT re-run the
 * multi-minute suite a second time.
 *
 * Fails closed: a missing, stale, development-mode, or failed audit is
 * a hard error with the remediation printed.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureProvenance, releaseAuditProblems } from './release-provenance.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let audit;
try {
  audit = JSON.parse(await readFile(path.join(root, 'reports/release/self-audit.json'), 'utf8'));
} catch {
  console.error('RELEASE AUDIT EVIDENCE MISSING — run `pnpm run self-audit:release` on this clean commit first.');
  process.exit(1);
}

const problems = releaseAuditProblems(audit, captureProvenance(root));
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
const tr = audit.testResults ?? {};
console.log(`RELEASE AUDIT EVIDENCE PASS: ${tr.totalPass ?? '?'}/${tr.totalTests ?? '?'} tests, gates verified, bound to commit ${audit.provenance?.gitCommit ?? 'unknown'}`);
