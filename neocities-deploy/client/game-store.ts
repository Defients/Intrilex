import { buildSemanticGame } from './game-model.js';
import type { SemanticGame } from './game-model.js';

export type ActionIntent = Readonly<{
  sessionId: string;
  stateRevision: number;
  decisionFrameHash: string;
  actionId: string;
}>;

export type GameStoreSnapshot = Readonly<{
  game: SemanticGame;
  selectedActionId: string | null;
  interaction: 'idle' | 'selected' | 'submitting' | 'rejected';
  error: string | null;
}>;

type Submit = (intent: ActionIntent) => Promise<{ accepted: boolean; error?: string }>;
type Options = Parameters<typeof buildSemanticGame>[1];
type Pending = Readonly<{ intent: ActionIntent }>;

const REJECTED = 'Action was not accepted. Review the current choices and try again.';
const STALE = 'The available choices changed. Select an action again.';

function sameBoundary(left: SemanticGame, right: SemanticGame): boolean {
  return left.sessionId === right.sessionId && left.revision === right.revision &&
    left.frameHash === right.frameHash && left.self.id === right.self.id;
}

function isCurrent(game: SemanticGame, intent: ActionIntent): boolean {
  return game.status === 'ready' && game.sessionId === intent.sessionId &&
    game.revision === intent.stateRevision && game.frameHash === intent.decisionFrameHash &&
    game.actions.some(action => action.id === intent.actionId);
}

export function createGameStore(submitIntent: Submit) {
  let snapshot: GameStoreSnapshot = Object.freeze({
    game: buildSemanticGame(null), selectedActionId: null, interaction: 'idle', error: null,
  });
  let selected: ActionIntent | null = null;
  let pending: Pending | null = null;
  let acceptedBoundary = false;
  let disposed = false;
  const listeners = new Set<() => void>();

  function publish(next: GameStoreSnapshot): void {
    if (disposed) return;
    snapshot = Object.freeze(next);
    for (const listener of [...listeners]) {
      if (disposed) break;
      if (!listeners.has(listener)) continue;
      try {
        listener();
      } catch {
        continue;
      }
    }
  }

  function getSnapshot(): GameStoreSnapshot {
    return snapshot;
  }

  function subscribe(listener: () => void): () => void {
    if (!disposed) listeners.add(listener);
    return () => { listeners.delete(listener); };
  }

  function update(input: unknown, options?: Options): void {
    if (disposed) return;
    const game = buildSemanticGame(input, options);
    const changed = !sameBoundary(snapshot.game, game);
    const lostSelection = selected !== null && !isCurrent(game, selected);
    if (changed || lostSelection || game.status !== 'ready') {
      const hadSelection = selected !== null;
      selected = null;
      pending = null;
      if (changed) acceptedBoundary = false;
      const stale = hadSelection && game.sessionId === snapshot.game.sessionId && game.status !== 'unavailable' && game.status !== 'completed';
      publish({ game, selectedActionId: null, interaction: stale ? 'rejected' : 'idle', error: game.error ?? (stale ? STALE : null) });
      return;
    }
    publish({ game, selectedActionId: snapshot.selectedActionId, interaction: snapshot.interaction, error: snapshot.error });
  }

  function select(actionId: string | null): void {
    if (disposed || pending !== null || acceptedBoundary) {
      console.warn('[store.select] blocked:', { disposed, pending: pending !== null, acceptedBoundary, actionId });
      return;
    }
    if (actionId === null) {
      if (selected === null && snapshot.interaction === 'idle' && snapshot.error === null) return;
      selected = null;
      publish({ game: snapshot.game, selectedActionId: null, interaction: 'idle', error: snapshot.game.error });
      return;
    }
    const game = snapshot.game;
    if (game.status !== 'ready' || game.revision === null || game.frameHash === null || !game.actions.some(action => action.id === actionId)) {
      selected = null;
      publish({ game, selectedActionId: null, interaction: 'rejected', error: game.error ?? STALE });
      return;
    }
    if (selected?.actionId === actionId && snapshot.interaction === 'selected') return;
    selected = Object.freeze({ sessionId: game.sessionId, stateRevision: game.revision, decisionFrameHash: game.frameHash, actionId });
    publish({ game, selectedActionId: actionId, interaction: 'selected', error: null });
  }

  async function submit(): Promise<boolean> {
    if (disposed || pending !== null || acceptedBoundary || selected === null) {
      console.warn('[store.submit] blocked:', { disposed, pending: pending !== null, acceptedBoundary, selected: selected !== null });
      return false;
    }
    const intent = selected;
    if (!isCurrent(snapshot.game, intent)) {
      selected = null;
      publish({ game: snapshot.game, selectedActionId: null, interaction: 'rejected', error: STALE });
      return false;
    }
    const request: Pending = Object.freeze({ intent });
    pending = request;
    publish({ game: snapshot.game, selectedActionId: intent.actionId, interaction: 'submitting', error: null });
    if (disposed || pending !== request || !isCurrent(snapshot.game, intent)) return false;
    let accepted = false;
    try {
      const result = await submitIntent(intent);
      accepted = result?.accepted === true;
    } catch {
      accepted = false;
    }
    if (disposed || pending !== request || !isCurrent(snapshot.game, intent)) return false;
    pending = null;
    if (accepted) {
      acceptedBoundary = true;
      selected = null;
      publish({ game: snapshot.game, selectedActionId: null, interaction: 'idle', error: null });
    } else {
      publish({ game: snapshot.game, selectedActionId: intent.actionId, interaction: 'rejected', error: REJECTED });
    }
    return accepted;
  }

  function dispose(): void {
    disposed = true;
    selected = null;
    pending = null;
    listeners.clear();
  }

  return Object.freeze({ getSnapshot, subscribe, update, select, submit, dispose });
}

export type GameStore = ReturnType<typeof createGameStore>;
