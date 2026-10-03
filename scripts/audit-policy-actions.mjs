import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { policyActionInventory } from './lib/policy-action-inventory.mjs';
import { evolutionIdentity } from './evolution-identity.mjs';
import { ACTION_FIXTURES,actionFixture } from '../packages/policies/test/action-fixtures.mjs';
import { createSimulationDecisionFrame,strictPolicyView,executeSimulationAction } from '../packages/engine-adapter/src/adapter.mjs';
import { DeterministicPolicyRng } from '../packages/policy-sdk/src/contracts.mjs';
import { POLICY_CATALOG } from '../packages/simulation-runtime/src/policy-catalog.mjs';
import { runPolicyMatch,isCanonicalTermination } from '../packages/simulation-runtime/src/runtime.mjs';
import { evaluateAction } from '../packages/policies/src/action-evaluation.mjs';
import { baselinePolicyState,chooseWeightedAction } from '../packages/policies/src/weighted-heuristic.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const started=performance.now(),inventory=await policyActionInventory(),observed=new Map(),fixtures=[];
assert.deepEqual(inventory.filter(r=>!r.classified||!r.purpose),[],'Unclassified authority declaration');
const browser=await import('../apps/lab-web/dist/autonomy-runtime.js');
let executableChoices=0,parityChoices=0,candidateCount=0;
for(const fixture of ACTION_FIXTURES){
  const frame=createSimulationDecisionFrame(actionFixture(fixture));assert.equal(frame.status,'PLAYER_DECISION_REQUIRED');
  const context={actorId:frame.decisionActorId,authorizedView:strictPolicyView(frame.state,frame.decisionActorId),legalActions:frame.policyActions,matchId:`audit-${fixture.name}`,runInstanceId:'policy-action-audit',decisionIndex:0,rng:new DeterministicPolicyRng(1337)};
  for(const action of frame.policyActions){
    const value=evaluateAction(action,context);assert.ok(value.supported&&value.modeSupported,`${action.family}:${action.mode}`);
    for(const key of ['gain','removed','ownLoss','utility','cost'])assert.ok(Number.isFinite(value[key]),`${action.actionId}:${key}`);
    const key=`${action.family}:${action.mode}`;observed.set(key,{family:action.family,mode:action.mode,purpose:value.purpose,fixtures:[...new Set([...(observed.get(key)?.fixtures??[]),fixture.name])]});candidateCount++;
  }
  const selections=[];
  for(const policy of POLICY_CATALOG){
    context.rng=new DeterministicPolicyRng(1337);
    const selected=policy.choose(context),action=frame.policyActions.find(a=>a.actionId===selected.actionId);
    assert.ok(action);assert.ok(executeSimulationAction(frame.state,frame.resolve(action.actionId)).accepted);executableChoices++;
    const browserSelection=browser.choosePolicy(policy.policyId,{...context,rng:new DeterministicPolicyRng(1337),authorizedView:browser.strictView(frame.state,context.actorId)});
    assert.equal(browserSelection.actionId,selected.actionId,`${fixture.name}:${policy.policyId}`);parityChoices++;
    selections.push({policyId:policy.policyId,version:policy.version,family:action.family,mode:action.mode});
  }
  const weighted=chooseWeightedAction(baselinePolicyState(),context);assert.ok(executeSimulationAction(frame.state,frame.resolve(weighted.actionId)).accepted);executableChoices++;
  fixtures.push({name:fixture.name,profileId:frame.state.metadata.coreAuthority.profileId,actorId:context.actorId,candidateCount:frame.policyActions.length,selections});
}

