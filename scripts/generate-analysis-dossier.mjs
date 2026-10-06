// generate-analysis-dossier.mjs — emit a representative Analysis Dossier from
// the shipped sample-data fixtures (Observatory analytics + campaign
// aggregate). Browser Evolution Lab / strategy stores do not exist in this
// Node context, so the lab section is marked unavailable — the dossier
// declares that explicitly instead of fabricating it.
import { readFile } from 'node:fs/promises';
import { writeFile } from './lib/write-with-retry.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractAnalysis } from '@intrilex/analytics/extract';
import { buildAnalysisDossier, serializeAnalysisDossier, renderAnalysisDossierMarkdown, analysisDossierFileNames } from '../apps/lab-web/src/analysis-dossier.js';
import { LAB_VERSION, ENGINE_VERSION, RULES_VERSION, OFFICIAL_RULES_VERSION, SCHEMA_VERSION } from '../packages/shared/src/version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'sample-data/observatory');
const generatedAt = process.env.DOSSIER_GENERATED_AT ?? new Date().toISOString();

const read = async rel => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const observatory = await read('sample-data/observatory/analytics.json');
const aggregate = await read('sample-data/autonomy/aggregate.json');
const corpusAnalytics = await read('sample-data/corpus-analytics.json');
const replayIndex = await read('sample-data/replay-index.json');
const autonomyIndex = await read('sample-data/autonomy/lab-replay-index.json');
const capabilities = await read('apps/lab-web/dist/data/release/capability-manifest.json').catch(() => null);
const rankAuthority = await read('apps/lab-web/dist/data/release/rank-authority.json').catch(() => null);

const dossier = buildAnalysisDossier({
  observatory, aggregate, corpusAnalytics, replayIndex, autonomyIndex,
  capabilities, rankAuthority,
  versions: { labVersion: LAB_VERSION, engineVersion: ENGINE_VERSION, rulesVersion: RULES_VERSION, officialRulesVersion: OFFICIAL_RULES_VERSION, observatorySchemaVersion: SCHEMA_VERSION },
  analysisExtract: extractAnalysis({ analytics: observatory, aggregate }),
  lab: null,
}, { generatedAt });

const names = analysisDossierFileNames(dossier, { generatedAt });
const json = JSON.stringify(JSON.parse(serializeAnalysisDossier(dossier)), null, 2);
const markdown = renderAnalysisDossierMarkdown(dossier);

await writeFile(path.join(outDir, 'analysis-dossier.sample.json'), json + '\n');
await writeFile(path.join(outDir, 'analysis-dossier.sample.md'), markdown);
console.log(`DOSSIER PASS: ${names.json} (${json.length} bytes) + ${names.markdown} (${markdown.length} bytes); hash=${dossier.dossierHash}`);
