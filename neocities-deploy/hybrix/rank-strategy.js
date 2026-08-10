/**
 * HYBIX AI — Rank-Aware Strategic Valuation
 *
 * Extends the family-level action scoring with rank-specific strategic
 * features so the AI can distinguish:
 *
 *  - scoring a card for Points vs using it for an Effect
 *  - placing it as an Anchor or Attachment
 *  - committing it to a Super, Combo, Ultra, Royal Marriage, Queen's Court,
 *    Mimic, Wild, or other advanced play
 *  - using it as a counter / Interrupt / Quick / generated play
 *  - preserving it in hand for a more valuable future opportunity
 *
 * "Hold" is not a legal engine action. Conservation is modelled by applying
 * an opportunity-cost penalty when a proposed action consumes a strategically
 * valuable card that has higher expected value in a future window.
 *
 * This module evaluates ONLY engine-authorized legal actions. It does not
 * decide legality independently and does not inspect hidden information.
 */

// ── Identity parsing (no engine import — keeps the module self-contained) ──
const IDENTITY_RE = /^(A|2|3|4|5|6|7|8|9|10|J|Q|K|RJ|BJ)(♣|♦|♥|♠)?$/;
function parseRank(identity) {
  if (!identity) return null;
  const m = IDENTITY_RE.exec(String(identity));
  if (!m) return null;
  return { rank: m[1], suit: m[2] ?? null };
}

// ── Premium counter identities (preserve for high-tier threats) ──
const PREMIUM_COUNTER_RANKS = new Set(['A']);       // Ace-family counters
const SPADE_PREMIUM = new Set(['A♠', 'K♠', 'Q♠']);  // spade-enhanced premium cards

// ── Mode → strategic classification ──
// Maps engine mode strings to strategic categories for valuation.
const MODE_CATEGORY = {
  // Ace
  'base-counter': 'counter-effect',
  'purge': 'counter-effect',
  'anchor-counter': 'counter-anchor',
  'spade-exile-counter': 'counter-premium',
  'super-counter': 'counter-premium',
  // 2
  'quick-score-discard': 'score-quick',
  'wild-catalyst': 'recipe-component',
  'solo-wild-copy': 'effect-copy',
  'commandeer': 'counter-premium',
  // 3
  'hand-raid': 'disrupt-hand',
  'instant-bounce': 'disrupt-board',
  'spade-enhancement': 'disrupt-hand',
  'super-raid': 'advanced-super',
  // 4
  'row-clear': 'board-clear',
  'natural': 'board-clear',
  'total-clear': 'board-clear-premium',
  'row-exchange': 'board-swing',
  // 5
  'recycle': 'recovery',
  'suit-rummage': 'recovery',
  'super-recycle': 'advanced-super',
  // 6
  'dig': 'draw-filter',
  'swap-bar-peek': 'information',
  'deep-draw': 'draw-premium',
  'super-dig': 'advanced-super',
  // 7
  'topdeck-cast': 'draw-cast',
  'scoring-trigger': 'trigger',
  'spade-topdeck': 'draw-cast',
  'sequential-topdeck': 'advanced-super',
  // 8
  'aegis-field': 'defense-aegis',
  'scuttle-counter': 'counter-scuttle',
  'free-scuttle': 'disrupt-board',
  'absolute-scuttle': 'disrupt-premium',
  // 9
  'tap': 'control-tap',
  'goal-shift': 'goal-mod',
  'spade-goal-shift': 'goal-mod',
  'anchor': 'anchor-play',
  // 10
  'club-foundation': 'rank10-score',
  'diamond-mimic': 'rank10-mimic',
  'heart-tempo': 'rank10-tempo',
  'spade-stack-theft': 'rank10-theft',
  'spade-exile-recovery': 'rank10-recovery',
  // J
  'disrupt': 'disrupt-action',
  'pr-attachment': 'attachment',
  'er-attachment': 'attachment',
  'tempo-force': 'advanced-super',
  // Q
  'pr-score': 'score',
  'guard-anchor': 'anchor-guard',
  'quick-aegis': 'defense-aegis',
  'spade-protection': 'defense-premium',
  'queens-court': 'advanced-combo',
  // K
  'anchor-goal-counter': 'counter-anchor',
  'spade-multi-counter': 'counter-premium',
  'wild-sovereignty': 'effect-wild',
  'royal-marriage': 'advanced-combo',
  // RJ
  'hand-swap': 'disrupt-hand',
  'self-reset': 'hand-reset',
  'opponent-attack': 'disrupt-hand',
  'shuffle-reset': 'hand-reset',
  // BJ
  'board-lock-quick': 'defense-lock',
  'exile-recycle': 'recovery',
  // score
  'score': 'score',
  'ordinary': 'score'
};

