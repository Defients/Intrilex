import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type HTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { GameStore } from '../game-store.js';
import type { SemanticCard, SemanticGame } from '../game-model.js';
import { actionPreview, decisionBoundary } from './action-family.js';
import { actionGesture, dragDestinations, dragNeedsConfirmation, hitDragTarget, resolveDragIntent, spatialKey, type DragIntent, type GestureAdapter, type SpatialRef, type TargetGeometry } from './drag-intent.js';
import { TabletopCard } from './TabletopCard.js';

type RegisteredTarget = { ref: SpatialRef; element: HTMLElement; label: string };
export type DragSource = Readonly<{ ref: SpatialRef; label: string; card?: SemanticCard }>;
type Session = {
  source: DragSource; boundary: string; pointerId: number; element: HTMLElement;
  origin: DOMRect; startX: number; startY: number; x: number; y: number; active: boolean;
  viewportWidth: number; viewportHeight: number;
  geometries: TargetGeometry[]; eligible: Set<string>; hover: string | null; dirty: boolean;
};
type Visual = { source: DragSource; origin: DOMRect; transform: string; sourceKey: string; eligible: Set<string>; hover: string | null; returning?: boolean };
type Choice = { intent: DragIntent; label: string; x: number; y: number; confirm: boolean; origin: HTMLElement };
type Preferences = { enabled: boolean; confirm: boolean };
const SETTINGS_KEY = 'intrilex:quick-play-settings';
function loadPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    return { enabled: saved?.enabled !== false, confirm: saved?.confirm === true };
  } catch { return { enabled: true, confirm: false }; }
}
type DragContext = {
  visual: Visual | null;
  register: (target: RegisteredTarget) => () => void;
  start: (event: ReactPointerEvent<HTMLElement>, source: DragSource) => void;
  canDrag: (source: DragSource) => boolean;
  suppressClick: (event: React.MouseEvent<HTMLElement>) => void;
  preferences: Preferences;
  setPreferences: (value: Preferences) => void;
  cancel: () => void;
};
const Context = createContext<DragContext | null>(null);
function useDragContext() { return useContext(Context); }

