#!/usr/bin/env node
/**
 * Cognition Pass Performance Profiler
 *
 * Measures the overhead of the HYBRIX cognition pipeline:
 *   1. assessIntrilexBoardState
 *   2. applyCognitionToLegalAction
 *   3. applyPersonalityToLegalAction
 *   4. applyNudgesToLegalAction
 *   5. applyDifficultyToLegal
 *   6. Full choose() end-to-end
 *
 * Also compares against baseline (score-rush) to measure cognition overhead.
 */

import { performance } from 'node:perf_hooks';
import { createHybrixAgent, DEFAULT_CONFIG } from '@intrilex/game-ai';
import { scorePolicyAction, rankPolicyActions } from '@intrilex/policies/scoring';
import { DeterministicPolicyRng } from '@intrilex/policy-sdk';

const ITERATIONS = 10000;
const WARMUP = 1000;

function makeMockContext(actionCount = 12) {
  const actions = [];
  const families = ['score', 'counter', 'disrupt', 'draw', 'anchor', 'swap-bar', 'response-decline', 'exhausted-pass', 'effect-six', 'scuttle', 'quick', 'private-choice'];
  for (let i = 0; i < actionCount; i++) {
    actions.push({
      actionId: `act-${i}`,
      family: families[i % families.length],
      featureVector: {
        immediateScore: Math.floor(Math.random() * 20),
        targetPointValue: Math.floor(Math.random() * 15),
        selectedCount: Math.floor(Math.random() * 3),
        generatedActionKind: i % 5 === 0 ? 'effect' : '',
      },
      targetHandles: [`card-${i}`],
      sourceHandles: i % 3 === 0 ? [`src-${i}`] : [],
      timingClass: i % 4 === 0 ? 'QUICK' : 'NORMAL',
      mode: 'normal',
    });
  }
  return {
    matchId: 'profile-match',
    decisionIndex: 0,
    actorId: 'P1',
    authorizedView: {
      own: { securedPoints: 45, goal: 121, hand: ['c1', 'c2', 'c3', 'c4', 'c5'], deckCount: 12 },
      opponents: [{ playerId: 'P2', securedPoints: 60, goal: 121, handCount: 4 }],
      stack: [{ controllerId: 'P2', class: 'face' }, { controllerId: 'P1', class: 'face' }],
      knownCards: { 'card-0': { pointValue: 10 }, 'card-1': { pointValue: 5 } },
    },
    legalActions: actions,
    rng: new DeterministicPolicyRng(42),
    traits: {},
  };
}

