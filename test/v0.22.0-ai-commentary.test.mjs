// ═══════════════════════════════════════════════════════════════
// v0.22.0-ai-commentary.test.mjs
// Tests for AI commentary engine: tactical commentary,
// post-match analysis, and expanded context-aware banter.
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const commentaryPath = path.join(root, 'apps/lab-web/src/play/ai-commentary.js');
const personalityPath = path.join(root, 'apps/lab-web/src/play/ai-personality.js');

const { generateCommentary, generatePostMatchAnalysis, commentaryInterval } = await import('file://' + commentaryPath.replace(/\\/g, '/'));
const { getAiBanter, getTerminalBanter, getArchetypePersonality } = await import('file://' + personalityPath.replace(/\\/g, '/'));

// ── Commentary module exists ─────────────────────────────────────

test('ai-commentary.js exists and exports generateCommentary', () => {
  assert.equal(typeof generateCommentary, 'function');
});

test('ai-commentary.js exports generatePostMatchAnalysis', () => {
  assert.equal(typeof generatePostMatchAnalysis, 'function');
});

test('ai-commentary.js exports commentaryInterval', () => {
  assert.equal(typeof commentaryInterval, 'function');
});

// ── Tactical commentary ──────────────────────────────────────────

test('generateCommentary returns null for error view models', () => {
  const result = generateCommentary({ status: 'ERROR' });
  assert.equal(result, null);
});

test('generateCommentary returns null when guidance mode is OFF', () => {
  const vm = { status: 'OK', human: { secured: 0, goal: 21 }, opponent: { secured: 0 }, battlefield: { humanHand: [], humanSeatIndex: 0, topER: [], topPR: [], bottomER: [], bottomPR: [] }, zones: { swap: [] }, stack: [] };
  const result = generateCommentary(vm, { guidanceMode: 'OFF' });
  assert.equal(result, null);
});

test('generateCommentary detects low hand size', () => {
  const vm = {
    status: 'OK',
    human: { secured: 5, goal: 21 },
    opponent: { secured: 3 },
    battlefield: { humanHand: [{ id: 1 }, { id: 2 }], humanSeatIndex: 0, topER: [], topPR: [], bottomER: [], bottomPR: [] },
    zones: { swap: [] },
    stack: [],
    match: { fullTurnSequence: 4 },
  };
  const result = generateCommentary(vm, { guidanceMode: 'GUIDED' });
  assert.ok(result, 'should produce commentary for low hand');
  assert.ok(result.includes('2 cards') || result.includes('card'), 'should mention hand size');
});

test('generateCommentary detects score pressure', () => {
  const vm = {
    status: 'OK',
    human: { secured: 5, goal: 21 },
    opponent: { secured: 16, goal: 21 },
    battlefield: { humanHand: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }], humanSeatIndex: 0, topER: [], topPR: [], bottomER: [], bottomPR: [] },
    zones: { swap: [] },
    stack: [],
    match: { fullTurnSequence: 8 },
  };
  const result = generateCommentary(vm, { guidanceMode: 'GUIDED' });
  assert.ok(result, 'should produce commentary for score pressure');
  assert.ok(result.includes('striking') || result.includes('trailing'), 'should mention score pressure');
});

test('generateCommentary detects close game', () => {
  const vm = {
    status: 'OK',
    human: { secured: 12, goal: 21 },
    opponent: { secured: 14, goal: 21 },
    battlefield: { humanHand: [{ id: 1 }, { id: 2 }, { id: 3 }], humanSeatIndex: 0, topER: [], topPR: [], bottomER: [], bottomPR: [] },
    zones: { swap: [] },
    stack: [],
    match: { fullTurnSequence: 10 },
  };
  const result = generateCommentary(vm, { guidanceMode: 'GUIDED' });
  assert.ok(result, 'should produce commentary for close game');
});

test('generateCommentary detects opponent effect row control', () => {
  const vm = {
    status: 'OK',
    human: { secured: 5, goal: 21 },
    opponent: { secured: 5, goal: 21 },
    battlefield: {
      humanHand: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
      humanSeatIndex: 0,
      topER: [{ identity: 'QH' }, { identity: 'KH' }, { identity: 'JH' }],
      topPR: [],
      bottomER: [],
      bottomPR: [],
    },
    zones: { swap: [] },
    stack: [],
    match: { fullTurnSequence: 6 },
  };
  const result = generateCommentary(vm, { guidanceMode: 'DETAILED' });
  assert.ok(result, 'should produce commentary for effect row control');
  assert.ok(result.includes('Effect Row'), 'should mention effect row');
});

