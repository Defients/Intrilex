// Rule Mutation Chamber domain — isomorphic module shared by the Node test
// harness, the browser workspace, and the simulation worker. It defines the
// closed target catalog (a UI-facing mirror of the engine-owned
// EXPERIMENTAL_RULE_PARAMETERS registry), the RuleMutation value object, the
// matched A/B match plan, arm-separated aggregation, the impact-vector
// comparison, the deterministic regression detector, the outcome
// classification, and the versioned experiment artifact envelope.
//
// Scientific-integrity contract:
//   - control and mutant samples are never combined;
//   - every result keeps arm identity, seed, seat order, and policy identity;
//   - paired statistics are only computed across genuinely paired ordinals
//     (same seed, same seat order, same policies, same ordinal);
//   - unavailable telemetry surfaces as null / 'UNAVAILABLE', never fabricated;
//   - small samples downgrade evidence grades instead of hiding.

import { hashCanonical } from '@intrilex/shared';
import { differenceInProportions, evidenceGradeDetailed, normalCdf, wilsonInterval } from '@intrilex/statistics/estimators';

export const MUTATION_EXPERIMENT_TYPE = 'rule-mutation';
export const MUTATION_EXPERIMENT_SCHEMA_VERSION = 1;
export const MUTATION_ARM = Object.freeze({ CONTROL: 'control', MUTANT: 'mutant' });
export const MUTATION_STATUS = Object.freeze({ CONFIGURED: 'configured', RUNNING: 'running', COMPLETE: 'complete', INCOMPLETE: 'incomplete', FAILED: 'failed' });
export const MUTATION_OUTCOME = Object.freeze({ PROMISING: 'PROMISING', TRADEOFF: 'TRADEOFF', REGRESSION: 'REGRESSION', INCONCLUSIVE: 'INCONCLUSIVE', UNEXPECTED: 'UNEXPECTED', ADVERSE: 'ADVERSE', EXPLORATORY: 'EXPLORATORY' });

/**
 * Metrics a declared experiment objective may target — the exact row keys the
 * impact vector produces in compareArms(). Closed list so objectives stay
 * machine-checkable and deterministic (never parsed from freeform text).
 */
export const MUTATION_OBJECTIVE_METRICS = Object.freeze({
  seat1WinRate: 'First-player win rate',
  drawRate: 'Draw rate',
  abortRate: 'Abort / invalid rate',
  longGameRate: 'Long-game rate',
  meanTurns: 'Mean game length (Full Turns)',
  meanMargin: 'Mean score margin',
  meanCommands: 'Mean commands',
  meanActions: 'Mean actions',
  meanMiniTurnActions: 'Mean Mini-Turn actions',
  meanAdvancedDecisions: 'Mean advanced decisions',
  meanVoltageDecisions: 'Mean Voltage decisions',
  meanUltraDecisions: 'Mean Ultra decisions',
  meanTriggerCount: 'Mean trigger events',
  meanResponseDecisions: 'Mean response decisions',
});

export const MUTATION_OBJECTIVE_DIRECTIONS = Object.freeze(['increase', 'decrease', 'absolute-change', 'exploratory']);

/**
 * Normalize + validate a predeclared experiment objective. The objective is
 * chosen before execution, serialized into the artifact, displayed in the UI
 * and consulted by classification — a verdict may never infer desirability
 * from the freeform hypothesis. `null`/`undefined` → null (the artifact then
 * classifies with exploratory semantics and can never report PROMISING).
 * @param {{ metric?: string, direction: string, minimumMeaningfulEffect?: number } | null | undefined} input
 */
export function createExperimentObjective(input) {
  if (input == null) return null;
  if (typeof input !== 'object') fail('OBJECTIVE_INVALID', 'Experiment objective must be an object');
  const direction = input.direction;
  if (!MUTATION_OBJECTIVE_DIRECTIONS.includes(direction)) fail('OBJECTIVE_DIRECTION_INVALID', `Objective direction must be one of ${MUTATION_OBJECTIVE_DIRECTIONS.join(', ')}`);
  const metric = input.metric ?? null;
  if (direction !== 'exploratory') {
    if (typeof metric !== 'string' || !MUTATION_OBJECTIVE_METRICS[metric]) fail('OBJECTIVE_METRIC_INVALID', `Objective metric must be one of ${Object.keys(MUTATION_OBJECTIVE_METRICS).join(', ')}`);
  } else if (metric != null && !MUTATION_OBJECTIVE_METRICS[metric]) {
    fail('OBJECTIVE_METRIC_INVALID', `Objective metric must be one of ${Object.keys(MUTATION_OBJECTIVE_METRICS).join(', ')}`);
  }
  const minimumMeaningfulEffect = input.minimumMeaningfulEffect == null ? 0 : Number(input.minimumMeaningfulEffect);
  if (!Number.isFinite(minimumMeaningfulEffect) || minimumMeaningfulEffect < 0) fail('OBJECTIVE_EFFECT_INVALID', 'minimumMeaningfulEffect must be a finite number ≥ 0');
  return Object.freeze({ metric: metric ?? null, direction, minimumMeaningfulEffect });
}

/** Re-validate a persisted objective (load/import path). null stays null. */
export function validateExperimentObjective(value) {
  if (value == null) return null;
  return createExperimentObjective(value);
}

export const MUTATION_LIMITS = Object.freeze({
  gamesPerArm: 10000,
  populationMax: 8,
  hypothesisChars: 2000,
  labelChars: 160,
});

/** A game is flagged "long" when it exceeds this many completed Full Turns. */
export const LONG_GAME_TURNS = 100;

const num = (id, baseline, min, max, label, description, group) =>
  Object.freeze({ id, kind: 'numeric', baseline, min, max, label, description, group });
const flag = (id, label, description, group) =>
  Object.freeze({ id, kind: 'boolean', baseline: true, label, description, group });

/**
 * UI-facing catalog of mutation targets. The id/kind/baseline/min/max fields
 * MUST match the engine-owned EXPERIMENTAL_RULE_PARAMETERS registry — a test
 * asserts parity so the catalog cannot silently drift from the engine seam.
 * Only parameters the Chamber is willing to expose appear here.
 */
