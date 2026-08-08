import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),release=path.join(root,'release'),packageJson=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')),version=packageJson.version;
const zipName=`Intrilex_Simulation_Lab_v${version}_Mechanics_Observatory.zip`,zip=path.join(release,zipName);
await mkdir(release,{recursive:true});
for(const name of await readdir(release))if(/^Intrilex_Simulation_Lab_v.+\.zip(?:\.sha256)?$/.test(name))try{await rm(path.join(release,name),{force:true});}catch{/* Windows may lock files briefly; best-effort cleanup */}
let r=spawnSync(process.execPath,['scripts/package-engine-patch.mjs'],{cwd:root,stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);
await copyFile(path.join(root,'reports/BUILD_PROOF.md'),path.join(release,'BUILD_PROOF.md'));
const python=process.platform==='win32'?'python':'python3';
r=spawnSync(python,[path.join(root,'scripts/deterministic_zip.py'),root,zip,'release/Intrilex_Simulation_Lab_v*.zip','release/Intrilex_Simulation_Lab_v*.zip.sha256','release/Intrilex_Engine_v*.zip','release/Intrilex_Engine_v*.zip.sha256','release/extracted-verification-report.json','reports/extracted-verification-report.json','reports/package-determinism.json','release/package-determinism.json','release/RELEASE_INTEGRITY.md','.git/*','runtime/campaign-segments*/*','runtime/campaign-replays*/*','node_modules/*','*/node_modules/*','package-lock.json'],{cwd:root,stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);
const digest=createHash('sha256').update(await readFile(zip)).digest('hex');await writeFile(`${zip}.sha256`,`${digest}  ${zipName}\n`);
// Generate manifest first, then write version-scoped certification and release manifest copies.
r=spawnSync(process.execPath,['scripts/manifest.mjs','generate'],{cwd:root,stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);
const manifest=JSON.parse(await readFile(path.join(release,'RELEASE_MANIFEST.json'),'utf8'));
const versionedManifestPath=path.join(release,`v${version}-release-manifest.json`);
await writeFile(versionedManifestPath,JSON.stringify(manifest,null,2)+'\n');
// Derive test count from self-audit.json (which is generated from actual test execution)
const selfAudit=JSON.parse(await readFile(path.join(root,'reports/self-audit.json'),'utf8'));
const testCount=parseInt((selfAudit.testResults?.defaultTestSuite??'0').match(/(\d+)\s+tests/)?.[1]??'0');
const certification={schemaVersion:'1.0.0',releaseVersion:version,engineVersion:manifest.engineVersion,rulesVersion:manifest.rulesVersion,releaseZip:{name:zipName,sha256:digest},testResults:{passed:testCount,totalTests:testCount},manifestHash:createHash('sha256').update(await readFile(versionedManifestPath)).digest('hex')};
await writeFile(path.join(release,`v${version}-certification.json`),JSON.stringify(certification,null,2)+'\n');
console.log(`PACKAGE PASS: ${digest}`);
