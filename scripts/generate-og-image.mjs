/**
 * Generate the social share image (og-image.png) for Intrilex.
 *
 * Produces a deterministic 1200x630 PNG branded with the IX glyph, wordmark,
 * and tagline. Rendered from an inline SVG via sharp (no network, no browser).
 *
 * Output: apps/lab-web/src/assets/og-image.png
 *
 * The image is regenerated on every `pnpm run build` (see scripts/build.mjs)
 * so it always reflects the current brand design. It is deterministic: the
 * same input always yields byte-identical output (no timestamps, no randomness).
 *
 * Usage:
 *   node scripts/generate-og-image.mjs          # generate (skip if unchanged)
 *   node scripts/generate-og-image.mjs --force   # regenerate even if unchanged
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'apps/lab-web/src/assets');
const outFile = path.join(outDir, 'og-image.png');
const force = process.argv.includes('--force');

// Brand tokens (mirror icon.svg + index.html theme-color)
const BG = '#05080e';
const CYAN = '#5ad7e8';
const RAIL = '#284050';
const DIM = '#1a2733';

/**
 * Build the 1200x630 share-card SVG.
 * @param {object} opts
 * @param {string} opts.version   Lab version (e.g. "v0.24.2")
 * @param {string} opts.engine    Engine version (e.g. "Engine 4.2.6")
 * @param {string} opts.rules     Rules version (e.g. "Rules 4.3.1")
 * @returns {string}
 */
function buildSvg({ version, engine, rules }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="50%" cy="42%" r="55%">
      <stop offset="0%" stop-color="${CYAN}" stop-opacity="0.10"/>
      <stop offset="60%" stop-color="${CYAN}" stop-opacity="0.03"/>
      <stop offset="100%" stop-color="${CYAN}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${RAIL}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${RAIL}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${RAIL}" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="${BG}"/>
  <rect width="1200" height="630" fill="url(#glow)"/>

  <!-- Concentric rings (echo icon.svg) -->
  <circle cx="600" cy="265" r="200" fill="none" stroke="${CYAN}" stroke-width="1.5" opacity="0.12"/>
  <circle cx="600" cy="265" r="160" fill="none" stroke="${CYAN}" stroke-width="1" opacity="0.08"/>
  <circle cx="600" cy="265" r="240" fill="none" stroke="${CYAN}" stroke-width="1" opacity="0.05"/>

  <!-- IX glyph -->
  <text x="600" y="330" font-family="Georgia,serif" font-size="200" font-weight="700"
        text-anchor="middle" fill="${CYAN}" letter-spacing="-8">IX</text>

  <!-- Wordmark -->
  <text x="600" y="430" font-family="Inter,Helvetica,Arial,sans-serif" font-size="52"
        font-weight="700" text-anchor="middle" fill="#e8f0f5" letter-spacing="6">INTRILEX</text>

  <!-- Subtitle -->
  <text x="600" y="470" font-family="Inter,Helvetica,Arial,sans-serif" font-size="22"
        font-weight="500" text-anchor="middle" fill="${CYAN}" letter-spacing="4" opacity="0.85">SIMULATION LAB</text>

  <!-- Tagline -->
  <text x="600" y="525" font-family="Inter,Helvetica,Arial,sans-serif" font-size="20"
        font-weight="400" text-anchor="middle" fill="#9aaab5" letter-spacing="1">Deterministic card-game simulation, replay forensics &amp; rank anatomy</text>

  <!-- Bottom rule + version stamp -->
  <rect x="200" y="565" width="800" height="1" fill="url(#rule)"/>
  <text x="600" y="595" font-family="Inter,Helvetica,Arial,sans-serif" font-size="15"
        font-weight="500" text-anchor="middle" fill="${DIM}" letter-spacing="2">${version} · ${engine} · ${rules}</text>
</svg>`;
}

/**
 * Read the current version triple from package.json + engine-adapter.
 * Falls back gracefully if any source is missing.
 * @returns {Promise<{version: string, engine: string, rules: string}>}
 */
async function readVersions() {
  let version = 'v0.24.2';
  let engine = 'Engine 4.2.6';
  let rules = 'Rules 4.3.1';
  try {
    const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    if (pkg.version) version = `v${pkg.version}`;
  } catch { /* keep default */ }
  try {
    const { pathToFileURL } = await import('node:url');
    const adapterUrl = pathToFileURL(path.join(root, 'packages/engine-adapter/src/adapter.mjs')).href;
    const mod = await import(adapterUrl);
    if (typeof mod.engineVersion === 'string') engine = `Engine ${mod.engineVersion}`;
    if (typeof mod.rulesVersion === 'string') rules = `Rules ${mod.rulesVersion}`;
  } catch { /* keep default */ }
  return { version, engine, rules };
}

async function main() {
  const { version, engine, rules } = await readVersions();
  const svg = buildSvg({ version, engine, rules });

  // Deterministic skip: if the existing PNG matches the SVG hash, do nothing.
  const svgHash = createHash('sha256').update(svg).digest('hex').slice(0, 16);
  if (!force && existsSync(outFile)) {
    try {
      const existing = await readFile(outFile);
      // sharp PNG output is deterministic for a given SVG + params, so compare bytes.
      // We also stash the source hash in a sidecar to detect design changes cheaply.
      const sidecar = path.join(outDir, 'og-image.hash');
      if (existsSync(sidecar)) {
        const prevHash = (await readFile(sidecar, 'utf8')).trim();
        if (prevHash === svgHash) {
          console.log(`og-image: unchanged (${svgHash}), skipping render`);
          return;
        }
      }
    } catch { /* fall through to regenerate */ }
  }

  const sharp = (await import('sharp')).default;
  await mkdir(outDir, { recursive: true });
  const png = await sharp(Buffer.from(svg))
    .resize(1200, 630, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(outFile, png);
  await writeFile(path.join(outDir, 'og-image.hash'), svgHash + '\n');
  console.log(`og-image: wrote ${path.relative(root, outFile)} (${(png.length / 1024).toFixed(1)} KB, ${svgHash})`);
}

try {
  await main();
} catch (err) {
  console.error(`og-image: FAIL — ${err.message}`);
  process.exit(1);
}
