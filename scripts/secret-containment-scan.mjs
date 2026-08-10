// ═══════════════════════════════════════════════════════════════
// secret-containment-scan.mjs — SEC-01 secret containment + export prevention
//
// Scans the workspace for leaked secrets, tokens, private keys, and
// credentials that must never be committed or exported into artifacts.
//
// Fail-closed: any match is a hard error with a non-zero exit code.
//
// Scan targets:
//   1. Tracked files (git ls-files) — excludes .gitignore'd paths
//   2. Build artifacts (apps/lab-web/dist/) — no secrets in the bundle
//   3. Report files (reports/) — no secrets in generated reports
//
// Patterns detected:
//   - Supabase service keys (sb_secret_*, eyJ... JWT tokens)
//   - Generic API keys (sk-, pk_live_, Bearer tokens)
//   - Private key blocks (-----BEGIN ... PRIVATE KEY-----)
//   - .env file content (KEY=value with secret-like names)
//   - Connection strings with embedded credentials
//
// Exclusions:
//   - .env files themselves (gitignored — checked separately for presence)
//   - node_modules, vendor, .git
//   - Test fixtures with fake/placeholder values (explicitly allowlisted)
//   - This scan script itself (contains pattern strings, not real secrets)
// ═══════════════════════════════════════════════════════════════

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Patterns ──

// High-confidence secret patterns (case-sensitive where appropriate)
const SECRET_PATTERNS = [
  {
    name: 'Supabase service key',
    // Supabase service role keys are JWTs starting with eyJ and containing 'service_role'
    pattern: /sb_secret_[A-Za-z0-9]{20,}/,
    severity: 'critical',
  },
  {
    name: 'Supabase anon key in source',
    // Anon keys are public, but service keys look similar — flag eyJ... with service_role
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    severity: 'high',
    // Allowlist: test fixtures and docs may contain example JWTs.
    // Fake test JWTs have readable signatures (e.g. "reconnect-alice-sig-1234")
    // — real JWT signatures are base64url and don't contain dashes+words.
    allowlist: /example|placeholder|test|fake|dummy|sample/i,
    // Additional check: if the third segment (signature) contains readable
    // words separated by dashes, it's a fake test token.
    fakeCheck: (line) => {
      const match = line.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]+)/);
      if (!match) return false;
      const sig = match[1];
      // Real base64url signatures don't contain multiple dash-separated words
      return /-[a-z]/.test(sig) && sig.length < 40;
    },
  },
  {
    name: 'Private key block',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/,
    severity: 'critical',
  },
  {
    name: 'AWS access key',
    pattern: /AKIA[0-9A-Z]{16}/,
    severity: 'critical',
  },
  {
    name: 'GitHub token',
    pattern: /gh[pousr]_[A-Za-z0-9]{36,}/,
    severity: 'critical',
  },
  {
    name: 'Stripe secret key',
    pattern: /sk_live_[A-Za-z0-9]{20,}/,
    severity: 'critical',
  },
  {
    name: 'Generic Bearer token in source',
    pattern: /Bearer\s+[A-Za-z0-9_-]{40,}/,
    severity: 'high',
    allowlist: /example|placeholder|test|fake|dummy|sample|<token>|<your/i,
  },
];

// Secret-bearing environment variable names (checked in .env-style assignments)
const SECRET_ENV_NAMES = new Set([
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'SESSION_SECRET',
  'API_SECRET',
  'STRIPE_SECRET_KEY',
  'GITHUB_TOKEN',
  'AWS_SECRET_ACCESS_KEY',
  'PRIVATE_KEY',
  'ENCRYPTION_KEY',
]);

// Directories to skip entirely
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'vendor', '.cache', 'coverage',
  'intrilex-agent-analysis-part1', 'runtime',
]);

// File extensions to scan
const SCAN_EXTENSIONS = new Set([
  '.mjs', '.js', '.json', '.html', '.css', '.md', '.txt', '.yml', '.yaml',
  '.sh', '.env', '.ts', '.cjs',
]);

// Files to always skip (this script, lockfiles, etc.)
const SKIP_FILES = new Set([
  'secret-containment-scan.mjs',
  'package-lock.json',
  'pnpm-lock.yaml',
  'self-audit.json',
]);

// ── Scanning ──

/**
 * Get the list of files to scan. Uses git ls-files for tracked files,
 * then adds dist/ and reports/ if they exist.
 * @returns {string[]} Absolute file paths
 */
