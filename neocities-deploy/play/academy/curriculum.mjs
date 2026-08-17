// ═══════════════════════════════════════════════════════════════
// curriculum.mjs — Academy 2.0 tiered lesson definitions
//
// Canonical lesson + scenario data model. Phase-1 ready (lessons launch
// real seeded matches with the new UX layer). The shape is Phase-3-ready:
// `scenario.setupCommands`, `steps` (coachmark triggers), and `adaptation`
// are declared as optional fields with stable contracts so Phase 2/3 can
// fill them in WITHOUT changing the data model or call sites.
//
// Scenario construction contract (validated against puzzle-runtime.mjs):
//   setupCommands are canonical engine command objects of shape
//     { id, type, actorId, action: { kind, ... } }
//   reconstructed via reconstructInitialState(profileId, seed, setupCommands)
//   which interleaves advanceCoreToDecision before each player command.
//   Phase 2 will author the smallest valid setupCommands per scripted
//   lesson and verify each reconstructs through the real engine.
//
// No engine changes. All lessons use first-contact-trigger-closure.
// ═══════════════════════════════════════════════════════════════

/**
 * Scenario type — controls how the lesson's match is constructed.
 * - 'scripted':      exact setup + scripted AI (Tiers 1-2, Phase 2)
 * - 'semi-scripted': exact setup + real AI policy (Tier 2 later, Phase 2)
 * - 'seeded':        deterministic seed + real AI (Tier 3, Phase 1 default)
 * - 'open':          normal match with guidance (Tier 3 graduation, Phase 2+)
 * @enum {string}
 */
export const ScenarioType = Object.freeze({
  SCRIPTED: 'scripted',
  SEMI_SCRIPTED: 'semi-scripted',
  SEEDED: 'seeded',
  OPEN: 'open',
});

/**
 * Completion mode — how a lesson is judged complete.
 * - 'objectives':        all requiredObjectives met (Phase 2+)
 * - 'win':               human player wins the match (Phase 1 default)
 * - 'objectives-and-win': both (graduation, Phase 3)
 * @enum {string}
 */
export const CompletionMode = Object.freeze({
  OBJECTIVES: 'objectives',
  WIN: 'win',
  OBJECTIVES_AND_WIN: 'objectives-and-win',
});

/**
 * Tier identifiers. Order matters for unlock logic — a tier unlocks when
 * the previous tier is completed (all its lessons completed).
 * @enum {string}
 */
export const TierId = Object.freeze({
  FOUNDATIONS: 'foundations',
  MECHANICS: 'mechanics',
  APPLIED: 'applied',
});

/** @type {{ id: string, name: string, order: number }[]} */
export const TIERS = [
  { id: TierId.FOUNDATIONS, name: 'Foundations', order: 0 },
  { id: TierId.MECHANICS, name: 'Mechanics', order: 1 },
  { id: TierId.APPLIED, name: 'Applied Play', order: 2 },
];

/**
 * Map of legacy v1 lesson IDs → v2 lesson IDs for progress migration.
 * v1 IDs are the flat-array keys from academy-renderer.mjs (Academy 1.0).
 */
export const V1_TO_V2_LESSON_MAP = Object.freeze({
  'draw-and-score': 'foundations-01-draw',
  'card-effects': 'mechanics-01-scuttle',
  'respond-and-counter': 'mechanics-04-respond',
  'royal-cards': 'applied-01-royals',
  'win-the-game': 'applied-03-graduation',
});

/**
 * Derive a deterministic numeric seed from a lesson ID string.
 * The engine coerces string seeds to 0 via `>>> 0`, so each lesson must
 * produce a distinct positive integer to start from a different shuffle.
 * @param {string} lessonId
 * @returns {number}
 */
export function seedFromLessonId(lessonId) {
  let seed = 0;
  for (let i = 0; i < lessonId.length; i++) {
    seed = ((seed * 31) + lessonId.charCodeAt(i)) >>> 0;
  }
  return seed || 1;
}

