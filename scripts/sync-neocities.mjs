/**
 * Sync the fresh browser build (apps/lab-web/dist) into the neocities-deploy/ folder.
 *
 * This is a one-way mirror: dist -> neocities-deploy. It:
 *   1. Validates that dist exists and contains a built index.html + hashed app bundle.
 *   2. Reads the new index.html to find the current `app.<hash>.js` and `styles.<hash>.css` references.
 *   3. Deletes any stale hashed `app.*.js` / `styles.*.css` files in neocities-deploy/ that no longer match.
 *   4. Recursively copies dist/ over neocities-deploy/ (overwriting changed files, leaving neocities-only
 *      files like `404.html` and `assets/fonts/*` untouched since they aren't in dist).
 *   5. Verifies the result: index.html references, bundle sizes, preserved extras.
 *
 * Usage:
 *   node scripts/sync-neocities.mjs            # sync only (assumes build already ran)
 *   node scripts/sync-neocities.mjs --build    # run `pnpm run build` first, then sync
 *
 * Exit code is non-zero on any failure. Safe to re-run.
 */
import { cp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'apps/lab-web/dist');
const deployDir = path.join(root, 'neocities-deploy');

const runBuildFirst = process.argv.includes('--build');

/** @param {string} cmd @param {string[]} args @returns {Promise<void>} */
function runCmd(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0) reject(new Error(`${cmd} exited with code ${code}`));
      else resolve();
    });
  });
}

/**
 * Extract the hashed bundle filenames referenced by index.html.
 * @param {string} html @returns {{ appJs: string|null, stylesCss: string|null }}
 */
function extractBundleRefs(html) {
  const appMatch = html.match(/<script[^>]+src="(app\.[a-f0-9]+\.js)"/);
  const cssMatch = html.match(/<link[^>]+rel="stylesheet"[^>]+href="(styles\.[a-f0-9]+\.css)"/);
  return { appJs: appMatch ? appMatch[1] : null, stylesCss: cssMatch ? cssMatch[1] : null };
}

/**
 * List hashed bundle files in a directory matching `app.*.js` or `styles.*.css`.
 * @param {string} dir @returns {Promise<{app: string[], styles: string[]}>}
 */
async function listHashedBundles(dir) {
  if (!existsSync(dir)) return { app: [], styles: [] };
  const entries = await readdir(dir, { withFileTypes: true });
  const app = entries.filter((e) => e.isFile() && /^app\.[a-f0-9]+\.js$/.test(e.name)).map((e) => e.name);
  const styles = entries.filter((e) => e.isFile() && /^styles\.[a-f0-9]+\.css$/.test(e.name)).map((e) => e.name);
  return { app, styles };
}

