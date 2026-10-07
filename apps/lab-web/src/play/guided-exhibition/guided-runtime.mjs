// ═══════════════════════════════════════════════════════════════
// guided-runtime.mjs — Headless Guided Exhibition runtime
//
// Executes a GuidedScenario fixture through the canonical Intrilex engine.
// This is the same engine used in real play — no duplicated rules, no
// fake state. The runtime:
//
//   1. Reconstructs the initial state via createCoreMatchState with
//      predeterminedIdentities (stacked deck).
//   2. Advances through checkpoints using advanceCoreToDecision.
//   3. At each checkpoint, matches scripted action intents against the
//      engine's legal action frame and executes the matching command.
//   4. Validates state assertions at each checkpoint.
//   5. Verifies card conservation throughout.
//   6. Produces a deterministic command log and event log.
//
// This module is importable both in Node.js (for tests) and in the
// browser (for UI). It has no DOM dependencies.
// ═══════════════════════════════════════════════════════════════

import {
  IntrilexEngine,
  createCoreMatchState,
  advanceCoreToDecision,
} from '../../engine/browser-entry.js';

import { validateIdentities, validateStateConservation } from './guided-card-conservation.mjs';

const MAX_ORCHESTRATION = 64;

/**
 * Match a scripted action intent against a legal action frame.
 * Returns the matching CoreLegalAction or null.
 *
 * @param {import('./guided-types.mjs').ScenarioIntent} intent
 * @param {readonly import('./guided-types.mjs').CoreLegalAction[]} actions
 * @param {object} state - Current engine state (for identity lookups)
 * @returns {import('./guided-types.mjs').CoreLegalAction|null}
 */
export function matchIntent(intent, actions, state) {
  const candidates = actions.filter((a) => {
    if (intent.family && a.family !== intent.family) return false;
    if (intent.mode && a.mode !== intent.mode) return false;
    if (intent.timingClass && a.timingClass !== intent.timingClass) return false;
    if (intent.semantic) {
      // Check semantic in the command action
      const cmdAction = a.command?.action;
      if (!cmdAction || cmdAction.semantic !== intent.semantic) return false;
    }
    // Source identity matching
    if (intent.sourceIdentity) {
      const srcIds = a.sourceCardIds ?? [];
      const srcMatches = srcIds.some((id) => state.cards?.[id]?.identity === intent.sourceIdentity);
      if (!srcMatches) return false;
    }
    // Target identity matching
    if (intent.targetIdentity) {
      const tgtIds = a.targetCardIds ?? [];
      const tgtMatches = tgtIds.some((id) => state.cards?.[id]?.identity === intent.targetIdentity);
      if (!tgtMatches) return false;
    }
    return true;
  });

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Multiple matches — prefer exact source+target match, then first
  if (intent.sourceIdentity && intent.targetIdentity) {
    const exact = candidates.find((a) => {
      const srcMatch = (a.sourceCardIds ?? []).some((id) => state.cards?.[id]?.identity === intent.sourceIdentity);
      const tgtMatch = (a.targetCardIds ?? []).some((id) => state.cards?.[id]?.identity === intent.targetIdentity);
      return srcMatch && tgtMatch;
    });
    if (exact) return exact;
  }
  return candidates[0];
}

/**
 * Validate a state assertion against the actual engine state.
 * @param {import('./guided-types.mjs').StateAssertion} expected
 * @param {object} state - Actual engine state
 * @returns {{ passed: boolean, mismatches: string[] }}
 */
