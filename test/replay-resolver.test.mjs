import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// IRX-H21 replay resolver — behavioral coverage for the source-agnostic
// replay acquisition layer (apps/lab-web/src/replay-resolver.js).
//
//   match/result source → descriptor → resolveReplay → openReplay → Watch
//
// These tests exercise the resolver directly in Node with injected
// dependencies (fetchJson / getLocalReplay / ensureFrames), the same way
// data-loader.js wires it for the browser.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {
  REPLAY_STATUS,
  REPLAY_FAILURE,
  replayDescriptorKey,
  replayAvailability,
  staticReplayUrl,
  resolveReplay,
  openReplay,
  describeWatchStandby,
} = await import(pathToFileURL(path.join(root, 'apps/lab-web/src/replay-resolver.js')).href);

// ── Helpers ──────────────────────────────────────────────────────
const envelope = (fixtureId = 'CT-001', commands = 2) => ({
  format: 'intrilex-replay',
  fixtureId,
  initialState: { phase: 'draw', turn: 1 },
  commands: Array.from({ length: commands }, (_, i) => ({ id: `cmd-${i}`, actorId: 'P1', type: 'PLAY_CARD' })),
  events: [],
  checkpoints: [],
});

const fakeEnsureFrames = async (replay) => {
  // Mirrors ensureReplayFrames: synthesizes frame entries from commands.
  replay.frames = [{ state: replay.initialState, events: [], command: null, commandIndex: -1 },
    ...(replay.commands ?? []).map((command, i) => ({ state: {}, events: [], command, commandIndex: i }))];
  return replay;
};

const freshState = () => ({
  replay: null, authorized: null, replayKind: 'corpus', fixtureId: 'CT-001',
  frame: 0, playing: false, visibility: 'public', _replayLoadedFor: null,
  replayStatus: 'idle', replayError: null, replaySource: null, replayRequest: null,
});

// ── Descriptor identity ──────────────────────────────────────────
test('replayDescriptorKey distinguishes sources with equal fixture ids', () => {
  assert.equal(replayDescriptorKey({ kind: 'corpus', fixtureId: 'CT-001' }), 'corpus:CT-001');
  assert.equal(replayDescriptorKey({ kind: 'autonomy', fixtureId: 'CT-001' }), 'autonomy:CT-001');
  assert.equal(replayDescriptorKey({ kind: 'local', replayId: 'R-9' }), 'local:R-9');
  assert.equal(replayDescriptorKey({ kind: 'object', replay: { matchId: 'M-1' } }), 'object:M-1');
  assert.equal(replayDescriptorKey(null), null);
  assert.equal(replayDescriptorKey({ kind: 'corpus' }), null);
});

test('staticReplayUrl covers only bundled-file kinds', () => {
  assert.equal(staticReplayUrl({ kind: 'corpus', fixtureId: 'CT-001' }),
    'data/certified-replays/CT-001.certified.replay.json');
  // Autonomy resolves the frame-embedded retained artifact — the certified
  // public envelope (autonomy/replays/public/*) carries a privacy-redacted
  // initialState and cannot faithfully reconstruct the match.
  assert.equal(staticReplayUrl({ kind: 'autonomy', fixtureId: 'CT-001' }),
    'data/autonomy/lab-replays/public/CT-001.json');
  assert.equal(staticReplayUrl({ kind: 'local', replayId: 'R-1' }), null);
  assert.equal(staticReplayUrl({ kind: 'object', replay: {} }), null);
});

test('replayAvailability reports manifest truth', () => {
  const manifest = { sources: { corpus: { status: 'bundled' }, autonomy: { status: 'excluded' } } };
  assert.equal(replayAvailability('corpus', manifest), 'bundled');
  assert.equal(replayAvailability('autonomy', manifest), 'excluded');
  assert.equal(replayAvailability('local', manifest), 'runtime');
  assert.equal(replayAvailability('object', null), 'runtime');
  // Missing manifest → unknown: the resolver still attempts the fetch.
  assert.equal(replayAvailability('corpus', null), 'unknown');
});

// ── resolveReplay ────────────────────────────────────────────────
test('corpus descriptor resolves via fetchJson and reconstructs frames', async () => {
  const result = await resolveReplay(
    { kind: 'corpus', fixtureId: 'CT-001' },
    { fetchJson: async () => envelope(), ensureFrames: fakeEnsureFrames });
  assert.equal(result.status, REPLAY_STATUS.READY);
  assert.ok(Array.isArray(result.replay.frames) && result.replay.frames.length === 3);
  assert.equal(result.meta.kind, 'corpus');
  assert.equal(result.meta.id, 'CT-001');
});

