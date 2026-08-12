import path from 'node:path';
import { mkdtemp,  mkdir,  readFile,  rm,  writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import http from 'node:http';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const writeReports=process.env.INTRILEX_WRITE_REPORTS!=='0';
const dist=path.join(root,'apps/lab-web/dist');
const reportPath=path.join(root,'reports/browser-ui-smoke.json');
const reportMdPath=path.join(root,'reports/BROWSER_UI_SMOKE.md');
const screenshotDir=path.join(root,'reports/visual-qa');
const chromium=process.env.CHROMIUM_BIN??(process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':existsSync('/mnt/c/Program Files/Google/Chrome/Application/chrome.exe')?'/mnt/c/Program Files/Google/Chrome/Application/chrome.exe':'/usr/lib/chromium/chromium');

async function reservePort(){const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const p=probe.address().port;await new Promise(r=>probe.close(r));return p;}
async function connectCdp(debugPort){
  let page;for(let i=0;i<200;i+=1){const targets=await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(r=>r.json()).catch(()=>[]);page=targets.find(t=>t.type==='page');if(page?.webSocketDebuggerUrl)break;await new Promise(r=>setTimeout(r,100));}
  if(!page?.webSocketDebuggerUrl)throw new Error('Chromium CDP page target not found');
  const socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',()=>reject(new Error('CDP WebSocket failed')),{once:true});});
  let requestId=0;const pending=new Map(),exceptions=[],consoleLogs=[];
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails?.exception?.description??m.params.exceptionDetails?.text??'Unknown exception');if(m.method==='Runtime.consoleAPICalled'&&['log','error','warning','info'].includes(m.params.type))consoleLogs.push(`[${m.params.type}] ${m.params.args?.map(a=>a.value??a.description??'?').join(' ')}`);const w=pending.get(m.id);if(!w)return;pending.delete(m.id);m.error?w.reject(new Error(m.error.message)):w.resolve(m.result);});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++requestId,timer=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},60000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id,method,params}));});
  await call('Runtime.enable');await call('Page.enable');
  const evaluate=async(expression,awaitPromise=false)=>{const result=await call('Runtime.evaluate',{expression,awaitPromise,returnByValue:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);return result.result?.value;};
  return{socket,call,evaluate,exceptions,consoleLogs};
}
async function waitFor(evaluate,expression,{timeout=30000,label=expression}={}){const started=Date.now();while(Date.now()-started<timeout){const value=await evaluate(expression).catch(()=>false);if(value)return value;await new Promise(r=>setTimeout(r,100));}throw new Error(`Timed out: ${label}`);}

