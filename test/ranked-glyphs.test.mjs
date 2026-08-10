// ═══════════════════════════════════════════════════════════════
// ranked-glyphs.test.mjs — Canonical Ranked glyph integration tests.
//
// Proves:
//   - Domain: RankTier/Division ladder, ratingToTierDivision, placement,
//     apex (Intrilex has no division), tier ordering.
//   - Registry: exactly 8 canonical glyph mappings, no missing tier, no
//     duplicate image, no upper-ladder swap (Paragon/Sovereign/Intrilex).
//   - File existence: all 8 production derivative paths exist (256/128/64)
//     and the 1024 masters are intact.
//   - Presentation: rankLabel, resolveGlyphPath, renderRankGlyph render the
//     expected tier → expected image; Unranked never uses an earned glyph.
//   - UI: lobby versus card, terminal rank result block, and source-text
//     wiring for profile + player plate.
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RankTier, Division, RANK_LADDER, DIVISION_LADDER,
  PLACEMENTS_REQUIRED, ratingToTierDivision, tierOrdinal, divisionOrdinal,
  isApexTier, tierHasDivisions, compareRank,
} from '../packages/account-domain/src/rank-tier.mjs';

import {
  RANK_TIER_PRESENTATION, RANKED_GLYPH_BASE, RANKED_GLYPH_SIZES,
  resolveGlyphPath, rankLabel, hasGlyph,
} from '../apps/lab-web/src/play/rank/rank-presentation.mjs';

import { renderRankGlyph, renderRankChip } from '../apps/lab-web/src/play/rank/rank-glyph.js';

import { renderNetworkCreateWaiting } from '../apps/lab-web/src/play/network/network-lobby-renderer.mjs';
import { renderTerminal } from '../apps/lab-web/src/play/ranked-duel-terminal.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const glyphsDir = path.join(root, 'apps/lab-web/src/assets/ranked/glyphs');
const mastersDir = path.join(root, 'ranked-glyphs');

const EARNED_TIERS = RANK_LADDER.slice(); // 8 earned tiers, ordered

// ── Section 1: Domain — ladder, placement, apex, ordering ──

test('rank-domain: RANK_LADDER has exactly 8 earned tiers in canonical order', () => {
  assert.equal(RANK_LADDER.length, 8);
  assert.deepEqual([...RANK_LADDER], [
    RankTier.INITIATE, RankTier.CIPHER, RankTier.WARDEN, RankTier.VANGUARD,
    RankTier.ASCENDANT, RankTier.PARAGON, RankTier.SOVEREIGN, RankTier.INTRILEX,
  ]);
});

test('rank-domain: tierOrdinal is monotonic and UNRANKED is -1', () => {
  assert.equal(tierOrdinal(RankTier.UNRANKED), -1);
  let prev = -1;
  for (const t of RANK_LADDER) {
    const o = tierOrdinal(t);
    assert.ok(o > prev, `${t} ordinal ${o} must exceed prev ${prev}`);
    prev = o;
  }
  assert.equal(tierOrdinal(RankTier.INITIATE), 0);
  assert.equal(tierOrdinal(RankTier.INTRILEX), 7);
});

test('rank-domain: placement period yields UNRANKED until PLACEMENTS_REQUIRED matches', () => {
  const a = ratingToTierDivision(2000, { ratedMatches: 0 });
  assert.equal(a.tier, RankTier.UNRANKED);
  assert.equal(a.division, Division.NONE);
  assert.equal(a.isPlacement, true);
  assert.equal(a.placementsRequired, PLACEMENTS_REQUIRED);
  assert.equal(a.placementsPlayed, 0);

  const b = ratingToTierDivision(2000, { ratedMatches: PLACEMENTS_REQUIRED - 1 });
  assert.equal(b.isPlacement, true);
  assert.equal(b.tier, RankTier.UNRANKED);

  const c = ratingToTierDivision(2000, { ratedMatches: PLACEMENTS_REQUIRED });
  assert.equal(c.isPlacement, false);
  assert.notEqual(c.tier, RankTier.UNRANKED);
});

