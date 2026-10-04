/* global document */
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,expect} from '@playwright/test';
import {runLabSeries,evolutionIdentity} from '../packages/simulation-runtime/src/evolution-lab.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),dist=path.join(root,'apps/lab-web/dist'),output=path.join(root,'reports/local/policy-actions/browser');
await mkdir(output,{recursive:true});
const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost'),target=path.resolve(dist,`.${decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname)}`);
  if(!target.startsWith(`${dist}${path.sep}`)){res.writeHead(403).end();return;}
  const data=await readFile(target);res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'}[path.extname(target)]??'application/octet-stream'}).end(data);
}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']}),page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
const errors=[],report={status:'RUNNING',browser:browser.version(),scenarios:[]};page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto(`http://127.0.0.1:${server.address().port}/#/evolution?view=arena`);
  await expect(page.getByTestId('evolution-lab')).toBeVisible({timeout:30000});
  await page.locator('#evo-bot-a').selectOption('score-rush-tactical');await page.locator('#evo-bot-b').selectOption('tempo-tactical');
  await page.locator('#evo-games').fill('4');await page.locator('#evo-run').click();
  await expect(page.locator('#evo-state')).toHaveText('COMPLETE',{timeout:120000});
  await expect(page.locator('#evo-chart [data-evo-plot]')).toHaveCount(11);
  const chart=page.locator('[data-evo-plot="action-opportunities"]');await expect(chart).toContainText('Selection when legal');
  await expect(chart).toContainText('Selected declarations are not resolved effects');await chart.locator('summary').click();
  await expect(chart.locator('table')).toContainText('mode:swap-bar:face-down');await expect(chart.locator('table')).toContainText('A available');
  report.scenarios.push('Real browser workers complete v4 paired games and render available/selected action windows');
  await page.locator('.evo-navigation [data-evo-surface="ledger"]').click();const pending=page.waitForEvent('download');await page.locator('#evo-export').click();
  const download=await pending,target=path.join(output,'tactical-workers.json');await download.saveAs(target);
  const run=JSON.parse(await readFile(target,'utf8')).payload;assert.equal(run.checkpoints[0].policyVersion,'4.0.0');
  const node=(await runLabSeries(run.config,{identity:await evolutionIdentity(),createdAt:run.createdAt})).run;
  for(const r of run.records){const expected=node.records.find(x=>x.ordinal===r.ordinal);
    for(const key of ['initialStateHash','actionSequenceHash','finalStateHash','winner','resultHash'])assert.equal(r[key],expected[key]);
    assert.deepEqual(r.seatBehavior.map(s=>s.actionCoverage),expected.seatBehavior.map(s=>s.actionCoverage));
  }
  report.scenarios.push('Node/browser game evidence and per-seat opportunity counts agree');
  await page.locator('.evo-navigation [data-evo-surface="arena"]').click();await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=390),true);
  await page.screenshot({path:path.join(output,'action-coverage-mobile.png'),fullPage:true});
  report.scenarios.push('390px viewport preserves document width');assert.deepEqual(errors,[]);report.status='PASS';
  console.log(JSON.stringify(report));
}catch(error){report.status='FAIL';report.error=error.stack;throw error;}
finally{report.errors=errors;await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(resolve=>server.close(resolve));}