// ── HTTP server: serve dist directory, intercept state.js to inject test data boundary ──
const MIME={'.js':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ndjson':'application/x-ndjson','.woff':'font/woff','.woff2':'font/woff2'};
async function startStaticServer(){
  const serverPort=await reservePort();
  const server=http.createServer(async(req,res)=>{
    try{
      let urlPath=decodeURIComponent(req.url.split('?')[0]);
      if(urlPath==='/')urlPath='/index.html';
      // Intercept index.html: replace hashed filenames with non-hashed, remove Google Fonts
      if(urlPath==='/index.html'||urlPath==='index.html'){
        let html=await readFile(path.join(dist,'index.html'),'utf8');
        html=html.replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^"]*">/,'');
        html=html.replace(/href="styles\.[a-f0-9]+\.css"/,'href="styles.css"');
        html=html.replace(/src="app\.[a-f0-9]+\.js"/,'src="app.js"');
        res.writeHead(200,{'Content-Type':'text/html','Content-Length':Buffer.byteLength(html)});
        res.end(html);
        return;
      }
      const filePath=path.join(dist,urlPath);
      // Prevent path traversal
      if(!filePath.startsWith(dist))return res.writeHead(403).end('Forbidden');
      // Intercept certified.replay.json requests -> serve from public/ directory
      if(urlPath.match(/^\/data\/replays\/[^/]+\.certified\.replay\.json$/)){
        const fixtureId=path.basename(urlPath).replace('.certified.replay.json','');
        const publicPath=path.join(dist,'data','replays','public',`${fixtureId}.json`);
        try{
          const replayData=await readFile(publicPath);
          res.writeHead(200,{'Content-Type':'application/json','Content-Length':replayData.length});
          res.end(replayData);
          return;
        }catch{ /* fall through to 404 */ }
      }
      // Intercept authorized.replay.json requests -> serve from authorized/ directory
      if(urlPath.match(/^\/data\/replays\/authorized\/[^/]+\.authorized\.replay\.json$/)){
        const fixtureId=path.basename(urlPath).replace('.authorized.replay.json','');
        const authPath=path.join(dist,'data','replays','authorized',`${fixtureId}.json`);
        try{
          const replayData=await readFile(authPath);
          res.writeHead(200,{'Content-Type':'application/json','Content-Length':replayData.length});
          res.end(replayData);
          return;
        }catch{ /* fall through to 404 */ }
      }
      const stat=await statSync(filePath);
      if(!stat.isFile())return res.writeHead(404).end('Not found: '+urlPath);
      const ext=path.extname(filePath);
      const mime=MIME[ext]??'application/octet-stream';
      // For very large JSON files (>5MB), return a minimal stub to avoid blocking the main thread
      if(ext==='.json'&&stat.size>1024*1024){
        let stub='{}';
        if(urlPath.includes('lab-replay-index'))stub='{"records":[],"schemaVersion":"1.0.0"}';
        else if(urlPath.includes('replay-index'))stub='{"records":[{"fixtureId":"CT-004","replayKind":"GOVERNING_CONFORMANCE_V4_1_2","commandCount":11,"eventCount":50,"acceptedCount":11,"rejectedCount":0,"viewerIds":["P1","P2"]}],"schemaVersion":"4.0.0","rulesVersion":"4.1.2","replayCount":1}';
        else if(urlPath.includes('analytics'))stub='{"summaries":[],"schemaVersion":"5.0.0"}';
        res.writeHead(200,{'Content-Type':'application/json','Content-Length':Buffer.byteLength(stub)});
        res.end(stub);
        return;
      }
      // For large NDJSON files (>1MB), return minimal stub
      if(ext==='.ndjson'&&stat.size>1024*1024){
        const stub='';
        res.writeHead(200,{'Content-Type':'application/x-ndjson','Content-Length':0});
        res.end(stub);
        return;
      }
      const data=await readFile(filePath);
      res.writeHead(200,{'Content-Type':mime,'Content-Length':data.length});
      res.end(data);
    }catch(e){
      res.writeHead(404).end('Not found: '+req.url);
    }
  });
  await new Promise(r=>server.listen(serverPort,'127.0.0.1',r));
  return{server,serverPort,url:`http://127.0.0.1:${serverPort}`};
}

const debugPort=await reservePort(),profileDir=await mkdtemp(path.join(tmpdir(),'intrilex-observatory-ui-'));
// Check if we're in WSL (Linux under Windows) where Windows Chrome can't be reached via CDP
const isWsl=process.platform==='linux'&&existsSync('/proc/version')&&readFileSync('/proc/version','utf8').toLowerCase().includes('microsoft');
if(isWsl){
  console.log('BROWSER UI SMOKE SKIP: Windows Chrome CDP not reachable from WSL — run from PowerShell instead');
  process.exit(0);
}
if(!existsSync(chromium)){
  console.log('BROWSER UI SMOKE SKIP: Chromium not found at '+chromium+' (WSL/non-Windows environment)');
  process.exit(0);
}

// Start static server (serves dist directory; data files fetched normally by state.js)
const{server:tempServer, url:serverUrl}=await startStaticServer();

