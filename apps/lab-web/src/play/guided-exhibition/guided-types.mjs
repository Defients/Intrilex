// ═══════════════════════════════════════════════════════════════
// guided-types.mjs — Guided Exhibition type definitions and enums
//
// The Guided Exhibition is a deterministic, authored scenario that runs
// through the canonical Intrilex engine. It is NOT a separate game engine
// or a fake tutorial — it uses the real engine for every state transition.
//
// Architecture:
//   scenario fixture (card arrangement + scripted plan + commentary)
//     → guided-runtime (reconstructs state via real engine)
//     → guided-controller (orchestrates checkpoints, commentary, hints)
//     → normal game UI (with guided presentation layer)
//
// The fixture doubles as an engine-conformance regression test.
// ═══════════════════════════════════════════════════════════════

/**
 * Scenario version — couples the fixture to rules behavior. Future rule
 * changes must not silently mutate replay expectations.
 * @type {number}
 */
export const GUIDED_SCENARIO_VERSION = 1;

/**
 * The canonical scenario ID.
 * @type {string}
 */
export const GUIDED_EXHIBITION_01_ID = 'GUIDED_EXHIBITION_01';

/**
 * Runtime status states.
 * @enum {string}
 */
export const GuidedStatus = Object.freeze({
  UNLOADED: 'unloaded',
  READY: 'ready',
  PLAYING: 'playing',
  CHECKPOINT: 'checkpoint',
  TERMINAL: 'terminal',
  ERROR: 'error',
});

/**
 * Guidance level — controls how much commentary/hint assistance is shown.
 * @enum {string}
 */
export const GuidanceLevel = Object.freeze({
  FULL: 'full',
  LIGHT: 'light',
  NONE: 'none',
});

/**
 * Hint escalation stages.
 * @enum {string}
 */
export const HintStage = Object.freeze({
  H0_SILENCE: 'h0-silence',
  H1_VISUAL: 'h1-visual',
  H2_CONCEPTUAL: 'h2-conceptual',
  H3_EXPLICIT: 'h3-explicit',
});

/**
 * Context glow strength levels.
 * @enum {string}
 */
export const GlowLevel = Object.freeze({
  AMBIENT: 'ambient',
  SUGGESTED: 'suggested',
  GUIDED: 'guided',
});

/**
 * Divergence category for off-script player actions.
 * @enum {string}
 */
export const DivergenceKind = Object.freeze({
  SAFE: 'safe',
  EDUCATIONAL: 'educational',
  SCENARIO_BREAKING: 'scenario-breaking',
});

/**
 * Commentary cue trigger types.
 * @enum {string}
 */
export const CommentaryTrigger = Object.freeze({
  ON_CHECKPOINT: 'on-checkpoint',
  AFTER_RESOLUTION: 'after-resolution',
  ON_DECISION: 'on-decision',
  ON_IDLE: 'on-idle',
});

/**
 * Actor identifiers within the scenario.
 * @enum {string}
 */
export const ScenarioActor = Object.freeze({
  PLAYER: 'player',
  RIVAL: 'rival',
});

/**
 * @typedef {Object} ScenarioIntent
 * @property {string} family - Action family (e.g. 'score', 'scuttle', 'swap-bar', 'effect', 'draw', 'phase')
 * @property {string} [mode] - Action mode (e.g. 'points', 'face-down', 'enter-action', 'recycle')
 * @property {string} [sourceIdentity] - Card identity of the source (e.g. '9♣')
 * @property {string} [targetIdentity] - Card identity of the target
 * @property {string} [timingClass] - 'ACTION' | 'QUICK' | 'INSTANT' | 'SETUP'
 * @property {string} [semantic] - Semantic tag (e.g. 'DECLINE_RESPONSE')
 * @property {object} [extra] - Additional matching criteria
 */

/**
 * @typedef {Object} ScriptedAction
 * @property {string} checkpointId - Checkpoint this action belongs to
 * @property {string} actor - 'player' | 'rival'
 * @property {ScenarioIntent} intent - Intent-level description to match against legal actions
 * @property {boolean} [autoExecute] - If true, execute automatically (rival actions). If false, wait for player.
 */

/**
 * @typedef {Object} CommentaryLine
 * @property {string} text - The commentary text
 * @property {boolean} [bold] - Whether to bold this line (key beat emphasis)
 * @property {number} [pauseMs] - Pause after this line before the next
 */

