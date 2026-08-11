// ═══════════════════════════════════════════════════════════════
// ranking-system-overlay.test.mjs — Ranking System explainer tests.
//
// Verifies:
//   - Source-of-truth: the overlay uses canonical rank data (RANK_LADDER,
//     TIER_THRESHOLDS, presentation registry) and the real Glicko-2
//     rating engine — no fabricated thresholds/names/deltas.
//   - rank-tier.mjs new exports (TIER_THRESHOLDS, tierBounds,
//     progressInTier) are correct and consistent with ratingToTierDivision.
//   - Rating demos are computed from the actual engine and show the
//     correct directional opponent-strength behavior.
//   - Player-rank card renders truthful states (ranked, placement, apex,
//     guest/unavailable) without fabricating data.
//   - Rank ladder renders all 8 earned tiers in canonical order with
//     canonical glyph image paths.
//   - Homepage integration: app.js has the Ranking System button, the
//     overlay opener, and the CSS import is registered.
//   - The overlay never claims the system is Elo (Glicko-2 is canonical).
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RankTier, Division, RANK_LADDER, PLACEMENTS_REQUIRED,
  TIER_THRESHOLDS, tierBounds, tierOrdinal, isApexTier, tierHasDivisions,
  ratingToTierDivision, progressInTier,
} from '../packages/account-domain/src/rank-tier.mjs';
import {
  DEFAULT_RATING, PROVISIONAL_THRESHOLD, computeRatingUpdate, initialRatingState,
} from '../packages/account-domain/src/rating.mjs';
import {
  GLICKO2_TAU, DEFAULT_RATING_DEVIATION, DEFAULT_VOLATILITY,
} from '../packages/account-domain/src/glicko2.mjs';
import {
  RANK_TIER_PRESENTATION, RANKED_GLYPH_BASE, resolveGlyphPath, rankLabel,
} from '../apps/lab-web/src/play/rank/rank-presentation.mjs';
import {
  computeRatingDemos, renderRankLadder, renderRungDetail,
  renderPlayerRankCard, renderHowRatingWorks, renderAdvancedDetails,
  unavailableState,
} from '../apps/lab-web/src/play/rank/ranking-system-overlay.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = (rel) => readFile(path.join(root, 'apps/lab-web/src', rel), 'utf8');

// ═══════════════════════════════════════════════════════════════
// Section 1 — rank-tier.mjs new exports (single source of truth)
// ═══════════════════════════════════════════════════════════════

test('rank-tier: TIER_THRESHOLDS is exported with all 8 earned tiers', () => {
  assert.equal(Object.keys(TIER_THRESHOLDS).length, 8);
  for (const tier of RANK_LADDER) {
    assert.ok(TIER_THRESHOLDS[tier], `${tier} must have thresholds`);
  }
});

test('rank-tier: TIER_THRESHOLDS matches canonical ladder boundaries', () => {
  assert.deepEqual(TIER_THRESHOLDS[RankTier.INITIATE], [0, 1200]);
  assert.deepEqual(TIER_THRESHOLDS[RankTier.CIPHER], [1200, 1400]);
  assert.deepEqual(TIER_THRESHOLDS[RankTier.WARDEN], [1400, 1600]);
  assert.deepEqual(TIER_THRESHOLDS[RankTier.VANGUARD], [1600, 1800]);
  assert.deepEqual(TIER_THRESHOLDS[RankTier.ASCENDANT], [1800, 2000]);
  assert.deepEqual(TIER_THRESHOLDS[RankTier.PARAGON], [2000, 2200]);
  assert.deepEqual(TIER_THRESHOLDS[RankTier.SOVEREIGN], [2200, 2400]);
  assert.deepEqual(TIER_THRESHOLDS[RankTier.INTRILEX], [2400, Infinity]);
});

test('rank-tier: tierBounds returns [min,max] for earned tiers, null for UNRANKED', () => {
  assert.deepEqual(tierBounds(RankTier.WARDEN), [1400, 1600]);
  assert.deepEqual(tierBounds(RankTier.INTRILEX), [2400, Infinity]);
  assert.equal(tierBounds(RankTier.UNRANKED), null);
});

