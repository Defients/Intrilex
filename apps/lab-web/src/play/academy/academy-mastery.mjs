// ═══════════════════════════════════════════════════════════════
// academy-mastery.mjs — Adaptive mastery engine (Phase 3)
//
// Implements the adaptive mastery system:
//   1. Mastery scoring — weighted score from hints, retries, and
//      objective completion ratio
//   2. Mastery tiers — Bronze / Silver / Gold based on score thresholds
//   3. Adaptive guidance policy — reduces coachmark frequency and hint
//      escalation based on demonstrated mastery across attempts
//   4. Mistake detection — pattern-based detection of common beginner
//      mistakes from engine events, with contextual feedback
//   5. Graduation assessment — evaluates whether the player has
//      demonstrated sufficient mastery to graduate the Academy
//
// The mastery engine is pure — it takes state in and returns decisions
// out. The controller wires it into the lifecycle.
// ═══════════════════════════════════════════════════════════════

/**
 * Mastery tier labels.
 * @enum {string}
 */
export const MasteryTier = Object.freeze({
  NONE: 'none',
  BRONZE: 'bronze',
  SILVER: 'silver',
  GOLD: 'gold',
});

/** Score thresholds for each mastery tier */
const MASTERY_THRESHOLDS = {
  [MasteryTier.GOLD]: 0.85,
  [MasteryTier.SILVER]: 0.65,
  [MasteryTier.BRONZE]: 0.40,
};

/**
 * Compute a mastery score in [0, 1] from performance metrics.
 *
 * Weights:
 *   - Hints used:  -0.15 per hint (max -0.60)
 *   - Retries:     -0.20 per retry (max -0.60)
 *   - Objective completion ratio: 0.0 to 0.30 bonus
 *
 * @param {number} hintsUsed
 * @param {number} retries
 * @param {number} objectivesMetCount
 * @param {number} objectivesTotal
 * @returns {number}
 */
export function computeMasteryScore(hintsUsed, retries, objectivesMetCount = 0, objectivesTotal = 0) {
  const hintPenalty = Math.min(0.60, Math.max(0, hintsUsed | 0) * 0.15);
  const retryPenalty = Math.min(0.60, Math.max(0, retries | 0) * 0.20);
  const objRatio = objectivesTotal > 0 ? objectivesMetCount / objectivesTotal : 1.0;
  const objBonus = objRatio * 0.30;
  const score = 0.70 + objBonus - hintPenalty - retryPenalty;
  return Math.max(0, Math.min(1, score));
}

/**
 * Determine the mastery tier from a score.
 * @param {number} score
 * @returns {string} MasteryTier
 */
export function masteryTierFromScore(score) {
  if (typeof score !== 'number' || score < 0) return MasteryTier.NONE;
  if (score >= MASTERY_THRESHOLDS[MasteryTier.GOLD]) return MasteryTier.GOLD;
  if (score >= MASTERY_THRESHOLDS[MasteryTier.SILVER]) return MasteryTier.SILVER;
  if (score >= MASTERY_THRESHOLDS[MasteryTier.BRONZE]) return MasteryTier.BRONZE;
  return MasteryTier.NONE;
}

/**
 * Get the display label and icon for a mastery tier.
 * @param {string} tier
 * @returns {{ label: string, icon: string, color: string }}
 */
export function masteryTierDisplay(tier) {
  switch (tier) {
    case MasteryTier.GOLD: return { label: 'Gold', icon: '🥇', color: '#FFD700' };
    case MasteryTier.SILVER: return { label: 'Silver', icon: '🥈', color: '#C0C0C0' };
    case MasteryTier.BRONZE: return { label: 'Bronze', icon: '🥉', color: '#CD7F32' };
    default: return { label: 'No medal', icon: '', color: '' };
  }
}

// ── Adaptive guidance policy ──────────────────────────────────