export const MUTATION_TARGETS = Object.freeze([
  num('match.goal', 21, 5, 54, 'Victory Goal', 'Secured points required to win the match.', 'Match'),
  num('setup.hand.first', 5, 0, 10, 'Opening hand — first player', 'Cards dealt to the first player at setup.', 'Setup'),
  num('setup.hand.second', 6, 0, 10, 'Opening hand — second player', 'Cards dealt to the second player at setup.', 'Setup'),
  num('miniTurns.perTurn', 1, 0, 4, 'Mini-Turns per Full Turn', 'Mini-Turns refreshed for each player at the start of every Full Turn.', 'Tempo'),
  num('miniTurns.hardCap', 3, 1, 9, 'Mini-Turn hard cap', 'Maximum Mini-Turns a player may hold (10♣ Foundation restriction still caps at 1).', 'Tempo'),
  num('draw.emptyHand', 2, 1, 3, 'Empty-hand draw count', 'Cards drawn when drawing with an empty hand.', 'Draw'),
  num('rank10.heartTempo.miniTurns', 2, 0, 4, '10♥ Tempo Spike — Mini-Turn grant', 'Mini-Turns granted by playing 10♥ for its Tempo effect.', 'Rank 10'),
  num('rank10.heartTempo.draw', 1, 0, 3, '10♥ Tempo Spike — draw', 'Cards drawn by the 10♥ Tempo effect.', 'Rank 10'),
  num('super.jackTempo.miniTurns', 2, 0, 4, '⭐J Tempo — Mini-Turn grant', 'Mini-Turns granted by the paired-Jack Super and by 10♦ mimic of it.', 'Combos'),
  num('ultra.twoBlackTwoRed.miniTurns', 2, 0, 4, 'Ultra 2B+2R — Mini-Turn grant', 'Mini-Turns granted by the 2-black + 2-red Ultra.', 'Combos'),
  num('ultra.twoBlackTwoRed.draw', 2, 0, 4, 'Ultra 2B+2R — draw', 'Cards drawn on the draw-two branch of the 2-black + 2-red Ultra.', 'Combos'),
  num('rank.A.prPoints', 4, 0, 15, 'Ace — Points value', 'Secured-point value when an Ace is scored for Points.', 'Points'),
  num('rank.2.prPoints', 2, 0, 15, '2 — Points value', 'Secured-point value when a 2 is scored for Points.', 'Points'),
  num('rank.3.prPoints', 3, 0, 15, '3 — Points value', 'Secured-point value when a 3 is scored for Points.', 'Points'),
  num('rank.4.prPoints', 4, 0, 15, '4 — Points value', 'Secured-point value when a 4 is scored for Points.', 'Points'),
  num('rank.5.prPoints', 5, 0, 15, '5 — Points value', 'Secured-point value when a 5 is scored for Points.', 'Points'),
  num('rank.6.prPoints', 6, 0, 15, '6 — Points value', 'Secured-point value when a 6 is scored for Points.', 'Points'),
  num('rank.7.prPoints', 7, 0, 15, '7 — Points value', 'Secured-point value when a 7 is scored for Points.', 'Points'),
  num('rank.8.prPoints', 8, 0, 15, '8 — Points value', 'Secured-point value when an 8 is scored for Points.', 'Points'),
  num('rank.9.prPoints', 9, 0, 15, '9 — Points value', 'Secured-point value when a 9 is scored for Points.', 'Points'),
  num('rank.10.prPoints', 10, 0, 15, '10 — Points value', 'Secured-point value when a 10 is scored for Points.', 'Points'),
  num('rank.J.prPoints', 3, 0, 15, 'Jack — Points value', 'Secured-point value when a Jack is scored for Points.', 'Points'),
  num('rank.Q.prPoints', 2, 0, 15, 'Queen — Points value', 'Secured-point value when a Queen is scored for Points.', 'Points'),
  num('rank.K.prPoints', 8, 0, 15, 'King — Points value', 'Secured-point value when a King is scored for Points.', 'Points'),
  num('rank.RJ.prPoints', 5, 0, 15, 'Red Joker — Points value', 'Secured-point value when the Red Joker is scored for Points.', 'Points'),
  num('rank.BJ.prPoints', 11, 0, 15, 'Black Joker — Points value', 'Secured-point value when the Black Joker is scored for Points.', 'Points'),
  flag('combo.supers.enabled', 'Super Combos', 'Paired-rank Super plays (⭐2/⭐4/⭐8/⭐J plus unrestricted ⭐3/⭐5/⭐6/⭐7, the ⭐A counter, and 10♦ mimic of ⭐J).', 'Combos'),
  flag('combo.ultras.enabled', 'Ultra Combos', 'Three- and four-card Ultra plays, including the 3-red Ultra counter.', 'Combos'),
  flag('voltage.enabled', 'Voltage declarations', 'Voltage 3/4/5 declarations in the Start phase.', 'Systems'),
  flag('royalMarriage.enabled', 'Royal Marriage', 'Same-suit King+Queen Royal Marriage entry.', 'Systems'),
  flag('queensCourt.enabled', "Queen's Court", 'Two-Queen court entry.', 'Systems'),
  flag('royalShield.enabled', 'Royal Shield', 'Queen-count comparison that grants counter protection at declaration.', 'Systems'),
  flag('foundation.bonus.enabled', '10♣ Foundation bonus', 'Zero-point 10♣ Foundation bonus score (and its next-phase restriction).', 'Rank 10'),
  flag('suddenDeath.enabled', 'Sudden Death', 'Sudden Death declarations (unrestricted profile only).', 'Systems'),
]);

export const MUTATION_TARGET_BY_ID = Object.freeze(Object.fromEntries(MUTATION_TARGETS.map((target) => [target.id, target])));

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}

export function mutationTarget(targetId) {
  return MUTATION_TARGET_BY_ID[targetId] ?? null;
}

/**
 * Normalize + strictly validate a candidate mutation. Returns a canonical,
 * frozen RuleMutation or throws a coded error:
 *   MUTATION_TARGET_UNKNOWN / MUTATION_TYPE_MISMATCH / MUTATION_OUT_OF_RANGE /
 *   MUTATION_NO_CHANGE / MUTATION_LABEL_INVALID
 * @param {{ targetId: string, mutatedValue: number|boolean, label?: string, description?: string }} input
 * @returns {{ id: string, targetId: string, type: 'numeric'|'boolean', baselineValue: number|boolean, mutatedValue: number|boolean, label: string, description: string }}
 */
export function createRuleMutation(input) {
  if (!input || typeof input !== 'object') fail('MUTATION_INPUT_INVALID', 'A mutation requires a target and a mutated value');
  const target = mutationTarget(input.targetId);
  if (!target) fail('MUTATION_TARGET_UNKNOWN', `Unknown mutation target: ${input.targetId}`);
  const value = input.mutatedValue;
  if (target.kind === 'numeric') {
    if (typeof value !== 'number' || !Number.isInteger(value)) fail('MUTATION_TYPE_MISMATCH', `${target.label} requires an integer value`);
    if (value < target.min || value > target.max) fail('MUTATION_OUT_OF_RANGE', `${target.label} value ${value} outside permitted range ${target.min}–${target.max}`);
  } else {
    if (typeof value !== 'boolean') fail('MUTATION_TYPE_MISMATCH', `${target.label} requires a boolean value`);
  }
  if (value === target.baseline) fail('MUTATION_NO_CHANGE', 'The mutated value equals the baseline — no rule would change');
  const label = typeof input.label === 'string' && input.label.trim() ? input.label.trim() : `${target.label}: ${formatValue(target.baseline)} → ${formatValue(value)}`;
  if (label.length > MUTATION_LIMITS.labelChars) fail('MUTATION_LABEL_INVALID', 'Mutation label exceeds 160 characters');
  const mutation = {
    targetId: target.id,
    type: target.kind === 'numeric' ? 'numeric' : 'boolean',
    baselineValue: target.baseline,
    mutatedValue: value,
    label,
    description: typeof input.description === 'string' ? input.description.trim().slice(0, 400) : (target.description ?? ''),
  };
  return Object.freeze({ ...mutation, id: `MUT-${hashCanonical(mutation).slice(0, 16)}` });
}

/**
 * Re-validate a deserialized mutation object (load/import path). Same
 * validation as createRuleMutation, but preserves the persisted id.
 * @param {*} value
 */
