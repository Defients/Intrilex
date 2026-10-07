import test from 'node:test';
import assert from 'node:assert/strict';
import { runPolicyMatch } from '@intrilex/simulation-runtime';
import { WEIGHTED_POLICY_ID, WEIGHT_BOUND } from '../packages/policies/src/weighted-heuristic.mjs';
import {
  ADAPTIVE_CONTRACT, ADAPTIVE_SCHEMA_VERSION, ADAPTIVE_TELEMETRY_VERSION, STRATEGIC_STATES, MODIFIER_STATES,
  DEFAULT_ADAPTIVE_THRESHOLDS, ADAPTIVE_MODIFIER_SCALE, ADAPTIVE_MODIFIER_BOUND,
  strategicSignals, validateAdaptiveConfig, normalizeAdaptiveConfig, effectiveAdaptiveMode,
  LEARNED_UNAVAILABLE_REASON, createAdaptiveController, compactAdaptiveFrame, adaptiveSeatSummary,
  validateAdaptiveTelemetry,
} from '../packages/simulation-runtime/src/adaptive-strategy.mjs';
import { createTrainableCheckpoint, validateCheckpoint } from '../packages/simulation-runtime/src/evolution-domain.mjs';
import { compileTraits, ZERO_GENOME } from '../packages/simulation-runtime/src/profile-contracts.mjs';
import { buildSnapshot } from '../packages/simulation-runtime/src/profile-store.mjs';
import { identity, memoryStore } from './fixtures/agent-profile-fixtures.mjs';

const code = fn => { try { fn(); } catch (error) { return error.code ?? error.message; } return 'NO_ERROR'; };
const RULED = (over = {}) => ({ contract: ADAPTIVE_CONTRACT, mode: 'RULED', ...over });
const baseGenome = () => compileTraits({ traits: { scoringDrive: 30, initiative: 20, guard: 25, riskAppetite: 10 }, baseGenome: ZERO_GENOME() }).policyState;

// Synthetic authorized view — same field shape as strictPolicyView/strictView.
const view = ({ ownPoints = 0, oppPoints = 0, ownGoal = 100, oppGoal = 100, ownHand = 3, oppHand = 3, ownPr = 0, oppPr = 0, active = 'P1', dp = 20 } = {}) => ({
  actorId: 'P1', activePlayerId: active, dpCount: dp,
  own: { goal: ownGoal, securedPoints: ownPoints, hand: Array.from({ length: ownHand }, () => ({ pointValue: 1 })), pr: ownPr ? [{ pointValue: ownPr }] : [], er: [] },
  opponents: [{ playerId: 'P2', goal: oppGoal, securedPoints: oppPoints, handCount: oppHand, pr: oppPr ? [{ pointValue: oppPr }] : [], er: [] }],
});
const scoreAction = points => ({ family: 'play-for-points', featureVector: { immediateScore: points } });

