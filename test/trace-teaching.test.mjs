// ═══════════════════════════════════════════════════════════════
// trace-teaching.test.mjs — Tests for trace-based teaching insights
//
// Tests the pure functions in trace-teaching.mjs that generate
// frame-level teaching insights from certified replay data.
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  generateTraceInsights,
  generateReplayCommentary,
  recommendPracticeFromInsight,
  renderTraceInsight,
  renderTraceInsights,
} from '../apps/lab-web/src/forensic/trace-teaching.mjs';

// ── Mock replay data ────────────────────────────────────────────

function makeMockFrame(frameIndex, stateOverrides = {}, command = null) {
  return {
    state: {
      turn: frameIndex,
      phase: 'main',
      drawPile: new Array(20 - frameIndex).fill({ identity: 'HIDDEN' }),
      discardPile: new Array(frameIndex).fill({ identity: '2♣' }),
      players: {
        P1: { hand: new Array(5).fill({ identity: '3♣' }), secured: frameIndex * 2, ...stateOverrides.P1 },
        P2: { hand: new Array(4).fill({ identity: '4♣' }), secured: frameIndex, ...stateOverrides.P2 },
      },
      ...stateOverrides,
    },
    events: [],
    command: command ?? { type: 'PLAY', actorId: 'P1', action: { kind: 'play' } },
    commandIndex: frameIndex - 1,
    frameIndex,
    accepted: true,
  };
}

function makeMockReplay(overrides = {}) {
  const frames = [
    makeMockFrame(0, { P1: { secured: 0, hand: new Array(5).fill({}) }, P2: { secured: 0, hand: new Array(5).fill({}) } }),
    makeMockFrame(1, { P1: { secured: 2 }, P2: { secured: 0 } }),
    makeMockFrame(2, { P1: { secured: 4 }, P2: { secured: 1 } }),
    makeMockFrame(3, { P1: { secured: 6 }, P2: { secured: 3 } }),
    makeMockFrame(4, { P1: { secured: 8 }, P2: { secured: 5 } }),
  ];
  return {
    initialState: { players: { P1: { secured: 0 }, P2: { secured: 0 } } },
    commands: [{ type: 'PLAY' }, { type: 'PLAY' }, { type: 'PLAY' }, { type: 'PLAY' }],
    frames,
    ...overrides,
  };
}

function makeReplayWithPivotalTurn() {
  const frames = [
    makeMockFrame(0, { P1: { secured: 0 }, P2: { secured: 0 } }),
    makeMockFrame(1, { P1: { secured: 2 }, P2: { secured: 0 } }),
    makeMockFrame(2, { P1: { secured: 4 }, P2: { secured: 0 } }),
    // Pivotal: P2 jumps from 0 to 5 (shift of -5 for P1)
    makeMockFrame(3, { P1: { secured: 4 }, P2: { secured: 5 } }, { type: 'PLAY', actorId: 'P2', action: { kind: 'score' } }),
    makeMockFrame(4, { P1: { secured: 6 }, P2: { secured: 5 } }),
  ];
  return { initialState: {}, commands: [], frames };
}

function makeReplayWithPass() {
  const frames = [
    makeMockFrame(0, { P1: { secured: 0, hand: new Array(5).fill({}) } }),
    makeMockFrame(1, { P1: { secured: 2, hand: new Array(4).fill({}) } }),
    // Pass with cards in hand
    makeMockFrame(2, { P1: { secured: 2, hand: new Array(4).fill({}) } }, { type: 'PASS', actorId: 'P1', action: { kind: 'pass' } }),
    makeMockFrame(3, { P1: { secured: 2, hand: new Array(4).fill({}) } }),
  ];
  return { initialState: {}, commands: [], frames };
}

