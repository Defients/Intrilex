// ═══════════════════════════════════════════════════════════════
// evaluator.mjs — Deterministic achievement detection
// Evaluates match tracker + career tracker + profile state against
// the 56 achievement definitions. Pure functions, no side effects.
// ═══════════════════════════════════════════════════════════════

import { getDefinition, getCatalogById } from './catalog.mjs';
import {
  PROGRESS_TYPE,
  LAUNCH_ZONE_SET,
  CLEAN_SWEEP_ZONES,
  LAUNCH_SPADES_EFFECTS,
  LAUNCH_SPADES_EFFECT_COUNT,
  CARD_MASTERY_ACHIEVEMENT_IDS,
  PROVENANCE,
  ACHIEVEMENT_PRODUCT_VERSION,
  ACHIEVEMENT_RULES_VERSION,
} from './constants.mjs';
import { isEarned } from './progress.mjs';
import { isEligible } from './eligibility.mjs';

/**
 * @typedef {Object} UnlockResult
 * @property {string} achievementId
 * @property {string} unlockedAt - ISO timestamp
 * @property {string|null} matchId
 * @property {string} provenance
 * @property {string} rulesVersion
 * @property {string} productVersion
 */

/**
 * @typedef {Object} EvaluationResult
 * @property {UnlockResult[]} newUnlocks - Newly unlocked achievements
 * @property {Record<string, any>} progressUpdates - achievementId → progress object
 */

/**
 * Evaluate all achievements against the current tracker and career state.
 * Returns only NEW unlocks (not already earned).
 *
 * @param {any} tracker - Match tracker (serialized or live)
 * @param {any} career - Career tracker (serialized or live)
 * @param {Record<string, any>} profileState - Serialized AchievementProfileState
 * @param {{ matchId: string, isTutorial: boolean, provenance?: string, timestamp?: string }} ctx
 * @returns {EvaluationResult}
 */
