// Red Joker forensic decomposition — reads a forensic campaign's summaries.ndjson
// and produces per-mode RJ usage analytics: opportunities, selections, outcomes,
// context buckets, and policy segmentation. Read-only; no engine changes.
// Usage: node scripts/rj-forensic-analysis.mjs --in runtime/forensic-rj/baseline-v3 [--out runtime/forensic-rj/mode-decomposition.json]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const inDir = path.resolve(root, arg('--in', 'runtime/forensic-rj/baseline-v3'));
const outPath = arg('--out', null) ? path.resolve(root, arg('--out')) : null;

const lines = (await readFile(path.join(inDir, 'summaries.ndjson'), 'utf8')).trim().split('\n');
const summaries = lines.map(JSON.parse);

const COMPLETE = new Set(['NORMAL_VICTORY', 'EXHAUSTED_RESOLUTION', 'CANONICAL_DRAW']);

function rjKindOf(action) {
  if (!action) return 'none';
  if (action.family === 'effect-red-joker') return `effect:${action.mode}`;
  if (action.family === 'score') return 'score';
  if (action.family === 'scuttle') return 'scuttle';
  if (action.family === 'swap-bar') return `swap-bar:${action.mode}`;
  return `${action.family}:${action.mode ?? '?'}`;
}
const _RJ_KINDS = ['score', 'effect:hand-swap', 'effect:self-reset', 'effect:opponent-attack', 'effect:shuffle-reset', 'scuttle', 'swap-bar:face-down', 'swap-bar:face-up-draw'];

function phaseBucket(fullTurn, totalTurns) {
  if (!Number.isFinite(fullTurn) || !Number.isFinite(totalTurns) || totalTurns <= 0) return 'unknown';
  const t = fullTurn / totalTurns;
  return t < 0.34 ? 'early' : t < 0.67 ? 'mid' : 'late';
}

const stats = {};
const bump = (key, field, amount = 1) => { const s = stats[key] ??= { opportunities: 0, selections: 0, wins: 0, losses: 0, draws: 0, securedDeltaSum: 0, handDeltaSum: 0, boardDeltaSum: 0, margins: [], scoreMarginsTop: [] }; s[field] += amount; return s; };

const perMode = {};
const perPolicyMode = {};
const contextBuckets = {};
const selContexts = [];
let _rjSelectionRows = [];

for (const s of summaries) {
  const completed = COMPLETE.has(s.terminationReason);
  const winner = s.winner;
  const seatPolicy = Object.fromEntries(s.seatOrder.map((pid, i) => [pid, s.policyIds[i]]));
  const totalTurns = s.completedFullTurns;

  for (const d of s.rankDecisions ?? []) {
    const rjOptions = (d.legalActions ?? []).filter(a => a.rank === 'RJ');
    if (!rjOptions.length) continue;
    const actor = d.participantId;
    const policyId = seatPolicy[actor] ?? 'unknown';
    const won = winner === actor;
    const outcome = !completed ? 'abort' : winner === 'DRAW' ? 'draw' : won ? 'win' : 'loss';
    const kinds = rjOptions.map(rjKindOf);
    const kindsSet = new Set(kinds);
    const oppKey = [...kindsSet].sort().join('+');
    bump(`__opps__:${oppKey}`, 'opportunities');

    for (const k of kindsSet) {
      perMode[k] ??= { opportunities: 0, selections: 0, wins: 0, completedSelections: 0, scoreDeltaSum: 0, handDeltaSum: 0, boardDeltaSum: 0, scoreDeltas: [], margins: [] };
      perMode[k].opportunities += 1;
    }

    const selRank = d.rankAttribution?.primaryRank;
    const selKind = selRank === 'RJ' ? rjKindOf(d.action) : null;
    const sd = d.stateDelta ?? {};
    const actorDelta = Number(sd.securedPointDeltaByPlayer?.[actor] ?? 0);
    const handDelta = Number(sd.handDeltaByPlayer?.[actor] ?? 0);
    const boardDelta = Number(sd.boardPresenceDeltaByPlayer?.[actor] ?? 0);
    const scoreBefore = d.securedPoints ?? {};
    const oppId = Object.keys(scoreBefore).find(id => id !== actor) ?? (s.seatOrder.find(id => id !== actor));
    const scoreDiff = Number(scoreBefore[actor] ?? 0) - Number(scoreBefore[oppId] ?? 0);
    const ownHand = d.handCounts?.[actor] ?? null;
    const oppHand = oppId ? d.handCounts?.[oppId] ?? null : null;
    const phase = phaseBucket(d.fullTurn, totalTurns);

    if (selKind) {
      const m = perMode[selKind] ??= { opportunities: 0, selections: 0, wins: 0, completedSelections: 0, scoreDeltaSum: 0, handDeltaSum: 0, boardDeltaSum: 0, scoreDeltas: [], margins: [] };
      m.selections += 1;
      if (completed) {
        m.completedSelections += 1;
        if (outcome === 'win') m.wins += 1;
        m.margins.push(won ? s.scoreMargin : -s.scoreMargin);
      }
      m.scoreDeltaSum += actorDelta; m.handDeltaSum += handDelta; m.boardDeltaSum += boardDelta; m.scoreDeltas.push(actorDelta);
      const pm = (perPolicyMode[policyId] ??= {});
      const pmk = pm[selKind] ??= { selections: 0, wins: 0, completed: 0 };
      pmk.selections += 1; if (completed) { pmk.completed += 1; if (outcome === 'win') pmk.wins += 1; }
      const ctx = `${phase}|hand:${ownHand ?? '?'}|diff:${scoreDiff >= 5 ? 'ahead' : scoreDiff <= -5 ? 'behind' : 'close'}`;
      const cb = (contextBuckets[selKind] ??= {});
      cb[ctx] ??= { selections: 0, wins: 0, completed: 0 };
      cb[ctx].selections += 1; if (completed) { cb[ctx].completed += 1; if (outcome === 'win') cb[ctx].wins += 1; }
      selContexts.push({ matchId: s.matchId, decisionIndex: d.decisionIndex, actor, policyId, kind: selKind, outcome, scoreDiff, ownHand, oppHand, phase, fullTurn: d.fullTurn, totalTurns, scoreDelta: actorDelta, candidateScores: d.candidateScores ?? [] });
    }
  }
}