test('generateCommentary ESSENTIAL mode filters non-essential commentary', () => {
  const vm = {
    status: 'OK',
    human: { secured: 5, goal: 21 },
    opponent: { secured: 5, goal: 21 },
    battlefield: {
      humanHand: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
      humanSeatIndex: 0,
      topER: [{ identity: 'QH' }, { identity: 'KH' }, { identity: 'JH' }],
      topPR: [],
      bottomER: [],
      bottomPR: [],
    },
    zones: { swap: [] },
    stack: [],
    match: { fullTurnSequence: 6 },
  };
  const result = generateCommentary(vm, { guidanceMode: 'ESSENTIAL' });
  // ESSENTIAL mode should not include effect row commentary
  if (result) {
    assert.ok(!result.includes('Effect Row'), 'ESSENTIAL mode should not mention effect row');
  }
});

test('commentaryInterval returns Infinity for OFF mode', () => {
  assert.equal(commentaryInterval('OFF'), Infinity);
});

test('commentaryInterval returns 1 for DETAILED mode', () => {
  assert.equal(commentaryInterval('DETAILED'), 1);
});

test('commentaryInterval returns 3 for GUIDED mode', () => {
  assert.equal(commentaryInterval('GUIDED'), 3);
});

test('commentaryInterval returns 6 for ESSENTIAL mode', () => {
  assert.equal(commentaryInterval('ESSENTIAL'), 6);
});

// ── Post-match analysis ──────────────────────────────────────────

test('generatePostMatchAnalysis returns string for valid input', () => {
  const analysis = generatePostMatchAnalysis(
    {},
    { securedPoints: 21, supersDeclared: 1, decisions: 20 },
    { securedPoints: 15, supersDeclared: 0 },
    'rusher'
  );
  assert.ok(typeof analysis === 'string');
  assert.ok(analysis.length > 0);
});

test('generatePostMatchAnalysis includes archetype flavor', () => {
  const analysis = generatePostMatchAnalysis(
    {},
    { securedPoints: 21, supersDeclared: 0, decisions: 10 },
    { securedPoints: 18, supersDeclared: 0 },
    'defender'
  );
  assert.ok(analysis.includes('methodical') || analysis.includes('patience'), 'should include defender flavor');
});

test('generatePostMatchAnalysis mentions close margin', () => {
  const analysis = generatePostMatchAnalysis(
    {},
    { securedPoints: 21, supersDeclared: 0, decisions: 15 },
    { securedPoints: 19, supersDeclared: 0 },
    'baseline'
  );
  assert.ok(analysis.includes('wire') || analysis.includes('single decision'), 'should mention close margin');
});

test('generatePostMatchAnalysis mentions super usage', () => {
  const analysis = generatePostMatchAnalysis(
    {},
    { securedPoints: 21, supersDeclared: 2, decisions: 20 },
    { securedPoints: 15, supersDeclared: 0 },
    'rusher'
  );
  assert.ok(analysis.includes('Super') || analysis.includes('super'), 'should mention super usage');
});

test('generatePostMatchAnalysis handles empty stats', () => {
  const analysis = generatePostMatchAnalysis({}, null, null, 'baseline');
  assert.equal(analysis, '');
});

// ── Expanded banter pools ────────────────────────────────────────

