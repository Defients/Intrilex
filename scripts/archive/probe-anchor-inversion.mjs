// Adversarial probe: reproduce the inverted anchor validator described in
// Section 3.3 of the Proof Lock prompt against the selected baseline.
//
// Expected (inverted) behavior:
//   - Authentic retained Decision Evidence ID  DT-05f2e10a588e1be6  -> NOT_SUPPORTED
//   - Synthetic ID derived from the validator's own formula          -> COMPLETED
//   - Synthetic ID with wrong actor / wrong seat                    -> COMPLETED
//
// This script is READ-ONLY: it imports the live packages and reports observed
// statuses. It does not modify any source.

import { readFileSync } from 'node:fs';
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
import { runPairedCounterfactual } from '@intrilex/simulation-runtime/counterfactual';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

const MATCH_ID = 'M-161726cc9a3a57e46f9c';
const AUTHENTIC_DECISION_ID = 'DT-05f2e10a588e1be6';

// Load the authentic retained decision trace to recover retained authority.
const traceFile = JSON.parse(read(`sample-data/autonomy/decision-traces/${MATCH_ID}.json`));
const authenticTrace = traceFile.traces.find((t) => t.decisionId === AUTHENTIC_DECISION_ID);
if (!authenticTrace) throw new Error(`Authentic trace ${AUTHENTIC_DECISION_ID} not found`);

// Retained Decision Evidence record resolved from the real index/artifact.
const retainedDecisionEvidence = {
  decisionId: authenticTrace.decisionId,
  decisionIndex: authenticTrace.decisionIndex,
  checkpointHash: authenticTrace.checkpointHash,
  seat: authenticTrace.seat,
  selectedActionId: authenticTrace.selectedActionId
};

// Load the authorized certified replay.
const replay = JSON.parse(read(`sample-data/autonomy/replays/authorized/${MATCH_ID}.authorized.replay.json`));
verifyAuthorityCertifiedReplay(replay); // throws if corrupt

// Reconstruct authority checkpoints and the decision frame at checkpointIndex 0.
const frames = reconstructAuthorityCheckpoints(replay);
const checkpointIndex = 0;
const decisionFrame = createSimulationDecisionFrame(frames[checkpointIndex].state);
const beforeStateHash = authorityHashCanonical(decisionFrame.state);
const legalActionSetHash = authorityHashCanonical(decisionFrame.policyActions.map((a) => a.actionId).sort());

const authenticSelectedActionId = authenticTrace.selectedActionId;
const selectedCommand = decisionFrame.resolve(authenticSelectedActionId);
const selectedCommandHash = authorityHashCanonical(selectedCommand);
const postState = executeSimulationAction(decisionFrame.state, selectedCommand);
const postSelectedActionStateHash = authorityHashCanonical(postState.state);
const frameActorId = selectedCommand.actorId;
const seatOrder = ['P1', 'P2'];
const frameSeat = seatOrder.indexOf(frameActorId) + 1;

// Derive the unique decision-to-command mapping from full command hashes.
let derivedReplayCommandIndex = -1;
for (let i = 0; i < replay.commands.length; i += 1) {
  if (authorityHashCanonical(replay.commands[i]) === selectedCommandHash) { derivedReplayCommandIndex = i; break; }
}

// The synthetic decision id the validator itself would derive from the FULL hash.
const syntheticDecisionId = `DT-${hashCanonical({ matchId: MATCH_ID, decisionIndex: 0, checkpointHash: beforeStateHash }).slice(0, 16)}`;

const altAction = decisionFrame.policyActions.find((a) => a.actionId !== authenticSelectedActionId);

