// ═══════════════════════════════════════════════════════════════
// reducer.mjs — Pure fact reducer for match and career trackers
// Idempotent: processing the same fact twice produces the same state.
// No side effects. No persistence. No UI.
// ═══════════════════════════════════════════════════════════════

import { FACT_KIND, ZONE } from './constants.mjs';
import {
  createMatchTracker,
  createCareerTracker,
  serializeCareerTracker,
  deserializeCareerTracker,
} from './progress.mjs';

/**
 * Apply a single fact to the match tracker and career tracker.
 * Pure: returns new state, does not mutate inputs (but for efficiency,
 * we mutate in-place since the caller passes owned objects).
 *
 * @param {import('./progress.mjs').AchievementMatchTracker} tracker
 * @param {any} career
 * @param {import('./facts.mjs').AchievementFact} fact
 * @returns {void}
 */
export function reduceFact(tracker, career, fact) {
  // ── Idempotency: skip already-processed facts ──
  if (tracker.processedFactIds.has(fact.factId)) return;
  tracker.processedFactIds.add(fact.factId);

  const p = fact.payload ?? {};
  const isHuman = p.isHuman ?? (fact.actorId === tracker.humanPlayerId);

  switch (fact.kind) {
    // ── Match lifecycle ──
    case FACT_KIND.MATCH_STARTED:
      // No specific tracking needed
      break;

    case FACT_KIND.MATCH_COMPLETED:
      tracker.isTerminal = true;
      tracker.winner = p.winner ?? null;
      tracker.isDraw = p.isDraw ?? false;
      career.gamesCompleted++;
      if (p.isHumanWinner || p.winner === tracker.humanPlayerId) {
        career.gamesWon++;
      }
      break;

    // ── Full Turn lifecycle ──
    case FACT_KIND.FULL_TURN_STARTED:
      // Check if opponent's turn starts while human has anchors
      if (p.playerId !== tracker.humanPlayerId && tracker.humanAnchorsActive.size > 0) {
        // Mark that anchors need to survive this opponent turn
        tracker._anchorSurvivalCheck = {
          turnPlayerId: p.playerId,
          turnSequence: p.fullTurnSequence,
          anchorIds: new Set(tracker.humanAnchorsActive),
        };
      }
      // Reset per-turn counters
      tracker.currentFullTurnPlayerId = p.playerId ?? null;
      tracker.currentFullTurnSequence = p.fullTurnSequence ?? null;
      tracker.effectResolutionsThisFullTurn = 0;
      tracker.pointDeltaThisFullTurn = 0;
      tracker.spadesEffectsThisFullTurn = new Set();
      tracker.sevenInteractionsThisFullTurn = 0;
      tracker.humanDeclarationsThisFullTurn = new Set();
      tracker.counteredHumanDeclarationsThisFullTurn = new Set();
      // Track scores at turn start for Turnabout
      if (p.isHuman) {
        tracker.humanScoreAtFullTurnStart = tracker.humanScore;
      }
      break;

    case FACT_KIND.FULL_TURN_ENDED:
      // Check anchor survival
      if (tracker._anchorSurvivalCheck) {
        const check = tracker._anchorSurvivalCheck;
        // Check if any of the original anchors are still active
        const surviving = [...check.anchorIds].filter(id => tracker.humanAnchorsActive.has(id));
        if (surviving.length > 0) {
          tracker.anchorSurvivedOpponentFullTurn = true;
        }
        tracker._anchorSurvivalCheck = null;
      }
      // Check Turnabout: human started behind and won before turn ends
      // (evaluator handles this at match completion with tracker data)
      break;

    // ── Action declared ──
    case FACT_KIND.CARD_PLAYED_FOR_POINTS:
      if (isHuman) {
        tracker.actionsByMode.points = (tracker.actionsByMode.points ?? 0) + 1;
        if (p.rank) tracker.ranksPlayedForPoints.add(p.rank);
        career.ranksPlayedForPoints.add(p.rank);
      }
      break;

    case FACT_KIND.CARD_PLAYED_FOR_EFFECT:
      if (isHuman) {
        tracker.actionsByMode.effect = (tracker.actionsByMode.effect ?? 0) + 1;
        if (p.rank) tracker.ranksPlayedForEffect.add(p.rank);
        career.ranksPlayedForEffect.add(p.rank);
      }
      break;

    case FACT_KIND.ACTION_DECLARED:
      // Generic action declared — track mode if not already captured
      if (p.mode === 'points' && isHuman) {
        tracker.actionsByMode.points = (tracker.actionsByMode.points ?? 0) + 1;
        if (p.rank) tracker.ranksPlayedForPoints.add(p.rank);
        career.ranksPlayedForPoints.add(p.rank);
      } else if (p.mode === 'effect' && isHuman) {
        tracker.actionsByMode.effect = (tracker.actionsByMode.effect ?? 0) + 1;
        if (p.rank) tracker.ranksPlayedForEffect.add(p.rank);
        career.ranksPlayedForEffect.add(p.rank);
      }
      // Track human declarations for Plan B Was Plan A
      if (isHuman && p.stackItemId) {
        tracker.humanDeclarationsThisFullTurn.add(p.stackItemId);
      }
      break;

    case FACT_KIND.ACTION_RESOLVED:
      // Effect resolution counting
      if (isHuman) {
        tracker.effectResolutionsThisFullTurn++;
      }
      break;

    case FACT_KIND.ACTION_COUNTERED:
      // Track countered human declarations
      if (p.targetId && tracker.humanDeclarationsThisFullTurn.has(p.targetId)) {
        tracker.counteredHumanDeclarationsThisFullTurn.add(p.targetId);
        tracker.humanDeclarationsCountered++;
      }
      // Double Denied: if the countered target was a response by opponent
      // (evaluator checks this via tracker state)
      break;

    case FACT_KIND.ACTION_CANCELED:
      // Fizzled/canceled — no specific tracking
      break;

    // ── Response / Stack ──
    case FACT_KIND.RESPONSE_PLAYED:
      tracker.responsesPlayed++;
      if (isHuman) tracker.humanResponsesPlayed++;
      tracker.currentStackDepth++;
      tracker.responseChainDepth++;
      tracker.maxResponseChainDepth = Math.max(tracker.maxResponseChainDepth, tracker.responseChainDepth);
      tracker.lastResponseWasInterrupt = p.isInterrupt ?? false;
      // Spades counter declarations are mapped to RESPONSE_PLAYED;
      // track spades effect if present in payload
      if (p.spadesEffectId) {
        tracker.spadesEffectsDeclared.add(p.spadesEffectId);
        if (isHuman) {
          tracker.spadesEffectsThisFullTurn.add(p.spadesEffectId);
        }
      }
      break;

    case FACT_KIND.INTERRUPT_PLAYED:
      // Already counted via RESPONSE_PLAYED, but mark interrupt specifically
      tracker.lastResponseWasInterrupt = true;
      break;

    case FACT_KIND.STACK_OBJECT_ADDED:
      tracker.currentStackDepth++;
      tracker.maxStackDepth = Math.max(tracker.maxStackDepth, tracker.currentStackDepth);
      break;

    case FACT_KIND.STACK_OBJECT_REMOVED:
    case FACT_KIND.STACK_RESOLVED:
      if (tracker.currentStackDepth > 0) tracker.currentStackDepth--;
      if (fact.kind === FACT_KIND.STACK_RESOLVED) {
        // Response chain resets when stack fully resolves
        if (tracker.currentStackDepth === 0) {
          tracker.responseChainDepth = 0;
        }
        // Check if last response was interrupt and this is the final resolution
        if (tracker.lastResponseWasInterrupt && tracker.currentStackDepth === 0) {
          tracker.interruptWasFinalResponse = true;
        }
      }
      break;

    // ── Zone interactions ──
    case FACT_KIND.ZONE_INTERACTED:
    case FACT_KIND.CARD_MOVED:
      if (p.zone) {
        tracker.zonesInteractedThisMatch.add(p.zone);
        career.zonesDiscovered.add(p.zone);
      }
      // Track Exile for Gone Forever
      if (p.zone === ZONE.EXILE || p.actualDestination === 'EXILE') {
        if (isHuman) tracker._humanCausedExile = true;
      }
      break;

    // ── Swap ──
    case FACT_KIND.SWAP_USED:
      if (isHuman) {
        tracker.swapUsedCount++;
        if (p.takenCardId) {
          tracker.acquiredFromSwap.add(p.takenCardId);
        }
      }
      break;

    // ── Anchors ──
    case FACT_KIND.ANCHOR_ESTABLISHED:
      if (isHuman && p.sourceCardId) {
        tracker.humanAnchorsActive.add(p.sourceCardId);
      }
      break;

    case FACT_KIND.ANCHOR_REMOVED:
      if (p.sourceCardId) {
        tracker.humanAnchorsActive.delete(p.sourceCardId);
      }
      break;

    // ── Super ──
    case FACT_KIND.SUPER_DECLARED:
      if (isHuman) {
        tracker.superDeclaredCount++;
        career.superDeclarationsTotal++;
      }
      break;

    case FACT_KIND.SUPER_RESOLVED:
      if (isHuman) {
        tracker.superResolvedCount++;
        career.superResolutionsTotal++;
      }
      break;

    // ── Spades ──
    case FACT_KIND.SPADES_EFFECT_DECLARED:
      if (p.spadesEffectId) {
        tracker.spadesEffectsDeclared.add(p.spadesEffectId);
        if (isHuman) {
          tracker.spadesEffectsThisFullTurn.add(p.spadesEffectId);
        }
      }
      break;

    case FACT_KIND.SPADES_EFFECT_RESOLVED:
      if (p.spadesEffectId) {
        tracker.spadesEffectsResolved.add(p.spadesEffectId);
        career.spadesEffectsUsed.add(p.spadesEffectId);
        if (isHuman) {
          tracker.spadesEffectsThisFullTurn.add(p.spadesEffectId);
        }
      }
      break;

    // ── Seven ──
    case FACT_KIND.SEVEN_SCORING_TRIGGER_RESOLVED:
      if (isHuman) {
        tracker.sevenInteractionsThisFullTurn++;
        tracker._sevenScoringTriggerResolved = true;
      }
      break;

    case FACT_KIND.SEVEN_REVEAL_RESOLVED:
      tracker.sevenInteractionsThisFullTurn++;
      if (p.revealedCardId) {
        tracker.sevenRevealCardIds.add(p.revealedCardId);
      }
      // Track generated card IDs for Topdeck Sorcery / Found Money
      if (p.effectCardId) tracker.sevenGeneratedEffectCardIds.add(p.effectCardId);
      if (p.scoreCardId) tracker.sevenGeneratedEffectCardIds.add(p.scoreCardId);
      break;

    case FACT_KIND.GENERATED_PLAY_RESOLVED:
      // Seven-generated play
      if (isHuman) {
        tracker.sevenInteractionsThisFullTurn++;
      }
      // Check for recursive seven: if a generated play produces another seven reveal
      // (evaluator checks this via tracker state)
      break;

    // ── Queen's Court ──
    case FACT_KIND.QUEENS_COURT_ESTABLISHED:
      tracker._queensCourtEstablished = true;
      break;

    // ── State checkpoint ──
    case FACT_KIND.MATCH_STATE_CHECKPOINT: {
      tracker.humanScore = p.humanScore ?? tracker.humanScore;
      tracker.opponentScore = p.opponentScore ?? tracker.opponentScore;
      tracker.humanHandCount = p.humanHandCount ?? tracker.humanHandCount;
      if (p.isTerminal) {
        tracker.isTerminal = true;
        tracker.winner = p.winner ?? tracker.winner;
        tracker.isDraw = p.isDraw ?? tracker.isDraw;
        tracker.stackDepthAtTerminal = p.stackDepth ?? 0;
      }
      // Update max deficit
      const deficit = (p.opponentScore ?? 0) - (p.humanScore ?? 0);
      if (deficit > tracker.maxPointDeficit) {
        tracker.maxPointDeficit = deficit;
      }
      break;
    }

    default:
      // Unknown fact kind — fail closed, no action
      break;
  }
}

/**
 * Apply a batch of facts to the trackers.
 * @param {import('./progress.mjs').AchievementMatchTracker} tracker
 * @param {any} career
 * @param {import('./facts.mjs').AchievementFact[]} facts
 * @returns {void}
 */
export function reduceFacts(tracker, career, facts) {
  for (const fact of facts) {
    reduceFact(tracker, career, fact);
  }
}

/**
 * Create fresh trackers for a new match.
 * @param {string} matchId
 * @param {string} humanPlayerId
 * @returns {{ tracker: import('./progress.mjs').AchievementMatchTracker, career: import('./progress.mjs').CareerTracker }}
 */
export function createTrackers(matchId, humanPlayerId) {
  return {
    tracker: createMatchTracker(matchId, humanPlayerId),
    career: createCareerTracker(),
  };
}