export function validateRuleMutation(value) {
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !value.id) fail('MUTATION_INPUT_INVALID', 'Persisted mutation is missing its id');
  const rebuilt = createRuleMutation({ targetId: value.targetId, mutatedValue: value.mutatedValue, label: value.label, description: value.description });
  if (rebuilt.id !== value.id) fail('MUTATION_IDENTITY_MISMATCH', 'Persisted mutation id does not match its content hash');
  return rebuilt;
}

/** Convert a validated mutation into the engine's scoped override map. */
export function mutationRuleOverrides(mutation) {
  const target = mutationTarget(mutation?.targetId);
  if (!target) fail('MUTATION_TARGET_UNKNOWN', `Unknown mutation target: ${mutation?.targetId}`);
  return { [target.id]: mutation.mutatedValue };
}

export function mutationFingerprint(mutation) {
  return hashCanonical({ targetId: mutation.targetId, mutatedValue: mutation.mutatedValue });
}

function formatValue(value) {
  return typeof value === 'boolean' ? (value ? 'enabled' : 'disabled') : String(value);
}

export function mutationDisplay(mutation) {
  return `${mutation.label} (${formatValue(mutation.baselineValue)} → ${formatValue(mutation.mutatedValue)})`;
}

/**
 * Normalize + validate the experiment configuration.
 * @param {{
 *   profileId?: string,
 *   population: readonly string[],
 *   gamesPerArm: number,
 *   matchedSeeds?: boolean,
 *   swapSides?: boolean,
 *   seedBase: number,
 *   decisionLimit?: number,
 * }} input
 */
export function createExperimentConfig(input) {
  if (!input || typeof input !== 'object') fail('EXPERIMENT_CONFIG_INVALID', 'Experiment configuration is required');
  const profileId = typeof input.profileId === 'string' && input.profileId.startsWith('core-') ? input.profileId : 'core-advanced-authority';
  const population = [...new Set((input.population ?? []).filter((id) => typeof id === 'string' && id))].sort();
  if (population.length < 1) fail('EXPERIMENT_POPULATION_EMPTY', 'Select at least one agent profile for the population');
  if (population.length > MUTATION_LIMITS.populationMax) fail('EXPERIMENT_POPULATION_TOO_LARGE', `Population limited to ${MUTATION_LIMITS.populationMax} profiles`);
  const gamesPerArm = input.gamesPerArm;
  if (!Number.isInteger(gamesPerArm) || gamesPerArm < 2 || gamesPerArm > MUTATION_LIMITS.gamesPerArm) fail('EXPERIMENT_GAMES_INVALID', `Games per arm must be an integer 2–${MUTATION_LIMITS.gamesPerArm}`);
  const seedBase = Number.isInteger(input.seedBase) && input.seedBase > 0 ? input.seedBase >>> 0 : 1;
  const decisionLimit = Number.isInteger(input.decisionLimit) && input.decisionLimit > 0 ? input.decisionLimit : 1800;
  return Object.freeze({
    profileId,
    population: Object.freeze(population),
    gamesPerArm,
    matchedSeeds: input.matchedSeeds !== false,
    swapSides: input.swapSides !== false,
    seedBase,
    decisionLimit,
    // Predeclared experimental objective — chosen before execution and frozen
    // into the config so the verdict can never reinterpret intent post hoc.
    // null means "exploratory": supported movement is reported, never called
    // beneficial.
    objective: createExperimentObjective(input.objective ?? null),
  });
}

/**
 * Deterministic per-match seed. When matched seeds are enabled the SAME seed
 * is assigned to the control and mutant match of every (policy, ordinal) pair.
 * When disabled the arm name enters the derivation so the two arms draw from
 * independent (but still deterministic) seed streams — the plan records
 * matchedSeeds:false so the UI never claims pairing it did not do.
 */
export function matchSeed({ seedBase, policyId, profileId, ordinal, arm, matchedSeeds }) {
  const input = matchedSeeds
    ? { seedBase, policyId, profileId, ordinal, stream: 'MUTATION_SEED_V1' }
    : { seedBase, policyId, profileId, ordinal, arm, stream: 'MUTATION_SEED_V1' };
  const hex = hashCanonical(input).slice(0, 8);
  return (parseInt(hex, 16) >>> 0) || 1;
}

/**
 * Build the complete matched A/B match plan. Returns a flat list of run specs;
 * each spec carries arm identity, the paired ordinal, seat order, policies and
 * the arm's rule override map. The control arm always carries null overrides.
 * @param {{ experimentId: string, mutation: *, config: * }} input
 * @returns {{ experimentId: string, matchedSeeds: boolean, swapSides: boolean, specs: Array }}
 */
export function buildMutationExperimentPlan({ experimentId, mutation, config }) {
  const overrides = mutation ? mutationRuleOverrides(mutation) : null;
  const population = config.population;
  const perPolicy = Math.floor(config.gamesPerArm / population.length);
  const remainder = config.gamesPerArm - perPolicy * population.length;
  const specs = [];
  for (const arm of [MUTATION_ARM.CONTROL, MUTATION_ARM.MUTANT]) {
    let ordinal = 0;
    for (let p = 0; p < population.length; p += 1) {
      const policyId = population[p];
      const games = perPolicy + (p < remainder ? 1 : 0);
      for (let i = 0; i < games; i += 1) {
        const seatOrder = config.swapSides && ordinal % 2 === 1 ? ['P2', 'P1'] : ['P1', 'P2'];
        specs.push(Object.freeze({
          experimentId,
          arm,
          ordinal,
          pairIndex: i,
          pairedRunId: `PAIR-${experimentId}-${policyId}-${i}`,
          policyId,
          policyIds: [policyId, policyId],
          seatOrder,
          seatSwapped: seatOrder[0] === 'P2',
          profileId: config.profileId,
          seed: matchSeed({ seedBase: config.seedBase, policyId, profileId: config.profileId, ordinal: i, arm, matchedSeeds: config.matchedSeeds }),
          decisionLimit: config.decisionLimit,
          ruleOverrides: arm === MUTATION_ARM.MUTANT ? overrides : null,
        }));
        ordinal += 1;
      }
    }
  }
  return Object.freeze({ experimentId, matchedSeeds: config.matchedSeeds, swapSides: config.swapSides, specs: Object.freeze(specs) });
}

// ── Arm aggregation ─────────────────────────────────────────────────────────

function summarize(values) {
  if (!values.length) return { n: 0, mean: null, min: null, max: null, p50: null, p90: null };
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return { n: sorted.length, mean: sorted.reduce((a, b) => a + b, 0) / sorted.length, min: sorted[0], max: sorted[sorted.length - 1], p50: q(0.5), p90: q(0.9) };
}

const meanOf = (summaries, selector) => {
  const values = summaries.map(selector).filter((v) => Number.isFinite(v));
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
};

function countFamilyMean(summaries, family) {
  return meanOf(summaries, (s) => Number(s.decisionFamilyCounts?.[family] ?? 0));
}

/**
 * Aggregate one arm's match summaries. Results keep arm identity — callers
 * MUST pass only one arm's summaries. Aborted and unfinished games are
 * counted, never silently dropped.
 * @param {Array} summaries - summary objects from runPolicyMatch results
 */
