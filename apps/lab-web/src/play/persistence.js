// ═══════════════════════════════════════════════════════════════
// persistence.js — IndexedDB save/resume for player sessions
// Uses localStorage only for small preferences.
// ═══════════════════════════════════════════════════════════════

const DB_NAME = 'intrilex-player';
const DB_VERSION = 3;
const STORES = Object.freeze({
  SAVES: 'saves',
  REPLAYS: 'replays',
  PREFERENCES: 'preferences',
  QUARANTINE: 'quarantine',
  PLAYER_STATS: 'player-stats',
  TOURNAMENTS: 'tournaments',
});

let _db = null;
let _dbAvailable = null;

/**
 * Check if IndexedDB is available in the current environment.
 */
export function isIndexedDBAvailable() {
  if (_dbAvailable !== null) return _dbAvailable;
  try {
    _dbAvailable = typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    _dbAvailable = false;
  }
  return _dbAvailable;
}

/**
 * Open the player database. Creates stores if needed.
 */
export async function openDB() {
  if (_db) return _db;
  if (!isIndexedDBAvailable()) throw new Error('IDB_UNAVAILABLE');

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(new Error('IDB_OPEN_FAILED'));
    request.onsuccess = () => { _db = request.result; resolve(_db); };
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORES.SAVES)) {
        db.createObjectStore(STORES.SAVES, { keyPath: 'saveId' });
      }
      if (!db.objectStoreNames.contains(STORES.REPLAYS)) {
        db.createObjectStore(STORES.REPLAYS, { keyPath: 'replayId' });
      }
      if (!db.objectStoreNames.contains(STORES.PREFERENCES)) {
        db.createObjectStore(STORES.PREFERENCES, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.QUARANTINE)) {
        db.createObjectStore(STORES.QUARANTINE, { keyPath: 'quarantineId' });
      }
      if (!db.objectStoreNames.contains(STORES.PLAYER_STATS)) {
        db.createObjectStore(STORES.PLAYER_STATS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.TOURNAMENTS)) {
        db.createObjectStore(STORES.TOURNAMENTS, { keyPath: 'tournamentId' });
      }
    };
  });
}

/**
 * Store a promise wrapper for IDB transactions.
 */
function tx(storeName, mode) {
  return openDB().then(db => {
    const transaction = db.transaction(storeName, mode);
    return { store: transaction.objectStore(storeName), transaction };
  });
}

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Await full transaction completion (not just request success).
 * A request can succeed before the transaction later aborts.
 */
function awaitTx(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('IDB_TRANSACTION_ABORTED'));
  });
}

// ── Saves ──

/**
 * Save a session envelope atomically.
 * Replaces any existing save with the same saveId.
 */
export async function putSave(envelope) {
  if (!isIndexedDBAvailable()) throw new Error('IDB_UNAVAILABLE');
  const { store, transaction } = await tx(STORES.SAVES, 'readwrite');
  await promisifyRequest(store.put(envelope));
  await awaitTx(transaction);
  return envelope.saveId;
}

/**
 * Get a save by saveId.
 */
export async function getSave(saveId) {
  if (!isIndexedDBAvailable()) return null;
  const { store } = await tx(STORES.SAVES, 'readonly');
  return promisifyRequest(store.get(saveId));
}

/**
 * Get the rolling autosave for a session.
 */
export async function getAutosave(sessionId) {
  if (!isIndexedDBAvailable()) return null;
  const { store } = await tx(STORES.SAVES, 'readonly');
  const all = await promisifyRequest(store.getAll());
  return all.find(s => s.sessionId === sessionId && s.saveId.startsWith('AUTOSAVE-'));
}

/**
 * List all saves (for the save list UI).
 */
export async function listSaves() {
  if (!isIndexedDBAvailable()) return [];
  const { store } = await tx(STORES.SAVES, 'readonly');
  const all = await promisifyRequest(store.getAll());
  return all.sort((a, b) => (b.updatedAt ?? b.saveId ?? '').localeCompare(a.updatedAt ?? a.saveId ?? ''));
}

/**
 * Delete a save. Requires confirmation from the caller.
 */
export async function deleteSave(saveId) {
  if (!isIndexedDBAvailable()) return;
  const { store, transaction } = await tx(STORES.SAVES, 'readwrite');
  await promisifyRequest(store.delete(saveId));
  await awaitTx(transaction);
}

/**
 * Move a corrupt/incompatible save to quarantine.
 */
export async function quarantineSave(saveId, reason, rawData) {
  if (!isIndexedDBAvailable()) return;
  const { store, transaction } = await tx(STORES.QUARANTINE, 'readwrite');
  const quarantineId = `Q-${saveId}-${Date.now()}`;
  await promisifyRequest(store.put({ quarantineId, originalSaveId: saveId, reason, rawData, quarantinedAt: new Date().toISOString() }));
  await awaitTx(transaction);
  // Delete from saves store
  const { store: saveStore, transaction: saveTx } = await tx(STORES.SAVES, 'readwrite');
  await promisifyRequest(saveStore.delete(saveId));
  await awaitTx(saveTx);
}

