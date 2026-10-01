// ═══════════════════════════════════════════════════════════════
// action-composition.mjs — Presentation decomposition boundary
//
// Runs at the authority boundary where an enumerated legal action
// still carries its private command. Reads only the public-safe
// semantics a composer needs to present "which copied effect" and
// "which cost card" choices — never returns the command itself.
//
// The engine thinks in legal action variants; the player thinks in
// game decisions. This module is where that boundary starts.
// ═══════════════════════════════════════════════════════════════

/**
 * Engine rank-action kinds that copy a base effect through a wildcard.
 * wild-sovereignty: K♠ copies a Spade base effect (rank 3–7).
 * solo-wild-copy:   a lone 2 copies a same-suit base effect (rank 3–7).
 */
const COPY_RANK_ACTIONS = new Set(['wild-sovereignty', 'solo-wild-copy']);

/**
 * Walk the declared-command chain to the rank action.
 * Commands wrap as { kind: 'core-declare-primary', action: {
 * kind: 'core-resolve-rank-action', action: rankAction } }, but the
 * declaration wrap only applies in advanced-style profiles, so depth
 * varies. Bounded walk keeps this robust instead of positional.
 * @param {*} node - Current nested action payload
 * @returns {*} The rank action, or null
 */
function findRankAction(node) {
  let current = node;
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth += 1) {
    if (COPY_RANK_ACTIONS.has(current.kind)) return current;
    current = current.action;
  }
  return null;
}

/**
 * Decompose an enumerated legal action into player-decision fields.
 *
 * Returned fields (all safe to show the deciding player):
 *   copy   — copied base rank: '3' | '4' | '5' | '6' | '7' | null
 *   effect — copied action kind, e.g. 'three-bounce', 'four-row-clear',
 *            'total-clear', 'recycle-five', 'deep-draw-six-spade',
 *            'topdeck-seven' | null
 *   row    — 'pr' | 'er' for row-scoped copies, else null
 *   costs  — own-hand card IDs spent as declared discard costs.
 *            (Own-hand IDs are already exposed via sourceCardIds.)
 *
 * @param {*} action - Enumerated legal action (raw, with .command)
 * @returns {{ copy: string|null, effect: string|null, row: 'pr'|'er'|null, costs: readonly string[] } | undefined}
 */
export function actionComposition(action) {
  const rankAction = findRankAction(action?.command?.action);
  if (!rankAction) return undefined;
  const copied = rankAction.copiedAction && typeof rankAction.copiedAction === 'object'
    ? rankAction.copiedAction : {};
  const costs = [];
  if (typeof rankAction.discardCostCardId === 'string') costs.push(rankAction.discardCostCardId);
  if (Array.isArray(copied.discardCardIds)) {
    for (const id of copied.discardCardIds) if (typeof id === 'string') costs.push(id);
  }
  return Object.freeze({
    copy: typeof rankAction.targetRank === 'string' ? rankAction.targetRank : null,
    effect: typeof copied.kind === 'string' ? copied.kind : null,
    row: copied.row === 'pr' || copied.row === 'er' ? copied.row : null,
    costs: Object.freeze(costs),
  });
}
