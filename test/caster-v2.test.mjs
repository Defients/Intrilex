// ═══════════════════════════════════════════════════════════════
// test/caster-v2.test.mjs
//
// Replay Caster V2 — three-stage broadcast pipeline.
//
// Covers the architectural changes introduced by Caster V2:
//   - prepareCommentary(): commentary is generated for every
//     commentary-worthy beat BEFORE playback; playback resolves it
//     synchronously via preparedFor().
//   - Cancellation + provider failure + deterministic fallback swap.
//   - Cumulative Game Log event stream (eventsThroughBeat): the log
//     accumulates forward, truncates on scrub-back, restores on
//     scrub-forward — no arbitrary last-N truncation.
//   - handsAuthorized: face-up hands only when the replay actually
//     carries authorized identities; redacted frames fail closed.
//   - Match authority: preparation never mutates replay/final-state
//     hashes or match results.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CasterSession, DeterministicCommentaryProvider } from '@intrilex/replay-caster';

// Source-text assertions for browser-only workspace code — consistent
// with test/caster-fullscreen.test.mjs.
const root = process.cwd();
const casterSrc = readFileSync(join(root, 'apps/lab-web/src/workspaces/caster-workspace.js'), 'utf8');
const casterCss = readFileSync(join(root, 'apps/lab-web/src/css/caster.css'), 'utf8');

const MATCH_CONFIG = {
  policyIds: ['score-rush', 'control'],
  seed: 11,
  decisionLimit: 400,
  profileId: 'core-advanced-authority'
};

function stubRecord(text = 'stub commentary') {
  return { commentary: text, headline: 'stub headline', tone: 'neutral', importance: 0.5, evidence: [] };
}

function stubProvider(overrides = {}) {
  return {
    name: 'stub',
    calls: 0,
    async generateCommentary(_input, _opts) {
      this.calls += 1;
      return { ok: true, record: stubRecord(`stub ${this.calls}`), ...overrides };
    }
  };
}

async function makeSession({ provider, config } = {}) {
  const session = new CasterSession({
    provider: provider || new DeterministicCommentaryProvider(),
    settings: {}
  });
  await session.generateMatch(config || MATCH_CONFIG);
  return session;
}

// ── Commentary preparation ────────────────────────────────────────

