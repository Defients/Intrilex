import { artifactEnvelope, validateArtifact, LAB_LIMITS } from './evolution-domain.mjs';

/** Dedicated developer database. Completion resolves only after transaction commit. */
export class EvolutionStore {
  constructor(identity, factory = globalThis.indexedDB) { this.identity = identity; this.factory = factory; this.db = null; }
  async open() {
    if (this.db) return this.db;
    if (!this.factory) throw new Error('INDEXEDDB_UNAVAILABLE');
    this.db = await new Promise((resolve, reject) => {
      const req = this.factory.open('intrilex-evolution-lab', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('runs', { keyPath: 'payload.runId' });
        req.result.createObjectStore('history', { keyPath: 'runId' });
        req.result.createObjectStore('checkpoints', { keyPath: 'checkpointId' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('LAB_STORAGE_BLOCKED'));
    });
    this.db.onversionchange = () => { this.db?.close(); this.db = null; };
    return this.db;
  }
  async save(run) {
    const envelope = artifactEnvelope(run);
    validateArtifact(envelope, this.identity);
    const size = new TextEncoder().encode(JSON.stringify(envelope)).byteLength;
    if (size > LAB_LIMITS.importBytes) throw new Error('LAB_STORAGE_BUDGET_EXCEEDED');
    const db = await this.open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['runs', 'history', 'checkpoints'], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('LAB_STORAGE_ABORTED'));
      tx.onerror = () => {}; // transaction abort carries the error
      tx.objectStore('runs').put(envelope);
      tx.objectStore('history').put({ runId: run.runId, createdAt: run.createdAt, status: run.status, kind: run.kind,
        games: run.records.length, botA: run.config.botA, botB: run.config.botB, bytes: size, fingerprint: run.identity.fingerprint });
      const checkpoints = tx.objectStore('checkpoints');
      for (const cp of run.checkpoints) {
        const request = checkpoints.get(cp.checkpointId);
        request.onsuccess = () => {
          if (!request.result) checkpoints.add(cp);
          else if (JSON.stringify(request.result) !== JSON.stringify(cp)) tx.abort();
        };
      }
    });
    return size;
  }
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
  close() { this.db?.close(); this.db = null; }
}

export function parseLabImport(text, identity) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > LAB_LIMITS.importBytes) throw new Error('IMPORT_TOO_LARGE');
  const run = validateArtifact(JSON.parse(text), identity);
  // Checksums detect corruption, not authorship. Imported outcome records
  // remain an external claim until reproduced by the engine.
  run.evidenceOrigin = 'IMPORTED_UNVERIFIED';
  return run;
}
