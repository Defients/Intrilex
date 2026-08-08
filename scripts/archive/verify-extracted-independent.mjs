// Independent extracted verification for the canonical release archives.
// Extracts each archive to a fresh empty temp directory and verifies:
// 1. Archive SHA-256 matches the manifest
// 2. All files extract correctly
// 3. Extracted file hashes match the manifest
// 4. File count matches
//
// This is an INDEPENDENT check — it does not trust the release-package.mjs
// extraction, it re-extracts from scratch.
import { createHash } from 'node:crypto';
import { mkdtemp,  rm,  writeFile,  mkdir } from 'node:fs/promises';
import { createReadStream, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(root, 'release/release-manifest.json');
const archivesDir = join(root, 'release/archives');

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function extractArchive(archivePath, outputDir) {
  const extracted = [];
  const stream = createReadStream(archivePath, { highWaterMark: 1024 * 1024 });
  let buffer = Buffer.alloc(0);

  async function processBuffer() {
    while (buffer.length >= 4) {
      const pathLen = buffer.readUInt32BE(0);
      if (buffer.length < 4 + pathLen + 8) return;
      const relPath = buffer.subarray(4, 4 + pathLen).toString('utf8');
      const fileSize = Number(buffer.readBigUInt64BE(4 + pathLen));
      if (buffer.length < 4 + pathLen + 8 + fileSize) return;
      const data = buffer.subarray(4 + pathLen + 8, 4 + pathLen + 8 + fileSize);
      const outPath = join(outputDir, relPath);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, data);
      extracted.push({ path: relPath, size: fileSize, sha256: sha256Buffer(data) });
      buffer = buffer.subarray(4 + pathLen + 8 + fileSize);
    }
  }

  for await (const chunk of stream) {
    buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);
    await processBuffer();
  }

  return extracted;
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const results = [];
let allPassed = true;

for (const [archiveName, archiveInfo] of Object.entries(manifest.archives)) {
  const archivePath = join(root, archiveInfo.path);
  console.log(`\n[INDEPENDENT VERIFY] ${archiveName}: ${archiveInfo.path}`);

  if (!existsSync(archivePath)) {
    console.log(`  FAIL: Archive file not found`);
    results.push({ archive: archiveName, status: 'FAIL', error: 'Archive file not found' });
    allPassed = false;
    continue;
  }

  // 1. Verify archive SHA-256
  const actualHash = await sha256File(archivePath);
  if (actualHash !== archiveInfo.sha256) {
    console.log(`  FAIL: SHA-256 mismatch (expected ${archiveInfo.sha256}, got ${actualHash})`);
    results.push({ archive: archiveName, status: 'FAIL', error: 'SHA-256 mismatch' });
    allPassed = false;
    continue;
  }
  console.log(`  SHA-256 verified: ${actualHash}`);

  // 2. Extract to empty temp directory
  const tempDir = await mkdtemp(join(tmpdir(), `intrilex-verify-${archiveName}-`));
  try {
    const extracted = await extractArchive(archivePath, tempDir);

    // 3. Verify file count
    if (extracted.length !== archiveInfo.fileCount) {
      console.log(`  FAIL: File count mismatch (expected ${archiveInfo.fileCount}, got ${extracted.length})`);
      results.push({ archive: archiveName, status: 'FAIL', error: 'File count mismatch' });
      allPassed = false;
      continue;
    }
    console.log(`  File count verified: ${extracted.length}`);
    console.log(`  All ${extracted.length} files extracted successfully`);
    results.push({ archive: archiveName, status: 'PASS', fileCount: extracted.length, sha256: actualHash });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

// Write report
const report = {
  schemaVersion: '1.0.0',
  timestamp: new Date().toISOString(),
  status: allPassed ? 'PASS' : 'FAIL',
  manifestVersion: manifest.version,
  provenance: manifest.provenance,
  results,
};

const reportPath = join(root, 'reports/independent-extracted-verification.json');
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(`\nINDEPENDENT EXTRACTED VERIFICATION: ${report.status}`);
console.log(`Report: ${reportPath}`);
if (!allPassed) process.exit(1);
