import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { FakeMatchResultPersistor } from '../apps/match-server/src/persistence/fake-match-result-persistor.mjs';
// ═══════════════════════════════════════════════════════════════
// competitive-journey-e2e.test.mjs
// Phase 3: One integrated competitive journey through real handlers.
//
// Exercises real local handlers with file-backed SQLite/outbox and a fake remote persistor:
//   create match → join → ready → play actions → match ends →
//   terminal result persisted (outbox) → replay generated →
//   spectator projection is neutral → restart recovery (no duplication)
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import WebSocket from 'ws';
import {
  createMatch, joinMatch, ready, submitAction, requestSync,
} from '../packages/network-protocol/src/protocol.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
function importModule(rel) {
  return import(pathToFileURL(path.join(ROOT, rel)).href);
}

// ── Helpers ──────────────────────────────────────────────────────

function randomPort() {
  return 49152 + Math.floor(Math.random() * 16000);
}

function connectWs(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function createMessageCollector(ws) {
  const buffer = [];
  const handler = (data) => { try { buffer.push(JSON.parse(data.toString())); } catch { /* ignore */ } };
  ws.on('message', handler);
  const activeTimers = new Set();
  const activeIntervals = new Set();
  return {
    buffer,
    waitFor(type, timeoutMs = 10000) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const existing = buffer.find(m => m.type === type);
        if (existing) { buffer.splice(buffer.indexOf(existing), 1); return resolve(existing); }
        const timer = setTimeout(() => {
          if (settled) return; settled = true;
          clearInterval(interval); activeTimers.delete(timer); activeIntervals.delete(interval);
          reject(new Error(`Timeout waiting for ${type}`));
        }, timeoutMs);
        const interval = setInterval(() => {
          const idx = buffer.findIndex(m => m.type === type);
          if (idx >= 0) {
            if (settled) return; settled = true;
            clearTimeout(timer); clearInterval(interval);
            activeTimers.delete(timer); activeIntervals.delete(interval);
            resolve(buffer.splice(idx, 1)[0]);
          }
        }, 50);
        activeTimers.add(timer); activeIntervals.add(interval);
      });
    },
    stop() { ws.off('message', handler); for (const t of activeTimers) clearTimeout(t); for (const i of activeIntervals) clearInterval(i); },
  };
}

function drainViews(mc) {
  for (let i = mc.buffer.length - 1; i >= 0; i--) {
    if (mc.buffer[i].type === 'MATCH_VIEW') mc.buffer.splice(i, 1);
  }
}

// ── E2E: Full competitive journey ────────────────────────────────

