#!/usr/bin/env node
/**
 * Truth-drift guard — asserts that documented counts match actual state.
 *
 * Recurring issue across v0.10.x–v0.15.0 audits: README, CHANGELOG, and
 * self-audit.json counts drift from actuals after each change with no
 * automated check. This script prevents recurrence by verifying:
 *
 *   1. README.md version matches package.json version
 *   2. README.md engine version matches version.js ENGINE_VERSION
 *   3. README.md CI stage count matches actual ci.mjs STAGES length
 *   4. README.md test count matches self-audit.json totalTests
 *   5. README.md test file count matches actual test/*.test.mjs count
 *   6. self-audit.json exists and is not stale (generated within 7 days)
 *   7. No "stub" or "Coming soon" claims for the Play module in README
 *   8. No stale "Engine 4.2.5" references in lab-web source
 *
 * Usage:
 *   node scripts/truth-drift-check.mjs
 *   node scripts/truth-drift-check.mjs --no-staleness   # skip self-audit age check
 *
 * Exit code 0 = all checks pass; 1 = drift detected.
 */
import { readFile,  readdir} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skipStaleness = process.argv.includes('--no-staleness');

const failures = [];
const warnings = [];

function fail(msg) { failures.push(msg); }
function warn(msg) { warnings.push(msg); }

// ── 1. Load authoritative sources ──
const rootPkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const versionJs = await readFile(path.join(root, 'apps/lab-web/src/version.js'), 'utf8');
const engineVersionMatch = versionJs.match(/ENGINE_VERSION\s*=\s*"([^"]+)"/);
const labVersionMatch = versionJs.match(/LAB_VERSION\s*=\s*"([^"]+)"/);
const engineVersion = engineVersionMatch ? engineVersionMatch[1] : null;
const labVersion = labVersionMatch ? labVersionMatch[1] : null;

// ── 2. Load README ──
const readme = await readFile(path.join(root, 'README.md'), 'utf8');

// ── 3. Load CI stages ──
const ciSrc = await readFile(path.join(root, 'scripts/ci.mjs'), 'utf8');
const ciStageMatches = ciSrc.match(/^\s*\['[^']+',/gm);
const ciStageCount = ciStageMatches ? ciStageMatches.length : 0;

// ── 4. Count test files ──
const testFiles = (await readdir(path.join(root, 'test')))
  .filter(f => f.endsWith('.test.mjs'));
const testFileCount = testFiles.length;

// ── 5. Load self-audit ──
const selfAuditPath = path.join(root, 'reports/self-audit.json');
let selfAudit = null;
if (existsSync(selfAuditPath)) {
  selfAudit = JSON.parse(await readFile(selfAuditPath, 'utf8'));
}

// ═══════════════════════════════════════════════════════════════
// CHECKS
// ═══════════════════════════════════════════════════════════════

// Check 1: README version matches package.json
const readmeVersionMatch = readme.match(/v(\d+\.\d+\.\d+)/);
const readmeVersion = readmeVersionMatch ? readmeVersionMatch[1] : null;
if (readmeVersion !== rootPkg.version) {
  fail(`README version v${readmeVersion} ≠ package.json version ${rootPkg.version}`);
}

// Check 2: README engine version matches version.js
const readmeEngineMatch = readme.match(/Engine v?(\d+\.\d+\.\d+)/i);
const readmeEngine = readmeEngineMatch ? readmeEngineMatch[1] : null;
if (readmeEngine && engineVersion && readmeEngine !== engineVersion) {
  fail(`README Engine v${readmeEngine} ≠ version.js ENGINE_VERSION ${engineVersion}`);
}

// Check 3: README CI stage count matches actual
const readmeCIMatch = readme.match(/\*\*(\d+)\s+stages\*\*/);
const readmeCI = readmeCIMatch ? parseInt(readmeCIMatch[1]) : null;
if (readmeCI !== null && readmeCI !== ciStageCount) {
  fail(`README CI stages ${readmeCI} ≠ actual ci.mjs STAGES ${ciStageCount}`);
}

// Check 4: README test count matches self-audit
const readmeTestMatch = readme.match(/\*\*(\d+)\s+tests\s+across\s+(\d+)\s+test\s+files\*\*/);
const readmeTests = readmeTestMatch ? parseInt(readmeTestMatch[1]) : null;
const readmeTestFiles = readmeTestMatch ? parseInt(readmeTestMatch[2]) : null;
if (selfAudit && readmeTests !== null) {
  if (readmeTests !== selfAudit.testResults.totalTests) {
    fail(`README test count ${readmeTests} ≠ self-audit.json totalTests ${selfAudit.testResults.totalTests}`);
  }
}
if (readmeTestFiles !== null && readmeTestFiles !== testFileCount) {
  fail(`README test file count ${readmeTestFiles} ≠ actual test/*.test.mjs count ${testFileCount}`);
}

// Check 5: self-audit staleness (skip with --no-staleness)
if (!skipStaleness && selfAudit) {
  const generatedAt = new Date(selfAudit.generatedAt).getTime();
  const ageMs = Date.now() - generatedAt;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays > 7) {
    warn(`self-audit.json is ${ageDays.toFixed(1)} days old (regenerate with: node scripts/generate-self-audit.mjs)`);
  }
}

