#!/usr/bin/env node
/**
 * HYBRIX AI — Batch Benchmark
 *
 * Runs N matches per matchup across multiple seeds for statistically
 * significant win-rate comparison. Outputs structured JSON report.
 */

import { runPolicyMatch } from '@intrilex/simulation-runtime';
import { POLICY_BY_ID } from '@intrilex/simulation-runtime/policy-catalog';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = join(__dirname, '..', 'reports', 'hybrix-benchmark.json');

const MATCHUPS = [
  { label: 'HYBRIX Rusher vs SCORE_RUSH',         p1: 'hybrix-rusher',           p2: 'score-rush' },
  { label: 'HYBRIX Defender vs CONTROL',           p1: 'hybrix-defender',         p2: 'control' },
  { label: 'HYBRIX Trickster vs TEMPO',            p1: 'hybrix-trickster',        p2: 'tempo' },
  { label: 'HYBRIX Sniper vs VALUE',               p1: 'hybrix-sniper',           p2: 'value' },
  { label: 'HYBRIX Support vs VALUE',              p1: 'hybrix-support',          p2: 'value' },
  { label: 'HYBRIX Tank vs CONTROL',               p1: 'hybrix-tank',             p2: 'control' },
  { label: 'HYBRIX Rusher (hard) vs SCORE_RUSH',   p1: 'hybrix-rusher-hard',      p2: 'score-rush' },
  { label: 'HYBRIX Defender (hard) vs CONTROL',    p1: 'hybrix-defender-hard',    p2: 'control' },
  { label: 'HYBRIX Trickster (hard) vs TEMPO',     p1: 'hybrix-trickster-hard',   p2: 'tempo' },
  { label: 'HYBRIX Sniper (hard) vs VALUE',        p1: 'hybrix-sniper-hard',      p2: 'value' },
  { label: 'HYBRIX Rusher (easy) vs SCORE_RUSH',   p1: 'hybrix-rusher-easy',      p2: 'score-rush' },
  { label: 'HYBRIX Defender (easy) vs CONTROL',    p1: 'hybrix-defender-easy',    p2: 'control' },
  { label: 'HYBRIX Rusher (nightmare) vs VALUE',   p1: 'hybrix-rusher-nightmare', p2: 'value' },
  { label: 'HYBRIX Defender (nightmare) vs CONTROL', p1: 'hybrix-defender-nightmare', p2: 'control' },
  { label: 'HYBRIX Rusher vs HYBRIX Defender',     p1: 'hybrix-rusher',           p2: 'hybrix-defender' },
  { label: 'HYBRIX Trickster vs HYBRIX Sniper',    p1: 'hybrix-trickster',        p2: 'hybrix-sniper' },
  { label: 'HYBRIX Support vs HYBRIX Tank',        p1: 'hybrix-support',          p2: 'hybrix-tank' },
  { label: 'HYBRIX Rusher (hard) vs HYBRIX Defender (hard)', p1: 'hybrix-rusher-hard', p2: 'hybrix-defender-hard' }
];

const MATCHES_PER_MATCHUP = Number(process.env.BENCH_MATCHES ?? 200);
const SEED_BASE = 1000;
const Z_95 = 1.96;
const Z_99 = 2.576;

/** Wilson score interval for binomial proportion */
function wilsonInterval(wins, n, z = Z_95) {
  if (n === 0) return { lower: 0, upper: 0, center: 0 };
  const p = wins / n;
  const denom = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / denom;
  const spread = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n) / denom;
  return { lower: Math.max(0, center - spread), upper: Math.min(1, center + spread), center };
}

/** Cohen's h effect size for difference between two proportions */
function cohensH(p1, p2) {
  return 2 * Math.abs(Math.asin(Math.sqrt(p1)) - Math.asin(Math.sqrt(p2)));
}

/** Interpret Cohen's h magnitude */
function interpretH(h) {
  if (h < 0.2) return 'negligible';
  if (h < 0.5) return 'small';
  if (h < 0.8) return 'medium';
  return 'large';
}

