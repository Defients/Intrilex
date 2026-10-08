import {campaignExecution} from '../packages/simulation-runtime/src/campaign-execution.mjs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hashCanonical } from '../packages/shared/src/canonical.mjs';
import {
  createRunManifest, planManifestBatchCommit, manifestRetainedOrdinals,
  EXPERIMENT_LIMITS, DEFAULT_EXPERIMENT_ID, RUN_STATUS,
} from '../packages/simulation-runtime/src/experiment-domain.mjs';
import { LAB_TRUST_POLICY } from '../packages/simulation-runtime/src/lab-trust-policy.mjs';
import { controller, diagnosticStore, config, summaries } from './fixtures/lab-trust-harness.mjs';
import { CasterSession, VIEWER_MODE } from '../packages/replay-caster/src/caster-session.mjs';
const byteSize = v => new TextEncoder().encode(JSON.stringify(v)).byteLength;

// ── P1 §2: atomic sample-range allocation ─────────────────────────
test('R02/R03: concurrent allocations reserve distinct run occurrences AND nonoverlapping sample ranges', async () => {
  const store = await diagnosticStore();
  const [a, b] = await Promise.all([1, 2].map(i => store.allocateRunManifest({
    experimentId: 'alloc', config, owner: { ownerId: String(i), fencingToken: 1 },
  })));
  assert.notEqual(a.runId, b.runId);
  const [ra, rb] = [a.config, b.config].map(c => [c.ordinalStart, c.ordinalEnd]);
  assert.ok(ra[1] <= rb[0] || rb[1] <= ra[0], `ranges must not overlap: ${ra} vs ${rb}`);
  // Both manifests pin their OWN absolute range.
  assert.equal(a.segments[0].ordinalStart, a.config.ordinalStart);
  assert.equal(b.segments[0].ordinalStart, b.config.ordinalStart);
  // One of them was rebased past the other — never both at the same base.
  assert.deepEqual(new Set([a.config.ordinalStart, b.config.ordinalStart]), new Set([0, config.matchCount]));
});

test('R02: a stale caller-computed ordinal base is corrected by the store reservation', async () => {
  const store = await diagnosticStore(), api = await controller(store);
  // Two callers arrive with the SAME stale preliminary frontier (both read 0).
  const { manifest: m1 } = await api.beginExperimentRun({ config });
  const { runId: r2, manifest: m2 } = await api.beginExperimentRun({ config });
  assert.equal(m1.config.ordinalStart, 0);
  assert.equal(m2.config.ordinalStart, config.matchCount, 'second claim must be rebased past the first reservation');
  assert.equal(m2.config.ordinalEnd, config.matchCount * 2);
  assert.deepEqual(m2.segments.map(s => [s.ordinalStart, s.ordinalEnd]), [[config.matchCount, config.matchCount * 2]]);
  // Evidence committed at the stale base cannot land in r2's schedule.
  await assert.rejects(() => api.commitExperimentBatch(r2, { ordinalStart: 0, ordinalEnd: 2, summaries: summaries(0, 2) }),
    { code: 'RUN_BATCH_ORDINAL_OUT_OF_SCHEDULE' });
  // At the allocated base it admits cleanly.
  await api.commitExperimentBatch(r2, { ordinalStart: config.matchCount, ordinalEnd: config.matchCount + 2, summaries: summaries(config.matchCount, 2) });
  assert.equal((await store.getManifest(r2)).committedMatches, 2);
});

test('R02: a deliberately later base is honored — only stale/below-frontier bases are rebased', async () => {
  const store = await diagnosticStore();
  const m = await store.allocateRunManifest({ experimentId: 'gap', config: { ...config, ordinalStart: 100, ordinalEnd: 106, ordinalBase: 100 }, owner: null });
  assert.equal(m.config.ordinalStart, 100);
  assert.equal(m.segments[0].ordinalStart, 100);
  // The next allocation continues past the honored reservation, not the hint.
  const n = await store.allocateRunManifest({ experimentId: 'gap', config, owner: null });
  assert.equal(n.config.ordinalStart, 106);
});

