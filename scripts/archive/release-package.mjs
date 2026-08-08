// ═══════════════════════════════════════════════════════════════
// release-package.mjs
// Gate 5 — Deterministic release packaging
//
// Creates three archives:
//   1. Source archive — all source files (no dist, no node_modules)
//   2. Deploy archive — the built dist directory (ready to serve)
//   3. Evidence archive — certified replays, reports, analytics
//
// Each archive gets a SHA-256 companion file.
// Packaging is run twice to verify hash equality (determinism).
// ═══════════════════════════════════════════════════════════════

import { createHash } from 'node:crypto';
import { createReadStream,    readFileSync,    writeFileSync} from 'node:fs';
import { readdir,  mkdir,  readFile,  writeFile,  rm } from 'node:fs/promises';
import { join,  relative,  basename,  dirname} from 'node:path';
import { fileURLToPath } from 'node:url';
import {} from 'node:child_process';
import {} from 'node:zlib';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = join(__dirname, '..');
const releaseDir = join(root, 'release');
const archivesDir = join(releaseDir, 'archives');

// ── Helpers ───────────────────────────────────────────────────

async function walkDir(dir, predicate, results = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDir(fullPath, predicate, results);
    } else if (entry.isFile() && predicate(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

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

// Deterministic file ordering: sort by relative path
function sortFiles(files, baseDir) {
  return files
    .map(f => ({ abs: f, rel: relative(baseDir, f).replace(/\\/g, '/') }))
    .sort((a, b) => a.rel.localeCompare(b.rel));
}

// Create a deterministic tar-like archive using a simple concatenated format
// Format: [relative_path_len:4bytes][relative_path][file_size:8bytes][file_data]
// This is deterministic because file order and content are fixed.
async function createDeterministicArchive(files, baseDir, outputPath) {
  const entries = sortFiles(files, baseDir);
  const chunks = [];
  const manifest = [];

  for (const entry of entries) {
    const relPath = Buffer.from(entry.rel, 'utf8');
    const data = await readFile(entry.abs);
    const pathLen = Buffer.alloc(4);
    pathLen.writeUInt32BE(relPath.length, 0);
    const fileSize = Buffer.alloc(8);
    fileSize.writeBigUInt64BE(BigInt(data.length), 0);
    chunks.push(pathLen, relPath, fileSize, data);
    manifest.push({
      path: entry.rel,
      size: data.length,
      sha256: sha256Buffer(data),
    });
  }

  const archiveBuffer = Buffer.concat(chunks);
  writeFileSync(outputPath, archiveBuffer);
  return {
    archivePath: outputPath,
    archiveSize: archiveBuffer.length,
    archiveSha256: sha256Buffer(archiveBuffer),
    fileCount: entries.length,
    manifest,
  };
}

// Extract and verify a deterministic archive
async function extractAndVerifyArchive(archivePath, outputDir, expectedSha256) {
  // Verify archive hash
  const actualSha256 = await sha256File(archivePath);
  if (expectedSha256 && actualSha256 !== expectedSha256) {
    throw new Error(`Archive hash mismatch: expected ${expectedSha256}, got ${actualSha256}`);
  }

  const archiveBuffer = await readFile(archivePath);
  let offset = 0;
  const extracted = [];

  await mkdir(outputDir, { recursive: true });

  while (offset < archiveBuffer.length) {
    const pathLen = archiveBuffer.readUInt32BE(offset);
    offset += 4;
    const relPath = archiveBuffer.subarray(offset, offset + pathLen).toString('utf8');
    offset += pathLen;
    const fileSize = Number(archiveBuffer.readBigUInt64BE(offset));
    offset += 8;
    const data = archiveBuffer.subarray(offset, offset + fileSize);
    offset += fileSize;

    const outPath = join(outputDir, relPath);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, data);
    extracted.push({
      path: relPath,
      size: fileSize,
      sha256: sha256Buffer(data),
    });
  }

  return { extracted, archiveSha256: actualSha256 };
}

// ── File predicates ───────────────────────────────────────────

// Source archive: all source files, excluding dist, node_modules, release, .git, data, vendored
const SOURCE_EXCLUDE_DIRS = ['node_modules', 'dist', 'release', '.git', 'pnpm-store', 'coverage', 'sample-data', 'upstream', 'vendor', 'runtime', '.windsurf', '.github'];
function isSourceFile(filePath) {
  const rel = relative(root, filePath).replace(/\\/g, '/');
  // Exclude any path that contains a excluded directory as a path segment
  const segments = rel.split('/');
  for (const seg of segments) {
    if (SOURCE_EXCLUDE_DIRS.includes(seg)) return false;
  }
  // Include specific file types
  return /\.(mjs|js|json|md|html|css|svg|txt|ndjson|yml|yaml|npmrc|gitignore|editorconfig)$/.test(rel)
    || rel === 'pnpm-workspace.yaml'
    || basename(rel).startsWith('.devin');
}

// Deploy archive: everything in apps/lab-web/dist
function isDeployFile(filePath) {
  const distDir = join(root, 'apps/lab-web/dist');
  return filePath.startsWith(distDir);
}

// Evidence archive: certified replays, reports, analytics
const EVIDENCE_INCLUDE = [
  'apps/lab-web/dist/data/certified-replays',
  'apps/lab-web/dist/data/observatory',
  'apps/lab-web/dist/data/release',
  'apps/lab-web/dist/data/autonomy',
  'reports',
];
function isEvidenceFile(filePath) {
  const rel = relative(root, filePath).replace(/\\/g, '/');
  for (const incl of EVIDENCE_INCLUDE) {
    if (rel.startsWith(incl + '/') || rel === incl) return true;
  }
  return false;
}

// ── Main packaging ────────────────────────────────────────────

async function packageRelease() {
  // Clean release directory
  await rm(releaseDir, { recursive: true, force: true });
  await mkdir(archivesDir, { recursive: true });

  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const timestamp = new Date().toISOString();

  // Collect files for each archive
  const sourceFiles = await walkDir(root, isSourceFile);
  const distDir = join(root, 'apps/lab-web/dist');
  const deployFiles = await walkDir(distDir, isDeployFile);
  const evidenceFiles = await walkDir(root, isEvidenceFile);

  console.log(`Source files: ${sourceFiles.length}`);
  console.log(`Deploy files: ${deployFiles.length}`);
  console.log(`Evidence files: ${evidenceFiles.length}`);

  // Create archives — Run 1
  const sourceArchive1 = await createDeterministicArchive(
    sourceFiles, root, join(archivesDir, `intrilex-${version}-source.archive`)
  );
  const deployArchive1 = await createDeterministicArchive(
    deployFiles, distDir, join(archivesDir, `intrilex-${version}-deploy.archive`)
  );
  const evidenceArchive1 = await createDeterministicArchive(
    evidenceFiles, root, join(archivesDir, `intrilex-${version}-evidence.archive`)
  );

  // Write SHA-256 companion files
  for (const [name, archive] of Object.entries({ source: sourceArchive1, deploy: deployArchive1, evidence: evidenceArchive1 })) {
    const shaPath = archive.archivePath + '.sha256';
    writeFileSync(shaPath, `${archive.archiveSha256}  ${basename(archive.archivePath)}\n`);
    console.log(`${name}: ${archive.archiveSha256} (${archive.archiveSize} bytes, ${archive.fileCount} files)`);
  }

  // Create archives — Run 2 (determinism check)
  const tmpDir = join(releaseDir, 'tmp-determinism-check');
  await mkdir(tmpDir, { recursive: true });

  const sourceArchive2 = await createDeterministicArchive(
    sourceFiles, root, join(tmpDir, 'source.archive')
  );
  const deployArchive2 = await createDeterministicArchive(
    deployFiles, distDir, join(tmpDir, 'deploy.archive')
  );
  const evidenceArchive2 = await createDeterministicArchive(
    evidenceFiles, root, join(tmpDir, 'evidence.archive')
  );

  // Verify hash equality
  const determinismResults = {
    source: sourceArchive1.archiveSha256 === sourceArchive2.archiveSha256,
    deploy: deployArchive1.archiveSha256 === deployArchive2.archiveSha256,
    evidence: evidenceArchive1.archiveSha256 === evidenceArchive2.archiveSha256,
  };

  console.log('\nDeterminism check:');
  for (const [name, passed] of Object.entries(determinismResults)) {
    console.log(`  ${name}: ${passed ? 'PASS' : 'FAIL'}`);
  }

  const allDeterministic = Object.values(determinismResults).every(v => v === true);

  // Clean up determinism check
  await rm(tmpDir, { recursive: true, force: true });

  // ── Independent extracted verification ──────────────────────
  const extractDir = join(releaseDir, 'extracted-verification');
  await mkdir(extractDir, { recursive: true });

  const verificationResults = {};

  for (const [name, archive] of Object.entries({ source: sourceArchive1, deploy: deployArchive1, evidence: evidenceArchive1 })) {
    const extractOutputDir = join(extractDir, name);
    const extractResult = await extractAndVerifyArchive(
      archive.archivePath,
      extractOutputDir,
      archive.archiveSha256
    );

    // Verify all extracted files match their manifest hashes
    let allFilesVerified = true;
    const fileVerifications = [];
    for (let i = 0; i < archive.manifest.length; i++) {
      const expected = archive.manifest[i];
      const actual = extractResult.extracted[i];
      const match = expected.path === actual.path && expected.sha256 === actual.sha256 && expected.size === actual.size;
      if (!match) allFilesVerified = false;
      fileVerifications.push({
        path: actual.path,
        sizeMatch: expected.size === actual.size,
        hashMatch: expected.sha256 === actual.sha256,
      });
    }

    verificationResults[name] = {
      archiveHash: archive.archiveSha256,
      archiveHashVerified: extractResult.archiveSha256 === archive.archiveSha256,
      fileCount: archive.manifest.length,
      allFilesVerified,
      sampleFiles: fileVerifications.slice(0, 5),
    };

    console.log(`\nExtracted verification — ${name}:`);
    console.log(`  Archive hash: ${archive.archiveSha256}`);
    console.log(`  Hash verified: ${extractResult.archiveSha256 === archive.archiveSha256}`);
    console.log(`  Files verified: ${allFilesVerified ? 'ALL' : 'SOME FAILED'} (${archive.manifest.length} files)`);
  }

  // ── Build release manifest ──────────────────────────────────
  const manifest = {
    version,
    timestamp,
    archives: {
      source: {
        path: relative(root, sourceArchive1.archivePath),
        sha256: sourceArchive1.archiveSha256,
        size: sourceArchive1.archiveSize,
        fileCount: sourceArchive1.fileCount,
        sha256Companion: relative(root, sourceArchive1.archivePath + '.sha256'),
      },
      deploy: {
        path: relative(root, deployArchive1.archivePath),
        sha256: deployArchive1.archiveSha256,
        size: deployArchive1.archiveSize,
        fileCount: deployArchive1.fileCount,
        sha256Companion: relative(root, deployArchive1.archivePath + '.sha256'),
      },
      evidence: {
        path: relative(root, evidenceArchive1.archivePath),
        sha256: evidenceArchive1.archiveSha256,
        size: evidenceArchive1.archiveSize,
        fileCount: evidenceArchive1.fileCount,
        sha256Companion: relative(root, evidenceArchive1.archivePath + '.sha256'),
      },
    },
    determinism: {
      allPassed: allDeterministic,
      results: determinismResults,
    },
    extractedVerification: verificationResults,
  };

  const manifestPath = join(releaseDir, 'release-manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nRelease manifest: ${manifestPath}`);

  if (!allDeterministic) {
    console.error('FAIL: Archives are not deterministic');
    process.exit(1);
  }

  // Check all extracted verifications passed
  const allVerified = Object.values(verificationResults).every(v => v.archiveHashVerified && v.allFilesVerified);
  if (!allVerified) {
    console.error('FAIL: Extracted verification failed');
    process.exit(1);
  }

  console.log('\nALL PASS: Three deterministic archives created, SHA-256 companions written, hash equality verified, extracted verification passed');
  return manifest;
}

packageRelease().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
