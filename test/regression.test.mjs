import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runCampaign, campaignAggregate } from '@intrilex/simulation-runtime/campaign';
import { runPolicyMatch } from '@intrilex/simulation-runtime';
import { SCORING_WEIGHTS,  scorePolicyAction,  selectPolicyAction } from '@intrilex/policies/scoring';

test('campaign policy stats are symmetric across both seats', async () => {
  const result = await runCampaign({
    profileId: 'core-advanced-authority',
    matchCount: 12,
    policyPairs: [['random-legal', 'value'], ['control', 'tempo'], ['score-rush', 'score-rush']],
    workerCount: 1,
    decisionLimit: 1800
  });
  const aggregate = campaignAggregate(result);
  const stats = aggregate.policies;
  for (const policyId of ['random-legal', 'value', 'control', 'tempo', 'score-rush']) {
    const s = stats[policyId];
    if (!s || s.games === 0) continue;
    assert.ok(s.miniTurnActions > 0, `${policyId} has zero miniTurnActions — stats may not be accumulated for both seats`);
    assert.ok(s.responsesPlayed > 0 || s.responsesDeclined >= 0, `${policyId} missing response stats`);
  }
});

test('browser autonomy runtime uses POLICY_V4 stream (parity with Node)', async () => {
  const js = await readFile('apps/lab-web/src/autonomy-runtime.js', 'utf8');
  assert.match(js, /stream:'POLICY_V4'/);
  assert.doesNotMatch(js, /stream:'POLICY_V3'/);
});

test('scoring weights are exported and contain all categories', () => {
  assert.ok(typeof SCORING_WEIGHTS === 'object');
  for (const key of ['choice', 'advanced', 'phase', 'swapBar', 'responseDecline', 'counter', 'disrupt', 'playForPoints', 'scuttle', 'draw', 'exhaustedPass', 'effect', 'default']) {
    assert.ok(key in SCORING_WEIGHTS, `missing SCORING_WEIGHTS.${key}`);
  }
  assert.equal(SCORING_WEIGHTS.phase, 5000);
  assert.equal(SCORING_WEIGHTS.exhaustedPass, -100);
  assert.equal(SCORING_WEIGHTS.choice.base.value, 820);
  assert.equal(SCORING_WEIGHTS.advanced.modeBonus.ultra, 300);
});

test('scoring with extracted weights produces identical results to hardcoded values', () => {
  const action = {
    actionId: 'score-2', family: 'score', mode: 'points', timingClass: 'ACTION',
    sourceHandles: ['C2'], targetHandles: [], featureVector: { immediateScore: 2 }
  };
  const context = {
    authorizedView: {
      own: { securedPoints: 4, goal: 21, hand: [1, 2, 3, 4] },
      knownCards: { C2: { pointValue: 2 } },
      stack: [], opponents: [{ securedPoints: 10, goal: 21 }]
    },
    actorId: 'P1'
  };
  const scoreRush = scorePolicyAction('score-rush', action, context);
  const control = scorePolicyAction('control', action, context);
  assert.equal(scoreRush, 1300 + 2 * 34);
  assert.equal(control, 650 + 2 * 12);
});

test('strategic policies let their own response resolve instead of self-countering', () => {
  const actions = [
    { actionId:'decline', family:'response-decline', mode:'decline', timingClass:'RESPONSE', sourceHandles:[], targetHandles:[], featureVector:{} },
    { actionId:'counter-own', family:'counter', mode:'ace-base', timingClass:'INSTANT', sourceHandles:['A♣'], targetHandles:['STACK-2'], featureVector:{} },
    { actionId:'ultra-own', family:'ultra', mode:'three-red-counter', timingClass:'INSTANT', sourceHandles:['A♦','4♥','6♦'], targetHandles:['STACK-2'], featureVector:{ ultra:true, multiCard:true } }
  ];
  const context = {
    actorId:'P1',
    authorizedView:{
      own:{ securedPoints:8, goal:21, hand:[] },
      knownCards:{ 'A♣':{pointValue:4}, 'A♦':{pointValue:4}, '4♥':{pointValue:4}, '6♦':{pointValue:6} },
      opponents:[{ securedPoints:10, goal:21 }],
      stack:[
        { id:'STACK-1', controllerId:'P2' },
        { id:'STACK-2', controllerId:'P1' }
      ]
    }
  };
  for (const policyId of ['control','tempo','value','score-rush']) {
    assert.equal(selectPolicyAction(policyId, actions, context).actionId, 'decline', policyId);
  }
});

