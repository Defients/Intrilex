import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { captureProvenance, releaseAuditProblems } from './release-provenance.mjs';
import { sourceInventory, inventoryHash, sha256, verifyInventory } from './release-inventory.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'reports/release/artifacts');
const embedded=path.join(root,'release/RELEASE_MANIFEST.json');
const manifestPath=existsSync(path.join(root,'.git')) ? path.join(output,'RELEASE_MANIFEST.json') : embedded;
const mode=process.argv[2];
if(mode==='generate') {
  const provenance=captureProvenance(root);
  const auditBytes=await readFile(path.join(root,'reports/release/self-audit.json'));
  const audit=JSON.parse(auditBytes);
  const problems=releaseAuditProblems(audit,provenance);
  if(problems.length) throw new Error(problems.join(' '));
  const packageJson=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
  const identity=JSON.parse(await readFile(path.join(root,'config/release-identity.json'),'utf8'));
  const files=await sourceInventory(root);
  files['reports/release/self-audit.json']=sha256(auditBytes);
  const manifest={manifestVersion:4,package:packageJson.name,version:packageJson.version,
    engineVersion:identity.engineVersion,rulesVersion:identity.rulesVersion,
    telemetrySchemaVersion:identity.telemetrySchemaVersion,analyticsSchemaVersion:identity.analyticsSchemaVersion,
    provenance,verdict:'PASS',verdictScope:'LOCAL_ENGINEERING_RELEASE_CANDIDATE',
    verdictSource:'reports/release/self-audit.json',files,payloadHash:inventoryHash(files)};
  await mkdir(output,{recursive:true});
  await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  console.log(`MANIFEST GENERATED: ${Object.keys(files).length} files; payload=${manifest.payloadHash}`);
} else if(mode==='verify') {
  const before=await readFile(manifestPath),manifest=JSON.parse(before);
  const count=await verifyInventory(root,manifest);
  const audit=JSON.parse(await readFile(path.join(root,manifest.verdictSource),'utf8'));
  // Extracted artifacts have no Git metadata: verify their immutable attestation,
  // then exact payload bytes. A checkout additionally requires current Git binding.
  const current=existsSync(path.join(root,'.git')) ? captureProvenance(root) : manifest.provenance;
  const problems=releaseAuditProblems(audit,current);
  if(problems.length || manifest.verdict!=='PASS') throw new Error('MANIFEST_ATTESTATION_FAIL: '+problems.join(' '));
  if(!(await readFile(manifestPath)).equals(before)) throw new Error('MANIFEST_VERIFY_MUTATED_FILE');
  console.log(`MANIFEST PASS: ${count} files; payload=${manifest.payloadHash}`);
} else {console.error('usage: manifest.mjs generate|verify');process.exitCode=2;}