// Opportunity-only outcomes: frames where RJ was legal but a non-RJ action won out —
// used to compare observed outcomes of "use RJ" vs "decline RJ" (selection-biased,
// descriptive only).
const rjFramesOutcomes = { selectedEffect: { n: 0, wins: 0, completed: 0, scoreDeltaSum: 0 }, selectedScoreRJ: { n: 0, wins: 0, completed: 0 }, selectedOther: { n: 0, wins: 0, completed: 0 } };
for (const s of summaries) {
  const completed = COMPLETE.has(s.terminationReason);
  const winner = s.winner;
  for (const d of s.rankDecisions ?? []) {
    if (!(d.legalActions ?? []).some(a => a.rank === 'RJ')) continue;
    const actor = d.participantId;
    const won = winner === actor;
    const selRank = d.rankAttribution?.primaryRank;
    const fam = d.action?.family ?? '';
    let bucket;
    if (selRank === 'RJ' && fam === 'effect-red-joker') bucket = 'selectedEffect';
    else if (selRank === 'RJ' && fam === 'score') bucket = 'selectedScoreRJ';
    else bucket = 'selectedOther';
    const b = rjFramesOutcomes[bucket];
    b.n += 1;
    if (completed) { b.completed += 1; if (won) b.wins += 1; }
    b.scoreDeltaSum += Number(d.stateDelta?.securedPointDeltaByPlayer?.[actor] ?? 0);
  }
}

const fmtPct = (a, b) => b ? +(a / b).toFixed(4) : null;
const modeTable = Object.fromEntries(Object.entries(perMode).sort().map(([k, v]) => [k, {
  opportunities: v.opportunities,
  selections: v.selections,
  selectionRate: fmtPct(v.selections, v.opportunities),
  winRate: fmtPct(v.wins, v.completedSelections),
  avgSecuredDelta: v.selections ? +(v.scoreDeltaSum / v.selections).toFixed(3) : null,
  avgHandDelta: v.selections ? +(v.handDeltaSum / v.selections).toFixed(3) : null,
  avgBoardDelta: v.selections ? +(v.boardDeltaSum / v.selections).toFixed(3) : null,
  meanMargin: v.margins.length ? +(v.margins.reduce((a, b) => a + b, 0) / v.margins.length).toFixed(3) : null,
  marginStd: v.margins.length > 1 ? +Math.sqrt(v.margins.reduce((s, x) => s + (x - v.margins.reduce((a, b) => a + b, 0) / v.margins.length) ** 2, 0) / (v.margins.length - 1)).toFixed(3) : null,
  medianMargin: v.margins.length ? v.margins.slice().sort((a, b) => a - b)[Math.floor(v.margins.length / 2)] : null,
  worstDecileMargin: v.margins.length ? v.margins.slice().sort((a, b) => a - b)[Math.floor(v.margins.length * 0.1)] : null,
  bestDecileMargin: v.margins.length ? v.margins.slice().sort((a, b) => a - b)[Math.floor(v.margins.length * 0.9)] : null
}]));

const report = {
  generatedAt: new Date().toISOString(),
  source: inDir,
  matchCount: summaries.length,
  rjSelectionRows: selContexts.length,
  frameOutcomes: Object.fromEntries(Object.entries(rjFramesOutcomes).map(([k, v]) => [k, { frames: v.n, winRate: fmtPct(v.wins, v.completed), avgSecuredDelta: v.n ? +(v.scoreDeltaSum / v.n).toFixed(3) : null }])),
  modeTable,
  opportunityMix: Object.fromEntries(Object.entries(stats).filter(([k]) => k.startsWith('__opps__:')).map(([k, v]) => [k.slice(9), v.opportunities])),
  contextBuckets,
  perPolicyMode,
  selections: selContexts
};

if (outPath) { await mkdir(path.dirname(outPath), { recursive: true }); await writeFile(outPath, JSON.stringify(report, null, 2) + '\n'); }
console.log(JSON.stringify({ ...report, selections: `(${selContexts.length} rows, see --out for detail)` }, null, 2));
