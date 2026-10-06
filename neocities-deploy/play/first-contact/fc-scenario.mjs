// ═══════════════════════════════════════════════════════════════
// fc-scenario.mjs — First Contact teaching scenario (data only)
//
// First Contact is the primary beginner onboarding experience: a real,
// controlled Intrilex match that teaches by letting the player play.
// This module is the declarative scenario the session executes:
//
//   - `predeterminedIdentities` fixes the deal order (positions 0–4 are
//     the player's hand, 5–10 the rival's hand, 11–53 the DP top→bottom).
//     Every position still holds a real physical card — only which card
//     sits where is chosen, which is how the fixture stays honest.
//   - `opponentScript` declares legal-only intents the AI prefers; the
//     session falls back to the baseline policy whenever nothing matches,
//     so the rival can never make an illegal or fabricated move.
//   - `lessons` are event/state predicates evaluated by the controller
//     against authoritative session output — never against UI state.
//
// Nothing in this file interprets rules. Lessons describe *what to say*
// and *which engine facts advance them*; legality, resolution, and
// scoring all remain the engine's job.
// ═══════════════════════════════════════════════════════════════

export const FIRST_CONTACT_PROFILE_ID = 'first-contact-trigger-closure';
export const FIRST_CONTACT_SCENARIO_ID = 'FIRST_CONTACT_01';
export const FIRST_CONTACT_SEED = 0x51FC;
export const FIRST_CONTACT_AI_POLICY = 'score-rush';

// ── The deal ──────────────────────────────────────────────────
// Player hand is authored so every early lesson has real material:
//   7♣ — the coached first score (7 of the 15 needed)
//   A♥ — the counter the response-window lesson teaches
//   K♥ — outranks the rival's scripted 10♦ for the Scuttle lesson
//   3♣, 6♦ — legal alternatives so the player always has agency
// Rival hand is authored for a gentle race and one guaranteed
// response-window trigger (5♣ private-choice effect declaration).
// DP tops give the player's early draws meaningful follow-ups.
export const FIRST_CONTACT_DEAL = Object.freeze([
  // 0–4 · player hand
  '7♣', 'A♥', 'K♥', '3♣', '6♦',
  // 5–10 · rival hand
  '10♦', 'Q♠', '4♥', '2♠', '3♥', '6♣',
  // 11–53 · DP, top → bottom
  '10♠', '2♣', '9♦', '4♣', 'Q♦', '5♦', '8♦', 'A♦', 'J♥', '3♦',
  '9♠', '5♥', '8♣', 'A♣', 'Q♥', '4♦', 'J♠', '6♥', '7♠', '2♦',
  'K♣', '5♠', 'J♣', '3♠', 'Q♣', '2♥', '10♥', '4♠', 'K♦', '6♠',
  '5♣', 'A♠', '8♥', '9♥', '7♦', 'J♦', '10♣', '8♠', '7♥', '9♣',
  'K♠', 'RJ', 'BJ',
]);

// ── Rival behaviour ───────────────────────────────────────────
// Evaluated at every AI decision in order; the first entry within its
// `uses` budget whose intent matches an engine-legal action is taken.
// Everything else falls through to the baseline policy. The rival
// always declines the player's declarations (first-match kindness),
// scores its 10♦ first (Scuttle bait), and anchors its Queen on its
// second turn — an anchor declaration is *counterable*, which opens a
// real response window for the player to learn the Stack on.
export const FIRST_CONTACT_OPPONENT_SCRIPT = Object.freeze([
  { id: 'rival-declines', uses: 999, intent: { family: 'response-decline' } },
  { id: 'rival-scores-ten', uses: 1, intent: { family: 'play-for-points', sourceIdentity: '10♦' } },
  { id: 'rival-opens-window', uses: 1, minFullTurn: 4, intent: { family: 'anchor-guard', sourceIdentity: 'Q♠' } },
  { id: 'rival-scores-again', uses: 1, minFullTurn: 6, intent: { family: 'play-for-points' } },
]);

