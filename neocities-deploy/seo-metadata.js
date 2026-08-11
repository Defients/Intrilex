// ═══════════════════════════════════════════════════════════════
// seo-metadata.js — Centralized per-route document metadata manager
//
// Owns the document identity lifecycle for every major route:
//   <title>, meta description, canonical, OG, Twitter, JSON-LD
//
// Invariants:
//   - The homepage (/) owns game-focused metadata, never Lab metadata.
//   - The Simulation Lab (/watch and other observatory routes) owns
//     Lab-focused metadata.
//   - Legal pages (/privacy, /terms) own legal-focused metadata.
//   - Navigating away from a route restores the destination route's
//     metadata — no stale leakage.
//
// This module replaces the ad-hoc metadata mutation that was
// previously scattered across app.js render() and renderLegalPage().
// ═══════════════════════════════════════════════════════════════

import { LAB_VERSION, ENGINE_VERSION, RULES_VERSION } from './version.js';

const ORIGIN = 'https://intrilex.cards';

// ── Route metadata definitions ──────────────────────────────────

/**
 * @typedef {Object} RouteMeta
 * @property {string} title - Document title
 * @property {string} description - Meta description
 * @property {string} canonicalPath - Canonical URL path (e.g. "/" or "/#/privacy")
 * @property {string} ogType - Open Graph type
 */

/** @type {Record<string, RouteMeta>} */
const ROUTE_META = {
  // Homepage — the competitive playing card game
  '/': {
    title: 'Intrilex — Competitive Playing Card Game',
    description: 'Intrilex is a tactical competitive playing card game of public score, disruption, and exactly-when spending. Play local vs AI or online Direct Duel. Every decision matters.',
    canonicalPath: '/',
    ogType: 'website',
  },
  // Play routes
  '/play': {
    title: 'Intrilex — Play',
    description: 'Play Intrilex — choose Local vs AI for solo practice or Online Direct Duel for server-authoritative competitive play against real opponents.',
    canonicalPath: '/#/play',
    ogType: 'website',
  },
  '/play/new': {
    title: 'Intrilex — New Match',
    description: 'Start a new Intrilex duel. Choose your mode — Local vs AI or Online Direct Duel.',
    canonicalPath: '/#/play/new',
    ogType: 'website',
  },
  '/play/match': {
    title: 'Intrilex — Match',
    description: 'An Intrilex ranked duel match in progress.',
    canonicalPath: '/#/play/match',
    ogType: 'website',
  },
  '/play/online': {
    title: 'Intrilex — Online Direct Duel',
    description: 'Server-authoritative online Direct Duel for Intrilex. Create or join a match with an invite code, or find a match via public matchmaking.',
    canonicalPath: '/#/play/online',
    ogType: 'website',
  },
  // Rules
  '/rules': {
    title: 'Intrilex — Rules',
    description: 'The complete official Intrilex rulebook — mechanics, card effects, rank powers, turn structure, and competitive play rules.',
    canonicalPath: '/#/rules',
    ogType: 'article',
  },
  // Legal pages
  '/privacy': {
    title: 'Intrilex — Privacy Policy',
    description: 'Intrilex Privacy Policy — how Intrilex, operated by Deffy Pyah Urz, handles personal information, account data, gameplay records, and your privacy rights.',
    canonicalPath: '/#/privacy',
    ogType: 'article',
  },
  '/terms': {
    title: 'Intrilex — Terms of Service',
    description: 'Intrilex Terms of Service — the terms governing your use of Intrilex, including account rules, acceptable use, competitive integrity, creator policy, and dispute provisions.',
    canonicalPath: '/#/terms',
    ogType: 'article',
  },
  // Auth
  '/auth': {
    title: 'Intrilex — Sign In',
    description: 'Sign in to Intrilex with Discord or Google, or continue as a guest to play online.',
    canonicalPath: '/#/auth',
    ogType: 'website',
  },
  // Player Directory
  '/players': {
    title: 'Intrilex — Players',
    description: 'Discover Intrilex players — search by name or handle, filter by tier, and inspect public profiles, rankings, and battle history.',
    canonicalPath: '/#/players',
    ogType: 'website',
  },
};

