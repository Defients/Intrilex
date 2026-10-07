import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// FULL-MATCH WATCH CONTRACT — behavioral coverage for the replay
// completeness layer that keeps certification fixtures, metadata-only
// records, and partial artifacts from masquerading as complete matches:
//
//   replay-contract.mjs — pure classification/frame/timeline model
//   replay-frames.js    — canonical frame validation + reconstruction
//   replay-resolver.js  — classification attachment to resolved replays
//
// Real artifacts under sample-data/ are used where available so the
// contract is proven against the actual evidence shapes.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contract = await import(pathToFileURL(path.join(root, 'apps/lab-web/src/replay-contract.mjs')).href);
const framesModule = await import(pathToFileURL(path.join(root, 'apps/lab-web/src/replay-frames.js')).href);
const resolver = await import(pathToFileURL(path.join(root, 'apps/lab-web/src/replay-resolver.js')).href);
const transportModule = await import(pathToFileURL(path.join(root, 'apps/lab-web/src/replay-transport.mjs')).href);

const {
  REPLAY_ARTIFACT_CLASS, FRAME_INTEGRITY, TIMELINE_MODES,
  classifyIndexRecord, classifyReplayBody, timelineModel,
  artifactHeadline, commandsExecutable,
  recordedTimestampMs, orderFullMatchCandidates,
} = contract;
const { ensureReplayFrames, hasRedactedInitialState } = framesModule;
const { REPLAY_STATUS, REPLAY_FAILURE, resolveReplay, describeWatchStandby } = resolver;
const { createReplayTransport } = transportModule;

const loadJson = async (rel) => JSON.parse(await readFile(path.join(root, rel), 'utf8'));

// ── Helpers ─────────────────────────────────────────────────────

/** A trivially executable command envelope (action payload present). */
const executableEnvelope = (commands = 3, opts = {}) => ({
  format: 'intrilex-replay',
  fixtureId: opts.fixtureId ?? 'SIM-1',
  initialState: opts.initialState ?? { fullTurnSequence: 1, phase: 'Draw', players: { P1: {}, P2: {} } },
  commands: Array.from({ length: commands }, (_, i) => ({
    id: `SIM-${i}`, actorId: 'P1', type: 'SIM_ACTION',
    action: { kind: 'sim-step' },
  })),
  events: [],
  finalStateHash: opts.finalStateHash ?? null,
});

/** Minimal engine double: applies a deterministic marker per command. */
const fakeEngineModule = {
  IntrilexEngine: class {
    execute(state, command) {
      const i = Number(String(command.id).split('-').pop()) || 0;
      return { state: { ...state, step: i + 1 }, events: [{ type: 'SIM_STEPPED' }], accepted: true };
    }
  },
  hashCanonical: (s) => `hash-${s?.step ?? 'x'}`,
};

const fakeEnsureFrames = async (replay) => {
  replay.frames = [
    { state: replay.initialState, eventTypes: [], commandIndex: -1 },
    ...(replay.commands ?? []).map((command, i) => ({
      state: {}, eventTypes: [], commandIndex: i,
    })),
  ];
  return replay;
};

// ═══════════════════════════════════════════════════════════════
// 1. Index-record classification (no body needed)
// ═══════════════════════════════════════════════════════════════

test('certification fixture records classify as SCENARIO_FIXTURE', () => {
  const cls = classifyIndexRecord(
    { fixtureId: 'CT-001', replayKind: 'GOVERNING_CONFORMANCE_V4_1_2', commandCount: 2 },
    { availability: 'bundled' });
  assert.equal(cls.class, REPLAY_ARTIFACT_CLASS.SCENARIO_FIXTURE);
  assert.equal(cls.evidence.commandCount, 2);
});

test('retained match records with terminal evidence classify as FULL_MATCH', () => {
  const cls = classifyIndexRecord(
    { fixtureId: 'M-abc', replayKind: 'ADVANCED_CORE_RETAINED', commandCount: 334 },
    { availability: 'bundled', summary: { completedFullTurns: 41, winner: 'P2', terminationReason: 'VICTORY' } });
  assert.equal(cls.class, REPLAY_ARTIFACT_CLASS.FULL_MATCH);
  assert.equal(cls.evidence.turns, 41);
});

