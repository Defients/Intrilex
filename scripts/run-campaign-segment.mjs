import { readFile, writeFile } from 'node:fs/promises';
import { runCampaign } from '@intrilex/simulation-runtime/campaign';

const arg = (name) => {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing ${name}`);
  return process.argv[index + 1];
};
const config = JSON.parse(await readFile(arg('--config'), 'utf8'));
const ordinalStart = Number(arg('--start'));
const ordinalEnd = Number(arg('--end'));
const workerCount = Number(arg('--workers'));
const output = arg('--output');
const started = performance.now();
const campaign = await runCampaign({ ...config, ordinalStart, ordinalEnd, workerCount });
await writeFile(output, JSON.stringify({
  schemaVersion: '1.1',
  ordinalRange: [ordinalStart, ordinalEnd],
  workerCount,
  durationMs: Math.round(performance.now() - started),
  experimentHash: campaign.experimentHash,
  semantic: campaign.semantic,
  summaries: campaign.summaries,
  records: campaign.records,
  completedCount: campaign.completedCount,
  abortedCount: campaign.abortedCount,
  unsupportedCount: campaign.unsupportedCount,
  errorCount: campaign.errorCount,
  accountingInvariant: campaign.accountingInvariant,
  campaignStatus: campaign.campaignStatus,
  segmentResultHash: campaign.canonicalResultHash
}) + '\n');
console.log(`SEGMENT PASS: ${ordinalStart}-${ordinalEnd}; workers=${workerCount}; matches=${campaign.matchCount}; status=${campaign.campaignStatus}; accounting=${campaign.accountingInvariant}`);
