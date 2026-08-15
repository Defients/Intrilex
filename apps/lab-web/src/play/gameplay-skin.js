// ═══════════════════════════════════════════════════════════════
// gameplay-skin.js — Gameplay appearance skin system.
//
// Centralized theme state for the Intrilex gameplay UI. Four skins:
//   light · dark (canonical baseline) · cosmotech · corrupture
//
// Design constraints (see MASTER PROMPT):
//   - Dark is the existing/default appearance; never drift.
//   - Unknown/corrupt stored values fall back to 'dark'.
//   - Persistence is synchronous (localStorage) so the first paint
//     already carries the correct skin — no FOUC.
//   - Skin values are validated before becoming DOM attributes.
//
// This module is environment-safe: in Node/test contexts where
// `localStorage` is absent, it degrades to the in-memory default.
// ═══════════════════════════════════════════════════════════════

/** @typedef {'light'|'dark'|'cosmotech'|'corrupture'} GameplaySkin */

/**
 * Canonical, exhaustive skin enumeration. Used for validation and
 * for the header selector. Order is the display order in the menu.
 * @type {readonly GameplaySkin[]}
 */
export const GAMEPLAY_SKINS = Object.freeze(['light', 'dark', 'cosmotech', 'corrupture']);

/**
 * Display labels (with trademark glyphs where the full name is shown).
 * Internal identifiers remain simple lowercase strings.
 * @type {Record<GameplaySkin, string>}
 */
export const GAMEPLAY_SKIN_LABELS = Object.freeze({
  light: 'Light',
  dark: 'Dark',
  cosmotech: 'CosmoTech\u2122',
  corrupture: 'Corrupture\u2122',
});

/**
 * Compact single-glyph icons for the toolbar trigger and menu rows.
 * Chosen to read at 12-14px in the existing icon-button toolbar.
 * @type {Record<GameplaySkin, string>}
 */
export const GAMEPLAY_SKIN_ICONS = Object.freeze({
  light: '\u2600',       // ☀ sun
  dark: '\u263E',        // ☾ moon
  cosmotech: '\u2726',   // ✦ four-pointed star (celestial)
  corrupture: '\u25C8',  // ◈ diamond with fractured inner dot
});

/** Canonical default when no valid preference is stored. */
export const DEFAULT_GAMEPLAY_SKIN = 'dark';

/** localStorage key — dedicated to gameplay skin (not coupled to site-wide settings). */
const STORAGE_KEY = 'intrilex:gameplaySkin';

const _validSet = new Set(GAMEPLAY_SKINS);

/**
 * Validate and normalize an arbitrary value into a known skin.
 * Unknown/corrupt/empty values fall back to the canonical default.
 *
 * @param {unknown} value
 * @returns {GameplaySkin}
 */
export function normalizeSkin(value) {
  return typeof value === 'string' && _validSet.has(value) ? value : DEFAULT_GAMEPLAY_SKIN;
}

/**
 * Read the persisted skin synchronously. Used at render time so the
 * very first paint of the gameplay shell already carries the correct
 * `data-gameplay-skin` attribute (no flash-of-wrong-theme).
 *
 * @returns {GameplaySkin}
 */
export function getGameplaySkin() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return normalizeSkin(raw);
  } catch {
    return DEFAULT_GAMEPLAY_SKIN;
  }
}

/**
 * Persist a skin choice. Validates first; invalid values are rejected
 * (returns false) so arbitrary strings never reach the DOM.
 *
 * @param {GameplaySkin} skin
 * @returns {boolean} true if persisted, false if rejected
 */
export function setGameplaySkin(skin) {
  const normalized = normalizeSkin(skin);
  if (!_validSet.has(skin)) return false; // reject unknown values outright
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, normalized);
    return true;
  } catch {
    return false;
  }
}

/**
 * Apply a skin to a DOM element by setting `data-gameplay-skin`.
 * The attribute is the single source of truth consumed by CSS.
 *
 * @param {Element} el
 * @param {GameplaySkin} [skin] — defaults to the persisted value
 * @returns {GameplaySkin} the skin actually applied
 */
export function applyGameplaySkin(el, skin = getGameplaySkin()) {
  const normalized = normalizeSkin(skin);
  if (el && el.setAttribute) el.setAttribute('data-gameplay-skin', normalized);
  return normalized;
}

/**
 * Whether a skin is the canonical default. Useful for tests and for
 * skipping override work in the renderer.
 * @param {GameplaySkin} skin
 * @returns {boolean}
 */
export function isDefaultSkin(skin) {
  return normalizeSkin(skin) === DEFAULT_GAMEPLAY_SKIN;
}