export function validateAssertion(expected, state) {
  const mismatches = [];

  if (typeof expected.playerScore === 'number') {
    const p1Score = computeScore(state, 'P1');
    if (p1Score !== expected.playerScore) {
      mismatches.push(`playerScore: expected ${expected.playerScore}, got ${p1Score}`);
    }
  }

  if (typeof expected.rivalScore === 'number') {
    const p2Score = computeScore(state, 'P2');
    if (p2Score !== expected.rivalScore) {
      mismatches.push(`rivalScore: expected ${expected.rivalScore}, got ${p2Score}`);
    }
  }

  if (typeof expected.fullTurnSequence === 'number') {
    if (state.fullTurnSequence !== expected.fullTurnSequence) {
      mismatches.push(`fullTurnSequence: expected ${expected.fullTurnSequence}, got ${state.fullTurnSequence}`);
    }
  }

  if (expected.activePlayerId) {
    if (state.activePlayerId !== expected.activePlayerId) {
      mismatches.push(`activePlayerId: expected ${expected.activePlayerId}, got ${state.activePlayerId}`);
    }
  }

  if (expected.phase) {
    if (state.phase !== expected.phase) {
      mismatches.push(`phase: expected ${expected.phase}, got ${state.phase}`);
    }
  }

  if (expected.winner) {
    if (state.winner !== expected.winner) {
      mismatches.push(`winner: expected ${expected.winner}, got ${state.winner}`);
    }
  }

  if (expected.playerHandIdentities) {
    const actual = (state.players?.P1?.hand ?? []).map((id) => state.cards?.[id]?.identity).sort();
    const expected_sorted = [...expected.playerHandIdentities].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected_sorted)) {
      mismatches.push(`playerHand: expected [${expected_sorted}], got [${actual}]`);
    }
  }

  if (expected.rivalHandIdentities) {
    const actual = (state.players?.P2?.hand ?? []).map((id) => state.cards?.[id]?.identity).sort();
    const expected_sorted = [...expected.rivalHandIdentities].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected_sorted)) {
      mismatches.push(`rivalHand: expected [${expected_sorted}], got [${actual}]`);
    }
  }

  if (expected.playerPRIdentities) {
    const actual = (state.players?.P1?.pr ?? []).map((id) => state.cards?.[id]?.identity).sort();
    const expected_sorted = [...expected.playerPRIdentities].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected_sorted)) {
      mismatches.push(`playerPR: expected [${expected_sorted}], got [${actual}]`);
    }
  }

  if (expected.rivalPRIdentities) {
    const actual = (state.players?.P2?.pr ?? []).map((id) => state.cards?.[id]?.identity).sort();
    const expected_sorted = [...expected.rivalPRIdentities].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected_sorted)) {
      mismatches.push(`rivalPR: expected [${expected_sorted}], got [${actual}]`);
    }
  }

  if (expected.playerERIdentities) {
    const actual = (state.players?.P1?.er ?? []).map((id) => state.cards?.[id]?.identity).sort();
    const expected_sorted = [...expected.playerERIdentities].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected_sorted)) {
      mismatches.push(`playerER: expected [${expected_sorted}], got [${actual}]`);
    }
  }

  if (expected.swapBarIdentities) {
    const actual = (state.zones?.swapBar ?? []).map((id) => state.cards?.[id]?.identity).sort();
    const expected_sorted = [...expected.swapBarIdentities].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected_sorted)) {
      mismatches.push(`swapBar: expected [${expected_sorted}], got [${actual}]`);
    }
  }

  if (typeof expected.dpCount === 'number') {
    const actual = state.zones?.dp?.length ?? 0;
    if (actual !== expected.dpCount) {
      mismatches.push(`dpCount: expected ${expected.dpCount}, got ${actual}`);
    }
  }

  if (typeof expected.gyCount === 'number') {
    const actual = state.zones?.gy?.length ?? 0;
    if (actual !== expected.gyCount) {
      mismatches.push(`gyCount: expected ${expected.gyCount}, got ${actual}`);
    }
  }

  if (typeof expected.exileCount === 'number') {
    const actual = state.zones?.exile?.length ?? 0;
    if (actual !== expected.exileCount) {
      mismatches.push(`exileCount: expected ${expected.exileCount}, got ${actual}`);
    }
  }

  return { passed: mismatches.length === 0, mismatches };
}

/**
 * Compute a player's secured point total from their Point Row.
 * @param {object} state
 * @param {string} playerId
 * @returns {number}
 */
function computeScore(state, playerId) {
  const pr = state.players?.[playerId]?.pr ?? [];
  let total = 0;
  for (const cardId of pr) {
    const card = state.cards?.[cardId];
    if (!card) continue;
    const pv = typeof card.state?.pointValue === 'number' ? card.state.pointValue : null;
    if (pv !== null) {
      total += pv;
    } else {
      // Fallback: parse identity
      total += identityPointValue(card.identity);
    }
  }
  return total;
}

/**
 * Get point value from card identity.
 * @param {string} identity
 * @returns {number}
 */
function identityPointValue(identity) {
  if (identity === 'RJ') return 5;
  if (identity === 'BJ') return 5;
  const rank = identity.replace(/[♣♦♥♠]/, '');
  const map = { A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 5, Q: 4, K: 0 };
  return map[rank] ?? 0;
}

/**
 * Reconstruct the initial state for a guided scenario.
 * @param {import('./guided-types.mjs').GuidedScenario} scenario
 * @returns {object} Engine state
 */
