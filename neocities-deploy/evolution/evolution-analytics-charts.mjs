import { arenaAnalytics, researchAnalytics } from './evolution-analytics-model.mjs';
export const escapeHtml = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const e=escapeHtml;
const colors={A:'#58d8c5',B:'#b495ff',Draw:'#e8bc68',Fault:'#f77888',muted:'#92a9bf',grid:'#243447',text:'#e8f0f8'};
const number=(n,d=2)=>Number.isFinite(n)?n.toFixed(d):'Unavailable';
const percent=n=>Number.isFinite(n)?`${(100*n).toFixed(1)}%`:'Unavailable';
const W=760,H=310,L=62,R=24,T=25,B=52;
const sx=(x,min,max)=>L+(x-min)/Math.max(1,max-min)*(W-L-R);
const sy=(y,min,max)=>H-B-(y-min)/Math.max(1,max-min)*(H-T-B);
const text=(x,y,value,anchor='start',fill=colors.muted)=>`<text x="${x}" y="${y}" fill="${fill}" text-anchor="${anchor}" font-size="11">${e(value)}</text>`;
const svg=(label,body,height=H)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${height}" role="group" aria-label="${e(label)}" style="background:#0b1420;font-family:system-ui,sans-serif"><title>${e(label)}</title>${body}</svg>`;
const card=(id,title,subtitle,graphic,rows=[],wide=false)=>`<figure class="evo-analytic-card ${wide?'evo-analytic-wide':''}" data-evo-plot="${id}"><figcaption><div><span class="evo-eyebrow">MEASURED EVIDENCE</span><h4>${e(title)}</h4><p>${e(subtitle)}</p></div><button data-evo-export-plot="${id}" aria-label="Download ${e(title)} as SVG">SVG ↓</button></figcaption>${graphic}<div class="evo-plot-readout" aria-live="polite">Hover or focus a mark for exact values. Select linked marks to inspect evidence.</div>${rows.length?`<details><summary>Accessible chart data · ${rows.length} rows</summary><div class="evo-table-scroll"><table><thead><tr>${Object.keys(rows[0]).map(k=>`<th scope="col">${e(k)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0,300).map(row=>`<tr>${Object.values(row).map(v=>`<td>${e(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${rows.length>300?'<p>First 300 rows shown. Export the run in Ledger for all records.</p>':''}</details>`:''}</figure>`;
const tip=(label,selection)=>`data-evo-tooltip="${e(label)}" tabindex="0" ${selection?`role="button" data-evo-inspect="${e(selection)}"`:''} aria-label="${e(label)}${selection?' · inspect evidence':''}"`;
function axes(xmin,xmax,ymin,ymax,xLabel,yLabel){
  let body='';for(let i=0;i<=4;i++){const y=ymin+(ymax-ymin)*i/4,py=sy(y,ymin,ymax);body+=`<line x1="${L}" x2="${W-R}" y1="${py}" y2="${py}" stroke="${colors.grid}"/>${text(L-9,py+4,number(y,Math.abs(ymax-ymin)>10?0:1),'end')}`;}
  const lo=Math.ceil(xmin),hi=Math.floor(xmax),ticks=[...new Set(Array.from({length:5},(_,i)=>Math.round(lo+(hi-lo)*i/4)))];
  for(const x of ticks)body+=text(sx(x,xmin,xmax),H-B+22,number(x,0),'middle');
  return body+text(L,T-9,yLabel)+text(W-R,H-9,xLabel,'end');
}
function path(points,xmin,xmax,ymin,ymax,key){let d='',open=false;for(const p of points){if(!Number.isFinite(p[key])){open=false;continue;}d+=`${open?'L':'M'}${sx(p.x,xmin,xmax)},${sy(p[key],ymin,ymax)} `;open=true;}return d;}
function progressPlot(model,window){
  const pts=model.curves,xmax=Math.max(2,...pts.map(p=>p.x));let body=axes(1,xmax,0,100,'Game ordinal · sorted accepted records','Score / wins (%)');
  const bounded=pts.filter(p=>Number.isFinite(p.lo));
  if(bounded.length)body+=`<path d="${path(bounded,1,xmax,0,100,'hi')} ${[...bounded].reverse().map(p=>`L${sx(p.x,1,xmax)},${sy(p.lo,0,100)}`).join(' ')} Z" fill="${colors.A}" opacity=".10"/>`;
  body+=`<line x1="${L}" x2="${W-R}" y1="${sy(50,0,100)}" y2="${sy(50,0,100)}" stroke="${colors.muted}" stroke-dasharray="4 5"/>`;
  for(const [key,color,dash]of [['a',colors.A,''],['b',colors.B,''],['rolling',colors.Draw,'5 4']])body+=`<path data-evo-series="${key}" d="${path(pts,1,xmax,0,100,key)}" fill="none" stroke="${color}" stroke-width="2.5" ${dash?`stroke-dasharray="${dash}"`:''}/>`;
  for(const p of pts)body+=`<circle cx="${sx(p.x,1,xmax)}" cy="${sy(p.a,0,100)}" r="6" fill="${colors.A}" fill-opacity=".02" ${tip(`Game ${p.x}; ${p.n} clean observations; A wins ${number(p.a,1)}%; B wins ${number(p.b,1)}%; rolling A score ${number(p.rolling,1)}% over ${p.rollingN} games; complete-pair 95% bounds ${number(p.lo,1)}–${number(p.hi,1)}%`,`game:${p.x-1}`)}><title>Game ${p.x}: A ${number(p.a,1)}%, B ${number(p.b,1)}%</title></circle>`;
  const legend=`<div class="evo-plot-legend">${[['a','A cumulative wins',colors.A],['b','B cumulative wins',colors.B],['rolling',`A rolling score · ${window} clean games`,colors.Draw]].map(([key,label,color])=>`<button data-evo-toggle-series="${key}" aria-pressed="true"><i style="background:${color}"></i>${e(label)}</button>`).join('')}<span>Shading: conservative bounds for complete seed-pair score</span></div>`;
  return card('convergence','Outcome convergence',`${model.pairs.n} complete AB/BA pairs · A paired score ${percent(model.pairs.score)} · 95% bounds ${model.pairs.interval?.map(percent).join(' – ')??'unavailable'}. Draws score ½ in the rolling and paired score.`,legend+svg('Cumulative win rates and rolling score over actual game ordinals, with seed-pair uncertainty',body),pts.map(p=>({'Game ordinal':p.x,'Clean games':p.n,'A win %':number(p.a),'B win %':number(p.b),'Rolling score %':number(p.rolling),'Pair lower %':number(p.lo),'Pair upper %':number(p.hi)})),true);
}
function histogramPlot(id,title,bins,label,subtitle,marker=null){
  if(!bins.length)return card(id,title,subtitle,'<p class="evo-plot-empty">No compatible observations. Missing evidence is not zero.</p>');
  const max=Math.max(1,...bins.map(bin=>bin.A+bin.B+bin.Draw+bin.Fault)),barWidth=(W-L-R)/bins.length;
  const xmin=bins[0].lo-.5,xmax=bins.at(-1).hi+.5;
  let body=axes(xmin,xmax,0,max,label,'Games');
  for(const [i,bin]of bins.entries()){let base=0;for(const key of ['A','B','Draw','Fault']){const count=bin[key];if(count){const y=sy(base+count,0,max),height=sy(base,0,max)-y;body+=`<rect x="${L+i*barWidth+1}" y="${y}" width="${Math.max(1,barWidth-2)}" height="${height}" fill="${colors[key]}" ${tip(`${bin.lo}–${bin.hi} ${label}: ${count} ${key} outcomes; bin total ${bin.records.length}`)}><title>${e(key)}: ${count}</title></rect>`;}base+=count;}}
  if(Number.isFinite(marker))body+=`<line x1="${sx(marker,xmin,xmax)}" x2="${sx(marker,xmin,xmax)}" y1="${T}" y2="${H-B}" stroke="#ffffff" stroke-dasharray="4 4"/><g>${text(sx(marker,xmin,xmax)+6,T+14,`Mean ${number(marker)}`)}</g>`;
  return card(id,title,subtitle,svg(title,body)+`<div class="evo-plot-legend"><span style="color:${colors.A}">■ A wins</span><span style="color:${colors.B}">■ B wins</span><span style="color:${colors.Draw}">■ Draws</span></div>`,bins.map(bin=>({'From':bin.lo,'To':bin.hi,'A wins':bin.A,'B wins':bin.B,'Draws':bin.Draw,'Count':bin.records.length})));
}
function scatterPlot(model){
  const pts=model.scatter;if(!pts.length)return card('length-margin','Length × score margin','Event-qualified clean Core games only.','<p>No compatible game telemetry.</p>');
  const xmin=Math.min(...pts.map(p=>p.x)),xmax=Math.max(xmin+1,...pts.map(p=>p.x)),ymin=Math.min(-1,...pts.map(p=>p.y)),ymax=Math.max(1,...pts.map(p=>p.y));
  let body=axes(xmin,xmax,ymin,ymax,'Full turns · terminal included','A score − B score');
  body+=`<line x1="${L}" x2="${W-R}" y1="${sy(0,ymin,ymax)}" y2="${sy(0,ymin,ymax)}" stroke="${colors.muted}" stroke-dasharray="4 4"/>`;
  for(const p of pts){const r=p.record;body+=`<circle cx="${sx(p.x,xmin,xmax)}" cy="${sy(p.y,ymin,ymax)}" r="5" fill="${colors[outcomeColor(r)]}" fill-opacity=".55" stroke="${colors[outcomeColor(r)]}" ${tip(`Game ${r.ordinal+1}; seed ${r.seed}; ${p.x} full turns; ${r.miniTurns} mini-turns; ${r.decisions} decisions; A margin ${p.y}; ${r.swapped?'BA':'AB'}; ${r.terminationReason}`,`game:${r.ordinal}`)}/>`;}
  return card('length-margin','Length × score margin',`${pts.length} deterministically sampled marks of ${model.summary.turnCoverage} compatible games (maximum 300). Overlapping marks share coordinates. Click a game to inspect its record.`,svg('Full turns against score margin, colored by winning bot',body),pts.map(p=>({'Game':p.record.ordinal+1,'Seed':p.record.seed,'Full turns':p.x,'Margin':p.y,'Decisions':p.record.decisions})));
}
const outcomeColor=r=>r.winner==='DRAW'?'Draw':((r.winner==='P1')!==r.swapped?'A':'B');
function seatsPlot(model){let body='';const height=180;
  for(const [i,s]of model.seats.entries()){const y=45+i*64;body+=text(16,y-10,`${s.label} · n=${s.n}`);let x=16;for(const key of ['A','B','Draw']){const width=s.n?720*s[key]/s.n:0;body+=`<rect x="${x}" y="${y}" width="${width}" height="26" fill="${colors[key]}" ${tip(`${s.label}: ${key} ${s[key]}/${s.n} (${s.n?number(100*s[key]/s.n,1):'unavailable'}%)`)}/>`;if(width>65)body+=text(x+width/2,y+17,`${key} ${number(100*s[key]/s.n,1)}%`,'middle','#0b1420');x+=width;}}
  return card('seat-effects','Policy × seating',`${model.pairs.incompleteGames} clean games lack a clean matching partner in this range. Seat slices describe this sample; they are not an independent strength rating.`,svg('Bot outcome proportions under AB and BA seating',body,height),model.seats.map(s=>({'Seat assignment':s.label,'Games':s.n,'A wins':s.A,'B wins':s.B,'Draws':s.Draw})));
}
export function horizontalComparison(rows,{left='A',right='B',signed=false,selection=null}={}){
  if(!rows.length)return '<p>No compatible observations.</p>';
  const height=40+rows.length*38,max=signed?Math.max(1,...rows.map(r=>Math.abs(r.delta))):Math.max(1,...rows.flatMap(r=>[r.A??0,r.B??0]));
  let body='';const leftEdge=190,rightEdge=680,zero=signed?(leftEdge+rightEdge)/2:leftEdge;
  if(signed)body+=`<line x1="${zero}" x2="${zero}" y1="15" y2="${height-10}" stroke="${colors.muted}"/>`;
  for(const [i,row]of rows.entries()){const y=30+i*38;body+=text(12,y+10,row.key);
    if(signed){const width=(rightEdge-leftEdge)/2*Math.abs(row.delta)/max,x=row.delta<0?zero-width:zero;body+=`<rect x="${x}" y="${y}" width="${width}" height="17" fill="${row.delta<0?colors.Fault:colors.A}" ${tip(`${row.key}: ${number(row.delta)} percentage points`,selection?.(row))}/>${text(rightEdge+12,y+13,`${row.delta>0?'+':''}${number(row.delta)} pp`)}`;}
    else for(const [j,key]of ['A','B'].entries()){const value=row[key];if(!Number.isFinite(value))continue;body+=`<rect x="${leftEdge}" y="${y+j*12}" width="${(rightEdge-leftEdge)*value/max}" height="10" fill="${colors[key]}" ${tip(`${row.key}; ${key==='A'?left:right}: ${number(value)}%`)}/>${text(rightEdge+12,y+10+j*12,`${number(value,1)}%`)}`;}}
  return svg(signed?'Signed changes in percentage points':`${left} and ${right} observed percentages by category`,body,height);
}
export function arenaAnalyticsHtml(run,options={}){
  const model=arenaAnalytics(run,options),s=model.summary;
  if(!run?.records.length)return '<div class="evo-plot-empty">Run a series to measure game lengths, seat effects, score margins, behavior and convergence.</div>';
  return `<p class="evo-analysis-coverage ${run.status==='ERROR'?'danger':''}"><b>${e(run.status)} · ${run.records.length} / ${s.requested} requested games accepted</b> · ${s.remaining} without accepted records. This chart range contains ${s.clean} clean games / ${s.faults} recorded faults.${run.status==='ERROR'?`<br>Execution failure: ${e(run.error??'See execution console')}. Uncommitted timed-out work is excluded from game averages; this is partial evidence.`:''}</p>
    <div class="evo-analysis-kpis"><div><small>FULL TURNS · END INCLUDED</small><strong>${number(s.meanTurns)}</strong><span>Median ${number(s.medianTurns,1)} · P90 ${number(s.p90Turns,1)}</span></div><div><small>MINI-TURNS / GAME</small><strong>${number(s.miniTurns)}</strong><span>Actions within full turns</span></div><div><small>POLICY DECISIONS / GAME</small><strong>${number(s.decisions)}</strong><span>Includes responses / choices</span></div><div><small>COMPLETE SEED PAIRS</small><strong>${model.pairs.n}</strong><span>${model.pairs.incompleteGames} unpaired clean games</span></div></div>
    <details class="evo-metric-definition"><summary>What does a turn count mean?</summary><p>A full turn is one player's Start → Action → End cycle. It can contain several mini-turns and policy decisions; it is not a two-player round. Core counts here use recorded CORE_FULL_TURN_COMPLETED plus the terminal End event. Skipped turn slots do not count. Compatible telemetry: ${s.turnCoverage} / ${s.clean} clean games.</p><p>Original hashed counter mean: ${number(s.rawTurns)}. It excludes the terminal End in Core. Records and scientific identities are preserved; profiles or older records without compatible terminal telemetry show “Unavailable”.</p></details>
    <div class="evo-analytics-grid">${progressPlot(model,options.window??100)}${histogramPlot('full-turns','Full-turn distribution',model.turnBins,'Full turns','Clean Core games; includes the final completed End. A long tail is visible instead of hidden by a mean.',s.meanTurns)}${scatterPlot(model)}${seatsPlot(model)}${histogramPlot('score-margin','Score-margin distribution',model.marginBins,'A score − B score','Both seat assignments normalized to bot A. Positive values favor A.')}${histogramPlot('decisions','Decision-count distribution',model.decisionBins,'Policy decisions','Includes choices and responses; automatic orchestration commands are separate.',s.decisions)}${card('action-mix','Observed decision mix',`${model.telemetryGames} games with two-seat telemetry. Denominator: each bot’s policy decisions, including phase and response choices.`,horizontalComparison(model.families),model.families.map(r=>({'Family':r.key,'A %':number(r.A),'B %':number(r.B)})))}${card('termination','Termination & evidence coverage','Recorded game endings only. A worker timeout without a committed game record is an execution failure, shown above.',horizontalComparison(model.terminations.map(r=>({key:r.key,A:100*r.count/s.accepted,B:null})),{left:'Accepted records'}),model.terminations.map(r=>({'Reason':r.key,'Count':r.count,'Accepted %':number(100*r.count/s.accepted)})))}</div>`;
}

export function matchupHeatmapHtml(project){
  const model=researchAnalytics(project);if(!model.rows.length)return '';
  const opponents=project.suite.checkpoints.map(cp=>cp.policyId),height=75+model.rows.length*38,cell=(W-170-20)/Math.max(1,opponents.length);let body='';
  opponents.forEach((op,i)=>{body+=text(170+i*cell+cell/2,23,op,'middle');});
  for(const [i,row]of model.rows.entries()){const y=42+i*38;body+=text(14,y+22,`${row.cp.agentId}${row.cp.generation}`);
    for(const [j,m]of row.matchups.entries()){const value=m.metrics?.pairedScore,available=Number.isFinite(value),fill=available?(value>=.5?colors.A:colors.B):'#1b2736',x=170+j*cell;
      const description=available?`${row.cp.agentId}${row.cp.generation} versus ${m.opponent}: ${percent(value)} paired score; conservative 95% ${m.metrics.pairedScoreInterval95?.map(percent).join('–')??'unavailable'}; ${m.metrics.clean} clean; ${m.metrics.aborted} failed; ${m.metrics.unresolved} unresolved`:`${row.cp.agentId}${row.cp.generation} versus ${m.opponent}: no complete matching held-out evidence`;
      body+=`<g ${tip(description,row.evaluation?`evaluation:${row.evaluation.evaluationId}`:`checkpoint:${row.cp.checkpointId}`)}><rect x="${x+2}" y="${y}" width="${cell-4}" height="32" rx="3" fill="${fill}" fill-opacity="${available?.22+Math.abs(value-.5)*1.4:1}" stroke="${colors.grid}"/>${text(x+cell/2,y+21,available?percent(value):'—','middle',colors.text)}<title>${e(description)}</title></g>`;}}
  return card('heldout-matrix','Held-out matchup landscape','Recorded roots and committed selections × every frozen opponent. 50% is neutral; missing evidence is an explicit gap. Focus or select a cell for bounds and its evaluation ID.',svg('Held-out paired scores by checkpoint and opponent',body,height),model.rows.flatMap(r=>r.matchups.map(m=>({'Checkpoint':r.cp.checkpointId,'Generation':r.cp.generation,'Opponent':m.opponent,'Paired score':percent(m.metrics?.pairedScore),'95% bounds':m.metrics?.pairedScoreInterval95?.map(percent).join('–')??'Unavailable','Evaluation':r.evaluation?.evaluationId??'Unavailable'}))),true);
}
export function residualHeatmapHtml(project,features,bound){
  const model=researchAnalytics(project);if(!model.nodes.length)return '';
  const height=75+model.nodes.length*34,cell=(W-130-20)/features.length;let body='';
  features.forEach((key,i)=>{body+=text(130+i*cell+cell/2,23,key,'middle');});
  for(const [i,cp]of model.nodes.entries()){const y=40+i*34;body+=text(14,y+20,`${cp.agentId}${cp.generation}`);for(const [j,key]of features.entries()){const value=cp.policyState.weights?.[key],available=Number.isFinite(value);body+=`<g ${tip(`${cp.agentId}${cp.generation}; ${key}: ${available?value:'unavailable'} residual; fixed authority scale ±${bound}`,`checkpoint:${cp.checkpointId}`)}><rect x="${132+j*cell}" y="${y}" width="${cell-4}" height="28" fill="${!available?'#1b2736':value>=0?colors.A:colors.B}" fill-opacity="${available?.15+.85*Math.abs(value)/bound:1}" stroke="${colors.grid}"/>${text(130+j*cell+cell/2,y+19,available?value:'—','middle',colors.text)}</g>`;}}
  return card('residual-matrix','Residual parameter landscape',`Absolute recorded weights, fixed scale ±${bound}; parameters are not measured performance. Select a cell to inspect its immutable checkpoint.`,svg('Recorded residual weights by selected checkpoint and feature',body,height),model.nodes.map(cp=>({'Checkpoint':cp.checkpointId,'Generation':cp.generation,...cp.policyState.weights})),true);
}

export function learningTrendHtml(project){
  const model=researchAnalytics(project);if(!model.nodes.length)return '';
  const maximum=Math.max(1,...model.nodes.map(cp=>cp.generation));let body=axes(0,maximum,0,100,'Committed generation','Mean opponent paired score (%)');
  const data=[];
  for(const [i,root]of model.roots.entries()){
    const nodes=model.nodes.filter(cp=>cp.lineageId===root.lineageId).sort((a,b)=>a.generation-b.generation);
    const rows=nodes.map(cp=>{
      const heldout=model.rows.find(r=>r.cp.checkpointId===cp.checkpointId),scores=heldout.matchups.map(m=>m.metrics?.pairedScore);
      const complete=scores.length===project.suite.checkpoints.length&&scores.every(Number.isFinite);
      const generation=project.generations.find(g=>g.selectedCheckpointId===cp.checkpointId),source=cp.mutation?.sourceCheckpointId??cp.checkpointId;
      const fitness=generation?.selection.ranking.find(r=>r.checkpointId===source||r.checkpointId===cp.checkpointId)?.fitness;
      const row={x:cp.generation,heldout:complete?100*scores.reduce((a,b)=>a+b,0)/scores.length:null,training:Number.isFinite(fitness)?100*fitness:null,cp,evaluation:heldout.evaluation};data.push(row);return row;
    });
    const color=i?colors.B:colors.A;
    body+=`<path d="${path(rows,0,maximum,0,100,'heldout')}" fill="none" stroke="${color}" stroke-width="3"/><path d="${path(rows,0,maximum,0,100,'training')}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="5 5" opacity=".6"/>`;
    for(const r of rows)for(const key of ['heldout','training'])if(Number.isFinite(r[key]))body+=`<circle cx="${sx(r.x,0,maximum)}" cy="${sy(r[key],0,100)}" r="5" fill="${key==='heldout'?color:'#0b1420'}" stroke="${color}" stroke-width="2" ${tip(`${r.cp.agentId}${r.x}: ${key==='heldout'?'held-out all-opponent mean':'TRAINING selected fitness'} ${number(r[key],1)}%; checkpoint ${r.cp.checkpointId}`,`checkpoint:${r.cp.checkpointId}`)}/>`;
  }
  return card('learning-trend','Selection fitness × held-out performance','A cyan / B violet. Solid: complete held-out mean across the frozen opponent suite. Dashed: recorded TRAINING selection fitness on a separate pack. Missing observations break the line. No pooled confidence interval is inferred.',svg('Training selection fitness and independently measured held-out score by generation',body),data.map(r=>({'Checkpoint':r.cp.checkpointId,'Generation':r.x,'TRAINING fitness %':number(r.training),'Held-out mean %':number(r.heldout),'Evaluation':r.evaluation?.evaluationId??'Unavailable'})),true);
}

export function lineageGraphHtml(project){
  const model=researchAnalytics(project);if(!model.nodes.length)return '';
  const max=Math.max(1,...model.nodes.map(cp=>cp.generation)),height=205,positions=new Map();let body='';
  model.roots.forEach((root,i)=>{const y=60+i*75;body+=text(12,y,`Lineage ${root.agentId}`);for(const cp of model.nodes.filter(cp=>cp.lineageId===root.lineageId))positions.set(cp.checkpointId,{x:145+cp.generation/max*565,y:y-4,cp});});
  for(const p of positions.values()){const parent=positions.get(p.cp.parentCheckpointId);if(parent)body+=`<line x1="${parent.x}" x2="${p.x}" y1="${parent.y}" y2="${p.y}" stroke="${p.cp.agentId==='B'?colors.B:colors.A}" stroke-width="2"/>`;}
  for(const p of positions.values()){const row=model.rows.find(r=>r.cp.checkpointId===p.cp.checkpointId),color=p.cp.agentId==='B'?colors.B:colors.A;body+=`<g ${tip(`${p.cp.agentId}${p.cp.generation}; ${p.cp.mutation?.kind??'root'}; held-out ${row.evaluation?'complete':'unavailable'}; parent ${p.cp.parentCheckpointId??'none'}`,`checkpoint:${p.cp.checkpointId}`)}><circle cx="${p.x}" cy="${p.y}" r="7" fill="${row.evaluation?color:'#0b1420'}" stroke="${color}" stroke-width="2"/>${model.nodes.length<=24?text(p.x,p.y+25,`${p.cp.agentId}${p.cp.generation}`,'middle'):''}</g>`;}
  return card('lineage-graph','Committed lineage graph','Edges are recorded parent links. Filled nodes have matching complete held-out evidence; hollow nodes remain unevaluated. Candidate mutations are inspected from each generation record.',svg('Independent A and B checkpoint ancestry',body,height),model.nodes.map(cp=>({'Checkpoint':cp.checkpointId,'Parent':cp.parentCheckpointId??'Root','Generation':cp.generation,'Mutation':cp.mutation?.kind??'Root'})),true);
}

export function comparisonPlotHtml(comparison,project){
  const rows=comparison.matchups.map(m=>({key:m.opponent,A:Number.isFinite(m.before)?100*m.before:null,B:Number.isFinite(m.after)?100*m.after:null}));
  const deltas=comparison.matchups.filter(m=>Number.isFinite(m.delta)).map(m=>({key:m.opponent,delta:100*m.delta}));
  const bounds=[];
  for(const m of comparison.matchups)for(const [key,id]of [['Before',m.beforeEvaluationId],['After',m.afterEvaluationId]]){const ev=project.evaluations.find(e=>e.evaluationId===id),metric=ev?.matchups.find(x=>x.opponentPolicyId===m.opponent)?.metrics;if(Number.isFinite(metric?.pairedScore))bounds.push({key:`${m.opponent} · ${key}`,score:metric.pairedScore,interval:metric.pairedScoreInterval95,id});}
  let body='';const height=50+bounds.length*35;
  for(const [i,row]of bounds.entries()){const y=30+i*35;body+=text(12,y+4,row.key);const x=v=>210+v*510;if(row.interval)body+=`<line x1="${x(row.interval[0])}" x2="${x(row.interval[1])}" y1="${y}" y2="${y}" stroke="${colors.muted}" stroke-width="3"/>`;body+=`<circle cx="${x(row.score)}" cy="${y}" r="6" fill="${row.key.endsWith('Before')?colors.A:colors.B}" ${tip(`${row.key}: ${percent(row.score)}; 95% bounds ${row.interval?.map(percent).join('–')??'unavailable'}`,`evaluation:${row.id}`)}/>`;}
  body+=`<line x1="465" x2="465" y1="10" y2="${height-28}" stroke="${colors.grid}" stroke-dasharray="4 4"/>${text(210,height-7,'0%')}${text(465,height-7,'50%','middle')}${text(720,height-7,'100%','end')}`;
  return `<div class="evo-analytics-grid">${card('comparison-bounds','Before / after uncertainty','Conservative 95% bounds per checkpoint and opponent. Overlap is visible. These are separate score bounds, not a confidence interval for the difference.',bounds.length?svg('Before and after held-out score bounds by opponent',body,height):'<p>Compatible score bounds unavailable.</p>',bounds.map(r=>({'Series':r.key,'Score':percent(r.score),'95%':r.interval?.map(percent).join('–')??'Unavailable','Evaluation':r.id})),true)}${card('comparison-scores','Opponent score comparison','Matching complete held-out evidence only.',horizontalComparison(rows,{left:'Before',right:'After'}),rows.map(r=>({'Opponent':r.key,'Before %':number(r.A),'After %':number(r.B)})))}${card('comparison-deltas','Matchup changes','Signed paired-score differences. This descriptive delta is not a significance claim.',horizontalComparison(deltas,{signed:true}),deltas.map(r=>({'Opponent':r.key,'Delta pp':number(r.delta)})))}</div>`;
}

export function behaviorPlotsHtml(delta){
  const rows=delta.metrics.slice(0,40),rates=rows.map(m=>({key:`${m.category==='actionRates'?'Family':'Tag'}: ${m.key}`,A:m.before*100,B:m.after*100})),deltas=rows.map(m=>({key:`${m.category==='actionRates'?'Family':'Tag'}: ${m.key}`,delta:m.delta*100}));
  return `<div class="evo-analytics-grid">${card('behavior-rates','Decision frequencies','Before / after rates from observed candidate decisions. Mechanic tags may overlap and do not sum to 100%. First 40 categories shown.',horizontalComparison(rates,{left:'Before',right:'After'}),rates.map(r=>({'Category':r.key,'Before %':number(r.A),'After %':number(r.B)})))}${card('behavior-shift','Behavioral divergence','Signed rate changes in percentage points; zero is centered. A parameter change alone is not behavioral evidence.',horizontalComparison(deltas,{signed:true}),deltas.map(r=>({'Category':r.key,'Delta pp':number(r.delta)})))}</div>`;
}

export function mountChartInteractions(root){
  const hiddenSeries=new Set();
  const syncLegend=()=>{for(const b of root.querySelectorAll('[data-evo-toggle-series]'))b.setAttribute('aria-pressed',String(!hiddenSeries.has(b.dataset.evoToggleSeries)));};
  const observer=new MutationObserver(syncLegend);observer.observe(root,{childList:true,subtree:true});
  const show=event=>{const mark=event.target.closest('[data-evo-tooltip]');if(mark){const readout=mark.closest('[data-evo-plot]')?.querySelector('.evo-plot-readout');if(readout)readout.textContent=mark.dataset.evoTooltip;}};
  const click=event=>{const toggle=event.target.closest('[data-evo-toggle-series]');if(toggle){const key=toggle.dataset.evoToggleSeries;if(hiddenSeries.has(key))hiddenSeries.delete(key);else hiddenSeries.add(key);root.dataset.evoHiddenSeries=[...hiddenSeries].join(' ');syncLegend();}
    const download=event.target.closest('[data-evo-export-plot]');if(download){const node=download.closest('figure').querySelector('svg');if(!node)return;const url=URL.createObjectURL(new Blob([new window.XMLSerializer().serializeToString(node)],{type:'image/svg+xml'})),a=document.createElement('a');a.href=url;a.download=`intrilex-${download.dataset.evoExportPlot}.svg`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}};
  root.addEventListener('pointerover',show);root.addEventListener('focusin',show);root.addEventListener('click',click);
  return ()=>{observer.disconnect();root.removeEventListener('pointerover',show);root.removeEventListener('focusin',show);root.removeEventListener('click',click);};
}