function makeReplayWithDeckExhaustion() {
  const frames = [
    makeMockFrame(0, { drawPile: new Array(3).fill({}), P1: { secured: 0, hand: new Array(5).fill({}) } }),
    makeMockFrame(1, { drawPile: new Array(2).fill({}), P1: { secured: 2, hand: new Array(5).fill({}) } }),
    makeMockFrame(2, { drawPile: new Array(1).fill({}), P1: { secured: 4, hand: new Array(5).fill({}) } }),
    // Deck exhausted
    makeMockFrame(3, { drawPile: [], P1: { secured: 6, hand: new Array(5).fill({}) } }),
    makeMockFrame(4, { drawPile: [], P1: { secured: 8, hand: new Array(4).fill({}) } }),
  ];
  return { initialState: {}, commands: [], frames };
}

// ── generateTraceInsights tests ─────────────────────────────────

test('TraceTeaching: generateTraceInsights returns empty array for no frames', () => {
  assert.deepEqual(generateTraceInsights(null), []);
  assert.deepEqual(generateTraceInsights({}), []);
  assert.deepEqual(generateTraceInsights({ frames: [] }), []);
});

test('TraceTeaching: generateTraceInsights returns array of insights', () => {
  const replay = makeReplayWithPivotalTurn();
  const insights = generateTraceInsights(replay);
  assert.ok(Array.isArray(insights));
  assert.ok(insights.length > 0, 'Should generate at least one insight');
});

test('TraceTeaching: insights have required fields', () => {
  const replay = makeReplayWithPivotalTurn();
  const insights = generateTraceInsights(replay);
  for (const insight of insights) {
    assert.ok(insight.id, 'Insight should have an id');
    assert.ok(insight.category, 'Insight should have a category');
    assert.ok(typeof insight.frameIndex === 'number', 'Insight should have a numeric frameIndex');
    assert.ok(insight.title, 'Insight should have a title');
    assert.ok(insight.observation, 'Insight should have an observation');
    assert.ok(insight.alternative, 'Insight should have an alternative');
    assert.ok(insight.consequence, 'Insight should have a consequence');
    assert.ok(insight.lesson, 'Insight should have a lesson');
  }
});

test('TraceTeaching: detects pivotal turns with large IR shifts', () => {
  const replay = makeReplayWithPivotalTurn();
  const insights = generateTraceInsights(replay);
  const pivotal = insights.filter(i => i.category === 'pivotal');
  assert.ok(pivotal.length > 0, 'Should detect pivotal turns');
  // The pivotal turn is at frame 3 where P2 jumps from 0 to 5
  const lossPivotal = pivotal.find(i => i.title.includes('loss'));
  assert.ok(lossPivotal, 'Should detect the pivotal loss');
  assert.equal(lossPivotal.frameIndex, 3);
});

test('TraceTeaching: detects tempo losses (passing with cards)', () => {
  const replay = makeReplayWithPass();
  const insights = generateTraceInsights(replay);
  const tempo = insights.filter(i => i.category === 'tempo');
  assert.ok(tempo.length > 0, 'Should detect tempo losses');
  assert.ok(tempo[0].title.includes('Tempo pass'), 'Should have tempo pass title');
});

test('TraceTeaching: does NOT flag pass with empty hand as tempo loss', () => {
  const frames = [
    makeMockFrame(0, { P1: { secured: 0, hand: new Array(5).fill({}) } }),
    makeMockFrame(1, { P1: { secured: 2, hand: [] } }, { type: 'PASS', actorId: 'P1', action: { kind: 'pass' } }),
  ];
  const insights = generateTraceInsights({ initialState: {}, commands: [], frames });
  const tempo = insights.filter(i => i.category === 'tempo');
  assert.equal(tempo.length, 0, 'Should not flag pass with empty hand');
});

test('TraceTeaching: detects deck exhaustion', () => {
  const replay = makeReplayWithDeckExhaustion();
  const insights = generateTraceInsights(replay);
  const efficiency = insights.filter(i => i.category === 'efficiency');
  assert.ok(efficiency.length > 0, 'Should detect deck exhaustion');
  assert.ok(efficiency[0].title.includes('Deck exhausted'), 'Should have deck exhausted title');
});