test('structuredClone is skipped when telemetry is disabled', () => {
  const withTelemetry = runPolicyMatch({
    seed: 1, ordinal: 1, profileId: 'core-advanced-authority',
    seatOrder: ['P1', 'P2'], policyIds: ['random-legal', 'random-legal'],
    decisionLimit: 1800, telemetryEnabled: true
  });
  const withoutTelemetry = runPolicyMatch({
    seed: 1, ordinal: 1, profileId: 'core-advanced-authority',
    seatOrder: ['P1', 'P2'], policyIds: ['random-legal', 'random-legal'],
    decisionLimit: 1800, telemetryEnabled: false
  });
  assert.equal(withTelemetry.summary.matchResultHash, withoutTelemetry.summary.matchResultHash);
  assert.equal(withTelemetry.summary.finalStateHash, withoutTelemetry.summary.finalStateHash);
  assert.equal(withoutTelemetry.facts.decisionFacts.length, 0);
  assert.equal(withoutTelemetry.facts.stateDeltaFacts.length, 0);
  assert.ok(withTelemetry.facts.decisionFacts.length > 0);
});

test('browser analytics campaignAggregate credits both seats symmetrically', async () => {
  const { campaignAggregate } = await import('../apps/lab-web/dist/browser-analytics.js');
  const fakeSummaries = [
    { matchId:'M-1', matchOrdinal:0, seed:1, profileId:'core-advanced-authority', seatOrder:['P1','P2'], policyIds:['score-rush','control'],
      winner:'P1', winningSeat:1, terminationReason:'NORMAL_VICTORY', completedFullTurns:10, scoreMargin:3,
      miniTurnActionCount:8, responsePlayedCount:2, responseDeclinedWithOptionsCount:1, meaningfulResponseDecisionCount:3,
      privateChoiceDecisionCount:0, advancedDecisionCount:0, voltageDecisionCount:0, ultraDecisionCount:0, triggerCount:0,
      commandCount:20, eventCount:40, actionCounts:{}, decisionFamilyCounts:{}, actionModeCounts:{}, decisionModeCounts:{},
      responseActionCounts:{}, eventTypeCounts:{}, mechanicCounts:{}, matchResultHash:'h1' },
    { matchId:'M-2', matchOrdinal:1, seed:2, profileId:'core-advanced-authority', seatOrder:['P1','P2'], policyIds:['control','score-rush'],
      winner:'P2', winningSeat:2, terminationReason:'NORMAL_VICTORY', completedFullTurns:12, scoreMargin:5,
      miniTurnActionCount:6, responsePlayedCount:3, responseDeclinedWithOptionsCount:2, meaningfulResponseDecisionCount:5,
      privateChoiceDecisionCount:0, advancedDecisionCount:0, voltageDecisionCount:0, ultraDecisionCount:0, triggerCount:0,
      commandCount:25, eventCount:50, actionCounts:{}, decisionFamilyCounts:{}, actionModeCounts:{}, decisionModeCounts:{},
      responseActionCounts:{}, eventTypeCounts:{}, mechanicCounts:{}, matchResultHash:'h2' }
  ];
  const agg = campaignAggregate(fakeSummaries, { experimentHash:'test', profileId:'core-advanced-authority', engineVersion:'4.2.6', rulesVersion:'4.1.2', labVersion:'0.8.0' });
  const scoreRush = agg.policies['score-rush'];
  const control = agg.policies['control'];
  assert.ok(scoreRush.games === 2, 'score-rush should have 2 games');
  assert.ok(control.games === 2, 'control should have 2 games');
  assert.ok(scoreRush.miniTurnActions > 0, 'score-rush miniTurnActions should be credited for both seats');
  assert.ok(control.miniTurnActions > 0, 'control miniTurnActions should be credited for both seats');
  assert.ok(scoreRush.responsesPlayed > 0, 'score-rush responsesPlayed should be credited for both seats');
  assert.ok(control.responsesPlayed > 0, 'control responsesPlayed should be credited for both seats');
});

