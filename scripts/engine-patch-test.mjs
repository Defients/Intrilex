import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const upstream=path.join(root,'upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix');
const testDir=path.join(upstream,'dist','test');
let testFiles=[];
try{testFiles=readdirSync(testDir).filter(f=>f.endsWith('.test.js')).map(f=>path.join('dist','test',f));}catch{}
if(testFiles.length===0){console.error('No test files found in',testDir);process.exit(1);}
const result=spawnSync(process.execPath,['--test',...testFiles],{cwd:upstream,stdio:'inherit'});
process.exit(result.status??1);

