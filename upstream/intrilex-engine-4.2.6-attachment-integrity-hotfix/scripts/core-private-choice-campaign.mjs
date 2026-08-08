import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const matchCount=Number(process.argv[2]??100), startOrdinal=Number(process.argv[3]??0);
if(!Number.isInteger(matchCount)||matchCount<1||matchCount>100000)throw new Error('match count must be 1..100000');
if(!Number.isInteger(startOrdinal)||startOrdinal<0)throw new Error('start ordinal must be non-negative');
if(process.env.INTRILEX_SKIP_BUILD!=='1'){const r=spawnSync('npm',['run','build'],{cwd:root,stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);}
const engine=await import(pathToFileURL(path.join(root,'dist/src/index.js')).href+`?corechoice=${Date.now()}`);
const allowed=new Set(['NORMAL_VICTORY','EXHAUSTED_RESOLUTION','CANONICAL_DRAW']);
const terminations={NORMAL_VICTORY:0,EXHAUSTED_RESOLUTION:0,CANONICAL_DRAW:0,DECISION_LIMIT:0,ENGINE_REJECTION:0,UNSUPPORTED_CONFIGURATION:0};
const choices={'core-rank3-present':0,'core-rank3-take':0,'core-rank3-discard':0,'core-rank5-rummage':0,'core-rank6-dig':0,'core-rank7-assign':0,'core-rank7-generated-effect':0,'core-nine-anchor-discard':0};
const responses={ace:0,spadeAce:0,eightCounter:0,kingCounter:0,jackDisrupt:0,nineTap:0,eightSpadeScuttle:0,eightAegis:0,queenAegis:0};
const summaries=[];const started=performance.now();
for(let local=0;local<matchCount;local++){
 const ordinal=startOrdinal+local;const seed=((0x42300000+Math.imul(ordinal,0x9e3779b1))>>>0)||1;
 const result=engine.runCoreRandomLegalMatch({profileId:'core-private-choice-authority',playerIds:['P1','P2'],seatOrder:['P1','P2'],enabledModules:[],seed},7000);
 terminations[result.terminationReason]=(terminations[result.terminationReason]??0)+1;
 for(const command of result.commands){if(command.type==='RESOLVE_CORE_AUTHORITY_ACTION'&&command.action.kind==='core-submit-private-choice'){const kind=command.action.submission.kind;if(Object.hasOwn(choices,kind))choices[kind]++;}}
 for(const event of result.events){
  if(event.type==='CORE_ACE_COUNTER_DECLARED')responses.ace++; else if(event.type==='CORE_SPADE_ACE_COUNTER_DECLARED')responses.spadeAce++;
  else if(event.type==='CORE_EIGHT_SCUTTLE_COUNTER_DECLARED')responses.eightCounter++; else if(event.type==='CORE_KING_COUNTER_DECLARED')responses.kingCounter++;
  else if(event.type==='CORE_JACK_DISRUPT_DECLARED')responses.jackDisrupt++; else if(event.type==='CORE_NINE_TAP_DECLARED')responses.nineTap++;
  else if(event.type==='CORE_EIGHT_SPADE_SCUTTLE_DECLARED')responses.eightSpadeScuttle++; else if(event.type==='CORE_EIGHT_AEGIS_FIELD_DECLARED')responses.eightAegis++;
  else if(event.type==='CORE_QUEEN_AEGIS_QUICK_DECLARED')responses.queenAegis++;
 }
 const choiceCommands=result.commands.filter(c=>c.type==='RESOLVE_CORE_AUTHORITY_ACTION'&&c.action.kind==='core-submit-private-choice');
 summaries.push({ordinal,seed,terminationReason:result.terminationReason,winner:result.state.winner,decisions:result.decisions.length,commands:result.commands.length,events:result.events.length,privateChoices:choiceCommands.length,finalStateHash:engine.hashCanonical(result.state),decisionHash:engine.hashCanonical(result.decisions),choiceHash:engine.hashCanonical(choiceCommands)});
 if((local+1)%50===0||local+1===matchCount)console.log(`core private choice campaign ${local+1}/${matchCount}`);
}
const durationMs=Math.round(performance.now()-started);const noncanonical=Object.entries(terminations).filter(([k,v])=>!allowed.has(k)&&v>0);const segmentMode=process.env.INTRILEX_SEGMENT==='1';const missing=Object.entries(choices).filter(([,v])=>v===0).map(([k])=>k);
const report={schemaVersion:'1.0',status:noncanonical.length===0&&(segmentMode||missing.length===0)?'PASS':'FAIL',engineVersion:'4.2.3',rulesAuthorityVersion:'4.1.1',profileId:'core-private-choice-authority',startOrdinal,endOrdinalExclusive:startOrdinal+matchCount,matchCount,terminations,choices,responses,engineRejections:terminations.ENGINE_REJECTION,unsupportedConfigurations:terminations.UNSUPPORTED_CONFIGURATION,maxDecisions:Math.max(...summaries.map(x=>x.decisions)),meanDecisions:Number((summaries.reduce((a,b)=>a+b.decisions,0)/summaries.length).toFixed(4)),privateChoiceDecisionCount:summaries.reduce((a,b)=>a+b.privateChoices,0),resultHash:engine.hashCanonical(summaries),durationMs,matchesPerSecond:Number((matchCount/(durationMs/1000)).toFixed(2)),generatedAt:new Date().toISOString(),summaries};
if(report.status!=='PASS')throw new Error(JSON.stringify({noncanonical,missing,terminations,choices}));
await mkdir(path.join(root,'reports'),{recursive:true});await writeFile(path.join(root,`reports/core-private-choice-segment-${startOrdinal}-${startOrdinal+matchCount}.json`),JSON.stringify(report,null,2)+'\n');
console.log(`CORE PRIVATE CHOICE SEGMENT PASS: matches=${matchCount}; hash=${report.resultHash}; choices=${report.privateChoiceDecisionCount}`);
