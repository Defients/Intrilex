import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { GameStore } from '../game-store.js';
import type { SemanticCard, SemanticGame } from '../game-model.js';
import { CardFace, CardReference, Icon, Wordmark, formatLabel } from '../primitives.js';
import { ChatPanel, type ChatConfig } from '../game-table.js';
import { ActionRail, type ComposerState } from './ActionRail.js';
import { actionPreview, boardOptions, buildActionEntries, decisionBoundary, effectiveSelection, reconcileSelection, resolvedAction, selectOption, visibleCards } from './action-family.js';
import type { ActionFamily } from './action-family.js';
import { suggestedMoves, type SuggestionRanker } from './suggestions.js';

export type TeachingSupport = {
  panelHtml: string;
  coachmarkHtml: string;
  onAction: (action: string) => void;
};
export type IntrilexGameProps = {
  store: GameStore;
  onSave?: () => Promise<void>;
  onInspect?: (cardId: string) => void;
  onReorderHand?: (orderedIds: readonly string[]) => void | Promise<void>;
  onExit?: () => void;
  skin?: string;
  debug?: boolean;
  chat?: ChatConfig;
  rankSuggestions?: SuggestionRanker;
  teaching?: TeachingSupport;
};

function Section({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return <section className={`hc-panel ${className}`} aria-label={title}><h2>{title}</h2>{children}</section>;
}

function Summary({ game, opponent = false }: { game: SemanticGame; opponent?: boolean }) {
  const player = opponent ? game.opponent : game.self;
  return <section className="hc-summary" data-opponent={opponent} aria-label={`${player.name} summary`}>
    <div><span className="hc-eyebrow">{opponent ? 'Opponent' : 'You'}{game.activePlayerId === player.id ? ' · active' : ''}</span><strong>{player.name}</strong></div>
    <p data-testid={opponent ? 'opponent-score' : 'self-score'}><b>{player.score}</b><span>/ {player.goal}</span></p>
    <progress max={Math.max(1, player.goal)} value={Math.max(0, Math.min(player.goal, player.score))} aria-label={`${player.name} Goal progress`} />
  </section>;
}

function GameLog({ game }: { game: SemanticGame }) {
  const end = useRef<HTMLLIElement>(null);
  const scroller = useRef<HTMLOListElement>(null);
  const pinned = useRef(true);
  useEffect(() => { if (pinned.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [game.events]);
  return <Section title="Game Log" className="hc-log">
    <ol ref={scroller} tabIndex={0} aria-label="Game events in chronological order" onScroll={() => {
      const el = scroller.current; if (el) pinned.current = el.scrollHeight - el.clientHeight - el.scrollTop < 20;
    }}>
      {game.events.map((event, index) => <li key={event.id} ref={index === game.events.length - 1 ? end : undefined}
        data-actor={event.actorId === game.self.id ? 'self' : event.actorId === game.opponent.id ? 'opponent' : 'system'}>
        <span>{event.actorId === game.self.id ? game.self.name : event.actorId === game.opponent.id ? game.opponent.name : 'System'}</span>
        <strong>{event.label}</strong>
      </li>)}
    </ol>
    {!game.events.length && <p className="hc-empty">No public events yet.</p>}
  </Section>;
}

export function IntrilexGame(props: IntrilexGameProps) {
  const { store } = props;
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const snapshot = useSyncExternalStore(subscribe, store.getSnapshot, store.getSnapshot);
  return <MatchChat.Provider value={props.chat}><StableGameSession key={snapshot.game.sessionId || 'unavailable'} {...props} chat={undefined} network={Boolean(props.chat?.modeLabel?.includes('NETWORK'))} snapshot={snapshot} /></MatchChat.Provider>;
}

const MatchChat = createContext<ChatConfig | undefined>(undefined);
function GameChat() {
  const chat = useContext(MatchChat);
  const [open, setOpen] = useState(false);
  return chat ? <ChatPanel config={{ ...chat, hidden: !open || chat.hidden, onToggleHidden: hidden => {
    setOpen(!hidden); chat.onToggleHidden?.(hidden);
  } }} /> : null;
}

type SessionProps = IntrilexGameProps & { snapshot: ReturnType<GameStore['getSnapshot']>; network: boolean };
const StableGameSession = memo(GameSession, (a, b) => a.snapshot === b.snapshot && a.store === b.store &&
  a.onSave === b.onSave && a.onInspect === b.onInspect && a.onReorderHand === b.onReorderHand && a.onExit === b.onExit &&
  a.skin === b.skin && a.debug === b.debug && a.network === b.network && a.rankSuggestions === b.rankSuggestions &&
  a.teaching?.panelHtml === b.teaching?.panelHtml && a.teaching?.coachmarkHtml === b.teaching?.coachmarkHtml && a.teaching?.onAction === b.teaching?.onAction);

function GameSession({ store, snapshot, onSave, onInspect, onReorderHand, onExit, skin = 'dark', debug, network, rankSuggestions, teaching }: SessionProps) {
  const { game } = snapshot;
  const boundary = decisionBoundary(game);
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState('');
  const [handOrder, setHandOrder] = useState<readonly string[]>(game.handOrder ?? []);
  const [search, setSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(true);
  const inFlight = useRef(false);
  const saving = useRef(false);
  const activeComposer = composer?.boundary === boundary ? composer : null;
  const entries = useMemo(() => buildActionEntries(game.actions), [game.actions]);
  const family = activeComposer ? entries.find(entry => entry.kind === 'family' && entry.family.id === activeComposer.familyId) : undefined;
  const openFamily = family?.kind === 'family' ? family.family : undefined;
  const highlighted = openFamily && activeComposer ? boardOptions(game, openFamily, activeComposer.selection, activeComposer.activeKey) : [];
  const suggestions = useMemo(() => showSuggestions ? suggestedMoves(game, rankSuggestions) : [], [game, rankSuggestions, showSuggestions]);
  const cards = visibleCards(game);
  const inspected = cards.find(card => card.id === inspectId && card.identity !== null) ?? null;
  const selected = game.actions.find(action => action.id === snapshot.selectedActionId);
  const blocked = game.status !== 'ready' || snapshot.interaction === 'submitting';
  const skinName = ['dark', 'light', 'cosmotech', 'corrupture'].includes(skin) ? skin : 'dark';
  const status = game.status === 'completed' ? 'Match complete' : game.status === 'unavailable' ? 'Table unavailable' : game.connection === 'DISCONNECTED' ? 'Opponent disconnected · awaiting reconnect' : game.status === 'ready' ? game.choice ? 'Your choice' : game.stack.length ? 'Your response' : 'Your move' : 'Waiting for the next decision';
  const visibleEntries = entries.filter(entry => !search || (entry.kind === 'family' ? entry.family.title : entry.action.label).toLocaleLowerCase().includes(search.toLocaleLowerCase()));

  useEffect(() => { setComposer(null); setInspectId(null); setSearch(''); }, [boundary]);
  useEffect(() => { if (game.handOrder) setHandOrder(game.handOrder); }, [game.handOrder]);
  useEffect(() => {
    if (!activeComposer) return;
    if (!openFamily) { setComposer(null); return; }
    const selection = reconcileSelection(openFamily, activeComposer.selection);
    if (JSON.stringify(selection) !== JSON.stringify(activeComposer.selection)) setComposer({ ...activeComposer, selection });
  }, [openFamily, activeComposer]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setInspectId(null); setComposer(null); store.select(null); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [store]);

  function choose(actionId: string) {
    if (blocked || decisionBoundary(store.getSnapshot().game) !== boundary) return;
    store.select(actionId);
  }
  async function confirm(actionId: string) {
    if (blocked || inFlight.current || decisionBoundary(store.getSnapshot().game) !== boundary) return;
    const current = store.getSnapshot().game.actions.find(action => action.id === actionId);
    if (!current) return;
    store.select(actionId);
    if (store.getSnapshot().selectedActionId !== actionId) return;
    inFlight.current = true;
    try { if (await store.submit()) setComposer(null); } finally { inFlight.current = false; }
  }
  function open(next: ActionFamily, swapSlot?: number) {
    if (blocked) return;
    store.select(null); setInspectId(null); setSearch('');
    const selection = swapSlot === undefined ? {} : selectOption(next, {}, 'slot', String(swapSlot));
    setComposer({ boundary, familyId: next.id, selection, activeKey: next.parameters.find(p => selection[p.key] === undefined)?.key ?? next.parameters[0]?.key ?? '' });
  }
  function pick(card: SemanticCard) {
    const option = highlighted.find(item => item.entityId === card.id);
    if (!blocked && option && openFamily && activeComposer) {
      setComposer({ ...activeComposer, selection: selectOption(openFamily, activeComposer.selection, activeComposer.activeKey, option.value) });
      return;
    }
    if (card.identity) setInspectId(card.id);
  }
  function cardNode(card: SemanticCard, points = false, hand = false) {
    const isOption = highlighted.some(option => option.entityId === card.id);
    const picked = activeComposer && openFamily ? resolvedAction(openFamily, activeComposer.selection) : selected;
    const choices = activeComposer && openFamily ? effectiveSelection(openFamily, activeComposer.selection) : {};
    const chosen = Object.values(choices).some(value => Array.isArray(value) ? value.includes(card.id) : value === card.id) ||
      (typeof choices.slot === 'string' && game.swap[Number(choices.slot)]?.id === card.id);
    return <CardFace card={card} size={hand ? 'hand' : 'row'} variant={points ? 'point-row' : undefined}
      highlighted={isOption || (!activeComposer && !blocked && game.actions.some(action => action.sources.includes(card.id)))} selected={Boolean(chosen || picked?.sources.includes(card.id) || picked?.targets.includes(card.id))}
      onClick={() => pick(card)} purpose={isOption ? 'Choose for Composer' : 'Inspect card'} />;
  }
  function lane(title: string, laneCards: readonly SemanticCard[], grid: string, points = false) {
    return <section className={`hc-row ${points ? 'hc-pr' : 'hc-er'}`} data-grid={grid} aria-label={title}>
      <h3>{title}<span>{laneCards.length}</span></h3>
      <ul tabIndex={0} aria-label={`${title} cards`}>{laneCards.map(card => <li key={card.id}>{cardNode(card, points)}</li>)}</ul>
      {!laneCards.length && <span className="hc-row-empty">{points ? 'No Points in play' : 'No Enduring cards'}</span>}
    </section>;
  }
  const handMap = new Map(game.self.hand.map(card => [card.id, card]));
  const orderedIds = [...new Set([...handOrder, ...handMap.keys()])].filter(id => handMap.has(id));
  async function reorder(id: string, direction: number) {
    const order = [...orderedIds];
    const index = order.indexOf(id); const other = index + direction;
    if (other < 0 || other >= order.length) return;
    [order[index], order[other]] = [order[other], order[index]];
    setHandOrder(order);
    try { await onReorderHand?.(order); } catch { setSaveState('Hand order could not be saved.'); }
  }
  async function save() {
    if (!onSave || saving.current) return;
    saving.current = true; setSaveState('Saving…');
    try { await onSave(); setSaveState('Match saved'); } catch { setSaveState('Save failed. Try again.'); } finally { saving.current = false; }
  }
  const chooseSuggestion = (actionId: string) => {
    const entry = entries.find(entry => entry.kind === 'family' ? entry.family.variants.some(action => action.id === actionId) : entry.action.id === actionId);
    if (entry?.kind === 'family') open(entry.family); else choose(actionId);
  };

  return <main className="astra-client hc-game" data-skin={skinName} data-testid="play-board" data-play-state={game.status} aria-label="Intrilex gameboard">
    <header className="hc-header"><a href="#/" aria-label="Intrilex Home"><Wordmark /></a><span>Turn {game.turn} · {formatLabel(game.phase)}</span>
      <nav aria-label="Match controls"><a href="#/rules" target="_blank" rel="noreferrer">Rules</a>
        {onSave && <button type="button" disabled={saveState === 'Saving…'} onClick={() => void save()}><Icon name="save" />Save</button>}
        <button type="button" onClick={() => setShowSuggestions(value => !value)} aria-pressed={showSuggestions}>Hints</button>
        {onExit && <button type="button" onClick={onExit}>{network ? 'Forfeit' : 'Exit'}</button>}
      </nav>
    </header>
    <div className="hc-status" role="status"><strong>{status}</strong><span>{game.priorityOwnerId === game.self.id ? 'You have priority' : game.priorityOwnerId === game.opponent.id ? 'Opponent has priority' : 'No priority window'} · {game.actions.length} legal options</span><span>{saveState}</span></div>
    {snapshot.error && <p className="hc-error" role="alert">{snapshot.error}</p>}
    <div className="hc-layout">
      <aside className="hc-left" aria-label="Players and shared table">
        <div data-testid="score-rail"><Summary game={game} opponent /><Summary game={game} /></div>
        <Section title="Swap Bar" className="hc-swap"><ul aria-label="Swap Bar slots">{game.swap.map((card, index) => <li key={card.id}>
          <span>Slot {index + 1}</span>{cardNode(card)}
          <button type="button" disabled={blocked || !game.actions.some(action => action.family === 'swap-bar' && action.swapSlot === index)} onClick={() => {
            const entry = entries.find(entry => entry.kind === 'family' ? entry.family.variants.some(a => a.swapSlot === index) : entry.action.swapSlot === index);
            if (entry?.kind === 'family') open(entry.family, index); else if (entry) choose(entry.action.id);
          }}>Choose swap</button>
        </li>)}</ul></Section>
        <Section title="Pending Plays" className="hc-pending"><ol aria-label="Pending plays in supplied order">{game.stack.map((item, index) => {
          const option = highlighted.find(option => option.entityId === item.id);
          return <li key={item.id}><button type="button" className={option ? 'is-highlighted' : ''} disabled={!option || blocked}
            onClick={() => { if (option && openFamily && activeComposer) setComposer({ ...activeComposer, selection: selectOption(openFamily, activeComposer.selection, activeComposer.activeKey, option.value) }); }}>
            <span>{index + 1} · {item.controllerId === game.self.id ? game.self.name : item.controllerId === game.opponent.id ? game.opponent.name : 'System'}</span><strong>{item.label}</strong></button></li>;
        })}</ol>{!game.stack.length && <p className="hc-empty">Stack clear</p>}</Section>
        {teaching?.panelHtml && <div className="hc-teaching" onClick={event => {
          const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
          if (action) teaching.onAction(action);
        }} dangerouslySetInnerHTML={{ __html: teaching.panelHtml }} />}
        {teaching?.panelHtml && <p className="hc-academy-hint" data-testid="academy-hint-display" role="status" />}
      </aside>
      <div className="hc-center" data-grid="stage" aria-label="Battlefield">
        {lane('Opponent Enduring Row', game.opponent.enduring, 'enemyE')}
        {lane('Opponent Point Row', game.opponent.points, 'enemyP', true)}
        <div className="hc-scrimmage"><span />Line of Scrimmage<span /></div>
        {lane('Your Point Row', game.self.points, 'playerP', true)}
        {lane('Your Enduring Row', game.self.enduring, 'playerE')}
        <section className="hc-piles" data-grid="piles" aria-label="Draw Graveyard and Exile">
          <button type="button" disabled={blocked || !game.actions.some(action => action.family === 'draw')} onClick={() => {
            const action = game.actions.find(action => action.family === 'draw'); if (action) choose(action.id);
          }}><Icon name="cards" /><span>Draw Pile</span><b>{game.drawCount}</b></button>
          <button type="button" disabled={!game.discardTop} onClick={() => game.discardTop && pick(game.discardTop)}><span>{game.discardTop?.identity ?? '—'}</span><span>Graveyard</span><b>{game.discardCount}</b></button>
          <div><Icon name="layers" /><span>Exile</span><b>{game.exileCount}</b></div>
        </section>
        <section className="hc-hand" data-grid="playerH" aria-label="Your hand"><h2>Your Hand <span>{game.self.handCount}</span></h2>
          <ul tabIndex={0} aria-label="Your visible hand cards">{orderedIds.map((id, index) => <li key={id}>{cardNode(handMap.get(id)!, false, true)}
            {onReorderHand && <div className="hc-reorder"><button type="button" aria-label={`Move ${handMap.get(id)!.label} left`} disabled={index === 0} onClick={() => void reorder(id, -1)}>‹</button><button type="button" aria-label={`Move ${handMap.get(id)!.label} right`} disabled={index === orderedIds.length - 1} onClick={() => void reorder(id, 1)}>›</button></div>}
          </li>)}</ul>{!orderedIds.length && <p className="hc-empty">{game.self.handCount ? 'Hand identities are not visible.' : 'Your hand is empty.'}</p>}
        </section>
      </div>
      <aside className="hc-right" aria-label="Decisions and Game Log">
        <Section title="Opponent Hand" className="hc-opponent-hand"><div aria-label={`${game.opponent.handCount} hidden opponent cards`}><span aria-hidden="true">{Array.from({ length: Math.min(8, game.opponent.handCount) }, (_, index) => <i key={index} />)}</span><strong>{game.opponent.handCount} cards</strong></div></Section>
        {showSuggestions && suggestions.length > 0 && <Section title="Suggested Moves" className="hc-suggestions">{suggestions.map(suggestion => {
          const action = game.actions.find(action => action.id === suggestion.actionId);
          return action && <button type="button" key={action.id} disabled={blocked} title={suggestion.explanation} onClick={() => chooseSuggestion(action.id)}>{action.label}<small>{suggestion.explanation}</small></button>;
        })}</Section>}
        <Section title="Legal Actions" className="hc-actions">
          {!activeComposer && <input type="search" aria-label="Search legal actions" placeholder="Find a move…" value={search} onChange={event => setSearch(event.target.value)} />}
          <ActionRail game={game} entries={visibleEntries} family={openFamily} composer={activeComposer} blocked={blocked} open={open} change={setComposer} choose={choose} confirm={id => void confirm(id)} />
          {selected && !activeComposer && <div className="hc-confirmation" aria-live="polite"><p>{actionPreview(game, selected)}</p><button type="button" className="hc-confirm" disabled={blocked} onClick={() => void confirm(selected.id)}>Confirm</button><button type="button" onClick={() => store.select(null)}>Cancel</button></div>}
        </Section>
        <GameLog game={game} />
        <GameChat />
      </aside>
    </div>
    {debug && <details className="hc-debug"><summary>Decision evidence</summary><p>{game.sessionId} · revision {game.revision} · {game.frameHash}</p></details>}
    {inspected && <div className="hc-inspector" role="dialog" aria-modal="false" aria-label="Card reference"><button type="button" aria-label="Close card reference" onClick={() => setInspectId(null)}>×</button><CardReference card={inspected} onInspect={onInspect} />
      {game.actions.filter(action => action.sources.includes(inspected.id)).map(action => <button type="button" key={action.id} disabled={blocked} onClick={() => { choose(action.id); setInspectId(null); }}>{action.label}</button>)}
    </div>}
    {teaching?.coachmarkHtml && <div onClick={event => {
      const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action) teaching.onAction(action);
    }} dangerouslySetInnerHTML={{ __html: teaching.coachmarkHtml }} />}
  </main>;
}