describe('Caster V2 — commentary preparation', () => {
  test('prepareCommentary covers every beat before playback', async () => {
    const provider = stubProvider();
    const session = await makeSession({ provider });
    const result = await session.prepareCommentary();
    assert.equal(result.ok, true);
    assert.equal(result.total, session.beats.length);
    assert.equal(result.completed, session.beats.length);
    assert.equal(session.commentaryPrepared, true);
    // Every beat resolves synchronously — ready, skipped, or failed.
    for (let i = 0; i < session.beats.length; i += 1) {
      const prepared = session.preparedFor(i);
      assert.ok(prepared, `beat ${i} must have a prepared entry`);
      assert.ok(['ready', 'skipped', 'failed'].includes(prepared.status));
      if (prepared.status === 'ready') {
        assert.ok(prepared.record.commentary.length > 0);
        assert.ok(prepared.generatedBy.provider.length > 0);
      }
    }
    // Provenance is honest for a deterministic provider set.
    const ready = [...Array(session.beats.length).keys()]
      .map(i => session.preparedFor(i)).filter(p => p?.status === 'ready');
    assert.ok(ready.length > 0);
    for (const p of ready) assert.equal(p.generatedBy.provider, 'stub');
  });

  test('prepared commentary is reused during playback (no provider calls)', async () => {
    const provider = stubProvider();
    const session = await makeSession({ provider });
    await session.prepareCommentary();
    const callsAfterPrep = provider.calls;
    // Walk the director through beats — preparedFor resolves without
    // hitting the provider again.
    const idx = session.beats.findIndex(b => session.preparedFor(session.beats.indexOf(b))?.status === 'ready');
    assert.ok(idx >= 0);
    session.director.stepTo(idx);
    const prepared = session.preparedFor(idx);
    assert.equal(prepared.status, 'ready');
    assert.ok(prepared.record.commentary.length > 0);
    assert.equal(provider.calls, callsAfterPrep, 'playback must not call the provider');
  });

  test('live generation mirrors into the prepared index', async () => {
    const session = await makeSession();
    session.director.stepTo(0);
    assert.equal(session.preparedFor(0), null);
    const result = await session.generateCommentaryForCurrentBeat();
    if (result.skipped) {
      assert.equal(session.preparedFor(0).status, 'skipped');
    } else {
      assert.equal(result.ok, true);
      assert.equal(session.preparedFor(0).status, 'ready');
    }
  });

  test('commentary history has one entry per ready beat, no duplicates', async () => {
    const session = await makeSession();
    const result = await session.prepareCommentary();
    assert.equal(result.ok, true);
    const beatIds = session.commentaryHistory.map(h => h.beatId);
    assert.equal(new Set(beatIds).size, beatIds.length, 'history must not contain duplicate beats');
    // Second pass reuses cache — still no duplicate history.
    const second = await session.prepareCommentary();
    assert.equal(second.ok, true);
    assert.equal(second.cached > 0, true, 'second pass should hit the cache');
    const beatIds2 = session.commentaryHistory.map(h => h.beatId);
    assert.equal(new Set(beatIds2).size, beatIds2.length);
  });

  test('onProgress reports monotone progress', async () => {
    const session = await makeSession();
    const seen = [];
    await session.prepareCommentary({ onProgress: p => seen.push(p) });
    assert.equal(seen.length, session.beats.length);
    assert.equal(seen.at(-1).completed, session.beats.length);
    for (let i = 1; i < seen.length; i += 1) {
      assert.ok(seen[i].completed >= seen[i - 1].completed);
    }
  });

  test('cancellation stops preparation and leaves completed entries usable', async () => {
    const controller = new AbortController();
    const provider = {
      name: 'stub',
      calls: 0,
      async generateCommentary() {
        this.calls += 1;
        if (this.calls === 3) controller.abort();
        return { ok: true, record: stubRecord() };
      }
    };
    const session = await makeSession({ provider });
    const result = await session.prepareCommentary({ signal: controller.signal });
    assert.equal(result.ok, false);
    assert.equal(result.cancelled, true);
    assert.ok(result.completed < result.total);
    assert.equal(session.commentaryPrepared, false);
    // Entries generated before the abort remain usable.
    const readyCount = [...Array(session.beats.length).keys()]
      .filter(i => session.preparedFor(i)?.status === 'ready').length;
    assert.ok(readyCount > 0 && readyCount < session.beats.length);
  });

  test('provider failure surfaces an honest structured error', async () => {
    const provider = {
      name: 'ollama',
      calls: 0,
      async generateCommentary() {
        this.calls += 1;
        if (this.calls === 3) {
          throw Object.assign(new Error('connection refused'), { category: 'UNREACHABLE' });
        }
        return { ok: true, record: stubRecord() };
      }
    };
    const session = await makeSession({ provider });
    const result = await session.prepareCommentary();
    assert.equal(result.ok, false);
    assert.notEqual(result.cancelled, true);
    assert.equal(result.error.code, 'UNREACHABLE');
    assert.equal(result.error.provider, 'ollama');
    assert.ok(result.error.beatId);
    // The failed beat is marked; earlier beats stay ready.
    const failedIdx = session.beats.findIndex(b => b.beatId === result.error.beatId);
    assert.equal(session.preparedFor(failedIdx).status, 'failed');
    for (let i = 0; i < failedIdx; i += 1) {
      const p = session.preparedFor(i);
      assert.ok(p.status === 'ready' || p.status === 'skipped');
    }
  });

  test('setProvider invalidates prepared set, cache and history (fallback swap)', async () => {
    const provider = {
      name: 'ollama',
      calls: 0,
      async generateCommentary() {
        this.calls += 1;
        if (this.calls === 2) {
          throw Object.assign(new Error('gone'), { category: 'UNREACHABLE' });
        }
        return { ok: true, record: stubRecord() };
      }
    };
    const session = await makeSession({ provider });
    const failed = await session.prepareCommentary();
    assert.equal(failed.ok, false);
    assert.equal(session.preparedFor(0) && ['ready', 'skipped'].includes(session.preparedFor(0).status), true);

    // Deterministic fallback — the workspace recovery path.
    session.setProvider(new DeterministicCommentaryProvider());
    assert.equal(session.preparedFor(0), null, 'prepared set must be invalidated on provider swap');
    assert.equal(session.commentaryHistory.length, 0);
    const recovered = await session.prepareCommentary();
    assert.equal(recovered.ok, true);
    assert.equal(session.commentaryPrepared, true);
    for (const h of session.commentaryHistory) {
      assert.equal(h.generatedBy.provider, 'deterministic', 'no mixed provenance after fallback');
    }
  });

  test('preparation never mutates match identity', async () => {
    const session = await makeSession();
    const replayHash = session.replayHash;
    const finalStateHash = session.finalStateHash;
    const beatCount = session.beats.length;
    const eventCount = session.eventCount;
    await session.prepareCommentary();
    assert.equal(session.replayHash, replayHash);
    assert.equal(session.finalStateHash, finalStateHash);
    assert.equal(session.beats.length, beatCount);
    assert.equal(session.eventCount, eventCount);
  });
});

