import { performance } from 'node:perf_hooks';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashCanonical } from '@intrilex/shared';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const writeReports=process.env.INTRILEX_WRITE_REPORTS!=='0';
const raw=await readFile(path.join(root,'sample-data/autonomy/match-summaries.ndjson'),'utf8');
const analyticsRaw=await readFile(path.join(root,'sample-data/observatory/analytics.json'),'utf8');
const measure=(fn,iterations=1)=>{const values=[];let result;for(let i=0;i<iterations;i+=1){const t=performance.now();result=fn();values.push(performance.now()-t);}values.sort((a,b)=>a-b);return{result,minMs:values[0],medianMs:values[Math.floor(values.length/2)],p95Ms:values[Math.min(values.length-1,Math.floor(values.length*.95))],maxMs:values.at(-1),iterations};};
const parse=measure(()=>raw.trim().split('\n').map(JSON.parse),15),summaries=parse.result;
const analyticsParse=measure(()=>JSON.parse(analyticsRaw),15),analytics=analyticsParse.result;
const scaled=Array.from({length:10800},(_,i)=>({...summaries[i%summaries.length],benchmarkOrdinal:i}));
const crossFilter=measure(()=>scaled.filter(x=>x.profileId==='core-advanced-authority'&&x.terminationReason!=='ABORTED'&&x.policyIds.includes('control')&&x.responseDecisionCount>=0),120);
const mechanicsFilter=measure(()=>analytics.mechanics.filter(x=>x.evidenceGrade!=='insufficient'&&x.selectionCount>0).sort((a,b)=>b.selectionCount-a.selectionCount).slice(0,50),120);
const synergyFilter=measure(()=>analytics.synergies.filter(x=>x.jointOpportunityCount>=5&&x.status!=='unsupported').sort((a,b)=>Math.abs(b.shrunkEffect)-Math.abs(a.shrunkEffect)).slice(0,50),120);
const memoryBefore=process.memoryUsage().rss;let checksum='';for(let i=0;i<5;i+=1)checksum=hashCanonical({scaled:scaled.map(x=>x.matchResultHash),mechanics:mechanicsFilter.result.map(x=>x.mechanic),synergies:synergyFilter.result.map(x=>x.id)});const memoryAfter=process.memoryUsage().rss;
const report={schemaVersion:'1.0.0',status:crossFilter.p95Ms<=200?'PASS':'CONDITIONAL',environment:{node:process.version,platform:process.platform,arch:process.arch},workloads:{sourceMatches:summaries.length,scaledReferenceMatches:scaled.length,mechanics:analytics.mechanics.length,synergies:analytics.synergies.length},measurements:{summaryParse:parse,analyticsParse,scaledCrossFilter:crossFilter,mechanicsFilter,synergyFilter,memoryGrowthBytes:Math.max(0,memoryAfter-memoryBefore)},referenceNote:'The 10,800-row responsiveness workload deterministically repeats the 100 certified summaries to test scale mechanics only; it is not additional gameplay evidence.',checksum};
for(const group of Object.values(report.measurements))if(group?.result)delete group.result;
if(writeReports){await writeFile(path.join(root,'reports/observatory-performance.json'),JSON.stringify(report,null,2)+'\n');await writeFile(path.join(root,'reports/PERFORMANCE.md'),`# Performance\n\nStatus: **${report.status}**\n\n## Environment\n\n- ${process.version} ${process.platform}/${process.arch}\n- Certified summaries: **${summaries.length}**\n- Scaled responsiveness rows: **10,800** (deterministic repetition for UI-scale testing only)\n- Mechanics: **${analytics.mechanics.length}**\n- Synergy estimates: **${analytics.synergies.length}**\n\n## Measurements\n\n| Workload | Median | p95 |\n|---|---:|---:|\n| Summary NDJSON parse | ${parse.medianMs.toFixed(2)} ms | ${parse.p95Ms.toFixed(2)} ms |\n| Observatory JSON parse | ${analyticsParse.medianMs.toFixed(2)} ms | ${analyticsParse.p95Ms.toFixed(2)} ms |\n| 10,800-row cross-filter | ${crossFilter.medianMs.toFixed(2)} ms | ${crossFilter.p95Ms.toFixed(2)} ms |\n| Mechanics filter/rank | ${mechanicsFilter.medianMs.toFixed(2)} ms | ${mechanicsFilter.p95Ms.toFixed(2)} ms |\n| Synergy filter/rank | ${synergyFilter.medianMs.toFixed(2)} ms | ${synergyFilter.p95Ms.toFixed(2)} ms |\n\nCross-filter p95 is ${crossFilter.p95Ms<=200?'within':'above'} the 200 ms target. The 10,800-row workload measures data interaction scale, not 10,800 independent match findings. Browser frame-time evidence is limited to rendered Chromium smoke and responsive screenshots; no unsupported frame-rate claim is made.\n`);}
console.log(`OBSERVATORY BENCHMARK ${report.status}: 10800-row p95=${crossFilter.p95Ms.toFixed(2)}ms; analytics=${analyticsParse.p95Ms.toFixed(2)}ms`);
if(report.status==='FAIL')process.exit(1);
