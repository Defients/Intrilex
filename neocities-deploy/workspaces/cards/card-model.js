// ═══════════════════════════════════════════════════════════════
// workspaces/cards/card-model.js — Card Observatory view-model.
//
// Pure adapter layer between the authoritative card systems and the
// Cards workspace renderer. Three responsibilities:
//
//   Canonical — identity → card-face definition (card-face-data.js),
//               art registry, Advanced Card Rules dossier
//               (card-rules-data.mjs). No ability text or rules are
//               re-derived here.
//
//   Evidence — identity → best available analytics entity in
//               state.variantAnalytics, with an explicit scope label
//               (exact suit variant / shared normal / rank-level /
//               exact-card) and honest status (available / insufficient
//               / unavailable / integrity-failure / no-dataset).
//               Never fabricates observed values.
//
//   Relationships — identity → sibling suit cards, rank analytical
//               entities (normal / spade / per-suit tens / supers),
//               and cross-workspace targets.
//
// Variant-entity key conventions mirror packages/simulation-runtime/
// variant-registry.mjs (the pipeline authority): "<rank>",
// "<rank>:normal" (♣/♦/♥ combined), "<rank>:spade", "10:<suit-name>",
// "<rank>:super:<effectId>", "<rank>:super:all". The registry module
// itself is server-only (it loads the vendor engine), so this module
// derives the same keys structurally — every rank A–K has a ♠ variant
// and every non-10 ♣/♦/♥ card shares the :normal entity.
// ═══════════════════════════════════════════════════════════════

import { getCardDefinition, listAuthoritativeCards, getSuit, rankName, CARD_FACE_REGISTRY_META } from '../../card-face-data.js?v=5e0a78513ea5';
import { getCardArtBoardPath, getCardArtBoardPosition, getCardArtAlt } from '../../card-art-registry.js?v=5e0a78513ea5';
import { getCardRulesDefinition } from '../../play/advanced-card-rules/card-rules-data.mjs?v=5e0a78513ea5';

// ── Deck order ───────────────────────────────────────────────────
export const SUIT_ORDER = ['♣', '♦', '♥', '♠'];
const SUIT_ENTITY_NAMES = { '♣': 'club', '♦': 'diamond', '♥': 'heart', '♠': 'spade' };
export const DECK_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const JOKER_RANKS = ['RJ', 'BJ'];

// ── Evidence scope vocabulary ────────────────────────────────────
// Disclosure-first: the scope tells the user what the telemetry
// actually measured before any number is shown.
export const EVIDENCE_SCOPE = Object.freeze({
  EXACT_SUIT: 'exact-suit',
  EXACT_SPADE: 'exact-spade',
  EXACT_CARD: 'exact-card',
  SHARED_NORMAL: 'shared-normal',
  RANK_LEVEL: 'rank-level',
});

export const EVIDENCE_STATUS = Object.freeze({
  AVAILABLE: 'available',
  INSUFFICIENT: 'insufficient',
  UNAVAILABLE: 'unavailable',
  INTEGRITY_FAILURE: 'integrity-failure',
  NO_DATASET: 'no-dataset',
});

const TIMING_CLASSES = ['instant', 'interrupt', 'effect', 'quick', 'passive', 'super', 'scoring', 'anchor'];
export const TIMING_FILTERS = [
  { value: 'all', label: 'All timing' },
  { value: 'effect', label: 'Effect' },
  { value: 'instant', label: 'Instant' },
  { value: 'interrupt', label: 'Interrupt' },
  { value: 'quick', label: 'Quick' },
  { value: 'super', label: 'Super' },
  { value: 'scoring', label: 'Scoring' },
  { value: 'anchor', label: 'Anchor' },
  { value: 'passive', label: 'Passive' },
];

export const EVIDENCE_FILTERS = [
  { value: 'all', label: 'All evidence' },
  { value: 'exact', label: 'Exact (card or suit variant)' },
  { value: 'shared', label: 'Shared normal (♣/♦/♥)' },
  { value: 'rank-fallback', label: 'Rank fallback available' },
  { value: 'insufficient', label: 'Insufficient / missing' },
];

