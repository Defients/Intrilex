// ═══════════════════════════════════════════════════════════════
// match-store.mjs — Match storage abstraction
//
// Two implementations:
//   - InMemoryMatchStore:  Fast, volatile, for testing/dev
//   - SqliteMatchStore:    Durable, survives server restart, for production
//
// Both share the same interface:
//   save(match), get(matchId), delete(matchId),
//   findByInviteCode(code), registerInvite(code, matchId),
//   listMatchIds(), count, cleanExpired(maxAgeMs), close()
//
// SqliteMatchStore uses node:sqlite (Node.js 22+ built-in).
// Match state is serialized via AuthoritativeMatchSession.toSnapshot()
// and reconstructed via AuthoritativeMatchSession.fromSnapshot().
// The engine state is deterministically replayed from seed + command log.
// ═══════════════════════════════════════════════════════════════

import { createRequire } from 'node:module';
import { AuthoritativeMatchSession } from './authoritative-match-session.mjs';

const require = createRequire(import.meta.url);

/**
 * @typedef {{ matchId: string, status: string, createdAt: number, updatedAt: number, participants: Array<string> }} MatchSummary
 */
/**
 * @typedef {object} CleanExpiredOpts
 * @property {number} [now]
 * @property {number} [lobbyTtl]
 * @property {number} [matchTtl]
 * @property {number} [historyTtl]
 */

/**
 * In-memory match store.
 *
 * Limitations:
 * - Server process restart terminates all in-memory matches.
 * - No durability guarantee.
 */
export class InMemoryMatchStore {
  constructor() {
    this._matches = new Map();       // matchId → AuthoritativeMatchSession
    this._inviteIndex = new Map();   // inviteCode → matchId
  }

  /**
   * Store a match.
   * @param {AuthoritativeMatchSession} match
   */
  save(match) {
    this._matches.set(match.matchId, match);
  }

  /**
   * Retrieve a match by ID.
   * @param {string} matchId
   * @returns {AuthoritativeMatchSession|null}
   */
  get(matchId) {
    return this._matches.get(matchId) ?? null;
  }

  /**
   * Remove a match.
   * @param {string} matchId
   */
  delete(matchId) {
    const match = this._matches.get(matchId);
    if (match) {
      // Remove from invite index if present
      for (const [code, mid] of this._inviteIndex) {
        if (mid === matchId) this._inviteIndex.delete(code);
      }
      match.close();
      this._matches.delete(matchId);
    }
  }

  /**
   * Look up a match by invite code.
   * @param {string} inviteCode
   * @returns {AuthoritativeMatchSession|null}
   */
  findByInviteCode(inviteCode) {
    const matchId = this._inviteIndex.get(inviteCode);
    if (!matchId) return null;
    return this._matches.get(matchId) ?? null;
  }

  /**
   * Register an invite code for a match.
   * @param {string} inviteCode
   * @param {string} matchId
   */
  registerInvite(inviteCode, matchId) {
    this._inviteIndex.set(inviteCode, matchId);
  }

  /**
   * Get all active match IDs.
   */
  listMatchIds() {
    return [...this._matches.keys()];
  }

