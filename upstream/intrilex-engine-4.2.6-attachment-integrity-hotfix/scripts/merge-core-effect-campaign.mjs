import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const engine=await import(pathToFileURL(path.join(root,'dist/src/index.js')).href+`?merge=${Date.now()}`);
const starts=[0,100,200,300,400]; const segments=[];
for(const start of starts) segments.push(JSON.parse(await readFile(path.join(root,`reports/core-effect-segment-${start}-${start+100}.json`),'utf8')));
const summaries=segments.flatMap(s=>s.summaries).sort((a,b)=>a.ordinal-b.ordinal);
if(summaries.length!==500||new Set(summaries.map(x=>x.ordinal)).size!==500||summaries[0].ordinal!==0||summaries.at(-1).ordinal!==499) throw new Error('ordinal coverage failure');
const terminations={}; const actions={}; let durationMs=0;
for(const segment of segments){durationMs+=segment.durationMs;for(const [k,v] of Object.entries(segment.terminations))terminations[k]=(terminations[k]??0)+v;for(const [k,v] of Object.entries(segment.actions))actions[k]=(actions[k]??0)+v;}
const allowed=new Set(['NORMAL_VICTORY','EXHAUSTED_RESOLUTION','CANONICAL_DRAW']);
const noncanonical=Object.entries(terminations).filter(([k,v])=>!allowed.has(k)&&v>0);
const missing=['draw','faceUpSwap','score','scuttle','pass','ace','three','four','attachment','anchor','redJoker','boardLock'].filter(k=>(actions[k]??0)===0);
const report={schemaVersion:'1.0',status:noncanonical.length===0&&missing.length===0?'PASS':'FAIL',engineVersion:'4.2.1',profileId:'core-effect-declaration-authority',matchCount:500,startOrdinal:0,endOrdinalExclusive:500,terminations,actions,engineRejections:terminations.ENGINE_REJECTION??0,unsupportedConfigurations:terminations.UNSUPPORTED_CONFIGURATION??0,maxDecisions:Math.max(...summaries.map(x=>x.decisions)),meanDecisions:Number((summaries.reduce((a,b)=>a+b.decisions,0)/500).toFixed(4)),resultHash:engine.hashCanonical(summaries),durationMs,matchesPerSecond:Number((500/(durationMs/1000)).toFixed(2)),segmentHashes:segments.map(s=>s.resultHash),generatedAt:new Date().toISOString(),summaries};
if(report.status!=='PASS')throw new Error(JSON.stringify({noncanonical,missing}));
await writeFile(path.join(root,'reports/core-effect-authority-stress-500.json'),JSON.stringify(report,null,2)+'\n');
console.log(`CORE EFFECT STRESS MERGE PASS: matches=500; hash=${report.resultHash}; terminations=${JSON.stringify(terminations)}; actions=${JSON.stringify(actions)}`);
