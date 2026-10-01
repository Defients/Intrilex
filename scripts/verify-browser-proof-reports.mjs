import { captureProvenance, evidenceProvenanceProblems } from './release-provenance.mjs';
import { readFile } from 'node:fs/promises';
const ui=JSON.parse(await readFile('reports/local/browser-ui-smoke.json','utf8'));
const parity=JSON.parse(await readFile('reports/local/browser-parity.json','utf8'));
for(const report of [ui,parity]) {const problems=evidenceProvenanceProblems(report,captureProvenance(process.cwd()));if(problems.length) throw new Error('STALE_BROWSER_EVIDENCE: '+problems.join(' '));}
const info=JSON.parse(await readFile('apps/lab-web/dist/BUILD_INFO.json','utf8'));
if(ui.status!=='PASS')throw new Error('BROWSER_UI_REPORT_NOT_PASS');
if(parity.status!=='PASS')throw new Error('BROWSER_PARITY_REPORT_NOT_PASS');
if(parity.profileId!=='core-advanced-authority'||parity.engineVersion!==info.engineVersion||parity.rulesVersion!==info.rulesVersion)throw new Error('BROWSER_PARITY_SCOPE_MISMATCH');
if(parity.certifiedReplayCount<121||!Object.values(parity.parity).every(Boolean))throw new Error('BROWSER_PARITY_EVIDENCE_INCOMPLETE');
if(ui.campaign?.matchCount!==1||ui.campaign?.abortCount!==0||!String(ui.campaign?.status).startsWith('PASS'))throw new Error('BROWSER_UI_CAMPAIGN_INCOMPLETE');
console.log(`BROWSER PROOF REPORTS PASS: replays=${parity.certifiedReplayCount}; uiCampaign=${ui.campaign.matchCount}`);