test('R02: resume reuses the pinned allocation — no second range is reserved', async () => {
  const store = await diagnosticStore(), api = await controller(store);
  // Occupy [0,6) with a sealed run.
  const { runId: _r1 } = await api.beginExperimentRun({ config });
  await api.commitExperimentBatch(_r1, { ordinalStart: 0, ordinalEnd: 6, summaries: summaries(0, 6) });
  await api.finalizeExperimentRun(_r1);
  // Second run allocates [6,12); interrupt it mid-flight.
  const { runId: r2, manifest: m2 } = await api.beginExperimentRun({ config });
  assert.equal(m2.config.ordinalStart, 6);
  await api.commitExperimentBatch(r2, { ordinalStart: 6, ordinalEnd: 8, summaries: summaries(6, 2) });
  await api.cancelExperimentRun(r2);
  const plan = await api.resumeExperimentRun(r2);
  assert.equal(plan.resumed !== false, true);
  // Worker-relative ranges, mapped onto the PINNED base (6) — not a fresh one.
  assert.deepEqual(JSON.parse(JSON.stringify(plan.segments)), [{ index: 0, ordinalStart: 2, ordinalEnd: 6 }]);
  assert.equal(plan.config.ordinalStart, 6);
  const resumed = await store.getManifest(r2);
  assert.equal(resumed.segments[0].ordinalStart, 6, 'the original reservation survives resume');
});

// ── P1 §3: strict batch admission ─────────────────────────────────
test('R03: out-of-schedule ordinals are rejected — not retained-and-flagged', async () => {
  const store = await diagnosticStore(), api = await controller(store), { runId } = await api.beginExperimentRun({ config });
  const rogue = summaries(0, 2).map(s => ({ ...s, matchOrdinal: s.matchOrdinal + 100, matchId: `rogue-${s.matchOrdinal}` }));
  await assert.rejects(() => api.commitExperimentBatch(runId, { ordinalStart: 100, ordinalEnd: 102, summaries: rogue }),
    { code: 'RUN_BATCH_ORDINAL_OUT_OF_SCHEDULE' });
  const m = await store.getManifest(runId);
  assert.equal(m.committedMatches, 0, 'rejected evidence must not advance coverage');
  assert.equal((await store.listRunBatches(runId)).length, 0, 'no batch row may be written');
  assert.equal(m.integrityFailures.at(-1)?.code, 'RUN_BATCH_ORDINAL_OUT_OF_SCHEDULE', 'rejection is a durable mark');
});

test('R03: intra-batch duplicate ordinals are rejected', async () => {
  const store = await diagnosticStore(), api = await controller(store), { runId } = await api.beginExperimentRun({ config });
  const dup = [summaries(0, 1)[0], summaries(0, 1)[0]];
  await assert.rejects(() => api.commitExperimentBatch(runId, { ordinalStart: 0, ordinalEnd: 2, summaries: dup }),
    { code: 'RUN_BATCH_ORDINAL_DUPLICATE_IN_BATCH' });
  assert.equal((await store.getManifest(runId)).committedMatches, 0);
});

test('R03: declared boundaries and count must reconcile with carried ordinals', async () => {
  const store = await diagnosticStore(), api = await controller(store), { runId } = await api.beginExperimentRun({ config });
  // Declared [0,4) but only 2 summaries carried.
  await assert.rejects(() => api.commitExperimentBatch(runId, { ordinalStart: 0, ordinalEnd: 4, summaries: summaries(0, 2) }),
    { code: 'RUN_BATCH_ORDINAL_RANGE_MISMATCH' });
  // Pure planner: matchCount mismatch is its own violation.
  const m = await store.getManifest(runId);
  const { receipt } = planManifestBatchCommit(m, { batchIndex: 0, ordinalStart: 0, ordinalEnd: 2, matchCount: 5, matchResultHashes: [{ o: 0, h: 'x' }, { o: 1, h: 'y' }] });
  assert.equal(receipt.accepted, false);
  assert.equal(receipt.code, 'RUN_BATCH_MATCH_COUNT_MISMATCH');
  assert.equal(m.committedMatches, 0, 'the returned manifest on rejection only carries the integrity mark');
});