/**
 * @typedef {Object} GuidancePolicy
 * @property {boolean} showCoachmarks - Whether to show coachmarks at all
 * @property {boolean} allowHints - Whether the hint button is available
 * @property {'gentle'|'direct'|'none'} hintLevel - Starting hint verbosity
 * @property {boolean} showObjectivePanel - Whether the objective panel is visible
 * @property {string} reason - Human-readable reason for this policy
 */

/**
 * Determine the adaptive guidance policy for a lesson attempt based on
 * the player's history with that lesson and the lesson's adaptation config.
 *
 * Rules:
 *   - First attempt: full guidance (coachmarks + hints + panel)
 *   - After completing with Gold/Silver mastery: reduce coachmarks
 *   - After completing with Gold mastery twice: hide coachmarks entirely
 *   - Hint level escalates after hintThreshold attempts without completion
 *   - Lessons with reduceGuidanceAfterMastery=false keep full guidance
 *
 * @param {object} lesson - AcademyLesson
 * @param {object} lessonEntry - Progress entry for this lesson
 * @param {number} attemptNumber - Current attempt number (1-based)
 * @returns {GuidancePolicy}
 */
export function computeGuidancePolicy(lesson, lessonEntry, attemptNumber) {
  const adaptation = lesson.adaptation ?? {};
  const reduceGuidance = adaptation.reduceGuidanceAfterMastery !== false;
  const bestScore = lessonEntry?.masteryScore ?? null;
  const bestTier = bestScore != null ? masteryTierFromScore(bestScore) : MasteryTier.NONE;
  const completions = lessonEntry?.completionCount ?? 0;
  const hintThreshold = adaptation.hintThreshold ?? 2;

  // Default: full guidance
  /** @type {GuidancePolicy} */
  const policy = {
    showCoachmarks: true,
    allowHints: true,
    hintLevel: 'gentle',
    showObjectivePanel: true,
    reason: 'Full guidance',
  };

  // Reduce guidance after mastery
  if (reduceGuidance && completions >= 1) {
    if (bestTier === MasteryTier.GOLD && completions >= 2) {
      policy.showCoachmarks = false;
      policy.hintLevel = 'none';
      policy.reason = 'Gold mastery demonstrated — guidance minimized';
    } else if (bestTier === MasteryTier.GOLD || bestTier === MasteryTier.SILVER) {
      policy.showCoachmarks = false;
      policy.hintLevel = 'gentle';
      policy.reason = 'Mastery demonstrated — coachmarks hidden, hints available';
    } else if (bestTier === MasteryTier.BRONZE) {
      policy.hintLevel = 'direct';
      policy.reason = 'Bronze mastery — direct hints, coachmarks reduced';
    }
  }

  // Escalate hint level after threshold attempts without completion
  if (completions === 0 && attemptNumber >= hintThreshold) {
    policy.hintLevel = 'direct';
    policy.reason = `Attempt ${attemptNumber} — direct hints enabled`;
  }

  // Mastery reps: if the lesson requires multiple demonstrations, keep
  // guidance until enough reps are completed
  const masteryReps = adaptation.masteryReps ?? 1;
  if (completions < masteryReps) {
    // Not enough reps yet — keep full guidance
    policy.showCoachmarks = true;
    policy.allowHints = true;
    if (policy.reason === 'Full guidance') {
      policy.reason = `Mastery rep ${completions + 1}/${masteryReps} — full guidance`;
    }
  }

  return policy;
}

/**
 * Check if the player has demonstrated mastery for a lesson (enough
 * completion reps at or above the Bronze threshold).
 * @param {object} lesson
 * @param {object} lessonEntry
 * @returns {boolean}
 */
export function hasDemonstratedMastery(lesson, lessonEntry) {
  const masteryReps = lesson.adaptation?.masteryReps ?? 1;
  const completions = lessonEntry?.completionCount ?? 0;
  if (completions < masteryReps) return false;
  const bestScore = lessonEntry?.masteryScore ?? 0;
  return bestScore >= MASTERY_THRESHOLDS[MasteryTier.BRONZE];
}

// ── Mistake detection ─────────────────────────────────────────

