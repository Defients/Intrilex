// Rank Attribution Contract — v0.11.0
// Deterministically assigns rank credit to legal actions, selected decisions,
// and resolutions based on authoritative source card identities.
//
// Rules:
// - Single-rank ordinary play → full credit to that rank
// - Same-rank multi-card Super/Ultra → one declaration for that rank
// - Cross-rank plays (Royal Marriage) → fractional attribution (equal split)
// - Wild-catalyst/enabler → role information exposed (enabler vs payload)
// - Rank 7 generated effects → primary credit to Rank 7 as origin
// - Generated Black Joker ≠ natural Black Joker
// - Scoring to Point Row is rank-linked even when action family is generic 'score'
// - Swap Bar and generic families derive source rank from exact card identities
// - Phase transitions, response declines, automatic advances → no rank attribution
// - Unknown/hidden identities → 'not-observable'; never guess from action mode names

import { parseIdentity, RANK_REGISTRY, CANONICAL_RANKS } from '@intrilex/engine-adapter';
import {
  resolveSuperEffect,
  hasSpadeVariant,
  isPerSuitTenRank,
  perSuitTenForSuit,
  ENTITY_TIER
} from './variant-registry.mjs';

/**
 * Attribution status values:
 * - 'exact': single-rank source, full credit
 * - 'fractional': cross-rank source, split credit
 * - 'generated-origin': rank generated another rank's effect (e.g. Rank 7 → BJ)
 * - 'not-observable': source identity hidden or unavailable
 */

/**
 * Determine the play form from an action's mode/authority fields.
 * @param {object} action - The legal action or selected command
 * @returns {string} play form: base|suit|super|ultra|rank10|royal-marriage|generated|score|swap|other
 */
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

/**
 * Attribute rank credit to an action based on source card identities.
 * @param {object} params
 * @param {Array} params.sourceCards - Array of {entityId, identity, rank, suit, zoneBefore, role}
 * @param {string} params.playForm - from classifyPlayForm
 * @param {string|null} params.originRank - for generated effects, the origin rank
 * @param {string|null} params.generatedRank - for generated effects, the output rank
 * @param {string} params.viewerMode - 'private' or 'public' (affects not-observable)
 * @returns {object} attribution result
 */