test('R03: partial overlap with retained evidence is rejected; only identical whole-batch retries no-op', async () => {
  const store = await diagnosticStore(), api = await controller(store), { runId } = await api.beginExperimentRun({ config });
  await api.commitExperimentBatch(runId, { ordinalStart: 0, ordinalEnd: 2, summaries: summaries(0, 2) });
  // [1,3): ordinal 1 retained, ordinal 2 new — partial overlap.
  await assert.rejects(() => api.commitExperimentBatch(runId, { ordinalStart: 1, ordinalEnd: 3, summaries: summaries(1, 2) }),
    { code: 'RUN_BATCH_PARTIAL_OVERLAP' });
  assert.equal((await store.getManifest(runId)).committedMatches, 2);
  // Identical whole-batch retry — digests verified against the committed
  // batch row (compact manifests no longer carry per-ordinal maps).
  const retry = await api.commitExperimentBatch(runId, { ordinalStart: 0, ordinalEnd: 2, summaries: summaries(0, 2) });
  assert.equal(retry.duplicate, true);
  assert.equal((await store.getManifest(runId)).committedMatches, 2);
});

test('R03: conflicting digest for a retained ordinal is resolved against batch rows and rejected', async () => {
  const store = await diagnosticStore(), api = await controller(store), { runId } = await api.beginExperimentRun({ config });
  await api.commitExperimentBatch(runId, { ordinalStart: 0, ordinalEnd: 2, summaries: summaries(0, 2) });
  const tampered = [{ ...summaries(0, 1)[0], matchResultHash: 'conflicting-digest' }, summaries(1, 1)[0]];
  await assert.rejects(() => api.commitExperimentBatch(runId, { ordinalStart: 0, ordinalEnd: 2, summaries: tampered }),
    { code: 'RUN_BATCH_SAMPLE_CONFLICT' });
  assert.equal((await store.getManifest(runId)).committedMatches, 2);
});

test('R03: an empty batch is rejected — a zero-evidence descriptor is never retained', async () => {
  const store = await diagnosticStore(), api = await controller(store), { runId } = await api.beginExperimentRun({ config });
  await assert.rejects(() => api.commitExperimentBatch(runId, { ordinalStart: 0, ordinalEnd: 0, summaries: [] }),
    { code: 'RUN_BATCH_EMPTY' });
});

// ── P1 §4: exact finalization coverage ────────────────────────────
test('R03: finalize seals only when the retained set is an exact subset of the reserved schedule', async () => {
  const store = await diagnosticStore(), api = await controller(store), { runId } = await api.beginExperimentRun({ config });
  await api.commitExperimentBatch(runId, { ordinalStart: 0, ordinalEnd: 6, summaries: summaries(0, 6) });
  const rec = await api.finalizeExperimentRun(runId);
  assert.equal(rec.run.status, RUN_STATUS.COMPLETED);
  assert.equal(rec.run.metrics.matchCount, 6);
  assert.equal(rec.run.config.requestedMatchCount, undefined, 'full coverage needs no partial disclosure');
});

test('R03: retained ordinals outside the reserved schedule make finalize fail closed', async () => {
  const store = await diagnosticStore(), api = await controller(store), { runId } = await api.beginExperimentRun({ config });
  await api.commitExperimentBatch(runId, { ordinalStart: 0, ordinalEnd: 6, summaries: summaries(0, 6) });
  // Simulate a corrupt/legacy manifest whose retained set includes a foreign
  // ordinal — e.g. a hash-valid legacy artifact admitted out of schedule.
  const extra = [{ identity: { schemaVersion: '2.0.0' }, matchId: 'x-999', matchOrdinal: 999, matchResultHash: 'xh', terminationReason: 'NORMAL_VICTORY' }];
  await store._transact(['runBatches', 'manifests'], async ops => {
    await ops.put('runBatches', { batchId: `${runId}#extra`, runId, batchIndex: 9, ordinalStart: 999, ordinalEnd: 1000, matchCount: 1, summariesHash: hashCanonical(extra), summaries: extra });
    const m = await ops.get('manifests', runId);
    await ops.put('manifests', { ...m, committedBatches: [...m.committedBatches, { batchIndex: 9, ordinalStart: 999, ordinalEnd: 1000, matchCount: 1, summariesHash: hashCanonical(extra) }] });
  });
  // The live controller holds a stale cached manifest — the store-level
  // coverage guard inside finalizeRun must still refuse the seal.
  await assert.rejects(() => api.finalizeExperimentRun(runId), { code: 'RUN_COVERAGE_MISMATCH' });
  assert.equal((await store.getManifest(runId)).sealedRunId, null, 'a coverage-mismatched run must never seal');
});

