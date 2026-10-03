import { cp, rm } from 'node:fs/promises';
import { withRetry } from './lib/write-with-retry.mjs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const upstream=path.join(root,'upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix');
const compiler=path.join(root,'node_modules/.bin/tsc');
// Clean dist directory before compilation to ensure deterministic output
await rm(path.join(upstream,'dist'),{recursive:true,force:true,maxRetries:10,retryDelay:250});
const build=spawnSync(compiler,['-p',path.join(upstream,'tsconfig.json')],{cwd:upstream,stdio:'inherit',shell:true});
if(build.status!==0)process.exit(build.status??1);
const runtime=path.join(root,'runtime/autonomy-engine-dist');
await rm(runtime,{recursive:true,force:true,maxRetries:10,retryDelay:250});
await withRetry(()=>cp(path.join(upstream,'dist'),runtime,{recursive:true}));
console.log(`ENGINE PATCH BUILD PASS: ${runtime}`);
