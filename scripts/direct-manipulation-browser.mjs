/* global window, Event, PointerEvent -- callbacks below execute inside the isolated browser page */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createAuthoritativeMatch } from '../packages/match-authority/src/authoritative-match-session.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'reports/direct-manipulation');
await mkdir(output, { recursive: true });
let match, participants, submitted, current, kingId, reject = false;
function project() {
  const seat = participants.find(p => p.playerId === 'P1');
  const view = match.getAuthorizedView(seat.participantId);
  return { ...view, sessionId: match.matchId, human: { playerId: seat.playerId }, decision: view.decision ? { ...view.decision, isHuman: view.decision.isMyDecision } : null };
}
async function resetAuthority(kind) {
  match = createAuthoritativeMatch({ matchId: `browser-drag-${kind}`, seed: 1, profileId: 'core-unrestricted-authority' });
  participants = [match.addParticipant('one', 'a'.repeat(43)), match.addParticipant('two', 'b'.repeat(43))];
  for (const p of participants) match.setReady(p.participantId);
  match.start();
  const seat = participants.find(p => p.playerId === match.currentDecisionActor);
  const enter = match.legalActionFrame.find(action => action.family === 'phase' && action.mode === 'enter-action');
  assert.equal((await match.submitAction(seat.participantId, { clientCommandId: 'setup', expectedRevision: match._stateRevision, decisionFrameHash: match.decisionFrameHash, actionId: enter.actionId })).accepted, true);
  submitted = []; reject = kind === 'rejected'; current = project();
  kingId = current.playerView.own.hand.find(card => card.identity.startsWith('K')).id;
  const anchor = current.decision.legalActions.find(action => action.family === 'anchor' && action.sourceCardIds.includes(kingId));
  assert.ok(anchor);
  if (kind === 'ambiguous') current.decision.legalActions.push({ ...anchor, actionId: 'alternate-ui-fixture', mode: 'queen' });
  if (kind === 'illegal') current.decision.legalActions = current.decision.legalActions.filter(action => action.family !== 'anchor' || !action.sourceCardIds.includes(kingId));
  return current;
}
const initial = await resetAuthority('legal');
const contents = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { IntrilexGame } from './apps/lab-web/src/client/gameplay/IntrilexGame.tsx';
import { createGameStore } from './apps/lab-web/src/client/game-store.ts';
import './apps/lab-web/src/client/game-table.css';
const store = createGameStore(async intent => {
  const result = await window.authoritySubmit(intent);
  if (result.snapshot) store.update(result.snapshot, { coalesceIdenticalActions: true });
  return result;
});
store.update(${JSON.stringify(initial)}, { coalesceIdenticalActions: true });
window.resetFixture = async kind => { const snapshot = await window.authorityReset(kind); store.update(snapshot, { coalesceIdenticalActions: true }); };
window.updateFixture = update => store.update(update, { coalesceIdenticalActions: true });
window.liveGame = () => store.getSnapshot();
createRoot(document.getElementById('root')).render(<IntrilexGame store={store} rankSuggestions={() => []} />);
`;
const bundled = await build({ stdin: { contents, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', outfile: 'fixture.js', define: { 'process.env.NODE_ENV': '"production"' } });
const js = bundled.outputFiles.find(file => file.path.endsWith('.js')).text;
const css = bundled.outputFiles.find(file => file.path.endsWith('.css')).text;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const report = { date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }), scope: 'Actual React board, GameStore and canonical match authority. Ambiguity uses an explicitly controlled UI fixture. No public deployment.', browser: await browser.version(), scenarios: [], errors: [] };
page.on('pageerror', error => report.errors.push(error.message));
await page.exposeFunction('authorityReset', resetAuthority);
await page.exposeFunction('authoritySubmit', async intent => {
  submitted.push(intent);
  if (reject) return { accepted: false };
  const seat = participants.find(p => p.playerId === 'P1');
  assert.deepEqual(Object.keys(intent).sort(), ['actionId', 'decisionFrameHash', 'sessionId', 'stateRevision']);
  const result = await match.submitAction(seat.participantId, { clientCommandId: `browser-${submitted.length}`, expectedRevision: intent.stateRevision, decisionFrameHash: intent.decisionFrameHash, actionId: intent.actionId });
  return { accepted: result.accepted, snapshot: project() };
});
async function scenario(name, fn) {
  try { await fn(); report.scenarios.push({ name, status: 'PASS' }); }
  catch (error) { report.scenarios.push({ name, status: 'FAIL', error: error.message }); throw error; }
}
async function reset(kind = 'legal') {
  await page.evaluate(kind => window.resetFixture(kind), kind);
  await expect(page.getByTestId('play-board')).toHaveAttribute('data-play-state', 'ready');
  await expect(page.getByTestId('drag-overlay')).toHaveCount(0);
}
const source = () => page.locator(`.hc-hand [data-drag-source="${kingId}"]`);
const row = () => page.locator('[data-drop-id="P1:enduring"]');
async function begin() {
  await source().scrollIntoViewIfNeeded();
  const rect = await source().boundingBox(); assert.ok(rect);
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 + 12, rect.y + rect.height / 2, { steps: 3 });
  await expect(page.getByTestId('drag-overlay')).toHaveCount(1);
}
async function hover(target = row()) {
  const rect = await target.boundingBox(); assert.ok(rect);
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2, { steps: 9 });
}
async function cancel() { await page.keyboard.press('Escape'); await page.mouse.up(); await expect(page.getByTestId('drag-overlay')).toHaveCount(0); }
try {
  await page.route('http://127.0.0.1:4173/__direct_manipulation_fixture', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><style>html,body{margin:0}*,*::before,*::after{box-sizing:border-box}' + css + '</style><div id="root"></div><script>' + js.replaceAll('</script>', '<\\/script>') + '</script>' }));
  await page.goto('http://127.0.0.1:4173/__direct_manipulation_fixture');
  await scenario('Real King lifts, activates only its legal destinations and previews without changing game state', async () => {
    const before = await page.evaluate(() => JSON.stringify(window.liveGame().game));
    await begin(); await expect(row()).toHaveAttribute('data-drop-state', 'eligible');
    await expect(page.locator('[data-drop-id="P2:enduring"]')).not.toHaveAttribute('data-drop-state');
    await hover(); await expect(row()).toHaveAttribute('data-drop-state', 'hovered');
    await expect(row().getByTestId('drag-preview')).toBeVisible();
    assert.equal(await page.evaluate(() => JSON.stringify(window.liveGame().game)), before);
    await page.screenshot({ path: join(output, 'king-preview-1440.png'), fullPage: true });
    await cancel(); assert.equal(submitted.length, 0);
  });
  await scenario('King release sends one existing action intent to real authority and updates hand, pending plays and log', async () => {
    await reset(); await begin(); await hover(); await page.mouse.up();
    await expect(page.getByTestId('drag-overlay')).toHaveCount(0);
    await expect.poll(() => submitted.length).toBe(1);
    await expect.poll(() => page.evaluate(() => window.liveGame().game.revision)).toBeGreaterThan(current.playerView.revision);
    assert.ok(match.recentSafeEvents.some(event => /DECLAR|ANCHOR/.test(event.type)));
    assert.equal(await page.getByTestId('drag-chooser').count(), 0);
    // Resolve ordinary responses through the same authority, then publish the owner projection.
    for (let i = 0; i < 8 && !match.getAuthorizedView(participants[0].participantId).playerView.own.er.some(card => card.id === kingId); i++) {
      const response = match.legalActionFrame?.find(action => action.family === 'response-decline' || action.family === 'pass' || action.family === 'phase');
      if (!response) break;
      const actor = participants.find(p => p.playerId === match.currentDecisionActor);
      assert.equal((await match.submitAction(actor.participantId, { clientCommandId: `resolve-${i}`, expectedRevision: match._stateRevision, decisionFrameHash: match.decisionFrameHash, actionId: response.actionId })).accepted, true);
    }
    await page.evaluate(snapshot => window.updateFixture(snapshot), project());
    await expect(row().getByRole('button', { name: /K♥/ })).toHaveCount(1);
    assert.equal(await page.locator('.hc-hand').getByRole('button', { name: /K♥/ }).count(), 0);
    await page.screenshot({ path: join(output, 'king-committed-1440.png'), fullPage: true });
  });
  await scenario('Illegal Enduring Row drop stays quiet and cannot submit', async () => {
    await reset('illegal'); await begin(); await expect(row()).not.toHaveAttribute('data-drop-state'); await hover(); await page.mouse.up();
    await expect(page.getByTestId('drag-overlay')).toHaveCount(0); assert.equal(submitted.length, 0);
  });
  await scenario('Ambiguous release preserves preview and awaits an explicit keyboard choice', async () => {
    await reset('ambiguous'); await begin(); await hover(); await page.mouse.up();
    const chooser = page.getByTestId('drag-chooser'); await expect(chooser).toBeVisible(); assert.equal(submitted.length, 0);
    await expect(chooser.getByRole('button').first()).toBeFocused();
    await expect(row().getByTestId('drag-preview')).toHaveCount(1);
    await page.screenshot({ path: join(output, 'ambiguity-1440.png'), fullPage: true });
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter');
    await expect(chooser).toHaveCount(0); await expect.poll(() => submitted.length).toBe(1);
    assert.notEqual(submitted[0].actionId, 'alternate-ui-fixture');
  });
  await scenario('Confirm preference requires an explicit legal action confirmation and persists', async () => {
    await reset(); await page.getByText('Gestures', { exact: true }).click(); await page.getByLabel('Confirm Obvious Drag Plays').check();
    await page.getByText('Gestures', { exact: true }).click(); await begin(); await hover(); await page.mouse.up();
    await expect(page.getByTestId('drag-chooser')).toHaveCount(1); assert.equal(submitted.length, 0);
    await page.getByTestId('drag-chooser').getByRole('button', { name: /^Confirm/ }).click();
    await expect.poll(() => submitted.length).toBe(1);
    await reset(); await page.getByText('Gestures', { exact: true }).click(); await expect(page.getByLabel('Confirm Obvious Drag Plays')).toBeChecked();
    await page.getByLabel('Confirm Obvious Drag Plays').uncheck(); await page.getByText('Gestures', { exact: true }).click();
  });
  await scenario('Click below threshold retains card selection; Quick Play OFF leaves normal legal actions usable', async () => {
    await reset(); await source().click(); await expect(page.getByRole('button', { name: /^Filtering by/ })).toHaveCount(1);
    assert.equal(submitted.length, 0); await page.getByRole('button', { name: /^Filtering by/ }).click();
    await page.getByText('Gestures', { exact: true }).click(); await page.getByLabel('Quick Play Gestures').uncheck();
    await expect(page.locator('.hc-hand [data-drag-source]')).toHaveCount(0);
    await page.getByText('Gestures', { exact: true }).click();
    const anchor = current.decision.legalActions.find(action => action.family === 'anchor' && action.sourceCardIds.includes(kingId));
    await page.locator(`[data-action-id="${anchor.actionId}"]`).click(); await expect.poll(() => submitted.length).toBe(1);
    await reset(); await page.getByText('Gestures', { exact: true }).click(); await page.getByLabel('Quick Play Gestures').check(); await page.getByText('Gestures', { exact: true }).click();
  });
  await scenario('Revision change, game ending, active-seat change, pointercancel, capture loss, blur and resize cancel without submission', async () => {
    for (const kind of ['revision', 'end', 'actor', 'pointercancel', 'capture', 'blur', 'resize']) {
      await reset(); await begin(); await hover();
      if (kind === 'revision' || kind === 'end' || kind === 'actor') {
        const update = structuredClone(current);
        if (kind === 'revision') { update.playerView.revision++; update.decision.stateRevision++; update.decision.frameHash = 'changed'; }
        if (kind === 'end') { update.status = 'TERMINAL'; update.decision = null; update.match.winner = 'P2'; update.match.terminationReason = 'FORFEIT'; }
        if (kind === 'actor') update.playerView.activePlayerId = 'P2';
        await page.evaluate(snapshot => window.updateFixture(snapshot), update);
      } else if (kind === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      else if (kind === 'resize') await page.setViewportSize({ width: 1280, height: 800 });
      else await page.locator('.hc-hand [data-dragging]').evaluate((node, kind) => node.dispatchEvent(new PointerEvent(kind === 'capture' ? 'lostpointercapture' : 'pointercancel', { bubbles: true, pointerId: 1 })), kind);
      await page.mouse.up(); await expect(page.getByTestId('drag-overlay')).toHaveCount(0); assert.equal(submitted.length, 0, kind);
      await expect(page.locator('[data-drop-state]')).toHaveCount(0);
    }
  });
  await scenario('Chooser invalidation and Escape never leave a stranded preview', async () => {
    await reset('ambiguous'); await begin(); await hover(); await page.mouse.up(); await expect(page.getByTestId('drag-chooser')).toHaveCount(1);
    await page.keyboard.press('Escape'); await expect(page.getByTestId('drag-chooser')).toHaveCount(0); await expect(page.getByTestId('drag-preview')).toHaveCount(0);
    assert.equal(submitted.length, 0);
    await begin(); await hover(); await page.mouse.up();
    const changed = structuredClone(current); changed.playerView.revision++; changed.decision.stateRevision++; changed.decision.frameHash = 'new-frame';
    await page.evaluate(snapshot => window.updateFixture(snapshot), changed);
    await expect(page.getByTestId('drag-chooser')).toHaveCount(0); assert.equal(submitted.length, 0);
  });
  await scenario('Authority rejection restores presentation and surfaces the existing error', async () => {
    await reset('rejected'); await begin(); await hover(); await page.mouse.up();
    await expect(page.getByRole('alert')).toContainText('Action was not accepted');
    await expect(page.getByTestId('drag-overlay')).toHaveCount(0); assert.equal(submitted.length, 1);
    assert.ok(match.getAuthorizedView(participants[0].participantId).playerView.own.hand.some(card => card.id === kingId));
  });
  await scenario('Narrow layout and transformed board use viewport geometry; reduced motion cancels cleanly', async () => {
    await reset(); await page.setViewportSize({ width: 768, height: 1000 });
    await begin(); await hover(); await expect(row().getByTestId('drag-preview')).toHaveCount(1); await cancel();
    await page.setViewportSize({ width: 1440, height: 900 }); await reset();
    await page.locator('.hc-center').evaluate(node => { node.style.transform = 'scale(.9)'; });
    await begin(); await hover(); await expect(row().getByTestId('drag-preview')).toHaveCount(1);
    await page.emulateMedia({ reducedMotion: 'reduce' }); await cancel(); assert.equal(submitted.length, 0);
  });
  assert.deepEqual(report.errors, []);
} catch (error) {
  await page.screenshot({ path: join(output, 'failure.png'), fullPage: true }); throw error;
} finally {
  await writeFile(join(output, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
console.log(`Direct Manipulation browser: ${report.scenarios.length} PASS; ${report.errors.length} page errors`);
