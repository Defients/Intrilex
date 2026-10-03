/* global document */
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,expect} from '@playwright/test';
import {runLabSeries,evolutionIdentity,artifactEnvelope} from '../packages/simulation-runtime/src/evolution-lab.mjs';
import {arenaAnalytics} from '../apps/lab-web/src/evolution/evolution-analytics-model.mjs';
import {createLabRun} from '../packages/simulation-runtime/src/evolution-domain.mjs';
import {hashCanonical} from '@intrilex/shared';
const root=fileURLToPath(new URL('../',import.meta.url)),dist=path.join(root,'apps/lab-web/dist'),output=path.join(root,'reports/local/evolution-analytics/browser');
await mkdir(output,{recursive:true});
const identity=await evolutionIdentity(),series=await runLabSeries({botA:'value',botB:'tempo',gameCount:120,seed:1337,mirrorSeats:true,profileId:'core-advanced-authority',workerCount:4},{identity});
assert.equal(series.run.status,'COMPLETE');
const source=path.join(output,'arena.json');await writeFile(source,JSON.stringify(artifactEnvelope(series.run)));
const model=arenaAnalytics(series.run),adaptive=path.join(root,'reports/local/evolution-cockpit/browser/adaptive.json');
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),target=path.resolve(dist,`.${decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname)}`);if(!target.startsWith(`${dist}${path.sep}`)){res.writeHead(403).end();return;}const data=await readFile(target);res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.webp':'image/webp'}[path.extname(target)]??'application/octet-stream'}).end(data);}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']}),context=await browser.newContext({viewport:{width:1700,height:1150},acceptDownloads:true}),page=await context.newPage(),errors=[],report={date:'2026-10-03',browser:await browser.version(),scenarios:[],errors};
page.on('pageerror',error=>errors.push(error.message));
const surface=async name=>page.locator(`.evo-navigation [data-evo-surface="${name}"]`).click();
async function scenario(name,fn){try{await fn();report.scenarios.push({name,status:'PASS'});console.log(`PASS ${name}`);}catch(error){report.scenarios.push({name,status:'FAIL',error:error.message});throw error;}}
async function exportRun(filename){await surface('ledger');const pending=page.waitForEvent('download');await page.locator('#evo-export').click();const download=await pending,target=path.join(output,filename);await download.saveAs(target);return JSON.parse(await readFile(target,'utf8'));}
try{
  await page.goto(`${base}/#/evolution?view=arena`);await expect(page.getByTestId('evolution-lab')).toBeVisible({timeout:30000});
  await scenario('versioned tactical selectors execute real workers and match Node authority',async()=>{
    await expect(page.locator('#evo-bot-a')).toHaveValue('tempo-tactical');await expect(page.locator('#evo-bot-b')).toHaveValue('value-tactical');
    for(const id of ['score-rush-tactical','control-tactical','tempo-tactical','value-tactical']){await expect(page.locator(`#evo-bot-a option[value="${id}"]`)).toHaveCount(1);await expect(page.locator(`#evo-bot-b option[value="${id}"]`)).toHaveCount(1);}
    await page.locator('#evo-bot-a').selectOption('score-rush-tactical');await page.locator('#evo-bot-b').selectOption('control-tactical');
    await page.locator('#evo-games').fill('4');await page.locator('#evo-run').click();await expect(page.locator('#evo-state')).toHaveText('COMPLETE',{timeout:60000});
    const exported=await exportRun('tactical-workers.json'),run=exported.payload;
    assert.equal(run.checkpoints[0].policyVersion,'3.0.0');assert.equal(run.checkpoints[1].policyVersion,'3.0.0');
    const node=(await runLabSeries(run.config,{identity,createdAt:run.createdAt})).run;
    for(const r of run.records){const expected=node.records.find(x=>x.ordinal===r.ordinal);for(const key of ['initialStateHash','actionSequenceHash','finalStateHash','winner','resultHash'])assert.equal(r[key],expected[key]);}
    await page.goto(`${base}/#/watch`);for(const id of ['score-rush-tactical','control-tactical','tempo-tactical','value-tactical']){await expect(page.locator(`#exp-p1 option[value="${id}"]`)).toHaveCount(1);await expect(page.locator(`#exp-p2 option[value="${id}"]`)).toHaveCount(1);}await page.goto(`${base}/#/caster`);
    for(const id of ['score-rush-tactical','control-tactical','tempo-tactical','value-tactical']){await expect(page.locator(`#caster-p1 option[value="${id}"]`)).toHaveCount(1);await expect(page.locator(`#caster-p2 option[value="${id}"]`)).toHaveCount(1);}
    await page.goto(`${base}/#/play/new`);await expect(page.getByTestId('new-match-form')).toBeVisible();await page.getByTestId('difficulty-option-normal').click();await expect(page.locator('input[name="ai-difficulty"][value="normal"]')).toBeChecked();
    for(const id of ['score-rush','control','tempo','value']){await expect(page.getByTestId(`archetype-card-${id}`)).toHaveCount(1);await expect(page.getByTestId(`archetype-card-${id}-tactical`)).toHaveCount(0);await page.getByTestId(`archetype-card-${id}`).click();await expect(page.locator(`input[name="ai-archetype"][value="${id}"]`)).toBeChecked();await expect(page.getByTestId('opponent-brief-body')).toContainText(({ 'score-rush':'Score Rush',control:'Control',tempo:'Tempo',value:'Value'})[id]);}
    const resolved=await page.evaluate(async()=>{const {POLICY_IDS}=await import('./autonomy-runtime.js');const {buildOpponentModel,policyTraitsFromId,resolveOpponent}=await import('./play/opponent-catalog.mjs');const model=buildOpponentModel(POLICY_IDS.map(id=>({policyId:id,traits:policyTraitsFromId(id)})));return ['score-rush','control','tempo','value'].map(id=>resolveOpponent(model,'normal',id).policyId);});
    assert.deepEqual(resolved,['score-rush-tactical','control-tactical','tempo-tactical','value-tactical']);
    await page.goto(`${base}/#/evolution?view=arena`);await expect(page.getByTestId('evolution-lab')).toBeVisible();
  });
  await scenario('historical local history preserves old identity and original export without execution admission',async()=>{
    const oldIdentity={...identity,policyImplementationHash:'b'.repeat(64),runtimeHash:'c'.repeat(64)}, {engineHash,policyImplementationHash,runtimeHash,engineVersion,rulesVersion}=oldIdentity;
    oldIdentity.fingerprint=hashCanonical({engineHash,policyImplementationHash,runtimeHash,engineVersion,rulesVersion});
    const old=createLabRun({botA:'tempo',botB:'value',gameCount:2,seed:1337},oldIdentity,'2026-10-02T00:00:00.000Z');old.status='STOPPED';const envelope=artifactEnvelope(old);
    await page.evaluate(async old=>{const {EvolutionStore}=await import('./evolution/evolution-store.mjs');const store=new EvolutionStore(old.identity);await store.save(old);store.close();},old);
    await surface('ledger');await page.locator('#evo-history-refresh').click();await page.locator(`[data-load-run="${old.runId}"]`).click();await expect(page.locator('#evo-context-status')).toHaveText('READ ONLY');await expect(page.locator('#evo-run')).toBeDisabled();await expect(page.locator('#evo-resume')).toBeDisabled();
    const exported=await exportRun('historical-original.json');assert.deepEqual(exported,envelope);await page.locator('[data-evo-action="close-archive"]').click();await expect(page.locator('#evo-run')).toBeEnabled();
  });
  await surface('ledger');await page.locator('#evo-import').setInputFiles(source);const before=await exportRun('before.json');await surface('arena');
  await scenario('eight arena plot families, full-sample statistics and corrected Core turn average',async()=>{
    await expect(page.locator('#evo-chart [data-evo-plot]')).toHaveCount(8);
    await expect(page.locator('[data-evo-metric="Avg full turns · incl. End"]')).toHaveText(model.summary.meanTurns.toFixed(2));
    await expect(page.locator('.evo-analysis-kpis')).toContainText('MINI-TURNS');await expect(page.locator('.evo-analysis-coverage')).toContainText('120 / 120');
    await expect(page.locator('.evo-cockpit-grid')).toHaveClass(/evo-graph-space/);await expect(page.locator('#evo-cockpit-inspector')).not.toBeVisible();
    const svg=page.locator('[data-evo-plot="full-turns"] svg');await expect(svg).toHaveAttribute('aria-label','Full-turn distribution');
  });
  await scenario('exact-value hover and keyboard inspection match sorted game ordinals',async()=>{
    await page.locator('[data-evo-plot="length-margin"] svg').evaluate(node=>node.scrollIntoView({block:'center'}));
    await page.locator('[data-evo-plot="length-margin"] circle').last().hover();await expect(page.locator('[data-evo-plot="length-margin"] .evo-plot-readout')).toContainText('seed');const mark=page.locator('[data-evo-plot="length-margin"] circle').first();await mark.focus();await page.keyboard.press('Enter');
    await expect(page.locator('#evo-inspector-content')).toContainText('Game 1');await expect(page.locator('#evo-inspector-content')).toContainText(String(series.run.records.find(r=>r.ordinal===0).seed));await expect(page.locator('#evo-inspector-content')).toContainText('Action sequence hash');await page.locator('[data-evo-close-inspector]').click();
  });
  await scenario('range filters preserve game ordinals, show incomplete pairs and support legend toggles',async()=>{
    await page.locator('#evo-chart-from').fill('2');await page.locator('#evo-chart-to').fill('31');await page.locator('#evo-chart-window').selectOption('25');await page.locator('#evo-chart-apply').click();
    await expect(page.locator('.evo-analysis-coverage')).toContainText('30 clean games');await expect(page.locator('[data-evo-plot="convergence"]')).toContainText('14 complete AB/BA pairs');
    await page.locator('[data-evo-toggle-series="rolling"]').click();await expect(page.locator('[data-evo-toggle-series="rolling"]')).toHaveAttribute('aria-pressed','false');await surface('overview');await surface('arena');await expect(page.locator('[data-evo-toggle-series="rolling"]')).toHaveAttribute('aria-pressed','false');
    await page.locator('#evo-chart-from').fill('9');await page.locator('#evo-chart-to').fill('3');await page.locator('#evo-chart-apply').click();await expect(page.locator('#evo-chart-filter-error')).toContainText('ordered game range');
    await page.locator('#evo-chart-from').fill('1');await page.locator('#evo-chart-to').fill('10000');await page.locator('#evo-chart-apply').click();await expect(page.locator('[data-evo-toggle-series="rolling"]')).toHaveAttribute('aria-pressed','false');await page.locator('[data-evo-toggle-series="rolling"]').click();
  });
  await scenario('accessible chart tables and standalone SVG export carry actual measurements',async()=>{
    await page.locator('[data-evo-plot="full-turns"] summary').click();await expect(page.locator('[data-evo-plot="full-turns"] table')).toContainText('A wins');
    const pending=page.waitForEvent('download');await page.locator('[data-evo-export-plot="full-turns"]').click();const download=await pending,target=path.join(output,'full-turns.svg');await download.saveAs(target);const svg=await readFile(target,'utf8');assert.match(svg,/xmlns="http:\/\/www.w3.org\/2000\/svg"/);assert.match(svg,/Full-turn distribution/);assert.doesNotMatch(svg,/NaN|var\(--|<script/);
    const after=await exportRun('after.json');assert.deepEqual(after.payload,before.payload);assert.equal(after.contentHash,before.contentHash);await surface('arena');
  });
  await scenario('timed-out seed reproduces in real browser workers with unchanged engine evidence',async()=>{
    const result=await page.evaluate(async identity=>{
      const {executeBrowserSeries}=await import('./evolution/evolution-browser-runner.mjs');
      return executeBrowserSeries({botA:'value',botB:'tempo',gameCount:2,seed:1337,seedCatalog:[1872215845],mirrorSeats:true,profileId:'core-advanced-authority',workerCount:2},{identity});
    },identity);
    assert.equal(result.run.status,'COMPLETE');assert.equal(result.run.records.length,2);report.timeoutSeed={status:result.run.status,elapsedMs:result.run.elapsedMs,records:result.run.records.map(r=>({swapped:r.swapped,seed:r.seed,turns:r.turns,winner:r.winner,resultHash:r.resultHash}))};
  });
  await scenario('partial execution failure stays distinct from recorded game faults',async()=>{
    const partial=structuredClone(series.run);partial.records=partial.records.filter(r=>r.ordinal<24);partial.replays=partial.replays.filter(r=>r.ordinal<24);partial.bookmarks=partial.bookmarks.filter(id=>partial.replays.some(r=>r.replayId===id));partial.nextOrdinal=24;partial.status='ERROR';partial.error='WORKER_TIMEOUT: diagnostic partial fixture';
    const target=path.join(output,'partial.json');await writeFile(target,JSON.stringify(artifactEnvelope(partial)));await surface('ledger');await page.locator('#evo-import').setInputFiles(target);await surface('arena');await expect(page.locator('.evo-analysis-coverage')).toContainText('96 without accepted records');await expect(page.locator('.evo-analysis-coverage')).toContainText('24 clean games / 0 recorded faults');await expect(page.locator('.evo-analysis-coverage')).toContainText('partial evidence');
  });
  await scenario('held-out heatmap, parameter heatmap, comparison bounds and behavioral divergence use real project evidence',async()=>{
    await surface('ledger');await page.locator('#evo-import-research').setInputFiles(adaptive);await surface('evidence');await expect(page.locator('[data-evo-plot="heldout-matrix"] svg')).toBeVisible();await page.locator('[data-evo-plot="heldout-matrix"] [data-evo-inspect^="evaluation:"]').first().focus();await page.keyboard.press('Enter');await expect(page.locator('#evo-inspector-content')).toContainText('Named opponent executions');await page.locator('[data-evo-close-inspector]').click();
    await surface('evolution');await expect(page.locator('[data-evo-plot="residual-matrix"] svg')).toBeVisible();const data=JSON.parse(await readFile(adaptive,'utf8')),cp=data.payload.generations[0].selectedCheckpointId;await page.locator(`.evo-lineage-rail [data-evo-inspect="checkpoint:${cp}"]`).click();await page.locator('#evo-inspector-content [data-evo-pair="root"]').click();await expect(page.locator('[data-evo-plot="comparison-bounds"]')).toBeVisible();await expect(page.locator('[data-evo-plot="comparison-deltas"]')).toBeVisible();await page.locator('#evo-tab-behavior').click();await expect(page.locator('[data-evo-plot="behavior-rates"]')).toBeVisible();await expect(page.locator('[data-evo-plot="behavior-shift"]')).toBeVisible();
    await page.screenshot({path:path.join(output,'behavior-desktop.png'),fullPage:true});
  });
  await scenario('390px responsive analytical plots preserve document width and keyboard focus',async()=>{
    await page.locator('[data-evo-close-inspector]').click();await surface('ledger');await page.locator('#evo-import').setInputFiles(source);
    await page.setViewportSize({width:390,height:844});await surface('arena');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=390),true);await expect(page.locator('[data-evo-plot="full-turns"] svg')).toBeVisible();await page.screenshot({path:path.join(output,'arena-mobile.png'),fullPage:true});
    await page.setViewportSize({width:1700,height:1150});await page.screenshot({path:path.join(output,'arena-desktop.png'),fullPage:true});
  });
  assert.deepEqual(errors,[]);report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;throw error;}
finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));}