export function summarizeMutationArm(summaries) {
  const games = summaries.length;
  const completed = summaries.filter((s) => s.winner === 'P1' || s.winner === 'P2').length;
  const draws = summaries.filter((s) => s.winner === 'DRAW').length;
  const aborted = games - completed - draws;
  const decisive = completed;
  const seat1Wins = summaries.filter((s) => s.winningSeat === 1).length;
  const turns = summaries.map((s) => Number(s.completedFullTurns ?? 0)).filter(Number.isFinite);
  const longGames = turns.filter((t) => t > LONG_GAME_TURNS).length;
  const terminationReasons = {}, errorCodes = {}, policyBreakdown = {};
  let complianceFailures = 0, complianceUnavailable = 0;
  for (const s of summaries) {
    const reason = s.terminationReason ?? 'UNKNOWN';
    terminationReasons[reason] = (terminationReasons[reason] ?? 0) + 1;
    if (s.errorCode) errorCodes[s.errorCode] = (errorCodes[s.errorCode] ?? 0) + 1;
    const status = s.ruleCompliance?.status ?? null;
    if (status === 'FAIL') complianceFailures += 1;
    else if (status !== 'PASS') complianceUnavailable += 1;
    const policyId = Array.isArray(s.policyIds) && s.policyIds[0] === s.policyIds[1] ? s.policyIds[0] : 'mixed';
    const bucket = policyBreakdown[policyId] ?? (policyBreakdown[policyId] = { games: 0, wins: 0, losses: 0, draws: 0, aborted: 0, seat1Wins: 0, decisive: 0, turns: [] });
    bucket.games += 1;
    if (s.winner === 'DRAW') bucket.draws += 1;
    else if (s.winner === 'P1' || s.winner === 'P2') { bucket.decisive += 1; bucket.wins += s.winner === 'P1' ? 1 : 0; bucket.losses += s.winner === 'P2' ? 1 : 0; if (s.winningSeat === 1) bucket.seat1Wins += 1; }
    else bucket.aborted += 1;
    if (Number.isFinite(Number(s.completedFullTurns))) bucket.turns.push(Number(s.completedFullTurns));
  }
  return {
    games, completed, draws, aborted, decisive,
    winRateDenominator: 'decisive',
    seat1Wins,
    seat1WinRate: decisive > 0 ? seat1Wins / decisive : null,
    seat1Wilson: decisive > 0 ? wilsonInterval(seat1Wins, decisive) : null,
    drawRate: games > 0 ? draws / games : null,
    abortRate: games > 0 ? aborted / games : null,
    abortRateWilson: games > 0 ? wilsonInterval(aborted, games) : null,
    decisionLimitCount: terminationReasons.DECISION_LIMIT ?? 0,
    engineRejectionCount: terminationReasons.ENGINE_REJECTION ?? 0,
    unsupportedCount: terminationReasons.UNSUPPORTED_CONFIGURATION ?? 0,
    turns: summarize(turns),
    longGames,
    longGameRate: games > 0 ? longGames / games : null,
    meanMargin: meanOf(summaries, (s) => Number(s.scoreMargin)),
    meanCommands: meanOf(summaries, (s) => Number(s.commandCount)),
    meanEvents: meanOf(summaries, (s) => Number(s.eventCount)),
    meanActions: meanOf(summaries, (s) => Object.values(s.actionCounts ?? {}).reduce((a, b) => a + Number(b ?? 0), 0)),
    meanMiniTurnActions: meanOf(summaries, (s) => (s.participants ?? []).reduce((a, p) => a + Number(p.miniTurnActionCount ?? 0), 0)),
    meanAdvancedDecisions: meanOf(summaries, (s) => Number(s.advancedDecisionCount ?? 0)),
    meanVoltageDecisions: meanOf(summaries, (s) => Number(s.voltageDecisionCount ?? 0)),
    meanUltraDecisions: meanOf(summaries, (s) => Number(s.ultraDecisionCount ?? 0)),
    meanTriggerCount: meanOf(summaries, (s) => Number(s.triggerCount ?? 0)),
    meanResponseDecisions: meanOf(summaries, (s) => Number(s.responseDecisionCount ?? 0)),
    meanPrivateChoiceDecisions: meanOf(summaries, (s) => Number(s.privateChoiceDecisionCount ?? 0)),
    familyMeans: {
      super: countFamilyMean(summaries, 'super'),
      ultra: countFamilyMean(summaries, 'ultra'),
      voltage: countFamilyMean(summaries, 'voltage'),
      rank10: countFamilyMean(summaries, 'rank10'),
      'royal-marriage': countFamilyMean(summaries, 'royal-marriage'),
      'queens-court': countFamilyMean(summaries, 'queens-court'),
      score: countFamilyMean(summaries, 'score'),
      draw: countFamilyMean(summaries, 'draw'),
      scuttle: countFamilyMean(summaries, 'scuttle'),
    },
    complianceFailures, complianceUnavailable,
    terminationReasons, errorCodes,
    policyBreakdown: Object.fromEntries(Object.entries(policyBreakdown).map(([k, b]) => [k, {
      games: b.games, wins: b.wins, losses: b.losses, draws: b.draws, aborted: b.aborted, decisive: b.decisive,
      // Sufficient statistics survive aggregation — downstream inference must
      // derive from raw counts, never from the rounded display rates.
      seat1Wins: b.seat1Wins,
      winRate: b.decisive > 0 ? b.wins / b.decisive : null,
      seat1WinRate: b.decisive > 0 ? b.seat1Wins / b.decisive : null,
      meanTurns: b.turns.length ? b.turns.reduce((a, c) => a + c, 0) / b.turns.length : null,
    }])),
  };
}

/**
 * Align the two arms into genuine matched pairs. A pair requires the same
 * pairedRunId, the same seed, the same seat order, and the same policies —
 * anything missing on one side stays unpaired and is reported honestly.
 *
 * Coverage contract — two different questions, two different fields:
 *   coverage / mutantCoverage — descriptive per-arm pairing rates;
 *   exact — the Boolean claim "every row in BOTH arms is paired", which is
 *   symmetric: extra unmatched mutant rows make it false just as extra
 *   unmatched control rows do. Never derive exactness from coverage alone.
 * @returns {{ pairs: Array<{control: *, mutant: *}>, unpairedControl: Array, unpairedMutant: Array, coverage: number, mutantCoverage: number, exact: boolean }}
 */
export function pairArmResults(controlSummaries, mutantSummaries) {
  const key = (s) => `${s.pairedRunId ?? ''}|${s.seed}|${(s.seatOrder ?? []).join(',')}|${(s.policyIds ?? []).join(',')}`;
  const mutantByKey = new Map();
  for (const s of mutantSummaries) {
    const k = key(s);
    if (!mutantByKey.has(k)) mutantByKey.set(k, []);
    mutantByKey.get(k).push(s);
  }
  const pairs = [], unpairedControl = [];
  for (const s of controlSummaries) {
    const bucket = mutantByKey.get(key(s));
    if (bucket && bucket.length > 0) pairs.push({ control: s, mutant: bucket.shift() });
    else unpairedControl.push(s);
  }
  const unpairedMutant = [...mutantByKey.values()].flat();
  const coverage = controlSummaries.length ? pairs.length / controlSummaries.length : 0;
  const mutantCoverage = mutantSummaries.length ? pairs.length / mutantSummaries.length : 0;
  const exact = pairs.length > 0 && unpairedControl.length === 0 && unpairedMutant.length === 0;
  return { pairs, unpairedControl, unpairedMutant, coverage, mutantCoverage, exact };
}

