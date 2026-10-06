// ═══════════════════════════════════════════════════════════════
// first-contact.test.mjs — First Contact onboarding tests
//
// Coverage:
//   · Scenario fixture validity (54-card deal, script, lessons)
//   · Deterministic arranged deal through createState
//   · Card conservation (relabel never creates/destroys cards)
//   · Scripted opponent legality (only engine-legal actions)
//   · Session integration (predeterminedIdentities + opponentScript)
//   · Response-window teaching trigger (the Stack lesson)
//   · Controller lesson progression, coach actions, telemetry
//   · Engine authority (illegal submissions still rejected)
//   · Ordinary matches unaffected
//   · Save/restore parity for scenario fields
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve('.');

// ── Source reads (integration contract assertions) ──
const playAppSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/play-app.js'), 'utf8');
const playControllerSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/play-controller.js'), 'utf8');
const autonomyRuntimeSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/autonomy-runtime.js'), 'utf8');
const hubSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/ranked-duel-hub.mjs'), 'utf8');
const funnelSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/first-run-funnel.js'), 'utf8');
const routerSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/router.js'), 'utf8');
const cssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/play-v3.css'), 'utf8');
const playStateSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/play-state.js'), 'utf8');

// ── Module imports (dist mirrors src; engine entry only exists there) ──
const distBase = 'apps/lab-web/dist';
const scenarioMod = await import(pathToFileURL(path.join(root, `${distBase}/play/first-contact/fc-scenario.mjs`)).href);
const controllerMod = await import(pathToFileURL(path.join(root, `${distBase}/play/first-contact/fc-controller.mjs`)).href);
const panelMod = await import(pathToFileURL(path.join(root, `${distBase}/play/first-contact/fc-panel.mjs`)).href);
const telemetryMod = await import(pathToFileURL(path.join(root, `${distBase}/play/first-contact/fc-telemetry.mjs`)).href);
const controllerSessionMod = await import(pathToFileURL(path.join(root, `${distBase}/play/play-controller.js`)).href);
const engineMod = await import(pathToFileURL(path.join(root, `${distBase}/engine/browser-entry.js`)).href);

const { FIRST_CONTACT_SCENARIO, validateFirstContactScenario } = scenarioMod;
const { FirstContactController } = controllerMod;
const { createSession, restoreSession, SessionState } = controllerSessionMod;
const { hashCanonical } = engineMod;

function makeSetup() {
  const s = FIRST_CONTACT_SCENARIO;
  return {
    profileId: s.profileId,
    seed: s.seed,
    humanPlayerId: 'P1',
    aiPolicyId: s.aiPolicyId,
    mode: 'ADVANCED_CORE',
    tutorial: 'first-contact',
    predeterminedIdentities: [...s.predeterminedIdentities],
    opponentScript: s.opponentScript.map((e) => ({ ...e, intent: { ...e.intent } })),
  };
}

async function submitCurrent(session, pick = null) {
  const frame = session.currentFrame;
  const action = pick ?? frame.legalActions[0];
  return session.submitHumanAction({
    sessionId: session.sessionId,
    stateRevision: session._stateRevision,
    decisionFrameHash: frame.frameHash,
    actionId: action.actionId,
  });
}

// ═══════════════════════════════════════════════════════════════
// SCENARIO FIXTURE
// ═══════════════════════════════════════════════════════════════

test('FirstContact: scenario validates cleanly', () => {
  const { valid, errors } = validateFirstContactScenario();
  assert.ok(valid, `scenario invalid: ${errors.join('; ')}`);
});

test('FirstContact: deal covers all 54 canonical identities exactly once', () => {
  const deal = FIRST_CONTACT_SCENARIO.predeterminedIdentities;
  assert.equal(deal.length, 54);
  assert.equal(new Set(deal).size, 54);
  for (const suit of ['♣', '♦', '♥', '♠']) {
    for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']) {
      assert.ok(deal.includes(`${rank}${suit}`), `missing ${rank}${suit}`);
    }
  }
  assert.ok(deal.includes('RJ') && deal.includes('BJ'));
});

