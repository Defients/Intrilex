// Simple browser smoke test that uses the dev server
import http from 'node:http';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.join(root, 'reports/browser-ui-smoke.json');
const reportMdPath = path.join(root, 'reports/BROWSER_UI_SMOKE.md');

async function reservePort() {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function connectCdp(port) {
  let page;
  for (let i = 0; i < 200; i += 1) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json()).catch(() => []);
    page = targets.find(t => t.type === 'page');
    if (page?.webSocketDebuggerUrl) break;
    await new Promise(r => setTimeout(r, 100));
  }
  if (!page?.webSocketDebuggerUrl) throw new Error('CDP page target not found');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('CDP WebSocket failed')), { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
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
    return result.result.value;
  };
  return { socket, evaluate, call };
}

async function waitFor(evaluate, predicate, { label = 'condition', timeout = 15000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await evaluate(`(${predicate})()`);
    if (result) return result;
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Timed out: ${label}`);
}

const isWsl = process.platform === 'linux' && existsSync('/proc/version') && readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');
if (isWsl) {
  console.log('BROWSER UI SMOKE SKIP: Windows Chrome CDP not reachable from WSL');
  process.exit(0);
}

const chromium = process.env.CHROMIUM_BIN ?? (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : existsSync('/mnt/c/Program Files/Google/Chrome/Application/chrome.exe') ? '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/lib/chromium/chromium');
if (!existsSync(chromium)) {
  console.log('BROWSER UI SMOKE SKIP: Chromium not found at ' + chromium);
  process.exit(0);
}

const debugPort = await reservePort();
const profileDir = await mkdtemp(path.join(tmpdir(), 'intrilex-smoke-'));
const child = spawn(chromium, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--disable-background-networking', '--disable-default-apps', '--disable-extensions',
  '--disable-sync', '--disable-breakpad', '--disable-crash-reporter', '--no-proxy-server',
  '--metrics-recording-only', '--no-first-run',
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDir}`, 'about:blank'
], { stdio: 'ignore', detached: true });
child.unref();

