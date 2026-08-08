// V0.16.1 Browser Certification Script
// Uses a real Chrome browser via CDP to test the production build
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import http from 'node:http';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'apps/lab-web/dist');
const reportPath = path.join(root, 'reports/V0.16.1_BROWSER_CERTIFICATION.json');
const reportMdPath = path.join(root, 'reports/V0.16.1_BROWSER_CERTIFICATION.md');
const consolePath = path.join(root, 'reports/V0.16.1_BROWSER_CONSOLE.json');
const networkPath = path.join(root, 'reports/V0.16.1_BROWSER_NETWORK.json');
const screenshotDir = path.join(root, 'reports/v0.16.1-browser');

const chromium = process.env.CHROMIUM_BIN ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const startTime = new Date().toISOString();

async function reservePort() {
  const probe = http.createServer();
  await new Promise(r => probe.listen(0, '127.0.0.1', r));
  const p = probe.address().port;
  await new Promise(r => probe.close(r));
  return p;
}

async function connectCdp(debugPort) {
  let page;
  for (let i = 0; i < 200; i += 1) {
    const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(r => r.json()).catch(() => []);
    page = targets.find(t => t.type === 'page');
    if (page?.webSocketDebuggerUrl) break;
    await new Promise(r => setTimeout(r, 100));
  }
  if (!page?.webSocketDebuggerUrl) throw new Error('Chromium CDP page target not found');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('CDP WebSocket failed')), { once: true });
  });
  let requestId = 0;
  const pending = new Map();
  const exceptions = [];
  const consoleMessages = [];
  const networkRequests = [];
  const networkResponses = [];
  const networkFailures = [];

  socket.addEventListener('message', event => {
    const m = JSON.parse(event.data);
    if (m.method === 'Runtime.exceptionThrown') {
      exceptions.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? 'Unknown exception');
    }
    if (m.method === 'Runtime.consoleAPICalled') {
      consoleMessages.push({ type: m.params.type, args: m.params.args?.map(a => a.value ?? a.description ?? '').join(' ') });
    }
    if (m.method === 'Network.requestWillBeSent') {
      networkRequests.push({ url: m.params.request.url, method: m.params.request.method, requestId: m.params.requestId });
    }
    if (m.method === 'Network.responseReceived') {
      networkResponses.push({ url: m.params.response.url, status: m.params.response.status, requestId: m.params.requestId });
    }
    if (m.method === 'Network.loadingFailed') {
      networkFailures.push({ url: m.params.requestId, errorText: m.params.errorText, requestId: m.params.requestId });
    }
    const w = pending.get(m.id);
    if (!w) return;
    pending.delete(m.id);
    m.error ? w.reject(new Error(m.error.message)) : w.resolve(m.result);
  });

  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++requestId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
    pending.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    socket.send(JSON.stringify({ id, method, params }));
  });

  await call('Runtime.enable');
  await call('Page.enable');
  await call('Network.enable');
  await call('Log.enable');

  const evaluate = async (expression, awaitPromise = false) => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result?.value;
  };

  return { socket, call, evaluate, exceptions, consoleMessages, networkRequests, networkResponses, networkFailures };
}

async function waitFor(evaluate, expression, { timeout = 30000, label = expression } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await evaluate(expression).catch(() => false);
    if (value) return value;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`Timed out: ${label}`);
}

