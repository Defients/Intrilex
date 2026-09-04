// ═══════════════════════════════════════════════════════════════
// academy-controller.mjs — Academy lesson lifecycle orchestrator
//
// Owns the lesson lifecycle: briefing → match → recap. Manages step
// state, objective tracking, coachmark dispatch, adaptive guidance,
// and mastery scoring. The "brain" of the tutorial system.
//
// Phase 1: lifecycle shell, seeded matches, win-based completion
// Phase 2: live objective detection, coachmarks, hints
// Phase 3: adaptive guidance, mastery scoring, mistake detection,
//          graduation assessment
//
// The controller is constructed by play-app when a lesson is started
// and stored on state.academyController. It is destroyed on exit.
// ═══════════════════════════════════════════════════════════════
import { GuidanceMode } from '../intelligence/action-explanation.js';
import {
  CURRICULUM,
  findLesson,
  nextLessonAfter,
  seedFromLessonId,
  ScenarioType,
  CompletionMode,
} from './curriculum.mjs';
import {
  loadProgress,
  saveProgress,
  markLessonComplete,
  recordLessonAttempt,
  recordLessonRetry,
  recordHintsUsed,
  isLessonCompleted,
} from './academy-progress.mjs';
import { renderObjectivePanel } from './academy-panel.mjs';
import { shouldPanelStartCollapsed, setPanelCollapsed } from './academy-panel.mjs';
import { detectObjectives } from './academy-detectors.mjs';
import {
  createCoachmarkState,
  evaluateTriggers,
  dismissCoachmark,
  renderCoachmark,
  generateHint,
  allStepsShown,
} from './academy-coachmarks.mjs';
import {
  computeMasteryScore as computeMasteryScoreV3,
  masteryTierFromScore,
  masteryTierDisplay,
  computeGuidancePolicy,
  detectMistakes,
  evaluateGraduation,
  recordGraduationAssessment,
  MasteryTier,
} from './academy-mastery.mjs';

/**
 * Controller lifecycle phases.
 * @enum {string}
 */
export const AcademyPhase = Object.freeze({
  IDLE: 'idle',
  BRIEFING: 'briefing',
  MATCH: 'match',
  RECAP: 'recap',
  DESTROYED: 'destroyed',
});

/**
 * @typedef {Object} AcademyControllerOptions
 * @property {function} [onPhaseChange] - (phase) => void
 * @property {function} [onObjectivesChanged] - (metIds) => void
 * @property {function} [onCoachmark] - (coachmark|null) => void
 * @property {function} [onMistakeDetected] - (mistakes) => void
 */

export class AcademyController {
  /**
   * @param {string} lessonId
   * @param {AcademyControllerOptions} [opts]
   */
  constructor(lessonId, opts = {}) {
    const lesson = findLesson(lessonId);
    if (!lesson) {
      throw Object.assign(new Error(`Academy: unknown lesson id "${lessonId}"`), { code: 'UNKNOWN_LESSON' });
    }
    this.lesson = lesson;
    this.opts = opts;
    this.phase = AcademyPhase.IDLE;
    /** @type {Set<string>} objective ids met during the current attempt */
    this._metObjectives = new Set();
    /** @type {number} hints used this attempt */
    this._hintsUsedThisAttempt = 0;
    /** @type {number} retries this attempt */
    this._retriesThisAttempt = 0;
    /** @type {boolean} whether this is a replay of a completed lesson */
    this._isReplay = isLessonCompleted(lessonId);
    /** @type {boolean} panel collapsed state */
    this._panelCollapsed = shouldPanelStartCollapsed(lessonId);
    /** @type {{ won: boolean, objectivesMet: string[], attempts: number, hintsUsed: number, retries: number, masteryScore: number|null }|null} */
    this._lastResult = null;
    /** @type {object|null} snapshot of the final match state (Phase 2 hook) */
    this._finalSnapshot = null;
    /** @type {CoachmarkState} coachmark state machine */
    this._cmState = createCoachmarkState();
    /** @type {Set<string>} effect families used by human this match */
    this._effectsUsed = new Set();
    /** @type {number} full turn count this match */
    this._turnCount = 0;
    /** @type {string|null} current match phase */
    this._currentPhase = null;
    /** @type {object|null} current active hint (for panel display) */
    this._currentHint = null;
    // ── Phase 3: adaptive mastery state ──
    /** @type {object|null} guidance policy for this attempt */
    this._guidancePolicy = null;
    /** @type {MistakeDetection[]} mistakes detected this batch */
    this._pendingMistakes = [];
    /** @type {number} total objectives for mastery calc */
    this._totalObjectives = (this.lesson.briefing?.objectives ?? []).length;
    /** @type {string|null} mastery tier earned this attempt */
    this._masteryTier = null;
  }

