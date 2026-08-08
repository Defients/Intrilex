import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  authorityHashCanonical,
  authorityPrivateStateView,
  authorityPublicEventView,
  authorityPublicStateView,
  reconstructAuthorityCheckpoints,
  verifyAuthorityCertifiedReplay
} from '@intrilex/engine-adapter';
import { hashCanonical } from '@intrilex/shared';
import { loadReleaseIdentity } from '@intrilex/shared/release-identity';
import { createReplayScopedPublicProjector } from '@intrilex/engine-adapter/public-projection';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=path.join(root,'sample-data/autonomy');
const identity=await loadReleaseIdentity();
const retention=JSON.parse(await readFile(path.join(base,'retention-index.json'),'utf8'));
const out=path.join(base,'lab-replays'),publicDir=path.join(out,'public'),authorizedDir=path.join(out,'authorized');
const resume=process.argv.includes('--resume');

function sanitizePublic(value){if(Array.isArray(value))return value.map(sanitizePublic);if(!value||typeof value!=='object')return value;const out={};for(const [key,item] of Object.entries(value)){if(['instructions','replacementInstructions','command','commandHash','integrityHash','rng'].includes(key))continue;out[key]=sanitizePublic(item);}return out;}
const publicCommandSemantic=(command)=>{const semantic=command?.action?.semantic;if(semantic==='DECLINE_RESPONSE')return{type:'DECLINE_RESPONSE',semanticClass:'response-decline'};if(semantic==='AUTOMATIC_PRIORITY_ADVANCE')return{type:'AUTOMATIC_PRIORITY_ADVANCE',semanticClass:'engine-orchestration'};return{type:command.type,semanticClass:null};};

if(!resume)await rm(out,{recursive:true,force:true});await mkdir(publicDir,{recursive:true});await mkdir(authorizedDir,{recursive:true});
const records=[];
for(const retained of retention.records){
  const publicPath=path.join(publicDir,`${retained.matchId}.json`),authorizedPath=path.join(authorizedDir,`${retained.matchId}.json`);
  if(resume){
    const existingPublic=await readFile(publicPath,'utf8').then(JSON.parse).catch(()=>null);
    const existingAuthorized=await readFile(authorizedPath,'utf8').then(JSON.parse).catch(()=>null);
    if(existingPublic&&existingAuthorized){
      const source=retained.summary;
      records.push({fixtureId:retained.matchId,replayKind:'ADVANCED_CORE_RETAINED',retentionReasons:retained.reasons,commandCount:existingAuthorized.commands.length,eventCount:existingAuthorized.events.length,acceptedCount:existingAuthorized.accepted.filter(Boolean).length,viewerIds:existingAuthorized.viewers,publicArtifactHash:existingPublic.artifactHash,authorizedArtifactHash:existingAuthorized.artifactHash,certifiedReplayContentHash:existingAuthorized.provenance.certifiedReplayContentHash,finalStateHash:existingAuthorized.frames.at(-1)?.omniscientStateHash??null,hasDecisionTraces:retained.hasDecisionTraces??false,traceCount:retained.traceCount??0,summary:source});
      console.log(`REPLAY RESUME PASS: ${retained.matchId}`);
      continue;
    }
  }
  const replay=JSON.parse(await readFile(path.join(base,retained.authorizedReplay),'utf8'));
  const verified=verifyAuthorityCertifiedReplay(replay);
  const publicProjector=createReplayScopedPublicProjector(replay.initialState,replay.integrityHash);
  const frames=reconstructAuthorityCheckpoints(replay),viewers=replay.initialState.turnOrder;
  const commandSummaries=replay.commands.map((command,index)=>{const semantic=publicCommandSemantic(command);return({commandIndex:index,id:command.id,type:semantic.type,semanticClass:semantic.semanticClass,actorId:command.actorId,accepted:replay.accepted[index],eventStartIndex:replay.checkpoints[index]?.eventStartIndex??null,eventEndIndex:replay.checkpoints[index]?.eventEndIndex??null});});
  const publicCore={schemaVersion:'4.0.0',fixtureId:replay.fixtureId,replayKind:'ADVANCED_CORE_RETAINED',retentionReasons:retained.reasons,provenance:{kind:'LAB_PUBLIC_ADVANCED_CORE_CHECKPOINT_PROJECTION',certifiedReplayContentHash:replay.contentHash,engineVersion:replay.engineVersion,rulesVersion:identity.rulesVersion,experimentHash:retention.experimentHash},viewers,commands:commandSummaries,events:replay.events.map((event)=>sanitizePublic(publicProjector.project(authorityPublicEventView(event)))),frames:frames.map((frame)=>{const projected=sanitizePublic(publicProjector.project(authorityPublicStateView(frame.state)));return{commandIndex:frame.commandIndex,accepted:frame.accepted,state:projected,publicStateHash:hashCanonical(projected),eventTypes:frame.events.map((event)=>event.type),errorCode:frame.error?.code??null};})};
  const authorizedCore={schemaVersion:'4.0.0',fixtureId:replay.fixtureId,replayKind:'ADVANCED_CORE_RETAINED',retentionReasons:retained.reasons,provenance:{kind:'LAB_AUTHORIZED_ADVANCED_CORE_CHECKPOINT_RECONSTRUCTION',certifiedReplayContentHash:replay.contentHash,engineVersion:replay.engineVersion,rulesVersion:identity.rulesVersion,experimentHash:retention.experimentHash},viewers,commands:replay.commands,accepted:replay.accepted,events:replay.events,frames:frames.map((frame)=>({commandIndex:frame.commandIndex,accepted:frame.accepted,omniscientState:frame.state,omniscientStateHash:authorityHashCanonical(frame.state),playerViews:Object.fromEntries(viewers.map((viewer)=>[viewer,authorityPrivateStateView(frame.state,viewer)])),events:frame.events,error:frame.error}))};
  const publicArtifact={...publicCore,artifactHash:hashCanonical(publicCore)},authorizedArtifact={...authorizedCore,artifactHash:hashCanonical(authorizedCore)};
  await writeFile(publicPath,JSON.stringify(publicArtifact)+'\n');await writeFile(authorizedPath,JSON.stringify(authorizedArtifact)+'\n');
  records.push({fixtureId:replay.fixtureId,replayKind:'ADVANCED_CORE_RETAINED',retentionReasons:retained.reasons,commandCount:replay.commands.length,eventCount:replay.events.length,acceptedCount:replay.accepted.filter(Boolean).length,viewerIds:viewers,publicArtifactHash:publicArtifact.artifactHash,authorizedArtifactHash:authorizedArtifact.artifactHash,certifiedReplayContentHash:replay.contentHash,finalStateHash:authorityHashCanonical(verified.state),hasDecisionTraces:retained.hasDecisionTraces??false,traceCount:retained.traceCount??0,summary:retained.summary});
}
const core={schemaVersion:'4.0.0',experimentHash:retention.experimentHash,replayCount:records.length,records};await writeFile(path.join(base,'lab-replay-index.json'),JSON.stringify({...core,indexHash:hashCanonical(core)},null,2)+'\n');console.log(`ADVANCED CORE REPLAY ARTIFACTS PASS: ${records.length}`);