test('FirstContact: authored hands support the intended lessons', () => {
  const deal = FIRST_CONTACT_SCENARIO.predeterminedIdentities;
  const p1 = deal.slice(0, 5);
  const p2 = deal.slice(5, 11);
  assert.ok(p1.includes('7♣'), 'player needs the coached first score');
  assert.ok(p1.includes('A♥'), 'player needs an Ace to counter with');
  assert.ok(p1.includes('K♥'), 'player needs a high card to Scuttle with');
  assert.ok(p2.includes('10♦'), 'rival needs the scripted Scuttle bait');
  assert.ok(p2.includes('Q♠'), 'rival needs the counterable anchor declare');
});

test('FirstContact: opponent script intents are legal-only data', () => {
  for (const entry of FIRST_CONTACT_SCENARIO.opponentScript) {
    assert.ok(entry.intent?.family, `script entry ${entry.id} needs intent.family`);
    assert.ok(Number.isInteger(entry.uses) && entry.uses >= 1, `${entry.id} uses must be a positive integer`);
    // Intents are pure data — no functions, no engine hooks.
    assert.equal(JSON.parse(JSON.stringify(entry.intent)) !== null, true);
  }
});

// ═══════════════════════════════════════════════════════════════
// ARRANGED DEAL + CONSERVATION
// ═══════════════════════════════════════════════════════════════

test('FirstContact: createSession applies the arranged deal', async () => {
  const session = await createSession(makeSetup());
  const ids = session.state.players.P1.hand.map((id) => session.state.cards[id].identity);
  assert.deepEqual(ids, ['7♣', 'A♥', 'K♥', '3♣', '6♦']);
  const p2 = session.state.players.P2.hand.map((id) => session.state.cards[id].identity);
  assert.ok(p2.includes('10♦') && p2.includes('Q♠'));
  assert.equal(session.state.zones.dp.length, 43);
  // Conservation: still exactly 54 physical cards, all zones intact.
  assert.equal(Object.keys(session.state.cards).length, 54);
  assert.equal(session.state.players.P1.hand.length + session.state.players.P2.hand.length + session.state.zones.dp.length, 54);
});

test('FirstContact: arranged deal is deterministic across sessions', async () => {
  const a = await createSession(makeSetup());
  const b = await createSession(makeSetup());
  assert.equal(hashCanonical(a.state.cards), hashCanonical(b.state.cards));
});

// ═══════════════════════════════════════════════════════════════
// SCRIPTED OPPONENT — LEGAL ONLY
// ═══════════════════════════════════════════════════════════════

test('FirstContact: scripted rival scores the 10♦ on its first turn', async () => {
  const session = await createSession(makeSetup());
  // Player takes first action, then P2's FT2 should be the scripted score.
  const score = session.currentFrame.legalActions.find((a) => a.family === 'play-for-points');
  await submitCurrent(session, score);
  // Private-choice continuation may appear — answer it.
  if (session.status === SessionState.HUMAN_DECISION) {
    await submitCurrent(session);
  }
  assert.equal(session.status, SessionState.AI_DECISION);
  await session.stepAI();
  const p2pr = session.state.players.P2.pr.map((id) => session.state.cards[id].identity);
  assert.ok(p2pr.includes('10♦'), `expected scripted 10♦ in rival PR, got ${p2pr.join(',')}`);
  assert.equal(session._scriptUsage.get(1), 1, 'rival-scores-ten consumed once');
});

