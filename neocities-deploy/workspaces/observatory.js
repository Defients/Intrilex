// ═══════════════════════════════════════════════════════════════
// workspaces/observatory.js — Consolidated workspace renderers:
//   Compare, Mechanics, Synergies, History, Replays, Traces
// ═══════════════════════════════════════════════════════════════

import { state, app, esc, fmt, pct, short, definitionList } from '../state.js?v=8951e2c35a42';
import { barChart, heatmap, donutChart, sparkline, lineChart, stackedBarChart, chartTableAlternative, sankeyFlow, scatterPlot, intervalPlot } from '../chart-toolkit.js?v=8951e2c35a42';
import { wilsonInterval } from '../observatory-analytics-browser.js?v=8951e2c35a42';
import { obsContextStrip, metricStrip, evidenceBadge, dossierSection, miniBar, segmentControl } from './observatory-ui.js?v=8951e2c35a42';
// IRX-C06: Use rerender bus instead of dynamic import('../app.js?v=8951e2c35a42') to break backedge
import { rerender } from '../rerender.js?v=8951e2c35a42';
import { openReplay, descriptorKindForRecord, recordAvailability } from '../data-loader.js?v=8951e2c35a42';
import { classifyIndexRecord, REPLAY_ARTIFACT_CLASS, ARTIFACT_CLASS_LABEL } from '../replay-contract.mjs?v=8951e2c35a42';

// Generic segmented-control binder shared by the workspace display modes.
// Each button carries data-seg-id (state key) + data-seg-value.
function bindSegmentControls(stateKeys) {
  document.querySelectorAll('[data-seg-id]').forEach(btn => {
    btn.onclick = () => {
      const key = stateKeys[btn.dataset.segId];
      if (!key) return;
      state[key] = btn.dataset.segValue;
      rerender();
    };
  });
}

// Shown when the Observatory dataset was swapped away from the certified
// corpus — either the experiment analysis set (Experiment panel runs) or
// propagated Evolution Lab run artifacts.
export function labDatasetBanner() {
  const origin = state.observatory?.datasetOrigin;
  const n = state.observatory?.summaries?.length ?? 0;
  if (origin === 'EXPERIMENT_RUNS') {
    const basis = state.evidenceBasis;
    return `<div class="notice info" style="margin-bottom:12px"><strong>Experiment analysis set.</strong> Analytics reflect ${n} game(s) from ${basis?.includedRunCount ?? '?'} included run(s) under ${esc(basis?.experimentId ?? 'the experiment')} — ${basis?.excludedRunCount ?? 0} recorded run(s) excluded. Manage runs in the Experiment panel, or press Baseline to restore the certified corpus.</div>`;
  }
  if (origin !== 'EVOLUTION_LAB') return '';
  return `<div class="notice info" style="margin-bottom:12px"><strong>Evolution Lab dataset.</strong> Analytics reflect ${n} propagated lab game(s), not the certified corpus. Imported rows are unverified; telemetry coverage may be partial. Restore via Evolution Lab → Runs &amp; artifacts → "Restore certified analytics".</div>`;
}

