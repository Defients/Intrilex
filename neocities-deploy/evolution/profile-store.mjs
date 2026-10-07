import { hashCanonical } from '../shared-browser.js';
import { validateCheckpoint, createTrainableCheckpoint, LAB_LIMITS } from './evolution-domain.mjs';
import {
  CONTRACTS, ProfileError, fail, deepFreeze, strictCanonical, digest, makeArtifact, validateArtifact, headToken, sameHead,
  validateRevisionBody, resolveObjective, resolvePromotionPolicy, resolveEra, validatePolicyForObjective, validateObjectiveBody, compileTraits, validateTraits,
  resolveTemplate, validateMutationConstraints, validateIdentityConstraints, SERIES_DEFAULTS, ZERO_GENOME, genomeDigest, canExecuteCheckpoint, TEMPLATE_CATALOG,
} from './profile-contracts.mjs';
import { buildJournal, parameterProvenance, genomeDelta } from './profile-journal.mjs';
import { validateAdaptiveConfig } from './adaptive-strategy.mjs';

// ── Storage layout ─────────────────────────────────────────────────────────
// artifacts/checkpoints/events are immutable (insert-or-verify); heads and
// receipts change only inside command transactions; operations are fenced
// mutable progress; profiles hold display metadata; traces are prunable.
export const STORES = deepFreeze({
  profiles: { keyPath: 'agentProfileId' }, heads: { keyPath: 'agentProfileId' }, events: { keyPath: ['agentProfileId', 'sequence'] },
  receipts: { keyPath: 'commandId' }, artifacts: { keyPath: 'id', indexes: ['scope', 'kind'] }, checkpoints: { keyPath: 'checkpointId' },
  operations: { keyPath: 'operationId', indexes: ['scope'] }, traces: { keyPath: 'traceId', indexes: ['scope'] },
});
const COMMAND_STORES = ['profiles', 'heads', 'events', 'receipts', 'artifacts', 'checkpoints'];
const keyOf = (store, value) => { const path = STORES[store].keyPath; return Array.isArray(path) ? path.map(k => value[k]) : value[path]; };
const keyString = key => JSON.stringify(key);
export const op = Object.freeze({
  get: (store, key) => ({ op: 'get', store, key }), all: (store) => ({ op: 'all', store }),
  index: (store, index, value) => ({ op: 'index', store, index, value }), prefix: (store, first) => ({ op: 'prefix', store, first }),
});
const mapStorageError = error => {
  if (error instanceof ProfileError) return error;
  if (error?.name === 'QuotaExceededError') return new ProfileError('PROFILE_STORAGE_QUOTA_EXCEEDED', 'Stop new work; export or authorize pruning.');
  if (error?.name === 'VersionError') return new ProfileError('PROFILE_STORAGE_NEWER_VERSION', 'A newer client upgraded this database.');
  return error instanceof Error ? error : new ProfileError('PROFILE_STORAGE_FAILED', String(error));
};

/** In-memory backend with copy-on-write commit. Handles that share `data`
 * behave like independent connections to one database; transactions are atomic. */
export class MemoryBackend {
  constructor({ data = new Map(), onWrite = null } = {}) { this.data = data; this.onWrite = onWrite; for (const name of Object.keys(STORES)) if (!data.has(name)) data.set(name, new Map()); }
  async transaction(names, mode, body) {
    const working = new Map(), view = name => working.get(name) ?? this.data.get(name);
    const writable = name => { if (!names.includes(name) || mode !== 'readwrite') fail('PROFILE_TX_SCOPE_VIOLATION', name); if (!working.has(name)) working.set(name, new Map(this.data.get(name))); return working.get(name); };
    const read = request => {
      if (!names.includes(request.store)) fail('PROFILE_TX_SCOPE_VIOLATION', request.store);
      const store = view(request.store);
      if (request.op === 'get') { const v = store.get(keyString(request.key)); return v === undefined ? undefined : structuredClone(v); }
      const values = [...store.entries()].sort(([a], [b]) => compareKeys(JSON.parse(a), JSON.parse(b))).map(([, v]) => v);
      if (request.op === 'all') return structuredClone(values);
      if (request.op === 'index') return structuredClone(values.filter(v => v[request.index] === request.value));
      if (request.op === 'prefix') return structuredClone(values.filter(v => keyOf(request.store, v)[0] === request.first));
      return fail('PROFILE_TX_BAD_REQUEST');
    };
    let writes = 0;
    const tx = {
      put: (store, value) => { this.onWrite?.({ store, value, index: writes++ }); const map = writable(store); map.set(keyString(keyOf(store, value)), structuredClone(value)); },
      delete: (store, key) => { this.onWrite?.({ store, key, index: writes++ }); writable(store).delete(keyString(key)); },
    };
    const iterator = body(tx);
    let step = iterator.next();
    try {
      while (!step.done) step = iterator.next(read(step.value));
    } catch (error) { throw mapStorageError(error); }
    for (const [name, map] of working) this.data.set(name, map);
    return step.value;
  }
}
function compareKeys(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) { for (let i = 0; i < Math.min(a.length, b.length); i++) { const c = compareKeys(a[i], b[i]); if (c) return c; } return a.length - b.length; }
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

/** IndexedDB backend. The same generator body drives real requests inside one
 * transaction; no unrelated await occurs while the transaction is active. */
export class IndexedDbBackend {
  constructor({ factory = globalThis.indexedDB, name = CONTRACTS.store.database, onWrite = null, onSuperseded = null } = {}) {
    this.factory = factory; this.name = name; this.onWrite = onWrite; this.onSuperseded = onSuperseded; this.db = null; this.opening = null; this.superseded = false;
  }
  open() {
    if (this.superseded) return Promise.reject(new ProfileError('PROFILE_STORAGE_SUPERSEDED', 'Another tab upgraded or deleted this database. Reload.'));
    if (this.db) return Promise.resolve(this.db);
    if (this.opening) return this.opening.promise;
    if (!this.factory) return Promise.reject(new ProfileError('INDEXEDDB_UNAVAILABLE'));
    const pending = {};
    this.opening = pending;
    pending.promise = new Promise((resolve, reject) => {
      const settle = error => { if (this.opening === pending) this.opening = null; reject(mapStorageError(error)); };
      let request;
      try { request = this.factory.open(this.name, CONTRACTS.store.version); } catch (error) { settle(error); return; }
      request.onupgradeneeded = event => {
        if (this.opening !== pending) { request.transaction.abort(); return; }
        const db = request.result;
        if (event.oldVersion < 1) for (const [store, def] of Object.entries(STORES)) {
          const created = db.createObjectStore(store, { keyPath: def.keyPath });
          for (const index of def.indexes ?? []) created.createIndex(index, index, { unique: false });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        if (this.opening !== pending) { db.close(); return; }
        this.opening = null; this.db = db;
        db.onversionchange = () => { db.close(); if (this.db === db) this.db = null; this.superseded = true; this.onSuperseded?.(); };
        resolve(db);
      };
      request.onerror = () => settle(request.error ?? new ProfileError('PROFILE_STORAGE_OPEN_FAILED'));
      request.onblocked = () => settle(new ProfileError('PROFILE_STORAGE_BLOCKED', 'Close other tabs using this origin and retry.'));
    });
    return pending.promise;
  }
  async transaction(names, mode, body) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      let tx, result, failure = null, writes = 0;
      try { tx = db.transaction(names, mode, { durability: 'strict' }); } catch (error) { reject(mapStorageError(error)); return; }
      const abort = error => { if (failure) return; failure = mapStorageError(error); try { tx.abort(); } catch { /* already finished */ } };
      const wrapper = {
        put: (store, value) => { if (failure) throw failure; this.onWrite?.({ store, value, index: writes++ }); const r = tx.objectStore(store).put(value); r.onerror = event => { event.preventDefault(); abort(r.error); }; },
        delete: (store, key) => { if (failure) throw failure; this.onWrite?.({ store, key, index: writes++ }); const r = tx.objectStore(store).delete(key); r.onerror = event => { event.preventDefault(); abort(r.error); }; },
      };
      const iterator = body(wrapper);
      const issue = request => {
        const store = tx.objectStore(request.store);
        if (request.op === 'get') return store.get(request.key);
        if (request.op === 'all') return store.getAll();
        if (request.op === 'index') return store.index(request.index).getAll(request.value);
        if (request.op === 'prefix') return store.getAll(globalThis.IDBKeyRange.bound([request.first], [request.first, []]));
        throw new ProfileError('PROFILE_TX_BAD_REQUEST');
      };
      const step = input => {
        let next;
        try { next = iterator.next(input); } catch (error) { abort(error); return; }
        if (next.done) { result = next.value; return; }
        let request;
        try { request = issue(next.value); } catch (error) { abort(error); return; }
        request.onsuccess = () => step(request.result);
        request.onerror = event => { event.preventDefault(); abort(request.error); };
      };
      tx.oncomplete = () => failure ? reject(failure) : resolve(result);
      tx.onabort = () => reject(failure ?? mapStorageError(tx.error ?? new ProfileError('PROFILE_TX_ABORTED')));
      step(undefined);
    });
  }
  close() { this.db?.close(); this.db = null; }
}