test('TraceTeaching: insights are sorted by frame index', () => {
  const replay = makeReplayWithPivotalTurn();
  const insights = generateTraceInsights(replay);
  for (let i = 1; i < insights.length; i++) {
    assert.ok(insights[i].frameIndex >= insights[i - 1].frameIndex,
      `Insights should be sorted by frame index: ${insights[i].frameIndex} >= ${insights[i - 1].frameIndex}`);
  }
});

test('TraceTeaching: insights include bookmarkLabel for easy bookmarking', () => {
  const replay = makeReplayWithPivotalTurn();
  const insights = generateTraceInsights(replay);
  for (const insight of insights) {
    assert.ok(insight.bookmarkLabel, 'Each insight should have a bookmarkLabel');
  }
});

test('TraceTeaching: respects perspectivePlayerId option', () => {
  const replay = makeReplayWithPivotalTurn();
  const insightsP1 = generateTraceInsights(replay, { perspectivePlayerId: 'P1' });
  const insightsP2 = generateTraceInsights(replay, { perspectivePlayerId: 'P2' });
  // P1 sees the pivotal turn as a loss, P2 sees it as a gain
  const p1Pivotal = insightsP1.filter(i => i.category === 'pivotal');
  const p2Pivotal = insightsP2.filter(i => i.category === 'pivotal');
  if (p1Pivotal.length > 0 && p2Pivotal.length > 0) {
    const p1Loss = p1Pivotal.find(i => i.title.includes('loss'));
    const p2Gain = p2Pivotal.find(i => i.title.includes('gain'));
    assert.ok(p1Loss || p2Gain, 'Different perspectives should produce different insights');
  }
});

// ── generateReplayCommentary tests ──────────────────────────────

test('TraceTeaching: generateReplayCommentary returns commentary array', () => {
  const replay = makeReplayWithPivotalTurn();
  const commentary = generateReplayCommentary(replay);
  assert.ok(Array.isArray(commentary));
  assert.ok(commentary.length > 0);
  for (const c of commentary) {
    assert.ok(typeof c.frameIndex === 'number');
    assert.ok(typeof c.commentary === 'string');
    assert.ok(typeof c.category === 'string');
  }
});

test('TraceTeaching: generateReplayCommentary returns empty for no frames', () => {
  assert.deepEqual(generateReplayCommentary(null), []);
  assert.deepEqual(generateReplayCommentary({}), []);
});

// ── recommendPracticeFromInsight tests ──────────────────────────

test('TraceTeaching: recommendPracticeFromInsight returns puzzle config', () => {
  const insight = {
    id: 'test-1',
    category: 'tempo',
    frameIndex: 5,
    title: 'Test',
    observation: 'Test',
    alternative: 'Test',
    consequence: 'Test',
    lesson: 'Test lesson',
  };
  const rec = recommendPracticeFromInsight(insight, makeMockReplay());
  assert.ok(rec, 'Should return a recommendation');
  assert.equal(rec.frameIndex, 5);
  assert.equal(rec.objectiveType, 'WIN_WITHIN_TURNS');
  assert.ok(rec.reason.includes('tempo'));
});

test('TraceTeaching: recommendPracticeFromInsight maps categories to objectives', () => {
  const categories = ['tempo', 'defense', 'efficiency', 'positioning', 'pivotal'];
  for (const category of categories) {
    const insight = { id: 'test', category, frameIndex: 0, title: '', observation: '', alternative: '', consequence: '', lesson: '' };
    const rec = recommendPracticeFromInsight(insight, makeMockReplay());
    assert.ok(rec.objectiveType, `Category ${category} should map to an objective type`);
  }
});

test('TraceTeaching: recommendPracticeFromInsight returns null for null insight', () => {
  assert.equal(recommendPracticeFromInsight(null, makeMockReplay()), null);
  assert.equal(recommendPracticeFromInsight({}, null), null);
});

// ── renderTraceInsight tests ────────────────────────────────────

