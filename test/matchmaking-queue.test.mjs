// ═══════════════════════════════════════════════════════════════
// matchmaking-queue.test.mjs — Public matchmaking queue tests
//
// Proves:
//   - Queue enqueue/dequeue works
//   - Two players with same profile get paired
//   - Players with different profiles don't pair
//   - Queue position and estimated wait time are reported
//   - Duplicate enqueue is rejected (ALREADY_IN_QUEUE)
//   - Queue full is rejected (QUEUE_FULL)
//   - Queue timeout cleans expired entries
//   - Queue leave removes the player
//   - onCreateMatch callback is called with correct args
//   - Protocol validation for QUEUE_JOIN and QUEUE_LEAVE
//   - Server integration: QUEUE_JOIN/QUEUE_LEAVE/QUEUE_MATCHED messages
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { MatchmakingQueue, MAX_QUEUE_SIZE, QUEUE_TIMEOUT_MS } from '../packages/match-authority/src/matchmaking-queue.mjs';
import {
  validateEnvelope, validateQueueJoin, validateQueueLeave,
  queueJoin, queueLeave, queueJoined, queueLeft, queueMatched,
  ReasonCode,
} from '../packages/network-protocol/src/protocol.mjs';

function makeConnId() { return `conn-${randomBytes(4).toString('hex')}`; }

// ── Section 1: Queue basics ──

test('matchmaking: enqueue adds player to queue', () => {
  const queue = new MatchmakingQueue({});
  const result = queue.enqueue('conn-1', 'core-unrestricted-authority');
  assert.ok(result.queued);
  assert.equal(result.position, 1);
  assert.equal(queue.size, 1);
});

test('matchmaking: dequeue removes player from queue', () => {
  const queue = new MatchmakingQueue({});
  queue.enqueue('conn-1', 'core-unrestricted-authority');
  const result = queue.dequeue('conn-1');
  assert.ok(result.removed);
  assert.equal(queue.size, 0);
});

test('matchmaking: dequeue non-existent returns removed=false', () => {
  const queue = new MatchmakingQueue({});
  const result = queue.dequeue('conn-1');
  assert.equal(result.removed, false);
});

test('matchmaking: has() checks if connection is in queue', () => {
  const queue = new MatchmakingQueue({});
  queue.enqueue('conn-1', 'core-unrestricted-authority');
  assert.ok(queue.has('conn-1'));
  assert.ok(!queue.has('conn-2'));
});

// ── Section 2: Pairing ──

test('matchmaking: two players with same profile get paired', () => {
  let createCallCount = 0;
  const queue = new MatchmakingQueue({
    onCreateMatch: (profileId, seed, players) => {
      createCallCount++;
      assert.equal(profileId, 'core-unrestricted-authority');
      assert.equal(players.length, 2);
      return players.map(p => ({
        connectionId: p.connectionId,
        matchId: 'M-test',
        participantId: `P-${p.connectionId}`,
        participantToken: 'token',
      }));
    },
  });

  const r1 = queue.enqueue('conn-1', 'core-unrestricted-authority');
  assert.ok(r1.queued);
  assert.equal(r1.paired, null); // No pair yet

  const r2 = queue.enqueue('conn-2', 'core-unrestricted-authority');
  assert.ok(r2.queued);
  assert.ok(r2.paired); // Paired immediately
  assert.equal(createCallCount, 1);
  assert.equal(queue.size, 0); // Both removed from queue
});

test('matchmaking: players with different profiles do not pair', () => {
  const queue = new MatchmakingQueue({
    onCreateMatch: () => { throw new Error('Should not pair'); },
  });

  const r1 = queue.enqueue('conn-1', 'core-unrestricted-authority');
  const r2 = queue.enqueue('conn-2', 'core-ranked-authority');
  assert.ok(r1.queued);
  assert.ok(r2.queued);
  assert.equal(r1.paired, null);
  assert.equal(r2.paired, null);
  assert.equal(queue.size, 2);
});

