// ═══════════════════════════════════════════════════════════════════════════
// build-card-art.mjs — Deterministic PNG → WebP card-art conversion pipeline.
//
// Converts the 54 canonical source PNGs in <root>/card-art/ into portrait
// 720×1000 WebP board assets under apps/lab-web/src/assets/card-art/.
//
// Canonical filename grammar (source):
//   [rank][suit].png   ranks: a,2,3,4,5,6,7,8,9,10,j,q,k  suits: s,h,d,c
//   joker1.png, joker2.png
//
// Output naming (matches the existing card-face-data.js art-path convention):
//   [rank][suit].webp  +  rj.webp (Red Joker ← joker1)  +  bj.webp (Black Joker ← joker2)
//
// Properties:
//   - Deterministic: same input → same output bytes (sharp webp @ quality 82).
//   - Fails on missing canonical cards or unreadable images.
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
const sourceDir = path.join(root, 'card-art');
const outDir = path.join(root, 'apps/lab-web/src/assets/card-art');

const BOARD_W = 720;
const BOARD_H = 1000;
const WEBP_QUALITY = 82;

// Canonical 54-card identity list → { sourcePng, outputWebp }
const RANKS = ['a', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'j', 'q', 'k'];
const SUITS = ['s', 'h', 'd', 'c'];
const ENTRIES = [];
for (const r of RANKS) for (const s of SUITS) ENTRIES.push({ code: `${r}${s}`, source: `${r}${s}.png`, output: `${r}${s}.webp` });
ENTRIES.push({ code: 'rj', source: 'joker1.png', output: 'rj.webp' }); // Red Joker ← joker1
ENTRIES.push({ code: 'bj', source: 'joker2.png', output: 'bj.webp' }); // Black Joker ← joker2

async function main() {
  if (!existsSync(sourceDir)) {
    console.error(`CARD ART BUILD FAIL: source directory not found: ${sourceDir}`);
    process.exit(1);
  }
  const sourceFiles = new Set(readdirSync(sourceDir).filter(f => f.endsWith('.png')));
  const missing = ENTRIES.filter(e => !sourceFiles.has(e.source)).map(e => e.source);
  if (missing.length) {
    console.error(`CARD ART BUILD FAIL: missing canonical source PNGs: ${missing.join(', ')}`);
    process.exit(1);
  }

  const sharp = (await import('sharp')).default;
  await mkdir(outDir, { recursive: true });

  let encoded = 0, skipped = 0;
  const report = [];
  for (const entry of ENTRIES) {
    const srcPath = path.join(sourceDir, entry.source);
    const outPath = path.join(outDir, entry.output);
    const buf = await sharp(srcPath)
      .resize(BOARD_W, BOARD_H, { fit: 'cover', position: 'center' })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
    // Skip write if existing output is byte-identical (deterministic no-op on rerun)
    let existing = null;
    try { existing = await readFile(outPath); } catch { /* no existing */ }
    if (existing && existing.length === buf.length && existing.equals(buf)) {
      skipped++;
    } else {
      await writeFile(outPath, buf);
      encoded++;
    }
    const hash = createHash('sha256').update(buf).digest('hex').slice(0, 16);
    report.push({ code: entry.code, output: entry.output, bytes: buf.length, hash });
  }

  // Write a deterministic manifest alongside the assets for auditability.
  const manifest = {
    schemaVersion: '1.0.0',
    generatedBy: 'scripts/build-card-art.mjs',
    boardSize: { width: BOARD_W, height: BOARD_H },
    webpQuality: WEBP_QUALITY,
    count: ENTRIES.length,
    entries: report.sort((a, b) => a.code.localeCompare(b.code)),
  };
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  console.log(`CARD ART BUILD PASS: ${report.length} cards → ${outDir}`);
  console.log(`  encoded=${encoded} skipped=${skipped} (unchanged)`);
  console.log(`  manifest at ${path.relative(root, path.join(outDir, 'manifest.json'))}`);
}

main().catch(err => {
  console.error('CARD ART BUILD FAIL:', err.message);
  process.exit(1);
});
