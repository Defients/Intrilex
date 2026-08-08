import { readFile } from 'node:fs/promises';
import { loadReleaseIdentity } from '@intrilex/shared/release-identity';
const identity=await loadReleaseIdentity();
const ui=JSON.parse(await readFile('reports/browser-ui-smoke.json','utf8'));
const info=JSON.parse(await readFile('apps/lab-web/dist/BUILD_INFO.json','utf8'));
if(ui.status!=='PASS')throw new Error('BROWSER_UI_REPORT_NOT_PASS');
const rootPkg=JSON.parse(await readFile('package.json','utf8'));
if(info.version!==rootPkg.version||info.engineVersion!==identity.engineVersion||info.rulesVersion!==identity.rulesVersion)throw new Error('BROWSER_UI_BUILD_SCOPE_MISMATCH');
if(ui.campaign?.matchCount!==1||ui.campaign?.abortCount!==0||!String(ui.campaign?.status).startsWith('PASS'))throw new Error('BROWSER_UI_CAMPAIGN_INCOMPLETE');
if(!ui.replay?.checkpointStep||!ui.replay?.playerProjection||!ui.replay?.opponentHandHidden)throw new Error('BROWSER_UI_REPLAY_PROOF_INCOMPLETE');
if(Object.keys(ui.workspaces??{}).length!==11||!Object.values(ui.workspaces).every(Boolean))throw new Error('BROWSER_UI_WORKSPACES_INCOMPLETE');
if(ui.accessibility?.axUnnamedInteractiveNodes!==0||ui.responsive?.length!==4||!ui.reducedMotion)throw new Error('BROWSER_UI_ACCESSIBILITY_OR_RESPONSIVE_INCOMPLETE');
console.log(`BROWSER UI REPORT PASS: workspaces=11; campaign=${ui.campaign.matchCount}; screenshots=${ui.responsive.length+1}`);