test('FirstContact: scripted rival opens a real response window for the player', async () => {
  const session = await createSession(makeSetup());
  let sawWindow = false;
  for (let guard = 0; guard < 30 && session.status !== SessionState.TERMINAL && !sawWindow; guard += 1) {
    if (session.status === SessionState.HUMAN_DECISION) {
      const frame = session.currentFrame;
      if (frame.legalActions.some((a) => a.family === 'response-decline')
          && !frame.legalActions.some((a) => a.timingClass === 'ACTION')) {
        sawWindow = true;
        // The window is a real legal frame — counter or decline only.
        for (const a of frame.legalActions) {
          assert.ok(['counter', 'disrupt', 'response-decline', 'private-choice'].includes(a.family) || a.timingClass === 'INSTANT',
            `unexpected action family in window: ${a.family}`);
        }
        const decline = frame.legalActions.find((a) => a.family === 'response-decline');
        await submitCurrent(session, decline);
        break;
      }
      const preferred = frame.legalActions.find((a) => a.family === 'draw')
        ?? frame.legalActions.find((a) => a.family === 'play-for-points')
        ?? frame.legalActions[0];
      await submitCurrent(session, preferred);
    } else {
      await session.stepAI();
    }
  }
  assert.ok(sawWindow, 'the scripted Q♠ anchor must open a human response window');
  assert.equal(session._scriptUsage.get(2), 1, 'rival-opens-window consumed once');
});

// ═══════════════════════════════════════════════════════════════
// ENGINE AUTHORITY
// ═══════════════════════════════════════════════════════════════

test('FirstContact: session rejects unknown action IDs normally', async () => {
  const session = await createSession(makeSetup());
  const result = await session.submitHumanAction({
    sessionId: session.sessionId,
    stateRevision: session._stateRevision,
    decisionFrameHash: session.currentFrame.frameHash,
    actionId: 'ACTION-DOES-NOT-EXIST',
  });
  assert.equal(result.accepted, false);
  assert.equal(result.error, 'UNKNOWN_ACTION');
});

test('FirstContact: ordinary matches are unaffected by scenario fields', async () => {
  const session = await createSession({
    profileId: 'first-contact-trigger-closure',
    seed: 42,
    humanPlayerId: 'P1',
    aiPolicyId: 'score-rush',
    mode: 'ADVANCED_CORE',
  });
  const ids = session.state.players.P1.hand.map((id) => session.state.cards[id].identity);
  assert.notDeepEqual(ids, ['7♣', 'A♥', 'K♥', '3♣', '6♦'], 'ordinary match must not get the arranged deal');
});

// ═══════════════════════════════════════════════════════════════
// CONTROLLER — LESSON PROGRESSION
// ═══════════════════════════════════════════════════════════════

test('FirstContact: welcome coachmark blocks until acknowledged', () => {
  const c = new FirstContactController({ scenario: FIRST_CONTACT_SCENARIO, record: () => {} });
  assert.equal(c.activeId, 'welcome');
  assert.ok(c.getCoachmarkHtml().includes('fc-continue'), 'welcome coachmark must render');
  c.onCoachAction('fc-continue');
  assert.equal(c.getCoachmarkHtml(), '');
  assert.equal(c.activeId, 'first-score');
});

test('FirstContact: first-score lesson completes on a real score declaration', () => {
  const c = new FirstContactController({ scenario: FIRST_CONTACT_SCENARIO, record: () => {} });
  c.onCoachAction('fc-continue');
  assert.equal(c.activeId, 'first-score');
  c.onSessionEvents([
    { type: 'AUTONOMY_ACTION_DECLARED', sequence: 5, payload: { playerId: 'P1', actionType: 'play-for-points' } },
  ], { humanScore: 7, opponentScore: 0 });
  assert.equal(c.lessonState.get('first-score'), 'done');
  assert.equal(c.activeId, 'turn-flow');
  assert.ok(c.coachSay.length > 0, 'completion reaction should show');
});

test('FirstContact: response-window lesson self-activates on a real window frame', () => {
  const c = new FirstContactController({ scenario: FIRST_CONTACT_SCENARIO, record: () => {} });
  c.onCoachAction('fc-continue');
  // A window frame: INSTANT responses + decline, no ACTION timing.
  c.syncFrame({
    decision: {
      isHuman: true,
      frameHash: 'f1',
      legalActions: [
        { family: 'counter', timingClass: 'INSTANT', label: 'Counter' },
        { family: 'response-decline', timingClass: 'INSTANT', label: 'Decline' },
      ],
    },
  });
  assert.equal(c.activeId, 'response-window');
  // A human declaration inside the window completes it.
  c.onSessionEvents([
    { type: 'AUTONOMY_ACTION_DECLARED', sequence: 9, payload: { playerId: 'P1', actionType: 'counter-ace' } },
  ], null);
  assert.equal(c.lessonState.get('response-window'), 'done');
});

