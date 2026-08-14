// ═══════════════════════════════════════════════════════════════
// intelligence-surfacing.test.mjs — Epoch 6 intelligence tests
//
// Tests the strategic fingerprint domain module and its integration
// into the profile ranked tab.
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  StrategicTrait,
  deriveStrategicTraits,
  derivePrimaryArchetype,
  buildStrategicFingerprint,
} from '@intrilex/account-domain/strategic-fingerprint';

const profileSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/workspaces/profile.js'), 'utf8');
const playersCssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/players/players.css'), 'utf8');
const indexSrc = readFileSync(join(process.cwd(), 'packages/account-domain/src/index.mjs'), 'utf8');

// ── deriveStrategicTraits ──

test('Fingerprint: empty stats returns no traits', () => {
  assert.deepEqual(deriveStrategicTraits(null), []);
  assert.deepEqual(deriveStrategicTraits({ totalGames: 0 }), []);
});

test('Fingerprint: aggressive player gets Aggressive trait', () => {
  const traits = deriveStrategicTraits({
    wins: 15, losses: 5, draws: 0, totalGames: 20,
    avgTurns: 10, avgIrMargin: 25, avgDrawPileRemaining: 15, avgGoalProgress: 0.8, comebackWins: 0,
  });
  const aggro = traits.find(t => t.type === StrategicTrait.AGGRESSIVE);
  assert.ok(aggro, 'Must have Aggressive trait');
  assert.ok(aggro.score >= 0.3, 'Aggressive score must be significant');
});

test('Fingerprint: defensive player gets Defensive trait', () => {
  const traits = deriveStrategicTraits({
    wins: 10, losses: 8, draws: 2, totalGames: 20,
    avgTurns: 30, avgIrMargin: 5, avgDrawPileRemaining: 12, avgGoalProgress: 0.6, comebackWins: 0,
  });
  const def = traits.find(t => t.type === StrategicTrait.DEFENSIVE);
  assert.ok(def, 'Must have Defensive trait');
});

test('Fingerprint: tempo player gets Tempo trait', () => {
  const traits = deriveStrategicTraits({
    wins: 12, losses: 8, draws: 0, totalGames: 20,
    avgTurns: 20, avgIrMargin: 15, avgDrawPileRemaining: 10, avgGoalProgress: 0.7, comebackWins: 0,
  });
  const tempo = traits.find(t => t.type === StrategicTrait.TEMPO);
  assert.ok(tempo, 'Must have Tempo trait');
});

test('Fingerprint: high-volume player gets Grinder trait', () => {
  const traits = deriveStrategicTraits({
    wins: 30, losses: 25, draws: 5, totalGames: 60,
    avgTurns: 20, avgIrMargin: 10, avgDrawPileRemaining: 10, avgGoalProgress: 0.6, comebackWins: 2,
  });
  const grinder = traits.find(t => t.type === StrategicTrait.GRINDER);
  assert.ok(grinder, 'Must have Grinder trait');
  assert.ok(grinder.score >= 0.3, 'Grinder score must be significant');
});

test('Fingerprint: high win rate player gets Precise trait', () => {
  const traits = deriveStrategicTraits({
    wins: 18, losses: 2, draws: 0, totalGames: 20,
    avgTurns: 18, avgIrMargin: 15, avgDrawPileRemaining: 10, avgGoalProgress: 0.75, comebackWins: 0,
  });
  const precise = traits.find(t => t.type === StrategicTrait.PRECISE);
  assert.ok(precise, 'Must have Precise trait');
});

test('Fingerprint: traits are sorted by score descending', () => {
  const traits = deriveStrategicTraits({
    wins: 15, losses: 5, draws: 0, totalGames: 20,
    avgTurns: 10, avgIrMargin: 25, avgDrawPileRemaining: 15, avgGoalProgress: 0.8, comebackWins: 0,
  });
  for (let i = 1; i < traits.length; i++) {
    assert.ok(traits[i - 1].score >= traits[i].score, 'Traits must be sorted by score descending');
  }
});

test('Fingerprint: traits below 0.3 threshold are excluded', () => {
  const traits = deriveStrategicTraits({
    wins: 1, losses: 1, draws: 0, totalGames: 2,
    avgTurns: 20, avgIrMargin: 10, avgDrawPileRemaining: 10, avgGoalProgress: 0.5, comebackWins: 0,
  });
  for (const t of traits) {
    assert.ok(t.score >= 0.3, `Trait ${t.type} score ${t.score} must be >= 0.3`);
  }
});