test('rank-domain: rating maps to expected tiers across the ladder', () => {
  const cases = [
    [0, RankTier.INITIATE], [1199, RankTier.INITIATE],
    [1200, RankTier.CIPHER], [1399, RankTier.CIPHER],
    [1400, RankTier.WARDEN], [1599, RankTier.WARDEN],
    [1600, RankTier.VANGUARD], [1799, RankTier.VANGUARD],
    [1800, RankTier.ASCENDANT], [1999, RankTier.ASCENDANT],
    [2000, RankTier.PARAGON], [2199, RankTier.PARAGON],
    [2200, RankTier.SOVEREIGN], [2399, RankTier.SOVEREIGN],
    [2400, RankTier.INTRILEX], [5000, RankTier.INTRILEX],
  ];
  for (const [rating, expectedTier] of cases) {
    const a = ratingToTierDivision(rating, { ratedMatches: 10 });
    assert.equal(a.tier, expectedTier, `rating ${rating} → ${expectedTier}`);
  }
});

test('rank-domain: INTRILEX is apex with NO division; other earned tiers have divisions', () => {
  assert.ok(isApexTier(RankTier.INTRILEX));
  assert.ok(!tierHasDivisions(RankTier.INTRILEX));
  const apex = ratingToTierDivision(2500, { ratedMatches: 10 });
  assert.equal(apex.tier, RankTier.INTRILEX);
  assert.equal(apex.division, Division.NONE);
  assert.equal(apex.isApex, true);

  for (const t of RANK_LADDER) {
    if (t === RankTier.INTRILEX) continue;
    assert.ok(tierHasDivisions(t), `${t} must support divisions`);
  }
});

test('rank-domain: divisions III/II/I progress within a tier', () => {
  assert.deepEqual([...DIVISION_LADDER], [Division.III, Division.II, Division.I]);
  const iii = ratingToTierDivision(1600, { ratedMatches: 10 }); // Vanguard III (1600-1667)
  const ii = ratingToTierDivision(1670, { ratedMatches: 10 });  // Vanguard II (1667-1733)
  const i = ratingToTierDivision(1740, { ratedMatches: 10 });   // Vanguard I (1733-1800)
  assert.equal(iii.tier, RankTier.VANGUARD); assert.equal(iii.division, Division.III);
  assert.equal(ii.tier, RankTier.VANGUARD);  assert.equal(ii.division, Division.II);
  assert.equal(i.tier, RankTier.VANGUARD);   assert.equal(i.division, Division.I);
  assert.ok(divisionOrdinal(Division.III) < divisionOrdinal(Division.II));
  assert.ok(divisionOrdinal(Division.II) < divisionOrdinal(Division.I));
});

test('rank-domain: compareRank orders by tier then division', () => {
  const low = ratingToTierDivision(1600, { ratedMatches: 10 });  // Vanguard III
  const high = ratingToTierDivision(1800, { ratedMatches: 10 }); // Ascendant III
  assert.ok(compareRank(low, high) < 0);
  assert.ok(compareRank(high, low) > 0);
  const vI = ratingToTierDivision(1740, { ratedMatches: 10 });
  assert.ok(compareRank(low, vI) < 0); // same tier, III < I
});

// ── Section 2: Registry — canonical mapping integrity ──

test('registry: exactly 8 canonical glyph mappings (earned tiers)', () => {
  const earned = EARNED_TIERS.map(t => RANK_TIER_PRESENTATION[t]).filter(Boolean);
  assert.equal(earned.length, 8, '8 earned tiers must have presentation entries');
  for (const t of EARNED_TIERS) {
    assert.ok(RANK_TIER_PRESENTATION[t], `${t} must be in registry`);
    assert.ok(hasGlyph(t), `${t} must have a glyph`);
  }
});

test('registry: UNRANKED has no earned glyph', () => {
  const pres = RANK_TIER_PRESENTATION[RankTier.UNRANKED];
  assert.ok(pres, 'UNRANKED must have a presentation entry');
  assert.equal(pres.glyphFile, null, 'UNRANKED must not reference an earned glyph file');
  assert.equal(hasGlyph(RankTier.UNRANKED), false);
});