test('adaptive config validation rejects malformed inputs with exact codes', () => {
  assert.equal(code(() => validateAdaptiveConfig(null)), 'INVALID_ADAPTIVE_CONFIG');
  assert.equal(code(() => validateAdaptiveConfig('RULED')), 'INVALID_ADAPTIVE_CONFIG');
  assert.equal(code(() => validateAdaptiveConfig({})), 'UNSUPPORTED_ADAPTIVE_CONTRACT');
  assert.equal(code(() => validateAdaptiveConfig({ contract: 'ADAPTIVE_STRATEGY_RULED@9', mode: 'RULED' })), 'UNSUPPORTED_ADAPTIVE_CONTRACT');
  assert.equal(code(() => validateAdaptiveConfig({ contract: ADAPTIVE_CONTRACT, mode: 'HYBRID' })), 'INVALID_ADAPTIVE_MODE');
  assert.equal(code(() => validateAdaptiveConfig(RULED({ stray: true }))), 'INVALID_ADAPTIVE_CONFIG', 'unknown top-level field');
  assert.equal(code(() => validateAdaptiveConfig(RULED({ modifiers: { NEUTRAL: { tempo: 5 } } }))), 'UNSUPPORTED_STRATEGIC_STATE', 'NEUTRAL carries no modifiers');
  assert.equal(code(() => validateAdaptiveConfig(RULED({ modifiers: { GHOST: { tempo: 5 } } }))), 'UNSUPPORTED_STRATEGIC_STATE');
  assert.equal(code(() => validateAdaptiveConfig(RULED({ modifiers: { AHEAD: { aggression: 5 } } }))), 'UNSUPPORTED_PARAMETER');
  assert.equal(code(() => validateAdaptiveConfig(RULED({ modifiers: { AHEAD: { tempo: 5.5 } } }))), 'ADAPTIVE_MODIFIER_OUT_OF_RANGE');
  assert.equal(code(() => validateAdaptiveConfig(RULED({ modifiers: { AHEAD: { tempo: ADAPTIVE_MODIFIER_BOUND + 1 } } }))), 'ADAPTIVE_MODIFIER_OUT_OF_RANGE');
  assert.equal(validateAdaptiveConfig(RULED({ modifiers: { AHEAD: { tempo: -ADAPTIVE_MODIFIER_BOUND } } })).mode, 'RULED');
  assert.equal(code(() => validateAdaptiveConfig(RULED({ thresholds: { dominantEnter: 0.1 } }))), 'INVALID_ADAPTIVE_THRESHOLD_ORDER');
  assert.equal(code(() => validateAdaptiveConfig(RULED({ thresholds: { aheadEnter: 0 } }))), 'INVALID_ADAPTIVE_THRESHOLDS');
  assert.equal(code(() => validateAdaptiveConfig(RULED({ thresholds: { aheadEnter: 1 } }))), 'INVALID_ADAPTIVE_THRESHOLDS');
  assert.equal(code(() => validateAdaptiveConfig(RULED({ thresholds: { hysteresis: 0.5 } }))), 'INVALID_ADAPTIVE_THRESHOLDS', 'hysteresis wider than a band is rejected');
  assert.equal(code(() => validateAdaptiveConfig(RULED({ thresholds: { lookahead: 0.1 } }))), 'UNSUPPORTED_ADAPTIVE_THRESHOLD');
  assert.equal(code(() => validateAdaptiveConfig(RULED({ thresholds: { aheadEnter: NaN } }))), 'INVALID_ADAPTIVE_THRESHOLDS');
  assert.equal(code(() => validateAdaptiveConfig(RULED({ learned: { w: NaN } }))), 'NON_FINITE_NUMBER');
  assert.equal(code(() => validateAdaptiveConfig(RULED({ learned: { w: { x: undefined } } }))), 'UNDEFINED_FIELD');
  assert.equal(code(() => validateAdaptiveConfig(RULED({ learned: [1, 2] }))), 'INVALID_ADAPTIVE_LEARNED');
});

test('normalizeAdaptiveConfig fills defaults, freezes and deep-clones', () => {
  assert.equal(normalizeAdaptiveConfig(null), null);
  assert.equal(normalizeAdaptiveConfig(undefined), null);
  const src = RULED({ thresholds: { aheadEnter: 0.2 }, modifiers: { DESPERATE: { risk: 30 } }, learned: { nested: { w: [1, 2] } } });
  const cfg = normalizeAdaptiveConfig(src);
  assert.deepEqual({ ...cfg.thresholds }, { ...DEFAULT_ADAPTIVE_THRESHOLDS, aheadEnter: 0.2 });
  assert.equal(cfg.modifiers.DESPERATE.risk, 30);
  assert.ok(Object.isFrozen(cfg));
  src.learned.nested.w[0] = 99;
  assert.equal(cfg.learned.nested.w[0], 1, 'learned payload is cloned, not aliased');
  assert.equal(code(() => normalizeAdaptiveConfig({ contract: 'X', mode: 'RULED' })), 'UNSUPPORTED_ADAPTIVE_CONTRACT');
});

