// Read-only verification of preserved pilot artifacts; creates only one new exclusive report.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
const script = fileURLToPath(import.meta.url), root = path.resolve(path.dirname(script), '..');
const original = 'reports/article-policy-pilot-20260907T203340644Z';
const completion = 'reports/article-policy-pilot-completion-20260907T204650571Z';
const read = file => readFileSync(path.join(root, file));
const load = file => JSON.parse(read(file));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const summary = load(`${completion}/summary.json`), protocol = load(`${original}/protocol-and-seeds.json`);
const rows = read(`${completion}/combined-study-raw-matches.jsonl`).toString('utf8').trim().split('\n').map(JSON.parse);
const primary = rows.filter(r => r.stage === 'primary16'), mirrors = rows.filter(r => r.stage === 'mirrors16');
assert.equal(rows.length, 348); assert.equal(primary.length, 320); assert.equal(mirrors.length, 28);
const keys = rows.map(r => JSON.stringify([r.profileId, r.stage, r.seed, r.policyIds, r.orientation]));
assert.equal(new Set(keys).size, rows.length);
const groups = new Map();
for (const row of primary) { const key = JSON.stringify([row.pair, row.seed]); const g = groups.get(key) ?? []; g.push(row); groups.set(key, g); }
assert.equal(groups.size, 160);
for (const group of groups.values()) {
  assert.equal(group.length, 2);
  const ab = group.find(r => r.orientation === 'AB'), ba = group.find(r => r.orientation === 'BA');
  assert.ok(ab && ba); assert.equal(ab.seed, ba.seed); assert.equal(ab.initialStateHash, ba.initialStateHash);
  assert.deepEqual(ab.config.seatOrder, ['P1', 'P2']); assert.deepEqual(ba.config.seatOrder, ['P1', 'P2']);
  assert.deepEqual(ab.policyIds, [...ba.policyIds].reverse());
  assert.equal(ab.seed, protocol.seeds[ab.seedIndex]);
}
let decodedDecisions = 0, totalCommands = 0, totalTurns = 0;
for (const row of rows) {
  assert.equal(row.canonical, true); assert.equal(row.capHit, false); assert.equal(row.invalid, false);
  assert.equal(row.summary.ruleCompliance.status, 'PASS'); assert.equal(row.summary.errorCode, null);
  assert.equal(row.summary.acceptedCommandCount, row.summary.commandCount);
  const decisions = JSON.parse(gunzipSync(read(`${row.sourceDirectory}/${row.decisionsFile}`)));
  assert.equal(sha(JSON.stringify(decisions)), row.decisionsSha256);
  assert.equal(decisions.length, row.summary.policyDecisionCount);
  assert.equal(decisions.length, Object.values(row.diagnostics).reduce((n, d) => n + d.decisions, 0));
  decodedDecisions += decisions.length; totalCommands += row.summary.commandCount; totalTurns += row.summary.completedFullTurns;
}
assert.equal(decodedDecisions, summary.diagnostics.totalPolicyDecisions);
assert.equal(totalCommands, summary.diagnostics.totalCommands);
assert.equal(totalTurns, summary.diagnostics.totalCompletedFullTurns);
for (const pair of summary.pairTable) { assert.equal(pair.games, 32); assert.equal(pair.completePairedSeeds, 16); assert.equal(pair.winsA + pair.winsB + pair.draws, 32); }
let artifactHashesVerified = 0;
for (const dir of [original, completion]) for (const [name, expected] of Object.entries(load(`${dir}/artifact-hashes.json`))) { assert.equal(sha(read(`${dir}/${name}`)), expected, `${dir}/${name}`); artifactHashesVerified++; }
const before = load(`${original}/input-hashes-before.json`), after = load(`${completion}/input-hashes-after.json`);
assert.deepEqual(before.files, after.files);
for (const [file, expected] of Object.entries(before.files)) assert.equal(sha(read(file)), expected, `Current input drift: ${file}`);
const result = { status: 'PASS', createdAt: new Date().toISOString(), command: 'node reports/article-policy-pilot-verify-20260907.mjs', verifierScriptSha256: sha(readFileSync(script)), primaryMatches: primary.length, mirrorMatches: mirrors.length, completeSameSeedABBAClusters: groups.size, primarySeedsPerPair: 16, distinctPrimarySeeds: new Set(primary.map(r => r.seed)).size, decodedDecisions, totalCommands, totalTurns, artifactHashesVerified, inputFilesVerified: Object.keys(before.files).length, originalAndFinalInputTreeSha256: before.treeSha256, notes: ['No extra games run.', 'Verification checks recorded pairing/configuration, every retained study decision log hash/count, all artifact hashes, and unchanged local input files.', 'Does not certify every game by replay or compare TypeScript emission.'] };
const filename = `reports/article-policy-pilot-verification-${new Date().toISOString().replace(/[-:.]/g, '')}.json`;
writeFileSync(path.join(root, filename), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(filename); console.log(JSON.stringify(result, null, 2));
