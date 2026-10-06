// ═══════════════════════════════════════════════════════════════
// beat-builder.mjs — Convert a completed deterministic match into
// stable, viewer-safe semantic Caster Beats.
//
// Input: the result of runPolicyMatch({ includeReplay: true,
//   decisionTracesEnabled: true }) plus reconstructed authority frames.
//
// Authority: beats are OBSERVATIONAL. They carry semantic facts derived
// from the completed match's decision/frame evidence. They never carry
// engine commands and never feed IntrilexEngine.execute. The public
// summary is projected to viewer-visible fields only.
//
// Snapshot limitation (spec §2.3): canonical full-state reconstruction
// is exact at command checkpoints. Each DECISION beat is anchored to
// the before/after checkpoint hashes of its decision. Individual emitted
// events annotate the beat but do not claim an independently
// reconstructible canonical state between checkpoints.
// ═══════════════════════════════════════════════════════════════

import { hashCanonical } from '@intrilex/shared';
import {
  BEAT_KIND, CASTER_SCHEMA_VERSION, makeBeatId, validateBeat
} from './schemas.mjs';
import { computeImportance } from './importance.mjs';

/**
 * Browser-compatible fallback for deriving secured points from a
 * simulation state. Mirrors the engine's cardPointValue logic so the
 * beat builder works without importing @intrilex/engine-adapter (which
 * is not browser-bundleable). Callers can inject the real
 * deriveSecuredPoints via buildBeats(opts.deriveSecuredPoints).
 */
function cardPointValue(card) {
  if (!card) return 0;
  if (typeof card.state?.pointValue === 'number') return card.state.pointValue;
  const rank = String(card.identity ?? '').replace(/[♣♦♥♠]/u, '');
  if (/^\d+$/.test(rank)) return Number(rank);
  return { A: 4, J: 3, Q: 2, K: 8, RJ: 5, BJ: 11 }[rank] ?? 0;
}
function deriveSecuredPointsFallback(state, playerId) {
  if (!state) return 0;
  const player = state.players?.[playerId];
  if (!player) return 0;
  if (typeof player.securedPoints === 'number') return player.securedPoints;
  const pr = Array.isArray(player.pr) ? player.pr : [];
  const cards = state.cards ?? {};
  let sum = 0;
  for (const id of pr) sum += Number(cardPointValue(cards[id])) || 0;
  return sum;
}

const RESPONSE_FAMILIES = new Set(['counter', 'disrupt', 'interrupt', 'instant', 'quick']);
const ADVANCED_FAMILIES = new Set(['royal-marriage', 'super', 'rank10', 'ultra', 'voltage']);

// ── Orchestration command detection ───────────────────────────────
// The autonomy engine emits engine-orchestration commands between
// policy decisions: start/end phase transitions, automatic priority
// passes, and stack resolution. These carry `-ORCH-` in the command id
// or the AUTOMATIC_PRIORITY_ADVANCE semantic. They are NOT player
// decisions and must never become Caster decision beats.
const ORCHESTRATION_KINDS = new Set([
  'core-apply-setup', 'core-begin-start', 'core-complete-turn',
  'core-resolve-response-top', 'autonomy-flush-trigger-queue',
  'autonomy-resolve-response-top', 'autonomy-complete-turn',
  'autonomy-enter-action', 'begin-start'
]);
export function isOrchestrationCommand(command) {
  if (!command || typeof command !== 'object') return false;
  const id = typeof command.id === 'string' ? command.id : '';
  if (/-ORCH-/u.test(id) || /^CORE-SETUP-/u.test(id)) return true;
  const action = command.action ?? {};
  const semantic = action.semantic ?? command.semantic ?? null;
  if (semantic === 'AUTOMATIC_PRIORITY_ADVANCE') return true;
  return ORCHESTRATION_KINDS.has(action.kind ?? command.kind ?? null);
}

