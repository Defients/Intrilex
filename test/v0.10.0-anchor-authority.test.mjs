import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  reconstructAuthorityCheckpoints,
  createSimulationDecisionFrame,
  executeSimulationAction,
  authorityHashCanonical,
  verifyAuthorityCertifiedReplay
} from '@intrilex/engine-adapter';
import { hashCanonical } from '@intrilex/shared';
import {
  verifyAnchorAuthority,
  isFullHash,
  reconcileLegacyCheckpointHash,
  installAnchorHash,
  verifiedAnchorHash,
  REQUIRED_ANCHOR_FIELDS
} from '@intrilex/decision-intelligence/anchor';
import { runPairedCounterfactual } from '@intrilex/simulation-runtime/counterfactual';

installAnchorHash(hashCanonical);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

// Dynamically find a match that has both decision traces and an authorized replay
const traceDir = path.join(root, 'sample-data/autonomy/decision-traces');
const replayDir = path.join(root, 'sample-data/autonomy/replays/authorized');
const traceFiles = readdirSync(traceDir).filter(f => f.endsWith('.json'));
let MATCH_ID = null, AUTHENTIC_DECISION_ID = null, traceFile = null, retainedTrace = null, replay = null;
for (const f of traceFiles) {
  const id = f.replace('.json', '');
  const replayPath = path.join(replayDir, `${id}.authorized.replay.json`);
  try {
    const tf = JSON.parse(readFileSync(path.join(traceDir, f), 'utf8'));
    if (!tf.traces || tf.traces.length === 0) continue;
    const replayContent = readFileSync(replayPath, 'utf8');
    const r = JSON.parse(replayContent);
    verifyAuthorityCertifiedReplay(r);
    MATCH_ID = id;
    AUTHENTIC_DECISION_ID = tf.traces[0].decisionId;
    traceFile = tf;
    retainedTrace = tf.traces[0];
    replay = r;
    break;
  } catch { continue; }
}
if (!MATCH_ID) throw new Error('No valid match with traces and authorized replay found');

const checkpointIndex = 0;
const frames = reconstructAuthorityCheckpoints(replay);
const decisionFrame = createSimulationDecisionFrame(frames[checkpointIndex].state);
const beforeStateHash = authorityHashCanonical(decisionFrame.state);
const legalActionIds = decisionFrame.policyActions.map((a) => a.actionId);
const legalActionSetHash = authorityHashCanonical([...legalActionIds].sort());
const selectedActionId = retainedTrace.selectedActionId;
const selectedCommand = decisionFrame.resolve(selectedActionId);
const selectedCommandHash = authorityHashCanonical(selectedCommand);
const postState = executeSimulationAction(decisionFrame.state, selectedCommand);
const postSelectedActionStateHash = authorityHashCanonical(postState.state);
const frameActorId = selectedCommand.actorId;
const seatOrder = ['P1', 'P2'];
const frameSeat = seatOrder.indexOf(frameActorId) + 1;
// The decision-to-command mapping is derived from replay execution: the
// selected action's command hash uniquely matches replay command index 1
// (command 0 is automatic orchestration, not the player's action).
const REPLAY_COMMAND_INDEX = 1;
const commandAtReplayCommandIndex = replay.commands[REPLAY_COMMAND_INDEX];
const commandHashAtReplayCommandIndex = authorityHashCanonical(commandAtReplayCommandIndex);

const restoredAuthority = {
  matchId: replay.fixtureId,
  replayContentHash: replay.contentHash,
  replayIntegrityHash: replay.integrityHash,
  replayEngineVersion: replay.engineVersion,
  replayRulesVersion: replay.rulesVersion,
  replayCommandCount: replay.commands.length,
  checkpointIndex,
  beforeStateHash,
  legalActionSetHash,
  legalActionIds,
  frameActorId,
  frameSeat,
  selectedCommandHash,
  postSelectedActionStateHash,
  commandHashAtReplayCommandIndex,
  derivedReplayCommandIndex: REPLAY_COMMAND_INDEX
};

