// meta-atlas.mjs — Meta Atlas V1 domain model.
//
// Pure, dependency-light analytics for the /atlas workspace: maps the tested
// policy population into a user-selected two-axis behavioral space, derives
// directional head-to-head matchup edges, population statistics, and a
// deterministic "why is this node here" explanation.
//
// Honesty contract (mirrors observatory-bridge.mjs):
//   - Metrics are computed only from fields the summaries actually retained.
//     Missing telemetry produces `null` (excluded with a reason), never 0.
//   - participants[].profileId on a summary is the RULES profile, not agent
//     identity. The Atlas entity is the observed policyId.
//   - Win-rate estimands use the canonical decisive cross-policy denominator
//     (winRateRecord / wilsonInterval from @intrilex/statistics/estimators).
//   - No clustering, embeddings, archetype inference, or causal language.
//
// Imported by apps/lab-web workspace code (bundled by esbuild) and by Node
// tests. Keep this module free of DOM and node:* imports.

import { wilsonInterval, winRateRecord } from '@intrilex/statistics/estimators';

export const ATLAS_SCHEMA_VERSION = '1.0.0';

// ── Small numeric helpers ────────────────────────────────────────────────
// Mirrors the quantile algorithm in @intrilex/statistics (linear
// interpolation). Kept local because statistics.mjs pulls in node:crypto and
// this module must stay browser-safe.
const numOr = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

export function quantile(values, q) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return null;
  const pos = (clean.length - 1) * q;
  const low = Math.floor(pos), high = Math.ceil(pos);
  if (low === high) return clean[low];
  return clean[low] * (high - pos) + clean[high] * (pos - low);
}

export function atlasDistribution(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return { count: 0, mean: null, median: null, p25: null, p75: null, min: null, max: null };
  return {
    count: clean.length,
    mean: clean.reduce((a, b) => a + b, 0) / clean.length,
    median: quantile(clean, 0.5),
    p25: quantile(clean, 0.25),
    p75: quantile(clean, 0.75),
    min: Math.min(...clean),
    max: Math.max(...clean),
  };
}

// ── Evidence tiers ───────────────────────────────────────────────────────
// Node bands reuse the evidence-honest confidence bands
// (@intrilex/statistics/evidence-honest: <10 very low, <30 low, <100 moderate,
// >=100 high). Edge bands reuse the matchup-heatmap conventions
// (observatory.js renderMatchupMatrix: TINY_SAMPLE_N=6, FULL_EVIDENCE_N=24),
// split into four documented steps.
export const NODE_EVIDENCE_TIERS = Object.freeze(['insufficient', 'very-low', 'low', 'moderate', 'high']);
export const EDGE_EVIDENCE_TIERS = Object.freeze(['insufficient', 'low', 'moderate', 'strong']);
export const EDGE_MIN_DECISIVE = 6;   // below this an edge is "insufficient"
export const EDGE_STRONG_DECISIVE = 24; // full-evidence cell convention

export function nodeEvidenceTier(games) {
  const n = numOr(games);
  if (n <= 0) return 'insufficient';
  if (n < 10) return 'very-low';
  if (n < 30) return 'low';
  if (n < 100) return 'moderate';
  return 'high';
}

export function edgeEvidenceTier(decisiveGames) {
  const n = numOr(decisiveGames);
  if (n < EDGE_MIN_DECISIVE) return 'insufficient';
  if (n < 15) return 'low';
  if (n < EDGE_STRONG_DECISIVE) return 'moderate';
  return 'strong';
}

export const EVIDENCE_TIER_LABELS = Object.freeze({
  'insufficient': 'Insufficient evidence',
  'very-low': 'Very low evidence',
  'low': 'Low evidence',
  'moderate': 'Moderate evidence',
  'high': 'High evidence',
  'strong': 'Strong evidence',
});

// ── Cohort scoping ───────────────────────────────────────────────────────
// Mirrors workspaces/observatory.js matchupCohorts(): propagated lab datasets
// pool several cohorts (one per batch-matrix manifest, one per standalone
// run) alongside certified rows. Scoping isolates one cohort so statistics
// never silently mix evidence populations.
export function atlasCohortKey(summary) {
  if (summary?.matrixId) return `matrix:${summary.matrixId}`;
  if (summary?.telemetryOrigin === 'EVOLUTION_LAB') return `lab:${summary.labRunId ?? 'unknown'}`;
  return 'certified';
}

export function atlasCohortLabel(key) {
  if (key === 'certified') return 'Certified corpus';
  const id = key.slice(key.indexOf(':') + 1);
  const shortId = id.length > 22 ? `${id.slice(0, 21)}…` : id;
  return key.startsWith('matrix:') ? `Batch matrix ${shortId}` : `Lab run ${shortId}`;
}