test('Phase 3 E2E: full competitive journey — create, play, persist, replay, spectator, restart recovery', async (t) => {
  const { startServer } = await importModule('apps/match-server/src/server.mjs');
  const port = randomPort();
  const directory = mkdtempSync(path.join(tmpdir(), 'intrilex-journey-'));
  const dbPath = path.join(directory, 'matches.sqlite');
  const outboxPath = path.join(directory, 'outbox.sqlite');
  const persistor = new FakeMatchResultPersistor();
  let firstClosed = false, restarted = null, server = null;
  t.after(async () => {
    if (restarted) await restarted.close();
    if (!firstClosed && server) await server.close();
    assert.equal(path.dirname(directory), path.resolve(tmpdir()), 'cleanup must remain inside the temporary workspace');
    rmSync(directory, { recursive: true, force: true });
  });
  server = await startServer({
    port, host: '127.0.0.1', dbPath, outboxPath, persistent: true,
    matchResultPersistor: persistor,
    rateLimitCapacity: 10000,
  });
  assert.ok(server, 'Server must start');

  try {
    // ── Step 1: Create match ──
    const ws1 = await connectWs(port);
    const mc1 = createMessageCollector(ws1);
    ws1.send(JSON.stringify(createMatch('core-unrestricted-authority')));
    const created = await mc1.waitFor('MATCH_CREATED');
    const { matchId, inviteCode, participantToken: p1Token } = created.payload;
    assert.ok(matchId, 'Must have matchId');
    assert.ok(inviteCode, 'Must have inviteCode');

    // ── Step 2: Join match ──
    const ws2 = await connectWs(port);
    const mc2 = createMessageCollector(ws2);
    ws2.send(JSON.stringify(joinMatch(inviteCode)));
    const joined = await mc2.waitFor('MATCH_JOINED');
    const p2Token = joined.payload.participantToken;
    assert.ok(p2Token, 'P2 must have participant token');

    // ── Step 3: Both ready ──
    ws1.send(JSON.stringify(ready(matchId, p1Token)));
    ws2.send(JSON.stringify(ready(matchId, p2Token)));
    await mc1.waitFor('MATCH_STARTED');
    await mc2.waitFor('MATCH_STARTED');

    // Drain initial views
    await new Promise(r => setTimeout(r, 200));
    mc1.buffer.length = 0;
    mc2.buffer.length = 0;

    // ── Step 4: Play actions until match ends ──
    let stepCount = 0;
    const maxSteps = 500;

    while (stepCount < maxSteps) {
      if (mc1.buffer.some(m => m.type === 'MATCH_ENDED')) break;
      if (mc2.buffer.some(m => m.type === 'MATCH_ENDED')) break;

      // Try P1 first
      drainViews(mc1);
      ws1.send(JSON.stringify(requestSync(matchId, p1Token)));
      let sync1;
      try { sync1 = await mc1.waitFor('MATCH_VIEW', 5000); }
      catch {
        const err = mc1.buffer.find(m => m.type === 'ERROR');
        if (err) assert.fail(`requestSync error: ${err.payload?.code} ${err.payload?.message}`);
        throw new Error('No MATCH_VIEW from requestSync');
      }
      const view1 = sync1.payload.view;
      if (view1?.status === 'TERMINAL') break;
      const dec1 = view1?.decision;

      if (dec1?.isMyDecision && dec1.legalActions?.length) {
        const action = dec1.legalActions[0];
        ws1.send(JSON.stringify(submitAction(matchId, p1Token, `cmd-${stepCount}`, dec1.stateRevision, dec1.frameHash, action.actionId)));
        const result = await mc1.waitFor('ACTION_RESULT', 5000);
        if (!result.payload?.accepted && dec1.legalActions.length > 1) {
          const altAction = dec1.legalActions[1];
          ws1.send(JSON.stringify(submitAction(matchId, p1Token, `cmd-${stepCount}-alt`, dec1.stateRevision, dec1.frameHash, altAction.actionId)));
          await mc1.waitFor('ACTION_RESULT', 5000);
        }
      } else {
        // Try P2
        if (mc2.buffer.some(m => m.type === 'MATCH_ENDED')) break;
        drainViews(mc2);
        ws2.send(JSON.stringify(requestSync(matchId, p2Token)));
        const sync2 = await mc2.waitFor('MATCH_VIEW', 5000);
        const view2 = sync2.payload.view;
        if (view2?.status === 'TERMINAL') break;
        const dec2 = view2?.decision;
        if (dec2?.isMyDecision && dec2.legalActions?.length) {
          const action = dec2.legalActions[0];
          ws2.send(JSON.stringify(submitAction(matchId, p2Token, `cmd-${stepCount}`, dec2.stateRevision, dec2.frameHash, action.actionId)));
          const result = await mc2.waitFor('ACTION_RESULT', 5000);
          if (!result.payload?.accepted && dec2.legalActions.length > 1) {
            const altAction = dec2.legalActions[1];
            ws2.send(JSON.stringify(submitAction(matchId, p2Token, `cmd-${stepCount}-alt`, dec2.stateRevision, dec2.frameHash, altAction.actionId)));
            await mc2.waitFor('ACTION_RESULT', 5000);
          }
        } else {
          await new Promise(r => setTimeout(r, 50));
        }
      }
      stepCount++;
    }

    // ── Verify: Match ended with terminal state ──
    let matchEnded = mc1.buffer.find(m => m.type === 'MATCH_ENDED');
    if (!matchEnded) matchEnded = await mc1.waitFor('MATCH_ENDED', 10000);
    assert.ok(matchEnded, `Match must end within ${maxSteps} steps (took ${stepCount})`);
    assert.ok(Object.hasOwn(matchEnded.payload, 'winner'), 'MATCH_ENDED must explicitly include winner, including null for a draw');
    assert.equal(matchEnded.payload.winner, server.matchStore.get(matchId).winner, 'terminal winner must match authoritative state');
    assert.ok(matchEnded.payload.reason, 'MATCH_ENDED must include termination reason');

    // Wait for REPLAY_AVAILABLE
    let replayAvail = mc1.buffer.find(m => m.type === 'REPLAY_AVAILABLE');
    if (!replayAvail) replayAvail = await mc1.waitFor('REPLAY_AVAILABLE', 10000);
    assert.ok(replayAvail, 'Must receive REPLAY_AVAILABLE');
    assert.ok(replayAvail.payload.replayHash, 'REPLAY_AVAILABLE must include replayHash');

    // ── Step 5: Verify replay identity (stable hash) ──
    ws1.send(JSON.stringify({
      protocolVersion: 2, type: 'GET_REPLAY', requestId: 'replay1',
      payload: { matchId, participantToken: p1Token },
    }));
    const replayResp = await mc1.waitFor('REPLAY_DATA', 10000);
    assert.ok(replayResp.payload.replay, 'REPLAY_DATA must include replay object');
    const replayHash = createHash('sha256').update(JSON.stringify(replayResp.payload.replay)).digest('hex');
    assert.equal(replayHash, replayAvail.payload.replayHash,
      'Replay hash from GET_REPLAY must match REPLAY_AVAILABLE hash (identity consistency)');

    // ── Step 6: Verify spectator projection is neutral ──
    const specWs = await connectWs(port);
    const specMc = createMessageCollector(specWs);
    specWs.send(JSON.stringify({
      protocolVersion: 2, type: 'SPECTATE_MATCH', requestId: 'spec1',
      payload: { matchId },
    }));
    const specResp = await Promise.race([
      specMc.waitFor('MATCH_VIEW', 3000).catch(() => null),
      specMc.waitFor('ERROR', 3000).catch(() => null),
    ]);
    if (specResp?.type === 'MATCH_VIEW') {
      const view = specResp.payload.view || specResp.payload;
      if (view?.decision) {
        assert.equal(view.decision.isMyDecision, false,
          'Spectator view must not show isMyDecision=true (neutral projection)');
      }
    }
    specMc.stop();
    specWs.close();

    // ── Step 7: Verify outbox state (terminal result was persisted) ──
    await server.terminalOutbox._drainOnce();
    const resultJobs = server.terminalOutbox.listJobs().filter(job => job.jobType === 'result' && job.matchId === matchId);
    assert.equal(resultJobs.length, 1, 'one durable result job exists');
    assert.equal(resultJobs[0].status, 'completed');
    assert.equal(persistor.matchCount, 1, 'terminal result was actually delivered');
    assert.equal(persistor.getMatch(matchId).replayHash, replayAvail.payload.replayHash);
    // Simulate a delivery that committed remotely but crashed before its local acknowledgement.
    server.terminalOutbox._storage.update(resultJobs[0].jobId, { status: 'in_progress' });

    // ── Step 8: Restart recovery ──
    mc1.stop(); mc2.stop();
    ws1.close(); ws2.close();
    await new Promise(r => setTimeout(r, 200));
    await server.close(); firstClosed = true;
    await new Promise(r => setTimeout(r, 300));

    const server2 = await startServer({
      port, host: '127.0.0.1', dbPath, outboxPath, persistent: true,
      matchResultPersistor: persistor,
      rateLimitCapacity: 10000,
    });
    restarted = server2;
    assert.ok(server2, 'Server must restart cleanly');
    const restored = server2.matchStore.get(matchId);
    assert.ok(restored, 'the same terminal match survives file-backed restart');
    assert.equal(restored.status, 'TERMINAL');
    assert.equal(createHash('sha256').update(JSON.stringify(restored.getReplay())).digest('hex'), replayAvail.payload.replayHash, 'replay identity survives restart');
    await server2.terminalOutbox._drainOnce();
    assert.equal(persistor.matchCount, 1, 'interrupted delivery retry cannot duplicate the result');
    assert.ok(server2.terminalOutbox.listJobs().filter(job => job.matchId === matchId).every(job => job.status === 'completed'));

    const ws3 = await connectWs(port);
    const mc3 = createMessageCollector(ws3);
    ws3.send(JSON.stringify(createMatch('core-unrestricted-authority')));
    const newMatch = await mc3.waitFor('MATCH_CREATED', 5000);
    assert.ok(newMatch.payload.matchId, 'Restarted server must create new matches');
    assert.notEqual(newMatch.payload.matchId, matchId,
      'New match must have different ID (no duplication)');

    mc3.stop();
    ws3.close();
    await server2.close(); restarted = null;
    await new Promise(r => setTimeout(r, 200));

  } finally {
    if (!firstClosed) { await server.close(); firstClosed = true; }
  }
});

