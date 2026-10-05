import { strategyGameEvidence } from './strategy-evidence.mjs';

// Streaming Strategy evidence persistence.
//
// One canonical per-game path is shared by every supported ingestion route:
//   FINALIZED LAB GAME → strategyGameEvidence → store.addEvidence.
// strategyGameEvidence is deterministic, so a game streamed during execution
// and the same game re-ingested from a saved run produce byte-identical
// artifacts — insert deduplicates on immutable artifact/event identity and
// never double-counts decisions.

/** Canonical per-game conversion. Accepts a record or a worker evidence
 * envelope ({record, replay}); replay is attached only when the run's own
 * bounded retention kept it, matching saved-run ingestion exactly. */
export function strategyEvidenceForGame(run, input) {
  const record = input?.record ?? input;
  const evidence = strategyGameEvidence(run, record);
  const replay = evidence.replayHash
    ? run.replays?.find(r => r.ordinal === record.ordinal || r.replayId === record.replayId)?.replay ?? null
    : null;
  return { evidence, replay };
}

/**
 * Bounded, serial Strategy evidence writer for live series.
 *
 * Games are offered only after EvolutionSession has accepted the finalized
 * record — draft Decision Events from unfinished games never reach the
 * store. Writes run through one serialized promise chain; `offer` applies
 * backpressure once `maxPending` writes are queued, so memory stays bounded
 * and nothing is silently dropped. Persistence failures are recorded, never
 * thrown: Strategy storage must never influence game execution.
 */
export function createStrategyEvidenceWriter(store, { maxPending = 64 } = {}) {
  if (!store || typeof store.addEvidence !== 'function') throw new Error('STRATEGY_WRITER_STORE_REQUIRED');
  if (!Number.isSafeInteger(maxPending) || maxPending < 1) throw new Error('STRATEGY_WRITER_BUDGET_INVALID');
  const stats = { offered: 0, accepted: 0, committed: 0, failed: 0, pending: 0, maxPending: 0, error: null };
  let chain = Promise.resolve(), pending = 0;
  const api = {
    stats,
    /** Offer one finalized accepted game. Resolves after the evidence is
     * admitted to the queue (waiting for capacity when the queue is full).
     * Never rejects. */
    async offer(run, input) {
      stats.offered++;
      let unit;
      try { unit = strategyEvidenceForGame(run, input); }
      catch (error) { stats.failed++; stats.error ??= String(error?.message ?? error); return stats; }
      while (pending >= maxPending) await chain;
      pending++; stats.accepted++; stats.pending = pending; stats.maxPending = Math.max(stats.maxPending, pending);
      chain = chain.then(() => store.addEvidence(unit.evidence, unit.replay)).then(
        () => { pending--; stats.pending = pending; stats.committed++; },
        error => { pending--; stats.pending = pending; stats.failed++; stats.error ??= String(error?.message ?? error); });
      return stats;
    },
    /** Resolves when every admitted write has settled; returns a snapshot. */
    async flush() { await chain; return { ...stats, pending: 0 }; }
  };
  return api;
}
