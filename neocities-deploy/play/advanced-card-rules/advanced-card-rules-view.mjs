// ═══════════════════════════════════════════════════════════════
// advanced-card-rules-view.mjs — Advanced Card Rules View renderer.
//
// Pure function: CardRulesDefinition + current-match context → HTML.
// Renders the player-facing card codex / rules dossier modal.
//
// This is NOT an enlarged card image and NOT a longer tooltip.
// It is the exhaustive mechanical reference: canonical capabilities
// (static rules data) + a separate CURRENT MATCH section (authoritative
// legal-action data from the engine).
//
// Hidden-info protection: the caller MUST refuse to open the view for
// any card the player is not authorized to inspect. The renderer itself
// never receives concealed information.
// ═══════════════════════════════════════════════════════════════

import { getSuit, getCardDefinition } from '../../card-face-data.js';
import { getCardArtBoardPath } from '../../card-art-registry.js';
import { getCardRulesDefinition } from './card-rules-data.mjs';

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * @typedef {Object} CurrentMatchContext
 * @property {string} cardId
 * @property {string} zone
 * @property {string} [actor]
 * @property {number} [stateRevision]
 * @property {Array<{ optionId:string, displayLabel:string, form:string, timingClass:string, isResponse:boolean, isSuper:boolean }>} [legalActions]
 * @property {number} [legalTargetCount]
 * @property {boolean} [available]
 */

/**
 * Render a small card identity chip (rank, suit accent, points, art thumb).
 * @param {object} def - card definition
 * @returns {string}
 */
function renderIdentityChip(def) {
  const suit = getSuit(def.suit);
  const style = `--card-accent:${suit.accent};--card-accent-2:${suit.accent2}`;
  let artPath = def.art;
  try { if (def.authority === 'canonical') artPath = getCardArtBoardPath(def.identity); } catch { /* keep def.art */ }
  const artBg = artPath ? ` style="background-image:url('${esc(artPath)}')"` : '';
  const suitGlyph = def.suit ? `<span class="acr-suit" aria-hidden="true">${esc(def.suit)}</span>` : '';
  return `<div class="acr-identity-chip tcg-suit-${suit.id}" style="${style}">
    <div class="acr-chip-art"${artBg} aria-hidden="true"></div>
    <div class="acr-chip-meta">
      <span class="acr-chip-rank">${esc(def.rank)}${suitGlyph}</span>
      <span class="acr-chip-name">${esc(def.name)}</span>
      <span class="acr-chip-points">Points: ${esc(def.points ?? 0)}</span>
    </div>
  </div>`;
}

/**
 * Render a section only if it has content. Collapsible for dense ranks.
 * @param {string} id
 * @param {string} title
 * @param {string} innerHtml
 * @param {boolean} [collapsible=false]
 * @returns {string}
 */
function section(id, title, innerHtml, collapsible = false) {
  if (!innerHtml || !innerHtml.trim()) return '';
  const tag = collapsible ? 'details' : 'section';
  const header = collapsible
    ? `<summary class="acr-section-header"><h3>${esc(title)}</h3><span class="acr-chevron" aria-hidden="true">▸</span></summary>`
    : `<div class="acr-section-header"><h3>${esc(title)}</h3></div>`;
  return `<${tag} class="acr-section acr-section-${id}" data-acr-section="${id}">
    ${header}
    <div class="acr-section-body">${innerHtml}</div>
  </${tag}>`;
}

/**
 * Render the canonical abilities (PLAY MODES / TIMING / RESOLUTION) from
 * the shared card-face-data abilities. This is the single canonical
 * source for per-mode mechanical text — the same data the lightweight
 * tooltips derive their `summary` from.
 * @param {object[]} abilities
 * @returns {string}
 */
function renderPlayModes(abilities) {
  if (!abilities?.length) return '';
  const items = abilities.map(a => {
    const restrictions = (a.restrictions?.length)
      ? `<ul class="acr-restrictions">${a.restrictions.map(r => `<li>${esc(r)}</li>`).join('')}</ul>`
      : '';
    return `<li class="acr-mode">
      <span class="acr-mode-icon" aria-hidden="true">${esc(a.icon ?? '◆')}</span>
      <div class="acr-mode-body">
        <span class="acr-mode-title">${esc(a.title)} <span class="acr-mode-timing">${esc(a.timing ?? '')}</span></span>
        <p class="acr-mode-full">${esc(a.full ?? a.summary ?? '')}</p>
        ${restrictions}
      </div>
    </li>`;
  }).join('');
  return `<ol class="acr-modes">${items}</ol>`;
}

