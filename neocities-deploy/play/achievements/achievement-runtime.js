// ═══════════════════════════════════════════════════════════════
// achievement-runtime.js — Browser achievement runtime
// Orchestrates fact generation, reducer, evaluator, and persistence.
// Imports the isomorphic @intrilex/achievements package via relative
// .mjs paths (copied to dist/achievements/ by build script).
// ═══════════════════════════════════════════════════════════════

import {
  getCatalog,
  getCatalogById,
  getDefinition,
  validateCatalog,
  deriveAchievementFacts,
  createCheckpointFact,
  createMatchTracker,
  createCareerTracker,
  serializeMatchTracker,
  deserializeMatchTracker,
  serializeCareerTracker,
  deserializeCareerTracker,
  createAchievementProfileState,
  reduceFacts,
  evaluateAchievements,
  applyUnlocks,
  computeTotalAP,
  countEarned,
  isEarned,
  getProgress,
  isQualifyingMatch,
  localVsAIContext,
  networkMatchContext,
  migrateLegacyData,
  isMigrated,
  FACT_KIND,
  PROVENANCE,
  HIDDEN_ACHIEVEMENT_IDS,
  RARITY_SYMBOL,
  AP_BY_RARITY,
} from '../../achievements/index.mjs?v=4f30833b427f';

import { getAchievementState, saveAchievementState, resetAchievementState } from '../persistence.js?v=4f30833b427f';

// Validate catalog at module load
validateCatalog();

// ── AchievementRuntime ──────────────────────────────────────────

/**
 * AchievementRuntime manages the live achievement state for a player.
 * It is created once per page load and shared across matches.
 */
export class AchievementRuntime {
  constructor() {
    this._profileState = null;
    this._initialized = false;
    this._pendingUnlocks = [];
    this._onUnlockCallbacks = [];
    this._matchRuntime = null;
  }

  /**
   * Initialize by loading persisted state.
   * Runs legacy migration if needed.
   * IRX-H30: Supports account-scoped storage via optional accountId.
   * @param {object} [legacyProfile] - Legacy local profile for migration
   * @param {object} [legacyStats] - Legacy player stats for migration
   * @param {string} [accountId] - Optional account ID for account-scoped storage
   * @returns {Promise<void>}
   */
  async init(legacyProfile, legacyStats, accountId) {
    if (this._initialized) return;
    this._accountId = accountId ?? null;
    this._profileState = await getAchievementState(this._accountId);

    if (!this._profileState) {
      this._profileState = createAchievementProfileState();
      // Run migration if legacy data is available
      if (legacyProfile || legacyStats) {
        const result = migrateLegacyData(legacyProfile ?? {}, legacyStats ?? {});
        this._profileState = result.state;
        await this._persist();
      }
    }

    this._initialized = true;
  }

  /**
   * Persist current state to IndexedDB.
   * IRX-H30: Uses account-scoped storage if accountId was set during init.
   * @returns {Promise<void>}
   */
  async _persist() {
    if (!this._profileState) return;
    this._profileState.updatedAt = new Date().toISOString();
    await saveAchievementState(this._profileState, this._accountId);
  }

  /**
   * IRX-H30: Switch the runtime to a different account's achievement state.
   * Persists the current state, loads the new account's state, and reinitializes.
   * Pass null to switch to the legacy device-global profile (guest/anonymous).
   * @param {string|null} accountId - The account ID to switch to, or null for guest
   * @returns {Promise<void>}
   */
  async switchAccount(accountId) {
    // Persist current state before switching
    if (this._profileState) {
      await this._persist();
    }
    this._accountId = accountId ?? null;
    this._initialized = false;
    this._profileState = null;
    this._pendingUnlocks = [];
    await this.init(null, null, this._accountId);
  }

  /**
   * Register a callback for unlock notifications.
   * @param {(unlocks: object[]) => void} callback
   */
  onUnlock(callback) {
    this._onUnlockCallbacks.push(callback);
  }

  /**
   * Start tracking a new match.
   * @param {string} matchId
   * @param {string} humanPlayerId
   * @param {{ isTutorial?: boolean, isNetworkMatch?: boolean }} [opts]
   */
  startMatch(matchId, humanPlayerId, opts = {}) {
    const isNetwork = opts.isNetworkMatch ?? false;
    const isTutorial = opts.isTutorial ?? false;
    const ctx = isNetwork
      ? networkMatchContext(matchId, humanPlayerId)
      : localVsAIContext(matchId, humanPlayerId, isTutorial);

    if (!isQualifyingMatch(ctx)) {
      this._matchRuntime = null;
      return;
    }

    this._matchRuntime = {
      ctx,
      tracker: createMatchTracker(matchId, humanPlayerId),
      career: deserializeCareerTracker(this._profileState.career ?? serializeCareerTracker(createCareerTracker())),
      lastEventIndex: 0,
    };
  }