test('R03: a missing middle stays an honest partial seal — disclosed coverage, not completion', async () => {
  const store = await diagnosticStore(), api = await controller(store), { runId } = await api.beginExperimentRun({ config });
  await api.commitExperimentBatch(runId, { ordinalStart: 0, ordinalEnd: 2, summaries: summaries(0, 2) });
  await api.commitExperimentBatch(runId, { ordinalStart: 4, ordinalEnd: 6, summaries: summaries(4, 2) });
  await api.failExperimentRun(runId, 'stopped');
  const rec = await api.finalizeExperimentRun(runId);
  assert.equal(rec.run.status, RUN_STATUS.COMPLETED);
  assert.equal(rec.run.metrics.matchCount, 4);
  assert.equal(rec.run.config.requestedMatchCount, 6);
  assert.deepEqual(rec.run.config.ordinalCoverage, [{ start: 0, end: 2 }, { start: 4, end: 6 }]);
  assert.ok(rec.run.retentionNote?.includes('partial'));
});

// ── P2 §7: manifest scaling ───────────────────────────────────────
test('R03-scale: manifest metadata stays bounded at 2k/6k/10k retained matches', () => {
  const results = [];
  for (const n of [2000, 6000, 10000]) {
    let m = createRunManifest({ runId: 'RUN-SCALE', experimentId: DEFAULT_EXPERIMENT_ID, ordinal: 0, config: { ...config, matchCount: n, ordinalStart: 0, ordinalEnd: n }, requestedMatches: n, batchSize: 50 });
    const t0 = performance.now();
    for (let o = 0; o < n; o += 50) {
      const items = Array.from({ length: 50 }, (_, i) => ({ o: o + i, h: hashCanonical({ o: o + i }) }));
      m = planManifestBatchCommit(m, { batchIndex: o / 50, ordinalStart: o, ordinalEnd: o + 50, matchCount: 50, summariesHash: `s${o}`, matchResultHashes: items }).manifest;
    }
    const planMs = performance.now() - t0;
    const bytes = byteSize(m);
    const retained = manifestRetainedOrdinals(m).size;
    results.push({ n, bytes, batches: m.committedBatches.length, retained, planMs: Math.round(planMs) });
    assert.equal(retained, n);
    assert.ok(bytes < EXPERIMENT_LIMITS.metaBytes, `${n}-match manifest ${bytes}B exceeds metaBytes ${EXPERIMENT_LIMITS.metaBytes}`);
    assert.equal(m.retainedOrdinals, undefined, 'compact manifests carry no per-ordinal map');
    assert.equal(m.committedBatches[0].matchResultHashes, undefined, 'compact descriptors carry ranges + batch hash only');
  }
  console.log('manifest scaling (bytes / batches / plan-ms):', results.map(r => `${r.n} matches → ${r.bytes}B, ${r.batches} batches, ${r.planMs}ms`).join(' | '));
});

// ── P2 §8: caster full-replay authorization ───────────────────────
const castFrames = (n, redactAt = -1) => Array.from({ length: n }, (_, i) => ({
  state: i === redactAt
    ? { players: { P1: { hand: ['H1'] }, P2: { hand: [] } }, cards: { H1: { identity: 'HIDDEN' } } }
    : { players: { P1: { hand: ['c1', 'c2'] }, P2: { hand: ['c3'] } }, cards: { c1: { identity: 'A' }, c2: { identity: 'B' }, c3: { identity: 'C' } } },
}));
const castResult = { summary: { matchId: 'CAST', winner: 'P1', matchResultHash: 'h', finalStateHash: 'f', profileId: 'p', policyIds: ['a', 'b'] }, provenance: {} };

test('caster: omniscient requires EVERY frame authorized — late-frame redaction fails closed to PUBLIC', () => {
  const frames = castFrames(120);
  const s = new CasterSession({ viewerMode: 'omniscient' });
  s.loadCompletedMatch(castResult, frames);
  assert.equal(s.handsAuthorized, true);
  assert.equal(s.viewerMode, VIEWER_MODE.OMNISCIENT);
  // The SAME replay with a single HIDDEN card at frame 119 — past the old
  // 50-frame scan window — must not project face-up hands.
  const s2 = new CasterSession({ viewerMode: 'omniscient' });
  s2.loadCompletedMatch(castResult, castFrames(120, 119));
  assert.equal(s2.handsAuthorized, false);
  assert.equal(s2.viewerMode, VIEWER_MODE.PUBLIC);
  // A mid-session upgrade request on a redacted artifact is never a grant.
  s2.setViewerMode('omniscient');
  assert.equal(s2.viewerMode, VIEWER_MODE.PUBLIC);
});