test('strategic signals derive deterministically from the authorized view only', () => {
  const even = strategicSignals(view());
  assert.equal(even.goalProgress, 0); assert.equal(even.advantage, 0); assert.equal(even.initiative, 1); assert.equal(even.winNow, 0);
  assert.ok(strategicSignals(view({ ownPoints: 30 })).advantage > 0.25);
  assert.ok(strategicSignals(view({ oppPoints: 30 })).advantage < -0.25);
  assert.ok(strategicSignals(view({ ownPr: 40 })).boardEdge > 0, 'board point value feeds advantage');
  assert.equal(strategicSignals(view({ ownPoints: 90 }), [scoreAction(10)]).winNow, 1, 'a legal scoring action reaching goal is win-now');
  assert.equal(strategicSignals(view({ ownPoints: 90 }), [scoreAction(5)]).winNow, 0);
  assert.equal(strategicSignals(view(), [{ family: 'draw', featureVector: { immediateScore: 50 } }]).winNow, 0, 'non-scoring families never count');
  assert.equal(strategicSignals(view({ ownPoints: 90 }), [{ family: 'score', featureVector: { immediatePoints: 10 } }]).winNow, 1, 'score family + immediatePoints alias');
  assert.equal(strategicSignals(view({ active: 'P2' })).initiative, 0);
  assert.equal(strategicSignals(null, []).advantage, 0, 'missing view is safe');
});

test('ruled controller classifies, holds through hysteresis and applies overrides', () => {
  const ctl = createAdaptiveController(RULED(), baseGenome());
  let f = ctl.decide({ authorizedView: view(), legalActions: [], decisionIndex: 0 });
  assert.equal(f.state, 'NEUTRAL'); assert.equal(f.transitioned, false, 'opening NEUTRAL is not a transition');

  f = ctl.decide({ authorizedView: view({ oppPoints: 30 }), legalActions: [], decisionIndex: 1 });
  assert.equal(f.state, 'BEHIND'); assert.equal(f.reason, 'ADVANTAGE_FELL');

  f = ctl.decide({ authorizedView: view({ oppPoints: 12 }), legalActions: [], decisionIndex: 2 });
  assert.equal(f.rawBaseState, 'NEUTRAL'); assert.equal(f.state, 'BEHIND'); assert.equal(f.hysteresisHeld, true, 'inside the widened band the state holds');

  f = ctl.decide({ authorizedView: view(), legalActions: [], decisionIndex: 3 });
  assert.equal(f.state, 'NEUTRAL'); assert.equal(f.reason, 'ADVANTAGE_ROSE');

  f = ctl.decide({ authorizedView: view({ oppPoints: 80 }), legalActions: [], decisionIndex: 4 });
  assert.equal(f.state, 'DEFENSIVE_EMERGENCY'); assert.equal(f.baseState, 'DESPERATE'); assert.equal(f.reason, 'OPPONENT_NEAR_GOAL');

  f = ctl.decide({ authorizedView: view({ oppPoints: 80, oppHand: 0 }), legalActions: [], decisionIndex: 5 });
  assert.equal(f.state, 'DESPERATE'); assert.equal(f.reason, 'OVERRIDE_CLEARED', 'no opponent material means no emergency');

  f = ctl.decide({ authorizedView: view(), legalActions: [], decisionIndex: 6 });
  assert.equal(f.state, 'NEUTRAL'); assert.equal(f.reason, 'ADVANTAGE_ROSE');

  const s = ctl.summary();
  assert.equal(s.transitionCount, s.transitions.length);
  assert.equal(s.transitionCount, 5);
  assert.equal(s.hysteresisSuppressions, 1);
  assert.equal(s.decisions, 7);
  assert.equal(s.stateDecisions.DESPERATE, 1); assert.equal(s.stateDecisions.DEFENSIVE_EMERGENCY, 1);
  assert.equal(Object.values(s.stateDecisions).reduce((a, b) => a + b, 0), 7, 'state counts cover every decision');
});

test('win opportunity overrides the base state without hysteresis', () => {
  const ctl = createAdaptiveController(RULED(), baseGenome());
  ctl.decide({ authorizedView: view(), legalActions: [], decisionIndex: 0 });
  const f = ctl.decide({ authorizedView: view({ ownPoints: 95 }), legalActions: [scoreAction(5)], decisionIndex: 1 });
  assert.equal(f.state, 'WIN_OPPORTUNITY'); assert.equal(f.override, 'WIN_OPPORTUNITY'); assert.equal(f.reason, 'IMMEDIATE_WIN_AVAILABLE');
  const g = ctl.decide({ authorizedView: view({ ownPoints: 95 }), legalActions: [], decisionIndex: 2 });
  assert.equal(g.state, 'DOMINANT', 'base state advanced underneath the override'); assert.equal(g.reason, 'OVERRIDE_CLEARED');
});

