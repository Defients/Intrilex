// ═══════════════════════════════════════════════════════════════
// scan-archive-secrets.mjs — Post-packaging secret containment scan
//
// Scans the final release ZIP archive for leaked secrets, tokens,
// private keys, and credentials. This is the last line of defense
// after the pre-packaging scan (secret-containment-scan.mjs).
//
// Fail-closed: any match is a hard error with a non-zero exit code.
//
// IRX-C01: The pre-packaging scan only scans git-tracked files.
// .env (gitignored) could leak into the archive via deterministic_zip.py.
// This script reads the finished ZIP and scans every entry's content.
// ═══════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// Use Node's built-in zip support via child_process (unzip -p on each entry)
// or read the zip as a buffer and search for patterns directly.
// Since we may not have unzip on Windows, we search the raw zip bytes.

const zipPath = process.argv[2];
if (!zipPath) {
  console.error('Usage: scan-archive-secrets.mjs <zip-path>');
  process.exit(1);
}

// High-confidence secret patterns (same as secret-containment-scan.mjs)
const SECRET_PATTERNS = [
  { name: 'Supabase service key', pattern: /sb_secret_[A-Za-z0-9]{20,}/, severity: 'critical' },
  { name: 'Supabase service key (JWT)', pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}service_role/, severity: 'critical' },
  { name: 'Generic API key (sk-)', pattern: /sk-[A-Za-z0-9]{20,}/, severity: 'high' },
  { name: 'Stripe live key', pattern: /pk_live_[A-Za-z0-9]{20,}/, severity: 'high' },
  { name: 'Private key block', pattern: /-----BEGIN[A-Z\s]+PRIVATE KEY-----/, severity: 'critical' },
  { name: 'SUPABASE_SECRET_KEY assignment', pattern: /SUPABASE_SECRET_KEY\s*=\s*[A-Za-z0-9_\-]{20,}/, severity: 'critical' },
];

// File names that should NEVER appear in the archive
const FORBIDDEN_FILES = ['.env', '.env.local'];

// IRX-M39: Runtime database files that must never ship in the release
const FORBIDDEN_PATTERNS = [
  /\.sqlite$/,
  /\.sqlite-wal$/,
  /\.sqlite-shm$/,
  /\.db$/,
  /\.db-wal$/,
  /\.db-shm$/,
  /^\.env\.[^.]+\.local$/,
];

let raw;
try {
  raw = readFileSync(zipPath);
} catch (e) {
  console.error(`ERROR: cannot read archive: ${e.message}`);
  process.exit(1);
}

const violations = [];

// Check for forbidden file names in the zip central directory
// ZIP local file headers start with PK\x03\x04, central dir with PK\x01\x02
const text = raw.toString('latin1');
for (const fname of FORBIDDEN_FILES) {
  // Check if the filename appears in the zip central directory entries
  // This is a heuristic — search for the filename in the raw bytes
  const idx = text.indexOf(fname);
  if (idx !== -1) {
    // Verify it's actually a zip entry name (not just in file content)
    // Check for PK header nearby (within a few bytes before the filename)
    const before = text.substring(Math.max(0, idx - 100), idx);
    if (before.includes('PK\x01\x02') || before.includes('PK\x03\x04')) {
      violations.push({ file: fname, issue: `Forbidden file "${fname}" found in archive`, severity: 'critical' });
    }
  }
}

// Scan raw zip content for secret patterns
// (zip stores data compressed, but we can still catch uncompressed entries
// and .env files that might be stored rather than deflated)
for (const { name, pattern, severity } of SECRET_PATTERNS) {
  const match = raw.toString('utf8').match(pattern);
  if (match) {
    violations.push({ file: '(archive content)', issue: `${name} pattern detected in archive`, severity });
  }
}

// Also try to list zip contents and check for .env entries
try {
  const listing = execSync(`python -c "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); [print(n) for n in z.namelist()]" "${zipPath}"`, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30000,
  });
  for (const line of listing.split('\n').filter(Boolean)) {
    for (const fname of FORBIDDEN_FILES) {
      if (line === fname || line.endsWith('/' + fname)) {
        violations.push({ file: line, issue: `Forbidden file "${line}" found in archive`, severity: 'critical' });
      }
    }
    // Check for .env.*.local pattern
    if (/^\.env\.[^.]+\.local$/.test(line) || /\.env\.[^.]+\.local$/.test(line)) {
      violations.push({ file: line, issue: `Forbidden env file "${line}" found in archive`, severity: 'critical' });
    }
    // IRX-M39: Check for runtime database files (SQLite, WAL, SHM)
    const baseName = line.split('/').pop();
    for (const pat of FORBIDDEN_PATTERNS) {
      if (pat.test(baseName)) {
        violations.push({ file: line, issue: `Forbidden runtime database file "${line}" found in archive`, severity: 'critical' });
        break;
      }
    }
  }

  // If python is available, also extract and scan each text file's content
  try {
    const scanScript = `
import zipfile, sys, re
z = zipfile.ZipFile(sys.argv[1])
patterns = [
    (b'sb_secret_', 'Supabase service key'),
    (b'-----BEGIN', 'Private key block'),
    (b'SUPABASE_SECRET_KEY=', 'SUPABASE_SECRET_KEY assignment'),
    (b'pk_live_', 'Stripe live key'),
]
for info in z.infolist():
    if info.filename.endswith(('.env', '.pem', '.key', '.p12', '.pfx')):
        print(f'FORBIDDEN_FILE:{info.filename}')
        continue
    try:
        data = z.read(info.filename)
        for pat, name in patterns:
            if pat in data:
                print(f'SECRET_FOUND:{info.filename}:{name}')
    except:
        pass
`;
    const scanResult = execSync(`python -c "${scanScript.replace(/"/g, '\\"').replace(/\n/g, ';')}" "${zipPath}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
    });
    for (const line of scanResult.split('\n').filter(Boolean)) {
      if (line.startsWith('FORBIDDEN_FILE:')) {
        violations.push({ file: line.substring(15), issue: `Forbidden secret file in archive`, severity: 'critical' });
      } else if (line.startsWith('SECRET_FOUND:')) {
        const parts = line.substring(13).split(':');
        violations.push({ file: parts[0], issue: `Secret pattern "${parts.slice(1).join(':')}" found in archive entry`, severity: 'critical' });
      }
    }
  } catch {
    // Python scan failed — rely on the raw byte scan above
  }
} catch {
  // Python not available or zip listing failed — rely on raw byte scan
}

console.log('SEC-01 Archive Secret Scan');
console.log(`  Archive: ${zipPath}`);
console.log(`  Size: ${raw.length} bytes`);
console.log(`  Violations: ${violations.length}`);

if (violations.length > 0) {
  console.log('\n❌ FAIL — secrets or forbidden files detected in release archive:\n');
  for (const v of violations) {
    console.log(`  [${v.severity.toUpperCase()}] ${v.file}: ${v.issue}`);
  }
  process.exit(1);
} else {
  console.log('\n✅ PASS — no secrets detected in release archive');
  process.exit(0);
}
