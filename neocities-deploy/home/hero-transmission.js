// ═══════════════════════════════════════════════════════════════
// hero-transmission.js — Homepage HeroTransmission system
//
// The hero headline behaves like a stable tactical display whose
// message periodically reconfigures — NOT a carousel. Rotation is
// deterministic (1 → 2 → … → N → 1), ~8s dwell, and the canonical
// brand statement (STRATEGY / LIVES / BEYOND LUCK) is always
// transmission #1 and always the first frame on page load.
//
// Layout contract: the stage reserves three line-heights of the
// maximum display size and each transmission carries a --tx-w width
// estimate so long phrases fit instead of wrapping or overflowing.
// Changing text never resizes the hero, pushes the mode buttons, or
// creates scrollbars.
//
// Accessibility contract: the h1 keeps the canonical brand phrase
// for screen readers and SEO via .sr-only; the rotating visual
// stage is aria-hidden so automated changes are never announced.
// prefers-reduced-motion (and the app's reduced-motion / fx-off
// settings) swap messages instantly with no transition.
//
// Future telemetry: dynamicProvider() may return a transmission
// built from REAL stats (e.g. duels recorded, players online).
// Every HERO_TX_DYNAMIC_EVERY-th slot gives a dynamic transmission
// priority without disturbing the editorial cadence. Until a real
// data source exists the provider stays null — no fabricated stats.
//
// Purity: data, width estimation, scheduling and string builders
// are DOM-free and unit-testable. mountHeroTransmission() is the
// only DOM-touching export and honors an AbortSignal lifetime.
// ═══════════════════════════════════════════════════════════════

// Same escape semantics as state.js esc() — duplicated deliberately
// so the pure half of this module stays DOM-free and Node-testable.
const esc = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** ~8s dwell — the resting state must feel settled, not restless. */
export const HERO_TX_DWELL_MS = 8000;
/** Outgoing dim/drift phase before the incoming lines resolve. */
export const HERO_TX_OUT_MS = 220;
/** A dynamic (real-stat) transmission may claim every Nth slot. */
export const HERO_TX_DYNAMIC_EVERY = 8;

/**
 * Transmission shape:
 *   id      — stable identifier (testing + telemetry correlation)
 *   type    — 'brand' | 'editorial' | 'dynamic'
 *   lines   — 2–3 uppercase display lines (never wraps; see --tx-w)
 *   accent  — line index (or indices) rendered with the
 *             cyan → arcane → prestige gradient. Data-driven: it is
 *             NOT always the final line.
 */
export const HERO_TRANSMISSIONS = [
  { id: 'brand',        type: 'brand',     lines: ['STRATEGY', 'LIVES', 'BEYOND LUCK'],      accent: 2 },
  { id: 'consequences', type: 'editorial', lines: ['EVERY', 'CARD', 'HAS CONSEQUENCES'],     accent: 2 },
  { id: 'read-board',   type: 'editorial', lines: ['READ', 'THE', 'BOARD'],                  accent: 2 },
  { id: 'play-player',  type: 'editorial', lines: ['PLAY', 'THE', 'PLAYER'],                 accent: 2 },
  { id: 'chaos',        type: 'editorial', lines: ['CONTROL', 'THE', 'CHAOS'],               accent: 0 },
  { id: 'pressure',     type: 'editorial', lines: ['BUILD PRESSURE', 'BREAK', 'PATTERNS'],   accent: 0 },
  { id: 'luck-deals',   type: 'editorial', lines: ['LUCK DEALS', 'STRATEGY', 'DECIDES'],     accent: [1, 2] },
  { id: 'adapt',        type: 'editorial', lines: ['ADAPT', 'OR', 'COLLAPSE'],               accent: 2 },
  { id: 'duels-alike',  type: 'editorial', lines: ['NO TWO', 'DUELS', 'ALIKE'],              accent: 2 },
  { id: 'think-beyond', type: 'editorial', lines: ['THINK', 'BEYOND', 'THE HAND'],           accent: 1 },
];

