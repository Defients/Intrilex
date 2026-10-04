import { MATURITY_BUCKETS, STRATEGY_CONTRACTS, STRATEGY_NAMES, sealStrategy, verifyStrategy, strategyFail, decisionContext, gameMaturity } from './strategy-contracts.mjs';

// Rank semantic decomposition. rank:/card:/suit: subjects aggregate every
// authorized source-card use; these categories decompose that total by the
// canonical action family/timing descriptors only — no invented mechanics.
export const RANK_SEMANTIC_CATEGORIES = Object.freeze(['ANY_USE','PRIMARY_EFFECT','SCORE_USE','SWAP_USE','PRIVATE_CHOICE_USE','RESPONSE_USE','COMBINATION_USE','OTHER_USE']);
export const RANK_SEMANTIC_LABELS = Object.freeze({ANY_USE:'All uses combined',PRIMARY_EFFECT:'Normal play / printed effect',SCORE_USE:'Scoring',SWAP_USE:'Swap Bar',PRIVATE_CHOICE_USE:'Private choice',RESPONSE_USE:'Response / free timing',COMBINATION_USE:'Combinations & wild copies',OTHER_USE:'Other uses'});
const SEMANTIC_RESPONSE_FAMILIES = new Set(['counter','disrupt','interrupt','instant','quick']);
const SEMANTIC_COMBINATION_FAMILIES = new Set(['super','ultra','rank10','royal-marriage','queens-court','voltage','solo-wild','wild-sovereignty']);
const SEMANTIC_PRIMARY_FAMILIES = new Set(['scuttle','effect-three','effect-four','effect-ace','anchor','anchor-private-choice','attachment','effect-private-choice','effect-red-joker','effect-board-lock','sudden-death','play-for-points']);
export function rankSemanticCategory(candidate) {
  if(!candidate||typeof candidate.family!=='string')return 'OTHER_USE';
  if(candidate.family==='score')return 'SCORE_USE';
  if(candidate.family==='swap-bar')return 'SWAP_USE';
  if(SEMANTIC_COMBINATION_FAMILIES.has(candidate.family))return 'COMBINATION_USE';
  if(candidate.family==='private-choice')return 'PRIVATE_CHOICE_USE';
  if(SEMANTIC_RESPONSE_FAMILIES.has(candidate.family)||['INSTANT','QUICK','INTERRUPT'].includes(candidate.timing))return 'RESPONSE_USE';
  if(SEMANTIC_PRIMARY_FAMILIES.has(candidate.family))return 'PRIMARY_EFFECT';
  return 'OTHER_USE';
}

