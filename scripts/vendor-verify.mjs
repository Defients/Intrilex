import { createHash } from 'node:crypto';
import { readFile, stat, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendor = path.join(root, 'vendor/toolchain/typescript-5.8.3');
const failures = [];

// Verify the vendor TypeScript toolchain directory exists
if (!existsSync(vendor)) {
  const report = {
    schemaVersion: '2.0',
    status: 'FAILED',
    vendorPath: 'vendor/toolchain/typescript-5.8.3',
    checkedFileCount: 0,
    failures: [{ reason: 'VENDOR_DIRECTORY_MISSING' }],
  };
  await writeFile(path.join(root, 'reports/vendor-integrity.json'), JSON.stringify(report, null, 2) + '\n');
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

// Verify the package.json declares the correct version
const pkg = JSON.parse(await readFile(path.join(vendor, 'package.json'), 'utf8'));
if (pkg.version !== '5.8.3') {
  failures.push({ file: 'package.json', reason: `VERSION_MISMATCH: expected 5.8.3, got ${pkg.version}` });
}

// Verify critical files exist and compute their hashes
const criticalFiles = [
  'package.json',
  'LICENSE.txt',
  'README.md',
  'SECURITY.md',
  'ThirdPartyNoticeText.txt',
  'bin/tsc',
  'bin/tsserver',
  'lib/typescript.js',
  'lib/typescript.d.ts',
];

const fileHashes = {};
for (const rel of criticalFiles) {
  const file = path.join(vendor, rel);
  if (!existsSync(file)) {
    failures.push({ file: rel, reason: 'MISSING' });
    continue;
  }
  try {
    const data = await readFile(file);
    const hash = createHash('sha256').update(data).digest('hex');
    fileHashes[rel] = hash;
  } catch (error) {
    failures.push({ file: rel, reason: error.code ?? String(error) });
  }
}

// Count all files in the vendor tree
let checkedFileCount = 0;
async function countFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await countFiles(full);
    } else {
      checkedFileCount++;
    }
  }
}
await countFiles(vendor);

const report = {
  schemaVersion: '2.0',
  status: failures.length === 0 ? 'VERIFIED' : 'FAILED',
  vendorPath: 'vendor/toolchain/typescript-5.8.3',
  package: 'typescript',
  version: pkg.version,
  checkedFileCount,
  criticalFileHashes: fileHashes,
  failures,
};

await writeFile(path.join(root, 'reports/vendor-integrity.json'), JSON.stringify(report, null, 2) + '\n');
if (report.status !== 'VERIFIED') {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(`VENDOR PASS: ${criticalFiles.length} critical files verified; ${checkedFileCount} total files in vendor tree; typescript-${pkg.version}`);
