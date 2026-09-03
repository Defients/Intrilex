// V0.17.0 Phase 5 — Save and recovery tests
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Mock localStorage and BroadcastChannel for Node.js test environment
const _store = new Map();
globalThis.localStorage = {
  getItem: (key) => _store.has(key) ? _store.get(key) : null,
  setItem: (key, value) => { _store.set(key, String(value)); },
  removeItem: (key) => { _store.delete(key); },
  clear: () => { _store.clear(); },
};
globalThis.BroadcastChannel = class {
  constructor(name) { this.name = name; this.onmessage = null; }
  postMessage() {}
  close() {}
};

import { acquireLease, releaseLease, checkLease, forceTakeLease, generateTabId } from '../apps/lab-web/src/play/state/session-lease.js';

const persistenceSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/persistence.js'), 'utf8');
const controllerSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/play-controller.js'), 'utf8');
const saveIntegritySrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/save-integrity.js'), 'utf8');
const sessionLeaseSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/state/session-lease.js'), 'utf8');

// ─── Session Lease Tests ────────────────────────────────────────

test('generateTabId: returns unique tab ID', () => {
  const id1 = generateTabId();
  const id2 = generateTabId();
  assert.ok(id1.startsWith('tab-'));
  assert.ok(id2.startsWith('tab-'));
  assert.notEqual(id1, id2);
});

test('acquireLease: acquires lease for new session', async () => {
  const tabId = generateTabId();
  const result = await acquireLease('test-session-1', tabId);
  assert.equal(result.acquired, true);
  // Clean up
  releaseLease('test-session-1', tabId);
});

test('checkLease: returns not leased when no lease exists', () => {
  const result = checkLease('nonexistent-session', 'tab-1');
  assert.equal(result.leased, false);
});

test('checkLease: returns not leased for same tab', async () => {
  const tabId = generateTabId();
  await acquireLease('test-session-2', tabId);
  const result = checkLease('test-session-2', tabId);
  assert.equal(result.leased, false);
  releaseLease('test-session-2', tabId);
});

test('checkLease: returns leased for different tab', async () => {
  _store.clear();
  const tabId1 = generateTabId();
  const tabId2 = generateTabId();
  await acquireLease('test-session-3', tabId1);
  const result = checkLease('test-session-3', tabId2);
  assert.equal(result.leased, true);
  assert.equal(result.holder, tabId1);
  releaseLease('test-session-3', tabId1);
  _store.clear();
});

test('forceTakeLease: takes lease from another tab', async () => {
  const tabId1 = generateTabId();
  const tabId2 = generateTabId();
  await acquireLease('test-session-4', tabId1);
  await forceTakeLease('test-session-4', tabId2);
  const result = checkLease('test-session-4', tabId2);
  assert.equal(result.leased, false); // tabId2 now holds it
  releaseLease('test-session-4', tabId2);
});

test('releaseLease: releases the lease', async () => {
  const tabId = generateTabId();
  await acquireLease('test-session-5', tabId);
  releaseLease('test-session-5', tabId);
  const result = checkLease('test-session-5', tabId);
  assert.equal(result.leased, false);
});

