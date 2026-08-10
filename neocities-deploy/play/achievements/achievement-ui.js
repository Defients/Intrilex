// ═══════════════════════════════════════════════════════════════
// achievement-ui.js — Achievement gallery workspace
// Renders the full achievement gallery at #/achievements
// Consumes the canonical catalog — no duplicate definitions.
// ═══════════════════════════════════════════════════════════════

import { getAchievementRuntime } from './achievement-runtime.js';
import { getCatalog, RARITY, CATEGORY, RARITY_SYMBOL } from '../../achievements/index.mjs';

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
      <div class="achievements-workspace" style="max-width:1200px;margin:0 auto;padding:20px">
        <div class="achievements-header" style="margin-bottom:24px">
          <h1 style="font-size:28px;font-weight:300;letter-spacing:2px;text-transform:uppercase;color:#e0f0ff;margin:0 0 8px 0">Achievements</h1>
          <div class="achievements-summary" style="display:flex;gap:24px;font-size:14px;color:#8a9ba8">
            <span><strong style="color:#e0f0ff">${summary.earned}</strong> / ${summary.total} Unlocked</span>
            <span><strong style="color:#00c8dc">${summary.ap}</strong> / ${summary.maxAp} AP</span>
          </div>
        </div>

        <div class="achievements-filters" style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
          ${renderFilterButtons(currentFilter)}
          <div style="width:1px;background:rgba(255,255,255,0.1);margin:0 4px"></div>
          ${renderCategoryButtons(currentCategory)}
        </div>

        <div class="achievements-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px">
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
    const activeStyle = isActive ? 'background:#5ad7e8;color:#05080e;border-color:#5ad7e8;font-weight:600' : '';
    return `<button data-filter="${f.id}" class="achievement-filter-btn${isActive ? ' active' : ''}" style="padding:6px 14px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:#8a9ba8;border-radius:4px;cursor:pointer;font-size:12px;text-transform:uppercase;letter-spacing:1px;${activeStyle}">${f.label}</button>`;
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
    const activeStyle = isActive ? 'background:#5ad7e8;color:#05080e;border-color:#5ad7e8;font-weight:600' : '';
    return `<button data-category-filter="${c.id}" class="achievement-category-btn${isActive ? ' active' : ''}" style="padding:6px 14px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:#8a9ba8;border-radius:4px;cursor:pointer;font-size:12px;${activeStyle}">${c.label}</button>`;
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
      <div class="achievement-progress" style="margin-top:8px">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#8a9ba8;margin-bottom:4px">
          <span>${card.progress.current} / ${card.progress.target}</span>
        </div>
        <div style="height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${color};transition:width 0.3s"></div>
        </div>
      </div>
    `;
  }

  // Earned date
  let earnedDateHtml = '';
  if (card.earned && card.earnedAt) {
    try {
      const date = new Date(card.earnedAt).toLocaleDateString();
      earnedDateHtml = `<div style="font-size:10px;color:#8a9ba8;margin-top:4px">Earned ${date}</div>`;
    } catch { /* ignore date parse errors */ }
  }

  return `
    <div class="achievement-card ${earnedClass}" style="
      padding:16px;border:1px solid ${card.earned ? color : 'rgba(255,255,255,0.08)'};
      border-radius:8px;background:rgba(10,14,20,0.6);transition:border-color 0.2s
    ">
      <div style="display:flex;align-items:flex-start;gap:12px">
        <div style="font-size:28px;color:${color};line-height:1;flex-shrink:0" aria-hidden="true">${symbol}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:14px;color:${card.earned ? '#e0f0ff' : '#8a9ba8'};margin-bottom:4px">${escapeHtml(card.name)}</div>
          <div style="font-size:12px;color:#8a9ba8;line-height:1.4;margin-bottom:8px">${escapeHtml(card.description)}</div>
          <div style="display:flex;align-items:center;gap:8px;font-size:11px">
            <span style="color:${color};text-transform:uppercase;letter-spacing:1px">${card.rarity}</span>
            <span style="color:${color}">+${card.achievementPoints} AP</span>
            <span style="color:#5a6a78;margin-left:auto">${CATEGORY_LABELS[card.category] ?? card.category}</span>
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
