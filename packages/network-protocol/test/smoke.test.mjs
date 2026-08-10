import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEnvelope, validateCreateMatch, validateJoinMatch, validateSubmitAction, validateReady, validateResumeMatch } from '../src/validation.mjs';
import { ReasonCode } from '../src/reason-codes.mjs';
import { createMatch, joinMatch, ready, submitAction, resumeMatch, matchCreated, matchJoined, error, envelope, achievementsEarned } from '../src/protocol.mjs';

test('all exports are defined', () => {
  assert.ok(validateEnvelope);
  assert.ok(validateCreateMatch);
  assert.ok(validateJoinMatch);
  assert.ok(validateSubmitAction);
  assert.ok(createMatch);
  assert.ok(joinMatch);
  assert.ok(ready);
  assert.ok(submitAction);
});

test('createMatch builds valid envelope', () => {
  const msg = createMatch('core-unrestricted-authority', 'req-1');
  assert.equal(msg.protocolVersion, 2);
  assert.equal(msg.type, 'CREATE_MATCH');
  assert.equal(msg.payload.profileId, 'core-unrestricted-authority');
  assert.ok(validateEnvelope(msg).valid);
});

test('joinMatch builds valid envelope', () => {
  const msg = joinMatch('ABC123', 'req-2');
  assert.equal(msg.type, 'JOIN_MATCH');
  assert.equal(msg.payload.inviteCode, 'ABC123');
  assert.ok(validateEnvelope(msg).valid);
});

test('ready builds valid envelope', () => {
  const msg = ready('M-test', 'token1234567890123456', 'req-3');
  assert.equal(msg.type, 'READY');
  assert.ok(validateEnvelope(msg).valid);
});

test('submitAction builds valid envelope', () => {
  const msg = submitAction('M-test', 'token1234567890123456', 'cmd-1', 5, 'a'.repeat(16), 'action-1', 'req-4');
  assert.equal(msg.type, 'SUBMIT_ACTION');
  assert.ok(validateEnvelope(msg).valid);
});

test('error builds valid envelope', () => {
  const msg = error('TEST_ERROR', 'test message', 'req-5');
  assert.equal(msg.type, 'ERROR');
  assert.equal(msg.payload.code, 'TEST_ERROR');
});

test('validation rejects bad protocol version', () => {
  const result = validateEnvelope({ protocolVersion: 99, type: 'CREATE_MATCH', payload: {} });
  assert.equal(result.valid, false);
  assert.equal(result.code, ReasonCode.PROTOCOL_VERSION_UNSUPPORTED);
});

test('validation rejects missing payload', () => {
  const result = validateEnvelope({ protocolVersion: 2, type: 'CREATE_MATCH' });
  assert.equal(result.valid, false);
});

test('validateCreateMatch rejects non-core profile', () => {
  assert.equal(validateCreateMatch({ profileId: 'invalid' }).valid, false);
  assert.ok(validateCreateMatch({ profileId: 'core-advanced-authority' }).valid);
});

test('validateJoinMatch rejects short invite code', () => {
  assert.equal(validateJoinMatch({ inviteCode: 'AB' }).valid, false);
  assert.ok(validateJoinMatch({ inviteCode: 'XYZ123' }).valid);
});

test('achievementsEarned builds valid ACHIEVEMENTS_EARNED envelope', () => {
  const unlocks = [
    { achievementId: 'first-blood', rarity: 'COMMON', ap: 5, provenance: 'SERVER', timestamp: '2025-01-01T00:00:00Z', matchId: 'M-test' },
  ];
  const progressUpdates = { 'no-longer-new': { current: 3, target: 5 } };
  const msg = achievementsEarned('M-test', unlocks, progressUpdates);
  assert.equal(msg.type, 'ACHIEVEMENTS_EARNED');
  assert.equal(msg.payload.matchId, 'M-test');
  assert.equal(msg.payload.unlocks.length, 1);
  assert.equal(msg.payload.unlocks[0].achievementId, 'first-blood');
  assert.deepEqual(msg.payload.progressUpdates, progressUpdates);
  // Envelope validation should pass
  const result = validateEnvelope(msg);
  assert.ok(result.valid, `ACHIEVEMENTS_EARNED should pass validation: ${result.error}`);
});

test('achievementsEarned with empty unlocks is valid', () => {
  const msg = achievementsEarned('M-test', [], {});
  assert.equal(msg.type, 'ACHIEVEMENTS_EARNED');
  assert.equal(msg.payload.unlocks.length, 0);
  const result = validateEnvelope(msg);
  assert.ok(result.valid);
});