// ── Replays ──

/**
 * Store a completed match replay.
 */
export async function putReplay(replayRecord) {
  if (!isIndexedDBAvailable()) throw new Error('IDB_UNAVAILABLE');
  const { store, transaction } = await tx(STORES.REPLAYS, 'readwrite');
  await promisifyRequest(store.put(replayRecord));
  await awaitTx(transaction);
  return replayRecord.replayId;
}

/**
 * Get a replay by replayId.
 */
export async function getReplay(replayId) {
  if (!isIndexedDBAvailable()) return null;
  const { store } = await tx(STORES.REPLAYS, 'readonly');
  return promisifyRequest(store.get(replayId));
}

/**
 * List all replays (for the replay library).
 */
export async function listReplays() {
  if (!isIndexedDBAvailable()) return [];
  const { store } = await tx(STORES.REPLAYS, 'readonly');
  const all = await promisifyRequest(store.getAll());
  return all.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
}

/**
 * Delete a replay.
 */
export async function deleteReplay(replayId) {
  if (!isIndexedDBAvailable()) return;
  const { store, transaction } = await tx(STORES.REPLAYS, 'readwrite');
  await promisifyRequest(store.delete(replayId));
  await awaitTx(transaction);
}

// ── Preferences ──

/**
 * Get a preference value.
 */
export async function getPreference(key, defaultValue = null) {
  if (!isIndexedDBAvailable()) {
    // Fallback to localStorage for small preferences
    try { const v = localStorage.getItem(`intrilex-pref-${key}`); return v ? JSON.parse(v) : defaultValue; }
    catch { return defaultValue; }
  }
  const { store } = await tx(STORES.PREFERENCES, 'readonly');
  const result = await promisifyRequest(store.get(key));
  return result?.value ?? defaultValue;
}

/**
 * Set a preference value.
 */
export async function setPreference(key, value) {
  if (!isIndexedDBAvailable()) {
    try { localStorage.setItem(`intrilex-pref-${key}`, JSON.stringify(value)); } catch { /* ignore */ }
    return;
  }
  const { store, transaction } = await tx(STORES.PREFERENCES, 'readwrite');
  await promisifyRequest(store.put({ key, value }));
  await awaitTx(transaction);
}

// ── Player Stats ──

const PLAYER_STATS_KEY = 'aggregate';

/**
 * Get the aggregate player stats.
 * Tracks: totalMatches, wins, losses, draws, supersDeclared, totalDecisions, profileBreakdown, recentResults
 * @returns {Promise<object>} The player stats object
 */
export async function getPlayerStats() {
  if (!isIndexedDBAvailable()) {
    try {
      const v = localStorage.getItem('intrilex-player-stats');
      return v ? JSON.parse(v) : defaultPlayerStats();
    } catch { return defaultPlayerStats(); }
  }
  const { store } = await tx(STORES.PLAYER_STATS, 'readonly');
  const result = await promisifyRequest(store.get(PLAYER_STATS_KEY));
  return result?.value ?? defaultPlayerStats();
}

/**
 * Update player stats after a completed match.
 * @param {object} matchResult - { winner, humanPlayerId, profileId, aiPolicyId, aiDifficulty, supersDeclared, totalDecisions, securedPoints }
 */
export async function updatePlayerStats(matchResult) {
  const stats = await getPlayerStats();
  stats.totalMatches = (stats.totalMatches ?? 0) + 1;
  stats.totalDecisions = (stats.totalDecisions ?? 0) + (matchResult.totalDecisions ?? 0);
  stats.supersDeclared = (stats.supersDeclared ?? 0) + (matchResult.supersDeclared ?? 0);

  const isHumanWinner = matchResult.winner === matchResult.humanPlayerId;
  if (matchResult.winner === null || matchResult.winner === undefined) {
    stats.draws = (stats.draws ?? 0) + 1;
  } else if (isHumanWinner) {
    stats.wins = (stats.wins ?? 0) + 1;
  } else {
    stats.losses = (stats.losses ?? 0) + 1;
  }

  // Profile breakdown
  const profileId = matchResult.profileId ?? 'unknown';
  if (!stats.profileBreakdown) stats.profileBreakdown = {};
  if (!stats.profileBreakdown[profileId]) {
    stats.profileBreakdown[profileId] = { total: 0, wins: 0, losses: 0, draws: 0 };
  }
  const pb = stats.profileBreakdown[profileId];
  pb.total = (pb.total ?? 0) + 1;
  if (matchResult.winner === null || matchResult.winner === undefined) pb.draws = (pb.draws ?? 0) + 1;
  else if (isHumanWinner) pb.wins = (pb.wins ?? 0) + 1;
  else pb.losses = (pb.losses ?? 0) + 1;

  // AI difficulty breakdown
  const difficulty = matchResult.aiDifficulty ?? 'normal';
  if (!stats.difficultyBreakdown) stats.difficultyBreakdown = {};
  if (!stats.difficultyBreakdown[difficulty]) {
    stats.difficultyBreakdown[difficulty] = { total: 0, wins: 0, losses: 0, draws: 0 };
  }
  const db = stats.difficultyBreakdown[difficulty];
  db.total = (db.total ?? 0) + 1;
  if (matchResult.winner === null || matchResult.winner === undefined) db.draws = (db.draws ?? 0) + 1;
  else if (isHumanWinner) db.wins = (db.wins ?? 0) + 1;
  else db.losses = (db.losses ?? 0) + 1;

  // Recent results (last 5)
  if (!stats.recentResults) stats.recentResults = [];
  stats.recentResults.unshift({
    winner: matchResult.winner ?? null,
    isHumanWinner,
    profileId,
    aiPolicyId: matchResult.aiPolicyId ?? '',
    aiDifficulty: difficulty,
    securedPoints: matchResult.securedPoints ?? 0,
    completedAt: new Date().toISOString(),
  });
  stats.recentResults = stats.recentResults.slice(0, 5);

  if (!isIndexedDBAvailable()) {
    try { localStorage.setItem('intrilex-player-stats', JSON.stringify(stats)); } catch { /* ignore */ }
    return stats;
  }
  const { store, transaction } = await tx(STORES.PLAYER_STATS, 'readwrite');
  await promisifyRequest(store.put({ key: PLAYER_STATS_KEY, value: stats }));
  await awaitTx(transaction);
  return stats;
}