test('TraceTeaching: renderTraceInsight returns HTML string', () => {
  const insight = {
    id: 'test-1',
    category: 'pivotal',
    frameIndex: 5,
    title: 'Test Insight',
    observation: 'This happened',
    alternative: 'That could have happened',
    consequence: 'This resulted',
    lesson: 'Learn this',
    bookmarkLabel: 'Test bookmark',
  };
  const html = renderTraceInsight(insight);
  assert.ok(typeof html === 'string');
  assert.ok(html.includes('trace-insight'));
  assert.ok(html.includes('data-testid="trace-insight"'));
  assert.ok(html.includes('data-category="pivotal"'));
  assert.ok(html.includes('data-frame="5"'));
  assert.ok(html.includes('Test Insight'));
  assert.ok(html.includes('This happened'));
  assert.ok(html.includes('That could have happened'));
  assert.ok(html.includes('This resulted'));
  assert.ok(html.includes('Learn this'));
  assert.ok(html.includes('Bookmark this frame'));
});

test('TraceTeaching: renderTraceInsight escapes HTML in content', () => {
  const insight = {
    id: 'test-xss',
    category: 'tempo',
    frameIndex: 1,
    title: '<script>alert("xss")</script>',
    observation: 'Safe & sound',
    alternative: '<b>bold</b>',
    consequence: '"quoted"',
    lesson: "It's a test",
  };
  const html = renderTraceInsight(insight);
  assert.ok(!html.includes('<script>'), 'Should escape script tags');
  assert.ok(html.includes('&lt;script&gt;'), 'Should contain escaped script tags');
  assert.ok(html.includes('&amp;'), 'Should escape ampersands');
  assert.ok(html.includes('&quot;'), 'Should escape quotes');
});

test('TraceTeaching: renderTraceInsight returns empty for null', () => {
  assert.equal(renderTraceInsight(null), '');
});

// ── renderTraceInsights tests ───────────────────────────────────

test('TraceTeaching: renderTraceInsights renders list', () => {
  const insights = [
    { id: '1', category: 'tempo', frameIndex: 1, title: 'A', observation: 'a', alternative: 'a', consequence: 'a', lesson: 'a' },
    { id: '2', category: 'defense', frameIndex: 2, title: 'B', observation: 'b', alternative: 'b', consequence: 'b', lesson: 'b' },
  ];
  const html = renderTraceInsights(insights);
  assert.ok(html.includes('trace-insights'));
  assert.ok(html.includes('data-testid="trace-insights"'));
  assert.ok(html.includes('trace-insight'));
});

test('TraceTeaching: renderTraceInsights shows empty state for no insights', () => {
  const html = renderTraceInsights([]);
  assert.ok(html.includes('trace-insights-empty'));
  assert.ok(html.includes('data-testid="trace-insights-empty"'));
});

test('TraceTeaching: renderTraceInsights shows empty state for null', () => {
  const html = renderTraceInsights(null);
  assert.ok(html.includes('trace-insights-empty'));
});

// ── Source inspection tests ─────────────────────────────────────

const traceSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/forensic/trace-teaching.mjs'), 'utf8');
const viewerSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/forensic/forensic-viewer.mjs'), 'utf8');
const appSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/app.js'), 'utf8');

test('TraceTeaching: module exports all required functions', () => {
  assert.ok(traceSrc.includes('export function generateTraceInsights'));
  assert.ok(traceSrc.includes('export function generateReplayCommentary'));
  assert.ok(traceSrc.includes('export function recommendPracticeFromInsight'));
  assert.ok(traceSrc.includes('export function renderTraceInsight'));
  assert.ok(traceSrc.includes('export function renderTraceInsights'));
});

test('TraceTeaching: module is pure (no DOM, no persistence)', () => {
  assert.ok(!traceSrc.includes('document.'), 'Should not access document');
  assert.ok(!traceSrc.includes('window.'), 'Should not access window');
  assert.ok(!traceSrc.includes('localStorage'), 'Should not use localStorage');
  assert.ok(!traceSrc.includes('IndexedDB'), 'Should not use IndexedDB');
});

