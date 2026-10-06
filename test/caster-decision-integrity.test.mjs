// ═══════════════════════════════════════════════════════════════
// test/caster-decision-integrity.test.mjs
//
// Regression tests for the Replay Caster evidence pipeline:
//   - runBrowserPolicyMatch emits a canonical decisions[] transcript
//     anchored to replay command indices/hashes (browser dist only —
//     skip-guarded like evolution-foundation).
//   - buildBeats anchors each decision to ITS frame via
//     commandIndex/engineCommandHash and never turns engine
//     orchestration commands (priority passes, phase transitions,
//     stack resolution) into fake decision beats.
//   - The legacy frame fallback is orchestration-aware and attributes
//     the actor from the command boundary, not post-command state.
//   - Commentary present context carries public board evidence and
//     visible events; future context is redacted for PUBLIC viewers
//     and hand identities appear only under OMNISCIENT.
//   - The Astra semantic model renders a neutral spectator view:
//     no "You"/"Opponent" seat, both hand counts public, both hands
//     face-up only under explicitly authorized omniscient mode.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hashCanonical } from '@intrilex/shared';
import { buildBeats, isOrchestrationCommand } from '@intrilex/replay-caster/beat-builder';
import { runDiagnostics } from '@intrilex/replay-caster/diagnostics';
import { buildCommentaryInput } from '@intrilex/replay-caster/commentary-planner';
import { VIEWER_MODE, CasterSession } from '@intrilex/replay-caster';

const root = fileURLToPath(new URL('../', import.meta.url));
const distRuntime = join(root, 'apps/lab-web/dist/autonomy-runtime.js');
const distFrames = join(root, 'apps/lab-web/dist/replay-frames.js');
const hasDist = existsSync(distRuntime) && existsSync(distFrames);
const workerSrc = readFileSync(join(root, 'apps/lab-web/src/worker.js'), 'utf8');

