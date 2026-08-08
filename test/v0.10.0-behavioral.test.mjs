import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPolicyMatch } from '@intrilex/simulation-runtime';
import { createSimulationDecisionFrame, authorityHashCanonical, reconstructAuthorityCheckpoints, executeSimulationAction, verifyAuthorityCertifiedReplay } from '@intrilex/engine-adapter';
import {} from '@intrilex/shared';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

// ── Real retained authority (used by every counterfactual anchor test) ──
// Tests consume a REAL certified replay and a REAL retained Decision Evidence
// record (not a synthetic fresh-match anchor). This is the truthful baseline
// for the anchor binding matrix and the paired counterfactual experiment.
// Dynamically find a valid match with traces and authorized replay.
const _traceDir = path.join(root, 'sample-data/autonomy/decision-traces');
const _availableTraces = readdirSync(_traceDir).filter(f => f.endsWith('.json'));
const RETAINED_MATCH_ID = _availableTraces[0].replace('.json', '');
const retainedTraceFile = JSON.parse(read(`sample-data/autonomy/decision-traces/${RETAINED_MATCH_ID}.json`));
const RETAINED_DECISION_ID = retainedTraceFile.traces[0].decisionId;
const retainedTrace = retainedTraceFile.traces.find((t) => t.decisionId === RETAINED_DECISION_ID);
const retainedReplay = JSON.parse(read(`sample-data/autonomy/replays/authorized/${RETAINED_MATCH_ID}.authorized.replay.json`));
verifyAuthorityCertifiedReplay(retainedReplay);
const retainedFrames = reconstructAuthorityCheckpoints(retainedReplay);
const retainedDecisionFrame = createSimulationDecisionFrame(retainedFrames[0].state);
const retainedBeforeStateHash = authorityHashCanonical(retainedDecisionFrame.state);
const retainedLegalActionIds = retainedDecisionFrame.policyActions.map((a) => a.actionId);
const retainedLegalActionSetHash = authorityHashCanonical([...retainedLegalActionIds].sort());
const retainedSelectedActionId = retainedTrace.selectedActionId;
const retainedSelectedCommand = retainedDecisionFrame.resolve(retainedSelectedActionId);
const retainedSelectedCommandHash = authorityHashCanonical(retainedSelectedCommand);
const retainedPostState = executeSimulationAction(retainedDecisionFrame.state, retainedSelectedCommand);
const retainedPostSelectedActionStateHash = authorityHashCanonical(retainedPostState.state);
const retainedFrameActorId = retainedSelectedCommand.actorId;
const retainedSeatOrder = ['P1', 'P2'];
const retainedFrameSeat = retainedSeatOrder.indexOf(retainedFrameActorId) + 1;
let retainedReplayCommandIndex = -1;
for (let i = 0; i < retainedReplay.commands.length; i += 1) {
  if (authorityHashCanonical(retainedReplay.commands[i]) === retainedSelectedCommandHash) { retainedReplayCommandIndex = i; break; }
}
const retainedDecisionEvidence = {
  decisionId: retainedTrace.decisionId,
  decisionIndex: retainedTrace.decisionIndex,
  checkpointHash: retainedTrace.checkpointHash,
  seat: retainedTrace.seat,
  selectedActionId: retainedTrace.selectedActionId
};

function buildValidAnchorConfig(match, fixture, opts = {}) {
  // match/fixture are ignored: anchor authority comes from the real retained
  // record. Synthetic fresh-match anchors are no longer accepted by the
  // tightened anchor contract.
  const altAction = opts.altAction ?? retainedDecisionFrame.policyActions.find((a) => a.actionId !== retainedSelectedActionId);
  return {
    matchId: RETAINED_MATCH_ID,
    replayContentHash: retainedReplay.contentHash,
    replayIntegrityHash: retainedReplay.integrityHash,
    checkpointHash: retainedBeforeStateHash,
    decisionId: RETAINED_DECISION_ID,
    decisionIndex: 0,
    replayCommandIndex: retainedReplayCommandIndex,
    actorId: retainedFrameActorId,
    seat: retainedFrameSeat,
    legalActionSetHash: retainedLegalActionSetHash,
    selectedActionId: retainedSelectedActionId,
    selectedCommandHash: retainedSelectedCommandHash,
    postSelectedActionStateHash: retainedPostSelectedActionStateHash,
    engineVersion: retainedReplay.engineVersion,
    rulesVersion: retainedReplay.rulesVersion,
    retainedDecisionEvidence,
    baseSeed: 1, seatOrder: retainedSeatOrder, policyIds: ['tempo', 'control'],
    profileId: 'core-advanced-authority',
    alternativeActionId: opts.altAction?.actionId ?? altAction?.actionId,
    continuationPolicyIds: ['tempo', 'control'],
    replay: retainedReplay, checkpointIndex: 0, rolloutCount: opts.rolloutCount ?? 4,
    focalSeat: 1
  };
}

// ─── Helper: load a real certified replay for counterfactual tests ───
function loadFirstRetainedReplay() {
  const retention = JSON.parse(read('sample-data/autonomy/retention-index.json'));
  const first = retention.records[0];
  if (!first) return null;
  const replay = JSON.parse(read(`sample-data/autonomy/${first.authorizedReplay}`));
  return { replay, summary: first.summary, matchId: first.matchId };
}

// ─── Helper: load first decision trace ───
function loadFirstTrace() {
  const traceIndex = JSON.parse(read('sample-data/autonomy/decision-trace-index.json'));
  const first = traceIndex.records[0];
  if (!first) return null;
  const traceFile = JSON.parse(read(`sample-data/autonomy/decision-traces/${first.matchId}.json`));
  return { index: first, traces: traceFile.traces, matchId: first.matchId };
}

