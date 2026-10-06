// ═══════════════════════════════════════════════════════════════
// meta-atlas.test.mjs — Meta Atlas V1 domain + presentation tests
//
// Covers: per-policy metric aggregation, missing-telemetry honesty,
// population statistics, directional matchup edges, node exclusion,
// collision handling, deterministic position explanation, comparison,
// and the SVG/HTML string renderers (which are pure — no DOM needed).
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  quantile, atlasDistribution, nodeEvidenceTier, edgeEvidenceTier,
  atlasCohortKey, atlasCohorts, buildPolicyStats, buildMatchupEdges,
  buildAtlasModel, atlasMetric, ATLAS_METRIC_IDS, metricAvailability,
  formatAtlasMetric, collisionGroups, collisionOffsets, identityColor,
  explainPosition, comparisonRows, headToHead, metricPercentile,
  EDGE_MIN_DECISIVE,
} from '@intrilex/analytics/meta-atlas';
import {
  renderAtlasSvg, atlasViewport, atlasScales, nodeFill, nodeRadius,
  atlasInspectorHtml, atlasSummaryHtml, atlasLegendHtml, atlasTooltipHtml,
  atlasTableAlt, policyLabel, ATLAS_CANVAS,
} from '../apps/lab-web/src/atlas/atlas-render.mjs';
import { readFileSync } from 'node:fs';

// ── fixture helpers ──────────────────────────────────────────────────────
function mkSummary({ id, p1 = 'alpha', p2 = 'beta', p1Seat = 1, r1 = 'win', r2 = 'loss',
  winner = 'P1', term = 'NORMAL_VICTORY', turns = 10, s1 = {}, s2 = {}, extra = {} }) {
  return {
    matchId: id, policyIds: [p1, p2], seatOrder: ['P1', 'P2'], winner,
    winningSeat: winner === 'P1' ? 1 : 2, terminationReason: term,
    completedFullTurns: turns, finalScores: { P1: 20, P2: 10 },
    participants: [
      {
        matchId: id, seat: p1Seat, playerId: 'P1', policyId: p1, result: r1,
        scoreFor: r1 === 'win' ? 20 : 10, scoreAgainst: r1 === 'win' ? 10 : 20,
        decisionCount: 10, responseOpportunityCount: 4, responsePlayCount: 2,
        responseDeclineCount: 2, miniTurnActionCount: 5, advancedDecisionCount: 1,
        ultraDecisionCount: 0, voltageDecisionCount: 0, privateChoiceDecisionCount: 1,
        mechanicCounts: { score: 2, draw: 1, 'clear-pr': 1 },
        mechanicOpportunityCounts: { score: 3, draw: 2, 'clear-pr': 2 },
        ...s1,
      },
      {
        matchId: id, seat: p1Seat === 1 ? 2 : 1, playerId: 'P2', policyId: p2, result: r2,
        scoreFor: r2 === 'win' ? 20 : 10, scoreAgainst: r2 === 'win' ? 10 : 20,
        decisionCount: 10, responseOpportunityCount: 4, responsePlayCount: 1,
        responseDeclineCount: 3, miniTurnActionCount: 3, advancedDecisionCount: 0,
        ultraDecisionCount: 0, voltageDecisionCount: 0, privateChoiceDecisionCount: 0,
        mechanicCounts: { score: 1, draw: 2, 'clear-pr': 0 },
        mechanicOpportunityCounts: { score: 3, draw: 3, 'clear-pr': 2 },
        ...s2,
      },
    ],
    ...extra,
  };
}

// alpha beats beta n-1 over n+1 games (beta wins the last one), alternating seats.
function alphaBetaSeries(n) {
  const rows = [];
  for (let i = 0; i < n + 1; i += 1) {
    const alphaWins = i < n;
    rows.push(mkSummary({
      id: `M-ab-${i}`, p1: 'alpha', p2: 'beta', p1Seat: i % 2 === 0 ? 1 : 2,
      r1: alphaWins ? 'win' : 'loss', r2: alphaWins ? 'loss' : 'win',
      winner: alphaWins ? 'P1' : 'P2',
    }));
  }
  return rows;
}

