// Rule Mutation Chamber — deterministic worker-segment orchestration.
//
// Lifecycle contract: every segment settles EXACTLY ONCE — by result message,
// by worker error, or by cancel() — and every settlement terminates the
// worker. `Worker.terminate()` never delivers 'message'/'error', so the
// promise returned here can never hang on a cancelled run: cancel() settles
// every still-live segment with a disclosed CANCELLED fault row per spec.
// Messages arriving after settlement are ignored, so a dying worker can never
// mutate a cancelled experiment. cancel() is idempotent.
//
// The module is DOM-free and Worker-free by construction: the browser
// workspace injects `createWorker`, Node tests inject a fake. This keeps the
// lifecycle behaviorally testable without a browser.

/** A spec that never executed becomes an honest fault row — never silently dropped. */
function faultRow(spec, error) {
  return {
    arm: spec.arm, pairIndex: spec.pairIndex, pairedRunId: spec.pairedRunId,
    specOrdinal: spec.ordinal, seed: spec.seed, policyId: spec.policyId,
    policyIds: spec.policyIds, seatOrder: spec.seatOrder,
    ruleOverrides: spec.ruleOverrides ?? null,
    ok: false, error,
  };
}

/**
 * Run one worker per segment. Returns immediately with:
 *   promise — resolves to `results[]` (array of per-spec result rows) once
 *             every segment has settled; can never reject or hang;
 *   cancel(error?) — terminates every live worker and settles its segment
 *             with fault rows; idempotent;
 *   entries — live bookkeeping (each entry: { worker, settled, done });
 *   pending — count of unsettled segments.
 *
 * @param {Array<Array>} segments - plan.specs slices, one per worker
 * @param {{ createWorker: (index: number) => { postMessage: Function, terminate: Function, onmessage: any, onerror: any }, onProgress?: (index: number, delta: number) => void }} deps
 */
export function runMutationSegments(segments, { createWorker, onProgress } = {}) {
  if (typeof createWorker !== 'function') throw new TypeError('createWorker is required');
  const entries = [];
  const promise = Promise.all(segments.map((specs, index) => new Promise((resolve) => {
    const entry = { index, specs, worker: null, done: 0, settled: false };
    // Settle is exactly-once: first call wins, terminates the worker, resolves
    // the segment promise. Every later call — result, error or cancel — is a
    // no-op, so a late message can never re-mutate a settled segment.
    const settle = (produce) => {
      if (entry.settled) return;
      entry.settled = true;
      try { entry.worker?.terminate?.(); } catch { /* already terminated */ }
      resolve(produce());
    };
    entry.settle = settle;
    entries.push(entry);
    try {
      entry.worker = createWorker(index);
    } catch (error) {
      settle(() => specs.map((s) => faultRow(s, `WORKER_SPAWN_FAILED: ${error?.message ?? error}`)));
      return;
    }
    entry.worker.onmessage = (e) => {
      if (entry.settled) return;
      const x = e?.data ?? {};
      if (x.type === 'mutation-segment-progress') {
        const completed = Math.max(entry.done, x.completed ?? 0);
        onProgress?.(index, completed - entry.done);
        entry.done = completed;
      } else if (x.type === 'mutation-segment-result') {
        settle(() => {
          if (x.ok) {
            try { return JSON.parse(x.resultsJson); }
            catch (error) { return specs.map((s) => faultRow(s, `WORKER_RESULT_PARSE_FAILED: ${error?.message ?? error}`)); }
          }
          return specs.map((s) => faultRow(s, x.error ?? 'WORKER_FAULT'));
        });
      }
    };
    entry.worker.onerror = () => settle(() => specs.map((s) => faultRow(s, 'WORKER_FAULT')));
    try {
      entry.worker.postMessage({ type: 'run-mutation-segment', workerIndex: index, specs });
    } catch (error) {
      settle(() => specs.map((s) => faultRow(s, `WORKER_DISPATCH_FAILED: ${error?.message ?? error}`)));
    }
  })));
  return {
    entries,
    promise,
    get pending() { return entries.filter((e) => !e.settled).length; },
    workers: () => entries.map((e) => e.worker).filter(Boolean),
    cancel(error = 'CANCELLED') {
      for (const entry of entries) entry.settle(() => entry.specs.map((s) => faultRow(s, error)));
    },
  };
}