// Kind → semantic action mapping for the replay-frame fallback path.
// Only used when a match result lacks a canonical decisions transcript
// (e.g. saved certified replays). Verified against the autonomy engine's
// command kinds; conservative — unknown kinds produce a null family
// rather than a fabricated classification.
const FALLBACK_KIND_MAP = new Map(Object.entries({
  'autonomy-draw': { family: 'draw', mode: 'top', timingClass: 'ORDINARY' },
  'autonomy-score': { family: 'play-for-points', mode: 'score-pr', timingClass: 'ORDINARY' },
  'autonomy-scuttle': { family: 'scuttle', mode: 'ordinary', timingClass: 'ORDINARY' },
  'autonomy-pass-priority': { family: 'response-decline', mode: 'decline', timingClass: 'INSTANT' },
  'autonomy-submit-private-choice': { family: 'private-choice', mode: null, timingClass: 'ORDINARY' },
  'autonomy-declare-ace-counter': { family: 'counter', mode: 'ace', timingClass: 'INTERRUPT' },
  'autonomy-declare-king-counter': { family: 'counter', mode: 'king', timingClass: 'INTERRUPT' },
  'autonomy-declare-eight-scuttle-counter': { family: 'counter', mode: 'eight-scuttle', timingClass: 'INTERRUPT' },
  'autonomy-declare-jack-disrupt': { family: 'disrupt', mode: 'jack', timingClass: 'INSTANT' },
  'autonomy-declare-response-action': { family: 'counter', mode: null, timingClass: 'INSTANT' },
  'autonomy-exhausted-pass': { family: 'exhausted-pass', mode: 'forced-mini-turn', timingClass: 'ORDINARY' },
  'autonomy-three-bounce': { family: 'effect-bounce', mode: null, timingClass: 'ORDINARY' },
  'autonomy-three-hand-raid': { family: 'effect-private-choice', mode: 'three-hand-raid', timingClass: 'ORDINARY' },
  'autonomy-four-clear': { family: 'effect-row-clear', mode: null, timingClass: 'ORDINARY' },
  'autonomy-five-recycle': { family: 'effect-private-choice', mode: 'five-recycle', timingClass: 'ORDINARY' },
  'autonomy-six-dig': { family: 'effect-private-choice', mode: 'six-dig', timingClass: 'ORDINARY' },
  'autonomy-seven-topdeck': { family: 'effect-private-choice', mode: 'seven-topdeck', timingClass: 'ORDINARY' },
  'autonomy-nine-anchor': { family: 'anchor-private-choice', mode: null, timingClass: 'ORDINARY' },
  'autonomy-nine-tap': { family: 'effect-tap', mode: null, timingClass: 'ORDINARY' },
  'autonomy-nine-goal-shift': { family: 'effect-goal-shift', mode: null, timingClass: 'ORDINARY' },
  'autonomy-jack-pr-attachment': { family: 'effect-jack-control', mode: null, timingClass: 'ORDINARY' },
  'autonomy-red-joker': { family: 'effect-red-joker', mode: null, timingClass: 'ORDINARY' },
  'autonomy-black-joker-board-lock': { family: 'effect-board-lock', mode: null, timingClass: 'ORDINARY' },
  'autonomy-queen-anchor': { family: 'anchor-guard', mode: null, timingClass: 'ORDINARY' },
  'autonomy-king-anchor': { family: 'anchor', mode: null, timingClass: 'ORDINARY' }
}));

// Core-profile command ids embed the semantic family in the id suffix:
// `CORE-<n>-<turn>-<actor>-<family>-<mode>-<cardId?>-<counter?>`.
// Longest-first so e.g. 'response-decline' wins over 'response'.
const KNOWN_COMMAND_FAMILIES = [
  'response-decline', 'exhausted-pass', 'play-for-points', 'royal-marriage',
  'effect-private-choice', 'anchor-private-choice', 'effect-board-lock',
  'effect-goal-shift', 'effect-jack-control', 'effect-row-clear',
  'effect-red-joker', 'effect-bounce', 'effect-three', 'effect-four',
  'effect-five', 'effect-six', 'effect-seven', 'effect-nine', 'effect-tap',
  'swap-bar', 'scuttle', 'private-choice', 'anchor-guard', 'attachment',
  'wild-sovereignty', 'solo-wild', 'interrupt', 'counter', 'disrupt',
  'instant', 'quick', 'ultra', 'voltage', 'super', 'rank10', 'anchor',
  'score', 'draw', 'phase', 'pass-priority', 'pass'
].sort((a, b) => b.length - a.length);

