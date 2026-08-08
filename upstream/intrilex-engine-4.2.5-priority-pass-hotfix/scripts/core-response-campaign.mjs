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
const engine = await import(pathToFileURL(path.join(root, 'dist/src/index.js')).href + `?coreresponse=${Date.now()}`);
const allowed = new Set(['NORMAL_VICTORY', 'EXHAUSTED_RESOLUTION', 'CANONICAL_DRAW']);
const terminations = { NORMAL_VICTORY: 0, EXHAUSTED_RESOLUTION: 0, CANONICAL_DRAW: 0, DECISION_LIMIT: 0, ENGINE_REJECTION: 0, UNSUPPORTED_CONFIGURATION: 0 };
const declarations = {
  roots: 0, baseAce: 0, anchorAce: 0, spadeAce: 0, eightCounter: 0, kingCounter: 0,
  jackDisrupt: 0, nineTap: 0, eightSpadeScuttle: 0, eightAegis: 0, queenAegis: 0
};
const resolutions = { counter: 0, jackDisrupt: 0, nineTap: 0, eightSpadeScuttle: 0, eightAegis: 0, queenAegis: 0, root: 0, fizzle: 0 };
const summaries = [];
const started = performance.now();
for (let local = 0; local < matchCount; local += 1) {
  const ordinal = startOrdinal + local;
  const seed = ((0x42200000 + Math.imul(ordinal, 0x9e3779b1)) >>> 0) || 1;
  const result = engine.runCoreRandomLegalMatch({ profileId: 'core-response-authority', playerIds: ['P1','P2'], seatOrder: ['P1','P2'], enabledModules: [], seed }, 5000);
  terminations[result.terminationReason] = (terminations[result.terminationReason] ?? 0) + 1;
  for (const event of result.events) {
    if (event.type === 'CORE_ACTION_DECLARED') declarations.roots++;
    else if (event.type === 'CORE_ACE_COUNTER_DECLARED') event.payload.sourceMode === 'anchor' ? declarations.anchorAce++ : declarations.baseAce++;
    else if (event.type === 'CORE_SPADE_ACE_COUNTER_DECLARED') declarations.spadeAce++;
    else if (event.type === 'CORE_EIGHT_SCUTTLE_COUNTER_DECLARED') declarations.eightCounter++;
    else if (event.type === 'CORE_KING_COUNTER_DECLARED') declarations.kingCounter++;
    else if (event.type === 'CORE_JACK_DISRUPT_DECLARED') declarations.jackDisrupt++;
    else if (event.type === 'CORE_NINE_TAP_DECLARED') declarations.nineTap++;
    else if (event.type === 'CORE_EIGHT_SPADE_SCUTTLE_DECLARED') declarations.eightSpadeScuttle++;
    else if (event.type === 'CORE_EIGHT_AEGIS_FIELD_DECLARED') declarations.eightAegis++;
    else if (event.type === 'CORE_QUEEN_AEGIS_QUICK_DECLARED') declarations.queenAegis++;
    else if (event.type === 'CORE_COUNTER_RESOLVED') resolutions.counter++;
    else if (event.type === 'CORE_JACK_DISRUPT_RESOLVED') resolutions.jackDisrupt++;
    else if (event.type === 'CORE_NINE_TAP_RESOLVED') resolutions.nineTap++;
    else if (event.type === 'CORE_EIGHT_SPADE_SCUTTLE_RESOLVED') resolutions.eightSpadeScuttle++;
    else if (event.type === 'CORE_EIGHT_AEGIS_FIELD_RESOLVED') resolutions.eightAegis++;
    else if (event.type === 'CORE_QUEEN_AEGIS_QUICK_RESOLVED') resolutions.queenAegis++;
    else if (event.type === 'CORE_ROOT_RESOLVED') resolutions.root++;
    else if (event.type === 'CORE_ROOT_FIZZLED') resolutions.fizzle++;
  }
  summaries.push({ ordinal, seed, terminationReason: result.terminationReason, winner: result.state.winner, decisions: result.decisions.length, commands: result.commands.length, events: result.events.length, finalStateHash: engine.hashCanonical(result.state), decisionHash: engine.hashCanonical(result.decisions) });
  if ((local + 1) % 100 === 0 || local + 1 === matchCount) console.log(`core response campaign ${local + 1}/${matchCount}`);
}
const durationMs = Math.round(performance.now() - started);
const noncanonical = Object.entries(terminations).filter(([kind, count]) => !allowed.has(kind) && count > 0);
const requiredMissing = ['roots','baseAce','spadeAce','eightCounter','kingCounter','jackDisrupt','nineTap','eightSpadeScuttle','eightAegis','queenAegis'].filter((key) => declarations[key] === 0);
const segmentMode = process.env.INTRILEX_SEGMENT === '1';
const report = {
  schemaVersion: '1.0', status: noncanonical.length === 0 && (segmentMode || requiredMissing.length === 0) ? 'PASS' : 'FAIL',
  engineVersion: '4.2.2', profileId: 'core-response-authority', startOrdinal, endOrdinalExclusive: startOrdinal + matchCount, matchCount,
  terminations, declarations, resolutions, engineRejections: terminations.ENGINE_REJECTION,
  unsupportedConfigurations: terminations.UNSUPPORTED_CONFIGURATION,
  maxDecisions: Math.max(...summaries.map((row) => row.decisions)),
  meanDecisions: Number((summaries.reduce((sum, row) => sum + row.decisions, 0) / summaries.length).toFixed(4)),
  resultHash: engine.hashCanonical(summaries), durationMs, matchesPerSecond: Number((matchCount / (durationMs / 1000)).toFixed(2)), generatedAt: new Date().toISOString(), summaries
};
if (report.status !== 'PASS') throw new Error(`Core response campaign failed: ${JSON.stringify({noncanonical, requiredMissing, declarations, terminations})}`);
await mkdir(path.join(root, 'reports'), { recursive: true });
await writeFile(path.join(root, `reports/core-response-segment-${startOrdinal}-${startOrdinal + matchCount}.json`), JSON.stringify(report, null, 2) + '\n');
console.log(`CORE RESPONSE CAMPAIGN PASS: matches=${matchCount}; hash=${report.resultHash}; declarations=${JSON.stringify(declarations)}`);
