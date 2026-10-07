// Authorized-information estimates, not engine lookahead. Every emitted Core
// family has an explicit purpose; new families fail the coverage audit instead
// of silently inheriting a generic combo bonus. Legality stays engine-owned.
export const ACTION_PURPOSES = Object.freeze({
  phase: 'progress', 'response-decline': 'progress', 'exhausted-pass': 'progress',
  score: 'points', 'play-for-points': 'points', draw: 'resource', 'swap-bar': 'resource',
  scuttle: 'removal', 'effect-three': 'removal', 'effect-four': 'board', 'effect-ace': 'protection-removal',
  anchor: 'defense', 'anchor-private-choice': 'hand-pressure', attachment: 'control',
  counter: 'response', disrupt: 'response', interrupt: 'response', instant: 'response', quick: 'defense',
  'private-choice': 'choice', 'effect-private-choice': 'resource-or-hand-pressure',
  'effect-red-joker': 'hand-or-deck', 'effect-board-lock': 'lock',
  'royal-marriage': 'defense', 'queens-court': 'defense', super: 'composite',
  rank10: 'composite', ultra: 'composite', voltage: 'free-resource',
  'solo-wild': 'copied-effect', 'wild-sovereignty': 'copied-effect', 'sudden-death': 'terminal-risk',
});
const MODE_PATTERNS = Object.freeze({
  phase:/^enter-action$/, 'response-decline':/^decline$/, 'exhausted-pass':/^forced-mini-turn$/,
  score:/^points$/, 'play-for-points':/^points$/, draw:/^top$/, 'swap-bar':/^(face-down|face-up-draw)$/,
  scuttle:/^ordinary$/, 'effect-three':/^bounce-top$/, 'effect-four':/^(clear-(pr|er)|total-clear)$/,
  'effect-ace':/^purge-(aegis|anchor-bounce)$/, anchor:/^(ace|queen|king)$/,
  'anchor-private-choice':/^nine$/, attachment:/^jack-(pr|er)$/,
  counter:/^(ace-base|ace-spade|eight-scuttle|king-anchor|king-spade|super-ace|ace-anchor)$/,
  disrupt:/^jack$/, interrupt:/^rank10-stack-theft$/,
  instant:/^(nine-(spade-)?goal-shift-[35]|eight-spade-free-scuttle|nine-tap)$/,
  quick:/^(eight-aegis-field|queen-aegis|board-lock)$/,
  'private-choice':/^(rank3-(present|take|discard)|rank5-rummage|rank6-(keep-return-(top|bottom)|keep-all-discard)|rank7-(hand-only|effect-only|score-only|hand-and-effect|hand-and-score|generated-.+)|nine-anchor-discard|natural-four-reorder-.+|bj-exile-recycle-.+|seven-scoring-trigger-take-.+)$/,
  'effect-private-choice':/^(three-present-take|three-force-discard|five-recycle|six-dig|seven-topdeck|natural-four)$/,
  'effect-red-joker':/^(self-reset|shuffle-reset|hand-swap|opponent-attack)$/, 'effect-board-lock':/^black-joker$/,
  'royal-marriage':/^[♣♦♥♠]$/, 'queens-court':/^queens-court$/,
  super:/^(two-score|two-hold|four-exchange-(pr|er)|eight-absolute-scuttle|jack-tempo|three-raid|five-recycle|six-dig|seven-topdeck)$/,
  rank10:/^(club-foundation(-bonus)?|heart-tempo|spade-recovery|diamond-mimic-(paired-)?(row-exchange-(pr|er)|absolute-scuttle|super-j-tempo|topdeck-seven|recycle-five))$/,
  ultra:/^(three-red-counter|three-black-.+|2-black-2-red-(draw|rummage))$/,
  voltage:/^(three-(hand|points)|four-guess-.+-[♣♦♥♠]|five-(gy-bottom|refine))$/,
  'solo-wild':/^(three-bounce-[♣♦♥♠]|four-row-clear-(pr|er)-[♣♦♥♠]|total-clear-♠|recycle-five-[♣♦♥♠]|deep-draw-♠|topdeck-seven-[♣♦♥♠])$/,
  'wild-sovereignty':/^(three-bounce|four-row-clear-(pr|er)|total-clear|recycle-five|deep-draw|topdeck-seven)$/,
  'sudden-death':/^declare$/,
});
export const actionModeSupported = action => MODE_PATTERNS[action.family]?.test(String(action.mode ?? '')) ?? false;

