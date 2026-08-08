#!/usr/bin/env node
/**
 * HYBRIX AI — Demo Script
 *
 * Runs simulation matches with HYBRIX AI policies vs baseline policies.
 * Demonstrates that HYBRIX agents are fully integrated and functional
 * within the existing simulation runtime.
 */

import { runPolicyMatch } from '@intrilex/simulation-runtime';
import { POLICY_BY_ID } from '@intrilex/simulation-runtime/policy-catalog';

const matchups = [
  { label: 'HYBRIX Rusher vs SCORE_RUSH',    p1: 'hybrix-rusher',       p2: 'score-rush' },
  { label: 'HYBRIX Defender vs CONTROL',     p1: 'hybrix-defender',     p2: 'control' },
  { label: 'HYBRIX Trickster vs TEMPO',      p1: 'hybrix-trickster',    p2: 'tempo' },
  { label: 'HYBRIX Sniper vs VALUE',         p1: 'hybrix-sniper',       p2: 'value' },
  { label: 'HYBRIX Rusher (hard) vs VALUE',  p1: 'hybrix-rusher-hard',  p2: 'value' },
  { label: 'HYBRIX Defender (hard) vs CONTROL', p1: 'hybrix-defender-hard', p2: 'control' },
  { label: 'HYBRIX Rusher vs HYBRIX Defender', p1: 'hybrix-rusher',     p2: 'hybrix-defender' },
  { label: 'HYBRIX Trickster vs HYBRIX Sniper', p1: 'hybrix-trickster', p2: 'hybrix-sniper' }
];

console.log('═'.repeat(72));
console.log('  HYBRIX AI Demo — Simulation Matches');
console.log('═'.repeat(72));
console.log();

let hybrixWins = 0, baselineWins = 0, draws = 0;

for (const matchup of matchups) {
  if (!POLICY_BY_ID[matchup.p1]) {
    console.log(`  ✗ Policy not found: ${matchup.p1}`);
    continue;
  }
  if (!POLICY_BY_ID[matchup.p2]) {
    console.log(`  ✗ Policy not found: ${matchup.p2}`);
    continue;
  }

  try {
    const result = runPolicyMatch({
      policyIds: [matchup.p1, matchup.p2],
      seed: 42,
      decisionLimit: 1800,
      telemetryEnabled: true,
      decisionTracesEnabled: false
    });

    const s = result.summary;
    const p1Result = s.participants[0].result;
    const p2Result = s.participants[1].result;
    const p1Decisions = s.participants[0].decisionCount;
    const p2Decisions = s.participants[1].decisionCount;
    const margin = s.scoreMargin;

    let icon, winner;
    if (p1Result === 'win') { icon = '→'; winner = matchup.p1; hybrixWins++; }
    else if (p2Result === 'win') { icon = '←'; winner = matchup.p2; baselineWins++; }
    else { icon = '='; winner = 'DRAW'; draws++; }

    const isHybrixP1 = matchup.p1.startsWith('hybrix');
    const isHybrixP2 = matchup.p2.startsWith('hybrix');
    const hybrixWon = (p1Result === 'win' && isHybrixP1) || (p2Result === 'win' && isHybrixP2);

    console.log(`  ${icon} ${matchup.label}`);
    console.log(`    Winner: ${winner}  |  Score: ${s.finalScores.P1}–${s.finalScores.P2}  |  Margin: ${margin}`);
    console.log(`    Decisions: ${p1Decisions} vs ${p2Decisions}  |  Turns: ${s.completedFullTurns}  |  Termination: ${s.terminationReason}`);
    console.log(`    HYBRIX ${hybrixWon ? 'WON' : (winner === 'DRAW' ? 'DRAW' : 'LOST')}`);
    console.log();
  } catch (err) {
    console.log(`  ✗ ${matchup.label}: ${err.message}`);
    console.log();
  }
}

console.log('─'.repeat(72));
console.log(`  HYBRIX Wins: ${hybrixWins}  |  Baseline Wins: ${baselineWins}  |  Draws: ${draws}`);
console.log('─'.repeat(72));
