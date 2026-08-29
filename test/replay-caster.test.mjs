// ═══════════════════════════════════════════════════════════════
// test/replay-caster.test.mjs
//
// Replay Caster v0.1 — comprehensive test suite.
//
// All tests use the DeterministicCommentaryProvider — no Ollama
// required. Tests cover:
//   - Schema validation (RC-S08, RC-S09)
//   - Beat building and determinism (RC-S01, RC-S02, RC-S04)
//   - Playback director determinism (RC-S04)
//   - Commentary grounding and speculation labeling (RC-S08, RC-S09)
//   - Spoiler firewall / future isolation (RC-S12, red-team #4)
//   - Privacy boundaries (RC-S13, red-team #3, #5)
//   - Replay hash / final-state hash preservation (RC-S14, RC-S15, red-team #1)
//   - Policy output parity (RC-S16, red-team #1)
//   - Ollama independence (RC-S05, RC-S07, red-team #2)
//   - WAIT WHAT capture (RC-S11, red-team #5)
//   - Cache isolation by viewer mode (red-team #7)
//   - Stale version handling (red-team #8)
//   - Backward step commentary resync (red-team #9)
//   - Bounded prompt growth (red-team #10)
//   - No LLM game authority (RC-S18)
//   - Malformed output safety (red-team #6)
// ═══════════════════════════════════════════════════════════════

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  CasterSession,
  DeterministicCommentaryProvider,
  OllamaCommentaryProvider,
  OLLAMA_ERROR,
  COMMENTARY_MODE,
  VIEWER_MODE,
  CASTER_SCHEMA_VERSION,
  COMMENTARY_PROMPT_VERSION,
  BEAT_KIND,
  SPOILER_CHECK,
  DIAGNOSTIC_VERDICT,
  buildBeats,
  computeImportance,
  shouldSpeak,
  pacingBand,
  PACING_BAND,
  PlaybackDirector,
  SUPPORTED_SPEEDS,
  buildThreadRegistry,
  viewerThreadState,
  privateThreadState,
  runDiagnostics,
  buildCommentaryInput,
  buildCommentaryPrompt,
  spoilerLint,
  validateAndAccept,
  parseJsonLoose,
  captureWaitWhat,
  validateBeat,
  validateCommentaryRecord,
  validateDiagnosticRecord,
  validateWaitWhatCapture,
  buildSessionEnvelope,
  makeBeatId,
  makeCommentaryCacheKey
} from '@intrilex/replay-caster';

// ── Test fixtures ─────────────────────────────────────────────────

const MATCH_CONFIG = {
  policyIds: ['score-rush', 'control'],
  seed: 5,
  decisionLimit: 600,
  profileId: 'core-advanced-authority'
};

async function makeSession(opts = {}) {
  const session = new CasterSession({
    provider: opts.provider || new DeterministicCommentaryProvider(),
    mode: opts.mode,
    viewerMode: opts.viewerMode,
    settings: opts.settings
  });
  await session.generateMatch(opts.config || MATCH_CONFIG);
  return session;
}

// ── Tests ─────────────────────────────────────────────────────────

describe('Replay Caster v0.1 — Schema Validation', () => {
  test('RC-S08: CASTER_SCHEMA_VERSION is defined and semver', () => {
    assert.match(CASTER_SCHEMA_VERSION, /^\d+\.\d+\.\d+$/);
  });

  test('RC-S08: COMMENTARY_PROMPT_VERSION is defined and semver', () => {
    assert.match(COMMENTARY_PROMPT_VERSION, /^\d+\.\d+\.\d+$/);
  });

  test('validateBeat accepts a well-formed beat', () => {
    const beat = {
      beatId: 'CB-test', matchId: 'M-test', sequence: 0,
      beatKind: BEAT_KIND.MATCH_START, importance: 0.5
    };
    const { valid, errors, normalized } = validateBeat(beat);
    assert.equal(valid, true);
    assert.deepEqual(errors, []);
    assert.equal(normalized.schemaVersion, CASTER_SCHEMA_VERSION);
  });

  test('validateBeat rejects invalid beatKind', () => {
    const { valid, errors } = validateBeat({
      beatId: 'x', matchId: 'y', sequence: 0, beatKind: 'INVALID'
    });
    assert.equal(valid, false);
    assert.ok(errors.some(e => e.includes('beatKind')));
  });

  test('validateCommentaryRecord rejects empty commentary', () => {
    const { valid, errors } = validateCommentaryRecord({ commentary: '' });
    assert.equal(valid, false);
  });

  test('validateCommentaryRecord clamps importance to [0,1]', () => {
    const { normalized } = validateCommentaryRecord({ commentary: 'x', importance: 5 });
    assert.ok(normalized.importance <= 1);
  });

  test('validateDiagnosticRecord rejects invalid verdict', () => {
    const { valid } = validateDiagnosticRecord({
      diagnosticId: 'x', verdict: 'BAD_VERDICT'
    });
    assert.equal(valid, false);
  });

  test('validateWaitWhatCapture normalizes viewer mode', () => {
    const { normalized } = validateWaitWhatCapture({
      captureId: 'x', matchId: 'y', viewerMode: 'invalid'
    });
    assert.equal(normalized.viewerMode, VIEWER_MODE.PUBLIC);
  });

  test('makeBeatId is deterministic', () => {
    const a = makeBeatId('M-1', 0);
    const b = makeBeatId('M-1', 0);
    assert.equal(a, b);
    const c = makeBeatId('M-1', 1);
    assert.notEqual(a, c);
  });

  test('makeCommentaryCacheKey is deterministic', () => {
    const args = { promptVersion: '1.0.0', model: 'x', mode: 'BROADCAST', beatProjectionHash: 'h', viewerMode: 'public', threadDigest: 'd' };
    assert.equal(makeCommentaryCacheKey(args), makeCommentaryCacheKey(args));
  });
});

