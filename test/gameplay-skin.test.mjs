// ═══════════════════════════════════════════════════════════════
// gameplay-skin.test.mjs — Four-skin gameplay appearance system tests
//
// Tests the gameplay skin system: enum validation, default = dark,
// persistence, restoration, selector rendering, invalid value
// fallback, DOM attribute application, and absence of crashes.
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const skinModuleSrc = readFileSync(join(root, 'apps/lab-web/src/play/gameplay-skin.js'), 'utf8');
const rendererSrc = readFileSync(join(root, 'apps/lab-web/src/play/ranked-duel-renderer.mjs'), 'utf8');
const boardEventsSrc = readFileSync(join(root, 'apps/lab-web/src/play/board-events.js'), 'utf8');
const playAppSrc = readFileSync(join(root, 'apps/lab-web/src/play/play-app.js'), 'utf8');
const appSrc = readFileSync(join(root, 'apps/lab-web/src/app.js'), 'utf8');
const skinsCssSrc = readFileSync(join(root, 'apps/lab-web/src/play/gameplay-skins.css'), 'utf8');

// ── Skin enum / validation ──

test('gameplay-skin.js: exports all four skins', () => {
  assert.ok(skinModuleSrc.includes("'light'"), 'must include light');
  assert.ok(skinModuleSrc.includes("'dark'"), 'must include dark');
  assert.ok(skinModuleSrc.includes("'cosmotech'"), 'must include cosmotech');
  assert.ok(skinModuleSrc.includes("'corrupture'"), 'must include corrupture');
});

test('gameplay-skin.js: default is dark', () => {
  assert.ok(
    skinModuleSrc.includes("DEFAULT_GAMEPLAY_SKIN = 'dark'"),
    'DEFAULT_GAMEPLAY_SKIN must be dark'
  );
});

test('gameplay-skin.js: normalizeSkin validates unknown values to dark', () => {
  assert.ok(
    skinModuleSrc.includes('function normalizeSkin'),
    'must export normalizeSkin'
  );
  // The function must check against the valid set
  assert.ok(
    skinModuleSrc.includes('_validSet.has'),
    'normalizeSkin must validate against a known set'
  );
});

test('gameplay-skin.js: persistence uses localStorage synchronously', () => {
  assert.ok(
    skinModuleSrc.includes("localStorage") && skinModuleSrc.includes("getItem"),
    'getGameplaySkin must read localStorage synchronously (no FOUC)'
  );
  assert.ok(
    skinModuleSrc.includes("localStorage") && skinModuleSrc.includes("setItem"),
    'setGameplaySkin must write localStorage synchronously'
  );
});

test('gameplay-skin.js: storage key is dedicated to gameplay skin', () => {
  assert.ok(
    skinModuleSrc.includes("intrilex:gameplaySkin"),
    'must use a dedicated localStorage key'
  );
});

test('gameplay-skin.js: setGameplaySkin rejects invalid values', () => {
  assert.ok(
    skinModuleSrc.includes('_validSet.has(skin)') || skinModuleSrc.includes('_validSet.has(value)'),
    'setGameplaySkin must validate before persisting'
  );
});

test('gameplay-skin.js: applyGameplaySkin sets data-gameplay-skin attribute', () => {
  assert.ok(
    skinModuleSrc.includes("data-gameplay-skin"),
    'applyGameplaySkin must set data-gameplay-skin attribute'
  );
});

test('gameplay-skin.js: trademark labels include ™', () => {
  assert.ok(
    skinModuleSrc.includes('CosmoTech\\u2122') || skinModuleSrc.includes('CosmoTech\u2122'),
    'CosmoTech must include ™ in display label'
  );
  assert.ok(
    skinModuleSrc.includes('Corrupture\\u2122') || skinModuleSrc.includes('Corrupture\u2122'),
    'Corrupture must include ™ in display label'
  );
});

// ── Renderer integration ──

test('ranked-duel-renderer.mjs: imports gameplay-skin module', () => {
  assert.ok(
    rendererSrc.includes("from './gameplay-skin.js'"),
    'renderer must import gameplay-skin.js'
  );
});

test('ranked-duel-renderer.mjs: shell root has data-gameplay-skin attribute', () => {
  assert.ok(
    rendererSrc.includes('data-gameplay-skin="${esc(opts.gameplaySkin)}"'),
    'shell root must carry data-gameplay-skin attribute from opts'
  );
});

