// runtime/vendor-dist is a frozen, pre-compiled engine 4.1.0 certified-replay
// artifact with no in-repo source (see runtime/vendor-dist/README.md). It is
// tracked byte-for-byte (`-text` in .gitattributes) and pinned by this
// manifest so a clean checkout (CI) runs exactly the bytes local runs use.
//   node scripts/vendor-dist-integrity.mjs verify    (default; fail-closed)
//   node scripts/vendor-dist-integrity.mjs generate  (only when deliberately re-pinning)
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'runtime/vendor-dist');
const manifestName = 'VENDOR_DIST_MANIFEST.json';
const manifestPath = path.join(dist, manifestName);
const mode = process.argv[2] ?? 'verify';
if (!['verify', 'generate'].includes(mode)) throw new Error('usage: node scripts/vendor-dist-integrity.mjs verify|generate');
if (!existsSync(path.join(dist, 'src/phase16.js'))) {
  console.error('VENDOR DIST FAIL: runtime/vendor-dist/src/phase16.js is missing — the engine adapter cannot load. The directory must be tracked in git.');
  process.exit(1);
}

async function collect(dir = dist, prefix = '') {
  const rows = [];
  const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (rel === manifestName) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) rows.push(...await collect(abs, rel));
    else if (entry.isFile()) {
      const bytes = await readFile(abs);
      rows.push({ path: rel, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
  return rows;
}

const files = await collect();
const payloadHash = createHash('sha256').update(JSON.stringify(files)).digest('hex');
if (mode === 'generate') {
  const manifest = { schemaVersion: '1.0.0', artifact: 'runtime/vendor-dist', engineVersion: '4.1.0', origin: 'manually placed pre-compiled vendor artifact; no in-repo build step', fileCount: files.length, payloadHash, files };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`VENDOR DIST MANIFEST GENERATED: files=${files.length}; payload=${payloadHash}`);
} else {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const failures = [];
  if (manifest.fileCount !== files.length) failures.push(`file count ${files.length} != pinned ${manifest.fileCount}`);
  const pinned = new Map(manifest.files.map((f) => [f.path, f]));
  for (const f of files) {
    const p = pinned.get(f.path);
    if (!p) failures.push(`unpinned file ${f.path}`);
    else if (p.sha256 !== f.sha256) failures.push(`hash drift ${f.path}`);
  }
  for (const p of pinned.keys()) if (!files.some((f) => f.path === p)) failures.push(`missing file ${p}`);
  if (manifest.payloadHash !== payloadHash) failures.push(`payload ${payloadHash} != pinned ${manifest.payloadHash}`);
  if (failures.length) {
    console.error(`VENDOR DIST FAIL:\n  ${failures.slice(0, 20).join('\n  ')}`);
    process.exit(1);
  }
  console.log(`VENDOR DIST PASS: files=${files.length}; payload=${payloadHash}`);
}
