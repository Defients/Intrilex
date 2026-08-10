// ═══════════════════════════════════════════════════════════════
// constants.mjs — Achievement system constants and enums
// Self-contained: no workspace imports. Isomorphic for browser transport.
// ═══════════════════════════════════════════════════════════════

/** @typedef {('COMMON'|'CLEVER'|'RARE'|'INTRILEX')} Rarity */
/** @typedef {('FIRST_STEPS'|'CORE_SYSTEMS'|'STACK_COUNTERPLAY'|'CARD_MASTERY'|'TACTICAL_WINS'|'PLAYSTYLE'|'PROGRESSION')} AchievementCategory */
/** @typedef {('BOOLEAN'|'COUNTER'|'SET'|'COMPOSITE')} ProgressType */
/** @typedef {('LOCAL_AUTHORITY'|'NETWORK_AUTHORITY'|'LEGACY_MIGRATION')} Provenance */

/** @enum {Rarity} */
export const RARITY = Object.freeze({
  COMMON: 'COMMON',
  CLEVER: 'CLEVER',
  RARE: 'RARE',
  INTRILEX: 'INTRILEX',
});

/** @enum {AchievementCategory} */
export const CATEGORY = Object.freeze({
  FIRST_STEPS: 'FIRST_STEPS',
  CORE_SYSTEMS: 'CORE_SYSTEMS',
  STACK_COUNTERPLAY: 'STACK_COUNTERPLAY',
  CARD_MASTERY: 'CARD_MASTERY',
  TACTICAL_WINS: 'TACTICAL_WINS',
  PLAYSTYLE: 'PLAYSTYLE',
  PROGRESSION: 'PROGRESSION',
});

/** @enum {ProgressType} */
export const PROGRESS_TYPE = Object.freeze({
  BOOLEAN: 'BOOLEAN',
  COUNTER: 'COUNTER',
  SET: 'SET',
  COMPOSITE: 'COMPOSITE',
});

/** @enum {Provenance} */
export const PROVENANCE = Object.freeze({
  LOCAL_AUTHORITY: 'LOCAL_AUTHORITY',
  NETWORK_AUTHORITY: 'NETWORK_AUTHORITY',
  LEGACY_MIGRATION: 'LEGACY_MIGRATION',
});

/** Achievement Points per rarity tier. */
export const AP_BY_RARITY = Object.freeze({
  COMMON: 10,
  CLEVER: 20,
  RARE: 40,
  INTRILEX: 75,
});

/** Rarity display symbols (not color-only encoding). */
export const RARITY_SYMBOL = Object.freeze({
  COMMON: '●',
  CLEVER: '◆',
  RARE: '✦',
  INTRILEX: '✧',
});

/** Launch distribution constraints. */
export const LAUNCH_CONSTRAINTS = Object.freeze({
  TOTAL_ACHIEVEMENTS: 56,
  COMMON_COUNT: 22,
  CLEVER_COUNT: 20,
  RARE_COUNT: 10,
  INTRILEX_COUNT: 4,
  HIDDEN_COUNT: 4,
  TOTAL_AP: 1320,
});

/** Hidden achievement IDs at launch. */
export const HIDDEN_ACHIEVEMENT_IDS = Object.freeze([
  'the-stackening',
  'recursive-seven',
  'plan-b-was-plan-a',
  'black-magic',
]);

/** Achievement schema version. */
export const ACHIEVEMENT_SCHEMA_VERSION = '1.0.0';

/** Catalog version. */
export const CATALOG_VERSION = '1.0.0';

/** Product version at achievement system launch. */
export const ACHIEVEMENT_PRODUCT_VERSION = '0.24.2';

/** Rules version at achievement system launch. */
export const ACHIEVEMENT_RULES_VERSION = '4.3.1';

/** Engine version at achievement system launch. */
export const ACHIEVEMENT_ENGINE_VERSION = '4.2.6';

// ── Fact Kinds ──────────────────────────────────────────────────

