// ═══════════════════════════════════════════════════════════════
// rank-attribution-browser.js — Browser-safe Rank Attribution.
//
// Extracted from browser-analytics.js (P4.3 modularization).
// Self-contained version of rank-attribution.mjs for the browser bundle.
// Imports parseIdentity and RANK_REGISTRY directly from the browser engine.
// ═══════════════════════════════════════════════════════════════

import { parseIdentity, RANK_REGISTRY } from './engine/ranks.js?v=e2bd7e8507fa';

export const CANONICAL_RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K","RJ","BJ"];

export function classifyPlayForm(action) {
  const authority = action.authority ?? action.mode ?? '';
  const kind = action.kind ?? '';
  const family = action.family ?? '';
  if (authority === 'super' || family === 'super') return 'super';
  if (authority === 'ultra' || kind === 'Ultra' || family === 'ultra') return 'ultra';
  if (authority === 'spade' || /spade/.test(authority)) return 'suit';
  if (kind === 'royal-marriage' || authority === 'royal-marriage' || /royal-marriage/.test(authority)) return 'royal-marriage';
  if (kind === 'rank10' || authority === 'rank10' || /rank10/.test(authority)) return 'rank10';
  if (kind === 'generated' || authority === 'generated' || /generated/.test(authority)) return 'generated';
  if (kind === 'score' || authority === 'score' || family === 'score') return 'score';
  if (kind === 'swap' || authority === 'swap-bar' || family === 'swap-bar') return 'swap';
  if (kind === 'ace-counter' || kind === 'two-counter' || kind === 'scuttle-counter') return 'base';
  if (authority === 'base' || /-base$/.test(authority) || /base-/.test(authority)) return 'base';
  if (family === 'solo-wild') return 'solo-wild-copy';
  if (family === 'counter' || family === 'scuttle' || family === 'quick' || family === 'instant' || family === 'disrupt') return 'base';
  return 'other';
}

export function isNoAttributionAction(action) {
  const kind = action.kind ?? '';
  const family = action.family ?? '';
  const noAttributionKinds = new Set([
    'response-decline', 'pass', 'exhausted-pass',
    'automatic-advance', 'phase-transition',
    'priority-advance', 'no-response-advance'
  ]);
  const noAttributionFamilies = new Set([
    'response-decline', 'pass', 'exhausted-pass',
    'phase', 'private-choice', 'draw'
  ]);
  if (noAttributionKinds.has(kind)) return true;
  if (noAttributionFamilies.has(family)) return true;
  if (family === 'phase' || kind === 'phase-transition') return true;
  return false;
}

export function buildSourceCards(state, action, viewerMode = 'private') {
  const sourceIds = action.sourceCardIds ?? action.sourceHandles ?? action.sourceEntityIds;
  if (!sourceIds || sourceIds.length === 0) return [];
  const cards = [];
  for (const id of sourceIds) {
    const card = state.cards?.[id];
    if (!card) {
      cards.push({ entityId: id, identity: null, rank: null, suit: null, zoneBefore: null, role: 'source' });
      continue;
    }
    const isHidden = viewerMode === 'public' && card.zone?.endsWith('_HAND') && card.controllerId !== state.viewerId;
    cards.push({
      entityId: id,
      identity: isHidden ? null : card.identity,
      rank: isHidden ? null : (parseIdentity(card.identity)?.rank ?? null),
      suit: isHidden ? null : (parseIdentity(card.identity)?.suit ?? null),
      zoneBefore: card.zone,
      role: 'source'
    });
  }
  return cards;
}

export function attributeRankAction({ sourceCards, playForm, originRank = null, generatedRank = null, viewerMode = 'private' }) {
  if (!sourceCards || sourceCards.length === 0) {
    return { sourceCards: [], sourceRanks: [], primaryRank: null, rankWeights: {}, playForm: playForm ?? 'other', originRank: null, generatedRank: null, attributionStatus: 'not-observable', attributionReason: 'no source cards' };
  }
  const observableCards = sourceCards.filter(c => c.identity && c.identity !== 'UNKNOWN' && c.identity !== null);
  if (observableCards.length === 0) {
    return { sourceCards, sourceRanks: [], primaryRank: null, rankWeights: {}, playForm: playForm ?? 'other', originRank, generatedRank, attributionStatus: 'not-observable', attributionReason: 'all source identities hidden or unknown' };
  }
  const ranks = observableCards.map(c => {
    if (c.rank) return c.rank;
    const parsed = parseIdentity(c.identity);
    return parsed ? parsed.rank : null;
  }).filter(r => r !== null);

  if (playForm === 'generated' && originRank) {
    return { sourceCards, sourceRanks: [originRank], primaryRank: originRank, rankWeights: { [originRank]: 1.0 }, playForm, originRank, generatedRank, attributionStatus: 'generated-origin', attributionReason: `generated effect with origin ${originRank}` };
  }
  const uniqueRanks = [...new Set(ranks)];
  if (uniqueRanks.length === 1) {
    return { sourceCards, sourceRanks: uniqueRanks, primaryRank: uniqueRanks[0], rankWeights: { [uniqueRanks[0]]: 1.0 }, playForm, originRank, generatedRank, attributionStatus: 'exact', attributionReason: 'single-rank source' };
  }
  const weight = 1.0 / uniqueRanks.length;
  const rankWeights = {};
  for (const r of uniqueRanks) rankWeights[r] = weight;
  const sorted = uniqueRanks.sort((a, b) => {
    const da = RANK_REGISTRY[a], db = RANK_REGISTRY[b];
    if (da.prPoints !== db.prPoints) return db.prPoints - da.prPoints;
    return da.scuttleOrder - db.scuttleOrder;
  });
  return { sourceCards, sourceRanks: uniqueRanks, primaryRank: sorted[0], rankWeights, playForm, originRank, generatedRank, attributionStatus: 'fractional', attributionReason: `cross-rank source: ${uniqueRanks.join('+')}` };
}

export function attributeAction(state, action, viewerMode = 'private') {
  if (isNoAttributionAction(action)) {
    return { sourceCards: [], sourceRanks: [], primaryRank: null, rankWeights: {}, playForm: classifyPlayForm(action), originRank: null, generatedRank: null, attributionStatus: 'not-observable', attributionReason: `no-attribution action: ${action.kind}` };
  }
  const sourceCards = buildSourceCards(state, action, viewerMode);
  const playForm = classifyPlayForm(action);
  let originRank = null, generatedRank = null;
  if (playForm === 'generated') {
    if (action.kind === 'topdeck-cast' || action.mode === 'topdeck-cast') originRank = '7';
  }
  if (playForm === 'solo-wild-copy') {
    originRank = '2';
    generatedRank = action.featureVector?.targetRank ?? null;
  }
  return attributeRankAction({ sourceCards, playForm, originRank, generatedRank, viewerMode });
}
