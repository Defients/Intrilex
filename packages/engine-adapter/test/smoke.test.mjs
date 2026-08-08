import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENGINE_VERSION,
  RULES_VERSION,
  OFFICIAL_RULES_VERSION,
  DEFAULT_SIMULATION_PROFILE,
  CANONICAL_RANKS,
  RANK_REGISTRY,
  allRankDefinitions,
  rankDefinition,
  parseIdentity,
  hasOrdinaryScuttleImmunity,
  compareScuttle,
  isCoreProfile,
  canonicalRankAuthority,
  hashCanonical,
  simulationCapabilities,
} from '@intrilex/engine-adapter';

// ─── Version constants ──────────────────────────────────────────────────────

test('ENGINE_VERSION is "4.2.6"', () => {
  assert.equal(ENGINE_VERSION, '4.2.6');
});

test('RULES_VERSION and OFFICIAL_RULES_VERSION are "4.3.1"', () => {
  assert.equal(RULES_VERSION, '4.3.1');
  assert.equal(OFFICIAL_RULES_VERSION, '4.3.1');
});

test('DEFAULT_SIMULATION_PROFILE is core-advanced-authority', () => {
  assert.equal(DEFAULT_SIMULATION_PROFILE, 'core-advanced-authority');
});

// ─── Canonical ranks ────────────────────────────────────────────────────────

test('CANONICAL_RANKS has 15 entries in engine order', () => {
  assert.equal(CANONICAL_RANKS.length, 15);
  assert.deepEqual(CANONICAL_RANKS, ['A','2','3','4','5','6','7','8','9','10','J','Q','K','RJ','BJ']);
});

test('allRankDefinitions returns 15 definitions with required fields', () => {
  const defs = allRankDefinitions();
  assert.equal(defs.length, 15);
  for (const d of defs) {
    assert.ok(d.rank, 'definition must have rank');
    assert.ok(typeof d.prPoints === 'number', 'definition must have prPoints');
    assert.ok(typeof d.scuttleOrder === 'number', 'definition must have scuttleOrder');
    assert.ok(Array.isArray(d.modes), 'definition must have modes array');
    assert.ok(Array.isArray(d.notes), 'definition must have notes array');
  }
});

test('rankDefinition returns definition for known suited identity and throws for unknown', () => {
  const ace = rankDefinition('A♠');
  assert.ok(ace, 'A♠ must have a definition');
  assert.equal(ace.rank, 'A');
  const five = rankDefinition('5♥');
  assert.equal(five.rank, '5');
  assert.throws(() => rankDefinition('ZZZ'), /Unknown Intrilex card identity/);
});

test('rankDefinition for BJ (Black Joker) has prPoints 11', () => {
  const bj = rankDefinition('BJ');
  assert.ok(bj);
  assert.equal(bj.prPoints, 11);
});

test('rankDefinition for RJ (Red Joker) has prPoints 5', () => {
  const rj = rankDefinition('RJ');
  assert.ok(rj);
  assert.equal(rj.prPoints, 5);
});

// ─── Scuttle authority ──────────────────────────────────────────────────────

test('compareScuttle returns 0 for identical identity', () => {
  const a = { identity: '5♠' };
  const b = { identity: '5♠' };
  assert.equal(compareScuttle(a, b), 0);
});

test('compareScuttle distinguishes higher and lower ranks', () => {
  const ace = { identity: 'A♠' };
  const two = { identity: '2♥' };
  // In Intrilex, 2 has the highest scuttleOrder (strongest scuttler)
  assert.ok(compareScuttle(two, ace) > 0, '2 should scuttle higher than A');
  assert.ok(compareScuttle(ace, two) < 0, 'A should scuttle lower than 2');
});

// ─── Identity parsing ───────────────────────────────────────────────────────

test('parseIdentity extracts rank and suit for standard cards', () => {
  assert.deepEqual(parseIdentity('A♠'), { rank: 'A', suit: '♠' });
  assert.deepEqual(parseIdentity('7♥'), { rank: '7', suit: '♥' });
  assert.deepEqual(parseIdentity('10♣'), { rank: '10', suit: '♣' });
});

test('parseIdentity handles jokers (no suit)', () => {
  assert.deepEqual(parseIdentity('RJ'), { rank: 'RJ', suit: null });
  assert.deepEqual(parseIdentity('BJ'), { rank: 'BJ', suit: null });
});

// ─── Profile classification ─────────────────────────────────────────────────

test('isCoreProfile returns true for core- prefixed profiles', () => {
  assert.equal(isCoreProfile('core-advanced-authority'), true);
  assert.equal(isCoreProfile('core-unrestricted-authority'), true);
  assert.equal(isCoreProfile('core-foundation-authority'), true);
});

test('isCoreProfile returns false for non-core profiles', () => {
  assert.equal(isCoreProfile('first-contact-essentials'), false);
  assert.equal(isCoreProfile('first-contact-baseline'), false);
  assert.equal(isCoreProfile(null), false);
  assert.equal(isCoreProfile(undefined), false);
  assert.equal(isCoreProfile(123), false);
});

// ─── Canonical rank authority artifact ──────────────────────────────────────

test('canonicalRankAuthority produces a valid authority artifact', () => {
  const authority = canonicalRankAuthority();
  assert.equal(authority.schemaVersion, '1.0.0');
  assert.equal(authority.engineVersion, '4.2.6');
  assert.equal(authority.rulesVersion, '4.3.1');
  assert.ok(authority.authorityHash, 'must have authorityHash');
  assert.equal(authority.authorityHash.length, 64, 'hash must be 64 hex chars');
  assert.ok(/^[0-9a-f]{64}$/.test(authority.authorityHash), 'hash must be lowercase hex');
  assert.equal(authority.ranks.length, 15);
  for (const r of authority.ranks) {
    assert.ok(r.rankId, 'rank entry must have rankId');
    assert.ok(typeof r.prPoints === 'number');
    assert.ok(typeof r.scuttleOrder === 'number');
    assert.ok(Array.isArray(r.modes));
    assert.ok(Array.isArray(r.notes));
  }
});

test('canonicalRankAuthority is deterministic — same output on repeated calls', () => {
  const a = canonicalRankAuthority();
  const b = canonicalRankAuthority();
  assert.equal(a.authorityHash, b.authorityHash, 'authority hash must be deterministic');
});

// ─── hashCanonical re-export ────────────────────────────────────────────────

test('hashCanonical is re-exported and produces 64-char hex', () => {
  const h = hashCanonical({ a: 1, b: 2 });
  assert.equal(h.length, 64);
  assert.ok(/^[0-9a-f]{64}$/.test(h));
});

test('hashCanonical is order-independent', () => {
  assert.equal(hashCanonical({ b: 2, a: 1 }), hashCanonical({ a: 1, b: 2 }));
});

// ─── Simulation capabilities ────────────────────────────────────────────────

test('simulationCapabilities returns a non-empty array of capability objects', () => {
  const caps = simulationCapabilities();
  assert.ok(Array.isArray(caps));
  assert.ok(caps.length > 0, 'must have at least one capability');
  for (const cap of caps) {
    assert.ok(cap.profileId, 'capability must have profileId');
    assert.ok(cap.status, 'capability must have status');
    assert.ok(Array.isArray(cap.completeActionFamilies), 'capability must have completeActionFamilies');
  }
});
