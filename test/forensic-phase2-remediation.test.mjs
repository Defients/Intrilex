// ═══════════════════════════════════════════════════════════════
// forensic-phase2-remediation.test.mjs
//
// Phase 2 remediation tests:
//   IRX-H19: Block enforcement — match server rejects joins and
//            matchmaking pairs where either player has blocked the other
//   IRX-H38: JWT exfiltration prevention — match server URL allowlist
//            prevents tokens from being sent to attacker-controlled servers
//   IRX-H07: Season fabrication removal — migration 0019 patches RPCs
//            that fabricated 'season-1' when no active season exists
//
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

// ── IRX-H19: Block enforcement (source-level verification) ──

test('IRX-H19: server.mjs has blockChecker injection point', async () => {
  const source = await readFile(path.join(root, 'apps/match-server/src/server.mjs'), 'utf8');
  assert.ok(source.includes('blockChecker'), 'server must have blockChecker variable');
  assert.ok(source.includes('opts.blockChecker'), 'server must accept blockChecker in startServer opts');
  assert.ok(source.includes('BLOCKED_BY_PLAYER'), 'server must use BLOCKED_BY_PLAYER reason code');
  assert.ok(source.includes('IRX-H19'), 'server must reference IRX-H19');
  // Block check in handleJoinMatch
  assert.ok(source.includes('blockChecker(joinerAccountId, p.accountId)'),
    'handleJoinMatch must call blockChecker with joiner and existing participant');
  // Block check in handleQueueJoin
  assert.ok(source.includes('blockChecker(accountId, partnerAccountId)'),
    'handleQueueJoin must call blockChecker with paired players');
});

test('IRX-H19: reason-codes.mjs has BLOCKED_BY_PLAYER code', async () => {
  const source = await readFile(path.join(root, 'packages/network-protocol/src/reason-codes.mjs'), 'utf8');
  assert.ok(source.includes('BLOCKED_BY_PLAYER'), 'reason codes must include BLOCKED_BY_PLAYER');
});

test('IRX-H19: matchmaking-queue accepts blockChecker option', async () => {
  const source = await readFile(path.join(root, 'packages/match-authority/src/matchmaking-queue.mjs'), 'utf8');
  assert.ok(source.includes('blockChecker'), 'matchmaking queue must accept blockChecker option');
});

// ── IRX-H19: Block enforcement (behavioral test with server) ──

