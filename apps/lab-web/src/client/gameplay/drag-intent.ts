import type { SemanticAction, SemanticGame } from '../game-model.js';
import { buildActionEntries, decisionBoundary, needsCompositionConfirmation, visibleCards } from './action-family.js';

export type SpatialRef = Readonly<{ kind: 'card' | 'zone' | 'player' | 'pending-play' | 'ability'; id: string }>;
export type GestureHint = Readonly<{ sources: readonly SpatialRef[]; destinations: readonly SpatialRef[] }>;
export type GestureAdapter = (game: SemanticGame, action: SemanticAction) => GestureHint;
export type DragIntent = Readonly<{ boundary: string; source: SpatialRef; destination: SpatialRef }>;
export type DragResolution = Readonly<{ status: 'invalid' | 'single-action' | 'ambiguous'; actions: readonly SemanticAction[] }>;
export const spatialKey = (ref: SpatialRef): string => JSON.stringify([ref.kind, ref.id]);
export const rowRef = (playerId: string, row: 'points' | 'enduring'): SpatialRef => ({ kind: 'zone', id: `${playerId}:${row}` });

/** Presentation metadata for already enumerated actions. No rank, cost or timing predicates. */
export function actionGesture(game: SemanticGame, action: SemanticAction): GestureHint {
  // A single dragged component must never implicitly declare an entire combo.
  const sources: SpatialRef[] = action.sources.length === 1 ? [{ kind: 'card', id: action.sources[0] }] : [];
  const destinations: SpatialRef[] = [];
  if (action.family === 'anchor' || action.family === 'anchor-guard' || action.family === 'anchor-private-choice') {
    destinations.push(rowRef(game.self.id, 'enduring'));
  } else if (action.family === 'score') {
    destinations.push(rowRef(game.self.id, 'points'));
  } else if (action.family === 'swap-bar' && action.swapSlot !== undefined) {
    destinations.push({ kind: 'zone', id: `swap:${action.swapSlot}` });
  }
  const cards = new Set(visibleCards(game).filter(card => card.identity !== null).map(card => card.id));
  for (const id of action.targets) {
    if (cards.has(id)) destinations.push({ kind: 'card', id });
    else if (game.stack.some(item => item.id === id)) destinations.push({ kind: 'pending-play', id });
    else if (id === game.self.id || id === game.opponent.id) destinations.push({ kind: 'player', id });
  }
  return { sources, destinations };
}

export function dragDestinations(game: SemanticGame, source: SpatialRef, describe: GestureAdapter = actionGesture): readonly SpatialRef[] {
  if (game.status !== 'ready') return [];
  const result = new Map<string, SpatialRef>();
  for (const action of game.actions) {
    const hint = describe(game, action);
    if (hint.sources.some(ref => spatialKey(ref) === spatialKey(source))) {
      for (const destination of hint.destinations) result.set(spatialKey(destination), destination);
    }
  }
  return [...result.values()];
}

/** Called again on release and chooser selection using the live projected decision. */
export function resolveDragIntent(game: SemanticGame, intent: DragIntent, describe: GestureAdapter = actionGesture): DragResolution {
  if (game.status !== 'ready' || decisionBoundary(game) !== intent.boundary) return { status: 'invalid', actions: [] };
  const actions = game.actions.filter(action => {
    const hint = describe(game, action);
    return hint.sources.some(ref => spatialKey(ref) === spatialKey(intent.source)) &&
      hint.destinations.some(ref => spatialKey(ref) === spatialKey(intent.destination));
  });
  return { status: actions.length === 0 ? 'invalid' : actions.length === 1 ? 'single-action' : 'ambiguous', actions };
}

export function dragNeedsConfirmation(game: SemanticGame, action: SemanticAction): boolean {
  const entry = buildActionEntries(game.actions).find(entry => entry.kind === 'action' ? entry.action.id === action.id : entry.family.variants.some(variant => variant.id === action.id));
  return action.sources.length > 1 || action.targets.length > 1 || Boolean(entry?.kind === 'family' && needsCompositionConfirmation(entry.family));
}

export type TargetGeometry = Readonly<{ key: string; left: number; top: number; right: number; bottom: number }>;
/** Viewport coordinates for both pointer and transformed DOM rectangles. Nested cards win. */
export function hitDragTarget(targets: readonly TargetGeometry[], x: number, y: number): string | null {
  let best: { key: string; distance: number; area: number } | null = null;
  for (const rect of targets) {
    const width = rect.right - rect.left, height = rect.bottom - rect.top;
    if (width <= 0 || height <= 0) continue;
    const distance = Math.hypot(Math.max(rect.left - x, 0, x - rect.right), Math.max(rect.top - y, 0, y - rect.bottom));
    const radius = Math.min(32, Math.max(20, Math.min(width, height) * .2));
    if (distance > radius) continue;
    const area = width * height;
    if (!best || distance < best.distance || (distance === best.distance && area < best.area)) best = { key: rect.key, distance, area };
  }
  return best?.key ?? null;
}
