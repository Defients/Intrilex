#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// run-experiment.mjs — v0.28.2 Evidence Recalibration experiment runner
//
// Reads an experiment preset from config/experiments/ and executes it
// against the repaired engine, producing evidence-epoch-tagged results.
//
// Usage:
//   node scripts/run-experiment.mjs --preset EXP-01-2B2R-HOLD-FIRE
//   node scripts/run-experiment.mjs --preset EXP-06-UNRESTRICTED-BENCHMARK --matches 576
//   node scripts/run-experiment.mjs --list
// ═══════════════════════════════════════════════════════════════
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import { runCampaign, campaignAggregate } from '@intrilex/simulation-runtime/campaign';
import { runPolicyMatch } from '@intrilex/simulation-runtime';
import { POLICY_CATALOG, POLICY_BY_ID } from '@intrilex/simulation-runtime/policy-catalog';
import { hashCanonical } from '@intrilex/shared';
import { loadReleaseIdentity } from '@intrilex/shared/release-identity';
import { wilsonInterval } from '@intrilex/statistics';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const presetsDir = path.join(root, 'config/experiments');
const outputDir = path.join(root, 'sample-data/experiments-v0282');
const reportsDir = path.join(root, 'reports/experiments-v0282');

const args = process.argv.slice(2);
const listMode = args.includes('--list');
const presetIdx = args.indexOf('--preset');
const presetName = presetIdx >= 0 ? args[presetIdx + 1] : null;
const matchesOverrideIdx = args.indexOf('--matches');
const matchesOverride = matchesOverrideIdx >= 0 ? Number(args[matchesOverrideIdx + 1]) : null;

function log(msg) { console.log(`[run-experiment] ${msg}`); }

async function loadPreset(name) {
  const presetPath = path.join(presetsDir, `${name}.json`);
  if (!existsSync(presetPath)) throw new Error(`Preset not found: ${presetPath}`);
  return JSON.parse(await readFile(presetPath, 'utf8'));
}

function resolvePolicyPairs(preset) {
  if (preset.policyPairs === 'full-12-policy-round-robin' || preset.policyPairs === 'full-12-policy-catalog') {
    const BASE_POLICY_IDS = POLICY_CATALOG.filter(p => !p.policyId.startsWith('hybrix-')).map(p => p.policyId);
    const HYBRIX_NORMAL_IDS = POLICY_CATALOG.filter(p => p.policyId.startsWith('hybrix-') && !p.policyId.endsWith('-easy') && !p.policyId.endsWith('-hard') && !p.policyId.endsWith('-nightmare')).map(p => p.policyId);
    const ids = [...BASE_POLICY_IDS, ...HYBRIX_NORMAL_IDS];
    return ids.flatMap(left => ids.map(right => [left, right]));
  }
  return preset.policyPairs;
}