// Bundle the semantic model the same way astra-model.test.mjs does —
// the TS source is compiled in-memory so tests track src, not dist.
const modelBundle = await build({
  stdin: {
    contents: "export * from './apps/lab-web/src/client/game-model.ts';",
    resolveDir: root,
    loader: 'ts'
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'esm',
  target: 'es2022'
});
const { buildSemanticGame } = await import(`data:text/javascript;base64,${Buffer.from(modelBundle.outputFiles[0].text).toString('base64')}`);

const BROWSER_CFG = {
  seed: 5,
  policyIds: ['random-legal', 'score-rush'],
  decisionLimit: 60,
  recordReplay: true
};

async function makeBrowserMatch() {
  const { runBrowserPolicyMatch } = await import(pathToFileURL(distRuntime).href);
  const { reconstructReplayFrames } = await import(pathToFileURL(distFrames).href);
  const result = runBrowserPolicyMatch(BROWSER_CFG);
  const frames = await reconstructReplayFrames(result.replay);
  return { result, frames };
}

function casterMatchResult(result) {
  // Mirrors the worker payload: { summary, decisions, replay }.
  return {
    summary: result,
    decisions: result.decisions,
    replay: result.replay,
    provenance: { engineVersion: result.engineVersion, rulesVersion: result.rulesVersion }
  };
}

function decisionBeats(beats) {
  return beats.filter(b => b.beatKind === 'DECISION' || b.beatKind === 'RESPONSE');
}

// ── Browser decision transcript ──────────────────────────────────

describe('Caster decision transcript (browser runtime)', () => {
  test('runBrowserPolicyMatch emits a non-empty canonical decisions[] transcript', { skip: !hasDist && 'requires browser build' }, async () => {
    const { result } = await makeBrowserMatch();
    assert.ok(Array.isArray(result.decisions), 'result.decisions must be an array');
    assert.ok(result.decisions.length > 0, 'transcript must contain policy decisions');
    // The replay interleaves engine orchestration commands between policy
    // decisions — the transcript must be strictly smaller than the command list.
    assert.ok(result.decisions.length < result.replay.commands.length,
      'decisions must be a subset of replay commands (orchestration excluded)');
  });

  test('each decision anchors to its replay command via commandIndex + engineCommandHash', { skip: !hasDist && 'requires browser build' }, async () => {
    const { result } = await makeBrowserMatch();
    for (const d of result.decisions) {
      assert.ok(Number.isInteger(d.commandIndex), `decision ${d.decisionIndex} must carry a commandIndex`);
      const command = result.replay.commands[d.commandIndex];
      assert.ok(command, `decision ${d.decisionIndex} commandIndex out of bounds`);
      assert.equal(hashCanonical(command), d.engineCommandHash,
        `decision ${d.decisionIndex} engineCommandHash must match its replay command`);
      assert.equal(command.actorId, d.actorId,
        `decision ${d.decisionIndex} actor must match the command actor`);
      assert.equal(isOrchestrationCommand(command), false,
        `decision ${d.decisionIndex} must not anchor to an orchestration command`);
    }
  });

  test('decision records carry actor/seat/action/hash/visibility metadata', { skip: !hasDist && 'requires browser build' }, async () => {
    const { result } = await makeBrowserMatch();
    const seatOrder = result.seatOrder;
    for (const d of result.decisions) {
      assert.ok(seatOrder.includes(d.actorId), 'actorId must be a seat participant');
      assert.equal(d.seat, seatOrder.indexOf(d.actorId) + 1, 'seat must match actorId position');
      assert.equal(typeof d.family, 'string', 'family required');
      assert.ok(d.legalActionCount > 0, 'legalActionCount required');
      assert.equal(typeof d.beforeStateHash, 'string', 'beforeStateHash required');
      assert.equal(typeof d.afterStateHash, 'string', 'afterStateHash required');
      assert.equal(d.visibility, 'authorized', 'decision records are authority-scoped');
    }
  });

  test('decision transcript is deterministic for a fixed seed', { skip: !hasDist && 'requires browser build' }, async () => {
    const { runBrowserPolicyMatch } = await import(pathToFileURL(distRuntime).href);
    const a = runBrowserPolicyMatch(BROWSER_CFG);
    const b = runBrowserPolicyMatch(BROWSER_CFG);
    assert.deepEqual(
      a.decisions.map(d => [d.actorId, d.family, d.mode, d.commandIndex, d.engineCommandHash]),
      b.decisions.map(d => [d.actorId, d.family, d.mode, d.commandIndex, d.engineCommandHash]));
    assert.equal(a.finalStateHash, b.finalStateHash);
  });

  test('worker payload forwards the transcript without dropping it', () => {
    // The worker wraps the runtime result as { summary, decisions, replay }.
    assert.match(workerSrc, /decisions:\s*result\.decisions/,
      'worker must forward result.decisions (not an empty fallback)');
    assert.match(workerSrc, /payload\.result\.replay\s*=\s*result\.replay/,
      'worker must forward the replay for frame reconstruction');
  });
});

// ── Beat anchoring ────────────────────────────────────────────────

describe('Caster beat anchoring', () => {
  test('one decision beat per policy decision, anchored by commandIndex', { skip: !hasDist && 'requires browser build' }, async () => {
    const { result, frames } = await makeBrowserMatch();
    const { beats, errors } = buildBeats(casterMatchResult(result), frames);
    assert.deepEqual(errors, []);
    const db = decisionBeats(beats);
    assert.equal(db.length, result.decisions.length);
    for (const [i, beat] of db.entries()) {
      const decision = result.decisions[i];
      assert.equal(beat.frameIndex, decision.commandIndex + 1,
        `decision ${i} beat must anchor to the frame after its command`);
      assert.equal(beat.decision.actorId, decision.actorId);
      assert.equal(beat.decision.source, 'transcript');
      assert.equal(beat.checkpointHashBefore, decision.beforeStateHash);
      assert.equal(beat.checkpointHashAfter, decision.afterStateHash);
    }
  });

  test('orchestration commands never become decision beats', { skip: !hasDist && 'requires browser build' }, async () => {
    const { result, frames } = await makeBrowserMatch();
    const orch = result.replay.commands.filter(isOrchestrationCommand);
    assert.ok(orch.length > 0, 'fixture must contain orchestration commands to prove exclusion');
    const { beats } = buildBeats(casterMatchResult(result), frames);
    const db = decisionBeats(beats);
    assert.equal(db.length + orch.length, result.replay.commands.length,
      'decision beats + orchestration commands must account for the whole replay');
  });

  test('legacy fallback derives decisions only from non-orchestration commands', { skip: !hasDist && 'requires browser build' }, async () => {
    const { result, frames } = await makeBrowserMatch();
    const playerCommandIndices = result.replay.commands
      .map((c, i) => i).filter(i => !isOrchestrationCommand(result.replay.commands[i]));
    // Strip the transcript to force the legacy path.
    const { beats, errors } = buildBeats({ summary: result, replay: result.replay }, frames);
    assert.ok(errors.some(e => e.includes('decision transcript missing')));
    const db = decisionBeats(beats);
    assert.equal(db.length, playerCommandIndices.length);
    for (const [i, beat] of db.entries()) {
      const command = result.replay.commands[playerCommandIndices[i]];
      assert.equal(beat.frameIndex, playerCommandIndices[i] + 1);
      assert.equal(beat.decision.actorId, command.actorId,
        'fallback actor must come from the command boundary, not post-command state');
      assert.equal(beat.decision.source, 'frames');
    }
  });

  test('missing transcript surfaces an INVESTIGATE diagnostic, not silent confidence', { skip: !hasDist && 'requires browser build' }, async () => {
    const { result, frames } = await makeBrowserMatch();
    const { beats } = buildBeats({ summary: result, replay: result.replay }, frames);
    const diagnostics = runDiagnostics({ summary: result, replay: result.replay }, beats, frames);
    assert.ok(diagnostics.some(d => d.verdict === 'INVESTIGATE' && /decision transcript/.test(d.observed)));
  });

  test('transcript beats do not fabricate: an unanchorable decision reports an error', { skip: !hasDist && 'requires browser build' }, async () => {
    const { result, frames } = await makeBrowserMatch();
    const matchResult = casterMatchResult(result);
    matchResult.decisions = matchResult.decisions.map(d => ({ ...d }));
    matchResult.decisions[0].commandIndex = null;
    matchResult.decisions[0].engineCommandHash = 'deadbeef'.repeat(8);
    const { errors } = buildBeats(matchResult, frames);
    assert.ok(errors.some(e => /could not be anchored/.test(e)));
  });
});

// ── Commentary grounding and privacy ─────────────────────────────

describe('Caster commentary grounding', () => {
  function plannerInput(session, matchResult) {
    session.director.stepTo(Math.min(5, session.beats.length - 1));
    const beat = session.currentBeat;
    const frame = session.frames?.[beat.frameIndex];
    return buildCommentaryInput({
      beats: session.beats,
      beatIndex: session.director.index,
      mode: 'BROADCAST',
      viewerMode: session.viewerMode,
      threads: session.threads,
      diagnostics: [],
      matchMeta: { matchId: matchResult.summary.matchId, winner: matchResult.summary.winner },
      settings: {},
      currentFrameState: session.viewerMode === VIEWER_MODE.OMNISCIENT ? frame?.state ?? null : null
    });
  }

  test('PUBLIC present context carries board facts and visible events — no hand identities', { skip: !hasDist && 'requires browser build' }, async () => {
    const { result, frames } = await makeBrowserMatch();
    const matchResult = casterMatchResult(result);
    const session = new CasterSession({ viewerMode: 'public' });
    session.loadCompletedMatch(matchResult, frames);
    const input = plannerInput(session, matchResult);
    assert.equal(input.presentContext.visibleToViewer, true);
    const board = input.presentContext.board;
    assert.ok(board, 'present context must include board facts');
    assert.ok('P1' in board.handCounts && 'P2' in board.handCounts, 'both hand counts are public');
    assert.ok(Number.isInteger(board.drawCount));
    assert.equal(input.presentContext.hands, undefined, 'public mode must never carry hand identities');
    assert.ok(Array.isArray(input.presentContext.recentEvents));
    // The serialized commentary input must not contain the identities of
    // cards currently held in either player's hand at this frame.
    const frameState = session.frames[session.currentBeat.frameIndex]?.state;
    const cards = frameState?.cards ?? {};
    const hiddenIdentities = Object.values(frameState?.players ?? {})
      .flatMap(p => (Array.isArray(p.hand) ? p.hand : []).map(id => cards[id]?.identity))
      .filter(Boolean);
    const serialized = JSON.stringify(input);
    for (const identity of hiddenIdentities) {
      assert.ok(!serialized.includes(identity),
        `public commentary input leaked hidden card identity ${identity}`);
    }
  });

  test('PUBLIC future context is fully redacted (no winner, no upcoming beats)', { skip: !hasDist && 'requires browser build' }, async () => {
    const { result, frames } = await makeBrowserMatch();
    const matchResult = casterMatchResult(result);
    const session = new CasterSession({ viewerMode: 'public' });
    session.loadCompletedMatch(matchResult, frames);
    const input = plannerInput(session, matchResult);
    assert.equal(input.futureContext.visibleToViewer, false);
    assert.equal(input.futureContext.redacted, true);
    assert.deepEqual(input.futureContext.upcomingBeats, []);
    assert.equal(input.futureContext.matchOutcome, null);
    assert.doesNotMatch(JSON.stringify(input.futureContext), /P[12]|winner/i);
  });

  test('OMNISCIENT context exposes both hands and private future planning', { skip: !hasDist && 'requires browser build' }, async () => {
    const { result, frames } = await makeBrowserMatch();
    const matchResult = casterMatchResult(result);
    const session = new CasterSession({ viewerMode: 'omniscient' });
    session.loadCompletedMatch(matchResult, frames);
    const input = plannerInput(session, matchResult);
    assert.ok(input.presentContext.hands, 'omniscient must carry authorized hand identities');
    assert.ok(Array.isArray(input.presentContext.hands.P1));
    assert.ok(Array.isArray(input.presentContext.hands.P2));
    assert.equal(input.futureContext.visibleToViewer, false, 'future remains private even omniscient');
    assert.ok(input.futureContext.matchOutcome, 'omniscient future carries match outcome for planning');
    assert.ok(input.futureContext.upcomingBeats.length > 0);
  });
});

// ── Spectator semantic model ──────────────────────────────────────

describe('Astra spectator view model', () => {
  function spectatorSnapshot() {
    return {
      sessionId: 'caster-P1-P2',
      status: 'SPECTATING',
      human: { playerId: null, displayName: 'score rush' },
      opponent: { displayName: 'control' },
      match: { winner: null, terminationReason: null },
      decision: null,
      playerView: {
        actorId: 'P1', revision: 7, phase: 'ACTION', fullTurnSequence: 3,
        activePlayerId: 'P2', priority: { open: true, order: ['P1', 'P2'], index: 1, ownerId: 'P2' },
        own: {
          goal: 21, securedPoints: 6, handCount: 2,
          hand: [{ id: 's1-card', identity: '6♥' }, { id: 's2-card', identity: '9♣' }],
          pr: [{ id: 'p1-point', identity: '5♠' }], er: [],
          limits: { miniTurnsRemaining: 1 }
        },
        opponents: [{
          playerId: 'P2', goal: 21, securedPoints: 3, handCount: 3,
          hand: [{ id: 'o1-card', identity: '8♠' }, { id: 'o2-card', identity: 'Q♠' }, { id: 'o3-card', identity: 'A♦' }],
          pr: [], er: [{ id: 'o-er', identity: 'J♣' }],
          limits: { miniTurnsRemaining: 2 }
        }],
        dpCount: 30, gyCount: 0, gyTopCard: null, exileCount: 0,
        swapBar: [], stack: [], pendingChoice: null
      },
      recentEvents: []
    };
  }

  test('public spectator: neutral seats, both hand counts, no identities, read-only', () => {
    const game = buildSemanticGame(spectatorSnapshot(), { viewRole: 'spectator', visibility: 'public' });
    assert.equal(game.status, 'waiting');
    assert.equal(game.viewRole, 'spectator');
    assert.equal(game.viewerMode, 'public');
    // Neither participant is "You".
    assert.notEqual(game.self.name, 'You');
    assert.notEqual(game.opponent.name, 'Opponent');
    assert.equal(game.self.name, 'score rush');
    assert.equal(game.opponent.name, 'control');
    // Both hands are represented as public counts; identities concealed.
    assert.equal(game.self.handCount, 2);
    assert.equal(game.opponent.handCount, 3);
    assert.deepEqual(game.self.hand, []);
    assert.deepEqual(game.opponent.hand, []);
    // Read-only: no actions, no frame hash, no mini-turn internals.
    assert.deepEqual(game.actions, []);
    assert.equal(game.frameHash, null);
    assert.equal(game.self.miniTurnsRemaining, null);
    // No hidden identity leaks anywhere in the serialized model.
    assert.doesNotMatch(JSON.stringify(game), /6♥|9♣|8♠|Q♠|A♦|s1-card|o1-card/u);
    assert.equal(game.activePlayerId, 'P2');
    assert.equal(game.priorityOwnerId, 'P2');
  });

  test('omniscient spectator: both hands face-up with per-seat limits', () => {
    const game = buildSemanticGame(spectatorSnapshot(), { viewRole: 'spectator', visibility: 'omniscient' });
    assert.equal(game.viewerMode, 'omniscient');
    assert.equal(game.self.hand.length, 2);
    assert.equal(game.opponent.hand.length, 3);
    assert.equal(game.self.hand[0].identity, '6♥');
    assert.equal(game.opponent.hand[1].identity, 'Q♠');
    assert.equal(game.self.miniTurnsRemaining, 1);
    assert.equal(game.opponent.miniTurnsRemaining, 2);
    // Still read-only: spectator snapshots never enumerate actions.
    assert.deepEqual(game.actions, []);
  });

  test('omniscient visibility is rejected for a player view role (fail closed)', () => {
    const game = buildSemanticGame(spectatorSnapshot(), { viewRole: 'player', visibility: 'omniscient' });
    assert.equal(game.status, 'unavailable');
    const plain = buildSemanticGame(spectatorSnapshot(), { visibility: 'omniscient' });
    assert.equal(plain.status, 'unavailable');
  });

  test('spectator without explicit visibility defaults to public concealment', () => {
    const game = buildSemanticGame(spectatorSnapshot(), { viewRole: 'spectator' });
    assert.equal(game.viewerMode, 'public');
    assert.deepEqual(game.self.hand, []);
    assert.equal(game.self.handCount, 2);
  });

  test('caster view role behaves identically to spectator', () => {
    const game = buildSemanticGame(spectatorSnapshot(), { viewRole: 'caster', visibility: 'public' });
    assert.equal(game.viewRole, 'caster');
    assert.equal(game.viewerMode, 'public');
    assert.equal(game.self.handCount, 2);
    assert.deepEqual(game.self.hand, []);
  });
});