test('a retained record WITH terminal evidence but WITHOUT the retained kind is still FULL_MATCH', () => {
  const cls = classifyIndexRecord(
    { fixtureId: 'M-plain', replayKind: 'CAMPAIGN_MATCH', commandCount: 100 },
    { availability: 'bundled', summary: { winner: 'P1', terminationReason: 'VICTORY' } });
  assert.equal(cls.class, REPLAY_ARTIFACT_CLASS.FULL_MATCH);
});

test('retained kind alone never proves FULL_MATCH — terminal evidence is required', () => {
  for (const kind of ['ADVANCED_CORE_RETAINED', 'FULL_MATCH_ARCHIVE', 'COMPLETE_MATCH_LOG']) {
    const bundled = classifyIndexRecord(
      { fixtureId: 'M-no-terminal', replayKind: kind, commandCount: 400 },
      { availability: 'bundled' });
    assert.notEqual(bundled.class, REPLAY_ARTIFACT_CLASS.FULL_MATCH,
      `${kind} must not classify as FULL_MATCH on kind alone`);
    assert.equal(bundled.class, REPLAY_ARTIFACT_CLASS.UNKNOWN);
    // An accepted canonical termination reason is sufficient terminal evidence.
    const terminated = classifyIndexRecord(
      { fixtureId: 'M-no-terminal', replayKind: kind, commandCount: 400 },
      { availability: 'bundled', summary: { terminationReason: 'DECISION_LIMIT' } });
    assert.equal(terminated.class, REPLAY_ARTIFACT_CLASS.FULL_MATCH);
  }
});

test('a retained record without terminal evidence and an excluded body is METADATA_ONLY', () => {
  const cls = classifyIndexRecord(
    { fixtureId: 'M-retained-ghost', replayKind: 'ADVANCED_CORE_RETAINED', commandCount: 400 },
    { availability: 'excluded' });
  assert.equal(cls.class, REPLAY_ARTIFACT_CLASS.METADATA_ONLY);
});

test('scenario-fixture detection still outranks retained kind and terminal evidence', () => {
  const cls = classifyIndexRecord(
    { fixtureId: 'CT-777', replayKind: 'GOVERNING_CONFORMANCE_RETAINED', commandCount: 20 },
    { availability: 'bundled', summary: { winner: 'P1', terminationReason: 'VICTORY' } });
  assert.equal(cls.class, REPLAY_ARTIFACT_CLASS.SCENARIO_FIXTURE);
});

test('excluded bodies without terminal evidence classify as METADATA_ONLY', () => {
  const cls = classifyIndexRecord(
    { fixtureId: 'M-ghost', replayKind: 'CAMPAIGN_EPHEMERAL', commandCount: 300 },
    { availability: 'excluded' });
  assert.equal(cls.class, REPLAY_ARTIFACT_CLASS.METADATA_ONLY);
});

test('a record with no classifiable evidence is UNKNOWN, never full match', () => {
  const cls = classifyIndexRecord(
    { fixtureId: 'X-1', replayKind: 'SOME_KIND', commandCount: 900 },
    { availability: 'bundled' });
  assert.equal(cls.class, REPLAY_ARTIFACT_CLASS.UNKNOWN);
});

// ═══════════════════════════════════════════════════════════════
// 2. Real artifact classification
// ═══════════════════════════════════════════════════════════════

test('CT-001 public artifact classifies as scenario fixture, not a match', async () => {
  const artifactPath = 'sample-data/replays/public/CT-001.json';
  if (!existsSync(path.join(root, artifactPath))) return;
  const replay = await loadJson(artifactPath);
  const cls = classifyReplayBody(replay, { kind: 'corpus' });
  assert.equal(cls.class, REPLAY_ARTIFACT_CLASS.SCENARIO_FIXTURE);
  assert.equal(cls.evidence.commandCount, 2);
  assert.equal(cls.evidence.initialTurn, 20, 'CT-001 begins mid-match — the truncated-game illusion');
  const headline = artifactHeadline(cls);
  assert.match(headline, /SCENARIO FIXTURE/);
  assert.match(headline, /STARTS TURN 20/);
  assert.match(headline, /2 COMMANDS/);
});

