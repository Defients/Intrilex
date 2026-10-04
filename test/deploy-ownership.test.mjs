import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pruneDeployFiles, staleDeployFiles, writeDeployOwnership, deployParityProblems, finalizeDeployRuntime } from '../scripts/deploy-ownership.mjs';
import { cp, symlink, stat, utimes } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

test('deploy converges chunks, maps and removed owned files while retaining intentional extras', async () => {
  const root = await mkdtemp(join(tmpdir(), 'intrilex-deploy-'));
  const dist = join(root, 'dist'), deploy = join(root, 'deploy');
  try {
    await mkdir(dist); await mkdir(deploy);
    for (const name of ['chunk-ABCDEFGH.js', 'chunk-ABCDEFGH.js.map', 'styles.abcdef.css.map', '404.html', '_headers']) await writeFile(join(deploy, name), name);
    await writeFile(join(dist, 'chunk-12345678.js'), 'new');
    await mkdir(join(deploy, 'client'));
    await mkdir(join(deploy, 'assets'));
    await writeFile(join(deploy, 'client/board-preference.js'), 'abandoned generated runtime');
    await writeFile(join(deploy, 'assets/og-image.hash'), 'superseded generator cache');
    assert.deepEqual((await pruneDeployFiles(dist, deploy)).sort(), ['chunk-ABCDEFGH.js', 'chunk-ABCDEFGH.js.map', 'styles.abcdef.css.map', 'client/board-preference.js', 'assets/og-image.hash'].sort());
    assert.equal(await readFile(join(deploy, '404.html'), 'utf8'), '404.html');
    await writeFile(join(dist, 'obsolete-module.js'), 'old');
    await writeFile(join(deploy, 'obsolete-module.js'), 'old');
    await writeDeployOwnership(dist, deploy);
    await rm(join(dist, 'obsolete-module.js'));
    assert.deepEqual(await pruneDeployFiles(dist, deploy), ['obsolete-module.js']);
    await writeDeployOwnership(dist, deploy);
    assert.deepEqual(await staleDeployFiles(dist, deploy), []);
    await mkdir(join(deploy, 'assets/fonts'), { recursive: true });
    await writeFile(join(deploy, 'assets/fonts/custom.woff2'), 'intentional font');
    await writeFile(join(deploy, '.build-owned.json'), JSON.stringify({ schemaVersion: 1, files: ['404.html', '_headers', 'assets/fonts/custom.woff2'] }));
    assert.deepEqual(await pruneDeployFiles(dist, deploy), [], 'hosting extras are protected even against an older ownership manifest');
    assert.equal(await readFile(join(deploy, 'assets/fonts/custom.woff2'), 'utf8'), 'intentional font');
    await writeFile(join(deploy, '.build-owned.json'), JSON.stringify({ schemaVersion: 1, files: ['../escape'] }));
    await assert.rejects(pruneDeployFiles(dist, deploy), /Invalid/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('deploy CLI check is read-only and cannot accept build mode', async () => {
  const root = await mkdtemp(join(tmpdir(), 'intrilex-deploy-cli-'));
  try {
    await mkdir(join(root, 'scripts'));
    for (const file of ['sync-neocities.mjs', 'deploy-ownership.mjs']) {
      await cp(fileURLToPath(new URL('../scripts/' + file, import.meta.url)), join(root, 'scripts', file));
    }
    await mkdir(join(root,'scripts/lib'));
    await cp(fileURLToPath(new URL('../scripts/lib/write-with-retry.mjs',import.meta.url)),join(root,'scripts/lib/write-with-retry.mjs'));
    const dist = join(root, 'apps/lab-web/dist');
    await mkdir(dist, { recursive: true });
    await writeFile(join(dist, 'index.html'), '<script src="app.abcdef.js"></script>');
    await writeFile(join(dist, 'app.abcdef.js'), 'export {};');
    const check = (...args) => spawnSync(process.execPath, ['scripts/sync-neocities.mjs', '--check', ...args], { cwd: root, encoding: 'utf8' });
    assert.equal(check().status, 1);
    await assert.rejects(readFile(join(root, 'neocities-deploy/.build-owned.json')), { code: 'ENOENT' });
    const conflict = check('--build');
    assert.equal(conflict.status, 1);
    assert.match(conflict.stderr, /read-only/);
    execFileSync(process.execPath, ['-e', 'const fs=require("node:fs");if(fs.existsSync("neocities-deploy"))process.exit(1)'], { cwd: root });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('version generation preserves unchanged watched files and writes real version changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'intrilex-generated-version-'));
  try {
    await mkdir(join(root, 'scripts')); await mkdir(join(root, 'config'));
    for (const file of ['generate-version.mjs', 'write-generated-file.mjs']) {
      const source = fileURLToPath(new URL('../scripts/' + file, import.meta.url));
      if (existsSync(source)) await cp(source, join(root, 'scripts', file));
    }
    await mkdir(join(root,'scripts/lib'));
    await cp(fileURLToPath(new URL('../scripts/lib/write-with-retry.mjs',import.meta.url)),join(root,'scripts/lib/write-with-retry.mjs'));
    const identity = { version: '1.0.0', engineVersion: '4.2.6', rulesVersion: '4.3.1' };
    await writeFile(join(root, 'config/release-identity.json'), JSON.stringify(identity));
    const output = join(root, 'version.js');
    const generate = () => execFileSync(process.execPath, ['scripts/generate-version.mjs', '--browser', output], { cwd: root });
    generate();
    const marker = new Date('2000-01-01T00:00:00Z');
    await utimes(output, marker, marker);
    const before = (await stat(output)).mtimeMs;
    generate();
    assert.equal((await stat(output)).mtimeMs, before, 'Identical generation must not wake the source watcher');
    await writeFile(join(root, 'config/release-identity.json'), JSON.stringify({ ...identity, version: '1.0.1' }));
    generate();
    assert.match(await readFile(output, 'utf8'), /LAB_VERSION = "1.0.1"/);
    assert.notEqual((await stat(output)).mtimeMs, before);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('deploy refuses symlink roots and nested roots before removing files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'intrilex-deploy-roots-'));
  try {
    const dist = join(root, 'dist'), target = join(root, 'target'), linked = join(root, 'linked');
    await mkdir(dist); await mkdir(target);
    await writeFile(join(target, 'chunk-ABCDEFGH.js'), 'preserve');
    await symlink(target, linked, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(pruneDeployFiles(dist, linked), /regular directory/);
    assert.equal(await readFile(join(target, 'chunk-ABCDEFGH.js'), 'utf8'), 'preserve');
    await mkdir(join(dist, '..nested'));
    await assert.rejects(pruneDeployFiles(dist, join(dist, '..nested')), /separate/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('deployment parity rejects missing, altered and stale files, including runtime stubs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'intrilex-parity-'));
  const dist = join(root, 'dist'), deploy = join(root, 'deploy');
  try {
    await mkdir(dist); await mkdir(deploy);
    await writeFile(join(dist, 'app.abcdef.js'), 'export const render = 1;');
    await writeFile(join(dist, 'app.js'), 'raw app');
    await writeFile(join(dist, 'state.js'), 'raw state');
    await writeFile(join(dist, 'worker.js'), 'self.onmessage = () => {};');
    await writeFile(join(dist, 'autonomy-runtime.js'), 'export const authority = 1;');
    await cp(dist, deploy, { recursive: true });
    await finalizeDeployRuntime(deploy, 'app.abcdef.js');
    await writeDeployOwnership(dist, deploy);
    assert.deepEqual(await deployParityProblems(dist, deploy, 'app.abcdef.js'), []);
    await writeFile(join(deploy, 'autonomy-runtime.js'), 'export const authority = 0;');
    await writeFile(join(deploy, 'state.js'), 'hand-maintained rules');
    await rm(join(deploy, 'app.abcdef.js'));
    const problems = await deployParityProblems(dist, deploy, 'app.abcdef.js');
    assert.ok(problems.some(p => p.includes('Missing') && p.includes('app.abcdef.js')));
    assert.ok(problems.some(p => p.includes('Modified') && p.includes('autonomy-runtime.js')));
    assert.ok(problems.some(p => p.includes('Modified') && p.includes('state.js')));
    await cp(dist, deploy, { recursive: true });
    await finalizeDeployRuntime(deploy, 'app.abcdef.js');
    await writeFile(join(deploy, 'chunk-ABCDEFGH.js'), 'obsolete');
    assert.ok((await deployParityProblems(dist, deploy, 'app.abcdef.js')).some(p => p.includes('Stale')));
    await rm(join(deploy, 'chunk-ABCDEFGH.js'));
    await rm(join(deploy, '.build-owned.json'));
    assert.ok((await deployParityProblems(dist, deploy, 'app.abcdef.js')).some(p => p.includes('ownership')));
  } finally { await rm(root, { recursive: true, force: true }); }
});


test('deployment preserves shared hash exports required by unbundled Evolution workers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'intrilex-evolution-worker-deploy-'));
  const dist = join(root, 'dist'), deploy = join(root, 'deploy');
  try {
    await mkdir(join(dist, 'evolution'), {recursive:true});
    await writeFile(join(dist, 'package.json'), JSON.stringify({type:'module'}));
    await writeFile(join(dist, 'app.abcdef.js'), 'export const render = 1;');
    await writeFile(join(dist, 'worker.js'), 'self.onmessage = () => {};');
    await writeFile(join(dist, 'shared-browser.js'), 'export const hashCanonical = value => JSON.stringify(value);');
    await writeFile(join(dist, 'evolution/domain.mjs'), "import {hashCanonical} from '../shared-browser.js'; export const checkpointHash = hashCanonical({policy:'tempo-tactical'});");
    await cp(dist, deploy, {recursive:true});
    await finalizeDeployRuntime(deploy, 'app.abcdef.js');
    await writeDeployOwnership(dist, deploy);
    const domain = await import(pathToFileURL(join(deploy, 'evolution/domain.mjs')));
    assert.equal(domain.checkpointHash, JSON.stringify({policy:'tempo-tactical'}));
    assert.equal(await readFile(join(deploy, 'shared-browser.js'), 'utf8'), await readFile(join(dist, 'shared-browser.js'), 'utf8'));
    assert.deepEqual(await deployParityProblems(dist, deploy, 'app.abcdef.js'), []);
    await writeFile(join(deploy, 'shared-browser.js'), 'export {};');
    assert.ok((await deployParityProblems(dist, deploy, 'app.abcdef.js')).some(p => p === 'Modified build artifact: shared-browser.js'));
  } finally { await rm(root, {recursive:true,force:true}); }
});
