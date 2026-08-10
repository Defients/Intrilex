import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootPackage = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const productVersion = rootPackage.version;
const dist = path.join(root, 'apps/lab-web/dist');
const vendorRuntime = path.join(root, 'runtime/autonomy-engine-dist/src');

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
}
const browserEngine = path.join(dist, 'engine');
const certifiedReplaySource = path.join(root, 'upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix/replays');
const certifiedReplayDist = path.join(dist, 'data/certified-replays');

const capabilities = spawnSync(process.execPath, ['scripts/generate-capability-manifest.mjs'], { cwd: root, stdio: 'inherit' });
if (capabilities.status !== 0) process.exit(capabilities.status ?? 1);

// Generate version module from package.json (single source of truth)
const versionGen = spawnSync(process.execPath, ['scripts/generate-version.mjs'], { cwd: root, stdio: 'inherit' });
if (versionGen.status !== 0) process.exit(versionGen.status ?? 1);
const versionBrowser = spawnSync(process.execPath, ['scripts/generate-version.mjs', '--browser'], { cwd: root, stdio: 'inherit' });
if (versionBrowser.status !== 0) process.exit(versionBrowser.status ?? 1);

const generated = spawnSync(process.execPath, ['scripts/generate-data.mjs'], { cwd: root, stdio: 'inherit' });
if (generated.status !== 0) process.exit(generated.status ?? 1);
if (process.env.INTRILEX_SKIP_AUTONOMY_REPLAY_REGEN !== '1') {
  const autonomyArtifacts = spawnSync(process.execPath, ['scripts/generate-autonomy-replay-artifacts.mjs','--resume'], { cwd: root, stdio: 'inherit' });
  if (autonomyArtifacts.status !== 0) process.exit(autonomyArtifacts.status ?? 1);
}
const observatory = spawnSync(process.execPath, ['scripts/generate-observatory-analytics.mjs'], { cwd: root, stdio: 'inherit' });
if (observatory.status !== 0) process.exit(observatory.status ?? 1);
const extract = spawnSync(process.execPath, ['scripts/extract-analysis.mjs', '--out', 'sample-data/observatory/extract.json'], { cwd: root, stdio: 'inherit' });
if (extract.status !== 0) process.exit(extract.status ?? 1);
const extractMd = spawnSync(process.execPath, ['scripts/extract-analysis.mjs', '--markdown', '--out', 'sample-data/observatory/extract.md'], { cwd: root, stdio: 'inherit' });
if (extractMd.status !== 0) process.exit(extractMd.status ?? 1);