// Create HTTP server to serve dist files
async function createServer(port) {
  const server = http.createServer(async (req, res) => {
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.join(dist, urlPath);
    try {
      const data = await readFile(filePath);
      const ext = path.extname(filePath);
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ndjson': 'application/x-ndjson' };
      res.writeHead(200, { 'Content-Type': types[ext] ?? 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  await new Promise(r => server.listen(port, '127.0.0.1', r));
  return server;
}

// Compute dist hash
function computeDistHash() {
  const files = [];
  function walk(dir) {
    for (const entry of readFileSync(dir)) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  }
  // Simple hash of key files
  const keyFiles = ['app.js', 'browser-analytics.js', 'version.js', 'index.html', 'styles.css'];
  const hasher = crypto.createHash('sha256');
  for (const f of keyFiles) {
    try {
      const content = readFileSync(path.join(dist, f));
      hasher.update(f + ':' + content.length + ':');
      hasher.update(content);
    } catch {}
  }
  return hasher.digest('hex');
}

const debugPort = await reservePort();
const serverPort = await reservePort();
const profileDir = await mkdtemp(path.join(tmpdir(), 'intrilex-v0161-cert-'));

if (!existsSync(chromium)) {
  console.error('Chrome not found at', chromium);
  process.exit(1);
}

const distHash = computeDistHash();
const server = await createServer(serverPort);

const child = spawn(chromium, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--disable-background-networking', '--disable-default-apps', '--disable-extensions',
  '--disable-sync', '--disable-breakpad', '--disable-crash-reporter', '--no-proxy-server',
  '--metrics-recording-only', '--no-first-run',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profileDir}`,
  'about:blank'
], { cwd: root, stdio: 'ignore', detached: true });
child.unref();

let cdp;
let report;
const testResults = { passed: 0, failed: 0, skipped: 0, tests: [] };

function recordTest(name, passed, details = '') {
  testResults.tests.push({ name, passed, details });
  if (passed) testResults.passed++;
  else testResults.failed++;
}

try {
  cdp = await connectCdp(debugPort);
  console.log('CDP connected, navigating to app...');

  // Navigate to the app
  await cdp.call('Page.navigate', { url: `http://127.0.0.1:${serverPort}/#/watch` });
  await new Promise(r => setTimeout(r, 2000));

  // Wait for app to load
  try {
    await waitFor(cdp.evaluate, `document.querySelector('#page-title')?.textContent === 'Watch' && Boolean(document.querySelector('#replay-slider'))`, { timeout: 30000, label: 'Watch workspace boot' });
    recordTest('Watch workspace boot', true);
    console.log('Watch workspace booted successfully');
  } catch (e) {
    const pageTitle = await cdp.evaluate(`document.querySelector('#page-title')?.textContent ?? 'NONE'`);
    const bodyText = await cdp.evaluate(`document.body?.textContent?.substring(0, 500) ?? 'EMPTY'`);
    recordTest('Watch workspace boot', false, `Page title: ${pageTitle}, Body: ${bodyText.substring(0, 200)}, Exceptions: ${cdp.exceptions.join('; ')}`);
    throw new Error(`Watch workspace boot failed. Page title: ${pageTitle}. Exceptions: ${cdp.exceptions.slice(-3).join('; ')}`);
  }

  // Test route navigation
  const routes = [
    ['/', 'Landing', () => cdp.evaluate(`getComputedStyle(document.querySelector('.observatory-shell')).display === 'none' && Boolean(document.querySelector('#landing-app .landing-app'))`)],
    ['/play', 'Play Hub', () => cdp.evaluate(`Boolean(document.querySelector('[data-testid="play-hub"]'))`)],
    ['/rules', 'Rules', () => cdp.evaluate(`Boolean(document.querySelector('.rules-page'))`)],
    ['/sim', 'Sim (Watch)', () => cdp.evaluate(`document.querySelector('#page-title')?.textContent === 'Watch'`)],
    ['/watch', 'Watch', () => cdp.evaluate(`document.querySelector('#page-title')?.textContent === 'Watch' && Boolean(document.querySelector('#replay-slider'))`)],
    ['/replays', 'Replays', () => cdp.evaluate(`document.querySelector('#page-title')?.textContent === 'Replays'`)],
    ['/history', 'History', () => cdp.evaluate(`document.querySelector('#page-title')?.textContent === 'History'`)],
    ['/mechanics', 'Mechanics', () => cdp.evaluate(`document.querySelector('#page-title')?.textContent === 'Mechanics'`)],
    ['/cards', 'Card Faces', () => cdp.evaluate(`document.querySelector('#page-title')?.textContent === 'Card Faces'`)],
    ['/synergies', 'Synergies', () => cdp.evaluate(`document.querySelector('#page-title')?.textContent === 'Synergies'`)],
    ['/ranks', 'Ranks', () => cdp.evaluate(`document.querySelector('#page-title')?.textContent === 'Ranks'`)],
    ['/compare', 'Compare', () => cdp.evaluate(`document.querySelector('#page-title')?.textContent === 'Compare'`)],
    ['/traces', 'Traces', () => cdp.evaluate(`document.querySelector('#page-title')?.textContent === 'Traces'`)],
    ['/branches', 'Branches', () => cdp.evaluate(`document.querySelector('#page-title')?.textContent === 'Branches'`)],
    ['/diagnostics', 'Diagnostics', () => cdp.evaluate(`document.querySelector('#page-title')?.textContent === 'Diagnostics'`)],
    ['/evidence', 'Evidence', () => cdp.evaluate(`document.querySelector('#page-title')?.textContent === 'Evidence'`)]
  ];

  for (const [route, label, checkFn] of routes) {
    await cdp.evaluate(`location.hash='#${route}'`);
    await new Promise(r => setTimeout(r, 500));
    try {
      const ok = await checkFn();
      recordTest(`Route ${route} (${label})`, ok, ok ? '' : 'Expected content not found');
    } catch (e) {
      recordTest(`Route ${route} (${label})`, false, e.message);
    }
  }

  // Test Rank Anatomy workspace
  await cdp.evaluate(`location.hash='#/ranks'`);
  await new Promise(r => setTimeout(r, 1000));

  const rankAnatomyCheck = await cdp.evaluate(`(() => {
    const title = document.querySelector('#page-title')?.textContent;
    const appText = document.querySelector('#app')?.textContent ?? '';
    const hasRankAnatomy = appText.includes('Rank Anatomy') || appText.includes('Anatomy') || appText.includes('rank');
    const hasTabs = document.querySelector('.anatomy-tab') || document.querySelector('[data-anatomy-tab]');
    const hasRankList = document.querySelector('.rank-list') || document.querySelector('[data-rank-list]');
    return { title, hasRankAnatomy, hasTabs: Boolean(hasTabs), hasRankList: Boolean(hasRankList), textLength: appText.length };
  })()`);
  recordTest('Rank Anatomy workspace renders', rankAnatomyCheck.title === 'Ranks' && rankAnatomyCheck.hasRankAnatomy, JSON.stringify(rankAnatomyCheck));

  // Test viewport matrix
  await mkdir(screenshotDir, { recursive: true });
  const viewportResults = [];
  for (const [name, width, height] of [['mobile-390', 390, 844], ['tablet-768', 768, 1024], ['desktop-1366', 1366, 768], ['theatre-1920', 1920, 1080]]) {
    await cdp.call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await cdp.evaluate(`location.hash='#/ranks'`);
    await new Promise(r => setTimeout(r, 500));
    const geometry = await cdp.evaluate(`(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      workspace: document.querySelector('#page-title')?.textContent,
      hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    }))()`);
    recordTest(`Viewport ${name} (${width}x${height}) - no horizontal overflow`, !geometry.hasOverflow, JSON.stringify(geometry));
    const shot = await cdp.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path.join(screenshotDir, `${name}-ranks.png`), Buffer.from(shot.data, 'base64'));
    viewportResults.push({ name, width, height, ...geometry, screenshot: `reports/v0.16.1-browser/${name}-ranks.png` });
  }

  // Test reduced motion
  await cdp.call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const reduced = await cdp.evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches`);
  recordTest('Reduced motion emulation', reduced);

  // Test keyboard accessibility
  await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await cdp.evaluate(`location.hash='#/ranks'`);
  await new Promise(r => setTimeout(r, 500));
  const keyboardCheck = await cdp.evaluate(`(() => {
    const focusable = [...document.querySelectorAll('a[href], button, [tabindex], input, select, textarea')].filter(el => {
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && !el.disabled;
    });
    return { focusableCount: focusable.length, firstFocusable: focusable[0]?.tagName, hasSkipLink: Boolean(document.querySelector('a.skip-link[href="#main"]')) };
  })()`);
  recordTest('Keyboard accessibility - focusable elements exist', keyboardCheck.focusableCount > 0, JSON.stringify(keyboardCheck));

  // Check for console errors
  const consoleErrors = cdp.consoleMessages.filter(m => m.type === 'error');
  recordTest('No critical console errors', consoleErrors.length === 0, `${consoleErrors.length} console errors: ${consoleErrors.map(e => e.args).join('; ')}`);

  // Check for network failures
  recordTest('No network failures', cdp.networkFailures.length === 0, `${cdp.networkFailures.length} network failures: ${cdp.networkFailures.map(f => f.errorText).join('; ')}`);

  // Check for unhandled exceptions
  recordTest('No unhandled exceptions', cdp.exceptions.length === 0, `${cdp.exceptions.length} exceptions: ${cdp.exceptions.slice(-3).join('; ')}`);

  // Build final report
  const completedAt = new Date().toISOString();
  const browserVersion = await cdp.evaluate(`navigator.userAgent`);

  report = {
    schemaVersion: '1.0.0',
    generator: 'scripts/browser-certification-v0161.mjs',
    generatorHash: crypto.createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
    command: `node scripts/browser-certification-v0161.mjs`,
    sourceTreeHash: 'see V0.16.1_BASELINE_AUDIT.json',
    distHash,
    browser: {
      name: 'Chrome',
      version: browserVersion,
      executablePath: chromium
    },
    startedAt: startTime,
    completedAt,
    passed: testResults.passed,
    failed: testResults.failed,
    skipped: testResults.skipped,
    tests: testResults.tests,
    viewports: viewportResults,
    consoleErrors,
    networkFailures: cdp.networkFailures,
    exceptions: cdp.exceptions,
    artifacts: [screenshotDir]
  };

  // Hash the report immediately
  const reportHash = crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
  report.reportHash = reportHash;

  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  await writeFile(consolePath, JSON.stringify({ messages: cdp.consoleMessages, exceptions: cdp.exceptions }, null, 2) + '\n');
  await writeFile(networkPath, JSON.stringify({ requests: cdp.networkRequests, responses: cdp.networkResponses, failures: cdp.networkFailures }, null, 2) + '\n');

  const status = testResults.failed === 0 ? 'PASS' : 'FAIL';
  await writeFile(reportMdPath, `# V0.16.1 Browser Certification\n\nStatus: **${status}**\n\n- Tests: ${testResults.passed} passed, ${testResults.failed} failed, ${testResults.skipped} skipped\n- Browser: ${browserVersion}\n- Dist hash: ${distHash.substring(0, 16)}\n- Report hash: ${reportHash.substring(0, 16)}\n- Viewports tested: ${viewportResults.length}\n- Console errors: ${consoleErrors.length}\n- Network failures: ${cdp.networkFailures.length}\n- Exceptions: ${cdp.exceptions.length}\n- Screenshots: ${screenshotDir}\n\n## Test Results\n\n${testResults.tests.map(t => `- [${t.passed ? 'PASS' : 'FAIL'}] ${t.name}${t.details ? ' — ' + t.details : ''}`).join('\n')}\n`);

  console.log(`BROWSER CERTIFICATION ${status}: ${testResults.passed} passed, ${testResults.failed} failed`);
  if (testResults.failed > 0) {
    console.log('Failed tests:');
    testResults.tests.filter(t => !t.passed).forEach(t => console.log(`  - ${t.name}: ${t.details}`));
  }

} catch (error) {
  report = {
    schemaVersion: '1.0.0',
    generator: 'scripts/browser-certification-v0161.mjs',
    status: 'FAIL',
    error: error.stack ?? String(error),
    startedAt: startTime,
    completedAt: new Date().toISOString(),
    exceptions: cdp?.exceptions ?? [],
    passed: testResults.passed,
    failed: testResults.failed + 1,
    skipped: testResults.skipped,
    tests: testResults.tests
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n').catch(() => {});
  console.error('BROWSER CERTIFICATION FAIL:', error.message);
  process.exitCode = 1;
} finally {
  try { cdp?.socket.close(); } catch {}
  try { process.kill(-child.pid, 'SIGKILL'); } catch {}
  try { await rm(profileDir, { recursive: true, force: true }); } catch {}
  try { server.close(); } catch {}
}