test('session lease: discarded documents release control while BFCache pages retain it', () => {
  assert.match(sessionLeaseSrc, /addEventListener\('pagehide'/, 'lease lifecycle must observe document discard');
  assert.match(sessionLeaseSrc, /event\.persisted\s*\|\|\s*!_currentLease/, 'BFCache pagehide must preserve the live lease');
  assert.match(sessionLeaseSrc, /releaseLease\(sessionId, tabId\)/, 'discarded documents must synchronously release their current lease');
});

// ─── Persistence Structure Tests ────────────────────────────────

test('persistence: has save/resume functions', () => {
  assert.ok(persistenceSrc.includes('putSave'), 'Must have putSave');
  assert.ok(persistenceSrc.includes('getSave'), 'Must have getSave');
  assert.ok(persistenceSrc.includes('listSaves'), 'Must have listSaves');
  assert.ok(persistenceSrc.includes('deleteSave'), 'Must have deleteSave');
});

test('persistence: has quarantine for corrupt saves', () => {
  assert.ok(persistenceSrc.includes('quarantineSave'), 'Must have quarantineSave');
  assert.ok(persistenceSrc.includes('QUARANTINE'), 'Must have QUARANTINE store');
});

test('persistence: has replay storage', () => {
  assert.ok(persistenceSrc.includes('putReplay'), 'Must have putReplay');
  assert.ok(persistenceSrc.includes('getReplay'), 'Must have getReplay');
  assert.ok(persistenceSrc.includes('listReplays'), 'Must have listReplays');
  assert.ok(persistenceSrc.includes('deleteReplay'), 'Must have deleteReplay');
});

test('persistence: has preferences', () => {
  assert.ok(persistenceSrc.includes('getPreference'), 'Must have getPreference');
  assert.ok(persistenceSrc.includes('setPreference'), 'Must have setPreference');
});

test('persistence: has export/import', () => {
  assert.ok(persistenceSrc.includes('exportSave'), 'Must have exportSave');
  assert.ok(persistenceSrc.includes('importSave'), 'Must have importSave');
  assert.ok(persistenceSrc.includes('exportReplay'), 'Must have exportReplay');
});

test('persistence: import validates content hash', () => {
  // importSave delegates to validateSaveEnvelope (canonical v2 validator)
  assert.ok(persistenceSrc.includes('validateSaveEnvelope'), 'Must use canonical v2 validator');
  assert.ok(persistenceSrc.includes('quarantineSave'), 'Must quarantine corrupt saves');
  assert.ok(saveIntegritySrc.includes('contentHash'), 'save-integrity must validate content hash');
  assert.ok(saveIntegritySrc.includes('SAVE_HASH_MISMATCH'), 'save-integrity must handle hash mismatch');
});

// ─── Save Controller Structure Tests ────────────────────────────

test('play-controller: has save envelope with integrity hash', () => {
  assert.ok(controllerSrc.includes('getSaveEnvelope'), 'Must have getSaveEnvelope');
  assert.ok(controllerSrc.includes('contentHash'), 'Must have contentHash in save envelope');
  assert.ok(controllerSrc.includes('initialStateHash'), 'Must have initialStateHash');
  assert.ok(controllerSrc.includes('commandLogHash'), 'Must have commandLogHash');
  assert.ok(controllerSrc.includes('expectedStateHash'), 'Must have expectedStateHash');
});

test('play-controller: restore validates compatibility', () => {
  assert.ok(controllerSrc.includes('restore'), 'Must have restore method');
  assert.ok(controllerSrc.includes('validateSaveEnvelope'), 'Must delegate to validateSaveEnvelope');
  assert.ok(saveIntegritySrc.includes('INVALID_SAVE_FORMAT'), 'save-integrity must validate save format');
  assert.ok(saveIntegritySrc.includes('INCOMPATIBLE_ENGINE_VERSION'), 'save-integrity must validate engine version');
  assert.ok(saveIntegritySrc.includes('INCOMPATIBLE_RULES_VERSION'), 'save-integrity must validate rules version');
});

test('play-controller: save envelope has version metadata', () => {
  assert.ok(controllerSrc.includes('productVersion'), 'Must have productVersion');
  assert.ok(controllerSrc.includes('engineVersion'), 'Must have engineVersion');
  assert.ok(controllerSrc.includes('rulesVersion'), 'Must have rulesVersion');
  assert.ok(controllerSrc.includes('playerRuntimeVersion'), 'Must have playerRuntimeVersion');
});

test('play-controller: save envelope has stable boundary', () => {
  assert.ok(controllerSrc.includes('stableBoundary'), 'Must have stableBoundary');
  assert.ok(controllerSrc.includes('stateRevision'), 'Must have stateRevision in boundary');
  assert.ok(controllerSrc.includes('decisionFrameHash'), 'Must have decisionFrameHash in boundary');
});

// ─── Conservation Tests ─────────────────────────────────────────

test('CONSERVATION: save envelope does not contain UI state', () => {
  // The save envelope should not contain guidance mode, inspector state, etc.
  // These are UI-only and should not be persisted as authority
  const saveEnvelopeSection = controllerSrc.slice(
    controllerSrc.indexOf('getSaveEnvelope'),
    controllerSrc.indexOf('restore')
  );
  assert.ok(!saveEnvelopeSection.includes('guidanceMode'), 'Save envelope must not contain guidanceMode');
  assert.ok(!saveEnvelopeSection.includes('inspectorCardId'), 'Save envelope must not contain inspectorCardId');
  assert.ok(!saveEnvelopeSection.includes('_selectedActionId'), 'Save envelope must not contain _selectedActionId');
});

test('CONSERVATION: restore replays from initial state, not from snapshot', () => {
  assert.ok(controllerSrc.includes('_initialState'), 'Must preserve initial state');
  assert.ok(controllerSrc.includes('structuredClone'), 'Must clone initial state');
});

// ═══════════════════════════════════════════════════════════════
// Gate 1 — Save Authority Behavioral Mutation Matrix
// ═══════════════════════════════════════════════════════════════

// IMPORTANT: We import the PRODUCTION buildSaveIntegrityPayload and
// validateSaveEnvelope from the BUILT dist/play/save-integrity.js —
// NOT a duplicated test copy. This ensures tests exercise the actual
// restore path that ships in the browser. The dist version resolves
// the engine/browser-entry.js import correctly.
import {
  buildSaveIntegrityPayload,
  validateSaveEnvelope,
  PRODUCT_VERSION,
  PLAYER_RUNTIME_VERSION,
  ENGINE_VERSION,
  RULES_VERSION,
  SAVE_FORMAT_VERSION,
  SUPPORTED_PROFILES,
} from '../apps/lab-web/dist/play/save-integrity.js';

// hashCanonical is needed for constructing test save fixtures (setup hashes etc.)
import { hashCanonical } from '../apps/lab-web/dist/engine/browser-entry.js';

const SAVE_V2 = SAVE_FORMAT_VERSION;
const V018 = PRODUCT_VERSION;
const PRT_110 = PLAYER_RUNTIME_VERSION;
const ENG_426 = ENGINE_VERSION;
const RULES_412 = RULES_VERSION;

function makeValidSave(overrides = {}) {
  const save = {
    format: 'intrilex-player-save',
    version: SAVE_V2,
    saveId: 'SAVE-test-session-0',
    sessionId: 'test-session',
    productVersion: V018,
    playerRuntimeVersion: PRT_110,
    engineVersion: ENG_426,
    rulesVersion: RULES_412,
    profileId: 'core-advanced-authority',
    mode: 'vs-ai',
    setup: {
      seed: 42,
      seatOrder: ['P1', 'P2'],
      humanPlayerId: 'P1',
      aiPolicyId: 'score-rush',
      aiPolicyVersion: '1.0.0',
      aiConfigHash: hashCanonical({ policyId: 'score-rush' }),
    },
    decisionJournal: [],
    commandLog: [],
    initialStateHash: hashCanonical(null),
    commandLogHash: hashCanonical([]),
    expectedStateHash: hashCanonical(null),
    stableBoundary: { stateRevision: 0, decisionFrameHash: null },
    tutorial: null,
  };
  Object.assign(save, overrides);
  save.contentHash = buildSaveIntegrityPayload(save);
  return save;
}

// ─── Integrity Payload Behavioral Tests ──────────────────────

test('SAVE_AUTH: buildSaveIntegrityPayload produces stable hash', () => {
  const save = makeValidSave();
  const h1 = buildSaveIntegrityPayload(save);
  const h2 = buildSaveIntegrityPayload(save);
  assert.equal(h1, h2, 'buildSaveIntegrityPayload must be deterministic');
  assert.ok(h1.length === 64, 'hash must be 64 hex characters');
});

test('SAVE_AUTH: contentHash changes on tampered saveId', () => {
  const save = makeValidSave();
  const original = save.contentHash;
  save.saveId = 'TAMPERED';
  assert.notEqual(buildSaveIntegrityPayload(save), original, 'saveId mutation must change hash');
});

test('SAVE_AUTH: contentHash changes on tampered sessionId', () => {
  const save = makeValidSave();
  const original = save.contentHash;
  save.sessionId = 'TAMPERED-SESSION';
  assert.notEqual(buildSaveIntegrityPayload(save), original);
});

test('SAVE_AUTH: contentHash changes on tampered profileId', () => {
  const save = makeValidSave();
  const original = save.contentHash;
  save.profileId = 'core-unrestricted-authority';
  assert.notEqual(buildSaveIntegrityPayload(save), original);
});

test('SAVE_AUTH: contentHash changes on tampered mode', () => {
  const save = makeValidSave();
  const original = save.contentHash;
  save.mode = 'TAMPERED-MODE';
  assert.notEqual(buildSaveIntegrityPayload(save), original);
});

test('SAVE_AUTH: contentHash changes on tampered seed', () => {
  const save = makeValidSave();
  const original = save.contentHash;
  save.setup = { ...save.setup, seed: 99999 };
  assert.notEqual(buildSaveIntegrityPayload(save), original);
});

test('SAVE_AUTH: contentHash changes on tampered seatOrder', () => {
  const save = makeValidSave();
  const original = save.contentHash;
  save.setup = { ...save.setup, seatOrder: ['P2', 'P1'] };
  assert.notEqual(buildSaveIntegrityPayload(save), original);
});

test('SAVE_AUTH: contentHash changes on tampered humanPlayerId', () => {
  const save = makeValidSave();
  const original = save.contentHash;
  save.setup = { ...save.setup, humanPlayerId: 'P2' };
  assert.notEqual(buildSaveIntegrityPayload(save), original);
});

test('SAVE_AUTH: contentHash changes on tampered aiPolicyId', () => {
  const save = makeValidSave();
  const original = save.contentHash;
  save.setup = { ...save.setup, aiPolicyId: 'hybrix-rusher' };
  assert.notEqual(buildSaveIntegrityPayload(save), original);
});

test('SAVE_AUTH: contentHash changes on tampered decisionJournal', () => {
  const save = makeValidSave();
  const original = save.contentHash;
  save.decisionJournal = [{ fake: true }];
  assert.notEqual(buildSaveIntegrityPayload(save), original);
});

test('SAVE_AUTH: contentHash changes on tampered commandLog', () => {
  const save = makeValidSave();
  const original = save.contentHash;
  save.commandLog = ['fake-command'];
  assert.notEqual(buildSaveIntegrityPayload(save), original);
});

test('SAVE_AUTH: contentHash changes on tampered initialStateHash', () => {
  const save = makeValidSave();
  const original = save.contentHash;
  save.initialStateHash = 'deadbeef';
  assert.notEqual(buildSaveIntegrityPayload(save), original);
});

test('SAVE_AUTH: contentHash changes on tampered commandLogHash', () => {
  const save = makeValidSave();
  const original = save.contentHash;
  save.commandLogHash = 'deadbeef';
  assert.notEqual(buildSaveIntegrityPayload(save), original);
});

test('SAVE_AUTH: contentHash changes on tampered expectedStateHash', () => {
  const save = makeValidSave();
  const original = save.contentHash;
  save.expectedStateHash = 'deadbeef';
  assert.notEqual(buildSaveIntegrityPayload(save), original);
});

test('SAVE_AUTH: contentHash changes on tampered stableBoundary', () => {
  const save = makeValidSave();
  const original = save.contentHash;
  save.stableBoundary = { stateRevision: 999 };
  assert.notEqual(buildSaveIntegrityPayload(save), original);
});

test('SAVE_AUTH: contentHash changes on tampered tutorial', () => {
  const save = makeValidSave();
  const original = save.contentHash;
  save.tutorial = { tampered: true };
  assert.notEqual(buildSaveIntegrityPayload(save), original);
});

test('SAVE_AUTH: contentHash changes on tampered format', () => {
  const save = makeValidSave();
  const original = save.contentHash;
  save.format = 'not-intrilex';
  assert.notEqual(buildSaveIntegrityPayload(save), original);
});

test('SAVE_AUTH: contentHash changes on tampered version', () => {
  const save = makeValidSave();
  const original = save.contentHash;
  save.version = 99;
  assert.notEqual(buildSaveIntegrityPayload(save), original);
});

test('SAVE_AUTH: contentHash changes on tampered productVersion', () => {
  const save = makeValidSave();
  const original = save.contentHash;
  save.productVersion = '0.17.0';
  assert.notEqual(buildSaveIntegrityPayload(save), original);
});

test('SAVE_AUTH: contentHash changes on tampered engineVersion', () => {
  const save = makeValidSave();
  const original = save.contentHash;
  save.engineVersion = '4.2.5';
  assert.notEqual(buildSaveIntegrityPayload(save), original);
});

test('SAVE_AUTH: contentHash changes on tampered rulesVersion', () => {
  const save = makeValidSave();
  const original = save.contentHash;
  save.rulesVersion = '4.1.1';
  assert.notEqual(buildSaveIntegrityPayload(save), original);
});

test('SAVE_AUTH: contentHash changes on tampered playerRuntimeVersion', () => {
  const save = makeValidSave();
  const original = save.contentHash;
  save.playerRuntimeVersion = '1.0.0';
  assert.notEqual(buildSaveIntegrityPayload(save), original);
});

// ─── Controller Integration (Source-String) Tests ────────────

test('SAVE_AUTH: controller has buildSaveIntegrityPayload', () => {
  assert.ok(controllerSrc.includes('buildSaveIntegrityPayload'), 'Must have buildSaveIntegrityPayload');
});

test('SAVE_AUTH: controller validates contentHash before mutation', () => {
  // The restore method must delegate to validateSaveEnvelope BEFORE any mutation
  const restoreMethod = controllerSrc.slice(controllerSrc.indexOf('async restore(save)'), controllerSrc.indexOf('Phase 5'));
  assert.ok(restoreMethod.includes('validateSaveEnvelope'), 'Must call validateSaveEnvelope before mutation');
  assert.ok(restoreMethod.includes('validation.valid'), 'Must check validation result');
  // The reason codes live in save-integrity.js now
  assert.ok(saveIntegritySrc.includes('LEGACY_UNBOUND_AUTHORITY'), 'save-integrity must handle v1 saves');
  assert.ok(saveIntegritySrc.includes('UNSUPPORTED_PROFILE'), 'save-integrity must validate profile');
  assert.ok(saveIntegritySrc.includes('INCOMPATIBLE_PRODUCT_VERSION'), 'save-integrity must validate product version');
  assert.ok(saveIntegritySrc.includes('SAVE_HASH_MISMATCH'), 'save-integrity must check content hash');
  // Restore-specific checks remain in play-controller.js
  assert.ok(controllerSrc.includes('EXPECTED_STATE_HASH_MISMATCH'), 'Must strictly validate expectedStateHash');
  assert.ok(controllerSrc.includes('COMMAND_LOG_HASH_MISMATCH'), 'Must validate commandLogHash');
  assert.ok(controllerSrc.includes('INITIAL_STATE_HASH_MISMATCH'), 'Must validate initialStateHash');
});

test('SAVE_AUTH: controller has SUPPORTED_PROFILES registry', () => {
  assert.ok(saveIntegritySrc.includes('SUPPORTED_PROFILES'), 'save-integrity must have SUPPORTED_PROFILES registry');
  assert.ok(saveIntegritySrc.includes('core-advanced-authority'), 'Must include core-advanced-authority');
  assert.ok(saveIntegritySrc.includes('core-unrestricted-authority'), 'Must include core-unrestricted-authority');
});

test('SAVE_AUTH: controller has v2 save format version', () => {
  assert.ok(controllerSrc.includes('SAVE_FORMAT_VERSION'), 'Must have SAVE_FORMAT_VERSION constant');
  assert.ok(controllerSrc.includes('version: SAVE_FORMAT_VERSION'), 'Must use constant in getSaveEnvelope');
});

test('SAVE_AUTH: controller has transactional rollback', () => {
  assert.ok(controllerSrc.includes('Rollback'), 'Must have rollback comment');
  assert.ok(controllerSrc.includes('savedStatus'), 'Must save status for rollback');
  assert.ok(controllerSrc.includes('savedState'), 'Must save state for rollback');
});

// ─── Production validateSaveEnvelope Path Tests ──────────────
// These exercise the CANONICAL validation function that restore() calls.
// They prove the mutation matrix is enforced through the production path,
// not just through hash comparison.

test('SAVE_AUTH_VALIDATE: valid save passes validateSaveEnvelope', () => {
  const save = makeValidSave();
  const result = validateSaveEnvelope(save);
  assert.equal(result.valid, true);
});

test('SAVE_AUTH_VALIDATE: null save rejected with INVALID_SAVE_ENVELOPE', () => {
  const result = validateSaveEnvelope(null);
  assert.equal(result.valid, false);
  assert.equal(result.reasonCode, 'INVALID_SAVE_ENVELOPE');
});

test('SAVE_AUTH_VALIDATE: wrong format rejected with INVALID_SAVE_FORMAT', () => {
  const save = makeValidSave({ format: 'not-intrilex' });
  save.contentHash = buildSaveIntegrityPayload(save);
  const result = validateSaveEnvelope(save);
  assert.equal(result.valid, false);
  assert.equal(result.reasonCode, 'INVALID_SAVE_FORMAT');
});

test('SAVE_AUTH_VALIDATE: v1 save rejected with LEGACY_UNBOUND_AUTHORITY', () => {
  const save = makeValidSave({ version: 1 });
  save.contentHash = buildSaveIntegrityPayload(save);
  const result = validateSaveEnvelope(save);
  assert.equal(result.valid, false);
  assert.equal(result.reasonCode, 'LEGACY_UNBOUND_AUTHORITY');
});

test('SAVE_AUTH_VALIDATE: v99 save rejected with UNSUPPORTED_SAVE_VERSION', () => {
  const save = makeValidSave({ version: 99 });
  save.contentHash = buildSaveIntegrityPayload(save);
  const result = validateSaveEnvelope(save);
  assert.equal(result.valid, false);
  assert.equal(result.reasonCode, 'UNSUPPORTED_SAVE_VERSION');
});

test('SAVE_AUTH_VALIDATE: missing field rejected with MISSING_SAVE_FIELD', () => {
  const save = makeValidSave();
  delete save.saveId;
  const result = validateSaveEnvelope(save);
  assert.equal(result.valid, false);
  assert.equal(result.reasonCode, 'MISSING_SAVE_FIELD');
  assert.equal(result.field, 'saveId');
});

test('SAVE_AUTH_VALIDATE: tampered contentHash rejected with SAVE_HASH_MISMATCH', () => {
  const save = makeValidSave();
  save.contentHash = '0'.repeat(64);
  const result = validateSaveEnvelope(save);
  assert.equal(result.valid, false);
  assert.equal(result.reasonCode, 'SAVE_HASH_MISMATCH');
});

test('SAVE_AUTH_VALIDATE: wrong engineVersion rejected with INCOMPATIBLE_ENGINE_VERSION', () => {
  const save = makeValidSave({ engineVersion: '4.2.5' });
  save.contentHash = buildSaveIntegrityPayload(save);
  const result = validateSaveEnvelope(save);
  assert.equal(result.valid, false);
  assert.equal(result.reasonCode, 'INCOMPATIBLE_ENGINE_VERSION');
});

test('SAVE_AUTH_VALIDATE: wrong rulesVersion rejected with INCOMPATIBLE_RULES_VERSION', () => {
  const save = makeValidSave({ rulesVersion: '4.1.1' });
  save.contentHash = buildSaveIntegrityPayload(save);
  const result = validateSaveEnvelope(save);
  assert.equal(result.valid, false);
  assert.equal(result.reasonCode, 'INCOMPATIBLE_RULES_VERSION');
});

test('SAVE_AUTH_VALIDATE: wrong playerRuntimeVersion rejected', () => {
  const save = makeValidSave({ playerRuntimeVersion: '1.0.0' });
  save.contentHash = buildSaveIntegrityPayload(save);
  const result = validateSaveEnvelope(save);
  assert.equal(result.valid, false);
  assert.equal(result.reasonCode, 'INCOMPATIBLE_PLAYER_RUNTIME');
});

test('SAVE_AUTH_VALIDATE: wrong productVersion rejected', () => {
  const save = makeValidSave({ productVersion: '0.17.0' });
  save.contentHash = buildSaveIntegrityPayload(save);
  const result = validateSaveEnvelope(save);
  assert.equal(result.valid, false);
  assert.equal(result.reasonCode, 'INCOMPATIBLE_PRODUCT_VERSION');
});

test('SAVE_AUTH_VALIDATE: unsupported profile rejected', () => {
  const save = makeValidSave({ profileId: 'rogue-authority' });
  save.contentHash = buildSaveIntegrityPayload(save);
  const result = validateSaveEnvelope(save);
  assert.equal(result.valid, false);
  assert.equal(result.reasonCode, 'UNSUPPORTED_PROFILE');
});

test('SAVE_AUTH_VALIDATE: tampered saveId detected by contentHash check', () => {
  const save = makeValidSave();
  save.saveId = 'TAMPERED-AFTER-HASH';
  const result = validateSaveEnvelope(save);
  assert.equal(result.valid, false);
  assert.equal(result.reasonCode, 'SAVE_HASH_MISMATCH');
});

test('SAVE_AUTH_VALIDATE: tampered commandLog detected by contentHash', () => {
  const save = makeValidSave();
  save.commandLog = ['sneaky-command'];
  const result = validateSaveEnvelope(save);
  assert.equal(result.valid, false);
  assert.equal(result.reasonCode, 'SAVE_HASH_MISMATCH');
});

test('SAVE_AUTH_VALIDATE: tampered decisionJournal detected by contentHash', () => {
  const save = makeValidSave();
  save.decisionJournal = [{ fake: true }];
  const result = validateSaveEnvelope(save);
  assert.equal(result.valid, false);
  assert.equal(result.reasonCode, 'SAVE_HASH_MISMATCH');
});
