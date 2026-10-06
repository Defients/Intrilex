// ═══════════════════════════════════════════════════════════════
// fc-controller.mjs — First Contact match orchestration
//
// Owns the tutorial's *cursor*: which lesson is showing, when it
// advances, what the coach says. It is a consumer of authoritative
// session output only —
//
//   onSessionEvents(events, snapshot)   engine event batches
//   syncFrame(snapshot)                 current decision frame
//   onHumanRejection(rejection)         structured reason codes
//   onCoachAction(actionId)             coach button presses
//   onMatchEnd(snapshot)                terminal recap
//
// and it emits *presentation* only (panel HTML, coachmark HTML,
// telemetry events). It never decides legality, never mutates game
// state, and never inspects the DOM. Lesson predicates live in
// fc-scenario.mjs; this class just evaluates them.
//
// Design notes
// ────────────
//  · Lessons activate sequentially by default (priorResolved). A
//    lesson declaring its own `activates` predicate (the response
//    window) may fire out of order and takes the panel until it
//    completes or expires; pending lessons remain open.
//  · `expires` retires a lesson whose teaching window is gone so the
//    cursor can never stall on an impossible instruction.
//  · The rails-off lesson flips `guidance` to 'none' — the panel
//    shrinks to a quiet strip and the coach buttons stay available.
//  · Telemetry rides through `record` (fc-telemetry) — injectable for
//    tests. Everything recorded here is observable engine state.
// ═══════════════════════════════════════════════════════════════

import { FC_ACTIONS, renderFcCoachmark, renderFcPanel } from './fc-panel.mjs';
import { recordFcEvent } from './fc-telemetry.mjs';
import { matchIntent } from '../guided-exhibition/guided-runtime.mjs';

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Friendly verbs for WHAT CAN I DO? — keyed off engine action family,
// never re-derived legality. Unknown families degrade to the raw id.
const FAMILY_VERBS = Object.freeze({
  'play-for-points': 'play a card for Points',
  draw: 'draw a card',
  scuttle: 'scuttle one of their Point-Row cards',
  counter: 'counter with an Ace',
  'counter-ace': 'counter with an Ace',
  disrupt: 'disrupt with a Jack',
  'response-decline': 'decline and let it resolve',
  'effect-private-choice': 'play a card effect',
  'effect-row-clear': 'play a row-clear effect',
  'effect-goal-shift': 'play a goal-shift effect',
  'effect-red-joker': 'play the Red Joker',
  'effect-board-lock': 'play a board-lock effect',
  anchor: 'anchor a royal',
  'anchor-guard': 'anchor a guard',
  'anchor-private-choice': 'anchor a royal',
  'private-choice': 'choose a card',
});

export class FirstContactController {
  /**
   * @param {object} opts
   * @param {object} opts.scenario — FIRST_CONTACT_SCENARIO
   * @param {(kind: string, data?: object) => void} [opts.record] — telemetry sink
   * @param {(actions: object[]) => object[]} [opts.rankSuggestions] — the
   *   same suggestion ranker handed to the board; used by SHOW ME when
   *   the lesson has no scripted expectation.
   */
  constructor({ scenario, record = recordFcEvent, rankSuggestions = null } = {}) {
    this.scenario = scenario;
    this.lessons = scenario.lessons;
    this._record = record;
    this._rankSuggestions = rankSuggestions;

    this.humanId = scenario.humanPlayerId ?? 'P1';
    this.opponentId = this.humanId === 'P1' ? 'P2' : 'P1';

    this.events = [];
    this.acked = {};
    this.lessonState = new Map(); // id -> 'pending' | 'active' | 'done' | 'expired'
    for (const lesson of this.lessons) this.lessonState.set(lesson.id, 'pending');

    this.activeId = null;
    this.activationSeq = 0;
    this.framesSinceActivation = 0;
    this.lastFrameHash = null;
    this.coachSay = '';
    this.lastRejection = null;
    this.guidance = 'guided';
    this.completed = false;
    this.startedAt = Date.now();
    this.lessonEnteredAt = this.startedAt;

    this._record('match-started', { scenario: scenario.id, seed: scenario.seed });
    this._evaluate([]);
  }