// ── Width estimation (pure) ───────────────────────────────────
// Approximate em advances for Oxanium ExtraBold uppercase/digits —
// the letterforms are squarish and wide, so estimates err generous.
// A 4% safety margin is applied before emitting --tx-w so estimated
// lines never overflow the copy column.
const HERO_TX_TRACKING_EM = 0.012;
const HERO_TX_SAFETY = 1.04;
const GLYPH_EM = {
  ' ': 0.30, "'": 0.26, '\u2019': 0.26, ',': 0.30, '.': 0.30, '\u00b7': 0.30, '-': 0.42, ':': 0.32,
  I: 0.32, J: 0.50, L: 0.55, E: 0.60, F: 0.58, P: 0.62, T: 0.62, Z: 0.64, S: 0.66, Y: 0.66,
  B: 0.68, K: 0.70, R: 0.70, V: 0.70, A: 0.72, X: 0.72, D: 0.74, H: 0.76, N: 0.76, U: 0.76,
  C: 0.82, G: 0.82, M: 0.84, O: 0.84, Q: 0.84, W: 0.96,
  '0': 0.70, '1': 0.42, '2': 0.66, '3': 0.66, '4': 0.70, '5': 0.66, '6': 0.70, '7': 0.62, '8': 0.70, '9': 0.70,
  '\u2660': 0.72, '\u2665': 0.72, '\u2666': 0.72, '\u2663': 0.72,
};
const GLYPH_EM_DEFAULT = 0.72;

/**
 * Estimated em width of a transmission's longest line, including
 * letter-spacing and a small safety margin. Emitted as --tx-w so
 * CSS can scale font-size to the container (100cqw / --tx-w).
 * @param {{lines:string[]}} tx
 * @returns {number}
 */
export function transmissionEmWidth(tx) {
  let max = 0;
  for (const line of tx?.lines ?? []) {
    let em = 0;
    for (const ch of String(line)) em += GLYPH_EM[ch] ?? GLYPH_EM[ch.toUpperCase?.()] ?? GLYPH_EM_DEFAULT;
    em += Math.max(0, String(line).length - 1) * HERO_TX_TRACKING_EM;
    if (em > max) max = em;
  }
  return Math.round(max * HERO_TX_SAFETY * 100) / 100;
}

// ── Deterministic scheduling (pure) ───────────────────────────
/**
 * Plan the next slot. Editorial transmissions rotate strictly
 * 1 → 2 → … → N → 1. Every HERO_TX_DYNAMIC_EVERY-th step offers the
 * slot to a dynamic transmission first; if none is available the
 * editorial cadence continues uninterrupted. A dynamic slot does
 * NOT consume the editorial index — the canonical rhythm and the
 * guaranteed return of transmission #1 are preserved.
 *
 * @param {Object} args
 * @param {number} args.step - advances completed so far (0-based next slot = step + 1)
 * @param {number} args.editorialIndex - index of the transmission currently shown
 * @param {Array}  args.transmissions - editorial pool (canonical must be index 0)
 * @param {*}      [args.dynamic] - a resolved dynamic transmission, or null
 * @returns {{tx:Object, editorialIndex:number, dynamic:boolean}}
 */
export function planNextTransmission({ step, editorialIndex, transmissions, dynamic = null }) {
  const pool = transmissions?.length ? transmissions : HERO_TRANSMISSIONS;
  if (dynamic && (step + 1) % HERO_TX_DYNAMIC_EVERY === 0) {
    return { tx: dynamic, editorialIndex, dynamic: true };
  }
  const nextIndex = (editorialIndex + 1) % pool.length;
  return { tx: pool[nextIndex], editorialIndex: nextIndex, dynamic: false };
}

// ── Renderers (pure string builders) ──────────────────────────
/**
 * Inner line markup for a transmission. Each line carries --i for
 * staggered transition timing; accent lines get .hero-tx-accent.
 * @param {{lines:string[], accent:number|number[]}} tx
 * @returns {string} HTML
 */
export function renderHeroTransmissionLines(tx) {
  const accents = new Set(Array.isArray(tx?.accent) ? tx.accent : [tx?.accent]);
  return (tx?.lines ?? []).map((line, i) =>
    `<span class="hero-tx-line${accents.has(i) ? ' hero-tx-accent' : ''}" style="--i:${i}">${esc(line)}</span>`
  ).join('');
}

/**
 * Full stage markup — used by home-view.js for the initial paint
 * (always the canonical transmission) and by the controller for
 * structural parity when it re-renders lines in place.
 * @param {Object} tx
 * @returns {string} HTML
 */
export function renderHeroTransmissionHtml(tx) {
  return `<span class="hero-tx" data-hero-tx data-tx-id="${esc(tx?.id ?? '')}" data-tx-type="${esc(tx?.type ?? 'editorial')}" style="--tx-w:${transmissionEmWidth(tx)}" aria-hidden="true">${renderHeroTransmissionLines(tx)}</span>`;
}

