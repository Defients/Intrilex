// ═══════════════════════════════════════════════════════════════
// guided-fixture.mjs — GUIDED_EXHIBITION_01 "A Game of Inches"
//
// The complete deterministic scenario fixture. Contains:
//   - 54-card predetermined arrangement (stacked deck)
//   - checkpoints with scripted actions, commentary, hints
//   - Post-match debrief configuration
//
// The fixture runs through the canonical Intrilex engine — no fake
// rules, no duplicated logic. Every state transition is engine-owned.
//
// Card arrangement rationale:
//   Positions 0-4:   P1 (player) opening hand
//   Positions 5-10:  P2 (rival) opening hand
//   Positions 11-13: Swap bar (11-12 face-down, 13 face-up)
//   Positions 14-53: Draw pile (ordered for scripted draws)
//
// Note: originalOwnerId is assigned by index % 2 in the identity
// array (even → P1, odd → P2). Q♦ must be at an even index so
// that A♣ Purge bounces it back to P1's hand, not P2's.
//
// Draw pile order is carefully arranged so that:
//   - 4♥ is drawn by Rival at FT06
//   - 5♠ is drawn by Player at FT07
//   - 2♦ is drawn by Rival at FT08
//   - Q♣, J♣ are milled by 5♣ Recycle at FT12
//   - 5♥ is drawn by Player at FT13
//   - 7♥ is drawn by Player at FT21 (the clutch draw)
//
// Scoring path:
//   P1: 9♣(9) + 6♥(6) + Q♦(2) + 2♣(2) + 2♥(2) = 21
//   P2: 6♣(6) + 4♣(4) + 6♦(6) + 2♠(2) + 2♦(2) = 20
//   Final: 21-20
//
// Key engine mechanics used:
//   - score/points (ACTION) — ordinary scoring
//   - scuttle/ordinary (ACTION) — same rank, higher suit
//   - swap-bar/face-down (SETUP) — hidden swap
//   - swap-bar/face-up-draw (ACTION) — take face-up card
//   - draw/top (ACTION) — draw from deck
//   - anchor/queen (ACTION) — Queen to Enduring Row
//   - effect-private-choice/five-recycle (ACTION) — mill 2, rummage 1
//   - effect-ace/purge-anchor-bounce (ACTION) — bounce enemy anchor
//   - effect-four/clear-pr (ACTION) — clear opponent PR row
//   - counter/ace-spade (INSTANT) — A♠ Exile Counter
//   - private-choice/rank5-rummage (INSTANT) — rummage submission
// ═══════════════════════════════════════════════════════════════

import {
  GUIDED_SCENARIO_VERSION,
  GUIDED_EXHIBITION_01_ID,
  CommentaryTrigger,
  GlowLevel,
} from './guided-types.mjs';

// ── Card arrangement ──────────────────────────────────────────

// Q♦ at index 2 (even) → originalOwnerId = P1, so A♣ Purge bounces
// it back to P1's hand. 2♣ at index 4 (even) → originalOwnerId = P1.
const PLAYER_HAND = ['9♣', '6♦', 'Q♦', '6♥', '2♣'];
const RIVAL_HAND = ['6♣', '4♣', '2♠', 'A♣', '5♣', '2♥'];
const SWAP_BAR = ['6♠', '5♦', 'A♠']; // 6♠ fd, 5♦ fd, A♠ fu

// Draw pile: first 7 are critical (drawn/milled during the match),
// remaining 33 are in deterministic but non-critical order.
const DP_CRITICAL = ['4♥', '5♠', '2♦', 'Q♣', 'J♣', '5♥', '7♥'];
const DP_REMAINING = [
  '3♣', '7♣', '8♣', '10♣', 'K♣',
  'A♦', '3♦', '4♦', '7♦', '8♦', '9♦', '10♦', 'J♦', 'K♦',
  'A♥', '3♥', '8♥', '9♥', '10♥', 'J♥', 'Q♥', 'K♥',
  '3♠', '4♠', '7♠', '8♠', '9♠', '10♠', 'J♠', 'Q♠', 'K♠',
  'RJ', 'BJ',
];

/** @type {string[]} */
export const GUIDED_EXHIBITION_01_IDENTITIES = [
  ...PLAYER_HAND,
  ...RIVAL_HAND,
  ...SWAP_BAR,
  ...DP_CRITICAL,
  ...DP_REMAINING,
];

// ── Commentary helper ─────────────────────────────────────────

/**
 * @param {string} id
 * @param {string} checkpointId
 * @param {Array<string|[string,boolean]>} lines
 * @param {object} [opts]
 * @returns {import('./guided-types.mjs').CommentaryCue}
 */
function cue(id, checkpointId, lines, opts = {}) {
  return {
    id,
    trigger: opts.trigger ?? CommentaryTrigger.AFTER_RESOLUTION,
    checkpointId,
    lines: lines.map((l) => (typeof l === 'string' ? { text: l } : { text: l[0], bold: l[1] })),
    delayMs: opts.delayMs ?? 0,
    importance: opts.importance ?? 3,
    skippable: opts.skippable ?? true,
    persistInHistory: opts.persistInHistory ?? true,
    lightGuidanceOnly: opts.lightGuidanceOnly ?? false,
  };
}

// ── Checkpoints ───────────────────────────────────────────────

