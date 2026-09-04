// ═══════════════════════════════════════════════════════════════
// abandonment-handler.mjs — Pure domain logic for ranked match
// disconnect / abandonment handling.
//
// When a participant disconnects from a RUNNING ranked match, the server
// grants a bounded grace period (RECONNECT_GRACE, 60s) for them to
// reconnect. If the grace period elapses without a reconnect and the
// match has progressed past a minimum turn threshold, the disconnected
// player forfeits and the opponent is awarded a WIN.
//
// This module is intentionally pure / side-effect free (the tracker is
// serializable in-memory state). It does NOT touch sockets, timers, or
// the database — the caller (server.mjs) wires it into the existing
// AuthoritativeMatchSession lifecycle, ParticipantStatus notifications,
// RatingService, and MatchResultPersistor idempotency gate.
//
// Exports:
//   - AbandonmentState          (frozen enum)
//   - AbandonmentConfig         (typedef)
//   - DEFAULT_ABANDONMENT_CONFIG
//   - createAbandonmentTracker(config)
//   - computeForfeitResult(matchState, abandonmentTracker)
//   - buildAbandonmentResultRecord(matchId, queueId, seasonId, forfeitResult, participants)
// ═══════════════════════════════════════════════════════════════

/**
 * Lifecycle states for a single player's abandonment tracking.
 *
 * @readonly
 * @enum {string}
 */
export const AbandonmentState = Object.freeze({
  /** Player is connected; no abandonment tracking active. */
  CONNECTED: 'CONNECTED',
  /** Player has disconnected; grace period is counting down. */
  GRACE_PERIOD: 'GRACE_PERIOD',
  /** Grace period has elapsed; forfeit is pending application. */
  FORFEIT_PENDING: 'FORFEIT_PENDING',
  /** Forfeit has been applied — the player loses by abandonment. */
  FORFEITED: 'FORFEITED',
  /** Player reconnected during the grace period; tracking cleared. */
  RESUMED: 'RESUMED',
  /** Match ended normally (not via abandonment); tracking finalized. */
  COMPLETED: 'COMPLETED',
});

/**
 * Configuration for abandonment tracking.
 *
 * @typedef {Object} AbandonmentConfig
 * @property {number} graceMs           - Grace period in milliseconds before a disconnect becomes a forfeit. Default 60000.
 * @property {boolean} forfeitAfterGrace - Whether to forfeit the disconnected player once the grace period elapses. Default true.
 * @property {number} minTurnsBeforeForfeit - Minimum turn number that must have been reached before a forfeit is warranted. Default 4.
 */

/**
 * Default abandonment configuration. Mirrors the server's RECONNECT_GRACE (60s).
 *
 * @type {Readonly<AbandonmentConfig>}
 */
export const DEFAULT_ABANDONMENT_CONFIG = Object.freeze({
  graceMs: 60000,
  forfeitAfterGrace: true,
  minTurnsBeforeForfeit: 4,
});

/**
 * Reason / reason-code constants used in forfeit results.
 * @readonly
 * @enum {string}
 */
export const ABANDONMENT_REASON = Object.freeze({
  REASON: 'ABANDONMENT',
  REASON_CODE: 'RANKED_ABANDONMENT',
});

// ─── internal helpers ───────────────────────────────────────────

/**
 * Validate that a value is a finite, non-negative number (timestamp/ms).
 * @param {unknown} value
 * @param {string} name
 * @returns {number}
 */
function assertTimestamp(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new TypeError(`AbandonmentTracker: ${name} must be a finite non-negative number, got ${String(value)}`);
  }
  return value;
}

/**
 * Validate that a value is a non-empty string.
 * @param {unknown} value
 * @param {string} name
 * @returns {string}
 */
function assertNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`AbandonmentTracker: ${name} must be a non-empty string, got ${String(value)}`);
  }
  return value;
}

/**
 * Validate that a value is a non-negative integer (turn number).
 * @param {unknown} value
 * @param {string} name
 * @returns {number}
 */
function assertTurnNumber(value, name) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new TypeError(`AbandonmentTracker: ${name} must be a non-negative integer, got ${String(value)}`);
  }
  return value;
}

/**
 * Normalize a partial config against defaults, validating each field.
 * @param {Partial<AbandonmentConfig>|undefined} [config]
 * @returns {Readonly<AbandonmentConfig>}
 */