  // ── Lifecycle ──────────────────────────────────────────────

  /**
   * Transition to a new phase, firing the onPhaseChange callback.
   * @param {string} phase
   * @private
   */
  _setPhase(phase) {
    this.phase = phase;
    try { this.opts.onPhaseChange?.(phase); } catch { /* ignore */ }
  }

  /**
   * Enter the briefing phase. Returns whether the briefing should be
   * shown (false if the player has opted to skip it for this lesson).
   * @returns {boolean}
   */
  beginBriefing() {
    this._setPhase(AcademyPhase.BRIEFING);
    // Skip preference is checked by the caller (play-app) via shouldSkipBriefing.
    return true;
  }

  /**
   * Build the match setup config for play-app's startNewMatch().
   * Phase 1: always a seeded match with the lesson's AI policy.
   * Phase 2: scripted/semi-scripted scenarios will construct an initial
   * state via reconstructInitialState and pass it through a different
   * session creation path (to be added in Phase 2).
   * @returns {object} setup config for startNewMatch
   */
  buildMatchSetup() {
    const lesson = this.lesson;
    const scenario = lesson.scenario;
    // Phase 1: seeded/open both use a deterministic seed.
    const seed = (typeof scenario.seed === 'number' && scenario.seed > 0)
      ? scenario.seed
      : seedFromLessonId(lesson.id);
    return {
      profileId: scenario.profileId,
      seed,
      humanPlayerId: 'P1',
      aiPolicyId: scenario.aiPolicyId,
      mode: 'ADVANCED_CORE',
      academyLessonId: lesson.id,
      // Phase 2 hook: when scenario.type is SCRIPTED/SEMI_SCRIPTED,
      // play-app will pass setupCommands to a reconstruction path.
      academyScenarioType: scenario.type,
      academySetupCommands: scenario.setupCommands ?? null,
      academyAiScript: scenario.aiScript ?? null,
    };
  }

  /**
   * Enter the match phase. Records an attempt on the lesson.
   */
  beginMatch() {
    this._setPhase(AcademyPhase.MATCH);
    this._metObjectives = new Set();
    this._hintsUsedThisAttempt = 0;
    this._cmState = createCoachmarkState();
    this._effectsUsed = new Set();
    this._turnCount = 0;
    this._currentPhase = null;
    this._currentHint = null;
    this._pendingMistakes = [];
    this._masteryTier = null;
    // Phase 3: compute adaptive guidance policy from history
    const progress = loadProgress();
    const entry = progress.lessons[this.lesson.id] ?? {};
    const attemptNumber = (entry.attempts ?? 0) + 1;
    this._guidancePolicy = computeGuidancePolicy(this.lesson, entry, attemptNumber);
    // Note: retries are recorded via retry(); the first attempt is
    // recorded as an attempt (not a retry).
    recordLessonAttempt(this.lesson.id);
  }

