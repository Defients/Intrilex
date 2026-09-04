// ═══════════════════════════════════════════════════════════════
// delayed-broadcast-buffer.mjs — Delayed broadcast buffer for spectator/broadcast flow
//
// Provides a time-delayed ring buffer for match views destined to
// spectators and casters. Competitive integrity requires that public
// (spectator) feeds lag behind the real game state so that a spectator
// cannot signal information to an active player. Tournament judges, by
// contrast, may receive a real-time full projection.
//
// Exports:
//   - BroadcastProjection (enum, frozen): PUBLIC / JUDGE
//   - createDelayedBroadcastBuffer(config): DelayedBroadcastBuffer factory
//   - shouldFlush(view, currentTimestamp, delayMs): pure flush predicate
//   - createCasterHandoff(): CasterHandoff for caster transitions
//   - buildBracketToBroadcastLink(...): bracket→broadcast navigation link
//
// Design notes:
//   - The buffer is a FIFO of { view, timestamp } entries. `flush()`
//     drains every entry whose age (currentTimestamp - timestamp) is
//     >= the configured delay, preserving insertion order.
//   - `setDelay()` only affects future `flush()` comparisons; entries
//     already in the buffer are not re-evaluated against the old delay.
//   - All pure helpers are exported individually for unit testing.
//   - The buffer and handoff hold internal state; everything else is pure.
// ═══════════════════════════════════════════════════════════════

/**
 * Broadcast projection modes.
 *
 * - `PUBLIC`: Delayed, neutralized view for general spectators. Hides
 *   hands, legal actions, RNG state, seed, tokens, and role-private
 *   data (mirrors `buildSpectatorView` from player-projection).
 * - `JUDGE`: Real-time, full view for tournament judges. No delay,
 *   no neutralization — judges see the authoritative match state.
 *
 * @enum {string}
 * @readonly
 * @frozen
 */
export const BroadcastProjection = Object.freeze({
  PUBLIC: 'PUBLIC',
  JUDGE: 'JUDGE',
});

/** @typedef {typeof BroadcastProjection[keyof typeof BroadcastProjection]} ProjectionType */

/**
 * Default configuration for `createDelayedBroadcastBuffer`.
 * The 30s default delay matches standard competitive-integrity practices.
 */
const DEFAULT_DELAY_MS = 30000;
const DEFAULT_MAX_BUFFER_SIZE = 200;

/**
 * @typedef {Object} DelayedBroadcastBufferConfig
 * @property {number} [delayMs=30000] - Delay in ms before a view becomes flushable
 * @property {number} [maxBufferSize=200] - Maximum entries retained in the buffer
 * @property {ProjectionType} [projectionType=BroadcastProjection.PUBLIC] - Projection mode
 */

/**
 * @typedef {Object} BufferedView
 * @property {Record<string,*>} view - The match view DTO
 * @property {number} timestamp - The timestamp (ms epoch) the view was generated
 */

/**
 * Pure predicate: returns true if a buffered view has aged past the
 * delay threshold and is eligible to be flushed.
 *
 * A view is flushable when the elapsed time since it was generated is
 * greater than or equal to the configured delay. A non-positive delay
 * (e.g. JUDGE real-time) makes every view immediately flushable.
 *
 * @param {BufferedView|{ timestamp: number }} view - The buffered view (only `timestamp` is read)
 * @param {number} currentTimestamp - The current timestamp (ms epoch)
 * @param {number} delayMs - The configured delay in ms
 * @returns {boolean}
 */
export function shouldFlush(view, currentTimestamp, delayMs) {
  if (!view || typeof view.timestamp !== 'number') return false;
  if (typeof currentTimestamp !== 'number') return false;
  if (typeof delayMs !== 'number' || delayMs < 0) return false;
  return (currentTimestamp - view.timestamp) >= delayMs;
}

/**
 * Create a DelayedBroadcastBuffer — a FIFO of timestamped match views
 * that are released to consumers only after they have aged past the
 * configured delay.
 *
 * @param {DelayedBroadcastBufferConfig} [config={}]
 * @returns {DelayedBroadcastBuffer}
 */
