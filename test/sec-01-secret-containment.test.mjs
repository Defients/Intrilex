// ═══════════════════════════════════════════════════════════════
// sec-01-secret-containment.test.mjs — SEC-01 secret containment
//
// Verifies that no secrets, tokens, private keys, or credentials leak
// into tracked files, build artifacts, or reports.
//
// Also verifies that .env (if present) is gitignored and not tracked.
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { runSecretContainmentScan } from '../scripts/secret-containment-scan.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

test('SEC-01: no secrets in tracked files, artifacts, or reports', () => {
  const { violations, envChecks, filesScanned } = runSecretContainmentScan();

  // Sanity: the scan must have actually scanned files
  assert.ok(filesScanned > 0, 'scan must scan at least one file');

  // No secret pattern violations
  if (violations.length > 0) {
    const details = violations.map(v => `  [${v.severity}] ${v.file}:${v.line}: ${v.name} — ${v.snippet}`).join('\n');
    assert.fail(`Secret containment violations detected:\n${details}`);
  }

  // No env tracking issues
  if (envChecks.length > 0) {
    const details = envChecks.map(v => `  [${v.severity}] ${v.file}: ${v.issue}`).join('\n');
    assert.fail(`Env file tracking issues detected:\n${details}`);
  }
});

test('SEC-01: .env is gitignored and not tracked', () => {
  const gitignorePath = join(ROOT, '.gitignore');

  let gitignore;
  try {
    gitignore = readFileSync(gitignorePath, 'utf8');
  } catch {
    assert.fail('.gitignore not found');
  }

  // .gitignore must have a line that matches .env
  const lines = gitignore.split('\n');
  const hasEnvIgnore = lines.some(l => l.trim() === '.env' || l.trim() === '/.env');
  assert.ok(hasEnvIgnore, '.gitignore must contain .env entry');

  // If .env exists, it must NOT be git-tracked
  const envPath = join(ROOT, '.env');
  if (existsSync(envPath)) {
    let isTracked = false;
    try {
      execSync('git ls-files --error-unmatch .env', { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
      isTracked = true;
    } catch {
      isTracked = false;
    }
    assert.equal(isTracked, false, '.env must not be git-tracked');
  }
});

test('SEC-01: .env.example contains only placeholder values', () => {
  const envExamplePath = join(ROOT, '.env.example');

  if (!existsSync(envExamplePath)) {
    // .env.example is optional — skip if not present
    return;
  }

  const content = readFileSync(envExamplePath, 'utf8');
  const lines = content.split('\n');

  // Every KEY=VALUE line with a secret-like name must have a placeholder value
  const secretNamePattern = /[A-Z_]{4,}(?:KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)[A-Z_]*/;
  const placeholderPattern = /^(example|placeholder|test|fake|dummy|sample|your[_-]|<|xxx|change_me|CHANGEME|http|postgres)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#') || !line.trim()) continue;

    const match = line.match(/^([A-Z_]+)\s*[:=]\s*["']?([^"'\s#]+)/);
    if (!match) continue;

    const [, varName, value] = match;
    if (!secretNamePattern.test(varName)) continue;

    // Must be a placeholder, not a real secret
    assert.ok(
      placeholderPattern.test(value) || value.length < 8,
      `.env.example line ${i + 1}: ${varName} must have a placeholder value, got length=${value.length}`
    );
  }
});
