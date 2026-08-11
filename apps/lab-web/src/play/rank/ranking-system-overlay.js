// ═══════════════════════════════════════════════════════════════
// ranking-system-overlay.js — "How Ranking Works" explainer overlay.
//
// Rendered inside the canonical landing overlay (openLandingOverlay in
// app.js). Presents the Intrilex Ranked system as a premium, visual,
// player-facing journey:
//
//   1. Intro / tagline
//   2. Your rank (live player state, gracefully degrades)
//   3. How rating works (visual win/loss + opponent-strength demo)
//   4. The rank ladder (interactive, canonical glyphs)
//   5. How to climb (practical player-facing copy)
//   6. Advanced details (expandable: Glicko-2 math, placement,
//      provisional, inactivity, seasons — only verified mechanics)
//   7. Play Ranked CTA (links to the real Online Duel mode)
//
// SOURCE OF TRUTH — no fabricated ranking rules:
//   - Rating model: Glicko-2 (packages/account-domain/src/glicko2.mjs)
//     exposed via computeRatingUpdate (rating.mjs). Legacy Elo is NOT
//     canonical and is never presented as the live system here.
//   - Rank ladder/thresholds/divisions: rank-tier.mjs (RANK_LADDER,
//     TIER_THRESHOLDS, PLACEMENTS_REQUIRED, progressInTier).
//   - Tier presentation (label/glyph/meaning): rank-presentation.mjs.
//   - Glyph rendering: renderRankGlyph (rank-glyph.js).
//   - Live player state: fetchSelfProfile (profile-data.js) — optional
//     and best-effort; the overlay remains a complete educational
//     explainer without it.
//
// The rating-change demo numbers are computed from the ACTUAL
// computeRatingUpdate function at render time — they are real, not
// illustrative.
// ═══════════════════════════════════════════════════════════════

import {
  RankTier,
  Division,
  RANK_LADDER,
  PLACEMENTS_REQUIRED,
  tierBounds,
  tierOrdinal,
  isApexTier,
  tierHasDivisions,
  progressInTier,
} from '@intrilex/account-domain/rank-tier';
import {
  DEFAULT_RATING,
  PROVISIONAL_THRESHOLD,
  computeRatingUpdate,
  initialRatingState,
} from '@intrilex/account-domain/rating';
import {
  GLICKO2_TAU,
  DEFAULT_RATING_DEVIATION,
  DEFAULT_VOLATILITY,
} from '@intrilex/account-domain/glicko2';
import {
  rankLabel,
  presentationFor,
} from './rank-presentation.mjs';
import { renderRankGlyph } from './rank-glyph.js';

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtIr = (n) => Math.round(n).toLocaleString('en-US');

/**
 * @typedef {Object} PlayerRankState
 * @property {boolean} available
 * @property {boolean} isPlacement
 * @property {string} tier
 * @property {string} division
 * @property {number} rating
 * @property {number|null} leaderboardPosition
 * @property {number|null} peakRating
 * @property {string|null} peakTier
 * @property {string|null} peakDivision
 * @property {boolean} isApex
 * @property {number} placementsPlayed
 * @property {number} placementsRequired
 * @property {number} ratedMatches
 */

/**
 * Render the full Ranking System explainer into a container element.
 * Async because live player state is fetched best-effort; the educational
 * content renders immediately and the player-state card fills in after.
 *
 * Designed to be called from openLandingOverlay in app.js:
 *   openLandingOverlay('Ranking System', (c) => renderRankingSystemOverlay(c));
 *
 * @param {HTMLElement} container - The overlay body element.
 * @returns {Promise<void>}
 */