export function createDelayedBroadcastBuffer(config = {}) {
  const delayMs = typeof config.delayMs === 'number' && config.delayMs >= 0
    ? config.delayMs
    : DEFAULT_DELAY_MS;
  const maxBufferSize = typeof config.maxBufferSize === 'number' && config.maxBufferSize > 0
    ? Math.floor(config.maxBufferSize)
    : DEFAULT_MAX_BUFFER_SIZE;
  const projectionType = isValidProjection(config.projectionType)
    ? config.projectionType
    : BroadcastProjection.PUBLIC;

  return new DelayedBroadcastBuffer(delayMs, maxBufferSize, projectionType);
}

/**
 * @class DelayedBroadcastBuffer
 * @classdesc Time-delayed FIFO buffer for match broadcast views.
 *
 * Internal state: an ordered array of `{ view, timestamp }` entries
 * (oldest first). `flush()` drains the contiguous prefix of entries
 * that satisfy `shouldFlush`.
 */
class DelayedBroadcastBuffer {
  /**
   * @param {number} delayMs
   * @param {number} maxBufferSize
   * @param {ProjectionType} projectionType
   */
  constructor(delayMs, maxBufferSize, projectionType) {
    /** @type {BufferedView[]} */
    this._buffer = [];
    this._delayMs = delayMs;
    this._maxBufferSize = maxBufferSize;
    this._projectionType = projectionType;
  }

  /**
   * Add a match view to the buffer with the timestamp it was generated.
   *
   * If the buffer is at capacity, the oldest entry is evicted before
   * the new one is appended (the oldest would be flushed first anyway,
   * so dropping it bounds memory without affecting flush correctness
   * for newer views).
   *
   * @param {Record<string,*>} view - The match view DTO
   * @param {number} timestamp - The timestamp (ms epoch) the view was generated
   * @returns {void}
   */
  push(view, timestamp) {
    if (view === null || view === undefined) return;
    if (typeof timestamp !== 'number') return;
    if (this._buffer.length >= this._maxBufferSize) {
      this._buffer.shift();
    }
    this._buffer.push({ view, timestamp });
  }

  /**
   * Return an array of views that have aged past the delay threshold,
   * removing them from the buffer. Entries are returned in insertion
   * order (oldest first).
   *
   * @param {number} currentTimestamp - The current timestamp (ms epoch)
   * @returns {BufferedView[]} Flushed entries (empty array if none ready)
   */
  flush(currentTimestamp) {
    if (typeof currentTimestamp !== 'number') return [];
    const flushed = [];
    while (this._buffer.length > 0 &&
      shouldFlush(this._buffer[0], currentTimestamp, this._delayMs)) {
      flushed.push(this._buffer.shift());
    }
    return flushed;
  }

  /**
   * Return the next view that will be flushed (the oldest entry),
   * without removing it from the buffer.
   *
   * @returns {BufferedView|null}
   */
  peek() {
    return this._buffer.length > 0 ? this._buffer[0] : null;
  }

  /**
   * Return the current number of buffered views.
   *
   * @returns {number}
   */
  size() {
    return this._buffer.length;
  }

  /**
   * Clear all buffered views.
   *
   * @returns {void}
   */
  clear() {
    this._buffer = [];
  }

  /**
   * Update the delay. Only affects future `flush()` comparisons;
   * already-buffered views are not re-evaluated against the prior delay.
   *
   * @param {number} delayMs - New delay in ms (must be >= 0)
   * @returns {void}
   */
  setDelay(delayMs) {
    if (typeof delayMs === 'number' && delayMs >= 0) {
      this._delayMs = delayMs;
    }
  }

  /**
   * Return the current delay in ms.
   *
   * @returns {number}
   */
  getDelay() {
    return this._delayMs;
  }