// Simulation Lab metadata — used for all observatory workspace routes
const LAB_META = {
  title: 'Intrilex Simulation Lab — Deterministic Match Analysis',
  description: 'Intrilex Simulation Lab — deterministic card-game simulation, replay forensics, rank anatomy observatory, and interactive play vs AI. Server-authoritative online Direct Duel invite alpha.',
  canonicalPath: '/#/watch',
  ogType: 'website',
};

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Set or create a meta element.
 * @param {string} selector - CSS selector for the meta element
 * @param {string} attribute - Attribute to set (content, href, etc.)
 * @param {string} value - Value to set
 */
function setMetaAttr(selector, attribute, value) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute(attribute, value);
}

/**
 * Set or create a meta element by property (for OG tags).
 * @param {string} property - The property attribute value
 * @param {string} content - The content to set
 */
function setOgMeta(property, content) {
  setMetaAttr(`meta[property="${property}"]`, 'content', content);
}

/**
 * Set or create a Twitter meta element.
 * @param {string} name - The name attribute value
 * @param {string} content - The content to set
 */
function setTwitterMeta(name, content) {
  setMetaAttr(`meta[name="${name}"]`, 'content', content);
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Resolve metadata for a route key.
 * Falls back to Lab metadata for observatory routes not in ROUTE_META.
 * @param {string} routeKey - The route key from router.route()
 * @returns {RouteMeta}
 */
export function getRouteMeta(routeKey) {
  return ROUTE_META[routeKey] ?? LAB_META;
}

/**
 * Apply metadata for a route.
 * Sets title, description, canonical, OG, and Twitter tags.
 * @param {string} routeKey - The route key from router.route()
 */
export function applyRouteMetadata(routeKey) {
  const meta = getRouteMeta(routeKey);
  const canonicalUrl = ORIGIN + meta.canonicalPath;

  document.title = meta.title;
  setMetaAttr('meta[name="description"]', 'content', meta.description);
  setMetaAttr('link[rel="canonical"]', 'href', canonicalUrl);

  // Open Graph
  setOgMeta('og:title', meta.title);
  setOgMeta('og:description', meta.description);
  setOgMeta('og:url', canonicalUrl);
  setOgMeta('og:type', meta.ogType);

  // Twitter Card
  setTwitterMeta('twitter:title', meta.title);
  setTwitterMeta('twitter:description', meta.description);
}

/**
 * Populate the observatory shell's static text content from version constants.
 * Called when the observatory shell is shown. This keeps Lab-specific text
 * out of the static HTML so crawlers see the homepage identity.
 */
export function populateObservatoryShellText() {
  const brandSmall = document.querySelector('.brand-block small');
  if (brandSmall && !brandSmall.textContent)
    brandSmall.textContent = `SIMULATION LAB · v${LAB_VERSION}`;

  const authorityEngine = document.querySelector('.authority-stamp strong');
  if (authorityEngine && !authorityEngine.textContent)
    authorityEngine.textContent = `Engine ${ENGINE_VERSION}`;

  const authorityRules = document.querySelector('.authority-stamp small:not(.stamp-verified)');
  if (authorityRules && !authorityRules.textContent)
    authorityRules.textContent = `Official Rules ${RULES_VERSION} · Queen's Court`;

  const eyebrow = document.querySelector('.observatory-shell .global-header .eyebrow');
  if (eyebrow && !eyebrow.textContent)
    eyebrow.textContent = 'DETERMINISTIC MECHANICS OBSERVATORY';
}

/**
 * Populate dialog heading text from JS when the dialog is opened.
 * This keeps dialog text out of the static HTML.
 * @param {string} dialogId - The dialog element ID
 * @param {string} eyebrowText - The eyebrow text
 * @param {string} titleText - The heading text
 */
export function populateDialogHeading(dialogId, eyebrowText, titleText) {
  const dialog = document.getElementById(dialogId);
  if (!dialog) return;
  const eyebrow = dialog.querySelector('.dialog-head .eyebrow, .acr-dialog-head .eyebrow');
  if (eyebrow) eyebrow.textContent = eyebrowText;
  const title = dialog.querySelector('h2');
  if (title) title.textContent = titleText;
}
