import { Component } from 'react';
import { flushSync } from 'react-dom';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { GameTable } from './game-table';
import type { ChatConfig } from './game-table';
import type { TableCard } from './primitives';
import { createGameStore } from './game-store';
import type { ActionIntent } from './game-store';
import { IntrilexGame } from './gameplay/IntrilexGame';
import type { TeachingSupport } from './gameplay/IntrilexGame';
import type { SuggestionRanker } from './gameplay/suggestions';

declare const __INTRILEX_TACTICAL_CSS__: string;
let stylesReady: Promise<void> | null = null;

export function loadTableStyles(): Promise<void> {
  if (stylesReady) return stylesReady;
  stylesReady = new Promise<void>((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = typeof __INTRILEX_TACTICAL_CSS__ === 'string' ? __INTRILEX_TACTICAL_CSS__ : '/client/game-table.css';
    const timeout = setTimeout(() => finish(false), 10000);
    function finish(ok: boolean) {
      clearTimeout(timeout);
      link.onload = null;
      link.onerror = null;
      if (ok) resolve();
      else { link.remove(); reject(new Error('Tactical styles unavailable')); }
    }
    link.onload = () => finish(true);
    link.onerror = () => finish(false);
    document.head.append(link);
  }).catch(error => { stylesReady = null; throw error; });
  return stylesReady;
}

export type TableOptions = {
  submit: (intent: ActionIntent) => Promise<{ accepted: boolean; error?: string }>;
  onSave?: () => Promise<void>;
  onInspect?: (cardId: string) => void;
  onReorderHand?: (orderedIds: readonly string[]) => void | Promise<void>;
  skin?: string;
  readOnly?: boolean;
  debug?: boolean;
  chat?: ChatConfig;
  /** Face-up opponent hand cards (Caster/omniscient spectating mode). */
  opponentHand?: readonly TableCard[];
  /** Custom HTML injected into the sidebar actions area (Caster rail). */
  railHtml?: string;
  teaching?: TeachingSupport;
  rankSuggestions?: SuggestionRanker;
  onExit?: () => void;
  /** Temporary parity fallback, shared with the existing Caster presentation. */
  legacy?: boolean;
};

// The "Decision evidence" sidebar panel is an engine-fidelity audit surface
// (frame hash, schema version, session UUID, revision) — useful for verifying
// the UI displays exactly what the engine supplied, but not player-facing
// decision support. It is hidden by default and revealed by `?debug`.
function resolveDebug(explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');
  } catch {
    return false;
  }
}

class TableBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <section className="astra-client" role="alert">
      <h2>The Intrilex board could not be displayed.</h2>
      <p>Your match remains in the existing session.</p>
    </section>;
    return this.props.children;
  }
}

export function mountGameTable(container: HTMLElement, input: unknown, options: TableOptions) {
  const store = createGameStore(options.submit);
  store.update(input, { readOnly: options.readOnly, coalesceIdenticalActions: true });
  const host = document.createElement('div');
  container.replaceChildren(host);
  const root = createRoot(host);
  const debug = resolveDebug(options.debug);
  const renderTable = (chat: ChatConfig | undefined, opponentHand: readonly TableCard[] | undefined, railHtml: string | undefined, teaching = options.teaching) => {
    root.render(<TableBoundary>
      {options.legacy
        ? <GameTable store={store} onSave={options.onSave} onInspect={options.onInspect} onReorderHand={options.onReorderHand} skin={options.skin} debug={debug} chat={chat} opponentHand={opponentHand} railHtml={railHtml} />
        : <IntrilexGame opponentHand={opponentHand} railHtml={railHtml} store={store} onSave={options.onSave} onInspect={options.onInspect} onReorderHand={options.onReorderHand} onExit={options.onExit} skin={options.skin} debug={debug} chat={chat} rankSuggestions={options.rankSuggestions} teaching={teaching ? { ...teaching, onAction: options.teaching?.onAction ?? teaching.onAction } : undefined} />}
    </TableBoundary>);
  };
  flushSync(() => renderTable(options.chat, options.opponentHand, options.railHtml));
  let disposed = false;
  // Load the tactical CSS asynchronously. The CSS is compiled by
  // bundle.mjs into tactical.[hash].css and referenced via the
  // __INTRILEX_TACTICAL_CSS__ define. If it fails to load, the
  // board still renders (unstyled) and the error boundary can
  // catch any layout issues. We fire-and-forget to avoid blocking
  // the initial render.
  loadTableStyles().catch((error) => {
    console.warn('[tactical-board] CSS load failed:', error?.message ?? error);
  });
  return {
    update(snapshot: unknown, readOnly = false, chat?: ChatConfig, opponentHand?: readonly TableCard[], railHtml?: string, teaching?: TeachingSupport) {
      if (disposed) return;
      store.update(snapshot, { readOnly, coalesceIdenticalActions: true });
      // Re-render the root when presentational props change. The Caster
      // passes opponentHand/railHtml on every beat; flushSync ensures the
      // DOM is committed before the caller wires up rail controls via
      // querySelector. The player path only re-renders when chat changes.
      const needsRender = chat !== undefined || opponentHand !== undefined || railHtml !== undefined || teaching !== undefined;
      if (needsRender) {
        flushSync(() => renderTable(chat, opponentHand, railHtml, teaching));
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      store.dispose();
      root.unmount();
      host.remove();
    },
  };
}
