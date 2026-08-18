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

  // ── Fallback: derive decisions from replay frames when the match
  //    result doesn't include a decisions array (e.g. the browser
  //    runBrowserPolicyMatch doesn't expose per-decision records).
  //    Each frame after the initial state corresponds to one command.
  if (decisions.length === 0 && frames.length > 1) {
    decisions = deriveDecisionsFromFrames(frames, seatOrder, summary);
  }

  const beats = [];
  let sequence = 0;
  let lastTurn = -1;

  // ── MATCH_START ──
  const startFrame = frames[0];
  beats.push(buildStructuralBeat({
    matchId, sequence, kind: BEAT_KIND.MATCH_START,
    frame: startFrame, seatOrder, goalBySeat, deriveSecured,
    publicSummary: { seatOrder, policyIds: summary.policyIds, seed: summary.seed }
  }));
  sequence += 1;

  // ── Per-decision beats ──
  for (let i = 0; i < decisions.length; i += 1) {
    const decision = decisions[i];
    const frameIndex = i + 1; // frame 0 is initial state
    const frame = frames[frameIndex] ?? frames[frames.length - 1];
    const beforeFrame = frames[frameIndex - 1] ?? frames[0];
    const trace = traces[i] ?? null;

    const turn = frame?.state?.fullTurnSequence ?? decision.turn ?? null;
    // TURN_START when the full-turn counter advances.
    if (turn != null && turn !== lastTurn) {
      beats.push(buildStructuralBeat({
        matchId, sequence, kind: BEAT_KIND.TURN_START,
        frame, seatOrder, goalBySeat, deriveSecured,
        seat: seatOrder.indexOf(decision.actorId) + 1,
        turn,
        publicSummary: { turn }
      }));
      sequence += 1;
      lastTurn = turn;
    }

    const beat = buildDecisionBeat({
      matchId, sequence, decision, frame, beforeFrame, trace, seatOrder, goalBySeat, i, deriveSecured
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
    decisionId: null,
    checkpointHashBefore: null,
    checkpointHashAfter: hashCanonical(state),
    publicSummary: { scores, goals: goalBySeat, ...(publicSummary || {}) },
    action: null,
    decision: null,
    resolution: null,
    visibleEvents: viewerVisibleEvents(frame?.events ?? []),
    importance: computeImportance({ beatKind: kind }, { isTerminal: kind === BEAT_KIND.MATCH_END }),
    commentaryEligible: kind !== BEAT_KIND.TURN_START
  };
  const { normalized } = validateBeat(beat);
  return normalized;
}

function buildDecisionBeat({ matchId, sequence, decision, frame, beforeFrame, trace, seatOrder, goalBySeat, i, deriveSecured }) {
  const errors = [];
  const state = frame?.state ?? frame?.omniscientState ?? {};
  const beforeState = beforeFrame?.state ?? beforeFrame?.omniscientState ?? {};
  const seatIndex = seatOrder.indexOf(decision.actorId);
  const seat = seatIndex + 1;
  const turn = state.fullTurnSequence ?? null;
  const phase = decision.phase ?? state.phase ?? null;

  const scoresBefore = scoreSnapshot(beforeState, seatOrder, deriveSecured);
  const scoresAfter = scoreSnapshot(state, seatOrder, deriveSecured);
  const scoreBefore = scoresBefore[decision.actorId] ?? 0;
  const scoreAfter = scoresAfter[decision.actorId] ?? 0;
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
    consumedMiniTurn: decision.consumedMiniTurn ?? null
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
    decisionId: trace?.decisionId ?? `DT-${matchId}-${i}`,
    checkpointHashBefore: decision.beforeStateHash ?? null,
    checkpointHashAfter: decision.afterStateHash ?? null,
    publicSummary: {
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
    visibleEvents: viewerVisibleEvents(frame?.events ?? []),
    importance: 0, // set below
    commentaryEligible: true
  };

  beat.importance = computeImportance(beat, {
    scoreBefore, scoreAfter, goal,
    opponentScore: scoresAfter[seatOrder[1 - seatIndex]] ?? 0,
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
 * doesn't include a decisions array (e.g. the browser
 * runBrowserPolicyMatch doesn't expose per-decision records). Each
 * frame after the initial state corresponds to one command/decision.
 *
 * The derived decision includes the actor (from the frame's state
 * activePlayerId or priority), the action family/mode (from the
 * command), and the legal action count (unknown, set to null).
 */
function deriveDecisionsFromFrames(frames, seatOrder, summary) {
  const decisions = [];
  const policyIds = summary.policyIds ?? [];
  for (let i = 1; i < frames.length; i += 1) {
    const frame = frames[i];
    const beforeFrame = frames[i - 1];
    const state = frame?.state ?? frame?.omniscientState;
    const beforeState = beforeFrame?.state ?? beforeFrame?.omniscientState;
    const command = frame.command ?? null;
    const actorId = state?.activePlayerId ?? state?.priority ?? seatOrder[0];
    const seatIndex = seatOrder.indexOf(actorId);
    const family = command?.action?.family ?? command?.family ?? null;
    const mode = command?.action?.mode ?? command?.mode ?? null;
    const timingClass = command?.action?.timingClass ?? command?.timingClass ?? null;
    const actionId = command?.action?.actionId ?? command?.actionId ?? null;
    decisions.push({
      decisionIndex: i - 1,
      actorId,
      policyId: policyIds[seatIndex] ?? null,
      policyVersion: null,
      phase: state?.phase ?? null,
      turn: state?.fullTurnSequence ?? null,
      family,
      mode,
      timingClass,
      semanticClass: null,
      actionId,
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
