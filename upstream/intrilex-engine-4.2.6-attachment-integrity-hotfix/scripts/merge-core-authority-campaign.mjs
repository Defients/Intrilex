import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engine = await import(pathToFileURL(path.join(root, 'dist/src/index.js')).href + `?merge=${Date.now()}`);
const ranges = [[0,100],[100,200],[200,300],[300,400],[400,500]];
const segments = [];
for (const [start,end] of ranges) segments.push(JSON.parse(await readFile(path.join(root, `reports/core-authority-segment-${start}-${end}.json`),'utf8')));
const summaries = segments.flatMap((segment) => segment.summaries).sort((a,b)=>a.ordinal-b.ordinal);
if (summaries.length !== 500) throw new Error(`Expected 500 summaries, found ${summaries.length}`);
for (let index=0; index<500; index++) if (summaries[index]?.ordinal !== index) throw new Error(`Ordinal gap/duplicate at ${index}`);
const terminations = {};
const actions = { startSwap:0, draw:0, faceUpSwap:0, score:0, scuttle:0, pass:0 };
for (const segment of segments) {
  if (segment.status !== 'PASS') throw new Error(`Segment ${segment.startOrdinal} failed`);
  for (const [key,value] of Object.entries(segment.terminations)) terminations[key]=(terminations[key]??0)+value;
  for (const [key,value] of Object.entries(segment.actions)) actions[key]+=value;
}
const canonicalSummaries = summaries.map(({ordinal,seed,terminationReason,winner,decisions,commands,events,finalStateHash,decisionHash})=>({ordinal,seed,terminationReason,winner,decisions,commands,events,finalStateHash,decisionHash}));
const report = { schemaVersion:'1.0', status:'PASS', engineVersion:'4.2.0', profileId:'core-foundation-authority', matchCount:500, ordinalCoverage:{start:0,endExclusive:500,complete:true}, terminations, actions, maxDecisions:Math.max(...summaries.map(x=>x.decisions)), meanDecisions:Number((summaries.reduce((s,x)=>s+x.decisions,0)/500).toFixed(4)), resultHash:engine.hashCanonical(canonicalSummaries), segmentHashes:segments.map(s=>({startOrdinal:s.startOrdinal,endOrdinalExclusive:s.endOrdinalExclusive,resultHash:s.resultHash})), generatedAt:new Date().toISOString(), summaries:canonicalSummaries };
await writeFile(path.join(root,'reports/core-authority-stress-500.json'),JSON.stringify(report,null,2)+'\n');
console.log(`CORE AUTHORITY MERGE PASS: matches=500; hash=${report.resultHash}; terminations=${JSON.stringify(terminations)}`);
