/* global document, innerWidth, localStorage -- functions passed to page.evaluate execute in Chrome */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const base = process.env.HOMECOMING_BASE_URL ?? 'http://127.0.0.1:4173';
const output = resolve(root, 'reports/homecoming');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }), browser: await browser.version(), scenarios: [], screenshots: [], exercisedFamilies: [], errors: [] };
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on('pageerror', error => report.errors.push(error.message));
let matchServer;

async function scenario(name, fn) {
  try { await fn(); report.scenarios.push({ name, status: 'PASS' }); }
  catch (error) {
    await page.screenshot({ path: join(output, 'failure.png'), fullPage: true });
    report.scenarios.push({ name, status: 'FAIL', error: error.message }); throw error;
  }
}
async function start(seed = 12345) {
  await page.goto(`${base}/#/play/new`);
  await page.getByTestId('start-match').waitFor();
  await page.locator('[data-testid="setup-advanced"] summary').click();
  await page.locator('input[name="seed"]').fill(String(seed));
  await page.getByTestId('start-match').click();
  await page.locator('.hc-game').waitFor({ timeout: 20000 });
  const hideChat = page.getByRole('button', { name: 'Hide chat', exact: true });
  if (await hideChat.count()) await hideChat.click();
}
async function makeMove(activePage = page, preferredFamily) {
  const hideChat = activePage.getByRole('button', { name: 'Hide chat', exact: true });
  if (await hideChat.count()) await hideChat.click();
  await activePage.locator('.hc-action:enabled, .hc-family:enabled').first().waitFor({ timeout: 20000 });
  const action = activePage.locator('.hc-action:enabled').first();
  if (!preferredFamily && await action.count()) {
    report.exercisedFamilies.push(await action.getAttribute('data-family'));
    await action.click();
  } else {
    const row = activePage.locator(preferredFamily ? `.hc-family[data-family="${preferredFamily}"]:enabled` : '.hc-family:enabled').first();
    report.exercisedFamilies.push(await row.getAttribute('data-family'));
    await row.click();
    const composer = activePage.getByTestId('action-composer');
    for (let i = 0; i < 14 && await composer.count() && !await composer.locator('.hc-confirm:enabled').count(); i++) {
      const parameter = composer.locator('fieldset').filter({ hasNot: activePage.locator('[data-testid="composer-option"][aria-pressed="true"]'), has: activePage.locator('[data-testid="composer-option"][aria-pressed="false"]') }).first();
      if (!await parameter.count()) break;
      await parameter.locator('[data-testid="composer-option"][aria-pressed="false"]').first().click();
    }
    if (await composer.count()) await composer.locator('.hc-confirm:enabled').click();
  }
  await activePage.waitForTimeout(180);
}
try {
  await scenario('Actual Play mounts Homecoming with the canonical session', async () => {
    await start();
    assert.equal(await page.getByTestId('play-board').getAttribute('data-play-state'), 'ready');
    await page.getByRole('region', { name: 'Pending Plays', exact: true }).waitFor();
    await page.getByTestId('legal-actions').waitFor();
  });
  await scenario('Full tabletop presentation uses playing cards, slot tracks and the composed right rail', async () => {
    assert.equal(await page.locator('.fc-row').count(), 4);
    for (const row of await page.locator('.fc-row').all()) assert.equal(await row.locator('.hx-slot,.fc-slot').count(), 4);
    assert.equal(await page.locator('.hc-hand .tabletop-card img').count(), 0);
    assert.ok(await page.locator('.fc-panel .fc-suggestions').count());
    assert.equal(await page.locator('.hc-opponent-hand').count(), 0);
    assert.equal(await page.locator('.hc-summary .hx-fan').count(), 0);
    assert.equal(await page.locator('.hc-summary .hx-seat-hand').count(), 2);
    assert.ok(await page.locator('.hc-left > .fc-history .glog-tabs').count());
    assert.equal(await page.locator('.hc-right .hc-log').count(), 0);
    const order = await page.locator('.hc-left > *').evaluateAll(elements => elements.slice(0, 4).map(element => element.getAttribute('aria-label')));
    assert.match(order[0], /summary$/u);
    assert.deepEqual(order.slice(1), ['Swap Bar', 'You summary', 'Pending Plays']);
    assert.equal(await page.locator('.hc-left > .hc-summary').first().getAttribute('data-opponent'), 'true');
    const card = page.locator('.hc-hand .tabletop-card').first();
    await card.click();
    await page.getByRole('button', { name: /^Filtering by/ }).waitFor();
    assert.equal(await page.getByRole('dialog', { name: 'Card reference' }).count(), 0);
    await page.getByRole('button', { name: /^Filtering by/ }).click();
  });
  await scenario('Desktop critical surfaces fit all six supported viewports', async () => {
    for (const [width, height] of [[1024, 576], [1280, 720], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440]]) {
      await page.setViewportSize({ width, height }); await page.waitForTimeout(100);
      const result = await page.evaluate(() => ({
        document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
        regions: [...document.querySelectorAll('.hc-status,.hc-left,.hc-center,.hc-hand,.hc-piles,.hc-right,.hc-pending,.hc-actions,.hc-log')].map(el => {
          const r = el.getBoundingClientRect(); return { selector: el.className, x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
        }),
      }));
      assert.ok(result.document.width <= width + 2 && result.document.height <= height + 2, `${width}x${height}: document overflow ${JSON.stringify(result)}`);
      for (const rect of result.regions) assert.ok(rect.x >= -2 && rect.y >= -2 && rect.right <= width + 2 && rect.bottom <= height + 2 && rect.width > 0 && rect.height > 0, `${width}x${height}: clipped ${JSON.stringify(rect)}`);
      const log = result.regions.find(region => region.selector.includes('hc-log'));
      const left = result.regions.find(region => region.selector.includes('hc-left'));
      const actions = result.regions.find(region => region.selector.includes('hc-actions'));
      const right = result.regions.find(region => region.selector.includes('hc-right'));
      assert.ok(Math.abs(log.bottom - left.bottom) <= 2, `${width}x${height}: log does not fill the lower left`);
      assert.ok(Math.abs(actions.y - right.y) <= 2, `${width}x${height}: moves do not start at top of the right rail`);
      const filename = `desktop-${width}x${height}.png`;
      await page.screenshot({ path: join(output, filename) }); report.screenshots.push(filename);
    }
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  if (await page.getByRole('button', { name: 'Hide chat', exact: true }).count()) await page.getByRole('button', { name: 'Hide chat', exact: true }).click();
  await scenario('Keyboard opens Composer, Escape cancels, and focus returns to the family', async () => {
    const family = page.locator('.hc-family[data-family="swap-bar"]');
    await family.focus(); await page.keyboard.press('Enter');
    await page.getByTestId('action-composer').waitFor();
    await page.keyboard.press('Escape');
    await page.getByTestId('action-composer').waitFor({ state: 'detached' });
    assert.equal(await family.evaluate(element => element === document.activeElement), true);
  });
  await scenario('Action family opens, board picks, exact confirmation advances the authority', async () => {
    await page.locator('.hc-family[data-family="swap-bar"]').click();
    await page.getByTestId('action-composer').waitFor();
    await page.screenshot({ path: join(output, 'composer-1440x900.png') }); report.screenshots.push('composer-1440x900.png');
    await page.getByRole('button', { name: 'Give from your hand', exact: true }).click();
    const highlighted = page.locator('.hc-hand .tabletop-card.is-highlighted').first();
    if (await highlighted.count()) await highlighted.click();
    else await page.getByTestId('composer-option').first().click();
    const composer = page.getByTestId('action-composer');
    for (let i = 0; i < 8 && !await composer.locator('.hc-confirm:enabled').count(); i++) {
      await composer.locator('fieldset').filter({ hasNot: page.locator('[data-testid="composer-option"][aria-pressed="true"]'), has: page.locator('[data-testid="composer-option"][aria-pressed="false"]') }).first().locator('[data-testid="composer-option"][aria-pressed="false"]').first().click();
    }
    await composer.locator('.hc-confirm:enabled').click();
    await page.getByTestId('action-composer').waitFor({ state: 'detached' });
    await page.waitForTimeout(150);
    assert.ok(await page.locator('.hc-swap .tabletop-card:not(.is-concealed)').count() > 0);
  });
  await scenario('Complete suggested moves play once on click without an extra confirmation', async () => {
    // Entering Action Phase can advance the canonical frame without adding an
    // event. Observe the projected decision surfaces rather than event count.
    const before = await page.locator('.hc-status,.hc-hand,.hc-log,.hc-action,.hc-family').evaluateAll(elements => elements.map(el => `${el.textContent}|${el.getAttribute('data-action-id') ?? ''}`).join('\n'));
    await page.locator('.hc-suggestions button:enabled').first().click();
    await page.waitForFunction(before => [...document.querySelectorAll('.hc-status,.hc-hand,.hc-log,.hc-action,.hc-family')].map(el => `${el.textContent}|${el.getAttribute('data-action-id') ?? ''}`).join('\n') !== before, before);
    assert.equal(await page.locator('.hc-confirmation').count(), 0);
    assert.equal(await page.getByTestId('action-composer').count(), 0);
  });
  await scenario('Card inspection and cosmetic hand reorder remain usable', async () => {
    await page.locator('.hc-hand .tabletop-card').first().dblclick();
    await page.getByRole('dialog', { name: 'Card reference' }).waitFor();
    assert.ok(await page.getByRole('button', { name: 'Full inspector' }).count());
    await page.getByRole('button', { name: 'Full inspector' }).click();
    await page.locator('#advanced-card-rules-dialog[open]').waitFor();
    assert.ok((await page.locator('#advanced-card-rules-content').innerText()).trim().length > 0);
    await page.locator('[data-acr-close]').click();
    await page.keyboard.press('Escape');
    await page.locator('.hc-reorder button:enabled').first().click();
  });
  await scenario('Local authoritative save restores into the same board', async () => {
    const family = page.locator('.hc-family:enabled').first();
    if (await family.count()) await family.click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('Match saved', { exact: true }).waitFor();
    await page.reload();
    // The existing route restore uses the canonical save, no Composer persistence.
    await page.locator('.hc-game, [data-testid="setup-resume-prompt"]').waitFor({ timeout: 20000 });
    const resume = page.getByTestId('resume-match');
    if (await resume.count()) await resume.click();
    await page.locator('.hc-game').waitFor({ timeout: 20000 });
    assert.equal(await page.getByTestId('action-composer').count(), 0);
  });
  await scenario('Local AI play advances several authoritative turns', async () => {
    for (let i = 0; i < 12 && await page.locator('.hc-game').count(); i++) {
      await makeMove();
      if (await page.locator('.hc-point-card').count() && !report.screenshots.includes('midgame-1440x900.png')) {
        await page.screenshot({ path: join(output, 'midgame-1440x900.png') }); report.screenshots.push('midgame-1440x900.png');
      }
    }
    assert.equal(await page.locator('.hc-error').count(), 0);
    if (await page.getByTestId('play-terminal').count()) {
      await page.getByTestId('watch-replay').waitFor();
      await page.getByTestId('open-achievements').waitFor();
      await page.getByTestId('play-terminal').evaluate(async element => {
        await Promise.all(element.getAnimations({ subtree: true }).filter(animation => Number.isFinite(animation.effect.getComputedTiming().endTime)).map(animation => animation.finished));
      });
      await page.screenshot({ path: join(output, 'local-terminal-1440x900.png') }); report.screenshots.push('local-terminal-1440x900.png');
    }
  });
  if (!await page.locator('.hc-game').count()) await start(54321);
  await scenario('Narrow layouts retain reachable controls without horizontal document overflow', async () => {
    for (const width of [390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
      const hideMoves = page.getByRole('button', { name: 'Hide', exact: true });
      if (await hideMoves.count()) await hideMoves.click();
      assert.ok((await page.locator('.hc-actions').boundingBox()).height <= 56);
      await page.locator('.hc-log').scrollIntoViewIfNeeded();
      const history = await page.locator('.hc-log').boundingBox();
      assert.ok(history.height > 0 && history.height <= 301 && history.width > width * .8);
      await page.locator('.hc-log > summary').click();
      assert.equal(await page.locator('.hc-log').getAttribute('open'), null);
      await page.locator('.hc-log > summary').click();
      await page.locator('.hc-log .glog-tabs').waitFor();
      const filename = `narrow-${width}.png`; await page.screenshot({ path: join(output, filename), fullPage: true }); report.screenshots.push(filename);
      const historyFilename = `narrow-history-${width}.png`; await page.screenshot({ path: join(output, historyFilename) }); report.screenshots.push(historyFilename);
    }
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await scenario('Academy objectives, hints, and coachmarks use the canonical controller', async () => {
    await page.goto(`${base}/#/play/academy`);
    await page.locator('[data-action="academy-start"]').first().click();
    await page.locator('[data-action="academy-start-lesson"]').click();
    await page.locator('.hc-game').waitFor();
    await page.getByTestId('academy-objective-panel').waitFor();
    const hint = page.getByTestId('academy-hint');
    if (await hint.count()) {
      await hint.click();
      assert.ok((await page.getByTestId('academy-hint-display').textContent()).trim().length > 0);
    }
    await page.getByTestId('academy-toggle-panel').click();
    await expect(page.getByTestId('academy-toggle-panel')).toHaveAttribute('aria-expanded', 'false');
    await page.getByTestId('academy-toggle-panel').click();
    await expect(page.getByTestId('academy-toggle-panel')).toHaveAttribute('aria-expanded', 'true');
    await page.screenshot({ path: join(output, 'academy-1440x900.png') }); report.screenshots.push('academy-1440x900.png');
    await makeMove();
  });
  await scenario('Guided Exhibition keeps its existing scripted teaching runtime', async () => {
    await page.goto(`${base}/#/play/guided`);
    await page.locator('[data-action="guided-start"]').click();
    await page.getByTestId('guided-match').waitFor();
    await page.getByTestId('guided-board').waitFor();
    assert.equal(await page.locator('.guided-error').count(), 0);
  });
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  matchServer = await startServer({ port: 0, host: '127.0.0.1', persistent: false, dbPath: ':memory:', authMode: 'disabled', rateLimitCapacity: 10000, skipModerationProbe: true });
  const serverUrl = `ws://127.0.0.1:${matchServer.httpServer.address().port}`;
  const seats = [];
  const outgoingKeys = [];
  for (let index = 0; index < 2; index++) {
    const seatContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    await seatContext.route('**/__intrilex-config*.js', route => route.fulfill({ contentType: 'text/javascript', body: `window.__INTRILEX_CONFIG__={matchServerUrl:${JSON.stringify(serverUrl)}};` }));
    await seatContext.addInitScript(url => { localStorage.setItem('intrilex:network-server-url', url); }, serverUrl);
    const seat = await seatContext.newPage();
    seat.on('pageerror', error => report.errors.push(error.message));
    seat.on('console', message => { if (/Failed to download replay|Replay hash mismatch/.test(message.text())) console.warn(`Replay browser diagnostic: ${message.text()}`); });
    seat.on('websocket', socket => socket.on('framesent', frame => {
      const message = JSON.parse(String(frame.payload));
      if (message.type === 'SUBMIT_ACTION') outgoingKeys.push(Object.keys(message.payload).sort());
    }));
    seats.push(seat);
  }
  await scenario('Two actual browser seats mount Homecoming through the existing network authority', async () => {
    await seats[0].goto(`${base}/#/play/online`);
    await seats[0].getByTestId('network-create').click();
    const invite = await seats[0].getByTestId('network-invite-code').textContent();
    await seats[1].goto(`${base}/#/play/online`);
    await seats[1].getByTestId('network-join').click();
    await seats[1].getByTestId('network-invite-input').fill(invite.trim());
    await seats[1].getByTestId('network-join-submit').click();
    await seats[1].getByTestId('network-ready').click();
    await seats[0].getByTestId('network-ready').click();
    for (const seat of seats) {
      await seat.locator('.hc-game').waitFor({ timeout: 20000 });
      const hideChat = seat.getByRole('button', { name: 'Hide chat', exact: true });
      if (await hideChat.count()) await hideChat.click();
      assert.equal(await seat.locator('.hc-opponent-hand').count(), 0);
      assert.equal(await seat.locator('.hc-summary[data-opponent="true"] .hx-seat-hand').count(), 1);
      assert.equal(await seat.getByTestId('action-composer').count(), 0);
    }
  });
  await scenario('Online Composer submits an enumerated action without a command body', async () => {
    const readySeat = await seats[0].getByTestId('play-board').getAttribute('data-play-state') === 'ready' ? seats[0] : seats[1];
    await makeMove(readySeat, 'swap-bar');
    assert.ok(outgoingKeys.length > 0);
    for (const keys of outgoingKeys) {
      for (const key of ['actionId', 'decisionFrameHash', 'expectedRevision', 'matchId']) assert.ok(keys.includes(key));
      assert.ok(!keys.includes('command') && !keys.includes('rawState') && !keys.includes('sourceHandles'));
    }
    for (const seat of seats) await seat.locator('.hc-swap .tabletop-card:not(.is-concealed)').first().waitFor();
  });
  await scenario('Online drag uses one normal action request and synchronizes the same public card to both seats', async () => {
    let owner;
    for (let step = 0; step < 8; step++) {
      const active = await seats[0].getByTestId('play-board').getAttribute('data-play-state') === 'ready' ? seats[0] : seats[1];
      if (await active.locator('.hc-action[data-family="score"]:enabled,.hc-family[data-family="score"]:enabled').count()) { owner = active; break; }
      await makeMove(active);
    }
    assert.ok(owner, 'A normal scoring decision must be reachable through existing controls');
    const destination = owner.locator('.hc-row-mine.hc-pr');
    const destinationId = await destination.getAttribute('data-drop-id');
    let sourceId;
    for (const candidate of await owner.locator('.hc-hand [data-drag-source]').all()) {
      const origin = await candidate.boundingBox();
      await owner.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2);
      await owner.mouse.down(); await owner.mouse.move(origin.x + origin.width / 2 + 12, origin.y + origin.height / 2, { steps: 3 });
      await expect(owner.getByTestId('drag-overlay')).toHaveCount(1);
      if (await destination.getAttribute('data-drop-state') === 'eligible') { sourceId = await candidate.getAttribute('data-drag-source'); break; }
      await owner.keyboard.press('Escape'); await owner.mouse.up(); await expect(owner.getByTestId('drag-overlay')).toHaveCount(0);
    }
    assert.ok(sourceId, 'An enumerated scoring source must activate its Point Row');
    const target = await destination.boundingBox(), before = outgoingKeys.length;
    await owner.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
    await expect(destination.getByTestId('drag-preview')).toBeVisible(); await owner.mouse.up();
    const chooser = owner.getByTestId('drag-chooser'); if (await chooser.count()) await chooser.getByRole('button').first().click();
    await expect.poll(() => outgoingKeys.length).toBe(before + 1);
    assert.ok(!outgoingKeys.at(-1).some(key => /pointer|coordinate|hover|destination|source/u.test(key)));
    for (let step = 0; step < 8 && !await destination.locator(`[data-drop-kind="card"][data-drop-id="${sourceId}"]`).count(); step++) {
      const active = await seats[0].getByTestId('play-board').getAttribute('data-play-state') === 'ready' ? seats[0] : seats[1];
      const decline = active.locator('.hc-action[data-family="response-decline"]:enabled');
      if (await decline.count()) await decline.first().click(); else await makeMove(active);
      await expect(active.getByTestId('drag-overlay')).toHaveCount(0);
    }
    for (const seat of seats) await expect(seat.locator(`[data-drop-id="${destinationId}"] [data-drop-kind="card"][data-drop-id="${sourceId}"]`)).toHaveCount(1);
  });
  await scenario('Network chat updates the existing chat channel alongside playable controls', async () => {
    for (const seat of seats) await seat.getByRole('button', { name: /^Show chat/ }).click();
    await seats[0].getByTestId('astra-chat-input').fill('Homecoming authority check');
    await seats[0].getByRole('button', { name: 'Send', exact: true }).click();
    await seats[1].getByText('Homecoming authority check', { exact: true }).waitFor();
    for (const seat of seats) await seat.getByRole('button', { name: 'Hide chat', exact: true }).click();
    await seats[0].screenshot({ path: join(output, 'online-1440x900.png') }); report.screenshots.push('online-1440x900.png');
  });
  await scenario('Refresh reconnects the same online match and drops Composer state', async () => {
    const first = seats[0];
    const before = await first.evaluate(() => JSON.parse(localStorage.getItem('intrilex:network-match')).matchId);
    await first.reload();
    const reconnect = first.getByTestId('network-reconnect');
    await first.locator('.hc-game, [data-testid="network-reconnect"]').first().waitFor({ timeout: 20000 });
    if (await reconnect.count()) await reconnect.click();
    await first.locator('.hc-game').waitFor({ timeout: 20000 });
    assert.equal(await first.evaluate(() => JSON.parse(localStorage.getItem('intrilex:network-match')).matchId), before);
    assert.equal(await first.getByTestId('action-composer').count(), 0);
  });
  await scenario('Online forfeit keeps the canonical terminal and replay flow', async () => {
    await seats[0].getByRole('button', { name: 'Forfeit', exact: true }).click();
    await seats[0].getByTestId('forfeit-confirm').click();
    await seats[0].locator('.hc-game').waitFor({ state: 'detached', timeout: 20000 });
    await seats[1].locator('.hc-game').waitFor({ state: 'detached', timeout: 20000 });
    assert.ok((await seats[0].locator('body').innerText()).includes('Forfeit') || (await seats[0].locator('body').innerText()).includes('Defeat'));
    for (const seat of seats) {
      await seat.getByTestId('play-terminal').waitFor();
      const download = seat.waitForEvent('download', { timeout: 20000 });
      await seat.getByTestId('download-replay').click();
      assert.match((await download).suggestedFilename(), /\.replay\.json$/);
    }
    assert.notEqual(await seats[0].getByTestId('terminal-winner').textContent(), 'AI');
    await seats[0].getByTestId('play-terminal').evaluate(async element => {
      await Promise.all(element.getAnimations({ subtree: true }).filter(animation => Number.isFinite(animation.effect.getComputedTiming().endTime)).map(animation => animation.finished));
    });
    await seats[0].screenshot({ path: join(output, 'online-terminal-1440x900.png') }); report.screenshots.push('online-terminal-1440x900.png');
  });
  await scenario('Online terminal rematch reuses the existing authenticated admission', async () => {
    await seats[0].getByTestId('network-rematch').click();
    await seats[0].getByTestId('network-invite-code').waitFor({ timeout: 20000 });
    await seats[1].locator('[data-action="accept-rematch"]').click();
    for (const seat of seats) await seat.getByTestId('network-ready').waitFor({ timeout: 20000 });
    await seats[0].getByTestId('network-ready').click();
    await seats[1].getByTestId('network-ready').click();
    for (const seat of seats) await seat.locator('.hc-game').waitFor({ timeout: 20000 });
  });
  assert.deepEqual(report.errors, [], 'No browser JavaScript errors');
} finally {
  await writeFile(join(output, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  if (matchServer) await matchServer.close();
}
console.log(JSON.stringify(report, null, 2));