test('state modifiers move the effective genome and clamp to WEIGHT_BOUND', () => {
  const base = baseGenome();
  const ctl = createAdaptiveController(RULED({ modifiers: { DESPERATE: { tempo: ADAPTIVE_MODIFIER_BOUND, defense: -ADAPTIVE_MODIFIER_BOUND } } }), base);
  const f = ctl.decide({ authorizedView: view({ oppPoints: 90, oppHand: 0 }), legalActions: [], decisionIndex: 0 });
  assert.equal(f.state, 'DESPERATE');
  assert.equal(f.policyState.weights.tempo, Math.min(WEIGHT_BOUND, base.weights.tempo + ADAPTIVE_MODIFIER_BOUND * ADAPTIVE_MODIFIER_SCALE));
  assert.equal(f.policyState.weights.defense, Math.max(-WEIGHT_BOUND, base.weights.defense - ADAPTIVE_MODIFIER_BOUND * ADAPTIVE_MODIFIER_SCALE));
  assert.equal(f.policyState.weights.points, base.weights.points, 'unmodified parameters are unchanged');
  for (const w of Object.values(f.policyState.weights)) { assert.ok(Number.isInteger(w)); assert.ok(Math.abs(w) <= WEIGHT_BOUND); }

  const neutral = createAdaptiveController(RULED({ modifiers: { AHEAD: { risk: -50 } } }), base);
  assert.equal(neutral.decide({ authorizedView: view(), legalActions: [] }).policyState, base, 'NEUTRAL reuses the base object — zero overhead, identity untouched');
});

test('adaptive posture preserves baseline identity: same modifier, different bases stay different', () => {
  const bold = compileTraits({ traits: { initiative: 30 }, baseGenome: ZERO_GENOME() }).policyState;
  const shy = compileTraits({ traits: { initiative: -30 }, baseGenome: ZERO_GENOME() }).policyState;
  const cfg = RULED({ modifiers: { DESPERATE: { tempo: 50 } } });
  const effBold = createAdaptiveController(cfg, bold).decide({ authorizedView: view({ oppPoints: 90, oppHand: 0 }), legalActions: [] }).policyState;
  const effShy = createAdaptiveController(cfg, shy).decide({ authorizedView: view({ oppPoints: 90, oppHand: 0 }), legalActions: [] }).policyState;
  assert.equal(effBold.weights.tempo - effShy.weights.tempo, bold.weights.tempo - shy.weights.tempo, 'modifiers shift, never replace, the baseline');
  const extreme = compileTraits({ traits: { initiative: 90 }, baseGenome: ZERO_GENOME() }).policyState;
  assert.equal(createAdaptiveController(cfg, extreme).decide({ authorizedView: view({ oppPoints: 90, oppHand: 0 }), legalActions: [] }).policyState.weights.tempo, WEIGHT_BOUND, 'effective values clamp at the genome bound');
});

test('adaptive decisions replay identically from config and authorized views alone', () => {
  const views = [view(), view({ oppPoints: 30 }), view({ oppPoints: 12 }), view({ ownPoints: 95 }), view({ ownPoints: 95 }), view()];
  const actions = [[], [], [], [scoreAction(5)], [], []];
  const replay = () => { const c = createAdaptiveController(RULED({ modifiers: { BEHIND: { risk: 40 } } }), baseGenome()); return views.map((v, i) => compactAdaptiveFrame(c.decide({ authorizedView: v, legalActions: actions[i], decisionIndex: i }), { deep: true })); };
  assert.deepEqual(replay(), replay());
});

