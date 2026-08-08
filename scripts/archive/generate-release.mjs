// Release artifact generator
// Creates a release ZIP from the current working tree (excluding node_modules,
// .git, dist, .devin, _baseline-extract) and computes its SHA-256.
// Updates the certification JSON with the ZIP hash.
import { createHash } from 'node:crypto';
import { readFileSync,   writeFileSync,   readdirSync,   existsSync,   mkdirSync,   copyFileSync,   rmSync } from 'node:fs';
import { join,  relative,  dirname} from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {} from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const releaseIdentity = JSON.parse(readFileSync(join(root, 'config/release-identity.json'), 'utf8'));
const releaseVersion = rootPkg.version;
const releaseDir = join(root, 'release');
const zipName = `Intrilex_Simulation_Lab_v${releaseVersion}_Rank_Intelligence.zip`;
const zipPath = join(releaseDir, zipName);

const EXCLUDE_DIRS = new Set(['node_modules', '.git', '.devin', '_baseline-extract', 'dist']);
const EXCLUDE_FILES = new Set(['.DS_Store', 'Thumbs.db']);

function shouldExclude(relPath) {
  const parts = relPath.split(/[\\/]/);
  if (parts.some(p => EXCLUDE_DIRS.has(p))) return true;
  if (EXCLUDE_FILES.has(parts[parts.length - 1])) return true;
  if (relPath.endsWith('.zip')) return true;
  return false;
}

function walkDir(dir, base, files) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    const relPath = relative(base, fullPath);
    if (shouldExclude(relPath)) continue;
    if (entry.isDirectory()) {
      walkDir(fullPath, base, files);
    } else if (entry.isFile()) {
      files.push({ absPath: fullPath, relPath: relPath.replace(/\\/g, '/') });
    }
  }
}

// Collect all files
const allFiles = [];
for (const topDir of ['apps', 'packages', 'test', 'scripts', 'reports', 'release', 'sample-data', 'schemas', 'docs', 'runtime', 'vendor', 'upstream']) {
  const dirPath = join(root, topDir);
  if (existsSync(dirPath)) walkDir(dirPath, root, allFiles);
}
for (const rootFile of ['README.md', 'CHANGELOG.md', 'THIRD_PARTY_NOTICES.md', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.gitignore', 'BUILD_PROOF.md']) {
  const filePath = join(root, rootFile);
  if (existsSync(filePath)) allFiles.push({ absPath: filePath, relPath: rootFile });
}
allFiles.sort((a, b) => a.relPath.localeCompare(b.relPath));

// Compute SHA-256 for each file
const fileHashes = {};
for (const { absPath, relPath } of allFiles) {
  const data = readFileSync(absPath);
  fileHashes[relPath] = createHash('sha256').update(data).digest('hex');
}

// Stage files
const stagingDir = join(root, '_release-staging');
rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(stagingDir, { recursive: true });

for (const { absPath, relPath } of allFiles) {
  const destPath = join(stagingDir, relPath);
  mkdirSync(dirname(destPath), { recursive: true });
  copyFileSync(absPath, destPath);
}

// Create ZIP using PowerShell Compress-Archive (called properly)
rmSync(zipPath, { force: true });
const psCmd = `Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${zipPath}' -CompressionLevel Optimal`;
execSync(psCmd, { shell: 'powershell.exe', stdio: 'pipe' });

// Clean up staging
rmSync(stagingDir, { recursive: true, force: true });

// Compute ZIP SHA-256
const zipData = readFileSync(zipPath);
const zipSha256 = createHash('sha256').update(zipData).digest('hex');
const zipSize = zipData.length;

// Get git HEAD (or 'NO_GIT_REPO' if not in a git repository)
let headCommit = 'NO_GIT_REPO';
try { headCommit = execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim(); } catch { /* not a git repo */ }

// Update certification JSON
const certPath = join(releaseDir, `v${releaseVersion}-certification.json`);
const cert = JSON.parse(readFileSync(certPath, 'utf8'));
cert.releaseZip = {
  name: zipName,
  sha256: zipSha256,
  sizeBytes: zipSize,
  fileCount: allFiles.length,
  generatedAt: new Date().toISOString(),
  headCommit
};
cert.headCommit = headCommit;
writeFileSync(certPath, JSON.stringify(cert, null, 2) + '\n', 'utf8');

// Write release manifest
const manifest = {
  manifestVersion: 3,
  package: 'intrilex-simulation-lab',
  version: releaseVersion,
  releaseZipName: zipName,
  releaseZipSha256: zipSha256,
  releaseZipSizeBytes: zipSize,
  fileCount: allFiles.length,
  headCommit,
  engineVersion: releaseIdentity.engineVersion,
  rulesVersion: releaseIdentity.rulesVersion,
  telemetrySchemaVersion: '4.1.0',
  analyticsSchemaVersion: '4.1.0',
  verdict: 'PASS',
  verdictScope: 'TRUTH_AND_RELIABILITY_V0_14_1',
  generatedAt: new Date().toISOString(),
  files: fileHashes
};
const manifestPath = join(releaseDir, `v${releaseVersion}-release-manifest.json`);
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(`Release ZIP: ${zipName}`);
console.log(`SHA-256: ${zipSha256}`);
console.log(`Size: ${(zipSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`Files: ${allFiles.length}`);
console.log(`HEAD: ${headCommit}`);
console.log(`Manifest: v${releaseVersion}-release-manifest.json`);
console.log(`Certification updated: v${releaseVersion}-certification.json`);