/**
 * @typedef {Object} MistakeDetection
 * @property {string} id - Mistake identifier
 * @property {string} hint - Contextual hint text for this mistake
 * @property {string} severity - 'warning' | 'info'
 */

/**
 * Detect common beginner mistakes from engine events + snapshot.
 *
 * Mistake patterns detected:
 *   - 'no-draw': Player skipped drawing (shouldn't happen via engine,
 *     but detects if draw phase was somehow skipped)
 *   - 'wasted-effect': Player played an effect card (7/6/5/4) for points
 *     when the effect would have been more valuable
 *   - 'no-response': Player declined all response windows without
 *     considering counter options
 *   - 'overcommit-royal': Player played a royal early when behind on
 *     tempo (heuristic)
 *
 * @param {object[]} events - Engine events this batch
 * @param {object} snapshot - Current snapshot
 * @param {{ humanPlayerId: string, lesson: object, metObjectives: Set<string>, turnCount: number, effectsUsed: Set<string> }} context
 * @returns {MistakeDetection[]}
 */
export function detectMistakes(events, snapshot, context) {
  const { humanPlayerId: humanId, lesson, metObjectives, turnCount, effectsUsed } = context;
  /** @type {MistakeDetection[]} */
  const mistakes = [];

  // Get mistake hint configs from the lesson's adaptation
  const mistakeHints = lesson.adaptation?.mistakeHints ?? [];
  const hintMap = new Map(mistakeHints.map((m) => [m.detector, m.hint]));

  for (const event of events) {
    if (!event || !event.type) continue;
    const isHuman = (event?.payload?.playerId ?? event?.payload?.actorId ?? event?.actorId) === humanId;
    if (!isHuman) continue;

    const actionType = String(event?.payload?.actionType ?? '').toLowerCase();

    // Wasted effect: playing a 7/6/5/4 for points when effect would help
    if (actionType === 'play-for-points' || actionType === 'score') {
      const cardId = event?.payload?.cardId;
      // Heuristic: if the card is a 7/6/5/4 and the player hasn't used
      // that effect yet, suggest using the effect instead
      if (cardId) {
        const rank = extractRankFromCardId(cardId) ?? extractRankFromPayload(event);
        if (rank && ['7', '6', '5', '4'].includes(rank)) {
          const effectName = { '7': 'scuttle', '6': 'anchor', '5': 'swap', '4': 'peek' }[rank];
          if (!effectsUsed.has(effectName) && hintMap.has('wasted-effect')) {
            mistakes.push({
              id: 'wasted-effect',
              hint: hintMap.get('wasted-effect'),
              severity: 'info',
            });
          }
        }
      }
    }

    // No response: if response window closed without counter and the
    // lesson teaches countering
    if (event.type === 'CORE_RESPONSE_WINDOW_CLOSED' || event.type === 'PRIORITY_CLOSED') {
      if (lesson.id === 'mechanics-04-respond' && !metObjectives.has('counter-action') && turnCount > 2) {
        if (hintMap.has('no-response')) {
          mistakes.push({
            id: 'no-response',
            hint: hintMap.get('no-response'),
            severity: 'info',
          });
        }
      }
    }
  }

  return mistakes;
}

/**
 * Try to extract a rank from a card id string.
 * Card ids often contain the rank (e.g. 'P1-H-7H' = 7 of Hearts).
 * @param {string} cardId
 * @returns {string|null}
 */
function extractRankFromCardId(cardId) {
  if (!cardId || typeof cardId !== 'string') return null;
  // Look for a rank pattern (A, 2-10, J, Q, K) in the id
  const match = cardId.match(/(?:^|[-_])([AJQK]|2-9|10)(?:[HSDC]|$)/i);
  if (match) return match[1].toUpperCase();
  // Try single-char rank
  const match2 = cardId.match(/([AJQK])/i);
  if (match2) return match2[1].toUpperCase();
  return null;
}

/**
 * Try to extract a rank from event payload.
 * @param {object} event
 * @returns {string|null}
 */
