// ═══════════════════════════════════════════════════════════════
// trace-teaching.mjs — Trace-based post-match explanations
//
// Uses the forensic replay infrastructure to generate deeper
// teaching insights that reference actual game state, alternatives,
// and consequences. This is the intelligence/teaching layer that
// sits on top of the forensic model — it does NOT duplicate the
// forensic model, it consumes it.
//
// Key difference from teaching-moments.mjs:
//   - teaching-moments.mjs: high-level stats (IR margin, pass rate)
//   - trace-teaching.mjs: frame-level analysis (specific turns,
//     specific state transitions, specific alternatives)
//
// All functions are pure — no DOM, no persistence, no side effects.
// ═══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} TraceInsight
 * @property {string} id - Stable insight identifier
 * @property {string} category - 'tempo' | 'defense' | 'efficiency' | 'positioning' | 'pivotal'
 * @property {number} frameIndex - The frame where this insight applies
 * @property {string} title - Short title
 * @property {string} observation - What happened (factual, non-judgmental)
 * @property {string} alternative - What could have happened instead
 * @property {string} consequence - What actually resulted
 * @property {string} lesson - The teaching takeaway
 * @property {string} [bookmarkLabel] - Suggested bookmark label for this frame
 */

/**
 * Analyze a certified replay's frames and generate trace-based insights.
 * Each insight references a specific frame and explains what happened,
 * what could have happened, and what the consequence was.
 *
 * @param {object} certifiedReplay - Replay with initialState, commands, frames
 * @param {{ perspectivePlayerId?: string }} [opts]
 * @returns {TraceInsight[]}
 */
export function generateTraceInsights(certifiedReplay, opts = {}) {
  if (!certifiedReplay?.frames?.length) return [];
  const perspective = opts.perspectivePlayerId ?? 'P1';
  const frames = certifiedReplay.frames;
  const insights = [];

  // 1. Pivotal turns — frames where the IR margin shifted significantly
  insights.push(...findPivotalTurns(frames, perspective));

  // 2. Tempo losses — frames where a player passed or played defensively
  //    when they had a tempo advantage
  insights.push(...findTempoLosses(frames, perspective));

  // 3. Efficiency gaps — frames where draw pile management mattered
  insights.push(...findEfficiencyGaps(frames, perspective));

  // 4. Defensive missed opportunities — frames where a counter was available
  //    but not played
  insights.push(...findMissedCounters(frames, perspective));

  // Sort by frame index, then by category
  return insights.sort((a, b) => a.frameIndex - b.frameIndex);
}

/**
 * Find pivotal turns where the IR margin shifted by 3+ points.
 * @param {object[]} frames
 * @param {string} perspective
 * @returns {TraceInsight[]}
 */
function findPivotalTurns(frames, perspective) {
  const insights = [];
  const opponent = perspective === 'P1' ? 'P2' : 'P1';

  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1]?.state;
    const curr = frames[i]?.state;
    if (!prev || !curr) continue;

    const prevMargin = getIRMargin(prev, perspective);
    const currMargin = getIRMargin(curr, perspective);
    const shift = currMargin - prevMargin;

    if (Math.abs(shift) >= 3) {
      const isPositive = shift > 0;
      const command = frames[i]?.command;
      const actionKind = command?.action?.kind ?? command?.type ?? 'unknown';
      const turn = curr.turn ?? i;

      insights.push({
        id: `pivotal-${i}`,
        category: 'pivotal',
        frameIndex: i,
        title: isPositive ? `Pivotal gain (+${shift} IR)` : `Pivotal loss (${shift} IR)`,
        observation: `At turn ${turn}, the ${actionKind} action shifted the IR margin by ${shift > 0 ? '+' : ''}${shift} points.`,
        alternative: isPositive
          ? 'This was a strong play. Consider bookmarking it to study the setup that enabled it.'
          : 'A different action here might have preserved the margin. Consider exploring an alternate line from this frame.',
        consequence: `The margin went from ${prevMargin > 0 ? '+' : ''}${prevMargin} to ${currMargin > 0 ? '+' : ''}${currMargin} IR.`,
        lesson: isPositive
          ? 'Recognizing and capitalizing on pivotal moments is a core skill. This frame shows a decisive play.'
          : 'Pivotal losses often come from underestimating the opponent\'s response. Review this frame to identify the misread.',
        bookmarkLabel: isPositive ? `Pivotal gain (F${i}, +${shift})` : `Pivotal loss (F${i}, ${shift})`,
      });
    }
  }

  return insights;
}

/**
 * Find tempo losses — frames where a pass occurred despite having cards in hand.
 * @param {object[]} frames
 * @param {string} perspective
 * @returns {TraceInsight[]}
 */
