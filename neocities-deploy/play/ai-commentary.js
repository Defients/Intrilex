// ═══════════════════════════════════════════════════════════════
// ai-commentary.js — Tactical commentary and post-match analysis
//
// Deterministic commentary engine that generates board-state observations,
// threat warnings, and post-match analysis. No RNG — same state always
// produces the same commentary. Gated by guidance mode.
// ═══════════════════════════════════════════════════════════════

/**
 * Generate tactical commentary from a view model.
 * @param {object} viewModel - RankedDuelViewModel from ranked-duel-viewmodel.mjs
 * @param {object} opts - { guidanceMode, archetype, turnCount }
 * @returns {string|null} Commentary text, or null if no commentary applies
 */
export function generateCommentary(viewModel, opts = {}) {
  if (!viewModel || viewModel.status === 'ERROR') return null;
  const mode = opts.guidanceMode ?? 'GUIDED';
  if (mode === 'OFF') return null;

  const observations = [];

  // ── Board assessment: Effect Row control ──
  const opponentER = viewModel.battlefield?.topER?.length > 0
    ? viewModel.battlefield.topER
    : viewModel.battlefield?.bottomER ?? [];
  // Determine which ER is the opponent's
  const humanSeat = viewModel.battlefield?.humanSeatIndex ?? 0;
  const opponentEffectRow = humanSeat === 0
    ? (viewModel.battlefield?.topER ?? [])
    : (viewModel.battlefield?.bottomER ?? []);

  if (opponentEffectRow.length >= 3) {
    observations.push(`Your opponent controls ${opponentEffectRow.length} Effect Row cards — watch for combo setups.`);
  }

  // ── Resource comment: hand size ──
  const handCount = viewModel.battlefield?.humanHand?.length ?? 0;
  if (handCount <= 2 && handCount > 0) {
    observations.push(`You're down to ${handCount} card${handCount === 1 ? '' : 's'} in hand. Make them count.`);
  }
  if (handCount === 0) {
    observations.push('No cards in hand — you\'ll need to rely on your board.');
  }

  // ── Score pressure ──
  const humanScore = viewModel.human?.secured ?? 0;
  const opponentScore = viewModel.opponent?.secured ?? 0;
  const goal = viewModel.human?.goal ?? 21;
  const scoreDiff = opponentScore - humanScore;

  if (scoreDiff >= 10) {
    observations.push(`You're trailing by ${scoreDiff} points. Time for aggressive plays.`);
  } else if (scoreDiff >= 5 && opponentScore >= goal * 0.6) {
    observations.push(`Opponent is at ${opponentScore}/${goal}. They're in striking range.`);
  } else if (humanScore >= goal * 0.8 && humanScore > opponentScore) {
    observations.push(`You're at ${humanScore}/${goal}. One good play could clinch it.`);
  }

  // ── Close game ──
  if (Math.abs(scoreDiff) <= 3 && humanScore >= goal * 0.5 && opponentScore >= goal * 0.5) {
    observations.push('This is a close game — every decision matters.');
  }

  // ── Threat warning: untapped cards on opponent board ──
  const opponentPR = humanSeat === 0
    ? (viewModel.battlefield?.topPR ?? [])
    : (viewModel.battlefield?.bottomPR ?? []);

  const untappedCards = opponentPR.filter(c => c && !c.statusMarkers?.some(m => m.type === 'TAPPED'));
  const hasQueen = untappedCards.some(c => c && c.rank === 'Q');
  const hasAce = untappedCards.some(c => c && c.rank === 'A');
  const hasKing = untappedCards.some(c => c && c.rank === 'K');

  if (hasQueen && mode !== 'ESSENTIAL') {
    observations.push('They have an untapped Queen — Royal Marriage could be incoming.');
  }
  if (hasAce && mode !== 'ESSENTIAL') {
    observations.push('They have an untapped Ace — your Super is at risk of being countered.');
  }
  if (hasKing && mode === 'DETAILED') {
    observations.push('They have an untapped King — Wild Sovereignty activations are possible.');
  }

  // ── Tempo observation ──
  const turnCount = opts.turnCount ?? viewModel.match?.fullTurnSequence ?? 0;
  if (turnCount > 0 && turnCount % 6 === 0 && scoreDiff === 0 && opponentPR.length === 0) {
    observations.push(`${turnCount} turns without scoring — the board is stalling.`);
  }

  // ── Swap bar awareness ──
  const swapSlots = viewModel.zones?.swap ?? [];
  const faceUpSwaps = swapSlots.filter(s => s && !s.faceDown && s.card);
  if (faceUpSwaps.length >= 2 && mode === 'DETAILED') {
    observations.push(`${faceUpSwaps.length} face-up cards in the swap bar — consider your options.`);
  }

  // ── Stack activity ──
  const stack = viewModel.stack ?? [];
  if (stack.length >= 2) {
    observations.push(`The stack has ${stack.length} items — resolution order matters.`);
  }

  // Filter by guidance mode
  if (mode === 'ESSENTIAL') {
    // Only resource and score pressure
    return observations.filter(o => o.includes('trailing') || o.includes('striking') || o.includes('clinch') || o.includes('close game') || o.includes('No cards in hand')).join(' ') || null;
  }

  return observations.length > 0 ? observations.join(' ') : null;
}