function defaultPlayerStats() {
  return {
    totalMatches: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    supersDeclared: 0,
    totalDecisions: 0,
    profileBreakdown: {},
    difficultyBreakdown: {},
    recentResults: [],
  };
}

// ── Tournaments ──

/**
 * Save a tournament state to IndexedDB.
 */
export async function saveTournament(tournament) {
  if (!isIndexedDBAvailable()) throw new Error('IDB_UNAVAILABLE');
  if (!tournament.tournamentId) throw new Error('TOURNAMENT_NO_ID');
  const { store, transaction } = await tx(STORES.TOURNAMENTS, 'readwrite');
  await promisifyRequest(store.put(tournament));
  await awaitTx(transaction);
  return tournament.tournamentId;
}

/**
 * Load a tournament by tournamentId.
 */
export async function loadTournament(tournamentId) {
  if (!isIndexedDBAvailable()) return null;
  const { store } = await tx(STORES.TOURNAMENTS, 'readonly');
  return promisifyRequest(store.get(tournamentId));
}

/**
 * List all saved tournaments (summary fields only for display).
 */
export async function listTournaments() {
  if (!isIndexedDBAvailable()) return [];
  const { store } = await tx(STORES.TOURNAMENTS, 'readonly');
  const all = await promisifyRequest(store.getAll());
  return all
    .map(t => ({
      tournamentId: t.tournamentId,
      policyCount: t.policyCount,
      bestOf: t.bestOf,
      champion: t.champion,
      status: t.status,
      createdAt: t.createdAt,
    }))
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

/**
 * Delete a saved tournament.
 */
export async function deleteTournament(tournamentId) {
  if (!isIndexedDBAvailable()) return;
  const { store, transaction } = await tx(STORES.TOURNAMENTS, 'readwrite');
  await promisifyRequest(store.delete(tournamentId));
  await awaitTx(transaction);
}

// ── Export/Import ──

/**
 * Export a save as a JSON string for download.
 */
export async function exportSave(saveId) {
  const save = await getSave(saveId);
  if (!save) throw new Error('SAVE_NOT_FOUND');
  return JSON.stringify(save, null, 2);
}

/**
 * Import a save from a JSON string.
 * Validates schema and hash before storing.
 */
export async function importSave(jsonString) {
  if (jsonString.length > 10 * 1024 * 1024) throw new Error('FILE_TOO_LARGE');
  let data;
  try { data = JSON.parse(jsonString); } catch { throw new Error('INVALID_JSON'); }
  if (data.format !== 'intrilex-player-save') throw new Error('INVALID_SAVE_FORMAT');

  // v1 legacy saves require explicit migration to v2 authority model
  if (data.version === 1) {
    await quarantineSave(data.saveId, 'LEGACY_UNBOUND_AUTHORITY', data);
    throw new Error('LEGACY_UNBOUND_AUTHORITY');
  }

  // v2+ saves: route through canonical validator
  const { validateSaveEnvelope } = await import('./save-integrity.js');
  const validation = validateSaveEnvelope(data);
  if (!validation.valid) {
    await quarantineSave(data.saveId, validation.reasonCode ?? 'INVALID_SAVE_ENVELOPE', data);
    throw new Error(validation.reasonCode ?? 'INVALID_SAVE_ENVELOPE');
  }

  await putSave(data);
  return data.saveId;
}

/**
 * Export a replay as a JSON string.
 * @param {string} kind - 'private' or 'public'
 */
export async function exportReplay(replayId, kind = 'private') {
  const replay = await getReplay(replayId);
  if (!replay) throw new Error('REPLAY_NOT_FOUND');
  if (kind === 'public') {
    return JSON.stringify(replay.publicView ?? replay, null, 2);
  }
  return JSON.stringify(replay.privateView ?? replay.certifiedReplay, null, 2);
}