export const CONFIDENCE_FILTERS = [
  { value: 'all', label: 'All confidence' },
  { value: 'HIGH', label: 'High (100+ opportunities)' },
  { value: 'MEDIUM', label: 'Medium (30+)' },
  { value: 'LOW', label: 'Low (8+)' },
  { value: 'INSUFFICIENT', label: 'Insufficient (<8)' },
];

export const SORT_MODES = [
  { value: 'deck', label: 'Deck order' },
  { value: 'selected', label: 'Most selected' },
  { value: 'opportunities', label: 'Most opportunities' },
  { value: 'winassoc', label: 'Strongest win association' },
];

// ── Canonical layer ──────────────────────────────────────────────

function timingClasses(abilities) {
  const set = new Set();
  for (const a of abilities ?? []) {
    const t = String(a.timing ?? '').toLowerCase();
    const mode = String(a.mode ?? '').toLowerCase();
    for (const cls of TIMING_CLASSES) {
      if (t.includes(cls) || mode.includes(cls)) set.add(cls);
    }
    if (a.mode === 'hold') set.add('scoring');
  }
  return [...set];
}

/**
 * Normalized canonical view of one card identity. Returns null for
 * identities the canonical registry does not know.
 * @param {string} identity
 */
export function canonicalCard(identity) {
  const def = getCardDefinition(identity);
  if (!def) return null;
  const rules = getCardRulesDefinition(identity) ?? {};
  const suit = def.suit ? getSuit(def.suit) : null;
  const timings = timingClasses(def.abilities);
  const artPath = safeArt(() => getCardArtBoardPath(identity), def.art);
  const artPos = safeArt(() => getCardArtBoardPosition(identity), 'center 30%');
  return {
    identity: def.identity,
    rank: def.rank,
    rankLabel: rankName(def.rank) ?? def.rank,
    suit: def.suit ?? null,
    suitLabel: suit?.name ?? (def.family === 'super' ? 'Joker' : '—'),
    suitId: suit?.id ?? 'joker',
    suitAccent: suit?.accent ?? '#c9a44f',
    family: def.family,
    title: def.name ?? rules.subtitle ?? def.identity,
    subtitle: rules.subtitle ?? def.name ?? '',
    motto: rules.motto ?? '',
    badges: rules.badges ?? [],
    pr: def.points ?? rules.points ?? null,
    er: def.er ?? null,
    authority: def.authority ?? 'canonical',
    abilities: def.abilities ?? [],
    timings,
    art: { path: artPath, alt: safeArt(() => getCardArtAlt(identity), def.identity), position: artPos },
    searchText: [
      def.identity, def.rank, rankName(def.rank), suit?.name, def.name,
      rules.subtitle, rules.motto, def.family,
      ...(def.abilities ?? []).map(a => `${a.title} ${a.summary} ${a.timing}`),
    ].filter(Boolean).join(' ').toLowerCase(),
  };
}

function safeArt(fn, fallback) {
  try { return fn() ?? fallback; } catch { return fallback; }
}

// ── Evidence mapping ─────────────────────────────────────────────

/**
 * Map a canonical card identity to the best available analytical
 * entity key. This is the integrity-critical function: it never
 * upgrades scope (a shared-normal card never borrows exact evidence)
 * and never downgrades silently (the scope label travels with the key).
 * @param {string} identity
 * @returns {{variantKey:string,tier:string,scope:string,scopeLabel:string,disclosure:string}|null}
 */