export function actionCoverageKeys(action) {
  const keys = [`family:${action.family}`, `mode:${action.family}:${action.mode}`, `timing:${action.timingClass}`];
  if (action.family === 'super' || action.featureVector?.generatedFamily === 'super' || action.featureVector?.super || action.mode === 'super-ace') keys.push('play:super');
  if (action.family === 'ultra' || action.featureVector?.generatedFamily === 'ultra' || action.featureVector?.ultra) keys.push('play:ultra');
  // Canonical Combo (rulebook §8): super/ultra classes + the ⭐A counter.
  if (action.family === 'super' || action.family === 'ultra' || action.mode === 'super-ace'
    || action.semantics?.effectKind === 'declare-combo') keys.push('play:combo');
  return keys;
}

// One opportunity per category per decision frame, independent of how many
// legal target/cost permutations the engine emits. Selection is not resolution.
export function recordActionCoverage(stats, legalActions, selected) {
  const data = stats.actionCoverage ??= { schemaVersion: 1, opportunities: {}, selected: {} };
  for (const key of new Set(legalActions.flatMap(actionCoverageKeys))) data.opportunities[key] = (data.opportunities[key] ?? 0) + 1;
  for (const key of actionCoverageKeys(selected)) data.selected[key] = (data.selected[key] ?? 0) + 1;
}
export const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
export const cardRank = card => String(card?.identity ?? '').replace(/[♣♦♥♠]/gu, '');
export const cardFrom = (view, ref) => typeof ref === 'string' ? view.knownCards?.[ref] : ref;
export function boardPoints(card) {
  if (!card || card.tapped) return 0;
  if (String(card.zone).endsWith('_PR')) return number(card.pointValue);
  if (String(card.zone).endsWith('_ER') && cardRank(card) === 'K') return card.identity.endsWith('♠') ? 9 : 7;
  return 0;
}
export const rowPoints = cards => (cards ?? []).reduce((sum, card) => sum + boardPoints(card), 0);

// Value retained in hand includes known recipes and counters. Never estimate an
// opponent's hidden cards from IDs, deck seed or RNG state.
export function handValue(card, view) {
  if (!card || card.identity === 'HIDDEN') return 0;
  const rank = cardRank(card), suit = String(card.identity).slice(-1);
  const hand = (view.own?.hand ?? []).map(ref => cardFrom(view, ref)).filter(Boolean);
  let value = number(card.pointValue);
  if (['A', 'K', 'Q', '2'].includes(rank)) value += { A: 4, K: 2, Q: 3, '2': 2 }[rank];
  if (card.identity === 'K♠' || card.identity === 'A♠') value += 2;
  if ((rank === 'K' || rank === 'Q') && hand.some(c => c.id !== card.id && cardRank(c) === (rank === 'K' ? 'Q' : 'K') && String(c.identity).endsWith(suit))) value += 3;
  if (hand.some(c => c.id !== card.id && cardRank(c) === rank)) value += 1.5;
  return value;
}

