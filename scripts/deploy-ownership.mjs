import { readdir, readFile, lstat, rm } from 'node:fs/promises';
import { writeFile, withRetry } from './lib/write-with-retry.mjs';
import path from 'node:path';

const protectedFile = file => file === '404.html' || file === '_headers' || file.startsWith('assets/fonts/');
const manifestName = '.build-owned.json';
const generatedRootFile = /^(?:(?:app|styles|tactical|__intrilex-config)\.[a-zA-Z0-9_-]+\.(?:js|css)|.+-[A-Z0-9]{8}\.(?:js|css))(?:\.map)?$/;
// Former generated files predating ownership manifests; neither has a source
// consumer now. Preserve them if a future build explicitly owns them again.
const legacyGeneratedFiles = new Set(['client/board-preference.js', 'assets/og-image.hash']);
// One source-owned compatibility projection for stale service workers. The
// worker/proof entries and their runtime imports must remain executable.
// shared-browser.js is imported directly by Evolution workers, outside the
// bundled app graph; preserve its canonical hash exports byte-for-byte.
const neutralizedFiles = new Set([
  'error-boundary.js', 'state.js', 'router.js', 'rerender.js',
  'data-loader.js', 'integrity.js', 'card-face-data.js', 'card-face-renderer.js',
  'card-art-registry.js', 'chart-toolkit.js', 'experiment-controls.js',
  'legal-pages.js', 'replay-frames.js', 'rulebook-renderer.js',
  'seo-metadata.js',
]);
const neutralizedStub = '// Neutralized stub — real code is in the bundled chunks.\nexport {};\n';

function projectedRuntime(file, appBundle) {
  if (file === 'app.js') {
    if (!/^app\.[a-f0-9]+\.js$/.test(appBundle ?? '')) throw new Error('Invalid app bundle reference');
    return `// Re-export from the real bundled app (defense-in-depth for stale SWs)\nexport { render, showExtract, stop, togglePlay } from './${appBundle}';\n`;
  }
  return neutralizedFiles.has(file) ? neutralizedStub : null;
}

/** Walk without following symlinks: a deployment must never escape its roots. */
export async function listBuildFiles(root, prefix = '') {
  if (!prefix && !(await lstat(root)).isDirectory()) throw new Error('Deployment root must be a regular directory');
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
    if (generatedRootFile.test(file) || file.startsWith('data/') || legacyGeneratedFiles.has(file)) owned.add(file);
  }
  return deployed.filter(file => !protectedFile(file) && owned.has(file) && !current.has(file));
}

export async function pruneDeployFiles(dist, deploy) {
  const source = path.resolve(dist), target = path.resolve(deploy);
  const contains = (parent, child) => {
    const relative = path.relative(parent, child);
    return !relative || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep));
  };
  if (contains(source, target) || contains(target, source)) throw new Error('Build and deploy roots must be separate');
  const stale = await staleDeployFiles(source, target);
  for (const file of stale) {
    const absolute = path.resolve(target, file);
    if (!safeRelative(file) || !absolute.startsWith(target + path.sep)) throw new Error('Unsafe deployment path');
    // The complete traversal above rejects symlink parents before any mutation.
    if (!(await lstat(absolute)).isFile()) throw new Error(`Not a regular build file: ${file}`);
    await withRetry(() => rm(absolute));
  }
  return stale;
}

export async function writeDeployOwnership(dist, deploy) {
  const files = (await listBuildFiles(dist)).filter(file => !protectedFile(file));
  await writeFile(path.join(deploy, manifestName), JSON.stringify({ schemaVersion: 1, files }, null, 2) + '\n');
}

/** Generate the publish-only compatibility files; never maintain deploy code by hand. */
export async function finalizeDeployRuntime(deploy, appBundle) {
  projectedRuntime('app.js', appBundle); // Validate before constructing a filesystem path.
  const files = await listBuildFiles(deploy);
  await readFile(path.join(deploy, appBundle));
  const worker = await readFile(path.join(deploy, 'worker.js'), 'utf8');
  if (!/self\.onmessage\s*=/.test(worker)) throw new Error('Deployment worker is not an executable entry (missing self.onmessage)');
  for (const file of files) {
    const projected = projectedRuntime(file, appBundle);
    if (projected !== null) await writeFile(path.join(deploy, file), projected, 'utf8');
  }
}

/** Read-only byte parity, including compatibility projections and ownership. */
export async function deployParityProblems(dist, deploy, appBundle) {
  const current = (await listBuildFiles(dist)).filter(file => !protectedFile(file));
  const deployed = new Set(await listBuildFiles(deploy));
  const problems = (await staleDeployFiles(dist, deploy)).map(file => `Stale build artifact: ${file}`);
  for (const file of current) {
    if (!deployed.has(file)) { problems.push(`Missing build artifact: ${file}`); continue; }
    const projected = projectedRuntime(file, appBundle);
    const expected = projected === null ? await readFile(path.join(dist, file)) : Buffer.from(projected);
    if (!expected.equals(await readFile(path.join(deploy, file)))) problems.push(`Modified build artifact: ${file}`);
  }
  const worker = await readFile(path.join(dist, 'worker.js'), 'utf8');
  if (!/self\.onmessage\s*=/.test(worker)) problems.push('Build worker is not an executable entry');
  try {
    const ownership = JSON.parse(await readFile(path.join(deploy, manifestName), 'utf8'));
    if (ownership.schemaVersion !== 1 || !Array.isArray(ownership.files) ||
        JSON.stringify([...ownership.files].sort()) !== JSON.stringify(current)) {
      problems.push('Build ownership manifest does not match the current build');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    problems.push('Missing build ownership manifest');
  }
  return problems;
}
