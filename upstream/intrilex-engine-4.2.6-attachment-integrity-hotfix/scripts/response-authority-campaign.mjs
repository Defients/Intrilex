import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const matchesArg = Number(process.argv[2] ?? 500);
if (!Number.isInteger(matchesArg) || matchesArg < 1 || matchesArg > 100000) throw new Error('match count must be an integer from 1 to 100000');
const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);
const engine = await import(pathToFileURL(path.join(root, 'dist/src/index.js')).href + `?campaign=${Date.now()}`);
const summaries = [];
const terminations = { NORMAL_VICTORY: 0, EXHAUSTED_RESOLUTION: 0, CANONICAL_DRAW: 0, DECISION_LIMIT: 0, ENGINE_REJECTION: 0, UNSUPPORTED_CONFIGURATION: 0 };
const responses = { ace: 0, eight: 0, king: 0, jack: 0, passPriority: 0 };
const started = performance.now();
for (let ordinal = 0; ordinal < matchesArg; ordinal += 1) {
  const seed = ((0x41300000 + Math.imul(ordinal, 0x9e3779b1)) >>> 0) || 1;
  const result = engine.runRandomLegalMatch({ profileId: 'first-contact-response', playerIds: ['P1', 'P2'], enabledModules: [], eventApprovedModules: [], seed, seatOrder: ['P1', 'P2'] }, 1600);
  terminations[result.terminationReason] += 1;
  for (const decision of result.decisions) {
    if (decision.actionId.includes('counter:ace-base:')) responses.ace += 1;
    else if (decision.actionId.includes('eight-scuttle:')) responses.eight += 1;
    else if (decision.actionId.includes('king-specialized:')) responses.king += 1;
    else if (decision.actionId.includes('disrupt:jack:')) responses.jack += 1;
    else if (decision.actionId.startsWith('pass-priority:')) responses.passPriority += 1;
  }
  summaries.push({
    ordinal, seed, terminationReason: result.terminationReason, winner: result.state.winner,
    decisions: result.decisions.length, commands: result.commands.length, events: result.events.length,
    finalStateHash: engine.hashCanonical(result.state), decisionHash: engine.hashCanonical(result.decisions)
  });
}
const durationMs = Math.round(performance.now() - started);
const canonicalAggregate = {
  schemaVersion: '1.0', engineVersion: '4.1.3', profileId: 'first-contact-response',
  matchCount: summaries.length, terminations, responses,
  maxDecisions: Math.max(...summaries.map((row) => row.decisions)),
  meanDecisions: Number((summaries.reduce((sum, row) => sum + row.decisions, 0) / summaries.length).toFixed(4)),
  resultHash: engine.hashCanonical(summaries)
};
const report = {
  ...canonicalAggregate,
  status: Object.keys(terminations).filter((key) => !['NORMAL_VICTORY', 'EXHAUSTED_RESOLUTION', 'CANONICAL_DRAW'].includes(key)).every((key) => terminations[key] === 0) ? 'PASS' : 'FAIL',
  durationMs,
  matchesPerSecond: Number((summaries.length / (durationMs / 1000)).toFixed(2)),
  generatedAt: new Date().toISOString()
};
if (report.status !== 'PASS') throw new Error(`Campaign failed: ${JSON.stringify(report)}`);
await mkdir(path.join(root, 'reports'), { recursive: true });
const suffix = String(matchesArg);
await writeFile(path.join(root, `reports/response-authority-stress-${suffix}.json`), JSON.stringify(report, null, 2) + '\n');
console.log(`RESPONSE AUTHORITY CAMPAIGN PASS: matches=${matchesArg}; hash=${report.resultHash}; responses=${responses.ace + responses.eight + responses.king + responses.jack}`);