  /**
   * Called by play-app when the match reaches terminal state.
   * Phase 1: completion = human won the match. Objectives are marked
   * met only if the match was won (live detection arrives in Phase 2).
   * @param {object} snapshot - terminal snapshot
   * @param {string} humanPlayerId
   * @returns {{ passed: boolean, won: boolean, objectivesMet: string[], recap: object }}
   */
  onMatchEnd(snapshot, humanPlayerId = 'P1') {
    this._finalSnapshot = snapshot;
    const won = snapshot?.state?.winner === humanPlayerId;
    // Phase 2: objectives are tracked live via onSessionEvents. On match
    // end, if the player won, mark any remaining win-type objectives as
    // met (they are satisfied by the win itself). Non-win objectives that
    // weren't detected live remain unmet.
    const required = this.lesson.completion?.requiredObjectives ?? [];
    if (won) {
      const winObjIds = ['win-match', 'win-short-match', 'win-full-match', 'win-after-scuttle',
        'win-after-anchor', 'win-swap-peek', 'win-royals', 'win-combo', 'win-graduation'];
      for (const id of required) {
        if (winObjIds.includes(id) || id === 'reach-goal' || id === 'reach-21') {
          this._metObjectives.add(id);
        }
      }
    }
    const objectivesMet = [...this._metObjectives];
    const mode = this.lesson.completion?.mode ?? CompletionMode.WIN;
    let passed = false;
    if (mode === CompletionMode.WIN) {
      passed = won;
    } else if (mode === CompletionMode.OBJECTIVES) {
      passed = required.every((id) => this._metObjectives.has(id));
    } else if (mode === CompletionMode.OBJECTIVES_AND_WIN) {
      passed = won && required.every((id) => this._metObjectives.has(id));
    }

    // Phase 3: mastery score with objective completion ratio
    const masteryScore = computeMasteryScoreV3(
      this._hintsUsedThisAttempt,
      this._retriesThisAttempt,
      this._metObjectives.size,
      this._totalObjectives,
    );
    this._masteryTier = passed ? masteryTierFromScore(masteryScore) : MasteryTier.NONE;

    // Persist completion + metadata
    if (passed) {
      markLessonComplete(this.lesson.id, {
        objectivesMet,
        hintsUsed: this._hintsUsedThisAttempt,
        retries: this._retriesThisAttempt,
        masteryScore,
      });
    } else {
      // Persist hint/retry counters even on failure
      recordHintsUsed(this.lesson.id, this._hintsUsedThisAttempt);
    }

    const progress = loadProgress();
    const entry = progress.lessons[this.lesson.id] ?? {};
    this._lastResult = {
      won,
      objectivesMet,
      attempts: entry.attempts ?? 1,
      hintsUsed: this._hintsUsedThisAttempt,
      retries: this._retriesThisAttempt,
      masteryScore: passed ? masteryScore : null,
      masteryTier: this._masteryTier,
    };

    // Phase 3: graduation assessment if this was the graduation lesson
    let graduationAssessment = null;
    if (this.lesson.id === 'applied-03-graduation' && passed) {
      graduationAssessment = evaluateGraduation(loadProgress(), CURRICULUM);
      if (graduationAssessment) {
        const updatedProgress = recordGraduationAssessment(loadProgress(), graduationAssessment);
        saveProgress(updatedProgress);
      }
    }

    const next = nextLessonAfter(this.lesson.id);
    const tierDisplay = masteryTierDisplay(this._masteryTier);
    const recap = {
      lesson: this.lesson,
      won,
      objectivesMet,
      attempts: this._lastResult.attempts,
      hintsUsed: this._lastResult.hintsUsed,
      retries: this._lastResult.retries,
      masteryScore: this._lastResult.masteryScore,
      masteryTier: this._masteryTier,
      masteryTierLabel: tierDisplay.label,
      masteryTierIcon: tierDisplay.icon,
      isReplay: this._isReplay,
      nextLessonId: next?.id ?? null,
      nextLessonTitle: next?.title ?? null,
      graduationAssessment,
      guidanceReason: this._guidancePolicy?.reason ?? null,
    };

    this._setPhase(AcademyPhase.RECAP);
    return { passed, won, objectivesMet, recap };
  }

  /**
   * Retry the lesson — re-launch the match from the scenario start.
   * Phase 1: re-launches the seeded match (no scripted checkpoint).
   * Phase 2: will reset to the reconstructed scripted initial state.
   * @returns {object} match setup config
   */
  retry() {
    this._retriesThisAttempt += 1;
    recordLessonRetry(this.lesson.id);
    this._metObjectives = new Set();
    this._hintsUsedThisAttempt = 0;
    this._cmState = createCoachmarkState();
    this._effectsUsed = new Set();
    this._turnCount = 0;
    this._currentPhase = null;
    this._currentHint = null;
    this._pendingMistakes = [];
    this._masteryTier = null;
    // Phase 3: recompute guidance policy for the retry
    const progress = loadProgress();
    const entry = progress.lessons[this.lesson.id] ?? {};
    const attemptNumber = (entry.attempts ?? 0) + 1;
    this._guidancePolicy = computeGuidancePolicy(this.lesson, entry, attemptNumber);
    this._setPhase(AcademyPhase.MATCH);
    recordLessonAttempt(this.lesson.id);
    return this.buildMatchSetup();
  }

