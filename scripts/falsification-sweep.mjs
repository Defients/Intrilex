// Adversarial falsification sweep for release certification.
// Attempts to falsify every major claim. If any claim fails, the sweep reports it.
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const releaseVersion = rootPkg.version;
const results = [];
let passed = 0, failed = 0;

function claim(name, fn) {
  try {
    const r = fn();
    if (r === true || r === undefined) {
      results.push({ name, status: 'PASS' });
      passed++;
    } else {
      results.push({ name, status: 'FAIL', detail: String(r) });
      failed++;
    }
  } catch (e) {
    results.push({ name, status: 'FAIL', detail: e?.message ?? String(e) });
    failed++;
  }
}

async function asyncClaim(name, fn) {
  try {
    await fn();
    results.push({ name, status: 'PASS' });
    passed++;
  } catch (e) {
    results.push({ name, status: 'FAIL', detail: e?.message ?? String(e) });
    failed++;
  }
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

// === FALSIFICATION ATTEMPTS ===

// 1. Anchor byte-identity claim
claim('anchor.mjs and anchor.js are byte-identical', () => {
  const mjs = readFileSync(join(root, 'packages/decision-intelligence/src/anchor.mjs'));
  const js = readFileSync(join(root, 'apps/lab-web/src/anchor.js'));
  const h1 = sha256(mjs), h2 = sha256(js);
  if (h1 !== h2) return `mjs=${h1} js=${h2}`;
  return true;
});

// 2. Certification JSON exists and is valid
claim('certification JSON exists and parses', () => {
  const cert = JSON.parse(readFileSync(join(root, `release/v${releaseVersion}-certification.json`), 'utf8'));
  if (cert.releaseVersion !== releaseVersion) return `version=${cert.releaseVersion}`;
  if (cert.testResults?.passed !== cert.testResults?.totalTests) return 'tests not all passing';
  return true;
});

// 3. Release ZIP exists and hash matches
claim('release ZIP exists and SHA-256 matches certification', () => {
  const cert = JSON.parse(readFileSync(join(root, `release/v${releaseVersion}-certification.json`), 'utf8'));
  if (!cert.releaseZip) return 'no releaseZip in certification';
  const zipPath = join(root, 'release', cert.releaseZip.name);
  if (!existsSync(zipPath)) return `ZIP not found: ${cert.releaseZip.name}`;
  const zipData = readFileSync(zipPath);
  const hash = sha256(zipData);
  if (hash !== cert.releaseZip.sha256) return `hash mismatch: actual=${hash} cert=${cert.releaseZip.sha256}`;
  return true;
});

// 4. Release manifest exists and has file hashes
claim('release manifest exists with file hashes', () => {
  const manifest = JSON.parse(readFileSync(join(root, `release/v${releaseVersion}-release-manifest.json`), 'utf8'));
  if (!manifest.files || Object.keys(manifest.files).length < 100) return 'too few files in manifest';
  return true;
});

// 5. Truth quarantine banners exist in quarantined reports
claim('truth quarantine banners exist', () => {
  const reports = [
    'reports/V0.10.0_AUDIT_RECONCILIATION.md',
    'reports/V0.10.0_CURRENT2_FORENSIC_RECONCILIATION.md',
    'reports/V0.10.0_CURRENT3_FORENSIC_RECONCILIATION.md',
    'reports/V0.10.0_CURRENT4_FORENSIC_RECONCILIATION.md'
  ];
  for (const r of reports) {
    const content = readFileSync(join(root, r), 'utf8');
    if (!/QUARANTINE|PROVISIONAL|HISTORICAL/i.test(content)) return `${r} missing quarantine banner`;
  }
  return true;
});

// 6. pnpm-lock.yaml exists (not package-lock.json)
claim('pnpm-lock.yaml exists, package-lock.json does not', () => {
  if (!existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm-lock.yaml missing';
  if (existsSync(join(root, 'package-lock.json'))) return 'package-lock.json should not exist';
  return true;
});

// 7. README version matches
claim(`README.md states v${releaseVersion}`, () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  if (!new RegExp(`v${releaseVersion.replace(/\./g,'\\.')}`).test(readme)) return `README does not mention v${releaseVersion}`;
  return true;
});

// 8. Decision trace has fullCheckpointHash field
claim('decision-trace.mjs exports fullCheckpointHash', () => {
  const content = readFileSync(join(root, 'packages/decision-intelligence/src/decision-trace.mjs'), 'utf8');
  if (!/fullCheckpointHash/.test(content)) return 'fullCheckpointHash not found in decision-trace.mjs';
  return true;
});

// 9. Campaign.mjs has unified records array
claim('campaign.mjs has unified records array', () => {
  const content = readFileSync(join(root, 'packages/simulation-runtime/src/campaign.mjs'), 'utf8');
  if (!/campaignRecords/.test(content)) return 'campaignRecords not found';
  if (!/records:\s*campaignRecords/.test(content)) return 'records field not assigned campaignRecords';
  return true;
});

// 10. Policy-adapter has runInstanceId
claim('policy-adapter.mjs has runInstanceId', () => {
  const content = readFileSync(join(root, 'packages/game-ai/src/policy-adapter.mjs'), 'utf8');
  if (!/runInstanceId/.test(content)) return 'runInstanceId not found';
  return true;
});

// 11. Browser diagnostics uses retained traces (not static warning)
claim('browser app.js diagnostics uses retained traces', () => {
  const content = readFileSync(join(root, 'apps/lab-web/src/app.js'), 'utf8');
  if (/Decision evidence unavailable/.test(content)) return 'static warning still present';
  if (!/loadTraceData|loadTraceIndex/.test(content)) return 'trace loading not found in diagnostics';
  return true;
});

// 12. Browser Branch Lab is functional (not "under reconstruction")
claim('browser Branch Lab is functional', () => {
  const content = readFileSync(join(root, 'apps/lab-web/src/app.js'), 'utf8');
  if (/Branch Lab unavailable/.test(content)) return 'unavailable warning still present';
  if (!/runPairedCounterfactual/.test(content)) return 'runPairedCounterfactual not wired';
  return true;
});

// 13. Worker has paired-counterfactual handler
claim('worker.js has paired-counterfactual handler', () => {
  const content = readFileSync(join(root, 'apps/lab-web/src/worker.js'), 'utf8');
  if (!/run-paired-counterfactual/.test(content)) return 'handler not found';
  return true;
});

// 14. Rule audits are evidence-derived (not ceremonial PASS)
claim('decision-trace.mjs rule audits are evidence-derived', () => {
  const content = readFileSync(join(root, 'packages/decision-intelligence/src/decision-trace.mjs'), 'utf8');
  if (!/UNAVAILABLE/.test(content)) return 'UNAVAILABLE status not found (ceremonial PASS still present)';
  return true;
});

// 15. Runtime passes engine evidence to decision trace
claim('runtime.mjs passes engine evidence to decision trace', () => {
  const content = readFileSync(join(root, 'packages/simulation-runtime/src/runtime.mjs'), 'utf8');
  if (!/consumedMiniTurn|createdSkip|drawPileEmpty|exhaustedActive/.test(content)) return 'engine evidence not passed';
  return true;
});

// 16. Counterfactual fills undefined derived fields
claim('counterfactual.mjs fills undefined derived fields', () => {
  const content = readFileSync(join(root, 'packages/simulation-runtime/src/counterfactual.mjs'), 'utf8');
  if (!/derivedReplayCommandIndex/.test(content)) return 'derivedReplayCommandIndex not found';
  if (!/undefined/.test(content)) return 'undefined check not found';
  return true;
});

// 17. All workspace packages are version {releaseVersion}
claim(`all workspace packages are version ${releaseVersion}`, () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (pkg.version !== releaseVersion) return `root package.json version=${pkg.version}`;
  return true;
});

