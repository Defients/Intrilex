import { mkdir,  readFile,  writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPolicyMatch } from '@intrilex/simulation-runtime';
import { hashCanonical } from '@intrilex/shared';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = path.join(root, 'sample-data/autonomy');
const traceDir = path.join(base, 'decision-traces');
const resume = process.argv.includes('--resume');

const retention = JSON.parse(await readFile(path.join(base, 'retention-index.json'), 'utf8'));
await mkdir(traceDir, { recursive: true });

const records = [];
for (const record of retention.records) {
  const summary = record.summary;
  const tracePath = path.join(traceDir, `${summary.matchId}.json`);

  if (resume) {
    const existing = await readFile(tracePath, 'utf8').then(JSON.parse).catch(() => null);
    if (existing && existing.matchId === summary.matchId) {
      records.push({ matchId: summary.matchId, matchOrdinal: summary.matchOrdinal, traceCount: existing.traceCount });
      console.log(`TRACE RESUME: ${summary.matchId} (${existing.traceCount} traces)`);
      continue;
    }
  }

  const result = runPolicyMatch({
    ordinal: summary.matchOrdinal,
    seed: summary.seed,
    profileId: summary.profileId,
    seatOrder: summary.seatOrder,
    policyIds: summary.policyIds,
    decisionLimit: 1800,
    includeReplay: false,
    decisionTracesEnabled: true
  });

  if (result.summary.matchResultHash !== summary.matchResultHash) {
    console.error(`HASH MISMATCH: ${summary.matchId} — skipping`);
    continue;
  }

  const traces = result.decisionTraces ?? [];
  const artifact = {
    schemaVersion: '2.0.0',
    matchId: summary.matchId,
    matchOrdinal: summary.matchOrdinal,
    traceCount: traces.length,
    traces
  };
  await writeFile(tracePath, JSON.stringify(artifact) + '\n');
  records.push({ matchId: summary.matchId, matchOrdinal: summary.matchOrdinal, traceCount: traces.length });
  console.log(`TRACE PASS: ${summary.matchId} (${traces.length} traces)`);
}

const indexCore = { schemaVersion: '2.0.0', traceCount: records.length, records };
const index = { ...indexCore, indexHash: hashCanonical(indexCore) };
await writeFile(path.join(base, 'decision-trace-index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`DECISION TRACES PASS: ${records.length} matches, ${records.reduce((sum, r) => sum + r.traceCount, 0)} total traces`);