  /**
   * v0.30.0: Mark the lesson as "understood" without requiring a win.
   * This is the explanation-first completion path. The player has
   * demonstrated understanding of the mechanic by meeting all required
   * objectives, but may not have won the match. For OBJECTIVES mode
   * lessons, this completes the lesson. For WIN/OBJECTIVES_AND_WIN
   * lessons, this records the understanding but does not complete.
   * @returns {{ understood: boolean, completed: boolean }}
   */
  markUnderstood() {
    const required = this.lesson.completion?.requiredObjectives ?? [];
    const allObjectivesMet = required.every((id) => this._metObjectives.has(id));
    const mode = this.lesson.completion?.mode ?? CompletionMode.WIN;

    if (!allObjectivesMet) {
      return { understood: false, completed: false };
    }

    // For OBJECTIVES mode, mark the lesson as complete
    if (mode === CompletionMode.OBJECTIVES) {
      const objectivesMet = [...this._metObjectives];
      const masteryScore = computeMasteryScoreV3(
        this._hintsUsedThisAttempt,
        this._retriesThisAttempt,
        this._metObjectives.size,
        this._totalObjectives,
      );
      this._masteryTier = masteryTierFromScore(masteryScore);
      markLessonComplete(this.lesson.id, {
        objectivesMet,
        hintsUsed: this._hintsUsedThisAttempt,
        retries: this._retriesThisAttempt,
        masteryScore,
        understoodOnly: true,
      });
      return { understood: true, completed: true };
    }

    // For WIN or OBJECTIVES_AND_WIN, record understanding but don't complete
    return { understood: true, completed: false };
  }

  /**
   * Clean up the controller. Called when the player exits the academy
   * (back to hub) or navigates away. Does NOT clear progress.
   */
  destroy() {
    this._setPhase(AcademyPhase.DESTROYED);
    this._finalSnapshot = null;
    this._metObjectives.clear();
    this._cmState.activeCoachmark = null;
    this._cmState.shownStepIds.clear();
    this._effectsUsed.clear();
    this._currentHint = null;
    this._guidancePolicy = null;
    this._pendingMistakes = [];
    this._masteryTier = null;
  }

  // ── Objective tracking ─────────────────────────────────────

  /**
   * Mark an objective as met. Called by Phase 2 event detection.
   * Phase 1: only called at match end via onMatchEnd.
   * @param {string} objectiveId
   */
  setObjectiveMet(objectiveId) {
    if (!objectiveId) return;
    const before = this._metObjectives.size;
    this._metObjectives.add(objectiveId);
    if (this._metObjectives.size !== before) {
      try { this.opts.onObjectivesChanged?.([...this._metObjectives]); } catch { /* ignore */ }
    }
  }

  /**
   * Get the ids of objectives met so far this attempt.
   * @returns {string[]}
   */
  getMetObjectives() {
    return [...this._metObjectives];
  }

  /**
   * Record a hint used this attempt.
   * @param {number} [count=1]
   */
  recordHint(count = 1) {
    this._hintsUsedThisAttempt += Math.max(0, count | 0);
  }

  // ── Phase 2: Live event detection + coachmarks ───────────