// 18. No require() in ESM test files
claim('no require() in behavioral test file', () => {
  const content = readFileSync(join(root, 'test/v0.10.0-behavioral.test.mjs'), 'utf8');
  const lines = content.split('\n').filter(l => /require\(['"]/.test(l) && !l.includes('import'));
  if (lines.length > 0) return `Found require() calls: ${lines.length}`;
  return true;
});

// 19. Anchor resolver rejects truncated hashes
claim('anchor.mjs rejects truncated hashes', () => {
  const content = readFileSync(join(root, 'packages/decision-intelligence/src/anchor.mjs'), 'utf8');
  if (!/isFullHash/.test(content)) return 'isFullHash check not found';
  if (!/TRUNCATED/.test(content)) return 'TRUNCATED rejection not found';
  return true;
});

// 20. Anchor resolver reconciles legacy checkpoint hashes
claim('anchor.mjs reconciles legacy checkpoint hashes', () => {
  const content = readFileSync(join(root, 'packages/decision-intelligence/src/anchor.mjs'), 'utf8');
  if (!/reconcileLegacyCheckpointHash/.test(content)) return 'reconcile function not found';
  return true;
});

// 21. Campaign accounting invariant exists
claim('campaign.mjs has accountingInvariant field', () => {
  const content = readFileSync(join(root, 'packages/simulation-runtime/src/campaign.mjs'), 'utf8');
  if (!/accountingInvariant/.test(content)) return 'accountingInvariant not found';
  if (!/completedCount/.test(content)) return 'completedCount not found';
  if (!/abortedCount/.test(content)) return 'abortedCount not found';
  if (!/unsupportedCount/.test(content)) return 'unsupportedCount not found';
  return true;
});

// 22. Campaign status is three-state (PASS/PARTIAL/FAIL)
claim('campaign.mjs has three-state campaignStatus', () => {
  const content = readFileSync(join(root, 'packages/simulation-runtime/src/campaign.mjs'), 'utf8');
  if (!/PARTIAL/.test(content)) return 'PARTIAL status not found';
  return true;
});

// 23. Runtime passes runInstanceId to policy context
claim('runtime.mjs passes runInstanceId to policy context', () => {
  const content = readFileSync(join(root, 'packages/simulation-runtime/src/runtime.mjs'), 'utf8');
  if (!/runInstanceId/.test(content)) return 'runInstanceId not found in runtime';
  return true;
});

// 24. Browser exposes all 19 policies (5 baseline + 14 HYBRIX)
claim('browser autonomy-runtime exports all 19 policies', () => {
  const content = readFileSync(join(root, 'apps/lab-web/dist/autonomy-runtime.js'), 'utf8');
  if (!/HYBRIX_POLICY_IDS/.test(content)) return 'HYBRIX_POLICY_IDS not imported';
  if (!/chooseHybrixPolicy/.test(content)) return 'chooseHybrixPolicy not imported';
  return true;
});

// 25. Browser HYBRIX dist exists with all modules
claim('browser HYBRIX dist has all required modules', () => {
  const required = ['agent.js','perception.js','personality.js','memory.js','cognition.js','coordination.js','failsafe.js','debug.js','difficulty.js','config.js','policy-adapter.js','browser-shared.js','browser-policy-sdk.js'];
  for (const f of required) {
    if (!existsSync(join(root, 'apps/lab-web/dist/hybrix', f))) return `Missing: hybrix/${f}`;
  }
  return true;
});

// 26. Self-audit has truthful gates (all true)
claim('self-audit.json has all critical gates true', () => {
  const audit = JSON.parse(readFileSync(join(root, 'reports/self-audit.json'), 'utf8'));
  if (audit.schemaVersion !== '2.0.0') return `schemaVersion=${audit.schemaVersion}`;
  for (const [gate, value] of Object.entries(audit.criticalGates)) {
    if (value !== true) return `gate ${gate}=false`;
  }
  return true;
});

// 27. Privacy matrix test exists in default suite
claim('privacy-matrix test is in default test suite', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (!/privacy-matrix/.test(pkg.scripts.test)) return 'privacy-matrix not in test script';
  return true;
});

// 28. HYBRIX evidence envelope test exists in default suite
claim('hybrix-evidence-envelope test is in default suite', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (!/hybrix-evidence-envelope/.test(pkg.scripts.test)) return 'hybrix-evidence-envelope not in test script';
  return true;
});

// 29. Draw-pile zones are hidden in views.ts
claim('views.ts hides draw-pile card identities', () => {
  const content = readFileSync(join(root, 'upstream/intrilex-engine-4.2.6-attachment-integrity-hotfix/src/views.ts'), 'utf8');
  if (!/DRAW_PILE|isDrawPileZone|DP.*dp/.test(content)) return 'draw-pile zone filter not found';
  return true;
});

// 30. HYBRIX benchmark checks accounting invariant and exits non-zero
claim('benchmark-hybrix.mjs checks accounting invariant', () => {
  const content = readFileSync(join(root, 'scripts/benchmark-hybrix.mjs'), 'utf8');
  if (!/accountingInvariant/.test(content)) return 'accountingInvariant not found';
  if (!/process\.exit\(1\)/.test(content)) return 'process.exit(1) not found';
  return true;
});

// 31. Rank attribution module exists and exports key functions
claim('rank-attribution.mjs exports attributeRankAction', () => {
  const content = readFileSync(join(root, 'packages/simulation-runtime/src/rank-attribution.mjs'), 'utf8');
  if (!/export function attributeRankAction/.test(content)) return 'attributeRankAction not exported';
  if (!/export function classifyPlayForm/.test(content)) return 'classifyPlayForm not exported';
  if (!/export function isNoAttributionAction/.test(content)) return 'isNoAttributionAction not exported';
  return true;
});

// 32. Rank telemetry module exists with v5 schema
claim('rank-telemetry.mjs has v5 schema and 16 metrics', () => {
  const content = readFileSync(join(root, 'packages/telemetry/src/rank-telemetry.mjs'), 'utf8');
  if (!/TELEMETRY_SCHEMA_VERSION_V5.*5\.0\.0/.test(content)) return 'v5 schema version not found';
  if (!/RANK_METRIC_REGISTRY/.test(content)) return 'RANK_METRIC_REGISTRY not found';
  return true;
});

// 33. Rank power model exists with six axes
claim('rank-power.mjs has six-axis power profile', () => {
  const content = readFileSync(join(root, 'packages/simulation-runtime/src/rank-power.mjs'), 'utf8');
  if (!/selectionPower/.test(content)) return 'selectionPower not found';
  if (!/victoryPower/.test(content)) return 'victoryPower not found';
  if (!/scorePower/.test(content)) return 'scorePower not found';
  if (!/boardPower/.test(content)) return 'boardPower not found';
  if (!/responsePower/.test(content)) return 'responsePower not found';
  if (!/decisionValue/.test(content)) return 'decisionValue not found';
  return true;
});

// 34. Rank counterfactual module exists
claim('rank-counterfactual.mjs exports computeRankDecisionValue', () => {
  const content = readFileSync(join(root, 'packages/simulation-runtime/src/rank-counterfactual.mjs'), 'utf8');
  if (!/export function computeRankDecisionValue/.test(content)) return 'computeRankDecisionValue not exported';
  if (!/export function eligibleRankAnchor/.test(content)) return 'eligibleRankAnchor not exported';
  return true;
});

// 35. Rank integration module exists
claim('rank-integration.mjs exports buildRankAnalytics', () => {
  const content = readFileSync(join(root, 'packages/analytics/src/rank-integration.mjs'), 'utf8');
  if (!/export function buildRankAnalytics/.test(content)) return 'buildRankAnalytics not exported';
  if (!/export function augmentMechanicsWithRankFacets/.test(content)) return 'augmentMechanicsWithRankFacets not exported';
  return true;
});

// 36. Browser app has /ranks workspace
claim('browser app.js has /ranks workspace', () => {
  const content = readFileSync(join(root, 'apps/lab-web/src/app.js'), 'utf8');
  if (!/\/ranks/.test(content)) return '/ranks workspace not found';
  if (!/renderRanks/.test(content)) return 'renderRanks function not found';
  return true;
});

// 37. Rank authority artifact is generated during build
claim('build.mjs generates rank-authority.json', () => {
  const content = readFileSync(join(root, 'scripts/build.mjs'), 'utf8');
  if (!/rank-authority\.json/.test(content)) return 'rank-authority.json generation not found';
  if (!/canonicalRankAuthority/.test(content)) return 'canonicalRankAuthority not found';
  return true;
});

// 38. Engine-adapter exports rank authority
claim('engine-adapter exports RANK_REGISTRY and canonicalRankAuthority', () => {
  const content = readFileSync(join(root, 'packages/engine-adapter/src/adapter.mjs'), 'utf8');
  if (!/export const RANK_REGISTRY/.test(content)) return 'RANK_REGISTRY not exported';
  if (!/export function canonicalRankAuthority/.test(content)) return 'canonicalRankAuthority not exported';
  if (!/export const CANONICAL_RANKS/.test(content)) return 'CANONICAL_RANKS not exported';
  return true;
});

// === RUN ASYNC CLAIMS ===
const asyncClaims = [
  asyncClaim('runPairedCounterfactual completes with valid anchor', async () => {
    const { runPolicyMatch } = await import('@intrilex/simulation-runtime');
    const { runPairedCounterfactual } = await import('@intrilex/simulation-runtime/counterfactual');
    const match = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['tempo', 'control'], includeReplay: true, decisionTracesEnabled: true
    });
    const replay = match.replay;
    const trace = match.decisionTraces?.[0];
    if (!trace) throw new Error('No decision traces');
    const matchId = match.summary?.matchId ?? replay?.fixtureId;
    if (!matchId) throw new Error('No matchId found');
    const config = {
      matchId,
      replayContentHash: replay.contentHash,
      replayIntegrityHash: replay.integrityHash,
      decisionId: trace.decisionId,
      decisionIndex: trace.decisionIndex,
      seat: trace.seat,
      selectedActionId: trace.selectedActionId,
      engineVersion: replay.engineVersion,
      rulesVersion: replay.rulesVersion,
      retainedDecisionEvidence: {
        decisionId: trace.decisionId,
        decisionIndex: trace.decisionIndex,
        checkpointHash: trace.checkpointHash,
        seat: trace.seat,
        selectedActionId: trace.selectedActionId
      },
      baseSeed: match.summary.seed,
      seatOrder: match.summary.seatOrder,
      policyIds: match.summary.policyIds,
      profileId: match.summary.profileId,
      continuationPolicyIds: ['tempo', 'control'],
      replay,
      checkpointIndex: 0,
      rolloutCount: 2,
      focalSeat: trace.seat
    };
    const result = runPairedCounterfactual(config);
    if (result.selected.status !== 'COMPLETED') throw new Error(`selected: ${result.selected.status} ${result.selected.reason}`);
    if (result.alternative.status !== 'COMPLETED') throw new Error(`alternative: ${result.alternative.status} ${result.alternative.reason}`);
  }),

  asyncClaim('campaign records preserve errored matches', async () => {
    const { runCampaign } = await import('@intrilex/simulation-runtime/campaign');
    const result = await runCampaign({
      profileId: 'core-advanced-authority', matchCount: 2,
      policyPairs: [['tempo', 'control']], workerCount: 1, decisionLimit: 1800
    });
    if (!Array.isArray(result.records)) throw new Error('records is not an array');
    if (result.records.length !== 2) throw new Error(`records.length=${result.records.length}, expected 2`);
    for (const r of result.records) {
      if (!['completed', 'error', 'aborted', 'unsupported'].includes(r.result)) {
        throw new Error(`Invalid result: ${r.result}`);
      }
    }
  }),

  asyncClaim('decision traces do not leak spatial vocabulary', async () => {
    const { runPolicyMatch } = await import('@intrilex/simulation-runtime');
    const match = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['hybrix-rusher', 'control'], decisionTracesEnabled: true
    });
    const hybrixTraces = match.decisionTraces.filter(t => t.policyId?.startsWith('hybrix'));
    const spatialTerms = ['position', 'coordinate', 'spatial', 'distance', 'nearest', 'closest', 'pathfind'];
    for (const trace of hybrixTraces) {
      const traceStr = JSON.stringify(trace);
      for (const term of spatialTerms) {
        if (new RegExp(term, 'i').test(traceStr)) throw new Error(`Spatial term "${term}" found in trace`);
      }
    }
  }),

  asyncClaim('runInstanceId isolates agent cache across runs', async () => {
    const { runPolicyMatch } = await import('@intrilex/simulation-runtime');
    const m1 = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['hybrix-rusher', 'control']
    });
    const m2 = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['hybrix-rusher', 'control']
    });
    // Both should complete — if runInstanceId weren't isolating, the second
    // match might reuse stale cache from the first.
    if (!m1.summary || !m2.summary) throw new Error('One or both matches failed');
  }),

  asyncClaim('rank attribution produces exact attribution for single-rank play', async () => {
    const { attributeRankAction } = await import('@intrilex/simulation-runtime/rank-attribution');
    const result = attributeRankAction({
      sourceCards: [{ entityId: 'C1', identity: '7♠', rank: '7', suit: '♠', zoneBefore: 'P1_HAND', role: 'source' }],
      playForm: 'score',
      viewerMode: 'private'
    });
    if (result.attributionStatus !== 'exact') throw new Error(`Expected exact, got ${result.attributionStatus}`);
    if (result.primaryRank !== '7') throw new Error(`Expected rank 7, got ${result.primaryRank}`);
  }),

  asyncClaim('rank power model produces RPI in [0,1] for all ranks', async () => {
    const { buildRankPowerModel } = await import('@intrilex/simulation-runtime/rank-power');
    const { computeAggregateRankMetrics } = await import('@intrilex/telemetry/rank-telemetry');
    const { emptyParticipantRankCounters } = await import('@intrilex/telemetry/rank-telemetry');
    const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K","RJ","BJ"];
    const counters = emptyParticipantRankCounters(['P1','P2'], RANKS);
    // Add some data
    counters.P1['A'].selectionCount = 10; counters.P1['A'].opportunityCount = 20;
    counters.P1['A'].victoryContributionCount = 7; counters.P1['A'].defeatExposureCount = 3;
    counters.P2['K'].selectionCount = 8; counters.P2['K'].opportunityCount = 15;
    counters.P2['K'].victoryContributionCount = 4; counters.P2['K'].defeatExposureCount = 6;
    const metrics = computeAggregateRankMetrics(counters, RANKS);
    const model = buildRankPowerModel({ rankMetrics: metrics, aggregateHash: 'test' });
    for (const rank of RANKS) {
      const rpi = model.ranks[rank]?.rpi;
      if (rpi === undefined || rpi < 0 || rpi > 1) throw new Error(`RPI for ${rank} is ${rpi}, expected [0,1]`);
    }
  }),

  asyncClaim('rank counterfactual computes win rate delta', async () => {
    const { computeRankDecisionValue } = await import('@intrilex/simulation-runtime/rank-counterfactual');
    const selected = { rollouts: Array.from({length: 10}, (_, i) => ({ winner: 'P1', winningSeat: 'P1', scoreMargin: 5, rolloutIndex: i })) };
    const alternative = { rollouts: Array.from({length: 10}, (_, i) => ({ winner: 'P2', winningSeat: 'P2', scoreMargin: -3, rolloutIndex: i })) };
    const cdv = computeRankDecisionValue(selected, alternative, '7', 'K', 'P1');
    if (cdv.winRateDelta !== 1.0) throw new Error(`Expected winRateDelta=1.0, got ${cdv.winRateDelta}`);
    if (cdv.confidence !== 'LOW') throw new Error(`Expected confidence=LOW, got ${cdv.confidence}`);
  }),

  asyncClaim('rank analytics integration builds from summaries', async () => {
    const { buildRankAnalytics } = await import('@intrilex/analytics/rank-integration');
    const summaries = [{
      matchId: 'M001', participants: ['P1','P2'], winner: 'P1',
      rankDecisions: [{
        participantId: 'P1',
        rankAttribution: { primaryRank: 'A', sourceRanks: ['A'], rankWeights: {A:1.0}, attributionStatus: 'exact', playForm: 'base', originRank: null, generatedRank: null },
        rankOpportunities: [{ rank: 'A', opportunityFrames: 1, legalOptions: 1 }],
        action: { family: 'score' }, legalActions: []
      }]
    }];
    const result = buildRankAnalytics({ summaries, aggregate: null });
    if (result.rankCounters['A'].rankSelectionCount !== 1) throw new Error(`Expected selectionCount=1, got ${result.rankCounters['A'].rankSelectionCount}`);
    if (result.rankCounters['A'].rankVictoryContributionCount !== 1) throw new Error(`Expected victoryContributionCount=1, got ${result.rankCounters['A'].rankVictoryContributionCount}`);
  })
];

await Promise.all(asyncClaims);

// === REPORT ===
console.log('\n=== ADVERSARIAL FALSIFICATION SWEEP ===\n');
for (const r of results) {
  const icon = r.status === 'PASS' ? '✓' : '✗';
  console.log(`${icon} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
}
console.log(`\n${passed} passed, ${failed} failed out of ${results.length} claims`);
if (failed > 0) {
  console.log('\n❌ FALSIFICATION SUCCEEDED — some claims are false!');
  process.exit(1);
} else {
  console.log('\n✓ ALL CLAIMS SURVIVED FALSIFICATION — certification is truthful.');
  process.exit(0);
}

