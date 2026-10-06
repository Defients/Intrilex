import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// OBS-01 Match Theatre — instrument composition contracts.
// These tests pin the surgical Watch refinement: the theatre is the
// dominant visual object, the empty state is a designed STANDBY (not a
// detached card), the transport is a forensic scrubber console, and the
// lower region surfaces real state/event evidence. Markers only — no
// fabricated telemetry may appear in any of these contracts.

const app = await readFile("apps/lab-web/src/app.js", "utf8");
const ctrl = await readFile("apps/lab-web/src/experiment-controls.js", "utf8");
const router = await readFile("apps/lab-web/src/router.js", "utf8");
const styles = await readFile("apps/lab-web/src/styles.css", "utf8");
const watchCss = await readFile("apps/lab-web/src/css/watch.css", "utf8");

// ── Empty state: dormant theatre, not a detached card ──────────────
test("empty Watch renders a designed STANDBY theatre", () => {
  for (const marker of [
    "watch-layout-idle",
    "watch-theatre theatre-standby",
    "MATCH THEATRE // ",
    "theatre-ghost",
    "ghost-board",
    "ghost-zones",
    "theatre-ghost-timeline",
    "theatre-standby-actions",
    "No replay loaded",
  ]) assert.ok(app.includes(marker), `empty state must include ${marker}`);
});

test("standby actions are real navigation only", () => {
  // Browse replays must be a real hash link; Run experiment must proxy to
  // the existing experiment dialog button — no nonfunctional buttons.
  assert.match(app, /class="primary-button" href="#\/replays"/);
  assert.ok(app.includes("watch-standby-experiment"));
  assert.match(app, /document\.querySelector\('#experiment-button'\)\?\.click\(\)/);
});

test("standby keeps dormant transport with required stable ids", () => {
  // Regression contract: disabled-state still exposes frame-slider,
  // play-speed, play-toggle, step-prev, step-next, step-end for tests
  // and assistive technology.
  for (const id of ["frame-slider", "play-speed", "play-toggle", "step-prev", "step-next", "step-end", "step-start"])
    assert.ok(app.includes(`id="${id}"`), `transport must include ${id}`);
});

// ── Loaded state: theatre frame + status rail ──────────────────────
test("loaded Watch frames the board inside an instrument stage", () => {
  for (const marker of [
    'class="watch-theatre"',
    "theatre-chrome",
    "theatre-eyebrow",
    "theatre-chrome-meta",
    "theatre-statusrail",
    "theatre-rail-flag",
    "aria-label=\"Match theatre\"",
  ]) assert.ok(app.includes(marker), `loaded theatre must include ${marker}`);
});

test("theatre chrome/status rail derive only from replay data", () => {
  // Engine version, rules version, policy ids, termination reason,
  // turn/phase/active-player — all read from existing replay/summary
  // fields. No invented metrics.
  for (const src of [
    "state.replay.engineVersion",
    "state.replay.rulesVersion",
    "summary?.policyIds",
    "terminationReason",
    "s.fullTurnSequence",
    "s.phase",
    "s.activePlayerId",
    "s.winner",
  ]) assert.ok(app.includes(src), `theatre must derive ${src} from real data`);
  assert.ok(app.includes("END OF RECORD"), "terminal scrub position must be labeled");
});

// ── Transport: forensic analysis transport ─────────────────────────
test("transport includes step-start and position readout", () => {
  for (const marker of [
    "watch-scrubber",
    "scrubber-markers",
    "scrubber-position",
    "watch-position",
    "aria-label=\"Skip to start\"",
    "transport-keys",
    "watchTransportHtml",
  ]) assert.ok(app.includes(marker), `transport must include ${marker}`);
});