/**
 * @typedef {Object} AcademyObjective
 * @property {string} id - Stable objective identifier (e.g. 'draw-card')
 * @property {string} label - Human-readable objective text
 */

/**
 * @typedef {Object} AcademyCoachmark
 * @property {string} target - CSS selector / data-testid key for the callout target
 * @property {string} text - Coachmark body text
 * @property {'top'|'bottom'|'left'|'right'} [position] - Preferred arrow side
 */

/**
 * @typedef {Object} AcademyStepTrigger
 * @property {'turn-start'|'action-detected'|'objective-pending'|'phase-enter'} type
 * @property {number} [turn] - turn number (turn-start)
 * @property {'human'|'ai'} [player] - actor (turn-start)
 * @property {string} [family] - action family (action-detected)
 * @property {'human'|'ai'} [actor] - actor (action-detected)
 * @property {string} [objectiveId] - objective id (objective-pending)
 * @property {string} [phase] - phase name (phase-enter)
 */

/**
 * @typedef {Object} AcademyStep
 * @property {string} id - Step identifier
 * @property {AcademyStepTrigger} trigger - When to show this step
 * @property {AcademyCoachmark} coachmark - Callout to display
 * @property {string} [objectiveId] - Objective this step satisfies
 */

/**
 * @typedef {Object} AcademyScenario
 * @property {string} type - ScenarioType
 * @property {object[]} [setupCommands] - Canonical engine commands (scripted/semi-scripted). Phase 2.
 * @property {number|null} seed - Deterministic seed (seeded/open)
 * @property {string} aiPolicyId - AI behavior policy id
 * @property {object[]|null} [aiScript] - Predetermined AI responses (scripted). Phase 2.
 * @property {string} profileId - Engine profile id (always first-contact-trigger-closure)
 */

/**
 * @typedef {Object} AcademyAdaptation
 * @property {number} hintThreshold - Attempts before stronger hint
 * @property {number} masteryReps - Times to demonstrate the mechanic
 * @property {boolean} reduceGuidanceAfterMastery
 * @property {boolean} allowUndo - Early lessons allow undo
 * @property {{ detector: string, hint: string }[]} [mistakeHints] - Phase 3
 */

/**
 * @typedef {Object} AcademyBriefing
 * @property {string} concept - One-sentence concept
 * @property {string} keyRule - One-sentence key rule
 * @property {AcademyObjective[]} objectives - Objectives shown pre-match
 * @property {string|null} [visualHint] - Optional card/zone highlight key
 */

/**
 * @typedef {Object} AcademyRecap
 * @property {string} takeaway - Key takeaway sentence
 * @property {string} nextPreview - Preview of the next lesson
 */

/**
 * @typedef {Object} AcademyLesson
 * @property {string} id - Stable lesson identifier
 * @property {string} tier - TierId
 * @property {number} tierOrder - Order within tier (0-based)
 * @property {number} lessonOrder - Global order across all tiers (0-based)
 * @property {string} title - Display title
 * @property {string} icon - Emoji icon
 * @property {string} summary - Short description (hub card)
 * @property {AcademyBriefing} briefing - Pre-lesson briefing screen content
 * @property {AcademyScenario} scenario - Match construction config
 * @property {AcademyStep[]} [steps] - In-match guidance steps (Phase 2)
 * @property {{ mode: string, requiredObjectives: string[] }} completion - Completion criteria
 * @property {AcademyAdaptation} [adaptation] - Adaptive feedback config (Phase 3)
 * @property {AcademyRecap} recap - Post-lesson recap content
 */

/**
 * The canonical curriculum. 10 lessons across 3 tiers.
 *
 * Phase 1: every lesson uses ScenarioType.SEEDED with a deterministic
 * seed derived from its id. `steps` and `adaptation` are declared but
 * empty/optional — Phase 2 fills `steps` + `scenario.setupCommands`/
 * `aiScript`, Phase 3 fills `adaptation`.
 *
 * @type {AcademyLesson[]}
 */