/**
 * Evaluate rank-aware strategic features for a single legal action.
 *
 * @param {object} action - Legal action from the engine adapter
 * @param {object} context - Decision context with authorizedView
 * @param {object} cognition - Board state assessment
 * @returns {{ adjustment: number, reasonCodes: string[] }}
 */
export function evaluateRankStrategy(action, context, cognition) {
  const knownCards = context?.authorizedView?.knownCards ?? {};
  const own = context?.authorizedView?.own ?? {};
  const opponents = context?.authorizedView?.opponents ?? [];
  const sourceIdentities = (action.sourceHandles ?? [])
    .map(h => knownCards[h]?.identity)
    .filter(Boolean);
  const sourceParsed = sourceIdentities.map(parseRank).filter(Boolean);
  const mode = action.mode ?? '';
  const family = action.family ?? '';
  const category = MODE_CATEGORY[mode] ?? family;
  const reasonCodes = [];
  let adjustment = 0;

  // ── Terminal win detection ──
  const immediate = Number(action.featureVector?.immediateScore ?? action.featureVector?.immediatePoints ?? 0);
  const ownSecured = Number(own.securedPoints ?? 0);
  const ownGoal = Number(own.goal ?? 21);
  if (ownSecured + immediate >= ownGoal) {
    adjustment += 8000;
    reasonCodes.push('TERMINAL_SCORE_AVAILABLE');
    // Terminal wins override conservation — never penalize a winning score
    return { adjustment, reasonCodes };
  }

  // ── Prevent opponent terminal win ──
  const maxOpponentScore = Math.max(0, ...opponents.map(o => Number(o.securedPoints ?? 0)));
  const opponentGoal = opponents[0]?.goal ?? 21;
  const opponentCanWin = maxOpponentScore >= opponentGoal - 5;
  if (opponentCanWin && (category.startsWith('counter') || category === 'disrupt-action' || category === 'defense-lock')) {
    adjustment += 1500;
    reasonCodes.push('PREVENTS_OPPONENT_WIN');
  }

  // ── Rank-specific mode valuation ──
  adjustment += rankModeValuation(sourceParsed, mode, category, action, context, reasonCodes);

  // ── Counter conservation ──
  adjustment += counterConservation(sourceParsed, mode, category, action, context, cognition, reasonCodes);

  // ── Combination / recipe awareness ──
  adjustment += combinationAwareness(sourceParsed, mode, category, action, context, reasonCodes);

  // ── Conservation opportunity-cost ──
  adjustment += conservationPenalty(sourceParsed, mode, category, action, context, cognition, reasonCodes);

  return { adjustment, reasonCodes };
}

/**
 * Rank-specific mode valuation — distinguishes mechanically different modes
 * of the same physical rank (e.g. 10♣ vs 10♦ vs 10♥ vs 10♠).
 */
