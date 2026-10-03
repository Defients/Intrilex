import { researchRunEvidence } from './evolution-retention.mjs';
import { completeEvaluation, behaviorDeltas } from './evolution-research.mjs';
import { lineChart } from '../chart-toolkit.js';
import { esc } from '../state.js';
import { LAB_IDENTITY } from './identity.mjs';
import { createTrainingProject,trainProject } from './evolution-training.mjs';
import { executeBrowserSeries } from './evolution-browser-runner.mjs';
import { attachTrainingUi } from './evolution-research-ui.js';

const api=attachTrainingUi(renderTraining);
function renderTraining(project,busy){
  // Creation remains available before any experiment exists.
  const root=document.getElementById('evo-research');if(!root)return;
  let target=document.getElementById('evo-training-controls');
  if(!target){target=document.createElement('div');target.id='evo-training-controls';root.append(target);}
  const disabled=busy?'disabled':'',training=project?.experiment.type==='EVOLUTION_TRAINING';
  const settings=project?.experiment.scientific.training;
  target.innerHTML=`<h4>Adaptive heuristic evolution · experimental V1</h4><p>Training selects descendants. Held-out evaluation measures them and never selects or updates a policy. A retained parent can produce an unchanged generation.</p>
    <div class="toolbar"><label>Generations<input id="evo-training-generations" type="number" min="1" max="100" value="${settings?.generations??2}" ${disabled}></label>
    <label>Mutations per parent<input id="evo-training-candidates" type="number" min="1" max="4" value="${settings?.candidates??2}" ${disabled}></label>
    <label>Mutation step<input id="evo-training-step" type="number" min="1" max="1000" value="${settings?.mutationStep??250}" ${disabled}></label>
    <label>Evolution RNG seed<input id="evo-training-seed" type="number" min="0" max="4294967295" value="${settings?.evolutionSeed??31091}" ${disabled}></label>
    <label>Training pairs<input id="evo-training-pairs" type="number" min="1" max="5000" value="${settings?.trainingPairs??2}" ${disabled}></label>
    <button id="evo-create-training" class="secondary-button" ${disabled}>Create A0 / B0 experiment</button><button id="evo-train" class="primary-button" ${!training||busy?'disabled':''}>Train / resume generations</button></div>
    ${training?arena(project)+trend(project):''}`;
  document.getElementById('evo-create-training').onclick=async()=>{try{
    const config=api.view.readConfig(),training={generations:Number(document.getElementById('evo-training-generations').value),candidates:Number(document.getElementById('evo-training-candidates').value),mutationStep:Number(document.getElementById('evo-training-step').value),evolutionSeed:Number(document.getElementById('evo-training-seed').value),trainingPairs:Number(document.getElementById('evo-training-pairs').value),evaluationPairs:Number(document.getElementById('evo-pack-pairs').value)};
    api.pickProject(createTrainingProject({identity:LAB_IDENTITY,name:document.getElementById('evo-experiment-name').value,seed:config.seed,workerCount:config.workerCount,profileId:config.profileId,training}));await api.persist();
  }catch(error){api.view.error=error.message;api.render();}};
  document.getElementById('evo-train').onclick=()=>api.execute(async(signal,p)=>{
    await trainProject(p,executeBrowserSeries,{signal,onProgress:api.progress,onRun:async run=>api.store.save(researchRunEvidence(run,api.view.progress?.mode??'EVALUATION')),onSave:async()=>{await api.persist();}});
    const selected=p.generations.at(-1)?.selectedCheckpointId;if(selected)api.view.selectedA=selected;
    return p.experiment.status;
  });
}
function arena(p){
  const bot=tag=>{
    const root=p.checkpoints.find(cp=>cp.agentId===tag&&cp.generation===0),generations=p.generations.filter(g=>g.lineageId===root.lineageId),selected=generations.at(-1),cp=p.checkpoints.find(cp=>cp.checkpointId===(selected?.selectedCheckpointId??root.checkpointId));
    const pack=p.packs.find(x=>x.purpose==='EVALUATION'),evaluation=completeEvaluation(p.evaluations,cp.checkpointId,pack.packId,p.suite.suiteId),delta=Object.fromEntries(Object.keys(cp.policyState.weights).map(k=>[k,cp.policyState.weights[k]-root.policyState.weights[k]]));
    return `<div class="evo-bot"><h4>BOT ${tag} · generation ${cp.generation}</h4><small>${esc(cp.lineageId.slice(0,27))}</small><p><code>${cp.checkpointId.slice(0,23)}</code> · policy v${cp.policyVersion}</p><p>Frozen evaluation: ${evaluation?evaluation.matchups.map(m=>`${esc(m.opponentPolicyId)} ${m.metrics.pairedScore===null?'unavailable':(100*m.metrics.pairedScore).toFixed(1)+'%'}`).join(' · '):'pending'}</p>${trainingSummary(p,selected)}${behaviorSummary(p,root,cp)}<details><summary>Parameter deltas / recent mutation</summary><pre>${esc(JSON.stringify({delta,mutation:cp.mutation},null,2))}</pre></details><p>${generations.length} append-only selection records</p></div>`;
  };
  return `<div class="evo-arena">${bot('A')}<div class="evo-arena-mid"><strong>${p.experiment.status==='RUNNING'?'TRAINING / HELD-OUT EVALUATION':'INDEPENDENT LINEAGES'}</strong><p>${p.generations.length} committed lineage generations</p><p>${p.faults.length} experiment faults</p><p id="evo-training-live">Current execution counters appear during training/evaluation.</p></div>${bot('B')}</div>
    ${regressions(p)}${divergence(p)}`;
}