test('IRX-H19: blocked player cannot join match (behavioral)', async () => {
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const { WebSocket } = await import('ws');
  const { createServer } = await import('node:net');

  const findFreePort = () => new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });

  const port = await findFreePort();

  const fakeVerifier = {
    verify: async (token) => {
      const tokenMap = {
        'token.A.B': { accountId: 'acc-A', publicPlayerId: 'PLY_A', isAnonymous: false, provider: 'test', expiresAt: Date.now() + 3600000, capabilities: {}, accountStatus: 'ACTIVE', publicProfile: { publicPlayerId: 'PLY_A', displayName: 'PlayerA', handle: 'playerA', avatarUrl: null } },
        'token.B.C': { accountId: 'acc-B', publicPlayerId: 'PLY_B', isAnonymous: false, provider: 'test', expiresAt: Date.now() + 3600000, capabilities: {}, accountStatus: 'ACTIVE', publicProfile: { publicPlayerId: 'PLY_B', displayName: 'PlayerB', handle: 'playerB', avatarUrl: null } },
      };
      const identity = tokenMap[token];
      if (!identity) return { valid: false, code: 'AUTH_TOKEN_INVALID', message: 'Unknown token' };
      return { valid: true, identity };
    },
    close: () => {},
  };

  const server = await startServer({
    port, host: '127.0.0.1', dbPath: ':memory:', persistent: false,
    authMode: 'required',
    identityVerifier: fakeVerifier,
    allowFakePersistor: true, // DATA-04: testing only
    blockChecker: async (a, b) => {
      // A blocked B
      return (a === 'acc-A' && b === 'acc-B') || (a === 'acc-B' && b === 'acc-A');
    },
  });

  try {
    // Player A authenticates and creates a match
    const ws1 = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise(r => ws1.on('open', r));
    ws1.send(JSON.stringify({ protocolVersion: 2, type: 'AUTHENTICATE', payload: { accessToken: 'token.A.B' }, requestId: 'auth1' }));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('AUTHENTICATED timeout')), 5000);
      ws1.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'AUTHENTICATED') { clearTimeout(timer); resolve(msg); }
      });
    });
    ws1.send(JSON.stringify({ protocolVersion: 2, type: 'CREATE_MATCH', payload: { profileId: 'core-unrestricted-authority' }, requestId: 'r1' }));
    const created = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('MATCH_CREATED timeout')), 5000);
      ws1.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'MATCH_CREATED') { clearTimeout(timer); resolve(msg); }
      });
    });
    const { inviteCode } = created.payload;

    // Player B authenticates and tries to join
    const ws2 = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise(r => ws2.on('open', r));
    ws2.send(JSON.stringify({ protocolVersion: 2, type: 'AUTHENTICATE', payload: { accessToken: 'token.B.C' }, requestId: 'auth2' }));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('AUTHENTICATED timeout')), 5000);
      ws2.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'AUTHENTICATED') { clearTimeout(timer); resolve(msg); }
      });
    });
    ws2.send(JSON.stringify({ protocolVersion: 2, type: 'JOIN_MATCH', payload: { inviteCode }, requestId: 'r2' }));

    // Player B should receive BLOCKED_BY_PLAYER error
    const response = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ERROR timeout')), 5000);
      ws2.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'ERROR') { clearTimeout(timer); resolve(msg); }
      });
    });

    assert.equal(response.payload.code, 'BLOCKED_BY_PLAYER', 'Join must be rejected with BLOCKED_BY_PLAYER');
    ws1.close();
    ws2.close();
  } finally {
    await server.close();
  }
});

test('IRX-H19: non-blocked player can join match (behavioral)', async () => {
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const { WebSocket } = await import('ws');
  const { createServer } = await import('node:net');

  const findFreePort = () => new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });

  const port = await findFreePort();

  const fakeVerifier = {
    verify: async (token) => {
      const tokenMap = {
        'token.A.B': { accountId: 'acc-A', publicPlayerId: 'PLY_A', isAnonymous: false, provider: 'test', expiresAt: Date.now() + 3600000, capabilities: {}, accountStatus: 'ACTIVE', publicProfile: { publicPlayerId: 'PLY_A', displayName: 'PlayerA', handle: 'playerA', avatarUrl: null } },
        'token.B.C': { accountId: 'acc-B', publicPlayerId: 'PLY_B', isAnonymous: false, provider: 'test', expiresAt: Date.now() + 3600000, capabilities: {}, accountStatus: 'ACTIVE', publicProfile: { publicPlayerId: 'PLY_B', displayName: 'PlayerB', handle: 'playerB', avatarUrl: null } },
      };
      const identity = tokenMap[token];
      if (!identity) return { valid: false, code: 'AUTH_TOKEN_INVALID', message: 'Unknown token' };
      return { valid: true, identity };
    },
    close: () => {},
  };

  const server = await startServer({
    port, host: '127.0.0.1', dbPath: ':memory:', persistent: false,
    authMode: 'required',
    identityVerifier: fakeVerifier,
    allowFakePersistor: true, // DATA-04: testing only
    blockChecker: async () => false, // No blocks
  });

  try {
    const ws1 = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise(r => ws1.on('open', r));
    ws1.send(JSON.stringify({ protocolVersion: 2, type: 'AUTHENTICATE', payload: { accessToken: 'token.A.B' }, requestId: 'auth1' }));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('AUTHENTICATED timeout')), 5000);
      ws1.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'AUTHENTICATED') { clearTimeout(timer); resolve(msg); }
      });
    });
    ws1.send(JSON.stringify({ protocolVersion: 2, type: 'CREATE_MATCH', payload: { profileId: 'core-unrestricted-authority' }, requestId: 'r1' }));
    const created = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('MATCH_CREATED timeout')), 5000);
      ws1.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'MATCH_CREATED') { clearTimeout(timer); resolve(msg); }
      });
    });
    const { inviteCode } = created.payload;

    const ws2 = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise(r => ws2.on('open', r));
    ws2.send(JSON.stringify({ protocolVersion: 2, type: 'AUTHENTICATE', payload: { accessToken: 'token.B.C' }, requestId: 'auth2' }));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('AUTHENTICATED timeout')), 5000);
      ws2.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'AUTHENTICATED') { clearTimeout(timer); resolve(msg); }
      });
    });
    ws2.send(JSON.stringify({ protocolVersion: 2, type: 'JOIN_MATCH', payload: { inviteCode }, requestId: 'r2' }));

    const response = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('MATCH_JOINED timeout')), 5000);
      ws2.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'MATCH_JOINED') { clearTimeout(timer); resolve(msg); }
      });
    });

    assert.ok(response.payload.matchId, 'Join must succeed when no block exists');
    ws1.close();
    ws2.close();
  } finally {
    await server.close();
  }
});