const cards = (view, handles) => (handles ?? []).map(h => cardFrom(view, h)).filter(Boolean);
const sumHand = (view, handles) => cards(view, handles).reduce((sum, card) => sum + handValue(card, view), 0);
export function privateChoiceScore(action, context) {
  const view = context.authorizedView, own = view.own, choice = view.pendingChoice;
  const fv = action.featureVector ?? {}, mode = String(action.mode ?? ''), s = action.semantics ?? {};
  const targets = action.targetHandles ?? [], value = sumHand(view, targets);
  // Presenting cards to an opponent and discarding our own cards should lose
  // the least useful cards. Rank3 force-discard selects the opponent's cards.
  if (mode === 'rank3-present' || mode === 'nine-anchor-discard') return 900 - value * 40;
  if (mode === 'rank3-discard') {
    const enemyChoice = choice?.context?.targetPlayerId !== context.actorId;
    return 900 + (enemyChoice ? value : -value) * 40;
  }
  if (fv.keepAll || mode === 'rank6-keep-all-discard') {
    const drawn = choice?.context?.drawnCardIds ?? [];
    return 900 + sumHand(view, drawn) * 40 - value * 40;
  }
  if (fv.naturalFour) {
    const order = s.topOrderHandles ?? targets, first = cardFrom(view, order[0]);
    // A draw now receives the known top card. Otherwise the opponent normally
    // draws first; arrange low-value cards nearer the top. No hidden top reads.
    return 900 + (fv.drawTop ? handValue(first, view) * 55 + 150 : -handValue(first, view) * 35);
  }
  if (choice?.kind === 'core-bj-exile-recycle' || mode.startsWith('bj-exile-recycle')) {
    // Recycled cards go to the public deck top, not directly to our hand.
    // A later mini-turn lets us draw first; otherwise favor denying a good draw.
    const canDraw = number(own.limits?.miniTurnsRemaining) > 0;
    const top = cardFrom(view, (s.topOrderHandles ?? targets.slice().reverse())[0]);
    return 900 + (canDraw ? 35 : -35) * handValue(top, view);
  }
  let gain = cards(view, s.scoreHandles).reduce((sum, c) => sum + number(c.pointValue), 0);
  if (!s.scoreHandles && fv.toScore) gain = number(cardFrom(view, targets[mode.includes('hand-and') ? 1 : 0])?.pointValue);
  if (gain > 0 && own.securedPoints + gain >= own.goal) return 10000 + gain * 34;
  if (mode.startsWith('rank7-')) {
    if (fv.fizzle) return -1000;
    const acquired = sumHand(view, s.acquireHandles ?? (fv.toHand ? targets.slice(0, 1) : []));
    if (fv.generated) {
      const kind = s.effectKind ?? fv.effectKind;
      const purpose = {
        'three-bounce':['effect-three','bounce-top'], 'four-row-clear':['effect-four',`clear-${s.row}`],
        'four-total-clear':['effect-four','total-clear'], 'jack-attach':['attachment',`jack-${s.row}`],
        'ace-purge':['effect-ace',s.effectMode === 'bounce-anchor' ? 'purge-anchor-bounce' : 'purge-aegis'],
        'ace-anchor':['anchor','ace'], 'queen-anchor':['anchor','queen'], 'king-anchor':['anchor','king'],
        'three-hand-raid':['effect-private-choice',`three-${s.effectMode}`], 'five-recycle':['effect-private-choice','five-recycle'],
        'six-dig':['effect-private-choice','six-dig'], 'seven-topdeck':['effect-private-choice','seven-topdeck'],
        'natural-four':['effect-private-choice','natural-four'], 'nine-anchor':['anchor-private-choice','nine'],
        'red-joker':['effect-red-joker',s.effectMode], 'black-joker-board-lock':['effect-board-lock','black-joker'],
      }[kind] ?? [fv.generatedFamily, fv.generatedMode];
      const generated = { ...action, family: purpose[0], mode: purpose[1],
        targetHandles: s.effectTargetHandles?.length ? s.effectTargetHandles : action.targetHandles,
        featureVector: {...fv, generated:false}, semantics: s };
      const effect = evaluateAction(generated, context);
      if (effect.gain > 0 && own.securedPoints + effect.gain - effect.ownLoss >= own.goal) return 10000 + (effect.gain-effect.ownLoss)*34;
      return 900 + effect.gain * 65 + effect.removed * 90 - effect.ownLoss * 90 + effect.utility - Math.max(0,effect.spent-1)*160 - effect.cost*7;
    }
    const effectCards = cards(view, s.effectHandles ?? (fv.toEffect ? targets.slice(mode.includes('hand-and') ? 1 : 0) : []));
    // Assignment opens a later legal generated-effect decision; only estimate
    // its option value here, without fabricating a future legal frame.
    const option = effectCards.reduce((sum, c) => sum + handValue(c, view) * 12, 0);
    return 900 + gain * 65 + acquired * 35 + option;
  }
  return 900 + value * 40;
}