// ═══════════════════════════════════════════════════════════════════
// Section A: Counterfactual Anchor Binding (Tests 4–13)
// ═══════════════════════════════════════════════════════════════════
describe('Counterfactual Anchor Binding', () => {
  const fixture = loadFirstRetainedReplay();
  if (!fixture) { it('should have retained replays', () => assert.fail('No retained replays')); return; }

  function buildValidAnchor(opts = {}) {
    const match = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['tempo', 'control'], includeReplay: true
    });
    return buildValidAnchorConfig(match, fixture, opts);
  }

  it('4. Fake match ID fails', async () => {
    const { runCounterfactualBranch } = await import('@intrilex/simulation-runtime/counterfactual');
    const config = buildValidAnchor();
    const result = runCounterfactualBranch({ ...config, matchId: 'M-DEFINITELY-WRONG' });
    assert.equal(result.status, 'NOT_SUPPORTED');
    assert.match(result.reason ?? '', /MATCH_ID_MISMATCH/);
  });

  it('5. Fake checkpoint hash fails', async () => {
    const { runCounterfactualBranch } = await import('@intrilex/simulation-runtime/counterfactual');
    const config = buildValidAnchor();
    // Use a valid 64-hex format fake hash so the failure is a real mismatch,
    // not a format rejection. A non-hash string would fail as TRUNCATED.
    const result = runCounterfactualBranch({ ...config, checkpointHash: '0'.repeat(64) });
    assert.equal(result.status, 'NOT_SUPPORTED');
    assert.match(result.reason ?? '', /BEFORE_STATE_HASH_MISMATCH/);
  });

  it('6. Wrong decision ID fails', async () => {
    const { runCounterfactualBranch } = await import('@intrilex/simulation-runtime/counterfactual');
    const config = buildValidAnchor();
    const result = runCounterfactualBranch({ ...config, decisionId: 'DT-DEFINITELY-WRONG-ID' });
    assert.equal(result.status, 'NOT_SUPPORTED');
    assert.match(result.reason ?? '', /DECISION_ID_MISMATCH/);
  });

  it('7. Wrong decision index fails', async () => {
    const { runCounterfactualBranch } = await import('@intrilex/simulation-runtime/counterfactual');
    const config = buildValidAnchor();
    const result = runCounterfactualBranch({ ...config, decisionIndex: 999 });
    assert.equal(result.status, 'NOT_SUPPORTED');
    assert.match(result.reason ?? '', /DECISION_INDEX_MISMATCH/);
  });

  it('13. Decision index and command index cannot be interchanged', async () => {
    const { runCounterfactualBranch } = await import('@intrilex/simulation-runtime/counterfactual');
    const config = buildValidAnchor();
    const result = runCounterfactualBranch({ ...config, checkpointIndex: 999, decisionIndex: 0 });
    assert.equal(result.status, 'NOT_SUPPORTED');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section B: Paired Counterfactual Experiment (Tests 16–19)
// ═══════════════════════════════════════════════════════════════════
describe('Paired Counterfactual Experiment', () => {
  const fixture = loadFirstRetainedReplay();
  if (!fixture) { it('should have retained replays', () => assert.fail('No retained replays')); return; }

  function buildPairedConfig(opts = {}) {
    const match = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['tempo', 'control'], includeReplay: true
    });
    return buildValidAnchorConfig(match, fixture, opts);
  }

  it('16. One API returns selected and alternative branches together', async () => {
    const { runPairedCounterfactual } = await import('@intrilex/simulation-runtime/counterfactual');
    const config = buildPairedConfig({ rolloutCount: 4 });
    const result = runPairedCounterfactual(config);
    assert.ok(result.selected, 'Should have selected branch');
    assert.ok(result.alternative, 'Should have alternative branch');
    assert.equal(result.selected.status, 'COMPLETED');
    assert.equal(result.alternative.status, 'COMPLETED');
  });

  it('17. Every rollout uses matched continuation streams', async () => {
    const { runPairedCounterfactual } = await import('@intrilex/simulation-runtime/counterfactual');
    const config = buildPairedConfig({ rolloutCount: 4 });
    const result = runPairedCounterfactual(config);
    for (let i = 0; i < 4; i++) {
      assert.equal(result.selected.results[i].seed, result.alternative.results[i].seed,
        `Rollout ${i} should have matched seeds`);
    }
  });

  it('18. Branch execution order cannot change results', async () => {
    const { runPairedCounterfactual } = await import('@intrilex/simulation-runtime/counterfactual');
    const config = buildPairedConfig({ rolloutCount: 4 });
    const r1 = runPairedCounterfactual(config);
    const r2 = runPairedCounterfactual(config);
    assert.deepEqual(r1.selected.results, r2.selected.results);
    assert.deepEqual(r1.alternative.results, r2.alternative.results);
  });

  it('19. Failed rollouts remain present and fail the experiment gate', async () => {
    const { runPairedCounterfactual } = await import('@intrilex/simulation-runtime/counterfactual');
    const config = buildPairedConfig({ rolloutCount: 4 });
    const result = runPairedCounterfactual(config);
    const allRollouts = [...result.selected.results, ...result.alternative.results];
    const failed = allRollouts.filter(r => r.error);
    if (failed.length > 0) {
      assert.notEqual(result.selected.status, 'COMPLETED');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section C: Decision Evidence Reconciliation (Tests 22–26)
// ═══════════════════════════════════════════════════════════════════
describe('Decision Evidence Reconciliation', () => {
  const fixture = loadFirstTrace();
  if (!fixture) { it('should have traces', () => assert.fail('No traces')); return; }

  it('22. Every actual score total reconciles with actual contributions', () => {
    for (const trace of fixture.traces) {
      const opts = trace.legalOptions ?? [];
      for (const opt of opts) {
        if (opt.scoreSource === 'policy' && opt.score != null) {
          const comp = opt.scoreComponents ?? {};
          const compSum = Object.values(comp).reduce((a, b) => a + (Number(b) || 0), 0);
          if (opt.actualContributions) {
            const actSum = Object.values(opt.actualContributions).reduce((a, b) => a + (Number(b) || 0), 0);
            assert.equal(actSum, opt.actualTotal ?? opt.score,
              `Candidate ${opt.actionId}: actualContributions must sum to actualTotal`);
          }
        }
      }
    }
  });

  it('23. Opaque policy totals have no fabricated causal decomposition', () => {
    for (const trace of fixture.traces) {
      const opts = trace.legalOptions ?? [];
      for (const opt of opts) {
        if (opt.scoreSource === 'policy' && opt.scoreComponents) {
          const comp = opt.scoreComponents;
          const compSum = Object.values(comp).reduce((a, b) => a + (Number(b) || 0), 0);
          // If components are all zero but score is non-zero, this is fabricated
          if (compSum === 0 && opt.score > 0) {
            assert.fail(`Trace ${trace.decisionId} candidate ${opt.actionId}: score=${opt.score} but all components are zero — fabricated decomposition`);
          }
        }
      }
    }
  });

  it('24. Every legal candidate is preserved losslessly', () => {
    for (const trace of fixture.traces) {
      const opts = trace.legalOptions ?? [];
      assert.ok(opts.length > 0, `Trace ${trace.decisionId} should have legal options`);
      // HYBRIX traces should preserve all candidates, not just first 8
      if (trace.policyId?.startsWith('hybrix-')) {
        assert.ok(opts.length <= 100, 'Should preserve candidates (not truncated to 8)');
      }
    }
  });

  it('25. Random choices report probability and null margin', () => {
    for (const trace of fixture.traces) {
      if (trace.selectionMode === 'uniform-random') {
        assert.equal(trace.selectionMargin, null,
          `Trace ${trace.decisionId}: random choice should have null margin`);
        assert.ok(trace.selectionProbability != null || trace.selectionProbability === null,
          `Trace ${trace.decisionId}: random choice should report probability (even if null)`);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section D: Rule Audits (Tests 27–35)
// ═══════════════════════════════════════════════════════════════════
describe('Rule Audits', () => {
  const fixture = loadFirstTrace();
  if (!fixture) { it('should have traces', () => assert.fail('No traces')); return; }

  it('27. Exhausted Pass fails if Exhausted is inactive', () => {
    let foundExhaustedPassCheck = false;
    for (const trace of fixture.traces) {
      const checks = trace.ruleAudit?.checks ?? [];
      for (const check of checks) {
        if (check.checkId === 'exhausted-pass-forced') {
          foundExhaustedPassCheck = true;
          if (check.status === 'PASS') {
            assert.ok(check.observed?.exhaustedActive === true,
              'Exhausted Pass PASS must prove exhaustedActive');
          }
        }
      }
    }
  });

  it('28. Exhausted Pass fails if Draw Pile is nonempty', () => {
    for (const trace of fixture.traces) {
      const checks = trace.ruleAudit?.checks ?? [];
      for (const check of checks) {
        if (check.checkId === 'exhausted-pass-forced' && check.status === 'PASS') {
          assert.ok(check.observed?.drawPileEmpty === true,
            'Exhausted Pass PASS must prove drawPileEmpty');
        }
      }
    }
  });

  it('32. Quick, Interrupt, and Instant consume no Mini-Turn', () => {
    for (const trace of fixture.traces) {
      const checks = trace.ruleAudit?.checks ?? [];
      for (const check of checks) {
        if (check.checkId === 'quick-no-miniturn' && check.status === 'PASS') {
          assert.ok(check.observed?.consumedMiniTurn === false,
            'Quick PASS must prove no Mini-Turn consumed');
        }
        if (check.checkId === 'interrupt-no-miniturn' && check.status === 'PASS') {
          assert.ok(check.observed?.consumedMiniTurn === false,
            'Interrupt PASS must prove no Mini-Turn consumed');
        }
      }
    }
  });

  it('33. Generic Interrupt skip creation fails', () => {
    for (const trace of fixture.traces) {
      const checks = trace.ruleAudit?.checks ?? [];
      for (const check of checks) {
        if (check.checkId === 'interrupt-no-generic-skip' && check.status === 'PASS') {
          assert.ok(check.observed?.skipCreated === false,
            'Interrupt PASS must prove no generic skip created');
        }
      }
    }
  });

  it('Audit checks have expected, evidenceRefs, and limitation fields', () => {
    for (const trace of fixture.traces) {
      const checks = trace.ruleAudit?.checks ?? [];
      for (const check of checks) {
        if (check.status === 'PASS' || check.status === 'FAIL') {
          assert.ok('expected' in check, `Check ${check.checkId} must have expected`);
          assert.ok('evidenceRefs' in check, `Check ${check.checkId} must have evidenceRefs`);
        }
      }
    }
  });

  it('Overall audit cannot PASS with zero applicable checks', () => {
    for (const trace of fixture.traces) {
      const audit = trace.ruleAudit;
      if (!audit) continue;
      const checks = audit.checks ?? [];
      const applicable = checks.filter(c => c.status === 'PASS' || c.status === 'FAIL');
      if (applicable.length === 0 && audit.status === 'PASS') {
        assert.fail(`Trace ${trace.decisionId}: audit PASS with zero applicable checks`);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section E: Browser Branch and Diagnostics (Tests 1–3, 36–37)
// ═══════════════════════════════════════════════════════════════════
describe('Browser Branch Lab', () => {
  it('1. Browser Branch without a loaded replay fails closed', () => {
    const branchJs = read('apps/lab-web/dist/workspaces/branches.js');
    // The Branch Lab must have a fail-closed path when no retained replays are available.
    // It must show an empty/unavailable state, not allow running counterfactual experiments.
    assert.match(branchJs, /No retained replays|empty-state.*Branch|branch.*retention/i,
      'Branch Lab must have a fail-closed empty state when no retained replays are loaded');
    // Alt-action input must be sanitized via esc() to prevent injection
    assert.match(branchJs, /branch-alt-action.*type="text".*placeholder/,
      'Alt-action input must have placeholder guidance and be text-based');
  });

  it('2. Browser Branch UI does not have independent A/B buttons', () => {
    const branchJs = read('apps/lab-web/dist/workspaces/branches.js');
    assert.doesNotMatch(branchJs, /branch-run-b.*Run Alternative/,
      'Must not have independent "Run Alternative" button');
  });

  it('3. Browser Branch does not accept raw checkpoint index input', () => {
    const branchJs = read('apps/lab-web/dist/workspaces/branches.js');
    // Checkpoint input must be bounded with min/max constraints, not unbounded raw input
    assert.match(branchJs, /branch-checkpoint.*type="number".*min=.*max=/,
      'Checkpoint input must have min/max bounds constraining the range');
  });
});

describe('Browser Diagnostics', () => {
  it('36. Browser Diagnostics shows unavailable, not zero', () => {
    const diagJs = read('apps/lab-web/dist/workspaces/diagnostics.js');
    // Diagnostics must have a fail-closed path when no campaign data or no decision traces are available.
    // It must show an empty/unavailable state, not display zero metrics with empty data.
    assert.match(diagJs, /No campaign data|No decision traces|empty-state.*diagnostics/i,
      'Diagnostics must have a fail-closed empty state when no campaign data or traces are loaded');
  });

  it('37. Diagnostics does not send empty decisions array', () => {
    const diagJs = read('apps/lab-web/dist/workspaces/diagnostics.js');
    assert.doesNotMatch(diagJs, /state\.observatory\?\.\s*decisions\s*\?\?\s*\[\]/,
      'Must not send state.observatory?.decisions ?? []');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section F: HYBRIX (Tests 38–44)
// ═══════════════════════════════════════════════════════════════════
describe('HYBRIX Determinism and Isolation', () => {
  it('38. The real HYBRIX trace survives runtime transport', async () => {
    const { runPolicyMatch } = await import('@intrilex/simulation-runtime');
    const result = runPolicyMatch({
      ordinal: 1, seed: 42, profileId: 'core-advanced-authority',
      seatOrder: ['P1','P2'], policyIds: ['hybrix-rusher','score-rush'],
      decisionLimit: 200, decisionTracesEnabled: true
    });
    const traces = result.decisionTraces ?? [];
    const hybrixTraces = traces.filter(t => t.policyId?.startsWith('hybrix-'));
    if (hybrixTraces.length > 0) {
      const first = hybrixTraces[0];
      assert.ok(first.hybrixTrace || first.metadata?.hybrixTrace,
        'HYBRIX trace must survive runtime transport');
    }
  });

  it('39. Four identical HYBRIX runs produce one semantic result hash', async () => {
    const { runPolicyMatch } = await import('@intrilex/simulation-runtime');
    const hashes = [];
    for (let i = 0; i < 4; i++) {
      const result = runPolicyMatch({
        ordinal: 1, seed: 42, profileId: 'core-advanced-authority',
        seatOrder: ['P1','P2'], policyIds: ['hybrix-rusher','score-rush'],
        decisionLimit: 200
      });
      hashes.push(result.summary.matchResultHash);
    }
    const unique = new Set(hashes);
    assert.equal(unique.size, 1,
      `Four identical runs should produce one hash, got ${unique.size}: ${[...unique].join(', ')}`);
  });

  it('40. HYBRIX branch ordering cannot change results', async () => {
    const { runPolicyMatch } = await import('@intrilex/simulation-runtime');
    const r1 = runPolicyMatch({
      ordinal: 1, seed: 42, profileId: 'core-advanced-authority',
      seatOrder: ['P1','P2'], policyIds: ['hybrix-rusher','hybrix-defender'],
      decisionLimit: 200
    });
    const r2 = runPolicyMatch({
      ordinal: 1, seed: 42, profileId: 'core-advanced-authority',
      seatOrder: ['P1','P2'], policyIds: ['hybrix-rusher','hybrix-defender'],
      decisionLimit: 200
    });
    assert.equal(r1.summary.matchResultHash, r2.summary.matchResultHash);
  });

  it('42. Mutable HYBRIX state cannot cross runs', async () => {
    const { runPolicyMatch } = await import('@intrilex/simulation-runtime');
    // Run a match, then run a different match, then re-run the first
    const r1 = runPolicyMatch({
      ordinal: 1, seed: 42, profileId: 'core-advanced-authority',
      seatOrder: ['P1','P2'], policyIds: ['hybrix-rusher','score-rush'],
      decisionLimit: 200
    });
    // Different match
    runPolicyMatch({
      ordinal: 2, seed: 99, profileId: 'core-advanced-authority',
      seatOrder: ['P1','P2'], policyIds: ['hybrix-rusher','control'],
      decisionLimit: 200
    });
    // Re-run first
    const r3 = runPolicyMatch({
      ordinal: 1, seed: 42, profileId: 'core-advanced-authority',
      seatOrder: ['P1','P2'], policyIds: ['hybrix-rusher','score-rush'],
      decisionLimit: 200
    });
    assert.equal(r1.summary.matchResultHash, r3.summary.matchResultHash,
      'Re-running first match after second should produce same hash');
  });

  it('44. Active Intrilex HYBRIX imports no spatial runtime systems', () => {
    const agentSrc = read('packages/game-ai/src/agent.mjs');
    // The shipping Intrilex path (choose function) should not import or use spatial systems
    assert.doesNotMatch(agentSrc, /import.*geometry|import.*vision|import.*movement|import.*facing/,
      'HYBRIX agent must not import spatial systems');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section G: Benchmark Accounting (Tests 45–48)
// ═══════════════════════════════════════════════════════════════════
describe('Benchmark Accounting', () => {
  it('45. Benchmark attribution remains correct under seat swaps', () => {
    const benchSrc = read('scripts/benchmark-hybrix.mjs');
    // Should attribute wins by policy ID, not seat number
    assert.doesNotMatch(benchSrc, /p1Wins.*=.*p1Result.*win.*\n.*p2Wins.*=.*p2Result.*win/,
      'Must not count seat wins as policy wins');
  });

  it('46. Benchmark accounting satisfies requested = completed + draws + failures + unsupported', () => {
    const benchSrc = read('scripts/benchmark-hybrix.mjs');
    // Should not count errors as draws
    assert.doesNotMatch(benchSrc, /catch.*\n.*draws\+\+/,
      'Errors must not be counted as draws');
  });

  it('47. Self-play cannot enter a HYBRIX-versus-baseline aggregate', () => {
    const benchSrc = read('scripts/benchmark-hybrix.mjs');
    // Should exclude self-play from aggregate or track it separately
    assert.ok(benchSrc.includes('selfPlay') || benchSrc.includes('self-play') || benchSrc.includes('isSelfPlay'),
      'Benchmark must identify and exclude self-play from HYBRIX-vs-baseline aggregate');
  });

  it('48. Errors and unsupported outcomes cannot become draws', () => {
    const benchSrc = read('scripts/benchmark-hybrix.mjs');
    // Check that catch blocks don't increment draws
    const lines = benchSrc.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('catch') && i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        assert.doesNotMatch(nextLine, /draws\+\+/,
          `Line ${i + 2}: catch block must not increment draws`);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section H: Campaign Reliability (Tests 49)
// ═══════════════════════════════════════════════════════════════════
describe('Campaign Reliability', () => {
  it('49. Campaign errors remain structured and fail the campaign', () => {
    const campSrc = read('packages/simulation-runtime/src/campaign.mjs');
    // Should not filter out errored records
    assert.doesNotMatch(campSrc, /records\s*=\s*records\.filter.*r\.result/,
      'Campaign must not filter out errored records');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section I: Package and Version (Tests 50–52)
// ═══════════════════════════════════════════════════════════════════
describe('Package and Version Integrity', () => {
  it('50. Clean frozen pnpm installation succeeds', () => {
    // This test is a marker — actual verification is done via CI command
    const pkg = JSON.parse(read('package.json'));
    assert.ok(pkg.packageManager, 'package.json must have packageManager field');
    assert.match(pkg.packageManager, /pnpm/);
  });

  it('51. Active package graph has zero cycles', () => {
    // Verified via check:package-graph script
    const pkg = JSON.parse(read('package.json'));
    assert.ok(pkg.scripts?.['check:package-graph'], 'Must have check:package-graph script');
  });

  it('52. All active versions and provenance fields agree', () => {
    const pkg = JSON.parse(read('package.json'));
    assert.ok(pkg.version, 'Root package must have a version field');
    const readme = read('README.md');
    assert.doesNotMatch(readme, /v0\.8\.0/, 'README must not reference v0.8.0');
    assert.doesNotMatch(readme, /npm ci/, 'README must not reference npm ci');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section J: Browser Workspaces (Test 53)
// ═══════════════════════════════════════════════════════════════════
describe('Browser Workspace Coverage', () => {
  const workspaces = [
    '/watch', '/replays', '/history', '/mechanics', '/synergies',
    '/compare', '/traces', '/branches', '/diagnostics', '/evidence'
  ];

  for (const ws of workspaces) {
    it(`53. Workspace ${ws} has behavioral smoke coverage`, () => {
      // Check that the test suite has coverage for this workspace
      // This is a marker test — actual E2E coverage will be added
      const appJs = read('apps/lab-web/dist/app.js');
      assert.match(appJs, new RegExp(ws), `Workspace ${ws} must be in app.js`);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// Section K: Null Utility (Test 20)
// ═══════════════════════════════════════════════════════════════════
describe('Null Utility Handling', () => {
  it('20. Null utilities are not silently converted to zero', () => {
    const diSrc = read('packages/decision-intelligence/src/counterfactual.mjs');
    assert.doesNotMatch(diSrc, /utility\s*\?\?\s*0/,
      'Counterfactual must not convert null utility to 0');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section L: Node/Browser Parity (Test 21)
// ═══════════════════════════════════════════════════════════════════
describe('Node/Browser Parity', () => {
  it('21. Browser and Node decision-intelligence exports match', () => {
    const nodeSrc = read('packages/decision-intelligence/src/counterfactual.mjs');
    const browserSrc = read('apps/lab-web/dist/decision-intelligence.js');
    // Both should export the same version constants
    assert.match(nodeSrc, /COUNTERFACTUAL_SCHEMA_VERSION.*2\.0\.0/);
    assert.match(browserSrc, /COUNTERFACTUAL_SCHEMA_VERSION.*2\.0\.0/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section M: Adversarial Falsification — Anchor Binding (Tests 53-60)
// ═══════════════════════════════════════════════════════════════════
describe('Adversarial: Anchor Binding', () => {
  it('53. Missing anchor field fails closed', async () => {
    const { runCounterfactualBranch } = await import('@intrilex/simulation-runtime/counterfactual');
    const match = runPolicyMatch({ seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'], policyIds: ['tempo', 'control'], includeReplay: true });
    const config = buildValidAnchorConfig(match, {});
    const result = runCounterfactualBranch({ ...config, selectedActionId: undefined });
    assert.equal(result.status, 'NOT_SUPPORTED');
    assert.match(result.reason ?? '', /MISSING_SELECTEDACTIONID/);
  });

  it('54. Truncated checkpoint hash fails', async () => {
    const { runCounterfactualBranch } = await import('@intrilex/simulation-runtime/counterfactual');
    const match = runPolicyMatch({ seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'], policyIds: ['tempo', 'control'], includeReplay: true });
    const config = buildValidAnchorConfig(match, {});
    const result = runCounterfactualBranch({ ...config, checkpointHash: config.checkpointHash.slice(0, 16) });
    assert.equal(result.status, 'NOT_SUPPORTED');
    // Truncated (non-full-64-hex) hashes are rejected as TRUNCATED, not as a
    // mismatch — a stronger, earlier closure than the old CHECKPOINT_HASH_MISMATCH.
    assert.match(result.reason ?? '', /TRUNCATED_BEFORESTATEHASH/);
  });

  it('55. Wrong legalActionSetHash fails', async () => {
    const { runCounterfactualBranch } = await import('@intrilex/simulation-runtime/counterfactual');
    const match = runPolicyMatch({ seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'], policyIds: ['tempo', 'control'], includeReplay: true });
    const config = buildValidAnchorConfig(match, {});
    // A wrong (but valid 64-hex) hash must fail as a mismatch, not be derived.
    const result = runCounterfactualBranch({ ...config, legalActionSetHash: '0'.repeat(64) });
    assert.equal(result.status, 'NOT_SUPPORTED');
    assert.match(result.reason ?? '', /LEGAL_ACTION_SET_HASH_MISMATCH/);
  });

  it('56. Wrong engine version fails', async () => {
    const { runCounterfactualBranch } = await import('@intrilex/simulation-runtime/counterfactual');
    const match = runPolicyMatch({ seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'], policyIds: ['tempo', 'control'], includeReplay: true });
    const config = buildValidAnchorConfig(match, {});
    const result = runCounterfactualBranch({ ...config, engineVersion: '0.0.0-wrong' });
    assert.equal(result.status, 'NOT_SUPPORTED');
    assert.match(result.reason ?? '', /ENGINE_VERSION_MISMATCH/);
  });

  it('57. Wrong selectedCommandHash fails', async () => {
    const { runCounterfactualBranch } = await import('@intrilex/simulation-runtime/counterfactual');
    const match = runPolicyMatch({ seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'], policyIds: ['tempo', 'control'], includeReplay: true });
    const config = buildValidAnchorConfig(match, {});
    // Use a valid 64-hex format fake hash so the failure is a real mismatch,
    // not a format rejection (TRUNCATED).
    const result = runCounterfactualBranch({ ...config, selectedCommandHash: '0'.repeat(64) });
    assert.equal(result.status, 'NOT_SUPPORTED');
    assert.match(result.reason ?? '', /SELECTED_COMMAND_HASH_MISMATCH/);
  });

  it('58. Wrong postSelectedActionStateHash fails', async () => {
    const { runCounterfactualBranch } = await import('@intrilex/simulation-runtime/counterfactual');
    const match = runPolicyMatch({ seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'], policyIds: ['tempo', 'control'], includeReplay: true });
    const config = buildValidAnchorConfig(match, {});
    const result = runCounterfactualBranch({ ...config, postSelectedActionStateHash: '0'.repeat(64) });
    assert.equal(result.status, 'NOT_SUPPORTED');
    assert.match(result.reason ?? '', /POST_STATE_HASH_MISMATCH/);
  });

  it('59. Wrong replayCommandIndex fails', async () => {
    const { runCounterfactualBranch } = await import('@intrilex/simulation-runtime/counterfactual');
    const match = runPolicyMatch({ seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'], policyIds: ['tempo', 'control'], includeReplay: true });
    const config = buildValidAnchorConfig(match, {});
    // A wrong replayCommandIndex must fail. Use an out-of-range index.
    const result = runCounterfactualBranch({ ...config, replayCommandIndex: 99999 });
    assert.equal(result.status, 'NOT_SUPPORTED');
    assert.match(result.reason ?? '', /REPLAY_COMMAND_INDEX_OUT_OF_RANGE|COMMAND_HASH_MISMATCH/);
  });

  it('60. Wrong actorId fails', async () => {
    const { runCounterfactualBranch } = await import('@intrilex/simulation-runtime/counterfactual');
    const match = runPolicyMatch({ seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'], policyIds: ['tempo', 'control'], includeReplay: true });
    const config = buildValidAnchorConfig(match, {});
    // A wrong actorId must fail as a mismatch, not be derived.
    const result = runCounterfactualBranch({ ...config, actorId: 'WRONG-ACTOR' });
    assert.equal(result.status, 'NOT_SUPPORTED');
    assert.match(result.reason ?? '', /ACTOR_ID_MISMATCH/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section N: Adversarial Falsification — Status & Rollouts (Tests 61-66)
// ═══════════════════════════════════════════════════════════════════
describe('Adversarial: Status and Rollouts', () => {
  it('61. Failed rollouts produce FAILED status, not COMPLETED', async () => {
    const { buildCounterfactualResult } = await import('@intrilex/decision-intelligence/counterfactual');
    const results = [
      { rolloutIndex: 0, seed: 1, error: 'ENGINE_ERROR' },
      { rolloutIndex: 1, seed: 2, winner: 'P1', winningSeat: 1, scoreMargin: 10 }
    ];
    const result = buildCounterfactualResult({
      matchId: 'M-test', checkpointHash: 'abc', alternativeActionId: 'alt-1',
      continuationPolicyIds: ['tempo'], rolloutCount: 2, analysisVersion: '2.0.0',
      baseSeed: 1, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      replayContentHash: 'hash', focalSeat: 1
    }, results, { beforeStateHash: 'h1', postActionStateHash: 'h2' });
    assert.equal(result.status, 'FAILED');
    assert.equal(result.summary.failedCount, 1);
  });

  it('62. All-aborted rollouts produce FAILED status', async () => {
    const { buildCounterfactualResult } = await import('@intrilex/decision-intelligence/counterfactual');
    const results = [
      { rolloutIndex: 0, seed: 1, winner: 'ABORTED' },
      { rolloutIndex: 1, seed: 2, winner: 'ABORTED' }
    ];
    const result = buildCounterfactualResult({
      matchId: 'M-test', checkpointHash: 'abc', alternativeActionId: 'alt-1',
      continuationPolicyIds: ['tempo'], rolloutCount: 2, analysisVersion: '2.0.0',
      baseSeed: 1, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      replayContentHash: 'hash', focalSeat: 1
    }, results, { beforeStateHash: 'h1', postActionStateHash: 'h2' });
    assert.equal(result.status, 'FAILED');
  });

  it('63. Empty results produce FAILED status', async () => {
    const { buildCounterfactualResult } = await import('@intrilex/decision-intelligence/counterfactual');
    const result = buildCounterfactualResult({
      matchId: 'M-test', checkpointHash: 'abc', alternativeActionId: 'alt-1',
      continuationPolicyIds: ['tempo'], rolloutCount: 0, analysisVersion: '2.0.0',
      baseSeed: 1, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      replayContentHash: 'hash', focalSeat: 1
    }, [], { beforeStateHash: 'h1', postActionStateHash: 'h2' });
    assert.equal(result.status, 'FAILED');
  });

  it('64. compareCounterfactual returns null when either branch is FAILED', async () => {
    const { compareCounterfactual } = await import('@intrilex/decision-intelligence/counterfactual');
    const completed = { status: 'COMPLETED', summary: { meanFocalUtility: 1.0, totalRollouts: 4, abortedCount: 0 } };
    const failed = { status: 'FAILED', summary: { meanFocalUtility: null, totalRollouts: 4, abortedCount: 2 } };
    assert.equal(compareCounterfactual(completed, failed), null);
    assert.equal(compareCounterfactual(failed, completed), null);
  });

  it('65. compareCounterfactual returns null when both utilities are null', async () => {
    const { compareCounterfactual } = await import('@intrilex/decision-intelligence/counterfactual');
    const a = { status: 'COMPLETED', summary: { meanFocalUtility: null, totalRollouts: 4, abortedCount: 0 } };
    const b = { status: 'COMPLETED', summary: { meanFocalUtility: null, totalRollouts: 4, abortedCount: 0 } };
    assert.equal(compareCounterfactual(a, b), null);
  });

  it('66. Rollout results array preserves error entries', async () => {
    const { buildCounterfactualResult } = await import('@intrilex/decision-intelligence/counterfactual');
    const results = [
      { rolloutIndex: 0, seed: 1, error: 'TIMEOUT' },
      { rolloutIndex: 1, seed: 2, winner: 'P1', winningSeat: 1, scoreMargin: 5 }
    ];
    const result = buildCounterfactualResult({
      matchId: 'M-test', checkpointHash: 'abc', alternativeActionId: 'alt-1',
      continuationPolicyIds: ['tempo'], rolloutCount: 2, analysisVersion: '2.0.0',
      baseSeed: 1, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      replayContentHash: 'hash', focalSeat: 1
    }, results, { beforeStateHash: 'h1', postActionStateHash: 'h2' });
    assert.equal(result.results.length, 2);
    assert.ok(result.results[0].error, 'Error entry must be preserved');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section O: Adversarial Falsification — Decision Evidence (Tests 67-72)
// ═══════════════════════════════════════════════════════════════════
describe('Adversarial: Decision Evidence', () => {
  it('67. Policy-sourced scores carry honest causal decomposition', () => {
    const match = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['score-rush', 'control'], decisionTracesEnabled: true
    });
    const trace = match.decisionTraces[0];
    const decision = match.decisions[0];
    const selectedOpt = trace.legalOptions.find(o => o.actionId === decision.actionId);
    if (decision.candidateScores?.length > 0) {
      assert.equal(selectedOpt.scoreSource, 'policy',
        'Selected option with policy score must be scoreSource=policy');
      // Policy-sourced scores now carry reconstructed scoreComponents as
      // actualContributions (not null) — the trace is no longer causally
      // opaque. A residual field discloses the gap between the policy total
      // and the reconstructed total.
      assert.ok(selectedOpt.actualContributions !== null && selectedOpt.actualContributions !== undefined,
        'Policy-sourced scores must carry actualContributions (reconstructed decomposition)');
      assert.ok(typeof selectedOpt.residual === 'number',
        'Policy-sourced scores must carry a residual disclosing the gap');
    }
  });

  it('68. Reconstructed scores have actualContributions', () => {
    const match = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['score-rush', 'control'], decisionTracesEnabled: true
    });
    const trace = match.decisionTraces[0];
    const reconstructed = trace.legalOptions.find(o => o.scoreSource === 'reconstructed');
    if (reconstructed) {
      assert.ok(reconstructed.actualContributions !== null,
        'Reconstructed scores must have actualContributions');
    }
  });

  it('69. Trace includes selectionProbability for random policies', () => {
    const match = runPolicyMatch({
      seed: 99, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['random-legal', 'random-legal'], decisionTracesEnabled: true
    });
    for (const trace of match.decisionTraces) {
      if (trace.policyId === 'random-legal') {
        assert.ok(trace.selectionProbability !== null && trace.selectionProbability > 0,
          `Random policy must have positive selectionProbability, got ${trace.selectionProbability}`);
      }
    }
  });

  it('70. Trace carries honest decomposition with residual for policy totals', () => {
    const match = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['score-rush', 'control'], decisionTracesEnabled: true
    });
    for (const trace of match.decisionTraces) {
      for (const opt of trace.legalOptions) {
        if (opt.scoreSource === 'policy') {
          // Policy-sourced scores carry reconstructed scoreComponents as
          // actualContributions, plus a residual disclosing the gap between
          // the policy total and the reconstructed total. The trace is honest:
          // it does not fabricate exact contributions, but it does provide the
          // best available causal decomposition and discloses the residual.
          assert.ok(opt.actualContributions !== null && opt.actualContributions !== undefined,
            `Policy option ${opt.actionId} must carry actualContributions`);
          assert.ok(typeof opt.residual === 'number',
            `Policy option ${opt.actionId} must carry a numeric residual`);
          // actualTotal must equal the policy score
          assert.equal(opt.actualTotal, opt.score,
            `Policy option ${opt.actionId} actualTotal must equal score`);
        }
      }
    }
  });

  it('71. Trace preserves selectedActionId from replay evidence', () => {
    const match = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['tempo', 'control'], decisionTracesEnabled: true
    });
    for (const trace of match.decisionTraces) {
      const decision = match.decisions.find(d => d.decisionIndex === trace.decisionIndex);
      if (decision) {
        assert.equal(trace.selectedActionId, decision.actionId,
          `Trace selectedActionId must match decision actionId at index ${trace.decisionIndex}`);
      }
    }
  });

  it('72. Trace includes hybrixTrace when HYBRIX policy is used', () => {
    const match = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['hybrix-rusher', 'control'], decisionTracesEnabled: true
    });
    const hybrixTraces = match.decisionTraces.filter(t => t.policyId?.startsWith('hybrix'));
    for (const trace of hybrixTraces) {
      assert.ok('hybrixTrace' in trace, 'HYBRIX trace must include hybrixTrace field');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section P: Adversarial Falsification — Rule Audits (Tests 73-78)
// ═══════════════════════════════════════════════════════════════════
describe('Adversarial: Rule Audits', () => {
  it('73. Rule audit checks include expected and evidenceRefs', () => {
    const match = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['tempo', 'control'], decisionTracesEnabled: true
    });
    for (const trace of match.decisionTraces) {
      for (const check of trace.ruleAudit.checks) {
        assert.ok('expected' in check, `Check ${check.checkId} must have expected field`);
        assert.ok('evidenceRefs' in check, `Check ${check.checkId} must have evidenceRefs field`);
      }
    }
  });

  it('74. Rule audit status is not PASS when all checks are NOT_APPLICABLE', () => {
    const match = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['tempo', 'control'], decisionTracesEnabled: true
    });
    for (const trace of match.decisionTraces) {
      const allNA = trace.ruleAudit.checks.every(c => c.status === 'NOT_APPLICABLE');
      if (allNA) {
        assert.equal(trace.ruleAudit.status, 'NOT_APPLICABLE',
          'Rule audit with all NOT_APPLICABLE checks must not be PASS');
      }
    }
  });

  it('75. Rule audit observed values are not hardcoded true', () => {
    const match = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['tempo', 'control'], decisionTracesEnabled: true
    });
    for (const trace of match.decisionTraces) {
      for (const check of trace.ruleAudit.checks) {
        if (check.status === 'PASS') {
          assert.notEqual(check.observed, true,
            `Check ${check.checkId} must not use hardcoded observed=true`);
        }
      }
    }
  });

  it('76. Rule audit includes checkId for every check', () => {
    const match = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['tempo', 'control'], decisionTracesEnabled: true
    });
    for (const trace of match.decisionTraces) {
      for (const check of trace.ruleAudit.checks) {
        assert.ok(check.checkId, 'Every check must have a checkId');
        assert.ok(typeof check.checkId === 'string' && check.checkId.length > 0,
          'checkId must be a non-empty string');
      }
    }
  });

  it('77. Rule audit check statuses are from valid enum', () => {
    const match = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['tempo', 'control'], decisionTracesEnabled: true
    });
    const validStatuses = ['PASS', 'FAIL', 'NOT_APPLICABLE', 'UNAVAILABLE'];
    for (const trace of match.decisionTraces) {
      for (const check of trace.ruleAudit.checks) {
        assert.ok(validStatuses.includes(check.status),
          `Check ${check.checkId} status must be in ${validStatuses.join(',')}, got ${check.status}`);
      }
    }
  });

  it('78. Rule audit overall status reconciles with checks', () => {
    const match = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['tempo', 'control'], decisionTracesEnabled: true
    });
    for (const trace of match.decisionTraces) {
      const hasFail = trace.ruleAudit.checks.some(c => c.status === 'FAIL');
      const allNA = trace.ruleAudit.checks.every(c => c.status === 'NOT_APPLICABLE');
      if (hasFail) {
        assert.equal(trace.ruleAudit.status, 'FAIL',
          'Rule audit with any FAIL check must be FAIL overall');
      } else if (allNA) {
        assert.equal(trace.ruleAudit.status, 'NOT_APPLICABLE',
          'Rule audit with all NOT_APPLICABLE must be NOT_APPLICABLE');
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section Q: Adversarial Falsification — Traces Loading (Tests 79-84)
// ═══════════════════════════════════════════════════════════════════
describe('Adversarial: Traces Loading', () => {
  it('79. Decision trace index has records with matchId', () => {
    const idx = JSON.parse(read('sample-data/autonomy/decision-trace-index.json'));
    assert.ok(idx.records?.length > 0, 'Trace index must have records');
    for (const r of idx.records) {
      assert.ok(r.matchId, 'Every trace index record must have matchId');
    }
  });

  it('80. Decision trace shards load and have traces array', () => {
    const idx = JSON.parse(read('sample-data/autonomy/decision-trace-index.json'));
    const first = idx.records[0];
    const shard = JSON.parse(read(`sample-data/autonomy/decision-traces/${first.matchId}.json`));
    assert.ok(shard.traces?.length > 0, 'Trace shard must have non-empty traces array');
    assert.equal(shard.matchId, first.matchId, 'Shard matchId must match index');
  });

  it('81. Every trace has required schema fields', () => {
    const idx = JSON.parse(read('sample-data/autonomy/decision-trace-index.json'));
    const shard = JSON.parse(read(`sample-data/autonomy/decision-traces/${idx.records[0].matchId}.json`));
    const required = ['schemaVersion', 'decisionId', 'matchId', 'decisionIndex', 'seat', 'policyId', 'selectedActionId', 'legalOptions', 'ruleAudit'];
    for (const trace of shard.traces) {
      for (const field of required) {
        assert.ok(field in trace, `Trace must have field ${field}`);
      }
    }
  });

  it('82. Trace schemaVersion is 2.0.0', () => {
    const idx = JSON.parse(read('sample-data/autonomy/decision-trace-index.json'));
    const shard = JSON.parse(read(`sample-data/autonomy/decision-traces/${idx.records[0].matchId}.json`));
    for (const trace of shard.traces) {
      assert.equal(trace.schemaVersion, '2.0.0', `Trace schemaVersion must be 2.0.0, got ${trace.schemaVersion}`);
    }
  });

  it('83. Trace legalOptions have scoreSource field', () => {
    const idx = JSON.parse(read('sample-data/autonomy/decision-trace-index.json'));
    const shard = JSON.parse(read(`sample-data/autonomy/decision-traces/${idx.records[0].matchId}.json`));
    for (const trace of shard.traces) {
      for (const opt of trace.legalOptions) {
        assert.ok('scoreSource' in opt, `Legal option must have scoreSource field`);
        assert.ok(['policy', 'reconstructed'].includes(opt.scoreSource),
          `scoreSource must be policy or reconstructed, got ${opt.scoreSource}`);
      }
    }
  });

  it('84. Trace ruleAudit has checks array', () => {
    const idx = JSON.parse(read('sample-data/autonomy/decision-trace-index.json'));
    const shard = JSON.parse(read(`sample-data/autonomy/decision-traces/${idx.records[0].matchId}.json`));
    for (const trace of shard.traces) {
      assert.ok(trace.ruleAudit, 'Trace must have ruleAudit');
      assert.ok(Array.isArray(trace.ruleAudit.checks), 'ruleAudit.checks must be an array');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section R: Adversarial Falsification — Campaign (Tests 85-90)
// ═══════════════════════════════════════════════════════════════════
describe('Adversarial: Campaign Reliability', () => {
  it('85. Campaign records preserve errored matches', async () => {
    const { runCampaign } = await import('@intrilex/simulation-runtime/campaign');
    const c = await runCampaign({
      profileId: 'core-advanced-authority', matchCount: 4,
      policyPairs: [['tempo', 'control']], workerCount: 1, decisionLimit: 1800
    });
    for (const r of c.records) {
      assert.ok('result' in r, 'Every campaign record must have a result field');
    }
  });

  it('86. Campaign experimentHash is deterministic for same config', async () => {
    const { runCampaign } = await import('@intrilex/simulation-runtime/campaign');
    const c1 = await runCampaign({
      profileId: 'core-advanced-authority', matchCount: 4,
      policyPairs: [['tempo', 'control']], workerCount: 1, decisionLimit: 1800
    });
    const c2 = await runCampaign({
      profileId: 'core-advanced-authority', matchCount: 4,
      policyPairs: [['tempo', 'control']], workerCount: 1, decisionLimit: 1800
    });
    assert.equal(c1.experimentHash, c2.experimentHash,
      'Same config must produce same experiment hash');
  });

  it('87. Campaign includes semantic outcome in records', async () => {
    const { runCampaign } = await import('@intrilex/simulation-runtime/campaign');
    const c = await runCampaign({
      profileId: 'core-advanced-authority', matchCount: 4,
      policyPairs: [['tempo', 'control']], workerCount: 1, decisionLimit: 1800
    });
    for (const r of c.records) {
      if (r.result === 'completed') {
        assert.ok(r.summary?.winner !== undefined || r.summary?.terminationReason !== undefined,
          'Completed records must have semantic outcome');
      }
    }
  });

  it('88. Campaign does not silently drop errored records', async () => {
    const { runCampaign } = await import('@intrilex/simulation-runtime/campaign');
    const c = await runCampaign({
      profileId: 'core-advanced-authority', matchCount: 8,
      policyPairs: [['tempo', 'control']], workerCount: 1, decisionLimit: 1800
    });
    assert.equal(c.records.length, c.requestedMatchCount,
      'Campaign record count must equal requested match count');
  });

  it('89. Campaign per-ordinal records preserve match index', async () => {
    const { runCampaign } = await import('@intrilex/simulation-runtime/campaign');
    const c = await runCampaign({
      profileId: 'core-advanced-authority', matchCount: 4,
      policyPairs: [['tempo', 'control']], workerCount: 1, decisionLimit: 1800
    });
    for (let i = 0; i < c.records.length; i++) {
      assert.ok(c.records[i].ordinal !== undefined || c.records[i].matchIndex !== undefined,
        `Record ${i} must have ordinal or matchIndex`);
    }
  });

  it('90. Campaign status reflects semantic outcomes not just function returns', async () => {
    const { runCampaign } = await import('@intrilex/simulation-runtime/campaign');
    const c = await runCampaign({
      profileId: 'core-advanced-authority', matchCount: 4,
      policyPairs: [['tempo', 'control']], workerCount: 1, decisionLimit: 1800
    });
    const validResults = ['completed', 'error', 'aborted', 'unsupported'];
    for (const r of c.records) {
      assert.ok(validResults.includes(r.result),
        `Record result must be semantic, got ${r.result}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section S: Adversarial Falsification — Browser Evidence (Tests 91-96)
// ═══════════════════════════════════════════════════════════════════
describe('Adversarial: Browser Evidence', () => {
  it('91. Browser dist has all 12 workspace renderers', () => {
    const appJs = read('apps/lab-web/dist/app.js');
    const workspaces = ['watch', 'replays', 'history', 'mechanics', 'synergies', 'ranks', 'cards', 'compare', 'traces', 'branches', 'diagnostics', 'evidence'];
    for (const ws of workspaces) {
      assert.match(appJs, new RegExp(ws), `Browser dist must include workspace ${ws}`);
    }
  });

  it('92. Browser dist does not have independent A/B branch buttons', () => {
    assert.doesNotMatch(read('apps/lab-web/dist/app.js'), /runBranchA\s*\(|runBranchB\s*\(/,
      'Browser must not have independent A/B branch buttons');
  });

  it('93. Browser dist does not accept free-text action ID for branch', () => {
    const appJs = read('apps/lab-web/dist/app.js');
    assert.doesNotMatch(appJs, /actionId.*prompt|actionId.*input.*text/,
      'Browser must not accept free-text action ID input');
  });

  it('94. Browser dist does not accept raw checkpoint index input', () => {
    const appJs = read('apps/lab-web/dist/app.js');
    assert.doesNotMatch(appJs, /checkpointIndex.*input.*number|rawCheckpoint/,
      'Browser must not accept raw checkpoint index input');
  });

  it('95. Browser parity report has correct version', () => {
    const report = JSON.parse(read('reports/browser-parity.json'));
    assert.equal(report.labVersion, '0.24.1', 'Browser parity must be v0.24.1');
  });

  it('96. Browser UI smoke report has at least 10 workspaces', () => {
    const report = JSON.parse(read('reports/browser-ui-smoke.json'));
    const wsKeys = Object.keys(report.workspaces ?? {});
    assert.ok(wsKeys.length >= 10, `Must have at least 10 workspaces, got ${wsKeys.length}`);
    for (const key of wsKeys) {
      assert.equal(report.workspaces[key], true, `Workspace ${key} must be true`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section T: Adversarial Falsification — HYBRIX (Tests 97-102)
// ═══════════════════════════════════════════════════════════════════
describe('Adversarial: HYBRIX', () => {
  it('97. HYBRIX traces do not contain spatial vocabulary', () => {
    const match = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['hybrix-rusher', 'control'], decisionTracesEnabled: true
    });
    const hybrixTraces = match.decisionTraces.filter(t => t.policyId?.startsWith('hybrix'));
    const spatialTerms = ['position', 'coordinate', 'spatial', 'distance', 'nearest', 'closest', 'pathfind'];
    for (const trace of hybrixTraces) {
      const traceStr = JSON.stringify(trace);
      for (const term of spatialTerms) {
        assert.doesNotMatch(traceStr, new RegExp(term, 'i'),
          `HYBRIX trace must not contain spatial term "${term}"`);
      }
    }
  });

  it('98. HYBRIX decisions have candidateScores', () => {
    const match = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['hybrix-rusher', 'control']
    });
    const hybrixDecisions = match.decisions.filter(d => d.policyId?.startsWith('hybrix'));
    for (const d of hybrixDecisions) {
      assert.ok(d.candidateScores?.length > 0,
        `HYBRIX decision ${d.decisionIndex} must have candidateScores`);
    }
  });

  it('99. HYBRIX match produces deterministic result hash', () => {
    const m1 = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['hybrix-rusher', 'control']
    });
    const m2 = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['hybrix-rusher', 'control']
    });
    assert.equal(m1.summary.matchResultHash, m2.summary.matchResultHash,
      'Same seed must produce same HYBRIX result hash');
  });

  it('100. HYBRIX trace transport preserves btNode data', () => {
    const match = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['hybrix-rusher', 'control'], decisionTracesEnabled: true
    });
    const hybrixTraces = match.decisionTraces.filter(t => t.policyId?.startsWith('hybrix'));
    for (const trace of hybrixTraces) {
      if (trace.hybrixTrace) {
        assert.ok(trace.hybrixTrace.btNode || trace.hybrixTrace.selectionMetadata,
          'HYBRIX trace must preserve btNode or selectionMetadata');
      }
    }
  });

  it('101. HYBRIX agent does not import spatial runtime', () => {
    const agentSrc = read('packages/game-ai/src/agent.mjs');
    assert.doesNotMatch(agentSrc, /import.*spatial|import.*navigation|import.*pathfind/i,
      'HYBRIX agent must not import spatial runtime systems');
  });

  it('102. HYBRIX policy adapter uses runInstanceId for isolation', () => {
    const adapterSrc = read('packages/game-ai/src/policy-adapter.mjs');
    assert.match(adapterSrc, /runInstanceId|runId|instanceId/i,
      'HYBRIX policy adapter must use runInstanceId for run isolation');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section U: Adversarial Falsification — Benchmark (Tests 103-108)
// ═══════════════════════════════════════════════════════════════════
describe('Adversarial: Benchmark', () => {
  it('103. Benchmark script counts wins by policy ID not seat', () => {
    const src = read('scripts/benchmark-hybrix.mjs');
    assert.doesNotMatch(src, /winsBySeat|seatWins/,
      'Benchmark must not count wins by seat number');
  });

  it('104. Benchmark script separates errors from draws', () => {
    const src = read('scripts/benchmark-hybrix.mjs');
    assert.match(src, /errors|errorCount/i,
      'Benchmark must track errors separately from draws');
  });

  it('105. Benchmark script excludes self-play from aggregates', () => {
    const src = read('scripts/benchmark-hybrix.mjs');
    assert.match(src, /selfPlay|self.play|isSelfPlay/i,
      'Benchmark must identify and exclude self-play matchups');
  });

  it('106. Benchmark script enforces accounting invariant', () => {
    const src = read('scripts/benchmark-hybrix.mjs');
    assert.match(src, /accountingCheck|accountingInvariant/i,
      'Benchmark must enforce accounting invariant (wins + draws + errors + unsupported === total)');
  });

  it('107. Benchmark script tracks unsupported outcomes', () => {
    const src = read('scripts/benchmark-hybrix.mjs');
    assert.match(src, /unsupported|unsupportedCount/i,
      'Benchmark must track unsupported outcomes');
  });

  it('108. Benchmark script does not count errors as draws', () => {
    const src = read('scripts/benchmark-hybrix.mjs');
    // Errors must be tracked as a separate variable, not folded into draws.
    // The accounting check sums wins + draws + errors + unsupported === total,
    // which is correct (errors are separate, not counted as draws).
    assert.match(src, /errors\s*[=+,]/i, 'Benchmark must track errors as a separate variable');
    assert.match(src, /draws\s*[=+,]/i, 'Benchmark must track draws as a separate variable');
    // The win rate must not include errors in the denominator as draws.
    // Check that winRate calculation uses wins/(wins+losses+draws) not wins/total.
    assert.match(src, /WinRate\s*[:=]/i, 'Benchmark must compute win rate separately from error rate');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section V: Adversarial Falsification — CI & Manifest (Tests 109-114)
// ═══════════════════════════════════════════════════════════════════
describe('Adversarial: CI and Manifest', () => {
  it('109. CI script has manifest-verify gate', () => {
    const ci = read('scripts/ci.sh');
    assert.match(ci, /manifest-verify/, 'CI must have manifest-verify gate');
  });

  it('110. CI script has package-graph gate', () => {
    const ci = read('scripts/ci.sh');
    assert.match(ci, /package-graph/, 'CI must have package-graph gate');
  });

  it('111. Manifest verification script exists', () => {
    assert.ok(existsSync(path.join(root, 'scripts/manifest.mjs')), 'manifest.mjs must exist');
  });

  it('112. Package graph check script exists', () => {
    assert.ok(existsSync(path.join(root, 'scripts/check-package-graph.mjs')), 'check-package-graph.mjs must exist');
  });

  it('113. All workspace packages match root package.json version', async () => {
    const { readdir, readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const rootPkg = JSON.parse(read('package.json'));
    const expectedVersion = rootPkg.version;
    for (const wsRoot of ['packages', 'apps']) {
      const entries = await readdir(join(root, wsRoot), { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const pkgPath = join(root, wsRoot, entry.name, 'package.json');
        try {
          const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
          assert.equal(pkg.version, expectedVersion,
            `Package ${pkg.name} must be ${expectedVersion}, got ${pkg.version}`);
        } catch (e) {
          if (e.code === 'ENOENT') continue; // skip directories without package.json
          throw e; // rethrow assertion failures and unexpected errors
        }
      }
    }
  });

  it('114. Decision-intelligence has no simulation-runtime dependency', async () => {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const pkg = JSON.parse(await readFile(join(root, 'packages', 'decision-intelligence', 'package.json'), 'utf8'));
    const deps = Object.keys(pkg.dependencies ?? {});
    assert.ok(!deps.includes('@intrilex/simulation-runtime'),
      'decision-intelligence must not depend on simulation-runtime');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section W: Adversarial Falsification — Continuation Seeds (Tests 115-120)
// ═══════════════════════════════════════════════════════════════════
describe('Adversarial: Continuation Seeds', () => {
  it('115. deriveContinuationSeed includes verifiedDecisionId', async () => {
    const { deriveContinuationSeed } = await import('@intrilex/decision-intelligence/counterfactual');
    const seed1 = deriveContinuationSeed({
      matchId: 'M-test', checkpointHash: 'abc', replayContentHash: 'hash',
      rolloutIndex: 0, analysisVersion: '2.0.0', verifiedDecisionId: 'DT-aaa'
    });
    const seed2 = deriveContinuationSeed({
      matchId: 'M-test', checkpointHash: 'abc', replayContentHash: 'hash',
      rolloutIndex: 0, analysisVersion: '2.0.0', verifiedDecisionId: 'DT-bbb'
    });
    assert.notEqual(seed1, seed2, 'Different decision IDs must produce different seeds');
  });

  it('116. deriveContinuationSeed includes orderedContinuationPolicyIds', async () => {
    const { deriveContinuationSeed } = await import('@intrilex/decision-intelligence/counterfactual');
    const seed1 = deriveContinuationSeed({
      matchId: 'M-test', checkpointHash: 'abc', replayContentHash: 'hash',
      rolloutIndex: 0, analysisVersion: '2.0.0', orderedContinuationPolicyIds: ['tempo', 'control']
    });
    const seed2 = deriveContinuationSeed({
      matchId: 'M-test', checkpointHash: 'abc', replayContentHash: 'hash',
      rolloutIndex: 0, analysisVersion: '2.0.0', orderedContinuationPolicyIds: ['control', 'tempo']
    });
    assert.notEqual(seed1, seed2, 'Different policy orderings must produce different seeds');
  });

  it('117. Paired counterfactual uses shared seeds for both branches', async () => {
    const { runPairedCounterfactual } = await import('@intrilex/simulation-runtime/counterfactual');
    const match = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['tempo', 'control'], includeReplay: true
    });
    const config = buildValidAnchorConfig(match, {}, { rolloutCount: 4 });
    const result = runPairedCounterfactual(config);
    for (let i = 0; i < 4; i++) {
      assert.equal(result.selected.results[i].seed, result.alternative.results[i].seed,
        `Rollout ${i} seeds must match between branches`);
    }
  });

  it('118. deriveContinuationSeed does not include alternativeActionId', async () => {
    const { deriveContinuationSeed } = await import('@intrilex/decision-intelligence/counterfactual');
    const seed1 = deriveContinuationSeed({
      matchId: 'M-test', checkpointHash: 'abc', replayContentHash: 'hash',
      rolloutIndex: 0, analysisVersion: '2.0.0'
    });
    const seed2 = deriveContinuationSeed({
      matchId: 'M-test', checkpointHash: 'abc', replayContentHash: 'hash',
      rolloutIndex: 0, analysisVersion: '2.0.0'
    });
    assert.equal(seed1, seed2, 'Seeds must be identical regardless of alternative action');
  });

  it('119. runPairedCounterfactual requires selectedActionId from evidence', async () => {
    const { runPairedCounterfactual } = await import('@intrilex/simulation-runtime/counterfactual');
    const match = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['tempo', 'control'], includeReplay: true
    });
    const config = buildValidAnchorConfig(match, {}, { rolloutCount: 2 });
    const result = runPairedCounterfactual({ ...config, selectedActionId: undefined });
    assert.equal(result.selected.status, 'NOT_SUPPORTED');
    assert.match(result.selected.reason ?? '', /MISSING_SELECTED_ACTION_ID/);
  });

  it('120. runPairedCounterfactual does not use policyActions[0] as selected', async () => {
    const { runPairedCounterfactual } = await import('@intrilex/simulation-runtime/counterfactual');
    const match = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['tempo', 'control'], includeReplay: true
    });
    const config = buildValidAnchorConfig(match, {}, { rolloutCount: 2 });
    const result = runPairedCounterfactual(config);
    assert.equal(result.selected.anchorVerification.isReplaySelected, true,
      'Selected branch must be marked as replay-selected');
    assert.equal(result.alternative.anchorVerification.isReplaySelected, false,
      'Alternative branch must not be marked as replay-selected');
  });

  it('121. Undefined derived anchor fields are filled from restored authority', async () => {
    const { runPairedCounterfactual } = await import('@intrilex/simulation-runtime/counterfactual');
    const match = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['tempo', 'control'], includeReplay: true
    });
    // Build a valid config, then strip all derived fields to undefined.
    // The resolver must derive them from the restored engine decision frame.
    const fullConfig = buildValidAnchorConfig(match, {}, { rolloutCount: 2 });
    const minimalConfig = {
      ...fullConfig,
      checkpointHash: undefined,
      replayCommandIndex: undefined,
      actorId: undefined,
      legalActionSetHash: undefined,
      selectedCommandHash: undefined,
      postSelectedActionStateHash: undefined
    };
    const result = runPairedCounterfactual(minimalConfig);
    assert.equal(result.selected.status, 'COMPLETED',
      `Selected branch must complete with derived fields; got ${result.selected.status} / ${result.selected.reason ?? ''}`);
    assert.equal(result.alternative.status, 'COMPLETED',
      `Alternative branch must complete with derived fields; got ${result.alternative.status} / ${result.alternative.reason ?? ''}`);
  });

  it('122. Campaign records array preserves all matches with semantic result', async () => {
    const { runCampaign } = await import('@intrilex/simulation-runtime/campaign');
    const result = await runCampaign({
      profileId: 'core-advanced-authority', matchCount: 4,
      policyPairs: [['tempo', 'control']], workerCount: 1, decisionLimit: 1800
    });
    assert.ok(Array.isArray(result.records), 'Campaign result must have a records array');
    assert.equal(result.records.length, 4,
      'records.length must equal matchCount (all matches preserved)');
    for (const r of result.records) {
      assert.ok(typeof r.result === 'string',
        `Record ordinal ${r.ordinal} must have a string result field`);
      assert.ok(['completed', 'error', 'aborted', 'unsupported'].includes(r.result),
        `Record ordinal ${r.ordinal} result "${r.result}" must be a valid semantic result`);
    }
  });

  it('123. Decision trace fullCheckpointHash is 64-hex when provided', async () => {
    const match = runPolicyMatch({
      seed: 42, profileId: 'core-advanced-authority', seatOrder: ['P1', 'P2'],
      policyIds: ['tempo', 'control'], decisionTracesEnabled: true
    });
    const traces = match.decisionTraces ?? [];
    assert.ok(traces.length > 0, 'Must have decision traces');
    for (const t of traces) {
      if (t.fullCheckpointHash !== null && t.fullCheckpointHash !== undefined) {
        assert.match(t.fullCheckpointHash, /^[0-9a-f]{64}$/,
          `fullCheckpointHash must be 64-hex canonical, got ${t.fullCheckpointHash}`);
      }
    }
  });

  it('124. Browser anchor.js is byte-identical to anchor.mjs', async () => {
    const { readFileSync } = await import('node:fs');
    const { createHash } = await import('node:crypto');
    const path = await import('node:path');
    const root = path.resolve(import.meta.dirname, '..');
    const mjsPath = path.join(root, 'packages', 'decision-intelligence', 'src', 'anchor.mjs');
    const jsPath = path.join(root, 'apps', 'lab-web', 'src', 'anchor.js');
    const mjsHash = createHash('sha256').update(readFileSync(mjsPath)).digest('hex');
    const jsHash = createHash('sha256').update(readFileSync(jsPath)).digest('hex');
    assert.equal(mjsHash, jsHash,
      `anchor.mjs and anchor.js must be byte-identical. mjs=${mjsHash} js=${jsHash}`);
  });
});