test('a retained lab replay classifies as FULL_MATCH with canonical frames', async () => {
  const dir = path.join(root, 'sample-data/autonomy/lab-replays/public');
  if (!existsSync(dir)) return;
  const files = (await readdir(dir)).filter(f => f.endsWith('.json'));
  assert.ok(files.length > 0, 'retained lab artifacts must exist');
  const replay = await loadJson(`sample-data/autonomy/lab-replays/public/${files[0]}`);
  await ensureReplayFrames(replay);
  const cls = classifyReplayBody(replay, { kind: 'autonomy' });
  assert.equal(cls.class, REPLAY_ARTIFACT_CLASS.FULL_MATCH);
  assert.equal(cls.evidence.frameStatus, 'canonical');
  assert.ok(cls.evidence.turns > 0);
  assert.ok(cls.evidence.winner != null || cls.evidence.terminationReason != null);
  assert.match(artifactHeadline(cls), /FULL MATCH .* COMMANDS .* FRAMES .* COMPLETE/);
});

test('the longest retained match proves Start → End navigation is complete', async () => {
  const dir = path.join(root, 'sample-data/autonomy/lab-replays/public');
  if (!existsSync(dir)) return;
  const files = (await readdir(dir)).filter(f => f.endsWith('.json'));
  let longest = null;
  let longestNonTerminal = null;
  for (const f of files) {
    const r = await loadJson(`sample-data/autonomy/lab-replays/public/${f}`);
    const last = r.frames?.at(-1);
    const terminal = contract.frameWinner(last) != null || contract.frameTerminalType(last) != null;
    if (terminal && (!longest || r.commands.length > longest.commands.length)) longest = r;
    if (!terminal && (!longestNonTerminal || (r.commands?.length ?? 0) > (longestNonTerminal.commands?.length ?? 0))) longestNonTerminal = r;
  }
  // A canonical but non-terminal artifact (limit-exhausted mid-match) must
  // NOT be sold as a full match — honest PARTIAL_REPLAY instead.
  if (longestNonTerminal) {
    const partialCls = classifyReplayBody(longestNonTerminal, { kind: 'autonomy' });
    assert.equal(partialCls.class, REPLAY_ARTIFACT_CLASS.PARTIAL_REPLAY,
      'long replay without recorded terminal state must not claim FULL_MATCH');
  }
  assert.ok(longest, 'at least one retained match must carry terminal evidence');
  assert.ok(longest.commands.length >= 100, `expected a genuinely long replay, got ${longest.commands.length}`);
  await ensureReplayFrames(longest);
  const cls = classifyReplayBody(longest, { kind: 'autonomy' });
  assert.equal(cls.class, REPLAY_ARTIFACT_CLASS.FULL_MATCH);
  assert.equal(longest.frames.length, longest.commands.length + 1,
    'canonical contract: frames = commands + 1');
  // Drive the real transport from frame 0 to the terminal frame — this is
  // the Start→End navigation guarantee behind the FULL_MATCH label.
  const state = { playing: false, timer: null, frame: 0, speed: 1, replay: longest };
  const transport = createReplayTransport({
    getState: () => state,
    setCurrentFrame: (i) => { state.frame = i; },
    render: () => {},
    setTimer: () => 0,
    clearTimer: () => {},
  });
  transport.stepTo(longest.frames.length - 1);
  assert.equal(state.frame, longest.frames.length - 1);
  const terminal = longest.frames.at(-1);
  const terminalEvidence = contract.frameWinner(terminal)
    ?? contract.frameTerminalType(terminal);
  assert.ok(terminalEvidence, 'terminal frame must carry winner or terminal event');
});

