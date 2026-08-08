import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = path.join(root, 'release');
const zipName = 'Intrilex_Engine_v4.1.5_First_Contact_Trigger_Closure.zip';
const zipPath = path.join(release, zipName);
const tempZip = `${zipPath}.tmp`;
function run(command, args, env = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
await mkdir(release, { recursive: true });
await rm(tempZip, { force: true });
run('npm', ['run', 'build']);
run('npm', ['run', 'patch:manifest:generate']);
run('npm', ['run', 'patch:manifest:verify']);
run('python3', ['scripts/create-deterministic-zip.py', root, tempZip]);
await rename(tempZip, zipPath);
const bytes = await readFile(zipPath);
const digest = createHash('sha256').update(bytes).digest('hex');
await writeFile(`${zipPath}.sha256`, `${digest}  ${zipName}\n`);
const copies = [
  ['TRIGGER_CLOSURE_AUTHORITY_MANIFEST.json','TRIGGER_CLOSURE_AUTHORITY_MANIFEST.json'],
  ['reports/BUILD_PROOF_4.1.5.md','BUILD_PROOF.md'],
  ['reports/TRIGGER_CLOSURE_CERTIFICATION.md','TRIGGER_CLOSURE_CERTIFICATION.md'],
  ['reports/TRIGGER_CLOSURE_CERTIFICATION.json','TRIGGER_CLOSURE_CERTIFICATION.json'],
  ['reports/CAPABILITY_MANIFEST_4.1.5.json','CAPABILITY_MANIFEST_4.1.5.json'],
  ['reports/browser-trigger-closure-parity.json','browser-trigger-closure-parity.json'],
  ['reports/trigger-closure-authority-stress-500.json','trigger-closure-authority-stress-500.json'],
  ['docs/FIRST_CONTACT_TRIGGER_CLOSURE.md','FIRST_CONTACT_TRIGGER_CLOSURE.md']
];
for (const [source,target] of copies) await copyFile(path.join(root,source),path.join(release,target));
console.log(`RELEASE PACKAGE PASS: ${zipName}; sha256=${digest}; bytes=${bytes.length}`);