  /**
   * Every lesson before `lesson` is resolved — where *triggered* lessons
   * don't count. A triggered lesson that hasn't fired yet (e.g. no
   * response window has opened) must not block the sequential curriculum
   * behind it; it will still take the panel when its moment comes.
   */
  _priorResolved(lesson) {
    const idx = this.lessons.indexOf(lesson);
    return this.lessons.slice(0, idx)
      .every((l) => l.triggered === true || ['done', 'expired'].includes(this.lessonState.get(l.id)));
  }

  // ── ctx for lesson predicates ────────────────────────────────
  _ctx(batch = [], lesson = null) {
    const lastSeq = this.events.length ? this.events[this.events.length - 1].sequence ?? 0 : 0;
    return {
      events: this.events,
      batch,
      snapshot: this._snapshot ?? null,
      frame: this._frame ?? null,
      humanId: this.humanId,
      opponentId: this.opponentId,
      priorResolved: lesson ? this._priorResolved(lesson) : false,
      framesSinceActivation: this.framesSinceActivation,
      activationSeq: this.activationSeq,
      acked: this.acked,
      lastSeq,
    };
  }

  _lesson(id) { return this.lessons.find((l) => l.id === id) ?? null; }

  _activate(lesson) {
    this.activeId = lesson.id;
    this.lessonState.set(lesson.id, 'active');
    this.activationSeq = this.events.length ? this.events[this.events.length - 1].sequence ?? 0 : 0;
    this.framesSinceActivation = 0;
    this.lessonEnteredAt = Date.now();
    // Deliberately keep coachSay — a completion reaction from the lesson
    // that just resolved belongs on the new panel too.
    if (lesson.guidance === 'none' && this.guidance !== 'none') {
      this.guidance = 'none';
      this._record('guidance-off', { lesson: lesson.id });
    }
    this._record('lesson-entered', { lesson: lesson.id });
  }

  _resolve(lesson, how) {
    this.lessonState.set(lesson.id, how);
    if (this.activeId === lesson.id) this.activeId = null;
    this._record('lesson-completed', { lesson: lesson.id, how, ms: Date.now() - this.lessonEnteredAt });
    if (how === 'done' && lesson.reaction) this.coachSay = lesson.reaction;
  }

  /**
   * Recompute activation/completion. `batch` is the events since the
   * last evaluation — predicates use it to spot *this* step's actions.
   * Loops until the cursor is stable so cascading completions chain.
   */
  _evaluate(batch) {
    for (let guard = 0; guard < this.lessons.length + 2; guard += 1) {
      let changed = false;

      // 1. Triggered lessons — their `activates` does not depend on
      //    priorResolved, so they can take the panel out of order.
      for (const lesson of this.lessons) {
        if (this.lessonState.get(lesson.id) !== 'pending' || !lesson.activates || !lesson.triggered) continue;
        if (this.activeId === lesson.id) continue;
        // Don't interrupt an unacknowledged coachmark — it blocks play anyway.
        if (this.activeId && this._lesson(this.activeId)?.coachmark) break;
        if (lesson.activates(this._ctx(batch, lesson))) {
          if (this.activeId) this.lessonState.set(this.activeId, 'pending');
          this._activate(lesson);
          changed = true;
          break;
        }
      }

      // 2. Sequential activation — the earliest pending *non-triggered*
      //    lesson. Triggered lessons only fire via step 1; they must not
      //    hold the sequential cursor while they wait for their moment.
      if (!this.activeId) {
        for (const lesson of this.lessons) {
          if (this.lessonState.get(lesson.id) !== 'pending' || lesson.triggered) continue;
          const ctx = this._ctx(batch, lesson);
          const can = lesson.activates ? lesson.activates(ctx) : ctx.priorResolved;
          if (can) { this._activate(lesson); changed = true; }
          break;
        }
      }

      // 3. Completion / expiry of the active lesson.
      if (this.activeId) {
        const lesson = this._lesson(this.activeId);
        const ctx = this._ctx(batch, lesson);
        if (lesson.complete(ctx)) { this._resolve(lesson, 'done'); changed = true; }
        else if (lesson.expires?.(ctx)) { this._resolve(lesson, 'expired'); changed = true; }
      }

      if (!changed) return;
    }
  }