test('OFF and LEARNED semantics: LEARNED reports unavailable and executes as OFF', () => {
  assert.equal(effectiveAdaptiveMode(null), 'OFF');
  assert.equal(effectiveAdaptiveMode(RULED({ mode: 'LEARNED' })), 'OFF');
  assert.equal(effectiveAdaptiveMode(RULED()), 'RULED');
  const s = adaptiveSeatSummary(RULED({ mode: 'LEARNED' }), null);
  assert.equal(s.requestedMode, 'LEARNED'); assert.equal(s.mode, 'OFF'); assert.equal(s.unavailable, LEARNED_UNAVAILABLE_REASON);
  assert.equal(adaptiveSeatSummary(null, null), null, 'absent config emits no seat entry');
});

test('adaptive telemetry validates and rejects tampered records', () => {
  const ctl = createAdaptiveController(RULED(), baseGenome());
  ctl.decide({ authorizedView: view({ oppPoints: 30 }), legalActions: [], decisionIndex: 0 });
  const t = { schemaVersion: ADAPTIVE_TELEMETRY_VERSION, seats: [{ seat: 1, ...ctl.summary() }] };
  assert.equal(validateAdaptiveTelemetry(t), t);
  const dropped = structuredClone(t); dropped.seats[0].transitions = [];
  assert.equal(code(() => validateAdaptiveTelemetry(dropped)), 'INVALID_ADAPTIVE_TELEMETRY');
  const ghost = structuredClone(t); ghost.seats[0].stateDecisions.GHOST = 4;
  assert.equal(code(() => validateAdaptiveTelemetry(ghost)), 'INVALID_ADAPTIVE_TELEMETRY');
  const learned = structuredClone(t); learned.seats[0].mode = 'LEARNED';
  assert.equal(code(() => validateAdaptiveTelemetry(learned)), 'INVALID_ADAPTIVE_TELEMETRY', 'LEARNED can never be an executed mode');
});

test('trainable checkpoints carry adaptive config inside semantic identity and inherit it', () => {
  const policy = baseGenome(), at = '2026-10-04T00:00:00.000Z';
  const plain = createTrainableCheckpoint({ identity, agentId: 'AP:x', lineageId: 'L1', policyState: policy, createdAt: at });
  const ruled = createTrainableCheckpoint({ identity, agentId: 'AP:x', lineageId: 'L1', policyState: policy, adaptive: RULED({ modifiers: { DESPERATE: { risk: 40 } } }), createdAt: at });
  assert.notEqual(plain.checkpointId, ruled.checkpointId, 'adaptive config is semantic content');
  assert.equal(ruled.adaptive.mode, 'RULED');
  assert.equal(ruled.adaptive.thresholds, undefined, 'checkpoint stores the authored config, defaults apply at execution');
  const child = createTrainableCheckpoint({ identity, agentId: 'AP:x', lineageId: 'L1', parent: ruled, policyState: policy, createdAt: at });
  assert.deepEqual(child.adaptive, ruled.adaptive, 'descendants inherit posture rules');
  const cleared = createTrainableCheckpoint({ identity, agentId: 'AP:x', lineageId: 'L1', parent: ruled, policyState: policy, adaptive: null, createdAt: at });
  assert.equal(cleared.adaptive, undefined, 'explicit null clears the adaptive layer');
  assert.equal(code(() => createTrainableCheckpoint({ identity, agentId: 'AP:x', lineageId: 'L1', policyState: policy, adaptive: { contract: 'X@9', mode: 'RULED' }, createdAt: at })), 'UNSUPPORTED_ADAPTIVE_CONTRACT');
  assert.equal(validateCheckpoint(plain, identity).adaptive, undefined, 'legacy checkpoints without adaptive still validate');
  const tampered = structuredClone(ruled); tampered.adaptive.modifiers.DESPERATE.risk = 999;
  assert.equal(code(() => validateCheckpoint(tampered, identity)), 'ADAPTIVE_MODIFIER_OUT_OF_RANGE');
});