function findTempoLosses(frames, perspective) {
  const insights = [];

  for (let i = 1; i < frames.length; i++) {
    const frame = frames[i];
    const command = frame?.command;
    if (!command) continue;

    const actionKind = String(command?.action?.kind ?? command?.type ?? '').toLowerCase();
    if (actionKind !== 'pass' && actionKind !== 'end_turn') continue;

    const state = frame?.state;
    if (!state) continue;

    const player = state?.players?.[perspective];
    if (!player) continue;

    const handCount = player.hand?.length ?? 0;
    if (handCount === 0) continue; // Passing with empty hand is forced

    const turn = state.turn ?? i;
    insights.push({
      id: `tempo-${i}`,
      category: 'tempo',
      frameIndex: i,
      title: `Tempo pass with ${handCount} card${handCount !== 1 ? 's' : ''} in hand`,
      observation: `At turn ${turn}, a pass was played while holding ${handCount} card${handCount !== 1 ? 's' : ''}.`,
      alternative: `With cards available, consider whether a defensive play or counter would have preserved tempo better than passing.`,
      consequence: `Passing cedes the initiative. The opponent gained a free turn to develop their position.`,
      lesson: 'Passing with cards in hand is sometimes correct (waiting for a better moment), but frequent passes while holding cards often indicate missed opportunities.',
      bookmarkLabel: `Tempo pass (F${i}, ${handCount} cards)`,
    });
  }

  return insights;
}

/**
 * Find efficiency gaps — frames where draw pile management was critical.
 * @param {object[]} frames
 * @param {string} perspective
 * @returns {TraceInsight[]}
 */
function findEfficiencyGaps(frames, perspective) {
  const insights = [];

  for (let i = 1; i < frames.length; i++) {
    const state = frames[i]?.state;
    if (!state) continue;

    const drawPile = state?.drawPile;
    const drawCount = Array.isArray(drawPile) ? drawPile.length : (drawPile?.count ?? 0);
    if (drawCount !== 0) continue;

    // Draw pile is empty — check if this is the first frame where it happened
    const prevState = frames[i - 1]?.state;
    const prevDraw = prevState?.drawPile;
    const prevDrawCount = Array.isArray(prevDraw) ? prevDraw.length : (prevDraw?.count ?? 0);
    if (prevDrawCount === 0) continue; // Already empty in previous frame

    const player = state?.players?.[perspective];
    const handCount = player?.hand?.length ?? 0;
    const turn = state.turn ?? i;

    insights.push({
      id: `efficiency-${i}`,
      category: 'efficiency',
      frameIndex: i,
      title: `Deck exhausted with ${handCount} card${handCount !== 1 ? 's' : ''} in hand`,
      observation: `At turn ${turn}, the draw pile ran out. You have ${handCount} card${handCount !== 1 ? 's' : ''} remaining in hand.`,
      alternative: 'When the deck is nearly empty, plan to conserve high-value cards for critical moments rather than spending them early.',
      consequence: 'With no more draws available, every remaining card is precious. Hand management becomes the deciding factor.',
      lesson: 'Deck exhaustion is a natural inflection point. Players who reach it with a well-managed hand have a significant advantage.',
      bookmarkLabel: `Deck exhausted (F${i}, ${handCount} in hand)`,
    });
  }

  return insights;
}

/**
 * Find missed counters — frames where the opponent scored but a counter
 * might have been available. This is a heuristic analysis.
 * @param {object[]} frames
 * @param {string} perspective
 * @returns {TraceInsight[]}
 */
function findMissedCounters(frames, perspective) {
  const insights = [];
  const opponent = perspective === 'P1' ? 'P2' : 'P1';

  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1]?.state;
    const curr = frames[i]?.state;
    if (!prev || !curr) continue;

    const prevOppScore = getIRScore(prev, opponent);
    const currOppScore = getIRScore(curr, opponent);
    const scoreGain = currOppScore - prevOppScore;

    if (scoreGain < 2) continue; // Only flag significant scoring

    const command = frames[i]?.command;
    const actorId = command?.actorId ?? command?.playerId ?? '';
    // Only analyze if the opponent scored (not if perspective player scored)
    if (actorId !== opponent && actorId !== `Player${opponent}`) continue;

    const playerHandCount = prev?.players?.[perspective]?.hand?.length ?? 0;
    if (playerHandCount === 0) continue; // No cards to counter with

    const turn = curr.turn ?? i;
    insights.push({
      id: `counter-${i}`,
      category: 'defense',
      frameIndex: i - 1, // The decision point was the frame BEFORE the score
      title: `Opponent scored ${scoreGain} IR — counter opportunity?`,
      observation: `At turn ${turn}, the opponent gained ${scoreGain} IR. You had ${playerHandCount} card${playerHandCount !== 1 ? 's' : ''} in hand at the prior frame.`,
      alternative: 'Review the prior frame to see if a counter, block, or disruption play was available. Even delaying the opponent by one turn can change the outcome.',
      consequence: `The opponent's score went from ${prevOppScore} to ${currOppScore} IR.`,
      lesson: 'Defensive awareness is as important as offensive planning. When the opponent scores heavily, check whether the prior frame offered a counter.',
      bookmarkLabel: `Counter opportunity (F${i - 1}, -${scoreGain})`,
    });
  }

  return insights;
}