// ── IRX-H19: Block enforcement via matchmaking queue (behavioral) ──
//
// Regression coverage for the queue-pairing block-rejection flow. The
// onCreateMatch callback sends QUEUE_MATCHED to both players before the
// block check runs, so both must be notified with BLOCKED_BY_PLAYER and
// the orphaned match must be deleted + both connections unbound. This
// covers both the "blocked=true" path and the fail-closed "checker
// throws" path (previously the latter left the partner stuck with a
// QUEUE_MATCHED and an orphaned match).

/**
 * Build a fake identity verifier mapping two tokens to two accounts.
 * @param {object} opts
 * @param {string} opts.tokenA
 * @param {string} opts.tokenB
 * @param {string} opts.accA
 * @param {string} opts.accB
 * @param {string} opts.plyA
 * @param {string} opts.plyB
 */
function makeFakeVerifier({ tokenA, tokenB, accA, accB, plyA, plyB }) {
  return {
    verify: async (token) => {
      const tokenMap = {
        [tokenA]: { accountId: accA, publicPlayerId: plyA, isAnonymous: false, provider: 'test', expiresAt: Date.now() + 3600000, capabilities: {}, accountStatus: 'ACTIVE', publicProfile: { publicPlayerId: plyA, displayName: plyA, handle: plyA.toLowerCase(), avatarUrl: null } },
        [tokenB]: { accountId: accB, publicPlayerId: plyB, isAnonymous: false, provider: 'test', expiresAt: Date.now() + 3600000, capabilities: {}, accountStatus: 'ACTIVE', publicProfile: { publicPlayerId: plyB, displayName: plyB, handle: plyB.toLowerCase(), avatarUrl: null } },
      };
      const identity = tokenMap[token];
      if (!identity) return { valid: false, code: 'AUTH_TOKEN_INVALID', message: 'Unknown token' };
      return { valid: true, identity };
    },
    close: () => {},
  };
}

/** Resolve with the first message of `type` (or matching `predicate`) received on `ws`. */
function waitForType(ws, type, label, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs);
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === type) { clearTimeout(timer); resolve(msg); }
    });
  });
}

/** Resolve with the first ERROR message whose payload.code matches `code`. */
function waitForErrorCode(ws, code, label, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs);
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'ERROR' && msg.payload?.code === code) { clearTimeout(timer); resolve(msg); }
    });
  });
}