test('adaptive strategy persists through profile create, draft edits, fork and snapshot', async () => {
  const store = memoryStore();
  const cfg = RULED({ modifiers: { DESPERATE: { risk: 60 } } });
  const profile = await store.createProfile({ commandId: 'c1', displayName: 'APEX TEST', traits: { guard: 40 }, adaptiveStrategy: cfg });
  const view0 = await store.profileView(profile.agentProfileId);
  const champion = view0.checkpoints.find(c => c.checkpointId === view0.head.championCheckpointId);
  assert.equal(champion.adaptive.mode, 'RULED');
  const rev0 = view0.artifacts.find(a => a.id === view0.head.activeRevisionId);
  assert.equal(rev0.body.adaptiveStrategy.mode, 'RULED');
  const snapshot = buildSnapshot({ checkpoint: champion, identity, rulesProfileId: 'core-advanced-authority' });
  assert.equal(snapshot.adaptive.mode, 'RULED', 'execution snapshot carries the adaptive layer');

  // Draft edit: adaptive-only change is an executable change producing a new checkpoint.
  const draft = await store.saveDraftRevision({ agentProfileId: profile.agentProfileId, baseRevisionId: rev0.id, adaptiveStrategy: null, sourceCheckpointId: champion.checkpointId });
  assert.notEqual(draft.checkpoint.checkpointId, champion.checkpointId, 'adaptive change alone compiles a new checkpoint');
  assert.equal(draft.checkpoint.adaptive, undefined);
  assert.equal(draft.revision.body.adaptiveStrategy, undefined, 'cleared intent is absent, not reinterpreted');
  assert.deepEqual(draft.revision.body.executableChange.adaptiveChange.to, null);
  assert.deepEqual(draft.revision.body.executableChange.adaptiveChange.from.mode, 'RULED');

  // Inherited intent: a draft with no adaptiveStrategy argument keeps RULED.
  const keep = await store.saveDraftRevision({ agentProfileId: profile.agentProfileId, baseRevisionId: rev0.id, traits: { guard: 41 }, sourceCheckpointId: champion.checkpointId });
  assert.equal(keep.revision.body.adaptiveStrategy.mode, 'RULED');
  assert.equal(keep.checkpoint.adaptive.mode, 'RULED', 'trait edits preserve posture rules');

  // Malformed persisted config fails loudly.
  const bad = await store.saveDraftRevision({ agentProfileId: profile.agentProfileId, baseRevisionId: rev0.id, adaptiveStrategy: { contract: 'X@9', mode: 'RULED' }, sourceCheckpointId: champion.checkpointId }).then(() => 'NO_ERROR', e => e.code ?? e.message);
  assert.equal(bad, 'UNSUPPORTED_ADAPTIVE_CONTRACT');

  // Fork preserves adaptive intent.
  const fork = await store.fork({ commandId: 'fork-1', sourceAgentProfileId: profile.agentProfileId, displayName: 'APEX FORK' });
  const fv = await store.profileView(fork.agentProfileId);
  assert.equal(fv.checkpoints.find(c => c.checkpointId === fv.head.championCheckpointId).adaptive.mode, 'RULED');
  assert.equal(fv.artifacts.find(a => a.id === fv.head.activeRevisionId).body.adaptiveStrategy.mode, 'RULED');
});

test('old profiles without adaptive load safely and validate as OFF', async () => {
  const store = memoryStore();
  const profile = await store.createProfile({ commandId: 'c2', displayName: 'LEGACY' });
  const view = await store.profileView(profile.agentProfileId);
  const champion = view.checkpoints.find(c => c.checkpointId === view.head.championCheckpointId);
  assert.equal(champion.adaptive, undefined);
  const rev = view.artifacts.find(a => a.id === view.head.activeRevisionId);
  assert.equal(rev.body.adaptiveStrategy, undefined);
  assert.equal(buildSnapshot({ checkpoint: champion, identity, rulesProfileId: 'core-advanced-authority' }).adaptive, undefined);
});