// ── Immutable write helpers (generator fragments) ──────────────────────────
const checkpointIdentityBody = cp => {
  if (cp.schemaVersion === 2) { const { checkpointId: _a, createdAt: _b, tags: _c, protected: _d, favorite: _e, ...semantic } = cp; return semantic; }
  const { checkpointId: _a, ...body } = cp; return body;
};
function* putImmutable(tx, artifact, origin = 'LOCAL') {
  validateArtifact(artifact);
  const existing = yield op.get('artifacts', artifact.id);
  if (existing) {
    // Same ID with different immutable content is corruption, including nested changes.
    if (existing.digest !== artifact.digest || hashCanonical({ kind: existing.kind, scope: existing.scope ?? null, body: existing.body }) !== existing.digest) fail('IMMUTABLE_CONFLICT', artifact.id);
    if (origin === 'LOCAL' && existing.meta?.origin === 'IMPORTED_UNVERIFIED' && !existing.meta.locallyReproduced) tx.put('artifacts', { ...existing, meta: { ...existing.meta, locallyReproduced: true } });
    return existing;
  }
  const stored = { ...artifact, meta: { ...artifact.meta, origin } };
  tx.put('artifacts', stored);
  return stored;
}
function* putCheckpoint(tx, checkpoint) {
  const valid = validateCheckpoint(checkpoint, checkpoint?.identity);
  const existing = yield op.get('checkpoints', valid.checkpointId);
  if (existing) { if (digest(checkpointIdentityBody(existing)) !== digest(checkpointIdentityBody(valid))) fail('IMMUTABLE_CONFLICT', valid.checkpointId); return existing; }
  tx.put('checkpoints', structuredClone(valid));
  return valid;
}
function* requireArtifact(id, kind, scope) {
  const a = id ? yield op.get('artifacts', id) : null;
  if (!a) fail('ARTIFACT_NOT_FOUND', { id, kind });
  validateArtifact(a);
  if (kind && a.kind !== kind) fail('ARTIFACT_KIND_MISMATCH', { id, kind });
  if (scope !== undefined && a.scope !== scope) fail('ARTIFACT_SCOPE_MISMATCH', { id, scope });
  return a;
}
function* requireCheckpoint(id) {
  const cp = yield op.get('checkpoints', id);
  if (!cp) fail('CHECKPOINT_NOT_FOUND', id);
  return validateCheckpoint(cp, cp.identity);
}

export const transitionIdFor = (agentProfileId, fromHeadVersion, commandId) => `HT-${digest({ agentProfileId, fromHeadVersion, commandId })}`;
export const newProfileId = commandId => `AP-${digest({ kind: 'AGENT_PROFILE', commandId }).slice(0, 32)}`;
const nowIso = () => new Date().toISOString();

// ── Profile store ──────────────────────────────────────────────────────────
export class ProfileStore {
  /** @param {{transaction:Function}} backend @param {{identity:object, clock?:Function}} options */
  constructor(backend, { identity, clock = nowIso } = {}) {
    if (!identity?.fingerprint) fail('PROFILE_STORE_IDENTITY_REQUIRED');
    this.backend = backend; this.identity = identity; this.clock = clock;
  }
  read(names, body) { return this.backend.transaction(names, 'readonly', body); }
  write(names, body) { return this.backend.transaction(names, 'readwrite', body); }

  // ── Reads ──
  async getHead(agentProfileId) { return this.read(['heads'], function* () { return yield op.get('heads', agentProfileId); }); }
  async getArtifact(id) { return this.read(['artifacts'], function* () { return yield op.get('artifacts', id); }); }
  async getCheckpoint(id) { return this.read(['checkpoints'], function* () { return yield op.get('checkpoints', id); }); }
  async listArtifacts(scope, kind = null) { return this.read(['artifacts'], function* () { const list = yield op.index('artifacts', 'scope', scope); return kind ? list.filter(a => a.kind === kind) : list; }); }
  async listEvents(agentProfileId) { return this.read(['events'], function* () { return yield op.prefix('events', agentProfileId); }); }
  async listProfiles() {
    return this.read(['profiles', 'heads'], function* () {
      const profiles = yield op.all('profiles'), heads = yield op.all('heads');
      return profiles.map(p => ({ ...p, head: heads.find(h => h.agentProfileId === p.agentProfileId) ?? null }));
    });
  }
  async profileView(agentProfileId) {
    return this.read(['profiles', 'heads', 'events', 'artifacts', 'checkpoints', 'operations'], function* () {
      const profile = yield op.get('profiles', agentProfileId), head = yield op.get('heads', agentProfileId);
      if (!profile || !head) fail('PROFILE_NOT_FOUND', agentProfileId);
      const events = yield op.prefix('events', agentProfileId), artifacts = yield op.index('artifacts', 'scope', agentProfileId), operations = yield op.index('operations', 'scope', agentProfileId);
      const ids = new Set([head.championCheckpointId, ...events.flatMap(e => [e.after.championCheckpointId, e.before?.championCheckpointId]).filter(Boolean)]);
      for (const a of artifacts) for (const id of JSON.stringify(a.body).match(/CP2?-[a-f0-9]{64}/g) ?? []) ids.add(id);
      const checkpoints = [];
      for (const id of ids) { const cp = yield op.get('checkpoints', id); if (cp) checkpoints.push(cp); }
      const shared = new Set();
      for (const a of artifacts) for (const id of JSON.stringify(a.body).match(/(?:OBJ|PP|ERA|PK)-[a-f0-9]{64}/g) ?? []) shared.add(id);
      for (const id of [head.requiredEvaluationEraId, head.promotionPolicyId]) shared.add(id);
      const sharedArtifacts = [];
      for (const id of shared) { const a = yield op.get('artifacts', id); if (a) sharedArtifacts.push(a); }
      return { profile, head, events, artifacts: [...artifacts, ...sharedArtifacts], checkpoints, operations };
    });
  }

  // ── Immutable artifact writes outside head transitions ──
  async storeArtifacts({ artifacts = [], checkpoints = [] }) {
    return this.write(['artifacts', 'checkpoints'], function* (tx) {
      for (const cp of checkpoints) yield* putCheckpoint(tx, cp);
      for (const a of artifacts) yield* putImmutable(tx, a);
      return artifacts.map(a => a.id);
    });
  }
  /** Observational only: writes EXPERIENCE_RECORD artifacts and nothing else (I8). */
  async recordExperience(artifact) {
    if (artifact?.kind !== 'EXPERIENCE_RECORD') fail('NOT_AN_EXPERIENCE_RECORD');
    return this.write(['artifacts'], function* (tx) { const existing = yield op.get('artifacts', artifact.id); yield* putImmutable(tx, artifact); return { experienceId: artifact.id, duplicate: !!existing }; });
  }
  async renameProfile(agentProfileId, displayName) {
    const name = validateName(displayName);
    return this.write(['profiles'], function* (tx) { const p = yield op.get('profiles', agentProfileId); if (!p) fail('PROFILE_NOT_FOUND'); tx.put('profiles', { ...p, displayName: name }); return name; });
  }

