// ═══════════════════════════════════════════════════════════════
// experiment-store.mjs — Persistent storage for Experiment runs,
// analysis sets, and run evidence payloads.
//
// Storage shape (IndexedDB 'intrilex-experiment-lab', v2):
//   experiments   { experimentId }  — persistent investigation containers
//   runs          { runId }         — immutable evidence records + lifecycle
//   analysisSets  { analysisSetId } — included-run selection per experiment
//   payloads      { runId }         — heavy per-run evidence (summaries +
//                                     aggregate), or for batched runs the
//                                     batch-descriptor chain + aggregate.
//   manifests     { manifestId }    — mutable run checkpoints updated at
//                                     every committed batch (crash recovery)
//   runBatches    { batchId }       — committed raw evidence batches. Each
//                                     batch is the unit of durability:
//                                     written transactionally with its
//                                     manifest checkpoint.
//
// The store deliberately follows the EvolutionStore conventions: injectable
// IDB factory, byte budgets before write, QuotaExceededError mapped to an
// explicit error code. When IndexedDB is unavailable the same API falls back
// to an in-memory backend — evidence still works for the session but the
// caller can disclose persisted:false.
// ═══════════════════════════════════════════════════════════════

import { hashCanonical } from '../shared-browser.js';

import {
  EXPERIMENT_LIMITS,
  validateExperimentRecord,
  validateRunRecord,
  validateAnalysisSet, createRunManifest, runIdFor, MANIFEST_STATUS, manifestIsActive, manifestInputDigest,
  ordinalReservationEnd, manifestRetainedOrdinals, planManifestBatchCommit,
  foldSummariesIntoHeadline, createManifestHeadline, batchSummariesHash, reconcileRunBatches, manifestCommittedCoverage, payloadEvidenceHash,
} from '../evolution/experiment-domain.mjs';

const DB_NAME = 'intrilex-experiment-lab';
const DB_VERSION = 2;
const STORES = Object.freeze({
  EXPERIMENTS: 'experiments',
  RUNS: 'runs',
  ANALYSIS_SETS: 'analysisSets',
  PAYLOADS: 'payloads',
  MANIFESTS: 'manifests',
  RUN_BATCHES: 'runBatches',
});

const byteSize = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const quotaError = cause => Object.assign(new Error('BROWSER_STORAGE_QUOTA_EXCEEDED'), { code: 'BROWSER_STORAGE_QUOTA_EXCEEDED', cause });
const isQuota = err => err?.name === 'QuotaExceededError' || err?.code === 'BROWSER_STORAGE_QUOTA_EXCEEDED';
const _normalizeTxError = (err) => {
  if (isQuota(err)) return quotaError(err);
  if (err?.name === 'ConstraintError') return Object.assign(new Error('EXPERIMENT_RECORD_EXISTS'), { code: 'EXPERIMENT_RECORD_EXISTS', cause: err });
  return err;
};
const _ownerIsLive = (owner, now = Date.now()) =>
  Boolean(owner?.ownerId) && Number.isFinite(Date.parse(owner?.leaseUntil ?? '')) && Date.parse(owner.leaseUntil) > now;
const _assertSameFence = (stored, incoming, { sealing = false } = {}) => {
  const exp = stored?.owner ?? null;
  const sup = incoming?.owner ?? null;
  if ((exp?.fencingToken ?? null) !== (sup?.fencingToken ?? null) || (exp?.ownerId ?? null) !== (sup?.ownerId ?? null)) {
    throw Object.assign(new Error('RUN_OWNERSHIP_STALE'), { code: 'RUN_OWNERSHIP_STALE', manifestId: stored?.manifestId ?? incoming?.manifestId });
  }
  if (stored?.inputDigest && (incoming?.inputDigest !== stored.inputDigest || manifestInputDigest(incoming) !== stored.inputDigest)) throw Object.assign(new Error('RUN_INPUTS_CHANGED'), { code: 'RUN_INPUTS_CHANGED' });
  if (stored?.owner && (stored.storageRevision ?? 0) !== (incoming.storageRevision ?? 0)) {
    throw Object.assign(new Error('RUN_MANIFEST_VERSION_CONFLICT'), { code: 'RUN_MANIFEST_VERSION_CONFLICT' });
  }
  if (stored?.sealedRunId || (!sealing && [MANIFEST_STATUS.COMPLETED, MANIFEST_STATUS.FAILED, MANIFEST_STATUS.CANCELLED, MANIFEST_STATUS.INTERRUPTED].includes(stored?.status))) {
    throw Object.assign(new Error('RUN_MANIFEST_TERMINAL'), { code: 'RUN_MANIFEST_TERMINAL' });
  }
};
const nextRevision = (stored, incoming) => ({ ...incoming, storageRevision: (stored?.storageRevision ?? 0) + 1 });

// In-memory backend — same async surface as the IDB transaction helpers.
// Used when IndexedDB is unavailable (tests, locked-down browsers).
function createMemoryBackend() {
  const tables = { experiments: new Map(), runs: new Map(), analysisSets: new Map(), payloads: new Map(), manifests: new Map(), runBatches: new Map() };
  return {
    tables, persisted: false,
    async get(store, key) { return structuredClone(tables[store]?.get(key)); },
    async put(store, value, key) { tables[store]?.set(key ?? value[keyPathFor(store)], structuredClone(value)); },
    async del(store, key) { tables[store]?.delete(key); },
    async all(store) { return [...(tables[store]?.values() ?? [])]; },
    async close() {},
  };
}
function keyPathFor(store) {
  return { experiments: 'experimentId', runs: 'runId', analysisSets: 'analysisSetId', payloads: 'runId', manifests: 'manifestId', runBatches: 'batchId' }[store];
}

