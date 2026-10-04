import { hashCanonical } from '@intrilex/shared';

export const STRATEGY_NAMES = Object.freeze({ route: '/strategy', workspace: 'Strategy', title: 'FIELD MANUAL', technical: 'Strategy Intelligence' });
export const MATURITY_BUCKETS = Object.freeze(['OPENING', 'EARLY', 'MIDGAME', 'LATE', 'ENDGAME']);
export const STRATEGY_CONTRACTS = Object.freeze({ decision: 'DECISION_EVENT_V1', maturity: 'GAME_MATURITY_V1', claim: 'STRATEGY_CLAIM_V1', branch: 'STRATEGY_BRANCH_V1', guide: 'STRATEGY_GUIDE_V1', evidence: 'STRATEGY_EVIDENCE_V1' });
export const CLEAN_ENDINGS = Object.freeze(['NORMAL_VICTORY', 'EXHAUSTED_RESOLUTION', 'CANONICAL_DRAW']);
export const strategyFail = code => { throw new Error(code); };
const finite = value => Number.isFinite(value) ? value : null;
const clamp = value => Math.max(0, Math.min(1, value));
export function strategyCanonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return Object.is(value, -0) ? 0 : value;
  if (Array.isArray(value)) return value.map(strategyCanonical);
  if (value && Object.getPrototypeOf(value) === Object.prototype) return Object.fromEntries(Object.keys(value).sort().map(key => [key, strategyCanonical(value[key])]));
  return strategyFail('STRATEGY_NON_CANONICAL_VALUE');
}
export const strategyDigest = value => hashCanonical(strategyCanonical(value));
export function sealStrategy(contract, body) {
  const payload = strategyCanonical({ contract, ...body });
  return { ...payload, artifactId: `SI-${strategyDigest(payload)}` };
}
export function verifyStrategy(artifact, contract) {
  if (!artifact || artifact.contract !== contract) strategyFail('STRATEGY_VERSION_UNSUPPORTED');
  const { artifactId, ...body } = artifact;
  if (artifactId !== `SI-${strategyDigest(body)}`) strategyFail('STRATEGY_DIGEST_MISMATCH');
  return artifact;
}
function exactKeys(value, names) {
  if (!value || Object.keys(value).sort().join('|') !== [...names].sort().join('|')) strategyFail('STRATEGY_SCHEMA_FIELDS');
}
const contextKeys = ['phase','turn','miniTurnRoom','ownScore','opponentScore','scoreDifferential','ownGoalDistance','opponentGoalDistance','ownGoal','opponentGoal','ownHandSize','opponentHandCount','deckSize','graveyardSize','exileSize','ownBoardCards','opponentBoardCards','boardOccupancy','stackDepth','responseOpen','boardLocked','exhausted'];
export function decisionContext(view) {
  const own = view.own ?? {}, other = view.opponents?.[0] ?? {};
  const ownScore = finite(own.securedPoints), opponentScore = finite(other.securedPoints);
  const ownBoardCards = Array.isArray(own.pr)&&Array.isArray(own.er)?own.pr.length+own.er.length:null, opponentBoardCards = Array.isArray(other.pr)&&Array.isArray(other.er)?other.pr.length+other.er.length:null;
  return { phase: view.phase ?? 'UNKNOWN', turn: finite(view.fullTurnSequence), miniTurnRoom: finite(own.limits?.miniTurnsRemaining), ownScore, opponentScore,
    scoreDifferential: ownScore === null || opponentScore === null ? null : ownScore - opponentScore,
    ownGoalDistance: Number.isFinite(own.goal) && ownScore !== null ? own.goal - ownScore : null,
    opponentGoalDistance: Number.isFinite(other.goal) && opponentScore !== null ? other.goal - opponentScore : null,
    ownGoal: finite(own.goal), opponentGoal: finite(other.goal), ownHandSize: own.hand?.length ?? null, opponentHandCount: finite(other.handCount),
    deckSize: finite(view.dpCount), graveyardSize: finite(view.gyCount), exileSize: finite(view.exileCount), ownBoardCards, opponentBoardCards,
    boardOccupancy: ownBoardCards===null||opponentBoardCards===null?null:ownBoardCards+opponentBoardCards, stackDepth: view.stack?.length ?? null, responseOpen: Array.isArray(view.stack)?view.stack.length>0:null,
    boardLocked: view.boardLock===undefined?null:Boolean(view.boardLock), exhausted: view.exhausted===undefined?null:Boolean(view.exhausted) };
}
/** GAME_MATURITY_V1: public position, no future game length or winner. */
export function gameMaturity(context) {
  const progress = (score, goal) => score !== null && goal > 0 ? clamp(score / goal) : null;
  const values = [progress(context.ownScore, context.ownGoal), progress(context.opponentScore, context.opponentGoal)].filter(v => v !== null);
  const piles = [context.deckSize, context.graveyardSize, context.exileSize];
  const pileTotal = piles.every(Number.isFinite) ? piles.reduce((a,b) => a+b, 0) : 0;
  const components = { score: values.length ? Math.max(...values) : null,
    board: Number.isFinite(context.boardOccupancy) ? clamp(context.boardOccupancy / 12) : null,
    hand: Number.isFinite(context.ownHandSize) && Number.isFinite(context.opponentHandCount) ? clamp(1 - (context.ownHandSize + context.opponentHandCount) / 14) : null,
    depletion: pileTotal > 0 ? clamp(1 - context.deckSize / pileTotal) : null,
    turn: Number.isFinite(context.turn) ? clamp((context.turn - 1) / 24) : null };
  const weights = { score: 0.50, board: 0.10, hand: 0.15, depletion: 0.20, turn: 0.05 };
  const available = Object.keys(weights).filter(key => components[key] !== null);
  let score = available.length ? available.reduce((n,key) => n + components[key] * weights[key], 0) / available.reduce((n,key) => n + weights[key], 0) : 0;
  // Public imminent victory / exhaustion is strategically late even on turn 8.
  if (components.score >= 0.9 || context.exhausted) score = Math.max(score, 0.85);
  else if (components.score >= 0.75) score = Math.max(score, 0.65);
  score = Math.round(clamp(score) * 1000000) / 1000000;
  return { contract: STRATEGY_CONTRACTS.maturity, score, bucket: MATURITY_BUCKETS[Math.min(4, Math.floor(score * 5))], components };
}
const featureKeys = ['immediateScore','immediatePoints','drawCount','draw','miniTurns','goalDelta','targetPointValue','sourcePointValue','pointValue','costCount','recycleCount','recoveryCount','anchorValue','risk','synergy'];
const candidateKeys = ['actionId','family','mode','timing','sourceCards','sourceRole','targetRole','subjects','features','policyScore','decomposition'];
function visibleCard(card) {
  if (!card || card.faceDown || card.faceDownTrap || card.identity === 'HIDDEN') return null;
  const identity = String(card.identity ?? '');
  const match = /^([A-Z][A-Z0-9]*|[1-9]\d*)([♣♦♥♠])$/u.exec(identity);
  if (match) return { rank: match[1], suit: match[2], identity };
  if (['RJ','BJ'].includes(identity)) return { rank: identity, suit: null, identity };
  return null;
}
export function normalizeStrategyAction(action, view, policyScores = []) {
  const refs = action.sourceHandles ?? action.sourceCardIds ?? [];
  const sources = refs.map(ref => visibleCard(typeof ref === 'string' ? view.knownCards?.[ref] : ref)).filter(Boolean);
  const sourceCards = [...new Map(sources.map(c => [c.identity,c])).values()].sort((a,b) => a.identity.localeCompare(b.identity));
  const handIds=new Set((view.own?.hand??[]).map(c=>typeof c==='string'?c:c.id));
  const boardIds=new Set([...(view.own?.pr??[]),...(view.own?.er??[])].map(c=>typeof c==='string'?c:c.id));
  const sourceRole=refs.length ? refs.every(ref=>handIds.has(typeof ref==='string'?ref:ref.id))?'OWN_HAND':refs.every(ref=>boardIds.has(typeof ref==='string'?ref:ref.id))?'OWN_BOARD':'AUTHORIZED_MIXED_OR_REVEALED' : 'NONE';
  const family = String(action.family ?? 'UNKNOWN'), mode = String(action.mode ?? 'UNKNOWN'), timing = String(action.timingClass ?? 'UNKNOWN');
  const subjects = [`family:${family}`, `mode:${family}:${mode}`, `timing:${timing}`, `mechanic:${family}:${mode}`];
  for (const c of sourceCards) { subjects.push(`rank:${c.rank}`, `card:${c.identity}`); if(c.suit) subjects.push(`suit:${c.suit}`); }
  if (['super','ultra','rank10','royal-marriage','queens-court','voltage','solo-wild','wild-sovereignty'].includes(family)) subjects.push(`combination:${family}`);
  const targetRefs = action.targetHandles ?? action.targetCardIds ?? [];
  const targetCards = targetRefs.map(ref => typeof ref === 'string' ? view.knownCards?.[ref] : ref).filter(Boolean);
  const targetRole = targetCards.length ? targetCards.every(c => c.controllerId === view.actorId) ? 'OWN_VISIBLE' : 'PUBLIC_OTHER' : targetRefs.length ? 'OPAQUE_LEGAL_TARGET' : 'NONE';
  const score = policyScores.find(s => s.actionId === action.actionId);
  return { actionId: action.actionId, family, mode, timing, sourceCards, sourceRole, targetRole, subjects: [...new Set(subjects)].sort(),
    features: Object.fromEntries(featureKeys.map(key => [key, finite(action.featureVector?.[key])])), policyScore: finite(score?.score),
    decomposition: score?.decomposition ? Object.fromEntries(Object.entries(score.decomposition).filter(([,value]) => Number.isFinite(value))) : null };
}
export function strategyDecisionDraft({ identity, actorId, seat, decisionOrdinal, authorizedView, legalActions, selectedActionId, policyScores = [], replayAnchor }) {
  const candidates = legalActions.map(action => normalizeStrategyAction(action, authorizedView, policyScores)).sort((a,b) => a.actionId.localeCompare(b.actionId));
  if (!candidates.some(a => a.actionId === selectedActionId)) strategyFail('STRATEGY_SELECTION_NOT_LEGAL');
  const context = decisionContext(authorizedView);
  return { schemaVersion: 1, informationScope: 'ACTOR_AUTHORIZED', identity: strategyCanonical(identity), actorId, seat, decisionOrdinal, context,
    maturity: gameMaturity(context), candidates, selectedActionId, legalSetDigest: strategyDigest(candidates.map(a => a.actionId)), replayAnchor,
    tiebreak: 'POLICY_DEFINED; action ID retained; no unobserved RNG cursor inferred' };
}
export function finishStrategyDecision(draft, outcomes) { return validateDecisionEvent(sealStrategy(STRATEGY_CONTRACTS.decision, { ...draft, outcomes })); }
export function validateDecisionEvent(event) {
  verifyStrategy(event, STRATEGY_CONTRACTS.decision);
  exactKeys(event, ['contract','artifactId','schemaVersion','informationScope','identity','actorId','seat','decisionOrdinal','context','maturity','candidates','selectedActionId','legalSetDigest','replayAnchor','tiebreak','outcomes']);
  if (event.schemaVersion !== 1 || event.informationScope !== 'ACTOR_AUTHORIZED' || ![1,2].includes(event.seat) || !Number.isSafeInteger(event.decisionOrdinal) || event.decisionOrdinal < 0) strategyFail('STRATEGY_INVALID_DECISION');
  exactKeys(event.identity, ['runId','gameOrdinal','masterSeed','derivedSeed','rulesProfile','fingerprint','eraId','purpose','policyId','policyVersion','checkpointId','opponentPolicyId','opponentCheckpointId','agentProfileId','profileHead']);
  if (!/^[a-f0-9]{64}$/.test(event.identity.fingerprint) || !event.identity.runId || !event.identity.rulesProfile || !event.identity.eraId || !Number.isSafeInteger(event.identity.gameOrdinal) || event.identity.gameOrdinal<0 || !Number.isInteger(event.identity.derivedSeed) || event.identity.derivedSeed<1 || event.identity.derivedSeed>0xffffffff) strategyFail('STRATEGY_IDENTITY_REQUIRED');
  exactKeys(event.context, contextKeys);
  if(event.actorId!==`P${event.seat}`)strategyFail('STRATEGY_ACTOR_SEAT_MISMATCH');
  for(const key of ['responseOpen','boardLocked','exhausted'])if(event.context[key]!==null&&typeof event.context[key]!=='boolean')strategyFail('STRATEGY_CONTEXT_INVALID');
  for (const key of contextKeys.filter(k => !['phase','responseOpen','boardLocked','exhausted'].includes(k))) if (event.context[key] !== null && !Number.isFinite(event.context[key])) strategyFail('STRATEGY_CONTEXT_INVALID');
  if (strategyDigest(event.maturity) !== strategyDigest(gameMaturity(event.context))) strategyFail('STRATEGY_MATURITY_MISMATCH');
  if (!Array.isArray(event.candidates) || !event.candidates.length || event.candidates.length > 20000 || new Set(event.candidates.map(a => a.actionId)).size !== event.candidates.length) strategyFail('STRATEGY_OPPORTUNITY_INVALID');
  for (const a of event.candidates) {
    exactKeys(a, candidateKeys); exactKeys(a.features, featureKeys);
    if(typeof a.actionId!=='string' || !a.actionId || !['OWN_HAND','OWN_BOARD','AUTHORIZED_MIXED_OR_REVEALED','NONE'].includes(a.sourceRole) || !['OWN_VISIBLE','PUBLIC_OTHER','OPAQUE_LEGAL_TARGET','NONE'].includes(a.targetRole) || a.decomposition!==null && Object.values(a.decomposition).some(v=>!Number.isFinite(v)))strategyFail('STRATEGY_CANDIDATE_INVALID');
    for (const c of a.sourceCards) { exactKeys(c,['rank','suit','identity']); if(strategyDigest(visibleCard(c)) !== strategyDigest(c)) strategyFail('STRATEGY_CARD_INVALID'); }
    const expected = [`family:${a.family}`,`mode:${a.family}:${a.mode}`,`timing:${a.timing}`,`mechanic:${a.family}:${a.mode}`,...a.sourceCards.flatMap(c => [`rank:${c.rank}`,`card:${c.identity}`,...(c.suit ? [`suit:${c.suit}`] : [])]),...(['super','ultra','rank10','royal-marriage','queens-court','voltage','solo-wild','wild-sovereignty'].includes(a.family) ? [`combination:${a.family}`] : [])];
    if (strategyDigest(a.subjects) !== strategyDigest([...new Set(expected)].sort()) || Object.values(a.features).some(v => v !== null && !Number.isFinite(v))) strategyFail('STRATEGY_SUBJECT_INVALID');
    if (a.policyScore !== null && !Number.isFinite(a.policyScore)) strategyFail('STRATEGY_SCORE_INVALID');
  }
  if (!event.candidates.some(a => a.actionId === event.selectedActionId) || event.legalSetDigest !== strategyDigest(event.candidates.map(a=>a.actionId))) strategyFail('STRATEGY_SELECTION_NOT_LEGAL');
  exactKeys(event.replayAnchor,['commandIndex','stateHash','initialStateHash','actionSequenceHash','finalStateHash']);
  if (!Number.isSafeInteger(event.replayAnchor.commandIndex) || event.replayAnchor.commandIndex < 0 || ['stateHash','initialStateHash','actionSequenceHash','finalStateHash'].some(k=>!/^[a-f0-9]{64}$/.test(event.replayAnchor[k]))) strategyFail('STRATEGY_ANCHOR_INVALID');
  exactKeys(event.outcomes,['immediateScoreDelta','immediateHandDelta','immediateBoardDelta','horizonScoreDifferentialDelta','horizonCensored','terminalWinner','terminalOwnScore','terminalOpponentScore','gameLength','terminationReason','clean']);
  for(const key of ['immediateScoreDelta','immediateHandDelta','immediateBoardDelta','terminalOwnScore','terminalOpponentScore','gameLength'])if(!Number.isFinite(event.outcomes[key]))strategyFail('STRATEGY_OUTCOME_INVALID');
  if(typeof event.outcomes.horizonCensored!=='boolean' || typeof event.outcomes.clean!=='boolean' || event.outcomes.horizonScoreDifferentialDelta!==null && !Number.isFinite(event.outcomes.horizonScoreDifferentialDelta) || !['P1','P2','DRAW','ABORTED'].includes(event.outcomes.terminalWinner))strategyFail('STRATEGY_OUTCOME_INVALID');
  if (event.outcomes.clean !== (CLEAN_ENDINGS.includes(event.outcomes.terminationReason) && ['P1','P2','DRAW'].includes(event.outcomes.terminalWinner))) strategyFail('STRATEGY_CLEAN_MISMATCH');
  return event;
}
export function decisionIdentity(run, plan, seat) {
  const checkpoints = plan.swapped ? [...run.checkpoints].reverse() : run.checkpoints;
  const snapshots = plan.swapped ? [...(run.arenaProfiles?.snapshots ?? [null,null])].reverse() : run.arenaProfiles?.snapshots ?? [null,null];
  return { runId: run.runId, gameOrdinal: plan.ordinal, masterSeed: run.config.seed, derivedSeed: plan.seed, rulesProfile: run.config.profileId,
    fingerprint: run.identity.fingerprint, eraId: run.strategyEraId ?? run.identity.fingerprint, purpose: run.researchPurpose ?? run.kind ?? run.config.kind,
    policyId: checkpoints[seat-1].policyId, policyVersion: checkpoints[seat-1].policyVersion, checkpointId: checkpoints[seat-1].checkpointId,
    opponentPolicyId: checkpoints[2-seat].policyId, opponentCheckpointId: checkpoints[2-seat].checkpointId,
    agentProfileId: snapshots[seat-1]?.profile?.agentProfileId ?? null, profileHead: snapshots[seat-1]?.profile?.headVersion ?? null };
}
export function createStrategyCapture(identities) {
  const drafts = [];
  return {
    before(args) { return strategyDecisionDraft({ ...args, identity: identities[args.seat-1] }); },
    after(draft, view) { const after=decisionContext(view); drafts.push({draft, after}); },
    finish({initialState,commands,finalStateHash,winner,terminationReason,finalScores,gameLength}) {
      const hashes = {initialStateHash:strategyDigest(initialState),actionSequenceHash:strategyDigest(commands),finalStateHash};
      return drafts.map(({draft,after},index) => {
        const horizon = drafts[index+3];
        const other = draft.seat === 1 ? 'P2' : 'P1';
        const nextMargin = horizon ? horizon.draft.actorId === draft.actorId ? horizon.draft.context.scoreDifferential : -horizon.draft.context.scoreDifferential : null;
        return finishStrategyDecision({...draft,replayAnchor:{...draft.replayAnchor,...hashes}}, {
          immediateScoreDelta: after.ownScore - draft.context.ownScore, immediateHandDelta: after.ownHandSize - draft.context.ownHandSize,
          immediateBoardDelta: after.ownBoardCards - draft.context.ownBoardCards,
          horizonScoreDifferentialDelta: nextMargin === null ? null : nextMargin - draft.context.scoreDifferential, horizonCensored: !horizon,
          terminalWinner:winner,terminalOwnScore:finalScores[draft.actorId],terminalOpponentScore:finalScores[other],gameLength,terminationReason,
          clean:CLEAN_ENDINGS.includes(terminationReason) && ['P1','P2','DRAW'].includes(winner) });
      });
    }
  };
}