  // ── session inputs ───────────────────────────────────────────

  /**
   * Engine event batch + achievement snapshot, forwarded by the session
   * consumer hook. Same contract as AcademyController.onSessionEvents.
   */
  onSessionEvents(events, snapshot) {
    if (!Array.isArray(events)) return;
    this.events.push(...events);
    if (snapshot) this._snapshot = snapshot;
    this._evaluate(events);
  }

  /**
   * Called on every render with the full UI snapshot so the controller
   * can see the current decision frame (legal actions for WHAT/SHOW,
   * response-window detection for activation).
   */
  syncFrame(snapshot) {
    if (!snapshot) return;
    this._snapshot = snapshot;
    const frame = snapshot.decision ?? null;
    // Count proactive human frames once each — drives expires() and the
    // "you've had N turns" sense of pacing.
    if (frame?.isHuman && frame.frameHash !== this.lastFrameHash) {
      this.lastFrameHash = frame.frameHash;
      if (this.activeId && frame.legalActions?.some((a) => a.timingClass === 'ACTION')) {
        this.framesSinceActivation += 1;
      }
    }
    this._frame = frame;
    this._evaluate([]);
  }

  /** A human action the engine/session rejected. */
  onHumanRejection(rejection = {}) {
    this.lastRejection = rejection;
    this._record('action-rejected', {
      lesson: this.activeId,
      code: rejection.reasonCode ?? rejection.code ?? 'UNKNOWN',
    });
  }

  /**
   * Coach button press. Returns { reRender: true } when the panel must
   * be refreshed (which is always — play-app re-renders unconditionally).
   */
  onCoachAction(actionId) {
    const lesson = this._lesson(this.activeId);
    switch (actionId) {
      case FC_ACTIONS.CONTINUE: {
        this.acked[this.activeId ?? 'welcome'] = true;
        this._record('coachmark-dismissed', { lesson: this.activeId });
        this._evaluate([]);
        break;
      }
      case FC_ACTIONS.WHY: {
        this._record('coach-used', { tool: 'why', lesson: this.activeId });
        this.coachSay = this._whyText(lesson);
        break;
      }
      case FC_ACTIONS.WHAT: {
        this._record('coach-used', { tool: 'what', lesson: this.activeId });
        this.coachSay = this._whatText();
        break;
      }
      case FC_ACTIONS.SHOW: {
        this._record('coach-used', { tool: 'show', lesson: this.activeId });
        this.coachSay = this._showText(lesson);
        break;
      }
      default:
        break;
    }
    return { reRender: true };
  }

  // ── coach answers ────────────────────────────────────────────

  _whyText(lesson) {
    if (this.lastRejection) {
      const text = this.lastRejection.message ?? this.lastRejection.reasonCode ?? 'the engine rejected it';
      this.lastRejection = null;
      return `That didn\u2019t work: ${esc(text)}`;
    }
    if (lesson?.why) return lesson.why;
    return 'You can only choose actions the engine says are legal right now — anything not offered simply isn\u2019t available this turn.';
  }

  _whatText() {
    const frame = this._frame;
    if (!frame?.isHuman || !frame.legalActions?.length) {
      return 'Nothing right now — it\u2019s the Rival\u2019s decision. Watch what they do.';
    }
    const verbs = [];
    for (const action of frame.legalActions) {
      const verb = FAMILY_VERBS[action.family] ?? action.shortLabel ?? action.family;
      if (!verbs.includes(verb)) verbs.push(verb);
      if (verbs.length >= 4) break;
    }
    const isWindow = frame.legalActions.some((a) => a.family === 'response-decline')
      && !frame.legalActions.some((a) => a.timingClass === 'ACTION');
    const lead = isWindow
      ? 'A response window is open. You can '
      : 'It\u2019s your turn — one action. You can ';
    return `${lead}${verbs.join(', ')}.`;
  }