export function evidenceEntityForIdentity(identity) {
  const def = getCardDefinition(identity);
  if (!def) return null;
  const { rank, suit } = def;

  if (rank === '10' && SUIT_ENTITY_NAMES[suit]) {
    const key = `10:${SUIT_ENTITY_NAMES[suit]}`;
    return {
      variantKey: key, tier: 'suit', scope: EVIDENCE_SCOPE.EXACT_SUIT,
      scopeLabel: 'Exact suit variant',
      disclosure: `Each Ten has a mechanically distinct per-suit effect — tracked as its own analytical entity (${key}).`,
    };
  }
  if (JOKER_RANKS.includes(rank)) {
    return {
      variantKey: rank, tier: 'rank', scope: EVIDENCE_SCOPE.EXACT_CARD,
      scopeLabel: 'Exact card evidence',
      disclosure: `${rank} is a single-card analytical entity — the rank-level record is exactly this card.`,
    };
  }
  if (suit === '♠') {
    const key = `${rank}:spade`;
    return {
      variantKey: key, tier: 'spade', scope: EVIDENCE_SCOPE.EXACT_SPADE,
      scopeLabel: 'Exact suit variant',
      disclosure: `The ♠ form of this rank has a distinct effect — tracked separately as ${key}.`,
    };
  }
  const key = `${rank}:normal`;
  return {
    variantKey: key, tier: 'normal', scope: EVIDENCE_SCOPE.SHARED_NORMAL,
    scopeLabel: 'Shared normal evidence — ♣/♦/♥',
    disclosure: `Telemetry aggregates all normal-suit copies of rank ${rank} (${key}). This is not independently measured for ${suit} alone.`,
  };
}

/**
 * Confidence classification — mirrors classifyVariantConfidence in
 * browser-analytics.js (thresholds on legal-opportunity count). The
 * artifact's own confidence map is preferred when present.
 */
export function classifyConfidence(metrics) {
  const n = metrics?.variantOpportunityCount ?? 0;
  if (n >= 100) return 'HIGH';
  if (n >= 30) return 'MEDIUM';
  if (n >= 8) return 'LOW';
  return 'INSUFFICIENT';
}

/**
 * Evidence status for an entity key inside a variant-analytics
 * artifact. Never fabricates observations: a missing metric row is
 * 'unavailable', not zero.
 * @param {string} variantKey
 * @param {object|null} va - state.variantAnalytics
 */
export function evidenceForEntity(variantKey, va) {
  if (!va) return { key: variantKey, status: EVIDENCE_STATUS.NO_DATASET, metrics: null, power: null, confidence: 'INSUFFICIENT', entity: null, rankFallback: null };
  const m = va.variantMetrics?.[variantKey] ?? null;
  const power = va.variantPower?.[variantKey] ?? null;
  const entity = (va.entities ?? []).find(e => e.variantKey === variantKey) ?? null;
  const confidence = va.confidence?.[variantKey] ?? (m ? classifyConfidence(m) : 'INSUFFICIENT');
  const opp = m?.variantOpportunityCount ?? 0;
  const sel = m?.variantSelectionCount ?? 0;
  let status = EVIDENCE_STATUS.AVAILABLE;
  if (!m) status = EVIDENCE_STATUS.UNAVAILABLE;
  // Legacy telemetry limitation: selections recorded without any legal-
  // opportunity denominator. Pick rate is unknowable for this entity —
  // the pipeline calls this an integrity failure, not a 0% pick rate.
  else if (opp === 0 && sel > 0) status = EVIDENCE_STATUS.INTEGRITY_FAILURE;
  else if (opp === 0 || confidence === 'INSUFFICIENT') status = EVIDENCE_STATUS.INSUFFICIENT;
  // Rank-level fallback existence: when the mapped entity is missing,
  // the rank overall may still carry aggregate telemetry — surfaced as
  // a disclosure, never silently substituted.
  let rankFallback = null;
  const rank = variantKey.split(':')[0];
  if (status === EVIDENCE_STATUS.UNAVAILABLE && rank !== variantKey) {
    const rm = va.variantMetrics?.[rank];
    if (rm && (rm.variantOpportunityCount ?? 0) > 0) rankFallback = { key: rank, confidence: va.confidence?.[rank] ?? classifyConfidence(rm) };
  }
  return { key: variantKey, status, metrics: m, power, confidence, entity, rankFallback };
}

/**
 * Full per-card view-model: canonical identity + mapped evidence.
 * @param {string} identity
 * @param {object|null} va
 */
export function cardViewModel(identity, va) {
  const c = canonicalCard(identity);
  if (!c) return null;
  const entity = evidenceEntityForIdentity(identity);
  const evidence = entity ? evidenceForEntity(entity.variantKey, va) : evidenceForEntity('', va);
  return { ...c, entity, evidence };
}

/** Build the full 54-card deck view-model. */
export function buildDeck(va) {
  return listAuthoritativeCards()
    .map(card => cardViewModel(card.identity, va))
    .filter(Boolean);
}

