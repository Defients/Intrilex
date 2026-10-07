import { WEIGHT_FEATURES, WEIGHT_BOUND } from '../../policies/src/weighted-heuristic.mjs';

// ── Adaptive Strategy Profiles ─────────────────────────────────────────────
// A deterministic posture layer over the persistent baseline genome:
//
//   BASE PROFILE → authorized state signals → strategic state → trait-scale
//   modifiers → effective genome → weighted heuristic decision
//
// The adaptive layer answers "what type of game should this agent be trying to
// play right now?"; the tactical engine still answers "which legal action best
// expresses that strategy?". No card-specific rules live here: signals are
// derived only from the authorized view plus the legal-action list, and the
// output is a clamped effective genome, not an action script.
//
// Modes:
//   OFF     — existing behavior; the controller is never built.
//   RULED   — deterministic state classification plus configured modifiers.
//   LEARNED — reserved schema surface for Evolution Lab optimization. V1 has
//             no learned optimizer, so LEARNED executes as OFF and is reported
//             as unavailable rather than pretending to adapt.
//
// Baseline state machine (advantage axis, [-1, 1]):
//   DESPERATE   advantage <= -dominantEnter
//   BEHIND      advantage <= -aheadEnter
//   NEUTRAL     otherwise
//   AHEAD       advantage >= +aheadEnter
//   DOMINANT    advantage >= +dominantEnter
// Transient overrides (bypass hysteresis, re-evaluated every decision):
//   WIN_OPPORTUNITY      — a legal action reaches the own goal this decision
//   DEFENSIVE_EMERGENCY  — opponent goal fraction >= mustDefendAt with material
// Hysteresis widens the current state's band by `hysteresis` on both edges, so
// small oscillations around a boundary cannot flip the classification.
//
// Modifiers are integers in [-100, 100] keyed by genome parameter name and
// applied at TRAIT_SCALE (×20 weight points per unit), clamped to WEIGHT_BOUND.