function baseConfig(overrides) {
  return {
    matchId: MATCH_ID,
    replayContentHash: replay.contentHash,
    replayIntegrityHash: replay.integrityHash,
    checkpointHash: beforeStateHash,          // FULL hash
    decisionId: syntheticDecisionId,          // overridden per probe
    decisionIndex: 0,
    replayCommandIndex: derivedReplayCommandIndex,
    actorId: frameActorId,
    seat: frameSeat,
    legalActionSetHash,
    selectedActionId: authenticSelectedActionId,
    selectedCommandHash,
    postSelectedActionStateHash,
    engineVersion: replay.engineVersion,    // 4.2.6 (historical 4.2.5 replay)
    rulesVersion: replay.rulesVersion,       // 4.1
    retainedDecisionEvidence,
    baseSeed: 1,
    seatOrder,
    policyIds: ['tempo', 'control'],
    profileId: 'core-advanced-authority',
    alternativeActionId: altAction?.actionId,
    continuationPolicyIds: ['tempo', 'control'],
    replay,
    checkpointIndex: 0,
    rolloutCount: 2,
    focalSeat: 1,
    ...overrides
  };
}

function probe(label, cfg) {
  let result;
  try {
    result = runPairedCounterfactual(cfg);
  } catch (error) {
    console.log(`${label}: THREW ${error.code ?? error.message}`);
    return;
  }
  const sel = result.selected;
  console.log(`${label}: selected.status=${sel.status} reason=${sel.reason ?? '(none)'} missingAuthority=${sel.missingAuthority ?? '(none)'}`);
}

console.log('--- Anchor Authority Probe (after resolver repair) ---');
console.log(`matchId=${MATCH_ID}`);
console.log(`authentic decisionId (retained trace)=${AUTHENTIC_DECISION_ID}`);
console.log(`authentic trace checkpointHash (16-char)=${authenticTrace.checkpointHash}`);
console.log(`restored full beforeStateHash=${beforeStateHash}`);
console.log(`beforeStateHash starts with trace checkpointHash? ${beforeStateHash.startsWith(authenticTrace.checkpointHash)}`);
console.log(`synthetic decisionId (old validator formula)=${syntheticDecisionId}`);
console.log(`authentic == synthetic? ${AUTHENTIC_DECISION_ID === syntheticDecisionId}`);
console.log(`derivedReplayCommandIndex=${derivedReplayCommandIndex}`);
console.log(`frameActorId=${frameActorId} frameSeat=${frameSeat}`);
console.log(`legalActionSetHash=${legalActionSetHash}`);
console.log(`selectedActionId=${authenticSelectedActionId}`);
console.log('');
console.log('Expected after repair: 1=COMPLETED; 2..5=NOT_SUPPORTED (DECISION_ID_MISMATCH / ACTOR_ID_MISMATCH / SEAT_MISMATCH)');
console.log('');

probe('1. AUTHENTIC retained decisionId', baseConfig({ decisionId: AUTHENTIC_DECISION_ID }));
probe('2. SYNTHETIC decisionId (old validator formula)', baseConfig({ decisionId: syntheticDecisionId }));
probe('3. AUTHENTIC + wrong actor', baseConfig({ decisionId: AUTHENTIC_DECISION_ID, actorId: 'WRONG' }));
probe('4. AUTHENTIC + wrong seat', baseConfig({ decisionId: AUTHENTIC_DECISION_ID, seat: 99 }));
probe('5. AUTHENTIC + wrong actor AND wrong seat', baseConfig({ decisionId: AUTHENTIC_DECISION_ID, actorId: 'WRONG', seat: 99 }));
probe('6. AUTHENTIC + truncated checkpointHash', baseConfig({ decisionId: AUTHENTIC_DECISION_ID, checkpointHash: beforeStateHash.slice(0, 16) }));
probe('7. AUTHENTIC + replay content hash as checkpoint', baseConfig({ decisionId: AUTHENTIC_DECISION_ID, checkpointHash: replay.contentHash }));
probe('8. NO retained evidence', { ...baseConfig({ decisionId: AUTHENTIC_DECISION_ID }), retainedDecisionEvidence: undefined });