test('runPolicyMatch: OFF is hash-identical to no config; RULED emits adaptive telemetry deterministically', () => {
  const cp = createTrainableCheckpoint({ identity, agentId: 'AP:x', lineageId: 'L1', policyState: baseGenome(), createdAt: '2026-10-04T00:00:00.000Z' });
  const run = adaptive => runPolicyMatch({ seed: 12345, ordinal: 0, profileId: 'core-advanced-authority', policyIds: [WEIGHTED_POLICY_ID, 'control'], seatOrder: ['P1', 'P2'], policyStates: [cp.policyState, null], adaptiveConfigs: adaptive, decisionLimit: 600, telemetryEnabled: false });
  const plain = run(undefined);
  const off = run([{ contract: ADAPTIVE_CONTRACT, mode: 'OFF' }, null]);
  assert.equal(off.summary.matchResultHash, plain.summary.matchResultHash, 'OFF preserves the exact decision sequence');
  assert.equal(off.summary.finalStateHash, plain.summary.finalStateHash);
  assert.equal(off.summary.adaptiveTelemetry.seats[0].mode, 'OFF');
  assert.equal(off.decisions.some(d => d.adaptive), false, 'OFF emits no per-decision frames');

  const cfg = RULED({ modifiers: { DESPERATE: { risk: 80, defense: -60 }, AHEAD: { risk: -40, defense: 30 } } });
  const ruled = run([cfg, null]);
  assert.equal(run([cfg, null]).summary.matchResultHash, ruled.summary.matchResultHash, 'RULED replays deterministically');
  const seat = ruled.summary.adaptiveTelemetry.seats.find(s => s.seat === 1);
  assert.equal(seat.mode, 'RULED'); assert.equal(seat.schemaVersion, undefined, 'version lives on the telemetry block');
  assert.equal(ruled.summary.adaptiveTelemetry.schemaVersion, ADAPTIVE_TELEMETRY_VERSION);
  assert.ok(seat.decisions > 0);
  assert.equal(seat.decisions, Object.values(seat.stateDecisions).reduce((a, b) => a + b, 0));
  assert.ok(ruled.decisions.some(d => d.actorId === 'P1' && d.adaptive?.state), 'per-decision posture frames attach to the adaptive seat');
  assert.ok(ruled.decisions.every(d => d.actorId !== 'P2' || !d.adaptive), 'the non-adaptive seat carries no frames');
});

test('deep adaptive frames expose signals, modifiers and effective weights in range', () => {
  const cp = createTrainableCheckpoint({ identity, agentId: 'AP:x', lineageId: 'L1', policyState: baseGenome(), adaptive: RULED({ modifiers: { BEHIND: { tempo: 50, risk: 50 }, DESPERATE: { tempo: 80, defense: -80 } } }), createdAt: '2026-10-04T00:00:00.000Z' });
  const result = runPolicyMatch({ seed: 777, ordinal: 0, profileId: 'core-advanced-authority', policyIds: [WEIGHTED_POLICY_ID, 'control'], seatOrder: ['P1', 'P2'], policyStates: [cp.policyState, null], adaptiveConfigs: [cp.adaptive, null], decisionLimit: 600, telemetryEnabled: false, strategicTrace: false });
  const deep = runPolicyMatch({ seed: 777, ordinal: 0, profileId: 'core-advanced-authority', policyIds: [WEIGHTED_POLICY_ID, 'control'], seatOrder: ['P1', 'P2'], policyStates: [cp.policyState, null], adaptiveConfigs: [cp.adaptive, null], decisionLimit: 600, telemetryEnabled: false, strategicTrace: true });
  assert.equal(deep.summary.matchResultHash, result.summary.matchResultHash, 'deep tracking does not change decisions');
  for (const d of deep.decisions.filter(d => d.adaptive)) {
    assert.ok(STRATEGIC_STATES.includes(d.adaptive.state));
    for (const w of Object.values(d.adaptive.effectiveWeights ?? {})) assert.ok(Math.abs(w) <= WEIGHT_BOUND, 'effective weights stay in genome bounds');
    if (d.adaptive.state !== 'NEUTRAL') assert.ok(Object.keys(d.adaptive.signals ?? {}).length > 0);
  }
});

test('no tactical scripting: strategic states answer posture only, actions still come from the heuristic', () => {
  for (const s of STRATEGIC_STATES) assert.ok(['NEUTRAL', 'AHEAD', 'DOMINANT', 'BEHIND', 'DESPERATE', 'WIN_OPPORTUNITY', 'DEFENSIVE_EMERGENCY'].includes(s));
  assert.equal(MODIFIER_STATES.includes('NEUTRAL'), false, 'NEUTRAL is the identity state and carries no modifiers');
  assert.equal(ADAPTIVE_SCHEMA_VERSION, 1);
});