test('registry: no missing tier, no duplicate image filenames', () => {
  const files = EARNED_TIERS.map(t => RANK_TIER_PRESENTATION[t].glyphFile);
  const uniq = new Set(files);
  assert.equal(files.length, 8);
  assert.equal(uniq.size, 8, 'all 8 glyph filenames must be distinct');
});

test('registry: canonical tier → filename mapping (no upper-ladder swap)', () => {
  const expected = {
    INITIATE: 'initiate.png',
    CIPHER: 'cipher.png',
    WARDEN: 'warden.png',
    VANGUARD: 'vanguard.png',
    ASCENDANT: 'ascendant.png',
    PARAGON: 'paragon.png',
    SOVEREIGN: 'sovereign.png',
    INTRILEX: 'intrilex.png',
  };
  for (const [tier, file] of Object.entries(expected)) {
    assert.equal(RANK_TIER_PRESENTATION[tier].glyphFile, file, `${tier} → ${file}`);
  }
  // Critical upper-ladder anti-swap assertions (section 20).
  assert.equal(RANK_TIER_PRESENTATION[RankTier.PARAGON].glyphFile, 'paragon.png');
  assert.equal(RANK_TIER_PRESENTATION[RankTier.SOVEREIGN].glyphFile, 'sovereign.png');
  assert.equal(RANK_TIER_PRESENTATION[RankTier.INTRILEX].glyphFile, 'intrilex.png');
  assert.notEqual(RANK_TIER_PRESENTATION[RankTier.PARAGON].glyphFile, RANK_TIER_PRESENTATION[RankTier.SOVEREIGN].glyphFile);
  assert.notEqual(RANK_TIER_PRESENTATION[RankTier.SOVEREIGN].glyphFile, RANK_TIER_PRESENTATION[RankTier.INTRILEX].glyphFile);
});

test('registry: labels are canonical title-case', () => {
  const expected = {
    INITIATE: 'Initiate', CIPHER: 'Cipher', WARDEN: 'Warden', VANGUARD: 'Vanguard',
    ASCENDANT: 'Ascendant', PARAGON: 'Paragon', SOVEREIGN: 'Sovereign', INTRILEX: 'Intrilex',
  };
  for (const [tier, label] of Object.entries(expected)) {
    assert.equal(RANK_TIER_PRESENTATION[tier].label, label);
  }
});

// ── Section 3: File existence — production paths + masters ──

test('file-existence: all 8 masters (1024 RGBA) exist in ranked-glyphs/', async () => {
  for (const t of EARNED_TIERS) {
    const file = RANK_TIER_PRESENTATION[t].glyphFile;
    const p = path.join(mastersDir, file);
    assert.ok(existsSync(p), `master missing: ranked-glyphs/${file}`);
    const buf = await readFile(p);
    // PNG signature check
    assert.ok(buf[0] === 0x89 && buf[1] === 0x50, `${file} is not a PNG`);
    assert.ok(buf.length > 100_000, `${file} master unexpectedly small`);
  }
});

test('file-existence: all 8 production derivatives exist for every size', () => {
  for (const size of RANKED_GLYPH_SIZES) {
    for (const t of EARNED_TIERS) {
      const file = RANK_TIER_PRESENTATION[t].glyphFile;
      const p = path.join(glyphsDir, String(size), file);
      assert.ok(existsSync(p), `derivative missing: ${size}/${file}`);
    }
  }
});

test('file-existence: glyph manifest exists and lists 8 tiers × 3 sizes', async () => {
  const manifestPath = path.join(glyphsDir, 'manifest.json');
  assert.ok(existsSync(manifestPath), 'manifest.json must exist');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.tierCount, 8);
  assert.equal(manifest.derivativeSizes.length, 3);
  assert.equal(manifest.entries.length, 24);
});

// ── Section 4: Presentation — path resolution + labels ──