/**
 * @typedef {Object} CommentaryCue
 * @property {string} id - Unique cue identifier
 * @property {string} trigger - CommentaryTrigger type
 * @property {string} checkpointId - Checkpoint this cue is associated with
 * @property {CommentaryLine[]} lines - Commentary lines to display
 * @property {number} [delayMs] - Delay before showing (after trigger)
 * @property {number} [importance] - 1-5, higher = more important
 * @property {boolean} [skippable] - Can be skipped via "Skip Flavor"
 * @property {boolean} [persistInHistory] - Include in commentary history
 * @property {boolean} [lightGuidanceOnly] - Only show in FULL guidance mode
 */

/**
 * @typedef {Object} HintDefinition
 * @property {string} checkpointId
 * @property {number} h1DelayMs - Delay before H1 (visual)
 * @property {number} h2DelayMs - Delay before H2 (conceptual)
 * @property {number} h3DelayMs - Delay before H3 (explicit)
 * @property {string} [h2Text] - H2 conceptual text
 * @property {string} [h3Text] - H3 explicit text
 * @property {string[]} [glowIdentities] - Card identities to glow at H1
 * @property {GlowLevel} [glowLevel] - Glow level at H1
 */

/**
 * @typedef {Object} StateAssertion
 * @property {string} checkpointId
 * @property {number} [playerScore] - Expected player secured points
 * @property {number} [rivalScore] - Expected rival secured points
 * @property {number} [fullTurnSequence] - Expected full turn
 * @property {string} [activePlayerId] - Expected active player
 * @property {string} [phase] - Expected phase
 * @property {string[]} [playerHandIdentities] - Expected player hand identities
 * @property {string[]} [rivalHandIdentities] - Expected rival hand identities (for testing)
 * @property {string[]} [playerPRIdentities] - Expected player PR identities
 * @property {string[]} [rivalPRIdentities] - Expected rival PR identities
 * @property {string[]} [playerERIdentities] - Expected player ER identities
 * @property {string[]} [swapBarIdentities] - Expected swap bar identities
 * @property {number} [dpCount] - Expected draw pile count
 * @property {number} [gyCount] - Expected graveyard count
 * @property {number} [exileCount] - Expected exile count
 * @property {string} [winner] - Expected winner (terminal assertions)
 */

/**
 * @typedef {Object} Checkpoint
 * @property {string} id - Checkpoint identifier (e.g. 'EX01_FT01_SCORE_9C')
 * @property {number} fullTurn - Full turn number
 * @property {string} actor - 'player' | 'rival'
 * @property {string} description - Human-readable description
 * @property {StateAssertion} [assertion] - Expected state at this checkpoint
 * @property {CommentaryCue[]} [commentary] - Commentary cues for this checkpoint
 * @property {HintDefinition} [hint] - Hint escalation for this checkpoint
 * @property {ScriptedAction[]} [scriptedActions] - Actions to execute at this checkpoint
 * @property {boolean} [playerDecision] - If true, this is a player decision point
 * @property {string[]} [glowIdentities] - Card identities to highlight
 * @property {GlowLevel} [glowLevel] - Glow strength
 */

/**
 * @typedef {Object} DebriefStep
 * @property {string} text - Debrief narration text
 * @property {boolean} [bold]
 * @property {string} [visualRef] - Reference to a visual (e.g. 'FT3_SWAP_2H')
 * @property {number} [pauseMs]
 */

/**
 * @typedef {Object} DebriefConfig
 * @property {DebriefStep[]} steps - Debrief narration steps
 * @property {string[]} encounteredMechanics - List of mechanics encountered
 * @property {string[]} unseenMechanics - List of mechanics NOT shown
 * @property {string} transparencyText - Transparency disclosure
 * @property {string} footerText - Final footer text
 */

/**
 * @typedef {Object} GuidedScenario
 * @property {string} id - Scenario ID
 * @property {number} version - Scenario version
 * @property {string} title - Display title
 * @property {string} subtitle - Subtitle
 * @property {string} profileId - Engine profile ID
 * @property {number} seed - Deterministic seed (for RNG after setup)
 * @property {string[]} predeterminedIdentities - 54-card arrangement
 * @property {string} playerId - Player ID ('P1')
 * @property {string} rivalId - Rival ID ('P2')
 * @property {Checkpoint[]} checkpoints - Ordered checkpoint list
 * @property {DebriefConfig} debrief - Post-match debrief
 * @property {string} introText - Intro sequence text
 * @property {number} estimatedMinutes - Estimated duration
 */

/**
 * @typedef {Object} CheckpointResult
 * @property {boolean} passed
 * @property {string} checkpointId
 * @property {object} actualState
 * @property {StateAssertion} expected
 * @property {string[]} mismatches
 */
