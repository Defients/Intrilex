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
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff',
};

const server = createServer(async (req, res) => {
  try {
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = normalize(join(distDir, urlPath));
    if (!filePath.startsWith(distDir)) { res.writeHead(403); res.end('Forbidden'); return; }
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end('Not found'); }
});

server.listen(8787, '127.0.0.1', async () => {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const proc = spawn(chromePath, [
    '--remote-debugging-port=9222', '--no-first-run', '--no-default-browser-check',
    '--no-sandbox', '--disable-gpu', '--headless=new', '--window-size=1280,800',
    'http://127.0.0.1:8787/#/play/new',
  ], { stdio: 'pipe' });

  await new Promise(r => setTimeout(r, 2000));

  try {
    const resp = await fetch('http://127.0.0.1:9222/json');
    const targets = await resp.json();
    const pageTarget = targets.find(t => t.type === 'page');
    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));

    let msgId = 0;
    const pending = new Map();
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve } = pending.get(msg.id);
        pending.delete(msg.id);
        resolve(msg);
      }
    });

    async function send(method, params = {}) {
      const id = ++msgId;
      return new Promise((resolve) => {
        pending.set(id, { resolve });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    // Enable console and runtime
    await send('Runtime.enable');
    await send('Log.enable');

    // Collect console errors
    const consoleMessages = [];
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.consoleAPICalled' || msg.method === 'Log.entryAdded' || msg.method === 'Runtime.exceptionThrown') {
        consoleMessages.push(msg);
      }
    });

    // Wait for page to fully load and play module to render
    await new Promise(r => setTimeout(r, 5000));

    const result = await send('Runtime.evaluate', {
      expression: `(() => ({
        url: location.href,
        hash: location.hash,
        landingDisplay: document.querySelector('#landing-app')?.style?.display,
        shellDisplay: document.querySelector('.observatory-shell')?.style?.display,
        playRoot: document.querySelector('#play-root')?.innerHTML?.substring(0, 500) || 'NOT FOUND',
        newMatchForm: document.querySelector('#new-match-form')?.outerHTML?.substring(0, 300) || 'NOT FOUND',
        playHub: document.querySelector('.play-hub')?.outerHTML?.substring(0, 300) || 'NOT FOUND',
        allForms: Array.from(document.querySelectorAll('form')).map(f => f.id || f.className || 'unnamed'),
        landingHTML: document.querySelector('#landing-app')?.innerHTML?.substring(0, 500) || 'NOT FOUND',
      }))()`,
      returnByValue: true,
    });

    console.log('Page state:', JSON.stringify(result.result.value, null, 2));
    console.log('\nConsole messages:');
    for (const msg of consoleMessages) {
      if (msg.method === 'Runtime.exceptionThrown') {
        console.log('  EXCEPTION:', JSON.stringify(msg.params.exceptionDetails, null, 2));
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        console.log('  CONSOLE:', msg.params.type, msg.params.args?.map(a => a.value || a.description || a.unserializableValue).join(' '));
      } else if (msg.method === 'Log.entryAdded') {
        console.log('  LOG:', msg.params.entry?.level, msg.params.entry?.text);
      }
    }

    ws.close();
  } catch (e) {
    console.error('Error:', e.message);
  }

  proc.kill();
  server.close();
  process.exit(0);
});
