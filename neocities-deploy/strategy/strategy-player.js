import { createStrategyCapture, strategyDigest, sealStrategy, STRATEGY_CONTRACTS } from '../evolution/strategy-contracts.mjs?v=ad40772959f0';

/** Observation is subordinate to gameplay. Capture failure is disclosed, never a game fault. */
export async function captureLocalDecision(session,actorId,legalActions,selectedActionId,decisionOrdinal){
  try {
    const auto=await import('../autonomy-runtime.js?v=ad40772959f0');
    if(!session._strategyCapture){
      const {LAB_IDENTITY}=await import('../evolution/identity.mjs?v=ad40772959f0');
      const agent=session._agent;
      session._strategyCapture=createStrategyCapture(['P1','P2'].map(actor=>({runId:session.sessionId,gameOrdinal:0,masterSeed:session.setup.seed,derivedSeed:session.setup.seed>>>0||1,
        rulesProfile:session.setup.profileId,fingerprint:LAB_IDENTITY.fingerprint,eraId:LAB_IDENTITY.fingerprint,purpose:'NORMAL_PLAY',
        policyId:actor===session.setup.humanPlayerId?'human':session.setup.aiPolicyId,policyVersion:actor===session.setup.humanPlayerId?'HUMAN_V1':'NORMAL_PLAY_CONSUMER_V1',
        checkpointId:actor===session.setup.humanPlayerId?null:agent?.checkpointId??null,opponentPolicyId:actor===session.setup.humanPlayerId?session.setup.aiPolicyId:'human',
        opponentCheckpointId:actor===session.setup.humanPlayerId?agent?.checkpointId??null:null,agentProfileId:actor===session.setup.humanPlayerId?null:agent?.profile?.agentProfileId??null,
        profileHead:actor===session.setup.humanPlayerId?null:agent?.profile?.headVersion??null})));
    }
    return session._strategyCapture.before({actorId,seat:actorId==='P1'?1:2,decisionOrdinal,authorizedView:auto.strictView(session.state,actorId),legalActions,selectedActionId,
      replayAnchor:{commandIndex:session.commandLog.length,stateHash:strategyDigest(session.state)}});
  }catch(error){session._strategyCaptureError=error.message;return null;}
}
export async function captureLocalOutcome(session,draft){
  if(!draft)return;
  try{const auto=await import('../autonomy-runtime.js?v=ad40772959f0');session._strategyCapture.after(draft,auto.strictView(session.state,draft.actorId));}
  catch(error){session._strategyCaptureError=error.message;}
}
export function finishLocalStrategy(session,certifiedReplay){
  if(!session._strategyCapture)return {strategyFidelity:'SUMMARY_ONLY',strategyCaptureError:session._strategyCaptureError??'No decision-time capture available.'};
  try{
    const scores=Object.fromEntries(['P1','P2'].map(id=>[id,session.state.players[id].securedPoints]));
    // Authority-derived points come from the already loaded autonomy view.
    const events=session._strategyCapture.finish({initialState:certifiedReplay.initialState,commands:certifiedReplay.commands,finalStateHash:strategyDigest(session.state),
      winner:session.winner??'DRAW',terminationReason:session.terminalReason,finalScores:session._strategyTerminalScores??scores,gameLength:Math.max(0,(session.state.fullTurnSequence??1)-1)});
    const full=events.length===session.decisionJournal.length&&!session._strategyCaptureError;
    return {strategyDecisions:events,strategyFidelity:full?'FULL_DECISION_EVIDENCE':'PARTIAL_OBSERVATIONAL_EVIDENCE',strategyCaptureError:session._strategyCaptureError??null,strategyTelemetryDigest:strategyDigest(events)};
  }catch(error){return {strategyFidelity:'SUMMARY_ONLY',strategyCaptureError:error.message};}
}
export async function ingestLocalPlayerEvidence(store){
  const {listReplays}=await import('../play/persistence.js?v=ad40772959f0'),records=await listReplays();
  for(const record of records){
    const events=record.strategyDecisions??[],first=events[0];
    if(events.length && strategyDigest(events)!==record.strategyTelemetryDigest)throw new Error('STRATEGY_PLAYER_DIGEST_MISMATCH');
    // Older and network replays keep summary fidelity; never infer missing decision contexts.
    if(!first){
      // Legacy/network records have no attested decision-runtime fingerprint.
      // Keep that absence explicit instead of attaching today's implementation.
      const evidence=sealStrategy(STRATEGY_CONTRACTS.evidence,{source:{runId:record.sessionId,ordinal:0,resultHash:record.contentHash??record.certifiedReplayHash??record.replayId,
        fingerprint:'UNAVAILABLE',rulesProfile:record.profileId??'UNAVAILABLE',eraId:'UNATTESTED_REPLAY_SUMMARY',purpose:'NORMAL_PLAY',origin:record.isNetworkMatch?'LOCAL_NETWORK_SUMMARY':'LOCAL_LEGACY_SUMMARY',createdAt:record.completedAt??''},
        fidelity:'SUMMARY_ONLY',clean:false,events:[],aggregates:[],replayHash:null,checkpoints:[],identity:{fingerprint:'UNAVAILABLE'},
        summary:{winner:record.winner??null,terminationReason:record.terminationReason??null,decisions:record.decisionCount??null,replayId:record.replayId,admissibility:'No decision-time capture or attested runtime fingerprint. Summary only.'}});
      await store.addEvidence(evidence);continue;
    }
    const replay=record.certifiedReplay;
    const replayHash=strategyDigest({initialState:replay.initialState,commands:replay.commands});
    if(events.some(e=>e.replayAnchor.initialStateHash!==strategyDigest(replay.initialState)||e.replayAnchor.actionSequenceHash!==strategyDigest(replay.commands)))throw new Error('STRATEGY_PLAYER_REPLAY_MISMATCH');
    const evidence=sealStrategy(STRATEGY_CONTRACTS.evidence,{source:{runId:record.sessionId,ordinal:0,resultHash:record.contentHash,fingerprint:first.identity.fingerprint,rulesProfile:record.profileId,
      eraId:first.identity.eraId,purpose:'NORMAL_PLAY',origin:record.isNetworkMatch?'IMPORTED_UNVERIFIED':'LOCAL_PLAYER',createdAt:record.completedAt},fidelity:record.strategyFidelity,
      clean:events.every(e=>e.outcomes.clean),events,aggregates:[],replayHash,checkpoints:[],identity:{fingerprint:first.identity.fingerprint},
      summary:{winner:record.winner,terminationReason:record.terminationReason,decisions:record.decisionCount,captureError:record.strategyCaptureError??null}});
    await store.addEvidence(evidence,replay);
  }
}