function normalizeConfig(config) {
  if (config === undefined || config === null) {
    return DEFAULT_ABANDONMENT_CONFIG;
  }
  if (typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('AbandonmentConfig must be an object');
  }
  const graceMs = config.graceMs !== undefined ? config.graceMs : DEFAULT_ABANDONMENT_CONFIG.graceMs;
  const forfeitAfterGrace = config.forfeitAfterGrace !== undefined ? config.forfeitAfterGrace : DEFAULT_ABANDONMENT_CONFIG.forfeitAfterGrace;
  const minTurnsBeforeForfeit = config.minTurnsBeforeForfeit !== undefined ? config.minTurnsBeforeForfeit : DEFAULT_ABANDONMENT_CONFIG.minTurnsBeforeForfeit;

  if (typeof graceMs !== 'number' || !Number.isFinite(graceMs) || graceMs < 0) {
    throw new TypeError('AbandonmentConfig.graceMs must be a finite non-negative number');
  }
  if (typeof forfeitAfterGrace !== 'boolean') {
    throw new TypeError('AbandonmentConfig.forfeitAfterGrace must be a boolean');
  }
  if (typeof minTurnsBeforeForfeit !== 'number' || !Number.isInteger(minTurnsBeforeForfeit) || minTurnsBeforeForfeit < 0) {
    throw new TypeError('AbandonmentConfig.minTurnsBeforeForfeit must be a non-negative integer');
  }
  return Object.freeze({ graceMs, forfeitAfterGrace, minTurnsBeforeForfeit });
}

// ─── AbandonmentTracker ─────────────────────────────────────────

/**
 * Creates a new AbandonmentTracker — a serializable in-memory tracker for
 * per-player abandonment state within a single ranked match.
 *
 * The tracker is NOT thread-safe and is intended to be used from the
 * single-threaded Node.js event loop (the match server's authoritative
 * session loop). All mutating methods return `this` for chaining where
 * useful, but the tracker mutates internal state in place.
 *
 * @param {Partial<AbandonmentConfig>} [config] - Override defaults.
 * @returns {AbandonmentTracker}
 */
export function createAbandonmentTracker(config) {
  return new AbandonmentTracker(normalizeConfig(config));
}

/**
 * @typedef {Object} PlayerAbandonmentEntry
 * @property {string} playerId
 * @property {AbandonmentState} state
 * @property {number} disconnectedAt - Timestamp (ms) of the disconnect, or 0 if never disconnected.
 * @property {number} turnAtDisconnect - Turn number at the moment of disconnect, or -1 if never disconnected.
 * @property {number|null} forfeitAt - Timestamp (ms) when the grace period elapses, or null.
 * @property {number} reconnectCount - Number of times the player has reconnected during a grace period.
 */

/**
 * AbandonmentTracker — internal class. Prefer `createAbandonmentTracker`.
 *
 * Tracks per-player abandonment state. Serializable via toJSON/fromJSON so
 * it can be snapshotted alongside the AuthoritativeMatchSession for restart
 * recovery (the durable terminal outbox / session persistence path).
 */
class AbandonmentTracker {
  /**
   * @param {Readonly<AbandonmentConfig>} config
   */
  constructor(config) {
    /** @readonly @type {Readonly<AbandonmentConfig>} */
    this.config = config;
    /** @type {Map<string, PlayerAbandonmentEntry>} */
    this._players = new Map();
    /** @type {string|null} */
    this._forfeitedPlayerId = null;
    /** @type {string|null} */
    this._opponentId = null;
    /** @type {boolean} */
    this._matchEnded = false;
  }

  /**
   * Record a disconnect for a player, starting (or restarting) their grace period.
   *
   * - If the player was already in GRACE_PERIOD, the disconnect timestamp is
   *   refreshed (the grace window restarts from the new timestamp).
   * - If the player was FORFEITED, this is a no-op (a forfeit is terminal).
   * - If the match has ended (COMPLETED), this is a no-op.
   *
   * @param {string} playerId - The disconnecting player's ID.
   * @param {number} turnNumber - Current authoritative turn number.
   * @param {number} timestamp - Current timestamp (ms).
   * @returns {AbandonmentTracker} `this`
   */
  recordDisconnect(playerId, turnNumber, timestamp) {
    assertNonEmptyString(playerId, 'playerId');
    assertTurnNumber(turnNumber, 'turnNumber');
    assertTimestamp(timestamp, 'timestamp');

    if (this._matchEnded) return this;

    const existing = this._players.get(playerId);
    if (existing && existing.state === AbandonmentState.FORFEITED) {
      // A forfeit is terminal — do not restart grace.
      return this;
    }

    /** @type {PlayerAbandonmentEntry} */
    const entry = {
      playerId,
      state: AbandonmentState.GRACE_PERIOD,
      disconnectedAt: timestamp,
      turnAtDisconnect: turnNumber,
      forfeitAt: timestamp + this.config.graceMs,
      reconnectCount: existing?.reconnectCount ?? 0,
    };
    this._players.set(playerId, entry);
    return this;
  }

