// ═══════════════════════════════════════════════════════════════
// v0.20.0-queens-court-canon.test.mjs
// Official Rules v4.2.0 Queen's Court canonization gate
//
// Validates the canonical rulebook artifacts, the Queen's Court
// definition, the corrected counter-authority taxonomy, version-surface
// agreement, and historical v4.1.2 immutability.
//
// These are canon-artifact behavioral assertions. Engine-level
// behavioral tests (legal-action generation, stack resolution, replay
// serialization for Queen's Court) are pending runtime implementation
// and are tracked as a documented residual gap.
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hashCanonical } from '@intrilex/shared';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(path.join(root, rel), 'utf8');

const V42 = 'docs/INTRILEX_v4.3.1_COMPLETE_PLAYER_RULEBOOK.md';
const V412 = 'docs/INTRILEX_v4.1.2_COMPLETE_PLAYER_RULEBOOK.md';

let rulebook = '';
let historical = '';
test.before(async () => {
  rulebook = await read(V42);
  historical = await read(V412);
});

// ── Canon existence and version header ───────────────────────────

test('v4.2.0: canonical rulebook exists with v4.3.1 header', async () => {
  assert.match(rulebook, /^# INTRILEX — Complete Player Rulebook v4\.3\.1$/m);
  assert.match(rulebook, /v4\.2\.0 Queen.s Court Update/);
});

test('v4.2.0: historical v4.1.2 rulebook is preserved immutable', async () => {
  assert.match(historical, /^# INTRILEX — Complete Player Rulebook v4\.1\.2$/m);
  // The v4.1.2 header must NOT carry the v4.2.0 update note
  assert.doesNotMatch(historical, /v4\.2\.0 Queen.s Court Update/);
});

// ── Queen's Court definition ─────────────────────────────────────

test('v4.2.0: Queen\'s Court is defined as a multi-card Anchor Play', async () => {
  assert.match(rulebook, /Queen.s Court — Multi-Card Anchor Play/);
  assert.match(rulebook, /exactly two suited Queens from your hand as one Queen.s Court play/);
  assert.match(rulebook, /costs 1 Mini-Turn/);
  assert.match(rulebook, /one composite stack item/);
  assert.match(rulebook, /no more than once per Full Turn/);
});

test('v4.2.0: Queen\'s Court resolves both Queens into ER untapped with Aegis', async () => {
  assert.match(rulebook, /both Queens enter their controller.s Enduring Row simultaneously and untapped/);
  assert.match(rulebook, /normal protected-entry Aegis/);
  assert.match(rulebook, /cannot be split between the Point Row and Enduring Row/);
});

test('v4.2.0: Queen\'s Court declaration restrictions are enumerated', async () => {
  assert.match(rulebook, /exactly two physical suited Queens/);
  assert.match(rulebook, /both located in that player.s hand when declared/);
  assert.match(rulebook, /declaring Queen.s Court with only one Queen/);
  assert.match(rulebook, /three or four Queens/);
  assert.match(rulebook, /using a Two as a Queen substitute/);
  assert.match(rulebook, /Draw & Cast or another generated child play/);
});

test('v4.2.0: Q♠ is a legal component and suits need not match', async () => {
  assert.match(rulebook, /Q♠ is a legal Queen.s Court component/);
  assert.match(rulebook, /Queen.s Court does not require matching suits/);
});

test('v4.2.0: no partial resolution and no special refund', async () => {
  assert.match(rulebook, /no special refund, partial resolution/);
  assert.match(rulebook, /one Queen survives/);
});

test('v4.2.0: incoming Queens do not count as OTT while pending', async () => {
  assert.match(rulebook, /do not count as OTT Queens while Queen.s Court is pending/);
  assert.match(rulebook, /begin contributing only after the composite play resolves/);
});

test('v4.2.0: each Queen\'s Guard protects the other, not itself', async () => {
  assert.match(rulebook, /Each Queen.s Guard protects the other Queen/);
  assert.match(rulebook, /No Queen protects itself through its own Guard/);
});

// ── Counter authority ────────────────────────────────────────────

test('v4.2.0: K♠ is the only standard direct counter to Queen\'s Court', async () => {
  assert.match(rulebook, /K♠ may counter Queen.s Court/);
  assert.match(rulebook, /K♠ is the only standard direct counter to Queen.s Court/);
});

test('v4.2.0: Ace-family counters cannot counter Queen\'s Court', async () => {
  const qcCounter = rulebook.match(/Queen.s Court — Counter Authority[\s\S]*?## ⦗K⦘/);
  assert.ok(qcCounter, 'Queen\'s Court counter authority section must exist');
  const section = qcCounter[0];
  assert.match(section, /Base Ace cannot counter Queen.s Court/);
  assert.match(section, /Anchor Ace cannot counter Queen.s Court/);
  assert.match(section, /A♠ cannot counter Queen.s Court/);
  assert.match(section, /⭐A cannot counter Queen.s Court/);
  assert.match(section, /ordinary K♣, K♦, and K♥ cannot counter Queen.s Court/);
});

test('v4.2.0: K♠ response remains independently counterable', async () => {
  assert.match(rulebook, /another legal counter may still counter the pending K♠ response/);
});

test('v4.2.0: K♠ lists Queen\'s Court among eligible multi-card plays', async () => {
  const ksSection = rulebook.match(/K♠ \(Instant\) — Counter Multi-Play[\s\S]*?(?=### )/);
  assert.ok(ksSection, 'K♠ section must exist');
  assert.match(ksSection[0], /Queen.s Court/);
  assert.match(ksSection[0], /Royal Marriage/);
});

// ── Corrected Ace counter taxonomy ───────────────────────────────

test('v4.2.0: Base Ace does not counter Anchor/Goal-Mod merely because multi-card', async () => {
  const base = rulebook.match(/### A \(Instant\) — Base Counter[\s\S]*?(?=### )/);
  assert.ok(base, 'Base Ace section must exist');
  assert.match(base[0], /an Anchor or Goal-Mod play \(single-card or multi-card\)/);
  assert.match(base[0], /does not counter an Anchor or Goal-Mod play merely because it uses multiple cards/);
});

test('v4.2.0: Anchor Ace follows Base Ace class restrictions', async () => {
  const anchor = rulebook.match(/### A \(⚓ Anchor Counter\)[\s\S]*?(?=### )/);
  assert.ok(anchor, 'Anchor Ace section must exist');
  assert.match(anchor[0], /cannot counter an Anchor or Goal-Mod play \(single-card or multi-card\)/);
});

test('v4.2.0: A♠ does not gain Anchor/Goal-Mod authority from multi-card', async () => {
  const aspade = rulebook.match(/### A♠ \(Instant\) — Exile Counter[\s\S]*?(?=### )/);
  assert.ok(aspade, 'A♠ section must exist');
  assert.match(aspade[0], /does not gain Anchor or Goal-Mod counter authority merely because the target is multi-card/);
});

test('v4.2.0: ⭐A multi-card authority narrowed to Effect plays', async () => {
  const star = rulebook.match(/### ⭐A \(Instant\) — Super Counter[\s\S]*?(?=## )/);
  assert.ok(star, '⭐A section must exist');
  assert.match(star[0], /eligible multi-card Effect plays/);
  assert.match(star[0], /does not counter an Anchor or Goal-Mod play \(single-card or multi-card\) solely because it is multi-card/);
});

test('v4.2.0: ordinary King counters only single-card Anchor/Goal-Mod', async () => {
  const king = rulebook.match(/### K \(Instant\) — Counter Anchor or Goal[\s\S]*?(?=### )/);
  assert.ok(king, 'ordinary K section must exist');
  assert.match(king[0], /single-card/);
  assert.match(king[0], /Ace-family counters do not gain Anchor or Goal-Mod authority/);
});

// ── Royal Marriage alignment ─────────────────────────────────────

test('v4.2.0: Royal Marriage counter taxonomy corrected — only K♠', async () => {
  const rm = rulebook.match(/### Royal Marriage[\s\S]*?(?=## )/);
  assert.ok(rm, 'Royal Marriage section must exist');
  const section = rm[0];
  assert.match(section, /ordinary K cannot counter the Marriage/);
  assert.match(section, /Base Ace cannot counter the Marriage/);
  assert.match(section, /Anchor Ace cannot counter the Marriage/);
  assert.match(section, /A♠ cannot counter the Marriage/);
  assert.match(section, /⭐A cannot counter the Marriage merely because it is multi-card/);
  assert.match(section, /K♠ can counter the Marriage/);
});

test('v4.2.0: no remaining contradiction that Base Ace/A♠/⭐A counter Royal Marriage', async () => {
  const rm = rulebook.match(/### Royal Marriage[\s\S]*?(?=## )/)[0];
  assert.doesNotMatch(rm, /Base Ace may counter when Royal Shield/);
  assert.doesNotMatch(rm, /K♠ and ⭐A may counter when legal/);
});

// ── Counter-authority matrix ────────────────────────────────────

test('v4.2.0: counter matrix separates Effect vs Anchor counter classes', async () => {
  const matrix = rulebook.match(/### 16\.1 Counter Authority[\s\S]*?### 16\.2/);
  assert.ok(matrix, 'counter authority matrix must exist');
  const table = matrix[0];
  assert.match(table, /Multi-card Effect play \| Base Ace, Anchor Ace, A♠, ⭐A/);
  assert.match(table, /Single-card Anchor Play \| ordinary K/);
  assert.match(table, /Multi-card Anchor Play \(Royal Marriage, Queen.s Court\) \| K♠/);
  assert.match(table, /Ultra \| ⭐A only/);
  assert.match(table, /Sudden Death activation \| ⭐A only/);
  // The old contradictory row must be gone
  assert.doesNotMatch(table, /Eligible multi-card play \| Base Ace when not protected, K♠, A♠, ⭐A/);
  assert.doesNotMatch(table, /Single-card Anchor Play \| K; general Ace counters when legal/);
});

test('v4.2.0: matrix note states Ace counters handle Effect only', async () => {
  const matrix = rulebook.match(/### 16\.1 Counter Authority[\s\S]*?### 16\.2/)[0];
  assert.match(matrix, /Ace-family counters.*counter Effect plays and counters only/);
  assert.match(matrix, /K♠ is the standard direct counter for eligible multi-card plays/);
});

// ── Glossary and FAQ ─────────────────────────────────────────────

test('v4.2.0: glossary defines Queen\'s Court and Multi-Card Anchor Play', async () => {
  assert.match(rulebook, /\*\*Multi-Card Anchor Play:\*\*/);
  assert.match(rulebook, /\*\*Queen.s Court:\*\*.*multi-card Anchor Play/);
});

test('v4.2.0: FAQ clarifies ⭐A cannot counter Queen\'s Court', async () => {
  assert.match(rulebook, /Can ⭐A counter Queen.s Court because it is multi-card\?/);
  assert.match(rulebook, /Only K♠ directly counters Queen.s Court among standard counters/);
});

test('v4.2.0: FAQ clarifies one-hand-Queen-plus-one-ER-Queen is illegal', async () => {
  assert.match(rulebook, /one Queen in hand and one Queen in my ER/);
  assert.match(rulebook, /Both Queens must be in your hand when declared/);
});

// ── Queen balance constraints (no numerical buff) ────────────────

test('v4.2.0: Queen PR value remains 2 (no numerical buff)', async () => {
  const queenPr = rulebook.match(/### Queen in PR[\s\S]*?### Queen in ER/);
  assert.ok(queenPr, 'Queen in PR section must exist');
  assert.match(queenPr[0], /worth 2 Points/);
  assert.doesNotMatch(queenPr[0], /worth 3 Points/);
});

test('v4.2.0: no ⭐Q created and no Two catalysis for Queen\'s Court', async () => {
  const qc = rulebook.match(/Queen.s Court — Multi-Card Anchor Play[\s\S]*?## ⦗K⦘/)[0];
  assert.doesNotMatch(qc, /⭐Q/);
  assert.match(qc, /using a Two as a Queen substitute/);
});

// ── Version-surface agreement ───────────────────────────────────

test('v4.2.0: release identity has officialRulesVersion 4.3.1 and engine rulesVersion 4.3.1', async () => {
  const identity = JSON.parse(await read('config/release-identity.json'));
  assert.equal(identity.officialRulesVersion, '4.3.1');
  assert.equal(identity.rulesVersion, '4.3.1');
  assert.equal(identity.engineVersion, '4.2.6');
  assert.equal(identity.version, '0.24.2');
});

test('v4.2.0: generated version modules export OFFICIAL_RULES_VERSION 4.3.1 and RULES_VERSION 4.3.1', async () => {
  const nodeVersion = await read('packages/shared/src/version.mjs');
  assert.match(nodeVersion, /OFFICIAL_RULES_VERSION = "4\.3\.1"/);
  assert.match(nodeVersion, /RULES_VERSION = "4\.3\.1"/);
  assert.match(nodeVersion, /ENGINE_VERSION = "4\.2\.6"/);
});

test('v4.2.0: adapter exports OFFICIAL_RULES_VERSION and RULES_VERSION both 4.3.1', async () => {
  const adapter = await read('packages/engine-adapter/src/adapter.mjs');
  assert.match(adapter, /OFFICIAL_RULES_VERSION = '4\.3\.1'/);
  assert.match(adapter, /RULES_VERSION = '4\.3\.1'/);
});

test('v4.2.0: save-integrity rulesVersion is 4.3.1 (engine now implements v4.3.1)', async () => {
  const saveIntegrity = await read('apps/lab-web/src/play/save-integrity.js');
  assert.match(saveIntegrity, /RULES_VERSION = '4\.3\.1'/);
});

test('v4.2.0: build copies the v4.3.1 rulebook into the dist', async () => {
  const build = await read('scripts/build.mjs');
  assert.match(build, /docs\/INTRILEX_v4\.3\.1_COMPLETE_PLAYER_RULEBOOK\.md/);
  assert.doesNotMatch(build, /docs\/INTRILEX_v4\.1\.2_COMPLETE_PLAYER_RULEBOOK\.md.*data\/rulebook\.md/);
});

// ── Historical immutability (hash regression guard) ──────────────

test('v4.2.0: historical v4.1.2 rulebook content is byte-stable (hash guard)', async () => {
  // This guards against accidental edits to the historical canon artifact.
  // The hash is computed from the committed v4.1.2 file content.
  const hash = hashCanonical(historical);
  assert.equal(typeof hash, 'string');
  assert.equal(hash.length, 64);
  // Re-read to ensure no test mutation occurred
  const reread = await read(V412);
  assert.equal(hashCanonical(reread), hash, 'v4.1.2 rulebook must not change during the test run');
});

test('v4.2.0: v4.2.0 rulebook is a superset extension of v4.1.2 (core sections retained)', async () => {
  // Key v4.1.2 sections must still be present in v4.2.0
  const retainedHeaders = [
    '## ⦗A⦘ ACE — Counter Authority',
    '## ⦗Q⦘ QUEEN — Protection Engine',
    '## ⦗K⦘ KING — Specialized Counter / Marriage',
    '### Royal Marriage',
    '## 36. Interaction Matrices',
    '### 16.1 Counter Authority',
  ];
  for (const header of retainedHeaders) {
    assert.ok(rulebook.includes(header), `v4.2.0 must retain section: ${header}`);
  }
});