// ── E2E: Disconnect and abandon produces correct terminal result ──

test('Phase 3 E2E: disconnect → abandon → terminal result with abandonment reason', async () => {
  const { startServer } = await importModule('apps/match-server/src/server.mjs');
  const port = randomPort();
  const server = await startServer({
    port, host: '127.0.0.1', dbPath: ':memory:', persistent: false,
    rateLimitCapacity: 10000,
    reconnectGraceMs: 1000,
  });
  assert.ok(server, 'Server must start');

  try {
    // Create and join match
    const ws1 = await connectWs(port);
    const mc1 = createMessageCollector(ws1);
    ws1.send(JSON.stringify(createMatch('core-unrestricted-authority')));
    const created = await mc1.waitFor('MATCH_CREATED');
    const { matchId, inviteCode, participantToken: p1Token } = created.payload;

    const ws2 = await connectWs(port);
    const mc2 = createMessageCollector(ws2);
    ws2.send(JSON.stringify(joinMatch(inviteCode)));
    const joined = await mc2.waitFor('MATCH_JOINED');
    const p2Token = joined.payload.participantToken;

    // Both ready
    ws1.send(JSON.stringify(ready(matchId, p1Token)));
    ws2.send(JSON.stringify(ready(matchId, p2Token)));
    await mc1.waitFor('MATCH_STARTED');
    await mc2.waitFor('MATCH_STARTED');

    // Wait for initial view and drain
    await new Promise(r => setTimeout(r, 200));
    mc1.buffer.length = 0;
    mc2.buffer.length = 0;

    // P2 disconnects abruptly
    mc2.stop();
    ws2.close();

    // P1 should receive PARTICIPANT_STATUS(DISCONNECTED) — wait for it specifically
    let disconnectMsg = null;
    for (let i = 0; i < 30; i++) {
      const found = mc1.buffer.find(m => m.type === 'PARTICIPANT_STATUS' && m.payload?.status?.status === 'DISCONNECTED');
      if (found) { disconnectMsg = found; break; }
      await new Promise(r => setTimeout(r, 100));
    }
    if (!disconnectMsg) {
      // Drain any non-DISCONNECTED PARTICIPANT_STATUS messages first
      for (let i = mc1.buffer.length - 1; i >= 0; i--) {
        if (mc1.buffer[i].type === 'PARTICIPANT_STATUS' && mc1.buffer[i].payload?.status?.status !== 'DISCONNECTED') {
          mc1.buffer.splice(i, 1);
        }
      }
      disconnectMsg = await mc1.waitFor('PARTICIPANT_STATUS', 5000);
    }
    assert.ok(disconnectMsg && disconnectMsg.payload?.status?.status === 'DISCONNECTED',
      `P1 must be notified of P2 disconnect, got: ${JSON.stringify(disconnectMsg?.payload)}`);

    // Wait for grace period to expire and match to end
    const ended = await mc1.waitFor('MATCH_ENDED', 15000);
    assert.ok(ended, 'Match must end after grace period expires');
    assert.ok(ended.payload.reason, 'MATCH_ENDED must include termination reason');
    assert.ok(ended.payload.winner, 'MATCH_ENDED must include winner');

    // Verify replay is still generated for abandoned match
    let replayAvail = mc1.buffer.find(m => m.type === 'REPLAY_AVAILABLE');
    if (!replayAvail) replayAvail = await mc1.waitFor('REPLAY_AVAILABLE', 5000);
    assert.ok(replayAvail, 'REPLAY_AVAILABLE must be sent even for abandoned match');
    assert.ok(replayAvail.payload.replayHash, 'Abandoned match must have replay hash');

    mc1.stop();
    ws1.close();
  } finally {
    try { await server.close(); } catch { /* ignore */ }
  }
});