// ── distribution / quantile ──────────────────────────────────────────────
test('MetaAtlas: quantile uses linear interpolation and ignores non-finite values', () => {
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(quantile([1, 2, 3, 4], 0.25), 1.75);
  assert.equal(quantile([5, Number.NaN, 9, undefined], 0.5), 7);
  assert.equal(quantile([], 0.5), null);
});

test('MetaAtlas: atlasDistribution reports count/mean/median/quartiles/min/max', () => {
  const d = atlasDistribution([1, 2, 3, 4, 100]);
  assert.equal(d.count, 5);
  assert.equal(d.median, 3);
  assert.equal(d.min, 1);
  assert.equal(d.max, 100);
  assert.ok(Math.abs(d.mean - 22) < 1e-9);
  assert.equal(d.p25, 2);   // pos = 4 * .25 = 1 → sorted[1]
  assert.equal(d.p75, 4);   // pos = 4 * .75 = 3 → sorted[3]
  const empty = atlasDistribution([Number.NaN]);
  assert.equal(empty.count, 0);
  assert.equal(empty.median, null);
});

// ── evidence tiers ───────────────────────────────────────────────────────
test('MetaAtlas: node evidence tiers follow the honest bands', () => {
  assert.equal(nodeEvidenceTier(0), 'insufficient');
  assert.equal(nodeEvidenceTier(7), 'very-low');
  assert.equal(nodeEvidenceTier(23), 'low');
  assert.equal(nodeEvidenceTier(50), 'moderate');
  assert.equal(nodeEvidenceTier(120), 'high');
});

test('MetaAtlas: edge evidence tiers use documented decisive-game thresholds', () => {
  assert.equal(edgeEvidenceTier(EDGE_MIN_DECISIVE - 1), 'insufficient');
  assert.equal(edgeEvidenceTier(EDGE_MIN_DECISIVE), 'low');
  assert.equal(edgeEvidenceTier(20), 'moderate');
  assert.equal(edgeEvidenceTier(30), 'strong');
});

// ── cohort scoping ───────────────────────────────────────────────────────
test('MetaAtlas: cohort keys distinguish certified, batch-matrix, and lab-run rows', () => {
  assert.equal(atlasCohortKey({}), 'certified');
  assert.equal(atlasCohortKey({ matrixId: 'MX-1' }), 'matrix:MX-1');
  assert.equal(atlasCohortKey({ telemetryOrigin: 'EVOLUTION_LAB', labRunId: 'R-9' }), 'lab:R-9');
  const groups = atlasCohorts([{ matrixId: 'MX-1' }, { matrixId: 'MX-1' }, {}]);
  assert.equal(groups.get('matrix:MX-1').length, 2);
  assert.equal(groups.get('certified').length, 1);
});

// ── policy aggregation ───────────────────────────────────────────────────
test('MetaAtlas: buildPolicyStats aggregates wins, seats, scores, and coverage', () => {
  const stats = buildPolicyStats(alphaBetaSeries(3));
  const a = stats.get('alpha'), b = stats.get('beta');
  assert.equal(a.games, 4);
  assert.equal(a.crossWins, 3);
  assert.equal(a.crossLosses, 1);
  assert.equal(b.crossWins, 1);
  assert.equal(b.crossLosses, 3);
  // alternating seats: alpha in seat1 on i=0,2 → 2 seat-1 games (both wins)
  assert.equal(a.seat1Games, 2);
  assert.equal(a.seat1Wins, 2);
  assert.equal(a.seat2Games, 2);
  // miniTurnActionCount: 5 for alpha each game → 5.0/game
  assert.equal(atlasMetric('miniTurnsPerGame').extract(a), 5);
  // responsePlayRate: 2 plays / 4 opps per game → 0.5
  assert.equal(atlasMetric('responsePlayRate').extract(a), 0.5);
  // winRate is cross-policy decisive only
  assert.ok(Math.abs(atlasMetric('winRate').extract(a) - 0.75) < 1e-9);
});