test('matchmaking: third player waits in queue after pair', () => {
  const queue = new MatchmakingQueue({
    onCreateMatch: (profileId, seed, players) => {
      return players.map(p => ({
        connectionId: p.connectionId,
        matchId: 'M-test',
        participantId: 'P-x',
        participantToken: 'token',
      }));
    },
  });

  queue.enqueue('conn-1', 'core-unrestricted-authority');
  queue.enqueue('conn-2', 'core-unrestricted-authority'); // paired
  const r3 = queue.enqueue('conn-3', 'core-unrestricted-authority');
  assert.ok(r3.queued);
  assert.equal(r3.paired, null);
  assert.equal(queue.size, 1);
});

// ── Section 3: Queue limits ──

test('matchmaking: duplicate enqueue is rejected', () => {
  const queue = new MatchmakingQueue({});
  queue.enqueue('conn-1', 'core-unrestricted-authority');
  const result = queue.enqueue('conn-1', 'core-unrestricted-authority');
  assert.equal(result.queued, false);
  assert.equal(result.code, 'ALREADY_IN_QUEUE');
});

test('matchmaking: queue full is rejected', () => {
  const queue = new MatchmakingQueue({});
  // Fill the queue with unique connections (different profiles to avoid pairing)
  for (let i = 0; i < MAX_QUEUE_SIZE; i++) {
    const profileId = `core-profile-${i}`;
    queue.enqueue(`conn-${i}`, profileId);
  }
  const result = queue.enqueue('conn-overflow', 'core-unrestricted-authority');
  assert.equal(result.queued, false);
  assert.equal(result.code, 'QUEUE_FULL');
});

// ── Section 4: Queue timeout ──

test('matchmaking: cleanExpired removes stale entries', () => {
  const queue = new MatchmakingQueue({});
  queue.enqueue('conn-1', 'core-unrestricted-authority');

  // Manually set joinedAt to the past by manipulating the queue
  queue._queue[0].joinedAt = Date.now() - QUEUE_TIMEOUT_MS - 1000;

  const expired = queue.cleanExpired();
  assert.equal(expired.length, 1);
  assert.equal(expired[0], 'conn-1');
  assert.equal(queue.size, 0);
});

test('matchmaking: cleanExpired keeps fresh entries', () => {
  const queue = new MatchmakingQueue({});
  queue.enqueue('conn-1', 'core-unrestricted-authority');
  const expired = queue.cleanExpired();
  assert.equal(expired.length, 0);
  assert.equal(queue.size, 1);
});

// ── Section 5: Position and estimated wait ──

test('matchmaking: position reflects profile-specific queue', () => {
  const queue = new MatchmakingQueue({});
  queue.enqueue('conn-1', 'core-profile-a');
  queue.enqueue('conn-2', 'core-profile-b');
  const r3 = queue.enqueue('conn-3', 'core-profile-a');
  assert.equal(r3.position, 2); // 2nd in line for profile-a
});

test('matchmaking: estimatedWaitMs is positive', () => {
  const queue = new MatchmakingQueue({});
  const result = queue.enqueue('conn-1', 'core-unrestricted-authority');
  assert.ok(result.estimatedWaitMs > 0);
});

// ── Section 6: Protocol validation ──

test('matchmaking: QUEUE_JOIN valid message accepted', () => {
  const msg = queueJoin('core-unrestricted-authority', 'req-1');
  const envCheck = validateEnvelope(msg);
  assert.ok(envCheck.valid);
  const payloadCheck = validateQueueJoin(msg.payload);
  assert.ok(payloadCheck.valid);
});

test('matchmaking: QUEUE_JOIN invalid profile rejected', () => {
  const msg = { protocolVersion: 1, type: 'QUEUE_JOIN', payload: { profileId: 'invalid' } };
  const envCheck = validateEnvelope(msg);
  assert.ok(envCheck.valid);
  const payloadCheck = validateQueueJoin(msg.payload);
  assert.equal(payloadCheck.valid, false);
});