export function DirectManipulation({ store, game, blocked, interrupted, submit, children, skin, describe = actionGesture }: {
  store: GameStore; game: SemanticGame; blocked: boolean; interrupted: boolean;
  submit: (actionId: string) => Promise<boolean>; children: ReactNode; skin?: string; describe?: GestureAdapter;
}) {
  const [preferences, setPreferences] = useState(loadPreferences);
  const [visual, setVisual] = useState<Visual | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const targets = useRef(new Map<string, RegisteredTarget>());
  const resizeObserver = useRef<ResizeObserver | null>(null);
  const session = useRef<Session | null>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const suppressed = useRef<HTMLElement | null>(null);
  const animation = useRef<Animation | null>(null);
  const submitting = useRef(false);
  const current = useRef({ store, game, blocked, interrupted, submit, preferences, describe });
  current.current = { store, game, blocked, interrupted, submit, preferences, describe };
  const choiceRef = useRef(choice); choiceRef.current = choice;
  const boundary = decisionBoundary(game);
  const available = useMemo(() => new Set(game.status === 'ready' ? game.actions.flatMap(action => {
    const hint = describe(game, action); return hint.destinations.length ? hint.sources.map(spatialKey) : [];
  }) : []), [game, describe]);

  function release(active: Session) {
    if (active.element.hasPointerCapture(active.pointerId)) active.element.releasePointerCapture(active.pointerId);
  }
  function clear(returnToOrigin = false) {
    const active = session.current;
    session.current = null;
    cancelAnimationFrame(frame.current); frame.current = 0;
    animation.current?.cancel(); animation.current = null;
    if (active) release(active);
    setChoice(null);
    if (returnToOrigin && active?.active && overlay.current && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisual(value => value ? { ...value, eligible: new Set(), hover: null, returning: true } : null);
      const node = overlay.current;
      const from = node.style.transform;
      const motion = node.animate([{ transform: from }, { transform: `translate3d(${active.origin.left}px,${active.origin.top}px,0)` }], { duration: 140, easing: 'ease-out', fill: 'forwards' });
      animation.current = motion;
      void motion.finished.then(() => { if (animation.current === motion) { animation.current = null; setVisual(null); } }).catch(() => {});
    } else setVisual(null);
  }
  function cancel() { clear(true); setAnnouncement('Gesture canceled. No action played.'); }

  // Invalidation also runs before paint: stale highlights must never survive a frame change.
  useLayoutEffect(() => {
    if ((session.current && session.current.boundary !== boundary) || (choiceRef.current && choiceRef.current.intent.boundary !== boundary) || blocked || interrupted || !preferences.enabled || game.status !== 'ready') clear();
  }, [boundary, game, blocked, interrupted, preferences.enabled]);
  useLayoutEffect(() => { clear(); }, [game.activePlayerId, game.priorityOwnerId, game.actions]);
  useEffect(() => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(preferences)); } catch { /* Private browsing may deny storage. */ } }, [preferences]);
  useLayoutEffect(() => {
    if (!choice) return;
    // Pointerup's compatibility click may restore source focus. Focus after that event finishes.
    const focusFrame = requestAnimationFrame(() => panel.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(focusFrame);
  }, [choice]);

  useEffect(() => {
    function geometry(active: Session) {
      active.geometries = [...targets.current].filter(([key, target]) => active.eligible.has(key) && target.element.isConnected).map(([key, target]) => {
        const rect = target.element.getBoundingClientRect();
        return { key, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      });
      active.dirty = false;
    }
    function paint() {
      frame.current = 0;
      const active = session.current;
      if (!active?.active) return;
      if (!active.element.isConnected || active.viewportWidth !== innerWidth || active.viewportHeight !== innerHeight || current.current.blocked || current.current.interrupted || decisionBoundary(current.current.store.getSnapshot().game) !== active.boundary) { clear(); return; }
      if (active.dirty) geometry(active);
      const inside = active.x >= 0 && active.y >= 0 && active.x <= innerWidth && active.y <= innerHeight;
      const hover = inside ? hitDragTarget(active.geometries, active.x, active.y) : null;
      let x = active.x - (active.startX - active.origin.left), y = active.y - (active.startY - active.origin.top);
      const destination = hover && targets.current.get(hover);
      if (destination) {
        const preview = destination.element.querySelector<HTMLElement>('[data-drag-preview]') ?? destination.element;
        const rect = preview.getBoundingClientRect();
        const dx = rect.left + rect.width / 2 - (x + active.origin.width / 2), dy = rect.top + rect.height / 2 - (y + active.origin.height / 2);
        const distance = Math.hypot(dx, dy);
        if (distance) { x += dx / distance * Math.min(12, distance * .12); y += dy / distance * Math.min(12, distance * .12); }
      }
      if (overlay.current) overlay.current.style.transform = `translate3d(${x}px,${y}px,0)`;
      if (hover !== active.hover) {
        active.hover = hover;
        setVisual(value => value ? { ...value, hover } : value);
        setAnnouncement(destination ? `${active.source.label} → ${destination.label}` : 'Move toward a highlighted destination.');
      }
    }
    function move(event: PointerEvent) {
      const active = session.current;
      if (!active || event.pointerId !== active.pointerId) return;
      active.x = event.clientX; active.y = event.clientY;
      if (!active.active) {
        if (Math.hypot(active.x - active.startX, active.y - active.startY) < 6) return;
        active.active = true;
        suppressed.current = active.element;
        active.element.setPointerCapture(active.pointerId);
        geometry(active);
        setVisual({ source: active.source, origin: active.origin, transform: `translate3d(${active.origin.left}px,${active.origin.top}px,0)`, sourceKey: spatialKey(active.source.ref), eligible: active.eligible, hover: null });
        setAnnouncement(`Dragging ${active.source.label}. Legal destinations highlighted.`);
      }
      event.preventDefault();
      if (!frame.current) frame.current = requestAnimationFrame(paint);
    }
    function up(event: PointerEvent) {
      const active = session.current;
      if (!active || event.pointerId !== active.pointerId) return;
      if (!active.active) { clear(); return; }
      active.x = event.clientX; active.y = event.clientY; active.dirty = true;
      cancelAnimationFrame(frame.current); paint();
      if (session.current !== active) return;
      const target = active.hover && targets.current.get(active.hover);
      const live = current.current.store.getSnapshot();
      if (!target || current.current.blocked || current.current.interrupted || live.interaction === 'submitting') { cancel(); return; }
      const intent: DragIntent = { boundary: active.boundary, source: active.source.ref, destination: target.ref };
      const result = resolveDragIntent(live.game, intent, current.current.describe);
      if (result.status === 'invalid') { cancel(); return; }
      const rect = target.element.getBoundingClientRect();
      const context: Choice = { intent, label: `${active.source.label} → ${target.label}`, x: rect.left, y: rect.bottom, origin: active.element,
        confirm: result.status === 'single-action' && (current.current.preferences.confirm || dragNeedsConfirmation(live.game, result.actions[0])) };
      session.current = null; release(active);
      if (result.status === 'ambiguous' || context.confirm) {
        setChoice(context);
        setAnnouncement(result.status === 'ambiguous' ? 'Choose the intended legal action.' : 'Confirm this legal action.');
      } else {
        setVisual(null);
        void execute(context, result.actions[0].id);
      }
    }
    function interruptedPointer(event: PointerEvent) { if (session.current?.pointerId === event.pointerId) cancel(); }
    function blur() { clear(); }
    function visibility() { if (document.hidden) clear(); }
    function resize() { clear(); }
    function scroll() { if (session.current) session.current.dirty = true; }
    function key(event: KeyboardEvent) {
      if (event.key === 'Escape' && (session.current || choiceRef.current)) { event.preventDefault(); cancel(); }
    }
    function interruptOtherControl(event: PointerEvent) {
      const panelNode = panel.current;
      if (choiceRef.current && !panelNode?.contains(event.target as Node)) clear();
    }
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', interruptedPointer);
    window.addEventListener('lostpointercapture', interruptedPointer);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('keydown', key);
    window.addEventListener('pointerdown', interruptOtherControl, true);
    const observer = new ResizeObserver(scroll);
    resizeObserver.current = observer;
    for (const target of targets.current.values()) observer.observe(target.element);
    return () => {
      const active = session.current; session.current = null; if (active) release(active);
      cancelAnimationFrame(frame.current); animation.current?.cancel(); observer.disconnect(); resizeObserver.current = null;
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', interruptedPointer); window.removeEventListener('lostpointercapture', interruptedPointer);
      window.removeEventListener('blur', blur); window.removeEventListener('resize', resize); window.removeEventListener('scroll', scroll, true);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('keydown', key); window.removeEventListener('pointerdown', interruptOtherControl, true);
    };
  }, []);

  async function execute(context: Choice, actionId: string) {
    if (submitting.current || current.current.blocked || current.current.interrupted) return;
    const live = current.current.store.getSnapshot();
    const result = resolveDragIntent(live.game, context.intent, current.current.describe);
    if (live.interaction === 'submitting' || !result.actions.some(action => action.id === actionId)) { clear(); return; }
    submitting.current = true;
    clear();
    try {
      const accepted = await current.current.submit(actionId);
      setAnnouncement(accepted ? 'Action played.' : decisionBoundary(current.current.store.getSnapshot().game) !== context.intent.boundary ? 'Game state updated.' : 'Review the current game state and available actions.');
    } finally { submitting.current = false; if (context.origin.isConnected) context.origin.focus({ preventScroll: true }); }
  }
  const value: DragContext = {
    visual, preferences, setPreferences, cancel,
    register(target) {
      const key = spatialKey(target.ref); targets.current.set(key, target);
      resizeObserver.current?.observe(target.element);
      if (session.current) session.current.dirty = true;
      return () => {
        if (targets.current.get(key) === target) targets.current.delete(key);
        resizeObserver.current?.unobserve(target.element);
        if (session.current?.hover === key || spatialKey(choiceRef.current?.intent.destination ?? { kind: 'zone', id: '' }) === key) clear();
        else if (session.current) session.current.dirty = true;
      };
    },
    canDrag: source => preferences.enabled && !blocked && !interrupted && (!source.card || Boolean(source.card.identity)) && available.has(spatialKey(source.ref)),
    start(event, source) {
      // Touch keeps native page/hand scrolling. Mouse, trackpad and pen share Pointer Events.
      if (event.pointerType === 'touch' || event.button !== 0 || !event.isPrimary || session.current || submitting.current || !value.canDrag(source)) return;
      clear(); suppressed.current = null;
      const live = store.getSnapshot();
      if (live.interaction === 'submitting') return;
      const eligible = new Set(dragDestinations(live.game, source.ref, describe).map(spatialKey));
      if (!eligible.size) return;
      session.current = { source, boundary: decisionBoundary(live.game), pointerId: event.pointerId, element: event.currentTarget,
        origin: event.currentTarget.getBoundingClientRect(), startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
        viewportWidth: innerWidth, viewportHeight: innerHeight,
        active: false, geometries: [], eligible, hover: null, dirty: true };
    },
    suppressClick(event) {
      if (event.detail > 0 && suppressed.current === event.currentTarget) { event.preventDefault(); event.stopPropagation(); suppressed.current = null; }
    },
  };
  const choices = choice ? resolveDragIntent(game, choice.intent, describe).actions : [];
  const choiceTop = choice ? Math.max(8, Math.min(choice.y + 8, innerHeight - 240)) : 8;
  return <Context.Provider value={value}>{children}
    <span className="hc-gesture-announcement" role="status" aria-live="polite">{announcement}</span>
    {visual && createPortal(<div className="astra-client hc-game hc-drag-portal" data-skin={skin} aria-hidden="true"><div ref={overlay} className="hc-drag-overlay" data-testid="drag-overlay"
      style={{ width: visual.origin.width, height: visual.origin.height, transform: visual.transform }}>
      {visual.source.card ? <TabletopCard card={visual.source.card} size="md" /> : <span className="hc-drag-token">{visual.source.label}</span>}</div></div>, document.body)}
    {choice && choices.length > 0 && createPortal(<div className="astra-client hc-game hc-drag-portal" data-skin={skin}><div ref={panel} className="hc-drag-chooser" role="dialog" aria-modal="false" aria-label={choice.label} data-testid="drag-chooser"
      style={{ left: Math.max(8, Math.min(choice.x, innerWidth - 288)), top: choiceTop, maxHeight: Math.max(80, innerHeight - choiceTop - 8) }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); cancel(); if (choice.origin.isConnected) choice.origin.focus(); }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
        }
      }}>
      <strong>{choice.label}</strong>{choices.map(action => <button type="button" key={action.id} onClick={() => void execute(choice, action.id)}>{choice.confirm ? 'Confirm · ' : ''}{actionPreview(game, action)}</button>)}
      <button type="button" onClick={() => { cancel(); if (choice.origin.isConnected) choice.origin.focus(); }}>Cancel</button>
    </div></div>, document.body)}
  </Context.Provider>;
}

