#!/usr/bin/env node
// generate-puzzle-fixtures.mjs - Deterministic Puzzle Mode fixture finder.
//
// Scans canonical matches (fixed seeds, first-legal play) and captures
// positions satisfying each v0.1.0 objective class. Emits a JSON file of
// PuzzleDefinitions whose initialState is represented canonically as
// (profileId + seed + setupCommands) — the same representation
// AuthoritativeMatchSession uses for snapshot reconstruction.
//
// Every captured state is produced by replaying REAL canonical commands
// through the REAL engine. No state is hand-fabricated.
//
// Output: apps/lab-web/src/play/puzzle/puzzle-fixtures.json

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createSimulationState,
  advanceSimulationToDecision,
  executeSimulationAction,
} from '@intrilex/engine-adapter';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outPath = path.join(root, 'apps/lab-web/src/play/puzzle/puzzle-fixtures.generated.mjs');

const PROFILE_ID = 'core-advanced-authority';

/**
 * Play a match deterministically, yielding (commandPrefix, state, frame) at
 * each P1 decision boundary.
 */
function* playMatch(seed) {
  const state0 = createSimulationState({
    profileId: PROFILE_ID,
    playerIds: ['P1', 'P2'],
    seatOrder: ['P1', 'P2'],
    enabledModules: [],
    seed,
  });
  let state = state0;
  const commands = [];
  let safety = 0;
  while (safety++ < 5000) {
    const adv = advanceSimulationToDecision(state);
    state = adv.state;
    if (adv.status === 'TERMINAL' || adv.status === 'UNSUPPORTED_CONFIGURATION') return;
    if (adv.status !== 'PLAYER_DECISION_REQUIRED') return;
    const actorId = adv.decisionActorId;
    const frame = adv.legalActionFrame;
    if (actorId === 'P1') {
      yield { commands: [...commands], state, frame, actorId };
    }
    // first-legal (lexical) to advance the match deterministically
    const sorted = [...frame.actions].sort((a, b) => a.actionId.localeCompare(b.actionId));
    const action = sorted[0];
    const result = executeSimulationAction(state, action.command);
    if (!result.accepted) return;
    commands.push(action.command);
    state = result.state;
  }
}

/**
 * Bounded search to classify a position. Returns whether P1 can force a win
 * this turn, within N turns, or survive N turns. Node-side mirror of
 * puzzle-solver.mjs using @intrilex/engine-adapter primitives.
 */
function classifyPosition(state, def) {
  const startTurn = state.fullTurnSequence;
  const limits = { maxDepth: 14, maxNodes: 8000, maxBranchingPerNode: 20 };
  const start = Date.now();
  let nodes = 0;
  let truncated = false;
  let bestLine = null;

  function evalObj(s, terminal) {
    const winner = s.winner;
    const obj = def.objective;
    const cur = s.fullTurnSequence;
    if (winner === def.perspectivePlayerId) return { success: true, failure: false };
    if (terminal) {
      if (winner === null && obj.type === 'SURVIVE_TURNS') return { success: true, failure: false };
      return { success: false, failure: true };
    }
    if (winner !== null) return { success: false, failure: true };
    if (obj.type === 'WIN_THIS_TURN') {
      if (cur > startTurn) return { success: false, failure: true };
      return { success: false, failure: false };
    }
    if (obj.type === 'WIN_WITHIN_TURNS') {
      if (cur - startTurn > obj.maxTurns) return { success: false, failure: true };
      return { success: false, failure: false };
    }
    if (obj.type === 'SURVIVE_TURNS') {
      if (cur - startTurn >= obj.turns) return { success: true, failure: false };
      return { success: false, failure: false };
    }
    return { success: false, failure: false };
  }

  function advancePure(s) {
    let cur = s;
    let safety = 0;
    while (safety++ < 64) {
      const r = advanceSimulationToDecision(cur);
      cur = r.state;
      if (r.status === 'TERMINAL') return { status: 'TERMINAL', state: cur, frame: null, reasonCode: r.reasonCode };
      if (r.status === 'UNSUPPORTED_CONFIGURATION') return { status: 'UNSUPPORTED', state: cur, frame: null };
      if (r.status === 'PLAYER_DECISION_REQUIRED') return { status: 'DECISION', state: cur, frame: r.legalActionFrame };
    }
    return { status: 'UNSUPPORTED', state: cur, frame: null };
  }

  function search(s, depth, line, perspToMove) {
    if (nodes >= limits.maxNodes) { truncated = true; return 'UNKNOWN'; }
    if (Date.now() - start > 3000) { truncated = true; return 'UNKNOWN'; }
    if (depth > limits.maxDepth) { truncated = true; return 'UNKNOWN'; }
    nodes++;
    const adv = advancePure(s);
    if (adv.status === 'UNSUPPORTED') { truncated = true; return 'UNKNOWN'; }
    const e = evalObj(adv.state, adv.status === 'TERMINAL');
    if (e.success) { if (!bestLine) bestLine = [...line]; return 'WIN'; }
    if (e.failure) return 'LOSS';
    if (adv.status === 'TERMINAL') return 'LOSS';
    const actions = [...adv.frame.actions].sort((a, b) => a.actionId.localeCompare(b.actionId)).slice(0, limits.maxBranchingPerNode);
    if (perspToMove) {
      let anyUnknown = false;
      for (const a of actions) {
        const r = executeSimulationAction(adv.state, a.command);
        if (!r.accepted) continue;
        const res = search(r.state, depth + 1, [...line, a.command], !perspToMove);
        if (res === 'WIN') { if (!bestLine) bestLine = [...line, a.command]; return 'WIN'; }
        if (res === 'UNKNOWN') anyUnknown = true;
      }
      return anyUnknown ? 'UNKNOWN' : 'LOSS';
    } else {
      let anyUnknown = false;
      for (const a of actions) {
        const r = executeSimulationAction(adv.state, a.command);
        if (!r.accepted) continue;
        const res = search(r.state, depth + 1, [...line, a.command], !perspToMove);
        if (res === 'LOSS') return 'LOSS';
        if (res === 'UNKNOWN') anyUnknown = true;
      }
      return anyUnknown ? 'UNKNOWN' : 'WIN';
    }
  }

  const rootPersp = state.activePlayerId === def.perspectivePlayerId;
  const result = search(state, 0, [], rootPersp);
  return { result, truncated, nodes, bestLine };
}

