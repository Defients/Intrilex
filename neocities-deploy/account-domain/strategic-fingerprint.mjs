// ═══════════════════════════════════════════════════════════════
// strategic-fingerprint.mjs — Player strategic fingerprint (pure)
//
// Classifies a player's playstyle from their match statistics.
// Derived from deterministic, final-state view-model facts —
// never from AI chain-of-thought or subjective interpretation.
//
// The fingerprint is a set of playstyle traits with intensity scores
// [0, 1] and human-readable labels. It is computed from:
//   - Win/loss/draw record
//   - Average game length (turns)
//   - IR margin (avg rating change per game)
//   - Draw pile usage (how often games go to deck exhaustion)
//   - Goal progress (how close games end to the goal threshold)
//
// This module is PURE: no I/O, no DB, no UI.
// ═══════════════════════════════════════════════════════════════

/**
 * @readonly
 * @enum {string} Strategic trait type.
 */
export const StrategicTrait = Object.freeze({
  AGGRESSIVE: 'aggressive',    // Short games, high IR margin, wins fast
  DEFENSIVE: 'defensive',      // Long games, low IR margin, grinds out wins
  TEMPO: 'tempo',              // Consistent action pacing, medium games
  CONTROL: 'control',          // Long games, low draw pile usage, methodical
  RESILIENT: 'resilient',      // High draw rate, comeback wins, survives pressure
  PRECISE: 'precise',          // High win rate, low variance, efficient
  GRINDER: 'grinder',          // High game count, persistent, volume player
  FINISHER: 'finisher',        // High goal progress, closes games decisively
});

/**
 * @typedef {Object} PlayerMatchStats
 * @property {number} wins
 * @property {number} losses
 * @property {number} draws
 * @property {number} totalGames
 * @property {number} avgTurns - Average turns per game
 * @property {number} avgIrMargin - Average IR change per game (absolute)
 * @property {number} avgDrawPileRemaining - Average cards left in draw pile at game end
 * @property {number} avgGoalProgress - Average goal progress at game end [0, 1]
 * @property {number} comebackWins - Wins where the player was behind at midpoint
 */

/**
 * @typedef {Object} TraitResult
 * @property {string} type - One of StrategicTrait
 * @property {string} label - Human-readable label
 * @property {string} icon - Emoji icon
 * @property {number} score - Intensity score [0, 1]
 * @property {string} description - What this trait means
 */

/**
 * @typedef {Object} StrategicFingerprint
 * @property {TraitResult[]} traits - Sorted by score descending
 * @property {string} primaryArchetype - The dominant playstyle label
 * @property {string} archetypeIcon - Emoji for the primary archetype
 * @property {string} summary - One-sentence summary
 */

/**
 * Clamp a value to [0, 1].
 * @param {number} v
 * @returns {number}
 */
function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Derive strategic traits from player match statistics.
 * Returns an array of TraitResult, sorted by score descending.
 * Only traits with score >= 0.3 are included (significant traits).
 * @param {PlayerMatchStats} stats
 * @returns {TraitResult[]}
 */