test('TraceTeaching: module has no React dependency', () => {
  assert.ok(!traceSrc.includes('react'), 'Should not import React');
});

test('TraceTeaching: viewer imports trace teaching functions', () => {
  assert.ok(viewerSrc.includes('generateTraceInsights'), 'Viewer should import generateTraceInsights');
  assert.ok(viewerSrc.includes('renderTraceInsights'), 'Viewer should import renderTraceInsights');
  assert.ok(viewerSrc.includes('generateReplayCommentary'), 'Viewer should import generateReplayCommentary');
  assert.ok(viewerSrc.includes('recommendPracticeFromInsight'), 'Viewer should import recommendPracticeFromInsight');
});

test('TraceTeaching: viewer has generate-insights action handler', () => {
  assert.ok(viewerSrc.includes("case 'generate-insights'"), 'Viewer should handle generate-insights action');
});

test('TraceTeaching: viewer has add-bookmark-from-insight action handler', () => {
  assert.ok(viewerSrc.includes("case 'add-bookmark-from-insight'"), 'Viewer should handle add-bookmark-from-insight action');
});

test('TraceTeaching: viewer stores traceInsights in state', () => {
  assert.ok(viewerSrc.includes('traceInsights'), 'Viewer should store traceInsights in state');
});

test('TraceTeaching: viewer renders teaching insights section in sidebar', () => {
  assert.ok(viewerSrc.includes('forensic-teaching-section'), 'Sidebar should have teaching section');
  assert.ok(viewerSrc.includes('forensic-trace-insights'), 'Sidebar should have trace insights container');
  assert.ok(viewerSrc.includes('forensic-generate-insights'), 'Sidebar should have generate insights button');
});

test('TraceTeaching: app.js wires add-bookmark-from-insight action', () => {
  assert.ok(appSrc.includes('add-bookmark-from-insight'), 'app.js should handle add-bookmark-from-insight');
  assert.ok(appSrc.includes('data.frame'), 'app.js should read frame from dataset');
  assert.ok(appSrc.includes('data.label'), 'app.js should read label from dataset');
});

test('TraceTeaching: CSS has trace insight styles', () => {
  const cssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/css/forensic.css'), 'utf8');
  assert.ok(cssSrc.includes('.trace-insight'), 'CSS should have trace-insight styles');
  assert.ok(cssSrc.includes('.trace-insight-title'), 'CSS should have trace-insight-title');
  assert.ok(cssSrc.includes('.trace-insight-observation'), 'CSS should have trace-insight-observation');
  assert.ok(cssSrc.includes('.trace-insight-lesson'), 'CSS should have trace-insight-lesson');
  assert.ok(cssSrc.includes('.trace-insight-bookmark'), 'CSS should have trace-insight-bookmark');
});

test('TraceTeaching: CSS has category-specific border colors', () => {
  const cssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/css/forensic.css'), 'utf8');
  assert.ok(cssSrc.includes('[data-category="pivotal"]'), 'CSS should have pivotal category styling');
  assert.ok(cssSrc.includes('[data-category="tempo"]'), 'CSS should have tempo category styling');
  assert.ok(cssSrc.includes('[data-category="defense"]'), 'CSS should have defense category styling');
  assert.ok(cssSrc.includes('[data-category="efficiency"]'), 'CSS should have efficiency category styling');
});

// ── Practice button tests ───────────────────────────────────────

test('TraceTeaching: renderTraceInsight includes practice button', () => {
  const insight = {
    id: 'test-practice',
    category: 'tempo',
    frameIndex: 3,
    title: 'Test',
    observation: 'Test',
    alternative: 'Test',
    consequence: 'Test',
    lesson: 'Test',
    bookmarkLabel: 'Test',
  };
  const html = renderTraceInsight(insight);
  assert.ok(html.includes('trace-insight-practice'), 'Should include practice button');
  assert.ok(html.includes('data-forensic-action="practice-from-insight"'), 'Should have practice-from-insight action');
  assert.ok(html.includes('data-testid="trace-insight-practice"'), 'Should have testid');
  assert.ok(html.includes('data-frame="3"'), 'Should have frame index');
  assert.ok(html.includes('data-category="tempo"'), 'Should have category');
});

