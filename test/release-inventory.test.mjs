import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sourceInventory, inventoryHash, verifyInventory, safeMember, sha256, sourceMember } from '../scripts/release-inventory.mjs';

test('source archive uses tracked inputs, retains public templates, and detects payload tampering', async () => {
  const root=await mkdtemp(path.join(tmpdir(),'intrilex-inventory-'));
  const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:'pipe'});
  try {
    git('init');
    await writeFile(path.join(root,'.env.example'),'PUBLIC_URL=https://example.invalid\n');
    await writeFile(path.join(root,'source.mjs'),'export const value=42;\n');
    await mkdir(path.join(root,'neocities-deploy'));
    await writeFile(path.join(root,'neocities-deploy/generated.js'),'historical build');
    git('add','.');
    await writeFile(path.join(root,'.env'),'LOCAL_SECRET=excluded\n');
    await writeFile(path.join(root,'untracked.txt'),'must not ship');
    const files=await sourceInventory(root);
    assert.deepEqual(Object.keys(files),['.env.example','source.mjs']);
    const manifest={manifestVersion:4,files,payloadHash:inventoryHash(files)};
    assert.equal(await verifyInventory(root,manifest),2);
    const inventory=path.join(root,'inventory.json');
    await writeFile(inventory,JSON.stringify({files:Object.keys(files)}));
    const python=process.platform==='win32'?'python':'python3';
    const zipScript=path.resolve('scripts/deterministic_zip.py');
    const zip=name=>execFileSync(python,[zipScript,root,path.join(root,name),'--inventory',inventory],{stdio:'pipe'});
    zip('a.zip'); zip('b.zip');
    assert.equal(sha256(await readFile(path.join(root,'a.zip'))),sha256(await readFile(path.join(root,'b.zip'))));
    const names=execFileSync(python,['-c','import sys,zipfile; print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))',path.join(root,'a.zip')],{encoding:'utf8'}).trim().split(/\r?\n/);
    assert.deepEqual(names,Object.keys(files));
    await writeFile(path.join(root,'source.mjs'),'tampered');
    await assert.rejects(verifyInventory(root,manifest),/MANIFEST_FILE_MISMATCH/);
    await writeFile(inventory,JSON.stringify({files:['../escape']}));
    assert.throws(()=>zip('unsafe.zip'),/UNSAFE_ARCHIVE_PATH/);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('archive member policy refuses traversal, credentials and runtime state', () => {
  for(const name of ['../bad','/absolute','C:/bad','a\\b','a//b','a/./b']) assert.throws(()=>safeMember(name));
  for(const name of ['.env','.env.production','neocities.config.js','private.key','runtime/state.json','release/old.json','x/__pycache__/cache.pyc']) assert.equal(sourceMember(name),false,name);
  for(const name of ['.env.example','scripts/build.mjs','packages/core/src/index.mjs','sample-data/replay.json']) assert.equal(sourceMember(name),true,name);
});