function describeFallbackCommand(command) {
  if (!command || typeof command !== 'object') return { family: null, mode: null, timingClass: null };
  const action = command.action ?? {};
  const semantic = action.semantic ?? command.semantic ?? null;
  // A player-initiated decline is a real policy decision, never an
  // automatic priority advance (isOrchestrationCommand handles the
  // AUTOMATIC_PRIORITY_ADVANCE case before this runs).
  if (semantic === 'DECLINE_RESPONSE') return { family: 'response-decline', mode: 'decline', timingClass: 'INSTANT' };
  if (action.family || command.family) {
    return { family: action.family ?? command.family, mode: action.mode ?? command.mode ?? null, timingClass: action.timingClass ?? command.timingClass ?? null };
  }
  const kind = action.kind ?? command.kind ?? null;
  if (kind && FALLBACK_KIND_MAP.has(kind)) return { ...FALLBACK_KIND_MAP.get(kind) };
  const id = typeof command.id === 'string' ? command.id : '';
  const suffix = /^[A-Z]+-\d+-\d+-[A-Za-z0-9_]+-(.+)$/u.exec(id)?.[1];
  if (suffix) {
    const family = KNOWN_COMMAND_FAMILIES.find(f => suffix === f || suffix.startsWith(`${f}-`));
    if (family) {
      const rest = suffix === family ? '' : suffix.slice(family.length + 1);
      const mode = rest.replace(/(?:^|-)(?:CORE|C)-\S*$/u, '').replace(/-+$/u, '') || null;
      return { family, mode, timingClass: null };
    }
  }
  return { family: null, mode: null, timingClass: null };
}

/**
 * Anchor a canonical decision record to its reconstructed frame.
 * Prefers the explicit `commandIndex` recorded at the legality
 * boundary; falls back to matching `engineCommandHash` against the
 * replay command list. Frames follow commands: frame i is the state
 * after replay.commands[i-1].
 */
function anchorFrameIndex(decision, frames, commandHashAt) {
  const ci = Number.isInteger(decision?.commandIndex) ? decision.commandIndex : null;
  if (ci !== null && ci >= 0 && ci + 1 < frames.length) {
    const frame = frames[ci + 1];
    if (frame && (!Number.isInteger(frame.commandIndex) || frame.commandIndex === ci)) return ci + 1;
  }
  const target = typeof decision?.engineCommandHash === 'string' && decision.engineCommandHash
    ? decision.engineCommandHash : null;
  if (target) {
    for (let f = 1; f < frames.length; f += 1) {
      const frame = frames[f];
      if (!frame) continue;
      if (frame.command && hashCanonical(frame.command) === target) return f;
      const fci = Number.isInteger(frame.commandIndex) ? frame.commandIndex : f - 1;
      if (commandHashAt(fci) === target) return f;
    }
  }
  return null;
}

// Public-only board facts for commentary grounding. Hand identities are
// NEVER included (viewer mode can change after beats are built; the
// omniscient path supplies hand identities separately at prompt time).
// Card identities are ASCII-normalized so the public commentary input
// never carries suit glyphs.
function asciiIdentity(identity) {
  if (identity == null) return null;
  return String(identity)
    .replaceAll('♣', 'C').replaceAll('♦', 'D')
    .replaceAll('♥', 'H').replaceAll('♠', 'S');
}
function boardFacts(state, seatOrder) {
  if (!state || typeof state !== 'object') return null;
  const players = state.players ?? {};
  const cards = state.cards ?? {};
  const zoneLen = (z) => (Array.isArray(z) ? z.length : 0);
  const identityOf = (id) => asciiIdentity(cards[id]?.identity ?? null);
  const row = (ids) => (Array.isArray(ids) ? ids.map(identityOf).filter(Boolean) : []);
  const gy = state.zones?.gy;
  const runtime = state.metadata?.coreAuthority ?? state.metadata?.autonomy ?? {};
  return {
    handCounts: Object.fromEntries(seatOrder.map(id => [id, Array.isArray(players[id]?.hand) ? players[id].hand.length : 0])),
    pointRows: Object.fromEntries(seatOrder.map(id => [id, row(players[id]?.pr)])),
    enduringRows: Object.fromEntries(seatOrder.map(id => [id, row(players[id]?.er)])),
    drawCount: zoneLen(state.zones?.dp),
    graveyardCount: zoneLen(gy),
    graveyardTop: zoneLen(gy) > 0 ? identityOf(gy[gy.length - 1]) : null,
    exileCount: zoneLen(state.zones?.exile),
    swapBarCount: zoneLen(state.zones?.swapBar),
    stackDepth: Array.isArray(state.stack) ? state.stack.length : 0,
    pendingChoice: runtime.privateChoice != null
  };
}