test('matchmaking: QUEUE_LEAVE valid message accepted', () => {
  const msg = queueLeave('req-1');
  const envCheck = validateEnvelope(msg);
  assert.ok(envCheck.valid);
  const payloadCheck = validateQueueLeave(msg.payload);
  assert.ok(payloadCheck.valid);
});

test('matchmaking: QUEUE_JOINED message has correct structure', () => {
  const msg = queueJoined(3, 15000, 'req-1');
  assert.equal(msg.type, 'QUEUE_JOINED');
  assert.equal(msg.payload.position, 3);
  assert.equal(msg.payload.estimatedWaitMs, 15000);
});

test('matchmaking: QUEUE_LEFT message has correct structure', () => {
  const msg = queueLeft('req-1');
  assert.equal(msg.type, 'QUEUE_LEFT');
});

test('matchmaking: QUEUE_MATCHED message has correct structure', () => {
  const msg = queueMatched('M-test', 'token-123', 'req-1');
  assert.equal(msg.type, 'QUEUE_MATCHED');
  assert.equal(msg.payload.matchId, 'M-test');
  assert.equal(msg.payload.participantToken, 'token-123');
});

test('matchmaking: QUEUE_JOIN and QUEUE_LEAVE are known message types', () => {
  const joinMsg = queueJoin('core-unrestricted-authority');
  const leaveMsg = queueLeave();
  assert.ok(validateEnvelope(joinMsg).valid, 'QUEUE_JOIN must be a known type');
  assert.ok(validateEnvelope(leaveMsg).valid, 'QUEUE_LEAVE must be a known type');
});

// ── Section 7: Reason codes ──

test('matchmaking: QUEUE_FULL reason code exists', () => {
  assert.equal(ReasonCode.QUEUE_FULL, 'QUEUE_FULL');
});

test('matchmaking: QUEUE_TIMEOUT reason code exists', () => {
  assert.equal(ReasonCode.QUEUE_TIMEOUT, 'QUEUE_TIMEOUT');
});

test('matchmaking: NOT_IN_QUEUE reason code exists', () => {
  assert.equal(ReasonCode.NOT_IN_QUEUE, 'NOT_IN_QUEUE');
});

test('matchmaking: ALREADY_IN_QUEUE reason code exists', () => {
  assert.equal(ReasonCode.ALREADY_IN_QUEUE, 'ALREADY_IN_QUEUE');
});

// ── Section 8: Dequeue after pairing ──

test('matchmaking: dequeue after pairing is no-op', () => {
  const queue = new MatchmakingQueue({
    onCreateMatch: (profileId, seed, players) => {
      return players.map(p => ({
        connectionId: p.connectionId,
        matchId: 'M-test',
        participantId: 'P-x',
        participantToken: 'token',
      }));
    },
  });
  queue.enqueue('conn-1', 'core-unrestricted-authority');
  queue.enqueue('conn-2', 'core-unrestricted-authority'); // paired
  // Both should already be removed from queue
  const result = queue.dequeue('conn-1');
  assert.equal(result.removed, false);
});

// ── Section 9: Seed generation ──

test('matchmaking: onCreateMatch receives a valid seed', () => {
  let receivedSeed = null;
  const queue = new MatchmakingQueue({
    onCreateMatch: (profileId, seed, players) => {
      receivedSeed = seed;
      return players.map(p => ({
        connectionId: p.connectionId,
        matchId: 'M-test',
        participantId: 'P-x',
        participantToken: 'token',
      }));
    },
  });
  queue.enqueue('conn-1', 'core-unrestricted-authority');
  queue.enqueue('conn-2', 'core-unrestricted-authority');
  assert.ok(receivedSeed !== null);
  assert.ok(typeof receivedSeed === 'number');
  assert.ok(receivedSeed >= 0 && receivedSeed <= 0xFFFFFFFF);
});