function getFilesToScan() {
  const files = [];

  // 1. Git-tracked files (excludes .gitignore'd paths like .env)
  try {
    const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      .trim().split('\n').filter(Boolean);
    for (const rel of tracked) {
      const abs = join(ROOT, rel);
      if (existsSync(abs)) files.push(abs);
    }
  } catch {
    // Not a git repo or git unavailable — scan directory tree instead
    files.push(...walkDir(ROOT));
  }

  // 2. Build artifacts (if dist exists, scan it — secrets must not leak into the bundle)
  const distDir = join(ROOT, 'apps/lab-web/dist');
  if (existsSync(distDir)) {
    files.push(...walkDir(distDir));
  }

  // 3. Reports directory
  const reportsDir = join(ROOT, 'reports');
  if (existsSync(reportsDir)) {
    files.push(...walkDir(reportsDir));
  }

  return files;
}

/**
 * Walk a directory tree recursively, returning files to scan.
 * @param {string} dir
 * @returns {string[]}
 */
function walkDir(dir) {
  const results = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return results; }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      results.push(...walkDir(full));
    } else if (st.isFile()) {
      if (SKIP_FILES.has(name)) continue;
      const ext = name.substring(name.lastIndexOf('.'));
      if (SCAN_EXTENSIONS.has(ext) || name === '.env') {
        results.push(full);
      }
    }
  }
  return results;
}

/**
 * Scan a single file for secret patterns.
 * @param {string} filePath - Absolute file path
 * @returns {Array<{ file: string, line: number, name: string, severity: string, snippet: string }>}
 */
function scanFile(filePath) {
  const violations = [];
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    return violations; // Binary or unreadable — skip
  }

  const lines = content.split('\n');
  const relPath = relative(ROOT, filePath).replace(/\\/g, '/');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check secret patterns
    for (const { name, pattern, severity, allowlist, fakeCheck } of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        // Check allowlist (for test fixtures and examples)
        if (allowlist && allowlist.test(line)) continue;
        // Check fake test token detector (e.g. readable JWT signatures)
        if (fakeCheck && fakeCheck(line)) continue;
        // Redact the actual secret value in the output
        const redacted = line.replace(pattern, '[REDACTED]').trim().substring(0, 120);
        violations.push({ file: relPath, line: i + 1, name, severity, snippet: redacted });
      }
    }

    // Check for secret env var assignments with real values (not placeholders)
    // Pattern: SECRET_NAME=value where value is not empty/placeholder
    const envMatch = line.match(/^([A-Z_]{4,}(?:KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)[A-Z_]*)\s*[:=]\s*["']?([^"'\s#]+)/);
    if (envMatch) {
      const [, varName, value] = envMatch;
      if (SECRET_ENV_NAMES.has(varName) || /KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL/.test(varName)) {
        // Skip placeholder/example values
        if (/^(example|placeholder|test|fake|dummy|sample|your[_-]|<|xxx|change_me|CHANGEME)/i.test(value)) continue;
        // Skip values that are clearly variable references
        if (/^\$\{|^\$[A-Z]/.test(value)) continue;
        // Skip empty or very short values
        if (value.length < 8) continue;
        const redacted = `${varName}=[REDACTED:len=${value.length}]`;
        violations.push({ file: relPath, line: i + 1, name: `Secret env assignment (${varName})`, severity: 'critical', snippet: redacted });
      }
    }
  }

  return violations;
}

// ── Main ──

export function runSecretContainmentScan() {
  const files = getFilesToScan();
  const allViolations = [];

  for (const file of files) {
    const violations = scanFile(file);
    allViolations.push(...violations);
  }

  // Check that .env files exist but are gitignored (not tracked)
  const envChecks = [];
  const envPath = join(ROOT, '.env');
  if (existsSync(envPath)) {
    try {
      const tracked = execSync('git ls-files --error-unmatch .env', { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      // If git succeeds, .env is tracked — that's a violation
      envChecks.push({ file: '.env', issue: '.env file is git-tracked (should be gitignored)', severity: 'critical' });
    } catch {
      // .env exists but is NOT tracked — correct behavior
    }
  }

  return { filesScanned: files.length, violations: allViolations, envChecks };
}

// CLI entry point
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { filesScanned, violations, envChecks } = runSecretContainmentScan();
  const allIssues = [...violations, ...envChecks];

  console.log(`SEC-01 Secret Containment Scan`);
  console.log(`  Files scanned: ${filesScanned}`);
  console.log(`  Violations: ${violations.length}`);
  console.log(`  Env checks: ${envChecks.length}`);

  if (allIssues.length > 0) {
    console.log('\n❌ FAIL — secrets or env issues detected:\n');
    for (const v of allIssues) {
      const loc = v.line ? `:${v.line}` : '';
      console.log(`  [${v.severity.toUpperCase()}] ${v.file}${loc}: ${v.name}`);
      if (v.snippet) console.log(`    ${v.snippet}`);
    }
    process.exit(1);
  } else {
    console.log('\n✅ PASS — no secrets detected in tracked files, artifacts, or reports');
    process.exit(0);
  }
}