export function reconstructInitialState(scenario) {
  // Validate identities
  const idCheck = validateIdentities(scenario.predeterminedIdentities);
  if (!idCheck.valid) {
    throw new Error(`Invalid predeterminedIdentities: ${idCheck.issues.join('; ')}`);
  }

  // Create the canonical state with the stacked deck
  const state = createCoreMatchState({
    profileId: scenario.profileId,
    playerIds: [scenario.playerId, scenario.rivalId],
    seatOrder: [scenario.playerId, scenario.rivalId],
    enabledModules: [],
    seed: scenario.seed,
    predeterminedIdentities: scenario.predeterminedIdentities,
  });

  return state;
}

/**
 * Check if a scripted action intent targets a response/counter window.
 * Response actions have timingClass INSTANT and family 'counter' or 'response-decline'
 * or semantic 'DECLINE_RESPONSE'.
 * @param {import('./guided-types.mjs').ScenarioIntent} intent
 * @returns {boolean}
 */
function isResponseIntent(intent) {
  if (intent.family === 'counter') return true;
  if (intent.family === 'response-decline') return true;
  if (intent.semantic === 'DECLINE_RESPONSE') return true;
  if (intent.family === 'effect' && intent.timingClass === 'INSTANT') return true;
  return false;
}

/**
 * Execute a single scripted action by matching its intent against the
 * current legal action frame.
 *
 * If the engine is in a response window and the scripted action is NOT
 * a response/counter, the runtime auto-declines the response window first,
 * then advances to the next decision boundary where the scripted action
 * becomes available. This keeps the fixture focused on meaningful decisions
 * while preserving canonical engine flow.
 *
 * @param {object} state - Current engine state
 * @param {import('./guided-types.mjs').ScriptedAction} scripted
 * @param {object} engine - IntrilexEngine instance
 * @returns {{ state: object, command: object|null, events: object[], error?: string }}
 */
export function executeScriptedAction(state, scripted, engine) {
  let currentState = state;
  const allEvents = [];
  const allCommands = [];

  // Loop: advance to decision, auto-decline responses if needed, match intent
  for (let attempt = 0; attempt < MAX_ORCHESTRATION; attempt++) {
    const adv = advanceCoreToDecision(currentState, MAX_ORCHESTRATION);
    currentState = adv.state;
    allEvents.push(...adv.events);
    allCommands.push(...adv.executedCommands);

    if (adv.status === 'TERMINAL') {
      return { state: currentState, command: null, events: allEvents, error: 'TERMINAL' };
    }
    if (adv.status !== 'PLAYER_DECISION_REQUIRED' || !adv.legalActionFrame) {
      return { state: currentState, command: null, events: allEvents, error: `NO_DECISION (${adv.status} ${adv.reasonCode ?? ''})` };
    }

    const actions = adv.legalActionFrame.actions;
    const isResponseWindow = actions.length > 0 && actions.every((a) =>
      (a.timingClass === 'INSTANT' && (a.family === 'response-decline' || a.family === 'counter' || a.family === 'ultra'))
      || a.timingClass === 'QUICK'
    );

    // Try to match the intent against current legal actions
    const action = matchIntent(scripted.intent, actions, currentState);

    if (action) {
      // Found a match — execute it
      const result = engine.execute(currentState, action.command);
      allEvents.push(...result.events);
      if (!result.accepted) {
        return {
          state: currentState,
          command: action.command,
          events: allEvents,
          error: `Engine rejected: ${result.error?.code}:${result.error?.message}`,
        };
      }
      let afterState = result.state;

      // After executing an action, advance through any automatic engine
      // steps (auto-pass priority when no responses available, auto-resolve
      // stack tops when no priority is open, auto-complete End phase).
      // Stop at the first decision boundary — whether it's a response window,
      // a private choice, or a regular action. The caller is responsible for
      // auto-declining response windows when advancing to the next turn.
      const adv = advanceCoreToDecision(afterState, MAX_ORCHESTRATION);
      afterState = adv.state;
      allEvents.push(...adv.events);
      allCommands.push(...adv.executedCommands);

      return {
        state: afterState,
        command: action.command,
        events: allEvents,
      };
    }

    // No match — if we're in a response window and the scripted action
    // is NOT a response/counter, auto-decline the response
    if (isResponseWindow && !isResponseIntent(scripted.intent)) {
      const declineAction = actions.find((a) => a.family === 'response-decline') ??
                            actions.find((a) => a.family === 'counter' && a.mode === 'decline');
      if (declineAction) {
        const result = engine.execute(currentState, declineAction.command);
        allEvents.push(...result.events);
        allCommands.push(declineAction.command);
        if (!result.accepted) {
          return {
            state: currentState,
            command: declineAction.command,
            events: allEvents,
            error: `Auto-decline rejected: ${result.error?.code}:${result.error?.message}`,
          };
        }
        currentState = result.state;
        continue; // Re-advance to next decision boundary
      }
    }

    // No match — if the only available action is phase/enter-action and
    // the scripted action is NOT phase/enter-action, auto-execute the
    // phase transition and retry. This handles cases where the engine
    // state requires entering the Action phase before the scripted
    // action becomes available.
    if (!isResponseWindow && scripted.intent.family !== 'phase') {
      const phaseAction = actions.find((a) => a.family === 'phase' && a.mode === 'enter-action');
      if (phaseAction) {
        const result = engine.execute(currentState, phaseAction.command);
        allEvents.push(...result.events);
        allCommands.push(phaseAction.command);
        if (!result.accepted) {
          return {
            state: currentState,
            command: phaseAction.command,
            events: allEvents,
            error: `Auto-phase-transition rejected: ${result.error?.code}:${result.error?.message}`,
          };
        }
        currentState = result.state;
        continue; // Re-advance to next decision boundary
      }
    }

    // No match and can't auto-decline — report error
    const available = actions.map((a) =>
      `${a.family}/${a.mode}/${a.timingClass}[${a.sourceCardIds.map((id) => currentState.cards[id]?.identity).join(',')}]`
    ).join(' | ');
    return {
      state: currentState,
      command: null,
      events: allEvents,
      error: `No legal action matched intent ${JSON.stringify(scripted.intent)}. Available: ${available}`,
    };
  }

  return {
    state: currentState,
    command: null,
    events: allEvents,
    error: `Exceeded max orchestration attempts for scripted action ${JSON.stringify(scripted.intent)}`,
  };
}

