/* global window, Option */
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'apps/lab-web/dist');
const output = path.join(root, 'reports/local/agent-profiles/arena-browser');
await mkdir(output, { recursive: true });
const source = await readFile(path.join(dist, 'play/play-app.js'), 'utf8');
const suffix = source.match(/play-state\.js(\?v=[\w]+)/)?.[1] ?? '';
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const target = path.resolve(dist, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
    if (!target.startsWith(`${dist}${path.sep}`)) { res.writeHead(403).end(); return; }
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webp': 'image/webp' };
    const data = await readFile(target);
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] ?? 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const report = { startedAt: new Date().toISOString(), browser: browser.version(), scope: 'Local Chromium, real Arena engine execution, disposable native IndexedDB', scenarios: [], pageErrors: [] };
page.on('pageerror', error => report.pageErrors.push(error.message));
async function scenario(name, fn) {
  try { const detail = await fn(); report.scenarios.push({ name, status: 'PASS', detail }); console.log(`PASS: ${name}`); }
  catch (error) { report.scenarios.push({ name, status: 'FAIL', error: error.stack }); throw error; }
}
async function install() {
  await page.evaluate(async suffix => {
    const [storage, runtime] = await Promise.all([import(`/evolution/profile-store.mjs${suffix}`), import(`/evolution/identity.mjs${suffix}`)]);
    window.__arenaProfiles = new storage.ProfileStore(new storage.IndexedDbBackend(), { identity: runtime.LAB_IDENTITY });
  }, suffix);
}
const call = (method, ...args) => page.evaluate(({ method, args }) => window.__arenaProfiles[method](...args), { method, args });
async function arena() { await page.locator('.evo-navigation [data-evo-surface="arena"]').click(); }
async function reset() { await page.locator('#evo-reset').click(); await arena(); }
async function exported() {
  await page.locator('.evo-navigation [data-evo-surface="ledger"]').click();
  const promise = page.waitForEvent('download');
  await page.locator('#evo-export').click();
  const download = await promise;
  return JSON.parse(await readFile(await download.path(), 'utf8'));
}
async function setup(a, b, games = 2) {
  await arena();
  await expect(page.locator('#evo-bot-a option').filter({ hasText: 'GRAVE MAW' })).toHaveCount(1);
  await page.locator('#evo-bot-a').selectOption(a);
  await page.locator('#evo-bot-b').selectOption(b);
  await page.locator('#evo-games').fill(String(games));
  await page.locator('#evo-workers').selectOption('1');
  await page.locator('#evo-run').click();
}
async function complete() {
  await expect(page.locator('#evo-state')).toHaveText('COMPLETE', { timeout: 120000 });
  const envelope = await exported();
  assert.equal(envelope.payload.records.length, envelope.payload.config.gameCount);
  assert.ok(envelope.payload.records.every(r => r.terminationReason !== 'POLICY_ERROR' && r.terminationReason !== 'ENGINE_REJECTION'));
  return envelope;
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/#/evolution`);
  await install();
  const first = await call('createProfile', { commandId: 'arena-first', displayName: 'GRAVE MAW', traits: { scoringDrive: 30, guard: 20 } });
  const second = await call('createProfile', { commandId: 'arena-second', displayName: 'SECOND PROFILE', traits: { scoringDrive: 90, guard: 5 } });
  const a = `agent-profile:${first.agentProfileId}`, b = `agent-profile:${second.agentProfileId}`;
  let pinned;
  await scenario('both seat dropdowns show Custom Profiles and retain all ten static policies', async () => {
    await arena(); await page.locator('#evo-profiles-refresh').click();
    await expect(page.locator('#evo-bot-a optgroup option')).toHaveCount(2);
    await expect(page.locator('#evo-bot-b optgroup option')).toHaveCount(2);
    assert.equal(await page.locator('#evo-bot-a > option').count(), 10);
    await page.screenshot({ path: path.join(output, 'custom-profile-dropdowns.png'), fullPage: true });
  });
  const before = await call('profileView', first.agentProfileId);
  await scenario('Profile versus static policy executes real paired games with the exact Champion', async () => {
    await setup(a, 'control'); const { payload: run } = await complete();
    assert.equal(run.checkpoints[0].checkpointId, before.head.championCheckpointId);
    assert.equal(run.arenaProfiles.snapshots[0].profile.agentProfileId, first.agentProfileId);
    assert.equal(run.arenaProfiles.snapshots[1], null);
    assert.deepEqual(run.records.map(r => r.swapped).sort(), [false, true]);
    assert.deepEqual(await call('profileView', first.agentProfileId), before);
    return { checkpointId: run.checkpoints[0].checkpointId, games: run.records.length };
  });
  await scenario('Profile versus Profile executes distinct weighted checkpoints without scientific writes', async () => {
    await reset(); await setup(a, b); const { payload: run } = await complete();
    assert.notEqual(run.checkpoints[0].checkpointId, run.checkpoints[1].checkpointId);
    assert.deepEqual(run.config.botA, run.config.botB);
    assert.deepEqual(await call('profileView', first.agentProfileId), before);
    return { checkpointIds: run.checkpoints.map(c => c.checkpointId), games: run.records.length };
  });
  await scenario('head change during execution leaves current and reloaded/resumed run pinned', async () => {
    await reset(); await setup(a, 'control', 6);
    await expect(page.locator('#evo-state')).toHaveText('RUNNING');
    const head = await call('getHead', first.agentProfileId);
    const draft = await call('saveDraftRevision', { agentProfileId: first.agentProfileId, baseRevisionId: head.activeRevisionId, sourceCheckpointId: head.championCheckpointId, traits: { scoringDrive: 10 } });
    await call('activateAuthoredRevision', { commandId: 'move-mid-arena', agentProfileId: first.agentProfileId, expectedHead: head, revisionId: draft.revision.id });
    await page.locator('#evo-pause').click();
    await expect(page.locator('#evo-state')).toHaveText('PAUSED');
    pinned = await exported();
    assert.equal(pinned.payload.checkpoints[0].checkpointId, head.championCheckpointId);
    assert.notEqual((await call('getHead', first.agentProfileId)).championCheckpointId, head.championCheckpointId);
    await page.reload(); await install();
    await page.locator('.evo-navigation [data-evo-surface="ledger"]').click();
    await page.locator(`[data-load-run="${pinned.payload.runId}"]`).click();
    await arena();
    await expect(page.locator('#evo-state')).toHaveText('PAUSED');
    await page.locator('#evo-resume').click();
    const { payload: resumed } = await complete();
    assert.equal(resumed.checkpoints[0].checkpointId, head.championCheckpointId);
    assert.deepEqual(resumed.arenaProfiles, pinned.payload.arenaProfiles);
    return { headVersionAtStart: head.headVersion, currentHeadVersion: (await call('getHead', first.agentProfileId)).headVersion, games: resumed.records.length };
  });
  await scenario('rules mismatch is visibly unavailable and refreshed menu sees the newer head', async () => {
    await reset(); await page.locator('#evo-profile').selectOption('core-unrestricted-authority');
    await expect.poll(() => page.locator(`#evo-bot-a option[value="${a}"]`).evaluate(el => el.disabled)).toBe(true);
    await expect(page.locator(`#evo-bot-a option[value="${a}"]`)).toContainText('different rules profile');
    await page.locator('#evo-profile').selectOption('core-advanced-authority');
    await expect.poll(() => page.locator(`#evo-bot-a option[value="${a}"]`).evaluate(el => el.disabled)).toBe(false);
    await expect(page.locator(`#evo-bot-a option[value="${a}"]`)).toContainText('head 2');
  });
  await scenario('Evaluate B pins the selected Profile as the candidate against a static reference', async () => {
    await page.locator('#evo-bot-a').selectOption('tempo');
    await page.locator('#evo-bot-b').selectOption(a);
    await page.locator('#evo-eval-games').fill('2');
    const beforeEvaluation = await call('profileView', first.agentProfileId);
    await page.locator('#evo-evaluate-b').click();
    const { payload: run } = await complete();
    assert.equal(run.kind, 'EVALUATION');
    assert.equal(run.checkpoints[0].checkpointId, beforeEvaluation.head.championCheckpointId);
    assert.equal(run.arenaProfiles.snapshots[0].profile.headVersion, 2);
    assert.equal(run.arenaProfiles.snapshots[1], null);
    assert.deepEqual(await call('profileView', first.agentProfileId), beforeEvaluation);
    return { games: run.records.length, kind: run.kind };
  });
  await scenario('a missing Profile selection rejects start with no baseline fallback', async () => {
    await reset();
    // Inject a stale UI choice only; this is failure-path testing, not game evidence.
    await page.locator('#evo-bot-a').evaluate(select => {
      select.add(new Option('Missing Custom Profile', 'agent-profile:AP-missing', false, true));
    });
    await page.locator('#evo-run').click();
    await expect(page.locator('#evo-error')).toContainText('PROFILE_NOT_FOUND');
    await expect(page.locator('#evo-state')).toHaveText('IDLE');
  });
  assert.deepEqual(report.pageErrors, []);
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve));
}