test('MetaAtlas: missing telemetry fields produce null metrics, not fabricated zeroes', () => {
  const row = mkSummary({ id: 'M-missing', p1: 'ghost', p2: 'beta', s1: { responseOpportunityCount: undefined, responsePlayCount: undefined, mechanicCounts: undefined, mechanicOpportunityCounts: undefined } });
  // Strip the fields entirely to simulate an old summary that never retained them.
  delete row.participants[0].responseOpportunityCount;
  delete row.participants[0].responsePlayCount;
  delete row.participants[0].mechanicCounts;
  delete row.participants[0].mechanicOpportunityCounts;
  const stats = buildPolicyStats([row]);
  const ghost = stats.get('ghost');
  assert.equal(atlasMetric('responsePlayRate').extract(ghost), null);
  assert.equal(atlasMetric('scoreFrequency').extract(ghost), null);
  assert.equal(atlasMetric('prInteractionRate').extract(ghost), null);
  // The beta side retained its telemetry and still resolves.
  assert.equal(atlasMetric('responsePlayRate').extract(stats.get('beta')), 0.25);
});

test('MetaAtlas: self-play counts toward games but never the cross-policy record', () => {
  const stats = buildPolicyStats([
    mkSummary({ id: 'S-1', p1: 'alpha', p2: 'alpha' }),
    mkSummary({ id: 'S-2', p1: 'alpha', p2: 'beta' }),
  ]);
  const a = stats.get('alpha');
  assert.equal(a.games, 3);           // 2 seats in the self-play match + 1 vs beta
  assert.equal(a.selfPlayGames, 2);
  assert.equal(a.crossWins, 1);
  assert.equal(a.crossLosses, 0);
  assert.equal(a.crossDecisive, 1);
});

test('MetaAtlas: draws and aborts are tracked without polluting decisive rates', () => {
  const stats = buildPolicyStats([
    mkSummary({ id: 'D-1', r1: 'draw', r2: 'draw', winner: null, term: 'CANONICAL_DRAW' }),
    mkSummary({ id: 'D-2', r1: 'abort', r2: 'abort', winner: null, term: 'ABORTED' }),
    mkSummary({ id: 'D-3', r1: 'win', r2: 'loss', winner: 'P1' }),
  ]);
  const a = stats.get('alpha');
  assert.equal(a.games, 3);
  assert.equal(a.draws, 1);
  assert.equal(a.aborts, 1);
  assert.equal(a.crossDraws, 1);
  assert.equal(a.crossDecisive, 1);
  assert.equal(atlasMetric('winRate').extract(a), 1);
});

// ── matchup edges ────────────────────────────────────────────────────────
test('MetaAtlas: buildMatchupEdges produces directional records with advantage', () => {
  const edges = buildMatchupEdges(alphaBetaSeries(5)); // alpha 5–1 vs beta
  assert.equal(edges.length, 1);
  const e = edges[0];
  assert.equal(e.a, 'alpha'); // pair normalized alphabetically
  assert.equal(e.b, 'beta');
  assert.equal(e.games, 6);
  assert.equal(e.decisive, 6);
  assert.equal(e.aWins, 5);
  assert.equal(e.bWins, 1);
  assert.ok(Math.abs(e.winRate - 5 / 6) < 1e-9);
  assert.ok(Math.abs(e.advantage - (5 / 6 - 0.5)) < 1e-9);
  assert.equal(e.tier, 'low'); // 6 decisive = EDGE_MIN_DECISIVE
  assert.equal(e.balancedSeats, true);
  assert.ok(Array.isArray(e.wilson95) && e.wilson95[0] < e.wilson95[1]);
  assert.equal(e.matchIds.length, 6);
});

test('MetaAtlas: edges exclude self-play, count draws, flag insufficient evidence', () => {
  const edges = buildMatchupEdges([
    mkSummary({ id: 'E-1', p1: 'alpha', p2: 'alpha' }),               // self-play — skipped
    mkSummary({ id: 'E-2', p1: 'alpha', p2: 'beta', r1: 'draw', r2: 'draw', winner: null, term: 'CANONICAL_DRAW' }),
    mkSummary({ id: 'E-3', p1: 'alpha', p2: 'beta' }),                // alpha wins
  ]);
  assert.equal(edges.length, 1);
  const e = edges[0];
  assert.equal(e.games, 2);
  assert.equal(e.decisive, 1);
  assert.equal(e.draws, 1);
  assert.equal(e.tier, 'insufficient');
});

