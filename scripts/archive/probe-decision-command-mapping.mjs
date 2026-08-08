// Find the replay command index that maps to the authentic selected action.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  reconstructAuthorityCheckpoints,
  createSimulationDecisionFrame,
  authorityHashCanonical
} from '@intrilex/engine-adapter';
import {} from '@intrilex/shared';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

const MATCH_ID = 'M-161726cc9a3a57e46f9c';
const AUTHENTIC_DECISION_ID = 'DT-05f2e10a588e1be6';
const traceFile = JSON.parse(read(`sample-data/autonomy/decision-traces/${MATCH_ID}.json`));
const retainedTrace = traceFile.traces.find((t) => t.decisionId === AUTHENTIC_DECISION_ID);
const replay = JSON.parse(read(`sample-data/autonomy/replays/authorized/${MATCH_ID}.authorized.replay.json`));

const frames = reconstructAuthorityCheckpoints(replay);
const decisionFrame = createSimulationDecisionFrame(frames[0].state);
const selectedActionId = retainedTrace.selectedActionId;
const selectedCommand = decisionFrame.resolve(selectedActionId);
const selectedCommandHash = authorityHashCanonical(selectedCommand);
const beforeStateHash = authorityHashCanonical(decisionFrame.state);


console.log('selectedActionId:', selectedActionId);
console.log('selectedCommand:', JSON.stringify(selectedCommand));
console.log('selectedCommandHash:', selectedCommandHash);
console.log('beforeStateHash:', beforeStateHash);
console.log('frameActorId (from command):', selectedCommand.actorId);
console.log('frame status:', decisionFrame.status);
console.log('legal actions:', decisionFrame.policyActions.map(a => a.actionId));
console.log('');

// Find replay command indices whose hash equals selectedCommandHash.
const matches = [];
for (const [i, cmd] of replay.commands.entries()) {
  const h = authorityHashCanonical(cmd);
  if (h === selectedCommandHash) matches.push(i);
}
console.log('replay command indices matching selectedCommandHash:', matches);
console.log('total replay commands:', replay.commands.length);
console.log('');

// Also: which checkpoint frame corresponds to the decision? Walk frames and find
// where the decision frame matches (status PLAYER_DECISION_REQUIRED and same legal set).
let decisionFrameIndices = [];
for (let i = 0; i < frames.length; i++) {
  try {
    const df = createSimulationDecisionFrame(frames[i].state);
    if (df.status === 'PLAYER_DECISION_REQUIRED' && df.policyActions?.length) {
      const lh = authorityHashCanonical(df.policyActions.map(a => a.actionId).sort());
      if (lh === authorityHashCanonical(decisionFrame.policyActions.map(a => a.actionId).sort())) {
        decisionFrameIndices.push(i);
      }
    }
  } catch {}
}
console.log('frames whose decision frame matches the initial decision (same legal set):', decisionFrameIndices);
