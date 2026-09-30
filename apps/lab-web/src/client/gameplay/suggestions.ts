import type { SemanticGame } from '../game-model.js';
import { cardPresentation } from '../primitives.js';
import { visibleCards } from './action-family.js';
import { pointValue } from '../../card-face-data.js';

type PolicyAction = { actionId: string; family: string; mode: string; timingClass: string; sourceHandles: readonly string[]; targetHandles: readonly string[]; featureVector: Record<string, number> };
export type SuggestionRanker = (policy: string, actions: readonly PolicyAction[], context: object) => readonly {
  action: PolicyAction;
  score: number;
  scoreComponents: Record<string, number>;
}[];
export type SuggestedMove = { actionId: string; explanation: string };

/** Reuse Intrilex's existing policy decomposition with only the validated player projection. */
export function suggestedMoves(game: SemanticGame, ranker?: SuggestionRanker): readonly SuggestedMove[] {
  if (!ranker || game.status !== 'ready') return [];
  const knownCards: Record<string, { pointValue: number }> = {};
  for (const card of visibleCards(game)) {
    if (!card.identity) continue;
    const definition = cardPresentation(card).definition;
    knownCards[card.id] = { pointValue: definition ? pointValue(definition.rank) : 0 };
  }
  const actions = game.actions.map(action => ({
    actionId: action.id, family: action.family, mode: action.mode ?? '', timingClass: action.timingClass ?? action.timing.toUpperCase(),
    sourceHandles: action.sources, targetHandles: action.targets,
    featureVector: { immediatePoints: action.family === 'score' ? knownCards[action.sources[0]]?.pointValue ?? 0 : 0 },
  }));
  const context = { actorId: game.self.id, authorizedView: {
    own: { securedPoints: game.self.score, goal: game.self.goal, hand: game.self.hand },
    knownCards, stack: game.stack,
  } };
  const reasons: Record<string, string> = {
    terminal: 'The existing policy sees potential to reach your current Goal. Resolution and End Phase checks still apply.',
    points: 'The existing policy favors the visible point contribution or public target value.',
    resource: 'The existing policy favors replenishing resources. Hidden draw results remain unknown.',
    tempo: 'The existing policy favors this timing opportunity.',
    defense: 'The existing policy favors a defensive option available in this decision.',
    synergy: 'The existing policy identifies a public board interaction.',
  };
  try {
    const ranked = ranker('value', actions, context);
    const legal = new Set(game.actions.map(action => action.id));
    const seen = new Set<string>();
    return ranked.filter(item => legal.has(item.action.actionId) && !seen.has(item.action.actionId) && Boolean(seen.add(item.action.actionId)))
      .slice(0, 2).map(item => {
        const component = Object.entries(item.scoreComponents).filter(([key, value]) => reasons[key] && value > 0).sort((a, b) => b[1] - a[1])[0]?.[0];
        return { actionId: item.action.actionId, explanation: component ? reasons[component] : 'A current legal option favored by Intrilex’s existing value policy; this is guidance, not a prediction.' };
      });
  } catch { return []; }
}