test('Fingerprint: each trait has label, icon, description', () => {
  const traits = deriveStrategicTraits({
    wins: 15, losses: 5, draws: 0, totalGames: 20,
    avgTurns: 10, avgIrMargin: 25, avgDrawPileRemaining: 15, avgGoalProgress: 0.8, comebackWins: 0,
  });
  for (const t of traits) {
    assert.ok(t.label, 'Trait must have label');
    assert.ok(t.icon, 'Trait must have icon');
    assert.ok(t.description, 'Trait must have description');
    assert.ok(t.score >= 0 && t.score <= 1, 'Score must be in [0, 1]');
  }
});

// ── derivePrimaryArchetype ──

test('Archetype: empty traits returns Unknown', () => {
  const result = derivePrimaryArchetype([]);
  assert.equal(result.archetype, 'Unknown');
  assert.equal(result.icon, '❓');
});

test('Archetype: single trait returns that trait as archetype', () => {
  const traits = [{
    type: StrategicTrait.AGGRESSIVE, label: 'Aggressive', icon: '⚔', score: 0.8,
    description: 'Wins quickly.',
  }];
  const result = derivePrimaryArchetype(traits);
  assert.equal(result.archetype, 'Aggressive');
  assert.equal(result.icon, '⚔');
  assert.ok(result.summary.includes('Wins quickly'));
});

test('Archetype: two traits combines them', () => {
  const traits = [
    { type: StrategicTrait.AGGRESSIVE, label: 'Aggressive', icon: '⚔', score: 0.8, description: 'Fast wins.' },
    { type: StrategicTrait.PRECISE, label: 'Precise', icon: '🎯', score: 0.7, description: 'High win rate.' },
  ];
  const result = derivePrimaryArchetype(traits);
  assert.ok(result.archetype.includes('Aggressive'));
  assert.ok(result.archetype.includes('Precise'));
});

// ── buildStrategicFingerprint ──

test('Fingerprint: buildStrategicFingerprint returns complete fingerprint', () => {
  const fp = buildStrategicFingerprint({
    wins: 15, losses: 5, draws: 0, totalGames: 20,
    avgTurns: 10, avgIrMargin: 25, avgDrawPileRemaining: 15, avgGoalProgress: 0.8, comebackWins: 0,
  });
  assert.ok(fp.traits.length > 0, 'Must have traits');
  assert.ok(fp.primaryArchetype, 'Must have primary archetype');
  assert.ok(fp.archetypeIcon, 'Must have archetype icon');
  assert.ok(fp.summary, 'Must have summary');
});

test('Fingerprint: buildStrategicFingerprint with no games returns empty', () => {
  const fp = buildStrategicFingerprint({ totalGames: 0 });
  assert.equal(fp.traits.length, 0);
  assert.equal(fp.primaryArchetype, 'Unknown');
});

// ── Domain exports ──

test('Domain: strategic fingerprint exported from index', () => {
  assert.ok(indexSrc.includes('StrategicTrait'), 'index.mjs must export StrategicTrait');
  assert.ok(indexSrc.includes('buildStrategicFingerprint'), 'index.mjs must export buildStrategicFingerprint');
  assert.ok(indexSrc.includes('deriveStrategicTraits'), 'index.mjs must export deriveStrategicTraits');
});

// ── Profile integration ──

test('Profile: imports buildStrategicFingerprint', () => {
  assert.ok(
    profileSrc.includes('buildStrategicFingerprint'),
    'Profile must import buildStrategicFingerprint'
  );
});

test('Profile: renders fingerprint card in ranked tab', () => {
  assert.ok(
    profileSrc.includes('renderStrategicFingerprintCard'),
    'Profile must have renderStrategicFingerprintCard function'
  );
  assert.ok(
    profileSrc.includes('data-testid="profile-fingerprint"'),
    'Profile must have fingerprint card with testid'
  );
  assert.ok(
    profileSrc.includes('data-testid="profile-fingerprint-archetype"'),
    'Profile must have archetype testid'
  );
  assert.ok(
    profileSrc.includes('data-testid="profile-fingerprint-trait"'),
    'Profile must have trait testid'
  );
});

// ── CSS ──

test('CSS: strategic fingerprint styles exist', () => {
  assert.ok(playersCssSrc.includes('.profile-fingerprint-archetype'), 'CSS must have fingerprint archetype styles');
  assert.ok(playersCssSrc.includes('.profile-fingerprint-trait'), 'CSS must have fingerprint trait styles');
  assert.ok(playersCssSrc.includes('.profile-fingerprint-traits'), 'CSS must have fingerprint traits container');
});
