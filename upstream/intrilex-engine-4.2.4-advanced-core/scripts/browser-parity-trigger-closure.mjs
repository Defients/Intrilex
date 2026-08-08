import http from 'node:http';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distSrc = path.join(root, 'dist/src');
const replayDir = path.join(root, 'replays');
const reportPath = path.join(root, 'reports/browser-trigger-closure-parity.json');
const writeReports = process.env.INTRILEX_WRITE_REPORTS !== '0';
const shimPath = path.join(root, 'vendor/browser-crypto-shim/hash.js');

const built = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
if (built.status !== 0) process.exit(built.status ?? 1);

const work = await mkdtemp(path.join(tmpdir(), 'intrilex-415-browser-'));
const engineDir = path.join(work, 'engine');
await cp(distSrc, engineDir, { recursive: true });
await cp(shimPath, path.join(engineDir, 'hash.js'));
await writeFile(path.join(engineDir, 'browser-entry.js'), [
  "export { IntrilexEngine } from './engine.js';",
  "export { verifyCertifiedReplay } from './phase16.js';",
  "export { hashCanonical, sha256Text } from './hash.js';",
  "export { FIRST_CONTACT_TRIGGER_CLOSURE_PROFILE, createMatchState, enumerateLegalActions, authorizedLegalActionView, advanceToDecision, autonomousCapabilities, runRandomLegalMatch } from './autonomy.js';",
  ''
].join('\n'));

async function reservePort() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function connectCdp(port) {
  const listUrl = `http://127.0.0.1:${port}/json/list`;
  let page;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const targets = await fetch(listUrl).then((r) => r.json()).catch(() => []);
    page = targets.find((target) => target.type === 'page');
    if (page?.webSocketDebuggerUrl) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!page?.webSocketDebuggerUrl) throw new Error('Chromium CDP page target not found');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('CDP WebSocket failed')), { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    pending.set(requestId, { resolve, reject });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  await call('Runtime.enable');
  const evaluate = async (expression, awaitPromise = false) => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result?.value;
  };
  return { socket, evaluate };
}

