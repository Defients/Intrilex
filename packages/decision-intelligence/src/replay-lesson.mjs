// ═══════════════════════════════════════════════════════════════
// replay-lesson.mjs — L6: Replay-guided lesson mode
//
// Steps through a certified replay with commentary at key decision
// points. Uses the decision trace and mechanic registry to generate
// contextual commentary at each command.
//
// A replay lesson is:
//   - Step-by-step (one command at a time)
//   - Commentated (explains what happened and why)
//   - Interactive (player can step forward/backward)
//   - Non-judgmental (observes, doesn't grade)
// ═══════════════════════════════════════════════════════════════

import { mechanicDisplayName, mechanicCategory } from './mechanic-registry.mjs';

/**
 * @typedef {Object} ReplayCommand
 * @property {number} turn - Turn number
 * @property {string} playerId - P1 or P2
 * @property {string} action - Action type
 * @property {object} payload - Action payload
 */

/**
 * @typedef {Object} LessonStep
 * @property {number} index - Step index (0-based)
 * @property {ReplayCommand} command - The command at this step
 * @property {string|null} commentary - Commentary text, or null if no comment
 * @property {string|null} mechanicId - Mechanic ID if identifiable
 * @property {string} phase - Game phase at this step
 */

/**
 * Generate a lesson from a certified replay.
 * Produces an array of lesson steps with commentary at key decision points.
 * @param {object} replay - A certified replay object
 * @returns {LessonStep[]}
 */
export function generateReplayLesson(replay) {
  if (!replay || !replay.commands || !Array.isArray(replay.commands)) return [];

  const steps = [];
  for (let i = 0; i < replay.commands.length; i++) {
    const cmd = replay.commands[i];
    const commentary = generateCommentary(cmd, i, replay.commands);
    const mechanicId = identifyMechanic(cmd);
    const phase = cmd.phase ?? 'ACTION';

    steps.push({
      index: i,
      command: cmd,
      commentary,
      mechanicId,
      phase,
    });
  }
  return steps;
}

/**
 * Generate commentary for a single command.
 * Not every command gets commentary — only key decision points.
 * @param {ReplayCommand} cmd
 * @param {number} index
 * @param {ReplayCommand[]} allCommands
 * @returns {string|null}
 */
function generateCommentary(cmd, index, allCommands) {
  const player = cmd.playerId === 'P1' ? 'Player 1' : 'Player 2';
  const action = cmd.action ?? cmd.type ?? 'unknown';

  // Opening move commentary
  if (index === 0) {
    return `${player} opens with ${describeAction(cmd)}. The opening move sets the tempo for the match.`;
  }

  // First scoring play
  if (isScoringPlay(cmd) && isFirstScoringPlay(cmd, index, allCommands)) {
    return `${player} scores their first points with ${describeAction(cmd)}. Early points build pressure.`;
  }

  // Scuttle commentary
  if (isScuttle(cmd)) {
    return `${player} scuttles an opponent's card — a tempo trade. Scuttling removes points but costs a card.`;
  }

  // Effect card commentary
  if (isEffectCard(cmd)) {
    const mechanic = identifyMechanic(cmd);
    const name = mechanic ? mechanicDisplayName(mechanic) : 'an effect';
    return `${player} uses ${name}. Effect cards create opportunities beyond simple scoring.`;
  }

  // Pass commentary (only if frequent)
  if (isPass(cmd)) {
    const passCount = countRecentPasses(allCommands, index, 4);
    if (passCount >= 2) {
      return `${player} passes again. Frequent passing cedes tempo — consider whether an action would be better.`;
    }
    return `${player} passes this turn. Sometimes patience is correct, but watch for missed opportunities.`;
  }

  // Late game commentary
  if (index >= allCommands.length - 5) {
    return `${player} makes a late-game play with ${describeAction(cmd)}. Endgame decisions are often decisive.`;
  }

  // No commentary for most mid-game commands (avoid noise)
  return null;
}