  /**
   * Switch between PUBLIC and JUDGE projections. This is metadata for
   * the consumer of the buffer (e.g. the broadcaster decides whether to
   * neutralize the view and whether to apply the delay); the buffer
   * itself always applies the delay in `flush()`.
   *
   * @param {ProjectionType} type
   * @returns {void}
   */
  setProjectionType(type) {
    if (isValidProjection(type)) {
      this._projectionType = type;
    }
  }

  /**
   * Return the current projection type.
   *
   * @returns {ProjectionType}
   */
  getProjectionType() {
    return this._projectionType;
  }

  /**
   * Serialize the buffer to a plain JSON object for persistence.
   *
   * @returns {{ delayMs: number, maxBufferSize: number, projectionType: ProjectionType, buffer: BufferedView[] }}
   */
  toJSON() {
    return {
      delayMs: this._delayMs,
      maxBufferSize: this._maxBufferSize,
      projectionType: this._projectionType,
      buffer: this._buffer.map(entry => ({ view: entry.view, timestamp: entry.timestamp })),
    };
  }

  /**
   * Restore the buffer's state from a JSON object produced by `toJSON()`.
   * Mutates the receiver: delay, max size, projection type, and all
   * buffered entries are replaced with the deserialized values. Entries
   * that fail validation (missing/invalid timestamp) are skipped.
   *
   * @param {ReturnType<DelayedBroadcastBuffer['toJSON']>} json
   * @returns {void}
   */
  fromJSON(json) {
    if (!json || typeof json !== 'object') return;
    if (typeof json.delayMs === 'number' && json.delayMs >= 0) {
      this._delayMs = json.delayMs;
    }
    if (typeof json.maxBufferSize === 'number' && json.maxBufferSize > 0) {
      this._maxBufferSize = Math.floor(json.maxBufferSize);
    }
    if (isValidProjection(json.projectionType)) {
      this._projectionType = json.projectionType;
    }
    this._buffer = [];
    if (Array.isArray(json.buffer)) {
      for (const entry of json.buffer) {
        if (entry && typeof entry.timestamp === 'number') {
          this.push(entry.view, entry.timestamp);
        }
      }
    }
  }
}

/**
 * Validate that a value is a known BroadcastProjection member.
 *
 * @param {*} type
 * @returns {boolean}
 */
function isValidProjection(type) {
  return type === BroadcastProjection.PUBLIC || type === BroadcastProjection.JUDGE;
}

// ═══════════════════════════════════════════════════════════════
// CasterHandoff — manage caster-to-match assignments and transitions
// ═══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} TransferResult
 * @property {string} matchId - The match the casting was transferred for
 * @property {string|null} previousCaster - The caster that was released (null if none)
 * @property {string} newCaster - The caster now assigned to the match
 */

/**
 * Create a CasterHandoff — a small stateful registry that tracks which
 * caster is currently assigned to which match and supports clean
 * transitions between casters (e.g. for shift changes or handoffs
 * between commentary desks during a tournament).
 *
 * Invariants:
 *   - A match has at most one active caster at a time.
 *   - A caster is assigned to at most one match at a time.
 *   - `transfer()` reuses the existing match assignment of `fromCasterId`
 *     and binds `toCasterId` to that same match.
 *
 * @returns {CasterHandoff}
 */
export function createCasterHandoff() {
  return new CasterHandoff();
}

/**
 * @class CasterHandoff
 * @classdesc Registry mapping matchId → casterId and casterId → matchId.
 */
class CasterHandoff {
  constructor() {
    /** @type {Map<string, string>} matchId → casterId */
    this._matchToCaster = new Map();
    /** @type {Map<string, string>} casterId → matchId */
    this._casterToMatch = new Map();
  }

  /**
   * Assign a caster to a match. If the caster was previously assigned
   * to another match, that prior assignment is released first. If the
   * match already had a different caster, that caster is released.
   *
   * @param {string} casterId
   * @param {string} matchId
   * @returns {void}
   */
  assign(casterId, matchId) {
    if (!casterId || !matchId) return;

    // Release the caster from any prior match
    const priorMatch = this._casterToMatch.get(casterId);
    if (priorMatch !== undefined) {
      this._matchToCaster.delete(priorMatch);
    }

    // Release any caster previously on this match
    const priorCaster = this._matchToCaster.get(matchId);
    if (priorCaster !== undefined) {
      this._casterToMatch.delete(priorCaster);
    }

    this._casterToMatch.set(casterId, matchId);
    this._matchToCaster.set(matchId, casterId);
  }