test('rank-tier: progressInTier computes correct percent and remaining', () => {
  // 1450 IR, past placement → Warden III, 50/200 = 25%
  const p = progressInTier(1450, 10);
  assert.equal(p.isPlacement, false);
  assert.equal(p.tier, RankTier.WARDEN);
  assert.equal(p.division, Division.III);
  assert.equal(p.tierMin, 1400);
  assert.equal(p.tierMax, 1600);
  assert.equal(p.span, 200);
  assert.equal(p.intoTier, 50);
  assert.equal(p.remaining, 150);
  assert.equal(p.percent, 25);
  assert.equal(p.nextTier, RankTier.VANGUARD);
});

test('rank-tier: progressInTier near tier boundary reports ~99% and 1 remaining', () => {
  const p = progressInTier(2399, 10);
  assert.equal(p.tier, RankTier.SOVEREIGN);
  assert.equal(p.division, Division.I);
  assert.equal(p.remaining, 1);
  assert.ok(p.percent >= 99 && p.percent <= 100);
  assert.equal(p.nextTier, RankTier.INTRILEX);
});

test('rank-tier: progressInTier apex has percent 0 and no next tier', () => {
  const p = progressInTier(2500, 10);
  assert.equal(p.isApex, true);
  assert.equal(p.tier, RankTier.INTRILEX);
  assert.equal(p.percent, 0);
  assert.equal(p.nextTier, null);
  assert.equal(p.tierMax, Infinity);
  assert.equal(p.span, Infinity);
});

test('rank-tier: progressInTier placement has percent 0 and INITIATE as next', () => {
  const p = progressInTier(2000, 3);
  assert.equal(p.isPlacement, true);
  assert.equal(p.tier, RankTier.UNRANKED);
  assert.equal(p.percent, 0);
  assert.equal(p.nextTier, RankTier.INITIATE);
});

test('rank-tier: progressInTier is consistent with ratingToTierDivision', () => {
  for (const rating of [0, 600, 1199, 1200, 1399, 1400, 1599, 1600, 1799, 1800, 1999, 2000, 2199, 2200, 2399, 2400, 3000]) {
    const assign = ratingToTierDivision(rating, { ratedMatches: 10 });
    const prog = progressInTier(rating, 10);
    assert.equal(prog.tier, assign.tier, `tier mismatch at ${rating}`);
    assert.equal(prog.division, assign.division, `division mismatch at ${rating}`);
    assert.equal(prog.isApex, assign.isApex, `apex mismatch at ${rating}`);
  }
});

// ═══════════════════════════════════════════════════════════════
// Section 2 — Rating demos use the REAL Glicko-2 engine
// ═══════════════════════════════════════════════════════════════

test('demos: computeRatingDemos returns 4 scenarios', () => {
  const demos = computeRatingDemos();
  assert.equal(demos.length, 4);
  assert.ok(demos.every(d => typeof d.delta === 'number' && Number.isFinite(d.delta)));
});

test('demos: beating stronger opponent yields bigger gain than beating weaker', () => {
  const demos = computeRatingDemos();
  const beatStronger = demos.find(d => d.label.includes('stronger') && d.outcome === 'WIN');
  const beatWeaker = demos.find(d => d.label.includes('weaker') && d.outcome === 'WIN');
  assert.ok(beatStronger && beatWeaker);
  assert.ok(beatStronger.delta > beatWeaker.delta,
    `beat stronger (${beatStronger.delta}) must exceed beat weaker (${beatWeaker.delta})`);
  assert.ok(beatStronger.delta > 0, 'winning must gain IR');
  assert.ok(beatWeaker.delta > 0, 'winning must gain IR');
});

test('demos: losing to weaker opponent yields bigger penalty than losing to stronger', () => {
  const demos = computeRatingDemos();
  const loseStronger = demos.find(d => d.label.includes('stronger') && d.outcome === 'LOSS');
  const loseWeaker = demos.find(d => d.label.includes('weaker') && d.outcome === 'LOSS');
  assert.ok(loseStronger && loseWeaker);
  assert.ok(loseStronger.delta < 0, 'losing must lose IR');
  assert.ok(loseWeaker.delta < 0, 'losing must lose IR');
  // Bigger penalty = more negative. Losing to weaker is a larger drop.
  assert.ok(loseWeaker.delta < loseStronger.delta,
    `lose weaker (${loseWeaker.delta}) must be more negative than lose stronger (${loseStronger.delta})`);
});