// ── Impact vector ───────────────────────────────────────────────────────────

// Fixed family size for Bonferroni multiplicity adjustment: 4 rate rows +
// 11 mean rows. Without a q-value the shared grader can never reach any
// evidence tier (q defaults to 1), which would make every supported-movement
// verdict unreachable. Bonferroni is conservative and honest — it can only
// make evidence HARDER to claim, never easier.
const MUTATION_METRIC_FAMILY_SIZE = 15;
const adjustedQ = (pValue) => (pValue == null || !Number.isFinite(pValue) ? null : Math.min(1, pValue * MUTATION_METRIC_FAMILY_SIZE));

function rateRow(key, label, controlCount, mutantCount, controlTotal, mutantTotal) {
  const diff = differenceInProportions(mutantCount, mutantTotal, controlCount, controlTotal);
  const grade = evidenceGradeDetailed({ sampleSize: Math.min(mutantTotal, controlTotal), interval: diff.interval, effectSize: diff.estimate, cohortBalance: Math.min(mutantTotal, controlTotal) / Math.max(mutantTotal, controlTotal, 1), qValue: adjustedQ(diff.pValue) });
  return {
    key, label, unit: 'proportion', deltaKind: 'pp',
    control: controlTotal > 0 ? controlCount / controlTotal : null,
    mutant: mutantTotal > 0 ? mutantCount / mutantTotal : null,
    delta: diff.estimate, interval: diff.interval, pValue: diff.pValue,
    grade: grade.grade, gradeReasons: grade.reasons,
    n: { control: controlTotal, mutant: mutantTotal },
  };
}

function meanRow(key, label, controlStats, mutantStats, pairs, selector, pairedCoverage) {
  const c = selector(controlStats), m = selector(mutantStats);
  const delta = c != null && m != null ? m - c : null;
  let interval = [null, null], pValue = null, paired = false;
  const diffs = pairs.map(({ control, mutant }) => {
    const mv = selector(mutant), cv = selector(control);
    return Number.isFinite(mv) && Number.isFinite(cv) ? mv - cv : null;
  }).filter((v) => v != null);
  if (diffs.length >= 2) {
    paired = true;
    const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const variance = diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / (diffs.length - 1);
    const se = Math.sqrt(variance / diffs.length);
    interval = se > 0 ? [mean - 1.959964 * se, mean + 1.959964 * se] : [mean, mean];
    const z = se > 0 ? mean / se : 0;
    pValue = z === 0 ? 1 : 2 * (1 - normalCdf(Math.abs(z)));
  }
  const grade = evidenceGradeDetailed({
    sampleSize: diffs.length, interval, effectSize: delta,
    pairedCoverage, scale: 'difference', qValue: adjustedQ(pValue),
  });
  return {
    key, label, unit: 'mean', deltaKind: 'mean',
    control: c, mutant: m, delta, interval, pValue,
    paired, pairedN: diffs.length,
    grade: grade.grade, gradeReasons: grade.reasons,
    n: { control: controlStats?.games ?? 0, mutant: mutantStats?.games ?? 0 },
  };
}

/**
 * Compare two aggregated arms into the impact vector. Raw per-pair stats are
 * computed only over genuine matched pairs.
 * @param {*} control - summarizeMutationArm output for the control arm
 * @param {*} mutant - summarizeMutationArm output for the mutant arm
 * @param {{ pairs: Array, coverage: number }} pairing - pairArmResults output
 */
export function compareArms(control, mutant, pairing) {
  const rows = [];
  rows.push(rateRow('seat1WinRate', 'First-player win rate',
    control.seat1Wins, mutant.seat1Wins, control.decisive, mutant.decisive));
  rows.push(rateRow('drawRate', 'Draw rate',
    control.draws, mutant.draws, control.games, mutant.games));
  rows.push(rateRow('abortRate', 'Abort / invalid rate',
    control.aborted, mutant.aborted, control.games, mutant.games));
  rows.push(rateRow('longGameRate', `Long-game rate (> ${LONG_GAME_TURNS} FT)`,
    control.longGames, mutant.longGames, control.games, mutant.games));
  const meanRows = [
    ['meanTurns', 'Mean game length (Full Turns)', (s) => s?.turns?.mean ?? null],
    ['meanMargin', 'Mean score margin', (s) => s?.meanMargin ?? null],
    ['meanCommands', 'Mean commands', (s) => s?.meanCommands ?? null],
    ['meanActions', 'Mean actions', (s) => s?.meanActions ?? null],
    ['meanMiniTurnActions', 'Mean Mini-Turn actions', (s) => s?.meanMiniTurnActions ?? null],
    ['meanAdvancedDecisions', 'Mean advanced decisions', (s) => s?.meanAdvancedDecisions ?? null],
    ['meanVoltageDecisions', 'Mean Voltage decisions', (s) => s?.meanVoltageDecisions ?? null],
    ['meanUltraDecisions', 'Mean Ultra decisions', (s) => s?.meanUltraDecisions ?? null],
    ['meanTriggerCount', 'Mean trigger events', (s) => s?.meanTriggerCount ?? null],
    ['meanResponseDecisions', 'Mean response decisions', (s) => s?.meanResponseDecisions ?? null],
  ];
  for (const [key, label, selector] of meanRows) {
    rows.push(meanRow(key, label, control, mutant,
      pairing.pairs.map(({ control: cs, mutant: ms }) => ({ control: { games: 1, [key]: perGameMetric(cs, key) }, mutant: { games: 1, [key]: perGameMetric(ms, key) } })),
      (s) => (s && s.games === 1 ? s[key] : selector(s)), pairing.coverage));
  }
  return {
    // `matched` is the exact-pairing claim: symmetric over both arms. The
    // asymmetric coverage ratio stays available as a descriptive metric only.
    matched: pairing.exact ?? (pairing.coverage >= 0.99 && (pairing.unpairedMutant?.length ?? 0) === 0),
    pairedCoverage: pairing.coverage,
    pairedMutantCoverage: pairing.mutantCoverage ?? null,
    pairedN: pairing.pairs.length,
    unpairedControl: pairing.unpairedControl.length,
    unpairedMutant: pairing.unpairedMutant.length,
    rows,
    policyDeltas: comparePolicyBreakdown(control.policyBreakdown, mutant.policyBreakdown),
  };
}

function perGameMetric(summary, key) {
  switch (key) {
    case 'meanTurns': return Number(summary.completedFullTurns ?? NaN);
    case 'meanMargin': return Number(summary.scoreMargin ?? NaN);
    case 'meanCommands': return Number(summary.commandCount ?? NaN);
    case 'meanActions': return Object.values(summary.actionCounts ?? {}).reduce((a, b) => a + Number(b ?? 0), 0);
    case 'meanMiniTurnActions': return (summary.participants ?? []).reduce((a, p) => a + Number(p.miniTurnActionCount ?? 0), 0);
    case 'meanAdvancedDecisions': return Number(summary.advancedDecisionCount ?? NaN);
    case 'meanVoltageDecisions': return Number(summary.voltageDecisionCount ?? NaN);
    case 'meanUltraDecisions': return Number(summary.ultraDecisionCount ?? NaN);
    case 'meanTriggerCount': return Number(summary.triggerCount ?? NaN);
    case 'meanResponseDecisions': return Number(summary.responseDecisionCount ?? NaN);
    default: return NaN;
  }
}

