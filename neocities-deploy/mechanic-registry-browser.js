// Browser-safe Mechanic Registry — v0.21.0
// Browser port of packages/decision-intelligence/src/mechanic-registry.mjs.
// Provides the canonical mechanic catalog, display/category resolution, and
// tag validation/quarantine used by the observatory analytics builders.
// Uses hashCanonical from the browser engine shim (no Node.js deps).

import { hashCanonical } from './engine/browser-entry.js?v=e2bd7e8507fa';

export const MECHANIC_REGISTRY_VERSION = '1.0.0';

const MECHANIC_DEFINITIONS = [
  { mechanicId: 'play-for-points', displayName: 'Play for Points', category: 'scoring', description: 'Place a card from hand into the Point Row to bank its face value toward the goal.', authorityRefs: ['rules/player-rulebook.md#scoring'], eligibleFamilies: ['score'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'scuttle', displayName: 'Scuttle', category: 'control', description: 'Remove an opponent Point Row card by spending a higher-value card from hand.', authorityRefs: ['rules/player-rulebook.md#scuttle'], eligibleFamilies: ['scuttle'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'draw', displayName: 'Draw', category: 'resource', description: 'Draw a card from the Draw Pile into hand during the Action Phase.', authorityRefs: ['rules/player-rulebook.md#draw'], eligibleFamilies: ['draw'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'swap-bar', displayName: 'Swap Bar', category: 'resource', description: 'Exchange a hand card with a Swap Bar slot, face-up or face-down.', authorityRefs: ['rules/player-rulebook.md#swap-bar'], eligibleFamilies: ['swap-bar'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'effect-three', displayName: 'Peek & Reveal (3)', category: 'response', description: 'Reveal hidden information or peek at opponent hand/swap bar.', authorityRefs: ['rules/player-rulebook.md#effect-3'], eligibleFamilies: ['effect-three'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'effect-four', displayName: 'Scout (4)', category: 'response', description: 'Scout opponent hand and optionally force a swap.', authorityRefs: ['rules/player-rulebook.md#effect-4'], eligibleFamilies: ['effect-four'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'effect-five', displayName: 'Disrupt & Steal (5)', category: 'control', description: 'Disrupt opponent board presence or steal a card.', authorityRefs: ['rules/player-rulebook.md#effect-5'], eligibleFamilies: ['effect-five'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'effect-six', displayName: 'Recycle (6)', category: 'resource', description: 'Recover a card from the Graveyard or recycle resources.', authorityRefs: ['rules/player-rulebook.md#effect-6'], eligibleFamilies: ['effect-six'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'effect-seven', displayName: 'Multi-Draw (7)', category: 'resource', description: 'Draw multiple cards or perform a multi-card action.', authorityRefs: ['rules/player-rulebook.md#effect-7'], eligibleFamilies: ['effect-seven'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'effect-nine', displayName: 'Anchor Guard (9)', category: 'protection', description: 'Protect board presence or anchor a card against disruption.', authorityRefs: ['rules/player-rulebook.md#effect-9'], eligibleFamilies: ['effect-nine'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'effect-red-joker', displayName: 'Red Joker Effect', category: 'control', description: 'High-impact Red Joker effect with broad board interaction.', authorityRefs: ['rules/player-rulebook.md#effect-red-joker'], eligibleFamilies: ['effect-red-joker'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'effect-board-lock', displayName: 'Board Lock', category: 'control', description: 'Lock the board state, preventing certain card placements.', authorityRefs: ['rules/player-rulebook.md#effect-board-lock'], eligibleFamilies: ['effect-board-lock'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'effect-row-clear', displayName: 'Row Clear', category: 'control', description: 'Clear a board row, removing all cards in a target row.', authorityRefs: ['rules/player-rulebook.md#effect-row-clear'], eligibleFamilies: ['effect-row-clear'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'effect-tap', displayName: 'Tap', category: 'control', description: 'Tap an opponent card, exhausting its ability to respond.', authorityRefs: ['rules/player-rulebook.md#effect-tap'], eligibleFamilies: ['effect-tap'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'effect-goal-shift', displayName: 'Goal Shift', category: 'scoring', description: 'Shift the goal target, altering win conditions.', authorityRefs: ['rules/player-rulebook.md#effect-goal-shift'], eligibleFamilies: ['effect-goal-shift'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'effect-jack-control', displayName: 'Jack Control', category: 'control', description: 'Take control of an opponent card using a Jack.', authorityRefs: ['rules/player-rulebook.md#effect-jack-control'], eligibleFamilies: ['effect-jack-control'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'effect-private-choice', displayName: 'Private Choice Effect', category: 'advanced', description: 'Effect that initiates a private choice selection.', authorityRefs: ['rules/player-rulebook.md#effect-private-choice'], eligibleFamilies: ['effect-private-choice'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'anchor', displayName: 'Anchor', category: 'protection', description: 'Anchor a card to protect it and provide board stability.', authorityRefs: ['rules/player-rulebook.md#anchor'], eligibleFamilies: ['anchor'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'anchor-guard', displayName: 'Anchor Guard', category: 'protection', description: 'Guard an anchor or protected target against disruption.', authorityRefs: ['rules/player-rulebook.md#anchor-guard'], eligibleFamilies: ['anchor-guard'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'anchor-private-choice', displayName: 'Anchor Private Choice', category: 'advanced', description: 'Anchor mechanic involving a private choice selection.', authorityRefs: ['rules/player-rulebook.md#anchor-private-choice'], eligibleFamilies: ['anchor-private-choice'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'attachment', displayName: 'Attachment', category: 'control', description: 'Attach a card to another card as a modifier.', authorityRefs: ['rules/player-rulebook.md#attachment'], eligibleFamilies: ['attachment'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'royal-marriage', displayName: 'Royal Marriage', category: 'advanced', description: 'Combine King and Queen of the same suit for a powerful effect.', authorityRefs: ['rules/player-rulebook.md#royal-marriage'], eligibleFamilies: ['royal-marriage'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'super', displayName: 'Super Play', category: 'advanced', description: 'Super mechanic combining multiple cards for enhanced effect.', authorityRefs: ['rules/player-rulebook.md#super'], eligibleFamilies: ['super'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'rank10', displayName: 'Rank 10 Mechanic', category: 'advanced', description: 'Rank 10 advanced mechanic including Stack Theft variants.', authorityRefs: ['rules/player-rulebook.md#rank10'], eligibleFamilies: ['rank10'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'ultra', displayName: 'Ultra', category: 'terminal', description: 'Ultra mechanic — high-impact advanced declaration with declaration restrictions.', authorityRefs: ['rules/player-rulebook.md#ultra'], eligibleFamilies: ['ultra'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'voltage', displayName: 'Voltage', category: 'terminal', description: 'Voltage trigger mechanic advancing toward terminal resolution.', authorityRefs: ['rules/player-rulebook.md#voltage'], eligibleFamilies: ['voltage'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'counter', displayName: 'Counter', category: 'response', description: 'Counter an opponent effect or response on the Stack.', authorityRefs: ['rules/player-rulebook.md#counter'], eligibleFamilies: ['counter'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'disrupt', displayName: 'Disrupt', category: 'response', description: 'Disrupt opponent play through various means (scuttle, tap, aegis, theft).', authorityRefs: ['rules/player-rulebook.md#disrupt'], eligibleFamilies: ['disrupt'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'exhausted-pass', displayName: 'Exhausted Pass', category: 'terminal', description: 'Forced pass when no legal mini-turn action is available — the only gameplay Pass.', authorityRefs: ['rules/player-rulebook.md#exhausted-pass'], eligibleFamilies: ['exhausted-pass'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'private-choice', displayName: 'Private Choice', category: 'advanced', description: 'Private choice selection from hidden options.', authorityRefs: ['rules/player-rulebook.md#private-choice'], eligibleFamilies: ['private-choice'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'rank10-club-foundation', displayName: '10♣ Foundation', category: 'advanced', description: 'Score 10♣ with a queued scoring trigger for bonus score opportunity.', authorityRefs: ['rules/player-rulebook.md#rank10-club'], eligibleFamilies: ['rank10-club-foundation'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'rank10-diamond-mimic', displayName: '10♦ Mimic', category: 'advanced', description: 'Exile 10♦ to copy a generated effect from a Graveyard target.', authorityRefs: ['rules/player-rulebook.md#rank10-diamond'], eligibleFamilies: ['rank10-diamond-mimic'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'super-two-hold', displayName: '⭐2 Hold', category: 'advanced', description: 'Super Two Hold: seize enemy OTT card for Start-child continuation.', authorityRefs: ['rules/player-rulebook.md#super-two-hold'], eligibleFamilies: ['super-two-hold'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'super-three-private', displayName: '⭐3 Private', category: 'advanced', description: 'Super Three private: hidden hand raid with expanded capacity.', authorityRefs: ['rules/player-rulebook.md#super-three-private'], eligibleFamilies: ['super-three-private'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'super-five-private', displayName: '⭐5 Private', category: 'advanced', description: 'Super Five private: expanded recycle with multi-rummage from GY.', authorityRefs: ['rules/player-rulebook.md#super-five-private'], eligibleFamilies: ['super-five-private'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'super-six-private', displayName: '⭐6 Private', category: 'advanced', description: 'Super Six private: deep dig with expanded draw and keep capacity.', authorityRefs: ['rules/player-rulebook.md#super-six-private'], eligibleFamilies: ['super-six-private'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'super-seven-sequential', displayName: '⭐7 Sequential', category: 'advanced', description: 'Super Seven sequential: triple topdeck reveal with flexible assignment.', authorityRefs: ['rules/player-rulebook.md#super-seven-sequential'], eligibleFamilies: ['super-seven-sequential'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'voltage-three-choice', displayName: 'Voltage 3 Choice', category: 'terminal', description: 'Voltage 3: threshold choice between hand draw and GY scoring.', authorityRefs: ['rules/player-rulebook.md#voltage-three'], eligibleFamilies: ['voltage-three-choice'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'voltage-four-prediction', displayName: 'Voltage 4 Prediction', category: 'terminal', description: 'Voltage 4: private prediction of topdeck rank for scoring.', authorityRefs: ['rules/player-rulebook.md#voltage-four'], eligibleFamilies: ['voltage-four-prediction'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'voltage-five-refine', displayName: 'Voltage 5 Refine', category: 'terminal', description: 'Voltage 5: refine branch with discard-to-draw continuation.', authorityRefs: ['rules/player-rulebook.md#voltage-five'], eligibleFamilies: ['voltage-five-refine'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'special-scoring-riders', displayName: 'Special Scoring Riders', category: 'scoring', description: 'Special scoring riders for 7, 10♣, and BJ in Advanced Core profile.', authorityRefs: ['rules/player-rulebook.md#scoring-riders'], eligibleFamilies: ['special-scoring-riders'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true },
  { mechanicId: 'sudden-death', displayName: 'Sudden Death', category: 'terminal', description: 'Sudden Death: activate terminal countdown to force game resolution.', authorityRefs: ['rules/player-rulebook.md#sudden-death'], eligibleFamilies: ['sudden-death'], primaryEligible: true, secondaryEligible: false, structural: false, analyticsEnabled: true }
];

const EXCLUDED_FROM_DISCOVERY = new Set([
  'phase', 'enter-action', 'points', 'ordinary', 'top', 'decline', 'response-decline',
  'forced-mini-turn', 'instant', 'quick', 'interrupt', 'score', 'exhausted-pass',
  'private-choice', 'effect-private-choice', 'anchor-private-choice',
  'ACTION', 'SETUP', 'INSTANT', 'QUICK', 'INTERRUPT',
  'draw', 'discard', 'recycle', 'rummage', 'exhausted', 'goal', 'trigger',
  'unclassified', '♣', '♦', '♥', '♠'
]);

export const MECHANIC_REGISTRY = Object.freeze(
  Object.fromEntries(MECHANIC_DEFINITIONS.map((def) => [def.mechanicId, Object.freeze(def)]))
);

export function mechanicRegistryHash() {
  return hashCanonical({ version: MECHANIC_REGISTRY_VERSION, mechanics: MECHANIC_DEFINITIONS });
}

export function resolveMechanicId(family, mode) {
  if (!family) return null;
  if (MECHANIC_REGISTRY[family]) return family;
  if (mode && MECHANIC_REGISTRY[mode]) return mode;
  return null;
}

export function mechanicDisplayName(mechanicId) {
  return MECHANIC_REGISTRY[mechanicId]?.displayName ?? mechanicId;
}

export function mechanicCategory(mechanicId) {
  return MECHANIC_REGISTRY[mechanicId]?.category ?? 'unknown';
}

export function isAnalyticsEnabled(mechanicId) {
  return MECHANIC_REGISTRY[mechanicId]?.analyticsEnabled ?? false;
}

export function isExcludedFromDiscovery(mechanicId) {
  return EXCLUDED_FROM_DISCOVERY.has(mechanicId);
}

export function analyticsEligibleMechanics() {
  return MECHANIC_DEFINITIONS.filter((def) => def.analyticsEnabled && !isExcludedFromDiscovery(def.mechanicId));
}

export function validateMechanicTags(tags) {
  const known = [], unknown = [];
  for (const tag of tags) {
    if (MECHANIC_REGISTRY[tag]) known.push(tag);
    else unknown.push(tag);
  }
  return { valid: unknown.length === 0, known, unknown };
}

export function quarantineUnknownTags(tags) {
  const { unknown } = validateMechanicTags(tags);
  return unknown.map((tag) => ({ tag, status: 'QUARANTINED', reason: 'No canonical mechanic registry entry' }));
}

// ── Taxonomy Dimensions (browser port of mechanic-registry.mjs) ──
export const TAXONOMY_DIMENSIONS = Object.freeze([
  'canonical-mechanic', 'action-family', 'action-mode', 'rank-effect', 'diagnostic',
]);

const ACTION_FAMILY_TAGS = new Set([
  'phase', 'response-decline', 'private-choice', 'pass',
  'instant', 'quick', 'interrupt',
  'score',
]);

const ACTION_MODE_TAGS = new Set([
  'face-down', 'face-up', 'enter-action', 'decline', 'points', 'ordinary', 'top',
  'forced-mini-turn', 'exhausted-pass', 'face-up-draw',
  '♣', '♦', '♥', '♠',
]);

const RANK_EFFECT_TAGS = new Set([
  'effect-three', 'effect-four', 'effect-five', 'effect-six', 'effect-seven',
  'effect-nine', 'effect-red-joker', 'effect-board-lock', 'effect-row-clear',
  'effect-tap', 'effect-goal-shift', 'effect-jack-control', 'effect-private-choice',
  'rank10', 'rank10-club-foundation', 'rank10-diamond-mimic', 'rank10-stack-theft',
  'super-two-hold', 'super-three-private', 'super-five-private',
  'super-six-private', 'super-seven-sequential',
  'voltage-three-choice', 'voltage-four-prediction', 'voltage-five-refine',
  'special-scoring-riders', 'sudden-death',
  'ace', 'jack', 'queen', 'king', 'nine',
  'ace-base', 'ace-anchor', 'ace-spade',
  'seven-topdeck', 'five-recycle', 'six-dig', 'hand-swap',
  'self-reset', 'shuffle-reset',
  'club-foundation', 'club-foundation-bonus',
  'three-black-queen', 'three-red-counter',
  'eight-aegis-field', 'five-gy-bottom',
  '2-black-2-red-draw', '2-black-2-red-rummage',
  'board-lock', 'bounce-top', 'clear-er', 'clear-pr',
  'opponent-attack',
]);

const DIAGNOSTIC_TAGS = new Set([
  'discard', 'recycle', 'rummage', 'exhausted', 'goal', 'trigger',
  'ACTION', 'SETUP', 'INSTANT', 'QUICK', 'INTERRUPT',
  'unclassified',
]);

export function classifyTagDimension(tag) {
  if (!tag) return 'diagnostic';
  if (DIAGNOSTIC_TAGS.has(tag)) return 'diagnostic';
  if (ACTION_MODE_TAGS.has(tag)) return 'action-mode';
  if (RANK_EFFECT_TAGS.has(tag)) return 'rank-effect';
  if (ACTION_FAMILY_TAGS.has(tag)) return 'action-family';
  if (MECHANIC_REGISTRY[tag]) return 'canonical-mechanic';
  return 'diagnostic';
}

export function analyticsEntityDefinition(tag) {
  const dimension = classifyTagDimension(tag);
  const registryEntry = MECHANIC_REGISTRY[tag];
  if (registryEntry) {
    return { id: tag, label: registryEntry.displayName, dimension, description: registryEntry.description, source: registryEntry.authorityRefs?.[0], deprecated: dimension === 'diagnostic' };
  }
  return { id: tag, label: tag, dimension, description: dimension === 'diagnostic' ? 'Diagnostic/implementation tag — not a gameplay mechanic.' : 'Unregistered telemetry tag — pending canonical classification.', deprecated: dimension === 'diagnostic' };
}

export function synergyExcludedTags() {
  return new Set([...DIAGNOSTIC_TAGS, ...ACTION_FAMILY_TAGS, 'exhausted-pass', 'private-choice', 'effect-private-choice', 'anchor-private-choice']);
}

export function areTagsInseparable(a, b) {
  if (a === b) return true;
  if ((a === 'super' && b.startsWith('super-')) || (b === 'super' && a.startsWith('super-'))) return true;
  if ((a === 'voltage' && b.startsWith('voltage-')) || (b === 'voltage' && a.startsWith('voltage-'))) return true;
  if ((a === 'rank10' && b.startsWith('rank10-')) || (b === 'rank10' && a.startsWith('rank10-'))) return true;
  return false;
}
