// ═══════════════════════════════════════════════════════════════
// persistence.js — IndexedDB save/resume for player sessions
// Uses localStorage only for small preferences.
// ═══════════════════════════════════════════════════════════════

const DB_NAME = 'intrilex-player';
const DB_VERSION = 5;
const STORES = Object.freeze({
  SAVES: 'saves',
  REPLAYS: 'replays',
  PREFERENCES: 'preferences',
  QUARANTINE: 'quarantine',
  PLAYER_STATS: 'player-stats',
  TOURNAMENTS: 'tournaments',
  ACHIEVEMENTS: 'achievements',
  MATCH_STATS: 'match-stats',
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
      if (!db.objectStoreNames.contains(STORES.ACHIEVEMENTS)) {
        db.createObjectStore(STORES.ACHIEVEMENTS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.MATCH_STATS)) {
        db.createObjectStore(STORES.MATCH_STATS, { keyPath: 'matchId' });
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

  // v1 legacy saves: attempt migration to v2 authority model before rejecting
  if (data.version === 1) {
    const { canMigrateSave, migrateSave } = await import('./save-integrity.js?v=3dca2dc8fde5');
    const migration = canMigrateSave(data);
    if (migration.canMigrate) {
      const engineModule = await import('../engine/browser-entry.js?v=3dca2dc8fde5');
      const autonomyModule = await import('../autonomy-runtime.js?v=3dca2dc8fde5');
      const result = await migrateSave(data, engineModule, autonomyModule);
      if (result.ok) {
        await putSave(result.save);
        return result.save.saveId;
      }
    }
    await quarantineSave(data.saveId, 'LEGACY_UNBOUND_AUTHORITY', data);
    throw new Error('LEGACY_UNBOUND_AUTHORITY');
  }

  // v2+ saves: route through canonical validator
  const { validateSaveEnvelope, canMigrateSave: canMigrate, migrateSave: migrate } = await import('./save-integrity.js?v=3dca2dc8fde5');
  const validation = validateSaveEnvelope(data);
  if (!validation.valid) {
    // Attempt migration for version mismatches before quarantining
    const migration = canMigrate(data);
    if (migration.canMigrate) {
      const engineModule = await import('../engine/browser-entry.js?v=3dca2dc8fde5');
      const autonomyModule = await import('../autonomy-runtime.js?v=3dca2dc8fde5');
      const result = await migrate(data, engineModule, autonomyModule);
      if (result.ok) {
        await putSave(result.save);
        return result.save.saveId;
      }
    }
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

// ── Achievements ──

const ACHIEVEMENT_KEY = 'profile';

/**
 * Resolve the storage key for achievement state.
 * IRX-H30: When an accountId is provided, use an account-scoped key so
 * achievements are separated per account. When no accountId is provided,
 * fall back to the legacy device-global key for backward compatibility.
 * @param {string} [accountId] - Optional account ID for account-scoped storage
 * @returns {string} The storage key
 */
function achievementKey(accountId) {
  return accountId ? `achievements:${accountId}` : ACHIEVEMENT_KEY;
}

/**
 * Get the achievement profile state from IndexedDB.
 * Falls back to localStorage if IndexedDB is unavailable.
 * IRX-H30: Supports account-scoped storage via optional accountId parameter.
 * @param {string} [accountId] - Optional account ID for account-scoped storage
 * @returns {Promise<object|null>}
 */
export async function getAchievementState(accountId) {
  const key = achievementKey(accountId);
  if (!isIndexedDBAvailable()) {
    try {
      const raw = localStorage.getItem(accountId ? `intrilex-achievements-${accountId}` : 'intrilex-achievements-v1');
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.error('[achievements] Failed to load state from localStorage:', err);
      return null;
    }
  }
  try {
    const { store } = await tx(STORES.ACHIEVEMENTS, 'readonly');
    const result = await promisifyRequest(store.get(key));
    return result?.value ?? null;
  } catch (err) {
    console.error('[achievements] Failed to load state from IndexedDB:', err);
    return null;
  }
}

/**
 * Save the achievement profile state to IndexedDB.
 * Falls back to localStorage if IndexedDB is unavailable.
 * IRX-H30: Supports account-scoped storage via optional accountId parameter.
 * @param {object} state - The achievement profile state
 * @param {string} [accountId] - Optional account ID for account-scoped storage
 * @returns {Promise<boolean>}
 */
export async function saveAchievementState(state, accountId) {
  const key = achievementKey(accountId);
  if (!isIndexedDBAvailable()) {
    try {
      localStorage.setItem(accountId ? `intrilex-achievements-${accountId}` : 'intrilex-achievements-v1', JSON.stringify(state));
      return true;
    } catch (err) {
      console.error('[achievements] Failed to save state to localStorage:', err);
      return false;
    }
  }
  try {
    const { store, transaction } = await tx(STORES.ACHIEVEMENTS, 'readwrite');
    await promisifyRequest(store.put({ key, value: state }));
    await awaitTx(transaction);
    return true;
  } catch (err) {
    console.error('[achievements] Failed to save state to IndexedDB:', err);
    return false;
  }
}

/**
 * Reset the achievement profile state (developer testing).
 * Only resets achievement state — does not touch saves, replays, profile, or stats.
 * IRX-H30: Supports account-scoped storage via optional accountId parameter.
 * @param {string} [accountId] - Optional account ID for account-scoped storage
 * @returns {Promise<boolean>}
 */
export async function resetAchievementState(accountId) {
  const key = achievementKey(accountId);
  if (!isIndexedDBAvailable()) {
    try {
      localStorage.removeItem(accountId ? `intrilex-achievements-${accountId}` : 'intrilex-achievements-v1');
      return true;
    } catch (err) {
      console.error('[achievements] Failed to reset state in localStorage:', err);
      return false;
    }
  }
  try {
    const { store, transaction } = await tx(STORES.ACHIEVEMENTS, 'readwrite');
    await promisifyRequest(store.delete(key));
    await awaitTx(transaction);
    return true;
  } catch (err) {
    console.error('[achievements] Failed to reset state in IndexedDB:', err);
    return false;
  }
}

/**
 * Mark local achievements as migrated to a permanent account.
 * Adds a `migratedAt` timestamp to the achievement state so the UI can
 * show "migrated" status. Does NOT delete the local data — it stays as
 * a backup in case the cloud sync needs to be re-run.
 * @param {string} migrationId - The migration ID for provenance
 * @returns {Promise<boolean>}
 */
export async function markAchievementsMigrated(migrationId, accountId) {
  const key = achievementKey(accountId);
  const lsKey = accountId ? `intrilex-achievements-${accountId}` : 'intrilex-achievements-v1';
  if (!isIndexedDBAvailable()) {
    try {
      const raw = localStorage.getItem(lsKey);
      const state = raw ? JSON.parse(raw) : {};
      state.migratedAt = new Date().toISOString();
      state.migrationId = migrationId ?? null;
      localStorage.setItem(lsKey, JSON.stringify(state));
      return true;
    } catch (err) {
      console.error('[achievements] Failed to mark migrated in localStorage:', err);
      return false;
    }
  }
  try {
    const currentState = await getAchievementState(accountId);
    if (!currentState) return true; // Nothing to mark
    currentState.migratedAt = new Date().toISOString();
    currentState.migrationId = migrationId ?? null;
    const { store, transaction } = await tx(STORES.ACHIEVEMENTS, 'readwrite');
    await promisifyRequest(store.put({ key, value: currentState }));
    await awaitTx(transaction);
    return true;
  } catch (err) {
    console.error('[achievements] Failed to mark migrated in IndexedDB:', err);
    return false;
  }
}

// ── Match Stats (v0.28.0 — Epoch 7) ──
// Per-match statistics for strategic fingerprint enrichment.
// Stored separately from replays (which are full command logs) —
// match stats are lightweight aggregates suitable for quick lookup.

/**
 * Save a match stats record to IndexedDB.
 * @param {object} statsRecord - { matchId, winnerId, humanPlayerId, turns, humanIR, oppIR, drawPileRemaining, goalProgress, terminationReason, wasBehindAtMidpoint, completedAt }
 * @returns {Promise<string>} The matchId
 */
export async function putMatchStats(statsRecord) {
  if (!isIndexedDBAvailable()) throw new Error('IDB_UNAVAILABLE');
  if (!statsRecord?.matchId) throw new Error('MATCH_STATS_NO_ID');
  const { store, transaction } = await tx(STORES.MATCH_STATS, 'readwrite');
  await promisifyRequest(store.put(statsRecord));
  await awaitTx(transaction);
  return statsRecord.matchId;
}

/**
 * Get a match stats record by matchId.
 * @param {string} matchId
 * @returns {Promise<object|null>}
 */
export async function getMatchStats(matchId) {
  if (!isIndexedDBAvailable()) return null;
  const { store } = await tx(STORES.MATCH_STATS, 'readonly');
  return promisifyRequest(store.get(matchId));
}

/**
 * List all match stats records, sorted by completedAt desc.
 * @param {number} [limit=100] - Max records to return
 * @returns {Promise<Array<object>>}
 */
export async function listMatchStats(limit = 100) {
  if (!isIndexedDBAvailable()) return [];
  const { store } = await tx(STORES.MATCH_STATS, 'readonly');
  const all = await promisifyRequest(store.getAll());
  return all
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    .slice(0, limit);
}

/**
 * Delete a match stats record.
 * @param {string} matchId
 */
export async function deleteMatchStats(matchId) {
  if (!isIndexedDBAvailable()) return;
  const { store, transaction } = await tx(STORES.MATCH_STATS, 'readwrite');
  await promisifyRequest(store.delete(matchId));
  await awaitTx(transaction);
}