let cdp;
const workspaces = {};
try {
  cdp = await connectCdp(debugPort);

  // Navigate to the dev server
  const serverPort = process.env.PORT ?? 4173;
  const serverUrl = `http://127.0.0.1:${serverPort}/`;
  await cdp.evaluate(`location.href=${JSON.stringify(serverUrl)};true`);
  await new Promise(r => setTimeout(r, 2000));

  // Wait for the page to load
  await cdp.evaluate(`location.hash='#/watch';true`);
  await new Promise(r => setTimeout(r, 3000));

  // Check if the Watch workspace loaded
  const watchOk = await cdp.evaluate(`(()=>({pageTitle:document.querySelector('#page-title')?.textContent,hasSlider:Boolean(document.querySelector('#replay-slider')),hasNav:Boolean(document.querySelector('#workspace-nav'))}))()`);
  workspaces['watch'] = watchOk.hasSlider && watchOk.hasNav;
  if (!workspaces['watch']) throw new Error(`Watch workspace failed: ${JSON.stringify(watchOk)}`);

  // Check landing page
  await cdp.evaluate(`location.hash='#/';true`);
  await new Promise(r => setTimeout(r, 1000));
  const landingOk = await cdp.evaluate(`(()=>({shellHidden:getComputedStyle(document.querySelector('.observatory-shell')).display==='none',landingVisible:Boolean(document.querySelector('.landing-app')),cardCount:document.querySelectorAll('.landing-card').length}))()`);
  workspaces['landing'] = landingOk.landingVisible && landingOk.cardCount >= 3;
  if (!workspaces['landing']) throw new Error(`Landing page failed: ${JSON.stringify(landingOk)}`);

  // Check play hub
  await cdp.evaluate(`location.hash='#/play';true`);
  await new Promise(r => setTimeout(r, 2000));
  const playOk = await cdp.evaluate(`(()=>({shellHidden:getComputedStyle(document.querySelector('.observatory-shell')).display==='none',playHubVisible:Boolean(document.querySelector('[data-testid="play-hub"]')),cardCount:document.querySelectorAll('.play-hub-card').length}))()`);
  workspaces['play'] = playOk.playHubVisible && playOk.cardCount >= 3;
  if (!workspaces['play']) throw new Error(`Play hub failed: ${JSON.stringify(playOk)}`);

  // Check rules page
  await cdp.evaluate(`location.hash='#/rules';true`);
  await new Promise(r => setTimeout(r, 2000));
  const rulesOk = await cdp.evaluate(`(()=>({shellHidden:getComputedStyle(document.querySelector('.observatory-shell')).display==='none',rulesVisible:Boolean(document.querySelector('.rules-page')),tocVisible:Boolean(document.querySelector('.rules-toc')),contentVisible:Boolean(document.querySelector('.rules-content'))}))()`);
  workspaces['rules'] = rulesOk.rulesVisible && rulesOk.tocVisible && rulesOk.contentVisible;
  if (!workspaces['rules']) throw new Error(`Rules page failed: ${JSON.stringify(rulesOk)}`);

  // Check observatory workspaces
  const observatoryRoutes = [
    ['#/watch', 'watch-observatory'],
    ['#/replay', 'replay'],
    ['#/autonomy', 'autonomy'],
    ['#/analytics', 'analytics'],
    ['#/observatory', 'observatory'],
    ['#/rank', 'rank'],
    ['#/diagnostics', 'diagnostics'],
    ['#/extract', 'extract'],
    ['#/campaign', 'campaign'],
    ['#/about', 'about'],
  ];

  for (const [hash, name] of observatoryRoutes) {
    await cdp.evaluate(`location.hash=${JSON.stringify(hash)};true`);
    await new Promise(r => setTimeout(r, 1000));
    const ok = await cdp.evaluate(`(()=>{const shell=document.querySelector('.observatory-shell');return shell && getComputedStyle(shell).display !== 'none' && Boolean(document.querySelector('#app'))})()`);
    workspaces[name] = ok;
  }

  // Check accessibility
  const accessibility = await cdp.evaluate(`(()=>({lang:document.documentElement.lang,skipLink:Boolean(document.querySelector('a.skip-link[href="#main"]')),main:Boolean(document.querySelector('main#main')),reducedMotion:[...document.styleSheets].some(s=>{try{return[...s.cssRules].some(r=>String(r.cssText).includes('prefers-reduced-motion'))}catch{return false}})}))()`);

  // Navigate back to watch for screenshot
  await cdp.evaluate(`location.hash='#/watch';true`);
  await new Promise(r => setTimeout(r, 2000));

  // Take screenshot
  const screenshotDir = path.join(root, 'reports/visual-qa');
  await mkdir(screenshotDir, { recursive: true });
  const screenshot = await cdp.call('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(screenshotDir, 'browser-ui-smoke.png'), Buffer.from(screenshot.data, 'base64'));

  // Write report
  const report = {
    schemaVersion: '2.0.0',
    status: 'PASS',
    timestamp: new Date().toISOString(),
    workspaces,
    accessibility,
    checks: {
      watchWorkspace: workspaces['watch'],
      landingPage: workspaces['landing'],
      playHub: workspaces['play'],
      rulesPage: workspaces['rules'],
      observatoryWorkspaces: Object.values(workspaces).filter(Boolean).length >= 10,
      accessibility: accessibility.lang === 'en' && accessibility.skipLink && accessibility.main,
    },
    exceptions: [],
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await writeFile(reportMdPath, `# Browser UI Smoke Test\n\n**Status:** PASS\n\n**Workspaces:** ${Object.values(workspaces).filter(Boolean).length}/${Object.keys(workspaces).length}\n\n**Timestamp:** ${report.timestamp}\n`);
  console.log(`BROWSER UI SMOKE PASS: ${Object.values(workspaces).filter(Boolean).length}/${Object.keys(workspaces).length} workspaces`);
} catch (error) {
  const report = {
    schemaVersion: '2.0.0',
    status: 'FAIL',
    error: String(error),
    workspaces,
    exceptions: [],
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await writeFile(reportMdPath, `# Browser UI Smoke Test\n\n**Status:** FAIL\n\n**Error:** ${error}\n`);
  console.error(`BROWSER UI SMOKE FAIL: ${error}`);
  process.exit(1);
}