/**
 * Build the canonical Caster Beat sequence from a completed match.
 *
 * @param {object} matchResult - runPolicyMatch result with summary,
 *   decisions, provenance, and (optionally) decisionTraces.
 * @param {Array} frames - reconstructed authority frames
 *   (from reconstructAuthorityCheckpoints or reconstructReplayFrames).
 *   frames[0] is the initial state; frames[i] follows commands[i-1].
 * @param {object} [opts] - { viewerMode, deriveSecuredPoints }
 * @returns {{ beats: Array, matchId: string, errors: Array }}
 */
export function buildBeats(matchResult, frames, opts = {}) {
  const errors = [];
  const deriveSecured = typeof opts.deriveSecuredPoints === 'function'
    ? opts.deriveSecuredPoints : deriveSecuredPointsFallback;
  if (!matchResult || !matchResult.summary) {
    return { beats: [], matchId: null, errors: ['matchResult.summary missing'] };
  }
  if (!Array.isArray(frames) || frames.length === 0) {
    return { beats: [], matchId: matchResult.summary.matchId, errors: ['frames missing'] };
  }
  const summary = matchResult.summary;
  let decisions = Array.isArray(matchResult.decisions) ? matchResult.decisions : [];
  const traces = Array.isArray(matchResult.decisionTraces) ? matchResult.decisionTraces : [];
  const matchId = summary.matchId;
  const seatOrder = summary.seatOrder ?? ['P1', 'P2'];
  const goalBySeat = deriveGoals(frames, seatOrder);
  const replayCommands = Array.isArray(matchResult.replay?.commands) ? matchResult.replay.commands : [];
  let commandHashCache = null;
  const commandHashAt = (index) => {
    if (!commandHashCache) commandHashCache = replayCommands.map(c => hashCanonical(c));
    return commandHashCache[index] ?? null;
  };

  // ── Fallback: derive decisions from replay frames only when the
  //    match result lacks a canonical decisions transcript (e.g. saved
  //    certified replays). Orchestration commands are excluded — they
  //    are engine bookkeeping, not player decisions.
  const usedFrameFallback = decisions.length === 0 && frames.length > 1;
  if (usedFrameFallback) {
    decisions = deriveDecisionsFromFrames(frames, seatOrder, summary, replayCommands);
    errors.push('decision transcript missing; beats derived from replay frames (legacy fallback)');
  }

  const beats = [];
  let sequence = 0;
  let lastTurn = -1;

  // ── MATCH_START ──
  const startFrame = frames[0];
  beats.push(buildStructuralBeat({
    matchId, sequence, kind: BEAT_KIND.MATCH_START,
    frame: startFrame, seatOrder, goalBySeat, deriveSecured,
    publicSummary: { seatOrder, policyIds: summary.policyIds }
  }));
  sequence += 1;

  // Anchor every decision up front: each decision anchors to the frame
  // that follows ITS command. Replay commands include engine
  // orchestration (priority passes, phase transitions, deferred stack
  // resolution), so frame index ≠ decision index + 1. Prefer the
  // recorded commandIndex; fall back to the engineCommandHash against
  // the replay command list.
  const anchors = decisions.map(d => anchorFrameIndex(d, frames, commandHashAt));

  // ── Per-decision beats ──
  for (let i = 0; i < decisions.length; i += 1) {
    const decision = decisions[i];
    const anchored = anchors[i];
    if (anchored === null) {
      errors.push(`decision ${decision?.decisionIndex ?? i} could not be anchored to a replay frame`);
    }
    const frameIndex = anchored ?? Math.min(i + 1, frames.length - 1);
    const frame = frames[frameIndex] ?? frames[frames.length - 1];
    const beforeFrame = frames[frameIndex - 1] ?? frames[0];
    const trace = traces[i] ?? null;

    // Causal score window: the state delta attributable to this decision
    // spans from its pre-command state to the pre-command state of the
    // NEXT decision. Deferred orchestration (stack resolution, turn
    // transitions) executes inside that window, so a per-command delta
    // would strand real score changes on non-decision commands.
    let horizonFrame = frames[frames.length - 1];
    for (let j = i + 1; j < anchors.length; j += 1) {
      if (anchors[j] !== null) { horizonFrame = frames[anchors[j] - 1] ?? horizonFrame; break; }
    }

    const turn = frame?.state?.fullTurnSequence ?? decision.turn ?? null;
    // TURN_START when the full-turn counter advances.
    if (turn != null && turn !== lastTurn) {
      beats.push(buildStructuralBeat({
        matchId, sequence, kind: BEAT_KIND.TURN_START,
        frame, seatOrder, goalBySeat, deriveSecured,
        seat: seatOrder.indexOf(decision.actorId) + 1 || null,
        turn,
        publicSummary: { turn }
      }));
      sequence += 1;
      lastTurn = turn;
    }

    const beat = buildDecisionBeat({
      matchId, sequence, decision, frame, beforeFrame, horizonFrame, trace, seatOrder, goalBySeat, i, deriveSecured
    });
    beats.push(beat.beat);
    sequence += 1;
    for (const e of beat.errors) errors.push(e);
  }

  // ── MATCH_END ──
  const endFrame = frames[frames.length - 1];
  beats.push(buildStructuralBeat({
    matchId, sequence, kind: BEAT_KIND.MATCH_END,
    frame: endFrame, seatOrder, goalBySeat, deriveSecured,
    publicSummary: {
      winner: summary.winner,
      terminationReason: summary.terminationReason,
      finalScores: summary.finalScores,
      completedFullTurns: summary.completedFullTurns
    }
  }));

  return { beats, matchId, errors };
}

