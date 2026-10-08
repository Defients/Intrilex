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
    if (settled) return; settled = true;
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
    if (!finishing) enqueue(() => heartbeat(token));
  }, 15000) : null;
  return {
    token, done,
    cancel: () => stop('cancelled', error('CAMPAIGN_CANCELLED')),
    attach(worker, { index, config }) {
      if (stopped || finishing || workers.has(index)) throw error('CAMPAIGN_EXECUTION_CLOSED');
      const entry = { worker, timer: null, finished: false }; workers.set(index, entry); arm(entry);
      worker.onmessage = ({ data: x }) => {
        if (stopped || settled || entry.finished || !matches(x?.execution) || (x.workerIndex ?? x.progress?.workerIndex) !== index) return;
        arm(entry);
        if (x.type === 'autonomy-campaign-progress') onProgress(index, x.progress);
        else if (x.type === 'autonomy-campaign-batch') enqueue(() => commit(x, token));
        else if (x.type === 'autonomy-segment-result') {
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
