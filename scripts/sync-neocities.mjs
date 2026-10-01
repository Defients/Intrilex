/**
 * Sync the fresh browser build (apps/lab-web/dist) into the neocities-deploy/ folder.
 *
 * This is a one-way mirror: dist -> neocities-deploy. It:
 *   1. Validates that dist exists and contains a built index.html + hashed app bundle.
 *   2. Reads the new index.html to find the current `app.<hash>.js` and `styles.<hash>.css` references.
 *   3. Deletes any stale hashed `app.*.js` / `styles.*.css` files in neocities-deploy/ that no longer match.
 *   4. Recursively copies dist/ over neocities-deploy/ (overwriting changed files, leaving neocities-only
 *      files like `404.html` and `assets/fonts/*` untouched since they aren't in dist).
 *   5. Generates source-owned stale-SW compatibility stubs and verifies byte parity.
 *
 * Usage:
 *   node scripts/sync-neocities.mjs            # sync only (assumes build already ran)
 *   node scripts/sync-neocities.mjs --build    # run `pnpm run build` first, then sync
 *   node scripts/sync-neocities.mjs --check    # read-only byte parity + ownership verification
 *
 * Exit code is non-zero on any failure. Safe to re-run.
 */
import { cp, mkdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pruneDeployFiles, writeDeployOwnership, deployParityProblems, finalizeDeployRuntime } from './deploy-ownership.mjs';

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
 * @param {string} html @returns {{ appJs: string|null, stylesCss: string|null, configJs: string|null }}
 */
function extractBundleRefs(html) {
  const appMatch = html.match(/<script[^>]+src="(app\.[a-f0-9]+\.js)"/);
  const cssMatch = html.match(/<link[^>]+rel="stylesheet"[^>]+href="(styles\.[a-f0-9]+\.css)"/);
  const configMatch = html.match(/<script[^>]+src="\/?(__intrilex-config\.[a-f0-9]+\.js)"/);
  return {
    appJs: appMatch ? appMatch[1] : null,
    stylesCss: cssMatch ? cssMatch[1] : null,
    configJs: configMatch ? configMatch[1] : null,
  };
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  if (checkOnly && runBuildFirst) throw new Error('--check is read-only and cannot be combined with --build');
  if (runBuildFirst) {
    console.log('[neocities] Running build first...');
    // Force the production WSS endpoint for Neocities builds.
    // The .env file may contain the dev ws://localhost:3099 value;
    // setting this in-process before spawning the build child ensures
    // the production wss://match.intrilex.cards URL is injected into
    // __intrilex-config.js and the CSP connect-src directive.
    process.env.INTRILEX_MATCH_SERVER_URL = 'wss://match.intrilex.cards';
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

  if (checkOnly) {
    const problems = await deployParityProblems(distDir, deployDir, refs.appJs);
    if (problems.length) throw new Error(problems.join('\n'));
    console.log('[neocities] Source/deploy byte parity and ownership PASS');
    return;
  }
  // Creation is allowed only for a sync; verification never mutates the mirror.
  if (!existsSync(deployDir)) await mkdir(deployDir, { recursive: true });
  const stale = await pruneDeployFiles(distDir, deployDir);
  console.log(`[neocities] Pruned ${stale.length} stale owned build files`);

  // 4. Copy dist -> deploy (recursive, overwrite). Files not in dist (404.html, fonts) are preserved.
  await cp(distDir, deployDir, { recursive: true, force: true });
  console.log('[neocities] Copied dist -> neocities-deploy');

  // Compatibility files are generated by the same projection used by --check.
  await finalizeDeployRuntime(deployDir, refs.appJs);

  await writeDeployOwnership(distDir, deployDir);

  const parityProblems = await deployParityProblems(distDir, deployDir, refs.appJs);
  if (parityProblems.length) throw new Error(parityProblems.join('\n'));

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
  console.log('Next step — upload using environment-only credentials:');
  console.log('  $env:NEOCITIES_API_KEY="..."; pnpm run upload:neocities');
  console.log('  Run `node scripts/upload-neocities.mjs --dry-run` first.');
}

try {
  await main();
} catch (err) {
  console.error(`[neocities] SYNC FAIL: ${err.message}`);
  process.exit(1);
}
