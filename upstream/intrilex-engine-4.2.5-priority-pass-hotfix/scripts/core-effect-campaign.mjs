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
const engine = await import(pathToFileURL(path.join(root, 'dist/src/index.js')).href + `?coreeffect=${Date.now()}`);
const allowed = new Set(['NORMAL_VICTORY', 'EXHAUSTED_RESOLUTION', 'CANONICAL_DRAW']);
const terminations = { NORMAL_VICTORY: 0, EXHAUSTED_RESOLUTION: 0, CANONICAL_DRAW: 0, DECISION_LIMIT: 0, ENGINE_REJECTION: 0, UNSUPPORTED_CONFIGURATION: 0 };
const actions = { startSwap: 0, draw: 0, faceUpSwap: 0, score: 0, scuttle: 0, pass: 0, ace:0, three:0, four:0, attachment:0, anchor:0, redJoker:0, boardLock:0 };
const summaries = [];
const started = performance.now();
for (let local = 0; local < matchCount; local += 1) {
  const ordinal = startOrdinal + local;
  const seed = ((0x42000000 + Math.imul(ordinal, 0x9e3779b1)) >>> 0) || 1;
  const result = engine.runCoreRandomLegalMatch({ profileId: 'core-effect-declaration-authority', playerIds: ['P1','P2'], seatOrder: ['P1','P2'], enabledModules: [], seed }, 2500);
  terminations[result.terminationReason] = (terminations[result.terminationReason] ?? 0) + 1;
  for (const command of result.commands) {
    if (command.type !== 'RESOLVE_CORE_AUTHORITY_ACTION') continue;
    const kind = command.action.kind;
    if (kind === 'core-face-down-swap') actions.startSwap += 1;
    else if (kind === 'core-draw') actions.draw += 1;
    else if (kind === 'core-face-up-swap-draw') actions.faceUpSwap += 1;
    else if (kind === 'core-score') actions.score += 1;
    else if (kind === 'core-scuttle') actions.scuttle += 1;
    else if (kind === 'core-pass') actions.pass += 1;
    else if (kind === 'core-resolve-effect') { const family=command.action.effect.kind; if(family.startsWith('ace-'))actions.ace++; else if(family==='three-bounce')actions.three++; else if(family.startsWith('four-'))actions.four++; else if(family==='jack-attach')actions.attachment++; else if(family.endsWith('-anchor'))actions.anchor++; else if(family==='red-joker')actions.redJoker++; else if(family==='black-joker-board-lock')actions.boardLock++; }
  }
  summaries.push({ ordinal, seed, terminationReason: result.terminationReason, winner: result.state.winner, decisions: result.decisions.length, commands: result.commands.length, events: result.events.length, finalStateHash: engine.hashCanonical(result.state), decisionHash: engine.hashCanonical(result.decisions) });
  if ((local + 1) % 100 === 0 || local + 1 === matchCount) console.log(`core effect campaign ${local + 1}/${matchCount}`);
}
const durationMs = Math.round(performance.now() - started);
const noncanonical = Object.entries(terminations).filter(([kind, count]) => !allowed.has(kind) && count > 0);
const requiredActionsMissing = ['draw','faceUpSwap','score','scuttle','pass','ace','three','four','attachment','anchor','redJoker','boardLock'].filter((key) => actions[key] === 0);
const report = {
  schemaVersion: '1.0', status: noncanonical.length === 0 && requiredActionsMissing.length === 0 ? 'PASS' : 'FAIL', engineVersion: '4.2.1', profileId: 'core-effect-declaration-authority', startOrdinal, endOrdinalExclusive: startOrdinal + matchCount, matchCount, terminations, actions, engineRejections: terminations.ENGINE_REJECTION, unsupportedConfigurations: terminations.UNSUPPORTED_CONFIGURATION, maxDecisions: Math.max(...summaries.map((row) => row.decisions)), meanDecisions: Number((summaries.reduce((sum, row) => sum + row.decisions, 0) / summaries.length).toFixed(4)), resultHash: engine.hashCanonical(summaries), durationMs, matchesPerSecond: Number((matchCount / (durationMs / 1000)).toFixed(2)), generatedAt: new Date().toISOString(), summaries
};
if (report.status !== 'PASS') throw new Error(`Core effect campaign failed: ${JSON.stringify({noncanonical, requiredActionsMissing, actions})}`);
await mkdir(path.join(root, 'reports'), { recursive: true });
await writeFile(path.join(root, `reports/core-effect-segment-${startOrdinal}-${startOrdinal + matchCount}.json`), JSON.stringify(report, null, 2) + '\n');
console.log(`CORE EFFECT CAMPAIGN PASS: matches=${matchCount}; hash=${report.resultHash}; actions=${JSON.stringify(actions)}`);
