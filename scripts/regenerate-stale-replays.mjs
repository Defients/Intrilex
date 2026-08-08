// regenerate-stale-replays.mjs
//
// Re-runs retained matches with the current engine and regenerates
// certified replays, public replays, and decision traces for any that
// either (a) fail replay verification or (b) have stale matchResultHash.
//
// Usage: node scripts/regenerate-stale-replays.mjs
import { readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPolicyMatch } from '@intrilex/simulation-runtime';
import { verifyAuthorityCertifiedReplay, publicAuthorityCertifiedReplayView } from '@intrilex/engine-adapter';
import { hashCanonical } from '@intrilex/shared';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = path.join(root, 'sample-data/autonomy');

const retention = JSON.parse(await readFile(path.join(base, 'retention-index.json'), 'utf8'));
const traceDir = path.join(base, 'decision-traces');
const authDir = path.join(base, 'replays/authorized');
const pubDir = path.join(base, 'replays/public');

let regenerated = 0;
let stillValid = 0;
const updatedRecords = [];

for (const record of retention.records) {
  const matchId = record.matchId;
  const summary = record.summary;
  const replayPath = path.join(authDir, `${matchId}.authorized.replay.json`);
  const publicPath = path.join(pubDir, `${matchId}.public.replay.json`);
  const tracePath = path.join(traceDir, `${matchId}.json`);

  // Step 1: Check if existing replay verifies
  let replayValid = false;
  try {
    const existingReplay = JSON.parse(await readFile(replayPath, 'utf8'));
    verifyAuthorityCertifiedReplay(existingReplay);
    replayValid = true;
  } catch (e) {
    // Replay is stale or missing — regenerate
  }

  // Step 2: If replay verifies, check if matchResultHash is still current
  if (replayValid) {
    const freshResult = runPolicyMatch({
      ordinal: summary.matchOrdinal,
      seed: summary.seed,
      profileId: summary.profileId,
      seatOrder: summary.seatOrder,
      policyIds: summary.policyIds,
      decisionLimit: 1800,
      includeReplay: false,
      decisionTracesEnabled: false,
      seatSwapped: summary.seatSwapped,
      pairedRunId: summary.pairedRunId
    });
    if (freshResult.summary.matchResultHash === summary.matchResultHash) {
      stillValid++;
      updatedRecords.push(record);
      console.log(`VALID: ${matchId}`);
      continue;
    }
    console.log(`STALE HASH: ${matchId} — regenerating`);
  }

  // Re-run the match with the current engine
  const result = runPolicyMatch({
    ordinal: summary.matchOrdinal,
    seed: summary.seed,
    profileId: summary.profileId,
    seatOrder: summary.seatOrder,
    policyIds: summary.policyIds,
    decisionLimit: 1800,
    includeReplay: true,
    decisionTracesEnabled: true,
    seatSwapped: summary.seatSwapped,
    pairedRunId: summary.pairedRunId
  });

  // Verify the new replay
  const newReplay = result.replay;
  verifyAuthorityCertifiedReplay(newReplay);

  // Save the new authorized replay
  await writeFile(replayPath, JSON.stringify(newReplay) + '\n');

  // Save the public replay view (correct naming convention)
  const publicView = publicAuthorityCertifiedReplayView(newReplay);
  await writeFile(publicPath, JSON.stringify(publicView) + '\n');

  // Save the decision traces
  const traces = result.decisionTraces ?? [];
  const traceArtifact = {
    schemaVersion: '2.0.0',
    matchId,
    matchOrdinal: summary.matchOrdinal,
    traceCount: traces.length,
    traces
  };
  await writeFile(tracePath, JSON.stringify(traceArtifact) + '\n');

  // Update the record with the new summary
  const newSummary = result.summary;
  updatedRecords.push({
    ...record,
    summary: {
      ...summary,
      matchResultHash: newSummary.matchResultHash,
      finalStateHash: newSummary.finalStateHash,
      replayHash: newReplay.contentHash,
      completedFullTurns: newSummary.completedFullTurns,
      winner: newSummary.winner,
      terminationReason: newSummary.terminationReason,
      outcome: newSummary.outcome
    }
  });
  console.log(`REGENERATED: ${matchId}`);
  regenerated++;
}

// Update retention-index with updated records
const retentionCore = {
  schemaVersion: retention.schemaVersion,
  experimentHash: retention.experimentHash,
  records: updatedRecords
};
const retentionIndex = { ...retentionCore, retentionHash: hashCanonical(retentionCore) };
await writeFile(path.join(base, 'retention-index.json'), JSON.stringify(retentionIndex, null, 2) + '\n');

// Clean up any orphaned .json files in public dir (not .public.replay.json)
const pubFiles = await readdir(pubDir);
const orphaned = pubFiles.filter(f => f.endsWith('.json') && !f.endsWith('.public.replay.json'));
for (const f of orphaned) {
  await unlink(path.join(pubDir, f));
  console.log(`CLEANUP: removed orphaned ${f}`);
}

console.log(`\nSUMMARY: ${stillValid} valid, ${regenerated} regenerated`);
