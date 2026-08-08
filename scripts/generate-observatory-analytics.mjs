import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildObservatoryAnalytics } from '@intrilex/analytics';
import { runPolicyMatch } from '@intrilex/simulation-runtime';
import { canonicalRankAnatomyRegistry, rank2EligibilityRecord, rankEligibilitySummary } from '@intrilex/simulation-runtime/rank-anatomy-registry';
import { hashCanonical, sanitizeCsvCell } from '@intrilex/shared';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const autonomy=path.join(root,'sample-data/autonomy');
const out=path.join(root,'sample-data/observatory');
await mkdir(out,{recursive:true});
const summariesText=await readFile(path.join(autonomy,'match-summaries.ndjson'),'utf8');
const summaries=summariesText.trim().split('\n').filter(Boolean).map(JSON.parse);
const aggregate=JSON.parse(await readFile(path.join(autonomy,'aggregate.json'),'utf8'));
const retention=JSON.parse(await readFile(path.join(autonomy,'retention-index.json'),'utf8'));
const selected=[...retention.records].sort((a,b)=>a.summary.completedFullTurns-b.summary.completedFullTurns||a.matchOrdinal-b.matchOrdinal).slice(0,12);
const detailed=[];
for(const retained of selected){
  const s=retained.summary;
  const result=runPolicyMatch({ordinal:s.matchOrdinal,seed:s.seed,profileId:s.profileId,seatOrder:s.seatOrder,policyIds:s.policyIds,decisionLimit:1800,includeReplay:false,telemetryEnabled:true,authorizedScope:'omniscient',seatSwapped:s.seatSwapped,pairedRunId:s.pairedRunId});
  if(result.summary.matchResultHash!==s.matchResultHash)throw new Error(`OBSERVATORY_DETAIL_HASH_MISMATCH:${s.matchId}`);
  detailed.push({summary:result.summary,facts:result.facts,provenance:result.provenance});
}
const analytics=buildObservatoryAnalytics({summaries,detailedMatches:detailed,aggregate});
const full={...analytics,summaries,retainedReplayIndex:retention.records.map(r=>({matchId:r.matchId,reasons:r.reasons,summary:r.summary})),detailedMatchCount:detailed.length,sourceHashes:{aggregate:aggregate.aggregateHash,retention:retention.retentionHash,summaries:hashCanonical(summaries.map(s=>s.matchResultHash))}};
await writeFile(path.join(out,'analytics.json'),JSON.stringify(full,null,2)+'\n');
await writeFile(path.join(out,'metric-registry.json'),JSON.stringify(full.metricRegistry,null,2)+'\n');
await writeFile(path.join(out,'decision-facts.ndjson'),detailed.flatMap(m=>m.facts.decisionFacts).map(JSON.stringify).join('\n')+'\n');
await writeFile(path.join(out,'resolution-facts.ndjson'),detailed.flatMap(m=>m.facts.resolutionFacts).map(JSON.stringify).join('\n')+'\n');
await writeFile(path.join(out,'causal-edges.ndjson'),detailed.flatMap(m=>m.facts.causalEdges).map(JSON.stringify).join('\n')+'\n');
const mechCols=['mechanic','usageUnit','analysisUnitOpportunityCount','matchOpportunityCount','selectionCount','usageRate','sampleSize','outcomeAssociation','ciLow','ciHigh','evidenceGrade','status','formulaHash'];
const mechRows=full.mechanics.map(x=>[x.mechanic,x.usageUnit??'match',x.analysisUnitOpportunityCount??x.matchOpportunityCount??'N/A',x.matchOpportunityCount??'N/A',x.selectionCount??'N/A',x.matchUsageRate??'N/A',x.sampleSize??'N/A',x.outcomeAssociation??'N/A',x.outcomeAssociation95?.[0]??'N/A',x.outcomeAssociation95?.[1]??'N/A',x.evidenceGrade??'N/A',x.status??'N/A',x.formulaHash??'N/A']);
await writeFile(path.join(out,'mechanics.csv'),[mechCols,...mechRows].map(r=>r.map(sanitizeCsvCell).join(',')).join('\n')+'\n');
const synCols=['source','target','relationshipClass','effect','shrunkEffect','ciLow','ciHigh','pValue','qValue','jointOpportunityCount','baselineCount','evidenceGrade','status','formulaHash'];
const synRows=full.synergies.map(x=>[x.source,x.target,x.relationshipClass,x.effect??'N/A',x.shrunkEffect??'N/A',x.confidenceInterval?.[0]??'N/A',x.confidenceInterval?.[1]??'N/A',x.pValue??'N/A',x.qValue??'N/A',x.jointOpportunityCount??'N/A',x.baselineCount??'N/A',x.evidenceGrade??'N/A',x.status??'N/A',x.formulaHash??'N/A']);
await writeFile(path.join(out,'synergies.csv'),[synCols,...synRows].map(r=>r.map(sanitizeCsvCell).join(',')).join('\n')+'\n');
await writeFile(path.join(out,'README.md'),`# Mechanics Observatory sample data\n\nTelemetry schema: 4.1.0\nAnalytics schema: 4.2.0\nMatches: ${summaries.length}\nDetailed semantic fact matches: ${detailed.length}\nObservatory hash: ${full.observatoryHash}\n`);

