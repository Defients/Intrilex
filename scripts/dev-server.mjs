import http from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'apps/lab-web/dist');
const srcDir = path.join(root, 'apps/lab-web/src');

// ── Load .env file (lightweight dotenv — no dependency) ──
const envPath = path.join(root, '.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
  console.log('[env] Loaded .env file');
}

// Parse --watch flag
const watchMode = process.argv.includes('--watch');
// Parse --with-network flag (v0.24.1: start match authority server alongside dev server)
const withNetwork = process.argv.includes('--with-network');

if (!existsSync(path.join(dist, 'index.html'))) {
  const result = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Load bundle manifest for hashed asset names
let bundleManifest = null;
try {
  bundleManifest = JSON.parse(await readFile(path.join(dist, 'BUNDLE_MANIFEST.json'), 'utf8'));
} catch {
  // No manifest — use unhashed filenames (dev mode before bundling)
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8'
};

// Hashed assets (app.[hash].js, styles.[hash].css) get long-lived cache
const hashedPattern = /\.[a-f0-9]{12}\.(js|css)$/;

// ── Watch mode: rebuild on src/ changes ─────────────────────────
let rebuildTimer = null;
let isBuilding = false;
const sseClients = new Set();

// Hot-reload client script body — served as an external same-origin JS file
// so it complies with CSP script-src 'self' (no inline script needed).
const RELOAD_SCRIPT_BODY = '(function(){if(typeof EventSource!=="undefined"){var s=new EventSource("/__devreload");s.addEventListener("rebuild",function(){console.log("[dev] Rebuild detected — reloading...");location.reload();});}})();';

function scheduleRebuild(changedFile) {
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null;
    triggerRebuild(changedFile);
  }, 300); // Debounce 300ms
}

