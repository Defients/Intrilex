// ═══════════════════════════════════════════════════════════════
// guided-card-conservation.mjs — Card conservation validation
//
// Verifies that exactly 54 physical card identities exist, no duplicates,
// no missing identities, and each card is in exactly one zone. Used by
// the fixture validator and as a reusable utility for any scenario.
// ═══════════════════════════════════════════════════════════════

const SUITS = ['♣', '♦', '♥', '♠'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/** The canonical set of 54 Intrilex card identities. */
export const CANONICAL_IDENTITIES = Object.freeze([
  ...SUITS.flatMap((suit) => RANKS.map((rank) => `${rank}${suit}`)),
  'RJ',
  'BJ',
]);

/**
 * Validate a predeterminedIdentities array for card conservation.
 * @param {string[]} identities
 * @returns {{ valid: boolean, issues: string[] }}
 */
export function validateIdentities(identities) {
  const issues = [];
  if (!Array.isArray(identities)) {
    return { valid: false, issues: ['identities must be an array'] };
  }
  if (identities.length !== 54) {
    issues.push(`Expected exactly 54 identities, got ${identities.length}`);
  }
  const canon = new Set(CANONICAL_IDENTITIES);
  const seen = new Set();
  for (const id of identities) {
    if (!canon.has(id)) {
      issues.push(`Invalid identity "${id}" — not a canonical Intrilex card`);
    }
    if (seen.has(id)) {
      issues.push(`Duplicate identity "${id}"`);
    }
    seen.add(id);
  }
  // Check for missing identities
  for (const id of CANONICAL_IDENTITIES) {
    if (!seen.has(id)) {
      issues.push(`Missing identity "${id}"`);
    }
  }
  return { valid: issues.length === 0, issues };
}

/**
 * Validate card conservation in a live engine state — every card exists
 * in exactly one zone, no duplicates across zones.
 * @param {object} state - Engine state
 * @returns {{ valid: boolean, issues: string[], identityCounts: Map<string, number> }}
 */
export function validateStateConservation(state) {
  const issues = [];
  const identityCounts = new Map();
  const cardIds = new Set();

  // Collect all card IDs from all zones
  const zones = [];

  // Player zones
  for (const playerId of Object.keys(state.players)) {
    const p = state.players[playerId];
    if (p.hand) zones.push(...p.hand.map((id) => ({ id, zone: `${playerId}_HAND` })));
    if (p.pr) zones.push(...p.pr.map((id) => ({ id, zone: `${playerId}_PR` })));
    if (p.er) zones.push(...p.er.map((id) => ({ id, zone: `${playerId}_ER` })));
  }

  // Shared zones
  if (state.zones) {
    if (state.zones.dp) zones.push(...state.zones.dp.map((id) => ({ id, zone: 'DP' })));
    if (state.zones.gy) zones.push(...state.zones.gy.map((id) => ({ id, zone: 'GY' })));
    if (state.zones.exile) zones.push(...state.zones.exile.map((id) => ({ id, zone: 'EXILE' })));
    if (state.zones.swapBar) zones.push(...state.zones.swapBar.map((id) => ({ id, zone: 'SWAP_BAR' })));
  }

  // Stack items may reference cards, but these cards are still in their
  // original zones (PR, ER, hand, etc.) — the stack just references them.
  // We do NOT count stack references as separate zone placements.

  // Check for duplicate card IDs across zones
  for (const { id, zone } of zones) {
    if (cardIds.has(id)) {
      issues.push(`Card ${id} appears in multiple zones (duplicate at ${zone})`);
    }
    cardIds.add(id);
    const card = state.cards?.[id];
    if (card) {
      const identity = card.identity;
      identityCounts.set(identity, (identityCounts.get(identity) ?? 0) + 1);
    }
  }

  // Check for duplicate identities
  for (const [identity, count] of identityCounts) {
    if (count > 1) {
      issues.push(`Identity "${identity}" appears ${count} times in the state`);
    }
  }

  // Verify total card count
  const totalCards = Object.keys(state.cards ?? {}).length;
  if (totalCards !== 54) {
    issues.push(`Expected 54 total cards in registry, got ${totalCards}`);
  }

  return { valid: issues.length === 0, issues, identityCounts };
}

/**
 * Get a snapshot of all card locations in the state.
 * @param {object} state
 * @returns {{ identity: string, cardId: string, zone: string, controllerId: string }[]}
 */
export function cardLocationSnapshot(state) {
  const snapshot = [];
  for (const [cardId, card] of Object.entries(state.cards ?? {})) {
    snapshot.push({
      identity: card.identity,
      cardId,
      zone: card.zone,
      controllerId: card.controllerId,
    });
  }
  return snapshot.sort((a, b) => a.identity.localeCompare(b.identity));
}