/**
 * Deck matrix rows: one row per rank A–K with a cell per suit, then a
 * Jokers row (suitless cells). Cells may be null for display slots the
 * filtered view empties.
 * @param {object[]} models
 * @param {(m:object)=>boolean} [visible]
 */
export function deckMatrix(models, visible = () => true) {
  const byId = new Map(models.map(m => [m.identity, m]));
  const rows = DECK_RANKS.map(rank => ({
    rank, label: rankName(rank) ?? rank, joker: false,
    cells: SUIT_ORDER.map(suit => {
      const m = byId.get(`${rank}${suit}`);
      return m && visible(m) ? { suit, model: m } : { suit, model: null };
    }),
  }));
  rows.push({
    rank: 'JOKER', label: 'Jokers', joker: true,
    cells: JOKER_RANKS.map(rank => {
      const m = byId.get(rank);
      return m && visible(m) ? { suit: null, model: m } : { suit: null, model: null };
    }),
  });
  return rows;
}

// ── Family / variant context ─────────────────────────────────────

/** Classify an analytical entity key into its tier. */
export function entityTierForKey(key) {
  if (key.endsWith(':super:all')) return 'super-aggregate';
  if (key.includes(':super:')) return 'super';
  if (key.endsWith(':spade')) return 'spade';
  if (key.endsWith(':normal')) return 'normal';
  if (/^10:(club|diamond|heart|spade)$/.test(key)) return 'suit';
  return 'rank';
}

const TIER_ORDER = { rank: 0, normal: 1, suit: 1, spade: 2, 'super-aggregate': 3, super: 4 };

/**
 * Analytical entities related to a card's rank, ordered canonically
 * (rank overall → suit variants → super aggregate → individual
 * supers). Entity keys and display names come from the analytics
 * artifact itself; no entity is invented here.
 * @param {object} cardModel - cardViewModel output
 * @param {object|null} va
 */
export function rankFamilyEntities(cardModel, va) {
  if (!cardModel) return [];
  const { rank, identity, suit } = cardModel;
  if (JOKER_RANKS.includes(rank)) {
    return [{ key: rank, tier: 'rank', displayName: `Rank ${rank} (overall)`, mapped: true, evidence: evidenceForEntity(rank, va) }];
  }
  const order = va?.rankComparisons?.[rank]?.entityOrder ?? va?.entityOrder ?? null;
  let keys;
  if (Array.isArray(order) && order.length) {
    keys = order.filter(k => k === rank || k.startsWith(`${rank}:`));
  } else {
    keys = [rank];
    if (rank === '10') keys.push('10:club', '10:diamond', '10:heart', '10:spade');
    else keys.push(`${rank}:normal`, `${rank}:spade`);
    for (const k of Object.keys(va?.variantMetrics ?? {})) {
      if (k.startsWith(`${rank}:super:`) && !keys.includes(k)) keys.push(k);
    }
  }
  const mappedKey = cardModel.entity?.variantKey;
  const entityIndex = new Map((va?.entities ?? []).map(e => [e.variantKey, e]));
  const levels = va?.rankComparisons?.[rank]?.levels ?? {};
  const out = keys.map(key => ({
    key,
    tier: entityTierForKey(key),
    displayName: entityIndex.get(key)?.displayName ?? levels[key]?.displayName ?? key,
    mapped: key === mappedKey,
    evidence: evidenceForEntity(key, va),
  }));
  const suitIdx = { '♣': 0, '♦': 1, '♥': 2, '♠': 3 };
  out.sort((a, b) => {
    const ta = TIER_ORDER[a.tier] ?? 9, tb = TIER_ORDER[b.tier] ?? 9;
    if (ta !== tb) return ta - tb;
    if (a.tier === 'suit') {
      const sa = Object.keys(SUIT_ENTITY_NAMES).find(s => `10:${SUIT_ENTITY_NAMES[s]}` === a.key);
      const sb = Object.keys(SUIT_ENTITY_NAMES).find(s => `10:${SUIT_ENTITY_NAMES[s]}` === b.key);
      return (suitIdx[sa] ?? 0) - (suitIdx[sb] ?? 0);
    }
    return a.key.localeCompare(b.key);
  });
  // Physical suit siblings of the same rank (canonical cards, not entities)
  void suit; void identity;
  return out;
}