// ═══════════════════════════════════════════════════════════════
// 3. Frame completeness validation (ensureReplayFrames)
// ═══════════════════════════════════════════════════════════════

test('canonical embedded frames are kept untouched', async () => {
  const replay = executableEnvelope(2);
  replay.frames = [
    { commandIndex: -1, state: {}, eventTypes: [] },
    { commandIndex: 0, state: {}, eventTypes: [] },
    { commandIndex: 1, state: {}, eventTypes: [] },
  ];
  const before = replay.frames;
  await ensureReplayFrames(replay, { engineModule: fakeEngineModule });
  assert.equal(replay.frames, before, 'canonical embedded frames must be preserved by reference');
  assert.equal(replay._frameIntegrity, FRAME_INTEGRITY.EMBEDDED);
  assert.equal(replay._frameAnalysis.status, 'canonical');
});

test('missing frames + executable commands reconstruct to commands + 1', async () => {
  const replay = executableEnvelope(4);
  await ensureReplayFrames(replay, { engineModule: fakeEngineModule });
  assert.equal(replay.frames.length, 5);
  assert.equal(replay._frameAnalysis.status, 'canonical');
  assert.equal(replay._frameIntegrity, FRAME_INTEGRITY.RECONSTRUCTED);
  assert.equal(replay.frames[0].commandIndex, -1);
  assert.equal(replay.frames[4].state.step, 4);
});

test('intentionally incomplete frames are rebuilt when commands are executable', async () => {
  const replay = executableEnvelope(4);
  // Simulate a sampled artifact: 4 commands, only 2 frames.
  replay.frames = [
    { commandIndex: -1, state: { sampled: true }, eventTypes: [] },
    { commandIndex: 1, state: { sampled: true }, eventTypes: [] },
  ];
  await ensureReplayFrames(replay, { engineModule: fakeEngineModule });
  assert.equal(replay.frames.length, 5, 'incomplete frames must be repaired to canonical length');
  assert.equal(replay.frames[1].commandIndex, 0);
});

test('reconstruction verified against finalStateHash; mismatch is divergence', async () => {
  const replay = executableEnvelope(2, { finalStateHash: 'hash-2' });
  await ensureReplayFrames(replay, { engineModule: fakeEngineModule });
  assert.equal(replay._frameIntegrity, FRAME_INTEGRITY.VERIFIED);

  const diverged = executableEnvelope(2, { finalStateHash: 'hash-WRONG' });
  await ensureReplayFrames(diverged, { engineModule: fakeEngineModule });
  assert.equal(diverged._frameIntegrity, FRAME_INTEGRITY.DIVERGED);
  assert.equal(diverged.frames.length, 0,
    'a diverged trajectory is withheld rather than presented as canonical');
  const cls = classifyReplayBody(diverged);
  assert.equal(cls.class, REPLAY_ARTIFACT_CLASS.PARTIAL_REPLAY);
});

test('privacy-redacted initialState refuses reconstruction honestly', async () => {
  const replay = executableEnvelope(3, {
    initialState: { cards: { 'OPAQUE-HIDDEN-CARD-1': { id: 'OPAQUE-HIDDEN-CARD-1', identity: 'HIDDEN' } } },
  });
  assert.ok(hasRedactedInitialState(replay));
  await ensureReplayFrames(replay, { engineModule: fakeEngineModule });
  assert.equal(replay.frames.length, 0);
  assert.equal(replay._frameIntegrity, FRAME_INTEGRITY.UNRECONSTRUCTABLE);
  assert.match(replay._frameAnalysis.reason, /redacted/i);
  const cls = classifyReplayBody(replay);
  assert.equal(cls.class, REPLAY_ARTIFACT_CLASS.PARTIAL_REPLAY);
});