/**
 * Per-agent-profile differential: how each population policy's metrics shift
 * under the mutation. Samples keep per-policy counts; inadequate samples are
 * marked, never overstated.
 */
export function comparePolicyBreakdown(controlBreakdown, mutantBreakdown) {
  const ids = [...new Set([...Object.keys(controlBreakdown ?? {}), ...Object.keys(mutantBreakdown ?? {})])].sort();
  return ids.map((policyId) => {
    const c = controlBreakdown?.[policyId] ?? { games: 0, decisive: 0, wins: 0, seat1Wins: 0 };
    const m = mutantBreakdown?.[policyId] ?? { games: 0, decisive: 0, wins: 0, seat1Wins: 0 };
    const winDiff = differenceInProportions(m.seat1Wins ?? 0, m.decisive, c.seat1Wins ?? 0, c.decisive);
    const adequate = c.games >= 20 && m.games >= 20;
    return {
      policyId,
      n: { control: c.games, mutant: m.games, decisiveControl: c.decisive, decisiveMutant: m.decisive },
      control: { winRate: c.winRate, seat1WinRate: c.seat1WinRate, meanTurns: c.meanTurns },
      mutant: { winRate: m.winRate, seat1WinRate: m.seat1WinRate, meanTurns: m.meanTurns },
      seat1Delta: winDiff.estimate, seat1Interval: winDiff.interval, seat1PValue: winDiff.pValue,
      turnsDelta: c.meanTurns != null && m.meanTurns != null ? m.meanTurns - c.meanTurns : null,
      adequate,
      warning: adequate ? null : 'SMALL_SAMPLE',
    };
  });
}

// ── Regression detector ─────────────────────────────────────────────────────

/**
 * Deterministic health checks over the arm comparison. Each finding states
 * what was measured; checks that could not run are listed under `checked:false`
 * via the `unmeasured` list instead of being silently assumed healthy.
 */
export function detectRegressions({ control, mutant, comparison }) {
  const findings = [];
  const checked = [];
  const push = (code, severity, detail, evidence) => findings.push({ code, severity, detail, evidence });

  checked.push('abort-rate');
  if (control.abortRate != null && mutant.abortRate != null) {
    const d = differenceInProportions(mutant.aborted, mutant.games, control.aborted, control.games);
    if (d.estimate != null && d.estimate > 0.02 && d.interval[0] != null && d.interval[0] > 0) {
      push('ABORT_RATE_INCREASE', 'warning', `Abort/invalid-game rate rose ${(d.estimate * 100).toFixed(1)}pp under the mutation (control ${(control.abortRate * 100).toFixed(1)}% → mutant ${(mutant.abortRate * 100).toFixed(1)}%).`, { delta: d.estimate, interval: d.interval });
    }
  }

  checked.push('termination-reasons');
  for (const reason of ['DECISION_LIMIT', 'ENGINE_REJECTION', 'UNSUPPORTED_CONFIGURATION']) {
    const c = control.terminationReasons[reason] ?? 0;
    const m = mutant.terminationReasons[reason] ?? 0;
    if (m > c && m > 0) {
      push(`TERMINATION_${reason}`, 'warning', `${reason} games: control ${c} → mutant ${m}.`, { control: c, mutant: m });
    }
  }

  checked.push('rule-compliance');
  if (mutant.complianceFailures > 0) {
    push('RULE_COMPLIANCE_FAILURE', 'critical', `${mutant.complianceFailures} mutant game(s) failed authoritative rule-compliance checks.`, { failures: mutant.complianceFailures, control: control.complianceFailures });
  }

  checked.push('error-codes');
  const mutantErrors = Object.entries(mutant.errorCodes ?? {}).filter(([, n]) => n > 0);
  if (mutantErrors.length) {
    push('ENGINE_ERROR_CODES', 'warning', `Mutant arm produced engine error codes: ${mutantErrors.map(([k, n]) => `${k}×${n}`).join(', ')}.`, { control: control.errorCodes, mutant: mutant.errorCodes });
  }

  checked.push('long-games');
  if (control.longGameRate != null && mutant.longGameRate != null) {
    const d = differenceInProportions(mutant.longGames, mutant.games, control.longGames, control.games);
    if (d.estimate != null && d.estimate > 0.05 && d.interval[0] != null && d.interval[0] > 0) {
      push('LONG_GAME_FREQUENCY', 'warning', `Long games (> ${LONG_GAME_TURNS} FT) rose ${(d.estimate * 100).toFixed(1)}pp — possible runaway tempo economy.`, { delta: d.estimate, controlRate: control.longGameRate, mutantRate: mutant.longGameRate });
    }
  }

  checked.push('first-player-shift');
  const seat1Row = comparison?.rows?.find((row) => row.key === 'seat1WinRate');
  if (seat1Row?.interval?.[0] != null && seat1Row.interval[0] > 0.05) {
    push('FIRST_PLAYER_SHIFT', 'info', `First-player advantage shifted ${(seat1Row.delta * 100).toFixed(1)}pp under the mutation — the mutant materially changes seat balance.`, { delta: seat1Row.delta, interval: seat1Row.interval });
  }

  const unmeasured = ['comeback-frequency', 'zone-accumulation', 'strategy-diversity', 'matchup-matrix'];
  return {
    status: findings.some((f) => f.severity === 'critical') ? 'REGRESSION' : findings.length ? 'WARNING' : 'CLEAR',
    summary: findings.length === 0
      ? 'No major regressions detected in measured diagnostics.'
      : `${findings.length} finding(s) across ${checked.length} checks.`,
    findings, checked, unmeasured,
  };
}

// ── Outcome classification ──────────────────────────────────────────────────

/**
 * Deterministic experiment verdict, evaluated against the experiment's
 * PREDECLARED objective (config.objective). A supported effect can only be
 * called beneficial when the recorded objective declared that metric and that
 * direction before execution — desirability is never reverse-engineered from
 * whichever metric happened to move.
 *
 *   PROMISING    — the objective metric moved in the declared direction by at
 *                  least minimumMeaningfulEffect, with no regression finding
 *                  and no other supported movement.
 *   TRADEOFF     — the objective was met, but other metric(s) also moved with
 *                  supported evidence.
 *   ADVERSE      — the objective metric moved with supported evidence in the
 *                  direction OPPOSITE the declared intent.
 *   UNEXPECTED   — supported movement exists, but not on the declared
 *                  objective metric.
 *   EXPLORATORY  — supported movement exists and the objective is exploratory
 *                  (or absent, e.g. a legacy artifact): reported as observed
 *                  movement, never as a benefit.
 *   REGRESSION   — any critical/warning regression finding.
 *   INCONCLUSIVE — nothing reached the exploratory evidence grade, or the
 *                  target moved less than minimumMeaningfulEffect.
 *
 * Marked provisional when sample sizes are thin.
 */