test('MetaAtlas: unbalanced seats are reported on the edge', () => {
  const rows = [];
  for (let i = 0; i < 7; i += 1) rows.push(mkSummary({ id: `U-${i}`, p1: 'alpha', p2: 'beta', p1Seat: 1 }));
  const e = buildMatchupEdges(rows)[0];
  assert.equal(e.balancedSeats, false);
  assert.equal(e.seatA1, 7);
  assert.equal(e.seatB1, 0);
});

// ── atlas model ──────────────────────────────────────────────────────────
test('MetaAtlas: buildAtlasModel normalizes nodes with axis values and evidence', () => {
  const model = buildAtlasModel({ summaries: alphaBetaSeries(5), xMetricId: 'miniTurnsPerGame', yMetricId: 'winRate' });
  assert.equal(model.nodes.length, 2);
  const alpha = model.nodes.find((n) => n.id === 'alpha');
  assert.equal(alpha.x, 5);
  assert.ok(Math.abs(alpha.y - 5 / 6) < 1e-9);
  assert.equal(alpha.games, 6);
  assert.equal(alpha.evidence, 'very-low');
  assert.equal(alpha.matchIds.length, 6);
  assert.equal(model.matchCount, 6);
  assert.equal(model.population.x.median, 4); // [5,3] → median 4
});

test('MetaAtlas: nodes below the evidence filter or lacking a metric are excluded with reasons', () => {
  const rows = alphaBetaSeries(5);
  const filtered = buildAtlasModel({ summaries: rows, xMetricId: 'miniTurnsPerGame', yMetricId: 'winRate', minGames: 10 });
  assert.equal(filtered.nodes.length, 0);
  assert.equal(filtered.excluded.length, 2);
  assert.match(filtered.excluded[0].reason, /below minimum evidence/);

  // A metric nobody satisfies excludes every node — never plotted at 0.
  const noPr = rows.map((r) => ({ ...r, participants: r.participants.map((p) => ({ ...p, mechanicOpportunityCounts: undefined, mechanicCounts: { ...p.mechanicCounts, 'clear-pr': undefined } })) }));
  const m2 = buildAtlasModel({ summaries: noPr, xMetricId: 'miniTurnsPerGame', yMetricId: 'prInteractionRate' });
  assert.equal(m2.nodes.length, 0);
  assert.match(m2.excluded[0].reason, /PR-row|unavailable/i);
});

test('MetaAtlas: invalid metric ids fall back to defaults; cohort scope isolates evidence', () => {
  const rows = [
    ...alphaBetaSeries(2).map((r) => ({ ...r, matrixId: 'MX-lab' })),
    ...alphaBetaSeries(4),
  ];
  const model = buildAtlasModel({ summaries: rows, xMetricId: 'bogus', yMetricId: 'winRate' });
  assert.equal(model.xDef.id, 'miniTurnsPerGame'); // fallback
  assert.deepEqual(model.cohorts.sort(), ['certified', 'matrix:MX-lab'].sort());

  const scoped = buildAtlasModel({ summaries: rows, xMetricId: 'miniTurnsPerGame', yMetricId: 'winRate', cohort: 'certified' });
  assert.equal(scoped.matchCount, 5);
  const alpha = scoped.nodes.find((n) => n.id === 'alpha');
  assert.ok(Math.abs(alpha.y - 4 / 5) < 1e-9);
});

// ── collisions ───────────────────────────────────────────────────────────
test('MetaAtlas: identical coordinates form deterministic collision groups with pixel-space rings', () => {
  const items = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }, { id: 'c', v: 2 }, { id: 'd', v: 1 }];
  const groups = collisionGroups(items, (i) => i.v);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].map((i) => i.id), ['a', 'b', 'd']);
  const ring = collisionOffsets(3, 9);
  assert.equal(ring.length, 3);
  // deterministic + spread around the true point (offsets, never value mutation)
  assert.deepEqual(ring, collisionOffsets(3, 9));
  for (const o of ring) assert.ok(Math.hypot(o.dx, o.dy) > 8.9 && Math.hypot(o.dx, o.dy) < 9.1);
});