console.log('═'.repeat(72));
console.log('  HYBRIX AI — Batch Benchmark');
console.log(`  ${MATCHUPS.length} matchups × ${MATCHES_PER_MATCHUP} matches = ${MATCHUPS.length * MATCHES_PER_MATCHUP} total`);
console.log('═'.repeat(72));
console.log();

const report = {
  timestamp: new Date().toISOString(),
  matchesPerMatchup: MATCHES_PER_MATCHUP,
  matchups: []
};

let totalHybrixWins = 0, totalBaselineWins = 0, totalDraws = 0, totalErrors = 0, totalUnsupported = 0, totalMatches = 0;
let matchupIdx = 0;

for (const matchup of MATCHUPS) {
  matchupIdx++;
  if (!POLICY_BY_ID[matchup.p1] || !POLICY_BY_ID[matchup.p2]) {
    console.log(`  ✗ Skipping ${matchup.label} — policy not found`);
    continue;
  }

  process.stderr.write(`\r  [${matchupIdx}/${MATCHUPS.length}] ${matchup.label}...          `);

  // Seat-balanced: run half with p1 in seat 1, half with p1 in seat 2
  const halfCount = Math.floor(MATCHES_PER_MATCHUP / 2);


  let p1Wins = 0, p2Wins = 0, draws = 0, errors = 0, unsupported = 0;
  let p1ScoreSum = 0, p2ScoreSum = 0;
  let decisionCountSum = 0;
  let turnCountSum = 0;
  let terminationReasons = {};
  const scoreMargins = [];
  let hybrixWinsSeat1 = 0, hybrixWinsSeat2 = 0;
  let hybrixLossesSeat1 = 0, hybrixLossesSeat2 = 0;
  let policyAWins = 0, policyBWins = 0;

  for (let i = 0; i < MATCHES_PER_MATCHUP; i++) {
    if (i % 50 === 0 && i > 0) process.stderr.write(`\r  [${matchupIdx}/${MATCHUPS.length}] ${matchup.label} — ${i}/${MATCHES_PER_MATCHUP} matches          `);
    const seed = SEED_BASE + i;
    const seatOrder = (i % 2 === 0) ? [matchup.p1, matchup.p2] : [matchup.p2, matchup.p1];
    const p1IsHybrix = matchup.p1.startsWith('hybrix');
    const p2IsHybrix = matchup.p2.startsWith('hybrix');
    const hybrixInSeat1 = (i % 2 === 0) ? p1IsHybrix : p2IsHybrix;
    try {
      const result = runPolicyMatch({
        policyIds: seatOrder,
        seed,
        decisionLimit: 1800,
        telemetryEnabled: false,
        decisionTracesEnabled: false
      });

      const s = result.summary;
      const p1Result = s.participants[0].result;
      const p2Result = s.participants[1].result;
      const term = s.terminationReason ?? 'UNKNOWN';
      terminationReasons[term] = (terminationReasons[term] ?? 0) + 1;

      if (term === 'UNSUPPORTED_CONFIGURATION') { unsupported++; continue; }

      if (p1Result === 'win') { p1Wins++; policyAWins += (seatOrder[0] === matchup.p1) ? 1 : 0; policyBWins += (seatOrder[0] === matchup.p2) ? 1 : 0; }
      else if (p2Result === 'win') { p2Wins++; policyAWins += (seatOrder[1] === matchup.p1) ? 1 : 0; policyBWins += (seatOrder[1] === matchup.p2) ? 1 : 0; }
      else draws++;

      if (hybrixInSeat1 && p1Result === 'win') hybrixWinsSeat1++;
      if (!hybrixInSeat1 && p2Result === 'win') hybrixWinsSeat2++;
      if (hybrixInSeat1 && p2Result === 'win') hybrixLossesSeat1++;
      if (!hybrixInSeat1 && p1Result === 'win') hybrixLossesSeat2++;

      p1ScoreSum += s.finalScores.P1 ?? 0;
      p2ScoreSum += s.finalScores.P2 ?? 0;
      decisionCountSum += s.participants[0].decisionCount + s.participants[1].decisionCount;
      turnCountSum += s.completedFullTurns ?? 0;
      scoreMargins.push(s.scoreMargin ?? 0);
    } catch (err) {
      errors++;
      terminationReasons['ERROR'] = (terminationReasons['ERROR'] ?? 0) + 1;
    }
  }

  const isHybrixP1 = matchup.p1.startsWith('hybrix');
  const isHybrixP2 = matchup.p2.startsWith('hybrix');
  const isSelfPlay = isHybrixP1 && isHybrixP2;
  const isVsBaseline = isHybrixP1 !== isHybrixP2;

  const policyAWinRate = policyAWins / MATCHES_PER_MATCHUP;
  const policyBWinRate = policyBWins / MATCHES_PER_MATCHUP;

  const hybrixWins = isSelfPlay ? 0 : (isHybrixP1 ? policyAWins : policyBWins);
  const baselineWins = isSelfPlay ? 0 : (isHybrixP1 ? policyBWins : policyAWins);
  const hybrixWinRate = isVsBaseline ? (hybrixWins / MATCHES_PER_MATCHUP) : 0;

  const ci95 = wilsonInterval(hybrixWins, MATCHES_PER_MATCHUP, Z_95);
  const ci99 = wilsonInterval(hybrixWins, MATCHES_PER_MATCHUP, Z_99);


  const seat1WinRate = hybrixWinsSeat1 / (hybrixWinsSeat1 + hybrixLossesSeat1 || 1);
  const seat2WinRate = hybrixWinsSeat2 / (hybrixWinsSeat2 + hybrixLossesSeat2 || 1);
  const seatImbalance = Math.abs(seat1WinRate - seat2WinRate);

  if (isVsBaseline) {
    totalHybrixWins += hybrixWins;
    totalBaselineWins += baselineWins;
  } else if (isSelfPlay) {
    totalHybrixWins += p1Wins + p2Wins;
    totalBaselineWins += 0;
  }
  totalDraws += draws;
  totalErrors += errors;
  totalUnsupported += unsupported;
  totalMatches += MATCHES_PER_MATCHUP;

  const avgMargin = scoreMargins.reduce((a, b) => a + b, 0) / scoreMargins.length;
  const avgP1Score = (p1ScoreSum / MATCHES_PER_MATCHUP).toFixed(1);
  const avgP2Score = (p2ScoreSum / MATCHES_PER_MATCHUP).toFixed(1);
  const avgDecisions = (decisionCountSum / MATCHES_PER_MATCHUP).toFixed(1);
  const avgTurns = (turnCountSum / MATCHES_PER_MATCHUP).toFixed(1);

  const matchupReport = {
    label: matchup.label,
    p1: matchup.p1,
    p2: matchup.p2,
    matches: MATCHES_PER_MATCHUP,
    p1Wins, p2Wins, draws, errors, unsupported,
    isSelfPlay,
    isVsBaseline,
    policyAWins, policyBWins,
    policyAWinRate: Number(policyAWinRate.toFixed(3)),
    policyBWinRate: Number(policyBWinRate.toFixed(3)),
    accountingCheck: policyAWins + policyBWins + draws + errors + unsupported === MATCHES_PER_MATCHUP,
    hybrixWinRate: Number(hybrixWinRate.toFixed(3)),
    wilson95: { lower: Number(ci95.lower.toFixed(3)), upper: Number(ci95.upper.toFixed(3)) },
    wilson99: { lower: Number(ci99.lower.toFixed(3)), upper: Number(ci99.upper.toFixed(3)) },
    cohensH: Number(cohensH(hybrixWinRate, 0.5).toFixed(3)),
    effectSize: interpretH(cohensH(hybrixWinRate, 0.5)),
    seatBalance: {
      seat1WinRate: Number(seat1WinRate.toFixed(3)),
      seat2WinRate: Number(seat2WinRate.toFixed(3)),
      imbalance: Number(seatImbalance.toFixed(3)),
      seat1CI: { lower: Number(wilsonInterval(hybrixWinsSeat1, hybrixWinsSeat1 + hybrixLossesSeat1).lower.toFixed(3)), upper: Number(wilsonInterval(hybrixWinsSeat1, hybrixWinsSeat1 + hybrixLossesSeat1).upper.toFixed(3)) },
      seat2CI: { lower: Number(wilsonInterval(hybrixWinsSeat2, hybrixWinsSeat2 + hybrixLossesSeat2).lower.toFixed(3)), upper: Number(wilsonInterval(hybrixWinsSeat2, hybrixWinsSeat2 + hybrixLossesSeat2).upper.toFixed(3)) }
    },
    avgP1Score: Number(avgP1Score),
    avgP2Score: Number(avgP2Score),
    avgMargin: Number(avgMargin.toFixed(1)),
    avgDecisions: Number(avgDecisions),
    avgTurns: Number(avgTurns),
    terminationReasons
  };
  report.matchups.push(matchupReport);

  process.stderr.write('\r' + ' '.repeat(80) + '\r');
  const bar = '█'.repeat(Math.round(hybrixWinRate * 20)).padEnd(20, '░');
  const icon = hybrixWinRate > 0.55 ? '✓' : hybrixWinRate < 0.45 ? '✗' : '≈';
  const h = cohensH(hybrixWinRate, 0.5);
  console.log(`  ${icon} ${matchup.label}`);
  console.log(`    HYBRIX WR: ${(hybrixWinRate * 100).toFixed(1)}% [95%: ${(ci95.lower * 100).toFixed(1)}–${(ci95.upper * 100).toFixed(1)}%] [99%: ${(ci99.lower * 100).toFixed(1)}–${(ci99.upper * 100).toFixed(1)}%]  [${bar}]  ${hybrixWins}W/${baselineWins}L/${draws}D`);
  console.log(`    Effect size: Cohen's h=${h.toFixed(3)} (${interpretH(h)})  |  Seat balance: S1=${(seat1WinRate * 100).toFixed(0)}% S2=${(seat2WinRate * 100).toFixed(0)}% Δ=${(seatImbalance * 100).toFixed(1)}pp`);
  console.log(`    Avg score: ${avgP1Score}–${avgP2Score}  |  Margin: ${avgMargin.toFixed(1)}  |  Turns: ${avgTurns}  |  Decisions: ${avgDecisions}`);
  console.log();
}