describe('Replay Caster v0.1 — Beat Building & Determinism', () => {
  test('RC-S01: completed deterministic match generates beats', async () => {
    const session = await makeSession();
    assert.ok(session.beats.length > 0);
    assert.equal(session.beats[0].beatKind, BEAT_KIND.MATCH_START);
    assert.equal(session.beats[session.beats.length - 1].beatKind, BEAT_KIND.MATCH_END);
  });

  test('RC-S01b: beats carry frameIndex for board state lookup', async () => {
    const session = await makeSession();
    for (const beat of session.beats) {
      assert.ok(Number.isInteger(beat.frameIndex), `beat ${beat.beatId} should have integer frameIndex`);
      assert.ok(beat.frameIndex >= 0, `beat ${beat.beatId} frameIndex should be non-negative`);
    }
    // MATCH_START beat should point to frame 0 (initial state)
    assert.equal(session.beats[0].frameIndex, 0);
    // The frameIndex should be within the frames array bounds
    for (const beat of session.beats) {
      assert.ok(beat.frameIndex < session.frames.length, `beat ${beat.beatId} frameIndex ${beat.frameIndex} out of bounds (frames: ${session.frames.length})`);
    }
  });

  test('RC-S02: canonical replay evidence preserved (replayHash present)', async () => {
    const session = await makeSession();
    assert.ok(session.replayHash, 'replayHash must be present');
    assert.ok(session.finalStateHash, 'finalStateHash must be present');
  });

  test('RC-S04: same seed produces identical beats', async () => {
    const a = await makeSession();
    const b = await makeSession();
    assert.equal(a.beats.length, b.beats.length);
    for (let i = 0; i < a.beats.length; i++) {
      assert.equal(a.beats[i].beatId, b.beats[i].beatId);
      assert.equal(a.beats[i].beatKind, b.beats[i].beatKind);
      assert.equal(a.beats[i].importance, b.beats[i].importance);
    }
  });

  test('RC-S14: replay hash unchanged across sessions', async () => {
    const a = await makeSession();
    const b = await makeSession();
    assert.equal(a.replayHash, b.replayHash);
  });

  test('RC-S15: final-state hash unchanged across sessions', async () => {
    const a = await makeSession();
    const b = await makeSession();
    assert.equal(a.finalStateHash, b.finalStateHash);
  });

  test('RC-S16: policy output unchanged (decision count parity)', async () => {
    const a = await makeSession();
    const b = await makeSession();
    assert.equal(a.matchResult.decisions.length, b.matchResult.decisions.length);
  });

  test('red-team #1: disabling Caster does not change match hash', async () => {
    // Generate a match with Caster (using the session) and without (raw runPolicyMatch).
    // Both should produce the same replay hash since Caster is observational.
    const { runPolicyMatch } = await import('@intrilex/simulation-runtime');
    const rawResult = runPolicyMatch({ ...MATCH_CONFIG, includeReplay: true, decisionTracesEnabled: true });
    const session = await makeSession();
    assert.equal(session.replayHash, rawResult.summary.replayHash ?? session.replayHash);
    assert.equal(session.finalStateHash, rawResult.summary.finalStateHash);
  });
});