  /**
   * Record a reconnect for a player, clearing their grace period and
   * marking them RESUMED.
   *
   * - If the player was FORFEITED, the reconnect is ignored (terminal).
   * - If the player had no active grace period, they are simply marked
   *   CONNECTED (idempotent).
   *
   * @param {string} playerId - The reconnecting player's ID.
   * @param {number} timestamp - Current timestamp (ms).
   * @returns {AbandonmentTracker} `this`
   */
  recordReconnect(playerId, timestamp) {
    assertNonEmptyString(playerId, 'playerId');
    assertTimestamp(timestamp, 'timestamp');

    if (this._matchEnded) return this;

    const existing = this._players.get(playerId);
    if (existing && existing.state === AbandonmentState.FORFEITED) {
      // Terminal — cannot resume a forfeited player.
      return this;
    }

    if (existing && existing.state === AbandonmentState.GRACE_PERIOD) {
      existing.state = AbandonmentState.RESUMED;
      existing.reconnectCount += 1;
      existing.forfeitAt = null;
    } else if (existing) {
      existing.state = AbandonmentState.RESUMED;
      existing.forfeitAt = null;
    } else {
      this._players.set(playerId, {
        playerId,
        state: AbandonmentState.RESUMED,
        disconnectedAt: 0,
        turnAtDisconnect: -1,
        forfeitAt: null,
        reconnectCount: 0,
      });
    }
    return this;
  }

  /**
   * Mark the match as ended normally (not via abandonment). All players
   * transition to COMPLETED. Subsequent disconnect/reconnect calls are
   * no-ops.
   *
   * @param {number} timestamp - Current timestamp (ms).
   * @returns {AbandonmentTracker} `this`
   */
  recordMatchEnd(timestamp) {
    assertTimestamp(timestamp, 'timestamp');
    this._matchEnded = true;
    for (const entry of this._players.values()) {
      if (entry.state !== AbandonmentState.FORFEITED) {
        entry.state = AbandonmentState.COMPLETED;
      }
    }
    return this;
  }

  /**
   * Get the current abandonment state for a player.
   *
   * @param {string} playerId
   * @returns {AbandonmentState} The player's state, or `AbandonmentState.CONNECTED` if unknown.
   */
  getState(playerId) {
    assertNonEmptyString(playerId, 'playerId');
    const entry = this._players.get(playerId);
    return entry ? entry.state : AbandonmentState.CONNECTED;
  }

  /**
   * Check whether any player's grace period has elapsed and a forfeit is
   * warranted. If so, transition that player to FORFEITED (terminal) and
   * return the result. Only one forfeit is ever produced per match; once a
   * player is FORFEITED this returns null.
   *
   * A forfeit is warranted when ALL of the following hold:
   *   - `config.forfeitAfterGrace` is true
   *   - the player is in GRACE_PERIOD
   *   - `timestamp >= entry.forfeitAt`
   *   - `entry.turnAtDisconnect >= config.minTurnsBeforeForfeit`
   *
   * @param {number} timestamp - Current timestamp (ms).
   * @returns {{ playerId: string, state: AbandonmentState }|null}
   *   `{ playerId, state: FORFEITED }` if a forfeit was just applied, else `null`.
   */
  checkForfeit(timestamp) {
    assertTimestamp(timestamp, 'timestamp');

    if (this._forfeitedPlayerId) return null;
    if (!this.config.forfeitAfterGrace) return null;
    if (this._matchEnded) return null;

    for (const entry of this._players.values()) {
      if (entry.state !== AbandonmentState.GRACE_PERIOD) continue;
      if (entry.forfeitAt === null) continue;
      if (timestamp < entry.forfeitAt) continue;
      if (entry.turnAtDisconnect < this.config.minTurnsBeforeForfeit) continue;

      entry.state = AbandonmentState.FORFEITED;
      this._forfeitedPlayerId = entry.playerId;
      return { playerId: entry.playerId, state: AbandonmentState.FORFEITED };
    }
    return null;
  }