/**
 * Run the full guided scenario headlessly — executing all scripted
 * actions in order and validating assertions at each checkpoint.
 *
 * This is the conformance test: if this function succeeds, the fixture
 * is valid and the match plays out as authored through the real engine.
 *
 * @param {import('./guided-types.mjs').GuidedScenario} scenario
 * @returns {{
 *   status: string,
 *   finalState: object,
 *   commands: object[],
 *   events: object[],
 *   checkpointResults: import('./guided-types.mjs').CheckpointResult[],
 *   conservationIssues: string[],
 *   error?: string,
 * }}
 */
export function runGuidedScenarioHeadless(scenario) {
  const engine = new IntrilexEngine();
  const commands = [];
  const events = [];
  const checkpointResults = [];
  const conservationIssues = [];

  // Reconstruct initial state
  let state;
  try {
    state = reconstructInitialState(scenario);
  } catch (err) {
    return {
      status: 'ERROR',
      finalState: null,
      commands,
      events,
      checkpointResults,
      conservationIssues,
      error: `Reconstruction failed: ${err.message}`,
    };
  }

  // Validate initial conservation
  const initConservation = validateStateConservation(state);
  if (!initConservation.valid) {
    conservationIssues.push(...initConservation.issues.map((i) => `[INIT] ${i}`));
  }

  // Process each checkpoint
  for (let idx = 0; idx < scenario.checkpoints.length; idx += 1) {
    const checkpoint = scenario.checkpoints[idx];
    // For EX01_INIT, check assertion before any actions (initial state)
    // For all other checkpoints, execute scripted actions first, then check assertion
    const isInitCheckpoint = checkpoint.id.endsWith('_INIT');

    if (isInitCheckpoint && checkpoint.assertion) {
      const result = validateAssertion(checkpoint.assertion, state);
      checkpointResults.push({
        passed: result.passed,
        checkpointId: checkpoint.id,
        actualState: state,
        expected: checkpoint.assertion,
        mismatches: result.mismatches,
      });
    }

    // Execute scripted actions
    if (checkpoint.scriptedActions && checkpoint.scriptedActions.length > 0) {
      for (const scripted of checkpoint.scriptedActions) {
        const result = executeScriptedAction(state, scripted, engine);
        if (result.command) commands.push(result.command);
        events.push(...result.events);
        state = result.state;

        if (result.error) {
          checkpointResults.push({
            passed: false,
            checkpointId: checkpoint.id,
            actualState: state,
            expected: {},
            mismatches: [`Scripted action failed: ${result.error}`],
          });
          return {
            status: 'ERROR',
            finalState: state,
            commands,
            events,
            checkpointResults,
            conservationIssues,
            error: `Checkpoint ${checkpoint.id}: ${result.error}`,
          };
        }

        // Check conservation after each action
        const conservation = validateStateConservation(state);
        if (!conservation.valid) {
          conservationIssues.push(...conservation.issues.map((i) => `[${checkpoint.id}] ${i}`));
        }
      }
    }

    // For non-INIT checkpoints, advance to next decision boundary
    // (auto-completes End phase, advances turn) then check assertion.
    // BUT: only advance if the next checkpoint is in a different turn,
    // to support multiple checkpoints within the same turn (e.g. scuttle + quick).
    const nextCp = scenario.checkpoints[idx + 1];
    const sameTurnNext = nextCp && nextCp.fullTurn === checkpoint.fullTurn;
    if (!isInitCheckpoint && checkpoint.scriptedActions && checkpoint.scriptedActions.length > 0 && !sameTurnNext) {
      // Advance through response windows, End phase, Start phase, etc.
      // Auto-decline any response windows that open for the non-active player.
      let advState = state;
      for (let advAttempt = 0; advAttempt < MAX_ORCHESTRATION; advAttempt++) {
        const adv = advanceCoreToDecision(advState, MAX_ORCHESTRATION);
        advState = adv.state;
        events.push(...adv.events);
        if (adv.status === 'TERMINAL') break;
        if (adv.status !== 'PLAYER_DECISION_REQUIRED' || !adv.legalActionFrame) break;
        // Check if this is a response window (all actions are INSTANT response/counter or QUICK)
        const frameActions = adv.legalActionFrame.actions;
        const isResponseWindow = frameActions.length > 0 && frameActions.every((a) =>
          (a.timingClass === 'INSTANT' && (a.family === 'response-decline' || a.family === 'counter' || a.family === 'ultra'))
          || a.timingClass === 'QUICK'
        );
        if (!isResponseWindow) break;
        // Auto-decline the response window
        const declineAction = frameActions.find((a) => a.family === 'response-decline') ??
                              frameActions.find((a) => a.family === 'counter' && a.mode === 'decline');
        if (!declineAction) break;
        const declineResult = engine.execute(advState, declineAction.command);
        events.push(...declineResult.events);
        if (!declineResult.accepted) break;
        advState = declineResult.state;
      }
      state = advState;
    }

    if (!isInitCheckpoint && checkpoint.assertion) {
      const result = validateAssertion(checkpoint.assertion, state);
      checkpointResults.push({
        passed: result.passed,
        checkpointId: checkpoint.id,
        actualState: state,
        expected: checkpoint.assertion,
        mismatches: result.mismatches,
      });
    }
  }

  // Determine final status
  const allPassed = checkpointResults.every((r) => r.passed);
  const hasConservationIssues = conservationIssues.length > 0;
  const winner = state.winner;

  return {
    status: allPassed && !hasConservationIssues ? 'CONFORMANT' : 'MISMATCH',
    finalState: state,
    commands,
    events,
    checkpointResults,
    conservationIssues,
    winner,
  };
}

