// ═══════════════════════════════════════════════════════════════
// replay-contract.mjs — Full-Match Watch Contract
//
// Canonical classification + structural analysis for every artifact Watch
// can display. The contract exists because Watch mixes four very different
// things behind the same theatre: tiny certification fixtures (CT-*),
// retained full-match replays (M-*), runtime/session replays, and index
// records whose bodies are excluded from the build.
//
// Classification axes (independent):
//   artifactClass — what the artifact IS:
//     FULL_MATCH        — complete match record; navigation from canonical
//                         initial state to canonical terminal state is
//                         provably possible.
//     SCENARIO_FIXTURE  — certification/conformance scenario (CT-*,
//                         GOVERNING_CONFORMANCE_*): deliberately scoped,
//                         often mid-match start, not a complete game.
//     PARTIAL_REPLAY    — gameplay evidence exists but canonical playback
//                         cannot be guaranteed (truncated frames,
//                         diverged reconstruction, no terminal evidence).
//     METADATA_ONLY     — index/summary record only; no replay body.
//     UNKNOWN           — insufficient evidence to classify honestly.
//   availability — whether the body is reachable in this build:
//     'bundled' | 'excluded' | 'runtime' | 'unknown' (resolver-owned).
//
// This module is dependency-free and DOM-free so Node tests can exercise
// the contract directly against real artifacts.
// ═══════════════════════════════════════════════════════════════

export const REPLAY_ARTIFACT_CLASS = Object.freeze({
  FULL_MATCH: 'FULL_MATCH',
  SCENARIO_FIXTURE: 'SCENARIO_FIXTURE',
  PARTIAL_REPLAY: 'PARTIAL_REPLAY',
  METADATA_ONLY: 'METADATA_ONLY',
  UNKNOWN: 'UNKNOWN',
});

export const FRAME_INTEGRITY = Object.freeze({
  EMBEDDED: 'embedded',                    // frames shipped inside the artifact
  RECONSTRUCTED: 'reconstructed',          // frames rebuilt from commands
  VERIFIED: 'reconstructed-verified',      // rebuilt AND finalStateHash matches
  DIVERGED: 'diverged',                    // rebuilt trajectory contradicts the recorded hash
  PARTIAL: 'partial',                      // frames present but provably incomplete
  UNRECONSTRUCTABLE: 'unreconstructable',  // no executable commands to rebuild from
});

/** Artifact kinds that denote certification/conformance scenario fixtures. */
const SCENARIO_KIND_PATTERN = /CONFORMANCE|CERTIFICATION|SCENARIO_FIXTURE/i;
/** Fixture-id conventions used by certification artifacts. */
const SCENARIO_ID_PATTERN = /^(CT|FIXTURE|SCENARIO|PUZZLE)-/i;
/** Retained match artifact kinds (full-match campaign evidence). */
const RETAINED_KIND_PATTERN = /RETAINED|FULL_MATCH|COMPLETE_MATCH/i;
/**
 * Termination reasons that prove a match reached a canonical end state.
 * Aligned with the runtime's canonical completion vocabulary
 * (COMPLETE_REASONS / CLEAN_REASONS in simulation-runtime):
 * NORMAL_VICTORY, EXHAUSTED_RESOLUTION, CANONICAL_DRAW — plus the recorded
 * terminal outcomes accepted by evidence validation (DECISION_LIMIT,
 * ENGINE_REJECTION, …). Fault/invalid-result reasons (WORKER_FAULT,
 * POLICY_ERROR, INVALID_RESULT, …) are deliberately absent.
 */
const TERMINAL_REASONS = new Set([
  'VICTORY', 'NORMAL_VICTORY', 'CANONICAL_DRAW', 'EXHAUSTED_RESOLUTION',
  'ENGINE_REJECTION', 'DECISION_LIMIT', 'COMMAND_LIMIT', 'CONCESSION',
  'TIMEOUT', 'ABORT',
]);
const HIDDEN_CLASSES = new Set(['engine-orchestration', 'engine-orchestration-summary']);

// ── Frame/command accessors (format-tolerant) ───────────────────