function rankModeValuation(sources, mode, category, action, context, reasonCodes) {
  let adj = 0;
  const primaryRank = sources[0]?.rank;
  const primarySuit = sources[0]?.suit;

  // ── Rank 10 mode differentiation ──
  if (primaryRank === '10' || mode.startsWith('rank10-')) {
    switch (mode) {
      case 'club-foundation':
        // 10♣ Foundation: scoring with Aegis + bonus trigger. Strong when
        // secured points are low (Foundation triggers at zero).
        adj += 180;
        reasonCodes.push('TEN_CLUB_FOUNDATION_VALUE');
        break;
      case 'diamond-mimic':
        // 10♦ Mimic: copies another effect. Value depends on what's available
        // to mimic — high option value.
        adj += 220;
        reasonCodes.push('TEN_DIAMOND_MIMIC_HIGH_VALUE');
        break;
      case 'heart-tempo': {
        // 10♥ Tempo Spike: +2 Mini-Turns. Only valuable if the AI has cards
        // to spend those mini-turns on.
        const handCount = context?.authorizedView?.own?.hand?.length ?? 0;
        if (handCount >= 3) {
          adj += 200;
          reasonCodes.push('TEN_HEART_TEMPO_VALUE');
        } else {
          adj -= 120;
          reasonCodes.push('TEN_HEART_TEMPO_WASTED');
        }
        break;
      }
      case 'spade-stack-theft': {
        // 10♠ Stack Theft: steals a pending effect but costs a Full-Turn skip.
        // Only worth it if the stolen effect's swing exceeds the skip cost.
        const stackValue = estimateStackValue(context);
        if (stackValue > 150) {
          adj += 250;
          reasonCodes.push('TEN_SPADE_THEFT_HIGH_VALUE');
        } else {
          adj -= 200;
          reasonCodes.push('STACK_THEFT_SKIP_COST_EXCEEDS_SWING');
        }
        break;
      }
      case 'spade-exile-recovery':
        // 10♠ Exile Recovery: recover a card from Exile. Only valuable if
        // the known Exile contains worthwhile cards.
        adj += 100;
        reasonCodes.push('TEN_SPADE_EXILE_RECOVERY');
        break;
    }
    return adj;
  }

  // ── Ace counter differentiation ──
  if (primaryRank === 'A') {
    if (mode === 'base-counter') {
      adj += 150;
      reasonCodes.push('BASE_ACE_COUNTER');
    } else if (mode === 'spade-exile-counter') {
      // A♠ Exile Counter — premium, removes source from future recovery
      adj += 280;
      reasonCodes.push('SPADE_ACE_EXILE_PREMIUM');
    } else if (mode === 'super-counter') {
      // ⭐A Super Counter — highest authority, preserve for major threats
      adj += 200;
      reasonCodes.push('SUPER_ACE_COUNTER');
    } else if (mode === 'anchor-counter') {
      adj += 160;
      reasonCodes.push('ANCHOR_ACE_COUNTER');
    }
    return adj;
  }

  // ── King differentiation ──
  if (primaryRank === 'K') {
    if (mode === 'anchor-goal-counter') {
      adj += 140;
      reasonCodes.push('KING_COUNTER');
    } else if (mode === 'spade-multi-counter') {
      // K♠ Multi-Play Counter — premium, preserve for multi-card threats
      adj += 260;
      reasonCodes.push('KING_SPADE_MULTI_COUNTER');
    } else if (mode === 'wild-sovereignty') {
      // K♠ Wild Sovereignty — copies a Spade Base effect, then Exiled
      adj += 230;
      reasonCodes.push('KING_SPADE_WILD_SOVEREIGNTY');
    } else if (mode === 'royal-marriage') {
      adj += 300;
      reasonCodes.push('ROYAL_MARRIAGE_OPTION_VALUE');
    } else if (mode === 'anchor') {
      adj += 170;
      reasonCodes.push('KING_ANCHOR_VALUE');
    }
    return adj;
  }

  // ── Queen differentiation ──
  if (primaryRank === 'Q') {
    if (mode === 'queens-court') {
      adj += 320;
      reasonCodes.push('QUEENS_COURT_RECIPE_COMPLETED');
    } else if (mode === 'guard-anchor') {
      adj += 160;
      reasonCodes.push('QUEEN_GUARD_ANCHOR');
    } else if (mode === 'quick-aegis') {
      adj += 130;
      reasonCodes.push('QUEEN_QUICK_AEGIS');
    } else if (mode === 'spade-protection') {
      adj += 200;
      reasonCodes.push('QUEEN_SPADE_PROTECTION');
    }
    return adj;
  }

  // ── Black Joker differentiation ──
  if (primaryRank === 'BJ') {
    if (mode === 'board-lock-quick') {
      // Board Lock: defensive lockdown vs 11-point score
      const opponentPressure = estimateOpponentPressure(context);
      if (opponentPressure > 0.6) {
        adj += 350;
        reasonCodes.push('BLACK_JOKER_BOARD_LOCK_PREVENTS_TERMINAL_PUSH');
      } else {
        // If opponent isn't threatening, scoring 11 is usually better
        adj -= 100;
        reasonCodes.push('BLACK_JOKER_SCORE_PREFERRED_OVER_LOCK');
      }
    } else if (mode === 'exile-recycle') {
      adj += 120;
      reasonCodes.push('BLACK_JOKER_EXILE_RECYCLE');
    }
    return adj;
  }

  // ── Red Joker mode differentiation ──
  if (primaryRank === 'RJ') {
    const handAdvantage = estimateHandAdvantage(context);
    switch (mode) {
      case 'hand-swap':
        if (handAdvantage < -0.3) { adj += 200; reasonCodes.push('RED_JOKER_HAND_SWAP_FAVORABLE'); }
        else { adj -= 80; reasonCodes.push('RED_JOKER_HAND_SWAP_UNFAVORABLE'); }
        break;
      case 'self-reset':
        if (handAdvantage < -0.5) { adj += 220; reasonCodes.push('RED_JOKER_SELF_RESET_LOW_HAND'); }
        else { adj -= 120; reasonCodes.push('RED_JOKER_SELF_RESET_UNNECESSARY'); }
        break;
      case 'opponent-attack':
        if (handAdvantage > 0.3) { adj += 180; reasonCodes.push('RED_JOKER_OPPONENT_ATTACK_FAVORABLE'); }
        else { adj -= 60; reasonCodes.push('RED_JOKER_OPPONENT_ATTACK_NEUTRAL'); }
        break;
      case 'shuffle-reset':
        adj += 100;
        reasonCodes.push('RED_JOKER_SHUFFLE_RESET');
        break;
    }
    return adj;
  }

  // ── Five Exile range awareness ──
  if (primaryRank === '5') {
    if (mode === 'recycle' || mode === 'suit-rummage') {
      const exileHasValue = estimateExileValue(context);
      if (exileHasValue <= 0) {
        adj -= 150;
        reasonCodes.push('FIVE_EXILE_RANGE_EMPTY');
      } else {
        adj += 120 + exileHasValue * 10;
        reasonCodes.push('FIVE_EXILE_RANGE_HAS_VALUE');
      }
    }
    return adj;
  }

  // ── Four clear awareness ──
  if (primaryRank === '4') {
    if (mode === 'total-clear') {
      // 4♠ Total Clear — check friendly loss
      const friendlyLoss = estimateFriendlyLoss(action, context);
      if (friendlyLoss > 10) {
        adj -= 180;
        reasonCodes.push('FOUR_TOTAL_CLEAR_FRIENDLY_LOSS_TOO_HIGH');
      } else {
        adj += 200;
        reasonCodes.push('FOUR_TOTAL_CLEAR_FAVORABLE');
      }
    } else if (mode === 'row-clear') {
      const enemyLoss = estimateEnemyLoss(action, context);
      adj += Math.min(200, enemyLoss * 5);
      reasonCodes.push('FOUR_ROW_CLEAR_VALUE');
    }
    return adj;
  }

  // ── Eight Scuttle Counter preservation ──
  if (primaryRank === '8') {
    if (mode === 'scuttle-counter') {
      adj += 160;
      reasonCodes.push('EIGHT_SCUTTLE_COUNTER_RESERVE');
    } else if (mode === 'absolute-scuttle') {
      adj += 240;
      reasonCodes.push('EIGHT_ABSOLUTE_SCUTTLE');
    }
    return adj;
  }

  // ── Nine Goal Shift awareness ──
  if (primaryRank === '9') {
    if (mode === 'goal-shift' || mode === 'spade-goal-shift') {
      const goalDelta = Number(action.featureVector?.goalDeltaOpponent ?? 0);
      if (goalDelta > 0) {
        adj += 180 + goalDelta * 20;
        reasonCodes.push('NINE_GOAL_SHIFT_DENIAL');
      }
    } else if (mode === 'anchor') {
      adj += 140;
      reasonCodes.push('NINE_ANCHOR_DENIAL');
    }
    return adj;
  }

  // ── Two recipe-component awareness ──
  if (primaryRank === '2') {
    if (mode === 'wild-catalyst') {
      // 2 as Wild catalyst for Supers — high recipe value
      adj += 100;
      reasonCodes.push('TWO_WILD_CATALYST_RECIPE_VALUE');
    } else if (mode === 'quick-score-discard') {
      // Scoring a 2 is low value unless terminal — preserve for recipes
      adj -= 40;
      reasonCodes.push('TWO_PRESERVE_FOR_RECIPE');
    }
    return adj;
  }

  // ── Jack disruption preservation ──
  if (primaryRank === 'J') {
    if (mode === 'disrupt') {
      adj += 170;
      reasonCodes.push('JACK_DISRUPT_VALUE');
    }
    return adj;
  }

  return adj;
}