/** @type {import('./guided-types.mjs').Checkpoint[]} */
export const GUIDED_EXHIBITION_01_CHECKPOINTS = [
  // ── EX01_INIT — Arrival ───────────────────────────────────
  {
    id: 'EX01_INIT',
    fullTurn: 0,
    actor: 'player',
    description: 'Board fades in. Intro sequence.',
    playerDecision: false,
    scriptedActions: [],
    assertion: {
      checkpointId: 'EX01_INIT',
      playerScore: 0,
      rivalScore: 0,
      fullTurnSequence: 1,
      activePlayerId: 'P1',
      phase: 'Start',
      playerHandIdentities: ['9♣', '6♦', 'Q♦', '6♥', '2♣'],
      rivalHandIdentities: ['6♣', '4♣', '2♠', 'A♣', '5♣', '2♥'],
      swapBarIdentities: ['6♠', '5♦', 'A♠'],
      dpCount: 40,
      gyCount: 0,
      exileCount: 0,
    },
    commentary: [
      cue('EX01_INIT_C1', 'EX01_INIT', [
        ['This is a guided match.', true],
        "You'll make the important decisions. The quieter parts will move on their own.",
      ], { importance: 5, skippable: false }),
      cue('EX01_INIT_C2', 'EX01_INIT', [
        "You don't need to memorize every card.",
        ['Watch what changes.', true],
      ], { delayMs: 2000, importance: 4 }),
    ],
  },

  // ── EX01_FT01_SCORE_9C — Player scores 9♣ ─────────────────
  {
    id: 'EX01_FT01_SCORE_9C',
    fullTurn: 1,
    actor: 'player',
    description: 'Player scores 9♣ for 9 points.',
    playerDecision: true,
    glowIdentities: ['9♣'],
    glowLevel: GlowLevel.SUGGESTED,
    scriptedActions: [
      {
        checkpointId: 'EX01_FT01_SCORE_9C',
        actor: 'player',
        autoExecute: false,
        intent: { family: 'phase', mode: 'enter-action', timingClass: 'SETUP' },
      },
      {
        checkpointId: 'EX01_FT01_SCORE_9C',
        actor: 'player',
        autoExecute: false,
        intent: { family: 'score', mode: 'points', sourceIdentity: '9♣', timingClass: 'ACTION' },
      },
    ],
    assertion: {
      checkpointId: 'EX01_FT01_SCORE_9C',
      playerScore: 9,
      rivalScore: 0,
      fullTurnSequence: 2,
      activePlayerId: 'P2',
    },
    commentary: [
      cue('EX01_FT01_C1', 'EX01_FT01_SCORE_9C', [
        ['Nothing fancy.', true],
        'Nine Points is nine Points.',
      ], { delayMs: 500 }),
      cue('EX01_FT01_C2', 'EX01_FT01_SCORE_9C', [
        'Intrilex gets strange soon enough.',
      ], { delayMs: 1500, importance: 2 }),
    ],
  },

  // ── EX01_FT02_RIVAL_SWAP — Rival swaps + scores 6♣ ────────
  {
    id: 'EX01_FT02_RIVAL_SWAP',
    fullTurn: 2,
    actor: 'rival',
    description: 'Rival takes 6♠ from swap bar, puts 2♥ face-up, scores 6♣.',
    playerDecision: false,
    scriptedActions: [
      {
        checkpointId: 'EX01_FT02_RIVAL_SWAP',
        actor: 'rival',
        autoExecute: true,
        intent: { family: 'swap-bar', mode: 'face-down', sourceIdentity: '2♥', targetIdentity: '6♠', timingClass: 'SETUP' },
      },
      {
        checkpointId: 'EX01_FT02_RIVAL_SWAP',
        actor: 'rival',
        autoExecute: true,
        intent: { family: 'phase', mode: 'enter-action', timingClass: 'SETUP' },
      },
      {
        checkpointId: 'EX01_FT02_RIVAL_SWAP',
        actor: 'rival',
        autoExecute: true,
        intent: { family: 'score', mode: 'points', sourceIdentity: '6♣', timingClass: 'ACTION' },
      },
    ],
    assertion: {
      checkpointId: 'EX01_FT02_RIVAL_SWAP',
      playerScore: 9,
      rivalScore: 6,
      fullTurnSequence: 3,
      activePlayerId: 'P1',
    },
    commentary: [
      cue('EX01_FT02_C1', 'EX01_FT02_RIVAL_SWAP', [
        "They're using the Swap Bar before playing.",
      ], { importance: 3 }),
      cue('EX01_FT02_C2', 'EX01_FT02_RIVAL_SWAP', [
        'That wasn\'t a guaranteed upgrade.',
        'Sometimes you\'re buying options.',
      ], { delayMs: 1000, importance: 2 }),
    ],
  },

  // ── EX01_FT03_PLAYER_SWAP_2H — Player takes 2♥ ────────────
  {
    id: 'EX01_FT03_PLAYER_SWAP_2H',
    fullTurn: 3,
    actor: 'player',
    description: 'Player takes 2♥ from swap bar (face-up swap draw).',
    playerDecision: true,
    glowIdentities: ['A♠', '2♥'],
    glowLevel: GlowLevel.AMBIENT,
    scriptedActions: [
      {
        checkpointId: 'EX01_FT03_PLAYER_SWAP_2H',
        actor: 'player',
        autoExecute: false,
        intent: { family: 'phase', mode: 'enter-action', timingClass: 'SETUP' },
      },
      {
        checkpointId: 'EX01_FT03_PLAYER_SWAP_2H',
        actor: 'player',
        autoExecute: false,
        intent: { family: 'swap-bar', mode: 'face-up-draw', targetIdentity: '2♥', timingClass: 'ACTION' },
      },
    ],
    assertion: {
      checkpointId: 'EX01_FT03_PLAYER_SWAP_2H',
      playerScore: 9,
      rivalScore: 6,
      fullTurnSequence: 4,
      activePlayerId: 'P2',
      playerHandIdentities: ['6♦', 'Q♦', '6♥', '2♣', '2♥'],
    },
    commentary: [
      cue('EX01_FT03_C1', 'EX01_FT03_PLAYER_SWAP_2H', [
        ['Aces are obvious.', true],
        ['Twos are flexible.', true],
      ], { trigger: CommentaryTrigger.ON_IDLE, importance: 3 }),
      cue('EX01_FT03_C2', 'EX01_FT03_PLAYER_SWAP_2H', [
        "Two Points isn't much.",
        ['Flexibility might be.', true],
      ], { delayMs: 500 }),
    ],
    hint: {
      checkpointId: 'EX01_FT03_PLAYER_SWAP_2H',
      h1DelayMs: 5000,
      h2DelayMs: 10000,
      h3DelayMs: 15000,
      h2Text: 'Aces are obvious. Twos are flexible.',
      h3Text: 'Take 2♥ from the Swap Bar.',
      glowIdentities: ['2♥', 'A♠'],
      glowLevel: GlowLevel.SUGGESTED,
    },
  },

  // ── EX01_FT04 — Rival scores 4♣ (breathing room) ──────────
  {
    id: 'EX01_FT04',
    fullTurn: 4,
    actor: 'rival',
    description: 'Rival scores 4♣. Score: 9–10.',
    playerDecision: false,
    scriptedActions: [
      {
        checkpointId: 'EX01_FT04',
        actor: 'rival',
        autoExecute: true,
        intent: { family: 'phase', mode: 'enter-action', timingClass: 'SETUP' },
      },
      {
        checkpointId: 'EX01_FT04',
        actor: 'rival',
        autoExecute: true,
        intent: { family: 'score', mode: 'points', sourceIdentity: '4♣', timingClass: 'ACTION' },
      },
    ],
    assertion: {
      checkpointId: 'EX01_FT04',
      playerScore: 9,
      rivalScore: 10,
      fullTurnSequence: 5,
      activePlayerId: 'P1',
    },
    commentary: [
      cue('EX01_FT04_C1', 'EX01_FT04', [
        "And now they're ahead.",
      ], { importance: 2 }),
    ],
  },

  // ── EX01_FT05_QD_ER — Player places Q♦ in Enduring Row ────
  {
    id: 'EX01_FT05_QD_ER',
    fullTurn: 5,
    actor: 'player',
    description: 'Player places Q♦ in Enduring Row (persistent Guard).',
    playerDecision: true,
    glowIdentities: ['Q♦'],
    glowLevel: GlowLevel.SUGGESTED,
    scriptedActions: [
      {
        checkpointId: 'EX01_FT05_QD_ER',
        actor: 'player',
        autoExecute: false,
        intent: { family: 'phase', mode: 'enter-action', timingClass: 'SETUP' },
      },
      {
        checkpointId: 'EX01_FT05_QD_ER',
        actor: 'player',
        autoExecute: false,
        intent: { family: 'anchor', mode: 'queen', sourceIdentity: 'Q♦', timingClass: 'ACTION' },
      },
    ],
    assertion: {
      checkpointId: 'EX01_FT05_QD_ER',
      playerScore: 9,
      rivalScore: 10,
      fullTurnSequence: 6,
      activePlayerId: 'P2',
      playerERIdentities: ['Q♦'],
    },
    commentary: [
      cue('EX01_FT05_C1', 'EX01_FT05_QD_ER', [
        "You don't have to race the Point Row.",
      ], { importance: 3 }),
      cue('EX01_FT05_C2', 'EX01_FT05_QD_ER', [
        ['That Queen stays.', true],
        "While she's established, some attacks against your position become harder.",
      ], { delayMs: 500 }),
    ],
    hint: {
      checkpointId: 'EX01_FT05_QD_ER',
      h1DelayMs: 5000,
      h2DelayMs: 10000,
      h3DelayMs: 15000,
      h2Text: 'The Queen can stay on the table and change what comes after.',
      h3Text: 'Play Q♦ to your Enduring Row.',
      glowIdentities: ['Q♦'],
      glowLevel: GlowLevel.SUGGESTED,
    },
  },

  // ── EX01_FT06 — Rival draws 4♥ (quiet) ─────────────────────
  {
    id: 'EX01_FT06',
    fullTurn: 6,
    actor: 'rival',
    description: 'Rival draws 4♥. Quiet turn.',
    playerDecision: false,
    scriptedActions: [
      {
        checkpointId: 'EX01_FT06',
        actor: 'rival',
        autoExecute: true,
        intent: { family: 'phase', mode: 'enter-action', timingClass: 'SETUP' },
      },
      {
        checkpointId: 'EX01_FT06',
        actor: 'rival',
        autoExecute: true,
        intent: { family: 'draw', mode: 'top', timingClass: 'ACTION' },
      },
    ],
    assertion: {
      checkpointId: 'EX01_FT06',
      playerScore: 9,
      rivalScore: 10,
      fullTurnSequence: 7,
      activePlayerId: 'P1',
    },
    commentary: [
      cue('EX01_FT06_C1', 'EX01_FT06', [
        "They're stocking something.",
      ], { importance: 1 }),
    ],
  },

  // ── EX01_FT07 — Player draws 5♠ (quiet) ───────────────────
  {
    id: 'EX01_FT07',
    fullTurn: 7,
    actor: 'player',
    description: 'Player draws 5♠. Breathing room.',
    playerDecision: true,
    scriptedActions: [
      {
        checkpointId: 'EX01_FT07',
        actor: 'player',
        autoExecute: false,
        intent: { family: 'phase', mode: 'enter-action', timingClass: 'SETUP' },
      },
      {
        checkpointId: 'EX01_FT07',
        actor: 'player',
        autoExecute: false,
        intent: { family: 'draw', mode: 'top', timingClass: 'ACTION' },
      },
    ],
    assertion: {
      checkpointId: 'EX01_FT07',
      playerScore: 9,
      rivalScore: 10,
      fullTurnSequence: 8,
      activePlayerId: 'P2',
      playerHandIdentities: ['6♦', '6♥', '2♣', '2♥', '5♠'],
    },
    commentary: [],
  },

  // ── EX01_FT08 — Rival draws 2♦ (hidden setup) ─────────────
  {
    id: 'EX01_FT08',
    fullTurn: 8,
    actor: 'rival',
    description: 'Rival draws 2♦. This card matters later.',
    playerDecision: false,
    scriptedActions: [
      {
        checkpointId: 'EX01_FT08',
        actor: 'rival',
        autoExecute: true,
        intent: { family: 'phase', mode: 'enter-action', timingClass: 'SETUP' },
      },
      {
        checkpointId: 'EX01_FT08',
        actor: 'rival',
        autoExecute: true,
        intent: { family: 'draw', mode: 'top', timingClass: 'ACTION' },
      },
    ],
    assertion: {
      checkpointId: 'EX01_FT08',
      playerScore: 9,
      rivalScore: 10,
      fullTurnSequence: 9,
      activePlayerId: 'P1',
    },
    commentary: [],
  },

  // ── EX01_FT09_FALSE_SAFETY — Player scores 6♦ (15–10) ─────
  {
    id: 'EX01_FT09_FALSE_SAFETY',
    fullTurn: 9,
    actor: 'player',
    description: 'Player scores 6♦. Score: 15–10. False safety.',
    playerDecision: true,
    glowIdentities: ['6♦'],
    glowLevel: GlowLevel.SUGGESTED,
    scriptedActions: [
      {
        checkpointId: 'EX01_FT09_FALSE_SAFETY',
        actor: 'player',
        autoExecute: false,
        intent: { family: 'phase', mode: 'enter-action', timingClass: 'SETUP' },
      },
      {
        checkpointId: 'EX01_FT09_FALSE_SAFETY',
        actor: 'player',
        autoExecute: false,
        intent: { family: 'score', mode: 'points', sourceIdentity: '6♦', timingClass: 'ACTION' },
      },
    ],
    assertion: {
      checkpointId: 'EX01_FT09_FALSE_SAFETY',
      playerScore: 15,
      rivalScore: 10,
      fullTurnSequence: 10,
      activePlayerId: 'P2',
    },
    commentary: [
      cue('EX01_FT09_C1', 'EX01_FT09_FALSE_SAFETY', [
        ['Five ahead.', true],
        "And your Queen is still holding the position together.",
      ], { delayMs: 500 }),
      cue('EX01_FT09_C2', 'EX01_FT09_FALSE_SAFETY', [
        ['Comfortable.', true],
      ], { delayMs: 1500, importance: 4 }),
    ],
  },

  // ── EX01_FT10_SCUTTLE — Rival scuttles 6♦ with 6♠ ─────────
  {
    id: 'EX01_FT10_SCUTTLE',
    fullTurn: 10,
    actor: 'rival',
    description: 'Rival scuttles player 6♦ with 6♠. Player: 15→9.',
    playerDecision: false,
    scriptedActions: [
      {
        checkpointId: 'EX01_FT10_SCUTTLE',
        actor: 'rival',
        autoExecute: true,
        intent: { family: 'phase', mode: 'enter-action', timingClass: 'SETUP' },
      },
      {
        checkpointId: 'EX01_FT10_SCUTTLE',
        actor: 'rival',
        autoExecute: true,
        intent: { family: 'scuttle', mode: 'ordinary', sourceIdentity: '6♠', targetIdentity: '6♦', timingClass: 'ACTION' },
      },
    ],
    assertion: {
      checkpointId: 'EX01_FT10_SCUTTLE',
      playerScore: 9,
      rivalScore: 10,
      fullTurnSequence: 11,
      activePlayerId: 'P1',
    },
    commentary: [
      cue('EX01_FT10_SCUTTLE_C1', 'EX01_FT10_SCUTTLE', [
        'Same rank.',
        ['Higher suit.', true],
      ], { importance: 5, skippable: false }),
      cue('EX01_FT10_SCUTTLE_C2', 'EX01_FT10_SCUTTLE', [
        "Scuttle didn't score for them.",
        ['It erased six from you.', true],
      ], { delayMs: 500 }),
    ],
  },

  // ── EX01_FT11_REBUILD — Player scores 6♥ (15–10) ──────────
  {
    id: 'EX01_FT11_REBUILD',
    fullTurn: 11,
    actor: 'player',
    description: 'Player scores 6♥. Rebuilding after the scuttle. 15–10.',
    playerDecision: true,
    glowIdentities: ['6♥'],
    glowLevel: GlowLevel.SUGGESTED,
    scriptedActions: [
      {
        checkpointId: 'EX01_FT11_REBUILD',
        actor: 'player',
        autoExecute: false,
        intent: { family: 'phase', mode: 'enter-action', timingClass: 'SETUP' },
      },
      {
        checkpointId: 'EX01_FT11_REBUILD',
        actor: 'player',
        autoExecute: false,
        intent: { family: 'score', mode: 'points', sourceIdentity: '6♥', timingClass: 'ACTION' },
      },
    ],
    assertion: {
      checkpointId: 'EX01_FT11_REBUILD',
      playerScore: 15,
      rivalScore: 10,
      fullTurnSequence: 12,
      activePlayerId: 'P2',
    },
    commentary: [
      cue('EX01_FT11_C1', 'EX01_FT11_REBUILD', [
        ['Back to fifteen.', true],
        "Different card. Same position.",
      ], { importance: 3 }),
    ],
  },

  // ── EX01_FT12_RECYCLE_DECLARE — Rival declares 5♣ Recycle ─
  {
    id: 'EX01_FT12_RECYCLE_DECLARE',
    fullTurn: 12,
    actor: 'rival',
    description: 'Rival declares 5♣ Recycle. Mills Q♣, J♣. Rummage pending.',
    playerDecision: false,
    scriptedActions: [
      {
        checkpointId: 'EX01_FT12_RECYCLE_DECLARE',
        actor: 'rival',
        autoExecute: true,
        intent: { family: 'phase', mode: 'enter-action', timingClass: 'SETUP' },
      },
      {
        checkpointId: 'EX01_FT12_RECYCLE_DECLARE',
        actor: 'rival',
        autoExecute: true,
        intent: { family: 'effect-private-choice', mode: 'five-recycle', sourceIdentity: '5♣', timingClass: 'ACTION' },
      },
    ],
    commentary: [
      cue('EX01_FT12_RECYCLE_C1', 'EX01_FT12_RECYCLE_DECLARE', [
        ['Five mills two from the top of the deck.', true],
        "Then they rummage something from the Graveyard.",
      ], { importance: 4 }),
    ],
  },

  // ── EX01_FT12_RECYCLE_RUMMAGE — Rival selects 6♦ from GY ──
  {
    id: 'EX01_FT12_RECYCLE_RUMMAGE',
    fullTurn: 12,
    actor: 'rival',
    description: 'Rival rummages 6♦ from GY. Also gets 6♠ from GY bottom.',
    playerDecision: false,
    scriptedActions: [
      {
        checkpointId: 'EX01_FT12_RECYCLE_RUMMAGE',
        actor: 'rival',
        autoExecute: true,
        intent: { family: 'private-choice', mode: 'rank5-rummage', targetIdentity: '6♦', timingClass: 'INSTANT' },
      },
    ],
    assertion: {
      checkpointId: 'EX01_FT12_RECYCLE_RUMMAGE',
      playerScore: 15,
      rivalScore: 10,
      fullTurnSequence: 13,
      activePlayerId: 'P1',
    },
    commentary: [
      cue('EX01_FT12_RUMMAGE_C1', 'EX01_FT12_RECYCLE_RUMMAGE', [
        'Recognize those?',
      ], { delayMs: 500, importance: 3 }),
      cue('EX01_FT12_RUMMAGE_C2', 'EX01_FT12_RECYCLE_RUMMAGE', [
        'Five recovered the Six you lost...',
        ['...and the Six that scuttled it.', true],
      ], { delayMs: 1000, importance: 4 }),
      cue('EX01_FT12_RUMMAGE_C3', 'EX01_FT12_RECYCLE_RUMMAGE', [
        ["The Graveyard isn't always the end.", true],
      ], { delayMs: 1000, importance: 3 }),
    ],
  },

  // ── EX01_FT13 — Player draws 5♥ (quiet) ───────────────────
  {
    id: 'EX01_FT13',
    fullTurn: 13,
    actor: 'player',
    description: 'Player draws 5♥. Subtle same-suit connector with 2♥.',
    playerDecision: true,
    scriptedActions: [
      {
        checkpointId: 'EX01_FT13',
        actor: 'player',
        autoExecute: false,
        intent: { family: 'phase', mode: 'enter-action', timingClass: 'SETUP' },
      },
      {
        checkpointId: 'EX01_FT13',
        actor: 'player',
        autoExecute: false,
        intent: { family: 'draw', mode: 'top', timingClass: 'ACTION' },
      },
    ],
    assertion: {
      checkpointId: 'EX01_FT13',
      playerScore: 15,
      rivalScore: 10,
      fullTurnSequence: 14,
      activePlayerId: 'P2',
      playerHandIdentities: ['2♣', '2♥', '5♠', '5♥'],
    },
    commentary: [
      cue('EX01_FT13_C1', 'EX01_FT13', [
        ['Interesting.', true],
      ], { importance: 2 }),
    ],
  },

  // ── EX01_FT14_QD_PURGED — Rival A♣ Purge on Q♦ ────────────
  {
    id: 'EX01_FT14_QD_PURGED',
    fullTurn: 14,
    actor: 'rival',
    description: 'Rival plays A♣ Purge on Q♦. Queen returns to hand.',
    playerDecision: false,
    scriptedActions: [
      {
        checkpointId: 'EX01_FT14_QD_PURGED',
        actor: 'rival',
        autoExecute: true,
        intent: { family: 'phase', mode: 'enter-action', timingClass: 'SETUP' },
      },
      {
        checkpointId: 'EX01_FT14_QD_PURGED',
        actor: 'rival',
        autoExecute: true,
        intent: { family: 'effect-ace', mode: 'purge-anchor-bounce', sourceIdentity: 'A♣', targetIdentity: 'Q♦', timingClass: 'ACTION' },
      },
    ],
    assertion: {
      checkpointId: 'EX01_FT14_QD_PURGED',
      playerScore: 15,
      rivalScore: 10,
      fullTurnSequence: 15,
      activePlayerId: 'P1',
      playerERIdentities: [],
    },
    commentary: [
      cue('EX01_FT14_C1', 'EX01_FT14_QD_PURGED', [
        'Your Queen made several attacks awkward.',
      ], { importance: 3 }),
      cue('EX01_FT14_C2', 'EX01_FT14_QD_PURGED', [
        ['So they attacked the Queen.', true],
      ], { delayMs: 500, importance: 4 }),
      cue('EX01_FT14_C3', 'EX01_FT14_QD_PURGED', [
        'Same Ace that was in their opening hand.',
        ['Now it broke your board.', true],
      ], { delayMs: 1000, importance: 4 }),
    ],
  },

  // ── EX01_FT15_AS_SWAP — Player takes A♠ from swap bar ──────
  {
    id: 'EX01_FT15_AS_SWAP',
    fullTurn: 15,
    actor: 'player',
    description: 'Player takes A♠ from swap bar. The board changed, so did its value.',
    playerDecision: true,
    glowIdentities: ['A♠'],
    glowLevel: GlowLevel.AMBIENT,
    scriptedActions: [
      {
        checkpointId: 'EX01_FT15_AS_SWAP',
        actor: 'player',
        autoExecute: false,
        intent: { family: 'phase', mode: 'enter-action', timingClass: 'SETUP' },
      },
      {
        checkpointId: 'EX01_FT15_AS_SWAP',
        actor: 'player',
        autoExecute: false,
        intent: { family: 'swap-bar', mode: 'face-up-draw', targetIdentity: 'A♠', timingClass: 'ACTION' },
      },
    ],
    assertion: {
      checkpointId: 'EX01_FT15_AS_SWAP',
      playerScore: 15,
      rivalScore: 10,
      fullTurnSequence: 16,
      activePlayerId: 'P2',
      playerHandIdentities: ['2♣', '2♥', '5♠', '5♥', 'Q♦', 'A♠'],
    },
    commentary: [
      cue('EX01_FT15_C1', 'EX01_FT15_AS_SWAP', [
        ['Remember this?', true],
      ], { importance: 3 }),
      cue('EX01_FT15_C2', 'EX01_FT15_AS_SWAP', [
        ['You passed it earlier.', true],
        ["That wasn't a mistake.", true],
      ], { delayMs: 1000, importance: 4 }),
      cue('EX01_FT15_C3', 'EX01_FT15_AS_SWAP', [
        'The board changed.',
        ['So did its value.', true],
      ], { delayMs: 1000, importance: 5, skippable: false }),
    ],
  },

  // ── EX01_FT16_STOLEN_SIX_SCORE — Rival scores 6♦ (16) ─────
  {
    id: 'EX01_FT16_STOLEN_SIX_SCORE',
    fullTurn: 16,
    actor: 'rival',
    description: 'Rival scores recovered 6♦. Score: 15–16. "That\'s your Six."',
    playerDecision: false,
    scriptedActions: [
      {
        checkpointId: 'EX01_FT16_STOLEN_SIX_SCORE',
        actor: 'rival',
        autoExecute: true,
        intent: { family: 'phase', mode: 'enter-action', timingClass: 'SETUP' },
      },
      {
        checkpointId: 'EX01_FT16_STOLEN_SIX_SCORE',
        actor: 'rival',
        autoExecute: true,
        intent: { family: 'score', mode: 'points', sourceIdentity: '6♦', timingClass: 'ACTION' },
      },
    ],
    assertion: {
      checkpointId: 'EX01_FT16_STOLEN_SIX_SCORE',
      playerScore: 15,
      rivalScore: 16,
      fullTurnSequence: 17,
      activePlayerId: 'P1',
    },
    commentary: [
      cue('EX01_FT16_C1', 'EX01_FT16_STOLEN_SIX_SCORE', [
        ['Yep.', true],
      ], { delayMs: 500, importance: 3 }),
      cue('EX01_FT16_C2', 'EX01_FT16_STOLEN_SIX_SCORE', [
        ["That's your Six.", true],
      ], { delayMs: 1000, importance: 5, skippable: false }),
    ],
  },

  // ── EX01_FT17 — Player scores Q♦ (17–16) ──────────────────
  {
    id: 'EX01_FT17',
    fullTurn: 17,
    actor: 'player',
    description: 'Player scores Q♦. Score: 17–16.',
    playerDecision: true,
    glowIdentities: ['Q♦'],
    glowLevel: GlowLevel.SUGGESTED,
    scriptedActions: [
      {
        checkpointId: 'EX01_FT17',
        actor: 'player',
        autoExecute: false,
        intent: { family: 'phase', mode: 'enter-action', timingClass: 'SETUP' },
      },
      {
        checkpointId: 'EX01_FT17',
        actor: 'player',
        autoExecute: false,
        intent: { family: 'score', mode: 'points', sourceIdentity: 'Q♦', timingClass: 'ACTION' },
      },
    ],
    assertion: {
      checkpointId: 'EX01_FT17',
      playerScore: 17,
      rivalScore: 16,
      fullTurnSequence: 18,
      activePlayerId: 'P2',
    },
    commentary: [
      cue('EX01_FT17_C1', 'EX01_FT17', [
        'The Queen came back.',
        ['This time she scores.', true],
      ], { importance: 3 }),
    ],
  },

  // ── EX01_FT18_PR_CLEAR_THREAT — Rival 4♥ PR Row Clear ─────
  {
    id: 'EX01_FT18_PR_CLEAR_THREAT',
    fullTurn: 18,
    actor: 'rival',
    description: 'Rival declares 4♥ PR Row Clear. Threat to all 17 player points.',
    playerDecision: false,
    scriptedActions: [
      {
        checkpointId: 'EX01_FT18_PR_CLEAR_THREAT',
        actor: 'rival',
        autoExecute: true,
        intent: { family: 'phase', mode: 'enter-action', timingClass: 'SETUP' },
      },
      {
        checkpointId: 'EX01_FT18_PR_CLEAR_THREAT',
        actor: 'rival',
        autoExecute: true,
        intent: { family: 'effect-four', mode: 'clear-pr', sourceIdentity: '4♥', timingClass: 'ACTION' },
      },
    ],
    commentary: [
      cue('EX01_FT18_THREAT_C1', 'EX01_FT18_PR_CLEAR_THREAT', [
        ['All of it.', true],
        "Everything you scored would be gone.",
      ], { importance: 5, skippable: false }),
    ],
  },

  // ── EX01_FT18_AS_COUNTER — Player A♠ Exile Counter ────────
  {
    id: 'EX01_FT18_AS_COUNTER',
    fullTurn: 18,
    actor: 'player',
    description: 'Player A♠ Exile Counters 4♥. 4♥ goes to Exile, not GY.',
    playerDecision: true,
    glowIdentities: ['A♠'],
    glowLevel: GlowLevel.SUGGESTED,
    scriptedActions: [
      {
        checkpointId: 'EX01_FT18_AS_COUNTER',
        actor: 'player',
        autoExecute: false,
        intent: { family: 'counter', mode: 'ace-spade', sourceIdentity: 'A♠', timingClass: 'INSTANT' },
      },
    ],
    assertion: {
      checkpointId: 'EX01_FT18_AS_COUNTER',
      playerScore: 17,
      rivalScore: 16,
      fullTurnSequence: 19,
      activePlayerId: 'P1',
      exileCount: 1,
    },
    commentary: [
      cue('EX01_FT18_COUNTER_C1', 'EX01_FT18_AS_COUNTER', [
        ['There.', true],
        "That's why the Ace mattered now.",
      ], { delayMs: 500, importance: 4 }),
      cue('EX01_FT18_COUNTER_C2', 'EX01_FT18_AS_COUNTER', [
        "And the Four didn't go to the Graveyard.",
        ['It went farther.', true],
      ], { delayMs: 1000, importance: 4 }),
    ],
    hint: {
      checkpointId: 'EX01_FT18_AS_COUNTER',
      h1DelayMs: 3000,
      h2DelayMs: 8000,
      h3DelayMs: 15000,
      h2Text: 'You came back for that Ace for a reason.',
      h3Text: 'Counter with A♠.',
      glowIdentities: ['A♠'],
      glowLevel: GlowLevel.SUGGESTED,
    },
  },

  // ── EX01_FT19_SCORE_2C — Player scores 2♣ (19–16) ─────────
  {
    id: 'EX01_FT19_SCORE_2C',
    fullTurn: 19,
    actor: 'player',
    description: 'Player scores 2♣. Score: 19–16. Two away.',
    playerDecision: true,
    glowIdentities: ['2♣'],
    glowLevel: GlowLevel.SUGGESTED,
    scriptedActions: [
      {
        checkpointId: 'EX01_FT19_SCORE_2C',
        actor: 'player',
        autoExecute: false,
        intent: { family: 'phase', mode: 'enter-action', timingClass: 'SETUP' },
      },
      {
        checkpointId: 'EX01_FT19_SCORE_2C',
        actor: 'player',
        autoExecute: false,
        intent: { family: 'score', mode: 'points', sourceIdentity: '2♣', timingClass: 'ACTION' },
      },
    ],
    assertion: {
      checkpointId: 'EX01_FT19_SCORE_2C',
      playerScore: 19,
      rivalScore: 16,
      fullTurnSequence: 20,
      activePlayerId: 'P2',
    },
    commentary: [
      cue('EX01_FT19_C1', 'EX01_FT19_SCORE_2C', [
        ['Two away.', true],
      ], { importance: 3 }),
    ],
  },

  // ── EX01_FT20 — Rival scores 2♠ (19–18) ───────────────────
  {
    id: 'EX01_FT20',
    fullTurn: 20,
    actor: 'rival',
    description: 'Rival scores 2♠. Score: 19–18.',
    playerDecision: false,
    scriptedActions: [
      {
        checkpointId: 'EX01_FT20',
        actor: 'rival',
        autoExecute: true,
        intent: { family: 'phase', mode: 'enter-action', timingClass: 'SETUP' },
      },
      {
        checkpointId: 'EX01_FT20',
        actor: 'rival',
        autoExecute: true,
        intent: { family: 'score', mode: 'points', sourceIdentity: '2♠', timingClass: 'ACTION' },
      },
    ],
    assertion: {
      checkpointId: 'EX01_FT20',
      playerScore: 19,
      rivalScore: 18,
      fullTurnSequence: 21,
      activePlayerId: 'P1',
    },
    commentary: [
      cue('EX01_FT20_C1', 'EX01_FT20', [
        "They're not waiting.",
      ], { importance: 3 }),
    ],
  },

  // ── EX01_FT21_DRAW_7H — Player draws 7♥ (the clutch) ──────
  {
    id: 'EX01_FT21_DRAW_7H',
    fullTurn: 21,
    actor: 'player',
    description: 'Player draws 7♥. The clutch draw. But 19+7=26 — overshoot.',
    playerDecision: true,
    glowIdentities: [],
    glowLevel: GlowLevel.AMBIENT,
    scriptedActions: [
      {
        checkpointId: 'EX01_FT21_DRAW_7H',
        actor: 'player',
        autoExecute: false,
        intent: { family: 'phase', mode: 'enter-action', timingClass: 'SETUP' },
      },
      {
        checkpointId: 'EX01_FT21_DRAW_7H',
        actor: 'player',
        autoExecute: false,
        intent: { family: 'draw', mode: 'top', timingClass: 'ACTION' },
      },
    ],
    assertion: {
      checkpointId: 'EX01_FT21_DRAW_7H',
      playerScore: 19,
      rivalScore: 18,
      fullTurnSequence: 22,
      activePlayerId: 'P2',
      playerHandIdentities: ['2♥', '5♠', '5♥', '7♥'],
    },
    commentary: [
      cue('EX01_FT21_C1', 'EX01_FT21_DRAW_7H', [
        ['…Well.', true],
      ], { delayMs: 1000, importance: 5, skippable: false }),
      cue('EX01_FT21_C2', 'EX01_FT21_DRAW_7H', [
        'A Seven.',
        ['Lucky.', true],
        "But 19 plus 7 is 26. You'd overshoot.",
      ], { delayMs: 1500, importance: 4 }),
      cue('EX01_FT21_C3', 'EX01_FT21_DRAW_7H', [
        ['You need exactly two.', true],
        "And you have it. But not yet.",
      ], { delayMs: 1000, importance: 4 }),
    ],
  },

  // ── EX01_FT22 — Rival scores 2♦ (19–20) ───────────────────
  {
    id: 'EX01_FT22',
    fullTurn: 22,
    actor: 'rival',
    description: 'Rival scores 2♦. Score: 19–20. One to go.',
    playerDecision: false,
    scriptedActions: [
      {
        checkpointId: 'EX01_FT22',
        actor: 'rival',
        autoExecute: true,
        intent: { family: 'phase', mode: 'enter-action', timingClass: 'SETUP' },
      },
      {
        checkpointId: 'EX01_FT22',
        actor: 'rival',
        autoExecute: true,
        intent: { family: 'score', mode: 'points', sourceIdentity: '2♦', timingClass: 'ACTION' },
      },
    ],
    assertion: {
      checkpointId: 'EX01_FT22',
      playerScore: 19,
      rivalScore: 20,
      fullTurnSequence: 23,
      activePlayerId: 'P1',
    },
    commentary: [
      cue('EX01_FT22_C1', 'EX01_FT22', [
        ['Twenty.', true],
      ], { importance: 5, skippable: false }),
      cue('EX01_FT22_C2', 'EX01_FT22', [
        ['Your turn.', true],
      ], { delayMs: 1000, importance: 4 }),
    ],
  },

  // ── EX01_FT23_WIN — Player scores 2♥ (21–20) Victory ──────
  {
    id: 'EX01_FT23_WIN',
    fullTurn: 23,
    actor: 'player',
    description: 'Player scores 2♥. 19→21. Victory. 21–20.',
    playerDecision: true,
    glowIdentities: ['2♥'],
    glowLevel: GlowLevel.SUGGESTED,
    scriptedActions: [
      {
        checkpointId: 'EX01_FT23_WIN',
        actor: 'player',
        autoExecute: false,
        intent: { family: 'phase', mode: 'enter-action', timingClass: 'SETUP' },
      },
      {
        checkpointId: 'EX01_FT23_WIN',
        actor: 'player',
        autoExecute: false,
        intent: { family: 'score', mode: 'points', sourceIdentity: '2♥', timingClass: 'ACTION' },
      },
    ],
    assertion: {
      checkpointId: 'EX01_FT23_WIN',
      playerScore: 21,
      rivalScore: 20,
      winner: 'P1',
    },
    commentary: [
      cue('EX01_FT23_C1', 'EX01_FT23_WIN', [
        ['Two.', true],
      ], { delayMs: 750, importance: 4 }),
      cue('EX01_FT23_C2', 'EX01_FT23_WIN', [
        ['Exactly two.', true],
      ], { delayMs: 750, importance: 5, skippable: false }),
      cue('EX01_FT23_C3', 'EX01_FT23_WIN', [
        "The Two you took on turn three.",
        ['The one that wasn\'t worth much then.', true],
        ['Was worth everything now.', true],
      ], { delayMs: 1000, importance: 5, skippable: false }),
    ],
    hint: {
      checkpointId: 'EX01_FT23_WIN',
      h1DelayMs: 3000,
      h2DelayMs: 8000,
      h3DelayMs: 15000,
      h2Text: 'Two points is all you need.',
      h3Text: 'Score 2♥.',
      glowIdentities: ['2♥'],
      glowLevel: GlowLevel.SUGGESTED,
    },
  },

  // ── EX01_VICTORY_21_20 — Victory ──────────────────────────
  {
    id: 'EX01_VICTORY_21_20',
    fullTurn: 23,
    actor: 'player',
    description: 'Victory. 21–20. End Phase executes.',
    playerDecision: false,
    scriptedActions: [],
    assertion: {
      checkpointId: 'EX01_VICTORY_21_20',
      playerScore: 21,
      rivalScore: 20,
      winner: 'P1',
    },
    commentary: [],
  },

  // ── EX01_DEBRIEF — Post-match debrief ─────────────────────
  {
    id: 'EX01_DEBRIEF',
    fullTurn: 23,
    actor: 'player',
    description: 'Post-match debrief sequence.',
    playerDecision: false,
    scriptedActions: [],
    commentary: [],
  },
];

