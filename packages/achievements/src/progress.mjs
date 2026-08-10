// ═══════════════════════════════════════════════════════════════
// progress.mjs — Match-scoped tracker, career tracker, and progress state
// Pure data structures and helpers. No side effects.
// ═══════════════════════════════════════════════════════════════

import { FACT_KIND, ZONE, LAUNCH_ZONE_SET, CLEAN_SWEEP_ZONES, LAUNCH_SPADES_EFFECTS } from './constants.mjs';

// ── Match-Scoped Tracker ────────────────────────────────────────

/**
 * @typedef {Object} AchievementMatchTracker
 * Per-match state for conditions requiring match history.
 * @property {string} matchId
 * @property {string} humanPlayerId
 * @property {{ points: number, effect: number, other: number }} actionsByMode
 * @property {Set<string>} ranksPlayedForPoints
 * @property {Set<string>} ranksPlayedForEffect
 * @property {Set<string>} zonesInteractedThisMatch
 * @property {number} swapUsedCount
 * @property {Set<string>} acquiredFromSwap
 * @property {number} superDeclaredCount
 * @property {number} superResolvedCount
 * @property {Set<string>} spadesEffectsDeclared
 * @property {Set<string>} spadesEffectsResolved
 * @property {Set<string>} spadesEffectsThisFullTurn
 * @property {number} maxStackDepth
 * @property {number} currentStackDepth
 * @property {number} responseChainDepth
 * @property {number} maxResponseChainDepth
 * @property {number} responsesPlayed
 * @property {number} humanResponsesPlayed
 * @property {number} sevenInteractionsThisFullTurn
 * @property {Set<string>} sevenRevealCardIds
 * @property {Set<string>} sevenGeneratedEffectCardIds
 * @property {boolean} sevenRecursiveDetected
 * @property {Set<string>} humanAnchorsActive
 * @property {boolean} anchorSurvivedOpponentFullTurn
 * @property {string|null} currentFullTurnPlayerId
 * @property {number|null} currentFullTurnSequence
 * @property {number} humanScoreAtTurnStart
 * @property {number} opponentScoreAtTurnStart
 * @property {number} effectResolutionsThisFullTurn
 * @property {number} pointDeltaThisFullTurn
 * @property {number} humanScoreAtFullTurnStart
 * @property {number} maxPointDeficit
 * @property {number} humanDeclarationsCountered
 * @property {Set<string>} humanDeclarationsThisFullTurn
 * @property {Set<string>} counteredHumanDeclarationsThisFullTurn
 * @property {boolean} lastResponseWasInterrupt
 * @property {boolean} interruptWasFinalResponse
 * @property {boolean} isTerminal
 * @property {string|null} winner
 * @property {boolean} isDraw
 * @property {number} humanScore
 * @property {number} opponentScore
 * @property {number} humanHandCount
 * @property {number} stackDepthAtTerminal
 * @property {Set<string>} processedFactIds
 * @property {any} [_anchorSurvivalCheck]
 * @property {boolean} [_humanCausedExile]
 * @property {boolean} [_anchorEstablished]
 * @property {boolean} [_deniedDetected]
 * @property {boolean} [_doubleDeniedDetected]
 * @property {boolean} [_sequenceBreakerDetected]
 * @property {boolean} [_sevenScoringTriggerResolved]
 * @property {boolean} [_sevenScoreCardUsed]
 * @property {boolean} [_turnaboutDetected]
 * @property {boolean} [_queensCourtEstablished]
 * @property {boolean} [_aceCounterResolved]
 * @property {boolean} [_superAceCounterResolved]
 */

/**
 * @param {string} matchId
 * @param {string} humanPlayerId
 * @returns {AchievementMatchTracker}
 */
