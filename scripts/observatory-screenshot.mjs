/* global document */
// Temporary visual-review harness for the Observatory UX pass.
// Screenshots each Observatory workspace at representative viewports.
// Usage: node scripts/observatory-screenshot.mjs [baseUrl]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173';
const OUT = path.resolve('reports/ux-screenshots');
mkdirSync(OUT, { recursive: true });

const routes = [
  ['ranks', '#/ranks'],
  ['mechanics', '#/mechanics'],
  ['synergies', '#/synergies'],
  ['compare', '#/compare'],
  ['evidence', '#/evidence'],
  ['history', '#/history'],
  ['replays', '#/replays'],
  ['traces', '#/traces'],
];
const viewports = [
  [2560, 1440, 'desktop-xl'],
  [1920, 1080, 'desktop'],
  [1440, 900, 'laptop'],
  [1280, 720, 'laptop-sm'],
  [1024, 768, 'tablet-land'],
  [768, 1024, 'tablet'],
  [390, 844, 'mobile'],
];

const browser = await chromium.launch({ channel: 'chrome' });
const errors = [];
for (const [w, h, tag] of viewports) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', e => errors.push(`[${tag}] pageerror: ${e.message.slice(0, 200)}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${tag}] console: ${m.text().slice(0, 200)}`); });
  for (const [name, hash] of routes) {
    await page.goto(`${BASE}/${hash}`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(e => errors.push(`[${tag}] ${name} nav: ${e.message.slice(0, 120)}`));
    await page.waitForSelector('#app section, #app .empty-state, #app .panel', { timeout: 10000 }).catch(e => errors.push(`[${tag}] ${name} render: ${e.message.slice(0, 120)}`));
    await page.waitForTimeout(700);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth).catch(() => null);
    if (overflow > 0) errors.push(`[${tag}] ${name}: horizontal overflow ${overflow}px`);
    await page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`), fullPage: false });
  }
  await page.close();
}
await browser.close();
console.log(`screenshots → ${OUT}`);
if (errors.length) { console.log('ISSUES:'); for (const e of errors) console.log('  ' + e); }
else console.log('no console errors or horizontal overflow detected');
