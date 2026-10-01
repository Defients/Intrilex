// @intrilex/decision-intelligence/anchor
//
// Pure, zero-dependency anchor authority resolver. Shared verbatim by Node
// (simulation-runtime) and the browser (apps/lab-web). It contains NO hash
// computation and NO engine access: it only compares authority that the
// caller has already resolved from a real certified replay and a real
// retained Decision Evidence record. This is the single authoritative
// contract for binding a counterfactual anchor.
//
// The decisive fix versus the inverted Cascade validator:
//   * decisionId is RESOLVED from a real retained Decision Evidence record
//     (anchor.decisionId must equal retainedRecord.decisionId), never
//     re-derived from a self-invented formula. A synthesized id therefore
//     fails even if it happens to match some derivation.
//   * actorId and seat are VALUE-MATCHED against the restored engine
//     decision frame, not merely presence-checked.
//   * all state/command hashes must be the COMPLETE 64-hex canonical form;
//     truncated hashes fail. A replay content hash can never substitute for
//     decision-state (checkpoint) authority.
//   * the historical (replay-selected) action is identified from retained
//     evidence and must reproduce the recorded post-action state before any
//     alternative or continuation runs.

export const ANCHOR_SCHEMA_VERSION = '2.0.0';

// Every field is required. Unknown fields never substitute for these.
export const REQUIRED_ANCHOR_FIELDS = [
  'matchId',
  'replayContentHash',
  'replayIntegrityHash',
  'decisionId',
  'decisionIndex',
  'replayCommandIndex',
  'beforeStateHash',
  'actorId',
  'seat',
  'legalActionSetHash',
  'selectedActionId',
  'selectedCommandHash',
  'postSelectedActionStateHash',
  'engineVersion',
  'rulesVersion'
];

const FULL_HASH_RE = /^[0-9a-f]{64}$/i;
const SHORT_HEX_RE = /^[0-9a-f]+$/i;

// Complete canonical representation only. 64-hex SHA-256 canonical hashes.
export function isFullHash(value) {
  return typeof value === 'string' && FULL_HASH_RE.test(value);
}

// A retained Decision Evidence record may carry a legacy 16-char checkpoint
// hash. That legacy form is RECONCILED (it must be the prefix of the full
// before-state hash) but it can never itself serve as the supplied anchor
// beforeStateHash, which must be full.
export function reconcileLegacyCheckpointHash(retainedCheckpointHash, fullBeforeStateHash) {
  if (typeof retainedCheckpointHash !== 'string' || typeof fullBeforeStateHash !== 'string') return false;
  if (isFullHash(retainedCheckpointHash)) return retainedCheckpointHash === fullBeforeStateHash;
  // legacy short form: must be a hex prefix of the full hash
  if (!SHORT_HEX_RE.test(retainedCheckpointHash)) return false;
  return fullBeforeStateHash.startsWith(retainedCheckpointHash);
}

function fail(reason, missingAuthority) {
  return { valid: false, reason, missingAuthority };
}

