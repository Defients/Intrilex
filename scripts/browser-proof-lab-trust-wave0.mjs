import { runPolicyMatch } from '../packages/simulation-runtime/src/runtime.mjs';
import { baselinePolicyState, WEIGHTED_POLICY_ID } from '../packages/policies/src/weighted-heuristic.mjs';
import { evolutionIdentity } from './evolution-identity.mjs';
import { memoryStore, createGraveMaw, fixtureSeries } from '../test/fixtures/agent-profile-fixtures.mjs';
/* global document, DOMException, indexedDB */
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'apps/lab-web/dist');
const mirrors = new Set(['campaign-execution.mjs', 'lab-trust-policy.mjs', 'profile-store.mjs', 'profile-contracts.mjs', 'discovery-domain.mjs', 'experiment-domain.mjs', 'experiment-portability.mjs', 'profile-science.mjs', 'profile-journal.mjs', 'evolution-domain.mjs', 'evolution-research.mjs', 'evolution-evaluation.mjs', 'evolution-training.mjs', 'adaptive-strategy.mjs', 'evidence-identity.mjs', 'persistence-state.mjs', 'identity.mjs']);
const sourceFiles = new Set(['/experiment-controls.js', '/experiments/experiment-controller.mjs', '/experiments/experiment-store.mjs', '/evolution/profile-workspace.js', '/workspaces/discover.js', '/autonomy-runtime.js', '/workspaces/evolution-dashboard.js', '/worker.js']);
// Bundle current source in memory using the existing built engine/assets.
// Resolve version-query imports once so state modules are not duplicated.
// No generated repo files or user browser storage are changed by this proof.
const currentIdentity = await evolutionIdentity();
const baseline = baselinePolicyState(), modified = structuredClone(baseline); modified.weights.points = -2000; modified.weights.defense = 2000;
const parityConfigs = [baseline, modified].map(policyState => ({ seed: 42, profileId: 'core-advanced-authority', policyIds: [WEIGHTED_POLICY_ID, 'control'], policyStates: [policyState, null], ordinal: 0, telemetryEnabled: false, includeReplay: false }));
const parityResults = parityConfigs.map(config => runPolicyMatch(config).summary);
const profileFixture = memoryStore();
const createdFixture = await createGraveMaw(profileFixture, 'browser-wave1-create');
const nominatedFixture = await fixtureSeries({ store: profileFixture, agentProfileId: createdFixture.agentProfileId, commandId: 'browser-wave1-series' });
const fixtureRows = Object.fromEntries([...profileFixture.backend.data].map(([name, table]) => [name, [...table.values()]]));
const portableSource = async name => name === 'identity.mjs' ? `export const LAB_IDENTITY = ${JSON.stringify(currentIdentity)};` : (await readFile(path.join(root, 'packages/simulation-runtime/src', name), 'utf8'))
  .replaceAll("'@intrilex/shared'", "'../shared-browser.js'")
  .replaceAll("'@intrilex/statistics/estimators'", "'../shared-analytics/estimators.mjs'")
  .replaceAll("'../../policies/src/weighted-heuristic.mjs'", "'./weighted-heuristic.mjs'");
