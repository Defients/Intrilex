import { researchRunEvidence } from './evolution-retention.mjs';
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
    const evaluation=p.evaluations.findLast(e=>e.candidateCheckpointId===cp.checkpointId&&e.purpose==='EVALUATION'),delta=Object.fromEntries(Object.keys(cp.policyState.weights).map(k=>[k,cp.policyState.weights[k]-root.policyState.weights[k]]));
    return `<div class="evo-bot"><h4>BOT ${tag} · generation ${cp.generation}</h4><small>${esc(cp.lineageId.slice(0,27))}</small><p><code>${cp.checkpointId.slice(0,23)}</code> · policy v${cp.policyVersion}</p><p>Frozen evaluation: ${evaluation?evaluation.matchups.map(m=>`${esc(m.opponentPolicyId)} ${m.metrics.pairedScore===null?'unavailable':(100*m.metrics.pairedScore).toFixed(1)+'%'}`).join(' · '):'pending'}</p><details><summary>Parameter deltas / recent mutation</summary><pre>${esc(JSON.stringify({delta,mutation:cp.mutation},null,2))}</pre></details><p>${generations.length} append-only selection records</p></div>`;
  };
  return `<div class="evo-arena">${bot('A')}<div class="evo-arena-mid"><strong>${p.experiment.status==='RUNNING'?'TRAINING / HELD-OUT EVALUATION':'INDEPENDENT LINEAGES'}</strong><p>${p.generations.length} committed lineage generations</p><p>${p.faults.length} experiment faults</p><p id="evo-training-live">Current execution counters appear during training/evaluation.</p></div>${bot('B')}</div>
    <details><summary>Observed matchup regressions against historical references</summary><pre>${esc(JSON.stringify(p.regressions??[],null,2))}</pre></details>`;
}

function trend(p){
  const maximum=Math.max(0,...p.generations.map(g=>g.generation)),pack=p.packs.find(x=>x.purpose==='EVALUATION');
  const series=['A','B'].map((tag,i)=>{const root=p.checkpoints.find(cp=>cp.agentId===tag&&cp.generation===0);return {label:`Bot ${tag}`,color:i?'#b495ff':'#58d8c5',values:Array.from({length:maximum+1},(_,generation)=>{const id=generation===0?root.checkpointId:p.generations.find(g=>g.lineageId===root.lineageId&&g.generation===generation)?.selectedCheckpointId;const result=p.evaluations.find(e=>e.candidateCheckpointId===id&&e.packId===pack.packId&&e.status==='COMPLETE');const score=result?.matchups.find(m=>m.opponentPolicyId==='control')?.metrics.pairedScore;return Number.isFinite(score)?100*score:null;})};});
  if(!series.some(s=>s.values.some(Number.isFinite)))return '<p>Frozen control-reference trend: awaiting baseline evaluation.</p>';
  return `<h4>Frozen paired score against control · by generation</h4>${lineChart({series,xLabels:Array.from({length:maximum+1},(_,i)=>String(i)),minValue:0,maxValue:100,yUnit:'%',ariaLabel:'A and B frozen paired score against the control checkpoint by generation'})}<p>Same held-out pack and opponent. Other matchups remain visible separately; missing evaluations leave gaps.</p>`;
}