test('TraceTeaching: viewer has practice-from-insight action handler', () => {
  assert.ok(viewerSrc.includes("case 'practice-from-insight'"), 'Viewer should handle practice-from-insight action');
});

test('TraceTeaching: viewer maps insight categories to objective types', () => {
  // The mapping is now in recommendPracticeFromInsight, not the viewer.
  // Verify the viewer delegates to it.
  assert.ok(viewerSrc.includes('recommendPracticeFromInsight'),
    'Viewer should call recommendPracticeFromInsight for objective mapping');
});

test('TraceTeaching: app.js wires practice-from-insight action', () => {
  assert.ok(appSrc.includes('practice-from-insight'), 'app.js should handle practice-from-insight');
  assert.ok(appSrc.includes('data.category'), 'app.js should read category from dataset');
});

test('TraceTeaching: CSS has practice button styles', () => {
  const cssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/css/forensic.css'), 'utf8');
  assert.ok(cssSrc.includes('.trace-insight-practice'), 'CSS should have practice button styles');
});

// ── Phase 7 polish: all exports used, no dead imports ───────────

test('TraceTeaching: viewer uses recommendPracticeFromInsight (not inline map)', () => {
  // The practice-from-insight handler should call recommendPracticeFromInsight
  // rather than duplicating the category→objective mapping inline.
  assert.ok(viewerSrc.includes('recommendPracticeFromInsight'),
    'practice-from-insight should call recommendPracticeFromInsight');
  assert.ok(!viewerSrc.includes("tempo: 'WIN_WITHIN_TURNS'"),
    'practice-from-insight should NOT have inline objective map');
});

test('TraceTeaching: viewer uses generateReplayCommentary in generate-insights', () => {
  assert.ok(viewerSrc.includes('generateReplayCommentary'),
    'generate-insights should call generateReplayCommentary');
  assert.ok(viewerSrc.includes('replayCommentary: commentary'),
    'generate-insights should store replayCommentary in state');
});

test('TraceTeaching: viewer stores replayCommentary in initial state', () => {
  assert.ok(viewerSrc.includes('replayCommentary: null'),
    'Initial store state should include replayCommentary: null');
});

test('TraceTeaching: viewer exports getFrameCommentary', () => {
  assert.ok(viewerSrc.includes('export function getFrameCommentary'),
    'Viewer should export getFrameCommentary');
});

test('TraceTeaching: viewer exports renderFrameCommentary', () => {
  assert.ok(viewerSrc.includes('export function renderFrameCommentary'),
    'Viewer should export renderFrameCommentary');
});

test('TraceTeaching: renderFrameCommentary returns HTML with banner class', () => {
  assert.ok(viewerSrc.includes('forensic-commentary-banner'),
    'renderFrameCommentary should render forensic-commentary-banner');
  assert.ok(viewerSrc.includes('data-testid="forensic-commentary-banner"'),
    'renderFrameCommentary should have data-testid');
});

test('TraceTeaching: app.js imports renderFrameCommentary', () => {
  assert.ok(appSrc.includes('renderFrameCommentary'),
    'app.js should import renderFrameCommentary');
});

test('TraceTeaching: app.js renders commentary banner for current frame', () => {
  assert.ok(appSrc.includes('renderFrameCommentary(state.frame)'),
    'app.js should call renderFrameCommentary with current frame');
});

test('TraceTeaching: CSS has commentary banner styles', () => {
  const cssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/css/forensic.css'), 'utf8');
  assert.ok(cssSrc.includes('.forensic-commentary-banner'), 'CSS should have commentary banner styles');
  assert.ok(cssSrc.includes('.forensic-commentary-icon'), 'CSS should have commentary icon styles');
  assert.ok(cssSrc.includes('.forensic-commentary-text'), 'CSS should have commentary text styles');
  assert.ok(cssSrc.includes('[data-category="pivotal"]'), 'CSS should have pivotal commentary category');
});