test('excluded autonomy replay reports metadata-only without fetching', async () => {
  let fetched = false;
  const result = await resolveReplay(
    { kind: 'autonomy', fixtureId: 'A-9' },
    { fetchJson: async () => { fetched = true; return envelope('A-9'); },
      ensureFrames: fakeEnsureFrames,
      availability: { sources: { autonomy: { status: 'excluded' } } } });
  assert.equal(result.status, REPLAY_STATUS.UNAVAILABLE);
  assert.equal(result.code, REPLAY_FAILURE.EXCLUDED_FROM_BUILD);
  assert.equal(fetched, false, 'must not fetch a body known to be excluded');
});

test('missing static artifact reports FETCH_FAILED, not silent null', async () => {
  const result = await resolveReplay(
    { kind: 'autonomy', fixtureId: 'A-1' },
    { fetchJson: async () => { throw new Error('404'); },
      ensureFrames: fakeEnsureFrames,
      availability: { sources: { autonomy: { status: 'bundled' } } } });
  assert.equal(result.status, REPLAY_STATUS.ERROR);
  assert.equal(result.code, REPLAY_FAILURE.FETCH_FAILED);
});

test('object descriptor normalizes a caller-supplied replay', async () => {
  const source = envelope('ARENA-7');
  const result = await resolveReplay(
    { kind: 'object', replay: source, label: 'Arena game 7' },
    { ensureFrames: fakeEnsureFrames });
  assert.equal(result.status, REPLAY_STATUS.READY);
  assert.equal(result.replay.frames.length, 3);
  // The caller's object is cloned — resolver must not mutate the source.
  assert.equal(source.frames, undefined);
  assert.equal(result.meta.label, 'Arena game 7');
});

test('summary-only object without commands is honestly unplayable', async () => {
  const result = await resolveReplay(
    { kind: 'object', replay: { matchId: 'M-1', outcome: 'P1', turns: 12 } },
    { ensureFrames: async (r) => { r.frames = []; return r; } });
  assert.equal(result.status, REPLAY_STATUS.ERROR);
  assert.equal(result.code, REPLAY_FAILURE.NORMALIZE_FAILED);
});

test('local descriptor resolves IndexedDB record, missing record NOT_FOUND', async () => {
  const ok = await resolveReplay(
    { kind: 'local', replayId: 'R-1' },
    { getLocalReplay: async () => ({ sessionId: 'S-1', certifiedReplay: envelope('S-1') }),
      ensureFrames: fakeEnsureFrames });
  assert.equal(ok.status, REPLAY_STATUS.READY);
  assert.equal(ok.meta.id, 'R-1', 'local meta id is the replayId');

  const missing = await resolveReplay(
    { kind: 'local', replayId: 'R-gone' },
    { getLocalReplay: async () => null, ensureFrames: fakeEnsureFrames });
  assert.equal(missing.status, REPLAY_STATUS.ERROR);
  assert.equal(missing.code, REPLAY_FAILURE.NOT_FOUND);
});

test('empty/unsupported descriptors fail explicitly', async () => {
  const none = await resolveReplay(null, {});
  assert.equal(none.status, REPLAY_STATUS.ERROR);
  assert.equal(none.code, REPLAY_FAILURE.NO_DESCRIPTOR);
  const weird = await resolveReplay({ kind: 'hologram' }, {});
  assert.equal(weird.status, REPLAY_STATUS.ERROR);
  assert.equal(weird.code, REPLAY_FAILURE.NO_DESCRIPTOR);
});

// ── openReplay state transitions ─────────────────────────────────
test('openReplay applies a ready replay to shared state', async () => {
  const state = freshState();
  let navigated = 0;
  const result = await openReplay(
    { kind: 'corpus', fixtureId: 'CT-001' },
    { state, fetchJson: async () => envelope(), ensureFrames: fakeEnsureFrames,
      navigate: () => { navigated++; } });
  assert.equal(result.status, REPLAY_STATUS.READY);
  assert.equal(navigated, 1);
  assert.equal(state.replayStatus, REPLAY_STATUS.READY);
  assert.equal(state._replayLoadedFor, 'corpus:CT-001');
  assert.equal(state.replayKind, 'corpus');
  assert.equal(state.fixtureId, 'CT-001');
  assert.equal(state.frame, 0);
  assert.equal(state.playing, false);
  assert.equal(state.replaySource.kind, 'corpus');
});