/**
 * Counter conservation — don't spend premium counters on low-impact plays.
 */
function counterConservation(sources, mode, category, action, context, cognition, reasonCodes) {
  let adj = 0;
  const primaryRank = sources[0]?.rank;
  const primarySuit = sources[0]?.suit;
  const isPremiumCounter = category === 'counter-premium';
  const isBasicCounter = category === 'counter-effect' || category === 'counter-anchor' || category === 'counter-scuttle';

  // If both Base Ace and ⭐A are legal, prefer Base Ace and preserve ⭐A
  if (mode === 'super-counter') {
    adj -= 120;
    reasonCodes.push('BASE_ACE_SUFFICIENT_PRESERVE_SUPER_ACE');
  }

  // K♠ multi-counter: preserve for multi-card threats (Queen's Court, Royal Marriage, Supers)
  if (mode === 'spade-multi-counter') {
    const threatIsMultiCard = estimateThreatIsMultiCard(context);
    if (!threatIsMultiCard) {
      adj -= 180;
      reasonCodes.push('PRESERVE_KSPADE_FOR_MULTI_PLAY_COUNTER');
    } else {
      adj += 200;
      reasonCodes.push('KSPADE_MULTI_COUNTER_HIGH_VALUE_TARGET');
    }
  }

  // A♠ exile counter: prefer over Base Ace when removing source from recovery matters
  if (mode === 'spade-exile-counter') {
    const sourceRecoverable = estimateSourceRecoverability(context);
    if (sourceRecoverable > 0.5) {
      adj += 80;
      reasonCodes.push('SPADE_ACE_EXILE_PREVENTS_RECOVERY');
    }
  }

  return adj;
}

