import { hashCanonical } from '../shared-browser.js';
import { admitSummaries } from './evidence-admission.mjs';
import { observatorySummariesForRun } from './observatory-bridge.mjs';
import { validateResearchProject, researchEnvelope } from './evolution-research.mjs';
import { artifactEnvelope, validateArtifact, inspectHistoricalArtifact, LAB_LIMITS } from './evolution-domain.mjs';
import { batchMatrixManifest, validateBatchMatrixManifest } from './batch-matrix.mjs';
import { validateExperimentRecord, serializeExperiment } from './mutation-domain.mjs';
import { discoveryRunEnvelope, validateDiscoveryRunEnvelope, discoveryEnvelope, validateDiscoveryEnvelope, discoveryRunSummary } from './discovery-domain.mjs';

/** Dedicated developer database. Completion resolves only after transaction commit. */
export class EvolutionStore {
  constructor(identity, factory = globalThis.indexedDB) { this.identity = identity; this.factory = factory; this.db = null; this.opening = null; }
  async open() {
    if (this.db) return this.db;
    if (this.opening) return this.opening.promise;
    if (!this.factory) throw new Error('INDEXEDDB_UNAVAILABLE');
    // Concurrent history reads and saves share one request. An abandoned open
    // can still succeed later, so connection ownership is checked at delivery.
    const pending = { promise: null, reject: null };
    this.opening = pending;
    pending.promise = new Promise((resolve, reject) => {
      pending.reject = reject;
      const fail = error => {
        if (this.opening === pending) this.opening = null;
        reject(error);
      };
      let req;
      try { req = this.factory.open('intrilex-evolution-lab', 5); }
      catch (error) { fail(error); return; }
      req.onupgradeneeded = () => {
        if (this.opening !== pending) { req.transaction.abort(); return; }
        if(!req.result.objectStoreNames.contains('research')) req.result.createObjectStore('research', {keyPath:'payload.experiment.experimentId'});
        if(!req.result.objectStoreNames.contains('runs')) req.result.createObjectStore('runs', { keyPath: 'payload.runId' });
        if(!req.result.objectStoreNames.contains('history')) req.result.createObjectStore('history', { keyPath: 'runId' });
        if(!req.result.objectStoreNames.contains('checkpoints')) req.result.createObjectStore('checkpoints', { keyPath: 'checkpointId' });
        if(!req.result.objectStoreNames.contains('matrices')) req.result.createObjectStore('matrices', { keyPath: 'payload.matrixId' });
        // Rule Mutation Chamber experiments (schemaVersion-gated, arm-separated).
        if(!req.result.objectStoreNames.contains('mutations')) req.result.createObjectStore('mutations', { keyPath: 'payload.experimentId' });
        // DISCOVER: autonomous research runs and promoted discovery artifacts.
        if(!req.result.objectStoreNames.contains('discoveryRuns')) req.result.createObjectStore('discoveryRuns', { keyPath: 'payload.runId' });
        if(!req.result.objectStoreNames.contains('discoveries')) req.result.createObjectStore('discoveries', { keyPath: 'payload.discoveryId' });
      };
      req.onsuccess = () => {
        const db = req.result;
        if (this.opening !== pending) { db.close(); return; }
        this.db = db;
        this.opening = null;
        db.onversionchange = () => {
          db.close();
          if (this.db === db) this.db = null;
        };
        resolve(db);
      };
      req.onerror = () => fail(req.error ?? new Error('LAB_STORAGE_OPEN_FAILED'));
      req.onblocked = () => fail(new Error('LAB_STORAGE_BLOCKED'));
    });
    return pending.promise;
  }
  async save(run,{budget=LAB_LIMITS.persistRunBytes}={}) {
    const envelope = artifactEnvelope(run);
    validateArtifact(envelope, this.identity);
    const size = new TextEncoder().encode(JSON.stringify(envelope)).byteLength;
    if (size > budget) throw Object.assign(new Error('RUN_ARTIFACT_TOO_LARGE_FOR_BROWSER_ARCHIVE'),{code:'RUN_ARTIFACT_TOO_LARGE_FOR_BROWSER_ARCHIVE',artifactSize:size,persistLimit:budget});
    const db = await this.open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['runs', 'history', 'checkpoints'], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error?.name === 'QuotaExceededError' ? Object.assign(new Error('BROWSER_STORAGE_QUOTA_EXCEEDED'),{code:'BROWSER_STORAGE_QUOTA_EXCEEDED',cause:tx.error}) : tx.error ?? new Error('LAB_STORAGE_ABORTED'));
      tx.onerror = () => {}; // transaction abort carries the error
      tx.objectStore('runs').put(envelope);
      tx.objectStore('history').put({ runId: run.runId, createdAt: run.createdAt, status: run.status, kind: run.researchPurpose ?? run.kind,
        games: run.records.length, botA: run.config.botA, botB: run.config.botB, bytes: size, fingerprint: run.identity.fingerprint });
      const checkpoints = tx.objectStore('checkpoints');
      for (const cp of run.checkpoints) {
        const request = checkpoints.get(cp.checkpointId);
        request.onsuccess = () => {
          if (!request.result) checkpoints.add(cp);
          else if (hashCanonical(request.result) !== hashCanonical(cp)) tx.abort();
        };
      }
    });
    return size;
  }
  async saveResearch(project) {
    const envelope=researchEnvelope(project);
    validateResearchProject(project,this.identity);
    const size=new TextEncoder().encode(JSON.stringify(envelope)).byteLength;
    if(size>LAB_LIMITS.persistRunBytes)throw Object.assign(new Error('RUN_ARTIFACT_TOO_LARGE_FOR_BROWSER_ARCHIVE'),{code:'RUN_ARTIFACT_TOO_LARGE_FOR_BROWSER_ARCHIVE',artifactSize:size,persistLimit:LAB_LIMITS.persistRunBytes});
    const db=await this.open();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('research','readwrite');let diagnostic;
      tx.oncomplete=()=>resolve();tx.onabort=()=>reject(diagnostic??tx.error??new Error('RESEARCH_STORAGE_ABORTED'));tx.onerror=()=>{};
      const records=tx.objectStore('research'),request=records.get(project.experiment.experimentId);
      request.onsuccess=()=>{
        const old=request.result?.payload;
        if(old && (old.generations.some((g,i)=>project.generations[i]?.generationId!==g.generationId) || old.checkpoints.some(cp=>!project.checkpoints.some(next=>next.checkpointId===cp.checkpointId)))){
          diagnostic=new Error('RESEARCH_HISTORY_REWRITE_REJECTED');tx.abort();return;
        }
        records.put(envelope);
      };
    });
  }
  /** Batch Matrix manifests are compact frozen plans (participants,
   * checkpoints, config, run references). Cell evidence stays in the runs
   * store — the manifest never duplicates records into a second copy. */
  async saveMatrix(lab) {
    const envelope = batchMatrixManifest(lab);
    validateBatchMatrixManifest(envelope);
    const size = new TextEncoder().encode(JSON.stringify(envelope)).byteLength;
    if (size > LAB_LIMITS.persistRunBytes) throw Object.assign(new Error('RUN_ARTIFACT_TOO_LARGE_FOR_BROWSER_ARCHIVE'),{code:'RUN_ARTIFACT_TOO_LARGE_FOR_BROWSER_ARCHIVE',artifactSize:size,persistLimit:LAB_LIMITS.persistRunBytes});
    const db = await this.open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['matrices'], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error?.name === 'QuotaExceededError' ? Object.assign(new Error('BROWSER_STORAGE_QUOTA_EXCEEDED'),{code:'BROWSER_STORAGE_QUOTA_EXCEEDED',cause:tx.error}) : tx.error ?? new Error('LAB_STORAGE_ABORTED'));
      tx.onerror = () => {};
      tx.objectStore('matrices').put(envelope);
    });
    return size;
  }
  async listMatrices() {
    const rows = await this.read('matrices');
    return rows.map(e => {
      try { validateBatchMatrixManifest(e); } catch { return { matrixId: e?.payload?.matrixId ?? 'unreadable', status: 'CORRUPT', corrupt: true }; }
      const refs = e.payload.runRefs ?? [];
      return { matrixId: e.payload.matrixId, status: e.payload.status, createdAt: e.payload.createdAt,
        participants: e.payload.participants.map(p => p.displayName),
        cellsComplete: refs.filter(r => r.status === 'COMPLETE').length, cellsTotal: e.payload.participants.length * (e.payload.participants.length - 1) / 2,
        records: refs.reduce((n, r) => n + r.records, 0) };
    }).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  }
  async loadMatrix(id) {
    const envelope = await this.read('matrices', id);
    if (!envelope) throw new Error('LAB_MATRIX_NOT_FOUND');
    return validateBatchMatrixManifest(envelope);
  }
  /** Rule Mutation Chamber: persist an experiment record under the same
   * storage budget and integrity-hash conventions as other Lab artifacts. */
  async saveMutation(record) {
    validateExperimentRecord(record);
    const envelope = { experimentType: 'rule-mutation-envelope', payload: record, contentHash: record.contentHash };
    const size = new TextEncoder().encode(JSON.stringify(envelope)).byteLength;
    if (size > LAB_LIMITS.persistRunBytes) throw Object.assign(new Error('RUN_ARTIFACT_TOO_LARGE_FOR_BROWSER_ARCHIVE'), { code: 'RUN_ARTIFACT_TOO_LARGE_FOR_BROWSER_ARCHIVE', artifactSize: size, persistLimit: LAB_LIMITS.persistRunBytes });
    const db = await this.open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['mutations'], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error?.name === 'QuotaExceededError' ? Object.assign(new Error('BROWSER_STORAGE_QUOTA_EXCEEDED'), { code: 'BROWSER_STORAGE_QUOTA_EXCEEDED', cause: tx.error }) : tx.error ?? new Error('LAB_STORAGE_ABORTED'));
      tx.onerror = () => {};
      tx.objectStore('mutations').put(envelope);
    });
    return size;
  }
  async listMutations() {
    const rows = await this.read('mutations');
    return rows.map((e) => ({
      experimentId: e.payload?.experimentId ?? 'unreadable',
      createdAt: e.payload?.createdAt ?? '',
      status: e.payload?.status ?? 'unknown',
      mutationLabel: e.payload?.mutation?.label ?? null,
      targetId: e.payload?.mutation?.targetId ?? null,
      verdict: e.payload?.outcome?.verdict ?? null,
      gamesPerArm: e.payload?.config?.gamesPerArm ?? null,
    })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  async loadMutation(id) {
    const envelope = await this.read('mutations', id);
    if (!envelope) throw new Error('LAB_MUTATION_NOT_FOUND');
    if (envelope.contentHash !== envelope.payload?.contentHash) throw new Error('MUTATION_HASH_MISMATCH');
    return validateExperimentRecord(envelope.payload);
  }
  /** DISCOVER: run envelopes and promoted discovery artifacts share the
   * same content-hash + size-budget conventions as the other stores.
   * Experiment runs executed inside a discovery run are ordinary lab
   * series and live in the existing `runs` store — the discovery artifact
   * only references them by id. */
  async saveDiscoveryRun(run) {
    const envelope = discoveryRunEnvelope(run);
    validateDiscoveryRunEnvelope(envelope, this.identity);
    const size = new TextEncoder().encode(JSON.stringify(envelope)).byteLength;
    if (size > LAB_LIMITS.persistRunBytes) throw Object.assign(new Error('RUN_ARTIFACT_TOO_LARGE_FOR_BROWSER_ARCHIVE'), { code: 'RUN_ARTIFACT_TOO_LARGE_FOR_BROWSER_ARCHIVE', artifactSize: size, persistLimit: LAB_LIMITS.persistRunBytes });
    const db = await this.open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['discoveryRuns'], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error?.name === 'QuotaExceededError' ? Object.assign(new Error('BROWSER_STORAGE_QUOTA_EXCEEDED'), { code: 'BROWSER_STORAGE_QUOTA_EXCEEDED', cause: tx.error }) : tx.error ?? new Error('LAB_STORAGE_ABORTED'));
      tx.onerror = () => {};
      tx.objectStore('discoveryRuns').put(envelope);
    });
    return size;
  }
  async listDiscoveryRuns() {
    const rows = await this.read('discoveryRuns');
    return rows.map((e) => {
      try { return discoveryRunSummary(validateDiscoveryRunEnvelope(e, this.identity)); }
      catch { return { runId: e?.payload?.runId ?? 'unreadable', status: 'CORRUPT', corrupt: true }; }
    }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  async loadDiscoveryRun(id) {
    const envelope = await this.read('discoveryRuns', id);
    if (!envelope) throw new Error('DISCOVERY_RUN_NOT_FOUND');
    return validateDiscoveryRunEnvelope(envelope, this.identity);
  }
  async saveDiscovery(discovery) {
    const envelope = discoveryEnvelope(discovery);
    validateDiscoveryEnvelope(envelope);
    const size = new TextEncoder().encode(JSON.stringify(envelope)).byteLength;
    if (size > LAB_LIMITS.persistRunBytes) throw Object.assign(new Error('RUN_ARTIFACT_TOO_LARGE_FOR_BROWSER_ARCHIVE'), { code: 'RUN_ARTIFACT_TOO_LARGE_FOR_BROWSER_ARCHIVE', artifactSize: size, persistLimit: LAB_LIMITS.persistRunBytes });
    const db = await this.open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['discoveries'], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error?.name === 'QuotaExceededError' ? Object.assign(new Error('BROWSER_STORAGE_QUOTA_EXCEEDED'), { code: 'BROWSER_STORAGE_QUOTA_EXCEEDED', cause: tx.error }) : tx.error ?? new Error('LAB_STORAGE_ABORTED'));
      tx.onerror = () => {};
      tx.objectStore('discoveries').put(envelope);
    });
    return size;
  }
  async listDiscoveries() {
    const rows = await this.read('discoveries');
    return rows.map((e) => {
      try {
        const d = validateDiscoveryEnvelope(e);
        return { discoveryId: d.discoveryId, status: d.status, confidence: d.confidence, category: d.category,
          claim: d.claim, estimate: d.effect?.estimate, interval95: d.effect?.interval95, grade: d.evidenceGrade,
          createdAt: d.createdAt, runId: d.provenance?.runId ?? null };
      } catch { return { discoveryId: e?.payload?.discoveryId ?? 'unreadable', status: 'CORRUPT', corrupt: true }; }
    }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  async loadDiscovery(id) {
    const envelope = await this.read('discoveries', id);
    if (!envelope) throw new Error('DISCOVERY_NOT_FOUND');
    return validateDiscoveryEnvelope(envelope);
  }
  async listResearch() {return (await this.read('research')).map(e=>({experimentId:e.payload.experiment.experimentId,name:e.payload.experiment.name,status:e.payload.experiment.status,scientificId:e.payload.experiment.scientificId}));}
  async loadResearch(id) {const envelope=await this.read('research',id);if(!envelope || envelope.contentHash!==hashCanonical(envelope.payload))throw new Error('RESEARCH_HASH_MISMATCH');const project=validateResearchProject(envelope.payload,this.identity);if(project.experiment.status==='RUNNING')project.experiment.status='PAUSED';return project;}
  async read(store, key) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = key === undefined ? tx.objectStore(store).getAll() : tx.objectStore(store).get(key);
      let result;
      req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error ?? new Error('LAB_STORAGE_READ_FAILED'));
    });
  }
  async list() { return (await this.read('history')).sort((a,b) => b.createdAt.localeCompare(a.createdAt)); }
  async load(id) { const envelope = await this.read('runs', id); if (!envelope) throw new Error('LAB_RUN_NOT_FOUND'); return validateArtifact(envelope, this.identity); }
  async loadForInspection(id) {
    const envelope = await this.read('runs', id);
    if (!envelope) throw new Error('LAB_RUN_NOT_FOUND');
    const historical = envelope.payload?.identity?.fingerprint !== this.identity.fingerprint;
    const run = historical ? inspectHistoricalArtifact(envelope) : validateArtifact(envelope, this.identity);
    const admission=admitSummaries(observatorySummariesForRun(run),{expectedCount:run.records.length});
    return {run, historical, envelope, admission};
  }
  close() {
    const pending = this.opening;
    this.opening = null;
    pending?.reject(new Error('LAB_STORAGE_CLOSED'));
    this.db?.close(); this.db = null;
  }
}

export function parseLabImport(text, identity) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > LAB_LIMITS.importBytes) throw new Error('IMPORT_TOO_LARGE');
  const run = validateArtifact(JSON.parse(text), identity);
  // Checksums detect corruption, not authorship. Imported outcome records
  // remain an external claim until reproduced by the engine.
  run.evidenceOrigin = 'IMPORTED_UNVERIFIED';
  return run;
}

/** Mutation experiment import: schema-validated, flagged unverified. */
export function parseMutationImport(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > LAB_LIMITS.importBytes) throw new Error('IMPORT_TOO_LARGE');
  const record = validateExperimentRecord(JSON.parse(text));
  record.evidenceOrigin = 'IMPORTED_UNVERIFIED';
  return record;
}

export function exportMutationText(record) {
  return serializeExperiment(record);
}
