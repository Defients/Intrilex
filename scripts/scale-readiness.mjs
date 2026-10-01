import assert from 'node:assert/strict';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import { WebSocket } from 'ws';
import { startServer } from '../apps/match-server/src/server.mjs';
import { captureProvenance } from './release-provenance.mjs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=await startServer({host:'127.0.0.1',port:0,persistent:false,dbPath:':memory:',outboxDurable:false});
const sockets=[],delays=monitorEventLoopDelay({resolution:10});delays.enable();
const report={provenance:captureProvenance(root),scope:'LOCAL_DEVELOPMENT_ADMISSION_AND_HEALTH_ONLY',
  productionDemand:'UNAVAILABLE',decision:'KEEP_SINGLE_INSTANCE',limits:{perIpConnections:10,globalConnections:500,matches:100},samples:[]};
try {
  for(let i=0;i<10;i++) {
    const socket=new WebSocket(`ws://127.0.0.1:${server.httpServer.address().port}`);sockets.push(socket);
    await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  }
  const extra=new WebSocket(`ws://127.0.0.1:${server.httpServer.address().port}`);sockets.push(extra);
  const rejected=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('ADMISSION_REJECTION_TIMEOUT')),5000);
    extra.once('close',(code,reason)=>{clearTimeout(timer);resolve({code,reason:reason.toString()});});
    extra.once('error',error=>{clearTimeout(timer);reject(error);});
  });
  assert.equal(rejected.code,1008);report.admissionRejection=rejected;
  for(let i=0;i<20;i++) {
    const started=performance.now(),response=await fetch(`http://127.0.0.1:${server.httpServer.address().port}/health`);
    assert.equal(response.status,200);
    const health=await response.json();assert.equal(health.activeConnections,10);
    report.samples.push(performance.now()-started);report.health=health;
  }
  const sorted=[...report.samples].sort((a,b)=>a-b);
  report.healthLatencyMs={median:sorted[Math.floor(sorted.length/2)],p95:sorted[Math.floor(sorted.length*.95)]};
  report.eventLoopDelayMs={mean:Number.isFinite(delays.mean)?delays.mean/1e6:null,p95:delays.percentile(95)/1e6};
  report.status='PASS';
} finally {
  delays.disable();for(const socket of sockets) socket.terminate();await server.close();
}
await mkdir(new URL('../reports/local/',import.meta.url),{recursive:true});
await writeFile(new URL('../reports/local/scale-readiness.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