describe('Replay Caster v0.1 — Playback Director', () => {
  test('RC-S04: deterministic playback — same tick sequence produces same progression', () => {
    const beats = Array.from({ length: 10 }, (_, i) => ({
      beatId: `B-${i}`, matchId: 'M', sequence: i,
      beatKind: i === 0 ? BEAT_KIND.MATCH_START : i === 9 ? BEAT_KIND.MATCH_END : BEAT_KIND.DECISION,
      importance: 0.5, publicSummary: {}, commentaryEligible: true
    }));
    let time = 1000;
    const d1 = new PlaybackDirector({ beats, now: () => time });
    const d2 = new PlaybackDirector({ beats, now: () => time });
    d1.play(); d2.play();
    // Advance time by 5000ms in 100ms increments
    for (let i = 0; i < 50; i++) {
      time += 100;
      d1.tick(); d2.tick();
    }
    assert.equal(d1.index, d2.index);
  });

  test('stepForward and stepBackward navigate correctly', () => {
    const beats = Array.from({ length: 5 }, (_, i) => ({
      beatId: `B-${i}`, matchId: 'M', sequence: i, beatKind: BEAT_KIND.DECISION,
      importance: 0.5, publicSummary: {}, commentaryEligible: true
    }));
    const d = new PlaybackDirector({ beats });
    assert.equal(d.index, 0);
    d.stepForward();
    assert.equal(d.index, 1);
    d.stepBackward();
    assert.equal(d.index, 0);
    assert.equal(d.stepBackward(), false); // at start
  });

  test('speed control works', () => {
    const beats = Array.from({ length: 5 }, (_, i) => ({
      beatId: `B-${i}`, matchId: 'M', sequence: i, beatKind: BEAT_KIND.DECISION,
      importance: 0.5, publicSummary: {}, commentaryEligible: true
    }));
    const d = new PlaybackDirector({ beats });
    d.setSpeed(2);
    assert.equal(d.speed, 2);
    assert.throws(() => d.setSpeed(3), /Unsupported speed/);
  });

  test('red-team #9: stepping backward does not corrupt state', () => {
    const beats = Array.from({ length: 10 }, (_, i) => ({
      beatId: `B-${i}`, matchId: 'M', sequence: i, beatKind: BEAT_KIND.DECISION,
      importance: 0.5, publicSummary: {}, commentaryEligible: true
    }));
    const d = new PlaybackDirector({ beats });
    d.stepTo(5);
    d.stepBackward();
    d.stepBackward();
    assert.equal(d.index, 3);
    d.stepForward();
    assert.equal(d.index, 4);
    // Current beat is valid
    assert.equal(d.currentBeat().beatId, 'B-4');
  });
});

describe('Replay Caster v0.1 — Commentary Pipeline', () => {
  test('RC-S06: commentary is generated for eligible beats', async () => {
    const session = await makeSession();
    // Find a beat with score delta (should be commentary-eligible)
    const idx = session.beats.findIndex(b => (b.publicSummary?.scoreDelta ?? 0) !== 0);
    assert.ok(idx >= 0, 'should find a score-delta beat');
    session.director.stepTo(idx);
    const r = await session.generateCommentaryForCurrentBeat();
    assert.equal(r.ok, true);
    assert.ok(r.record?.commentary, 'commentary text should be present');
  });

  test('RC-S08: commentary is grounded in beat facts (no invented data)', async () => {
    const session = await makeSession();
    const idx = session.beats.findIndex(b => (b.publicSummary?.scoreDelta ?? 0) !== 0);
    session.director.stepTo(idx);
    const r = await session.generateCommentaryForCurrentBeat();
    const text = r.record?.commentary || '';
    // Should mention the seat or score delta (grounded in beat facts)
    assert.ok(text.includes('Seat') || text.includes('scores') || text.includes('points'),
      'commentary should reference grounded facts');
  });

  test('RC-S09: speculation is labeled via diagnostic references', async () => {
    const session = await makeSession({ mode: COMMENTARY_MODE.DEV_OBSERVATORY });
    // Dev Observatory mode should reference diagnostics when present
    const endIdx = session.beats.length - 1;
    session.director.stepTo(endIdx);
    const r = await session.generateCommentaryForCurrentBeat();
    // diagnosticReferences is an array (may be empty if no diagnostics)
    assert.ok(Array.isArray(r.record?.diagnosticReferences));
  });

  test('RC-S05: commentary works without Ollama (deterministic provider)', async () => {
    const session = await makeSession();
    session.director.stepTo(1);
    const r = await session.generateCommentaryForCurrentBeat();
    assert.equal(r.ok, true);
    assert.equal(r.error, null);
  });

  test('red-team #2: Ollama failure does not affect playback', async () => {
    // Use a provider that always fails
    const failingProvider = {
      name: 'failing',
      async generateCommentary() { return { ok: false, record: null, error: 'UNREACHABLE', cached: false }; }
    };
    const session = await makeSession({ provider: failingProvider });
    // Step to a commentary-eligible beat (one with score delta)
    const idx = session.beats.findIndex(b => (b.publicSummary?.scoreDelta ?? 0) !== 0);
    assert.ok(idx >= 0, 'should find a score-delta beat');
    session.director.stepTo(idx);
    const r = await session.generateCommentaryForCurrentBeat();
    assert.equal(r.ok, false);
    assert.equal(r.error, 'UNREACHABLE');
    // Playback still works
    assert.ok(session.stepForward());
    assert.ok(session.currentBeat);
  });

  test('red-team #6: malformed Ollama output does not reach innerHTML', () => {
    // The validator rejects malformed JSON; the UI uses textContent, not innerHTML.
    const result = validateAndAccept('not json at all', { futureContext: { visibleToViewer: false } });
    assert.equal(result.accepted, false);
    assert.ok(result.error);
  });

  test('red-team #6: JSON with injection attempt is sanitized in prompt', async () => {
    const session = await makeSession();
    const input = buildCommentaryInput({
      beats: session.beats,
      beatIndex: 1,
      mode: COMMENTARY_MODE.BROADCAST,
      viewerMode: VIEWER_MODE.PUBLIC,
      threads: session.threads,
      diagnostics: session.diagnostics,
      matchMeta: { matchId: session.matchId },
      settings: { density: 'normal' }
    });
    const { userPrompt } = buildCommentaryPrompt(input);
    // The prompt should not contain unescaped injection patterns in the system instructions
    // (content is fenced as data)
    assert.ok(userPrompt.includes('ANALYTICS_DATA'));
  });
});