// ── /compare ──────────────────────────────────────────────────────
export function renderCompare() {
  const o = state.observatory;
  const policies = o.policies ?? [];
  const selectedPolicy = state.selectedPolicy ?? policies[0]?.policyId;
  const rightPolicy = state.comparePolicyRight ?? policies.find(p => p.policyId !== selectedPolicy)?.policyId ?? selectedPolicy;
  const policyMap = Object.fromEntries(policies.map(p => [p.policyId, p]));
  const left = policyMap[selectedPolicy], right = policyMap[rightPolicy];
  const matchupHtml = renderMatchupMatrix();
  const summaries = o.summaries ?? [];
  // Resolve the cross-policy superiority record: prefer the analytics-side
  // record (new artifacts), then the campaign aggregate, which applies the
  // same self-play exclusion. Win rates are cross-policy decisive games only.
  const aggPolicies = state.aggregate?.policies ?? {};
  // Denominator contract: the displayed rate and its CI are ALWAYS derived
  // here from raw counts over decisive cross-policy games, so legacy artifacts
  // whose stored winRate used a different denominator than their stored CI
  // cannot surface a mismatched pair. The all-games rate is shown separately.
  const recordOf = (p) => {
    if (!p) return null;
    let c = null;
    if (p.record && Number.isFinite(p.record.wins)) c = p.record;
    else if (aggPolicies[p.policyId]) {
      const a = aggPolicies[p.policyId];
      // Aggregates that carry crossPolicyGames already use the participation
      // convention for selfPlayGames; older ones counted self-play matches.
      const selfPlay = a.crossPolicyGames != null ? (a.selfPlayGames ?? 0) : 2 * (a.selfPlayGames ?? 0);
      const cross = a.crossPolicyGames ?? (a.games - selfPlay);
      c = { games: a.games, selfPlayGames: selfPlay, crossPolicyGames: cross, wins: a.wins ?? 0, draws: a.draws ?? 0, aborts: a.aborts ?? 0, losses: Math.max(0, cross - (a.wins ?? 0) - (a.draws ?? 0) - (a.aborts ?? 0)) };
    }
    if (!c) return null;
    const decisive = (c.wins ?? 0) + (c.losses ?? 0), all = decisive + (c.draws ?? 0) + (c.aborts ?? 0);
    return { ...c, decisive,
      winRate: decisive ? c.wins / decisive : null, wilson95: decisive ? wilsonInterval(c.wins, decisive) : null,
      allGamesWinRate: all ? c.wins / all : null, allGamesWilson95: all ? wilsonInterval(c.wins, all) : null };
  };
  const opponentsOf = (p) => {
    if (Array.isArray(p?.opponents)) return p.opponents;
    if (!p) return null;
    const seen = new Set();
    for (const s of summaries) {
      const pids = s.policyIds ?? [];
      if (pids.includes(p.policyId)) for (const other of pids) if (other !== p.policyId) seen.add(other);
    }
    return [...seen].sort();
  };
  const seatSplitOf = (p) => {
    if (p?.seatSplit) return p.seatSplit;
    if (!p) return null;
    let seat1 = 0, seat2 = 0;
    for (const s of summaries) {
      const idx = (s.seatOrder ?? []).indexOf(p.policyId);
      if (idx === 0) seat1 += 1; else if (idx === 1) seat2 += 1;
    }
    return seat1 + seat2 > 0 ? { seat1, seat2 } : null;
  };
  const policyCard = (p) => {
    if (!p) return '<div class="notice warning">No data</div>';
    const rec = recordOf(p);
    const seat = seatSplitOf(p);
    const opps = opponentsOf(p);
    const recordText = rec
      ? `${rec.wins}–${rec.losses}${rec.draws ? `–${rec.draws}D` : ''}${rec.aborts ? ` (+${rec.aborts} aborted)` : ''}`
      : null;
    const rate = rec ? (rec.winRate != null ? pct(rec.winRate) : '—') : null;
    const ci = rec?.wilson95 ?? null;
    return `<div>${definitionList([
      ['Policy', p.policyId],
      ['Record (cross-policy)', recordText],
      ['Games', rec ? `${rec.games} total${rec.selfPlayGames ? ` · ${rec.selfPlayGames / 2} self-play match${rec.selfPlayGames > 2 ? 'es' : ''} excluded` : ''}` : (p.matchCount ?? p.games)],
      ['Win rate (decisive cross-policy games)', rate == null ? null : `${rate}${rec ? ` · n=${rec.decisive}` : ''}`],
      ['Win rate 95% CI (same denominator)', ci ? `${pct(ci[0])} to ${pct(ci[1])}` : '—'],
      ['Win rate incl. draws/aborts', rec?.allGamesWinRate != null && (rec.draws || rec.aborts) ? `${pct(rec.allGamesWinRate)} (${pct(rec.allGamesWilson95[0])}–${pct(rec.allGamesWilson95[1])}) · n=${rec.decisive + rec.draws + rec.aborts}` : null],
      ['Seat split', seat ? `S1 ${seat.seat1} · S2 ${seat.seat2}` : null],
      ['Opponents faced', opps ? `${opps.length}${opps.length <= 6 ? ` (${opps.join(', ')})` : ''}` : null],
      ['Avg score margin', (p.avgScoreMargin ?? p.fingerprint?.avgScoreMargin) != null ? Number(p.avgScoreMargin ?? p.fingerprint?.avgScoreMargin).toFixed(1) : null],
      ['Exhausted pass rate', p.exhaustedPassRate != null ? pct(p.exhaustedPassRate) : null],
      ['Response play rate', p.responsePlayRate != null ? pct(p.responsePlayRate) : null],
    ])}</div>`;
  };
  const abba = o.pairedABBA;
  const abbaStatusClass = abba?.designStatus === 'verified' ? 'info' : abba?.designStatus === 'malformed' ? 'error' : 'warning';
  const sbStatus = abba?.seatBalance?.status;
  const seatBalanceNote = abba?.seatBalance?.decisiveLegs
    ? ` Seat effect: seat 1 won ${pct(abba.seatBalance.seat1WinRate)} of ${abba.seatBalance.decisiveLegs} decisive legs${abba.seatBalance.signTest?.pValue != null ? ` (sign-test p=${abba.seatBalance.signTest.pValue})` : ''}${sbStatus === 'insufficient-data' ? ' — underpowered; balance not established' : sbStatus === 'seat-effect-detected' ? ' — significant seat effect detected' : ' (descriptive; non-significance is not demonstrated equivalence)'}.`
    : '';
  const designNote = abba?.scheduleNote
    ? `<div class="notice ${abbaStatusClass}" style="margin-top:12px"><strong>Matched design:</strong> ${esc(abba.scheduleNote)}.${seatBalanceNote}</div>`
    : (abba ? `<div class="notice ${abbaStatusClass}" style="margin-top:12px"><strong>Matched design:</strong> ${abba.totalPairedBlocks ?? 0} complete AB/BA seat-swap pair${abba.totalPairedBlocks === 1 ? '' : 's'} (${abba.designStatus ?? 'unknown'})${abba.incompletePairs ? ` · ${abba.incompletePairs} incomplete` : ''}${abba.malformedBlocks ? ` · ${abba.malformedBlocks} malformed` : ''}.${seatBalanceNote} ${abba.designStatus === 'verified' ? 'Each policy occupied each seat once per block — win rates are seat-controlled observational associations, not causal rankings.' : 'Policy↔seat balance is NOT verified — treat win rates as descriptive only.'}</div>` : '');
  // ── Matchup analyzer header (Atlas UX pass) ─────────────────────
  // Strong A-vs-B hero: decisive win rates with Wilson CIs on a shared
  // interval plot, comparability flags, then fingerprint divergence.
  // All rate/CI values reuse the same recordOf denominator contract.
  const recL = recordOf(left);
  const recR = recordOf(right);
  const matchupSide = (p, rec, color, side) => {
    if (!p) return `<div class="matchup-side"><div class="notice warning">No data</div></div>`;
    const seat = seatSplitOf(p);
    const opps = opponentsOf(p);
    return `<div class="matchup-side${rec && rec.winRate != null && rec.winRate > 0.5 ? ' matchup-lead' : ''}"><small class="eyebrow" style="color:${color}">POLICY ${side}</small><h3>${esc(p.policyId)}</h3><div class="matchup-record">${rec ? `${rec.wins}–${rec.losses}${rec.draws ? `·${rec.draws}D` : ''}` : '—'}</div><div class="matchup-ci">${rec?.winRate != null ? `${pct(rec.winRate)} win rate · 95% CI ${pct(rec.wilson95[0])}–${pct(rec.wilson95[1])} · n=${rec.decisive} decisive` : 'No decisive cross-policy games'}</div><div class="matchup-ci">${rec?.allGamesWinRate != null && (rec.draws || rec.aborts) ? `All-games rate ${pct(rec.allGamesWinRate)} (n=${rec.decisive + rec.draws + rec.aborts})` : ''}${rec?.aborts ? ` · ${rec.aborts} aborts` : ''}</div><div class="matchup-ci">${seat ? `Seats S1 ${seat.seat1} / S2 ${seat.seat2}` : ''}${opps ? ` · ${opps.length} opponents` : ''}</div></div>`;
  };
  const intervalRows = [
    recL?.winRate != null ? { label: left.policyId, estimate: recL.winRate, low: recL.wilson95[0], high: recL.wilson95[1], color: '#5ad7e8', note: `n=${recL.decisive} decisive` } : null,
    recR?.winRate != null ? { label: right.policyId, estimate: recR.winRate, low: recR.wilson95[0], high: recR.wilson95[1], color: '#a78bfa', note: `n=${recR.decisive} decisive` } : null,
  ].filter(Boolean);
  const intervalHtml = intervalRows.length
    ? `<details class="ix-chart-container" data-testid="compare-interval-chart" id="compare-interval-chart" open><summary class="ix-chart-header"><h4>Win-rate intervals (decisive cross-policy games)</h4><span class="footer-note">Wilson 95% CI · dashed line = 50%</span></summary>${intervalPlot({ rows: intervalRows, width: 620, refLine: 0.5, fmt: v => `${(v * 100).toFixed(0)}%`, title: 'Decisive win-rate intervals for the two selected policies', ariaLabel: 'Interval plot comparing decisive cross-policy win rates with Wilson 95% confidence intervals' })}<button class="ix-chart-toggle" data-chart-toggle aria-expanded="false">View as table</button><div class="ix-chart-table-alt" data-chart-table hidden>${chartTableAlternative({ headers: ['Policy', 'Win rate', '95% CI low', '95% CI high', 'Decisive n'], rows: intervalRows.map(r => [r.label, `${(r.estimate * 100).toFixed(1)}%`, `${(r.low * 100).toFixed(1)}%`, `${(r.high * 100).toFixed(1)}%`, r.note]), caption: 'Decisive cross-policy win rates with Wilson 95% intervals' })}</div></details>`
    : '';
  // Comparability flags: what makes this comparison trustworthy or not.
  const oppL = new Set(opponentsOf(left) ?? []);
  const oppR = new Set(opponentsOf(right) ?? []);
  const sharedOpp = [...oppL].filter(x => oppR.has(x)).length;
  const comparabilityHtml = `<div class="matchup-comparability">${[
    recL?.selfPlayGames || recR?.selfPlayGames ? `<span class="matchup-flag flag-info" title="Self-play participations are excluded from cross-policy rates">Self-play excluded</span>` : '',
    abba ? `<span class="matchup-flag ${abba.designStatus === 'verified' ? 'flag-pass' : abba.designStatus === 'malformed' ? 'flag-fail' : 'flag-warn'}" title="${esc(abba.scheduleNote ?? `Matched AB/BA seat-swap — design ${abba.designStatus ?? 'unknown'}`)}">AB/BA pairing: ${abba.designStatus === 'verified' ? `${abba.totalPairedBlocks} verified pair${abba.totalPairedBlocks === 1 ? '' : 's'}` : (abba.designStatus ?? 'unverified')}</span>` : '',
    `<span class="matchup-flag" title="Distinct policies both A and B have faced">${sharedOpp} shared opponent${sharedOpp === 1 ? '' : 's'}</span>`,
    recL && recR ? `<span class="matchup-flag ${Math.min(recL.decisive ?? 0, recR.decisive ?? 0) >= 10 ? 'flag-pass' : 'flag-warn'}" title="Decisive cross-policy games per policy">Decisive n: ${recL.decisive ?? 0} / ${recR.decisive ?? 0}</span>` : '',
    oppL.size !== oppR.size ? `<span class="matchup-flag flag-warn" title="The two policies faced different opponent pools — schedule imbalance limits comparability">Schedule imbalance</span>` : '',
  ].filter(Boolean).join('')}</div>`;
  // Fingerprint divergence: per-dimension positions normalized to the
  // policy field, so marks are comparable across policies. Descriptive.
  const FP_DIMS = [
    ['scoreAggression', 'Score aggression'], ['responseUse', 'Response use'],
    ['responseConservation', 'Response conservation'], ['privateChoiceDensity', 'Private-choice density'],
    ['advancedFrequency', 'Advanced frequency'], ['ultraFrequency', 'Ultra frequency'],
    ['voltageFrequency', 'Voltage frequency'], ['matchLength', 'Match length'],
  ];
  const fpMax = {};
  for (const [k] of FP_DIMS) fpMax[k] = Math.max(...policies.map(p => Math.abs(Number(p.fingerprint?.[k] ?? 0))), 1e-9);
  const fingerprintHtml = left && right ? `<details class="ix-chart-container" data-testid="compare-fingerprint" open><summary class="ix-chart-header"><h4>Behavioral fingerprint divergence</h4><span class="footer-note">A = cyan, B = violet · positions normalized to the policy field (descriptive)</span></summary><div class="fingerprint-bars">${FP_DIMS.map(([k, label]) => {
    const va = Number(left.fingerprint?.[k] ?? 0), vb = Number(right.fingerprint?.[k] ?? 0);
    const pa = Math.min(1, Math.abs(va) / fpMax[k]) * 100, pb = Math.min(1, Math.abs(vb) / fpMax[k]) * 100;
    const delta = vb - va;
    return `<div class="fingerprint-row"><span>${esc(label)}</span><span class="fingerprint-track"><span class="fingerprint-mark" style="left:${pa.toFixed(1)}%;background:#5ad7e8" title="A ${esc(left.policyId)}: ${va.toFixed(2)}"></span><span class="fingerprint-mark" style="left:${pb.toFixed(1)}%;background:#a78bfa" title="B ${esc(right.policyId)}: ${vb.toFixed(2)}"></span></span><span class="fingerprint-delta">${delta >= 0 ? '+' : ''}${delta.toFixed(2)}</span></div>`;
  }).join('')}</div></details>` : '';
  const matchupHero = `<div class="matchup-hero">${matchupSide(left, recL, '#5ad7e8', 'A')}<div class="matchup-vs">VS</div>${matchupSide(right, recR, '#a78bfa', 'B')}</div>${comparabilityHtml}${intervalHtml}${fingerprintHtml}`;
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Policy Comparison</h2><p>How do these two policies differ, and how trustworthy is the comparison?</p></div><div class="toolbar"><select id="compare-left">${policies.map(p => `<option value="${esc(p.policyId)}" ${p.policyId === selectedPolicy ? 'selected' : ''}>${esc(p.policyId)}</option>`).join('')}</select><span>vs</span><select id="compare-right">${policies.map(p => `<option value="${esc(p.policyId)}" ${p.policyId === rightPolicy ? 'selected' : ''}>${esc(p.policyId)}</option>`).join('')}</select></div></div><div class="panel-body">${labDatasetBanner()}${obsContextStrip(o)}${matchupHero}<div class="grid two">${[left, right].map(policyCard).join('')}</div>${designNote}${matchupHtml}</div></section>`;
  document.querySelector('#compare-left').onchange = e => { state.selectedPolicy = e.target.value; rerender(); };
  document.querySelector('#compare-right').onchange = e => { state.comparePolicyRight = e.target.value; rerender(); };
  bindChartToggle('#matchup-matrix-chart');
  bindChartToggle('#compare-interval-chart');
  document.querySelector('#matchup-source')?.addEventListener('change', e => {
    state.matchupSource = e.target.value === 'all' ? null : e.target.value;
    rerender();
  });
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

// Propagated lab datasets pool several cohorts: one per Batch Matrix manifest
// (cell runs share matrixId) plus one per standalone run, alongside certified
// rows. A single axis across cohorts leaves honest 'no-data' cells wherever a
// policy pair never played — the scope filter isolates one round robin.
function matchupCohorts(summaries) {
  const groups = new Map();
  for (const s of summaries) {
    const key = s.matrixId
      ? `matrix:${s.matrixId}`
      : s.telemetryOrigin === 'EVOLUTION_LAB'
        ? `lab:${s.labRunId ?? 'unknown'}`
        : 'certified';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  return groups;
}

function matchupCohortLabel(key) {
  if (key === 'certified') return 'Certified corpus';
  const id = key.slice(key.indexOf(':') + 1);
  const shortId = id.length > 22 ? id.slice(0, 21) + '…' : id;
  return key.startsWith('matrix:') ? `Batch matrix ${shortId}` : `Lab run ${shortId}`;
}

export function renderMatchupMatrix() {
  const allSummaries = state.observatory?.summaries ?? [];
  const cohorts = matchupCohorts(allSummaries);
  const scope = state.matchupSource && cohorts.has(state.matchupSource) ? state.matchupSource : 'all';
  const summaries = scope === 'all' ? allSummaries : cohorts.get(scope);
  const scopeHtml = cohorts.size > 1
    ? `<label class="ix-matchup-scope">Dataset <select id="matchup-source" data-testid="matchup-source">${['all', ...[...cohorts.keys()].sort((a, b) => matchupCohortLabel(a).localeCompare(matchupCohortLabel(b)))].map(k => `<option value="${esc(k)}" ${k === scope ? 'selected' : ''}>${esc(k === 'all' ? `All datasets (${allSummaries.length} matches)` : `${matchupCohortLabel(k)} (${cohorts.get(k).length} matches)`)}</option>`).join('')}</select></label>`
    : '';
  const { wins, policies } = computeMatchupMatrix(summaries);
  if (policies.length < 2) {
    return `${scopeHtml}<div class="ix-chart-empty" data-testid="matchup-matrix-empty">No decisive 2-player matches available to compute a matchup matrix. Run a campaign with multiple policies.</div>`;
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
      row.push([winRate, { aWins, bWins, total, ci: wilsonInterval(aWins, total) }]);
    }
    cells.push(row);
  }
  // Cell intensity encodes BOTH outcome direction and evidence strength:
  // alpha scales with sqrt of decisive games so a 1–0 cell cannot visually
  // resemble a 50–10 cell. Tiny samples additionally get a dashed border.
  const FULL_EVIDENCE_N = 24;
  const TINY_SAMPLE_N = 6;
  const colorScale = (v, meta) => {
    if (v == null || !Number.isFinite(v)) return 'rgba(255,255,255,0.03)';
    // 0.5 = neutral (dark), >0.5 = green (A wins), <0.5 = red (B wins)
    const intensity = Math.abs(v - 0.5) * 2;
    const evidence = meta?.total ? Math.min(1, Math.sqrt(meta.total / FULL_EVIDENCE_N)) : 0;
    const alpha = 0.08 + intensity * 0.75 * (0.35 + 0.65 * evidence);
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
    ariaLabel: 'Heatmap of policy-vs-policy win rates; green indicates the row policy wins more often, red indicates the column policy wins more often; cell brightness scales with decisive game count',
    cellTitle: (r, c, value, meta) => {
      if (r === c) return `${policies[r]} (self-play — not a matchup)`;
      if (!meta || meta.total === 0) return `${policies[r]} vs ${policies[c]}: no decisive games played`;
      const a = policies[r], b = policies[c];
      const ci = meta.ci ?? null;
      return `${a} vs ${b}: ${meta.aWins}–${meta.bWins} in ${meta.total} decisive games · win rate ${pct(value)}${ci ? ` · 95% CI ${pct(ci[0])}–${pct(ci[1])}` : ''}${meta.total < TINY_SAMPLE_N ? ' · tiny sample — weak evidence' : ''}`;
    },
    cellAttrs: (r, c, meta) => {
      if (r === c || !meta || meta.total === 0) return '';
      const tiny = meta.total < TINY_SAMPLE_N ? ' stroke-dasharray="3 2" stroke="rgba(255,255,255,0.45)"' : '';
      return ` data-policy-a="${esc(policies[r])}" data-policy-b="${esc(policies[c])}" data-testid="matchup-cell-${r}-${c}" role="button" tabindex="0"${tiny}`;
    },
  });
  // Table alternative: show A, B, A-wins, B-wins, A win rate, CI, sample flag
  const tableRows = [];
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (r === c) continue;
      const a = policies[r], b = policies[c];
      const aWins = wins[a]?.[b] ?? 0;
      const bWins = wins[b]?.[a] ?? 0;
      const total = aWins + bWins;
      if (total === 0) continue;
      const ci = wilsonInterval(aWins, total);
      tableRows.push([a, b, aWins, bWins, ((aWins / total) * 100).toFixed(1) + '%', `${pct(ci[0])}–${pct(ci[1])}`, total < TINY_SAMPLE_N ? `tiny sample (n=${total})` : `n=${total}`]);
    }
  }
  const tableAlt = chartTableAlternative({
    headers: ['Policy A', 'Policy B', 'A wins', 'B wins', 'A win rate', '95% CI', 'Sample'],
    rows: tableRows,
    caption: 'Policy matchup win rates with decisive-game count and Wilson 95% interval',
  });
  return `<details class="ix-chart-container" data-testid="matchup-matrix" id="matchup-matrix-chart" open><summary class="ix-chart-header"><h4>Matchup matrix (policy vs policy win rate)</h4><span class="footer-note">${policies.length} policies · green = row wins more, red = column wins more, dark = pair never met · brightness scales with decisive games, dashed border = tiny sample (n&lt;${TINY_SAMPLE_N})</span></summary>${scopeHtml}${svg}<button class="ix-chart-toggle" data-chart-toggle="matchup-matrix" aria-expanded="false">View as table</button><div class="ix-chart-table-alt" data-chart-table="matchup-matrix" hidden>${tableAlt}</div></details>`;
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
      const { loadTraceIndex, loadTraceData } = await import('../data-loader.js?v=8951e2c35a42');
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
  const { loadTraceData } = await import('../data-loader.js?v=8951e2c35a42');
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
    const _matchId = rec.matchId;
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
  const _policies = state.observatory?.policies ?? [];
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
  { value: 'aggregate', label: 'Aggregates' },
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

const CHOICE_SUPPORT_LABEL = { identified: 'Identified', limited: 'Limited', unsupported: 'Unsupported', unmeasured: 'Unmeasured' };
const CHOICE_SUPPORT_CLASS = { identified: 'supported', limited: 'warning', unsupported: 'warning', unmeasured: '' };

function renderPickRateCell(m) {
  const st = m.pickRateStatus;
  const cs = m.choiceSupport;
  const supportNote = cs && cs.status !== 'identified' && cs.status !== 'unmeasured'
    ? ` · only ${cs.declinedCount} legal-but-unselected — not preference evidence`
    : '';
  if (!st) return m.pickRateWhenLegal != null ? pct(m.pickRateWhenLegal) : 'N/A';
  if (st.status === 'available') return `<span${cs && cs.status !== 'identified' && cs.status !== 'unmeasured' ? ' class="metric-degenerate" style="border-bottom:1px dashed var(--warn,#d9a03f)"' : ''} title="${st.numerator}/${st.denominator}${esc(supportNote)}">${pct(st.value)}</span>`;
  if (st.status === 'zero-opportunities') return `<span class="metric-na" title="${esc(st.detail ?? '')}">0 opps</span>`;
  if (st.status === 'missing-telemetry') return `<span class="metric-na" title="${esc(st.detail ?? '')}">no telemetry</span>`;
  return 'N/A';
}

function renderWinAssocCell(m, field, statusField) {
  const st = m[statusField];
  const ciField = `${field}95`;
  if (m[field] != null) {
    const ci = m[ciField];
    const ciText = Array.isArray(ci) && ci.every(Number.isFinite) ? `95% CI ${(ci[0] * 100).toFixed(1)} to ${(ci[1] * 100).toFixed(1)} pp` : 'no CI';
    const basis = field === 'adjustedWinAssociation'
      ? 'stratified by policy, seat, and profile — association, not causation'
      : 'unadjusted difference in win proportions — association, not causation';
    return `<span title="${esc(ciText)} · n=${st?.sampleSize ?? '—'} · ${esc(basis)}">${(m[field] * 100).toFixed(1)} pp</span>`;
  }
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
  if (h.eligibleSynergyPairs > 0) {
    // Newer artifacts distinguish model success from evidence qualification.
    // Older artifacts only carried successfullyModeledSynergyPairs, which
    // actually counted evidence-qualified pairs.
    const qualified = h.evidenceQualifiedSynergyPairs ?? h.successfullyModeledSynergyPairs ?? 0;
    const modeled = h.evidenceQualifiedSynergyPairs != null ? (h.successfullyModeledSynergyPairs ?? h.eligibleSynergyPairs) : null;
    warnings.push(`<div class="notice info">${modeled != null ? `${modeled} of ${h.eligibleSynergyPairs} eligible synergy pairs produced a modeled estimate; ` : ''}${qualified} reached EXPLORATORY+ evidence${h.rejectedSynergyPairs != null ? ` · ${h.rejectedSynergyPairs} pairs rejected before modeling (see diagnostics)` : ''}.</div>`);
  }
  if (h.unmappedDiagnostics > 0) warnings.push(`<div class="notice info">${h.unmappedDiagnostics} diagnostic tags lack registry entries — tracked and measured, but not canonical mechanics.</div>`);
  const stats = `Tracked: ${h.trackedEntities} · Canonical: ${h.canonicalMechanics} · With pick rate: ${h.entitiesWithValidPickRate} · With adj. assoc.: ${h.entitiesWithAdjustedAssociation} · With point impact: ${h.entitiesWithPointImpact} · Synergy pairs: ${h.eligibleSynergyPairs}`;
  // Provenance + taxonomy reconciliation line: makes every denominator
  // traceable without leaving the page.
  const dims = o.taxonomyDimensions ?? {};
  const rec = o.reconciliation;
  const dimLine = Object.keys(dims).length
    ? ` · Breakdown: ${Object.entries(dims).map(([d, n]) => `${n} ${d}`).join(' + ')}${rec?.invariantHolds === false ? ' (RECONCILIATION FAILED)' : ''}`
    : '';
  const epoch = o.evidenceEpoch ?? state.aggregate?.evidenceEpoch ?? null;
  const engine = o.engineVersion ?? state.aggregate?.engineVersion ?? null;
  const provLine = epoch || engine ? ` · epoch ${epoch ?? '—'} · engine ${engine ?? '—'} · rules ${o.rulesVersion ?? state.aggregate?.rulesVersion ?? '—'}` : '';
  return `<div class="campaign-health">${warnings.join('')}<div class="health-stats">${esc(stats)}${esc(dimLine)}${esc(provLine)}</div></div>`;
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
    barAttrs: item => ` class="ix-bar-clickable" data-mechanic="${esc(item.mechanic)}"`,
  });
  const tableAlt = chartTableAlternative({
    headers: ['Mechanic', 'Pick rate (legal)', 'Evidence'],
    rows: withPick.map(i => [i.label, (i.value * 100).toFixed(1) + '%', '']),
    caption: 'Top mechanics by legal pick rate',
  });
  return `<details class="ix-chart-container" data-testid="mechanics-pickrate-chart" open><summary class="ix-chart-header"><h4>Pick-rate overview (top 15 by legal pick rate)</h4><span class="footer-note">Click a bar to inspect that mechanic</span></summary>${svg}<button class="ix-chart-toggle" data-chart-toggle="mechanics-pickrate" aria-expanded="false">View as table</button><div class="ix-chart-table-alt" data-chart-table="mechanics-pickrate" hidden>${tableAlt}</div></details>`;
}

// ── Mechanics hero scatter (Atlas UX pass) ──────────────────────
// Bubble scatter: X = usage axis (legal pick rate / prevalence /
// conditional choice rate), Y = outcome axis (adjusted or raw win
// association / point impact). Bubble size = sample support, color =
// evidence grade. Clicking a point selects the mechanic dossier.
// Only mechanics with finite values on BOTH axes are plotted; the count
// of excluded entities is disclosed, never silently dropped.
const MECHANIC_SCATTER_X = {
  pickRate: { label: 'Legal pick rate', fmt: v => `${(v * 100).toFixed(0)}%`, acc: m => m.pickRateWhenLegal },
  participantPrevalence: { label: 'Participant prevalence', fmt: v => `${(v * 100).toFixed(0)}%`, acc: m => m.participantPrevalence ?? m.matchUsageRate },
  matchPrevalence: { label: 'Match prevalence', fmt: v => `${(v * 100).toFixed(0)}%`, acc: m => m.matchPrevalence },
  conditionalRate: { label: 'Conditional choice rate', fmt: v => `${(v * 100).toFixed(0)}%`, acc: (m, o) => o.choiceAnalysis?.entities?.[m.mechanic]?.conditionalRate },
};
const MECHANIC_SCATTER_Y = {
  adjusted: { label: 'Adjusted win association', unit: 'pp', fmt: v => `${(v * 100).toFixed(0)}pp`, acc: m => m.adjustedWinAssociation, refLabel: 'no association' },
  raw: { label: 'Raw win association', unit: 'pp', fmt: v => `${(v * 100).toFixed(0)}pp`, acc: m => m.rawWinAssociation ?? m.outcomeAssociation, refLabel: 'no association' },
  pointImpact: { label: 'Point impact (mean Δ)', unit: 'pts', fmt: v => Number(v).toFixed(1), acc: m => m.actorPointImpact?.mean ?? (m.pointImpactStatus?.status === 'available' ? m.pointImpactStatus.value : null), refLabel: 'no impact' },
};

function renderMechanicsScatter(mechanics, o) {
  const xMode = MECHANIC_SCATTER_X[state.mechanicsPlotX] ? state.mechanicsPlotX : 'pickRate';
  const yMode = MECHANIC_SCATTER_Y[state.mechanicsPlotY] ? state.mechanicsPlotY : 'adjusted';
  const xm = MECHANIC_SCATTER_X[xMode];
  const ym = MECHANIC_SCATTER_Y[yMode];
  const gradeColor = (g) => {
    const r = EVIDENCE_GRADE_RANK[g] ?? 0;
    if (r >= 4) return '#4fd387';
    if (r === 3) return '#5ad7e8';
    if (r === 2) return '#f1bd5d';
    return 'rgba(255,255,255,0.3)';
  };
  const points = [];
  let excluded = 0;
  for (const m of mechanics) {
    const x = xm.acc(m, o);
    const y = ym.acc(m);
    if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) { excluded += 1; continue; }
    const n = Number(m.sampleSize ?? m.selectionCount ?? 0) || 1;
    points.push({
      x: Number(x), y: Number(y), r: n,
      color: gradeColor(m.evidenceGrade),
      label: m.displayName ?? m.mechanic,
      title: `${m.displayName ?? m.mechanic} — ${xm.label}: ${xm.fmt(Number(x))} · ${ym.label}: ${ym.fmt(Number(y))} · n=${fmt(n)} · ${m.evidenceGrade ?? 'INSUFFICIENT'}`,
      attrs: `data-scatter-mechanic="${esc(m.mechanic)}" tabindex="0" role="button" aria-label="${esc(`Inspect ${m.displayName ?? m.mechanic}`)}"`,
    });
  }
  if (!points.length) return '';
  const sortedX = points.map(p => p.x).sort((a, b) => a - b);
  const medianX = sortedX[Math.floor(sortedX.length / 2)];
  const isAssoc = ym.unit === 'pp';
  const svg = scatterPlot({
    points,
    width: 680, height: 380,
    xLabel: xm.label,
    yLabel: `${ym.label} (${ym.unit})`,
    xFmt: xm.fmt, yFmt: ym.fmt,
    xRef: medianX, xRefLabel: 'cohort median',
    yRef: 0, yRefLabel: ym.refLabel,
    quadrantLabels: {
      tr: isAssoc ? 'high uptake · positive assoc' : 'high uptake · favorable',
      tl: isAssoc ? 'low uptake · positive assoc' : 'low uptake · favorable',
      br: isAssoc ? 'high uptake · negative assoc' : 'high uptake · unfavorable',
      bl: isAssoc ? 'low uptake · negative assoc' : 'low uptake · unfavorable',
    },
    title: `Mechanic landscape — ${xm.label} vs ${ym.label}`,
    ariaLabel: `Bubble scatter of ${points.length} mechanics: x = ${xm.label}, y = ${ym.label}; bubble size encodes sample support and color encodes evidence grade`,
  });
  const tableAlt = chartTableAlternative({
    headers: ['Mechanic', xm.label, ym.label, 'Sample', 'Evidence'],
    rows: points.map(p => [p.label, xm.fmt(p.x), ym.fmt(p.y), p.r, '']),
    caption: `${ym.label} vs ${xm.label} per mechanic`,
  });
  const seg = `<div class="ix-filter-toolbar" style="margin-bottom:10px">${segmentControl({ id: 'mechanics-x', label: 'X', options: Object.entries(MECHANIC_SCATTER_X).map(([value, m]) => ({ value, label: m.label })), active: xMode })}${segmentControl({ id: 'mechanics-y', label: 'Y', options: Object.entries(MECHANIC_SCATTER_Y).map(([value, m]) => ({ value, label: m.label })), active: yMode })}</div>`;
  const legend = `<div class="matrix-legend"><span class="matrix-legend-item"><span class="matrix-legend-swatch" style="background:#4fd387"></span>Robust</span><span class="matrix-legend-item"><span class="matrix-legend-swatch" style="background:#5ad7e8"></span>Supported</span><span class="matrix-legend-item"><span class="matrix-legend-swatch" style="background:#f1bd5d"></span>Exploratory</span><span class="matrix-legend-item"><span class="matrix-legend-swatch" style="background:rgba(255,255,255,.3)"></span>Insufficient</span><span class="matrix-legend-item" style="margin-left:auto">Bubble size = sample support · click a point for its dossier</span></div>`;
  const exclNote = excluded > 0 ? `<div class="obs-flow-note">${excluded} of ${mechanics.length} entities are not plotted — missing ${esc(xm.label.toLowerCase())} or ${esc(ym.label.toLowerCase())} on the current axes.</div>` : '';
  return `<details class="ix-chart-container" data-testid="mechanics-scatter-chart" id="mechanics-scatter-chart" open><summary class="ix-chart-header"><h4>Mechanic landscape</h4><span class="footer-note">What is both frequently selected and associated with better/worse outcomes? Observational association — not causation.</span></summary>${seg}${svg}${legend}${exclNote}<button class="ix-chart-toggle" data-chart-toggle aria-expanded="false">View as table</button><div class="ix-chart-table-alt" data-chart-table hidden>${tableAlt}</div></details>`;
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
    // Not a canonical mechanic — an aggregate view over card-specific variants.
    // Marking the dimension keeps it out of the canonical-mechanic count/filter.
    dimension: 'aggregate',
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
  return `<details class="ix-chart-container" data-testid="quarantine-ledger" style="margin-top:16px"><summary class="ix-chart-header"><h4>Quarantine ledger (${ledger.length} unregistered tags)</h4><span class="footer-note">Tags excluded from the analysis pipeline's canonical-mechanic and synergy surfaces</span></summary><div class="notice warning" style="margin-bottom:12px"><strong>These tags lack registry entries.</strong> They are still tracked and measured in this dataset, but are excluded from the analysis pipeline's canonical mechanic interpretation and synergy modeling.</div>${reasonGroups}</details>`;
}

// ── Choice-set diagnostics ─────────────────────────────────────
// Conditional selection analysis: for each entity, the "selected" count is
// relative to frames where the entity was *simultaneously legal* with the
// observed alternatives — not a raw marginal pick rate. Choice entropy is
// computed only within identical offered sets; different choice sets are
// never pooled. Deterministic selection is decision behavior, not balance
// evidence.
function renderChoiceDiagnostics(o) {
  const ca = o.choiceAnalysis;
  if (!ca) {
    return o.choiceAnalysisError
      ? `<details class="ix-chart-container" data-testid="choice-diagnostics" style="margin-top:16px"><summary class="ix-chart-header"><h4>Choice-set diagnostics</h4><span class="footer-note">Unavailable</span></summary><div class="notice warning">Choice-set analysis failed: ${esc(o.choiceAnalysisError)}</div></details>`
      : '';
  }
  const cov = ca.coverage ?? {};
  const contexts = (ca.contexts ?? []).slice(0, 25);
  const entities = Object.entries(ca.entities ?? {})
    .sort((a, b) => (b[1].offeredCount ?? 0) - (a[1].offeredCount ?? 0))
    .slice(0, 25);
  const covHtml = `<div class="notice info" style="margin-bottom:12px"><strong>Coverage:</strong> ${fmt(cov.decisionsWithLegalActions ?? 0)} of ${fmt(cov.decisionsSeen ?? 0)} recorded decisions carry a legal-action set; ${fmt(cov.multiOptionDecisions ?? 0)} frames offered multiple options. Selections below are <em>conditional on the simultaneously-legal set</em> — a high conditional rate with no legal-but-unselected support is a regularity, not an identified preference.</div>`;
  const entityRows = entities.map(([e, rec]) => {
    const contested = (rec.pairwise ?? []).filter(p => (p.entitySelected + p.otherSelected) > 0);
    const rivals = contested.length;
    const shareTxt = contested.length
      ? contested.slice(0, 3).map(p => `${esc(p.versus)} ${p.conditionalShare != null ? pct(p.conditionalShare) : '—'} (${p.entitySelected}/${p.entitySelected + p.otherSelected})`).join('; ')
      : '—';
    const declined = rec.declinedCount ?? (rec.offeredCount != null && rec.selectedCount != null ? rec.offeredCount - rec.selectedCount : null);
    const cs = rec.choiceSupport?.status ?? (declined != null ? (declined <= 0 ? 'unsupported' : declined < 20 ? 'limited' : 'identified') : 'unmeasured');
    return `<tr><td class="mono">${esc(e)}</td><td>${fmt(rec.offeredCount)}</td><td>${fmt(rec.selectedCount)}</td><td>${declined != null ? fmt(declined) : '—'}</td><td>${rec.conditionalRate != null ? pct(rec.conditionalRate) : '—'}</td><td>${rivals}</td><td style="font-size:11px">${shareTxt}</td><td><span class="status-badge ${CHOICE_SUPPORT_CLASS[cs] ?? ''}" title="Legal-but-unselected frames = the only observed support for declining this option. ${cs === 'unsupported' ? 'Zero — no preference evidence exists.' : cs === 'limited' ? 'Below the identification threshold — weak preference evidence.' : cs === 'identified' ? 'Sufficient declines to discuss choice behavior.' : 'Opportunity telemetry unavailable.'}">${esc(CHOICE_SUPPORT_LABEL[cs] ?? cs)}</span></td></tr>`;
  }).join('');
  const entityHtml = entities.length
    ? `<h4 style="margin:12px 0 4px;font-size:12px;color:var(--text-bright)">Conditional selection (entity vs jointly-legal alternatives)</h4><div class="table-wrap"><table class="data-table"><thead><tr><th>Entity</th><th>Offered</th><th>Selected</th><th>Declined</th><th>Conditional rate</th><th>Contested rivals</th><th>Head-to-head (top 3)</th><th>Choice support</th></tr></thead><tbody>${entityRows}</tbody></table></div>`
    : `<div class="notice info">No entity-level choice data.</div>`;
  const ctxRows = contexts.map(c => `<tr><td class="mono" style="font-size:11px">${esc(c.contextId)}</td><td>${fmt(c.frameCount)}</td><td>${c.offeredCount}</td><td>${c.dominantOption != null ? `${esc(c.dominantOption)} (${c.dominantShare != null ? pct(c.dominantShare) : '—'})` : '—'}</td><td>${c.normalizedEntropy != null ? c.normalizedEntropy.toFixed(3) : '—'}</td><td><span class="status-badge ${c.evidence === 'OBSERVED' ? 'info' : 'warning'}">${esc(c.evidence ?? 'INSUFFICIENT_DATA')}</span></td></tr>`).join('');
  const ctxHtml = contexts.length
    ? `<h4 style="margin:12px 0 4px;font-size:12px;color:var(--text-bright)">Decision diversity by recurring choice context (top ${contexts.length} of ${ca.contextCount ?? 0})</h4><div class="notice info" style="margin-bottom:8px">Normalized entropy is Shannon entropy of the selected-option distribution divided by log2(offered options): 0 = always the same pick, 1 = uniform. Only identical offered sets are pooled — deterministic Profiles are <em>decision behavior</em>, not balance evidence.</div><div class="table-wrap"><table class="data-table"><thead><tr><th>Offered set</th><th>Frames</th><th>Options</th><th>Dominant pick (share)</th><th>Normalized entropy</th><th>Evidence</th></tr></thead><tbody>${ctxRows}</tbody></table></div>`
    : `<div class="notice info">No recurring choice contexts met the minimum-frame threshold (${fmt(cov.decisionsUsable ?? 0)} usable decisions).</div>`;
  return `<details class="ix-chart-container" data-testid="choice-diagnostics" style="margin-top:16px"><summary class="ix-chart-header"><h4>Choice-set diagnostics</h4><span class="footer-note">Conditional selection + decision diversity. Diagnostic only — not balance evidence.</span></summary>${covHtml}${entityHtml}${ctxHtml}</details>`;
}

// Per-mechanic conditional block for the detail view: when this mechanic was
// selected, which alternatives were simultaneously legal?
function renderMechanicChoiceBlock(m, o) {
  const rec = o.choiceAnalysis?.entities?.[m.mechanic];
  if (!rec) return '';
  const pairs = (rec.pairwise ?? []).filter(p => p.jointFrames > 0).slice(0, 12);
  const structuralPairs = pairs.filter(p => p.relation === 'same-action-only' || p.relation === 'inseparable');
  const pairRows = pairs.map(p => {
    // relation is absent on pre-1.1.0 artifacts — treat as independent (historical rendering).
    const structural = p.relation === 'same-action-only' || p.relation === 'inseparable';
    const shareCell = p.conditionalShare != null
      ? `${pct(p.conditionalShare)}${structural ? '<span class="metric-na" title="The rival tag was never an independently selectable option in these frames — this share is structural co-occurrence, not a contested choice.">*</span>' : ''}`
      : '—';
    const rivalCell = p.relation == null
      ? fmt(p.rivalOptionFrames ?? '—')
      : (structural ? '<span class="metric-na">never</span>' : fmt(p.rivalOptionFrames));
    return `<tr><td class="mono">${esc(p.versus)}</td><td>${fmt(p.jointFrames)}</td><td>${rivalCell}</td><td>${fmt(p.entitySelected)}</td><td>${fmt(p.otherSelected)}</td><td>${fmt(p.neitherSelected)}</td><td>${shareCell}</td></tr>`;
  }).join('');
  const declined = rec.declinedCount ?? null;
  const declines = Object.entries(rec.declineOutcomes ?? {}).filter(([k]) => k !== '#other').sort((a, b) => b[1] - a[1]);
  const declineTxt = declines.length
    ? ` Declines (${declined ?? '0'}): ${declines.slice(0, 5).map(([k, n]) => `${esc(k)} ×${fmt(n)}`).join(', ')}${rec.declineOutcomes?.['#other'] ? `, other ×${fmt(rec.declineOutcomes['#other'])}` : ''}.`
    : '';
  const supportWarn = declined != null && declined < 20
    ? `<div class="notice warning" style="margin-bottom:8px" data-testid="choice-support-warning"><strong>Choice identification: ${esc(CHOICE_SUPPORT_LABEL[rec.choiceSupport?.status ?? (declined <= 0 ? 'unsupported' : 'limited')])}.</strong> Selected in ${fmt(rec.selectedCount)} of ${fmt(rec.offeredCount)} offered frames — only ${fmt(declined)} legal-but-unselected. This is an observed regularity, not identified preference.</div>`
    : '';
  const structuralNote = structuralPairs.length
    ? `<div class="notice info" style="margin-top:8px">* ${structuralPairs.length} row${structuralPairs.length === 1 ? '' : 's'} list tag${structuralPairs.length === 1 ? '' : 's'} that never existed as an independent option in these frames (e.g. a family tag co-appearing with its own variant on the same action). Their conditional shares are structural co-occurrence, not contested choices.</div>`
    : '';
  return `<h3 style="margin-top:16px">Conditional choice set</h3><div class="notice info" style="margin-bottom:8px">Offered ${fmt(rec.offeredCount)} times, selected ${fmt(rec.selectedCount)} (conditional rate ${rec.conditionalRate != null ? pct(rec.conditionalRate) : '—'}).${esc(declineTxt)} Rows show what was <em>simultaneously legal</em> — "independently selectable" counts frames where the rival could be chosen as a different action; rivals never independently offered cannot be "declined in favor of" this entity.</div>${supportWarn}<div class="table-wrap"><table class="data-table"><thead><tr><th>Jointly legal with</th><th>Joint frames</th><th>Rival independently selectable</th><th>This selected</th><th>Rival selected</th><th>Neither</th><th>Conditional share</th></tr></thead><tbody>${pairRows}</tbody></table></div>${structuralNote}`;
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
  const scatterHtml = renderMechanicsScatter(filtered, o);
  const chartHtml = renderMechanicsPickRateChart(filtered);
  const quarantineHtml = renderQuarantineLedger(o);
  const choiceHtml = renderChoiceDiagnostics(o);
  // Overview strip: the "what am I looking at / how strong is the
  // evidence" answer in one glance. Strongest-association cards only
  // surface estimates that are evidence-qualified (SUPPORTED+); an
  // unqualified extreme is never presented as a finding.
  const h = o.campaignHealth ?? {};
  const cov = o.choiceAnalysis?.coverage ?? {};
  const qualified = mechanics.filter(m => (EVIDENCE_GRADE_RANK[m.evidenceGrade] ?? 0) >= 3 && Number.isFinite(m.adjustedWinAssociation));
  const bestPos = qualified.filter(m => m.adjustedWinAssociation > 0).sort((a, b) => b.adjustedWinAssociation - a.adjustedWinAssociation)[0] ?? null;
  const bestNeg = qualified.filter(m => m.adjustedWinAssociation < 0).sort((a, b) => a.adjustedWinAssociation - b.adjustedWinAssociation)[0] ?? null;
  const qualifiedCount = mechanics.filter(m => (EVIDENCE_GRADE_RANK[m.evidenceGrade] ?? 0) >= 3).length;
  const exploratoryCount = mechanics.filter(m => (EVIDENCE_GRADE_RANK[m.evidenceGrade] ?? 0) === 2).length;
  const quarantineCount = (o.quarantineLedger ?? []).length;
  const summaryHtml = metricStrip([
    { label: 'Tracked entities', value: fmt(h.trackedEntities ?? mechanics.length), sub: `${h.canonicalMechanics ?? '—'} canonical mechanics` },
    { label: 'Valid denominators', value: `${fmt(h.entitiesWithValidPickRate ?? 0)}`, sub: 'with legal-opportunity records', tone: (h.entitiesWithValidPickRate ?? 0) < (h.trackedEntities ?? 0) ? 'alert' : null },
    { label: 'Evidence-qualified', value: fmt(qualifiedCount), sub: `${exploratoryCount} more at exploratory`, tone: qualifiedCount ? 'lead' : null },
    { label: 'Strongest positive', value: bestPos ? `+${(bestPos.adjustedWinAssociation * 100).toFixed(1)}pp` : '—', sub: bestPos ? esc(bestPos.displayName ?? bestPos.mechanic) : 'no supported positive association', tone: bestPos ? 'positive' : null },
    { label: 'Strongest negative', value: bestNeg ? `${(bestNeg.adjustedWinAssociation * 100).toFixed(1)}pp` : '—', sub: bestNeg ? esc(bestNeg.displayName ?? bestNeg.mechanic) : 'no supported negative association', tone: bestNeg ? 'negative' : null },
    { label: 'Decisions analyzed', value: fmt(cov.multiOptionDecisions ?? 0), sub: `${fmt(cov.decisionsWithLegalActions ?? 0)} frames with legal sets` },
    quarantineCount ? { label: 'Quarantined tags', value: fmt(quarantineCount), sub: 'unregistered — excluded from canon', tone: 'alert' } : null,
  ]);
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Mechanics Atlas</h2><p>Prevalence, pick rate, win association, and evidence by mechanic — ${filtered.length} of ${mechanics.length} entities</p></div>${filterHtml}</div><div class="panel-body">${labDatasetBanner()}${obsContextStrip(o)}${healthHtml}${summaryHtml}${scatterHtml}${chartHtml}<div class="table-wrap"><table class="data-table"><thead><tr>${headerHtml}</tr></thead><tbody>${sorted.map(m => `<tr class="clickable-row" data-mechanic="${esc(m.mechanic)}"><td><b>${esc(m.displayName ?? m.mechanic)}</b></td><td>${esc(m.dimension ?? 'canonical-mechanic')}</td><td>${fmt(m.selectionCount ?? 0)}</td><td>${fmt(m.legalOpportunityCount ?? 0)}</td><td>${renderPickRateCell(m)}</td><td>${pct(m.participantPrevalence ?? m.matchUsageRate)}</td><td>${pct(m.matchPrevalence ?? 0)}</td><td>${renderWinAssocCell(m, 'rawWinAssociation', 'rawWinAssociationStatus')}</td><td>${renderWinAssocCell(m, 'adjustedWinAssociation', 'adjustedWinAssociationStatus')}</td><td>${renderPointImpactCell(m)}</td><td><span class="status-badge ${(EVIDENCE_GRADE_RANK[m.evidenceGrade] ?? 0) >= 3 ? 'supported' : (EVIDENCE_GRADE_RANK[m.evidenceGrade] ?? 0) >= 2 ? 'info' : 'warning'}" title="${esc(Array.isArray(m.evidenceReasons) && m.evidenceReasons.length ? m.evidenceReasons.map(r => `${r.code}: ${r.detail}`).join(' · ') : 'no structured reasons available')}">${esc(m.evidenceGrade ?? 'INSUFFICIENT')}</span></td></tr>`).join('')}</tbody></table></div>${quarantineHtml}${choiceHtml}</div></section>`;
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
  bindChartToggle('#mechanics-scatter-chart');
  bindSegmentControls({ 'mechanics-x': 'mechanicsPlotX', 'mechanics-y': 'mechanicsPlotY' });
  // Scatter points select the mechanic dossier (same as a table row).
  document.querySelectorAll('.ix-scatter-point[data-scatter-mechanic]').forEach(pt => {
    const handler = () => { state.selectedMechanic = pt.getAttribute('data-scatter-mechanic'); rerender(); };
    pt.onclick = handler;
    pt.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } };
  });
}