test("scrubber markers derive from real frame data", () => {
  // Semantic ticks use the same semanticForCommand classification as the
  // timeline; emphasis markers come from actual frame event types and the
  // forensic bookmark session — nothing synthesized.
  const fn = app.slice(app.indexOf("function watchScrubberMarkers"));
  const end = fn.indexOf("\n}", 0);
  const body = fn.slice(0, end > 0 ? end : 2000);
  for (const src of [
    "frameEventTypes(frame)",
    "semanticForCommand",
    "forensicSession?.bookmarks",
    "score",
    "terminal",
    "bookmark",
  ]) assert.ok(body.includes(src), `scrubber markers must derive ${src}`);
});

test("timeline items carry semantic classes for spectral mapping", () => {
  assert.ok(app.includes('data-class="${item.class}"'));
  assert.ok(app.includes("aria-current"));
});

// ── Readouts: two coherent analytical regions ──────────────────────
test("watch readouts group state and event/decision evidence", () => {
  for (const marker of [
    "watchReadoutsHtml",
    "watch-readouts",
    "watch-seat-row",
    "Match state",
    "Event / decision",
    "watch-event-chip",
    "readout-headline",
    "readout-adjacent",
    "readout-links",
  ]) assert.ok(app.includes(marker), `readouts must include ${marker}`);
});

test("readouts surface only fields that exist on real records", () => {
  const fn = app.slice(app.indexOf("function watchReadoutsHtml"));
  const body = fn.slice(0, fn.indexOf("\nfunction renderWatch"));
  for (const src of [
    "secured(s, p)",
    "p.goal",
    "p.hand",
    "p.pr",
    "p.er",
    "s.stack",
    "s.triggerQueue",
    "miniTurnsRemaining",
    "frameEventTypes(frame)",
    "commandAction(currentCmd)",
    "currentCmd?.actorId",
    "hasDecisionTraces",
  ]) assert.ok(body.includes(src), `readouts must derive ${src}`);
  // No fabricated analytics: no duration, no invented confidence, no RNG.
  assert.doesNotMatch(body, /durationMs|confidence|Math\.random/);
});

test("readout links reuse existing cross-workspace navigation", () => {
  assert.match(app, /id="watch-open-traces"/);
  assert.match(app, /state\.traceSelectedId = state\.fixtureId/);
  assert.match(app, /location\.hash = '#\/traces'/);
  assert.match(app, /state\.historySelectedMatch = state\.fixtureId/);
});

// ── Cohort provenance ──────────────────────────────────────────────
test("cohort bar surfaces dataset provenance", () => {
  assert.ok(app.includes("cohort-provenance"));
  assert.match(app, /matches · /);
  assert.match(app, /Engine \$\{ENGINE_VERSION\}/);
  assert.match(app, /Rules v\$\{RULES_VERSION\}/);
});