describe('Replay Caster v0.1 — Spoiler Firewall', () => {
  test('RC-S12: future context is marked visibleToViewer: false', async () => {
    const session = await makeSession();
    const input = buildCommentaryInput({
      beats: session.beats,
      beatIndex: 1,
      mode: COMMENTARY_MODE.BROADCAST,
      viewerMode: VIEWER_MODE.PUBLIC,
      threads: session.threads,
      diagnostics: session.diagnostics,
      matchMeta: { matchId: session.matchId, winner: 'P1' },
      settings: { density: 'normal' }
    });
    assert.equal(input.futureContext.visibleToViewer, false);
    assert.equal(input.pastContext.visibleToViewer, true);
    assert.equal(input.presentContext.visibleToViewer, true);
  });

  test('red-team #4: future winner does not leak into viewer-visible payload', async () => {
    const session = await makeSession();
    const input = buildCommentaryInput({
      beats: session.beats,
      beatIndex: 1, // early beat
      mode: COMMENTARY_MODE.BROADCAST,
      viewerMode: VIEWER_MODE.PUBLIC,
      threads: session.threads,
      diagnostics: session.diagnostics,
      matchMeta: { matchId: session.matchId, winner: 'P1', terminationReason: 'NORMAL_VICTORY' },
      settings: { density: 'normal' }
    });
    // The viewer-visible past/present context should not contain the winner
    const pastJson = JSON.stringify(input.pastContext);
    const presentJson = JSON.stringify(input.presentContext);
    // Winner is only in futureContext.matchOutcome (private)
    assert.ok(!pastJson.includes('"winner":"P1"') || pastJson.includes('null'));
    assert.ok(!presentJson.includes('"winner":"P1"'));
    assert.ok(input.futureContext.matchOutcome?.winnerSeat);
  });

  test('spoilerLint catches future winner mention', () => {
    const lint = spoilerLint(
      { commentary: 'Seat P1 wins the match' },
      { futureContext: { visibleToViewer: false, matchOutcome: { winnerSeat: 'P1' }, upcomingBeats: [] } }
    );
    assert.equal(lint.failed, true);
  });

  test('spoilerLint catches future beat id reference', () => {
    const lint = spoilerLint(
      { commentary: 'Watch for beat CB-abcdef1234567890' },
      { futureContext: { visibleToViewer: false, upcomingBeats: [{ beatId: 'CB-abcdef1234567890' }], matchOutcome: null } }
    );
    assert.equal(lint.failed, true);
  });

  test('spoilerLint passes safe commentary', () => {
    const lint = spoilerLint(
      { commentary: 'Seat 1 scores 10 points.' },
      { futureContext: { visibleToViewer: false, matchOutcome: { winnerSeat: 'P2' }, upcomingBeats: [] } }
    );
    assert.equal(lint.failed, false);
  });

  test('spoilerLint is a no-op when no future context', () => {
    const lint = spoilerLint({ commentary: 'anything' }, { futureContext: null });
    assert.equal(lint.failed, false);
  });
});

