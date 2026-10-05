/* global window, Event */
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'apps/lab-web/dist');
const output = path.join(root, 'reports/local/batch-matrix');
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
const context = await browser.newContext({ viewport: { width: 1600, height: 1200 }, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const report = { startedAt: new Date().toISOString(), browser: browser.version(), scope: 'Local Chromium, real engine execution, disposable native IndexedDB', scenarios: [], pageErrors: [] };
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
async function lab() { await page.locator('.evo-navigation [data-evo-surface="arena"]').click(); }
const matrixStatus = () => page.locator('#evo-batch-status');
async function selectParticipants(...ids) {
  await page.locator('#evo-batch-clear').click();
  for (const id of ids) await page.locator(`input[data-bm-select="${id}"]`).check();
}
async function exportedMatrix() {
  const promise = page.waitForEvent('download');
  await page.locator('#evo-batch-export').click();
  const download = await promise;
  return JSON.parse(await readFile(await download.path(), 'utf8'));
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/#/evolution`);
  await install();
  const first = await call('createProfile', { commandId: 'matrix-first', displayName: 'GRAVE MAW', traits: { scoringDrive: 30, guard: 20 } });
  const second = await call('createProfile', { commandId: 'matrix-second', displayName: 'SECOND PROFILE', traits: { scoringDrive: 90, guard: 5 } });
  const third = await call('createProfile', { commandId: 'matrix-third', displayName: 'TEMPO GOBLIN', traits: { scoringDrive: 60, guard: 10 } });
  const p1 = `profile:${first.agentProfileId}`, p2 = `profile:${second.agentProfileId}`, p3 = `profile:${third.agentProfileId}`;
  await scenario('roster lists Custom Profiles and static policies with preflight blockers', async () => {
    await lab();
    await page.locator('#evo-profiles-refresh').click();
    await expect(page.locator('input[data-bm-select^="profile:"]')).toHaveCount(3);
    await expect(page.locator('input[data-bm-select^="static:"]')).toHaveCount(10);
    await expect(matrixStatus()).toContainText('Not run');
    await expect(page.locator('#evo-batch-start')).toBeDisabled();
    await page.screenshot({ path: path.join(output, 'batch-roster.png'), fullPage: true });
    return { profiles: 3, statics: 10 };
  });
  await scenario('select-all above the cap is rejected and 3 participants plan 3 matchups', async () => {
    await page.locator('#evo-batch-select-all').click();
    await expect(page.locator('.bm-preflight')).toContainText('At most 8 participants');
    await selectParticipants(p1, p2, 'static:control');
    await page.locator('#evo-batch-games').evaluate(el => { el.value = '4'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    const preflight = page.locator('[data-testid="evo-batch-preflight"]');
    await expect(preflight).toContainText('Participants 3');
    await expect(preflight).toContainText('Unique matchups 3');
    await expect(preflight).toContainText('Total games 12');
    await expect(preflight).toContainText('Balanced AB/BA');
    await expect(page.locator('#evo-batch-start')).toBeEnabled();
    return { participants: 3, matchups: 3, totalGames: 12 };
  });
  await scenario('Profile + static matrix executes real paired games and renders cells and leaderboard', async () => {
    await page.locator('#evo-batch-start').click();
    await expect(matrixStatus()).toContainText('COMPLETE', { timeout: 180000 });
    await expect(page.locator('button.bm-cell[data-bm-cell]')).toHaveCount(6);
    await expect(page.locator('.bm-board tbody tr')).toHaveCount(3);
    const envelope = await exportedMatrix();
    assert.equal(envelope.format, 'intrilex-matchup-lab');
    assert.equal(envelope.schemaVersion, 2);
    assert.equal(envelope.payload.status, 'COMPLETE');
    assert.equal(envelope.payload.runs.length, 3);
    for (const run of envelope.payload.runs) {
      assert.equal(run.records.length, 4);
      assert.equal(run.records.filter(r => r.swapped).length, 2, 'balanced AB/BA seats');
      assert.ok(run.records.every(r => r.terminationReason !== 'POLICY_ERROR' && r.terminationReason !== 'ENGINE_REJECTION'));
    }
    const profileRuns = envelope.payload.runs.filter(r => r.arenaProfiles?.snapshots?.some(s => s?.profile.agentProfileId === first.agentProfileId));
    assert.equal(profileRuns.length, 2, 'frozen Profile appears in exactly its two matchups');
    await page.screenshot({ path: path.join(output, 'batch-complete.png'), fullPage: true });
    return { runs: 3, records: envelope.payload.runs.reduce((n, r) => n + r.records.length, 0) };
  });
  await scenario('matrix cell drill-down exposes per-matchup evidence and series link', async () => {
    await page.locator('button.bm-cell').first().click();
    const detail = page.locator('[data-testid="evo-batch-detail"]');
    await expect(detail).toContainText('clean');
    await expect(detail).toContainText('AB:');
    await expect(detail).toContainText('BA:');
    await expect(detail.locator('code')).toContainText('EL-');
    return true;
  });
  const before = await call('profileView', first.agentProfileId);
  await scenario('stop preserves completed cells and resume completes under frozen heads after a head change', async () => {
    await selectParticipants(p1, p3, 'static:tempo');
    await page.locator('#evo-batch-games').evaluate(el => { el.value = '20'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.locator('#evo-batch-start').click();
    await expect(matrixStatus()).toContainText('matchups complete', { timeout: 60000 });
    const head = await call('getHead', first.agentProfileId);
    const draft = await call('saveDraftRevision', { agentProfileId: first.agentProfileId, baseRevisionId: head.activeRevisionId, sourceCheckpointId: head.championCheckpointId, traits: { scoringDrive: 10 } });
    await call('activateAuthoredRevision', { commandId: 'move-mid-matrix', agentProfileId: first.agentProfileId, expectedHead: head, revisionId: draft.revision.id });
    await page.locator('#evo-batch-stop').click();
    await expect(matrixStatus()).toContainText('STOPPED', { timeout: 120000 });
    await page.locator('#evo-batch-resume').click();
    await expect(matrixStatus()).toContainText('COMPLETE', { timeout: 300000 });
    const envelope = await exportedMatrix();
    assert.equal(envelope.payload.status, 'COMPLETE');
    const profileCells = envelope.payload.runs.filter(r => r.arenaProfiles?.snapshots?.some(s => s?.profile.agentProfileId === first.agentProfileId));
    assert.ok(profileCells.length >= 1);
    for (const run of profileCells) {
      const snapshot = run.arenaProfiles.snapshots.find(s => s?.profile.agentProfileId === first.agentProfileId);
      assert.equal(snapshot.profile.headVersion, head.headVersion, 'matrix stayed on the frozen head');
    }
    const seen = envelope.payload.runs.flatMap(r => r.records.map(x => `${r.runId}:${x.ordinal}`));
    assert.equal(new Set(seen).size, seen.length, 'no ordinal duplicated across resume');
    return { headVersion: head.headVersion, runs: envelope.payload.runs.length };
  });
  await scenario('saved manifest survives reload, inspects and blocks re-resume of a COMPLETE matrix', async () => {
    await page.reload();
    await install();
    await lab();
    await page.locator('#evo-profiles-refresh').click();
    await expect(page.locator('.bm-saved summary')).toContainText('Saved matrices', { timeout: 30000 });
    await page.locator('.bm-saved summary').click();
    const rows = page.locator('[data-bm-load]');
    await expect(rows.first()).toBeVisible();
    const completeRow = page.locator('.evo-replay-row', { hasText: 'COMPLETE' }).first();
    await completeRow.locator('[data-bm-load]').click();
    await expect(page.locator('button.bm-cell[data-bm-cell]')).toHaveCount(6);
    await expect(completeRow.locator('[data-bm-resume]')).toBeDisabled();
    return true;
  });
  await scenario('evaluation-only boundary holds: matrix writes no Profile science state', async () => {
    const after = await call('profileView', first.agentProfileId);
    assert.equal(after.head.headVersion, before.head.headVersion + 1, 'only the explicit authored command moved the head');
    assert.equal((await call('getHead', third.agentProfileId)).headVersion, 1);
    return true;
  });
  assert.deepEqual(report.pageErrors, []);
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve));
}