/**
 * Combination / recipe awareness — recognize near-complete recipes and
 * penalize breaking them.
 */
function combinationAwareness(sources, mode, category, action, context, reasonCodes) {
  let adj = 0;
  const own = context?.authorizedView?.own ?? {};
  const hand = own.hand ?? [];
  const knownCards = context?.authorizedView?.knownCards ?? {};
  const handIdentities = hand.map(h => knownCards[h]?.identity).filter(Boolean).map(parseRank).filter(Boolean);
  const handRanks = handIdentities.map(p => p.rank);
  const handByRank = {};
  for (const p of handIdentities) {
    const key = p.suit ? `${p.rank}${p.suit}` : p.rank;
    handByRank[key] = (handByRank[key] ?? 0) + 1;
  }

  const consumedRank = sources[0]?.rank;
  const consumedSuit = sources[0]?.suit;
  const consumedKey = consumedSuit ? `${consumedRank}${consumedSuit}` : consumedRank;

  // ── Queen's Court: 2 Queens in hand ──
  if (consumedRank === 'Q' && mode !== 'queens-court' && mode !== 'pr-score') {
    const queenCount = handIdentities.filter(p => p.rank === 'Q').length;
    if (queenCount >= 2) {
      adj -= 100;
      reasonCodes.push('PRESERVE_QUEEN_FOR_QUEENS_COURT');
    }
  }

  // ── Royal Marriage: same-suit Q + K ──
  if (consumedRank === 'Q' && mode !== 'royal-marriage' && consumedSuit) {
    const hasMatchingKing = handIdentities.some(p => p.rank === 'K' && p.suit === consumedSuit);
    if (hasMatchingKing) {
      adj -= 80;
      reasonCodes.push('PRESERVE_QUEEN_FOR_ROYAL_MARRIAGE');
    }
  }
  if (consumedRank === 'K' && mode !== 'royal-marriage' && mode !== 'anchor' && consumedSuit) {
    const hasMatchingQueen = handIdentities.some(p => p.rank === 'Q' && p.suit === consumedSuit);
    if (hasMatchingQueen) {
      adj -= 80;
      reasonCodes.push('PRESERVE_KING_FOR_ROYAL_MARRIAGE');
    }
  }

  // ── Super recipe: two equal ranks ──
  if (consumedRank && !['super', 'advanced-combo'].includes(category)) {
    const sameRankCount = handRanks.filter(r => r === consumedRank).length;
    if (sameRankCount >= 2 && !['A', 'Q', 'K', '10'].includes(consumedRank)) {
      adj -= 50;
      reasonCodes.push('PRESERVE_FOR_SUPER_RECIPE');
    }
  }

  // ── 2 + same-suit rank 3-7 for Super ──
  if (consumedRank === '2' && consumedSuit && (mode === 'quick-score-discard' || mode === 'ordinary' || mode === 'score')) {
    const hasMatchingRecipe = handIdentities.some(p =>
      ['3', '4', '5', '6', '7'].includes(p.rank) && p.suit === consumedSuit
    );
    if (hasMatchingRecipe) {
      adj -= 70;
      reasonCodes.push('PRESERVE_TWO_FOR_SAME_SUIT_SUPER');
    }
  }

  // ── 10♦ + any 2 for paired mimic ──
  if (consumedRank === '2' && (mode === 'quick-score-discard' || mode === 'ordinary' || mode === 'score')) {
    const hasTenDiamond = handIdentities.some(p => p.rank === '10' && p.suit === '♦');
    if (hasTenDiamond) {
      adj -= 60;
      reasonCodes.push('PRESERVE_TWO_FOR_TEN_DIAMOND_MIMIC');
    }
  }

  return adj;
}

