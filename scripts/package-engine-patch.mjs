import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),source=path.join(root,'upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix'),release=path.join(root,'release');
const name='Intrilex_Engine_v4.2.6_Attachment_Integrity_Hotfix.zip',zip=path.join(release,name);
await mkdir(release,{recursive:true});for(const entry of await readdir(release)){if(/^Intrilex_Engine_v.+\.zip(?:\.sha256)?$/.test(entry))await rm(path.join(release,entry),{force:true});}
let result=spawnSync(process.execPath,['scripts/engine-patch-integrity.mjs','verify'],{cwd:root,stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);
const python=process.platform==='win32'?'python':'python3';
result=spawnSync(python,[path.join(root,'scripts/deterministic_zip.py'),source,zip,'dist/*','node_modules/*','release/*','.git/*'],{cwd:root,stdio:'inherit',shell:true});if(result.status!==0)process.exit(result.status??1);
const digest=createHash('sha256').update(await readFile(zip)).digest('hex');await writeFile(`${zip}.sha256`,`${digest}  ${name}\n`);console.log(`ENGINE PATCH PACKAGE PASS: ${digest}`);


