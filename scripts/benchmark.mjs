import { performance } from 'node:perf_hooks';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyAuthorityCertifiedReplay } from '@intrilex/engine-adapter';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const writeReports=process.env.INTRILEX_WRITE_REPORTS!=='0';
const dir=path.join(root,'upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix/replays');
const files=(await readdir(dir)).filter(n=>n.endsWith('.certified.replay.json')&&!n.includes('.public.certified.')).sort();
const started=performance.now();let commands=0,events=0;
for(const name of files){const replay=JSON.parse(await readFile(path.join(dir,name),'utf8'));const result=verifyAuthorityCertifiedReplay(replay);commands+=replay.commands.length;events+=result.events.length;}
const durationMs=performance.now()-started;
let browserParity=null;try{const proof=JSON.parse(await readFile(path.join(root,'reports/browser-parity.json'),'utf8'));browserParity={status:proof.status,aggregateHash:proof.mainThread.aggregateHash,mainThreadDurationMs:proof.mainThread.durationMs,workerDurationMs:proof.worker.durationMs,replayCount:proof.certifiedReplayCount};}catch{}
let autonomyExecutions=null;try{autonomyExecutions=JSON.parse(await readFile(path.join(root,'sample-data/autonomy/execution-manifests.json'),'utf8')).map(({executionId,workerCount,matchCount,durationMs,matchesPerSecond,canonicalResultHash})=>({executionId,workerCount,matchCount,durationMs,matchesPerSecond,canonicalResultHash}));}catch{}
const report={schemaVersion:'4.0.0',environment:{node:process.version,platform:process.platform,arch:process.arch},replayVerification:{workload:{certifiedReplays:files.length,commands,events},durationMs,verifiedReplaysPerSecond:files.length/(durationMs/1000),commandsPerSecond:commands/(durationMs/1000),memoryRssBytes:process.memoryUsage().rss},browserParity,autonomyExecutions,interpretationBoundary:'Replay throughput covers the governing v4.1.2-compatible certified corpus. Campaign throughput covers the engine-owned v4.2.6 core-advanced-authority profile; complete Core, modules, and multiplayer remain outside scope.'};
if(writeReports)await writeFile(path.join(root,'reports/benchmark.json'),JSON.stringify(report,null,2)+'\n');
const autonomySection=autonomyExecutions?`\n## Advanced Core campaign throughput\n\n${autonomyExecutions.map(x=>`- ${x.executionId}: **${x.matchesPerSecond} matches/s** (${x.matchCount} matches; ${x.workerCount} workers)`).join('\n')}\n\nEvery execution produced canonical result hash \`${autonomyExecutions[0].canonicalResultHash}\`.\n`:'';
const browserSection=browserParity?`\n## Chromium parity workload\n\n- Status: **${browserParity.status}**\n- Main thread: **${browserParity.mainThreadDurationMs} ms**\n- Web Worker: **${browserParity.workerDurationMs} ms**\n- Node/browser/Worker hash: \`${browserParity.aggregateHash}\`\n`:'';
if(writeReports)await writeFile(path.join(root,'reports/BENCHMARK_REPORT.md'),`# Benchmark Report\n\n## Node replay verification\n\n- Environment: ${process.version} ${process.platform}/${process.arch}\n- Governing replays: **${files.length}**\n- Commands: **${commands}**\n- Events: **${events}**\n- Duration: **${durationMs.toFixed(2)} ms**\n- Throughput: **${report.replayVerification.verifiedReplaysPerSecond.toFixed(1)} replays/s**\n- RSS: **${(report.replayVerification.memoryRssBytes/1024/1024).toFixed(1)} MiB**\n${browserSection}${autonomySection}\nAdvanced campaign figures apply only to the bounded two-player Core authority profile.\n`);
console.log(`BENCHMARK PASS: ${report.replayVerification.verifiedReplaysPerSecond.toFixed(1)} replays/s; autonomy=${autonomyExecutions?.at(-1)?.matchesPerSecond??'n/a'} matches/s`);