/**
 * Get the IR margin for a player at a given state.
 * @param {object} state
 * @param {string} playerId
 * @returns {number}
 */
function getIRMargin(state, playerId) {
  const opponent = playerId === 'P1' ? 'P2' : 'P1';
  return getIRScore(state, playerId) - getIRScore(state, opponent);
}

/**
 * Get the IR score (secured points) for a player at a given state.
 * @param {object} state
 * @param {string} playerId
 * @returns {number}
 */
function getIRScore(state, playerId) {
  const player = state?.players?.[playerId];
  if (!player) return 0;
  // Try common field names: secured, points, score, ir
  return player.secured ?? player.points ?? player.score ?? player.ir ?? 0;
}

/**
 * Generate a guided replay commentary script from trace insights.
 * This produces a sequence of commentary points that can be displayed
 * as the user scrubs through a replay.
 *
 * @param {object} certifiedReplay
 * @param {{ perspectivePlayerId?: string }} [opts]
 * @returns {{ frameIndex: number, commentary: string, category: string }[]}
 */
export function generateReplayCommentary(certifiedReplay, opts = {}) {
  const insights = generateTraceInsights(certifiedReplay, opts);
  return insights.map(insight => ({
    frameIndex: insight.frameIndex,
    commentary: `${insight.title}: ${insight.observation} ${insight.lesson}`,
    category: insight.category,
  }));
}

/**
 * Recommend a practice puzzle from a trace insight.
 * Given an insight and a certified replay, suggest a puzzle configuration
 * that would let the player practice the relevant skill.
 *
 * @param {TraceInsight} insight
 * @param {object} certifiedReplay
 * @returns {{ frameIndex: number, objectiveType: string, reason: string } | null}
 */
export function recommendPracticeFromInsight(insight, certifiedReplay) {
  if (!insight || !certifiedReplay) return null;

  const objectiveMap = {
    tempo: 'WIN_WITHIN_TURNS',
    defense: 'SURVIVE_TURNS',
    efficiency: 'WIN_THIS_TURN',
    positioning: 'WIN_WITHIN_TURNS',
    pivotal: 'WIN_THIS_TURN',
  };

  const objectiveType = objectiveMap[insight.category] ?? 'WIN_WITHIN_TURNS';

  return {
    frameIndex: insight.frameIndex,
    objectiveType,
    reason: `Practice ${insight.category}: ${insight.lesson}`,
  };
}

/**
 * Format a trace insight as an HTML string for rendering.
 * Uses the same escaping pattern as the forensic viewer.
 * @param {TraceInsight} insight
 * @returns {string}
 */
export function renderTraceInsight(insight) {
  if (!insight) return '';
  const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return `<div class="trace-insight" data-testid="trace-insight" data-category="${esc(insight.category)}" data-frame="${insight.frameIndex}">
    <div class="trace-insight-header">
      <span class="trace-insight-category" data-testid="trace-insight-category">${esc(insight.category)}</span>
      <span class="trace-insight-frame">Frame ${insight.frameIndex}</span>
    </div>
    <h4 class="trace-insight-title">${esc(insight.title)}</h4>
    <p class="trace-insight-observation">${esc(insight.observation)}</p>
    <p class="trace-insight-alternative"><strong>Alternative:</strong> ${esc(insight.alternative)}</p>
    <p class="trace-insight-consequence"><strong>Result:</strong> ${esc(insight.consequence)}</p>
    <p class="trace-insight-lesson">${esc(insight.lesson)}</p>
    ${insight.bookmarkLabel ? `<button class="trace-insight-bookmark" data-forensic-action="add-bookmark-from-insight" data-frame="${insight.frameIndex}" data-label="${esc(insight.bookmarkLabel)}" data-testid="trace-insight-bookmark">Bookmark this frame</button>` : ''}
    <button class="trace-insight-practice" data-forensic-action="practice-from-insight" data-frame="${insight.frameIndex}" data-category="${esc(insight.category)}" data-testid="trace-insight-practice">Practice this position</button>
  </div>`;
}

/**
 * Format multiple trace insights as an HTML list.
 * @param {TraceInsight[]} insights
 * @returns {string}
 */
export function renderTraceInsights(insights) {
  if (!insights || insights.length === 0) {
    return '<div class="trace-insights-empty" data-testid="trace-insights-empty">No trace insights generated for this replay.</div>';
  }
  return `<div class="trace-insights" data-testid="trace-insights">${insights.map(renderTraceInsight).join('')}</div>`;
}