function describeAction(cmd) {
  const action = cmd.action ?? cmd.type ?? 'a play';
  if (cmd.payload?.card) {
    return `${action} (${cmd.payload.card})`;
  }
  return action;
}

function isScoringPlay(cmd) {
  const action = cmd.action ?? cmd.type ?? '';
  return action.includes('score') || action.includes('play-points') || action === 'play-for-points';
}

function isScuttle(cmd) {
  const action = cmd.action ?? cmd.type ?? '';
  return action.includes('scuttle');
}

function isEffectCard(cmd) {
  const action = cmd.action ?? cmd.type ?? '';
  return action.includes('effect') || action.includes('effect-three') ||
         action.includes('effect-four') || action.includes('effect-five') ||
         action.includes('effect-six');
}

function isPass(cmd) {
  const action = cmd.action ?? cmd.type ?? '';
  return action === 'pass' || action === 'exhausted-pass';
}

function isFirstScoringPlay(cmd, index, allCommands) {
  for (let i = 0; i < index; i++) {
    if (isScoringPlay(allCommands[i])) return false;
  }
  return true;
}

function countRecentPasses(allCommands, index, window) {
  let count = 0;
  for (let i = Math.max(0, index - window); i <= index; i++) {
    if (isPass(allCommands[i])) count++;
  }
  return count;
}

function identifyMechanic(cmd) {
  const action = cmd.action ?? cmd.type ?? '';
  if (action.includes('scuttle')) return 'scuttle';
  if (action.includes('effect-three') || action === 'effect-3') return 'effect-three';
  if (action.includes('effect-four') || action === 'effect-4') return 'effect-four';
  if (action.includes('effect-five') || action === 'effect-5') return 'effect-five';
  if (action.includes('effect-six') || action === 'effect-6') return 'effect-six';
  if (action.includes('swap')) return 'swap-bar';
  if (action.includes('draw')) return 'draw';
  if (action.includes('play-for-points') || action.includes('score')) return 'play-for-points';
  return null;
}

/**
 * Get the total number of commented steps in a lesson.
 * @param {LessonStep[]} steps
 * @returns {number}
 */
export function countCommentedSteps(steps) {
  return steps.filter(s => s.commentary !== null).length;
}

/**
 * Get a summary of a replay lesson.
 * @param {LessonStep[]} steps
 * @returns {{ totalSteps: number, commentedSteps: number, mechanics: string[] }}
 */
export function getLessonSummary(steps) {
  const mechanics = new Set();
  for (const step of steps) {
    if (step.mechanicId) mechanics.add(step.mechanicId);
  }
  return {
    totalSteps: steps.length,
    commentedSteps: countCommentedSteps(steps),
    mechanics: Array.from(mechanics),
  };
}

/**
 * Render a lesson step as HTML.
 * @param {LessonStep} step
 * @returns {string}
 */
export function renderLessonStep(step) {
  if (!step) return '';
  const player = step.command.playerId === 'P1' ? 'P1' : 'P2';
  const action = step.command.action ?? step.command.type ?? 'unknown';
  const commentary = step.commentary
    ? `<div class="replay-lesson-commentary" data-testid="replay-lesson-commentary">${step.commentary}</div>`
    : '';
  const mechanicTag = step.mechanicId
    ? `<span class="replay-lesson-mechanic" data-testid="replay-lesson-mechanic">${mechanicDisplayName(step.mechanicId)}</span>`
    : '';

  return `<div class="replay-lesson-step" data-testid="replay-lesson-step" data-index="${step.index}">
    <div class="replay-lesson-step-header">
      <span class="replay-lesson-turn">Turn ${step.command.turn ?? '?'}</span>
      <span class="replay-lesson-player">${player}</span>
      <span class="replay-lesson-action">${action}</span>
      ${mechanicTag}
    </div>
    ${commentary}
  </div>`;
}