test('demos: deltas match the canonical computeRatingUpdate engine', () => {
  const demos = computeRatingDemos();
  const you = () => initialRatingState('you-demo');
  const opp = (rating) => ({ ...initialRatingState('opp-demo'), rating });
  const expected = (outcome, oppRating) => Math.round(computeRatingUpdate({
    playerA: you(), playerB: opp(oppRating), outcome,
  }).playerA.ratingDelta);
  const beatStronger = demos.find(d => d.label.includes('stronger') && d.outcome === 'WIN');
  const beatWeaker = demos.find(d => d.label.includes('weaker') && d.outcome === 'WIN');
  const loseStronger = demos.find(d => d.label.includes('stronger') && d.outcome === 'LOSS');
  const loseWeaker = demos.find(d => d.label.includes('weaker') && d.outcome === 'LOSS');
  assert.equal(beatStronger.delta, expected('WIN_A', 1400));
  assert.equal(beatWeaker.delta, expected('WIN_A', 1000));
  assert.equal(loseStronger.delta, expected('WIN_B', 1400));
  assert.equal(loseWeaker.delta, expected('WIN_B', 1000));
});

// ═══════════════════════════════════════════════════════════════
// Section 3 — Rank ladder renders canonical tiers + glyphs
// ═══════════════════════════════════════════════════════════════

