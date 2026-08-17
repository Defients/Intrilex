// ═══════════════════════════════════════════════════════════════
// play-card-component.js — Reusable TCG card rendering component.
//
// Renders rich card faces for the Play v2 board using the
// authoritative card-face-data registry for rank, suit, title,
// accent colors, and abilities. Never determines legality or
// mutates state — purely presentational.
//
// Card input shape (from play-controller snapshots):
//   { id, identity, pointValue, tapped, aegis, providesGuard,
//     exileBound, jackHostId, faceDown }
// ═══════════════════════════════════════════════════════════════

import { getCardDefinition, getSuit, parseCardIdentity, rankName } from '../card-face-data.js?v=4f30833b427f';
import { getCardArtBoardPath } from '../card-art-registry.js?v=4f30833b427f';

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── Themed keyword highlighting for ability tooltips (v0.25) ──
// Keywords are wrapped in <span class="tcg-tip-kw tcg-tip-kw--<theme>"> for
// theme-colored rendering. Order matters: longer phrases first so that
// "Royal Marriage" is matched before "Marriage", "Board Lock" before "Lock".
const KEYWORD_THEMES = [
  // Anchor/gold theme
  { theme: 'anchor', words: ['Anchor', 'Royal Marriage', 'Foundation', 'Marriage'] },
  // Counter/red theme
  { theme: 'counter', words: ['Counter', 'Counter Multi-Play', 'Counter Single', 'Disrupt', 'Exile Counter'] },
  // Guard/purple theme
  { theme: 'guard', words: ['Guard', 'Aegis', 'Vulnerable', 'Protection', 'Special Protection'] },
  // Exile/orange theme
  { theme: 'exile', words: ['Exile', 'Exile-Bound', 'Exile Counter'] },
  // Scuttle/cyan theme
  { theme: 'scuttle', words: ['Scuttle', 'Free Scuttle', 'Absolute Scuttle'] },
  // Swap/amber theme
  { theme: 'swap', words: ['Swap', 'Swap Bar', 'Deep Draw', 'Topdeck', 'Sequential Topdeck'] },
  // Super/magenta theme
  { theme: 'super', words: ['Super', 'Super Raid', 'Super Dig', 'Row Exchange', 'Ultra', 'Combo'] },
  // Board Lock/teal theme
  { theme: 'lock', words: ['Board Lock', 'Goal Shift', 'Trap', 'Voltage'] },
  // Draw/green theme
  { theme: 'draw', words: ['Draw', 'Draw & Cast'] },
  // Timing/class theme
  { theme: 'timing', words: ['Instant', 'Quick', 'Interrupt', 'Passive', 'Effect', 'Scoring trigger'] },
];

const KEYWORD_MAP = new Map();
for (const { theme, words } of KEYWORD_THEMES) {
  for (const w of words) KEYWORD_MAP.set(w.toLowerCase(), theme);
}

// Sort keywords by length descending so longer phrases match first
const SORTED_KEYWORDS = [...KEYWORD_MAP.keys()].sort((a, b) => b.length - a.length);

/**
 * Highlight themed keywords in a text string with theme-colored spans.
 * @param {string} text
 * @returns {string} HTML with <span class="tcg-tip-kw tcg-tip-kw--<theme>"> wrappers
 */
function highlightKeywords(text) {
  if (!text) return '';
  // Build a regex that matches any keyword (case-insensitive, word-boundary)
  // Escape regex special chars in keywords
  const escaped = SORTED_KEYWORDS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
  return esc(text).replace(re, (match) => {
    const theme = KEYWORD_MAP.get(match.toLowerCase());
    return `<span class="tcg-tip-kw tcg-tip-kw--${theme}">${esc(match)}</span>`;
  });
}

/**
 * Re-export parseCardIdentity so callers can import everything
 * card-related from this single module.
 */
export { parseCardIdentity };

/**
 * Render a single mechanic icon with a beautified CSS tooltip.
 * The tooltip shows the ability title (themed), timing badge, and summary
 * with keyword highlighting. Appears on hover with a slight icon enlargement.
 * @param {object} ability - { id, icon, title, timing, summary }
 * @returns {string} HTML
 */
