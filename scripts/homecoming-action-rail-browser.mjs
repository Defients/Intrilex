/* global document, window -- browser callbacks execute in the isolated test page */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'reports/homecoming');
await mkdir(output, { recursive: true });
// Render the real board and CSS with controlled UI fixtures. Engine legality and
// network submission remain covered by homecoming-browser.mjs and client tests.
const contents = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { IntrilexGame } from './apps/lab-web/src/client/gameplay/IntrilexGame.tsx';
import './apps/lab-web/src/client/game-table.css';
const card = (id, identity) => ({ id, identity, label: identity, markers: [] });
const action = (id, sources, targets = [], extra = {}) => ({ id, sources, targets, mode: 'ordinary', family: 'attachment', label: 'Attachment — Jack to Point Row', timing: 'Action', facts: [], ...extra });
const cards = [card('jack', 'J♠'), card('ten', '10♥'), card('ace', 'A♦')];
const targets = [card('nine', '9♣'), card('eight', '8♦')];
const initial = {
  schemaVersion: 1, sessionId: 'ui-fixture', revision: 1, frameHash: 'fixture-1', status: 'ready', phase: 'ordinary', turn: 1,
  activePlayerId: 'P1', priorityOwnerId: 'P1', self: { id: 'P1', name: 'You', score: 0, goal: 21, handCount: 3, hand: cards, points: [], enduring: [] },
  opponent: { id: 'P2', name: 'Opponent', score: 9, goal: 21, handCount: 4, hand: [], points: targets, enduring: [] },
  drawCount: 30, discardCount: 0, discardTop: null, exileCount: 0, swap: [], stack: [], actions: [], events: [],
  winner: null, terminationReason: null, error: null, handOrder: null, opponentHandReorderEpoch: 0, choice: null, connection: null
};
let snapshot, listeners = new Set();
window.submitted = [];
const publish = next => { snapshot = next; listeners.forEach(fn => fn()); };
const store = {
  getSnapshot: () => snapshot, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
  select: id => publish({ ...snapshot, selectedActionId: id, interaction: id ? 'selected' : 'idle' }),
  submit: async () => {
    const id = snapshot.selectedActionId;
    window.submitted.push(id);
    // Emulate a host that publishes its next ready frame before the request
    // promise finishes. New controls must stay visibly blocked until it does.
    publish({ ...snapshot, game: { ...snapshot.game, revision: snapshot.game.revision + 1, frameHash: 'intermediate' }, selectedActionId: null, interaction: 'idle' });
    await new Promise(resolve => { window.completeFixture = resolve; });
    publish({ ...snapshot, game: { ...snapshot.game, revision: snapshot.game.revision + 1, frameHash: 'next', status: 'waiting', actions: [] }, selectedActionId: null, interaction: 'idle' });
    return true;
  }
};
window.resetFixture = kind => {
  const palette = [
    ...['super', 'solo-wild', 'score', 'ultra', 'effect-private-choice', 'swap-bar', 'scuttle'].flatMap(family =>
      [action(family + '-nine', ['jack'], ['nine'], { family }), action(family + '-eight', ['jack'], ['eight'], { family })]),
    action('anchor', ['ace'], [], { family: 'anchor', label: 'Anchor — Queen' }),
    action('quick', ['ten'], [], { family: 'quick', label: 'Quick', timing: 'Quick', timingClass: 'quick' }),
    action('draw', [], [], { family: 'draw', label: 'Draw — from top of Draw Pile' }),
    action('bounce', ['jack'], ['eight'], { family: 'effect-three', label: 'Three — Bounce — bounce to top' })
  ];
  const actions = kind === 'palette' ? palette : kind === 'direct' ? [action('direct-id', ['jack'], ['nine'])] :
    kind === 'simple' ? [action('target-nine', ['jack'], ['nine']), action('target-eight', ['jack'], ['eight'])] :
    kind === 'multipart' ? [action('jack-nine', ['jack'], ['nine']), action('jack-eight', ['jack'], ['eight']), action('ten-nine', ['ten'], ['nine']), action('ten-eight', ['ten'], ['eight'])] :
    [action('one-card', ['jack'], [], { family: 'voltage', label: 'Voltage' }), action('two-cards', ['jack', 'ten'], [], { family: 'voltage', label: 'Voltage' })];
  window.submitted = [];
  publish({ game: { ...initial, sessionId: 'ui-fixture-' + kind, actions }, selectedActionId: null, interaction: 'idle', error: null });
};
window.expandHistoryFixture = () => publish({ ...snapshot, game: { ...snapshot.game,
  stack: Array.from({ length: 12 }, (_, index) => ({ id: 'pending-' + index, label: 'Pending public play ' + (index + 1), controllerId: index % 2 ? 'P1' : 'P2' })),
  events: Array.from({ length: 40 }, (_, index) => ({ id: 'event-' + index, type: 'DECLARATION_COMMITTED', label: 'Public declaration ' + (index + 1), actorId: index % 2 ? 'P1' : 'P2', cardRefs: [] }))
} });
window.resetFixture('direct');
createRoot(document.getElementById('root')).render(<IntrilexGame store={store} rankSuggestions={() => []} />);
`;
const bundled = await build({ stdin: { contents, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', outfile: 'fixture.js', define: { 'process.env.NODE_ENV': '"production"' } });
const js = bundled.outputFiles.find(file => file.path.endsWith('.js')).text;
const css = bundled.outputFiles.find(file => file.path.endsWith('.css')).text;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const report = { date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }), scope: 'Actual React board and CSS with controlled UI fixtures; no engine commands or external writes', scenarios: [], errors: [], screenshots: [] };
page.on('pageerror', error => report.errors.push(error.message));
async function scenario(name, fn) {
  await fn(); report.scenarios.push({ name, status: 'PASS' });
}
async function reset(kind) {
  await page.evaluate(kind => window.resetFixture(kind), kind);
  await page.locator('.hc-action:enabled,.hc-family:enabled').first().waitFor();
}
async function submitted(id) {
  await page.waitForFunction(id => window.submitted.includes(id), id);
  assert.deepEqual(await page.evaluate(() => window.submitted), [id]);
  await page.evaluate(() => window.completeFixture());
  await page.locator('[data-play-state="waiting"]').waitFor();
}
try {
  await page.route('http://127.0.0.1:4173/__action_rail_fixture', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><style>html,body{margin:0}*,*::before,*::after{box-sizing:border-box}' + css + '</style><div id="root"></div><script>' + js.replaceAll('</script>', '<\\/script>') + '</script>' }));
  await page.goto('http://127.0.0.1:4173/__action_rail_fixture');
  await scenario('Attachment label keeps rank and suit together in one compact wrapping text block', async () => {
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const row = page.locator('.hc-action'); await row.waitFor();
      const geometry = await row.evaluate(el => {
        const label = el.querySelector('.hc-move-text');
        return { children: el.children.length, text: label.textContent, height: el.getBoundingClientRect().height,
          tokens: [...label.querySelectorAll('.hc-card-token')].map(token => {
            const rank = document.createRange(); rank.selectNodeContents(token.firstChild);
            const a = rank.getBoundingClientRect(), b = token.querySelector('span').getBoundingClientRect();
            return { text: token.textContent, together: a.top < b.bottom && b.top < a.bottom };
          }) };
      });
      assert.equal(geometry.children, 2);
      assert.equal(geometry.text, 'Attachment — Jack to Point Row · J♠ · → 9♣');
      assert.deepEqual(geometry.tokens.map(token => token.text), ['J♠', '9♣']);
      assert.ok(geometry.tokens.every(token => token.together));
      assert.ok(geometry.height < 100, JSON.stringify(geometry));
      const filename = 'action-label-' + width + '.png';
      await row.screenshot({ path: join(output, filename) }); report.screenshots.push(filename);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  });
  await scenario('Complete move plays once on click, including rapid duplicate events', async () => {
    await page.locator('.hc-action').evaluate(el => { el.click(); el.click(); });
    assert.equal(await page.locator('.hc-action').isDisabled(), true);
    await submitted('direct-id');
    assert.equal(await page.locator('.hc-confirm').count(), 0);
  });
  await scenario('Single target choice plays immediately without Confirm', async () => {
    await reset('simple'); await page.locator('.hc-family').click();
    assert.equal(await page.getByTestId('composer-confirm').count(), 0);
    await page.getByTestId('composer-option').filter({ hasText: '9♣' }).click();
    await submitted('target-nine');
  });
  await scenario('The same single choice plays directly when picked on the battlefield', async () => {
    await reset('simple'); await page.locator('.hc-family').click();
    await page.locator('[data-grid="enemyP"] .tabletop-card').first().click();
    await submitted('target-nine');
  });
  await scenario('Editable source and target composition waits for its final commit', async () => {
    await reset('multipart'); await page.locator('.hc-family').click();
    await page.getByTestId('composer-option').filter({ hasText: 'J♠' }).click();
    await page.getByTestId('composer-option').filter({ hasText: '9♣' }).click();
    assert.deepEqual(await page.evaluate(() => window.submitted), []);
    await page.getByTestId('composer-confirm').click(); await submitted('jack-nine');
  });
  await scenario('A legal smaller card set remains editable before committing the larger set', async () => {
    await reset('set'); await page.locator('.hc-family').click();
    await page.getByTestId('composer-option').filter({ hasText: 'J♠' }).click();
    assert.equal(await page.getByTestId('composer-confirm').isEnabled(), true);
    assert.deepEqual(await page.evaluate(() => window.submitted), []);
    await page.getByTestId('composer-option').filter({ hasText: '10♥' }).click();
    await page.getByTestId('composer-confirm').click(); await submitted('two-cards');
  });
  await scenario('Expanded Pending Plays and history stay reachable in the left rail at short and tall desktop sizes', async () => {
    await reset('direct'); await page.evaluate(() => window.expandHistoryFixture());
    await page.locator('.hc-pending li').last().waitFor();
    for (const [width, height] of [[1440, 900], [1024, 576]]) {
      await page.setViewportSize({ width, height });
      const layout = await page.evaluate(() => {
        const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { y: r.y, bottom: r.bottom, height: r.height }; };
        const history = document.querySelector('.hc-log ol'), pending = document.querySelector('.hc-pending');
        return { left: rect('.hc-left'), log: rect('.hc-log'), pending: rect('.hc-pending'), historyScroll: history.scrollHeight > history.clientHeight, pendingScroll: pending.scrollHeight > pending.clientHeight };
      });
      assert.ok(layout.log.height >= 100 && layout.log.bottom <= height && Math.abs(layout.log.bottom - layout.left.bottom) <= 2, JSON.stringify(layout));
      assert.ok(layout.pending.bottom <= layout.log.y && layout.pendingScroll && layout.historyScroll, JSON.stringify(layout));
      const filename = 'left-rail-expanded-' + width + 'x' + height + '.png';
      await page.screenshot({ path: join(output, filename) }); report.screenshots.push(filename);
    }
    const summary = page.locator('.hc-log > summary');
    await summary.focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('.hc-log').getAttribute('open'), null);
    assert.ok((await page.locator('.hc-log').boundingBox()).height < 60);
    await page.keyboard.press('Enter');
    await page.locator('.hc-log .glog-tab').filter({ hasText: 'Effects' }).click();
    assert.equal(await page.locator('.hc-log .glog-item').count(), 0);
    await page.locator('.hc-log .glog-tab').filter({ hasText: 'All' }).click();
    assert.equal(await page.locator('.hc-log .glog-item').count(), 40);
  });
  // Representative family mix for visual review only, using the real components.
  // These UI fixtures do not claim engine legality or alter the browser gates.
  await reset('palette');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Fewer hints', exact: true }).click();
  await page.locator('.hc-actions').screenshot({ path: join(output, 'action-palette-desktop.png') });
  report.screenshots.push('action-palette-desktop.png');
  await page.locator('.hc-family').first().hover();
  await page.locator('.hc-family').first().screenshot({ path: join(output, 'action-family-hover.png') });
  report.screenshots.push('action-family-hover.png');
  await page.locator('.hc-family').first().click();
  await page.locator('.hc-actions').screenshot({ path: join(output, 'action-composer-styled.png') });
  report.screenshots.push('action-composer-styled.png');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.locator('.hc-actions').screenshot({ path: join(output, 'action-palette-narrow.png') });
  report.screenshots.push('action-palette-narrow.png');
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.failure = error.message; throw error;
} finally {
  await writeFile(join(output, 'action-rail-report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