/** Canonical suit-sibling cards for a rank (e.g. all four Tens). */
export function suitSiblings(cardModel, va) {
  if (!cardModel || JOKER_RANKS.includes(cardModel.rank)) return [];
  return SUIT_ORDER.map(suit => cardViewModel(`${cardModel.rank}${suit}`, va)).filter(Boolean);
}

// ── Filtering ────────────────────────────────────────────────────

const EXACT_SCOPES = new Set([EVIDENCE_SCOPE.EXACT_SUIT, EVIDENCE_SCOPE.EXACT_SPADE, EVIDENCE_SCOPE.EXACT_CARD]);
const INSUFFICIENT_STATUSES = new Set([EVIDENCE_STATUS.INSUFFICIENT, EVIDENCE_STATUS.UNAVAILABLE, EVIDENCE_STATUS.INTEGRITY_FAILURE]);

/**
 * Apply the toolbar filter set to deck view-models.
 * @param {object[]} models
 * @param {{search?:string,suit?:string,rank?:string,timing?:string,evidence?:string,confidence?:string}} f
 */
export function filterModels(models, f = {}) {
  const q = (f.search ?? '').trim().toLowerCase();
  return models.filter(m => {
    if (q && !m.searchText.includes(q)) return false;
    if (f.suit && f.suit !== 'all') {
      if (f.suit === 'joker') { if (!JOKER_RANKS.includes(m.rank)) return false; }
      else if (m.suit !== f.suit) return false;
    }
    if (f.rank && f.rank !== 'all') {
      if (f.rank === 'joker') { if (!JOKER_RANKS.includes(m.rank)) return false; }
      else if (m.rank !== f.rank) return false;
    }
    if (f.timing && f.timing !== 'all' && !m.timings.includes(f.timing)) return false;
    if (f.evidence && f.evidence !== 'all') {
      const scope = m.entity?.scope;
      const status = m.evidence?.status;
      if (f.evidence === 'exact' && !EXACT_SCOPES.has(scope)) return false;
      if (f.evidence === 'shared' && scope !== EVIDENCE_SCOPE.SHARED_NORMAL) return false;
      // Physical cards never carry a rank-level entity scope — the honest
      // rank-level signal is the fallback disclosure on a card whose own
      // entity evidence is missing.
      if (f.evidence === 'rank-fallback' && !m.evidence?.rankFallback) return false;
      if (f.evidence === 'insufficient' && !(INSUFFICIENT_STATUSES.has(status) || !m.evidence?.metrics)) return false;
    }
    if (f.confidence && f.confidence !== 'all') {
      const conf = m.evidence?.metrics ? m.evidence.confidence : 'INSUFFICIENT';
      if (conf !== f.confidence) return false;
    }
    return true;
  });
}

/** Sort filtered models for the List view (deck order is a no-op). */
export function sortModels(models, mode = 'deck') {
  if (mode === 'deck') return models;
  const bySel = m => -(m.evidence?.metrics?.variantSelectionCount ?? -1);
  const byOpp = m => -(m.evidence?.metrics?.variantOpportunityCount ?? -1);
  const byWin = m => {
    const w = m.evidence?.metrics?.variantWinRate;
    const usable = m.evidence?.status === EVIDENCE_STATUS.AVAILABLE && Number.isFinite(w);
    return -(usable ? w : -Infinity);
  };
  const fn = mode === 'selected' ? bySel : mode === 'opportunities' ? byOpp : byWin;
  return [...models].sort((a, b) => fn(a) - fn(b));
}

// ── Summary strip ────────────────────────────────────────────────

/**
 * Truthful top-level metrics for the strip. Only surfaces values that
 * exist in the artifact — never derives a "best card" from scope-mixed
 * aggregates.
 * @param {object[]} models - cardViewModel list
 * @param {object|null} va
 */
