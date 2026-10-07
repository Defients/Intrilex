import { mountChartInteractions } from './evolution-analytics-charts.mjs?v=943d1ec6c237';
import { LAB_IDENTITY } from './identity.mjs?v=943d1ec6c237';
import { WEIGHT_FEATURES, WEIGHT_BOUND } from './weighted-heuristic.mjs?v=943d1ec6c237';
import { esc } from '../state.js?v=943d1ec6c237';
import { projectModel, pairFor, draftWeights, shortId } from './evolution-view-model.mjs?v=943d1ec6c237';
import { overviewHtml, lineagesHtml, evidenceHtml, inspectorHtml, heldOutTrendHtml } from './evolution-cockpit-views.js?v=943d1ec6c237';
import { mountProfileWorkspace } from './profile-workspace.js?v=943d1ec6c237';

const surfaces = [['profiles','Profiles','00'],['overview','Overview','01'],['arena','Arena','02'],['evolution','Evolution','03'],['evidence','Evidence','04'],['forensics','Forensics','05'],['ledger','Ledger','06']];
export function createCockpitState() {
  let preferences={};try{preferences=JSON.parse(localStorage.getItem('intrilex.evolution.cockpit.v1')??'{}');}catch{ /* UI preferences are optional; scientific storage is separate. */ }
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) preferences = {};
  const query=new URLSearchParams(location.hash.split('?')[1]??'');
  const surface=query.get('view')??preferences.surface??'overview';
  return {surface:surfaces.some(([key])=>key===surface)?surface:'overview',evidenceMode:'evaluations',lineage:'all',from:0,to:100,search:'',findingsOnly:false,faultsOnly:false,page:0,purpose:'all',opponent:'control',inspect:query.get('inspect'),drafts:{},draftOpen:false,left:null,right:null,drawer:false,consoleExpanded:false,consolePaused:false,consoleFollow:true,events:[],lastObservation:'',lastProject:null};
}

