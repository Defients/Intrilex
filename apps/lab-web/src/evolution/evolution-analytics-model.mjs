// Read-only projections: never rewrite a hashed game record or execution config.
const cleanReasons = new Set(['NORMAL_VICTORY', 'EXHAUSTED_RESOLUTION', 'CANONICAL_DRAW']);
export const isCleanGame = r => cleanReasons.has(r.terminationReason) && ['P1','P2','DRAW'].includes(r.winner);
export const outcome = r => !isCleanGame(r) ? 'Fault' : r.winner === 'DRAW' ? 'Draw' : ((r.winner === 'P1') !== r.swapped ? 'A' : 'B');
export const mean = xs => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
export function quantile(xs, p) {
  if (!xs.length) return null;
  const sorted=[...xs].sort((a,b)=>a-b), position=(sorted.length-1)*p, lo=Math.floor(position), hi=Math.ceil(position);
  return sorted[lo]+(sorted[hi]-sorted[lo])*(position-lo);
}

/** Core ends its winning End phase before incrementing fullTurnSequence.
 * Event-qualified counts include that terminal End; unknown profiles/old telemetry
 * remain unavailable rather than silently mixing counter definitions. */
export function inclusiveFullTurns(record, profileId) {
  if (!profileId?.startsWith('core-') || !isCleanGame(record)) return null;
  const events=record.eventCounts;
  if (!events) return null;
  const terminal=['CORE_NORMAL_VICTORY','CORE_SUDDEN_DEATH_RESOLVED','CORE_EXHAUSTED_RESOLVED'].reduce((n,key)=>n+(events[key]??0),0);
  if (terminal !== 1) return null;
  const prior=events.CORE_FULL_TURN_COMPLETED??0;
  return Number.isInteger(prior)&&prior>=0 ? prior+1 : null;
}

export function histogram(records, getValue, maxBins=24) {
  const observed=records.map(r=>({record:r,value:getValue(r)})).filter(x=>Number.isFinite(x.value));
  if (!observed.length) return [];
  const min=Math.min(...observed.map(x=>x.value)), max=Math.max(...observed.map(x=>x.value));
  const width=Math.max(1,Math.ceil((max-min+1)/maxBins)), count=Math.floor((max-min)/width)+1;
  const bins=Array.from({length:count},(_,i)=>({lo:min+i*width,hi:min+(i+1)*width-1,A:0,B:0,Draw:0,Fault:0,records:[]}));
  for(const {record,value} of observed){const bin=bins[Math.floor((value-min)/width)];bin[outcome(record)]++;bin.records.push(record.ordinal);}
  return bins;
}