const retainedRecord = {
  decisionId: retainedTrace.decisionId,
  decisionIndex: retainedTrace.decisionIndex,
  checkpointHash: retainedTrace.checkpointHash,
  seat: retainedTrace.seat,
  selectedActionId: retainedTrace.selectedActionId
};

function authenticAnchor(overrides = {}) {
  return {
    matchId: MATCH_ID,
    replayContentHash: replay.contentHash,
    replayIntegrityHash: replay.integrityHash,
    decisionId: AUTHENTIC_DECISION_ID,
    decisionIndex: 0,
    replayCommandIndex: REPLAY_COMMAND_INDEX,
    beforeStateHash,
    actorId: frameActorId,
    seat: frameSeat,
    legalActionSetHash,
    selectedActionId,
    selectedCommandHash,
    postSelectedActionStateHash,
    engineVersion: replay.engineVersion,
    rulesVersion: replay.rulesVersion,
    ...overrides
  };
}

// ═══════════════════════════════════════════════════════════════════
// Part 1: Pure anchor resolver — positive + adversarial controls
// ═══════════════════════════════════════════════════════════════════
describe('Anchor resolver — pure authority verification', () => {
  it('authentic retained authority succeeds (positive control)', () => {
    const r = verifyAnchorAuthority({ anchor: authenticAnchor(), retainedRecord, restoredAuthority });
    assert.equal(r.valid, true, `expected valid, got ${r.reason}`);
  });

  it('synthetic decisionId derived from the validator formula fails (inversion reversed)', () => {
    const syntheticId = `DT-${hashCanonical({ matchId: MATCH_ID, decisionIndex: 0, checkpointHash: beforeStateHash }).slice(0, 16)}`;
    assert.notEqual(syntheticId, AUTHENTIC_DECISION_ID);
    const r = verifyAnchorAuthority({ anchor: authenticAnchor({ decisionId: syntheticId }), retainedRecord, restoredAuthority });
    assert.equal(r.valid, false);
    assert.equal(r.reason, 'DECISION_ID_MISMATCH');
  });

  for (const field of REQUIRED_ANCHOR_FIELDS) {
    it(`missing ${field} fails`, () => {
      const anchor = authenticAnchor();
      const bad = { ...anchor };
      bad[field] = undefined;
      const r = verifyAnchorAuthority({ anchor: bad, retainedRecord, restoredAuthority });
      assert.equal(r.valid, false);
      assert.equal(r.reason, `MISSING_${field.toUpperCase()}`);
    });
  }

  it('truncated beforeStateHash fails', () => {
    const r = verifyAnchorAuthority({ anchor: authenticAnchor({ beforeStateHash: beforeStateHash.slice(0, 16) }), retainedRecord, restoredAuthority });
    assert.equal(r.valid, false);
    assert.match(r.reason, /TRUNCATED_BEFORESTATEHASH/);
  });

  it('replay content hash cannot substitute for before-state authority', () => {
    const r = verifyAnchorAuthority({ anchor: authenticAnchor({ beforeStateHash: replay.contentHash }), retainedRecord, restoredAuthority });
    assert.equal(r.valid, false);
    assert.equal(r.reason, 'BEFORE_STATE_HASH_MISMATCH');
  });

  it('wrong actor fails (value-matched against frame)', () => {
    const r = verifyAnchorAuthority({ anchor: authenticAnchor({ actorId: 'WRONG' }), retainedRecord, restoredAuthority });
    assert.equal(r.valid, false);
    assert.equal(r.reason, 'ACTOR_ID_MISMATCH');
  });

  it('wrong seat fails (value-matched against frame)', () => {
    const r = verifyAnchorAuthority({ anchor: authenticAnchor({ seat: 99 }), retainedRecord, restoredAuthority });
    assert.equal(r.valid, false);
    assert.equal(r.reason, 'SEAT_MISMATCH');
  });

  it('wrong legal action set hash fails', () => {
    const r = verifyAnchorAuthority({ anchor: authenticAnchor({ legalActionSetHash: 'a'.repeat(64) }), retainedRecord, restoredAuthority });
    assert.equal(r.valid, false);
    assert.equal(r.reason, 'LEGAL_ACTION_SET_HASH_MISMATCH');
  });

  it('selected action not from retained evidence fails', () => {
    const alt = legalActionIds.find((a) => a !== selectedActionId);
    const r = verifyAnchorAuthority({ anchor: authenticAnchor({ selectedActionId: alt }), retainedRecord, restoredAuthority });
    assert.equal(r.valid, false);
    assert.equal(r.reason, 'SELECTED_ACTION_NOT_FROM_EVIDENCE');
  });

  it('wrong selected command hash fails', () => {
    const r = verifyAnchorAuthority({ anchor: authenticAnchor({ selectedCommandHash: 'b'.repeat(64) }), retainedRecord, restoredAuthority });
    assert.equal(r.valid, false);
    assert.equal(r.reason, 'SELECTED_COMMAND_HASH_MISMATCH');
  });

  it('wrong post-state hash fails (historical action must reproduce post-state)', () => {
    const r = verifyAnchorAuthority({ anchor: authenticAnchor({ postSelectedActionStateHash: 'c'.repeat(64) }), retainedRecord, restoredAuthority });
    assert.equal(r.valid, false);
    assert.equal(r.reason, 'POST_STATE_HASH_MISMATCH');
  });

  it('incompatible engine version fails', () => {
    const r = verifyAnchorAuthority({ anchor: authenticAnchor({ engineVersion: '4.9.9' }), retainedRecord, restoredAuthority });
    assert.equal(r.valid, false);
    assert.equal(r.reason, 'ENGINE_VERSION_MISMATCH');
  });

  it('incompatible rules version fails', () => {
    const r = verifyAnchorAuthority({ anchor: authenticAnchor({ rulesVersion: '4.1.2' }), retainedRecord, restoredAuthority });
    assert.equal(r.valid, false);
    assert.equal(r.reason, 'RULES_VERSION_MISMATCH');
  });

  it('fake match id fails', () => {
    const r = verifyAnchorAuthority({ anchor: authenticAnchor({ matchId: 'M-DEFINITELY-WRONG' }), retainedRecord, restoredAuthority });
    assert.equal(r.valid, false);
    assert.equal(r.reason, 'MATCH_ID_MISMATCH');
  });

  it('wrong decision index (vs retained) fails', () => {
    const r = verifyAnchorAuthority({ anchor: authenticAnchor({ decisionIndex: 1 }), retainedRecord, restoredAuthority });
    assert.equal(r.valid, false);
    assert.match(r.reason, /DECISION_INDEX_MISMATCH/);
  });

  it('replay command index out of range fails', () => {
    const r = verifyAnchorAuthority({ anchor: authenticAnchor({ replayCommandIndex: 99999 }), retainedRecord, restoredAuthority });
    assert.equal(r.valid, false);
    assert.equal(r.reason, 'REPLAY_COMMAND_INDEX_OUT_OF_RANGE');
  });

  it('decision-to-command mapping mismatch fails', () => {
    // replay command 0 is orchestration; its hash != the selected action hash.
    const r = verifyAnchorAuthority({
      anchor: authenticAnchor({ replayCommandIndex: 0 }),
      retainedRecord,
      restoredAuthority: { ...restoredAuthority, commandHashAtReplayCommandIndex: authorityHashCanonical(replay.commands[0]) }
    });
    assert.equal(r.valid, false);
    assert.equal(r.reason, 'DECISION_COMMAND_MAPPING_MISMATCH');
  });

  it('legacy 16-char retained checkpoint hash reconciles against full before-state hash', () => {
    assert.equal(reconcileLegacyCheckpointHash(retainedTrace.checkpointHash, beforeStateHash), true);
    assert.equal(beforeStateHash.startsWith(retainedTrace.checkpointHash), true);
  });

  it('isFullHash rejects truncated and accepts full', () => {
    assert.equal(isFullHash(beforeStateHash), true);
    assert.equal(isFullHash(beforeStateHash.slice(0, 16)), false);
    assert.equal(isFullHash('not-a-hash'), false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Part 2: Wired runPairedCounterfactual — the inversion must be reversed
// ═══════════════════════════════════════════════════════════════════
describe('runPairedCounterfactual — authentic authority closure', () => {
  function pairedConfig(overrides = {}) {
    const alt = legalActionIds.find((a) => a !== selectedActionId);
    return {
      matchId: MATCH_ID,
      replayContentHash: replay.contentHash,
      replayIntegrityHash: replay.integrityHash,
      checkpointHash: beforeStateHash,
      decisionId: AUTHENTIC_DECISION_ID,
      decisionIndex: 0,
      replayCommandIndex: REPLAY_COMMAND_INDEX,
      actorId: frameActorId,
      seat: frameSeat,
      legalActionSetHash,
      selectedActionId,
      selectedCommandHash,
      postSelectedActionStateHash,
      engineVersion: replay.engineVersion,
      rulesVersion: replay.rulesVersion,
      retainedDecisionEvidence: retainedRecord,
      baseSeed: 1,
      seatOrder,
      policyIds: ['tempo', 'control'],
      profileId: 'core-advanced-authority',
      alternativeActionId: alt,
      continuationPolicyIds: ['tempo', 'control'],
      replay,
      checkpointIndex: 0,
      rolloutCount: 2,
      focalSeat: 1,
      ...overrides
    };
  }

  it('authentic retained decisionId succeeds (inversion reversed)', () => {
    const result = runPairedCounterfactual(pairedConfig());
    assert.notEqual(result.selected.status, 'NOT_SUPPORTED', `authentic should not be NOT_SUPPORTED: ${result.selected.reason}`);
  });

  it('synthetic decisionId fails (inversion reversed)', () => {
    const syntheticId = `DT-${hashCanonical({ matchId: MATCH_ID, decisionIndex: 0, checkpointHash: beforeStateHash }).slice(0, 16)}`;
    const result = runPairedCounterfactual(pairedConfig({ decisionId: syntheticId }));
    assert.equal(result.selected.status, 'NOT_SUPPORTED');
    assert.match(result.selected.reason ?? '', /DECISION_ID_MISMATCH/);
  });

  it('wrong actor fails', () => {
    const result = runPairedCounterfactual(pairedConfig({ actorId: 'WRONG' }));
    assert.equal(result.selected.status, 'NOT_SUPPORTED');
    assert.match(result.selected.reason ?? '', /ACTOR_ID_MISMATCH/);
  });

  it('wrong seat fails', () => {
    const result = runPairedCounterfactual(pairedConfig({ seat: 99 }));
    assert.equal(result.selected.status, 'NOT_SUPPORTED');
    assert.match(result.selected.reason ?? '', /SEAT_MISMATCH/);
  });

  it('truncated checkpointHash fails', () => {
    const result = runPairedCounterfactual(pairedConfig({ checkpointHash: beforeStateHash.slice(0, 16) }));
    assert.equal(result.selected.status, 'NOT_SUPPORTED');
    assert.match(result.selected.reason ?? '', /TRUNCATED|BEFORE_STATE_HASH_MISMATCH/);
  });

  it('replay content hash cannot substitute for checkpoint authority', () => {
    const result = runPairedCounterfactual(pairedConfig({ checkpointHash: replay.contentHash }));
    assert.equal(result.selected.status, 'NOT_SUPPORTED');
    assert.match(result.selected.reason ?? '', /BEFORE_STATE_HASH_MISMATCH/);
  });
});