export function createMatchTracker(matchId, humanPlayerId) {
  return {
    matchId,
    humanPlayerId,

    // Action tracking
    actionsByMode: { points: 0, effect: 0, other: 0 },
    ranksPlayedForPoints: new Set(),
    ranksPlayedForEffect: new Set(),

    // Zone tracking (per-match for Clean Sweep)
    zonesInteractedThisMatch: new Set(),

    // Swap
    swapUsedCount: 0,
    acquiredFromSwap: new Set(), // card entity IDs acquired from swap

    // Super
    superDeclaredCount: 0,
    superResolvedCount: 0,

    // Spades
    spadesEffectsDeclared: new Set(),
    spadesEffectsResolved: new Set(),
    spadesEffectsThisFullTurn: new Set(),

    // Stack
    maxStackDepth: 0,
    currentStackDepth: 0,
    responseChainDepth: 0,
    maxResponseChainDepth: 0,
    responsesPlayed: 0,
    humanResponsesPlayed: 0,

    // Seven
    sevenInteractionsThisFullTurn: 0,
    sevenRevealCardIds: new Set(),
    sevenGeneratedEffectCardIds: new Set(),
    sevenRecursiveDetected: false,

    // Anchors
    humanAnchorsActive: new Set(), // card entity IDs
    anchorSurvivedOpponentFullTurn: false,

    // Turn tracking
    currentFullTurnPlayerId: null,
    currentFullTurnSequence: null,
    humanScoreAtTurnStart: 0,
    opponentScoreAtTurnStart: 0,
    effectResolutionsThisFullTurn: 0,
    pointDeltaThisFullTurn: 0,
    humanScoreAtFullTurnStart: 0,

    // Deficit tracking
    maxPointDeficit: 0,

    // Counters
    humanDeclarationsCountered: 0,
    humanDeclarationsThisFullTurn: new Set(),
    counteredHumanDeclarationsThisFullTurn: new Set(),

    // Response window
    lastResponseWasInterrupt: false,
    interruptWasFinalResponse: false,

    // Terminal
    isTerminal: false,
    winner: null,
    isDraw: false,
    humanScore: 0,
    opponentScore: 0,
    humanHandCount: 0,
    stackDepthAtTerminal: 0,

    // Idempotency
    processedFactIds: new Set(),
  };
}

/**
 * Serialize a match tracker for persistence (converts Sets to arrays).
 * @param {AchievementMatchTracker} tracker
 * @returns {object}
 */
export function serializeMatchTracker(tracker) {
  return {
    matchId: tracker.matchId,
    humanPlayerId: tracker.humanPlayerId,
    actionsByMode: { ...tracker.actionsByMode },
    ranksPlayedForPoints: [...tracker.ranksPlayedForPoints],
    ranksPlayedForEffect: [...tracker.ranksPlayedForEffect],
    zonesInteractedThisMatch: [...tracker.zonesInteractedThisMatch],
    swapUsedCount: tracker.swapUsedCount,
    acquiredFromSwap: [...tracker.acquiredFromSwap],
    superDeclaredCount: tracker.superDeclaredCount,
    superResolvedCount: tracker.superResolvedCount,
    spadesEffectsDeclared: [...tracker.spadesEffectsDeclared],
    spadesEffectsResolved: [...tracker.spadesEffectsResolved],
    maxStackDepth: tracker.maxStackDepth,
    currentStackDepth: tracker.currentStackDepth,
    maxResponseChainDepth: tracker.maxResponseChainDepth,
    responsesPlayed: tracker.responsesPlayed,
    humanResponsesPlayed: tracker.humanResponsesPlayed,
    sevenInteractionsThisFullTurn: tracker.sevenInteractionsThisFullTurn,
    sevenRevealCardIds: [...tracker.sevenRevealCardIds],
    sevenGeneratedEffectCardIds: [...tracker.sevenGeneratedEffectCardIds],
    sevenRecursiveDetected: tracker.sevenRecursiveDetected,
    humanAnchorsActive: [...tracker.humanAnchorsActive],
    anchorSurvivedOpponentFullTurn: tracker.anchorSurvivedOpponentFullTurn,
    currentFullTurnPlayerId: tracker.currentFullTurnPlayerId,
    currentFullTurnSequence: tracker.currentFullTurnSequence,
    humanScoreAtTurnStart: tracker.humanScoreAtTurnStart,
    opponentScoreAtTurnStart: tracker.opponentScoreAtTurnStart,
    effectResolutionsThisFullTurn: tracker.effectResolutionsThisFullTurn,
    pointDeltaThisFullTurn: tracker.pointDeltaThisFullTurn,
    humanScoreAtFullTurnStart: tracker.humanScoreAtFullTurnStart,
    maxPointDeficit: tracker.maxPointDeficit,
    humanDeclarationsCountered: tracker.humanDeclarationsCountered,
    humanDeclarationsThisFullTurn: [...tracker.humanDeclarationsThisFullTurn],
    counteredHumanDeclarationsThisFullTurn: [...tracker.counteredHumanDeclarationsThisFullTurn],
    lastResponseWasInterrupt: tracker.lastResponseWasInterrupt,
    interruptWasFinalResponse: tracker.interruptWasFinalResponse,
    isTerminal: tracker.isTerminal,
    winner: tracker.winner,
    isDraw: tracker.isDraw,
    humanScore: tracker.humanScore,
    opponentScore: tracker.opponentScore,
    humanHandCount: tracker.humanHandCount,
    stackDepthAtTerminal: tracker.stackDepthAtTerminal,
    processedFactIds: [...tracker.processedFactIds],
  };
}

