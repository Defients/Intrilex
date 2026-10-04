import test from 'node:test';
import assert from 'node:assert/strict';
import { createStrategyExplanationPacket, validateStrategyExplanation, explainStrategyEvidence, normalizeStrategyAiConfig, strategyAiClient, STRATEGY_EXPLANATION_PACKET_CONTRACT, STRATEGY_INTERPRETER_MODES, STRATEGY_INTERPRETER_SYSTEM_PROMPT, STRATEGY_EXPLANATION_SCHEMA } from '@intrilex/analytics-ai/strategy-interpreter';
import { OllamaClient, OLLAMA_ERROR } from '@intrilex/analytics-ai/ollama-client';

// ── Fixtures ────────────────────────────────────────────────────────────
const aggregate = {
  total: { decisions: 200, opportunities: 120, selected: 23, skipped: 97, selectionRate: 23 / 120, holdRate: 97 / 120, selectedOutcomeAssociation: 0.7, skippedOutcomeAssociation: 0.336 },
  timing: [{ bucket: 'OPENING', opportunities: 40, selected: 10, selectionRate: 0.25 }, { bucket: 'MIDGAME', opportunities: 30, selected: 3, selectionRate: 0.1 }],
  semantics: { PRIMARY_EFFECT: { opportunities: 100, selected: 20, selectionRate: 0.2 }, SCORE_USE: { opportunities: 20, selected: 3, selectionRate: 0.15 } },
  games: 8, seedBlocks: 4, distinctStates: 87, policies: ['value'], matchups: ['tempo']
};
const observationalClaim = { confidence: 'EXPERIMENTAL', recommendation: 'UNKNOWN', evidenceType: 'ASSOCIATIONAL', estimatedMagnitude: 0.364, provenance: ['SI-abc'], artifactId: 'SI-claim1' };
const actionableClaim = {
  confidence: 'SUGGESTIVE', recommendation: 'PLAY', evidenceType: 'COUNTERFACTUAL', estimatedMagnitude: 0.31,
  statement: 'Usually play 7 here: the alternative beat the recorded play.',
  uncertainty: { interval: [0.08, 0.54] },
  statementData: { heterogeneity: 'ROBUST', hiddenWorlds: 128, informationSetId: 'SI-info', direction: 'ALTERNATIVE' },
  provenance: ['SI-study'], artifactId: 'SI-claim2'
};
const packet = createStrategyExplanationPacket({
  subject: 'rank:7', humanSubjectName: '7 · Seven',
  context: { rulesProfile: 'core-advanced-authority', eraId: 'abc123', filters: { maturity: 'OPENING' }, historical: false },
  aggregate, claims: [observationalClaim], controlledClaims: [actionableClaim],
  researchLeads: [{ kind: 'PROMISING_POSITIVE_SIGNAL', detail: 'Observational signal worth testing.' }],
  publicMechanicDescription: 'Seven uses suspended child plays.'
});
const noAdvicePacket = createStrategyExplanationPacket({
  subject: 'rank:Q', humanSubjectName: 'Q · Queen', context: {},
  aggregate: null, claims: [observationalClaim], controlledClaims: []
});
const okExplanation = label => ({
  headline: 'Seven looks promising', plainSummary: 'Used on 19.2% of openings.', whatThisMeans: 'Controlled evidence exists.',
  whatThisDoesNotMean: 'It does not mean Seven always wins.', practicalTakeaway: 'Consider the recorded play.',
  interestingSignal: 'The association is strong.', nextUsefulTest: 'More worlds.',
  warnings: ['Observational parts are not proof.'], confidenceLanguage: 'SUGGESTIVE', evidenceLabel: label
});

function jsonResponse(data, status = 200) {
  return { ok: status < 300, status, json: async () => data, text: async () => JSON.stringify(data), body: null };
}
function mockFetch(handler) { return async (url, opts) => handler(url, opts); }
const chatReply = content => jsonResponse({ message: { content }, done: true });

