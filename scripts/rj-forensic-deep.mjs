// Red Joker forensic deep-dive — replays campaign matches with command
// transcripts, reconstructs the omniscient state at every RJ-relevant decision,
// and measures:
//   - hand quality before/after RJ effect modes (omniscient; diagnostic only)
//   - per-action score traces for RJ modes vs alternatives
//   - paired counterfactual: selected RJ action vs best non-RJ alternative
//     (identical pre-decision state, shared continuation seeds, same policies)
//
// Usage:
//   node scripts/rj-forensic-deep.mjs --matches 100 [--rollouts 16] [--out runtime/forensic-rj/deep.json]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runPolicyMatch, deriveMatchSeed
} from '../packages/simulation-runtime/src/runtime.mjs';
import { attributeAction } from '../packages/simulation-runtime/src/rank-attribution.mjs';
import { scorePolicyAction } from '../packages/policies/src/scoring.mjs';
import { evaluateAction as _evaluateAction, handValue as _handValue } from '../packages/policies/src/action-evaluation.mjs';
import {
  createSimulationDecisionFrame, executeSimulationAction,
  strictPolicyView, authorityHashCanonical, parseIdentity
} from '../packages/engine-adapter/src/adapter.mjs';
import { hashCanonical } from '../packages/shared/src/canonical.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const matchCount = Number(arg('--matches', 100));
const rolloutCount = Number(arg('--rollouts', 16));
const outPath = path.resolve(root, arg('--out', 'runtime/forensic-rj/deep.json'));
const profileId = 'core-advanced-authority';

const exp = JSON.parse(await readFile(path.join(root, 'sample-data/autonomy/experiment.json'), 'utf8'));
const policyPairs = exp.policyPairs;
const experimentHash = exp.experimentHash;

// ── Omniscient hand-quality model (diagnostic only — full state access) ──
// Estimates strategic hand worth beyond raw count: scoring potential,
// counter/response inventory, anchor pieces, and recipe proximity.
function cardPoint(id, state) {
  const c = state.cards[id];
  return Number(c?.state?.pointValue ?? ({ A: 4, J: 3, Q: 2, K: 8, RJ: 5, BJ: 11 }[parseIdentity(c?.identity ?? '')?.rank] ?? 0));
}
function handQuality(handIds, state) {
  let points = 0, counterValue = 0, recipeValue = 0, flex = 0;
  const ranks = new Map(); const suitMap = new Map();
  for (const id of handIds) {
    const c = state.cards[id];
    const p = parseIdentity(c?.identity ?? '');
    const rank = p?.rank ?? '?', suit = p?.suit ?? null;
    points += cardPoint(id, state);
    ranks.set(rank, (ranks.get(rank) ?? 0) + 1);
    if (suit) { const key = suit; suitMap.set(key, [...(suitMap.get(key) ?? []), rank]); }
    if (rank === 'A') counterValue += 4;
    if (rank === '8') counterValue += 1.5;
    if (rank === 'K') counterValue += 3;
    if (rank === 'J') counterValue += 1.5;
    if (rank === '2') flex += 2; // wild copy
    if (rank === 'BJ') flex += 2;
    if (rank === 'RJ') flex += 1.5;
    if (rank === '10') flex += 1;
    if (rank === '9' || rank === 'Q') flex += 1;
  }
  for (const [, n] of ranks) if (n >= 2) recipeValue += n >= 3 ? 5 : 2.5; // same-rank supers/ultras
  for (const [, rs] of suitMap) {
    if (rs.includes('K') && rs.includes('Q')) recipeValue += 4; // royal marriage
    if (rs.filter(r => r === 'A').length && rs.length >= 2) recipeValue += 1.5;
  }
  return { total: +(points + counterValue + recipeValue + flex).toFixed(2), points, counterValue, recipeValue, flex, count: handIds.length };
}

function uint32(v) { return Number.parseInt(hashCanonical(v).slice(0, 8), 16) >>> 0 || 1; }

// ── Replay a match, collecting the state after every command ──
function replayStates(initialState, commands) {
  const states = [initialState];
  for (const cmd of commands) {
    const r = executeSimulationAction(states.at(-1), cmd);
    states.push(r.state);
  }
  return states;
}

// Map a decision to its command index by matching engineCommandHash.
function decisionCommandIndex(commands, engineCommandHash) {
  for (let i = 0; i < commands.length; i += 1) {
    if (authorityHashCanonical(commands[i]) === engineCommandHash) return i;
  }
  return -1;
}

const modeRows = [];
const counterfactuals = [];
const _traceRows = [];

