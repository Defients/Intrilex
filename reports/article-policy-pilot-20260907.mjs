// Isolated, nondestructive Intrilex article pilot. No builds, source edits, or canonical outputs.
// Run from repository root: node reports/article-policy-pilot-20260907.mjs
// Every artifact is created exclusively in a new timestamped directory; reruns never overwrite.
import { readFileSync, readdirSync, mkdirSync, writeFileSync, openSync, writeSync, closeSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
import { runPolicyMatch, isCanonicalTermination } from '@intrilex/simulation-runtime';
import { POLICY_BY_ID } from '@intrilex/simulation-runtime/policy-catalog';
import { SCORING_WEIGHTS, scoringWeightsHash } from '@intrilex/policies';
import { DEFAULT_CONFIG } from '../packages/game-ai/src/config.mjs';
import { createSimulationState, authorityHashCanonical, ENGINE_VERSION, RULES_VERSION } from '@intrilex/engine-adapter';

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), '..');
const started = new Date();
const tag = started.toISOString().replace(/[-:.]/g, '');
const out = path.join(root, 'reports', `article-policy-pilot-${tag}`);
mkdirSync(out); // Nonrecursive and exclusive: parent reports was verified before script creation.
const put = (name, value) => writeFileSync(path.join(out, name), typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const sha = value => createHash('sha256').update(value).digest('hex');
const jsonSha = value => sha(JSON.stringify(value));
const rel = file => path.relative(root, file).replaceAll('\\', '/');
const git = args => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trimEnd();
};
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]).sort();
const upstream = 'upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix';
const packageNames = ['engine-adapter', 'simulation-runtime', 'policies', 'policy-sdk', 'shared', 'telemetry', 'decision-intelligence', 'game-ai', 'statistics'];
const testFiles = ['packages/policies/test/smoke.test.mjs', 'packages/simulation-runtime/test/smoke.test.mjs', 'test/scoring-sensitivity.test.mjs', 'test/hybrix-evidence-envelope.test.mjs', 'test/autonomy.test.mjs'];
const trackedInputs = [...packageNames.flatMap(p => [...walk(path.join(root, 'packages', p, 'src')), path.join(root, 'packages', p, 'package.json')]), ...walk(path.join(root, 'runtime/autonomy-engine-dist/src')), ...walk(path.join(root, 'runtime/vendor-dist/src')), ...walk(path.join(root, upstream, 'src')), ...walk(path.join(root, upstream, 'dist/src')), ...['package.json', 'pnpm-lock.yaml', 'config/release-identity.json', 'config/engine-manifest.json', `${upstream}/tsconfig.json`, ...testFiles].map(p => path.join(root, p)), scriptPath].sort();
const inventory = () => Object.fromEntries(trackedInputs.map(file => [rel(file), sha(readFileSync(file))]));
const before = inventory();
const runtimePrefix = 'runtime/autonomy-engine-dist/src/';
const parity = Object.entries(before).filter(([p]) => p.startsWith(runtimePrefix)).map(([p, hash]) => {
  const corresponding = `${upstream}/dist/src/${p.slice(runtimePrefix.length)}`;
  return { runtimeFile: p, upstreamDistFile: corresponding, runtimeSha256: hash, upstreamSha256: before[corresponding] ?? null, equal: hash === before[corresponding] };
});
const A = 'core-advanced-authority', U = 'core-unrestricted-authority';
const baseline = ['score-rush', 'tempo', 'control', 'value'];
const hybrix = 'hybrix-rusher-hard';
const policies = [...baseline, hybrix];
const allPairs = policies.flatMap((a, i) => policies.slice(i + 1).map(b => [a, b]));
const baselinePairs = allPairs.filter(pair => pair.every(p => baseline.includes(p)));
// Seeds depend only on this fixed namespace and index, not observations, policies, or output time.
const seeds = Array.from({ length: 32 }, (_, i) => Number.parseInt(sha(`Intrilex article pilot v1 seed ${i}`).slice(0, 8), 16) >>> 0 || 1);
const preflightSeed = Number.parseInt(sha('Intrilex article pilot v1 preflight').slice(0, 8), 16) >>> 0 || 1;
const setup = (profileId, seed) => ({ profileId, seed, playerIds: ['P1', 'P2'], seatOrder: ['P1', 'P2'], enabledModules: [], eventApprovedModules: [] });
const initialHashes = Object.fromEntries([A, U].map(profile => [profile, seeds.map(seed => ({ seed, initialStateHash: authorityHashCanonical(createSimulationState(setup(profile, seed))) }))]));
const specs = [];
function addPairs(stage, profileId, pairs, from, to) {
  for (let i = from; i < to; i++) for (const pair of pairs) for (const orientation of ['AB', 'BA']) {
    specs.push({ stage, profileId, seedIndex: i, seed: seeds[i], pair, orientation, policyIds: orientation === 'AB' ? pair : [...pair].reverse(), initialStateHash: initialHashes[profileId][i].initialStateHash });
  }
}
addPairs('primary16', A, allPairs, 0, 16);
for (let i = 0; i < 16; i++) for (const policy of policies) specs.push({ stage: 'mirrors16', profileId: A, seedIndex: i, seed: seeds[i], pair: [policy, policy], orientation: 'MIRROR', policyIds: [policy, policy], initialStateHash: initialHashes[A][i].initialStateHash });
addPairs('baseline32extension', A, baselinePairs, 16, 32);
addPairs('unrestrictedSensitivity16', U, [['score-rush', 'value'], ['tempo', 'control'], ['score-rush', hybrix]], 0, 16);
const protocol = {
  title: 'Intrilex article current-runtime policy pilot', schemaVersion: 1,
  hypothesis: 'Exploratory comparison of four hand-weighted heuristics and one existing HYBRIX rusher-hard heuristic; no population or human-meta inference.',
  primaryProfile: A, sensitivityProfile: U, profilesNeverPooled: true, policyIds: policies,
  decisionLimit: 1800, telemetryEnabled: false, decisionTracesEnabled: false, includeReplay: false,
  seats: ['P1', 'P2'], pairing: 'Same seed and identical initial state per AB/BA pair; fixed player labels, policyIds reversed. Games within a seed cluster are not independent.',
  seedScheme: 'first 8 SHA256 hex digits of Intrilex article pilot v1 seed {index}, uint32, zero replaced by 1', seeds,
  mirrorDesign: '16 single mirror games per policy, not duplicate AB/BA games. Mirrors are diagnostics, excluded from cross-policy win proportions.',
  variant: { policyId: hybrix, archetype: 'rusher', difficulty: 'hard', weightsUnmodified: true, description: 'Existing board-aware, rank-aware, personality and bounded-memory-nudge rusher. Not an ablation of adaptation or a new tuned policy.' },
  adaptiveCaveat: 'Policy adapter calls choose only, not notifyOutcome/recordEnemyAction; memory records own selected actions with pending outcome, so this is not validated opponent-learning.',
  preflight: 'Replay-verifying mirror games and repeated isolated runs for all five policies, followed by a same-runInstanceId HYBRIX mirror cache probe. A failed cache probe is reported but cannot contaminate study games, which use unique runInstanceIds.',
  gate: 'Stop study immediately after any noncanonical termination, runtime error, rejected action, or compliance failure. Run extension/sensitivity only when preceding stages complete and elapsed study time < 360 s with mean < 1.5 s per game. A 480 s total study budget is checked between AB/BA blocks; incomplete blocks excluded from paired estimates. Gates never depend on winner.',
  statistics: 'Marginal wins/completed games with descriptive Wilson95 (draws count as nonwins); paired seed-cluster percentile bootstrap95 of mean win-credit (draw=.5), 10000 resamples; exact two-sided sign test on positive vs negative seed AB/BA win-credit contrasts, zero-contrast seeds omitted. No independence assumption between AB and BA. No multiplicity correction; exploratory intervals only.',
  preregisteredSensitivityPairs: [['score-rush', 'value'], ['tempo', 'control'], ['score-rush', hybrix]],
  plannedStudyGames: specs.length, specs
};
put('protocol-and-seeds.json', protocol);
put('input-hashes-before.json', { treeSha256: jsonSha(before), files: before });
put('runtime-upstream-dist-parity.json', { comparedFiles: parity.length, equalFiles: parity.filter(x => x.equal).length, mismatches: parity.filter(x => !x.equal), files: parity, sourceParity: 'No build/transpile performed. Exact runtime-vs-upstream-dist byte comparison only; TypeScript source separately hashed, dirty source patches separately recorded.' });
put('git-status-before.txt', git(['status', '--porcelain=v1', '--untracked-files=normal']) + '\n');
put('local-input-diff.patch', git(['diff', 'HEAD', '--', 'packages/engine-adapter', 'packages/simulation-runtime', 'packages/policies', 'packages/game-ai', `${upstream}/src`]) + '\n');
put('metadata.json', {
  createdAt: started.toISOString(), gitHead: git(['rev-parse', 'HEAD']), node: process.version, nodeVersions: process.versions, platform: process.platform, arch: process.arch, locale: Intl.DateTimeFormat().resolvedOptions(),
  command: `node ${rel(scriptPath)}`, scriptSha256: before[rel(scriptPath)], engineVersion: ENGINE_VERSION, rulesVersion: RULES_VERSION,
  rootPackage: JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version,
  releaseIdentity: JSON.parse(readFileSync(path.join(root, 'config/release-identity.json'), 'utf8')),
  engineManifest: JSON.parse(readFileSync(path.join(root, 'config/engine-manifest.json'), 'utf8')),
  policyDefinitions: policies.map(id => { const { choose, ...rest } = POLICY_BY_ID[id]; return rest; }),
  scoringWeightsSha256: scoringWeightsHash(), scoringWeights: SCORING_WEIGHTS, hybrixConfiguration: DEFAULT_CONFIG,
  caveats: ['Labels do not certify local engine bits; input hashes identify a dirty runtime snapshot.', 'Policy definition hashes omit imported scoring/helper implementations; source file hashes are therefore also retained.', 'Native runCampaign does not implement same-seed AB/BA and is not used.']
});
console.log(`OUTPUT ${out}`);
const tests = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...testFiles], { cwd: root, encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
put('focused-tests.tap', tests.stdout + tests.stderr);
put('focused-tests-status.json', { command: `node --test --test-reporter=tap ${testFiles.join(' ')}`, status: tests.status, signal: tests.signal, error: tests.error?.message ?? null });
console.log(`FOCUSED_TEST_STATUS ${tests.status}`);
const rawFd = openSync(path.join(out, 'raw-matches.jsonl'), 'wx');
const rows = [], preflight = [], stageLog = [];
let serial = 0, stopReason = tests.status === 0 ? null : 'FOCUSED_TEST_FAILURE';
const inc = (m, k, n = 1) => { m[k] = (m[k] ?? 0) + n; };
function runOne(spec, override = {}) {
  const index = serial++;
  const config = {
    profileId: spec.profileId, seed: spec.seed, seatOrder: ['P1', 'P2'], policyIds: spec.policyIds,
    ordinal: spec.seedIndex ?? 0, decisionLimit: 1800, telemetryEnabled: false, decisionTracesEnabled: false, includeReplay: false,
    runInstanceId: `ArticlePilot-${tag}-${index}`, pairedRunId: `${spec.profileId}-${spec.pair.join('_')}-${spec.seed}`, seatSwapped: spec.orientation === 'BA',
    evidenceEpoch: 'article-current-dirty-runtime-pilot', postRulesParityRepair: false, ...override
  };
  const start = performance.now();
  let result;
  try { result = runPolicyMatch(config); }
  catch (e) {
    const row = { index, ...spec, config, error: { code: e.code ?? null, message: e.message, stack: e.stack }, elapsedMs: performance.now() - start, canonical: false, capHit: false, invalid: true };
    writeSync(rawFd, JSON.stringify(row) + '\n'); return row;
  }
  const { rankDecisions, ...summary } = result.summary;
  const byPolicy = {};
  for (const decision of result.decisions) {
    const d = byPolicy[decision.policyId] ??= { decisions: 0, familyCounts: {}, modeCounts: {}, reasonCounts: {}, forcedDecisions: 0, multiOptionDecisions: 0, tiesAtTop: 0, nonTopSelections: 0, selectedNotInTop8: 0, nonfiniteCandidateScores: 0, hybrixTraces: 0, nonzeroNudgeDecisions: 0, difficultyErrorDecisions: 0, failsafeDecisions: 0, nudgeValues: {}, memoryPatternTypes: {} };
    d.decisions++;
    inc(d.familyCounts, decision.family); inc(d.modeCounts, `${decision.family}:${decision.mode}`); inc(d.reasonCounts, decision.reasonCode);
    if (decision.legalActionCount === 1) d.forcedDecisions++; else d.multiOptionDecisions++;
    const c = decision.candidateScores;
    if (c.length > 1 && c[0].score === c[1].score) d.tiesAtTop++;
    if (c.length && c[0].actionId !== decision.actionId) d.nonTopSelections++;
    if (c.length && !c.some(x => x.actionId === decision.actionId)) d.selectedNotInTop8++;
    d.nonfiniteCandidateScores += c.filter(x => !Number.isFinite(x.score)).length;
    const t = decision.hybrixTrace;
    if (t) {
      d.hybrixTraces++;
      if (Object.values(t.adaptiveNudges ?? {}).some(v => Math.abs(v) > 0)) d.nonzeroNudgeDecisions++;
      if (t.difficultyError) d.difficultyErrorDecisions++;
      if (t.failsafeTriggered) d.failsafeDecisions++;
      inc(d.nudgeValues, JSON.stringify(t.adaptiveNudges));
      for (const p of t.memoryPatterns ?? []) inc(d.memoryPatternTypes, p.type);
    }
  }
  const decisionsFile = `decisions-${String(index).padStart(4, '0')}.json.gz`;
  put(decisionsFile, gzipSync(JSON.stringify(result.decisions)));
  const row = { index, ...spec, config, elapsedMs: performance.now() - start, canonical: isCanonicalTermination(summary.terminationReason), capHit: summary.terminationReason === 'DECISION_LIMIT', invalid: summary.errorCode !== null || summary.ruleCompliance.status !== 'PASS', reachedDecisionLimit: result.decisions.length >= config.decisionLimit, summary, diagnostics: byPolicy, decisionsFile, decisionsSha256: jsonSha(result.decisions), trajectorySha256: jsonSha(result.decisions.map(d => [d.actorId, d.actionId, d.beforeStateHash, d.afterStateHash])), replayVerified: Boolean(result.replay) };
  if (result.replay) {
    row.replayFile = `replay-${String(index).padStart(4, '0')}.json.gz`;
    put(row.replayFile, gzipSync(JSON.stringify(result.replay)));
  }
  writeSync(rawFd, JSON.stringify(row) + '\n');
  return row;
}
const good = row => row.canonical && !row.invalid && !row.capHit;
if (!stopReason) {
  for (const policy of policies) {
    const spec = { stage: 'preflight-isolated-mirror', profileId: A, seed: preflightSeed, seedIndex: -1, pair: [policy, policy], policyIds: [policy, policy], orientation: 'MIRROR' };
    const a = runOne(spec, { includeReplay: true }), b = runOne(spec, { includeReplay: true });
    preflight.push({ policy, kind: 'isolated-mirror-repeat-and-replay', indices: [a.index, b.index], pass: good(a) && good(b) && a.summary.matchResultHash === b.summary.matchResultHash && a.trajectorySha256 === b.trajectorySha256, resultHashes: [a.summary?.matchResultHash, b.summary?.matchResultHash] });
  }
  const probeSpec = { stage: 'preflight-native-cache-probe', profileId: A, seed: preflightSeed, seedIndex: -1, pair: [hybrix, hybrix], policyIds: [hybrix, hybrix], orientation: 'MIRROR' };
  const a = runOne(probeSpec, { runInstanceId: 'ArticlePilot-NativeCacheProbe' }), b = runOne(probeSpec, { runInstanceId: 'ArticlePilot-NativeCacheProbe' });
  preflight.push({ kind: 'native-same-run-instance-mirror-repeat', indices: [a.index, b.index], pass: good(a) && good(b) && a.summary.matchResultHash === b.summary.matchResultHash && a.trajectorySha256 === b.trajectorySha256, resultHashes: [a.summary?.matchResultHash, b.summary?.matchResultHash], requiredForStudy: false, mitigation: 'Each study execution has a unique runInstanceId, and isolated repetition is gated above.' });
  if (preflight.some(p => p.requiredForStudy !== false && !p.pass)) stopReason = 'ISOLATED_PREFLIGHT_FAILURE';
}
put('preflight.json', preflight);
console.log('PREFLIGHT', JSON.stringify(preflight));
const studyStart = performance.now();
for (const stage of ['primary16', 'mirrors16', 'baseline32extension', 'unrestrictedSensitivity16']) {
  const planned = specs.filter(s => s.stage === stage);
  const elapsed = performance.now() - studyStart;
  if (!stopReason && (stage === 'baseline32extension' || stage === 'unrestrictedSensitivity16') && (elapsed > 360000 || elapsed / Math.max(1, rows.length) > 1500)) {
    stageLog.push({ stage, planned: planned.length, executed: 0, status: 'SKIPPED_COST_GATE', elapsedMs: elapsed }); continue;
  }
  if (stopReason) { stageLog.push({ stage, planned: planned.length, executed: 0, status: 'SKIPPED', reason: stopReason }); continue; }
  let count = 0;
  for (const spec of planned) {
    if (spec.orientation !== 'BA' && performance.now() - studyStart > 480000) { stopReason = 'STUDY_TIME_BUDGET'; break; }
    const row = runOne(spec); rows.push(row); count++;
    if (!good(row)) { stopReason = `GROSS_DIAGNOSTIC_FAILURE:index=${row.index}:${row.summary?.terminationReason ?? row.error?.message}`; break; }
    if (count % 16 === 0) console.log(`PROGRESS ${stage} ${count}/${planned.length} studyGames=${rows.length} elapsed=${((performance.now() - studyStart) / 1000).toFixed(1)}s`);
  }
  stageLog.push({ stage, planned: planned.length, executed: count, status: count === planned.length ? 'COMPLETE' : 'STOPPED', reason: stopReason });
}
closeSync(rawFd);
put('stage-log.json', stageLog);
// Statistical summaries do not silently discard invalid games: all statuses and denominators retained.
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
function wilson(w, n) {
  if (!n) return null;
  const z = 1.959963984540054, p = w / n, den = 1 + z * z / n;
  const mid = (p + z * z / (2 * n)) / den, radius = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den;
  return [Math.max(0, mid - radius), Math.min(1, mid + radius)];
}
function seededRng(text) {
  let s = Number.parseInt(sha(text).slice(0, 8), 16) >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function clusterCI(values, key) {
  if (!values.length) return null;
  const rng = seededRng(`Intrilex article bootstrap v1 ${key}`), samples = [];
  for (let b = 0; b < 10000; b++) { let total = 0; for (let j = 0; j < values.length; j++) total += values[Math.floor(rng() * values.length)]; samples.push(total / values.length); }
  samples.sort((a, b) => a - b);
  return [samples[249], samples[9749]];
}
function signTest(positive, negative) {
  const n = positive + negative, k = Math.min(positive, negative);
  if (!n) return 1;
  let term = 2 ** -n, sum = term;
  for (let i = 1; i <= k; i++) { term *= (n - i + 1) / i; sum += term; }
  return Math.min(1, 2 * sum);
}
function summarizePair(group) {
  const first = group[0], policyA = first.pair[0], policyB = first.pair[1];
  const valid = group.filter(good), clusters = new Map();
  let winsA = 0, winsB = 0, draws = 0, p1Wins = 0, p2Wins = 0, asP1Wins = 0, asP2Wins = 0;
  const margins = [], turns = [], decisions = [];
  for (const row of valid) {
    const s = row.summary, playerA = row.policyIds.indexOf(policyA) === 0 ? 'P1' : 'P2';
    const draw = s.terminationReason === 'CANONICAL_DRAW', winA = s.winner === playerA;
    if (draw) draws++; else if (winA) { winsA++; if (playerA === 'P1') asP1Wins++; else asP2Wins++; } else winsB++;
    if (s.winner === 'P1') p1Wins++; if (s.winner === 'P2') p2Wins++;
    margins.push(s.finalScores[playerA] - s.finalScores[playerA === 'P1' ? 'P2' : 'P1']);
    turns.push(s.completedFullTurns); decisions.push(s.policyDecisionCount);
    const cluster = clusters.get(row.seed) ?? [];
    cluster.push({ orientation: row.orientation, credit: draw ? 0.5 : winA ? 1 : 0 }); clusters.set(row.seed, cluster);
  }
  const completeClusters = [...clusters.values()].filter(c => c.length === 2 && c.some(x => x.orientation === 'AB') && c.some(x => x.orientation === 'BA'));
  const credits = completeClusters.map(c => mean(c.map(x => x.credit)));
  const positive = credits.filter(v => v > 0.5).length, negative = credits.filter(v => v < 0.5).length, zero = credits.filter(v => v === 0.5).length;
  return { profileId: first.profileId, policyA, policyB, games: group.length, validGames: valid.length, invalidGames: group.filter(x => x.invalid).length, cappedGames: group.filter(x => x.capHit).length, errors: group.filter(x => x.error).length, winsA, winsB, draws, aWinsAsP1: asP1Wins, aWinsAsP2: asP2Wins, p1Wins, p2Wins, marginalAWinRate: valid.length ? winsA / valid.length : null, descriptiveWilson95: wilson(winsA, valid.length), completePairedSeeds: credits.length, pairedWinCredit: mean(credits), pairedSeedBootstrap95: clusterCI(credits, `${first.profileId}:${policyA}:${policyB}`), positiveSeedContrasts: positive, negativeSeedContrasts: negative, zeroSeedContrasts: zero, pairedSignTwoSidedP: signTest(positive, negative), meanSignedScoreMarginA: mean(margins), meanFullTurns: mean(turns), meanPolicyDecisions: mean(decisions), maxPolicyDecisions: decisions.length ? Math.max(...decisions) : null };
}
const pairGroups = new Map();
for (const row of rows.filter(r => r.orientation !== 'MIRROR')) { const key = `${row.profileId}:${row.pair.join(':')}`; const group = pairGroups.get(key) ?? []; group.push(row); pairGroups.set(key, group); }
const pairTable = [...pairGroups.values()].map(summarizePair);
const mirrorTable = policies.map(policy => {
  const group = rows.filter(r => r.orientation === 'MIRROR' && r.policyIds[0] === policy), valid = group.filter(good);
  const p1Wins = valid.filter(r => r.summary.winner === 'P1').length, p2Wins = valid.filter(r => r.summary.winner === 'P2').length;
  return { policy, games: group.length, p1Wins, p2Wins, draws: valid.length - p1Wins - p2Wins, invalid: group.filter(r => !good(r)).length, p1Wilson95: wilson(p1Wins, valid.length) };
});
const diagnostics = {};
for (const row of rows) {
  const key = row.profileId, d = diagnostics[key] ??= { games: 0, canonicalGames: 0, cappedGames: 0, invalidGames: 0, errors: 0, terminationCounts: {}, policies: {}, totalPolicyDecisions: 0, totalCommands: 0, totalCompletedFullTurns: 0, maxPolicyDecisions: 0 };
  d.games++; if (row.canonical) d.canonicalGames++; if (row.capHit) d.cappedGames++; if (row.invalid) d.invalidGames++; if (row.error) d.errors++;
  inc(d.terminationCounts, row.summary?.terminationReason ?? 'THROWN_ERROR');
  if (!row.summary) continue;
  d.totalPolicyDecisions += row.summary.policyDecisionCount; d.totalCommands += row.summary.commandCount; d.totalCompletedFullTurns += row.summary.completedFullTurns; d.maxPolicyDecisions = Math.max(d.maxPolicyDecisions, row.summary.policyDecisionCount);
  for (const [policy, values] of Object.entries(row.diagnostics)) {
    const p = d.policies[policy] ??= {};
    for (const [k, v] of Object.entries(values)) {
      if (typeof v === 'number') inc(p, k, v);
      else { p[k] ??= {}; for (const [name, count] of Object.entries(v)) inc(p[k], name, count); }
    }
  }
}
const after = inventory(), changedInputs = Object.keys(before).filter(p => before[p] !== after[p]);
put('input-hashes-after.json', { treeSha256: jsonSha(after), changedInputs, files: after });
put('git-status-after.txt', git(['status', '--porcelain=v1', '--untracked-files=normal']) + '\n');
const summary = { createdAt: started.toISOString(), finishedAt: new Date().toISOString(), outputDirectory: rel(out), gitHead: git(['rev-parse', 'HEAD']), studiedGames: rows.length, preflightGames: serial - rows.length, stopReason, stageLog, changedInputs, snapshotStable: changedInputs.length === 0, runtimeUpstreamDistMismatches: parity.filter(p => !p.equal).map(p => p.runtimeFile), testsPassed: tests.status === 0, preflight, pairTable, mirrorTable, diagnostics, interpretationBoundary: 'Exploratory fixed-runtime heuristic pilot. Wilson intervals are descriptive marginal summaries; paired-seed estimates and sign tests honor AB/BA clustering. Different pairings reuse seeds, so do not pool games as independent. Unequal policy sample sizes and selected sensitivity pairs do not establish a global ranking. No adaptation ablation, human comparison, or clean-release source certification.' };
put('summary.json', summary);
const pct = x => x === null ? '-' : `${(100 * x).toFixed(1)}%`;
const ci = xs => xs ? `${pct(xs[0])} to ${pct(xs[1])}` : '-';
let report = `# Intrilex current-runtime policy pilot\n\nOutput: ${rel(out)}\n\nGit HEAD: ${summary.gitHead}\n\nStudy games: ${rows.length}; preflight executions: ${serial - rows.length}. Stop: ${stopReason ?? 'none'}. Stable input hashes: ${summary.snapshotStable}.\n\n`;
report += '| Profile | A | B | Seeds | A-B-draw | A win % | Wilson95 (descriptive) | Paired bootstrap95 | Seed + / - / 0 | Sign p | Mean turns |\n|---|---|---|---:|---|---|---|---|---|---:|---:|\n';
for (const p of pairTable) report += `| ${p.profileId} | ${p.policyA} | ${p.policyB} | ${p.completePairedSeeds} | ${p.winsA}-${p.winsB}-${p.draws} | ${pct(p.marginalAWinRate)} | ${ci(p.descriptiveWilson95)} | ${ci(p.pairedSeedBootstrap95)} | ${p.positiveSeedContrasts}/${p.negativeSeedContrasts}/${p.zeroSeedContrasts} | ${p.pairedSignTwoSidedP.toPrecision(3)} | ${p.meanFullTurns?.toFixed(2)} |\n`;
report += '\n## Mirrors (not superiority evidence)\n\n| Policy | Games | P1 wins | P2 wins | Draws | P1 Wilson95 |\n|---|---:|---:|---:|---:|---|\n';
for (const p of mirrorTable) report += `| ${p.policy} | ${p.games} | ${p.p1Wins} | ${p.p2Wins} | ${p.draws} | ${ci(p.p1Wilson95)} |\n`;
report += `\n## Boundaries\n\n${summary.interpretationBoundary}\n\nAll raw per-game summaries, configuration, cap/invalid status, action diagnostics, and trajectory hashes are in raw-matches.jsonl. Full selected-decision records are in decisions-*.json.gz. Replay-certified preflight cases are in replay-*.json.gz. Seeds and conditional cost gates were written before study games. Input source and runtime hashes are preserved before and after. No gameplay changes or builds were made.\n`;
put('RESULTS.md', report);
put('artifact-hashes.json', Object.fromEntries(walk(out).map(file => [path.basename(file), sha(readFileSync(file))])));
console.log(report);
console.log('DIAGNOSTICS', JSON.stringify(Object.fromEntries(Object.entries(diagnostics).map(([p, d]) => [p, { ...d, policies: Object.fromEntries(Object.entries(d.policies).map(([id, v]) => [id, { decisions: v.decisions, nonzeroNudgeDecisions: v.nonzeroNudgeDecisions, difficultyErrorDecisions: v.difficultyErrorDecisions, nonfiniteCandidateScores: v.nonfiniteCandidateScores }])) }]))));
if (stopReason || changedInputs.length) process.exitCode = 2;
