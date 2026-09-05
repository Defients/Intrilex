// Diagnostic: compare PRIORITY_PASS_HOTFIX_MANIFEST.json records vs actual files.
// Not a permanent script — temporary diagnostic for Phase 1.1.
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'upstream', 'intrilex-engine-4.2.6-attachment-integrity-hotfix');
const manifestPath = path.join(root, 'PRIORITY_PASS_HOTFIX_MANIFEST.json');
const excludedTop = new Set(['node_modules', 'release', '.git']);
const excludedExact = new Set(['PRIORITY_PASS_HOTFIX_MANIFEST.json', 'PRIORITY_PASS_HOTFIX_SHA256SUMS']);
const sha256 = b => createHash('sha256').update(b).digest('hex');

async function collect(dir = root, prefix = '') {
  const rows = [];
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (!prefix && excludedTop.has(entry.name)) continue;
    if (excludedExact.has(rel) || rel.endsWith('.log') || rel.endsWith('.tmp') || /^reports\/core-(advanced|private|response)-segment-/.test(rel)) continue;
    const abs = path.join(dir, entry.name);
    const st = await lstat(abs);
    if (st.isSymbolicLink()) throw new Error(`Manifest refuses symlink: ${rel}`);
    if (st.isDirectory()) rows.push(...await collect(abs, rel));
    else if (st.isFile()) {
      const bytes = await readFile(abs);
      rows.push({ path: rel, size: bytes.length, sha256: sha256(bytes) });
    }
  }
  return rows;
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const actual = await collect();

const manifestByPath = new Map(manifest.files.map(f => [f.path, f]));
const actualByPath = new Map(actual.map(f => [f.path, f]));

const added = actual.filter(f => !manifestByPath.has(f.path)).map(f => f.path);
const removed = manifest.files.filter(f => !actualByPath.has(f.path)).map(f => f.path);
const changed = [];
for (const f of actual) {
  const m = manifestByPath.get(f.path);
  if (m && (m.sha256 !== f.sha256 || m.size !== f.size)) {
    changed.push({ path: f.path, manifestSize: m.size, actualSize: f.size, manifestSha: m.sha256, actualSha: f.sha256 });
  }
}

console.log(JSON.stringify({
  manifestFileCount: manifest.fileCount,
  actualFileCount: actual.length,
  manifestPayloadHash: manifest.payloadHash,
  addedCount: added.length,
  removedCount: removed.length,
  changedCount: changed.length,
  added: added.slice(0, 50),
  removed: removed.slice(0, 50),
  changed: changed.slice(0, 80),
}, null, 2));