for (let ordinal = 0; ordinal < matchCount; ordinal += 1) {
  const pair = policyPairs[ordinal % policyPairs.length];
  const swap = Math.floor(ordinal / policyPairs.length) % 2 === 1;
  const seatOrder = swap ? ['P2', 'P1'] : ['P1', 'P2'];
  const seed = deriveMatchSeed(experimentHash, ordinal);
  const { summary, decisions, replay } = runPolicyMatch({
    profileId, seed, seatOrder, policyIds: pair, decisionLimit: exp.safetyLimits?.maxPolicyDecisions ?? 3600,
    telemetryEnabled: true, replayMode: 'commands', includeReplay: true
  });

  const states = replayStates(replay.initialState, replay.commands);
  const seatPolicy = Object.fromEntries(seatOrder.map((pid, i) => [pid, pair[i]]));

  for (const d of summary.rankDecisions ?? []) {
    const rjLegal = (d.legalActions ?? []).filter(a => a.rank === 'RJ');
    if (!rjLegal.length) continue;
    const decision = decisions.find(x => x.decisionIndex === d.decisionIndex);
    if (!decision) continue;
    const ci = decisionCommandIndex(replay.commands, decision.engineCommandHash);
    if (ci < 0) continue;
    const preState = states[ci]; // state before the decision command
    const frame = createSimulationDecisionFrame(preState);
    if (frame.status !== 'PLAYER_DECISION_REQUIRED') continue;
    const actorId = frame.decisionActorId;
    const policyId = seatPolicy[actorId];
    const view = strictPolicyView(frame.state, actorId);
    const ctx = { actorId, authorizedView: view };

    const oppId = seatOrder.find(id => id !== actorId);
    const ownHand = frame.state.players[actorId].hand;
    const oppHand = frame.state.players[oppId].hand;
    const ownQ = handQuality(ownHand, frame.state);
    const oppQ = handQuality(oppHand, frame.state);
    const won = summary.winner === actorId;
    const completed = ['NORMAL_VICTORY', 'EXHAUSTED_RESOLUTION', 'CANONICAL_DRAW'].includes(summary.terminationReason);

    // Score every legal action (exact for strategic/tactical policies;
    // approximate-only for hybrix which adds internal layers — flagged).
    const isHybrix = policyId.startsWith('hybrix');
    const scored = frame.policyActions.map(pa => {
      const attrib = attributeAction(frame.state, pa, 'private');
      let score = null;
      try { score = scorePolicyAction(policyId, pa, ctx); } catch { /* policy id may not be a scoring id */ }
      return { actionId: pa.actionId, family: pa.family, mode: pa.mode, rank: attrib.primaryRank, score };
    }).sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));

    const selectedId = decision.actionId;
    const selRank = d.rankAttribution?.primaryRank;
    const selIsRJEffect = selRank === 'RJ' && d.action?.family === 'effect-red-joker';
    const selMode = d.action?.mode;

    // Post-state hand quality for RJ effect selections (actual deltas).
    // RJ declaration opens a response window; the swap/reset only materializes
    // at 'core-resolve-response-top', so measure the state after that command.
    let postQuality = null;
    if (selIsRJEffect) {
      let postIdx = -1;
      for (let j = ci + 1; j < Math.min(replay.commands.length, ci + 10); j += 1) {
        if (replay.commands[j]?.action?.action?.kind === 'core-resolve-response-top' || replay.commands[j]?.action?.kind === 'core-resolve-response-top') { postIdx = j + 1; break; }
      }
      const ps = postIdx >= 0 ? states[postIdx] : null;
      const interCmds = postIdx > 0 ? replay.commands.slice(ci + 1, postIdx - 1) : [];
      const responded = interCmds.some(c => {
        const k = c?.action?.action?.kind ?? c?.action?.kind;
        return k && k !== 'core-pass-priority' && k !== 'core-resolve-response-top';
      });
      if (ps) {
        postQuality = {
          ownAfter: handQuality(ps.players[actorId].hand, ps),
          oppAfter: handQuality(ps.players[oppId].hand, ps),
          dpAfter: ps.zones.dp.length, gyAfter: ps.zones.gy.length,
          responded
        };
      }
    }

    const row = {
      matchId: summary.matchId, ordinal, decisionIndex: d.decisionIndex, actorId, policyId,
      selectedFamily: d.action?.family, selectedMode: selMode, selectedRank: selRank, selectedIsRJEffect: selIsRJEffect,
      outcome: !completed ? 'abort' : summary.winner === 'DRAW' ? 'draw' : won ? 'win' : 'loss',
      scoreMargin: summary.scoreMargin, fullTurn: d.fullTurn, totalTurns: summary.completedFullTurns,
      secured: d.securedPoints, ownQ, oppQ, dp: frame.state.zones.dp.length, gy: frame.state.zones.gy.length,
      postQuality,
      scores: scored.slice(0, 12).map(s => ({ f: `${s.family}:${s.mode}`, r: s.rank, s: s.score === null ? null : +s.score.toFixed(1) })),
      scoringApproxOnly: isHybrix
    };
    modeRows.push(row);

    // ── Paired counterfactual ──
    // Branch A = focal action; Branch B = comparison action; identical
    // pre-decision state, shared continuation seeds, same policies.
    // Cases:
    //  (a) RJ selected (any play family): B = best non-RJ alternative.
    //  (b) RJ declined but an RJ EFFECT ranks top-3 under the acting policy's
    //      base scoring: A = best-scoring RJ effect, B = selected action.
    const baseScoringId = policyId === 'random-legal' ? 'value-tactical'
      : policyId.startsWith('hybrix')
        ? ({ rusher: 'score-rush-tactical', defender: 'control-tactical', trickster: 'tempo-tactical', sniper: 'value-tactical', support: 'value-tactical', tank: 'control-tactical', baseline: 'value-tactical' }[policyId.replace(/-hard|-easy|-nightmare$/, '').replace('hybrix-', '')] ?? 'value-tactical')
        : policyId;
    const selRankIsRJ = selRank === 'RJ';
    // (a) RJ selected → compare vs best non-RJ alternative.
    // (b) RJ declined but an RJ effect ranks top-3 → compare forced-RJ vs selected.
    let armA = null, armB = null, cfCase = null;
    if (selRankIsRJ) {
      const alt = frame.policyActions
        .map(pa => ({ pa, rank: attributeAction(frame.state, pa, 'private').primaryRank }))
        .filter(x => x.rank !== 'RJ')
        .map(x => ({ ...x, score: (() => { try { return scorePolicyAction(baseScoringId, x.pa, ctx); } catch { return -Infinity; } })() }))
        .sort((a, b) => b.score - a.score)[0];
      if (alt) {
        armA = { actionId: selectedId, label: `${d.action?.family}:${d.action?.mode}` };
        armB = { actionId: alt.pa.actionId, label: `${alt.pa.family}:${alt.pa.mode}`, altRank: alt.rank, altScore: +alt.score.toFixed(1) };
        cfCase = 'rj-selected';
      }
    } else {
      const rjEffects = scored.filter(s => s.family === 'effect-red-joker' && s.score !== null);
      const top3cut = scored[2]?.score ?? -Infinity;
      const bestRj = rjEffects[0];
      if (bestRj && bestRj.score >= top3cut && bestRj.score > 0) {
        armA = { actionId: bestRj.actionId, label: `${bestRj.family}:${bestRj.mode}`, altScore: +bestRj.score.toFixed(1) };
        armB = { actionId: selectedId, label: `${d.action?.family}:${d.action?.mode}`, altRank: selRank };
        cfCase = 'rj-declined-contender';
      }
    }
    if (armA && armB) {
      const aPost = executeSimulationAction(frame.state, frame.resolve(armA.actionId)).state;
      const bPost = executeSimulationAction(frame.state, frame.resolve(armB.actionId)).state;
      const armResults = { A: { wins: 0, margins: [], outcomes: [] }, B: { wins: 0, margins: [], outcomes: [] } };
      for (let r = 0; r < rolloutCount; r += 1) {
        const contSeed = uint32({ cf: 'rj', ordinal, decisionIndex: d.decisionIndex, rollout: r });
        for (const [arm, postState] of [['A', aPost], ['B', bPost]]) {
          try {
            const m = runPolicyMatch({ profileId, seed: contSeed, seatOrder, policyIds: pair, decisionLimit: 1800, telemetryEnabled: false, includeReplay: false, initialState: postState });
            const w = m.summary.winner === actorId;
            const margin = (m.summary.finalScores[actorId] ?? 0) - (m.summary.finalScores[oppId] ?? 0);
            armResults[arm].outcomes.push(w ? 'win' : m.summary.winner === 'DRAW' ? 'draw' : 'loss');
            armResults[arm].wins += w ? 1 : 0;
            armResults[arm].margins.push(margin);
          } catch (e) {
            armResults[arm].outcomes.push('error:' + (e.code ?? e.message));
          }
        }
      }
      counterfactuals.push({
        case: cfCase,
        matchId: summary.matchId, ordinal, decisionIndex: d.decisionIndex, policyId, mode: cfCase === 'rj-selected' ? selMode : armA.label.split(':')[1],
        armA: armA.label, armB: armB.label, armBRank: armB.altRank ?? null, armBScore: armB.altScore ?? armA.altScore ?? null,
        actualOutcome: row.outcome,
        winsA: armResults.A.wins, winsB: armResults.B.wins, rollouts: rolloutCount,
        meanMarginA: +(armResults.A.margins.reduce((a, b) => a + b, 0) / (armResults.A.margins.length || 1)).toFixed(2),
        meanMarginB: +(armResults.B.margins.reduce((a, b) => a + b, 0) / (armResults.B.margins.length || 1)).toFixed(2)
      });
    }
  }
}

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify({ experimentHash, profileId, matchCount, rolloutCount, counterfactualNote: 'paired continuation rollouts from identical post-action state; only the focal decision differs; seeds shared across arms', modeRows, counterfactuals }, null, 2) + '\n');

const effSel = modeRows.filter(r => r.selectedIsRJEffect);
console.log(JSON.stringify({
  rjOpportunityFrames: modeRows.length,
  rjEffectSelections: effSel.length,
  counterfactuals: counterfactuals.length,
  avgOwnHandQualityAtOpp: +(modeRows.reduce((s, r) => s + r.ownQ.total, 0) / (modeRows.length || 1)).toFixed(2),
  avgOppHandQualityAtOpp: +(modeRows.reduce((s, r) => s + r.oppQ.total, 0) / (modeRows.length || 1)).toFixed(2),
  out: outPath
}, null, 2));
