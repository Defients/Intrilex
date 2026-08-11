/**
 * Upload the neocities-deploy/ folder to neocities.org with correct relative paths.
 *
 * Why this exists:
 *   `neocities-cli --upload=neocities-deploy` sends files with names like
 *   `neocities-deploy/index.html`, which creates a `neocities-deploy/` subdirectory
 *   on the remote site instead of placing files at the root. This script walks the
 *   deploy folder and uploads each file with the correct relative path (e.g. `index.html`,
 *   `assets/fonts/inter-400.ttf`, `data/observatory/analytics.json`).
 *
 * Credentials (in priority order):
 *   1. `neocities.config.js` in repo root:  module.exports = { username, password }
 *   2. env vars: NEOCITIES_USERNAME, NEOCITIES_PASSWORD
 *   3. CLI args: --username=..., --password=...
 *
 * Usage:
 *   node scripts/upload-neocities.mjs                  # upload everything (relative paths)
 *   node scripts/upload-neocities.mjs --dry-run        # list what would be uploaded, no network
 *   node scripts/upload-neocities.mjs --prune          # after upload, delete stale hashed bundles on remote
 *   node scripts/upload-neocities.mjs --only=index.html,app.js   # upload only specific files
 *
 * The --prune flag lists remote files via the neocities API and deletes any `app.*.js` /
 * `styles.*.css` files that are NOT referenced by the current local index.html. This keeps
 * the remote site clean across rebuilds (old hashed bundles don't accumulate forever).
 *
 * NOTE: This script makes real network calls to neocities.org. It is intentionally NOT
 * run by `build:neocities` — you must invoke it explicitly with your credentials.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deployDir = path.join(root, 'neocities-deploy');

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const prune = argv.includes('--prune');
const onlyArg = argv.find((a) => a.startsWith('--only='));
const onlyFilter = onlyArg ? onlyArg.slice(7).split(',').map((s) => s.trim()).filter(Boolean) : null;

/** @returns {Promise<{username: string, password: string}>} */
async function loadCredentials() {
  // 1. CLI args
  const userArg = argv.find((a) => a.startsWith('--username='));
  const passArg = argv.find((a) => a.startsWith('--password='));
  if (userArg && passArg) {
    return { username: userArg.slice(11), password: passArg.slice(11) };
  }
  // 2. neocities.config.js
  const cfgPath = path.join(root, 'neocities.config.js');
  if (existsSync(cfgPath)) {
    const mod = await import(`file://${cfgPath}`);
    if (mod.default) return mod.default;
    if (mod.username && mod.password) return { username: mod.username, password: mod.password };
  }
  // 3. env vars
  if (process.env.NEOCITIES_USERNAME && process.env.NEOCITIES_PASSWORD) {
    return { username: process.env.NEOCITIES_USERNAME, password: process.env.NEOCITIES_PASSWORD };
  }
  throw new Error(
    'No neocities credentials found. Provide --username=... --password=..., ' +
    'create neocities.config.js (module.exports = { username, password }), ' +
    'or set NEOCITIES_USERNAME / NEOCITIES_PASSWORD env vars.'
  );
}

/**
 * Recursively walk a directory and return [{ localPath, remotePath }] pairs.
 * remotePath uses forward slashes and is relative to deployDir.
 * @param {string} dir
 * @param {string} [base]
 * @returns {Promise<Array<{localPath: string, remotePath: string, size: number}>>}
 */
async function walkDir(dir, base = '') {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      out.push(...await walkDir(full, rel));
    } else if (e.isFile()) {
      const s = await stat(full);
      out.push({ localPath: full, remotePath: rel, size: s.size });
    }
  }
  return out;
}

/** Extract hashed bundle filenames referenced by index.html. */
function extractBundleRefs(html) {
  const appMatch = html.match(/<script[^>]+src="(app\.[a-f0-9]+\.js)"/);
  const cssMatch = html.match(/<link[^>]+rel="stylesheet"[^>]+href="(styles\.[a-f0-9]+\.css)"/);
  return { appJs: appMatch ? appMatch[1] : null, stylesCss: cssMatch ? cssMatch[1] : null };
}

/**
 * Upload a single file to neocities via the API.
 * Uses multipart/form-data with the field name = remote path.
 * @param {string} username @param {string} password
 * @param {string} localPath @param {string} remotePath
 * @returns {Promise<{result: string, message?: string}>}
 */