export function attributeRankAction({ sourceCards, playForm, originRank = null, generatedRank = null, viewerMode = 'private' }) {
  // No source cards → no attribution
  if (!sourceCards || sourceCards.length === 0) {
    return {
      sourceCards: [],
      sourceRanks: [],
      primaryRank: null,
      rankWeights: {},
      playForm: playForm ?? 'other',
      originRank: null,
      generatedRank: null,
      attributionStatus: 'not-observable',
      attributionReason: 'no source cards'
    };
  }

  // Check for hidden identities
  const observableCards = sourceCards.filter(c => c.identity && c.identity !== 'UNKNOWN' && c.identity !== null);
  if (observableCards.length === 0) {
    return {
      sourceCards,
      sourceRanks: [],
      primaryRank: null,
      rankWeights: {},
      playForm: playForm ?? 'other',
      originRank,
      generatedRank,
      attributionStatus: 'not-observable',
      attributionReason: 'all source identities hidden or unknown'
    };
  }

  // Extract ranks from observable cards
  const ranks = observableCards.map(c => {
    if (c.rank) return c.rank;
    const parsed = parseIdentity(c.identity);
    return parsed ? parsed.rank : null;
  }).filter(r => r !== null);

  // Generated origin (e.g., Rank 7 topdeck-cast producing a BJ effect)
  if (playForm === 'generated' && originRank) {
    return {
      sourceCards,
      sourceRanks: [originRank],
      primaryRank: originRank,
      rankWeights: { [originRank]: 1.0 },
      playForm,
      originRank,
      generatedRank,
      attributionStatus: 'generated-origin',
      attributionReason: `generated effect with origin ${originRank}`
    };
  }

  // Solo Wild Copy: a single 2 copying a rank 3-7 Base effect
  // Attributes to Rank 2 as origin, with the copied rank as generatedRank
  if (playForm === 'solo-wild-copy' && originRank === '2' && generatedRank) {
    return {
      sourceCards,
      sourceRanks: ['2'],
      primaryRank: '2',
      rankWeights: { '2': 1.0 },
      playForm,
      originRank: '2',
      generatedRank,
      attributionStatus: 'generated-origin',
      attributionReason: `solo wild copy of rank ${generatedRank} base effect`
    };
  }

  // Single-rank source → exact attribution
  const uniqueRanks = [...new Set(ranks)];
  if (uniqueRanks.length === 1) {
    return {
      sourceCards,
      sourceRanks: uniqueRanks,
      primaryRank: uniqueRanks[0],
      rankWeights: { [uniqueRanks[0]]: 1.0 },
      playForm,
      originRank,
      generatedRank,
      attributionStatus: 'exact',
      attributionReason: 'single-rank source'
    };
  }

  // Cross-rank source (e.g., Royal Marriage K+Q) → fractional attribution
  // Default: equal split across distinct source ranks
  const weight = 1.0 / uniqueRanks.length;
  const rankWeights = {};
  for (const r of uniqueRanks) rankWeights[r] = weight;

  // Determine primary rank by highest PR points, then lowest scuttle order
  const sorted = uniqueRanks.sort((a, b) => {
    const da = RANK_REGISTRY[a], db = RANK_REGISTRY[b];
    if (da.prPoints !== db.prPoints) return db.prPoints - da.prPoints;
    return da.scuttleOrder - db.scuttleOrder;
  });

  return {
    sourceCards,
    sourceRanks: uniqueRanks,
    primaryRank: sorted[0],
    rankWeights,
    playForm,
    originRank,
    generatedRank,
    attributionStatus: 'fractional',
    attributionReason: `cross-rank source: ${uniqueRanks.join('+')}`
  };
}

/**
 * Build source card descriptors from engine state and action.
 * @param {object} state - Engine state (or authorized view)
 * @param {object} action - Legal action with sourceCardIds
 * @param {string} viewerMode - 'private' or 'public'
 * @returns {Array} source card descriptors
 */
