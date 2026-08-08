import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifestPath=path.join(root,'PRIORITY_PASS_HOTFIX_MANIFEST.json');
const sumsPath=path.join(root,'PRIORITY_PASS_HOTFIX_SHA256SUMS');
const excludedTop=new Set(['node_modules','release','.git']);
const excludedExact=new Set(['PRIORITY_PASS_HOTFIX_MANIFEST.json','PRIORITY_PASS_HOTFIX_SHA256SUMS']);
const sha256=b=>createHash('sha256').update(b).digest('hex');
async function collect(dir=root,prefix=''){const rows=[];const entries=await readdir(dir,{withFileTypes:true});entries.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);for(const entry of entries){const rel=prefix?`${prefix}/${entry.name}`:entry.name;if(!prefix&&excludedTop.has(entry.name))continue;if(excludedExact.has(rel)||rel.endsWith('.log')||rel.endsWith('.tmp')||/^reports\/core-(advanced|private|response)-segment-/.test(rel))continue;const abs=path.join(dir,entry.name);const st=await lstat(abs);if(st.isSymbolicLink())throw new Error(`Manifest refuses symlink: ${rel}`);if(st.isDirectory())rows.push(...await collect(abs,rel));else if(st.isFile()){const bytes=await readFile(abs);rows.push({path:rel,size:bytes.length,sha256:sha256(bytes)});}}return rows;}
const payloadHash=files=>sha256(Buffer.from(JSON.stringify(files),'utf8'));
const mode=process.argv[2];if(!['generate','verify'].includes(mode))throw new Error('usage: node scripts/priority-pass-integrity.mjs generate|verify');const actual=await collect();
if(mode==='generate'){
 const manifest={schemaVersion:'1.0',artifact:'Intrilex Engine v4.2.5 — Priority and Pass Canon Hotfix',package:'@intrilex/headless-engine',version:'4.2.5',rulesVersion:'4.1.2',certifiedBaseVersion:'4.1.0',governingInterruptHotfixVersion:'4.1.1',historicalV411ConformanceAggregate:'8c91e8194e7fa3ab6bbb3eaa6946a97efd70343c36d5e5953ee8e1c0357013df',legacyProtocolFixtureCount:121,semanticHotfixFixtureCount:25,fileCount:actual.length,payloadHash:payloadHash(actual),files:actual,generatedAt:'2020-01-01T00:00:00.000Z'};
 await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');await writeFile(sumsPath,actual.map(r=>`${r.sha256}  ${r.path}`).join('\n')+'\n');console.log(`PRIORITY/PASS MANIFEST GENERATED: files=${actual.length}; payload=${manifest.payloadHash}`);
}else{const manifest=JSON.parse(await readFile(manifestPath,'utf8'));if(manifest.version!=='4.2.5'||manifest.rulesVersion!=='4.1.2')throw new Error('Manifest version/rules mismatch');if(manifest.fileCount!==actual.length)throw new Error(`Manifest count mismatch: ${manifest.fileCount} != ${actual.length}`);const hash=payloadHash(actual);if(manifest.payloadHash!==hash)throw new Error(`Manifest payload mismatch: ${manifest.payloadHash} != ${hash}`);if(JSON.stringify(manifest.files)!==JSON.stringify(actual))throw new Error('Manifest records differ');const expected=actual.map(r=>`${r.sha256}  ${r.path}`).join('\n')+'\n';if(await readFile(sumsPath,'utf8')!==expected)throw new Error('SHA sums mismatch');console.log(`PRIORITY/PASS MANIFEST PASS: files=${actual.length}; payload=${hash}`);}
