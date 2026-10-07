import { app, esc } from '../state.js?v=09c7519902ec';
import { STRATEGY_NAMES, MATURITY_BUCKETS, STRATEGY_CONTRACTS, sealStrategy, strategyDigest } from '../evolution/strategy-contracts.mjs?v=09c7519902ec';
import { createStrategyEvidenceWriter, ingestRunEvidence } from '../evolution/strategy-live.mjs?v=09c7519902ec';
import { claimsFromAggregate, synthesizeStrategyClaim, strategyGuide, mineStrategyMotifs, mineStrategyMistakes, STRATEGY_CONFIDENCE, orderControlledClaims, researchLeadsFor, RANK_SEMANTIC_LABELS } from '../evolution/strategy-analysis.mjs?v=09c7519902ec';
import { planStrategyBranch, claimFromStrategyBranch } from '../evolution/strategy-branch.mjs?v=09c7519902ec';
import { claimsFromInformationStudy, informationResolution, INFORMATION_INFERENCE_V3 } from '../evolution/strategy-information.mjs?v=09c7519902ec';
import { createStrategyExplanationPacket, createControlledStudyPacket, createPolicyComparePacket, createGuidePacket, createEvidenceDeskPacket, explainStrategyEvidence, normalizeStrategyAiConfig, strategyAiClient, STRATEGY_INTERPRETER_MODES, STRATEGY_INTERPRETER_SURFACES } from '../../../../packages/analytics-ai/src/strategy-interpreter.mjs?v=09c7519902ec';
import { discoverOllama } from '../../../../packages/analytics-ai/src/model-discovery.mjs?v=09c7519902ec';
import { StrategyStore } from './strategy-store.mjs?v=09c7519902ec';
import { EvolutionStore } from '../evolution/evolution-store.mjs?v=09c7519902ec';
import { LAB_IDENTITY } from '../evolution/identity.mjs?v=09c7519902ec';
import { executeBrowserSeries } from '../evolution/evolution-browser-runner.mjs?v=09c7519902ec';
import { STATIC_POLICIES, LAB_PROFILES } from '../evolution/evolution-domain.mjs?v=09c7519902ec';
import { ProfileStore, IndexedDbBackend } from '../evolution/profile-store.mjs?v=09c7519902ec';
import { createProfileArenaRun, profileArenaRoster } from '../evolution/profile-arena.mjs?v=09c7519902ec';
import { rankName } from '../card-face-data.js?v=09c7519902ec';
import { ACTION_PURPOSES } from '../action-evaluation.mjs?v=09c7519902ec';