export function deriveStrategicTraits(stats) {
  if (!stats || stats.totalGames === 0) return [];
  const { wins, draws, totalGames, avgTurns, avgIrMargin, avgDrawPileRemaining, avgGoalProgress, comebackWins } = stats;
  const winRate = totalGames > 0 ? wins / totalGames : 0;
  const drawRate = totalGames > 0 ? draws / totalGames : 0;
  const traits = [];

  // Aggressive: short games (low avgTurns), high IR margin
  // avgTurns < 15 → high aggression; > 25 → low
  const aggroScore = clamp01(1 - (avgTurns / 25)) * clamp01(avgIrMargin / 30);
  if (aggroScore >= 0.3) {
    traits.push({
      type: StrategicTrait.AGGRESSIVE,
      label: 'Aggressive',
      icon: '⚔',
      score: aggroScore,
      description: 'Wins quickly with high-impact plays. Short, decisive games.',
    });
  }

  // Defensive: long games (high avgTurns), low IR margin
  const defScore = clamp01((avgTurns - 15) / 20) * clamp01(1 - avgIrMargin / 20);
  if (defScore >= 0.3) {
    traits.push({
      type: StrategicTrait.DEFENSIVE,
      label: 'Defensive',
      icon: '🛡',
      score: defScore,
      description: 'Plays long, methodical games. Wins by attrition and patience.',
    });
  }

  // Tempo: medium games, consistent pacing
  // Score peaks when avgTurns is around 18-22
  const tempoDist = Math.abs(avgTurns - 20) / 10;
  const tempoScore = clamp01(1 - tempoDist);
  if (tempoScore >= 0.3) {
    traits.push({
      type: StrategicTrait.TEMPO,
      label: 'Tempo',
      icon: '🎵',
      score: tempoScore,
      description: 'Consistent pacing. Neither rushes nor stalls — steady pressure.',
    });
  }

  // Control: long games, high draw pile remaining (doesn't exhaust deck)
  const controlScore = clamp01((avgTurns - 18) / 15) * clamp01(avgDrawPileRemaining / 20);
  if (controlScore >= 0.3) {
    traits.push({
      type: StrategicTrait.CONTROL,
      label: 'Control',
      icon: '♟',
      score: controlScore,
      description: 'Methodical and controlling. Long games with cards to spare.',
    });
  }

  // Resilient: high draw rate, comeback wins
  const resilientScore = clamp01(drawRate * 2) * 0.5 + clamp01(comebackWins / Math.max(1, wins)) * 0.5;
  if (resilientScore >= 0.3) {
    traits.push({
      type: StrategicTrait.RESILIENT,
      label: 'Resilient',
      icon: '🔄',
      score: resilientScore,
      description: 'Hard to put away. High draw rate and comeback wins.',
    });
  }

  // Precise: high win rate, low variance (high win rate with many games)
  const preciseScore = clamp01(winRate) * clamp01(totalGames / 20);
  if (preciseScore >= 0.3) {
    traits.push({
      type: StrategicTrait.PRECISE,
      label: 'Precise',
      icon: '🎯',
      score: preciseScore,
      description: 'High win rate with consistent results. Efficient and effective.',
    });
  }

  // Grinder: high game count (volume player)
  const grinderScore = clamp01(totalGames / 50);
  if (grinderScore >= 0.3) {
    traits.push({
      type: StrategicTrait.GRINDER,
      label: 'Grinder',
      icon: '⚙',
      score: grinderScore,
      description: 'Plays a lot of games. Volume and persistence over flash.',
    });
  }

  // Finisher: high goal progress at game end (closes decisively)
  const finisherScore = clamp01(avgGoalProgress);
  if (finisherScore >= 0.3) {
    traits.push({
      type: StrategicTrait.FINISHER,
      label: 'Finisher',
      icon: '🏆',
      score: finisherScore,
      description: 'Closes games decisively. High goal progress when winning.',
    });
  }

  return traits.sort((a, b) => b.score - a.score);
}

/**
 * Derive the primary archetype from a strategic fingerprint.
 * Returns the dominant trait as an archetype label.
 * @param {TraitResult[]} traits
 * @returns {{ archetype: string, icon: string, summary: string }}
 */
export function derivePrimaryArchetype(traits) {
  if (!traits || traits.length === 0) {
    return {
      archetype: 'Unknown',
      icon: '❓',
      summary: 'Not enough match data to classify playstyle.',
    };
  }
  const top = traits[0];
  const second = traits[1];
  const archetypeLabel = second
    ? `${top.label} ${second.label}`
    : top.label;
  const summary = second
    ? `Primarily ${top.label.toLowerCase()} with ${second.label.toLowerCase()} tendencies. ${top.description}`
    : `${top.description}`;
  return {
    archetype: archetypeLabel,
    icon: top.icon,
    summary,
  };
}

/**
 * Build a complete strategic fingerprint from player match stats.
 * @param {PlayerMatchStats} stats
 * @returns {StrategicFingerprint}
 */
export function buildStrategicFingerprint(stats) {
  const traits = deriveStrategicTraits(stats);
  const { archetype, icon, summary } = derivePrimaryArchetype(traits);
  return {
    traits,
    primaryArchetype: archetype,
    archetypeIcon: icon,
    summary,
  };
}
