// Read-only diagnostic probe (Balance Check Pass). Does NOT modify engine, rules, or policies.
// Verifies: (1) core-score rejects 7 / 10♣ / BJ in Advanced+Unrestricted; (2) Sudden Death candidate
// in Unrestricted is enumerated with zero source cards and never ticks/wins; (3) default mini-turns.
import {
  createSimulationState, advanceSimulationToDecision, executeSimulationAction, RANK_REGISTRY
} from '../../../packages/engine-adapter/src/adapter.mjs';

function setup(profileId, seed = 4242) {
  return createSimulationState({ profileId, playerIds: ['P1', 'P2'], seatOrder: ['P1', 'P2'], seed });
}
function toAction(state) {
  let s = state;
  for (let i = 0; i < 10; i++) {
    const adv = advanceSimulationToDecision(s);
    s = adv.state ?? s;
    if (adv.status !== 'PLAYER_DECISION_REQUIRED') break;
    const enter = adv.legalActionFrame.actions.find((a) => a.family === 'phase');
    if (!enter) return { state: s, frame: adv.legalActionFrame };
    s = executeSimulationAction(s, enter.command).state;
  }
  return { state: s, frame: null };
}
function plant(state, playerId, identity) {
  // Move a card with the given identity from wherever it is into playerId's hand (state clone, probe-only).
  const s = structuredClone(state);
  const id = Object.keys(s.cards).find((k) => s.cards[k].identity === identity);
  const c = s.cards[id];
  for (const z of ['dp', 'gy', 'exile', 'swapBar']) { const i = s.zones[z].indexOf(id); if (i >= 0) s.zones[z].splice(i, 1); }
  for (const p of Object.values(s.players)) for (const row of ['hand', 'pr', 'er']) { const i = p[row].indexOf(id); if (i >= 0) p[row].splice(i, 1); }
  delete c.state.swapBarFaceDown; delete c.state.swapBarFaceUp;
  c.zone = `${playerId}_HAND`; c.controllerId = playerId; s.players[playerId].hand.push(id);
  return { state: s, id };
}

for (const profileId of ['core-advanced-authority', 'core-unrestricted-authority']) {
  console.log(`\n=== ${profileId} ===`);
  const { state: s0 } = toAction(setup(profileId));
  const actor = s0.activePlayerId;
  console.log('phase', s0.phase, 'active', actor, 'miniTurnsRemaining', s0.players[actor].limits.miniTurnsRemaining);
  for (const identity of ['7♣', '10♣', 'BJ', '8♣']) {
    const { state: s1, id } = plant(s0, actor, identity);
    const adv = advanceSimulationToDecision(s1);
    const scoreOffered = adv.legalActionFrame?.actions.some((a) => a.family === 'score' && a.sourceCardIds.includes(id));
    const r = executeSimulationAction(s1, { id: 'PROBE', type: 'RESOLVE_CORE_AUTHORITY_ACTION', actorId: actor, action: { kind: 'core-declare-primary', action: { kind: 'core-score', cardId: id } } });
    console.log(`${identity}: score-for-points offered=${scoreOffered} accepted=${r.accepted} code=${r.error?.code ?? '-'}`);
  }
  const adv = advanceSimulationToDecision(s0);
  const fams = {};
  for (const a of adv.legalActionFrame?.actions ?? []) fams[`${a.family}/${a.mode}`] = (fams[`${a.family}/${a.mode}`] ?? 0) + 1;
  console.log('opening legal action families:', JSON.stringify(fams));
  const sd = (adv.legalActionFrame?.actions ?? []).find((a) => a.family === 'sudden-death');
  if (sd) {
    console.log('SUDDEN DEATH offered: sources', sd.sourceCardIds, 'timing', sd.timingClass);
    let s = executeSimulationAction(s0, sd.command).state;
    console.log('  after declare: miniTurnsRemaining', s.players[actor].limits.miniTurnsRemaining, 'phase8.suddenDeath', JSON.stringify(s.metadata.phase8?.suddenDeath));
    // Play through turns with first legal action until winner or 12 FTs, tracking suddenDeath.remaining
    let ft = s.fullTurnSequence, guard = 0;
    while (s.winner === null && guard < 400 && s.fullTurnSequence < ft + 12) {
      const d = advanceSimulationToDecision(s); s = d.state ?? s;
      if (d.status !== 'PLAYER_DECISION_REQUIRED') break;
      const acts = d.legalActionFrame.actions;
      const pick = acts.find((a) => a.family === 'draw') ?? acts.find((a) => a.family === 'phase') ?? acts[0];
      s = executeSimulationAction(s, pick.command).state; guard++;
    }
    console.log('  after', s.fullTurnSequence - ft, 'FTs: winner', s.winner, 'suddenDeath', JSON.stringify(s.metadata.phase8?.suddenDeath), 'terminalReason', s.metadata.coreAuthority?.terminalReason ?? null);
  } else console.log('SUDDEN DEATH not offered');
}
console.log('\nRANK_REGISTRY 7 prPoints', RANK_REGISTRY['7'].prPoints, 'BJ', RANK_REGISTRY.BJ.prPoints);