// Verify a counterfactual anchor against resolved authority.
//
//   anchor           - the supplied anchor fields (all required, all full)
//   retainedRecord   - the real retained Decision Evidence record resolved
//                      from a real index/artifact by the caller (engine
//                      adapter / browser adapter). Must carry at least
//                      decisionId, decisionIndex, checkpointHash, seat and
//                      selectedActionId.
//   restoredAuthority- authority reconstructed from the certified replay by
//                      the engine: matchId, replayContentHash,
//                      replayIntegrityHash, replayEngineVersion,
//                      replayRulesVersion, replayCommandCount,
//                      beforeStateHash, legalActionSetHash, legalActionIds,
//                      frameActorId, frameSeat, selectedCommandHash,
//                      postSelectedActionStateHash, and the command hash at
//                      the supplied replayCommandIndex.
//
// Returns { valid: true } or { valid: false, reason, missingAuthority }.
export function verifyAnchorAuthority({ anchor, retainedRecord, restoredAuthority }) {
  if (!anchor || typeof anchor !== 'object') return fail('MISSING_ANCHOR', 'anchor');
  if (!retainedRecord || typeof retainedRecord !== 'object') return fail('MISSING_RETAINED_RECORD', 'retained-decision-evidence');
  if (!restoredAuthority || typeof restoredAuthority !== 'object') return fail('MISSING_RESTORED_AUTHORITY', 'restored-authority');

  // 1. Every required anchor field is present and non-empty.
  for (const field of REQUIRED_ANCHOR_FIELDS) {
    const v = anchor[field];
    if (v === undefined || v === null || v === '') {
      return fail(`MISSING_${field.toUpperCase()}`, field);
    }
  }

  // 2. State/command/replay hashes must be the complete canonical form.
  const fullHashFields = [
    'replayContentHash', 'replayIntegrityHash', 'beforeStateHash',
    'legalActionSetHash', 'selectedCommandHash', 'postSelectedActionStateHash'
  ];
  for (const field of fullHashFields) {
    if (!isFullHash(anchor[field])) {
      return fail(`TRUNCATED_${field.toUpperCase()}`, field);
    }
  }
  if (typeof anchor.decisionIndex !== 'number' || !Number.isInteger(anchor.decisionIndex) || anchor.decisionIndex < 0) {
    return fail('INVALID_DECISION_INDEX', 'decisionIndex');
  }
  if (typeof anchor.replayCommandIndex !== 'number' || !Number.isInteger(anchor.replayCommandIndex) || anchor.replayCommandIndex < 0) {
    return fail('INVALID_REPLAY_COMMAND_INDEX', 'replayCommandIndex');
  }
  if (typeof anchor.seat !== 'number' || !Number.isInteger(anchor.seat) || anchor.seat < 1) {
    return fail('INVALID_SEAT', 'seat');
  }

  // 3. Match identity binds to the certified replay.
  if (anchor.matchId !== restoredAuthority.matchId) {
    return fail('MATCH_ID_MISMATCH', 'matchId');
  }

  // 4. Replay content + integrity bind to the certified replay.
  if (anchor.replayContentHash !== restoredAuthority.replayContentHash) {
    return fail('REPLAY_CONTENT_HASH_MISMATCH', 'replayContentHash');
  }
  if (anchor.replayIntegrityHash !== restoredAuthority.replayIntegrityHash) {
    return fail('REPLAY_INTEGRITY_HASH_MISMATCH', 'replayIntegrityHash');
  }

  // 5. Engine + Rules versions must be compatible with the certified replay.
  if (anchor.engineVersion !== restoredAuthority.replayEngineVersion) {
    return fail('ENGINE_VERSION_MISMATCH', 'engineVersion');
  }
  if (anchor.rulesVersion !== restoredAuthority.replayRulesVersion) {
    return fail('RULES_VERSION_MISMATCH', 'rulesVersion');
  }

  // 6. replayCommandIndex must be in range.
  if (anchor.replayCommandIndex >= restoredAuthority.replayCommandCount) {
    return fail('REPLAY_COMMAND_INDEX_OUT_OF_RANGE', 'replayCommandIndex');
  }

  // 7. decisionIndex binds to the retained record (and to the checkpoint).
  if (anchor.decisionIndex !== retainedRecord.decisionIndex) {
    return fail('DECISION_INDEX_MISMATCH', 'decisionIndex');
  }
  if (typeof restoredAuthority.checkpointIndex === 'number' && anchor.decisionIndex !== restoredAuthority.checkpointIndex) {
    return fail('DECISION_INDEX_CHECKPOINT_CONFLICT', 'decisionIndex');
  }

  // 8. The full before-state hash must match the restored engine state.
  if (anchor.beforeStateHash !== restoredAuthority.beforeStateHash) {
    return fail('BEFORE_STATE_HASH_MISMATCH', 'beforeStateHash');
  }

  // 9. Reconcile the retained record's (possibly legacy short) checkpoint hash
  //    against the full before-state hash. A replay content hash cannot
  //    substitute for decision-state authority: the retained checkpoint hash
  //    must be a prefix of (or exactly) the full before-state hash.
  if (!reconcileLegacyCheckpointHash(retainedRecord.checkpointHash, anchor.beforeStateHash)) {
    return fail('RETAINED_CHECKPOINT_HASH_RECONCILIATION_FAILED', 'retained-checkpoint-hash');
  }

  // 10. decisionId is RESOLVED from the real retained record, never
  //     re-derived. A synthesized id fails here even if it matches a formula.
  if (anchor.decisionId !== retainedRecord.decisionId) {
    return fail('DECISION_ID_MISMATCH', 'decisionId');
  }

  // 11. actorId and seat are VALUE-MATCHED against the restored decision frame.
  if (anchor.actorId !== restoredAuthority.frameActorId) {
    return fail('ACTOR_ID_MISMATCH', 'actorId');
  }
  if (anchor.seat !== restoredAuthority.frameSeat) {
    return fail('SEAT_MISMATCH', 'seat');
  }
  // The retained record's seat must also agree.
  if (typeof retainedRecord.seat === 'number' && retainedRecord.seat !== anchor.seat) {
    return fail('RETAINED_SEAT_MISMATCH', 'seat');
  }

  // 12. Legal action set hash binds to the restored frame.
  if (anchor.legalActionSetHash !== restoredAuthority.legalActionSetHash) {
    return fail('LEGAL_ACTION_SET_HASH_MISMATCH', 'legalActionSetHash');
  }

  // 13. The historical (replay-selected) action comes from retained evidence,
  //     never from legal-array order, and must be legal.
  if (anchor.selectedActionId !== retainedRecord.selectedActionId) {
    return fail('SELECTED_ACTION_NOT_FROM_EVIDENCE', 'selectedActionId');
  }
  if (!Array.isArray(restoredAuthority.legalActionIds) || !restoredAuthority.legalActionIds.includes(anchor.selectedActionId)) {
    return fail('SELECTED_ACTION_NOT_LEGAL', 'selectedActionId');
  }

  // 14. The selected command hash must match the restored frame's resolution.
  if (anchor.selectedCommandHash !== restoredAuthority.selectedCommandHash) {
    return fail('SELECTED_COMMAND_HASH_MISMATCH', 'selectedCommandHash');
  }

  // 15. The historical action must reproduce the recorded post-action state.
  if (anchor.postSelectedActionStateHash !== restoredAuthority.postSelectedActionStateHash) {
    return fail('POST_STATE_HASH_MISMATCH', 'postSelectedActionStateHash');
  }

  // 16. Decision-to-command mapping: the replay command at replayCommandIndex
  //     must be the selected command (unique mapping). The runtime derives a
  //     unique mapping from full command hashes and replay execution; the
  //     supplied index must match that derivation, and the command hash at the
  //     supplied index must equal the selected command hash. Ambiguity is
  //     rejected by the runtime before reaching here.
  if (typeof restoredAuthority.derivedReplayCommandIndex === 'number'
      && anchor.replayCommandIndex !== restoredAuthority.derivedReplayCommandIndex) {
    return fail('DECISION_COMMAND_MAPPING_MISMATCH', 'replayCommandIndex');
  }
  if (typeof restoredAuthority.commandHashAtReplayCommandIndex === 'string'
      && restoredAuthority.commandHashAtReplayCommandIndex !== anchor.selectedCommandHash) {
    return fail('DECISION_COMMAND_MAPPING_MISMATCH', 'replayCommandIndex');
  }

  return { valid: true };
}

