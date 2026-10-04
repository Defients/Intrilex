import { MATURITY_BUCKETS, STRATEGY_CONTRACTS, STRATEGY_NAMES, sealStrategy, verifyStrategy, strategyFail } from './strategy-contracts.mjs';

export const STRATEGY_CONFIDENCE = Object.freeze({ INSUFFICIENT:'Missing or inadmissible evidence; no advice.', EXPERIMENTAL:'Descriptive/observational pattern, or one research-only branched state. No strategic strength conclusion.',
  SUGGESTIVE:'Player-actionable controlled study with uncertainty excluding zero and at least two independent state/seed blocks.',
  STRONG:'Predetermined replication, compatible era/rules, uncertainty excluding zero, consistency across at least two packs, policies and matchups.',
  ESTABLISHED:'Independent held-out replication of a strong result; no unresolved sensitivity reversal or faults.' });
export function confidenceFor(e) {
  if(!e.opportunities || e.incompatible || e.nonClean || e.stale || e.origin==='IMPORTED_UNVERIFIED')return 'INSUFFICIENT';
  if(['DESCRIPTIVE','ASSOCIATIONAL'].includes(e.level) || e.informationScope==='RESEARCH_ONLY')return 'EXPERIMENTAL';
  if(!e.fixedBudget || !Number.isSafeInteger(e.independentStates) || e.independentStates<2 || !e.interval || e.interval.length!==2 || e.interval.some(v=>!Number.isFinite(v)) || e.interval[0]>e.interval[1] || e.interval[0]<=0 && e.interval[1]>=0 || !Number.isFinite(e.effectMagnitude) || !Number.isFinite(e.minimumMeaningfulEffect) || e.minimumMeaningfulEffect<0 || Math.abs(e.effectMagnitude)<e.minimumMeaningfulEffect)return 'EXPERIMENTAL';
  if(e.replicated && e.packs>=2 && e.matchups>=2 && e.policies>=2 && e.consistency===true && e.reversals===false) return e.heldOutReplicated ? 'ESTABLISHED' : 'STRONG';
  return 'SUGGESTIVE';
}
export function strategyEventMatches(e,f={}) {
  const i=e.identity,c=e.context;
  for(const [field,value] of Object.entries(f)) {
    if(value===null || value==='' || value===undefined)continue;
    if(field==='maturity' && e.maturity.bucket!==value)return false;
    if(['policyId','opponentPolicyId','checkpointId','agentProfileId','profileHead','rulesProfile','fingerprint','eraId','purpose'].includes(field) && String(i[field])!==String(value))return false;
    if(field==='seat' && e.seat!==Number(value))return false;
    if(field==='position' && (c.scoreDifferential===null || (value==='behind' ? !(c.scoreDifferential<0) : value==='ahead' ? !(c.scoreDifferential>0) : c.scoreDifferential!==0)))return false;
    const bounds={minDeficit:c.scoreDifferential===null?null:-c.scoreDifferential,minLead:c.scoreDifferential,minOwnHand:c.ownHandSize,minOpponentHand:c.opponentHandCount,minBoard:c.boardOccupancy,maxOwnGoalDistance:c.ownGoalDistance,maxOpponentGoalDistance:c.opponentGoalDistance};
    if(field in bounds && (bounds[field]===null || (field.startsWith('max') ? bounds[field]>Number(value) : bounds[field]<Number(value))))return false;
  }
  return true;
}
function emptyCell() { return {decisions:0,opportunities:0,selected:0,skipped:0,winSum:0,winCount:0,skipWinSum:0,skipWinCount:0,immediateScoreSum:0,horizonSum:0,horizonCount:0,subsequentSelected:0,subsequentDelaySum:0}; }
export function createStrategyAggregate({fingerprint,rulesProfile,eraId,subject,filters={},historical=false}) {
  const cells=Object.fromEntries(MATURITY_BUCKETS.map(b=>[b,emptyCell()])),total=emptyCell();
  const provenance=new Set(),states=new Set(),seeds=new Set(),policies=new Set(),checkpoints=new Set(),matchups=new Set(),origins=new Set(),games=new Set();
  let nonClean=0,excluded=0;
  return {
    add(row) {
      const e=row.event??row;
      if(e.identity.fingerprint!==fingerprint || e.identity.rulesProfile!==rulesProfile || e.identity.eraId!==eraId)strategyFail('STRATEGY_CROSS_ERA_REJECTED');
      if(!strategyEventMatches(e,filters)){excluded++;return;}
      const available=e.candidates.some(a=>a.subjects.includes(subject));
      if(!e.outcomes.clean){if(available)nonClean++;return;}
      const selected=e.candidates.find(a=>a.actionId===e.selectedActionId)?.subjects.includes(subject)??false;
      const win=e.outcomes.terminalWinner==='DRAW'?0.5:e.outcomes.terminalWinner===e.actorId?1:0;
      for(const c of [total,cells[e.maturity.bucket]]) {
        c.decisions++;
        if(!available)continue;
        c.opportunities++;if(selected){c.selected++;c.winSum+=win;c.winCount++;c.immediateScoreSum+=e.outcomes.immediateScoreDelta;
          if(!e.outcomes.horizonCensored && e.outcomes.horizonScoreDifferentialDelta!==null){c.horizonSum+=e.outcomes.horizonScoreDifferentialDelta;c.horizonCount++;}}
        else {c.skipped++;c.skipWinSum+=win;c.skipWinCount++;if(row.subsequent?.[subject]){c.subsequentSelected++;c.subsequentDelaySum+=row.subsequent[subject];}}
      }
      if(available){provenance.add(row.evidenceId??e.artifactId);states.add(`${e.identity.derivedSeed}:${e.seat}:${e.replayAnchor.stateHash}`);seeds.add(e.identity.derivedSeed);policies.add(e.identity.policyId);checkpoints.add(e.identity.checkpointId);matchups.add(e.identity.opponentPolicyId);games.add(`${e.identity.runId}:${e.identity.gameOrdinal}`);origins.add(row.origin??'LOCAL');}
    },
    finish() {
      const decorate=c=>({...c,opportunityRate:c.decisions?c.opportunities/c.decisions:null,selectionRate:c.opportunities?c.selected/c.opportunities:null,holdRate:c.opportunities?c.skipped/c.opportunities:null,
        selectedOutcomeAssociation:c.winCount?c.winSum/c.winCount:null,skippedOutcomeAssociation:c.skipWinCount?c.skipWinSum/c.skipWinCount:null,
        immediateScoreDelta:c.selected?c.immediateScoreSum/c.selected:null,horizonScoreDelta:c.horizonCount?c.horizonSum/c.horizonCount:null});
      return {contract:'STRATEGY_AGGREGATE_V1',fingerprint,rulesProfile,eraId,subject,filters,historical,total:decorate(total),timing:MATURITY_BUCKETS.map(bucket=>({bucket,...decorate(cells[bucket])})),
        distinctStates:states.size,independentStates:null,seedBlocks:seeds.size,games:games.size,policies:[...policies].sort(),checkpoints:[...checkpoints].sort(),matchups:[...matchups].sort(),provenance:[...provenance].sort(),origins:[...origins].sort(),nonClean,excluded,
        caveats:['Selected means declaration, not successful resolution.','Rank subjects include every authorized source-card use, including swap and private-choice modes; filter timing/mode for narrower questions.','Skipped opportunity does not establish intentional holding.','Outcome associations weight decisions, not independent games; repeated decisions and mirrored seats are correlated.','Policy decomposition is the existing diagnostic feature decomposition, not an additive reconstruction of the final policy score.','No uncertainty or causal strength is inferred from raw usage.','Immediate deltas exclude later stack resolution.']};
    }
  };
}
export function synthesizeStrategyClaim(claim) {
  verifyStrategy(claim,STRATEGY_CONTRACTS.claim);
  if(claim.confidence==='INSUFFICIENT')return "We don't have enough evidence yet.";
  if(claim.evidenceType==='DESCRIPTIVE')return `Selected on ${Math.round(100*claim.estimatedMagnitude)}% of legal opportunities. That tells us what these policies did; whether you should play it is still unknown.`;
  if(claim.evidenceType==='ASSOCIATIONAL')return `Selected decisions were associated with ${claim.estimatedMagnitude>=0?'+':''}${(claim.estimatedMagnitude*100).toFixed(1)} percentage points in terminal game score. Context and policy can explain that difference; it does not prove a better play.`;
  if(claim.informationScope==='RESEARCH_ONLY')return `In this recorded hidden state, ${claim.statementData.alternative} changed paired continuation game score by ${(claim.estimatedMagnitude*100).toFixed(1)} percentage points. Research-only; this is not player advice.`;
  return 'No supported player recommendation.';
}
export function claimsFromAggregate(aggregate,generatedAt=new Date().toISOString()) {
  const a=aggregate,c=a.total;
  const common={schemaVersion:1,subject:a.subject,scope:{fingerprint:a.fingerprint,rulesProfile:a.rulesProfile,eraId:a.eraId,filters:a.filters},
    recommendation:'UNKNOWN',informationScope:'ACTOR_AUTHORIZED',sampleSize:a.games,opportunityCount:c.opportunities,selectedCount:c.selected,distinctStateCount:a.distinctStates,independentStateCount:a.independentStates,seedBlocks:a.seedBlocks,
    pairedCount:0,uncertainty:null,policies:a.policies,checkpoints:a.checkpoints,matchups:a.matchups,provenance:a.provenance,generatedAt,caveats:a.caveats,
    stale:a.historical,invalidated:false,origin:a.origins.includes('IMPORTED_UNVERIFIED')?'IMPORTED_UNVERIFIED':'LOCAL',statementData:{}};
  const confidence=confidenceFor({opportunities:c.opportunities,level:'DESCRIPTIVE',stale:a.historical,origin:common.origin});
  const result=[sealStrategy(STRATEGY_CONTRACTS.claim,{...common,evidenceType:'DESCRIPTIVE',estimatedMagnitude:c.selectionRate,confidence})];
  if(c.selectedOutcomeAssociation!==null && c.skippedOutcomeAssociation!==null)result.push(sealStrategy(STRATEGY_CONTRACTS.claim,{...common,evidenceType:'ASSOCIATIONAL',estimatedMagnitude:c.selectedOutcomeAssociation-c.skippedOutcomeAssociation,confidence}));
  return result;
}
export function validateStrategyClaim(claim) {
  verifyStrategy(claim,STRATEGY_CONTRACTS.claim);
  if(!['DESCRIPTIVE','ASSOCIATIONAL','COUNTERFACTUAL','REPLICATED'].includes(claim.evidenceType) || !Object.hasOwn(STRATEGY_CONFIDENCE,claim.confidence))strategyFail('STRATEGY_CLAIM_INVALID');
  if(['DESCRIPTIVE','ASSOCIATIONAL'].includes(claim.evidenceType) && (claim.recommendation!=='UNKNOWN' || !['INSUFFICIENT','EXPERIMENTAL'].includes(claim.confidence)))strategyFail('STRATEGY_OBSERVATIONAL_OVERCLAIM');
  if(claim.informationScope==='RESEARCH_ONLY' && (claim.recommendation!=='UNKNOWN' || !['INSUFFICIENT','EXPERIMENTAL'].includes(claim.confidence)))strategyFail('STRATEGY_RESEARCH_ADVICE_REJECTED');
  return claim;
}
export function strategyGuide(claims,{fingerprint,rulesProfile,eraId,generatedAt=new Date().toISOString()}) {
  claims.forEach(validateStrategyClaim);
  if(claims.some(c=>c.scope.fingerprint!==fingerprint || c.scope.rulesProfile!==rulesProfile || c.scope.eraId!==eraId))strategyFail('STRATEGY_CROSS_ERA_REJECTED');
  const entries=claims.map(c=>({claimId:c.artifactId,subject:c.subject,confidence:c.confidence,statement:synthesizeStrategyClaim(c),provenance:c.provenance,evidenceType:c.evidenceType,informationScope:c.informationScope}));
  const guide=sealStrategy(STRATEGY_CONTRACTS.guide,{fingerprint,rulesProfile,eraId,generatedAt,entries,claims,missingConclusion:'No strong conclusion yet. Timing, scoring, defense, traps and expert recommendations require supported player-actionable evidence.'});
  return {manifest:guide,markdown:[`# ${STRATEGY_NAMES.title} — evidence-backed expert guide`,'',`Generated: ${generatedAt}`,`Rules: ${rulesProfile}`,`Era: ${eraId}`,'','## What we can currently say','',...entries.flatMap(e=>[`### ${e.subject} · ${e.confidence}`,e.statement,`Claim: ${e.claimId}`,`Sources: ${e.provenance.join(', ')}`,'']),guide.missingConclusion].join('\n')};
}
/** Bounded 2–3 action motifs; same actor, public descriptors, no causal label. */
export function mineStrategyMotifs(events,{maxMotifs=100,filters={}}={}) {
  const motifs=new Map();
  for(const seat of [1,2]) {
    const actions=events.filter(e=>e.seat===seat && e.outcomes.clean && !['phase','private-choice','response-decline'].includes(e.candidates.find(a=>a.actionId===e.selectedActionId)?.family));
    for(let i=0;i<actions.length-1;i++)for(const length of [2,3]) {
      const slice=actions.slice(i,i+length);if(slice.length!==length || slice.at(-1).context.turn-slice[0].context.turn>3)continue;
      if(slice.some(e=>!strategyEventMatches(e,filters)))continue;
      if(slice.some(e=>e.identity.runId!==slice[0].identity.runId || e.identity.gameOrdinal!==slice[0].identity.gameOrdinal || e.identity.eraId!==slice[0].identity.eraId))continue;
      const sequence=slice.map(e=>{const a=e.candidates.find(c=>c.actionId===e.selectedActionId);return `${a.family}:${a.mode}`;}),key=sequence.join(' → ');
      if(!motifs.has(key) && motifs.size>=maxMotifs)continue;
      const m=motifs.get(key)??{sequence,occurrences:0,games:new Set(),eventIds:[],outcomeScoreSum:0};
      m.occurrences++;m.games.add(`${slice[0].identity.runId}:${slice[0].identity.gameOrdinal}`);if(m.eventIds.length<12)m.eventIds.push(slice[0].artifactId);m.outcomeScoreSum+=slice.at(-1).outcomes.terminalWinner==='DRAW'?0.5:slice.at(-1).outcomes.terminalWinner===slice[0].actorId?1:0;motifs.set(key,m);
    }
  }
  return [...motifs.values()].map(({games,...m})=>({...m,gameCount:games.size,evidenceType:'ASSOCIATIONAL',caveat:'Sequence occurrence is not causal proof; overlapping windows are correlated.'})).sort((a,b)=>b.occurrences-a.occurrences);
}
export function mineStrategyMistakes(studies) {
  return studies.flatMap(study=>{
    verifyStrategy(study,STRATEGY_CONTRACTS.branch);
    if(study.status!=='COMPLETE')return [];
    return study.comparisons.filter(c=>c.interval?.[0]>0).map(c=>({studyId:study.artifactId,context:study.context,alternative:c.actionId,estimatedRegret:c.delta,interval:c.interval,
      confidence:'EXPERIMENTAL',evidenceCount:study.plan.seeds.length,informationScope:'RESEARCH_ONLY',exceptions:['One fixed hidden state.','Frozen continuation policies.','Does not establish a recurring player mistake.']}));
  });
}