  /**
   * Event subscription hook for objective/action detection.
   * Called by play-app after each batch of engine events when an
   * academy controller is active. Analyzes events against the lesson's
   * objective definitions and updates met objectives live.
   * @param {object[]} events
   * @param {object} snapshot
   */
  onSessionEvents(events, snapshot) {
    if (this.phase !== AcademyPhase.MATCH || !events || events.length === 0) return;

    const humanId = snapshot?.humanPlayerId ?? 'P1';
    const result = detectObjectives(events, snapshot, {
      humanPlayerId: humanId,
      lesson: this.lesson,
      metObjectives: this._metObjectives,
      turnCount: this._turnCount,
      effectsUsed: this._effectsUsed,
    });

    this._turnCount = result.turnCount;
    this._effectsUsed = result.effectsUsed;

    // Add newly met objectives
    for (const id of result.newlyMet) {
      this._metObjectives.add(id);
    }
    if (result.newlyMet.length > 0) {
      try { this.opts.onObjectivesChanged?.([...this._metObjectives]); } catch { /* ignore */ }
    }

    // Phase 3: mistake detection
    const mistakes = detectMistakes(events, snapshot, {
      humanPlayerId: humanId,
      lesson: this.lesson,
      metObjectives: this._metObjectives,
      turnCount: this._turnCount,
      effectsUsed: this._effectsUsed,
    });
    if (mistakes.length > 0) {
      this._pendingMistakes = mistakes;
      try { this.opts.onMistakeDetected?.(mistakes); } catch { /* ignore */ }
    }

    // Update phase tracking
    const newPhase = snapshot?.match?.phase ?? snapshot?.state?.phase ?? null;
    if (newPhase && newPhase !== this._currentPhase) {
      this._cmState.lastPhase = this._currentPhase;
      this._currentPhase = newPhase;
    }

    // Evaluate coachmark triggers (Phase 3: respect guidance policy)
    const steps = this.lesson.steps ?? [];
    if (steps.length > 0 && this._guidancePolicy?.showCoachmarks !== false) {
      const recentEvents = snapshot?.recentEvents ?? events;
      const newCoachmark = evaluateTriggers(steps, this._cmState, {
        turnCount: this._turnCount,
        phase: this._currentPhase ?? '',
        recentEvents,
        metObjectives: this._metObjectives,
        humanPlayerId: humanId,
      });
      if (newCoachmark) {
        try { this.opts.onCoachmark?.(newCoachmark); } catch { /* ignore */ }
      }
    }
  }

  /**
   * Dismiss the currently-active coachmark.
   */
  dismissCurrentCoachmark() {
    dismissCoachmark(this._cmState);
    try { this.opts.onCoachmark?.(null); } catch { /* ignore */ }
  }

  /**
   * Get the currently-active coachmark (or null).
   * @returns {object|null}
   */
  getActiveCoachmark() {
    return this._cmState.activeCoachmark;
  }

  /**
   * Get the HTML for the currently-active coachmark overlay.
   * @returns {string}
   */
  getCoachmarkHtml() {
    return renderCoachmark(this._cmState.activeCoachmark);
  }

  /**
   * Dispatch a coachmark for the given step id. Manually triggers a
   * specific step (used by tests and future Phase 3 adaptive logic).
   * @param {string} stepId
   */
  dispatchCoachmark(stepId) {
    const steps = this.lesson.steps ?? [];
    const step = steps.find((s) => s.id === stepId);
    if (!step) return;
    if (this._cmState.shownStepIds.has(stepId)) return;
    this._cmState.currentStepIndex = steps.indexOf(step);
    this._cmState.activeCoachmark = { stepId: step.id, ...step.coachmark };
    try { this.opts.onCoachmark?.(this._cmState.activeCoachmark); } catch { /* ignore */ }
  }

  /**
   * Request a hint for the current match state. Increments the hint
   * counter and returns hint text for the next unmet objective.
   * @returns {{ text: string, targetObjectiveId: string|null }}
   */
  requestHint() {
    this._hintsUsedThisAttempt += 1;
    // Phase 3: use guidance policy hint level as the starting level
    const policyLevel = this._guidancePolicy?.hintLevel ?? 'gentle';
    const effectiveLevel = policyLevel === 'direct' ? 'direct' : 'gentle';
    const hintCount = this._hintsUsedThisAttempt;
    // If policy says direct, or we've used enough hints, use direct level
    const useDirect = effectiveLevel === 'direct' || hintCount >= (this.lesson.adaptation?.hintThreshold ?? 2);
    const hint = generateHint(this.lesson, this._metObjectives, useDirect ? 99 : 0);
    this._currentHint = hint;
    return hint;
  }

  /**
   * Get the current hint (without incrementing the counter).
   * @returns {object|null}
   */
  getCurrentHint() {
    return this._currentHint;
  }

  // ── Rendering helpers ──────────────────────────────────────

