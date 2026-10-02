import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { runLabSeries, verifyLabReplay, artifactEnvelope } from '../packages/simulation-runtime/src/evolution-lab.mjs';

const value = (name, fallback) => { const index=process.argv.indexOf(name); return index < 0 ? fallback : process.argv[index+1]; };
const games=Number(value('--games','2000')), workers=Number(value('--workers','4'));
const output=path.resolve(value('--out','reports/local/evolution-benchmark.json'));
const controller=new AbortController();
process.once('SIGINT',() => controller.abort());
const result=await runLabSeries({botA:value('--a','score-rush'),botB:value('--b','control'),gameCount:games,workerCount:workers,seed:Number(value('--seed','1337')),kind:'EVALUATION',mirrorSeats:true,profileId:value('--profile','core-advanced-authority')}, {
  signal:controller.signal, onProgress: p => { if (p.completed % 100 === 0) console.log(`${p.completed}/${p.total} recorded`); },
});
const replayErrors=[];
for (const replay of result.run.replays) {
  try { verifyLabReplay(result.run,replay); }
  catch(error) { replayErrors.push({ordinal:replay.ordinal,replayId:replay.replayId,error:error.message}); }
}
await mkdir(path.dirname(output),{recursive:true});
const report={schemaVersion:1,generatedAt:new Date().toISOString(),status:result.run.status,metrics:result.metrics,gamesPerSecond:result.gamesPerSecond,elapsedMs:result.run.elapsedMs,replayErrors,replaysVerified:result.run.replays.length-replayErrors.length,artifact:artifactEnvelope(result.run)};
await writeFile(`${output}.tmp`,JSON.stringify(report)); await rename(`${output}.tmp`,output);
console.log(JSON.stringify({status:report.status,games:result.metrics.games,aborted:result.metrics.aborted,gamesPerSecond:report.gamesPerSecond,replaysVerified:report.replaysVerified,output},null,2));
if (result.run.status !== 'COMPLETE' || result.metrics.aborted || result.metrics.unresolved || replayErrors.length) process.exitCode=1;