// ── Debrief configuration ─────────────────────────────────────

/** @type {import('./guided-types.mjs').DebriefConfig} */
export const GUIDED_EXHIBITION_01_DEBRIEF = {
  steps: [
    { text: 'Lucky?', bold: true, pauseMs: 1000 },
    { text: 'A little.', bold: true, pauseMs: 1000 },
    { text: 'The 7♥ arrived when you needed a card.', pauseMs: 1500, visualRef: 'FT21_DRAW_7H' },
    { text: "But you couldn't score it. 19 plus 7 overshoots.", pauseMs: 1500, visualRef: 'FT21_DRAW_7H' },
    { text: 'You needed exactly two.', bold: true, pauseMs: 1500 },
    { text: 'The Two you took on turn three.', pauseMs: 1500, visualRef: 'FT03_SWAP_2H' },
    { text: 'You passed on the Ace when flexibility mattered more.', pauseMs: 1500, visualRef: 'FT15_AS_SWAP' },
    { text: 'Then you came back for it when survival mattered more.', pauseMs: 1500, visualRef: 'FT18_AS_COUNTER' },
    { text: 'The draw supplied an opportunity.', pauseMs: 1500, visualRef: 'FT21_DRAW_7H' },
    { text: 'Your earlier decisions made the opportunity playable.', bold: true, pauseMs: 2000 },
    { text: "THAT'S INTRILEX.", bold: true, pauseMs: 2000 },
  ],
  encounteredMechanics: [
    'Point scoring', 'Point Row', 'Enduring Row', 'Queen / Guard',
    'Swap Bar', 'Hidden Swap', 'Face-Up Swap', 'Suit hierarchy',
    'Scuttle', 'Response windows', 'Counters', 'Exile',
    'Graveyard recursion', 'Private choice effects', 'End Phase victory',
  ],
  unseenMechanics: [
    'Kings', 'Jokers', "Queen's Court", 'Royal Marriage',
    'Super Two', 'Super Seven', 'Mini-Turn economy',
    'Ultras', 'Rank 10 effects', 'Board Lock', 'Sudden Death',
    'Exhausted Draw Pile', 'Advanced modes',
  ],
  transparencyText: 'This was an authored exhibition. Opening hands, the Swap Bar, Draw Pile order, and rival strategy were predetermined so several mechanics could appear in one coherent match. Real matches don\'t follow this script.',
  footerText: 'You saw one Intrilex game. The next one won\'t behave.',
};

