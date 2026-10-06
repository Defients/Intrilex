// ═══════════════════════════════════════════════════════════════
// card-reference.js — Card reference workspace renderer
//
// Renders the /cards route — a browsable gallery of all 54 canonical
// card faces with family filtering and ability summaries.
// ═══════════════════════════════════════════════════════════════

import { listAuthoritativeCards, getCardDefinition, getSuit, rankName, pointValue, CARD_FACE_REGISTRY_META } from '../card-face-data.js?v=e5382c028fd1';
import { renderCardFace } from '../card-face-renderer.js?v=e5382c028fd1';

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const FAMILIES = ['all', 'Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Joker'];

/**
 * Render the card reference page into the given container element.
 * @param {HTMLElement} container - The landing container element
 */
export function renderCardReference(container) {
  if (!container) return;
  const cards = listAuthoritativeCards();

  container.innerHTML = `
    <div class="landing-app card-reference-app">
      <a class="back-button" href="#/" aria-label="Back to landing">&larr; Back</a>
      <h1 class="card-reference-title">Card Reference</h1>
      <p class="card-reference-subtitle">
        ${CARD_FACE_REGISTRY_META.exactCards} canonical cards across
        ${CARD_FACE_REGISTRY_META.authoritativeFamilies.length} families.
        Rules v${CARD_FACE_REGISTRY_META.rulesVersion}.
      </p>

      <div class="card-reference-filters" role="tablist" aria-label="Filter by family">
        ${FAMILIES.map((f, i) =>
          `<button class="card-ref-filter${i === 0 ? ' active' : ''}" data-family="${esc(f)}" role="tab" aria-selected="${i === 0}">${esc(f === 'all' ? 'All' : f)}</button>`
        ).join('')}
      </div>

      <div class="card-reference-stats" data-testid="card-ref-stats">
        <span data-testid="card-ref-count">${cards.length}</span> cards
      </div>

      <div id="card-ref-gallery" class="card-ref-gallery" data-testid="card-ref-gallery">
        ${renderGalleryHTML(cards, 'all')}
      </div>

      <div id="card-ref-detail" class="card-ref-detail" data-testid="card-ref-detail" hidden>
        <button class="card-ref-detail-close" data-action="close-detail" aria-label="Close detail">&times;</button>
        <div id="card-ref-detail-content"></div>
      </div>
    </div>
  `;

  // Wire up family filter buttons
  const filterButtons = container.querySelectorAll('.card-ref-filter');
  const galleryEl = container.querySelector('#card-ref-gallery');
  const statsEl = container.querySelector('[data-testid="card-ref-count"]');

  for (const btn of filterButtons) {
    btn.addEventListener('click', () => {
      const family = btn.dataset.family;
      for (const b of filterButtons) {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', b === btn);
      }
      const filtered = family === 'all' ? cards : cards.filter(c => c.family === family);
      galleryEl.innerHTML = renderGalleryHTML(filtered, family);
      if (statsEl) statsEl.textContent = String(filtered.length);
    });
  }

  // Wire up card click → detail view
  galleryEl.addEventListener('click', (e) => {
    const cardBtn = e.target.closest('[data-card-identity]');
    if (!cardBtn) return;
    const identity = cardBtn.dataset.cardIdentity;
    showCardDetail(container, identity);
  });

  // Wire up detail close
  const detailEl = container.querySelector('#card-ref-detail');
  const closeBtn = container.querySelector('[data-action="close-detail"]');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      detailEl.hidden = true;
    });
  }
}

function renderGalleryHTML(cards, family) {
  const filtered = family === 'all' ? cards : cards.filter(c => c.family === family);
  return filtered.map(card => {
    const _suit = getSuit(card.suit);
    return `<button class="card-ref-item" data-card-identity="${esc(card.identity)}" aria-label="Inspect ${esc(card.identity)}">
      ${renderCardFace(card.identity, { view: 'board' })}
      <span class="card-ref-item-label">${esc(card.identity)}</span>
    </button>`;
  }).join('');
}