function renderMechanicIcon(ability) {
  const icon = esc(ability.icon ?? '◆');
  const title = esc(ability.title ?? '');
  const timing = esc(ability.timing ?? '');
  const summaryHtml = highlightKeywords(ability.summary ?? '');
  return `<span class="tcg-mechanic-icon" data-mechanic-id="${esc(ability.id ?? '')}" role="button" tabindex="0" aria-label="${title}: ${esc(ability.summary ?? '')}">
    <span class="tcg-mechanic-icon-glyph" aria-hidden="true">${icon}</span>
    <span class="tcg-mechanic-tooltip" role="tooltip">
      <span class="tcg-tip-title">${title}</span>
      ${timing ? `<span class="tcg-tip-timing">${timing}</span>` : ''}
      ${summaryHtml ? `<span class="tcg-tip-summary">${summaryHtml}</span>` : ''}
    </span>
  </span>`;
}

/**
 * Map a suit symbol to its accent color set.
 * @param {string|null} suit - Suit symbol (♣♦♥♠) or null
 * @returns {{ accent:string, accent2:string, id:string, name:string, symbol:string, shape:string }}
 */
export function getSuitColor(suit) {
  return getSuit(suit);
}

/**
 * Format a rank for display.
 * @param {string} rank - Rank token (A, 2-10, J, Q, K, BJ, RJ)
 * @returns {string}
 */
export function getRankDisplay(rank) {
  if (rank === 'BJ' || rank === 'RJ') return rank;
  return String(rank ?? '?');
}

/**
 * Build the list of runtime status markers for a snapshot card.
 * @param {object} card - Snapshot card
 * @returns {Array<[string,string]>} icon/label pairs
 */
function stateMarkers(card = {}) {
  const markers = [];
  if (card.tapped) markers.push(['↻', 'Tapped']);
  if (card.aegis) markers.push(['⬡', 'Aegis']);
  if (card.providesGuard) markers.push(['◒', 'Guard']);
  if (card.exileBound) markers.push(['⊘', 'Exile-Bound']);
  if (card.jackHostId) markers.push(['⛓', 'Attached']);
  return markers;
}

function renderStateStrip(card) {
  const markers = stateMarkers(card);
  if (!markers.length) return '';
  return `<span class="tcg-state-strip" aria-label="Card state">${markers.map(([icon, label]) => `<span class="tcg-state-marker"><b aria-hidden="true">${esc(icon)}</b>${esc(label)}</span>`).join('')}</span>`;
}

/**
 * Render a rich TCG card face.
 * @param {object} card - Snapshot card
 * @param {object} [options]
 * @param {string} [options.zoneClass] - Extra class for the zone (e.g. 'human-pr', 'swap')
 * @param {boolean} [options.showMechanicIcons] - Show ability icons in the card center (Board appearance)
 * @returns {string} HTML
 */