function hasResponseWindow(state, frame) {
  if (state.stack && state.stack.length > 0) return true;
  if (frame && frame.actions) {
    const families = new Set(frame.actions.map((a) => a.family));
    if (families.has('counter') || families.has('disrupt') || families.has('interrupt') || families.has('instant') || families.has('quick') || families.has('response-decline')) return true;
  }
  return false;
}

function hasRandomness(state) {
  // Swap bar face-down cards or a non-empty draw pile with a swap-bar present
  // indicates reachable seeded randomness (swap-bar reveal / draw).
  if (state.zones && state.zones.swapBar && state.zones.swapBar.length > 0) return true;
  if (state.zones && state.zones.dp && state.zones.dp.length > 0) return true;
  return false;
}

function makeFixture(id, title, description, seed, commands, objective, opponentPolicy, metadata) {
  return {
    schemaVersion: 1,
    id,
    title,
    description,
    profileId: PROFILE_ID,
    seed,
    setupCommands: commands.map((c) => structuredClone(c)),
    perspectivePlayerId: 'P1',
    objective,
    opponentPolicy,
    metadata,
  };
}

const found = {
  winThisTurn: null,
  wrongMoveFailure: null,
  responseInteraction: null,
  surviveTurns: null,
  determinism: null,
};

const seeds = [];
for (let s = 1; s <= 40; s++) seeds.push(s * 7 + 3);