export function classifyOutcome({ comparison, regressions, mutation, objective = null }) {
  const supported = comparison.rows.filter((row) => ['EXPLORATORY', 'SUPPORTED', 'ROBUST'].includes(row.grade));
  const regressing = regressions.findings.filter((f) => f.severity === 'critical' || f.severity === 'warning');
  const smallSample = Math.min(comparison.rows[0]?.n?.control ?? 0, comparison.rows[0]?.n?.mutant ?? 0) < 100;
  const targetGroup = mutationTarget(mutation?.targetId)?.group ?? '';
  const reasons = [
    `${supported.length} metric(s) reached exploratory-or-better evidence`,
    `${regressing.length} regression finding(s)`,
    ...(smallSample ? [`small sample (<100 per arm) — verdict is provisional`] : []),
  ];
  let verdict;
  if (regressing.length > 0) verdict = MUTATION_OUTCOME.REGRESSION;
  else if (supported.length === 0) verdict = MUTATION_OUTCOME.INCONCLUSIVE;
  else {
    const objectiveValid = objective && typeof objective === 'object' && MUTATION_OBJECTIVE_DIRECTIONS.includes(objective.direction);
    const direction = objectiveValid ? objective.direction : 'exploratory';
    if (direction === 'exploratory') {
      verdict = MUTATION_OUTCOME.EXPLORATORY;
      reasons.push(`no directional objective was predeclared — supported movement on ${supported.map((r) => r.key).join(', ')} is reported as observed exploratory movement, not a benefit`);
    } else {
      const targetRow = comparison.rows.find((row) => row.key === objective.metric);
      if (!targetRow || !supported.includes(targetRow)) {
        verdict = MUTATION_OUTCOME.UNEXPECTED;
        reasons.push(`supported movement on ${supported.map((r) => r.key).join(', ')}, but the declared objective metric ${objective.metric} did not reach exploratory evidence`);
      } else {
        const delta = targetRow.delta;
        const minimum = Number.isFinite(objective.minimumMeaningfulEffect) ? objective.minimumMeaningfulEffect : 0;
        const meaningful = Number.isFinite(delta) && Math.abs(delta) >= minimum;
        const desired = direction === 'increase' ? delta > 0 : direction === 'decrease' ? delta < 0 : delta !== 0;
        const fmtDelta = Number.isFinite(delta) ? (targetRow.unit === 'proportion' ? `${(delta * 100).toFixed(1)}pp` : `${delta}`) : 'unavailable';
        if (!meaningful) {
          verdict = MUTATION_OUTCOME.INCONCLUSIVE;
          reasons.push(`${objective.metric} moved ${fmtDelta} — inside the declared minimum meaningful effect ${minimum}; treated as no meaningful effect`);
        } else if (!desired) {
          verdict = MUTATION_OUTCOME.ADVERSE;
          reasons.push(`${objective.metric} moved ${fmtDelta} — supported evidence in the direction OPPOSITE the declared ${direction} objective${targetGroup ? ` (target family: ${targetGroup})` : ''}`);
        } else {
          const offTarget = supported.filter((row) => row !== targetRow);
          if (offTarget.length > 0) {
            verdict = MUTATION_OUTCOME.TRADEOFF;
            reasons.push(`objective met: ${objective.metric} moved ${fmtDelta} in the declared ${direction} direction, but ${offTarget.length} other metric(s) also moved with support (${offTarget.map((r) => r.key).join(', ')})`);
          } else {
            verdict = MUTATION_OUTCOME.PROMISING;
            reasons.push(`declared objective met: ${objective.metric} moved ${fmtDelta} in the ${direction} direction with ${targetRow.grade} evidence${targetGroup ? ` (target family: ${targetGroup})` : ''}`);
          }
        }
      }
    }
  }
  return {
    verdict,
    provisional: smallSample,
    reasons,
    supportedMetrics: supported.map((row) => row.key),
  };
}

// ── Experiment artifact ─────────────────────────────────────────────────────

/**
 * Create the experiment record (before any games run). The baseline identity
 * captures engine/rules/lab versions + authority hash so historical artifacts
 * cannot be silently misread as results from a later ruleset.
 */
export function createExperimentRecord({ experimentId, createdAt, baseline, mutation, hypothesis, config }) {
  const record = {
    experimentType: MUTATION_EXPERIMENT_TYPE,
    schemaVersion: MUTATION_EXPERIMENT_SCHEMA_VERSION,
    experimentId,
    createdAt,
    baseline: {
      engineVersion: baseline.engineVersion,
      rulesVersion: baseline.rulesVersion,
      labVersion: baseline.labVersion,
      authorityHash: baseline.authorityHash ?? null,
      profileId: config.profileId,
      description: 'Current authoritative Intrilex ruleset',
    },
    mutationMode: 'surgical',
    mutation,
    hypothesis: typeof hypothesis === 'string' ? hypothesis.trim().slice(0, MUTATION_LIMITS.hypothesisChars) : '',
    config,
    status: MUTATION_STATUS.CONFIGURED,
    arms: { control: { summaries: [], summary: null }, mutant: { summaries: [], summary: null } },
    comparison: null,
    regressions: null,
    outcome: null,
    contentHash: null,
  };
  record.contentHash = experimentContentHash(record);
  return record;
}

export function experimentContentHash(record) {
  const { contentHash: _hash, ...rest } = record;
  return hashCanonical(rest);
}

/**
 * Execution-ledger audit: proves that the completed result set IS the planned
 * spec set — not merely the same row count. Every planned spec has a stable
 * identity `arm|pairedRunId`; the executed set must contain each identity
 * exactly once, carry matching seed / seat order / policy identity, contain
 * no unexpected extras, and contain no worker faults (a fault is a disclosed
 * non-execution, never a silent success).
 *
 * `exact` is the only field a COMPLETE verdict may rest on. `missing`,
 * `duplicates`, `unexpected`, `mismatched` and `faults` disclose precisely
 * which invariant failed — nothing is silently repaired.
 *
 * @param {{ specs?: Array } | null} plan - buildMutationExperimentPlan output
 * @param {{ controlSummaries?: Array, mutantSummaries?: Array }} arms
 */
export function auditExecutionLedger(plan, { controlSummaries = [], mutantSummaries = [] } = {}) {
  /** @type {Map<string, *>} */
  const expected = new Map();
  for (const spec of plan?.specs ?? []) expected.set(`${spec.arm}|${spec.pairedRunId}`, spec);
  const plannedPairs = new Set((plan?.specs ?? []).map((s) => s.pairedRunId)).size;
  const seen = new Map();
  const unexpected = [], mismatched = [];
  const isFault = (s) => s?.terminationReason === 'WORKER_FAULT' || s?.errorCode === 'MUTATION_WORKER_FAULT';
  const observe = (arm, s) => {
    const key = `${arm}|${s?.pairedRunId ?? ''}`;
    const spec = expected.get(key);
    if (!spec) { unexpected.push(key); return; }
    const entry = seen.get(key) ?? { count: 0, faults: 0 };
    entry.count += 1;
    if (isFault(s)) entry.faults += 1;
    else {
      if (Number(s?.seed) !== spec.seed) mismatched.push(`${key}:seed`);
      if ((s?.seatOrder ?? []).join(',') !== spec.seatOrder.join(',')) mismatched.push(`${key}:seatOrder`);
      if ((s?.policyIds ?? []).join(',') !== spec.policyIds.join(',')) mismatched.push(`${key}:policyIds`);
      // Arm identity discriminator: a mutant result carries the override map;
      // a control result never does. Under matched seeds the other identity
      // fields are identical across arms, so this is the check that catches a
      // result reported in the wrong arm.
      if (hashCanonical(s?.ruleOverrides ?? null) !== hashCanonical(spec.ruleOverrides ?? null)) mismatched.push(`${key}:ruleOverrides`);
    }
    seen.set(key, entry);
  };
  for (const s of controlSummaries) observe(MUTATION_ARM.CONTROL, s);
  for (const s of mutantSummaries) observe(MUTATION_ARM.MUTANT, s);
  const missing = [...expected.keys()].filter((k) => !seen.has(k));
  const duplicates = [...seen.entries()].filter(([, e]) => e.count > 1).map(([k]) => k);
  const faults = [...seen.values()].reduce((n, e) => n + e.faults, 0);
  const executedCount = [...seen.values()].reduce((n, e) => n + e.count, 0);
  const expectedCount = expected.size;
  const exact = expectedCount > 0 && missing.length === 0 && duplicates.length === 0
    && unexpected.length === 0 && mismatched.length === 0 && faults === 0
    && executedCount === expectedCount;
  return {
    verified: expectedCount > 0,
    expectedCount, executedCount, plannedPairs,
    missing, duplicates, unexpected, mismatched, faults,
    exact,
    // Plan identity hash: lets an importer prove completeness independently —
    // the plan is deterministically rebuildable from experimentId+mutation+config.
    planHash: hashCanonical([...expected.keys()].sort()),
  };
}