// ── Builders ──────────────────────────────────────────────────────

function buildStructuralBeat({ matchId, sequence, kind, frame, seatOrder, goalBySeat, seat, turn, publicSummary, deriveSecured }) {
  const state = frame?.state ?? frame?.omniscientState ?? {};
  const scores = scoreSnapshot(state, seatOrder, deriveSecured);
  const beat = {
    schemaVersion: CASTER_SCHEMA_VERSION,
    beatId: makeBeatId(matchId, sequence),
    matchId,
    sequence,
    beatKind: kind,
    seat: seat ?? null,
    turn: turn ?? state.fullTurnSequence ?? null,
    phase: state.phase ?? null,
    frameIndex: frame?.frameIndex ?? 0,
    decisionId: null,
    checkpointHashBefore: null,
    checkpointHashAfter: hashCanonical(state),
    publicSummary: { scores, goals: goalBySeat, ...(publicSummary || {}) },
    action: null,
    decision: null,
    resolution: null,
    board: boardFacts(state, seatOrder),
    visibleEvents: viewerVisibleEvents(frame?.events ?? []),
    importance: computeImportance({ beatKind: kind }, { isTerminal: kind === BEAT_KIND.MATCH_END }),
    commentaryEligible: kind !== BEAT_KIND.TURN_START
  };
  const { normalized } = validateBeat(beat);
  return normalized;
}