export const CURRICULUM = [
  // ── Tier 1: Foundations ──────────────────────────────────────
  {
    id: 'foundations-01-draw',
    tier: TierId.FOUNDATIONS,
    tierOrder: 0,
    lessonOrder: 0,
    title: 'Draw & Score',
    icon: '🎴',
    summary: 'Learn the core loop: draw a card, play it for points.',
    briefing: {
      concept: 'Every turn, you draw a card and can play it for points equal to its rank.',
      keyRule: 'Your Influence goal is 21. Reach it before your opponent.',
      objectives: [
        { id: 'draw-card', label: 'Draw a card from the Draw Pile' },
        { id: 'play-points', label: 'Play a card to your Point Row' },
        { id: 'reach-goal', label: 'Reach your Influence goal (21)' },
      ],
      visualHint: null,
    },
    scenario: {
      type: ScenarioType.SEEDED,
      setupCommands: null,
      seed: seedFromLessonId('foundations-01-draw'),
      aiPolicyId: 'score-rush',
      aiScript: null,
      profileId: 'first-contact-trigger-closure',
    },
    steps: [
      {
        id: 'draw-intro',
        trigger: { type: 'turn-start', turn: 1, player: 'human' },
        coachmark: {
          target: '[data-grid="piles"]',
          text: 'Welcome! Every turn starts by drawing a card. Click the Draw Pile to draw.',
          position: 'top',
        },
      },
      {
        id: 'play-points-intro',
        trigger: { type: 'action-detected', family: 'draw', actor: 'human' },
        coachmark: {
          target: '[data-grid="playerH"]',
          text: 'Now you have a card in hand. Select it and choose "Play for Points" to score it.',
          position: 'top',
        },
      },
      {
        id: 'reach-goal-nudge',
        trigger: { type: 'objective-pending', objectiveId: 'reach-goal' },
        coachmark: {
          target: '[data-testid="score-rail"]',
          text: 'Keep playing cards for points until your Influence reaches 21.',
          position: 'left',
        },
      },
    ],
    completion: { mode: CompletionMode.WIN, requiredObjectives: ['draw-card', 'play-points', 'reach-goal'] },
    adaptation: {
      hintThreshold: 2,
      masteryReps: 1,
      reduceGuidanceAfterMastery: true,
      allowUndo: true,
      mistakeHints: [],
    },
    recap: {
      takeaway: 'You now know the core loop: draw, play, score.',
      nextPreview: 'Next: Scoring & Point Row — anchor points so they cannot be removed.',
    },
  },
  {
    id: 'foundations-02-score',
    tier: TierId.FOUNDATIONS,
    tierOrder: 1,
    lessonOrder: 1,
    title: 'Scoring & Point Row',
    icon: '🎯',
    summary: 'Play cards to your Point Row and understand secured vs. temporary points.',
    briefing: {
      concept: 'Cards in your Point Row count their rank value toward your Influence.',
      keyRule: 'Most points are temporary — they can be removed by opponent effects.',
      objectives: [
        { id: 'play-to-point-row', label: 'Play a card to your Point Row' },
        { id: 'reach-half-goal', label: 'Reach 11 Influence (halfway)' },
        { id: 'win-match', label: 'Win the practice match' },
      ],
      visualHint: null,
    },
    scenario: {
      type: ScenarioType.SEEDED,
      setupCommands: null,
      seed: seedFromLessonId('foundations-02-score'),
      aiPolicyId: 'score-rush',
      aiScript: null,
      profileId: 'first-contact-trigger-closure',
    },
    steps: [],
    completion: { mode: CompletionMode.WIN, requiredObjectives: ['play-to-point-row', 'reach-half-goal', 'win-match'] },
    adaptation: {
      hintThreshold: 2,
      masteryReps: 1,
      reduceGuidanceAfterMastery: true,
      allowUndo: true,
      mistakeHints: [],
    },
    recap: {
      takeaway: 'Points live in your Point Row and count toward your Influence goal.',
      nextPreview: 'Next: Reaching the Goal — close out a short match.',
    },
  },
  {
    id: 'foundations-03-goal',
    tier: TierId.FOUNDATIONS,
    tierOrder: 2,
    lessonOrder: 2,
    title: 'Reaching the Goal',
    icon: '🏁',
    summary: 'Close out a short match by reaching your Influence goal of 21.',
    briefing: {
      concept: 'The first player to reach their Influence goal wins immediately.',
      keyRule: 'Plan your last few points carefully — the opponent is racing too.',
      objectives: [
        { id: 'reach-21', label: 'Reach 21 Influence' },
        { id: 'win-short-match', label: 'Win the short match' },
      ],
      visualHint: null,
    },
    scenario: {
      type: ScenarioType.SEEDED,
      setupCommands: null,
      seed: seedFromLessonId('foundations-03-goal'),
      aiPolicyId: 'score-rush',
      aiScript: null,
      profileId: 'first-contact-trigger-closure',
    },
    steps: [],
    completion: { mode: CompletionMode.WIN, requiredObjectives: ['reach-21', 'win-short-match'] },
    adaptation: {
      hintThreshold: 2,
      masteryReps: 1,
      reduceGuidanceAfterMastery: true,
      allowUndo: true,
      mistakeHints: [],
    },
    recap: {
      takeaway: 'Reaching your goal first wins the game — race, but watch the opponent.',
      nextPreview: 'Next: Full Turn Cycle — put the whole turn together.',
    },
  },
  {
    id: 'foundations-04-full-turn',
    tier: TierId.FOUNDATIONS,
    tierOrder: 3,
    lessonOrder: 3,
    title: 'Full Turn Cycle',
    icon: '🔄',
    summary: 'Put it together: draw → play → score → win a complete short match.',
    briefing: {
      concept: 'A full turn is draw, then choose to play for points or for an effect.',
      keyRule: 'Manage your hand — you only get one main action per turn.',
      objectives: [
        { id: 'complete-turns', label: 'Complete at least 4 full turns' },
        { id: 'win-full-match', label: 'Win the practice match' },
      ],
      visualHint: null,
    },
    scenario: {
      type: ScenarioType.SEEDED,
      setupCommands: null,
      seed: seedFromLessonId('foundations-04-full-turn'),
      aiPolicyId: 'random-legal',
      aiScript: null,
      profileId: 'first-contact-trigger-closure',
    },
    steps: [],
    completion: { mode: CompletionMode.WIN, requiredObjectives: ['complete-turns', 'win-full-match'] },
    adaptation: {
      hintThreshold: 2,
      masteryReps: 1,
      reduceGuidanceAfterMastery: true,
      allowUndo: true,
      mistakeHints: [],
    },
    recap: {
      takeaway: 'You can now play a complete match using the core loop.',
      nextPreview: 'Next tier: Mechanics — discover what special powers each rank has.',
    },
  },

  // ── Tier 2: Mechanics ────────────────────────────────────────
  {
    id: 'mechanics-01-scuttle',
    tier: TierId.MECHANICS,
    tierOrder: 0,
    lessonOrder: 4,
    title: 'Scuttle (7)',
    icon: '⚔️',
    summary: 'Play a 7 to remove an opponent\'s Point Row card.',
    briefing: {
      concept: 'A 7 played for its effect removes an opponent\'s Point Row card and its points.',
      keyRule: 'Scuttling sets the opponent back — tempo in your favor.',
      objectives: [
        { id: 'scuttle-opponent', label: 'Scuttle an opponent\'s Point Row card with a 7' },
        { id: 'win-after-scuttle', label: 'Win the practice match' },
      ],
      visualHint: null,
    },
    scenario: {
      type: ScenarioType.SEEDED,
      setupCommands: null,
      seed: seedFromLessonId('mechanics-01-scuttle'),
      aiPolicyId: 'control',
      aiScript: null,
      profileId: 'first-contact-trigger-closure',
    },
    steps: [
      {
        id: 'scuttle-intro',
        trigger: { type: 'turn-start', turn: 1, player: 'human' },
        coachmark: {
          target: '[data-grid="playerH"]',
          text: 'This lesson teaches the 7 (Scuttle). Look for a 7 in your hand — it removes an opponent\'s Point Row card.',
          position: 'top',
        },
      },
      {
        id: 'scuttle-nudge',
        trigger: { type: 'objective-pending', objectiveId: 'scuttle-opponent' },
        coachmark: {
          target: '[data-grid="enemyP"]',
          text: 'The opponent has cards in their Point Row. Play a 7 for its effect (not points) to scuttle one.',
          position: 'bottom',
        },
      },
    ],
    completion: { mode: CompletionMode.WIN, requiredObjectives: ['scuttle-opponent', 'win-after-scuttle'] },
    adaptation: {
      hintThreshold: 2,
      masteryReps: 1,
      reduceGuidanceAfterMastery: true,
      allowUndo: true,
      mistakeHints: [
        { detector: 'wasted-effect', hint: 'That 7 is worth more as a Scuttle effect than as points. Try playing it for its effect to remove an opponent\'s Point Row card.' },
      ],
    },
    recap: {
      takeaway: 'The 7 is your removal tool — use it to disrupt the opponent\'s board.',
      nextPreview: 'Next: Anchor (6) — permanent points that cannot be removed.',
    },
  },
  {
    id: 'mechanics-02-anchor',
    tier: TierId.MECHANICS,
    tierOrder: 1,
    lessonOrder: 5,
    title: 'Anchor (6)',
    icon: '⚓',
    summary: 'Play a 6 to anchor a card for permanent points.',
    briefing: {
      concept: 'A 6 played for its effect anchors a Point Row card — its points become permanent.',
      keyRule: 'Anchored points cannot be removed by scuttle or other effects.',
      objectives: [
        { id: 'anchor-card', label: 'Anchor a Point Row card with a 6' },
        { id: 'win-after-anchor', label: 'Win the practice match' },
      ],
      visualHint: null,
    },
    scenario: {
      type: ScenarioType.SEEDED,
      setupCommands: null,
      seed: seedFromLessonId('mechanics-02-anchor'),
      aiPolicyId: 'control',
      aiScript: null,
      profileId: 'first-contact-trigger-closure',
    },
    steps: [
      {
        id: 'anchor-intro',
        trigger: { type: 'turn-start', turn: 1, player: 'human' },
        coachmark: {
          target: '[data-grid="playerH"]',
          text: 'This lesson teaches the 6 (Anchor). Play a 6 for its effect to make a Point Row card\'s points permanent.',
          position: 'top',
        },
      },
      {
        id: 'anchor-nudge',
        trigger: { type: 'objective-pending', objectiveId: 'anchor-card' },
        coachmark: {
          target: '[data-grid="playerP"]',
          text: 'You have points in your Point Row. Play a 6 for its effect to anchor one — anchored points can\'t be removed!',
          position: 'top',
        },
      },
    ],
    completion: { mode: CompletionMode.WIN, requiredObjectives: ['anchor-card', 'win-after-anchor'] },
    adaptation: {
      hintThreshold: 2,
      masteryReps: 1,
      reduceGuidanceAfterMastery: true,
      allowUndo: true,
      mistakeHints: [
        { detector: 'wasted-effect', hint: 'That 6 is more valuable as an Anchor effect. Play it to make a Point Row card\'s points permanent — they can\'t be removed!' },
      ],
    },
    recap: {
      takeaway: 'Anchored points are safe — invest a 6 to lock in your lead.',
      nextPreview: 'Next: Swap (5) & Peek (4) — manipulate the swap bar and hidden info.',
    },
  },
  {
    id: 'mechanics-03-swap-peek',
    tier: TierId.MECHANICS,
    tierOrder: 2,
    lessonOrder: 6,
    title: 'Swap (5) & Peek (4)',
    icon: '🔀',
    summary: 'Play a 5 to swap the Swap Bar and a 4 to peek at face-down cards.',
    briefing: {
      concept: 'A 5 swaps the Swap Bar contents; a 4 lets you peek at a face-down card.',
      keyRule: 'Information and positioning — small effects that compound over a match.',
      objectives: [
        { id: 'play-swap', label: 'Play a 5 to swap the Swap Bar' },
        { id: 'play-peek', label: 'Play a 4 to peek at a face-down card' },
        { id: 'win-swap-peek', label: 'Win the practice match' },
      ],
      visualHint: null,
    },
    scenario: {
      type: ScenarioType.SEEDED,
      setupCommands: null,
      seed: seedFromLessonId('mechanics-03-swap-peek'),
      aiPolicyId: 'control',
      aiScript: null,
      profileId: 'first-contact-trigger-closure',
    },
    steps: [],
    completion: { mode: CompletionMode.WIN, requiredObjectives: ['play-swap', 'play-peek', 'win-swap-peek'] },
    adaptation: {
      hintThreshold: 2,
      masteryReps: 1,
      reduceGuidanceAfterMastery: true,
      allowUndo: true,
      mistakeHints: [],
    },
    recap: {
      takeaway: 'The 5 and 4 give you information and board control — subtle but strong.',
      nextPreview: 'Next: Respond & Counter — when the opponent acts, you can react.',
    },
  },
  {
    id: 'mechanics-04-respond',
    tier: TierId.MECHANICS,
    tierOrder: 3,
    lessonOrder: 7,
    title: 'Respond & Counter',
    icon: '↩️',
    summary: 'Master response windows: counter opponent actions or decline to pass.',
    briefing: {
      concept: 'When the opponent acts, a response window opens — you may counter or decline.',
      keyRule: 'Countering uses a matching rank from your hand; declining lets the action resolve.',
      objectives: [
        { id: 'recognize-response', label: 'Recognize when a response window opens' },
        { id: 'counter-action', label: 'Counter an opponent\'s action with a matching rank' },
        { id: 'decline-pass', label: 'Decline (pass priority) to let an action resolve' },
      ],
      visualHint: null,
    },
    scenario: {
      type: ScenarioType.SEEDED,
      setupCommands: null,
      seed: seedFromLessonId('mechanics-04-respond'),
      aiPolicyId: 'tempo',
      aiScript: null,
      profileId: 'first-contact-trigger-closure',
    },
    steps: [
      {
        id: 'respond-intro',
        trigger: { type: 'turn-start', turn: 1, player: 'human' },
        coachmark: {
          target: '[data-grid="stage"]',
          text: 'This lesson teaches response windows. When the opponent acts, a window opens — you can counter or decline.',
          position: 'bottom',
        },
      },
      {
        id: 'counter-nudge',
        trigger: { type: 'objective-pending', objectiveId: 'counter-action' },
        coachmark: {
          target: '[data-grid="stage"]',
          text: 'When a response window opens, choose to counter with a matching rank from your hand.',
          position: 'bottom',
        },
      },
      {
        id: 'decline-nudge',
        trigger: { type: 'objective-pending', objectiveId: 'decline-pass' },
        coachmark: {
          target: '[data-grid="stage"]',
          text: 'You can also decline (pass) to let the action resolve. Try declining when countering isn\'t worth it.',
          position: 'bottom',
        },
      },
    ],
    completion: { mode: CompletionMode.WIN, requiredObjectives: ['recognize-response', 'counter-action', 'decline-pass'] },
    adaptation: {
      hintThreshold: 2,
      masteryReps: 1,
      reduceGuidanceAfterMastery: true,
      allowUndo: true,
      mistakeHints: [
        { detector: 'no-response', hint: 'You keep declining response windows. Try countering with a matching rank — it can prevent the opponent\'s action from resolving.' },
      ],
    },
    recap: {
      takeaway: 'Response windows are your chance to disrupt — counter when it matters, decline when it doesn\'t.',
      nextPreview: 'Next tier: Applied Play — royals, combos, and graduation.',
    },
  },

  // ── Tier 3: Applied Play ─────────────────────────────────────
  {
    id: 'applied-01-royals',
    tier: TierId.APPLIED,
    tierOrder: 0,
    lessonOrder: 8,
    title: 'Royal Cards',
    icon: '♛',
    summary: 'Learn the Jack (Attach) and Queen (Ultra) — powerful commitment plays.',
    briefing: {
      concept: 'The Jack attaches to an opponent\'s Point Row card; the Queen unleashes a powerful Ultra effect.',
      keyRule: 'Royals use your full turn commitment — high impact, high investment.',
      objectives: [
        { id: 'play-jack', label: 'Play a Jack to attach to an opponent\'s Point Row card' },
        { id: 'play-queen', label: 'Play a Queen for a powerful Ultra effect' },
        { id: 'win-royals', label: 'Win the practice match' },
      ],
      visualHint: null,
    },
    scenario: {
      type: ScenarioType.SEEDED,
      setupCommands: null,
      seed: seedFromLessonId('applied-01-royals'),
      aiPolicyId: 'value',
      aiScript: null,
      profileId: 'first-contact-trigger-closure',
    },
    steps: [
      {
        id: 'royals-intro',
        trigger: { type: 'turn-start', turn: 1, player: 'human' },
        coachmark: {
          target: '[data-grid="playerH"]',
          text: 'Royals are powerful! The Jack attaches to an opponent\'s Point Row card; the Queen unleashes an Ultra effect.',
          position: 'top',
        },
      },
      {
        id: 'jack-nudge',
        trigger: { type: 'objective-pending', objectiveId: 'play-jack' },
        coachmark: {
          target: '[data-grid="enemyP"]',
          text: 'Look for a Jack in your hand. Play it for its effect to attach to an opponent\'s Point Row card.',
          position: 'bottom',
        },
      },
      {
        id: 'queen-nudge',
        trigger: { type: 'objective-pending', objectiveId: 'play-queen' },
        coachmark: {
          target: '[data-grid="playerH"]',
          text: 'Now look for a Queen. Play it for its Ultra effect — a powerful commitment play.',
          position: 'top',
        },
      },
    ],
    completion: { mode: CompletionMode.WIN, requiredObjectives: ['play-jack', 'play-queen', 'win-royals'] },
    adaptation: {
      hintThreshold: 2,
      masteryReps: 1,
      reduceGuidanceAfterMastery: true,
      allowUndo: false,
      mistakeHints: [],
    },
    recap: {
      takeaway: 'Royals are your heavy artillery — commit them when the impact justifies the turn.',
      nextPreview: 'Next: Combo Play — combine effects in a near-normal match.',
    },
  },
  {
    id: 'applied-02-combo',
    tier: TierId.APPLIED,
    tierOrder: 1,
    lessonOrder: 9,
    title: 'Combo Play',
    icon: '🧩',
    summary: 'Combine effects in a near-normal match with minimal guidance.',
    briefing: {
      concept: 'Real Intrilex play chains effects — scuttle, anchor, respond, royal — across turns.',
      keyRule: 'No single card wins; plan sequences that compound advantage.',
      objectives: [
        { id: 'use-two-effects', label: 'Use at least two different rank effects in the match' },
        { id: 'win-combo', label: 'Win the practice match' },
      ],
      visualHint: null,
    },
    scenario: {
      type: ScenarioType.SEEDED,
      setupCommands: null,
      seed: seedFromLessonId('applied-02-combo'),
      aiPolicyId: 'value',
      aiScript: null,
      profileId: 'first-contact-trigger-closure',
    },
    steps: [],
    completion: { mode: CompletionMode.WIN, requiredObjectives: ['use-two-effects', 'win-combo'] },
    adaptation: {
      hintThreshold: 3,
      masteryReps: 1,
      reduceGuidanceAfterMastery: true,
      allowUndo: false,
      mistakeHints: [],
    },
    recap: {
      takeaway: 'Combining effects across turns is how real games are won.',
      nextPreview: 'Next: Graduation — win a full practice match with minimal guidance.',
    },
  },
  {
    id: 'applied-03-graduation',
    tier: TierId.APPLIED,
    tierOrder: 2,
    lessonOrder: 10,
    title: 'Graduation',
    icon: '🏆',
    summary: 'Win a full practice match with minimal guidance to graduate the Academy.',
    briefing: {
      concept: 'Put everything together: draw, score, effects, responses, royals, combos.',
      keyRule: 'Win this match to graduate the Academy and unlock the full game.',
      objectives: [
        { id: 'demonstrate-draw', label: 'Demonstrate the core draw/play loop' },
        { id: 'demonstrate-effect', label: 'Use at least one rank effect' },
        { id: 'demonstrate-response', label: 'Make at least one response decision' },
        { id: 'win-graduation', label: 'Win the graduation match' },
      ],
      visualHint: null,
    },
    scenario: {
      type: ScenarioType.SEEDED,
      setupCommands: null,
      seed: seedFromLessonId('applied-03-graduation'),
      aiPolicyId: 'random-legal',
      aiScript: null,
      profileId: 'first-contact-trigger-closure',
    },
    steps: [],
    completion: { mode: CompletionMode.OBJECTIVES_AND_WIN, requiredObjectives: ['demonstrate-draw', 'demonstrate-effect', 'demonstrate-response', 'win-graduation'] },
    adaptation: {
      hintThreshold: 3,
      masteryReps: 1,
      reduceGuidanceAfterMastery: true,
      allowUndo: false,
      mistakeHints: [],
    },
    recap: {
      takeaway: 'You have graduated the Academy — you can play a complete game of Intrilex.',
      nextPreview: 'Try the Puzzle Ladder for tactical challenges, or jump into a real match.',
    },
  },
];