  _showText(lesson) {
    const frame = this._frame;
    if (!frame?.isHuman || !frame.legalActions?.length) {
      return 'Nothing to show — wait for your decision.';
    }
    let pick = null;
    if (lesson?.expect) {
      pick = matchIntent(lesson.expect, frame.legalActions, { cards: {} });
    }
    if (!pick && this._rankSuggestions) {
      pick = this._rankSuggestions(frame.legalActions)[0] ?? null;
    }
    if (!pick) pick = frame.legalActions.find((a) => a.family === 'play-for-points') ?? frame.legalActions[0];
    const label = pick?.label ?? pick?.shortLabel ?? 'the highlighted option';
    return `Try \u201c${esc(label)}\u201d — it\u2019s legal right now. Cards you can use are already lit up.`;
  }

  // ── presentation ─────────────────────────────────────────────

  _statusLine() {
    const s = this._snapshot;
    if (!s) return '';
    const turn = s.match?.fullTurnSequence ?? s.fullTurnSequence ?? 0;
    const you = s.humanScore ?? s.humanStats?.securedPoints ?? 0;
    const them = s.opponentScore ?? s.opponentStats?.securedPoints ?? 0;
    return `Turn ${turn} · You ${you} — Rival ${them}`;
  }

  getPanelHtml() {
    const lesson = this._lesson(this.activeId)
      // No lesson currently gated-in: keep a quiet holding line rather
      // than an empty panel (e.g. waiting for the rival to build a
      // Point Row for the Scuttle lesson).
      ?? (this.completed ? null : { text: 'Take your turn — I\u2019ll flag anything worth knowing.', why: 'You can only choose actions the engine says are legal right now.' });
    const guidedLessons = this.lessons.filter((l) => l.guidance !== 'none' && !l.coachmark);
    const idx = lesson ? guidedLessons.indexOf(lesson) : -1;
    return renderFcPanel({
      lesson,
      step: Math.max(1, idx + 1),
      total: Math.max(1, guidedLessons.length),
      railsOff: this.guidance === 'none',
      coachSay: this.coachSay,
      statusLine: this._statusLine(),
    });
  }

  getCoachmarkHtml() {
    const lesson = this._lesson(this.activeId);
    if (!lesson?.coachmark || this.acked[lesson.id]) return '';
    return renderFcCoachmark(lesson);
  }

  // ── lifecycle ────────────────────────────────────────────────

  /** Match reached TERMINAL. Returns the recap for the end screen. */
  onMatchEnd(snapshot) {
    if (this.completed) return this._lastRecap ?? null;
    this.completed = true;
    const won = (snapshot?.state?.winner ?? snapshot?.match?.winner) === this.humanId;
    const lessonsDone = [...this.lessonState.values()].filter((v) => v === 'done').length;
    this._record('completed', {
      scenario: this.scenario.id,
      won,
      lessonsDone,
      lessonsTotal: this.lessons.length,
      ms: Date.now() - this.startedAt,
    });
    this._lastRecap = {
      won,
      lessonsDone,
      lessonsTotal: this.lessons.length,
      title: won ? 'Contact made — you won.' : 'Match over.',
      lines: won
        ? ['You played a real Intrilex match from the first click.', 'That was the whole tutorial — you\u2019re ready.']
        : ['The Rival took this one.', 'You still learned the loop — run it back or take a real match.'],
    };
    return this._lastRecap;
  }

  /** Player left the match early. */
  abandon() {
    if (this.completed) return;
    this.completed = true;
    this._record('abandoned', { scenario: this.scenario.id, lesson: this.activeId });
  }
}