export const STRATEGY_CONFIDENCE = Object.freeze({ INSUFFICIENT:'Missing or inadmissible evidence; no advice.', EXPERIMENTAL:'Descriptive/observational pattern, or one research-only branched state. No strategic strength conclusion.',
  SUGGESTIVE:'Player-actionable controlled study with meaningful uncertainty bounds and at least two independent hidden worlds; continuation seeds are nested.',
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
  // semanticUse narrows rank/card/suit subjects to one canonical use category.
  // It is not an event-context filter; it narrows which candidates count as a
  // subject opportunity. Unknown categories fail closed.
  const semanticUse=filters.semanticUse??null,semanticSubject=/^(rank|card|suit):/.test(subject);
  if(semanticUse!==null&&!RANK_SEMANTIC_CATEGORIES.includes(semanticUse))strategyFail('STRATEGY_SEMANTIC_INVALID');
  if(semanticUse!==null&&semanticUse!=='ANY_USE'&&!semanticSubject)strategyFail('STRATEGY_SEMANTIC_INVALID');
  const cells=Object.fromEntries(MATURITY_BUCKETS.map(b=>[b,emptyCell()])),total=emptyCell(),semanticCells=new Map();
  const provenance=new Set(),states=new Set(),seeds=new Set(),policies=new Set(),checkpoints=new Set(),matchups=new Set(),origins=new Set(),games=new Set();
  let nonClean=0,excluded=0;
  return {
    add(row) {
      const e=row.event??row;
      if(e.identity.fingerprint!==fingerprint || e.identity.rulesProfile!==rulesProfile || e.identity.eraId!==eraId)strategyFail('STRATEGY_CROSS_ERA_REJECTED');
      if(!strategyEventMatches(e,filters)){excluded++;return;}
      const carrying=e.candidates.filter(a=>a.subjects.includes(subject));
      const pool=semanticUse&&semanticUse!=='ANY_USE'?carrying.filter(c=>rankSemanticCategory(c)===semanticUse):carrying;
      const available=pool.length>0;
      if(!e.outcomes.clean){if(available)nonClean++;return;}
      const chosen=e.candidates.find(a=>a.actionId===e.selectedActionId);
      const selected=chosen?pool.includes(chosen):false;
      const win=e.outcomes.terminalWinner==='DRAW'?0.5:e.outcomes.terminalWinner===e.actorId?1:0;
      // Per-category decomposition: one event can offer the subject under
      // several mechanics; each offered category owns its opportunity, and the
      // selected category owns the selection. ANY_USE remains the total.
      if(semanticSubject&&carrying.length) {
        const chosenCategory=chosen&&carrying.includes(chosen)?rankSemanticCategory(chosen):null;
        for(const category of new Set(carrying.map(rankSemanticCategory))) {
          const cell=semanticCells.get(category)??semanticCells.set(category,emptyCell()).get(category);
          cell.decisions++;cell.opportunities++;
          if(chosenCategory===category){cell.selected++;cell.winSum+=win;cell.winCount++;}
          else{cell.skipped++;cell.skipWinSum+=win;cell.skipWinCount++;}
        }
      }
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
        semanticUse:semanticSubject?semanticUse:null,
        semantics:semanticSubject?Object.fromEntries([...semanticCells.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,c])=>[k,decorate(c)])):null,
        distinctStates:states.size,independentStates:null,seedBlocks:seeds.size,games:games.size,policies:[...policies].sort(),checkpoints:[...checkpoints].sort(),matchups:[...matchups].sort(),provenance:[...provenance].sort(),origins:[...origins].sort(),nonClean,excluded,
        caveats:['Selected means declaration, not successful resolution.','Rank subjects decompose into semantic use categories derived from canonical action family/timing; ANY_USE combines every authorized source-card use.','Skipped opportunity does not establish intentional holding.','Outcome associations weight decisions, not independent games; repeated decisions and mirrored seats are correlated.','Policy decomposition is the existing diagnostic feature decomposition, not an additive reconstruction of the final policy score.','No uncertainty or causal strength is inferred from raw usage.','Immediate deltas exclude later stack resolution.']};
    }
  };
}
export function synthesizeStrategyClaim(claim) {
  verifyStrategy(claim,STRATEGY_CONTRACTS.claim);
  if(claim.confidence==='INSUFFICIENT')return "We don't have enough evidence yet.";
  if(claim.evidenceType==='DESCRIPTIVE')return `Selected on ${Math.round(100*claim.estimatedMagnitude)}% of legal opportunities. That tells us what these policies did; whether you should play it is still unknown.`;
  if(claim.evidenceType==='ASSOCIATIONAL')return `Selected decisions were associated with ${claim.estimatedMagnitude>=0?'+':''}${(claim.estimatedMagnitude*100).toFixed(1)} percentage points in terminal game score. Context and policy can explain that difference; it does not prove a better play.`;
  if(claim.informationScope==='RESEARCH_ONLY')return `In this recorded hidden state, ${claim.statementData.alternative} changed paired continuation game score by ${(claim.estimatedMagnitude*100).toFixed(1)} percentage points. Research-only; this is not player advice.`;
  if(claim.statementData?.informationSetId){const d=claim.statementData,name=claim.subject.replace(/^(card|rank|family|mode|mechanic|timing|suit|combination):/,'');
    const robust=d.heterogeneity==='ROBUST'?'Robust across compatible hidden worlds':d.heterogeneity==='VOLATILE'?'Volatile across compatible hidden worlds':'Unresolved heterogeneity across compatible hidden worlds';
    const scope=`Applies only to this exact authorized opening context and frozen continuation policies`;
    if(d.direction==='REFERENCE'){
      const head=claim.confidence!=='SUGGESTIVE'?'Unknown':claim.recommendation==='PLAY'?`Usually play ${name} here`:['PRESERVE','HOLD'].includes(claim.recommendation)?`Usually preserve ${name} here`:`Prefer the recorded play (${d.referenceLabel}) over the tested alternatives`;
      return `${head}: the recorded play beat each of the ${d.testedAlternatives?.length??0} planned alternatives by at least ${(claim.estimatedMagnitude*100).toFixed(1)} percentage points across ${d.hiddenWorlds} compatible hidden worlds, ${d.continuationsPerWorld} continuations per world/action. ${robust}. ${scope}; untested legal actions were not compared.`;
    }
    const alt=d.alternative?.split(' · ')[0]??'alternative',altName=alt.charAt(0).toUpperCase()+alt.slice(1);
    const refUses=(d.referenceDispositions??[]).includes('USES_SUBJECT'),altUses=(d.dispositions??[]).includes('USES_SUBJECT');
    const head=claim.confidence!=='SUGGESTIVE'?'Unknown':claim.recommendation==='PLAY'?`Usually play ${name} here`:['PRESERVE','HOLD'].includes(claim.recommendation)?`Usually preserve ${name} here`:d.direction==='ALTERNATIVE'?`Prefer ${altName} over ${refUses&&!altUses?`using ${name}`:'the recorded play'} in this opening`:'Prefer alternative';
    return `${head}: ${d.alternative}. Estimated terminal game-score difference ${(claim.estimatedMagnitude*100).toFixed(1)} percentage points across ${d.hiddenWorlds} compatible hidden worlds, ${d.continuationsPerWorld} continuations per world/action. ${robust}. ${scope}.`;}
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
  if(claim.recommendation!=='UNKNOWN'&&claim.statementData?.informationSetId){const d=claim.statementData,i=claim.uncertainty?.interval;if(claim.confidence!=='SUGGESTIVE'||claim.origin!=='LOCAL_REPRODUCTION'||claim.stale||claim.invalidated||claim.informationScope!=='ACTOR_AUTHORIZED'||claim.independentStateCount<2||d.heterogeneity!=='ROBUST'||!i||i[0]<=d.minimumMeaningfulEffect||!Number.isFinite(d.minimumMeaningfulEffect)||d.minimumMeaningfulEffect<0)strategyFail('STRATEGY_INFORMATION_ADVICE_REJECTED');}
  return claim;
}
// ── Quick Read deterministic claim priority ────────────────────────────
// Player-facing advice selection must never reward the largest absolute
// effect for being largest. Priority: exact public-context match → current
// era/trusted local reproduction → evidence confidence → context specificity
// → newest compatible study → stable artifact ID. |effect| is never a key.
const QUICK_CONFIDENCE_RANK = Object.freeze({ESTABLISHED:5,STRONG:4,SUGGESTIVE:3,EXPERIMENTAL:2,INSUFFICIENT:1});
// Fields a claim's stored public context can actually answer; identity and
// provenance filters are not matchable and fall through to later criteria.
const CONTEXT_ONLY_FILTERS = new Set(['policyId','opponentPolicyId','checkpointId','agentProfileId','profileHead','rulesProfile','fingerprint','eraId','purpose','semanticUse']);
export function claimContextMatch(claim,filters={}) {
  const active=Object.entries(filters).filter(([key,value])=>value!==null&&value!==''&&value!==undefined&&!CONTEXT_ONLY_FILTERS.has(key));
  if(!active.length)return 1;
  const pc=claim.statementData?.publicContext;
  if(!pc)return 0;
  const context=decisionContext(pc),pseudo={identity:{},context,seat:claim.statementData?.actorSeat??1,maturity:gameMaturity(context)};
  return active.filter(([key,value])=>strategyEventMatches(pseudo,{[key]:value})).length/active.length;
}
export function orderControlledClaims(claims,{filters={},fingerprint=null,eraId=null}={}) {
  const rank=claim=>({ctx:claimContextMatch(claim,filters),current:claim.stale||claim.invalidated||claim.origin!=='LOCAL_REPRODUCTION'||(fingerprint&&claim.scope.fingerprint!==fingerprint)||(eraId&&claim.scope.eraId!==eraId)?0:1,
    confidence:QUICK_CONFIDENCE_RANK[claim.confidence]??0,specificity:Object.keys(claim.scope?.filters??{}).length,at:String(claim.generatedAt??''),id:String(claim.artifactId)});
  return [...claims].sort((a,b)=>{const A=rank(a),B=rank(b);return (B.ctx-A.ctx)||(B.current-A.current)||(B.confidence-A.confidence)||(B.specificity-A.specificity)||B.at.localeCompare(A.at)||A.id.localeCompare(B.id);});
}
// ── Deterministic research leads ───────────────────────────────────────
// Leads justify controlled testing, never advice. Thresholds are mechanical
// and documented; observational signals cannot become recommendations.
export const RESEARCH_LEAD = Object.freeze({PROMISING_POSITIVE_SIGNAL:'PROMISING_POSITIVE_SIGNAL',PROMISING_NEGATIVE_SIGNAL:'PROMISING_NEGATIVE_SIGNAL',HIGH_USAGE_UNRESOLVED:'HIGH_USAGE_UNRESOLVED',LOW_USAGE_HIGH_ASSOCIATION:'LOW_USAGE_HIGH_ASSOCIATION',TIMING_SENSITIVE:'TIMING_SENSITIVE',MATCHUP_SENSITIVE:'MATCHUP_SENSITIVE',INSUFFICIENT:'INSUFFICIENT'});
export function researchLeadsFor(subject,aggregate,{hasControlledAdvice=false}={}) {
  const c=aggregate?.total,leads=[];
  if(!c||!c.opportunities)return [{kind:RESEARCH_LEAD.INSUFFICIENT,subject,detail:'No legal opportunities in this evidence scope.'}];
  const assoc=c.selectedOutcomeAssociation!==null&&c.skippedOutcomeAssociation!==null?c.selectedOutcomeAssociation-c.skippedOutcomeAssociation:null;
  if(assoc!==null&&assoc>=.1)leads.push({kind:RESEARCH_LEAD.PROMISING_POSITIVE_SIGNAL,subject,detail:`Selected decisions were associated with +${(assoc*100).toFixed(1)} pp game score — observational only, worth controlled testing.`});
  if(assoc!==null&&assoc<=-.1)leads.push({kind:RESEARCH_LEAD.PROMISING_NEGATIVE_SIGNAL,subject,detail:`Selected decisions were associated with ${(assoc*100).toFixed(1)} pp game score — observational only, worth controlled testing.`});
  if(c.selectionRate!==null&&c.selectionRate>=.4&&!hasControlledAdvice)leads.push({kind:RESEARCH_LEAD.HIGH_USAGE_UNRESOLVED,subject,detail:`Used on ${(c.selectionRate*100).toFixed(0)}% of opportunities with no controlled advice.`});
  if(c.selectionRate!==null&&c.selectionRate<=.1&&assoc!==null&&assoc>=.15)leads.push({kind:RESEARCH_LEAD.LOW_USAGE_HIGH_ASSOCIATION,subject,detail:'Rarely used but strongly associated — a candidate for an opening contrast study.'});
  const buckets=(aggregate.timing??[]).filter(t=>t.opportunities>=5&&t.selectionRate!==null);
  if(buckets.length>=2&&Math.max(...buckets.map(t=>t.selectionRate))-Math.min(...buckets.map(t=>t.selectionRate))>=.3)leads.push({kind:RESEARCH_LEAD.TIMING_SENSITIVE,subject,detail:'Usage varies sharply by game maturity — timing-specific evidence would help.'});
  if(!leads.length)leads.push({kind:RESEARCH_LEAD.INSUFFICIENT,subject,detail:'No deterministic research-lead threshold met.'});
  return leads;
}
// ── Expert Guide V2 ────────────────────────────────────────────────────
// Human-first synthesis: one coherent section per subject, grouped sections,
// no provenance dumps in prose. The sealed manifest retains the full audit
// trail — claim IDs, provenance IDs, scope and uncertainty — untouched.
const pp=n=>`${n>=0?'+':''}${(n*100).toFixed(1)} pp`;
const pct0=n=>`${(n*100).toFixed(1)}%`;
function guideSubjectSection(d){
  const c=d.aggregate.total,assoc=d.assoc,lines=[`### ${d.name}`,'',
    `Usage: selected on ${c.opportunities?pct0(c.selectionRate??0):'0.0%'} of ${c.opportunities} legal opportunities (${c.decisions} decisions observed).`];
  lines.push(assoc===null?'Observed signal: not enough comparable selections/skips to form an outcome association.':`Observed signal: ${pp(assoc)} association between selected and skipped opportunities in this dataset.`);
  const actionable=d.controlled.filter(x=>x.confidence!=='INSUFFICIENT'&&x.confidence!=='EXPERIMENTAL'&&x.recommendation!=='UNKNOWN');
  if(actionable.length)lines.push('Controlled evidence:',...actionable.slice(0,3).map(x=>`- ${synthesizeStrategyClaim(x)}`));
  else if(d.controlled.length)lines.push('Controlled evidence: controlled opening-study evidence exists, but no result has earned player-actionable confidence yet.');
  else lines.push('Controlled evidence: none.');
  lines.push(assoc!==null&&Math.abs(assoc)>=.1?'Interpretation: interesting, but observational only — usage patterns cannot prove this play is better.':'Interpretation: nothing stands out strongly enough to prioritize yet.');
  const priority=d.leads.some(l=>[RESEARCH_LEAD.PROMISING_POSITIVE_SIGNAL,RESEARCH_LEAD.PROMISING_NEGATIVE_SIGNAL,RESEARCH_LEAD.LOW_USAGE_HIGH_ASSOCIATION].includes(l.kind))?'High':d.leads.some(l=>l.kind!==RESEARCH_LEAD.INSUFFICIENT)?'Medium':'Low';
  lines.push(`Research priority: ${priority}.`,`Next useful study: play-vs-preserve comparison in an exact opening information set.`);
  return lines;
}
export function strategyGuide(claims,{fingerprint,rulesProfile,eraId,generatedAt=new Date().toISOString(),subjects=[],motifs=[],humanName=s=>s}={}) {
  claims.forEach(validateStrategyClaim);
  if(claims.some(c=>c.scope.fingerprint!==fingerprint || c.scope.rulesProfile!==rulesProfile || c.scope.eraId!==eraId))strategyFail('STRATEGY_CROSS_ERA_REJECTED');
  const entries=claims.map(c=>({claimId:c.artifactId,subject:c.subject,confidence:c.confidence,statement:synthesizeStrategyClaim(c),provenance:c.provenance,evidenceType:c.evidenceType,informationScope:c.informationScope,recommendation:c.recommendation,estimatedMagnitude:c.estimatedMagnitude,uncertainty:c.uncertainty,stale:c.stale,invalidated:c.invalidated,origin:c.origin,scope:c.scope}));
  const bySubject=new Map();for(const c of claims){const list=bySubject.get(c.subject)??[];list.push(c);bySubject.set(c.subject,list);}
  const actionable=claims.filter(c=>!['INSUFFICIENT','EXPERIMENTAL'].includes(c.confidence)&&c.recommendation!=='UNKNOWN');
  const subjectData=subjects.map(({subject,aggregate})=>{
    const subClaims=bySubject.get(subject)??[],controlled=subClaims.filter(c=>c.evidenceType==='COUNTERFACTUAL'&&c.statementData?.informationSetId);
    const c=aggregate.total,assoc=c.selectedOutcomeAssociation!==null&&c.skippedOutcomeAssociation!==null?c.selectedOutcomeAssociation-c.skippedOutcomeAssociation:null;
    return {subject,name:humanName(subject),aggregate,claims:subClaims,controlled,assoc,leads:researchLeadsFor(subject,aggregate,{hasControlledAdvice:actionable.some(c=>c.subject===subject)})};
  }).filter(d=>d.aggregate.total.opportunities>0||d.claims.length>0);
  const leads=subjectData.flatMap(d=>d.leads.filter(l=>l.kind!==RESEARCH_LEAD.INSUFFICIENT).map(l=>({subject:d.subject,subjectName:d.name,kind:l.kind,detail:l.detail})));
  const controlledTotal=claims.filter(c=>c.evidenceType==='COUNTERFACTUAL').length;
  const md=[`# ${STRATEGY_NAMES.title} — Intrilex Strategy Guide`,'',`Generated ${generatedAt} · rules ${rulesProfile}`,'',
    '## Current Evidence Status','',
    `${subjectData.length} subjects observed · ${controlledTotal} controlled claims · ${actionable.length} earned player-actionable recommendations.`,
    ...(actionable.length?['Some controlled opening-context advice exists below — each applies only to its exact tested context.']:['No controlled player-actionable recommendation has earned Suggestive confidence yet.']),'' ];
  const signals=subjectData.filter(d=>d.assoc!==null).sort((a,b)=>Math.abs(b.assoc)-Math.abs(a.assoc)).slice(0,3);
  const mostUsed=subjectData.filter(d=>d.aggregate.total.selectionRate!==null).sort((a,b)=>(b.aggregate.total.selectionRate??0)-(a.aggregate.total.selectionRate??0))[0];
  if(signals.length||mostUsed)md.push('## Executive Summary','',
    ...(mostUsed?[`- Most used subject: ${mostUsed.name} (${pct0(mostUsed.aggregate.total.selectionRate)} of opportunities — behavior, not strength).`]:[]),
    ...signals.map(d=>`- ${d.name}: ${pp(d.assoc)} observational association — a testing lead, not proof.`),'');
  if(subjectData.length)md.push('## Core Strategic Signals','',...subjectData.filter(d=>d.assoc!==null&&Math.abs(d.assoc)>=.05).map(d=>`- ${d.name}: used ${pct0(d.aggregate.total.selectionRate??0)} of opportunities; ${pp(d.assoc)} observational outcome association.`),'');
  const cards=subjectData.filter(d=>/^rank:/.test(d.subject));
  if(cards.length)md.push('## Card-by-Card Guide','',...cards.flatMap(guideSubjectSection));
  const timingRows=subjectData.filter(d=>{const b=(d.aggregate.timing??[]).filter(t=>t.opportunities>=5&&t.selectionRate!==null);return b.length>=2&&Math.max(...b.map(t=>t.selectionRate))-Math.min(...b.map(t=>t.selectionRate))>=.15;});
  if(timingRows.length)md.push('## Timing','',...timingRows.flatMap(d=>[`### ${d.name}`,'',...d.aggregate.timing.filter(t=>t.opportunities>0).map(t=>`- ${t.bucket}: ${t.selected}/${t.opportunities} opportunities selected (${pct0(t.selectionRate??0)})`),'','Usage by maturity is descriptive — it shows when these policies reached for it, not when it is correct.','']));
  const resource=subjectData.filter(d=>/^family:(score|draw)$/.test(d.subject));
  if(resource.length)md.push('## Scoring vs Resource','',...resource.map(d=>`- ${d.name}: ${pct0(d.aggregate.total.selectionRate??0)} selection rate; ${d.assoc===null?'no outcome association yet':`${pp(d.assoc)} observational association`}.`),'');
  const disruption=subjectData.filter(d=>/^family:(scuttle|counter|disrupt|interrupt|instant|quick)$/.test(d.subject)||/RESPONSE_USE/.test(Object.keys(d.aggregate.semantics??{}).join(',')));
  if(disruption.length)md.push('## Disruption & Control','',...disruption.map(d=>`- ${d.name}: ${pct0(d.aggregate.total.selectionRate??0)} selection rate${d.assoc===null?'':`; ${pp(d.assoc)} observational association`}.`),'');
  const combos=subjectData.filter(d=>/^combination:/.test(d.subject));
  if(combos.length||motifs.length)md.push('## Combinations / Sequences','',...combos.map(d=>`- ${d.name}: ${d.aggregate.total.opportunities} opportunities, ${pct0(d.aggregate.total.selectionRate??0)} selected.`),...motifs.slice(0,5).map(m=>`- ${m.sequence.join(' → ')}: ${m.occurrences} observed windows in ${m.gameCount} games (associational).`),'');
  const matchup=subjectData.filter(d=>(d.aggregate.matchups??[]).length>=2);
  if(matchup.length)md.push('## Matchup Differences','',...matchup.map(d=>`- ${d.name}: observed against ${d.aggregate.matchups.length} distinct opponent policies; usage may reflect matchup, not card strength.`),'');
  if(leads.length)md.push('## Research Leads','','Leads are not advice — they rank what deserves controlled testing next.','',...leads.map(l=>`- ${l.subjectName} · ${l.kind.replaceAll('_',' ')}: ${l.detail}`),'');
  md.push('## Supported Advice','');
  if(actionable.length)md.push(...orderControlledClaims(actionable,{fingerprint,eraId}).slice(0,8).map(c=>`- ${humanName(c.subject)} · ${c.confidence}: ${synthesizeStrategyClaim(c)}`),'');
  else md.push('No controlled player-actionable recommendation has earned Suggestive confidence yet.','');
  md.push('## What We Still Don\'t Know','',
    ...subjectData.filter(d=>!d.controlled.length).map(d=>`- ${d.name}: no controlled use-vs-preserve evidence.`),
    '- Midgame and private-information decisions cannot be studied yet — controlled evidence covers the first P1 opening decision only.',
    '- Observational associations remain non-causal; nothing here proves a card wins more games by itself.','');
  const guide=sealStrategy(STRATEGY_CONTRACTS.guide,{fingerprint,rulesProfile,eraId,generatedAt,guideVersion:2,entries,leads,claims,missingConclusion:'No strong conclusion yet. Timing, scoring, defense, traps and expert recommendations require supported player-actionable evidence.'});
  return {manifest:guide,markdown:md.join('\n')};
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