/** Executable action payload of a command, if any. */
export function commandAction(command) {
  return command?.action ?? command?.payload?.action ?? null;
}

/**
 * Event objects for a frame. Frame-embedded artifacts store `eventTypes`
 * (string array); reconstructed frames store `events` (objects).
 */
export function frameEvents(frame) {
  return frame?.events ?? (frame?.eventTypes ?? []).map(type => ({ type }));
}
export function frameEventTypes(frame) {
  return frameEvents(frame).map(event => event?.type).filter(Boolean);
}

/**
 * The state a frame exposes. Public artifacts carry `state`; authorized
 * artifacts carry `omniscientState` + `playerViews`. `viewer` picks the
 * player view when present.
 */
export function frameState(frame, viewer = null) {
  if (!frame) return null;
  if (frame.state) return frame.state;
  if (frame.omniscientState) return frame.omniscientState;
  if (frame.playerViews) {
    if (viewer && frame.playerViews[viewer]) return frame.playerViews[viewer];
    const first = Object.values(frame.playerViews)[0];
    if (first) return first;
  }
  return null;
}

/** Observed full-turn counter for a frame (null when unknowable). */
export function frameTurn(frame, viewer = null) {
  const t = frameState(frame, viewer)?.fullTurnSequence;
  return Number.isFinite(t) ? t : null;
}

/** Winner recorded at a frame (string playerId, object, or null). */
export function frameWinner(frame, viewer = null) {
  return frameState(frame, viewer)?.winner ?? null;
}

/** The command that produced a frame (frame 0 = initial state, no command). */
export function frameCommand(replay, index) {
  if (index <= 0) return null;
  return replay?.frames?.[index]?.command ?? replay?.commands?.[index - 1] ?? null;
}

/** Terminal-event evidence at a frame (VICTORY/TERMINATION event types).
 * Covers the engine's canonical terminal events — NORMAL_VICTORY,
 * SUDDEN_DEATH_RESOLVED, EXHAUSTED_RESOLVED — including draws, where a
 * recorded `winner: null` is a legitimate terminal outcome. */
export function frameTerminalType(frame) {
  return frameEventTypes(frame).find(t =>
    /TERMINATION|VICTORY|MATCH_(END|COMPLETE)|SUDDEN_DEATH_RESOLVED|EXHAUSTED_RESOLVED/.test(t)) ?? null;
}

// ── Semantic classification (single source for Watch timeline) ──

/**
 * Semantic class of the command that produced `frame`. Authoritative
 * `semanticClass` hints (retained lab artifacts) win; otherwise derived
 * from the command kind and the frame's real event types.
 */
export function commandSemanticClass(command, frame) {
  if (command?.semanticClass && typeof command.semanticClass === 'string'
      && command.semanticClass !== 'null') {
    return command.semanticClass;
  }
  const action = commandAction(command);
  const kind = String(action?.kind ?? command?.type ?? '').toLowerCase();
  const semantic = action?.semantic;
  const types = frameEventTypes(frame);
  if (types.some(type => /RESPONSE_WINDOW_CLOSED/.test(type))) return 'engine-orchestration-summary';
  if (semantic === 'AUTOMATIC_PRIORITY_ADVANCE' || types.some(type => /AUTOMATIC_PRIORITY_ADVANCE/.test(type))) return 'engine-orchestration';
  if (semantic === 'DECLINE_RESPONSE' || types.some(type => /RESPONSE_DECLINED/.test(type)) || kind.includes('pass-priority')) return 'response-decline';
  if (kind.includes('private-choice') || kind.includes('hidden_choice')) return 'private-choice';
  if (/counter|disrupt|instant|quick|interrupt/.test(kind)) return 'free-response-play';
  if (/phase|complete-turn|begin-/.test(kind)) return 'phase-transition';
  if (types.some(t => /TRIGGER|VOLTAGE/.test(t))) return 'trigger';
  return 'mini-turn-action';
}