test('ladder: renderRankLadder contains all 8 earned tiers in canonical order', () => {
  const html = renderRankLadder();
  for (const tier of RANK_LADDER) {
    assert.ok(html.includes(`data-rsx-tier="${tier}"`), `ladder must include ${tier}`);
  }
  // Verify order: the ordinal attributes ascend 0..7
  const ordinals = [...html.matchAll(/data-rsx-ordinal="(\d)"/g)].map(m => Number(m[1]));
  assert.deepEqual(ordinals, [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('ladder: each rung references its canonical glyph image path', () => {
  const html = renderRankLadder();
  for (const tier of RANK_LADDER) {
    const expectedPath = resolveGlyphPath(tier, 72);
    assert.ok(expectedPath, `${tier} must resolve a glyph path`);
    assert.ok(html.includes(expectedPath), `ladder must render glyph for ${tier} at ${expectedPath}`);
  }
});

test('ladder: UNRANKED is never shown as a rung (only earned tiers)', () => {
  const html = renderRankLadder();
  assert.ok(!html.includes(`data-rsx-tier="${RankTier.UNRANKED}"`), 'UNRANKED must not appear as a ladder rung');
});

test('ladder: rung detail renders the selected tier with its threshold range', () => {
  const html = renderRungDetail(RankTier.VANGUARD);
  assert.ok(html.includes('Vanguard'), 'detail must show tier label');
  assert.ok(html.includes('1,600'), 'detail must show tier min threshold');
  assert.ok(html.includes('1,800'), 'detail must show tier max threshold');
  // Next tier up
  assert.ok(html.includes('Ascendant'), 'detail must mention next tier (Ascendant)');
});

test('ladder: apex rung detail mentions leaderboard position and no divisions', () => {
  const html = renderRungDetail(RankTier.INTRILEX);
  assert.ok(html.includes('apex'), 'apex detail must mention apex');
  assert.ok(html.includes('leaderboard'), 'apex detail must mention leaderboard');
  assert.ok(html.includes('no divisions'), 'apex detail must state no divisions');
});

test('ladder: non-apex rung detail mentions III/II/I divisions', () => {
  const html = renderRungDetail(RankTier.CIPHER);
  assert.ok(html.includes('III'), 'non-apex detail must mention divisions');
  assert.ok(html.includes('II'));
  assert.ok(html.includes('I'));
});

// ═══════════════════════════════════════════════════════════════
// Section 4 — Player rank card states (truthful, no fabrication)
// ═══════════════════════════════════════════════════════════════

test('player-card: unavailable state has available=false and UNRANKED tier', () => {
  const s = unavailableState();
  assert.equal(s.available, false);
  assert.equal(s.tier, RankTier.UNRANKED);
  assert.equal(s.rating, DEFAULT_RATING);
});

test('player-card: guest/unavailable renders Unranked without a fake rating number', () => {
  const s = unavailableState();
  const html = renderPlayerRankCard(s);
  assert.ok(html.includes('rsx-player-guest'), 'must render guest card');
  assert.ok(html.includes('Unranked'), 'must say Unranked');
  // Must NOT show a fabricated IR number as the player's own
  assert.ok(!html.includes('rsx-player-ir'), 'guest card must not show a personal IR line');
});

test('player-card: placement state renders placement progress bar', () => {
  const s = {
    ...unavailableState(), available: true, isPlacement: true,
    rating: 1340, placementsPlayed: 2, placementsRequired: PLACEMENTS_REQUIRED,
  };
  const html = renderPlayerRankCard(s);
  assert.ok(html.includes('rsx-player-placement'), 'must render placement card');
  assert.ok(html.includes('Placement'), 'must say Placement');
  assert.ok(html.includes('2 / 5'), 'must show 2/5 placement progress');
  assert.ok(html.includes('role="progressbar"'), 'must have progressbar role');
});

test('player-card: ranked state renders tier, IR, and progress to next tier', () => {
  const s = {
    ...unavailableState(), available: true, isPlacement: false,
    tier: RankTier.WARDEN, division: Division.III, rating: 1450,
    ratedMatches: 20, peakRating: 1510, peakTier: RankTier.WARDEN, peakDivision: Division.II,
  };
  const html = renderPlayerRankCard(s);
  assert.ok(html.includes('rsx-player-ranked'), 'must render ranked card');
  assert.ok(html.includes('Warden III'), 'must show tier + division');
  assert.ok(html.includes('1,450 IR'), 'must show IR');
  assert.ok(html.includes('25%'), 'must show 25% progress');
  assert.ok(html.includes('150 IR to go'), 'must show remaining IR');
  assert.ok(html.includes('Vanguard III'), 'must mention next tier');
  assert.ok(html.includes('Season peak'), 'must show season peak');
});

test('player-card: apex state renders leaderboard position and apex tag', () => {
  const s = {
    ...unavailableState(), available: true, isPlacement: false, isApex: true,
    tier: RankTier.INTRILEX, division: Division.NONE, rating: 2680,
    leaderboardPosition: 47, ratedMatches: 120,
  };
  const html = renderPlayerRankCard(s);
  assert.ok(html.includes('rsx-player-apex'), 'must render apex card');
  assert.ok(html.includes('Intrilex #47'), 'must show apex + leaderboard position');
  assert.ok(html.includes('apex'), 'must include apex tag');
});

// ═══════════════════════════════════════════════════════════════
// Section 5 — Source-of-truth: Glicko-2, not Elo
// ═══════════════════════════════════════════════════════════════

test('sot: advanced details state Glicko-2 (not Elo) as the rating model', () => {
  const html = renderAdvancedDetails();
  assert.ok(html.includes('Glicko-2'), 'must name Glicko-2 as the model');
  assert.ok(html.includes('Glickman'), 'must attribute Glickman');
  // Must mention legacy Elo is NOT canonical
  assert.ok(/legacy Elo/i.test(html), 'must clarify legacy Elo is not canonical');
});

test('sot: advanced details expose verified constants from the engine', () => {
  const html = renderAdvancedDetails();
  // DEFAULT_RATING (1200) is rendered via fmtIr → "1,200" (locale-grouped)
  assert.ok(html.includes('1,200'), `must show default rating ${DEFAULT_RATING} (formatted)`);
  assert.ok(html.includes(String(GLICKO2_TAU)), `must show tau ${GLICKO2_TAU}`);
  assert.ok(html.includes(String(DEFAULT_RATING_DEVIATION)), `must show RD ${DEFAULT_RATING_DEVIATION}`);
  assert.ok(html.includes(String(DEFAULT_VOLATILITY)), `must show volatility ${DEFAULT_VOLATILITY}`);
  assert.ok(html.includes(String(PLACEMENTS_REQUIRED)), `must show placements ${PLACEMENTS_REQUIRED}`);
  assert.ok(html.includes(String(PROVISIONAL_THRESHOLD)), `must show provisional ${PROVISIONAL_THRESHOLD}`);
});

test('sot: how-rating-works section does not call the system Elo', () => {
  const html = renderHowRatingWorks();
  // The player-facing copy must not mislabel the system as Elo.
  assert.ok(!/\bElo\b/.test(html), 'how-rating-works must not call the system Elo');
});

test('sot: rank-tier.mjs comment no longer calls the rating Elo-based', async () => {
  const js = await readFile(path.join(root, 'packages/account-domain/src/rank-tier.mjs'), 'utf8');
  assert.ok(!/Elo-based/.test(js), 'rank-tier.mjs must not call the rating Elo-based (Glicko-2 is canonical)');
  assert.ok(/Glicko-2/.test(js), 'rank-tier.mjs comment should reference Glicko-2');
});

// ═══════════════════════════════════════════════════════════════
// Section 6 — Homepage integration
// ═══════════════════════════════════════════════════════════════

test('homepage: app.js imports renderRankingSystemOverlay', async () => {
  const js = await src('app.js');
  assert.ok(js.includes('renderRankingSystemOverlay'), 'app.js must import the overlay renderer');
  assert.ok(js.includes('ranking-system-overlay.js'), 'import must reference the overlay module');
});

test('homepage: app.js has a Ranking System rail card button', async () => {
  const js = await src('app.js');
  assert.ok(js.includes('data-ranking-system-card'), 'must have the ranking-system card button');
  assert.ok(js.includes('Ranking System'), 'button must be labelled Ranking System');
  assert.ok(js.includes('data-testid="ranking-system-button"'), 'button must have a test id');
});

test('homepage: app.js wires the card to openRankingSystemOverlay', async () => {
  const js = await src('app.js');
  assert.ok(js.includes('openRankingSystemOverlay'), 'must define the overlay opener');
  assert.ok(/data-ranking-system-card[\s\S]*openRankingSystemOverlay/.test(js),
    'card click must call openRankingSystemOverlay');
});

test('homepage: openRankingSystemOverlay uses openLandingOverlay', async () => {
  const js = await src('app.js');
  assert.ok(/openRankingSystemOverlay\(\)\s*{[\s\S]*openLandingOverlay\(['"]Ranking System/.test(js),
    'must open via openLandingOverlay with "Ranking System" title');
});

test('homepage: styles.css imports the overlay CSS', async () => {
  const css = await src('styles.css');
  assert.ok(css.includes('ranking-system-overlay.css'), 'styles.css must import the overlay CSS');
});

test('homepage: overlay CSS file exists and defines Intrilex-native styles', async () => {
  const css = await readFile(path.join(root, 'apps/lab-web/src/play/rank/ranking-system-overlay.css'), 'utf8');
  assert.ok(css.includes('.rsx-overlay'), 'must define root container');
  assert.ok(css.includes('.rsx-ladder'), 'must define ladder styles');
  assert.ok(css.includes('.rsx-player-card'), 'must define player card styles');
  assert.ok(css.includes('prefers-reduced-motion'), 'must support reduced motion');
  assert.ok(css.includes('@media(max-width:640px)'), 'must have mobile responsive rules');
});

test('homepage: feature-components.css styles the ranking-system rail card', async () => {
  const css = await readFile(path.join(root, 'apps/lab-web/src/css/feature-components.css'), 'utf8');
  assert.ok(css.includes('.landing-rail-card.ranking-system'), 'must style the ranking-system rail card');
  assert.ok(css.includes('.ranking-system-emblem'), 'must style the ranking-system emblem');
});

// ═══════════════════════════════════════════════════════════════
// Section 7 — Play Ranked CTA links to the real Online Duel route
// ═══════════════════════════════════════════════════════════════

test('cta: overlay renderer module is importable and exports renderRankingSystemOverlay', async () => {
  const mod = await import('../apps/lab-web/src/play/rank/ranking-system-overlay.js');
  assert.equal(typeof mod.renderRankingSystemOverlay, 'function');
});

test('cta: the overlay CTA links to the real #/play/online route (no fake route)', async () => {
  // Read the source to confirm the CTA href — the renderer is async and
  // needs a DOM container, so we verify the source string instead.
  const js = await readFile(path.join(root, 'apps/lab-web/src/play/rank/ranking-system-overlay.js'), 'utf8');
  assert.ok(js.includes('href="#/play/online"'), 'CTA must link to the real Online Duel route');
  assert.ok(js.includes('Play Ranked Online'), 'CTA must be labelled Play Ranked Online');
});