  // ── Fenced operational progress ──
  async claimOperation({ operationId, scope, kind, manifestId }) {
    const ownerToken = `OWN-${digest({ operationId, nonce: Math.random(), at: this.clock() }).slice(0, 24)}`;
    return this.write(['operations'], function* (tx) {
      const existing = yield op.get('operations', operationId);
      if (existing && existing.manifestId !== manifestId) fail('OPERATION_MANIFEST_MISMATCH', operationId);
      if (existing && ['COMPLETED', 'CANCELLED', 'FAILED'].includes(existing.status)) fail('OPERATION_FINISHED', existing.status);
      const fence = (existing?.fence ?? 0) + 1;
      tx.put('operations', { operationId, scope, kind, manifestId, status: 'RUNNING', fence, ownerToken, progress: existing?.progress ?? {} });
      return { operationId, fence, ownerToken };
    });
  }
  /** Commit immutable results and progress only if the caller still owns the operation. */
  async commitOperation(lease, { artifacts = [], checkpoints = [], progress = null, status = null } = {}) {
    return this.write(['operations', 'artifacts', 'checkpoints'], function* (tx) {
      const current = yield op.get('operations', lease.operationId);
      if (!current || current.fence !== lease.fence || current.ownerToken !== lease.ownerToken) fail('STALE_OPERATION_OWNER', lease.operationId);
      if (['COMPLETED', 'CANCELLED', 'FAILED'].includes(current.status)) fail('OPERATION_FINISHED', current.status);
      for (const cp of checkpoints) yield* putCheckpoint(tx, cp);
      for (const a of artifacts) yield* putImmutable(tx, a);
      tx.put('operations', { ...current, progress: progress ? { ...current.progress, ...progress } : current.progress, status: status ?? current.status });
      return true;
    });
  }
  async getOperation(operationId) { return this.read(['operations'], function* () { return yield op.get('operations', operationId); }); }
  async cancelOperation(operationId) {
    return this.write(['operations'], function* (tx) {
      const current = yield op.get('operations', operationId);
      if (!current) fail('OPERATION_NOT_FOUND');
      if (['COMPLETED', 'CANCELLED', 'FAILED'].includes(current.status)) return current.status;
      tx.put('operations', { ...current, status: 'CANCELLED', fence: current.fence + 1, ownerToken: null });
      return 'CANCELLED';
    });
  }

  // ── Deep traces (prunable with tombstone) ──
  async putTrace({ traceId, scope, payload }) { return this.write(['traces'], function* (tx) { const e = yield op.get('traces', traceId); if (!e) tx.put('traces', { traceId, scope, payload }); return !e; }); }
  async getTrace(traceId) { return this.read(['traces'], function* () { return yield op.get('traces', traceId); }); }
  async pruneTraces(scope, traceIds, reason) {
    const tombstone = makeArtifact('RETENTION_TOMBSTONE', { traceIds: [...traceIds].sort(), tier: 'DEEP_TRACE', reason: String(reason).slice(0, 300), summaryRetained: true }, { scope });
    return this.write(['traces', 'artifacts'], function* (tx) {
      for (const id of traceIds) { const t = yield op.get('traces', id); if (t && t.scope === scope) tx.delete('traces', id); }
      yield* putImmutable(tx, tombstone);
      return tombstone.id;
    });
  }
  /** Reference closure required to explain and recompute committed decisions. */
  async protectedClosure() {
    return this.read(['heads', 'events', 'artifacts', 'checkpoints'], function* () {
      const heads = yield op.all('heads'), events = yield op.all('events'), artifacts = yield op.all('artifacts');
      const byId = new Map(artifacts.map(a => [a.id, a])), keep = new Set(), queue = [];
      const visit = text => { for (const id of String(text).match(/(?:CP2?|[A-Z]{1,3})-[a-f0-9]{64}/g) ?? []) if (!keep.has(id)) { keep.add(id); queue.push(id); } };
      visit(JSON.stringify(heads)); visit(JSON.stringify(events));
      const roots = artifacts.filter(a => ['PROFILE_REVISION', 'PROMOTION_RECORD', 'LEARNING_JOURNAL', 'CHALLENGE_DECISION', 'GENERATION_SELECTION', 'CHALLENGER_NOMINATION', 'SERIES_MANIFEST', 'SERIES_OUTCOME', 'CHALLENGE_MANIFEST', 'EXPOSURE_RECORD', 'MIGRATION_LINK'].includes(a.kind));
      for (const a of roots) { keep.add(a.id); queue.push(a.id); }
      while (queue.length) { const a = byId.get(queue.pop()); if (a) visit(JSON.stringify(a.body)); }
      return keep;
    });
  }
  /** Only RESEARCH-tier artifacts outside the protected closure may be deleted. */
  async deleteResearchArtifacts(ids) {
    const closure = await this.protectedClosure();
    const protectedIds = ids.filter(id => closure.has(id));
    if (protectedIds.length) fail('PROTECTED_EVIDENCE', protectedIds);
    return this.write(['artifacts'], function* (tx) {
      for (const id of ids) { const a = yield op.get('artifacts', id); if (a && !['MEASUREMENT_RESULT', 'MEASUREMENT_MANIFEST', 'EXPERIENCE_RECORD'].includes(a.kind)) fail('NOT_RESEARCH_TIER', id); if (a) tx.delete('artifacts', id); }
      return ids.length;
    });
  }

  // ── Snapshots (I9) ──
  async resolveProfileHead(agentProfileId) {
    const identity = this.identity;
    return this.read(['profiles', 'heads', 'checkpoints', 'artifacts'], function* () {
      const head = yield op.get('heads', agentProfileId), profile = yield op.get('profiles', agentProfileId);
      if (!head || !profile) fail('PROFILE_NOT_FOUND', agentProfileId);
      const checkpoint = yield* requireCheckpoint(head.championCheckpointId), revision = yield* requireArtifact(head.activeRevisionId, 'PROFILE_REVISION', agentProfileId);
      const objective = yield* requireArtifact(revision.body.objectiveInstanceId, 'CAPABILITY_OBJECTIVE', null);
      return buildSnapshot({ checkpoint, identity, profile: { agentProfileId, headVersion: head.headVersion, headTokenDigest: digest(headToken(head)), activeRevisionId: head.activeRevisionId, displayName: profile.displayName }, rulesProfileId: objective.body.rulesProfileId });
    });
  }
  async resolveCheckpoint(checkpointId, { rulesProfileId } = {}) {
    const identity = this.identity;
    return this.read(['checkpoints'], function* () { return buildSnapshot({ checkpoint: yield* requireCheckpoint(checkpointId), identity, profile: null, rulesProfileId: rulesProfileId ?? null }); });
  }