test('app.js has loading state and error boundaries', async () => {
  const appJs = await readFile('apps/lab-web/src/app.js', 'utf8');
  const stateJs = await readFile('apps/lab-web/src/state.js', 'utf8');
  // showLoading, loading-spinner, and parseNdjsonSafe were moved to state.js during decomposition
  assert.match(stateJs, /showLoading/);
  assert.match(stateJs, /loading-spinner/);
  assert.match(stateJs, /parseNdjsonSafe/);
  // Workspace error boundary remains in app.js render dispatch
  assert.match(appJs, /Workspace error/);
  // Replay-not-found handling: app.js shows "No replay loaded" empty state
  assert.match(appJs, /No replay loaded/);
});

test('app.js boot does not use raw split-map for NDJSON', async () => {
  const js = await readFile('apps/lab-web/src/app.js', 'utf8');
  const bootSection = js.slice(js.indexOf('async function boot'), js.indexOf('function renderNavigation'));
  assert.doesNotMatch(bootSection, /split\('\\\\n'\)\.map\(JSON\.parse\)/);
});

test('browser runBrowserCampaign segment execution matches full range', async () => {
  const { runBrowserCampaign } = await import('../apps/lab-web/dist/autonomy-runtime.js');
  const full = runBrowserCampaign({matchCount:10,policyIds:['score-rush','control'],seedStrategy:'ordinal-hash'});
  const seg1 = runBrowserCampaign({matchCount:10,policyIds:['score-rush','control'],seedStrategy:'ordinal-hash',ordinalStart:0,ordinalEnd:5});
  const seg2 = runBrowserCampaign({matchCount:10,policyIds:['score-rush','control'],seedStrategy:'ordinal-hash',ordinalStart:5,ordinalEnd:10});
  const merged = [...seg1.summaries, ...seg2.summaries].sort((a,b)=>a.matchOrdinal-b.matchOrdinal);
  assert.equal(merged.length, full.summaries.length, 'segment summaries count should match full');
  for (let i=0;i<merged.length;i+=1){
    assert.equal(merged[i].matchId, full.summaries[i].matchId, `match ${i} ID should match`);
    assert.equal(merged[i].matchResultHash, full.summaries[i].matchResultHash, `match ${i} hash should match`);
  }
});

test('worker.js has segment and aggregate message types for multi-worker parallelism', async () => {
  const js = await readFile('apps/lab-web/src/worker.js', 'utf8');
  assert.match(js, /run-autonomy-segment/, 'worker.js should handle run-autonomy-segment');
  assert.match(js, /run-autonomy-aggregate/, 'worker.js should handle run-autonomy-aggregate');
  assert.match(js, /autonomy-segment-result/, 'worker.js should post autonomy-segment-result');
  assert.match(js, /autonomy-aggregate-result/, 'worker.js should post autonomy-aggregate-result');
});

test('app.js spawns multiple workers when workerCount > 1', async () => {
  const workerJs = await readFile('apps/lab-web/src/worker.js', 'utf8');
  const stateJs = await readFile('apps/lab-web/src/state.js', 'utf8');
  const autonomyJs = await readFile('apps/lab-web/src/autonomy-runtime.js', 'utf8');
  // Worker spawning / segment messages were moved to worker.js during decomposition
  assert.match(workerJs, /run-autonomy-segment/, 'worker.js should handle run-autonomy-segment for parallel workers');
  assert.match(workerJs, /run-autonomy-aggregate/, 'worker.js should handle run-autonomy-aggregate to aggregate segment results');
  // campaignWorker is tracked in state.js (used by experiment-controls.js)
  assert.match(stateJs, /campaignWorker/, 'state.js should track campaignWorker');
  // ordinalStart / ordinalEnd segment boundaries are in autonomy-runtime.js
  assert.match(autonomyJs, /ordinalStart/, 'autonomy-runtime.js should accept ordinalStart for segment workers');
  assert.match(autonomyJs, /ordinalEnd/, 'autonomy-runtime.js should accept ordinalEnd for segment workers');
});