  /**
   * Release a caster from their current match. No-op if the caster has
   * no active assignment.
   *
   * @param {string} casterId
   * @returns {void}
   */
  release(casterId) {
    if (!casterId) return;
    const matchId = this._casterToMatch.get(casterId);
    if (matchId === undefined) return;
    this._casterToMatch.delete(casterId);
    // Only clear the match mapping if it still points at this caster
    if (this._matchToCaster.get(matchId) === casterId) {
      this._matchToCaster.delete(matchId);
    }
  }

  /**
   * Return the casterId assigned to a match, or null if none.
   *
   * @param {string} matchId
   * @returns {string|null}
   */
  getActiveCaster(matchId) {
    if (!matchId) return null;
    const casterId = this._matchToCaster.get(matchId);
    return casterId !== undefined ? casterId : null;
  }

  /**
   * Return the matchId a caster is assigned to, or null if none.
   *
   * @param {string} casterId
   * @returns {string|null}
   */
  getCastAssignment(casterId) {
    if (!casterId) return null;
    const matchId = this._casterToMatch.get(casterId);
    return matchId !== undefined ? matchId : null;
  }

  /**
   * Transfer casting from one caster to another for the same match.
   * The new caster becomes the active caster for the match that the
   * previous caster was assigned to. If `fromCasterId` has no active
   * assignment, the transfer still binds `toCasterId` to no match and
   * returns a result with `matchId: null`.
   *
   * @param {string} fromCasterId - The caster handing off
   * @param {string} toCasterId - The caster taking over
   * @returns {TransferResult}
   */
  transfer(fromCasterId, toCasterId) {
    if (!fromCasterId || !toCasterId) {
      return { matchId: null, previousCaster: fromCasterId ?? null, newCaster: toCasterId ?? null };
    }
    const matchId = this._casterToMatch.get(fromCasterId) ?? null;
    if (matchId === null) {
      return { matchId: null, previousCaster: fromCasterId, newCaster: toCasterId };
    }
    // Release the previous caster, then assign the new one to the same match
    this.release(fromCasterId);
    this.assign(toCasterId, matchId);
    return { matchId, previousCaster: fromCasterId, newCaster: toCasterId };
  }

  /**
   * Return a Map of matchId → casterId for all active assignments.
   * The returned Map is a copy; mutating it does not affect the handoff.
   *
   * @returns {Map<string, string>}
   */
  getActiveAssignments() {
    return new Map(this._matchToCaster);
  }
}

// ═══════════════════════════════════════════════════════════════
// Bracket → Broadcast navigation link
// ═══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} BracketToBroadcastLink
 * @property {string} tournamentId
 * @property {string} matchId
 * @property {number|string} bracketPosition
 * @property {string} broadcastUrl - Fragment URL for the caster workspace
 */

/**
 * Build a navigation link object for bracket-to-broadcast navigation.
 *
 * Produces a pure data object (no DOM coupling) that the bracket UI can
 * render as a "Watch on Broadcast" link. The `broadcastUrl` is a hash
 * fragment compatible with the caster workspace route
 * (`#/caster?tournament=...&match=...`).
 *
 * @param {string} tournamentId
 * @param {string} matchId
 * @param {number|string} bracketPosition
 * @returns {BracketToBroadcastLink}
 */
export function buildBracketToBroadcastLink(tournamentId, matchId, bracketPosition) {
  const tId = tournamentId ?? '';
  const mId = matchId ?? '';
  const pos = bracketPosition ?? '';
  const broadcastUrl = `#/caster?tournament=${encodeURIComponent(tId)}&match=${encodeURIComponent(mId)}`;
  return {
    tournamentId: tId,
    matchId: mId,
    bracketPosition: pos,
    broadcastUrl,
  };
}
