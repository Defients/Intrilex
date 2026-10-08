import { createManifestHeadline, foldSummariesIntoHeadline } from '../../packages/simulation-runtime/src/experiment-domain.mjs';
/* global queueMicrotask */

/** Transport fixture for storage/publication tests; scientific math has its own suites. */
export class AggregateWorker {
  rows=[];
  postMessage(message) {
    if(message.type==='run-autonomy-aggregate-chunk'){this.rows.push(...JSON.parse(message.summariesJson));queueMicrotask(()=>this.onmessage?.({data:{type:'autonomy-aggregate-ack',sequence:message.sequence}}));}
    if(message.type==='run-autonomy-aggregate-finish') {
      const h=foldSummariesIntoHeadline(createManifestHeadline(),this.rows);
      queueMicrotask(()=>this.onmessage?.({data:{type:'autonomy-aggregate-result',ok:true,
        aggregateJson:JSON.stringify({...h,...message.semantic}),observatoryJson:JSON.stringify({summaries:this.rows})}}));
    }
  }
  terminate() {}
}