// ── P2 §9: eligibility honors the capability policy ───────────────
test('Wave 0: evidence eligibility is bounded by the capability policy even when checks PASS', async () => {
  const src = await readFile(new URL('../apps/lab-web/src/workspaces/evidence.js', import.meta.url), 'utf8');
  assert.ok(src.includes("from '../evolution/lab-trust-policy.mjs'"), 'evidence.js must consult the containment policy');
  assert.ok(src.includes('policyBlocksConfirmatory'), 'policy must bound the composite, not decorate it');
  assert.ok(src.includes('LAB_TRUST_POLICY.confirmatoryComparison'), 'confirmatory gate surfaced');
  assert.ok(src.includes('LAB_TRUST_POLICY.automaticPromotion'), 'promotion gate surfaced');
  assert.equal(LAB_TRUST_POLICY.confirmatoryComparison, false);
  assert.equal(LAB_TRUST_POLICY.automaticPromotion, false);
  assert.equal(LAB_TRUST_POLICY.classification, 'EXPLORATORY');
});


function executionFixture(overrides={}) {
  const calls=[],timeouts=new Map();let next=0;
  const timers={setTimeout(fn){const id=++next;timeouts.set(id,fn);return id;},clearTimeout(id){timeouts.delete(id);},setInterval(){return ++next;},clearInterval(){}};
  const execution={runId:'driver-run',ownerId:'owner',fencingToken:1};
  const driver=campaignExecution({execution,timers,epochId:'test-epoch',commit:async x=>{calls.push(['commit',x.ordinalStart]);},seal:async()=>{calls.push(['seal']);return {};},fail:async cause=>calls.push(['failed',cause.code ?? cause.message]),cancel:async()=>calls.push(['cancelled']),...overrides});
  const worker=()=>({postMessage(request){this.request=request;},terminate(){this.terminated=true;}});
  const a=worker(),b=worker();driver.attach(a,{index:0,config:{}});driver.attach(b,{index:1,config:{}});
  const emit=(w,message)=>w.onmessage?.({data:{workerIndex:w.request.workerIndex,execution:w.request.execution,...message}});
  return {driver,calls,a,b,emit,timeouts};
}
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};

test('R04: first failed commit rejects queued batches and completion; one terminal transition',async()=>{
  let reject;const commits=[];
  const f=executionFixture({commit:x=>{commits.push(x.ordinalStart);return new Promise((_,j)=>{reject=j;});}});
  const late=f.a.onmessage;
  f.emit(f.a,{type:'autonomy-campaign-batch',ordinalStart:0});
  f.emit(f.a,{type:'autonomy-campaign-batch',ordinalStart:2});
  await tick();
  f.emit(f.a,{type:'autonomy-segment-result',ok:true});f.emit(f.b,{type:'autonomy-segment-result',ok:true});
  reject(Object.assign(new Error('quota'),{code:'QUOTA'}));
  const result=await f.driver.done;
  late({data:{type:'autonomy-campaign-batch',workerIndex:0,execution:f.driver.token,ordinalStart:4}});
  assert.deepEqual(commits,[0]);assert.equal(result.state,'failed');assert.deepEqual(f.calls,[['failed','QUOTA']]);
  assert.ok(f.a.terminated && f.b.terminated);
});

test('R04: duplicate completion and mismatched run/fence/epoch cannot finish another segment',async()=>{
  const f=executionFixture(),late=f.a.onmessage;
  for(const change of [{runId:'old'},{fencingToken:0},{epoch:'old'}])f.emit(f.a,{type:'autonomy-campaign-batch',ordinalStart:99,execution:{...f.driver.token,...change}});
  f.emit(f.a,{type:'autonomy-segment-result',ok:true});
  late({data:{type:'autonomy-segment-result',workerIndex:0,execution:f.driver.token,ok:true}});
  await tick();assert.deepEqual(f.calls,[]);
  f.emit(f.b,{type:'autonomy-segment-result',ok:true});assert.equal((await f.driver.done).state,'complete');assert.deepEqual(f.calls,[['seal']]);
});

