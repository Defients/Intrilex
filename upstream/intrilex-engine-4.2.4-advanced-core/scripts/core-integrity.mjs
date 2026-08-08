import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'CORE_AUTHORITY_MANIFEST.json');
const sumsPath = path.join(root, 'CORE_AUTHORITY_SHA256SUMS');
const excludedTop = new Set(['node_modules', 'release', '.git']);
const excludedExact = new Set(['CORE_AUTHORITY_MANIFEST.json', 'CORE_AUTHORITY_SHA256SUMS']);
const sha256 = b => createHash('sha256').update(b).digest('hex');
async function collect(directory=root,prefix=''){
 const rows=[]; const entries=await readdir(directory,{withFileTypes:true}); entries.sort((a,b)=>a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
 for(const entry of entries){const rel=prefix?`${prefix}/${entry.name}`:entry.name;if(!prefix&&excludedTop.has(entry.name))continue;if(excludedExact.has(rel)||rel.endsWith('.log')||rel.endsWith('.tmp'))continue;const abs=path.join(directory,entry.name);const stat=await lstat(abs);if(stat.isSymbolicLink())throw new Error(`Manifest refuses symlink: ${rel}`);if(stat.isDirectory())rows.push(...await collect(abs,rel));else if(stat.isFile()){const bytes=await readFile(abs);rows.push({path:rel,size:bytes.length,sha256:sha256(bytes)});}}
 return rows;
}
const payloadHash=files=>sha256(Buffer.from(JSON.stringify(files),'utf8'));
const mode=process.argv[2]; if(!['generate','verify'].includes(mode))throw new Error('usage: node scripts/core-integrity.mjs generate|verify');
const actual=await collect();
if(mode==='generate'){
 const manifest={schemaVersion:'1.0',artifact:'Intrilex Engine v4.2.0 — Core Foundation Authority',package:'@intrilex/headless-engine',version:'4.2.0',rulesVersion:'4.1',baseCertifiedVersion:'4.1.0',basePayloadHash:'707377ea9fa94f449c293b6a4dcd8dc4b40dd058bcd6f9e5dd874339859cf168',preservedConformanceAggregate:'05f67133eab3f8e92d526db17b25407842204e0eeea3a605bd417d0479805547',fileCount:actual.length,payloadHash:payloadHash(actual),files:actual,generatedAt:'2020-01-01T00:00:00.000Z'};
 await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n'); await writeFile(sumsPath,actual.map(r=>`${r.sha256}  ${r.path}`).join('\n')+'\n'); console.log(`CORE MANIFEST GENERATED: files=${actual.length}; payload=${manifest.payloadHash}`);
}else{
 const manifest=JSON.parse(await readFile(manifestPath,'utf8'));if(manifest.version!=='4.2.0')throw new Error(`Manifest version mismatch: ${manifest.version}`);if(manifest.fileCount!==actual.length)throw new Error(`Manifest file count mismatch: expected ${manifest.fileCount}, actual ${actual.length}`);const hash=payloadHash(actual);if(manifest.payloadHash!==hash)throw new Error(`Manifest payload mismatch: expected ${manifest.payloadHash}, actual ${hash}`);if(JSON.stringify(manifest.files)!==JSON.stringify(actual))throw new Error('Manifest file records differ');const expected=actual.map(r=>`${r.sha256}  ${r.path}`).join('\n')+'\n';if(await readFile(sumsPath,'utf8')!==expected)throw new Error('SHA sums mismatch');console.log(`CORE MANIFEST PASS: files=${actual.length}; payload=${hash}`);
}