export function atlasSummary(models, va) {
  const total = models.length;
  if (!va) {
    return { total, rulesVersion: CARD_FACE_REGISTRY_META.rulesVersion, hasDataset: false };
  }
  let usable = 0, insufficient = 0, missing = 0;
  for (const m of models) {
    const s = m.evidence?.status;
    if (s === EVIDENCE_STATUS.AVAILABLE) usable += 1;
    else if (s === EVIDENCE_STATUS.INSUFFICIENT) insufficient += 1;
    else missing += 1;
  }
  // Most-selected observed variant: compare only entities cards map to.
  const entityNames = new Map((va.entities ?? []).map(e => [e.variantKey, e.displayName]));
  let mostSelected = null, strongest = null;
  for (const m of models) {
    const met = m.evidence?.metrics;
    if (!met) continue;
    if (!mostSelected || (met.variantSelectionCount ?? 0) > (mostSelected.selections ?? 0)) {
      mostSelected = { key: m.entity.variantKey, label: entityNames.get(m.entity.variantKey) ?? m.entity.variantKey, selections: met.variantSelectionCount ?? 0 };
    }
    // Strongest observed win rate among outcome-qualified entities:
    // requires both outcome observations and usable confidence.
    const outs = (met.variantVictoryContributionCount ?? 0) + (met.variantDefeatExposureCount ?? 0);
    const w = met.variantWinRate;
    if (m.evidence.status === EVIDENCE_STATUS.AVAILABLE && outs > 0 && Number.isFinite(w)
      && (!strongest || w > strongest.win)) {
      strongest = { key: m.entity.variantKey, label: entityNames.get(m.entity.variantKey) ?? m.entity.variantKey, win: w };
    }
  }
  return {
    total, usable, insufficient, missing,
    mostSelected, strongest,
    rulesVersion: CARD_FACE_REGISTRY_META.rulesVersion,
    hasDataset: true,
    integrityFailures: models.filter(m => m.evidence?.status === EVIDENCE_STATUS.INTEGRITY_FAILURE).length,
  };
}

// ── Comparison ───────────────────────────────────────────────────

/** Rows for the multi-card comparison table. */
export function compareData(identities, va) {
  return identities.map(id => cardViewModel(id, va)).filter(Boolean).map(m => ({
    identity: m.identity,
    title: m.title,
    rank: m.rank, suitLabel: m.suitLabel,
    pr: m.pr, er: m.er,
    timings: m.timings,
    scope: m.entity?.scopeLabel ?? '—',
    status: m.evidence?.status,
    confidence: m.evidence?.confidence,
    opportunities: m.evidence?.metrics?.variantOpportunityCount ?? null,
    selections: m.evidence?.metrics?.variantSelectionCount ?? null,
    pickRate: m.evidence?.metrics?.variantPlayRate ?? null,
    winRate: m.evidence?.metrics?.variantWinRate ?? null,
    secured: m.evidence?.metrics?.variantSecuredPointContribution ?? null,
    valuePower: m.evidence?.power?.axes?.valuePower ?? null,
  }));
}

// ── Cross-workspace relationships ────────────────────────────────

/**
 * Cross-workspace navigation targets for a card. Every entry lands in
 * a real filtered/scoped view — no decorative links.
 * @param {object} cardModel
 */
export function relationshipsFor(cardModel) {
  if (!cardModel) return [];
  const { rank } = cardModel;
  const links = [];
  const joker = JOKER_RANKS.includes(rank);
  if (!joker) {
    // Rank dossier: suit-specific tens resolve to their own dossier key.
    const rankKey = rank === '10' && SUIT_ENTITY_NAMES[cardModel.suit] ? `10:${SUIT_ENTITY_NAMES[cardModel.suit]}` : rank;
    links.push({ id: 'rank', label: `Rank ${rank} dossier`, route: '#/ranks', apply: `rank:${rankKey}` });
    links.push({ id: 'mechanics', label: `Mechanics for rank ${rank}`, route: '#/mechanics', apply: `mechanics-rank:${rank}` });
    links.push({ id: 'strategy', label: `Field Manual — rank ${rank}`, route: `#/strategy?subject=rank:${rank}`, apply: null });
  } else {
    links.push({ id: 'rank', label: `Rank ${rank} dossier`, route: '#/ranks', apply: `rank:${rank}` });
    links.push({ id: 'strategy', label: `Field Manual — ${rank}`, route: `#/strategy?subject=rank:${rank}`, apply: null });
  }
  return links;
}
