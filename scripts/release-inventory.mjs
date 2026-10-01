import { execFileSync } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function safeMember(name) {
  if (!name || name.includes('\\') || name.includes(':') || name.startsWith('/') || name.split('/').some(p => !p || p === '.' || p === '..')) throw new Error(`UNSAFE_ARCHIVE_PATH:${name}`);
  return name;
}
// Source distribution: tracked inputs only. Public environment templates remain usable.
export function sourceMember(name) {
  safeMember(name);
  return !/^(?:release|neocities-deploy|reports\/(?:local|release)|runtime|node_modules)\//.test(name)
    && !/(?:^|\/)(?:node_modules|__pycache__)\//.test(name)
    && !/(?:^|\/)\.env(?:\..*)?$/.test(name.replace(/\.env\.example$/, 'PUBLIC_TEMPLATE'))
    && !/\.(?:pyc|pem|key|p12|pfx|keystore|sqlite(?:-wal|-shm)?|db(?:-wal|-shm)?|zip|log|tmp|bak)$/.test(name)
    && name !== 'neocities.config.js';
}
export async function memberBytes(root, name) {
  safeMember(name);
  let current = root;
  for (const part of name.split('/')) {
    current = path.join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new Error(`UNSAFE_SYMLINK:${name}`);
  }
  if (!(await lstat(current)).isFile()) throw new Error(`NOT_REGULAR_FILE:${name}`);
  return readFile(current);
}
export async function sourceInventory(root) {
  const names = execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 20 * 1024 * 1024 }).toString('utf8').split('\0').filter(Boolean).filter(sourceMember).sort();
  const files = {};
  for (const name of names) files[name] = sha256(await memberBytes(root, name));
  return files;
}
export function inventoryHash(files) { return sha256(JSON.stringify(Object.fromEntries(Object.entries(files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)))); }
export async function verifyInventory(root, manifest) {
  if (manifest.manifestVersion !== 4 || !manifest.files || manifest.payloadHash !== inventoryHash(manifest.files)) throw new Error('INVALID_MANIFEST_INVENTORY');
  for (const [name, hash] of Object.entries(manifest.files)) {
    if (!/^[a-f0-9]{64}$/.test(hash) || sha256(await memberBytes(root, name)) !== hash) throw new Error(`MANIFEST_FILE_MISMATCH:${name}`);
  }
  return Object.keys(manifest.files).length;
}