test('Defect #2: match count validation rejects invalid and exceeds-max counts', async () => {
  const js = await readFile('apps/lab-web/src/autonomy-runtime.js', 'utf8');
  assert.match(js, /MAX_BROWSER_MATCH_COUNT/, 'should define max browser match count');
  assert.match(js, /INVALID_MATCH_COUNT/, 'should throw INVALID_MATCH_COUNT for invalid input');
  assert.match(js, /MATCH_COUNT_EXCEEDS_MAXIMUM/, 'should throw MATCH_COUNT_EXCEEDS_MAXIMUM for too-large input');
  assert.match(js, /Number\.isInteger\(n\)\|\|n<1/, 'should validate positive integer');
  assert.doesNotMatch(js, /Math\.min\(1000/, 'should not have silent Math.min(1000) clamp');
});

test('Defect #2: app.js preflight validates match count and rejects outside range', async () => {
  const js = await readFile('apps/lab-web/src/experiment-controls.js', 'utf8');
  assert.match(js, /max="10000"/, 'input max should be 10000');
  assert.match(js, /INVALID_MATCH_COUNT|outside permitted range/, 'preflight should reject invalid counts');
  assert.doesNotMatch(js, /Math\.min\(1000/, 'no silent Math.min(1000) clamp');
});

test('Defect #6: match summary includes participants with per-seat attribution', async () => {
  const result = runPolicyMatch({ seed: 42, policyIds: ['random-legal', 'value'], profileId: 'core-advanced-authority', decisionLimit: 1800, includeReplay: false });
  const s = result.summary;
  assert.ok(Array.isArray(s.participants), 'summary should have participants array');
  assert.equal(s.participants.length, 2, 'should have 2 participants');
  for (const p of s.participants) {
    assert.ok(p.participantId, 'participant should have participantId');
    assert.ok(p.seat, 'participant should have seat');
    assert.ok(p.policyId, 'participant should have policyId');
    assert.ok(['win', 'loss', 'draw', 'abort'].includes(p.result), 'participant should have valid result');
    assert.equal(typeof p.miniTurnActionCount, 'number', 'participant should have miniTurnActionCount');
    assert.equal(typeof p.responsePlayCount, 'number', 'participant should have responsePlayCount');
  }
  const totalParticipantMiniTurns = s.participants.reduce((sum, p) => sum + p.miniTurnActionCount, 0);
  assert.equal(totalParticipantMiniTurns, s.miniTurnActionCount, 'participant mini-turn actions should sum to match total');
});

test('Defect #6: campaign aggregate uses participant data for per-policy attribution', async () => {
  const result = await runCampaign({
    profileId: 'core-advanced-authority',
    matchCount: 6,
    policyPairs: [['random-legal', 'value']],
    workerCount: 1,
    decisionLimit: 1800
  });
  const agg = campaignAggregate(result);
  const rl = agg.policies['random-legal'];
  const val = agg.policies['value'];
  assert.ok(rl && val, 'both policies should have stats');
  assert.equal(rl.games, 6, 'random-legal should have 6 games');
  assert.equal(val.games, 6, 'value should have 6 games');
  const totalMiniTurns = rl.miniTurnActions + val.miniTurnActions;
  const matchTotalMiniTurns = result.summaries.reduce((s, m) => s + (m.miniTurnActionCount ?? 0), 0);
  assert.equal(totalMiniTurns, matchTotalMiniTurns, 'per-policy mini-turn actions should sum to match totals (not double-counted)');
});

test('Defect #10: mechanics atlas formula hash uses immediate-point-impact not synergy-interaction', async () => {
  const { buildMechanicsAtlas, metricRegistryWithHashes } = await import('../packages/analytics/src/analytics.mjs');
  const registry = metricRegistryWithHashes();
  const summaries = [{ matchId:'M-test', mechanicCounts: { counter: 1 }, terminationReason: 'NORMAL_VICTORY', winner: 'P1', winningSeat: 1, seatOrder: ['P1','P2'], policyIds: ['random-legal','value'], profileId: 'core-advanced-authority', completedFullTurns: 10 }];
  const atlas = buildMechanicsAtlas(summaries, []);
  assert.ok(atlas.length > 0, 'should have at least one mechanic');
  const mech = atlas.find(m => m.mechanic === 'counter');
  if (mech) {
    assert.equal(mech.formulaHash, registry['immediate-point-impact'].formulaHash, 'mechanics formulaHash should be immediate-point-impact');
    assert.notEqual(mech.formulaHash, registry['synergy-interaction'].formulaHash, 'mechanics formulaHash should NOT be synergy-interaction');
  }
});

test('Defect #11: synergy analysis excludes structural/bookkeeping mechanics', async () => {
  const { analyzeSynergies } = await import('../packages/analytics/src/analytics.mjs');
  const summaries = Array.from({ length: 10 }, (_, i) => ({
    matchId: `M-${i}`, matchResultHash: `h${i}`, mechanicCounts: { counter: 1, draw: 1, discard: 1, guard: 1 },
    terminationReason: 'NORMAL_VICTORY', winner: 'P1', winningSeat: 1, seatOrder: ['P1','P2'],
    policyIds: ['random-legal','value'], profileId: 'core-advanced-authority', completedFullTurns: 10
  }));
  const synergies = analyzeSynergies(summaries, { minimumJoint: 2 });
  for (const s of synergies) {
    assert.notEqual(s.source, 'draw', 'draw should be excluded from synergy analysis');
    assert.notEqual(s.source, 'discard', 'discard should be excluded');
    assert.notEqual(s.target, 'draw', 'draw should be excluded as target');
    assert.notEqual(s.target, 'discard', 'discard should be excluded as target');
  }
});

test('Defect #12: app.js evidence links show unavailable state for missing records', async () => {
  const js = await readFile('apps/lab-web/src/workspaces/evidence.js', 'utf8');
  // Evidence workspace shows "Not reported in build" when engine test records are missing
  assert.match(js, /Not reported in build/, 'evidence workspace should show unavailable state for missing engine test records');
  // Empty-state messages for missing metric registry / capability manifest records
  assert.match(js, /No metric registry|No capability manifest/, 'should show empty-state message for missing evidence records');
});

test('Defect #15: Compare selectors default to actual dataset policies not hard-coded', async () => {
  const js = await readFile('apps/lab-web/src/workspaces/observatory.js', 'utf8');
  assert.doesNotMatch(js, /selectedPolicy\?\?'score-rush'/, 'Compare should not default left to hard-coded score-rush');
  assert.doesNotMatch(js, /comparePolicyRight\?\?'control'/, 'Compare should not default right to hard-coded control');
  assert.match(js, /policies\[0\]\?\.policyId/, 'Compare should default to first policy in dataset');
});

test('Defect #16: Evidence workspace does not hard-code engine test count', async () => {
  const js = await readFile('apps/lab-web/src/workspaces/evidence.js', 'utf8');
  assert.doesNotMatch(js, /186\/186/, 'should not hard-code 186/186 engine test count');
  assert.match(js, /engineTests/, 'should reference engineTests dynamically');
  assert.doesNotMatch(js, /'Lab','0\.6\.0'/, 'should not hard-code Lab version 0.6.0');
});

test('Defect version: all version strings updated to current release', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(pkg.version, '0.30.0', 'package.json version should be 0.28.0');
  const { LAB_VERSION, REPLAY_DATA_VERSION } = await import('../packages/simulation-runtime/src/runtime.mjs');
  // LAB_VERSION is now the product version (0.28.0), separate from REPLAY_DATA_VERSION.
  assert.equal(LAB_VERSION, '0.30.0', 'LAB_VERSION should be the product version 0.28.0');
  assert.equal(REPLAY_DATA_VERSION, '0.10.1', 'REPLAY_DATA_VERSION should be 0.10.1 for backward compatibility');
});

test('Extract: extractAnalysis produces valid AI-agent brief with all required sections', async () => {
  const { extractAnalysis, EXTRACT_VERSION } = await import('../packages/analytics/src/extract.mjs');
  const analytics = JSON.parse(await readFile('sample-data/observatory/analytics.json', 'utf8'));
  const aggregate = JSON.parse(await readFile('sample-data/autonomy/aggregate.json', 'utf8'));
  const extract = extractAnalysis({ analytics, aggregate });
  assert.equal(extract.extractVersion, EXTRACT_VERSION);
  assert.ok(extract.extractHash, 'should have extractHash');
  assert.ok(extract.sourceHash, 'should have sourceHash');
  assert.ok(extract.executiveSummary, 'should have executiveSummary');
  assert.ok(extract.executiveSummary.length > 100, 'executiveSummary should be substantive');
  assert.ok(extract.dataset, 'should have dataset');
  assert.ok(extract.dataset.matchCount > 0, 'dataset should have matchCount');
  assert.ok(Array.isArray(extract.policyFindings), 'should have policyFindings array');
  assert.ok(extract.policyFindings.length > 0, 'should have at least one policy finding');
  assert.ok(extract.policyFindings.every(p => p.summary && p.keyTraits), 'each policy finding should have summary and keyTraits');
  assert.ok(Array.isArray(extract.mechanicFindings), 'should have mechanicFindings array');
  assert.ok(extract.mechanicFindings.length > 0, 'should have at least one mechanic finding');
  assert.ok(extract.mechanicFindings.every(m => m.summary), 'each mechanic finding should have summary');
  assert.ok(Array.isArray(extract.synergyFindings), 'should have synergyFindings array');
  assert.ok(extract.synergyFindings.every(s => s.summary), 'each synergy finding should have summary');
  assert.ok(extract.anomalies, 'should have anomalies summary');
  assert.ok(extract.anomalies.summary, 'anomalies should have summary text');
  assert.ok(Array.isArray(extract.recommendations), 'should have recommendations array');
  assert.ok(extract.recommendations.length > 0, 'should have at least one recommendation');
  assert.ok(extract.interpretationBoundary, 'should have interpretationBoundary');
  assert.ok(extract.metricRegistry, 'should have metricRegistry');
});

test('Extract: CLI script generates JSON and Markdown artifacts', async () => {
  const { execSync } = await import('node:child_process');
  execSync('node scripts/extract-analysis.mjs --out sample-data/observatory/extract.test.json', { cwd: process.cwd() });
  const json = JSON.parse(await readFile('sample-data/observatory/extract.test.json', 'utf8'));
  assert.ok(json.extractHash, 'JSON extract should have extractHash');
  assert.ok(json.executiveSummary, 'JSON extract should have executiveSummary');
  execSync('node scripts/extract-analysis.mjs --markdown --out sample-data/observatory/extract.test.md', { cwd: process.cwd() });
  const md = await readFile('sample-data/observatory/extract.test.md', 'utf8');
  assert.match(md, /AI Agent Extract/, 'Markdown should have title');
  assert.match(md, /Executive Summary/, 'Markdown should have executive summary section');
  assert.match(md, /Policy Findings/, 'Markdown should have policy findings section');
  assert.match(md, /Mechanic Findings/, 'Markdown should have mechanic findings section');
  assert.match(md, /Synergy Findings/, 'Markdown should have synergy findings section');
  assert.match(md, /Recommendations/, 'Markdown should have recommendations section');
});

test('Extract: browser app.js has extract UI and command palette entries', async () => {
  const appJs = await readFile('apps/lab-web/src/app.js', 'utf8');
  const expJs = await readFile('apps/lab-web/src/experiment-controls.js', 'utf8');
  // showExtract, _extractModule, and extractAnalysis remain in app.js
  assert.match(appJs, /showExtract/, 'should have showExtract function');
  assert.match(appJs, /_extractModule/, 'should load extract module dynamically');
  assert.match(appJs, /extractAnalysis/, 'should reference extractAnalysis');
  // Command palette entries were moved to experiment-controls.js during decomposition
  assert.match(expJs, /Extract analysis \(JSON\)/, 'should have command palette entry for JSON extract');
  assert.match(expJs, /Extract analysis \(Markdown\)/, 'should have command palette entry for Markdown extract');
});

test('Extract: browser-analytics.js exports extractAnalysis', async () => {
  const js = await readFile('apps/lab-web/src/browser-analytics.js', 'utf8');
  assert.match(js, /export function extractAnalysis/, 'browser-analytics.js should export extractAnalysis');
  assert.match(js, /EXTRACT_VERSION/, 'should define EXTRACT_VERSION');
});

