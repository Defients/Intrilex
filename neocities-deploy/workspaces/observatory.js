// ═══════════════════════════════════════════════════════════════
// workspaces/observatory.js — Consolidated workspace renderers:
//   Compare, Mechanics, Synergies, History, Replays, Traces
// ═══════════════════════════════════════════════════════════════

import { state, app, esc, fmt, pct, short, definitionList } from '../state.js?v=e2bd7e8507fa';
import { barChart, heatmap, donutChart, sparkline, lineChart, stackedBarChart, chartTableAlternative, sankeyFlow } from '../chart-toolkit.js?v=e2bd7e8507fa';
// IRX-C06: Use rerender bus instead of dynamic import('../app.js?v=e2bd7e8507fa') to break backedge
import { rerender } from '../rerender.js?v=e2bd7e8507fa';

// ── /compare ──────────────────────────────────────────────────────
export function renderCompare() {
  const o = state.observatory;
  const policies = o.policies ?? [];
  const selectedPolicy = state.selectedPolicy ?? policies[0]?.policyId;
  const rightPolicy = state.comparePolicyRight ?? policies.find(p => p.policyId !== selectedPolicy)?.policyId ?? selectedPolicy;
  const policyMap = Object.fromEntries(policies.map(p => [p.policyId, p]));
  const left = policyMap[selectedPolicy], right = policyMap[rightPolicy];
  const matchupHtml = renderMatchupMatrix();
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Policy Comparison</h2><p>Side-by-side policy metrics with uncertainty quantification</p></div><div class="toolbar"><select id="compare-left">${policies.map(p => `<option value="${esc(p.policyId)}" ${p.policyId === selectedPolicy ? 'selected' : ''}>${esc(p.policyId)}</option>`).join('')}</select><span>vs</span><select id="compare-right">${policies.map(p => `<option value="${esc(p.policyId)}" ${p.policyId === rightPolicy ? 'selected' : ''}>${esc(p.policyId)}</option>`).join('')}</select></div></div><div class="panel-body"><div class="grid two">${[left, right].map(p => p ? `<div>${definitionList([['Policy', p.policyId], ['Matches', p.matchCount], ['Win rate', pct(p.winRate)], ['Win rate 95% CI', p.winWilson95 ? `${pct(p.winWilson95[0])} to ${pct(p.winWilson95[1])}` : '—'], ['Avg score margin', p.avgScoreMargin?.toFixed(1)], ['Exhausted pass rate', pct(p.exhaustedPassRate)], ['Response play rate', pct(p.responsePlayRate)]])}</div>` : '<div class="notice warning">No data</div>').join('')}</div>${matchupHtml}</div></section>`;
  document.querySelector('#compare-left').onchange = e => { state.selectedPolicy = e.target.value; rerender(); };
  document.querySelector('#compare-right').onchange = e => { state.comparePolicyRight = e.target.value; rerender(); };
  bindChartToggle('#matchup-matrix-chart');
  // Depth II Phase 6: matchup cell → filtered history
  document.querySelectorAll('[data-policy-a][data-policy-b]').forEach(cell => {
    const handler = () => {
      const a = cell.getAttribute('data-policy-a');
      const b = cell.getAttribute('data-policy-b');
      // Filter history to matches where both policies played
      const summaries = state.observatory?.summaries ?? [];
      const matchIds = summaries
        .filter(s => (s.policyIds ?? []).includes(a) && (s.policyIds ?? []).includes(b))
        .map(s => s.matchId)
        .filter(Boolean);
      state.historyFilterMatchIds = matchIds.length > 0 ? matchIds : null;
      state.historyPage = 0;
      state.historySelectedMatch = null;
      location.hash = '#/history';
    };
    cell.onclick = handler;
    cell.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } };
  });
}

// ── Matchup matrix (Phase 4A) ─────────────────────────────────────
// Policy-vs-policy win-rate matrix computed client-side from
// state.observatory.summaries. For each decisive 2-player match, the
// winning policy is resolved from the winner seat label and accumulated
// into a pairwise win counter. Rendered as an SVG heatmap.
function computeMatchupMatrix(summaries) {
  const wins = {}; // wins[A][B] = number of matches A beat B
  const policiesSet = new Set();
  for (const s of summaries) {
    const pids = s.policyIds ?? [];
    if (pids.length !== 2) continue;
    const winner = resolveWinningPolicy(s, pids);
    if (!winner) continue;
    const loser = pids.find(p => p !== winner);
    if (!loser) continue;
    policiesSet.add(winner); policiesSet.add(loser);
    if (!wins[winner]) wins[winner] = {};
    wins[winner][loser] = (wins[winner][loser] ?? 0) + 1;
  }
  const policies = [...policiesSet].sort();
  return { wins, policies };
}

/**
 * Resolve the winning policy ID from a match summary.
 * Handles winner as 'P1'/'P2' seat label, numeric winningSeat (1/2),
 * seatOrder array, or a direct policy ID.
 * @param {object} s - match summary
 * @param {string[]} pids - policy IDs in seat order
 * @returns {string|null}
 */
function resolveWinningPolicy(s, pids) {
  const w = s.winner;
  if (w == null) {
    if (s.winningSeat != null) {
      const idx = Number(s.winningSeat) - 1;
      return pids[idx] ?? null;
    }
    return null;
  }
  if (pids.includes(w)) return w;
  if (w === 'P1') return pids[0] ?? null;
  if (w === 'P2') return pids[1] ?? null;
  if (Array.isArray(s.seatOrder)) {
    const idx = s.seatOrder.indexOf(w);
    if (idx >= 0) return pids[idx] ?? null;
  }
  return null;
}

export function renderMatchupMatrix() {
  const summaries = state.observatory?.summaries ?? [];
  const { wins, policies } = computeMatchupMatrix(summaries);
  if (policies.length < 2) {
    return `<div class="ix-chart-empty" data-testid="matchup-matrix-empty">No decisive 2-player matches available to compute a matchup matrix. Run a campaign with multiple policies.</div>`;
  }
  const n = policies.length;
  const cells = [];
  for (let r = 0; r < n; r += 1) {
    const row = [];
    for (let c = 0; c < n; c += 1) {
      if (r === c) { row.push([null, 'self']); continue; }
      const a = policies[r], b = policies[c];
      const aWins = wins[a]?.[b] ?? 0;
      const bWins = wins[b]?.[a] ?? 0;
      const total = aWins + bWins;
      if (total === 0) { row.push([null, 'no-data']); continue; }
      // Win rate of A (row) vs B (col). Symmetric: A-vs-B + B-vs-A = 1.
      const winRate = aWins / total;
      row.push([winRate, { aWins, bWins, total }]);
    }
    cells.push(row);
  }
  const colorScale = (v) => {
    if (v == null || !Number.isFinite(v)) return 'rgba(255,255,255,0.03)';
    // 0.5 = neutral (dark), >0.5 = green (A wins), <0.5 = red (B wins)
    const intensity = Math.abs(v - 0.5) * 2;
    const alpha = 0.15 + intensity * 0.7;
    return v >= 0.5 ? `rgba(79,211,135,${alpha.toFixed(3)})` : `rgba(240,93,120,${alpha.toFixed(3)})`;
  };
  const shortLabel = (p) => p.length > 14 ? p.slice(0, 13) + '…' : p;
  const svg = heatmap({
    rows: policies.map(shortLabel),
    cols: policies.map(shortLabel),
    cells,
    colorScale,
    cellSize: 38,
    title: 'Policy matchup matrix',
    ariaLabel: 'Heatmap of policy-vs-policy win rates; green indicates the row policy wins more often, red indicates the column policy wins more often',
    cellAttrs: (r, c, meta) => {
      if (r === c || !meta || meta.total === 0) return '';
      return ` data-policy-a="${esc(policies[r])}" data-policy-b="${esc(policies[c])}" data-testid="matchup-cell-${r}-${c}" role="button" tabindex="0"`;
    },
  });
  // Table alternative: show A, B, A-wins, B-wins, A win rate
  const tableRows = [];
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (r === c) continue;
      const a = policies[r], b = policies[c];
      const aWins = wins[a]?.[b] ?? 0;
      const bWins = wins[b]?.[a] ?? 0;
      const total = aWins + bWins;
      if (total === 0) continue;
      tableRows.push([a, b, aWins, bWins, ((aWins / total) * 100).toFixed(1) + '%']);
    }
  }
  const tableAlt = chartTableAlternative({
    headers: ['Policy A', 'Policy B', 'A wins', 'B wins', 'A win rate'],
    rows: tableRows,
    caption: 'Policy matchup win rates',
  });
  return `<details class="ix-chart-container" data-testid="matchup-matrix" id="matchup-matrix-chart" open><summary class="ix-chart-header"><h4>Matchup matrix (policy vs policy win rate)</h4><span class="footer-note">${policies.length} policies · green = row wins more, red = column wins more</span></summary>${svg}<button class="ix-chart-toggle" data-chart-toggle="matchup-matrix" aria-expanded="false">View as table</button><div class="ix-chart-table-alt" data-chart-table="matchup-matrix" hidden>${tableAlt}</div></details>`;
}

// ── Policy archetype clustering (Phase 4B) ────────────────────────
// Cluster policies by their behavioral fingerprint using a simple
// distance-based k-means (k=3) implemented inline (no deps). The
// fingerprint vector is [winRate, exhaustedPassRate, responsePlayRate,
// avgScoreMargin, decisionMargin]. Displayed as a donut chart of
// archetype distribution, a bar chart of archetype-average metrics,
// and a table of policies with their assigned archetype.
function policyFingerprint(p) {
  return [
    Number(p.winRate ?? 0),
    Number(p.exhaustedPassRate ?? 0),
    Number(p.responsePlayRate ?? 0),
    Number(p.avgScoreMargin ?? 0),
    Number(p.decisionMargin ?? 0),
  ];
}

function kMeansCluster(vectors, k = 3, iterations = 20) {
  if (vectors.length === 0) return { assignments: [], centroids: [] };
  const dim = vectors[0].length;
  const kk = Math.min(k, vectors.length);
  // Initialize centroids via k-means++-ish spread: pick first, then farthest
  const centroids = [];
  centroids.push([...vectors[0]]);
  while (centroids.length < kk) {
    let bestIdx = 0, bestDist = -1;
    for (let i = 0; i < vectors.length; i += 1) {
      let minD = Infinity;
      for (const c of centroids) {
        let d = 0;
        for (let d2 = 0; d2 < dim; d2 += 1) d += (vectors[i][d2] - c[d2]) ** 2;
        if (d < minD) minD = d;
      }
      if (minD > bestDist) { bestDist = minD; bestIdx = i; }
    }
    centroids.push([...vectors[bestIdx]]);
  }
  const assignments = new Array(vectors.length).fill(0);
  for (let iter = 0; iter < iterations; iter += 1) {
    // Assign
    let changed = false;
    for (let i = 0; i < vectors.length; i += 1) {
      let bestK = 0, bestD = Infinity;
      for (let kk2 = 0; kk2 < centroids.length; kk2 += 1) {
        let d = 0;
        for (let d2 = 0; d2 < dim; d2 += 1) d += (vectors[i][d2] - centroids[kk2][d2]) ** 2;
        if (d < bestD) { bestD = d; bestK = kk2; }
      }
      if (assignments[i] !== bestK) { assignments[i] = bestK; changed = true; }
    }
    // Update centroids
    const sums = Array.from({ length: centroids.length }, () => new Array(dim).fill(0));
    const counts = new Array(centroids.length).fill(0);
    for (let i = 0; i < vectors.length; i += 1) {
      counts[assignments[i]] += 1;
      for (let d2 = 0; d2 < dim; d2 += 1) sums[assignments[i]][d2] += vectors[i][d2];
    }
    for (let kk2 = 0; kk2 < centroids.length; kk2 += 1) {
      if (counts[kk2] > 0) {
        for (let d2 = 0; d2 < dim; d2 += 1) centroids[kk2][d2] = sums[kk2][d2] / counts[kk2];
      }
    }
    if (!changed && iter > 2) break;
  }
  return { assignments, centroids };
}

// Label archetypes by their centroid signature: high winRate + high scoreMargin
// = "Aggressive", high exhaustedPassRate + low responsePlayRate = "Control",
// otherwise "Hybrid".
function archetypeLabel(centroid) {
  const [winRate, exhaustedPass, responsePlay, scoreMargin] = centroid;
  if (scoreMargin > 5 || winRate > 0.55) return 'Aggressive';
  if (exhaustedPass > 0.4 || responsePlay < 0.2) return 'Control';
  return 'Hybrid';
}

export function renderPolicyArchetypes() {
  const policies = state.observatory?.policies ?? [];
  if (policies.length < 2) {
    return `<div class="ix-chart-empty" data-testid="archetype-empty">Not enough policy data to compute archetype clusters. Run a campaign with multiple policies.</div>`;
  }
  const vectors = policies.map(policyFingerprint);
  const { assignments, centroids } = kMeansCluster(vectors, 3);
  const labels = centroids.map(archetypeLabel);
  // Ensure unique labels (dedupe by appending index if collisions)
  const seen = {};
  const uniqueLabels = labels.map(l => { seen[l] = (seen[l] ?? 0) + 1; return seen[l] > 1 ? `${l} ${seen[l]}` : l; });
  // Donut chart of archetype distribution
  const clusterCounts = {};
  for (const a of assignments) clusterCounts[uniqueLabels[a]] = (clusterCounts[uniqueLabels[a]] ?? 0) + 1;
  const donutSegments = Object.entries(clusterCounts).map(([label, count]) => ({ label, value: count }));
  const donutSvg = donutChart({ segments: donutSegments, size: 180, title: 'Policy archetype distribution', ariaLabel: 'Donut chart of policy archetype distribution' });
  // Bar chart of archetype-average win rates
  const archAvg = {};
  for (let i = 0; i < policies.length; i += 1) {
    const k = assignments[i];
    const label = uniqueLabels[k];
    if (!archAvg[label]) archAvg[label] = { winRateSum: 0, count: 0 };
    archAvg[label].winRateSum += Number(policies[i].winRate ?? 0);
    archAvg[label].count += 1;
  }
  const barItems = Object.entries(archAvg).map(([label, v]) => ({
    label,
    value: v.count > 0 ? v.winRateSum / v.count : 0,
  }));
  const barSvg = barChart({ items: barItems, maxValue: 1, width: 360, barHeight: 24, title: 'Archetype average win rate', ariaLabel: 'Bar chart of archetype average win rates' });
  // Table of policies with assigned archetype and distance to centroid
  const tableRows = policies.map((p, i) => {
    const k = assignments[i];
    const c = centroids[k];
    const v = vectors[i];
    let dist = 0;
    for (let d = 0; d < v.length; d += 1) dist += (v[d] - c[d]) ** 2;
    return [p.policyId, uniqueLabels[k], Math.sqrt(dist).toFixed(3), pct(p.winRate)];
  });
  const tableAlt = chartTableAlternative({
    headers: ['Policy', 'Archetype', 'Distance to centroid', 'Win rate'],
    rows: tableRows,
    caption: 'Policy archetype assignments',
  });
  // Depth II Phase 6: interactive table with clickable rows for cross-workspace linking
  const interactiveTable = `<div class="table-wrap"><table class="data-table"><thead><tr><th>Policy</th><th>Archetype</th><th>Distance</th><th>Win rate</th></tr></thead><tbody>${policies.map((p, i) => {
    const k = assignments[i];
    const c = centroids[k];
    const v = vectors[i];
    let dist = 0;
    for (let d = 0; d < v.length; d += 1) dist += (v[d] - c[d]) ** 2;
    return `<tr class="clickable-row" data-archetype-policy="${esc(p.policyId)}" data-archetype-cluster="${k}"><td><b>${esc(p.policyId)}</b></td><td>${esc(uniqueLabels[k])}</td><td>${Math.sqrt(dist).toFixed(3)}</td><td>${pct(p.winRate)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
  return `<details class="ix-chart-container" data-testid="policy-archetypes" id="policy-archetypes-chart" open><summary class="ix-chart-header"><h4>Policy archetype clustering</h4><span class="footer-note">k-means (k=3) over behavioral fingerprint · ${policies.length} policies · click a policy to compare</span></summary><div class="grid two"><div>${donutSvg}</div><div>${barSvg}</div></div>${interactiveTable}<button class="ix-chart-toggle" data-chart-toggle="policy-archetypes" aria-expanded="false" style="margin-top:8px">View as table</button><div class="ix-chart-table-alt" data-chart-table="policy-archetypes" hidden>${tableAlt}</div></details>`;
}

// ── Tempo curve analysis (Phase 5A) ───────────────────────────────
// Average score accumulation rate over turn-count buckets, per policy.
// Uses state.observatory.summaries which contain completedFullTurns and
// scoreMargin per match. Rendered as a multi-series line chart.
function tempoBucket(turns) {
  if (turns == null || !Number.isFinite(Number(turns))) return null;
  const t = Number(turns);
  if (t <= 5) return '0-5';
  if (t <= 10) return '6-10';
  if (t <= 15) return '11-15';
  if (t <= 20) return '16-20';
  return '21+';
}

const TEMPO_BUCKETS = ['0-5', '6-10', '11-15', '16-20', '21+'];

export function renderTempoCurve() {
  const summaries = state.observatory?.summaries ?? [];
  const policies = state.observatory?.policies ?? [];
  if (summaries.length === 0 || policies.length === 0) {
    return `<div class="ix-chart-empty" data-testid="tempo-curve-empty">No match summaries available to compute a tempo curve. Run a campaign to populate this analysis.</div>`;
  }
  // Group matches by policy and turn-count bucket. A policy participates in
  // a match if it is in policyIds; its scoreMargin for that match is the
  // match's scoreMargin (signed from P1's perspective). For a 2-player match
  // we attribute +scoreMargin to policyIds[0] and -scoreMargin to policyIds[1].
  const buckets = {}; // buckets[policy][bucketLabel] = { sum, count }
  for (const s of summaries) {
    const pids = s.policyIds ?? [];
    if (pids.length < 2) continue;
    const b = tempoBucket(s.completedFullTurns);
    if (!b) continue;
    const margin = Number(s.scoreMargin ?? 0);
    for (let i = 0; i < pids.length; i += 1) {
      const pid = pids[i];
      if (!buckets[pid]) buckets[pid] = {};
      if (!buckets[pid][b]) buckets[pid][b] = { sum: 0, count: 0 };
      const signed = i === 0 ? margin : -margin;
      buckets[pid][b].sum += signed;
      buckets[pid][b].count += 1;
    }
  }
  const palette = ['#4fd387', '#5ad7e8', '#a78bfa', '#f1bd5d', '#f0786f', '#7dd3fc', '#fbbf24', '#34d399'];
  const series = policies.map((p, i) => {
    const pid = p.policyId ?? p;
    const b = buckets[pid] ?? {};
    const values = TEMPO_BUCKETS.map(label => {
      const entry = b[label];
      return entry && entry.count > 0 ? entry.sum / entry.count : null;
    });
    // Filter out policies with no data at all
    const hasData = values.some(v => v != null);
    if (!hasData) return null;
    // Replace nulls with 0 for the line chart (gaps become flat)
    return { label: pid, values: values.map(v => v ?? 0), color: palette[i % palette.length] };
  }).filter(Boolean);
  if (series.length === 0) {
    return `<div class="ix-chart-empty" data-testid="tempo-curve-empty">No tempo data could be computed from the available summaries.</div>`;
  }
  const svg = lineChart({
    series,
    xLabels: TEMPO_BUCKETS,
    width: 560,
    height: 300,
    title: 'Tempo curve — mean score margin by turn-count bucket',
    ariaLabel: 'Line chart of mean score margin per policy across turn-count buckets',
  });
  // Table alternative
  const tableRows = series.map(s => [s.label, ...s.values.map(v => v.toFixed(2))]);
  const tableAlt = chartTableAlternative({
    headers: ['Policy', ...TEMPO_BUCKETS],
    rows: tableRows,
    caption: 'Mean score margin by turn-count bucket per policy',
  });
  return `<details class="ix-chart-container" data-testid="tempo-curve" id="tempo-curve-chart" open><summary class="ix-chart-header"><h4>Tempo curve</h4><span class="footer-note">Mean score margin by turn-count bucket per policy · ${series.length} policies</span></summary>${svg}<button class="ix-chart-toggle" data-chart-toggle="tempo-curve" aria-expanded="false">View as table</button><div class="ix-chart-table-alt" data-chart-table="tempo-curve" hidden>${tableAlt}</div></details>`;
}

// ── Opening move patterns (Phase 5B) ──────────────────────────────
// Analyze the first 3 decisions of each match from decision trace data.
// For each policy, compute the frequency of each action type in the first
// 3 decisions, the most common opening sequences (top 5), and an opening
// aggression score (ratio of offensive vs defensive first moves).
// Displayed as a stacked bar chart of first-move action distribution per
// policy, plus a table of top opening sequences.
export async function renderOpeningPatterns() {
  const summaries = state.observatory?.summaries ?? [];
  if (summaries.length === 0) {
    return `<div class="ix-chart-empty" data-testid="opening-patterns-empty">No match summaries available. Run a campaign with decision traces enabled.</div>`;
  }
  // Load trace data lazily. state.traceIndex may not be loaded yet.
  let idx = state.traceIndex;
  if (!idx) {
    try {
      const { loadTraceIndex, loadTraceData } = await import('../data-loader.js?v=e2bd7e8507fa');
      idx = await loadTraceIndex();
      if (!idx || !idx.records) {
        return `<div class="ix-chart-empty" data-testid="opening-patterns-empty">No decision traces available. Run a campaign with decision traces enabled to analyze opening patterns.</div>`;
      }
      // Load trace data for the records
      const traceFiles = await Promise.all(idx.records.map(r => loadTraceData(r.matchId)));
      return _renderOpeningPatternsFromTraces(idx.records, traceFiles);
    } catch {
      return `<div class="ix-chart-empty" data-testid="opening-patterns-empty">Decision traces could not be loaded. Run a campaign with decision traces enabled.</div>`;
    }
  }
  // If traceIndex exists but trace data isn't preloaded, load it
  const { loadTraceData } = await import('../data-loader.js?v=e2bd7e8507fa');
  const traceFiles = await Promise.all(idx.records.map(r => loadTraceData(r.matchId)));
  return _renderOpeningPatternsFromTraces(idx.records, traceFiles);
}

function _renderOpeningPatternsFromTraces(records, traceFiles) {
  // Collect first-3 decisions per policy per match.
  // Each trace record has traces: [{ policyId, decisionId, action, turn, ... }]
  // We sort by turn/decisionId and take the first 3 per policy per match.
  const perPolicy = {}; // perPolicy[pid] = { actionCounts: {}, sequences: {}, firstMoveOffensive: 0, firstMoveDefensive: 0, totalMatches: 0 }
  for (let i = 0; i < records.length; i += 1) {
    const tf = traceFiles[i];
    if (!tf || !tf.traces) continue;
    const rec = records[i];
    const matchId = rec.matchId;
    // Group traces by policyId, sort by turn, take first 3
    const byPolicy = {};
    for (const t of tf.traces) {
      const pid = t.policyId ?? rec.policyId;
      if (!pid) continue;
      if (!byPolicy[pid]) byPolicy[pid] = [];
      byPolicy[pid].push(t);
    }
    for (const [pid, traces] of Object.entries(byPolicy)) {
      traces.sort((a, b) => (a.turn ?? 0) - (b.turn ?? 0) || String(a.decisionId ?? '').localeCompare(String(b.decisionId ?? '')));
      const first3 = traces.slice(0, 3);
      if (first3.length === 0) continue;
      if (!perPolicy[pid]) perPolicy[pid] = { actionCounts: {}, sequences: {}, firstMoveOffensive: 0, firstMoveDefensive: 0, totalMatches: 0 };
      const pp = perPolicy[pid];
      pp.totalMatches += 1;
      const seq = [];
      for (let j = 0; j < first3.length; j += 1) {
        const action = first3[j].action ?? {};
        const actionType = action.type ?? action.kind ?? action.actionType ?? 'unknown';
        pp.actionCounts[actionType] = (pp.actionCounts[actionType] ?? 0) + 1;
        seq.push(actionType);
        if (j === 0) {
          // Classify first move as offensive or defensive
          const off = isOffensiveAction(actionType, action);
          const def = isDefensiveAction(actionType, action);
          if (off) pp.firstMoveOffensive += 1;
          else if (def) pp.firstMoveDefensive += 1;
        }
      }
      const seqKey = seq.join(' → ');
      pp.sequences[seqKey] = (pp.sequences[seqKey] ?? 0) + 1;
    }
  }
  const policyIds = Object.keys(perPolicy).sort();
  if (policyIds.length === 0) {
    return `<div class="ix-chart-empty" data-testid="opening-patterns-empty">No decision traces with policy attribution were found. Run a campaign with decision traces enabled.</div>`;
  }
  // Stacked bar chart of first-move action type distribution per policy
  const allActionTypes = [...new Set(policyIds.flatMap(pid => Object.keys(perPolicy[pid].actionCounts)))].sort();
  const items = policyIds.map(pid => {
    const pp = perPolicy[pid];
    const total = Object.values(pp.actionCounts).reduce((s, c) => s + c, 0) || 1;
    const stack = allActionTypes.map((type, j) => ({
      label: type,
      value: (pp.actionCounts[type] ?? 0) / total,
      color: ['#4fd387', '#5ad7e8', '#a78bfa', '#f1bd5d', '#f0786f', '#7dd3fc'][j % 6],
    }));
    return { label: pid, stack };
  });
  const stackedSvg = stackedBarChart({
    items,
    width: 520,
    barHeight: 28,
    legendLabels: allActionTypes,
    title: 'Opening action distribution (first 3 decisions)',
    ariaLabel: 'Stacked bar chart of opening action type distribution per policy',
  });
  // Table of top opening sequences with frequency + aggression score
  const tableRows = [];
  for (const pid of policyIds) {
    const pp = perPolicy[pid];
    const firstTotal = pp.firstMoveOffensive + pp.firstMoveDefensive;
    const aggression = firstTotal > 0 ? pp.firstMoveOffensive / firstTotal : 0.5;
    const topSeqs = Object.entries(pp.sequences).sort((a, b) => b[1] - a[1]).slice(0, 5);
    for (const [seq, count] of topSeqs) {
      tableRows.push([pid, seq, count, ((count / pp.totalMatches) * 100).toFixed(1) + '%', aggression.toFixed(2)]);
    }
  }
  const tableAlt = chartTableAlternative({
    headers: ['Policy', 'Opening sequence', 'Count', 'Frequency', 'Aggression score'],
    rows: tableRows,
    caption: 'Top opening sequences per policy',
  });
  return `<details class="ix-chart-container" data-testid="opening-patterns" id="opening-patterns-chart" open><summary class="ix-chart-header"><h4>Opening move patterns</h4><span class="footer-note">First 3 decisions per policy · ${policyIds.length} policies</span></summary>${stackedSvg}<button class="ix-chart-toggle" data-chart-toggle="opening-patterns" aria-expanded="false">View as table</button><div class="ix-chart-table-alt" data-chart-table="opening-patterns" hidden>${tableAlt}</div></details>`;
}

/**
 * Classify an opening action as offensive. Heuristic based on action type.
 * @param {string} actionType
 * @param {object} action
 * @returns {boolean}
 */
function isOffensiveAction(actionType, action) {
  const t = String(actionType).toLowerCase();
  if (/score|capture|claim|slam|strike|attack|offensive/.test(t)) return true;
  if (action?.pointsScored != null && Number(action.pointsScored) > 0) return true;
  return false;
}

/**
 * Classify an opening action as defensive. Heuristic based on action type.
 * @param {string} actionType
 * @param {object} action
 * @returns {boolean}
 */
function isDefensiveAction(actionType, action) {
  const t = String(actionType).toLowerCase();
  if (/pass|block|defend|response|decline|defensive|hold/.test(t)) return true;
  if (action?.pointsScored != null && Number(action.pointsScored) <= 0 && /pass|decline/.test(t)) return true;
  return false;
}

// ── Endgame analysis (Phase 6A) ───────────────────────────────────
// Analyze late-game outcomes: termination reason distribution, score
// convergence (margin at end vs mid-game), and comeback rate (matches
// where the eventual winner was behind at the midpoint). Uses
// state.observatory.summaries. Rendered as a donut chart of termination
// reasons, a bar chart of comeback rate per policy, and a summary table.
export function renderEndgameAnalysis() {
  const summaries = state.observatory?.summaries ?? [];
  const policies = state.observatory?.policies ?? [];
  if (summaries.length === 0) {
    return `<div class="ix-chart-empty" data-testid="endgame-empty">No match summaries available for endgame analysis. Run a campaign to populate this analysis.</div>`;
  }
  // Termination reason distribution (donut)
  const reasonCounts = {};
  for (const s of summaries) {
    const reason = s.terminationReason ?? 'UNKNOWN';
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  }
  const reasonColors = ['#4fd387', '#5ad7e8', '#a78bfa', '#f1bd5d', '#f0786f', '#7dd3fc', '#fbbf24', '#34d399'];
  const donutSegments = Object.entries(reasonCounts).map(([label, value], i) => ({ label, value, color: reasonColors[i % reasonColors.length] }));
  const donutSvg = donutChart({ segments: donutSegments, size: 180, title: 'Termination reason distribution', ariaLabel: 'Donut chart of match termination reason distribution' });
  // Comeback rate per policy: a "comeback" is a match where the eventual
  // winner was behind at the midpoint. We approximate midpoint margin as
  // half the final margin (best we can do without per-turn scores), and
  // flag matches where the final margin changed sign relative to the
  // mid-game estimate. A more precise version would use per-turn score
  // arrays if available.
  const comebackStats = {}; // comebackStats[pid] = { comebacks, totalWins }
  for (const s of summaries) {
    const pids = s.policyIds ?? [];
    if (pids.length < 2) continue;
    const winner = resolveWinningPolicy(s, pids);
    if (!winner) continue;
    if (!comebackStats[winner]) comebackStats[winner] = { comebacks: 0, totalWins: 0 };
    comebackStats[winner].totalWins += 1;
    // Heuristic: if scoreMargin is small (< 10) and the match went long
    // (> 15 turns), classify as a comeback (close game won late).
    const margin = Math.abs(Number(s.scoreMargin ?? 0));
    const turns = Number(s.completedFullTurns ?? 0);
    if (margin > 0 && margin <= 10 && turns > 15) {
      comebackStats[winner].comebacks += 1;
    }
  }
  const comebackItems = Object.entries(comebackStats).map(([pid, st]) => ({
    label: pid,
    value: st.totalWins > 0 ? st.comebacks / st.totalWins : 0,
    color: '#a78bfa',
  }));
  const comebackSvg = comebackItems.length > 0
    ? barChart({ items: comebackItems, maxValue: 1, width: 420, barHeight: 22, title: 'Comeback rate per policy', ariaLabel: 'Bar chart of comeback rate per policy (close games won late)' })
    : '';
  // Summary table
  const tableRows = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).map(([reason, count]) => [reason, count, ((count / summaries.length) * 100).toFixed(1) + '%']);
  const tableAlt = chartTableAlternative({
    headers: ['Termination reason', 'Count', 'Frequency'],
    rows: tableRows,
    caption: 'Match termination reason distribution',
  });
  // Comeback table
  const comebackRows = Object.entries(comebackStats).map(([pid, st]) => [pid, st.comebacks, st.totalWins, st.totalWins > 0 ? ((st.comebacks / st.totalWins) * 100).toFixed(1) + '%' : '—']);
  const comebackTable = chartTableAlternative({
    headers: ['Policy', 'Comebacks', 'Total wins', 'Comeback rate'],
    rows: comebackRows,
    caption: 'Comeback rate per policy',
  });
  return `<details class="ix-chart-container" data-testid="endgame-analysis" id="endgame-analysis-chart" open><summary class="ix-chart-header"><h4>Endgame analysis</h4><span class="footer-note">${summaries.length} matches · termination reasons, comeback rate, score convergence</span></summary><div class="grid two"><div>${donutSvg}</div><div>${comebackSvg || '<div class="ix-chart-empty">No comeback data.</div>'}</div></div><button class="ix-chart-toggle" data-chart-toggle="endgame-reasons" aria-expanded="false">View termination table</button><div class="ix-chart-table-alt" data-chart-table="endgame-reasons" hidden>${tableAlt}</div><button class="ix-chart-toggle" data-chart-toggle="endgame-comebacks" aria-expanded="false" style="margin-top:8px">View comeback table</button><div class="ix-chart-table-alt" data-chart-table="endgame-comebacks" hidden>${comebackTable}</div></details>`;
}

// ── Aggregate action distribution (Depth II Phase 2) ─────────────
// Aggregate actionCounts, decisionFamilyCounts, actionModeCounts,
// timingClassCounts, eventTypeCounts, and responseActionCounts across
// all match summaries and display as donut/bar charts.
function aggregateCounts(summaries, field) {
  const totals = {};
  for (const s of summaries) {
    const counts = s[field];
    if (!counts || typeof counts !== 'object') continue;
    for (const [key, val] of Object.entries(counts)) {
      totals[key] = (totals[key] ?? 0) + Number(val ?? 0);
    }
  }
  return totals;
}

function countsToSegments(counts, palette) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: palette?.[i % palette.length] }));
}

function countsToBarItems(counts, maxItems = 15) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxItems)
    .map(([label, value]) => ({ label, value: Number(value) }));
}

export function renderActionDistribution() {
  const summaries = state.observatory?.summaries ?? [];
  if (summaries.length === 0) {
    return `<div class="ix-chart-empty" data-testid="action-distribution-empty">No match summaries available. Run a campaign to populate action distribution.</div>`;
  }
  const palette = ['#4fd387', '#5ad7e8', '#a78bfa', '#f1bd5d', '#f0786f', '#7dd3fc', '#fbbf24', '#34d399'];
  // Aggregate all count fields
  const actionModeCounts = aggregateCounts(summaries, 'actionModeCounts');
  const decisionFamilyCounts = aggregateCounts(summaries, 'decisionFamilyCounts');
  const timingClassCounts = aggregateCounts(summaries, 'timingClassCounts');
  const eventTypeCounts = aggregateCounts(summaries, 'eventTypeCounts');
  const responseActionCounts = aggregateCounts(summaries, 'responseActionCounts');
  // Action modes donut (top-level action types: score, pass, response, etc.)
  // Group actionModeCounts by the part before ':'
  const actionModeGrouped = {};
  for (const [key, val] of Object.entries(actionModeCounts)) {
    const group = key.includes(':') ? key.split(':')[0] : key;
    actionModeGrouped[group] = (actionModeGrouped[group] ?? 0) + val;
  }
  const actionModeDonut = donutChart({
    segments: countsToSegments(actionModeGrouped, palette),
    size: 180,
    title: 'Action mode distribution',
    ariaLabel: 'Donut chart of action mode distribution aggregated across all matches',
  });
  const actionModeTable = chartTableAlternative({
    headers: ['Action mode', 'Count'],
    rows: Object.entries(actionModeGrouped).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v]),
    caption: 'Action mode distribution (aggregated)',
  });
  // Decision families bar chart
  const decisionFamilyBar = barChart({
    items: countsToBarItems(decisionFamilyCounts, 20),
    width: 520,
    barHeight: 20,
    title: 'Decision family distribution',
    ariaLabel: 'Bar chart of decision family counts aggregated across all matches',
  });
  const decisionFamilyTable = chartTableAlternative({
    headers: ['Decision family', 'Count'],
    rows: Object.entries(decisionFamilyCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v]),
    caption: 'Decision family distribution (aggregated)',
  });
  // Timing classes donut
  const timingDonut = donutChart({
    segments: countsToSegments(timingClassCounts, palette),
    size: 180,
    title: 'Timing class distribution',
    ariaLabel: 'Donut chart of timing class distribution aggregated across all matches',
  });
  const timingTable = chartTableAlternative({
    headers: ['Timing class', 'Count'],
    rows: Object.entries(timingClassCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v]),
    caption: 'Timing class distribution (aggregated)',
  });
  // Top event types bar chart
  const eventTypeBar = barChart({
    items: countsToBarItems(eventTypeCounts, 15),
    width: 520,
    barHeight: 20,
    title: 'Top 15 event types',
    ariaLabel: 'Bar chart of top 15 event types by count aggregated across all matches',
  });
  const eventTypeTable = chartTableAlternative({
    headers: ['Event type', 'Count'],
    rows: Object.entries(eventTypeCounts).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => [k, v]),
    caption: 'Top 15 event types (aggregated)',
  });
  // Response action breakdown bar chart
  const responseBar = barChart({
    items: countsToBarItems(responseActionCounts, 15),
    width: 480,
    barHeight: 22,
    title: 'Response action breakdown',
    ariaLabel: 'Bar chart of response action counts aggregated across all matches',
  });
  const responseTable = chartTableAlternative({
    headers: ['Response action', 'Count'],
    rows: Object.entries(responseActionCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v]),
    caption: 'Response action breakdown (aggregated)',
  });
  return `<div data-testid="action-distribution">
<details class="ix-chart-container" data-testid="action-modes-chart" id="action-modes-chart" open><summary class="ix-chart-header"><h4>Action mode distribution</h4><span class="footer-note">Aggregated across ${summaries.length} matches</span></summary>${actionModeDonut}<button class="ix-chart-toggle" data-chart-toggle="action-modes" aria-expanded="false">View as table</button><div class="ix-chart-table-alt" data-chart-table="action-modes" hidden>${actionModeTable}</div></details>
<details class="ix-chart-container" data-testid="decision-families-chart" id="decision-families-chart" open><summary class="ix-chart-header"><h4>Decision family distribution</h4></summary>${decisionFamilyBar}<button class="ix-chart-toggle" data-chart-toggle="decision-families" aria-expanded="false">View as table</button><div class="ix-chart-table-alt" data-chart-table="decision-families" hidden>${decisionFamilyTable}</div></details>
<details class="ix-chart-container" data-testid="timing-classes-chart" id="timing-classes-chart" open><summary class="ix-chart-header"><h4>Timing class distribution</h4></summary>${timingDonut}<button class="ix-chart-toggle" data-chart-toggle="timing-classes" aria-expanded="false">View as table</button><div class="ix-chart-table-alt" data-chart-table="timing-classes" hidden>${timingTable}</div></details>
<details class="ix-chart-container" data-testid="event-types-chart" id="event-types-chart" open><summary class="ix-chart-header"><h4>Top 15 event types</h4></summary>${eventTypeBar}<button class="ix-chart-toggle" data-chart-toggle="event-types" aria-expanded="false">View as table</button><div class="ix-chart-table-alt" data-chart-table="event-types" hidden>${eventTypeTable}</div></details>
<details class="ix-chart-container" data-testid="response-actions-chart" id="response-actions-chart" open><summary class="ix-chart-header"><h4>Response action breakdown</h4></summary>${responseBar}<button class="ix-chart-toggle" data-chart-toggle="response-actions" aria-expanded="false">View as table</button><div class="ix-chart-table-alt" data-chart-table="response-actions" hidden>${responseTable}</div></details>
</div>`;
}

// ── /mechanics ────────────────────────────────────────────────────
const EVIDENCE_GRADE_RANK = { ROBUST: 4, SUPPORTED: 3, EXPLORATORY: 2, INSUFFICIENT: 1, strong: 4, moderate: 3, weak: 2, insufficient: 1 };

// ── Chart "View as table" toggle helper (Phase 6C) ────────────────
// Wires up the [data-chart-toggle] button inside a chart container so it
// shows/hides the tabular data alternative. The button's aria-expanded
// state is kept in sync for screen readers.
function bindChartToggle(selector) {
  const container = document.querySelector(selector);
  if (!container) return;
  const btn = container.querySelector('[data-chart-toggle]');
  const table = container.querySelector('[data-chart-table]');
  if (!btn || !table) return;
  btn.onclick = () => {
    const hidden = table.hasAttribute('hidden');
    if (hidden) {
      table.removeAttribute('hidden');
      btn.setAttribute('aria-expanded', 'true');
      btn.textContent = 'Hide table';
    } else {
      table.setAttribute('hidden', '');
      btn.setAttribute('aria-expanded', 'false');
      btn.textContent = 'View as table';
    }
  };
}
const MECHANIC_COLUMNS = [
  { key: 'mechanic', label: 'Mechanic', sort: m => m.displayName ?? m.mechanic, type: 'string' },
  { key: 'dimension', label: 'Dimension', sort: m => m.dimension ?? 'canonical-mechanic', type: 'string' },
  { key: 'selections', label: 'Selections', sort: m => m.selectionCount ?? 0, type: 'number' },
  { key: 'opportunities', label: 'Legal Opps', sort: m => m.legalOpportunityCount ?? 0, type: 'number' },
  { key: 'pickrate', label: 'Pick rate (legal)', sort: m => m.pickRateWhenLegal ?? -1, type: 'number' },
  { key: 'prevalence', label: 'Part. prev.', sort: m => m.participantPrevalence ?? m.matchUsageRate ?? 0, type: 'number' },
  { key: 'matchprev', label: 'Match prev.', sort: m => m.matchPrevalence ?? 0, type: 'number' },
  { key: 'winassoc', label: 'Win assoc.', sort: m => m.rawWinAssociation ?? m.outcomeAssociation ?? 0, type: 'number' },
  { key: 'adjwinassoc', label: 'Adj. win assoc.', sort: m => m.adjustedWinAssociation ?? 0, type: 'number' },
  { key: 'impact', label: 'Point impact', sort: m => m.actorPointImpact?.mean ?? m.immediatePointImpact?.mean ?? 0, type: 'number' },
  { key: 'evidence', label: 'Evidence', sort: m => EVIDENCE_GRADE_RANK[m.evidenceGrade] ?? 0, type: 'number' },
];

const DIMENSION_FILTERS = [
  { value: 'all', label: 'All dimensions' },
  { value: 'canonical-mechanic', label: 'Canonical Mechanics' },
  { value: 'action-family', label: 'Action Families' },
  { value: 'action-mode', label: 'Action Modes' },
  { value: 'rank-effect', label: 'Rank Effects' },
  { value: 'diagnostic', label: 'Diagnostics' },
];

// Phase 3B: build <option> elements for the rank filter from the mechanic set.
// Ranks are collected from rankAttribution / primaryRanks fields, falling back
// to the canonical 15-rank ladder so the dropdown is never empty.
function rankFilterOptions(mechanics, selected) {
  const fromMechanics = new Set();
  for (const m of mechanics) {
    const ranks = m.rankAttribution ?? m.primaryRanks ?? [];
    if (Array.isArray(ranks)) for (const r of ranks) fromMechanics.add(r);
  }
  const canonical = ['A','2','3','4','5','6','7','8','9','10','J','Q','K','RJ','BJ'];
  for (const r of canonical) fromMechanics.add(r);
  return [...fromMechanics].sort().map(r => `<option value="${esc(r)}" ${r === selected ? 'selected' : ''}>${esc(r)}</option>`).join('');
}

function renderPickRateCell(m) {
  const st = m.pickRateStatus;
  if (!st) return m.pickRateWhenLegal != null ? pct(m.pickRateWhenLegal) : 'N/A';
  if (st.status === 'available') return `<span title="${st.numerator}/${st.denominator}">${pct(st.value)}</span>`;
  if (st.status === 'zero-opportunities') return `<span class="metric-na" title="${esc(st.detail ?? '')}">0 opps</span>`;
  if (st.status === 'missing-telemetry') return `<span class="metric-na" title="${esc(st.detail ?? '')}">no telemetry</span>`;
  return 'N/A';
}

function renderWinAssocCell(m, field, statusField) {
  const st = m[statusField];
  if (m[field] != null) return `${(m[field] * 100).toFixed(1)} pp`;
  if (st?.status === 'insufficient-sample') return `<span class="metric-na" title="${esc(st.detail ?? '')}">insuff.</span>`;
  if (st?.status === 'model-failed') return `<span class="metric-na" title="${esc(st.detail ?? '')}">model fail</span>`;
  return '—';
}

function renderPointImpactCell(m) {
  const st = m.pointImpactStatus;
  if (m.actorPointImpact?.mean != null) return m.actorPointImpact.mean.toFixed(1);
  if (st?.status === 'available' && st.value === 0) return `<span title="Valid zero impact">0.0</span>`;
  if (st?.status === 'not-applicable') return `<span class="metric-na" title="${esc(st.detail ?? '')}">n/a</span>`;
  return '—';
}

function renderCampaignHealthBanner(o) {
  const h = o.campaignHealth;
  if (!h) return '';
  const legacy = o.legacySchema;
  const warnings = [];
  if (legacy) warnings.push(`<div class="notice warning"><strong>Legacy campaign:</strong> pick-rate and adjusted-outcome metrics require a rerun with opportunity telemetry enabled.</div>`);
  const oppGap = h.trackedEntities - h.entitiesWithOpportunityData;
  if (!legacy && oppGap > 0) warnings.push(`<div class="notice info"><strong>Opportunity telemetry incomplete:</strong> ${oppGap} of ${h.trackedEntities} entities lack legal-window records.</div>`);
  if (h.eligibleSynergyPairs > 0) warnings.push(`<div class="notice info">${h.successfullyModeledSynergyPairs} of ${h.eligibleSynergyPairs} eligible synergy pairs were successfully modeled.</div>`);
  if (h.unmappedDiagnostics > 0) warnings.push(`<div class="notice info">${h.unmappedDiagnostics} unmapped diagnostic tags — not displayed in canonical view.</div>`);
  const stats = `Tracked: ${h.trackedEntities} · Canonical: ${h.canonicalMechanics} · With pick rate: ${h.entitiesWithValidPickRate} · With adj. assoc.: ${h.entitiesWithAdjustedAssociation} · With point impact: ${h.entitiesWithPointImpact} · Synergy pairs: ${h.eligibleSynergyPairs}`;
  return `<div class="campaign-health">${warnings.join('')}<div class="health-stats">${esc(stats)}</div></div>`;
}

// ── Mechanics pick-rate bar chart (Phase 2A) ──────────────────────
// Collapsible bar chart panel showing the top 15 mechanics by pick rate
// (when legal). Bars are colored by evidence grade. Clicking a bar selects
// that mechanic (same as clicking a table row).
function renderMechanicsPickRateChart(mechanics) {
  const gradeColor = (g) => {
    const rank = EVIDENCE_GRADE_RANK[g] ?? 0;
    if (rank >= 3) return '#4fd387'; // SUPPORTED / ROBUST — green
    if (rank >= 2) return '#5ad7e8'; // EXPLORATORY — blue
    return '#f1bd5d';                // INSUFFICIENT — amber
  };
  const withPick = mechanics
    .filter(m => m.pickRateWhenLegal != null && Number.isFinite(Number(m.pickRateWhenLegal)))
    .map(m => ({ label: m.displayName ?? m.mechanic, value: Number(m.pickRateWhenLegal), color: gradeColor(m.evidenceGrade), mechanic: m.mechanic }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 15);
  if (withPick.length === 0) return '';
  const svg = barChart({
    items: withPick,
    maxValue: 1,
    width: 520,
    barHeight: 22,
    title: 'Top mechanics by pick rate (when legal)',
    ariaLabel: 'Bar chart of the top 15 mechanics by legal pick rate, colored by evidence grade',
  });
  const tableAlt = chartTableAlternative({
    headers: ['Mechanic', 'Pick rate (legal)', 'Evidence'],
    rows: withPick.map(i => [i.label, (i.value * 100).toFixed(1) + '%', '']),
    caption: 'Top mechanics by legal pick rate',
  });
  return `<details class="ix-chart-container" data-testid="mechanics-pickrate-chart" open><summary class="ix-chart-header"><h4>Pick-rate overview (top 15 by legal pick rate)</h4><span class="footer-note">Click a bar to inspect that mechanic</span></summary>${svg}<button class="ix-chart-toggle" data-chart-toggle="mechanics-pickrate" aria-expanded="false">View as table</button><div class="ix-chart-table-alt" data-chart-table="mechanics-pickrate" hidden>${tableAlt}</div></details>`;
}

// Fold card-specific four-guess-{rank}-{suit} variants into one "four-guess" row.
// They are the same voltage-guess action differing only by guessed card target.
function aggregateFourGuess(mechanics) {
  const variants = mechanics.filter(m => /^four-guess-/.test(m.mechanic));
  if (variants.length < 2) return mechanics;
  const others = mechanics.filter(m => !/^four-guess-/.test(m.mechanic));
  const totalSelections = variants.reduce((s, m) => s + (m.selectionCount ?? 0), 0);
  const totalSample = variants.reduce((s, m) => s + (m.sampleSize ?? 0), 0);
  const opportunityCount = variants[0]?.analysisUnitOpportunityCount ?? variants[0]?.matchOpportunityCount ?? 0;
  const matchOpportunityCount = variants[0]?.matchOpportunityCount ?? 0;
  const usageRate = opportunityCount > 0 ? totalSelections / opportunityCount : 0;
  const weightedAssoc = totalSample > 0
    ? variants.reduce((s, m) => s + (m.outcomeAssociation ?? 0) * (m.sampleSize ?? 0), 0) / totalSample
    : null;
  const gradeRank = { ROBUST: 4, SUPPORTED: 3, EXPLORATORY: 2, INSUFFICIENT: 1, strong: 4, moderate: 3, weak: 2, insufficient: 1 };
  const bestGrade = variants.reduce((best, m) =>
    (gradeRank[m.evidenceGrade] ?? 0) > (gradeRank[best] ?? 0) ? m.evidenceGrade : best, 'INSUFFICIENT');
  const aggregated = {
    mechanic: 'four-guess',
    displayName: 'four-guess (all variants)',
    category: variants[0]?.category ?? 'unknown',
    selectionCount: totalSelections,
    sampleSize: totalSample,
    matchOpportunityCount,
    analysisUnitOpportunityCount: opportunityCount,
    usageUnit: variants[0]?.usageUnit ?? 'match',
    matchUsageRate: usageRate,
    matchUsageWilson95: null,
    outcomeAssociation: weightedAssoc,
    outcomeAssociation95: null,
    immediatePointImpact: null,
    evidenceGrade: bestGrade,
    status: 'measured',
    registryVerified: variants.every(m => m.registryVerified),
    _aggregated: true,
    _variants: [...variants].sort((a, b) => (b.selectionCount ?? 0) - (a.selectionCount ?? 0)),
  };
  return [...others, aggregated];
}

// ── Quarantine ledger (Depth II Phase 4) ─────────────────────────
// Surface the quarantineLedger data (mechanics excluded from analysis
// with reasons) in the Mechanics Atlas as a clearly labelled section.
function renderQuarantineLedger(o) {
  const ledger = o.quarantineLedger ?? [];
  if (!Array.isArray(ledger) || ledger.length === 0) return '';
  // Group by reason
  const byReason = {};
  for (const entry of ledger) {
    const reason = entry.reason ?? 'Unknown';
    if (!byReason[reason]) byReason[reason] = [];
    byReason[reason].push(entry);
  }
  const reasonGroups = Object.entries(byReason).map(([reason, entries]) => {
    return `<div style="margin-bottom:12px"><h4 style="margin:0 0 4px;font-size:12px;color:var(--text-bright)">${esc(reason)} (${entries.length})</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>Tag</th><th>Status</th></tr></thead><tbody>${entries.map(e => `<tr><td class="mono">${esc(e.tag ?? '—')}</td><td><span class="status-badge warning">${esc(e.status ?? 'QUARANTINED')}</span></td></tr>`).join('')}</tbody></table></div></div>`;
  }).join('');
  return `<details class="ix-chart-container" data-testid="quarantine-ledger" style="margin-top:16px"><summary class="ix-chart-header"><h4>Quarantine ledger (${ledger.length} excluded mechanics)</h4><span class="footer-note">Mechanics excluded from the analysis pipeline</span></summary><div class="notice warning" style="margin-bottom:12px"><strong>These mechanics were excluded from the analysis pipeline.</strong> They are not measured because they lack registry entries or were flagged during validation.</div>${reasonGroups}</details>`;
}

export function renderMechanics() {
  const o = state.observatory;
  const raw = o.mechanics ?? [];
  const mechanics = aggregateFourGuess(raw);
  const selectedMechanic = state.selectedMechanic;
  if (selectedMechanic) {
    const m = mechanics.find(x => x.mechanic === selectedMechanic)
      ?? raw.find(x => x.mechanic === selectedMechanic);
    if (m) return m._aggregated ? renderAggregatedMechanicDetail(m) : renderMechanicDetail(m);
  }
  // Dimension filter — default to canonical-mechanic for the primary view
  const dimensionFilter = state.mechanicsDimensionFilter ?? 'canonical-mechanic';
  // Phase 3B: enhanced filtering — rank, evidence grade, min selections
  const rankFilter = state.mechanicsRankFilter ?? 'all';
  const evidenceFilter = state.mechanicsEvidenceFilter ?? 'all';
  const minSelections = Number(state.mechanicsMinSelections ?? 0);
  let filtered = dimensionFilter === 'all' ? mechanics : mechanics.filter(m => (m.dimension ?? 'canonical-mechanic') === dimensionFilter);
  if (rankFilter !== 'all') {
    filtered = filtered.filter(m => {
      const ranks = m.rankAttribution ?? m.primaryRanks ?? (m.mechanic && m.mechanic.includes(rankFilter) ? [rankFilter] : []);
      return Array.isArray(ranks) ? ranks.includes(rankFilter) : false;
    });
  }
  if (evidenceFilter !== 'all') {
    filtered = filtered.filter(m => (m.evidenceGrade ?? 'INSUFFICIENT') === evidenceFilter);
  }
  if (minSelections > 0) {
    filtered = filtered.filter(m => (m.selectionCount ?? 0) >= minSelections);
  }
  const original = [...filtered].sort((a, b) => (b.selectionCount ?? 0) - (a.selectionCount ?? 0));
  const sortCol = state.mechanicsSortColumn;
  const sortPhase = state.mechanicsSortPhase ?? 0;
  let sorted = original;
  if (sortPhase !== 0 && sortCol) {
    const col = MECHANIC_COLUMNS.find(c => c.key === sortCol);
    if (col) {
      sorted = [...original].sort((a, b) => {
        const va = col.sort(a), vb = col.sort(b);
        if (col.type === 'number') return sortPhase === 1 ? vb - va : va - vb;
        return sortPhase === 1 ? String(vb).localeCompare(String(va)) : String(va).localeCompare(String(vb));
      });
    }
  }
  const headerHtml = MECHANIC_COLUMNS.map(col => {
    const isActive = col.key === sortCol && sortPhase !== 0;
    const arrow = isActive ? (sortPhase === 1 ? ' <span class="sort-arrow" aria-hidden="true">▼</span>' : ' <span class="sort-arrow" aria-hidden="true">▲</span>') : '';
    const sortAttr = isActive ? (sortPhase === 1 ? 'aria-sort="descending"' : 'aria-sort="ascending"') : 'aria-sort="none"';
    return `<th data-sort-column="${col.key}" ${sortAttr} tabindex="0" role="button">${col.label}${arrow}</th>`;
  }).join('');
  const filterHtml = `<div class="ix-filter-toolbar" data-testid="mechanics-filter-toolbar"><label for="dimension-filter">Dimension:</label><select id="dimension-filter">${DIMENSION_FILTERS.map(f => `<option value="${f.value}" ${f.value === dimensionFilter ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}</select><label for="mechanics-rank-filter">Rank:</label><select id="mechanics-rank-filter"><option value="all" ${rankFilter === 'all' ? 'selected' : ''}>All ranks</option>${rankFilterOptions(mechanics, rankFilter)}</select><label for="mechanics-evidence-filter">Evidence:</label><select id="mechanics-evidence-filter"><option value="all" ${evidenceFilter === 'all' ? 'selected' : ''}>All</option><option value="ROBUST" ${evidenceFilter === 'ROBUST' ? 'selected' : ''}>ROBUST</option><option value="SUPPORTED" ${evidenceFilter === 'SUPPORTED' ? 'selected' : ''}>SUPPORTED</option><option value="EXPLORATORY" ${evidenceFilter === 'EXPLORATORY' ? 'selected' : ''}>EXPLORATORY</option><option value="INSUFFICIENT" ${evidenceFilter === 'INSUFFICIENT' ? 'selected' : ''}>INSUFFICIENT</option></select><label for="mechanics-min-selections">Min selections: <output id="mechanics-min-selections-out">${minSelections}</output></label><input type="range" id="mechanics-min-selections" min="0" max="${Math.max(...mechanics.map(m => m.selectionCount ?? 0), 100)}" step="10" value="${minSelections}"></div>`;
  const healthHtml = renderCampaignHealthBanner(o);
  const chartHtml = renderMechanicsPickRateChart(filtered);
  const quarantineHtml = renderQuarantineLedger(o);
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Mechanics Atlas</h2><p>Prevalence, pick rate, win association, and evidence by mechanic — ${filtered.length} of ${mechanics.length} entities</p></div>${filterHtml}</div><div class="panel-body">${healthHtml}${chartHtml}<div class="table-wrap"><table class="data-table"><thead><tr>${headerHtml}</tr></thead><tbody>${sorted.map(m => `<tr class="clickable-row" data-mechanic="${esc(m.mechanic)}"><td><b>${esc(m.displayName ?? m.mechanic)}</b></td><td>${esc(m.dimension ?? 'canonical-mechanic')}</td><td>${fmt(m.selectionCount ?? 0)}</td><td>${fmt(m.legalOpportunityCount ?? 0)}</td><td>${renderPickRateCell(m)}</td><td>${pct(m.participantPrevalence ?? m.matchUsageRate)}</td><td>${pct(m.matchPrevalence ?? 0)}</td><td>${renderWinAssocCell(m, 'rawWinAssociation', 'rawWinAssociationStatus')}</td><td>${renderWinAssocCell(m, 'adjustedWinAssociation', 'adjustedWinAssociationStatus')}</td><td>${renderPointImpactCell(m)}</td><td><span class="status-badge ${(EVIDENCE_GRADE_RANK[m.evidenceGrade] ?? 0) >= 3 ? 'supported' : (EVIDENCE_GRADE_RANK[m.evidenceGrade] ?? 0) >= 2 ? 'info' : 'warning'}">${esc(m.evidenceGrade ?? 'INSUFFICIENT')}</span></td></tr>`).join('')}</tbody></table></div>${quarantineHtml}</div></section>`;
  document.querySelector('#dimension-filter').onchange = e => { state.mechanicsDimensionFilter = e.target.value; rerender(); };
  // Phase 3B: enhanced filter handlers
  const rankFilterEl = document.querySelector('#mechanics-rank-filter');
  if (rankFilterEl) rankFilterEl.onchange = e => { state.mechanicsRankFilter = e.target.value; rerender(); };
  const evidenceFilterEl = document.querySelector('#mechanics-evidence-filter');
  if (evidenceFilterEl) evidenceFilterEl.onchange = e => { state.mechanicsEvidenceFilter = e.target.value; rerender(); };
  const minSelEl = document.querySelector('#mechanics-min-selections');
  const minSelOut = document.querySelector('#mechanics-min-selections-out');
  if (minSelEl) minSelEl.oninput = e => {
    state.mechanicsMinSelections = Number(e.target.value);
    if (minSelOut) minSelOut.textContent = e.target.value;
  };
  if (minSelEl) minSelEl.onchange = e => { state.mechanicsMinSelections = Number(e.target.value); rerender(); };
  document.querySelectorAll('[data-sort-column]').forEach(th => {
    const handler = () => {
      const col = th.dataset.sortColumn;
      if (state.mechanicsSortColumn === col) { state.mechanicsSortPhase = (state.mechanicsSortPhase + 1) % 3; }
      else { state.mechanicsSortColumn = col; state.mechanicsSortPhase = 1; }
      rerender();
    };
    th.onclick = handler;
    th.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } };
  });
  document.querySelectorAll('[data-mechanic]').forEach(row => row.onclick = () => { state.selectedMechanic = row.dataset.mechanic; rerender(); });
  bindChartToggle('#mechanics-pickrate-chart');
}

function renderMechanicDetail(m) {
  const evidenceClass = (EVIDENCE_GRADE_RANK[m.evidenceGrade] ?? 0) >= 3 ? 'supported' : 'warning';
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><button class="back-button" id="mechanics-back">← Back to atlas</button><h2>${esc(m.displayName ?? m.mechanic)}</h2><p>${esc(m.category ?? '')} · ${esc(m.dimension ?? 'canonical-mechanic')}</p></div><span class="status-badge ${evidenceClass}">${esc(m.evidenceGrade ?? 'INSUFFICIENT')}</span></div><div class="panel-body">${definitionList([['Selections', m.selectionCount], ['Legal opportunities', m.legalOpportunityCount ?? 'N/A'], ['Pick rate when legal', m.pickRateWhenLegal != null ? pct(m.pickRateWhenLegal) : 'N/A'], ['Participant prevalence', pct(m.participantPrevalence ?? m.matchUsageRate)], ['Participant prevalence 95% CI', (m.participantPrevalenceWilson95 ?? m.matchUsageWilson95) ? `${pct((m.participantPrevalenceWilson95 ?? m.matchUsageWilson95)[0])} to ${pct((m.participantPrevalenceWilson95 ?? m.matchUsageWilson95)[1])}` : '—'], ['Match prevalence', pct(m.matchPrevalence)], ['Raw win association', m.rawWinAssociation != null ? `${(m.rawWinAssociation * 100).toFixed(1)} pp` : '—'], ['Adjusted win association', m.adjustedWinAssociation != null ? `${(m.adjustedWinAssociation * 100).toFixed(1)} pp` : '—'], ['Actor point impact mean', (m.actorPointImpact ?? m.immediatePointImpact)?.mean?.toFixed(2) ?? '—'], ['Actor point impact median', (m.actorPointImpact ?? m.immediatePointImpact)?.median?.toFixed(2) ?? '—'], ['Sample size', m.sampleSize], ['P-value', m.pValue?.toFixed(4)], ['Registry verified', m.registryVerified ? 'Yes' : 'No']])}<button id="mechanic-view-synergies" class="ix-cross-link" data-testid="mechanic-view-synergies" aria-label="View synergies involving this mechanic in the Synergy Observatory">⟷ View synergies involving this mechanic</button>${m.limitations ? `<div class="notice info" style="margin-top:12px"><strong>Limitations:</strong><ul>${m.limitations.map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>` : ''}</div></section>`;
  document.querySelector('#mechanics-back').onclick = () => { state.selectedMechanic = null; rerender(); };
  // Phase 3A: Mechanic → Synergy cross-workspace navigation
  const viewSynergiesBtn = document.querySelector('#mechanic-view-synergies');
  if (viewSynergiesBtn) viewSynergiesBtn.onclick = () => {
    state.synergiesMechanicFilter = m.mechanic;
    state.selectedSynergy = null;
    location.hash = '#/synergies';
  };
}

function renderAggregatedMechanicDetail(m) {
  const variants = m._variants ?? [];
  const rows = variants.map(v => `<tr class="clickable-row" data-mechanic="${esc(v.mechanic)}"><td class="mono">${esc(v.mechanic)}</td><td>${fmt(v.selectionCount ?? 0)}</td><td>${pct(v.matchUsageRate)}</td><td>${v.outcomeAssociation != null ? `${(v.outcomeAssociation * 100).toFixed(1)} pp` : '—'}</td><td>${v.sampleSize ?? '—'}</td><td><span class="status-badge ${(EVIDENCE_GRADE_RANK[v.evidenceGrade] ?? 0) >= 3 ? 'supported' : (EVIDENCE_GRADE_RANK[v.evidenceGrade] ?? 0) >= 2 ? 'info' : 'warning'}">${esc(v.evidenceGrade ?? 'INSUFFICIENT')}</span></td></tr>`).join('');
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><button class="back-button" id="mechanics-back">← Back to atlas</button><h2>${esc(m.displayName ?? m.mechanic)}</h2><p>${esc(m.category ?? '')} · aggregated from ${variants.length} card-specific variants</p></div><span class="status-badge ${(EVIDENCE_GRADE_RANK[m.evidenceGrade] ?? 0) >= 3 ? 'supported' : (EVIDENCE_GRADE_RANK[m.evidenceGrade] ?? 0) >= 2 ? 'info' : 'warning'}">${esc(m.evidenceGrade ?? 'INSUFFICIENT')}</span></div><div class="panel-body">${definitionList([['Variants', variants.length], ['Total selections', fmt(m.selectionCount)], ['Aggregated prevalence', pct(m.matchUsageRate)], ['Win rate association (sample-weighted)', m.outcomeAssociation != null ? `${(m.outcomeAssociation * 100).toFixed(1)} pp` : '—'], ['Total sample size', fmt(m.sampleSize)], ['Registry verified', m.registryVerified ? 'Yes' : 'No']])}<h3 style="margin-top:16px">Card-specific variants</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Variant</th><th>Selections</th><th>Prevalence</th><th>Win rate</th><th>Sample</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table></div></div></section>`;
  document.querySelector('#mechanics-back').onclick = () => { state.selectedMechanic = null; rerender(); };
  document.querySelectorAll('[data-mechanic]').forEach(row => row.onclick = () => { state.selectedMechanic = row.dataset.mechanic; rerender(); });
}

// ── /synergies ────────────────────────────────────────────────────
const SYNERGY_COLUMNS = [
  { key: 'pair', label: 'Pair', sort: s => s.displayName ?? s.id, type: 'string' },
  { key: 'effect', label: 'OR interaction', sort: s => s.effect ?? 0, type: 'number' },
  { key: 'marginal', label: 'Marginal effect', sort: s => s.marginalInteraction ?? s.rawEffect ?? 0, type: 'number' },
  { key: 'ci', label: '95% CI (OR)', sort: s => s.interval?.[0] ?? 0, type: 'number' },
  { key: 'cohorts', label: 'Cohorts (N/B/A/AB)', sort: s => s.effectiveN ?? s.sampleSize ?? 0, type: 'number' },
  { key: 'pvalue', label: 'P-value', sort: s => s.pValue ?? 1, type: 'number' },
  { key: 'qvalue', label: 'Q-value (BH)', sort: s => s.qValue ?? 1, type: 'number' },
  { key: 'evidence', label: 'Evidence', sort: s => EVIDENCE_GRADE_RANK[s.evidenceGrade] ?? 0, type: 'number' },
];

// ── Synergy effect heatmap (Phase 2B) ─────────────────────────────
// Heatmap of mechanic A × mechanic B interaction effects. Only pairs with
// sufficient evidence (SUPPORTED/EXPLORATORY) are shown. Green = synergy,
// red = anti-synergy. Complements the precise table below.
function renderSynergyHeatmap(synergies) {
  // Only include pairs with at least exploratory evidence
  const eligible = synergies.filter(s => {
    const rank = EVIDENCE_GRADE_RANK[s.evidenceGrade] ?? 0;
    return rank >= 2 && s.effect != null && Number.isFinite(Number(s.effect));
  });
  if (eligible.length === 0) return '';
  // Collect the unique mechanic set. Synergy objects carry explicit
  // source/target mechanic names; fall back to parsing displayName only
  // for legacy objects that lack those fields. (The id uses "::" as a
  // separator, which the older split regex did not match — leading to the
  // heatmap rendering blank because pairParts returned a single element.)
  const pairParts = (s) => {
    if (s.source && s.target) return [s.source, s.target];
    const raw = s.displayName ?? s.id ?? '';
    return raw.split(/[×_×+]/).map(p => p.trim()).filter(Boolean);
  };
  const mechanics = [...new Set(eligible.flatMap(pairParts))].sort();
  if (mechanics.length < 2) return '';
  // Build a symmetric matrix of effects. effect is on an OR scale; we map
  // log(OR) to a [-1, 1] range for the diverging color scale.
  const idx = new Map(mechanics.map((m, i) => [m, i]));
  const n = mechanics.length;
  const cells = Array.from({ length: n }, () => new Array(n).fill(null));
  const logs = [];
  for (const s of eligible) {
    const [a, b] = pairParts(s);
    const ia = idx.get(a), ib = idx.get(b);
    if (ia == null || ib == null) continue;
    const logEff = Math.log(Number(s.effect));
    logs.push(logEff);
    cells[ia][ib] = [logEff, s];
    cells[ib][ia] = [logEff, s];
  }
  const maxAbs = Math.max(...logs.map(Math.abs), 0.001);
  const colorScale = (v) => {
    if (v == null || !Number.isFinite(v)) return 'rgba(255,255,255,0.03)';
    const intensity = Math.min(Math.abs(v) / maxAbs, 1);
    const alpha = 0.15 + intensity * 0.7;
    return v >= 0 ? `rgba(79,211,135,${alpha.toFixed(3)})` : `rgba(240,93,120,${alpha.toFixed(3)})`;
  };
  // Truncate labels for display
  const shortLabel = (m) => m.length > 12 ? m.slice(0, 11) + '…' : m;
  const svg = heatmap({
    rows: mechanics.map(shortLabel),
    cols: mechanics.map(shortLabel),
    cells,
    colorScale,
    cellSize: 34,
    title: 'Synergy interaction effect heatmap',
    ariaLabel: 'Heatmap of mechanic-pair synergy interaction effects; green indicates synergy, red indicates anti-synergy',
  });
  const tableAlt = chartTableAlternative({
    headers: ['Mechanic A', 'Mechanic B', 'Effect (OR)', 'Evidence'],
    rows: eligible.map(s => { const [a, b] = pairParts(s); return [a, b, Number(s.effect).toFixed(3), s.evidenceGrade ?? 'INSUFFICIENT']; }),
    caption: 'Synergy interaction effects by mechanic pair',
  });
  return `<details class="ix-chart-container" data-testid="synergy-heatmap" open><summary class="ix-chart-header"><h4>Interaction landscape (heatmap)</h4><span class="footer-note">Green = synergy, red = anti-synergy. Only pairs with exploratory+ evidence.</span></summary>${svg}<button class="ix-chart-toggle" data-chart-toggle="synergy-heatmap" aria-expanded="false">View as table</button><div class="ix-chart-table-alt" data-chart-table="synergy-heatmap" hidden>${tableAlt}</div></details>`;
}

// ── Motif flow diagram (Depth II Phase 1) ────────────────────────
// Transform the 60 motifs from flat text cards into an interactive
// Sankey-style flow diagram showing mechanic→mechanic transition
// frequencies and outcome associations.
function renderMotifFlow(motifs) {
  if (!Array.isArray(motifs) || motifs.length === 0) return '';
  const outcomeFilter = state.motifOutcomeFilter ?? 'all';
  const nodeFilter = state.motifNodeFilter ?? null;
  // Filter motifs by outcome
  let filtered = motifs;
  if (outcomeFilter !== 'all') {
    filtered = filtered.filter(m => {
      const outcomes = m.outcomes ?? {};
      if (outcomeFilter === 'NORMAL_VICTORY') return (outcomes.NORMAL_VICTORY ?? 0) > 0;
      // 'other' = any outcome that is not NORMAL_VICTORY
      return Object.entries(outcomes).some(([k, v]) => k !== 'NORMAL_VICTORY' && v > 0);
    });
  }
  // Extract source/target from motif string (split on ' → ')
  const parts = m => {
    const s = String(m.motif ?? '');
    const idx = s.indexOf(' → ');
    if (idx < 0) return [s, s];
    return [s.slice(0, idx), s.slice(idx + 3)];
  };
  // Build nodes and links
  const nodeSet = new Set();
  const linkMap = {}; // key: "source→target" → aggregated value + outcome info
  for (const m of filtered) {
    const [src, tgt] = parts(m);
    if (!src || !tgt) continue;
    // Apply node filter: only show links involving the selected mechanic
    if (nodeFilter && src !== nodeFilter && tgt !== nodeFilter) continue;
    nodeSet.add(src);
    nodeSet.add(tgt);
    const key = `${src}→${tgt}`;
    if (!linkMap[key]) linkMap[key] = { source: src, target: tgt, value: 0, outcomes: {}, matchIds: [] };
    linkMap[key].value += Number(m.count ?? 0);
    const outcomes = m.outcomes ?? {};
    for (const [ok, ov] of Object.entries(outcomes)) {
      linkMap[key].outcomes[ok] = (linkMap[key].outcomes[ok] ?? 0) + Number(ov);
    }
    if (Array.isArray(m.matchIds)) linkMap[key].matchIds.push(...m.matchIds);
  }
  const nodes = [...nodeSet].sort().map(id => ({ id, label: id }));
  const linkColor = (outcomes) => {
    const nv = outcomes.NORMAL_VICTORY ?? 0;
    const total = Object.values(outcomes).reduce((s, v) => s + v, 0) || 1;
    // Green if predominantly NORMAL_VICTORY, amber otherwise
    return nv / total > 0.8 ? 'rgba(79,211,135,0.35)' : 'rgba(241,189,93,0.35)';
  };
  const links = Object.values(linkMap).map(l => ({
    source: l.source,
    target: l.target,
    value: l.value,
    color: linkColor(l.outcomes),
  }));
  if (nodes.length === 0 || links.length === 0) {
    return `<div class="ix-chart-empty" data-testid="motif-flow-empty">No motifs match the current filters.</div>`;
  }
  const svg = sankeyFlow({
    nodes,
    links,
    width: 640,
    height: 420,
    title: 'Motif flow diagram — mechanic transition frequencies',
    ariaLabel: 'Sankey flow diagram of mechanic-to-mechanic transition frequencies, colored by outcome (green = normal victory, amber = other)',
  });
  // Table alternative: motif, count, outcomes, match count
  const tableRows = filtered
    .filter(m => { if (nodeFilter) { const [s, t] = parts(m); return s === nodeFilter || t === nodeFilter; } return true; })
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .map(m => {
      const outcomes = m.outcomes ?? {};
      const outcomeStr = Object.entries(outcomes).map(([k, v]) => `${k}:${v}`).join(', ');
      return [m.motif, m.count, outcomeStr, m.matchIds?.length ?? 0];
    });
  const tableAlt = chartTableAlternative({
    headers: ['Motif', 'Count', 'Outcomes', 'Matches'],
    rows: tableRows,
    caption: 'Motif transition frequencies',
  });
  // Outcome filter dropdown
  const outcomeFilterHtml = `<div class="ix-filter-toolbar" data-testid="motif-filter-toolbar"><label for="motif-outcome-filter">Outcome:</label><select id="motif-outcome-filter"><option value="all" ${outcomeFilter === 'all' ? 'selected' : ''}>All outcomes</option><option value="NORMAL_VICTORY" ${outcomeFilter === 'NORMAL_VICTORY' ? 'selected' : ''}>Normal Victory</option><option value="other" ${outcomeFilter === 'other' ? 'selected' : ''}>Other</option></select>${nodeFilter ? `<span class="footer-note">Filtered to mechanic: <strong>${esc(nodeFilter)}</strong></span><button id="motif-node-clear" class="ix-chart-toggle" aria-expanded="false">Clear filter</button>` : ''}</div>`;
  // Depth II Phase 6: collect all matchIds from filtered motifs for "View matches" button
  const allMatchIds = [...new Set(filtered.flatMap(m => m.matchIds ?? []))];
  const viewMatchesBtn = allMatchIds.length > 0
    ? `<button id="motif-view-matches" class="ix-cross-link" data-testid="motif-view-matches" style="margin-top:8px">View ${allMatchIds.length} matches with these motifs →</button>`
    : '';
  return `<details class="ix-chart-container" data-testid="motif-flow" id="motif-flow-chart" open><summary class="ix-chart-header"><h4>Motif flow diagram (${filtered.length} motifs)</h4><span class="footer-note">Click a node to filter transitions by that mechanic</span></summary>${outcomeFilterHtml}${svg}${viewMatchesBtn}<button class="ix-chart-toggle" data-chart-toggle="motif-flow" aria-expanded="false">View as table</button><div class="ix-chart-table-alt" data-chart-table="motif-flow" hidden>${tableAlt}</div></details>`;
}

export function renderSynergies() {
  const o = state.observatory;
  const synergies = o.synergies ?? [];
  const synergyDiagnostics = o.synergyDiagnostics ?? [];
  const motifs = o.motifs ?? [];
  const selectedSynergy = state.selectedSynergy;
  if (selectedSynergy) {
    const s = synergies.find(x => x.id === selectedSynergy);
    if (s) return renderSynergyDetail(s);
  }
  // Phase 3C: enhanced synergies filtering — mechanic, direction, min cohort
  const mechanicFilter = state.synergiesMechanicFilter ?? 'all';
  const directionFilter = state.synergiesDirectionFilter ?? 'all';
  const minCohort = Number(state.synergiesMinCohort ?? 0);
  const synergyPairParts = (s) => {
    if (s.source && s.target) return [s.source, s.target];
    const raw = s.displayName ?? s.id ?? '';
    return raw.split(/[×_×+]/).map(p => p.trim()).filter(Boolean);
  };
  let filteredSynergies = synergies;
  if (mechanicFilter !== 'all') {
    filteredSynergies = filteredSynergies.filter(s => synergyPairParts(s).includes(mechanicFilter));
  }
  if (directionFilter !== 'all') {
    filteredSynergies = filteredSynergies.filter(s => {
      const eff = Number(s.effect ?? 1);
      return directionFilter === 'synergy' ? eff > 1 : eff < 1;
    });
  }
  if (minCohort > 0) {
    filteredSynergies = filteredSynergies.filter(s => (s.bothN ?? s.effectiveN ?? s.sampleSize ?? 0) >= minCohort);
  }
  // Collect unique mechanics for the mechanic filter dropdown
  const allMechanics = [...new Set(synergies.flatMap(synergyPairParts))].sort();
  const original = [...filteredSynergies].sort((a, b) => Math.abs(b.estimate ?? 0) - Math.abs(a.estimate ?? 0));
  const sortCol = state.synergiesSortColumn;
  const sortPhase = state.synergiesSortPhase ?? 0;
  let sorted = original;
  if (sortPhase !== 0 && sortCol) {
    const col = SYNERGY_COLUMNS.find(c => c.key === sortCol);
    if (col) {
      sorted = [...original].sort((a, b) => {
        const va = col.sort(a), vb = col.sort(b);
        if (col.type === 'number') return sortPhase === 1 ? vb - va : va - vb;
        return sortPhase === 1 ? String(vb).localeCompare(String(va)) : String(va).localeCompare(String(vb));
      });
    }
  }
  const headerHtml = SYNERGY_COLUMNS.map(col => {
    const isActive = col.key === sortCol && sortPhase !== 0;
    const arrow = isActive ? (sortPhase === 1 ? ' <span class="sort-arrow" aria-hidden="true">▼</span>' : ' <span class="sort-arrow" aria-hidden="true">▲</span>') : '';
    const sortAttr = isActive ? (sortPhase === 1 ? 'aria-sort="descending"' : 'aria-sort="ascending"') : 'aria-sort="none"';
    return `<th data-sort-column="${col.key}" ${sortAttr} tabindex="0" role="button">${col.label}${arrow}</th>`;
  }).join('');
  const healthHtml = renderCampaignHealthBanner(o);
  // Near-threshold pairs: rejected for INSUFFICIENT_BOTH but with both ≥ 10
  // (half the default threshold). These are the closest candidates that would
  // become eligible with a larger campaign. Shown in a separate, clearly
  // labelled section so users understand they are NOT proven synergies.
  const nearThreshold = synergyDiagnostics
    .filter(d => d.reasonCode === 'INSUFFICIENT_BOTH' && (d.cohortN?.both ?? 0) >= 10)
    .sort((a, b) => (b.cohortN?.both ?? 0) - (a.cohortN?.both ?? 0));
  const emptyMsg = synergies.length === 0
    ? `<div class="notice warning" style="margin-bottom:12px"><strong>No eligible synergy pairs.</strong> No pairs met the minimum cohort thresholds (Both ≥ 20, single cohorts ≥ 10, total N ≥ 50). Run a larger campaign or lower thresholds to see pairs.</div>`
    : '';
  const filterMsg = (synergies.length > 0 && filteredSynergies.length === 0)
    ? `<div class="notice info" style="margin-bottom:12px"><strong>No pairs match the current filters.</strong> Adjust the mechanic, direction, or cohort filters to see more pairs.</div>`
    : '';
  const nearThresholdHtml = (synergies.length === 0 && nearThreshold.length > 0)
    ? renderNearThresholdPairs(nearThreshold)
    : '';
  const heatmapHtml = renderSynergyHeatmap(filteredSynergies);
  const synergyFilterHtml = synergies.length > 0 ? `<div class="ix-filter-toolbar" data-testid="synergies-filter-toolbar"><label for="synergies-mechanic-filter">Mechanic:</label><select id="synergies-mechanic-filter"><option value="all" ${mechanicFilter === 'all' ? 'selected' : ''}>All mechanics</option>${allMechanics.map(m => `<option value="${esc(m)}" ${m === mechanicFilter ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select><label for="synergies-direction-filter">Direction:</label><select id="synergies-direction-filter"><option value="all" ${directionFilter === 'all' ? 'selected' : ''}>All</option><option value="synergy" ${directionFilter === 'synergy' ? 'selected' : ''}>Synergy only</option><option value="anti-synergy" ${directionFilter === 'anti-synergy' ? 'selected' : ''}>Anti-synergy only</option></select><label for="synergies-min-cohort">Min cohort (Both): <output id="synergies-min-cohort-out">${minCohort}</output></label><input type="range" id="synergies-min-cohort" min="0" max="${Math.max(...synergies.map(s => s.bothN ?? s.effectiveN ?? s.sampleSize ?? 0), 50)}" step="5" value="${minCohort}"></div>` : '';
  const motifFlowHtml = renderMotifFlow(motifs);
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Synergy Observatory</h2><p>Four-cohort logistic A×B interaction (odds-ratio scale) — ${filteredSynergies.length} of ${synergies.length} pairs</p></div></div><div class="panel-body">${healthHtml}${emptyMsg}${synergyFilterHtml}${filterMsg}${heatmapHtml}<div class="table-wrap"><table class="data-table"><thead><tr>${headerHtml}</tr></thead><tbody>${sorted.map(s => `<tr class="clickable-row" data-synergy="${esc(s.id)}"><td><b>${esc(s.displayName ?? s.id)}</b></td><td>${s.effect != null ? `${s.effect.toFixed(3)}` : '—'}</td><td>${s.marginalInteraction != null ? `${(s.marginalInteraction * 100).toFixed(1)} pp` : '—'}</td><td>${s.interval?.[0] != null ? `${s.interval[0].toFixed(3)} to ${s.interval[1].toFixed(3)}` : '—'}</td><td>${s.neitherN ?? '—'}/${s.aOnlyN ?? '—'}/${s.bOnlyN ?? '—'}/${s.bothN ?? '—'}</td><td>${s.pValue?.toFixed(4) ?? '—'}</td><td>${s.qValue?.toFixed(4) ?? '—'}</td><td><span class="status-badge ${(EVIDENCE_GRADE_RANK[s.evidenceGrade] ?? 0) >= 3 ? 'supported' : (EVIDENCE_GRADE_RANK[s.evidenceGrade] ?? 0) >= 2 ? 'info' : 'warning'}">${esc(s.evidenceGrade ?? 'INSUFFICIENT')}</span></td></tr>`).join('')}</tbody></table></div>${nearThresholdHtml}${motifFlowHtml}</div></section>`;
  document.querySelectorAll('[data-sort-column]').forEach(th => {
    const handler = () => {
      const col = th.dataset.sortColumn;
      if (state.synergiesSortColumn === col) { state.synergiesSortPhase = (state.synergiesSortPhase + 1) % 3; }
      else { state.synergiesSortColumn = col; state.synergiesSortPhase = 1; }
      rerender();
    };
    th.onclick = handler;
    th.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } };
  });
  document.querySelectorAll('[data-synergy]').forEach(row => row.onclick = () => { state.selectedSynergy = row.dataset.synergy; rerender(); });
  bindChartToggle('#synergy-heatmap');
  // Phase 3C: enhanced synergies filter handlers
  const synMechFilterEl = document.querySelector('#synergies-mechanic-filter');
  if (synMechFilterEl) synMechFilterEl.onchange = e => { state.synergiesMechanicFilter = e.target.value; rerender(); };
  const synDirFilterEl = document.querySelector('#synergies-direction-filter');
  if (synDirFilterEl) synDirFilterEl.onchange = e => { state.synergiesDirectionFilter = e.target.value; rerender(); };
  const synMinCohortEl = document.querySelector('#synergies-min-cohort');
  const synMinCohortOut = document.querySelector('#synergies-min-cohort-out');
  if (synMinCohortEl) synMinCohortEl.oninput = e => {
    state.synergiesMinCohort = Number(e.target.value);
    if (synMinCohortOut) synMinCohortOut.textContent = e.target.value;
  };
  if (synMinCohortEl) synMinCohortEl.onchange = e => { state.synergiesMinCohort = Number(e.target.value); rerender(); };
  // Depth II Phase 1: motif flow event handlers
  bindChartToggle('#motif-flow-chart');
  const motifOutcomeEl = document.querySelector('#motif-outcome-filter');
  if (motifOutcomeEl) motifOutcomeEl.onchange = e => { state.motifOutcomeFilter = e.target.value; rerender(); };
  const motifClearEl = document.querySelector('#motif-node-clear');
  if (motifClearEl) motifClearEl.onclick = () => { state.motifNodeFilter = null; rerender(); };
  // Click a Sankey node to filter motifs by that mechanic
  document.querySelectorAll('.ix-sankey-node').forEach(node => {
    node.onclick = () => {
      const id = node.getAttribute('data-node-id');
      state.motifNodeFilter = state.motifNodeFilter === id ? null : id;
      rerender();
    };
  });
  // Depth II Phase 6: motif → match history filter
  const motifViewMatchesBtn = document.querySelector('#motif-view-matches');
  if (motifViewMatchesBtn) motifViewMatchesBtn.onclick = () => {
    const motifs = state.observatory?.motifs ?? [];
    const outcomeFilter = state.motifOutcomeFilter ?? 'all';
    const nodeFilter = state.motifNodeFilter ?? null;
    let filtered = motifs;
    if (outcomeFilter !== 'all') {
      filtered = filtered.filter(m => {
        const outcomes = m.outcomes ?? {};
        if (outcomeFilter === 'NORMAL_VICTORY') return (outcomes.NORMAL_VICTORY ?? 0) > 0;
        return Object.entries(outcomes).some(([k, v]) => k !== 'NORMAL_VICTORY' && v > 0);
      });
    }
    if (nodeFilter) {
      filtered = filtered.filter(m => {
        const s = String(m.motif ?? '');
        return s.includes(nodeFilter);
      });
    }
    const matchIds = [...new Set(filtered.flatMap(m => m.matchIds ?? []))];
    state.historyFilterMatchIds = matchIds.length > 0 ? matchIds : null;
    state.historyPage = 0;
    state.historySelectedMatch = null;
    location.hash = '#/history';
  };
}

// ── Near-threshold pairs (diagnostic view) ─────────────────────────
//
// When no synergy pairs meet the full cohort threshold (Both ≥ 20), the
// observatory surfaces the closest candidates — pairs where both mechanics
// co-occurred in ≥ 10 participant-matches. These are NOT proven synergies;
// they are pairs that would likely become eligible with a larger campaign.
// The section is clearly labelled as exploratory/diagnostic.
function renderNearThresholdPairs(nearThreshold) {
  const SYNERGY_THRESHOLD_BOTH = 20;
  const rows = nearThreshold.map(d => {
    const both = d.cohortN?.both ?? 0;
    const aOnly = d.cohortN?.aOnly ?? 0;
    const bOnly = d.cohortN?.bOnly ?? 0;
    const neither = d.cohortN?.neither ?? 0;
    const totalN = neither + aOnly + bOnly + both;
    const pct = Math.round((both / SYNERGY_THRESHOLD_BOTH) * 100);
    const barWidth = Math.min(100, pct);
    return `<tr><td class="mono">${esc(d.id)}</td><td>${both}</td><td>${aOnly}</td><td>${bOnly}</td><td>${neither}</td><td>${totalN}</td><td><div class="threshold-bar" title="${both}/${SYNERGY_THRESHOLD_BOTH} co-occurrences (${pct}% of threshold)"><div class="threshold-bar-fill" style="width:${barWidth}%"></div></div><span class="threshold-bar-label">${both}/${SYNERGY_THRESHOLD_BOTH}</span></td></tr>`;
  }).join('');
  return `<h3 style="margin-top:16px">Near-threshold pairs (${nearThreshold.length})</h3><div class="notice info" style="margin-bottom:12px"><strong>Exploratory view.</strong> These ${nearThreshold.length} mechanic pairs co-occurred in ≥ 10 participant-matches but did not reach the full threshold of ${SYNERGY_THRESHOLD_BOTH}. They are <em>not</em> proven synergies — they are the strongest candidates that would likely become eligible with a larger campaign (≥ 200 matches).</div><div class="table-wrap"><table class="data-table"><thead><tr><th>Pair</th><th>Both</th><th>A-only</th><th>B-only</th><th>Neither</th><th>Total N</th><th>Progress to threshold</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderSynergyDetail(s) {
  const evidenceClass = (EVIDENCE_GRADE_RANK[s.evidenceGrade] ?? 0) >= 3 ? 'supported' : 'warning';
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><button class="back-button" id="synergy-back">← Back to observatory</button><h2>${esc(s.displayName ?? s.id)}</h2><p>${esc(s.relationshipClass ?? '')} · ${esc(s.direction ?? 'bidirectional')}</p></div><span class="status-badge ${evidenceClass}">${esc(s.evidenceGrade ?? 'INSUFFICIENT')}</span></div><div class="panel-body">${definitionList([['Interaction (odds-ratio)', s.effect != null ? s.effect.toFixed(4) : '—'], ['Log-estimate', s.logEstimate != null ? s.logEstimate.toFixed(4) : '—'], ['Marginal interaction', s.marginalInteraction != null ? `${(s.marginalInteraction * 100).toFixed(2)} pp` : '—'], ['95% CI (OR)', s.interval?.[0] != null ? `${s.interval[0].toFixed(4)} to ${s.interval[1].toFixed(4)}` : '—'], ['Standard error', s.standardError != null ? s.standardError.toFixed(4) : '—'], ['P-value', s.pValue?.toFixed(6) ?? '—'], ['Q-value', s.qValue?.toFixed(6) ?? '—'], ['Neither cohort', s.neitherN ?? '—'], ['A-only cohort', s.aOnlyN ?? '—'], ['B-only cohort', s.bOnlyN ?? '—'], ['Both cohort', s.bothN ?? '—'], ['Effective N', s.effectiveN ?? '—'], ['Cohort balance', s.cohortBalance != null ? s.cohortBalance.toFixed(3) : '—'], ['Separation detected', s.separation ? 'Yes (corrected)' : 'No'], ['Strata pooled', s.strataCount ?? '—'], ['Status', s.status ?? '—']])}${s.limitations ? `<div class="notice info" style="margin-top:12px"><strong>Limitations:</strong><ul>${s.limitations.map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>` : ''}</div></section>`;
  document.querySelector('#synergy-back').onclick = () => { state.selectedSynergy = null; rerender(); };
}

// ── Match detail inspector (Depth II Phase 5) ────────────────────
// When clicking a match in the History workspace, show an inline detail
// panel with score progression, action breakdown, and mechanic usage.
function renderMatchDetail(summary) {
  const palette = ['#4fd387', '#5ad7e8', '#a78bfa', '#f1bd5d', '#f0786f', '#7dd3fc', '#fbbf24', '#34d399'];
  // Score progression sparkline from finalScores (if object with P1/P2)
  let scoreSparkHtml = '';
  if (summary.finalScores && typeof summary.finalScores === 'object') {
    const scores = Object.values(summary.finalScores).map(v => Number(v ?? 0));
    if (scores.length > 0) {
      scoreSparkHtml = sparkline({ values: scores, width: 200, height: 40, color: '#4fd387', title: 'Final scores', ariaLabel: 'Sparkline of final scores' });
    }
  } else if (summary.scoreMargin != null) {
    scoreSparkHtml = sparkline({ values: [0, Number(summary.scoreMargin)], width: 200, height: 40, color: '#4fd387', title: 'Score margin', ariaLabel: 'Sparkline of score margin' });
  }
  // Action breakdown donut from actionCounts
  let actionDonutHtml = '';
  if (summary.actionCounts && typeof summary.actionCounts === 'object') {
    const segments = Object.entries(summary.actionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, value], i) => ({ label, value: Number(value), color: palette[i % palette.length] }));
    actionDonutHtml = donutChart({ segments, size: 160, title: 'Action breakdown', ariaLabel: 'Donut chart of action type counts for this match' });
  }
  // Decision family bar chart
  let decisionBarHtml = '';
  if (summary.decisionFamilyCounts && typeof summary.decisionFamilyCounts === 'object') {
    const items = Object.entries(summary.decisionFamilyCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([label, value]) => ({ label, value: Number(value) }));
    decisionBarHtml = barChart({ items, width: 480, barHeight: 20, title: 'Decision family distribution', ariaLabel: 'Bar chart of decision family counts for this match' });
  }
  // Mechanic usage summary — top 10 by count
  let mechanicBarHtml = '';
  if (summary.mechanicCounts && typeof summary.mechanicCounts === 'object') {
    const items = Object.entries(summary.mechanicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, value]) => ({ label, value: Number(value) }));
    mechanicBarHtml = barChart({ items, width: 480, barHeight: 22, title: 'Top 10 mechanics by usage count', ariaLabel: 'Bar chart of top 10 mechanics by usage count for this match' });
  }
  // Response action breakdown
  let responseBarHtml = '';
  if (summary.responseActionCounts && typeof summary.responseActionCounts === 'object') {
    const items = Object.entries(summary.responseActionCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value: Number(value) }));
    responseBarHtml = barChart({ items, width: 420, barHeight: 22, title: 'Response action breakdown', ariaLabel: 'Bar chart of response action counts for this match' });
  }
  return `<section class="panel" data-testid="match-detail"><div class="panel-header"><div><button class="back-button" id="history-detail-back">← Back to history</button><h2>Match detail: ${short(summary.matchId)}</h2><p>Ordinal ${summary.matchOrdinal ?? '—'} · ${esc(summary.terminationReason ?? '—')} · Winner: ${esc(summary.winner ?? '—')}</p></div></div><div class="panel-body">${definitionList([['Match ID', summary.matchId], ['Winner', summary.winner ?? '—'], ['Score margin', summary.scoreMargin?.toFixed(0) ?? '—'], ['Completed turns', summary.completedFullTurns ?? '—'], ['Policies', (summary.policyIds ?? []).join(', ')], ['Final scores', summary.finalScores ? Object.entries(summary.finalScores).map(([k, v]) => `${k}: ${v}`).join(', ') : '—']])}${scoreSparkHtml ? `<h3 style="margin-top:12px">Score progression</h3>${scoreSparkHtml}` : ''}<div class="grid two" style="margin-top:12px">${actionDonutHtml ? `<div><h4>Action breakdown</h4>${actionDonutHtml}</div>` : ''}${decisionBarHtml ? `<div><h4>Decision families</h4>${decisionBarHtml}</div>` : ''}</div>${mechanicBarHtml ? `<h3 style="margin-top:12px">Mechanic usage (top 10)</h3>${mechanicBarHtml}` : ''}${responseBarHtml ? `<h3 style="margin-top:12px">Response actions</h3>${responseBarHtml}` : ''}<div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap"><button id="match-detail-watch" class="ix-cross-link" data-testid="match-detail-watch">▶ View in Watch</button><button id="match-detail-traces" class="ix-cross-link" data-testid="match-detail-traces">◇ View traces</button></div></div></section>`;
}

// ── /history ──────────────────────────────────────────────────────
export function renderHistory() {
  const summaries = state.observatory?.summaries ?? [];
  if (!summaries.length) { app.innerHTML = '<div class="empty-state"><span class="empty-state-icon" aria-hidden="true">☰</span><strong>No match history.</strong><p>Run a campaign to populate the match ledger.</p></div>'; return; }
  // Depth II Phase 5: if a match is selected, show the detail inspector
  const selectedMatchId = state.historySelectedMatch;
  if (selectedMatchId) {
    const summary = summaries.find(s => s.matchId === selectedMatchId);
    if (summary) {
      app.innerHTML = renderMatchDetail(summary);
      document.querySelector('#history-detail-back').onclick = () => { state.historySelectedMatch = null; rerender(); };
      const watchBtn = document.querySelector('#match-detail-watch');
      if (watchBtn) watchBtn.onclick = () => { state.fixtureId = summary.matchId; state.replayKind = 'autonomy'; state.replay = null; state.frame = 0; location.hash = '#/watch'; };
      const tracesBtn = document.querySelector('#match-detail-traces');
      if (tracesBtn) tracesBtn.onclick = () => { state.traceSelectedId = summary.matchId; location.hash = '#/traces'; };
      return;
    }
    // If the selected match ID is invalid, clear it and fall through
    state.historySelectedMatch = null;
  }
  const page = state.historyPage ?? 0;
  const perPage = 50;
  const term = (state.historyFilterTerm ?? '').toLowerCase();
  const reason = state.historyFilterReason ?? 'all';
  const policy = state.historyFilterPolicy ?? 'all';
  const matchIdFilter = state.historyFilterMatchIds; // Phase 6: array of match IDs to filter to
  let filtered = summaries;
  if (term) filtered = filtered.filter(s => (s.matchId ?? '').toLowerCase().includes(term) || String(s.matchOrdinal ?? '').includes(term));
  if (reason !== 'all') filtered = filtered.filter(s => s.terminationReason === reason);
  if (policy !== 'all') filtered = filtered.filter(s => (s.policyIds ?? []).includes(policy));
  if (Array.isArray(matchIdFilter) && matchIdFilter.length > 0) {
    const idSet = new Set(matchIdFilter);
    filtered = filtered.filter(s => idSet.has(s.matchId));
  }
  const totalPages = Math.ceil(filtered.length / perPage);
  const pageItems = filtered.slice(page * perPage, (page + 1) * perPage);
  const reasons = [...new Set(summaries.map(s => s.terminationReason))].sort();
  const allPolicies = [...new Set(summaries.flatMap(s => s.policyIds ?? []))].sort();
  const matchIdFilterBanner = Array.isArray(matchIdFilter) && matchIdFilter.length > 0
    ? `<div class="notice info" style="margin-bottom:8px"><strong>Filtered to ${matchIdFilter.length} match(es).</strong> <button id="history-clear-matchid-filter" class="ix-chart-toggle">Clear filter</button></div>`
    : '';
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Match History</h2><p>${filtered.length} matches · page ${page + 1}/${Math.max(1, totalPages)}</p></div><div class="toolbar"><input id="history-search" type="search" placeholder="Search match ID or ordinal…" value="${esc(state.historyFilterTerm)}"><select id="history-reason"><option value="all">All outcomes</option>${reasons.map(r => `<option value="${esc(r)}" ${r === reason ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select><select id="history-policy"><option value="all">All policies</option>${allPolicies.map(p => `<option value="${esc(p)}" ${p === policy ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div></div><div class="panel-body">${matchIdFilterBanner}<div class="table-wrap"><table class="data-table"><thead><tr><th>Ordinal</th><th>Match ID</th><th>Outcome</th><th>Winner</th><th>Score</th><th>Turns</th><th>Policies</th></tr></thead><tbody>${pageItems.map(s => `<tr class="clickable-row" data-match-id="${esc(s.matchId)}"><td>${s.matchOrdinal ?? '—'}</td><td class="mono">${short(s.matchId)}</td><td>${esc(s.terminationReason ?? '—')}</td><td>${esc(s.winner ?? '—')}</td><td>${s.scoreMargin?.toFixed(0) ?? '—'}</td><td>${s.completedFullTurns ?? '—'}</td><td>${esc((s.policyIds ?? []).join(', '))}</td></tr>`).join('')}</tbody></table></div>${totalPages > 1 ? `<div class="pagination"><button id="history-prev" ${page === 0 ? 'disabled' : ''}>← Prev</button><span>Page ${page + 1} of ${totalPages}</span><button id="history-next" ${page >= totalPages - 1 ? 'disabled' : ''}>Next →</button></div>` : ''}</div></section>`;
  document.querySelector('#history-search')?.addEventListener('input', e => { state.historyFilterTerm = e.target.value; state.historyPage = 0; rerender(); });
  document.querySelector('#history-reason')?.addEventListener('change', e => { state.historyFilterReason = e.target.value; state.historyPage = 0; rerender(); });
  document.querySelector('#history-policy')?.addEventListener('change', e => { state.historyFilterPolicy = e.target.value; state.historyPage = 0; rerender(); });
  document.querySelector('#history-clear-matchid-filter')?.addEventListener('click', () => { state.historyFilterMatchIds = null; state.historyPage = 0; rerender(); });
  document.querySelector('#history-prev')?.addEventListener('click', () => { if (page > 0) { state.historyPage = page - 1; rerender(); } });
  document.querySelector('#history-next')?.addEventListener('click', () => { if (page < totalPages - 1) { state.historyPage = page + 1; rerender(); } });
  // Depth II Phase 5: clicking a match row shows the detail inspector
  document.querySelectorAll('[data-match-id]').forEach(row => row.onclick = () => { state.historySelectedMatch = row.dataset.matchId; rerender(); });
}

// ── /replays ──────────────────────────────────────────────────────
export function renderReplays() {
  const isAutonomy = !!state.autonomyIndex;
  const index = isAutonomy ? state.autonomyIndex : state.index;
  const records = index?.records ?? [];
  if (!records.length) { app.innerHTML = '<div class="empty-state"><span class="empty-state-icon" aria-hidden="true">▶</span><strong>No replay records.</strong><p>Run a campaign to generate certified replays.</p></div>'; return; }
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Replay Library</h2><p>${records.length} certified replays — click to load in Watch</p></div></div><div class="panel-body"><div class="table-wrap"><table class="data-table"><thead><tr><th>Fixture</th><th>Commands</th><th>Events</th><th>Outcome</th></tr></thead><tbody>${records.map(r => `<tr class="clickable-row" data-fixture="${esc(r.fixtureId)}"><td class="mono">${esc(r.fixtureId)}</td><td>${r.commandCount ?? '—'}</td><td>${r.eventCount ?? '—'}</td><td>${esc(r.outcome ?? r.terminationReason ?? '—')}</td></tr>`).join('')}</tbody></table></div></div></section>`;
  document.querySelectorAll('[data-fixture]').forEach(row => row.onclick = () => { state.fixtureId = row.dataset.fixture; state.replayKind = isAutonomy ? 'autonomy' : 'corpus'; state.replay = null; state.frame = 0; location.hash = '#/watch'; });
}

// ── /traces ───────────────────────────────────────────────────────
export function renderTraces() {
  const idx = state.traceIndex;
  if (!idx || !idx.records) { app.innerHTML = '<div class="empty-state"><span class="empty-state-icon" aria-hidden="true">◇</span><strong>No decision traces.</strong><p>Run a campaign with decision traces enabled.</p></div>'; return; }
  const records = idx.records ?? [];
  const filterPolicy = state.traceFilterPolicy ?? 'all';


  const policies = [...new Set(records.map(r => r.policyId).filter(Boolean))].sort();
  let filtered = records;
  if (filterPolicy !== 'all') filtered = filtered.filter(r => r.policyId === filterPolicy);
  const selectedId = state.traceSelectedId;
  if (selectedId) {
    const r = records.find(x => x.matchId === selectedId);
    if (r) {
      app.innerHTML = `<section class="panel"><div class="panel-header"><div><button class="back-button" id="traces-back">← Back to index</button><h2>Decision traces: ${esc(r.matchId)}</h2><p>Policy: ${esc(r.policyId ?? '—')} · ${r.traceCount ?? 0} traces</p></div></div><div class="panel-body"><div class="notice">Trace detail loading from shard files. Full trace inspection available after campaign run.</div></div></section>`;
      document.querySelector('#traces-back').onclick = () => { state.traceSelectedId = null; rerender(); };
      return;
    }
  }
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Decision Traces</h2><p>${filtered.length} match trace records</p></div><div class="toolbar"><select id="trace-filter-policy"><option value="all">All policies</option>${policies.map(p => `<option value="${esc(p)}" ${p === filterPolicy ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div></div><div class="panel-body"><div class="table-wrap"><table class="data-table"><thead><tr><th>Match ID</th><th>Policy</th><th>Traces</th><th>Seat</th></tr></thead><tbody>${filtered.map(r => `<tr class="clickable-row" data-match-id="${esc(r.matchId)}"><td class="mono">${short(r.matchId)}</td><td>${esc(r.policyId ?? '—')}</td><td>${r.traceCount ?? '—'}</td><td>${r.seat ?? '—'}</td></tr>`).join('')}</tbody></table></div></div></section><div id="opening-patterns-slot"><div class="ix-chart-empty">Loading opening move patterns…</div></div>`;
  document.querySelector('#trace-filter-policy')?.addEventListener('change', e => { state.traceFilterPolicy = e.target.value; rerender(); });
  document.querySelectorAll('[data-match-id]').forEach(row => row.onclick = () => { state.traceSelectedId = row.dataset.matchId; rerender(); });
  // Phase 5B: async-load opening move patterns into the slot below the table
  renderOpeningPatterns().then(html => {
    const slot = document.querySelector('#opening-patterns-slot');
    if (slot) {
      slot.innerHTML = html;
      bindChartToggle('#opening-patterns-chart');
    }
  }).catch(() => {
    const slot = document.querySelector('#opening-patterns-slot');
    if (slot) slot.innerHTML = '<div class="ix-chart-empty">Opening patterns could not be loaded.</div>';
  });
}