// ── Decision trace index: verify or regenerate (prevents silent broken dist) ──
const traceIndexPath = path.join(root, 'sample-data/autonomy/decision-trace-index.json');
let traceIndexExists = true;
try { await readFile(traceIndexPath, 'utf8'); } catch { traceIndexExists = false; }
if (!traceIndexExists) {
  console.log('decision-trace-index.json missing — regenerating via generate-decision-traces.mjs --resume');
  const traces = spawnSync(process.execPath, ['scripts/generate-decision-traces.mjs', '--resume'], { cwd: root, stdio: 'inherit' });
  if (traces.status !== 0) process.exit(traces.status ?? 1);
}
// ── Card art: regenerate WebP board assets from source PNGs (deterministic, skip-unchanged) ──
const cardArt = spawnSync(process.execPath, ['scripts/build-card-art.mjs'], { cwd: root, stdio: 'inherit' });
if (cardArt.status !== 0) process.exit(cardArt.status ?? 1);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(root, 'apps/lab-web/src'), dist, { recursive: true });
// ── Analytics AI core: copy isomorphic package modules into dist/analytics-ai ──
// The browser UI adapters (apps/lab-web/src/analytics-ai/*.js) import these
// .mjs modules via relative paths. The package is self-contained (no workspace
// imports, only the Fetch API), so no import rewriting is required.
{
  const aaiSrc = path.join(root, 'packages/analytics-ai/src');
  const aaiDist = path.join(dist, 'analytics-ai');
  await mkdir(aaiDist, { recursive: true });
  const aaiModules = (await readdir(aaiSrc)).filter(f => f.endsWith('.mjs'));
  for (const mod of aaiModules) {
    await cp(path.join(aaiSrc, mod), path.join(aaiDist, mod));
  }
}
// ── Achievements: copy isomorphic package modules into dist/achievements ──
// The browser UI adapters (apps/lab-web/src/achievements/*.js) import these
// .mjs modules via relative paths. The package is self-contained (no workspace
// imports), so no import rewriting is required.
{
  const achSrc = path.join(root, 'packages/achievements/src');
  const achDist = path.join(dist, 'achievements');
  await mkdir(achDist, { recursive: true });
  const achModules = (await readdir(achSrc)).filter(f => f.endsWith('.mjs'));
  for (const mod of achModules) {
    await cp(path.join(achSrc, mod), path.join(achDist, mod));
  }
}
// Copy scoring.mjs with Node→browser import rewrite (replace node:crypto with browser SHA-256 shim)
{
  let scoringSrc = await readFile(path.join(root, 'packages/policies/src/scoring.mjs'), 'utf8');
  scoringSrc = scoringSrc.replace(/import\s+\{\s*createHash\s*\}\s+from\s+["']node:crypto["'];?/g, 'import { sha256Text } from "./engine/hash.js";');
  scoringSrc = scoringSrc.replace(/createHash\(['"]sha256['"]\)\.update\((.+)\)\.digest\(['"]hex['"]\)/g, 'sha256Text($1)');
  await writeFile(path.join(dist, 'policy-scoring.js'), scoringSrc);
}
await cp(path.join(root, 'apps/lab-web/src/decision-intelligence.js'), path.join(dist, 'decision-intelligence.js'));

// ── HYBRIX browser bundle: copy agent modules with import rewriting ──
const hybrixSrc = path.join(root, 'packages/game-ai/src');
const hybrixDist = path.join(dist, 'hybrix');
await mkdir(hybrixDist, { recursive: true });
const hybrixModules = ['agent.mjs','perception.mjs','personality.mjs','memory.mjs','cognition.mjs','coordination.mjs','failsafe.mjs','debug.mjs','difficulty.mjs','config.mjs','policy-adapter.mjs','rank-strategy.mjs'];
for (const mod of hybrixModules) {
  let src = await readFile(path.join(hybrixSrc, mod), 'utf8');
  // Rewrite package imports to browser-compatible paths
  src = src.replace(/from\s+["']@intrilex\/shared["']/g, 'from "./browser-shared.js"');
  src = src.replace(/from\s+["']@intrilex\/policy-sdk["']/g, 'from "./browser-policy-sdk.js"');
  src = src.replace(/from\s+["']@intrilex\/policies\/scoring["']/g, 'from "../policy-scoring.js"');
  // Rewrite .mjs to .js in relative imports
  src = src.replace(/from\s+["']\.\/([\w-]+)\.mjs["']/g, 'from "./$1.js"');
  const outName = mod.replace(/\.mjs$/, '.js');
  await writeFile(path.join(hybrixDist, outName), src);
}
// Create browser-shared.js — re-exports hashCanonical from engine
await writeFile(path.join(hybrixDist, 'browser-shared.js'), [
  "export { hashCanonical, sha256Text } from '../engine/hash.js';",
  "export { canonicalize, canonicalClone } from '../engine/canonical-json.js';",
  "export function sanitizeCsvCell(value) {",
  "  const text = value == null ? '' : String(value);",
  "  const safe = /^[=+\\-@]/.test(text) ? `'${text}` : text;",
  "  return /[\",\\n\\r]/.test(safe) ? `\"${safe.replaceAll('\"', '\"\"')}\"` : safe;",
  "}",
  ''
].join('\n'));
// Create browser-policy-sdk.js — DeterministicPolicyRng (no Node.js deps)
await writeFile(path.join(hybrixDist, 'browser-policy-sdk.js'), [
  "import { hashCanonical } from './browser-shared.js';",
  "export class DeterministicPolicyRng {",
  "  constructor(seed) { const value = Number(seed) >>> 0; this.seed = value || 1; this.cursor = 0; }",
  "  nextUint32() { let x = this.seed >>> 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.seed = x >>> 0; this.cursor += 1; return this.seed; }",
  "  nextIndex(length) { if (!Number.isInteger(length) || length <= 0) throw new RangeError('length'); return this.nextUint32() % length; }",
  "}",
  "export function createPolicyDefinition({ policyId, version, traits, choose }) {",
  "  return { policyId, version: version ?? '1.0.0', traits: traits ?? {}, choose, policyHash: hashCanonical({ policyId, version: version ?? '1.0.0', traits: traits ?? {} }) };",
  "}",
  ''
].join('\n'));
// Copy sample-data into dist/data — exclude heavy replay blob directories by default.
// The browser lazy-loads individual replay JSONs by fixture ID, so the blobs are not
// needed at boot. Set INTRILEX_INCLUDE_REPLAY_BLOBS=1 to include them (for local dev
// or offline static hosting where no separate data CDN is used).
const includeReplayBlobs = process.env.INTRILEX_INCLUDE_REPLAY_BLOBS === '1';
const replayBlobDirs = new Set([
  'autonomy/lab-replays/authorized',
  'autonomy/lab-replays/public',
  'autonomy/replays/authorized',
  'autonomy/replays/public',
  'autonomy/decision-traces',
]);
if (includeReplayBlobs) {
  await cp(path.join(root, 'sample-data'), path.join(dist, 'data'), { recursive: true });
} else {
  await cp(path.join(root, 'sample-data'), path.join(dist, 'data'), {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(path.join(root, 'sample-data'), src);
      // Always copy root and top-level entries; skip only the heavy blob dirs
      if (!rel || rel === '.') return true;
      return !replayBlobDirs.has(rel.replace(/\\/g, '/'));
    },
  });
  console.log(`build: excluded replay blob directories (set INTRILEX_INCLUDE_REPLAY_BLOBS=1 to include) — saved ~670MB`);
}
// On Windows external/mapped drives, cp with filter may create directory entries
// without fully writing file contents. Re-copy the observatory directory without
// a filter to ensure the ~37MB analytics.json is fully written.
const observatorySrcDir = path.join(root, 'sample-data', 'observatory');
const observatoryDistDir = path.join(dist, 'data', 'observatory');
await rm(observatoryDistDir, { recursive: true, force: true });
await cp(observatorySrcDir, observatoryDistDir, { recursive: true });
// Wait for filesystem sync and verify the critical file is readable
let observatoryReady = false;
for (let attempt = 0; attempt < 20; attempt++) {
  try {
    const stat = await (await import('node:fs/promises')).stat(path.join(observatoryDistDir, 'analytics.json'));
    if (stat.size > 0) { observatoryReady = true; break; }
  } catch { /* not ready yet */ }
  await new Promise(r => setTimeout(r, 500));
}
if (!observatoryReady) {
  throw new Error('Observatory analytics.json could not be copied and verified after 20 retries');
}
await mkdir(path.join(dist, 'data/release'), { recursive: true });
await cp(path.join(root, 'docs/INTRILEX_v4.3.1_COMPLETE_PLAYER_RULEBOOK.md'), path.join(dist, 'data/rulebook.md'));
await cp(path.join(root, 'reports/capability-manifest.json'), path.join(dist, 'data/release/capability-manifest.json'));

const importPattern = /from\s+["']\.\/(.+?\.js)["']/g;
const requiredModules = new Set();
async function collect(moduleName) {
  if (requiredModules.has(moduleName)) return;
  requiredModules.add(moduleName);
  const source = await readFile(path.join(vendorRuntime, moduleName), 'utf8');
  for (const match of source.matchAll(importPattern)) await collect(match[1]);
}
for (const entry of ['phase16.js', 'engine.js', 'views.js', 'autonomy.js', 'core-autonomy.js', 'core-authority.js', 'core-effects.js', 'core-response.js', 'core-private-choice.js', 'core-advanced.js']) await collect(entry);
requiredModules.delete('hash.js');
await mkdir(browserEngine, { recursive: true });
for (const moduleName of [...requiredModules].sort()) {
  await cp(path.join(vendorRuntime, moduleName), path.join(browserEngine, moduleName));
}
await cp(path.join(root, 'packages/browser-crypto-shim/src/hash.js'), path.join(browserEngine, 'hash.js'));
await writeFile(path.join(browserEngine, 'browser-entry.js'), [
  "export { IntrilexEngine } from './engine.js';",
  "export { parseCertifiedReplay, verifyCertifiedReplay, createCertifiedReplay, publicCertifiedReplayView, serializeCertifiedReplay } from './phase16.js';",
  "export { publicStateView, privateStateView, publicEventView } from './views.js';",
  "export { hashCanonical, sha256Text } from './hash.js';",
  "export { deriveSecuredPoints } from './state.js';",
  "export { FIRST_CONTACT_AUTONOMY_BASELINE_PROFILE, FIRST_CONTACT_AUTONOMY_ESSENTIALS_PROFILE, FIRST_CONTACT_RESPONSE_AUTHORITY_PROFILE, FIRST_CONTACT_PRIVATE_CHOICE_AUTHORITY_PROFILE, FIRST_CONTACT_TRIGGER_CLOSURE_PROFILE, createMatchState, enumerateLegalActions, authorizedLegalActionView, advanceToDecision, autonomousCapabilities, runRandomLegalMatch } from './autonomy.js';",
  "export { createCoreMatchState, advanceCoreToDecision, enumerateCoreLegalActions, enumerateCoreResponseActions, enumerateCorePrivateChoiceActions, toAuthorizedCoreAction, coreAuthorityCapabilities } from './core-autonomy.js';",
  "export { CORE_FOUNDATION_AUTHORITY_PROFILE } from './core-authority.js';",
  "export { CORE_EFFECT_DECLARATION_PROFILE } from './core-effects.js';",
  "export { CORE_RESPONSE_AUTHORITY_PROFILE } from './core-response.js';",
  "export { CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE } from './core-private-choice.js';",
  "export { CORE_ADVANCED_AUTHORITY_PROFILE, CORE_UNRESTRICTED_AUTHORITY_PROFILE } from './core-advanced.js';",
  ''
].join('\n'));

await mkdir(certifiedReplayDist, { recursive: true });
const certifiedReplayFiles = (await readdir(certifiedReplaySource))
  .filter((name) => name.endsWith('.certified.replay.json') && !name.includes('.public.certified.'))
  .sort();
for (const name of certifiedReplayFiles) {
  await cp(path.join(certifiedReplaySource, name), path.join(certifiedReplayDist, name));
}

// Count autonomy (Advanced Core) replays for the total certified replay count
let autonomyReplayCount = 0;
try {
  const autonomyIndex = JSON.parse(await readFile(path.join(root, 'sample-data/autonomy/lab-replay-index.json'), 'utf8'));
  autonomyReplayCount = autonomyIndex.records?.length ?? 0;
} catch { /* autonomy index may not exist */ }
const totalCertifiedReplayCount = certifiedReplayFiles.length + autonomyReplayCount;

await writeFile(path.join(dist, 'BUILD_INFO.json'), JSON.stringify({
  version: productVersion,
  engineVersion: '4.2.6',
  rulesVersion: '4.3.1',
  buildKind: 'UNRESTRICTED_CORE_PLAYER_RELEASE',
  browserEngineModules: [...requiredModules, 'hash.js', 'browser-entry.js'].sort(),
  certifiedReplayCount: totalCertifiedReplayCount,
  cardFaceRendererVersion: '1.1.0',
  cardFaceExactCardCount: 54,
  cardFaceCanonicalCardCount: 54
}, null, 2) + '\n');

// Generate browser-safe canonical rank authority artifact
const { pathToFileURL } = await import('node:url');
const { canonicalRankAuthority } = await import(pathToFileURL(path.join(root, 'packages/engine-adapter/src/adapter.mjs')).href);
const rankAuthority = canonicalRankAuthority();
const rankAuthorityDir = path.join(dist, 'data', 'release');
await mkdir(rankAuthorityDir, { recursive: true });
await writeFile(path.join(rankAuthorityDir, 'rank-authority.json'), JSON.stringify(rankAuthority, null, 2) + '\n');

// ── Rank Power data liveness assertion (prevents silent /ranks data loss) ──
const observatoryAnalyticsPath = path.join(dist, 'data', 'observatory', 'analytics.json');
let rankPowerAssertion = null;
try {
  // Retry reads for up to ~5s — on Windows external/mapped drives, large files
  // (analytics.json is ~37MB) may not be readable immediately after cp completes.
  let observatoryRaw = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    try { observatoryRaw = await readFile(observatoryAnalyticsPath, 'utf8'); break; } catch { await new Promise(r => setTimeout(r, 500)); }
  }
  if (!observatoryRaw) throw new Error(`Unable to read ${observatoryAnalyticsPath} after 10 retries (filesystem sync race)`);
  const observatoryJson = JSON.parse(observatoryRaw);
  const rankCount = observatoryJson.rankPower?.ranks ? Object.keys(observatoryJson.rankPower.ranks).length : 0;
  const ladderLength = observatoryJson.rankPower?.ladder?.length ?? 0;
  if (rankCount < 18) {
    throw new Error(`rankPower.ranks has ${rankCount} entries, expected 18. Rank Power Observatory data is incomplete.`);
  }
  if (ladderLength < 18) {
    throw new Error(`rankPower.ladder has ${ladderLength} entries, expected 18.`);
  }
  rankPowerAssertion = `${rankCount} ranks, ladder ${ladderLength} entries`;
  // Assert variant analytics is present (v0.16.0 Rank Anatomy)
  if (!observatoryJson.variantAnalytics) {
    throw new Error('Observatory analytics.json missing variantAnalytics. Rank Anatomy Observatory data is required for v0.16.0.');
  }
} catch (err) {
  if (err.message.includes('rankPower') || err.message.includes('variantAnalytics')) throw err;
  throw new Error(`Observatory analytics.json missing or unreadable for rank power assertion: ${err.message}`);
}

// Assert Rank Anatomy registry artifact exists
const rankAnatomyRegistryPath = path.join(dist, 'data', 'observatory', 'rank-anatomy-registry.json');
try {
  let registryRaw = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    try { registryRaw = await readFile(rankAnatomyRegistryPath, 'utf8'); break; } catch { await new Promise(r => setTimeout(r, 500)); }
  }
  if (!registryRaw) throw new Error(`Unable to read ${rankAnatomyRegistryPath} after 10 retries (filesystem sync race)`);
  const registryJson = JSON.parse(registryRaw);
  if (registryJson.rankCount !== 15) throw new Error(`rank-anatomy-registry.json has ${registryJson.rankCount} ranks, expected 15.`);
  if (registryJson.spadesVariantCount !== 13) throw new Error(`rank-anatomy-registry.json has ${registryJson.spadesVariantCount} Spades variants, expected 13.`);
  if (registryJson.superEffectCount !== 9) throw new Error(`rank-anatomy-registry.json has ${registryJson.superEffectCount} Super effects, expected 9.`);
} catch (err) {
  throw new Error(`Rank Anatomy registry assertion failed: ${err.message}`);
}

console.log(`BUILD PASS: ${dist}; browserModules=${requiredModules.size + 2}; certifiedReplays=${certifiedReplayFiles.length}; rankPower=[${rankPowerAssertion}]`);

// ── Bundle and minify JS/CSS with esbuild (hashed, cache-friendly) ──
const bundleResult = spawnSync(process.execPath, ['scripts/bundle.mjs'], { cwd: root, stdio: 'inherit' });
if (bundleResult.status !== 0) process.exit(bundleResult.status ?? 1);

