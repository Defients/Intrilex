import { evaluateAction, number } from './action-evaluation.mjs';

export const CONTROL_CONVERSION_ID = 'control-conversion-tactical';
export const CONTROL_CONVERSION_VERSION = '5.0.0';

/** A common value scale replaces legacy family offsets for this successor only.
 * Estimates use the authorized view; they are not expected values or lookahead.
 * Conversion debt is implicit: spending scarce scoring material is charged now,
 * while denial earns value only for public material/options actually threatened. */
export function conversionComponents(action, context) {
  const v = evaluateAction(action, context), view = context.authorizedView;
  const own = view.own, enemy = view.opponents?.[0];
  const gain = v.gain - v.ownLoss;
  const enemyGap = enemy ? number(enemy.goal) - number(enemy.securedPoints) : Infinity;
  const threat = enemyGap <= 11 && number(enemy?.handCount) > 0;
  const ownGap = number(own.goal) - number(own.securedPoints);
  const availableScore = Math.max(0, ...(context.legalActions ?? []).filter(a => ['score','play-for-points'].includes(a.family)).map(a => number(a.featureVector?.immediateScore ?? a.featureVector?.immediatePoints)));
  const scoring = ['score','play-for-points'].includes(action.family);
  const denial = Math.max(0, v.removed);
  // When public scoring material is scarce, hand pressure still earns utility;
  // generic family affinity does not. Protecting a substantial board has value.
  const components = {
    common: 700,
    conversion: v.gain * (threat ? 100 : 85),
    denial: denial * (threat ? 155 : 115),
    ownBoardLoss: -v.ownLoss * 100,
    optionUtility: Math.max(-1600, Math.min(1600, v.utility)) * 0.65,
    resourceCost: -v.cost * (scoring ? 2 : 14) - Math.max(0,v.spent-1)*150,
    opportunityCost: !scoring && availableScore > 0 ? -availableScore * (denial > 0 ? 8 : 20) : 0,
    cashWindow: scoring && number(enemy?.securedPoints) <= number(own.securedPoints) ? 120 : 0,
    goalProgress: scoring && ownGap > 0 ? Math.min(1, Math.max(0,gain)/ownGap)*180 : 0,
  };
  return components;
}

export function controlConversionScore(action, context, legacyTacticalScore) {
  const v = evaluateAction(action, context);
  // Preserve proven response, private-choice, terminal and free-resource logic.
  if (['phase','private-choice','response-decline','counter','disrupt','interrupt'].includes(action.family)
    || Number.isFinite(v.resourceScore) || action.featureVector?.counter
    || legacyTacticalScore >= 9000) return legacyTacticalScore;
  return Object.values(conversionComponents(action, context)).reduce((sum,n)=>sum+n,0);
}
