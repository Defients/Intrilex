// ═══════════════════════════════════════════════════════════════
// rank-glyph.js — Reusable Ranked glyph component.
//
// One canonical entry point for rendering a tier glyph anywhere in the UI.
// Resolves the canonical image from the presentation registry, renders a
// normalized bounding box (object-fit: contain — no stretching), applies
// tier-aware halo + division ornamentation via CSS classes, and handles
// accessibility semantics.
//
// DO NOT render raw <img> markup for rank glyphs in component files. Call
// renderRankGlyph() instead so the tier→image mapping stays centralized.
// ═══════════════════════════════════════════════════════════════

import { RankTier, Division, isApexTier, tierHasDivisions } from "../../account-domain/rank-tier.mjs";
import {
  resolveGlyphPath,
  rankLabel,
  presentationFor,
  hasGlyph,
} from './rank-presentation.mjs?v=e2bd7e8507fa';

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * @typedef {Object} RankGlyphOptions
 * @property {string} tier - One of RankTier.
 * @property {string} [division] - One of Division (NONE for apex/unranked).
 * @property {number} [size=128] - Target rendered pixel size (square box).
 * @property {boolean} [showDivision=false] - Apply division ornamentation CSS.
 * @property {boolean} [decorative=false] - When true, image is aria-hidden (alt="").
 * @property {string} [altText] - Override alt text (defaults to "{tier} {division} rank").
 * @property {string} [className] - Extra class on the container.
 * @property {'eager'|'lazy'} [loading] - Image loading strategy (default: eager for size>=128, else lazy).
 * @property {string} [leaderboardPosition] - For apex INTRILEX, optional "#47" suffix label.
 */

/**
 * Render a normalized rank glyph.
 *
 * - UNRANKED renders a neutral placeholder frame (never the Initiate glyph).
 * - INTRILEX (apex) renders the glyph with the apex treatment and optional
 *   leaderboard position label; no division ornamentation.
 * - Earned tiers render the canonical glyph with optional division ornament.
 *
 * @param {RankGlyphOptions} opts
 * @returns {string} HTML string.
 */
export function renderRankGlyph(opts = {}) {
  const tier = opts.tier ?? RankTier.UNRANKED;
  const division = opts.division ?? Division.NONE;
  const size = Math.max(8, Math.floor(opts.size ?? 128));
  const showDivision = opts.showDivision === true && tierHasDivisions(tier);
  const decorative = opts.decorative === true;
  const extraClass = opts.className ? ` ${esc(opts.className)}` : '';
  const pres = presentationFor(tier);
  const glowClass = pres?.glowClass ?? 'tier-unranked';

  // Division ornamentation class (III/II/I). Apex/unranked get none.
  const divisionClass = showDivision && division !== Division.NONE
    ? ` division-${String(division).toLowerCase()}`
    : '';

  const style = `width:${size}px;height:${size}px;--rank-glyph-size:${size}px`;

  // ── UNRANKED: neutral placeholder, never an earned glyph ──
  if (!hasGlyph(tier)) {
    const label = rankLabel(tier, division);
    const alt = decorative ? '' : (opts.altText ?? `${label} rank`);
    return `<span class="rank-glyph rank-glyph-unranked ${glowClass}${divisionClass}${extraClass}" style="${style}" role="img" aria-label="${esc(alt)}">
      <span class="rank-glyph-placeholder" aria-hidden="true">?</span>
    </span>`;
  }

  const url = resolveGlyphPath(tier, size);
  const alt = decorative
    ? ''
    : (opts.altText ?? `${rankLabel(tier, division)} rank`);
  const loading = opts.loading ?? (size >= 128 ? 'eager' : 'lazy');
  const apexClass = isApexTier(tier) ? ' rank-glyph-apex' : '';
  const positionLabel = isApexTier(tier) && opts.leaderboardPosition
    ? `<span class="rank-glyph-apex-position" aria-hidden="true">${esc(String(opts.leaderboardPosition))}</span>`
    : '';

  return `<span class="rank-glyph ${glowClass}${apexClass}${divisionClass}${extraClass}" style="${style}" data-tier="${esc(tier)}" data-size="${size}">
    <img class="rank-glyph-img" src="${esc(url ?? '')}" alt="${esc(alt)}" width="${size}" height="${size}" loading="${loading}" decoding="async"${decorative ? ' aria-hidden="true"' : ''} />
    ${positionLabel}
  </span>`;
}

/**
 * Render a compact rank chip: [glyph] Tier Division · IR — for plates/lists.
 * @param {Object} opts
 * @param {string} opts.tier
 * @param {string} [opts.division]
 * @param {number} [opts.rating] - Intrilex Rating (IR).
 * @param {number} [opts.size=32] - Glyph size.
 * @param {boolean} [opts.showDivision=true]
 * @param {string} [opts.className]
 * @returns {string}
 */
export function renderRankChip(opts = {}) {
  const tier = opts.tier ?? RankTier.UNRANKED;
  const division = opts.division ?? Division.NONE;
  const rating = typeof opts.rating === 'number' ? Math.round(opts.rating) : null;
  const size = Math.max(16, Math.floor(opts.size ?? 32));
  const showDivision = opts.showDivision !== false;
  const label = rankLabel(tier, showDivision ? division : undefined);
  const irText = rating != null ? ` · ${rating} IR` : '';
  const extraClass = opts.className ? ` ${esc(opts.className)}` : '';
  return `<span class="rank-chip${extraClass}">
    ${renderRankGlyph({ tier, division, size, showDivision, decorative: true })}
    <span class="rank-chip-label">${esc(label)}${irText}</span>
  </span>`;
}

// Re-export presentation helpers for convenience.
export { resolveGlyphPath, rankLabel, presentationFor, hasGlyph, isApexTier };