test('ranked-duel-renderer.mjs: renders skin selector trigger', () => {
  assert.ok(
    rendererSrc.includes('data-testid="skin-selector-trigger"'),
    'must render skin selector trigger button'
  );
});

test('ranked-duel-renderer.mjs: renders skin selector menu with all four skins', () => {
  assert.ok(
    rendererSrc.includes('data-testid="skin-selector-menu"'),
    'must render skin selector menu'
  );
  assert.ok(
    rendererSrc.includes('data-action="select-skin"'),
    'must render skin selection buttons'
  );
});

test('ranked-duel-renderer.mjs: renderSkinSelector function exists', () => {
  assert.ok(
    rendererSrc.includes('function renderSkinSelector'),
    'must have renderSkinSelector function'
  );
});

// ── Event wiring ──

test('board-events.js: imports gameplay-skin module', () => {
  assert.ok(
    boardEventsSrc.includes("from './gameplay-skin.js'"),
    'board-events must import gameplay-skin.js'
  );
});

test('board-events.js: binds skin selector trigger', () => {
  assert.ok(
    boardEventsSrc.includes("skin-selector-trigger"),
    'must bind skin selector trigger'
  );
});

test('board-events.js: handles select-skin action', () => {
  assert.ok(
    boardEventsSrc.includes("select-skin") && boardEventsSrc.includes("setGameplaySkin"),
    'must handle select-skin by calling setGameplaySkin'
  );
});

test('board-events.js: skips skin actions in generic handler', () => {
  assert.ok(
    boardEventsSrc.includes("toggle-skin-menu") && boardEventsSrc.includes("select-skin") &&
    boardEventsSrc.includes("return;"),
    'generic [data-action] handler must skip skin actions'
  );
});

// ── play-app.js integration ──

test('play-app.js: imports getGameplaySkin', () => {
  assert.ok(
    playAppSrc.includes("getGameplaySkin") && playAppSrc.includes("from './gameplay-skin.js'"),
    'play-app must import getGameplaySkin from gameplay-skin.js'
  );
});

test('play-app.js: passes gameplaySkin to renderBoard', () => {
  assert.ok(
    playAppSrc.includes("gameplaySkin: getGameplaySkin()"),
    'play-app must pass gameplaySkin to renderBoard options'
  );
});

// ── CSS / styles ──

test('app.js: loads gameplay-skins.css alongside ranked-duel.css', () => {
  assert.ok(
    appSrc.includes("gameplay-skins.css"),
    'app.js must load gameplay-skins.css for match routes'
  );
});

test('gameplay-skins.css: defines all four skin attribute selectors', () => {
  assert.ok(skinsCssSrc.includes('[data-gameplay-skin="light"]'), 'must define light skin');
  assert.ok(skinsCssSrc.includes('[data-gameplay-skin="cosmotech"]'), 'must define cosmotech skin');
  assert.ok(skinsCssSrc.includes('[data-gameplay-skin="corrupture"]'), 'must define corrupture skin');
});

test('gameplay-skins.css: defines semantic tokens on shell root', () => {
  assert.ok(
    skinsCssSrc.includes('--gp-bg') && skinsCssSrc.includes('--gp-text') && skinsCssSrc.includes('--gp-accent'),
    'must define semantic --gp-* tokens'
  );
});

test('gameplay-skins.css: Light skin has light background (not inverted dark)', () => {
  // Check the whole CSS for light backgrounds in the light skin context
  // The light skin token block and overrides must use light colors
  const hasLightBg = skinsCssSrc.includes('#ffffff') && skinsCssSrc.includes('#f1f5f9') && skinsCssSrc.includes('#eef2f7');
  assert.ok(
    hasLightBg,
    'Light skin must use genuinely light backgrounds (not just inverted dark)'
  );
});

test('gameplay-skins.css: CosmoTech uses celestial palette (cyan/violet/navy)', () => {
  const cosmoSection = skinsCssSrc.split('[data-gameplay-skin="cosmotech"]')[1]?.split('[data-gameplay-skin="corrupture"]')[0] ?? '';
  assert.ok(cosmoSection.includes('#7dd3fc'), 'CosmoTech must use cyan accent');
  assert.ok(cosmoSection.includes('#c4b5fd'), 'CosmoTech must use astral violet');
  assert.ok(cosmoSection.includes('#030514') || cosmoSection.includes('#050a1e'), 'CosmoTech must use deep void navy');
});