/** Human-readable label for the action that produced `frame`. */
export function commandLabel(command, frame) {
  const cls = commandSemanticClass(command, frame);
  const action = commandAction(command);
  const types = frameEventTypes(frame);
  if (types.some(type => /RESPONSE_WINDOW_CLOSED/.test(type))) return 'Response window closed — no responses';
  if (cls === 'engine-orchestration') return 'Response priority advanced automatically';
  if (cls === 'response-decline') return `${command?.actorId ?? 'Player'} declined a legal response`;
  if (types.some(type => /EXHAUSTED_PASS/.test(type))) return `${command?.actorId ?? 'Player'} took the forced Exhausted Pass`;
  const kindKey = action?.kind ?? command?.type ?? null;
  if (kindKey) {
    return String(kindKey).replace(/^(core|autonomy)-/, '').replaceAll('-', ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }
  // Metadata-only commands (public retained artifacts) carry no action
  // payload; the recorded command id still embeds a readable slug.
  const slug = String(command?.id ?? '').replace(/^CORE-\d+-\d+-\w+?-/, '').replace(/-CORE-\w+$/u, '');
  if (slug && slug !== String(command?.id)) {
    return slug.replace(/^(ORCH-\d+)-/u, 'Orchestration ').replaceAll('-', ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }
  return command?.type ? String(command.type).replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : 'Command';
}

/** True when the class is low-level engine orchestration. */
export const isOrchestrationClass = cls => HIDDEN_CLASSES.has(cls);

// ── Structural frame analysis ───────────────────────────────────

// Recording annotations stamped on metadata-only command index rows by the
// artifact generators (scripts/generate-data.mjs, generate-autonomy-replay-
// artifacts.mjs). A real engine command never carries them — their presence
// means the executable body was elided upstream.
const COMMAND_INDEX_FIELDS = ['commandIndex', 'accepted', 'eventStartIndex', 'eventEndIndex'];

/**
 * True when one command carries genuinely executable content in a shape
 * the engine consumes:
 *   command.action             — RESOLVE_*_ACTION family (incl. core authority)
 *   command.payload.action     — wrapped action envelope
 *   command.play               — DECLARE_PLAY / RESPOND_WITH_PLAY declaration
 *   command.payload + choiceId — HIDDEN_CHOICE direct payload (the only raw
 *                                payload shape the engine reads)
 *   bare `type`                — primitive commands (PASS_PRIORITY,
 *                                RESOLVE_TOP, MOVE_CARD, …) execute on
 *                                type + scalar fields alone — but only when
 *                                no index bookkeeping marks the row as a
 *                                metadata-only summary.
 */
function commandIsExecutable(command) {
  if (!command || typeof command !== 'object') return false;
  if (commandAction(command) != null) return true;
  if (command.play != null) return true;
  if (command.payload != null && command.choiceId != null) return true;
  if (COMMAND_INDEX_FIELDS.some(field => command[field] != null)) return false;
  return typeof command.type === 'string' && command.type.length > 0;
}

/**
 * True when the command stream is executable — every command carries an
 * executable instruction. Retained-artifact command indexes (public lab
 * replays) are metadata-only and cannot drive deterministic reconstruction.
 */
export function commandsExecutable(replay) {
  const commands = replay?.commands;
  if (!Array.isArray(commands) || commands.length === 0) return false;
  return commands.every(commandIsExecutable);
}

/**
 * Canonical frame contract: deterministic command replays produce exactly
 * `commands.length + 1` frames (frame 0 is the initial state). Frame
 * `commandIndex` fields, when present, must run -1 … n-1 in order.
 * @returns {{status:'canonical'|'missing'|'short'|'overshoot'|'misaligned'|'unverifiable',
 *   expected:number|null, actual:number, commandCount:number,
 *   executable:boolean, reason:string}}
 */
export function analyzeFrames(replay) {
  const commands = Array.isArray(replay?.commands) ? replay.commands : null;
  const frames = Array.isArray(replay?.frames) ? replay.frames : [];
  const commandCount = commands?.length ?? 0;
  const executable = commandsExecutable(replay);
  const expected = commands ? commandCount + 1 : null;
  const base = { expected, actual: frames.length, commandCount, executable };
  if (frames.length === 0) {
    return { ...base, status: 'missing', reason: 'No frame data present.' };
  }
  if (expected == null) {
    return { ...base, status: 'unverifiable', reason: 'No command stream — embedded frames cannot be cross-checked.' };
  }
  if (frames.length !== expected) {
    const status = frames.length < expected ? 'short' : 'overshoot';
    return { ...base, status, reason: `${frames.length} frames recorded for ${commandCount} commands (canonical: ${expected}).` };
  }
  // Length matches — verify per-frame alignment when indices are recorded.
  let aligned = true;
  for (let i = 0; i < frames.length; i += 1) {
    const ci = frames[i]?.commandIndex;
    if (ci != null && ci !== i - 1) { aligned = false; break; }
  }
  if (!aligned) {
    return { ...base, status: 'misaligned', reason: 'Frame command indices do not align with the command stream.' };
  }
  return { ...base, status: 'canonical', reason: `Canonical frame sequence: ${frames.length} frames for ${commandCount} commands.` };
}

// ── Artifact classification ─────────────────────────────────────

function classification(artifactClass, evidence, reasons) {
  return { class: artifactClass, evidence, reasons };
}

/**
 * Classify an index record WITHOUT loading its body. `availability` is the
 * build-manifest status for the record's artifact source ('bundled' |
 * 'excluded' | 'runtime' | 'unknown'); `summary` is an optional joined
 * match summary (observatory ndjson) carrying winner/termination evidence.
 * The record's own embedded `summary` field is consulted as a fallback
 * evidence source when the joined summary is absent.
 */
export function classifyIndexRecord(record, { availability = 'unknown', summary = null } = {}) {
  if (!record || typeof record !== 'object') {
    return classification(REPLAY_ARTIFACT_CLASS.UNKNOWN, {}, ['no record']);
  }
  const evidence = {
    fixtureId: record.fixtureId ?? null,
    replayKind: record.replayKind ?? null,
    commandCount: record.commandCount ?? summary?.commandCount ?? null,
    eventCount: record.eventCount ?? summary?.eventCount ?? null,
    turns: summary?.completedFullTurns ?? record.summary?.completedFullTurns ?? null,
    winner: record.winner ?? summary?.winner ?? record.summary?.winner ?? null,
    terminationReason: record.terminationReason ?? summary?.terminationReason ?? record.summary?.terminationReason ?? null,
    initialTurn: summary?.initialTurn ?? record.summary?.initialTurn ?? null,
  };
  const terminal = evidence.winner != null || TERMINAL_REASONS.has(evidence.terminationReason);
  const reasons = [];
  if (availability === 'excluded') reasons.push('replay body excluded from this build');
  if (SCENARIO_KIND_PATTERN.test(String(record.replayKind)) || SCENARIO_ID_PATTERN.test(String(record.fixtureId))) {
    reasons.push('certification/conformance fixture family');
    return classification(REPLAY_ARTIFACT_CLASS.SCENARIO_FIXTURE, evidence, reasons);
  }
  const retainedKind = RETAINED_KIND_PATTERN.test(String(record.replayKind));
  if (terminal) {
    reasons.push(retainedKind
      ? 'retained artifact with recorded terminal state'
      : 'terminal outcome recorded in index/summary');
    return classification(REPLAY_ARTIFACT_CLASS.FULL_MATCH, evidence, reasons);
  }
  if (availability === 'excluded') {
    reasons.push('no terminal evidence and body unavailable');
    return classification(REPLAY_ARTIFACT_CLASS.METADATA_ONLY, evidence, reasons);
  }
  // A retained artifact kind (RETAINED/FULL_MATCH/COMPLETE_MATCH) is
  // supporting naming evidence only — without terminal evidence the record
  // cannot claim complete-match status from index metadata alone.
  reasons.push(retainedKind
    ? 'retained match artifact kind, but no terminal evidence recorded'
    : 'insufficient metadata to prove completeness');
  return classification(REPLAY_ARTIFACT_CLASS.UNKNOWN, evidence, reasons);
}

/**
 * Classify a loaded replay BODY. Consumes the frame analysis (from
 * analyzeFrames / ensureReplayFrames) plus optional index/summary context.
 * Never calls an artifact complete without terminal evidence AND a
 * canonical frame sequence AND a canonical (turn-1) start.
 */
export function classifyReplayBody(replay, { kind = null, indexRecord = null, matchSummary = null, availability = 'unknown' } = {}) {
  if (!replay || typeof replay !== 'object') {
    return classification(REPLAY_ARTIFACT_CLASS.METADATA_ONLY, {}, ['no replay body']);
  }
  if (availability === 'excluded') {
    return classification(REPLAY_ARTIFACT_CLASS.METADATA_ONLY, {}, ['replay body excluded from this build']);
  }
  const analysis = analyzeFrames(replay);
  const frames = Array.isArray(replay.frames) ? replay.frames : [];
  const first = frames[0] ?? null;
  const last = frames[frames.length - 1] ?? null;
  const initialTurn = replay.initialState?.fullTurnSequence ?? frameTurn(first);
  const finalTurn = frameTurn(last);
  const winner = frameWinner(last) ?? matchSummary?.winner ?? indexRecord?.winner ?? null;
  const terminationReason = matchSummary?.terminationReason ?? indexRecord?.terminationReason
    ?? (frameTerminalType(last) ? 'TERMINAL_EVENT' : null);
  const frameIntegrity = replay._frameIntegrity ?? (analysis.status === 'canonical' ? 'embedded' : null);
  const evidence = {
    fixtureId: replay.fixtureId ?? replay.matchId ?? indexRecord?.fixtureId ?? null,
    replayKind: replay.replayKind ?? indexRecord?.replayKind ?? null,
    source: kind ?? null,
    commandCount: analysis.commandCount,
    frameCount: analysis.actual,
    expectedFrames: analysis.expected,
    initialTurn, finalTurn,
    turns: matchSummary?.completedFullTurns ?? (Number.isFinite(initialTurn) && Number.isFinite(finalTurn) ? Math.max(0, finalTurn - initialTurn) : null),
    winner, terminationReason,
    frameStatus: analysis.status,
    frameIntegrity,
    hash: indexRecord?.certifiedReplayContentHash ?? indexRecord?.authorizedArtifactHash
      ?? replay.contentHash ?? replay.integrityHash ?? replay.artifactHash ?? null,
  };
  const reasons = [];
  const isScenario = SCENARIO_KIND_PATTERN.test(String(evidence.replayKind))
    || SCENARIO_ID_PATTERN.test(String(evidence.fixtureId));
  if (frameIntegrity === FRAME_INTEGRITY.DIVERGED) {
    reasons.push('reconstructed trajectory diverges from the recorded final state hash');
    return classification(REPLAY_ARTIFACT_CLASS.PARTIAL_REPLAY, evidence, reasons);
  }
  if (analysis.status === 'short' || analysis.status === 'overshoot' || analysis.status === 'misaligned') {
    if (analysis.status !== 'canonical' && !analysis.executable) {
      reasons.push(analysis.reason);
      reasons.push('command stream is not executable — frames cannot be repaired');
      return classification(REPLAY_ARTIFACT_CLASS.PARTIAL_REPLAY, evidence, reasons);
    }
  }
  if (isScenario) {
    reasons.push('certification/conformance fixture family');
    if (Number.isFinite(initialTurn) && initialTurn > 1) reasons.push(`scenario begins at turn ${initialTurn}`);
    return classification(REPLAY_ARTIFACT_CLASS.SCENARIO_FIXTURE, evidence, reasons);
  }
  if (frames.length === 0) {
    reasons.push('no frames could be produced for this artifact');
    return classification(analysis.commandCount > 0 ? REPLAY_ARTIFACT_CLASS.PARTIAL_REPLAY : REPLAY_ARTIFACT_CLASS.UNKNOWN,
      evidence, reasons);
  }
  const canonical = analysis.status === 'canonical' || (analysis.status === 'unverifiable' && frames.length > 0);
  const terminal = winner != null || (terminationReason != null && terminationReason !== 'TERMINAL_EVENT') || frameTerminalType(last) != null;
  const canonicalStart = !Number.isFinite(initialTurn) || initialTurn <= 1;
  if (canonical && terminal && canonicalStart) {
    reasons.push('canonical frame sequence covers initial state to recorded terminal state');
    if (frameIntegrity === FRAME_INTEGRITY.VERIFIED) reasons.push('reconstruction verified against finalStateHash');
    if (frameIntegrity === FRAME_INTEGRITY.RECONSTRUCTED) reasons.push('reconstruction unverified (no hash evidence)');
    return classification(REPLAY_ARTIFACT_CLASS.FULL_MATCH, evidence, reasons);
  }
  if (!canonical) {
    reasons.push(analysis.reason);
    return classification(REPLAY_ARTIFACT_CLASS.PARTIAL_REPLAY, evidence, reasons);
  }
  if (!canonicalStart) {
    reasons.push(`replay begins at turn ${initialTurn} — earlier gameplay is not in this artifact`);
    return classification(REPLAY_ARTIFACT_CLASS.PARTIAL_REPLAY, evidence, reasons);
  }
  reasons.push('no terminal state is recorded for this artifact');
  return classification(REPLAY_ARTIFACT_CLASS.PARTIAL_REPLAY, evidence, reasons);
}

// ── Candidate chronology (open-a-full-match selection) ──────────

// Genuine timestamp fields, checked in order. Match ordinals, evidence
// epochs, run ids, hashes, and array positions are NOT chronology and are
// deliberately absent from this list.
const TIMESTAMP_FIELDS = ['completedAt', 'endedAt', 'recordedAt', 'timestamp', 'generatedAt'];

/**
 * The wall-clock time recorded on a replay record or joined summary, in
 * epoch ms — or null when no real timestamp exists. Numeric values are
 * taken as ms; strings must parse as dates. Never synthesizes ordering
 * from ids, ordinals, or evidence-epoch tags.
 */
export function recordedTimestampMs(...sources) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const field of TIMESTAMP_FIELDS) {
      const raw = source[field];
      const ms = typeof raw === 'number' ? raw
        : typeof raw === 'string' ? Date.parse(raw) : NaN;
      if (Number.isFinite(ms)) return ms;
    }
  }
  return null;
}