export function GestureSettings() {
  const drag = useDragContext();
  return drag ? <details className="hc-gesture-settings"><summary>Gestures</summary><div>
    <label><input type="checkbox" checked={drag.preferences.enabled} onChange={event => drag.setPreferences({ ...drag.preferences, enabled: event.target.checked })} />Quick Play Gestures</label>
    <label><input type="checkbox" checked={drag.preferences.confirm} onChange={event => drag.setPreferences({ ...drag.preferences, confirm: event.target.checked })} />Confirm Obvious Drag Plays</label>
    <small>Drag with a mouse or pen. Click and keyboard controls remain available.</small>
  </div></details> : null;
}

export function useDraggableSource(source: DragSource) {
  const drag = useDragContext();
  const enabled = Boolean(drag?.canDrag(source));
  return {
    'data-drag-source': enabled ? source.ref.id : undefined,
    'data-dragging': drag?.visual?.sourceKey === spatialKey(source.ref) || undefined,
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => { if (enabled) drag?.start(event, source); },
    onClickCapture: (event: React.MouseEvent<HTMLElement>) => drag?.suppressClick(event),
    onDoubleClickCapture: (event: React.MouseEvent<HTMLElement>) => { if (drag?.visual) { event.preventDefault(); event.stopPropagation(); } },
    onDragStart: (event: React.DragEvent<HTMLElement>) => { if (enabled) event.preventDefault(); },
  };
}
export function useDraggableCard(card: SemanticCard) { return useDraggableSource({ ref: { kind: 'card', id: card.id }, card, label: card.label }); }