test('R04: cancellation drains the in-flight commit, drops queued callbacks and never seals',async()=>{
  let release;const commits=[];
  const f=executionFixture({commit:x=>{commits.push(x.ordinalStart);return new Promise(r=>{release=r;});}});
  f.emit(f.a,{type:'autonomy-campaign-batch',ordinalStart:0});f.emit(f.b,{type:'autonomy-campaign-batch',ordinalStart:2});await tick();
  const late=f.b.onmessage;const cancelled=f.driver.cancel();
  late({data:{type:'autonomy-segment-result',ok:true,workerIndex:1,execution:f.driver.token}});
  release();assert.equal((await cancelled).state,'cancelled');assert.deepEqual(commits,[0]);assert.deepEqual(f.calls,[['cancelled']]);
});

test('R04: worker errors, message errors, startup failure and inactivity timeouts share terminal handling',async()=>{
  for(const mode of ['error','message','timeout','startup']){
    const f=executionFixture();
    if(mode==='error')f.a.onerror({message:'worker failure'});
    if(mode==='message')f.a.onmessageerror();
    if(mode==='timeout')[...f.timeouts.values()][0]();
    if(mode==='startup')f.driver.startFailed(new Error('spawn failure'));
    assert.equal((await f.driver.done).state,'failed',mode);assert.equal(f.calls.length,1);assert.ok(f.a.terminated && f.b.terminated);
  }
});

test('R03: stored batch receipts bind payload and exact ordinals; identical retry returns its original receipt',async()=>{
  const store=await diagnosticStore(),api=await controller(store),{runId}=await api.beginExperimentRun({config});
  const committed=await api.commitExperimentBatch(runId,{ordinalStart:0,ordinalEnd:2,summaries:summaries(0,2)});
  const row=await store.getRunBatch(runId,0),{receiptHash,...body}=row.receipt;
  assert.equal(receiptHash,hashCanonical(body));assert.equal(body.runId,runId);assert.equal(body.fencingToken,1);assert.deepEqual(body.ordinals,[0,1]);
  assert.equal(body.payloadDigest,row.summariesHash);assert.deepEqual(committed.receipt,row.receipt);
  const retry=await api.commitExperimentBatch(runId,{ordinalStart:0,ordinalEnd:2,summaries:summaries(0,2)});
  assert.equal(retry.duplicate,true);assert.deepEqual((await store.getRunBatch(runId,0)).receipt,row.receipt);
  const edited=summaries(0,2).map(s=>({...s,unhashedLabel:'different payload'}));
  await assert.rejects(()=>api.commitExperimentBatch(runId,{ordinalStart:0,ordinalEnd:2,summaries:edited}),{code:'RUN_BATCH_CONFLICT'});
});

test('R03/R04: recovery and sealing reject missing, altered or inconsistent stored evidence',async()=>{
  for(const mode of ['missing','bytes','counts','receipt']){
    const store=await diagnosticStore(),api=await controller(store),{runId}=await api.beginExperimentRun({config});
    await api.commitExperimentBatch(runId,{ordinalStart:0,ordinalEnd:2,summaries:summaries(0,2)});await api.cancelExperimentRun(runId);
    await store._transact(['manifests','runBatches'],async ops=>{
      const b=await ops.get('runBatches',`${runId}#0`),m=await ops.get('manifests',runId);
      if(mode==='missing')await ops.del('runBatches',b.batchId);
      if(mode==='bytes')await ops.put('runBatches',{...b,summaries:[{...b.summaries[0],winner:'edited'},b.summaries[1]]});
      if(mode==='receipt')await ops.put('runBatches',{...b,receipt:{...b.receipt,ordinals:[999]}});
      if(mode==='counts')await ops.put('manifests',{...m,committedMatches:6});
    });
    await assert.rejects(()=>api.resumeExperimentRun(runId),/RUN_(BATCH|COVERAGE|COUNTS)/,mode);
    await assert.rejects(()=>api.finalizeExperimentRun(runId),/RUN_(BATCH|COVERAGE|COUNTS)/,mode);
    assert.equal(await store.getRun(runId),null);
  }
});

