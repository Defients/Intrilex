/* global window, document, indexedDB, DOMException */
// Chromium acceptance against the built application and native IndexedDB.
// Synthetic selection/challenge outcomes are confined to a disposable browser
// context, carry immutable fixture labels, and are reported as mechanics only.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { identity, fixtureSeries, fixtureChallenge } from '../test/fixtures/agent-profile-fixtures.mjs';
import { createTrainingProject } from '../packages/simulation-runtime/src/evolution-training.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'apps/lab-web/dist');
const output = path.join(root, 'reports/local/agent-profiles/browser');
await mkdir(output, { recursive: true });
const appSource = await readFile(path.join(dist, 'play/play-app.js'), 'utf8');
const suffix = appSource.match(/play-state\.js(\?v=[\w]+)/)?.[1] ?? '';
const html = await readFile(path.join(dist, 'index.html'), 'utf8');
const entry = html.match(/type="module" src="([^"]+)"/)[1];
const entrySource = await readFile(path.join(dist, entry), 'utf8');
const playModuleUrl = '/' + (entrySource.match(/import\("\.\/(chunk-play-app-[^"]+)"\)/)?.[1] ?? `play/play-app.js${suffix}`);
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const target = path.resolve(dist, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
    if (!target.startsWith(`${dist}${path.sep}`)) { res.writeHead(403).end(); return; }
    const data = await readFile(target);
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webp': 'image/webp' }[path.extname(target)] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime }); res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu'] });
const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
const diagnostics = [];
const report = { startedAt: new Date().toISOString(), browser: await browser.version(), implementationFingerprint: identity.fingerprint, scope: 'Local Chromium; disposable native IndexedDB; no remote/deployment claims', scenarios: [], errors, diagnostics };
context.on('page', p => p.on('pageerror', error => errors.push(error.message)));
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (['warning', 'error'].includes(message.type())) diagnostics.push(message.text().slice(0, 600)); });
page.on('requestfailed', request => diagnostics.push(`${request.url()}: ${request.failure()?.errorText}`));
page.setDefaultTimeout(30000);
async function scenario(number, name, evidence, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    report.scenarios.push({ number, name, evidence, status: 'PASS', durationMs: Date.now() - started, detail });
    console.log(`PASS ${number}: ${name} (${evidence})`);
  } catch (error) {
    report.scenarios.push({ number, name, evidence, status: 'FAIL', error: error.stack });
    throw error;
  }
}
async function install(p = page, name = 'intrilex-agent-profiles') {
  await p.evaluate(async ({ suffix, name }) => {
    const [storage, science, contracts, runner, runtime] = await Promise.all([
      import(`/evolution/profile-store.mjs${suffix}`), import(`/evolution/profile-science.mjs${suffix}`),
      import(`/evolution/profile-contracts.mjs${suffix}`), import(`/evolution/evolution-browser-runner.mjs${suffix}`), import(`/evolution/identity.mjs${suffix}`),
    ]);
    const store = new storage.ProfileStore(new storage.IndexedDbBackend({ name }), { identity: runtime.LAB_IDENTITY });
    window.__ap = { storage, science, contracts, runner, identity: runtime.LAB_IDENTITY, store, name };
  }, { suffix, name });
  assert.equal(await p.evaluate(() => window.__ap.identity.fingerprint), identity.fingerprint);
}
const call = (method, ...args) => page.evaluate(({ method, args }) => window.__ap.store[method](...args), { method, args });
const proxy = new Proxy({ identity }, { get: (target, key) => key in target ? target[key] : (...args) => call(key, ...args) });
async function science(method, args, p = page) {
  return p.evaluate(({ method, args }) => window.__ap.science[method]({ store: window.__ap.store, executeSeries: window.__ap.runner.executeBrowserSeries, workerCount: 4, ...args }), { method, args });
}
async function errorCode(promise) { try { await promise; return 'NO_ERROR'; } catch (error) { return error.message; } }
async function selectProfile(id, tab = 'overview') {
  await page.goto(`${base}/#/evolution?view=profiles`);
  // Explicit reload also refreshes rosters after another connection wrote.
  await page.reload();
  await expect(page.locator(`[data-ap-select="${id}"]`)).toBeVisible();
  await page.locator(`[data-ap-select="${id}"]`).click();
  await expect(page.locator(`#ap-tab-${tab}`)).toBeVisible();
  await page.locator(`#ap-tab-${tab}`).click();
  await install();
}
async function readDb(p = page) {
  return p.evaluate(() => window.__ap.store.backend.transaction(['profiles', 'heads', 'events', 'artifacts', 'checkpoints', 'receipts', 'operations', 'traces'], 'readonly', function* () {
    const result = {};
    for (const name of ['profiles', 'heads', 'events', 'artifacts', 'checkpoints', 'receipts', 'operations', 'traces']) result[name] = yield { op: 'all', store: name };
    return result;
  }));
}
let profileId, initialHead, realSeries, realHeldOut, mechanicsId, mechanicsDecision, promoted, raceId, raceCreated, raceChallenge, forkId, pinned, beforeExperience;
try {
  await page.goto(`${base}/#/evolution?view=profiles`);
  await expect(page.locator('#evo-page-profiles')).toBeVisible();
  await install();
  await scenario(1, 'Custom GRAVE MAW creation, compiler, unevaluated Champion, keyboard tabs', 'UI + native storage', async () => {
    await page.locator('#ap-create-name').fill('GRAVE MAW');
    await page.locator('[data-ap-create-trait="scoringDrive"]').fill('30');
    await page.locator('[data-ap-create-trait="guard"]').fill('20');
    await page.locator('#ap-create-rules').selectOption('core-advanced-authority');
    assert.equal(await page.locator('#ap-create-template').inputValue(), '');
    await page.locator('#ap-create-form button[type="submit"]').click();
    await expect(page.locator('#ap-notice')).toContainText('unevaluated initial Champion');
    const profiles = await call('listProfiles'); profileId = profiles[0].agentProfileId;
    const view = await call('profileView', profileId); initialHead = view.head;
    assert.deepEqual(view.checkpoints[0].policyState.weights, { points: 600, resource: 0, tempo: 0, defense: 400, synergy: 0, risk: 0 });
    assert.equal(view.events[0].evidenceStatus, 'UNEVALUATED');
    assert.doesNotMatch(JSON.stringify(view.profile), /archetype/i);
    await page.locator('#ap-tab-overview').focus(); await page.keyboard.press('ArrowRight');
    await expect(page.locator('#ap-tab-learn')).toBeFocused();
    await page.keyboard.press('End'); await expect(page.locator('#ap-tab-tune')).toBeFocused();
    await page.keyboard.press('Home'); await expect(page.locator('#ap-tab-overview')).toBeFocused();
    return { profileId, headVersion: initialHead.headVersion };
  });
  await scenario(2, 'Series freezes exact head and submitted configuration before execution', 'UI + real simulation', async () => {
    await page.locator('#ap-tab-learn').click();
    for (const [selector, value] of [['#ap-s-generations', '1'], ['#ap-s-candidates', '1'], ['#ap-s-step', '250'], ['#ap-s-pairs', '1']]) await page.locator(selector).fill(value);
    await page.locator('#ap-s-workers').selectOption('1');
    await page.locator('#ap-series-form button[type="submit"]').click();
    await expect.poll(async () => (await call('listArtifacts', profileId, 'SERIES_MANIFEST')).length).toBe(1);
    [realSeries] = await call('listArtifacts', profileId, 'SERIES_MANIFEST');
    assert.deepEqual(realSeries.body.headToken, initialHead);
    assert.equal(realSeries.body.sourceCheckpointId, initialHead.championCheckpointId);
    assert.equal(realSeries.body.revisionId, initialHead.activeRevisionId);
    assert.equal(realSeries.body.optimizer.config.generations, 1);
    assert.equal((await call('getArtifact', realSeries.body.trainingPackId)).body.pairCount, 1);
    assert.equal(realSeries.body.optimizer.config.mutationStep, 250);
    assert.equal((await call('getArtifact', realSeries.body.trainingPackId)).body.purpose, 'TRAINING');
    return { seriesId: realSeries.id, config: realSeries.body.optimizer.config };
  });
  await scenario(3, 'Real candidates, committed TRAINING selection and truthful nomination/no-change', 'UI + real simulation', async () => {
    await expect(page.locator('#ap-notice')).toContainText('Series finished.', { timeout: 180000 });
    const selections = await call('listArtifacts', profileId, 'GENERATION_SELECTION');
    const outcomes = await call('listArtifacts', profileId, 'SERIES_OUTCOME');
    assert.equal(selections.length, 1); assert.equal(selections[0].body.candidates.length, 2);
    assert.equal(outcomes.length, 1);
    const measurements = await call('listArtifacts', profileId, 'MEASUREMENT_RESULT');
    assert.ok(measurements.length >= 2);
    assert.ok(measurements.every(m => !m.body.fixture && m.body.purpose === 'TRAINING'));
    assert.deepEqual(await call('getHead', profileId), initialHead);
    return { status: outcomes[0].body.status, nominationCount: (await call('listArtifacts', profileId, 'CHALLENGER_NOMINATION')).length, measuredGames: measurements.flatMap(m => m.body.matchups).reduce((sum, m) => sum + m.metrics.games, 0) };
  });
  await scenario(4, 'Held-out measures without altering selection; real challenge if nominated', 'real simulation', async () => {
    const selections = await call('listArtifacts', profileId, 'GENERATION_SELECTION');
    const nominations = await call('listArtifacts', profileId, 'CHALLENGER_NOMINATION');
    const manifest = await science('prepareHeldOut', { agentProfileId: profileId, checkpointId: selections[0].body.selectedCheckpointId, commandId: 'real-heldout', pairs: 1 });
    realHeldOut = await science('runPlannedMeasurement', { manifestId: manifest.id });
    realHeldOut = await call('getArtifact', realHeldOut.id);
    assert.deepEqual(await call('listArtifacts', profileId, 'GENERATION_SELECTION'), selections);
    assert.deepEqual(await call('listArtifacts', profileId, 'CHALLENGER_NOMINATION'), nominations);
    assert.equal(realHeldOut.body.purpose, 'HELD_OUT_EVALUATION');
    let decision = null;
    if (nominations.length) {
      const challenge = await science('prepareChallenge', { agentProfileId: profileId, nominationId: nominations[0].id, commandId: 'real-challenge' });
      const result = await science('runChallenge', { challengeId: challenge.id });
      decision = result.body.decision;
      if (decision === 'APPROVE') await science('promoteChallenger', { agentProfileId: profileId, decisionId: result.id, commandId: 'real-promotion' });
    }
    assert.deepEqual(await call('listArtifacts', profileId, 'GENERATION_SELECTION'), selections);
    return { heldOutId: realHeldOut.id, realChallengeDecision: decision ?? 'NOT_APPLICABLE: parent retained' };
  });
  await scenario(5, 'Qualified promotion commits record, event, Journal, receipt atomically; retry is idempotent', 'LABELED_FIXTURE: mechanics, no strength claim', async () => {
    const created = await call('createProfile', { commandId: 'fixture-profile', displayName: '[FIXTURE ONLY] Promotion', traits: { guard: 20 } });
    mechanicsId = created.agentProfileId;
    const training = await fixtureSeries({ store: proxy, agentProfileId: mechanicsId, commandId: 'fixture-series' });
    const challenge = await fixtureChallenge({ store: proxy, agentProfileId: mechanicsId, nominationId: training.nomination.id, commandId: 'fixture-challenge' });
    mechanicsDecision = challenge.decision.id;
    assert.equal(challenge.challengerMeasurement.body.fixture, 'LABELED_FIXTURE_NOT_SIMULATION');
    await selectProfile(mechanicsId, 'learn');
    await page.locator(`[data-ap-promote="${mechanicsDecision}"]`).click();
    await expect(page.locator('#ap-notice')).toContainText('Promotion committed atomically');
    promoted = await call('getHead', mechanicsId);
    assert.equal(promoted.headVersion, 2);
    const db = await readDb(), event = db.events.find(e => e.transitionId === promoted.lastTransitionId);
    assert.equal(event.type, 'PROMOTED');
    assert.ok(db.artifacts.some(a => a.id === event.journalId));
    assert.ok(db.artifacts.some(a => a.kind === 'PROMOTION_RECORD' && a.body.transitionId === event.transitionId));
    const receipt = db.receipts.find(r => r.result?.transitionId === event.transitionId);
    assert.ok(receipt, 'transaction receipt');
    const again = await science('promoteChallenger', { agentProfileId: mechanicsId, decisionId: mechanicsDecision, commandId: receipt.commandId });
    assert.equal(again.replayed, true); assert.equal((await call('listEvents', mechanicsId)).length, 2);
  });
  await scenario(6, 'Reload preserves active head, immutable history and journal', 'UI + native storage', async () => {
    const before = await call('profileView', mechanicsId);
    await page.reload(); await install(); await selectProfile(mechanicsId, 'analyze');
    assert.deepEqual(await call('profileView', mechanicsId), before);
    await expect(page.locator('#evo-page-profiles')).toContainText('PROMOTED');
    await page.locator('[data-ap-journal]').last().click();
    await expect(page.locator('#ap-journal-title')).toBeVisible();
  });
  await scenario(7, 'Series 2 starts from resulting Champion and keeps historical objective instance', 'native storage; prior promotion is fixture', async () => {
    const old = (await call('listArtifacts', mechanicsId, 'SERIES_MANIFEST'))[0];
    const next = await science('startSeries', { agentProfileId: mechanicsId, commandId: 'fixture-next-series', overrides: { generations: 1, candidates: 1, trainingPairs: 1 } });
    assert.equal(next.body.sourceCheckpointId, promoted.championCheckpointId);
    assert.deepEqual(next.body.headToken, promoted);
    assert.notEqual(next.body.sourceCheckpointId, old.body.sourceCheckpointId);
    assert.deepEqual(await call('getArtifact', old.id), old);
  });
  await scenario(8, 'Two independent browser connections racing promotions yield one winner and one stale rejection', 'LABELED_FIXTURE + actual cross-page IndexedDB race', async () => {
    raceCreated = await call('createProfile', { commandId: 'race-profile', displayName: '[FIXTURE ONLY] Race' }); raceId = raceCreated.agentProfileId;
    const a = await fixtureSeries({ store: proxy, agentProfileId: raceId, commandId: 'race-a' });
    const b = await fixtureSeries({ store: proxy, agentProfileId: raceId, commandId: 'race-b' });
    const ca = await fixtureChallenge({ store: proxy, agentProfileId: raceId, nominationId: a.nomination.id, commandId: 'race-ca' });
    const cb = await fixtureChallenge({ store: proxy, agentProfileId: raceId, nominationId: b.nomination.id, commandId: 'race-cb' });
    const other = await context.newPage(); await other.goto(base); await install(other);
    const results = await Promise.allSettled([
      science('promoteChallenger', { agentProfileId: raceId, decisionId: ca.decision.id, commandId: 'race-pa' }),
      science('promoteChallenger', { agentProfileId: raceId, decisionId: cb.decision.id, commandId: 'race-pb' }, other),
    ]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.match(results.find(r => r.status === 'rejected').reason.message, /STALE_HEAD/);
    assert.equal((await call('listEvents', raceId)).length, 2);
    raceChallenge = results[0].status === 'fulfilled' ? cb : ca;
    await other.close();
  });
  await scenario(9, 'A to B to A keeps old authorization stale despite equal checkpoint IDs', 'LABELED_FIXTURE + native storage', async () => {
    const head = await call('getHead', raceId);
    const rolled = await call('rollback', { commandId: 'race-rollback', agentProfileId: raceId, expectedHead: head, targetSequence: 1, reason: 'Acceptance rollback' });
    assert.equal(rolled.head.championCheckpointId, raceCreated.head.championCheckpointId);
    assert.equal(rolled.head.headVersion, 3);
    assert.match(await errorCode(science('promoteChallenger', { agentProfileId: raceId, decisionId: raceChallenge.decision.id, commandId: 'race-stale' })), /STALE_HEAD/);
  });
  await scenario(10, 'Fork, semantic trait delta, draft isolation, explicit authored activation', 'UI + native storage', async () => {
    const original = await call('profileView', profileId);
    await selectProfile(profileId);
    await page.locator('#ap-fork-name').fill('GRAVE MAW — authored fork');
    await page.locator('[data-ap-action="fork"]').click();
    await expect(page.locator('#ap-notice')).toContainText('Fork created');
    forkId = (await call('listProfiles')).find(p => p.displayName === 'GRAVE MAW — authored fork').agentProfileId;
    const before = await call('getHead', forkId);
    await page.locator('[data-ap-trait="scoringDrive"]').fill('-20');
    await page.locator('#ap-draft-form button[type="submit"]').click();
    await expect(page.locator('#ap-notice')).toContainText('Draft saved');
    assert.deepEqual(await call('getHead', forkId), before);
    await expect(page.locator('#evo-page-profiles')).toContainText('points');
    await page.locator('[data-ap-activate]').click();
    await expect(page.locator('#ap-notice')).toContainText('Authored revision activated');
    const view = await call('profileView', forkId);
    assert.equal(view.events.at(-1).type, 'AUTHORED_REVISION_ACTIVATED');
    assert.equal((await call('getCheckpoint', view.head.championCheckpointId)).mutation.kind, 'PROFILE_AUTHORED_EDIT_V1');
    assert.deepEqual(await call('profileView', profileId), original);
  });
  await scenario(11, 'Actual play route pins checkpoint across head change; save/restore keeps it', 'UI consumer + native storage', async () => {
    await page.goto(`${base}/#/play/agent/${profileId}`);
    await expect.poll(() => page.evaluate(async url => !!(await import(url)).getSession(), playModuleUrl)).toBe(true);
    await install();
    pinned = await page.evaluate(async url => (await import(url)).getSession()._agent, playModuleUrl);
    const head = await call('getHead', profileId);
    const draft = await call('saveDraftRevision', { agentProfileId: profileId, baseRevisionId: head.activeRevisionId, traits: { guard: 10 }, sourceCheckpointId: head.championCheckpointId });
    const activated = await call('activateAuthoredRevision', { commandId: 'mid-play-edit', agentProfileId: profileId, expectedHead: head, revisionId: draft.revision.id });
    assert.notEqual(activated.head.championCheckpointId, pinned.checkpointId);
    const result = await page.evaluate(async ({ suffix, playModuleUrl }) => {
      const app = await import(playModuleUrl), controller = await import(`/play/play-controller.js${suffix}`);
      const session = app.getSession(), save = session.getSaveEnvelope(), restored = await controller.restoreSession(structuredClone(save));
      return { running: session._agent.checkpointId, restored: restored._agent.checkpointId, digest: save.setup.agentSnapshot.snapshotDigest };
    }, { suffix, playModuleUrl });
    assert.equal(result.running, pinned.checkpointId); assert.equal(result.restored, pinned.checkpointId); assert.equal(result.digest, pinned.snapshotDigest);
    beforeExperience = await call('profileView', profileId);
  });
  await scenario(12, 'Terminal Experience notice, observational record, Analyze count; no scientific mutation', 'actual local play; real legal engine actions', async () => {
    const terminal = await page.evaluate(async playModuleUrl => {
      const app = await import(playModuleUrl);
      // Drive the admitted production session through legal decisions, then ask
      // its production route renderer to render terminal state and record Experience.
      const session = app.getSession();
      let limit = 6000;
      while (!['TERMINAL', 'ERROR'].includes(session.status) && limit-- > 0) {
        if (session.status === 'HUMAN_DECISION') {
          const s = session.getSnapshot();
          const result = await session.submitHumanAction({ sessionId: s.sessionId, stateRevision: s.decision.stateRevision, decisionFrameHash: s.decision.frameHash, actionId: s.decision.legalActions[0].actionId });
          if (!result.accepted) throw new Error(result.message);
        } else if (session.status === 'AI_DECISION') await session.stepAI();
        else throw new Error(`Unexpected play status ${session.status}`);
      }
      await app.handlePlayRoute('/play/match', document.getElementById('play-root'));
      return { status: session.status, checkpointId: session._agent.checkpointId, sessionId: session.sessionId, error: session.error?.message };
    }, playModuleUrl);
    assert.equal(terminal.status, 'TERMINAL', terminal.error);
    await expect(page.getByTestId('agent-experience-notice')).toContainText('Encounter recorded', { timeout: 30000 });
    const after = await call('profileView', profileId);
    assert.deepEqual(after.head, beforeExperience.head); assert.deepEqual(after.checkpoints, beforeExperience.checkpoints); assert.deepEqual(after.events, beforeExperience.events);
    assert.deepEqual(after.artifacts.filter(a => a.kind !== 'EXPERIENCE_RECORD'), beforeExperience.artifacts);
    const experience = after.artifacts.filter(a => a.kind === 'EXPERIENCE_RECORD'); assert.equal(experience.length, 1);
    assert.equal(experience[0].body.agent.checkpointId, pinned.checkpointId);
    await selectProfile(profileId, 'analyze');
    await expect(page.getByTestId('profile-experience')).toContainText('1 recorded encounters');
    return terminal;
  });
  await scenario(13, 'Historical rollback appends history, fresh head version and Journal', 'UI + native storage', async () => {
    const before = await call('profileView', profileId);
    await page.locator('#ap-rollback-reason').fill('Browser acceptance historical rollback');
    await page.locator('[data-ap-rollback="1"]').click();
    await expect(page.locator('#ap-notice')).toContainText('fresh head version');
    const after = await call('profileView', profileId);
    assert.equal(after.head.headVersion, before.head.headVersion + 1);
    assert.equal(after.head.championCheckpointId, initialHead.championCheckpointId);
    assert.deepEqual(after.events.slice(0, -1), before.events);
    assert.equal(after.events.at(-1).type, 'ROLLED_BACK');
    assert.ok(after.artifacts.some(a => a.id === after.events.at(-1).journalId));
  });
  await scenario(14, 'UI export, isolated import, exact hashes/history, repeat idempotency, conflict rejection', 'UI + native storage; exported promotion fixture remains labeled', async () => {
    await selectProfile(mechanicsId);
    const pending = page.waitForEvent('download'); await page.locator('[data-ap-action="export"]').click();
    const download = await pending, target = path.join(output, 'fixture-profile.profile.json'); await download.saveAs(target);
    const text = await readFile(target, 'utf8'), original = await call('profileView', mechanicsId);
    await page.evaluate(async ({ text, id }) => {
      const { storage, identity } = window.__ap;
      const imported = new storage.ProfileStore(new storage.IndexedDbBackend({ name: 'acceptance-import' }), { identity });
      window.__imported = imported;
      const first = await imported.importBundle(text), repeat = await imported.importBundle(text);
      if (first.idempotent || !repeat.idempotent) throw new Error('Import idempotency');
      if ((await imported.getHead(id)).agentProfileId !== id) throw new Error('Import identity');
    }, { text, id: mechanicsId });
    const imported = await page.evaluate(id => window.__imported.profileView(id), mechanicsId);
    assert.deepEqual(imported.head, original.head); assert.deepEqual(imported.events, original.events);
    for (const artifact of original.artifacts.filter(a => ['PROFILE_REVISION', 'SERIES_MANIFEST', 'PROMOTION_RECORD', 'LEARNING_JOURNAL'].includes(a.kind))) {
      const copy = imported.artifacts.find(a => a.id === artifact.id); assert.ok(copy); assert.equal(copy.digest, artifact.digest); assert.deepEqual(copy.body, artifact.body);
    }
    const code = await page.evaluate(async ({ text, id }) => {
      const store = window.__imported, head = await store.getHead(id);
      await store.rollback({ commandId: 'import-moved', agentProfileId: id, expectedHead: head, targetSequence: 1 });
      try { await store.importBundle(text); return 'NO_ERROR'; } catch (error) { return error.code; }
    }, { text, id: mechanicsId });
    assert.equal(code, 'PROFILE_HEAD_CONFLICT');
  });
  await scenario(15, 'Abort every promotion write; migration interruption, quota recovery, schema upgrade abort preserve evidence', 'LABELED_FIXTURE + native IndexedDB fault injection', async () => {
    const created = await call('createProfile', { commandId: 'fault-profile', displayName: '[FIXTURE ONLY] Abort' });
    const training = await fixtureSeries({ store: proxy, agentProfileId: created.agentProfileId, commandId: 'fault-series' });
    const challenge = await fixtureChallenge({ store: proxy, agentProfileId: created.agentProfileId, nominationId: training.nomination.id, commandId: 'fault-challenge' });
    const before = await readDb(); let writes = 0;
    for (let index = 0; index < 50; index++) {
      const result = await page.evaluate(async ({ index, id, decisionId }) => {
        const { storage, identity, science, name } = window.__ap;
        const store = new storage.ProfileStore(new storage.IndexedDbBackend({ name, onWrite({ index: writeIndex }) { if (writeIndex === index) throw new Error('INJECTED_WRITE_ABORT'); } }), { identity });
        try { await science.promoteChallenger({ store, agentProfileId: id, decisionId, commandId: 'fault-promotion' }); return 'COMMITTED'; }
        catch (error) { return error.message; } finally { store.backend.close(); }
      }, { index, id: created.agentProfileId, decisionId: challenge.decision.id });
      if (result === 'COMMITTED') { writes = index; break; }
      assert.match(result, /INJECTED_WRITE_ABORT/); assert.deepEqual(await readDb(), before, `Abort at write ${index} must preserve entire database`);
    }
    assert.ok(writes > 0 && writes < 50);
    const v1 = createTrainingProject({ identity, training: { generations: 1, candidates: 1, trainingPairs: 1, evaluationPairs: 1 } }).checkpoints[0];
    const input = { commandId: 'migration-acceptance', displayName: 'Linked V1 mind', checkpoint: v1 };
    const prior = await readDb();
    const failure = await page.evaluate(async input => {
      const { storage, identity, name } = window.__ap;
      const store = new storage.ProfileStore(new storage.IndexedDbBackend({ name, onWrite() { throw new DOMException('Injected quota failure', 'QuotaExceededError'); } }), { identity });
      try { await store.linkV1Checkpoint(input); return 'NO_ERROR'; } catch (error) { return error.code; } finally { store.backend.close(); }
    }, input);
    assert.equal(failure, 'PROFILE_STORAGE_QUOTA_EXCEEDED'); assert.deepEqual(await readDb(), prior);
    const linked = await call('linkV1Checkpoint', input); assert.deepEqual(await call('getCheckpoint', linked.head.championCheckpointId), v1);
    assert.equal((await call('linkV1Checkpoint', input)).replayed, true);
    const upgrade = await page.evaluate(async () => {
      const imported = window.__imported, before = await imported.listProfiles(); imported.backend.close();
      await new Promise(resolve => { const request = indexedDB.open('acceptance-import', 2); request.onupgradeneeded = () => { request.result.createObjectStore('incomplete-upgrade'); request.transaction.abort(); }; request.onerror = event => { event.preventDefault(); resolve(); }; request.onsuccess = () => { request.result.close(); throw new Error('Upgrade unexpectedly committed'); }; });
      const after = await imported.listProfiles(); const db = await imported.backend.open();
      return { before, after, version: db.version, partialStore: db.objectStoreNames.contains('incomplete-upgrade') };
    });
    assert.deepEqual(upgrade.after, upgrade.before); assert.equal(upgrade.version, 1); assert.equal(upgrade.partialStore, false);
    const superseded = await page.evaluate(async () => {
      const store = window.__imported;
      await new Promise((resolve, reject) => { const request = indexedDB.open('acceptance-import', 2); request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => reject(request.error); });
      try { await store.listProfiles(); return 'NO_ERROR'; } catch (error) { return error.code; }
    });
    assert.equal(superseded, 'PROFILE_STORAGE_SUPERSEDED', 'An old client must stop after versionchange');
    return { promotionWriteBoundariesAborted: writes, migrationRecovery: 'PASS', upgradeAbortRecovery: 'PASS' };
  });
  await scenario(16, 'Incompatible real eras show no delta; append common-era remeasurement and compare', 'UI + real simulation', async () => {
    const head = await call('getHead', profileId);
    const oldSeries = await call('getArtifact', realSeries.id);
    const draft = await call('saveDraftRevision', { agentProfileId: profileId, baseRevisionId: head.activeRevisionId, traits: { scoringDrive: 10, guard: 20 }, rulesProfileId: 'core-unrestricted-authority', sourceCheckpointId: head.championCheckpointId });
    await call('activateAuthoredRevision', { commandId: 'objective-era-edit', agentProfileId: profileId, expectedHead: head, revisionId: draft.revision.id });
    const nextSeries = await science('startSeries', { agentProfileId: profileId, commandId: 'objective-era-series', overrides: { generations: 1, candidates: 1, trainingPairs: 1 } });
    assert.notEqual(nextSeries.body.objectiveInstanceId, oldSeries.body.objectiveInstanceId);
    assert.deepEqual(await call('getArtifact', realSeries.id), oldSeries);
    const first = await science('prepareHeldOut', { agentProfileId: profileId, checkpointId: nextSeries.body.sourceCheckpointId, commandId: 'common-era', pairs: 1 });
    const newMeasurement = await science('runPlannedMeasurement', { manifestId: first.id });
    const second = await page.evaluate(async ({ first, checkpointId, id }) => {
      const { science, store } = window.__ap;
      const pack = await store.getArtifact(first.body.packId), era = await store.getArtifact(first.body.eraId);
      const manifest = science.measurementManifest({ agentProfileId: id, purpose: 'HELD_OUT_EVALUATION', producer: { kind: 'HELD_OUT', requestId: 'common-era-bridge' }, subjectCheckpointId: checkpointId, pack, era });
      await store.storeArtifacts({ artifacts: [manifest] }); return manifest;
    }, { first, checkpointId: realHeldOut.body.subjectCheckpointId, id: profileId });
    const bridged = await science('runPlannedMeasurement', { manifestId: second.id });
    const compatibility = await page.evaluate(({ old, current, bridged }) => ({ incompatible: window.__ap.contracts.canCompareMeasurements(old, current), common: window.__ap.contracts.canCompareMeasurements(current, bridged) }), { old: realHeldOut, current: newMeasurement, bridged });
    assert.equal(compatibility.incompatible.ok, false); assert.ok(compatibility.incompatible.reasons.includes('EVALUATION_ERA_MISMATCH')); assert.equal(compatibility.common.ok, true);
    assert.deepEqual(await call('getArtifact', realHeldOut.id), realHeldOut);
    await selectProfile(profileId, 'analyze');
    await page.locator('[data-ap-compare="0"]').selectOption(realHeldOut.id);
    await page.locator('[data-ap-compare="1"]').selectOption(newMeasurement.id);
    await expect(page.locator('#evo-page-profiles')).toContainText('EVALUATION_ERA_MISMATCH');
    await page.locator('[data-ap-compare="0"]').selectOption(bridged.id);
    await expect(page.locator('#evo-page-profiles')).toContainText('Compatible paired comparison');
    await page.screenshot({ path: path.join(output, 'desktop-analyze.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'mobile-analyze.png'), fullPage: true });
    await page.locator('#ap-tab-analyze').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'mobile-workspace.png'), fullPage: false });
    return { historicalMeasurement: realHeldOut.id, currentMeasurement: newMeasurement.id, commonEraMeasurement: bridged.id };
  });
  await scenario(17, 'UI held-out budget and complete fixed-budget challenge runner', 'real simulation on a fixed LABELED_FIXTURE nominee; no learned-strength claim', async () => {
    await page.setViewportSize({ width: 1600, height: 1100 });
    const created = await call('createProfile', { commandId: 'real-challenge-runner-profile', displayName: '[FIXTURE ONLY] Real challenge runner' });
    const training = await fixtureSeries({ store: proxy, agentProfileId: created.agentProfileId, commandId: 'real-challenge-runner-training' });
    const before = await call('getHead', created.agentProfileId);
    await selectProfile(created.agentProfileId, 'learn');
    await page.locator(`[id="ap-heldout-pairs-${training.nomination.id}"]`).fill('1');
    await page.locator(`[data-ap-heldout="${training.nomination.id}"]`).click();
    await expect(page.locator('#ap-notice')).toContainText('Held-out measurement finished.', { timeout: 180000 });
    const heldOut = (await call('listArtifacts', created.agentProfileId, 'MEASUREMENT_MANIFEST')).find(m => m.body.purpose === 'HELD_OUT_EVALUATION');
    assert.equal((await call('getArtifact', heldOut.body.packId)).body.pairCount, 1, 'Entered held-out budget survives progress redraw');
    await page.locator(`[data-ap-challenge="${training.nomination.id}"]`).click();
    let lastProgress = 0;
    await expect.poll(async () => {
      if (Date.now() - lastProgress > 15000) { console.log(`Challenge progress: ${await page.locator('#ap-progress').textContent()}`); lastProgress = Date.now(); }
      return (await call('listArtifacts', created.agentProfileId, 'CHALLENGE_DECISION')).length;
    }, { timeout: 600000, intervals: [1000, 2000, 5000] }).toBe(1);
    await expect(page.locator('#ap-notice')).toContainText('Promotion challenge finished.');
    const [decision] = await call('listArtifacts', created.agentProfileId, 'CHALLENGE_DECISION');
    const measurements = (await call('listArtifacts', created.agentProfileId, 'MEASUREMENT_RESULT')).filter(m => m.body.purpose === 'PROMOTION_CHALLENGE');
    assert.equal(measurements.length, 2); assert.ok(measurements.every(m => !m.body.fixture));
    const games = measurements.flatMap(m => m.body.matchups).reduce((sum, m) => sum + m.metrics.games, 0);
    assert.equal(games, 960);
    assert.ok(['APPROVE', 'REJECT', 'INCONCLUSIVE', 'INVALID'].includes(decision.body.decision));
    assert.deepEqual(await call('getHead', created.agentProfileId), before, 'Measuring a challenge never activates the nominee');
    assert.deepEqual((await call('listArtifacts', created.agentProfileId, 'GENERATION_SELECTION')).map(s => s.body), training.selections.map(s => s.body));
    return { decision: decision.body.decision, reasons: decision.body.reasons, realChallengeGames: games, nominationProvenance: 'LABELED_FIXTURE_NOT_SIMULATION' };
  });
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.error = error.stack; report.url = page.url();
  report.uiError = await page.locator('#ap-error').textContent().catch(() => null);
  report.experience = profileId ? await call('listArtifacts', profileId, 'EXPERIENCE_RECORD').catch(() => null) : null;
  await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
