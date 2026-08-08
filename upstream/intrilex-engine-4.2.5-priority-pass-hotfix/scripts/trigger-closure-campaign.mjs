import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const matchCount = Number(process.argv[2] ?? 500);
const startOrdinal = Number(process.argv[3] ?? 0);
if (!Number.isInteger(matchCount) || matchCount < 1 || matchCount > 100000) throw new Error('match count must be 1..100000');
if (!Number.isInteger(startOrdinal) || startOrdinal < 0) throw new Error('start ordinal must be non-negative');
if (process.env.INTRILEX_SKIP_BUILD !== '1') {
  const built = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
  if (built.status !== 0) process.exit(built.status ?? 1);
}
const engine = await import(pathToFileURL(path.join(root, 'dist/src/index.js')).href + `?trigger=${Date.now()}`);
const allowed = new Set(['NORMAL_VICTORY', 'EXHAUSTED_RESOLUTION', 'CANONICAL_DRAW']);
const terminations = { NORMAL_VICTORY: 0, EXHAUSTED_RESOLUTION: 0, CANONICAL_DRAW: 0, DECISION_LIMIT: 0, ENGINE_REJECTION: 0, UNSUPPORTED_CONFIGURATION: 0 };
const triggerEvents = { queued: 0, flushed: 0, began: 0, resolved: 0 };
const responses = { ace: 0, eight: 0, king: 0, jack: 0, passPriority: 0 };
const privateChoices = {
  'rank3-present': 0, 'rank3-take': 0, 'rank3-discard': 0, 'rank5-rummage': 0,
  'rank6-dig': 0, 'rank7-assign': 0, 'rank7-generated-effect': 0,
  'rank7-scoring-trigger': 0, 'nine-anchor-discard': 0
};
const summaries = [];
const started = performance.now();
for (let local = 0; local < matchCount; local += 1) {
  const ordinal = startOrdinal + local;
  const seed = ((0x41500000 + Math.imul(ordinal, 0x9e3779b1)) >>> 0) || 1;
  const result = engine.runRandomLegalMatch({ profileId: 'first-contact-trigger-closure', playerIds: ['P1','P2'], enabledModules: [], eventApprovedModules: [], seed, seatOrder: ['P1','P2'] }, 5000);
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
  for (const event of result.events) {
    if (event.type === 'AUTONOMY_SEVEN_SCORING_TRIGGER_QUEUED') triggerEvents.queued += 1;
    else if (event.type === 'AUTONOMY_TRIGGER_QUEUE_FLUSHED') triggerEvents.flushed += 1;
    else if (event.type === 'AUTONOMY_SEVEN_SCORING_TRIGGER_BEGAN') triggerEvents.began += 1;
    else if (event.type === 'AUTONOMY_SEVEN_SCORING_TRIGGER_RESOLVED') triggerEvents.resolved += 1;
  }
  summaries.push({
    ordinal, seed, terminationReason: result.terminationReason, winner: result.state.winner,
    decisions: result.decisions.length, commands: result.commands.length, events: result.events.length,
    triggerChoices: result.decisions.filter((entry) => entry.actionId.startsWith('private-choice:rank7-scoring-trigger:')).length,
    finalStateHash: engine.hashCanonical(result.state), decisionHash: engine.hashCanonical(result.decisions)
  });
  if ((local + 1) % 100 === 0 || local + 1 === matchCount) console.log(`trigger campaign ${local + 1}/${matchCount}`);
}
const durationMs = Math.round(performance.now() - started);
const missingTriggerProof = Object.values(triggerEvents).some((count) => count === 0) || privateChoices['rank7-scoring-trigger'] === 0;
const noncanonical = Object.entries(terminations).filter(([kind, count]) => !allowed.has(kind) && count > 0);
const report = {
  schemaVersion: '1.0', status: noncanonical.length === 0 && !missingTriggerProof ? 'PASS' : 'FAIL',
  engineVersion: '4.1.5', profileId: 'first-contact-trigger-closure', startOrdinal,
  endOrdinalExclusive: startOrdinal + matchCount, matchCount, terminations, triggerEvents, responses, privateChoices,
  engineRejections: terminations.ENGINE_REJECTION, unsupportedConfigurations: terminations.UNSUPPORTED_CONFIGURATION,
  maxDecisions: Math.max(...summaries.map((row) => row.decisions)),
  meanDecisions: Number((summaries.reduce((sum, row) => sum + row.decisions, 0) / summaries.length).toFixed(4)),
  resultHash: engine.hashCanonical(summaries), durationMs,
  matchesPerSecond: Number((matchCount / (durationMs / 1000)).toFixed(2)), generatedAt: new Date().toISOString(), summaries
};
if (report.status !== 'PASS') throw new Error(`Trigger campaign failed: ${JSON.stringify({noncanonical, missingTriggerProof, triggerEvents, privateChoices})}`);
await mkdir(path.join(root, 'reports'), { recursive: true });
await writeFile(path.join(root, `reports/trigger-closure-authority-segment-${startOrdinal}-${startOrdinal + matchCount}.json`), JSON.stringify(report, null, 2) + '\n');
console.log(`TRIGGER CLOSURE CAMPAIGN PASS: matches=${matchCount}; hash=${report.resultHash}; triggers=${triggerEvents.resolved}; triggerChoices=${privateChoices['rank7-scoring-trigger']}`);
