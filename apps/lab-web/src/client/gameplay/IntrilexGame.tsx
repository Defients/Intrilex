import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type CSSProperties } from 'react';
import type { GameStore } from '../game-store.js';
import type { SemanticCard, SemanticGame } from '../game-model.js';
import { CardLane, CardReference, Icon, Wordmark, formatLabel } from '../primitives.js';
import { TabletopCard, PileTray, SuitText } from './TabletopCard.js';
import { ChatPanel, type ChatConfig } from '../game-table.js';
import { ActionRail, type ComposerState } from './ActionRail.js';
import { actionPreview, boardOptions, buildActionEntries, decisionBoundary, effectiveSelection, needsCompositionConfirmation, reconcileSelection, resolvedAction, selectOption, visibleCards } from './action-family.js';
import type { ActionFamily } from './action-family.js';
import { suggestedMoves, type SuggestionRanker } from './suggestions.js';
import { DirectManipulation, DragPreview, DragTarget, GestureSettings } from './DirectManipulation.js';
import { rowRef } from './drag-intent.js';

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
  /** Trusted Caster template; commentary is inserted as text by its owner. */
  railHtml?: string;
  /** Explicitly authorized omniscient replay hand; absent in public mode. */
  opponentHand?: readonly SemanticCard[];
  /**
   * Presentation role. 'spectator'/'caster' render a neutral two-seat
   * view (neither participant is "You"), suppress player-only controls
   * (save, hints, gestures, hand reorder, action composer), and show
   * both hands — concealed under public visibility, face-up when the
   * semantic model reports viewerMode 'omniscient'.
   */
  viewRole?: 'player' | 'spectator' | 'caster';
};