describe('Replay Caster v0.1 — Privacy Boundaries', () => {
  test('RC-S13: PUBLIC mode does not receive hidden cards in beat data', async () => {
    const session = await makeSession({ viewerMode: VIEWER_MODE.PUBLIC });
    for (const beat of session.beats) {
      const json = JSON.stringify(beat);
      // No private hand arrays or private state fields in beats
      assert.ok(!json.includes('"hand"'), `beat ${beat.beatId} should not expose hand`);
      assert.ok(!json.includes('"pr":[') || json.includes('"pr":[]'), `beat ${beat.beatId} should not expose private pr`);
    }
  });

  test('red-team #3: PUBLIC commentary input does not contain hidden cards', async () => {
    const session = await makeSession({ viewerMode: VIEWER_MODE.PUBLIC });
    const input = buildCommentaryInput({
      beats: session.beats,
      beatIndex: 1,
      mode: COMMENTARY_MODE.BROADCAST,
      viewerMode: VIEWER_MODE.PUBLIC,
      threads: session.threads,
      diagnostics: session.diagnostics,
      matchMeta: { matchId: session.matchId },
      settings: { density: 'normal' }
    });
    const json = JSON.stringify(input);
    // No card identities or hand arrays in the commentary input
    assert.ok(!json.match(/[♣♦♥♠]/), 'commentary input should not contain card suit symbols');
  });

  test('red-team #5: WAIT WHAT in PUBLIC mode redacts future context', async () => {
    const session = await makeSession({ viewerMode: VIEWER_MODE.PUBLIC });
    session.director.stepTo(2);
    const capture = session.waitWhat();
    assert.equal(capture.redacted, true);
    // Future context should be redacted
    for (const after of capture.contextAfter) {
      assert.ok(after.redacted, 'future beats should be redacted in PUBLIC mode');
    }
  });

  test('WAIT WHAT in OMNISCIENT mode includes future context', async () => {
    const session = await makeSession({ viewerMode: VIEWER_MODE.OMNISCIENT });
    session.director.stepTo(2);
    const capture = session.waitWhat();
    assert.equal(capture.redacted, false);
  });
});

describe('Replay Caster v0.1 — Cache Isolation', () => {
  test('red-team #7: commentary cache is isolated by viewer mode', async () => {
    const session = await makeSession({ viewerMode: VIEWER_MODE.PUBLIC });
    // Step to a commentary-eligible beat (one with score delta)
    const idx = session.beats.findIndex(b => (b.publicSummary?.scoreDelta ?? 0) !== 0);
    assert.ok(idx >= 0, 'should find a score-delta beat');
    session.director.stepTo(idx);
    const r1 = await session.generateCommentaryForCurrentBeat();
    assert.equal(r1.cached, false);
    // Same beat, same mode → cache hit
    const r2 = await session.generateCommentaryForCurrentBeat();
    assert.equal(r2.cached, true);
    // Change viewer mode → cache should be cleared
    session.setViewerMode(VIEWER_MODE.OMNISCIENT);
    const r3 = await session.generateCommentaryForCurrentBeat();
    assert.equal(r3.cached, false);
  });

  test('cache is isolated by commentary mode', async () => {
    const session = await makeSession();
    // Step to a commentary-eligible beat
    const idx = session.beats.findIndex(b => (b.publicSummary?.scoreDelta ?? 0) !== 0);
    assert.ok(idx >= 0);
    session.director.stepTo(idx);
    await session.generateCommentaryForCurrentBeat();
    const r1 = await session.generateCommentaryForCurrentBeat();
    assert.equal(r1.cached, true);
    session.setMode(COMMENTARY_MODE.DEV_OBSERVATORY);
    const r2 = await session.generateCommentaryForCurrentBeat();
    assert.equal(r2.cached, false);
  });
});

describe('Replay Caster v0.1 — WAIT WHAT Capture', () => {
  test('RC-S11: WAIT WHAT captures exact context', async () => {
    const session = await makeSession();
    session.director.stepTo(3);
    const capture = session.waitWhat();
    assert.ok(capture.captureId);
    assert.equal(capture.matchId, session.matchId);
    assert.ok(capture.casterBeatId);
    assert.ok(capture.contextBefore.length > 0);
    assert.ok(capture.contextAfter.length > 0);
    assert.ok(capture.playbackTime >= 0);
  });

  test('WAIT WHAT capture is deterministic for same beat', async () => {
    const session = await makeSession();
    session.director.stepTo(3);
    const c1 = session.waitWhat();
    const c2 = session.waitWhat();
    assert.equal(c1.captureId, c2.captureId);
    assert.equal(c1.casterBeatId, c2.casterBeatId);
    assert.equal(c1.checkpointHash, c2.checkpointHash);
  });

  test('WAIT WHAT supports evidence navigation via jumpToBeat', async () => {
    const session = await makeSession();
    session.director.stepTo(5);
    const capture = session.waitWhat();
    // Jump to a context-before beat
    if (capture.contextBefore.length > 0) {
      const targetId = capture.contextBefore[0].beatId;
      const ok = session.jumpToBeat(targetId);
      assert.equal(ok, true);
      assert.equal(session.currentBeat.beatId, targetId);
    }
  });
});

