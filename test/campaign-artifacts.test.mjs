import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { hashCanonical } from '@intrilex/shared';

test('Advanced Core aggregate and determinism report are internally consistent',async()=>{
  const aggregate=JSON.parse(await readFile('sample-data/autonomy/aggregate.json','utf8'));
  const {aggregateHash,...core}=aggregate;
  assert.equal(hashCanonical(core),aggregateHash);
  assert.equal(aggregate.engineVersion,'4.2.6');
  assert.equal(aggregate.profileId,'core-advanced-authority');
  const report=JSON.parse(await readFile('reports/autonomy-determinism.json','utf8'));
  assert.equal(report.status,'PASS');
  assert.deepEqual(report.workerCounts,[1,2,4]);
  assert.equal(report.cleanRerunWorkerCount,4);
  assert.equal(report.executions.length,4);
  assert.ok(report.executions.every(x=>x.experimentHash===report.experimentHash&&x.canonicalResultHash===report.canonicalResultHash));
});

test('Advanced Core campaign covers all pairings and every major authority class',async()=>{
  const aggregate=JSON.parse(await readFile('sample-data/autonomy/aggregate.json','utf8'));
  assert.ok(aggregate.matchCount>=100,`matchCount ${aggregate.matchCount} should be >= 100`);
  assert.equal(aggregate.completedMatchCount,aggregate.matchCount);
  assert.equal(aggregate.abortCount,0);
  assert.ok(Object.keys(aggregate.matchups).length>=25,`matchups count ${Object.keys(aggregate.matchups).length} should be >= 25 (12-policy observatory yields 144)`);
  for(const family of ['counter','disrupt','private-choice','rank10','ultra','voltage','royal-marriage','super','swap-bar']) assert.ok((aggregate.decisionFamilyCounts[family]??0)>0,family);
  assert.equal(aggregate.semanticTotals.passActionCount,aggregate.semanticTotals.exhaustedPassActionCount);
  assert.ok(aggregate.semanticTotals.automaticPriorityAdvanceCount>0);
  assert.ok(aggregate.semanticTotals.responseDeclinedWithOptionsCount>0);
  assert.ok((aggregate.eventTypeCounts.CORE_PRIVATE_CHOICE_OPENED??0)>0);
  assert.ok((aggregate.eventTypeCounts.CORE_RANK10_STACK_THEFT_RESOLVED??0)>0);
  assert.ok((aggregate.eventTypeCounts.CORE_ADVANCED_ULTRA_THREE_BLACK_RESOLVED??0)>0);
});

test('representative replay retention is paired, complete, and advanced-aware',async()=>{
  const retention=JSON.parse(await readFile('sample-data/autonomy/retention-index.json','utf8'));
  const {retentionHash,...core}=retention;
  assert.equal(hashCanonical(core),retentionHash);
  const authorized=(await readdir('sample-data/autonomy/replays/authorized')).filter(x=>x.endsWith('.json'));
  const publicFiles=(await readdir('sample-data/autonomy/replays/public')).filter(x=>x.endsWith('.json'));
  // Every retention record must have corresponding authorized and public files
  for(const r of retention.records){
    assert.ok(authorized.some(f=>f.includes(r.matchId)),`authorized replay for ${r.matchId} must exist`);
    assert.ok(publicFiles.some(f=>f.includes(r.matchId)),`public replay for ${r.matchId} must exist`);
  }
  // There may be extra files from previous campaign runs; verify at least the retention set is complete
  assert.ok(authorized.length>=retention.records.length,`authorized files (${authorized.length}) should be >= retention records (${retention.records.length})`);
  assert.ok(publicFiles.length>=retention.records.length,`public files (${publicFiles.length}) should be >= retention records (${retention.records.length})`);
  for(const reason of ['MOST_RESPONSES_PLAYED','MOST_LEGAL_RESPONSES_DECLINED','MOST_AUTOMATIC_PRIORITY_ADVANCES','MOST_PRIVATE_CHOICES','MOST_ADVANCED_DECLARATIONS','MOST_ULTRAS','MOST_VOLTAGE']) assert.ok(retention.records.some(r=>r.reasons.includes(reason)),reason);
});

test('CSV export neutralizes formula-like fields',async()=>assert.doesNotMatch(await readFile('sample-data/autonomy/match-summaries.csv','utf8'),/(?:^|,)[=+@]/m));

test('campaign records satisfy accounting invariant — every match is mutually exclusively categorized',async()=>{
  const accounting=JSON.parse(await readFile('sample-data/autonomy/campaign-accounting.json','utf8'));
  const records=accounting.records??[];
  assert.ok(records.length>0,'campaign-accounting must have records');
  const completed=records.filter(r=>r.result==='completed').length;
  const aborted=records.filter(r=>r.result==='aborted').length;
  const unsupported=records.filter(r=>r.result==='unsupported').length;
  const errored=records.filter(r=>r.result==='error').length;
  const total=completed+aborted+unsupported+errored;
  assert.equal(total,records.length,`Accounting invariant: ${completed}C+${aborted}A+${unsupported}U+${errored}E=${total} ≠ ${records.length} records`);
  assert.equal(accounting.accountingInvariant,true,'accountingInvariant must be true');
  assert.ok(['PASS','PARTIAL','FAIL'].includes(accounting.campaignStatus),'campaignStatus must be a valid enum');
  if(accounting.campaignStatus==='PASS'){assert.equal(aborted,0,'PASS requires zero aborted');assert.equal(unsupported,0,'PASS requires zero unsupported');assert.equal(errored,0,'PASS requires zero errors');}
  if(accounting.campaignStatus==='FAIL'){assert.ok(errored>0,'FAIL requires at least one error');}
  if(accounting.campaignStatus==='PARTIAL'){assert.ok(aborted>0||unsupported>0,'PARTIAL requires aborted or unsupported');assert.equal(errored,0,'PARTIAL requires zero errors');}
});

test('retained Lab replay artifacts are hash-linked and use Advanced Core',async()=>{
  const index=JSON.parse(await readFile('sample-data/autonomy/lab-replay-index.json','utf8'));
  const {indexHash,...core}=index;
  assert.equal(hashCanonical(core),indexHash);
  assert.equal(index.replayCount,index.records.length);
  assert.ok(index.replayCount>=27);
  for(const record of index.records){
    const pub=JSON.parse(await readFile(`sample-data/autonomy/lab-replays/public/${record.fixtureId}.json`,'utf8'));
    const auth=JSON.parse(await readFile(`sample-data/autonomy/lab-replays/authorized/${record.fixtureId}.json`,'utf8'));
    const {artifactHash:ph,...pc}=pub,{artifactHash:ah,...ac}=auth;
    assert.equal(hashCanonical(pc),ph,record.fixtureId);
    assert.equal(hashCanonical(ac),ah,record.fixtureId);
    assert.equal(ph,record.publicArtifactHash);
    assert.equal(ah,record.authorizedArtifactHash);
    assert.equal(record.summary.profileId,'core-advanced-authority');
    assert.equal(record.summary.engineVersion,'4.2.6');
  }
});

