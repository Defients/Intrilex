// Isomorphic, authorized-data-only instrumentation. No engine state, RNG,
// hidden card identities, outcome or later frame is accepted by decision capture.
export const CONTROL_FAMILIES = Object.freeze(['scuttle','effect-three','effect-four','effect-ace','attachment','anchor','anchor-private-choice','effect-private-choice','effect-board-lock','effect-red-joker','instant','quick','counter','disrupt','interrupt']);
const control = new Set(CONTROL_FAMILIES);
const scoring = a => ['score','play-for-points'].includes(a.family);
const finite = n => Number.isFinite(n) ? n : null;
const add = (object,key,n=1) => { object[key]=(object[key]??0)+n; };

export function decisionObservation({actorId,seat,decisionIndex,authorizedView,legalActions,selected,policyScores}) {
  const own=authorizedView.own, enemy=authorizedView.opponents?.[0];
  const values=legalActions.filter(scoring).map(a=>finite(a.featureVector?.immediateScore??a.featureVector?.immediatePoints)).filter(v=>v!==null);
  const scoreAvailable=legalActions.some(scoring), scoreValue=values.length?Math.max(...values):null;
  const enemyGap=enemy&&Number.isFinite(enemy.goal)&&Number.isFinite(enemy.securedPoints)?enemy.goal-enemy.securedPoints:null;
  return {schemaVersion:1,decisionOrdinal:decisionIndex,fullTurn:finite(authorizedView.fullTurnSequence),
    miniTurnsRemaining:finite(own.limits?.miniTurnsRemaining),actorId,seat,phase:authorizedView.phase??null,
    legalFamilies:[...new Set(legalActions.map(a=>a.family))].sort(),legalActionCount:legalActions.length,
    selectedFamily:selected.family,selectedActionId:selected.actionId,
    ownScore:finite(own.securedPoints),opponentScore:finite(enemy?.securedPoints),
    scoreDifferential:Number.isFinite(own.securedPoints)&&Number.isFinite(enemy?.securedPoints)?own.securedPoints-enemy.securedPoints:null,
    ownHandCount:own.hand?.length??null,opponentHandCount:enemy?.handCount??null,
    ownBoardCards:(own.pr&&own.er)?own.pr.length+own.er.length:null,
    opponentBoardCards:(enemy?.pr&&enemy?.er)?enemy.pr.length+enemy.er.length:null,
    scoreAvailable,availableScoreValue:scoreValue,scoreDeclined:scoreAvailable&&!scoring(selected),
    opponentGoalGap:enemyGap,opponentThreat:enemyGap===null?null:enemyGap<=11&&(enemy.handCount??0)>0,
    ownGoalGap:Number.isFinite(own.goal)&&Number.isFinite(own.securedPoints)?own.goal-own.securedPoints:null,
    ...(policyScores?{policyScores:policyScores.map(({actionId,score})=>({actionId,score}))}:{}),
  };
}

