import { readdir, readFile, lstat, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const protectedFile = file => file === '404.html' || file === '_headers' || file.startsWith('assets/fonts/');
const manifestName = '.build-owned.json';
const generatedRootFile = /^(?:(?:app|styles|tactical|__intrilex-config)\.[a-zA-Z0-9_-]+\.(?:js|css)|.+-[A-Z0-9]{8}\.(?:js|css))(?:\.map)?$/;

/** Walk without following symlinks: a deployment must never escape its roots. */
export async function listBuildFiles(root, prefix = '') {
  const files = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Deployment refuses symlink: ${rel}`);
    if (entry.isDirectory()) files.push(...await listBuildFiles(root, rel));
    else if (entry.isFile() && rel !== manifestName) files.push(rel);
  }
  return files.sort();
}

function safeRelative(value) {
  return typeof value === 'string' && value.length > 0 && !value.includes('\\') &&
    !value.includes(':') && !value.startsWith('/') && value.split('/').every(part => part && part !== '.' && part !== '..');
}

export async function staleDeployFiles(dist, deploy) {
  const current = new Set(await listBuildFiles(dist));
  const deployed = await listBuildFiles(deploy);
  let previous = [];
  try {
    const manifest = JSON.parse(await readFile(path.join(deploy, manifestName), 'utf8'));
    if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files) || !manifest.files.every(safeRelative)) throw new Error('Invalid build ownership manifest');
    previous = manifest.files;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const owned = new Set(previous);
  // Bootstrap older mirrors conservatively. Unknown extras remain untouched.
  for (const file of deployed) {
    if (generatedRootFile.test(file) || file.startsWith('data/')) owned.add(file);
  }
  return deployed.filter(file => !protectedFile(file) && owned.has(file) && !current.has(file));
}

export async function pruneDeployFiles(dist, deploy) {
  const source = path.resolve(dist), target = path.resolve(deploy);
  if (source === target || !path.relative(target, source).startsWith('..') || !path.relative(source, target).startsWith('..')) throw new Error('Build and deploy roots must be separate');
  const stale = await staleDeployFiles(source, target);
  for (const file of stale) {
    const absolute = path.resolve(target, file);
    if (!safeRelative(file) || !absolute.startsWith(target + path.sep)) throw new Error('Unsafe deployment path');
    // The complete traversal above rejects symlink parents before any mutation.
    if (!(await lstat(absolute)).isFile()) throw new Error(`Not a regular build file: ${file}`);
    await rm(absolute);
  }
  return stale;
}

export async function writeDeployOwnership(dist, deploy) {
  const files = (await listBuildFiles(dist)).filter(file => !protectedFile(file));
  await writeFile(path.join(deploy, manifestName), JSON.stringify({ schemaVersion: 1, files }, null, 2) + '\n');
}
