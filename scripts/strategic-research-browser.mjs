/* global document */
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,expect} from '@playwright/test';
import {runLabSeries,evolutionIdentity} from '../packages/simulation-runtime/src/evolution-lab.mjs';
import {validateMatchupArtifact,matchupMatrix} from '../packages/simulation-runtime/src/matchup-lab.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),dist=path.join(root,'apps/lab-web/dist'),out=path.join(root,'reports/local/strategic-browser');
await mkdir(out,{recursive:true});
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost'),target=path.resolve(dist,`.${decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname)}`);if(!target.startsWith(dist+path.sep)){res.writeHead(403).end();return;}const data=await readFile(target);res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2','.webp':'image/webp','.png':'image/png'}[path.extname(target)]??'application/octet-stream'}).end(data);}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1700,height:1100},acceptDownloads:true}),errors=[],report={status:'RUNNING',scenarios:[],browser:browser.version()};page.on('pageerror',e=>errors.push(e.message));
const surface=name=>page.locator(`.evo-navigation [data-evo-surface="${name}"]`).click();
async function download(button,name){const promise=page.waitForEvent('download');await page.locator(button).click();const item=await promise,file=path.join(out,name);await item.saveAs(file);return readFile(file,'utf8');}
try{
  await page.goto(`http://127.0.0.1:${server.address().port}/#/evolution?view=arena`);await expect(page.getByTestId('evolution-lab')).toBeVisible({timeout:30000});
  await page.locator('#evo-bot-a').selectOption('control-conversion-tactical');await page.locator('#evo-bot-b').selectOption('score-rush-tactical');await page.locator('#evo-games').fill('4');await page.locator('#evo-deep-trace').check();await page.locator('#evo-run').click();await expect(page.locator('#evo-state')).toHaveText('COMPLETE',{timeout:120000});
  await expect(page.locator('#evo-chart [data-evo-plot]')).toHaveCount(11);await expect(page.locator('[data-evo-plot="conversion-funnel"]')).toContainText('Association only');
  await surface('ledger');const before=JSON.parse(await download('#evo-export','before.json')),identity=await evolutionIdentity();
  const node=(await runLabSeries(before.payload.config,{identity,createdAt:before.payload.createdAt})).run;
  for(const r of before.payload.records){const n=node.records.find(g=>g.ordinal===r.ordinal);assert.equal(r.resultHash,n.resultHash);assert.deepEqual(r.strategicTelemetry,n.strategicTelemetry);assert.deepEqual(r.terminalEvidence,n.terminalEvidence);}
  report.scenarios.push('Real browser workers and Node match exactly, including deep traces and terminal anchor facts');
  await surface('arena');await page.locator('#evo-filter-seat').selectOption('BA');await page.locator('#evo-chart-apply').click();await expect(page.locator('.evo-analysis-coverage')).toContainText('2 clean games');
  const svg=await download('[data-evo-export-plot="action-opportunities"]','opportunities.svg');assert.match(svg,/intrilex.research.action-opportunities/);assert.match(svg,/control-conversion-tactical/);assert.match(svg,/5.0.0/);assert.match(svg,/denominator/);assert.match(svg,/rawDataRows/);assert.match(svg,/acceptedRecordCount/);
  await surface('ledger');const after=JSON.parse(await download('#evo-export','after.json'));assert.deepEqual(after,before);
  report.scenarios.push('Seat filtering leaves artifact bytes unchanged; SVG carries semantic identity, exact denominator, raw data and frozen versions');
  await surface('arena');await page.locator('#evo-matrix-games').fill('2');await page.locator('#evo-matrix-seeds').fill('991');await page.locator('#evo-matrix-run').click();await expect(page.locator('#evo-matrix-status')).toHaveText('COMPLETE',{timeout:120000});
  await expect(page.locator('[data-evo-plot="round-robin-matrix"]')).toBeVisible();await expect(page.locator('[data-evo-plot="strategy-fingerprint"]')).toBeVisible();
  const artifact=JSON.parse(await download('#evo-matrix-export','matrix.json')),lab=validateMatchupArtifact(artifact),matrix=matchupMatrix(lab);assert.equal(matrix.acceptedGames,20);assert.equal(matrix.cells.length,10);assert.equal(lab.checkpoints.find(cp=>cp.policyId==='control-conversion-tactical').policyVersion,'5.0.0');
  const matrixSvg=await download('[data-evo-export-plot="round-robin-matrix"]','matrix.svg');assert.match(matrixSvg,/5.0.0/);assert.match(matrixSvg,/masterSeedPacks/);
  await page.locator('#evo-matrix-import').setInputFiles(path.join(out,'matrix.json'));await expect(page.locator('#evo-matrix-status')).toHaveText('COMPLETE');
  report.scenarios.push('Browser round robin executes all ten paired matchups, freezes versions, renders fingerprints and round-trips its artifact');
  await page.locator('[data-evo-plot="terminal-inspector"] [data-evo-tooltip]').first().focus();assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('tabindex')),'0');
  await page.screenshot({path:path.join(out,'arena-desktop.png'),fullPage:true});await page.locator('[data-evo-plot="round-robin-matrix"]').screenshot({path:path.join(out,'matrix-desktop.png')});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=390),true);await page.screenshot({path:path.join(out,'arena-mobile.png'),fullPage:true});
  report.scenarios.push('390px layout contains the document; SVG marks support keyboard focus');assert.deepEqual(errors,[]);report.status='PASS';console.log(JSON.stringify(report));
}catch(error){report.status='FAIL';report.error=error.stack;throw error;}
finally{report.errors=errors;await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(resolve=>server.close(resolve));}