export function createStrategicTracker({deep=false,horizon=3}={}) {
  const seats=[0,1].map(()=>({schemaVersion:1,decisions:0,scoreOpportunities:0,scoreTaken:0,scoreDeclined:0,
    declinedValueCount:0,declinedValueSum:0,deferredConversions:0,conversionDelaySum:0,
    unconvertedAtTerminal:0,horizonObserved:0,horizonCensored:0,horizonSwingSum:0,
    immediateScoreDeltaSum:0,controlActions:0,controlByPosition:{ahead:0,tied:0,behind:0},
    chainLengths:{},declinedByFamily:{},followupByFamily:{},scoreByThreat:{},scoreByPhase:{},resourceRetentionSum:0,resourceRetentionCount:0}));
  const pending=[[],[]],chains=[0,0],traces=[],previous=[null,null];
  const finishChain=i=>{if(chains[i])add(seats[i].chainLengths,chains[i]);chains[i]=0;};
  function observe(scores,ordinal) {
    for(let i=0;i<2;i++) {
      const own=scores[i],other=scores[1-i];if(!Number.isFinite(own)||!Number.isFinite(other))continue;
      const positive=previous[i]!==null&&own>previous[i];
      for(const p of pending[i]) {
        if(!p.converted&&positive){p.converted=true;seats[i].deferredConversions++;seats[i].conversionDelaySum+=ordinal-p.ordinal;add(seats[i].followupByFamily,p.family);}
        if(!p.horizonDone&&ordinal-p.ordinal>=horizon){p.horizonDone=true;seats[i].horizonObserved++;seats[i].horizonSwingSum+=(own-other)-p.margin;}
      }
      pending[i]=pending[i].filter(p=>!p.converted||!p.horizonDone);previous[i]=own;
    }
  }
  return {
    observe,
    capture(observation,afterScores) {
      const i=observation.seat-1,s=seats[i];s.decisions++;
      const {scoreAvailable,scoreDeclined,availableScoreValue,selectedFamily,scoreDifferential}=observation;
      if(scoreAvailable){s.scoreOpportunities++;if(scoreDeclined){s.scoreDeclined++;add(s.declinedByFamily,selectedFamily);
        if(availableScoreValue!==null){s.declinedValueCount++;s.declinedValueSum+=availableScoreValue;}
        if(scoreDifferential!==null)pending[i].push({ordinal:observation.decisionOrdinal,margin:scoreDifferential,family:selectedFamily,converted:false,horizonDone:false});
      }else s.scoreTaken++;
        for(const [map,key] of [[s.scoreByThreat,String(observation.opponentThreat)],[s.scoreByPhase,observation.phase??'UNAVAILABLE']]){map[key]??={observed:0,taken:0};map[key].observed++;if(!scoreDeclined)map[key].taken++;}
      }
      if(control.has(selectedFamily)){s.controlActions++;chains[i]++;if(scoreDifferential!==null)s.controlByPosition[scoreDifferential>0?'ahead':scoreDifferential<0?'behind':'tied']++;}
      else if(!['phase','response-decline','private-choice'].includes(selectedFamily))finishChain(i);
      if(observation.ownHandCount!==null){s.resourceRetentionSum+=observation.ownHandCount;s.resourceRetentionCount++;}
      const after=afterScores?.[i],delta=Number.isFinite(after)&&observation.ownScore!==null?after-observation.ownScore:null;
      if(delta!==null)s.immediateScoreDeltaSum+=delta;
      if(deep)traces.push({...observation,immediateOwnScoreDelta:delta,immediateOpponentScoreDelta:Number.isFinite(afterScores?.[1-i])&&observation.opponentScore!==null?afterScores[1-i]-observation.opponentScore:null});
    },
    finish(scores,ordinal) {
      observe(scores,ordinal);
      for(let i=0;i<2;i++){finishChain(i);seats[i].unconvertedAtTerminal=pending[i].filter(p=>!p.converted).length;seats[i].horizonCensored=pending[i].filter(p=>!p.horizonDone).length;}
      return {schemaVersion:1,horizonDecisions:horizon,seats,...(deep?{traces}:{}),interpretation:'Observed follow-up association. Positive public score changes are not attributed causally to the preceding declaration. Terminal windows shorter than the horizon are censored.'};
    },
  };
}

/** Attach only terminal public facts, including counts supplied by rule authority. */
export function publicTerminalAnchorCounts(state,seatOrder) {
  // Mirror the inspected phase8 anchor predicate for diagnosis only. Exclude
  // face-down traps before reading rank; no concealed identity is returned.
  return seatOrder.map(playerId=>(state.players[playerId].er??[]).filter(id=>{
    const card=state.cards[id];if(!card||card.controllerId!==playerId||card.state?.tapped===true||card.state?.faceDownTrap===true)return false;
    return /^(A|9|Q|K)[♣♦♥♠]$/u.test(card.identity)||card.state?.anchor===true;
  }).length);
}
export function terminalEvidence(events,goals,anchorCounts) {
  const event=[...events].reverse().find(e=>['CORE_NORMAL_VICTORY','CORE_SUDDEN_DEATH_RESOLVED','CORE_EXHAUSTED_RESOLVED'].includes(e.type));
  return event?{schemaVersion:1,eventType:event.type,payload:structuredClone(event.payload??{}),goals:[...goals],...(anchorCounts?{activeAnchorCounts:[...anchorCounts]}:{})}:null;
}

