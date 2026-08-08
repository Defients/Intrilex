import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engine = await import(pathToFileURL(path.join(root, 'dist/src/index.js')).href + `?merge=${Date.now()}`);
const ranges = [[0,100],[100,200],[200,300],[300,400],[400,500]];
const segments=[];
for(const [a,b] of ranges) segments.push(JSON.parse(await readFile(path.join(root,`reports/trigger-closure-authority-segment-${a}-${b}.json`),'utf8')));
const summaries=segments.flatMap(s=>s.summaries).sort((a,b)=>a.ordinal-b.ordinal);
if(summaries.length!==500) throw new Error(`summary count ${summaries.length}`);
const seen=new Set();
for(let ordinal=0;ordinal<500;ordinal++){
 const row=summaries[ordinal];
 if(!row||row.ordinal!==ordinal) throw new Error(`missing/misordered ordinal ${ordinal}`);
 if(seen.has(row.ordinal)) throw new Error(`duplicate ordinal ${row.ordinal}`); seen.add(row.ordinal);
 const expected=((0x41500000+Math.imul(ordinal,0x9e3779b1))>>>0)||1;
 if(row.seed!==expected) throw new Error(`seed mismatch ${ordinal}: ${row.seed} != ${expected}`);
}
const sumObject=(key)=>Object.fromEntries(Object.keys(segments[0][key]).map(k=>[k,segments.reduce((n,s)=>n+(s[key][k]??0),0)]));
const terminations=sumObject('terminations'); const triggerEvents=sumObject('triggerEvents'); const responses=sumObject('responses'); const privateChoices=sumObject('privateChoices');
const allowed=new Set(['NORMAL_VICTORY','EXHAUSTED_RESOLUTION','CANONICAL_DRAW']);
const status=Object.entries(terminations).every(([k,v])=>allowed.has(k)||v===0)&&Object.values(triggerEvents).every(v=>v>0)&&privateChoices['rank7-scoring-trigger']>0?'PASS':'FAIL';
const durationMs=segments.reduce((n,s)=>n+s.durationMs,0);
const report={schemaVersion:'1.0',status,engineVersion:'4.1.5',profileId:'first-contact-trigger-closure',matchCount:500,startOrdinal:0,endOrdinalExclusive:500,terminations,triggerEvents,responses,privateChoices,engineRejections:terminations.ENGINE_REJECTION,unsupportedConfigurations:terminations.UNSUPPORTED_CONFIGURATION,maxDecisions:Math.max(...summaries.map(r=>r.decisions)),meanDecisions:Number((summaries.reduce((n,r)=>n+r.decisions,0)/500).toFixed(4)),resultHash:engine.hashCanonical(summaries),segmentHashes:segments.map(s=>({startOrdinal:s.startOrdinal,endOrdinalExclusive:s.endOrdinalExclusive,resultHash:s.resultHash})),durationMs,matchesPerSecond:Number((500/(durationMs/1000)).toFixed(2)),generatedAt:new Date().toISOString(),summaries};
if(status!=='PASS') throw new Error(JSON.stringify(report));
await writeFile(path.join(root,'reports/trigger-closure-authority-stress-500.json'),JSON.stringify(report,null,2)+'\n');
console.log(`TRIGGER CLOSURE MERGE PASS: matches=500; hash=${report.resultHash}; queued=${triggerEvents.queued}; resolved=${triggerEvents.resolved}; choices=${privateChoices['rank7-scoring-trigger']}`);