test('failed load clears stale replay and does not block a later valid load', async () => {
  const state = freshState();
  // Seed a previously loaded replay to prove failure clears it.
  state.replay = { frames: [{}] };
  const fail = await openReplay(
    { kind: 'autonomy', fixtureId: 'A-404' },
    { state, fetchJson: async () => { throw new Error('404'); },
      ensureFrames: fakeEnsureFrames,
      availability: { sources: { autonomy: { status: 'bundled' } } } });
  assert.equal(fail.status, REPLAY_STATUS.ERROR);
  assert.equal(state.replay, null, 'stale replay must be cleared on failure');
  assert.equal(state.replayStatus, REPLAY_STATUS.ERROR);
  assert.equal(state.replayError.code, REPLAY_FAILURE.FETCH_FAILED);

  // The exact regression IRX-H21 fixes: a later valid load must succeed.
  const ok = await openReplay(
    { kind: 'corpus', fixtureId: 'CT-002' },
    { state, fetchJson: async () => envelope('CT-002'), ensureFrames: fakeEnsureFrames });
  assert.equal(ok.status, REPLAY_STATUS.READY);
  assert.equal(state.replayStatus, REPLAY_STATUS.READY);
  assert.equal(state.replay.frames.length, 3);
  assert.equal(state.replayError, null);
});

test('a superseded resolution never clobbers the newer request', async () => {
  const state = freshState();
  let resolveFirst;
  const firstFetch = new Promise(r => { resolveFirst = r; });
  const first = openReplay(
    { kind: 'corpus', fixtureId: 'CT-OLD' },
    { state, fetchJson: () => firstFetch.then(() => envelope('CT-OLD')),
      ensureFrames: fakeEnsureFrames });
  const second = await openReplay(
    { kind: 'corpus', fixtureId: 'CT-NEW' },
    { state, fetchJson: async () => envelope('CT-NEW'), ensureFrames: fakeEnsureFrames });
  assert.equal(second.status, REPLAY_STATUS.READY);
  resolveFirst();
  await first;
  assert.equal(state.fixtureId, 'CT-NEW');
  assert.equal(state.replay.fixtureId, 'CT-NEW');
  assert.equal(state._replayLoadedFor, 'corpus:CT-NEW');
});

test('openReplay loads authorized overlay for non-public static replays', async () => {
  const state = freshState();
  state.visibility = 'authorized';
  let authorized = 0;
  await openReplay(
    { kind: 'corpus', fixtureId: 'CT-001' },
    { state, fetchJson: async () => envelope(), ensureFrames: fakeEnsureFrames,
      loadAuthorized: async () => { authorized++; } });
  assert.equal(authorized, 1);
  // Runtime sources never trigger the static authorized-overlay fetch.
  await openReplay(
    { kind: 'object', replay: envelope('OBJ') },
    { state, ensureFrames: fakeEnsureFrames,
      loadAuthorized: async () => { authorized++; } });
  assert.equal(authorized, 1);
});

// ── Watch standby classification ─────────────────────────────────
test('describeWatchStandby maps status to honest variants', () => {
  assert.equal(describeWatchStandby({ replayStatus: 'loading' }).variant, 'loading');
  assert.equal(describeWatchStandby({ replayStatus: 'unavailable' }).variant, 'unavailable');
  assert.equal(describeWatchStandby({ replayStatus: 'unavailable' }).headline, 'Replay metadata available');
  assert.equal(describeWatchStandby({ replayStatus: 'error' }).variant, 'error');
  assert.equal(describeWatchStandby({ replayStatus: 'error' }).headline, 'Replay unavailable');
  const idle = describeWatchStandby({ replayStatus: 'idle' });
  assert.equal(idle.variant, 'idle');
  assert.match(idle.detail, /Replay Library/);
});

