// ═══════════════════════════════════════════════════════════════
// scan-archive-secrets.mjs — Post-packaging secret containment scan
//
// Scans the final release ZIP archive for leaked secrets, tokens,
// private keys, and credentials. This is the last line of defense
// after the pre-packaging scan (secret-containment-scan.mjs).
//
// Fail-closed: any match is a hard error with a non-zero exit code.
// Fail-closed: if the decompression/scan subprocess fails, the scan
//   itself fails (no silent downgrade to raw-byte-only scanning).
//
// IRX-C01: The pre-packaging scan only scans git-tracked files.
// .env (gitignored) could leak into the archive via packaging.
// This script reads the finished ZIP, decompresses every entry, and
// scans the decompressed content for secret patterns.
// ═══════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const zipPath = process.argv[2];
if (!zipPath) {
  console.error('Usage: scan-archive-secrets.mjs <zip-path>');
  process.exit(1);
}

// High-confidence secret patterns (decompressed content scan).
// IRX-C01 fix: sb_secret_ pattern now includes underscores and hyphens
// so modern Supabase tokens are not truncated during detection.
const SECRET_PATTERNS = [
  { name: 'Supabase service key', pattern: /sb_secret_[A-Za-z0-9_\-]{20,}/, severity: 'critical' },
  { name: 'Supabase service key (JWT)', pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}service_role/, severity: 'critical' },
  { name: 'Generic API key (sk-)', pattern: /sk-[A-Za-z0-9]{20,}/, severity: 'high' },
  { name: 'Stripe live key', pattern: /pk_live_[A-Za-z0-9]{20,}/, severity: 'high' },
  { name: 'Private key block', pattern: /-----BEGIN[A-Z\s]+PRIVATE KEY-----/, severity: 'critical' },
  { name: 'SUPABASE_SECRET_KEY assignment', pattern: /SUPABASE_SECRET_KEY\s*=\s*[A-Za-z0-9_\-]{20,}/, severity: 'critical' },
  { name: 'GitHub token', pattern: /gh[pousr]_[A-Za-z0-9]{36,}/, severity: 'critical' },
  { name: 'AWS access key', pattern: /AKIA[0-9A-Z]{16}/, severity: 'critical' },
];

// File names that should NEVER appear in the archive.
// IRX-C01 fix: .env.production and nested variants are now forbidden.
const FORBIDDEN_FILES = [
  '.env', '.env.local', '.env.production', '.env.production.local',
  '.env.staging', '.env.staging.local',
];

// Forbidden filename patterns (checked against the basename of each entry).
const FORBIDDEN_PATTERNS = [
  /\.sqlite$/,
  /\.sqlite-wal$/,
  /\.sqlite-shm$/,
  /\.db$/,
  /\.db-wal$/,
  /\.db-shm$/,
  /^\.env\.[^.]+\.local$/,
  /^\.env\.production(\.local)?$/,
  /^\.env\.staging(\.local)?$/,
];

let raw;
try {
  raw = readFileSync(zipPath);
} catch (e) {
  console.error(`ERROR: cannot read archive: ${e.message}`);
  process.exit(1);
}

const violations = [];

// ── Phase 1: raw-byte heuristic scan (catches stored/uncompressed entries) ──
const text = raw.toString('latin1');
for (const fname of FORBIDDEN_FILES) {
  const idx = text.indexOf(fname);
  if (idx !== -1) {
    const before = text.substring(Math.max(0, idx - 100), idx);
    if (before.includes('PK\x01\x02') || before.includes('PK\x03\x04')) {
      violations.push({ file: fname, issue: `Forbidden file "${fname}" found in archive central directory`, severity: 'critical' });
    }
  }
}
for (const { name, pattern, severity } of SECRET_PATTERNS) {
  if (pattern.test(raw.toString('utf8'))) {
    violations.push({ file: '(archive raw content)', issue: `${name} pattern detected in archive raw bytes`, severity });
  }
}

// ── Phase 2: decompressed entry scan via Python ──
// IRX-C01 fix: write the scan script to a temp file instead of inlining
// with semicolon flattening (which produced invalid Python for compound
// statements). This ensures deflated entries are decompressed and scanned.
//
// Fail-closed: if Python is unavailable or the script errors, the scan
// FAILS rather than silently downgrading to raw-byte-only scanning.