export function evaluateAction(action, context) {
  const view = context.authorizedView, own = view.own ?? {}, opponents = view.opponents ?? [];
  const fv = action.featureVector ?? {}, s = action.semantics ?? {}, family = action.family, mode = String(action.mode ?? '');
  const enemy = opponents.find(p => p.playerId === s.targetPlayerId) ?? opponents[0];
  const targets = cards(view, [...new Set([...(action.targetHandles ?? []), ...(s.effectTargetHandles ?? [])])]);
  const friendly = targets.filter(c => c.controllerId === context.actorId), hostile = targets.filter(c => c.controllerId !== context.actorId);
  const sourceHandles = [...new Set([...(action.sourceHandles ?? []), ...(action.composition?.costs ?? []), ...(s.discardHandles ?? [])])];
  const spentCards = cards(view, sourceHandles).filter(c => !String(c.zone).endsWith('_ER'));
  const hand = (own.hand ?? []).map(ref => cardFrom(view, ref)).filter(Boolean);
  const kind = s.effectKind ?? action.composition?.effect ?? '';
  const result = { supported: Object.hasOwn(ACTION_PURPOSES, family), modeSupported:actionModeSupported(action), purpose: ACTION_PURPOSES[family] ?? 'unknown',
    gain: number(fv.immediateScore ?? fv.immediatePoints), removed: 0, ownLoss: 0, utility: 0,
    spent: spentCards.length, cost: spentCards.reduce((sum, c) => sum + handValue(c, view), 0), reasonCodes: [] };
  const reason = code => result.reasonCodes.push(code);
  if (family === 'phase') { result.utility = 0; reason('OPTIONAL_START_BEFORE_ADVANCE'); return result; }
  if (family === 'private-choice') { result.choiceScore = privateChoiceScore(action, context); reason('CHOICE_ROLE_VALUED'); return result; }
  if (family === 'swap-bar') {
    if (mode === 'face-down') {
      const offered = cards(view, action.sourceHandles)[0], value = handValue(offered, view);
      // No promise about the unknown replacement. Trade weak known material;
      // do not throw away an available winning score or a valuable recipe.
      const winning = number(offered?.pointValue) + number(own.securedPoints) >= (own.goal ?? Infinity);
      result.resourceScore = winning ? -2000 : 560 - value * 75;
      reason(winning ? 'PRESERVE_WINNING_CARD' : 'SWAP_KNOWN_COST_UNKNOWN_RETURN');
    } else {
      const target = targets[0], value = handValue(target, view);
      const reachesGoal = target && number(target.pointValue) + number(own.securedPoints) >= (own.goal ?? Infinity);
      result.resourceScore = 500 + value * 65 + (hand.length <= 2 ? 240 : 0) + (reachesGoal && number(own.limits?.miniTurnsRemaining) > 1 ? 800 : 0);
      reason('FACE_UP_CARD_AND_RECIPE_VALUE');
    }
    return result;
  }
  result.gain += cards(view, s.scoreHandles).reduce((sum, c) => sum + number(c.pointValue), 0);
  if (fv.foundation || mode.startsWith('club-foundation')) {
    result.gain += 10; result.utility += 100;
    if (fv.bonus) { result.utility -= 120; reason('FOUNDATION_NEXT_TURN_RESTRICTION'); }
  }
  if (family === 'scuttle' || fv.scuttle || fv.absoluteScuttle || fv.tap || /three-bounce/.test(kind) || family === 'effect-three') {
    result.removed = rowPoints(hostile); result.ownLoss = rowPoints(friendly);
  }
  if (family === 'attachment' || (fv.controlChange && family !== 'interrupt') || kind === 'jack-attach') {
    result.removed = rowPoints(hostile);
    if (fv.disposition === 'hold' || fv.holdChild) result.utility += sumHand(view, action.targetHandles) * 25;
    else result.gain += fv.disposition === 'score' ? hostile.reduce((sum, c) => sum + number(c.pointValue), 0) : result.removed + (mode === 'jack-pr' ? 1 : 0);
  }
  const row = s.row ?? fv.row ?? (mode.startsWith('clear-') ? mode.slice(6) : null);
  const clear = (family === 'effect-four' && mode.startsWith('clear-')) || kind === 'four-row-clear' || fv.copiedFamily === 'row-clear';
  if (clear) {
    const affected = (enemy?.[row] ?? []).filter(c => !c.aegis);
    result.removed = rowPoints(affected);
    result.utility += affected.filter(c => c.providesGuard || cardRank(c) === 'A' || cardRank(c) === 'Q').length * 100;
    if (!affected.length) result.utility -= 1200;
    reason('PUBLIC_ROW_CLEAR_NET_VALUE');
  }
  if (mode.includes('total-clear') || kind === 'four-total-clear' || kind === 'total-clear') {
    result.removed = opponents.reduce((sum, p) => sum + number(p.securedPoints), 0);
    result.ownLoss = number(own.securedPoints);
    reason('TOTAL_CLEAR_INCLUDES_OWN_LOSS');
  }
  if (mode.includes('exchange') && ['pr', 'er'].includes(row)) {
    result.gain = rowPoints(enemy?.[row]) - rowPoints(own[row]); result.removed = result.gain;
    reason('ROW_EXCHANGE_NET_VALUE');
  }
  if (family === 'anchor' || family === 'royal-marriage') {
    const generatedKing = kind === 'king-anchor' ? cards(view, [...(action.sourceHandles ?? []),...(action.targetHandles ?? [])]).find(c => cardRank(c)==='K') : null;
    result.gain = Math.max(result.gain, number(fv.anchorValue), generatedKing ? generatedKing.identity.endsWith('♠') ? 9 : 7 : 0);
  }
  if (fv.guard || kind === 'queen-anchor' || family === 'queens-court') {
    const ownQueens = (own.er ?? []).filter(c => cardRank(c) === 'Q' && !c.tapped).length;
    const enemyQueens = (enemy?.er ?? []).filter(c => cardRank(c) === 'Q' && !c.tapped).length;
    result.utility += (number(own.securedPoints) > 0 ? 200 : 60) + (ownQueens <= enemyQueens ? 150 : 40);
  }
  if (fv.aegis) {
    const protectedCards = targets.length ? friendly : [...(own.pr ?? []), ...(own.er ?? [])];
    const value = rowPoints(protectedCards.filter(c => !c.aegis));
    result.utility += value ? 100 + value * 35 : -1200;
    reason('AEGIS_UNPROTECTED_BOARD_VALUE');
  }
  if (family === 'effect-ace') {
    result.removed = mode.includes('bounce') ? rowPoints(hostile) : 0;
    result.utility += hostile.reduce((sum, c) => sum + (c.aegis ? 120 + boardPoints(c) * 15 : 0), 0);
  }
  if (fv.goalShift) {
    result.removed = number(fv.delta ?? fv.goalDelta);
    result.gain = Math.max(0, -number(fv.ownGoalDelta));
    reason('GOAL_SHIFT_PUBLIC_GAP');
  }
  const handPressure = /three-(present|force|raid)|three-hand-raid/.test(mode + kind) || family === 'anchor-private-choice';
  if (handPressure) {
    const count = number(enemy?.handCount);
    // Present-take allows the opponent to present zero cards. Promise no gain
    // from a branch whose denial is an explicitly legal private choice.
    const affected = mode.includes('force-discard') || s.effectMode === 'force-discard' ? Math.max(0,count-2) : mode.includes('present-take') || s.effectMode === 'present-take' ? 0 : Math.min(count,family === 'anchor-private-choice' ? 1 : 2);
    result.utility += affected * 180 - (affected ? 0 : 900); reason('VISIBLE_HAND_COUNT_PRESSURE');
  }
  const draw = number(fv.drawCount ?? fv.cardsDrawn ?? fv.draw);
  if (draw) result.utility += Math.min(draw, number(view.dpCount ?? draw)) * (hand.length <= 2 ? 95 : 55);
  if (kind === 'six-dig' && !draw) result.utility += Math.min(2,number(view.dpCount))*95;
  if (/five-recycle|recycle-five/.test(kind + mode)) result.utility += Math.min(number(view.gyCount) + Math.min(number(view.dpCount), 2), 2) * 100;
  if (/deep-draw/.test(kind + mode)) result.utility += Math.min(number(view.dpCount), 4) * 95 - sumHand(view, s.discardHandles ?? action.composition?.costs) * 20;
  if (/seven-topdeck|topdeck-seven|natural-four/.test(kind + mode)) result.utility += Math.min(number(view.dpCount), 2) * 90;
  if (fv.recovery) { result.utility += sumHand(view, action.targetHandles) * 45; reason('PUBLIC_RECOVERY_TARGET_VALUE'); }
  const mini = number(fv.miniTurns);
  if (mini) {
    const remaining = number(own.limits?.miniTurnsRemaining ?? 1);
    const room = Math.max(0, 3 - Math.max(0, remaining - 1));
    const usable = Math.min(mini, room, Math.max(0, hand.length - result.spent) + draw);
    result.utility += usable * 120 - (mini - usable) * 120;
    reason('TEMPO_CAP_AND_REMAINING_HAND');
  }
  if (family === 'effect-red-joker') {
    const remainingHand = hand.filter(c => !(action.sourceHandles ?? []).includes(c.id));
    if (mode === 'hand-swap') result.utility += (number(enemy?.handCount) * 6 - remainingHand.reduce((sum, c) => sum + handValue(c, view), 0)) * 55;
    else if (mode === 'opponent-attack') result.utility += Math.min(2, number(enemy?.handCount)) * 180 - (enemy?.handCount ? 0 : 900);
    else if (mode === 'self-reset') result.utility += Math.min(number(view.dpCount), remainingHand.length + 3) * 110 - remainingHand.reduce((sum, c) => sum + handValue(c, view), 0) * 30;
    else result.utility += Math.min(number(view.dpCount) + number(view.gyCount), 2) * 120;
    reason('JOKER_BRANCH_RESOURCE_COST');
  }
  if (family === 'effect-board-lock' || mode === 'board-lock') {
    const ours = number(own.securedPoints), theirs = number(enemy?.securedPoints);
    result.utility += ours >= number(own.goal) ? 2500 : ours > theirs ? 200 : -700;
    reason('BOARD_LOCK_RELATIVE_POSITION');
  }
  if (family === 'voltage') {
    // Optional free Start actions must compete with entering Action. Unknown
    // deck guesses are tied deterministically; never peek at a future draw.
    result.resourceScore = mode === 'five-refine' ? 560 - sumHand(view, action.sourceHandles) * 75 : 600 + result.utility;
    reason('VOLTAGE_OPTIONAL_START_VALUE');
  }
  if (family === 'sudden-death') {
    result.removed = rowPoints(hostile);
    result.utility += (number(own.securedPoints) - number(enemy?.securedPoints) + result.removed) * 120 - 500;
    reason('SUDDEN_DEATH_PUBLIC_LEAD_AFTER_SCRAP');
  }
  return result;
}