/** @enum {string} */
export const FACT_KIND = Object.freeze({
  MATCH_STARTED: 'MATCH_STARTED',
  MATCH_COMPLETED: 'MATCH_COMPLETED',
  FULL_TURN_STARTED: 'FULL_TURN_STARTED',
  FULL_TURN_ENDED: 'FULL_TURN_ENDED',
  ACTION_DECLARED: 'ACTION_DECLARED',
  ACTION_RESOLVED: 'ACTION_RESOLVED',
  ACTION_COUNTERED: 'ACTION_COUNTERED',
  ACTION_CANCELED: 'ACTION_CANCELED',
  CARD_PLAYED_FOR_POINTS: 'CARD_PLAYED_FOR_POINTS',
  CARD_PLAYED_FOR_EFFECT: 'CARD_PLAYED_FOR_EFFECT',
  POINTS_CHANGED: 'POINTS_CHANGED',
  RESPONSE_PLAYED: 'RESPONSE_PLAYED',
  INTERRUPT_PLAYED: 'INTERRUPT_PLAYED',
  STACK_OBJECT_ADDED: 'STACK_OBJECT_ADDED',
  STACK_OBJECT_REMOVED: 'STACK_OBJECT_REMOVED',
  STACK_RESOLVED: 'STACK_RESOLVED',
  CARD_MOVED: 'CARD_MOVED',
  ZONE_INTERACTED: 'ZONE_INTERACTED',
  SWAP_USED: 'SWAP_USED',
  ANCHOR_ESTABLISHED: 'ANCHOR_ESTABLISHED',
  ANCHOR_REMOVED: 'ANCHOR_REMOVED',
  SUPER_DECLARED: 'SUPER_DECLARED',
  SUPER_RESOLVED: 'SUPER_RESOLVED',
  SPADES_EFFECT_DECLARED: 'SPADES_EFFECT_DECLARED',
  SPADES_EFFECT_RESOLVED: 'SPADES_EFFECT_RESOLVED',
  SEVEN_SCORING_TRIGGER_RESOLVED: 'SEVEN_SCORING_TRIGGER_RESOLVED',
  SEVEN_REVEAL_RESOLVED: 'SEVEN_REVEAL_RESOLVED',
  GENERATED_PLAY_RESOLVED: 'GENERATED_PLAY_RESOLVED',
  QUEENS_COURT_ESTABLISHED: 'QUEENS_COURT_ESTABLISHED',
  MATCH_STATE_CHECKPOINT: 'MATCH_STATE_CHECKPOINT',
});

// ── Eligibility Scopes ──────────────────────────────────────────

/** @enum {string} */
export const ELIGIBILITY_SCOPE = Object.freeze({
  /** Qualifying genuine duel (Local vs AI or Online Direct Duel). */
  QUALIFYING_DUEL: 'QUALIFYING_DUEL',
  /** Tutorial match allowed if canonical engine is used. */
  TUTORIAL_ALLOWED: 'TUTORIAL_ALLOWED',
  /** Only genuine competitive duels — no tutorial. */
  COMPETITIVE_ONLY: 'COMPETITIVE_ONLY',
});

// ── Zone Constants (launch set, version-pinned) ─────────────────

/** Canonical zone identifiers used by achievement detection. */
export const ZONE = Object.freeze({
  HAND: 'HAND',
  POINT_ROW: 'PR',
  ENDURING_ROW: 'ER',
  DRAW_PILE: 'DP',
  GRAVEYARD: 'GY',
  EXILE: 'EXILE',
  SWAP_BAR: 'SWAP_BAR',
  STACK: 'ON_STACK',
});

/** Launch zone set for "Know the Table" — version-pinned. Future zones must not revoke. */
export const LAUNCH_ZONE_SET = Object.freeze([
  ZONE.HAND,
  ZONE.POINT_ROW,
  ZONE.ENDURING_ROW,
  ZONE.DRAW_PILE,
  ZONE.GRAVEYARD,
  ZONE.EXILE,
  ZONE.SWAP_BAR,
  ZONE.STACK,
]);

/** Zones for "Clean Sweep" — single match interaction. */
export const CLEAN_SWEEP_ZONES = Object.freeze([
  ZONE.DRAW_PILE,
  ZONE.GRAVEYARD,
  ZONE.EXILE,
  ZONE.SWAP_BAR,
]);

// ── Spades Effect Identity (launch set, version-pinned) ─────────

/**
 * Canonical Spades effect identities for "Spades Scholar".
 * Version-pinned at launch. Future Spades effects must not revoke earned achievement.
 * Derived from engine event types and rank definitions.
 */
export const LAUNCH_SPADES_EFFECTS = Object.freeze([
  'A_SPADE_COUNTER',        // A♠ — exiles target effect
  'SEVEN_SPADE_TOPDECK',    // 7♠ — Spade topdeck variant
  'EIGHT_SPADE_SCUTTLE',    // 8♠ — free scuttle
  'KING_SPADE_WILD',        // K♠ — Wild Sovereignty (copies 3-7♠)
  'TEN_SPADE_STACK_THEFT',  // 10♠ — Stack Theft
  'SUPER_ACE_SPADE',        // Super A♠ counter
  'SUPER_SEVEN_SPADE',      // Super 7♠ topdeck
]);

/** Count of launch Spades effects for progress display. */
export const LAUNCH_SPADES_EFFECT_COUNT = LAUNCH_SPADES_EFFECTS.length;

// ── Card Mastery Achievement IDs (for Card Savant composite) ────

/** Launch card/rank mastery achievement IDs — prerequisites for Card Savant. */
export const CARD_MASTERY_ACHIEVEMENT_IDS = Object.freeze([
  'lucky-seven',
  'topdeck-sorcery',
  'found-money',
  'recursive-seven',
  'seven-heaven',
  'queens-court',
  'ace-in-the-hole',
  'super-authority',
  'stack-theft',
  'wild-card',
]);