async function runExperiment(preset) {
  const identity = await loadReleaseIdentity();
  const engineManifest = JSON.parse(await readFile(path.join(root, 'config/engine-manifest.json'), 'utf8'));
  const authorityHash = engineManifest.rankAuthority?.authorityHash ?? null;
  const releaseIdentityHash = identity.integrityHash ?? null;

  const profileId = preset.authorityProfile ?? 'core-advanced-authority';
  const policyPairs = resolvePolicyPairs(preset);
  const matchCount = matchesOverride ?? preset.matchCount ?? preset.matchCountPerCondition ?? 100;
  const decisionLimit = preset.decisionLimit ?? 3600;

  log(`Experiment: ${preset.experimentId}`);
  log(`Profile: ${profileId}`);
  log(`Policy pairs: ${policyPairs.length}`);
  log(`Match count: ${matchCount}`);
  log(`Evidence epoch: ${preset.evidenceEpoch}`);

  const config = {
    profileId,
    matchCount,
    policyPairs,
    decisionLimit,
    evidenceEpoch: preset.evidenceEpoch ?? 'post-rules-parity-repair-v0.28.1',
    postRulesParityRepair: preset.postRulesParityRepair ?? true,
    authorityHash,
    releaseIdentityHash,
    workerCount: 1
  };

  const startedAt = new Date().toISOString();
  const started = performance.now();
  const campaign = await runCampaign(config);
  const durationMs = Math.round(performance.now() - started);
  const aggregate = campaignAggregate(campaign);

  // Compute experiment-specific metrics
  const metrics = computeExperimentMetrics(preset, campaign, aggregate);

  const result = {
    schemaVersion: '1.0.0',
    experimentId: preset.experimentId,
    evidenceEpoch: preset.evidenceEpoch,
    postRulesParityRepair: preset.postRulesParityRepair,
    authorityHash,
    releaseIdentityHash,
    engineVersion: identity.engineVersion,
    rulesVersion: identity.rulesVersion,
    labVersion: identity.version,
    profileId,
    hypothesis: preset.hypothesis,
    independentVariable: preset.independentVariable,
    falsificationCriterion: preset.falsificationCriterion,
    prerequisiteGates: preset.prerequisiteGates ?? [],
    policyStrengthTiers: Object.fromEntries(POLICY_CATALOG.map(p => [p.policyId, p.strengthTier])),
    matchCount: campaign.matchCount,
    completedMatchCount: aggregate.completedMatchCount,
    durationMs,
    startedAt,
    experimentHash: campaign.experimentHash,
    canonicalResultHash: campaign.canonicalResultHash,
    aggregateHash: aggregate.aggregateHash,
    seat1WinRate: aggregate.seat1WinRate,
    seat1Wilson95: aggregate.seat1Wilson95,
    selfPlayExcluded: aggregate.selfPlayExcluded ?? true,
    terminationCounts: aggregate.terminationCounts,
    metrics,
    policies: aggregate.policies,
    matchups: aggregate.matchups,
    interpretationBoundary: aggregate.interpretationBoundary,
    admissibilityDisclosure: buildAdmissibilityDisclosure(preset, aggregate)
  };

  return result;
}

function computeExperimentMetrics(preset, campaign, aggregate) {
  const summaries = campaign.summaries;
  const metrics = {};

  // Common metrics
  metrics.totalMatches = summaries.length;
  metrics.completedMatches = summaries.filter(s => ['NORMAL_VICTORY', 'EXHAUSTED_RESOLUTION', 'CANONICAL_DRAW'].includes(s.terminationReason)).length;
  metrics.averageTurns = summaries.length ? summaries.reduce((sum, s) => sum + s.completedFullTurns, 0) / summaries.length : 0;
  metrics.seat1WinRate = aggregate.seat1WinRate;
  metrics.seat1Wilson95 = aggregate.seat1Wilson95;

  // Experiment-specific metrics based on mechanics observed
  const boardLockActivations = summaries.filter(s => s.mechanicCounts?.['BOARD_LOCK'] > 0 || s.primaryMechanicCounts?.['BOARD_LOCK'] > 0);
  const totalClearActivations = summaries.filter(s => s.mechanicCounts?.['TOTAL_CLEAR'] > 0 || s.primaryMechanicCounts?.['TOTAL_CLEAR'] > 0);
  const ultraActivations = summaries.filter(s => (s.ultraDecisionCount ?? 0) > 0);

  metrics.boardLockActivations = boardLockActivations.length;
  metrics.totalClearActivations = totalClearActivations.length;
  metrics.ultraActivations = ultraActivations.length;

  // Win conversion by point differential (for EXP-02 and EXP-05)
  if (preset.experimentId === 'EXP-02-BOARD-LOCK-LEAD' || preset.experimentId === 'EXP-05-TOTAL-CLEAR-REBOUND') {
    const ahead = boardLockActivations.length > 0 ? boardLockActivations : totalClearActivations;
    const aheadWins = ahead.filter(s => {
      const seatIdx = s.seatOrder.indexOf(s.winner);
      if (seatIdx < 0) return false;
      const winnerScore = s.finalScores[s.seatOrder[seatIdx]];
      const loserScore = s.finalScores[s.seatOrder[1 - seatIdx]];
      return winnerScore > loserScore;
    });
    metrics.activationWinRate = ahead.length ? aheadWins.length / ahead.length : 0;
    metrics.activationWinWilson95 = wilsonInterval(aheadWins.length, Math.max(1, ahead.length));
  }

  // Self-play breakdown
  metrics.selfPlayMatches = summaries.filter(s => s.isSelfPlay === true).length;
  metrics.crossPolicyMatches = summaries.filter(s => s.isSelfPlay !== true).length;

  return metrics;
}