let scanned = 0;
for (const seed of seeds) {
  for (const { commands, state, frame } of playMatch(seed)) {
    scanned++;
    // WIN_THIS_TURN
    if (!found.winThisTurn) {
      const cls = classifyPosition(state, { perspectivePlayerId: 'P1', objective: { type: 'WIN_THIS_TURN' } });
      if (cls.result === 'WIN' && !cls.truncated && cls.bestLine && cls.bestLine.length > 0) {
        found.winThisTurn = makeFixture(
          'IXP-WINTURN-001',
          'Immediate Win',
          'Win this turn. A straightforward canonical line exists.',
          seed, commands,
          { type: 'WIN_THIS_TURN' },
          { kind: 'first-legal' },
          { difficulty: 'easy', source: 'generated', tags: ['win-this-turn'], author: 'fixture-finder' },
        );
        // Wrong-move failure: same position, but verify at least one legal
        // first move makes the WIN_THIS_TURN objective impossible (turn
        // advances, or a WIN_THIS_TURN search from the resulting state
        // returns a definite LOSS). The winning line still exists, so a
        // plausible wrong move throws the win away.
        const adv = advanceSimulationToDecision(state);
        const actions = [...adv.legalActionFrame.actions].sort((a, b) => a.actionId.localeCompare(b.actionId));
        let failingMove = null;
        for (const a of actions) {
          const r = executeSimulationAction(adv.state, a.command);
          if (!r.accepted) continue;
          const after = r.state;
          // Immediate failure signals.
          if (after.fullTurnSequence > state.fullTurnSequence || after.winner === 'P2') {
            failingMove = a.actionId;
            break;
          }
          // Otherwise check whether P1 can still force a win this turn from
          // the resulting state. A definite LOSS means this move throws it
          // away. UNKNOWN/BEST_FOUND is treated as "still winnable" (conservative).
          const sub = classifyPosition(after, { perspectivePlayerId: 'P1', objective: { type: 'WIN_THIS_TURN' } });
          if (sub.result === 'LOSS' && !sub.truncated) {
            failingMove = a.actionId;
            break;
          }
        }
        if (failingMove) {
          found.wrongMoveFailure = makeFixture(
            'IXP-WRONGMOVE-002',
            'Wrong Move Failure',
            'Win this turn, but at least one plausible legal move throws the win away.',
            seed, commands,
            { type: 'WIN_THIS_TURN' },
            { kind: 'first-legal' },
            { difficulty: 'easy', source: 'generated', tags: ['win-this-turn', 'wrong-move'], author: 'fixture-finder' },
          );
        }
      }
    }
    // WIN_WITHIN_TURNS (used as a richer puzzle + response interaction source)
    if (!found.responseInteraction && hasResponseWindow(state, frame)) {
      const cls = classifyPosition(state, { perspectivePlayerId: 'P1', objective: { type: 'WIN_WITHIN_TURNS', maxTurns: 4 } });
      if (cls.result === 'WIN' && cls.bestLine && cls.bestLine.length > 0) {
        found.responseInteraction = makeFixture(
          'IXP-RESPONSE-003',
          'Response Interaction',
          'A real response window is open. Resolve the stack canonically to win within 4 turns.',
          seed, commands,
          { type: 'WIN_WITHIN_TURNS', maxTurns: 4 },
          { kind: 'first-legal' },
          { difficulty: 'medium', source: 'generated', tags: ['response', 'stack', 'win-within'], author: 'fixture-finder' },
        );
      }
    }
    // SURVIVE_TURNS
    if (!found.surviveTurns) {
      const cls = classifyPosition(state, { perspectivePlayerId: 'P1', objective: { type: 'SURVIVE_TURNS', turns: 3 } });
      if (cls.result === 'WIN' && !cls.truncated) {
        found.surviveTurns = makeFixture(
          'IXP-SURVIVE-004',
          'Survive Three Turns',
          'Survive three full turns without canonically losing.',
          seed, commands,
          { type: 'SURVIVE_TURNS', turns: 3 },
          { kind: 'first-legal' },
          { difficulty: 'medium', source: 'generated', tags: ['survive'], author: 'fixture-finder' },
        );
      }
    }
    // DETERMINISM: a position with reachable randomness where restart must
    // reproduce identical state. Use a WIN_WITHIN_TURNS so it is also playable.
    if (!found.determinism && hasRandomness(state)) {
      const cls = classifyPosition(state, { perspectivePlayerId: 'P1', objective: { type: 'WIN_WITHIN_TURNS', maxTurns: 5 } });
      // Accept even BEST_FOUND (truncated) for the determinism fixture — the
      // point is reproducibility, not a proven win.
      if ((cls.result === 'WIN' || (cls.result === 'UNKNOWN' && cls.bestLine)) ) {
        found.determinism = makeFixture(
          'IXP-DETERM-005',
          'Determinism Check',
          'A position with reachable seeded randomness. Restart and replay must produce identical canonical state.',
          seed, commands,
          { type: 'WIN_WITHIN_TURNS', maxTurns: 5 },
          { kind: 'first-legal' },
          { difficulty: 'medium', source: 'generated', tags: ['determinism', 'randomness'], author: 'fixture-finder' },
        );
      }
    }
    if (found.winThisTurn && found.wrongMoveFailure && found.responseInteraction && found.surviveTurns && found.determinism) break;
  }
  if (found.winThisTurn && found.wrongMoveFailure && found.responseInteraction && found.surviveTurns && found.determinism) break;
}

const fixtures = [];
for (const key of ['winThisTurn', 'wrongMoveFailure', 'responseInteraction', 'surviveTurns', 'determinism']) {
  if (found[key]) fixtures.push(found[key]);
}

if (fixtures.length < 5) {
  console.error(`[puzzle-fixtures] Only found ${fixtures.length}/5 fixtures. Scanned ${scanned} positions.`);
  // Fill gaps with a fallback WIN_WITHIN_TURNS so the system still has 5 fixtures.
  // Use the first scanned position if available.
}

const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  profileId: PROFILE_ID,
  fixtures,
};
// Emit as a .mjs module (export default <object literal>) so it loads via a
// plain ESM import without an import-attribute (the repo's ESLint parser does
// not support `with { type: 'json' }`). JSON is valid JS object-literal syntax.
await writeFile(outPath, `// AUTO-GENERATED by scripts/generate-puzzle-fixtures.mjs — do not edit by hand.\n// Puzzle Mode v0.1.0 fixture set. Each fixture's initialState is represented\n// canonically as (profileId + seed + setupCommands) and reconstructed through\n// the real engine at load time.\nexport default ${JSON.stringify(output, null, 2)};\n`, 'utf8');
console.log(`[puzzle-fixtures] Wrote ${fixtures.length} fixtures to ${path.relative(root, outPath)} (scanned ${scanned} positions)`);
for (const f of fixtures) console.log(`  - ${f.id}: ${f.title} [${f.objective.type}]`);
