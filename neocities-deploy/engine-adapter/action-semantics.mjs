// Project declared roles, never commands, tokens, hidden identities or outcomes.
// This boundary is shared by Node and the browser. It describes an already legal
// action; it does not enumerate actions or decide legality.
/** @param {*} action */
export function actionSemantics(action) {
  let node = action?.command;
  for (let depth = 0; depth < 6 && node; depth++) {
    if (node.submission || node.effect || node.advanced || node.copiedAction || !node.action) break;
    node = node.action;
  }
  if (!node) return undefined;
  const submission = node.submission;
  const declared = submission?.generatedEffect ?? submission?.generatedAdvanced ?? node.effect ?? node.advanced ?? node;
  const effect = declared.castEffect ?? declared.mimicAction ?? declared.copiedAction ?? declared;
  /** @param {*} value */
  const ids = value => (Array.isArray(value) ? value : typeof value === 'string' ? [value] : []).filter(id => typeof id === 'string');
  /** @type {{schemaVersion:number,effectKind:string|null,effectMode:string|null,targetPlayerId:string|null,row:string|null,scoreHandles:string[],acquireHandles:string[],discardHandles:string[],exileHandles:string[],effectTargetHandles:string[],effectHandles?:string[],topOrderHandles?:string[]}} */
  const result = {
    schemaVersion: 1,
    effectKind: typeof effect.kind === 'string' ? effect.kind : null,
    effectMode: typeof effect.mode === 'string' ? effect.mode : null,
    targetPlayerId: typeof effect.targetPlayerId === 'string' ? effect.targetPlayerId : null,
    row: ['pr', 'er'].includes(effect.row) ? effect.row : null,
    scoreHandles: ids(declared.scoreCardId ?? declared.bonusScoreCardId),
    acquireHandles: ids(declared.recoverCardId ?? declared.rummageCardIds ?? declared.takeCardIds),
    discardHandles: [...ids(node.discardCostCardId), ...ids(effect.discardCardIds ?? effect.discardCardId)],
    exileHandles: ids(declared.exileCardId),
    effectTargetHandles: ids(effect.targetCardId ?? effect.targetCardIds ?? effect.scrapTargetCardId),
  };
  if (action.family === 'private-choice') {
    const selected = ids(submission?.selectedCardIds ?? submission?.takeCardId);
    if (submission?.kind === 'core-rank7-assign') {
      result.scoreHandles = submission.mode === 'hand-and-score' ? selected.slice(1, 2) : submission.mode === 'score-only' ? selected : [];
      result.acquireHandles = submission.mode?.startsWith('hand-') ? selected.slice(0, 1) : [];
      result.effectHandles = submission.mode === 'hand-and-effect' ? selected.slice(1, 2) : submission.mode === 'effect-only' ? selected : [];
    }
    if (submission?.scoreInstead) result.scoreHandles = selected;
    if (submission?.kind === 'core-natural-four-reorder') {
      result.topOrderHandles = ids(submission.reorderCardIds);
      result.acquireHandles = submission.drawTop ? result.topOrderHandles.slice(0, 1) : [];
    }
    if (submission?.kind === 'core-bj-exile-recycle') result.topOrderHandles = selected.slice().reverse();
    if (submission?.kind === 'core-rank6-dig' && submission.mode === 'keep-all-discard') result.discardHandles = selected;
  }
  return Object.freeze(result);
}