test('non-executable command indexes keep embedded frames but flag partial', async () => {
  // Public retained artifacts carry metadata-only command indexes — they
  // cannot drive re-execution. Embedded frames are still real evidence.
  const replay = {
    fixtureId: 'M-x',
    commands: [{ id: 'C-0', commandIndex: 0 }, { id: 'C-1', commandIndex: 1 }],
    frames: [{ commandIndex: -1, state: {}, eventTypes: [] }],
  };
  assert.equal(commandsExecutable(replay), false);
  await ensureReplayFrames(replay, { engineModule: fakeEngineModule });
  assert.equal(replay.frames.length, 1, 'recorded frames are evidence — never discarded');
  assert.equal(replay._frameIntegrity, FRAME_INTEGRITY.PARTIAL);
});

test('commandsExecutable accepts every engine-consumed command shape', () => {
  const replay = {
    commands: [
      // Wrapped action envelope.
      { id: 'C-0', type: 'RESOLVE_PHASE15_ACTION', actorId: 'P1', payload: { action: { kind: 'x' } } },
      // Direct action envelope.
      { id: 'C-1', type: 'RESOLVE_CORE_AUTHORITY_ACTION', actorId: 'P1', action: { kind: 'core-begin-start' } },
      // Declaration primitive (play descriptor, no action field).
      { id: 'C-2', type: 'DECLARE_PLAY', actorId: 'P1', play: { kind: 'primary', sourceCardIds: ['A'] } },
      // HIDDEN_CHOICE — the only raw command.payload the engine reads.
      { id: 'C-3', type: 'HIDDEN_CHOICE', actorId: 'P1', choiceId: 'ch-1', payload: 2, visibility: 'authorized' },
      // Bare primitives execute on type + scalar fields alone.
      { id: 'C-4', type: 'PASS_PRIORITY', actorId: 'P1' },
      { id: 'C-5', type: 'RESOLVE_TOP' },
    ],
  };
  assert.equal(commandsExecutable(replay), true);
});

test('commandsExecutable rejects metadata payloads and index rows', () => {
  // A bare payload object is not an executable instruction — the engine
  // only reads command.payload for HIDDEN_CHOICE (paired with choiceId).
  assert.equal(commandsExecutable({ commands: [{ payload: { metadata: 'note only' } }] }), false);
  assert.equal(commandsExecutable({ commands: [{ payload: { metadata: 'x' }, another: 1 }] }), false);
  // Metadata-only command index rows (public retained artifacts) carry
  // recording annotations instead of an executable body.
  const indexRow = {
    commandIndex: 0, id: 'CORE-1-1-P1-ORCH-0-START', type: 'RESOLVE_CORE_AUTHORITY_ACTION',
    semanticClass: 'engine-orchestration', actorId: 'P1', accepted: true,
    eventStartIndex: 0, eventEndIndex: 3,
  };
  assert.equal(commandsExecutable({ commands: [indexRow, indexRow] }), false);
  // One bad row poisons the whole stream — deterministic reconstruction
  // requires every command to be replayable.
  assert.equal(commandsExecutable({ commands: [{ id: 'C-0', type: 'PASS_PRIORITY', actorId: 'P1' }, indexRow] }), false);
  // Empty / missing streams are not executable.
  assert.equal(commandsExecutable({ commands: [] }), false);
  assert.equal(commandsExecutable({}), false);
});

test('metadata-only command indexes are refused reconstruction, never fabricated', async () => {
  // An artifact whose commands are index rows plus a real initialState
  // must NOT be re-executed — the rows carry no executable body.
  const replay = {
    fixtureId: 'M-index',
    initialState: { fullTurnSequence: 1, players: { P1: {}, P2: {} } },
    commands: [
      { commandIndex: 0, id: 'C-0', type: 'RESOLVE_CORE_AUTHORITY_ACTION', actorId: 'P1', accepted: true, eventStartIndex: 0, eventEndIndex: 2 },
      { commandIndex: 1, id: 'C-1', type: 'RESOLVE_CORE_AUTHORITY_ACTION', actorId: 'P2', accepted: true, eventStartIndex: 2, eventEndIndex: 5 },
    ],
  };
  assert.equal(commandsExecutable(replay), false);
  await ensureReplayFrames(replay, { engineModule: fakeEngineModule });
  assert.equal(replay.frames.length, 0, 'no frames may be fabricated from metadata rows');
  assert.equal(replay._frameIntegrity, FRAME_INTEGRITY.UNRECONSTRUCTABLE);
});