function bench(label, fn, iterations = ITERATIONS) {
  // Warmup
  for (let i = 0; i < WARMUP; i++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = performance.now() - start;
  const perOp = elapsed / iterations;

  return { label, iterations, elapsedMs: elapsed, perOpMs: perOp, perOpUs: perOp * 1000, opsPerSec: iterations / (elapsed / 1000) };
}

function formatResult(r) {
  return `  ${r.label.padEnd(45)} ${r.perOpUs.toFixed(2)}µs/op  (${r.opsPerSec.toFixed(0).padStart(8)} ops/s)  [${r.elapsedMs.toFixed(1)}ms / ${r.iterations} iters]`;
}

// ── Profile individual stages ────────────────────────────────
console.log('═'.repeat(80));
console.log('  Cognition Pass Performance Profiler');
console.log(`  ${ITERATIONS.toLocaleString()} iterations (after ${WARMUP.toLocaleString()} warmup)`);
console.log('═'.repeat(80));

const ctx = makeMockContext(12);
const agent = createHybrixAgent({ botId: 'P1', archetype: 'rusher', difficulty: 'hard', config: DEFAULT_CONFIG });

// 1. Baseline: pure domain scoring (no cognition)
const baselineResult = bench('Baseline: scorePolicyAction (per action)', () => {
  scorePolicyAction('score-rush', ctx.legalActions[0], ctx);
});
console.log('\n─ Stage 1: Domain Scoring (baseline) ─');
console.log(formatResult(baselineResult));

// 2. Full rankPolicyActions (all actions)
const rankResult = bench('Baseline: rankPolicyActions (12 actions)', () => {
  rankPolicyActions('score-rush', ctx.legalActions, ctx);
});
console.log(formatResult(rankResult));

// 3. Full HYBRIX choose() — includes cognition + personality + memory + difficulty
// Need fresh context each time since rng is consumed
const chooseResult = bench('HYBRIX choose() — full pipeline', () => {
  const freshCtx = makeMockContext(12);
  agent.choose(freshCtx);
});
console.log('\n─ Stage 2: Full HYBRIX choose() pipeline ─');
console.log(formatResult(chooseResult));

// 4. Measure cognition overhead specifically
// We do this by comparing choose() with intensity=0 vs intensity=0.5
const agentNoCognition = createHybrixAgent({ botId: 'P1', archetype: 'rusher', difficulty: 'hard', config: { ...DEFAULT_CONFIG, personalityIntensity: 0 } });
const agentWithCognition = createHybrixAgent({ botId: 'P1', archetype: 'rusher', difficulty: 'hard', config: { ...DEFAULT_CONFIG, personalityIntensity: 0.5 } });

const noCogResult = bench('HYBRIX choose() — cognition disabled (intensity=0)', () => {
  const freshCtx = makeMockContext(12);
  agentNoCognition.choose(freshCtx);
});
const withCogResult = bench('HYBRIX choose() — cognition enabled (intensity=0.5)', () => {
  const freshCtx = makeMockContext(12);
  agentWithCognition.choose(freshCtx);
});

console.log('\n─ Stage 3: Cognition overhead comparison ─');
console.log(formatResult(noCogResult));
console.log(formatResult(withCogResult));
const overhead = withCogResult.perOpMs - noCogResult.perOpMs;
const overheadPct = (overhead / noCogResult.perOpMs) * 100;
console.log(`  ${'Cognition overhead'.padEnd(45)} ${overhead >= 0 ? '+' : ''}${(overhead * 1000).toFixed(2)}µs/op  (${overheadPct.toFixed(1)}%)`);

// 5. Vary action count
console.log('\n─ Stage 4: Scaling with action count ─');
for (const count of [4, 8, 12, 20, 30]) {
  const r = bench(`HYBRIX choose() with ${count} actions`, () => {
    const freshCtx = makeMockContext(count);
    agent.choose(freshCtx);
  });
  console.log(formatResult(r));
}

// 6. Memory snapshot overhead
const memResult = bench('Memory snapshot (getSnapshot)', () => {
  agent.memory.getSnapshot();
});
console.log('\n─ Stage 5: Auxiliary operations ─');
console.log(formatResult(memResult));

const debugResult = bench('Debug recordTrace', () => {
  agent.debug.recordTrace({ btNode: 'TACTICAL', selectedAction: 'act-0', score: 100, tick: 0 });
});
console.log(formatResult(debugResult));

// Summary
console.log('\n' + '═'.repeat(80));
console.log('  SUMMARY');
console.log('═'.repeat(80));
console.log(`  Baseline scoring:   ${baselineResult.perOpUs.toFixed(2)}µs per action`);
console.log(`  Full choose():      ${chooseResult.perOpUs.toFixed(2)}µs per decision (12 actions)`);
console.log(`  Cognition overhead: ${overhead >= 0 ? '+' : ''}${(overhead * 1000).toFixed(2)}µs (${overheadPct.toFixed(1)}%)`);
console.log(`  Throughput:         ${chooseResult.opsPerSec.toFixed(0)} decisions/sec`);
console.log(`  Match (25 decisions): ${(25 / chooseResult.opsPerSec * 1000).toFixed(2)}ms`);
console.log(`  Match (130 decisions): ${(130 / chooseResult.opsPerSec * 1000).toFixed(2)}ms`);
console.log('═'.repeat(80));