export async function renderRankingSystemOverlay(container) {
  if (!container) return;

  // Render the full educational shell immediately (synchronous).
  container.innerHTML = renderShell();

  // Wire interactive elements (ladder selection, expandable math).
  wireInteractive(container);

  // Best-effort: load live player state and fill the player-rank card.
  // Failures (logged out, unconfigured, network) leave the truthful
  // "unranked / sign in" state in place — never fabricated.
  try {
    const state = await loadPlayerRankState();
    const slot = container.querySelector('[data-player-rank-slot]');
    if (slot) slot.innerHTML = renderPlayerRankCard(state);
    wirePlayerRankCard(container, state);
  } catch (err) {
    console.warn('[ranking-overlay] player state load failed:', err?.message ?? err);
  }
}

// ═══════════════════════════════════════════════════════════════
// SHELL — the full educational layout (renders before player state)
// ═══════════════════════════════════════════════════════════════

function renderShell() {
  return `<div class="rsx-overlay" data-testid="ranking-system-overlay">
    ${renderIntro()}
    <div class="rsx-player-rank-slot" data-player-rank-slot aria-live="polite">
      ${renderPlayerRankPlaceholder()}
    </div>
    ${renderHowRatingWorks()}
    ${renderRankLadder()}
    ${renderHowToClimb()}
    ${renderAdvancedDetails()}
    ${renderPlayRankedCta()}
  </div>`;
}

function renderIntro() {
  return `<section class="rsx-intro" data-testid="rsx-intro">
    <div class="rsx-intro-crest" aria-hidden="true">
      <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M32 4l6.5 16.5L56 22l-13 11 4 18-15-9-15 9 4-18L8 22l17.5-1.5z"/>
        <path d="M32 22v22M24 30h16" opacity=".55"/>
      </svg>
    </div>
    <div class="rsx-intro-text">
      <h3 class="rsx-intro-title">Intrilex Ranked</h3>
      <p class="rsx-intro-tagline">Prove it on the table. Climb the hierarchy.</p>
      <p class="rsx-intro-blurb">Every rated duel shapes your <strong>Intrilex Rating (IR)</strong> — a competitive skill number that moves with every win and loss. Climb eight earned tiers, from <strong>Initiate</strong> to the apex <strong>Intrilex</strong> rank.</p>
    </div>
  </section>`;
}

// ═══════════════════════════════════════════════════════════════
// PLAYER RANK CARD — live state with graceful degradation
// ═══════════════════════════════════════════════════════════════

function renderPlayerRankPlaceholder() {
  return `<div class="rsx-player-card rsx-player-card--loading" data-testid="rsx-player-loading">
    <span class="rsx-loading-dot" aria-hidden="true"></span>
    <span class="rsx-loading-text">Loading your rank…</span>
  </div>`;
}

/**
 * @param {PlayerRankState} state
 * @returns {string}
 */