// Convenience: a stable, content-addressed verified anchor hash that both
// Node and the browser can compute from the verified authority. Identical
// inputs MUST produce identical hashes across consumers (parity gate).
let _hashCanonical = null;
export function installAnchorHash(hashCanonical) { _hashCanonical = hashCanonical; }
export function verifiedAnchorHash(anchor, retainedRecord, restoredAuthority) {
  const h = _hashCanonical;
  if (typeof h !== 'function') throw new Error('Anchor hash not installed; call installAnchorHash(hashCanonical) first.');
  return h({
    schemaVersion: ANCHOR_SCHEMA_VERSION,
    matchId: anchor.matchId,
    replayContentHash: anchor.replayContentHash,
    replayIntegrityHash: anchor.replayIntegrityHash,
    decisionId: retainedRecord.decisionId,
    decisionIndex: anchor.decisionIndex,
    replayCommandIndex: anchor.replayCommandIndex,
    beforeStateHash: anchor.beforeStateHash,
    actorId: anchor.actorId,
    seat: anchor.seat,
    legalActionSetHash: anchor.legalActionSetHash,
    selectedActionId: anchor.selectedActionId,
    selectedCommandHash: anchor.selectedCommandHash,
    postSelectedActionStateHash: anchor.postSelectedActionStateHash,
    engineVersion: anchor.engineVersion,
    rulesVersion: anchor.rulesVersion
  });
}