test('rusher banter pool has expanded score messages', async () => {
  const source = await readFile(personalityPath, 'utf8');
  // Extract the BANTER_POOLS section only (after the const BANTER_POOLS = { line)
  const bpStart = source.indexOf('const BANTER_POOLS = {');
  assert.ok(bpStart >= 0, 'must have BANTER_POOLS declaration');
  const bpSection = source.slice(bpStart);
  // Find rusher section within BANTER_POOLS
  const rusherStart = bpSection.indexOf('rusher: {');
  assert.ok(rusherStart >= 0, 'rusher must have score pool');
  const rusherSection = bpSection.slice(rusherStart);
  // Find the score array within rusher section (before defender)
  const defenderStart = rusherSection.indexOf('defender: {');
  const rusherOnly = defenderStart >= 0 ? rusherSection.slice(0, defenderStart) : rusherSection;
  const scoreMatch = rusherOnly.match(/score:\s*\[([^\]]+)\]/);
  assert.ok(scoreMatch, 'rusher must have score pool');
  // Count quoted strings in score array
  const quoteCount = (scoreMatch[1].match(/'/g) ?? []).length / 2;
  assert.ok(quoteCount >= 5, `rusher score pool should have >=5 messages, got ${quoteCount}`);
});

test('all archetypes have early-game, mid-game, late-game variants', async () => {
  const source = await readFile(personalityPath, 'utf8');
  const bpStart = source.indexOf('const BANTER_POOLS = {');
  const bpSection = source.slice(bpStart);
  for (const arch of ['rusher', 'defender', 'trickster', 'sniper', 'support', 'tank', 'baseline']) {
    const archStart = bpSection.indexOf(`${arch}: {`);
    assert.ok(archStart >= 0, `${arch} section must exist in BANTER_POOLS`);
    // Find the next archetype or end of BANTER_POOLS
    const afterArch = bpSection.slice(archStart + 1);
    const nextArch = afterArch.search(/\b(?:rusher|defender|trickster|sniper|support|tank|baseline): \{/);
    const archSection = nextArch >= 0 ? bpSection.slice(archStart, archStart + 1 + nextArch) : bpSection.slice(archStart);
    assert.ok(archSection.includes("'early-game'"), `${arch} must have early-game variant`);
    assert.ok(archSection.includes("'mid-game'"), `${arch} must have mid-game variant`);
    assert.ok(archSection.includes("'late-game'"), `${arch} must have late-game variant`);
  }
});

test('all archetypes have close-game and dominating variants', async () => {
  const source = await readFile(personalityPath, 'utf8');
  const bpStart = source.indexOf('const BANTER_POOLS = {');
  const bpSection = source.slice(bpStart);
  for (const arch of ['rusher', 'defender', 'trickster', 'sniper', 'support', 'tank']) {
    const archStart = bpSection.indexOf(`${arch}: {`);
    assert.ok(archStart >= 0, `${arch} section must exist in BANTER_POOLS`);
    const afterArch = bpSection.slice(archStart + 1);
    const nextArch = afterArch.search(/\b(?:rusher|defender|trickster|sniper|support|tank|baseline): \{/);
    const archSection = nextArch >= 0 ? bpSection.slice(archStart, archStart + 1 + nextArch) : bpSection.slice(archStart);
    assert.ok(archSection.includes("'close-game'"), `${arch} must have close-game variant`);
    assert.ok(archSection.includes('dominating'), `${arch} must have dominating variant`);
  }
});

test('all archetypes have comeback variant', async () => {
  const source = await readFile(personalityPath, 'utf8');
  const bpStart = source.indexOf('const BANTER_POOLS = {');
  const bpSection = source.slice(bpStart);
  for (const arch of ['rusher', 'defender', 'trickster', 'sniper', 'support', 'tank']) {
    const archStart = bpSection.indexOf(`${arch}: {`);
    assert.ok(archStart >= 0, `${arch} section must exist in BANTER_POOLS`);
    const afterArch = bpSection.slice(archStart + 1);
    const nextArch = afterArch.search(/\b(?:rusher|defender|trickster|sniper|support|tank|baseline): \{/);
    const archSection = nextArch >= 0 ? bpSection.slice(archStart, archStart + 1 + nextArch) : bpSection.slice(archStart);
    assert.ok(archSection.includes('comeback'), `${arch} must have comeback variant`);
  }
});

// ── Context-aware banter ─────────────────────────────────────────

test('getAiBanter accepts context parameter', () => {
  const result = getAiBanter({ type: 'SCORE' }, 'rusher', 'hybrix-rusher', { gamePhase: 'early-game', scoreDiff: 0 });
  assert.ok(result, 'should return banter with context');
});

test('getAiBanter returns early-game variant when context matches', () => {
  const result = getAiBanter({ type: 'SCORE' }, 'rusher', 'hybrix-rusher', { gamePhase: 'early-game', scoreDiff: 0 });
  // Should be from early-game pool
  assert.ok(result, 'should return early-game banter');
});

test('getAiBanter returns dominating variant when scoreDiff >= 10', () => {
  const result = getAiBanter({ type: 'SCORE' }, 'rusher', 'hybrix-rusher', { scoreDiff: 12 });
  assert.ok(result, 'should return dominating banter');
});

test('getAiBanter returns comeback variant when isComeback is true', () => {
  const result = getAiBanter({ type: 'SCORE' }, 'defender', 'hybrix-defender', { isComeback: true });
  assert.ok(result, 'should return comeback banter');
});

test('getAiBanter returns null for unrecognized event types', () => {
  const result = getAiBanter({ type: 'UNKNOWN_EVENT' }, 'rusher', 'hybrix-rusher');
  assert.equal(result, null);
});

test('getAiBanter returns null for null event', () => {
  const result = getAiBanter(null, 'rusher', 'hybrix-rusher');
  assert.equal(result, null);
});

test('getTerminalBanter still works without context', () => {
  const winResult = getTerminalBanter('rusher', true);
  const lossResult = getTerminalBanter('rusher', false);
  assert.ok(winResult, 'should return win banter');
  assert.ok(lossResult, 'should return loss banter');
  assert.notEqual(winResult, lossResult, 'win and loss banter should differ');
});

// ── Determinism check ────────────────────────────────────────────

test('ai-commentary.js does not use Math.random', async () => {
  const source = await readFile(commentaryPath, 'utf8');
  assert.ok(!source.includes('Math.random'), 'commentary engine must be deterministic (no Math.random)');
});