/**
 * Deserialize a match tracker from persistence (converts arrays to Sets).
 * @param {Record<string, any>} data
 * @returns {AchievementMatchTracker}
 */
export function deserializeMatchTracker(data) {
  /** @param {any} v */
  const toSet = (v) => v instanceof Set ? v : new Set(Array.isArray(v) ? v : []);
  return {
    matchId: data.matchId,
    humanPlayerId: data.humanPlayerId,
    actionsByMode: data.actionsByMode ?? { points: 0, effect: 0, other: 0 },
    ranksPlayedForPoints: toSet(data.ranksPlayedForPoints),
    ranksPlayedForEffect: toSet(data.ranksPlayedForEffect),
    zonesInteractedThisMatch: toSet(data.zonesInteractedThisMatch),
    swapUsedCount: data.swapUsedCount ?? 0,
    acquiredFromSwap: toSet(data.acquiredFromSwap),
    superDeclaredCount: data.superDeclaredCount ?? 0,
    superResolvedCount: data.superResolvedCount ?? 0,
    spadesEffectsDeclared: toSet(data.spadesEffectsDeclared),
    spadesEffectsResolved: toSet(data.spadesEffectsResolved),
    spadesEffectsThisFullTurn: toSet(data.spadesEffectsThisFullTurn),
    maxStackDepth: data.maxStackDepth ?? 0,
    currentStackDepth: data.currentStackDepth ?? 0,
    responseChainDepth: data.responseChainDepth ?? 0,
    maxResponseChainDepth: data.maxResponseChainDepth ?? 0,
    responsesPlayed: data.responsesPlayed ?? 0,
    humanResponsesPlayed: data.humanResponsesPlayed ?? 0,
    sevenInteractionsThisFullTurn: data.sevenInteractionsThisFullTurn ?? 0,
    sevenRevealCardIds: toSet(data.sevenRevealCardIds),
    sevenGeneratedEffectCardIds: toSet(data.sevenGeneratedEffectCardIds),
    sevenRecursiveDetected: data.sevenRecursiveDetected ?? false,
    humanAnchorsActive: toSet(data.humanAnchorsActive),
    anchorSurvivedOpponentFullTurn: data.anchorSurvivedOpponentFullTurn ?? false,
    currentFullTurnPlayerId: data.currentFullTurnPlayerId ?? null,
    currentFullTurnSequence: data.currentFullTurnSequence ?? null,
    humanScoreAtTurnStart: data.humanScoreAtTurnStart ?? 0,
    opponentScoreAtTurnStart: data.opponentScoreAtTurnStart ?? 0,
    effectResolutionsThisFullTurn: data.effectResolutionsThisFullTurn ?? 0,
    pointDeltaThisFullTurn: data.pointDeltaThisFullTurn ?? 0,
    humanScoreAtFullTurnStart: data.humanScoreAtFullTurnStart ?? 0,
    maxPointDeficit: data.maxPointDeficit ?? 0,
    humanDeclarationsCountered: data.humanDeclarationsCountered ?? 0,
    humanDeclarationsThisFullTurn: toSet(data.humanDeclarationsThisFullTurn),
    counteredHumanDeclarationsThisFullTurn: toSet(data.counteredHumanDeclarationsThisFullTurn),
    lastResponseWasInterrupt: data.lastResponseWasInterrupt ?? false,
    interruptWasFinalResponse: data.interruptWasFinalResponse ?? false,
    isTerminal: data.isTerminal ?? false,
    winner: data.winner ?? null,
    isDraw: data.isDraw ?? false,
    humanScore: data.humanScore ?? 0,
    opponentScore: data.opponentScore ?? 0,
    humanHandCount: data.humanHandCount ?? 0,
    stackDepthAtTerminal: data.stackDepthAtTerminal ?? 0,
    processedFactIds: toSet(data.processedFactIds),
  };
}

// ── Career Tracker ──────────────────────────────────────────────

/**
 * @typedef {Object} CareerTracker
 * Persistent career-level progress across all matches.
 * @property {number} gamesCompleted
 * @property {number} gamesWon
 * @property {Set<string>} ranksPlayedForPoints
 * @property {Set<string>} ranksPlayedForEffect
 * @property {Set<string>} zonesDiscovered
 * @property {Set<string>} spadesEffectsUsed
 * @property {number} superDeclarationsTotal
 * @property {number} superResolutionsTotal
 * @property {Set<string>} processedFactIds
 */

