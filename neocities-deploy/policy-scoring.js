import { sha256Text } from "./engine/hash.js?v=659a089d50b6";

// ── Default scoring weights (parameterized for tuning and sensitivity analysis) ──
// Provenance: hand-tuned baseline from v0.10.0. Each weight can be overridden
// via createScoringWeights(overrides) for calibration experiments.
// See: test/scoring-sensitivity.test.mjs for sensitivity regression tests.
const DEFAULT_SCORING_WEIGHTS = {
  choice: { base: { value: 820, tempo: 760, control: 740, default: 700 }, valueMultiplier: 30, defaultMultiplier: 16, selectedBonus: 14, generatedBonus: 120 },
  advanced: { base: { 'score-rush': 1000, control: 1080, tempo: 1120, value: 1060, default: 900 }, modeBonus: { ultra: 300, rank10: 240, 'royal-marriage': 220, super: 180, voltage: 160, 'special-scoring-riders': 200, 'sudden-death': 280 }, targetMultiplier: 18, sourceMultiplierMulti: 3, sourceMultiplierSingle: 1, drawMultiplier: 55, miniMultiplier: 120, controlBonus: 200, recoveryBonus: 140, anchorMultiplier: 16, triggerBonus: 160, mimicBonus: 180, holdBonus: 150, privateChoiceBonus: 140, refineBonus: 120, predictionBonus: 130, suddenDeathBonus: 300 },
  phase: 5000,
  swapBar: { faceDownValue: { value: 900, default: 620 }, faceDownSourcePenalty: -3, faceUpBase: 700, faceUpTargetMultiplier: 12 },
  responseDecline: { control: { opponent: 70, own: 720 }, tempo: { opponent: 210, own: 760 }, 'score-rush': { opponent: 330, own: 800 }, default: { opponent: 270, own: 820 }, ownTopBonus: 900 },
  counter: { premium: { super: 360, 'king-spade': 300, spade: 240 }, base: { control: 1250, value: 1060, tempo: 980, default: 900 }, opponentRootBonus: 320, ownRootPenalty: -500, depthMultiplier: 18 },
  disrupt: { special: { 'stack-theft': 600, scuttle: 280, tap: 220, aegis: 180, default: 100 }, base: { control: 1080, tempo: 940, value: 880, default: 760 }, hostileBonus: 240, quickBonus: 80, nonHostilePenalty: -280 },
  playForPoints: { winScore: 6000, base: { 'score-rush': 1300, value: 1200, tempo: 1040, default: 650 }, controlMultiplier: 12, defaultMultiplier: 34 },
  scuttle: { base: { control: 1080, value: 930, default: 820 }, targetMultiplier: 28, sourcePenalty: 7, absoluteBonus: 240 },
  draw: { lowHandThreshold: 2, lowHandScore: 1100, tempoScore: 620, defaultScore: 510 },
  exhaustedPass: -100,
  effect: { base: { control: 1050, value: 930, tempo: 900, default: 760 }, targetMultiplier: 22, affectedMultiplier: 60, goalDeltaMultiplier: 40, drawMultiplier: 50, anchorMultiplier: 25, structuralBonus: 180 },
  default: { base: 100, targetMultiplier: 8, sourcePenalty: 2 }
};

/**
 * Deep-merge overrides into the default scoring weights.
 * @param {object} overrides - Partial overrides to merge into defaults
 * @returns {object} A complete scoring weights object
 */