/**
 * Curriculum grouped by tier, preserving tier + lesson order.
 * @returns {{ id: string, name: string, order: number, lessons: AcademyLesson[] }[]}
 */
export function curriculumByTier() {
  return TIERS.map((t) => ({
    id: t.id,
    name: t.name,
    order: t.order,
    lessons: CURRICULUM
      .filter((l) => l.tier === t.id)
      .sort((a, b) => a.tierOrder - b.tierOrder),
  }));
}

/**
 * Find a lesson by id.
 * @param {string} lessonId
 * @returns {AcademyLesson|undefined}
 */
export function findLesson(lessonId) {
  return CURRICULUM.find((l) => l.id === lessonId);
}

/**
 * Get the lesson that follows the given one in global order, or null if
 * the given lesson is the last.
 * @param {string} lessonId
 * @returns {AcademyLesson|null}
 */
export function nextLessonAfter(lessonId) {
  const idx = CURRICULUM.findIndex((l) => l.id === lessonId);
  if (idx < 0 || idx >= CURRICULUM.length - 1) return null;
  return CURRICULUM[idx + 1];
}

/**
 * All lesson ids in global order.
 * @returns {string[]}
 */
export function allLessonIds() {
  return CURRICULUM.map((l) => l.id);
}

/**
 * All lesson ids belonging to a tier, in tier order.
 * @param {string} tierId
 * @returns {string[]}
 */
export function lessonIdsForTier(tierId) {
  return CURRICULUM
    .filter((l) => l.tier === tierId)
    .sort((a, b) => a.tierOrder - b.tierOrder)
    .map((l) => l.id);
}

/**
 * The tier id a lesson belongs to.
 * @param {string} lessonId
 * @returns {string|null}
 */
export function tierOfLesson(lessonId) {
  const l = findLesson(lessonId);
  return l ? l.tier : null;
}

/**
 * Total lesson count.
 * @returns {number}
 */
export function totalLessonCount() {
  return CURRICULUM.length;
}
