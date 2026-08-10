// ═══════════════════════════════════════════════════════════════════════════
// card-art-registry.js — Canonical Card Art Registry (single source of truth)
//
// Every card identity resolves to its artwork through this module. No renderer
// or component should hard-code art paths or perform string-concatenation
// guesswork. All 54 exact card identities (52 suited + 2 Jokers) are mapped.
//
// Internal identity format (from card-face-data.js / engine):
//   Suited: [rank][suit]   rank ∈ {A,2,3,4,5,6,7,8,9,10,J,Q,K}  suit ∈ {♣,♦,♥,♠}
//   Jokers: RJ (Red Joker), BJ (Black Joker)
//
// Art code format (canonical filename stem):
//   Suited: [rankLower][suitFirstLetter]  →  as, 2s, 10d, qc, kh …
//   Jokers: rj, bj
//
// Joker mapping decision:
//   joker1.png → rj.webp  (Red Joker, internal identity RJ)
//   joker2.png → bj.webp  (Black Joker, internal identity BJ)
//   Rationale: RJ is listed first in the registry and joker1 is the first
//   supplied Joker file; the natural ordinal mapping preserves a stable,
//   deterministic 1→RJ / 2→BJ correspondence. Gameplay behavior is unchanged.
//
// Asset architecture decision:
//   The renderer is portrait-only (background-image with cover sizing on a
//   portrait viewport). No landscape Hero pipeline is created — an unused Hero
//   asset set would only add dead weight. Board assets are 720×1000 WebP.
// ═══════════════════════════════════════════════════════════════════════════

const SUIT_CODE = { '♣': 'c', '♦': 'd', '♥': 'h', '♠': 's' };
const SUIT_NAME = { '♣': 'Clubs', '♦': 'Diamonds', '♥': 'Hearts', '♠': 'Spades' };
const RANK_NAME = {
  A: 'Ace', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven',
  8: 'Eight', 9: 'Nine', 10: 'Ten', J: 'Jack', Q: 'Queen', K: 'King',
};
const RANK_CODE = {
  A: 'a', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8',
  9: '9', 10: '10', J: 'j', Q: 'q', K: 'k',
};

const BOARD_DIR = 'assets/card-art';
const DEFAULT_FOCAL = Object.freeze({ x: 0.5, y: 0.5 });

/**
 * Convert an internal card identity into its canonical artwork code.
 *
 *   'A♠'  → 'as'
 *   '10♦' → '10d'
 *   'Q♣'  → 'qc'
 *   'K♥'  → 'kh'
 *   'RJ'  → 'rj'
 *   'BJ'  → 'bj'
 *
 * Throws for unknown identities rather than returning a guess, so missing
 * mappings fail visibly during development instead of silently misrendering.
 * @param {string} identity - Internal card identity (e.g. 'K♠', '10♣', 'RJ')
 * @returns {string} Art code (e.g. 'ks', '10c', 'rj')
 */
export function getCardArtCode(identity) {
  const value = String(identity ?? '').trim();
  if (value === 'RJ') return 'rj';
  if (value === 'BJ') return 'bj';
  const match = value.match(/^(10|[A2-9JQK])([♣♦♥♠])$/u);
  if (!match) {
    throw new Error(`getCardArtCode: unresolved card identity "${identity}"`);
  }
  const rankCode = RANK_CODE[match[1]];
  const suitCode = SUIT_CODE[match[2]];
  if (!rankCode || !suitCode) {
    throw new Error(`getCardArtCode: unresolved card identity "${identity}"`);
  }
  return `${rankCode}${suitCode}`;
}

/**
 * Human-readable alt text for a card's artwork.
 * @param {string} identity - Internal card identity
 * @returns {string} e.g. "Ace of Spades artwork", "Black Joker artwork"
 */
export function getCardArtAlt(identity) {
  const value = String(identity ?? '').trim();
  if (value === 'RJ') return 'Red Joker artwork';
  if (value === 'BJ') return 'Black Joker artwork';
  const match = value.match(/^(10|[A2-9JQK])([♣♦♥♠])$/u);
  if (!match) return `${value} artwork`;
  return `${RANK_NAME[match[1]] ?? match[1]} of ${SUIT_NAME[match[2]] ?? match[2]} artwork`;
}

/**
 * Build a single canonical art entry for a suited card identity.
 * Focal positions default to centered {0.5, 0.5}; per-card overrides may be
 * supplied via the FOCAL_OVERRIDES map below when a card's subject demands it.
 */
function suitedEntry(identity, focalOverride) {
  const code = getCardArtCode(identity);
  return {
    code,
    identity,
    board: `${BOARD_DIR}/${code}.webp`,
    boardPosition: focalOverride ?? DEFAULT_FOCAL,
    alt: getCardArtAlt(identity),
    revision: 1,
  };
}

// Per-card focal-position overrides. Empty by default — the source artwork is
// composed with centered subjects, so the default 0.5/0.5 focal is correct for
// every card. Add an override here only if a future artwork revision places its
// primary subject off-center and a centered crop would hide it.
const FOCAL_OVERRIDES = {};

const SUITS = ['♣', '♦', '♥', '♠'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const CARD_ART = Object.fromEntries([
  ...RANKS.flatMap(rank => SUITS.map(suit => {
    const identity = `${rank}${suit}`;
    return [identity, suitedEntry(identity, FOCAL_OVERRIDES[identity])];
  })),
  ['RJ', { code: 'rj', identity: 'RJ', board: `${BOARD_DIR}/rj.webp`, boardPosition: DEFAULT_FOCAL, alt: 'Red Joker artwork', revision: 1 }],
  ['BJ', { code: 'bj', identity: 'BJ', board: `${BOARD_DIR}/bj.webp`, boardPosition: DEFAULT_FOCAL, alt: 'Black Joker artwork', revision: 1 }],
]);

Object.freeze(CARD_ART);

/**
 * Resolve the canonical art entry for a card identity.
 * @param {string} identity - Internal card identity
 * @returns {{ code:string, identity:string, board:string, boardPosition:{x:number,y:number}, alt:string, revision:number }}
 */
export function getCardArt(identity) {
  const entry = CARD_ART[String(identity)];
  if (!entry) {
    throw new Error(`getCardArt: unmapped card identity "${identity}"`);
  }
  return entry;
}

/**
 * Resolve the board WebP path for a card identity (the value used by the
 * card-face-data.js `art` field and every renderer surface).
 * @param {string} identity
 * @returns {string} e.g. 'assets/card-art/ks.webp'
 */
export function getCardArtBoardPath(identity) {
  return getCardArt(identity).board;
}

/**
 * Resolve the CSS background-position value for a card's board focal point.
 * @param {string} identity
 * @returns {string} e.g. '50% 50%'
 */
export function getCardArtBoardPosition(identity) {
  const { x, y } = getCardArt(identity).boardPosition;
  return `${Math.round(x * 100)}% ${Math.round(y * 100)}%`;
}

/**
 * List all 54 canonical art entries (sorted by identity).
 * @returns {Array}
 */
export function listCardArtEntries() {
  return Object.values(CARD_ART).sort((a, b) => a.identity.localeCompare(b.identity));
}

export const CARD_ART_REGISTRY_META = Object.freeze({
  version: '1.0.0',
  exactCards: 54,
  boardSize: { width: 720, height: 1000 },
  boardFormat: 'webp',
  jokerMapping: { RJ: 'joker1.png → rj.webp', BJ: 'joker2.png → bj.webp' },
});