  /**
   * List matches with optional filtering. Returns summary metadata (no snapshots).
   * @param {object} opts - { status, limit }
   * @param {string|null} [opts.status]
   * @param {number} [opts.limit]
   * @returns {MatchSummary[]}
   */
  listMatches({ status = null, limit = 20 } = {}) {
    const results = [];
    for (const match of this._matches.values()) {
      if (status && match.status !== status) continue;
      results.push({
        matchId: match.matchId,
        status: match.status,
        createdAt: match.createdAt,
        updatedAt: match.updatedAt,
        participants: [...match.participants.keys()],
      });
      if (results.length >= limit) break;
    }
    return results.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Get the number of active matches.
   * @returns {number}
   */
  get count() {
    return this._matches.size;
  }

  /**
   * Clean up expired matches using separate TTL policies by status.
   * - Unstarted lobby: expires by createdAt + lobbyTtl
   * - Active (RUNNING): expires by updatedAt + matchTtl (never by createdAt alone)
   * - Terminal history: expires by updatedAt + historyTtl
   * @param {CleanExpiredOpts|number} [opts]
   * @returns {number} Number of matches cleaned up
   */
  cleanExpired(opts = {}) {
    // Backward compatibility: if called with a number, treat as maxAgeMs for all matches
    if (typeof opts === 'number') {
      const maxAgeMs = opts;
      opts = { matchTtl: maxAgeMs, lobbyTtl: maxAgeMs, historyTtl: maxAgeMs };
    }
    const now = opts.now ?? Date.now();
    const lobbyTtl = opts.lobbyTtl ?? 300000;     // 5 min for unstarted lobbies
    const matchTtl = opts.matchTtl ?? 1800000;    // 30 min for active matches (by updatedAt)
    const historyTtl = opts.historyTtl ?? 3600000; // 1 hr for terminal history
    let cleaned = 0;
    for (const [matchId, match] of this._matches) {
      const age = now - match.updatedAt;
      if (match.status === 'RUNNING') {
        // Active matches: expire by updatedAt, not createdAt
        if (age > matchTtl) {
          this.delete(matchId);
          cleaned++;
        }
      } else if (match.status === 'TERMINAL') {
        // Terminal history: separate TTL
        if (age > historyTtl) {
          this.delete(matchId);
          cleaned++;
        }
      } else {
        // Unstarted lobby (WAITING_FOR_OPPONENT, READY_CHECK): expire by createdAt
        if (now - match.createdAt > lobbyTtl) {
          this.delete(matchId);
          cleaned++;
        }
      }
    }
    return cleaned;
  }

  /**
   * Close the store (no-op for in-memory).
   */
  close() {
    for (const match of this._matches.values()) {
      match.close();
    }
    this._matches.clear();
    this._inviteIndex.clear();
  }
}

/**
 * SQLite-backed durable match store.
 *
 * Survives server process restarts. Match state is serialized to JSON
 * and stored in a SQLite database. On retrieval, the engine state is
 * deterministically reconstructed from seed + command log.
 *
 * Requires Node.js 22+ (uses node:sqlite built-in).
 *
 * @param {object} opts
 * @param {string} opts.path - Database file path (default: ':memory:' for temp)
 */
export class SqliteMatchStore {
  constructor({ path: dbPath = ':memory:' } = {}) {
    // Lazy import — node:sqlite is experimental in Node 22
    const { DatabaseSync } = require('node:sqlite');
    this._db = new DatabaseSync(dbPath);
    this._db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS matches (
        match_id TEXT PRIMARY KEY,
        snapshot TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        status TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS invite_codes (
        invite_code TEXT PRIMARY KEY,
        match_id TEXT NOT NULL,
        FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
      CREATE INDEX IF NOT EXISTS idx_matches_updated ON matches(updated_at);
    `);
    this._cache = new Map(); // matchId → AuthoritativeMatchSession (live objects)
  }

  /**
   * Store a match. Serializes the match to JSON and upserts.
   * @param {AuthoritativeMatchSession} match
   */
  save(match) {
    const snapshot = match.toSnapshot();
    const json = JSON.stringify(snapshot);
    this._db.prepare(`
      INSERT INTO matches (match_id, snapshot, created_at, updated_at, status)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(match_id) DO UPDATE SET
        snapshot = excluded.snapshot,
        updated_at = excluded.updated_at,
        status = excluded.status
    `).run(match.matchId, json, match.createdAt, match.updatedAt, match.status);
    this._cache.set(match.matchId, match);
  }

  /**
   * Retrieve a match by ID. Reconstructs from snapshot if not in cache.
   * @param {string} matchId
   * @returns {AuthoritativeMatchSession|null}
   */
  get(matchId) {
    // Check live cache first
    if (this._cache.has(matchId)) {
      return this._cache.get(matchId);
    }
    // Load from database
    const row = this._db.prepare('SELECT snapshot FROM matches WHERE match_id = ?').get(matchId);
    if (!row) return null;
    const snapshot = JSON.parse(/** @type {string} */ (row.snapshot));
    const match = AuthoritativeMatchSession.fromSnapshot(snapshot);
    this._cache.set(matchId, match);
    return match;
  }

  /**
   * Remove a match.
   * @param {string} matchId
   */
  delete(matchId) {
    const match = this._cache.get(matchId);
    if (match) match.close();
    this._cache.delete(matchId);
    this._db.prepare('DELETE FROM invite_codes WHERE match_id = ?').run(matchId);
    this._db.prepare('DELETE FROM matches WHERE match_id = ?').run(matchId);
  }

  /**
   * Look up a match by invite code.
   * @param {string} inviteCode
   * @returns {AuthoritativeMatchSession|null}
   */
  findByInviteCode(inviteCode) {
    const row = this._db.prepare('SELECT match_id FROM invite_codes WHERE invite_code = ?').get(inviteCode);
    if (!row) return null;
    return this.get(/** @type {string} */ (row.match_id));
  }

  /**
   * Register an invite code for a match.
   * @param {string} inviteCode
   * @param {string} matchId
   */
  registerInvite(inviteCode, matchId) {
    this._db.prepare(`
      INSERT INTO invite_codes (invite_code, match_id)
      VALUES (?, ?)
      ON CONFLICT(invite_code) DO UPDATE SET match_id = excluded.match_id
    `).run(inviteCode, matchId);
  }

  /**
   * Get all active match IDs.
   */
  listMatchIds() {
    const rows = this._db.prepare('SELECT match_id FROM matches').all();
    return rows.map(r => r.match_id);
  }

  /**
   * List matches with optional filtering. Returns summary metadata (no snapshots).
   * @param {object} opts - { status, limit }
   * @param {string|null} [opts.status]
   * @param {number} [opts.limit]
   * @returns {MatchSummary[]}
   */
  listMatches({ status = null, limit = 20 } = {}) {
    let sql = 'SELECT match_id, snapshot, created_at, updated_at, status FROM matches';
    const params = [];
    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    sql += ' ORDER BY updated_at DESC LIMIT ?';
    params.push(limit);
    const rows = this._db.prepare(sql).all(...params);
    return rows.map(r => {
      /** @type {string[]} */
      let participants = [];
      try {
        const snapshot = JSON.parse(/** @type {string} */ (r.snapshot));
        // v0.24.2 fix: toSnapshot() serializes participants as an ARRAY of
        // { participantId, playerId, token, ... } objects, NOT a Map/object.
        // Object.keys() on an array returns ["0","1"] (array indices) — wrong.
        // Extract the actual participantId from each array element instead.
        if (Array.isArray(snapshot.participants)) {
          participants = snapshot.participants
            .map(/** @param {{ participantId?: string }} p */ p => p?.participantId)
            .filter(/** @param {string} id */ id => typeof id === 'string');
        } else if (snapshot.participants && typeof snapshot.participants === 'object') {
          // Defensive: handle legacy object/Map-serialized participants
          participants = Object.keys(snapshot.participants);
        }
      } catch { /* ignore parse errors */ }
      return {
        matchId: /** @type {string} */ (r.match_id),
        status: /** @type {string} */ (r.status),
        createdAt: /** @type {number} */ (r.created_at),
        updatedAt: /** @type {number} */ (r.updated_at),
        participants,
      };
    });
  }

  /**
   * Get the number of active matches.
   * @returns {number}
   */
  get count() {
    const row = this._db.prepare('SELECT COUNT(*) as cnt FROM matches').get();
    return /** @type {number} */ (row?.cnt ?? 0);
  }

  /**
   * Clean up expired matches using separate TTL policies by status.
   * - Unstarted lobby: expires by createdAt + lobbyTtl
   * - Active (RUNNING): expires by updatedAt + matchTtl (never by createdAt alone)
   * - Terminal history: expires by updatedAt + historyTtl
   * @param {CleanExpiredOpts|number} [opts]
   * @returns {number} Number of matches cleaned up
   */
  cleanExpired(opts = {}) {
    // Backward compatibility: if called with a number, treat as maxAgeMs for all matches
    if (typeof opts === 'number') {
      const maxAgeMs = opts;
      opts = { matchTtl: maxAgeMs, lobbyTtl: maxAgeMs, historyTtl: maxAgeMs };
    }
    const now = opts.now ?? Date.now();
    const lobbyTtl = opts.lobbyTtl ?? 300000;     // 5 min for unstarted lobbies
    const matchTtl = opts.matchTtl ?? 1800000;    // 30 min for active matches (by updatedAt)
    const historyTtl = opts.historyTtl ?? 3600000; // 1 hr for terminal history

    const lobbyCutoff = now - lobbyTtl;
    const matchCutoff = now - matchTtl;
    const historyCutoff = now - historyTtl;

    // Select matches to delete based on status-specific TTL policies
    const rows = this._db.prepare(`
      SELECT match_id FROM matches
      WHERE (status NOT IN ('RUNNING', 'TERMINAL') AND created_at < ?)
         OR (status = 'RUNNING' AND updated_at < ?)
         OR (status = 'TERMINAL' AND updated_at < ?)
    `).all(lobbyCutoff, matchCutoff, historyCutoff);

    for (const row of rows) {
      this.delete(/** @type {string} */ (row.match_id));
    }
    return rows.length;
  }

  /**
   * Close the store and release database resources.
   * Does NOT abort matches — persisted matches survive in the database.
   */
  close() {
    this._cache.clear();
    this._db.close();
  }
}