// ── Packet contract ─────────────────────────────────────────────────────
test('explanation packet carries the V1 contract and only sanitized fields', () => {
  assert.equal(packet.contract, STRATEGY_EXPLANATION_PACKET_CONTRACT);
  const json = JSON.stringify(packet);
  for (const banned of ['artifactId', 'provenance', 'replayHash', 'commands', 'HIDDEN', 'sourceHandles', 'derivedSeed', 'initialStateHash'])
    assert.equal(json.includes(banned), false, `packet leaks ${banned}`);
  assert.equal(packet.subject, 'rank:7');
  assert.equal(packet.humanSubjectName, '7 · Seven');
});

test('packet classification reflects the evidence, never model opinion', () => {
  assert.equal(packet.evidenceLabel, 'CONTROLLED_ADVICE');
  assert.equal(packet.highestConfidence, 'SUGGESTIVE');
  assert.equal(packet.actionable.length, 1);
  assert.equal(packet.actionable[0].recommendation, 'PLAY');
  assert.equal(packet.actionable[0].hiddenWorlds, 128);
  assert.equal(packet.semanticBreakdown.SCORE_USE.opportunities, 20);
});

test('observational-only packet stays OBSERVED_ONLY with UNKNOWN confidence floor', () => {
  assert.equal(noAdvicePacket.evidenceLabel, 'OBSERVED_ONLY');
  assert.equal(noAdvicePacket.highestConfidence, 'EXPERIMENTAL');
  const empty = createStrategyExplanationPacket({ subject: 'rank:K' });
  assert.equal(empty.evidenceLabel, 'UNKNOWN');
  assert.equal(empty.observationalSummary, null);
});

test('packet requires a subject', () => {
  assert.throws(() => createStrategyExplanationPacket({}), /SUBJECT_REQUIRED/);
});

// ── Config ──────────────────────────────────────────────────────────────
test('strategy AI is OFF by default and rejects non-local endpoints', () => {
  const off = normalizeStrategyAiConfig({});
  assert.equal(off.mode, STRATEGY_INTERPRETER_MODES.OFF);
  assert.throws(() => normalizeStrategyAiConfig({ mode: 'OLLAMA_LOCAL', endpoint: 'https://api.openai.com' }), /NON_LOCAL/);
  assert.throws(() => normalizeStrategyAiConfig({ mode: 'CLOUD' }), /MODE_INVALID/);
  assert.throws(() => normalizeStrategyAiConfig({ style: 'POETRY' }), /STYLE_INVALID/);
  const local = normalizeStrategyAiConfig({ mode: 'OLLAMA_LOCAL', endpoint: 'http://127.0.0.1:11434', model: 'llama3.1' });
  assert.equal(local.mode, 'OLLAMA_LOCAL'); assert.equal(local.model, 'llama3.1');
});

// ── Validation ──────────────────────────────────────────────────────────
test('valid structured output validates and echoes deterministic labels', () => {
  const validated = validateStrategyExplanation(okExplanation('CONTROLLED_ADVICE'), packet);
  assert.equal(validated.evidenceLabel, 'CONTROLLED_ADVICE');
  assert.equal(validated.confidenceLanguage, 'SUGGESTIVE');
});

test('the model cannot invent an evidence label or upgrade confidence', () => {
  assert.throws(() => validateStrategyExplanation(okExplanation('CONTROLLED_ADVICE'), noAdvicePacket), /LABEL_MISMATCH/);
  assert.throws(() => validateStrategyExplanation({ ...okExplanation('OBSERVED_ONLY'), confidenceLanguage: 'STRONG' }, noAdvicePacket), /CONFIDENCE_MISMATCH/);
});

test('malformed output, wrong schema and extra fields are rejected', () => {
  assert.throws(() => validateStrategyExplanation(null, packet), /SCHEMA/);
  assert.throws(() => validateStrategyExplanation('text', packet), /SCHEMA/);
  assert.throws(() => validateStrategyExplanation({ ...okExplanation('CONTROLLED_ADVICE'), secretClaim: 'PLAY 7' }, packet), /SCHEMA/);
  const missing = okExplanation('CONTROLLED_ADVICE'); delete missing.warnings;
  assert.throws(() => validateStrategyExplanation(missing, packet), /SCHEMA/);
});