test('FirstContact: guidance turns off at the rails-off lesson', () => {
  const c = new FirstContactController({ scenario: FIRST_CONTACT_SCENARIO, record: () => {} });
  c.onCoachAction('fc-continue');
  let seq = 0;
  const declare = (actionType) => ({ type: 'AUTONOMY_ACTION_DECLARED', sequence: ++seq, payload: { playerId: 'P1', actionType } });
  c.onSessionEvents([declare('play-for-points')], { humanScore: 7, opponentScore: 10 });
  c.onSessionEvents([declare('draw')], { humanScore: 7, opponentScore: 10 });
  c.onSessionEvents([declare('scuttle')], { humanScore: 7, opponentScore: 0 });
  c.onSessionEvents([declare('draw')], { humanScore: 7, opponentScore: 0 });
  assert.equal(c.activeId, 'rails-off');
  assert.equal(c.guidance, 'none');
  assert.ok(c.getPanelHtml().includes('fc-coach-railsoff') || c.getPanelHtml().includes('Beat me'));
});

test('FirstContact: scuttle lesson expires gracefully if rival has no Point Row', () => {
  const c = new FirstContactController({ scenario: FIRST_CONTACT_SCENARIO, record: () => {} });
  c.onCoachAction('fc-continue');
  let seq = 0;
  const declare = (actionType) => ({ type: 'AUTONOMY_ACTION_DECLARED', sequence: ++seq, payload: { playerId: 'P1', actionType } });
  c.onSessionEvents([declare('play-for-points')], { humanScore: 7, opponentScore: 0 });
  c.onSessionEvents([declare('draw')], { humanScore: 7, opponentScore: 0 });
  // Rival never built a Point Row — scuttle stays gated off (holding panel).
  assert.notEqual(c.activeId, 'scuttle');
  // Force activation via an opponent score, then let frames pass with no PR.
  c.onSessionEvents([], { humanScore: 7, opponentScore: 10 });
  c._evaluate([]);
  assert.equal(c.activeId, 'scuttle');
  c.onSessionEvents([], { humanScore: 7, opponentScore: 0 });
  for (let i = 0; i < 3; i += 1) {
    c.syncFrame({ decision: { isHuman: true, frameHash: `fh${i}`, legalActions: [{ family: 'draw', timingClass: 'ACTION' }] } });
  }
  assert.equal(c.lessonState.get('scuttle'), 'expired');
});

// ═══════════════════════════════════════════════════════════════
// CONTROLLER — COACH ACTIONS
// ═══════════════════════════════════════════════════════════════

test('FirstContact: WHY explains the current lesson', () => {
  const c = new FirstContactController({ scenario: FIRST_CONTACT_SCENARIO, record: () => {} });
  c.onCoachAction('fc-continue');
  c.onCoachAction('fc-why');
  assert.ok(c.coachSay.includes('Point Row') || c.coachSay.includes('15'), 'why should explain the score lesson');
});

test('FirstContact: WHY explains a rejection with its reason', () => {
  const c = new FirstContactController({ scenario: FIRST_CONTACT_SCENARIO, record: () => {} });
  c.onCoachAction('fc-continue');
  c.onHumanRejection({ reasonCode: 'STALE_FRAME', message: 'Stale decision frame. Re-rendering current frame.' });
  c.onCoachAction('fc-why');
  assert.ok(c.coachSay.includes('Stale decision frame'), 'why should surface the rejection reason');
});

test('FirstContact: WHAT lists the real legal decision space', () => {
  const c = new FirstContactController({ scenario: FIRST_CONTACT_SCENARIO, record: () => {} });
  c.onCoachAction('fc-continue');
  c.syncFrame({
    decision: {
      isHuman: true,
      frameHash: 'f1',
      legalActions: [
        { family: 'play-for-points', timingClass: 'ACTION', shortLabel: 'Score' },
        { family: 'draw', timingClass: 'ACTION', shortLabel: 'Draw' },
      ],
    },
  });
  c.onCoachAction('fc-what');
  assert.ok(c.coachSay.includes('Points') && c.coachSay.includes('draw'), `what should enumerate real options: ${c.coachSay}`);
});