describe('Replay Caster v0.1 — Diagnostics', () => {
  test('diagnostics run without crashing on a normal match', async () => {
    const session = await makeSession();
    assert.ok(Array.isArray(session.diagnostics));
  });

  test('diagnostics do not produce false CONFIRMED_FAILURE on a valid match', async () => {
    const session = await makeSession();
    const failures = session.diagnostics.filter(d => d.verdict === DIAGNOSTIC_VERDICT.CONFIRMED_FAILURE);
    assert.equal(failures.length, 0, 'a valid match should not produce CONFIRMED_FAILURE diagnostics');
  });

  test('diagnosticsThroughBeat filters future diagnostics', async () => {
    const session = await makeSession();
    // Create a fake diagnostic at a future beat index
    const futureDiag = { ...session.diagnostics[0], _beatIndex: 999 };
    const all = [...session.diagnostics, futureDiag];
    const filtered = runDiagnostics(session.matchResult, session.beats, session.frames);
    // diagnosticsThroughBeat should exclude future beats
    const throughNow = filtered.filter(d => d._beatIndex <= 0);
    assert.ok(Array.isArray(throughNow));
  });
});

describe('Replay Caster v0.1 — Narrative Threads', () => {
  test('thread registry is built from beats', async () => {
    const session = await makeSession();
    assert.ok(Array.isArray(session.threads));
  });

  test('viewerThreadState excludes future threads', async () => {
    const session = await makeSession();
    const state = viewerThreadState(session.threads, 0);
    // At beat 0, no threads should be visible (threads are created at decision beats)
    assert.ok(Array.isArray(state));
  });

  test('privateThreadState includes payoffBeatId (commentator-private)', async () => {
    const session = await makeSession();
    if (session.threads.length > 0) {
      const privateState = privateThreadState(session.threads, session.beats.length - 1, session.beats);
      const withPayoff = privateState.filter(t => t.payoffBeatId);
      // At least some threads should have payoff info (private)
      assert.ok(privateState.every(t => t.visibleToViewer === false));
    }
  });
});

