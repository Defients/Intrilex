/* global document, window, indexedDB */
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { runLabSeries, evolutionIdentity } from '../packages/simulation-runtime/src/evolution-lab.mjs';
import { strategyGameEvidence } from '../packages/simulation-runtime/src/strategy-evidence.mjs';
import { createSimulationState, createSimulationDecisionFrame, executeSimulationAction, strictPolicyView } from '@intrilex/engine-adapter';
import { validateCheckpoint } from '../packages/simulation-runtime/src/evolution-domain.mjs';
import { runPolicyMatch } from '../packages/simulation-runtime/src/runtime.mjs';
import { executeInformationStudy } from '../packages/simulation-runtime/src/strategy-information.mjs';
import { strategyDigest, sealStrategy } from '../packages/simulation-runtime/src/strategy-contracts.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),dist=path.join(root,'apps/lab-web/dist'),out=path.join(root,'reports/local/strategy/browser');
await mkdir(out,{recursive:true});
const identity=await evolutionIdentity(),server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),file=path.resolve(dist,`.${decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname)}`);if(!file.startsWith(`${dist}${path.sep}`)){res.writeHead(403).end();return;}const body=await readFile(file);res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'}[path.extname(file)]??'application/octet-stream'}).end(body);}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']}),context=await browser.newContext({viewport:{width:1440,height:1080},acceptDownloads:true}),page=await context.newPage(),base=`http://127.0.0.1:${server.address().port}`,errors=[];
page.on('pageerror',e=>errors.push(e.message));
const report={date:'2026-10-04',timezone:'America/New_York',browser:await browser.version(),scenarios:[],errors};
async function scenario(name,fn){try{await fn();report.scenarios.push({name,status:'PASS'});console.log(`PASS ${name}`);}catch(error){const visibleError=await page.locator('.si-error').textContent().catch(()=>null);report.scenarios.push({name,status:'FAIL',error:error.message,visibleError});console.error(visibleError);throw error;}}
const tab=async name=>page.locator(`[data-si-tab="${name}"]`).click();
async function idle(){await expect(page.locator('#si-content')).not.toContainText('Reading compatible evidence',{timeout:30000});}
async function subject(value){await page.locator('#si-subject').selectOption(value);await page.locator('#si-filter-form button[type="submit"]').click();await idle();}
async function exported(button,filename){const pending=page.waitForEvent('download');await page.locator(button).click();const dl=await pending;const target=path.join(out,filename);await dl.saveAs(target);return readFile(target,'utf8');}
let savedRun,bundle;
try {
  await page.goto(`${base}/#/strategy`);await expect(page.getByTestId('strategy-card')).toBeVisible({timeout:30000});
  await scenario('new user sees Field Manual onboarding and honest rank Three empty state',async()=>{
    await expect(page.getByRole('heading',{name:'FIELD MANUAL',exact:true})).toBeVisible();await expect(page.getByTestId('strategy-confidence')).toHaveText('INSUFFICIENT');await expect(page.locator('.si-advice')).toContainText("don't have enough evidence");await expect(page.locator('.si-onboarding')).toContainText('Correlation ≠ proof');
    assert.equal(await page.locator('[data-si-rank]').count(),15);await page.locator('[data-si-rank="Q"]').click();await expect(page.locator('.si-card-heading h2')).toContainText('Queen');await page.locator('[data-si-rank="3"]').click();
  });
  await scenario('keyboard access and Show Nerd Data expose the same insufficient claim',async()=>{
    const summary=page.locator('.si-card .si-nerd summary').first();await summary.focus();await page.keyboard.press('Enter');await expect(page.locator('.si-card .si-nerd pre').first()).toBeVisible();await expect(page.locator('.si-card .si-nerd pre').first()).toContainText('STRATEGY_CLAIM_V1');
    const focus=await page.evaluate(()=>document.activeElement?.tagName);assert.equal(focus,'SUMMARY');
    await expect(page.locator('main:visible')).toHaveCount(1);
  });
  await tab('evidence');
  await scenario('real browser workers generate paired full decision evidence and persist it',async()=>{
    await page.locator('#si-producer-games').fill('4');await page.locator('[data-si-action="collect"]').click();await expect(page.locator('#si-status')).toContainText('Generate decision evidence complete.',{timeout:60000});
    savedRun=await page.evaluate(async()=>{const {EvolutionStore}=await import('./evolution/evolution-store.mjs'),{LAB_IDENTITY}=await import('./evolution/identity.mjs'),store=new EvolutionStore(LAB_IDENTITY);const history=await store.list();const run=await store.load(history[0].runId);store.close();return run;});
    await writeFile(path.join(out,'worker-run.json'),JSON.stringify(savedRun,null,2));
    assert.equal(savedRun.records.length,4);for(const r of savedRun.records){assert.ok(r.strategyDecisions,r.errorCode);assert.equal(r.strategyDecisions.length,r.decisions);}
    await expect(page.locator('#si-content')).toContainText('4 with full decisions');
  });
  await scenario('Node and browser decision capture have identical scientific artifacts',async()=>{
    assert.equal(savedRun.identity.fingerprint,identity.fingerprint,'rebuild after source changes before browser validation');
    const node=(await runLabSeries(savedRun.config,{identity,createdAt:savedRun.createdAt,startingCheckpoints:savedRun.checkpoints})).run;
    for(const r of savedRun.records){const expected=node.records.find(e=>e.ordinal===r.ordinal);assert.equal(r.resultHash,expected.resultHash);assert.deepEqual(r.strategyDecisions,expected.strategyDecisions);}
    await writeFile(path.join(out,'paired-run.json'),JSON.stringify(savedRun,null,2));
  });
  await tab('manual');await subject('family:draw');
  await scenario('opportunity-normalized timing, skipped uses and observational confidence render',async()=>{
    await expect(page.getByTestId('strategy-confidence')).toHaveText('EXPERIMENTAL');await expect(page.locator('.si-timing article')).toHaveCount(5);await expect(page.locator('.si-advice')).toContainText('legal opportunities');await expect(page.locator('.si-card')).toContainText('Skipped opportunities');
    await page.locator('.si-card .si-nerd summary').click();await expect(page.locator('.si-card .si-nerd pre')).toContainText('independentStates');
    const model=await page.evaluate(async fp=>{const {StrategyStore}=await import('./strategy/strategy-store.mjs'),store=new StrategyStore();const a=await store.aggregate({fingerprint:fp,rulesProfile:'core-advanced-authority',eraId:fp,subject:'family:draw',filters:{}});store.close();return a;},identity.fingerprint);
    assert.equal(model.total.selected+model.total.skipped,model.total.opportunities);assert.equal(model.total.decisions,savedRun.records.reduce((n,r)=>n+r.strategyDecisions.filter(e=>e.outcomes.clean).length,0));
  });
  await tab('explorer');
  await scenario('readable matchup/policy and deficit/hand filters match exact evidence, with no invented reversal',async()=>{
    await page.locator('[data-si-filter="opponentPolicyId"]').selectOption('tempo');await page.locator('[data-si-filter="policyId"]').selectOption('value');await page.locator('.si-context summary').click();await page.locator('[data-si-filter="minDeficit"]').fill('8');await page.locator('[data-si-filter="minOpponentHand"]').fill('7');await page.locator('#si-filter-form button[type="submit"]').click();await idle();
    await expect(page.getByTestId('strategy-confidence')).toHaveText('INSUFFICIENT');await page.locator('[data-si-action="reset"]').click();await idle();
    for(const opponent of ['tempo','value']){await page.locator('[data-si-filter="opponentPolicyId"]').selectOption(opponent);await page.locator('#si-filter-form button[type="submit"]').click();await idle();await expect(page.locator('.si-card')).toContainText('No supported recommendation yet');}
    await page.locator('[data-si-action="reset"]').click();await idle();
  });
  await tab('compare');
  await scenario('policy comparison uses the same compatible context and does not claim superiority',async()=>{
    await page.locator('[data-si-action="compare"]').click();await expect(page.locator('#si-status')).toContainText('Compare policies complete.');await expect(page.locator('#si-content')).toContainText('Behavior difference is not global policy superiority');
  });
  await scenario('checkpoint comparison selects two immutable checkpoints within the same era',async()=>{
    await page.locator('#si-compare-kind').selectOption('checkpointId');await page.locator('#si-compare-left').fill(savedRun.checkpoints[0].checkpointId);await page.locator('#si-compare-right').fill(savedRun.checkpoints[1].checkpointId);await page.locator('[data-si-action="compare"]').click();await expect(page.locator('#si-status')).toContainText('Compare policies complete.');await expect(page.locator('.si-two article h3')).toHaveCount(2);await expect(page.locator('.si-two article h3').first()).toHaveText(savedRun.checkpoints[0].checkpointId);
  });
  await tab('lab');await subject('family:swap-bar');
  await scenario('a real decision is reconstructed, branched with a fixed budget, persisted and kept research-only',async()=>{
    await page.locator('#si-branch-budget').fill('2');await page.locator('#si-branch-limit').fill('300');await page.locator('[data-si-action="branch"]').click();await expect(page.locator('#si-status')).toContainText('Controlled branches complete.',{timeout:60000});
    await expect(page.locator('.si-study')).toContainText('COMPLETE');await expect(page.locator('#si-content')).toContainText('RESEARCH-ONLY / NOT PLAYER-ACTIONABLE');
    const studies=await page.evaluate(async fp=>{const {StrategyStore}=await import('./strategy/strategy-store.mjs'),s=new StrategyStore();const rows=await s.studies({fingerprint:fp,rulesProfile:'core-advanced-authority',eraId:fp});s.close();return rows;},identity.fingerprint);
    assert.equal(studies.length,1);assert.equal(studies[0].rows.length,studies[0].plan.seeds.length*studies[0].plan.actionIds.length);assert.equal(studies[0].informationScope,'RESEARCH_ONLY');
  });
  await scenario('invalid continuation budget produces a visible error instead of an unhandled exception',async()=>{
    await page.locator('#si-branch-budget').fill('0');await page.locator('[data-si-action="branch"]').click();await expect(page.locator('.si-error')).toContainText('Choose 2–128');
    await page.locator('[data-si-action="retry"]').click();await idle();
  });
  await tab('guide');
  await scenario('generated expert guide and manifest retain every statement provenance and unknowns',async()=>{
    await page.locator('[data-si-action="guide"]').click();await expect(page.locator('#si-status')).toContainText('Generate expert guide complete.',{timeout:60000});
    const markdown=await exported('[data-si-action="guide-md"]','guide.md'),manifest=JSON.parse(await exported('[data-si-action="guide-manifest"]','guide-manifest.json'));
    assert.ok(manifest.entries.length>0);for(const e of manifest.entries){assert.ok(e.claimId);assert.ok(e.provenance.length>0);assert.ok(!markdown.includes(e.claimId),'sealed claim IDs stay out of human prose');}assert.ok(String(manifest.missingConclusion).includes('No strong conclusion yet'));assert.ok(manifest.entries.some(e=>e.informationScope==='RESEARCH_ONLY'));
  });
  await tab('discoveries');
  await scenario('sequence miner and mistake empty/research states remain observational',async()=>{await expect(page.locator('#si-content')).toContainText('A weak policy choosing a line does not make it a mistake');await expect(page.locator('#si-content')).toContainText('Candidate regret findings');});
  await tab('evidence');
  await scenario('portable evidence export has checksummed full decisions, replay references and studies',async()=>{
    bundle=JSON.parse(await exported('[data-si-action="export"]','evidence-bundle.json'));assert.equal(bundle.contract,'STRATEGY_BUNDLE_V1');assert.equal(bundle.evidence.length,4);assert.ok(bundle.studies.length>0);assert.ok(bundle.replays.length>0);
  });
  await scenario('IndexedDB insert-or-verify preserves immutable artifacts and rolls back conflicting writes',async()=>{
    const result=await page.evaluate(async ()=>{const {StrategyStore}=await import('./strategy/strategy-store.mjs'),store=new StrategyStore(),sources=await store.listSources(),e=await store.get('evidence',sources[0].artifactId);await store.addEvidence(e);let conflict=false;try{await store.insert([{store:'evidence',key:e.artifactId,value:{...e,clean:!e.clean}}]);}catch(error){conflict=error.message.includes('IMMUTABLE_CONFLICT');}const after=await store.get('evidence',e.artifactId);store.close();return {conflict,unchanged:JSON.stringify(e)===JSON.stringify(after)};},identity.fingerprint);
    assert.equal(result.conflict,true);assert.equal(result.unchanged,true);
  });
  await scenario('duplicate rows within one transaction are idempotent and conflicting duplicates abort',async()=>{
    const result=await page.evaluate(async()=>{const {StrategyStore}=await import('./strategy/strategy-store.mjs'),s=new StrategyStore(),row={store:'archives',key:'FIXTURE_TX_ROW',value:{archiveId:'FIXTURE_TX_ROW',kind:'FIXTURE',origin:'FIXTURE'}};await s.insert([row,row]);let conflict=false;try{await s.insert([row,{...row,value:{...row.value,kind:'CONFLICT'}}]);}catch(e){conflict=e.message.includes('IMMUTABLE_CONFLICT');}const after=await s.get('archives',row.key);const db=await s.open();await new Promise((resolve,reject)=>{const tx=db.transaction('archives','readwrite');tx.objectStore('archives').delete(row.key);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});s.close();return {conflict,unchanged:after.kind==='FIXTURE'};});assert.equal(result.conflict,true);assert.equal(result.unchanged,true);
  });
  await scenario('source ingestion preserves existing aggregate fidelity instead of inventing decision events',async()=>{
    const legacy=structuredClone(savedRun);legacy.records.forEach(r=>{delete r.strategyDecisions;const {resultHash:_h,durationMs:_ms,...body}=r;r.resultHash=strategyDigest(body);});
    const partial=strategyGameEvidence(legacy,legacy.records[0]);await page.evaluate(async e=>{const {StrategyStore}=await import('./strategy/strategy-store.mjs'),s=new StrategyStore();await s.addEvidence(e);s.close();},partial);
    await page.reload();await expect(page.getByTestId('strategy-card')).toBeVisible();await tab('evidence');await page.locator('summary').filter({hasText:'Sources, historical eras'}).click();await expect(page.locator('#si-content')).toContainText('PARTIAL_OBSERVATIONAL_EVIDENCE');
  });
  await scenario('historical era fixture stays separate, visible and execution-disabled',async()=>{
    const oldFp='b'.repeat(64),e=strategyGameEvidence(savedRun,savedRun.records[0]);const {artifactId:_id,contract,...body}=structuredClone(e);body.source.fingerprint=oldFp;body.source.eraId=oldFp;body.source.origin='FIXTURE_HISTORICAL';body.identity.fingerprint=oldFp;body.checkpoints=[];body.events=body.events.map(event=>{const {artifactId:_eventId,contract:ec,...eb}=event;eb.identity.fingerprint=oldFp;eb.identity.eraId=oldFp;return sealStrategy(ec,eb);});const historical=sealStrategy(contract,body);
    await page.evaluate(async e=>{const {StrategyStore}=await import('./strategy/strategy-store.mjs'),s=new StrategyStore();await s.addEvidence(e);s.close();},historical);await page.reload();await expect(page.getByTestId('strategy-card')).toBeVisible();
    const old=page.locator('#si-cohort option').filter({hasText:'Historical'});await page.locator('#si-cohort').selectOption(await old.getAttribute('value'));await page.locator('#si-filter-form button[type="submit"]').click();await idle();await expect(page.getByTestId('strategy-confidence')).toHaveText('INSUFFICIENT');await expect(page.locator('.si-workspace')).toContainText('HISTORICAL EVIDENCE');await tab('lab');await expect(page.locator('[data-si-action="branch"]')).toBeDisabled();
    await page.locator('#si-cohort').selectOption('0');await page.locator('#si-filter-form button[type="submit"]').click();await idle();
  });
  await scenario('import-only evidence is explicitly unverified and cannot gain confidence by checksum',async()=>{
    const importedContext=await browser.newContext({viewport:{width:1280,height:900}}),p=await importedContext.newPage();try{await p.goto(`${base}/#/strategy`);await expect(p.getByTestId('strategy-card')).toBeVisible();await p.evaluate(async bundle=>{const {StrategyStore}=await import('./strategy/strategy-store.mjs'),s=new StrategyStore();await s.importBundle(JSON.stringify(bundle));s.close();},bundle);const retained=await p.evaluate(async input=>{const {StrategyStore}=await import('./strategy/strategy-store.mjs'),s=new StrategyStore(),original=await s.get('evidence',input.evidence[0].artifactId),archives=await s.importedResearch({fingerprint:input.evidence[0].source.fingerprint,rulesProfile:input.evidence[0].source.rulesProfile,eraId:input.evidence[0].source.eraId}),reexport=await s.exportBundle({fingerprint:input.evidence[0].source.fingerprint,rulesProfile:input.evidence[0].source.rulesProfile,eraId:input.evidence[0].source.eraId});s.close();return {original,archives,reexport};},bundle);assert.deepEqual(retained.original,bundle.evidence[0]);assert.ok(retained.archives.length>=bundle.studies.length);assert.ok(retained.reexport.sourceOrigins.every(row=>row.origin==='IMPORTED_UNVERIFIED'));assert.ok(retained.reexport.importedResearch.length>0);await p.reload();await expect(p.getByTestId('strategy-card')).toBeVisible();await p.locator('#si-subject').selectOption('family:draw');await p.locator('#si-filter-form button[type="submit"]').click();await expect(p.getByTestId('strategy-confidence')).toHaveText('INSUFFICIENT');await p.locator('.si-card .si-nerd summary').click();await expect(p.locator('.si-card .si-nerd pre')).toContainText('IMPORTED_UNVERIFIED');}finally{await importedContext.close();}
  });
  await tab('manual');await subject('family:draw');
  await scenario('mobile and normal desktop have no document horizontal overflow and keep keyboard controls',async()=>{
    for(const width of [1440,768,375]){await page.setViewportSize({width,height:1000});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);assert.equal(overflow,false,`width ${width}`);await expect(page.getByTestId('strategy-card')).toBeVisible();await page.evaluate(()=>{window.scrollTo({top:0,left:0,behavior:'instant'});document.activeElement?.blur?.();});await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);await page.screenshot({path:path.join(out,`manual-${width}.png`),fullPage:true});}
    await page.setViewportSize({width:1440,height:1080});
  });
  await scenario('completed normal play captures authorized human/AI decisions without changing journal or save identity',async()=>{
    const result=await page.evaluate(async()=>{
      const {PlaySession}=await import('./play/play-controller.js'),{createReplayRecord,saveReplay}=await import('./play/replay-library.js');
      const s=new PlaySession();await s.init({mode:'local-ai',humanPlayerId:'P1',aiPolicyId:'value',profileId:'core-advanced-authority',seed:1337});
      for(let i=0;i<150&&s.status!=='TERMINAL';i++){if(s.status==='AI_DECISION')await s.stepAI();else if(s.status==='HUMAN_DECISION'){const actions=s.currentFrame.legalActions,a=actions.find(a=>['score','play-for-points'].includes(a.family))??actions.find(a=>a.family==='draw')??actions.find(a=>a.family==='phase')??actions[0];const r=await s.submitHumanAction({sessionId:s.sessionId,stateRevision:s._stateRevision,decisionFrameHash:s.currentFrame.frameHash,actionId:a.actionId});if(!r.accepted)throw new Error(r.error);}else throw new Error(s.status);}
      if(s.status!=='TERMINAL')throw new Error('NORMAL_PLAY_NOT_TERMINAL');const record=await createReplayRecord(s);await saveReplay(record);return {fidelity:record.strategyFidelity,error:record.strategyCaptureError,events:record.strategyDecisions?.length,decisions:s.decisionJournal.length,verified:record.certifiedReplayHash};
    });
    assert.equal(result.fidelity,'FULL_DECISION_EVIDENCE',result.error);assert.equal(result.events,result.decisions);assert.ok(result.verified);
    await tab('evidence');await page.locator('[data-si-action="players"]').click();await expect(page.locator('#si-status')).toContainText('Ingest completed local games complete.');
  });
  await scenario('real weighted Profile heads capture pinned decisions and compare H1 against H2 without mutating either run',async()=>{
    const profile=await page.evaluate(async()=>{const {ProfileStore,IndexedDbBackend}=await import('./evolution/profile-store.mjs'),{LAB_IDENTITY}=await import('./evolution/identity.mjs'),s=new ProfileStore(new IndexedDbBackend(),{identity:LAB_IDENTITY});const created=await s.createProfile({commandId:'strategy-browser-profile',displayName:'FIXTURE STRATEGY PROFILE',traits:{scoringDrive:30,guard:20}});const before=await s.profileView(created.agentProfileId);s.backend.close();return {id:created.agentProfileId,before};});
    for(const version of [1,2]){
      if(version===2)await page.evaluate(async id=>{const {ProfileStore,IndexedDbBackend}=await import('./evolution/profile-store.mjs'),{LAB_IDENTITY}=await import('./evolution/identity.mjs'),s=new ProfileStore(new IndexedDbBackend(),{identity:LAB_IDENTITY}),head=await s.getHead(id),draft=await s.saveDraftRevision({agentProfileId:id,baseRevisionId:head.activeRevisionId,sourceCheckpointId:head.championCheckpointId,traits:{scoringDrive:90,guard:5}});await s.activateAuthoredRevision({commandId:'strategy-browser-head2',agentProfileId:id,expectedHead:head,revisionId:draft.revision.id});s.backend.close();},profile.id);
      await page.reload();await expect(page.getByTestId('strategy-card')).toBeVisible({timeout:30000});await tab('evidence');await page.locator('#si-producer-a').selectOption(`agent-profile:${profile.id}`);await page.locator('#si-producer-b').selectOption('value');await page.locator('#si-producer-games').fill('2');await page.locator('[data-si-action="collect"]').click();await expect(page.locator('#si-status')).toContainText('Generate decision evidence complete.',{timeout:60000});
      const data=await page.evaluate(async id=>{const {ProfileStore,IndexedDbBackend}=await import('./evolution/profile-store.mjs'),{LAB_IDENTITY}=await import('./evolution/identity.mjs'),{StrategyStore}=await import('./strategy/strategy-store.mjs'),p=new ProfileStore(new IndexedDbBackend(),{identity:LAB_IDENTITY}),s=new StrategyStore(),view=await p.profileView(id),sources=(await s.listSources()).filter(row=>row.agentProfileIds.includes(id)),events=[];for(const row of sources)events.push(...(await s.get('evidence',row.artifactId)).events.filter(e=>e.identity.agentProfileId===id));s.close();p.backend.close();return {view,events};},profile.id);
      if(version===1)assert.deepEqual(data.view,profile.before);assert.ok(data.events.some(e=>e.identity.profileHead===version));assert.ok(data.events.every(e=>e.identity.policyId==='weighted-heuristic-v1'));
    }
    await subject('family:draw');await page.locator('.si-context summary').click();await page.locator('[data-si-filter="agentProfileId"]').selectOption(profile.id);await page.locator('#si-filter-form button[type="submit"]').click();await idle();await tab('compare');await page.locator('#si-compare-kind').selectOption('profileHead');await page.locator('#si-compare-left').fill('1');await page.locator('#si-compare-right').fill('2');await page.locator('[data-si-action="compare"]').click();await expect(page.locator('#si-status')).toContainText('Compare policies complete.');await expect(page.locator('.si-two article h3').first()).toHaveText('1');await expect(page.locator('.si-two article h3').nth(1)).toHaveText('2');
  });
  await page.goto(`${base}/#/evidence`);await page.goto(`${base}/#/strategy`);await expect(page.getByTestId('strategy-card')).toBeVisible({timeout:30000});await subject('family:phase');await tab('lab');
  await scenario('information-set controls expose supported opening boundary and unknown evidence',async()=>{await expect(page.getByTestId('information-controls')).toContainText('first prepared Start');await expect(page.locator('[data-si-action="information-study"]')).toBeEnabled();await expect(page.getByTestId('information-controls')).toContainText('No information-set evidence');});
  await scenario('real information-set worker commits plan, runs matched worlds, persists and renders unknown controlled claim',async()=>{
    await page.locator('#si-world-count').fill('4');await page.locator('#si-world-continuations').fill('2');await page.locator('[data-si-action="information-study"]').click();await expect(page.locator('#si-status')).toContainText('Information-set study complete.',{timeout:90000});
    await expect(page.getByTestId('information-study').first()).toContainText('COMPLETE');await expect(page.locator('.si-controlled-advice').first()).toContainText('Unknown');
    const data=await page.evaluate(async fp=>{const {StrategyStore}=await import('./strategy/strategy-store.mjs'),s=new StrategyStore(),studies=await s.informationStudies({fingerprint:fp,rulesProfile:'core-advanced-authority',eraId:fp}),study=studies[0],plan=await s.get('informationPlans',study.plan.artifactId),info=await s.get('informationSets',study.informationSet.artifactId);s.close();return {study,plan,info};},identity.fingerprint);
    assert.deepEqual(data.plan,data.study.plan);assert.deepEqual(data.info,data.study.informationSet);assert.equal(data.study.counts.hiddenWorlds,4);assert.equal(data.study.rows.length,4*2*data.study.plan.actionIds.length);assert.equal(data.study.informationScope,'ACTOR_AUTHORIZED');await writeFile(path.join(out,'information-real-study.json'),JSON.stringify(data.study,null,2));
    await page.locator('[data-testid="information-study"] .si-nerd summary').first().focus();await page.keyboard.press('Enter');await expect(page.locator('[data-testid="information-study"] .si-nerd pre').first()).toBeVisible();await expect(page.locator('[data-testid="information-study"] .si-nerd pre').first()).toContainText('UNIFORM_OPENING_UNSEEN_ASSIGNMENT_FRESH_RNG_V1');await page.keyboard.press('Enter');await page.evaluate(()=>{window.scrollTo({top:0,left:0,behavior:'instant'});document.activeElement?.blur?.();});await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);await page.screenshot({path:path.join(out,'information-real.png'),fullPage:true});
  });
  await scenario('browser information study reproduces byte-for-byte through Node authority',async()=>{
    const data=await page.evaluate(async fp=>{const {StrategyStore}=await import('./strategy/strategy-store.mjs'),s=new StrategyStore(),study=(await s.informationStudies({fingerprint:fp,rulesProfile:'core-advanced-authority',eraId:fp}))[0],row=await s.get('events',study.sourceEventId),e=await s.get('evidence',row.evidenceId);s.close();return {study,event:row.event,checkpoints:e.checkpoints};},identity.fingerprint);
    const authority={createState:createSimulationState,execute:executeSimulationAction,frame:s=>createSimulationDecisionFrame(s,256),view:strictPolicyView,validateCheckpoint};
    const reproduced=await executeInformationStudy({event:data.event,checkpoints:data.checkpoints,informationSet:data.study.informationSet,plan:data.study.plan,identity,authority,continueMatch:runPolicyMatch});assert.deepEqual(reproduced,data.study);
  });
  await scenario('information-set invalid budget shows error and retains completed evidence',async()=>{await page.locator('#si-world-continuations').fill('0');await page.locator('[data-si-action="information-study"]').click();await expect(page.locator('.si-error')).toContainText('Choose 1–8');await expect(page.getByTestId('information-study')).toHaveCount(1);await page.locator('[data-si-action="retry"]').click();await idle();});
  await scenario('censored information continuations remain visible and cannot support claims',async()=>{await page.locator('#si-world-count').fill('2');await page.locator('#si-world-limit').fill('1');await page.locator('[data-si-action="information-study"]').click();await expect(page.locator('#si-status')).toContainText('Information-set study complete.',{timeout:60000});await expect(page.getByTestId('information-controls')).toContainText('NON_CLEAN');await expect(page.getByTestId('information-controls')).toContainText('Cancelled or non-clean studies cannot support inference');});
  await tab('manual');await subject('family:phase');
  await scenario('experimental controlled evidence keeps Quick Read honest instead of manufacturing advice',async()=>{
    // A COMPLETE real study exists with unresolved/experimental controlled
    // claims. Priority 2 shows the controlled result without a fake
    // recommendation; exact-state research-only text must never appear here.
    await expect(page.getByTestId('strategy-confidence')).toHaveText('EXPERIMENTAL');
    await expect(page.getByTestId('quick-read')).toContainText('no supported recommendation yet');
    await expect(page.getByTestId('quick-read')).toContainText('controlled');
    await expect(page.getByTestId('quick-read')).not.toContainText('recorded hidden state');
    await expect(page.getByTestId('quick-read')).not.toContainText('Research-only');
  });
  await scenario('Strategy v1 IndexedDB migration preserves existing rows and adds study stores',async()=>{const c=await browser.newContext(),p=await c.newPage();try{await p.goto(`${base}/#/evidence`);await p.evaluate(async()=>{await new Promise((resolve,reject)=>{const r=indexedDB.open('intrilex-strategy-intelligence',1);r.onupgradeneeded=()=>{for(const [name,keyPath] of [['evidence','artifactId'],['sources','artifactId'],['events','eventId'],['replays','replayHash'],['studies','artifactId'],['claims','artifactId'],['archives','archiveId']])r.result.createObjectStore(name,{keyPath});};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('replays','readwrite');tx.objectStore('replays').add({replayHash:'MIGRATION_FIXTURE',replay:{preserved:true}});tx.oncomplete=()=>{db.close();resolve();};};});});await p.goto(`${base}/#/strategy`);await expect(p.getByTestId('strategy-card')).toBeVisible();const row=await p.evaluate(async()=>{const {StrategyStore}=await import('./strategy/strategy-store.mjs'),s=new StrategyStore(),db=await s.open(),row=await s.get('replays','MIGRATION_FIXTURE'),version=db.version,stores=[...db.objectStoreNames];s.close();return {row,version,stores};});assert.equal(row.version,2);assert.equal(row.row.replay.preserved,true);assert.ok(row.stores.includes('informationPlans'));}finally{await c.close();}});
  await scenario('V2 portability preserves studies as unverified archive and never trusted advice',async()=>{
    const b=await page.evaluate(async fp=>{const {StrategyStore}=await import('./strategy/strategy-store.mjs'),s=new StrategyStore(),b=await s.exportBundle({fingerprint:fp,rulesProfile:'core-advanced-authority',eraId:fp});s.close();return b;},identity.fingerprint);assert.equal(b.contract,'STRATEGY_BUNDLE_V2');assert.equal(b.informationStudies.length,2);
    const c=await browser.newContext(),p=await c.newPage();try{await p.goto(`${base}/#/strategy`);await expect(p.getByTestId('strategy-card')).toBeVisible();const result=await p.evaluate(async b=>{const {StrategyStore}=await import('./strategy/strategy-store.mjs'),s=new StrategyStore();await s.importBundle(JSON.stringify(b));const scope={fingerprint:b.informationStudies[0].plan.fingerprint,rulesProfile:b.informationStudies[0].plan.rulesProfile,eraId:b.informationStudies[0].plan.eraId};const trusted=await s.informationStudies(scope),archives=await s.importedResearch(scope),reexport=await s.exportBundle(scope);s.close();return {trusted,archives,reexport};},b);assert.deepEqual(result.trusted,[]);assert.ok(result.archives.some(a=>a.kind==='INFORMATION_STUDY'&&a.origin==='IMPORTED_UNVERIFIED'));assert.equal(result.reexport.contract,'STRATEGY_BUNDLE_V2');}finally{await c.close();}
  });
  await scenario('synthetic Suggestive acceptance fixture renders confidence and context without claiming a real discovery',async()=>{
    const fixture=JSON.parse(await readFile(path.join(root,'reports/local/strategy/information/synthetic-ui-fixture.json'),'utf8'));assert.equal(fixture.plan.fingerprint,identity.fingerprint);
    await page.evaluate(async fixture=>{const {StrategyStore}=await import('./strategy/strategy-store.mjs'),{claimsFromInformationStudy}=await import('./evolution/strategy-information.mjs'),{LAB_IDENTITY}=await import('./evolution/identity.mjs'),s=new StrategyStore();await s.saveInformationPlan(fixture.informationSet,fixture.plan);await s.saveInformationStudy(fixture,claimsFromInformationStudy(fixture,{identity:LAB_IDENTITY}));s.close();},fixture);
    await page.reload();await expect(page.getByTestId('strategy-card')).toBeVisible();await subject('family:phase');await expect(page.locator('.si-controlled-advice').filter({hasText:'Prefer'}).first()).toBeVisible();await expect(page.getByTestId('strategy-card')).toContainText('SUGGESTIVE');await expect(page.getByTestId('strategy-card')).toContainText('128 compatible hidden worlds');await expect(page.getByTestId('strategy-card')).toContainText('SYNTHETIC ACCEPTANCE FIXTURE');
    // Quick Read priority: the valid controlled claim is the top-line answer —
    // the observational aggregate beneath cannot overwrite it, and Show Nerd
    // Data contains the exact claim driving the displayed recommendation.
    await expect(page.getByTestId('strategy-confidence')).toHaveText('SUGGESTIVE');await expect(page.getByTestId('quick-recommendation')).toContainText('Recommendation: Prefer');
    await page.locator('.si-card .si-nerd summary').first().click();await expect(page.locator('.si-card .si-nerd pre').first()).toContainText('PREFER_ALTERNATIVE');
    for(const width of [1440,375]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false);await page.screenshot({path:path.join(out,`information-${width}.png`),fullPage:true});}await page.setViewportSize({width:1440,height:1080});
  });
  await scenario('volatile controlled evidence cannot render as robust advice',async()=>{
    // Reseal the acceptance fixture as a sign-reversing study rebound to
    // rank:K: engineered +1/-1 world effects are Volatile and Experimental —
    // never a robust recommendation — even though rows and worlds stay real.
    const fixture=JSON.parse(await readFile(path.join(root,'reports/local/strategy/information/synthetic-ui-fixture.json'),'utf8'));
    const volatileStudy=await page.evaluate(async fixture=>{
      const {sealStrategy}=await import('./evolution/strategy-contracts.mjs'),{inferWorldEffectsV3,informationStudyAssessment,claimsFromInformationStudy}=await import('./evolution/strategy-information.mjs'),{LAB_IDENTITY}=await import('./evolution/identity.mjs');
      const reseal=(a,change)=>{const {contract,artifactId:_id,...body}=structuredClone(a);change(body);return sealStrategy(contract,body);};
      const plan=reseal(fixture.plan,p=>{p.requestedSubject='rank:K';p.question={...p.question,subject:'rank:K'};});
      const rows=fixture.rows.map(r=>r.worldOrdinal%2===0?r:(r.actionId===fixture.plan.actualActionId?{...r,score:1,winner:'P1'}:{...r,score:0,winner:'P2'}));
      const mean=v=>v.reduce((a,b)=>a+b,0)/v.length;
      const comparisons=plan.actionIds.filter(id=>id!==plan.actualActionId).map(actionId=>{const worldEffects=plan.worldManifest.worlds.map(w=>({ordinal:w.ordinal,effect:mean(plan.seeds.map(seed=>rows.find(r=>r.worldOrdinal===w.ordinal&&r.actionId===actionId&&r.seed===seed).score-rows.find(r=>r.worldOrdinal===w.ordinal&&r.actionId===plan.actualActionId&&r.seed===seed).score))}));return {actionId,alternativeLabel:'SYNTHETIC VOLATILE FIXTURE',worldEffects,...inferWorldEffectsV3(worldEffects.map(e=>e.effect),{alternatives:plan.actionIds.length-1,minimumMeaningfulEffect:plan.minimumMeaningfulEffect})};});
      const study=reseal(fixture,s=>{s.plan=plan;s.rows=rows;s.comparisons=comparisons;s.assessment=informationStudyAssessment(comparisons);s.caveats=[...s.caveats,'SYNTHETIC VOLATILE FIXTURE: engineered sign-reversing scores, not real strategy evidence.'];});
      return {study,claims:claimsFromInformationStudy(study,{identity:LAB_IDENTITY})};
    },fixture);
    await page.evaluate(async({study,claims})=>{const {StrategyStore}=await import('./strategy/strategy-store.mjs'),s=new StrategyStore();await s.saveInformationPlan(study.informationSet,study.plan);await s.saveInformationStudy(study,claims);s.close();},volatileStudy);
    await subject('rank:K');
    await expect(page.getByTestId('strategy-confidence')).toHaveText('EXPERIMENTAL');
    await expect(page.getByTestId('quick-read')).toContainText('no supported recommendation yet');
    await expect(page.getByTestId('quick-read')).not.toContainText('Recommendation:');
    await expect(page.locator('.si-controlled-advice').filter({hasText:'Volatile'}).first()).toBeVisible();
    await subject('family:phase');
  });
  await scenario('information-set Stop rejects late completion and retains the committed plan',async()=>{await tab('lab');await page.locator('#si-world-count').fill('32');await page.locator('[data-si-action="information-study"]').click();await expect(page.locator('#si-status')).toContainText('committed branch outcomes',{timeout:60000});await page.locator('[data-si-action="stop"]').click();await expect(page.locator('.si-error')).toContainText('INFORMATION_STUDY_CANCELLED',{timeout:60000});await expect(page.getByTestId('information-study')).toHaveCount(4);const count=await page.evaluate(async()=>{const {StrategyStore}=await import('./strategy/strategy-store.mjs'),s=new StrategyStore(),rows=[];await s.scan('informationPlans',{visit:p=>rows.push(p)});s.close();return rows.filter(p=>p.worldManifest.requested===32).length;});assert.equal(count,1);});
  await scenario('information-set route exit terminates its worker and preserves already committed plans',async()=>{await tab('lab');await page.locator('#si-world-count').fill('128');await page.locator('[data-si-action="information-study"]').click();await page.goto(`${base}/#/evidence`);await page.goto(`${base}/#/strategy`);await expect(page.getByTestId('strategy-card')).toBeVisible();await subject('family:phase');await expect(page.getByTestId('information-study')).toHaveCount(3);});
  await scenario('route departure cancels owned work and return reopens persisted evidence',async()=>{
    await page.goto(`${base}/#/evidence`);await page.goto(`${base}/#/strategy`);await expect(page.getByTestId('strategy-card')).toBeVisible({timeout:30000});await tab('evidence');
    await page.evaluate(()=>{const Original=window.Worker;window.__strategyWorkers=0;window.__strategyTerminated=0;window.Worker=class extends Original{constructor(...args){super(...args);window.__strategyWorkers++;}terminate(){window.__strategyTerminated++;return super.terminate();}};});
    await page.locator('#si-producer-games').fill('128');await page.locator('[data-si-action="collect"]').click();await expect.poll(()=>page.evaluate(()=>window.__strategyWorkers)).toBeGreaterThan(0);
    await page.goto(`${base}/#/evidence`);await expect(page.locator('[data-testid="strategy-workspace"]')).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>window.__strategyTerminated)).toBeGreaterThan(0);await page.goto(`${base}/#/strategy`);await expect(page.getByTestId('strategy-card')).toBeVisible({timeout:30000});
  });
  assert.deepEqual(errors,[]);report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;throw error;}
finally{await writeFile(path.join(out,'acceptance.json'),JSON.stringify(report,null,2));await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));}
