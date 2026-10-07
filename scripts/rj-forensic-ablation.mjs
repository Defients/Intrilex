// Red Joker ablation runner — re-runs the campaign cohort with diagnostic
// policy modifiers ("<id>|drop:<family[:mode]>") so each RJ mode can be
// suppressed independently on IDENTICAL seeds. Seeds derive from
// experimentHash+ordinal, not policyIds, so arms share matchups with baseline.
// Usage: node scripts/rj-forensic-ablation.mjs --variant no-effects --matches 100 --out runtime/forensic-rj/abl-no-effects
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPolicyMatch, deriveMatchSeed } from '../packages/simulation-runtime/src/runtime.mjs';
import { buildRankAnalytics } from '@intrilex/analytics/rank-integration';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const variant = arg('--variant', 'no-effects');
const matchCount = Number(arg('--matches', 100));
const outDir = path.resolve(root, arg('--out', `runtime/forensic-rj/abl-${variant}`));

const VARIANTS = {
  'none': '',
  'no-effects': 'drop:effect-red-joker',                 // score-only control
  'no-hand-swap': 'drop:effect-red-joker:hand-swap',
  'no-self-reset': 'drop:effect-red-joker:self-reset',
  'no-opponent-attack': 'drop:effect-red-joker:opponent-attack',
  'no-shuffle-reset': 'drop:effect-red-joker:shuffle-reset',
};
const mod = VARIANTS[variant];
if (mod === undefined) throw new Error(`unknown variant ${variant}; choices: ${Object.keys(VARIANTS).join(', ')}`);

const exp = JSON.parse(await readFile(path.join(root, 'sample-data/autonomy/experiment.json'), 'utf8'));
const policyPairs = exp.policyPairs;
const experimentHash = exp.experimentHash;
const profileId = 'core-advanced-authority';
const decisionLimit = exp.safetyLimits?.maxPolicyDecisions ?? 3600;

const summaries = [];
const t0 = performance.now();
for (let ordinal = 0; ordinal < matchCount; ordinal += 1) {
  const pair = policyPairs[ordinal % policyPairs.length];
  const swap = Math.floor(ordinal / policyPairs.length) % 2 === 1;
  const seatOrder = swap ? ['P2', 'P1'] : ['P1', 'P2'];
  const seed = deriveMatchSeed(experimentHash, ordinal);
  const policyIds = mod ? pair.map(p => `${p}|${mod}`) : pair;
  const { summary } = runPolicyMatch({ profileId, seed, seatOrder, policyIds, decisionLimit, telemetryEnabled: true, includeReplay: false });
  summaries.push(summary);
}

const rankAnalytics = buildRankAnalytics({ summaries });
const rj = rankAnalytics.rankPower?.ranks?.RJ ?? null;
const bj = rankAnalytics.rankPower?.ranks?.BJ ?? null;

await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'summaries.ndjson'), summaries.map(s => JSON.stringify(s)).join('\n') + '\n');
await writeFile(path.join(outDir, 'rank-analytics.json'), JSON.stringify(rankAnalytics, null, 2) + '\n');
console.log(JSON.stringify({
  variant, matchCount, durationMs: Math.round(performance.now() - t0),
  canonicalResultHash: summaries.map(s => s.matchResultHash).join('').length && undefined,
  rj: rj ? { rpi: rj.rpi, confidence: rj.confidence, raw: rj.raw, sel: rj.metrics?.selectionCount, opps: rj.metrics?.opportunityCount, fams: rj.metrics?.playFamilyCounts } : null,
  bj: bj ? { rpi: bj.rpi } : null,
  ladder: (rankAnalytics.rankPower?.ladder ?? []).map(e => ({ r: e.rank, rpi: e.rpi === null ? null : +e.rpi.toFixed(3) }))
}, null, 2));