function renderList(items) {
  if (!items?.length) return '';
  return `<ul class="acr-bullets">${items.map(i => `<li>${esc(typeof i === 'string' ? i : i.text ?? '')}</li>`).join('')}</ul>`;
}

function renderDestinations(dests) {
  if (!dests?.length) return '';
  const rows = dests.map(d => `<tr><th scope="row">${esc(d.scenario)}</th><td>${esc(d.destination)}</td></tr>`).join('');
  return `<table class="acr-destinations"><tbody>${rows}</tbody></table>`;
}

function renderCombinations(combos) {
  if (!combos?.length) return '';
  return combos.map(c => `<div class="acr-combo"><span class="acr-combo-name">${esc(c.name)}</span><p>${esc(c.description)}</p></div>`).join('');
}

function renderRulings(rulings) {
  if (!rulings?.length) return '';
  const items = rulings.map(r => {
    const tags = (r.tags?.length) ? `<span class="acr-ruling-tags">${r.tags.map(t => `<span class="acr-tag">${esc(t)}</span>`).join('')}</span>` : '';
    const q = r.question ? `<p class="acr-ruling-q">Q: ${esc(r.question)}</p>` : '';
    const src = r.canonSource ? `<span class="acr-ruling-src">${esc(r.canonSource)}</span>` : '';
    return `<li class="acr-ruling">
      <span class="acr-ruling-title">${esc(r.title)}</span>
      ${q}
      <p class="acr-ruling-text">${esc(r.ruling)}</p>
      ${tags}${src}
    </li>`;
  }).join('');
  return `<ol class="acr-rulings">${items}</ol>`;
}

function renderExamples(examples) {
  if (!examples?.length) return '';
  const items = examples.map(e => {
    const mark = e.legal ? '✓' : '✕';
    const cls = e.legal ? 'acr-example-legal' : 'acr-example-illegal';
    const label = e.legal ? 'LEGAL' : 'ILLEGAL';
    return `<li class="acr-example ${cls}">
      <span class="acr-example-mark" aria-hidden="true">${mark}</span>
      <span class="acr-example-label">${label}</span>
      <p>${esc(e.text)}</p>
    </li>`;
  }).join('');
  return `<ol class="acr-examples">${items}</ol>`;
}

function renderRelatedRules(refs) {
  if (!refs?.length) return '';
  return `<ul class="acr-related">${refs.map(r => `<li><span class="acr-related-label">${esc(r.label)}</span><span class="acr-related-ref">${esc(r.ref)}</span></li>`).join('')}</ul>`;
}

/**
 * Render the CURRENT MATCH section from authoritative legal-action data.
 * This is explicitly separate from canonical capabilities and only shows
 * facts derivable from the engine action contract.
 * @param {CurrentMatchContext} ctx
 * @returns {string}
 */
function renderCurrentMatch(ctx) {
  if (!ctx) return '';
  const actions = ctx.legalActions ?? [];
  const lines = [];
  if (ctx.zone) lines.push(`<span class="acr-cm-field"><b>Zone:</b> ${esc(ctx.zone)}</span>`);
  if (ctx.actor) lines.push(`<span class="acr-cm-field"><b>Actor:</b> ${esc(ctx.actor)}</span>`);
  if (typeof ctx.stateRevision === 'number') lines.push(`<span class="acr-cm-field"><b>State revision:</b> ${esc(ctx.stateRevision)}</span>`);

  if (actions.length === 0) {
    lines.push(`<p class="acr-cm-unavailable">Unavailable in the current state.</p>`);
  } else {
    const actionItems = actions.map(a => {
      const mark = '✓';
      const tag = a.isSuper ? 'Super' : a.isResponse ? 'Response' : a.form;
      return `<li class="acr-cm-action"><span class="acr-cm-mark" aria-hidden="true">${mark}</span><span class="acr-cm-label">${esc(a.displayLabel)}</span><span class="acr-cm-tag">${esc(tag)}</span></li>`;
    }).join('');
    lines.push(`<ul class="acr-cm-actions">${actionItems}</ul>`);
    if (typeof ctx.legalTargetCount === 'number') {
      lines.push(`<p class="acr-cm-targets">Legal targets: ${esc(ctx.legalTargetCount)}</p>`);
    }
  }
  return `<div class="acr-current-match" data-acr-current-match>
    ${lines.join('')}
    <p class="acr-cm-provenance">Derived from the authoritative legal-action contract. Engine authority decides current legality.</p>
  </div>`;
}

