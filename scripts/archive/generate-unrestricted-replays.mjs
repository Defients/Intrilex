/**
 * Generate certified replays for the CORE_UNRESTRICTED_AUTHORITY profile.
 *
 * These replays exercise the hidden super branches, sudden death, and
 * generated effect copy mechanics that are unique to the unrestricted profile.
 *
 * Usage: node scripts/generate-unrestricted-replays.mjs [count] [startOrdinal]
 */
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDir = path.join(root, 'runtime/autonomy-engine-dist/src');
const moduleUrl = (file) => pathToFileURL(path.join(runtimeDir, file)).href;

const matchCount = Number(process.argv[2] ?? 10);
const startOrdinal = Number(process.argv[3] ?? 0);

if (!Number.isInteger(matchCount) || matchCount < 1 || matchCount > 10000) {
  throw new Error('match count must be 1..10000');
}

// Import engine modules
const engineModule = await import(moduleUrl('engine.js'));
const stateModule = await import(moduleUrl('state.js'));
const coreAutonomyModule = await import(moduleUrl('core-autonomy.js'));
const phase16Module = await import(moduleUrl('phase16.js'));
const indexModule = await import(moduleUrl('index.js'));


const runCoreRandomLegalMatch = coreAutonomyModule.runCoreRandomLegalMatch;
const { createCertifiedReplay } = phase16Module;
const { hashCanonical } = indexModule;

// Find the highest existing unrestricted replay ordinal
const replayDir = path.join(root, 'upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix/replays');
const existing = (await readdir(replayDir).catch(() => [])).filter(f => f.startsWith('UC-'));
const maxExisting = existing.reduce((max, f) => {
  const m = f.match(/UC-(\d+)/);
  return m ? Math.max(max, parseInt(m[1], 10)) : max;
}, 0);

const allowedTerminations = new Set(['NORMAL_VICTORY', 'EXHAUSTED_RESOLUTION', 'CANONICAL_DRAW']);
const terminations = { NORMAL_VICTORY: 0, EXHAUSTED_RESOLUTION: 0, CANONICAL_DRAW: 0, DECISION_LIMIT: 0, ENGINE_REJECTION: 0 };
const coverage = {
  suddenDeath: 0, threeRaid: 0, fiveRecycle: 0, sixDig: 0, sevenTopdeck: 0,
  diamondMimic: 0, hiddenSuper: 0, generatedEffectCopy: 0
};
const eventMap = {
  'CORE_SUDDEN_DEATH_DECLARED': 'suddenDeath',
  'CORE_ADVANCED_SUPER_THREE_RAID_RESOLVED': 'threeRaid',
  'CORE_ADVANCED_SUPER_FIVE_RECYCLE_RESOLVED': 'fiveRecycle',
  'CORE_ADVANCED_SUPER_SIX_DIG_RESOLVED': 'sixDig',
  'CORE_ADVANCED_SUPER_SEVEN_TOPDECK_RESOLVED': 'sevenTopdeck',
  'CORE_RANK10_DIAMOND_MIMIC_RESOLVED': 'diamondMimic',
  'CORE_ADVANCED_GENERATED_EFFECT_COPY_RESOLVED': 'generatedEffectCopy',
};

const summaries = [];
const started = performance.now();

for (let local = 0; local < matchCount; local++) {
  const ordinal = maxExisting + startOrdinal + local + 1;
  const fixtureId = `UC-${String(ordinal).padStart(3, '0')}`;
  const seed = ((0x42400000 + Math.imul(ordinal, 0x9e3779b1)) >>> 0) || 1;

  const setup = {
    profileId: 'core-unrestricted-authority',
    playerIds: ['P1', 'P2'],
    enabledModules: [],
    seed,
    seatOrder: ['P1', 'P2']
  };

  const result = runCoreRandomLegalMatch(setup, 12000);
  terminations[result.terminationReason] = (terminations[result.terminationReason] ?? 0) + 1;

  // Track coverage of unrestricted-only mechanics
  const localCoverage = {};
  for (const event of result.events) {
    const key = eventMap[event.type];
    if (key) {
      coverage[key]++;
      localCoverage[key] = (localCoverage[key] ?? 0) + 1;
    }
  }

  // Create certified replay
  const replay = createCertifiedReplay(fixtureId, result.state, result.commands, '4.2.6');

  // Write the certified replay
  const replayPath = path.join(replayDir, `${fixtureId}.certified.replay.json`);
  await writeFile(replayPath, JSON.stringify(replay, null, 2) + '\n');

  summaries.push({
    ordinal,
    fixtureId,
    seed,
    terminationReason: result.terminationReason,
    winner: result.state.winner,
    decisions: result.decisions.length,
    commands: result.commands.length,
    events: result.events.length,
    coverage: localCoverage,
    finalStateHash: hashCanonical(result.state),
    decisionHash: hashCanonical(result.decisions),
    commandHash: hashCanonical(result.commands),
    contentHash: replay.contentHash,
    integrityHash: replay.integrityHash
  });

  if ((local + 1) % 5 === 0 || local + 1 === matchCount) {
    console.log(`unrestricted replay generation ${local + 1}/${matchCount} (${fixtureId})`);
  }
}

const durationMs = Math.round(performance.now() - started);
const noncanonical = Object.entries(terminations).filter(([k, v]) => !allowedTerminations.has(k) && v > 0);
const missing = Object.entries(coverage).filter(([, v]) => v === 0).map(([k]) => k);

const report = {
  schemaVersion: '1.0',
  status: noncanonical.length === 0 ? 'PASS' : 'FAIL',
  engineVersion: '4.2.6',
  rulesAuthorityVersion: '4.1.2',
  profileId: 'core-unrestricted-authority',
  startOrdinal: maxExisting + startOrdinal + 1,
  endOrdinalExclusive: maxExisting + startOrdinal + 1 + matchCount,
  matchCount,
  terminations,
  coverage,
  engineRejections: terminations.ENGINE_REJECTION,
  maxDecisions: Math.max(...summaries.map(x => x.decisions)),
  meanDecisions: Number((summaries.reduce((a, b) => a + b.decisions, 0) / summaries.length).toFixed(4)),
  resultHash: hashCanonical(summaries),
  durationMs,
  matchesPerSecond: Number((matchCount / (durationMs / 1000)).toFixed(2)),
  generatedAt: new Date().toISOString(),
  missing,
  summaries
};

if (report.status !== 'PASS') {
  console.error('FAIL:', JSON.stringify({ noncanonical, terminations, coverage }));
  process.exit(1);
}

await mkdir(path.join(root, 'reports'), { recursive: true });
await writeFile(
  path.join(root, 'reports/unrestricted-replay-generation.json'),
  JSON.stringify(report, null, 2) + '\n'
);

console.log(`\nUNRESTRICTED REPLAY GENERATION PASS: matches=${matchCount}; replays=${summaries.length}; hash=${report.resultHash.slice(0, 16)}; coverage=${JSON.stringify(coverage)}`);
console.log(`Replays written to: ${replayDir}`);
console.log(`Report: reports/unrestricted-replay-generation.json`);