test('presentation: resolveGlyphPath returns size-appropriate path', () => {
  assert.equal(resolveGlyphPath(RankTier.VANGUARD, 256), `${RANKED_GLYPH_BASE}/256/vanguard.png`);
  assert.equal(resolveGlyphPath(RankTier.VANGUARD, 128), `${RANKED_GLYPH_BASE}/128/vanguard.png`);
  assert.equal(resolveGlyphPath(RankTier.VANGUARD, 64), `${RANKED_GLYPH_BASE}/64/vanguard.png`);
  // Sub-64 sizes clamp to the smallest derivative (64).
  assert.equal(resolveGlyphPath(RankTier.VANGUARD, 32), `${RANKED_GLYPH_BASE}/64/vanguard.png`);
  // >256 clamps to 256 (largest derivative).
  assert.equal(resolveGlyphPath(RankTier.INTRILEX, 1024), `${RANKED_GLYPH_BASE}/256/intrilex.png`);
});

test('presentation: resolveGlyphPath returns null for UNRANKED', () => {
  assert.equal(resolveGlyphPath(RankTier.UNRANKED, 128), null);
});

test('presentation: rankLabel formats tier + division, apex and unranked have no division', () => {
  assert.equal(rankLabel(RankTier.VANGUARD, Division.II), 'Vanguard II');
  assert.equal(rankLabel(RankTier.VANGUARD, Division.III), 'Vanguard III');
  assert.equal(rankLabel(RankTier.INTRILEX, Division.NONE), 'Intrilex');
  assert.equal(rankLabel(RankTier.INTRILEX), 'Intrilex');
  assert.equal(rankLabel(RankTier.UNRANKED), 'Unranked');
  assert.equal(rankLabel(RankTier.VANGUARD), 'Vanguard'); // division omitted
});

// ── Section 5: Glyph component — rendering + accessibility ──

test('glyph-component: renderRankGlyph emits expected image path for each tier', () => {
  for (const t of EARNED_TIERS) {
    const html = renderRankGlyph({ tier: t, division: Division.III, size: 128, showDivision: true });
    const file = RANK_TIER_PRESENTATION[t].glyphFile;
    assert.ok(html.includes(`/128/${file}`), `${t} must reference /128/${file}`);
    assert.ok(html.includes('class="rank-glyph'), 'must have rank-glyph class');
    assert.ok(html.includes(`data-tier="${t}"`), 'must carry data-tier');
  }
});

test('glyph-component: renderRankGlyph uses 64 derivative for small sizes', () => {
  const html = renderRankGlyph({ tier: RankTier.VANGUARD, size: 32, decorative: true });
  assert.ok(html.includes('/64/vanguard.png'), '32px must use 64 derivative');
  assert.ok(html.includes('loading="lazy"'), 'small sizes must lazy-load');
});

test('glyph-component: large sizes eager-load', () => {
  const html = renderRankGlyph({ tier: RankTier.VANGUARD, size: 128 });
  assert.ok(html.includes('loading="eager"'), '>=128px must eager-load');
});

test('glyph-component: decorative → alt="" + aria-hidden; non-decorative → alt text', () => {
  const dec = renderRankGlyph({ tier: RankTier.VANGUARD, division: Division.II, size: 64, decorative: true });
  assert.ok(dec.includes('alt=""'), 'decorative must have empty alt');
  assert.ok(dec.includes('aria-hidden="true"'), 'decorative must be aria-hidden');

  const labeled = renderRankGlyph({ tier: RankTier.VANGUARD, division: Division.II, size: 64, decorative: false });
  assert.ok(labeled.includes('alt="Vanguard II rank"'), 'non-decorative must have alt text');
  assert.ok(!labeled.includes('aria-hidden="true"'), 'labeled image must not be aria-hidden');
});

test('glyph-component: UNRANKED renders neutral placeholder, never an earned glyph', () => {
  const html = renderRankGlyph({ tier: RankTier.UNRANKED, size: 64 });
  assert.ok(html.includes('rank-glyph-unranked'), 'must have unranked class');
  assert.ok(html.includes('rank-glyph-placeholder'), 'must have placeholder element');
  assert.ok(!html.includes('initiate.png'), 'must NOT use Initiate glyph');
  assert.ok(!/<img/.test(html), 'must not render an <img> for unranked');
});

