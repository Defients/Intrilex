import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const matchCount=Number(process.argv[2]??100),startOrdinal=Number(process.argv[3]??0);
if(!Number.isInteger(matchCount)||matchCount<1||matchCount>100000)throw new Error('match count must be 1..100000');
if(!Number.isInteger(startOrdinal)||startOrdinal<0)throw new Error('start ordinal must be non-negative');
if(process.env.INTRILEX_SKIP_BUILD!=='1'){const b=spawnSync('npm',['run','build'],{cwd:root,stdio:'inherit'});if(b.status!==0)process.exit(b.status??1);}
const engine=await import(pathToFileURL(path.join(root,'dist/src/index.js')).href+`?advanced=${Date.now()}`);
const allowed=new Set(['NORMAL_VICTORY','EXHAUSTED_RESOLUTION','CANONICAL_DRAW']);
const terminations={NORMAL_VICTORY:0,EXHAUSTED_RESOLUTION:0,CANONICAL_DRAW:0,DECISION_LIMIT:0,ENGINE_REJECTION:0,UNSUPPORTED_CONFIGURATION:0};
const coverage={royalMarriage:0,superTwoScore:0,superFourExchange:0,superEight:0,superJack:0,rank10Heart:0,rank10SpadeRecovery:0,rank10StackTheft:0,superAce:0,kingSpadeCounter:0,ultraThreeBlack:0,ultraThreeRed:0,ultraTwoBlackTwoRed:0,voltageFiveGyBottom:0};
const eventMap={CORE_ADVANCED_ROYAL_MARRIAGE_RESOLVED:'royalMarriage',CORE_ADVANCED_SUPER_TWO_RESOLVED:'superTwoScore',CORE_ADVANCED_SUPER_FOUR_RESOLVED:'superFourExchange',CORE_ADVANCED_SUPER_EIGHT_RESOLVED:'superEight',CORE_ADVANCED_SUPER_J_RESOLVED:'superJack',CORE_ADVANCED_TEN_HEART_RESOLVED:'rank10Heart',CORE_ADVANCED_TEN_SPADE_RECOVERY_RESOLVED:'rank10SpadeRecovery',CORE_RANK10_STACK_THEFT_DECLARED:'rank10StackTheft',CORE_SUPER_ACE_COUNTER_DECLARED:'superAce',CORE_KING_SPADE_COUNTER_DECLARED:'kingSpadeCounter',CORE_ADVANCED_ULTRA_THREE_BLACK_RESOLVED:'ultraThreeBlack',CORE_ULTRA_THREE_RED_DECLARED:'ultraThreeRed',CORE_ADVANCED_ULTRA_2B2R_RESOLVED:'ultraTwoBlackTwoRed',CORE_ADVANCED_VOLTAGE_FIVE_RESOLVED:'voltageFiveGyBottom'};
const summaries=[];const started=performance.now();
for(let local=0;local<matchCount;local++){
  const ordinal=startOrdinal+local,seed=((0x42400000+Math.imul(ordinal,0x9e3779b1))>>>0)||1;
  const result=engine.runCoreRandomLegalMatch({profileId:'core-advanced-authority',playerIds:['P1','P2'],seatOrder:['P1','P2'],enabledModules:[],seed},12000);
  terminations[result.terminationReason]=(terminations[result.terminationReason]??0)+1;
  const localCoverage={};
  for(const event of result.events){const key=eventMap[event.type];if(key){coverage[key]++;localCoverage[key]=(localCoverage[key]??0)+1;}}
  summaries.push({ordinal,seed,terminationReason:result.terminationReason,winner:result.state.winner,decisions:result.decisions.length,commands:result.commands.length,events:result.events.length,coverage:localCoverage,finalStateHash:engine.hashCanonical(result.state),decisionHash:engine.hashCanonical(result.decisions),commandHash:engine.hashCanonical(result.commands)});
  if((local+1)%25===0||local+1===matchCount)console.log(`advanced campaign ${local+1}/${matchCount}`);
}
const durationMs=Math.round(performance.now()-started),segmentMode=process.env.INTRILEX_SEGMENT==='1';
const noncanonical=Object.entries(terminations).filter(([k,v])=>!allowed.has(k)&&v>0),missing=Object.entries(coverage).filter(([,v])=>v===0).map(([k])=>k);
const report={schemaVersion:'1.0',status:noncanonical.length===0&&(segmentMode||missing.length===0)?'PASS':'FAIL',engineVersion:'4.2.4',rulesAuthorityVersion:'4.1.1',profileId:'core-advanced-authority',startOrdinal,endOrdinalExclusive:startOrdinal+matchCount,matchCount,terminations,coverage,engineRejections:terminations.ENGINE_REJECTION,unsupportedConfigurations:terminations.UNSUPPORTED_CONFIGURATION,maxDecisions:Math.max(...summaries.map(x=>x.decisions)),meanDecisions:Number((summaries.reduce((a,b)=>a+b.decisions,0)/summaries.length).toFixed(4)),resultHash:engine.hashCanonical(summaries),durationMs,matchesPerSecond:Number((matchCount/(durationMs/1000)).toFixed(2)),generatedAt:new Date().toISOString(),summaries};
if(report.status!=='PASS')throw new Error(JSON.stringify({noncanonical,missing,terminations,coverage}));
await mkdir(path.join(root,'reports'),{recursive:true});await writeFile(path.join(root,`reports/core-advanced-segment-${startOrdinal}-${startOrdinal+matchCount}.json`),JSON.stringify(report,null,2)+'\n');
console.log(`CORE ADVANCED SEGMENT PASS: matches=${matchCount}; hash=${report.resultHash}; coverage=${JSON.stringify(coverage)}`);