test('primitive command streams still reconstruct through ensureReplayFrames', async () => {
  // Certified replays mix action envelopes with bare primitives — the
  // whole stream must remain executable or reconstruction is refused.
  const replay = {
    format: 'intrilex-replay',
    fixtureId: 'SIM-prim',
    initialState: { fullTurnSequence: 1, players: { P1: {}, P2: {} } },
    commands: [
      { id: 'SIM-0', type: 'DECLARE_PLAY', actorId: 'P1', play: { kind: 'primary' } },
      { id: 'SIM-1', type: 'PASS_PRIORITY', actorId: 'P2' },
      { id: 'SIM-2', type: 'RESOLVE_TOP' },
      { id: 'SIM-3', type: 'HIDDEN_CHOICE', actorId: 'P1', choiceId: 'ch-9', payload: 4 },
    ],
    events: [],
  };
  await ensureReplayFrames(replay, { engineModule: fakeEngineModule });
  assert.equal(replay.frames.length, 5, 'commands + 1 canonical frames reconstructed');
  assert.equal(replay._frameAnalysis.status, 'canonical');
  assert.equal(replay._frameIntegrity, FRAME_INTEGRITY.RECONSTRUCTED);
});

// ═══════════════════════════════════════════════════════════════
// 3b. Full-match candidate chronology (open-a-full-match selection)
// ═══════════════════════════════════════════════════════════════

test('recordedTimestampMs reads only genuine timestamp fields', () => {
  assert.equal(recordedTimestampMs({ completedAt: '2026-10-01T12:00:00Z' }), Date.parse('2026-10-01T12:00:00Z'));
  assert.equal(recordedTimestampMs({ completedAt: 1_700_000_000_000 }), 1_700_000_000_000);
  assert.equal(recordedTimestampMs({ completedAt: 'garbage' }), null);
  assert.equal(recordedTimestampMs({ matchOrdinal: 5 }), null, 'ordinals are not chronology');
  assert.equal(recordedTimestampMs({ evidenceEpoch: 'post-rules-parity-repair-v0.28.1' }), null);
  assert.equal(recordedTimestampMs({ fixtureId: 'M-9c890ada2c2ec493c6f9' }), null, 'ids are not chronology');
  assert.equal(recordedTimestampMs(null, undefined, {}), null);
  // Joined summary supplies the timestamp when the record lacks one.
  assert.equal(recordedTimestampMs({}, { completedAt: '2026-10-02T00:00:00Z' }),
    Date.parse('2026-10-02T00:00:00Z'));
});

test('orderFullMatchCandidates prefers the newest real timestamp', () => {
  const mk = (id, ts, turns) => ({ id, record: { completedAt: ts }, cls: { evidence: { turns } } });
  const ordered = orderFullMatchCandidates([
    mk('M-old', '2026-09-01T00:00:00Z', 60),
    mk('M-new', '2026-10-01T00:00:00Z', 10),
    mk('M-mid', '2026-09-15T00:00:00Z', 40),
  ]);
  assert.equal(ordered[0].id, 'M-new', 'newest recorded completion wins even over richer evidence');
  assert.equal(ordered.at(-1).id, 'M-old');
});

test('orderFullMatchCandidates falls back deterministically when no chronology exists', () => {
  const mk = (id, turns) => ({ id, record: { fixtureId: id }, cls: { evidence: { turns } } });
  const first = orderFullMatchCandidates([mk('M-b', 30), mk('M-a', 50), mk('M-c', 10)]);
  assert.equal(first[0].id, 'M-a', 'documented fallback: richest recorded evidence (most turns)');
  const second = orderFullMatchCandidates([mk('M-c', 10), mk('M-a', 50), mk('M-b', 30)]);
  assert.equal(second[0].id, 'M-a', 'selection is order-independent');
  // Same turns → id tiebreak keeps the pick deterministic.
  const tied = orderFullMatchCandidates([mk('M-z', 20), mk('M-y', 20)]);
  assert.equal(tied[0].id, 'M-y');
});