export function DragTarget({ destination, label, as: Tag = 'div', children, className = '', ...props }: HTMLAttributes<HTMLElement> & {
  destination: SpatialRef; label: string; as?: 'div' | 'section' | 'span'; children: ReactNode;
}) {
  const drag = useDragContext();
  const element = useRef<HTMLElement>(null);
  const key = spatialKey(destination);
  // Registration depends on semantic identity, not each hover render's callback identity.
  const register = useRef(drag?.register); register.current = drag?.register;
  useLayoutEffect(() => { if (element.current) return register.current?.({ ref: destination, label, element: element.current }); }, [key, label]);
  const eligible = Boolean(drag?.visual?.eligible.has(key));
  const hovered = drag?.visual?.hover === key;
  return <Tag {...props} ref={element as React.Ref<HTMLDivElement & HTMLElement>} className={`${className} hc-drag-target`} data-drop-id={destination.id} data-drop-kind={destination.kind}
    data-drop-state={hovered ? 'hovered' : eligible ? 'eligible' : undefined}>{children}</Tag>;
}

export function DragPreview({ destination }: { destination: SpatialRef }) {
  const drag = useDragContext();
  return drag?.visual?.hover === spatialKey(destination) ? <span className="hc-drag-ghost" data-drag-preview data-testid="drag-preview" aria-hidden="true">{drag.visual.source.card ? <TabletopCard card={drag.visual.source.card} size="sm" /> : <span className="hc-drag-token">{drag.visual.source.label}</span>}</span> : null;
}