const previous=process.argv.includes('--fixtures-only')?JSON.parse(await readFile(path.join(root,'reports/POLICY_ACTION_COVERAGE.json'),'utf8')):null;
if(previous)assert.equal(previous.identity.fingerprint,(await evolutionIdentity()).fingerprint,'INTEGRATION_EVIDENCE_STALE');
const games=previous?.games??[],opportunities={...(previous?.opportunityCounts??{})},selected={...(previous?.selectionCounts??{})};
// Small, held-out, seat-paired integration campaign. These results certify
// completion and profile interoperability; the sample is not a strength ranking.
if(!previous)for(const [index,policy]of POLICY_CATALOG.entries())for(const swapped of [false,true]){
  const policyIds=swapped?['score-rush-tactical',policy.policyId]:[policy.policyId,'score-rush-tactical'];
  const match=runPolicyMatch({profileId:'core-advanced-authority',seed:7331+index,policyIds,seatOrder:['P1','P2'],decisionLimit:3600,runInstanceId:`policy-action-audit-${index}-${Number(swapped)}`});
  assert.ok(isCanonicalTermination(match.summary.terminationReason),`${policy.policyId}:${match.summary.terminationReason}`);
  for(const seat of Object.values(match.summary.perSeatStats??{})){
    for(const [key,count]of Object.entries(seat.actionCoverage?.opportunities??{}))opportunities[key]=(opportunities[key]??0)+count;
    for(const [key,count]of Object.entries(seat.actionCoverage?.selected??{}))selected[key]=(selected[key]??0)+count;
  }
  games.push({seed:7331+index,swapped,policyIds,winner:match.summary.winner,terminationReason:match.summary.terminationReason,decisions:match.summary.policyDecisionCount,resultHash:match.summary.matchResultHash});
}
const families=[...new Set(inventory.map(r=>r.family))].sort();
const observedFamilies=[...new Set([...observed.values()].map(r=>r.family))].sort();
const unobservedFamilies=families.filter(f=>!observedFamilies.includes(f));
const report={schemaVersion:1,status:'PASS',generatedAt:new Date().toISOString(),integrationGeneratedAt:previous?.integrationGeneratedAt??previous?.generatedAt??new Date().toISOString(),integrationReused:Boolean(previous),identity:await evolutionIdentity(),policies:POLICY_CATALOG.map(p=>({policyId:p.policyId,version:p.version})),
  counts:{declarationSites:inventory.length,potentialFamilies:families.length,observedFamilies:observedFamilies.length,observedModes:observed.size,fixtures:fixtures.length,candidateCount,executableChoices,parityChoices,pairedGames:games.length},
  inventory,observed:[...observed.values()],unobservedFamilies,fixtures,games,opportunityCounts:opportunities,selectionCounts:selected,elapsedMs:Math.round(performance.now()-started),
  limits:['Authority declarations are classified; this does not prove every state/target permutation has been executed.','effect-board-lock is a legacy Mini-Turn declaration rejected by current authority; Quick Board Lock is the reachable path.','Legacy v2 baselines and weighted-heuristic-v1 retain their original scoring contracts.','Opportunity counts describe legal decision windows. Selected declarations are not guaranteed resolutions.','No optimal-play or general strength claim follows from this bounded integration campaign.']};
const lines=['# Profile action wiring audit','',`Status: **${report.status}**. Generated: ${report.generatedAt}.`,'',
  `${inventory.length} authority declaration sites; ${families.length} potential families; ${observedFamilies.length} families and ${observed.size} modes observed in ${fixtures.length} constructed authority frames.`,
  `${executableChoices} selected actions executed successfully; ${parityChoices} Node/browser choices agree. ${games.length} held-out seat-paired games completed canonically.`,
  '',`Implementation fingerprint: \`${report.identity.fingerprint}\`.`,
  '','## Repairs','',
  '- Optional Start actions compete with phase advancement; face-down swaps preserve valuable recipes and immediate winning cards.',
  '- Face-up swaps use the actual face-up-draw mode and known card/recipe value.',
  '- Private takes, ordered assignments, discard costs, return order and generated effects use their actual roles.',
  '- Seven exposes advanced generated plays already accepted by the engine resolver.',
  '- Public effect targets, copied effects, whole-board losses, goal shifts, usable tempo, premium responses and Stack Theft receive contextual estimates.',
  '- HybriX uses current engine modes and authorized hand/row/stack schemas.',
  '- Lab reports available and selected windows by family, mode, timing, Super and Ultra; old runs have unavailable coverage.',
  '- Tactical versions are 4.0.0 and HybriX versions are 2.0.0. Implementation fingerprints invalidate stale campaign caches.',
  '','## Coverage boundaries','',...report.limits.map(s=>`- ${s}`),
  '','## Family inventory','', '| Family | Purpose | Declaration sites | Observed modes |','| --- | --- | ---: | ---: |',
  ...families.map(f=>`| ${f} | ${inventory.find(r=>r.family===f).purpose} | ${inventory.filter(r=>r.family===f).length} | ${[...observed.values()].filter(r=>r.family===f).length} |`),
  '','## Reproduce','', '```powershell','pnpm run build','pnpm run audit:policy-actions','pnpm run test:evolution','```','',
  'The companion JSON contains every declaration source/line, mode sample, fixture selection, integration result and opportunity count.',''];
await mkdir(path.join(root,'reports'),{recursive:true});
await writeFile(path.join(root,'reports/POLICY_ACTION_COVERAGE.json'),JSON.stringify(report,null,2)+'\n');
await writeFile(path.join(root,'reports/POLICY_ACTION_COVERAGE.md'),lines.join('\n'));
console.log(JSON.stringify({status:report.status,...report.counts,unobservedFamilies,elapsedMs:report.elapsedMs}));