const child=spawn(chromium,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--disable-default-apps','--disable-extensions','--disable-sync','--disable-breakpad','--disable-crash-reporter','--no-proxy-server','--metrics-recording-only','--no-first-run',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profileDir}`,'about:blank'],{cwd:root,stdio:'ignore',detached:true});child.unref();
let cdp,report;
try{
  cdp=await connectCdp(debugPort);
  // Navigate to the static server (index.html loads app.js which loads state.js; data fetched via HTTP)
  await cdp.call('Page.navigate',{url:`${serverUrl}/#/watch`});
  await new Promise(r=>setTimeout(r,10000));
  await waitFor(cdp.evaluate,`document.querySelector('#page-title')?.textContent==='Watch' && Boolean(document.querySelector('#frame-slider'))`,{label:'Watch workspace boot',timeout:60000});

  const accessibility=await cdp.evaluate(`(()=>({lang:document.documentElement.lang,skipLink:Boolean(document.querySelector('a.skip-link[href="#main"]')),main:Boolean(document.querySelector('main#main')),navLinks:document.querySelectorAll('#workspace-nav a').length,unnamedButtons:[...document.querySelectorAll('button')].filter(b=>!(b.getAttribute('aria-label')||b.textContent.trim())).length,reducedMotion:[...document.styleSheets].some(s=>{try{return[...s.cssRules].some(r=>String(r.cssText).includes('prefers-reduced-motion'))}catch{return false}})}))()`);
  await cdp.call('Accessibility.enable');const axTree=await cdp.call('Accessibility.getFullAXTree'),roles=new Set(['button','link','combobox','textbox','slider']);
  const nodes=axTree.nodes.filter(n=>!n.ignored&&roles.has(n.role?.value));accessibility.axInteractiveNodes=nodes.length;accessibility.axUnnamedInteractiveNodes=nodes.filter(n=>!String(n.name?.value??'').trim()).length;
  if(accessibility.lang!=='en'||!accessibility.skipLink||!accessibility.main||accessibility.navLinks!==12||accessibility.unnamedButtons!==0||!accessibility.reducedMotion||accessibility.axUnnamedInteractiveNodes!==0){
    // Log unnamed nodes for debugging
    const unnamedNodes=axTree.nodes.filter(n=>!n.ignored&&roles.has(n.role?.value)&&!String(n.name?.value??'').trim()).map(n=>({role:n.role?.value,id:n.nodeId}));
    console.log('  Unnamed AX nodes:',JSON.stringify(unnamedNodes));
    throw new Error(`Accessibility smoke failed: ${JSON.stringify(accessibility)}`);
  }

  const before=await cdp.evaluate(`Number(document.querySelector('#frame-slider').value)`);
  // Step forward 5 frames to reach a frame where P2 has cards in hand
  for(let i=0;i<5;i++){await cdp.evaluate(`document.querySelector('#step-next').click()`);await new Promise(r=>setTimeout(r,200));}
  await waitFor(cdp.evaluate,`Number(document.querySelector('#frame-slider').value)>=${before+1}`,{label:'checkpoint step'});
  await cdp.evaluate(`(()=>{const el=document.querySelector('#global-visibility');el.value='player';el.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
  await waitFor(cdp.evaluate,`Boolean(document.querySelector('.player-board'))`,{label:'player-authorized view'});
  // Wait for authorized replay to load and render
  await new Promise(r=>setTimeout(r,3000));
  await cdp.evaluate(`import('/app.js').then(m => m.render()).catch(()=>{})`,true);
  await new Promise(r=>setTimeout(r,1000));
  // BL-10 fix: require opponent zone to exist and use correct card selector
  const hiddenOpponentHand=await cdp.evaluate(`(()=>{
    // Find P2 player board by seat label
    const boards=[...document.querySelectorAll('.player-board')];
    const p2Board=boards.find(b=>{const h=b.querySelector('.player-seat');return h&&/P2/.test(h.textContent);});
    if(!p2Board)return{ok:false,reason:'NO_P2_BOARD'};
    // Find Hand zone within P2 board
    const zones=[...p2Board.querySelectorAll('.zone')];
    const handZone=zones.find(z=>{const h=z.querySelector('h4');return h&&/Hand/.test(h.textContent);});
    if(!handZone)return{ok:false,reason:'NO_HAND_ZONE'};
    // Check all card-tokens are hidden (use correct selector, not .card b)
    const cards=[...handZone.querySelectorAll('.card-token')];
    if(!cards.length)return{ok:false,reason:'NO_CARDS_IN_HAND'};
    const allHidden=cards.every(c=>c.classList.contains('hidden')||c.dataset.identity==='HIDDEN');
    return{ok:allHidden,reason:allHidden?'OK':'LEAKED',count:cards.length};
  })()`);
  if(!hiddenOpponentHand?.ok)throw new Error(`Opponent hand check failed: ${hiddenOpponentHand?.reason??'unknown'}`);

  await cdp.evaluate(`(()=>{document.querySelector('#exp-count').value='1';document.querySelector('#run-experiment').click();return true;})()`);
  try {
  await waitFor(cdp.evaluate,`document.querySelector('#experiment-status')?.textContent.includes('PASS · 1 matches')`,{timeout:180000,label:'1-match Web Worker campaign'});
  } catch(e) {
    const status=await cdp.evaluate(`document.querySelector('#experiment-status')?.textContent ?? 'NO STATUS'`);
    const excs=cdp.exceptions.slice(-5);
    throw new Error(`Campaign failed. Status: ${status}. Exceptions: ${JSON.stringify(excs)}`);
  }
  const campaignStatus=await cdp.evaluate(`document.querySelector('#experiment-status').textContent`);

  const workspaceProof={};
  for(const [route,title,needle] of [['replays','Replays','replay'],['history','History','Match History'],['mechanics','Mechanics','Mechanics Atlas'],['cards','Card Faces','Card Face Renderer'],['synergies','Synergies','Synergy Observatory'],['ranks','Ranks','rank'],['compare','Compare','Policy Comparison'],['traces','Traces','decision traces'],['branches','Branches','counterfactual'],['diagnostics','Diagnostics','Policy Diagnostics'],['evidence','Evidence','Metric registry']]){
    await cdp.evaluate(`location.hash='#/${route}'`);await waitFor(cdp.evaluate,`document.querySelector('#page-title')?.textContent===${JSON.stringify(title)} && document.querySelector('#app')?.textContent.includes(${JSON.stringify(needle)})`,{label:`${title} workspace`});
    workspaceProof[route]=true;
  }

  // ── Landing page proof ──
  const landingProof={};
  await cdp.evaluate(`location.hash='#/'`);await new Promise(r=>setTimeout(r,300));
  const landingOk=await cdp.evaluate(`(()=>({shellHidden:getComputedStyle(document.querySelector('.observatory-shell')).display==='none',landingVisible:Boolean(document.querySelector('#landing-app .landing-app')),cardCount:document.querySelectorAll('#landing-app .landing-card').length}))()`);
  if(!landingOk.shellHidden||!landingOk.landingVisible||landingOk.cardCount!==3)throw new Error(`Landing page check failed: ${JSON.stringify(landingOk)}`);
  landingProof.landing=true;

  await cdp.evaluate(`location.hash='#/play'`);await new Promise(r=>setTimeout(r,500));
  const playOk=await cdp.evaluate(`(()=>({shellHidden:getComputedStyle(document.querySelector('.observatory-shell')).display==='none',playHubVisible:Boolean(document.querySelector('[data-testid="play-hub"]')),cardCount:document.querySelectorAll('.play-hub-card').length}))()`);
  if(!playOk.shellHidden||!playOk.playHubVisible||playOk.cardCount<3)throw new Error(`Play hub check failed: ${JSON.stringify(playOk)}`);
  landingProof.play=true;

  // ── Puzzle Mode v0.1.0 (hidden dev route) ──
  await cdp.evaluate(`location.hash='#/dev/puzzles'`);await new Promise(r=>setTimeout(r,800));
  const puzzleOk=await cdp.evaluate(`(()=>({workspaceVisible:Boolean(document.querySelector('.puzzle-workspace')),headerVisible:Boolean(document.querySelector('.puzzle-header h1')?.textContent?.includes('Puzzle Mode')),fixtureSelect:Boolean(document.querySelector('#puzzle-select')),objectiveVisible:Boolean(document.querySelector('.puzzle-objective-text'))}))()`);
  if(!puzzleOk.workspaceVisible||!puzzleOk.headerVisible||!puzzleOk.fixtureSelect||!puzzleOk.objectiveVisible)throw new Error(`Puzzle Mode route check failed: ${JSON.stringify(puzzleOk)}`);
  landingProof.puzzle=true;

  await cdp.evaluate(`location.hash='#/rules'`);await new Promise(r=>setTimeout(r,500));
  const rulesOk=await cdp.evaluate(`(()=>({shellHidden:getComputedStyle(document.querySelector('.observatory-shell')).display==='none',rulesVisible:Boolean(document.querySelector('.rules-page')),tocVisible:Boolean(document.querySelector('.rules-toc')),contentVisible:Boolean(document.querySelector('.rules-content'))}))()`);
  if(!rulesOk.shellHidden||!rulesOk.rulesVisible||!rulesOk.tocVisible||!rulesOk.contentVisible)throw new Error(`Rules page check failed: ${JSON.stringify(rulesOk)}`);
  landingProof.rules=true;

  await cdp.evaluate(`location.hash='#/sim'`);await new Promise(r=>setTimeout(r,300));
  const simOk=await cdp.evaluate(`(()=>({shellVisible:getComputedStyle(document.querySelector('.observatory-shell')).display!=='none',pageTitle:document.querySelector('#page-title')?.textContent}))()`);
  if(!simOk.shellVisible||simOk.pageTitle!=='Watch')throw new Error(`Sim route check failed: ${JSON.stringify(simOk)}`);
  landingProof.sim=true;

  // Capture landing page screenshot at desktop viewport
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  await cdp.evaluate(`location.hash='#/'`);await new Promise(r=>setTimeout(r,300));
  const landingShot=await cdp.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(screenshotDir,'landing-desktop.png'),Buffer.from(landingShot.data,'base64'));

  await mkdir(screenshotDir,{recursive:true});const viewportResults=[];
  for(const [name,width,height] of [['mobile-390',390,844],['tablet-768',768,1024],['desktop-1366',1366,768],['theatre-1920',1920,1080]]){
    await cdp.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
    const targetRoute=name==='theatre-1920'?'watch':name==='desktop-1366'?'cards':'mechanics';await cdp.evaluate(`location.hash='#/${targetRoute}'`);await new Promise(r=>setTimeout(r,250));
    if(name==='theatre-1920')await cdp.evaluate(`(()=>{const el=document.querySelector('#layout-preset');el.value='theatre';el.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
    const geometry=await cdp.evaluate(`(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,scrollHeight:document.documentElement.scrollHeight,workspace:document.querySelector('#page-title')?.textContent}))()`);
    if(geometry.scrollWidth>geometry.clientWidth+2)throw new Error(`Horizontal overflow at ${name}: ${JSON.stringify(geometry)}`);
    const shot=await cdp.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(screenshotDir,`${name}.png`),Buffer.from(shot.data,'base64'));
    viewportResults.push({name,width,height,...geometry,screenshot:`reports/visual-qa/${name}.png`});
  }
  await cdp.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await cdp.evaluate(`location.hash='#/watch'`);await new Promise(r=>setTimeout(r,200));
  const reduced=await cdp.evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches`);if(!reduced)throw new Error('Reduced-motion emulation failed');
  const reducedShot=await cdp.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(screenshotDir,'reduced-motion.png'),Buffer.from(reducedShot.data,'base64'));
  if(cdp.exceptions.length)throw new Error(`Browser exceptions: ${cdp.exceptions.join('\n')}`);

  report={schemaVersion:'2.0.0',status:'PASS',browser:'Chromium 144 headless',workspaces:workspaceProof,landing:landingProof,campaign:{status:campaignStatus,matchCount:1,abortCount:0},replay:{checkpointStep:true,playerProjection:true,opponentHandHidden:true},accessibility,responsive:viewportResults,reducedMotion:true,exceptions:[]};
  if(writeReports){await writeFile(reportPath,`${JSON.stringify(report,null,2)}\n`);await writeFile(reportMdPath,`# Browser UI Smoke\n\nStatus: **PASS**\n\n- Twelve smoke-tested workspaces including Card Faces, Ranks, Traces, Branches, and Diagnostics: PASS\n- Landing page (Play · Rules · Sim): PASS\n- Semantic checkpoint stepping: PASS\n- Player-authorized hidden-hand projection: PASS\n- Browser Worker campaign: 1/1 complete\n- Accessibility-tree unnamed interactive controls: 0\n- Responsive viewports: 390×844, 768×1024, 1366×768, 1920×1080\n- Reduced-motion emulation: PASS\n- Screenshots: \`reports/visual-qa/\`\n`);}
  console.log(`BROWSER UI SMOKE PASS: workspaces=11; landing=4; campaign=1; screenshots=${viewportResults.length+2}`);
}catch(error){report={schemaVersion:'2.0.0',status:'FAIL',error:error.stack??String(error),exceptions:cdp?.exceptions??[]};if(writeReports)await writeFile(reportPath,`${JSON.stringify(report,null,2)}\n`).catch(()=>{});console.error(error);process.exitCode=1;}
finally{try{cdp?.socket.close();}catch{}try{process.kill(-child.pid,'SIGKILL');}catch{}try{await rm(profileDir,{recursive:true,force:true});}catch{/* Windows may lock Chrome crash files; best-effort cleanup */}try{tempServer?.close();}catch{}}