  /**
   * Consume a batch of engine events and process achievements.
   * @param {object[]} events - Engine events from the session
   * @param {object} [stateCards] - Map of cardId → card for identity lookup
   * @param {object} [snapshot] - Current state snapshot for checkpoint
   * @returns {object[]} New unlocks from this batch
   */
  consumeEvents(events, stateCards = null, snapshot = null) {
    if (!this._matchRuntime || !events || events.length === 0) return [];

    const { ctx, tracker, career } = this._matchRuntime;
    const provenance = ctx.isNetworkMatch ? PROVENANCE.NETWORK_AUTHORITY : PROVENANCE.LOCAL_AUTHORITY;

    // Derive facts from events
    const facts = deriveAchievementFacts(events, {
      matchId: ctx.matchId,
      humanPlayerId: ctx.humanPlayerId,
      provenance,
      startEventIndex: this._matchRuntime.lastEventIndex,
      stateCards,
    });

    // Add checkpoint fact if snapshot provided
    if (snapshot) {
      facts.push(createCheckpointFact(ctx.matchId, ctx.humanPlayerId, {
        humanScore: snapshot.humanScore ?? 0,
        opponentScore: snapshot.opponentScore ?? 0,
        humanHandCount: snapshot.humanHandCount ?? 0,
        opponentHandCount: snapshot.opponentHandCount ?? 0,
        stackDepth: snapshot.stackDepth ?? 0,
        fullTurnSequence: snapshot.fullTurnSequence ?? 0,
        stateRevision: snapshot.stateRevision ?? 0,
        isTerminal: snapshot.isTerminal ?? false,
        winner: snapshot.winner ?? null,
        isDraw: snapshot.isDraw ?? false,
      }, provenance, this._matchRuntime.lastEventIndex + events.length));
    }

    this._matchRuntime.lastEventIndex += events.length;

    // Reduce facts into trackers
    reduceFacts(tracker, career, facts);

    // Evaluate achievements
    const result = evaluateAchievements(tracker, career, this._profileState, {
      matchId: ctx.matchId,
      isTutorial: ctx.isTutorial,
      provenance,
    });

    if (result.newUnlocks.length > 0) {
      // Apply unlocks to profile state
      this._profileState = applyUnlocks(this._profileState, result.newUnlocks, result.progressUpdates);

      // Update career in profile state
      this._profileState.career = serializeCareerTracker(career);

      // Accumulate unlocks for finishMatch() to return
      this._pendingUnlocks.push(...result.newUnlocks);

      // Notify callbacks
      for (const cb of this._onUnlockCallbacks) {
        try { cb(result.newUnlocks); } catch { /* ignore callback errors */ }
      }

      // Persist asynchronously
      this._persist().catch(err => { console.error('[achievements] Persist failed (consume):', err); });
    } else if (Object.keys(result.progressUpdates).length > 0) {
      // Update progress even without unlocks
      this._profileState = applyUnlocks(this._profileState, [], result.progressUpdates);
      this._profileState.career = serializeCareerTracker(career);
      this._persist().catch(err => { console.error('[achievements] Persist failed (progress):', err); });
    }

    return result.newUnlocks;
  }

  /**
   * Finalize a match and return all unlocks from it.
   * @returns {object[]} All unlocks from this match
   */
  finishMatch() {
    if (!this._matchRuntime) return [];
    const unlocks = [...this._pendingUnlocks];
    this._pendingUnlocks = [];
    this._matchRuntime = null;
    return unlocks;
  }

