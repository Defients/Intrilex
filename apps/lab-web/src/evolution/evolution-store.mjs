import { BROWSER_CAPACITY, jsonBytes } from './browser-capacity.mjs';
import { hashCanonical } from '../shared-browser.js';
import { admitSummaries } from './evidence-admission.mjs';
import { observatorySummariesForRun } from './observatory-bridge.mjs';
import { validateResearchProject, researchEnvelope } from './evolution-research.mjs';
import { artifactEnvelope, validateArtifact, validateRecord, validateReplay, inspectHistoricalArtifact, LAB_LIMITS } from './evolution-domain.mjs';
import { batchMatrixManifest, validateBatchMatrixManifest } from './batch-matrix.mjs';
import { validateExperimentRecord, serializeExperiment } from './mutation-domain.mjs';
import { discoveryRunEnvelope, validateDiscoveryRunEnvelope, discoveryEnvelope, validateDiscoveryEnvelope, discoveryRunSummary } from './discovery-domain.mjs';

/** Dedicated developer database. Completion resolves only after transaction commit. */
export class EvolutionStore {
  constructor(identity, factory = globalThis.indexedDB) { this.identity = identity; this.factory = factory; this.db = null; this.opening = null; this.saves=new Map(); this.metrics={writes:0,recordWrites:0,peakCheckpointBytes:0,peakPendingRuns:0}; }
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
      try { req = this.factory.open('intrilex-evolution-lab', 6); }
      catch (error) { fail(error); return; }
      req.onupgradeneeded = () => {
        if (this.opening !== pending) { req.transaction.abort(); return; }
        if(!req.result.objectStoreNames.contains('research')) req.result.createObjectStore('research', {keyPath:'payload.experiment.experimentId'});
        if(!req.result.objectStoreNames.contains('runChunks'))req.result.createObjectStore('runChunks',{keyPath:'chunkId'});
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
  save(run,options={}) {
    const current=this.saves.get(run.runId);
    if(current){current.pending={run,options};return current.done;}
    if(this.saves.size>=BROWSER_CAPACITY.workers)return Promise.reject(new Error('EVOLUTION_CHECKPOINT_QUEUE_FULL'));
    const slot={pending:{run,options},done:null};this.saves.set(run.runId,slot);
    this.metrics.peakPendingRuns=Math.max(this.metrics.peakPendingRuns,this.saves.size);
    slot.done=(async()=>{let size;while(slot.pending){const request=slot.pending;slot.pending=null;size=await this.saveIncrement(request.run,request.options);}return size;})().finally(()=>this.saves.delete(run.runId));
    return slot.done;
  }
  async saveIncrement(run,{budget=LAB_LIMITS.persistRunBytes}={}) {
    // Capture bounded references and small metadata. Never clone a growing ledger.
    const records=[...run.records],replays=[...run.replays];
    if(records.length>run.config.gameCount || replays.length>LAB_LIMITS.replays || records.length>(run.config.strategicTrace?BROWSER_CAPACITY.deepGames:BROWSER_CAPACITY.games))throw new Error('EVOLUTION_CHECKPOINT_TIER_RESTRICTED');
    const {records:_records,replays:_replays,...metadata}=run;
    const payload=structuredClone(metadata),check={...payload,records:[],replays:[],bookmarks:[],status:payload.status==='COMPLETE'?'PAUSED':payload.status};
    validateArtifact(artifactEnvelope(check),this.identity);
    if(payload.status==='COMPLETE'&&records.length!==run.config.gameCount)throw new Error('INCOMPLETE_RUN');
    const previous=await this.rawRead('runs',run.runId);
    const old=previous?.format==='intrilex-evolution-checkpoint'?previous:null;
    if(old && old.contentHash!==hashCanonical(old.payload))throw new Error('CHECKPOINT_HASH_MISMATCH');
    if(previous && !old)validateArtifact(previous,this.identity);
    const refs=[],chunks=[],ordinals=new Set();
    const previousRefs=new Map((old?.payload.recordRefs??[]).map(r=>[r.ordinal,r]));
    let pendingBytes=0;
    for(const record of records){
      if(ordinals.has(record.ordinal))throw new Error('DUPLICATE_ORDINAL');ordinals.add(record.ordinal);
      const prior=previousRefs.get(record.ordinal);
      if(prior){if(prior.resultHash!==record.resultHash)throw new Error('CHECKPOINT_RECORD_CONFLICT');refs.push(prior);continue;}
      validateRecord(record,run);
      const bytes=jsonBytes(record);
      pendingBytes+=bytes;if(pendingBytes>BROWSER_CAPACITY.checkpointBytes)throw new Error('EVOLUTION_CHECKPOINT_BYTES_EXCEEDED');
      const frozen=structuredClone(record),digest=hashCanonical(frozen);
      const chunkId=`${run.runId}/record/${record.ordinal}/${digest}`;
      refs.push({chunkId,ordinal:record.ordinal,resultHash:record.resultHash,digest,bytes});chunks.push({chunkId,payload:frozen,digest});
    }
    if([...previousRefs.keys()].some(n=>!ordinals.has(n)))throw new Error('CHECKPOINT_RECORD_REGRESSION');
    const replayRefs=[];
    for(const replay of replays){
      const record=records.find(r=>r.ordinal===replay.ordinal);if(!record)throw new Error('REPLAY_RECORD_MISSING');validateReplay(replay,record,run);
      const digest=hashCanonical(replay),bytes=jsonBytes(replay),prior=old?.payload.replayRefs.find(r=>r.digest===digest);
      if(prior){replayRefs.push(prior);continue;}
      pendingBytes+=bytes;if(pendingBytes>BROWSER_CAPACITY.checkpointBytes)throw new Error('EVOLUTION_CHECKPOINT_BYTES_EXCEEDED');
      const chunkId=`${run.runId}/replay/${digest}`;replayRefs.push({chunkId,digest,bytes});chunks.push({chunkId,payload:structuredClone(replay),digest});
    }
    if(payload.bookmarks.some(id=>!replays.some(r=>r.replayId===id)))throw new Error('BOOKMARK_REPLAY_MISSING');
    const headPayload={...payload,recordRefs:refs.sort((a,b)=>a.ordinal-b.ordinal),replayRefs};
    const head={format:'intrilex-evolution-checkpoint',schemaVersion:1,payload:headPayload,contentHash:hashCanonical(headPayload)};
    const headerBytes=jsonBytes(head),size=headerBytes+refs.reduce((n,r)=>n+r.bytes,0)+replayRefs.reduce((n,r)=>n+r.bytes,0);
    if(headerBytes>BROWSER_CAPACITY.headerBytes)throw new Error('EVOLUTION_CHECKPOINT_HEADER_EXCEEDED');
    if(size>Math.min(budget,BROWSER_CAPACITY.checkpointBytes))throw Object.assign(new Error('RUN_ARTIFACT_TOO_LARGE_FOR_BROWSER_ARCHIVE'),{code:'RUN_ARTIFACT_TOO_LARGE_FOR_BROWSER_ARCHIVE',artifactSize:size,persistLimit:Math.min(budget,BROWSER_CAPACITY.checkpointBytes)});
    this.metrics.peakCheckpointBytes=Math.max(this.metrics.peakCheckpointBytes,pendingBytes+headerBytes);
    const db=await this.open();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(['runs','runChunks','history','checkpoints'],'readwrite');let diagnostic;
      tx.oncomplete=resolve;tx.onerror=()=>{};
      tx.onabort=()=>reject(diagnostic ?? (tx.error?.name==='QuotaExceededError'?Object.assign(new Error('BROWSER_STORAGE_QUOTA_EXCEEDED'),{code:'BROWSER_STORAGE_QUOTA_EXCEEDED',cause:tx.error}):tx.error ?? new Error('LAB_STORAGE_ABORTED')));
      const heads=tx.objectStore('runs'),request=heads.get(run.runId);
      request.onsuccess=()=>{try {
        if(request.result?.contentHash!==previous?.contentHash){diagnostic=new Error('EVOLUTION_CHECKPOINT_CONFLICT');tx.abort();return;}
        for(const chunk of chunks)tx.objectStore('runChunks').put(chunk);
        heads.put(head);tx.objectStore('history').put({runId:run.runId,createdAt:payload.createdAt,status:payload.status,kind:payload.researchPurpose ?? payload.kind,games:records.length,botA:payload.config.botA,botB:payload.config.botB,bytes:size,fingerprint:payload.identity.fingerprint});
        const checkpoints=tx.objectStore('checkpoints');
        for(const cp of payload.checkpoints){const get=checkpoints.get(cp.checkpointId);get.onsuccess=()=>{if(!get.result)checkpoints.add(cp);else if(hashCanonical(get.result)!==hashCanonical(cp)){diagnostic=new Error('CHECKPOINT_CONFLICT');tx.abort();}};}
      }catch(error){diagnostic=error.name==='QuotaExceededError'?Object.assign(new Error('BROWSER_STORAGE_QUOTA_EXCEEDED'),{code:'BROWSER_STORAGE_QUOTA_EXCEEDED',cause:error}):error;tx.abort();}};
    });
    this.metrics.writes++;this.metrics.recordWrites+=chunks.filter(c=>c.chunkId.includes('/record/')).length;
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
  async rawRead(store, key) {
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
  async read(store,key) {
    const value=await this.rawRead(store,key);
    if(store!=='runs'||!value)return value;
    const hydrate=async head=>{
      if(head.format!=='intrilex-evolution-checkpoint')return head;
      if(head.contentHash!==hashCanonical(head.payload))throw new Error('CHECKPOINT_HASH_MISMATCH');
      const {recordRefs,replayRefs,...metadata}=head.payload;
      if(recordRefs.length>BROWSER_CAPACITY.games || replayRefs.length>LAB_LIMITS.replays || [...recordRefs,...replayRefs].reduce((n,r)=>n+r.bytes,0)>BROWSER_CAPACITY.checkpointBytes)throw new Error('CHECKPOINT_BUDGET_EXCEEDED');
      const rows=async refs=>{const result=[];for(const ref of refs){const chunk=await this.rawRead('runChunks',ref.chunkId);if(!chunk||chunk.digest!==ref.digest||hashCanonical(chunk.payload)!==ref.digest)throw new Error('CHECKPOINT_CHUNK_MISSING_OR_CORRUPT');result.push(chunk.payload);}return result;};
      return artifactEnvelope({...metadata,records:await rows(recordRefs),replays:await rows(replayRefs)});
    };
    if(Array.isArray(value)){if(value.length>BROWSER_CAPACITY.analysisSources)throw new Error('CHECKPOINT_LIST_CAPACITY_EXCEEDED');const result=[];for(const head of value)result.push(await hydrate(head));return result;}
    return hydrate(value);
  }
  async list() { return (await this.read('history')).sort((a,b) => b.createdAt.localeCompare(a.createdAt)); }
  async load(id) { const envelope = await this.read('runs', id); if (!envelope) throw new Error('LAB_RUN_NOT_FOUND'); return validateArtifact(envelope, this.identity); }
  async loadForInspection(id) {
    const envelope = await this.read('runs', id);
    if (!envelope) throw new Error('LAB_RUN_NOT_FOUND');
    const historical = envelope.payload?.identity?.fingerprint !== this.identity.fingerprint ||
      envelope.payload?.identity?.analysisFingerprint !== this.identity.analysisFingerprint;
    const run = historical ? inspectHistoricalArtifact(envelope) : validateArtifact(envelope, this.identity);
    const admission=admitSummaries(observatorySummariesForRun(run),{run,expectedCount:run.records.length});
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