test('R04: stale execution callbacks cannot commit or cancel after same-controller resume',async()=>{
  const store=await diagnosticStore(),api=await controller(store),begun=await api.beginExperimentRun({config});
  await api.cancelExperimentRun(begun.runId,begun.execution);
  const plan=await api.resumeExperimentRun(begun.runId);
  assert.ok(plan.execution.fencingToken>begun.execution.fencingToken);
  await assert.rejects(()=>api.commitExperimentBatch(begun.runId,{execution:begun.execution,ordinalStart:0,ordinalEnd:2,summaries:summaries(0,2)}),{code:'RUN_EXECUTION_STALE'});
  await assert.rejects(()=>api.cancelExperimentRun(begun.runId,begun.execution),{code:'RUN_EXECUTION_STALE'});
  await api.commitExperimentBatch(begun.runId,{execution:plan.execution,ordinalStart:0,ordinalEnd:2,summaries:summaries(0,2)});
});

test('R04: worker completion cannot relabel missing requested work as successful execution',async()=>{
  const store=await diagnosticStore(),api=await controller(store),{runId,execution}=await api.beginExperimentRun({config});
  await api.commitExperimentBatch(runId,{ordinalStart:0,ordinalEnd:2,summaries:summaries(0,2)});
  await assert.rejects(()=>api.finalizeExperimentRun(runId,{execution,requireComplete:true}),{code:'RUN_REQUESTED_EXECUTION_INCOMPLETE'});
  assert.equal(await store.getRun(runId),null);
  await api.failExperimentRun(runId,'intentional stop',execution);
  const partial=await api.finalizeExperimentRun(runId);
  assert.equal(partial.run.config.requestedMatchCount,6);assert.equal(partial.run.metrics.matchCount,2);
});

test('R04: actual controls ignore an old completion after cancel-then-start',async()=>{
  const src=await readFile(new URL('../apps/lab-web/src/experiment-controls.js',import.meta.url),'utf8');
  const drive=src.slice(src.indexOf('async function _driveRunSegments'),src.indexOf('// Drives the campaign progress bar:'));
  const cancel=src.slice(src.indexOf('function cancelBrowserCampaign()'),src.indexOf('registerRunExecutor(plan'));
  const elements=new Map(),workers=[],sealed=[],state={};
  const element=id=>{if(!elements.has(id))elements.set(id,{textContent:'',disabled:false,hidden:false});return elements.get(id);};
  class Worker{constructor(){workers.push(this);}postMessage(request){this.request=request;}terminate(){}}
  const api=runInNewContext('let activeExecution=null,launchEpoch=0;'+drive+cancel+';({_driveRunSegments,cancelBrowserCampaign})',{
    document:{querySelector:element},performance,Worker,state,campaignExecution,persistenceLabel:x=>x,fmt:String,updateCampaignProgress(){},setCampaignState:x=>{state.phase=x;},refreshRunsUi(){},updateRailContext(){},rerender(){},showToast(){},renderCampaignSummary(){},
    touchRunLease:async()=>{},commitExperimentBatch:async()=>({committedMatches:2}),cancelExperimentRun:async()=>{},failExperimentRun:async()=>{},finalizeExperimentRun:async runId=>{sealed.push(runId);return {run:{metrics:{matchCount:2}},persistenceState:'LOCALLY_COMMITTED'};},RUN_BATCH_SIZE:2,
  });
  const plan=id=>({runId:id,execution:{runId:id,ownerId:'owner',fencingToken:1},config:{matchCount:2},requestedMatches:2,segments:[{index:0,ordinalStart:0,ordinalEnd:2}]});
  const old=api._driveRunSegments(plan('old')),late=workers[0].onmessage;api.cancelBrowserCampaign();
  const current=api._driveRunSegments(plan('new'));await old;
  late({data:{type:'autonomy-segment-result',ok:true,workerIndex:0,execution:workers[0].request.execution}});
  assert.equal(state.activeRunManifest,'new');assert.equal(state.phase,'running');assert.deepEqual(sealed,[]);
  workers[1].onmessage({data:{type:'autonomy-segment-result',ok:true,workerIndex:0,execution:workers[1].request.execution}});
  await current;assert.deepEqual(sealed,['new']);assert.equal(state.phase,'complete');
});