/**
 * Get a human-readable summary of a headless run.
 * @param {ReturnType<typeof runGuidedScenarioHeadless>} result
 * @returns {string}
 */
export function summarizeRunResult(result) {
  const lines = [];
  lines.push(`Status: ${result.status}`);
  lines.push(`Winner: ${result.winner ?? 'none'}`);
  lines.push(`Commands: ${result.commands.length}`);
  lines.push(`Events: ${result.events.length}`);
  lines.push(`Checkpoints: ${result.checkpointResults.length}`);
  const passed = result.checkpointResults.filter((r) => r.passed).length;
  const failed = result.checkpointResults.filter((r) => !r.passed).length;
  lines.push(`  Passed: ${passed}, Failed: ${failed}`);
  if (result.conservationIssues.length > 0) {
    lines.push(`Conservation issues: ${result.conservationIssues.length}`);
    for (const issue of result.conservationIssues.slice(0, 5)) {
      lines.push(`  - ${issue}`);
    }
  }
  if (result.error) {
    lines.push(`Error: ${result.error}`);
  }
  for (const cp of result.checkpointResults.filter((r) => !r.passed)) {
    lines.push(`  FAIL [${cp.checkpointId}]: ${cp.mismatches.join('; ')}`);
  }
  return lines.join('\n');
}
