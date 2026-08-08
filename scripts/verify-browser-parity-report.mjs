import { readFile } from 'node:fs/promises';
const parity=JSON.parse(await readFile('reports/browser-parity.json','utf8'));
const info=JSON.parse(await readFile('apps/lab-web/dist/BUILD_INFO.json','utf8'));
if(parity.status!=='PASS')throw new Error('BROWSER_PARITY_REPORT_NOT_PASS');
if(parity.labVersion!==info.version||parity.engineVersion!==info.engineVersion||parity.rulesVersion!==info.rulesVersion)throw new Error('BROWSER_PARITY_BUILD_SCOPE_MISMATCH');
if(parity.profileId!=='core-advanced-authority'||parity.certifiedReplayCount<121)throw new Error('BROWSER_PARITY_SCOPE_INCOMPLETE');
if(!Object.values(parity.parity).every(Boolean))throw new Error('BROWSER_PARITY_FALSE');
console.log(`BROWSER PARITY REPORT PASS: replays=${parity.certifiedReplayCount}; hash=${parity.mainThread.aggregateHash}`);
