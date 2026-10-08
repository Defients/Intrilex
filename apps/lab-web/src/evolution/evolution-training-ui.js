import { researchRunEvidence } from './evolution-retention.mjs';
import { esc } from '../state.js';
import { LAB_IDENTITY } from './identity.mjs';
import { createTrainingProject,trainProject } from './evolution-training.mjs';
import { executeBrowserSeries } from './evolution-browser-runner.mjs';
import { attachTrainingUi } from './evolution-research-ui.js';
import { projectModel } from './evolution-view-model.mjs';

const api=attachTrainingUi(renderTraining);
function renderTraining(project,locked){
  const target=document.getElementById('evo-training-controls');if(!target)return;
  const disabled=locked?'disabled':'',training=project?.experiment.type==='EVOLUTION_TRAINING',settings=project?.experiment.scientific.training,draft=api.view.formDraft??{};
  const fields=[['generations','Generations',1,100,settings?.generations??2],['candidates','Mutations per parent',1,4,settings?.candidates??2],['step','Mutation step',1,1000,settings?.mutationStep??250],['seed','Evolution RNG seed',0,4294967295,settings?.evolutionSeed??31091],['pairs','Training pairs',1,50,settings?.trainingPairs??2]];
  target.innerHTML=`<section class="evo-workbench"><h4>Adaptive heuristic evolution · experimental V1</h4><p>TRAINING selects descendants. Held-out EVALUATION never selects or changes policy state. Browser series support at most 100 games, or 10 with deep tracing; larger browser tiers are restricted.</p><h5>New experiment scientific draft</h5><div class="toolbar">${fields.map(([key,label,min,max,value])=>`<label>${label}<input data-evo-draft-field id="evo-training-${key}" type="number" min="${min}" max="${max}" value="${esc(draft['evo-training-'+key]??value)}" ${disabled}></label>`).join('')}<button id="evo-create-training" ${disabled}>Create A0 / B0 experiment</button></div><div class="toolbar"><button id="evo-train" class="primary-button" ${!training||locked?'disabled':''}>Train / resume generations</button><p>Runs the current committed configuration. Draft inputs apply only to a new experiment.</p></div>${training?heads(project):'<p>No adaptive experiment selected. Create or load one to train.</p>'}</section>`;
  document.getElementById('evo-create-training').onclick=async()=>{try{
    const config=api.view.readConfig(),training={generations:Number(document.getElementById('evo-training-generations').value),candidates:Number(document.getElementById('evo-training-candidates').value),mutationStep:Number(document.getElementById('evo-training-step').value),evolutionSeed:Number(document.getElementById('evo-training-seed').value),trainingPairs:Number(document.getElementById('evo-training-pairs').value),evaluationPairs:Number(document.getElementById('evo-pack-pairs').value)};
    api.pickProject(createTrainingProject({identity:LAB_IDENTITY,name:document.getElementById('evo-experiment-name').value,seed:config.seed,workerCount:config.workerCount,profileId:config.profileId,training}));await api.persist();
  }catch(error){api.view.error=error.message;api.render();}};
  document.getElementById('evo-train').onclick=()=>api.execute(async(signal,p)=>{
    // Ingest the retention-marked copy (same object that is saved): evidence
    // produced here is byte-identical to a later sync of the saved run.
    await trainProject(p,executeBrowserSeries,{signal,onProgress:api.progress,onRun:async run=>{const marked=researchRunEvidence(run,api.view.progress?.mode??'EVALUATION');await api.store.save(marked);await api.view.ingestRun?.(marked);},onSave:async()=>{await api.persist();}});
    const selected=p.generations.at(-1)?.selectedCheckpointId;if(selected)api.view.selectedA=selected;
    return p.experiment.status;
  });
}
function heads(project){
  const model=projectModel(project);
  return `<p>${project.generations.length} committed lineage generations · ${project.faults.length} recorded faults</p><div class="evo-training-heads">${model.heads.map((head,i)=>{
    const best=head.generation?.selection.ranking[0],source=best?project.evaluations.find(e=>e.evaluationId===head.generation.candidateEvaluationIds[best.index]):null;
    return `<article class="evo-head evo-lineage-${i?'b':'a'}"><span class="evo-eyebrow">LINEAGE ${esc(head.root.agentId)} / GENERATION ${head.checkpoint.generation}</span><h4><button class="evo-link" data-evo-inspect="checkpoint:${head.checkpoint.checkpointId}">${esc(head.checkpoint.checkpointId.slice(0,24))}</button></h4><p class="evo-training-summary">${best?`<strong>TRAINING selection mean: ${(best.fitness*100).toFixed(1)}%</strong> · ${source?.matchups.length??'unavailable'} named opponents · ${source?.matchups.reduce((n,m)=>n+m.metrics.games,0)??'unavailable'} source games · ${head.generation.selection.disqualified.length} disqualified`:'TRAINING: no selection committed.'}</p><p>EVALUATION: ${head.evaluation?'complete frozen vector':'pending / incomplete'}. Selection fitness is not held-out strength.</p></article>`;
  }).join('')}</div><p id="evo-training-live">Current counters are available in the execution console.</p>`;
}