function Section({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return <section className={`hc-panel hx-panel ${className}`} aria-label={title}><div className="hx-sec-head"><strong>{title}</strong></div>{children}</section>;
}

function Summary({ game, opponent = false, spectator = false }: { game: SemanticGame; opponent?: boolean; spectator?: boolean }) {
  const player = opponent ? game.opponent : game.self;
  const seatLabel = spectator ? (opponent ? 'Seat 2' : 'Seat 1') : opponent ? 'Opponent' : 'You';
  return <DragTarget as="section" destination={{ kind: 'player', id: player.id }} label={player.name} className={`hc-summary hx-panel hx-seat ${opponent ? 'hx-seat-opp' : 'hx-seat-me'}`} data-opponent={opponent} aria-label={`${player.name} summary`}>
    <header className="hx-seat-head"><span className="hx-pbadge" aria-hidden="true">{player.id}</span><span className="hx-seat-name"><strong>{player.name}</strong><small>{seatLabel}</small></span><span className="hx-seat-hand" aria-label={`${player.handCount} cards in hand`} title={`${player.handCount} cards in hand`}><i className="hx-mini-back" aria-hidden="true" />{player.handCount}</span></header>
    <div className="hx-seat-stats" data-testid={opponent ? 'opponent-score' : 'self-score'}><span className="hx-seat-stat"><b>{player.score}</b><i>Secured</i></span><span className="hx-seat-stat"><b>{player.goal}</b><i>Goal</i></span></div>
    <div className="hx-seat-pills">{game.activePlayerId === player.id && game.status !== 'completed' && <span className="pill pill-active">Active turn</span>}{player.swapUsed != null && <span className="pill">Swap {player.swapUsed ? 'used' : 'available'}</span>}{spectator && player.miniTurnsRemaining != null && <span className="pill">Mini {player.miniTurnsRemaining}</span>}</div>
  </DragTarget>;
}

function GameLog({ game }: { game: SemanticGame }) {
  const [tab, setTab] = useState('All');
  const [stylized, setStylized] = useState(true);
  const end = useRef<HTMLLIElement>(null);
  const scroller = useRef<HTMLOListElement>(null);
  const pinned = useRef(true);
  useEffect(() => { if (pinned.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [game.events]);
  const shown = game.events.filter(event => tab === 'All' || /TURN|VICTORY|WIN|TERMINAL/u.test(event.type) || (tab === 'Actions' ? /DECLAR|SCORE|SCORED|SCUTTLE|DRAW|COUNTER/u.test(event.type) : tab === 'Effects' ? /RESOL|REVEAL|EFFECT|FIZZLE|TAP|EXILE/u.test(event.type) : !/DECLAR|SCORE|SCORED|SCUTTLE|DRAW|COUNTER|RESOL|REVEAL|EFFECT|FIZZLE|TAP|EXILE/u.test(event.type)));
  return <details className={`hc-log fc-history glog hx-panel ${stylized ? '' : 'is-plain'}`} aria-label="Game Log" open>
    <summary>Game Log <span className="glog-count">{game.events.length}</span></summary>
    <div className="glog-toolbar"><div className="glog-tabs" role="group" aria-label="Filter game log">{['All', 'Actions', 'Effects', 'System'].map(label => <button type="button" key={label} className={`glog-tab ${tab === label ? 'is-active' : ''}`} aria-pressed={tab === label} onClick={() => setTab(label)}>{label}</button>)}</div><label className="glog-toggle"><input type="checkbox" checked={stylized} onChange={event => setStylized(event.target.checked)} />Stylized Text</label></div>
    <ol className="glog-list glog-scroll" ref={scroller} tabIndex={0} aria-label="Game events in chronological order" onScroll={() => {
      const el = scroller.current; if (el) pinned.current = el.scrollHeight - el.clientHeight - el.scrollTop < 20;
    }}>
      {shown.map((event, index) => <li className="glog-item" key={event.id} ref={index === shown.length - 1 ? end : undefined}
        data-actor={event.actorId === game.self.id ? 'self' : event.actorId === game.opponent.id ? 'opponent' : 'system'}>
        <span className={`glog-p ${event.actorId === game.self.id ? 'glog-p0' : 'glog-p1'}`}>{event.actorId === game.self.id ? game.self.name : event.actorId === game.opponent.id ? game.opponent.name : 'System'}</span>{' '}
        <strong>{event.label}</strong>
      </li>)}
    </ol>
    {!shown.length && <p className="glog-empty">No public events in this filter.</p>}
  </details>;
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
  const [open, setOpen] = useState(() => Boolean(chat?.modeLabel?.includes('NETWORK')) && !window.matchMedia('(max-width: 860px)').matches);
  return chat ? <ChatPanel config={{ ...chat, hidden: !open || chat.hidden, onToggleHidden: hidden => {
    setOpen(!hidden); chat.onToggleHidden?.(hidden);
  } }} /> : null;
}

type SessionProps = IntrilexGameProps & { snapshot: ReturnType<GameStore['getSnapshot']>; network: boolean };
const StableGameSession = memo(GameSession, (a, b) => a.snapshot === b.snapshot && a.store === b.store &&
  a.onSave === b.onSave && a.onInspect === b.onInspect && a.onReorderHand === b.onReorderHand && a.onExit === b.onExit &&
  a.skin === b.skin && a.debug === b.debug && a.network === b.network && a.rankSuggestions === b.rankSuggestions && a.railHtml === b.railHtml && a.opponentHand === b.opponentHand && a.viewRole === b.viewRole &&
  a.teaching?.panelHtml === b.teaching?.panelHtml && a.teaching?.coachmarkHtml === b.teaching?.coachmarkHtml && a.teaching?.onAction === b.teaching?.onAction);

function GameSession({ store, snapshot, onSave, onInspect, onReorderHand, onExit, skin = 'dark', debug, network, rankSuggestions, teaching, railHtml, opponentHand, viewRole }: SessionProps) {
  const { game } = snapshot;
  const spectator = viewRole === 'spectator' || viewRole === 'caster';
  const omniscient = spectator && game.viewerMode === 'omniscient';
  const boundary = decisionBoundary(game);
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState('');
  const [handOrder, setHandOrder] = useState<readonly string[]>(game.handOrder ?? []);
  const [search, setSearch] = useState('');
  const [cardFilter, setCardFilter] = useState<string | null>(null);
  const [sheet, setSheet] = useState(true);
  const handStrip = useRef<HTMLUListElement>(null);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const saving = useRef(false);
  const activeComposer = composer?.boundary === boundary ? composer : null;
  const entries = useMemo(() => buildActionEntries(game.actions), [game.actions]);
  const family = activeComposer ? entries.find(entry => entry.kind === 'family' && entry.family.id === activeComposer.familyId) : undefined;
  const openFamily = family?.kind === 'family' ? family.family : undefined;
  const highlighted = openFamily && activeComposer ? boardOptions(game, openFamily, activeComposer.selection, activeComposer.activeKey) : [];
  const suggestions = useMemo(() => showSuggestions ? suggestedMoves(game, rankSuggestions) : [], [game, rankSuggestions, showSuggestions]);
  const cards = visibleCards(game);
  const inspectable = spectator ? [...cards, ...game.self.hand, ...game.opponent.hand] : [...cards, ...(opponentHand ?? [])];
  const inspected = inspectable.find(card => card.id === inspectId && card.identity !== null) ?? null;
  const selected = game.actions.find(action => action.id === snapshot.selectedActionId);
  const blocked = spectator || submitting || game.status !== 'ready' || snapshot.interaction === 'submitting';
  const skinName = ['dark', 'light', 'cosmotech', 'corrupture'].includes(skin) ? skin : 'dark';
  const status = railHtml !== undefined ? 'Replay playback · read only' : game.status === 'completed' ? 'Match complete' : game.status === 'unavailable' ? 'Table unavailable' : game.connection === 'DISCONNECTED' ? 'Opponent disconnected · awaiting reconnect' : game.status === 'ready' ? game.choice ? 'Your choice' : game.stack.length ? 'Your response' : 'Your move' : 'Waiting for the next decision';
  const filteredActions = game.actions.filter(action => !cardFilter || action.sources.includes(cardFilter) || action.targets.includes(cardFilter) || !action.sources.length);
  const visibleEntries = buildActionEntries(filteredActions).filter(entry => !search || (entry.kind === 'family' ? [entry.family.title, ...entry.family.variants.map(a => actionPreview(game, a))].join(' ') : actionPreview(game, entry.action)).toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const nameOf = (id: string | null) => id === game.self.id ? game.self.name : id === game.opponent.id ? game.opponent.name : '—';

  useEffect(() => { setComposer(null); setInspectId(null); setCardFilter(null); setSearch(''); }, [boundary]);
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
    void confirm(actionId);
  }
  async function confirm(actionId: string) {
    if (blocked || inFlight.current || decisionBoundary(store.getSnapshot().game) !== boundary) return false;
    const current = store.getSnapshot().game.actions.find(action => action.id === actionId);
    if (!current) return false;
    store.select(actionId);
    if (store.getSnapshot().selectedActionId !== actionId) return false;
    inFlight.current = true;
    setSubmitting(true);
    try { const accepted = await store.submit(); if (accepted) setComposer(null); return accepted; } finally { inFlight.current = false; setSubmitting(false); }
  }
  function changeComposer(next: ComposerState | null, nextFamily = openFamily) {
    const action = next && nextFamily && !needsCompositionConfirmation(nextFamily) ? resolvedAction(nextFamily, next.selection) : undefined;
    if (action) choose(action.id);
    else setComposer(next);
  }
  function open(next: ActionFamily, swapSlot?: number) {
    if (blocked) return;
    store.select(null); setInspectId(null); setCardFilter(null); setSearch(''); setSheet(true);
    const selection = swapSlot === undefined ? {} : selectOption(next, {}, 'slot', String(swapSlot));
    changeComposer({ boundary, familyId: next.id, selection, activeKey: next.parameters.find(p => selection[p.key] === undefined)?.key ?? next.parameters[0]?.key ?? '' }, next);
  }
  function pick(card: SemanticCard) {
    const option = highlighted.find(item => item.entityId === card.id);
    if (!blocked && option && openFamily && activeComposer) {
      changeComposer({ ...activeComposer, selection: selectOption(openFamily, activeComposer.selection, activeComposer.activeKey, option.value) });
      return;
    }
    if (card.identity) {
      // Spectators inspect cards directly; there is no action composer
      // to filter.
      if (spectator) { setInspectId(card.id); return; }
      setCardFilter(value => value === card.id ? null : card.id); setSheet(true);
    }
  }
  function cardNode(card: SemanticCard, points = false, hand = false) {
    const isOption = highlighted.some(option => option.entityId === card.id);
    const picked = activeComposer && openFamily ? resolvedAction(openFamily, activeComposer.selection) : selected;
    const choices = activeComposer && openFamily ? effectiveSelection(openFamily, activeComposer.selection) : {};
    const chosen = Object.values(choices).some(value => Array.isArray(value) ? value.includes(card.id) : value === card.id) ||
      (typeof choices.slot === 'string' && game.swap[Number(choices.slot)]?.id === card.id);
    return <DragTarget as="span" destination={{ kind: 'card', id: card.id }} label={card.label} className="hc-card-target"><TabletopCard card={card} size={hand ? 'md' : 'sm'} points={points}
      highlighted={isOption || (!activeComposer && !blocked && game.actions.some(action => action.sources.includes(card.id)))} selected={Boolean(chosen || cardFilter === card.id || picked?.sources.includes(card.id) || picked?.targets.includes(card.id))}
      onClick={() => pick(card)} onDoubleClick={() => { if (card.identity) setInspectId(card.id); }} purpose={isOption ? 'Choose for Composer' : 'Select card'} /><DragPreview destination={{ kind: 'card', id: card.id }} /></DragTarget>;
  }
  function lane(title: string, laneCards: readonly SemanticCard[], grid: string, points = false) {
    const mine = grid.startsWith('player');
    const slots = Math.max(4, laneCards.length + 1);
    const destination = rowRef(mine ? game.self.id : game.opponent.id, points ? 'points' : 'enduring');
    return <DragTarget as="section" destination={destination} label={title} className={`hc-row fc-row ${points ? 'hc-pr fc-pr' : 'hc-er fc-er'} ${mine ? 'hc-row-mine' : 'hc-row-theirs'}`} data-grid={grid} aria-label={title}>
      <span className="fc-row-name"><b>{mine ? game.self.id : game.opponent.id}</b><span>{points ? 'Point Row' : 'Enduring Row'} (<abbr title={points ? 'Point Row' : 'Enduring Row'}>{points ? 'PR' : 'ER'}</abbr>)</span></span>
      <ul className="hx-slots" style={{ '--slots': slots } as CSSProperties} tabIndex={0} aria-label={`${title} cards`}>{Array.from({ length: slots }, (_, index) => {
        const card = laneCards[index];
        return card ? <li className="fc-slot" key={card.id}><span className="fc-card-wrap">{cardNode(card, points)}<span className="fc-flags">{card.markers.map(marker => <span className="fc-tag" key={marker}>{marker}</span>)}</span></span></li> : <li className="hx-slot" aria-hidden="true" key={`empty-${index}`}>{index === laneCards.length && <DragPreview destination={destination} />}</li>;
      })}</ul>
    </DragTarget>;
  }
  // Spectator hand lane: a neutral read-only strip for either seat.
  // Public mode renders card backs sized by the public hand count;
  // omniscient mode renders the face-up cards the model authorized.
  function spectatorHand(player: typeof game.self, faceUp: boolean, testId: string) {
    const shown: SemanticCard[] = faceUp
      ? [...player.hand]
      : Array.from({ length: player.handCount }, (_, index) => ({
          id: `concealed:${player.id}:hand:${index}`, identity: null,
          label: 'Hidden card', markers: ['Face down'],
        }));
    return <section className="hc-hand fc-hand hx-hand hx-hand-spectator" data-testid={testId} aria-label={`${player.name} hand`}>
      <div className="hand-head"><strong>{player.name} Hand ({player.handCount})</strong><span>{faceUp ? 'Omniscient view — identities visible' : 'Concealed — public count only'}</span></div>
      <ul className="hx-hand-strip fc-cards hx-hand-cards" tabIndex={0} aria-label={`${player.name} hand cards`}>
        {shown.map(card => <li className="hx-hand-slot" key={card.id}>
          <TabletopCard card={card} size="sm" purpose="Inspect card"
            onClick={() => { if (card.identity) setInspectId(card.id); }}
            onDoubleClick={() => { if (card.identity) setInspectId(card.id); }} />
        </li>)}
      </ul>
      {!shown.length && <p className="hc-empty">Empty hand.</p>}
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
    choose(actionId);
  };

  return <DirectManipulation store={store} game={game} blocked={blocked} interrupted={Boolean(activeComposer || inspected || teaching?.coachmarkHtml)} submit={confirm} skin={skinName}><main className="astra-client hc-game" data-skin={skinName} data-testid="play-board" data-play-state={game.status} aria-label="Intrilex gameboard">
    <header className="hc-header"><a href="#/" aria-label="Intrilex Home"><Wordmark /></a><span className="hc-table-title">Intrilex · {railHtml !== undefined ? 'Replay Caster' : 'Rules-assisted'} <span className="pill">{railHtml !== undefined ? 'Read only' : network ? 'Online match' : 'Local match'}</span></span>
      <nav aria-label="Match controls"><a href="#/rules" target="_blank" rel="noreferrer">Rules</a>
        {!spectator && onSave && <button type="button" disabled={saveState === 'Saving…'} onClick={() => void save()}><Icon name="save" />Save</button>}
        {!spectator && <button type="button" onClick={() => setShowSuggestions(value => !value)} aria-pressed={showSuggestions}>Hints</button>}
        {!spectator && <GestureSettings />}
        {!spectator && onExit && <button type="button" onClick={onExit}>{network ? 'Forfeit' : 'Exit'}</button>}
      </nav>
    </header>
    <div className="hc-status fc-status" role="status"><span className="hx-logo"><b>Intrilex</b><em>HybriX</em></span><span className="eyebrow">Rules-assisted</span><strong>{status}</strong><span className="hx-stats"><span className="hx-stat"><i>Turn</i>{game.turn}</span><span className="hx-stat"><i>Phase</i>{formatLabel(game.phase)}</span><span className="hx-stat"><i>Window</i>{game.choice ? 'Choice' : game.stack.length ? 'Reactive' : 'Normal'}</span><span className="hx-stat"><i>Actor</i>{nameOf(game.activePlayerId)}</span><span className="hx-stat"><i>Priority</i>{nameOf(game.priorityOwnerId)}</span>{game.self.miniTurnsRemaining != null && <span className="hx-stat hx-stat-dots"><i>{spectator ? `${game.self.name} Mini-Turns` : 'Your Mini-Turns'}</i>{game.self.miniTurnsRemaining}<span className="hx-dots" aria-hidden="true">{Array.from({ length: 3 }, (_, i) => <i key={i} className={i < game.self.miniTurnsRemaining! ? 'on' : ''} />)}</span></span>}{spectator && game.opponent.miniTurnsRemaining != null && <span className="hx-stat hx-stat-dots"><i>{game.opponent.name} Mini-Turns</i>{game.opponent.miniTurnsRemaining}<span className="hx-dots" aria-hidden="true">{Array.from({ length: 3 }, (_, i) => <i key={i} className={i < game.opponent.miniTurnsRemaining! ? 'on' : ''} />)}</span></span>}</span>{saveState && <span className="hc-save-state">{saveState}</span>}</div>
    {snapshot.error && <p className="hc-error" role="alert">{snapshot.error}</p>}
    <div className="hc-layout fc-layout">
      <aside className="hc-left hx-left" data-testid="score-rail" aria-label="Players and shared table">
        <Summary game={game} opponent spectator={spectator} />
        {spectator
          ? spectatorHand(game.opponent, omniscient, 'seat2-hand')
          : opponentHand && opponentHand.length > 0 && <CardLane title="Hand" owner={game.opponent.name} cards={opponentHand} selectedId={inspectId} onCard={card => setInspectId(card.id)} />}
        <Section title="Swap Bar" className="hc-swap hx-swap"><ul className="hx-swap-slots" aria-label="Swap Bar slots">{game.swap.map((card, index) => <li className="hx-swap-slot" key={card.id}><DragTarget as="span" destination={{ kind: 'zone', id: `swap:${index}` }} label={`Swap Bar slot ${index + 1}`} className="hc-card-target">
          <TabletopCard card={card} size="sm" purpose={`Choose swap slot ${index + 1}`} onDoubleClick={() => { if (card.identity) setInspectId(card.id); }} onClick={() => {
            const option = highlighted.find(item => item.entityId === card.id);
            if (!blocked && option && openFamily && activeComposer) { changeComposer({ ...activeComposer, selection: selectOption(openFamily, activeComposer.selection, activeComposer.activeKey, option.value) }); return; }
            const entry = entries.find(entry => entry.kind === 'family' ? entry.family.variants.some(a => a.swapSlot === index) : entry.action.swapSlot === index);
            if (entry?.kind === 'family') open(entry.family, index); else if (entry) choose(entry.action.id); else if (card.identity) pick(card);
          }} /><DragPreview destination={{ kind: 'zone', id: `swap:${index}` }} /></DragTarget><small>Slot {index + 1} · {card.identity ? 'face-up' : 'hidden'}</small>
        </li>)}</ul></Section>
        <Summary game={game} spectator={spectator} />
        <Section title="Pending Plays" className="hc-pending hx-stack"><ol aria-label="Pending plays in supplied order">{game.stack.map((item, index) => {
          const option = highlighted.find(option => option.entityId === item.id);
          return <li key={item.id}><DragTarget destination={{ kind: 'pending-play', id: item.id }} label={item.label}><button type="button" className={option ? 'is-highlighted' : ''} disabled={!option || blocked}
            onClick={() => { if (option && openFamily && activeComposer) changeComposer({ ...activeComposer, selection: selectOption(openFamily, activeComposer.selection, activeComposer.activeKey, option.value) }); }}>
            <span>{index + 1} · {item.controllerId === game.self.id ? game.self.name : item.controllerId === game.opponent.id ? game.opponent.name : 'System'}</span><strong>{item.label}</strong></button><DragPreview destination={{ kind: 'pending-play', id: item.id }} /></DragTarget></li>;
        })}</ol>{!game.stack.length && <p className="hx-stack-clear">Stack clear</p>}
          {game.choice && <div className="fc-choice"><b>{spectator ? 'Private choice' : 'Your choice'} · {formatLabel(game.choice.kind)}</b><div className="fc-cards">{game.choice.cards.map(card => <span key={card.id}>{cardNode(card)}</span>)}</div></div>}
        </Section>
        {teaching?.panelHtml && <div className="hc-teaching" onClick={event => {
          const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
          if (action) teaching.onAction(action);
        }} dangerouslySetInnerHTML={{ __html: teaching.panelHtml }} />}
        {teaching?.panelHtml && <p className="hc-academy-hint" data-testid="academy-hint-display" role="status" />}
        <GameLog game={game} />
      </aside>
      <div className="hc-center fc-surface" data-grid="stage" aria-label="Battlefield">
        <div className="fc-field is-theirs">{lane(spectator ? `${game.opponent.name} Enduring Row` : 'Opponent Enduring Row', game.opponent.enduring, 'enemyE')}{lane(spectator ? `${game.opponent.name} Point Row` : 'Opponent Point Row', game.opponent.points, 'enemyP', true)}</div>
        <div className="hc-scrimmage hx-scrimmage"><span className="hx-scrim-gem" /><span className="hx-scrim-rule" /><b>Line of Scrimmage</b><span className="hx-scrim-rule" /><span className="hx-scrim-gem" /></div>
        <div className="fc-field is-mine">{lane(spectator ? `${game.self.name} Point Row` : 'Your Point Row', game.self.points, 'playerP', true)}{lane(spectator ? `${game.self.name} Enduring Row` : 'Your Enduring Row', game.self.enduring, 'playerE')}</div>
        <section className="hc-piles fc-center hx-piles" data-grid="piles" aria-label="Draw Graveyard and Exile">
          <button type="button" className="fc-pile hx-pile" aria-label={`Draw Pile, ${game.drawCount} cards`} disabled={blocked || !game.actions.some(action => action.family === 'draw')} onClick={() => {
            const draws = game.actions.filter(action => action.family === 'draw');
            if (draws.length === 1) choose(draws[0].id);
            else {
              const drawEntries = entries.filter(entry => entry.kind === 'family' && entry.family.variants.every(action => action.family === 'draw'));
              if (drawEntries.length === 1 && drawEntries[0].kind === 'family' && drawEntries[0].family.variants.length === draws.length) open(drawEntries[0].family);
              else { setComposer(null); store.select(null); setSearch('draw'); }
            }
          }}><PileTray back /><b>Draw Pile</b><span className="hx-pile-count">{game.drawCount}</span></button>
          <button type="button" className="fc-pile hx-pile" disabled={!game.discardTop} onClick={() => game.discardTop && setInspectId(game.discardTop.id)}><PileTray top={game.discardTop} /><b>Graveyard</b><span className="hx-pile-count">{game.discardCount}</span><span className="hx-pile-off">{game.discardTop ? 'Inspect top card' : 'Empty'}</span></button>
          <div className="fc-pile hx-pile"><PileTray /><b>Exile</b><span className="hx-pile-count">{game.exileCount}</span><span className="hx-pile-off">{game.exileCount ? 'Public count' : 'Empty'}</span></div>
        </section>
        {spectator ? spectatorHand(game.self, omniscient, 'seat1-hand') : <section className="hc-hand fc-hand hx-hand" data-grid="playerH" aria-label="Your hand"><div className="hand-head"><strong>Your Hand ({game.self.handCount})</strong><span>Private — only you see these faces</span></div>
          <div className="hx-hand-wrap"><button type="button" className="hx-hand-arrow" aria-label="Scroll hand left" onClick={() => handStrip.current?.scrollBy({ left: -180, behavior: 'smooth' })}>‹</button>
          <ul className="hx-hand-strip fc-cards hx-hand-cards" ref={handStrip} tabIndex={0} aria-label="Your visible hand cards">{orderedIds.map((id, index) => <li className="hx-hand-slot" key={id}>{cardNode(handMap.get(id)!, false, true)}
            {onReorderHand && <div className="hc-reorder"><button type="button" aria-label={`Move ${handMap.get(id)!.label} left`} disabled={index === 0} onClick={() => void reorder(id, -1)}>‹</button><button type="button" aria-label={`Move ${handMap.get(id)!.label} right`} disabled={index === orderedIds.length - 1} onClick={() => void reorder(id, 1)}>›</button></div>}
          </li>)}</ul><button type="button" className="hx-hand-arrow" aria-label="Scroll hand right" onClick={() => handStrip.current?.scrollBy({ left: 180, behavior: 'smooth' })}>›</button></div>{!orderedIds.length && <p className="hc-empty">{game.self.handCount ? 'Hand identities are not visible.' : 'Your hand is empty.'}</p>}
        </section>}
      </div>
      <aside className="hc-right hx-right" aria-label={railHtml === undefined ? "Moves and Action Composer" : "Commentary and playback"}>
        {railHtml !== undefined ? <div className="hc-caster-rail" dangerouslySetInnerHTML={{ __html: railHtml }} /> : <>
        <section className={`hc-actions fc-panel hx-panel ${sheet ? '' : 'is-collapsed'}`} aria-label="Your legal actions"><div className="fc-panel-head"><h2>Legal Actions ({game.actions.length})</h2><button type="button" className="link-btn" onClick={() => setShowSuggestions(value => !value)} aria-pressed={showSuggestions}>{showSuggestions ? 'Fewer hints' : 'More hints'}</button><button type="button" className="narrow-only" aria-expanded={sheet} onClick={() => setSheet(value => !value)}>{sheet ? 'Hide' : 'Show'}</button></div>
        {showSuggestions && suggestions.length > 0 && <section aria-label="Suggested Moves" className="hc-suggestions fc-suggestions"><h3>Suggested Moves</h3>{suggestions.map((suggestion, index) => {
          const action = game.actions.find(action => action.id === suggestion.actionId);
          return action && <button type="button" className="action-btn suggested-action" key={action.id} disabled={blocked} title={suggestion.explanation} onClick={() => chooseSuggestion(action.id)}><span>{index + 1}. <SuitText text={actionPreview(game, action)} /></span><small>{suggestion.explanation}</small></button>;
        })}</section>}
          <h3 className="fc-possible-heading">Possible Moves</h3>
          {cardFilter && <div className="chip-row"><button type="button" className="chip" onClick={() => setCardFilter(null)}>Filtering by <SuitText text={cards.find(card => card.id === cardFilter)?.label ?? 'card'} /> ×</button><button type="button" className="chip" onClick={() => setInspectId(cardFilter)}>Inspect</button></div>}
          {!activeComposer && <label className="hc-search">Find a legal action<input type="search" aria-label="Search legal actions" placeholder="Card, mode or target…" value={search} onChange={event => setSearch(event.target.value)} /></label>}
          <ActionRail game={game} entries={visibleEntries} family={openFamily} composer={activeComposer} blocked={blocked} open={open} change={changeComposer} choose={choose} confirm={id => void confirm(id)} />
        </section></>}
      </aside>
    </div>
    <GameChat />
    {debug && <details className="hc-debug"><summary>Decision evidence</summary><p>{game.sessionId} · revision {game.revision} · {game.frameHash}</p></details>}
    {inspected && <div className="hc-inspector" role="dialog" aria-modal="false" aria-label="Card reference"><button type="button" aria-label="Close card reference" onClick={() => setInspectId(null)}>×</button><CardReference card={inspected} onInspect={onInspect} />
      {game.actions.filter(action => action.sources.includes(inspected.id)).map(action => <button type="button" key={action.id} disabled={blocked} onClick={() => { choose(action.id); setInspectId(null); }}>{action.label}</button>)}
    </div>}
    {teaching?.coachmarkHtml && <div onClick={event => {
      const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action) teaching.onAction(action);
    }} dangerouslySetInnerHTML={{ __html: teaching.coachmarkHtml }} />}
  </main></DirectManipulation>;
}