// ── explanation + comparison ─────────────────────────────────────────────
test('MetaAtlas: explainPosition is deterministic quartile language with no causal claims', () => {
  const model = buildAtlasModel({ summaries: alphaBetaSeries(5), xMetricId: 'miniTurnsPerGame', yMetricId: 'winRate' });
  const alpha = model.nodes.find((n) => n.id === 'alpha');
  const ex = explainPosition(alpha, model);
  assert.match(ex.x, /Mini-Turns \/ Game is 5\.00/);
  assert.match(ex.y, /Win Rate is 83\.3%/);
  // alpha sits above beta on both axes → "above" or "top quartile" language
  assert.match(ex.summary, /not a claim about intent/);
  assert.doesNotMatch(ex.summary, /prefers|because it wants|aggressive|defensive/i);
  assert.deepEqual(ex, explainPosition(alpha, model)); // deterministic
});

test('MetaAtlas: comparisonRows reports absolute values and signed deltas', () => {
  const model = buildAtlasModel({ summaries: alphaBetaSeries(5), xMetricId: 'miniTurnsPerGame', yMetricId: 'winRate' });
  const a = model.nodes.find((n) => n.id === 'alpha');
  const b = model.nodes.find((n) => n.id === 'beta');
  const rows = comparisonRows(a, b, model);
  const wr = rows.find((r) => r.id === 'winRate');
  assert.ok(Math.abs(wr.delta - (5 / 6 - 1 / 6)) < 1e-9);
  const mini = rows.find((r) => r.id === 'miniTurnsPerGame');
  assert.equal(mini.a, 5);
  assert.equal(mini.b, 3);
  assert.equal(mini.delta, 2);
  // comparison always includes both axis metrics
  assert.ok(rows.some((r) => r.id === model.xDef.id));
  assert.ok(rows.some((r) => r.id === model.yDef.id));
});

test('MetaAtlas: headToHead normalizes direction and carries evidence tier', () => {
  const model = buildAtlasModel({ summaries: alphaBetaSeries(5), xMetricId: 'miniTurnsPerGame', yMetricId: 'winRate' });
  const h2h = headToHead(model, 'beta', 'alpha'); // queried in reverse order
  assert.equal(h2h.wins, 1);   // beta's wins
  assert.equal(h2h.losses, 5);
  assert.ok(Math.abs(h2h.winRate - 1 / 6) < 1e-9);
  assert.equal(h2h.tier, 'low');
  assert.equal(h2h.matchIds.length, 6);
  assert.equal(headToHead(model, 'alpha', 'nobody'), null);
});

test('MetaAtlas: metricPercentile ranks a value against all computable peers', () => {
  const model = buildAtlasModel({ summaries: alphaBetaSeries(5), xMetricId: 'miniTurnsPerGame', yMetricId: 'winRate' });
  // mid-rank convention: (below + tied/2) / peers → alpha .75, beta .25
  assert.equal(metricPercentile(model, 'miniTurnsPerGame', 5), 0.75);
  assert.equal(metricPercentile(model, 'miniTurnsPerGame', 3), 0.25);
  assert.equal(metricPercentile(model, 'miniTurnsPerGame', null), null);
});

// ── metric registry + availability ───────────────────────────────────────
test('MetaAtlas: registry entries carry the required metadata contract', () => {
  for (const id of ATLAS_METRIC_IDS) {
    const def = atlasMetric(id);
    assert.ok(def.id === id);
    assert.ok(typeof def.label === 'string' && def.label.length > 0, `${id} label`);
    assert.ok(typeof def.axis === 'string', `${id} axis`);
    assert.ok(typeof def.unit === 'string', `${id} unit`);
    assert.ok(typeof def.category === 'string', `${id} category`);
    assert.ok(typeof def.description === 'string', `${id} description`);
    assert.ok(typeof def.source === 'string', `${id} provenance`);
    assert.equal(typeof def.extract, 'function', `${id} extract`);
  }
  assert.equal(formatAtlasMetric(0.836, 'winRate'), '83.6%');
  assert.equal(formatAtlasMetric(null, 'winRate'), '—');
});