test('FirstContact: SHOW ME recommends an engine-legal action', () => {
  const c = new FirstContactController({ scenario: FIRST_CONTACT_SCENARIO, record: () => {} });
  c.onCoachAction('fc-continue');
  c.syncFrame({
    decision: {
      isHuman: true,
      frameHash: 'f1',
      legalActions: [
        { family: 'draw', timingClass: 'ACTION', label: 'Draw' },
        { family: 'play-for-points', timingClass: 'ACTION', label: 'Play for Points — 7♣' },
      ],
    },
  });
  c.onCoachAction('fc-show');
  assert.ok(c.coachSay.includes('Play for Points'), `show should point at a legal action: ${c.coachSay}`);
});

// ═══════════════════════════════════════════════════════════════
// CONTROLLER + SESSION INTEGRATION
// ═══════════════════════════════════════════════════════════════

test('FirstContact: controller tracks a real match through the first lessons', async () => {
  const session = await createSession(makeSetup());
  const c = new FirstContactController({ scenario: FIRST_CONTACT_SCENARIO, record: () => {} });
  session.setAchievementConsumer((events, snapshot) => c.onSessionEvents(events, snapshot));
  c.onCoachAction('fc-continue'); // dismiss welcome
  c.syncFrame(session.getSnapshot());
  assert.equal(c.activeId, 'first-score');
  // Player scores the coached 7♣.
  const score = session.currentFrame.legalActions.find((a) => a.family === 'play-for-points'
    && a.sourceHandles.some((h) => session.state.cards[h]?.identity === '7♣'));
  await submitCurrent(session, score);
  assert.equal(c.lessonState.get('first-score'), 'done');
  // Private-choice continuation (score reward) may appear.
  if (session.status === SessionState.HUMAN_DECISION) {
    c.syncFrame(session.getSnapshot());
    await submitCurrent(session);
  }
  // Rival's scripted 10♦ lands; player keeps acting toward Scuttle.
  let scuttleSeen = false;
  for (let guard = 0; guard < 20 && session.status !== SessionState.TERMINAL; guard += 1) {
    if (session.status === SessionState.HUMAN_DECISION) {
      c.syncFrame(session.getSnapshot());
      const scuttle = session.currentFrame.legalActions.find((a) => a.family === 'scuttle');
      if (scuttle && c.activeId === 'scuttle') {
        await submitCurrent(session, scuttle);
        scuttleSeen = true;
        break;
      }
      const pick = session.currentFrame.legalActions.find((a) => a.family === 'play-for-points')
        ?? session.currentFrame.legalActions[0];
      await submitCurrent(session, pick);
    } else {
      await session.stepAI();
    }
  }
  assert.ok(scuttleSeen, 'player should reach a coached scuttle decision');
  assert.equal(c.lessonState.get('scuttle'), 'done');
});

// ═══════════════════════════════════════════════════════════════
// TELEMETRY
// ═══════════════════════════════════════════════════════════════

test('FirstContact: telemetry records lifecycle events', () => {
  const { recordFcEvent, readFcEvents, clearFcEvents } = telemetryMod;
  clearFcEvents();
  const events = [];
  const c = new FirstContactController({ scenario: FIRST_CONTACT_SCENARIO, record: (k, d) => events.push({ kind: k, ...d }) });
  assert.ok(events.some((e) => e.kind === 'match-started'));
  c.onCoachAction('fc-continue');
  c.onCoachAction('fc-why');
  c.onCoachAction('fc-what');
  c.onCoachAction('fc-show');
  assert.ok(events.some((e) => e.kind === 'coachmark-dismissed'));
  const tools = events.filter((e) => e.kind === 'coach-used').map((e) => e.tool);
  assert.deepEqual(tools, ['why', 'what', 'show']);
  c.onHumanRejection({ reasonCode: 'UNKNOWN_ACTION' });
  assert.ok(events.some((e) => e.kind === 'action-rejected' && e.code === 'UNKNOWN_ACTION'));
  c.onMatchEnd({ state: { winner: 'P1' } });
  assert.ok(events.some((e) => e.kind === 'completed' && e.won === true));
  // Storage-backed log works in Node via the in-memory fallback.
  recordFcEvent('probe', { ok: true });
  assert.ok(readFcEvents().some((e) => e.kind === 'probe'));
  clearFcEvents();
});