async function moduleGraph(entryName) {
  const sources = new Map();
  const deps = new Map();
  const order = [];
  const importPattern = /from\s+["']\.\/(.+?\.js)["']/g;
  async function visit(name) {
    if (sources.has(name)) return;
    const source = await readFile(path.join(engineDir, name), 'utf8');
    const children = [...source.matchAll(importPattern)].map((match) => match[1]);
    sources.set(name, source);
    deps.set(name, children);
    for (const child of children) await visit(child);
    order.push(name);
  }
  await visit(entryName);
  return { sources, deps, order };
}

const engine = await import(pathToFileURL(path.join(distSrc, 'index.js')).href + `?proof=${Date.now()}`);
const replayFiles = (await readdir(replayDir)).filter((name) => name.endsWith('.certified.replay.json') && !name.includes('.public.certified.')).sort();
const replays = await Promise.all(replayFiles.map(async (name) => JSON.parse(await readFile(path.join(replayDir, name), 'utf8'))));
const nodeSummaries = replays.map((replay) => {
  const verified = engine.verifyCertifiedReplay(replay);
  return { fixtureId: replay.fixtureId, contentHash: replay.contentHash, finalStateHash: replay.finalStateHash, accepted: verified.accepted.length, events: verified.events.length };
});
const nodeReplay = {
  replayCount: nodeSummaries.length,
  commandCount: nodeSummaries.reduce((sum, row) => sum + row.accepted, 0),
  eventCount: nodeSummaries.reduce((sum, row) => sum + row.events, 0),
  aggregateHash: engine.hashCanonical(nodeSummaries)
};
const setup = { profileId: 'first-contact-trigger-closure', playerIds: ['P1', 'P2'], enabledModules: [], eventApprovedModules: [], seed: 9, seatOrder: ['P1', 'P2'] };
const nodeMatchRaw = engine.runRandomLegalMatch(setup, 1600);
const nodeMatch = {
  terminationReason: nodeMatchRaw.terminationReason,
  winner: nodeMatchRaw.state.winner,
  decisionCount: nodeMatchRaw.decisions.length,
  commandCount: nodeMatchRaw.commands.length,
  privateChoiceDecisionCount: nodeMatchRaw.decisions.filter((entry) => entry.actionId.startsWith('private-choice:')).length,
  privateChoiceDecisionHash: engine.hashCanonical(nodeMatchRaw.decisions.filter((entry) => entry.actionId.startsWith('private-choice:'))),
  triggerChoiceDecisionCount: nodeMatchRaw.decisions.filter((entry) => entry.actionId.startsWith('private-choice:rank7-scoring-trigger:')).length,
  triggerResolvedCount: nodeMatchRaw.events.filter((entry) => entry.type === 'AUTONOMY_SEVEN_SCORING_TRIGGER_RESOLVED').length,
  triggerEventHash: engine.hashCanonical(nodeMatchRaw.events.filter((entry) => entry.type.includes('SEVEN_SCORING_TRIGGER') || entry.type === 'AUTONOMY_TRIGGER_QUEUE_FLUSHED')),
  finalStateHash: engine.hashCanonical(nodeMatchRaw.state),
  decisionHash: engine.hashCanonical(nodeMatchRaw.decisions)
};

const debugPort = await reservePort();
const profileDir = await mkdtemp(path.join(tmpdir(), 'intrilex-415-chromium-'));
const chromium = process.env.CHROMIUM_BIN ?? '/usr/lib/chromium/chromium';
const child = spawn(chromium, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--disable-background-networking', '--disable-default-apps', '--disable-extensions', '--disable-sync',
  '--disable-breakpad', '--disable-crash-reporter', '--no-proxy-server', '--metrics-recording-only', '--no-first-run',
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDir}`, 'about:blank'
], { cwd: root, stdio: 'ignore' });

let cdp;
try {
  cdp = await connectCdp(debugPort);
  const { sources, deps, order } = await moduleGraph('browser-entry.js');
  const urls = new Map();
  for (const name of order) {
    let source = sources.get(name);
    for (const dep of deps.get(name)) {
      source = source.replaceAll(`"./${dep}"`, JSON.stringify(urls.get(dep)));
      source = source.replaceAll(`'./${dep}'`, JSON.stringify(urls.get(dep)));
    }
    const url = await cdp.evaluate(`URL.createObjectURL(new Blob([${JSON.stringify(source)}], {type:'text/javascript'}))`);
    urls.set(name, url);
  }
  const entryUrl = urls.get('browser-entry.js');
  const exports = await cdp.evaluate(`import(${JSON.stringify(entryUrl)}).then((m) => { globalThis.__engine = m; return Object.keys(m).sort(); })`, true);
  for (const name of ['hashCanonical', 'sha256Text', 'verifyCertifiedReplay', 'runRandomLegalMatch']) {
    if (!exports.includes(name)) throw new Error(`Missing browser export ${name}`);
  }
  await cdp.evaluate(`globalThis.__replays = ${JSON.stringify(replays)}; true`);
  const browserProgram = `async () => {
    const vectors = [['','e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],['abc','ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],['Intrilex 🜂','bb4c0e83c96cda657c9485429a37f6d4fb845a2988bb3a45bc925ef2e96409a5']];
    for (const [text, expected] of vectors) if (__engine.sha256Text(text) !== expected) throw new Error('SHA vector failure');
    const summaries = __replays.map((replay) => {
      const verified = __engine.verifyCertifiedReplay(replay);
      return { fixtureId: replay.fixtureId, contentHash: replay.contentHash, finalStateHash: replay.finalStateHash, accepted: verified.accepted.length, events: verified.events.length };
    });
    const match = __engine.runRandomLegalMatch({profileId:'first-contact-trigger-closure',playerIds:['P1','P2'],enabledModules:[],eventApprovedModules:[],seed:9,seatOrder:['P1','P2']},5000);
    return {
      replay:{replayCount:summaries.length,commandCount:summaries.reduce((s,x)=>s+x.accepted,0),eventCount:summaries.reduce((s,x)=>s+x.events,0),aggregateHash:__engine.hashCanonical(summaries)},
      match:{terminationReason:match.terminationReason,winner:match.state.winner,decisionCount:match.decisions.length,commandCount:match.commands.length,privateChoiceDecisionCount:match.decisions.filter((x)=>x.actionId.startsWith('private-choice:')).length,privateChoiceDecisionHash:__engine.hashCanonical(match.decisions.filter((x)=>x.actionId.startsWith('private-choice:'))),triggerChoiceDecisionCount:match.decisions.filter((x)=>x.actionId.startsWith('private-choice:rank7-scoring-trigger:')).length,triggerResolvedCount:match.events.filter((x)=>x.type==='AUTONOMY_SEVEN_SCORING_TRIGGER_RESOLVED').length,triggerEventHash:__engine.hashCanonical(match.events.filter((x)=>x.type.includes('SEVEN_SCORING_TRIGGER')||x.type==='AUTONOMY_TRIGGER_QUEUE_FLUSHED')),finalStateHash:__engine.hashCanonical(match.state),decisionHash:__engine.hashCanonical(match.decisions)},
      vectors:vectors.length,
      userAgent:navigator.userAgent
    };
  }`;
  const main = await cdp.evaluate(`(${browserProgram})()`, true);
  const workerSource = `self.onmessage = async ({data}) => { try { const e=await import(data.entry); const summaries=data.replays.map((replay)=>{const v=e.verifyCertifiedReplay(replay);return {fixtureId:replay.fixtureId,contentHash:replay.contentHash,finalStateHash:replay.finalStateHash,accepted:v.accepted.length,events:v.events.length};}); const match=e.runRandomLegalMatch({profileId:'first-contact-trigger-closure',playerIds:['P1','P2'],enabledModules:[],eventApprovedModules:[],seed:9,seatOrder:['P1','P2']},5000); self.postMessage({ok:true,result:{replay:{replayCount:summaries.length,commandCount:summaries.reduce((s,x)=>s+x.accepted,0),eventCount:summaries.reduce((s,x)=>s+x.events,0),aggregateHash:e.hashCanonical(summaries)},match:{terminationReason:match.terminationReason,winner:match.state.winner,decisionCount:match.decisions.length,commandCount:match.commands.length,privateChoiceDecisionCount:match.decisions.filter((x)=>x.actionId.startsWith('private-choice:')).length,privateChoiceDecisionHash:e.hashCanonical(match.decisions.filter((x)=>x.actionId.startsWith('private-choice:'))),triggerChoiceDecisionCount:match.decisions.filter((x)=>x.actionId.startsWith('private-choice:rank7-scoring-trigger:')).length,triggerResolvedCount:match.events.filter((x)=>x.type==='AUTONOMY_SEVEN_SCORING_TRIGGER_RESOLVED').length,triggerEventHash:e.hashCanonical(match.events.filter((x)=>x.type.includes('SEVEN_SCORING_TRIGGER')||x.type==='AUTONOMY_TRIGGER_QUEUE_FLUSHED')),finalStateHash:e.hashCanonical(match.state),decisionHash:e.hashCanonical(match.decisions)}}}); } catch(error){self.postMessage({ok:false,error:error?.stack??String(error)});} };`;
  const workerUrl = await cdp.evaluate(`URL.createObjectURL(new Blob([${JSON.stringify(workerSource)}], {type:'text/javascript'}))`);
  const worker = await cdp.evaluate(`new Promise((resolve,reject)=>{const w=new Worker(${JSON.stringify(workerUrl)});const t=setTimeout(()=>{w.terminate();reject(new Error('worker timeout'));},120000);w.onmessage=({data})=>{clearTimeout(t);w.terminate();data.ok?resolve(data.result):reject(new Error(data.error));};w.onerror=(e)=>{clearTimeout(t);w.terminate();reject(new Error(e.message));};w.postMessage({entry:${JSON.stringify(entryUrl)},replays:__replays});})`, true);
  const parity = {
    mainReplayMatchesNode: JSON.stringify(main.replay) === JSON.stringify(nodeReplay),
    workerReplayMatchesNode: JSON.stringify(worker.replay) === JSON.stringify(nodeReplay),
    mainMatchMatchesNode: JSON.stringify(main.match) === JSON.stringify(nodeMatch),
    workerMatchMatchesNode: JSON.stringify(worker.match) === JSON.stringify(nodeMatch),
    canonicalTermination: ['NORMAL_VICTORY','EXHAUSTED_RESOLUTION','CANONICAL_DRAW'].includes(main.match.terminationReason),
    privateChoicesExercised: main.match.privateChoiceDecisionCount > 0,
    sevenTriggerExercised: main.match.triggerChoiceDecisionCount > 0 && main.match.triggerResolvedCount > 0,
    shaVectors: main.vectors === 3
  };
  if (!Object.values(parity).every(Boolean)) throw new Error(`Parity failure: ${JSON.stringify({ parity, nodeReplay, nodeMatch, main, worker })}`);
  const report = {
    schemaVersion: '1.0', status: 'PASS', engineVersion: '4.1.5', profileId: 'first-contact-trigger-closure',
    proofKind: 'REAL_CHROMIUM_MAIN_THREAD_AND_WEB_WORKER', browser: main.userAgent,
    certifiedReplayCorpus: nodeReplay, triggerClosureAuthorityMatch: nodeMatch,
    mainThread: { replay: main.replay, match: main.match }, worker, parity, generatedAt: new Date().toISOString()
  };
  if (writeReports) {
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  }
  console.log(`BROWSER TRIGGER CLOSURE PARITY PASS: replays=${nodeReplay.replayCount}; replayHash=${nodeReplay.aggregateHash}; matchHash=${nodeMatch.finalStateHash}`);
} finally {
  try { cdp?.socket.close(); } catch {}
  try { child.kill('SIGKILL'); } catch {}
  await new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    const timer = setTimeout(resolve, 2000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
  for (const directory of [profileDir, work]) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try { await rm(directory, { recursive: true, force: true }); break; }
      catch (error) { if (attempt === 9) throw error; await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
  }
}
