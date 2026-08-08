import http from 'node:http';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { hashCanonical as nodeHashCanonical, verifyAuthorityCertifiedReplay as nodeVerifyCertifiedReplay } from '@intrilex/engine-adapter';
import { runPolicyMatch as runNodePolicyMatch } from '@intrilex/simulation-runtime';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const writeReports=process.env.INTRILEX_WRITE_REPORTS!=='0';
const dist=path.join(root,'apps/lab-web/dist'),engineDir=path.join(dist,'engine');
const replayDir=path.join(root,'upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix/replays');
const reportPath=path.join(root,'reports/browser-parity.json'),reportMdPath=path.join(root,'reports/BROWSER_PARITY_CERTIFICATION.md');
if(process.env.INTRILEX_SKIP_BUILD!=='1'){
  const build=spawnSync(process.execPath,['scripts/build.mjs'],{cwd:root,stdio:'inherit',env:{...process.env,INTRILEX_SKIP_AUTONOMY_REPLAY_REGEN:'1'}});
  if(build.status!==0)process.exit(build.status??1);
}
async function reservePort(){const server=http.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));return port;}
async function connectCdp(port){
  let page;for(let i=0;i<200;i+=1){const targets=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json()).catch(()=>[]);page=targets.find(t=>t.type==='page');if(page?.webSocketDebuggerUrl)break;await new Promise(r=>setTimeout(r,100));}
  if(!page?.webSocketDebuggerUrl)throw new Error('Chromium CDP page target not found');
  const socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',()=>reject(new Error('CDP WebSocket failed')),{once:true});});
  let id=0;const pending=new Map();socket.addEventListener('message',event=>{const message=JSON.parse(event.data),waiter=pending.get(message.id);if(!waiter)return;pending.delete(message.id);message.error?waiter.reject(new Error(message.error.message)):waiter.resolve(message.result);});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const requestId=++id;pending.set(requestId,{resolve,reject});socket.send(JSON.stringify({id:requestId,method,params}));});await call('Runtime.enable');
  const evaluate=async(expression,awaitPromise=false)=>{const result=await call('Runtime.evaluate',{expression,awaitPromise,returnByValue:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);return result.result.value;};
  return{socket,evaluate};
}
async function moduleGraph(entryName){
  const sources=new Map(),deps=new Map(),order=[];const pattern=/from\s+["']\.\/(.+?\.js)["']/g;
  async function visit(name){if(sources.has(name))return;const source=await readFile(path.join(engineDir,name),'utf8');const list=[...source.matchAll(pattern)].map(m=>m[1]);sources.set(name,source);deps.set(name,list);for(const dep of list)await visit(dep);order.push(name);}
  await visit(entryName);return{sources,deps,order};
}
// Serve dist files via HTTP to handle circular dependencies naturally
const enginePort=await reservePort();
const distServer=http.createServer(async(req,res)=>{
  try{
    const urlPath=decodeURIComponent(req.url.split('?')[0]);
    const filePath=path.join(dist,urlPath);
    const ext=path.extname(urlPath);
    const mime={'.js':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html'}[ext]??'application/octet-stream';
    const data=await readFile(filePath);
    res.writeHead(200,{'Content-Type':mime,'Content-Length':data.length,'Access-Control-Allow-Origin':'*'});
    res.end(data);
  }catch(e){res.writeHead(404,{'Access-Control-Allow-Origin':'*'});res.end('Not found');}
});
await new Promise(r=>distServer.listen(enginePort,'127.0.0.1',r));
const distBaseUrl=`http://127.0.0.1:${enginePort}`;
const debugPort=await reservePort(),profileDir=await mkdtemp(path.join(tmpdir(),'intrilex-v070-browser-'));
const chromium=process.env.CHROMIUM_BIN??(process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':existsSync('/mnt/c/Program Files/Google/Chrome/Application/chrome.exe')?'/mnt/c/Program Files/Google/Chrome/Application/chrome.exe':'/usr/lib/chromium/chromium');
// Check if we're in WSL (Linux under Windows) where Windows Chrome can't be reached via CDP
const isWsl=process.platform==='linux'&&existsSync('/proc/version')&&readFileSync('/proc/version','utf8').toLowerCase().includes('microsoft');
if(isWsl){
  console.log('BROWSER PARITY SKIP: Windows Chrome CDP not reachable from WSL — run from PowerShell instead');
  process.exit(0);
}
if(!existsSync(chromium)){
  console.log('BROWSER PARITY SKIP: Chromium not found at '+chromium+' (set CHROMIUM_BIN env var or install Chrome)');
  process.exit(0);
}
const child=spawn(chromium,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--disable-default-apps','--disable-extensions','--disable-sync','--disable-breakpad','--disable-crash-reporter','--no-proxy-server','--metrics-recording-only','--no-first-run',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profileDir}`,'about:blank'],{cwd:root,stdio:'ignore',detached:true});child.unref();
let cdp;
try{
  cdp=await connectCdp(debugPort);
  const { order}=await moduleGraph('browser-entry.js');
  // Use HTTP URLs instead of blob URLs to handle circular dependencies
  const urls=new Map();
  for(const name of order){urls.set(name,`${distBaseUrl}/engine/${name}`);}
  console.log('Module order:',order.join(', '));
  const entryUrl=urls.get('browser-entry.js');console.log('Entry URL:',entryUrl);
  const exported=await cdp.evaluate(`import(${JSON.stringify(entryUrl)}).then(m=>{globalThis.__intrilex=m;return Object.keys(m).sort()})`,true);
  for(const required of ['hashCanonical','sha256Text','verifyCertifiedReplay','CORE_ADVANCED_AUTHORITY_PROFILE'])if(!exported.includes(required))throw new Error(`Browser export missing: ${required}`);

  // Load HYBRIX modules via HTTP (handles circular deps naturally)
  const hybrixDir=path.join(dist,'hybrix');
  const hybrixFiles=(await readdir(hybrixDir)).filter(f=>f.endsWith('.js'));
  const hybrixUrls=new Map();
  for(const name of hybrixFiles){hybrixUrls.set(name,`${distBaseUrl}/hybrix/${name}`);}
  const hybrixPolicyAdapterUrl=hybrixUrls.get('policy-adapter.js');
  const policyUrl=`${distBaseUrl}/autonomy-runtime.js`;
  await cdp.evaluate(`import(${JSON.stringify(policyUrl)}).then(m=>{globalThis.__intrilexPolicies=m;return Object.keys(m)})`,true);
  const names=(await readdir(replayDir)).filter(n=>n.endsWith('.certified.replay.json')&&!n.includes('.public.certified.')).sort();const replays=[];for(const name of names)replays.push(JSON.parse(await readFile(path.join(replayDir,name),'utf8')));
  const nodeSummaries=replays.map(replay=>{const verified=nodeVerifyCertifiedReplay(replay);return{fixtureId:replay.fixtureId,contentHash:replay.contentHash,finalStateHash:replay.finalStateHash,accepted:verified.accepted.length,events:verified.events.length};});
  const nodeReference={replayCount:nodeSummaries.length,commandCount:nodeSummaries.reduce((s,x)=>s+x.accepted,0),eventCount:nodeSummaries.reduce((s,x)=>s+x.events,0),aggregateHash:nodeHashCanonical(nodeSummaries)};
  const nodeRaw=runNodePolicyMatch({ordinal:0,seed:0x1a2b3c4d,profileId:'core-advanced-authority',policyIds:['score-rush','control'],seatOrder:['P1','P2'],includeReplay:false}).summary;
  const nodePolicy={terminationReason:nodeRaw.terminationReason,winner:nodeRaw.winner,winningSeat:nodeRaw.winningSeat,decisionCount:nodeRaw.policyDecisionCount,responseDecisionCount:nodeRaw.responseDecisionCount,privateChoiceDecisionCount:nodeRaw.privateChoiceDecisionCount,advancedDecisionCount:nodeRaw.advancedDecisionCount,ultraDecisionCount:nodeRaw.ultraDecisionCount,voltageDecisionCount:nodeRaw.voltageDecisionCount,commandCount:nodeRaw.commandCount,finalStateHash:nodeRaw.finalStateHash,finalScores:nodeRaw.finalScores};
  await cdp.evaluate(`globalThis.__intrilexReplays=${JSON.stringify(replays)};${replays.length}`);
  const main=await cdp.evaluate(`(async()=>{const vectors=[['','e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],['abc','ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad']];for(const [text,expected] of vectors)if(__intrilex.sha256Text(text)!==expected)throw new Error('SHA mismatch');const started=performance.now();const summaries=__intrilexReplays.map(replay=>{const v=__intrilex.verifyCertifiedReplay(replay);return{fixtureId:replay.fixtureId,contentHash:replay.contentHash,finalStateHash:replay.finalStateHash,accepted:v.accepted.length,events:v.events.length}});const p=__intrilexPolicies.runBrowserPolicyMatch({ordinal:0,seed:0x1a2b3c4d,profileId:'core-advanced-authority',policyIds:['score-rush','control']});return{replayCount:summaries.length,commandCount:summaries.reduce((s,x)=>s+x.accepted,0),eventCount:summaries.reduce((s,x)=>s+x.events,0),aggregateHash:__intrilex.hashCanonical(summaries),policy:{terminationReason:p.terminationReason,winner:p.winner,winningSeat:p.winningSeat,decisionCount:p.policyDecisionCount,responseDecisionCount:p.responseDecisionCount,privateChoiceDecisionCount:p.privateChoiceDecisionCount,advancedDecisionCount:p.advancedDecisionCount,ultraDecisionCount:p.ultraDecisionCount,voltageDecisionCount:p.voltageDecisionCount,commandCount:p.commandCount,finalStateHash:p.finalStateHash,finalScores:p.finalScores},durationMs:Math.round(performance.now()-started),userAgent:navigator.userAgent,sha256Vectors:vectors.length}})()`,true);
  const workerSource=`self.onmessage=async({data})=>{try{const engine=await import(${JSON.stringify(entryUrl)}),policies=await import(${JSON.stringify(policyUrl)}),started=performance.now();const summaries=data.map(replay=>{const v=engine.verifyCertifiedReplay(replay);return{fixtureId:replay.fixtureId,contentHash:replay.contentHash,finalStateHash:replay.finalStateHash,accepted:v.accepted.length,events:v.events.length}});const p=policies.runBrowserPolicyMatch({ordinal:0,seed:0x1a2b3c4d,profileId:'core-advanced-authority',policyIds:['score-rush','control']});self.postMessage({ok:true,result:{replayCount:summaries.length,commandCount:summaries.reduce((s,x)=>s+x.accepted,0),eventCount:summaries.reduce((s,x)=>s+x.events,0),aggregateHash:engine.hashCanonical(summaries),policy:{terminationReason:p.terminationReason,winner:p.winner,winningSeat:p.winningSeat,decisionCount:p.policyDecisionCount,responseDecisionCount:p.responseDecisionCount,privateChoiceDecisionCount:p.privateChoiceDecisionCount,advancedDecisionCount:p.advancedDecisionCount,ultraDecisionCount:p.ultraDecisionCount,voltageDecisionCount:p.voltageDecisionCount,commandCount:p.commandCount,finalStateHash:p.finalStateHash,finalScores:p.finalScores},durationMs:Math.round(performance.now()-started)}})}catch(error){self.postMessage({ok:false,error:error?.stack??String(error)})}}`;
  const workerUrl=await cdp.evaluate(`URL.createObjectURL(new Blob([${JSON.stringify(workerSource)}],{type:'text/javascript'}))`);const worker=await cdp.evaluate(`new Promise((resolve,reject)=>{const w=new Worker(${JSON.stringify(workerUrl)}),timer=setTimeout(()=>{w.terminate();reject(new Error('Worker timeout'))},120000);w.onmessage=({data})=>{clearTimeout(timer);w.terminate();data.ok?resolve(data.result):reject(new Error(data.error))};w.onerror=e=>{clearTimeout(timer);w.terminate();reject(new Error(e.message))};w.postMessage(__intrilexReplays)})`,true);
  const parity={aggregateHashesEqual:main.aggregateHash===worker.aggregateHash,replayCountsEqual:main.replayCount===worker.replayCount,commandCountsEqual:main.commandCount===worker.commandCount,eventCountsEqual:main.eventCount===worker.eventCount,browserMatchesNode:main.aggregateHash===nodeReference.aggregateHash,browserCountsMatchNode:main.replayCount===nodeReference.replayCount&&main.commandCount===nodeReference.commandCount&&main.eventCount===nodeReference.eventCount,policyMainWorkerEqual:JSON.stringify(main.policy)===JSON.stringify(worker.policy),policyBrowserMatchesNode:JSON.stringify(main.policy)===JSON.stringify(nodePolicy),policyTerminatesCanonically:['NORMAL_VICTORY','EXHAUSTED_RESOLUTION','CANONICAL_DRAW'].includes(main.policy.terminationReason)};
  if(!Object.values(parity).every(Boolean))throw new Error(`Browser parity mismatch: ${JSON.stringify({parity,nodePolicy,main:main.policy,worker:worker.policy})}`);
  const buildInfo=JSON.parse(await readFile(path.join(dist,'BUILD_INFO.json'),'utf8'));
  const report={schemaVersion:'3.0',status:'PASS',proofKind:'REAL_CHROMIUM_CDP_MAIN_THREAD_AND_WEB_WORKER',labVersion:buildInfo.version,engineVersion:buildInfo.engineVersion,rulesVersion:buildInfo.rulesVersion,profileId:'core-advanced-authority',certifiedReplayCount:buildInfo.certifiedReplayCount,browser:main.userAgent,sha256Vectors:main.sha256Vectors,nodeReference,nodePolicy,mainThread:{...main,userAgent:undefined,sha256Vectors:undefined},worker,parity,generatedAt:new Date().toISOString()};delete report.mainThread.userAgent;delete report.mainThread.sha256Vectors;
  if(writeReports){await mkdir(path.dirname(reportPath),{recursive:true});await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');await writeFile(reportMdPath,`# Browser Parity Certification\n\n- Status: **PASS**\n- Lab: **v${report.labVersion}**\n- Engine/rules: **${report.engineVersion} / ${report.rulesVersion}**\n- Profile: **${report.profileId}**\n- Certified replay corpus: **${report.certifiedReplayCount}/${report.certifiedReplayCount}** in Chromium main and Web Worker\n- Node/browser/worker replay aggregate: \`${report.mainThread.aggregateHash}\`\n- Seeded Advanced Core policy match parity: **PASS**\n- Advanced declarations: **${report.mainThread.policy.advancedDecisionCount}**; Ultras: **${report.mainThread.policy.ultraDecisionCount}**; Voltage: **${report.mainThread.policy.voltageDecisionCount}**\n- Browser: \`${report.browser}\`\n`);}
  console.log(`BROWSER PARITY PASS: replays=${report.certifiedReplayCount}; profile=${report.profileId}; hash=${report.mainThread.aggregateHash}`);
}finally{try{cdp?.socket.close();}catch{}try{distServer.close();}catch{}try{process.kill(-child.pid,'SIGKILL');}catch{}try{await rm(profileDir,{recursive:true,force:true});}catch{/* Windows may lock Chrome crash files; best-effort cleanup */}}