// ── Terminal trace insights integration tests ───────────────────

const terminalSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/ranked-duel-terminal.mjs'), 'utf8');
const playAppSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/play-app.js'), 'utf8');
const rankedDuelCssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/ranked-duel.css'), 'utf8');

test('TraceTeaching: terminal imports trace teaching functions', () => {
  assert.ok(terminalSrc.includes('generateTraceInsights'),
    'Terminal should import generateTraceInsights');
  assert.ok(terminalSrc.includes('renderTraceInsights'),
    'Terminal should import renderTraceInsights');
});

test('TraceTeaching: terminal has renderTraceInsightsCard function', () => {
  assert.ok(terminalSrc.includes('function renderTraceInsightsCard'),
    'Terminal should have renderTraceInsightsCard function');
});

test('TraceTeaching: terminal renders trace insights card', () => {
  assert.ok(terminalSrc.includes('renderTraceInsightsCard(opts)'),
    'Terminal should call renderTraceInsightsCard');
  assert.ok(terminalSrc.includes('trace-insights-card'),
    'Terminal should render trace-insights-card');
});

test('TraceTeaching: terminal trace insights card has title and description', () => {
  assert.ok(terminalSrc.includes('Frame-Level Analysis'),
    'Terminal card should have "Frame-Level Analysis" title');
});

test('TraceTeaching: terminal trace insights card handles missing certifiedReplay', () => {
  // The function should return empty string when no certifiedReplay is available
  assert.ok(terminalSrc.includes("if (!certifiedReplay?.frames?.length) return ''"),
    'renderTraceInsightsCard should return empty string when no certifiedReplay');
});

test('TraceTeaching: play-app caches certified replay on terminal', () => {
  assert.ok(playAppSrc.includes('_terminalCertifiedReplay'),
    'play-app should cache terminal certified replay');
  assert.ok(playAppSrc.includes('createCertifiedReplay'),
    'play-app should call createCertifiedReplay');
});

test('TraceTeaching: play-app passes certifiedReplay to renderBoard', () => {
  assert.ok(playAppSrc.includes('certifiedReplay: state._terminalCertifiedReplay'),
    'play-app should pass certifiedReplay to renderBoard options');
});

test('TraceTeaching: ranked-duel.css has trace insights card styles', () => {
  assert.ok(rankedDuelCssSrc.includes('.trace-insights-card'),
    'ranked-duel.css should have trace-insights-card styles');
  assert.ok(rankedDuelCssSrc.includes('.trace-insights-card-title'),
    'ranked-duel.css should have trace-insights-card-title');
});

test('TraceTeaching: terminal hides bookmark/practice buttons in card context', () => {
  assert.ok(rankedDuelCssSrc.includes('.trace-insight-bookmark'),
    'ranked-duel.css should hide bookmark buttons in terminal context');
  assert.ok(rankedDuelCssSrc.includes('display: none'),
    'Terminal context should hide bookmark/practice buttons');
});

// ── sidebarLocked removal tests ─────────────────────────────────

const gameTableTsxSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/client/game-table.tsx'), 'utf8');
const gameTableCssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/client/game-table.css'), 'utf8');

test('SidebarLock: removed from TableSettings interface', () => {
  assert.ok(!gameTableTsxSrc.includes('sidebarLocked'),
    'sidebarLocked should be removed from game-table.tsx entirely');
});

test('SidebarLock: removed from data-sidebar-locked attribute', () => {
  assert.ok(!gameTableTsxSrc.includes('data-sidebar-locked'),
    'data-sidebar-locked attribute should be removed');
});

test('SidebarLock: lock toggle button removed', () => {
  assert.ok(!gameTableTsxSrc.includes('astra-sidebar-lock'),
    'Lock toggle button should be removed');
});

test('SidebarLock: CSS no longer references data-sidebar-locked', () => {
  assert.ok(!gameTableCssSrc.includes('data-sidebar-locked'),
    'CSS should no longer reference data-sidebar-locked');
});