const fail = (code, detail) => { throw Object.assign(new Error(detail ? `${code}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : code), { code, detail }); };

export const ADAPTIVE_CONTRACT = 'ADAPTIVE_STRATEGY_RULED@1';
export const ADAPTIVE_SCHEMA_VERSION = 1;
export const ADAPTIVE_TELEMETRY_VERSION = 1;
export const ADAPTIVE_MODES = Object.freeze(['OFF', 'RULED', 'LEARNED']);
export const BASE_STRATEGIC_STATES = Object.freeze(['NEUTRAL', 'AHEAD', 'DOMINANT', 'BEHIND', 'DESPERATE']);
export const OVERRIDE_STATES = Object.freeze(['WIN_OPPORTUNITY', 'DEFENSIVE_EMERGENCY']);
export const STRATEGIC_STATES = Object.freeze([...BASE_STRATEGIC_STATES, ...OVERRIDE_STATES]);
export const MODIFIER_STATES = Object.freeze(STRATEGIC_STATES.filter(s => s !== 'NEUTRAL'));
export const ADAPTIVE_MODIFIER_SCALE = 20;
export const ADAPTIVE_MODIFIER_BOUND = 100;

export const DEFAULT_ADAPTIVE_THRESHOLDS = Object.freeze({
  aheadEnter: 0.15,
  dominantEnter: 0.45,
  hysteresis: 0.06,
  mustDefendAt: 0.8,
});

const THRESHOLD_KEYS = Object.keys(DEFAULT_ADAPTIVE_THRESHOLDS);

const isPlainObject = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const checkJsonSafe = (value, path) => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail('NON_FINITE_NUMBER', path); return; }
  if (Array.isArray(value)) { for (const [i, item] of value.entries()) checkJsonSafe(item, `${path}[${i}]`); return; }
  if (!isPlainObject(value)) fail('UNSUPPORTED_VALUE', path);
  for (const [key, child] of Object.entries(value)) { if (child === undefined) fail('UNDEFINED_FIELD', `${path}.${key}`); checkJsonSafe(child, `${path}.${key}`); }
};

const num = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pointSum = cards => (cards ?? []).reduce((sum, card) => sum + num(card?.pointValue), 0);

/**
 * Derive normalized strategic signals from the authorized view and the legal
 * action list. All inputs are public or the actor's own information; hidden
 * opponent identities are never consulted.
 *   advantage            [-1,1] composite edge: goal-progress differential
 *                        plus small board-value and hand-size terms
 *   goalProgress         [0,1]  own secured points / own goal
 *   opponentGoalProgress [0,1]  opponent secured points / opponent goal
 *   urgency              [0,1]  max progress of either side — proximity to the end
 *   winNow               0|1    a legal scoring action reaches own goal now
 *   opponentThreat       [0,1]  opponent goal fraction (nearness to their win)
 *   opponentMaterial     0|1    opponent has cards in hand and can act
 *   boardEdge            [-1,1] PR+ER point-value differential, scaled by 20
 *   resourceEdge         [-1,1] hand-count differential, scaled by 5
 *   initiative           0|1    actor holds the active-player seat
 *   drawRemaining        int    public draw-pile count (endgame clock signal)
 */
export function strategicSignals(authorizedView, legalActions = []) {
  const own = authorizedView?.own ?? {};
  const opp = authorizedView?.opponents?.[0] ?? {};
  const ownGoal = num(own.goal, 0) || 1;
  const oppGoal = num(opp.goal, 0) || 1;
  const goalProgress = clamp(num(own.securedPoints) / ownGoal, 0, 1);
  const opponentGoalProgress = clamp(num(opp.securedPoints) / oppGoal, 0, 1);
  const boardEdge = clamp((pointSum(own.pr) + pointSum(own.er) - pointSum(opp.pr) - pointSum(opp.er)) / 20, -1, 1);
  const resourceEdge = clamp(((own.hand?.length ?? 0) - num(opp.handCount)) / 5, -1, 1);
  const advantage = clamp((goalProgress - opponentGoalProgress) + 0.15 * boardEdge + 0.10 * resourceEdge, -1, 1);
  const secured = num(own.securedPoints), goal = num(own.goal, Infinity);
  const winNow = legalActions.some(action => {
    const family = action?.family === 'score' ? 'play-for-points' : action?.family;
    if (family !== 'play-for-points') return false;
    const fv = action?.featureVector ?? {};
    return num(fv.immediateScore ?? fv.immediatePoints) + secured >= goal;
  }) ? 1 : 0;
  return {
    advantage,
    goalProgress,
    opponentGoalProgress,
    urgency: Math.max(goalProgress, opponentGoalProgress),
    winNow,
    opponentThreat: opponentGoalProgress,
    opponentMaterial: (num(opp.handCount) > 0) ? 1 : 0,
    boardEdge,
    resourceEdge,
    initiative: authorizedView?.activePlayerId != null && authorizedView.activePlayerId === authorizedView.actorId ? 1 : 0,
    drawRemaining: num(authorizedView?.dpCount),
  };
}

const classifyRaw = (advantage, t) =>
  advantage >= t.dominantEnter ? 'DOMINANT'
    : advantage >= t.aheadEnter ? 'AHEAD'
      : advantage <= -t.dominantEnter ? 'DESPERATE'
        : advantage <= -t.aheadEnter ? 'BEHIND' : 'NEUTRAL';

const BANDS = t => ({
  DESPERATE: { lo: -Infinity, hi: -t.dominantEnter },
  BEHIND: { lo: -t.dominantEnter, hi: -t.aheadEnter },
  NEUTRAL: { lo: -t.aheadEnter, hi: t.aheadEnter },
  AHEAD: { lo: t.aheadEnter, hi: t.dominantEnter },
  DOMINANT: { lo: t.dominantEnter, hi: Infinity },
});

/** Dual-threshold advance: the current state's band is widened by hysteresis
 * on both edges; leaving it re-classifies the raw advantage (multi-band jumps
 * allowed). Deterministic given identical inputs. */
const advanceBaseState = (advantage, current, bands, hysteresis, thresholds) => {
  const band = bands[current];
  if (advantage > band.lo - hysteresis && advantage < band.hi + hysteresis) return current;
  return classifyRaw(advantage, thresholds);
};

/** Strictly validate an adaptive-strategy block. Absent config (null) is the
 * historical default and means OFF; present-but-malformed fails closed. */
export function validateAdaptiveConfig(config) {
  if (!isPlainObject(config)) fail('INVALID_ADAPTIVE_CONFIG', 'not an object');
  const allowed = new Set(['contract', 'learned', 'mode', 'modifiers', 'thresholds']);
  if (Object.keys(config).some(k => !allowed.has(k))) fail('INVALID_ADAPTIVE_CONFIG', 'fields');
  if (config.contract !== ADAPTIVE_CONTRACT) fail('UNSUPPORTED_ADAPTIVE_CONTRACT', config.contract);
  if (!ADAPTIVE_MODES.includes(config.mode)) fail('INVALID_ADAPTIVE_MODE', config.mode);
  if (config.thresholds !== undefined) {
    if (!isPlainObject(config.thresholds)) fail('INVALID_ADAPTIVE_THRESHOLDS');
    for (const [key, value] of Object.entries(config.thresholds)) {
      if (!THRESHOLD_KEYS.includes(key)) fail('UNSUPPORTED_ADAPTIVE_THRESHOLD', key);
      if (typeof value !== 'number' || !Number.isFinite(value)) fail('INVALID_ADAPTIVE_THRESHOLDS', key);
    }
    const t = { ...DEFAULT_ADAPTIVE_THRESHOLDS, ...config.thresholds };
    if (!(t.aheadEnter > 0 && t.aheadEnter < 1)) fail('INVALID_ADAPTIVE_THRESHOLDS', 'aheadEnter must be in (0,1)');
    if (!(t.dominantEnter > t.aheadEnter && t.dominantEnter <= 1)) fail('INVALID_ADAPTIVE_THRESHOLD_ORDER', 'dominantEnter must exceed aheadEnter and be <= 1');
    if (!(t.hysteresis >= 0 && t.hysteresis <= Math.min(t.aheadEnter, t.dominantEnter - t.aheadEnter))) fail('INVALID_ADAPTIVE_THRESHOLDS', 'hysteresis must keep adjacent bands disjoint');
    if (!(t.mustDefendAt > 0 && t.mustDefendAt <= 1)) fail('INVALID_ADAPTIVE_THRESHOLDS', 'mustDefendAt must be in (0,1]');
  }
  if (config.modifiers !== undefined) {
    if (!isPlainObject(config.modifiers)) fail('INVALID_ADAPTIVE_MODIFIERS');
    for (const [state, table] of Object.entries(config.modifiers)) {
      if (!MODIFIER_STATES.includes(state)) fail('UNSUPPORTED_STRATEGIC_STATE', state);
      if (!isPlainObject(table)) fail('INVALID_ADAPTIVE_MODIFIERS', state);
      for (const [param, value] of Object.entries(table)) {
        if (!WEIGHT_FEATURES.includes(param)) fail('UNSUPPORTED_PARAMETER', param);
        if (!Number.isInteger(value) || Math.abs(value) > ADAPTIVE_MODIFIER_BOUND) fail('ADAPTIVE_MODIFIER_OUT_OF_RANGE', { state, param, value });
      }
    }
  }
  // `learned` is the reserved LEARNED-mode payload (model parameters, learned
  // thresholds/modifiers as produced by a future optimizer). V1 only requires
  // it to be canonical JSON so it can ride checkpoint/snapshot identity.
  if (config.learned !== undefined) {
    if (config.learned !== null && !isPlainObject(config.learned)) fail('INVALID_ADAPTIVE_LEARNED');
    if (config.learned) checkJsonSafe(config.learned, '$.learned');
  }
  return config;
}

/** Validated, default-filled config clone; null input means "no adaptive layer". */
export function normalizeAdaptiveConfig(config) {
  if (config === undefined || config === null) return null;
  validateAdaptiveConfig(config);
  const out = {
    contract: ADAPTIVE_CONTRACT,
    mode: config.mode,
    thresholds: { ...DEFAULT_ADAPTIVE_THRESHOLDS, ...(config.thresholds ?? {}) },
    modifiers: Object.fromEntries(Object.entries(config.modifiers ?? {}).map(([state, table]) => [state, { ...table }])),
    ...(config.learned !== undefined ? { learned: structuredClone(config.learned) } : {}),
  };
  return Object.freeze(out);
}

/** LEARNED is architected but has no optimizer in V1 — it executes as OFF. */
export const effectiveAdaptiveMode = config => !config || config.mode === 'LEARNED' ? 'OFF' : config.mode;
export const LEARNED_UNAVAILABLE_REASON = 'LEARNED_MODE_EXPERIMENTAL';

const round4 = v => Math.round(v * 10000) / 10000;

/**
 * Per-match, per-seat adaptive controller. `decide` is pure with respect to
 * (config, prior controller state, authorizedView, legalActions) — no RNG, no
 * wall clock, no hidden information — so identical decision sequences replay
 * identically, including across save/restore replays of the decision journal.
 */
export function createAdaptiveController(config, basePolicyState) {
  const cfg = normalizeAdaptiveConfig(config);
  if (!cfg) fail('INVALID_ADAPTIVE_CONFIG', 'missing config');
  const baseWeights = { ...(basePolicyState?.weights ?? {}) };
  for (const name of WEIGHT_FEATURES) if (!Number.isInteger(baseWeights[name])) fail('INVALID_GENOME', name);
  const thresholds = cfg.thresholds, bands = BANDS(thresholds), modifiers = cfg.modifiers;
  const stateDecisions = Object.fromEntries(STRATEGIC_STATES.map(s => [s, 0]));
  const transitions = [];
  let baseState = 'NEUTRAL', lastEffective = null, lastOverride = null, lastAdvantage = null;
  let decisions = 0, hysteresisSuppressions = 0, lastFrame = null;

  const decide = ({ authorizedView, legalActions, decisionIndex = null }) => {
    const signals = strategicSignals(authorizedView, legalActions);
    const raw = classifyRaw(signals.advantage, thresholds);
    const nextBase = advanceBaseState(signals.advantage, baseState, bands, thresholds.hysteresis, thresholds);
    const hysteresisHeld = raw !== nextBase;
    if (hysteresisHeld) hysteresisSuppressions += 1;
    baseState = nextBase;

    let override = null;
    if (signals.winNow === 1) override = 'WIN_OPPORTUNITY';
    else if (signals.opponentThreat >= thresholds.mustDefendAt && signals.opponentMaterial === 1) override = 'DEFENSIVE_EMERGENCY';
    const effective = override ?? nextBase;

    let reason = null;
    const transitioned = lastEffective === null ? effective !== 'NEUTRAL' : effective !== lastEffective;
    if (transitioned) {
      if (lastEffective === null) reason = 'INITIAL_CLASSIFICATION';
      else if (override) reason = override === 'WIN_OPPORTUNITY' ? 'IMMEDIATE_WIN_AVAILABLE' : 'OPPONENT_NEAR_GOAL';
      else if (lastOverride) reason = 'OVERRIDE_CLEARED';
      else reason = signals.advantage >= (lastAdvantage ?? signals.advantage) ? 'ADVANTAGE_ROSE' : 'ADVANTAGE_FELL';
      transitions.push({ at: decisionIndex, from: lastEffective, to: effective, reason, advantage: round4(signals.advantage) });
    }

    const table = modifiers[effective] ?? null;
    let effectiveWeights = baseWeights;
    if (table) {
      effectiveWeights = {};
      for (const name of WEIGHT_FEATURES) {
        const adjusted = clamp(baseWeights[name] + (table[name] ?? 0) * ADAPTIVE_MODIFIER_SCALE, -WEIGHT_BOUND, WEIGHT_BOUND);
        effectiveWeights[name] = Object.is(adjusted, -0) ? 0 : adjusted;
      }
    }
    const policyState = table
      ? { schemaVersion: basePolicyState.schemaVersion ?? 1, basePolicyId: basePolicyState.basePolicyId ?? 'control', weights: effectiveWeights }
      : basePolicyState;

    decisions += 1;
    stateDecisions[effective] += 1;
    lastEffective = effective; lastOverride = override; lastAdvantage = signals.advantage;
    lastFrame = {
      mode: 'RULED', contract: cfg.contract,
      state: effective, baseState: nextBase, rawBaseState: raw, override,
      previousState: transitioned ? (transitions.at(-1).from ?? null) : effective,
      transitioned, reason, hysteresisHeld,
      signals,
      modifiers: table ? { ...table } : {},
      effectiveWeights,
      baseWeights,
      policyState,
    };
    return lastFrame;
  };

  const summary = () => ({
    requestedMode: cfg.mode, mode: effectiveAdaptiveMode(cfg), contract: cfg.contract,
    decisions, stateDecisions: { ...stateDecisions }, transitions: transitions.map(tr => ({ ...tr })),
    transitionCount: transitions.length, finalState: lastEffective ?? 'NEUTRAL', hysteresisSuppressions,
    ...(cfg.mode === 'LEARNED' ? { unavailable: LEARNED_UNAVAILABLE_REASON } : {}),
  });

  return { config: cfg, decide, summary, get lastFrame() { return lastFrame; } };
}

/** Compact per-decision record. `deep` adds signals, applied modifiers and the
 * effective genome — the full provenance of base→effective values. */
export function compactAdaptiveFrame(frame, { deep = false } = {}) {
  const compact = {
    mode: frame.mode, state: frame.state, baseState: frame.baseState, override: frame.override,
    transitioned: frame.transitioned, reason: frame.reason,
  };
  if (!deep) return compact;
  return { ...compact, signals: frame.signals, modifiers: frame.modifiers, effectiveWeights: frame.effectiveWeights, hysteresisHeld: frame.hysteresisHeld };
}

/** Per-seat summary entry for match-level adaptive telemetry. */
export function adaptiveSeatSummary(config, controller) {
  if (controller) return controller.summary();
  const normalized = normalizeAdaptiveConfig(config);
  if (!normalized) return null;
  return { requestedMode: normalized.mode, mode: effectiveAdaptiveMode(normalized), contract: normalized.contract,
    decisions: 0, stateDecisions: {}, transitions: [], transitionCount: 0, finalState: 'NEUTRAL', hysteresisSuppressions: 0,
    ...(normalized.mode === 'LEARNED' ? { unavailable: LEARNED_UNAVAILABLE_REASON } : {}) };
}

export function validateAdaptiveTelemetry(telemetry) {
  if (!isPlainObject(telemetry) || telemetry.schemaVersion !== ADAPTIVE_TELEMETRY_VERSION || !Array.isArray(telemetry.seats) || telemetry.seats.length > 8) fail('INVALID_ADAPTIVE_TELEMETRY');
  for (const seat of telemetry.seats) {
    if (!Number.isInteger(seat?.seat) || !ADAPTIVE_MODES.includes(seat.requestedMode) || !['OFF', 'RULED'].includes(seat.mode)) fail('INVALID_ADAPTIVE_TELEMETRY', 'seat');
    if (seat.mode !== 'RULED') continue;
    if (!Number.isInteger(seat.decisions) || seat.decisions < 0 || !Number.isInteger(seat.transitionCount) || seat.transitionCount !== seat.transitions?.length) fail('INVALID_ADAPTIVE_TELEMETRY', 'counts');
    for (const [state, count] of Object.entries(seat.stateDecisions ?? {})) {
      if (!STRATEGIC_STATES.includes(state) || !Number.isInteger(count) || count < 0) fail('INVALID_ADAPTIVE_TELEMETRY', 'stateDecisions');
    }
    for (const transition of seat.transitions ?? []) {
      if ((transition.from !== null && !STRATEGIC_STATES.includes(transition.from)) || !STRATEGIC_STATES.includes(transition.to)) fail('INVALID_ADAPTIVE_TELEMETRY', 'transitions');
    }
  }
  return telemetry;
}

/** UI/debug display labels — research vocabulary stays in the data layer. */
export const STRATEGIC_STATE_LABELS = Object.freeze({
  NEUTRAL: 'Neutral', AHEAD: 'Ahead', DOMINANT: 'Dominant', BEHIND: 'Behind', DESPERATE: 'Desperate',
  WIN_OPPORTUNITY: 'Win Opportunity', DEFENSIVE_EMERGENCY: 'Defensive Emergency',
});
export const ADAPTIVE_MODE_LABELS = Object.freeze({ OFF: 'Off', RULED: 'Ruled', LEARNED: 'Learned (experimental)' });
