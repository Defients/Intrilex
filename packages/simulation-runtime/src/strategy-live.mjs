import { strategyGameEvidence } from './strategy-evidence.mjs';

// Streaming Strategy evidence persistence.
//
// One canonical per-game path is shared by every supported ingestion route:
//   FINALIZED LAB GAME → strategyGameEvidence → store.addEvidence.
// strategyGameEvidence is deterministic, so a game streamed during execution
// and the same game re-ingested from a saved run produce byte-identical
// artifacts — insert deduplicates on immutable artifact/event identity and
// never double-counts decisions.

/** Producer channel for an analysis-eligible lab run. The sealed evidence
 * contract deliberately stays free of producer metadata; this lightweight
 * index row answers "where did this run come from" without reopening the
 * sealed artifact. Keyed per (runId, producer, origin) so a locally produced
 * run and a later imported copy of it coexist; identical registrations dedup
 * and contradictory metadata under the same key fails closed. */
export function runProvenance(run) {
  const cell = run?.matrixCell ?? null;
  const producer = cell ? 'BATCH_MATRIX' : run?.researchPurpose ? 'EXPERIMENT' : 'ARENA';
  const origin = run?.evidenceOrigin ?? 'LOCAL';
  return {
    id: `${run?.runId}|${producer}|${origin}`,
    runId: run?.runId ?? null,
    producer, origin,
    purpose: run?.researchPurpose ?? run?.kind ?? 'SELF_PLAY',
    kind: run?.kind ?? 'SELF_PLAY',
    matrixId: cell?.matrixId ?? null,
    seatA: cell?.seatA ?? null, seatB: cell?.seatB ?? null,
    rulesProfile: run?.config?.profileId ?? null,
    fingerprint: run?.identity?.fingerprint ?? null,
    checkpointIds: (run?.checkpoints ?? []).map(c => c.checkpointId),
    agentProfileIds: (run?.arenaProfiles?.snapshots ?? []).map(s => s?.profile?.agentProfileId ?? null),
    profileHeads: (run?.arenaProfiles?.snapshots ?? []).map(s => s?.profile?.headVersion ?? null)
  };
}

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
  const registeredRuns = new Set();
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
      const register = !registeredRuns.has(run?.runId) && typeof store.registerRun === 'function';
      if (register) registeredRuns.add(run.runId);
      while (pending >= maxPending) await chain;
      pending++; stats.accepted++; stats.pending = pending; stats.maxPending = Math.max(stats.maxPending, pending);
      chain = chain.then(async () => {
        // Provenance registration rides the same serial chain but never
        // blocks the evidence write: an index failure is reported, not fatal.
        if (register) try { await store.registerRun(run); } catch (error) { stats.error ??= `provenance index: ${String(error?.message ?? error)}`; }
        await store.addEvidence(unit.evidence, unit.replay);
      }).then(
        () => { pending--; stats.pending = pending; stats.committed++; },
        error => { pending--; stats.pending = pending; stats.failed++; stats.error ??= String(error?.message ?? error); });
      return stats;
    },
    /** Resolves when every admitted write has settled; returns a snapshot. */
    async flush() { await chain; return { ...stats, pending: 0 }; }
  };
  return api;
}

/** Reconciliation ingestion: register one run's provenance row, then offer
 * every finalized record through the canonical per-game path. Byte-identical
 * dedup makes this safe to repeat for resume, reopen, re-save and re-import.
 * Returns the writer stats snapshot; failures are counted, not thrown. */
export async function ingestRunEvidence(store, run, { signal } = {}) {
  const writer = createStrategyEvidenceWriter(store);
  for (const record of run?.records ?? []) {
    if (signal?.aborted) break;
    await writer.offer(run, record);
  }
  return writer.flush();
}
