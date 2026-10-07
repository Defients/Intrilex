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

import {
  EXPERIMENT_LIMITS,
  validateExperimentRecord,
  validateRunRecord,
  validateAnalysisSet,
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

// In-memory backend — same async surface as the IDB transaction helpers.
// Used when IndexedDB is unavailable (tests, locked-down browsers).
function createMemoryBackend() {
  const tables = { experiments: new Map(), runs: new Map(), analysisSets: new Map(), payloads: new Map(), manifests: new Map(), runBatches: new Map() };
  return {
    persisted: false,
    async get(store, key) { return tables[store]?.get(key) ?? undefined; },
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
          if (this.db === db) { this.db = null; this.persisted = null; }
        };
        resolve(this);
      };
      req.onerror = () => fail(req.error ?? new Error('EXPERIMENT_STORAGE_OPEN_FAILED'));
      req.onblocked = () => fail(new Error('EXPERIMENT_STORAGE_BLOCKED'));
    });
    try {
      return await pending.promise;
    } catch {
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
    if (byteSize(manifest) > EXPERIMENT_LIMITS.metaBytes) {
      throw Object.assign(new Error('RUN_MANIFEST_TOO_LARGE'), { code: 'RUN_MANIFEST_TOO_LARGE' });
    }
    await this._putAll([[STORES.MANIFESTS, manifest]]);
    return manifest.manifestId;
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
   */
  async commitRunBatch({ manifest, batch }) {
    const size = byteSize(batch);
    if (size > EXPERIMENT_LIMITS.batchBytes) {
      throw Object.assign(new Error('RUN_BATCH_TOO_LARGE_FOR_BROWSER_ARCHIVE'), { code: 'RUN_BATCH_TOO_LARGE_FOR_BROWSER_ARCHIVE', artifactSize: size });
    }
    await this._putAll([[STORES.RUN_BATCHES, batch], [STORES.MANIFESTS, manifest]]);
    return batch.batchId;
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
    const entries = [[STORES.RUNS, run], [STORES.MANIFESTS, manifest]];
    if (payload) entries.push([STORES.PAYLOADS, { runId: run.runId, storedAt: new Date().toISOString(), ...payload }]);
    await this._putAll(entries);
    return run.runId;
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
    await this._putAll(entries);
    return run.runId;
  }

  /** Delete an unfinalized manifest plus every batch it committed. */
  async deleteManifestCascade(manifestId) {
    const batches = await this.listRunBatches(manifestId);
    await this._delAll([
      ...batches.map(b => [STORES.RUN_BATCHES, b.batchId]),
      [STORES.MANIFESTS, manifestId],
    ]);
    return { deleted: manifestId, batches: batches.length };
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
    const sets = await this.listAnalysisSets();
    const run = await this.getRun(runId);
    const experimentId = run?.experimentId;
    await this._putAll([...sets.map(s => [STORES.ANALYSIS_SETS, {
      ...s,
      includedRunIds: (s.includedRunIds ?? []).filter(id => id !== runId),
      exclusions: Object.fromEntries(Object.entries(s.exclusions ?? {}).filter(([id]) => id !== runId)),
      updatedAt: new Date().toISOString(),
    }])]);
    const batches = await this.listRunBatches(runId);
    await this._delAll([
      ...batches.map(b => [STORES.RUN_BATCHES, b.batchId]),
      [STORES.PAYLOADS, runId],
      [STORES.MANIFESTS, runId],
      [STORES.RUNS, runId],
    ]);
    return { deleted: runId, experimentId };
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