test('SidebarLock: CSS no longer has sidebar-lock class', () => {
  assert.ok(!gameTableCssSrc.includes('astra-sidebar-lock'),
    'CSS should no longer have astra-sidebar-lock class');
});

test('SidebarLock: CSS still has sidebar compact behavior (unconditional)', () => {
  // The compact sidebar behavior should still exist, just without the conditional
  assert.ok(gameTableCssSrc.includes('.astra-client .astra-sidebar'),
    'CSS should still have sidebar styles');
  assert.ok(gameTableCssSrc.includes('grid-template-columns: 76px'),
    'CSS should still have 76px compact column');
});

// ═══════════════════════════════════════════════════════════════
// ENHANCEMENT-FIRST POLISH — dead code, race conditions, perf
// ═══════════════════════════════════════════════════════════════

test('Polish: no dead imports in forensic-viewer (updateBookmark removed)', () => {
  assert.ok(!viewerSrc.includes('updateBookmark'),
    'updateBookmark should be removed from imports (was dead)');
});

test('Polish: no dead imports in forensic-viewer (findBookmarkAtFrame removed)', () => {
  assert.ok(!viewerSrc.includes('findBookmarkAtFrame'),
    'findBookmarkAtFrame should be removed from imports (was dead)');
});

test('Polish: no dead imports in forensic-viewer (validateForensicSession removed)', () => {
  assert.ok(!viewerSrc.includes('validateForensicSession'),
    'validateForensicSession should be removed from imports (was dead)');
});

test('Polish: no dead state fields (showBranchPanel removed)', () => {
  assert.ok(!viewerSrc.includes('showBranchPanel'),
    'showBranchPanel should be removed from store init (was dead — set but never read)');
});

test('Polish: no dead state fields (showComparisonPanel removed)', () => {
  assert.ok(!viewerSrc.includes('showComparisonPanel'),
    'showComparisonPanel should be removed from store init (was dead)');
});

test('Polish: no dead state fields (bookmarkNote removed)', () => {
  assert.ok(!viewerSrc.includes('bookmarkNote'),
    'bookmarkNote should be removed from store init (was dead)');
});

test('Polish: no dead state fields (branchCommands removed)', () => {
  assert.ok(!viewerSrc.includes('branchCommands'),
    'branchCommands should be removed from store init (was dead)');
});

test('Polish: terminal replay cache has session identity guard', () => {
  assert.ok(playAppSrc.includes('state.session?.sessionId === sessionId'),
    'Terminal replay cache should check session identity before writing');
});

test('Polish: terminal replay cache captures sessionId before async', () => {
  assert.ok(playAppSrc.includes('const sessionId = state.session.sessionId'),
    'Terminal replay cache should capture sessionId before async call');
});

test('Polish: trace-teaching has no dead playerHand variable', () => {
  assert.ok(!traceSrc.includes('const playerHand = getIRScore'),
    'findMissedCounters should not have dead playerHand variable');
});

test('Polish: getFrameCommentary uses Map for O(1) lookup', () => {
  assert.ok(viewerSrc.includes('replayCommentaryMap'),
    'Viewer should use replayCommentaryMap for O(1) lookup');
  assert.ok(viewerSrc.includes('replayCommentaryMap.get(frameIndex)'),
    'getFrameCommentary should use Map.get() when available');
});

test('Polish: generate-insights builds commentaryMap', () => {
  assert.ok(viewerSrc.includes('new Map(commentary.map'),
    'generate-insights should build a Map from commentary array');
}

);

test('Polish: replayCommentaryMap in initial store state', () => {
  assert.ok(viewerSrc.includes('replayCommentaryMap: null'),
    'Initial store state should include replayCommentaryMap: null');
});

test('Polish: getFrameCommentary falls back to linear scan without Map', () => {
  assert.ok(viewerSrc.includes('state.replayCommentary.find('),
    'getFrameCommentary should fall back to .find() when Map is not available');
});