  /**
   * Build the in-match objective panel HTML for embedding in the board.
   * @returns {string}
   */
  getPanelHtml() {
    // Phase 3: respect guidance policy for hint button visibility
    const allowHint = this._guidancePolicy?.allowHints !== false;
    return renderObjectivePanel(this.lesson, {
      metObjectiveIds: this.getMetObjectives(),
      collapsed: this._panelCollapsed,
      allowHint,
    });
  }

  /**
   * Toggle the panel collapse state and persist the preference.
   */
  togglePanel() {
    this._panelCollapsed = !this._panelCollapsed;
    setPanelCollapsed(this.lesson.id, this._panelCollapsed);
  }

  /**
   * Is the panel currently collapsed?
   * @returns {boolean}
   */
  isPanelCollapsed() {
    return this._panelCollapsed;
  }

  // ── Accessors ──────────────────────────────────────────────

  /** @returns {string} */
  get lessonId() { return this.lesson.id; }

  /** @returns {boolean} */
  get isReplay() { return this._isReplay; }

  /** @returns {object|null} */
  get lastResult() { return this._lastResult; }

  // ── Phase 3: Mastery + adaptive guidance accessors ─────────

  /**
   * Get the current guidance policy for this attempt.
   * @returns {object|null}
   */
  getGuidancePolicy() {
    return this._guidancePolicy;
  }

  /**
   * Get the mastery tier earned this attempt (or null if not yet evaluated).
   * @returns {string|null}
   */
  getMasteryTier() {
    return this._masteryTier;
  }

  /**
   * Get pending mistakes detected this batch.
   * @returns {object[]}
   */
  getPendingMistakes() {
    return this._pendingMistakes;
  }

  /**
   * Clear pending mistakes (after they've been shown to the player).
   */
  clearPendingMistakes() {
    this._pendingMistakes = [];
  }
}

/**
 * Compute a mastery score in [0, 1] from hints + retries used.
 * Phase 3: delegates to the mastery engine with objective ratio.
 * Kept for backward compatibility (Phase 1/2 callers).
 * @param {number} hintsUsed
 * @param {number} retries
 * @returns {number}
 */
export function computeMasteryScore(hintsUsed, retries) {
  return computeMasteryScoreV3(hintsUsed, retries, 0, 0);
}

/**
 * The GuidanceMode academy lessons use. Always GUIDED so the existing
 * 3-layer action explanation system is active during lessons.
 * @returns {string}
 */
export function academyGuidanceMode() {
  return GuidanceMode.GUIDED;
}

/**
 * Validate that a lesson's scenario config is well-formed. Used by
 * Phase 2 fixture validation; declared here so the contract is stable.
 * Phase 1: validates seeded/open scenarios only.
 * @param {object} lesson
 * @returns {{ valid: boolean, issues: string[] }}
 */
export function validateLessonScenario(lesson) {
  const issues = [];
  if (!lesson || !lesson.scenario) {
    issues.push('lesson.scenario is required');
    return { valid: false, issues };
  }
  const s = lesson.scenario;
  const validTypes = new Set(Object.values(ScenarioType));
  if (!validTypes.has(s.type)) {
    issues.push(`scenario.type "${s.type}" is not a valid ScenarioType`);
  }
  if (s.type === ScenarioType.SCRIPTED || s.type === ScenarioType.SEMI_SCRIPTED) {
    if (!Array.isArray(s.setupCommands) || s.setupCommands.length === 0) {
      issues.push(`scenario.type "${s.type}" requires non-empty setupCommands (Phase 2)`);
    }
  }
  if (s.type === ScenarioType.SEEDED || s.type === ScenarioType.OPEN) {
    if (typeof s.seed !== 'number' || s.seed <= 0) {
      issues.push(`scenario.type "${s.type}" requires a positive numeric seed`);
    }
  }
  if (typeof s.aiPolicyId !== 'string' || s.aiPolicyId.length === 0) {
    issues.push('scenario.aiPolicyId must be a non-empty string');
  }
  if (typeof s.profileId !== 'string' || s.profileId.length === 0) {
    issues.push('scenario.profileId must be a non-empty string');
  }
  return { valid: issues.length === 0, issues };
}