// ── Full scenario object ──────────────────────────────────────

/** @type {import('./guided-types.mjs').GuidedScenario} */
export const GUIDED_EXHIBITION_01 = Object.freeze({
  id: GUIDED_EXHIBITION_01_ID,
  version: GUIDED_SCENARIO_VERSION,
  title: 'A Game of Inches',
  subtitle: 'Guided Exhibition • Fixed Match',
  profileId: 'core-advanced-authority',
  seed: 999, // Used for post-setup RNG only (shuffle is bypassed)
  predeterminedIdentities: GUIDED_EXHIBITION_01_IDENTITIES,
  playerId: 'P1',
  rivalId: 'P2',
  checkpoints: GUIDED_EXHIBITION_01_CHECKPOINTS,
  debrief: GUIDED_EXHIBITION_01_DEBRIEF,
  introText: 'This is a guided match. You\'ll make the important decisions. The quieter parts will move on their own.',
  estimatedMinutes: 7,
});

/**
 * List all available guided exhibition scenarios.
 * @returns {import('./guided-types.mjs').GuidedScenario[]}
 */
export function listGuidedScenarios() {
  return [GUIDED_EXHIBITION_01];
}

/**
 * Get a guided scenario by ID.
 * @param {string} id
 * @returns {import('./guided-types.mjs').GuidedScenario|null}
 */
export function getGuidedScenario(id) {
  return listGuidedScenarios().find((s) => s.id === id) ?? null;
}