  // ── Head-changing commands (I5/I6) ──
  /** Shared discipline: receipt lookup → full head-token compare → validation →
   * immutable writes → event + receipt + head, all in one transaction. */
  async #command(command, plan) {
    const commandDigest = digest(command), clock = this.clock(), identity = this.identity;
    return this.write(COMMAND_STORES, function* (tx) {
      const receipt = yield op.get('receipts', command.commandId);
      if (receipt) { if (receipt.commandDigest !== commandDigest) fail('COMMAND_ID_REUSED', command.commandId); return { ...receipt.result, replayed: true }; }
      const head = yield op.get('heads', command.agentProfileId);
      if (command.expectedHead === null) { if (head) fail('PROFILE_EXISTS', command.agentProfileId); }
      else if (!head) fail('PROFILE_NOT_FOUND', command.agentProfileId);
      else if (!sameHead(head, command.expectedHead)) fail('STALE_HEAD', { expected: command.expectedHead.headVersion, actual: head.headVersion });
      const transitionId = transitionIdFor(command.agentProfileId, head?.headVersion ?? 0, command.commandId);
      const t = yield* plan(tx, head, transitionId, identity);
      for (const cp of t.checkpoints ?? []) yield* putCheckpoint(tx, cp);
      for (const a of t.artifacts ?? []) yield* putImmutable(tx, a);
      const champion = yield* requireCheckpoint(t.head.championCheckpointId);
      if (t.requireExecutable !== false && !canExecuteCheckpoint(champion, identity).ok) fail('CHAMPION_NOT_EXECUTABLE', canExecuteCheckpoint(champion, identity).reasons);
      const revision = yield* requireArtifact(t.head.activeRevisionId, 'PROFILE_REVISION', command.agentProfileId);
      if (t.journal.body.transitionId !== transitionId || t.journal.body.to.checkpointId !== t.head.championCheckpointId || t.journal.body.to.revisionId !== revision.id) fail('JOURNAL_TRANSITION_MISMATCH');
      yield* putImmutable(tx, t.journal);
      const newHead = { ...headToken({ ...t.head, agentProfileId: command.agentProfileId, headVersion: (head?.headVersion ?? 0) + 1, lastTransitionId: transitionId }) };
      const existingEvent = yield op.get('events', [command.agentProfileId, newHead.headVersion]);
      if (existingEvent) fail('IMMUTABLE_CONFLICT', 'event sequence');
      const event = strictCanonical({ agentProfileId: command.agentProfileId, sequence: newHead.headVersion, transitionId, type: t.eventType, commandId: command.commandId,
        before: head ? headToken(head) : null, after: newHead, journalId: t.journal.id, refs: t.refs ?? {}, evidenceStatus: t.evidenceStatus, reason: t.reason ?? null, recordedAt: clock });
      if (t.profile) tx.put('profiles', t.profile);
      tx.put('events', event); tx.put('heads', newHead);
      const result = { transitionId, head: newHead, eventType: t.eventType, journalId: t.journal.id, ...(t.result ?? {}) };
      tx.put('receipts', { commandId: command.commandId, agentProfileId: command.agentProfileId, commandDigest, result, recordedAt: clock });
      return result;
    });
  }

  /** Custom creation: no archetype classification is requested or stored. */
  async createProfile({ commandId, displayName, traits = {}, statement = '', rulesProfileId = 'core-advanced-authority', template = null, mutationConstraints = {}, identityConstraints = [], seriesDefaults = SERIES_DEFAULTS, heldOutPairs = 8, adaptiveStrategy = null }, { templateCatalog = TEMPLATE_CATALOG } = {}) {
    const name = validateName(displayName), agentProfileId = newProfileId(commandId);
    const templateRef = template ? resolveTemplate(template.templateId, template.templateVersion, templateCatalog) : null;
    const resolvedTraits = validateTraits({ ...(templateRef?.resolvedTraits ?? {}), ...traits });
    const objective = resolveObjective({ rulesProfileId }), policy = resolvePromotionPolicy(), era = resolveEra({ identity: this.identity, objective });
    validatePolicyForObjective(policy.body, objective.body);
    const compiled = compileTraits({ traits: resolvedTraits, baseGenome: ZERO_GENOME() });
    const checkpoint = createTrainableCheckpoint({ identity: this.identity, agentId: `AP:${agentProfileId}`, lineageId: `LINEAGE-${agentProfileId}`, policyState: compiled.policyState, adaptive: adaptiveStrategy,
      mutation: { kind: 'PROFILE_BASELINE_V1', baseGenome: 'ZERO_RESIDUALS_V1', compiler: compiled.compiler, writes: compiled.writes, template: templateRef }, createdAt: this.clock() });
    const revision = makeRevision({ agentProfileId, revisionNumber: 1, parentRevisionId: null, origin: 'CREATED', traits: resolvedTraits, statement, mutationConstraints, identityConstraints, objectiveInstanceId: objective.id,
      defaults: { series: { ...seriesDefaults }, heldOutPairs, promotionPolicyId: policy.id }, template: templateRef, forkedFrom: null, checkpointId: checkpoint.checkpointId, adaptiveStrategy,
      executableChange: { compiler: compiled.compiler, writes: compiled.writes, sourceCheckpointId: null } });
    const command = { commandId, type: 'CREATE_PROFILE', agentProfileId, expectedHead: null, payload: { displayName: name, traits, statement, rulesProfileId, template, mutationConstraints, identityConstraints, seriesDefaults, heldOutPairs } };
    const clock = this.clock();
    // The shared command coroutine yields the writes; this plan only returns their values.
    // eslint-disable-next-line require-yield
    return this.#command(command, function* (_tx, _head, transitionId) {
      const journal = buildJournal({ kind: 'INITIALIZATION', agentProfileId, transitionId, from: null, to: { checkpoint, revisionId: revision.id }, inputs: { evidenceStatus: 'UNEVALUATED', context: { championOrigin: Object.keys(resolvedTraits).length ? 'AUTHORED' : 'BASELINE' } } });
      return { eventType: 'INITIALIZED', evidenceStatus: 'UNEVALUATED', checkpoints: [checkpoint], artifacts: [objective, policy, era, revision], journal,
        head: { activeRevisionId: revision.id, championCheckpointId: checkpoint.checkpointId, requiredEvaluationEraId: era.id, promotionPolicyId: policy.id },
        profile: { agentProfileId, displayName: name, tags: [], origin: 'LOCAL', createdAt: clock, forkOf: null }, result: { agentProfileId } };
    });
  }

  /** Drafting never moves the head. Executable edits compile an AUTHORED checkpoint. */
  async saveDraftRevision({ agentProfileId, baseRevisionId, traits = null, statement = null, mutationConstraints = null, identityConstraints = null, seriesDefaults = null, heldOutPairs = null, rulesProfileId = null, sourceCheckpointId, adaptiveStrategy }) {
    const view = await this.profileView(agentProfileId);
    const base = view.artifacts.find(a => a.id === baseRevisionId && a.kind === 'PROFILE_REVISION');
    if (!base) fail('ARTIFACT_NOT_FOUND', baseRevisionId);
    const source = view.checkpoints.find(cp => cp.checkpointId === sourceCheckpointId) ?? await this.getCheckpoint(sourceCheckpointId);
    if (!source) fail('CHECKPOINT_NOT_FOUND', sourceCheckpointId);
    const b = base.body, changedTraits = traits ? Object.fromEntries(Object.entries(validateTraits(traits)).filter(([k, v]) => b.intendedIdentity.traits[k] !== v)) : {};
    // undefined = inherit the base revision's adaptive intent; null = explicitly OFF.
    const nextAdaptive = adaptiveStrategy === undefined ? (b.adaptiveStrategy ?? null) : adaptiveStrategy;
    if (nextAdaptive != null) validateAdaptiveConfig(nextAdaptive);
    const adaptiveChanged = digest(nextAdaptive ?? null) !== digest(source.adaptive ?? null);
    let checkpoint = source, executableChange = null;
    if (Object.keys(changedTraits).length || adaptiveChanged) {
      if (!canExecuteCheckpoint(source, this.identity).ok) fail('AUTHORING_SOURCE_NOT_EXECUTABLE', canExecuteCheckpoint(source, this.identity).reasons);
      const compiled = compileTraits({ traits: changedTraits, baseGenome: source.policyState });
      checkpoint = createTrainableCheckpoint({ identity: this.identity, agentId: `AP:${agentProfileId}`, lineageId: source.lineageId, parent: source, policyState: compiled.policyState, adaptive: nextAdaptive,
        mutation: { kind: 'PROFILE_AUTHORED_EDIT_V1', sourceCheckpointId: source.checkpointId, compiler: compiled.compiler, writes: compiled.writes }, createdAt: this.clock() });
      executableChange = { compiler: compiled.compiler, writes: compiled.writes, sourceCheckpointId: source.checkpointId,
        ...(adaptiveChanged ? { adaptiveChange: { from: source.adaptive ?? null, to: nextAdaptive } } : {}) };
    }
    const objective = rulesProfileId && rulesProfileId !== (await this.getArtifact(b.objectiveInstanceId)).body.rulesProfileId ? resolveObjective({ rulesProfileId }) : null;
    const revision = makeRevision({ agentProfileId, revisionNumber: b.revisionNumber + 1, parentRevisionId: base.id, origin: 'AUTHORED_EDIT', traits: { ...b.intendedIdentity.traits, ...(traits ?? {}) },
      statement: statement ?? b.intendedIdentity.statement, mutationConstraints: mutationConstraints ?? b.mutationConstraints, identityConstraints: identityConstraints ?? b.identityConstraints,
      objectiveInstanceId: objective?.id ?? b.objectiveInstanceId, defaults: { series: seriesDefaults ?? b.defaults.series, heldOutPairs: heldOutPairs ?? b.defaults.heldOutPairs, promotionPolicyId: b.defaults.promotionPolicyId },
      template: b.template, forkedFrom: b.forkedFrom, checkpointId: checkpoint.checkpointId, executableChange, adaptiveStrategy: nextAdaptive });
    await this.storeArtifacts({ artifacts: [...(objective ? [objective] : []), revision], checkpoints: checkpoint === source ? [] : [checkpoint] });
    return { revision, checkpoint, preview: previewAuthoredEdit({ source, next: checkpoint, checkpointsById: new Map(view.checkpoints.map(cp => [cp.checkpointId, cp])) }) };
  }

  async activateAuthoredRevision({ commandId, agentProfileId, expectedHead, revisionId }) {
    const view = await this.profileView(agentProfileId), revision = view.artifacts.find(a => a.id === revisionId);
    if (!revision || revision.kind !== 'PROFILE_REVISION') fail('ARTIFACT_NOT_FOUND', revisionId);
    const objective = await this.getArtifact(revision.body.objectiveInstanceId), era = resolveEra({ identity: this.identity, objective });
    const from = view.checkpoints.find(cp => cp.checkpointId === expectedHead.championCheckpointId), to = view.checkpoints.find(cp => cp.checkpointId === revision.body.authoredCheckpointId);
    const command = { commandId, type: 'ACTIVATE_AUTHORED_REVISION', agentProfileId, expectedHead, payload: { revisionId } };
    const provenance = to ? parameterProvenance(to, new Map(view.checkpoints.map(cp => [cp.checkpointId, cp]))) : null;
    return this.#command(command, function* (_tx, head, transitionId) {
      const r = yield* requireArtifact(revisionId, 'PROFILE_REVISION', agentProfileId), o = yield* requireArtifact(r.body.objectiveInstanceId, 'CAPABILITY_OBJECTIVE', null);
      const policy = yield* requireArtifact(r.body.defaults.promotionPolicyId, 'PROMOTION_POLICY', null);
      validatePolicyForObjective(policy.body, o.body);
      if (r.body.origin !== 'AUTHORED_EDIT') fail('NOT_AN_AUTHORED_REVISION');
      const journal = buildJournal({ kind: 'AUTHORED_ACTIVATION', agentProfileId, transitionId, from: { checkpoint: from ?? (yield* requireCheckpoint(head.championCheckpointId)), revisionId: head.activeRevisionId }, to: { checkpoint: to ?? (yield* requireCheckpoint(r.body.authoredCheckpointId)), revisionId }, inputs: { provenance, evidenceStatus: 'UNEVALUATED', context: { executableChange: r.body.executableChange !== null } } });
      return { eventType: 'AUTHORED_REVISION_ACTIVATED', evidenceStatus: 'UNEVALUATED', artifacts: [era], journal, refs: { revisionId, parentRevisionId: r.body.parentRevisionId },
        head: { activeRevisionId: revisionId, championCheckpointId: r.body.authoredCheckpointId, requiredEvaluationEraId: era.id, promotionPolicyId: policy.id } };
    });
  }

  /** Promotion requires a finalized, locally produced APPROVE decision whose
   * frozen expected head equals the current head in storage. */
  async promote({ commandId, agentProfileId, decisionId, journal, promotionRecord }) {
    const decision = await this.getArtifact(decisionId);
    if (!decision || decision.kind !== 'CHALLENGE_DECISION') fail('ARTIFACT_NOT_FOUND', decisionId);
    const manifest = await this.getArtifact(decision.body.challengeId);
    const expectedHead = manifest.body.expectedHead;
    const command = { commandId, type: 'PROMOTE', agentProfileId, expectedHead, payload: { decisionId } };
    return this.#command(command, function* (_tx, head, transitionId) {
      const d = yield* requireArtifact(decisionId, 'CHALLENGE_DECISION', agentProfileId), m = yield* requireArtifact(d.body.challengeId, 'CHALLENGE_MANIFEST', agentProfileId);
      const verdict = promotionAuthority({ decision: d, manifest: m, head });
      if (!verdict.ok) fail('PROMOTION_NOT_AUTHORIZED', verdict.reasons);
      for (const id of [d.body.challengerMeasurementId, d.body.incumbentMeasurementId]) { const mm = yield* requireArtifact(id, 'MEASUREMENT_RESULT', agentProfileId); if (mm.meta?.origin !== 'LOCAL' && !mm.meta?.locallyReproduced) fail('PROMOTION_NOT_AUTHORIZED', 'IMPORTED_EVIDENCE'); }
      yield* requireCheckpoint(m.body.challengerCheckpointId);
      if (!journal || journal.body.kind !== 'PROMOTION' || journal.body.sections.references.decisionId !== d.id) fail('JOURNAL_TRANSITION_MISMATCH');
      if (promotionRecord?.kind !== 'PROMOTION_RECORD' || promotionRecord.body.transitionId !== transitionId || promotionRecord.body.decisionId !== d.id || promotionRecord.body.journalId !== journal.id) fail('PROMOTION_RECORD_MISMATCH');
      return { eventType: 'PROMOTED', evidenceStatus: 'PROMOTION_CHALLENGE_APPROVED', artifacts: [promotionRecord], journal, refs: { decisionId: d.id, challengeId: m.id, promotionRecordId: promotionRecord.id, nominationId: m.body.nominationId },
        head: { activeRevisionId: head.activeRevisionId, championCheckpointId: m.body.challengerCheckpointId, requiredEvaluationEraId: head.requiredEvaluationEraId, promotionPolicyId: head.promotionPolicyId }, result: { promotionRecordId: promotionRecord.id } };
    });
  }

  /** Waives performance/evidence adequacy only; never integrity, compatibility, freshness or idempotency. */
  async manualActivate({ commandId, agentProfileId, expectedHead, checkpointId, reason, waivedCriteria = ['PERFORMANCE_THRESHOLD', 'EVIDENCE_ADEQUACY'], recommendationDecisionId = null }) {
    if (typeof reason !== 'string' || reason.trim().length < 3) fail('MANUAL_REASON_REQUIRED');
    if (waivedCriteria.some(c => !['PERFORMANCE_THRESHOLD', 'EVIDENCE_ADEQUACY'].includes(c))) fail('UNWAIVABLE_CRITERION', waivedCriteria);
    const view = await this.profileView(agentProfileId), rec = recommendationDecisionId ? view.artifacts.find(a => a.id === recommendationDecisionId) : null;
    const command = { commandId, type: 'MANUAL_ACTIVATE', agentProfileId, expectedHead, payload: { checkpointId, reason, waivedCriteria, recommendationDecisionId } };
    const checkpointsById = new Map(view.checkpoints.map(cp => [cp.checkpointId, cp]));
    return this.#command(command, function* (_tx, head, transitionId) {
      const target = yield* requireCheckpoint(checkpointId), from = yield* requireCheckpoint(head.championCheckpointId);
      const recommendation = rec ? { decisionId: rec.id, decision: rec.body.decision, reasons: rec.body.reasons } : null;
      const journal = buildJournal({ kind: 'MANUAL_ACTIVATION', agentProfileId, transitionId, from: { checkpoint: from, revisionId: head.activeRevisionId }, to: { checkpoint: target, revisionId: head.activeRevisionId }, inputs: { reason, waivedCriteria, recommendation, provenance: parameterProvenance(target, checkpointsById) } });
      return { eventType: 'MANUALLY_ACTIVATED', evidenceStatus: recommendation ? `AUTOMATED_RECOMMENDATION_${recommendation.decision}` : 'UNEVALUATED', reason, journal, refs: { recommendationDecisionId },
        head: { activeRevisionId: head.activeRevisionId, championCheckpointId: checkpointId, requiredEvaluationEraId: head.requiredEvaluationEraId, promotionPolicyId: head.promotionPolicyId } };
    });
  }

  /** Re-activates a historical pair with a fresh headVersion; never restores an old token. */
  async rollback({ commandId, agentProfileId, expectedHead, targetSequence, reason = '' }) {
    const command = { commandId, type: 'ROLLBACK', agentProfileId, expectedHead, payload: { targetSequence, reason } };
    return this.#command(command, function* (_tx, head, transitionId) {
      const target = yield op.get('events', [agentProfileId, targetSequence]);
      if (!target || targetSequence >= head.headVersion) fail('ROLLBACK_TARGET_NOT_HISTORICAL', targetSequence);
      const to = yield* requireCheckpoint(target.after.championCheckpointId), from = yield* requireCheckpoint(head.championCheckpointId);
      const journal = buildJournal({ kind: 'ROLLBACK', agentProfileId, transitionId, from: { checkpoint: from, revisionId: head.activeRevisionId }, to: { checkpoint: to, revisionId: target.after.activeRevisionId }, inputs: { evidenceStatus: 'HISTORICAL_STATUS_NOT_REVIVED', references: { targetSequence, targetTransitionId: target.transitionId } } });
      return { eventType: 'ROLLED_BACK', evidenceStatus: 'HISTORICAL_STATUS_NOT_REVIVED', reason, journal, refs: { targetSequence },
        head: { activeRevisionId: target.after.activeRevisionId, championCheckpointId: target.after.championCheckpointId, requiredEvaluationEraId: head.requiredEvaluationEraId, promotionPolicyId: head.promotionPolicyId } };
    });
  }

  /** Changing the required era or promotion policy bumps headVersion. */
  async changeContext({ commandId, agentProfileId, expectedHead, requiredEvaluationEraId = null, promotionPolicyId = null, eraArtifact = null, policyArtifact = null }) {
    const command = { commandId, type: 'CHANGE_CONTEXT', agentProfileId, expectedHead, payload: { requiredEvaluationEraId, promotionPolicyId } };
    return this.#command(command, function* (tx, head, transitionId, identity) {
      const revision = yield* requireArtifact(head.activeRevisionId, 'PROFILE_REVISION', agentProfileId), objective = yield* requireArtifact(revision.body.objectiveInstanceId, 'CAPABILITY_OBJECTIVE', null);
      const eraId = requiredEvaluationEraId ?? head.requiredEvaluationEraId, policyId = promotionPolicyId ?? head.promotionPolicyId;
      if (eraId === head.requiredEvaluationEraId && policyId === head.promotionPolicyId) fail('CONTEXT_UNCHANGED');
      for (const a of [eraArtifact, policyArtifact].filter(Boolean)) yield* putImmutable(tx, a);
      const era = yield* requireArtifact(eraId, 'EVALUATION_ERA', null), policy = yield* requireArtifact(policyId, 'PROMOTION_POLICY', null);
      validatePolicyForObjective(policy.body, objective.body);
      if (era.body.rulesProfileId !== objective.body.rulesProfileId || digest(era.body.objective.weights) !== digest(objective.body.aggregation.weights) || era.body.objective.definitionId !== objective.body.definitionId) fail('ERA_OBJECTIVE_MISALIGNED');
      if (era.body.implementation.fingerprint !== identity.fingerprint) fail('ERA_NOT_EXECUTABLE_IN_CURRENT_IMPLEMENTATION');
      const cp = yield* requireCheckpoint(head.championCheckpointId);
      const journal = buildJournal({ kind: 'CONTEXT_CHANGE', agentProfileId, transitionId, from: { checkpoint: cp, revisionId: head.activeRevisionId }, to: { checkpoint: cp, revisionId: head.activeRevisionId }, inputs: { evidenceStatus: 'UNCHANGED_GENOME', context: { fromEraId: head.requiredEvaluationEraId, toEraId: eraId, fromPolicyId: head.promotionPolicyId, toPolicyId: policyId } } });
      return { eventType: 'CONTEXT_CHANGED', evidenceStatus: 'UNCHANGED_GENOME', journal, refs: { eraId, policyId },
        head: { activeRevisionId: head.activeRevisionId, championCheckpointId: head.championCheckpointId, requiredEvaluationEraId: eraId, promotionPolicyId: policyId } };
    });
  }

  /** Fork: new Profile and head history referencing the exact source pair; source ancestry untouched. */
  async fork({ commandId, sourceAgentProfileId, sourceCheckpointId = null, sourceRevisionId = null, displayName }) {
    const name = validateName(displayName), source = await this.profileView(sourceAgentProfileId), agentProfileId = newProfileId(commandId);
    const revisionId = sourceRevisionId ?? source.head.activeRevisionId, checkpointId = sourceCheckpointId ?? source.head.championCheckpointId;
    const base = source.artifacts.find(a => a.id === revisionId && a.kind === 'PROFILE_REVISION'), checkpoint = source.checkpoints.find(cp => cp.checkpointId === checkpointId);
    if (!base || !checkpoint) fail('FORK_SOURCE_NOT_FOUND');
    if (!source.events.some(e => e.after.championCheckpointId === checkpointId) && !source.artifacts.some(a => JSON.stringify(a.body).includes(checkpointId))) fail('FORK_SOURCE_NOT_IN_PROFILE');
    const objective = source.artifacts.find(a => a.id === base.body.objectiveInstanceId) ?? await this.getArtifact(base.body.objectiveInstanceId);
    const era = resolveEra({ identity: this.identity, objective });
    const revision = makeRevision({ agentProfileId, revisionNumber: 1, parentRevisionId: null, origin: 'FORKED', traits: base.body.intendedIdentity.traits, statement: base.body.intendedIdentity.statement,
      mutationConstraints: base.body.mutationConstraints, identityConstraints: base.body.identityConstraints, objectiveInstanceId: base.body.objectiveInstanceId, defaults: base.body.defaults, template: base.body.template,
      adaptiveStrategy: base.body.adaptiveStrategy ?? checkpoint.adaptive ?? null,
      forkedFrom: { agentProfileId: sourceAgentProfileId, revisionId, checkpointId }, checkpointId, executableChange: null });
    const ancestry = makeArtifact('EXPOSURE_RECORD', { kind: 'ANCESTRY_LINK', ancestorAgentProfileId: sourceAgentProfileId, ancestorHeadVersion: source.head.headVersion, note: 'All exposures of the ancestor are treated as known exposures of this fork.' }, { scope: agentProfileId });
    const command = { commandId, type: 'FORK', agentProfileId, expectedHead: null, payload: { sourceAgentProfileId, sourceCheckpointId: checkpointId, sourceRevisionId: revisionId, displayName: name } };
    const clock = this.clock();
    // The shared command coroutine yields the writes; this plan only returns their values.
    // eslint-disable-next-line require-yield
    return this.#command(command, function* (_tx, _head, transitionId) {
      const journal = buildJournal({ kind: 'FORK', agentProfileId, transitionId, from: null, to: { checkpoint, revisionId: revision.id }, inputs: { evidenceStatus: 'INHERITED_HISTORY_NOT_REVALIDATED', references: { sourceAgentProfileId, sourceRevisionId: revisionId } } });
      return { eventType: 'FORKED', evidenceStatus: 'INHERITED_HISTORY_NOT_REVALIDATED', artifacts: [era, revision, ancestry], journal, refs: { sourceAgentProfileId, sourceRevisionId: revisionId, sourceCheckpointId: checkpointId },
        head: { activeRevisionId: revision.id, championCheckpointId: checkpointId, requiredEvaluationEraId: era.id, promotionPolicyId: base.body.defaults.promotionPolicyId },
        profile: { agentProfileId, displayName: name, tags: [], origin: 'LOCAL', createdAt: clock, forkOf: { agentProfileId: sourceAgentProfileId, revisionId, checkpointId } }, result: { agentProfileId } };
    });
  }

  /** V1 linkage: wraps an explicitly selected V1 checkpoint with original ID/hash. */
  async linkV1Checkpoint({ commandId, displayName, checkpoint, v1Context = {}, rulesProfileId = 'core-advanced-authority' }) {
    const name = validateName(displayName), agentProfileId = newProfileId(commandId);
    const original = validateCheckpoint(checkpoint, checkpoint?.identity);
    if (original.schemaVersion !== 2) fail('V1_CHECKPOINT_NOT_TRAINABLE', 'Only weighted-heuristic CP2 checkpoints can head a Profile.');
    const objective = resolveObjective({ rulesProfileId }), policy = resolvePromotionPolicy(), era = resolveEra({ identity: this.identity, objective });
    const link = makeArtifact('MIGRATION_LINK', { source: 'EVOLUTION_LAB_V1', v1CheckpointId: original.checkpointId, v1CheckpointDigest: hashCanonical(original), v1ExperimentId: v1Context.experimentId ?? null, v1ScientificId: v1Context.scientificId ?? null,
      v1EvidenceNote: 'V1 TRAINING/EVALUATION results are historical under their original schema; they are not PROMOTION_CHALLENGE evidence.' }, { scope: agentProfileId });
    const exposures = (v1Context.packs ?? []).map(p => makeArtifact('EXPOSURE_RECORD', { kind: 'V1_PACK_EXPOSURE', legacyPurpose: p.purpose, packId: p.packId, seeds: [...p.seeds], use: p.purpose === 'TRAINING' ? 'SELECTION' : 'MEASUREMENT_RELEASED_AND_USED_FOR_REGRESSIONS' }, { scope: agentProfileId }));
    const revision = makeRevision({ agentProfileId, revisionNumber: 1, parentRevisionId: null, origin: 'MIGRATED_FROM_V1', traits: {}, statement: 'Migrated from V1; no authored intent was recorded.', mutationConstraints: {}, identityConstraints: [],
      objectiveInstanceId: objective.id, defaults: { series: { ...SERIES_DEFAULTS }, heldOutPairs: 8, promotionPolicyId: policy.id }, template: null, forkedFrom: null, checkpointId: original.checkpointId, executableChange: null, adaptiveStrategy: original.adaptive ?? null });
    const command = { commandId, type: 'LINK_V1', agentProfileId, expectedHead: null, payload: { displayName: name, v1CheckpointId: original.checkpointId, rulesProfileId, v1Context } };
    const clock = this.clock();
    // The shared command coroutine yields the writes; this plan only returns their values.
    // eslint-disable-next-line require-yield
    return this.#command(command, function* (_tx, _head, transitionId) {
      const journal = buildJournal({ kind: 'V1_LINK', agentProfileId, transitionId, from: null, to: { checkpoint: original, revisionId: revision.id }, inputs: { evidenceStatus: 'V1_HISTORICAL_NOT_PROMOTION_EVIDENCE', references: { migrationLinkId: link.id } } });
      return { eventType: 'LINKED_FROM_V1', evidenceStatus: 'V1_HISTORICAL_NOT_PROMOTION_EVIDENCE', checkpoints: [original], artifacts: [objective, policy, era, link, ...exposures, revision], journal, requireExecutable: false,
        head: { activeRevisionId: revision.id, championCheckpointId: original.checkpointId, requiredEvaluationEraId: era.id, promotionPolicyId: policy.id },
        profile: { agentProfileId, displayName: name, tags: [], origin: 'MIGRATED_FROM_V1', createdAt: clock, forkOf: null }, result: { agentProfileId, migrationLinkId: link.id } };
    });
  }

  // ── Export / import ──
  async exportProfile(agentProfileId, { includeTraces = false } = {}) {
    const bundle = await this.read(Object.keys(STORES), function* () {
      const profile = yield op.get('profiles', agentProfileId), head = yield op.get('heads', agentProfileId);
      if (!profile || !head) fail('PROFILE_NOT_FOUND');
      const events = yield op.prefix('events', agentProfileId), all = yield op.all('artifacts'), byId = new Map(all.map(a => [a.id, a]));
      const scopes = new Set([agentProfileId]), queue = [agentProfileId];
      while (queue.length) { const scope = queue.pop(); for (const a of all) if (a.scope === scope && a.kind === 'EXPOSURE_RECORD' && a.body.kind === 'ANCESTRY_LINK' && !scopes.has(a.body.ancestorAgentProfileId)) { scopes.add(a.body.ancestorAgentProfileId); queue.push(a.body.ancestorAgentProfileId); } }
      const include = new Map(), checkpointIds = new Set(), pending = [];
      const scan = text => { for (const id of String(text).match(/(?:CP2?|[A-Z]{1,3})-[a-f0-9]{64}/g) ?? []) { if (/^CP2?-/.test(id)) checkpointIds.add(id); else if (!include.has(id) && byId.has(id)) { include.set(id, byId.get(id)); pending.push(id); } } };
      for (const a of all) if (scopes.has(a.scope) && a.kind !== 'EXPERIENCE_RECORD') { include.set(a.id, a); pending.push(a.id); }
      scan(JSON.stringify(head)); scan(JSON.stringify(events));
      while (pending.length) scan(JSON.stringify(include.get(pending.pop()).body));
      const checkpoints = [];
      for (const id of [...checkpointIds].sort()) { const cp = yield op.get('checkpoints', id); if (cp) checkpoints.push(cp); }
      const traces = yield op.index('traces', 'scope', agentProfileId), receipts = (yield op.all('receipts')).filter(r => r.agentProfileId === agentProfileId);
      return { profile, head, events, artifacts: [...include.values()].sort((a, b) => a.id.localeCompare(b.id)), checkpoints, receipts, traces };
    });
    const traces = includeTraces ? bundle.traces : [];
    const payload = { agentProfileId, profile: { displayName: bundle.profile.displayName, tags: bundle.profile.tags, origin: bundle.profile.origin, forkOf: bundle.profile.forkOf }, head: bundle.head, events: bundle.events,
      artifacts: bundle.artifacts.map(({ meta, ...a }) => ({ ...a, meta: { origin: meta?.origin ?? 'LOCAL' } })), checkpoints: bundle.checkpoints, traces,
      nonAuthoritative: { receipts: bundle.receipts.map(r => ({ commandId: r.commandId, commandDigest: r.commandDigest, result: r.result })), note: 'Receipts are exported for audit only and are never imported as authority.' },
      manifest: { contracts: CONTRACTS, artifactDigests: Object.fromEntries(bundle.artifacts.map(a => [a.id, a.digest])), checkpointIds: bundle.checkpoints.map(cp => cp.checkpointId),
        omittedTraces: includeTraces ? [] : bundle.traces.map(t => t.traceId), retainedTraces: traces.map(t => t.traceId) } };
    return { format: CONTRACTS.bundle.format, version: CONTRACTS.bundle.version, payload, bundleDigest: hashCanonical(payload) };
  }
  /** Validate completely before one atomic commit. Imported claims stay unverified. */
  async importBundle(input, { asFork = false, commandId = null, displayName = null } = {}) {
    const text = typeof input === 'string' ? input : JSON.stringify(input);
    if (new TextEncoder().encode(text).byteLength > LAB_LIMITS.importBytes) fail('IMPORT_TOO_LARGE');
    let bundle;
    try { bundle = JSON.parse(text); } catch { fail('IMPORT_NOT_JSON'); }
    if (bundle?.format !== CONTRACTS.bundle.format) fail('UNSUPPORTED_BUNDLE_FORMAT');
    if (bundle.version !== CONTRACTS.bundle.version) fail('UNSUPPORTED_BUNDLE_VERSION', bundle.version);
    if (hashCanonical(bundle.payload) !== bundle.bundleDigest) fail('BUNDLE_DIGEST_MISMATCH');
    const p = bundle.payload;
    if (!Array.isArray(p.artifacts) || p.artifacts.length > 50000 || !Array.isArray(p.checkpoints) || p.checkpoints.length > 5000 || !Array.isArray(p.events) || p.events.length > 10000) fail('IMPORT_BUDGET_EXCEEDED');
    for (const a of p.artifacts) { validateArtifact(a); if (p.manifest.artifactDigests[a.id] !== a.digest) fail('BUNDLE_MANIFEST_MISMATCH', a.id); }
    for (const cp of p.checkpoints) validateCheckpoint(cp, cp.identity);
    validateEventChain(p.events, p.head);
    const ids = new Set([...p.artifacts.map(a => a.id), ...p.checkpoints.map(cp => cp.checkpointId)]);
    for (const e of p.events) for (const id of [e.after.championCheckpointId, e.after.activeRevisionId, e.journalId]) if (!ids.has(id)) fail('BUNDLE_REFERENCE_MISSING', id);
    const sourceId = p.agentProfileId, clock = this.clock();
    const record = makeArtifact('IMPORT_RECORD', { bundleDigest: bundle.bundleDigest, sourceAgentProfileId: sourceId, artifactCount: p.artifacts.length, checkpointCount: p.checkpoints.length, mode: asFork ? 'AS_FORK' : 'AS_PROFILE', provenance: 'IMPORTED_UNVERIFIED' }, { scope: sourceId });
    const writeImported = function* (tx) {
      for (const cp of p.checkpoints) yield* putCheckpoint(tx, cp);
      for (const a of p.artifacts) yield* putImmutable(tx, { ...a, meta: {} }, 'IMPORTED_UNVERIFIED');
      yield* putImmutable(tx, record, 'IMPORTED_UNVERIFIED');
    };
    if (!asFork) {
      return this.write(Object.keys(STORES), function* (tx) {
        const local = yield op.get('heads', sourceId);
        if (local) {
          const localEvents = yield op.prefix('events', sourceId);
          if (!sameHead(local, p.head) || digest(localEvents.map(stripRecorded)) !== digest(p.events.map(stripRecorded))) fail('PROFILE_HEAD_CONFLICT', 'Local history differs; import as a fork instead.');
          yield* writeImported(tx);
          return { agentProfileId: sourceId, idempotent: true };
        }
        yield* writeImported(tx);
        for (const e of p.events) tx.put('events', e);
        tx.put('heads', headToken(p.head));
        tx.put('profiles', { agentProfileId: sourceId, displayName: validateName(p.profile.displayName), tags: p.profile.tags ?? [], origin: 'IMPORTED_UNVERIFIED', createdAt: clock, forkOf: p.profile.forkOf ?? null, importRecordId: record.id });
        return { agentProfileId: sourceId, idempotent: false, importRecordId: record.id };
      });
    }
    if (!commandId) fail('COMMAND_ID_REQUIRED');
    const headRevision = p.artifacts.find(a => a.id === p.head.activeRevisionId), checkpoint = p.checkpoints.find(cp => cp.checkpointId === p.head.championCheckpointId);
    const agentProfileId = newProfileId(commandId), name = validateName(displayName ?? `${p.profile.displayName} (import)`);
    const objective = p.artifacts.find(a => a.id === headRevision.body.objectiveInstanceId), era = resolveEra({ identity: this.identity, objective });
    const revision = makeRevision({ agentProfileId, revisionNumber: 1, parentRevisionId: null, origin: 'IMPORTED_AS_FORK', traits: headRevision.body.intendedIdentity.traits, statement: headRevision.body.intendedIdentity.statement,
      mutationConstraints: headRevision.body.mutationConstraints, identityConstraints: headRevision.body.identityConstraints, objectiveInstanceId: headRevision.body.objectiveInstanceId, defaults: headRevision.body.defaults, template: headRevision.body.template,
      adaptiveStrategy: headRevision.body.adaptiveStrategy ?? checkpoint.adaptive ?? null,
      forkedFrom: { agentProfileId: sourceId, revisionId: headRevision.id, checkpointId: checkpoint.checkpointId }, checkpointId: checkpoint.checkpointId, executableChange: null });
    const ancestry = makeArtifact('EXPOSURE_RECORD', { kind: 'ANCESTRY_LINK', ancestorAgentProfileId: sourceId, ancestorHeadVersion: p.head.headVersion, note: 'Imported ancestor exposures are known; unknown external exposure is not ruled out.' }, { scope: agentProfileId });
    const command = { commandId, type: 'IMPORT_AS_FORK', agentProfileId, expectedHead: null, payload: { bundleDigest: bundle.bundleDigest, displayName: name } };
    // Imported artifacts are committed in the same transaction as the new head.
    return this.#command(command, function* (tx, _head, transitionId) {
      yield* writeImported(tx);
      const journal = buildJournal({ kind: 'IMPORT_AS_FORK', agentProfileId, transitionId, from: null, to: { checkpoint, revisionId: revision.id }, inputs: { evidenceStatus: 'IMPORTED_UNVERIFIED', references: { importRecordId: record.id, sourceAgentProfileId: sourceId } } });
      return { eventType: 'IMPORTED_AS_FORK', evidenceStatus: 'IMPORTED_UNVERIFIED', artifacts: [era, revision, ancestry], journal, requireExecutable: false, refs: { importRecordId: record.id, sourceAgentProfileId: sourceId },
        head: { activeRevisionId: revision.id, championCheckpointId: checkpoint.checkpointId, requiredEvaluationEraId: era.id, promotionPolicyId: headRevision.body.defaults.promotionPolicyId },
        profile: { agentProfileId, displayName: name, tags: [], origin: 'IMPORTED_AS_FORK', createdAt: clock, forkOf: { agentProfileId: sourceId, revisionId: headRevision.id, checkpointId: checkpoint.checkpointId } }, result: { agentProfileId, importRecordId: record.id } };
    });
  }
}