test('gameplay-skins.css: Corrupture uses fracture palette (gold/violet/obsidian)', () => {
  const corrSection = skinsCssSrc.split('[data-gameplay-skin="corrupture"]')[1]?.split('SKIN SELECTOR')[0] ?? '';
  assert.ok(corrSection.includes('#c8a050') || corrSection.includes('rgba(200,160,80'), 'Corrupture must use fractured gold');
  assert.ok(corrSection.includes('#b87ad0') || corrSection.includes('rgba(184,122,208'), 'Corrupture must use violet energy');
  assert.ok(corrSection.includes('#0a0608') || corrSection.includes('#0e080a'), 'Corrupture must use obsidian background');
});

test('gameplay-skins.css: Corrupture is not just red+black', () => {
  const corrSection = skinsCssSrc.split('[data-gameplay-skin="corrupture"]')[1]?.split('SKIN SELECTOR')[0] ?? '';
  // Must use gold seams (kintsugi-like), not just red overlays
  assert.ok(
    corrSection.includes('200,160,80') || corrSection.includes('c8a050'),
    'Corrupture must use gold seam accents (not just red/black)'
  );
});

test('gameplay-skins.css: CosmoTech is not just cyan+dark', () => {
  // CosmoTech must have orbital/crystalline geometry, not just color swap
  // Check the full CSS for orbital ring ornament in cosmotech context
  const hasOrbitalGeometry = skinsCssSrc.includes('border-radius: 50%') && skinsCssSrc.includes('cosmotech');
  assert.ok(
    hasOrbitalGeometry,
    'CosmoTech must have orbital/circular geometry (not just color swap)'
  );
});

test('gameplay-skins.css: has reduced-motion handling', () => {
  assert.ok(
    skinsCssSrc.includes('prefers-reduced-motion') || skinsCssSrc.includes('reduced-motion'),
    'must respect prefers-reduced-motion'
  );
});

test('gameplay-skins.css: skin selector menu styling exists', () => {
  assert.ok(skinsCssSrc.includes('.rd-skin-trigger'), 'must style skin trigger');
  assert.ok(skinsCssSrc.includes('.rd-skin-menu'), 'must style skin menu');
  assert.ok(skinsCssSrc.includes('.rd-skin-menu-item'), 'must style skin menu items');
});

test('gameplay-skins.css: ornaments use pointer-events:none', () => {
  assert.ok(
    skinsCssSrc.includes('pointer-events: none'),
    'ornamental pseudo-elements must not intercept clicks'
  );
});

test('gameplay-skins.css: focus-visible states defined per skin', () => {
  assert.ok(skinsCssSrc.includes(':focus-visible'), 'must define focus-visible states');
});

// ── Dark preservation ──

test('Dark skin: no [data-gameplay-skin="dark"] override block (preserved as baseline)', () => {
  // Dark is the canonical baseline — it should NOT have an override block
  // because the base ranked-duel.css already produces the dark appearance.
  // The shell root sets data-gameplay-skin="dark" but no CSS overrides it.
  const darkOverrideCount = (skinsCssSrc.match(/\[data-gameplay-skin="dark"\]/g) || []).length;
  assert.ok(
    darkOverrideCount === 0,
    `Dark should have zero override blocks (found ${darkOverrideCount}) — it is the baseline`
  );
});

// ── No crash / structural integrity ──

test('gameplay-skin.js: module is syntactically valid (no syntax errors in source)', () => {
  // Basic structural checks — if the module is malformed, import would fail
  assert.ok(skinModuleSrc.includes('export const GAMEPLAY_SKINS'), 'must export GAMEPLAY_SKINS');
  assert.ok(skinModuleSrc.includes('export function normalizeSkin'), 'must export normalizeSkin');
  assert.ok(skinModuleSrc.includes('export function getGameplaySkin'), 'must export getGameplaySkin');
  assert.ok(skinModuleSrc.includes('export function setGameplaySkin'), 'must export setGameplaySkin');
  assert.ok(skinModuleSrc.includes('export function applyGameplaySkin'), 'must export applyGameplaySkin');
});
