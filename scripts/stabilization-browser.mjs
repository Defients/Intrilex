/* global document, KeyboardEvent, requestAnimationFrame -- callbacks execute in Chrome */
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
  await page.waitForLoadState('networkidle');
  await scenario('Landing overlay replacement, dismissal and delayed renderer cleanup', async () => {
    const result = await page.evaluate(async () => {
      const { createLandingOverlays } = await import('/landing-overlays.js');
      const listeners = new Set();
      const add = document.addEventListener.bind(document);
      const remove = document.removeEventListener.bind(document);
      document.addEventListener = (type, fn, ...rest) => { if (type === 'keydown' && fn.name === '_overlayEscHandler') listeners.add(fn); add(type, fn, ...rest); };
      document.removeEventListener = (type, fn, ...rest) => { if (type === 'keydown' && fn.name === '_overlayEscHandler') listeners.delete(fn); remove(type, fn, ...rest); };
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
  await scenario('Modal keyboard containment and focus return for standard and auth dialogs', async () => {
    const result = await page.evaluate(async () => {
      const { createLandingOverlays } = await import('/landing-overlays.js');
      const trigger = document.createElement('button'); trigger.textContent = 'Test dialog trigger'; document.body.appendChild(trigger); trigger.focus();
      const owner = createLandingOverlays({state:{reducedMotion:true},esc:text=>text,
        renderAuth:node=>{node.innerHTML='<div class="auth-card"><div class="auth-header">Sign In</div><input aria-label="Test email"><button disabled>Disabled</button></div>';}});
      const checks=[];
      try {
        for(const auth of [false,true]) {
          if(auth) owner.openAuthOverlay(); else owner.openLandingOverlay('Keyboard test',node=>{node.innerHTML='<input aria-label="Test entry"><button disabled>Disabled</button>';});
          await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
          const dialog=document.querySelector('.landing-overlay');
          const controls=[...dialog.querySelectorAll('button,input')].filter(el=>!el.disabled);
          checks.push(dialog.contains(document.activeElement));
          controls[0].focus(); controls[0].dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));
          checks.push(document.activeElement===controls.at(-1));
          controls.at(-1).dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
          checks.push(document.activeElement===controls[0]);
          document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
          checks.push(document.activeElement===trigger);
          await new Promise(resolve=>setTimeout(resolve,0));
        }
        return checks;
      } finally {owner.closeLandingOverlay();trigger.remove();}
    });
    assert.equal(result.length,8); assert.ok(result.every(Boolean),JSON.stringify(result));
  });
  await scenario('Laboratory data is lazy, retries failed loads and reuses successful data', async () => {
    const context=await browser.newContext();
    const probe=await context.newPage();
    let mandatoryRequests=0;
    await probe.route('**/data/corpus-analytics.json', async request => {
      mandatoryRequests++;
      if(mandatoryRequests===1) await request.fulfill({status:503,body:'unavailable'});
      else await request.continue();
    });
    try {
      await probe.goto(base); await probe.waitForLoadState('networkidle');
      assert.equal(mandatoryRequests,0,'landing does not prefetch laboratory data');
      await probe.goto(`${base}/#/mechanics`);
      await expect(probe.getByRole('alert')).toContainText('Could not load laboratory data');
      await probe.getByRole('button',{name:'Retry',exact:true}).click();
      await probe.waitForFunction(()=>Boolean(globalThis.__intrilexState?.observatory?.mechanics),{},{timeout:60000});
      assert.equal(mandatoryRequests,2,'one retry after a failed request');
      await probe.goto(`${base}/#/`); await probe.goto(`${base}/#/ranks`); await probe.waitForLoadState('networkidle');
      assert.equal(mandatoryRequests,2,'successful laboratory data is reused');
    } finally {await context.close();}
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
  report.status = report.errors.length === 0 && report.scenarios.length === 5 && report.scenarios.every(s => s.status === 'PASS') ? 'PASS' : 'FAIL';
  await mkdir(new URL('../reports/local/', import.meta.url), { recursive: true });
  await writeFile(new URL('../reports/local/stabilization-browser.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}