export function atlasCohorts(summaries) {
  const groups = new Map();
  for (const s of summaries ?? []) {
    const key = atlasCohortKey(s);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  return groups;
}

// ── PR/ER mechanic tag families ──────────────────────────────────────────
// Telemetry tags ending in -pr target the Point Row; -er target the Effect
// Row (clear-pr, four-exchange-pr, diamond-mimic-row-exchange-pr, jack-pr…).
// The membership rule is the tag suffix — no invented grouping.
const PR_TAG = /(^|-)pr$/;
const ER_TAG = /(^|-)er$/;

function tagFamilySum(counts, test) {
  let total = 0;
  for (const [tag, n] of Object.entries(counts ?? {})) if (test(tag)) total += numOr(n);
  return total;
}

// ── Per-policy stat accumulation ─────────────────────────────────────────
// A "game" for a policy is one participant row (one seat of one match), the
// same participation convention as buildPolicyFingerprints. Aborted matches
// still expose observed behavior, so behavioral counters accumulate over all
// participations; outcome counters are split by result.
function blankStats(policyId) {
  return {
    policyId,
    games: 0, matchIds: [],
    wins: 0, losses: 0, draws: 0, aborts: 0,
    selfPlayGames: 0,
    crossWins: 0, crossLosses: 0, crossDraws: 0,
    seat1Games: 0, seat1Wins: 0, seat2Games: 0, seat2Wins: 0,
    scoreFor: 0, scoreAgainst: 0,
    turns: 0,
    // Coverage counters: number of participant rows that actually carried the
    // field. An absent telemetry field contributes coverage 0 → the metric is
    // reported unavailable instead of silently zero.
    cover: {},
    sums: {},
    mechUse: {}, mechOpp: {},
  };
}

const SUM_FIELDS = [
  'decisionCount', 'responseOpportunityCount', 'responsePlayCount', 'responseDeclineCount',
  'miniTurnActionCount', 'exhaustedPassActionCount', 'counterDeclarationCount',
  'quickDeclarationCount', 'instantDeclarationCount', 'interruptDeclarationCount',
  'meaningfulResponseDecisionCount', 'advancedDecisionCount', 'voltageDecisionCount',
  'ultraDecisionCount', 'privateChoiceDecisionCount',
];

const isDrawRow = (row) => row.terminationReason === 'CANONICAL_DRAW' || row.winner === 'DRAW';
const isAbortRow = (row) => row.winner === 'ABORTED' || row.terminationReason === 'ABORTED';

/**
 * Accumulate per-policy statistics from campaign-style match summaries.
 * @param {Array<object>} summaries
 * @returns {Map<string, object>} policyId → stats
 */
export function buildPolicyStats(summaries) {
  const byPolicy = new Map();
  const statsFor = (policyId) => {
    if (!byPolicy.has(policyId)) byPolicy.set(policyId, blankStats(policyId));
    return byPolicy.get(policyId);
  };
  for (const row of summaries ?? []) {
    const policyIds = row?.policyIds ?? [];
    if (policyIds.length !== 2) continue;
    const selfPlay = row.isSelfPlay === true || policyIds[0] === policyIds[1];
    const draw = isDrawRow(row);
    const abort = isAbortRow(row);
    const participants = Array.isArray(row.participants) && row.participants.length === 2 ? row.participants : null;
    for (let seatIdx = 0; seatIdx < 2; seatIdx += 1) {
      const p = participants?.[seatIdx] ?? null;
      const policyId = p?.policyId ?? policyIds[seatIdx];
      if (policyId == null) continue;
      const s = statsFor(policyId);
      s.games += 1;
      if (row.matchId) s.matchIds.push(row.matchId);
      const seat = numOr(p?.seat, seatIdx + 1);
      if (seat === 1) s.seat1Games += 1; else s.seat2Games += 1;
      if (selfPlay) s.selfPlayGames += 1;
      const result = p?.result ?? (draw ? 'draw' : abort ? 'abort'
        : (row.seatOrder ?? []).indexOf(row.winner) === seatIdx ? 'win' : 'loss');
      if (result === 'win') {
        s.wins += 1; if (!selfPlay) s.crossWins += 1;
        if (seat === 1) s.seat1Wins += 1; else s.seat2Wins += 1;
      } else if (result === 'loss') {
        s.losses += 1; if (!selfPlay) s.crossLosses += 1;
      } else if (result === 'draw') {
        s.draws += 1; if (!selfPlay) s.crossDraws += 1;
      } else {
        s.aborts += 1;
      }
      s.turns += numOr(row.completedFullTurns);
      s.scoreFor += numOr(p?.scoreFor, seat === 1 ? numOr(row.finalScores?.P1) : numOr(row.finalScores?.P2));
      s.scoreAgainst += numOr(p?.scoreAgainst, seat === 1 ? numOr(row.finalScores?.P2) : numOr(row.finalScores?.P1));
      for (const field of SUM_FIELDS) {
        if (p && p[field] != null) {
          s.cover[field] = (s.cover[field] ?? 0) + 1;
          s.sums[field] = (s.sums[field] ?? 0) + numOr(p[field]);
        }
      }
      for (const [tag, n] of Object.entries(p?.mechanicCounts ?? {})) s.mechUse[tag] = (s.mechUse[tag] ?? 0) + numOr(n);
      for (const [tag, n] of Object.entries(p?.mechanicOpportunityCounts ?? {})) s.mechOpp[tag] = (s.mechOpp[tag] ?? 0) + numOr(n);
    }
  }
  for (const s of byPolicy.values()) {
    s.crossDecisive = s.crossWins + s.crossLosses;
    s.record = winRateRecord({ wins: s.crossWins, losses: s.crossLosses, draws: s.crossDraws, aborts: s.aborts });
  }
  return byPolicy;
}

const covered = (s, field) => numOr(s.cover?.[field]);
const sumField = (s, field) => numOr(s.sums?.[field]);
const rate = (num, den) => (den > 0 ? num / den : null);
const perGame = (s, field) => (covered(s, field) > 0 ? sumField(s, field) / s.games : null);
const mechRate = (s, use, opp) => (opp > 0 ? use / opp : null);

// ── Atlas metric registry ────────────────────────────────────────────────
// Structured metadata per axis-able metric. `extract(stats)` returns the
// metric value or null when the required evidence was not retained / not
// observed — the UI must exclude the node with a stated reason, never plot a
// fabricated zero.
export const ATLAS_METRIC_REGISTRY = Object.freeze({
  // ── Performance ──
  winRate: {
    id: 'winRate', label: 'Win Rate', axis: 'Win rate', unit: 'percent', category: 'performance',
    description: 'Cross-policy decisive win rate (self-play excluded). Wins / decisive cross-policy games.',
    source: 'participants[].result', higherIsBetter: true,
    extract: (s) => rate(s.crossWins, s.crossDecisive),
    unavailableReason: 'no decisive cross-policy games',
  },
  avgScoreMargin: {
    id: 'avgScoreMargin', label: 'Avg Score Differential', axis: 'Avg score differential', unit: 'points', category: 'performance',
    description: 'Mean (scoreFor − scoreAgainst) per participation across all retained matches.',
    source: 'participants[].scoreFor / scoreAgainst', higherIsBetter: true,
    extract: (s) => (s.games > 0 ? (s.scoreFor - s.scoreAgainst) / s.games : null),
  },
  avgScoreFor: {
    id: 'avgScoreFor', label: 'Avg Score For', axis: 'Avg score for', unit: 'points', category: 'performance',
    description: 'Mean terminal score per participation.',
    source: 'participants[].scoreFor', higherIsBetter: true,
    extract: (s) => (s.games > 0 ? s.scoreFor / s.games : null),
  },
  seat1WinRate: {
    id: 'seat1WinRate', label: 'Seat-1 Win Rate', axis: 'Seat-1 win rate', unit: 'percent', category: 'performance',
    description: 'Wins / games when seated first (all retained results, self-play included).',
    source: 'participants[].seat + result', higherIsBetter: true,
    extract: (s) => rate(s.seat1Wins, s.seat1Games),
    unavailableReason: 'never observed in seat 1',
  },
  seat2WinRate: {
    id: 'seat2WinRate', label: 'Seat-2 Win Rate', axis: 'Seat-2 win rate', unit: 'percent', category: 'performance',
    description: 'Wins / games when seated second (all retained results, self-play included).',
    source: 'participants[].seat + result', higherIsBetter: true,
    extract: (s) => rate(s.seat2Wins, s.seat2Games),
    unavailableReason: 'never observed in seat 2',
  },
  gamesPlayed: {
    id: 'gamesPlayed', label: 'Games Played', axis: 'Games played', unit: 'count', category: 'evidence',
    description: 'Participations (seat-games) retained in the active dataset.',
    source: 'participants[] rows', higherIsBetter: null,
    extract: (s) => s.games,
  },
  // ── Tempo ──
  miniTurnsPerGame: {
    id: 'miniTurnsPerGame', label: 'Mini-Turns / Game', axis: 'Mini-turn actions per game', unit: 'per-game', category: 'tempo',
    description: 'Mean mini-turn actions taken per game (policy activity level).',
    source: 'participants[].miniTurnActionCount',
    extract: (s) => perGame(s, 'miniTurnActionCount'),
    unavailableReason: 'mini-turn telemetry not retained',
  },
  miniTurnsPerTurn: {
    id: 'miniTurnsPerTurn', label: 'Mini-Turn Utilization', axis: 'Mini-turn actions per full turn', unit: 'per-turn', category: 'tempo',
    description: 'Mini-turn actions divided by the full turns those matches ran — how much of each turn the policy used.',
    source: 'miniTurnActionCount / completedFullTurns',
    extract: (s) => (covered(s, 'miniTurnActionCount') > 0 && s.turns > 0 ? sumField(s, 'miniTurnActionCount') / s.turns : null),
    unavailableReason: 'mini-turn telemetry not retained',
  },
  decisionsPerGame: {
    id: 'decisionsPerGame', label: 'Decisions / Game', axis: 'Policy decisions per game', unit: 'per-game', category: 'tempo',
    description: 'Mean policy decision frames per game.',
    source: 'participants[].decisionCount',
    extract: (s) => perGame(s, 'decisionCount'),
    unavailableReason: 'decision telemetry not retained',
  },
  matchLength: {
    id: 'matchLength', label: 'Avg Match Length', axis: 'Mean full turns per match', unit: 'per-game', category: 'tempo',
    description: 'Mean completed full turns of matches the policy participated in.',
    source: 'completedFullTurns',
    extract: (s) => (s.games > 0 ? s.turns / s.games : null),
  },
  exhaustedPassRate: {
    id: 'exhaustedPassRate', label: 'Exhausted Passes / Game', axis: 'Exhausted passes per game', unit: 'per-game', category: 'tempo',
    description: 'Forced passes (no legal mini-turn action) per game — how often the policy runs out of things to do.',
    source: 'participants[].exhaustedPassActionCount',
    extract: (s) => perGame(s, 'exhaustedPassActionCount'),
    unavailableReason: 'exhausted-pass telemetry not retained',
  },
  // ── Interaction ──
  responsePlayRate: {
    id: 'responsePlayRate', label: 'Response Engagement', axis: 'Response plays / opportunities', unit: 'percent', category: 'interaction',
    description: 'Response plays divided by response opportunities — how often the policy engages the response window when it can.',
    source: 'participants[].responsePlayCount / responseOpportunityCount',
    extract: (s) => rate(sumField(s, 'responsePlayCount'), sumField(s, 'responseOpportunityCount')),
    unavailableReason: 'no response opportunities observed',
  },
  responseDeclineRate: {
    id: 'responseDeclineRate', label: 'Response Decline Rate', axis: 'Response declines / opportunities', unit: 'percent', category: 'interaction',
    description: 'Response declines divided by response opportunities — how often the policy passes up the response window.',
    source: 'participants[].responseDeclineCount / responseOpportunityCount',
    extract: (s) => rate(sumField(s, 'responseDeclineCount'), sumField(s, 'responseOpportunityCount')),
    unavailableReason: 'no response opportunities observed',
  },
  counterRate: {
    id: 'counterRate', label: 'Counter Rate', axis: 'Counters / decision', unit: 'percent', category: 'interaction',
    description: 'Counter declarations per policy decision.',
    source: 'participants[].counterDeclarationCount / decisionCount',
    extract: (s) => rate(sumField(s, 'counterDeclarationCount'), sumField(s, 'decisionCount')),
    unavailableReason: 'counter telemetry not retained',
  },
  instantRate: {
    id: 'instantRate', label: 'Instant Rate', axis: 'Instants / decision', unit: 'percent', category: 'interaction',
    description: 'Instant declarations per policy decision.',
    source: 'participants[].instantDeclarationCount / decisionCount',
    extract: (s) => rate(sumField(s, 'instantDeclarationCount'), sumField(s, 'decisionCount')),
    unavailableReason: 'instant telemetry not retained',
  },
  prInteractionRate: {
    id: 'prInteractionRate', label: 'PR-Row Engagement', axis: 'PR-row mechanic use / opportunity', unit: 'percent', category: 'interaction',
    description: 'Uses of Point-Row-targeted mechanics (telemetry tags ending -pr) divided by recorded opportunities for those mechanics.',
    source: 'mechanicCounts / mechanicOpportunityCounts (*-pr tags)', needsOpportunities: true,
    extract: (s) => mechRate(s, tagFamilySum(s.mechUse, (t) => PR_TAG.test(t)), tagFamilySum(s.mechOpp, (t) => PR_TAG.test(t))),
    unavailableReason: 'no PR-row mechanic opportunities observed',
  },
  erInteractionRate: {
    id: 'erInteractionRate', label: 'ER-Row Engagement', axis: 'ER-row mechanic use / opportunity', unit: 'percent', category: 'interaction',
    description: 'Uses of Effect-Row-targeted mechanics (telemetry tags ending -er) divided by recorded opportunities for those mechanics.',
    source: 'mechanicCounts / mechanicOpportunityCounts (*-er tags)', needsOpportunities: true,
    extract: (s) => mechRate(s, tagFamilySum(s.mechUse, (t) => ER_TAG.test(t)), tagFamilySum(s.mechOpp, (t) => ER_TAG.test(t))),
    unavailableReason: 'no ER-row mechanic opportunities observed',
  },
  disruptRate: {
    id: 'disruptRate', label: 'Disrupt Rate', axis: 'Disrupt use / opportunity', unit: 'percent', category: 'interaction',
    description: 'Disrupt mechanic uses divided by recorded Disrupt opportunities.',
    source: 'mechanicCounts / mechanicOpportunityCounts (disrupt)', needsOpportunities: true,
    extract: (s) => mechRate(s, numOr(s.mechUse?.disrupt), numOr(s.mechOpp?.disrupt)),
    unavailableReason: 'no Disrupt opportunities observed',
  },
  // ── Resource ──
  drawRate: {
    id: 'drawRate', label: 'Draw Rate', axis: 'Draw use / opportunity', unit: 'percent', category: 'resource',
    description: 'Draw mechanic uses divided by recorded Draw opportunities.',
    source: 'mechanicCounts / mechanicOpportunityCounts (draw)', needsOpportunities: true,
    extract: (s) => mechRate(s, numOr(s.mechUse?.draw), numOr(s.mechOpp?.draw)),
    unavailableReason: 'no Draw opportunities observed',
  },
  privateChoiceDensity: {
    id: 'privateChoiceDensity', label: 'Private Choices / Game', axis: 'Private choices per game', unit: 'per-game', category: 'resource',
    description: 'Private-choice selections per game (hidden-information decision density).',
    source: 'participants[].privateChoiceDecisionCount',
    extract: (s) => perGame(s, 'privateChoiceDecisionCount'),
    unavailableReason: 'private-choice telemetry not retained',
  },
  // ── Strategic action behavior ──
  scoreFrequency: {
    id: 'scoreFrequency', label: 'Scoring Actions / Game', axis: 'Score actions per game', unit: 'per-game', category: 'behavioral',
    description: 'Score-family actions per game — how often the policy banks points.',
    source: 'mechanicCounts (score)',
    extract: (s) => (Object.keys(s.mechUse ?? {}).length > 0 ? numOr(s.mechUse.score) / s.games : null),
    unavailableReason: 'mechanic usage telemetry not retained',
  },
  scorePickRate: {
    id: 'scorePickRate', label: 'Score Pick Rate', axis: 'Score use / opportunity', unit: 'percent', category: 'behavioral',
    description: 'Score-family uses divided by recorded Score opportunities — takes points when able.',
    source: 'mechanicCounts / mechanicOpportunityCounts (score)', needsOpportunities: true,
    extract: (s) => mechRate(s, numOr(s.mechUse?.score), numOr(s.mechOpp?.score)),
    unavailableReason: 'no Score opportunities observed',
  },
  advancedFrequency: {
    id: 'advancedFrequency', label: 'Advanced / Game', axis: 'Advanced decisions per game', unit: 'per-game', category: 'behavioral',
    description: 'Advanced-mechanic decision frames per game.',
    source: 'participants[].advancedDecisionCount',
    extract: (s) => perGame(s, 'advancedDecisionCount'),
    unavailableReason: 'advanced-decision telemetry not retained',
  },
  ultraFrequency: {
    id: 'ultraFrequency', label: 'Ultra / Game', axis: 'Ultra declarations per game', unit: 'per-game', category: 'behavioral',
    description: 'Ultra declarations per game.',
    source: 'participants[].ultraDecisionCount',
    extract: (s) => perGame(s, 'ultraDecisionCount'),
    unavailableReason: 'ultra telemetry not retained',
  },
  voltageFrequency: {
    id: 'voltageFrequency', label: 'Voltage / Game', axis: 'Voltage declarations per game', unit: 'per-game', category: 'behavioral',
    description: 'Voltage trigger declarations per game.',
    source: 'participants[].voltageDecisionCount',
    extract: (s) => perGame(s, 'voltageDecisionCount'),
    unavailableReason: 'voltage telemetry not retained',
  },
});

export const ATLAS_METRIC_IDS = Object.freeze(Object.keys(ATLAS_METRIC_REGISTRY));
export function atlasMetric(id) { return ATLAS_METRIC_REGISTRY[id] ?? null; }

export const ATLAS_DEFAULT_X = 'miniTurnsPerGame';
export const ATLAS_DEFAULT_Y = 'winRate';

/** Format a metric value per the registry unit. */
export function formatAtlasMetric(value, metricId) {
  const def = typeof metricId === 'string' ? atlasMetric(metricId) : metricId;
  if (!def || value == null || !Number.isFinite(Number(value))) return '—';
  const v = Number(value);
  switch (def.unit) {
    case 'percent': return `${(v * 100).toFixed(1)}%`;
    case 'points': return `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
    case 'count': return String(Math.round(v));
    case 'per-turn': return v.toFixed(2);
    case 'per-game': return v.toFixed(2);
    default: return v.toFixed(2);
  }
}

/** Compact tick formatting for axes (differs from tooltip precision). */
export function formatAtlasTick(value, metricId) {
  const def = typeof metricId === 'string' ? atlasMetric(metricId) : metricId;
  if (!def || value == null || !Number.isFinite(Number(value))) return '';
  const v = Number(value);
  if (def.unit === 'percent') return `${Math.round(v * 100)}%`;
  if (def.unit === 'count') return String(Math.round(v));
  return Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1);
}

/**
 * Which metrics can be computed from a stats map at all — used to disable
 * registry entries before they become an axis (e.g. opportunity-normalized
 * metrics when the dataset retained no opportunity telemetry).
 * @param {Map<string,object>} stats
 * @param {boolean} hasOpportunityTelemetry
 * @returns {Array<{id:string, def:object, available:boolean, reason:string|null}>}
 */
export function metricAvailability(stats, { hasOpportunityTelemetry = true } = {}) {
  return ATLAS_METRIC_IDS.map((id) => {
    const def = ATLAS_METRIC_REGISTRY[id];
    if (def.needsOpportunities && !hasOpportunityTelemetry) {
      return { id, def, available: false, reason: 'dataset retained no mechanic opportunity telemetry' };
    }
    const any = [...(stats?.values() ?? [])].some((s) => def.extract(s) != null);
    return { id, def, available: any, reason: any ? null : (def.unavailableReason ?? 'metric not computable for any policy') };
  });
}

// ── Matchup edges ────────────────────────────────────────────────────────
/**
 * Directional head-to-head records between policy pairs, derived from
 * participant result rows. Self-play and aborted matches never produce an
 * edge; draws count toward games but not the decisive win rate.
 * @param {Array<object>} summaries
 * @returns {Array<object>} unordered pair records: {a,b,games,decisive,draws,
 *   aWins,bWins,winRate,advantage,wilson95,tier,seatA1,seatB1,balancedSeats,
 *   matchIds}
 */
export function buildMatchupEdges(summaries) {
  const pairs = new Map();
  for (const row of summaries ?? []) {
    const policyIds = row?.policyIds ?? [];
    if (policyIds.length !== 2 || policyIds[0] === policyIds[1]) continue;
    const participants = Array.isArray(row.participants) && row.participants.length === 2 ? row.participants : null;
    const seatOf = (idx) => numOr(participants?.[idx]?.seat, idx + 1);
    const resultOf = (idx) => participants?.[idx]?.result ?? (isDrawRow(row) ? 'draw' : isAbortRow(row) ? 'abort'
      : (row.seatOrder ?? []).indexOf(row.winner) === idx ? 'win' : 'loss');
    const [a, b] = [policyIds[0], policyIds[1]].sort();
    const key = `${a}${b}`;
    if (!pairs.has(key)) {
      pairs.set(key, { a, b, games: 0, decisive: 0, draws: 0, aWins: 0, bWins: 0, seatA1: 0, seatB1: 0, matchIds: [] });
    }
    const e = pairs.get(key);
    const r0 = resultOf(0), r1 = resultOf(1);
    if (r0 === 'abort' && r1 === 'abort') continue;
    e.games += 1;
    if (row.matchId) e.matchIds.push(row.matchId);
    if (seatOf(0) === 1) e.seatA1 += 1; else e.seatB1 += 1;
    if (r0 === 'draw' || r1 === 'draw') { e.draws += 1; continue; }
    const winnerIdx = r0 === 'win' ? 0 : r1 === 'win' ? 1 : -1;
    if (winnerIdx < 0) continue;
    e.decisive += 1;
    const winnerPolicy = policyIds[winnerIdx];
    if (winnerPolicy === e.a) e.aWins += 1; else e.bWins += 1;
  }
  return [...pairs.values()].map((e) => {
    const winRate = e.decisive > 0 ? e.aWins / e.decisive : null;
    return {
      ...e,
      winRate,
      wilson95: e.decisive > 0 ? wilsonInterval(e.aWins, e.decisive) : null,
      advantage: winRate == null ? null : winRate - 0.5,
      tier: edgeEvidenceTier(e.decisive),
      balancedSeats: e.seatA1 > 0 && e.seatB1 > 0,
    };
  }).sort((x, y) => (y.decisive - x.decisive) || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
}

// ── Collision handling ───────────────────────────────────────────────────
// Deterministic offsets for nodes sharing identical coordinates. Offsets are
// applied in PIXEL space by the renderer (never written back to data), in a
// fixed ring keyed by sorted-node order, and a faint halo marks the true
// shared coordinate.
export function collisionGroups(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

/**
 * Deterministic ring offsets for a collision group. Order is stable because
 * callers pass nodes in sorted order.
 * @param {number} size group size
 * @param {number} radiusPx ring radius in pixels
 */
export function collisionOffsets(size, radiusPx = 9) {
  if (size <= 1) return [{ dx: 0, dy: 0 }];
  const out = [];
  for (let i = 0; i < size; i += 1) {
    const angle = (Math.PI * 2 * i) / size - Math.PI / 2;
    out.push({ dx: Math.cos(angle) * radiusPx, dy: Math.sin(angle) * radiusPx });
  }
  return out;
}

// ── Deterministic identity colors ────────────────────────────────────────
export const ATLAS_IDENTITY_PALETTE = Object.freeze([
  '#5ad7e8', '#a78bfa', '#4fd387', '#f1bd5d', '#ee6cb7',
  '#5b9cf0', '#ee8f6b', '#68d391', '#f05d78', '#9aa7ff',
]);

export function identityColor(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) { h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0; }
  return ATLAS_IDENTITY_PALETTE[h % ATLAS_IDENTITY_PALETTE.length];
}

// ── Model assembly ───────────────────────────────────────────────────────
/**
 * Build the normalized Atlas model: plotted nodes, exclusions with reasons,
 * population statistics, and the matchup edge table — all computed over the
 * SAME filtered summary set so no metric silently uses a different
 * population.
 *
 * @param {object} opts
 * @param {Array<object>} opts.summaries - campaign-style match summaries
 * @param {string} opts.xMetricId - ATLAS_METRIC_REGISTRY id
 * @param {string} opts.yMetricId - ATLAS_METRIC_REGISTRY id
 * @param {number} [opts.minGames=1] - minimum participations to plot
 * @param {string} [opts.cohort='all'] - 'all' | 'certified' | 'lab:*' | 'matrix:*'
 * @returns {object} atlas model
 */
export function buildAtlasModel({ summaries, xMetricId, yMetricId, minGames = 1, cohort = 'all' } = {}) {
  const all = Array.isArray(summaries) ? summaries : [];
  const cohorts = atlasCohorts(all);
  const scoped = cohort === 'all' || !cohorts.has(cohort) ? all : cohorts.get(cohort);
  const xDef = atlasMetric(xMetricId) ?? atlasMetric(ATLAS_DEFAULT_X);
  const yDef = atlasMetric(yMetricId) ?? atlasMetric(ATLAS_DEFAULT_Y);
  const stats = buildPolicyStats(scoped);
  const edges = buildMatchupEdges(scoped);
  const hasOppTelemetry = scoped.some((s) => s?.mechanicOpportunityCounts && Object.keys(s.mechanicOpportunityCounts).length > 0)
    || [...stats.values()].some((s) => Object.keys(s.mechOpp).length > 0);

  const nodes = [];
  const excluded = [];
  for (const s of [...stats.values()].sort((a, b) => a.policyId.localeCompare(b.policyId))) {
    if (s.games < minGames) {
      excluded.push({ id: s.policyId, reason: `below minimum evidence filter (${s.games} of ${minGames} required games)`, games: s.games });
      continue;
    }
    const x = xDef.extract(s);
    const y = yDef.extract(s);
    if (x == null && y == null) {
      excluded.push({ id: s.policyId, reason: `${xDef.label} and ${yDef.label} unavailable (${xDef.unavailableReason ?? 'no evidence'})`, games: s.games });
      continue;
    }
    if (x == null) {
      excluded.push({ id: s.policyId, reason: `X metric unavailable — ${xDef.unavailableReason ?? 'no evidence'}`, games: s.games });
      continue;
    }
    if (y == null) {
      excluded.push({ id: s.policyId, reason: `Y metric unavailable — ${yDef.unavailableReason ?? 'no evidence'}`, games: s.games });
      continue;
    }
    nodes.push({
      id: s.policyId,
      x, y,
      stats: s,
      games: s.games,
      decisive: s.crossDecisive,
      winRate: s.record?.winRate ?? null,
      winWilson95: s.record?.wilson95 ?? null,
      evidence: nodeEvidenceTier(s.games),
      selfPlayGames: s.selfPlayGames,
      matchIds: s.matchIds,
    });
  }
  return {
    schemaVersion: ATLAS_SCHEMA_VERSION,
    xDef, yDef,
    nodes,
    excluded,
    edges,
    stats,
    cohorts: [...cohorts.keys()],
    matchCount: scoped.length,
    totalPolicies: stats.size,
    hasOpportunityTelemetry: hasOppTelemetry,
    metricAvailability: metricAvailability(stats, { hasOpportunityTelemetry: hasOppTelemetry }),
    population: {
      x: atlasDistribution(nodes.map((n) => n.x)),
      y: atlasDistribution(nodes.map((n) => n.y)),
    },
  };
}

// ── Position explanation ("why is this profile here?") ───────────────────
// Strictly deterministic: compares the node's axis values to population
// quartiles. Never asserts motive, causality, or strategy.
function medianBand(value, dist) {
  const { median, p25, p75, count } = dist ?? {};
  if (!Number.isFinite(value) || median == null || count < 2) return null;
  if (p75 != null && value >= p75 && p75 > median) return 'top quartile';
  if (p25 != null && value <= p25 && p25 < median) return 'bottom quartile';
  if (value > median) return 'above the population median';
  if (value < median) return 'below the population median';
  return 'at the population median';
}

/**
 * @param {object} node - atlas node
 * @param {object} model - atlas model (uses model.population + metric defs)
 * @returns {{x: string, y: string, summary: string}}
 */
export function explainPosition(node, model) {
  const { xDef, yDef, population } = model;
  const xBand = medianBand(node.x, population.x);
  const yBand = medianBand(node.y, population.y);
  const xText = xBand
    ? `${xDef.label} is ${formatAtlasMetric(node.x, xDef)} — ${xBand} (median ${formatAtlasMetric(population.x.median, xDef)})`
    : `${xDef.label} is ${formatAtlasMetric(node.x, xDef)}`;
  const yText = yBand
    ? `${yDef.label} is ${formatAtlasMetric(node.y, yDef)} — ${yBand} (median ${formatAtlasMetric(population.y.median, yDef)})`
    : `${yDef.label} is ${formatAtlasMetric(node.y, yDef)}`;
  const lower = (t) => t.charAt(0).toLowerCase() + t.slice(1);
  return {
    x: xText,
    y: yText,
    summary: `${node.id} sits here because its ${lower(xText)} and its ${lower(yText)}. Observed-measurement comparison only — not a claim about intent.`,
  };
}

// ── Comparison model ─────────────────────────────────────────────────────
export const ATLAS_COMPARISON_METRICS = Object.freeze([
  'winRate', 'gamesPlayed', 'avgScoreMargin', 'responsePlayRate',
  'miniTurnsPerGame', 'matchLength', 'advancedFrequency', 'ultraFrequency',
]);

/**
 * Side-by-side metric comparison rows for two nodes.
 * @returns {Array<{id,label,unit,a:number|null,b:number|null,delta:number|null}>}
 */
export function comparisonRows(nodeA, nodeB, model, extraIds = []) {
  const ids = [...new Set([model.xDef.id, model.yDef.id, ...ATLAS_COMPARISON_METRICS, ...extraIds])];
  return ids.map((id) => {
    const def = atlasMetric(id);
    if (!def) return null;
    const a = id === model.xDef.id ? nodeA.x : id === model.yDef.id ? nodeA.y : def.extract(nodeA.stats);
    const b = id === model.xDef.id ? nodeB.x : id === model.yDef.id ? nodeB.y : def.extract(nodeB.stats);
    const delta = Number.isFinite(a) && Number.isFinite(b) ? a - b : null;
    return { id, label: def.label, unit: def.unit, def, a, b, delta };
  }).filter(Boolean);
}

/**
 * Population percentile for a metric value across all policies with a
 * computable value (0..1). Returns null when fewer than 2 peers qualify.
 */
export function metricPercentile(model, metricId, value) {
  const def = atlasMetric(metricId);
  if (!def || !Number.isFinite(value)) return null;
  const peers = [...(model.stats?.values() ?? [])].map((s) => def.extract(s)).filter(Number.isFinite);
  if (peers.length < 2) return null;
  const below = peers.filter((p) => p < value).length;
  const tied = peers.filter((p) => p === value).length;
  return (below + tied / 2) / peers.length;
}

/** Head-to-head record between two policies from the model's edge table. */
export function headToHead(model, idA, idB) {
  const e = (model.edges ?? []).find((x) => (x.a === idA && x.b === idB) || (x.a === idB && x.b === idA));
  if (!e) return null;
  const aIsA = e.a === idA;
  return {
    games: e.games, decisive: e.decisive, draws: e.draws,
    wins: aIsA ? e.aWins : e.bWins,
    losses: aIsA ? e.bWins : e.aWins,
    winRate: e.decisive > 0 ? (aIsA ? e.aWins : e.bWins) / e.decisive : null,
    wilson95: e.decisive > 0 ? wilsonInterval(aIsA ? e.aWins : e.bWins, e.decisive) : null,
    tier: e.tier,
    seatBalance: aIsA ? { seat1: e.seatA1, seat2: e.games - e.seatA1 } : { seat1: e.seatB1, seat2: e.games - e.seatB1 },
    matchIds: e.matchIds,
  };
}