test('MetaAtlas: metricAvailability disables metrics with no evidence coverage', () => {
  const stats = buildPolicyStats(alphaBetaSeries(2));
  const avail = metricAvailability(stats, { hasOpportunityTelemetry: false });
  const pr = avail.find((a) => a.id === 'prInteractionRate');
  assert.equal(pr.available, false);
  assert.match(pr.reason, /opportunity/);
  const wr = avail.find((a) => a.id === 'winRate');
  assert.equal(wr.available, true);
});

// ── identity colors ──────────────────────────────────────────────────────
test('MetaAtlas: identityColor is deterministic and palette-bound', () => {
  assert.equal(identityColor('control'), identityColor('control'));
  assert.match(identityColor('control'), /^#[0-9a-f]{6}$/i);
  assert.notEqual(identityColor('control'), identityColor('tempo'));
});

// ══ presentation layer (pure string builders — no DOM needed) ══
const RENDER_SUMMARIES = alphaBetaSeries(5).concat(alphaBetaSeries(3).map((r, i) => ({
  ...r, matchId: `M-ac-${i}`, policyIds: ['alpha', 'gamma'],
  participants: r.participants.map((p, j) => ({ ...p, policyId: j === 0 ? 'alpha' : 'gamma' })),
})));

function renderModel() {
  return buildAtlasModel({ summaries: RENDER_SUMMARIES, xMetricId: 'miniTurnsPerGame', yMetricId: 'winRate' });
}

test('MetaAtlas render: canvas emits accessible SVG with nodes, ticks, and median guides', () => {
  const model = renderModel();
  const svg = renderAtlasSvg({ model });
  assert.match(svg, /^<svg/);
  assert.match(svg, /role="img"/);
  assert.match(svg, /aria-label/);
  assert.equal((svg.match(/data-atlas-node=/g) ?? []).length, 3);
  assert.match(svg, /atlas-median/);
  assert.match(svg, /median/);
  assert.match(svg, /Mini-turn actions per game/);
  // neutral quadrant language — no strategy names
  assert.match(svg, /higher .* · higher/);
  assert.doesNotMatch(svg, /Aggressive|Control quadrant|Tempo quadrant/i);
});

test('MetaAtlas render: selected overlay draws directed edges from the selection only', () => {
  const model = renderModel();
  const none = renderAtlasSvg({ model, overlay: 'off' });
  assert.ok(!(none.match(/data-edge-a=/g) ?? []).length);
  const sel = renderAtlasSvg({ model, overlay: 'selected', selectedId: 'alpha' });
  const edgeCount = (sel.match(/data-edge-a=/g) ?? []).length;
  assert.equal(edgeCount, 2); // alpha–beta, alpha–gamma
  const all = renderAtlasSvg({ model, overlay: 'all' });
  assert.ok((all.match(/data-edge-a=/g) ?? []).length >= edgeCount);
});

test('MetaAtlas render: weak-evidence nodes get the dashed ring + reduced opacity class', () => {
  const model = renderModel(); // all nodes are very-low (n<10)
  const svg = renderAtlasSvg({ model });
  assert.match(svg, /atlas-node-ring/);
  assert.match(svg, /is-weak/);
});

test('MetaAtlas render: viewport fits nodes + medians; scales invert pixel↔data', () => {
  const model = renderModel();
  const vp = atlasViewport(model, null);
  for (const n of model.nodes) {
    assert.ok(n.x >= vp.xMin && n.x <= vp.xMax);
    assert.ok(n.y >= vp.yMin && n.y <= vp.yMax);
  }
  const sc = atlasScales(vp);
  const cx = ATLAS_CANVAS.width / 2, cy = ATLAS_CANVAS.height / 2;
  const d = { x: sc.toDataX(cx), y: sc.toDataY(cy) };
  assert.ok(Math.abs(sc.toPxX(d.x) - cx) < 1e-6);
  assert.ok(Math.abs(sc.toPxY(d.y) - cy) < 1e-6);
  // explicit view honored
  const pinned = atlasViewport(model, { xMin: 0, xMax: 10, yMin: 0, yMax: 1 });
  assert.equal(pinned.xMax, 10);
  assert.equal(pinned.auto, false);
});

test('MetaAtlas render: inspector shows identity, evidence, position and deterministic why', () => {
  const model = renderModel();
  const html = atlasInspectorHtml({ model, selectedId: 'alpha', compareId: null });
  assert.match(html, /data-testid="atlas-inspector"/);
  assert.match(html, /Alpha/);
  assert.match(html, /atlas-why/);
  assert.match(html, /Behavioral snapshot/);
  assert.match(html, /Head-to-head/);
  assert.match(html, /View source games/);
  const empty = atlasInspectorHtml({ model, selectedId: null, compareId: null });
  assert.match(empty, /atlas-inspector-empty/);
});

test('MetaAtlas render: comparison view shows both columns, deltas, and h2h record', () => {
  const model = renderModel();
  const html = atlasInspectorHtml({ model, selectedId: 'alpha', compareId: 'beta' });
  assert.match(html, /data-testid="atlas-comparison"/);
  assert.match(html, /Head-to-head/);
  assert.match(html, /5–1/);
  assert.match(html, /Δ \(A−B\)/);
});

test('MetaAtlas render: summary strip, legend, tooltip and table alternative are populated', () => {
  const model = renderModel();
  const summary = atlasSummaryHtml(model);
  assert.match(summary, /3<i>\/3<\/i>/);
  assert.match(summary, /Evidence games/);
  const legend = atlasLegendHtml({ colorBy: 'winRate', sizeBy: 'games', overlay: 'selected', model });
  assert.match(legend, /win rate/);
  assert.match(legend, /games/);
  const tip = atlasTooltipHtml(model.nodes[0], model);
  assert.match(tip, /atlas-tip/);
  assert.match(tip, /Games/);
  const table = atlasTableAlt(model);
  assert.match(table, /<table/);
  assert.match(table, /alpha/);
});

test('MetaAtlas render: encodings are deterministic — same model, same SVG', () => {
  const model = renderModel();
  const a = renderAtlasSvg({ model, colorBy: 'identity', sizeBy: 'uniform' });
  const b = renderAtlasSvg({ model, colorBy: 'identity', sizeBy: 'uniform' });
  assert.equal(a, b);
  // fill/radius encodings respond to the toggles
  assert.notEqual(renderAtlasSvg({ model, colorBy: 'winRate' }), renderAtlasSvg({ model, colorBy: 'identity' }));
  assert.notEqual(nodeRadius(model.nodes[0], 'games', 10), nodeRadius(model.nodes[0], 'uniform', 10));
  assert.notEqual(nodeFill(model.nodes[0], 'winRate'), nodeFill(model.nodes[0], 'uniform'));
});

// ── wiring: route + registration ─────────────────────────────────────────
test('MetaAtlas: workspace is registered in router, dispatch, styles and cosmotech accent', () => {
  const routerSrc = readFileSync('apps/lab-web/src/router.js', 'utf8');
  assert.match(routerSrc, /\['\/atlas','⌖','Meta Atlas','Strategic population map'\]/);
  assert.match(routerSrc, /'\/atlas': 'OBS-\d+ · POPULATION ATLAS'/);
  assert.ok(routerSrc.includes(`routes: ['/mechanics', '/synergies', '/ranks', '/atlas'`));
  const appSrc = readFileSync('apps/lab-web/src/app.js', 'utf8');
  assert.match(appSrc, /import \{ renderMetaAtlas \} from '\.\/workspaces\/meta-atlas\.js'/);
  assert.match(appSrc, /'\/atlas': renderMetaAtlas/);
  const stylesSrc = readFileSync('apps/lab-web/src/styles.css', 'utf8');
  assert.match(stylesSrc, /@import '\.\/css\/atlas\.css'/);
  const cosmoSrc = readFileSync('apps/lab-web/src/css/cosmotech.css', 'utf8');
  assert.match(cosmoSrc, /data-workspace="atlas"/);
  const wsSrc = readFileSync('apps/lab-web/src/workspaces/meta-atlas.js', 'utf8');
  assert.match(wsSrc, /export function renderMetaAtlas/);
  assert.match(wsSrc, /historyFilterPolicy/); // evidence cross-link preserved
  assert.match(wsSrc, /persistSetting\('atlasPrefs'/);
});

test('MetaAtlas: policyLabel prettifies ids for display without touching identity', () => {
  assert.equal(policyLabel('score-rush-tactical'), 'Score Rush Tactical');
  assert.equal(policyLabel('random-legal'), 'Random Legal');
});