// ── Source integration contracts ─────────────────────────────────
test('every Watch navigation site routes through openReplay', async () => {
  const scan = async (rel) => readFile(path.join(root, rel), 'utf8');
  // Replay Library rows resolve a descriptor; they no longer mutate
  // fixtureId/replayKind/replay directly.
  const observatory = await scan('apps/lab-web/src/workspaces/observatory.js');
  assert.match(observatory, /openReplay\(kind === 'local'/);
  assert.match(observatory, /\{ kind, fixtureId: row\.dataset\.fixture \}/);
  assert.doesNotMatch(observatory, /const isAutonomy = !!state\.autonomyIndex/);
  // Match History Watch action checks the index for a real replay record
  // before offering navigation.
  assert.match(observatory, /No replay artifact was retained for this match/);
  // Local play + network play + forensics + profile route through the
  // resolver instead of hand-injecting observatory state.
  const playApp = await scan('apps/lab-web/src/play/play-app.js');
  assert.match(playApp, /openReplay\(\{\s*kind: 'local',/);
  assert.doesNotMatch(playApp, /observatoryState\.replay = /);
  const board = await scan('apps/lab-web/src/play/board-events.js');
  assert.match(board, /openReplay\(\{\s*kind: 'object',/);
  assert.doesNotMatch(board, /observatoryState\._replayLoadedFor/);
  const forensic = await scan('apps/lab-web/src/forensic/forensic-viewer.mjs');
  assert.match(forensic, /openReplay\(\{ kind: 'local', replayId/);
  const profile = await scan('apps/lab-web/src/workspaces/profile.js');
  assert.match(profile, /openReplay\(\{ kind: 'local', replayId: `R-\$\{matchId\}`/);
  // Anomaly evidence rows resolve via the same seam.
  const evidence = await scan('apps/lab-web/src/workspaces/evidence.js');
  assert.match(evidence, /openReplay\(\{ kind, fixtureId: matchId \}\)/);
  // Arena retained replays and tournament live games open as objects.
  const evo = await scan('apps/lab-web/src/workspaces/evolution-dashboard.js');
  assert.match(evo, /data-watch-replay/);
  assert.match(evo, /kind:'object', replay:item\.replay/);
  const tournament = await scan('apps/lab-web/src/workspaces/tournament.js');
  assert.match(tournament, /openReplay\(\{ kind: 'object', replay, id, label \}\)/);
});

test('Watch render guard cannot loop on a failed descriptor', async () => {
  const app = await readFile(path.join(root, 'apps/lab-web/src/app.js'), 'utf8');
  // The guard keys the pending descriptor and only loads while the key
  // differs from _replayLoadedFor — a failure stamps its own key.
  assert.match(app, /replayDescriptorKey\(state\.replayRequest\)/);
  assert.match(app, /state\._replayLoadedFor !== watchPendingKey/);
  assert.match(app, /REPLAY_STATUS\.LOADING/);
});

test('Replay Library distinguishes metadata from bundled bodies', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/workspaces/observatory.js'), 'utf8');
  // Availability joins go through data-loader helpers so retained-match
  // records resolve to the artifact family that actually serves them.
  assert.match(src, /recordAvailability\(/);
  assert.match(src, /descriptorKindForRecord\(/);
  assert.match(src, /Metadata only/);
  assert.match(src, /data-replay-kind/);
});

// ── Production-build contract ────────────────────────────────────
test('build script writes an honest replay-availability manifest', async () => {
  const build = await readFile(path.join(root, 'scripts/build.mjs'), 'utf8');
  assert.match(build, /data\/replay-availability\.json/);
  assert.match(build, /corpus: \{ status: 'bundled'/);
  assert.match(build, /status: includeReplayBlobs \? 'bundled' : 'excluded'/);
  assert.match(build, /bundledFixtureIds/);
  // The resolver only fetches autonomy bodies when the manifest allows.
  const resolver = await readFile(path.join(root, 'apps/lab-web/src/replay-resolver.js'), 'utf8');
  assert.match(resolver, /EXCLUDED_FROM_BUILD/);
});

test('built dist ships corpus bodies, excludes autonomy blobs, and carries the manifest', async (t) => {
  const dist = path.join(root, 'apps/lab-web/dist/data');
  if (!existsSync(dist)) return t.skip('apps/lab-web/dist not built — run pnpm run build');
  const manifest = JSON.parse(await readFile(path.join(dist, 'replay-availability.json'), 'utf8'));
  assert.equal(manifest.sources.corpus.status, 'bundled');
  assert.equal(manifest.sources.autonomy.status, 'excluded');
  // At least one real certified replay body is bundled — the Watch baseline.
  const corpusFiles = (await readdir(path.join(dist, 'certified-replays')))
    .filter(f => f.endsWith('.certified.replay.json'));
  assert.ok(corpusFiles.length > 0, 'production build must ship ≥1 certified replay');
  // Autonomy blob dirs remain excluded (metadata index still ships).
  assert.ok(!existsSync(path.join(dist, 'autonomy/replays/public')),
    'autonomy public replay blobs must stay excluded from the normal build');
  await access(path.join(dist, 'autonomy/lab-replay-index.json'));
});

test('a bundled certified replay reconstructs into Watch frames', async (t) => {
  const replayPath = path.join(root, 'apps/lab-web/dist/data/certified-replays/CT-001.certified.replay.json');
  const framesModule = path.join(root, 'apps/lab-web/dist/replay-frames.js');
  if (!existsSync(replayPath) || !existsSync(framesModule)) {
    return t.skip('apps/lab-web/dist not built — run pnpm run build');
  }
  const replay = JSON.parse(await readFile(replayPath, 'utf8'));
  assert.ok(replay.initialState, 'certified envelope has initialState');
  assert.ok(Array.isArray(replay.commands) && replay.commands.length > 0, 'certified envelope has commands');
  // Same normalization the resolver performs in the browser.
  const { ensureReplayFrames } = await import(pathToFileURL(framesModule).href);
  const normalized = structuredClone(replay);
  await ensureReplayFrames(normalized);
  assert.ok(Array.isArray(normalized.frames) && normalized.frames.length > 0,
    'bundled certified replay must reconstruct into a non-empty frames array');
  assert.equal(normalized.frames[0].commandIndex, -1, 'frame 0 is the initial state');
  assert.equal(normalized.frames.length, replay.commands.length + 1);
});