function buildDecisionBeat({ matchId, sequence, decision, frame, beforeFrame, horizonFrame, trace, seatOrder, goalBySeat, i, deriveSecured }) {
  const errors = [];
  const state = frame?.state ?? frame?.omniscientState ?? {};
  const beforeState = beforeFrame?.state ?? beforeFrame?.omniscientState ?? {};
  // The causal horizon state is the pre-command state of the NEXT
  // decision (or the terminal frame for the last). Deferred engine
  // resolution between the two decision commands is attributed to this
  // decision — matching the runtime's causal-boundary model.
  const horizonState = horizonFrame?.state ?? horizonFrame?.omniscientState ?? state;
  const seatIndex = seatOrder.indexOf(decision.actorId);
  const seat = seatIndex >= 0 ? seatIndex + 1 : null;
  const turn = state.fullTurnSequence ?? null;
  const phase = decision.phase ?? state.phase ?? null;

  const scoresBefore = scoreSnapshot(beforeState, seatOrder, deriveSecured);
  const scoresAfter = scoreSnapshot(state, seatOrder, deriveSecured);
  const scoresHorizon = scoreSnapshot(horizonState, seatOrder, deriveSecured);
  const scoreBefore = scoresBefore[decision.actorId] ?? 0;
  // Horizon-attributed score: the actor's score once all deferred
  // resolution caused by this decision has run (just before the next
  // decision command executes).
  const scoreAfter = scoresHorizon[decision.actorId] ?? scoresAfter[decision.actorId] ?? 0;
  const goal = goalBySeat[decision.actorId] ?? 21;

  // Selection margin from candidate scores (deterministic, from policy metadata).
  const candidateScores = Array.isArray(decision.candidateScores) ? decision.candidateScores : [];
  const margin = deriveMargin(candidateScores);

  const stackDepth = Array.isArray(state.stack) ? state.stack.length : 0;

  // Beat kind: RESPONSE for response-family actions, DECISION otherwise.
  const family = decision.family ?? null;
  const isResponse = family != null && RESPONSE_FAMILIES.has(family);
  const isAdvanced = family != null && ADVANCED_FAMILIES.has(family);
  const kind = isResponse ? BEAT_KIND.RESPONSE : BEAT_KIND.DECISION;

  // Viewer-safe action summary (no hidden hand identities, no command vault).
  const action = {
    actionId: decision.actionId ?? null,
    family,
    mode: decision.mode ?? null,
    timingClass: decision.timingClass ?? null,
    semanticClass: decision.semanticClass ?? null
  };

  // Viewer-safe decision summary.
  const decisionSummary = {
    decisionIndex: decision.decisionIndex ?? i,
    actorId: decision.actorId,
    policyId: decision.policyId ?? null,
    policyVersion: decision.policyVersion ?? null,
    legalActionCount: decision.legalActionCount ?? null,
    selectionMargin: margin,
    reasonCode: decision.reasonCode ?? null,
    consumedMiniTurn: decision.consumedMiniTurn ?? null,
    source: decision._source === 'frames' ? 'frames' : 'transcript'
  };

  const isTerminal = state.winner != null;

  const beat = {
    schemaVersion: CASTER_SCHEMA_VERSION,
    beatId: makeBeatId(matchId, sequence),
    matchId,
    sequence,
    beatKind: kind,
    seat,
    turn,
    phase,
    frameIndex: frame?.frameIndex ?? i,
    decisionId: trace?.decisionId ?? `DT-${matchId}-${i}`,
    checkpointHashBefore: decision.beforeStateHash ?? null,
    checkpointHashAfter: decision.afterStateHash ?? null,
    publicSummary: {
      // `scores` reflects the state at the anchored frame (what the
      // rendered board shows). `scoreDelta` is horizon-attributed:
      // it includes deferred resolution the decision caused.
      scores: scoresAfter,
      scoresBefore,
      goals: goalBySeat,
      scoreDelta: scoreAfter - scoreBefore,
      stackDepth,
      advanced: isAdvanced
    },
    action,
    decision: decisionSummary,
    resolution: null,
    board: boardFacts(state, seatOrder),
    visibleEvents: viewerVisibleEvents(frame?.events ?? []),
    importance: 0, // set below
    commentaryEligible: true
  };

  beat.importance = computeImportance(beat, {
    scoreBefore, scoreAfter, goal,
    opponentScore: scoresHorizon[seatOrder[1 - seatIndex]] ?? scoresAfter[seatOrder[1 - seatIndex]] ?? 0,
    decisionMargin: margin,
    legalActionCount: decision.legalActionCount ?? 0,
    stackDepth,
    isTerminal
  });

  const { normalized, errors: vErrors } = validateBeat(beat);
  for (const e of vErrors) errors.push(e);
  return { beat: normalized, errors };
}

// ── Pure helpers ──────────────────────────────────────────────────

function scoreSnapshot(state, seatOrder, deriveSecured) {
  const out = {};
  const fn = typeof deriveSecured === 'function' ? deriveSecured : deriveSecuredPointsFallback;
  for (const id of seatOrder) {
    try { out[id] = fn(state, id); }
    catch { out[id] = 0; }
  }
  return out;
}