// ── Keyboard transport ─────────────────────────────────────────────
test("watch supports keyboard semantic stepping", () => {
  for (const key of ["ArrowLeft", "ArrowRight", "Home", "End"])
    assert.ok(ctrl.includes(key), `key handler must support ${key}`);
  assert.match(ctrl, /invokeAppAction\('stepBy'/);
  assert.match(ctrl, /invokeAppAction\('stepTo'/);
  // Keys must not hijack INPUT/SELECT focus (slider + speed select keep
  // their native arrow behavior).
  assert.match(ctrl, /'INPUT', 'SELECT', 'TEXTAREA'/);
  assert.match(app, /function stepBy\(delta\)/);
  assert.match(app, /stepBy, stepTo/);
});

// ── Command palette aliases ────────────────────────────────────────
test("command palette resolves natural-concept workspace aliases", () => {
  assert.ok(router.includes("WORKSPACE_KEYWORDS"));
  assert.ok(ctrl.includes("WORKSPACE_KEYWORDS[r]"));
  for (const [route, alias] of [
    ["'/branches'", "counterfactual"],
    ["'/traces'", "why did it choose this"],
    ["'/ranks'", "best cards"],
    ["'/evidence'", "provenance"],
  ]) {
    const line = router.split("\n").find(l => l.includes(`${route}:`));
    assert.ok(line?.includes(alias), `${route} must alias '${alias}'`);
  }
  // Rail workspace filter uses the same shared keyword map.
  assert.match(router, /WORKSPACE_KEYWORDS\[r\]/);
});

// ── Stylesheet wiring ──────────────────────────────────────────────
test("watch.css is imported and defines the instrument layer", () => {
  assert.ok(styles.includes("@import './css/watch.css'"));
  for (const sel of [
    ".watch-theatre",
    ".theatre-standby",
    ".theatre-ghost",
    ".watch-scrubber",
    ".scrubber-markers",
    ".watch-position",
    ".watch-readouts",
    ".watch-seat-row",
    ".watch-event-chip",
    ".theatre-statusrail",
  ]) assert.ok(watchCss.includes(sel), `watch.css must define ${sel}`);
  // Responsive degradation for the instrument.
  assert.match(watchCss, /max-width:\s*1050px/);
  assert.match(watchCss, /max-width:\s*760px/);
});

test("spectral marker classes map to existing token semantics", () => {
  for (const cls of [".scrubber-markers i.score", ".scrubber-markers i.terminal", ".scrubber-markers i.bookmark"])
    assert.ok(watchCss.includes(cls), `marker class ${cls} must exist`);
});

// ── Playback transport: lifecycle safety ─────────────────────────
import { createReplayTransport } from "../apps/lab-web/src/replay-transport.mjs";

function fakeWatchState(frames = null) {
  return {
    playing: false, timer: null, frame: 0, speed: 1,
    selectedTimelineIndex: null,
    replay: frames ? { frames } : null,
  };
}

function fakeTransport(frames = null) {
  const state = fakeWatchState(frames);
  const calls = { render: 0, setFrame: [], timers: [], cleared: [] };
  let nextTimer = 1;
  const ticks = new Map();
  const transport = createReplayTransport({
    getState: () => state,
    setCurrentFrame: (i) => calls.setFrame.push(i),
    render: () => { calls.render += 1; },
    setTimer: (fn) => { const id = nextTimer++; ticks.set(id, fn); calls.timers.push(id); return id; },
    clearTimer: (id) => { ticks.delete(id); calls.cleared.push(id); },
  });
  return { state, transport, calls, fireTick: (id) => ticks.get(id)?.(), liveTimers: () => ticks.size };
}

test("Space-equivalent togglePlay with no replay does nothing and throws nothing", () => {
  const { state, transport, calls, liveTimers } = fakeTransport(null);
  transport.togglePlay();
  transport.stepBy(1);
  transport.stepTo(0);
  transport.stop();
  assert.equal(state.playing, false);
  assert.equal(state.timer, null);
  assert.equal(liveTimers(), 0, "no timer may start without a replay");
  assert.equal(state.frame, 0);
  assert.equal(calls.render, 0, "no needless re-render churn");
});

test("playback runs and self-terminates at the last frame; replay cleared mid-flight stops the timer", () => {
  const { state, transport, calls: _calls, fireTick, liveTimers } = fakeTransport([{ f: 0 }, { f: 1 }, { f: 2 }]);
  transport.togglePlay();
  assert.equal(state.playing, true);
  assert.equal(liveTimers(), 1);
  fireTick(state.timer);
  assert.equal(state.frame, 1);
  fireTick(state.timer);
  assert.equal(state.frame, 2, "reached last frame");
  fireTick(state.timer);
  assert.equal(state.playing, false, "auto-stops at the end");
  assert.equal(liveTimers(), 0);

  // Replay disappearing while playing must stop the timer, not crash.
  state.frame = 0;
  transport.togglePlay();
  state.replay = null;
  fireTick(state.timer);
  assert.equal(state.playing, false);
  assert.equal(state.timer, null);
  assert.equal(liveTimers(), 0);
});

test("controller layer: Space with no replay does not invoke togglePlay", () => {
  // Static contract: the Space handler gates on replay frames before
  // invoking the app action (defense in depth — the action itself is also safe).
  assert.match(ctrl, /e\.key === ' ' && route\(\) === '\/watch'[\s\S]*?state\.replay\?\.frames\?\.length[\s\S]*?invokeAppAction\('togglePlay'\)/);
});
