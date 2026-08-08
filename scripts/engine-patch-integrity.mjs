import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix');
const mode=process.argv[2]??'verify';
const result=spawnSync(process.execPath,['scripts/priority-pass-integrity.mjs',mode],{cwd:source,stdio:'inherit',env:{...process.env,SOURCE_DATE_EPOCH:'1577836800'}});
if(result.status!==0)process.exit(result.status??1);
const manifest=JSON.parse(await readFile(path.join(source,'PRIORITY_PASS_HOTFIX_MANIFEST.json'),'utf8'));
if(mode==='verify'){
  const report={schemaVersion:'3.0.0',status:'PASS',source:'upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix',version:manifest.version,rulesVersion:manifest.rulesVersion,fileCount:manifest.fileCount,payloadHash:manifest.payloadHash,base:{version:manifest.certifiedBaseVersion},legacyProtocolConformance:{fixtureCount:manifest.legacyProtocolFixtureCount,aggregate:manifest.historicalV411ConformanceAggregate},semanticHotfixFixtureCount:manifest.semanticHotfixFixtureCount,manifest:'upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix/PRIORITY_PASS_HOTFIX_MANIFEST.json',sha256Sums:'upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix/PRIORITY_PASS_HOTFIX_SHA256SUMS'};
  if(process.env.INTRILEX_WRITE_REPORTS!=='0')await writeFile(path.join(root,'reports/engine-patch-integrity.json'),JSON.stringify(report,null,2)+'\n');
}