export function renderTcgCard(card, options = {}) {
  if (!card) return '';
  if (card.faceDown) return renderTcgCardBack();

  const def = getCardDefinition(card.identity);
  const suit = getSuit(def.suit);
  const rank = getRankDisplay(def.rank);
  const points = card.pointValue ?? def.prValue ?? 0;

  const classes = ['tcg-card'];
  if (options.zoneClass) classes.push(options.zoneClass);
  classes.push(`tcg-suit-${suit.id}`);
  classes.push(`tcg-rank-${def.rank}`);
  if (card.tapped) classes.push('tapped');
  if (card.aegis) classes.push('aegis');
  if (card.providesGuard) classes.push('guard');
  if (card.exileBound) classes.push('exile-bound');
  if (card.jackHostId) classes.push('attachment');
  if (def.rank === 'J' || def.rank === 'Q' || def.rank === 'K' || def.rank === 'A') classes.push('face-card');
  if (def.rank === 'BJ' || def.rank === 'RJ') classes.push('joker');

  const style = `--card-accent:${suit.accent};--card-accent-2:${suit.accent2}`;
  // Resolve artwork through the canonical card-art registry (single source of
  // truth). Falls back to def.art for scaffold cards not in the registry.
  let artPath = def.art;
  try { if (def.authority === 'canonical') artPath = getCardArtBoardPath(card.identity); } catch { /* keep def.art */ }
  const art = artPath ? ` style="background-image:url('${esc(artPath)}')"` : '';
  const ariaLabel = `${esc(card.identity ?? 'unknown')}, ${points} points${card.tapped ? ', tapped' : ''}${card.aegis ? ', Aegis' : ''}${card.providesGuard ? ', Guard' : ''}${card.exileBound ? ', Exile-Bound' : ''}${card.jackHostId ? ', Attached' : ''}`;

  // v0.25: Board appearance — mechanic icons in the dead center of the card.
  // Each icon has a beautified CSS tooltip with themed keyword highlighting.
  const mechanicIcons = options.showMechanicIcons && def.abilities?.length
    ? `<span class="tcg-mechanic-icons" aria-hidden="false">${def.abilities.slice(0, 4).map(a => renderMechanicIcon(a)).join('')}</span>`
    : '';

  return `<div class="${classes.join(' ')}" style="${style}" data-card-id="${esc(card.id)}" aria-label="${ariaLabel}">
    <span class="tcg-rank" aria-hidden="true">${esc(rank)}</span>
    <span class="tcg-suit-glyph" aria-hidden="true">${esc(suit.symbol)}</span>
    ${artPath ? `<span class="tcg-art" aria-hidden="true"${art}></span>` : ''}
    ${mechanicIcons}
    ${renderStateStrip(card)}
  </div>`;
}

/**
 * Render an enlarged card preview (for hover tooltips — Phase 2 wiring).
 * Shows full card details: rank, suit, title, points, status, abilities.
 * @param {object} card - Snapshot card
 * @returns {string} HTML
 */
export function renderTcgCardPreview(card) {
  if (!card) return '';
  if (card.faceDown) return renderTcgCardBack();

  const def = getCardDefinition(card.identity);
  const suit = getSuit(def.suit);
  const rank = getRankDisplay(def.rank);
  const points = card.pointValue ?? def.prValue ?? 0;
  const title = def.title ?? rankName(def.rank) ?? def.identity;
  const subtitle = def.subtitle ?? '';

  const classes = ['tcg-card', 'tcg-card-preview'];
  classes.push(`tcg-suit-${suit.id}`);
  classes.push(`tcg-rank-${def.rank}`);
  if (def.rank === 'J' || def.rank === 'Q' || def.rank === 'K' || def.rank === 'A') classes.push('face-card');
  if (def.rank === 'BJ' || def.rank === 'RJ') classes.push('joker');

  const style = `--card-accent:${suit.accent};--card-accent-2:${suit.accent2}`;
  const abilities = (def.abilities ?? []).slice(0, 4);
  const abilityHtml = abilities.length
    ? `<ul class="tcg-preview-abilities">${abilities.map(a => `<li><span class="tcg-preview-ability-icon" aria-hidden="true">${esc(a.icon ?? '◆')}</span><span class="tcg-preview-ability-title">${esc(a.title ?? '')}</span></li>`).join('')}</ul>`
    : '';

  return `<div class="${classes.join(' ')}" style="${style}" aria-label="Preview: ${esc(card.identity ?? 'unknown')}">
    <span class="tcg-rank" aria-hidden="true">${esc(rank)}</span>
    <span class="tcg-suit-glyph" aria-hidden="true">${esc(suit.symbol)}</span>
    <span class="tcg-preview-title">${esc(title)}</span>
    ${subtitle ? `<span class="tcg-preview-subtitle">${esc(subtitle)}</span>` : ''}
    <span class="tcg-points" aria-hidden="true">${points}</span>
    ${renderStateStrip(card)}
    ${abilityHtml}
  </div>`;
}

/**
 * Render an animated card back (privacy-safe — no card data).
 * Used for opponent hands and face-down swap bar slots.
 * @returns {string} HTML
 */
export function renderTcgCardBack(variant) {
  const cls = variant === 'mini' ? 'tcg-card-back mini' : 'tcg-card-back';
  return `<div class="${cls}" aria-hidden="true"></div>`;
}