// Generate canonical Rank Anatomy registry artifact
const rankAnatomyRegistry = canonicalRankAnatomyRegistry(hashCanonical);
const rank2Eligibility = rank2EligibilityRecord(hashCanonical);
const eligibilitySummary = rankEligibilitySummary();
await writeFile(path.join(out,'rank-anatomy-registry.json'),JSON.stringify(rankAnatomyRegistry,null,2)+'\n');
await writeFile(path.join(out,'rank-2-eligibility.json'),JSON.stringify(rank2Eligibility,null,2)+'\n');
await writeFile(path.join(out,'rank-eligibility-summary.json'),JSON.stringify(eligibilitySummary,null,2)+'\n');
console.log(`RANK ANATOMY REGISTRY PASS: ranks=${rankAnatomyRegistry.rankCount}; spadesVariants=${rankAnatomyRegistry.spadesVariantCount}; superEffects=${rankAnatomyRegistry.superEffectCount}; hash=${rankAnatomyRegistry.registryHash?.substring(0,16)}`);

// Write per-variant analytics (Rank Anatomy: ordinary/spade/super/effect decomposition)
if (full.variantAnalytics) {
  await writeFile(path.join(out,'variant-analytics.json'),JSON.stringify(full.variantAnalytics,null,2)+'\n');
  const variantKeys = Object.keys(full.variantAnalytics.variantMetrics || {});
  console.log(`VARIANT ANALYTICS PASS: variants=${variantKeys.length}; metrics=${JSON.stringify(Object.keys(full.variantAnalytics))}`);
} else {
  console.log('VARIANT ANALYTICS: none (variantAnalytics is null)');
}

// Write rank analytics (ORV, rank power, swap matrix)
if (full.rankPower || full.rankCounters) {
  const rankAnalyticsExport = {
    schemaVersion: '1.0.0',
    rankPower: full.rankPower,
    swapMatrix: full.swapMatrix,
    rankCounters: full.rankCounters,
    generatedAt: new Date().toISOString()
  };
  await writeFile(path.join(out,'rank-analytics.json'),JSON.stringify(rankAnalyticsExport,null,2)+'\n');
  console.log(`RANK ANALYTICS PASS: rankPower=${full.rankPower ? Object.keys(full.rankPower).length : 0} ranks; swapMatrix=${full.swapMatrix ? Object.keys(full.swapMatrix).length : 0} entries`);
}

console.log(`OBSERVATORY ANALYTICS PASS: matches=${summaries.length}; detailed=${detailed.length}; mechanics=${full.mechanics.length}; synergies=${full.synergies.length}; hash=${full.observatoryHash}`);
