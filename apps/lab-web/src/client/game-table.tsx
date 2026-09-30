import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type DragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import type { GameStore } from './game-store.js';
import { Badge, CardFace, CardLane, EmptyState, Icon, PlayerBanner, Wordmark, cardPresentation, formatLabel, type IconName, type TableCard, type TableEvent, type TableGame } from './primitives.js';

export interface GameTableProps {
  store: GameStore;
  onSave?: () => Promise<void>;
  onInspect?: (cardId: string) => void;
  onReorderHand?: (orderedIds: readonly string[]) => void | Promise<void>;
  skin?: string;
  debug?: boolean;
  chat?: ChatConfig;
  /** Face-up opponent hand cards (Caster/omniscient spectating mode). */
  opponentHand?: readonly TableCard[];
  /** Custom HTML injected into the sidebar actions area (Caster rail). */
  railHtml?: string;
}

export type ChatMessage = Readonly<{
  messageId?: string;
  participantId?: string;
  text: string;
  isHuman?: boolean;
  isSystem?: boolean;
  isOptimistic?: boolean;
  timestamp?: string;
}>;

export type ChatConfig = Readonly<{
  messages: readonly ChatMessage[];
  onSend: (text: string) => void | Promise<void>;
  selfName: string;
  opponentName: string;
  modeLabel?: string;
  readOnly?: boolean;
  hidden?: boolean;
  onToggleHidden?: (hidden: boolean) => void;
  notificationsMuted?: boolean;
  onToggleMuted?: (muted: boolean) => void;
}>;

// ── Table settings ───────────────────────────────────────────────
// Persisted in localStorage so they survive across sessions without
// importing the engine-coupled persistence.js module.

export type TimestampMode = 'off' | 'clock' | 'elapsed';
export type TextSize = 'small' | 'normal' | 'large';

export interface TableSettings {
  timestampMode: TimestampMode;
  textSize: TextSize;
  confirmBeforeSubmit: boolean;
  highlightLegalCards: boolean;
}

const DEFAULT_SETTINGS: TableSettings = {
  timestampMode: 'off',
  textSize: 'normal',
  confirmBeforeSubmit: true,
  highlightLegalCards: true,
};

const SETTINGS_KEY = 'intrilex:astra-settings';

function loadSettings(): TableSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: TableSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

