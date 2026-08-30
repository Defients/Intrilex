import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregateReplayRecords } from '@intrilex/analytics';
import {
  authorityHashCanonical,
  authorityPrivateStateView,
  authorityPublicStateView,
  hashCanonical,
  reconstructAuthorityCheckpoints,
  verifyAuthorityCertifiedReplay
} from '@intrilex/engine-adapter';
import { createReplayScopedPublicProjector } from '@intrilex/engine-adapter/public-projection';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const replayDir = path.join(root, 'upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix/replays');
const output = path.join(root, 'sample-data');
const publicDir = path.join(output, 'replays/public');
const authorizedDir = path.join(output, 'replays/authorized');

async function writeFileWithRetry(filePath, data, retries = 5) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      await writeFile(filePath, data);
      return;
    } catch (error) {
      const retryable = ['UNKNOWN', 'EPERM', 'EBUSY'].includes(error?.code);
      if (!retryable || attempt === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
}

function sanitizePublic(value){
  if(Array.isArray(value))return value.map(sanitizePublic);
  if(!value||typeof value!=='object')return value;
  const out={};for(const [key,item] of Object.entries(value)){if(['instructions','replacementInstructions','command','commandHash','integrityHash','rng'].includes(key))continue;out[key]=sanitizePublic(item);}return out;
}
const publicEventType=(type)=>type==='PRIORITY_PASSED'?'LEGACY_PRIORITY_TRANSITION':type==='PRIORITY_CLOSED'?'RESPONSE_WINDOW_CLOSED':type;
const publicCommandType=(command)=>command.type==='PASS_PRIORITY'?'LEGACY_PRIORITY_TRANSITION':command.type;

await rm(path.join(output, 'replays'), { recursive: true, force: true });
await mkdir(publicDir, { recursive: true });
await mkdir(authorizedDir, { recursive: true });

const files = (await readdir(replayDir)).filter((name) => name.endsWith('.certified.replay.json') && !name.includes('.public.certified.')).sort();
const records = [], index = [];
for (const name of files) {
  const replay = JSON.parse(await readFile(path.join(replayDir, name), 'utf8'));
  const verified = verifyAuthorityCertifiedReplay(replay);
  const frames = reconstructAuthorityCheckpoints(replay);
  const publicProjector = createReplayScopedPublicProjector(replay.initialState, replay.integrityHash);
  const viewers = replay.initialState.turnOrder;
  const publicFrames = frames.map((frame) => {
    const projected = sanitizePublic(publicProjector.project(authorityPublicStateView(frame.state)));
    return { commandIndex: frame.commandIndex, accepted: frame.accepted ?? null, state: projected, publicStateHash: hashCanonical(projected), eventTypes: frame.events.map((event) => publicEventType(event.type)), errorCode: frame.error?.code ?? null };
  });
  const authorizedFrames = frames.map((frame) => ({ commandIndex: frame.commandIndex, accepted: frame.accepted ?? null, omniscientState: frame.state, omniscientStateHash: authorityHashCanonical(frame.state), playerViews: Object.fromEntries(viewers.map((viewer) => [viewer, authorityPrivateStateView(frame.state, viewer)])), events: frame.events, error: frame.error }));
  const commandSummaries = replay.commands.map((command, commandIndex) => ({ commandIndex, id: command.id, type: publicCommandType(command), semanticClass:command.type==='PASS_PRIORITY'?'engine-orchestration':null, actorId: command.actorId, accepted: replay.accepted[commandIndex], eventStartIndex: replay.checkpoints[commandIndex]?.eventStartIndex ?? null, eventEndIndex: replay.checkpoints[commandIndex]?.eventEndIndex ?? null }));
  const publicCore = { schemaVersion:'4.0.0', fixtureId:replay.fixtureId, replayKind:'GOVERNING_CONFORMANCE_V4_1_2', provenance:{kind:'LAB_PUBLIC_CHECKPOINT_PROJECTION',certifiedReplayContentHash:replay.contentHash,engineVersion:replay.engineVersion,rulesVersion:'4.1.2'}, viewers, commands:commandSummaries, events:replay.events.map((event)=>({type:publicEventType(event.type),visibility:event.visibility,sequence:event.sequence})), frames:publicFrames };
  const authorizedCore = { schemaVersion:'4.0.0', fixtureId:replay.fixtureId, replayKind:'GOVERNING_CONFORMANCE_V4_1_2', provenance:{kind:'LAB_AUTHORIZED_CHECKPOINT_RECONSTRUCTION',certifiedReplayContentHash:replay.contentHash,engineVersion:replay.engineVersion,rulesVersion:'4.1.2'}, viewers, commands:replay.commands, accepted:replay.accepted, events:replay.events, frames:authorizedFrames };
  const publicArtifact={...publicCore,artifactHash:hashCanonical(publicCore)}, authorizedArtifact={...authorizedCore,artifactHash:hashCanonical(authorizedCore)};
  await writeFileWithRetry(path.join(publicDir,`${replay.fixtureId}.json`),JSON.stringify(publicArtifact)+'\n');
  await writeFileWithRetry(path.join(authorizedDir,`${replay.fixtureId}.json`),JSON.stringify(authorizedArtifact)+'\n');
  index.push({ fixtureId:replay.fixtureId, replayKind:'GOVERNING_CONFORMANCE_V4_1_2', commandCount:replay.commands.length, eventCount:replay.events.length, acceptedCount:replay.accepted.filter(Boolean).length, rejectedCount:replay.accepted.filter((x)=>!x).length, viewerIds:viewers, publicArtifactHash:publicArtifact.artifactHash, authorizedArtifactHash:authorizedArtifact.artifactHash, certifiedReplayContentHash:replay.contentHash, finalStateHash:authorityHashCanonical(verified.state) });
  records.push(replay);
}
const analytics=aggregateReplayRecords(records);
// Merge autonomy replay records into the combined replay index
let autonomyRecords = [];
try {
  const autonomyIndex = JSON.parse(await readFile(path.join(output, 'autonomy/lab-replay-index.json'), 'utf8'));
  autonomyRecords = autonomyIndex.records ?? [];
} catch { /* autonomy index may not exist yet */ }
const allRecords = [...index, ...autonomyRecords];
const indexCore={schemaVersion:'4.0.0',rulesVersion:'4.1.2',replayCount:allRecords.length,records:allRecords};
await writeFileWithRetry(path.join(output,'replay-index.json'),JSON.stringify({...indexCore,indexHash:hashCanonical(indexCore)},null,2)+'\n');
await writeFileWithRetry(path.join(output,'corpus-analytics.json'),JSON.stringify(analytics,null,2)+'\n');
await writeFileWithRetry(path.join(output,'README.md'),`# Sample data\n\nGenerated from ${index.length} governing v4.1.2 certified replay envelopes plus Advanced Core campaign evidence.\n`);
console.log(`DATA PASS: verified=${index.length}; aggregate=${analytics.aggregateHash}`);

