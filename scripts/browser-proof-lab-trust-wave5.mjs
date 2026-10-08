import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { evolutionIdentity } from './evolution-identity.mjs';
import { captureProvenance } from './release-provenance.mjs';
import { memoryStore, createGraveMaw, fixtureSeries } from '../test/fixtures/agent-profile-fixtures.mjs';
/* global Worker, indexedDB */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'apps/lab-web/dist');
const source = (await readFile(path.join(root, 'apps/lab-web/src/experiments/experiment-controller.mjs'), 'utf8'))
  .replace(/import\s[^;]*?from\s*'[^']*';/gs, '').replace(/^export /gm, '');
const fixture = memoryStore(), created = await createGraveMaw(fixture, 'wave5-profile');
const nominated = await fixtureSeries({ store: fixture, agentProfileId: created.agentProfileId, commandId: 'wave5-series' });
const rows = Object.fromEntries([...fixture.backend.data].map(([name, table]) => [name, [...table.values()]]));
const report = { date: new Date().toISOString(), scope: 'isolated local browser', provenance: captureProvenance(root),
  identity: await evolutionIdentity(), scenarios: {}, pageErrors: [] };
const server = http.createServer(async (req, res) => {
  try {
    const name = new URL(req.url, 'http://localhost').pathname;
    if (name === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    if (name === '/proof.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>Wave 5 integrated trust proof</title>'); return; }
    const target = path.resolve(dist, '.' + decodeURIComponent(name));
    if (!target.startsWith(dist + path.sep)) throw new Error('OUTSIDE_ROOT');
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': /\.(mjs|js)$/.test(name) ? 'text/javascript' : 'application/json' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ channel: process.env.INTRILEX_BROWSER_CHANNEL || 'chrome', headless: true });
  report.browser = browser.version();
  const context = await browser.newContext();
  const pages = await Promise.all([context.newPage(), context.newPage()]);
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const page of pages) {
    page.on('pageerror', error => report.pageErrors.push(error.message));
    await page.goto(base + '/proof.html');
    await page.evaluate(async source => {
      const domain = await import('/evolution/experiment-domain.mjs');
      const portable = await import('/evolution/experiment-portability.mjs');
      const admission = await import('/evolution/evidence-admission.mjs');
      const { LAB_IDENTITY } = await import('/evolution/identity.mjs');
      const { ExperimentStore } = await import('/experiments/experiment-store.mjs');
      const { hashCanonical } = await import('/shared-browser.js');
      const store = new ExperimentStore(), state = { bootState: null, observatory: {}, aggregate: {}, evidenceBasis: null };
      const deps = { ...domain, ...portable, ...admission, LAB_IDENTITY, ExperimentStore, hashCanonical, state,
        console, structuredClone, TextEncoder, Worker, setTimeout: globalThis.setTimeout.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis),
        showToast() {}, updateRailContext() {}, rerender() {}, RULES_VERSION: '4.3.1', ENGINE_VERSION: '4.2.6', LAB_VERSION: '1.0.0' };
      const api = new Function('deps', 'with(deps){' + source + ';return {initExperiments,beginExperimentRun,commitExperimentBatch,finalizeExperimentRun,failExperimentRun,cancelExperimentRun,resumeExperimentRun,importRunArtifact,exportRunArtifactText,applySelection,setRunIncluded,isolateRun,getExperimentRuns};}')(deps);
      await api.initExperiments({ store });
      globalThis.proof = { api, store, state, domain, portable, admission, LAB_IDENTITY, hashCanonical,
        config: { matchCount: 2, workers: 1, profileId: 'core-advanced-authority', policyIds: ['control', 'tempo'], seed: 42 },
        match: config => new Promise((resolve, reject) => {
          const worker = new Worker('/worker.js', { type: 'module' });
          const timer = setTimeout(() => { worker.terminate(); reject(new Error('MATCH_PROOF_TIMEOUT')); }, 60000);
          worker.onerror = event => { clearTimeout(timer); worker.terminate(); reject(new Error(event.message)); };
          worker.onmessage = ({ data }) => { if (data.type !== 'autonomy-match-result') return; clearTimeout(timer); worker.terminate();
            if (data.ok) resolve(data.result.summary); else reject(new Error(data.error)); };
          worker.postMessage({ type: 'run-autonomy-match', config });
        }) };
    }, source);
  }
  const [a, b] = pages;
  const starts = await Promise.all(pages.map(page => page.evaluate(async () => {
    const p = globalThis.proof;
    p.begun = await p.api.beginExperimentRun({ config: p.config, batchSize: 1 });
    return { runId: p.begun.runId, native: p.store.persisted, range: [p.begun.manifest.config.ordinalStart, p.begun.manifest.config.ordinalEnd] };
  })));
  assert.ok(starts.every(x => x.native)); assert.notEqual(starts[0].runId, starts[1].runId);
  assert.ok(starts[0].range[1] <= starts[1].range[0] || starts[1].range[1] <= starts[0].range[0]);
  report.scenarios.twoTabStart = { status: 'PASS', tabs: 2, connections: 2, starts };
  const old = await a.evaluate(async () => {
    const p = globalThis.proof, m = await p.store.getManifest(p.begun.runId);
    p.old = await p.store.putManifestFenced({ ...m, owner: { ...m.owner, leaseUntil: new Date(0).toISOString() } });
    return p.old;
  });
  const takeover = await b.evaluate(async old => {
    const p = globalThis.proof;
    const acquired = await p.store.acquireManifestOwnership(old.manifestId, { ownerId: 'wave5-other-tab' });
    return { fence: acquired.owner.fencingToken, count: acquired.committedMatches };
  }, old);
  assert.ok(takeover.fence > old.owner.fencingToken);
  const stale = await a.evaluate(async () => {
    const p = globalThis.proof, errors = {};
    for (const [name, fn] of Object.entries({ write: () => p.store.putManifestFenced(p.old), heartbeat: () => p.store.renewManifestLease(p.old.manifestId, p.old.owner),
      batch: () => p.store.commitRunBatch({ manifest: p.old, batch: { batchId: p.old.runId + '#stale', runId: p.old.runId } }), delete: () => p.store.deleteManifestCascade(p.old.manifestId, p.old) })) {
      try { await fn(); errors[name] = 'ACCEPTED'; } catch (error) { errors[name] = error.code; }
    }
    return errors;
  });
  assert.ok(Object.values(stale).every(code => code === 'RUN_OWNERSHIP_STALE'));
  report.scenarios.ownerTakeover = { status: 'PASS', ...takeover };
  report.scenarios.staleWriter = { status: 'PASS', errors: stale };

  const commits = await b.evaluate(async () => {
    const p = globalThis.proof;
    const m = p.begun.manifest, start = m.config.ordinalStart;
    const summaries = await Promise.all([0, 1].map(i => p.match({ ...p.config, ordinal: start + i, seed: 100 + i, includeReplay: false, telemetryEnabled: false })));
    const batch = { execution: p.begun.execution, ordinalStart: start, ordinalEnd: start + 2, summaries };
    await p.api.commitExperimentBatch(m.runId, batch);
    const duplicate = await p.api.commitExperimentBatch(m.runId, batch);
    let conflict;
    try { await p.api.commitExperimentBatch(m.runId, { ...batch, summaries: summaries.map((row, i) => i ? row : { ...row, matchResultHash: 'conflicting-retained-digest' }) }); }
    catch (error) { conflict = error.code; }
    return { duplicate: duplicate.duplicate, conflict, count: (await p.store.getManifest(m.runId)).committedMatches, batches: (await p.store.listRunBatches(m.runId)).length };
  });
  assert.equal(commits.duplicate, true); assert.equal(commits.conflict, 'RUN_BATCH_SAMPLE_CONFLICT'); assert.equal(commits.count, 2); assert.equal(commits.batches, 1);
  report.scenarios.duplicateConflictingCommit = { status: 'PASS', ...commits };

  const resume = await b.evaluate(async () => {
    const p = globalThis.proof, errors = {}, unchanged = [];
    for (const key of ['fingerprint', 'analysisFingerprint']) {
      const original = await p.store.allocateRunManifest({ experimentId: 'EXP-LAB', owner: null,
        config: { ...p.config, seedStreamVersion: 'POLICY_V4', seedCatalogVersion: 'INTRILEX_LAB_SEED_CATALOG_V1',
          implementation: { ...p.LAB_IDENTITY, [key]: 'incompatible-original-version' } } });
      const before = await p.store.getManifest(original.runId);
      try { await p.api.resumeExperimentRun(original.runId); errors[key] = 'ACCEPTED'; } catch (error) { errors[key] = error.code; }
      unchanged.push(p.hashCanonical(before) === p.hashCanonical(await p.store.getManifest(original.runId)));
    }
    return { errors, unchanged };
  });
  assert.deepEqual(resume.errors, { fingerprint: 'RUN_EXECUTION_IDENTITY_MISMATCH', analysisFingerprint: 'RUN_PROTOCOL_IDENTITY_MISMATCH' });
  assert.ok(resume.unchanged.every(Boolean));
  report.scenarios.versionIncompatibleResume = { status: 'PASS', ...resume };

  await Promise.all(pages.map(page => page.evaluate(async () => {
    const { ProfileStore, IndexedDbBackend } = await import('/evolution/profile-store.mjs');
    globalThis.proof.profiles = new ProfileStore(new IndexedDbBackend({ name: 'wave5-two-tab-profiles' }), { identity: globalThis.proof.LAB_IDENTITY });
    await globalThis.proof.profiles.backend.open();
  })));
  await a.evaluate(async rows => {
    await globalThis.proof.profiles.write(Object.keys(rows), function* (tx) {
      yield { op: 'all', store: 'profiles' };
      for (const [name, values] of Object.entries(rows)) for (const value of values) tx.put(name, value);
    });
  }, rows);
  const args = { agentProfileId: created.agentProfileId, nominationId: nominated.nomination.id };
  const attempts = await Promise.all(pages.map((page, i) => page.evaluate(async args => {
    const { prepareChallenge } = await import('/evolution/profile-science.mjs');
    return prepareChallenge({ store: globalThis.proof.profiles, ...args });
  }, { ...args, commandId: 'wave5-reserve-' + i })));
  assert.deepEqual(attempts.map(m => m.body.attempt.number).sort(), [1, 2]);
  assert.equal(attempts.filter(m => m.body.attempt.automaticEligible).length, 1);
  report.scenarios.concurrentFirstChallenge = { status: 'PASS', tabs: 2, fixture: 'LABELED_FIXTURE_NOT_SIMULATION', attempts: attempts.map(m => ({ id: m.id, attempt: m.body.attempt.number, automaticEligible: m.body.attempt.automaticEligible })) };
  const changed = await a.evaluate(async ({ manifest, args }) => {
    const p = globalThis.proof, { prepareChallenge } = await import('/evolution/profile-science.mjs');
    await p.profiles.manualActivate({ commandId: 'wave5-change-head', agentProfileId: args.agentProfileId, expectedHead: manifest.body.expectedHead,
      checkpointId: manifest.body.challengerCheckpointId, reason: 'Isolated test of changed Head authority' });
    let stale;
    try { await p.profiles.manualActivate({ commandId: 'wave5-stale-head', agentProfileId: args.agentProfileId, expectedHead: manifest.body.expectedHead,
      checkpointId: manifest.body.challengerCheckpointId, reason: 'Stale operation must fail' }); } catch (error) { stale = error.code; }
    const retry = await prepareChallenge({ store: p.profiles, ...args, commandId: 'wave5-reserve-0' });
    return { stale, retryId: retry.id, head: (await p.profiles.getHead(args.agentProfileId)).headVersion };
  }, { manifest: attempts[0], args });
  assert.equal(changed.stale, 'STALE_HEAD'); assert.equal(changed.retryId, attempts[0].id);
  report.scenarios.changedHead = { status: 'PASS', ...changed, automaticPromotion: 'DISABLED' };

  const execution = await b.evaluate(async () => {
    const p = globalThis.proof, { campaignExecution } = await import('/evolution/campaign-execution.mjs');
    const create = (begun, options = {}) => campaignExecution({ execution: begun.execution,
      commit: options.commit ?? ((msg, execution) => p.api.commitExperimentBatch(begun.runId, { execution, ordinalStart: msg.ordinalStart, ordinalEnd: msg.ordinalEnd, summaries: JSON.parse(msg.summariesJson) })),
      seal: execution => p.api.finalizeExperimentRun(begun.runId, { execution, requireComplete: true }), fail: (error, execution) => p.api.failExperimentRun(begun.runId, error.message, execution),
      cancel: execution => p.api.cancelExperimentRun(begun.runId, execution) });
    const failureRun = await p.api.beginExperimentRun({ config: p.config });
    const failed = create(failureRun), url = URL.createObjectURL(new Blob(['throw new Error("WAVE5_INJECTED_WORKER_FAILURE")'], { type: 'text/javascript' }));
    const failingWorker = new Worker(url); failingWorker.addEventListener('error', event => event.preventDefault());
    failed.attach(failingWorker, { index: 0, config: p.config });
    const failure = await failed.done; URL.revokeObjectURL(url);
    const failureManifest = await p.store.getManifest(failureRun.runId);
    const begun = await p.api.beginExperimentRun({ config: p.config, batchSize: 1 });
    let release, arrived, firstMessage;
    const gate = new Promise(resolve => { release = resolve; }), waiting = new Promise(resolve => { arrived = resolve; });
    const driver = create(begun, { commit: async (msg, execution) => { firstMessage = msg; arrived(); await gate;
      return p.api.commitExperimentBatch(begun.runId, { execution, ordinalStart: msg.ordinalStart, ordinalEnd: msg.ordinalEnd, summaries: JSON.parse(msg.summariesJson) }); } });
    const worker = new Worker('/worker.js', { type: 'module' }), cfg = begun.manifest.config, base = cfg.ordinalStart;
    driver.attach(worker, { index: 0, config: { ...cfg, ordinalStart: 0, ordinalEnd: 2, ordinalBase: base, batchSize: 1 } });
    const late = worker.onmessage;
    await waiting;
    const cancelling = driver.cancel(); release(); const cancelled = await cancelling;
    const partial = await p.store.getManifest(begun.runId);
    const plan = await p.api.resumeExperimentRun(begun.runId);
    const resumed = create({ runId: begun.runId, execution: plan.execution });
    const segment = plan.segments[0];
    resumed.attach(new Worker('/worker.js', { type: 'module' }), { index: 0, config: { ...plan.config, ...segment, ordinalBase: base, batchSize: 1 } });
    // An old worker callback already captured by an event queue cannot mutate the new execution.
    late({ data: firstMessage });
    const result = await resumed.done, final = await p.store.getManifest(begun.runId);
    return { workerFailure: { terminal: failure.state, manifestStatus: failureManifest.status, count: failureManifest.committedMatches },
      cancelRestart: { cancelled: cancelled.state, partial: partial.committedMatches, final: final.committedMatches, terminal: result.state,
        oldFence: begun.execution.fencingToken, newFence: plan.execution.fencingToken, oldEpoch: driver.token.epoch, newEpoch: resumed.token.epoch } };
  });
  assert.equal(execution.workerFailure.terminal, 'failed'); assert.equal(execution.workerFailure.count, 0);
  assert.equal(execution.workerFailure.manifestStatus, 'failed');
  assert.equal(execution.cancelRestart.cancelled, 'cancelled'); assert.equal(execution.cancelRestart.partial, 1);
  assert.equal(execution.cancelRestart.final, 2); assert.equal(execution.cancelRestart.terminal, 'complete');
  assert.ok(execution.cancelRestart.newFence > execution.cancelRestart.oldFence); assert.notEqual(execution.cancelRestart.oldEpoch, execution.cancelRestart.newEpoch);
  report.scenarios.workerFailure = { status: 'PASS', ...execution.workerFailure };
  report.scenarios.cancelRestartRace = { status: 'PASS', ...execution.cancelRestart };

  const selection = await b.evaluate(async () => {
    const p = globalThis.proof;
    const { sampleIdentity, outcomeIdentity } = await import('/evolution/evidence-identity.mjs');
    const row = await p.match({ ...p.config, ordinal: 0, seed: 999, telemetryEnabled: false, includeReplay: false });
    const storeRun = async (rows, ordinal) => {
      const payload = { summaries: rows, aggregate: null }, headline = p.domain.foldSummariesIntoHeadline(p.domain.createManifestHeadline(), rows);
      const run = p.domain.createRunRecord({ experimentId: 'EXP-LAB', ordinal, config: { ...p.config, matchCount: rows.length },
        metrics: { ...headline, seat1Wins: headline.seatWins['1'], seat2Wins: headline.seatWins['2'] }, payloadKind: 'indexeddb', payloadHash: p.domain.payloadEvidenceHash(payload) });
      const imported = await p.api.importRunArtifact(p.portable.experimentRunArtifact({ run, evidence: { kind: 'summaries', ...payload } }));
      return imported.runId;
    };
    const first = await storeRun([row], 501); await p.api.isolateRun(first);
    const duplicate = await storeRun([row], 502); await p.api.setRunIncluded(duplicate);
    const repeats = p.state.evidenceSnapshot.selection;
    const legacy = { matchOrdinal: 0, seed: 999, winningSeat: 1, terminationReason: 'NORMAL_VICTORY' };
    const historical = await storeRun([legacy], 503);
    const archived = JSON.parse(await p.api.exportRunArtifactText(historical));
    const classification = p.portable.validateExperimentRunArtifact(archived).admission;
    const foreign = structuredClone(row), identity = { ...p.LAB_IDENTITY, fingerprint: 'f'.repeat(64), analysisFingerprint: 'a'.repeat(64) };
    foreign.identity = { ...sampleIdentity({ ...p.config, seed: foreign.seed }, identity), ...outcomeIdentity(foreign, row.identity.commandDigest) };
    const other = await storeRun([foreign], 504);
    const snapshot = p.state.evidenceSnapshot;
    await p.api.setRunIncluded(other, { force: true });
    const mixed = { error: p.state.evidenceViewStatus.error, stale: p.state.evidenceViewStatus.stale, sameSnapshot: snapshot === p.state.evidenceSnapshot };
    const cohort = p.admission.admitSummaries([row]).cohorts[0];
    await p.api.applySelection({ cohort });
    return { duplicates: { retained: repeats.retainedSampleCount, effective: repeats.effectiveSampleCount, repeatCount: repeats.repeatCount },
      legacy: { classification: classification.classification, eligible: classification.eligible, original: archived.payload.evidence.summaries[0] },
      mixed, selected: { rows: p.state.evidenceSnapshot.selection.retainedSampleCount, cohorts: p.state.evidenceSnapshot.selection.cohorts.length, stale: p.state.evidenceViewStatus.stale } };
  });
  assert.equal(selection.duplicates.retained, 1); assert.equal(selection.duplicates.repeatCount, 1);
  assert.equal(selection.legacy.classification, 'RESTRICTED_LEGACY'); assert.equal(selection.legacy.eligible, false);
  assert.deepEqual(selection.legacy.original, { matchOrdinal: 0, seed: 999, winningSeat: 1, terminationReason: 'NORMAL_VICTORY' });
  assert.equal(selection.mixed.error, 'EVIDENCE_COHORT_SELECTION_REQUIRED'); assert.equal(selection.mixed.stale, true); assert.equal(selection.mixed.sameSnapshot, true);
  assert.equal(selection.selected.rows, 1); assert.equal(selection.selected.cohorts, 2); assert.equal(selection.selected.stale, false);
  report.scenarios.duplicateSampleInclusion = { status: 'PASS', ...selection.duplicates };
  report.scenarios.legacyClassification = { status: 'PASS', ...selection.legacy };
  report.scenarios.mixedCohortView = { status: 'PASS', ...selection.mixed, selected: selection.selected };

  // A version upgrade in the other tab invalidates the old writable connection.
  const upgraded = await a.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('intrilex-experiment-lab', 3);
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error('UPGRADE_BLOCKED'));
    });
    return true;
  });
  const superseded = await b.evaluate(async () => {
    try { await globalThis.proof.store.open(); return 'ACCEPTED'; } catch (error) { return error.code; }
  });
  assert.equal(upgraded, true); assert.equal(superseded, 'EXPERIMENT_STORAGE_SUPERSEDED');
  report.scenarios.oldTabUpgrade = { status: 'PASS', superseded };
  const built = await b.evaluate(() => globalThis.proof.LAB_IDENTITY);
  assert.equal(built.fingerprint, report.identity.fingerprint); assert.equal(built.analysisFingerprint, report.identity.analysisFingerprint);
  assert.deepEqual(report.pageErrors, []);
  report.status = 'PASS'; await context.close();
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
console.log(JSON.stringify(report, null, 2));
