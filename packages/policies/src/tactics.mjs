// Versioned, deterministic heuristics over the authorized view only. These are
// estimates of public board value, not a hidden-hand oracle or engine lookahead.
const TACTICAL_BASES = Object.freeze({'score-rush-tactical':'score-rush', 'control-tactical':'control', 'tempo-tactical':'tempo', 'value-tactical':'value'});
export const TACTICAL_POLICY_IDS = Object.freeze(Object.keys(TACTICAL_BASES));
export const tacticalBase = id => Object.hasOwn(TACTICAL_BASES,id) ? TACTICAL_BASES[id] : null;
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const rank = card => String(card?.identity ?? '').replace(/[♣♦♥♠]/gu, '');
function contribution(card) {
  if (!card || card.tapped) return 0;
  if (String(card.zone).endsWith('_PR')) return numeric(card.pointValue);
  if (String(card.zone).endsWith('_ER') && rank(card) === 'K') return card.identity.endsWith('♠') ? 9 : 7;
  return 0;
}
const rowPoints = cards => (cards ?? []).reduce((sum, card) => sum + contribution(card), 0);

export function tacticalScore(baseId, action, context, baseScore) {
  const view = context.authorizedView, own = view.own;
  const opponents = view.opponents ?? [], enemy = opponents[0];
  const fv = action.featureVector ?? {}, family = action.family, mode = action.mode ?? '';
  const sources = (action.sourceHandles ?? []).map(id => view.knownCards?.[id]).filter(Boolean);
  const targets = (action.targetHandles ?? []).map(id => view.knownCards?.[id]).filter(Boolean);
  const enemyTargets = targets.filter(card => card.controllerId !== context.actorId);
  const ownTargets = targets.filter(card => card.controllerId === context.actorId);
  const stack = view.stack ?? [], root = stack[0], top = stack.at(-1);
  const spent = sources.length, cost = sources.reduce((sum, card) => sum + numeric(card.pointValue), 0);
  const enemyPoints = enemy?.securedPoints ?? 0, enemyGap = (enemy?.goal ?? Infinity) - enemyPoints;
  // Public proximity is a risk signal. It does not assert what is in a hand.
  const pressure = enemy && (enemyGap <= 0 || (enemy.handCount > 0 && enemyGap <= 11)) ? 1 : 0;
  const terminal = gain => gain > 0 && own.securedPoints + gain >= own.goal;
  let gain = numeric(fv.immediateScore ?? fv.immediatePoints), removed = 0, ownLoss = 0;

  if (family === 'response-decline') return top?.controllerId === context.actorId ? 9000 : 900;
  if (fv.counter === true || family === 'counter' || family === 'disrupt') {
    // Counter the hostile top, including a response to our own root; never
    // attack our own top just because an opponent owns the bottom of the stack.
    if (!top || top.controllerId === context.actorId) return -5000;
    const defendingRoot = root?.controllerId === context.actorId;
    const threatenedOwnCards = (root?.targetCardIds ?? []).some(id => view.knownCards?.[id]?.controllerId === context.actorId);
    const pointsRoot = root?.actionType === 'play-for-points';
    const urgent = defendingRoot || threatenedOwnCards || (pressure && pointsRoot);
    const materialRoot = root?.actionType === 'play-for-effect' && root.stackClass !== 'anchor';
    const benefit = urgent ? 3600 : materialRoot ? 1400 : 700;
    const premium = /super|three-red|spade/.test(mode) ? 180 : 0;
    return benefit - spent * 180 - cost * 8 - premium;
  }

  if (family === 'scuttle' || fv.scuttle || fv.absoluteScuttle || fv.tap || family === 'effect-three' || family === 'effect-bounce' || family === 'effect-tap') {
    removed = rowPoints(enemyTargets);
    ownLoss = rowPoints(ownTargets);
  }
  if (family === 'attachment' || family === 'effect-jack-control' || fv.controlChange) {
    removed = rowPoints(enemyTargets);
    if (fv.disposition !== 'hold' && !fv.holdChild) gain = Math.max(gain, removed + (mode === 'jack-pr' ? 1 : 0));
  }
  const copied = action.composition?.effect;
  const clearRow = family === 'effect-four' && mode.startsWith('clear-') ? mode.slice(6)
    : copied === 'four-row-clear' || fv.copiedFamily === 'row-clear' ? action.composition?.row ?? fv.row : null;
  if (clearRow) {
    // Aegis protects against row clears. Guard is a single-target protection.
    const affected = opponents.flatMap(p => (p[clearRow] ?? []).filter(card => !card.aegis));
    removed = rowPoints(affected);
    // Control's large generic effect bonus must not reward an empty clear.
    // Zero-point guards/counter anchors still have value when actually hit.
    if (baseId === 'control' && affected.length === 0) baseScore -= 1200;
  }
  const totalClear = (family === 'effect-four' && mode === 'total-clear') || copied === 'total-clear';
  if (totalClear) {
    removed = opponents.reduce((sum, p) => sum + numeric(p.securedPoints), 0);
    ownLoss = own.securedPoints;
  }
  if (mode.includes('exchange') && ['pr', 'er'].includes(fv.row)) {
    const enemyRow = rowPoints(enemy?.[fv.row]), ownRow = rowPoints(own[fv.row]);
    gain = enemyRow - ownRow;
    removed = enemyRow - ownRow;
  }
  if (family === 'anchor' || family === 'royal-marriage') gain = Math.max(gain, numeric(fv.anchorValue));
  if (fv.goalShift || family === 'effect-goal-shift') {
    removed = numeric(fv.delta ?? fv.goalDelta);
    gain = Math.max(0, -numeric(fv.ownGoalDelta));
  }
  if (terminal(gain) && !ownLoss) return 10000 + gain * 34 - spent * 12;

  let score = baseScore;
  if (removed || ownLoss || gain) {
    score += (removed - ownLoss) * 55;
    if (pressure && removed > ownLoss) score += 550 + Math.min(removed - ownLoss, 11) * 25;
    if (!['score', 'play-for-points'].includes(family)) score += gain * 65;
    if (own.securedPoints >= own.goal && ownLoss > gain) score -= 7000;
  }
  // A generic combo bonus should not pay for needless multi-card expenditure.
  if (spent > 1) score -= (spent - 1) * (baseId === 'value' ? 220 : 160) + cost * 7;
  if (family === 'effect-three' && ownTargets.length) score -= 900;
  if (family === 'draw' && own.hand.length === 0) score += 180;
  if (family === 'quick' && fv.aegis && own.pr.length === 0 && own.er.length === 0) score -= 1200;
  return score;
}