// Check 6: No "stub" or "Coming soon" for Play module in README
if (/Play.*stub/i.test(readme) || /Coming soon/i.test(readme)) {
  fail(`README contains "stub" or "Coming soon" for Play module — Play is fully playable in v0.15.0`);
}

// Check 7: No stale "Engine 4.2.5" in lab-web source (should be 4.2.6)
const labWebSrcFiles = [
  'apps/lab-web/src/app.js',
  'apps/lab-web/src/index.html',
  'apps/lab-web/src/browser-analytics.js',
];
for (const rel of labWebSrcFiles) {
  try {
    const content = await readFile(path.join(root, rel), 'utf8');
    if (/Engine\s+v?4\.2\.5/i.test(content)) {
      fail(`${rel} still references "Engine 4.2.5" — should be ${engineVersion}`);
    }
  } catch { /* file may not exist */ }
}

// Check 8: package.json version matches version.js LAB_VERSION
if (labVersion && rootPkg.version !== labVersion) {
  fail(`package.json version ${rootPkg.version} ≠ version.js LAB_VERSION ${labVersion}`);
}

// ═══════════════════════════════════════════════════════════════
// REPORT
// ═══════════════════════════════════════════════════════════════

console.log('═ Truth-Drift Guard ═');
console.log(`  package.json version:  ${rootPkg.version}`);
console.log(`  version.js LAB_VERSION: ${labVersion}`);
console.log(`  version.js ENGINE_VERSION: ${engineVersion}`);
console.log(`  README version:        v${readmeVersion}`);
console.log(`  README engine:         v${readmeEngine}`);
console.log(`  CI stages (actual):    ${ciStageCount}`);
console.log(`  README CI stages:      ${readmeCI}`);
console.log(`  Test files (actual):   ${testFileCount}`);
console.log(`  README test files:     ${readmeTestFiles}`);
if (selfAudit) {
  console.log(`  self-audit totalTests: ${selfAudit.testResults.totalTests}`);
  console.log(`  README test count:    ${readmeTests}`);
  console.log(`  self-audit age:       ${(selfAudit.generatedAt ? new Date(selfAudit.generatedAt).toISOString() : 'unknown')}`);
} else {
  warn('reports/self-audit.json not found — run: node scripts/generate-self-audit.mjs');
}

if (warnings.length > 0) {
  console.log('\n⚠ Warnings:');
  for (const w of warnings) console.log(`  ⚠ ${w}`);
}

if (failures.length > 0) {
  console.log('\n✗ Drift detected:');
  for (const f of failures) console.log(`  ✗ ${f}`);
  console.log(`\n${failures.length} check(s) failed. Fix the documented counts to match actuals.`);
  process.exit(1);
} else {
  console.log('\n✓ All truth-drift checks passed.');
  process.exit(0);
}