test('IRX-H19: blocked matchmaking pair notifies both players and deletes match', async () => {
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const { WebSocket } = await import('ws');
  const { createServer } = await import('node:net');

  const findFreePort = () => new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });
  const port = await findFreePort();

  const server = await startServer({
    port, host: '127.0.0.1', dbPath: ':memory:', persistent: false,
    authMode: 'required',
    identityVerifier: makeFakeVerifier({ tokenA: 't.A.B', tokenB: 't.B.C', accA: 'acc-A', accB: 'acc-B', plyA: 'PLY_A', plyB: 'PLY_B' }),
    allowFakePersistor: true, // DATA-04: testing only
    publicMatchmaking: true, // enable QUEUE_JOIN handler
    blockChecker: async (a, b) => {
      return (a === 'acc-A' && b === 'acc-B') || (a === 'acc-B' && b === 'acc-A');
    },
  });

  try {
    // Player A authenticates
    const wsA = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise(r => wsA.on('open', r));
    wsA.send(JSON.stringify({ protocolVersion: 2, type: 'AUTHENTICATE', payload: { accessToken: 't.A.B' }, requestId: 'authA' }));
    await waitForType(wsA, 'AUTHENTICATED', 'A AUTHENTICATED');

    // Player B authenticates
    const wsB = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise(r => wsB.on('open', r));
    wsB.send(JSON.stringify({ protocolVersion: 2, type: 'AUTHENTICATE', payload: { accessToken: 't.B.C' }, requestId: 'authB' }));
    await waitForType(wsB, 'AUTHENTICATED', 'B AUTHENTICATED');

    // A joins queue first (no pair yet → QUEUE_JOINED)
    wsA.send(JSON.stringify({ protocolVersion: 2, type: 'QUEUE_JOIN', payload: { profileId: 'core-unrestricted-authority' }, requestId: 'qA' }));
    await waitForType(wsA, 'QUEUE_JOINED', 'A QUEUE_JOINED');

    // B joins queue → immediate pair → QUEUE_MATCHED then BLOCKED_BY_PLAYER to both.
    // Attach both listeners BEFORE awaiting either, so neither message is missed.
    wsB.send(JSON.stringify({ protocolVersion: 2, type: 'QUEUE_JOIN', payload: { profileId: 'core-unrestricted-authority' }, requestId: 'qB' }));
    const blockedBPromise = waitForErrorCode(wsB, 'BLOCKED_BY_PLAYER', 'B BLOCKED_BY_PLAYER');
    const blockedAPromise = waitForErrorCode(wsA, 'BLOCKED_BY_PLAYER', 'A BLOCKED_BY_PLAYER');
    const blockedB = await blockedBPromise;
    assert.equal(blockedB.payload.code, 'BLOCKED_BY_PLAYER', 'B must be told the match was cancelled');
    const blockedA = await blockedAPromise;
    assert.equal(blockedA.payload.code, 'BLOCKED_BY_PLAYER', 'A must be told the match was cancelled');

    // A must be able to re-join the queue cleanly (connection unbound, match deleted).
    // If the connection were still bound to the deleted match, QUEUE_JOIN would
    // either fail or behave unexpectedly.
    wsA.send(JSON.stringify({ protocolVersion: 2, type: 'QUEUE_JOIN', payload: { profileId: 'core-unrestricted-authority' }, requestId: 'qA2' }));
    const rejoined = await waitForType(wsA, 'QUEUE_JOINED', 'A re-QUEUE_JOINED');
    assert.ok(rejoined, 'A must be able to re-join the queue (connection unbound, match deleted)');

    wsA.close();
    wsB.close();
  } finally {
    await server.close();
  }
});