function showCardDetail(container, identity) {
  const card = getCardDefinition(identity);
  if (!card) return;
  const detailEl = container.querySelector('#card-ref-detail');
  const contentEl = container.querySelector('#card-ref-detail-content');
  if (!detailEl || !contentEl) return;

  const suit = getSuit(card.suit);
  const pv = pointValue(card.rank);

  // A-02: Build "When to Play" guidance from ability timing data.
  // This is educational — it helps new players understand when each ability
  // can be used, derived from the card's printed timing keywords.
  const whenToPlay = buildWhenToPlayGuidance(card);

  // A-02: Build scoring summary from PR/ER values
  const scoringSummary = buildScoringSummary(card, pv);

  contentEl.innerHTML = `
    <div class="card-ref-detail-header">
      <div class="card-ref-detail-face">${renderCardFace(identity, { view: 'board' })}</div>
      <div class="card-ref-detail-info">
        <h2>${esc(card.identity)}</h2>
        <dl class="card-ref-detail-meta">
          <dt>Rank</dt><dd>${esc(rankName(card.rank))}</dd>
          <dt>Suit</dt><dd>${esc(suit.name)}</dd>
          <dt>Family</dt><dd>${esc(card.family)}</dd>
          <dt>Point Value</dt><dd>${pv}</dd>
        </dl>
        ${scoringSummary ? `<div class="card-ref-scoring-summary" data-testid="card-ref-scoring">${scoringSummary}</div>` : ''}
      </div>
    </div>
    ${card.abilities && card.abilities.length > 0 ? `
      <div class="card-ref-detail-abilities">
        <h3>Abilities</h3>
        ${card.abilities.map(a => `
          <div class="card-ref-ability">
            <div class="card-ref-ability-header">
              <span class="card-ref-ability-name">${esc(a.title)}</span>
              ${a.timing ? `<span class="card-ref-ability-timing">${esc(a.timing)}</span>` : ''}
            </div>
            <p class="card-ref-ability-summary">${esc(a.summary ?? '')}</p>
            ${a.restrictions && a.restrictions.length > 0 ? `<ul class="card-ref-ability-restrictions">${a.restrictions.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
          </div>
        `).join('')}
      </div>
    ` : '<p class="card-ref-no-abilities">No special abilities.</p>'}
    ${whenToPlay ? `
      <div class="card-ref-detail-guidance" data-testid="card-ref-guidance">
        <h3>When to Play</h3>
        ${whenToPlay}
      </div>
    ` : ''}
    ${card.rules ? `<div class="card-ref-detail-rules"><h3>Rules</h3><ul>${(Array.isArray(card.rules) ? card.rules : [card.rules]).map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
    ${card.notes ? `<div class="card-ref-detail-notes"><h3>Notes</h3><ul>${(Array.isArray(card.notes) ? card.notes : [card.notes]).map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
    <div class="card-ref-detail-legality-note" data-testid="card-ref-legality-note">
      <strong>Legality:</strong> Printed abilities describe what a card <em>can</em> do. The engine authority determines what is <em>legal</em> in a specific game state. Some abilities may be restricted by phase, priority, timing, or board conditions.
    </div>
    <div class="card-ref-detail-cta">
      <a class="card-ref-cta-btn" href="#/play/academy" data-testid="card-ref-cta-academy">Learn in Academy →</a>
      <a class="card-ref-cta-btn secondary" href="#/dev" data-testid="card-ref-cta-play">Try in Free Play →</a>
    </div>
  `;
  detailEl.hidden = false;
}

/**
 * Build "When to Play" guidance from the card's ability timing keywords.
 * Maps timing keywords to player-friendly advice.
 * @param {object} card - Card definition
 * @returns {string} HTML string
 */
function buildWhenToPlayGuidance(card) {
  if (!card.abilities || card.abilities.length === 0) {
    // Number cards with no abilities — just score them
    if (card.prValue) {
      return `<p>Score this card into your Point Row for ${card.prValue} IR during your turn.</p>`;
    }
    return '';
  }

  const guidance = [];
  for (const ability of card.abilities) {
    const timing = ability.timing ?? '';
    const timingLower = timing.toLowerCase();
    let advice = '';
    if (timing.includes('Instant')) {
      advice = `Can be played as a response during the opponent's turn to counter a pending play.`;
    } else if (timing.includes('Interrupt')) {
      advice = `Can interrupt a pending effect play. Watch for the right moment to steal or redirect.`;
    } else if (timing.includes('Anchor')) {
      advice = `Play during your turn to place this card in your Enduring Row as an Anchor.`;
    } else if (timing.includes('Scoring')) {
      advice = `Triggers when the card is scored into your Point Row.`;
    } else if (timingLower.includes('multi-card')) {
      advice = `Requires combining with another card. Plan both cards before declaring.`;
    } else if (timing.includes('Super')) {
      advice = `A Super-tier play. Requires meeting recipe conditions and spending the card face-up.`;
    } else if (timing.includes('Quick')) {
      advice = `Can be played quickly during your turn for immediate effect.`;
    } else if (timing.includes('Passive')) {
      advice = `Always active while this card is in play — no action needed to trigger it.`;
    } else if (timing.includes('Effect')) {
      advice = `Play during your turn for its effect. Costs and targets apply.`;
    } else if (timing.includes('Action')) {
      advice = `Play during your turn as an action.`;
    } else {
      advice = `Play during your turn.`;
    }
    guidance.push(`<li><strong>${esc(ability.title)}:</strong> ${esc(advice)}</li>`);
  }
  return `<ul class="card-ref-guidance-list">${guidance.join('')}</ul>`;
}

/**
 * Build a brief scoring summary from PR/ER values.
 * @param {object} card - Card definition
 * @param {number} pv - Point value
 * @returns {string} HTML string
 */
function buildScoringSummary(card, _pv) {
  const parts = [];
  if (card.prValue != null) {
    parts.push(`<span class="card-ref-scoring-pr">PR: ${card.prValue} IR</span>`);
  }
  if (card.erValue != null) {
    parts.push(`<span class="card-ref-scoring-er">ER Anchor: ${card.erValue}</span>`);
  }
  if (parts.length === 0) return '';
  return parts.join(' · ');
}