export class ExperimentStore {
  constructor(factory = globalThis.indexedDB) {
    this.factory = factory ?? null;
    this.db = null;
    this.opening = null;
    this.memory = null; // set once the backend is resolved
    this.persisted = null; // true:idb / false:memory
  }

  async open() {
    if (this.superseded) throw Object.assign(new Error('EXPERIMENT_STORAGE_SUPERSEDED'), { code: 'EXPERIMENT_STORAGE_SUPERSEDED' });
    if (this.db || this.memory) return this;
    if (this.opening) return this.opening.promise;
    if (!this.factory) {
      this.memory = createMemoryBackend();
      this.persisted = false;
      return this;
    }
    const pending = { promise: null, reject: null };
    this.opening = pending;
    pending.promise = new Promise((resolve, reject) => {
      const fail = error => {
        if (this.opening === pending) this.opening = null;
        reject(error);
      };
      let req;
      try { req = this.factory.open(DB_NAME, DB_VERSION); }
      catch (error) { fail(error); return; }
      req.onupgradeneeded = () => {
        if (this.opening !== pending) { req.transaction.abort(); return; }
        const db = req.result;
        if (!db.objectStoreNames.contains(STORES.EXPERIMENTS)) db.createObjectStore(STORES.EXPERIMENTS, { keyPath: 'experimentId' });
        if (!db.objectStoreNames.contains(STORES.RUNS)) db.createObjectStore(STORES.RUNS, { keyPath: 'runId' });
        if (!db.objectStoreNames.contains(STORES.ANALYSIS_SETS)) db.createObjectStore(STORES.ANALYSIS_SETS, { keyPath: 'analysisSetId' });
        if (!db.objectStoreNames.contains(STORES.PAYLOADS)) db.createObjectStore(STORES.PAYLOADS, { keyPath: 'runId' });
        if (!db.objectStoreNames.contains(STORES.MANIFESTS)) db.createObjectStore(STORES.MANIFESTS, { keyPath: 'manifestId' });
        if (!db.objectStoreNames.contains(STORES.RUN_BATCHES)) db.createObjectStore(STORES.RUN_BATCHES, { keyPath: 'batchId' });
      };
      req.onsuccess = () => {
        const db = req.result;
        if (this.opening !== pending) { db.close(); return; }
        this.db = db;
        this.persisted = true;
        this.opening = null;
        db.onversionchange = () => {
          db.close();
          if (this.db === db) { this.db = null; this.persisted = false; this.superseded = true; }
        };
        resolve(this);
      };
      req.onerror = () => fail(req.error ?? new Error('EXPERIMENT_STORAGE_OPEN_FAILED'));
      req.onblocked = () => fail(new Error('EXPERIMENT_STORAGE_BLOCKED'));
    });
    try {
      return await pending.promise;
    } catch (error) {
      this.storageError = error;
      // IndexedDB present but refused (private mode, quota policy): degrade
      // to the session backend rather than failing the lab entirely.
      this.memory = createMemoryBackend();
      this.persisted = false;
      return this;
    }
  }