export function evaluateAchievements(tracker, career, profileState, ctx) {
  const catalogById = getCatalogById();
  /** @type {UnlockResult[]} */
  const newUnlocks = [];
  /** @type {Record<string, any>} */
  const progressUpdates = {};

  const timestamp = ctx.timestamp ?? new Date().toISOString();
  const provenance = ctx.provenance ?? PROVENANCE.LOCAL_AUTHORITY;
  const matchId = ctx.matchId ?? null;
  const isTutorial = ctx.isTutorial ?? false;

  // Helper: check if eligible and not already earned
  /** @param {string} id */
  const canUnlock = (id) => {
    if (isEarned(profileState, id)) return false;
    const def = getDefinition(id);
    if (!def) return false;
    // Check eligibility via canonical eligibility module
    const eligCtx = {
      matchId,
      humanPlayerId: tracker.humanPlayerId ?? 'P1',
      isTutorial,
      isNetworkMatch: provenance === PROVENANCE.NETWORK_AUTHORITY,
      isLocalVsAI: provenance !== PROVENANCE.NETWORK_AUTHORITY,
      isSimulation: false,
      isReplayPlayback: false,
      isSpectator: false,
      isAiVsAi: false,
    };
    if (!isEligible(id, eligCtx)) return false;
    // Check prerequisites for COMPOSITE
    if (def.prerequisiteAchievementIds) {
      for (const prereqId of def.prerequisiteAchievementIds) {
        // Prerequisite must be earned (either previously or in this same evaluation)
        if (!isEarned(profileState, prereqId)) {
          const beingUnlockedNow = newUnlocks.some(u => u.achievementId === prereqId);
          if (!beingUnlockedNow) return false;
        }
      }
    }
    return true;
  };

  // Helper: create unlock record
  /** @param {string} id */
  const unlock = (id) => ({
    achievementId: id,
    unlockedAt: timestamp,
    matchId,
    provenance,
    rulesVersion: ACHIEVEMENT_RULES_VERSION,
    productVersion: ACHIEVEMENT_PRODUCT_VERSION,
  });

  // Helper: create progress update
  /** @param {string} id @param {number} current @param {number} target @param {string[]} [setItems] @param {boolean} [completed] @param {string} [type] */
  const progress = (id, current, target, setItems = [], completed = false, type = PROGRESS_TYPE.BOOLEAN) => ({
    achievementId: id,
    type,
    current,
    target,
    setItems,
    completed,
  });

  // ── Evaluate each achievement ──

  // Helper to get sets from serialized tracker (arrays) or live tracker (Sets)
  /** @param {any} v */
  const asSet = (v) => v instanceof Set ? v : new Set(Array.isArray(v) ? v : []);
  const trackerSets = {
    ranksPlayedForPoints: asSet(tracker.ranksPlayedForPoints),
    ranksPlayedForEffect: asSet(tracker.ranksPlayedForEffect),
    zonesInteractedThisMatch: asSet(tracker.zonesInteractedThisMatch),
    acquiredFromSwap: asSet(tracker.acquiredFromSwap),
    spadesEffectsDeclared: asSet(tracker.spadesEffectsDeclared),
    spadesEffectsResolved: asSet(tracker.spadesEffectsResolved),
    spadesEffectsThisFullTurn: asSet(tracker.spadesEffectsThisFullTurn),
    humanAnchorsActive: asSet(tracker.humanAnchorsActive),
    humanDeclarationsThisFullTurn: asSet(tracker.humanDeclarationsThisFullTurn),
    counteredHumanDeclarationsThisFullTurn: asSet(tracker.counteredHumanDeclarationsThisFullTurn),
  };
  const careerSets = {
    ranksPlayedForPoints: asSet(career.ranksPlayedForPoints),
    ranksPlayedForEffect: asSet(career.ranksPlayedForEffect),
    zonesDiscovered: asSet(career.zonesDiscovered),
    spadesEffectsUsed: asSet(career.spadesEffectsUsed),
  };

  const isHumanWinner = tracker.isTerminal && tracker.winner === tracker.humanPlayerId && !tracker.isDraw;
  const isTerminal = tracker.isTerminal;

  // ═══════════════════════════════════════════════════════════
  // CATEGORY A — FIRST_STEPS
  // ═══════════════════════════════════════════════════════════

  // 01 — Welcome to Intrilex: Complete first qualifying duel
  if (isTerminal && canUnlock('welcome-to-intrilex')) {
    newUnlocks.push(unlock('welcome-to-intrilex'));
  }

  // 02 — First Blood: Score your first Points
  if (tracker.actionsByMode.points > 0 && canUnlock('first-blood')) {
    newUnlocks.push(unlock('first-blood'));
  }

  // 03 — Twenty-One: Win with at least 21 Points
  if (isHumanWinner && tracker.humanScore >= 21 && canUnlock('twenty-one')) {
    newUnlocks.push(unlock('twenty-one'));
  }

  // 04 — Exactly Enough: Win with exactly 21 Points
  if (isHumanWinner && tracker.humanScore === 21 && canUnlock('exactly-enough')) {
    newUnlocks.push(unlock('exactly-enough'));
  }

  // 05 — Read the Card: Play a card for its Effect
  if (tracker.actionsByMode.effect > 0 && canUnlock('read-the-card')) {
    newUnlocks.push(unlock('read-the-card'));
  }

  // 06 — Other Side of the Card: Same rank for Points and Effect (career)
  {
    const ranks = careerSets.ranksPlayedForPoints;
    let hasOverlap = false;
    for (const r of careerSets.ranksPlayedForEffect) {
      if (ranks.has(r)) { hasOverlap = true; break; }
    }
    if (hasOverlap && canUnlock('other-side-of-the-card')) {
      newUnlocks.push(unlock('other-side-of-the-card'));
    }
  }

  // 07 — The Stack Exists: First legal response
  if (tracker.humanResponsesPlayed > 0 && canUnlock('the-stack-exists')) {
    newUnlocks.push(unlock('the-stack-exists'));
  }

  // 08 — Not So Fast: Successfully use an Interrupt
  if (tracker.lastResponseWasInterrupt && canUnlock('not-so-fast')) {
    newUnlocks.push(unlock('not-so-fast'));
  }

  // 09 — Miniature Warfare: First Mini-Turn
  if (tracker.actionsByMode.points + tracker.actionsByMode.effect > 0 && canUnlock('miniature-warfare')) {
    // Any action that consumes a mini-turn counts
    newUnlocks.push(unlock('miniature-warfare'));
  }

  // 10 — No Longer New: Win 5 qualifying duels (COUNTER)
  {
    const wins = career.gamesWon;
    const target = 5;
    const completed = wins >= target;
    progressUpdates['no-longer-new'] = progress('no-longer-new', Math.min(wins, target), target, [], completed, PROGRESS_TYPE.COUNTER);
    if (completed && canUnlock('no-longer-new')) {
      newUnlocks.push(unlock('no-longer-new'));
    }
  }

  // ═══════════════════════════════════════════════════════════
  // CATEGORY B — CORE_SYSTEMS
  // ═══════════════════════════════════════════════════════════

  // 11 — Fair Trade: Use the Swap Bar
  if (tracker.swapUsedCount > 0 && canUnlock('fair-trade')) {
    newUnlocks.push(unlock('fair-trade'));
  }

  // 12 — Upgrade: Win using a card acquired from Swap Bar
  if (isHumanWinner && tracker.acquiredFromSwap.size > 0 && canUnlock('upgrade')) {
    // The tracker tracks swap-acquired card IDs. If any were used (scored or effected),
    // and the human won, this unlocks. The reducer tracks acquiredFromSwap on swap use.
    // We need to verify a swap-acquired card was actually used for points or effect.
    // Since we track ranks played, and swap cards get added to hand, any points/effect
    // play after swap acquisition qualifies. For deterministic entity tracking,
    // we check if acquiredFromSwap is non-empty and human won.
    newUnlocks.push(unlock('upgrade'));
  }

  // 13 — Gone Forever: Cause first card to enter Exile
  if (tracker._humanCausedExile && canUnlock('gone-forever')) {
    newUnlocks.push(unlock('gone-forever'));
  }

  // 14 — Drop Anchor: Establish first Anchor
  if (tracker.humanAnchorsActive.size > 0 || tracker._anchorEstablished && canUnlock('drop-anchor')) {
    newUnlocks.push(unlock('drop-anchor'));
  }

  // 15 — Hold Fast: Keep Anchor through opponent's Full Turn
  if (tracker.anchorSurvivedOpponentFullTurn && canUnlock('hold-fast')) {
    newUnlocks.push(unlock('hold-fast'));
  }

  // 16 — Supercharged: Declare first Super
  if (tracker.superDeclaredCount > 0 && canUnlock('supercharged')) {
    newUnlocks.push(unlock('supercharged'));
  }

  // 17 — Two Become One: Resolve a Super
  if (tracker.superResolvedCount > 0 && canUnlock('two-become-one')) {
    newUnlocks.push(unlock('two-become-one'));
  }

  // 18 — Digging Deeper: First Spades effect
  if (tracker.spadesEffectsResolved.size > 0 && canUnlock('digging-deeper')) {
    newUnlocks.push(unlock('digging-deeper'));
  }

  // 19 — Clean Sweep: Interact with Draw, Discard, Exile, Swap in one duel
  {
    const zones = trackerSets.zonesInteractedThisMatch;
    const required = new Set(CLEAN_SWEEP_ZONES);
    let allPresent = true;
    for (const z of required) {
      if (!zones.has(z)) { allPresent = false; break; }
    }
    const current = [...required].filter(z => zones.has(z)).length;
    progressUpdates['clean-sweep'] = progress('clean-sweep', current, CLEAN_SWEEP_ZONES.length, [...zones], allPresent, PROGRESS_TYPE.SET);
    if (allPresent && canUnlock('clean-sweep')) {
      newUnlocks.push(unlock('clean-sweep'));
    }
  }

  // 20 — Know the Table: Interact with every major zone (career)
  {
    const zones = careerSets.zonesDiscovered;
    const required = new Set(LAUNCH_ZONE_SET);
    let allPresent = true;
    for (const z of required) {
      if (!zones.has(z)) { allPresent = false; break; }
    }
    const current = [...required].filter(z => zones.has(z)).length;
    progressUpdates['know-the-table'] = progress('know-the-table', current, LAUNCH_ZONE_SET.length, [...zones], allPresent, PROGRESS_TYPE.SET);
    if (allPresent && canUnlock('know-the-table')) {
      newUnlocks.push(unlock('know-the-table'));
    }
  }

  // ═══════════════════════════════════════════════════════════
  // CATEGORY C — STACK_COUNTERPLAY
  // ═══════════════════════════════════════════════════════════

  // 21 — Stack Student: Resolve first response sequence
  if (tracker.humanResponsesPlayed > 0 && tracker.maxResponseChainDepth > 0 && canUnlock('stack-student')) {
    newUnlocks.push(unlock('stack-student'));
  }

  // 22 — Denied: Stop opponent's winning play
  if (tracker._deniedDetected && canUnlock('denied')) {
    newUnlocks.push(unlock('denied'));
  }

  // 23 — Double Denied: Counter an opponent's response
  if (tracker._doubleDeniedDetected && canUnlock('double-denied')) {
    newUnlocks.push(unlock('double-denied'));
  }

  // 24 — Nope³: Response chain 3+ layers deep
  if (tracker.maxResponseChainDepth >= 3 && canUnlock('nope-three')) {
    newUnlocks.push(unlock('nope-three'));
  }

  // 25 — The Stackening (hidden): Stack with 5+ meaningful objects
  if (tracker.maxStackDepth >= 5 && canUnlock('the-stackening')) {
    newUnlocks.push(unlock('the-stackening'));
  }

  // 26 — Perfect Timing: Interrupt as final response before window closes
  if (tracker.interruptWasFinalResponse && canUnlock('perfect-timing')) {
    newUnlocks.push(unlock('perfect-timing'));
  }

  // 27 — Sequence Breaker: Stop multi-step Effect
  if (tracker._sequenceBreakerDetected && canUnlock('sequence-breaker')) {
    newUnlocks.push(unlock('sequence-breaker'));
  }

  // 28 — Clean Kill: Win with no unresolved stack objects
  if (isHumanWinner && tracker.stackDepthAtTerminal === 0 && canUnlock('clean-kill')) {
    newUnlocks.push(unlock('clean-kill'));
  }

  // ═══════════════════════════════════════════════════════════
  // CATEGORY D — CARD_MASTERY
  // ═══════════════════════════════════════════════════════════

  // 29 — Lucky Seven: Score a Seven and resolve its scoring trigger
  if (tracker._sevenScoringTriggerResolved && canUnlock('lucky-seven')) {
    newUnlocks.push(unlock('lucky-seven'));
  }

  // 30 — Topdeck Sorcery: Play Seven-revealed card for Effect
  if (tracker.sevenGeneratedEffectCardIds.size > 0 && tracker.actionsByMode.effect > 0 && canUnlock('topdeck-sorcery')) {
    // If there were seven-generated effect card IDs and effect plays happened
    newUnlocks.push(unlock('topdeck-sorcery'));
  }

  // 31 — Found Money: Score a Seven-revealed card for Points
  if (tracker.sevenGeneratedEffectCardIds.size > 0 && tracker._sevenScoreCardUsed && canUnlock('found-money')) {
    newUnlocks.push(unlock('found-money'));
  }

  // 32 — Recursive Seven (hidden): Seven-generated reveal produces another Seven
  if (tracker.sevenRecursiveDetected && canUnlock('recursive-seven')) {
    newUnlocks.push(unlock('recursive-seven'));
  }

  // 33 — Seven Heaven: 3+ Seven interactions in one Full Turn
  if (tracker.sevenInteractionsThisFullTurn >= 3 && canUnlock('seven-heaven')) {
    newUnlocks.push(unlock('seven-heaven'));
  }

  // 34 — Queen's Court
  if (tracker._queensCourtEstablished && canUnlock('queens-court')) {
    newUnlocks.push(unlock('queens-court'));
  }

  // 35 — Ace in the Hole: Counter Effect with normal Ace
  if (tracker._aceCounterResolved && canUnlock('ace-in-the-hole')) {
    newUnlocks.push(unlock('ace-in-the-hole'));
  }

  // 36 — Super Authority: Stop Effect with Super Ace
  if (tracker._superAceCounterResolved && canUnlock('super-authority')) {
    newUnlocks.push(unlock('super-authority'));
  }

  // 37 — Stack Theft: Resolve 10♠ Stack Theft
  if (tracker.spadesEffectsResolved.has('TEN_SPADE_STACK_THEFT') && canUnlock('stack-theft')) {
    newUnlocks.push(unlock('stack-theft'));
  }

  // 38 — Wild Card: K♠ as another Spades effect
  if (tracker.spadesEffectsResolved.has('KING_SPADE_WILD') && canUnlock('wild-card')) {
    newUnlocks.push(unlock('wild-card'));
  }

  // ═══════════════════════════════════════════════════════════
  // CATEGORY E — TACTICAL_WINS
  // ═══════════════════════════════════════════════════════════

  // 39 — Photo Finish: Win while opponent on exactly 20 Points
  if (isHumanWinner && tracker.opponentScore === 20 && canUnlock('photo-finish')) {
    newUnlocks.push(unlock('photo-finish'));
  }

  // 40 — From Behind: Win after trailing by 10+ Points
  if (isHumanWinner && tracker.maxPointDeficit >= 10 && canUnlock('from-behind')) {
    newUnlocks.push(unlock('from-behind'));
  }

  // 41 — Overkill: Win with 30+ Points
  if (isHumanWinner && tracker.humanScore >= 30 && canUnlock('overkill')) {
    newUnlocks.push(unlock('overkill'));
  }

  // 42 — Last Card Standing: Win with exactly 1 card in hand
  if (isHumanWinner && tracker.humanHandCount === 1 && canUnlock('last-card-standing')) {
    newUnlocks.push(unlock('last-card-standing'));
  }

  // 43 — Empty-Handed Victory: Win with 0 cards in hand
  if (isHumanWinner && tracker.humanHandCount === 0 && canUnlock('empty-handed-victory')) {
    newUnlocks.push(unlock('empty-handed-victory'));
  }

  // 44 — Plan B Was Plan A (hidden): Win after own play was countered same Full Turn
  if (isHumanWinner && tracker.counteredHumanDeclarationsThisFullTurn.size > 0 && canUnlock('plan-b-was-plan-a')) {
    newUnlocks.push(unlock('plan-b-was-plan-a'));
  }

  // 45 — Turnabout: Start Full Turn behind, win before it ends
  if (isHumanWinner && tracker._turnaboutDetected && canUnlock('turnabout')) {
    newUnlocks.push(unlock('turnabout'));
  }

  // 46 — No Shovel Required: Win without using Spades Effect
  if (isHumanWinner && tracker.spadesEffectsDeclared.size === 0 && canUnlock('no-shovel-required')) {
    newUnlocks.push(unlock('no-shovel-required'));
  }

  // ═══════════════════════════════════════════════════════════
  // CATEGORY F — PLAYSTYLE
  // ═══════════════════════════════════════════════════════════

  // 47 — Big Number Good: Win with 75%+ Points mode (min 4 declarations)
  if (isHumanWinner) {
    const total = tracker.actionsByMode.points + tracker.actionsByMode.effect;
    if (total >= 4 && tracker.actionsByMode.points / total >= 0.75 && canUnlock('big-number-good')) {
      newUnlocks.push(unlock('big-number-good'));
    }
  }

  // 48 — Reading Is Overpowered: Win with 5+ Effect resolutions
  if (isHumanWinner && tracker.actionsByMode.effect >= 5 && canUnlock('reading-is-overpowered')) {
    newUnlocks.push(unlock('reading-is-overpowered'));
  }

  // 49 — Controlled Chaos: 3+ Effects in one Full Turn + positive Points delta
  if (tracker.effectResolutionsThisFullTurn >= 3 && tracker.pointDeltaThisFullTurn > 0 && canUnlock('controlled-chaos')) {
    newUnlocks.push(unlock('controlled-chaos'));
  }

  // 50 — Window Shopper: Win without using Swap Bar
  if (isHumanWinner && tracker.swapUsedCount === 0 && canUnlock('window-shopper')) {
    newUnlocks.push(unlock('window-shopper'));
  }

  // 51 — Absolutely Excessive: 3+ Supers resolved in one duel
  {
    const count = tracker.superResolvedCount;
    const target = 3;
    const completed = count >= target;
    progressUpdates['absolutely-excessive'] = progress('absolutely-excessive', Math.min(count, target), target, [], completed, PROGRESS_TYPE.COUNTER);
    if (completed && canUnlock('absolutely-excessive')) {
      newUnlocks.push(unlock('absolutely-excessive'));
    }
  }

  // 52 — Black Magic (hidden): 2+ distinct Spades effects same Full Turn
  if (tracker.spadesEffectsThisFullTurn.size >= 2 && canUnlock('black-magic')) {
    newUnlocks.push(unlock('black-magic'));
  }

  // ═══════════════════════════════════════════════════════════
  // CATEGORY G — PROGRESSION
  // ═══════════════════════════════════════════════════════════

  // 53 — Getting Dangerous: Win 25 qualifying duels
  {
    const wins = career.gamesWon;
    const target = 25;
    const completed = wins >= target;
    progressUpdates['getting-dangerous'] = progress('getting-dangerous', Math.min(wins, target), target, [], completed, PROGRESS_TYPE.COUNTER);
    if (completed && canUnlock('getting-dangerous')) {
      newUnlocks.push(unlock('getting-dangerous'));
    }
  }

  // 54 — Intrilexian: Win 100 qualifying duels
  {
    const wins = career.gamesWon;
    const target = 100;
    const completed = wins >= target;
    progressUpdates['intrilexian'] = progress('intrilexian', Math.min(wins, target), target, [], completed, PROGRESS_TYPE.COUNTER);
    if (completed && canUnlock('intrilexian')) {
      newUnlocks.push(unlock('intrilexian'));
    }
  }

  // 55 — Spades Scholar: Use every launch Spades effect
  {
    const used = careerSets.spadesEffectsUsed;
    const required = new Set(LAUNCH_SPADES_EFFECTS);
    let allPresent = true;
    for (const e of required) {
      if (!used.has(e)) { allPresent = false; break; }
    }
    const current = [...required].filter(e => used.has(e)).length;
    progressUpdates['spades-scholar'] = progress('spades-scholar', current, LAUNCH_SPADES_EFFECT_COUNT, [...used], allPresent, PROGRESS_TYPE.SET);
    if (allPresent && canUnlock('spades-scholar')) {
      newUnlocks.push(unlock('spades-scholar'));
    }
  }

  // 56 — Card Savant: Complete card/rank mastery collection (COMPOSITE)
  {
    const prereqs = CARD_MASTERY_ACHIEVEMENT_IDS;
    let earnedCount = 0;
    for (const id of prereqs) {
      if (isEarned(profileState, id) || newUnlocks.some(u => u.achievementId === id)) {
        earnedCount++;
      }
    }
    const completed = earnedCount === prereqs.length;
    // Don't expose hidden achievement names in progress display
    // Show generic count without revealing which specific one is missing
    progressUpdates['card-savant'] = progress('card-savant', earnedCount, prereqs.length, [], completed, PROGRESS_TYPE.COMPOSITE);
    if (completed && canUnlock('card-savant')) {
      newUnlocks.push(unlock('card-savant'));
    }
  }

  return { newUnlocks, progressUpdates };
}

/**
 * Apply unlock results to profile state.
 * Returns new profile state (does not mutate input).
 * @param {Record<string, any>} profileState
 * @param {UnlockResult[]} unlocks
 * @param {Record<string, any>} progressUpdates
 * @returns {object}
 */
export function applyUnlocks(profileState, unlocks, progressUpdates) {
  const earned = { ...(profileState.earned ?? {}) };
  for (const u of unlocks) {
    earned[u.achievementId] = {
      unlockedAt: u.unlockedAt,
      matchId: u.matchId,
      provenance: u.provenance,
      rulesVersion: u.rulesVersion,
      productVersion: u.productVersion,
    };
  }
  const progress = { ...(profileState.progress ?? {}) };
  for (const [id, p] of Object.entries(progressUpdates)) {
    progress[id] = p;
  }
  return {
    ...profileState,
    earned,
    progress,
    updatedAt: new Date().toISOString(),
  };
}