function deriveGoals(frames, seatOrder) {
  // Goal is a rules constant per profile; pull it from the first frame
  // that exposes player.goal. Fall back to 21 (First Contact default).
  const goals = {};
  for (const id of seatOrder) goals[id] = 21;
  for (const f of frames) {
    const state = f?.state ?? f?.omniscientState;
    if (!state?.players) continue;
    for (const id of seatOrder) {
      const g = state.players[id]?.goal;
      if (Number.isFinite(g)) goals[id] = g;
    }
    if (seatOrder.every(id => Number.isFinite(goals[id]) && goals[id] !== 21)) break;
  }
  return goals;
}

function deriveMargin(candidateScores) {
  if (!Array.isArray(candidateScores) || candidateScores.length < 2) return null;
  // candidateScores are policy utility values; margin = top - second.
  const sorted = [...candidateScores].map(Number).filter(Number.isFinite).sort((a, b) => b - a);
  if (sorted.length < 2) return null;
  return Math.abs(sorted[0] - sorted[1]);
}

/**
 * Return only viewer-visible events. Public events have visibility
 * 'public'; private/hidden events are excluded from the public beat.
 * The planner applies per-viewer projection on top of this.
 */
function viewerVisibleEvents(events) {
  if (!Array.isArray(events)) return [];
  return events
    .filter(e => e && (e.visibility === 'public' || e.visibility === undefined))
    .map(e => ({
      id: e.id ?? null,
      type: e.type ?? null,
      visibility: e.visibility ?? 'public',
      payload: e.payload ?? null
    }));
}

/**
 * Derive per-decision records from replay frames when the match result
 * doesn't include a canonical decisions transcript (e.g. saved
 * certified replays).
 *
 * Engine orchestration commands (`-ORCH-` ids, automatic priority
 * advances, phase/stack resolution) are skipped — they are bookkeeping,
 * not player decisions. The actor is taken from the command's declared
 * `actorId`, NOT the post-command state: after a command executes,
 * `activePlayerId`/`priority` reflect whoever holds priority NEXT, which
 * is wrong for responses, interrupts, and priority-changing actions.
 */
function deriveDecisionsFromFrames(frames, seatOrder, summary, replayCommands = []) {
  const decisions = [];
  const policyIds = summary.policyIds ?? [];
  for (let i = 1; i < frames.length; i += 1) {
    const frame = frames[i];
    const beforeFrame = frames[i - 1];
    const state = frame?.state ?? frame?.omniscientState;
    const beforeState = beforeFrame?.state ?? beforeFrame?.omniscientState;
    const commandIndex = Number.isInteger(frame?.commandIndex) ? frame.commandIndex : i - 1;
    const command = frame?.command ?? replayCommands[commandIndex] ?? null;
    if (command && isOrchestrationCommand(command)) continue;
    if (!command) continue; // no evidence to attribute — never fabricate
    // The command's declared actorId is the decision actor even when the
    // post-state has moved priority/activePlayer to someone else.
    const priorityOwner = Array.isArray(state?.priority?.order) && Number.isInteger(state?.priority?.index)
      ? state.priority.order[state.priority.index] : null;
    const actorId = command.actorId ?? priorityOwner ?? state?.activePlayerId ?? seatOrder[0];
    const seatIndex = seatOrder.indexOf(actorId);
    const described = describeFallbackCommand(command);
    decisions.push({
      _source: 'frames',
      decisionIndex: decisions.length,
      commandIndex,
      actorId,
      policyId: policyIds[seatIndex] ?? policyIds[0] ?? null,
      policyVersion: null,
      phase: state?.phase ?? null,
      turn: state?.fullTurnSequence ?? null,
      family: described.family,
      mode: described.mode,
      timingClass: described.timingClass,
      semanticClass: command?.action?.semantic ?? command?.semantic ?? null,
      actionId: command?.action?.actionId ?? command?.actionId ?? command?.id ?? null,
      engineCommandHash: command ? hashCanonical(command) : null,
      legalActionCount: null,
      candidateScores: null,
      reasonCode: null,
      consumedMiniTurn: null,
      beforeStateHash: beforeState ? hashCanonical(beforeState) : null,
      afterStateHash: state ? hashCanonical(state) : null
    });
  }
  return decisions;
}
