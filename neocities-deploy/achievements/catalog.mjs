// ═══════════════════════════════════════════════════════════════
// catalog.mjs — The 56 launch achievement definitions
// Single source of truth. No duplicate definitions anywhere else.
// Self-contained: no workspace imports. Isomorphic for browser transport.
// ═══════════════════════════════════════════════════════════════

import {
  RARITY,
  CATEGORY,
  PROGRESS_TYPE,
  ELIGIBILITY_SCOPE,
  AP_BY_RARITY,
  ACHIEVEMENT_SCHEMA_VERSION,
  CATALOG_VERSION,
  ACHIEVEMENT_PRODUCT_VERSION,
  ACHIEVEMENT_RULES_VERSION,
  CARD_MASTERY_ACHIEVEMENT_IDS,
} from './constants.mjs';

/**
 * @typedef {Object} AchievementDefinition
 * @property {string} id - Stable immutable identifier
 * @property {string} name - Display name (can change without breaking persistence)
 * @property {string} description - Player-facing description
 * @property {boolean} hidden - Hidden until unlocked
 * @property {string} category - One of CATEGORY enum
 * @property {string} rarity - One of RARITY enum
 * @property {number} achievementPoints - AP value (derived from rarity but explicit)
 * @property {string} progressType - One of PROGRESS_TYPE enum
 * @property {number} [progressTarget] - Target for COUNTER type
 * @property {string} eligibilityScope - One of ELIGIBILITY_SCOPE enum
 * @property {string} iconKey - Icon identifier for UI
 * @property {string} introducedProductVersion - Product version when introduced
 * @property {string} introducedRulesVersion - Rules version when introduced
 * @property {string[]} [prerequisiteAchievementIds] - Prerequisites for COMPOSITE
 * @property {string[]} [legacyAliases] - Legacy badge IDs for migration
 * @property {string} schemaVersion - Achievement schema version
 * @property {string} catalogVersion - Catalog version
 */