const browserBundle = await build({
  entryPoints: [path.join(dist, 'app.js')], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2020',
  jsx: 'automatic', alias: { '@intrilex/shared': path.join(dist, 'shared-browser.js') },
  define: { __INTRILEX_TACTICAL_CSS__: '"/client/game-table.css"' }, logLevel: 'silent',
  plugins: [{ name: 'wave0-source-overlay', setup(bundler) {
    bundler.onResolve({ filter: /\?v=|\/evolution\/[^/]+\.mjs$|lab-trust-policy\.mjs$/ }, async args => {
      if (args.pluginData?.resolved) return undefined;
      const clean = args.path.split('?')[0];
      if (clean.includes('/evolution/') && mirrors.has(path.basename(clean))) return { path: path.join(dist, 'evolution', path.basename(clean)) };
      if (clean.endsWith('/lab-trust-policy.mjs')) return { path: path.join(dist, 'evolution/lab-trust-policy.mjs') };
      // This optional theme import is absent from the existing build and
      // already has a runtime catch. Preserve that behavior; do not invent
      // a module or change unrelated settings to run the containment proof.
      if (clean.endsWith('landing/seasonal-theme.js')) return { path: '/landing/seasonal-theme.js', external: true };
      return bundler.resolve(clean, { resolveDir: args.resolveDir, kind: args.kind, pluginData: { resolved: true } });
    });
    bundler.onLoad({ filter: /\.(mjs|js)$/ }, async args => {
      const relative = path.relative(dist, args.path).replaceAll('\\', '/');
      if (sourceFiles.has('/' + relative)) return { contents: (await readFile(path.join(root, 'apps/lab-web/src', relative), 'utf8'))
        .replaceAll('../../../../packages/simulation-runtime/src/', '../evolution/').replaceAll('../../../../packages/shared/src/canonical.mjs', '../shared-browser.js'),
        resolveDir: path.dirname(args.path), loader: 'js' };
      if (relative.startsWith('evolution/') && mirrors.has(path.basename(relative))) return { contents: await portableSource(path.basename(relative)), resolveDir: path.dirname(args.path), loader: 'js' };
      return undefined;
    });
  } }],
});
const bundleText = browserBundle.outputFiles.find(file => file.path.endsWith('.js') || file.path === '<stdout>')?.text;
assert.ok(bundleText, 'browser proof must compile a current application bundle');
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    let content;
    if (pathname === '/' || pathname === '/index.html') content = (await readFile(path.join(dist, 'index.html'), 'utf8')).replace(/src="app\.[a-f0-9]+\.js"/, 'src="wave0-proof-app.js"');
    if (pathname === '/wave0-proof-app.js') content = bundleText;
    if (pathname === '/proof.html') content = '<!doctype html><title>Wave 0 native IndexedDB proof</title>';
    if (pathname === '/source/domain.mjs') content = (await readFile(path.join(root, 'packages/simulation-runtime/src/experiment-domain.mjs'), 'utf8')).replaceAll("'@intrilex/shared'", "'/shared-browser.js'");
    if (pathname === '/source/store.mjs') content = (await readFile(path.join(root, 'apps/lab-web/src/experiments/experiment-store.mjs'), 'utf8')).replaceAll("'../../../../packages/simulation-runtime/src/experiment-domain.mjs'", "'/source/domain.mjs'").replaceAll("'../../../../packages/shared/src/canonical.mjs'", "'/shared-browser.js'");
    if (pathname === '/source/controller.txt') content = await readFile(path.join(root, 'apps/lab-web/src/experiments/experiment-controller.mjs'), 'utf8');
    if (sourceFiles.has(pathname)) content = (await readFile(path.join(root, 'apps/lab-web/src', pathname.slice(1)), 'utf8'))
      .replaceAll('../../../../packages/simulation-runtime/src/', '../evolution/')
      .replaceAll('../../../../packages/shared/src/canonical.mjs', '/shared-browser.js')
      .replaceAll('../../../../packages/', '/packages/').replaceAll("'@intrilex/engine-adapter/action-composition'", "'/engine-adapter/action-composition.mjs'").replaceAll("'@intrilex/engine-adapter/action-semantics'", "'/engine-adapter/action-semantics.mjs'");
    if (pathname.startsWith('/evolution/') && mirrors.has(path.basename(pathname))) content = await portableSource(path.basename(pathname));
    const target = path.resolve(dist, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
    if (!target.startsWith(dist + path.sep)) throw Error('outside test root');
    const body = content ?? await readFile(target);
    res.writeHead(200, { 'Content-Type': /\.(mjs|js)$/.test(pathname) ? 'text/javascript' : pathname.endsWith('.html') || pathname === '/' ? 'text/html' : pathname.endsWith('.css') ? 'text/css' : pathname.endsWith('.json') ? 'application/json' : 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
const report = { containment: [], deferred: [], pageErrors: [] };
try {
  browser = await chromium.launch({ channel: process.env.INTRILEX_BROWSER_CHANNEL || 'chrome', headless: true });
  report.browser = browser.version();
  const base = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext(), page = await context.newPage();
  await page.goto(base + '/proof.html');
  const result = await page.evaluate(async () => {
    const domain = await import('/source/domain.mjs'), { ExperimentStore } = await import('/source/store.mjs'), { hashCanonical } = await import('/shared-browser.js');
    const src = (await (await fetch('/source/controller.txt')).text()).replace(/import\s[^;]*?from\s*'[^']*';/gs, '').replace(/^export /gm, '');
    async function make(store) {
      const { LAB_IDENTITY } = await import('/evolution/identity.mjs');
      const deps = { ...domain, LAB_IDENTITY, ExperimentStore, hashCanonical, summariesCarryDecisionEvidence: () => false, console, structuredClone, TextEncoder,
        state: { bootState: null, observatory: {}, aggregate: {} }, showToast() {}, updateRailContext() {}, rerender() {}, RULES_VERSION: '4.3.1', ENGINE_VERSION: '4.2.6', LAB_VERSION: 'wave0', Worker: class { constructor() { throw Error('disabled'); } } };
      const api = new Function('deps', 'with(deps){' + src + ';return {initExperiments,beginExperimentRun};}')(deps);
      await api.initExperiments({ store }); return api;
    }
    const sa = new ExperimentStore(), sb = new ExperimentStore(), a = await make(sa), b = await make(sb);
    const config = { matchCount: 2, ordinalStart: 0, ordinalEnd: 2, policyIds: ['control', 'tempo'], profileId: 'core-advanced-authority' };
    const [ra, rb] = await Promise.all([a.beginExperimentRun({ config }), b.beginExperimentRun({ config: { ...config, policyIds: ['value', 'tempo'] } })]);
    return { nativeIndexedDB: sa.persisted && sb.persisted, ids: [ra.runId, rb.runId],
      ranges: [[ra.manifest.config.ordinalStart, ra.manifest.config.ordinalEnd], [rb.manifest.config.ordinalStart, rb.manifest.config.ordinalEnd]],
      manifestCount: (await sa.listManifests()).length };
  });
  assert.equal(result.nativeIndexedDB, true);
  // R02/R03: cross-connection allocation is fenced at BOTH levels — the run
  // occurrence AND the sample-ordinal range. Two tabs that each read the
  // same stale frontier (ordinalStart 0) cannot execute overlapping
  // deterministic samples: the store rebases the loser past the winner's
  // reservation inside the same atomic claim.
  assert.notEqual(result.ids[0], result.ids[1], 'two controllers must allocate distinct run occurrences');
  const [[a0, a1], [b0, b1]] = result.ranges;
  assert.ok(a1 <= b0 || b1 <= a0, `allocated sample ranges must not overlap: ${result.ranges}`);
  assert.equal(result.manifestCount, 2);
  report.containment.push({ status: 'PASS', name: 'cross-connection run allocation is fenced — distinct occurrences AND nonoverlapping sample ranges (R02/R03)', ids: result.ids, ranges: result.ranges });
  const wave1 = await page.evaluate(async ({ rows, profileId, nominationId, nodeIdentity, parityConfigs }) => {
    const { ProfileStore, IndexedDbBackend, challengeReservationAuthority } = await import('/evolution/profile-store.mjs');
    const { prepareChallenge } = await import('/evolution/profile-science.mjs');
    const { sampleIdentity } = await import('/evolution/evidence-identity.mjs');
    const { acknowledgedSave } = await import('/evolution/persistence-state.mjs');
    const { LAB_IDENTITY } = await import('/evolution/identity.mjs');
    const { ExperimentStore } = await import('/source/store.mjs');
    const sa = new ProfileStore(new IndexedDbBackend({ name: 'wave1-native-profiles' }), { identity: LAB_IDENTITY });
    const sb = new ProfileStore(new IndexedDbBackend({ name: 'wave1-native-profiles' }), { identity: LAB_IDENTITY });
    await sa.write(Object.keys(rows), function* (tx) { yield { op: 'all', store: 'profiles' }; for (const [name, values] of Object.entries(rows)) for (const value of values) tx.put(name, value); });
    const args = { agentProfileId: profileId, nominationId };
    const attempts = await Promise.all([prepareChallenge({ ...args, store: sa, commandId: 'native-a' }), prepareChallenge({ ...args, store: sb, commandId: 'native-b' })]);
    const history = await sa.listArtifacts(profileId, 'CHALLENGE_MANIFEST');
    const reservations = [];
    for (const m of attempts) {
      const receipt = await sa.read(['receipts'], function* () { return yield { op: 'get', store: 'receipts', key: m.body.reservation.commandId }; });
      reservations.push(challengeReservationAuthority(m, receipt, history));
    }
    sa.backend.close();
    const reopened = new ProfileStore(new IndexedDbBackend({ name: 'wave1-native-profiles' }), { identity: LAB_IDENTITY });
    const retry = await prepareChallenge({ ...args, store: reopened, commandId: 'native-a' });
    const experiment = new ExperimentStore(); await experiment.open();
    const config = { matchCount: 2, ordinalStart: 0, ordinalEnd: 2 };
    const m = await experiment.allocateRunManifest({ experimentId: 'wave1-native', config, owner: { ownerId: 'old', fencingToken: 1, leaseUntil: new Date(0).toISOString() } });
    const acquired = await experiment.acquireManifestOwnership(m.manifestId, { ownerId: 'new' });
    const errors = {};
    for (const [name, operation] of Object.entries({ staleWrite: () => experiment.putManifestFenced(m), staleHeartbeat: () => experiment.renewManifestLease(m.manifestId, m.owner), staleDelete: () => experiment.deleteManifestCascade(m.manifestId, m) })) {
      try { await operation(); errors[name] = 'ACCEPTED'; } catch (error) { errors[name] = error.code; }
    }
    for (const [name, operation] of Object.entries({ staleBatch: () => experiment.commitRunBatch({ manifest: m, batch: { batchId: m.runId+'#stale', runId: m.runId } }), staleSeal: async () => { const { createRunRecord } = await import('/source/domain.mjs'); return experiment.finalizeRun({ run: createRunRecord({ experimentId: m.experimentId, ordinal: m.ordinal, config }), manifest: m }); } })) {
      try { await operation(); errors[name] = 'ACCEPTED'; } catch (error) { errors[name] = error.code; }
    }
    try { await experiment._transact(['manifests', 'runBatches'], async ops => {
      await ops.put('runBatches', { batchId: m.runId+'#abort', runId: m.runId });
      await ops.put('manifests', { ...acquired, committedMatches: 999 });
      throw new DOMException('quota', 'QuotaExceededError');
    }); errors.abort = 'ACCEPTED'; } catch (error) { errors.abort = error.code; }
    const abortedCleanly = (await experiment.listRunBatches(m.runId)).length === 0 && (await experiment.getManifest(m.runId)).committedMatches === 0;
    const updated = await experiment.putManifestFenced({ ...acquired, headline: { note: 'new version' } });
    try { await experiment.putManifestFenced(acquired); errors.version = 'ACCEPTED'; } catch (error) { errors.version = error.code; }
    const cancelled = await experiment.putManifestFenced({ ...updated, status: 'cancelled' });
    try { await experiment.putManifestFenced({ ...cancelled, status: 'running' }); errors.terminal = 'ACCEPTED'; } catch (error) { errors.terminal = error.code; }
    const states = []; let release;
    const saving = acknowledgedSave(() => new Promise(resolve => { release = resolve; }), state => states.push(state));
    const pending = [...states]; release(); await saving;
    const failedStates = []; try { await acknowledgedSave(async () => { throw new DOMException('quota', 'QuotaExceededError'); }, state => failedStates.push(state)); } catch {}
    const browserIdentity = sampleIdentity({ profileId: 'core-advanced-authority', seed: 42, policyIds: ['control', 'tempo'], policyStates: [{ weights: { value: 2 } }, null] }, LAB_IDENTITY);
    // Upgrade closes old connections and explicitly invalidates their authority.
    await new Promise((resolve, reject) => { const request = indexedDB.open('intrilex-experiment-lab', 3); request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error('WAVE1_UPGRADE_BLOCKED')); });
    try { await experiment.open(); errors.superseded = 'ACCEPTED'; } catch (error) { errors.superseded = error.code; }
    const { runBrowserPolicyMatch } = await import('/autonomy-runtime.js');
    const parity = parityConfigs.map(config => runBrowserPolicyMatch(config));
    sb.backend.close(); reopened.backend.close();
    return { attempts: attempts.map(m => ({ id: m.id, number: m.body.attempt.number, eligible: m.body.attempt.automaticEligible })), retryId: retry.id, reservations, errors, pending, states, failedStates, browserIdentity, nodeIdentity, abortedCleanly, parity };
  }, { rows: fixtureRows, profileId: createdFixture.agentProfileId, nominationId: nominatedFixture.nomination.id, nodeIdentity: currentIdentity, parityConfigs });
  assert.deepEqual(wave1.attempts.map(a => a.number).sort(), [1, 2]);
  assert.equal(wave1.attempts.filter(a => a.eligible).length, 1);
  assert.equal(wave1.reservations.filter(r => r.ok).length, 1);
  assert.equal(wave1.retryId, wave1.attempts[0].id);
  assert.deepEqual(wave1.errors, { staleWrite: 'RUN_OWNERSHIP_STALE', staleHeartbeat: 'RUN_OWNERSHIP_STALE', staleDelete: 'RUN_OWNERSHIP_STALE', version: 'RUN_MANIFEST_VERSION_CONFLICT', terminal: 'RUN_MANIFEST_TERMINAL', staleBatch: 'RUN_OWNERSHIP_STALE', staleSeal: 'RUN_OWNERSHIP_STALE', abort: 'BROWSER_STORAGE_QUOTA_EXCEEDED', superseded: 'EXPERIMENT_STORAGE_SUPERSEDED' });
  assert.equal(wave1.abortedCleanly, true);
  report.adapterParity = wave1.parity.map((result,i)=>({browserFinalState:result.finalStateHash,nodeFinalState:parityResults[i].finalStateHash,browserWinner:result.winner,nodeWinner:parityResults[i].winner,browserHash:result.matchResultHash,nodeHash:parityResults[i].matchResultHash}));
  for(const [i, result] of wave1.parity.entries()){assert.deepEqual(result.identity, parityResults[i].identity);assert.equal(result.identity.outcomeDigest, parityResults[i].identity.outcomeDigest);assert.equal(result.finalStateHash, parityResults[i].finalStateHash);}
  assert.deepEqual(wave1.pending, ['PENDING']);
  assert.deepEqual(wave1.states, ['PENDING', 'LOCALLY_COMMITTED']);
  assert.deepEqual(wave1.failedStates, ['PENDING', 'FAILED']);
  const { sampleIdentity } = await import('../packages/simulation-runtime/src/evidence-identity.mjs');
  assert.deepEqual(wave1.browserIdentity, sampleIdentity({ profileId: 'core-advanced-authority', seed: 42, policyIds: ['control', 'tempo'], policyStates: [{ weights: { value: 2 } }, null] }, currentIdentity));
  report.containment.push({ status: 'PASS', name: 'Wave 1 native reservations, retry, fencing, terminal states, upgrade, save acknowledgement and Node/browser identity', attempts: wave1.attempts, errors: wave1.errors });
  await context.close();

  // Wave 2: real workers + native IndexedDB. Inject a quota exception in the
  // middle batch; later messages are already queued when storage rejects it.
  const recovery=await browser.newContext();
  await recovery.addInitScript(()=>{
    const put=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(value,...rest){
      if(this.name==='runBatches' && value.ordinalStart===2 && !globalThis.__wave2Quota){globalThis.__wave2Quota=true;throw new DOMException('injected middle batch quota','QuotaExceededError');}
      return put.call(this,value,...rest);
    };
  });
  const rp=await recovery.newPage();rp.on('pageerror',e=>report.pageErrors.push(e.message));
  const workerText=await readFile(path.join(root,'apps/lab-web/src/worker.js'),'utf8');
  await rp.route('**/worker.js',async route=>{
    const mock=workerText+`
      const realHandler=self.onmessage;
      self.onmessage=event=>{
        if(event.data.type!=='run-autonomy-segment')return realHandler(event);
        const {execution,workerIndex,config}=event.data;
        const start=(config.ordinalBase||0)+config.ordinalStart,end=(config.ordinalBase||0)+config.ordinalEnd;
        for(let o=start;o<end;o+=2){
          const summaries=Array.from({length:Math.min(2,end-o)},(_,i)=>({matchId:'proof-'+(o+i),matchOrdinal:o+i,matchResultHash:'proof-hash-'+(o+i),policyIds:config.policyIds,winner:'P1',winningSeat:1,terminationReason:'NORMAL_VICTORY',completedFullTurns:6,scoreMargin:3,identity:{schemaVersion:'2.0.0',executionFingerprint:config.implementation.fingerprint,analysisFingerprint:config.implementation.analysisFingerprint}}));
          self.postMessage({type:'autonomy-campaign-batch',execution,workerIndex,ordinalStart:o,ordinalEnd:o+summaries.length,summariesJson:JSON.stringify(summaries)});
        }
        self.postMessage({type:'autonomy-segment-result',execution,workerIndex,ok:true});
      };`;
    await route.fulfill({contentType:'text/javascript',body:mock});
  });
  await rp.goto(base+'/#/evolution',{waitUntil:'domcontentloaded'});
  await rp.waitForSelector('#experiment-button',{timeout:45000});await rp.click('#experiment-button');
  await rp.fill('#exp-count','6');await rp.selectOption('#exp-workers','1');await rp.click('#run-experiment');
  await rp.waitForFunction(()=>document.querySelector('#experiment-status')?.dataset.state==='failed',{}, {timeout:45000});
  const stopped=await rp.evaluate(async()=>{
    const {ExperimentStore}=await import('/source/store.mjs'),domain=await import('/source/domain.mjs');
    const store=new ExperimentStore();await store.open();const [m]=await store.listManifests();
    const rows=await store.listRunBatches(m.runId),proof=await store.readRunRecovery(m.runId);
    return {status:m.status,count:m.committedMatches,ordinals:rows.flatMap(b=>b.summaries.map(s=>s.matchOrdinal)),receipts:rows.map(b=>b.receipt.contract),holes:domain.manifestRemainingSegments(proof),run:await store.getRun(m.runId)};
  });
  assert.equal(stopped.status,'failed');assert.equal(stopped.count,2);assert.deepEqual(stopped.ordinals,[0,1]);assert.equal(stopped.run,null);
  assert.deepEqual(stopped.holes,[{index:0,ordinalStart:2,ordinalEnd:6}]);assert.deepEqual(stopped.receipts,['intrilex-batch-receipt@1']);
  // Reload keeps the partial receipt, then UI resume fills only the holes.
  await recovery.clearCookies();await rp.reload({waitUntil:'domcontentloaded'});
  await rp.waitForSelector('#experiment-button',{timeout:45000});await rp.click('#experiment-button');
  await rp.evaluate(()=>{globalThis.__wave2Quota=true;});
  await rp.click('#exp-runs-toggle');await rp.click('[data-manifest-action="resume"]');
  await rp.waitForFunction(()=>document.querySelector('#experiment-status')?.dataset.state==='complete',{}, {timeout:60000});
  const resumed=await rp.evaluate(async()=>{
    const {ExperimentStore}=await import('/source/store.mjs');const store=new ExperimentStore();await store.open();
    const [m]=await store.listManifests(),rows=await store.listRunBatches(m.runId),run=await store.getRun(m.runId);
    return {status:m.status,fence:m.owner.fencingToken,count:m.committedMatches,ordinals:rows.flatMap(b=>b.summaries.map(s=>s.matchOrdinal)),runCount:run.metrics.matchCount};
  });
  assert.equal(resumed.status,'completed');assert.equal(resumed.count,6);assert.equal(resumed.runCount,6);assert.ok(resumed.fence>1);assert.deepEqual(resumed.ordinals,[0,1,2,3,4,5]);
  report.containment.push({status:'PASS',name:'Wave 2 actual UI/worker quota stop, queued callback rejection and reload/resume holes',stopped,resumed});
  await recovery.close();

  const blocked = await browser.newContext();
  await blocked.addInitScript(() => Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true }));
  const ui = await blocked.newPage(); ui.on('pageerror', error => report.pageErrors.push(error.message));
  await ui.goto(base + '/#/evolution', { waitUntil: 'domcontentloaded' });
  await ui.waitForSelector('#experiment-button', { timeout: 45000 });
  await ui.click('#experiment-button'); await ui.fill('#exp-count', '2'); await ui.click('#run-experiment');
  await ui.waitForFunction(() => /durable run cannot start/.test(document.querySelector('#experiment-status')?.textContent ?? ''), {}, { timeout: 15000 });
  const text = await ui.locator('#experiment-status').textContent();
  assert.doesNotMatch(text, /\bpersisted\b|\bcommitted\b/);
  assert.equal(await ui.locator('#run-experiment').isEnabled(), true);
  assert.equal(await ui.locator('#cancel-experiment').isDisabled(), true);
  assert.deepEqual(report.pageErrors, []);
  report.containment.push({ status: 'PASS', name: 'memory-only campaign blocked in actual UI', text });
  const domainGuard = await ui.evaluate(async () => {
    const policy = await import('/evolution/lab-trust-policy.mjs');
    const contracts = await import('/evolution/profile-contracts.mjs');
    const m = { kind: 'MEASUREMENT_RESULT', body: { eraId: 'x', packId: 'y', status: 'COMPLETE' } };
    return { policy: policy.LAB_TRUST_POLICY, comparison: contracts.canCompareMeasurements(m, m, { purpose: 'CONFIRMATORY' }) };
  });
  assert.equal(domainGuard.policy.automaticPromotion, false);
  assert.equal(domainGuard.comparison.ok, false);
  report.containment.push({ status: 'PASS', name: 'browser policy and confirmatory gate match source' });
  await blocked.close();
  if (process.argv.includes('--strict') && report.deferred.length) process.exitCode = 1;
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally {
  console.log(JSON.stringify(report, null, 2));
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