function renderPlayerRankCard(state) {
  if (!state.available) {
    return `<div class="rsx-player-card rsx-player-card--guest" data-testid="rsx-player-guest">
      ${renderRankGlyph({ tier: RankTier.UNRANKED, size: 96, decorative: true })}
      <div class="rsx-player-info">
        <p class="rsx-player-tier rsx-player-tier--unranked">Unranked</p>
        <p class="rsx-player-sub">Sign in and complete your first Ranked matches to establish a rating.</p>
      </div>
    </div>`;
  }

  if (state.isPlacement) {
    const played = state.placementsPlayed;
    const required = state.placementsRequired;
    const pct = Math.min(100, (played / required) * 100);
    return `<div class="rsx-player-card rsx-player-card--placement" data-testid="rsx-player-placement">
      ${renderRankGlyph({ tier: RankTier.UNRANKED, size: 96, decorative: true })}
      <div class="rsx-player-info">
        <p class="rsx-player-tier rsx-player-tier--unranked">Placement</p>
        <p class="rsx-player-ir">${fmtIr(state.rating)} IR <span class="rsx-player-provisional">provisional</span></p>
        <div class="rsx-progress" role="progressbar" aria-label="Placement progress" aria-valuenow="${played}" aria-valuemin="0" aria-valuemax="${required}">
          <div class="rsx-progress-fill" style="width:${pct}%"></div>
        </div>
        <p class="rsx-player-sub">${played} / ${required} placement matches complete. Your tier is revealed after placement.</p>
      </div>
    </div>`;
  }

  const progress = progressInTier(state.rating, state.ratedMatches || PLACEMENTS_REQUIRED);
  const tierLabel = state.isApex && state.leaderboardPosition
    ? `${rankLabel(state.tier, state.division)} #${state.leaderboardPosition}`
    : rankLabel(state.tier, state.division);

  if (state.isApex) {
    return `<div class="rsx-player-card rsx-player-card--apex" data-testid="rsx-player-apex">
      ${renderRankGlyph({ tier: state.tier, division: state.division, size: 96, showDivision: false, decorative: true,
        leaderboardPosition: state.leaderboardPosition ? `#${state.leaderboardPosition}` : null })}
      <div class="rsx-player-info">
        <p class="rsx-player-tier">${esc(tierLabel)}</p>
        <p class="rsx-player-ir">${fmtIr(state.rating)} IR <span class="rsx-player-apex-tag">apex</span></p>
        <p class="rsx-player-sub">You've reached the top of the ladder. Leaderboard position breaks ties among the elite.</p>
      </div>
    </div>`;
  }

  const pct = Math.round(progress.percent);
  const nextLabel = progress.nextTier ? rankLabel(progress.nextTier, Division.III) : null;
  const peakLine = state.peakRating != null && state.peakTier
    ? `<p class="rsx-player-peak">Season peak: ${rankLabel(state.peakTier, state.peakDivision)} · ${fmtIr(state.peakRating)} IR</p>`
    : '';

  return `<div class="rsx-player-card" data-testid="rsx-player-ranked">
    ${renderRankGlyph({ tier: state.tier, division: state.division, size: 96, showDivision: true, decorative: true })}
    <div class="rsx-player-info">
      <p class="rsx-player-tier">${esc(tierLabel)}</p>
      <p class="rsx-player-ir">${fmtIr(state.rating)} IR</p>
      <div class="rsx-progress" role="progressbar" aria-label="Progress to ${esc(nextLabel ?? 'next tier')}" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <div class="rsx-progress-fill" style="width:${pct}%"></div>
      </div>
      <p class="rsx-player-sub">${pct}% toward ${esc(nextLabel ?? 'the next tier')} <span class="rsx-player-remaining">· ${fmtIr(progress.remaining)} IR to go</span></p>
      ${peakLine}
    </div>
  </div>`;
}

/**
 * Wire the "Play Ranked" link inside the player card (if present).
 * @param {HTMLElement} _container
 * @param {PlayerRankState} _state
 */
function wirePlayerRankCard(_container, _state) {
  // No card-internal actions currently; reserved for future "view profile" link.
}

// ═══════════════════════════════════════════════════════════════
// HOW RATING WORKS — visual win/loss + opponent-strength demo
// ═══════════════════════════════════════════════════════════════

function renderHowRatingWorks() {
  const demos = computeRatingDemos();
  return `<section class="rsx-section" data-testid="rsx-how-rating-works">
    <h4 class="rsx-section-title">How Rating Works</h4>
    <p class="rsx-section-lede">Your IR rises when you win and falls when you lose. How much it moves depends on the relative strength of both players — and how settled the system is about each rating.</p>
    <div class="rsx-demo-grid">
      ${demos.map(renderDemoCard).join('')}
    </div>
    <p class="rsx-demo-note">Deltas above are computed from Intrilex's actual rating engine for fresh 1200 IR players. Real matches also factor in each player's uncertainty (see Advanced Details).</p>
  </section>`;
}

/**
 * @typedef {Object} RatingDemo
 * @property {string} label
 * @property {string} outcome
 * @property {number} youRating
 * @property {number} oppRating
 * @property {number} delta
 * @property {boolean} positive
 * @property {string} blurb
 */

/**
 * Compute four real rating-change scenarios using the canonical
 * computeRatingUpdate. Both players start as fresh 1200 IR (default RD
 * and volatility) so the demo isolates the opponent-strength effect.
 * @returns {RatingDemo[]}
 */
function computeRatingDemos() {
  const you = () => initialRatingState('you-demo');
  const opp = (rating) => ({ ...initialRatingState('opp-demo'), rating });

  const beatStronger = computeRatingUpdate({
    playerA: you(), playerB: opp(1400), outcome: 'WIN_A',
  });
  const beatWeaker = computeRatingUpdate({
    playerA: you(), playerB: opp(1000), outcome: 'WIN_A',
  });
  const loseStronger = computeRatingUpdate({
    playerA: you(), playerB: opp(1400), outcome: 'WIN_B',
  });
  const loseWeaker = computeRatingUpdate({
    playerA: you(), playerB: opp(1000), outcome: 'WIN_B',
  });

  const d = (r) => Math.round(r.playerA.ratingDelta);
  return [
    { label: 'Beat a stronger opponent', outcome: 'WIN', youRating: 1200, oppRating: 1400,
      delta: d(beatStronger), positive: true, blurb: 'Bigger reward — you overperformed expectations.' },
    { label: 'Beat a weaker opponent', outcome: 'WIN', youRating: 1200, oppRating: 1000,
      delta: d(beatWeaker), positive: true, blurb: 'Smaller reward — the win was expected.' },
    { label: 'Lose to a stronger opponent', outcome: 'LOSS', youRating: 1200, oppRating: 1400,
      delta: d(loseStronger), positive: false, blurb: 'Smaller penalty — the loss was expected.' },
    { label: 'Lose to a weaker opponent', outcome: 'LOSS', youRating: 1200, oppRating: 1000,
      delta: d(loseWeaker), positive: false, blurb: 'Larger penalty — you underperformed expectations.' },
  ];
}

/**
 * @param {RatingDemo} demo
 * @returns {string}
 */
function renderDemoCard(demo) {
  const deltaSign = demo.positive ? '+' : '';
  const deltaClass = demo.positive ? 'rsx-delta-up' : 'rsx-delta-down';
  const arrow = demo.positive ? '↑' : '↓';
  const outcomeTag = demo.outcome === 'WIN' ? 'rsx-outcome-win' : 'rsx-outcome-loss';
  return `<div class="rsx-demo-card ${demo.positive ? 'rsx-demo-win' : 'rsx-demo-loss'}">
    <p class="rsx-demo-label">${esc(demo.label)}</p>
    <div class="rsx-demo-versus">
      <div class="rsx-demo-side"><span class="rsx-demo-side-label">You</span><span class="rsx-demo-side-ir">${fmtIr(demo.youRating)}</span></div>
      <span class="rsx-demo-vs">vs</span>
      <div class="rsx-demo-side"><span class="rsx-demo-side-label">Opp</span><span class="rsx-demo-side-ir">${fmtIr(demo.oppRating)}</span></div>
    </div>
    <div class="rsx-demo-result">
      <span class="rsx-demo-outcome ${outcomeTag}">${esc(demo.outcome)}</span>
      <span class="rsx-demo-delta ${deltaClass}">${arrow} ${deltaSign}${demo.delta} IR</span>
    </div>
    <p class="rsx-demo-blurb">${esc(demo.blurb)}</p>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// RANK LADDER — interactive, canonical glyphs
// ═══════════════════════════════════════════════════════════════

function renderRankLadder() {
  const rungs = RANK_LADDER.map((tier, i) => {
    const bounds = tierBounds(tier);
    const pres = presentationFor(tier);
    const min = bounds ? bounds[0] : 0;
    const max = bounds && bounds[1] !== Infinity ? bounds[1] : null;
    const range = max == null ? `${fmtIr(min)}+ IR` : `${fmtIr(min)}–${fmtIr(max)} IR`;
    const isApex = isApexTier(tier);
    const divisions = tierHasDivisions(tier)
      ? `<span class="rsx-rung-divisions">III · II · I</span>`
      : isApex
        ? `<span class="rsx-rung-divisions rsx-rung-divisions--apex">Apex · leaderboard rank</span>`
        : '';
    const prev = i > 0 ? RANK_LADDER[i - 1] : null;
    const next = i < RANK_LADDER.length - 1 ? RANK_LADDER[i + 1] : null;
    return `<button class="rsx-rung" data-rsx-tier="${esc(tier)}" data-rsx-ordinal="${i}" role="tab" aria-selected="false" aria-controls="rsx-rung-detail" tabindex="${i === 0 ? '0' : '-1'}">
      ${renderRankGlyph({ tier, size: 72, showDivision: false, decorative: true })}
      <span class="rsx-rung-name">${esc(pres?.label ?? tier)}</span>
      <span class="rsx-rung-range">${range}</span>
      ${divisions}
      <span class="rsx-rung-meaning" hidden data-rsx-meaning>${esc(pres?.meaning ?? '')}</span>
      <span class="rsx-rung-prev" hidden data-rsx-prev>${esc(prev ?? '')}</span>
      <span class="rsx-rung-next" hidden data-rsx-next>${esc(next ?? '')}</span>
    </button>`;
  }).join('');

  return `<section class="rsx-section rsx-ladder-section" data-testid="rsx-rank-ladder">
    <h4 class="rsx-section-title">The Rank Ladder</h4>
    <p class="rsx-section-lede">Eight earned tiers. Each non-apex tier is split into three divisions — <strong>III</strong>, <strong>II</strong>, <strong>I</strong> — with I the highest. Select a tier to see its detail.</p>
    <div class="rsx-ladder" role="tablist" aria-label="Intrilex rank ladder" data-rsx-ladder>
      ${rungs}
    </div>
    <div class="rsx-rung-detail" id="rsx-rung-detail" data-testid="rsx-rung-detail" aria-live="polite">
      ${renderRungDetail(RANK_LADDER[0])}
    </div>
  </section>`;
}

function renderRungDetail(tier) {
  const bounds = tierBounds(tier);
  const pres = presentationFor(tier);
  const min = bounds ? bounds[0] : 0;
  const max = bounds && bounds[1] !== Infinity ? bounds[1] : null;
  const range = max == null ? `${fmtIr(min)} IR and above` : `${fmtIr(min)} – ${fmtIr(max)} IR`;
  const isApex = isApexTier(tier);
  const ordinal = tierOrdinal(tier);
  const nextTier = ordinal >= 0 && ordinal < RANK_LADDER.length - 1 ? RANK_LADDER[ordinal + 1] : null;
  const prevTier = ordinal > 0 ? RANK_LADDER[ordinal - 1] : null;
  const nextLine = nextTier
    ? `Promote to <strong>${esc(rankLabel(nextTier, Division.III))}</strong> at ${fmtIr(tierBounds(nextTier)[0])} IR.`
    : 'This is the apex — there is no higher tier.';
  const prevLine = prevTier
    ? `Demote from <strong>${esc(rankLabel(prevTier, Division.I))}</strong> below ${fmtIr(min)} IR.`
    : 'This is the entry tier — the first earned rank after placement.';

  const divisionBlurb = isApex
    ? `<p class="rsx-detail-line">Intrilex has no divisions. Ties among apex players are broken by <strong>leaderboard position</strong> (e.g. <em>Intrilex #47</em>).</p>`
    : `<p class="rsx-detail-line">Three divisions span this tier: <strong>III</strong> (lowest), <strong>II</strong>, <strong>I</strong> (highest). Each division covers about 67 IR.</p>`;

  return `<div class="rsx-detail-card ${pres?.glowClass ?? ''}" data-rsx-detail-tier="${esc(tier)}">
    <div class="rsx-detail-glyph">${renderRankGlyph({ tier, size: 128, showDivision: false, decorative: true })}</div>
    <div class="rsx-detail-body">
      <p class="rsx-detail-name">${esc(pres?.label ?? tier)}</p>
      <p class="rsx-detail-range">${range}</p>
      <p class="rsx-detail-meaning">${esc(pres?.meaning ?? '')}</p>
      ${divisionBlurb}
      <p class="rsx-detail-line">${prevLine}</p>
      <p class="rsx-detail-line">${nextLine}</p>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// HOW TO CLIMB — practical player-facing copy
// ═══════════════════════════════════════════════════════════════

function renderHowToClimb() {
  return `<section class="rsx-section" data-testid="rsx-how-to-climb">
    <h4 class="rsx-section-title">How to Climb</h4>
    <div class="rsx-climb-grid">
      <div class="rsx-climb-step">
        <span class="rsx-climb-num" aria-hidden="true">1</span>
        <strong>Complete placement</strong>
        <p>Play your first ${PLACEMENTS_REQUIRED} rated matches. You'll be <strong>Unranked</strong> until then — your tier is revealed once placement finishes.</p>
      </div>
      <div class="rsx-climb-step">
        <span class="rsx-climb-num" aria-hidden="true">2</span>
        <strong>Win to raise your IR</strong>
        <p>Every ranked win adds IR. Beating higher-rated opponents earns bigger gains. Climb through III, II, and I in each tier.</p>
      </div>
      <div class="rsx-climb-step">
        <span class="rsx-climb-num" aria-hidden="true">3</span>
        <strong>Cross the threshold</strong>
        <p>Hit the next tier's rating floor and you promote instantly — there are no separate promotion matches. Drop below your tier's floor and you demote.</p>
      </div>
      <div class="rsx-climb-step">
        <span class="rsx-climb-num" aria-hidden="true">4</span>
        <strong>Reach Intrilex</strong>
        <p>At ${fmtIr(tierBounds(RankTier.INTRILEX)[0])} IR you enter the apex tier. From there, leaderboard position decides your standing among the elite.</p>
      </div>
    </div>
  </section>`;
}

// ═══════════════════════════════════════════════════════════════
// ADVANCED DETAILS — expandable, only verified mechanics
// ═══════════════════════════════════════════════════════════════

function renderAdvancedDetails() {
  return `<section class="rsx-section rsx-advanced-section" data-testid="rsx-advanced-details">
    <h4 class="rsx-section-title">Advanced Details</h4>
    <div class="rsx-advanced-grid">
      <div class="rsx-advanced-item">
        <h5>The rating model — Glicko-2</h5>
        <p>Intrilex uses <strong>Glicko-2</strong> (Glickman, 2013), not vanilla Elo. As well as your visible IR, the system tracks two hidden values: <strong>rating deviation</strong> (RD — how unsure it is about your rating) and <strong>volatility</strong> (how much your skill swings). These are server-owned and never shown in player UI.</p>
        <p>New players start at <strong>${fmtIr(DEFAULT_RATING)} IR</strong> with high uncertainty. As you play, uncertainty shrinks and your rating settles.</p>
      </div>
      <div class="rsx-advanced-item">
        <h5>Placement vs. provisional</h5>
        <p><strong>Placement</strong> lasts your first ${PLACEMENTS_REQUIRED} rated matches — you're Unranked until it's done. <strong>Provisional</strong> lasts your first ${PROVISIONAL_THRESHOLD} rated matches: during this window the system is still calibrating, so rating swings are larger.</p>
      </div>
      <div class="rsx-advanced-item">
        <h5>Inactivity</h5>
        <p>If you stop playing rated matches, your <strong>uncertainty (RD) widens</strong> — your IR number itself doesn't decay, but your next match will move it more until you're settled again.</p>
      </div>
      <div class="rsx-advanced-item">
        <h5>Seasons &amp; leaderboards</h5>
        <p>Ranked play runs in <strong>seasons</strong>. Your season peak (highest tier and IR) is recorded on your profile, and the leaderboard ranks players within a season. At apex (Intrilex), your leaderboard position is your tiebreaker.</p>
      </div>
      <div class="rsx-advanced-item">
        <h5>What there isn't</h5>
        <p>There are no separate promotion or demotion matches, no tier-protection floors, and no hidden MMR separate from your IR — your visible rating <em>is</em> the matchmaking rating. Tiers and divisions are derived directly from your IR.</p>
      </div>
    </div>
    ${renderMathDetails()}
  </section>`;
}

function renderMathDetails() {
  // Real constants from the canonical implementation.
  const tau = GLICKO2_TAU;
  const rd = DEFAULT_RATING_DEVIATION;
  const vol = DEFAULT_VOLATILITY;
  return `<details class="rsx-math-details" data-testid="rsx-math-details">
    <summary class="rsx-math-summary">Show the math</summary>
    <div class="rsx-math-body">
      <p class="rsx-math-lede">Glicko-2 converts both players to an internal scale, computes an expected score, then updates rating, deviation, and volatility together. Per match, both players are updated simultaneously using each other as the single opponent.</p>
      <div class="rsx-math-block">
        <p class="rsx-math-block-title">Expected score</p>
        <pre class="rsx-math-formula">E = 1 / (1 + 10<sup>−g(φⱼ)(μ−μⱼ)/400</sup>)</pre>
        <p class="rsx-math-note">where g(φⱼ) weights the opponent's uncertainty. Higher opponent uncertainty → the expected score is pulled less toward the rating gap.</p>
      </div>
      <div class="rsx-math-block">
        <p class="rsx-math-block-title">New rating</p>
        <pre class="rsx-math-formula">R' = R + φ'² · g(φⱼ) · (S − E)</pre>
        <p class="rsx-math-note">S is the actual score (1 win, 0 loss, 0.5 draw). The update is scaled by the new deviation φ'² — so uncertain ratings move more.</p>
      </div>
      <div class="rsx-math-constants">
        <p class="rsx-math-constants-title">Intrilex constants (verified from the engine)</p>
        <ul>
          <li>Default rating: <strong>${fmtIr(DEFAULT_RATING)} IR</strong></li>
          <li>System constant τ: <strong>${tau}</strong> (controls volatility change)</li>
          <li>Initial rating deviation: <strong>${rd}</strong></li>
          <li>Initial volatility: <strong>${vol}</strong></li>
          <li>Rating range: <strong>0 – 5,000 IR</strong></li>
        </ul>
      </div>
      <p class="rsx-math-footnote">Full implementation: <code>packages/account-domain/src/glicko2.mjs</code>. A legacy Elo path is retained only for historical parity tests — it is not the canonical rating transaction.</p>
    </div>
  </details>`;
}

// ═══════════════════════════════════════════════════════════════
// PLAY RANKED CTA — links to the real Online Duel mode
// ═══════════════════════════════════════════════════════════════

function renderPlayRankedCta() {
  return `<section class="rsx-cta-section" data-testid="rsx-cta">
    <a class="rsx-cta-button" href="#/play/online" data-rsx-cta>
      <span>Play Ranked Online</span>
      <span class="rsx-cta-arrow" aria-hidden="true">→</span>
    </a>
    <p class="rsx-cta-sub">Server-authoritative Online Duels are rated. Local vs AI is practice and is not rated.</p>
  </section>`;
}

// ═══════════════════════════════════════════════════════════════
// INTERACTIVITY — ladder selection (keyboard + click)
// ═══════════════════════════════════════════════════════════════

function wireInteractive(container) {
  wireLadder(container);
  wireCta(container);
}

function wireLadder(container) {
  const ladder = container.querySelector('[data-rsx-ladder]');
  if (!ladder) return;
  const rungs = [...ladder.querySelectorAll('.rsx-rung')];
  const detail = container.querySelector('#rsx-rung-detail');
  if (!rungs.length || !detail) return;

  const selectRung = (rung) => {
    rungs.forEach(r => {
      r.setAttribute('aria-selected', 'false');
      r.tabIndex = -1;
      r.classList.remove('rsx-rung--selected');
    });
    rung.setAttribute('aria-selected', 'true');
    rung.tabIndex = 0;
    rung.classList.add('rsx-rung--selected');
    const tier = rung.dataset.rsxTier;
    detail.innerHTML = renderRungDetail(tier);
  };

  rungs.forEach((rung, i) => {
    rung.addEventListener('click', () => selectRung(rung));
    rung.addEventListener('keydown', (e) => {
      let next = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % rungs.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + rungs.length) % rungs.length;
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectRung(rung); return; }
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = rungs.length - 1;
      if (next >= 0) { e.preventDefault(); rungs[next].focus(); selectRung(rungs[next]); }
    });
  });

  // Default-select the first rung so the detail panel is populated.
  selectRung(rungs[0]);
}

function wireCta(container) {
  const cta = container.querySelector('[data-rsx-cta]');
  if (!cta) return;
  // The link uses href="#/play/online" — clicking it should close the
  // overlay so navigation proceeds. The landing overlay's own close
  // happens on hash change via render(); but we close explicitly to
  // avoid the overlay lingering over the play hub.
  cta.addEventListener('click', () => {
    // Defer to allow the hash change to take effect first.
    setTimeout(() => {
      const closeBtn = document.querySelector('.landing-overlay-close');
      if (closeBtn) closeBtn.click();
    }, 0);
  });
}

// ═══════════════════════════════════════════════════════════════
// PLAYER STATE — best-effort load from profile-data
// ═══════════════════════════════════════════════════════════════

/**
 * Best-effort load of the viewer's ranked state.
 * Returns a PlayerRankState. Never throws — failures degrade to the
 * "unavailable" state so the overlay stays educational.
 * @returns {Promise<PlayerRankState>}
 */
async function loadPlayerRankState() {
  try {
    const { fetchSelfProfile } = await import('../../play/profile/profile-data.js');
    const result = await fetchSelfProfile();
    if (!result || !result.available || !result.profile) {
      return unavailableState();
    }
    const ranked = result.profile.ranked;
    if (!ranked || !ranked.available) {
      // Profile loaded but no ranked history yet — show placement-ready
      // state only if the player is actually signed in; otherwise guest.
      return { ...unavailableState(), available: false };
    }
    return {
      available: true,
      isPlacement: Boolean(ranked.isPlacement),
      tier: ranked.tier ?? RankTier.UNRANKED,
      division: ranked.division ?? Division.NONE,
      rating: Number(ranked.rating ?? DEFAULT_RATING),
      leaderboardPosition: ranked.leaderboardPosition ?? null,
      peakRating: ranked.peakRating != null ? Number(ranked.peakRating) : null,
      peakTier: ranked.peakTier ?? null,
      peakDivision: ranked.peakDivision ?? null,
      isApex: Boolean(ranked.isApex),
      placementsPlayed: Number(ranked.placementsPlayed ?? 0),
      placementsRequired: Number(ranked.placementsRequired ?? PLACEMENTS_REQUIRED),
      ratedMatches: Number(ranked.games ?? 0),
    };
  } catch (err) {
    console.warn('[ranking-overlay] loadPlayerRankState error:', err?.message ?? err);
    return unavailableState();
  }
}

/**
 * @returns {PlayerRankState}
 */
function unavailableState() {
  return {
    available: false,
    isPlacement: false,
    tier: RankTier.UNRANKED,
    division: Division.NONE,
    rating: DEFAULT_RATING,
    leaderboardPosition: null,
    peakRating: null,
    peakTier: null,
    peakDivision: null,
    isApex: false,
    placementsPlayed: 0,
    placementsRequired: PLACEMENTS_REQUIRED,
    ratedMatches: 0,
  };
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS — for testing
// ═══════════════════════════════════════════════════════════════

export {
  computeRatingDemos,
  renderRankLadder,
  renderRungDetail,
  renderPlayerRankCard,
  renderHowRatingWorks,
  renderAdvancedDetails,
  unavailableState,
};