/**
 * Conservation opportunity-cost — penalize spending strategically valuable
 * cards when the future opportunity is probable and the immediate value
 * is low. Conservation weakens when scoring wins, opponent threatens, or
 * the card is likely to be lost.
 */
function conservationPenalty(sources, mode, category, action, context, cognition, reasonCodes) {
  let adj = 0;
  const primaryRank = sources[0]?.rank;
  const primarySuit = sources[0]?.suit;
  const isScoring = category === 'score' || category === 'score-quick' || mode === 'score' || mode === 'ordinary';

  // Only apply conservation to scoring/placement actions (not effects/counters)
  if (!isScoring) return 0;

  // ── Don't penalize if the score is terminal (already handled) ──
  const immediate = Number(action.featureVector?.immediateScore ?? action.featureVector?.immediatePoints ?? 0);
  const own = context?.authorizedView?.own ?? {};
  const ownSecured = Number(own.securedPoints ?? 0);
  const ownGoal = Number(own.goal ?? 21);
  if (ownSecured + immediate >= ownGoal) return 0;

  // ── Conservation weakens under opponent threat ──
  const opponents = context?.authorizedView?.opponents ?? [];
  const maxOpponentScore = Math.max(0, ...opponents.map(o => Number(o.securedPoints ?? 0)));
  const opponentGoal = opponents[0]?.goal ?? 21;
  const opponentThreat = Math.max(0, maxOpponentScore / opponentGoal);
  const threatDampen = 1.0 - opponentThreat * 0.7;

  // ── Premium card conservation ──
  if (primaryRank === 'A' && primarySuit === '♠') {
    adj -= 60 * threatDampen;
    reasonCodes.push('PRESERVE_ACE_SPADE_PREMIUM');
  } else if (primaryRank === 'K' && primarySuit === '♠') {
    adj -= 80 * threatDampen;
    reasonCodes.push('PRESERVE_KING_SPADE_PREMIUM');
  } else if (primaryRank === 'Q' && primarySuit === '♠') {
    adj -= 40 * threatDampen;
    reasonCodes.push('PRESERVE_QUEEN_SPADE_PREMIUM');
  } else if (primaryRank === 'A') {
    adj -= 30 * threatDampen;
    reasonCodes.push('PRESERVE_ACE_COUNTER');
  } else if (primaryRank === 'K') {
    adj -= 35 * threatDampen;
    reasonCodes.push('PRESERVE_KING_COUNTER');
  } else if (primaryRank === 'Q') {
    adj -= 25 * threatDampen;
    reasonCodes.push('PRESERVE_QUEEN_NETWORK');
  } else if (primaryRank === '2') {
    adj -= 20 * threatDampen;
    reasonCodes.push('PRESERVE_TWO_RECIPE');
  } else if (primaryRank === 'BJ') {
    // Black Joker: 11 points is huge, but Board Lock may be more valuable
    adj -= 50 * threatDampen;
    reasonCodes.push('PRESERVE_BLACK_JOKER_OPTION');
  } else if (primaryRank === 'RJ') {
    adj -= 30 * threatDampen;
    reasonCodes.push('PRESERVE_RED_JOKER_OPTION');
  } else if (primaryRank === '10') {
    // Tens have multiple modes — preserve for effect use
    adj -= 25 * threatDampen;
    reasonCodes.push('PRESERVE_TEN_EFFECT_OPTION');
  } else if (primaryRank === '8') {
    adj -= 20 * threatDampen;
    reasonCodes.push('PRESERVE_EIGHT_SCUTTLE_COUNTER');
  } else if (primaryRank === 'J') {
    adj -= 20 * threatDampen;
    reasonCodes.push('PRESERVE_JACK_DISRUPT');
  }

  // ── Draw Pile exhaustion changes resource value ──
  const dpRemaining = Number(own.drawPileRemaining ?? context?.authorizedView?.drawPileRemaining ?? 99);
  if (dpRemaining <= 5) {
    // Late game: conservation weakens because cards won't be replaced
    adj *= 0.5;
    if (reasonCodes.length > 0 && reasonCodes[reasonCodes.length - 1].startsWith('PRESERVE_')) {
      reasonCodes.push('LATE_GAME_CONSERVATION_WEAKENED');
    }
  }

  return adj;
}

