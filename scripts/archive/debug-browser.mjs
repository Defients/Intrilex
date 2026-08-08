// Quick debug script to see what the browser loads
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import {} from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = join(__dirname, '..');
const distDir = join(root, 'apps', 'lab-web', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

const server = createServer(async (req, res) => {
  try {
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = normalize(join(distDir, urlPath));
    if (!filePath.startsWith(distDir)) { res.writeHead(403); res.end('Forbidden'); return; }
    const data = await readFile(filePath);
    const mime = MIME[extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch (e) {
    console.log(`404: ${req.url}`);
    res.writeHead(404); res.end('Not found');
  }
});

server.listen(8787, '127.0.0.1', async () => {
  console.log('Server started on 8787');
  
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const proc = spawn(chromePath, [
    '--remote-debugging-port=9222',
    '--no-first-run',
    '--no-default-browser-check',
    '--no-sandbox',
    '--disable-gpu',
    '--headless=new',
    '--window-size=1280,800',
    'http://127.0.0.1:8787/#/play/new',
  ], { stdio: 'pipe' });

  await new Promise(r => setTimeout(r, 3000));

  try {
    const resp = await fetch('http://127.0.0.1:9222/json');
    const targets = await resp.json();
    const pageTarget = targets.find(t => t.type === 'page');
    if (pageTarget) {
      const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
      await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
      
      let msgId = 0;
      const pending = new Map();
      ws.addEventListener('message', (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && pending.has(msg.id)) {
          const { resolve } = pending.get(msg.id);
          pending.delete(msg.id);
          resolve(msg.result);
        }
      });

      async function send(method, params = {}) {
        const id = ++msgId;
        return new Promise((resolve) => {
          pending.set(id, { resolve });
          ws.send(JSON.stringify({ id, method, params }));
        });
      }

      await send('Runtime.enable');
      
      // Wait for page to load
      await new Promise(r => setTimeout(r, 3000));

      const result = await send('Runtime.evaluate', {
        expression: `(() => ({
          url: location.href,
          hash: location.hash,
          title: document.title,
          bodyHTML: document.body.innerHTML.substring(0, 2000),
          readyState: document.readyState,
          forms: document.querySelectorAll('form').length,
          playHub: document.querySelector('.play-hub')?.outerHTML?.substring(0, 200) || null,
          newMatchForm: document.querySelector('#new-match-form')?.outerHTML?.substring(0, 200) || null,
          allButtons: document.querySelectorAll('button').length,
          allDivs: document.querySelectorAll('div').length,
          errors: window.__errors || [],
        }))()`,
        returnByValue: true,
      });

      console.log('Page state:', JSON.stringify(result.result.value, null, 2));
      
      // Also check console errors
      const consoleResult = await send('Runtime.evaluate', {
        expression: `(() => {
          const errors = [];
          const origError = console.error;
          return 'Check console manually';
        })()`,
        returnByValue: true,
      });

      ws.close();
    }
  } catch (e) {
    console.error('Debug error:', e.message);
  }

  proc.kill();
  server.close();
  process.exit(0);
});