test('orderFullMatchCandidates prefers provably-timed records over untimed ones', () => {
  const ordered = orderFullMatchCandidates([
    { id: 'M-untimed', record: { fixtureId: 'M-untimed' }, cls: { evidence: { turns: 500 } } },
    { id: 'M-timed', record: { completedAt: '2026-10-01T00:00:00Z' }, cls: { evidence: { turns: 5 } } },
  ]);
  assert.equal(ordered[0].id, 'M-timed', 'a real timestamp is better evidence than none');
});

// ═══════════════════════════════════════════════════════════════
// 4. Timeline model — All / Actions / Turns
// ═══════════════════════════════════════════════════════════════

const syntheticReplay = () => ({
  commands: [
    { id: 'c0', actorId: 'P1', action: { kind: 'play-card' } },
    { id: 'c1', actorId: 'P1', semanticClass: 'engine-orchestration' },
    { id: 'c2', actorId: 'P2', action: { kind: 'counter-play' } },
    { id: 'c3', actorId: 'P2', action: { kind: 'complete-turn' } },
  ],
  frames: [
    { commandIndex: -1, state: { fullTurnSequence: 1, activePlayerId: 'P1' }, eventTypes: [] },
    { commandIndex: 0, state: { fullTurnSequence: 1, activePlayerId: 'P1' }, eventTypes: ['CARD_PLAYED'] },
    { commandIndex: 1, state: { fullTurnSequence: 1, activePlayerId: 'P2' }, eventTypes: ['AUTOMATIC_PRIORITY_ADVANCE'] },
    { commandIndex: 2, state: { fullTurnSequence: 2, activePlayerId: 'P2' }, eventTypes: ['RESPONSE_DECLINED'] },
    { commandIndex: 3, state: { fullTurnSequence: 2, activePlayerId: 'P1' }, eventTypes: ['TURN_COMPLETED'] },
  ],
});

test('All mode exposes every canonical frame', () => {
  const model = timelineModel(syntheticReplay(), { mode: 'all' });
  assert.equal(model.items.length, 5);
  assert.equal(model.hiddenCount, 0);
});

test('Actions mode hides engine orchestration without losing player actions', () => {
  const model = timelineModel(syntheticReplay(), { mode: 'actions' });
  assert.equal(model.items.length, 4);
  assert.equal(model.hiddenOrchestration, 1);
  assert.ok(model.items.every(i => i.class !== 'engine-orchestration'));
  assert.ok(model.items.some(i => i.index === 3), 'player action frames survive');
});

test('Turns mode groups every observed turn without removing evidence', () => {
  const model = timelineModel(syntheticReplay(), { mode: 'turns', currentFrame: 3 });
  assert.equal(model.turnCount, 2);
  assert.equal(model.groups.length, 2);
  assert.equal(model.groups.reduce((a, g) => a + g.count, 0), 5, 'grouping is presentation only — all frames remain');
  assert.equal(model.currentGroup, 1, 'the group containing frame 3 is flagged current');
});

test('timeline modes are exactly the supported contract set', () => {
  assert.deepEqual([...TIMELINE_MODES], ['turns', 'actions', 'all']);
});

// ═══════════════════════════════════════════════════════════════
// 5. Resolver classification propagation
// ═══════════════════════════════════════════════════════════════

test('resolveReplay attaches the artifact classification to meta', async () => {
  const result = await resolveReplay(
    { kind: 'corpus', fixtureId: 'CT-001' },
    {
      fetchJson: async () => executableEnvelope(2, { fixtureId: 'CT-001' }),
      ensureFrames: fakeEnsureFrames,
      lookupMeta: () => ({ indexRecord: { fixtureId: 'CT-001', replayKind: 'GOVERNING_CONFORMANCE_V4_1_2' }, matchSummary: null }),
    });
  assert.equal(result.status, REPLAY_STATUS.READY);
  assert.equal(result.meta.classification.class, REPLAY_ARTIFACT_CLASS.SCENARIO_FIXTURE);
  assert.equal(result.replay._contract.class, REPLAY_ARTIFACT_CLASS.SCENARIO_FIXTURE);
});

