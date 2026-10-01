import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStartupConfig } from '../apps/match-server/src/startup-config.mjs';
import { SupabaseMatchResultPersistor } from '../apps/match-server/src/persistence/supabase-match-result-persistor.mjs';

test('production rejects absent auth, unsafe origins and volatile persistence before startup', () => {
  const env = { NODE_ENV: 'production' };
  const secure = { authMode: 'required', allowedOrigins: ['https://intrilex.cards'] };
  assert.throws(() => validateStartupConfig({}, env), /auth|AUTH/);
  assert.throws(() => validateStartupConfig({ authMode: 'invalid' }, {}), /Invalid/);
  for (const allowedOrigins of [[], ['*'], ['null'], ['http://intrilex.cards'], ['https://*.intrilex.cards'], ['https://intrilex.cards/path'], [['https://', 'fixture-user', ':', 'fixture-password', '@intrilex.cards'].join('')]]) {
    assert.throws(() => validateStartupConfig({ ...secure, allowedOrigins }, env), /origins/);
  }
  for (const invalid of [{ persistent: false }, { dbPath: ':memory:' }, { dbPath: '' }, { outboxDurable: false }, { outboxPath: ':memory:' }, { allowFakePersistor: true }]) {
    assert.throws(() => validateStartupConfig({ ...secure, ...invalid }, env), /Production/);
  }
  assert.equal(validateStartupConfig(secure, env).authMode, 'required');
  assert.equal(validateStartupConfig({ persistent: false }, {}).authMode, 'disabled');
});

test('server startup applies NODE_ENV production policy before allocating resources', async () => {
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await assert.rejects(startServer({ authMode: 'disabled', persistent: false }), /explicit INTRILEX_AUTH_MODE/);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
  }
});

test('missing transactional RPC never falls back to partial writes when atomic persistence is required', async () => {
  for (const throws of [false, true]) {
    const persistor = Object.create(SupabaseMatchResultPersistor.prototype);
    persistor.requireAtomic = true;
    persistor.isMatchPersisted = async () => false;
    persistor._serializeRecordForRpc = record => record;
    const missing = { code: 'PGRST202', message: 'persist_match_result not found' };
    persistor._client = { rpc: async () => { if (throws) throw missing; return { error: missing }; } };
    let legacyCalls = 0;
    persistor._persistMatchResultLegacy = async () => { legacyCalls++; return { success: true }; };
    const result = await persistor.persistMatchResult({ matchId: 'regression' });
    assert.equal(result.success, false);
    assert.equal(legacyCalls, 0);
    assert.match(result.error, /Atomic/);
    persistor.requireAtomic = false;
    assert.equal((await persistor.persistMatchResult({ matchId: 'development' })).success, true);
    assert.equal(legacyCalls, 1);
  }
});


import http from 'node:http';
import { FakeMatchResultPersistor } from '../apps/match-server/src/persistence/fake-match-result-persistor.mjs';
test('listener startup failure rejects and closes persistence; a subsequent server can start', async () => {
  const occupied = http.createServer();
  await new Promise(resolve => occupied.listen(0, '127.0.0.1', resolve));
  const port = occupied.address().port;
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const persistor = new FakeMatchResultPersistor();
  let closed = false;
  persistor.close = () => { closed = true; };
  try {
    await assert.rejects(startServer({ port, host: '127.0.0.1', persistent: false, authMode: 'disabled', matchResultPersistor: persistor }), /EADDRINUSE/);
    assert.equal(closed, true, 'failed listener startup releases persistence');
  } finally { await new Promise(resolve => occupied.close(resolve)); }
  const server = await startServer({ port, host: '127.0.0.1', persistent: false, authMode: 'disabled' });
  await server.close();
});


import { startServerMaintenance } from '../apps/match-server/src/server-maintenance.mjs';
test('maintenance owns two timers, liveness bookkeeping and expiry cleanup', () => {
  const callbacks = new Map();
  const calls = [];
  const peer = name => ({ lastHeartbeat: name === 'dead' ? 0 : 990,
    ws: { ping: () => calls.push(`ping:${name}`), terminate: () => calls.push(`terminate:${name}`) } });
  const connections = new Map([['dead', peer('dead')], ['live', peer('live')]]);
  const bans = new Map([['old', 1], ['current', 2000]]);
  const auth = new Map([['old', [1]], ['current', [1, 950]]]);
  const maintenance = startServerMaintenance({
    connections, disconnect: cid => calls.push(`disconnect:${cid}`), logEvent: () => {},
    heartbeatInterval: 100, matchStore: { cleanExpired: policy => calls.push(policy) },
    lobbyTtl: 10, matchTtl: 20, matchmakingQueue: { cleanExpired: () => ['live', 'gone'] },
    onQueueTimeout: () => calls.push('queue-timeout'), bannedIps: bans, authAttempts: auth,
    authAttemptWindowMs: 100, now: () => 1000,
    timers: { setInterval(fn, period) { callbacks.set(period, fn); return period; }, clearInterval(id) { callbacks.delete(id); } },
  });
  assert.equal(callbacks.size, 2);
  callbacks.get(100)(); callbacks.get(60000)();
  assert.deepEqual(calls, ['disconnect:dead', 'terminate:dead', 'ping:live', { lobbyTtl: 10, matchTtl: 20, historyTtl: 3600000 }, 'queue-timeout']);
  assert.deepEqual([...bans.keys()], ['current']);
  assert.deepEqual([...auth], [['current', [950]]]);
  maintenance.stop(); maintenance.stop();
  assert.equal(callbacks.size, 0, 'shutdown removes both intervals exactly once');
});