test('glyph-component: INTRILEX apex gets apex class and no division ornament', () => {
  const html = renderRankGlyph({ tier: RankTier.INTRILEX, size: 128, showDivision: true, division: Division.I });
  assert.ok(html.includes('rank-glyph-apex'), 'apex must have apex class');
  assert.ok(!html.includes('division-i'), 'apex must not show division ornament');
});

test('glyph-component: division ornamentation classes applied only when showDivision and tier supports it', () => {
  const withDiv = renderRankGlyph({ tier: RankTier.VANGUARD, division: Division.II, size: 64, showDivision: true });
  assert.ok(withDiv.includes('division-ii'), 'must have division-ii class');

  const noDiv = renderRankGlyph({ tier: RankTier.VANGUARD, division: Division.II, size: 64, showDivision: false });
  assert.ok(!noDiv.includes('division-ii'), 'must not have division class when showDivision=false');
});

test('glyph-component: renderRankChip emits glyph + label + IR', () => {
  const html = renderRankChip({ tier: RankTier.VANGUARD, division: Division.II, rating: 1674, size: 32 });
  assert.ok(html.includes('rank-chip'), 'must have rank-chip class');
  assert.ok(html.includes('Vanguard II'), 'must show tier label');
  assert.ok(html.includes('1674 IR'), 'must show IR');
  assert.ok(html.includes('/64/vanguard.png'), 'must include glyph');
});

// ── Section 6: UI integration — lobby versus, terminal result ──

test('ui: lobby create waiting room renders versus card with local glyph', () => {
  const session = { inviteCode: 'ABC123', matchId: 'M-test', opponentConnectionState: 'WAITING', status: 'WAITING' };
  const html = renderNetworkCreateWaiting(session, {});
  assert.ok(html.includes('data-testid="network-versus"'), 'must render versus card');
  assert.ok(html.includes('versus-glyph'), 'versus card must contain a glyph');
  assert.ok(html.includes('VS'), 'must show VS separator');
});

test('ui: terminal renders rank result block (fallback current rank)', () => {
  const vm = {
    match: { winner: 'P1', terminationReason: 'CANONICAL_GOAL', fullTurnSequence: 12 },
    human: { playerId: 'P1' },
    opponent: { archetype: 'rusher' },
  };
  const html = renderTerminal(vm, {});
  assert.ok(html.includes('data-testid="rank-result-block"'), 'terminal must render rank result block');
  assert.ok(html.includes('rank-glyph'), 'rank result block must contain a glyph');
});

test('ui: terminal rank result block shows promotion swap when rankResult supplied', () => {
  const vm = {
    match: { winner: 'P1', terminationReason: 'CANONICAL_GOAL', fullTurnSequence: 12 },
    human: { playerId: 'P1' },
    opponent: { archetype: 'rusher' },
  };
  // 1799 → 1801: Vanguard I → Ascendant III (promotion)
  const html = renderTerminal(vm, { rankResult: { ratingBefore: 1799, ratingAfter: 1801, ratedMatchesBefore: 11 } });
  assert.ok(html.includes('data-testid="rank-result-banner"'), 'must show rank banner');
  assert.ok(html.includes('RANK UP'), 'must show RANK UP banner');
  assert.ok(html.includes('rank-result-arrow'), 'must show promotion arrow');
  assert.ok(html.includes('1799 → 1801 IR'), 'must show rating delta line');
});

// ── Section 6b: Regression tests for bug fixes ──

