// Build script: reads balance-check-findings.json + effect-ranking.csv +
// effect-pairwise-matrix.csv and emits a single canonical JSON blob to
// reports/balance-check/atlas-data.json. This is a dev-time generator only;
// the produced JSON is embedded into index.htm.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bc = join(root, 'reports', 'balance-check');
const findings = JSON.parse(readFileSync(join(bc, 'balance-check-findings.json'), 'utf8'));

// ── Parse effect-ranking.csv (supplies Setup, Counterplay, Reachability, ThreatValue label) ──
function parseCsv(text) {
  const rows = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter(l => l.length);
  // Simple CSV parser that respects quoted fields containing commas.
  const splitLine = (line) => {
    const out = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else {
        if (ch === '"') q = true;
        else if (ch === ',') { out.push(cur); cur = ''; }
        else cur += ch;
      }
    }
    out.push(cur);
    return out;
  };
  const header = splitLine(lines[0]);
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const row = {};
    header.forEach((h, idx) => { row[h] = cells[idx] ?? ''; });
    rows.push(row);
  }
  return rows;
}

const rankingRows = parseCsv(readFileSync(join(bc, 'effect-ranking.csv'), 'utf8'));

// Pairwise matrix is a dense grid — parse as raw arrays (header + rows).
function parseCsvArrays(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter(l => l.length);
  const splitLine = (line) => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else {
        if (ch === '"') q = true;
        else if (ch === ',') { out.push(cur); cur = ''; }
        else cur += ch;
      }
    }
    out.push(cur); return out;
  };
  return lines.map(splitLine);
}
const pairwiseArrays = parseCsvArrays(readFileSync(join(bc, 'effect-pairwise-matrix.csv'), 'utf8'));

// Build CSV lookup by Effect ID
const csvById = new Map();
for (const r of rankingRows) csvById.set(r['Effect ID'], r);

const er = findings.effectRanking;

// ── Build canonical route records (one per effectId), merging all axes ──
function indexBy(arr, key) {
  const m = new Map();
  for (const r of arr) m.set(r[key], r);
  return m;
}
const pracW = indexBy(er.practicalRankingAsWritten, 'effectId');
const pracE = indexBy(er.practicalRankingAsExecuted, 'effectId');
const eff = indexBy(er.efficiencyRanking, 'effectId');
const thr = indexBy(er.threatRanking, 'effectId');
const cmb = indexBy(er.comebackRanking, 'effectId');
const snb = indexBy(er.snowballRanking, 'effectId');

// All effect ids = union across rankings (practical written has 101)
const allIds = er.practicalRankingAsWritten.map(r => r.effectId);

const routes = allIds.map(id => {
  const w = pracW.get(id);
  const e = pracE.get(id);
  const ef = eff.get(id);
  const t = thr.get(id);
  const c = cmb.get(id);
  const s = snb.get(id);
  const csv = csvById.get(id) || {};
  const base = w || e || ef || t || c || s;
  return {
    id,
    source: base.source,
    route: base.route,
    primitiveId: base.primitiveId,
    primitiveName: base.primitiveName,
    timing: base.timing,
    tier: base.tier,
    pointsForgone: base.pointsForgone,
    extraCost: base.extraCostNote,
    setup: csv.Setup || null,
    counterplay: csv.Counterplay || null,
    reachability: csv.Reachability || null,
    threatLabel: csv['Threat Value'] || null,
    implementationStatus: base.implementationStatus,
    profileAvailability: base.profileAvailability,
    confidence: base.confidence,
    healthVerdict: base.healthVerdict,
    reason: base.reason,
    practicalWritten: w ? w.rank : null,
    practicalExecuted: e ? e.rank : null,
    efficiency: ef ? ef.rank : null,
    threat: t ? t.rank : null,
    threatScore: t ? t.dimensionScore : null,
    comeback: c ? c.rank : null,
    comebackScore: c ? c.dimensionScore : null,
    snowball: s ? s.rank : null,
    snowballScore: s ? s.dimensionScore : null,
  };
});

// ── Primitives (75) ──
const primitives = er.rawPotencyRanking.map(p => ({
  rank: p.rank,
  primitiveId: p.primitiveId,
  primitiveName: p.primitiveName,
  bestRouteId: p.bestRouteId,
  bestRouteName: p.bestRouteName,
  maxRawPotencyScore: p.maxRawPotencyScore,
  routeCount: p.routeCount,
  routes: p.routes,
}));

// ── Pairwise matrix: compact form. ids[] + rows[] (each a string of symbols) ──
const pairwiseHeader = pairwiseArrays[0];
const pairwiseIds = pairwiseHeader.slice(1);
const pairwiseRowsCompact = [];
const idToIdx = new Map();
pairwiseIds.forEach((id, i) => idToIdx.set(id, i));
for (let i = 1; i < pairwiseArrays.length; i++) {
  const row = pairwiseArrays[i];
  const rid = row[0];
  // Build a 1-char-per-column string. Multi-char symbols (++, --) collapse to
  // single chars: + -> 'p', ++ -> 'P', - -> 'm', -- -> 'M', ≈ -> '=', ↔ -> 'x'.
  const symMap = { '++': 'P', '+': 'p', '--': 'M', '-': 'm', '≈': '=', '↔': 'x', '?': '?' };
  let s = '';
  for (let j = 1; j < pairwiseHeader.length; j++) {
    s += symMap[row[j]] ?? '?';
  }
  pairwiseRowsCompact.push({ id: rid, s });
}

const out = {
  authority: findings.authority,
  overallAssessment: findings.overallAssessment,
  counts: {
    primitives: er.primitiveCount || primitives.length,
    asWritten: er.asWrittenEffectCount,
    asExecuted: er.asExecutedEffectCount,
    totalAuditedRoutes: er.totalAuditedRoutes,
    paretoFrontier: er.paretoFrontier.length,
  },
  strongestEffects: er.strongestEffects,
  paretoFrontier: er.paretoFrontier,
  strictDominanceFindings: er.strictDominanceFindings,
  primitives,
  routes,
  pairwiseIds,
  pairwiseRows: pairwiseRowsCompact,
};

writeFileSync(join(bc, 'atlas-data.json'), JSON.stringify(out));
console.log('Wrote atlas-data.json');
console.log('routes:', routes.length, 'primitives:', primitives.length, 'pairwiseIds:', pairwiseIds.length);
console.log('paretoFrontier:', er.paretoFrontier.length);
// Validation
const ids = new Set(routes.map(r => r.id));
if (ids.size !== routes.length) console.error('DUPLICATE IDS!');
console.log('unique route ids:', ids.size);
console.log('practical written ranks contiguous 1-101:', routes.every(r => r.practicalWritten >= 1 && r.practicalWritten <= 101) && new Set(routes.map(r => r.practicalWritten)).size === 101);
const exec = routes.filter(r => r.practicalExecuted != null);
console.log('executed count:', exec.length, 'contiguous 1-75:', new Set(exec.map(r => r.practicalExecuted)).size === 75);
console.log('primitive ranks valid:', primitives.every(p => p.rank >= 1 && p.rank <= 75) && new Set(primitives.map(p => p.rank)).size === 75);