/** Owns presentation only. Existing modules continue to own executors and storage. */
export function mountCockpit(root,{state,research,getArena,loadRun}) {
  const body=root.querySelector('.panel-body'),header=root.querySelector('.panel-header');
  const children=[...body.children],researchRoot=body.querySelector('#evo-research');
  root.classList.add('evo-cockpit');
  header.classList.add('evo-global-header');
  header.querySelector('h2').innerHTML='<span class="evo-eyebrow">INTRILEX / RESEARCH INSTRUMENT</span>Evolution Lab';
  header.querySelector('p').textContent='Frozen evidence. Independent lineages. Inspectable decisions.';
  const stopResearch=document.createElement('button');stopResearch.dataset.evoAction='stop-research';stopResearch.textContent='Stop research';stopResearch.hidden=true;header.querySelector('.toolbar').append(stopResearch);
  const context=document.createElement('div');context.className='evo-global-context';context.innerHTML='<strong id="evo-context-title">No research experiment</strong><span id="evo-context-status"></span><code id="evo-context-id"></code><span id="evo-context-origin"></span><small id="evo-context-config"></small><span id="evo-context-error" class="danger" role="alert"></span>';header.prepend(context);
  body.innerHTML=`<div class="evo-cockpit-grid"><nav class="evo-navigation" aria-label="Evolution workspaces"><div class="evo-nav-heading">WORKSPACE</div>${surfaces.map(([key,label,index])=>`<button data-evo-surface="${key}" aria-controls="evo-page-${key}"><span>${index}</span>${label}</button>`).join('')}<div class="evo-nav-foot"><button id="evo-command-open">Commands <kbd>↵</kbd></button><small>Rules ${LAB_IDENTITY.rulesVersion}<br>Engine ${LAB_IDENTITY.engineVersion}</small><button data-evo-copy="${LAB_IDENTITY.fingerprint}">Copy fingerprint</button></div></nav><div class="evo-primary"><div class="evo-searchbar"><label>Search evidence <input id="evo-cockpit-search" type="search" placeholder="Checkpoint, generation, run, finding…" value="${esc(state.search)}"></label><span>/ to focus · UI filters only</span></div><div id="evo-mode-banner"></div>${surfaces.map(([key,label])=>`<section id="evo-page-${key}" data-evo-page-surface="${key}" aria-label="${label}" tabindex="-1"></section>`).join('')}</div><aside id="evo-cockpit-inspector" class="evo-inspector" aria-label="Evidence inspector" tabindex="-1"><header><span>INSPECTOR</span><button data-evo-close-inspector aria-label="Close inspector">×</button></header><div id="evo-inspector-content"></div><p id="evo-copy-status" role="status"></p></aside></div><section class="evo-console" aria-label="Observed execution console"><header><strong>EXECUTION CONSOLE</strong><span id="evo-console-current" role="status">Idle · no execution observation</span><button data-evo-console="expand">${state.consoleExpanded?'Collapse':'Expand'}</button></header><div id="evo-console-detail"><div class="toolbar"><label class="evo-check"><input data-evo-console="follow" type="checkbox" ${state.consoleFollow?'checked':''}>Auto-follow</label><button data-evo-console="pause">${state.consolePaused?'Resume display':'Pause display'}</button><button data-evo-console="clear">Clear display buffer</button><button data-evo-console="copy">Copy observed diagnostics</button></div><p>UI reception times and existing progress/fault records. Clearing this buffer never deletes scientific evidence.</p><div id="evo-console-events" tabindex="0" aria-label="Observed execution events"></div></div></section><dialog id="evo-command-dialog" aria-labelledby="evo-command-title"><h3 id="evo-command-title">Evolution commands</h3><p>Commands reflect the current execution state.</p><div id="evo-command-list"></div><button data-evo-command-close>Close</button></dialog>`;
  const page=key=>root.querySelector(`#evo-page-${key}`);
  for(const el of children){
    if(el===researchRoot){page('evolution').append(el);continue;}
    if(el.matches('[data-testid="evo-replays"]')){page('forensics').append(el);continue;}
    if(el.matches('[data-evo-ledger]')){page('ledger').append(el);continue;}
    if(el.matches('.evo-future')||el.matches('.notice')&&!/Imported|Historical/.test(el.textContent))continue;
    if(el.id==='evo-error'){el.hidden=true;header.append(el);continue;}
    page('arena').append(el);
  }
  const arenaAdmission=[...root.querySelectorAll('#evo-page-arena input,#evo-page-arena select,#evo-page-arena button,#evo-run,#evo-resume,#evo-import')].map(element=>({element,disabled:element.disabled}));
  const researchSnapshot=()=>research.getState();
  const project=()=>{const r=researchSnapshot();return r.archive?(r.archive.contractDiagnostic?null:r.archive.artifact.payload):r.project;};
  let searchTimer=null,lastContext='',consoleRevision='';
  const savePreferences=()=>{try{localStorage.setItem('intrilex.evolution.cockpit.v1',JSON.stringify({surface:state.surface}));}catch{ /* Navigation remains available without localStorage. */ }};
  const link=()=>{const query=new URLSearchParams({view:state.surface});if(state.inspect)query.set('inspect',state.inspect);history.replaceState(null,'',`#/evolution?${query}`);};
  const selectSurface=(surface,focus=false)=>{state.surface=surface;savePreferences();link();refresh();if(focus)page(surface)?.focus();};
  const copy=async value=>{try{await navigator.clipboard.writeText(value);root.querySelector('#evo-copy-status').textContent='Copied.';}catch{root.querySelector('#evo-copy-status').textContent='Clipboard unavailable. Select and copy the visible diagnostics.';}};
  function observe() {
    const r=researchSnapshot(),a=getArena(),progress=r.progress,run=a.run;
    const cp=r.project?.checkpoints.find(c=>c.checkpointId===progress?.checkpointId);
    const elapsed=r.controller&&r.started?Math.max(0,(performance.now()-r.started)/1000):null;
    const status=progress?`Research ${r.project?.experiment.status??'IDLE'} · ${progress.mode??'Starting'} · ${cp?`generation ${cp.generation} · ${shortId(cp.checkpointId)} · `:''}${progress.opponent??''} · ${progress.completed??0}/${progress.total??'unknown'} games · ${r.attempted??0} attempted · ${r.failed??0} failed${elapsed?` · ${((r.attempted??0)/elapsed).toFixed(1)} attempted games/s`:''}${progress.packId?` · pack ${shortId(progress.packId)}`:''}`:`Arena ${run?.status??'IDLE'} · ${run?.records.length??0}/${run?.config.gameCount??'unknown'} games`;
    root.querySelector('#evo-console-current').textContent=status;
    root.querySelector('#evo-context-error').textContent=r.error||a.error||a.storageError||'';
    const observation=JSON.stringify([r.project?.experiment.status,progress?.mode,progress?.checkpointId,progress?.opponent,run?.status,r.error,a.error,r.project?.faults.length,r.project?.experiment.runIds.at(-1)]);
    if(observation!==state.lastObservation){state.lastObservation=observation;state.events.push({receivedAt:new Date().toISOString(),stage:status,checkpointId:progress?.checkpointId??null,packId:progress?.packId??null,runId:r.project?.experiment.runIds.at(-1)??run?.runId??null,error:r.error||a.error||null});state.events=state.events.slice(-100);}
    const detail=root.querySelector('#evo-console-detail');detail.hidden=!state.consoleExpanded;
    const revision=JSON.stringify([state.events.length,state.events.at(-1)?.receivedAt,state.consolePaused,state.consoleExpanded]);
    if(!state.consolePaused&&revision!==consoleRevision){consoleRevision=revision;const list=root.querySelector('#evo-console-events');list.innerHTML=state.events.map(e=>`<div><time>${esc(e.receivedAt.slice(11,19))} UTC</time><span>${esc(e.stage)}${e.error?` · ${esc(e.error)}`:''}</span>${e.runId?`<button data-evo-inspect="run:${esc(e.runId)}">${esc(shortId(e.runId))}</button>`:''}</div>`).join('');if(state.consoleFollow)list.scrollTop=list.scrollHeight;}
  }
  function refresh(kind='render') {
    const r=researchSnapshot(),p=project(),a=getArena();
    if(kind==='progress'){observe();return;}
    if(kind==='comparison'){state.surface='evidence';state.evidenceMode='comparison';state.drawer=false;link();}
    if(state.lastProject!==p?.experiment.experimentId){state.lastProject=p?.experiment.experimentId;state.page=0;state.lineage='all';state.left=r.selectedA;state.right=r.selectedB;}
    state.left=r.selectedA;state.right=r.selectedB;
    const ledger=root.querySelector('[data-evo-research-ledger]');if(ledger)page('ledger').append(ledger);
    const historical=r.archive||a.archive;
    for(const {element,disabled}of arenaAdmission)element.disabled=disabled||!!historical;
    const title=historical?'Historical inspection':p?.experiment.name??a.run?.runId??'No active experiment';
    const current=historical?'READ ONLY':r.controller?p.experiment.status:a.run?.status==='RUNNING'?'ARENA RUNNING':p?.experiment.status??a.run?.status??'IDLE';
    root.querySelector('#evo-context-title').textContent=title;root.querySelector('#evo-context-status').textContent=current;
    root.querySelector('#evo-context-error').textContent=r.error||a.error||a.storageError||'';
    root.querySelector('#evo-context-id').textContent=shortId(historical?.identity?.fingerprint??p?.experiment.scientificId??LAB_IDENTITY.fingerprint,30);
    root.querySelector('#evo-context-origin').textContent=historical?'Historical · original identity':p?.evidenceOrigin==='IMPORTED_UNVERIFIED'||a.run?.evidenceOrigin==='IMPORTED_UNVERIFIED'?'Imported · unverified':'Local · reproduction not implied';
    const config=p?.experiment.scientific.config??a.run?.config;
    root.querySelector('#evo-context-config').textContent=`${p?.experiment.type??a.run?.kind??'No experiment'} · ${config?.profileId??'Profile unavailable'} · seed ${config?.seed??'unavailable'} · workers ${p?.experiment.operational.workerCount??config?.workerCount??'unavailable'} · Engine ${historical?.identity?.engineVersion??LAB_IDENTITY.engineVersion} / Rules ${historical?.identity?.rulesVersion??LAB_IDENTITY.rulesVersion}`;
    const banner=root.querySelector('#evo-mode-banner');banner.innerHTML=historical?'<p class="evo-historical-banner">Historical — read only. Original IDs/content are preserved. Current execution is not admitted. <button data-evo-action="close-archive">Return to current work</button></p>':p?.evidenceOrigin==='IMPORTED_UNVERIFIED'?'<p class="evo-historical-banner">Imported — unverified. Structural compatibility is not independent reproduction.</p>':'';
    stopResearch.hidden=!r.controller;
    page('overview').innerHTML=r.archive?.contractDiagnostic?'<div class="evo-empty"><h3>Historical contract requires inspection</h3><p>The original artifact is preserved in Ledger. Its current contract validation failed; derived research claims are unavailable.</p><button data-evo-surface="ledger">Inspect original archive</button></div>':overviewHtml(p,a);
    let lineage=root.querySelector('#evo-lineage-workbench');if(!lineage){lineage=document.createElement('section');lineage.id='evo-lineage-workbench';page('evolution').append(lineage);}lineage.innerHTML=lineagesHtml(p,state)+heldOutTrendHtml(p);
    page('evidence').innerHTML=evidenceHtml(p,state,r.archive?null:r.comparison,!!r.controller||!!r.archive,!!r.archive);
    root.querySelector('#evo-inspector-content').innerHTML=inspectorHtml(p,state,a);
    for(const [key]of surfaces){page(key).hidden=key!==state.surface;root.querySelector(`.evo-navigation [data-evo-surface="${key}"]`).setAttribute('aria-current',key===state.surface?'page':'false');}
    root.querySelector('.evo-cockpit-grid').classList.toggle('evo-graph-space',['arena','evidence','evolution'].includes(state.surface)&&!state.inspect&&!state.drawer);
    const aside=root.querySelector('#evo-cockpit-inspector'),narrow=matchMedia('(max-width: 1100px)').matches;
    aside.classList.toggle('is-open',state.drawer);aside.setAttribute('role',narrow&&state.drawer?'dialog':'complementary');
    if(narrow&&state.drawer)aside.setAttribute('aria-modal','true');else aside.removeAttribute('aria-modal');
    for(const element of root.querySelectorAll('.evo-primary,.evo-navigation,.evo-global-header,.evo-console'))element.inert=narrow&&state.drawer;
    observe();
    if(lastContext!==current){lastContext=current;root.dataset.execution=current;}
    filterLedger();
  }
  function filterLedger(){getArena().renderHistory(state.search);research.renderHistory(state.search);}
  function selectEvidence(selection) {state.inspect=selection;if(selection.startsWith('checkpoint:'))research.select(selection.slice(11),'left');state.drawer=true;link();refresh();root.querySelector('#evo-cockpit-inspector').focus();}
  function comparePair(mode) {
    if(researchSnapshot().archive)return;
    let pair=mode==='swap'?[state.right,state.left]:pairFor(project(),mode,state.inspect?.startsWith('checkpoint:')?state.inspect.slice(11):state.left);
    if(pair.length!==2||pair.some(id=>!id))return;
    research.select(pair[0],'left');research.select(pair[1],'right');research.compare();state.evidenceMode='comparison';selectSurface('evidence');
  }
  const click=async event=>{
    const mark=event.target.closest('[data-evo-inspect]');if(mark){event.preventDefault();return selectEvidence(mark.dataset.evoInspect);}
    const b=event.target.closest('button');if(!b)return;
    if(b.dataset.evoSurface){root.querySelector('#evo-command-dialog').close();return selectSurface(b.dataset.evoSurface,true);}
    if(b.dataset.evoInspect)return selectEvidence(b.dataset.evoInspect);
    if(b.hasAttribute('data-evo-close-inspector')){state.drawer=false;state.inspect=null;link();refresh();root.querySelector('.evo-navigation [aria-current="page"]').focus();return;}
    if(b.dataset.evoEvidence){state.evidenceMode=b.dataset.evoEvidence;refresh();root.querySelector(`[data-evo-evidence="${state.evidenceMode}"]`).focus();return;}
    if(b.dataset.evoPair)return comparePair(b.dataset.evoPair);
    if(b.dataset.evoFinding){const finding=project().regressions.find(r=>r.findingId===b.dataset.evoFinding);research.select(finding.referenceCheckpointId,'left');research.select(finding.checkpointId,'right');research.compare();state.evidenceMode='comparison';selectSurface('evidence');return;}
    if(b.dataset.evoJump){const model=projectModel(project()),head=model.heads.find(h=>state.lineage==='all'||h.root.lineageId===state.lineage);if(head){state.from=b.dataset.evoJump==='latest'?Math.max(0,head.checkpoint.generation-5):0;state.to=b.dataset.evoJump==='root'?0:100;state.page=0;selectEvidence(`checkpoint:${b.dataset.evoJump==='root'?head.root.checkpointId:head.checkpoint.checkpointId}`);}return;}
    if(b.dataset.evoPage){state.page=Math.max(0,state.page+Number(b.dataset.evoPage));refresh();return;}
    if(b.dataset.evoCopy)return copy(b.dataset.evoCopy);
    if(b.hasAttribute('data-evo-copy-record'))return copy(b.nextElementSibling.textContent);
    if(b.dataset.evoLoadRun){const previous=state.surface,previousDrawer=state.drawer;try{state.drawer=false;state.surface='forensics';link();await loadRun(b.dataset.evoLoadRun);}catch(error){state.surface=previous;state.drawer=previousDrawer;link();root.querySelector('#evo-copy-status').textContent=`Run unavailable: ${error.message}. Its reference remains preserved.`;}return;}
    if(b.dataset.evoDraftReset){delete state.drafts[b.dataset.evoDraftReset];state.draftOpen=true;refresh();return;}
    if(b.dataset.evoDraftCopy){const cp=project().checkpoints.find(cp=>cp.checkpointId===b.dataset.evoDraftCopy),draft=draftWeights(cp,state.drafts[cp.checkpointId],WEIGHT_FEATURES,WEIGHT_BOUND);if(draft.valid)copy(JSON.stringify({kind:'NON_COMMITTED_UI_DRAFT',sourceCheckpointId:cp.checkpointId,weights:draft.values,executable:false},null,2));return;}
    if(b.dataset.evoConsole){if(b.dataset.evoConsole==='expand')state.consoleExpanded=!state.consoleExpanded;if(b.dataset.evoConsole==='pause')state.consolePaused=!state.consolePaused;if(b.dataset.evoConsole==='clear')state.events=[];if(b.dataset.evoConsole==='copy')copy(JSON.stringify(state.events,null,2));b.textContent=b.dataset.evoConsole==='expand'?(state.consoleExpanded?'Collapse':'Expand'):b.dataset.evoConsole==='pause'?(state.consolePaused?'Resume display':'Pause display'):b.textContent;observe();return;}
    if(b.dataset.evoAction==='evaluate')document.getElementById('evo-suite-evaluate')?.click();
    if(b.dataset.evoAction==='stop-research')document.getElementById('evo-research-stop')?.click();
    if(b.dataset.evoAction==='compare'){research.compare();state.evidenceMode='comparison';refresh();}
    if(b.dataset.evoAction==='close-archive'){research.closeArchive();getArena().closeArchive();refresh();}
    if(b.id==='evo-command-open'){
      const dialog=root.querySelector('#evo-command-dialog'),list=root.querySelector('#evo-command-list');
      const commands=[...surfaces.map(([key,label])=>({label:`Open ${label}`,surface:key})),...['evo-run','evo-pause','evo-resume','evo-stop','evo-train','evo-research-stop','evo-export','evo-export-research'].map(id=>({label:document.getElementById(id)?.textContent,id})).filter(c=>c.label&&!document.getElementById(c.id).disabled)];
      list.innerHTML=commands.map(c=>`<button ${c.surface?`data-evo-surface="${c.surface}"`:`data-evo-command="${c.id}"`}>${esc(c.label)}</button>`).join('');dialog.showModal();return;
    }
    if(b.dataset.evoCommand){root.querySelector('#evo-command-dialog').close();document.getElementById(b.dataset.evoCommand)?.click();}
    if(b.hasAttribute('data-evo-command-close'))root.querySelector('#evo-command-dialog').close();
  };
  const change=event=>{
    const el=event.target;if(el.dataset.evoFilter){state[el.dataset.evoFilter]=el.type==='checkbox'?el.checked:el.type==='number'?Math.max(0,Math.min(100,Number(el.value))):el.value;state.page=0;refresh();}
    if(el.dataset.evoSelect){research.select(el.value,el.dataset.evoSelect);refresh();}
    if(el.dataset.evoConsole==='follow')state.consoleFollow=el.checked;
  };
  const input=event=>{
    const el=event.target;if(el.id==='evo-cockpit-search'){clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.search=el.value;state.page=0;refresh();},180);}
    if(el.dataset.evoWeight){const cp=project().checkpoints.find(cp=>cp.checkpointId===el.dataset.checkpoint);state.drafts[cp.checkpointId]??={...cp.policyState.weights};state.drafts[cp.checkpointId][el.dataset.evoWeight]=el.value===''?NaN:Number(el.value);state.draftOpen=true;const draft=draftWeights(cp,state.drafts[cp.checkpointId],WEIGHT_FEATURES,WEIGHT_BOUND);for(const other of root.querySelectorAll(`[data-evo-weight="${el.dataset.evoWeight}"]`))if(other!==el)other.value=el.value;root.querySelector('#evo-draft-status').textContent=draft.valid?'Non-committed draft. Historical weights remain unchanged.':`Invalid draft: ${draft.invalid.join(', ')}`;root.querySelector('[data-evo-draft-copy]').disabled=!draft.valid;}
  };
  const keydown=event=>{
    const mark=event.target.closest('svg [data-evo-inspect]');if(mark&&['Enter',' '].includes(event.key)){event.preventDefault();return selectEvidence(mark.dataset.evoInspect);}
    const editable=event.target.closest('input,textarea,select,[contenteditable=true]');
    if(event.key==='Escape'&&state.drawer){state.drawer=false;refresh();root.querySelector('.evo-navigation [aria-current="page"]').focus();return;}
    if(event.key==='Tab'&&state.drawer&&matchMedia('(max-width: 1100px)').matches){const focusable=[...root.querySelectorAll('#evo-cockpit-inspector button:not(:disabled),#evo-cockpit-inspector input:not(:disabled),#evo-cockpit-inspector summary')];const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&(event.target===first||event.target.id==='evo-cockpit-inspector')){event.preventDefault();last?.focus();}else if(!event.shiftKey&&event.target===last){event.preventDefault();first?.focus();}}
    if(event.key==='/'&&!editable){event.preventDefault();event.stopPropagation();root.querySelector('#evo-cockpit-search').focus();}
    const tabs=event.target.closest('[role="tablist"]');if(tabs&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const buttons=[...tabs.querySelectorAll('[role="tab"]')],index=buttons.indexOf(event.target),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next].click();}
    if(event.target.closest('.evo-lineage-rail')&&!editable&&['ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();const buttons=[...root.querySelectorAll('.evo-lineage-rail [data-evo-inspect^="checkpoint:"]')],index=buttons.indexOf(event.target),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,index+(event.key==='ArrowDown'?1:-1)));buttons[next]?.focus();}
  };
  root.addEventListener('click',click);root.addEventListener('change',change);root.addEventListener('input',input);root.addEventListener('keydown',keydown);
  const resize=()=>{refresh();const inspector=root.querySelector('#evo-cockpit-inspector');if(state.drawer&&matchMedia('(max-width: 1100px)').matches&&!inspector.contains(document.activeElement))inspector.focus();};window.addEventListener('resize',resize);
  const profiles=mountProfileWorkspace(page('profiles'));
  const cleanupCharts=mountChartInteractions(root);const unsubscribe=research.subscribe(refresh);refresh();
  return {refresh,profiles,cleanup(){profiles.cleanup();cleanupCharts();unsubscribe();clearTimeout(searchTimer);root.removeEventListener('click',click);root.removeEventListener('change',change);root.removeEventListener('input',input);root.removeEventListener('keydown',keydown);window.removeEventListener('resize',resize);}};
}