// ── Lessons ───────────────────────────────────────────────────
// Each lesson: { id, text, why, complete(ctx), activates?(ctx),
// expires?(ctx), expect?, coachmark?, guidance?, reaction? }.
//
// `ctx` (all authoritative session output — the UI never feeds these):
//   events                cumulative engine events this match
//   batch                 events delivered since the last evaluation
//   snapshot              achievement snapshot { humanScore, opponentScore,
//                         stackDepth, fullTurnSequence, isTerminal, winner }
//   frame                 current decision frame { isHuman, legalActions }
//   humanId / opponentId  seat ids
//   priorResolved         every earlier lesson completed or expired
//   framesSinceActivation proactive (ACTION) human frames seen since
//                         this lesson activated
//   activationSeq         engine event sequence number when this lesson
//                         last activated
//   acked                 coachmark acknowledgements { welcome: true }
//
// `activates` defaults to `ctx.priorResolved` (sequential). A lesson
// with its own activation (the response window) may fire out of
// order; pending earlier lessons stay open and the controller returns
// to them. `expires` retires a lesson that lost its window (e.g. the
// rival has nothing left to Scuttle) so guidance can never stall.
//
// `expect` is an intent matched against current legal actions to power
// SHOW ME. It is a *recommendation*, never a restriction — the engine
// remains the only arbiter of what the player may do.
const declaredBy = (ctx, actorId, actionType) =>
  ctx.events.filter((e) => e.type === 'AUTONOMY_ACTION_DECLARED'
    && e.payload?.playerId === actorId
    && (actionType === undefined || e.payload?.actionType === actionType));

const humanDeclared = (ctx, actionType) => declaredBy(ctx, ctx.humanId, actionType).length > 0;

const humanResponseFrame = (ctx) =>
  ctx.frame?.isHuman === true
    && ctx.frame.legalActions?.some((a) => a.family === 'response-decline')
    && !ctx.frame.legalActions?.some((a) => a.timingClass === 'ACTION');

export const FIRST_CONTACT_LESSONS = Object.freeze([
  {
    id: 'welcome',
    // The only blocking beat: one line, one button, then the board.
    coachmark: true,
    title: 'First Contact',
    text: 'A real match against the Rival — same engine, real cards. First to <strong>15 secured Points</strong> wins. I\u2019ll explain everything when it matters.',
    why: 'This is the actual Intrilex rules engine running a match. Nothing is simulated or simplified behind the scenes — the Rival can only make moves the engine says are legal, and so can you.',
    button: 'Let\u2019s play',
    complete: (ctx) => ctx.acked?.welcome === true,
  },
  {
    id: 'first-score',
    text: 'Your goal is <strong>secured Points</strong>. Play a card for Points — the <strong>7♣</strong> is a good start.',
    why: 'Playing a card for Points moves it to your Point Row. Its rank is its value — the 7♣ is worth 7 of the 15 you need. The race is real: the Rival is building their own row too.',
    expect: { family: 'play-for-points' },
    complete: (ctx) => humanDeclared(ctx, 'play-for-points'),
    reaction: 'Secured. The score track at the top shows the race to 15.',
  },
  {
    id: 'turn-flow',
    text: 'Turns alternate — <strong>one action each</strong>. On your turn you can play for Points, <strong>Draw</strong> to refill your hand, or use a card effect.',
    why: 'Every action you were just offered was legal because it was your turn. When it isn\u2019t, those options simply don\u2019t appear — you can only ever pick from what the engine allows.',
    // Any second proactive declaration — the player demonstrates the
    // loop by using it, not by reading about it.
    complete: (ctx) => declaredBy(ctx, ctx.humanId)
      .filter((e) => e.payload?.stackClass !== 'response').length >= 2,
    reaction: 'That\u2019s the whole turn loop — act, they respond or pass, they act, repeat.',
  },
  {
    id: 'scuttle',
    text: 'Their Point Row is real damage in the race. <strong>Scuttle</strong> a card from it — a higher-ranked card beats theirs.',
    why: 'Scuttling sends one of their Point-Row cards to the Graveyard, but only if your card outranks it. Your K♥ beats their 10♦ — 13 beats 10. Their score drops by whatever that card was worth.',
    activates: (ctx) => ctx.priorResolved && (ctx.snapshot?.opponentScore ?? 0) > 0,
    expires: (ctx) => (ctx.snapshot?.opponentScore ?? 0) === 0 && ctx.framesSinceActivation >= 3,
    expect: { family: 'scuttle' },
    complete: (ctx) => humanDeclared(ctx, 'scuttle'),
    reaction: 'Gone to the Graveyard. Their race just got slower — that\u2019s the interaction half of this game.',
  },
  {
    id: 'response-window',
    // Self-activating: whenever the engine gives the player a response
    // window this lesson takes over — the Stack teaches itself. It
    // does not require prior lessons to be resolved.
    text: 'They declared something — now you can <strong>respond</strong>. Counter it with an Ace, disrupt it with a Jack, or <strong>Decline</strong> to let it resolve.',
    why: 'Declarations don\u2019t resolve instantly. They go on the Stack and open a window for the other player — that\u2019s what you\u2019re seeing. Declining is a real choice, not a failure: it lets the effect happen and keeps your cards.',
    activates: (ctx) => humanResponseFrame(ctx),
    triggered: true, // takes the panel out of order whenever a window opens
    expect: { family: 'counter' },
    // Window responses are their own event families — a counter declares
    // as AUTONOMY_*_COUNTER_DECLARED, a decline as AUTONOMY_RESPONSE_DECLINED.
    complete: (ctx) => ctx.batch.some((e) => (e.sequence ?? 0) > (ctx.activationSeq ?? 0)
      && ((e.type === 'AUTONOMY_ACTION_DECLARED' && e.payload?.playerId === ctx.humanId)
        || e.type === 'AUTONOMY_ACE_COUNTER_DECLARED'
        || e.type === 'AUTONOMY_KING_COUNTER_DECLARED'
        || e.type === 'AUTONOMY_RESPONSE_DECLINED')),
    // If the window closed unused (engine advanced it), retire the
    // lesson — another window will come.
    expires: (ctx) => (!humanResponseFrame(ctx) && ctx.framesSinceActivation >= 1)
      || ctx.batch.some((e) => e.type === 'AUTONOMY_RESPONSE_WINDOW_CLOSED'
        && (e.sequence ?? 0) > (ctx.activationSeq ?? 0)),
    reaction: 'That window is the Stack: declare → they may respond → resolve. You\u2019ll see it from both sides.',
  },
  {
    id: 'free-play',
    text: 'Your call now. Everything offered is legal — score, draw, use an effect, or take a card off their row. <strong>What do you want to do?</strong>',
    why: 'You\u2019ve seen the loop, the zones that matter, and the Stack. From here the coach stops prescribing answers — use Why? and What can I do? whenever you want the reasoning.',
    complete: (ctx) => ctx.events.some((e) => e.type === 'AUTONOMY_ACTION_DECLARED'
      && e.payload?.playerId === ctx.humanId
      && (e.sequence ?? 0) > (ctx.activationSeq ?? 0)),
    reaction: 'No more instructions coming.',
  },
  {
    id: 'rails-off',
    text: 'You know enough. <strong>Beat me.</strong> First to 15 — I\u2019m right here if you need me.',
    why: 'This is just a match now. The coach buttons stay — Why? explains what\u2019s legal and why, What can I do? lists your real options, Show me points at a good move. Nothing else changes.',
    guidance: 'none',
    complete: () => false, // runs until the match ends
  },
]);