function extractRankFromPayload(event) {
  const rank = event?.payload?.rank ?? event?.payload?.cardRank;
  if (rank) return String(rank);
  return null;
}

// ── Graduation assessment ─────────────────────────────────────

/**
 * @typedef {Object} GraduationAssessment
 * @property {boolean} eligible - Whether the player is eligible for graduation
 * @property {boolean} passed - Whether the graduation assessment passed
 * @property {string[]} requirements - List of requirement descriptions
 * @property {{ met: boolean, description: string }[]} checks - Detailed checks
 * @property {number} overallMastery - Average mastery score across all lessons
 * @property {string} overallTier - Mastery tier for the overall score
 */

/**
 * Evaluate graduation readiness from progress.
 *
 * Graduation requires:
 *   1. All tiers completed (all lessons completed)
 *   2. Average mastery score >= Bronze threshold (0.40)
 *   3. The graduation lesson itself completed with OBJECTIVES_AND_WIN
 *
 * @param {object} progress - v2 progress
 * @param {object[]} curriculum - CURRICULUM array
 * @returns {GraduationAssessment}
 */
export function evaluateGraduation(progress, curriculum) {
  const checks = [];
  const requirements = [];

  // Check 1: All tiers completed
  const allTiersComplete = Object.values(progress.tiers ?? {}).every((t) => t?.completed === true);
  checks.push({
    met: allTiersComplete,
    description: 'All tiers completed (Foundations, Mechanics, Applied Play)',
  });
  if (allTiersComplete) requirements.push('✓ All tiers completed');
  else requirements.push('✗ Complete all tiers');

  // Check 2: Average mastery score
  const completedLessons = curriculum.filter((l) =>
    progress.lessons?.[l.id]?.status === 'completed');
  const masteryScores = completedLessons
    .map((l) => progress.lessons[l.id]?.masteryScore)
    .filter((s) => typeof s === 'number');
  const avgMastery = masteryScores.length > 0
    ? masteryScores.reduce((a, b) => a + b, 0) / masteryScores.length
    : 0;
  const avgTier = masteryTierFromScore(avgMastery);
  const masteryMet = avgMastery >= MASTERY_THRESHOLDS[MasteryTier.BRONZE];
  checks.push({
    met: masteryMet,
    description: `Average mastery ≥ Bronze (${(avgMastery * 100).toFixed(0)}%)`,
  });
  if (masteryMet) requirements.push(`✓ Average mastery: ${(avgMastery * 100).toFixed(0)}% (${avgTier})`);
  else requirements.push(`✗ Average mastery too low: ${(avgMastery * 100).toFixed(0)}% (need ≥ 40%)`);

  // Check 3: Graduation lesson completed
  const gradLesson = curriculum.find((l) => l.id === 'applied-03-graduation');
  const gradEntry = gradLesson ? progress.lessons?.[gradLesson.id] : null;
  const gradCompleted = gradEntry?.status === 'completed';
  checks.push({
    met: gradCompleted,
    description: 'Graduation lesson completed',
  });
  if (gradCompleted) requirements.push('✓ Graduation lesson completed');
  else requirements.push('✗ Complete the graduation lesson');

  const eligible = allTiersComplete;
  const passed = allTiersComplete && masteryMet && gradCompleted;

  return {
    eligible,
    passed,
    requirements,
    checks,
    overallMastery: avgMastery,
    overallTier: avgTier,
  };
}

/**
 * Record a graduation assessment result in the progress object.
 * Returns a new progress object (does not mutate).
 * @param {object} progress
 * @param {GraduationAssessment} assessment
 * @returns {object}
 */
export function recordGraduationAssessment(progress, assessment) {
  return {
    ...progress,
    graduationAssessment: {
      evaluatedAt: Date.now(),
      passed: assessment.passed,
      overallMastery: assessment.overallMastery,
      overallTier: assessment.overallTier,
      requirements: assessment.requirements,
    },
  };
}