// ── Controller (DOM) ──────────────────────────────────────────
/**
 * Mount the transmission cycle on a rendered homepage. The stage
 * is the [data-hero-tx] element emitted by renderHeroTransmissionHtml.
 *
 * Behavior:
 *  - deterministic rotation on a ~8s setTimeout chain (never
 *    setInterval — no catch-up bursts);
 *  - pauses while the document is hidden and resumes with a FRESH
 *    dwell on return (no rapid-fire of missed slots);
 *  - pointerdown / keydown inside the hero resets the dwell so the
 *    headline never swaps at the exact moment the user is reaching
 *    for the adjacent play CTAs;
 *  - reduced motion swaps instantly — no exit/enter animation;
 *  - signal abort (homepage re-render / navigation) clears all
 *    timers and listeners — nothing leaks.
 *
 * @param {HTMLElement} host - element containing [data-hero-tx]
 * @param {Object} [opts]
 * @param {Array}    [opts.transmissions]
 * @param {Function} [opts.dynamicProvider] - returns a transmission built
 *        from real stats, or null when no real data exists
 * @param {number}   [opts.dwellMs]
 * @param {AbortSignal} [opts.signal]
 * @returns {Function} dispose
 */
export function mountHeroTransmission(host, { transmissions = HERO_TRANSMISSIONS, dynamicProvider = null, dwellMs = HERO_TX_DWELL_MS, signal } = {}) {
  const stage = host?.querySelector?.('[data-hero-tx]');
  if (!stage || !transmissions.length) return () => {};

  const doc = stage.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
  const win = doc?.defaultView ?? (typeof window !== 'undefined' ? window : null);
  const motionMq = win?.matchMedia?.('(prefers-reduced-motion: reduce)');

  let editorialIndex = 0;
  let step = 0;
  let dwellTimer = null;
  let outTimer = null;
  let disposed = false;

  const reducedMotion = () => Boolean(
    motionMq?.matches
    || doc?.body?.classList?.contains('reduced-motion')
    || doc?.body?.classList?.contains('fx-off')
  );

  const clearTimers = () => {
    if (dwellTimer) { clearTimeout(dwellTimer); dwellTimer = null; }
    if (outTimer) { clearTimeout(outTimer); outTimer = null; }
  };

  const show = (tx) => {
    stage.style.setProperty('--tx-w', String(transmissionEmWidth(tx)));
    stage.dataset.txId = tx.id ?? '';
    stage.dataset.txType = tx.type ?? 'editorial';
    stage.innerHTML = renderHeroTransmissionLines(tx);
  };

  const schedule = () => {
    if (dwellTimer) clearTimeout(dwellTimer);
    dwellTimer = null;
    if (disposed || doc?.hidden) return;
    dwellTimer = setTimeout(advance, dwellMs);
  };

  const advance = () => {
    if (disposed || outTimer) return;
    const dynamic = dynamicProvider && (step + 1) % HERO_TX_DYNAMIC_EVERY === 0
      ? dynamicProvider()
      : null;
    const plan = planNextTransmission({ step, editorialIndex, transmissions, dynamic });
    step += 1;
    editorialIndex = plan.editorialIndex;

    // Reduced motion: clean instant swap, no reconfiguration animation.
    if (reducedMotion()) {
      show(plan.tx);
      schedule();
      return;
    }
    stage.classList.add('is-out');
    outTimer = setTimeout(() => {
      outTimer = null;
      show(plan.tx);
      stage.classList.remove('is-out');
      // Seed the pre-enter state, flush layout, then let each line
      // resolve back to rest with its per-line stagger.
      stage.classList.add('is-in');
      void stage.offsetWidth;
      stage.classList.remove('is-in');
      schedule();
    }, HERO_TX_OUT_MS);
  };

  // Tab hidden → stop everything and restore the stage to its
  // visible resting state so it never reappears mid-fade.
  const onVisibility = () => {
    if (doc?.hidden) {
      clearTimers();
      stage.classList.remove('is-out', 'is-in');
    } else {
      schedule();
    }
  };
  doc?.addEventListener?.('visibilitychange', onVisibility, { signal });

  // Meaningful interaction inside the hero (adjacent CTAs, links)
  // postpones the next swap to a fresh dwell.
  const hero = stage.closest('.home-hero') ?? host;
  // Mid-exit interactions need no re-arm: the dwell armed when the
  // exit completes is already a fresh one. Re-arming here would let
  // a stale dwellTimer fire a second advance over the transition.
  const resetDwell = () => { if (!doc?.hidden && !outTimer) schedule(); };
  hero?.addEventListener?.('pointerdown', resetDwell, { signal });
  hero?.addEventListener?.('keydown', resetDwell, { signal });

  signal?.addEventListener?.('abort', () => {
    disposed = true;
    clearTimers();
  }, { once: true });

  schedule();
  return () => {
    disposed = true;
    clearTimers();
  };
}
