import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const matchesArg = Number(process.argv[2] ?? 100);
const startOrdinal = Number(process.argv[3] ?? 0);
if (!Number.isInteger(matchesArg) || matchesArg < 1 || matchesArg > 100000) throw new Error('match count must be an integer from 1 to 100000');
if (!Number.isInteger(startOrdinal) || startOrdinal < 0) throw new Error('start ordinal must be a non-negative integer');
if (process.env.INTRILEX_SKIP_BUILD !== '1') {
  const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
const engine = await import(pathToFileURL(path.join(root, 'dist/src/index.js')).href + `?campaign=${Date.now()}`);
const summaries = [];
const terminations = { NORMAL_VICTORY: 0, EXHAUSTED_RESOLUTION: 0, CANONICAL_DRAW: 0, DECISION_LIMIT: 0, ENGINE_REJECTION: 0, UNSUPPORTED_CONFIGURATION: 0 };
const responses = { ace: 0, eight: 0, king: 0, jack: 0, passPriority: 0 };
const privateChoices = {
  'rank3-present': 0,
  'rank3-take': 0,
  'rank3-discard': 0,
  'rank5-rummage': 0,
  'rank6-dig': 0,
  'rank7-assign': 0,
  'rank7-generated-effect': 0,
  'nine-anchor-discard': 0
};
let engineRejections = 0;
const started = performance.now();
for (let localOrdinal = 0; localOrdinal < matchesArg; localOrdinal += 1) {
  const ordinal = startOrdinal + localOrdinal;
  const seed = ((0x41400000 + Math.imul(ordinal, 0x9e3779b1)) >>> 0) || 1;
  const result = engine.runRandomLegalMatch({ profileId: 'first-contact-private-choice', playerIds: ['P1', 'P2'], enabledModules: [], eventApprovedModules: [], seed, seatOrder: ['P1', 'P2'] }, 5000);
  terminations[result.terminationReason] = (terminations[result.terminationReason] ?? 0) + 1;
  for (const decision of result.decisions) {
    if (decision.actionId.includes('counter:ace-base:')) responses.ace += 1;
    else if (decision.actionId.includes('eight-scuttle:')) responses.eight += 1;
    else if (decision.actionId.includes('king-specialized:')) responses.king += 1;
    else if (decision.actionId.includes('disrupt:jack:')) responses.jack += 1;
    else if (decision.actionId.startsWith('pass-priority:')) responses.passPriority += 1;
    if (decision.actionId.startsWith('private-choice:')) {
      const kind = decision.actionId.split(':')[1];
      if (Object.hasOwn(privateChoices, kind)) privateChoices[kind] += 1;
    }
  }
  engineRejections += result.terminationReason === 'ENGINE_REJECTION' ? 1 : 0;
  summaries.push({
    ordinal, seed, terminationReason: result.terminationReason, winner: result.state.winner,
    decisions: result.decisions.length, commands: result.commands.length, events: result.events.length,
    privateChoiceDecisions: result.decisions.filter((entry) => entry.actionId.startsWith('private-choice:')).length,
    finalStateHash: engine.hashCanonical(result.state), decisionHash: engine.hashCanonical(result.decisions)
  });
  if ((localOrdinal + 1) % 50 === 0 || localOrdinal + 1 === matchesArg) console.log(`campaign progress ${localOrdinal + 1}/${matchesArg} [global ${startOrdinal}-${startOrdinal + matchesArg})`);
}
const durationMs = Math.round(performance.now() - started);
const canonicalAggregate = {
  schemaVersion: '1.0', engineVersion: '4.1.4', profileId: 'first-contact-private-choice',
  startOrdinal, endOrdinalExclusive: startOrdinal + matchesArg, matchCount: summaries.length, terminations, responses, privateChoices, engineRejections,
  maxDecisions: Math.max(...summaries.map((row) => row.decisions)),
  meanDecisions: Number((summaries.reduce((sum, row) => sum + row.decisions, 0) / summaries.length).toFixed(4)),
  privateChoiceDecisionCount: summaries.reduce((sum, row) => sum + row.privateChoiceDecisions, 0),
  resultHash: engine.hashCanonical(summaries)
};
const allowedTerminations = new Set(['NORMAL_VICTORY', 'EXHAUSTED_RESOLUTION', 'CANONICAL_DRAW']);
const missingChoiceKinds = Object.entries(privateChoices).filter(([, count]) => count === 0).map(([kind]) => kind);
const report = {
  ...canonicalAggregate,
  status: Object.entries(terminations).every(([key, count]) => allowedTerminations.has(key) || count === 0) && engineRejections === 0 && missingChoiceKinds.length === 0 ? 'PASS' : 'FAIL',
  missingChoiceKinds,
  durationMs,
  matchesPerSecond: Number((summaries.length / (durationMs / 1000)).toFixed(2)),
  generatedAt: new Date().toISOString()
};
if (report.status !== 'PASS') throw new Error(`Campaign failed: ${JSON.stringify(report)}`);
await mkdir(path.join(root, 'reports'), { recursive: true });
report.summaries = summaries;
const suffix = `${startOrdinal}-${startOrdinal + matchesArg}`;
await writeFile(path.join(root, `reports/private-choice-authority-segment-${suffix}.json`), JSON.stringify(report, null, 2) + '\n');
console.log(`PRIVATE CHOICE AUTHORITY CAMPAIGN PASS: matches=${matchesArg}; hash=${report.resultHash}; choices=${report.privateChoiceDecisionCount}; responses=${responses.ace + responses.eight + responses.king + responses.jack}`);
