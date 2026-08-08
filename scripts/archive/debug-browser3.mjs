import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = join(__dirname, '..');
const distDir = join(root, 'apps', 'lab-web', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0];
    if (p === '/') p = '/index.html';
    const fp = normalize(join(distDir, p));
    if (!fp.startsWith(distDir)) { res.writeHead(403); res.end('Forbidden'); return; }
    const data = await readFile(fp);
    res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('404'); }
});

server.listen(8787, '127.0.0.1', async () => {
  const proc = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--remote-debugging-port=9222', '--no-first-run', '--no-default-browser-check',
    '--no-sandbox', '--disable-gpu', '--headless=new', '--window-size=1280,800',
    'http://127.0.0.1:8787/#/play/new',
  ], { stdio: 'pipe' });

  await new Promise(r => setTimeout(r, 2000));

  const resp = await fetch('http://127.0.0.1:9222/json/version');
  const version = await resp.json();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));

  let id = 0;
  const pending = new Map();
  const events = [];
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method) events.push(msg);
  });

  function send(method, params = {}) {
    const i = ++id;
    return new Promise(r => { pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  }

  await send('Target.setDiscoverTargets', { discover: true });
  
  // Find the page target
  const tabs = await send('Target.getTargets');
  const pageTab = tabs.result.targetInfos.find(t => t.type === 'page' && t.url.includes('8787'));
  
  if (!pageTab) { console.log('No page tab found'); console.log(JSON.stringify(tabs, null, 2)); proc.kill(); server.close(); process.exit(1); }
  
  // Attach to it
  const attach = await send('Target.attachToTarget', { targetId: pageTab.targetId, flatten: true });
  const sid = attach.result.sessionId;

  // Enable Runtime to capture errors
  await send('Runtime.enable', { sessionId: sid });

  // Wait for page load + play module
  await new Promise(r => setTimeout(r, 5000));

  // Evaluate
  const evalResult = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      url: location.href,
      hash: location.hash,
      landingDisplay: document.querySelector('#landing-app')?.style?.display,
      shellDisplay: document.querySelector('.observatory-shell')?.style?.display,
      playRoot: document.querySelector('#play-root')?.innerHTML?.substring(0, 500) || 'NOT_FOUND',
      newMatchForm: document.querySelector('#new-match-form')?.outerHTML?.substring(0, 300) || 'NOT_FOUND',
      allForms: Array.from(document.querySelectorAll('form')).map(f => f.id || f.className || 'unnamed'),
      landingHTML: document.querySelector('#landing-app')?.innerHTML?.substring(0, 800) || 'NOT_FOUND',
    })`,
    returnByValue: true,
    sessionId: sid,
  });

  console.log('Eval result:', evalResult.result?.result?.value || JSON.stringify(evalResult, null, 2));

  // Show exceptions
  const exceptions = events.filter(e => e.method === 'Runtime.exceptionThrown');
  console.log(`\nExceptions (${exceptions.length}):`);
  for (const ex of exceptions) {
    console.log('  ', ex.params.exceptionDetails?.text, ex.params.exceptionDetails?.exception?.description?.substring(0, 300));
  }

  const consoleCalls = events.filter(e => e.method === 'Runtime.consoleAPICalled');
  console.log(`\nConsole calls (${consoleCalls.length}):`);
  for (const c of consoleCalls) {
    console.log('  ', c.params.type, c.params.args?.map(a => a.value || a.description || '').join(' '));
  }

  ws.close();
  proc.kill();
  server.close();
  process.exit(0);
});