export function arenaAnalytics(run, {window=100, from=1, to=10000}={}) {
  const records=(run?.records??[]).filter(r=>r.ordinal+1>=from&&r.ordinal+1<=to).sort((a,b)=>a.ordinal-b.ordinal);
  const clean=records.filter(isCleanGame), profile=run?.config.profileId;
  const turnValues=clean.map(r=>inclusiveFullTurns(r,profile)).filter(Number.isFinite);
  const summary={accepted:records.length,clean:clean.length,faults:records.length-clean.length,
    requested:run?.config.gameCount??0,remaining:Math.max(0,(run?.config.gameCount??0)-(run?.records.length??0)),
    turnCoverage:turnValues.length,meanTurns:mean(turnValues),medianTurns:quantile(turnValues,.5),p90Turns:quantile(turnValues,.9),
    rawTurns:mean(clean.map(r=>r.turns)),miniTurns:mean(clean.map(r=>r.miniTurns).filter(Number.isFinite)),decisions:mean(clean.map(r=>r.decisions))};
  const points=r=>outcome(r)==='Draw'?.5:outcome(r)==='A'?1:0;
  const curves=[], byOrdinal=new Map(clean.map(r=>[r.ordinal,r])), pairScores=[], rolling=[];
  let a=0,b=0,d=0,rollSum=0,pairSum=0,n=0;
  const step=Math.max(1,Math.ceil(clean.length/240));
  for(const r of clean){
    n++;const o=outcome(r);if(o==='A')a++;else if(o==='B')b++;else d++;
    const point=points(r);rolling.push(point);rollSum+=point;if(rolling.length>window)rollSum-=rolling.shift();
    const partner=byOrdinal.get(r.ordinal-1);
    if(run?.config.mirrorSeats&&r.ordinal%2===1&&partner?.seed===r.seed&&partner.swapped===false&&r.swapped===true){const score=(points(partner)+point)/2;pairScores.push(score);pairSum+=score;}
    if(n%step===0||n===clean.length||n===1){const paired=pairScores.length?pairSum/pairScores.length:null,radius=pairScores.length?Math.sqrt(Math.log(40)/(2*pairScores.length)):null;
      curves.push({x:r.ordinal+1,n,a:100*a/n,b:100*b/n,draw:100*d/n,rolling:100*rollSum/rolling.length,rollingN:rolling.length,
        paired:paired===null?null:paired*100,lo:paired===null?null:Math.max(0,paired-radius)*100,hi:paired===null?null:Math.min(1,paired+radius)*100});}
  }
  const paired=mean(pairScores), radius=pairScores.length?Math.sqrt(Math.log(40)/(2*pairScores.length)):null;
  const seats=[false,true].map(swapped=>{const rows=clean.filter(r=>r.swapped===swapped);return {label:swapped?'BA · A second':'AB · A first',n:rows.length,A:rows.filter(r=>outcome(r)==='A').length,B:rows.filter(r=>outcome(r)==='B').length,Draw:rows.filter(r=>outcome(r)==='Draw').length};});
  const actions={A:{decisions:0,counts:{}},B:{decisions:0,counts:{}}};
  let telemetryGames=0;
  for(const r of clean){if(r.seatBehavior?.length!==2)continue;telemetryGames++;for(const [i,seat] of r.seatBehavior.entries()){const bot=(i===0)!==r.swapped?'A':'B';actions[bot].decisions+=seat.decisions;for(const [key,count]of Object.entries(seat.actionCounts??{}))actions[bot].counts[key]=(actions[bot].counts[key]??0)+count;}}
  const families=[...new Set([...Object.keys(actions.A.counts),...Object.keys(actions.B.counts)])].sort().map(key=>({key,A:actions.A.decisions?100*(actions.A.counts[key]??0)/actions.A.decisions:null,B:actions.B.decisions?100*(actions.B.counts[key]??0)/actions.B.decisions:null}));
  const terminations=Object.entries(records.reduce((acc,r)=>{acc[r.terminationReason]=(acc[r.terminationReason]??0)+1;return acc;},{})).map(([key,count])=>({key,count}));
  return {records,clean,summary,curves,seats,families,telemetryGames,terminations,
    pairs:{n:pairScores.length,incompleteGames:clean.length-pairScores.length*2,score:paired,interval:paired===null?null:[Math.max(0,paired-radius),Math.min(1,paired+radius)]},
    turnBins:histogram(clean,r=>inclusiveFullTurns(r,profile)),decisionBins:histogram(clean,r=>r.decisions),
    marginBins:histogram(clean,r=>r.swapped?r.scoreP2-r.scoreP1:r.scoreP1-r.scoreP2),
    scatter:clean.filter((_,i)=>i%Math.max(1,Math.ceil(clean.length/300))===0).map(r=>({x:inclusiveFullTurns(r,profile),y:r.swapped?r.scoreP2-r.scoreP1:r.scoreP1-r.scoreP2,record:r})).filter(p=>Number.isFinite(p.x))};
}

export function researchAnalytics(project) {
  if(!project)return {rows:[],features:[],nodes:[]};
  const roots=project.experiment.scientific.startingCheckpointIds.map(id=>project.checkpoints.find(cp=>cp.checkpointId===id)).filter(Boolean);
  const nodes=roots.flatMap(root=>[root,...project.generations.filter(g=>g.lineageId===root.lineageId).sort((a,b)=>a.generation-b.generation).map(g=>project.checkpoints.find(cp=>cp.checkpointId===g.selectedCheckpointId)).filter(Boolean)]);
  const rows=nodes.map(cp=>{
    const evaluation=project.evaluations.findLast(e=>e.candidateCheckpointId===cp.checkpointId&&e.purpose==='EVALUATION'&&e.suiteId===project.suite.suiteId&&e.packId===project.packs.find(p=>p.purpose==='EVALUATION')?.packId&&e.status==='COMPLETE');
    return {cp,evaluation,matchups:project.suite.checkpoints.map(op=>({opponent:op.policyId,metrics:evaluation?.matchups.find(m=>m.opponentPolicyId===op.policyId)?.metrics??null}))};
  });
  return {nodes,rows,roots};
}
