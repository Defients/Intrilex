import { hashCanonical } from '@intrilex/shared';
import { WEIGHTED_POLICY_ID, WEIGHT_FEATURES, WEIGHT_BOUND, validatePolicyState, baselinePolicyState } from '../../policies/src/weighted-heuristic.mjs';
import { validateCheckpoint, FROZEN_POLICIES, LAB_PROFILES, LAB_LIMITS } from './evolution-domain.mjs';
import { validateAdaptiveConfig } from './adaptive-strategy.mjs';
import { createBaselineSuite } from './evolution-research.mjs';

// Agent Profile contracts. Every version string resolves to exact semantics
// here or is unsupported; nothing maps an unknown version to "latest".

export class ProfileError extends Error {
  constructor(code, detail = null) { super(detail ? `${code}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : code); this.code = code; this.detail = detail; }
}
export const fail = (code, detail) => { throw new ProfileError(code, detail); };

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); }
  return value;
}

/** STRICT_CANONICAL_JSON_V1: plain objects, arrays, strings, booleans, null and
 * finite numbers only. Undefined fields, non-finite numbers and class instances
 * are rejected rather than dropped. -0 is canonicalized to 0. Keys sort lexically. */
export function strictCanonical(value, path = '$') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail('NON_FINITE_NUMBER', path); return Object.is(value, -0) ? 0 : value; }
  if (Array.isArray(value)) return value.map((item, index) => strictCanonical(item, `${path}[${index}]`));
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) fail('UNSUPPORTED_VALUE', path);
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) fail('UNDEFINED_FIELD', `${path}.${key}`);
      out[key] = strictCanonical(value[key], `${path}.${key}`);
    }
    return out;
  }
  return fail('UNSUPPORTED_VALUE', path);
}
export const digest = value => hashCanonical(strictCanonical(value));
export const sameContent = (a, b) => digest(a) === digest(b);

export const CONTRACTS = deepFreeze({
  canonical: 'STRICT_CANONICAL_JSON_V1',
  store: { id: 'AGENT_PROFILE_STORE', version: 1, database: 'intrilex-agent-profiles' },
  bundle: { format: 'intrilex-agent-profile-bundle', version: 1 },
  genome: { id: 'WEIGHTED_HEURISTIC_GENOME', version: 1 },
  compiler: { id: 'TRAIT_COMPILER_LINEAR', version: 1 },
  adaptiveStrategy: { id: 'ADAPTIVE_STRATEGY_RULED', version: 1 },
  objective: { id: 'GENERALIST_PAIRED_SCORE', version: 1 },
  optimizer: { id: 'ONE_PLUS_LAMBDA_V1', version: 1 },
  constraintProjection: { id: 'FIXED_REJECTION_THEN_CLAMP_V1', version: 1 },
  promotionPolicy: { id: 'FIXED_BUDGET_PAIRED_GENERALIST', version: 1 },
  estimator: { id: 'PAIRED_BLOCK_STUDENT_T', version: 1 },
  era: { id: 'EVALUATION_ERA', version: 2 },
  measurement: { id: 'PROFILE_MEASUREMENT', version: 1 },
  journal: { id: 'LEARNING_JOURNAL', version: 1 },
  snapshot: { id: 'EXECUTION_SNAPSHOT', version: 1 },
  experience: { id: 'EXPERIENCE_RECORD', version: 1 },
  selectionRule: { id: 'MEAN_PAIRED_TRAINING_SCORE_PARENT_FIRST', version: 1 },
  nominationRule: { id: 'FINAL_COMMITTED_SELECTION_AT_BUDGET', version: 1 },
});
export function requireContract(kind, id, version) {
  const known = CONTRACTS[kind];
  if (!known || known.id !== id || known.version !== version) fail('UNSUPPORTED_CONTRACT_VERSION', { kind, id, version });
  return known;
}

export const EVIDENCE_PURPOSES = deepFreeze(['TRAINING', 'HELD_OUT_EVALUATION', 'PROMOTION_CHALLENGE', 'EXPERIENCE', 'DIAGNOSTIC']);

/** Immutable artifact kinds and their identity prefixes. */
export const ARTIFACT_KINDS = deepFreeze({
  PROFILE_REVISION: 'PR', CAPABILITY_OBJECTIVE: 'OBJ', PROMOTION_POLICY: 'PP', EVALUATION_ERA: 'ERA', EVIDENCE_PACK: 'PK',
  SERIES_MANIFEST: 'SER', MEASUREMENT_MANIFEST: 'MM', MEASUREMENT_RESULT: 'MR', GENERATION_SELECTION: 'GS', SERIES_OUTCOME: 'SO',
  CHALLENGER_NOMINATION: 'NOM', CHALLENGE_MANIFEST: 'CH', CHALLENGE_DECISION: 'CD', PROMOTION_RECORD: 'PRM', LEARNING_JOURNAL: 'LJ',
  EXPOSURE_RECORD: 'EXP', EXPERIENCE_RECORD: 'XR', RETENTION_TOMBSTONE: 'RT', MIGRATION_LINK: 'ML', IMPORT_RECORD: 'IMP',
});
/** Identity covers kind, scope and body. `meta` is descriptive (wall clock, origin note) and excluded. */
export function makeArtifact(kind, body, { scope = null, meta = {} } = {}) {
  const prefix = ARTIFACT_KINDS[kind];
  if (!prefix) fail('UNKNOWN_ARTIFACT_KIND', kind);
  if (scope !== null && typeof scope !== 'string') fail('INVALID_ARTIFACT_SCOPE');
  const canonical = strictCanonical(body), hash = hashCanonical({ kind, scope, body: canonical });
  return deepFreeze({ id: `${prefix}-${hash}`, kind, scope, body: canonical, digest: hash, meta: strictCanonical(meta) });
}
export function validateArtifact(artifact) {
  if (!artifact || typeof artifact !== 'object') fail('INVALID_ARTIFACT');
  const prefix = ARTIFACT_KINDS[artifact.kind];
  if (!prefix) fail('UNKNOWN_ARTIFACT_KIND', artifact.kind);
  const hash = hashCanonical({ kind: artifact.kind, scope: artifact.scope ?? null, body: strictCanonical(artifact.body) });
  if (artifact.digest !== hash || artifact.id !== `${prefix}-${hash}`) fail('ARTIFACT_DIGEST_MISMATCH', artifact.id);
  return artifact;
}

// ── Genome Definition ──────────────────────────────────────────────────────
const MEANINGS = {
  points: 'Immediate points plus half known target-point value',
  resource: 'Draw, swap, recovery indicators and authorized draw-count feature',
  tempo: 'QUICK timing and authorized Mini-Turn feature',
  defense: 'Anchor, guard, effect-nine indicators and own response-stack context',
  synergy: 'Authorized anchor, Mimic and row-exchange features',
  risk: 'Countering own stack, source-over-target cost and absolute-scuttle feature',
};
export const GENOME_DEFINITION = deepFreeze({
  ...CONTRACTS.genome, policyId: WEIGHTED_POLICY_ID, policyVersion: '1.0.0', basePolicyId: 'control',
  parameters: WEIGHT_FEATURES.map(name => ({ name, type: 'integer', min: -WEIGHT_BOUND, max: WEIGHT_BOUND, default: 0, unit: 'control-score points per feature unit', meaning: MEANINGS[name], mutationEligible: true, userEditable: true })),
});
export function validateGenome(policyState, { requireIntegers = true } = {}) {
  try { validatePolicyState(policyState); } catch { fail('INVALID_GENOME'); }
  if (requireIntegers && WEIGHT_FEATURES.some(k => !Number.isInteger(policyState.weights[k]))) fail('INVALID_GENOME', 'non-integer parameter');
  return policyState;
}
/** Executable-content digest: identifies equivalent genomes under one policy version without changing checkpoint IDs. */
export const genomeDigest = cp => digest({ policyId: cp.policyId, policyVersion: cp.policyVersion, policyState: cp.policyState });

// ── Semantic traits and compiler ───────────────────────────────────────────
// Each control changes the top-ranked legal action in at least one real
// authority fixture (see docs/AGENT_PROFILES.md). Negative Guard was a placebo.
export const TRAIT_CATALOG = deepFreeze([
  { traitId: 'scoringDrive', label: 'Scoring drive', parameter: 'points', min: -100, max: 100, description: 'Higher favors immediate points and high-value known targets.' },
  { traitId: 'resourceAppetite', label: 'Resource appetite', parameter: 'resource', min: -100, max: 100, description: 'Higher favors draws, swaps and recovery.' },
  { traitId: 'initiative', label: 'Initiative', parameter: 'tempo', min: -100, max: 100, description: 'Higher favors QUICK timing and extra Mini-Turns.' },
  { traitId: 'guard', label: 'Guard', parameter: 'defense', min: 0, max: 100, description: 'Higher favors anchors, guards and protecting its own stack.' },
  { traitId: 'combinationPlay', label: 'Combination play', parameter: 'synergy', min: -100, max: 100, description: 'Higher favors anchor, Mimic and row-exchange combinations.' },
  { traitId: 'riskAppetite', label: 'Risk appetite', parameter: 'risk', min: -100, max: 100, description: 'Higher accepts costly trades and countering its own stack.' },
]);
const TRAIT_SCALE = 20;
export function validateTraits(traits) {
  if (!traits || typeof traits !== 'object' || Array.isArray(traits)) fail('INVALID_TRAITS');
  for (const [key, value] of Object.entries(traits)) {
    const trait = TRAIT_CATALOG.find(t => t.traitId === key);
    if (!trait) fail('UNSUPPORTED_TRAIT', key);
    if (!Number.isInteger(value) || value < trait.min || value > trait.max) fail('TRAIT_OUT_OF_RANGE', { trait: key, value });
  }
  return traits;
}
/** TRAIT_COMPILER_LINEAR v1: weight = 20 × trait for each supplied trait; every
 * other parameter is copied from the explicit base genome unchanged. */
export function compileTraits({ traits, baseGenome }) {
  validateTraits(traits); validateGenome(baseGenome, { requireIntegers: false });
  const policyState = structuredClone(baseGenome), writes = [];
  for (const traitId of Object.keys(traits).sort()) {
    const { parameter } = TRAIT_CATALOG.find(t => t.traitId === traitId);
    const before = policyState.weights[parameter], after = traits[traitId] * TRAIT_SCALE;
    policyState.weights[parameter] = Object.is(after, -0) ? 0 : after;
    writes.push({ traitId, parameter, trait: traits[traitId], before, after: policyState.weights[parameter] });
  }
  return deepFreeze({ policyState: validateGenome(policyState), writes, compiler: { ...CONTRACTS.compiler, scale: TRAIT_SCALE }, parametersWritten: writes.map(w => w.parameter) });
}
export const traitsFromGenome = policyState => Object.fromEntries(TRAIT_CATALOG.map(t => [t.traitId, policyState.weights[t.parameter] / TRAIT_SCALE]));

/** Optional starting priors. Their resolved values are snapshotted at creation;
 * nothing reads a template again, so later template edits cannot touch a Profile. */
export const TEMPLATE_CATALOG = deepFreeze([
  { templateId: 'control-baseline', templateVersion: 1, label: 'Control baseline (no residuals)', traits: {}, note: 'Exactly the shipped Control scoring with zero residuals.' },
  { templateId: 'scoring-pressure', templateVersion: 1, label: 'Scoring pressure prior', traits: { scoringDrive: 40, initiative: 20 }, note: 'Authored prior; not a reproduction of the Score Rush policy.' },
  { templateId: 'guarded-control', templateVersion: 1, label: 'Guarded control prior', traits: { guard: 40, riskAppetite: -30 }, note: 'Authored prior; not a reproduction of any static policy.' },
]);
export function resolveTemplate(templateId, templateVersion, catalog = TEMPLATE_CATALOG) {
  const template = catalog.find(t => t.templateId === templateId && t.templateVersion === templateVersion);
  if (!template) fail('UNSUPPORTED_TEMPLATE', { templateId, templateVersion });
  return { templateId, templateVersion, templateDigest: digest(template), resolvedTraits: structuredClone(template.traits) };
}

// ── Revision constraints ───────────────────────────────────────────────────
export const METRICS = deepFreeze({
  PAIRED_SCORE: { version: 1, unit: 'fraction', definition: 'Mean over complete AB/BA seed pairs of (win 1, draw 0.5, loss 0); non-clean games never count.' },
  ACTION_FAMILY_RATE: { version: 1, unit: 'fraction', denominator: 'candidate decisions', definition: 'Selected legal-action family count divided by the subject\'s decisions in clean games.' },
  MECHANIC_RATE: { version: 1, unit: 'fraction', denominator: 'candidate decisions', definition: 'Selected actions carrying a canonical mechanic tag divided by the subject\'s decisions in clean games.' },
  FIRST_SEAT_WIN_RATE: { version: 1, unit: 'fraction', denominator: 'clean games', definition: 'Share of clean games won by seat P1.' },
});
export function validateMutationConstraints(constraints) {
  if (!constraints || typeof constraints !== 'object' || Array.isArray(constraints)) fail('INVALID_MUTATION_CONSTRAINTS');
  for (const [name, rule] of Object.entries(constraints)) {
    if (!WEIGHT_FEATURES.includes(name)) fail('UNSUPPORTED_PARAMETER', name);
    if (rule?.mode === 'FREE' || rule?.mode === 'FIXED') { if (Object.keys(rule).length !== 1) fail('INVALID_MUTATION_CONSTRAINTS', name); continue; }
    if (rule?.mode !== 'BOUNDED' || !Number.isInteger(rule.min) || !Number.isInteger(rule.max) || rule.min >= rule.max || rule.min < -WEIGHT_BOUND || rule.max > WEIGHT_BOUND || Object.keys(rule).length !== 3) fail('INVALID_MUTATION_CONSTRAINTS', name);
  }
  return constraints;
}
export const trainableParameters = constraints => WEIGHT_FEATURES.filter(name => constraints[name]?.mode !== 'FIXED');
export function validateIdentityConstraints(list) {
  if (!Array.isArray(list) || list.length > 8) fail('INVALID_IDENTITY_CONSTRAINTS');
  for (const c of list) {
    if (!['ACTION_FAMILY_RATE', 'MECHANIC_RATE'].includes(c?.metricId) || c.metricVersion !== METRICS[c.metricId].version || typeof c.key !== 'string' || !c.key || c.key.length > 80) fail('UNSUPPORTED_IDENTITY_METRIC', c?.metricId);
    if (!Number.isInteger(c.minDenominator) || c.minDenominator < 1) fail('INVALID_IDENTITY_CONSTRAINTS', 'minDenominator');
    const bound = v => v === null || (typeof v === 'number' && v >= 0 && v <= 1);
    if (!bound(c.min) || !bound(c.max) || (c.min === null && c.max === null) || (c.min !== null && c.max !== null && c.min > c.max)) fail('INVALID_IDENTITY_CONSTRAINTS', 'bounds');
    if (Object.keys(c).sort().join() !== 'key,max,metricId,metricVersion,min,minDenominator') fail('INVALID_IDENTITY_CONSTRAINTS', 'fields');
  }
  return list;
}
export const SERIES_DEFAULTS = deepFreeze({ generations: 2, candidates: 2, mutationStep: 250, trainingPairs: 4 });
export function validateSeriesDefaults(d) {
  if (!d || !Number.isInteger(d.generations) || d.generations < 1 || d.generations > 100 || !Number.isInteger(d.candidates) || d.candidates < 1 || d.candidates > 4
    || !Number.isInteger(d.mutationStep) || d.mutationStep < 1 || d.mutationStep > 1000 || !Number.isInteger(d.trainingPairs) || d.trainingPairs < 1 || d.trainingPairs > 500
    || Object.keys(d).sort().join() !== 'candidates,generations,mutationStep,trainingPairs') fail('INVALID_SERIES_DEFAULTS');
  return d;
}
export function validateRevisionBody(body) {
  const keys = 'agentProfileId,authoredCheckpointId,defaults,executableChange,forkedFrom,identityConstraints,intendedIdentity,mutationConstraints,objectiveInstanceId,origin,parentRevisionId,revisionNumber,template';
  const sorted = Object.keys(body ?? {}).sort().join();
  if (!body || (sorted !== keys && sorted !== `adaptiveStrategy,${keys}`)) fail('INVALID_REVISION', 'fields');
  if (body.adaptiveStrategy != null) validateAdaptiveConfig(body.adaptiveStrategy);
  if (typeof body.agentProfileId !== 'string' || !Number.isInteger(body.revisionNumber) || body.revisionNumber < 1 || (body.revisionNumber === 1) !== (body.parentRevisionId === null)) fail('INVALID_REVISION', 'sequence');
  if (!['CREATED', 'AUTHORED_EDIT', 'FORKED', 'MIGRATED_FROM_V1', 'IMPORTED_AS_FORK'].includes(body.origin)) fail('INVALID_REVISION', 'origin');
  validateTraits(body.intendedIdentity?.traits);
  if (typeof body.intendedIdentity.statement !== 'string' || body.intendedIdentity.statement.length > 600 || Object.keys(body.intendedIdentity).sort().join() !== 'statement,traits') fail('INVALID_REVISION', 'intendedIdentity');
  validateMutationConstraints(body.mutationConstraints); validateIdentityConstraints(body.identityConstraints);
  if (body.executableChange !== null && (!Array.isArray(body.executableChange?.writes) || !body.executableChange.compiler)) fail('INVALID_REVISION', 'executableChange');
  validateSeriesDefaults(body.defaults?.series);
  if (!Number.isInteger(body.defaults.heldOutPairs) || body.defaults.heldOutPairs < 1 || body.defaults.heldOutPairs > 500 || typeof body.defaults.promotionPolicyId !== 'string' || Object.keys(body.defaults).sort().join() !== 'heldOutPairs,promotionPolicyId,series') fail('INVALID_REVISION', 'defaults');
  if (!/^OBJ-[a-f0-9]{64}$/.test(body.objectiveInstanceId) || !/^CP2-[a-f0-9]{64}$/.test(body.authoredCheckpointId)) fail('INVALID_REVISION', 'references');
  return body;
}

// ── Capability Objective ───────────────────────────────────────────────────
const equalWeights = () => Object.fromEntries(FROZEN_POLICIES.map(id => [id, 1 / FROZEN_POLICIES.length]));
export function resolveObjective({ rulesProfileId = LAB_PROFILES[0] } = {}) {
  if (!LAB_PROFILES.includes(rulesProfileId)) fail('PROFILE_NOT_ADMITTED', rulesProfileId);
  return makeArtifact('CAPABILITY_OBJECTIVE', validateObjectiveBody({
    definitionId: CONTRACTS.objective.id, definitionVersion: CONTRACTS.objective.version, rulesProfileId,
    referenceSuite: 'CORE_BASELINE_SUITE_V1', referenceOpponents: [...FROZEN_POLICIES], outcomeMetric: { metricId: 'PAIRED_SCORE', metricVersion: 1 },
    aggregation: { method: 'WEIGHTED_MEAN', weights: equalWeights() }, direction: 'MAXIMIZE',
    constraints: { reliability: 'ZERO_NONCLEAN_PLANNED_GAMES', maxPerOpponentRegression: 0.10 },
  }));
}
export function validateObjectiveBody(body) {
  requireContract('objective', body?.definitionId, body?.definitionVersion);
  const weights = body.aggregation?.weights ?? {};
  if (!LAB_PROFILES.includes(body.rulesProfileId) || body.referenceSuite !== 'CORE_BASELINE_SUITE_V1' || digest(body.referenceOpponents) !== digest([...FROZEN_POLICIES])
    || body.aggregation.method !== 'WEIGHTED_MEAN' || digest(Object.keys(weights).sort()) !== digest([...FROZEN_POLICIES].sort())
    || Math.abs(Object.values(weights).reduce((a, b) => a + b, 0) - 1) > 1e-12 || Object.values(weights).some(w => !(w > 0))
    || body.direction !== 'MAXIMIZE' || body.outcomeMetric?.metricId !== 'PAIRED_SCORE' || body.constraints?.reliability !== 'ZERO_NONCLEAN_PLANNED_GAMES'
    || !(body.constraints.maxPerOpponentRegression >= 0 && body.constraints.maxPerOpponentRegression <= 1)) fail('INVALID_OBJECTIVE');
  return body;
}

// ── Promotion policy ───────────────────────────────────────────────────────
export function resolvePromotionPolicy() {
  return makeArtifact('PROMOTION_POLICY', {
    policyId: CONTRACTS.promotionPolicy.id, policyVersion: CONTRACTS.promotionPolicy.version,
    // 48 i.i.d. composite blocks: each block holds one fresh seed per reference
    // opponent, played AB/BA by both subjects (960 games). Chosen from measured
    // estimator coverage under skewed nulls; see docs/AGENT_PROFILES.md.
    budget: { blocks: 48, blockDefinition: 'ONE_FRESH_SEED_PER_REFERENCE_OPPONENT_AB_BA_FOR_BOTH_SUBJECTS', gamesPerBlockPerSubjectPerOpponent: 2 },
    sampling: { method: 'FRESH_DISJOINT_SEEDS_PER_OPPONENT_V1', disjointFrom: 'ALL_KNOWN_ANCESTRY_EXPOSURES' },
    estimator: { id: CONTRACTS.estimator.id, version: CONTRACTS.estimator.version, sidedness: 'ONE_SIDED', confidence: 0.95, unit: 'COMPOSITE_SEED_BLOCK' },
    practicalThreshold: 0.02, regressionFloor: 0.10, reliability: 'ZERO_NONCLEAN_PLANNED_GAMES',
    tailGuard: { id: 'TAIL_BALANCE_V1', swing: 0.75, rule: 'OPPONENT_SEED_UNITS_WITH_DELTA_AT_MOST_MINUS_SWING_MUST_NOT_OUTNUMBER_UNITS_AT_LEAST_PLUS_SWING' },
    multipleCriteria: 'ONLY_IMPROVEMENT_IS_INFERENTIAL; FLOORS_TAIL_AND_IDENTITY_ARE_POINT_ESTIMATE_GUARD_RAILS; NO_FAMILYWISE_CLAIM',
    retries: 'NONE_WITHIN_ATTEMPT; RESUME_REEXECUTES_DETERMINISTIC_RUNS_AND_MUST_REPRODUCE_RECORDS',
    stopping: 'FIXED_BUDGET_NO_OPTIONAL_STOPPING_NO_SUBSET_SELECTION',
    automaticAttempts: 'ONE_PER_CHALLENGER_INCUMBENT_OBJECTIVE_ERA',
    precedence: ['INVALID', 'REJECT', 'INCONCLUSIVE', 'APPROVE'],
  });
}
export function validatePolicyForObjective(policyBody, objectiveBody) {
  requireContract('promotionPolicy', policyBody?.policyId, policyBody?.policyVersion);
  requireContract('estimator', policyBody.estimator?.id, policyBody.estimator?.version);
  validateObjectiveBody(objectiveBody);
  if (!Number.isInteger(policyBody.budget?.blocks) || policyBody.budget.blocks < 8 || policyBody.budget.blocks > 500) fail('INVALID_PROMOTION_POLICY', 'blocks');
  if (!(policyBody.practicalThreshold >= 0) || !(policyBody.regressionFloor >= 0)) fail('INVALID_PROMOTION_POLICY', 'thresholds');
  if (policyBody.regressionFloor > objectiveBody.constraints.maxPerOpponentRegression) fail('POLICY_WEAKENS_OBJECTIVE', 'regressionFloor');
  if (policyBody.reliability !== objectiveBody.constraints.reliability) fail('POLICY_WEAKENS_OBJECTIVE', 'reliability');
  if (policyBody.tailGuard?.id !== 'TAIL_BALANCE_V1' || !(policyBody.tailGuard.swing > 0 && policyBody.tailGuard.swing <= 1)) fail('INVALID_PROMOTION_POLICY', 'tailGuard');
  return policyBody;
}

// ── Evaluation Era ─────────────────────────────────────────────────────────
/** EVALUATION_ERA v1: implementation fingerprint, rules profile, exact reference
 * opponents, seed protocol, seating, limits, outcome coding, metrics and objective
 * aggregation. Candidate identity and display metadata are excluded. */
// The v1 resolver retains its locked source and frozen era contract. It is
// used only when original inputs lack the new implementation contract.
const legacyResolveEra = ((CONTRACTS) => function resolveEra({ identity, objective }) {
  const o = validateObjectiveBody(objective.body ?? objective);
  const suite = createBaselineSuite(identity);
  return makeArtifact('EVALUATION_ERA', {
    eraContract: CONTRACTS.era.id, eraVersion: CONTRACTS.era.version,
    implementation: { fingerprint: identity.fingerprint, engineVersion: identity.engineVersion, rulesVersion: identity.rulesVersion },
    rulesProfileId: o.rulesProfileId, referenceSuiteId: suite.suiteId,
    referenceOpponents: suite.checkpoints.map(cp => ({ policyId: cp.policyId, checkpointId: cp.checkpointId })),
    scenario: 'LAB_SEED_PAIRS_V1', seating: 'AB_BA_SAME_SEED_V1',
    limits: { decisionLimit: LAB_LIMITS.decisions, orchestrationCommandLimit: 256 }, outcome: 'WIN1_DRAW_HALF_LOSS0_V1',
    metrics: Object.fromEntries(Object.entries(METRICS).map(([k, m]) => [k, m.version])),
    objective: { definitionId: o.definitionId, definitionVersion: o.definitionVersion, weights: o.aggregation.weights },
  });
})({ ...CONTRACTS, era: { id: 'EVALUATION_ERA', version: 1 } });
export function resolveEra(args) {
  const legacy = legacyResolveEra(args);
  if (args.identity.identityContract !== 'intrilex-implementation@2') return legacy;
  return makeArtifact('EVALUATION_ERA', { ...legacy.body, eraVersion: CONTRACTS.era.version,
    analysisFingerprint: args.identity.analysisFingerprint });
}

// ── Head token ─────────────────────────────────────────────────────────────
const HEAD_FIELDS = ['agentProfileId', 'headVersion', 'activeRevisionId', 'championCheckpointId', 'requiredEvaluationEraId', 'promotionPolicyId', 'lastTransitionId'];
export const headToken = head => strictCanonical(Object.fromEntries(HEAD_FIELDS.map(k => {
  if (head?.[k] === undefined) fail('INVALID_HEAD_TOKEN', k);
  return [k, head[k]];
})));
export const sameHead = (a, b) => digest(headToken(a)) === digest(headToken(b));

// ── Compatibility ──────────────────────────────────────────────────────────
const verdict = reasons => deepFreeze({ ok: reasons.length === 0, reasons });
export function canInspectArtifact(artifact) {
  try { validateArtifact(artifact); return verdict([]); } catch (error) { return verdict([error.code ?? 'UNREADABLE']); }
}
/** Historical readability never implies executability. */
export function canExecuteCheckpoint(checkpoint, currentIdentity) {
  const reasons = [];
  try { validateCheckpoint(checkpoint, checkpoint?.identity); } catch (error) { return verdict([`CHECKPOINT_INVALID:${error.message}`]); }
  if (checkpoint.schemaVersion !== 2 || checkpoint.policyId !== WEIGHTED_POLICY_ID) reasons.push('UNSUPPORTED_POLICY_FAMILY');
  if (checkpoint.identity.fingerprint !== currentIdentity?.fingerprint) reasons.push('IMPLEMENTATION_FINGERPRINT_MISMATCH');
  if (checkpoint.policyImplementationHash !== currentIdentity?.policyImplementationHash) reasons.push('POLICY_IMPLEMENTATION_MISMATCH');
  return verdict([...new Set(reasons)]);
}
export function canTrainOrResume({ checkpoint, manifest = null }, currentIdentity) {
  const reasons = [...canExecuteCheckpoint(checkpoint, currentIdentity).reasons];
  if (manifest) {
    if (manifest.implementation?.fingerprint !== currentIdentity?.fingerprint) reasons.push('MANIFEST_IMPLEMENTATION_MISMATCH');
    try { requireContract('optimizer', manifest.optimizer?.id, manifest.optimizer?.version); } catch { reasons.push('UNSUPPORTED_OPTIMIZER'); }
  }
  return verdict([...new Set(reasons)]);
}
/** Paired deltas need the same era and the same pack; unpaired comparisons are declined in this release. */
export function canCompareMeasurements(a, b, { purpose = 'EXPLORATORY' } = {}) {
  const reasons = [];
  // v1 provenance cannot certify confirmation. Descriptive compatibility
  // remains available; this restriction does not mint a new evidence schema.
  if (purpose !== 'EXPLORATORY') reasons.push('LAB_WAVE0_CONFIRMATORY_COMPARISON_BLOCKED');
  if (a?.kind !== 'MEASUREMENT_RESULT' || b?.kind !== 'MEASUREMENT_RESULT') return verdict(['NOT_A_MEASUREMENT']);
  if (a.body.eraId !== b.body.eraId) reasons.push('EVALUATION_ERA_MISMATCH');
  if (a.body.packId !== b.body.packId) reasons.push('UNPAIRED_SAMPLES_UNSUPPORTED');
  if (a.body.status !== 'COMPLETE' || b.body.status !== 'COMPLETE') reasons.push('INCOMPLETE_MEASUREMENT');
  return verdict(reasons);
}

export const ZERO_GENOME = () => baselinePolicyState();
export const VERSIONED_CONTRACT_FUNCTIONS = { 'STRICT_CANONICAL_JSON_V1': strictCanonical, 'TRAIT_COMPILER_LINEAR@1': compileTraits, 'EVALUATION_ERA@1': legacyResolveEra, 'EVALUATION_ERA@2': resolveEra, 'GENERALIST_PAIRED_SCORE@1': resolveObjective, 'FIXED_BUDGET_PAIRED_GENERALIST@1': resolvePromotionPolicy, 'POLICY_OBJECTIVE_ALIGNMENT@1': validatePolicyForObjective };
