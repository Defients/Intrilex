import { BROWSER_CAPACITY, assertBrowserCapacity, jsonBytes } from './browser-capacity.mjs';
let epoch = 0;
const error = message => Object.assign(new Error(message), { code: message });

/** One terminal owner for workers, queued commits, cancellation and sealing.
 * Persistence already in flight may settle; queued work stops at first failure.
 * The caller owns view selection; this object owns just one execution. */
export function campaignExecution({ execution, commit, seal, fail, cancel, heartbeat = null,
  onProgress = () => {}, onTerminal = () => {}, timeoutMs = 180000,
  timers = globalThis, epochId = `${Date.now()}:${++epoch}` }) {
  const token = { ...execution, epoch: epochId }, workers = new Map();
  let chain = Promise.resolve(), stopped = false, finishing = false, settled = false;
  let heartbeatPending=false;
  const metrics={pendingBatches:0,pendingBytes:0,peakBatches:0,peakBytes:0,committedBatches:0};
  let resolveDone;
  const done = new Promise(resolve => { resolveDone = resolve; });
  const matches = x => x?.runId === token.runId && x?.ownerId === token.ownerId &&
    x?.fencingToken === token.fencingToken && x?.epoch === token.epoch;
  const terminate = entry => {
    timers.clearTimeout(entry.timer);
    entry.worker.onmessage = entry.worker.onerror = entry.worker.onmessageerror = null;
    try { entry.worker.terminate(); } catch { /* already terminated */ }
  };
  const clear = () => { timers.clearInterval(leaseTimer); for (const entry of workers.values()) terminate(entry); };
  const publish = (state, detail) => {
    if (settled) return; settled = true;metrics.pendingBatches=0;metrics.pendingBytes=0;
    try { onTerminal(state, detail); } finally { resolveDone({ state, detail }); }
  };
  const stop = (state, cause) => {
    if (stopped || settled) return done;
    stopped = true; clear();
    // Await only work already in flight. Every queued callback checks stopped.
    chain.then(async () => {
      try { await (state === 'cancelled' ? cancel(token) : fail(cause, token)); }
      catch (failure) { cause = failure; }
      publish(state, cause);
    });
    return done;
  };
  const enqueue = work => {
    if (stopped || settled) return;
    chain = chain.then(async () => {
      if (stopped || settled) return;
      try { await work(); } catch (cause) { stop('failed', cause); }
    });
  };
  const finish = () => {
    if (finishing || stopped || !workers.size || [...workers.values()].some(w => !w.finished)) return;
    finishing = true; clear();
    chain.then(async () => {
      if (stopped) return;
      try { const result = await seal(token); if (!stopped) publish('complete', result); }
      catch (cause) { stop('failed', cause); }
    });
  };
  const arm = entry => {
    timers.clearTimeout(entry.timer);
    entry.timer = timers.setTimeout(() => stop('failed', error('CAMPAIGN_WORKER_TIMEOUT')), timeoutMs);
  };
  const leaseTimer = heartbeat ? timers.setInterval(() => {
    if (!finishing && !heartbeatPending) { heartbeatPending=true; enqueue(async()=>{try {await heartbeat(token);}finally{heartbeatPending=false;}}); }
  }, 15000) : null;
  return {
    token, done, metrics,
    cancel: () => stop('cancelled', error('CAMPAIGN_CANCELLED')),
    attach(worker, { index, config }) {
      if (stopped || finishing || workers.has(index)) throw error('CAMPAIGN_EXECUTION_CLOSED');
      if(config.matchCount!=null)assertBrowserCapacity(config);
      if(workers.size>=BROWSER_CAPACITY.workers)throw error('BROWSER_WORKER_LIMIT');
      const entry = { worker, timer: null, finished: false, pending:false, sequence:0 }; workers.set(index, entry); arm(entry);
      worker.onmessage = ({ data: x }) => {
        if (stopped || settled || entry.finished || !matches(x?.execution) || (x.workerIndex ?? x.progress?.workerIndex) !== index) return;
        arm(entry);
        if (x.type === 'autonomy-campaign-progress') onProgress(index, x.progress);
        else if (x.type === 'autonomy-campaign-batch') {
          const bytes=jsonBytes(x.summariesJson ?? '[]');
          if(entry.pending || x.batchSequence!==entry.sequence || bytes>BROWSER_CAPACITY.batchBytes || metrics.pendingBytes+bytes>BROWSER_CAPACITY.queuedBytes){stop('failed',error('CAMPAIGN_BACKPRESSURE_VIOLATION'));return;}
          entry.pending=true;metrics.pendingBatches++;metrics.pendingBytes+=bytes;
          metrics.peakBatches=Math.max(metrics.peakBatches,metrics.pendingBatches);metrics.peakBytes=Math.max(metrics.peakBytes,metrics.pendingBytes);
          enqueue(async()=>{try {
            const receipt=await commit(x,token);
            if(!stopped){entry.pending=false;entry.sequence++;metrics.committedBatches++;
              worker.postMessage({type:'autonomy-campaign-ack',execution:token,workerIndex:index,batchSequence:x.batchSequence,receipt:receipt?.receipt ?? receipt});}
          }finally{metrics.pendingBatches--;metrics.pendingBytes-=bytes;}});
        }
        else if (x.type === 'autonomy-segment-result') {
          if(entry.pending){stop('failed',error('CAMPAIGN_COMPLETION_BEFORE_COMMIT'));return;}
          if (x.ok !== true) { stop('failed', error(x.error ?? 'CAMPAIGN_WORKER_FAILED')); return; }
          entry.finished = true; terminate(entry); finish();
        }
      };
      worker.onerror = event => stop('failed', error(event.message ?? 'CAMPAIGN_WORKER_ERROR'));
      worker.onmessageerror = () => stop('failed', error('CAMPAIGN_WORKER_MESSAGE_ERROR'));
      try { worker.postMessage({ type: 'run-autonomy-segment', workerIndex: index, execution: token, config }); }
      catch (cause) { stop('failed', cause); }
    },
    startFailed: cause => stop('failed', cause),
  };
}
