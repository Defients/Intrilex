// ═══════════════════════════════════════════════════════════════
// achievement-projection.mjs — Server-side achievement evaluator
// Run inside match-authority. Has full access to engine state.
// Produces player-safe achievement facts and unlocks per participant.
// ═══════════════════════════════════════════════════════════════

import {
  deriveAchievementFacts,
  createCheckpointFact,
  createMatchTracker,
  createCareerTracker,
  reduceFacts,
  evaluateAchievements,
  applyUnlocks,
  isQualifyingMatch,
  networkMatchContext,
  PROVENANCE,
  serializeCareerTracker,
} from '@intrilex/achievements';

/**
 * @typedef {Object} MatchAchievementContext
 * @property {string} matchId
 * @property {any} engineState
 * @property {string[]} playerIds
 * @property {object[]} events
 */

/**
 * Evaluate achievements for one match session (server-side).
 * Called by AuthoritativeMatchSession when a match becomes terminal
 * or when a batch of events has been committed.
 *
 * @param {MatchAchievementContext} ctx
 * @param {Map<string, object>} careerByParticipant - Existing career state per participant
 * @returns {{ [participantId: string]: { newUnlocks: object[], progressUpdates: object[], tracker: object } }}
 */
export function evaluateMatchAchievements(ctx, careerByParticipant = new Map()) {
  const { matchId, engineState, playerIds, events } = ctx;

  if (!isQualifyingMatch(networkMatchContext(matchId, playerIds[0]))) {
    return {};
  }

  const stateCards = engineState?.cards ?? {};

  /** @type {Object<string, any>} */
  const results = {};
  for (const playerId of playerIds) {
    // Derive facts from this player's perspective (isHuman is relative to playerId)
    const facts = deriveAchievementFacts(events, {
      matchId,
      humanPlayerId: playerId,
      provenance: PROVENANCE.NETWORK_AUTHORITY,
      stateCards,
      fullTurnSequence: engineState?.fullTurnSequence,
    });

    // Add terminal checkpoint from this player's perspective
    const opponentId = playerIds.find(id => id !== playerId) ?? playerIds[0];
    const checkpoint = createCheckpointFact(matchId, playerId, {
      humanScore: engineState?.players?.[playerId]?.securedPoints ?? 0,
      opponentScore: engineState?.players?.[opponentId]?.securedPoints ?? 0,
      humanHandCount: engineState?.players?.[playerId]?.hand?.length ?? 0,
      opponentHandCount: engineState?.players?.[opponentId]?.hand?.length ?? 0,
      stackDepth: engineState?.stack?.length ?? 0,
      fullTurnSequence: engineState?.fullTurnSequence ?? 0,
      stateRevision: engineState?.revision ?? 0,
      isTerminal: true,
      winner: engineState?.winner ?? null,
      isDraw: engineState?.winner === null,
    }, PROVENANCE.NETWORK_AUTHORITY);
    facts.push(checkpoint);

    const tracker = createMatchTracker(matchId, playerId);
    const career = careerByParticipant.get(playerId) ?? createCareerTracker();
    reduceFacts(tracker, career, facts);

    // Evaluate against empty profile (server does not store full profile; client merges)
    const result = evaluateAchievements(tracker, career, { earned: {}, progress: {} }, {
      matchId,
      isTutorial: false,
      provenance: PROVENANCE.NETWORK_AUTHORITY,
    });

    results[playerId] = {
      newUnlocks: result.newUnlocks,
      progressUpdates: result.progressUpdates,
      tracker: { ...tracker, career: serializeCareerTracker(career) },
    };
  }

  return results;
}