// ── Estimation helpers (use only authorized/public information) ──

function estimateStackValue(context) {
  const stack = context?.authorizedView?.stack ?? [];
  let value = 0;
  for (const item of stack) {
    value += Number(item.featureVector?.immediateScore ?? 0) * 10;
    value += (item.targetHandles ?? []).length * 50;
  }
  return value;
}

function estimateOpponentPressure(context) {
  const opponents = context?.authorizedView?.opponents ?? [];
  if (!opponents.length) return 0;
  const opp = opponents[0];
  const secured = Number(opp.securedPoints ?? 0);
  const goal = Number(opp.goal ?? 21);
  return Math.min(1, secured / goal);
}

function estimateHandAdvantage(context) {
  const own = context?.authorizedView?.own ?? {};
  const opponents = context?.authorizedView?.opponents ?? [];
  const ownHand = own.hand?.length ?? 0;
  const oppHand = opponents[0]?.hand?.length ?? 0;
  if (ownHand + oppHand === 0) return 0;
  return (ownHand - oppHand) / Math.max(ownHand, oppHand, 1);
}

function estimateExileValue(context) {
  // Public Exile contents are visible
  const exile = context?.authorizedView?.exile ?? context?.authorizedView?.own?.exile ?? [];
  if (!Array.isArray(exile) || exile.length === 0) return 0;
  // Count high-value recoverable cards
  let value = 0;
  for (const card of exile) {
    const parsed = parseRank(card?.identity);
    if (!parsed) continue;
    if (['A', 'K', 'Q', '10', 'BJ', 'RJ'].includes(parsed.rank)) value += 3;
    else if (['8', '9', 'J'].includes(parsed.rank)) value += 2;
    else value += 1;
  }
  return value;
}

function estimateFriendlyLoss(action, context) {
  // Estimate own PR/ER value that would be cleared
  const own = context?.authorizedView?.own ?? {};
  const prValue = (own.pointRow ?? []).reduce((s, c) => s + Number(c.pointValue ?? 0), 0);
  return prValue;
}

function estimateEnemyLoss(action, context) {
  const opponents = context?.authorizedView?.opponents ?? [];
  const prValue = opponents.reduce((s, o) =>
    s + (o.pointRow ?? []).reduce((ss, c) => ss + Number(c.pointValue ?? 0), 0), 0);
  return prValue;
}

function estimateThreatIsMultiCard(context) {
  const stack = context?.authorizedView?.stack ?? [];
  const top = stack.at(-1);
  if (!top) return false;
  const sourceCount = (top.sourceHandles ?? []).length;
  if (sourceCount >= 2) return true;
  const family = top.family ?? '';
  return ['royal-marriage', 'queens-court', 'super', 'ultra'].includes(family);
}

function estimateSourceRecoverability(context) {
  // If the opponent has Exile recovery options (5, 10♠ recovery), the source
  // is more recoverable, making A♠ exile destination more valuable.
  const opponents = context?.authorizedView?.opponents ?? [];
  const oppHand = opponents[0]?.hand ?? [];
  const knownCards = context?.authorizedView?.knownCards ?? {};
  for (const h of oppHand) {
    const id = knownCards[h]?.identity;
    const parsed = parseRank(id);
    if (parsed && (parsed.rank === '5' || (parsed.rank === '10' && parsed.suit === '♠'))) {
      return 0.7;
    }
  }
  return 0.3;
}
