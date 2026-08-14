// ═══════════════════════════════════════════════════════════════
// achievement-ui.js — Achievement gallery workspace
// Renders the full achievement gallery at #/achievements
// Consumes the canonical catalog — no duplicate definitions.
// ═══════════════════════════════════════════════════════════════

import { getAchievementRuntime } from './achievement-runtime.js?v=e2bd7e8507fa';
import { getCatalog, RARITY, CATEGORY, RARITY_SYMBOL } from '../../achievements/index.mjs?v=e2bd7e8507fa';

const CATEGORY_LABELS = {
  FIRST_STEPS: 'First Steps',
  CORE_SYSTEMS: 'Core Systems',
  STACK_COUNTERPLAY: 'Stack & Counterplay',
  CARD_MASTERY: 'Card Mastery',
  TACTICAL_WINS: 'Tactical Wins',
  PLAYSTYLE: 'Playstyle',
  PROGRESSION: 'Progression',
};

const RARITY_COLORS = {
  COMMON: '#8a9ba8',
  CLEVER: '#00c8dc',
  RARE: '#a020f0',
  INTRILEX: '#ff4080',
};

/**
 * Render the Achievements workspace.
 * @param {HTMLElement} container
 * @returns {Promise<void>}
 */
export async function renderAchievementsWorkspace(container) {
  const runtime = getAchievementRuntime();
  await runtime.init();

  const summary = runtime.getSummary();
  const catalog = getCatalog();

  // State for filtering
  let currentFilter = 'all';
  let currentCategory = 'all';

  const render = () => {
    const galleryData = runtime.getGalleryData({
      filter: currentFilter,
      category: currentCategory !== 'all' ? currentCategory : undefined,
    });

    container.innerHTML = `
      <div class="achievements-workspace">
        <div class="achievements-header">
          <h1>Achievements</h1>
          <div class="achievements-summary">
            <span class="ach-stat"><b>${summary.earned}</b> / ${summary.total} Unlocked</span>
            <span class="ach-stat"><b class="ach-ap">${summary.ap}</b> / ${summary.maxAp} AP</span>
          </div>
        </div>

        <div class="achievements-filters">
          ${renderFilterButtons(currentFilter)}
          <div class="achievements-filter-divider"></div>
          ${renderCategoryButtons(currentCategory)}
        </div>

        <div class="achievements-grid">
          ${galleryData.map(card => renderCard(card)).join('')}
        </div>
      </div>
    `;
  };

  // Use event delegation — single listener on container handles all filter clicks.
  // This avoids re-binding listeners on every render() call.
  container.addEventListener('click', (e) => {
    const filterBtn = e.target.closest('[data-filter]');
    if (filterBtn) {
      currentFilter = filterBtn.dataset.filter;
      render();
      return;
    }
    const catBtn = e.target.closest('[data-category-filter]');
    if (catBtn) {
      currentCategory = catBtn.dataset.categoryFilter;
      render();
    }
  });

  render();
}

/**
 * Render filter buttons (All / Earned / Locked).
 * @returns {string}
 */
function renderFilterButtons(activeFilter) {
  const filters = [
    { id: 'all', label: 'All' },
    { id: 'earned', label: 'Earned' },
    { id: 'locked', label: 'Locked' },
  ];
  return filters.map(f => {
    const isActive = f.id === activeFilter;
    return `<button data-filter="${f.id}" class="achievement-filter-btn${isActive ? ' active' : ''}">${f.label}</button>`;
  }).join('');
}

/**
 * Render category filter buttons.
 * @returns {string}
 */
function renderCategoryButtons(activeCategory) {
  const categories = [
    { id: 'all', label: 'All Categories' },
    ...Object.values(CATEGORY).map(c => ({ id: c, label: CATEGORY_LABELS[c] ?? c })),
  ];
  return categories.map(c => {
    const isActive = c.id === activeCategory;
    return `<button data-category-filter="${c.id}" class="achievement-category-btn${isActive ? ' active' : ''}">${c.label}</button>`;
  }).join('');
}

/**
 * Render a single achievement card.
 * @param {object} card - Gallery card data
 * @returns {string}
 */
function renderCard(card) {
  const color = RARITY_COLORS[card.rarity] ?? '#8a9ba8';
  const symbol = card.raritySymbol ?? '●';
  const earnedClass = card.earned ? 'achievement-card-earned' : 'achievement-card-locked';

  // Progress bar for measurable achievements
  let progressHtml = '';
  if (card.progress && !card.earned) {
    const pct = card.progress.target ? Math.min(100, (card.progress.current / card.progress.target) * 100) : 0;
    progressHtml = `
      <div class="achievement-progress">
        <div class="achievement-progress-label">
          <span>${card.progress.current} / ${card.progress.target}</span>
        </div>
        <div class="achievement-progress-bar">
          <div class="achievement-progress-fill" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>
    `;
  }

  // Earned date
  let earnedDateHtml = '';
  if (card.earned && card.earnedAt) {
    try {
      const date = new Date(card.earnedAt).toLocaleDateString();
      earnedDateHtml = `<div class="achievement-earned-date">Earned ${date}</div>`;
    } catch { /* ignore date parse errors */ }
  }

  return `
    <div class="achievement-card ${earnedClass}" style="border-color:${card.earned ? color : 'rgba(255,255,255,0.08)'}">
      <div class="achievement-card-inner">
        <div class="achievement-card-symbol" style="color:${color}" aria-hidden="true">${symbol}</div>
        <div class="achievement-card-body">
          <div class="achievement-card-name" style="color:${card.earned ? '#e0f0ff' : '#8a9ba8'}">${escapeHtml(card.name)}</div>
          <div class="achievement-card-desc">${escapeHtml(card.description)}</div>
          <div class="achievement-card-meta">
            <span class="achievement-card-rarity" style="color:${color}">${card.rarity}</span>
            <span class="achievement-card-ap" style="color:${color}">+${card.achievementPoints} AP</span>
            <span class="achievement-card-category">${CATEGORY_LABELS[card.category] ?? card.category}</span>
          </div>
          ${progressHtml}
          ${earnedDateHtml}
        </div>
      </div>
    </div>
  `;
}

/**
 * Escape HTML.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