const overallCI95 = wilsonInterval(totalHybrixWins, totalMatches, Z_95);
const overallCI99 = wilsonInterval(totalHybrixWins, totalMatches, Z_99);

report.totals = {
  totalMatches,
  totalHybrixWins,
  totalBaselineWins,
  totalDraws,
  totalErrors,
  totalUnsupported,
  accountingInvariant: totalHybrixWins + totalBaselineWins + totalDraws + totalErrors + totalUnsupported === totalMatches,
  overallHybrixWinRate: Number((totalHybrixWins / totalMatches).toFixed(3)),
  overallWilson95: { lower: Number(overallCI95.lower.toFixed(3)), upper: Number(overallCI95.upper.toFixed(3)) },
  overallWilson99: { lower: Number(overallCI99.lower.toFixed(3)), upper: Number(overallCI99.upper.toFixed(3)) }
};

console.log('═'.repeat(72));
console.log(`  OVERALL: HYBRIX ${totalHybrixWins}W / Baseline ${totalBaselineWins}W / ${totalDraws}D  (${((totalHybrixWins / totalMatches) * 100).toFixed(1)}% WR)`);
console.log(`  95% CI: [${(overallCI95.lower * 100).toFixed(1)}%, ${(overallCI95.upper * 100).toFixed(1)}%]  |  99% CI: [${(overallCI99.lower * 100).toFixed(1)}%, ${(overallCI99.upper * 100).toFixed(1)}%]`);
console.log('═'.repeat(72));

writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
console.log(`\n  Report saved: ${REPORT_PATH}`);
if (!report.totals.accountingInvariant) {
  console.error(`\n  ✗ ACCOUNTING INVARIANT FAILED: ${totalHybrixWins}W + ${totalBaselineWins}W + ${totalDraws}D + ${totalErrors}E + ${totalUnsupported}U = ${totalHybrixWins + totalBaselineWins + totalDraws + totalErrors + totalUnsupported} ≠ ${totalMatches} total matches`);
  process.exit(1);
}
console.log(`  ACCOUNTING INVARIANT PASS: ${totalHybrixWins}W + ${totalBaselineWins}W + ${totalDraws}D + ${totalErrors}E + ${totalUnsupported}U = ${totalMatches}`);