function deepMerge(target, source) {
  const result = structuredClone(target);
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && result[key] && typeof result[key] === 'object') {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function createScoringWeights(overrides = {}) {
  return deepMerge(DEFAULT_SCORING_WEIGHTS, overrides);
}

/**
 * Hash the scoring weights for provenance tracking.
 * @param {object} weights - Scoring weights to hash
 * @returns {string} SHA-256 hash of canonical JSON
 */
export function scoringWeightsHash(weights = DEFAULT_SCORING_WEIGHTS) {
  return sha256Text(JSON.stringify(weights));
}

// Backward-compatible default export (frozen to prevent accidental mutation)
export const SCORING_WEIGHTS = Object.freeze(structuredClone(DEFAULT_SCORING_WEIGHTS));

const ordered = (actions) => [...actions].sort((a, b) => a.actionId.localeCompare(b.actionId));
const n = (action, key) => Number(action.featureVector?.[key] ?? 0);
const bool = (action, key) => action.featureVector?.[key] === true;
const str = (action, key) => String(action.featureVector?.[key] ?? '');

function knownPointValue(context, handle) { return Number(context.authorizedView?.knownCards?.[handle]?.pointValue ?? 0); }
function targetValue(action, context) { return (action.targetHandles ?? []).reduce((sum, handle) => sum + knownPointValue(context, handle), 0); }
function sourceValue(action, context) { return (action.sourceHandles ?? []).reduce((sum, handle) => sum + knownPointValue(context, handle), 0); }
function responseContext(context) {
  const stack = context.authorizedView?.stack ?? [];
  const top = stack.at(-1) ?? null, root = stack[0] ?? null;
  return { top, root, opponentRoot: Boolean(root && root.controllerId !== context.actorId), opponentTop: Boolean(top && top.controllerId !== context.actorId), ownTop: Boolean(top && top.controllerId === context.actorId), depth: stack.length };
}
function normalizedFamily(action) {
  if (action.family === 'score') return 'play-for-points';
  if (action.family === 'exhausted-pass') return 'exhausted-pass';
  return action.family;
}
function choiceScore(policyId, action, context, weights) {
  const w = weights.choice;
  const value = targetValue(action, context), selected = n(action, 'selectedCount') || (action.targetHandles?.length ?? 0);
  const generated = str(action, 'generatedActionKind') || str(action, 'effectKind');
  const base = policyId === 'value' ? w.base.value : policyId === 'tempo' ? w.base.tempo : policyId === 'control' ? w.base.control : w.base.default;
  return base + value * (policyId === 'value' ? w.valueMultiplier : w.defaultMultiplier) + selected * w.selectedBonus + (generated ? w.generatedBonus : 0);
}
function advancedScore(policyId, action, context, weights) {
  const w = weights.advanced;
  const target = targetValue(action, context), source = sourceValue(action, context);
  const multi = bool(action, 'multiCard') || bool(action, 'ultra') || action.family === 'ultra' || action.family === 'super';
  const draw = n(action, 'draw') || n(action, 'cardsDrawn');
  const mini = n(action, 'miniTurns');
  const control = bool(action, 'controlChange');
  const recovery = bool(action, 'recovery');
  const anchor = n(action, 'anchorValue');
  const trigger = bool(action, 'trigger');
  const mimic = bool(action, 'mimic');
  const hold = bool(action, 'holdChild') || str(action, 'disposition') === 'hold';
  const privateChoice = bool(action, 'privateChoice');
  const refine = bool(action, 'refine');
  const prediction = bool(action, 'prediction');
  const suddenDeath = action.family === 'sudden-death';
  const base = w.base[policyId] ?? w.base.default;
  const modeBonus = w.modeBonus[action.family] ?? 0;
  return base + modeBonus + target * w.targetMultiplier - source * (multi ? w.sourceMultiplierMulti : w.sourceMultiplierSingle) + draw * w.drawMultiplier + mini * w.miniMultiplier + (control ? w.controlBonus : 0) + (recovery ? w.recoveryBonus : 0) + anchor * w.anchorMultiplier + (trigger ? w.triggerBonus : 0) + (mimic ? w.mimicBonus : 0) + (hold ? w.holdBonus : 0) + (privateChoice ? w.privateChoiceBonus : 0) + (refine ? w.refineBonus : 0) + (prediction ? w.predictionBonus : 0) + (suddenDeath ? w.suddenDeathBonus : 0);
}

export function scorePolicyAction(policyId, action, context, weights = SCORING_WEIGHTS) {
  const own = context.authorizedView.own, response = responseContext(context);
  const family = normalizedFamily(action);
  const immediate = n(action, 'immediateScore') || n(action, 'immediatePoints');
  const targetPoints = Math.max(n(action, 'targetPointValue'), targetValue(action, context));
  const sourcePoints = Math.max(n(action, 'sourcePointValue'), sourceValue(action, context));

  if (action.family === 'private-choice') return choiceScore(policyId, action, context, weights);
  if (['royal-marriage','super','rank10','ultra','voltage','special-scoring-riders','sudden-death'].includes(action.family)) return advancedScore(policyId, action, context, weights);
  if (action.family === 'phase') return weights.phase;
  if (action.family === 'swap-bar') { const w = weights.swapBar; return action.mode === 'face-down' ? (policyId === 'value' ? w.faceDownValue.value : w.faceDownValue.default) + sourcePoints * w.faceDownSourcePenalty : w.faceUpBase + targetPoints * w.faceUpTargetMultiplier; }

  if (action.family === 'response-decline') {
    const table = weights.responseDecline;
    const w = table[policyId] ?? table.default;
    if (response.ownTop) return w.own + table.ownTopBonus;
    return response.opponentTop ? w.opponent : w.own;
  }
  if (action.family === 'counter') {
    const w = weights.counter;
    const premium = action.mode.includes('super') ? w.premium.super : action.mode.includes('king-spade') ? w.premium['king-spade'] : action.mode.includes('spade') ? w.premium.spade : 0;
    const base = w.base[policyId] ?? w.base.default;
    return base + premium + (response.opponentRoot ? w.opponentRootBonus : w.ownRootPenalty) + response.depth * w.depthMultiplier;
  }
  if (['disrupt','interrupt','instant','quick'].includes(action.family)) {
    const w = weights.disrupt;
    const hostile = response.opponentRoot || response.opponentTop;
    const special = action.mode.includes('stack-theft') ? w.special['stack-theft'] : action.mode.includes('scuttle') ? w.special.scuttle : action.mode.includes('tap') ? w.special.tap : action.mode.includes('aegis') ? w.special.aegis : w.special.default;
    return (w.base[policyId] ?? w.base.default) + special + (hostile ? w.hostileBonus : action.family === 'quick' ? w.quickBonus : w.nonHostilePenalty);
  }

  if (family === 'play-for-points') {
    const w = weights.playForPoints;
    const win = own.securedPoints + immediate >= own.goal;
    return (win ? w.winScore : w.base[policyId] ?? w.base.default) + immediate * (policyId === 'control' ? w.controlMultiplier : w.defaultMultiplier);
  }
  if (family === 'scuttle') { const w = weights.scuttle; return (w.base[policyId] ?? w.base.default) + targetPoints * w.targetMultiplier - sourcePoints * w.sourcePenalty + (bool(action,'absolute') ? w.absoluteBonus : 0); }
  if (family === 'draw') { const w = weights.draw; return own.hand.length <= w.lowHandThreshold ? w.lowHandScore : policyId === 'tempo' ? w.tempoScore : w.defaultScore; }
  if (family === 'exhausted-pass') return weights.exhaustedPass;

  if (family.startsWith('effect-') || ['anchor','anchor-guard','anchor-private-choice'].includes(family)) {
    const w = weights.effect;
    const effectBase = w.base[policyId] ?? w.base.default;
    return effectBase + targetPoints * w.targetMultiplier + n(action,'affectedCount') * w.affectedMultiplier + n(action,'goalDelta') * w.goalDeltaMultiplier + n(action,'drawCount') * w.drawMultiplier + n(action,'anchorValue') * w.anchorMultiplier + (bool(action,'structural') ? w.structuralBonus : 0);
  }

  const dw = weights.default; return dw.base + targetPoints * dw.targetMultiplier - sourcePoints * dw.sourcePenalty;
}

export function rankPolicyActions(policyId, actions, context, weights = SCORING_WEIGHTS) {
  return ordered(actions).map((action) => ({ action, score: scorePolicyAction(policyId, action, context, weights) })).sort((a, b) => b.score - a.score || a.action.actionId.localeCompare(b.action.actionId));
}
export function selectPolicyAction(policyId, actions, context, weights = SCORING_WEIGHTS) { return rankPolicyActions(policyId, actions, context, weights)[0]?.action ?? null; }

export function decomposePolicyScore(policyId, action, context) {
  const response = responseContext(context);
  const fv = action.featureVector ?? {};
  const own = context.authorizedView?.own ?? {};
  const immediatePoints = Number(fv.immediateScore ?? fv.immediatePoints ?? 0);
  const targetPoints = Math.max(Number(fv.targetPointValue ?? 0), targetValue(action, context));
  const sourcePoints = Math.max(Number(fv.sourcePointValue ?? 0), sourceValue(action, context));
  const family = normalizedFamily(action);

  const terminal = (family === 'play-for-points' || action.family === 'score') && (immediatePoints + (own.securedPoints ?? 0) >= (own.goal ?? Infinity)) ? 1 : 0;
  const points = immediatePoints + targetPoints * 0.5;
  const resource = (action.family === 'draw' ? 1 : 0) + (action.family === 'swap-bar' ? 1 : 0) + (action.family === 'effect-six' ? 1 : 0) + Number(fv.drawCount ?? fv.draw ?? 0) * 0.5;
  const tempo = (action.timingClass === 'QUICK' ? 1 : 0) + (policyId === 'tempo' ? 0.5 : 0) + Number(fv.miniTurns ?? 0) * 0.3;
  const defense = (action.family === 'anchor' || action.family === 'anchor-guard' || action.family === 'effect-nine' ? 1 : 0) + (response.ownTop ? 0.5 : 0);
  const synergy = Number(fv.anchorValue ?? 0) > 0 ? 0.25 : 0;
  const risk = (action.family === 'counter' && response.ownTop ? 1 : 0) + (sourcePoints > targetPoints ? 0.5 : 0);

  // 10♦ Mimic decomposition: rowExchange contributes to synergy, absoluteScuttle to risk, miniTurns to tempo
  const mimicBonus = Number(fv.mimic ?? 0) > 0 ? 0.15 : 0;
  const mimicSynergy = mimicBonus + (bool(action, 'rowExchange') ? 0.25 : 0);
  const mimicRisk = bool(action, 'absoluteScuttle') ? 0.3 : 0;

  return { terminal, points, resource, tempo, defense, synergy: synergy + mimicSynergy, risk: risk + mimicRisk };
}

export function rankPolicyActionsWithDecomposition(policyId, actions, context) {
  return ordered(actions).map((action) => {
    const scoreComponents = decomposePolicyScore(policyId, action, context);
    return { action, score: scorePolicyAction(policyId, action, context), scoreComponents };
  }).sort((a, b) => b.score - a.score || a.action.actionId.localeCompare(b.action.actionId));
}