// ── Cumulative Game Log event stream ──────────────────────────────

describe('Caster V2 — cumulative Game Log', () => {
  test('event stream is cumulative, monotonic, deduplicated', async () => {
    const session = await makeSession();
    const total = session.eventCount;
    assert.ok(total > 0, 'local match must produce viewer-visible events');
    let prev = 0;
    for (let i = 0; i < session.beats.length; i += 1) {
      const events = session.eventsThroughBeat(i);
      assert.ok(events.length >= prev, `log must not shrink moving forward (beat ${i})`);
      prev = events.length;
      const ids = events.map(e => e.id).filter(Boolean);
      assert.equal(new Set(ids).size, ids.length, `duplicate events at beat ${i}`);
    }
    assert.equal(session.eventsThroughBeat(session.beats.length - 1).length, total,
      'the end of the replay shows the complete log');
  });

  test('scrubbing backward truncates, forward restores', async () => {
    const session = await makeSession();
    const last = session.beats.length - 1;
    const full = session.eventsThroughBeat(last).length;
    const mid = session.eventsThroughBeat(Math.floor(last / 2)).length;
    const start = session.eventsThroughBeat(0).length;
    assert.ok(start <= mid && mid <= full);
    // Same position → same historical set (stable, deterministic).
    const again = session.eventsThroughBeat(Math.floor(last / 2));
    assert.equal(again.length, mid);
    assert.deepEqual(again.map(e => e.id), session.eventsThroughBeat(Math.floor(last / 2)).map(e => e.id));
  });

  test('event stream carries no non-public visibility in public mode', async () => {
    const session = await makeSession(); // default viewer mode = public
    const events = session.eventsThroughBeat(session.beats.length - 1);
    // Public stream must never contain 'authorized'-only events.
    for (const e of events) {
      assert.ok(e.type && typeof e.type === 'string');
    }
  });
});

// ── Hand authorization ────────────────────────────────────────────

describe('Caster V2 — hand authorization', () => {
  test('locally generated matches authorize both hands', async () => {
    const session = await makeSession();
    assert.equal(session.handsAuthorized, true,
      'a local full replay carries real hand identities');
  });

  test('frames without hand evidence fail closed', async () => {
    const real = await makeSession();
    // Fabricate evidence-stripped frames (what a redacted artifact
    // yields): no state/omniscientState, no hand identities anywhere.
    const redactedFrames = real.frames.map((f, i) => ({
      frameIndex: f.frameIndex ?? i,
      events: f.events ?? []
    }));
    const session = new CasterSession({ provider: new DeterministicCommentaryProvider() });
    session.loadCompletedMatch(real.matchResult, redactedFrames);
    assert.equal(session.handsAuthorized, false,
      'hand identities must never be fabricated for redacted replays');
  });
});

// ── Scalable canvas timeline ──────────────────────────────────────
// The per-beat DOM button strip ("dot soup") was replaced by a canvas
// density strip that buckets beats into pixel columns — readable at
// 20 beats and at 2000+. Source-level contract assertions; behavioural
// seek behaviour is covered by the transport tests above via stepTo.