/** @returns {CareerTracker} */
export function createCareerTracker() {
  return {
    gamesCompleted: 0,
    gamesWon: 0,

    ranksPlayedForPoints: new Set(),
    ranksPlayedForEffect: new Set(),

    zonesDiscovered: new Set(),
    spadesEffectsUsed: new Set(),

    superDeclarationsTotal: 0,
    superResolutionsTotal: 0,

    processedFactIds: new Set(),
  };
}

/**
 * Serialize career tracker for persistence.
 * @param {any} career
 * @returns {object}
 */
export function serializeCareerTracker(career) {
  return {
    gamesCompleted: career.gamesCompleted,
    gamesWon: career.gamesWon,
    ranksPlayedForPoints: [...career.ranksPlayedForPoints],
    ranksPlayedForEffect: [...career.ranksPlayedForEffect],
    zonesDiscovered: [...career.zonesDiscovered],
    spadesEffectsUsed: [...career.spadesEffectsUsed],
    superDeclarationsTotal: career.superDeclarationsTotal,
    superResolutionsTotal: career.superResolutionsTotal,
    processedFactIds: [...career.processedFactIds],
  };
}

/**
 * Deserialize career tracker from persistence.
 * @param {Record<string, any>} data
 * @returns {CareerTracker}
 */
export function deserializeCareerTracker(data) {
  /** @param {any} v */
  const toSet = (v) => v instanceof Set ? v : new Set(Array.isArray(v) ? v : []);
  return {
    gamesCompleted: data.gamesCompleted ?? 0,
    gamesWon: data.gamesWon ?? 0,
    ranksPlayedForPoints: toSet(data.ranksPlayedForPoints),
    ranksPlayedForEffect: toSet(data.ranksPlayedForEffect),
    zonesDiscovered: toSet(data.zonesDiscovered),
    spadesEffectsUsed: toSet(data.spadesEffectsUsed),
    superDeclarationsTotal: data.superDeclarationsTotal ?? 0,
    superResolutionsTotal: data.superResolutionsTotal ?? 0,
    processedFactIds: toSet(data.processedFactIds),
  };
}

// ── Achievement Profile State ───────────────────────────────────

/**
 * @typedef {Object} AchievementProfileState
 * The canonical persistent achievement state for a player.
 * @property {string} schemaVersion
 * @property {string} ownerKey
 * @property {Record<string, any>} earned
 * @property {Record<string, any>} progress
 * @property {Record<string, any>} career
 * @property {any[]} processedFactIds
 * @property {string|null} migratedFrom
 * @property {string|null} updatedAt
 */

/** @returns {AchievementProfileState} */
export function createAchievementProfileState() {
  return {
    schemaVersion: '1.0.0',
    ownerKey: 'default',
    earned: {},              // achievementId → { unlockedAt, matchId, provenance, rulesVersion, productVersion }
    progress: {},            // achievementId → { type, current, target, setItems, completed }
    career: serializeCareerTracker(createCareerTracker()),
    processedFactIds: [],
    migratedFrom: null,
    updatedAt: null,
  };
}

// ── Progress Helpers ────────────────────────────────────────────

/**
 * Get progress for an achievement from profile state.
 * @param {Record<string, any>} profileState - Serialized AchievementProfileState
 * @param {string} achievementId
 * @returns {{ current: number, target: number|null, setItems: string[], completed: boolean, type: string }|null}
 */
export function getProgress(profileState, achievementId) {
  return profileState.progress?.[achievementId] ?? null;
}

/**
 * Check if an achievement is earned.
 * @param {Record<string, any>} profileState
 * @param {string} achievementId
 * @returns {boolean}
 */
export function isEarned(profileState, achievementId) {
  return Boolean(profileState.earned?.[achievementId]);
}

/**
 * Compute total Achievement Points from earned achievements.
 * AP is DERIVED from earned IDs, never stored as mutable total.
 * @param {Record<string, any>} profileState
 * @param {Map<string, {achievementPoints: number}>} catalogById
 * @returns {number}
 */
export function computeTotalAP(profileState, catalogById) {
  let total = 0;
  if (!profileState.earned) return total;
  for (const id of Object.keys(profileState.earned)) {
    const def = catalogById.get(id);
    if (def) total += def.achievementPoints;
  }
  return total;
}

/**
 * Count earned achievements.
 * @param {Record<string, any>} profileState
 * @returns {number}
 */
export function countEarned(profileState) {
  return profileState.earned ? Object.keys(profileState.earned).length : 0;
}
