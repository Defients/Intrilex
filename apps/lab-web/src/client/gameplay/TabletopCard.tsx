import type { CSSProperties } from 'react';
import type { SemanticCard } from '../game-model.js';
import { splitIdentity } from '../primitives.js';
import { useDraggableCard } from './DirectManipulation.js';

/** browserTabletop's playing-card presentation, fed only validated Intrilex identities. */
export function TabletopCard({ card, size = 'md', points = false, selected = false, highlighted = false, onClick, onDoubleClick, purpose = 'Inspect card' }: {
  card: SemanticCard; size?: 'sm' | 'md' | 'lg'; points?: boolean; selected?: boolean; highlighted?: boolean;
  onClick?: () => void; onDoubleClick?: () => void; purpose?: string;
}) {
  const drag = useDraggableCard(card);
  const face = card.identity ? splitIdentity(card.identity) : null;
  const joker = card.identity === 'RJ' || card.identity === 'BJ';
  const hidden = !face && !joker;
  const red = face?.suit === '♥' || face?.suit === '♦' || card.identity === 'RJ';
  const rank = face?.rank ?? (card.identity === 'RJ' ? 'R' : 'B');
  const glyph = face?.suit ?? '★';
  const label = hidden ? 'Face-down card' : [card.label, ...card.markers].join(', ');
  const cls = ['card', 'tabletop-card', `card-${size}`, points && 'card-pr hc-point-card', hidden && 'card-back is-concealed', red && 'card-red', joker && 'card-joker', selected && 'is-selected', highlighted && 'is-highlight is-highlighted', card.markers.includes('Tapped') && 'is-tapped'].filter(Boolean).join(' ');
  const content = hidden ? <span className="card-back-mark" aria-hidden="true" /> : points ?
    <span className="card-pr-face" aria-hidden="true"><span className="card-pr-rank">{face?.rank ?? card.identity}</span><span className="card-pr-suit">{glyph}</span></span> : <>
      <span className="card-corner" aria-hidden="true">{rank}<small>{glyph}</small></span>
      <span className="card-center" aria-hidden="true">{joker ? <span className="joker-word">{red ? 'RED' : 'BLACK'}<br />JOKER</span> : glyph}</span>
      <span className="card-corner card-corner-br" aria-hidden="true">{rank}<small>{glyph}</small></span>
    </>;
  return onClick ? <button {...drag} type="button" className={cls} aria-label={`${purpose}: ${label}`} aria-pressed={selected} onClick={onClick} onDoubleClick={onDoubleClick}>{content}</button> : <span className={cls} role="img" aria-label={label}>{content}</span>;
}

const BACK: SemanticCard = { id: 'presentation-back', identity: null, label: 'Face-down card', markers: [] };
export function HandFan({ count, small = false }: { count: number; small?: boolean }) {
  const n = Math.min(count, small ? 4 : 8);
  return <span className={`hx-fan${small ? ' hx-fan-sm' : ''}`} aria-hidden="true">{Array.from({ length: n }, (_, i) =>
    <span className="hx-fan-slot" key={i} style={{ '--r': `${n <= 1 ? 0 : -14 + i * 28 / (n - 1)}deg` } as CSSProperties}><TabletopCard card={BACK} size="sm" /></span>)}</span>;
}

export function PileTray({ back = false, top }: { back?: boolean; top?: SemanticCard | null }) {
  const face = top?.identity ? splitIdentity(top.identity) : null;
  const red = face?.suit === '♥' || face?.suit === '♦' || top?.identity === 'RJ';
  return <span className="hx-tray" aria-hidden="true"><i className="hx-tray-l1" /><i className="hx-tray-l2" /><i className="hx-tray-l3" />
    <i className={`hx-tray-face${back ? ' hx-tray-back' : !top?.identity ? ' hx-tray-back hx-tray-empty' : red ? ' is-red' : ''}`}>{!back && top?.identity && <>{face?.rank ?? top.identity}<small>{face?.suit ?? '★'}</small></>}</i></span>;
}

export function SuitText({ text }: { text: string }) {
  // One inline label owns all text; a flex-column button must never treat suit
  // fragments as separate rows. Rank+suit pairs also wrap as a single token.
  return <span className="hc-move-text">{text.split(/((?:10|[A2-9JQK])?[♣♦♥♠])/u).map((part, i) => {
    if (i % 2 === 0) return part;
    const suit = part.slice(-1);
    return <span key={i} className="hc-card-token">{part.slice(0, -1)}<span className={suit === '♦' || suit === '♥' ? 'suit-red' : 'suit-black'}>{suit}</span></span>;
  })}</span>;
}