export function buildSourceCards(state, action, viewerMode = 'private') {
  // Support both sourceCardIds (browser) and sourceHandles (Node.js runtime)
  const sourceIds = action.sourceCardIds ?? action.sourceHandles ?? action.sourceEntityIds;
  if (!sourceIds || sourceIds.length === 0) return [];
  const cards = [];
  for (const id of sourceIds) {
    const card = state.cards?.[id];
    if (!card) {
      cards.push({ entityId: id, identity: null, rank: null, suit: null, zoneBefore: null, role: 'source' });
      continue;
    }
    // In public mode, hide identity if card is in a hidden zone
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

/**
 * Check if an action family receives no rank attribution.
 * @param {object} action
 * @returns {boolean} true if action receives no rank attribution
 */
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
  // Phase transitions and setup actions have no source cards
  if (family === 'phase' || kind === 'phase-transition') return true;
  return false;
}

/**
 * Full rank attribution for a decision/action.
 * @param {object} state - Engine state or authorized view
 * @param {object} action - The legal action
 * @param {string} viewerMode - 'private' or 'public'
 * @returns {object} complete attribution record
 */
export function attributeAction(state, action, viewerMode = 'private') {
  if (isNoAttributionAction(action)) {
    return {
      sourceCards: [],
      sourceRanks: [],
      primaryRank: null,
      rankWeights: {},
      playForm: classifyPlayForm(action),
      originRank: null,
      generatedRank: null,
      attributionStatus: 'not-observable',
      attributionReason: `no-attribution action: ${action.kind ?? action.family}`
    };
  }

  const sourceCards = buildSourceCards(state, action, viewerMode);
  const playForm = classifyPlayForm(action);

  // For generated effects, try to determine origin rank from action
  let originRank = null;
  let generatedRank = null;
  if (playForm === 'generated') {
    // Rank 7 topdeck-cast: origin is 7
    if (action.kind === 'topdeck-cast' || action.mode === 'topdeck-cast' || /topdeck/.test(action.mode ?? '')) {
      originRank = '7';
    }
  }
  if (playForm === 'solo-wild-copy') {
    // Solo Wild Copy: a single 2 copying a rank 3-7 Base effect
    // Origin is always Rank 2; generated rank is the copied target rank
    originRank = '2';
    generatedRank = action.featureVector?.targetRank ?? null;
  }

  return attributeRankAction({ sourceCards, playForm, originRank, generatedRank, viewerMode });
}

/**
 * Compute opportunity metrics for a set of legal actions.
 * @param {Array} actions - Legal actions in a single decision frame
 * @param {object} [state] - Engine state containing a `cards` map for identity resolution
 * @returns {object} { opportunityFrameCount, legalOptionCount, rankOpportunities }
 */
export function computeOpportunityMetrics(actions, state) {
  const rankSet = new Set();
  let legalOptionCount = 0;
  for (const action of actions) {
    if (isNoAttributionAction(action)) continue;
    // Extract ranks from action's source card IDs
    const ranks = new Set();
    if (action.sourceCardIds && state?.cards) {
      for (const id of action.sourceCardIds) {
        const card = state?.cards?.[id];
        if (card?.identity) {
          const parsed = parseIdentity(card.identity);
          if (parsed) ranks.add(parsed.rank);
        }
      }
    }
    // Also check action.rank or action.authority for rank hints
    if (action.rank) ranks.add(action.rank);
    for (const r of ranks) {
      rankSet.add(r);
      legalOptionCount++;
    }
  }
  return {
    opportunityFrameCount: rankSet.size > 0 ? 1 : 0,
    legalOptionCount,
    rankOpportunities: [...rankSet]
  };
}

/**
 * Compute opportunity metrics from a decision frame's legal actions.
 * Uses unique opportunity frames (not total legal options) as denominator.
 * @param {Array} legalActions - All legal actions in the frame
 * @param {object} state - Engine state for resolving card identities
 * @returns {object} per-rank opportunity map
 */
export function rankOpportunitiesFromFrame(legalActions, state) {
  const rankMap = new Map(); // rank → { opportunityFrames, legalOptions }
  for (const action of legalActions) {
    if (isNoAttributionAction(action)) continue;
    const ranks = new Set();
    if (action.sourceCardIds && state?.cards) {
      for (const id of action.sourceCardIds) {
        const card = state.cards[id];
        if (card?.identity) {
          const parsed = parseIdentity(card.identity);
          if (parsed) ranks.add(parsed.rank);
        }
      }
    }
    for (const r of ranks) {
      if (!rankMap.has(r)) rankMap.set(r, { opportunityFrames: 1, legalOptions: 1 });
      else rankMap.get(r).legalOptions++;
    }
  }
  return Object.fromEntries(rankMap);
}

// === Variant & Super-Effect Entity Classification ============================
//
// Extends rank attribution with a finer-grained "variant entity" key so that
// Spades variants and individual Super effects are tracked independently of
// the rank-wide aggregate.
//
// Variant entity keys:
//   "<rank>:normal"         — normal suit variants (♣/♦/♥)
//   "<rank>:spade"          — Spades variant
//   "<rank>:super:<id>"     — a single named Super effect
//   "<rank>:super:all"      — combined Super effects on the rank
//
// Every attributed action is also credited to the rank-overall aggregate
// ("<rank>") so existing rank-wide statistics remain unchanged.

/**
 * Determine the suit of the primary source card from an attribution result.
 * @param {object} attribution
 * @returns {string|null} suit symbol or null
 */
function primarySourceSuit(attribution) {
  const cards = attribution.sourceCards ?? [];
  if (cards.length === 0) return null;
  // For exact attribution, the first observable card's suit is authoritative.
  const observable = cards.filter(c => c.suit);
  if (observable.length > 0) return observable[0].suit;
  return null;
}

/**
 * Classify an attribution + action into a variant entity descriptor.
 *
 * Returns the *specific* variant entity (the finest applicable tier), plus the
 * set of all variant keys the action should be credited to (specific tier +
 * rank overall, and for Supers also the combined-super aggregate).
 *
 * @param {object} attribution - result of attributeRankAction / attributeAction
 * @param {object} action - the selected action (used for Super-effect resolution)
 * @returns {object} { variantKey, tier, superEffectId, suit, creditKeys }
 */
export function classifyVariantEntity(attribution, action = {}) {
  if (!attribution || attribution.attributionStatus === 'not-observable' || !attribution.primaryRank) {
    return { variantKey: null, tier: null, superEffectId: null, suit: null, creditKeys: [] };
  }
  const rank = attribution.primaryRank;
  const playForm = attribution.playForm ?? 'other';
  const suit = primarySourceSuit(attribution);
  const creditKeys = [rank]; // always credit the rank-overall aggregate

  // Super effect — resolve the specific named effect from the action.
  if (playForm === 'super') {
    const superEffect = resolveSuperEffect(action);
    if (superEffect && superEffect.rank === rank) {
      const specificKey = `${rank}:super:${superEffect.effectId}`;
      const aggregateKey = `${rank}:super:all`;
      creditKeys.push(specificKey, aggregateKey);
      return {
        variantKey: specificKey,
        tier: ENTITY_TIER.SUPER,
        superEffectId: superEffect.effectId,
        suit,
        creditKeys
      };
    }
    // Super play that could not be resolved to a named effect — credit only
    // the combined-super aggregate so it is not lost.
    const aggregateKey = `${rank}:super:all`;
    creditKeys.push(aggregateKey);
    return {
      variantKey: aggregateKey,
      tier: ENTITY_TIER.SUPER_AGGREGATE,
      superEffectId: null,
      suit,
      creditKeys
    };
  }

  // Per-suit Ten variant — rank 10 has four mechanically distinct effects by
  // suit, each tracked as its own analytical entity (10:club/10:diamond/10:heart/
  // 10:spade) instead of being collapsed into 10:normal/10:spade.
  if (isPerSuitTenRank(rank) && suit) {
    const perSuit = perSuitTenForSuit(suit);
    if (perSuit) {
      creditKeys.push(perSuit.variantKey);
      return { variantKey: perSuit.variantKey, tier: ENTITY_TIER.SUIT, superEffectId: null, suit, creditKeys };
    }
  }

  // Spades variant — only for ranks with a mechanically distinct ♠ variant.
  if (suit === '♠' && hasSpadeVariant(rank)) {
    const spadeKey = `${rank}:spade`;
    creditKeys.push(spadeKey);
    return { variantKey: spadeKey, tier: ENTITY_TIER.SPADE, superEffectId: null, suit, creditKeys };
  }

  // Normal suit variant (♣/♦/♥) — or Jokers / ranks without a ♠ variant.
  const normalKey = `${rank}:normal`;
  creditKeys.push(normalKey);
  return { variantKey: normalKey, tier: ENTITY_TIER.NORMAL, superEffectId: null, suit, creditKeys };
}

/**
 * Full attribution with variant entity classification.
 * @param {object} state - Engine state or authorized view
 * @param {object} action - The legal action
 * @param {string} viewerMode - 'private' or 'public'
 * @returns {object} attribution record augmented with variantEntity fields
 */
export function attributeActionWithVariant(state, action, viewerMode = 'private') {
  const attribution = attributeAction(state, action, viewerMode);
  const variant = classifyVariantEntity(attribution, action);
  return { ...attribution, ...variant };
}

export { CANONICAL_RANKS, RANK_REGISTRY, parseIdentity };
