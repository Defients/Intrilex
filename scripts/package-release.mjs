import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureProvenance, releaseProvenanceProblems, evidenceProvenanceProblems, releaseAuditProblems } from './release-provenance.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),release=path.join(root,'reports/release/artifacts'),packageJson=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')),version=packageJson.version;
const provenance = captureProvenance(root);
const preflightProblems = releaseProvenanceProblems(provenance);
let selfAudit;
try { selfAudit = JSON.parse(await readFile(path.join(root, 'reports/release/self-audit.json'), 'utf8')); }
catch { preflightProblems.push('Run self-audit:release on this clean commit before packaging.'); }
if (selfAudit) {
  preflightProblems.push(...releaseAuditProblems(selfAudit, provenance));
}
if (preflightProblems.length) { console.error(preflightProblems.join('\n')); process.exit(1); }
const zipName=`Intrilex_Simulation_Lab_v${version}_Mechanics_Observatory.zip`,zip=path.join(release,zipName);
await mkdir(release,{recursive:true});
for(const name of await readdir(release))if(/^Intrilex_Simulation_Lab_v.+\.zip(?:\.sha256)?$/.test(name))try{await rm(path.join(release,name),{force:true});}catch{/* Windows may lock files briefly; best-effort cleanup */}
// SEC-01: Secret containment scan — fail-closed before packaging.
// No secrets, tokens, or private keys may be present in tracked files or artifacts.
let r=spawnSync(process.execPath,['scripts/secret-containment-scan.mjs'],{cwd:root,stdio:'inherit',env:{...process.env,INTRILEX_WRITE_REPORTS:'0'}});if(r.status!==0){console.error('SEC-01 FAIL: secret containment scan failed — refusing to package release');process.exit(r.status??1);}
r=spawnSync(process.execPath,['scripts/package-engine-patch.mjs'],{cwd:root,stdio:'inherit',env:{...process.env,INTRILEX_WRITE_REPORTS:'0'}});if(r.status!==0)process.exit(r.status??1);
// Build proof remains historical; the current full audit is embedded explicitly.
// IRX-C05: Generate manifest BEFORE creating ZIP so it is embedded in the archive.
// Previously the manifest was generated after the ZIP, so it was never in the archive,
// making the extracted-verification step fail to find it.
r=spawnSync(process.execPath,['scripts/manifest.mjs','generate'],{cwd:root,stdio:'inherit',env:{...process.env,INTRILEX_WRITE_REPORTS:'0'}});if(r.status!==0)process.exit(r.status??1);
const python=process.platform==='win32'?'python':'python3';
// IRX-M31: sourceInventory owns exclusion of generated reports such as
// reports/browser-ui-smoke.json and apps/lab-web/dist/*, credentials and runtime.
// BLOAT_EXCLUSIONS are enforced by the shared member policy, not a second walker.
const archiveManifest=JSON.parse(await readFile(path.join(release,'RELEASE_MANIFEST.json'),'utf8'));
const inventory={files:Object.keys(archiveManifest.files),overlays:{'release/RELEASE_MANIFEST.json':path.join(release,'RELEASE_MANIFEST.json')}};
const inventoryPath=path.join(release,'archive-inventory.json');
await writeFile(inventoryPath,JSON.stringify(inventory));
r=spawnSync(python,[path.join(root,'scripts/deterministic_zip.py'),root,zip,'--inventory',inventoryPath],{cwd:root,stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);
// IRX-C01: Post-zip secret scan — verify no secrets leaked into the final archive.
r=spawnSync(process.execPath,['scripts/scan-archive-secrets.mjs',zip],{cwd:root,stdio:'inherit',env:{...process.env,INTRILEX_WRITE_REPORTS:'0'}});if(r.status!==0){console.error('SEC-01 FAIL: secret detected in release archive — refusing to package');process.exit(r.status??1);}
const digest=createHash('sha256').update(await readFile(zip)).digest('hex');await writeFile(`${zip}.sha256`,`${digest}  ${zipName}\n`);
// IRX-C05: Manifest was already generated before ZIP creation (embedded in archive).
// Now read it for certification binding.
const manifest=JSON.parse(await readFile(path.join(release,'RELEASE_MANIFEST.json'),'utf8'));
const versionedManifestPath=path.join(release,`v${version}-release-manifest.json`);
await writeFile(versionedManifestPath,JSON.stringify(manifest,null,2)+'\n');
// IRX-M26: Derive ACTUAL pass/fail/skip/cancelled counts from self-audit.json.
// Previously this fabricated passed=totalTests (always 100% pass) by parsing only
// the test count from a report string. Now we use the real counts from the audit.
const tr=selfAudit.testResults??{};
const totalTests=tr.totalTests??0;
const totalPass=tr.totalPass??0;
const totalFail=tr.totalFail??0;
const totalSkip=tr.totalSkip??0;
const totalCancelled=tr.totalCancelled??0;
// IRX-M26: Refuse to certify a release with any test failures.
if(totalFail>0){console.error(`CERTIFICATION FAIL: ${totalFail} test failure(s) in self-audit — refusing to certify release`);process.exit(1);}
const finalProblems = evidenceProvenanceProblems(selfAudit, captureProvenance(root));
if (finalProblems.length) { console.error('Packaging changed the certified source tree: ' + finalProblems.join(' ')); process.exit(1); }
const certification={provenance,schemaVersion:'1.0.0',releaseVersion:version,engineVersion:manifest.engineVersion,rulesVersion:manifest.rulesVersion,releaseZip:{name:zipName,sha256:digest},testResults:{passed:totalPass,totalTests,failed:totalFail,skipped:totalSkip,cancelled:totalCancelled},manifestHash:createHash('sha256').update(await readFile(versionedManifestPath)).digest('hex')};
await writeFile(path.join(release,`v${version}-certification.json`),JSON.stringify(certification,null,2)+'\n');
console.log(`PACKAGE PASS: ${digest}`);