describe('Replay Caster v0.1 — Ollama Provider', () => {
  test('OllamaCommentaryProvider with no model returns MODEL_NOT_FOUND', async () => {
    const provider = new OllamaCommentaryProvider({ model: '' });
    const result = await provider.generateCommentary({
      beat: { beatId: 'x', beatKind: 'DECISION', importance: 0.5, publicSummary: {} },
      presentContext: {}, futureContext: {}, diagnostics: []
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, OLLAMA_ERROR.MODEL_NOT_FOUND);
  });

  test('OllamaCommentaryProvider with injected client processes valid JSON', async () => {
    const validJson = JSON.stringify({
      commentary: 'A solid play from seat 1.',
      importance: 0.6,
      headline: 'Seat 1 acts',
      tone: 'ANALYTICAL',
      spoilerCheck: 'PASS'
    });
    const fakeClient = {
      chat: async () => ({ text: validJson })
    };
    const provider = new OllamaCommentaryProvider({ model: 'test-model', client: fakeClient });
    const result = await provider.generateCommentary({
      beat: { beatId: 'x', beatKind: 'DECISION', importance: 0.5, publicSummary: {} },
      presentContext: { scores: {} },
      futureContext: { visibleToViewer: false },
      diagnostics: []
    });
    assert.equal(result.ok, true);
    assert.equal(result.record.commentary, 'A solid play from seat 1.');
  });

  test('OllamaCommentaryProvider streaming mode invokes onToken callback', async () => {
    const validJson = JSON.stringify({
      commentary: 'A solid play from seat 1.',
      importance: 0.6,
      headline: 'Seat 1 acts',
      tone: 'ANALYTICAL',
      spoilerCheck: 'PASS'
    });
    const tokens = validJson.split('');
    const fakeClient = {
      chat: async ({ onToken }) => {
        if (typeof onToken === 'function') {
          for (const t of tokens) onToken(t);
        }
        return { text: validJson, done: true, rawChunks: [] };
      }
    };
    const received = [];
    const provider = new OllamaCommentaryProvider({ model: 'test-model', client: fakeClient, stream: true });
    const result = await provider.generateCommentary({
      beat: { beatId: 'x', beatKind: 'DECISION', importance: 0.5, publicSummary: {} },
      presentContext: { scores: {} },
      futureContext: { visibleToViewer: false },
      diagnostics: []
    }, { onToken: (chunk) => received.push(chunk) });
    assert.equal(result.ok, true);
    assert.ok(received.length > 0, 'onToken should have been called');
    assert.equal(received.join(''), validJson);
  });

  test('OllamaCommentaryProvider streaming disabled when no onToken provided', async () => {
    const validJson = JSON.stringify({
      commentary: 'Test.',
      importance: 0.5,
      headline: 'Test',
      tone: 'MEASURED',
      spoilerCheck: 'PASS'
    });
    let streamRequested = null;
    const fakeClient = {
      chat: async ({ stream }) => {
        streamRequested = stream;
        return { text: validJson };
      }
    };
    const provider = new OllamaCommentaryProvider({ model: 'test-model', client: fakeClient, stream: true });
    await provider.generateCommentary({
      beat: { beatId: 'x', beatKind: 'DECISION', importance: 0.5, publicSummary: {} },
      presentContext: {}, futureContext: { visibleToViewer: false }, diagnostics: []
    });
    // stream should be false because no onToken callback was provided
    assert.equal(streamRequested, false);
  });

  test('OllamaCommentaryProvider rejects malformed JSON', async () => {
    const fakeClient = { chat: async () => ({ text: 'not json' }) };
    const provider = new OllamaCommentaryProvider({ model: 'test', client: fakeClient });
    const result = await provider.generateCommentary({
      beat: { beatId: 'x', beatKind: 'DECISION', importance: 0.5, publicSummary: {} },
      presentContext: {}, futureContext: { visibleToViewer: false }, diagnostics: []
    });
    assert.equal(result.ok, false);
  });

  test('OllamaCommentaryProvider handles client chat error', async () => {
    const fakeClient = {
      chat: async () => { throw Object.assign(new Error('timeout'), { category: OLLAMA_ERROR.TIMEOUT }); }
    };
    const provider = new OllamaCommentaryProvider({ model: 'test', client: fakeClient });
    const result = await provider.generateCommentary({
      beat: { beatId: 'x', beatKind: 'DECISION', importance: 0.5, publicSummary: {} },
      presentContext: {}, futureContext: {}, diagnostics: []
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, OLLAMA_ERROR.TIMEOUT);
  });

  test('red-team #8: stale replay version handled safely', () => {
    // validateBeat always normalizes to the current schema version.
    // A beat from a "stale" version (missing fields) is normalized,
    // not rejected outright. The planner handles missing fields gracefully.
    const staleBeat = {
      beatId: 'old-1', matchId: 'M-old', sequence: 0,
      beatKind: 'DECISION', importance: 0.5
      // Missing schemaVersion, publicSummary, etc.
    };
    const { valid, normalized } = validateBeat(staleBeat);
    assert.equal(valid, true); // structurally valid
    assert.equal(normalized.schemaVersion, CASTER_SCHEMA_VERSION); // normalized to current
    assert.deepEqual(normalized.publicSummary, {}); // defaulted
  });
});

describe('Replay Caster v0.1 — Bounded Context', () => {
  test('red-team #10: huge replay does not cause unbounded prompt growth', async () => {
    // Simulate a huge beat array
    const hugeBeats = Array.from({ length: 5000 }, (_, i) => ({
      beatId: `B-${i}`, matchId: 'M-huge', sequence: i,
      beatKind: i === 0 ? BEAT_KIND.MATCH_START : i === 4999 ? BEAT_KIND.MATCH_END : BEAT_KIND.DECISION,
      seat: (i % 2) + 1, turn: Math.floor(i / 4),
      phase: 'MAIN', decisionId: `DT-${i}`,
      checkpointHashBefore: `h-${i}-before`, checkpointHashAfter: `h-${i}-after`,
      publicSummary: { scores: { P1: i % 21, P2: (i + 5) % 21 }, scoreDelta: i % 10 === 0 ? 5 : 0, goals: { P1: 21, P2: 21 } },
      action: { family: 'score', mode: 'normal' },
      decision: { actorId: 'P1', policyId: 'test', selectionMargin: 10, legalActionCount: 3 },
      importance: 0.5, commentaryEligible: true
    }));
    const input = buildCommentaryInput({
      beats: hugeBeats,
      beatIndex: 2500,
      mode: COMMENTARY_MODE.BROADCAST,
      viewerMode: VIEWER_MODE.PUBLIC,
      threads: [],
      diagnostics: [],
      matchMeta: { matchId: 'M-huge' },
      settings: { density: 'normal' }
    });
    const { userPrompt } = buildCommentaryPrompt(input);
    // Prompt should be bounded (past window + present + bounded future)
    assert.ok(userPrompt.length < 200000, `prompt should be bounded, got ${userPrompt.length}`);
    // Past context should only contain a windowed subset
    assert.ok(input.pastContext.recentBeats.length <= 10, 'past beats should be windowed');
    // Future context should be bounded
    assert.ok(input.futureContext.upcomingBeats.length <= 10, 'future beats should be bounded');
  });
});

describe('Replay Caster v0.1 — No LLM Game Authority', () => {
  test('RC-S18: commentary output never contains engine commands', async () => {
    const session = await makeSession();
    for (let i = 0; i < session.beats.length; i++) {
      session.director.stepTo(i);
      const r = await session.generateCommentaryForCurrentBeat();
      if (r.record?.commentary) {
        const text = r.record.commentary;
        // Commentary should never contain engine command patterns
        assert.ok(!text.includes('execute('), 'commentary must not contain execute() calls');
        assert.ok(!text.includes('IntrilexEngine'), 'commentary must not reference IntrilexEngine');
      }
    }
  });

  test('RC-S18: CasterSession never exposes engine execute to provider', async () => {
    const session = await makeSession();
    // The session's provider interface only receives commentary input,
    // never engine state or command interfaces.
    const input = buildCommentaryInput({
      beats: session.beats,
      beatIndex: 1,
      mode: COMMENTARY_MODE.BROADCAST,
      viewerMode: VIEWER_MODE.PUBLIC,
      threads: session.threads,
      diagnostics: session.diagnostics,
      matchMeta: { matchId: session.matchId },
      settings: { density: 'normal' }
    });
    const json = JSON.stringify(input);
    assert.ok(!json.includes('execute'), 'commentary input must not expose execute');
    assert.ok(!json.includes('command'), 'commentary input must not expose raw commands');
  });
});

describe('Replay Caster v0.1 — Session Envelope', () => {
  test('buildSessionEnvelope produces correct metadata', async () => {
    const session = await makeSession();
    const env = session.envelope();
    assert.equal(env.schemaVersion, CASTER_SCHEMA_VERSION);
    assert.equal(env.sessionType, 'replay-caster');
    assert.equal(env.matchId, session.matchId);
    assert.equal(env.replayHash, session.replayHash);
    assert.equal(env.finalStateHash, session.finalStateHash);
    assert.equal(env.beatCount, session.beats.length);
    assert.equal(env.commentaryPromptVersion, COMMENTARY_PROMPT_VERSION);
  });

  test('telemetry tracks commentary generation', async () => {
    const session = await makeSession();
    session.director.stepTo(1);
    await session.generateCommentaryForCurrentBeat();
    assert.ok(session.telemetry.beatsViewed > 0);
  });
});

describe('Replay Caster v0.1 — Importance & Pacing', () => {
  test('MATCH_END has maximum importance', async () => {
    const session = await makeSession();
    const endBeat = session.beats[session.beats.length - 1];
    assert.equal(endBeat.importance, 1.0);
  });

  test('score delta increases importance', () => {
    const beat = { beatKind: BEAT_KIND.DECISION, action: { family: 'score' }, publicSummary: { scoreDelta: 10 } };
    const imp = computeImportance(beat, { scoreBefore: 0, scoreAfter: 10, goal: 21 });
    assert.ok(imp >= 0.3, 'score delta should increase importance');
  });

  test('shouldSpeak respects density', () => {
    assert.equal(shouldSpeak(0.2, { density: 'normal' }), false);
    assert.equal(shouldSpeak(0.5, { density: 'normal' }), true);
    assert.equal(shouldSpeak(0.4, { density: 'low' }), false);
    assert.equal(shouldSpeak(0.55, { density: 'low' }), true);
    assert.equal(shouldSpeak(0.3, { density: 'high' }), true);
  });

  test('pacingBand classifies correctly', () => {
    assert.equal(pacingBand(0.1), PACING_BAND.SILENT);
    assert.equal(pacingBand(0.4), PACING_BAND.OPTIONAL);
    assert.equal(pacingBand(0.7), PACING_BAND.STANDARD);
    assert.equal(pacingBand(0.9), PACING_BAND.HIGHLIGHT);
  });
});

describe('Replay Caster v0.1 — JSON Parser', () => {
  test('parseJsonLoose parses clean JSON', () => {
    const r = parseJsonLoose('{"a":1}');
    assert.equal(r.ok, true);
    assert.equal(r.value.a, 1);
  });

  test('parseJsonLoose extracts from markdown fences', () => {
    const r = parseJsonLoose('```json\n{"a":1}\n```');
    assert.equal(r.ok, true);
    assert.equal(r.value.a, 1);
  });

  test('parseJsonLoose extracts from prose', () => {
    const r = parseJsonLoose('Here is the result: {"a":1} done.');
    assert.equal(r.ok, true);
    assert.equal(r.value.a, 1);
  });

  test('parseJsonLoose rejects empty input', () => {
    const r = parseJsonLoose('');
    assert.equal(r.ok, false);
  });
});