test('regression: terminal uses ratedMatchesBefore+1 for after state (placement exit)', () => {
  // Player's 5th rated match: ratedMatchesBefore=4 (before), after should be 5 (placed).
  // 4 matches → UNRANKED (placement); 5 matches → INITIATE (placed).
  // If the bug used ratedMatchesBefore (4) for after, it would still show UNRANKED.
  const vm = {
    match: { winner: 'P1', terminationReason: 'CANONICAL_GOAL', fullTurnSequence: 12 },
    human: { playerId: 'P1' },
    opponent: { archetype: 'rusher' },
  };
  const html = renderTerminal(vm, { rankResult: { ratingBefore: 1100, ratingAfter: 1150, ratedMatchesBefore: 5 } });
  assert.ok(html.includes('data-testid="rank-result-block"'), 'must render rank result block');
  // After 5 matches, player should be INITIATE (not UNRANKED).
  assert.ok(html.includes('Initiate'), 'must show Initiate tier after placement exit');
  assert.ok(!html.includes('Placements'), 'must not show placement text after placement exit');
});

test('regression: terminal detects division-only change as rank up/down', () => {
  // 1660 → 1680: Vanguard III → Vanguard II (same tier, division up).
  // Old code only checked tierOrdinal (equal) → no banner. Fix uses compareRank.
  const vm = {
    match: { winner: 'P1', terminationReason: 'CANONICAL_GOAL', fullTurnSequence: 12 },
    human: { playerId: 'P1' },
    opponent: { archetype: 'rusher' },
  };
  const html = renderTerminal(vm, { rankResult: { ratingBefore: 1660, ratingAfter: 1680, ratedMatchesBefore: 10 } });
  assert.ok(html.includes('data-testid="rank-result-banner"'), 'must show rank banner for division up');
  assert.ok(html.includes('RANK UP'), 'must show RANK UP for division promotion');
  assert.ok(html.includes('rank-result-arrow'), 'must show arrow for division change');
});

test('regression: terminal handles missing ratingBefore/ratingAfter gracefully', () => {
  const vm = {
    match: { winner: 'P1', terminationReason: 'CANONICAL_GOAL', fullTurnSequence: 12 },
    human: { playerId: 'P1' },
    opponent: { archetype: 'rusher' },
  };
  const html = renderTerminal(vm, { rankResult: { ratedMatchesBefore: 10 } });
  assert.ok(html.includes('— → — IR'), 'must show em-dash for missing ratings');
  assert.ok(!html.includes('undefined'), 'must not render undefined');
});

test('regression: glyph component emits data-size attribute', () => {
  const html = renderRankGlyph({ tier: RankTier.VANGUARD, size: 32, decorative: true });
  assert.ok(html.includes('data-size="32"'), 'must carry data-size for CSS safeguards');
});

// ── Section 7: Source-text wiring — profile + player plate ──

test('wiring: profile workspace imports and renders rank glyph', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/workspaces/profile.js'), 'utf8');
  assert.ok(src.includes('renderRankGlyph'), 'profile must call renderRankGlyph');
  assert.ok(src.includes('ratingToTierDivision'), 'profile must use ratingToTierDivision');
  assert.ok(src.includes('rankLabel'), 'profile must use rankLabel');
  assert.ok(src.includes('profile-ranked-hero'), 'profile must render a rank hero section');
});

test('wiring: ranked-duel-renderer imports rank glyph for player plate', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/play/ranked-duel-renderer.mjs'), 'utf8');
  assert.ok(src.includes('renderRankGlyph'), 'renderer must import renderRankGlyph');
  assert.ok(src.includes('rd-plate-glyph'), 'player plate must include a rank glyph');
  assert.ok(src.includes('ratingToTierDivision'), 'renderer must resolve tier from rating');
});

test('wiring: styles.css imports rank-glyph.css', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/styles.css'), 'utf8');
  assert.ok(src.includes('rank-glyph.css'), 'styles.css must import rank-glyph.css');
});

test('wiring: service worker caches .png assets', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/sw.js'), 'utf8');
  assert.ok(src.includes(".png'"), 'sw.js must cache .png assets');
});

test('wiring: build.mjs runs build-ranked-glyphs.mjs', async () => {
  const src = await readFile(path.join(root, 'scripts/build.mjs'), 'utf8');
  assert.ok(src.includes('build-ranked-glyphs.mjs'), 'build.mjs must invoke the glyph build');
});