async function main() {
  if (runBuildFirst) {
    console.log('[neocities] Running build first...');
    await runCmd('pnpm', ['run', 'build']);
    console.log('[neocities] Build complete.\n');
  }

  // 1. Validate dist
  if (!existsSync(distDir)) {
    throw new Error(`Build output not found: ${distDir}\nRun \`pnpm run build\` first, or use --build.`);
  }
  const distIndex = path.join(distDir, 'index.html');
  if (!existsSync(distIndex)) {
    throw new Error(`index.html missing in dist: ${distIndex}`);
  }
  const distHtml = await readFile(distIndex, 'utf8');
  const refs = extractBundleRefs(distHtml);
  if (!refs.appJs) {
    throw new Error('Could not find hashed app.*.js reference in dist/index.html');
  }
  const distAppPath = path.join(distDir, refs.appJs);
  if (!existsSync(distAppPath)) {
    throw new Error(`Referenced bundle missing in dist: ${refs.appJs}`);
  }
  const distAppStat = await stat(distAppPath);
  console.log(`[neocities] Source build: app=${refs.appJs} (${distAppStat.size} bytes)${refs.stylesCss ? `, styles=${refs.stylesCss}` : ''}`);

  // 2. Ensure deploy dir exists (create if missing — first run or after cleanup)
  if (!existsSync(deployDir)) {
    await mkdir(deployDir, { recursive: true });
    console.log(`[neocities] Created neocities-deploy/ (first run or after cleanup)`);
  }

  // 3. Delete stale hashed bundles in deploy (anything not matching the new refs)
  const deployBundles = await listHashedBundles(deployDir);
  const staleApp = deployBundles.app.filter((f) => f !== refs.appJs);
  const staleStyles = deployBundles.styles.filter((f) => f !== refs.stylesCss);
  for (const f of [...staleApp, ...staleStyles]) {
    const p = path.join(deployDir, f);
    if (existsSync(p)) {
      await rm(p, { force: true });
      console.log(`[neocities] Deleted stale bundle: ${f}`);
    }
  }

  // 4. Copy dist -> deploy (recursive, overwrite). Files not in dist (404.html, fonts) are preserved.
  await cp(distDir, deployDir, { recursive: true, force: true });
  console.log('[neocities] Copied dist -> neocities-deploy');

  // 4b. Prune stale data files/dirs in deploy that no longer exist in dist.
  // The cp above overwrites changed files but does NOT delete files removed from
  // dist (e.g. when build.mjs excludes unused data artifacts). Without this, old
  // unused files accumulate forever in neocities-deploy and get re-uploaded.
  const deployDataDir = path.join(deployDir, 'data');
  const distDataDir = path.join(distDir, 'data');
  if (existsSync(deployDataDir) && existsSync(distDataDir)) {
    const { readdir: rd, rm: rmf } = await import('node:fs/promises');
    /** Recursively collect relative paths (forward slashes) under a dir. @param {string} dir @param {string} base @returns {Promise<Set<string>>} */
    async function collectPaths(dir, base = '') {
      const out = new Set();
      const entries = await rd(dir, { withFileTypes: true });
      for (const e of entries) {
        const rel = base ? `${base}/${e.name}` : e.name;
        if (e.isDirectory()) {
          out.add(rel + '/');
          for (const sub of await collectPaths(path.join(dir, e.name), rel)) out.add(sub);
        } else {
          out.add(rel);
        }
      }
      return out;
    }
    const distPaths = await collectPaths(distDataDir);
    const deployPaths = await collectPaths(deployDataDir);
    let pruned = 0;
    // Delete deploy paths that don't exist in dist (files first, then empty dirs)
    const staleFiles = [...deployPaths].filter((p) => !p.endsWith('/') && !distPaths.has(p));
    const staleDirs = [...deployPaths].filter((p) => p.endsWith('/') && !distPaths.has(p)).sort().reverse();
    for (const rel of staleFiles) {
      await rmf(path.join(deployDataDir, rel), { force: true });
      pruned++;
    }
    for (const rel of staleDirs) {
      const abs = path.join(deployDataDir, rel.slice(0, -1));
      if (existsSync(abs)) { await rmf(abs, { recursive: true, force: true }); pruned++; }
    }
    if (pruned > 0) console.log(`[neocities] Pruned ${pruned} stale data file(s)/dir(s) no longer in dist`);
  }

  // 5. Verify
  const deployIndex = path.join(deployDir, 'index.html');
  const deployHtml = await readFile(deployIndex, 'utf8');
  const deployRefs = extractBundleRefs(deployHtml);
  if (deployRefs.appJs !== refs.appJs) {
    throw new Error(`index.html app ref mismatch after copy: expected ${refs.appJs}, got ${deployRefs.appJs}`);
  }
  const deployAppPath = path.join(deployDir, refs.appJs);
  const deployAppStat = await stat(deployAppPath);
  if (deployAppStat.size !== distAppStat.size) {
    throw new Error(`Bundle size mismatch: dist=${distAppStat.size}, deploy=${deployAppStat.size}`);
  }

  // Confirm preserved extras
  const preserved = [];
  if (existsSync(path.join(deployDir, '404.html'))) preserved.push('404.html');
  if (existsSync(path.join(deployDir, 'assets/fonts'))) preserved.push('assets/fonts/');
  if (existsSync(path.join(deployDir, 'assets/fonts/fonts.css'))) preserved.push('assets/fonts/fonts.css');

  console.log('');
  console.log('[neocities] SYNC PASS');
  console.log(`  app bundle : ${refs.appJs} (${deployAppStat.size} bytes)`);
  if (refs.stylesCss) console.log(`  styles     : ${refs.stylesCss}`);
  if (preserved.length) console.log(`  preserved  : ${preserved.join(', ')}`);
  console.log('');
  console.log('Next step — upload with your neocities credentials:');
  console.log('  neocities-cli --username=YOUR_USER --password=YOUR_PASS --upload=neocities-deploy');
  console.log('  (or use a ./neocities.config.js file — see scripts/sync-neocities.mjs header)');
}

try {
  await main();
} catch (err) {
  console.error(`[neocities] SYNC FAIL: ${err.message}`);
  process.exit(1);
}
