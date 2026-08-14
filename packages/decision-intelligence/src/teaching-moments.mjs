// ═══════════════════════════════════════════════════════════════
// teaching-moments.mjs — L3: Post-match teaching moments
//
// Pure functions that generate a teaching insight from match data.
// These are NOT LLM-generated — they are deterministic, rule-based
// insights derived from the match view model.
//
// Teaching moments are designed to be:
//   - Deterministic (same match → same insight)
//   - Non-judgmental (inform, don't shame)
//   - Actionable (suggest what to try next time)
//   - Short (one sentence + one tip)
// ═══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} MatchViewModel
 * @property {object} match - Match metadata (terminationReason, fullTurnSequence, winner)
 * @property {object} human - Human player stats (secured, goal, cardsDrawn, cardsPlayed, passes)
 * @property {object} opponent - Opponent stats
 * @property {object} zones - Final zone state (drawPile, discard, etc.)
 */

/**
 * @typedef {Object} TeachingMoment
 * @property {string} title - Short title for the insight
 * @property {string} insight - One-sentence observation
 * @property {string} tip - Actionable suggestion for next time
 * @property {string} category - Category: 'tempo', 'defense', 'efficiency', 'positioning'
 */

/**
 * Generate a teaching moment from a match view model.
 * Picks the most relevant insight based on match statistics.
 * @param {MatchViewModel} vm - The match view model
 * @returns {TeachingMoment|null}
 */
export function generateTeachingMoment(vm) {
  if (!vm || !vm.match) return null;

  const moments = [
    checkEarlyTermination(vm),
    checkIRMargin(vm),
    checkDrawEfficiency(vm),
    checkPassFrequency(vm),
    checkGoalProgress(vm),
  ].filter(Boolean);

  if (moments.length === 0) return null;

  // Pick the most relevant moment (first non-null)
  return moments[0];
}

/**
 * Check for early termination (short game).
 */
function checkEarlyTermination(vm) {
  const turns = vm.match.fullTurnSequence ?? 0;
  const human = vm.human ?? {};
  const opponent = vm.opponent ?? {};
  const humanSecured = human.secured ?? 0;
  const oppSecured = opponent.secured ?? 0;

  if (turns <= 6 && humanSecured < oppSecured) {
    return {
      title: 'Early Pressure',
      insight: `The match ended in only ${turns} turns — the opponent secured an early lead.`,
      tip: 'In short games, responding to early threats is critical. Consider blocking or countering sooner.',
      category: 'tempo',
    };
  }
  return null;
}

/**
 * Check for large IR margin (blowout).
 */
function checkIRMargin(vm) {
  const human = vm.human ?? {};
  const opponent = vm.opponent ?? {};
  const humanIR = human.secured ?? 0;
  const oppIR = opponent.secured ?? 0;
  const margin = humanIR - oppIR;

  if (margin < -8) {
    return {
      title: 'Margin Analysis',
      insight: `You trailed by ${Math.abs(margin)} IR at game end — a significant gap.`,
      tip: 'Large margins often indicate a positioning disadvantage. Review the midgame to find where the gap widened.',
      category: 'positioning',
    };
  }
  if (margin > 8) {
    return {
      title: 'Dominant Performance',
      insight: `You won by ${margin} IR — a commanding margin.`,
      tip: 'Analyze what worked: which cards created the advantage? Look for patterns to replicate.',
      category: 'tempo',
    };
  }
  return null;
}

/**
 * Check draw efficiency (cards drawn vs. cards played).
 */
function checkDrawEfficiency(vm) {
  const human = vm.human ?? {};
  const cardsDrawn = human.cardsDrawn ?? 0;
  const cardsPlayed = human.cardsPlayed ?? 0;
  const zones = vm.zones ?? {};
  const drawRemaining = zones.drawPile?.count ?? zones.drawPile?.length ?? 0;

  if (drawRemaining === 0 && cardsDrawn > 0) {
    return {
      title: 'Deck Exhaustion',
      insight: 'You drew through your entire deck — every card was available.',
      tip: 'When the deck is empty, hand management becomes critical. Did you hold cards too long or play them too freely?',
      category: 'efficiency',
    };
  }
  return null;
}

/**
 * Check pass frequency (passing too often = missed opportunities).
 */
function checkPassFrequency(vm) {
  const human = vm.human ?? {};
  const passes = human.passes ?? 0;
  const turns = vm.match.fullTurnSequence ?? 0;

  if (passes > 3 && turns > 0) {
    const passRate = passes / turns;
    if (passRate > 0.3) {
      return {
        title: 'Pass Frequency',
        insight: `You passed ${passes} times in ${turns} turns (${Math.round(passRate * 100)}% of turns).`,
        tip: 'Frequent passing cedes tempo. Consider whether some passes could have been actions — even a defensive play maintains pressure.',
        category: 'tempo',
      };
    }
  }
  return null;
}

