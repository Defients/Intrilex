import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engine = await import(pathToFileURL(path.join(root, 'dist/src/index.js')).href + `?merge=${Date.now()}`);
const total = Number(process.argv[2] ?? 500);
const segmentSize = Number(process.argv[3] ?? 100);
const segments = [];
for (let start = 0; start < total; start += segmentSize) {
  const end = Math.min(total, start + segmentSize);
  const file = path.join(root, `reports/private-choice-authority-segment-${start}-${end}.json`);
  const report = JSON.parse(await readFile(file, 'utf8'));
  if (report.status !== 'PASS' || report.startOrdinal !== start || report.endOrdinalExclusive !== end || report.summaries.length !== end - start) throw new Error(`Invalid segment ${file}`);
  segments.push(report);
}
const summaries = segments.flatMap((segment) => segment.summaries).sort((a,b)=>a.ordinal-b.ordinal);
if (summaries.length !== total || summaries.some((row,index)=>row.ordinal!==index)) throw new Error('Ordinal coverage mismatch');
const sumObject = (key) => Object.fromEntries(Object.keys(segments[0][key]).map((name)=>[name,segments.reduce((sum,segment)=>sum+(segment[key][name]??0),0)]));
const terminations = sumObject('terminations');
const responses = sumObject('responses');
const privateChoices = sumObject('privateChoices');
const report = {
  schemaVersion:'1.0', status:'PASS', engineVersion:'4.1.4', profileId:'first-contact-private-choice',
  startOrdinal:0, endOrdinalExclusive:total, matchCount:total,
  terminations, responses, privateChoices,
  engineRejections:segments.reduce((sum,s)=>sum+s.engineRejections,0),
  maxDecisions:Math.max(...summaries.map((row)=>row.decisions)),
  meanDecisions:Number((summaries.reduce((sum,row)=>sum+row.decisions,0)/summaries.length).toFixed(4)),
  privateChoiceDecisionCount:summaries.reduce((sum,row)=>sum+row.privateChoiceDecisions,0),
  resultHash:engine.hashCanonical(summaries),
  segmentHashes:segments.map((s)=>({start:s.startOrdinal,end:s.endOrdinalExclusive,resultHash:s.resultHash})),
  generatedAt:new Date().toISOString()
};
const allowed = new Set(['NORMAL_VICTORY','EXHAUSTED_RESOLUTION','CANONICAL_DRAW']);
if (Object.entries(terminations).some(([k,v])=>!allowed.has(k)&&v!==0) || report.engineRejections!==0 || Object.values(privateChoices).some((v)=>v===0)) throw new Error(`Merged campaign failed: ${JSON.stringify(report)}`);
await writeFile(path.join(root, `reports/private-choice-authority-stress-${total}.json`), JSON.stringify(report,null,2)+'\n');
console.log(`PRIVATE CHOICE CAMPAIGN MERGE PASS: matches=${total}; hash=${report.resultHash}; choices=${report.privateChoiceDecisionCount}`);