function trend(p){
  const maximum=Math.max(0,...p.generations.map(g=>g.generation)),pack=p.packs.find(x=>x.purpose==='EVALUATION');
  const series=['A','B'].map((tag,i)=>{const root=p.checkpoints.find(cp=>cp.agentId===tag&&cp.generation===0);return {label:`Bot ${tag}`,color:i?'#b495ff':'#58d8c5',values:Array.from({length:maximum+1},(_,generation)=>{const id=generation===0?root.checkpointId:p.generations.find(g=>g.lineageId===root.lineageId&&g.generation===generation)?.selectedCheckpointId;const result=completeEvaluation(p.evaluations,id,pack.packId,p.suite.suiteId);const score=result?.matchups.find(m=>m.opponentPolicyId==='control')?.metrics.pairedScore;return Number.isFinite(score)?100*score:null;})};});
  if(!series.some(s=>s.values.some(Number.isFinite)))return '<p>Frozen control-reference trend: awaiting baseline evaluation.</p>';
  return `<h4>Frozen paired score against control · by generation</h4>${lineChart({series,xLabels:Array.from({length:maximum+1},(_,i)=>String(i)),minValue:0,maxValue:100,yUnit:'%',ariaLabel:'A and B frozen paired score against the control checkpoint by generation'})}<p>Same held-out pack and opponent. Other matchups remain visible separately; missing evaluations leave gaps.</p>`;
}

const pct=n=>Number.isFinite(n)?(100*n).toFixed(1)+'%':'unavailable';
function trainingSummary(p,selection){
  if(!selection)return '<p class="evo-training-summary">TRAINING: no selection committed.</p>';
  const best=selection.selection.ranking[0],ev=p.evaluations.find(e=>e.candidateCheckpointId===best.checkpointId&&e.packId===selection.trainingPackId&&e.status==='COMPLETE');
  return `<p class="evo-training-summary"><b>TRAINING selection mean: ${pct(best.fitness)}</b> across ${ev?.matchups.length??0} named opponents. ${ev?.matchups.reduce((n,m)=>n+m.metrics.games,0)??0} source games; ${selection.selection.disqualified.length} disqualified candidates. This is selection fitness, not held-out strength.</p>`;
}
function controlBehavior(p,cp){const pack=p.packs.find(x=>x.purpose==='EVALUATION');return completeEvaluation(p.evaluations,cp.checkpointId,pack.packId,p.suite.suiteId)?.matchups.find(m=>m.opponentPolicyId==='control')?.behavior;}
function behaviorTable(d){return d.available?`<p>${d.beforeGames} before / ${d.afterGames} after games; ${d.beforeDecisions} / ${d.afterDecisions} candidate decisions.</p><div class="evo-table-scroll"><table><thead><tr><th>Measured frequency</th><th>Before</th><th>After</th><th>Change</th></tr></thead><tbody>${d.metrics.slice(0,4).map(m=>`<tr><td>${esc(m.category==='actionRates'?'Family':'Mechanic')}: ${esc(m.key)}</td><td>${pct(m.before)}</td><td>${pct(m.after)}</td><td>${(100*m.delta).toFixed(1)} pp</td></tr>`).join('')}</tbody></table></div>`:'<p>Candidate behavior telemetry unavailable; awaiting complete frozen evaluation.</p>';}
function behaviorSummary(p,root,cp){return `<div class="evo-behavior-summary"><h5>Observed behavior vs ${esc(root.agentId)}0</h5><p>Frozen control opponent, same held-out pack. Rank/suit and direct resource expenditure are unavailable.</p>${behaviorTable(behaviorDeltas(controlBehavior(p,root),controlBehavior(p,cp)))}</div>`;}
function regressions(p){return `<section id="evo-regression-summary"><h4>Observed matchup regressions</h4><p>Descriptive score drops on matching frozen samples; no catastrophic-forgetting claim.</p>${p.regressions?.length?`<div class="evo-table-scroll"><table><thead><tr><th>Checkpoint / reference</th><th>Opponent</th><th>Paired-score change</th><th>Evidence</th></tr></thead><tbody>${p.regressions.map(r=>`<tr><td><code>${r.checkpointId.slice(0,14)}</code> vs <code>${r.referenceCheckpointId.slice(0,14)}</code></td><td>${esc(r.opponent)}</td><td>${(100*r.delta).toFixed(1)} pp</td><td>${esc(r.uncertainty)}</td></tr>`).join('')}</tbody></table></div>`:'<p>No measured regression findings recorded.</p>'}<details><summary>Regression diagnostics</summary><pre>${esc(JSON.stringify(p.regressions??[],null,2))}</pre></details></section>`;}
function divergence(p){const latest=tag=>{const root=p.checkpoints.find(cp=>cp.agentId===tag&&cp.generation===0),id=p.generations.findLast(g=>g.lineageId===root.lineageId)?.selectedCheckpointId??root.checkpointId;return p.checkpoints.find(cp=>cp.checkpointId===id);};const a=latest('A'),b=latest('B');return `<section id="evo-behavior-divergence"><h4>Latest A / B measured behavior</h4><p>A${a.generation} vs B${b.generation}; frozen control opponent and matching held-out pack. Differences describe observed decisions.</p>${behaviorTable(behaviorDeltas(controlBehavior(p,a),controlBehavior(p,b)))}</section>`;}
