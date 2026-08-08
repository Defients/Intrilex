import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractAnalysis } from '@intrilex/analytics/extract';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const observatoryDir = path.join(root, 'sample-data/observatory');
const autonomyDir = path.join(root, 'sample-data/autonomy');

const format = process.argv.includes('--markdown') || process.argv.includes('--md') ? 'markdown' : 'json';
const outPath = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;

const analytics = JSON.parse(await readFile(path.join(observatoryDir, 'analytics.json'), 'utf8'));
const aggregate = JSON.parse(await readFile(path.join(autonomyDir, 'aggregate.json'), 'utf8'));

const extract = extractAnalysis({ analytics, aggregate });

if (format === 'markdown') {
  const lines = [];
  lines.push('# Mechanics Observatory — AI Agent Extract');
  lines.push('');
  lines.push(`**Extract version:** ${extract.extractVersion}`);
  lines.push(`**Analytics schema:** ${extract.analyticsSchemaVersion}`);
  lines.push(`**Source hash:** \`${extract.sourceHash}\``);
  lines.push(`**Aggregate hash:** \`${extract.aggregateHash}\``);
  lines.push(`**Extract hash:** \`${extract.extractHash}\``);
  lines.push('');
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(extract.executiveSummary);
  lines.push('');
  lines.push('## Dataset');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  for (const [k, v] of Object.entries(extract.dataset)) lines.push(`| ${k} | ${v} |`);
  lines.push('');
  lines.push('## Policy Findings');
  lines.push('');
  for (const p of extract.policyFindings) {
    lines.push(`### ${p.policyId}`);
    lines.push('');
    lines.push(`- **Win rate:** ${(p.winRate * 100).toFixed(1)}% (${p.wins}/${p.games} games, CI [${p.winRateCI?.[0]?.toFixed(3)}, ${p.winRateCI?.[1]?.toFixed(3)}])`);
    lines.push(`- **Key traits:** ${p.keyTraits.join(', ') || 'none notable'}`);
    lines.push(`- **Fingerprint:** scoreAggression=${p.fingerprint?.scoreAggression?.toFixed(3)}, responseUse=${p.fingerprint?.responseUse?.toFixed(3)}, advancedFrequency=${p.fingerprint?.advancedFrequency?.toFixed(3)}`);
    lines.push('');
  }
  lines.push('## Mechanic Findings');
  lines.push('');
  lines.push('| Mechanic | Usage Rate | Sample | Association | Grade | Status |');
  lines.push('|----------|-----------|--------|-------------|-------|--------|');
  for (const m of extract.mechanicFindings) {
    lines.push(`| ${m.mechanic} | ${(m.matchUsageRate * 100).toFixed(1)}% | ${m.sampleSize} | ${m.outcomeAssociation?.toFixed(3) ?? 'N/A'} | ${m.evidenceGrade} | ${m.status} |`);
  }
  lines.push('');
  for (const m of extract.mechanicFindings) {
    lines.push(`<details><summary><b>${m.mechanic}</b></summary>`);
    lines.push('');
    lines.push(m.summary);
    lines.push('');
    if (m.replayRefs?.length) lines.push(`Replay refs: ${m.replayRefs.join(', ')}`);
    lines.push('</details>');
    lines.push('');
  }
  lines.push('## Synergy Findings');
  lines.push('');
  lines.push('| Pair | Class | Effect | Shrunk | q-value | Status |');
  lines.push('|------|-------|--------|--------|---------|--------|');
  for (const s of extract.synergyFindings) {
    lines.push(`| ${s.pair} | ${s.relationshipClass} | ${s.effect?.toFixed(3)} | ${s.shrunkEffect?.toFixed(3)} | ${s.qValue?.toFixed(4)} | ${s.status} |`);
  }
  lines.push('');
  lines.push('## Causal Motifs');
  lines.push('');
  for (const m of extract.motifFindings.slice(0, 20)) {
    lines.push(`- **${m.motif}** — ${m.count} occurrence(s), ${m.matchIds?.length ?? 0} matches`);
  }
  lines.push('');
  lines.push('## Anomalies');
  lines.push('');
  lines.push(extract.anomalies.summary);
  lines.push('');
  if (extract.anomalies.byType) {
    for (const [type, count] of Object.entries(extract.anomalies.byType)) {
      lines.push(`- ${type}: ${count}`);
    }
  }
  lines.push('');
  lines.push('## Recommendations');
  lines.push('');
  for (const r of extract.recommendations) lines.push(`- ${r}`);
  lines.push('');
  lines.push('## Interpretation Boundary');
  lines.push('');
  lines.push(extract.interpretationBoundary);
  lines.push('');
  const md = lines.join('\n');
  if (outPath) {
    await writeFile(outPath, md + '\n');
    console.log(`EXTRACT MARKDOWN PASS: ${outPath}`);
  } else {
    process.stdout.write(md + '\n');
  }
} else {
  const json = JSON.stringify(extract, null, 2);
  if (outPath) {
    await writeFile(outPath, json + '\n');
    console.log(`EXTRACT JSON PASS: ${outPath}; hash=${extract.extractHash}`);
  } else {
    process.stdout.write(json + '\n');
  }
}