  /**
   * Set the opponent id for the currently forfeited player. This is used by
   * `computeForfeitResult` and may be called by the server once the
   * opponent is known. If no player is forfeited, this is a no-op.
   *
   * @param {string} opponentId
   * @returns {AbandonmentTracker} `this`
   */
  setOpponentId(opponentId) {
    assertNonEmptyString(opponentId, 'opponentId');
    this._opponentId = opponentId;
    return this;
  }

  /**
   * Returns the abandonment result if a player has been forfeited, else null.
   *
   * The opponent is resolved from `setOpponentId` if set; otherwise the
   * caller must supply it via `computeForfeitResult` (which sets it). If no
   * opponent has been recorded, this returns null.
   *
   * @returns {{ winnerId: string, loserId: string, reason: string, reasonCode: string }|null}
   */
  getAbandonmentResult() {
    if (!this._forfeitedPlayerId) return null;
    if (!this._opponentId) return null;
    return {
      winnerId: this._opponentId,
      loserId: this._forfeitedPlayerId,
      reason: ABANDONMENT_REASON.REASON,
      reasonCode: ABANDONMENT_REASON.REASON_CODE,
    };
  }

  /**
   * Whether any player has been forfeited.
   * @returns {boolean}
   */
  hasForfeit() {
    return this._forfeitedPlayerId !== null;
  }

  /**
   * The player id that was forfeited, or null.
   * @returns {string|null}
   */
  getForfeitedPlayerId() {
    return this._forfeitedPlayerId;
  }

  /**
   * Serialize the tracker to a plain JSON-safe object for persistence.
   *
   * @returns {object}
   */
  toJSON() {
    return {
      config: {
        graceMs: this.config.graceMs,
        forfeitAfterGrace: this.config.forfeitAfterGrace,
        minTurnsBeforeForfeit: this.config.minTurnsBeforeForfeit,
      },
      players: [...this._players.values()],
      forfeitedPlayerId: this._forfeitedPlayerId,
      opponentId: this._opponentId,
      matchEnded: this._matchEnded,
    };
  }

  /**
   * Reconstruct an AbandonmentTracker from a serialized snapshot.
   *
   * @param {object} json - Output of `toJSON()`.
   * @returns {AbandonmentTracker}
   */
  static fromJSON(json) {
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      throw new TypeError('AbandonmentTracker.fromJSON: json must be an object');
    }
    const config = normalizeConfig(json.config);
    const tracker = new AbandonmentTracker(config);
    if (Array.isArray(json.players)) {
      for (const p of json.players) {
        if (!p || typeof p !== 'object') continue;
        assertNonEmptyString(p.playerId, 'players[].playerId');
        tracker._players.set(p.playerId, {
          playerId: p.playerId,
          state: p.state,
          disconnectedAt: p.disconnectedAt ?? 0,
          turnAtDisconnect: p.turnAtDisconnect ?? -1,
          forfeitAt: p.forfeitAt ?? null,
          reconnectCount: p.reconnectCount ?? 0,
        });
      }
    }
    tracker._forfeitedPlayerId = typeof json.forfeitedPlayerId === 'string' ? json.forfeitedPlayerId : null;
    tracker._opponentId = typeof json.opponentId === 'string' ? json.opponentId : null;
    tracker._matchEnded = Boolean(json.matchEnded);
    return tracker;
  }
}

/**
 * Reconstruct an AbandonmentTracker from a serialized snapshot (module-level
 * alias for `AbandonmentTracker.fromJSON`).
 *
 * @param {object} json
 * @returns {AbandonmentTracker}
 */
export function abandonmentTrackerFromJSON(json) {
  return AbandonmentTracker.fromJSON(json);
}

// ─── computeForfeitResult ───────────────────────────────────────

/**
 * Snapshot of a match's participant connection state.
 *
 * @typedef {Object} MatchParticipantSnapshot
 * @property {string} playerId
 * @property {boolean} connected
 * @property {number|null} [disconnectedAt] - Timestamp of disconnect, or null if connected.
 */