/**
 * Finalize a record after execution: attach arm summaries, aggregate, compare,
 * detect regressions, classify against the predeclared objective.
 *
 * `status` is COMPLETE only when the execution ledger proves the result set is
 * exactly the planned spec set (every planned spec identity present exactly
 * once, identity fields consistent, no extras, no worker faults). A row-count
 * match alone is NEVER sufficient — a duplicate result cannot stand in for a
 * missing planned spec. Without a plan the ledger cannot be verified, so the
 * record fails closed to INCOMPLETE.
 */
export function finalizeExperimentRecord(record, { controlSummaries, mutantSummaries, plan = null, completedSpecCount, plannedSpecCount }) {
  const next = structuredClone(record);
  next.arms = {
    control: { summaries: controlSummaries, summary: summarizeMutationArm(controlSummaries) },
    mutant: { summaries: mutantSummaries, summary: summarizeMutationArm(mutantSummaries) },
  };
  const pairing = pairArmResults(controlSummaries, mutantSummaries);
  next.arms.control.pairing = { paired: pairing.pairs.length, unpaired: pairing.unpairedControl.length };
  next.arms.mutant.pairing = { paired: pairing.pairs.length, unpaired: pairing.unpairedMutant.length };
  next.comparison = compareArms(next.arms.control.summary, next.arms.mutant.summary, pairing);
  next.regressions = detectRegressions({ control: next.arms.control.summary, mutant: next.arms.mutant.summary, comparison: next.comparison });
  next.outcome = classifyOutcome({ comparison: next.comparison, regressions: next.regressions, mutation: next.mutation, objective: next.config?.objective ?? null });
  const ledger = auditExecutionLedger(plan, { controlSummaries, mutantSummaries });
  const pairedExact = pairing.exact && pairing.pairs.length === ledger.plannedPairs;
  next.execution = {
    plannedSpecCount, completedSpecCount,
    // `matchedSeeds` is a Boolean claim of exact matched-pair execution —
    // symmetric over both arms and bound to the plan, not a coverage ratio.
    matchedSeeds: next.config.matchedSeeds === true && ledger.exact && pairedExact,
    pairedCoverage: pairing.coverage,
    pairedMutantCoverage: pairing.mutantCoverage,
    pairedExact,
    unpairedControl: pairing.unpairedControl.length,
    unpairedMutant: pairing.unpairedMutant.length,
    ledger,
    completedAt: new Date().toISOString(),
  };
  next.status = ledger.exact && completedSpecCount >= plannedSpecCount ? MUTATION_STATUS.COMPLETE : MUTATION_STATUS.INCOMPLETE;
  next.contentHash = experimentContentHash(next);
  return next;
}

/** Strip full per-game summaries for a size-budgeted persisted artifact. */
export function compactExperimentRecord(record, { retainSummaries = 24 } = {}) {
  const next = structuredClone(record);
  for (const arm of ['control', 'mutant']) {
    const list = next.arms[arm].summaries;
    next.arms[arm].summariesRetained = Math.min(list.length, retainSummaries);
    next.arms[arm].summariesDropped = Math.max(0, list.length - retainSummaries);
    next.arms[arm].summaries = list.slice(0, retainSummaries);
  }
  next.contentHash = experimentContentHash(next);
  return next;
}

/**
 * Validate a deserialized experiment artifact. Returns the record when valid;
 * throws a coded error otherwise. Imported records keep their data but are
 * flagged by the store layer (IMPORTED_UNVERIFIED), matching the Evolution Lab
 * convention.
 */
export function validateExperimentRecord(value) {
  if (!value || typeof value !== 'object') fail('EXPERIMENT_INVALID', 'Not a mutation experiment artifact');
  if (value.experimentType !== MUTATION_EXPERIMENT_TYPE) fail('EXPERIMENT_TYPE_MISMATCH', `Expected experimentType ${MUTATION_EXPERIMENT_TYPE}`);
  if (value.schemaVersion !== MUTATION_EXPERIMENT_SCHEMA_VERSION) fail('EXPERIMENT_SCHEMA_UNSUPPORTED', `Unsupported mutation schema version ${value.schemaVersion}`);
  if (value.mutationMode !== 'surgical') fail('EXPERIMENT_MODE_UNSUPPORTED', 'Only surgical single-mutation experiments are supported');
  if (!value.baseline || typeof value.baseline.engineVersion !== 'string') fail('EXPERIMENT_BASELINE_MISSING', 'Baseline identity is missing');
  validateRuleMutation(value.mutation);
  if (!value.config || !Array.isArray(value.config.population)) fail('EXPERIMENT_CONFIG_MISSING', 'Experiment configuration is missing');
  if (value.config.objective != null) validateExperimentObjective(value.config.objective);
  if (!value.arms || !value.arms.control || !value.arms.mutant) fail('EXPERIMENT_ARMS_MISSING', 'Arm-separated results are missing');
  // COMPLETE is a proven claim, not a label: the artifact must carry an exact
  // execution ledger whose plan hash matches the deterministically rebuilt
  // plan. Legacy artifacts that predate the ledger cannot prove completeness
  // and are rejected as unverifiable rather than silently reinterpreted.
  if (value.status === MUTATION_STATUS.COMPLETE) {
    const ledger = value.execution?.ledger;
    if (!ledger || ledger.exact !== true || typeof ledger.planHash !== 'string') {
      fail('EXPERIMENT_COMPLETENESS_UNPROVEN', 'COMPLETE status requires an exact execution ledger — this artifact cannot prove it executed the full plan');
    }
    const rebuilt = buildMutationExperimentPlan({ experimentId: value.experimentId, mutation: value.mutation, config: value.config });
    if (ledger.planHash !== hashCanonical(rebuilt.specs.map((s) => `${s.arm}|${s.pairedRunId}`).sort())) {
      fail('EXPERIMENT_PLAN_MISMATCH', 'Execution ledger plan hash does not match the plan rebuilt from the artifact config');
    }
  }
  return value;
}

export function serializeExperiment(record) {
  return JSON.stringify(record, null, 2);
}

export function parseExperiment(json) {
  const value = JSON.parse(json);
  return validateExperimentRecord(value);
}