/**
 * Order FULL_MATCH candidates for the "open a full match" action.
 *
 * Each candidate: { id, record, summary, cls } — `cls` is the
 * classifyIndexRecord result, `record`/`summary` the joined metadata.
 *
 *   - Candidates with a real recorded timestamp sort newest-first.
 *   - When NO candidate carries chronology (the bundled index schema
 *     records none), the documented deterministic fallback prefers the
 *     richest recorded evidence — most completed turns — with the id as
 *     an order-independent tiebreak. That fallback is a pick, not a
 *     "latest" claim.
 *
 * Returns a new sorted array; the input is not mutated.
 */
export function orderFullMatchCandidates(candidates) {
  const scored = (Array.isArray(candidates) ? candidates : [])
    .map(c => ({ ...c, ts: recordedTimestampMs(c?.record, c?.summary) }));
  const timed = scored.filter(c => c.ts != null);
  const ordered = timed.length === scored.length ? scored
    : timed.length ? timed
    : scored;
  return ordered.sort((a, b) =>
    (b.ts ?? 0) - (a.ts ?? 0)
    || (b.cls?.evidence?.turns ?? 0) - (a.cls?.evidence?.turns ?? 0)
    || String(a.id ?? '').localeCompare(String(b.id ?? '')));
}

// ── Presentation ────────────────────────────────────────────────

