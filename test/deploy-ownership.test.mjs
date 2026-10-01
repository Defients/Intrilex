import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pruneDeployFiles, staleDeployFiles, writeDeployOwnership } from '../scripts/deploy-ownership.mjs';

test('deploy converges chunks, maps and removed owned files while retaining intentional extras', async () => {
  const root = await mkdtemp(join(tmpdir(), 'intrilex-deploy-'));
  const dist = join(root, 'dist'), deploy = join(root, 'deploy');
  try {
    await mkdir(dist); await mkdir(deploy);
    for (const name of ['chunk-ABCDEFGH.js', 'chunk-ABCDEFGH.js.map', 'styles.abcdef.css.map', '404.html', '_headers']) await writeFile(join(deploy, name), name);
    await writeFile(join(dist, 'chunk-12345678.js'), 'new');
    assert.deepEqual((await pruneDeployFiles(dist, deploy)).sort(), ['chunk-ABCDEFGH.js', 'chunk-ABCDEFGH.js.map', 'styles.abcdef.css.map'].sort());
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
