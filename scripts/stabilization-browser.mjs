/* global document, KeyboardEvent -- callbacks execute in Chrome */
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { captureProvenance } from './release-provenance.mjs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const base = process.env.HOMECOMING_BASE_URL ?? 'http://127.0.0.1:4173';
const report = { provenance: captureProvenance(root), scenarios: [], errors: [] };
await mkdir(new URL('../reports/local/', import.meta.url), { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', error => report.errors.push(error.message));
async function scenario(name, run) {
  try { await run(); report.scenarios.push({ name, status: 'PASS' }); }
  catch (error) { report.scenarios.push({ name, status: 'FAIL', error: error.message }); throw error; }
}
try {
  await page.goto(base);
  await scenario('Landing overlay replacement, dismissal and delayed renderer cleanup', async () => {
    const result = await page.evaluate(async () => {
      const { createLandingOverlays } = await import('/landing-overlays.js');
      const listeners = new Set();
      const add = document.addEventListener.bind(document);
      const remove = document.removeEventListener.bind(document);
      document.addEventListener = (type, fn, ...rest) => { if (type === 'keydown') listeners.add(fn); add(type, fn, ...rest); };
      document.removeEventListener = (type, fn, ...rest) => { if (type === 'keydown') listeners.delete(fn); remove(type, fn, ...rest); };
      let cleanup = 0, rejectRenderer;
      const overlay = createLandingOverlays({ state: { reducedMotion: true }, esc: text => text, renderAuth: node => { node.innerHTML = '<div class="auth-card"><div class="auth-header">Sign In</div><input></div>'; } });
      try {
        for (let i = 0; i < 20; i++) {
          overlay.openLandingOverlay('Test', node => { node.innerHTML = '<button>Test</button>'; }, () => cleanup++);
          overlay.openAuthOverlay();
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        overlay.openLandingOverlay('Late renderer', () => new Promise((_, reject) => { rejectRenderer = reject; }));
        overlay.closeLandingOverlay();
        rejectRenderer(new Error('closed renderer'));
        await new Promise(resolve => setTimeout(resolve, 0));
        return { cleanup, listeners: listeners.size, dialogs: document.querySelectorAll('.landing-overlay').length };
      } finally {
        overlay.closeLandingOverlay();
        document.addEventListener = add;
        document.removeEventListener = remove;
      }
    });
    assert.deepEqual(result, { cleanup: 20, listeners: 0, dialogs: 0 });
  });
  for (const mode of ['public', 'omniscient']) {
    await scenario(`Caster ${mode}: Homecoming board, transport, WAIT WHAT and annotations`, async () => {
      await page.goto(`${base}/#/caster`);
      await page.locator('#caster-start').waitFor();
      await page.locator('#caster-decision-limit').fill('60');
      await page.locator('#caster-viewer-mode').selectOption(mode);
      await page.locator('#caster-start').click();
      await page.locator('.caster-board-host .hc-game').waitFor({ timeout: 120000 });
      await expect(page.locator('.caster-board-host .astra-table')).toHaveCount(0);
      await expect(page.locator('.hc-caster-rail')).toBeVisible();
      await expect(page.locator('.hc-table-title')).toContainText('Replay Caster');
      await expect(page.locator('.hc-table-title')).toContainText('Read only');
      const board = await page.locator('.caster-board-host .hc-game').boundingBox();
      assert.ok(board.y + board.height <= 901, 'Caster header and board fit the viewport');
      const progress = await page.getByTestId('caster-progress').textContent();
      await page.locator('#caster-next').click();
      await expect(page.getByTestId('caster-progress')).not.toHaveText(progress);
      const opponentHand = page.locator('.hc-game').getByRole('region', { name: /hand/i });
      // Public projection exposes one player's hand; omniscient replay explicitly adds the other.
      assert.equal(await opponentHand.count(), mode === 'omniscient' ? 2 : 1);
      await page.getByTestId('caster-wait-what').click();
      await expect(page.getByTestId('caster-wait-what-panel')).toBeVisible();
      await page.locator('#caster-ww-annotation-text').fill('Stabilization browser verification');
      await page.getByTestId('caster-ww-annotation-save').click();
      await expect(page.getByTestId('caster-wait-what-panel')).toContainText('Stabilization browser verification');
      await page.screenshot({ path: fileURLToPath(new URL(`../reports/local/caster-${mode}.png`, import.meta.url)), fullPage: true });
      await page.locator('[data-action="exit-caster"]').click();
      await expect(page.locator('#caster-start')).toBeVisible();
    });
  }
  assert.deepEqual(report.errors, []);
} finally {
  report.status = report.errors.length === 0 && report.scenarios.length === 3 && report.scenarios.every(s => s.status === 'PASS') ? 'PASS' : 'FAIL';
  await mkdir(new URL('../reports/local/', import.meta.url), { recursive: true });
  await writeFile(new URL('../reports/local/stabilization-browser.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}