export const ARTIFACT_CLASS_LABEL = Object.freeze({
  FULL_MATCH: 'Full match',
  SCENARIO_FIXTURE: 'Scenario fixture',
  PARTIAL_REPLAY: 'Partial replay',
  METADATA_ONLY: 'Metadata only',
  UNKNOWN: 'Unknown artifact',
});

/** Short uppercase artifact line, e.g. "FULL MATCH · 56 TURNS · 453 COMMANDS". */
export function artifactHeadline(result) {
  const ev = result?.evidence ?? {};
  const parts = [ARTIFACT_CLASS_LABEL[result?.class]?.toUpperCase() ?? 'UNKNOWN'];
  switch (result?.class) {
    case REPLAY_ARTIFACT_CLASS.METADATA_ONLY:
      parts.push('REPLAY BODY NOT PRESENT IN THIS BUILD');
      break;
    case REPLAY_ARTIFACT_CLASS.SCENARIO_FIXTURE:
      if (Number.isFinite(ev.initialTurn) && ev.initialTurn > 1) parts.push(`STARTS TURN ${ev.initialTurn}`);
      if (ev.commandCount != null) parts.push(`${ev.commandCount} COMMANDS`);
      break;
    case REPLAY_ARTIFACT_CLASS.FULL_MATCH:
      if (ev.turns != null) parts.push(`${ev.turns} TURNS`);
      if (ev.commandCount != null) parts.push(`${ev.commandCount} COMMANDS`);
      if (ev.frameCount != null) parts.push(`${ev.frameCount} FRAMES`);
      parts.push('COMPLETE');
      break;
    case REPLAY_ARTIFACT_CLASS.PARTIAL_REPLAY:
      if (Number.isFinite(ev.initialTurn) && ev.initialTurn > 1) parts.push(`STARTS TURN ${ev.initialTurn}`);
      if (ev.commandCount != null) parts.push(`${ev.commandCount} COMMANDS`);
      if (ev.frameCount != null) parts.push(`${ev.frameCount} FRAMES`);
      break;
    default:
      if (ev.commandCount != null) parts.push(`${ev.commandCount} COMMANDS`);
      break;
  }
  return parts.join(' · ');
}

