import { evaluateAction, privateChoiceScore, number, boardPoints } from './action-evaluation.mjs';

// Deterministic estimates over authorized information, not engine lookahead.
const TACTICAL_BASES = Object.freeze({'score-rush-tactical':'score-rush', 'control-tactical':'control', 'tempo-tactical':'tempo', 'value-tactical':'value'});
export const TACTICAL_POLICY_IDS = Object.freeze(Object.keys(TACTICAL_BASES));
export const tacticalBase = id => Object.hasOwn(TACTICAL_BASES,id) ? TACTICAL_BASES[id] : null;

export function tacticalScore(baseId, action, context, baseScore) {
  const view = context.authorizedView, own = view.own, enemy = view.opponents?.[0];
  const fv = action.featureVector ?? {}, family = action.family, mode = String(action.mode ?? '');
  const stack = view.stack ?? [], root = stack[0], top = stack.at(-1);
  const value = evaluateAction(action, context);
  const enemyGap = (enemy?.goal ?? Infinity) - number(enemy?.securedPoints);
  const pressure = enemy && (enemyGap <= 0 || (enemy.handCount > 0 && enemyGap <= 11));
  if (family === 'phase') return 0;
  if (family === 'private-choice') return privateChoiceScore(action, context);
  if (Number.isFinite(value.resourceScore)) return value.resourceScore;
  if (family === 'response-decline') return top?.controllerId === context.actorId ? 9000 : 900;
  if (fv.counter === true || family === 'counter' || family === 'disrupt') {
    if (!top || top.controllerId === context.actorId) return -5000;
    const defendingRoot = root?.controllerId === context.actorId;
    const threatenedOwnCards = (root?.targetCardIds ?? []).some(id => view.knownCards?.[id]?.controllerId === context.actorId);
    const pointsRoot = root?.actionType === 'play-for-points';
    const urgent = defendingRoot || threatenedOwnCards || (pressure && pointsRoot);
    const materialRoot = root?.actionType === 'play-for-effect' && root.stackClass !== 'anchor';
    const benefit = urgent ? 3600 : materialRoot ? 1400 : 700;
    const premium = /super|three-red|spade/.test(mode) ? 180 : 0;
    // Prefer the cheapest lawful counter to the same threat, not a generic
    // premium bonus. Every engine-authorized premium remains selectable.
    return benefit - value.spent * 180 - value.cost * 8 - premium;
  }
  if (family === 'interrupt' && mode.includes('stack-theft')) {
    if (!top || top.controllerId === context.actorId) return -5000;
    const targets = (top.targetCardIds ?? []).map(id => view.knownCards?.[id]).filter(Boolean);
    const threatened = targets.filter(c => c.controllerId === context.actorId).reduce((n,c) => n + boardPoints(c),0);
    const source = view.knownCards?.[top.sourceCardIds?.[0]];
    const material = Math.max(0, number(source?.pointValue), threatened);
    // Printed skip cost only; Interrupt timing itself has no generic tax.
    return 700 + material * 95 + threatened * 80 + (pressure && threatened ? 900 : 0) - number(fv.printedFullTurnSkips) * 600 - value.cost * 15;
  }
  const {gain, removed, ownLoss, spent, cost, utility} = value;
  if (gain > 0 && own.securedPoints + gain - ownLoss >= own.goal) return 10000 + (gain-ownLoss) * 34 - spent * 12;
  let score = baseScore + utility;
  score += (removed - ownLoss) * 55;
  if (pressure && removed > ownLoss) score += 550 + Math.min(removed - ownLoss,11) * 25;
  if (!['score','play-for-points'].includes(family)) score += gain * 65;
  if (own.securedPoints >= own.goal && ownLoss > gain) score -= 7000;
  if (spent > 1) score -= (spent - 1) * (baseId === 'value' ? 220 : 160) + cost * 7;
  if (family === 'effect-three' && ownLoss) score -= 900;
  if (family === 'draw' && own.hand.length === 0) score += 180;
  if (family === 'effect-four' && mode.startsWith('clear-') && !removed && utility <= 0) score -= baseId === 'control' ? 300 : 0;
  return score;
}