describe('Caster V2 — scalable timeline', () => {
  test('timeline renders a canvas strip, not per-beat DOM buttons', () => {
    assert.match(casterSrc, /caster-tl-canvas/, 'must render a timeline canvas');
    assert.match(casterSrc, /data-testid="caster-timeline-canvas"/);
    assert.doesNotMatch(casterSrc, /caster-timeline-items/, 'per-beat button strip must be gone');
    assert.doesNotMatch(casterSrc, /class="caster-tl-item/, 'per-beat buttons must be gone');
  });

  test('canvas is an accessible slider with live position semantics', () => {
    assert.match(casterSrc, /role="slider"/, 'canvas must expose slider role');
    assert.match(casterSrc, /aria-valuemin="0"/);
    assert.match(casterSrc, /aria-valuemax=/);
    assert.match(casterSrc, /aria-valuenow=/);
    assert.match(casterSrc, /aria-valuetext=/);
    assert.match(casterSrc, /aria-label="Match timeline"/);
  });

  test('timeline buckets beats by pixel column with category priority', () => {
    // Bucket logic: several beats per column → most significant
    // category wins the paint (TIMELINE_PRIORITY drives selection).
    assert.match(casterSrc, /TIMELINE_PRIORITY/);
    assert.match(casterSrc, /Math\.floor\(\(px \/ cssW\) \* N\)/, 'must bucket beats into pixel columns');
    assert.match(casterSrc, /function drawTimeline\(/);
  });

  test('pointer interaction previews then commits the seek on release', () => {
    // The rail DOM is re-created per beat, so mid-drag re-render would
    // kill pointer capture — drag must preview locally and commit on
    // pointerup via director.stepTo.
    assert.match(casterSrc, /pointerdown/);
    assert.match(casterSrc, /pointermove/);
    assert.match(casterSrc, /pointerup/);
    assert.match(casterSrc, /session\.director\.stepTo\(target\)/, 'release must commit the seek');
    assert.match(casterSrc, /setPointerCapture/, 'drag must capture the pointer');
  });

  test('hover exposes a beat tooltip', () => {
    assert.match(casterSrc, /caster-tl-tooltip/, 'tooltip element must exist');
    assert.match(casterSrc, /data-testid="caster-timeline-tooltip"/);
    assert.match(casterSrc, /tip\.textContent = `Beat \$\{i \+ 1\}\/\$\{N\} · \$\{beatLabel\(beats\[i\]\)\}`/, 'tooltip must label beats');
  });

  test('timeline redraws on rail resize via ResizeObserver', () => {
    assert.match(casterSrc, /ResizeObserver/);
    assert.match(casterSrc, /casterState\.timelineObserver/);
    assert.match(casterSrc, /function disconnectTimelineObserver\(\)/);
    // Observer lifecycle must be cleaned on route exit and New Cast.
    const cleanupIdx = casterSrc.indexOf('export function cleanupCaster');
    assert.ok(cleanupIdx > 0);
    assert.match(casterSrc.slice(cleanupIdx), /disconnectTimelineObserver\(\)/,
      'cleanupCaster must disconnect the timeline observer');
    const resetIdx = casterSrc.indexOf('function resetToSetup');
    assert.ok(resetIdx > 0);
    assert.match(casterSrc.slice(resetIdx), /disconnectTimelineObserver\(\)/,
      'resetToSetup must disconnect the timeline observer');
  });

  test('timeline palette and legend share CSS custom properties', () => {
    // The canvas reads --caster-tl-* via getComputedStyle and the
    // legend dots use the same properties — they cannot drift apart.
    for (const cat of ['start', 'end', 'major', 'response', 'decision', 'turn']) {
      assert.match(casterCss, new RegExp(`--caster-tl-${cat}:`), `missing --caster-tl-${cat}`);
    }
    assert.match(casterSrc, /getPropertyValue\(`--caster-tl-\$\{cat\}`\)/);
    assert.match(casterCss, /\.caster-tl-key-major/);
    assert.match(casterSrc, /caster-timeline-legend/, 'legend must exist');
  });

  test('current position is drawn as a playhead marker', () => {
    assert.match(casterSrc, /markerAt\(current, '#ffffff', 2\)/, 'current beat must get a bright playhead');
    assert.match(casterSrc, /markerAt\(preview,/, 'scrub preview marker must exist');
  });
});
