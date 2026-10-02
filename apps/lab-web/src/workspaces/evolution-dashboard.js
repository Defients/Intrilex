import { app, esc, fmt } from '../state.js';
import { lineChart } from '../chart-toolkit.js';
import { createSeriesAggregator, ingestGameRecord, seriesMetrics, pushChartSample } from '../evolution/evolution-core.mjs';
import { createLabRun, labConfig, gamePlan, FROZEN_POLICIES, LAB_LIMITS, artifactEnvelope, summarizeRecords, validateArtifact } from '../evolution/evolution-domain.mjs';
import { EvolutionSession } from '../evolution/evolution-session.mjs';
import { LAB_IDENTITY } from '../evolution/identity.mjs';
import { EvolutionStore, parseLabImport } from '../evolution/evolution-store.mjs';

const store = new EvolutionStore(LAB_IDENTITY);
const view = { config: { botA:'score-rush', botB:'control', gameCount:1000, seed:1337, workerCount:2, mirrorSeats:true, profileId:'core-advanced-authority' },
  session:null, workers:[], timers:new Map(), tick:null, start:0, elapsed:0, agg:createSeriesAggregator(), samples:[],
  history:[], storageError:'', error:'', mounted:false, inspection:null, inspectionWorker:null, inspectionTimer:null, step:0, saveChain:Promise.resolve() };
const run = () => view.session?.run;
const status = () => run()?.status ?? 'IDLE';
const active = () => ['RUNNING','PAUSED'].includes(status());
const elapsed = () => view.elapsed+(status() === 'RUNNING' ? performance.now()-view.start : 0);
const pct = n => Number.isFinite(n) ? `${(n*100).toFixed(1)}%` : '—';
const num = n => Number.isFinite(n) ? n.toFixed(2) : '—';
const name = id => id.replaceAll('-',' ').replace(/\b\w/g,c => c.toUpperCase());
const options = selected => FROZEN_POLICIES.map(id => `<option value="${id}" ${id === selected ? 'selected' : ''}>${name(id)} · frozen</option>`).join('');
const text = (id,value) => { const el=document.getElementById(id); if (el) el.textContent=value; };

