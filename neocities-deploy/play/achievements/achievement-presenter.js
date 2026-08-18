// ═══════════════════════════════════════════════════════════════
// achievement-presenter.js — Unlock notifications and terminal summary
// Handles toast queueing, display, and match-terminal achievement lists.
// Respects reduced-motion, aria-live, and mute settings.
// ═══════════════════════════════════════════════════════════════

import { getDefinition, RARITY_SYMBOL, AP_BY_RARITY } from '../../achievements/index.mjs?v=73653ac8207b';

/**
 * AchievementPresenter manages the unlock toast notification queue.
 */
export class AchievementPresenter {
  constructor() {
    this._queue = [];
    this._activeToast = null;
    this._container = null;
    this._displayedFactIds = new Set(); // Prevent replay after refresh/reconnect
  }

  /**
   * Initialize the toast container in the DOM.
   */
  _ensureContainer() {
    if (this._container && document.body.contains(this._container)) return this._container;
    if (typeof document === 'undefined') return null;
    this._container = document.createElement('div');
    this._container.className = 'achievement-toast-container';
    this._container.setAttribute('aria-live', 'polite');
    this._container.setAttribute('role', 'status');
    this._container.style.cssText = [
      'position:fixed', 'top:20px', 'right:20px', 'z-index:10000',
      'pointer-events:none', 'display:flex', 'flex-direction:column', 'gap:8px',
      'max-width:360px',
    ].join(';');
    document.body.appendChild(this._container);
    return this._container;
  }

  /**
   * Queue unlock notifications for display.
   * @param {object[]} unlocks - Array of UnlockResult objects
   */
  queueUnlocks(unlocks) {
    if (!unlocks || unlocks.length === 0) return;
    for (const unlock of unlocks) {
      // Prevent duplicate display (idempotency for reconnect/refresh)
      const displayKey = `${unlock.achievementId}:${unlock.matchId ?? ''}`;
      if (this._displayedFactIds.has(displayKey)) continue;
      this._displayedFactIds.add(displayKey);
      this._queue.push(unlock);
    }
    // Cap the dedup set to prevent unbounded growth across many matches
    if (this._displayedFactIds.size > 200) {
      const entries = [...this._displayedFactIds];
      this._displayedFactIds = new Set(entries.slice(-100));
    }
    this._processQueue();
  }

  /**
   * Process the toast queue.
   */
  _processQueue() {
    if (this._activeToast || this._queue.length === 0) return;
    const container = this._ensureContainer();
    if (!container) return;

    const unlock = this._queue.shift();
    const def = getDefinition(unlock.achievementId);
    if (!def) { this._processQueue(); return; }

    const toast = this._createToast(def, unlock);
    container.appendChild(toast);
    this._activeToast = toast;

    // Auto-dismiss after 4 seconds (never requires dismissal)
    const duration = 4000;
    const reducedMotion = typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    const timeoutId = setTimeout(() => {
      if (reducedMotion) {
        toast.remove();
      } else {
        toast.style.transition = 'opacity 0.3s, transform 0.3s';
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(() => toast.remove(), 300);
      }
      this._activeToast = null;
      this._activeToastTimeout = null;
      this._processQueue();
    }, duration);
    this._activeToastTimeout = timeoutId;
  }

  /**
   * Create a toast element for an unlock.
   * @param {object} def - Achievement definition
   * @param {object} unlock - Unlock result
   * @returns {HTMLElement}
   */
  _createToast(def, unlock) {
    const toast = document.createElement('div');
    toast.className = `achievement-toast achievement-rarity-${def.rarity.toLowerCase()}`;
    toast.style.cssText = [
      'pointer-events:auto', 'padding:12px 16px', 'border-radius:8px',
      'background:rgba(10,14,20,0.95)', 'border:1px solid rgba(0,200,220,0.3)',
      'color:#e0f0ff', 'font-family:inherit', 'font-size:13px',
      'box-shadow:0 4px 16px rgba(0,0,0,0.4)', 'cursor:pointer',
      'display:flex', 'align-items:center', 'gap:10px',
    ].join(';');

    const rarityColor = {
      COMMON: '#8a9ba8',
      CLEVER: '#00c8dc',
      RARE: '#a020f0',
      INTRILEX: '#ff4080',
    }[def.rarity] ?? '#8a9ba8';

    const symbol = RARITY_SYMBOL[def.rarity] ?? '●';

    toast.innerHTML = [
      `<div style="font-size:24px;color:${rarityColor};line-height:1" aria-hidden="true">${symbol}</div>`,
      `<div style="flex:1">`,
      `<div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:${rarityColor};margin-bottom:2px">Achievement Unlocked</div>`,
      `<div style="font-weight:600;font-size:14px;margin-bottom:2px">${this._escapeHtml(def.name)}</div>`,
      `<div style="font-size:11px;color:#8a9ba8">${this._escapeHtml(def.description)}</div>`,
      `<div style="font-size:11px;color:${rarityColor};margin-top:4px">+${def.achievementPoints} AP</div>`,
      `</div>`,
    ].join('');

    // Click to dismiss
    toast.addEventListener('click', () => {
      if (this._activeToastTimeout) {
        clearTimeout(this._activeToastTimeout);
        this._activeToastTimeout = null;
      }
      toast.remove();
      this._activeToast = null;
      this._processQueue();
    });

    return toast;
  }

  /**
   * Escape HTML to prevent XSS.
   * @param {string} text
   * @returns {string}
   */
  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Build the terminal match summary HTML for newly earned achievements.
   * @param {object[]} unlocks - Unlocks from this match
   * @returns {string} HTML string for terminal display
   */
  buildTerminalSummaryHtml(unlocks) {
    if (!unlocks || unlocks.length === 0) return '';
    const items = unlocks.map(unlock => {
      const def = getDefinition(unlock.achievementId);
      if (!def) return '';
      const symbol = RARITY_SYMBOL[def.rarity] ?? '●';
      const rarityColor = {
        COMMON: '#8a9ba8',
        CLEVER: '#00c8dc',
        RARE: '#a020f0',
        INTRILEX: '#ff4080',
      }[def.rarity] ?? '#8a9ba8';
      return `<div class="terminal-achievement-item" style="display:flex;align-items:center;gap:8px;padding:4px 0">` +
        `<span style="color:${rarityColor};font-size:16px" aria-hidden="true">${symbol}</span>` +
        `<span style="font-weight:600">${this._escapeHtml(def.name)}</span>` +
        `<span style="color:${rarityColor};font-size:11px;margin-left:auto">+${def.achievementPoints} AP</span>` +
        `</div>`;
    }).filter(Boolean);

    if (items.length === 0) return '';

    const totalAP = unlocks.reduce((sum, u) => {
      const def = getDefinition(u.achievementId);
      return sum + (def?.achievementPoints ?? 0);
    }, 0);

    return `<div class="terminal-achievements-section" style="margin-top:16px;padding:12px;border:1px solid rgba(0,200,220,0.2);border-radius:8px">` +
      `<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#00c8dc;margin-bottom:8px">Achievements Earned</div>` +
      items.join('') +
      `<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1);font-size:12px;color:#00c8dc">+${totalAP} AP</div>` +
      `</div>`;
  }
}

// ── Singleton ───────────────────────────────────────────────────

let _presenter = null;

/**
 * Get the singleton AchievementPresenter instance.
 * @returns {AchievementPresenter}
 */
export function getAchievementPresenter() {
  if (!_presenter) {
    _presenter = new AchievementPresenter();
  }
  return _presenter;
}
