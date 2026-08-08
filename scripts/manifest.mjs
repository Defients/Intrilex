import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashCanonical } from '@intrilex/shared';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifestPath=path.join(root,'release/RELEASE_MANIFEST.json');
const packageJson=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const identity=JSON.parse(await readFile(path.join(root,'config/release-identity.json'),'utf8'));
const releaseZipName=`Intrilex_Simulation_Lab_v${packageJson.version}_Mechanics_Observatory.zip`;
const mode=process.argv[2];
const skip=rel=>rel==='release/RELEASE_MANIFEST.json'||rel==='release/extracted-verification-report.json'||rel==='reports/extracted-verification-report.json'||rel==='reports/package-determinism.json'||rel==='release/package-determinism.json'||rel==='release/RELEASE_INTEGRITY.md'||(/^release\/Intrilex_Simulation_Lab_v/.test(rel)&&(rel.endsWith('.zip')||rel.endsWith('.zip.sha256')))||(/^release\/Intrilex_Engine_v/.test(rel)&&(rel.endsWith('.zip')||rel.endsWith('.zip.sha256')))||(/^release\/v[\d.]+-(release-manifest|certification)\.json$/.test(rel))||(/\/_[^/]+$/.test(rel))||rel==='.git'||rel.startsWith('.git/')||rel==='node_modules'||rel.startsWith('node_modules/')||rel.includes('/node_modules/')||/^runtime\/campaign-(segments|replays)/.test(rel)||rel.startsWith('release/extracted-verification/')||rel.startsWith('release/archives/');
async function walk(dir){let out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name),rel=path.relative(root,p).replaceAll('\\','/');if(skip(rel))continue;if(e.isDirectory())out=out.concat(await walk(p));else if(e.isFile())out.push(rel);}return out.sort((a,b)=>a<b?-1:a>b?1:0);}
async function compute(){const files={};for(const rel of await walk(root))files[rel]=createHash('sha256').update(await readFile(path.join(root,rel))).digest('hex');const core={manifestVersion:2,package:packageJson.name,version:packageJson.version,releaseZipName,engineVersion:identity.engineVersion,rulesVersion:identity.rulesVersion,telemetrySchemaVersion:identity.telemetrySchemaVersion,analyticsSchemaVersion:identity.analyticsSchemaVersion,verdict:'PASS',verdictScope:'MECHANICS_OBSERVATORY_WITH_PRIORITY_PASS_CANON_HOTFIX',certifiedBaseVersion:identity.coreSchemaVersion,files};return{...core,payloadHash:hashCanonical(files)};}
if(mode==='generate'){const m=await compute();await writeFile(manifestPath,JSON.stringify(m,null,2)+'\n');console.log(`MANIFEST GENERATED: ${Object.keys(m.files).length} files; payload=${m.payloadHash}`);}else if(mode==='verify'){const before=await readFile(manifestPath),expected=JSON.parse(before),actual=await compute();if(hashCanonical(expected)!==hashCanonical(actual))throw new Error('MANIFEST_VERIFY_FAIL');if(!(await readFile(manifestPath)).equals(before))throw new Error('MANIFEST_VERIFY_MUTATED_FILE');console.log(`MANIFEST PASS: ${Object.keys(actual.files).length} files; payload=${actual.payloadHash}`);}else{console.error('usage: manifest.mjs generate|verify');process.exit(2);}

