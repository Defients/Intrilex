/* global queueMicrotask */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runLabSeries, evolutionIdentity } from '../packages/simulation-runtime/src/evolution-lab.mjs';
import { strategyGameEvidence } from '../packages/simulation-runtime/src/strategy-evidence.mjs';
import { strategyEvidenceForGame, createStrategyEvidenceWriter } from '../packages/simulation-runtime/src/strategy-live.mjs';
import { nextStudySuggestionFor } from '../packages/simulation-runtime/src/strategy-analysis.mjs';
import { strategyDigest } from '../packages/simulation-runtime/src/strategy-contracts.mjs';
import { StrategyStore } from '../apps/lab-web/src/strategy/strategy-store.mjs';
import { createStrategyExplanationPacket, createControlledStudyPacket, createPolicyComparePacket, createGuidePacket, createEvidenceDeskPacket, validateStrategyExplanation } from '../packages/analytics-ai/src/strategy-interpreter.mjs';
import { discoverOllama, verifyModel } from '../packages/analytics-ai/src/model-discovery.mjs';

// ── Minimal in-memory IndexedDB ───────────────────────────────────────
// Exercises the real StrategyStore insert/dedup path (get → verify → add)
// without a browser. Only the API surface the store uses is implemented.
const keyEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function fakeRequest() { return { result: undefined, error: null }; }
function memoryIdbFactory() {
  const stores = new Map(); // name → {keyPath, indexes:Map(name→{keyPath,multiEntry}), data:Map}
  const ensure = (name, keyPath) => { if (!stores.has(name)) stores.set(name, { keyPath, indexes: new Map(), data: new Map() }); return stores.get(name); };
  const matchesIndex = (row, spec, only) => {
    if (only === undefined) return true;
    const v = row?.[spec.keyPath];
    return spec.multiEntry ? (Array.isArray(v) && v.some(x => keyEq(x, only))) : keyEq(v, only);
  };
  function cursorReq(r, rows) {
    let i = 0;
    const step = () => {
      r.result = i < rows.length ? { value: rows[i], continue: () => { i++; queueMicrotask(step); } } : null;
      r.onsuccess?.();
    };
    queueMicrotask(step); return r;
  }
  function transaction() {
    const tx = { aborted: false, error: null, oncomplete: null, onabort: null, onerror: null,
      objectStore: n => storeObj(n),
      abort() { if (tx.aborted) return; tx.aborted = true; tx.error = new Error('ABORTED'); queueMicrotask(() => tx.onabort?.()); } };
    // All request callbacks are microtask-chained; the transaction completes
    // on the next macrotask once the callback cascade has drained.
    setTimeout(() => { if (!tx.aborted) tx.oncomplete?.(); }, 0);
    return tx;
  }
  function storeObj(name) {
    const s = ensure(name);
    return {
      keyPath: s.keyPath,
      indexNames: { contains: n => s.indexes.has(n) },
      createIndex(n, keyPath, opts = {}) { s.indexes.set(n, { keyPath, multiEntry: !!opts.multiEntry }); },
      index(n) { const spec = s.indexes.get(n); return {
        count(range) { const r = fakeRequest(); queueMicrotask(() => { r.result = [...s.data.values()].filter(row => matchesIndex(row, spec, range?.__only)).length; r.onsuccess?.(); }); return r; },
        openCursor(range) { const rows = [...s.data.values()].filter(row => matchesIndex(row, spec, range?.__only)); return cursorReq(fakeRequest(), rows); } }; },
      get(key) { const r = fakeRequest(); queueMicrotask(() => { r.result = s.data.get(key); r.onsuccess?.(); }); return r; },
      add(value) { const r = fakeRequest(); queueMicrotask(() => { s.data.set(value[s.keyPath], value); r.onsuccess?.(); }); return r; },
      delete(key) { const r = fakeRequest(); queueMicrotask(() => { s.data.delete(key); r.onsuccess?.(); }); return r; },
      openCursor(range) { const rows = [...s.data.values()].filter(row => range === undefined || keyEq(row[s.keyPath], range.__only)); return cursorReq(fakeRequest(), rows); }
    };
  }
  const db = { objectStoreNames: { contains: n => stores.has(n) }, transaction, close() {}, onversionchange: null };
  db.createObjectStore = (n, opts) => { const s = ensure(n, opts.keyPath); return { indexNames: { contains: i => s.indexes.has(i) }, createIndex(i, keyPath, o = {}) { s.indexes.set(i, { keyPath, multiEntry: !!o.multiEntry }); } }; };
  return {
    open() {
      const request = fakeRequest();
      const firstOpen = stores.size === 0;
      if (firstOpen) for (const [name, keyPath] of [['evidence','artifactId'],['sources','artifactId'],['events','eventId'],['replays','replayHash'],['studies','artifactId'],['claims','artifactId'],['archives','archiveId'],['informationSets','artifactId'],['informationPlans','artifactId'],['informationStudies','artifactId']]) ensure(name, keyPath);
      queueMicrotask(() => {
        request.result = db;
        request.transaction = transaction();
        if (firstOpen) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    }
  };
}
globalThis.IDBKeyRange = globalThis.IDBKeyRange ?? { only: key => ({ __only: key }) };

// The upgrade path calls request.transaction.objectStore('events').createIndex —
// our transaction.objectStore targets the named store even mid-upgrade.
// ── Real traced run fixture ───────────────────────────────────────────
const identity = await evolutionIdentity();
const config = { botA: 'value', botB: 'tempo', gameCount: 4, seed: 1337, workerCount: 1, strategicTrace: true, kind: 'EVALUATION', mirrorSeats: true };
const run = (await runLabSeries(config, { identity, createdAt: '2026-10-04T16:00:00.000Z' })).run;
assert.ok(run.records.length === 4 && run.records.every(r => r.strategyDecisions?.length), 'fixture run has traced games');

// ── Canonical per-game path ───────────────────────────────────────────
test('streamed envelope and bare record produce byte-identical evidence', () => {
  const record = run.records[0];
  const fromRecord = strategyEvidenceForGame(run, record);
  const fromEnvelope = strategyEvidenceForGame(run, { record, replay: run.replays.find(r => r.ordinal === record.ordinal)?.replay ?? null });
  assert.equal(fromRecord.evidence.artifactId, fromEnvelope.evidence.artifactId);
  assert.equal(strategyDigest(fromRecord.evidence), strategyDigest(fromEnvelope.evidence));
  assert.equal(fromRecord.evidence.artifactId, strategyGameEvidence(run, record).artifactId);
});

test('writer streams finalized games into a real StrategyStore during execution', async () => {
  const store = new StrategyStore(memoryIdbFactory());
  const writer = createStrategyEvidenceWriter(store);
  // Simulate the mid-run state: only the first two games have been accepted.
  for (const record of run.records.slice(0, 2)) await writer.offer(run, { record, replay: null });
  const mid = await writer.flush();
  assert.equal(mid.offered, 2); assert.equal(mid.committed, 2); assert.equal(mid.failed, 0);
  const midSources = await store.listSources();
  assert.equal(midSources.length, 2, 'partial series evidence is durable before completion');
  // Later "ingest saved evidence" re-offers every finalized game — dedup is exact.
  for (const record of run.records) await writer.offer(run, record);
  const final = await writer.flush();
  assert.equal(final.offered, 6); assert.equal(final.committed, 6); assert.equal(final.failed, 0);
  const sources = await store.listSources();
  assert.equal(new Set(sources.map(s => s.artifactId)).size, sources.length);
  const events = []; await store.scan('events', { visit: row => events.push(row) });
  assert.equal(new Set(events.map(e => e.eventId)).size, events.length, 'no duplicated decision events');
  const expected = run.records.reduce((n, r) => n + r.strategyDecisions.length, 0);
  assert.equal(events.length, expected, 'streamed + resynced events equal the real decision count');
  store.close();
});

test('persistence failure is recorded, never silent, and does not kill the stream', async () => {
  const inner = memoryIdbFactory();
  const store = new StrategyStore(inner);
  const real = store.addEvidence.bind(store);
  let failOnce = true;
  store.addEvidence = async (e, r) => { if (failOnce) { failOnce = false; throw new Error('INJECTED_QUOTA'); } return real(e, r); };
  const writer = createStrategyEvidenceWriter(store);
  for (const record of run.records) await writer.offer(run, record);
  const stats = await writer.flush();
  assert.equal(stats.offered, 4); assert.equal(stats.committed, 3); assert.equal(stats.failed, 1);
  assert.match(stats.error, /INJECTED_QUOTA/);
  assert.equal((await store.listSources()).length, 3, 'committed games survive the failed write');
  store.close();
});

test('writer queue stays bounded and reports peak pending writes', async () => {
  const store = new StrategyStore(memoryIdbFactory());
  const real = store.addEvidence.bind(store);
  store.addEvidence = async (e, r) => { await new Promise(res => setTimeout(res, 4)); return real(e, r); };
  const writer = createStrategyEvidenceWriter(store, { maxPending: 2 });
  for (const record of run.records) await writer.offer(run, record);
  const stats = await writer.flush();
  assert.ok(writer.stats.maxPending <= 2, `pending never exceeds bound (got ${writer.stats.maxPending})`);
  assert.equal(stats.committed, 4);
  store.close();
});

test('malformed game input fails into stats, never throws into execution', async () => {
  const store = new StrategyStore(memoryIdbFactory());
  const writer = createStrategyEvidenceWriter(store);
  await writer.offer(run, { ordinal: 999 });
  const stats = await writer.flush();
  assert.equal(stats.failed, 1); assert.ok(stats.error);
  store.close();
});

// ── Packet fix: controlled uncertainty ────────────────────────────────
const suggestive = { confidence: 'SUGGESTIVE', recommendation: 'PLAY', evidenceType: 'COUNTERFACTUAL', estimatedMagnitude: 0.31, statement: 'Use it.', uncertainty: { interval: [0.08, 0.54] }, statementData: { heterogeneity: 'ROBUST', hiddenWorlds: 128 }, provenance: [], artifactId: 'SI-x' };
const experimentalNoInterval = { confidence: 'EXPERIMENTAL', recommendation: 'UNKNOWN', evidenceType: 'COUNTERFACTUAL', estimatedMagnitude: 0.12, uncertainty: {}, statementData: { hiddenWorlds: 64 }, provenance: [], artifactId: 'SI-y' };

test('valid controlled interval reaches the packet and marks a real bound', () => {
  const packet = createStrategyExplanationPacket({ subject: 'rank:7', controlledClaims: [suggestive] });
  assert.deepEqual(packet.actionable[0].intervalPoints, [0.08, 0.54], 'exact claim.uncertainty.interval mapped');
  assert.equal(packet.uncertainty.controlledBoundExists, true);
  const intervals = packet.controlledSummary.intervals;
  assert.equal(intervals.length, 1); assert.deepEqual(intervals[0].intervalPoints, [0.08, 0.54]);
});

test('experimental-only or interval-less controlled evidence never fabricates a bound', () => {
  const packet = createStrategyExplanationPacket({ subject: 'rank:7', controlledClaims: [experimentalNoInterval] });
  assert.equal(packet.uncertainty.controlledBoundExists, false);
  assert.equal(packet.controlledSummary.intervals[0].intervalPoints, null);
  const bare = createStrategyExplanationPacket({ subject: 'rank:Q' });
  assert.equal(bare.uncertainty.controlledBoundExists, false);
});

// ── Unit-aware grounding ──────────────────────────────────────────────
const basePacket = () => createStrategyExplanationPacket({
  subject: 'rank:7', humanSubjectName: '7 · Seven',
  aggregate: { total: { decisions: 200, opportunities: 150, selected: 29, skipped: 121, selectionRate: 0.194, holdRate: 0.806, selectedOutcomeAssociation: 0.7, skippedOutcomeAssociation: 0.336 }, timing: [], semantics: {}, games: 29, seedBlocks: 4, distinctStates: 87, policies: ['value'], matchups: [] },
  controlledClaims: [suggestive]
});
const okText = label => ({ headline: 'h', plainSummary: 'p', whatThisMeans: 'm', whatThisDoesNotMean: 'd', practicalTakeaway: 't', interestingSignal: 's', nextUsefulTest: 'n', warnings: [], confidenceLanguage: 'SUGGESTIVE', evidenceLabel: label });

test('packet publishes typed grounding facts with rendered displays', () => {
  const packet = basePacket();
  const byId = Object.fromEntries(packet.groundingFacts.map(f => [f.id, f]));
  assert.equal(byId.unique_games.unit, 'COUNT_GAMES');
  assert.equal(byId.unique_games.display, '29 games');
  assert.equal(byId.selection_rate.unit, 'PERCENT');
  assert.equal(byId.selection_rate.display, '19.4%');
  assert.equal(byId.observational_association.unit, 'PERCENTAGE_POINTS');
  assert.equal(byId.observational_association.display, '+36.4 pp');
});

test('a game count can never authorize a percentage', () => {
  const packet = basePacket();
  assert.throws(() => validateStrategyExplanation({ ...okText('CONTROLLED_ADVICE'), plainSummary: 'Win rate was 29%.' }, packet), /UNGROUNDED_NUMBER/);
  assert.doesNotThrow(() => validateStrategyExplanation({ ...okText('CONTROLLED_ADVICE'), plainSummary: '29 games of traced evidence.' }, packet));
});

test('rates ground percentages but never counts; pp ground intervals but never percents', () => {
  const packet = basePacket();
  assert.doesNotThrow(() => validateStrategyExplanation({ ...okText('CONTROLLED_ADVICE'), plainSummary: 'Used on 19.4% of opportunities.' }, packet));
  assert.throws(() => validateStrategyExplanation({ ...okText('CONTROLLED_ADVICE'), plainSummary: 'Used in 19.4 games.' }, packet), /UNGROUNDED_NUMBER/);
  assert.doesNotThrow(() => validateStrategyExplanation({ ...okText('CONTROLLED_ADVICE'), interestingSignal: '+36.4 pp observational association.' }, packet));
  assert.doesNotThrow(() => validateStrategyExplanation({ ...okText('CONTROLLED_ADVICE'), interestingSignal: '36.4 percentage points stronger when selected.' }, packet));
  assert.throws(() => validateStrategyExplanation({ ...okText('CONTROLLED_ADVICE'), interestingSignal: 'A 36.4% win-rate boost.' }, packet), /UNGROUNDED_NUMBER/);
});

test('card and rank numerals are not mistaken for statistics', () => {
  const packet = basePacket();
  for (const text of ['Seven deserves a controlled test.', 'Rank 7 looks interesting.', 'Preserve Seven when the Swap Bar shows it.'])
    assert.doesNotThrow(() => validateStrategyExplanation({ ...okText('CONTROLLED_ADVICE'), practicalTakeaway: text }, packet), text);
});

test('usedFactIds must reference real grounding facts', () => {
  const packet = basePacket();
  assert.doesNotThrow(() => validateStrategyExplanation({ ...okText('CONTROLLED_ADVICE'), usedFactIds: ['selection_rate', 'unique_games'] }, packet));
  assert.throws(() => validateStrategyExplanation({ ...okText('CONTROLLED_ADVICE'), usedFactIds: ['win_rate'] }, packet), /UNKNOWN_FACT/);
});

// ── Surface packets ───────────────────────────────────────────────────
const banned = ['artifactId', 'provenance', 'replayHash', 'commands', 'HIDDEN', 'derivedSeed', 'initialStateHash', 'masterSeed'];

test('CONTROLLED_STUDY packet carries public study metadata only', () => {
  const study = { status: 'COMPLETE', faults: 0, counts: { hiddenWorlds: 12, continuationsPerWorld: 1, executions: 36 }, plan: { question: { subject: 'family:draw' }, rulesProfile: 'core-advanced-authority', eraId: 'e'.repeat(64), seeds: [1, 2], artifactId: 'SI-plan' }, informationSet: { projection: { own: { hand: [{ identity: '3H' }] } } } };
  const packet = createControlledStudyPacket({ study, claims: [suggestive] });
  const json = JSON.stringify(packet);
  for (const key of banned) assert.equal(json.includes(key), false, `leaks ${key}`);
  assert.equal(packet.surface, 'CONTROLLED_STUDY');
  assert.equal(packet.surfaceData.study.hiddenWorlds, 12);
  assert.ok(packet.groundingFacts.some(f => f.id === 'study_worlds' && f.unit === 'COUNT_WORLDS'));
});

test('POLICY_COMPARE packet exposes both sides under one era', () => {
  const aggregate = { total: { decisions: 10, opportunities: 40, selected: 8, skipped: 32, selectionRate: 0.2, holdRate: 0.8, selectedOutcomeAssociation: 0.5, skippedOutcomeAssociation: 0.5 }, timing: [], semantics: {}, games: 4, matchups: [], policies: [] };
  const packet = createPolicyComparePacket({ left: { id: 'value', aggregate }, right: { id: 'tempo', aggregate }, context: { eraId: 'e'.repeat(64) } });
  assert.equal(packet.surface, 'POLICY_COMPARE');
  assert.equal(packet.surfaceData.comparison.left.id, 'value');
  assert.ok(packet.groundingFacts.some(f => f.id === 'left_selection_rate' && f.display === '20.0%'));
});

test('GUIDE packet embeds the deterministic artifact as interpretation input', () => {
  const manifest = { entries: [{ claimId: 'SI-1', subject: 'rank:7' }], claims: [suggestive], leads: [], generatedAt: 't' };
  const packet = createGuidePacket({ manifest, markdown: '# Guide\nSeven looks promising.' });
  assert.equal(packet.surface, 'GUIDE');
  assert.match(packet.surfaceData.guide.text, /Seven looks promising/);
  assert.equal(packet.groundingFacts.some(f => f.id === 'guide_subjects'), true);
});

test('EVIDENCE_DESK packet summarizes counts, never artifacts', () => {
  const packet = createEvidenceDeskPacket({ summary: { sources: 12, fullDecisionGames: 9, events: 640, subjects: 21, transcripts: 4, importedResearch: 0, studies: 1, informationStudies: 0 } });
  const json = JSON.stringify(packet);
  for (const key of banned) assert.equal(json.includes(key), false, `leaks ${key}`);
  assert.equal(packet.surface, 'EVIDENCE_DESK');
  assert.equal(packet.groundingFacts.find(f => f.id === 'desk_games').display, '9 games');
});

test('surface packets reject unsafe or oversized surfaceData', () => {
  assert.throws(() => createStrategyExplanationPacket({ subject: 'rank:7', surfaceData: { leak: { commands: [] } } }), /UNSAFE_KEY/);
  assert.throws(() => createStrategyExplanationPacket({ subject: 'rank:7', surfaceData: { blob: 'x'.repeat(30000) } }), /TOO_LARGE/);
});

// ── Ollama discovery UX state ─────────────────────────────────────────
const mockFetch = handler => async (url, opts) => handler(url, opts);
const json = (data, status = 200) => ({ ok: status < 300, status, json: async () => data, text: async () => JSON.stringify(data) });

test('discoverOllama reports unreachable distinctly from a populated model list', async () => {
  const off = await discoverOllama({ endpoint: 'http://127.0.0.1:1', timeoutMs: 300 });
  assert.equal(off.reachable, false); assert.equal(off.models.length, 0); assert.ok(off.error);
});

test('model listing parses /api/tags and missing models stay missing', async () => {
  const { OllamaClient } = await import('../packages/analytics-ai/src/ollama-client.mjs');
  const client = new OllamaClient({ endpoint: 'http://localhost:11434', fetchImpl: mockFetch(async url => url.endsWith('/api/tags') ? json({ models: [{ name: 'llama3.1:latest', size: 1 }] }) : json({ version: '0.5.0' })) });
  const list = await client.listModels();
  assert.equal(list.ok, true); assert.equal(list.models[0].name, 'llama3.1:latest');
  const missing = await verifyModel({ endpoint: 'http://127.0.0.1:1', model: 'x', timeoutMs: 300 });
  assert.equal(missing.available, false); assert.equal(missing.reason, 'unreachable');
});

// ── Subject-aware next-study templates ────────────────────────────────
const withOpps = n => ({ total: { opportunities: n } });
test('next-study suggestions are subject-aware, never universal boilerplate', () => {
  assert.match(nextStudySuggestionFor('rank:7', withOpps(10)), /using vs preserving this card/i);
  assert.match(nextStudySuggestionFor('card:7H', withOpps(10)), /using vs preserving this card/i);
  assert.match(nextStudySuggestionFor('family:draw', withOpps(10)), /non-draw legal alternatives/i);
  assert.match(nextStudySuggestionFor('family:score', withOpps(10)), /non-scoring legal alternatives/i);
  assert.match(nextStudySuggestionFor('family:scuttle', withOpps(10)), /preserving or declining/i);
  assert.match(nextStudySuggestionFor('combination:royal-marriage', withOpps(10)), /committing the combination/i);
  assert.match(nextStudySuggestionFor('mode:draw:take', withOpps(10)), /other legal modes/i);
  assert.match(nextStudySuggestionFor('timing:OPENING', withOpps(10)), /other phases/i);
  assert.match(nextStudySuggestionFor('mode:weird', withOpps(10)), /other legal modes|no controlled next-study template/i);
  assert.match(nextStudySuggestionFor('family:mystery', withOpps(10)), /preserving or declining|no controlled next-study template/i);
  assert.match(nextStudySuggestionFor('rank:7', null), /no legal opportunities/i);
});

// ── UI truthfulness (static contract) ─────────────────────────────────
test('dashboard never claims separately-retained evidence without real counts', async () => {
  const src = await readFile(new URL('../apps/lab-web/src/workspaces/evolution-dashboard.js', import.meta.url), 'utf8');
  assert.equal(src.includes('retained separately'), false, 'unconditional "retained separately" claim removed');
  assert.match(src, /Strategy evidence: .*finalized games retained/, 'truthful retained-count note exists');
});

test('workspace separates AI status from AI error', async () => {
  const src = await readFile(new URL('../apps/lab-web/src/strategy/strategy-workspace.js', import.meta.url), 'utf8');
  assert.match(src, /v\.aiStatus/); assert.match(src, /v\.aiError/);
  assert.equal(src.includes('Ollama unavailable or output rejected'), false, 'no error suffix on success states');
  assert.match(src, /Ollama reachable/, 'success status exists');
});

test('rank semantic overlap is explained as non-additive accounting lenses', async () => {
  const src = await readFile(new URL('../apps/lab-web/src/strategy/strategy-workspace.js', import.meta.url), 'utf8');
  assert.match(src, /categories can overlap/i);
  assert.match(src, /must not be added together|not be added/i);
});