function triggerRebuild(changedFile) {
  if (isBuilding) return;
  isBuilding = true;
  const startTime = Date.now();
  console.log(`\n[watch] Rebuilding (${changedFile})...`);

  const child = spawn(process.execPath, ['scripts/build.mjs'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  child.stdout.on('data', (d) => { output += d.toString(); });
  child.stderr.on('data', (d) => { output += d.toString(); });

  child.on('close', (code) => {
    isBuilding = false;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    if (code === 0) {
      console.log(`[watch] Build succeeded in ${elapsed}s — notifying ${sseClients.size} client(s)`);
      // Reload bundle manifest
      readFile(path.join(dist, 'BUNDLE_MANIFEST.json'), 'utf8')
        .then(data => { bundleManifest = JSON.parse(data); })
        .catch(() => {});
      // Notify all SSE clients to reload
      for (const res of sseClients) {
        res.write('event: rebuild\ndata: {}\n\n');
      }
    } else {
      console.error(`[watch] Build failed (exit ${code}) in ${elapsed}s`);
      console.error(output);
    }
  });
}

if (watchMode) {
  // Lightweight file watcher using fs.watch (no external deps)
  const { watch } = await import('node:fs');
  const watchPaths = [
    { dir: srcDir, recursive: true },
    { dir: path.join(root, 'packages/analytics-ai/src'), recursive: false },
    { dir: path.join(root, 'packages/achievements/src'), recursive: false }
  ];

  for (const { dir, recursive } of watchPaths) {
    try {
      watch(dir, { recursive }, (eventType, filename) => {
        if (!filename) return;
        const fullPath = path.join(dir, filename);
        // Only trigger on source file changes
        if (/\.(js|mjs|css|html|json|svg)$/.test(filename)) {
          scheduleRebuild(filename);
        }
      });
      console.log(`[watch] Watching ${dir} for changes...`);
    } catch (err) {
      console.error(`[watch] Failed to watch ${dir}:`, err.message);
    }
  }
  console.log('[watch] Hot reload enabled — changes to src/ will auto-rebuild and refresh the browser.');
}

// ── HTTP server ─────────────────────────────────────────────────

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');

  // SSE endpoint for hot reload notifications
  if (url.pathname === '/__devreload' && watchMode) {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive'
    });
    response.write(': connected\n\n');
    sseClients.add(response);
    request.on('close', () => sseClients.delete(response));
    return;
  }

  // External hot-reload client script (served as same-origin JS so CSP script-src 'self' allows it)
  if (url.pathname === '/__devreload-client.js' && watchMode) {
    response.writeHead(200, {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    response.end(RELOAD_SCRIPT_BODY);
    return;
  }

  let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  let file = path.resolve(dist, relative);

  // Path traversal guard
  if (!file.startsWith(dist + path.sep) || !existsSync(file) || statSync(file).isDirectory()) {
    file = path.join(dist, 'index.html');
  }

  const ext = path.extname(file);
  response.setHeader('Content-Type', types[ext] ?? 'application/octet-stream');

  // Cache strategy (v0.24.2 fix):
  // - Hashed assets (app.[hash].js, styles.[hash].css): 1-year immutable (production)
  // - In dev/watch mode: HTML, non-hashed JS, AND non-hashed CSS all get no-store
  //   (prevents stale CSS during active development — no hard-refresh needed)
  // - In non-watch mode: HTML and non-hashed JS get no-store; CSS gets 1-hour
  // - Other static assets (JSON, images): 1-hour revalidate
  if (hashedPattern.test(file)) {
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (ext === '.html' || ext === '.js') {
    response.setHeader('Cache-Control', 'no-store');
  } else if (watchMode && ext === '.css') {
    // v0.24.2: In dev/watch mode, CSS must be no-store — otherwise developers
    // see stale CSS for up to 1 hour after editing, causing misleading GUI validation.
    response.setHeader('Cache-Control', 'no-store');
  } else if (ext === '.css') {
    // Non-watch mode: CSS can be cached briefly (pre-bundle dev)
    response.setHeader('Cache-Control', 'no-store');
  } else {
    response.setHeader('Cache-Control', 'public, max-age=3600');
  }

  // Serve browser-safe runtime config as an external same-origin JS file (CSP-compliant).
  // Contains: Supabase publishable credentials + match server WebSocket URL.
  // NEVER include server secrets here — this file is browser-visible.
  // Handles both the unhashed dev path (/__intrilex-config.js) and the
  // content-hashed production path (/__intrilex-config.[hash].js).
  if (url.pathname === '/__intrilex-config.js' || /^\/__intrilex-config\.[a-f0-9]+\.js$/.test(url.pathname)) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    // Dev default: ws://localhost:3099 unless overridden by INTRILEX_MATCH_SERVER_URL
    const matchServerUrl = process.env.INTRILEX_MATCH_SERVER_URL || (withNetwork ? 'ws://localhost:3099' : '');
    const configParts = [];
    if (supabaseUrl && supabaseKey) {
      configParts.push(`supabase:{url:${JSON.stringify(supabaseUrl)},publishableKey:${JSON.stringify(supabaseKey)}}`);
    }
    if (matchServerUrl) {
      configParts.push(`matchServerUrl:${JSON.stringify(matchServerUrl)}`);
    }
    const body = configParts.length > 0
      ? `window.__INTRILEX_CONFIG__={${configParts.join(',')}};`
      : '';
    response.writeHead(200, {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    response.end(body);
    return;
  }

  // In watch mode, inject hot-reload script into HTML
  if (watchMode && ext === '.html') {
    let html = await readFile(file, 'utf8');
    if (!html.includes('__devreload')) {
      const reloadScript = '<script src="/__devreload-client.js"></script>';
      html = html.replace('</head>', reloadScript + '\n</head>');
    }
    // Inject Supabase config via external script (CSP-compliant)
    if (!html.includes('__INTRILEX_CONFIG__')) {
      html = html.replace('</head>', '<script src="/__intrilex-config.js"></script>\n</head>');
    }
    response.end(html);
    return;
  }

  // Non-watch mode: also inject config for built dist
  if (!watchMode && ext === '.html') {
    let html = await readFile(file, 'utf8');
    if (!html.includes('__INTRILEX_CONFIG__')) {
      html = html.replace('</head>', '<script src="/__intrilex-config.js"></script>\n</head>');
    }
    response.end(html);
    return;
  }

  createReadStream(file).pipe(response);
});

server.listen(4173, '127.0.0.1', () => {
  const url = 'http://127.0.0.1:4173/#/';
  console.log(`Intrilex Lab: ${url}${watchMode ? ' (watch mode — auto-rebuild on src/ changes)' : ''}`);
});

// ── v0.24.0: Optional match authority server ─────────────────────
if (withNetwork) {
  try {
    const { startServer } = await import('../apps/match-server/src/server.mjs');
    // Pass Supabase env vars to the match server for auth + persistence
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
    const authMode = process.env.INTRILEX_AUTH_MODE || (supabaseUrl && supabaseSecretKey ? 'required' : 'disabled');
    const matchServer = await startServer({
      port: 3099, host: '127.0.0.1',
      supabaseUrl,
      supabaseSecretKey,
      authMode,
    });
    console.log('Match Authority Server: ws://127.0.0.1:3099');
    console.log(`Auth mode: ${authMode}`);
    if (supabaseUrl) console.log(`Supabase: ${supabaseUrl}`);
    console.log('Direct Duel lobby: http://127.0.0.1:4173/#/play/online');
    // Close match server when dev server exits
    process.on('SIGINT', () => { matchServer.close(); process.exit(0); });
    process.on('SIGTERM', () => { matchServer.close(); process.exit(0); });
  } catch (err) {
    console.error('[network] Failed to start match authority server:', err.message);
    console.error('[network] Direct Duel will not be available. Run "pnpm network:dev" separately.');
  }
}