async function uploadOne(username, password, localPath, remotePath) {
  // Dynamic import of form-data (CommonJS) — available because neocities-cli depends on it
  const FormData = (await import('form-data')).default;
  const https = await import('node:https');
  const { createReadStream } = await import('node:fs');

  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append(remotePath, createReadStream(localPath));

    const req = https.request({
      method: 'post',
      host: 'neocities.org',
      path: '/api/upload',
      headers: { ...form.getHeaders(), Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64') },
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try {
          const obj = JSON.parse(body);
          resolve(obj);
        } catch {
          reject(new Error(`Non-JSON response for ${remotePath} (HTTP ${res.statusCode}): ${body.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    form.pipe(req);
  });
}

/**
 * List all files on the remote neocities site.
 * @param {string} username @param {string} password
 * @returns {Promise<Array<{path: string, is_directory: boolean}>>}
 */
async function listRemote(username, password) {
  const https = await import('node:https');
  return new Promise((resolve, reject) => {
    const req = https.request({
      method: 'get',
      host: 'neocities.org',
      path: '/api/list?recursive=true',
      headers: { Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64') },
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try {
          const obj = JSON.parse(body);
          if (obj.result === 'error') reject(new Error(obj.message || 'list failed'));
          else resolve(obj.files || []);
        } catch {
          reject(new Error(`Non-JSON list response (HTTP ${res.statusCode}): ${body.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Delete files on the remote neocities site.
 * @param {string} username @param {string} password
 * @param {string[]} filenames
 * @returns {Promise<{result: string, message?: string}>}
 */
async function deleteRemote(username, password, filenames) {
  const https = await import('node:https');
  const qs = await import('node:querystring');
  return new Promise((resolve, reject) => {
    const postData = qs.stringify({ 'filenames[]': filenames });
    const req = https.request({
      method: 'post',
      host: 'neocities.org',
      path: '/api/delete',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
      },
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try {
          const obj = JSON.parse(body);
          resolve(obj);
        } catch {
          reject(new Error(`Non-JSON delete response (HTTP ${res.statusCode}): ${body.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  if (!existsSync(deployDir)) {
    throw new Error(`neocities-deploy/ not found. Run \`npm run build:neocities\` first.`);
  }

  // Gather files to upload
  let files = await walkDir(deployDir);
  if (onlyFilter) {
    const set = new Set(onlyFilter);
    files = files.filter((f) => set.has(f.remotePath));
  }
  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  console.log(`[neocities-upload] ${files.length} files, ${Math.round(totalBytes / 1024 / 1024)} MB${dryRun ? ' (DRY RUN)' : ''}`);

  if (dryRun) {
    for (const f of files) {
      console.log(`  ${f.remotePath}  (${Math.round(f.size / 1024)} KB)`);
    }
    console.log('\n[neocities-upload] Dry run complete. No files uploaded.');
    return;
  }

  // Load credentials
  const creds = await loadCredentials();
  console.log(`[neocities-upload] Authenticated as: ${creds.username}`);

  // Upload each file
  let ok = 0, fail = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const pct = ((i / files.length) * 100).toFixed(0);
    try {
      const res = await uploadOne(creds.username, creds.password, f.localPath, f.remotePath);
      if (res.result === 'success') {
        ok++;
        if ((i % 50) === 0 || i === files.length - 1) {
          console.log(`  [${pct}%] ${i + 1}/${files.length}  ${f.remotePath}  ok`);
        }
      } else {
        fail++;
        console.error(`  [${pct}%] ${i + 1}/${files.length}  ${f.remotePath}  FAIL: ${res.message || JSON.stringify(res)}`);
      }
    } catch (err) {
      fail++;
      console.error(`  [${pct}%] ${i + 1}/${files.length}  ${f.remotePath}  ERROR: ${err.message}`);
    }
  }

  console.log(`\n[neocities-upload] UPLOAD ${fail === 0 ? 'PASS' : 'PARTIAL'}: ${ok} ok, ${fail} failed`);

  // Optional: prune stale hashed bundles on remote
  if (prune && fail === 0) {
    console.log('\n[neocities-upload] Pruning stale hashed bundles on remote...');
    const localIndex = await readFile(path.join(deployDir, 'index.html'), 'utf8');
    const refs = extractBundleRefs(localIndex);
    const keep = new Set([refs.appJs, refs.stylesCss].filter(Boolean));
    const remote = await listRemote(creds.username, creds.password);
    const stale = remote
      .filter((f) => !f.is_directory && /^app\.[a-f0-9]+\.js$/.test(f.path) && !keep.has(f.path))
      .concat(remote.filter((f) => !f.is_directory && /^styles\.[a-f0-9]+\.css$/.test(f.path) && !keep.has(f.path)))
      .map((f) => f.path);
    if (stale.length === 0) {
      console.log('[neocities-upload] No stale bundles to prune.');
    } else {
      console.log(`[neocities-upload] Deleting ${stale.length} stale bundle(s): ${stale.join(', ')}`);
      const delRes = await deleteRemote(creds.username, creds.password, stale);
      if (delRes.result === 'success') console.log('[neocities-upload] PRUNE PASS');
      else console.error(`[neocities-upload] PRUNE FAIL: ${delRes.message || JSON.stringify(delRes)}`);
    }
  }

  if (fail > 0) process.exit(1);
}

try {
  await main();
} catch (err) {
  console.error(`[neocities-upload] FAIL: ${err.message}`);
  process.exit(1);
}