  async _get(store, key) {
    await this.open();
    if (this.memory) return this.memory.get(store, key);
    const db = this.db;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      let result;
      req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('EXPERIMENT_STORAGE_READ_FAILED'));
    });
  }

  async _all(store) {
    await this.open();
    if (this.memory) return this.memory.all(store);
    const db = this.db;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      let result;
      req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result ?? []);
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('EXPERIMENT_STORAGE_READ_FAILED'));
    });
  }

  /** Put into one or more stores in a single transaction where possible. */
  async _putAll(entries) {
    await this.open();
    if (this.memory) {
      for (const [store, value, key] of entries) await this.memory.put(store, value, key);
      return;
    }
    const db = this.db;
    const storeNames = [...new Set(entries.map(([s]) => s))];
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(isQuota(tx.error) ? quotaError(tx.error) : tx.error ?? new Error('EXPERIMENT_STORAGE_ABORTED'));
      tx.onerror = () => {}; // abort carries the error
      for (const [store, value, key] of entries) {
        tx.objectStore(store).put(value, key);
      }
    });
  }

  async _del(store, key) {
    await this.open();
    if (this.memory) return this.memory.del(store, key);
    const db = this.db;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('EXPERIMENT_STORAGE_DELETE_FAILED'));
    });
  }

  /**
   * Atomic multi-op transaction (R02/R03). `work` receives {get,put,add,del}
   * bound to ONE IndexedDB readwrite transaction — read-modify-write inside
   * `work` is serialized against every other transaction touching the same
   * stores, so ownership claims, fencing checks, and batch commits cannot
   * interleave across tabs. On the memory backend the same surface is
   * serialized through a per-store promise queue.
   */
  async _transact(storeNames, work) {
    await this.open();
    if (this.memory) {
      const mem = this.memory;
      const ops = {
        get: (s, k) => mem.get(s, k),
        all: s => mem.all(s),
        put: (s, v, k) => mem.put(s, v, k),
        add: async (s, v, k) => {
          const existing = await mem.get(s, k ?? v?.[keyPathFor(s)]);
          if (existing != null) throw Object.assign(new Error('EXPERIMENT_RECORD_EXISTS'), { code: 'EXPERIMENT_RECORD_EXISTS' });
          return mem.put(s, v, k);
        },
        del: (s, k) => mem.del(s, k),
      };
      this._memTxQueue ??= Promise.resolve();
      const run = this._memTxQueue.then(async () => {
        const before = structuredClone(mem.tables);
        try { return await work(ops); } catch (error) { for (const [name, table] of Object.entries(before)) mem.tables[name] = table; throw error; }
      });
      this._memTxQueue = run.then(() => {}, () => {});
      return run;
    }
    const db = this.db;
    return new Promise((resolve, reject) => {
      let result;
      let workError = null;
      const tx = db.transaction(storeNames, 'readwrite');
      const wrap = req => new Promise((res, rej) => {
        req.onsuccess = () => res(req.result);
        req.onerror = (event) => {
          // Keep the transaction alive — the work() rejection decides whether
          // to abort, so a recoverable request error doesn't force it.
          event.preventDefault();
          event.stopPropagation();
          rej(req.error ?? new Error('EXPERIMENT_STORAGE_REQUEST_FAILED'));
        };
      });
      const ops = {
        get: (s, k) => wrap(tx.objectStore(s).get(k)),
        all: s => wrap(tx.objectStore(s).getAll()),
        put: (s, v, k) => wrap(tx.objectStore(s).put(v, k)),
        add: (s, v, k) => wrap(tx.objectStore(s).add(v, k)),
        del: (s, k) => wrap(tx.objectStore(s).delete(k)),
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(_normalizeTxError(workError ?? tx.error ?? new Error('EXPERIMENT_STORAGE_ABORTED')));
      tx.onerror = () => {};
      Promise.resolve()
        .then(() => work(ops))
        .then((r) => { result = r; }, (e) => { workError = e; try { tx.abort(); } catch { /* already finished */ } });
    });
  }

  // ── Ownership fencing (R02) ───────────────────────────────────
  /**
   * Atomic run-allocation claim AND sample-range reservation — both land in
   * the same transaction. The unique run occurrence (runId) and the exact
   * sample-ordinal range are computed from the STORE's authoritative state:
   * `config.ordinalStart` is only a request hint — the allocated base
   * continues past every reserved range recorded in this experiment's runs
   * and manifests (sealed, interrupted, failed, cancelled, imported), so two
   * tabs can never execute overlapping deterministic samples. Caller-supplied
   * segments are absolute ranges in the requested-base space; they are
   * rebased onto the allocated range before the manifest is written, so the
   * returned manifest — not the caller's stale frontier — owns the truth.
   */
  async allocateRunManifest({ experimentId, config, segments, batchSize, owner }) {
    return this._transact([STORES.RUNS, STORES.MANIFESTS], async ops => {
      const runs = await ops.all(STORES.RUNS), manifests = await ops.all(STORES.MANIFESTS);
      const relevant = [...runs, ...manifests].filter(r => r.experimentId === experimentId && r.origin !== 'bundled');
      const used = new Set(relevant.map(r => r.ordinal));
      let ordinal = 0; while (used.has(ordinal)) ordinal++;
      const runId = runIdFor(experimentId, ordinal);
      const frontier = ordinalReservationEnd(relevant);
      const count = config.matchCount ?? 0;
      const requestedBase = Number.isInteger(config.ordinalStart) ? config.ordinalStart : 0;
      // A base at-or-above the frontier is honored (gaps in the ordinal
      // stream are legal); a stale base below it is rebased up — a caller's
      // preliminary frontier read can never claim already-reserved samples.
      const base = Math.max(requestedBase, frontier);
      const delta = base - requestedBase;
      const allocConfig = { ...config, ordinalStart: base, ordinalEnd: base + count, ordinalBase: base };
      const allocSegments = segments == null ? null
        : segments.map(s => ({ ...s, ordinalStart: s.ordinalStart + delta, ordinalEnd: s.ordinalEnd + delta }));
      const manifest = { ...createRunManifest({ runId, experimentId, ordinal, config: allocConfig, requestedMatches: count, segments: allocSegments, batchSize, owner }), storageRevision: 0, executionOccurrenceId: `OCC-${globalThis.crypto.randomUUID()}` };
      manifest.inputDigest = manifestInputDigest(manifest);
      if (byteSize(manifest) > EXPERIMENT_LIMITS.metaBytes) throw Object.assign(new Error('RUN_MANIFEST_TOO_LARGE'), { code: 'RUN_MANIFEST_TOO_LARGE' });
      await ops.put(STORES.MANIFESTS, manifest);
      return manifest;
    });
  }

  async claimRunManifest(manifest) {
    if (byteSize(manifest) > EXPERIMENT_LIMITS.metaBytes) {
      throw Object.assign(new Error('RUN_MANIFEST_TOO_LARGE'), { code: 'RUN_MANIFEST_TOO_LARGE' });
    }
    await this._transact([STORES.MANIFESTS, STORES.RUNS], async (ops) => {
      if (await ops.get(STORES.RUNS, manifest.runId)) throw Object.assign(new Error('EXPERIMENT_OCCURRENCE_CONFLICT'), { code: 'EXPERIMENT_OCCURRENCE_CONFLICT' });
      const existing = await ops.get(STORES.MANIFESTS, manifest.manifestId);
      if (existing != null) {
        throw Object.assign(new Error('EXPERIMENT_OCCURRENCE_CONFLICT'), { code: 'EXPERIMENT_OCCURRENCE_CONFLICT', manifestId: manifest.manifestId });
      }
      await ops.put(STORES.MANIFESTS, manifest);
    });
    return manifest.manifestId;
  }

  /**
   * Acquire (or take over after lease expiry) durable ownership of a run
   * manifest. Bumps the fencing token — every mutation that follows carries
   * the new token, so a superseded owner's writes are rejected.
   * Fails RUN_OWNERSHIP_HELD while a different owner's lease is live,
   * RUN_ALREADY_SEALED once the run finalized.
   */
  async acquireManifestOwnership(manifestId, { ownerId, leaseMs = 30000 } = {}) {
    if (!ownerId) throw Object.assign(new Error('RUN_OWNER_ID_REQUIRED'), { code: 'RUN_OWNER_ID_REQUIRED' });
    return this._transact([STORES.MANIFESTS], async (ops) => {
      const cur = await ops.get(STORES.MANIFESTS, manifestId);
      if (!cur) throw Object.assign(new Error('RUN_MANIFEST_MISSING'), { code: 'RUN_MANIFEST_MISSING', manifestId });
      if (cur.resumable !== true && !manifestIsActive(cur)) throw Object.assign(new Error('RUN_NOT_RESUMABLE'), { code: 'RUN_NOT_RESUMABLE' });
      if (cur.sealedRunId) throw Object.assign(new Error('RUN_ALREADY_SEALED'), { code: 'RUN_ALREADY_SEALED', manifestId });
      const now = Date.now(), leaseUntil = new Date(now + leaseMs).toISOString();
      const owner = cur.owner ?? null;
      if (_ownerIsLive(owner, now) && owner.ownerId !== ownerId) {
        throw Object.assign(new Error('RUN_OWNERSHIP_HELD'), { code: 'RUN_OWNERSHIP_HELD', manifestId, holder: owner.ownerId, leaseUntil: owner.leaseUntil });
      }
      const next = {
        ...cur, status: MANIFEST_STATUS.RUNNING, failure: null, storageRevision: (cur.storageRevision ?? 0) + 1,
        owner: {
          ownerId,
          fencingToken: (owner?.fencingToken ?? 0) + 1,
          acquiredAt: new Date(now).toISOString(),
          leaseUntil,
        },
        updatedAt: new Date(now).toISOString(),
      };
      await ops.put(STORES.MANIFESTS, next);
      return next;
    });
  }

  /**
   * Fenced manifest write: the stored manifest's owner token must equal the
   * writer's — a stale owner (superseded by takeover/expiry) is rejected
   * with RUN_OWNERSHIP_STALE. Ownerless legacy manifests pass through.
   */
  async putManifestFenced(manifest) {
    if (byteSize(manifest) > EXPERIMENT_LIMITS.metaBytes) {
      throw Object.assign(new Error('RUN_MANIFEST_TOO_LARGE'), { code: 'RUN_MANIFEST_TOO_LARGE' });
    }
    return this._transact([STORES.MANIFESTS], async (ops) => {
      const cur = await ops.get(STORES.MANIFESTS, manifest.manifestId);
      if (!cur) throw Object.assign(new Error('RUN_MANIFEST_MISSING'), { code: 'RUN_MANIFEST_MISSING', manifestId: manifest.manifestId });
      _assertSameFence(cur, manifest);
      const next = nextRevision(cur, manifest);
      await ops.put(STORES.MANIFESTS, next);
      return next;
    });
  }

  async recoverManifest(manifestId) {
    return this._transact([STORES.MANIFESTS], async ops => {
      const cur = await ops.get(STORES.MANIFESTS, manifestId);
      if (!cur || cur.sealedRunId || !manifestIsActive(cur) || _ownerIsLive(cur.owner)) return cur;
      const next = { ...cur, status: MANIFEST_STATUS.INTERRUPTED, storageRevision: (cur.storageRevision ?? 0) + 1,
        owner: cur.owner ? { ...cur.owner, fencingToken: cur.owner.fencingToken + 1, leaseUntil: new Date(0).toISOString() } : null,
        failure: { message: 'Execution interrupted; explicit resume is required.', phase: 'execution' } };
      await ops.put(STORES.MANIFESTS, next); return next;
    });
  }

  /** Heartbeat: extend the live owner's lease without touching content. */
  async renewManifestLease(manifestId, { ownerId, fencingToken, storageRevision, leaseMs = 30000 } = {}) {
    const now = Date.now();
    return this._transact([STORES.MANIFESTS], async (ops) => {
      const cur = await ops.get(STORES.MANIFESTS, manifestId);
      if (!cur) throw Object.assign(new Error('RUN_MANIFEST_MISSING'), { code: 'RUN_MANIFEST_MISSING', manifestId });
      if (cur.owner?.ownerId !== ownerId || cur.owner?.fencingToken !== fencingToken) {
        throw Object.assign(new Error('RUN_OWNERSHIP_STALE'), { code: 'RUN_OWNERSHIP_STALE', manifestId });
      }
      if (cur.sealedRunId || !manifestIsActive(cur)) throw Object.assign(new Error('RUN_MANIFEST_TERMINAL'), { code: 'RUN_MANIFEST_TERMINAL' });
      if ((cur.storageRevision ?? 0) !== storageRevision) throw Object.assign(new Error('RUN_MANIFEST_VERSION_CONFLICT'), { code: 'RUN_MANIFEST_VERSION_CONFLICT' });
      const next = {
        ...cur,
        owner: { ...cur.owner, leaseUntil: new Date(now + leaseMs).toISOString() },
        updatedAt: new Date(now).toISOString(),
      };
      await ops.put(STORES.MANIFESTS, next);
      return next;
    });
  }

  // ── Experiments ───────────────────────────────────────────────
  async putExperiment(experiment) {
    validateExperimentRecord(experiment);
    if (byteSize(experiment) > EXPERIMENT_LIMITS.metaBytes) {
      throw Object.assign(new Error('EXPERIMENT_META_TOO_LARGE'), { code: 'EXPERIMENT_META_TOO_LARGE' });
    }
    await this._putAll([[STORES.EXPERIMENTS, experiment]]);
    return experiment.experimentId;
  }
  async getExperiment(experimentId) { return (await this._get(STORES.EXPERIMENTS, experimentId)) ?? null; }
  async listExperiments() {
    return (await this._all(STORES.EXPERIMENTS)).sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));
  }

  // ── Runs ──────────────────────────────────────────────────────
  /**
   * Persist a run record and (optionally) its evidence payload atomically.
   * Payload size is budgeted before the write; quota failures surface as
   * BROWSER_STORAGE_QUOTA_EXCEEDED — callers decide whether the run still
   * counts as retained evidence (payloadKind 'session').
   */
  async saveRun(run, payload = null) {
    validateRunRecord(run);
    if (byteSize(run) > EXPERIMENT_LIMITS.metaBytes) {
      throw Object.assign(new Error('RUN_META_TOO_LARGE'), { code: 'RUN_META_TOO_LARGE' });
    }
    const entries = [[STORES.RUNS, run]];
    if (payload) {
      const size = byteSize(payload);
      if (size > EXPERIMENT_LIMITS.persistRunBytes) {
        throw Object.assign(new Error('RUN_PAYLOAD_TOO_LARGE_FOR_BROWSER_ARCHIVE'), { code: 'RUN_PAYLOAD_TOO_LARGE_FOR_BROWSER_ARCHIVE', artifactSize: size, persistLimit: EXPERIMENT_LIMITS.persistRunBytes });
      }
      entries.push([STORES.PAYLOADS, { runId: run.runId, storedAt: new Date().toISOString(), ...payload }]);
    }
    await this._putAll(entries);
    return run.runId;
  }

  /** Lifecycle/curation update — validates identity+hash fields but allows
   * the mutable lifecycle sub-record to change. */
  async updateRun(run) {
    validateRunRecord(run);
    await this._putAll([[STORES.RUNS, run]]);
    return run.runId;
  }

  async getRun(runId) {
    const run = await this._get(STORES.RUNS, runId);
    if (!run) return null;
    try { return validateRunRecord(run); }
    catch (error) { return { ...run, corrupt: true, corruptCode: error?.code ?? 'RUN_HASH_MISMATCH' }; }
  }

  async getRunPayload(runId) { return (await this._get(STORES.PAYLOADS, runId)) ?? null; }

  async listRuns(experimentId = null) {
    const all = (await this._all(STORES.RUNS)).map(run => {
      try { return validateRunRecord(run); }
      catch (error) { return { ...run, corrupt: true, corruptCode: error?.code ?? 'RUN_HASH_MISMATCH' }; }
    });
    const filtered = experimentId ? all.filter(r => r.experimentId === experimentId || r.runId === 'RUN-0000-CERTIFIED-CORPUS') : all;
    return filtered.sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0) || String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));
  }

  // ── Run manifests (durable checkpoints) ───────────────────────
  // Manifests are small mutable records — read/written freely during a run.
  async putManifest(manifest) {
    return this._transact([STORES.MANIFESTS], async ops => {
      const cur = await ops.get(STORES.MANIFESTS, manifest.manifestId);
      if (cur?.owner) { _assertSameFence(cur, manifest); manifest = nextRevision(cur, manifest); }
      if (byteSize(manifest) > EXPERIMENT_LIMITS.metaBytes) throw Object.assign(new Error('RUN_MANIFEST_TOO_LARGE'), { code: 'RUN_MANIFEST_TOO_LARGE' });
      await ops.put(STORES.MANIFESTS, manifest); return manifest.manifestId;
    });
  }
  async getManifest(manifestId) { return (await this._get(STORES.MANIFESTS, manifestId)) ?? null; }
  async listManifests(experimentId = null) {
    const all = await this._all(STORES.MANIFESTS);
    const filtered = experimentId ? all.filter(m => m.experimentId === experimentId) : all;
    return filtered.sort((a, b) => String(a.updatedAt ?? '').localeCompare(String(b.updatedAt ?? '')));
  }

  // ── Run batches (committed raw evidence) ──────────────────────
  /**
   * Atomic batch commit: batch record + manifest checkpoint land in one
   * transaction. A crash mid-transaction commits neither — the manifest
   * can never claim a batch the store does not hold.
   *
   * R02/R03 hardening: inside the same transaction the manifest's owner
   * fence is checked (stale owners rejected with RUN_OWNERSHIP_STALE), the
   * batch id is deduplicated, and STRICT ADMISSION runs against the stored
   * manifest — never the caller's local plan. Ordinals outside the reserved
   * schedule, intra-batch duplicates, range/count mismatches, partial
   * overlaps, unverifiable retries, and digest conflicts are all rejected:
   * a durable `integrityFailures` mark is written, the batch is not stored,
   * and committed coverage does not move. An identical whole-batch retry is
   * an idempotent no-op.
   */
  async commitRunBatch({ manifest, batch }) {
    const size = byteSize(batch);
    if (size > EXPERIMENT_LIMITS.batchBytes) {
      throw Object.assign(new Error('RUN_BATCH_TOO_LARGE_FOR_BROWSER_ARCHIVE'), { code: 'RUN_BATCH_TOO_LARGE_FOR_BROWSER_ARCHIVE', artifactSize: size });
    }
    return this._transact([STORES.RUN_BATCHES, STORES.MANIFESTS], async (ops) => {
      const stored = await ops.get(STORES.MANIFESTS, manifest.manifestId);
      if (!stored) throw Object.assign(new Error('RUN_MANIFEST_MISSING'), { code: 'RUN_MANIFEST_MISSING', manifestId: manifest.manifestId });
      _assertSameFence(stored, manifest);
      if (stored.config?.implementation?.identityContract === 'intrilex-implementation@2' &&
          (batch.summaries ?? []).some(summary => summary.identity?.schemaVersion !== '2.0.0' || summary.identity.executionFingerprint !== stored.config.implementation.fingerprint || summary.identity.analysisFingerprint !== stored.config.implementation.analysisFingerprint)) {
        throw Object.assign(new Error('RUN_SAMPLE_IDENTITY_MISMATCH'), { code: 'RUN_SAMPLE_IDENTITY_MISMATCH' });
      }
      if(batch.runId!==stored.runId || batch.batchId!==`${stored.runId}#${batch.batchIndex}` || !Number.isInteger(batch.batchIndex) || batch.batchIndex<0)throw Object.assign(new Error('RUN_BATCH_ID_MISMATCH'),{code:'RUN_BATCH_ID_MISMATCH'});
      if(batch.summariesHash!==batchSummariesHash(batch.summaries))throw Object.assign(new Error('RUN_BATCH_HASH_MISMATCH'),{code:'RUN_BATCH_HASH_MISMATCH'});
      const existing = await ops.get(STORES.RUN_BATCHES, batch.batchId);
      if (existing != null) {
        if (existing.summariesHash === batch.summariesHash && batchSummariesHash(existing.summaries)===existing.summariesHash && existing.runId===batch.runId && existing.ordinalStart===batch.ordinalStart && existing.ordinalEnd===batch.ordinalEnd && existing.matchCount===batch.matchCount) {
          return { batchId: batch.batchId, duplicate: true, receipt:existing.receipt ?? null, manifest: stored };
        }
        throw Object.assign(new Error('RUN_BATCH_CONFLICT'), { code: 'RUN_BATCH_CONFLICT', batchId: batch.batchId });
      }
      // Resolve retained digests for any overlapping ordinal from the
      // committed batch rows — compact manifests carry ranges, not per-ordinal
      // hashes, so conflict detection reads the authoritative evidence.
      const retained = manifestRetainedOrdinals(stored);
      const items = (batch.summaries ?? []).map(s => ({ o: s?.matchOrdinal ?? s?.ordinal, h: s?.matchResultHash ?? s?.identity?.outcomeDigest ?? null }));
      const overlapping = new Set(items.filter(({ o }) => Number.isInteger(o) && retained.has(o)).map(({ o }) => o));
      const priorDigests = new Map();
      for (const [o, h] of retained) {
        if (overlapping.has(o) && h != null) priorDigests.set(o, h);
      }
      if ([...overlapping].some(o => !priorDigests.has(o))) {
        for (const d of stored.committedBatches ?? []) {
          if (!Number.isInteger(d?.ordinalStart) || !Number.isInteger(d?.ordinalEnd)) continue;
          if (![...overlapping].some(o => o >= d.ordinalStart && o < d.ordinalEnd)) continue;
          const prior = await ops.get(STORES.RUN_BATCHES, `${stored.manifestId}#${d.batchIndex}`);
          for (const s of prior?.summaries ?? []) {
            const o = s?.matchOrdinal ?? s?.ordinal;
            if (overlapping.has(o) && !priorDigests.has(o)) priorDigests.set(o, s?.matchResultHash ?? s?.identity?.outcomeDigest ?? null);
          }
        }
      }
      const { manifest: planned, receipt } = planManifestBatchCommit(stored, {
        batchIndex: batch.batchIndex, segmentIndex: batch.segmentIndex ?? 0,
        ordinalStart: batch.ordinalStart, ordinalEnd: batch.ordinalEnd,
        matchCount: batch.matchCount ?? items.length,
        summariesHash: batch.summariesHash,
        matchResultHashes: items,
        committedAt: batch.committedAt,
      }, { priorDigests });
      if (!receipt.accepted) {
        // Rejected evidence leaves a durable mark but cannot advance the run.
        const marked = nextRevision(stored, planned);
        await ops.put(STORES.MANIFESTS, marked);
        return { batchId: batch.batchId, duplicate: false, accepted: false, receipt, manifest: marked };
      }
      if (receipt.duplicate) {
        const prior=(await ops.all(STORES.RUN_BATCHES)).find(b=>b.runId===stored.runId && b.ordinalStart===batch.ordinalStart && b.ordinalEnd===batch.ordinalEnd);
        if(!prior || prior.summariesHash!==batch.summariesHash)throw Object.assign(new Error('RUN_BATCH_CONFLICT'),{code:'RUN_BATCH_CONFLICT'});
        return {batchId:prior.batchId,duplicate:true,accepted:true,receipt:prior.receipt ?? receipt,manifest:stored};
      }
      const next = nextRevision(stored, {
        ...planned,
        owner: manifest.owner ?? planned.owner,
        headline: foldSummariesIntoHeadline(
          stored.headline ? { ...stored.headline, seatWins: { ...stored.headline.seatWins } } : createManifestHeadline(),
          batch.summaries ?? [],
        ),
      });
      if (byteSize(next) > EXPERIMENT_LIMITS.metaBytes) throw Object.assign(new Error('RUN_MANIFEST_TOO_LARGE'), { code: 'RUN_MANIFEST_TOO_LARGE' });
      const body={contract:'intrilex-batch-receipt@1',runId:stored.runId,batchId:batch.batchId,
        fencingToken:stored.owner?.fencingToken ?? null,ownerId:stored.owner?.ownerId ?? null,
        payloadDigest:batch.summariesHash,ordinals:items.map(i=>i.o).sort((a,b)=>a-b),
        executionFingerprint:stored.config?.implementation?.fingerprint ?? null,analysisFingerprint:stored.config?.implementation?.analysisFingerprint ?? null,
        manifestSchema:stored.schemaVersion,sampleSchema:'2.0.0'};
      const immutableReceipt={...body,receiptHash:hashCanonical(body)};
      await ops.put(STORES.RUN_BATCHES, {...batch,receipt:immutableReceipt});
      await ops.put(STORES.MANIFESTS, next);
      return { batchId: batch.batchId, duplicate: false, accepted: true, receipt: immutableReceipt, manifest: next };
    });
  }
  async readRunRecovery(runId) {
    return this._transact([STORES.MANIFESTS,STORES.RUN_BATCHES],async ops=>{
      const manifest=await ops.get(STORES.MANIFESTS,runId);
      if(!manifest)throw Object.assign(new Error('RUN_MANIFEST_MISSING'),{code:'RUN_MANIFEST_MISSING'});
      if(manifest.inputDigest && manifestInputDigest(manifest)!==manifest.inputDigest)throw Object.assign(new Error('RUN_INPUTS_CHANGED'),{code:'RUN_INPUTS_CHANGED'});
      reconcileRunBatches(manifest,(await ops.all(STORES.RUN_BATCHES)).filter(b=>b.runId===runId));
      return manifest;
    });
  }
  async getRunBatch(runId, batchIndex) { return (await this._get(STORES.RUN_BATCHES, `${runId}#${batchIndex}`)) ?? null; }
  async listRunBatches(runId) {
    return (await this._all(STORES.RUN_BATCHES)).filter(b => b.runId === runId).sort((a, b) => (a.batchIndex ?? 0) - (b.batchIndex ?? 0));
  }
  /**
   * Atomic run seal: payload descriptor + immutable run record + completed
   * manifest land in one transaction. A run can never appear 'COMPLETED'
   * while its evidence writes are still in flight.
   */
  async finalizeRun({ run, payload, manifest }) {
    validateRunRecord(run);
    if (byteSize(run) > EXPERIMENT_LIMITS.metaBytes) {
      throw Object.assign(new Error('RUN_META_TOO_LARGE'), { code: 'RUN_META_TOO_LARGE' });
    }
    return this._transact([STORES.RUNS, STORES.PAYLOADS, STORES.MANIFESTS, STORES.RUN_BATCHES], async (ops) => {
      // Finalization is a manifest mutation — only the current fenced owner
      // may seal. A stale owner's finalize is rejected (R02).
      if (manifest) {
        const stored = await ops.get(STORES.MANIFESTS, manifest.manifestId);
        if (!stored) throw Object.assign(new Error('RUN_MANIFEST_MISSING'), { code: 'RUN_MANIFEST_MISSING', manifestId: manifest.manifestId });
        _assertSameFence(stored, manifest, { sealing: true });
        const rows=(await ops.all(STORES.RUN_BATCHES)).filter(b=>b.runId===stored.runId);
        const proof=reconcileRunBatches(stored,rows);
        const descriptorView=d=>({batchIndex:d.batchIndex,ordinalStart:d.ordinalStart,ordinalEnd:d.ordinalEnd,matchCount:d.matchCount,summariesHash:d.summariesHash});
        if(hashCanonical(manifest.committedBatches)!==hashCanonical(stored.committedBatches) || manifest.committedMatches!==stored.committedMatches || run.runId!==stored.runId || run.metrics?.matchCount!==proof.retained.size || run.config?.matchCount!==proof.retained.size || run.provenance?.canonicalResultHash!==proof.canonicalResultHash || hashCanonical(payload?.batches)!==hashCanonical(proof.descriptors.map(descriptorView)) || run.payloadHash!==payloadEvidenceHash(payload))throw Object.assign(new Error('RUN_SEAL_RECONCILIATION_FAILED'),{code:'RUN_SEAL_RECONCILIATION_FAILED'});
        if(!proof.complete && (run.config?.requestedMatchCount!==stored.requestedMatches || hashCanonical(run.config?.ordinalCoverage)!==hashCanonical(manifestCommittedCoverage(stored))))throw Object.assign(new Error('RUN_PARTIAL_DISCLOSURE_REQUIRED'),{code:'RUN_PARTIAL_DISCLOSURE_REQUIRED'});

        // Exact-coverage guard (R3): retained sets must be subsets of the
        // reserved schedule — checked on BOTH the at-rest manifest (foreign
        // or legacy coverage pollution) and the incoming seal claim (a stale
        // caller copy cannot quietly drop evidence).
        const scheduled = new Set();
        for (const s of stored.segments ?? manifest.segments ?? []) {
          for (let o = s.ordinalStart; o < s.ordinalEnd; o += 1) scheduled.add(o);
        }
        for (const source of [stored, manifest]) {
          const extra = [...manifestRetainedOrdinals(source).keys()].filter(o => !scheduled.has(o));
          if (extra.length) {
            throw Object.assign(new Error('RUN_COVERAGE_MISMATCH'), { code: 'RUN_COVERAGE_MISMATCH', extraOrdinals: extra.slice(0, 50) });
          }
        }
      }
      await ops.put(STORES.RUNS, run);
      if (payload) await ops.put(STORES.PAYLOADS, { runId: run.runId, storedAt: new Date().toISOString(), ...payload });
      const next = manifest ? nextRevision(await ops.get(STORES.MANIFESTS, manifest.manifestId), manifest) : null;
      if (next) await ops.put(STORES.MANIFESTS, next);
      return { runId: run.runId, manifest: next };
    });
  }

  /**
   * Atomic artifact admission (import path): the run record, its payload
   * descriptor, every committed batch, and a sealed manifest land in ONE
   * transaction. The manifest is written already-sealed — an imported
   * artifact is complete evidence, never an in-progress execution — so
   * crash-recovery cannot mistake it for an interrupted run.
   */
  async saveRunArtifact({ run, payload = null, manifest = null, batches = [] }) {
    validateRunRecord(run);
    if (byteSize(run) > EXPERIMENT_LIMITS.metaBytes) {
      throw Object.assign(new Error('RUN_META_TOO_LARGE'), { code: 'RUN_META_TOO_LARGE' });
    }
    const entries = [[STORES.RUNS, run]];
    if (payload) entries.push([STORES.PAYLOADS, { runId: run.runId, storedAt: new Date().toISOString(), ...payload }]);
    if (manifest) entries.push([STORES.MANIFESTS, manifest]);
    for (const batch of batches ?? []) entries.push([STORES.RUN_BATCHES, batch]);
    await this._transact([...new Set([...entries.map(([name]) => name), STORES.MANIFESTS])], async ops => {
      const cur = await ops.get(STORES.MANIFESTS, run.runId);
      if (cur && !cur.sealedRunId) throw Object.assign(new Error('RUN_IMPORT_ACTIVE_OCCURRENCE'), { code: 'RUN_IMPORT_ACTIVE_OCCURRENCE' });
      for (const [name, value] of entries) await ops.put(name, value);
    });
    return run.runId;
  }

  /** Delete an unfinalized manifest plus every batch it committed. */
  async deleteManifestCascade(manifestId, expected = null) {
    return this._transact([STORES.MANIFESTS, STORES.RUN_BATCHES], async ops => {
      const cur = await ops.get(STORES.MANIFESTS, manifestId);
      if (cur?.sealedRunId) throw Object.assign(new Error('RUN_ALREADY_SEALED'), { code: 'RUN_ALREADY_SEALED' });
      if (cur?.owner) _assertSameFence(cur, expected, { sealing: true });
      const batches = (await ops.all(STORES.RUN_BATCHES)).filter(b => b.runId === manifestId);
      for (const b of batches) await ops.del(STORES.RUN_BATCHES, b.batchId);
      await ops.del(STORES.MANIFESTS, manifestId); return { deleted: manifestId, batches: batches.length };
    });
  }

  /** Multi-store delete in one transaction. */
  async _delAll(entries) {
    await this.open();
    if (this.memory) {
      for (const [store, key] of entries) await this.memory.del(store, key);
      return;
    }
    const db = this.db;
    const storeNames = [...new Set(entries.map(([s]) => s))];
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('EXPERIMENT_STORAGE_DELETE_FAILED'));
      for (const [store, key] of entries) tx.objectStore(store).delete(key);
    });
  }

  // ── Analysis sets ─────────────────────────────────────────────
  async putAnalysisSet(set) {
    validateAnalysisSet(set);
    await this._putAll([[STORES.ANALYSIS_SETS, set]]);
    return set.analysisSetId;
  }
  async getAnalysisSet(analysisSetId) { return (await this._get(STORES.ANALYSIS_SETS, analysisSetId)) ?? null; }
  async listAnalysisSets(experimentId = null) {
    const all = await this._all(STORES.ANALYSIS_SETS);
    return experimentId ? all.filter(s => s.experimentId === experimentId) : all;
  }
  async getActiveAnalysisSet(experiment) {
    const id = experiment?.activeAnalysisSetId;
    if (id) {
      const found = await this.getAnalysisSet(id);
      if (found) return found;
    }
    const sets = await this.listAnalysisSets(experiment?.experimentId);
    return sets[0] ?? null;
  }

  // ── Migration helper ──────────────────────────────────────────
  async applyMigration(writes) {
    const entries = [
      ...(writes.experiments ?? []).map(e => [STORES.EXPERIMENTS, e]),
      ...(writes.runs ?? []).map(r => [STORES.RUNS, r]),
      ...(writes.analysisSets ?? []).map(s => [STORES.ANALYSIS_SETS, s]),
    ];
    if (entries.length) await this._putAll(entries);
    return entries.length;
  }

  /** Destructive delete — guarded by the caller. Removes the run record,
   * its payload, its manifest and any committed batches, and scrubs it
   * from every analysis set it appears in. */
  async deleteRun(runId) {
    return this._transact([STORES.MANIFESTS, STORES.RUNS, STORES.PAYLOADS, STORES.RUN_BATCHES, STORES.ANALYSIS_SETS], async ops => {
      const manifest = await ops.get(STORES.MANIFESTS, runId);
      if (manifest && !manifest.sealedRunId) throw Object.assign(new Error('RUN_OWNERSHIP_REQUIRED'), { code: 'RUN_OWNERSHIP_REQUIRED' });
      const run = await ops.get(STORES.RUNS, runId), sets = await ops.all(STORES.ANALYSIS_SETS);
      for (const s of sets) await ops.put(STORES.ANALYSIS_SETS, { ...s,
        includedRunIds: (s.includedRunIds ?? []).filter(id => id !== runId),
        exclusions: Object.fromEntries(Object.entries(s.exclusions ?? {}).filter(([id]) => id !== runId)), updatedAt: new Date().toISOString() });
      for (const b of await ops.all(STORES.RUN_BATCHES)) if (b.runId === runId) await ops.del(STORES.RUN_BATCHES, b.batchId);
      for (const name of [STORES.PAYLOADS, STORES.MANIFESTS, STORES.RUNS]) await ops.del(name, runId);
      return { deleted: runId, experimentId: run?.experimentId };
    });
  }

  close() {
    const pending = this.opening;
    this.opening = null;
    pending?.reject(new Error('EXPERIMENT_STORAGE_CLOSED'));
    this.db?.close();
    this.db = null;
    this.memory = null;
    this.persisted = null;
  }
}