function buildAdmissibilityDisclosure(preset, aggregate) {
  const disclosure = {
    admissible: true,
    epoch: preset.evidenceEpoch,
    profile: preset.authorityProfile,
    selfPlayExcluded: aggregate.selfPlayExcluded ?? true,
    notes: []
  };

  if (aggregate.abortCount > 0) {
    disclosure.notes.push(`${aggregate.abortCount} matches aborted — results may be incomplete.`);
  }
  if (aggregate.completedMatchCount < (preset.minimumUsefulEvidence ? 30 : 10)) {
    disclosure.notes.push(`Low sample size (${aggregate.completedMatchCount} matches) — conclusions are preliminary.`);
  }
  if (!preset.prerequisiteGates || preset.prerequisiteGates.length === 0) {
    disclosure.notes.push('No prerequisite gates declared.');
  } else {
    disclosure.notes.push(`Prerequisite gates: ${preset.prerequisiteGates.join(', ')}`);
  }
  disclosure.notes.push('Policy strength tiers: claims qualified by tier (fixture/baseline/heuristic). No lookahead/tournament/human-meta-proxy policies established yet.');

  return disclosure;
}

async function main() {
  if (listMode) {
    const index = JSON.parse(await readFile(path.join(presetsDir, 'index.json'), 'utf8'));
    console.log('Available experiment presets:');
    for (const exp of index.experiments) {
      console.log(`  ${exp.experimentId} — ${exp.category} (${exp.profile}, ~${exp.estimatedMatches} matches)`);
    }
    return;
  }

  if (!presetName) {
    console.error('Usage: node scripts/run-experiment.mjs --preset <EXPERIMENT_ID> [--matches N] [--list]');
    process.exit(1);
  }

  const preset = await loadPreset(presetName);
  await mkdir(outputDir, { recursive: true });
  await mkdir(reportsDir, { recursive: true });

  log(`Starting experiment: ${preset.experimentId}`);
  const result = await runExperiment(preset);

  const outputPath = path.join(outputDir, `${preset.experimentId}-result.json`);
  const reportPath = path.join(reportsDir, `${preset.experimentId}-report.json`);
  await writeFile(outputPath, JSON.stringify(result, null, 2));
  await writeFile(reportPath, JSON.stringify(result, null, 2));

  log(`Result written to: ${outputPath}`);
  log(`Report written to: ${reportPath}`);
  log(`Completed: ${result.completedMatchCount}/${result.matchCount} matches`);
  log(`Seat 1 win rate: ${(result.seat1WinRate * 100).toFixed(1)}% (Wilson 95% CI: [${(result.seat1Wilson95[0] * 100).toFixed(1)}%, ${(result.seat1Wilson95[1] * 100).toFixed(1)}%])`);
  log(`Duration: ${result.durationMs}ms`);
  log(`Admissibility: ${result.admissibilityDisclosure.admissible ? 'ADMISSIBLE' : 'INADMISSIBLE'}`);
}

main().catch(error => {
  console.error(`[run-experiment] FATAL: ${error.message}`);
  process.exit(1);
});