function formatTimestamp(mode: TimestampMode, matchStartRef: React.MutableRefObject<number | null>): string | null {
  if (mode === 'off') return null;
  if (mode === 'clock') {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  // elapsed
  if (matchStartRef.current === null) matchStartRef.current = Date.now();
  const elapsed = Math.floor((Date.now() - matchStartRef.current) / 1000);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

type TableSnapshot = ReturnType<GameStore['getSnapshot']>;
type TableAction = TableGame['actions'][number];

type Reference = { label: string; id: string };

function visibleCards(game: TableGame): TableCard[] {
  return [
    ...game.self.hand, ...game.self.points, ...game.self.enduring,
    ...game.opponent.hand, ...game.opponent.points, ...game.opponent.enduring,
    ...game.swap, ...(game.discardTop ? [game.discardTop] : []),
  ];
}

function referenceFor(game: TableGame, cards: readonly TableCard[], id: string): Reference {
  const card = cards.find(candidate => candidate.id === id);
  if (card) return { id, label: card.label || card.identity || 'Unidentified card' };
  const player = [game.self, game.opponent].find(candidate => candidate.id === id);
  if (player) return { id, label: player.name || 'Unnamed player' };
  const item = game.stack.find(candidate => candidate.id === id);
  return { id, label: item?.label || 'Reference label unavailable' };
}

function playerName(game: TableGame, id: string | null, fallback = 'Not reported') {
  if (id === null || id === '') return fallback;
  return [game.self, game.opponent].find(player => player.id === id)?.name || id;
}

// Render a comma-joined list of card/player references by id (used by popovers/confirm views).
function referenceNames(game: TableGame, cards: readonly TableCard[], ids: readonly string[]): string {
  return ids.map(id => {
    const reference = referenceFor(game, cards, id);
    return `${reference.label} (${id})`;
  }).join(', ');
}

function isReadOnly(game: TableGame) {
  return ('readOnly' in game && game.readOnly === true) || ((game.status === 'ready' || game.status === 'waiting') && game.actions.length === 0);
}

function actionAvailability(game: TableGame) {
  if (game.status === 'completed') return 'Match complete';
  if (game.status === 'unavailable' || game.error) return 'Table unavailable';
  if (game.status === 'waiting') return 'Waiting for an update';
  if (isReadOnly(game)) return 'Read-only view';
  if (game.actions.length === 0) return 'No actions offered';
  return 'Choose your action';
}

function Evidence({ game, selected }: { game: TableGame; selected: TableAction | null }) {
  return (
    <details className="astra-disclosure astra-evidence">
      <summary><Icon name="shield" /><strong>Decision evidence</strong><span>Current frame</span></summary>
      <div className="astra-disclosure-body">
        <p className="astra-muted">These are the supplied view and action facts, not a prediction of what will resolve.</p>
        <dl className="astra-evidence-record">
          <div><dt>Session</dt><dd><code>{game.sessionId || 'Not supplied'}</code></dd></div>
          <div><dt>Revision</dt><dd>{game.revision ?? 'Unknown'}</dd></div>
          <div><dt>Frame hash</dt><dd><code>{game.frameHash || 'Not supplied; not verified here'}</code></dd></div>
          <div><dt>Schema</dt><dd>{game.schemaVersion}</dd></div>
          <div><dt>Active player</dt><dd>{playerName(game, game.activePlayerId)}</dd></div>
          <div><dt>Priority owner</dt><dd>{playerName(game, game.priorityOwnerId)}</dd></div>
          <div><dt>Selected action</dt><dd><code>{selected?.id ?? 'None'}</code></dd></div>
        </dl>
        <h3>Supplied action facts</h3>
        {selected && selected.facts.length > 0 ? <ul className="astra-fact-list">{selected.facts.map((fact, index) => <li key={`${selected.id}-${index}`}>{fact}</li>)}</ul> : <p className="astra-muted">{selected ? 'No action-specific facts were supplied.' : 'Select an offered action to see its facts.'}</p>}
        <div className="astra-evidence-boundary"><strong>What is not known</strong><p>Unrevealed cards and future responses are not shown. An offered action is not a guaranteed outcome. The authoritative session validates submission and determines resolution.</p></div>
      </div>
    </details>
  );
}

function SettingsPanel({ settings, onChange, onClose }: { settings: TableSettings; onChange: (next: TableSettings) => void; onClose: () => void }) {
  const panelId = useId();

  function update<K extends keyof TableSettings>(key: K, value: TableSettings[K]) {
    const next = { ...settings, [key]: value };
    saveSettings(next);
    onChange(next);
  }

  return (
    <>
      <div className="astra-settings-backdrop" onClick={onClose} aria-hidden="true" />
      <section className="astra-settings-panel" role="dialog" aria-modal="true" aria-labelledby={`${panelId}-title`}>
        <header className="astra-settings-header">
          <span className="astra-settings-title" id={`${panelId}-title`}><Icon name="settings" /> Table settings</span>
          <button type="button" className="astra-settings-close" onClick={onClose} aria-label="Close settings"><Icon name="close" /></button>
        </header>
        <div className="astra-settings-body">
          <div className="astra-settings-group">
            <label className="astra-settings-label" htmlFor={`${panelId}-ts`}>Timestamps</label>
            <select id={`${panelId}-ts`} value={settings.timestampMode} onChange={e => update('timestampMode', e.target.value as TimestampMode)}>
              <option value="off">Off</option>
              <option value="clock">Clock time (local timezone)</option>
              <option value="elapsed">Match elapsed time</option>
            </select>
            <p className="astra-settings-hint">Show timestamps on chat messages and the match clock.</p>
          </div>

          <div className="astra-settings-group">
            <label className="astra-settings-label" htmlFor={`${panelId}-text`}>Text size</label>
            <select id={`${panelId}-text`} value={settings.textSize} onChange={e => update('textSize', e.target.value as TextSize)}>
              <option value="small">Small (92%)</option>
              <option value="normal">Normal (100%)</option>
              <option value="large">Large (112%)</option>
            </select>
            <p className="astra-settings-hint">Scales the text in the match chat panel.</p>
          </div>

          <div className="astra-settings-group astra-settings-group--toggle">
            <label className="astra-settings-toggle" htmlFor={`${panelId}-confirm`}>
              <input id={`${panelId}-confirm`} type="checkbox" checked={settings.confirmBeforeSubmit} onChange={e => update('confirmBeforeSubmit', e.target.checked)} />
              <span>Require confirm before submitting actions</span>
            </label>
            <p className="astra-settings-hint">When off, selecting an action submits it immediately.</p>
          </div>

          <div className="astra-settings-group astra-settings-group--toggle">
            <label className="astra-settings-toggle" htmlFor={`${panelId}-legal`}>
              <input id={`${panelId}-legal`} type="checkbox" checked={settings.highlightLegalCards} onChange={e => update('highlightLegalCards', e.target.checked)} />
              <span>Highlight cards with legal actions</span>
            </label>
            <p className="astra-settings-hint">Show a badge on hand cards that have offered actions.</p>
          </div>
        </div>
      </section>
    </>
  );
}

export function ChatPanel({ config, settings, matchStartRef }: { config: ChatConfig; settings?: TableSettings; matchStartRef?: React.MutableRefObject<number | null> }) {
  const { messages, onSend, selfName, opponentName, modeLabel, readOnly, hidden, onToggleHidden, notificationsMuted, onToggleMuted } = config;
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [ping, setPing] = useState(false);
  const prevCountRef = useRef(messages.length);
  const prevHiddenRef = useRef(hidden);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Track incoming messages for unread count + notification ping.
  // Only counts messages from others (not self, not system) that arrive
  // while the panel is hidden or muted.
  useEffect(() => {
    const prevCount = prevCountRef.current;
    const prevHidden = prevHiddenRef.current;
    const grew = messages.length > prevCount;
    const newMessages = grew ? messages.slice(prevCount) : [];
    const incoming = newMessages.filter(m => !m.isHuman && !m.isSystem);
    const wasHidden = prevHidden || hidden;

    if (incoming.length > 0) {
      if (wasHidden) {
        setUnreadCount(c => c + incoming.length);
      }
      if (!notificationsMuted) {
        setPing(true);
        const timer = setTimeout(() => setPing(false), 1200);
        return () => clearTimeout(timer);
      }
    }
    prevCountRef.current = messages.length;
    prevHiddenRef.current = hidden;
  }, [messages, hidden, notificationsMuted]);

  // Clear unread when expanded
  useEffect(() => {
    if (!hidden) setUnreadCount(0);
  }, [hidden]);

  // Auto-scroll to bottom on new messages or expand
  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length, hidden]);

  function submit(event: ReactMouseEvent | React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || text.length > 200 || sending) return;
    setSending(true);
    Promise.resolve(onSend(text)).then(() => {
      setDraft('');
      setSending(false);
    }).catch(() => setSending(false));
  }

  if (hidden) {
    return (
      <div className={`astra-chat astra-chat--collapsed${ping ? ' is-pinging' : ''}`} data-testid="astra-chat-panel" data-text-size={settings?.textSize ?? 'normal'}>
        <button type="button" className="astra-chat-fab" onClick={() => onToggleHidden?.(false)} aria-label={`Show chat${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}>
          <Icon name="chat" />
          {unreadCount > 0 && <span className="astra-chat-fab-count" aria-label={`${unreadCount} unread`}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
        </button>
      </div>
    );
  }

  return (
    <section className={`astra-chat${ping ? ' is-pinging' : ''}`} data-testid="astra-chat-panel" aria-label="Match chat" data-text-size={settings?.textSize ?? 'normal'}>
      <header className="astra-chat-header">
        <span className="astra-chat-title"><Icon name="chat" /> Match chat</span>
        <span className="astra-chat-mode">{modeLabel ?? 'LIVE'}</span>
        {onToggleMuted && <button type="button" className={`astra-chat-mute${notificationsMuted ? ' is-muted' : ''}`} onClick={() => onToggleMuted(!notificationsMuted)} aria-label={notificationsMuted ? 'Unmute notifications' : 'Mute notifications'} title={notificationsMuted ? 'Unmute notifications' : 'Mute notifications'}>{notificationsMuted ? '\u{1F507}' : '\u{1F514}'}</button>}
        {onToggleHidden && <button type="button" className="astra-chat-collapse" onClick={() => onToggleHidden?.(true)} aria-label="Hide chat" title="Hide chat"><Icon name="chevron" /></button>}
      </header>
      <div className="astra-chat-messages" ref={scrollRef} role="log" aria-live="polite" aria-atomic="false">
        {messages.length === 0 ? <p className="astra-chat-empty">No messages yet</p> : messages.map((m, i) => {
          const isSystem = m.isSystem === true;
          const isSelf = !isSystem && m.isHuman === true;
          const author = isSystem ? 'System' : isSelf ? selfName : opponentName;
          const ts = settings ? formatTimestamp(settings.timestampMode, matchStartRef ?? { current: null }) : null;
          return (
            <div key={m.messageId ?? `msg-${i}`} className={`astra-chat-msg${isSystem ? ' is-system' : isSelf ? ' is-self' : ' is-other'}${m.isOptimistic ? ' is-pending' : ''}`}>
              <div className="astra-chat-author">{author}{ts && <span className="astra-chat-time" aria-label={`Sent at ${ts}`}>{ts}</span>}</div>
              <div className="astra-chat-text">{m.text}</div>
            </div>
          );
        })}
      </div>
      {!readOnly && (
        <form className="astra-chat-input" onSubmit={submit}>
          <input type="text" value={draft} onChange={e => setDraft(e.target.value.slice(0, 200))} placeholder="Message..." maxLength={200} aria-label="Chat message" data-testid="astra-chat-input" />
          <button type="submit" disabled={!draft.trim() || sending} aria-label="Send"><Icon name="chevron" /></button>
        </form>
      )}
    </section>
  );
}

const EVENT_CONDENSED: Record<string, { icon: IconName; keyword: string }> = {
  CORE_ACTION_DECLARED: { icon: 'cards', keyword: 'Act' },
  DECLARATION_COMMITTED: { icon: 'check', keyword: 'Commit' },
  CORE_CARD_SCORED: { icon: 'check', keyword: 'Score' },
  CARD_SCORED: { icon: 'check', keyword: 'Score' },
  CORE_COUNTER_DECLARED: { icon: 'shield', keyword: 'Counter' },
  COUNTER_DECLARED: { icon: 'shield', keyword: 'Counter' },
  CORE_COUNTER_RESOLVED: { icon: 'shield', keyword: 'Resolved' },
  CORE_RESPONSE_WINDOW_CLOSED: { icon: 'close', keyword: 'Closed' },
  PRIORITY_CLOSED: { icon: 'close', keyword: 'Priority' },
  CORE_FULL_TURN_COMPLETED: { icon: 'arrow', keyword: 'Turn' },
  CORE_START_PREPARED: { icon: 'layers', keyword: 'Start' },
  CORE_FACE_UP_SWAP_DRAW_RESOLVED: { icon: 'cards', keyword: 'Swap' },
  CORE_ACE_ANCHOR_ENTERED: { icon: 'shield', keyword: 'Ace' },
  CORE_KING_ANCHOR_ENTERED: { icon: 'shield', keyword: 'King' },
  CORE_QUEEN_ANCHOR_ENTERED: { icon: 'shield', keyword: 'Queen' },
  QUEEN_ANCHOR_ENTERED: { icon: 'shield', keyword: 'Queen' },
  CORE_NORMAL_VICTORY: { icon: 'shield', keyword: 'Win' },
  CORE_EXHAUSTED_RESOLVED: { icon: 'close', keyword: 'Exhaust' },
  CORE_ROOT_RESOLVED: { icon: 'check', keyword: 'Resolved' },
  CORE_ROOT_FIZZLED: { icon: 'close', keyword: 'Fizzle' },
};

function actorInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed.charAt(0).toUpperCase();
}

// ── Ability-to-action mapping ─────────────────────────────────────
// Maps card definition ability IDs to engine action families heuristically.
// Returns matching legal actions for a given ability.

const POINTS_FAMILIES = new Set(['score', 'play-for-points']);

function actionsForAbility(abilityId: string, actions: readonly TableAction[]): TableAction[] {
  const lower = abilityId.toLowerCase();
  // Direct counter abilities → counter family
  if (lower.startsWith('counter')) return actions.filter(a => a.family === 'counter');
  // Anchor abilities
  if (lower === 'anchor') return actions.filter(a => a.family === 'anchor' && a.mode !== 'royal-marriage');
  if (lower === 'royal-marriage') return actions.filter(a => a.family === 'anchor' && a.mode === 'royal-marriage');
  if (lower === 'anchor-guard') return actions.filter(a => a.family === 'anchor-guard');
  if (lower === 'anchor-private-choice') return actions.filter(a => a.family === 'anchor-private-choice');
  // Effect families — map by rank keyword
  if (lower.startsWith('effect-') || lower === 'foundation' || lower === 'mimic' || lower === 'mimic-pair' || lower === 'wild-sovereignty') {
    return actions.filter(a => a.family.startsWith('effect-') || a.family === 'rank10' || a.family === 'ultra' || a.family === 'solo-wild' || a.family === 'voltage');
  }
  // Scuttle
  if (lower === 'scuttle') return actions.filter(a => a.family === 'scuttle');
  // Jack attachment
  if (lower.includes('jack') || lower.includes('attachment')) return actions.filter(a => a.family === 'effect-jack-control' || a.family === 'attachment');
  // Fallback: no match
  return [];
}

// ── Action Popover (click or Ctrl+hover) with inline confirm ──────
//
// Replaces both the old QuickActionPopover (Ctrl+hover) and the side-panel
// action list. Triggered by clicking a hand card OR Ctrl+hovering one.
// Selecting an action swaps to an inline confirm view (label, family,
// timing, sources, targets, Confirm/Cancel) so the side panel is not needed.

function ActionPopover({ card, actions, rect, blocked, game, cards, confirmBeforeSubmit, onSelect, onConfirm, onClose }: {
  card: TableCard;
  actions: readonly TableAction[];
  rect: DOMRect;
  blocked: boolean;
  game: TableGame;
  cards: readonly TableCard[];
  confirmBeforeSubmit: boolean;
  onSelect: (actionId: string) => void;
  onConfirm: (actionId: string) => void;
  onClose: () => void;
}) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const { definition, displayName } = cardPresentation(card);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  // Exclude Points family — those are played by dragging to the Point row
  const quickActions = actions.filter(a => !POINTS_FAMILIES.has(a.family));
  const pendingAction = pendingActionId ? quickActions.find(a => a.id === pendingActionId) ?? null : null;

  // Number key shortcuts (1-9) to pick an action; Enter confirms; Escape closes
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      if (pendingAction) {
        if (e.key === 'Enter' && !blocked) { e.preventDefault(); onConfirm(pendingAction.id); }
        if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); setPendingActionId(null); }
        return;
      }
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key, 10) - 1;
        if (idx < quickActions.length && !blocked) {
          e.preventDefault();
          if (confirmBeforeSubmit) setPendingActionId(quickActions[idx].id);
          else onConfirm(quickActions[idx].id);
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [quickActions, blocked, confirmBeforeSubmit, pendingAction, onSelect, onConfirm, onClose]);

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  if (quickActions.length === 0) return null;

  // Position above the card, clamped to viewport
  const popoverWidth = 300;
  const left = Math.max(8, Math.min(window.innerWidth - popoverWidth - 8, rect.left + rect.width / 2 - popoverWidth / 2));
  const above = rect.top > 240;
  const top = above ? rect.top - 8 : rect.bottom + 8;
  const style = {
    left: `${left}px`,
    top: `${top}px`,
    width: `${popoverWidth}px`,
    transform: above ? 'translateY(-100%)' : 'none',
  } as const;

  function pick(actionId: string) {
    if (blocked) return;
    if (confirmBeforeSubmit) setPendingActionId(actionId);
    else onConfirm(actionId);
  }

  if (pendingAction) {
    return (
      <div ref={popoverRef} className="astra-action-popover is-confirming" style={style} role="dialog" aria-label={`Confirm action for ${displayName}`}>
        <div className="astra-action-popover-header">
          <span className="astra-eyebrow">Review &amp; confirm</span>
          <button type="button" className="astra-icon-button" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <div className="astra-action-popover-confirm">
          <strong className="astra-action-popover-title">{pendingAction.label || 'Unnamed offered action'}</strong>
          <div className="astra-confirm-tags"><Badge tone="cyan">{formatLabel(pendingAction.family, 'Unspecified family')}</Badge><Badge>{formatLabel(pendingAction.timing, 'Timing not reported')}</Badge></div>
          {pendingAction.sources.length > 0 && <div className="astra-action-popover-refs"><b>From</b> {referenceNames(game, cards, pendingAction.sources)}</div>}
          {pendingAction.targets.length > 0 && <div className="astra-action-popover-refs"><b>To</b> {referenceNames(game, cards, pendingAction.targets)}</div>}
          <p className="astra-fine-print">Selection is not submission. The result is not known until the session resolves it.</p>
          <div className="astra-action-popover-buttons">
            <button type="button" className="astra-button astra-button--primary" disabled={blocked} onClick={() => onConfirm(pendingAction.id)}><Icon name={blocked ? 'layers' : 'check'} />Confirm</button>
            <button type="button" className="astra-button astra-button--quiet" onClick={() => setPendingActionId(null)}>Back</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={popoverRef} className="astra-action-popover" style={style} role="menu" aria-label={`Actions for ${displayName}`}>
      <div className="astra-action-popover-header">
        <span className="astra-eyebrow">Actions</span>
        <span className="astra-quick-action-hint">1–9 to pick · Enter to confirm</span>
        <button type="button" className="astra-icon-button" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
      </div>
      <ul className="astra-quick-action-list">
        {quickActions.map((action, index) => {
          const timingBadge = action.timing;
          const matchingAbility = definition?.abilities?.find(ab => actionsForAbility(ab.id, [action]).length > 0);
          const summary = matchingAbility ? matchingAbility.summary : '';
          return (
            <li key={action.id}>
              <button
                type="button"
                className="astra-quick-action-btn"
                disabled={blocked}
                onClick={() => pick(action.id)}
                role="menuitem"
                aria-label={`${action.label}${summary ? ` — ${summary}` : ''}`}
              >
                <span className="astra-quick-action-index">{index < 9 ? index + 1 : ''}</span>
                <span className="astra-quick-action-body">
                  <span className="astra-quick-action-label">{action.label}</span>
                  {summary && <span className="astra-quick-action-summary">{summary}</span>}
                </span>
                <Badge tone="neutral">{timingBadge}</Badge>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Combo Bar (ctrl+click multi-card reveal) ───────────────────────
//
// When the player ctrl+clicks 2+ hand cards, a floating bar appears above
// the hand showing matching multi-source actions (Super, Ultra, Sudden
// Death, royal-marriage, anchor-guard, etc.). Selecting a combo action
// opens an inline confirm view within the bar.

function ComboBar({ selection, cards: allCards, actions, game, blocked, confirmBeforeSubmit, onConfirm, onClear, onRemove }: {
  selection: readonly string[];
  cards: readonly TableCard[];
  actions: readonly TableAction[];
  game: TableGame;
  blocked: boolean;
  confirmBeforeSubmit: boolean;
  onConfirm: (actionId: string) => void;
  onClear: () => void;
  onRemove: (cardId: string) => void;
}) {
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  // Multi-source actions whose sources are exactly the selected set, or a subset.
  const selectionSet = new Set(selection);
  const exact = actions.filter(a => a.sources.length >= 2 && a.sources.length === selection.length && a.sources.every(id => selectionSet.has(id)));
  const subset = actions.filter(a => a.sources.length >= 2 && a.sources.length < selection.length && a.sources.every(id => selectionSet.has(id)));
  const comboActions = [...exact, ...subset];
  const pendingAction = pendingActionId ? comboActions.find(a => a.id === pendingActionId) ?? null : null;

  // Reset pending when selection changes
  useEffect(() => { setPendingActionId(null); }, [selection.join(',')]);

  // Escape clears the combo (handled here too as a defense-in-depth)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { if (pendingActionId) setPendingActionId(null); else onClear(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pendingActionId, onClear]);

  function pick(actionId: string) {
    if (blocked) return;
    if (confirmBeforeSubmit) setPendingActionId(actionId);
    else onConfirm(actionId);
  }

  function labelFor(id: string) {
    const card = allCards.find(c => c.id === id);
    return card?.label || card?.identity || id;
  }

  return (
    <div className="astra-combo-bar" role="region" aria-label="Combo action bar">
      <div className="astra-combo-bar-chips">
        <span className="astra-eyebrow">Combo</span>
        {selection.map(id => (
          <span key={id} className="astra-combo-chip">
            {labelFor(id)}
            <button type="button" className="astra-combo-chip-remove" onClick={() => onRemove(id)} aria-label={`Remove ${labelFor(id)} from combo`}><Icon name="close" /></button>
          </span>
        ))}
        <button type="button" className="astra-button astra-button--quiet astra-combo-clear" onClick={onClear}><Icon name="close" />Clear</button>
      </div>
      {pendingAction ? (
        <div className="astra-combo-confirm">
          <strong>{pendingAction.label || 'Unnamed offered action'}</strong>
          <div className="astra-confirm-tags"><Badge tone="cyan">{formatLabel(pendingAction.family, 'Unspecified family')}</Badge><Badge>{formatLabel(pendingAction.timing, 'Timing not reported')}</Badge></div>
          {pendingAction.sources.length > 0 && <div className="astra-action-popover-refs"><b>From</b> {pendingAction.sources.map(id => labelFor(id)).join(', ')}</div>}
          {pendingAction.targets.length > 0 && <div className="astra-action-popover-refs"><b>To</b> {pendingAction.targets.map(id => { const r = referenceFor(game, allCards, id); return r.label; }).join(', ')}</div>}
          <p className="astra-fine-print">Selection is not submission. The result is not known until the session resolves it.</p>
          <div className="astra-action-popover-buttons">
            <button type="button" className="astra-button astra-button--primary" disabled={blocked} onClick={() => onConfirm(pendingAction.id)}><Icon name="check" />Confirm</button>
            <button type="button" className="astra-button astra-button--quiet" onClick={() => setPendingActionId(null)}>Back</button>
          </div>
        </div>
      ) : comboActions.length > 0 ? (
        <div className="astra-combo-btns">
          {exact.map(action => (
            <button key={action.id} type="button" className="astra-combo-btn" disabled={blocked} onClick={() => pick(action.id)}>
              <span className="astra-combo-btn-label">{action.label}</span>
              <Badge tone="cyan">{formatLabel(action.family, 'Family')}</Badge>
            </button>
          ))}
          {subset.length > 0 && <>
            <div className="astra-combo-subset-label">Also available with a subset:</div>
            {subset.map(action => (
              <button key={action.id} type="button" className="astra-combo-btn astra-combo-btn--subset" disabled={blocked} onClick={() => pick(action.id)}>
                <span className="astra-combo-btn-label">{action.label}</span>
                <Badge tone="neutral">{formatLabel(action.family, 'Family')}</Badge>
              </button>
            ))}
          </>}
        </div>
      ) : (
        <p className="astra-combo-empty">No multi-card combo available for this selection. <button type="button" className="astra-button astra-button--quiet" onClick={onClear}>Clear</button></p>
      )}
    </div>
  );
}

// ── Action Toolbar (no-source Decline/Pass) ────────────────────────
//
// Compact toolbar shown above the hand when Decline/Pass actions are
// offered (and not auto-skipped). Phase transitions are auto-submitted
// elsewhere; this only surfaces terminal no-target response actions.

function ActionToolbar({ actions, blocked, confirmBeforeSubmit, onConfirm }: {
  actions: readonly TableAction[];
  blocked: boolean;
  confirmBeforeSubmit: boolean;
  onConfirm: (actionId: string) => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const pending = pendingId ? actions.find(a => a.id === pendingId) ?? null : null;

  function pick(actionId: string) {
    if (blocked) return;
    if (confirmBeforeSubmit) setPendingId(actionId);
    else onConfirm(actionId);
  }

  if (actions.length === 0) return null;

  if (pending) {
    return (
      <div className="astra-action-toolbar is-confirming" role="region" aria-label="Confirm response action">
        <strong>{pending.label}</strong>
        <div className="astra-action-popover-buttons">
          <button type="button" className="astra-button astra-button--primary" disabled={blocked} onClick={() => onConfirm(pending.id)}><Icon name="check" />Confirm</button>
          <button type="button" className="astra-button astra-button--quiet" onClick={() => setPendingId(null)}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="astra-action-toolbar" role="region" aria-label="Response actions">
      {actions.map(action => (
        <button key={action.id} type="button" className={`astra-button ${action.family === 'exhausted-pass' ? 'astra-button--quiet' : 'astra-button--danger'}`} disabled={blocked} onClick={() => pick(action.id)}>
          <Icon name="close" />{action.label || (action.family === 'exhausted-pass' ? 'Pass turn' : 'Decline to respond')}
        </button>
      ))}
    </div>
  );
}

// ── Full Card Overlay (Shift+hover) ───────────────────────────────

const FULL_CARD_POS_KEY = 'intrilex:full-card-overlay-pos';

function FullCardOverlay({ card, actions, blocked, onSelect, onClose }: {
  card: TableCard;
  actions: readonly TableAction[];
  blocked: boolean;
  onSelect: (actionId: string) => void;
  onClose: () => void;
}) {
  const { definition, suit, art, displayName } = cardPresentation(card);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [overlayPos, setOverlayPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const raw = localStorage.getItem(FULL_CARD_POS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') return parsed;
      return null;
    } catch { return null; }
  });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ mouseX: number; mouseY: number; posX: number; posY: number } | null>(null);

  // Escape to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Drag handlers
  function handleHeaderDragStart(e: ReactMouseEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    const overlay = overlayRef.current;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    const startX = overlayPos?.x ?? rect.left;
    const startY = overlayPos?.y ?? rect.top;
    dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, posX: startX, posY: startY };
    setDragging(true);
    e.preventDefault();
  }

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: MouseEvent) {
      if (!dragStart.current) return;
      const dx = e.clientX - dragStart.current.mouseX;
      const dy = e.clientY - dragStart.current.mouseY;
      const newX = dragStart.current.posX + dx;
      const newY = dragStart.current.posY + dy;
      const overlay = overlayRef.current;
      const w = overlay?.offsetWidth ?? 560;
      const clampedX = Math.max(-w + 100, Math.min(window.innerWidth - 100, newX));
      const clampedY = Math.max(0, Math.min(window.innerHeight - 40, newY));
      setOverlayPos({ x: clampedX, y: clampedY });
    }
    function onUp() {
      setDragging(false);
      dragStart.current = null;
      setOverlayPos(pos => {
        if (pos) { try { localStorage.setItem(FULL_CARD_POS_KEY, JSON.stringify(pos)); } catch { /* ignore */ } }
        return pos;
      });
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  if (!definition) return null;
  const cardActions = actions.filter(a => a.sources.includes(card.id));
  const matchedActionIds = new Set<string>();
  const abilitiesWithActions = definition.abilities.map(ability => {
    const matched = actionsForAbility(ability.id, cardActions);
    matched.forEach(a => matchedActionIds.add(a.id));
    return { ability, actions: matched };
  });
  // Unmatched actions (fallback section)
  const unmatchedActions = cardActions.filter(a => !matchedActionIds.has(a.id) && !POINTS_FAMILIES.has(a.family));

  const accent = suit?.accent ?? '#a0b8c4';

  return (
    <>
      <div className="astra-full-card-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={overlayRef}
        className={`astra-full-card-overlay${dragging ? ' is-dragging' : ''}`}
        style={overlayPos ? { left: `${overlayPos.x}px`, top: `${overlayPos.y}px` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={`Full card details for ${displayName}`}
      >
        <header className="astra-full-card-header" onMouseDown={handleHeaderDragStart}>
          <div className="astra-full-card-identity">
            {art && <span className="astra-full-card-art" aria-hidden="true"><img src={art.board} alt="" loading="lazy" /></span>}
            <div>
              <span className="astra-eyebrow">Card details</span>
              <h2>{displayName}</h2>
              <p>{definition.subtitle ?? ''}</p>
            </div>
          </div>
          <button type="button" className="astra-event-log-toggle" onClick={onClose} aria-label="Close card details"><Icon name="close" /></button>
        </header>
        <div className="astra-full-card-body">
          {definition.motto && <p className="astra-full-card-motto" style={{ '--astra-card-accent': accent } as React.CSSProperties}>{definition.motto}</p>}
          {definition.badges && definition.badges.length > 0 && (
            <div className="astra-full-card-badges">{definition.badges.map((b, i) => <Badge key={i} tone="cyan">{b}</Badge>)}</div>
          )}
          <ul className="astra-full-card-abilities">
            {abilitiesWithActions.map(({ ability, actions: matched }) => (
              <li key={ability.id} className="astra-full-card-ability">
                <div className="astra-full-card-ability-header">
                  <span className="astra-full-card-ability-icon" aria-hidden="true">{ability.icon ?? '◆'}</span>
                  <div className="astra-full-card-ability-title">
                    <strong>{ability.title}</strong>
                    <span className="astra-full-card-ability-timing">{ability.timing ?? ''}</span>
                  </div>
                  {matched.length > 0 && !blocked && (
                    <div className="astra-full-card-play-btns">
                      {matched.map(action => (
                        <button
                          key={action.id}
                          type="button"
                          className="astra-button astra-button--primary astra-full-card-play-btn"
                          onClick={() => onSelect(action.id)}
                        >
                          <Icon name="check" />Play
                        </button>
                      ))}
                    </div>
                  )}
                  {matched.length > 0 && blocked && <span className="astra-full-card-play-disabled">Unavailable</span>}
                </div>
                <p className="astra-full-card-ability-full">{ability.full ?? ability.summary ?? ''}</p>
                {ability.restrictions && ability.restrictions.length > 0 && (
                  <ul className="astra-full-card-restrictions">
                    {ability.restrictions.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          {unmatchedActions.length > 0 && (
            <div className="astra-full-card-unmatched">
              <span className="astra-eyebrow">Other legal actions</span>
              <div className="astra-full-card-play-btns">
                {unmatchedActions.map(action => (
                  <button
                    key={action.id}
                    type="button"
                    className="astra-button astra-button--quiet astra-full-card-play-btn"
                    disabled={blocked}
                    onClick={() => onSelect(action.id)}
                  >
                    <Icon name="check" />{action.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {'notes' in definition && Array.isArray(definition.notes) && definition.notes.length > 0 && (
            <div className="astra-full-card-notes">
              <span className="astra-eyebrow">Notes</span>
              <ul>{definition.notes.map((n: unknown, i: number) => <li key={i}>{String(n)}</li>)}</ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function EventLog({ game }: { game: TableGame }) {
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const inputId = useId();
  const cards = visibleCards(game);
  const types = [...new Set(game.events.map(event => event.type))];
  const effectiveFilter = types.includes(typeFilter) ? typeFilter : '';
  const events = game.events.filter(event => !effectiveFilter || event.type === effectiveFilter);

  // ── Draggable overlay position (persisted in localStorage) ──
  const OVERLAY_POS_KEY = 'intrilex:event-overlay-pos';
  const [overlayPos, setOverlayPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const raw = localStorage.getItem(OVERLAY_POS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') return parsed;
      return null;
    } catch { return null; }
  });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ mouseX: number; mouseY: number; posX: number; posY: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  function eventCardLabels(event: TableEvent): string[] {
    return event.cardRefs.map(ref => {
      const card = cards.find(c => c.id === ref);
      return card?.label ?? card?.identity ?? null;
    }).filter((label): label is string => label !== null);
  }

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeOverlay();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [expanded]);

  // ── Drag handlers for the overlay header ──
  function handleHeaderDragStart(e: React.MouseEvent) {
    // Don't drag when clicking the close button
    if ((e.target as HTMLElement).closest('button')) return;
    const overlay = overlayRef.current;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    const startX = overlayPos?.x ?? rect.left;
    const startY = overlayPos?.y ?? rect.top;
    dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, posX: startX, posY: startY };
    setDragging(true);
    e.preventDefault();
  }

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: MouseEvent) {
      if (!dragStart.current) return;
      const dx = e.clientX - dragStart.current.mouseX;
      const dy = e.clientY - dragStart.current.mouseY;
      const newX = dragStart.current.posX + dx;
      const newY = dragStart.current.posY + dy;
      // Clamp to viewport (allow partial off-screen but keep header visible)
      const overlay = overlayRef.current;
      const w = overlay?.offsetWidth ?? 620;
      const clampedX = Math.max(-w + 80, Math.min(window.innerWidth - 80, newX));
      const clampedY = Math.max(0, Math.min(window.innerHeight - 40, newY));
      setOverlayPos({ x: clampedX, y: clampedY });
    }
    function onUp() {
      setDragging(false);
      dragStart.current = null;
      // Persist final position
      setOverlayPos(pos => {
        if (pos) {
          try { localStorage.setItem(OVERLAY_POS_KEY, JSON.stringify(pos)); } catch { /* ignore */ }
        }
        return pos;
      });
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  function closeOverlay() {
    setClosing(true);
    setTimeout(() => { setExpanded(false); setClosing(false); }, 280);
  }

  return (
    <section className="astra-event-log-panel" aria-label="Event log">
      <header className="astra-event-log-header">
        <span className="astra-eyebrow">Events</span>
        <span className="astra-event-log-count">{game.events.length}</span>
        <button type="button" className="astra-event-log-toggle" onClick={() => setExpanded(true)} aria-label="Expand full event log" disabled={game.events.length === 0}><Icon name="eye" /></button>
      </header>
      {game.events.length > 0 ? (
        <ol className="astra-event-log-condensed" aria-label="Events in supplied order" tabIndex={0}>
          {game.events.map(event => {
            const condensed = EVENT_CONDENSED[event.type];
            const icon = condensed?.icon ?? 'layers';
            const keyword = condensed?.keyword ?? formatLabel(event.type, 'Event').split(' ')[0];
            const name = playerName(game, event.actorId, '');
            const cardLabels = eventCardLabels(event);
            return (
              <li key={event.id}>
                <Icon name={icon} />
                <strong>{keyword}</strong>
                {cardLabels.length > 0 && <span className="astra-event-log-cards">{cardLabels.join(' → ')}</span>}
                {name && <span className="astra-event-log-actor">{actorInitial(name)}</span>}
              </li>
            );
          })}
        </ol>
      ) : <p className="astra-event-log-empty">No events</p>}
      {expanded && (
        <>
          <div className={`astra-event-backdrop${closing ? ' is-closing' : ''}`} onClick={closeOverlay} aria-hidden="true" />
          <div
            ref={overlayRef}
            className={`astra-event-overlay${closing ? ' is-closing' : ''}${dragging ? ' is-dragging' : ''}`}
            style={overlayPos ? { left: `${overlayPos.x}px`, top: `${overlayPos.y}px`, animation: 'none' } : undefined}
            role="dialog"
            aria-modal="true"
            aria-label="Full event log"
          >
            <header className="astra-event-overlay-header" onMouseDown={handleHeaderDragStart}>
              <div className="astra-event-overlay-title"><span className="astra-eyebrow">Event log</span><span className="astra-event-log-count">{game.events.length} records</span></div>
              <button type="button" className="astra-event-log-toggle" onClick={closeOverlay} aria-label="Collapse event log"><Icon name="close" /></button>
            </header>
            <div className="astra-event-overlay-body">
              <div className="astra-log-filter"><label htmlFor={inputId}>Event type</label><select id={inputId} value={effectiveFilter} onChange={event => setTypeFilter(event.target.value)}><option value="">All events</option>{types.map(type => <option key={type} value={type}>{formatLabel(type, 'Unspecified')}</option>)}</select></div>
              {events.length > 0 ? <ol className="astra-events astra-event-overlay-events" aria-label="Events in supplied order" tabIndex={0}>
                {events.map(event => <li key={event.id}>
                  <span className="astra-event-type">{formatLabel(event.type, 'Unspecified event')}</span>
                  <p>{event.label || 'No description supplied.'}</p>
                  {eventCardLabels(event).length > 0 && <p className="astra-event-cards">Cards: {eventCardLabels(event).join(' → ')}</p>}
                  <span className="astra-event-actor">{playerName(game, event.actorId, 'Actor not supplied')}</span>
                  <details className="astra-event-record"><summary>Event record</summary><dl><div><dt>ID</dt><dd><code>{event.id}</code></dd></div><div><dt>Type</dt><dd><code>{event.type}</code></dd></div><div><dt>Actor ID</dt><dd><code>{event.actorId ?? 'Not supplied'}</code></dd></div><div><dt>Card refs</dt><dd><code>{event.cardRefs.length > 0 ? event.cardRefs.join(', ') : 'None'}</code></dd></div></dl></details>
                </li>)}
              </ol> : <EmptyState title="No events yet" compact>Reported events will appear here. No events are inferred from the board.</EmptyState>}
              <p className="astra-fine-print">Supplied order. Event timestamps are not provided.</p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function Resolution({ game }: { game: TableGame }) {
  const completed = game.status === 'completed';
  return (
    <section className={`astra-resolution${game.stack.length > 0 ? ' has-stack' : ''}${completed ? ' is-completed' : ''}`} aria-label="Resolution area">
      <div className="astra-section-heading"><h2>{completed ? 'Final result' : 'Resolution'}</h2><Badge tone={game.stack.length > 0 ? 'amber' : 'neutral'}>{completed ? 'Complete' : `${game.stack.length} pending`}</Badge></div>
      {completed ? <div className="astra-result"><Icon name="shield" /><span className="astra-eyebrow">Match concluded</span><h3>{game.winner ? `${playerName(game, game.winner)} — winner` : 'Result not reported'}</h3><p>{formatLabel(game.terminationReason, 'No termination reason supplied.')}</p></div> : game.stack.length > 0 ? <div className="astra-stack-frame"><ol className="astra-stack" aria-label="Pending stack in supplied order" tabIndex={0}>{game.stack.map((item, index) => <li key={item.id} className="astra-stack-button"><span className="astra-stack-index">{String(index + 1).padStart(2, '0')}</span><div className="astra-stack-button-body"><strong>{item.label}</strong><span>{playerName(game, item.controllerId, 'Controller not reported')}</span></div><Badge tone="amber">Pending</Badge></li>)}</ol></div> : <div className="astra-resolution-rest"><span className="astra-table-emblem" aria-hidden="true"><Icon name="layers" /></span><strong>{game.status === 'waiting' ? 'Waiting for the table' : 'The stack is clear'}</strong><p>{game.status === 'waiting' ? 'Waiting for an authoritative update.' : 'No pending resolution in this view.'}</p></div>}
      <div className="astra-priority-line"><span className="astra-status-dot" aria-hidden="true" /><span>Priority</span><strong>{playerName(game, game.priorityOwnerId)}</strong></div>
    </section>
  );
}

function SwapModal({ card, game, swapActions, blocked, onSelect, onConfirm, onClose }: {
  card: TableCard;
  game: TableGame;
  swapActions: readonly TableAction[];
  blocked: boolean;
  onSelect: (actionId: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const isFaceDown = card.identity === null;
  const faceUpActions = swapActions.filter(action => action.mode === 'face-up-draw');
  const faceUpMatched = faceUpActions.filter(action => action.targets.includes(card.id));
  const faceUpResult = faceUpMatched.length > 0 ? faceUpMatched : faceUpActions;
  const faceDownActions = swapActions.filter(action => action.mode === 'face-down' && action.sources.length > 0);
  const actions = isFaceDown ? faceDownActions : faceUpResult;

  // Deduplicate face-down hand cards by card ID (multiple face-down slots
  // produce one action per hand card per slot, but the player only needs
  // to see each hand card once).
  const handCards = isFaceDown
    ? actions.map(action => ({ action, card: game.self.hand.find(handCard => action.sources.includes(handCard.id)) ?? null }))
        .filter((entry): entry is { action: TableAction; card: TableCard } => entry.card !== null)
        .filter((entry, index, self) => self.findIndex(e => e.card.id === entry.card.id) === index)
    : [];

  function choose(actionId: string) {
    if (blocked) return;
    onSelect(actionId);
    onConfirm();
    onClose();
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="astra-swap-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="astra-swap-overlay" role="dialog" aria-modal="true" aria-label={isFaceDown ? 'Swap face-down card' : 'Take face-up swap card'}>
        <header className="astra-swap-overlay-header">
          <div className="astra-swap-overlay-title">
            <span className="astra-eyebrow">{isFaceDown ? 'Face-down swap slot' : 'Face-up swap card'}</span>
            {isFaceDown ? <span className="astra-swap-overlay-card-name">Hidden card</span> : <span className="astra-swap-overlay-card-name">{card.label}</span>}
          </div>
          <button type="button" className="astra-event-log-toggle" onClick={onClose} aria-label="Close swap dialog"><Icon name="close" /></button>
        </header>
        <div className="astra-swap-overlay-body">
          {actions.length === 0 ? (
            <div className="astra-swap-empty">
              <span className="astra-swap-empty-icon" aria-hidden="true"><Icon name="cards" /></span>
              <strong className="astra-swap-empty-title">{blocked ? 'Table unavailable' : 'No swap offered right now'}</strong>
              <p className="astra-swap-empty-text">{blocked ? 'The session is not accepting actions at this moment.' : isFaceDown ? 'No face-down swap actions are offered this turn. Check the decision window for other available actions.' : 'Face-up swap cards can only be taken during the Action phase. Wait for the phase transition to complete.'}</p>
            </div>
          ) : isFaceDown ? (
            <>
              <p className="astra-swap-overlay-hint">Choose a card from your hand to place face-down onto the swap bar. You will receive the hidden card in return.</p>
              <ul className="astra-swap-overlay-cards">
                {handCards.map(({ action, card: handCard }) => (
                  <li key={action.id}>
                    <CardFace card={handCard} size="small" onClick={() => choose(action.id)} purpose={`Place ${handCard.label} face-down`} />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p className="astra-swap-overlay-hint">Take this face-up card from the swap bar into your hand.</p>
              <ul className="astra-swap-overlay-cards">
                {actions.map(action => (
                  <li key={action.id}>
                    <CardFace card={card} size="small" onClick={() => choose(action.id)} purpose={`Take ${card.label}`} />
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="astra-fine-print">Selection is not submission. The result is determined by the authoritative session.</p>
        </div>
      </div>
    </>
  );
}

type SharedTableModuleId = 'events' | 'piles' | 'resolution' | 'swap';

const SHARED_TABLE_MODULE_IDS: SharedTableModuleId[] = ['events', 'piles', 'resolution', 'swap'];
const SHARED_TABLE_MODULE_LABELS: Record<SharedTableModuleId, string> = {
  events: 'Events',
  piles: 'Shared piles',
  resolution: 'Resolutions',
  swap: 'Swap bar',
};
const SHARED_TABLE_ORDER_KEY = 'intrilex:shared-table-order';

// Order swap cards so the face-up card sits in the middle between the two
// face-down cards. Face-down cards (identity === null) are split to the edges;
// face-up cards fill the center. Non-swap-shaped states pass through unchanged.
function orderSwapCards(cards: readonly TableCard[]): readonly TableCard[] {
  if (cards.length <= 1) return cards;
  const faceDown = cards.filter(c => c.identity === null);
  const faceUp = cards.filter(c => c.identity !== null);
  if (faceDown.length === 0 || faceUp.length === 0) return cards;
  const half = Math.floor(faceDown.length / 2);
  return [...faceDown.slice(0, half), ...faceUp, ...faceDown.slice(half)];
}

function loadSharedTableOrder(): SharedTableModuleId[] {
  try {
    const raw = localStorage.getItem(SHARED_TABLE_ORDER_KEY);
    if (!raw) return SHARED_TABLE_MODULE_IDS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return SHARED_TABLE_MODULE_IDS;
    const seen = new Set<SharedTableModuleId>();
    const valid = parsed.filter((id): id is SharedTableModuleId =>
      SHARED_TABLE_MODULE_IDS.includes(id) && !seen.has(id) && Boolean(seen.add(id)));
    for (const id of SHARED_TABLE_MODULE_IDS) if (!seen.has(id)) valid.push(id);
    return valid;
  } catch {
    return SHARED_TABLE_MODULE_IDS;
  }
}

function saveSharedTableOrder(order: SharedTableModuleId[]) {
  try { localStorage.setItem(SHARED_TABLE_ORDER_KEY, JSON.stringify(order)); } catch { /* ignore quota / privacy errors */ }
}

function SharedTableModule({ id, index, total, dragging, dropTarget, onDragStart, onDragOver, onDrop, onDragEnd, children }: {
  id: SharedTableModuleId;
  index: number;
  total: number;
  dragging: boolean;
  dropTarget: boolean;
  onDragStart: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={`astra-shared-module astra-shared-module--${id}${dragging ? ' is-dragging' : ''}${dropTarget ? ' is-drop-target' : ''}`}
      data-module={id}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div
        className="astra-shared-module-handle"
        draggable
        onDragStart={event => { onDragStart(); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', id); }}
        onDragEnd={onDragEnd}
        role="button"
        aria-label={`Drag to reorder ${SHARED_TABLE_MODULE_LABELS[id]} (position ${index} of ${total})`}
        title={`Drag to reorder — ${SHARED_TABLE_MODULE_LABELS[id]}`}
      >
        <span className="astra-shared-module-grip" aria-hidden="true"><Icon name="layers" /></span>
        <span className="astra-shared-module-handle-label">{SHARED_TABLE_MODULE_LABELS[id]}</span>
        <span className="astra-shared-module-position" aria-hidden="true">{index}/{total}</span>
      </div>
      {children}
    </div>
  );
}

function SharedTable({ game, onCard, selectedCardId, selected, onSwapCard }: {
  game: TableGame;
  onCard: (card: TableCard) => void;
  selectedCardId: string | null;
  selected: TableAction | null;
  onSwapCard: (card: TableCard) => void;
}) {
  const [order, setOrder] = useState<SharedTableModuleId[]>(loadSharedTableOrder);
  const [dragId, setDragId] = useState<SharedTableModuleId | null>(null);
  const [dropTargetId, setDropTargetId] = useState<SharedTableModuleId | null>(null);

  function handleDragOver(event: DragEvent<HTMLDivElement>, id: SharedTableModuleId) {
    if (dragId === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (id !== dragId) setDropTargetId(id);
  }

  function handleDrop(id: SharedTableModuleId) {
    if (dragId && dragId !== id) {
      setOrder(prev => {
        const from = prev.indexOf(dragId);
        const to = prev.indexOf(id);
        if (from === -1 || to === -1) return prev;
        const next = [...prev];
        next.splice(from, 1);
        next.splice(to, 0, dragId);
        saveSharedTableOrder(next);
        return next;
      });
    }
    setDragId(null);
    setDropTargetId(null);
  }

  function handleDragEnd() {
    setDragId(null);
    setDropTargetId(null);
  }

  const modules: Record<SharedTableModuleId, ReactNode> = {
    events: <EventLog game={game} />,
    piles: (
      <section className="astra-piles" aria-label="Shared piles">
        <h2 className="astra-eyebrow">Shared piles</h2>
        <div className="astra-pile astra-pile--draw"><span className="astra-deck" aria-hidden="true"><Icon name="cards" /></span><span><strong>{game.drawCount}</strong><span>Draw pile</span></span></div>
        <div className="astra-pile astra-pile--discard">{game.discardTop ? <CardFace card={game.discardTop} size="small" selected={selectedCardId === game.discardTop.id} onClick={() => game.discardTop && onCard(game.discardTop)} purpose="View discard reference" /> : <span className="astra-pile-placeholder" aria-hidden="true"><Icon name="cards" /></span>}<span><strong>{game.discardCount}</strong><span>Discard</span></span></div>
        <div className="astra-pile astra-pile--exile"><span className="astra-exile-mark" aria-hidden="true" /><span><strong>{game.exileCount}</strong><span>Exile</span></span></div>
      </section>
    ),
    resolution: <Resolution game={game} />,
    swap: (
      <section className="astra-swap" aria-label="Swap bar">
        <div className="astra-section-heading"><h2>Swap bar</h2><span>{game.swap.length}</span></div>
        {game.swap.length > 0 ? <ul className="astra-swap-cards" tabIndex={0} aria-label="Visible swap cards">{orderSwapCards(game.swap).map(card => <li key={card.id}><CardFace card={card} size="small" selected={selectedCardId === card.id} highlighted={selected?.sources.includes(card.id) || selected?.targets.includes(card.id)} onClick={() => onSwapCard(card)} purpose="Open swap dialog" /></li>)}</ul> : <EmptyState title="No swap cards" compact />}
      </section>
    ),
  };

  return (
    <div className="astra-shared-table" data-shared-table-order={order.join(',')}>
      {order.map((id, index) => (
        <SharedTableModule
          key={id}
          id={id}
          index={index + 1}
          total={order.length}
          dragging={dragId === id}
          dropTarget={dropTargetId === id}
          onDragStart={() => setDragId(id)}
          onDragOver={event => handleDragOver(event, id)}
          onDrop={() => handleDrop(id)}
          onDragEnd={handleDragEnd}
        >
          {modules[id]}
        </SharedTableModule>
      ))}
    </div>
  );
}

function Notice({ title, children, tone = 'neutral' }: { title: string; children: ReactNode; tone?: 'neutral' | 'danger' | 'amber' }) {
  return <div className={`astra-notice astra-notice--${tone}`}><strong>{title}</strong><p>{children}</p></div>;
}

export function GameTable(props: GameTableProps) {
  const { store } = props;
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const getSnapshot = useCallback(() => store.getSnapshot(), [store]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return <TableSession key={snapshot.game?.sessionId || 'no-session'} {...props} snapshot={snapshot} />;
}

function TableSession({ store, onSave, onReorderHand, skin = 'dark', debug = false, chat, opponentHand, railHtml, snapshot }: GameTableProps & { snapshot: TableSnapshot }) {
  const { game, interaction } = snapshot;
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [swapModalCardId, setSwapModalCardId] = useState<string | null>(null);
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  // Scuttle drag-and-release: opponent point-row card currently hovered
  const [scuttleHoverId, setScuttleHoverId] = useState<string | null>(null);
  // Hand reorder (cosmetic drag-drop within hand)
  const [handOrder, setHandOrder] = useState<readonly string[] | null>(null);
  const [handDragId, setHandDragId] = useState<string | null>(null);
  const [handDropIndex, setHandDropIndex] = useState<number | null>(null);
  const [opponentShuffleEpoch, setOpponentShuffleEpoch] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [settings, setSettings] = useState<TableSettings>(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const matchStartRef = useRef<number | null>(null);
  // 1s ticker so the minimized-sidebar duration stays live
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!game?.sessionId) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [game?.sessionId]);
  // Hover overlays: Ctrl+hover for action popover, Shift+hover for full card
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [hoveredCardRect, setHoveredCardRect] = useState<DOMRect | null>(null);
  const [ctrlHeld, setCtrlHeld] = useState(false);
  const [fullCardId, setFullCardId] = useState<string | null>(null);
  // Click-to-open action popover (single card). When set, takes precedence over ctrl+hover.
  const [popoverCardId, setPopoverCardId] = useState<string | null>(null);
  const [popoverRect, setPopoverRect] = useState<DOMRect | null>(null);
  // ctrl+click multi-card combo selection
  const [comboSelection, setComboSelection] = useState<string[]>([]);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // Track Ctrl/Shift key state for hover overlays; Escape clears combo selection
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Control') setCtrlHeld(true);
      if (e.key === 'Shift' && hoveredCardId && !fullCardId) {
        const card = game?.self.hand.find(c => c.id === hoveredCardId);
        if (card?.identity) setFullCardId(hoveredCardId);
      }
      if (e.key === 'Escape') { setComboSelection([]); setPopoverCardId(null); }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'Control') setCtrlHeld(false);
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, [hoveredCardId, fullCardId, game?.self.hand]);

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const submissionInFlight = useRef(false);
  const saveInFlight = useRef(false);
  const id = useId();
  const handId = `${id}-hand`;
  const actionsId = `${id}-actions`;
  const cards = game ? visibleCards(game) : [];
  const selected = game?.actions.find(action => action.id === snapshot.selectedActionId) ?? null;
  const swapActions = game?.actions.filter(action => action.family === 'swap-bar') ?? [];
  const declineActions = game?.actions.filter(action => action.family === 'response-decline' || action.family === 'exhausted-pass') ?? [];
  const nonSwapActions = game?.actions.filter(action => action.family !== 'swap-bar' && action.family !== 'phase' && action.family !== 'response-decline' && action.family !== 'exhausted-pass') ?? [];
  const swapModalCard = swapModalCardId ? cards.find(card => card.id === swapModalCardId) ?? null : null;
  const readOnly = game ? isReadOnly(game) : true;
  const submitting = interaction === 'submitting';
  const blocked = !game || game.status !== 'ready' || readOnly || Boolean(game.error) || submitting;
  const problem = snapshot.error || game?.error || null;
  const skinName = ['dark', 'light', 'cosmotech', 'corrupture'].includes(skin) ? skin : 'dark';
  const stageStatus = game ? actionAvailability(game) : 'No active table';
  const liveMessage = game?.status === 'completed' ? 'Match complete. The final result is available in the resolution area.' : submitting ? 'Submitting the selected action.' : problem ? 'An issue needs attention. Review the table notice.' : notice || (saveState === 'saving' ? 'Saving match.' : saveState === 'saved' ? 'Save completed.' : saveState === 'failed' ? 'Save failed. You can try again.' : selected ? `Selected: ${selected.label}. Review and confirm to submit.` : stageStatus);

  const phaseActionId = game?.actions.find(action => action.family === 'phase' && action.mode === 'enter-action')?.id ?? null;
  useEffect(() => {
    if (!phaseActionId || !game || blocked || submissionInFlight.current) return;
    submissionInFlight.current = true;
    store.select(phaseActionId);
    void store.submit().finally(() => { submissionInFlight.current = false; });
  }, [phaseActionId, game, blocked, store]);

  // Auto-skip when the only available actions are decline/pass (no counter-actions)
  const declineOnly = game && !blocked && nonSwapActions.length === 0 && swapActions.length === 0 && declineActions.length > 0;
  useEffect(() => {
    if (!declineOnly || !game || submissionInFlight.current) return;
    const declineAction = game.actions.find(action => action.family === 'response-decline' || action.family === 'exhausted-pass');
    if (!declineAction) return;
    submissionInFlight.current = true;
    store.select(declineAction.id);
    void store.submit().then(accepted => {
      showToast(accepted ? 'No response offered — declined automatically.' : 'Decline was not confirmed. Check the table.');
    }).finally(() => { submissionInFlight.current = false; });
  }, [declineOnly, game, store]);

  // Sync hand order from the game snapshot (server-provided on reconnect)
  useEffect(() => {
    if (game?.handOrder) setHandOrder(game.handOrder);
  }, [game?.handOrder]);

  // Sync opponent shuffle epoch — triggers face-down shuffle animation
  useEffect(() => {
    if (game?.opponentHandReorderEpoch && game.opponentHandReorderEpoch !== opponentShuffleEpoch) {
      setOpponentShuffleEpoch(game.opponentHandReorderEpoch);
    }
  }, [game?.opponentHandReorderEpoch, opponentShuffleEpoch]);

  // Apply hand order to the engine's hand — reorders cards cosmetically.
  // Cards not in handOrder (e.g. newly drawn) are appended at the end.
  function applyHandOrder(hand: readonly TableCard[]): readonly TableCard[] {
    if (!handOrder || handOrder.length <= 1) return hand;
    const byId = new Map(hand.map(c => [c.id, c]));
    const ordered: TableCard[] = [];
    const seen = new Set<string>();
    for (const id of handOrder) {
      const card = byId.get(id);
      if (card) { ordered.push(card); seen.add(id); }
    }
    for (const card of hand) {
      if (!seen.has(card.id)) ordered.push(card);
    }
    return ordered;
  }

  // Commit a hand reorder: update local state and notify the server
  function commitHandReorder(orderedIds: readonly string[]) {
    setHandOrder(orderedIds);
    if (onReorderHand) void onReorderHand(orderedIds);
  }

  // Handle dropping a hand card at a new position within the hand
  function handleHandReorder(draggedId: string, targetIndex: number) {
    if (!game || blocked) return;
    const currentHand = applyHandOrder(game.self.hand);
    const ids = currentHand.map(c => c.id);
    const fromIndex = ids.indexOf(draggedId);
    if (fromIndex === -1 || fromIndex === targetIndex) return;
    const reordered = [...ids];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(Math.min(targetIndex, reordered.length), 0, moved);
    commitHandReorder(reordered);
  }

  function jumpTo(event: ReactMouseEvent<HTMLAnchorElement>, targetId: string) {
    event.preventDefault();
    const target = event.currentTarget.closest('.astra-client')?.querySelector<HTMLElement>(`[id="${targetId}"]`);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  function clearCombo() {
    setComboSelection([]);
  }

  function removeFromCombo(cardId: string) {
    setComboSelection(prev => prev.filter(id => id !== cardId));
  }

  // Click on a hand card: if a combo is in progress and the card is not yet
  // selected, add it to the combo (continuing the multi-select). Otherwise
  // open the single-card action popover. ctrl+click toggles combo selection.
  function handleHandCardClick(card: TableCard, e: ReactMouseEvent, rect: DOMRect) {
    if (blocked || !card.identity) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setPopoverCardId(null);
      setComboSelection(prev => prev.includes(card.id) ? prev.filter(id => id !== card.id) : [...prev, card.id]);
      return;
    }
    if (comboSelection.length > 0 && !comboSelection.includes(card.id)) {
      setComboSelection(prev => [...prev, card.id]);
      return;
    }
    // Plain click on an already-combo-selected card: remove it from the combo.
    if (comboSelection.includes(card.id)) {
      setComboSelection(prev => prev.filter(id => id !== card.id));
      return;
    }
    setFocusedCardId(card.id);
    setPopoverCardId(prev => prev === card.id ? null : card.id);
    setPopoverRect(rect);
  }

  function focusCard(card: TableCard) {
    setFocusedCardId(card.id);
  }

  function selectAction(actionId: string | null) {
    if (blocked) return;
    setNotice('');
    store.select(actionId);
    if (actionId !== null && !settings.confirmBeforeSubmit) {
      void confirmAction(actionId);
    }
  }

  const POINT_ROW_FAMILIES = new Set(['score', 'play-for-points']);
  const ENDURING_ROW_FAMILIES = new Set(['anchor', 'anchor-guard', 'anchor-private-choice']);

  function actionForDrag(cardId: string, row: 'points' | 'enduring'): TableAction | null {
    if (!game || blocked) return null;
    const families = row === 'points' ? POINT_ROW_FAMILIES : ENDURING_ROW_FAMILIES;
    return game.actions.find(action => families.has(action.family) && action.sources.includes(cardId)) ?? null;
  }

  function canDrop(cardId: string, row: 'points' | 'enduring'): boolean {
    return actionForDrag(cardId, row) !== null;
  }

  function handleDrop(cardId: string, row: 'points' | 'enduring') {
    const action = actionForDrag(cardId, row);
    if (!action) return;
    store.select(action.id);
    void confirmAction(action.id);
    setDragCardId(null);
  }

  // ── Scuttle drag-and-release ───────────────────────────────────
  // Drag a hand card onto a specific opponent Point Row card to scuttle it.
  // A scuttle action's `sources` are the hand cards that can perform it and
  // `targets` are the opponent Point Row cards it can scuttle.
  function scuttleActionFor(cardId: string, targetCardId: string): TableAction | null {
    if (!game || blocked) return null;
    return game.actions.find(action => action.family === 'scuttle' && action.sources.includes(cardId) && action.targets.includes(targetCardId)) ?? null;
  }

  function canScuttle(cardId: string, targetCardId: string): boolean {
    return scuttleActionFor(cardId, targetCardId) !== null;
  }

  // All opponent Point Row card IDs that the dragged card can legally scuttle.
  function scuttleReadyTargetIds(cardId: string): string[] {
    if (!game || blocked) return [];
    const ids = new Set<string>();
    for (const action of game.actions) {
      if (action.family === 'scuttle' && action.sources.includes(cardId)) {
        for (const targetId of action.targets) ids.add(targetId);
      }
    }
    return [...ids];
  }

  function handleScuttleDrop(cardId: string, targetCardId: string) {
    const action = scuttleActionFor(cardId, targetCardId);
    if (!action) return;
    store.select(action.id);
    void confirmAction(action.id);
    setDragCardId(null);
    setScuttleHoverId(null);
  }

  async function confirmAction(explicitActionId?: string) {
    const actionId = explicitActionId ?? snapshot.selectedActionId;
    if (blocked || !actionId || submissionInFlight.current) {
      return;
    }
    const latest = store.getSnapshot();
    if (latest.game !== game) {
      setNotice('The table changed. Review the current action before confirming again.');
      return;
    }
    // Ensure the store has this action selected before submitting (popover/combo
    // confirm passes an explicit id without a prior selectAction call).
    if (latest.selectedActionId !== actionId) {
      store.select(actionId);
      const after = store.getSnapshot();
      if (after.selectedActionId !== actionId) {
        setNotice('The action could not be selected. The table may have changed.');
        return;
      }
    }
    submissionInFlight.current = true;
    setNotice('');
    setPopoverCardId(null);
    setComboSelection([]);
    try {
      const accepted = await store.submit();
      showToast(accepted ? 'Action submitted — resolution is determined by the authoritative session.' : 'Submission was not confirmed. Check the table before trying again.');
    } catch {
      showToast('Submission could not be confirmed. Check the table before trying again.');
    } finally {
      submissionInFlight.current = false;
    }
  }

  async function saveMatch() {
    if (!onSave || saveInFlight.current) return;
    saveInFlight.current = true;
    setSaveState('saving');
    try {
      await onSave();
      setSaveState('saved');
    } catch {
      setSaveState('failed');
    } finally {
      saveInFlight.current = false;
    }
  }

  return (
    <section className="astra-client" data-skin={skinName} data-status={game?.status ?? 'empty'} aria-label="Intrilex Astra game table">
      {game?.sessionId && <div className="astra-skip-links"><a href={`#${handId}`} onClick={event => jumpTo(event, handId)}>Skip to your hand</a><a href={`#${actionsId}`} onClick={event => jumpTo(event, actionsId)}>Skip to legal actions</a></div>}
      <p className="astra-sr-only" role="status" aria-live="polite" aria-atomic="true">{liveMessage}</p>
      <aside className="astra-sidebar" aria-label="Match info">
        <Wordmark />
        {game?.sessionId && <div className="astra-sidebar-compact" aria-label={`Turn ${game.turn}, ${formatTimestamp('elapsed', matchStartRef) ?? '0:00'}`}>
          <strong>{game.turn}</strong>
          <span>{formatTimestamp('elapsed', matchStartRef) ?? '0:00'}</span>
        </div>}
        <div className="astra-sidebar-status">
          <div className="astra-sidebar-turn"><span className="astra-eyebrow">Turn</span><strong>{game?.sessionId ? game.turn : '—'}</strong></div>
          <span className="astra-sidebar-phase">{formatLabel(game?.phase, 'Awaiting session')}</span>
          <Badge tone={game?.status === 'ready' && !readOnly ? 'cyan' : 'neutral'}>{game?.status === 'unavailable' ? 'Unavailable' : !game ? 'No session' : game.status === 'completed' ? 'Complete' : readOnly ? 'Read only' : game.status === 'ready' ? 'Decision ready' : 'View only'}</Badge>
          {settings.timestampMode !== 'off' && game?.sessionId && <span className="astra-match-timestamp" data-testid="match-timestamp">{formatTimestamp(settings.timestampMode, matchStartRef)}</span>}
        </div>
        <div className="astra-sidebar-actions">
          {railHtml ? <div className="astra-sidebar-rail" data-testid="astra-rail" dangerouslySetInnerHTML={{ __html: railHtml }} /> : <>
            <button type="button" className="astra-button astra-button--quiet astra-settings-btn" onClick={() => setSettingsOpen(true)} aria-label="Table settings" title="Table settings"><Icon name="settings" /><span>Settings</span></button>
            {onSave && <button type="button" className="astra-button astra-button--quiet" disabled={!game?.sessionId || saveState === 'saving' || submitting} onClick={() => void saveMatch()}><Icon name="save" /><span>{saveState === 'saving' ? 'Saving…' : saveState === 'failed' ? 'Retry save' : 'Save match'}</span></button>}
          </>}
        </div>
        {game?.sessionId && <div className="astra-sidebar-footer"><span><span className="astra-status-dot" aria-hidden="true" />Semantic view only</span><span>Rev {game.revision ?? '—'}<span aria-hidden="true"> / </span><span className="astra-sidebar-session">{game.sessionId}</span></span><span>No predicted outcomes</span></div>}
      </aside>
      <div className="astra-main">
      {problem && <Notice title="The table needs attention" tone="danger">{problem}</Notice>}
      {!game || !game.sessionId ? <div className="astra-no-session"><EmptyState title={problem ? 'The table is unavailable' : 'Your next table awaits'}>No active game view is available. Start or resume a match from the hub.</EmptyState></div> : <>
        {game.status === 'unavailable' && <Notice title="Game view unavailable" tone="danger">This view cannot accept actions. Any visible cards are the supplied snapshot, not proof of a current connection. Return to the hub to recover.</Notice>}
        {game.status === 'waiting' && <Notice title="Waiting for the session">The table will update when a new authorized view arrives. No waiting action is inferred or automatically submitted.</Notice>}
        {readOnly && <Notice title="Read-only table">You can inspect cards, evidence, and events. Action submission is disabled for this view.</Notice>}
        <nav className="astra-mobile-nav" aria-label="Table shortcuts"><a href={`#${handId}`} onClick={event => jumpTo(event, handId)}><Icon name="cards" />Your hand <span>{game.self.handCount}</span></a><a href={`#${actionsId}`} onClick={event => jumpTo(event, actionsId)}><Icon name="chevron" />Actions <span>{game.actions.length}</span></a></nav>
        <div className="astra-table-layout">
          <div className="astra-battlefield" onClick={e => { if (e.target === e.currentTarget) { setComboSelection([]); setPopoverCardId(null); } }}>
            <div className="astra-stage-status" id={actionsId} tabIndex={-1}><span className="astra-status-dot" aria-hidden="true" data-pulse={game.status === 'ready' && !readOnly && nonSwapActions.length > 0 ? 'true' : 'false'} /><strong>{stageStatus}</strong>{nonSwapActions.length > 0 && <Badge tone={blocked ? 'neutral' : 'cyan'}>{nonSwapActions.length} offered{swapActions.length > 0 && ` · ${swapActions.length} swap`}</Badge>}</div>
            <section className="astra-side astra-side--opponent" aria-label="Opponent side">
              <PlayerBanner player={game.opponent} opponent active={game.activePlayerId === game.opponent.id} priority={game.priorityOwnerId === game.opponent.id} hideHandBacks={Boolean(opponentHand && opponentHand.length > 0)} />
              {opponentHand && opponentHand.length > 0 && <CardLane title="Hand" owner={game.opponent.name} cards={opponentHand} selectedId={focusedCardId} onCard={focusCard} />}
              <div className="astra-side-rows"><CardLane title="Point row" owner={game.opponent.name} cards={game.opponent.points} selectedId={focusedCardId} sourceIds={selected?.sources} targetIds={selected?.targets} onCard={focusCard} dragActive={dragCardId !== null} dropCardId={scuttleHoverId} dropCardValid={scuttleHoverId !== null && dragCardId !== null && canScuttle(dragCardId, scuttleHoverId)} scuttleReadyIds={dragCardId ? scuttleReadyTargetIds(dragCardId) : []} onCardDragOver={setScuttleHoverId} onCardDragLeave={() => setScuttleHoverId(null)} onCardDrop={targetCardId => { if (dragCardId) handleScuttleDrop(dragCardId, targetCardId); }} /><CardLane title="Enduring row" owner={game.opponent.name} cards={game.opponent.enduring} selectedId={focusedCardId} sourceIds={selected?.sources} targetIds={selected?.targets} onCard={focusCard} /></div>
            </section>
            <SharedTable game={game} onCard={focusCard} selectedCardId={focusedCardId} selected={selected} onSwapCard={card => setSwapModalCardId(card.id)} />
            <section className="astra-side astra-side--self" aria-label="Your side">
              <div className="astra-side-rows"><CardLane title="Point row" owner={game.self.name} cards={game.self.points} selectedId={focusedCardId} sourceIds={selected?.sources} targetIds={selected?.targets} onCard={focusCard} dropTarget={dragCardId !== null} dropValid={dragCardId !== null && canDrop(dragCardId, 'points')} onDrop={() => dragCardId && handleDrop(dragCardId, 'points')} /><CardLane title="Enduring row" owner={game.self.name} cards={game.self.enduring} selectedId={focusedCardId} sourceIds={selected?.sources} targetIds={selected?.targets} onCard={focusCard} dropTarget={dragCardId !== null} dropValid={dragCardId !== null && canDrop(dragCardId, 'enduring')} onDrop={() => dragCardId && handleDrop(dragCardId, 'enduring')} /></div>
              <PlayerBanner player={game.self} active={game.activePlayerId === game.self.id} priority={game.priorityOwnerId === game.self.id} />
            </section>
            <section className="astra-hand" id={handId} tabIndex={-1} aria-labelledby={`${handId}-heading`}>
              <div className="astra-hand-heading"><div><span className="astra-eyebrow">Plan your next move</span><h2 id={`${handId}-heading`}>Your hand <span>{game.self.handCount}</span></h2></div><button type="button" className="astra-help-toggle" aria-label="How to play your hand" data-help><span aria-hidden="true">?</span></button><div className="astra-help-tooltip" role="tooltip"><p><strong>Click</strong> a card to see its actions. <strong>Ctrl</strong>+click multiple cards to reveal a combo (Super · Ultra · Sudden Death · Royal Marriage · more). <strong>Drag</strong> a card to your rows · drag onto an opponent's Point Row card to <strong>scuttle</strong> it · drag within the hand to <strong>rearrange</strong>. <strong>Shift</strong>+hover for full card details.<br /><strong>Nothing is played until you confirm.</strong> Press <strong>Escape</strong> or click empty space to clear a combo.</p></div></div>
              {comboSelection.length >= 2 && game && <ComboBar selection={comboSelection} cards={cards} actions={nonSwapActions} game={game} blocked={blocked} confirmBeforeSubmit={settings.confirmBeforeSubmit} onConfirm={id => void confirmAction(id)} onClear={clearCombo} onRemove={removeFromCombo} />}
              {!declineOnly && declineActions.length > 0 && <ActionToolbar actions={declineActions} blocked={blocked} confirmBeforeSubmit={settings.confirmBeforeSubmit} onConfirm={id => void confirmAction(id)} />}
              {game.self.hand.length > 0 ? (() => { const orderedHand = applyHandOrder(game.self.hand); return <ul className="astra-hand-cards" tabIndex={0} aria-label="Your visible hand cards" onDragOver={e => { if (handDragId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }} onDrop={() => { if (handDragId && handDropIndex !== null) { handleHandReorder(handDragId, handDropIndex); } setHandDragId(null); setHandDropIndex(null); }} onDragEnd={() => { setHandDragId(null); setHandDropIndex(null); setScuttleHoverId(null); }}>{orderedHand.map((card, index) => <li key={card.id} draggable={!blocked} onDragStart={e => { setDragCardId(card.id); setHandDragId(card.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', card.id); }} onDragEnd={() => { setDragCardId(null); setHandDragId(null); setHandDropIndex(null); setScuttleHoverId(null); }} onDragOver={e => { if (handDragId && handDragId !== card.id) { e.preventDefault(); setHandDropIndex(index); } }} onMouseEnter={e => { if (card.identity) { setHoveredCardId(card.id); setHoveredCardRect(e.currentTarget.getBoundingClientRect()); } }} onMouseMove={e => { if (e.shiftKey && card.identity && !fullCardId) { setFullCardId(card.id); } if (card.identity && !hoveredCardRect) { setHoveredCardRect(e.currentTarget.getBoundingClientRect()); } }} onMouseLeave={() => { setHoveredCardId(null); setHoveredCardRect(null); setCtrlHeld(false); }} className={`${dragCardId === card.id ? 'is-dragging' : ''}${handDropIndex === index && handDragId ? ' is-drop-target' : ''}${comboSelection.includes(card.id) ? ' is-combo-selected' : ''}`}><CardFace card={card} size="hand" selected={popoverCardId === card.id || comboSelection.includes(card.id)} highlighted={selected?.sources.includes(card.id)} availableCount={settings.highlightLegalCards ? game.actions.filter(action => action.sources.includes(card.id)).length : 0} onClick={e => handleHandCardClick(card, e, e.currentTarget.getBoundingClientRect())} purpose="Explore offered actions for card" /></li>)}</ul>; })() : <EmptyState title={game.self.handCount > 0 ? 'Hand identities are not visible' : 'Your hand is empty'} compact>{game.self.handCount > 0 ? 'Only the supplied hand count is shown. Hidden cards are not reconstructed.' : 'Other offered actions remain available in the action panel.'}</EmptyState>}
            </section>
          </div>
        </div>
        {debug && game && <div className="astra-debug-panel"><Evidence game={game} selected={selected} /></div>}
      </>}
      </div>
      {swapModalCard && game && <SwapModal card={swapModalCard} game={game} swapActions={swapActions} blocked={blocked || !game} onSelect={selectAction} onConfirm={() => void confirmAction()} onClose={() => setSwapModalCardId(null)} />}
      {toast && <div className="astra-toast" role="status" aria-live="polite"><Icon name="check" /><span>{toast}</span></div>}
      {chat && <ChatPanel config={chat} settings={settings} matchStartRef={matchStartRef} />}
      {settingsOpen && <SettingsPanel settings={settings} onChange={setSettings} onClose={() => setSettingsOpen(false)} />}
      {popoverCardId && popoverRect && game && comboSelection.length === 0 && (() => {
        const card = game.self.hand.find(c => c.id === popoverCardId);
        if (!card?.identity) { setPopoverCardId(null); return null; }
        const cardActions = game.actions.filter(a => a.sources.includes(card.id));
        if (cardActions.length === 0) return null;
        return <ActionPopover card={card} actions={cardActions} rect={popoverRect} blocked={blocked} game={game} cards={cards} confirmBeforeSubmit={settings.confirmBeforeSubmit} onSelect={selectAction} onConfirm={id => void confirmAction(id)} onClose={() => setPopoverCardId(null)} />;
      })()}
      {ctrlHeld && hoveredCardId && hoveredCardRect && game && !popoverCardId && comboSelection.length === 0 && (() => {
        const card = game.self.hand.find(c => c.id === hoveredCardId);
        if (!card?.identity) return null;
        const cardActions = game.actions.filter(a => a.sources.includes(card.id));
        if (cardActions.length === 0) return null;
        return <ActionPopover card={card} actions={cardActions} rect={hoveredCardRect} blocked={blocked} game={game} cards={cards} confirmBeforeSubmit={settings.confirmBeforeSubmit} onSelect={selectAction} onConfirm={id => void confirmAction(id)} onClose={() => { setHoveredCardId(null); setHoveredCardRect(null); }} />;
      })()}
      {fullCardId && game && (() => {
        const card = game.self.hand.find(c => c.id === fullCardId) ?? cards.find(c => c.id === fullCardId);
        if (!card?.identity) { setFullCardId(null); return null; }
        const cardActions = game.actions.filter(a => a.sources.includes(card.id));
        return <FullCardOverlay card={card} actions={cardActions} blocked={blocked} onSelect={selectAction} onClose={() => setFullCardId(null)} />;
      })()}
    </section>
  );
}