/**
 * Snapshot of the match state used for forfeit computation.
 *
 * @typedef {Object} MatchStateSnapshot
 * @property {string[]} playerIds - The two player ids [P1, P2].
 * @property {number} turnNumber - Current authoritative turn number.
 * @property {MatchParticipantSnapshot[]} participants - Per-participant connection state.
 */

/**
 * Result of a forfeit computation.
 *
 * @typedef {Object} ForfeitResult
 * @property {boolean} shouldForfeit
 * @property {string} [winnerId]
 * @property {string} [loserId]
 * @property {string} [reason]
 * @property {string} [reasonCode]
 */

/**
 * Compute whether a forfeit should be applied given a match state snapshot
 * and an abandonment tracker.
 *
 * This is a pure function: it does not mutate the tracker (it reads state
 * only). The caller is responsible for having called `checkForfeit` on the
 * tracker (which performs the state transition) prior to or after this
 * call. When the tracker reports a forfeit, this function resolves the
 * opponent from the match snapshot and returns a full forfeit result.
 *
 * A forfeit is reported when:
 *   - The tracker has a forfeited player (`tracker.hasForfeit()`), AND
 *   - The forfeited player is one of `matchState.playerIds`, AND
 *   - Exactly one opponent can be resolved from `matchState.playerIds`.
 *
 * @param {MatchStateSnapshot} matchState
 * @param {AbandonmentTracker} abandonmentTracker
 * @returns {ForfeitResult}
 *   `{ shouldForfeit: true, winnerId, loserId, reason, reasonCode }` or
 *   `{ shouldForfeit: false }`.
 */
export function computeForfeitResult(matchState, abandonmentTracker) {
  if (!matchState || typeof matchState !== 'object' || Array.isArray(matchState)) {
    throw new TypeError('computeForfeitResult: matchState must be an object');
  }
  if (!abandonmentTracker || typeof abandonmentTracker.hasForfeit !== 'function') {
    throw new TypeError('computeForfeitResult: abandonmentTracker must be an AbandonmentTracker');
  }

  const { playerIds, turnNumber, participants } = matchState;
  if (!Array.isArray(playerIds) || playerIds.length !== 2) {
    throw new TypeError('computeForfeitResult: matchState.playerIds must be an array of exactly two player ids');
  }
  assertTurnNumber(turnNumber, 'matchState.turnNumber');
  if (!Array.isArray(participants)) {
    throw new TypeError('computeForfeitResult: matchState.participants must be an array');
  }
  for (const p of playerIds) assertNonEmptyString(p, 'playerIds[]');

  if (!abandonmentTracker.hasForfeit()) {
    return { shouldForfeit: false };
  }

  const loserId = abandonmentTracker.getForfeitedPlayerId();
  if (!loserId) return { shouldForfeit: false };

  if (!playerIds.includes(loserId)) {
    // The forfeited player is not part of this match — stale tracker.
    return { shouldForfeit: false };
  }

  const opponents = playerIds.filter(id => id !== loserId);
  if (opponents.length !== 1) {
    return { shouldForfeit: false };
  }
  const winnerId = opponents[0];

  // Cross-check the participant snapshot: the loser should be disconnected.
  // This is a defensive consistency check; we do not block the forfeit if
  // the snapshot disagrees (the tracker is authoritative), but we do
  // validate the snapshot shape.
  const loserSnapshot = participants.find(p => p && p.playerId === loserId);
  if (loserSnapshot && loserSnapshot.connected === true) {
    // The snapshot claims the loser is connected, but the tracker says
    // forfeited. Trust the tracker (server-authoritative) but this
    // inconsistency is notable. We still report the forfeit.
  }

  return {
    shouldForfeit: true,
    winnerId,
    loserId,
    reason: ABANDONMENT_REASON.REASON,
    reasonCode: ABANDONMENT_REASON.REASON_CODE,
  };
}

// ─── buildAbandonmentResultRecord ───────────────────────────────

/**
 * A participant descriptor for building an abandonment result record.
 *
 * @typedef {Object} AbandonmentParticipant
 * @property {string} playerId - 'P1' or 'P2' (the Intrilex seat id).
 * @property {string|null} accountId - Supabase user UUID (null for anonymous).
 * @property {string} [participantId] - Intrilex participant ID (P-xxxx), if known.
 */

