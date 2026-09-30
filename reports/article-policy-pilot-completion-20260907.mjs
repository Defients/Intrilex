// Nondestructive completion of the originally planned 16-seed pilot and mirrors.
// Scope amendment announced before inspecting study outcomes: finish primary16 + mirrors16 only.
// No optional 32-seed extension or unrestricted sensitivity, because measured runtime cost was high.
// Run: node reports/article-policy-pilot-completion-20260907.mjs
import { readFileSync, writeFileSync, openSync, writeSync, closeSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { runPolicyMatch, isCanonicalTermination } from '@intrilex/simulation-runtime';
const script = fileURLToPath(import.meta.url), root = path.resolve(path.dirname(script), '..');
const prior = path.join(root, 'reports/article-policy-pilot-20260907T203340644Z');
const load = name => JSON.parse(readFileSync(path.join(prior, name), 'utf8'));
const sha = data => createHash('sha256').update(data).digest('hex');
const jsonSha = data => sha(JSON.stringify(data));
const rel = file => path.relative(root, file).replaceAll('\\', '/');
const priorSummary = load('summary.json'), protocol = load('protocol-and-seeds.json'), metadata = load('metadata.json');
if (priorSummary.stopReason !== 'STUDY_TIME_BUDGET' || !priorSummary.snapshotStable || !priorSummary.testsPassed) throw new Error('Prior run not eligible for cost-only continuation');
const expected = load('input-hashes-before.json').files;
const inventory = () => Object.fromEntries(Object.keys(expected).map(file => [file, sha(readFileSync(path.join(root, file)))]));
const before = inventory(), initialDrift = Object.keys(expected).filter(file => before[file] !== expected[file]);
if (initialDrift.length) throw new Error(`Input drift: ${initialDrift.join(', ')}`);
const git = args => { const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }); if (r.status !== 0) throw new Error(r.stderr); return r.stdout.trimEnd(); };
if (git(['rev-parse', 'HEAD']) !== metadata.gitHead) throw new Error('Git HEAD drift');
const priorRows = readFileSync(path.join(prior, 'raw-matches.jsonl'), 'utf8').trim().split('\n').map(line => ({ ...JSON.parse(line), sourceDirectory: rel(prior) }));
const existing = priorRows.filter(r => ['primary16', 'mirrors16'].includes(r.stage));
const good = row => row.canonical && !row.invalid && !row.capHit;
if (existing.some(r => !good(r))) throw new Error('Prior study diagnostic failure');
const key = spec => JSON.stringify([spec.stage, spec.profileId, spec.seed, spec.pair, spec.orientation]);
const done = new Set(existing.map(key));
if (done.size !== existing.length) throw new Error('Duplicate prior study match');
const intended = protocol.specs.filter(s => ['primary16', 'mirrors16'].includes(s.stage));
const remaining = intended.filter(s => !done.has(key(s)));
const started = new Date(), tag = started.toISOString().replace(/[-:.]/g, '');
const out = path.join(root, 'reports', `article-policy-pilot-completion-${tag}`);
mkdirSync(out);
const put = (name, data) => writeFileSync(path.join(out, name), typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
put('completion-protocol.json', { createdAt: started.toISOString(), priorDirectory: rel(prior), amendment: 'Finish only primary16 and mirrors16. Dropping optional expansion/sensitivity decided from observed cost before examining study results. No seed/policy/outcome-based selection.', priorStudyGames: existing.length, intendedTotalStudyGames: intended.length, remainingGames: remaining.length, maxAdditionalWallTimeMs: 720000, stopOnAnyDiagnosticFailure: true, sameInputHashesAsPrior: true, seedManifestSha256: sha(readFileSync(path.join(prior, 'protocol-and-seeds.json'))), remaining });
put('metadata.json', { ...metadata, completionStartedAt: started.toISOString(), completionCommand: `node ${rel(script)}`, completionScriptSha256: sha(readFileSync(script)), originalScriptSha256: metadata.scriptSha256 });
put('input-hashes-before.json', { treeSha256: jsonSha(before), files: before });
put('git-status-before.txt', git(['status', '--porcelain=v1', '--untracked-files=normal']) + '\n');
console.log(`OUTPUT ${out}; remaining=${remaining.length}`);
const fd = openSync(path.join(out, 'new-raw-matches.jsonl'), 'wx'), newRows = [];
const inc = (map, key, amount = 1) => { map[key] = (map[key] ?? 0) + amount; };
function diagnosticsFor(decisions) {
  const byPolicy = {};
  for (const decision of decisions) {
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
    if (t) { d.hybrixTraces++; if (Object.values(t.adaptiveNudges ?? {}).some(v => Math.abs(v) > 0)) d.nonzeroNudgeDecisions++; if (t.difficultyError) d.difficultyErrorDecisions++; if (t.failsafeTriggered) d.failsafeDecisions++; inc(d.nudgeValues, JSON.stringify(t.adaptiveNudges)); for (const p of t.memoryPatterns ?? []) inc(d.memoryPatternTypes, p.type); }
  }
  return byPolicy;
}
const studyStart = performance.now();
let stopReason = null;
for (const spec of remaining) {
  if (spec.orientation !== 'BA' && performance.now() - studyStart > 720000) { stopReason = 'COMPLETION_TIME_BUDGET'; break; }
  const index = priorRows.length + newRows.length;
  const config = { profileId: spec.profileId, seed: spec.seed, seatOrder: ['P1', 'P2'], policyIds: spec.policyIds, ordinal: spec.seedIndex, decisionLimit: 1800, telemetryEnabled: false, decisionTracesEnabled: false, includeReplay: false, runInstanceId: `ArticleCompletion-${tag}-${index}`, pairedRunId: `${spec.profileId}-${spec.pair.join('_')}-${spec.seed}`, seatSwapped: spec.orientation === 'BA', evidenceEpoch: 'article-current-dirty-runtime-pilot', postRulesParityRepair: false };
  const start = performance.now();
  let row;
  try {
    const result = runPolicyMatch(config), { rankDecisions, ...summary } = result.summary;
    const decisionsFile = `decisions-${String(index).padStart(4, '0')}.json.gz`;
    put(decisionsFile, gzipSync(JSON.stringify(result.decisions)));
    row = { index, ...spec, sourceDirectory: rel(out), config, elapsedMs: performance.now() - start, canonical: isCanonicalTermination(summary.terminationReason), capHit: summary.terminationReason === 'DECISION_LIMIT', invalid: summary.errorCode !== null || summary.ruleCompliance.status !== 'PASS', reachedDecisionLimit: result.decisions.length >= config.decisionLimit, summary, diagnostics: diagnosticsFor(result.decisions), decisionsFile, decisionsSha256: jsonSha(result.decisions), trajectorySha256: jsonSha(result.decisions.map(d => [d.actorId, d.actionId, d.beforeStateHash, d.afterStateHash])), replayVerified: false };
  } catch (e) { row = { index, ...spec, sourceDirectory: rel(out), config, elapsedMs: performance.now() - start, error: { code: e.code ?? null, message: e.message, stack: e.stack }, canonical: false, capHit: false, invalid: true }; }
  newRows.push(row); writeSync(fd, JSON.stringify(row) + '\n');
  if (!good(row)) { stopReason = `GROSS_DIAGNOSTIC_FAILURE:${index}:${row.summary?.terminationReason ?? row.error?.message}`; break; }
  if (newRows.length % 16 === 0) console.log(`PROGRESS completion ${newRows.length}/${remaining.length} elapsed=${((performance.now() - studyStart) / 1000).toFixed(1)}s`);
}
closeSync(fd);
const rows = [...existing, ...newRows];
put('combined-study-raw-matches.jsonl', rows.map(row => JSON.stringify(row)).join('\n') + '\n');
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
function wilson(w, n) { if (!n) return null; const z = 1.959963984540054, p = w / n, den = 1 + z * z / n, mid = (p + z * z / (2 * n)) / den, radius = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den; return [Math.max(0, mid - radius), Math.min(1, mid + radius)]; }
function rngFor(text) { let s = Number.parseInt(sha(text).slice(0, 8), 16) >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function clusterCI(values, key) { if (!values.length) return null; const rng = rngFor(`Intrilex article bootstrap v1 ${key}`), samples = []; for (let b = 0; b < 10000; b++) { let total = 0; for (let j = 0; j < values.length; j++) total += values[Math.floor(rng() * values.length)]; samples.push(total / values.length); } samples.sort((a, b) => a - b); return [samples[249], samples[9749]]; }
function signTest(positive, negative) { const n = positive + negative, k = Math.min(positive, negative); if (!n) return 1; let term = 2 ** -n, sum = term; for (let i = 1; i <= k; i++) { term *= (n - i + 1) / i; sum += term; } return Math.min(1, 2 * sum); }
const groups = new Map();
for (const row of rows.filter(r => r.orientation !== 'MIRROR')) { const k = `${row.profileId}:${row.pair.join(':')}`, g = groups.get(k) ?? []; g.push(row); groups.set(k, g); }
const pairTable = [...groups.values()].map(group => {
  const first = group[0], policyA = first.pair[0], policyB = first.pair[1], valid = group.filter(good), clusters = new Map(), margins = [], turns = [], decisions = [], scoresA = [], scoresB = [];
  let winsA = 0, winsB = 0, draws = 0, p1Wins = 0, p2Wins = 0, asP1Wins = 0, asP2Wins = 0;
  for (const row of valid) { const s = row.summary, playerA = row.policyIds.indexOf(policyA) === 0 ? 'P1' : 'P2', playerB = playerA === 'P1' ? 'P2' : 'P1', draw = s.terminationReason === 'CANONICAL_DRAW', winA = s.winner === playerA; if (draw) draws++; else if (winA) { winsA++; if (playerA === 'P1') asP1Wins++; else asP2Wins++; } else winsB++; if (s.winner === 'P1') p1Wins++; if (s.winner === 'P2') p2Wins++; scoresA.push(s.finalScores[playerA]); scoresB.push(s.finalScores[playerB]); margins.push(s.finalScores[playerA] - s.finalScores[playerB]); turns.push(s.completedFullTurns); decisions.push(s.policyDecisionCount); const c = clusters.get(row.seed) ?? []; c.push({ orientation: row.orientation, credit: draw ? 0.5 : winA ? 1 : 0 }); clusters.set(row.seed, c); }
  const complete = [...clusters.values()].filter(c => c.length === 2 && c.some(x => x.orientation === 'AB') && c.some(x => x.orientation === 'BA')), credits = complete.map(c => mean(c.map(x => x.credit)));
  const positive = credits.filter(v => v > 0.5).length, negative = credits.filter(v => v < 0.5).length, zero = credits.filter(v => v === 0.5).length;
  return { profileId: first.profileId, policyA, policyB, games: group.length, validGames: valid.length, invalidGames: group.filter(r => r.invalid).length, cappedGames: group.filter(r => r.capHit).length, winsA, winsB, draws, aWinsAsP1: asP1Wins, aWinsAsP2: asP2Wins, p1Wins, p2Wins, marginalAWinRate: valid.length ? winsA / valid.length : null, descriptiveWilson95: wilson(winsA, valid.length), completePairedSeeds: credits.length, pairedWinCredit: mean(credits), pairedSeedBootstrap95: clusterCI(credits, `${first.profileId}:${policyA}:${policyB}`), positiveSeedContrasts: positive, negativeSeedContrasts: negative, zeroSeedContrasts: zero, pairedSignTwoSidedP: signTest(positive, negative), meanEndingScoreA: mean(scoresA), meanEndingScoreB: mean(scoresB), meanSignedScoreMarginA: mean(margins), meanFullTurns: mean(turns), meanPolicyDecisions: mean(decisions), maxPolicyDecisions: decisions.length ? Math.max(...decisions) : null };
});
// Supplementary Holm adjustment across the 10 pairwise exact sign tests, valid under dependency.
let lastAdjusted = 0;
for (const [i, p] of [...pairTable].sort((a, b) => a.pairedSignTwoSidedP - b.pairedSignTwoSidedP).entries()) { lastAdjusted = Math.max(lastAdjusted, Math.min(1, (pairTable.length - i) * p.pairedSignTwoSidedP)); p.pairedSignHolmP = lastAdjusted; }
const mirrorTable = protocol.policyIds.map(policy => { const group = rows.filter(r => r.orientation === 'MIRROR' && r.policyIds[0] === policy), valid = group.filter(good), p1Wins = valid.filter(r => r.summary.winner === 'P1').length, p2Wins = valid.filter(r => r.summary.winner === 'P2').length; return { policy, games: group.length, p1Wins, p2Wins, draws: valid.length - p1Wins - p2Wins, invalidGames: group.filter(r => !good(r)).length, p1Wilson95: wilson(p1Wins, valid.length), meanFullTurns: mean(valid.map(r => r.summary.completedFullTurns)), meanPolicyDecisions: mean(valid.map(r => r.summary.policyDecisionCount)) }; });
function aggregate(input) {
  const d = { games: input.length, canonicalGames: 0, cappedGames: 0, invalidGames: 0, errors: 0, rejectedCommands: 0, complianceViolations: 0, terminationCounts: {}, policies: {}, totalPolicyDecisions: 0, totalCommands: 0, totalCompletedFullTurns: 0, maxPolicyDecisions: 0, p1Wins: 0, p2Wins: 0 };
  for (const r of input) { if (r.canonical) d.canonicalGames++; if (r.capHit) d.cappedGames++; if (r.invalid) d.invalidGames++; if (r.error) d.errors++; inc(d.terminationCounts, r.summary?.terminationReason ?? 'THROWN_ERROR'); if (!r.summary) continue; const s = r.summary; d.rejectedCommands += s.commandCount - s.acceptedCommandCount; d.complianceViolations += s.ruleCompliance.violationCount; d.totalPolicyDecisions += s.policyDecisionCount; d.totalCommands += s.commandCount; d.totalCompletedFullTurns += s.completedFullTurns; d.maxPolicyDecisions = Math.max(d.maxPolicyDecisions, s.policyDecisionCount); if (s.winner === 'P1') d.p1Wins++; if (s.winner === 'P2') d.p2Wins++; for (const [policy, values] of Object.entries(r.diagnostics)) { const p = d.policies[policy] ??= {}; for (const [k, v] of Object.entries(values)) { if (typeof v === 'number') inc(p, k, v); else { p[k] ??= {}; for (const [name, count] of Object.entries(v)) inc(p[k], name, count); } } } }
  return d;
}
const after = inventory(), changedInputs = Object.keys(before).filter(file => before[file] !== after[file]);
put('input-hashes-after.json', { treeSha256: jsonSha(after), changedInputs, files: after });
put('git-status-after.txt', git(['status', '--porcelain=v1', '--untracked-files=normal']) + '\n');
const completedKeys = new Set(rows.map(key)), missingSpecs = intended.filter(s => !completedKeys.has(key(s)));
const summary = { createdAt: started.toISOString(), finishedAt: new Date().toISOString(), gitHead: metadata.gitHead, profileId: protocol.primaryProfile, priorOutputDirectory: rel(prior), outputDirectory: rel(out), priorStudyGames: existing.length, additionalStudyGames: newRows.length, studiedGames: rows.length, intendedStudyGames: intended.length, complete: !stopReason && !missingSpecs.length, stopReason, missingSpecs, snapshotStable: changedInputs.length === 0, changedInputs, pairTable, mirrorTable, diagnostics: aggregate(rows), crossPolicyDiagnostics: aggregate(rows.filter(r => r.orientation !== 'MIRROR')), preflightExecutions: priorSummary.preflightGames, preflightAllPassed: priorSummary.preflight.every(p => p.pass), focusedTestsPassed: priorSummary.testsPassed, runtimeUpstreamDistMismatches: priorSummary.runtimeUpstreamDistMismatches, limitations: ['Only 16 deterministic seed clusters per pairing; common seeds across comparisons; no independent 320-game sample.', 'Wilson intervals are descriptive marginal summaries, not paired-data inferential intervals. Paired bootstrap and exact sign tests use seed clusters. Holm correction is supplementary.', 'Existing heuristic configurations, not optimized or human-meta policies. HYBRIX memory receives own pending action records through this adapter; no opponent-learning or adaptation ablation claim.', 'Default bounded profile only. No unrestricted/full-rules pilot or optional 32-seed expansion performed because of cost.', 'Dirty snapshot: local runtime/upstream dist match byte-for-byte, but no build/transpile source certification performed.', 'Replay verification covers 10 preflight runs, not every study game. Full decision logs and hashes are retained for study runs.'] };
put('summary.json', summary);
const pct = x => x === null ? '-' : `${(100 * x).toFixed(1)}%`, ci = xs => xs ? `${pct(xs[0])} to ${pct(xs[1])}` : '-';
let report = `# Completed Intrilex current-runtime policy pilot\n\nProfile: ${summary.profileId}. Git HEAD: ${summary.gitHead}.\n\nStudy games: ${rows.length} (${existing.length} original + ${newRows.length} completion); preflight executions: ${summary.preflightExecutions}. Complete: ${summary.complete}. Stable input hashes: ${summary.snapshotStable}.\n\n| A | B | Seeds | A-B-draw | A win % | Wilson95 descriptive | Paired bootstrap95 | Seed + / - / 0 | Sign p | Holm p | Mean scores A:B | Turns | Decisions |\n|---|---|---:|---|---|---|---|---|---:|---:|---|---:|---:|\n`;
for (const p of pairTable) report += `| ${p.policyA} | ${p.policyB} | ${p.completePairedSeeds} | ${p.winsA}-${p.winsB}-${p.draws} | ${pct(p.marginalAWinRate)} | ${ci(p.descriptiveWilson95)} | ${ci(p.pairedSeedBootstrap95)} | ${p.positiveSeedContrasts}/${p.negativeSeedContrasts}/${p.zeroSeedContrasts} | ${p.pairedSignTwoSidedP.toPrecision(3)} | ${p.pairedSignHolmP.toPrecision(3)} | ${p.meanEndingScoreA?.toFixed(2)}:${p.meanEndingScoreB?.toFixed(2)} | ${p.meanFullTurns?.toFixed(2)} | ${p.meanPolicyDecisions?.toFixed(2)} |\n`;
report += '\n## Mirrors\n\n| Policy | Games | P1 wins | P2 wins | Draws | P1 Wilson95 | Mean turns |\n|---|---:|---:|---:|---:|---|---:|\n';
for (const p of mirrorTable) report += `| ${p.policy} | ${p.games} | ${p.p1Wins} | ${p.p2Wins} | ${p.draws} | ${ci(p.p1Wilson95)} | ${p.meanFullTurns?.toFixed(2)} |\n`;
report += `\n## Diagnostics\n\nCanonical ${summary.diagnostics.canonicalGames}/${rows.length}; capped ${summary.diagnostics.cappedGames}; invalid ${summary.diagnostics.invalidGames}; errors ${summary.diagnostics.errors}; rejected commands ${summary.diagnostics.rejectedCommands}; compliance violations ${summary.diagnostics.complianceViolations}. Total policy decisions ${summary.diagnostics.totalPolicyDecisions}; total commands ${summary.diagnostics.totalCommands}; maximum decisions per game ${summary.diagnostics.maxPolicyDecisions} (cap 1800).\n\n## Limitations\n\n${summary.limitations.map(x => `- ${x}`).join('\n')}\n\nOriginal artifacts: ${rel(prior)}. Combined study results: combined-study-raw-matches.jsonl. Each row names its source directory for full decision logs.\n`;
put('RESULTS.md', report);
put('artifact-hashes.json', Object.fromEntries(readdirSync(out).map(name => [name, sha(readFileSync(path.join(out, name)))])));
console.log(report);
if (!summary.complete || !summary.snapshotStable) process.exitCode = 2;