let owner=null;
const pretty=value=>{const subject=String(value);return subject.startsWith('rank:')?`${subject.slice(5)} · ${rankName(subject.slice(5))}`:subject.replace(/^(card|family|mode|mechanic|timing|combination|suit):/,'').replaceAll('-',' ');};
function publicMechanicText(v){const rank=v.subject.startsWith('rank:')?v.subject.slice(5):null;if(!rank||!v.rankRegistry)return null;const entry=v.rankRegistry[rank];if(!entry)return null;return `Rank ${rank} public mechanics: ${entry.prPoints} point value; modes ${(entry.modes??[]).join(', ')}.${(entry.notes??[]).length?' '+entry.notes.join(' '):''}`;}
const fmt=n=>n===null||n===undefined?'Unknown':Number.isInteger(n)?n.toLocaleString():n.toFixed(2);
const pct=n=>n===null||n===undefined?'Unknown':`${(n*100).toFixed(1)}%`;
const option=(value,label,selected)=>`<option value="${esc(value)}" ${String(value)===String(selected)?'selected':''}>${esc(label)}</option>`;
const nerd=value=>`<details class="si-nerd"><summary>SHOW NERD DATA</summary><pre>${esc(JSON.stringify(value,null,2))}</pre></details>`;
function download(name,text,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
// AI interpretation export — never the scientific artifact. The disclaimer
// stays in the file so a shared .md can't be mistaken for the Field Manual.
function guideAiMarkdown(result){const e=result.explanation;return `# AI Interpretation — Intrilex Field Manual\n\n> ${result.disclaimer} This file is AI interpretation of deterministic Field Manual evidence — it is NOT scientific output. The exported Field Manual and its claim/provenance manifest remain authoritative.\n\nModel: ${result.model} · ${result.generatedAt} · packet ${result.packetVersion}\n\n## ${e.title}\n\n**Executive take.** ${e.executiveTake}\n\n## Key lessons\n\n${e.keyLessons.map(l=>`### ${l.headline}\n\n${l.explanation}\n\n*${l.confidence}* · ${l.caveat}\n\n**Next question:** ${l.nextQuestion}`).join('\n\n')}\n\n## Phase of game\n\n${e.phaseOfGame}\n\n${(e.cardInsights??[]).map(i=>`- **${i.subject}:** ${i.insight}`).join('\n')}${(e.policyInsights??[]).length?`\n\n## Policy insights\n\n${e.policyInsights.map(i=>`- ${i}`).join('\n')}`:''}${(e.matchupInsights??[]).length?`\n\n## Matchup insights\n\n${e.matchupInsights.map(i=>`- ${i}`).join('\n')}`:''}\n\n## Things not to over-read\n\n${(e.thingsNotToOverread??[]).map(w=>`- ${w}`).join('\n')||'- None recorded.'}\n\n## Best next experiments\n\n${(e.bestNextExperiments??[]).map(w=>`- ${w}`).join('\n')||'- None recorded.'}\n\n## Bottom line\n\n${e.bottomLine}\n`;}
function scope(v){return {...v.cohort,subject:v.subject,filters:v.filters,historical:v.cohort.fingerprint!==LAB_IDENTITY.fingerprint};}
function alive(v){return owner===v && v.root.isConnected && location.hash.split('?')[0]==='#/strategy';}
function cohortOptions(v){return v.cohorts.map((c,i)=>option(i,`${c.fingerprint===LAB_IDENTITY.fingerprint?'Current':'Historical'} · ${c.rulesProfile} · era ${c.eraId.slice(0,12)}`,v.cohorts.findIndex(x=>strategyDigest(x)===strategyDigest(v.cohort)))).join('');}
function filterControl(label,key,values,v){return `<label>${label}<select data-si-filter="${key}">${option('','Any',v.filters[key])}${values.map(value=>option(value,pretty(value),v.filters[key])).join('')}</select></label>`;}
function filters(v){const matching=v.sources.filter(s=>s.fingerprint===v.cohort.fingerprint&&s.rulesProfile===v.cohort.rulesProfile&&s.eraId===v.cohort.eraId),policies=[...new Set(matching.flatMap(s=>s.policyIds))].sort(),checkpoints=[...new Set(matching.flatMap(s=>s.checkpointIds))],profiles=[...new Set(matching.flatMap(s=>s.agentProfileIds))];
  return `<form class="si-filters" id="si-filter-form" aria-label="Strategy context filters"><label>Evidence era<select id="si-cohort">${cohortOptions(v)}</select></label><label>Subject<select id="si-subject">${v.subjects.map(s=>option(s,pretty(s),v.subject)).join('')}</select></label>
    ${filterControl('Game maturity','maturity',MATURITY_BUCKETS,v)}${filterControl('Policy','policyId',policies,v)}${filterControl('Opponent / matchup','opponentPolicyId',policies,v)}${filterControl('Score position','position',['behind','tied','ahead'],v)}
    <details class="si-context"><summary>More context · hands, goals, seat, checkpoint</summary><div class="si-filters">${filterControl('Seat','seat',[1,2],v)}${filterControl('Checkpoint','checkpointId',checkpoints,v)}${filterControl('Agent Profile','agentProfileId',profiles,v)}${filterControl('Evidence purpose','purpose',['SELF_PLAY','EVALUATION','TRAINING','NORMAL_PLAY'],v)}
    ${[['Trailing by at least','minDeficit'],['Ahead by at least','minLead'],['Own hand at least','minOwnHand'],['Opponent hand at least','minOpponentHand'],['Board cards at least','minBoard'],['Own goal within','maxOwnGoalDistance'],['Opponent goal within','maxOpponentGoalDistance'],['Profile head','profileHead']].map(([label,key])=>`<label>${label}<input data-si-filter="${key}" type="number" min="0" max="100" value="${esc(v.filters[key]??'')}" placeholder="Any"></label>`).join('')}</div></details><button type="submit" class="si-primary">Explore this context</button><button type="button" data-si-action="reset">Reset filters</button></form>`;
}
function curve(a){
  const values=a.timing.map(t=>t.selectionRate),points=values.map((v,i)=>v===null?null:`${35+i*90},${122-v*100}`),segments=[];let run=[];
  for(const p of points){if(p)run.push(p);else if(run.length){segments.push(run);run=[];}}if(run.length)segments.push(run);
  return `<figure class="si-curve"><figcaption>When it gets selected · per legal opportunity</figcaption><svg viewBox="0 0 430 170" role="img" aria-label="Selection rate by game maturity"><path d="M25 22 V122 H405" fill="none" stroke="currentColor" opacity=".3"/>${segments.map(s=>`<polyline points="${s.join(' ')}" fill="none" stroke="#80d8c1" stroke-width="3"/>`).join('')}${a.timing.map((t,i)=>`<g><text x="${35+i*90}" y="149" text-anchor="middle">${t.bucket==='MIDGAME'?'MID':t.bucket}</text>${t.selectionRate===null?'':`<circle cx="${35+i*90}" cy="${122-t.selectionRate*100}" r="5" fill="#80d8c1"><title>${esc(`${t.bucket}: ${t.selected} / ${t.opportunities} · ${pct(t.selectionRate)}`)}</title></circle>`}</g>`).join('')}</svg><p>Usage describes behavior. It does not measure card strength. Gaps mean no opportunities.</p></figure>`;
}
function controlledClaims(study){try{return claimsFromInformationStudy(study,{identity:LAB_IDENTITY});}catch{return[];}}
function informationEvidence(v,all=false){return (v.informationStudies??[]).filter(s=>all||s.plan.question.subject===v.subject).map(s=>`<article class="si-information-study" data-testid="information-study"><h3>Information-set study · ${esc(s.status)}</h3><p>Controlled question: ${esc(pretty(s.plan.question.subject))}</p><p>${s.counts.hiddenWorlds} compatible hidden worlds · ${s.counts.continuationsPerWorld} continuations per world/action · ${s.counts.executions} executions · ${s.faults} faults</p>${controlledClaims(s).map(c=>`<p class="si-controlled-advice">${esc(synthesizeStrategyClaim(c))}</p><p>${esc(c.confidence)} · 95% familywise interval ${c.uncertainty.interval?c.uncertainty.interval.map(x=>(100*x).toFixed(1)).join(' to '):'unavailable'} pp</p>`).join('')||'<p>Unknown. Cancelled or non-clean studies cannot support inference.</p>'}<p>Exact context: P1 opening Start, hand ${esc(s.informationSet.projection.own.hand.map(c=>c.identity).join(', '))}; face-up Swap Bar ${esc(s.informationSet.projection.swapBar.find(c=>c.identity!=='HIDDEN')?.identity)}. Uniform unseen assignment with fresh synthetic engine randomness; frozen policies.</p>${nerd({study:s,claims:controlledClaims(s)})}</article>`).join('');}
function informationPanel(v){const eligible=r=>r.branchAvailable&&r.event.actorId==='P1'&&r.event.decisionOrdinal===0&&r.event.candidates.some(c=>c.subjects.includes(v.subject));
  return `<section class="si-card" data-testid="information-controls"><h2>Information-set Strategy Study</h2><p>Compare real legal actions across compatible opening worlds. P1’s first prepared Start decision only. Midgame, private choices and remembered information fail closed.</p><p>Only earned Suggestive evidence can support advice. A null or experimental result is valid. The study question binds to the current subject, ${esc(v.subject)}; the recorded action is only the reference.</p><label>Certified opening decision<select id="si-information-decision">${v.decisions.map((r,i)=>eligible(r)?option(i,`${r.event.identity.policyId} · game ${r.event.identity.gameOrdinal+1} · opening`,0):'').join('')||'<option value="">No supported opening decision for this subject</option>'}</select></label><div class="si-filters"><label>Hidden worlds<input id="si-world-count" type="number" min="1" max="512" value="12"></label><label>Sampler seed<input id="si-sampler-seed" type="number" min="1" max="4294967295" value="1337"></label><label>Continuations per world/action<input id="si-world-continuations" type="number" min="1" max="8" value="1"></label><label>Decision limit<input id="si-world-limit" type="number" min="1" max="1800" value="300"></label></div><p class="si-cost" id="si-information-preview" aria-live="polite"></p><button data-si-action="information-study" class="si-primary" ${scope(v).historical||!v.decisions.some(eligible)?'disabled':''}>Commit information-set plan & run</button><div id="si-information-plan" aria-live="polite"></div>${informationEvidence(v,true)||'<p>No information-set evidence yet. Actionable conclusions remain unknown.</p>'}${aiPanel(v,STRATEGY_INTERPRETER_SURFACES.CONTROLLED_STUDY,'Explain this study')}</section>`;}
function robustness(d){return d?.heterogeneity==='ROBUST'?'Robust':d?.heterogeneity==='VOLATILE'?'Volatile':'Unresolved';}
function quickRead(v,claims){
  // Deterministic evidence priority that never rewards effect size: exact
  // public-context match → current era/trusted local → confidence → context
  // specificity → newest compatible → stable artifact ID. Observational
  // prose can never overwrite stronger controlled evidence.
  const controlled=(v.informationStudies??[]).filter(s=>s.plan.question?.subject===v.subject).flatMap(s=>controlledClaims(s));
  const ordered=orderControlledClaims(controlled,{filters:v.filters,fingerprint:v.cohort.fingerprint,eraId:v.cohort.eraId});
  const actionable=ordered.filter(c=>c.confidence==='SUGGESTIVE'&&c.recommendation!=='UNKNOWN');
  const experimental=ordered.filter(c=>c.confidence==='EXPERIMENTAL');
  if(actionable.length){
    const top=actionable[0],pc=top.statementData?.publicContext,contexts=new Set(actionable.map(c=>c.statementData?.informationSetId));
    const multiple=contexts.size>1?`<p><strong>Context:</strong> Controlled advice exists for ${contexts.size} specific opening contexts — not one universal rule. The best-matching context is shown; inspect the rest below.</p>`:'';
    return {html:`<h3>Quick read · controlled evidence</h3><p class="si-advice" data-testid="quick-recommendation"><strong>Recommendation:</strong> ${esc(synthesizeStrategyClaim(top))}</p>
      <p><strong>Confidence:</strong> Suggestive · <strong>Why:</strong> estimated terminal game-score effect ${(Math.abs(top.estimatedMagnitude)*100).toFixed(1)} pp across ${esc(String(top.statementData?.hiddenWorlds))} compatible hidden worlds · <strong>Robustness:</strong> ${robustness(top.statementData)}</p>
      ${multiple||''}${pc&&!multiple?`<p><strong>Context:</strong> P1 opening Start only · authorized hand ${esc(pc.own.hand.map(c=>c.identity).join(', '))} · face-up Swap Bar ${esc(pc.swapBar.find(c=>c.identity!=='HIDDEN')?.identity??'unknown')}</p>`:''}
      <p><strong>Watch out for:</strong> applies only to this opening information set and frozen continuation policies${top.statementData?.testedAlternatives?`; tested against ${top.statementData.testedAlternatives.length} planned alternative(s), not every legal action`:''}.</p>`,
      confidence:top.confidence,claims:controlled};
  }
  if(experimental.length)return {html:`<h3>Quick read</h3><p class="si-advice">Controlled opening-study evidence exists — <strong>no supported recommendation yet</strong>.</p><p>${esc(synthesizeStrategyClaim(experimental[0]))}</p><p>Observational play/hold habits below are descriptive only; the controlled result above is the stronger evidence and still earns no advice.</p>`,confidence:experimental[0].confidence,claims:controlled};
  return {html:`<h3>Quick read</h3><p class="si-advice">${esc(synthesizeStrategyClaim(claims[0]))}</p><p><strong>Play it when / hold it when:</strong> No supported recommendation yet. Controlled player-information evidence is required to answer which choice is better.</p>`,confidence:claims[0].confidence,claims:controlled};
}
function semanticsPanel(v){
  const a=v.aggregate;if(!a.semantics)return '';
  const rows=Object.entries(a.semantics).filter(([,cell])=>cell.opportunities>0).sort((x,y)=>y[1].opportunities-x[1].opportunities);
  if(!rows.length)return '';
  const active=v.filters.semanticUse??'ANY_USE',combined=a.total?.opportunities;
  return `<div class="si-semantics" data-testid="rank-semantics"><h3>What “${esc(pretty(v.subject))}” covers</h3><p>${active==='ANY_USE'?'All uses combined — different mechanics under one subject.':`Showing only: ${esc(RANK_SEMANTIC_LABELS[active]??active)}.`}</p>
    <div class="si-actions">${[['ANY_USE','Combined'],...rows.map(([cat])=>[cat,RANK_SEMANTIC_LABELS[cat]??cat])].map(([cat,label])=>`<button data-si-semantic="${cat}" aria-pressed="${active===cat}">${esc(label)}</button>`).join('')}</div>
    <div class="si-timing" role="list">${rows.map(([cat,cell])=>`<article role="listitem"><h3>${esc(RANK_SEMANTIC_LABELS[cat]??cat)}</h3><strong>${pct(cell.selectionRate)}</strong><p>${cell.selected} / ${cell.opportunities} opportunities</p></article>`).join('')}</div>
    <p class="si-note">Opportunity categories can overlap: one decision may offer this subject in more than one legal way, so category counts can sum to more than the ${fmt(combined)} combined opportunities in “Combined”. They are accounting lenses — not separate decisions — and must not be added together. “Combined” counts each decision frame once.</p>
    <p>Semantic categories come from canonical action family and timing — not every category exists for every rank.</p></div>`;
}
// Status and error are separate channels: a reachable daemon with zero
// models is a success state, not an error.
function aiFail(e){const hint={UNREACHABLE:'Ollama is not reachable — start the local daemon. If the app is deployed, set OLLAMA_ORIGINS to allow this page\u2019s origin.',TIMEOUT:'The request timed out.',CANCELLED:'The request was cancelled.',MODEL_NOT_FOUND:'That model is not installed on this daemon.',HTTP_ERROR:'Ollama answered with an HTTP error.',MALFORMED_RESPONSE:'The model reply was not usable structured output.'}[e?.category];return `${hint??'Unexpected AI error.'}${e?.message?` (${e.message})`:''}`;}
async function aiPacket(v,surface){
  const context={rulesProfile:v.cohort.rulesProfile,eraId:v.cohort.eraId,filters:v.filters,historical:scope(v).historical};
  if(surface===STRATEGY_INTERPRETER_SURFACES.POLICY_COMPARE){
    if(!v.comparison)throw new Error('Run the comparison first — there is no result to explain yet.');
    return createPolicyComparePacket({kind:v.compareKind??'policyId',left:{id:v.compareLeft,aggregate:v.comparison[0]},right:{id:v.compareRight,aggregate:v.comparison[1]},context});
  }
  if(surface===STRATEGY_INTERPRETER_SURFACES.CONTROLLED_STUDY){
    const study=(v.informationStudies??[]).filter(s=>s.plan.question?.subject===v.subject).at(-1);
    if(!study)throw new Error('No information-set study exists for this subject yet.');
    return createControlledStudyPacket({study,claims:controlledClaims(study),humanName:pretty});
  }
  if(surface===STRATEGY_INTERPRETER_SURFACES.GUIDE){
    if(!v.guide)throw new Error('Generate the deterministic guide first — AI polish needs the scientific artifact as input.');
    return createGuidePacket({manifest:v.guide.manifest,markdown:v.guide.markdown,context,synthesis:v.guide.manifest.synthesis,humanName:pretty});
  }
  if(surface===STRATEGY_INTERPRETER_SURFACES.EVIDENCE_DESK){
    return createEvidenceDeskPacket({context,summary:{sources:v.sources.length,fullDecisionGames:v.sources.filter(s=>s.fidelity==='FULL_DECISION_EVIDENCE').length,events:v.sources.reduce((n,s)=>n+(s.eventCount??0),0),subjects:v.subjects.length,transcripts:v.sources.filter(s=>s.replayHash).length,importedResearch:(v.archives??[]).length,studies:v.studies.length,informationStudies:(v.informationStudies??[]).length}});
  }
  const controlled=(v.informationStudies??[]).filter(s=>s.plan.question?.subject===v.subject).flatMap(s=>controlledClaims(s));
  const rankForPoints=v.subject.startsWith('rank:')?v.subject.slice(5):null;
  return createStrategyExplanationPacket({surface,subject:v.subject,humanSubjectName:pretty(v.subject),context,aggregate:v.aggregate,claims:v.claims??[],controlledClaims:controlled,researchLeads:researchLeadsFor(v.subject,v.aggregate,{hasControlledAdvice:controlled.some(c=>c.confidence==='SUGGESTIVE'&&c.recommendation!=='UNKNOWN')}),publicMechanicDescription:publicMechanicText(v),cardPointValue:rankForPoints&&v.rankRegistry?.[rankForPoints]?v.rankRegistry[rankForPoints].prPoints:null});
}
function aiPanel(v,surface=STRATEGY_INTERPRETER_SURFACES.CARD,label='Explain this evidence'){
  const cfg=strategyAiSettings();
  const off=cfg.mode===STRATEGY_INTERPRETER_MODES.OFF;
  const result=v.aiResults?.[surface]??null;
  const models=v.aiModels;
  const modelMissing=cfg.model&&models&&!models.some(m=>m.name===cfg.model||m.name.startsWith(`${cfg.model}:`));
  const modelSelect=models?`<label>Installed model<select data-si-ai-select>${models.map(m=>option(m.name,`${m.name}${m.size?` · ${(m.size/1073741824).toFixed(1)} GB`:''}`,cfg.model)).join('')}${modelMissing?option(cfg.model,`${cfg.model} · not installed`,cfg.model):''}<option value="__manual__">Manual entry…</option></select></label>`:'';
  const guideResult=result&&surface===STRATEGY_INTERPRETER_SURFACES.GUIDE&&Array.isArray(result.explanation.keyLessons)?`<div class="si-ai-result si-ai-guide"><p class="si-kicker">AI INTERPRETATION · ${esc(result.surface)} · ${esc(result.model)} · ${esc(result.generatedAt)} · packet ${esc(result.packetVersion)}</p>
      <h4>${esc(result.explanation.title)}</h4><p><strong>Executive take:</strong> ${esc(result.explanation.executiveTake)}</p>
      ${result.explanation.keyLessons.map(l=>`<article class="si-ai-lesson"><h5>${esc(l.headline)}</h5><p>${esc(l.explanation)}</p><p class="si-kicker">${esc(l.confidence)} · ${esc(l.caveat)}</p><p><strong>Next question:</strong> ${esc(l.nextQuestion)}</p></article>`).join('')}
      ${result.explanation.phaseOfGame?`<p><strong>Phase of game:</strong> ${esc(result.explanation.phaseOfGame)}</p>`:''}
      ${(result.explanation.cardInsights??[]).map(i=>`<p><strong>${esc(i.subject)}:</strong> ${esc(i.insight)}</p>`).join('')}
      ${(result.explanation.policyInsights??[]).map(i=>`<p><strong>Policy:</strong> ${esc(i)}</p>`).join('')}
      ${(result.explanation.matchupInsights??[]).map(i=>`<p><strong>Matchup:</strong> ${esc(i)}</p>`).join('')}
      ${(result.explanation.thingsNotToOverread??[]).map(w=>`<p class="si-warning">${esc(w)}</p>`).join('')}
      ${(result.explanation.bestNextExperiments??[]).length?`<p><strong>Best next experiments:</strong> ${esc(result.explanation.bestNextExperiments.join(' · '))}</p>`:''}
      <p><strong>Bottom line:</strong> ${esc(result.explanation.bottomLine)}</p><p class="si-kicker">${esc(result.disclaimer)} Interpretation only — the deterministic Field Manual above remains authoritative.</p></div>`:null;
  return `<div class="si-ai" data-testid="strategy-ai" data-si-ai-surface="${surface}"><h3>AI interpretation · Ollama${off?' · off':''}</h3>
    ${guideResult??(result?`<div class="si-ai-result"><p class="si-kicker">AI INTERPRETATION · ${esc(result.surface)} · ${esc(result.model)} · ${esc(result.generatedAt)} · packet ${esc(result.packetVersion)}</p>
      <h4>${esc(result.explanation.headline)}</h4><p>${esc(result.explanation.plainSummary)}</p><p><strong>What it means:</strong> ${esc(result.explanation.whatThisMeans)}</p><p><strong>What it does not mean:</strong> ${esc(result.explanation.whatThisDoesNotMean)}</p><p><strong>Takeaway:</strong> ${esc(result.explanation.practicalTakeaway)}</p><p><strong>Signal:</strong> ${esc(result.explanation.interestingSignal)}</p><p><strong>Next useful test:</strong> ${esc(result.explanation.nextUsefulTest)}</p>${result.explanation.warnings.map(w=>`<p class="si-warning">${esc(w)}</p>`).join('')}<p class="si-kicker">${esc(result.disclaimer)} Interpretation only — the deterministic Field Manual above remains authoritative.</p></div>`:'')}
    ${v.aiStatus?`<p class="si-note" role="status">${esc(v.aiStatus)}</p>`:''}
    ${v.aiError?`<p class="si-warning" role="alert">${esc(v.aiError)} Deterministic Field Manual remains active.</p>`:''}
    ${off?`<p>Local Ollama interpretation is disabled. Enable it to get a plain-language explanation of the evidence above — AI never changes the science.</p><div class="si-filters"><label>Endpoint<input id="si-ai-endpoint" value="${esc(cfg.endpoint)}"></label><label>Model<input id="si-ai-model" value="${esc(cfg.model)}" placeholder="llama3.1"></label></div><button data-si-action="ai-enable">Enable local Ollama</button>`
    :`<div class="si-actions"><button data-si-action="ai-explain" data-si-surface="${surface}" ${v.busy?'disabled':''}>${v.busy?'Working…':esc(label)}</button><button data-si-action="ai-models">Check connection & models</button><button data-si-action="ai-disable">Turn AI off</button></div><div class="si-filters"><label>Endpoint<input id="si-ai-endpoint" value="${esc(cfg.endpoint)}"></label>${modelSelect}<label>Manual model<input id="si-ai-model" value="${esc(cfg.model)}" placeholder="override / unlisted model"></label></div>`}</div>`;
}
function discoverModels(v,ai){work(v,'Check Ollama connection',async()=>{
  const d=await discoverOllama({endpoint:ai.endpoint,timeoutMs:8000});
  if(!d.reachable){v.aiStatus=null;v.aiModels=null;v.aiError=`Ollama unreachable at ${d.endpoint}. ${d.error==='TIMEOUT'?'The request timed out.':'Is the daemon running? If the app is deployed, set OLLAMA_ORIGINS to allow this page\u2019s origin.'}`;return;}
  v.aiModels=d.models;v.aiError=null;
  v.aiStatus=`Ollama reachable${d.version?.version?` · v${d.version.version}`:''} · ${d.models.length} local model${d.models.length===1?'':'s'} found.${d.models.length?'':' Install one with `ollama pull <model>`.'}`;
  if(ai.model&&!d.models.some(m=>m.name===ai.model||m.name.startsWith(`${ai.model}:`)))v.aiError=`Selected model "${ai.model}" is not installed on this daemon — pick a listed model or pull it.`;
});}
const AI_SETTINGS_KEY='intrilex.strategy.ai';
function strategyAiSettings(){try{const raw=localStorage.getItem(AI_SETTINGS_KEY);if(raw)return normalizeStrategyAiConfig(JSON.parse(raw));}catch{/* bad stored config */}return normalizeStrategyAiConfig({});}
function saveStrategyAiSettings(input){const cfg=normalizeStrategyAiConfig(input);try{localStorage.setItem(AI_SETTINGS_KEY,JSON.stringify(cfg));}catch{/* optional */}return cfg;}
function card(v,aiSurface=STRATEGY_INTERPRETER_SURFACES.CARD){const a=v.aggregate,claims=claimsFromAggregate(a),c=a.total;v.claims=claims;const quick=quickRead(v,claims);
  return `<section class="si-card" data-testid="strategy-card"><div class="si-card-heading"><div><span class="si-kicker">${esc(v.subject.split(':')[0])} / FIELD NOTES</span><h2>${esc(pretty(v.subject))}</h2></div><span class="si-confidence" data-testid="strategy-confidence">${esc(quick.confidence)}</span></div>
    <div class="si-quick" data-testid="quick-read">${quick.html}</div>
    ${semanticsPanel(v)}${aiPanel(v,aiSurface,aiSurface===STRATEGY_INTERPRETER_SURFACES.MATCHUP?'What actually stands out?':'Explain this evidence')}
    <div class="si-kpis"><div><strong>${fmt(c.opportunities)}</strong><span>legal opportunities</span></div><div><strong>${fmt(c.selected)}</strong><span>selections</span></div><div><strong>${pct(c.holdRate)}</strong><span>not selected / available</span></div><div><strong>${fmt(a.seedBlocks)}</strong><span>distinct seed blocks</span></div></div>
    <div class="si-two">${curve(a)}<div><h3>What bots tended to do · observational only</h3><p>Play-now rate: <strong>${pct(c.selectionRate)}</strong></p><p>Skipped opportunities: <strong>${fmt(c.skipped)}</strong>. Later use followed ${fmt(c.subsequentSelected)} of those opportunities in the same game.</p><p>A later use is a follow-up association. Target changes and private choices can make an available line disappear.</p><h3>Watch out for</h3><p>Popular does not mean powerful. Different policies and matchups can produce different habits.</p></div></div>
    <div class="si-timing" role="list">${a.timing.map(t=>`<article role="listitem"><h3>${t.bucket}</h3><strong>${pct(t.selectionRate)}</strong><p>${t.selected} / ${t.opportunities} legal opportunities</p><small>Play / hold verdict: insufficient evidence</small></article>`).join('')}</div>
    <details ${v.expert?'open':''}><summary>Timing & outcome association · exact counts</summary><div class="si-table-wrap"><table><thead><tr><th>Phase</th><th>Opportunity rate</th><th>Selected / available</th><th>Skipped</th><th>Selected game score</th><th>Skipped game score</th><th>Immediate points</th><th>3-decision swing</th></tr></thead><tbody>${a.timing.map(t=>`<tr><th>${t.bucket}</th><td>${pct(t.opportunityRate)}</td><td>${t.selected} / ${t.opportunities}</td><td>${t.skipped}</td><td>${pct(t.selectedOutcomeAssociation)}</td><td>${pct(t.skippedOutcomeAssociation)}</td><td>${fmt(t.immediateScoreDelta)}</td><td>${fmt(t.horizonScoreDelta)}</td></tr>`).join('')}</tbody></table></div><p>Game score = win 1, draw ½, loss 0. Decision-weighted observational association; no causal interval.</p></details>
    ${claims.slice(1).map(c=>`<p>${esc(synthesizeStrategyClaim(c))}</p>`).join('')}${nerd({aggregate:a,claims,controlledClaims:quick.claims})}
    <details><summary>Controlled evidence for this subject · research-only</summary>${v.studies.filter(s=>s.opportunitySubjects.includes(v.subject)).map(s=>`<article><h3>${s.status} · ${s.maturity.bucket}</h3><p>One exact hidden state. These results cannot establish when a player should use or hold this subject.</p>${claimFromStrategyBranch(s).map(c=>`<p>${esc(synthesizeStrategyClaim(c))}</p>`).join('')}${nerd(s)}</article>`).join('')||'<p>No controlled comparisons recorded for this subject in the selected context.</p>'}</details>
    ${informationEvidence(v)}<h3>Expert wrinkle / matchup differences</h3><p>Choose an opponent or a policy above to inspect its actual behavior. Missing evidence stays unknown; changing filters cannot invent a new strategy rule.</p></section>`;
}
function branchPanel(v){return `<section class="si-card"><span class="si-kicker">CONTROLLED CONTINUATION</span><h2>Counterfactual Decision Lab</h2><p>Replay the exact recorded decision. Freeze the branch set and continuation catalog, then run every planned outcome.</p><p class="si-warning"><strong>RESEARCH-ONLY / NOT PLAYER-ACTIONABLE.</strong> Hidden engine state stays fixed. These studies cannot teach a player what to do from hidden information.</p>
  <label>Recorded legal opportunity<select id="si-decision">${v.decisions.map((r,i)=>`<option value="${i}" ${i===v.decisions.findIndex(r=>r.branchAvailable)?'selected':''} ${r.branchAvailable?'':'disabled'}>${esc(`${r.event.identity.policyId} · game ${r.event.identity.gameOrdinal+1} · decision ${r.event.decisionOrdinal} · ${r.event.maturity.bucket}${r.branchAvailable?'':' · transcript / frozen policy pair unavailable'}`)}</option>`).join('')||'<option>No recorded decisions in this context</option>'}</select></label>
  <div class="si-filters"><label>Fixed continuations per branch<input id="si-branch-budget" type="number" min="2" max="128" value="16"></label><label>Decision budget per continuation<input id="si-branch-limit" type="number" min="1" max="1800" value="300"></label></div><button data-si-action="branch" class="si-primary" ${!v.decisions.some(r=>r.branchAvailable)||scope(v).historical?'disabled':''}>Commit plan & run branches</button><div id="si-plan" aria-live="polite"></div>
  ${v.studies.map(s=>`<article class="si-study"><h3>${s.status} · ${s.plan.seeds.length} × ${s.plan.actionIds.length} fixed outcomes</h3><p>${s.informationScope} · ${s.faults} non-clean outcomes</p>${s.comparisons.map(c=>`<p>${esc(c.alternativeLabel)}: ${(c.delta*100).toFixed(1)} pp · 95% familywise bounds [${(c.interval[0]*100).toFixed(1)}, ${(c.interval[1]*100).toFixed(1)}] pp</p>`).join('')}${nerd(s)}</article>`).join('')||'<p>No controlled studies yet. Record deep evidence first.</p>'}</section>`;}
// Provenance classification for the evidence list. Sealed evidence carries
// only origin + purpose; producer lineage comes from the provenance index
// written at registration time. Rows saved before provenance indexing fall
// back to their sealed origin — unknown lineage is never invented.
const SOURCE_PRODUCER_BADGE={ARENA:'ARENA',BATCH_MATRIX:'BATCH',EXPERIMENT:'EXPERIMENT',LOCAL_PLAYER:'LOCAL',LOCAL_NETWORK_SUMMARY:'NETWORK',LOCAL_LEGACY_SUMMARY:'LEGACY',LOCAL_PROFILE_SUMMARY:'PROFILE'};
function sourceClass(s,v){
  const imported=s.origin==='IMPORTED_UNVERIFIED';
  const producer=v.provenance?.get(s.runId)?.producer;
  const base=producer??{LOCAL_PLAYER:'LOCAL',LOCAL_NETWORK_SUMMARY:'NETWORK',LOCAL_LEGACY_SUMMARY:'LEGACY',LOCAL_PROFILE_SUMMARY:'PROFILE'}[s.origin]??'ARENA';
  const badge=`${imported?'IMPORTED ':''}${SOURCE_PRODUCER_BADGE[base]??base}`;
  const cls={ARENA:'arena',BATCH_MATRIX:'batch',EXPERIMENT:'experiment',LOCAL:'played',NETWORK:'played',LEGACY:'played',PROFILE:'experiment'}[base]??'arena';
  return {badge,classes:`${cls}${imported?' imported':''}`,matrixId:v.provenance?.get(s.runId)?.matrixId??null};
}
function sourcePanel(v){const rows=v.sources.filter(s=>!v.sourceFilter||sourceClass(s,v).classes.split(' ').includes(v.sourceFilter));return `<section class="si-card"><h2>Evidence desk</h2><p>Arena, Batch Matrix and imported lab artifacts normalize into sealed per-game evidence here — finalized games register automatically as runs complete; the ingest action reconciles anything already saved. Simulated and imported records keep explicit provenance and never rank as live match evidence.</p>
  <div class="si-filters"><label>Policy A<select id="si-producer-a">${STATIC_POLICIES.map(p=>option(p,p,'value')).join('')}${v.roster.filter(r=>r.snapshot).map(r=>option(`agent-profile:${r.id}`,r.displayName,'')).join('')}</select></label><label>Policy B<select id="si-producer-b">${STATIC_POLICIES.map(p=>option(p,p,'tempo')).join('')}${v.roster.filter(r=>r.snapshot).map(r=>option(`agent-profile:${r.id}`,r.displayName,'')).join('')}</select></label><label>Paired games<input id="si-producer-games" type="number" min="2" max="128" step="2" value="8"></label><label>Master seed<input id="si-producer-seed" type="number" min="1" max="4294967295" value="1337"></label><label>Rules profile<select id="si-producer-rules">${LAB_PROFILES.map(p=>option(p,p,v.cohort.rulesProfile)).join('')}</select></label></div>
  <div class="si-actions"><button class="si-primary" data-si-action="collect">Generate decision evidence</button><button data-si-action="sync">Ingest saved Arena / Evolution / Profile evidence</button><button data-si-action="players">Ingest completed local games</button><button data-si-action="export">Export evidence bundle</button><label class="si-import">Import evidence<input id="si-import" type="file" accept=".json,application/json"></label></div>
  <p>${v.sources.length} immutable game / measurement artifacts. ${v.sources.filter(s=>s.fidelity==='FULL_DECISION_EVIDENCE').length} with full decisions. Retained command transcripts enable exact branching; unavailable transcripts are disclosed.</p>
  <details><summary>Sources, historical eras & imports</summary><div class="si-filters"><label>Source<select id="si-source-filter">${[['','All'],['played','Live / played'],['arena','Arena'],['experiment','Experiments'],['batch','Batch'],['imported','Imported']].map(([value,label])=>option(value,label,v.sourceFilter??'')).join('')}</select></label><span>${rows.length} of ${v.sources.length} records shown</span></div>${rows.slice(0,80).map(s=>{const src=sourceClass(s,v);return `<p class="si-source"><strong>${esc(src.badge)}</strong> · ${s.fidelity} · ${esc(s.origin)} · ${s.fingerprint===LAB_IDENTITY.fingerprint?'CURRENT':'HISTORICAL / READ-ONLY'} · ${esc(s.purpose)} · ${s.eventCount} events · ${s.replayHash?'transcript referenced':'no transcript'}${src.matrixId?` · matrix <code>${esc(src.matrixId.slice(0,16))}</code>`:''}<br><code>${esc(s.runId)} / ${s.ordinal}</code></p>`;}).join('')||'<p>No evidence stored for this filter. Generate a small fixed run or ingest existing evidence.</p>'}</details><details><summary>Imported research archive · ${(v.archives??[]).length} unverified artifacts in this era</summary><p>Original studies and claims are preserved for inspection. They do not enter local controlled evidence or the generated guide until reproduced locally.</p>${(v.archives??[]).map(a=>`<article><h3>${esc(a.kind)} · IMPORTED_UNVERIFIED</h3>${nerd(a)}</article>`).join('')||'<p>No imported studies or claims.</p>'}</details>${aiPanel(v,STRATEGY_INTERPRETER_SURFACES.EVIDENCE_DESK,'What evidence do we have — and what are we missing?')}</section>`;}
function paint(v){if(!alive(v))return;
  v.root.innerHTML=`<section aria-label="Field Manual" class="si-workspace" data-testid="strategy-workspace"><header class="si-hero"><div><span class="si-kicker">INTRILEX / STRATEGY INTELLIGENCE</span><h1>${STRATEGY_NAMES.title}</h1><p>What have we learned about playing Intrilex?</p></div><button data-si-action="expert" aria-pressed="${v.expert}">${v.expert?'Expert view':'Noob view'} · switch</button></header>
    <details class="si-onboarding" ${v.onboarding?'open':''}><summary>Learn this in a minute</summary><ol><li>Arena, Evolution and completed games supply evidence.</li><li>Strategy looks for context and repeatable patterns.</li><li>Field Manual shows what that evidence can support.</li><li>Controlled branches test exact decisions; hidden-state studies stay research-only.</li></ol><p><strong>Correlation ≠ proof.</strong> A popular play can still be a bad play. We keep unknowns visible.</p><p>Experimental → Suggestive → Strong → Established. Missing or incompatible evidence: Insufficient.</p>${nerd(STRATEGY_CONFIDENCE)}</details>
    <div class="si-status" id="si-status" role="status" aria-live="polite">${esc(v.message??'Ready.')}</div>${v.error?`<div class="si-error" role="alert">${esc(v.error)} ${v.errorRun?`<button data-si-action="export-run">Export current run</button>`:''} <button data-si-action="retry">Retry</button></div>`:''}${scope(v).historical?'<p class="si-warning">HISTORICAL EVIDENCE · separate era, read-only conclusions. Current execution is disabled.</p>':''}
    <nav class="si-nav" aria-label="Field Manual sections">${[['manual','Cards & timing'],['explorer','Context & matchups'],['compare','Policy / Profile comparison'],['lab','Counterfactual Lab'],['discoveries','Combinations & mistakes'],['guide','Expert guide'],['evidence','Evidence desk']].map(([id,label])=>`<button data-si-tab="${id}" aria-current="${v.tab===id?'page':'false'}">${label}</button>`).join('')}</nav>
    <nav class="si-ranks si-actions" aria-label="Card field manuals">${v.ranks.map(r=>`<button data-si-rank="${esc(r)}" aria-label="Open ${esc(rankName(r))} field manual" aria-pressed="${v.subject===`rank:${r}`}">${esc(r)}</button>`).join('')}</nav>
    <div class="si-actions si-questions" aria-label="Strategy questions">${[['rank:3','When should I use Three?'],['rank:5','Five: early or late?'],['rank:Q','When should I preserve Queen?'],['family:score','Score instead of draw?'],['family:draw','Resource management'],['family:scuttle','Disruption & control'],['combination:super','Combinations & tempo']].map(([subject,label])=>`<button data-si-quick="${subject}">${label}</button>`).join('')}</div>
    ${filters(v)}<div id="si-content">${v.loading?'<p role="status">Reading compatible evidence…</p>':content(v)}</div><button data-si-action="stop" ${v.busy?'':'hidden'}>Stop current work</button></section>`;
  const disabled=v.busy;v.root.querySelectorAll('[data-si-action="information-study"],[data-si-action="collect"],[data-si-action="branch"],[data-si-action="sync"],[data-si-action="players"],#si-import').forEach(b=>{b.disabled=disabled||b.disabled;});
  bind(v);
}
function content(v){
  if(v.tab==='evidence')return sourcePanel(v);
  if(v.tab==='lab')return `${informationPanel(v)}${branchPanel(v)}`;
  if(v.tab==='discoveries')return `<section class="si-card"><h2>Combinations & common mistakes</h2><p>Short motifs are discovery leads. A weak policy choosing a line does not make it a mistake.</p>${v.motifs.map(m=>`<article><h3>${esc(m.sequence.join(' → '))}</h3><p>${m.occurrences} observed windows in ${m.gameCount} games · ${m.evidenceType}</p>${nerd(m)}</article>`).join('')||'<p>No short sequences recorded in this context yet.</p>'}<h3>Candidate regret findings</h3>${mineStrategyMistakes(v.studies).map(m=>`<p>${esc(m.alternative)} · ${(m.estimatedRegret*100).toFixed(1)} pp · RESEARCH-ONLY${nerd(m)}</p>`).join('')||'<p>No supported recurring mistake yet. One hidden-state branch does not establish a habit or a trap.</p>'}</section>`;
  if(v.tab==='guide')return `<section class="si-card"><h2>Expert Strategy Guide</h2><p>Every substantive statement is backed by a sealed claim; claim and source IDs live in the exportable manifest. Unknown strategy categories stay unknown. The deterministic guide below is the scientifically grounded artifact — the optional AI pass only re-explains it and never changes it.</p><button data-si-action="guide" class="si-primary">GENERATE EXPERT STRATEGY GUIDE</button>${v.guide?`<div class="si-actions"><button data-si-action="guide-md">Export guide · Markdown</button><button data-si-action="guide-manifest">Export claim / provenance manifest</button><button data-si-action="guide-ai-md" ${v.aiResults?.[STRATEGY_INTERPRETER_SURFACES.GUIDE]?'':'disabled'}>Export AI interpretation · Markdown</button></div><pre class="si-guide">${esc(v.guide.markdown)}</pre>`:'<p>No guide generated for this era and context yet.</p>'}${aiPanel(v,STRATEGY_INTERPRETER_SURFACES.GUIDE,'Explain guide in Deffy English')}</section>`;
  if(v.tab==='compare')return `<section class="si-card"><h2>What do these policies do differently?</h2><div class="si-filters"><label>Compare by<select id="si-compare-kind">${[['policyId','Policy ID'],['checkpointId','Checkpoint ID'],['profileHead','Profile head version']].map(([id,label])=>option(id,label,v.compareKind??'policyId')).join('')}</select></label><label>Left ID / version<input id="si-compare-left" value="${esc(v.compareLeft??v.filters.policyId??'tempo')}"></label><label>Right ID / version<input id="si-compare-right" value="${esc(v.compareRight??'value')}"></label></div><p>For Profile heads, first choose one Agent Profile in the context filters, then enter its two head versions. Checkpoint IDs are available in Show Nerd Data and the checkpoint filter.</p><button data-si-action="compare">Compare same context</button>${v.comparison?`<div class="si-two">${v.comparison.map(a=>`<article><h3>${esc(a.filters[v.compareKind??'policyId'])}</h3><p>${a.total.selected} / ${a.total.opportunities} · ${pct(a.total.selectionRate)} selected</p><p>${pct(a.total.holdRate)} not selected</p>${nerd(a)}</article>`).join('')}</div><p>Behavior difference is not global policy superiority. Both sides share every other selected filter and the exact evidence era.</p>`:'<p>Comparisons never cross the selected era. Missing observations produce unknown rates.</p>'}${aiPanel(v,STRATEGY_INTERPRETER_SURFACES.POLICY_COMPARE,'Explain the strategic difference')}</section>`;
  return `${v.tab==='explorer'?`<section class="si-question"><h2>Ask a concrete question</h2><p>For “Three, midgame, trailing by 8+, opponent with a large hand,” select rank 3, Midgame, trailing by at least 8 and opponent hand at least 7. Apply the context to see available evidence.</p></section>`:''}${card(v,v.tab==='explorer'?STRATEGY_INTERPRETER_SURFACES.MATCHUP:STRATEGY_INTERPRETER_SURFACES.CARD)}`;
}
async function refresh(v){
  const epoch=++v.queryEpoch;v.loading=true;paint(v);
  try {const s=scope(v),[aggregate,decisions,studies,archives,informationStudies]=await Promise.all([v.store.aggregate(s),v.store.decisions(s),v.store.studies(s),v.store.importedResearch(s),v.store.informationStudies(s)]);if(!alive(v)||epoch!==v.queryEpoch)return;v.aggregate=aggregate;v.decisions=decisions.map(row=>{const source=v.sources.find(s=>s.artifactId===row.evidenceId);return {...row,branchAvailable:Boolean(source?.replayHash&&[row.event.identity.checkpointId,row.event.identity.opponentCheckpointId].every(id=>id&&source.checkpointIds.includes(id)))};});v.studies=studies;v.archives=archives;v.informationStudies=informationStudies;
    // Only complete game envelopes qualify for sequence mining. UI work is bounded.
    const ids=[...new Set(decisions.map(r=>r.evidenceId))].slice(0,12),motifs=[];
    for(const id of ids){const evidence=await v.store.get('evidence',id);if(!alive(v)||epoch!==v.queryEpoch)return;if(evidence)motifs.push(...mineStrategyMotifs(evidence.events,{filters:s.filters}));}
    v.motifs=motifs.sort((a,b)=>b.occurrences-a.occurrences).slice(0,12);
  }catch(error){if(alive(v)&&epoch===v.queryEpoch)v.error=error.message;}
  if(alive(v)&&epoch===v.queryEpoch){v.loading=false;paint(v);}
}
async function reloadSources(v){const [sources,provenance]=await Promise.all([v.store.listSources(),v.store.listProvenance()]);v.sources=sources;
  // One runId can carry several provenance rows (local production plus a later
  // import). Prefer the LOCAL row — a run produced here stays local even when
  // its artifact is exported and re-imported elsewhere.
  const byRun=new Map();for(const row of provenance){const prior=byRun.get(row.runId);if(!prior||(row.origin==='LOCAL'&&prior.origin!=='LOCAL'))byRun.set(row.runId,row);}v.provenance=byRun;
  const cohorts=new Map();const current={fingerprint:LAB_IDENTITY.fingerprint,rulesProfile:'core-advanced-authority',eraId:LAB_IDENTITY.fingerprint};cohorts.set(strategyDigest(current),current);for(const s of v.sources){const c={fingerprint:s.fingerprint,rulesProfile:s.rulesProfile,eraId:s.eraId};cohorts.set(strategyDigest(c),c);}v.cohorts=[...cohorts.values()];v.subjects=[...new Set([...v.ranks.map(r=>`rank:${r}`),...Object.keys(ACTION_PURPOSES).map(f=>`family:${f}`),...['super','ultra','rank10','royal-marriage','queens-court','voltage','solo-wild','wild-sovereignty'].map(f=>`combination:${f}`),...v.sources.flatMap(s=>s.subjects)])];}
// One canonical per-game path shared with Arena streaming and the evidence
// producer: finalized record → runProvenance + strategyGameEvidence →
// addEvidence. Identical input produces identical sealed artifacts, so
// re-ingestion deduplicates.
async function ingestRun(v,run){await ingestRunEvidence(v.store,run,{signal:v.controller?.signal});}
async function work(v,label,fn){if(v.busy)return;v.busy=true;v.controller=new AbortController();v.message=label;v.error='';v.completionNote='';paint(v);try{await fn(v.controller.signal);if(alive(v)){await reloadSources(v);v.message=v.controller.signal.aborted?`Stopped. Completed evidence was retained.${v.completionNote?' '+v.completionNote:''}`:`${label} complete.${v.completionNote?' '+v.completionNote:''}`;}}catch(error){if(alive(v)){v.error=error.message;v.message='Work stopped with an error. Stored evidence remains available.';}}finally{v.busy=false;if(alive(v))await refresh(v);}}
// Progress-aware watchdog: healthy long-running studies may exceed any fixed
// total runtime. The watchdog only fires when no meaningful worker message —
// committed plan, row progress, or result — arrives for the stall interval.
// Elapsed time alone is never evidence of failure; cancellation stays manual.
const STRATEGY_STUDY_STALL_MS=90000;
function runStudyWorker(v,input,signal){return new Promise((resolve,reject)=>{
  const worker=new Worker('worker.js',{type:'module'});v.studyWorker=worker;let done=false;
  const cancel=()=>worker.postMessage({type:'cancel-strategy-study'});
  let watchdog=null;
  const finish=(error,study)=>{if(done)return;done=true;clearTimeout(watchdog);signal.removeEventListener('abort',cancel);worker.terminate();if(v.studyWorker===worker)v.studyWorker=null;v.studyReject=null;error?reject(error):resolve(study);};
  const arm=()=>{clearTimeout(watchdog);watchdog=setTimeout(()=>finish(new Error(`STRATEGY_STUDY_STALLED: no worker progress for ${STRATEGY_STUDY_STALL_MS/1000}s; treated as a stall, not a timeout.`)),STRATEGY_STUDY_STALL_MS);};
  arm();
  v.studyReject=error=>finish(error);signal.addEventListener('abort',cancel,{once:true});
  worker.onmessage=async e=>{if(done||e.data.token!==(input.token??input.plan.artifactId))return;arm();if(e.data.type==='information-plan'){try{await v.store.saveInformationPlan(e.data.informationSet,e.data.plan);if(done||signal.aborted)return;const node=v.root.querySelector('#si-information-plan');if(node)node.innerHTML=nerd(e.data.plan);worker.postMessage({type:'information-plan-committed',token:input.token});}catch(error){finish(error);}return;}if(e.data.type==='strategy-progress')progress(v,`${e.data.completed} / ${e.data.total} committed branch outcomes`);if(e.data.type==='strategy-study'){if(input.token&&signal.aborted)finish(new Error('INFORMATION_STUDY_CANCELLED: committed plan retained; no successful evidence admitted.'));else finish(null,e.data.study);}if(e.data.type==='strategy-fault')finish(new Error(e.data.error));};
  worker.onerror=e=>finish(new Error(e.message??'STRATEGY_WORKER_FAILED'));worker.onmessageerror=()=>finish(new Error('STRATEGY_WORKER_MESSAGE_FAILED'));
  worker.postMessage({type:input.token?'run-information-study':'run-strategy-study',...input});if(signal.aborted)cancel();
});}
function progress(v,text){if(alive(v)){v.message=text;const node=v.root.querySelector('#si-status');if(node)node.textContent=text;}}
function updateInformationPreview(v){
  const node=v.root.querySelector('#si-information-preview');if(!node)return;
  const worlds=Number(v.root.querySelector('#si-world-count')?.value),n=Number(v.root.querySelector('#si-world-continuations')?.value),index=v.root.querySelector('#si-information-decision')?.value;
  const row=index===''?null:v.decisions[Number(index)],actions=row?Math.min(3,row.event.candidates.length):3,cont=Number.isInteger(n)&&n>=1?Math.min(8,n):1;
  if(!Number.isInteger(worlds)||worlds<2){node.textContent='Choose at least 2 hidden worlds for an inferential interval.';return;}
  const alternatives=Math.max(1,actions-1),total=worlds*actions*cont;
  const r=[0,.25,1].map(variance=>informationResolution({worlds,alternatives,variance}).minimumResolvableEffect);
  node.innerHTML=`${worlds} worlds × ${actions} actions × ${cont} continuations = <strong>${total.toLocaleString()} branch executions</strong> · ${INFORMATION_INFERENCE_V3} · minimum meaningful effect 5 pp<br>Approximate resolution: an observed |effect| must exceed ≈${(r[1]*100).toFixed(0)} pp at moderate world-effect dispersion (range ${(r[0]*100).toFixed(0)}–${(r[1]*100).toFixed(0)} pp floor-to-typical; up to ${(r[2]*100).toFixed(0)} pp at worst-case dispersion).${r[1]>.25?' This configuration is mainly useful for detecting very large effects.':''}`;
}
function bind(v){
  for(const id of ['si-world-count','si-world-continuations','si-information-decision'])for(const type of ['input','change'])v.root.querySelector(`#${id}`)?.addEventListener(type,()=>updateInformationPreview(v));
  updateInformationPreview(v);
  v.root.querySelectorAll('[data-si-rank]').forEach(b=>b.onclick=()=>{v.subject=`rank:${b.dataset.siRank}`;v.tab='manual';v.aiResults={};refresh(v);});
  v.root.querySelectorAll('[data-si-quick]').forEach(b=>b.onclick=()=>{v.subject=b.dataset.siQuick;v.tab='manual';v.aiResults={};refresh(v);});
  v.root.querySelectorAll('[data-si-ai-select]').forEach(s=>s.onchange=()=>{if(s.value==='__manual__'){v.root.querySelector('#si-ai-model')?.focus();return;}try{saveStrategyAiSettings({...strategyAiSettings(),model:s.value});v.aiError='';}catch(e){v.aiError=e.message;paint(v);}});
  v.root.querySelectorAll('[data-si-semantic]').forEach(b=>b.onclick=()=>{const cat=b.dataset.siSemantic;v.filters={...v.filters};if(cat==='ANY_USE')delete v.filters.semanticUse;else v.filters.semanticUse=cat;refresh(v);});
  v.root.querySelectorAll('[data-si-tab]').forEach(b=>b.onclick=()=>{v.tab=b.dataset.siTab;paint(v);});
  v.root.querySelector('#si-source-filter')?.addEventListener('change',e=>{v.sourceFilter=e.target.value;paint(v);});
  v.root.querySelector('#si-filter-form').onsubmit=e=>{e.preventDefault();v.subject=v.root.querySelector('#si-subject').value;v.cohort=v.cohorts[Number(v.root.querySelector('#si-cohort').value)];v.filters=Object.fromEntries([...v.root.querySelectorAll('[data-si-filter]')].map(input=>[input.dataset.siFilter,input.value]).filter(([,value])=>value!==''));v.guide=null;v.comparison=null;v.aiResults={};refresh(v);};
  v.root.querySelector('#si-import')?.addEventListener('change',e=>{const file=e.target.files?.[0];if(file)work(v,'Import evidence',async()=>{if(file.size>40*1024*1024)throw new Error('STRATEGY_IMPORT_BUDGET');await v.store.importBundle(await file.text());});});
  v.root.querySelectorAll('[data-si-action]').forEach(b=>b.onclick=()=>{
    const action=b.dataset.siAction;
    if(action==='stop'){v.controller?.abort();return;}
    if(action==='expert'){v.expert=!v.expert;v.onboarding=false;try{localStorage.setItem('intrilex.strategy.onboarded','1');}catch{/* optional preference */}paint(v);return;}
    if(action==='reset'){v.filters={};refresh(v);return;}if(action==='retry'){v.error='';refresh(v);return;}
    if(action==='collect'){
      const input={botA:v.root.querySelector('#si-producer-a').value,botB:v.root.querySelector('#si-producer-b').value,gameCount:Number(v.root.querySelector('#si-producer-games').value),seed:Number(v.root.querySelector('#si-producer-seed').value),profileId:v.root.querySelector('#si-producer-rules').value,kind:'EVALUATION',mirrorSeats:true,workerCount:2,strategicTrace:true};
      if(input.gameCount>128){v.error='Choose at most 128 games for this retention surface.';paint(v);return;}
      work(v,'Generate decision evidence',async signal=>{const prepared=await createProfileArenaRun(input,LAB_IDENTITY,v.profiles),writer=createStrategyEvidenceWriter(v.store);
        // Stream each finalized game's sealed Strategy evidence as it is
        // accepted — a crash or stop mid-series keeps everything committed.
        const result=await executeBrowserSeries(prepared.config,{identity:LAB_IDENTITY,startingCheckpoints:prepared.checkpoints,arenaProfiles:prepared.arenaProfiles,signal,
          onAcceptedGame:(evidence,run)=>writer.offer(run,evidence),
          onProgress:p=>progress(v,`${p.completed} / ${p.total} planned games · ${writer.stats.committed} evidence retained`)});
        v.lastRun=result.run;const retained=await writer.flush();v.cohort={fingerprint:LAB_IDENTITY.fingerprint,rulesProfile:input.profileId,eraId:LAB_IDENTITY.fingerprint};
        let archiveError=null;try{await v.evolution.save(result.run);v.errorRun=null;}catch(e){archiveError=e;v.errorRun=result.run;}
        const faults=result.run.records.filter(r=>!['NORMAL_VICTORY','EXHAUSTED_RESOLUTION','CANONICAL_DRAW'].includes(r.terminationReason)),problems=[];
        v.completionNote=`Strategy evidence: ${retained.committed}/${retained.offered} finalized games retained${retained.pending?` (${retained.pending} writes pending)`:''}.`;
        if(retained.error)problems.push(`Strategy persistence error: ${retained.error}.`);
        for(const e of result.persistErrors??[])problems.push(`Persistence callback error: ${e}`);
        if(archiveError){const size=archiveError.artifactSize?` (${(archiveError.artifactSize/1048576).toFixed(1)} MiB vs ${(archiveError.persistLimit/1048576).toFixed(0)} MiB archive limit)`:'';problems.push(`Full Arena artifact could not be archived${size} — the run remains in memory; export it from here if needed.`);}
        if(faults.length)v.completionNote+=` ${faults.length} non-clean games retained for inspection; they contribute no strategy outcomes.`;
        if(problems.length)v.error=problems.join(' ');});return;
    }
    if(action==='sync'){work(v,'Ingest saved evidence',async signal=>{
      const history=await v.evolution.list();for(const h of history){if(signal.aborted)break;const {run}=await v.evolution.loadForInspection(h.runId);await ingestRun(v,run);progress(v,`Read ${h.runId}`);}
      // Purpose / era remain exactly those of the immutable Profile measurement.
      for(const p of await v.profiles.listProfiles())for(const m of await v.profiles.listArtifacts(p.agentProfileId,'MEASUREMENT_RESULT')){if(signal.aborted)break;const checkpoint=await v.profiles.getCheckpoint(m.body.subjectCheckpointId),manifest=await v.profiles.getArtifact(m.body.manifestId);if(!checkpoint||!manifest)continue;
        const evidence=sealStrategy(STRATEGY_CONTRACTS.evidence,{source:{runId:m.id,ordinal:0,resultHash:m.id,fingerprint:checkpoint.identity.fingerprint,rulesProfile:manifest.body.rulesProfileId,eraId:m.body.eraId,purpose:m.body.purpose,origin:'LOCAL_PROFILE_SUMMARY',createdAt:p.createdAt},fidelity:'SUMMARY_ONLY',clean:false,events:[],aggregates:[],replayHash:null,checkpoints:[checkpoint],identity:checkpoint.identity,summary:{measurementId:m.id,admissibility:'Summary only; no decision opportunities are reconstructed.'}});await v.store.addEvidence(evidence);
      }
    });return;}
    if(action==='players'){work(v,'Ingest completed local games',async()=>{const {ingestLocalPlayerEvidence}=await import('./strategy-player.js?v=09c7519902ec');await ingestLocalPlayerEvidence(v.store);});return;}
    if(action==='export'){work(v,'Export evidence',async()=>download('intrilex-strategy-evidence.json',JSON.stringify(await v.store.exportBundle(scope(v)),null,2)));return;}
    if(action==='export-run'){if(v.errorRun)download(`${v.errorRun.runId}.json`,JSON.stringify(v.errorRun));return;}
    if(action==='ai-enable'){const endpoint=v.root.querySelector('#si-ai-endpoint')?.value,model=v.root.querySelector('#si-ai-model')?.value;let ai;try{ai=saveStrategyAiSettings({mode:STRATEGY_INTERPRETER_MODES.OLLAMA_LOCAL,endpoint,model});v.aiError='';v.aiStatus=null;}catch(e){v.aiError=e.message;paint(v);return;}paint(v);discoverModels(v,ai);return;}
    if(action==='ai-disable'){saveStrategyAiSettings({mode:STRATEGY_INTERPRETER_MODES.OFF});v.aiResults={};v.aiError='';v.aiStatus=null;v.aiModels=null;paint(v);return;}
    if(action==='ai-models'){const endpoint=v.root.querySelector('#si-ai-endpoint')?.value,model=v.root.querySelector('#si-ai-model')?.value;let ai;try{ai=saveStrategyAiSettings({...strategyAiSettings(),endpoint,model});}catch(e){v.aiError=e.message;v.aiStatus=null;paint(v);return;}
      discoverModels(v,ai);return;}
    if(action==='ai-explain'){const ai=strategyAiSettings(),surface=b.dataset.siSurface??STRATEGY_INTERPRETER_SURFACES.CARD;
      if(!ai.model){v.aiError='Choose a local model first — “Check connection & models” lists what is installed.';paint(v);return;}
      work(v,'Explain with local Ollama',async signal=>{
        let packet;try{packet=await aiPacket(v,surface);}catch(e){v.aiError=e.message;return;}
        try{(v.aiResults??={})[surface]=await explainStrategyEvidence({client:strategyAiClient(ai),packet,model:ai.model,signal});v.aiError='';}
        catch(error){if(v.aiResults)delete v.aiResults[surface];v.aiError=`AI interpretation failed: ${aiFail(error)}`;}});return;}
    if(action==='guide'){work(v,'Generate expert guide',async()=>{const s=scope(v),claims=[],subjects=[];for(const subject of v.subjects.filter(s=>s.startsWith('rank:')||s.startsWith('combination:')||s.startsWith('family:'))){const a=await v.store.aggregate({...s,subject});if(a.total.opportunities){claims.push(...claimsFromAggregate(a));subjects.push({subject,aggregate:a});}}for(const study of v.studies)claims.push(...claimFromStrategyBranch(study));for(const study of v.informationStudies??[])claims.push(...claimsFromInformationStudy(study,{identity:LAB_IDENTITY}));v.guide=strategyGuide(claims,{...s,subjects,motifs:v.motifs??[],humanName:pretty});if(v.aiResults)delete v.aiResults.GUIDE;});return;}
    if(action==='guide-md'){download('intrilex-field-manual.md',v.guide.markdown,'text/markdown');return;}if(action==='guide-manifest'){download('intrilex-field-manual-manifest.json',JSON.stringify(v.guide.manifest,null,2));return;}
    if(action==='guide-ai-md'){const r=v.aiResults?.[STRATEGY_INTERPRETER_SURFACES.GUIDE];if(!r)return;download('intrilex-field-manual-ai-interpretation.md',guideAiMarkdown(r),'text/markdown');return;}
    if(action==='compare'){const kind=v.root.querySelector('#si-compare-kind').value,ids=[v.root.querySelector('#si-compare-left').value.trim(),v.root.querySelector('#si-compare-right').value.trim()];v.compareKind=kind;[v.compareLeft,v.compareRight]=ids;work(v,'Compare policies',async()=>{if(ids.some(id=>!id))throw new Error('Enter both comparison IDs.');if(kind==='profileHead'&&!v.filters.agentProfileId)throw new Error('Choose one Agent Profile before comparing its head versions.');v.comparison=await Promise.all(ids.map(id=>v.store.aggregate({...scope(v),filters:{...v.filters,[kind]:id}})));});return;}
    if(action==='information-study'){
      const index=v.root.querySelector('#si-information-decision').value;if(index==='')return;
      const row=v.decisions[Number(index)],event=row?.event;if(!event)return;
      const worldCount=Number(v.root.querySelector('#si-world-count').value),samplerSeed=Number(v.root.querySelector('#si-sampler-seed').value),n=Number(v.root.querySelector('#si-world-continuations').value),decisionLimit=Number(v.root.querySelector('#si-world-limit').value);
      work(v,'Information-set study',async signal=>{if(!Number.isInteger(n)||n<1||n>8)throw new Error('Choose 1–8 continuations per world/action.');const source=await v.store.get('evidence',row.evidenceId),saved=source?.replayHash?await v.store.get('replays',source.replayHash):null;if(!saved)throw new Error('INFORMATION_SET_SAMPLING_UNAVAILABLE: retained transcript missing.');
        const study=await runStudyWorker(v,{token:strategyDigest({eventId:event.artifactId,worldCount,samplerSeed,n,decisionLimit,requestedSubject:v.subject}),event,replay:saved.replay,checkpoints:source.checkpoints,worldCount,samplerSeed,seeds:Array.from({length:n},(_,i)=>101+i),decisionLimit,requestedSubject:v.subject},signal);
        await v.store.saveInformationStudy(study,claimsFromInformationStudy(study,{identity:LAB_IDENTITY}));
      });return;
    }
    if(action==='branch'){
      const row=v.decisions[Number(v.root.querySelector('#si-decision').value)],event=row?.event;if(!event)return;
      const budget=Number(v.root.querySelector('#si-branch-budget').value),limit=Number(v.root.querySelector('#si-branch-limit').value);
      work(v,'Controlled branches',async signal=>{
        if(!Number.isInteger(budget)||budget<2||budget>128)throw new Error('Choose 2–128 fixed continuation seeds.');
        const plan=planStrategyBranch(event,{seeds:Array.from({length:budget},(_,ordinal)=>(Number.parseInt(strategyDigest({stream:'STRATEGY_CONTINUATION_V1',eventId:event.artifactId,ordinal}).slice(0,8),16)>>>0)||1),decisionLimit:limit});
        const source=await v.store.get('evidence',row.evidenceId),saved=source?.replayHash?await v.store.get('replays',source.replayHash):null;if(!saved)throw new Error('Transcript was not retained for this decision. Record a fresh small deep-trace run.');
        const node=v.root.querySelector('#si-plan');if(node)node.innerHTML=nerd(plan);
        const study=await runStudyWorker(v,{event,replay:saved.replay,checkpoints:source.checkpoints,plan},signal);
        await v.store.saveStudy(study,claimFromStrategyBranch(study));
      });
    }
  });
}
export async function renderStrategy(){
  if(owner&&alive(owner)){paint(owner);return;}
  cleanupStrategy();
  const v={root:app,store:new StrategyStore(),evolution:new EvolutionStore(LAB_IDENTITY),profiles:new ProfileStore(new IndexedDbBackend(),{identity:LAB_IDENTITY}),sources:[],cohorts:[],subjects:[],ranks:[],roster:[],filters:{},subject:new URLSearchParams(location.hash.split('?')[1]??'').get('subject')??'rank:3',cohort:{fingerprint:LAB_IDENTITY.fingerprint,rulesProfile:'core-advanced-authority',eraId:LAB_IDENTITY.fingerprint},tab:'manual',expert:false,onboarding:true,loading:true,busy:false,queryEpoch:0,decisions:[],studies:[],motifs:[],aiResults:{},aiStatus:null,aiError:'',aiModels:null,sourceFilter:'',provenance:new Map()};owner=v;
  app.innerHTML='<section aria-label="Field Manual" class="si-workspace" data-testid="strategy-workspace"><h1>FIELD MANUAL</h1><p role="status">Opening the evidence desk…</p></section>';
  try{try{v.onboarding=localStorage.getItem('intrilex.strategy.onboarded')!=='1';}catch{/* optional */}const {RANK_REGISTRY}=await import('../engine/ranks.js?v=09c7519902ec');v.ranks=Object.keys(RANK_REGISTRY);v.rankRegistry=RANK_REGISTRY;v.roster=await profileArenaRoster(v.profiles);await reloadSources(v);if(alive(v))await refresh(v);}catch(error){if(alive(v))app.innerHTML=`<section aria-label="Field Manual" class="si-workspace"><h1>FIELD MANUAL</h1><p role="alert">${esc(error.message)}</p><button id="si-open-retry">Retry evidence storage</button></section>`;app.querySelector('#si-open-retry')?.addEventListener('click',()=>{cleanupStrategy();renderStrategy();});}
}
export function cleanupStrategy(){if(!owner)return;owner.controller?.abort();owner.studyReject?.(new Error('STRATEGY_ROUTE_CLOSED'));owner.queryEpoch++;owner.store.close();owner.evolution.close();owner.profiles.backend.close?.();owner=null;}
