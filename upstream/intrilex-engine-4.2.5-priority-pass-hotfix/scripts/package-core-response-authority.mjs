import {createHash} from 'node:crypto';
import {copyFile,mkdir,readFile,rename,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const release=path.join(root,'release');
const zipName='Intrilex_Engine_v4.2.2_Core_Response_Authority.zip';
const zipPath=path.join(release,zipName);
const temp=`${zipPath}.tmp`;
function run(c,a){
  const r=spawnSync(c,a,{cwd:root,stdio:'inherit',env:{...process.env,SOURCE_DATE_EPOCH:'0'}});
  if(r.error) throw r.error;
  if(r.status!==0) process.exit(r.status??1);
}
await mkdir(release,{recursive:true});
await rm(temp,{force:true});
run('npm',['run','build']);
run('node',['scripts/core-response-integrity.mjs','generate']);
run('node',['scripts/core-response-integrity.mjs','verify']);
run('python3',['scripts/create-core-response-deterministic-zip.py',root,temp]);
await rename(temp,zipPath);
const bytes=await readFile(zipPath);
const digest=createHash('sha256').update(bytes).digest('hex');
await writeFile(`${zipPath}.sha256`,`${digest}  ${zipName}\n`);
const copies=[
  ['CORE_RESPONSE_AUTHORITY_MANIFEST.json','CORE_RESPONSE_AUTHORITY_MANIFEST.json'],
  ['reports/BUILD_PROOF_4.2.2.md','BUILD_PROOF.md'],
  ['reports/CORE_RESPONSE_AUTHORITY_CERTIFICATION.md','CORE_RESPONSE_AUTHORITY_CERTIFICATION.md'],
  ['reports/CORE_RESPONSE_AUTHORITY_CERTIFICATION.json','CORE_RESPONSE_AUTHORITY_CERTIFICATION.json'],
  ['reports/CAPABILITY_MANIFEST_4.2.2.json','CAPABILITY_MANIFEST_4.2.2.json'],
  ['reports/browser-core-response-parity.json','browser-core-response-parity.json'],
  ['reports/core-response-authority-stress-500.json','core-response-authority-stress-500.json'],
  ['docs/CORE_RESPONSE_AUTHORITY.md','CORE_RESPONSE_AUTHORITY.md']
];
for(const [s,t] of copies) await copyFile(path.join(root,s),path.join(release,t));
console.log(`RELEASE PACKAGE PASS: ${zipName}; sha256=${digest}; bytes=${bytes.length}`);
