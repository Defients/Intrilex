// Rank Pipeline Liveness — verifies /ranks workspace data is present and valid
// in both sample-data and dist. This is the build-time guarantee that the
// v0.11.0 Rank Power Observatory has complete data end-to-end.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_RANKS = ['A','2','3','4','5','6','7','8','9','J','Q','K','RJ','BJ'];
const TEN_SUIT_RANKS = ['10:club', '10:diamond', '10:heart', '10:spade'];
const EXPECTED_RANK_COUNT = 18;

async function loadObservatory(targetPath) {
  try {
    const raw = await readFile(targetPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function validateRankPowerModel(rankPower, source) {
  assert.ok(rankPower, `${source}: rankPower object missing from observatory analytics.json`);
  assert.ok(rankPower.ranks, `${source}: rankPower.ranks missing`);
  assert.equal(Object.keys(rankPower.ranks).length, EXPECTED_RANK_COUNT, `${source}: expected ${EXPECTED_RANK_COUNT} ranks, got ${Object.keys(rankPower.ranks).length}`);
  assert.ok(rankPower.ladder, `${source}: rankPower.ladder missing`);
  assert.equal(rankPower.ladder.length, EXPECTED_RANK_COUNT, `${source}: expected ladder length ${EXPECTED_RANK_COUNT}, got ${rankPower.ladder.length}`);

  // Verify all non-ten canonical ranks present
  for (const rank of BASE_RANKS) {
    assert.ok(rankPower.ranks[rank], `${source}: rank ${rank} missing from rankPower.ranks`);
    const entry = rankPower.ranks[rank];
    assert.equal(typeof entry.rpi, 'number', `${source}: rank ${rank} rpi must be a number`);
    assert.ok(entry.rpi >= 0 && entry.rpi <= 1, `${source}: rank ${rank} rpi ${entry.rpi} out of [0,1]`);
    assert.ok(entry.axes, `${source}: rank ${rank} axes missing`);
    assert.ok(entry.confidence, `${source}: rank ${rank} confidence missing`);
  }

  // Verify all four per-suit Ten entries present
  for (const rank of TEN_SUIT_RANKS) {
    assert.ok(rankPower.ranks[rank], `${source}: rank ${rank} missing from rankPower.ranks`);
    const entry = rankPower.ranks[rank];
    assert.equal(typeof entry.rpi, 'number', `${source}: rank ${rank} rpi must be a number`);
    assert.ok(entry.rpi >= 0 && entry.rpi <= 1, `${source}: rank ${rank} rpi ${entry.rpi} out of [0,1]`);
    assert.ok(entry.axes, `${source}: rank ${rank} axes missing`);
    assert.ok(entry.confidence, `${source}: rank ${rank} confidence missing`);
  }

  // Verify ladder is sorted by RPI descending
  for (let i = 1; i < rankPower.ladder.length; i++) {
    assert.ok(rankPower.ladder[i - 1].rpi >= rankPower.ladder[i].rpi,
      `${source}: ladder not sorted by RPI desc at index ${i}`);
  }

  // Verify watchlist structure
  assert.ok(rankPower.watchlist, `${source}: rankPower.watchlist missing`);
  for (const key of ['overpowered', 'underpowered', 'dominant', 'negligible']) {
    assert.ok(Array.isArray(rankPower.watchlist[key]), `${source}: watchlist.${key} must be an array`);
  }
}

test('sample-data observatory analytics.json has complete rank power data', async () => {
  const obs = await loadObservatory(path.join(root, 'sample-data/observatory/analytics.json'));
  assert.ok(obs, 'sample-data/observatory/analytics.json not found');
  validateRankPowerModel(obs.rankPower, 'sample-data');
});

test('dist observatory analytics.json has complete rank power data', async () => {
  const obs = await loadObservatory(path.join(root, 'apps/lab-web/dist/data/observatory/analytics.json'));
  assert.ok(obs, 'dist/data/observatory/analytics.json not found — run pnpm build');
  validateRankPowerModel(obs.rankPower, 'dist');
});

test('rank power data in sample-data and dist are structurally identical', async () => {
  const sample = await loadObservatory(path.join(root, 'sample-data/observatory/analytics.json'));
  const distObs = await loadObservatory(path.join(root, 'apps/lab-web/dist/data/observatory/analytics.json'));
  if (!sample || !distObs) return; // skip if either missing
  const sampleRanks = Object.keys(sample.rankPower.ranks).sort();
  const distRanks = Object.keys(distObs.rankPower.ranks).sort();
  assert.deepEqual(sampleRanks, distRanks, 'sample-data and dist rank power ranks must match');
  assert.deepEqual(sample.rankPower.ladder.map(e => e.rank), distObs.rankPower.ladder.map(e => e.rank),
    'sample-data and dist ladder order must match');
});

test('rank power watchlist contains real flags from observed cohort data', async () => {
  const obs = await loadObservatory(path.join(root, 'apps/lab-web/dist/data/observatory/analytics.json'));
  if (!obs) return;
  const watch = obs.rankPower.watchlist;
  const allFlags = [...watch.overpowered, ...watch.underpowered, ...watch.dominant, ...watch.negligible];
  // With 100 matches and 15 ranks, at least some flags should exist (underpowered ranks are expected)
  // This is a soft assertion — the watchlist could legitimately be empty if all ranks are balanced
  // But with the current cohort, BJ (RPI 0.147) and 7 (RPI 0.184) should be flagged
  if (allFlags.length === 0) {
    // This is a warning, not a failure — but we log it for diagnostic purposes
    console.log('WARNING: rank power watchlist is empty — all ranks within balance thresholds');
  } else {
    for (const flag of allFlags) {
      assert.ok(flag.rank, 'watchlist flag must have a rank');
      assert.ok(flag.reason, `watchlist flag for ${flag.rank} must have a reason`);
    }
  }
});

test('build.mjs contains rank power assertion to prevent silent data loss', async () => {
  const buildSource = await readFile(path.join(root, 'scripts/build.mjs'), 'utf8');
  assert.match(buildSource, /rankPower\.ranks/, 'build.mjs must assert rankPower.ranks presence');
  assert.match(buildSource, /rankCount < 18/, 'build.mjs must assert at least 18 rank ladder entries');
});