/**
 * Check goal progress (close to winning but lost).
 */
function checkGoalProgress(vm) {
  const human = vm.human ?? {};
  const opponent = vm.opponent ?? {};
  const humanIR = human.secured ?? 0;
  const humanGoal = human.goal ?? 21;
  const humanPct = humanGoal > 0 ? humanIR / humanGoal : 0;
  const winner = vm.match.winner;
  const humanId = vm.human?.playerId;

  if (humanPct >= 0.8 && winner !== humanId && winner !== null) {
    return {
      title: 'So Close',
      insight: `You reached ${humanIR}/${humanGoal} IR (${Math.round(humanPct * 100)}% of goal) but couldn't close it out.`,
      tip: 'Endgame positioning matters. When close to goal, prioritize defense — the opponent needs fewer points to catch up.',
      category: 'defense',
    };
  }
  return null;
}

/**
 * Generate a beginner-trap diagnostic from match data.
 * L7: Player-facing tips derived from common beginner mistakes.
 * @param {MatchViewModel} vm - The match view model
 * @returns {TeachingMoment|null}
 */
export function generateBeginnerTrapTip(vm) {
  if (!vm || !vm.match) return null;

  const traps = [
    checkExcessivePassing(vm),
    checkLowCardUsage(vm),
    checkEarlyGameOverwhelm(vm),
    checkNoResponse(vm),
  ].filter(Boolean);

  if (traps.length === 0) return null;
  return traps[0];
}

function checkExcessivePassing(vm) {
  const human = vm.human ?? {};
  const passes = human.passes ?? 0;
  if (passes >= 4) {
    return {
      title: 'Beginner Trap: Passing Too Much',
      insight: `You passed ${passes} times. Passing gives your opponent free tempo.`,
      tip: 'Try to play a card instead of passing, even if it\'s a defensive move. Every pass is a missed opportunity.',
      category: 'tempo',
    };
  }
  return null;
}

function checkLowCardUsage(vm) {
  const human = vm.human ?? {};
  const cardsPlayed = human.cardsPlayed ?? 0;
  const turns = vm.match.fullTurnSequence ?? 0;
  if (turns > 8 && cardsPlayed < turns * 0.5) {
    return {
      title: 'Beginner Trap: Underutilizing Cards',
      insight: `You played only ${cardsPlayed} cards in ${turns} turns. Your hand is your main resource.`,
      tip: 'Holding cards too long means missing opportunities. Look for moments to play cards that advance your position.',
      category: 'efficiency',
    };
  }
  return null;
}

function checkEarlyGameOverwhelm(vm) {
  const human = vm.human ?? {};
  const opponent = vm.opponent ?? {};
  const humanIR = human.secured ?? 0;
  const oppIR = opponent.secured ?? 0;
  const turns = vm.match.fullTurnSequence ?? 0;

  if (turns <= 5 && oppIR - humanIR >= 5) {
    return {
      title: 'Beginner Trap: Slow Start',
      insight: `The opponent built a ${oppIR - humanIR} IR lead in only ${turns} turns.`,
      tip: 'In the opening turns, focus on establishing board presence. Don\'t wait to see what the opponent does — act first.',
      category: 'tempo',
    };
  }
  return null;
}

function checkNoResponse(vm) {
  const human = vm.human ?? {};
  const counters = human.counters ?? 0;
  const opponent = vm.opponent ?? {};
  const oppCardsPlayed = opponent.cardsPlayed ?? 0;

  if (oppCardsPlayed > 5 && counters === 0) {
    return {
      title: 'Beginner Trap: Not Countering',
      insight: 'You didn\'t counter any of your opponent\'s plays.',
      tip: 'Countering is a key defensive tool. When the opponent plays a high-value card, a counter can negate their tempo.',
      category: 'defense',
    };
  }
  return null;
}

/**
 * Render a teaching moment as HTML for the terminal screen.
 * @param {TeachingMoment} moment
 * @returns {string}
 */
export function renderTeachingMoment(moment) {
  if (!moment) return '';
  return `<div class="teaching-moment" data-testid="teaching-moment" data-category="${moment.category}">
    <h3 class="teaching-moment-title">💡 ${moment.title}</h3>
    <p class="teaching-moment-insight">${moment.insight}</p>
    <p class="teaching-moment-tip" data-testid="teaching-moment-tip">${moment.tip}</p>
  </div>`;
}