  /**
   * Merge server-authoritative achievement unlocks from a network match.
   * The server evaluates achievements with full engine state (no hidden-info
   * firewall) and sends per-participant results. The client merges them into
   * its local profile, skipping any already earned.
   * @param {object[]} unlocks - Server-generated unlock records
   * @param {Record<string, *>} [progressUpdates] - Server-generated progress updates
   * @returns {object[]} Newly applied unlocks (not already earned)
   */
  applyServerUnlocks(unlocks, progressUpdates = {}) {
    if (!unlocks || unlocks.length === 0) return [];

    const newUnlocks = [];
    for (const unlock of unlocks) {
      if (!isEarned(this._profileState, unlock.achievementId)) {
        newUnlocks.push(unlock);
      }
    }

    if (newUnlocks.length > 0) {
      this._profileState = applyUnlocks(this._profileState, newUnlocks, progressUpdates);
      this._pendingUnlocks.push(...newUnlocks);
      for (const cb of this._onUnlockCallbacks) {
        try { cb(newUnlocks); } catch { /* ignore callback errors */ }
      }
      this._persist().catch(err => { console.error('[achievements] Persist failed (server unlocks):', err); });
    } else if (Object.keys(progressUpdates).length > 0) {
      this._profileState = applyUnlocks(this._profileState, [], progressUpdates);
      this._persist().catch(err => { console.error('[achievements] Persist failed (server progress):', err); });
    }

    return newUnlocks;
  }

  /**
   * Get the current profile state (for UI rendering).
   * @returns {object}
   */
  getProfileState() {
    return this._profileState;
  }

  /**
   * Get summary info for profile display.
   * @returns {{ earned: number, total: number, ap: number, maxAp: number, latestUnlock: string|null }}
   */
  getSummary() {
    const catalogById = getCatalogById();
    const earned = countEarned(this._profileState);
    const total = getCatalog().length;
    const ap = computeTotalAP(this._profileState, catalogById);
    const maxAp = 1320;
    const earnedIds = Object.keys(this._profileState.earned ?? {});
    let latestUnlock = null;
    let latestTime = '';
    for (const id of earnedIds) {
      const entry = this._profileState.earned[id];
      if (entry?.unlockedAt && entry.unlockedAt > latestTime) {
        latestTime = entry.unlockedAt;
        latestUnlock = id;
      }
    }
    return { earned, total, ap, maxAp, latestUnlock };
  }

  /**
   * Get display data for the achievement gallery.
   * @param {{ filter?: string, category?: string }} [opts]
   * @returns {object[]}
   */
  getGalleryData(opts = {}) {
    const catalog = getCatalog();
    const filter = opts.filter ?? 'all';
    return catalog.map(def => {
      const earned = isEarned(this._profileState, def.id);
      const progress = getProgress(this._profileState, def.id);
      const isHidden = def.hidden && !earned;

      if (filter === 'earned' && !earned) return null;
      if (filter === 'locked' && earned) return null;
      if (opts.category && def.category !== opts.category) return null;

      if (isHidden) {
        return {
          id: def.id,
          name: '???',
          description: 'Hidden Achievement',
          hidden: true,
          earned: false,
          category: def.category,
          rarity: def.rarity,
          raritySymbol: RARITY_SYMBOL[def.rarity],
          achievementPoints: def.achievementPoints,
          progress: null,
          iconKey: def.iconKey,
        };
      }

      return {
        id: def.id,
        name: def.name,
        description: def.description,
        hidden: def.hidden,
        earned,
        category: def.category,
        rarity: def.rarity,
        raritySymbol: RARITY_SYMBOL[def.rarity],
        achievementPoints: def.achievementPoints,
        progress: progress ? {
          current: progress.current,
          target: progress.target,
          type: progress.type,
          completed: progress.completed,
        } : null,
        earnedAt: earned ? this._profileState.earned[def.id]?.unlockedAt : null,
        iconKey: def.iconKey,
      };
    }).filter(Boolean);
  }

  /**
   * Reset all achievement progress (developer testing).
   * Requires explicit confirmation from caller.
   * @returns {Promise<boolean>}
   */
  async resetProgress() {
    this._profileState = createAchievementProfileState();
    await resetAchievementState();
    await this._persist();
    return true;
  }

  /**
   * Check if an achievement is earned.
   * @param {string} id
   * @returns {boolean}
   */
  isAchievementEarned(id) {
    return isEarned(this._profileState, id);
  }
}

// ── Singleton instance ──────────────────────────────────────────

let _runtime = null;

/**
 * Get the singleton AchievementRuntime instance.
 * @returns {AchievementRuntime}
 */
export function getAchievementRuntime() {
  if (!_runtime) {
    _runtime = new AchievementRuntime();
  }
  return _runtime;
}

// ── Re-exports for convenience ──────────────────────────────────

export {
  getCatalog,
  getCatalogById,
  getDefinition,
  HIDDEN_ACHIEVEMENT_IDS,
  RARITY_SYMBOL,
  AP_BY_RARITY,
  FACT_KIND,
  PROVENANCE,
};