export const FIRST_CONTACT_SCENARIO = Object.freeze({
  id: FIRST_CONTACT_SCENARIO_ID,
  version: 1,
  title: 'First Contact',
  profileId: FIRST_CONTACT_PROFILE_ID,
  seed: FIRST_CONTACT_SEED,
  humanPlayerId: 'P1',
  aiPolicyId: FIRST_CONTACT_AI_POLICY,
  predeterminedIdentities: FIRST_CONTACT_DEAL,
  opponentScript: FIRST_CONTACT_OPPONENT_SCRIPT,
  lessons: FIRST_CONTACT_LESSONS,
  goalPoints: 15,
  estimatedMinutes: 8,
});

/**
 * Structural validation for the fixture — run in tests and on scenario
 * load so a malformed fixture fails loudly, not mid-match.
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateFirstContactScenario(scenario = FIRST_CONTACT_SCENARIO) {
  const errors = [];
  const deal = scenario.predeterminedIdentities;
  if (!Array.isArray(deal) || deal.length !== 54) errors.push('deal must contain exactly 54 identities');
  else if (new Set(deal).size !== 54) errors.push('deal contains duplicate identities');
  else {
    const legal = new Set();
    for (const suit of ['♣', '♦', '♥', '♠']) {
      for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']) legal.add(`${rank}${suit}`);
    }
    legal.add('RJ'); legal.add('BJ');
    for (const id of deal) if (!legal.has(id)) errors.push(`unknown identity ${id}`);
  }
  if (!Array.isArray(scenario.opponentScript) || !scenario.opponentScript.length) errors.push('opponentScript required');
  for (const entry of scenario.opponentScript ?? []) {
    if (!entry.intent?.family) errors.push(`script entry ${entry.id ?? '?'} missing intent.family`);
    if (entry.uses !== undefined && (!Number.isInteger(entry.uses) || entry.uses < 1)) errors.push(`script entry ${entry.id ?? '?'} uses must be a positive integer`);
  }
  if (!Array.isArray(scenario.lessons) || scenario.lessons.length < 2) errors.push('lessons required');
  for (const lesson of scenario.lessons ?? []) {
    if (!lesson.id || typeof lesson.complete !== 'function') errors.push(`lesson ${lesson.id ?? '?'} needs id + complete(ctx)`);
  }
  return { valid: errors.length === 0, errors };
}