/**
 * Build a quick tag filter for complex cards (directive §12).
 * @param {object} def
 * @returns {string}
 */
function renderTagFilter(def) {
  const allTags = new Set();
  for (const r of def.rulings ?? []) for (const t of r.tags ?? []) allTags.add(t);
  if (allTags.size <= 2) return ''; // only for genuinely complex dossiers
  const chips = [...allTags].map(t => `<button class="acr-filter-chip" data-acr-filter="${esc(t)}" aria-pressed="false">${esc(t)}</button>`).join('');
  return `<div class="acr-filter-bar" role="group" aria-label="Filter rulings by tag">${chips}</div>`;
}

/**
 * Render the full Advanced Card Rules View body.
 *
 * @param {string} identity
 * @param {{ currentMatch?: CurrentMatchContext }} [options]
 * @returns {string}
 */
export function renderAdvancedCardRulesView(identity, options = {}) {
  const def = getCardDefinition(identity);
  if (!def) return '';
  const rules = getCardRulesDefinition(identity);
  const suit = getSuit(def.suit);

  const isComplex = (rules.rulings?.length ?? 0) + (rules.generatedRecursive?.length ?? 0) >= 3;

  const identityChip = renderIdentityChip(def);
  const overview = section('overview', 'Overview', rules.overview ? `<p class="acr-overview">${esc(rules.overview)}</p>` : '');
  const points = section('points', 'Points', `<p>${esc(def.points ?? 0)} Points when scored into PR.</p>`);
  const playModes = section('modes', 'Play Modes · Timing · Resolution', renderPlayModes(rules.abilities), isComplex);
  const destinations = section('destinations', 'Resolution & Destinations', renderDestinations(rules.destinations));
  const combinations = section('combinations', 'Combinations & Generated Plays', renderCombinations(rules.combinations));
  const generated = section('generated', 'Generated / Recursive Behavior', renderList(rules.generatedRecursive));
  const persistent = section('persistent', 'Persistent / Global-State Interactions', renderList(rules.persistentState));
  const tagFilter = renderTagFilter(rules);
  const rulings = section('rulings', 'Strange Cases & Official Rulings', tagFilter + renderRulings(rules.rulings), isComplex);
  const examples = section('examples', 'Legal / Illegal Examples', renderExamples(rules.examples));
  const currentMatch = section('current', 'Current Match', renderCurrentMatch(options.currentMatch));
  const related = section('related', 'Related Rules', renderRelatedRules(rules.relatedRules));

  const notes = (rules.notes?.length) ? section('notes', 'Notes', renderList(rules.notes)) : '';

  return `<div class="acr-view tcg-suit-${suit.id}" data-acr-view="${esc(identity)}" role="document" aria-label="Advanced card details for ${esc(identity)}">
    <div class="acr-header">
      ${identityChip}
      <div class="acr-header-meta">
        <p class="acr-eyebrow">ADVANCED CARD DETAILS</p>
        <p class="acr-subtitle">${esc(rules.subtitle ?? '')}</p>
        <p class="acr-motto">${esc(rules.motto ?? '')}</p>
        ${(rules.badges?.length) ? `<div class="acr-badges">${rules.badges.map(b => `<span class="acr-badge">${esc(b)}</span>`).join('')}</div>` : ''}
      </div>
    </div>
    <div class="acr-body">
      ${overview}
      ${points}
      ${playModes}
      ${destinations}
      ${combinations}
      ${generated}
      ${persistent}
      ${rulings}
      ${examples}
      ${currentMatch}
      ${related}
      ${notes}
    </div>
  </div>`;
}