test('the model cannot cite numbers absent from the packet', () => {
  const bad = { ...okExplanation('CONTROLLED_ADVICE'), plainSummary: 'Seven won 88.8% of all games ever.' };
  assert.throws(() => validateStrategyExplanation(bad, packet), /UNGROUNDED_NUMBER/);
});

// ── End-to-end interpreter with mocked transport ────────────────────────
test('structured explanation round-trips through a mock Ollama daemon', async () => {
  let body;
  const client = new OllamaClient({ endpoint: 'http://localhost:11434', fetchImpl: mockFetch(async (url, opts) => { body = JSON.parse(opts.body); return chatReply(JSON.stringify(okExplanation('CONTROLLED_ADVICE'))); }) });
  const result = await explainStrategyEvidence({ client, packet, model: 'llama3.1' });
  assert.equal(result.explanation.headline, 'Seven looks promising');
  assert.equal(result.model, 'llama3.1');
  assert.equal(result.packetVersion, STRATEGY_EXPLANATION_PACKET_CONTRACT);
  assert.equal(result.scientific, false);
  assert.match(result.disclaimer, /not scientific/);
  // Structured output was enforced via the request format field.
  assert.deepEqual(body.format, STRATEGY_EXPLANATION_SCHEMA);
  assert.equal(body.messages[0].content, STRATEGY_INTERPRETER_SYSTEM_PROMPT);
  assert.equal(body.model, 'llama3.1');
});

test('malformed model JSON is rejected, never treated as evidence', async () => {
  const client = new OllamaClient({ endpoint: 'http://localhost:11434', fetchImpl: mockFetch(async () => chatReply('not json at all')) });
  await assert.rejects(explainStrategyEvidence({ client, packet, model: 'm' }), err => err.category === OLLAMA_ERROR.MALFORMED_RESPONSE);
});

test('schema-violating model output is rejected', async () => {
  const client = new OllamaClient({ endpoint: 'http://localhost:11434', fetchImpl: mockFetch(async () => chatReply(JSON.stringify({ headline: 'x' }))) });
  await assert.rejects(explainStrategyEvidence({ client, packet, model: 'm' }), /SCHEMA/);
});

test('unavailable daemon fails gracefully with no cloud fallback', async () => {
  const client = new OllamaClient({ endpoint: 'http://localhost:11434', fetchImpl: mockFetch(async () => { throw new TypeError('fetch failed'); }) });
  await assert.rejects(explainStrategyEvidence({ client, packet, model: 'm' }), err => err.category === OLLAMA_ERROR.UNREACHABLE);
  const http404 = new OllamaClient({ endpoint: 'http://localhost:11434', fetchImpl: mockFetch(async () => jsonResponse({ error: 'not found' }, 404)) });
  await assert.rejects(explainStrategyEvidence({ client: http404, packet, model: 'm' }), err => err.category === OLLAMA_ERROR.MODEL_NOT_FOUND);
});

test('cancellation propagates through the abort signal', async () => {
  const client = new OllamaClient({ endpoint: 'http://localhost:11434', fetchImpl: mockFetch(async () => chatReply('{}')) });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(explainStrategyEvidence({ client, packet, model: 'm', signal: controller.signal }), err => err.category === OLLAMA_ERROR.CANCELLED);
});

test('strategyAiClient builds a local client from normalized config', () => {
  const cfg = normalizeStrategyAiConfig({ mode: 'OLLAMA_LOCAL', endpoint: 'http://localhost:11434/', model: 'qwen' });
  const client = strategyAiClient(cfg, { fetchImpl: mockFetch(async () => jsonResponse({ version: '0.5.0' })) });
  assert.equal(client.endpoint, 'http://localhost:11434');
});