/** @returns {AchievementDefinition[]} */
export function buildCatalog() {
  const PV = ACHIEVEMENT_PRODUCT_VERSION;
  const RV = ACHIEVEMENT_RULES_VERSION;
  const SV = ACHIEVEMENT_SCHEMA_VERSION;
  const CV = CATALOG_VERSION;

  /** @param {string} rarity @returns {number} */
  const ap = (rarity) => AP_BY_RARITY[/** @type {keyof typeof AP_BY_RARITY} */ (rarity)];

  const defs = [
    // ═══════════════════════════════════════════════════════════
    // CATEGORY A — FIRST_STEPS
    // ═══════════════════════════════════════════════════════════

    {
      id: 'welcome-to-intrilex', name: 'Welcome to Intrilex',
      description: 'Complete your first qualifying duel.',
      hidden: false, category: CATEGORY.FIRST_STEPS, rarity: RARITY.COMMON,
      achievementPoints: ap(RARITY.COMMON), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.COMPETITIVE_ONLY, iconKey: 'welcome',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'first-blood', name: 'First Blood',
      description: 'Score your first Points.',
      hidden: false, category: CATEGORY.FIRST_STEPS, rarity: RARITY.COMMON,
      achievementPoints: ap(RARITY.COMMON), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.TUTORIAL_ALLOWED, iconKey: 'first-blood',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'twenty-one', name: 'Twenty-One',
      description: 'Win a duel with at least 21 Points.',
      hidden: false, category: CATEGORY.FIRST_STEPS, rarity: RARITY.COMMON,
      achievementPoints: ap(RARITY.COMMON), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.COMPETITIVE_ONLY, iconKey: 'twenty-one',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'exactly-enough', name: 'Exactly Enough',
      description: 'Win with exactly 21 Points.',
      hidden: false, category: CATEGORY.FIRST_STEPS, rarity: RARITY.CLEVER,
      achievementPoints: ap(RARITY.CLEVER), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.COMPETITIVE_ONLY, iconKey: 'exactly-enough',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'read-the-card', name: 'Read the Card',
      description: 'Play a card for its Effect.',
      hidden: false, category: CATEGORY.FIRST_STEPS, rarity: RARITY.COMMON,
      achievementPoints: ap(RARITY.COMMON), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.TUTORIAL_ALLOWED, iconKey: 'read-the-card',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'other-side-of-the-card', name: 'Other Side of the Card',
      description: 'Use the same Rank for Points and Effect across your career.',
      hidden: false, category: CATEGORY.FIRST_STEPS, rarity: RARITY.CLEVER,
      achievementPoints: ap(RARITY.CLEVER), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'other-side',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'the-stack-exists', name: 'The Stack Exists',
      description: 'Play your first legal response.',
      hidden: false, category: CATEGORY.FIRST_STEPS, rarity: RARITY.COMMON,
      achievementPoints: ap(RARITY.COMMON), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.TUTORIAL_ALLOWED, iconKey: 'stack-exists',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'not-so-fast', name: 'Not So Fast',
      description: 'Successfully use an Interrupt.',
      hidden: false, category: CATEGORY.FIRST_STEPS, rarity: RARITY.RARE,
      achievementPoints: ap(RARITY.RARE), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'not-so-fast',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'miniature-warfare', name: 'Miniature Warfare',
      description: 'Take your first Mini-Turn.',
      hidden: false, category: CATEGORY.FIRST_STEPS, rarity: RARITY.COMMON,
      achievementPoints: ap(RARITY.COMMON), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.TUTORIAL_ALLOWED, iconKey: 'miniature-warfare',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'no-longer-new', name: 'No Longer New',
      description: 'Win 5 qualifying duels.',
      hidden: false, category: CATEGORY.FIRST_STEPS, rarity: RARITY.COMMON,
      achievementPoints: ap(RARITY.COMMON), progressType: PROGRESS_TYPE.COUNTER,
      progressTarget: 5,
      eligibilityScope: ELIGIBILITY_SCOPE.COMPETITIVE_ONLY, iconKey: 'no-longer-new',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
      legacyAliases: ['first-victory'],
    },

    // ═══════════════════════════════════════════════════════════
    // CATEGORY B — CORE_SYSTEMS
    // ═══════════════════════════════════════════════════════════

    {
      id: 'fair-trade', name: 'Fair Trade',
      description: 'Use the Swap Bar.',
      hidden: false, category: CATEGORY.CORE_SYSTEMS, rarity: RARITY.COMMON,
      achievementPoints: ap(RARITY.COMMON), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.TUTORIAL_ALLOWED, iconKey: 'fair-trade',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'upgrade', name: 'Upgrade',
      description: 'Win using a card acquired from the Swap Bar.',
      hidden: false, category: CATEGORY.CORE_SYSTEMS, rarity: RARITY.CLEVER,
      achievementPoints: ap(RARITY.CLEVER), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'upgrade',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'gone-forever', name: 'Gone Forever',
      description: 'Cause your first card to enter Exile.',
      hidden: false, category: CATEGORY.CORE_SYSTEMS, rarity: RARITY.COMMON,
      achievementPoints: ap(RARITY.COMMON), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'gone-forever',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'drop-anchor', name: 'Drop Anchor',
      description: 'Establish your first Anchor.',
      hidden: false, category: CATEGORY.CORE_SYSTEMS, rarity: RARITY.COMMON,
      achievementPoints: ap(RARITY.COMMON), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.TUTORIAL_ALLOWED, iconKey: 'drop-anchor',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'hold-fast', name: 'Hold Fast',
      description: 'Keep an Anchor active through an opponent\'s Full Turn.',
      hidden: false, category: CATEGORY.CORE_SYSTEMS, rarity: RARITY.CLEVER,
      achievementPoints: ap(RARITY.CLEVER), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'hold-fast',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'supercharged', name: 'Supercharged',
      description: 'Declare your first Super.',
      hidden: false, category: CATEGORY.CORE_SYSTEMS, rarity: RARITY.COMMON,
      achievementPoints: ap(RARITY.COMMON), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.TUTORIAL_ALLOWED, iconKey: 'supercharged',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
      legacyAliases: ['supercharged'],
    },
    {
      id: 'two-become-one', name: 'Two Become One',
      description: 'Successfully resolve a Super play.',
      hidden: false, category: CATEGORY.CORE_SYSTEMS, rarity: RARITY.CLEVER,
      achievementPoints: ap(RARITY.CLEVER), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'two-become-one',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'digging-deeper', name: 'Digging Deeper',
      description: 'Successfully use your first Spades effect.',
      hidden: false, category: CATEGORY.CORE_SYSTEMS, rarity: RARITY.COMMON,
      achievementPoints: ap(RARITY.COMMON), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.TUTORIAL_ALLOWED, iconKey: 'digging-deeper',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'clean-sweep', name: 'Clean Sweep',
      description: 'Interact with Draw, Discard, Exile, and Swap during one duel.',
      hidden: false, category: CATEGORY.CORE_SYSTEMS, rarity: RARITY.CLEVER,
      achievementPoints: ap(RARITY.CLEVER), progressType: PROGRESS_TYPE.SET,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'clean-sweep',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'know-the-table', name: 'Know the Table',
      description: 'Interact with every major gameplay zone across your career.',
      hidden: false, category: CATEGORY.CORE_SYSTEMS, rarity: RARITY.CLEVER,
      achievementPoints: ap(RARITY.CLEVER), progressType: PROGRESS_TYPE.SET,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'know-the-table',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },

    // ═══════════════════════════════════════════════════════════
    // CATEGORY C — STACK_COUNTERPLAY
    // ═══════════════════════════════════════════════════════════

    {
      id: 'stack-student', name: 'Stack Student',
      description: 'Successfully resolve your first response sequence.',
      hidden: false, category: CATEGORY.STACK_COUNTERPLAY, rarity: RARITY.COMMON,
      achievementPoints: ap(RARITY.COMMON), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'stack-student',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'denied', name: 'Denied',
      description: 'Stop an opponent\'s play that would have immediately produced a winning state.',
      hidden: false, category: CATEGORY.STACK_COUNTERPLAY, rarity: RARITY.RARE,
      achievementPoints: ap(RARITY.RARE), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'denied',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'double-denied', name: 'Double Denied',
      description: 'Counter an opponent\'s response.',
      hidden: false, category: CATEGORY.STACK_COUNTERPLAY, rarity: RARITY.CLEVER,
      achievementPoints: ap(RARITY.CLEVER), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'double-denied',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'nope-three', name: 'Nope³',
      description: 'Participate in a response chain at least three layers deep.',
      hidden: false, category: CATEGORY.STACK_COUNTERPLAY, rarity: RARITY.CLEVER,
      achievementPoints: ap(RARITY.CLEVER), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'nope-three',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'the-stackening', name: 'The Stackening',
      description: 'Resolve a stack containing at least 5 meaningful objects.',
      hidden: true, category: CATEGORY.STACK_COUNTERPLAY, rarity: RARITY.INTRILEX,
      achievementPoints: ap(RARITY.INTRILEX), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'the-stackening',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'perfect-timing', name: 'Perfect Timing',
      description: 'Use an Interrupt as the final non-decline response before a response window closes.',
      hidden: false, category: CATEGORY.STACK_COUNTERPLAY, rarity: RARITY.CLEVER,
      achievementPoints: ap(RARITY.CLEVER), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'perfect-timing',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'sequence-breaker', name: 'Sequence Breaker',
      description: 'Stop a multi-step Effect before its intended payoff completes.',
      hidden: false, category: CATEGORY.STACK_COUNTERPLAY, rarity: RARITY.RARE,
      achievementPoints: ap(RARITY.RARE), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'sequence-breaker',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'clean-kill', name: 'Clean Kill',
      description: 'Win on a resolution that leaves no unresolved stack objects.',
      hidden: false, category: CATEGORY.STACK_COUNTERPLAY, rarity: RARITY.CLEVER,
      achievementPoints: ap(RARITY.CLEVER), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.COMPETITIVE_ONLY, iconKey: 'clean-kill',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },

    // ═══════════════════════════════════════════════════════════
    // CATEGORY D — CARD_MASTERY
    // ═══════════════════════════════════════════════════════════

    {
      id: 'lucky-seven', name: 'Lucky Seven',
      description: 'Score a Seven and resolve its scoring trigger.',
      hidden: false, category: CATEGORY.CARD_MASTERY, rarity: RARITY.COMMON,
      achievementPoints: ap(RARITY.COMMON), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'lucky-seven',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'topdeck-sorcery', name: 'Topdeck Sorcery',
      description: 'Immediately play a card revealed by Seven for Effect.',
      hidden: false, category: CATEGORY.CARD_MASTERY, rarity: RARITY.COMMON,
      achievementPoints: ap(RARITY.COMMON), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'topdeck-sorcery',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'found-money', name: 'Found Money',
      description: 'Immediately score a card revealed by Seven for Points.',
      hidden: false, category: CATEGORY.CARD_MASTERY, rarity: RARITY.COMMON,
      achievementPoints: ap(RARITY.COMMON), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'found-money',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'recursive-seven', name: 'Recursive Seven',
      description: 'Have a Seven-generated reveal produce another Seven interaction.',
      hidden: true, category: CATEGORY.CARD_MASTERY, rarity: RARITY.INTRILEX,
      achievementPoints: ap(RARITY.INTRILEX), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'recursive-seven',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'seven-heaven', name: 'Seven Heaven',
      description: 'Resolve at least 3 Seven-related plays or triggers during one Full Turn.',
      hidden: false, category: CATEGORY.CARD_MASTERY, rarity: RARITY.CLEVER,
      achievementPoints: ap(RARITY.CLEVER), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'seven-heaven',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'queens-court', name: 'Queen\'s Court',
      description: 'Successfully establish Queen\'s Court.',
      hidden: false, category: CATEGORY.CARD_MASTERY, rarity: RARITY.COMMON,
      achievementPoints: ap(RARITY.COMMON), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'queens-court',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'ace-in-the-hole', name: 'Ace in the Hole',
      description: 'Successfully counter an Effect using a normal Ace.',
      hidden: false, category: CATEGORY.CARD_MASTERY, rarity: RARITY.COMMON,
      achievementPoints: ap(RARITY.COMMON), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'ace-in-the-hole',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'super-authority', name: 'Super Authority',
      description: 'Stop an Effect using a Super Ace.',
      hidden: false, category: CATEGORY.CARD_MASTERY, rarity: RARITY.CLEVER,
      achievementPoints: ap(RARITY.CLEVER), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'super-authority',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'stack-theft', name: 'Stack Theft',
      description: 'Successfully resolve 10♠ Stack Theft.',
      hidden: false, category: CATEGORY.CARD_MASTERY, rarity: RARITY.RARE,
      achievementPoints: ap(RARITY.RARE), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'stack-theft',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'wild-card', name: 'Wild Card',
      description: 'Successfully use K♠ as another legal Spades effect.',
      hidden: false, category: CATEGORY.CARD_MASTERY, rarity: RARITY.CLEVER,
      achievementPoints: ap(RARITY.CLEVER), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'wild-card',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },

    // ═══════════════════════════════════════════════════════════
    // CATEGORY E — TACTICAL_WINS
    // ═══════════════════════════════════════════════════════════

    {
      id: 'photo-finish', name: 'Photo Finish',
      description: 'Win while your opponent finishes on exactly 20 Points.',
      hidden: false, category: CATEGORY.TACTICAL_WINS, rarity: RARITY.CLEVER,
      achievementPoints: ap(RARITY.CLEVER), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.COMPETITIVE_ONLY, iconKey: 'photo-finish',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'from-behind', name: 'From Behind',
      description: 'Win after trailing by at least 10 secured Points.',
      hidden: false, category: CATEGORY.TACTICAL_WINS, rarity: RARITY.RARE,
      achievementPoints: ap(RARITY.RARE), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.COMPETITIVE_ONLY, iconKey: 'from-behind',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
      legacyAliases: ['unshaken'],
    },
    {
      id: 'overkill', name: 'Overkill',
      description: 'Win with at least 30 Points.',
      hidden: false, category: CATEGORY.TACTICAL_WINS, rarity: RARITY.CLEVER,
      achievementPoints: ap(RARITY.CLEVER), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.COMPETITIVE_ONLY, iconKey: 'overkill',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'last-card-standing', name: 'Last Card Standing',
      description: 'Win with exactly 1 card remaining in hand.',
      hidden: false, category: CATEGORY.TACTICAL_WINS, rarity: RARITY.COMMON,
      achievementPoints: ap(RARITY.COMMON), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.COMPETITIVE_ONLY, iconKey: 'last-card-standing',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'empty-handed-victory', name: 'Empty-Handed Victory',
      description: 'Win with 0 cards remaining in hand.',
      hidden: false, category: CATEGORY.TACTICAL_WINS, rarity: RARITY.COMMON,
      achievementPoints: ap(RARITY.COMMON), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.COMPETITIVE_ONLY, iconKey: 'empty-handed-victory',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'plan-b-was-plan-a', name: 'Plan B Was Plan A',
      description: 'Win during a Full Turn after one of your own initiated plays was countered during that same Full Turn.',
      hidden: true, category: CATEGORY.TACTICAL_WINS, rarity: RARITY.INTRILEX,
      achievementPoints: ap(RARITY.INTRILEX), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.COMPETITIVE_ONLY, iconKey: 'plan-b-was-plan-a',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'turnabout', name: 'Turnabout',
      description: 'Start your Full Turn behind in Points and win before it ends.',
      hidden: false, category: CATEGORY.TACTICAL_WINS, rarity: RARITY.CLEVER,
      achievementPoints: ap(RARITY.CLEVER), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.COMPETITIVE_ONLY, iconKey: 'turnabout',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'no-shovel-required', name: 'No Shovel Required',
      description: 'Win without using a Spades Effect.',
      hidden: false, category: CATEGORY.TACTICAL_WINS, rarity: RARITY.COMMON,
      achievementPoints: ap(RARITY.COMMON), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.COMPETITIVE_ONLY, iconKey: 'no-shovel-required',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },

    // ═══════════════════════════════════════════════════════════
    // CATEGORY F — PLAYSTYLE
    // ═══════════════════════════════════════════════════════════

    {
      id: 'big-number-good', name: 'Big Number Good',
      description: 'Win while using cards overwhelmingly for Points.',
      hidden: false, category: CATEGORY.PLAYSTYLE, rarity: RARITY.CLEVER,
      achievementPoints: ap(RARITY.CLEVER), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.COMPETITIVE_ONLY, iconKey: 'big-number-good',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'reading-is-overpowered', name: 'Reading Is Overpowered',
      description: 'Win after successfully resolving at least 5 Effect plays.',
      hidden: false, category: CATEGORY.PLAYSTYLE, rarity: RARITY.CLEVER,
      achievementPoints: ap(RARITY.CLEVER), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.COMPETITIVE_ONLY, iconKey: 'reading-is-overpowered',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'controlled-chaos', name: 'Controlled Chaos',
      description: 'Resolve at least 3 Effects during one Full Turn and finish that turn with a positive Points delta.',
      hidden: false, category: CATEGORY.PLAYSTYLE, rarity: RARITY.CLEVER,
      achievementPoints: ap(RARITY.CLEVER), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'controlled-chaos',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'window-shopper', name: 'Window Shopper',
      description: 'Win without using the Swap Bar.',
      hidden: false, category: CATEGORY.PLAYSTYLE, rarity: RARITY.COMMON,
      achievementPoints: ap(RARITY.COMMON), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.COMPETITIVE_ONLY, iconKey: 'window-shopper',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'absolutely-excessive', name: 'Absolutely Excessive',
      description: 'Successfully resolve at least 3 Supers during one duel.',
      hidden: false, category: CATEGORY.PLAYSTYLE, rarity: RARITY.RARE,
      achievementPoints: ap(RARITY.RARE), progressType: PROGRESS_TYPE.COUNTER,
      progressTarget: 3,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'absolutely-excessive',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'black-magic', name: 'Black Magic',
      description: 'Successfully resolve multiple different Spades effects during one Full Turn.',
      hidden: true, category: CATEGORY.PLAYSTYLE, rarity: RARITY.INTRILEX,
      achievementPoints: ap(RARITY.INTRILEX), progressType: PROGRESS_TYPE.BOOLEAN,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'black-magic',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },

    // ═══════════════════════════════════════════════════════════
    // CATEGORY G — PROGRESSION
    // ═══════════════════════════════════════════════════════════

    {
      id: 'getting-dangerous', name: 'Getting Dangerous',
      description: 'Win 25 qualifying duels.',
      hidden: false, category: CATEGORY.PROGRESSION, rarity: RARITY.RARE,
      achievementPoints: ap(RARITY.RARE), progressType: PROGRESS_TYPE.COUNTER,
      progressTarget: 25,
      eligibilityScope: ELIGIBILITY_SCOPE.COMPETITIVE_ONLY, iconKey: 'getting-dangerous',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'intrilexian', name: 'Intrilexian',
      description: 'Win 100 qualifying duels.',
      hidden: false, category: CATEGORY.PROGRESSION, rarity: RARITY.RARE,
      achievementPoints: ap(RARITY.RARE), progressType: PROGRESS_TYPE.COUNTER,
      progressTarget: 100,
      eligibilityScope: ELIGIBILITY_SCOPE.COMPETITIVE_ONLY, iconKey: 'intrilexian',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'spades-scholar', name: 'Spades Scholar',
      description: 'Successfully use every supported launch Spades effect.',
      hidden: false, category: CATEGORY.PROGRESSION, rarity: RARITY.RARE,
      achievementPoints: ap(RARITY.RARE), progressType: PROGRESS_TYPE.SET,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'spades-scholar',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
    },
    {
      id: 'card-savant', name: 'Card Savant',
      description: 'Complete the launch Card/Rank Mastery collection.',
      hidden: false, category: CATEGORY.PROGRESSION, rarity: RARITY.RARE,
      achievementPoints: ap(RARITY.RARE), progressType: PROGRESS_TYPE.COMPOSITE,
      eligibilityScope: ELIGIBILITY_SCOPE.QUALIFYING_DUEL, iconKey: 'card-savant',
      introducedProductVersion: PV, introducedRulesVersion: RV, schemaVersion: SV, catalogVersion: CV,
      prerequisiteAchievementIds: [...CARD_MASTERY_ACHIEVEMENT_IDS],
    },
  ];

  return defs;
}

// ── Cached catalog (built once) ─────────────────────────────────

/** @type {AchievementDefinition[]|null} */
let _catalog = null;
/** @type {Map<string, AchievementDefinition>|null} */
let _catalogById = null;

/** @returns {AchievementDefinition[]} */
export function getCatalog() {
  if (!_catalog) _catalog = buildCatalog();
  return _catalog;
}

/** @returns {Map<string, AchievementDefinition>} */
export function getCatalogById() {
  if (!_catalogById) {
    _catalogById = new Map(getCatalog().map(d => [d.id, d]));
  }
  return _catalogById;
}

/** @param {string} id @returns {AchievementDefinition|undefined} */
export function getDefinition(id) {
  return getCatalogById().get(id);
}

/** @returns {string[]} */
export function getAllIds() {
  return getCatalog().map(d => d.id);
}
