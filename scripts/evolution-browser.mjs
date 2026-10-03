/* global document, window, Worker, location, IDBDatabase, DOMException, indexedDB -- callbacks evaluated in browser */
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
const root=fileURLToPath(new URL('../',import.meta.url)), dist=path.join(root,'apps/lab-web/dist'), output=path.join(root,'reports/local/evolution-browser');
await mkdir(output,{recursive:true});
const server=http.createServer(async(req,res) => {
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/migration-fixture'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>IndexedDB migration fixture</title>');return;}
    const target=path.resolve(dist,`.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
    if (!target.startsWith(`${dist}${path.sep}`)) { res.writeHead(403).end(); return; }
    const data=await readFile(target);
    const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'}[path.extname(target)] ?? 'application/octet-stream';
    res.writeHead(200,{'Content-Type':mime}); res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
const page=await context.newPage(), errors=[], report={date:'2026-10-02',browser:await browser.version(),scenarios:[],errors};
page.on('pageerror',error => errors.push(error.message));
async function scenario(name,fn) { try { await fn(); report.scenarios.push({name,status:'PASS'}); console.log(`PASS ${name}`); } catch(error) { report.scenarios.push({name,status:'FAIL',error:error.message}); throw error; } }
async function exported(name) { const download=page.waitForEvent('download'); await page.locator('#evo-export').click(); const file=await download; const target=path.join(output,name); await file.saveAs(target); return JSON.parse(await readFile(target,'utf8')); }
async function configure(games=20,workers=2) { await page.locator('#evo-games').fill(String(games)); await page.locator('#evo-workers').selectOption(String(workers)); await page.locator('#evo-seed').fill('42'); }
try {
  await scenario('route and unsupported configuration rejection',async() => {
    await page.goto(`${base}/#/evolution`); await expect(page.getByTestId('evolution-lab')).toBeVisible({timeout:30000});
    await page.locator('#evo-seed').fill('-1'); await page.locator('#evo-run').click(); await expect(page.locator('#evo-error')).toContainText('INVALID_SEED');
    await expect(page.locator('#evo-bot-a option[value="hybrix-rusher"]')).toHaveCount(0);
  });
  let paused;
  await scenario('real workers pause, persist and resume after reload',async() => {
    await configure(100,2); await page.locator('#evo-run').click();
    await expect.poll(async() => Number((await page.locator('#evo-progress-count').textContent()).split('/')[0].trim()),{timeout:60000}).toBeGreaterThan(2);
    await page.locator('#evo-pause').click(); await expect(page.locator('#evo-state')).toHaveText('PAUSED');
    paused=await exported('paused.json'); assert.ok(paused.payload.records.length > 0 && paused.payload.records.length < 100);
    await expect(page.locator('#evo-storage')).toContainText('1 saved runs',{timeout:15000});
    await page.reload(); await expect(page.getByTestId('evolution-lab')).toBeVisible();
    await page.locator('[data-load-run]').first().click(); await expect(page.locator('#evo-state')).toHaveText('PAUSED');
    await page.locator('#evo-resume').click(); await expect(page.locator('#evo-state')).toHaveText('COMPLETE',{timeout:120000});
    const completed=await exported('completed.json'); assert.equal(completed.payload.records.length,100);
    assert.equal(new Set(completed.payload.records.map(r => r.ordinal)).size,100);
    for (const record of paused.payload.records) assert.deepEqual(completed.payload.records.find(r => r.ordinal === record.ordinal),record);
    await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true});
  });
  await scenario('replay verification, navigation and bookmarks',async() => {
    await page.locator('[data-inspect]').first().click(); await expect(page.locator('#evo-inspection')).toContainText('VERIFIED',{timeout:30000});
    await page.locator('#evo-next').click(); await expect(page.locator('#evo-inspection pre')).toContainText('"index": 1');
    await page.locator('#evo-prev').click(); await expect(page.locator('#evo-inspection pre')).toContainText('INITIAL');
    await page.locator('[data-bookmark]').first().click(); await expect(page.locator('[data-bookmark]').first()).toHaveAttribute('aria-pressed','true');
    const bookmarked=await exported('bookmarked.json'); assert.equal(bookmarked.payload.bookmarks.length,1);
  });
  await scenario('artifact round trip and malformed import rejection',async() => {
    const file=path.join(output,'bookmarked.json'); await page.locator('#evo-reset').click(); await page.locator('#evo-import').setInputFiles(file); await expect(page.locator('#evo-state')).toHaveText('COMPLETE');
    const bad=JSON.parse(await readFile(file,'utf8')); bad.payload.config.seed=999;
    await writeFile(path.join(output,'tampered.json'),JSON.stringify(bad)); await page.locator('#evo-import').setInputFiles(path.join(output,'tampered.json')); await expect(page.locator('#evo-error')).toContainText('ARTIFACT_HASH_MISMATCH');
  });
  await scenario('independent frozen benchmark evaluation with paired seats',async() => {
    await page.locator('#evo-eval-games').fill('12'); await page.locator('#evo-evaluate-a').click(); await expect(page.locator('#evo-state')).toHaveText('COMPLETE',{timeout:60000});
    await expect(page.locator('#evo-evaluation-results')).toContainText('EVALUATED PERFORMANCE'); const artifact=await exported('evaluation.json');
    assert.equal(artifact.payload.kind,'EVALUATION'); assert.equal(artifact.payload.records.length,12);
    for (let i=0;i<12;i+=2) { assert.equal(artifact.payload.records[i].seed,artifact.payload.records[i+1].seed); assert.notEqual(artifact.payload.records[i].swapped,artifact.payload.records[i+1].swapped); }
    assert.ok(artifact.payload.checkpoints.every(c => c.generation === 0 && Object.keys(c.policyState).length === 0));
  });
  await scenario('stop and route cleanup release workers',async() => {
    await page.evaluate(() => { const Original=Worker; window.__labWorkers=[]; window.Worker=class extends Original { constructor(...args) { super(...args); window.__labWorkers.push(this); } }; });
    await configure(1000,4); await page.locator('#evo-run').click(); await page.locator('#evo-stop').click(); await expect(page.locator('#evo-state')).toHaveText('STOPPED');
    await page.locator('#evo-run').click(); await expect(page.locator('#evo-state')).toHaveText('RUNNING');
    await page.evaluate(() => { window.__labWorkers[0].onmessage({data:{type:'evolution-fault',epoch:1,error:'STALE_FAULT'}}); });
    await expect(page.locator('#evo-state')).toHaveText('RUNNING'); await expect(page.locator('#evo-error')).not.toContainText('STALE_FAULT');
    await page.evaluate(() => { location.hash='/evidence'; }); await expect(page.getByTestId('evolution-lab')).toHaveCount(0);
    await page.evaluate(() => { location.hash='/evolution'; }); await expect(page.locator('#evo-state')).toHaveText('PAUSED');
    await page.locator('#evo-stop').click();
  });
  await scenario('responsive layout and quota failure preserve export',async() => {
    await page.setViewportSize({width:390,height:844}); await page.screenshot({path:path.join(output,'mobile.png'),fullPage:true});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth+2),'mobile horizontal overflow');
    await page.evaluate(() => { const original=IDBDatabase.prototype.transaction; IDBDatabase.prototype.transaction=function(...args) { if (args[1] === 'readwrite') throw new DOMException('Quota exceeded','QuotaExceededError'); return original.apply(this,args); }; });
    await configure(2,1); await page.locator('#evo-run').click(); await expect(page.locator('#evo-state')).toHaveText('COMPLETE',{timeout:60000});
    await expect(page.locator('#evo-storage')).toContainText('Save failed',{timeout:10000}); const quota=await exported('quota.json'); assert.equal(quota.payload.records.length,2);
  });
  await scenario('ordinary human versus AI match still starts',async() => {
    await page.reload(); // restore native IndexedDB after the quota fault injection
    await page.evaluate(() => { location.hash='/play/new'; });
    await expect(page.getByTestId('start-match')).toBeVisible({timeout:30000});
    await page.getByTestId('start-match').click();
    await expect(page.locator('.hc-game')).toBeVisible({timeout:30000});
    await expect(page.locator('.hc-action:enabled, .hc-family:enabled').first()).toBeVisible({timeout:30000});
  });
  await scenario('experiments, controlled cloning, frozen suite, comparison and research persistence',async()=>{
    await page.setViewportSize({width:1440,height:1000});
    await page.evaluate(()=>{location.hash='/evolution';});await expect(page.locator('#evo-create-experiment')).toBeVisible();
    await page.locator('#evo-pack-pairs').fill('1');await page.locator('#evo-experiment-name').fill('Browser scientific fixture');await page.locator('#evo-create-experiment').click();
    await expect(page.locator('#evo-research-state')).toHaveText('IDLE');
    await page.locator('#evo-suite-evaluate').click();await expect(page.locator('#evo-research-state')).toHaveText('COMPLETE',{timeout:120000});
    await expect(page.locator('#evo-research-evaluations')).toContainText('tempo');await page.locator('#evo-compare-checkpoints').click();await expect(page.locator('#evo-checkpoint-comparison')).toContainText('Measured deltas');
    const downloadPromise=page.waitForEvent('download');await page.locator('#evo-export-research').click();const download=await downloadPromise;await download.saveAs(path.join(output,'research.json'));
    await page.locator('#evo-clone-experiment').click();await expect(page.locator('#evo-research')).toContainText('Changes from parent');
    await page.reload();await expect(page.locator('[data-load-experiment]').first()).toBeVisible();await page.locator('[data-load-experiment]').first().click();await expect(page.locator('#evo-research-state')).toBeVisible();
    await page.locator('#evo-import-research').setInputFiles(path.join(output,'research.json'));await expect(page.locator('#evo-research')).toContainText('Imported research claims');
    await expect(page.locator('#evo-research-error')).toHaveText('');
  });
  await scenario('adaptive stop, resume, generation advancement, historical checkpoint and export',async()=>{
    await page.evaluate(()=>{const Base=Worker;window.__researchWorkers=[];window.Worker=class extends Base{constructor(...args){super(...args);window.__researchWorkers.push(this);}};});
    await page.locator('#evo-training-generations').fill('1');await page.locator('#evo-training-candidates').fill('1');await page.locator('#evo-training-pairs').fill('1');await page.locator('#evo-training-step').fill('1000');await page.locator('#evo-pack-pairs').fill('1');await page.locator('#evo-create-training').click();
    await expect(page.locator('#evo-research-state')).toHaveText('IDLE');await page.locator('#evo-train').click();await expect(page.locator('#evo-research-state')).toHaveText('RUNNING');await page.locator('#evo-research-stop').click();await expect(page.locator('#evo-research-state')).toHaveText('STOPPED',{timeout:30000});
    await page.locator('#evo-train').click();await page.evaluate(()=>{window.__researchWorkers[0].onmessage({data:{type:'evolution-fault',epoch:1,error:'STALE_RESEARCH_FAULT'}});});await expect(page.locator('#evo-research-state')).toHaveText('RUNNING');await expect(page.locator('#evo-research-error')).not.toContainText('STALE_RESEARCH_FAULT');await expect(page.locator('#evo-research-state')).toHaveText('COMPLETE',{timeout:240000});
    await expect(page.locator('#evo-training-controls')).toContainText('2 committed lineage generations');
    await page.locator('#evo-history-refresh').click();await expect(page.locator('#evo-history')).toContainText('TRAINING');
    await page.locator('#evo-history .evo-replay-row').filter({hasText:'TRAINING'}).first().locator('[data-load-run]').click();await expect(page.locator('#evo-evaluation-results')).toContainText('TRAINING SELECTION PERFORMANCE');
    const historical=await exported('training-history.json');assert.equal(historical.payload.researchPurpose,'TRAINING');await expect(page.locator('#evo-run')).toBeDisabled();
    for(const cp of historical.payload.checkpoints)await expect(page.getByTestId('evo-checkpoints')).toContainText(`generation ${cp.generation}`);
    await expect(page.getByTestId('evo-arena')).toContainText('immutable weighted checkpoint');
    const downloadPromise=page.waitForEvent('download');await page.locator('#evo-export-research').click();const download=await downloadPromise;const file=path.join(output,'adaptive.json');await download.saveAs(file);
    const envelope=JSON.parse(await readFile(file,'utf8'));assert.equal(envelope.payload.generations.length,2);assert.deepEqual(envelope.payload.checkpoints[0].policyState,envelope.payload.checkpoints[1].policyState);
    await page.reload();await expect(page.locator('[data-load-experiment]').first()).toBeVisible();await page.locator('#evo-import-research').setInputFiles(file);await expect(page.locator('#evo-research-state')).toHaveText('COMPLETE');
    await page.locator('#evo-checkpoint-left').selectOption(envelope.payload.checkpoints[0].checkpointId);await page.locator('#evo-checkpoint-right').selectOption(envelope.payload.generations[0].selectedCheckpointId);await page.locator('#evo-compare-checkpoints').click();await expect(page.locator('#evo-checkpoint-comparison')).toContainText('beforeInterval');
    await page.screenshot({path:path.join(output,'adaptive-desktop.png'),fullPage:true});await page.locator('#evo-training-controls').screenshot({path:path.join(output,'adaptive-controls.png')});await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+2),'adaptive mobile horizontal overflow: '+JSON.stringify(await page.evaluate(()=>Array.from(document.querySelectorAll('#evo-research *')).filter(e=>e.getBoundingClientRect().right>document.documentElement.clientWidth+2 && !e.closest('.evo-table-scroll')).slice(0,8).map(e=>({tag:e.tagName,id:e.id,right:e.getBoundingClientRect().right})))));await page.locator('#evo-training-controls').screenshot({path:path.join(output,'adaptive-mobile.png')});
  });
  await scenario('schema-1 IndexedDB upgrades preserve frozen run/checkpoint identities',async()=>{
    const legacy=JSON.parse(await readFile(path.join(output,'completed.json'),'utf8'));
    const migrationContext=await browser.newContext(),migrationPage=await migrationContext.newPage();migrationPage.on('pageerror',error=>errors.push(error.message));
    try{
      await migrationPage.goto(new URL('/migration-fixture',page.url()).href);
      await migrationPage.evaluate(async envelope=>{
        const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('intrilex-evolution-lab',1);req.onupgradeneeded=()=>{req.result.createObjectStore('runs',{keyPath:'payload.runId'});req.result.createObjectStore('history',{keyPath:'runId'});req.result.createObjectStore('checkpoints',{keyPath:'checkpointId'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
        await new Promise((resolve,reject)=>{const tx=db.transaction(['runs','history','checkpoints'],'readwrite'),run=envelope.payload;tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);tx.objectStore('runs').put(envelope);tx.objectStore('history').put({runId:run.runId,createdAt:run.createdAt,status:run.status,kind:run.kind,games:run.records.length,botA:run.config.botA,botB:run.config.botB,bytes:JSON.stringify(envelope).length,fingerprint:run.identity.fingerprint});for(const cp of run.checkpoints)tx.objectStore('checkpoints').add(cp);});db.close();
      },legacy);
      await migrationPage.goto(new URL('/#/evolution',page.url()).href);await expect(migrationPage.locator('[data-load-run]')).toBeVisible();await migrationPage.locator('[data-load-run]').click();await expect(migrationPage.locator('#evo-state')).toHaveText('COMPLETE');
      await expect(migrationPage.getByTestId('evo-checkpoints')).toContainText(legacy.payload.checkpoints[0].checkpointId);
      const stores=await migrationPage.evaluate(async()=>{const db=await new Promise(resolve=>{const req=indexedDB.open('intrilex-evolution-lab');req.onsuccess=()=>resolve(req.result);});const result={version:db.version,stores:Array.from(db.objectStoreNames)};db.close();return result;});assert.equal(stores.version,2);assert.ok(stores.stores.includes('research'));
    }finally{await migrationContext.close();}
  });
  assert.deepEqual(errors,[]); report.status='PASS';
} catch(error) { report.status='FAIL'; report.error=error.stack; report.uiError=await page.locator('#evo-error').textContent().catch(() => null); report.url=page.url(); await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}); process.exitCode=1; }
finally { await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2)); await browser.close(); await new Promise(resolve => server.close(resolve)); }
