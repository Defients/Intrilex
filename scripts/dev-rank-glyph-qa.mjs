// ═══════════════════════════════════════════════════════════════
// dev-rank-glyph-qa.mjs — Dev-only visual QA fixture generator.
//
// Generates a standalone HTML file (reports/rank-glyph-qa.html) showing all
// 8 canonical glyphs at 128 / 64 / 40 / 24 px in one grid, over a dark
// background matching the real Intrilex UI. This is DEV-ONLY — it does not
// ship in the dist bundle and is not referenced by CI/build/tests.
//
// Run: node scripts/dev-rank-glyph-qa.mjs
// Open: reports/rank-glyph-qa.html
// ═══════════════════════════════════════════════════════════════
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const glyphsDir = path.join(root, 'apps/lab-web/src/assets/ranked/glyphs');
const cssPath = path.join(root, 'apps/lab-web/src/play/rank/rank-glyph.css');
const reportDir = path.join(root, 'reports');
const outFile = path.join(reportDir, 'rank-glyph-qa.html');

const TIERS = ['initiate','cipher','warden','vanguard','ascendant','paragon','sovereign','intrilex'];
const SIZES = [128, 64, 40, 24];

async function main() {
  await mkdir(reportDir, { recursive: true });
  const css = await readFile(cssPath, 'utf8');

  // Build rows: one row per tier, columns = the 4 sizes.
  const rows = TIERS.map(tier => {
    const cells = SIZES.map(size => {
      const file = path.join(glyphsDir, String(Math.max(size, 64)), `${tier}.png`);
      return `<td class="qa-cell">
        <div class="rank-glyph tier-${tier}" style="--rank-glyph-size:${size}px;width:${size}px;height:${size}px">
          <img class="rank-glyph-img" src="${path.relative(reportDir, file).replace(/\\/g,'/')}" alt="${tier} ${size}" width="${size}" height="${size}" />
        </div>
      </td>`;
    }).join('\n      ');
    return `<tr><td class="qa-label">${tier.toUpperCase()}</td>\n      ${cells}</tr>`;
  }).join('\n    ');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Intrilex — Ranked Glyph Visual QA (dev-only)</title>
<style>
  ${css}
  body { background: #0b1020; color: #e8eef6; font-family: Inter, system-ui, sans-serif; padding: 24px; }
  h1 { font-size: 1.2em; }
  table { border-collapse: collapse; }
  td { padding: 12px; text-align: center; vertical-align: middle; }
  td.qa-label { text-align: right; font-weight: 700; color: #8ab; font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.05em; }
  td.qa-cell { background: rgba(120,140,170,0.05); border-radius: 8px; }
  .qa-sizes th { color: #8ab; font-size: 0.8em; font-weight: 600; padding: 8px; }
  .qa-note { color: #8aa; font-size: 0.85em; margin-top: 16px; }
</style>
</head>
<body>
  <h1>Ranked Glyph Visual QA — all 8 tiers at 128 / 64 / 40 / 24 px</h1>
  <p class="qa-note">Dev-only fixture. Verify Paragon / Sovereign / Intrilex remain distinguishable at competitive UI sizes.</p>
  <table>
    <thead class="qa-sizes"><tr><th></th><th>128px</th><th>64px</th><th>40px</th><th>24px</th></tr></thead>
    <tbody>
    ${rows}
    </tbody>
  </table>
</body>
</html>
`;

  await writeFile(outFile, html);
  console.log(`RANKED GLYPH QA FIXTURE: ${path.relative(root, outFile)}`);
  console.log('  Open in a browser to visually verify small-size readability.');
}

main().catch(err => { console.error(err); process.exit(1); });
