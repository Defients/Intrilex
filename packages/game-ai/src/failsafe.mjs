/**
 * HYBRIX AI — Failsafe & Performance Constraints
 *
 * Enforces per-bot decision budget, LOD AI tiers, hard caps on
 * evaluated actions, and failsafes for stuck loops, dithering,
 * and suicidal behavior.
 */

export function createFailsafe(config) {
  const fsConfig = config.failsafe;
  const perfConfig = config.performance;
  const actionHistory = [];
  let lastAction = null;
  let repeatCount = 0;

  /**
   * Validate and potentially override a decision.
   * @param {object} decisionResult - { action, reasonTrace }
   * @param {number} elapsedMs - Decision time elapsed
   * @param {number} lodTier - 'full' | 'simplified' | 'distant'
   * @param {number} tick - Current tick
   * @returns {object} { action, fallbackUsed, failsafeTriggered, reason }
   */
  function validate(decisionResult, elapsedMs, lodTier, tick) {
    const action = decisionResult.action;
    let finalAction = action;
    let fallbackUsed = false;
    let failsafeTriggered = false;
    let reason = null;

    // 1. Decision budget check
    if (elapsedMs > perfConfig.decisionBudgetMs) {
      finalAction = { type: perfConfig.budgetExceededFallback ?? 'IDLE', id: 'budget_fallback', family: 'idle' };
      fallbackUsed = true;
      failsafeTriggered = true;
      reason = 'BUDGET_EXCEEDED';
    }

    // 2. Stuck loop detection
    const actionKey = finalAction.id ?? finalAction.type;
    if (actionKey === lastAction) {
      repeatCount++;
      if (repeatCount > (fsConfig.maxRepeatThreshold ?? 3)) {
        finalAction = { type: fsConfig.stuckLoopAction ?? 'REPOSITION', id: 'stuck_break', family: 'move' };
        repeatCount = 0;
        failsafeTriggered = true;
        reason = 'STUCK_LOOP_OVERRIDE';
      }
    } else {
      repeatCount = 0;
    }
    lastAction = actionKey;

    // 3. Dithering detection
    actionHistory.push(actionKey);
    if (actionHistory.length > (fsConfig.ditheringWindow ?? 4) * 2) {
      actionHistory.shift();
    }
    if (isDithering(actionHistory, fsConfig.ditheringWindow ?? 4)) {
      // Commit to the first action in the dithering pattern
      finalAction = { type: action.type, id: action.id, family: action.family ?? 'committed' };
      failsafeTriggered = true;
      reason = 'DITHERING_COMMIT';
    }

    // 4. Suicidal behavior check
    const score = decisionResult.reasonTrace?.score ?? 0;
    if (score < (fsConfig.suicideThreshold ?? -100) && finalAction.type === 'ATTACK') {
      finalAction = { type: fsConfig.fallbackAction ?? 'IDLE', id: 'suicide_prevention', family: 'idle' };
      fallbackUsed = true;
      failsafeTriggered = true;
      reason = 'SUICIDE_PREVENTION';
    }

    // 5. LOD simplification
    if (lodTier === 'distant') {
      finalAction = simplifyAction(finalAction);
    } else if (lodTier === 'simplified') {
      finalAction = simplifyAction(finalAction, 'medium');
    }

    return {
      action: finalAction,
      fallbackUsed,
      failsafeTriggered,
      reason,
      elapsedMs
    };
  }

  function isDithering(history, window) {
    if (history.length < window * 2) return false;
    const recent = history.slice(-window * 2);
    const a = recent[0];
    const b = recent[1];
    if (a === b) return false; // not alternating
    for (let i = 2; i < recent.length; i++) {
      if (recent[i] !== recent[i - 2]) return false;
    }
    return true;
  }

  function simplifyAction(action, level = 'minimal') {
    if (level === 'minimal') {
      // Distant bots just move or idle
      if (action.type === 'ATTACK' || action.type === 'DEFEND' || action.type === 'SUPPORT') {
        return { type: 'MOVE', id: 'simplified_move', family: 'move' };
      }
      return action;
    }
    // Medium simplification — remove complex targeting
    if (action.type === 'ATTACK' && action.target) {
      return { ...action, target: { id: action.target.id }, simplified: true };
    }
    return action;
  }

  function reset() {
    actionHistory.length = 0;
    lastAction = null;
    repeatCount = 0;
  }

  return { validate, reset };
}

/**
 * Determine LOD tier based on distance from camera/player.
 * @param {object} botPosition - { x, y }
 * @param {object} cameraPosition - { x, y }
 * @param {object} perfConfig - Performance config section
 * @returns {string} 'full' | 'simplified' | 'distant'
 */
export function determineLodTier(botPosition, cameraPosition, perfConfig) {
  if (!botPosition || !cameraPosition) return 'full';

  const dx = (botPosition.x ?? 0) - (cameraPosition.x ?? 0);
  const dy = (botPosition.y ?? 0) - (cameraPosition.y ?? 0);
  const dist = Math.sqrt(dx * dx + dy * dy);

  const tiers = perfConfig.lodTiers;
  if (dist >= (tiers.distant?.distance ?? 60)) return 'distant';
  if (dist >= (tiers.simplified?.distance ?? 30)) return 'simplified';
  return 'full';
}

/**
 * Check if we should use full AI for a bot based on active bot count.
 * @param {number} activeBotCount - Number of bots currently using full AI
 * @param {object} perfConfig - Performance config section
 * @returns {boolean} true if full AI should be used
 */
export function shouldUseFullAI(activeBotCount, perfConfig) {
  return activeBotCount < (perfConfig.maxBotsFullAI ?? 12);
}