// Mechanic dossier: progressive-disclosure layout (identity → usage →
// choice context → outcome association → evidence → relationships →
// provenance). All values are read verbatim from the mechanic row — the
// dossier restructures presentation, never recomputation.
function renderMechanicDetail(m) {
  const o = state.observatory;
  const evidenceClass = (EVIDENCE_GRADE_RANK[m.evidenceGrade] ?? 0) >= 3 ? 'supported' : 'warning';
  const choiceBlockHtml = renderMechanicChoiceBlock(m, o);
  const cs = m.choiceSupport;
  const pickRateCell = m.pickRateWhenLegal != null
    ? `${pct(m.pickRateWhenLegal)} (${fmt(m.selectionCount ?? 0)} / ${fmt(m.legalOpportunityCount ?? 0)})`
    : 'N/A';
  const supportWarnHtml = cs && (cs.status === 'limited' || cs.status === 'unsupported')
    ? `<div class="notice warning" style="margin-top:12px" data-testid="choice-support-warning"><strong>Choice identification: ${esc(CHOICE_SUPPORT_LABEL[cs.status] ?? cs.status)}.</strong> Selected in ${fmt(m.selectionCount ?? 0)} of ${fmt(m.legalOpportunityCount ?? 0)} observed legal opportunities — only ${fmt(m.legalDeclinedCount ?? cs.declinedCount ?? 0)} legal-but-unselected frame${(m.legalDeclinedCount ?? cs.declinedCount) === 1 ? '' : 's'}. Pick rate here is an observed regularity, not evidence that agents prefer this mechanic; and the win associations below are observational — they do not establish that selecting it causes wins.</div>`
    : '';
  const kv = rows => `<div class="obs-kv-list">${rows.filter(([, v]) => v != null).map(([k, v]) => `<div class="obs-kv"><span>${esc(k)}</span><span>${v}</span></div>`).join('')}</div>`;
  // Usage section — selection counts against legal opportunities.
  const usageHtml = kv([
    ['Selections', fmt(m.selectionCount ?? 0)],
    ['Legal opportunities', m.legalOpportunityCount != null ? fmt(m.legalOpportunityCount) : 'N/A'],
    ['Pick rate when legal', pickRateCell],
    ['Participant prevalence', pct(m.participantPrevalence ?? m.matchUsageRate)],
    ['Prevalence 95% CI', (m.participantPrevalenceWilson95 ?? m.matchUsageWilson95) ? `${pct((m.participantPrevalenceWilson95 ?? m.matchUsageWilson95)[0])} to ${pct((m.participantPrevalenceWilson95 ?? m.matchUsageWilson95)[1])}` : '—'],
    ['Match prevalence', pct(m.matchPrevalence)],
  ]) + (m.pickRateWhenLegal != null ? `<div style="margin-top:8px">${miniBar(m.pickRateWhenLegal, { color: 'var(--cyan)', cls: 'obs-minibar-lg', label: `Legal pick rate ${pct(m.pickRateWhenLegal)}` })}</div>` : '');
  // Choice context — whether the pick rate is contested or forced.
  const choiceHtml = kv([
    ['Legal-but-unselected', m.legalDeclinedCount != null ? fmt(m.legalDeclinedCount) : 'N/A'],
    ['Choice support', cs ? `${CHOICE_SUPPORT_LABEL[cs.status] ?? cs.status} (≥${cs.minimum ?? 20} declines for Identified)` : 'N/A'],
    ['Conditional choice rate', o.choiceAnalysis?.entities?.[m.mechanic]?.conditionalRate != null ? pct(o.choiceAnalysis.entities[m.mechanic].conditionalRate) : '—'],
  ]);
  // Outcome association — interval plot over raw + adjusted CIs.
  const rawCi = m.rawWinAssociation95 ?? m.outcomeAssociation95;
  const adjCi = m.adjustedWinAssociation95;
  const intervalRows = [];
  if (m.rawWinAssociation != null && Array.isArray(rawCi) && rawCi.every(Number.isFinite)) {
    intervalRows.push({ label: 'Raw assoc.', estimate: m.rawWinAssociation * 100, low: rawCi[0] * 100, high: rawCi[1] * 100, color: '#7dd3fc' });
  }
  if (m.adjustedWinAssociation != null && Array.isArray(adjCi) && adjCi.every(Number.isFinite)) {
    intervalRows.push({ label: 'Adjusted assoc.', estimate: m.adjustedWinAssociation * 100, low: adjCi[0] * 100, high: adjCi[1] * 100, color: '#5ad7e8' });
  }
  const impact = m.actorPointImpact ?? m.immediatePointImpact;
  const assocHtml = (intervalRows.length
    ? intervalPlot({ rows: intervalRows, width: 460, refLine: 0, fmt: v => `${v.toFixed(0)}pp`, title: 'Win-association intervals', ariaLabel: 'Interval plot of raw and adjusted win-association 95% confidence intervals in percentage points' })
    : '')
    + kv([
      ['Raw win association', m.rawWinAssociation != null ? `${(m.rawWinAssociation * 100).toFixed(1)} pp` : '—'],
      ['Raw assoc. 95% CI', rawCi?.[0] != null ? `${(rawCi[0] * 100).toFixed(1)} to ${(rawCi[1] * 100).toFixed(1)} pp` : '—'],
      ['Adjusted win association', m.adjustedWinAssociation != null ? `${(m.adjustedWinAssociation * 100).toFixed(1)} pp` : '—'],
      ['Adjusted assoc. 95% CI', adjCi?.[0] != null ? `${(adjCi[0] * 100).toFixed(1)} to ${(adjCi[1] * 100).toFixed(1)} pp` : '—'],
      ['Adjusted strata', m.adjustedWinAssociationStatus?.contributingStrata != null ? `${fmt(m.adjustedWinAssociationStatus.contributingStrata)} contributing${m.adjustedWinAssociationStatus.skippedStrata ? ` · ${fmt(m.adjustedWinAssociationStatus.skippedStrata)} skipped (no within-stratum comparison)` : ''}` : '—'],
      ['Actor point impact mean', impact?.mean?.toFixed(2) ?? '—'],
      ['Actor point impact median', impact?.median?.toFixed(2) ?? '—'],
      ['P-value (raw assoc.)', m.pValue?.toFixed(4)],
      ['Q-value (BH)', m.associationQValue != null ? Number(m.associationQValue).toFixed(4) : '—'],
    ]);
  // Evidence section — grade + machine-readable reasons.
  const evidenceHtml = `${evidenceBadge(m.evidenceGrade, { scope: 'Association evidence grade — precision and significance of the observational win association; not a causal or preference identification.' })}${Array.isArray(m.evidenceReasons) && m.evidenceReasons.length ? `<ul style="margin:8px 0 0;padding-left:18px;font-size:12px">${m.evidenceReasons.map(r => `<li><code>${esc(r.code)}</code> — ${esc(r.detail)}</li>`).join('')}</ul>` : ''}${kv([['Sample size', m.sampleSize], ['Registry verified', m.registryVerified ? 'Yes' : 'No']])}`;
  // Relationships — rank links + synergy cross-link.
  const rankLinks = (m.rankAttribution ?? m.primaryRanks ?? []);
  const relHtml = `<div style="display:flex;gap:8px;flex-wrap:wrap"><button id="mechanic-view-synergies" class="ix-cross-link" data-testid="mechanic-view-synergies" aria-label="View synergies involving this mechanic in the Synergy Observatory">⟷ View synergies involving this mechanic</button>${rankLinks.map(r => `<button class="ix-cross-link" data-rank-link="${esc(r)}" title="Open the ${esc(r)} rank dossier">⌁ Rank ${esc(r)}</button>`).join('')}</div>`;
  // Provenance — metric/formula hashes, cohort, epoch.
  const provHtml = kv([
    ['Metric id', m.metricId ? `<code>${esc(m.metricId)}</code>` : '—'],
    ['Formula hash', m.formulaHash ? `<code>${esc(short(m.formulaHash))}</code>` : '—'],
    ['Outcome formula', m.outcomeFormulaHash ? `<code>${esc(short(m.outcomeFormulaHash))}</code>` : '—'],
    ['Adjusted formula', m.adjustedFormulaHash ? `<code>${esc(short(m.adjustedFormulaHash))}</code>` : '—'],
    ['Pick-rate formula', m.pickRateFormulaHash ? `<code>${esc(short(m.pickRateFormulaHash))}</code>` : '—'],
    ['Epoch', o.evidenceEpoch],
    ['Canonical id', `<code>${esc(m.mechanic)}</code>`],
  ]);
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><button class="back-button" id="mechanics-back">← Back to atlas</button><h2>${esc(m.displayName ?? m.mechanic)}</h2><p>${esc(m.category ?? '')} · ${esc(m.dimension ?? 'canonical-mechanic')}</p></div><span class="status-badge ${evidenceClass}" title="Association evidence grade — precision and significance of the observational win association; not a causal or preference identification.">${esc(m.evidenceGrade ?? 'INSUFFICIENT')}</span></div><div class="panel-body">${obsContextStrip(o)}${m.entityDescription ? `<p class="footer-note" style="margin:0 0 10px">${esc(m.entityDescription)}</p>` : ''}<div class="dossier-grid">${dossierSection('Usage', usageHtml, { note: 'selections vs legal opportunities' })}${dossierSection('Choice context', choiceHtml, { note: 'simultaneously-legal alternatives' })}</div>${dossierSection('Outcome association', assocHtml, { note: 'observational — stratified by policy, seat, profile' })}<div class="dossier-grid">${dossierSection('Evidence', evidenceHtml)}${dossierSection('Provenance', provHtml)}</div><div class="notice info" style="margin-top:12px"><strong>Interpretation:</strong> raw and adjusted associations are observational, not causal. A sign reversal between them indicates confounding (policy/seat composition), not an error.</div>${supportWarnHtml}${dossierSection('Relationships', relHtml)}${m.limitations ? `<div class="notice info" style="margin-top:12px"><strong>Limitations:</strong><ul>${m.limitations.map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>` : ''}${choiceBlockHtml}</div></section>`;
  document.querySelector('#mechanics-back').onclick = () => { state.selectedMechanic = null; rerender(); };
  // Phase 3A: Mechanic → Synergy cross-workspace navigation
  const viewSynergiesBtn = document.querySelector('#mechanic-view-synergies');
  if (viewSynergiesBtn) viewSynergiesBtn.onclick = () => {
    state.synergiesMechanicFilter = m.mechanic;
    state.selectedSynergy = null;
    location.hash = '#/synergies';
  };
  // Mechanic → Rank dossier cross-links
  document.querySelectorAll('[data-rank-link]').forEach(btn => {
    btn.onclick = () => { state.selectedRank = btn.getAttribute('data-rank-link'); location.hash = '#/ranks'; };
  });
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
  { key: 'ci', label: '95% CI (OR)', sort: s => (s.confidenceInterval ?? s.interval)?.[0] ?? 0, type: 'number' },
  { key: 'cohorts', label: 'Cohorts (N/B/A/AB)', sort: s => s.effectiveN ?? s.sampleSize ?? 0, type: 'number' },
  { key: 'pvalue', label: 'P-value', sort: s => s.pValue ?? 1, type: 'number' },
  { key: 'qvalue', label: 'Q-value (BH)', sort: s => s.qValue ?? 1, type: 'number' },
  { key: 'evidence', label: 'Evidence', sort: s => EVIDENCE_GRADE_RANK[s.evidenceGrade] ?? 0, type: 'number' },
];

// ── Rejected / non-modeled synergy cells ───────────────────────
// Every candidate pair that was NOT modeled gets an explicit cell status
// (INSUFFICIENT_DATA / FAILED / NOT_IDENTIFIABLE) with a machine-readable
// reason code and cohort/strata accounting. Unknown ≠ neutral: these cells
// carry no effect estimate at all, and the UI must say why.
const SYNERGY_CELL_STATUS_LABEL = {
  MODELED: 'Modeled',
  MODELED_INCONCLUSIVE: 'Modeled, inconclusive',
  INSUFFICIENT_DATA: 'Insufficient data',
  FAILED: 'Model failed',
  NOT_IDENTIFIABLE: 'Not identifiable',
  NOT_EVALUATED: 'Not evaluated',
};
const SYNERGY_REASON_LABEL = {
  INSUFFICIENT_BOTH: 'Both-cohort below threshold',
  INSUFFICIENT_SINGLE: 'Single-mechanic cohorts below threshold',
  INSUFFICIENT_TOTAL: 'Total sample below threshold',
  NO_WITHIN_STRATUM_VARIATION: 'No within-stratum variation',
  SEPARATION: 'Outcome separation in contributing strata',
  SAME_EVENT_DEPENDENCY: 'Same-event family/mode dependency (not independent)',
  ALIAS_DUPLICATE: 'Identical-usage alias (deduplicated)',
};

// ── Synergy status matrix (Atlas UX pass) ────────────────────────
// Full candidate-set matrix — the hero visual for /synergies. Every cell
// carries an explicit status; blank never means neutral. Non-modeled
// cells keep pattern + glyph semantics in every display mode so a "no
// estimate" cell is never mistaken for a null effect. Display modes:
//   status   — identifiability classification (default)
//   effect   — modeled log-OR interaction (shrunk), diverging
//   marginal — marginal probability-point interaction, diverging
//   support  — effective N / contributing support, sequential
//   grade    — evidence grade
const SYNERGY_MATRIX_MODES = {
  status: 'Identifiability',
  effect: 'Model effect (log OR)',
  marginal: 'Marginal effect (pp)',
  support: 'Support (N)',
  grade: 'Evidence grade',
};
const SYNERGY_CELL_GLYPH = { MODELED_INCONCLUSIVE: '±', INSUFFICIENT_DATA: '◌', FAILED: '✕', NOT_IDENTIFIABLE: '∄', NOT_EVALUATED: '·' };

function synergyPairKey(a, b) { return a < b ? `${a}::${b}` : `${b}::${a}`; }

function renderSynergyMatrix(o) {
  const mechanics = [...(o.synergyCandidateSet?.mechanics ?? [])].sort();
  if (mechanics.length < 2) return '';
  const synergyById = new Map((o.synergies ?? []).map(s => [s.id, s]));
  const diagById = new Map((o.synergyDiagnostics ?? []).map(d => [d.id, d]));
  const mode = SYNERGY_MATRIX_MODES[state.synergyMatrixMode] ? state.synergyMatrixMode : 'status';
  const synergies = o.synergies ?? [];
  const diagnostics = o.synergyDiagnostics ?? [];
  const cellFor = (a, b) => {
    const id = synergyPairKey(a, b);
    const s = synergyById.get(id);
    if (s) return { id, s, d: null, st: (s.cellStatus === 'MODELED' || s.cellStatus === 'MODELED_INCONCLUSIVE') ? s.cellStatus : 'MODELED' };
    const d = diagById.get(id);
    if (d) return { id, s: null, d, st: d.cellStatus ?? 'FAILED' };
    return { id, s: null, d: null, st: 'NOT_EVALUATED' };
  };
  const diagN = d => (d?.cohortN?.neither ?? 0) + (d?.cohortN?.aOnly ?? 0) + (d?.cohortN?.bOnly ?? 0) + (d?.cohortN?.both ?? 0);
  const maxAbsLog = Math.max(...synergies.map(s => Math.abs(Number(s.shrunkLogOR ?? s.logEstimate ?? 0))), 0.001);
  const maxMarginal = Math.max(...synergies.map(s => Math.abs(Number(s.marginalInteraction ?? 0))), 0.001);
  const maxN = Math.max(...synergies.map(s => s.effectiveN ?? 0), ...diagnostics.map(diagN), 1);
  const diverge = (v, cap, base = 0.18) => {
    const t = Math.min(Math.abs(Number(v)) / cap, 1);
    const alpha = base + t * 0.62;
    return Number(v) >= 0 ? `rgba(79,211,135,${alpha.toFixed(3)})` : `rgba(240,93,120,${alpha.toFixed(3)})`;
  };
  const gradeFill = (g) => {
    const r = EVIDENCE_GRADE_RANK[g] ?? 0;
    if (r >= 4) return 'rgba(79,211,135,0.6)';
    if (r === 3) return 'rgba(90,215,232,0.55)';
    if (r === 2) return 'rgba(241,189,93,0.45)';
    return 'rgba(255,255,255,0.1)';
  };
  const STATUS_STYLE = {
    MODELED: { stroke: null, dash: null },
    MODELED_INCONCLUSIVE: { stroke: 'rgba(241,189,93,0.75)', dash: null },
    INSUFFICIENT_DATA: { stroke: 'rgba(241,189,93,0.6)', dash: '3 2' },
    FAILED: { stroke: 'rgba(240,120,111,0.7)', dash: '3 2' },
    NOT_IDENTIFIABLE: { stroke: 'rgba(255,255,255,0.4)', dash: '2 2' },
    NOT_EVALUATED: { stroke: 'rgba(255,255,255,0.08)', dash: null },
  };
  const cellFill = (cell) => {
    const { st, s, d } = cell;
    if (mode === 'status') {
      if (st === 'MODELED' || st === 'MODELED_INCONCLUSIVE') return diverge(s?.shrunkLogOR ?? s?.logEstimate ?? 0, maxAbsLog, st === 'MODELED_INCONCLUSIVE' ? 0.12 : 0.3);
      if (st === 'INSUFFICIENT_DATA') return 'rgba(255,255,255,0.05)';
      if (st === 'FAILED') return 'rgba(240,120,111,0.1)';
      if (st === 'NOT_IDENTIFIABLE') return 'rgba(255,255,255,0.05)';
      return 'rgba(255,255,255,0.015)';
    }
    if (st === 'NOT_EVALUATED') return 'rgba(255,255,255,0.015)';
    if (mode === 'effect') return s ? diverge(s.shrunkLogOR ?? s.logEstimate ?? 0, maxAbsLog) : 'rgba(255,255,255,0.03)';
    if (mode === 'marginal') return s && Number.isFinite(Number(s.marginalInteraction)) ? diverge(s.marginalInteraction, maxMarginal) : 'rgba(255,255,255,0.03)';
    if (mode === 'support') {
      const nV = s ? (s.effectiveN ?? 0) : diagN(d);
      return `rgba(90,215,232,${(0.05 + 0.7 * Math.sqrt(Math.min(1, nV / maxN))).toFixed(3)})`;
    }
    if (mode === 'grade') return s ? gradeFill(s.evidenceGrade) : 'rgba(255,255,255,0.03)';
    return 'rgba(255,255,255,0.03)';
  };
  const cellTip = (a, b, cell) => {
    const { st, s, d } = cell;
    if (st === 'SELF') return `${a} (self)`;
    if (st === 'NOT_EVALUATED') return `${a} × ${b} — NOT EVALUATED: this candidate pair never entered the estimator. Unknown ≠ neutral.`;
    if (s) {
      const ci = s.confidenceInterval ?? s.interval;
      return `${a} × ${b} — ${SYNERGY_CELL_STATUS_LABEL[st] ?? st} · OR ${s.effect != null ? Number(s.effect).toFixed(3) : '—'} · logOR ${Number(s.logEstimate ?? 0).toFixed(3)}${Array.isArray(ci) ? ` · 95% CI ${Number(ci[0]).toFixed(3)}–${Number(ci[1]).toFixed(3)}` : ''} · marginal ${s.marginalInteraction != null ? `${(s.marginalInteraction * 100).toFixed(1)}pp` : '—'} · eff N ${s.effectiveN ?? '—'} · ${s.evidenceGrade ?? '—'}`;
    }
    if (d) {
      const c = d.cohortN ?? {};
      return `${a} × ${b} — ${SYNERGY_CELL_STATUS_LABEL[st] ?? st} · ${SYNERGY_REASON_LABEL[d.reasonCode] ?? d.reasonCode ?? 'no estimate'} · cohorts N/A/B/AB ${c.neither ?? '—'}/${c.aOnly ?? '—'}/${c.bOnly ?? '—'}/${c.both ?? '—'}${(d.excludedStrata ?? []).length ? ` · ${d.excludedStrata.length} strata excluded` : ''}`;
    }
    return `${a} × ${b}`;
  };
  // Filter dimming: the active table filters dim non-matching cells so the
  // matrix stays in sync without dropping the "unknown" context.
  const mechanicFilter = state.synergiesMechanicFilter ?? 'all';
  const directionFilter = state.synergiesDirectionFilter ?? 'all';
  const minCohort = Number(state.synergiesMinCohort ?? 0);
  const dimCell = (cell, a, b) => {
    if (mechanicFilter !== 'all' && a !== mechanicFilter && b !== mechanicFilter) return true;
    if (cell.st === 'SELF' || cell.st === 'NOT_EVALUATED') return false;
    if (directionFilter !== 'all' && cell.s) {
      const eff = Number(cell.s.effect ?? 1);
      if (directionFilter === 'synergy' ? !(eff > 1) : !(eff < 1)) return true;
    }
    if (minCohort > 0) {
      const nBoth = cell.s ? (cell.s.bothN ?? cell.s.effectiveN ?? 0) : (cell.d?.cohortN?.both ?? 0);
      if (nBoth < minCohort) return true;
    }
    return false;
  };
  const cellSize = 26;
  const labelW = 118;
  const n = mechanics.length;
  const size = labelW + n * cellSize;
  const shortLabel = m => (m.length > 13 ? `${m.slice(0, 12)}…` : m);
  let cellsSvg = '';
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      const a = mechanics[r], b = mechanics[c];
      const x = labelW + c * cellSize;
      const y = labelW + r * cellSize;
      if (r === c) {
        cellsSvg += `<rect x="${x + 1}" y="${y + 1}" width="${cellSize - 2}" height="${cellSize - 2}" rx="3" fill="rgba(255,255,255,0.035)"><title>${esc(a)} (self)</title></rect><text class="ix-cell-glyph" x="${(x + cellSize / 2).toFixed(1)}" y="${(y + cellSize * 0.68).toFixed(1)}" fill="rgba(255,255,255,0.2)">—</text>`;
        continue;
      }
      const cell = cellFor(a, b);
      const style = STATUS_STYLE[cell.st] ?? {};
      const strokeAttrs = `${style.stroke ? ` stroke="${style.stroke}"` : ''}${style.dash ? ` stroke-dasharray="${style.dash}"` : ''}`;
      const glyph = mode === 'status' || !cell.s ? (SYNERGY_CELL_GLYPH[cell.st] ?? '') : (cell.st === 'MODELED_INCONCLUSIVE' ? '±' : '');
      const tip = cellTip(a, b, cell);
      const dimmed = dimCell(cell, a, b) ? ' sy-cell-dim' : '';
      const selected = state.selectedSynergy === cell.id ? ' selected' : '';
      cellsSvg += `<g class="sy-cell${dimmed}${selected}" data-synergy="${esc(cell.id)}" role="button" tabindex="0" aria-label="${esc(tip)}"><rect x="${x + 1}" y="${y + 1}" width="${cellSize - 2}" height="${cellSize - 2}" rx="3" fill="${cellFill(cell)}"${strokeAttrs}/>${glyph ? `<text class="ix-cell-glyph" x="${(x + cellSize / 2).toFixed(1)}" y="${(y + cellSize * 0.68).toFixed(1)}" fill="rgba(255,255,255,0.62)">${glyph}</text>` : ''}<title>${esc(tip)}</title></g>`;
    }
  }
  const rowLabels = mechanics.map((m, i) => `<text x="${labelW - 8}" y="${(labelW + i * cellSize + cellSize * 0.72).toFixed(1)}" text-anchor="end" font-size="10" fill="rgba(255,255,255,0.78)">${esc(shortLabel(m))}</text>`).join('');
  const colLabels = mechanics.map((m, i) => `<text x="${(labelW + i * cellSize + cellSize * 0.55).toFixed(1)}" y="${labelW - 8}" text-anchor="end" font-size="10" fill="rgba(255,255,255,0.78)" transform="rotate(-45 ${(labelW + i * cellSize + cellSize * 0.55).toFixed(1)} ${labelW - 8})">${esc(shortLabel(m))}</text>`).join('');
  const svg = `<svg class="ix-chart-synergy-matrix" role="grid" aria-label="Synergy candidate matrix — every cell shows its modeling status; a blank cell is never neutral" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${rowLabels}${colLabels}${cellsSvg}</svg>`;
  const seg = `<div class="ix-filter-toolbar" style="margin-bottom:10px">${segmentControl({ id: 'synergy-matrix', label: 'Show', options: Object.entries(SYNERGY_MATRIX_MODES).map(([value, label]) => ({ value, label })), active: mode })}</div>`;
  const legend = `<div class="matrix-legend"><span class="matrix-legend-item"><span class="matrix-legend-swatch sy-cell-pos"></span>Modeled synergy</span><span class="matrix-legend-item"><span class="matrix-legend-swatch sy-cell-neg"></span>Modeled anti-synergy</span><span class="matrix-legend-item"><span class="matrix-legend-swatch sy-cell-inconclusive"></span>Modeled, inconclusive ±</span><span class="matrix-legend-item"><span class="matrix-legend-swatch sy-cell-insufficient"></span>Insufficient data ◌</span><span class="matrix-legend-item"><span class="matrix-legend-swatch sy-cell-notident"></span>Not identifiable ∄</span><span class="matrix-legend-item"><span class="matrix-legend-swatch sy-cell-failed"></span>Model failed ✕</span><span class="matrix-legend-item"><span class="matrix-legend-swatch sy-cell-noteval"></span>Not evaluated</span></div>`;
  const tableRows = [];
  for (const s of synergies) {
    tableRows.push([s.source ?? '—', s.target ?? '—', SYNERGY_CELL_STATUS_LABEL[s.cellStatus ?? 'MODELED'] ?? s.cellStatus ?? 'MODELED', s.effect != null ? Number(s.effect).toFixed(3) : '—', s.effectiveN ?? '—', s.evidenceGrade ?? '—']);
  }
  for (const d of diagnostics) {
    const c = d.cohortN ?? {};
    tableRows.push([d.source ?? '—', d.target ?? '—', SYNERGY_CELL_STATUS_LABEL[d.cellStatus] ?? d.cellStatus ?? '—', '—', (c.neither ?? 0) + (c.aOnly ?? 0) + (c.bOnly ?? 0) + (c.both ?? 0), SYNERGY_REASON_LABEL[d.reasonCode] ?? d.reasonCode ?? '—']);
  }
  const tableAlt = chartTableAlternative({
    headers: ['Mechanic A', 'Mechanic B', 'Cell status', 'OR', 'Effective N', 'Grade / reason'],
    rows: tableRows,
    caption: `Synergy matrix — ${SYNERGY_MATRIX_MODES[mode]} display`,
  });
  const note = `<div class="obs-flow-note">Interaction = A×B odds ratio from the stratified logistic model. Non-colored cells carry no estimate — the border/glyph states why: ◌ insufficient data, ∄ not identifiable, ✕ model failed, dim = not evaluated. Click any cell for its dossier.</div>`;
  return `<details class="ix-chart-container" data-testid="synergy-matrix" id="synergy-matrix-chart" open><summary class="ix-chart-header"><h4>Interaction matrix — ${n} candidate mechanics</h4><span class="footer-note">${esc(SYNERGY_MATRIX_MODES[mode])} · click a cell to open its dossier</span></summary>${seg}<div class="obs-matrix-wrap">${svg}</div>${legend}${note}<button class="ix-chart-toggle" data-chart-toggle aria-expanded="false">View as table</button><div class="ix-chart-table-alt" data-chart-table hidden>${tableAlt}</div></details>`;
}

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
    const d = synergyDiagnostics.find(x => x.id === selectedSynergy);
    if (d) return renderSynergyCellDetail(d);
    return renderSynergyUnevaluatedDetail(selectedSynergy);
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
  // Default order: strongest shrunk log-effect first (the pipeline emits
  // `effect`/`logEstimate`/`shrunkEffect`; `estimate` does not exist and would
  // silently sort everything by id).
  const original = [...filteredSynergies].sort((a, b) => Math.abs(b.shrunkEffect ?? b.logEstimate ?? 0) - Math.abs(a.shrunkEffect ?? a.logEstimate ?? 0));
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
  const rejectedCellsHtml = renderRejectedSynergyCells(synergyDiagnostics);
  const matrixHtml = renderSynergyMatrix(o);
  const heatmapHtml = renderSynergyHeatmap(filteredSynergies);
  const h = o.campaignHealth ?? {};
  const modeledCount = synergies.filter(s => s.modelStatus === 'modeled').length;
  const inconclusiveCount = synergies.filter(s => s.cellStatus === 'MODELED_INCONCLUSIVE').length;
  const qualifiedCount = synergies.filter(s => (EVIDENCE_GRADE_RANK[s.evidenceGrade] ?? 0) >= 2).length;
  const candPairCount = o.synergyCandidateSet?.pairCount ?? null;
  const summaryHtml = metricStrip([
    { label: 'Candidate pairs', value: fmt(candPairCount ?? '—'), sub: `${o.synergyCandidateSet?.mechanics?.length ?? '—'} candidate mechanics` },
    { label: 'Eligible pairs', value: fmt(h.eligibleSynergyPairs ?? 0), sub: 'met cohort thresholds' },
    { label: 'Modeled', value: fmt(modeledCount), sub: inconclusiveCount ? `${inconclusiveCount} modeled inconclusive` : 'returned a model estimate', tone: modeledCount ? 'lead' : null },
    { label: 'Evidence-qualified', value: fmt(h.evidenceQualifiedSynergyPairs ?? qualifiedCount), sub: 'exploratory+ on the evidence scale', tone: (h.evidenceQualifiedSynergyPairs ?? qualifiedCount) ? 'positive' : 'alert' },
    { label: 'Rejected pre-model', value: fmt(h.rejectedSynergyPairs ?? synergyDiagnostics.length), sub: 'structured reason per cell' },
    { label: 'Near-threshold', value: fmt(h.nearThresholdPairs ?? nearThreshold.length), sub: 'closest candidates — not proven' },
  ]);
  const synergyFilterHtml = synergies.length > 0 ? `<div class="ix-filter-toolbar" data-testid="synergies-filter-toolbar"><label for="synergies-mechanic-filter">Mechanic:</label><select id="synergies-mechanic-filter"><option value="all" ${mechanicFilter === 'all' ? 'selected' : ''}>All mechanics</option>${allMechanics.map(m => `<option value="${esc(m)}" ${m === mechanicFilter ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select><label for="synergies-direction-filter">Direction:</label><select id="synergies-direction-filter"><option value="all" ${directionFilter === 'all' ? 'selected' : ''}>All</option><option value="synergy" ${directionFilter === 'synergy' ? 'selected' : ''}>Synergy only</option><option value="anti-synergy" ${directionFilter === 'anti-synergy' ? 'selected' : ''}>Anti-synergy only</option></select><label for="synergies-min-cohort">Min cohort (Both): <output id="synergies-min-cohort-out">${minCohort}</output></label><input type="range" id="synergies-min-cohort" min="0" max="${Math.max(...synergies.map(s => s.bothN ?? s.effectiveN ?? s.sampleSize ?? 0), 50)}" step="5" value="${minCohort}"></div>` : '';
  const motifFlowHtml = renderMotifFlow(motifs);
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Synergy Observatory</h2><p>Four-cohort logistic A×B interaction (odds-ratio scale) — ${filteredSynergies.length} of ${synergies.length} pairs</p></div></div><div class="panel-body">${labDatasetBanner()}${obsContextStrip(o)}${healthHtml}${summaryHtml}${emptyMsg}${matrixHtml}${synergyFilterHtml}${filterMsg}${heatmapHtml}<div class="table-wrap"><table class="data-table"><thead><tr>${headerHtml}</tr></thead><tbody>${sorted.map(s => `<tr class="clickable-row" data-synergy="${esc(s.id)}"><td><b>${esc(s.displayName ?? s.id)}</b></td><td>${s.effect != null ? `${s.effect.toFixed(3)}` : '—'}</td><td>${s.marginalInteraction != null ? `${(s.marginalInteraction * 100).toFixed(1)} pp` : '—'}</td><td>${(s.confidenceInterval ?? s.interval)?.[0] != null ? `${(s.confidenceInterval ?? s.interval)[0].toFixed(3)} to ${(s.confidenceInterval ?? s.interval)[1].toFixed(3)}` : '—'}</td><td>${s.neitherN ?? '—'}/${s.aOnlyN ?? '—'}/${s.bOnlyN ?? '—'}/${s.bothN ?? '—'}</td><td>${s.pValue?.toFixed(4) ?? '—'}</td><td>${s.qValue?.toFixed(4) ?? '—'}</td><td><span class="status-badge ${(EVIDENCE_GRADE_RANK[s.evidenceGrade] ?? 0) >= 3 ? 'supported' : (EVIDENCE_GRADE_RANK[s.evidenceGrade] ?? 0) >= 2 ? 'info' : 'warning'}">${esc(s.evidenceGrade ?? 'INSUFFICIENT')}</span></td></tr>`).join('')}</tbody></table></div>${nearThresholdHtml}${rejectedCellsHtml}${motifFlowHtml}</div></section>`;
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
  bindChartToggle('#synergy-matrix-chart');
  bindSegmentControls({ 'synergy-matrix': 'synergyMatrixMode' });
  // Matrix cells are keyboard-activatable; click is already covered by the
  // generic [data-synergy] binder above.
  document.querySelectorAll('.sy-cell[data-synergy]').forEach(cell => {
    cell.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); state.selectedSynergy = cell.getAttribute('data-synergy'); rerender(); } };
  });
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
function renderRejectedSynergyCells(diagnostics) {
  const rows = (diagnostics ?? []).filter(d => d.cellStatus && d.cellStatus !== 'MODELED');
  if (!rows.length) return '';
  const byStatus = {};
  for (const d of rows) byStatus[d.cellStatus] = (byStatus[d.cellStatus] ?? 0) + 1;
  const summary = Object.entries(byStatus).map(([k, v]) => `${SYNERGY_CELL_STATUS_LABEL[k] ?? k}: ${v}`).join(' · ');
  const body = rows.slice(0, 100).map(d => {
    const c = d.cohortN ?? {};
    const strataNote = (d.excludedStrata ?? []).length
      ? `${d.excludedStrata.length} strata excluded (${[...new Set(d.excludedStrata.map(s => s.reason))].join(', ')})`
      : '';
    return `<tr class="clickable-row" data-synergy="${esc(d.id ?? `${d.source}::${d.target}`)}" title="Open cell dossier"><td class="mono">${esc(d.id ?? `${d.source}::${d.target}`)}</td><td><span class="status-badge warning">${esc(SYNERGY_CELL_STATUS_LABEL[d.cellStatus] ?? d.cellStatus)}</span></td><td>${esc(SYNERGY_REASON_LABEL[d.reasonCode] ?? d.reasonCode ?? '—')}</td><td>${c.neither ?? '—'}/${c.aOnly ?? '—'}/${c.bOnly ?? '—'}/${c.both ?? '—'}</td><td style="font-size:11px">${esc(strataNote)}</td></tr>`;
  }).join('');
  return `<details class="ix-chart-container" data-testid="synergy-rejected-cells" style="margin-top:16px"><summary class="ix-chart-header"><h4>Non-modeled cells (${rows.length})</h4><span class="footer-note">${esc(summary)}</span></summary><div class="notice warning" style="margin-bottom:12px"><strong>These pairs produced no estimate.</strong> An absent cell is not evidence of "no interaction" — the reason column states why modeling was impossible or the pair was ineligible. Neither/ A-only / B-only / Both are the four-cohort observation counts.</div><div class="table-wrap"><table class="data-table"><thead><tr><th>Pair</th><th>Cell status</th><th>Reason</th><th>N/A/B/Both</th><th>Strata detail</th></tr></thead><tbody>${body}</tbody></table></div>${rows.length > 100 ? `<div class="notice info" style="margin-top:8px">Showing 100 of ${rows.length} non-modeled cells.</div>` : ''}</details>`;
}

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

// Shared back-button + cross-link binder for the three synergy dossier
// variants (modeled / rejected / not-evaluated).
function bindSynergyDetailNav() {
  document.querySelector('#synergy-back').onclick = () => { state.selectedSynergy = null; rerender(); };
  document.querySelectorAll('[data-mech-link]').forEach(btn => {
    btn.onclick = () => { state.selectedMechanic = btn.getAttribute('data-mech-link'); location.hash = '#/mechanics'; };
  });
}

function synergyMechanicLinks(s, d) {
  const a = s?.source ?? d?.source;
  const b = s?.target ?? d?.target;
  return `<div style="display:flex;gap:8px;flex-wrap:wrap">${[a, b].filter(Boolean).map(m => `<button class="ix-cross-link" data-mech-link="${esc(m)}" title="Open the ${esc(m)} mechanic dossier">◈ ${esc(m)}</button>`).join('')}</div>`;
}

function renderSynergyDetail(s) {
  const o = state.observatory ?? {};
  const evidenceClass = (EVIDENCE_GRADE_RANK[s.evidenceGrade] ?? 0) >= 3 ? 'supported' : 'warning';
  const kv = rows => `<div class="obs-kv-list">${rows.filter(([, v]) => v != null).map(([k, v]) => `<div class="obs-kv"><span>${esc(k)}</span><span>${v}</span></div>`).join('')}</div>`;
  const cohortTotal = (s.neitherN ?? 0) + (s.aOnlyN ?? 0) + (s.bOnlyN ?? 0) + (s.bothN ?? 0);
  const cohortBars = cohortTotal > 0
    ? `<div style="display:grid;gap:6px;margin-top:6px">${[['Neither', s.neitherN, 'rgba(255,255,255,0.4)'], ['A only', s.aOnlyN, '#7dd3fc'], ['B only', s.bOnlyN, '#a78bfa'], ['Both', s.bothN, '#4fd387']].map(([label, v, color]) => `<div style="display:grid;grid-template-columns:64px 1fr 40px;gap:8px;align-items:center;font-size:11px"><span style="color:var(--muted)">${label}</span>${miniBar(v ?? 0, { max: cohortTotal, color, label: `${label} ${fmt(v ?? 0)} of ${fmt(cohortTotal)}` })}<span style="text-align:right;color:var(--muted)">${fmt(v ?? 0)}</span></div>`).join('')}</div>`
    : '';
  const agreeNote = s.directionAgreement === false || (s.modelDirection && s.marginalDirection && s.modelDirection !== s.marginalDirection)
    ? `<div class="notice warning" style="margin-top:10px"><strong>Scale disagreement:</strong> the modeled odds-scale direction (${esc(s.modelDirection ?? '—')}) differs from the marginal probability-scale direction (${esc(s.marginalDirection ?? '—')}). These measure different estimands — report both, never collapse them.</div>`
    : (s.modelDirection || s.marginalDirection ? `<div class="notice info" style="margin-top:10px"><strong>Direction agreement:</strong> model (${esc(s.modelDirection ?? '—')}) and marginal (${esc(s.marginalDirection ?? '—')}) directions agree.</div>` : '');
  const excludedStrata = (s.excludedStrata ?? []);
  const strataHtml = kv([
    ['Strata attempted', s.strataAttempted ?? s.strataCount ?? '—'],
    ['Strata contributing', s.strataContributing ?? '—'],
    ['Strata excluded', (s.strataExcluded ?? excludedStrata.length) || '—'],
    ['Separation detected', s.separation || s.anyStratumSeparated ? `Yes${s.separationAffectedEstimate ? ' (affected the estimate)' : ''}` : 'No'],
  ]) + (excludedStrata.length
    ? `<div class="table-wrap" style="margin-top:8px"><table class="data-table"><thead><tr><th>Excluded stratum</th><th>Reason</th><th>n</th></tr></thead><tbody>${excludedStrata.slice(0, 8).map(x => `<tr><td class="mono" style="font-size:11px">${esc(x.stratum ?? '—')}</td><td>${esc(x.reason ?? '—')}</td><td>${x.n ?? '—'}</td></tr>`).join('')}</tbody></table></div>${excludedStrata.length > 8 ? `<div class="footer-note" style="margin-top:4px">…and ${excludedStrata.length - 8} more</div>` : ''}`
    : '');
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><button class="back-button" id="synergy-back">← Back to observatory</button><h2>${esc(s.displayName ?? s.id)}</h2><p>${esc(s.relationshipClass ?? '')} · ${esc(s.direction ?? 'bidirectional')} · ${esc(SYNERGY_CELL_STATUS_LABEL[s.cellStatus ?? 'MODELED'] ?? '')}</p></div><span class="status-badge ${evidenceClass}">${esc(s.evidenceGrade ?? 'INSUFFICIENT')}</span></div><div class="panel-body">${obsContextStrip(o)}<div class="dossier-grid">${dossierSection('Model', kv([
    ['Interaction (odds-ratio)', s.effect != null ? s.effect.toFixed(4) : '—'],
    ['Log-OR estimate', s.logEstimate != null ? s.logEstimate.toFixed(4) : '—'],
    ['Shrunk OR', s.shrunkOR != null ? Number(s.shrunkOR).toFixed(4) : '—'],
    ['Shrunk log-OR', s.shrunkLogOR != null ? Number(s.shrunkLogOR).toFixed(4) : '—'],
    ['95% CI (OR)', (s.confidenceInterval ?? s.interval)?.[0] != null ? `${(s.confidenceInterval ?? s.interval)[0].toFixed(4)} to ${(s.confidenceInterval ?? s.interval)[1].toFixed(4)}` : '—'],
    ['Standard error', s.standardError != null ? s.standardError.toFixed(4) : '—'],
    ['P-value', s.pValue?.toFixed(6) ?? '—'],
    ['Q-value (BH)', s.qValue?.toFixed(6) ?? '—'],
    ['Marginal interaction', s.marginalInteraction != null ? `${(s.marginalInteraction * 100).toFixed(2)} pp` : '—'],
    ['Model status', s.modelStatus ?? 'modeled'],
  ]))}${dossierSection('Cohorts', kv([
    ['Neither cohort', s.neitherN ?? '—'],
    ['A-only cohort', s.aOnlyN ?? '—'],
    ['B-only cohort', s.bOnlyN ?? '—'],
    ['Both cohort', s.bothN ?? '—'],
    ['Effective N', s.effectiveN ?? '—'],
    ['Cohort balance', s.cohortBalance != null ? s.cohortBalance.toFixed(3) : '—'],
    ['Joint opportunities', s.jointOpportunityCount ?? '—'],
  ]) + cohortBars)}${dossierSection('Model health', strataHtml)}${dossierSection('Evidence', `${evidenceBadge(s.evidenceGrade)}${Array.isArray(s.evidenceReasons) && s.evidenceReasons.length ? `<ul style="margin:8px 0 0;padding-left:18px;font-size:12px">${s.evidenceReasons.map(r => `<li><code>${esc(r.code)}</code> — ${esc(r.detail)}</li>`).join('')}</ul>` : ''}${kv([['Estimand', s.estimand], ['Evidence scale', s.evidenceScale], ['Status', s.status], ['Formula hash', s.formulaHash ? `<code>${esc(short(s.formulaHash))}</code>` : '—']])}`)}</div><div class="notice info" style="margin-top:12px"><strong>Interpretation:</strong> the odds-ratio interaction is the A×B term from a stratified logistic model (policy, seat, profile). The marginal interaction is the same pair on the probability scale. Associations, not causal claims.${s.relationshipClassBasis ? ` Relationship class basis: ${esc(s.relationshipClassBasis)}.` : ''}</div>${agreeNote}${dossierSection('Related', synergyMechanicLinks(s, null))}${s.limitations ? `<div class="notice info" style="margin-top:12px"><strong>Limitations:</strong><ul>${s.limitations.map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>` : ''}</div></section>`;
  bindSynergyDetailNav();
}

// Rejected-cell dossier: a candidate pair that produced no estimate.
// The whole point of this view is that absence-of-estimate has a reason.
function renderSynergyCellDetail(d) {
  const o = state.observatory ?? {};
  const c = d.cohortN ?? {};
  const kv = rows => `<div class="obs-kv-list">${rows.filter(([, v]) => v != null).map(([k, v]) => `<div class="obs-kv"><span>${esc(k)}</span><span>${v}</span></div>`).join('')}</div>`;
  const excluded = (d.excludedStrata ?? []);
  const byReason = {};
  for (const x of excluded) byReason[x.reason ?? 'UNKNOWN'] = (byReason[x.reason ?? 'UNKNOWN'] ?? 0) + (x.n ?? 0);
  const strataHtml = kv([
    ['Strata attempted', (d.strataAttempted ?? excluded.length) || '—'],
    ['Strata excluded', excluded.length || '—'],
    ...Object.entries(byReason).map(([r, n]) => [`Excluded · ${r}`, fmt(n)]),
  ]);
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><button class="back-button" id="synergy-back">← Back to observatory</button><h2>${esc(d.source ?? '?')} × ${esc(d.target ?? '?')}</h2><p>Candidate pair · no model estimate produced</p></div><span class="status-badge warning">${esc(SYNERGY_CELL_STATUS_LABEL[d.cellStatus] ?? d.cellStatus ?? 'REJECTED')}</span></div><div class="panel-body">${obsContextStrip(o)}<div class="dossier-grid">${dossierSection('Status', kv([
    ['Cell status', SYNERGY_CELL_STATUS_LABEL[d.cellStatus] ?? d.cellStatus ?? '—'],
    ['Reason code', d.reasonCode ? `<code>${esc(d.reasonCode)}</code>` : '—'],
    ['Reason', SYNERGY_REASON_LABEL[d.reasonCode] ?? d.reason ?? '—'],
  ]))}${dossierSection('Cohorts', kv([
    ['Neither', c.neither ?? '—'],
    ['A only', c.aOnly ?? '—'],
    ['B only', c.bOnly ?? '—'],
    ['Both', c.both ?? '—'],
    ['Total observations', fmt((c.neither ?? 0) + (c.aOnly ?? 0) + (c.bOnly ?? 0) + (c.both ?? 0))],
  ]))}${dossierSection('Strata detail', strataHtml)}</div><div class="notice warning" style="margin-top:12px"><strong>This cell is not "no interaction".</strong> The estimator rejected the pair before producing an effect — the reason above states exactly why. An absent estimate is an unknown, not a zero.</div>${dossierSection('Related', synergyMechanicLinks(null, d))}</div></section>`;
  bindSynergyDetailNav();
}

// Unevaluated pair: on the candidate axis but absent from both the
// modeled results and the rejection diagnostics.
function renderSynergyUnevaluatedDetail(id) {
  const [a, b] = String(id ?? '').split('::');
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><button class="back-button" id="synergy-back">← Back to observatory</button><h2>${esc(a ?? id)} × ${esc(b ?? '')}</h2><p>Candidate pair</p></div><span class="status-badge warning">NOT EVALUATED</span></div><div class="panel-body"><div class="notice info"><strong>This pair never entered the estimator.</strong> It is within the candidate mechanic set, but no model result or rejection diagnostic exists for it — the campaign produced no record either way. Unknown ≠ neutral.</div></div></section>`;
  bindSynergyDetailNav();
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
  // Match dossier additions (Atlas UX pass): anomaly flags on this match,
  // mechanic links into the Atlas, and a policy-comparison jump.
  const matchAnomalies = (state.observatory?.anomalies ?? []).filter(a => a.matchId === summary.matchId);
  const anomalyHtml = matchAnomalies.length
    ? `<h3 style="margin-top:16px">Anomaly flags (${matchAnomalies.length})</h3><div class="anomaly-list">${matchAnomalies.map(a => `<div class="dossier-section"><div class="dossier-section-head"><h4>${esc(a.type)}</h4><span class="status-badge ${a.severity === 'warning' ? 'warning' : 'info'}">${esc(a.severity ?? 'info')}</span></div><div class="obs-kv"><span>Value</span><span>${a.value ?? '—'} ${esc(a.unit ?? '')}</span></div><div class="obs-kv"><span>Baseline</span><span>${a.baseline ?? a.threshold ?? '—'} ${esc(a.unit ?? '')}</span></div><p class="footer-note" style="margin:6px 0 0">${esc(a.detail ?? '')}</p></div>`).join('')}</div>`
    : '';
  const usedMechanics = Object.keys(summary.mechanicCounts ?? {});
  const mechanicLinksHtml = usedMechanics.length
    ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${usedMechanics.slice(0, 12).map(mk => `<button class="ix-cross-link" data-mech-link="${esc(mk)}" title="Open ${esc(mk)} in the Mechanics Atlas">◈ ${esc(mk)}</button>`).join('')}</div>`
    : '';
  const policyLinks = (summary.policyIds ?? []).length >= 2
    ? `<button class="ix-cross-link" id="match-detail-compare" title="Compare these policies">⟷ Compare ${esc((summary.policyIds ?? []).slice(0, 2).join(' vs '))}</button>`
    : '';
  return `<section class="panel" data-testid="match-detail"><div class="panel-header"><div><button class="back-button" id="history-detail-back">← Back to history</button><h2>Match detail: ${short(summary.matchId)}</h2><p>Ordinal ${summary.matchOrdinal ?? '—'} · ${esc(summary.terminationReason ?? '—')} · Winner: ${esc(summary.winner ?? '—')}</p></div></div><div class="panel-body">${obsContextStrip(state.observatory)}${definitionList([['Match ID', summary.matchId], ['Winner', summary.winner ?? '—'], ['Score margin', summary.scoreMargin?.toFixed(0) ?? '—'], ['Completed turns', summary.completedFullTurns ?? '—'], ['Policies', (summary.policyIds ?? []).join(', ')], ['Final scores', summary.finalScores ? Object.entries(summary.finalScores).map(([k, v]) => `${k}: ${v}`).join(', ') : '—']])}${scoreSparkHtml ? `<h3 style="margin-top:12px">Score progression</h3>${scoreSparkHtml}` : ''}<div class="grid two" style="margin-top:12px">${actionDonutHtml ? `<div><h4>Action breakdown</h4>${actionDonutHtml}</div>` : ''}${decisionBarHtml ? `<div><h4>Decision families</h4>${decisionBarHtml}</div>` : ''}</div>${mechanicBarHtml ? `<h3 style="margin-top:12px">Mechanic usage (top 10)</h3>${mechanicBarHtml}${mechanicLinksHtml}` : ''}${anomalyHtml}${responseBarHtml ? `<h3 style="margin-top:12px">Response actions</h3>${responseBarHtml}` : ''}<div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap"><button id="match-detail-watch" class="ix-cross-link" data-testid="match-detail-watch">▶ View in Watch</button><button id="match-detail-traces" class="ix-cross-link" data-testid="match-detail-traces">◇ View traces</button>${policyLinks}</div></div></section>`;
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
      if (watchBtn) {
        // A match summary is not itself a replay — Watch is offered only
        // when an index record says a replay artifact was retained. Which
        // index holds it determines the resolution kind; the resolver then
        // reports honestly if the body is excluded from this build.
        const autonomyRecord = state.autonomyIndex?.records?.find(r => r.fixtureId === summary.matchId);
        const corpusRecord = state.index?.records?.find(r => r.fixtureId === summary.matchId);
        const kind = autonomyRecord ? 'autonomy' : corpusRecord ? 'corpus' : null;
        if (kind) {
          watchBtn.onclick = () => { void openReplay({ kind, fixtureId: summary.matchId }); };
        } else {
          watchBtn.disabled = true;
          watchBtn.title = 'No replay artifact was retained for this match — the summary is statistical evidence only.';
        }
      }
      const tracesBtn = document.querySelector('#match-detail-traces');
      if (tracesBtn) tracesBtn.onclick = () => { state.traceSelectedId = summary.matchId; location.hash = '#/traces'; };
      document.querySelectorAll('[data-mech-link]').forEach(btn => {
        btn.onclick = () => { state.selectedMechanic = btn.getAttribute('data-mech-link'); location.hash = '#/mechanics'; };
      });
      const compareBtn = document.querySelector('#match-detail-compare');
      if (compareBtn) compareBtn.onclick = () => {
        const [a, b] = summary.policyIds ?? [];
        state.selectedPolicy = a; state.comparePolicyRight = b ?? a;
        location.hash = '#/compare';
      };
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
  const anomaliesByMatch = new Map();
  for (const a of state.observatory?.anomalies ?? []) {
    if (!a?.matchId) continue;
    if (!anomaliesByMatch.has(a.matchId)) anomaliesByMatch.set(a.matchId, []);
    anomaliesByMatch.get(a.matchId).push(a);
  }
  const decisive = filtered.filter(s => s.terminationReason === 'NORMAL_VICTORY').length;
  const turnVals = filtered.map(s => s.completedFullTurns).filter(Number.isFinite).sort((a, b) => a - b);
  const medianTurns = turnVals.length ? turnVals[Math.floor(turnVals.length / 2)] : null;
  const summaryHtml = metricStrip([
    { label: 'Matches', value: fmt(filtered.length), sub: `${summaries.length} total in corpus` },
    { label: 'Decisive', value: fmt(decisive), sub: filtered.length ? pct(decisive / filtered.length) : '—' },
    { label: 'Median turns', value: medianTurns ?? '—', sub: 'completed full turns' },
    { label: 'Anomaly-flagged', value: fmt(anomaliesByMatch.size), sub: `${(state.observatory?.anomalies ?? []).length} anomaly records`, tone: anomaliesByMatch.size ? 'alert' : null },
    { label: 'Policies', value: fmt(allPolicies.length), sub: 'in this corpus' },
  ]);
  const matchIdFilterBanner = Array.isArray(matchIdFilter) && matchIdFilter.length > 0
    ? `<div class="notice info" style="margin-bottom:8px"><strong>Filtered to ${matchIdFilter.length} match(es).</strong> <button id="history-clear-matchid-filter" class="ix-chart-toggle">Clear filter</button></div>`
    : '';
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Match History</h2><p>${filtered.length} matches · page ${page + 1}/${Math.max(1, totalPages)}</p></div><div class="toolbar"><input id="history-search" type="search" placeholder="Search match ID or ordinal…" value="${esc(state.historyFilterTerm)}"><select id="history-reason"><option value="all">All outcomes</option>${reasons.map(r => `<option value="${esc(r)}" ${r === reason ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select><select id="history-policy"><option value="all">All policies</option>${allPolicies.map(p => `<option value="${esc(p)}" ${p === policy ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div></div><div class="panel-body">${labDatasetBanner()}${obsContextStrip(state.observatory)}${summaryHtml}${matchIdFilterBanner}<div class="table-wrap"><table class="data-table"><thead><tr><th>Ordinal</th><th>Match ID</th><th>Outcome</th><th>Winner</th><th>Score</th><th>Turns</th><th>Flags</th><th>Policies</th></tr></thead><tbody>${pageItems.map(s => {
    const anoms = anomaliesByMatch.get(s.matchId) ?? [];
    const flagCell = anoms.length ? `<span class="obs-anomaly-flag" title="${esc(anoms.map(a => `${a.type}: ${a.detail ?? ''}`).join(' · '))}" aria-label="${anoms.length} anomaly flag${anoms.length === 1 ? '' : 's'}">⚑${anoms.length > 1 ? anoms.length : ''}</span>` : '';
    return `<tr class="clickable-row" data-match-id="${esc(s.matchId)}"><td>${s.matchOrdinal ?? '—'}</td><td class="mono">${short(s.matchId)}</td><td>${esc(s.terminationReason ?? '—')}</td><td>${esc(s.winner ?? '—')}</td><td>${s.scoreMargin?.toFixed(0) ?? '—'}</td><td>${s.completedFullTurns ?? '—'}</td><td>${flagCell}</td><td>${esc((s.policyIds ?? []).join(', '))}</td></tr>`;
  }).join('')}</tbody></table></div>${totalPages > 1 ? `<div class="pagination"><button id="history-prev" ${page === 0 ? 'disabled' : ''}>← Prev</button><span>Page ${page + 1} of ${totalPages}</span><button id="history-next" ${page >= totalPages - 1 ? 'disabled' : ''}>Next →</button></div>` : ''}</div></section>`;
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
// The Replay Library lists every indexed replay from every bundled source
// and says honestly whether the replay BODY is playable in this build:
// index metadata existing is not the same as the replay artifact being
// available (autonomy blobs are excluded from normal builds). Rows still
// route into Watch, which presents the truthful standby state.
/**
 * Replay Library — Full-Match Watch Contract disclosure. Every row
 * advertises its artifact class (FULL_MATCH / SCENARIO_FIXTURE /
 * PARTIAL_REPLAY / METADATA_ONLY / UNKNOWN) so certification fixtures can
 * no longer masquerade as complete games, plus the body availability and
 * observed turn/command counts. Local IndexedDB replays (retained Lab /
 * Experiment / session matches) form their own section.
 */
export function renderReplays() {
  const summaryFor = (id) => state.observatory?.summaries?.find(s => s.matchId === id) ?? null;
  // Classify every index record once — classification feeds both the Type
  // column and the disclosure filter.
  const enriched = (section) => section.records.map(r => {
    const availability = recordAvailability(r, section.kind);
    const cls = classifyIndexRecord(r, { availability, summary: summaryFor(r.fixtureId) });
    return { record: r, cls, availability, descriptorKind: descriptorKindForRecord(r, section.kind) };
  });
  const sections = [
    { kind: 'corpus', label: 'Certified corpus', records: state.index?.records ?? [] },
    { kind: 'autonomy', label: 'Autonomy campaign', records: state.autonomyIndex?.records ?? [] },
  ].filter(s => s.records.length).map(s => ({ ...s, rows: enriched(s) }));
  const localRows = (state.localReplays ?? []).map(r => {
    const terminal = r.winner != null || r.terminationReason != null;
    const cls = {
      class: r.hasBody ? (terminal ? REPLAY_ARTIFACT_CLASS.FULL_MATCH : REPLAY_ARTIFACT_CLASS.PARTIAL_REPLAY)
        : REPLAY_ARTIFACT_CLASS.METADATA_ONLY,
      evidence: { turns: r.fullTurnSequence, commandCount: r.commandCount, winner: r.winner, terminationReason: r.terminationReason },
      reasons: [],
    };
    return { record: r, cls, availability: 'runtime', descriptorKind: 'local' };
  });
  const filter = ['all', 'full', 'scenario', 'metadata'].includes(state.replayLibraryFilter) ? state.replayLibraryFilter : 'all';
  const filterFn = {
    all: () => true,
    full: (row) => row.cls.class === REPLAY_ARTIFACT_CLASS.FULL_MATCH,
    scenario: (row) => row.cls.class === REPLAY_ARTIFACT_CLASS.SCENARIO_FIXTURE,
    metadata: (row) => row.cls.class === REPLAY_ARTIFACT_CLASS.METADATA_ONLY || row.availability === 'excluded',
  }[filter];
  if (!sections.length && !localRows.length) { app.innerHTML = '<div class="empty-state"><span class="empty-state-icon" aria-hidden="true">▶</span><strong>No replay records.</strong><p>Run a campaign to generate certified replays.</p></div>'; return; }
  const allRows = [...sections.flatMap(s => s.rows), ...localRows];
  const filteredCount = allRows.filter(filterFn).length;
  const classCounts = {};
  for (const row of allRows) classCounts[row.cls.class] = (classCounts[row.cls.class] ?? 0) + 1;
  const replaySummaryHtml = metricStrip([
    { label: 'Indexed replays', value: fmt(allRows.length), sub: `${fmt(filteredCount)} shown under filter` },
    { label: 'Full matches', value: fmt(classCounts.FULL_MATCH ?? 0), sub: 'terminal evidence recorded' },
    { label: 'Scenario fixtures', value: fmt(classCounts.SCENARIO_FIXTURE ?? 0), sub: 'certification artifacts — not complete games' },
  ]);
  const statusFor = (availability) => {
    if (availability === 'bundled' || availability === 'runtime') return { label: 'Playable', cls: 'available', title: 'Replay body is available in this build' };
    if (availability === 'excluded') return { label: 'Metadata only', cls: 'metadata-only', title: 'Replay metadata exists, but the full replay was not included in this build' };
    return { label: 'Availability unknown', cls: 'unknown', title: 'Build manifest unavailable — Watch will attempt to load the replay' };
  };
  const rowHtml = (row) => {
    const r = row.record;
    const status = statusFor(row.availability);
    const id = r.fixtureId ?? r.replayId ?? '—';
    const ev = row.cls.evidence ?? {};
    const turns = ev.turns ?? (ev.initialTurn != null ? `from ${ev.initialTurn}` : null);
    const disabled = row.availability === 'excluded' ? ' aria-disabled="true" title="Replay body not included in this build — metadata only"' : '';
    return `<tr class="clickable-row replay-row-${status.cls}" data-fixture="${esc(id)}" data-replay-kind="${esc(row.descriptorKind)}"${disabled}><td class="mono">${esc(id)}</td><td><span class="replay-class replay-class-${esc(row.cls.class.toLowerCase().replaceAll('_', '-'))}" title="${esc(row.cls.reasons?.join('; ') ?? '')}">${esc(ARTIFACT_CLASS_LABEL[row.cls.class] ?? 'Unknown')}</span></td><td>${turns ?? '—'}</td><td>${ev.commandCount ?? r.commandCount ?? '—'}</td><td>${esc(r.outcome ?? ev.winner ?? ev.terminationReason ?? r.terminationReason ?? '—')}</td><td><span class="replay-status replay-status-${status.cls}" title="${esc(status.title)}">${esc(status.label)}</span></td></tr>`;
  };
  const tableFor = (section) => {
    const rows = section.rows.filter(filterFn);
    if (!rows.length) return '';
    return `<h3 class="replay-source-heading">${esc(section.label)} <span class="replay-count-note">${rows.length} record${rows.length === 1 ? '' : 's'}</span></h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Replay</th><th>Type</th><th>Turns</th><th>Commands</th><th>Outcome</th><th>Availability</th></tr></thead><tbody>${rows.map(rowHtml).join('')}</tbody></table></div>`;
  };
  const localRowsShown = localRows.filter(filterFn);
  const localSection = localRowsShown.length
    ? `<h3 class="replay-source-heading">Retained local replays <span class="replay-count-note">${localRowsShown.length} record${localRowsShown.length === 1 ? '' : 's'}</span></h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Replay</th><th>Type</th><th>Turns</th><th>Commands</th><th>Outcome</th><th>Availability</th></tr></thead><tbody>${localRowsShown.map(rowHtml).join('')}</tbody></table></div>` : '';
  const filterControl = `<select id="replay-library-filter" aria-label="Replay type filter"><option value="all" ${filter === 'all' ? 'selected' : ''}>All artifacts</option><option value="full" ${filter === 'full' ? 'selected' : ''}>Full matches</option><option value="scenario" ${filter === 'scenario' ? 'selected' : ''}>Scenario fixtures</option><option value="metadata" ${filter === 'metadata' ? 'selected' : ''}>Metadata only</option></select>`;
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Replay Library</h2><p>${allRows.length} indexed replays — click a playable row to open in Watch</p></div><div class="toolbar">${filterControl}</div></div><div class="panel-body">${obsContextStrip(state.observatory)}${replaySummaryHtml}${localSection}${sections.map(tableFor).join('')}</div></section>`;
  document.querySelector('#replay-library-filter')?.addEventListener('change', e => {
    state.replayLibraryFilter = e.target.value;
    rerender();
  });
  document.querySelectorAll('[data-fixture]').forEach(row => row.onclick = () => {
    if (row.getAttribute('aria-disabled') === 'true') return;
    const kind = row.dataset.replayKind;
    void openReplay(kind === 'local'
      ? { kind: 'local', replayId: row.dataset.fixture }
      : { kind, fixtureId: row.dataset.fixture });
  });
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
  const anomaliesByMatchTr = {};
  for (const a of state.observatory?.anomalies ?? []) anomaliesByMatchTr[a.matchId] = (anomaliesByMatchTr[a.matchId] ?? 0) + 1;
  const traceSummaryHtml = metricStrip([
    { label: 'Trace records', value: fmt(filtered.length), sub: `${policies.length} policies` },
    { label: 'Total traces', value: fmt(filtered.reduce((a, r) => a + (r.traceCount ?? 0), 0)), sub: 'per-decision provenance' },
    { label: 'Anomaly-flagged', value: fmt(filtered.filter(r => anomaliesByMatchTr[r.matchId]).length), sub: 'of trace records', tone: filtered.some(r => anomaliesByMatchTr[r.matchId]) ? 'alert' : undefined },
  ]);
  app.innerHTML = `<section class="panel"><div class="panel-header"><div><h2>Decision Traces</h2><p>${filtered.length} match trace records</p></div><div class="toolbar"><select id="trace-filter-policy"><option value="all">All policies</option>${policies.map(p => `<option value="${esc(p)}" ${p === filterPolicy ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div></div><div class="panel-body">${obsContextStrip(state.observatory)}${traceSummaryHtml}<div class="table-wrap"><table class="data-table"><thead><tr><th>Match ID</th><th>Policy</th><th>Traces</th><th>Seat</th><th>Flags</th></tr></thead><tbody>${filtered.map(r => `<tr class="clickable-row" data-match-id="${esc(r.matchId)}"><td class="mono">${short(r.matchId)}</td><td>${esc(r.policyId ?? '—')}</td><td>${r.traceCount ?? '—'}</td><td>${r.seat ?? '—'}</td><td>${anomaliesByMatchTr[r.matchId] ? `<span class="obs-anomaly-flag" title="${anomaliesByMatchTr[r.matchId]} anomaly record(s) for this match">⚠ ${anomaliesByMatchTr[r.matchId]}</span>` : ''}</td></tr>`).join('')}</tbody></table></div></div></section><div id="opening-patterns-slot"><div class="ix-chart-empty">Loading opening move patterns…</div></div>`;
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