export function winnerScoreDiagnostic(record) {
  const a=record.swapped?record.scoreP2:record.scoreP1,b=record.swapped?record.scoreP1:record.scoreP2;
  const hasWinner=['P1','P2'].includes(record.winner),valid=Number.isFinite(a)&&Number.isFinite(b);
  const winnerScore=record.winner==='P1'?record.scoreP1:record.scoreP2,otherScore=record.winner==='P1'?record.scoreP2:record.scoreP1;
  const relation=!hasWinner||!valid?'NOT_APPLICABLE':winnerScore>otherScore?'HIGHER_SCORE':winnerScore<otherScore?'LOWER_SCORE':'EQUAL_SCORE';
  const terminal=record.terminalEvidence, event=terminal?.eventType;
  let semantics='UNVERIFIED_TERMINAL_RULE',expected=null;
  if(event==='CORE_NORMAL_VICTORY') {
    semantics='OWN_GOAL_VICTORY';const goal=terminal.goals?.[record.winner==='P1'?0:1];
    if(hasWinner&&Number.isFinite(goal))expected=winnerScore>=goal && terminal.payload?.playerId===record.winner;
  }else if(event==='CORE_SUDDEN_DEATH_RESOLVED'){semantics='SUDDEN_DEATH_ACTIVATOR';expected=terminal.payload?.winner===record.winner;}
  else if(event==='CORE_EXHAUSTED_RESOLVED'){
    semantics='ANCHORS_THEN_POINTS';expected=record.winner==='DRAW'?terminal.payload?.draw===true:terminal.payload?.winner===record.winner;
    const anchors=terminal.activeAnchorCounts;
    if(anchors?.length===2&&anchors.every(Number.isFinite)&&valid){const compare=anchors[0]-anchors[1]||record.scoreP1-record.scoreP2,predicted=compare>0?'P1':compare<0?'P2':'DRAW';expected=expected&&predicted===record.winner;}
  }
  else if(record.terminationReason==='EXHAUSTED_RESOLUTION')semantics='ANCHORS_THEN_POINTS_UNVERIFIED';
  else if(record.terminationReason==='CANONICAL_DRAW')semantics='CANONICAL_DRAW';
  return {ordinal:record.ordinal,seed:record.seed,seat:record.swapped?'BA':'AB',winner:record.winner,
    outcome:record.winner==='DRAW'?'Draw':hasWinner?((record.winner==='P1')!==record.swapped?'A':'B'):'Fault',
    scoreA:valid?a:null,scoreB:valid?b:null,margin:valid?a-b:null,terminationReason:record.terminationReason,
    winnerScoreRelation:relation,semantics,consistentWithRecordedTerminalEvidence:expected,
    status:expected===false?'UNEXPECTED':expected===true?'EXPLAINED':'UNVERIFIED',terminalEvidence:terminal??null};
}

export function validateStrategicTelemetry(data,decisionCount) {
  if(data?.schemaVersion!==1||data.horizonDecisions!==3||data.seats?.length!==2)throw new Error('INVALID_STRATEGIC_TELEMETRY');
  const counts=['decisions','scoreOpportunities','scoreTaken','scoreDeclined','declinedValueCount','deferredConversions','conversionDelaySum','unconvertedAtTerminal','horizonObserved','horizonCensored','controlActions','resourceRetentionCount'];
  for(const s of data.seats){if(s.schemaVersion!==1||counts.some(k=>!Number.isInteger(s[k])||s[k]<0)||['declinedValueSum','horizonSwingSum','immediateScoreDeltaSum','resourceRetentionSum'].some(k=>!Number.isFinite(s[k])))throw new Error('INVALID_STRATEGIC_COUNTER');
    if(s.scoreTaken+s.scoreDeclined!==s.scoreOpportunities||s.deferredConversions+s.unconvertedAtTerminal!==s.scoreDeclined||s.horizonObserved+s.horizonCensored!==s.scoreDeclined||s.scoreOpportunities>s.decisions||s.declinedValueCount>s.scoreDeclined)throw new Error('STRATEGIC_ACCOUNTING_MISMATCH');
  }
  if(data.seats.reduce((n,s)=>n+s.decisions,0)!==decisionCount)throw new Error('STRATEGIC_DECISION_COUNT_MISMATCH');
  if(data.traces!==undefined){if(!Array.isArray(data.traces)||data.traces.length!==decisionCount)throw new Error('INVALID_STRATEGIC_TRACE');
    const keys=new Set(['schemaVersion','decisionOrdinal','fullTurn','miniTurnsRemaining','actorId','seat','phase','legalFamilies','legalActionCount','selectedFamily','selectedActionId','ownScore','opponentScore','scoreDifferential','ownHandCount','opponentHandCount','ownBoardCards','opponentBoardCards','scoreAvailable','availableScoreValue','scoreDeclined','opponentGoalGap','opponentThreat','ownGoalGap','policyScores','immediateOwnScoreDelta','immediateOpponentScoreDelta']);
    data.traces.forEach((t,i)=>{if(Object.keys(t).some(k=>!keys.has(k))||t.decisionOrdinal!==i||![1,2].includes(t.seat)||!Array.isArray(t.legalFamilies)||!t.legalFamilies.includes(t.selectedFamily)||!Number.isInteger(t.legalActionCount)||t.legalActionCount<1)throw new Error('INVALID_AUTHORIZED_TRACE');});
  }
  return data;
}