const stripRecorded = ({ recordedAt: _r, ...e }) => e;
function validateEventChain(events, head) {
  if (!events.length) fail('BUNDLE_EVENTS_MISSING');
  events.forEach((e, i) => {
    if (e.sequence !== i + 1 || e.after.headVersion !== i + 1 || (i === 0 ? e.before !== null : !sameHead(e.before, events[i - 1].after)) || e.after.lastTransitionId !== e.transitionId) fail('BUNDLE_EVENT_CHAIN_BROKEN', i + 1);
  });
  if (!sameHead(events.at(-1).after, head)) fail('BUNDLE_HEAD_MISMATCH');
}
function validateName(displayName) {
  const name = String(displayName ?? '').trim();
  // Reject intentional C0 control characters in display names.
  // eslint-disable-next-line no-control-regex
  if (!name || name.length > 80 || /[\u0000-\u001f]/.test(name)) fail('INVALID_DISPLAY_NAME');
  return name;
}
export function makeRevision({ agentProfileId, revisionNumber, parentRevisionId, origin, traits, statement, mutationConstraints, identityConstraints, objectiveInstanceId, defaults, template, forkedFrom, checkpointId, executableChange, adaptiveStrategy = null }) {
  const body = { agentProfileId, revisionNumber, parentRevisionId, origin, intendedIdentity: { traits: structuredClone(traits), statement: String(statement ?? '') }, mutationConstraints: validateMutationConstraints(structuredClone(mutationConstraints)),
    identityConstraints: validateIdentityConstraints(structuredClone(identityConstraints)), objectiveInstanceId, defaults: structuredClone(defaults), template, forkedFrom, authoredCheckpointId: checkpointId, executableChange,
    ...(adaptiveStrategy != null ? { adaptiveStrategy: validateAdaptiveConfig(structuredClone(adaptiveStrategy)) } : {}) };
  validateRevisionBody(body);
  return makeArtifact('PROFILE_REVISION', body, { scope: agentProfileId });
}
/** Full genome delta, flagging learned values an authored edit would replace. */
export function previewAuthoredEdit({ source, next, checkpointsById }) {
  const provenance = parameterProvenance(source, checkpointsById);
  return genomeDelta(source, next).map(row => ({ ...row, currentProvenance: provenance[row.parameter], replacesLearnedValue: row.changed && provenance[row.parameter].startsWith('LEARNED') }));
}
/** Pure authority check for automatic promotion (canPromoteInContext). */
export function promotionAuthority({ decision, manifest, head }) {
  const reasons = [];
  if (decision.body.decision !== 'APPROVE') reasons.push(`DECISION_${decision.body.decision}`);
  if (decision.body.challengeId !== manifest.id) reasons.push('DECISION_MANIFEST_MISMATCH');
  if (!manifest.body.attempt.automaticEligible) reasons.push('REPEAT_ATTEMPT_NOT_AUTOMATICALLY_ELIGIBLE');
  if (!sameHead(head, manifest.body.expectedHead)) reasons.push('STALE_CHALLENGE_HEAD');
  if (head.championCheckpointId !== manifest.body.incumbentCheckpointId) reasons.push('INCUMBENT_CHANGED');
  if (head.requiredEvaluationEraId !== manifest.body.eraId) reasons.push('ERA_CHANGED');
  if (head.promotionPolicyId !== manifest.body.promotionPolicyId) reasons.push('POLICY_CHANGED');
  if (head.activeRevisionId !== manifest.body.revisionId) reasons.push('REVISION_CHANGED');
  if (decision.meta?.origin && decision.meta.origin !== 'LOCAL' && !decision.meta.locallyReproduced) reasons.push('IMPORTED_DECISION');
  return deepFreeze({ ok: reasons.length === 0, reasons });
}
export function buildSnapshot({ checkpoint, identity, profile, rulesProfileId }) {
  const executable = canExecuteCheckpoint(checkpoint, identity);
  if (!executable.ok) fail('SNAPSHOT_NOT_EXECUTABLE', executable.reasons);
  const body = { contract: `${CONTRACTS.snapshot.id}@${CONTRACTS.snapshot.version}`, kind: profile ? 'PROFILE_HEAD' : 'CHECKPOINT', checkpointId: checkpoint.checkpointId, policyId: checkpoint.policyId, policyVersion: checkpoint.policyVersion,
    policyState: structuredClone(checkpoint.policyState), genomeDigest: genomeDigest(checkpoint), implementation: { fingerprint: identity.fingerprint, engineVersion: identity.engineVersion, rulesVersion: identity.rulesVersion }, rulesProfileId,
    ...(checkpoint.adaptive != null ? { adaptive: structuredClone(checkpoint.adaptive) } : {}),
    profile: profile ? { agentProfileId: profile.agentProfileId, headVersion: profile.headVersion, headTokenDigest: profile.headTokenDigest, activeRevisionId: profile.activeRevisionId } : null };
  return deepFreeze({ ...strictCanonical(body), displayName: profile?.displayName ?? null, snapshotDigest: digest(body) });
}
export function validateSnapshot(snapshot) {
  const { displayName: _d, snapshotDigest, ...body } = snapshot ?? {};
  if (!snapshotDigest || digest(body) !== snapshotDigest || body.contract !== `${CONTRACTS.snapshot.id}@${CONTRACTS.snapshot.version}`) fail('SNAPSHOT_DIGEST_MISMATCH');
  return snapshot;
}
export { validateObjectiveBody };
