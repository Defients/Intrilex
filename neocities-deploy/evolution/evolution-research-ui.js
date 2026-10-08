import { acknowledgedSave, persistenceLabel } from './persistence-state.mjs?v=5e0a78513ea5';
import { esc } from '../state.js?v=5e0a78513ea5';
import { LAB_IDENTITY } from './identity.mjs?v=5e0a78513ea5';
import { createLabRun, CLEAN_REASONS } from './evolution-domain.mjs?v=5e0a78513ea5';
import { createEvaluationPack,createBaselineSuite,createExperiment,cloneExperiment,compareCheckpoints,researchEnvelope,parseResearchImport, recordEvaluation, inspectResearchArtifact } from './evolution-research.mjs?v=5e0a78513ea5';
import { evaluateSuite } from './evolution-evaluation.mjs?v=5e0a78513ea5';
import { executeBrowserSeries } from './evolution-browser-runner.mjs?v=5e0a78513ea5';
import { EvolutionStore } from './evolution-store.mjs?v=5e0a78513ea5';
import { collectExperimentEvidence } from '../experiments/experiment-controller.mjs?v=5e0a78513ea5';

const store=new EvolutionStore(LAB_IDENTITY);
const view={project:null,history:[],controller:null,error:'',progress:null,comparison:null,selectedA:null,selectedB:null,readConfig:null,serial:0,started:0,attempted:0,failed:0,archive:null,persistenceState:'SESSION_ONLY',saveRevision:0};
const busy=()=>!!view.controller;
export function researchHtml(){return '<section id="evo-research" class="evo-section" data-testid="evo-research"></section>';}
export function mountResearchPanel(readConfig,hooks={}){view.readConfig=readConfig;view.ingestRun=hooks.ingestRun??view.ingestRun??null;render();store.listResearch().then(history=>{view.history=history;render();}).catch(error=>{view.error=`Research storage: ${error.message}`;render();});}
const listeners=new Set();
const notify=(kind='render')=>{for(const listener of listeners)listener(kind);};
export const cockpitResearch={getState:()=>view,renderHistory(query){view.historyQuery=query;const el=document.getElementById('evo-research-history');if(el)el.innerHTML=researchHistoryHtml();},subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},select(id,side){if(!view.project?.checkpoints.some(cp=>cp.checkpointId===id))return;view[side==='right'?'selectedB':'selectedA']=id;const field=document.getElementById(side==='right'?'evo-checkpoint-right':'evo-checkpoint-left');if(field)field.value=id;},compare(){const p=view.project;if(!p)return;view.comparison=compareCheckpoints(p.checkpoints.find(c=>c.checkpointId===view.selectedA),p.checkpoints.find(c=>c.checkpointId===view.selectedB),p.evaluations,{packs:p.packs,suite:p.suite});notify('comparison');},closeArchive(){view.archive=null;render();}};
function render(){
  const root=document.getElementById('evo-research');if(!root)return;
  // Creation form state is UI-only and never overwrites committed scientific config.
  view.formDraft??={};for(const input of document.querySelectorAll('[data-evo-draft-field]'))view.formDraft[input.id]=input.value;
  for(const old of document.querySelectorAll('[data-evo-research-ledger]'))old.remove();
  const p=view.project,locked=busy()||!!view.archive,disabled=locked?'disabled':'',cps=p?.checkpoints??[],exp=p?.experiment,draft=view.formDraft;
  const field=(id,fallback)=>esc(draft[id]??fallback);
  const opts=selected=>cps.map(cp=>`<option value="${cp.checkpointId}" ${cp.checkpointId===selected?'selected':''}>${esc(cp.agentId)} · generation ${cp.generation} · ${cp.checkpointId.slice(0,18)}</option>`).join('');
  root.innerHTML=`<div class="evo-workspace-title"><div><span class="evo-eyebrow">RESEARCH OPERATION</span><h3>Experiments & evolution</h3><p>New scientific draft below. Committed packs and policy history stay immutable.</p></div></div>
    <p id="evo-research-error" class="danger" role="alert">${esc(view.error)}</p>
    ${p?.evidenceOrigin==='IMPORTED_UNVERIFIED'?'<p class="notice">Imported research claims are unverified. Checksums establish integrity; reproduction is separate.</p>':''}
    <section class="evo-workbench"><h4>Next experiment · scientific draft</h4><div class="toolbar"><label>Name<input data-evo-draft-field id="evo-experiment-name" maxlength="160" value="${field('evo-experiment-name',exp?.name??'Policy comparison #001')}" ${disabled}></label>
    <label>New experiment type<select data-evo-draft-field id="evo-experiment-type" ${disabled}>${['SELF_PLAY','POLICY_COMPARISON','CHECKPOINT_EVALUATION'].map(t=>`<option ${t===(draft['evo-experiment-type']??exp?.type)?'selected':''}>${t}</option>`).join('')}</select></label>
    <label>Hypothesis<input data-evo-draft-field id="evo-experiment-hypothesis" value="${field('evo-experiment-hypothesis',exp?.hypothesis??'')}" ${disabled}></label>
    <label>New held-out pairs<input data-evo-draft-field id="evo-pack-pairs" type="number" min="1" max="5000" value="${field('evo-pack-pairs',p?.packs.find(x=>x.purpose==='EVALUATION')?.seeds.length??2)}" ${disabled}></label>
    <label>Clone series seed (blank preserves)<input data-evo-draft-field id="evo-clone-seed" type="number" min="0" max="4294967295" placeholder="Preserve parent" value="${field('evo-clone-seed','')}" ${disabled}></label><button id="evo-create-experiment" class="secondary-button" ${disabled}>Create experiment</button><button id="evo-clone-experiment" class="secondary-button" ${!p||locked?'disabled':''}>Clone experiment</button></div><p>Rules profile, game seed and worker count come from Arena configuration. Workers are operational; frozen seed pools change only through new experiment creation.</p></section>
    ${p?`<section class="evo-workbench"><header><h4>${esc(exp.name)} · ${esc(exp.type)}</h4><span id="evo-research-state" role="status">${esc(exp.status)} · ${esc(persistenceLabel(view.persistenceState))}</span></header><code class="evo-hash">${exp.scientificId}</code>
    <details><summary>Committed scientific configuration · read only</summary><pre>${esc(JSON.stringify({scientific:exp.scientific,packs:p.packs.map(pack=>({packId:pack.packId,purpose:pack.purpose,seeds:pack.seeds,provenance:pack.provenance})),operational:exp.operational},null,2))}</pre></details>
    <details><summary>Changes from parent · ${exp.changes.length}</summary><pre>${esc(JSON.stringify({parentExperimentId:exp.parentExperimentId,changes:exp.changes},null,2))}</pre></details>
    <div class="toolbar"><label>Candidate / left checkpoint<select id="evo-checkpoint-left">${opts(view.selectedA)}</select></label><label>Right checkpoint<select id="evo-checkpoint-right">${opts(view.selectedB)}</select></label>
    <button id="evo-execute-experiment" class="secondary-button" ${locked||exp.type==='EVOLUTION_TRAINING'?'disabled':''}>Execute experiment</button><button id="evo-suite-evaluate" class="secondary-button" ${disabled}>Run frozen suite</button><button id="evo-compare-checkpoints" class="secondary-button">Compare checkpoints</button><button id="evo-research-stop" class="secondary-button" ${busy()?'':'disabled'}>Stop research run</button></div><p id="evo-research-progress" role="status">${progressText()}</p></section>`:''}
    <div id="evo-training-controls"></div>
    <section data-evo-research-ledger class="evo-workbench"><h3>Research ledger & portability</h3>
    ${view.archive?`<section id="evo-research-archive" class="evo-historical-banner"><h4>Historical research — read only</h4><p>Original identity ${esc(view.archive.identity.fingerprint)} · ${view.archive.checkpointIds.length} original checkpoints. Imported claims remain unverified. Execution is not admitted.</p><p>Current contract: ${esc(view.archive.contractDiagnostic??'structurally valid under recorded identity')}.</p><details><summary>Original checkpoint IDs</summary><pre>${esc(JSON.stringify(view.archive.checkpointIds,null,2))}</pre></details><button id="evo-export-research-archive">Export original archive content</button></section>`:''}
    ${p?`<label>Developer conclusions<textarea id="evo-experiment-conclusions" maxlength="10000" ${disabled}>${esc(exp.conclusions)}</textarea></label><button id="evo-save-conclusions" ${disabled}>Save conclusions</button><div class="toolbar"><button id="evo-export-research">Export research artifact</button><button id="evo-save-research" ${disabled}>Save experiment</button></div>`:''}
    <label>Inspect historical research<input id="evo-archive-research" type="file" accept="application/json,.json" ${busy()?'disabled':''}></label><label>Import research artifact<input id="evo-import-research" type="file" accept="application/json,.json" ${busy()?'disabled':''}></label>
    <div id="evo-research-history">${researchHistoryHtml()}</div></section>`;
  bind();view.renderTraining?.(p,locked);notify();
}
function researchHistoryHtml(){const query=(view.historyQuery??'').toLowerCase(),rows=view.history.filter(h=>!query||JSON.stringify(h).toLowerCase().includes(query));return (rows.length?`<p>${rows.length} matching experiments; first 50 shown. Search all saved metadata to narrow.</p>`+rows.slice(0,50).map(h=>`<div class="evo-replay-row"><span>${esc(h.name)} · ${esc(h.status)}<br><code>${esc(h.scientificId)}</code><br><code>${esc(h.experimentId)}</code></span><button data-load-experiment="${h.experimentId}" ${busy()?'disabled':''}>Load experiment</button><button data-inspect-experiment="${h.experimentId}" ${busy()?'disabled':''}>Inspect archive</button></div>`).join(''):'<p>No matching saved research operations. Create an experiment, import evidence or adjust search.</p>')+campaignExperimentsHtml();}
// Campaign experiments persist in the experiment evidence store — the
// research ledger lists them so an experiment with durable runs is never
// reported as "no matching saved experiments".
function campaignExperimentsHtml(){
  let ev=null;try{ev=collectExperimentEvidence();}catch{return '';}
  // Only render when campaign evidence actually exists — the bundled
  // certified corpus alone does not make a saved experiment.
  if(!ev?.available||(!ev.runs.some(r=>r.origin!=='bundled')&&!ev.incompleteRunCount))return '';
  // 'persisted' is all this synchronous render can know — a stored record
  // is not a verified durable artifact; that claim belongs to
  // Verify artifacts / dossier export (hash-chain verification).
  const persisted=ev.runs.filter(r=>r.persistence==='persisted'&&r.origin!=='bundled').length;
  return `<div id="evo-research-campaigns" data-testid="evo-research-campaigns"><h4>Campaign experiments — experiment evidence store</h4><div class="evo-replay-row"><span><b>${esc(ev.experimentId??'Experiment')}</b> · ${ev.totalRuns} run${ev.totalRuns===1?'':'s'} · ${ev.includedRunCount} included · ${esc(String(ev.includedGames??0))} games in analysis · ${persisted} persisted record${persisted===1?'':'s'}${ev.incompleteRunCount?` · ${ev.incompleteRunCount} incomplete/resumable`:''}${ev.corruptCount+ev.quarantinedCount+ev.payloadUnavailableCount?` · <span class="danger">${ev.corruptCount+ev.quarantinedCount+ev.payloadUnavailableCount} integrity-blocked</span>`:''}</span></div></div>`;
}
function progressText(){const x=view.progress,cp=view.project?.checkpoints.find(c=>c.checkpointId===x?.checkpointId),gps=view.started ? view.attempted/((performance.now()-view.started)/1000) : 0;return x?`${x.mode} · generation ${cp?.generation??'—'} · ${x.opponent??''} · ${x.completed??0}/${x.total??0} suite games · ${view.attempted} attempts / ${view.failed} failed in this execution · ${gps.toFixed(2)} games/sec · ${x.packId?.slice(0,18)??''}`:'No research execution active.';}
function pickProject(p,{savedLocally=false}={}){++view.saveRevision;view.persistenceState=savedLocally?'LOCALLY_COMMITTED':'SESSION_ONLY';view.project=p;view.archive=null;view.progress=null;view.started=0;view.attempted=0;view.failed=0;view.selectedA=p.checkpoints[0]?.checkpointId;view.selectedB=p.checkpoints[1]?.checkpointId;view.comparison=null;view.error='';render();}
async function persist(){
  if(!view.project)return;
  const owner=view.project,snapshot=structuredClone(owner),revision=++view.saveRevision;
  const updateState=state=>{if(view.project===owner && view.saveRevision===revision){view.persistenceState=state;render();}};
  await acknowledgedSave(()=>store.saveResearch(snapshot),updateState);
  view.history=await store.listResearch();render();
}
function bind(){
  document.getElementById('evo-archive-research')?.addEventListener('change',async e=>{try{const file=e.target.files?.[0];if(!file)return;if(file.size>40*1024*1024)throw new Error('IMPORT_TOO_LARGE');view.archive=inspectResearchArtifact(await file.text());view.error='';render();}catch(error){view.error=error.message;render();}});
  document.getElementById('evo-export-research-archive')?.addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(view.archive.artifact)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='evolution-research-archive.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  const click=(id,fn)=>document.getElementById(id)?.addEventListener('click',()=>Promise.resolve().then(fn).catch(error=>{view.error=error.message;render();}));
  click('evo-create-experiment',async()=>{
    const config=view.readConfig(),pack=createEvaluationPack({identity:LAB_IDENTITY,baseSeed:config.seed,pairCount:Number(document.getElementById('evo-pack-pairs').value),profileId:config.profileId}),suite=createBaselineSuite(LAB_IDENTITY),checkpoints=createLabRun(config,LAB_IDENTITY).checkpoints;
    const experiment=createExperiment({identity:LAB_IDENTITY,name:document.getElementById('evo-experiment-name').value,hypothesis:document.getElementById('evo-experiment-hypothesis').value,type:document.getElementById('evo-experiment-type').value,config,startingCheckpoints:checkpoints,seedPackId:pack.packId,evaluationSuiteId:suite.suiteId});
    pickProject({schemaVersion:1,experiment,packs:[pack],suite,checkpoints,generations:[],evaluations:[],faults:[]});await persist();
  });
  click('evo-clone-experiment',async()=>{const old=view.project,seed=document.getElementById('evo-clone-seed').value;if(seed!=='' && old.experiment.type==='EVOLUTION_TRAINING')throw new Error('Training clones preserve their frozen seed packs; create a new training experiment for different seed pools.');const experiment=cloneExperiment(old.experiment,{config:seed===''?{}:{seed:Number(seed)},name:document.getElementById('evo-experiment-name').value+' — clone'});pickProject({...structuredClone(old),experiment,generations:[],evaluations:[],regressions:[],faults:[]});await persist();});
  document.getElementById('evo-checkpoint-left')?.addEventListener('change',e=>{view.selectedA=e.target.value;});document.getElementById('evo-checkpoint-right')?.addEventListener('change',e=>{view.selectedB=e.target.value;});
  click('evo-compare-checkpoints',()=>cockpitResearch.compare());
  click('evo-suite-evaluate',()=>execute(async(signal,p)=>{const result=await evaluateSuite({candidate:p.checkpoints.find(c=>c.checkpointId===view.selectedA),suite:p.suite,pack:p.packs.find(x=>x.purpose==='EVALUATION'),workerCount:p.experiment.operational.workerCount},executeBrowserSeries,{signal,onProgress:progress,onRun:async run=>{if(!p.experiment.runIds.includes(run.runId))p.experiment.runIds.push(run.runId);await store.save(run);await view.ingestRun?.(run);}});recordEvaluation(p,result);return result.status;}));
  click('evo-execute-experiment',()=>{
    if(view.project.experiment.type==='CHECKPOINT_EVALUATION'){document.getElementById('evo-suite-evaluate').click();return;}
    return execute(async(signal,p)=>{
      const e=p.experiment,startingCheckpoints=e.scientific.startingCheckpointIds.map(id=>p.checkpoints.find(cp=>cp.checkpointId===id));
      const result=await executeBrowserSeries({...e.scientific.config,workerCount:e.operational.workerCount},{identity:LAB_IDENTITY,startingCheckpoints,signal,onProgress:x=>progress({...x,mode:e.type})});
      await store.save(result.run);await view.ingestRun?.(result.run);e.runIds.push(result.run.runId);p.lastRunSummary=result.metrics;return result.run.status;
    });
  });
  click('evo-research-stop',()=>view.controller?.abort());click('evo-save-research',persist);click('evo-save-conclusions',async()=>{view.project.experiment.conclusions=document.getElementById('evo-experiment-conclusions').value;await persist();});
  click('evo-export-research',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(researchEnvelope(view.project))],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`${view.project.experiment.experimentId}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  document.getElementById('evo-import-research')?.addEventListener('change',async e=>{try{const file=e.target.files?.[0];if(!file)return;if(file.size>40*1024*1024)throw new Error('IMPORT_TOO_LARGE');pickProject(parseResearchImport(await file.text(),LAB_IDENTITY));await persist();}catch(error){view.error=error.message;render();}});
  document.getElementById('evo-research-history')?.addEventListener('click',async e=>{try{const b=e.target.closest('[data-load-experiment]');if(b&&!busy())pickProject(await store.loadResearch(b.dataset.loadExperiment),{savedLocally:true});const archive=e.target.closest('[data-inspect-experiment]');if(archive&&!busy()){view.archive=inspectResearchArtifact(await store.read('research',archive.dataset.inspectExperiment));render();}}catch(error){view.error=error.message;render();}});
}
function progress(x){view.progress=x;if(x.record){view.attempted++;if(!CLEAN_REASONS.includes(x.record.terminationReason))view.failed++;}const value=progressText();for(const id of ['evo-research-progress','evo-training-live']){const el=document.getElementById(id);if(el)el.textContent=value;}notify('progress');}
async function execute(fn){if(busy()||!view.project||view.archive)return;const owner=view.project,controller=new AbortController(),serial=++view.serial;view.controller=controller;view.progress=null;view.started=performance.now();view.attempted=0;view.failed=0;owner.experiment.status='RUNNING';view.error='';render();try{owner.experiment.status=await fn(controller.signal,owner);}catch(error){owner.experiment.status='ERROR';owner.faults.push({message:String(error.stack??error).slice(0,2000),experimentId:owner.experiment.experimentId});view.error=error.message;}finally{if(view.serial===serial){view.controller=null;await persist().catch(error=>{view.error=`Save failed: ${error.message}. Export research before leaving.`;});render();}}}
export function cleanupResearchPanel(){view.controller?.abort();}
export function attachTrainingUi(renderTraining){view.renderTraining=renderTraining;return {view,render,persist,pickProject,execute,progress,store};}