/**
 * Build a MatchResultRecord-shaped object for a forfeited (abandoned) match.
 *
 * The winner receives `result: 'WIN'`; the loser receives `result: 'LOSS'`
 * with an `abandonmentForfeit: true` flag. The record includes
 * `terminationReason: 'ABANDONMENT'` and a top-level `abandonmentForfeit: true`
 * marker so downstream consumers (RatingService, terminal outbox, match
 * history) can distinguish abandonment forfeits from normal wins.
 *
 * Rating fields (`ratingBefore`, `ratingAfter`, `ratingDelta`, RD, volatility)
 * are intentionally left null — the caller (server) will hydrate them via
 * the persistor + rating computation before persistence, mirroring
 * `buildMatchResultRecord`. This function is pure and performs no I/O.
 *
 * @param {string} matchId - The Intrilex match ID (M-xxxx).
 * @param {string} queueId - The queue id (e.g. 'ranked').
 * @param {string|null} seasonId - The active ranked season id, or null.
 * @param {ForfeitResult} forfeitResult - Output of `computeForfeitResult` (must have `shouldForfeit: true`).
 * @param {AbandonmentParticipant[]} participants - Both participants, each with playerId + accountId.
 * @returns {object} A MatchResultRecord-shaped object (see match-result-persistor.mjs).
 */
export function buildAbandonmentResultRecord(matchId, queueId, seasonId, forfeitResult, participants) {
  assertNonEmptyString(matchId, 'matchId');
  assertNonEmptyString(queueId, 'queueId');
  if (seasonId !== null && (typeof seasonId !== 'string' || seasonId.length === 0)) {
    throw new TypeError('buildAbandonmentResultRecord: seasonId must be a non-empty string or null');
  }
  if (!forfeitResult || typeof forfeitResult !== 'object' || Array.isArray(forfeitResult)) {
    throw new TypeError('buildAbandonmentResultRecord: forfeitResult must be an object');
  }
  if (!forfeitResult.shouldForfeit) {
    throw new TypeError('buildAbandonmentResultRecord: forfeitResult.shouldForfeit must be true');
  }
  assertNonEmptyString(forfeitResult.winnerId, 'forfeitResult.winnerId');
  assertNonEmptyString(forfeitResult.loserId, 'forfeitResult.loserId');
  if (!Array.isArray(participants) || participants.length !== 2) {
    throw new TypeError('buildAbandonmentResultRecord: participants must be an array of exactly two participants');
  }

  const now = Date.now();
  const winnerParticipant = participants.find(p => p && p.playerId === forfeitResult.winnerId);
  const loserParticipant = participants.find(p => p && p.playerId === forfeitResult.loserId);

  if (!winnerParticipant) {
    throw new Error(`buildAbandonmentResultRecord: no participant matched winnerId "${forfeitResult.winnerId}"`);
  }
  if (!loserParticipant) {
    throw new Error(`buildAbandonmentResultRecord: no participant matched loserId "${forfeitResult.loserId}"`);
  }

  /** @type {object[]} */
  const participantRecords = [
    {
      accountId: winnerParticipant.accountId ?? null,
      participantId: winnerParticipant.participantId ?? null,
      seat: winnerParticipant.playerId,
      result: 'WIN',
      ratingBefore: null,
      ratingAfter: null,
      ratingDelta: null,
      abandonmentForfeit: false,
    },
    {
      accountId: loserParticipant.accountId ?? null,
      participantId: loserParticipant.participantId ?? null,
      seat: loserParticipant.playerId,
      result: 'LOSS',
      ratingBefore: null,
      ratingAfter: null,
      ratingDelta: null,
      abandonmentForfeit: true,
    },
  ];

  // Resolve the winner's Supabase userId for the top-level winnerUserId field.
  const winnerUserId = winnerParticipant.accountId ?? null;

  return {
    matchId,
    rulesProfileId: null, // caller hydrates from the match session
    status: 'COMPLETED',
    startedAt: now,       // caller hydrates from match.createdAt
    endedAt: now,         // caller hydrates from match.updatedAt
    terminationReason: ABANDONMENT_REASON.REASON,
    winnerUserId,
    replayHash: null,     // abandonment forfeits have no certified replay
    serverVersion: null,  // caller hydrates
    rulesVersion: null,   // caller hydrates
    participants: participantRecords,
    queueId,
    seasonId,
    matchMode: 'ranked',
    abandonmentForfeit: true,
    abandonmentReasonCode: ABANDONMENT_REASON.REASON_CODE,
  };
}
