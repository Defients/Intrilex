/** Restricted browser tiers. These are hard bounds, not capacity projections. */
export const BROWSER_CAPACITY = Object.freeze({ games:100, deepGames:10, workers:4,
  batchRows:5, batchBytes:8*1024*1024, queuedBytes:32*1024*1024,
  analysisRows:1000, analysisBytes:32*1024*1024, analysisSources:1000,
  checkpointBytes:32*1024*1024, headerBytes:512*1024 });
const fault=code=>Object.assign(new Error(code),{code});
export const jsonBytes=value=>new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value)).byteLength;
export function assertBrowserCapacity(config) {
  const count=Number(config.gameCount ?? config.matchCount ?? 0);
  const limit=config.strategicTrace===true?BROWSER_CAPACITY.deepGames:BROWSER_CAPACITY.games;
  if(!Number.isInteger(count)||count<1||count>limit)throw fault(`BROWSER_TIER_RESTRICTED_MAX_${limit}`);
  if(Number(config.workerCount ?? config.workers ?? 1)>BROWSER_CAPACITY.workers)throw fault('BROWSER_WORKER_LIMIT');
  return limit;
}
/** Raw analyses keep a fixed, explicit window. Exceeding it leaves the last snapshot intact. */
export function evidenceBudget() {
  let rows=0,bytes=0;
  return { add(chunk) {
    const size=jsonBytes(chunk);
    if(rows+chunk.length>BROWSER_CAPACITY.analysisRows||bytes+size>BROWSER_CAPACITY.analysisBytes)throw fault('EVIDENCE_ANALYSIS_CAPACITY_EXCEEDED');
    rows+=chunk.length;bytes+=size;
  },get metrics(){return {rows,bytes};} };
}
/** One producer credit. The next game batch starts only after its durable receipt. */
export async function runAcknowledgedCampaign(config,{runCampaign,collector,send,onProgress=()=>{}}) {
  assertBrowserCapacity(config);
  const count=Number(config.matchCount),base=Math.max(0,Math.floor(Number(config.ordinalBase)||0));
  const start=base+Math.max(0,Math.min(count,Number(config.ordinalStart)||0));
  const end=base+Math.min(count,config.ordinalEnd!=null?(Number(config.ordinalEnd)||count):count);
  const size=Math.min(config.strategicTrace?1:BROWSER_CAPACITY.batchRows,Math.max(1,Number(config.batchSize)||BROWSER_CAPACITY.batchRows));
  let sequence=0;
  for(let ordinal=start;ordinal<end;ordinal+=size){
    const stop=Math.min(end,ordinal+size);
    const result=runCampaign({...config,ordinalStart:ordinal-base,ordinalEnd:stop-base,batchSize:0,onBatch:null});
    for(const row of result.summaries)collector.add(row);
    const summariesJson=JSON.stringify(result.summaries);
    if(jsonBytes(summariesJson)>BROWSER_CAPACITY.batchBytes)throw fault('CAMPAIGN_BATCH_CAPACITY_EXCEEDED');
    await send({batchSequence:sequence++,ordinalStart:ordinal,ordinalEnd:stop,summariesJson});
    onProgress({completed:stop-start,total:end-start});
  }
  return collector.finish({profileId:config.profileId,policyIds:config.policyIds,matchCount:count});
}

/** Advisory projection from the audit's dated workloads; never a capacity guarantee. */
export function browserSizeEstimate(config) {
  const deep=config.strategicTrace===true,count=Number(config.gameCount ?? config.matchCount);
  return {bytes:count*(deep?440000:117000),basisGames:deep?10:100,source:'October 7, 2026 audit observation',guaranteed:false};
}
