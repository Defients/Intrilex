// ═══════════════════════════════════════════════════════════════
// forensic-persistence.mjs — IndexedDB persistence for forensic sessions
//
// Stores forensic sessions (bookmarks, branches, annotations, comparisons)
// in IndexedDB. Falls back to localStorage for small sessions when
// IndexedDB is unavailable (static-first / Neocities compatibility).
//
// The storage key scheme is:
//   IndexedDB: intrilex-player → FORENSIC store, keyPath: 'replayId'
//   localStorage fallback: intrilex:forensic:{replayId}
// ═══════════════════════════════════════════════════════════════

import { isIndexedDBAvailable, openDB } from '../play/persistence.js';

const FORENSIC_STORE = 'forensic';
const LS_PREFIX = 'intrilex:forensic:';

let _dbVersionChecked = false;

/**
 * Ensure the forensic object store exists in the database.
 * This must be called during onupgradeneeded, but we also handle
 * the case where the DB was already opened with an older version
 * by opening a new connection with a version bump.
 */
async function ensureForensicStore() {
  if (_dbVersionChecked) return;
  _dbVersionChecked = true;

  if (!isIndexedDBAvailable()) return;

  // Check if the store already exists
  const db = await openDB();
  if (db.objectStoreNames.contains(FORENSIC_STORE)) return;

  // The store doesn't exist — we need a version bump.
  // Close the current connection and reopen with a higher version.
  // This is handled by the persistence.js upgrade path, but since
  // we can't modify DB_VERSION there without a migration, we use
  // a separate database for forensic data.
  // Actually, let's use a separate database to avoid coupling.
  await openForensicDB();
}

/**
 * Open a dedicated forensic database (avoids coupling to persistence.js DB_VERSION).
 */
let _forensicDb = null;
async function openForensicDB() {
  if (_forensicDb) return _forensicDb;
  if (!isIndexedDBAvailable()) throw new Error('IDB_UNAVAILABLE');

  return new Promise((resolve, reject) => {
    const request = indexedDB.open('intrilex-forensic', 1);
    request.onerror = () => reject(new Error('IDB_OPEN_FAILED'));
    request.onsuccess = () => { _forensicDb = request.result; resolve(_forensicDb); };
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(FORENSIC_STORE)) {
        db.createObjectStore(FORENSIC_STORE, { keyPath: 'replayId' });
      }
    };
  });
}

function tx(mode) {
  return openForensicDB().then(db => {
    const transaction = db.transaction(FORENSIC_STORE, mode);
    return { store: transaction.objectStore(FORENSIC_STORE), transaction };
  });
}

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function awaitTx(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('IDB_TRANSACTION_ABORTED'));
  });
}

/**
 * Save a forensic session to IndexedDB (or localStorage fallback).
 * @param {object} session - Forensic session with replayId
 * @returns {Promise<string>} The replayId
 */
export async function saveForensicSession(session) {
  if (!session || !session.replayId) {
    throw new Error('FORENSIC_INVALID_SESSION');
  }

  if (!isIndexedDBAvailable()) {
    // localStorage fallback for static-first / Neocities
    try {
      localStorage.setItem(LS_PREFIX + session.replayId, JSON.stringify(session));
      return session.replayId;
    } catch {
      throw new Error('FORENSIC_PERSIST_FAILED');
    }
  }

  await ensureForensicStore();
  const { store, transaction } = await tx('readwrite');
  await promisifyRequest(store.put(session));
  await awaitTx(transaction);
  return session.replayId;
}

/**
 * Load a forensic session by replayId.
 * @param {string} replayId
 * @returns {Promise<object|null>}
 */
export async function loadForensicSession(replayId) {
  if (!replayId) return null;

  if (!isIndexedDBAvailable()) {
    try {
      const raw = localStorage.getItem(LS_PREFIX + replayId);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  await ensureForensicStore();
  const { store } = await tx('readonly');
  return promisifyRequest(store.get(replayId));
}

/**
 * Delete a forensic session.
 * @param {string} replayId
 * @returns {Promise<void>}
 */
export async function deleteForensicSession(replayId) {
  if (!replayId) return;

  if (!isIndexedDBAvailable()) {
    try { localStorage.removeItem(LS_PREFIX + replayId); } catch { /* ignore */ }
    return;
  }

  await ensureForensicStore();
  const { store, transaction } = await tx('readwrite');
  await promisifyRequest(store.delete(replayId));
  await awaitTx(transaction);
}

/**
 * List all forensic session replayIds.
 * @returns {Promise<string[]>}
 */
export async function listForensicSessionIds() {
  if (!isIndexedDBAvailable()) {
    try {
      const ids = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LS_PREFIX)) {
          ids.push(key.slice(LS_PREFIX.length));
        }
      }
      return ids;
    } catch {
      return [];
    }
  }

  await ensureForensicStore();
  const { store } = await tx('readonly');
  const allKeys = await promisifyRequest(store.getAllKeys());
  return allKeys;
}
