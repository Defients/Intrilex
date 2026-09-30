import { useState, type CSSProperties, type ReactNode } from 'react';
import { getCardArt } from '../card-art-registry.js';
import { getCardDefinition, getSuit } from '../card-face-data.js';
import type { GameStore } from './game-store.js';

export type TableGame = NonNullable<ReturnType<GameStore['getSnapshot']>['game']>;
export type TableCard = TableGame['self']['hand'][number];
export type TablePlayer = TableGame['self'];
export type TableEvent = TableGame['events'][number];

export type IconName = 'arrow' | 'cards' | 'chat' | 'check' | 'chevron' | 'close' | 'eye' | 'layers' | 'lock' | 'save' | 'settings' | 'shield';

const iconPaths: Record<IconName, string> = {
  arrow: 'M19 12H5m6-6-6 6 6 6',
  cards: 'M7 4h12v15H7zM4 7v14h12',
  chat: 'M4 5h16v11H8l-4 4V5Zm4 4h8m-8 3h5',
  check: 'm5 12 4 4L19 6',
  chevron: 'm9 5 7 7-7 7',
  close: 'm6 6 12 12M6 18 18 6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  layers: 'm12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5',
  lock: 'M7 10V8a5 5 0 0 1 10 0v2M5 10h14v10H5z',
  save: 'M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-8h10v8',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.13-1.4l2-1.5-2-3.5-2.4 1a7.4 7.4 0 0 0-2.4-1.4L14 2h-4l-.47 2.8a7.4 7.4 0 0 0-2.4 1.4l-2.4-1-2 3.5 2 1.5a7.4 7.4 0 0 0 0 2.8l-2 1.5 2 3.5 2.4-1a7.4 7.4 0 0 0 2.4 1.4L10 22h4l.47-2.8a7.4 7.4 0 0 0 2.4-1.4l2.4 1 2-3.5-2-1.5c.09-.46.13-.93.13-1.4Z',
  shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6',
};

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg className={`astra-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={iconPaths[name]} />
    </svg>
  );
}

export function Wordmark() {
  return (
    <div className="astra-wordmark">
      <svg viewBox="0 0 40 44" fill="none" aria-hidden="true" focusable="false">
        <path d="M20 2 37 12v20L20 42 3 32V12L20 2Z" stroke="currentColor" />
        <path d="m20 10 10 23H10l10-23Zm0 9-5 11h10l-5-11Z" fill="currentColor" fillRule="evenodd" />
        <path d="M8 15h7m10 0h7M20 34v5" stroke="currentColor" />
      </svg>
      <span><strong>INTRILEX</strong><small>Astra table</small></span>
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'cyan' | 'amber' | 'danger' }) {
  return <span className={`astra-badge astra-badge--${tone}`}>{children}</span>;
}

export function EmptyState({ title, children, compact = false }: { title: string; children?: ReactNode; compact?: boolean }) {
  return (
    <div className={`astra-empty${compact ? ' astra-empty--compact' : ''}`}>
      <span className="astra-empty-mark" aria-hidden="true"><Icon name="cards" /></span>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function formatLabel(value: string | null | undefined, fallback = 'Not reported') {
  if (!value?.trim()) return fallback;
  return value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function cardPresentation(card: TableCard) {
  const identity = card.identity?.trim() ?? '';
  const known = /^(?:(?:10|[A2-9JQK])[♣♦♥♠]|RJ|BJ)$/u.test(identity);
  const definition = known ? getCardDefinition(identity) : null;
  const suit = definition ? getSuit(definition.suit ?? '') : null;
  let art: ReturnType<typeof getCardArt> | null = null;
  if (known) {
    try {
      art = getCardArt(identity);
    } catch {
      art = null;
    }
  }
  const displayName = card.label && card.label !== identity ? card.label : art?.alt.replace(/ artwork$/, '') || card.label || 'Unidentified card';
  return { identity, definition, suit, art, displayName };
}

// Split a known identity (e.g. "A♠", "10♣") into its rank prefix and trailing
// suit glyph. Returns null for identities without a suit glyph (Jokers, unknown).
const SUIT_GLYPHS = new Set(['♣', '♦', '♥', '♠']);
export function splitIdentity(identity: string): { rank: string; suit: string } | null {
  if (!identity) return null;
  const last = identity[identity.length - 1];
  if (!SUIT_GLYPHS.has(last)) return null;
  return { rank: identity.slice(0, -1), suit: last };
}

export function CardFace({ card, size = 'row', selected = false, highlighted = false, availableCount, onClick, purpose = 'Inspect', disabled = false, scuttleReady = false, scuttleTarget = false, scuttleInvalid = false }: {
  card: TableCard;
  size?: 'row' | 'hand' | 'small';
  selected?: boolean;
  highlighted?: boolean;
  availableCount?: number;
  onClick?: () => void;
  purpose?: string;
  disabled?: boolean;
  scuttleReady?: boolean;
  scuttleTarget?: boolean;
  scuttleInvalid?: boolean;
}) {
  const { identity, definition, suit, art, displayName } = cardPresentation(card);
  const [failedArt, setFailedArt] = useState<string | null>(null);
  const style = {
    '--astra-card-accent': suit?.accent ?? '#a0b8c4',
    '--astra-art-position': art ? `${art.boardPosition.x * 100}% ${art.boardPosition.y * 100}%` : '50% 50%',
  } as CSSProperties;
  const className = `astra-card astra-card--${size}${selected ? ' is-selected' : ''}${highlighted ? ' is-highlighted' : ''}${!identity ? ' is-concealed' : ''}${scuttleReady ? ' is-scuttle-ready' : ''}${scuttleTarget ? ' is-scuttle-target' : ''}${scuttleInvalid ? ' is-scuttle-invalid' : ''}`;
  const accessibleLabel = [displayName, identity && identity !== displayName ? identity : '', ...card.markers, availableCount !== undefined ? `${availableCount} offered actions` : ''].filter(Boolean).join('. ');
  const identityParts = identity ? splitIdentity(identity) : null;
  const identityNode = identityParts
    ? <>{identityParts.rank}<span className="astra-card-suit" data-suit={identityParts.suit}>{identityParts.suit}</span></>
    : (identity || '?');
  const content = (
    <>
      <span className="astra-card-art" aria-hidden="true">
        {art && failedArt !== art.board ? <img src={art.board} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailedArt(art.board)} /> : <span className="astra-card-sigil"><Icon name={identity ? 'shield' : 'cards'} /></span>}
      </span>
      <span className="astra-card-top"><strong>{identityNode}</strong>{selected && <Icon name="check" />}</span>
      <span className="astra-card-copy">
        <strong>{displayName}</strong>
        {size === 'hand' && <span className="astra-card-subtitle">{definition?.subtitle ?? (identity ? 'Reference unavailable' : 'Identity not visible')}</span>}
        {card.markers.length > 0 && <span className="astra-card-markers">{card.markers.map((marker, index) => <span key={`${marker}-${index}`}>{formatLabel(marker)}</span>)}</span>}
        {availableCount !== undefined && <span className="astra-card-availability">{availableCount > 0 ? `${availableCount} ${availableCount === 1 ? 'action' : 'actions'} offered` : 'No actions offered'}</span>}
      </span>
    </>
  );
  return onClick ? (
    <button type="button" className={className} style={style} onClick={onClick} disabled={disabled} aria-pressed={selected} aria-label={`${purpose}: ${accessibleLabel}`}>
      {content}
    </button>
  ) : (
    <div className={className} style={style} role="group" aria-label={accessibleLabel}>{content}</div>
  );
}

export function CardLane({ title, owner, cards, selectedId, sourceIds = [], targetIds = [], onCard, dropTarget = false, dropValid = false, onDrop, dragActive = false, dropCardId = null, dropCardValid = false, scuttleReadyIds = [], onCardDragOver, onCardDragLeave, onCardDrop }: {
  title: string;
  owner: string;
  cards: readonly TableCard[];
  selectedId?: string | null;
  sourceIds?: readonly string[];
  targetIds?: readonly string[];
  onCard: (card: TableCard) => void;
  dropTarget?: boolean;
  dropValid?: boolean;
  onDrop?: () => void;
  dragActive?: boolean;
  dropCardId?: string | null;
  dropCardValid?: boolean;
  scuttleReadyIds?: readonly string[];
  onCardDragOver?: (cardId: string) => void;
  onCardDragLeave?: () => void;
  onCardDrop?: (cardId: string) => void;
}) {
  const cardDropEnabled = dragActive && Boolean(onCardDragOver);
  return (
    <section
      className={`astra-lane${dropTarget ? (dropValid ? ' is-drop-target' : ' is-drop-invalid') : ''}${dragActive && scuttleReadyIds.length > 0 ? ' is-scuttle-zone' : ''}`}
      aria-label={`${owner}: ${title}`}
      onDragOver={dropTarget ? (e => { e.preventDefault(); e.dataTransfer.dropEffect = dropValid ? 'move' : 'none'; }) : undefined}
      onDrop={dropTarget && dropValid && onDrop ? (e => { e.preventDefault(); onDrop(); }) : undefined}
    >
      <div className="astra-lane-heading"><h3>{title}</h3><span>{cards.length}</span></div>
      {cards.length > 0 ? (
        <ul className="astra-card-row" aria-label={`${title} cards`} tabIndex={0}>
          {cards.map(card => {
            const isHovered = dropCardId === card.id;
            return <li key={card.id}
              onDragOver={cardDropEnabled ? (e => { e.preventDefault(); e.dataTransfer.dropEffect = dropCardValid ? 'move' : 'none'; onCardDragOver!(card.id); }) : undefined}
              onDragLeave={cardDropEnabled && isHovered && onCardDragLeave ? () => onCardDragLeave() : undefined}
              onDrop={cardDropEnabled && onCardDrop ? (e => { e.preventDefault(); onCardDrop(card.id); }) : undefined}
            ><CardFace card={card} selected={selectedId === card.id} highlighted={sourceIds.includes(card.id) || targetIds.includes(card.id)} onClick={() => onCard(card)} purpose="View card reference" scuttleReady={dragActive && scuttleReadyIds.includes(card.id) && !isHovered} scuttleTarget={isHovered && dropCardValid} scuttleInvalid={isHovered && !dropCardValid} /></li>;
          })}
        </ul>
      ) : <div className="astra-lane-empty"><span aria-hidden="true" />No cards in this row</div>}
    </section>
  );
}

export function PlayerBanner({ player, opponent = false, active = false, priority = false }: {
  player: TablePlayer;
  opponent?: boolean;
  active?: boolean;
  priority?: boolean;
}) {
  const progressMax = Number.isFinite(player.goal) && player.goal > 0 ? player.goal : 1;
  const progressValue = Math.max(0, Math.min(progressMax, Number.isFinite(player.score) ? player.score : 0));
  return (
    <header className={`astra-player${opponent ? ' astra-player--opponent' : ''}`}>
      <div className="astra-player-avatar" aria-hidden="true">{player.name.trim().slice(0, 2).toUpperCase() || (opponent ? 'OP' : 'YO')}</div>
      <div className="astra-player-identity">
        <span className="astra-eyebrow">{opponent ? 'Opponent' : 'Your side'}{active && ' / Active turn'}</span>
        <h2>{player.name || (opponent ? 'Opponent' : 'You')}</h2>
      </div>
      <div className="astra-player-presence">
        {priority && <Badge tone="cyan">Priority</Badge>}
        {opponent && <span className="astra-hand-backs" aria-hidden="true">{Array.from({ length: Math.min(7, Math.max(0, player.handCount)) }, (_, index) => <i key={index} />)}</span>}
      </div>
      <div className="astra-score">
        <span className="astra-score-label">Secured points</span>
        <span className="astra-score-value"><strong>{player.score}</strong><span>/ {player.goal}</span></span>
        <progress value={progressValue} max={progressMax} aria-label={`${player.name || (opponent ? 'Opponent' : 'Your')} secured points: ${player.score}, goal: ${player.goal}`} />
      </div>
    </header>
  );
}

export function CardReference({ card, onInspect }: { card: TableCard | null; onInspect?: (cardId: string) => void }) {
  if (!card) return <EmptyState title="Choose a card" compact>Select any visible card to read its reference. Selecting a card never plays it.</EmptyState>;
  const { definition, displayName } = cardPresentation(card);
  return (
    <div className="astra-reference">
      <div className="astra-reference-header">
        <CardFace card={card} size="small" />
        <div><h3>{displayName}</h3><p>{definition?.subtitle ?? 'No printed reference available.'}</p>{onInspect && <button type="button" className="astra-button astra-button--quiet" onClick={() => onInspect(card.id)}><Icon name="eye" />Full inspector</button>}</div>
      </div>
      {card.markers.length > 0 && <p><strong>Current markers: </strong>{card.markers.map(marker => formatLabel(marker)).join(', ')}</p>}
      {definition && <>
        <p className="astra-reference-disclaimer">Printed reference only. It does not establish legality or predict resolution.</p>
        <ul className="astra-ability-list">
          {definition.abilities.map(ability => <li key={ability.id}><strong>{ability.title}</strong><span>{ability.timing}</span><p>{ability.summary}</p></li>)}
        </ul>
      </>}
    </div>
  );
}