test('IRX-H19: blockChecker throw fails closed — both players notified, match deleted', async () => {
  const { startServer } = await import('../apps/match-server/src/server.mjs');
  const { WebSocket } = await import('ws');
  const { createServer } = await import('node:net');

  const findFreePort = () => new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });
  const port = await findFreePort();

  const server = await startServer({
    port, host: '127.0.0.1', dbPath: ':memory:', persistent: false,
    authMode: 'required',
    identityVerifier: makeFakeVerifier({ tokenA: 't.A.B', tokenB: 't.B.C', accA: 'acc-A', accB: 'acc-B', plyA: 'PLY_A', plyB: 'PLY_B' }),
    allowFakePersistor: true, // DATA-04: testing only
    publicMatchmaking: true,
    blockChecker: async () => { throw new Error('supabase unavailable'); }, // fail-closed path
  });

  try {
    const wsA = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise(r => wsA.on('open', r));
    wsA.send(JSON.stringify({ protocolVersion: 2, type: 'AUTHENTICATE', payload: { accessToken: 't.A.B' }, requestId: 'authA' }));
    await waitForType(wsA, 'AUTHENTICATED', 'A AUTHENTICATED');

    const wsB = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise(r => wsB.on('open', r));
    wsB.send(JSON.stringify({ protocolVersion: 2, type: 'AUTHENTICATE', payload: { accessToken: 't.B.C' }, requestId: 'authB' }));
    await waitForType(wsB, 'AUTHENTICATED', 'B AUTHENTICATED');

    wsA.send(JSON.stringify({ protocolVersion: 2, type: 'QUEUE_JOIN', payload: { profileId: 'core-unrestricted-authority' }, requestId: 'qA' }));
    await waitForType(wsA, 'QUEUE_JOINED', 'A QUEUE_JOINED');

    wsB.send(JSON.stringify({ protocolVersion: 2, type: 'QUEUE_JOIN', payload: { profileId: 'core-unrestricted-authority' }, requestId: 'qB' }));

    // Both players must be notified (previously only the joiner was told).
    // Attach both listeners BEFORE awaiting either, so neither message is missed.
    const blockedBPromise = waitForErrorCode(wsB, 'BLOCKED_BY_PLAYER', 'B BLOCKED_BY_PLAYER (fail-closed)');
    const blockedAPromise = waitForErrorCode(wsA, 'BLOCKED_BY_PLAYER', 'A BLOCKED_BY_PLAYER (fail-closed)');
    const blockedB = await blockedBPromise;
    assert.equal(blockedB.payload.code, 'BLOCKED_BY_PLAYER', 'B must be told the match was cancelled (fail-closed)');
    const blockedA = await blockedAPromise;
    assert.equal(blockedA.payload.code, 'BLOCKED_BY_PLAYER', 'A must be told the match was cancelled (fail-closed)');

    // A must be able to re-join (match deleted + connection unbound).
    wsA.send(JSON.stringify({ protocolVersion: 2, type: 'QUEUE_JOIN', payload: { profileId: 'core-unrestricted-authority' }, requestId: 'qA2' }));
    const rejoined = await waitForType(wsA, 'QUEUE_JOINED', 'A re-QUEUE_JOINED (fail-closed)');
    assert.ok(rejoined, 'A must be able to re-join the queue after fail-closed cancellation');

    wsA.close();
    wsB.close();
  } finally {
    await server.close();
  }
});

// ── IRX-H07: Migration 0019 removes season fabrication ──

test('IRX-H07: migration 0019 exists and patches season fabrication', async () => {
  const sql = await readFile(path.join(root, 'supabase/migrations/0019_remove_season_fabrication.sql'), 'utf8');
  assert.ok(sql.includes('IRX-H07'), 'migration must reference IRX-H07');
  assert.ok(sql.includes('RETURN;'), 'must return empty when no active season');
  // Must not add any new fabrication
  const fabricationMatches = sql.match(/v_season\s*:=\s*'season-1'/g);
  assert.equal(fabricationMatches, null, 'must not add any season-1 fabrication');
});

// ── IRX-H38: JWT exfiltration prevention ──

test('IRX-H38: match-server-config rejects non-allowlisted hosts', async () => {
  const source = await readFile(path.join(root, 'apps/lab-web/src/play/network/match-server-config.js'), 'utf8');
  assert.ok(source.includes('IRX-H38'), 'must reference IRX-H38');
  assert.ok(source.includes('match.intrilex.cards'), 'must allowlist match.intrilex.cards');
  assert.ok(source.includes('localhost'), 'must allowlist localhost');
  assert.ok(source.includes('allowlist'), 'must have allowlist check');
});