export function renderEvolutionLab() {
  view.mounted=true;
  const cfg=run()?.config ?? view.config, disabled=active() ? 'disabled' : '', m=seriesMetrics(view.agg,elapsed());
  app.innerHTML=`<section class="panel evo-panel" data-testid="evolution-lab">
    <div class="panel-header"><div><h2>Evolution Lab</h2><p>Reproducible games, frozen checkpoints, and a separate evaluation arena.</p></div>
      <div class="toolbar"><span id="evo-state" class="evo-state evo-state-${status().toLowerCase()}" role="status" data-testid="evo-state">${status()}</span>
      <button id="evo-run" class="primary-button" data-testid="evo-run" ${disabled}>Run Series</button>
      <button id="evo-pause" class="secondary-button" ${status() === 'RUNNING' ? '' : 'disabled'}>Pause</button>
      <button id="evo-resume" class="secondary-button" ${status() === 'PAUSED' ? '' : 'disabled'}>Resume</button>
      <button id="evo-stop" class="secondary-button" data-testid="evo-stop" ${active() ? '' : 'disabled'}>Stop</button>
      <button id="evo-reset" class="ghost-button" data-testid="evo-reset" ${disabled}>Reset</button></div></div>
    <div class="panel-body"><div class="notice">Adaptive learning is NOT ENABLED. The shipped random/legal and heuristic policies remain frozen. All rule execution uses the authoritative engine. HybriX admission awaits separate reproducibility checks.</div>
    <p id="evo-error" class="danger" role="alert">${esc(view.error)}</p>
    ${run()?.evidenceOrigin === 'IMPORTED_UNVERIFIED' ? '<div class="notice">Imported evidence: checksums and compatibility passed. Outcome claims have not been independently reproduced. Replay inspection verifies one retained command sequence at a time.</div>' : ''}
    <div class="evo-config" data-testid="evo-config"><div class="evo-vs-grid">
      <label class="evo-bot-select">Bot A<select id="evo-bot-a" ${disabled}>${options(cfg.botA)}</select></label><div class="evo-vs">vs</div>
      <label class="evo-bot-select">Bot B<select id="evo-bot-b" ${disabled}>${options(cfg.botB)}</select></label></div>
      <div class="evo-config-row"><label class="field">Games<input id="evo-games" type="number" min="1" max="10000" step="1" value="${cfg.gameCount}" ${disabled}></label>
      <label class="field">Seed (0 becomes 1)<input id="evo-seed" type="number" min="0" max="4294967295" step="1" value="${cfg.seed}" ${disabled}></label>
      <label class="field">Workers<select id="evo-workers" ${disabled}>${[1,2,4].map(n => `<option ${n === cfg.workerCount ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="field">Rules profile<select id="evo-profile" ${disabled}>${[['core-advanced-authority','Advanced Core'],['core-unrestricted-authority','Unrestricted Core'],['first-contact-trigger-closure','Complete First Contact']].map(([id,label]) => `<option value="${id}" ${cfg.profileId === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label class="field evo-mirror">Paired seats · same seed AB/BA<input id="evo-mirror" type="checkbox" ${cfg.mirrorSeats ? 'checked' : ''} ${disabled}></label></div></div>
    <div class="evo-arena" data-testid="evo-arena">${bot('A',cfg.botA,m.winsA,m.winPctA)}<div class="evo-arena-mid">
      <strong>${run()?.kind === 'EVALUATION' ? 'FROZEN EVALUATION' : 'SELF-PLAY RECORD'}</strong><p id="evo-progress-count">${fmt(m.gamesCompleted)} / ${fmt(cfg.gameCount)}</p>
      <div class="evo-progress-track"><div class="evo-progress-fill" id="evo-progress-fill" style="width:${100*m.gamesCompleted/cfg.gameCount}%"></div></div>
      <p><span id="evo-elapsed">${num(elapsed()/1000)}</span>s · <span id="evo-gps">${num(m.gamesPerSec)}</span> games/sec</p></div>${bot('B',cfg.botB,m.winsB,m.winPctB)}</div>
    <div class="evo-metrics" data-testid="evo-metrics">${Object.entries(metricValues(m)).map(([key,value]) => `<div class="metric-card"><small>${key}</small><div class="metric-value" data-evo-metric="${key}">${value}</div></div>`).join('')}</div>
    <div class="evo-chart-wrap"><h3>${run()?.kind === 'EVALUATION' ? 'Evaluation' : 'Self-play'} cumulative win record</h3><div id="evo-chart" data-testid="evo-chart">${chart()}</div><p>Arrival-order observations; final evidence is sorted by game ordinal. Aborted games are excluded.</p></div>
    <section class="evo-section" data-testid="evo-benchmarks"><h3>Frozen benchmark arena</h3><p>Evaluate either selected bot against a shipped reference. This is measured performance for a reproducible seed suite, not a universal rating or an improvement claim.</p>
      <div class="toolbar"><label>Reference<select id="evo-baseline" ${disabled}>${options('random-legal')}</select></label><label>Evaluation games (even)<input id="evo-eval-games" type="number" min="2" max="10000" step="2" value="100" ${disabled}></label>
      <button id="evo-evaluate-a" class="secondary-button" ${disabled}>Evaluate A</button><button id="evo-evaluate-b" class="secondary-button" ${disabled}>Evaluate B</button></div>
      <div id="evo-evaluation-results">${details()}</div></section>
    <section class="evo-section" data-testid="evo-checkpoints"><h3>Immutable checkpoint history</h3><p>Generation 0 · frozen implementation · independent A/B lineage IDs.</p>
      ${run() ? run().checkpoints.map(c => `<div class="evo-checkpoint"><b>${esc(c.policyId)}</b> · v${esc(c.policyVersion)}<br><code>${esc(c.checkpointId)}</code><br><small>${esc(c.lineageId)} · protected baseline · ${esc(c.createdAt)}</small></div>`).join('') : '<p>Starting checkpoints are created with a run.</p>'}</section>
    <section class="evo-section" data-testid="evo-replays"><h3>Replay forensics</h3><p>Up to ${LAB_LIMITS.replays} full command sequences retained per run. Aborted games can replace unbookmarked normal samples. All slim records retain seed, checkpoint and state/action hashes; other games can be rerun by ordinal and configuration.</p>
      <div id="evo-replay-list">${replayList()}</div><div id="evo-inspection" aria-live="polite">${inspectionHtml()}</div></section>
    <section class="evo-section"><h3>Developer artifacts</h3><p>IndexedDB on this browser origin. Saves occur every 250 games, and on pause, stop, completion or bookmarks. Export for portable evidence.</p>
      <div class="toolbar"><button id="evo-export" class="secondary-button" ${run() ? '' : 'disabled'}>Export artifact</button>
      <label class="secondary-button">Import artifact<input id="evo-import" type="file" accept="application/json,.json" ${disabled}></label><button id="evo-history-refresh" class="ghost-button">Refresh history</button></div>
      <p id="evo-storage" role="status">${esc(view.storageError || storageSummary())}</p><div id="evo-history">${historyHtml()}</div>
      <p>Rules ${LAB_IDENTITY.rulesVersion} · engine ${LAB_IDENTITY.engineVersion}<br><code class="evo-hash">${LAB_IDENTITY.fingerprint}</code></p></section>
    <div class="evo-future" data-testid="evo-future"><span>Coming later:</span>${['Evolution','Lineages','Hall of Fame','Balance Lab'].map(n => `<span class="evo-future-chip">${n}</span>`).join('')}</div></div></section>`;
  bind(); refreshHistory();
}
function bot(seat,policy,wins,rate) { return `<div class="evo-bot"><h3>BOT ${seat}</h3><b>${name(policy)}</b><p>Generation 0 · frozen policy</p><p><span id="evo-${seat}-wins">${fmt(wins)}</span> wins · <span id="evo-${seat}-rate">${pct(rate)}</span></p></div>`; }
function metricValues(m) { return {'Completed':fmt(m.gamesClean),'Draws':fmt(m.draws),'Aborted / errors':fmt(m.aborted),'Avg score diff':num(m.avgScoreDiff),'Avg turns':num(m.avgTurns),'Avg decisions':num(m.avgDecisions),'First-player win':pct(m.seat1WinPct),'Second-player win':pct(m.seat2WinPct)}; }
function chart() {
  if (!view.samples.length) return '<p>Run a series to collect observations.</p>';
  return lineChart({series:[{label:'Bot A',color:'#58d8c5',values:view.samples.map(s => s.a)},{label:'Bot B',color:'#b495ff',values:view.samples.map(s => s.b)}],xLabels:view.samples.map(s => String(s.n)),minValue:0,maxValue:100,yUnit:'%',ariaLabel:'Cumulative frozen policy win rates'});
}
function details() {
  if (!run()?.records.length) return '<p>No results yet.</p>';
  const m=summarizeRecords(run().records), ci=m.pairedScoreInterval95;
  return `<p><strong>${run().kind === 'EVALUATION' ? 'EVALUATED PERFORMANCE' : 'SELF-PLAY PERFORMANCE'}</strong> · ${m.clean} clean / ${m.games} attempted · ${m.aborted} aborted.</p>
    <p>${m.pairCount} complete seed pairs · paired score ${pct(m.pairedScore)}${ci ? ` · conservative 95% bounds ${pct(ci[0])}–${pct(ci[1])}` : ''} · ${m.uncertainty}.</p>
    <p>Mean score margin ${num(m.meanScoreDifference)} · median ${num(m.medianScoreDifference)} · variance ${num(m.scoreVariance)} · mean mini-turns ${num(m.meanMiniTurns)}.</p>
    <p>Draws score ½. Bounds use complete seed-pair averages and assume independent sampled seeds. A fixed seed catalog describes that catalog.</p>
    <details><summary>Observed action families / failure reasons</summary><pre>${esc(JSON.stringify({actionCounts:m.actionCounts,abortReasons:m.abortReasons},null,2))}</pre></details>`;
}
function replayList() { return run()?.replays.length ? run().replays.map(r => {
  const g=run().records.find(g => g.ordinal === r.ordinal), marked=run().bookmarks.includes(r.replayId);
  return `<div class="evo-replay-row"><span>Game ${r.ordinal+1} · seed ${g.seed} · ${esc(g.terminationReason)}</span><button class="ghost-button" data-inspect="${r.replayId}">Inspect / verify</button><button class="ghost-button" data-bookmark="${r.replayId}" aria-pressed="${marked}">${marked ? '★ Bookmarked' : '☆ Bookmark'}</button></div>`;
}).join('') : '<p>No retained replay samples.</p>'; }
function inspectionHtml() {
  const x=view.inspection;
  if (!x) return ''; if (x.error) return `<p class="danger">${esc(x.error)}</p>`; if (!x.steps) return '<p>Re-executing commands through the engine…</p>';
  return `<p><strong>VERIFIED</strong> · seed/initial state and final hash match · ${x.steps.length-1} commands</p><div class="toolbar"><button id="evo-prev" class="ghost-button" ${view.step ? '' : 'disabled'}>Previous</button><label>Command<input id="evo-step" type="range" min="0" max="${x.steps.length-1}" value="${view.step}"></label><button id="evo-next" class="ghost-button" ${view.step === x.steps.length-1 ? 'disabled' : ''}>Next</button></div><pre>${esc(JSON.stringify(x.steps[view.step],null,2))}</pre><code class="evo-hash">${esc(x.finalStateHash)}</code>`;
}
function storageSummary() { return `${view.history.length} saved runs · ${(view.history.reduce((s,r) => s+(r.bytes ?? 0),0)/1048576).toFixed(2)} MiB in lab artifacts`; }
function historyHtml() { return view.history.length ? view.history.slice(0,20).map(h => `<div class="evo-replay-row"><span>${esc(h.kind)} · ${esc(h.botA)} / ${esc(h.botB)} · ${h.games} games · ${esc(h.status)} · ${esc(h.createdAt)}</span><button class="ghost-button" data-load-run="${esc(h.runId)}" ${active() ? 'disabled' : ''}>Load</button></div>`).join('') : '<p>No saved lab runs.</p>'; }
async function refreshHistory() {
  try { view.history=await store.list(); } catch(error) { view.storageError=`Storage unavailable: ${error.message}. Results remain in memory; export before leaving.`; }
  if (!view.mounted) return; text('evo-storage',view.storageError || storageSummary());
  const el=document.getElementById('evo-history'); if (el) el.innerHTML=historyHtml();
}
function persist() {
  if (!run()) return Promise.resolve();
  const snapshot=structuredClone(run()); snapshot.elapsedMs=elapsed();
  view.saveChain=view.saveChain.then(() => store.save(snapshot)).then(() => { view.storageError=''; return refreshHistory(); }).catch(error => {
    view.storageError=`Save failed: ${error.message}. Export this run before leaving.`; if (view.mounted) text('evo-storage',view.storageError);
  }); return view.saveChain;
}
function readConfig() { return {botA:document.getElementById('evo-bot-a').value,botB:document.getElementById('evo-bot-b').value,gameCount:Number(document.getElementById('evo-games').value),seed:Number(document.getElementById('evo-seed').value),workerCount:Number(document.getElementById('evo-workers').value),mirrorSeats:document.getElementById('evo-mirror').checked,profileId:document.getElementById('evo-profile').value}; }
function bind() {
  const click=(id,fn) => document.getElementById(id)?.addEventListener('click',fn);
  click('evo-run',() => begin('SELF_PLAY')); click('evo-evaluate-a',() => begin('EVALUATION','A')); click('evo-evaluate-b',() => begin('EVALUATION','B'));
  click('evo-pause',pause); click('evo-resume',launch); click('evo-stop',stop);
  click('evo-reset',() => { if (!active()) { release(); view.session=null; view.agg=createSeriesAggregator(); view.samples=[]; view.elapsed=0; view.error=''; view.inspection=null; renderEvolutionLab(); } });
  click('evo-history-refresh',refreshHistory);
  click('evo-export',() => { if (!run()) return; const copy=structuredClone(run()); copy.elapsedMs=elapsed(); const url=URL.createObjectURL(new Blob([JSON.stringify(artifactEnvelope(copy))],{type:'application/json'})); const a=document.createElement('a'); a.href=url; a.download=`${copy.runId}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); });
  document.getElementById('evo-import')?.addEventListener('change',async e => {
    if (active()) return; try { const file=e.target.files?.[0]; if (!file) return; if (file.size > LAB_LIMITS.importBytes) throw new Error('IMPORT_TOO_LARGE'); loadRun(parseLabImport(await file.text(),LAB_IDENTITY)); await persist(); }
    catch(error) { view.error=`Import rejected: ${error.message}`; renderEvolutionLab(); }
  });
  document.getElementById('evo-replay-list')?.addEventListener('click',e => {
    const inspect=e.target.closest('[data-inspect]'), bookmark=e.target.closest('[data-bookmark]'); if (inspect) inspectReplay(inspect.dataset.inspect);
    if (bookmark && run()) { const id=bookmark.dataset.bookmark,i=run().bookmarks.indexOf(id); if (i < 0) run().bookmarks.push(id); else run().bookmarks.splice(i,1); bookmark.textContent=i < 0 ? '★ Bookmarked' : '☆ Bookmark'; bookmark.setAttribute('aria-pressed',String(i < 0)); persist(); }
  });
  document.getElementById('evo-history')?.addEventListener('click',async e => { const b=e.target.closest('[data-load-run]'); if (!b || active()) return; try { loadRun(await store.load(b.dataset.loadRun)); } catch(error) { view.error=`Load rejected: ${error.message}`; renderEvolutionLab(); } });
  bindInspection();
}
function loadRun(saved) {
  release(); view.session=new EvolutionSession(saved); view.elapsed=saved.elapsedMs; view.error=''; view.inspection=null; view.agg=createSeriesAggregator(); view.samples=[];
  for (const r of [...saved.records].sort((a,b) => a.ordinal-b.ordinal)) { ingestGameRecord(view.agg,r); pushChartSample(view.samples,view.agg); } view.config={...saved.config}; renderEvolutionLab();
}
function begin(kind,candidate) {
  if (active()) return;
  try { const input=readConfig(); if (kind === 'EVALUATION') { input.botA=candidate === 'B' ? input.botB : input.botA; input.botB=document.getElementById('evo-baseline').value; input.gameCount=Number(document.getElementById('evo-eval-games').value); input.mirrorSeats=true; }
    const config=labConfig({...input,kind}); if (run()) persist(); release(); view.session=new EvolutionSession(createLabRun(config,LAB_IDENTITY)); view.config=config; view.elapsed=0; view.agg=createSeriesAggregator(); view.samples=[]; view.error=''; view.inspection=null; persist(); launch();
  } catch(error) { view.error=`Configuration rejected: ${error.message}`; renderEvolutionLab(); }
}
function launch() {
  if (!view.session || !['IDLE','PAUSED'].includes(status())) return;
  try { validateArtifact(artifactEnvelope(run()),LAB_IDENTITY); }
  catch(error) { view.error=`Resume rejected: ${error.message}`; renderEvolutionLab(); return; }
  const owner=view.session, epoch=owner.start(); view.start=performance.now();
  try { for (let i=0;i<run().config.workerCount;i+=1) {
    const worker=new Worker('worker.js',{type:'module'}); view.workers.push(worker);
    worker.onmessage=e => {
      const x=e.data; if (view.session !== owner || x.epoch !== epoch || status() !== 'RUNNING') return;
      try { if (x.type === 'evolution-fault') throw new Error(x.error); if (x.type !== 'evolution-evidence') return;
        if (!view.session.accept(i,epoch,x.evidence)) return;
        clearTimeout(view.timers.get(i)); view.timers.delete(i); ingestGameRecord(view.agg,x.evidence.record); pushChartSample(view.samples,view.agg);
        if (run().records.length % 250 === 0) persist(); if (status() === 'COMPLETE') { finish(); return; } dispatch(worker,i,epoch);
      } catch(error) { failRun(error); }
    };
    worker.onerror=e => { if (view.session === owner && epoch === owner.epoch && status() === 'RUNNING') failRun(new Error(e.message || 'WORKER_FAILED')); }; dispatch(worker,i,epoch);
  } renderEvolutionLab(); view.tick=setInterval(updateLive,500); } catch(error) { failRun(error); }
}
function dispatch(worker,index,epoch) {
  const ordinal=view.session.claim(index); if (ordinal === null) return; const r=run();
  worker.postMessage({type:'run-evolution-game',workerIndex:index,epoch,ordinal,retainReplay:ordinal < LAB_LIMITS.replays,run:{runId:r.runId,config:r.config,identity:r.identity,checkpoints:r.checkpoints}});
  view.timers.set(index,setTimeout(() => failRun(new Error(`WORKER_TIMEOUT: ordinal ${ordinal}, seed ${gamePlan(r.config,ordinal).seed}, run ${r.runId}`)),30000));
}
function releaseWorkers() { if (view.tick) clearInterval(view.tick); view.tick=null; for (const t of view.timers.values()) clearTimeout(t); view.timers.clear(); for (const w of view.workers) w.terminate(); view.workers=[]; }
function release() { releaseWorkers(); view.inspectionWorker?.terminate(); view.inspectionWorker=null; clearTimeout(view.inspectionTimer); }
function captureElapsed() { view.elapsed+=performance.now()-view.start; if (run()) run().elapsedMs=view.elapsed; }
function finish() { captureElapsed(); releaseWorkers(); persist(); renderEvolutionLab(); }
function pause() { if (status() !== 'RUNNING') return; captureElapsed(); view.session.pause(); releaseWorkers(); persist(); renderEvolutionLab(); }
function stop() { if (!active()) return; if (status() === 'RUNNING') captureElapsed(); view.session.stop(); releaseWorkers(); persist(); renderEvolutionLab(); }
function failRun(error) { if (status() !== 'RUNNING') return; captureElapsed(); view.session.error(error.message); view.error=error.message; releaseWorkers(); persist(); if (view.mounted) renderEvolutionLab(); }
function updateLive() {
  if (!view.mounted) return; const m=seriesMetrics(view.agg,elapsed()); text('evo-progress-count',`${fmt(m.gamesCompleted)} / ${fmt(run().config.gameCount)}`); text('evo-elapsed',num(elapsed()/1000)); text('evo-gps',num(m.gamesPerSec));
  text('evo-A-wins',fmt(m.winsA)); text('evo-B-wins',fmt(m.winsB)); text('evo-A-rate',pct(m.winPctA)); text('evo-B-rate',pct(m.winPctB));
  const fill=document.getElementById('evo-progress-fill'); if (fill) fill.style.width=`${100*m.gamesCompleted/run().config.gameCount}%`;
  const metrics=metricValues(m); document.querySelectorAll('[data-evo-metric]').forEach(el => { el.textContent=metrics[el.dataset.evoMetric]; }); const chartEl=document.getElementById('evo-chart'); if (chartEl) chartEl.innerHTML=chart();
}
function bindInspection() {
  const seek=n => { if (!view.inspection?.steps) return; view.step=Math.max(0,Math.min(view.inspection.steps.length-1,n)); const el=document.getElementById('evo-inspection'); if (el) { el.innerHTML=inspectionHtml(); bindInspection(); } };
  document.getElementById('evo-prev')?.addEventListener('click',() => seek(view.step-1)); document.getElementById('evo-next')?.addEventListener('click',() => seek(view.step+1)); document.getElementById('evo-step')?.addEventListener('input',e => seek(Number(e.target.value)));
}
function inspectReplay(replayId) {
  view.inspectionWorker?.terminate(); clearTimeout(view.inspectionTimer); view.inspection={}; view.step=0;
  const el=document.getElementById('evo-inspection'); if (el) el.innerHTML=inspectionHtml();
  const worker=new Worker('worker.js',{type:'module'}); view.inspectionWorker=worker;
  const done=x => { if (view.inspectionWorker !== worker) return; worker.terminate(); clearTimeout(view.inspectionTimer); view.inspectionWorker=null; view.inspection=x; const box=document.getElementById('evo-inspection'); if (box) { box.innerHTML=inspectionHtml(); bindInspection(); } };
  worker.onmessage=e => { if (e.data.type === 'evolution-inspection') done(e.data.ok ? e.data : {error:e.data.error}); }; worker.onerror=e => done({error:e.message || 'REPLAY_WORKER_FAILED'}); view.inspectionTimer=setTimeout(() => done({error:'REPLAY_VERIFICATION_TIMEOUT'}),30000);
  worker.postMessage({type:'inspect-evolution-replay',replayId,artifact:artifactEnvelope(run())});
}
export function cleanupEvolutionLab() { view.mounted=false; if (status() === 'RUNNING') { captureElapsed(); view.session.pause(); persist(); } release(); }