/**
 * Generate a post-match analysis paragraph.
 * @param {object} terminalSnapshot - Final match state
 * @param {object} humanStats - { securedPoints, supersDeclared, cardsPlayed, decisions }
 * @param {object} opponentStats - { securedPoints, supersDeclared, cardsPlayed }
 * @param {string} archetype - AI archetype name
 * @returns {string} Analysis paragraph
 */
export function generatePostMatchAnalysis(terminalSnapshot, humanStats, opponentStats, archetype) {
  if (!humanStats) return '';

  const parts = [];

  // Personality-flavored intro
  const intros = {
    rusher: 'That was a fast-paced match.',
    defender: 'A methodical contest of patience.',
    trickster: 'A match full of misdirection and surprises.',
    sniper: 'A precision battle of targeted plays.',
    support: 'A tactical exchange of utility and control.',
    tank: 'A grinding endurance match.',
    baseline: 'A balanced match.',
  };
  parts.push(intros[archetype] ?? intros.baseline);

  // Key turning point
  const humanScore = humanStats.securedPoints ?? 0;
  const opponentScore = opponentStats?.securedPoints ?? 0;
  const scoreMargin = Math.abs(humanScore - opponentScore);

  if (scoreMargin <= 3) {
    parts.push('The match came down to the wire — a single decision could have swung the result.');
  } else if (scoreMargin >= 10) {
    parts.push(`The ${scoreMargin}-point margin reflects a decisive advantage in resource efficiency.`);
  } else {
    parts.push('The score difference reflects a moderate edge in board control.');
  }

  // Super usage
  const supers = humanStats.supersDeclared ?? 0;
  if (supers === 0) {
    parts.push('You didn\'t declare any Supers this match — consider opportunities for high-impact plays.');
  } else if (supers === 1) {
    parts.push('Your single Super declaration was a key moment.');
  } else {
    parts.push(`You declared ${supers} Supers, showing aggressive use of your strongest effects.`);
  }

  // Counter play
  if (opponentStats?.supersDeclared > 0 && humanStats.supersDeclared > 0) {
    parts.push('Both players committed Supers, making counter play a decisive factor.');
  } else if (opponentStats?.supersDeclared > 0) {
    parts.push('Your opponent committed Supers — you may want to hold counter resources in future matches.');
  }

  // Tempo
  const decisions = humanStats.decisions ?? 0;
  if (decisions > 0 && decisions < 15) {
    parts.push('The match was short and decisive.');
  } else if (decisions > 30) {
    parts.push('The match went long, testing endurance and resource management.');
  }

  // Conclusion
  const outcome = humanScore > opponentScore ? 'victory' : humanScore < opponentScore ? 'defeat' : 'draw';
  if (outcome === 'victory') {
    parts.push('A well-earned victory.');
  } else if (outcome === 'defeat') {
    parts.push('Review the key moments to find improvement opportunities.');
  } else {
    parts.push('A balanced result that could go either way next time.');
  }

  return parts.join(' ');
}

/**
 * Get commentary frequency based on guidance mode.
 * Returns how many turns to skip between commentary triggers.
 */
export function commentaryInterval(guidanceMode) {
  switch (guidanceMode) {
    case 'OFF': return Infinity;
    case 'ESSENTIAL': return 6;
    case 'GUIDED': return 3;
    case 'DETAILED': return 1;
    default: return 3;
  }
}
