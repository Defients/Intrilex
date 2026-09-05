// ═══════════════════════════════════════════════════════════════
// card-reference.js — Card reference workspace renderer
//
// Renders the /cards route — a browsable gallery of all 54 canonical
// card faces with family filtering and ability summaries.
// ═══════════════════════════════════════════════════════════════

import { listAuthoritativeCards, getCardDefinition, getSuit, rankName, pointValue, CARD_FACE_REGISTRY_META } from '../card-face-data.js';
import { renderCardFace } from '../card-face-renderer.js';

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
    const suit = getSuit(card.suit);
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
      </div>
    </div>
    ${card.abilities && card.abilities.length > 0 ? `
      <div class="card-ref-detail-abilities">
        <h3>Abilities</h3>
        ${card.abilities.map(a => `
          <div class="card-ref-ability">
            <div class="card-ref-ability-header">
              <span class="card-ref-ability-name">${esc(a.name)}</span>
              ${a.timing ? `<span class="card-ref-ability-timing">${esc(a.timing)}</span>` : ''}
            </div>
            <p class="card-ref-ability-summary">${esc(a.summary ?? '')}</p>
            ${a.restrictions ? `<p class="card-ref-ability-restrictions">Restrictions: ${esc(a.restrictions)}</p>` : ''}
          </div>
        `).join('')}
      </div>
    ` : '<p class="card-ref-no-abilities">No special abilities.</p>'}
    ${card.rules ? `<div class="card-ref-detail-rules"><h3>Rules</h3><p>${esc(card.rules)}</p></div>` : ''}
    ${card.notes ? `<div class="card-ref-detail-notes"><h3>Notes</h3><p>${esc(card.notes)}</p></div>` : ''}
  `;
  detailEl.hidden = false;
}