const SCAN_SCRIPT = `
import zipfile, sys, re, os

z = zipfile.ZipFile(sys.argv[1])
violations = []

# Forbidden filenames (exact + pattern)
forbidden_files = [
    '.env', '.env.local', '.env.production', '.env.production.local',
    '.env.staging', '.env.staging.local',
]
forbidden_exts = ['.sqlite', '.sqlite-wal', '.sqlite-shm', '.db', '.db-wal', '.db-shm']

# Secret byte patterns to search in decompressed content
secret_patterns = [
    (b'sb_secret_', 'Supabase service key'),
    (b'-----BEGIN', 'Private key block'),
    (b'SUPABASE_SECRET_KEY=', 'SUPABASE_SECRET_KEY assignment'),
    (b'pk_live_', 'Stripe live key'),
    (b'ghp_', 'GitHub token'),
    (b'gho_', 'GitHub token'),
    (b'ghs_', 'GitHub token'),
    (b'AKIA', 'AWS access key'),
    (b' service_role', 'Supabase service_role JWT'),
]

for info in z.infolist():
    basename = os.path.basename(info.filename)
    # Check forbidden exact filenames
    if basename in forbidden_files:
        violations.append('FORBIDDEN_FILE:' + info.filename)
        continue
    # Check forbidden extensions
    for ext in forbidden_exts:
        if basename.endswith(ext):
            violations.append('FORBIDDEN_FILE:' + info.filename)
            break
    else:
        # Check .env.*.local pattern
        if re.match(r'^\\.env\\.[^.]+\\.local$', basename):
            violations.append('FORBIDDEN_FILE:' + info.filename)
            continue
        # Decompress and scan content
        try:
            data = z.read(info.filename)
        except Exception as e:
            violations.append('DECOMPRESS_ERROR:' + info.filename + ':' + str(e))
            continue
        for pat, name in secret_patterns:
            if pat in data:
                violations.append('SECRET_FOUND:' + info.filename + ':' + name)

for v in violations:
    print(v)
`;

const tmpScript = join(tmpdir(), `intrilex-archive-scan-${process.pid}.py`);
let pythonResult = null;
let pythonError = null;

try {
  writeFileSync(tmpScript, SCAN_SCRIPT, 'utf8');

  // Try python, then py (Windows launcher), then python3
  let cmd = null;
  for (const candidate of ['python', 'py -3', 'python3']) {
    try {
      execSync(`${candidate} --version`, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 });
      cmd = candidate;
      break;
    } catch {
      // try next
    }
  }

  if (!cmd) {
    // No Python available — fail-closed.
    pythonError = 'No Python interpreter found (tried python, py -3, python3). Cannot decompress archive entries.';
  } else {
    pythonResult = execSync(`${cmd} "${tmpScript}" "${zipPath}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000,
    });
  }
} catch (e) {
  pythonError = e.stderr ? e.stderr.toString().trim() : e.message;
} finally {
  try { unlinkSync(tmpScript); } catch { /* temp cleanup */ }
}

// Fail-closed: if Python scan could not run, the archive scan FAILS.
if (pythonError) {
  console.error(`FATAL: archive decompression scan failed (fail-closed): ${pythonError}`);
  console.error('Cannot verify deflated archive entries. Refusing to pass.');
  process.exit(1);
}

if (pythonResult !== null) {
  for (const line of pythonResult.split('\n').filter(Boolean)) {
    if (line.startsWith('FORBIDDEN_FILE:')) {
      violations.push({ file: line.substring(15), issue: 'Forbidden secret/runtime file in archive', severity: 'critical' });
    } else if (line.startsWith('SECRET_FOUND:')) {
      const parts = line.substring(13).split(':');
      violations.push({ file: parts[0], issue: `Secret pattern "${parts.slice(1).join(':')}" found in decompressed archive entry`, severity: 'critical' });
    } else if (line.startsWith('DECOMPRESS_ERROR:')) {
      // Fail-closed: decompression errors are suspicious — treat as violation
      violations.push({ file: line.substring(17), issue: 'Decompression error (possible corruption or tampering)', severity: 'critical' });
    }
  }
}

console.log('SEC-01 Archive Secret Scan');
console.log(`  Archive: ${zipPath}`);
console.log(`  Size: ${raw.length} bytes`);
console.log(`  Violations: ${violations.length}`);

if (violations.length > 0) {
  console.log('\nFAIL — secrets or forbidden files detected in release archive:\n');
  for (const v of violations) {
    console.log(`  [${v.severity.toUpperCase()}] ${v.file}: ${v.issue}`);
  }
  process.exit(1);
} else {
  console.log('\nPASS — no secrets detected in release archive (decompressed scan)');
  process.exit(0);
}