/**
 * Timeline mode models.
 *   'all'     — every canonical frame (nothing hidden).
 *   'actions' — every frame except engine orchestration + summaries.
 *   'turns'   — frames grouped by observed full-turn; presentation
 *               grouping only, no evidence is removed.
 */
export const TIMELINE_MODES = Object.freeze(['turns', 'actions', 'all']);

/**
 * Build the timeline model for a replay.
 * @param {object} replay - normalized replay (frames + commands)
 * @param {object} [opts]
 * @param {'all'|'actions'|'turns'} [opts.mode]
 * @param {number} [opts.currentFrame] - current frame index (turn mode: the
 *   turn containing it is flagged so callers can expand it)
 * @returns {{mode:string, totalFrames:number, visibleCount:number,
 *   hiddenOrchestration:number, items:Array, groups:Array,
 *   currentGroup:number|null}}
 */
export function timelineModel(replay, { mode = 'all', currentFrame = null } = {}) {
  const frames = Array.isArray(replay?.frames) ? replay.frames : [];
  const items = frames.map((frame, index) => {
    const command = frameCommand(replay, index);
    const cls = index === 0 ? 'initial' : commandSemanticClass(command, frame);
    return {
      index, frame, command,
      class: cls,
      turn: frameTurn(frame),
      label: index === 0 ? 'Start' : commandLabel(command, frame),
    };
  });
  const hiddenOrchestration = items.filter(i => isOrchestrationClass(i.class)).length;
  // Turn grouping — consecutive runs of equal observed fullTurnSequence.
  // Frames with no readable turn fold into the adjacent group ('—').
  const groups = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && item.turn === last.turn) {
      last.items.push(item); last.lastIndex = item.index; last.count += 1;
    } else {
      groups.push({ turn: item.turn, seat: null, firstIndex: item.index, lastIndex: item.index, count: 1, items: [item] });
    }
  }
  for (const g of groups) {
    const s = frameState(g.items[g.items.length - 1].frame);
    g.seat = s?.activePlayerId ?? null;
  }
  const currentGroup = currentFrame == null ? null
    : groups.findIndex(g => currentFrame >= g.firstIndex && currentFrame <= g.lastIndex);
  const visibleItems = mode === 'actions' ? items.filter(i => !isOrchestrationClass(i.class)) : items;
  const visibleCount = mode === 'turns' ? groups.length : visibleItems.length;
  const hiddenCount = mode === 'actions' ? hiddenOrchestration
    : mode === 'turns' ? Math.max(0, items.length - visibleCount) : 0;
  return {
    mode, items: visibleItems, groups,
    totalFrames: items.length,
    visibleCount,
    hiddenOrchestration: mode === 'all' ? 0 : hiddenOrchestration,
    hiddenCount,
    turnCount: groups.filter(g => g.turn != null).length,
    currentGroup,
  };
}