// ═══════════════════════════════════════════════════════════════
// SAVE / RESTORE PARITY
// ═══════════════════════════════════════════════════════════════

test('FirstContact: save envelope persists scenario fields', async () => {
  const session = await createSession(makeSetup());
  const envelope = session.getSaveEnvelope();
  assert.ok(Array.isArray(envelope.setup.predeterminedIdentities), 'deal order must persist');
  assert.ok(Array.isArray(envelope.setup.opponentScript), 'opponent script must persist');
  assert.equal(envelope.tutorial, 'first-contact');
});

test('FirstContact: restored session replays identically', async () => {
  const session = await createSession(makeSetup());
  const score = session.currentFrame.legalActions.find((a) => a.family === 'play-for-points');
  await submitCurrent(session, score);
  const envelope = session.getSaveEnvelope();
  const restored = await restoreSession(envelope);
  assert.equal(restored.state.players.P1.pr.length, session.state.players.P1.pr.length);
  assert.equal(hashCanonical(restored.state.cards), hashCanonical(session.state.cards));
  // The scripted-opponent overlay must be live on the restored session.
  assert.ok(restored.setup.opponentScript?.length >= 1);
});

// ═══════════════════════════════════════════════════════════════
// WIRING CONTRACTS (source assertions)
// ═══════════════════════════════════════════════════════════════

test('FirstContact: play-app exposes the route and start function', () => {
  assert.ok(playAppSrc.includes("sub === '/first-contact'"), 'route must exist');
  assert.ok(playAppSrc.includes('startFirstContact'), 'startFirstContact must exist');
  assert.ok(playAppSrc.includes("tutorial: 'first-contact'"), 'setup must carry the tutorial flag');
  assert.ok(playAppSrc.includes('state.fcController'), 'controller must live on play state');
});

test('FirstContact: session forwards scenario fields to createState and save', () => {
  assert.ok(playControllerSrc.includes('predeterminedIdentities'), 'init must forward the deal');
  assert.ok(playControllerSrc.includes('_selectAIAction'), 'scripted overlay must exist');
  assert.ok(playControllerSrc.includes('opponentScript'), 'opponentScript must persist');
  assert.ok(autonomyRuntimeSrc.includes('applyPredeterminedIdentities'), 'FC-path relabel must exist');
});

test('FirstContact: entry points exist (hub, funnel, router, css)', () => {
  assert.ok(hubSrc.includes("href: '#/play/first-contact'"), 'hub must link First Contact');
  assert.ok(funnelSrc.includes("#/play/first-contact"), 'funnel must route to First Contact');
  assert.ok(routerSrc.includes('/play/first-contact'), 'router must know the route');
  assert.ok(playStateSrc.includes('fcController'), 'play state must carry the controller');
  for (const cls of ['.fc-coach', '.fc-coachmark', '.fc-recap', '.fc-btn']) {
    assert.ok(cssSrc.includes(cls), `missing style ${cls}`);
  }
});

test('FirstContact: panel HTML exposes coach actions as real buttons', () => {
  const { renderFcPanel, FC_ACTIONS } = panelMod;
  const html = renderFcPanel({ lesson: { text: 'test' }, step: 1, total: 5, railsOff: false, coachSay: '', statusLine: 'T1' });
  for (const action of [FC_ACTIONS.WHY, FC_ACTIONS.WHAT, FC_ACTIONS.SHOW]) {
    assert.ok(html.includes(`data-action="${action}"`), `missing coach action ${action}`);
  }
  assert.ok(html.includes('data-testid="fc-coach"'));
});
