// ═══════════════════════════════════════════════════════════════════════════
// build-ranked-glyphs.mjs — Deterministic ranked-glyph derivative pipeline.
//
// Converts the 8 canonical 1024×1024 RGBA master PNGs in <root>/ranked-glyphs/
// into production-sized PNG derivatives (preserving alpha) under
// apps/lab-web/src/assets/ranked/glyphs/.
//
// Output layout:
//   apps/lab-web/src/assets/ranked/glyphs/256/<tier>.png   (default production)
//   apps/lab-web/src/assets/ranked/glyphs/128/<tier>.png   (small UI)
//   apps/lab-web/src/assets/ranked/glyphs/64/<tier>.png    (compact plates)
//   apps/lab-web/src/assets/ranked/glyphs/manifest.json    (audit manifest)
//
// The 1024 masters in <root>/ranked-glyphs/ are the canonical immutable source
// artwork — they are NEVER modified or overwritten by this script.
//
// Properties:
//   - Deterministic: same input → same output bytes (sharp PNG, palette when
//     beneficial, compression level 9).
//   - Fails on missing canonical masters or unreadable images.
//   - Skips re-encoding when the existing output is byte-identical to the new
//     buffer (avoids unnecessary recompression / mtime churn).
//   - Safe to rerun.
// ═══════════════════════════════════════════════════════════════════════════
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'ranked-glyphs');
const outDir = path.join(root, 'apps/lab-web/src/assets/ranked/glyphs');

// Canonical 8-tier identity list (ordered ladder, lowest → highest).
// Filenames are the canonical production names — no numbered prefixes at runtime.
const TIERS = [
  'initiate',
  'cipher',
  'warden',
  'vanguard',
  'ascendant',
  'paragon',
  'sovereign',
  'intrilex',
];

// Production derivative sizes. 256 is the default production asset; 128 and 64
// are for compact UI surfaces (player plates, leaderboards). Masters (1024) are
// never emitted to dist — only the derivatives ship.
const SIZES = [256, 128, 64];
const PNG_COMPRESSION = 9;

async function main() {
  if (!existsSync(sourceDir)) {
    console.error(`RANKED GLYPH BUILD FAIL: source directory not found: ${sourceDir}`);
    process.exit(1);
  }
  const sourceFiles = new Set(readdirSync(sourceDir).filter(f => f.endsWith('.png')));
  const missing = TIERS.filter(t => !sourceFiles.has(`${t}.png`));
  if (missing.length) {
    console.error(`RANKED GLYPH BUILD FAIL: missing canonical master PNGs: ${missing.map(t => t + '.png').join(', ')}`);
    process.exit(1);
  }

  const sharp = (await import('sharp')).default;
  await mkdir(outDir, { recursive: true });
  for (const size of SIZES) {
    await mkdir(path.join(outDir, String(size)), { recursive: true });
  }

  let encoded = 0, skipped = 0;
  const report = [];
  for (const tier of TIERS) {
    const srcPath = path.join(sourceDir, `${tier}.png`);
    const meta = await sharp(srcPath).metadata();
    if (meta.width !== 1024 || meta.height !== 1024 || meta.channels !== 4) {
      console.error(`RANKED GLYPH BUILD FAIL: ${tier}.png is not 1024×1024 RGBA (got ${meta.width}×${meta.height} ${meta.channels}ch)`);
      process.exit(1);
    }
    for (const size of SIZES) {
      const outPath = path.join(outDir, String(size), `${tier}.png`);
      // object-fit: contain semantics — fit inside the box without cropping.
      // Resize with 'contain' preserves aspect ratio and alpha padding.
      const buf = await sharp(srcPath)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: PNG_COMPRESSION })
        .toBuffer();
      let existing = null;
      try { existing = await readFile(outPath); } catch { /* no existing */ }
      if (existing && existing.length === buf.length && existing.equals(buf)) {
        skipped++;
      } else {
        await writeFile(outPath, buf);
        encoded++;
      }
      const hash = createHash('sha256').update(buf).digest('hex').slice(0, 16);
      report.push({ tier, size, file: `${size}/${tier}.png`, bytes: buf.length, hash });
    }
  }

  // Deterministic audit manifest
  const manifest = {
    schemaVersion: '1.0.0',
    generatedBy: 'scripts/build-ranked-glyphs.mjs',
    source: 'ranked-glyphs/',
    masterSize: { width: 1024, height: 1024, channels: 4 },
    derivativeSizes: SIZES,
    tierCount: TIERS.length,
    tiers: TIERS,
    ladderOrder: ['UNRANKED', ...TIERS.map(t => t.toUpperCase())],
    entries: report.sort((a, b) =>
      a.tier.localeCompare(b.tier) || a.size - b.size
    ),
  };
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  console.log(`RANKED GLYPH BUILD PASS: ${TIERS.length} tiers × ${SIZES.length} sizes → ${outDir}`);
  console.log(`  encoded=${encoded} skipped=${skipped} (unchanged)`);
  console.log(`  manifest at ${path.relative(root, path.join(outDir, 'manifest.json'))}`);
}

main().catch(err => {
  console.error('RANKED GLYPH BUILD FAIL:', err.message);
  process.exit(1);
});
