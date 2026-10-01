/* global PerformanceObserver, document, innerWidth -- evaluated in Chrome */
import { chromium } from '@playwright/test';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureProvenance } from './release-provenance.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const dist=path.join(root,'apps/lab-web/dist');
async function inventory(dir) {
  const files=[];
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    const target=path.join(dir,entry.name);
    if(entry.isDirectory()) files.push(...await inventory(target));
    else if(entry.isFile()) { const bytes=await readFile(target); files.push({name:path.relative(dist,target).replaceAll('\\','/'),bytes:bytes.length,gzipBytes:gzipSync(bytes).length}); }
  }
  return files;
}
const files=await inventory(dist),browser=await chromium.launch({channel:'chrome',headless:true});
const report={provenance:captureProvenance(root),scope:'LOCAL_COLD_CONTEXT_LANDING_NO_NETWORK_OR_CPU_THROTTLING',browser:browser.version(),
  totalFiles:files.length,totalBytes:files.reduce((sum,f)=>sum+f.bytes,0),largest:files.sort((a,b)=>b.bytes-a.bytes).slice(0,15),runs:[],errors:[]};
try {
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]) {
    const context=await browser.newContext({viewport});
    const page=await context.newPage();
    page.on('pageerror',error=>report.errors.push(error.message));
    await page.addInitScript(()=>{
      globalThis.deliveryVitals={lcp:null,cls:0,longTasks:[]};
      new PerformanceObserver(list=>{for(const entry of list.getEntries()) globalThis.deliveryVitals.lcp=entry.startTime;}).observe({type:'largest-contentful-paint',buffered:true});
      new PerformanceObserver(list=>{for(const entry of list.getEntries()) if(!entry.hadRecentInput) globalThis.deliveryVitals.cls+=entry.value;}).observe({type:'layout-shift',buffered:true});
      new PerformanceObserver(list=>{for(const entry of list.getEntries()) globalThis.deliveryVitals.longTasks.push(entry.duration);}).observe({type:'longtask',buffered:true});
    });
    await page.goto(process.env.HOMECOMING_BASE_URL??'http://127.0.0.1:4175');
    await page.waitForLoadState('networkidle');
    const measurement=await page.evaluate(()=>({vitals:globalThis.deliveryVitals,
      navigation:performance.getEntriesByType('navigation')[0].toJSON(),
      resources:performance.getEntriesByType('resource').map(r=>({name:new URL(r.name).pathname,transferSize:r.transferSize,encodedBodySize:r.encodedBodySize,duration:r.duration})),
      horizontalOverflow:document.documentElement.scrollWidth>innerWidth}));
    report.runs.push({viewport,...measurement});
    await context.close();
  }
} finally {await browser.close();}
report.status=report.errors.length?'FAIL':'PASS';
await mkdir(path.join(root,'reports/local'),{recursive:true});
await writeFile(path.join(root,'reports/local/delivery-measurement.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,runs:report.runs.map(r=>({viewport:r.viewport,vitals:r.vitals,requests:r.resources.length,transferBytes:r.resources.reduce((sum,e)=>sum+e.transferSize,0),horizontalOverflow:r.horizontalOverflow}))},null,2));
if(report.status!=='PASS') process.exitCode=1;
