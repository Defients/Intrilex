// Rank forensic campaign harness — re-runs the mechanics-observatory cohort
// (identical experimentHash → identical seeds/policy pairs) and computes rank +
// variant analytics. Used for controlled A/B evaluation of AI/analytics changes.
// Usage: node scripts/rank-forensic-campaign.mjs --out runtime/forensic-rank6/baseline [--matches 100] [--workers 1]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCampaign } from '@intrilex/simulation-runtime/campaign';
import { buildRankAnalytics } from '@intrilex/analytics/rank-integration';
import { buildVariantAnalytics } from '@intrilex/analytics/rank-integration';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const outDir = path.resolve(root, arg('--out', 'runtime/forensic-rank6/run'));
const matchCount = Number(arg('--matches', 100));
const workerCount = Number(arg('--workers', 1));

const exp = JSON.parse(await readFile(path.join(root, 'sample-data/autonomy/experiment.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(root, 'config/engine-manifest.json'), 'utf8'));
const rel = JSON.parse(await readFile(path.join(root, 'config/release-identity.json'), 'utf8'));

const config = {
  profileId: 'core-advanced-authority',
  matchCount: exp.matchCount,
  policyPairs: exp.policyPairs,
  decisionLimit: exp.safetyLimits?.maxPolicyDecisions ?? 3600,
  authorityHash: manifest.rankAuthority?.authorityHash ?? null,
  releaseIdentityHash: rel.integrityHash ?? null,
  evidenceEpoch: exp.evidenceEpoch ?? 'post-rules-parity-repair-v0.28.1',
  postRulesParityRepair: true
};

const t0 = performance.now();
const campaign = await runCampaign({ ...config, ordinalStart: 0, ordinalEnd: matchCount, workerCount });
const durationMs = Math.round(performance.now() - t0);
if (campaign.experimentHash !== exp.experimentHash) {
  throw new Error(`EXPERIMENT_HASH_MISMATCH: got ${campaign.experimentHash}, want ${exp.experimentHash}`);
}

const rankAnalytics = buildRankAnalytics({ summaries: campaign.summaries });
const variantAnalytics = buildVariantAnalytics({ summaries: campaign.summaries });

await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'summaries.ndjson'), campaign.summaries.map(s => JSON.stringify(s)).join('\n') + '\n');
await writeFile(path.join(outDir, 'rank-analytics.json'), JSON.stringify(rankAnalytics, null, 2) + '\n');
await writeFile(path.join(outDir, 'variant-analytics.json'), JSON.stringify(variantAnalytics, null, 2) + '\n');

const ranks = rankAnalytics.rankPower?.ranks ?? {};
const brief = (r) => ranks[r] ? {
  rpi: ranks[r].rpi, confidence: ranks[r].confidence,
  axes: ranks[r].axes, raw: ranks[r].raw
} : null;
const sixVariant = variantAnalytics.variantMetrics ?? {};
const sixKeys = Object.keys(sixVariant).filter(k => k === '6' || k.startsWith('6:'));

const report = {
  status: campaign.campaignStatus,
  experimentHash: campaign.experimentHash,
  canonicalResultHash: campaign.canonicalResultHash,
  matchCount: campaign.matchCount,
  durationMs,
  rank6: brief('6'),
  rankRJ: brief('RJ'),
  rank7: brief('7'),
  rank5: brief('5'),
  sixVariants: Object.fromEntries(sixKeys.map(k => [k, sixVariant[k]])),
  ladder: (rankAnalytics.rankPower?.ladder ?? []).map(e => ({ rank: e.rank, rpi: e.rpi }))
};
await writeFile(path.join(outDir, 'forensic-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, hashMatch: true, matchCount: report.matchCount, durationMs, rank6rpi: report.rank6?.rpi, rankRJrpi: report.rankRJ?.rpi, summariesDir: outDir }, null, 2));