test('excluded bodies surface METADATA_ONLY classification without fetching', async () => {
  let fetched = false;
  const result = await resolveReplay(
    { kind: 'autonomy', fixtureId: 'M-x' },
    {
      fetchJson: async () => { fetched = true; return {}; },
      ensureFrames: fakeEnsureFrames,
      availability: { sources: { autonomy: { status: 'excluded' } } },
      lookupMeta: () => ({ indexRecord: { fixtureId: 'M-x', replayKind: 'CAMPAIGN_EPHEMERAL' }, matchSummary: null }),
    });
  assert.equal(result.status, REPLAY_STATUS.UNAVAILABLE);
  assert.equal(fetched, false);
  assert.equal(result.meta.classification.class, REPLAY_ARTIFACT_CLASS.METADATA_ONLY);
});

test('standby detail surfaces the artifact line for unavailable replays', () => {
  const standby = describeWatchStandby({
    replayStatus: REPLAY_STATUS.UNAVAILABLE,
    replayContract: classifyIndexRecord({ fixtureId: 'M-x', replayKind: 'CAMPAIGN_EPHEMERAL' }, { availability: 'excluded' }),
    replayError: { code: REPLAY_FAILURE.EXCLUDED_FROM_BUILD },
  });
  assert.equal(standby.variant, 'unavailable');
  assert.match(standby.detail, /METADATA ONLY|not in this build/i);
});

// ═══════════════════════════════════════════════════════════════
// 6. Watch workspace integration (source markers)
// ═══════════════════════════════════════════════════════════════

test('Watch renderer exposes the contract: evidence strip, modes, disclosure', async () => {
  const app = await readFile(path.join(root, 'apps/lab-web/src/app.js'), 'utf8');
  for (const marker of [
    'watchEvidenceHtml',
    'data-testid="watch-evidence"',
    'data-timeline-mode',
    'timeline-counts',
    'scrollIntoView',
    'watchTimelineModel',
    'openRetainedFullMatch',
  ]) assert.ok(app.includes(marker), `app.js must include ${marker}`);
});

test('Watch standby offers the honest selection actions', async () => {
  const app = await readFile(path.join(root, 'apps/lab-web/src/app.js'), 'utf8');
  assert.ok(app.includes('watch-standby-full'), 'standby must offer "open a full match"');
  assert.doesNotMatch(app, /Open latest full match/, 'no "latest" claim without recorded chronology');
  assert.match(app, /href="#\/replays"/);
});

test('boot no longer auto-selects a fixture (fixtureId starts null)', async () => {
  const loader = await readFile(path.join(root, 'apps/lab-web/src/data-loader.js'), 'utf8');
  const stateSrc = await readFile(path.join(root, 'apps/lab-web/src/state.js'), 'utf8');
  assert.match(stateSrc, /fixtureId:null/);
  assert.doesNotMatch(stateSrc, /fixtureId:'CT-001'/, 'CT-001 must not remain the implicit default');
  assert.match(loader, /await refreshLocalReplayIndex/);
});

test('watch.css defines evidence + timeline-mode styling', async () => {
  const css = await readFile(path.join(root, 'apps/lab-web/src/css/watch.css'), 'utf8');
  for (const sel of ['.watch-evidence', '.timeline-mode', '.timeline-counts', '.turn-group', '.evidence-badge'])
    assert.ok(css.includes(sel), `watch.css must define ${sel}`);
});

test('Replay Library discloses artifact class and filter', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/workspaces/observatory.js'), 'utf8');
  for (const marker of ['classifyIndexRecord', 'replay-class', 'replay-library-filter', 'Retained local replays'])
    assert.ok(src.includes(marker), `observatory.js must include ${marker}`);
});

test('runtime retention helper exists and is bounded', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/play/replay-library.js'), 'utf8');
  assert.match(src, /export async function retainLabReplay/);
  assert.match(src, /RETAINED_REPLAY_CAP/);
});
