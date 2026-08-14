#!/usr/bin/env node
/**
 * CI pipeline — cross-platform Node port of scripts/ci.sh.
 * Runs on Windows, macOS, and Linux without bash.
 *
 * Stages mirror ci.sh exactly. Each stage:
 *   - Runs with a timeout (default 240s)
 *   - Captures stdout/stderr to a log
 *   - Reports PASS/FAIL/SKIP with elapsed time
 *   - Exits on first failure (fail-fast)
 *   - Writes reports/ci-stages.json at the end
 *
 * Usage:
 *   node scripts/ci.mjs                    # full pipeline
 *   node scripts/ci.mjs --no-fail-fast     # continue on failure
 *   node scripts/ci.mjs --stage unit       # run single stage
 *   node scripts/ci.mjs --timeout 120      # custom timeout (seconds)
 */
import { spawnSync } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {} from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const noFailFast = args.includes('--no-fail-fast');
const singleStage = args.includes('--stage') ? args[args.indexOf('--stage') + 1] : null;
const customTimeout = args.includes('--timeout') ? parseInt(args[args.indexOf('--timeout') + 1]) * 1000 : 240000;

// ── Stage definitions (mirrors ci.sh) ──
const STAGES = [
  ['vendor-integrity', 'node', ['scripts/vendor-verify.mjs']],
  ['engine-patch-integrity', 'node', ['scripts/engine-patch-integrity.mjs', 'verify']],
  ['engine-patch-build', 'node', ['scripts/build-engine-patch.mjs']],
  ['engine-patch-tests', 'node', ['scripts/engine-patch-test.mjs']],
  ['legacy-protocol-conformance', 'node', ['scripts/engine-patch-conformance.mjs']],
  ['semantic-pass-priority-conformance', 'node', ['scripts/certify-pass-priority-hotfix.mjs']],
  ['production-build', 'node', ['scripts/build.mjs'], { INTRILEX_SKIP_AUTONOMY_REPLAY_REGEN: '1' }],
  ['unit', 'node', ['--test', 'test/unit.test.mjs']],
  ['integration', 'node', ['--test', 'test/integration.test.mjs']],
  ['autonomy', 'node', ['--test', 'test/autonomy.test.mjs']],
  ['mimic-ten-diamond', 'node', ['--test', 'test/mimic-ten-diamond.test.mjs']],
  ['advanced-continuations', 'node', ['--test', 'test/advanced-continuations.test.mjs']],
  ['landing-page', 'node', ['--test', 'test/landing-page.test.mjs']],
  ['metadata-isolation', 'node', ['--test', 'test/metadata-isolation.test.mjs']],
  ['ranking-system-overlay', 'node', ['--test', 'test/ranking-system-overlay.test.mjs']],
  ['release-notes-workspace', 'node', ['--test', 'test/release-notes-workspace.test.mjs']],
  ['unrestricted-core', 'node', ['--test', 'test/unrestricted-core.test.mjs']],
  ['unrestricted-browser-smoke', 'node', ['--test', 'test/unrestricted-browser-smoke.test.mjs']],
  ['scoring-sensitivity', 'node', ['--test', 'test/scoring-sensitivity.test.mjs']],
  ['play-module', 'node', ['--test', 'test/play-module.test.mjs']],
  ['v0.17.0-authority-contracts', 'node', ['--test', 'test/v0.17.0-authority-contracts.test.mjs']],
  ['v0.17.0-orchestration', 'node', ['--test', 'test/v0.17.0-orchestration.test.mjs']],
  ['v0.17.0-play-interface', 'node', ['--test', 'test/v0.17.0-play-interface.test.mjs']],
  ['v0.17.0-guidance-tutorial', 'node', ['--test', 'test/v0.17.0-guidance-tutorial.test.mjs']],
  ['v0.17.0-save-recovery', 'node', ['--test', 'test/v0.17.0-save-recovery.test.mjs']],
  ['v0.17.0-replay-intelligence', 'node', ['--test', 'test/v0.17.0-replay-intelligence.test.mjs']],
  ['v0.17.0-accessibility', 'node', ['--test', 'test/v0.17.0-accessibility.test.mjs']],
  ['v0.17.0-determinism-privacy-perf', 'node', ['--test', 'test/v0.17.0-determinism-privacy-perf.test.mjs']],
  ['browser-e2e-certification-test', 'node', ['--test', 'test/browser-e2e-certification.test.mjs']],
  ['telemetry', 'node', ['--test', 'test/telemetry.test.mjs']],
  ['analytics', 'node', ['--test', 'test/analytics.test.mjs']],
  ['analytics-ai-ollama', 'node', ['--test', 'test/analytics-ai-ollama.test.mjs']],
  ['analytics-ai-context', 'node', ['--test', 'test/analytics-ai-context.test.mjs']],
  ['analytics-ai-parsing', 'node', ['--test', 'test/analytics-ai-parsing.test.mjs']],
  ['analytics-ai-integrity', 'node', ['--test', 'test/analytics-ai-integrity.test.mjs']],
  ['analytics-ai-ui', 'node', ['--test', 'test/analytics-ai-ui.test.mjs']],
  ['browser-analytics-coverage', 'node', ['--test', 'test/browser-analytics-coverage.test.mjs']],
  ['observatory', 'node', ['--test', 'test/observatory.test.mjs', 'test/observatory-hardening.test.mjs', 'test/observatory-completion.test.mjs']],
  ['visual', 'node', ['--test', 'test/visual.test.mjs']],
  ['card-face-renderer', 'node', ['--test', 'test/card-face-renderer.test.mjs']],
  ['advanced-card-rules', 'node', ['--test', 'test/advanced-card-rules.test.mjs']],
  ['card-art', 'node', ['--test', 'test/card-art.test.mjs']],
  ['privacy', 'node', ['--test', 'test/privacy.test.mjs']],
  ['privacy-matrix', 'node', ['--test', 'test/privacy-matrix.test.mjs']],
  ['engine-boundary', 'node', ['--test', 'test/engine-boundary.test.mjs']],
  ['hidden-information', 'node', ['--test', 'test/hidden-info.test.mjs']],
  ['determinism', 'node', ['--test', 'test/determinism.test.mjs']],
  ['browser-contract', 'node', ['--test', 'test/browser-contract.test.mjs']],
  ['e2e-contract', 'node', ['--test', 'test/e2e-static.test.mjs']],
  ['regression', 'node', ['--test', 'test/regression.test.mjs']],
  ['decision-intelligence', 'node', ['--test', 'test/decision-intelligence.test.mjs']],
  ['game-ai', 'node', ['--test', 'test/game-ai.test.mjs']],
  ['rank-anatomy', 'node', ['--test', 'test/rank-anatomy.test.mjs', 'test/rank-anatomy-completion.test.mjs']],
  ['rank-truth-closure', 'node', ['--test', 'test/rank-truth-closure.test.mjs']],
  ['attribution-fixtures', 'node', ['--test', 'test/v0.16.1-attribution-fixtures.test.mjs']],
  ['package-smoke-tests', 'node', ['--test', 'packages/shared/test/smoke.test.mjs', 'packages/statistics/test/smoke.test.mjs', 'packages/policy-sdk/test/smoke.test.mjs', 'packages/policies/test/smoke.test.mjs', 'packages/decision-intelligence/test/smoke.test.mjs', 'packages/telemetry/test/smoke.test.mjs', 'packages/game-ai/test/smoke.test.mjs', 'packages/analytics/test/smoke.test.mjs', 'packages/analytics-ai/test/smoke.test.mjs', 'packages/browser-crypto-shim/test/smoke.test.mjs', 'packages/engine-adapter/test/smoke.test.mjs', 'packages/simulation-runtime/test/smoke.test.mjs', 'packages/achievements/test/smoke.test.mjs', 'packages/account-domain/test/smoke.test.mjs']],
  ['v0.10.0-contract', 'node', ['--test', 'test/v0.10.0-contract.test.mjs']],
  ['v0.10.0-behavioral', 'node', ['--test', 'test/v0.10.0-behavioral.test.mjs']],
  ['v0.10.0-anchor-authority', 'node', ['--test', 'test/v0.10.0-anchor-authority.test.mjs']],
  ['v0.10.0-browser-anchor-parity', 'node', ['--test', 'test/v0.10.0-browser-anchor-parity.test.mjs']],
  ['campaign-artifacts', 'node', ['--test', 'test/campaign-artifacts.test.mjs']],
  ['hybrix-evidence-envelope', 'node', ['--test', 'test/hybrix-evidence-envelope.test.mjs']],
  ['browser-policy-parity', 'node', ['--test', 'test/browser-policy-parity.test.mjs']],
  ['diagnostics-fixtures', 'node', ['--test', 'test/diagnostics-fixtures.test.mjs']],
  ['self-audit-truth', 'node', ['--test', 'test/self-audit-truth.test.mjs']],
  ['test-coverage-meta', 'node', ['--test', 'test/test-coverage-meta.test.mjs']],
  ['hybrix-browser-action', 'node', ['--test', 'test/hybrix-browser-action.test.mjs']],
  ['browser-workspace-liveness', 'node', ['--test', 'test/browser-workspace-liveness.test.mjs']],
  ['browser-hidden-info', 'node', ['--test', 'test/browser-hidden-info.test.mjs']],
  ['rank-attribution', 'node', ['--test', 'test/rank-attribution.test.mjs']],
  ['rank-telemetry', 'node', ['--test', 'test/rank-telemetry.test.mjs']],
  ['rank-counterfactual', 'node', ['--test', 'test/rank-counterfactual.test.mjs']],
  ['rank-power', 'node', ['--test', 'test/rank-power.test.mjs']],
  ['rank-integration', 'node', ['--test', 'test/rank-integration.test.mjs']],
  ['rank-pipeline-liveness', 'node', ['--test', 'test/rank-pipeline.test.mjs']],
  ['schema-validation', 'node', ['--test', 'test/schema-validation.test.mjs']],
  ['browser-ui-smoke', 'node', ['scripts/browser-ui-smoke.mjs']],
  ['browser-ui-report', 'node', ['scripts/verify-browser-ui-report.mjs']],
  ['browser-parity', 'node', ['scripts/browser-parity.mjs']],
  ['browser-parity-report', 'node', ['scripts/verify-browser-parity-report.mjs']],
  ['browser-proof-reports', 'node', ['scripts/verify-browser-proof-reports.mjs']],
  ['accessibility', 'node', ['--test', 'test/accessibility.test.mjs']],
  ['synthetic-analytics', 'node', ['scripts/validate-synthetic-analytics.mjs']],
  ['hybrix-benchmark', 'node', ['scripts/benchmark-hybrix.mjs'], { BENCH_MATCHES: '20' }],
  ['package-graph', 'node', ['scripts/check-package-graph.mjs']],
  ['typecheck', 'node', ['scripts/typecheck.mjs']],
  ['release-package', 'node', ['scripts/package-release.mjs']],
  ['falsification-sweep', 'node', ['scripts/falsification-sweep.mjs']],
  ['browser-e2e-certification', 'node', ['scripts/browser-e2e-certification.mjs']],
  ['release-verify-extracted', 'node', ['scripts/verify-extracted.mjs']],
  ['manifest-verify', 'node', ['scripts/manifest.mjs', 'verify']],
  ['self-audit-generate', 'node', ['scripts/generate-self-audit.mjs']],
  ['truth-drift-check', 'node', ['scripts/truth-drift-check.mjs', '--no-staleness']],
  ['v0.21.0-version-contract', 'node', ['--test', 'test/v0.21.0-version-contract.test.mjs']],
  ['v0.21.0-browser-version-parity', 'node', ['--test', 'test/v0.21.0-browser-version-parity.test.mjs']],
  ['v0.21.0-a11y-automated', 'node', ['--test', 'test/v0.21.0-a11y-automated.test.mjs']],
  ['v0.21.0-pwa-service-worker', 'node', ['--test', 'test/v0.21.0-pwa-service-worker.test.mjs']],
  ['v0.21.0-phase4-enhancements', 'node', ['--test', 'test/v0.21.0-phase4-enhancements.test.mjs']],
  ['tournament', 'node', ['--test', 'test/tournament.test.mjs']],
  ['v0.22.0-tournament-evolution', 'node', ['--test', 'test/v0.22.0-tournament-evolution.test.mjs']],
  ['v0.22.0-profile-deepening', 'node', ['--test', 'test/v0.22.0-profile-deepening.test.mjs']],
  ['v0.22.0-ai-commentary', 'node', ['--test', 'test/v0.22.0-ai-commentary.test.mjs']],
  ['v0.20.0-viewmodel', 'node', ['--test', 'test/v0.20.0-viewmodel.test.mjs']],
  ['v0.20.0-provenance-mutation', 'node', ['--test', 'test/v0.20.0-provenance-mutation.test.mjs']],
  ['v0.20.0-queens-court-canon', 'node', ['--test', 'test/v0.20.0-queens-court-canon.test.mjs']],
  ['v0.20.0-wild-sovereignty', 'node', ['--test', 'test/v0.20.0-wild-sovereignty.test.mjs']],
  ['v0.21.0-board-lock', 'node', ['--test', 'test/v0.21.0-board-lock.test.mjs']],
  ['v0.21.0-variant-opportunity-integrity', 'node', ['--test', 'test/v0.21.0-variant-opportunity-integrity.test.mjs']],
  ['full-rank-legality-resolution-ai', 'node', ['--test', 'test/full-rank-legality-resolution-ai.test.mjs']],
  ['rank7-scoring', 'node', ['--test', 'test/rank7-scoring.test.mjs']],
  ['phase6-polish', 'node', ['--test', 'test/phase6-polish.test.mjs']],
  ['network-authority', 'node', ['--test', 'test/network-authority.test.mjs']],
  ['network-ux-integration', 'node', ['--test', 'test/network-ux-integration.test.mjs']],
  ['match-store-persistence', 'node', ['--test', 'test/match-store-persistence.test.mjs']],
  ['browser-network-e2e', 'node', ['--test', 'test/browser-network-e2e.test.mjs']],
  ['matchmaking-queue', 'node', ['--test', 'test/matchmaking-queue.test.mjs']],
  ['websocket-compression', 'node', ['--test', 'test/websocket-compression.test.mjs']],
  ['spectator-mode', 'node', ['--test', 'test/spectator-mode.test.mjs']],
  ['rate-limiting', 'node', ['--test', 'test/rate-limiting.test.mjs']],
  ['network-lobby-ui', 'node', ['--test', 'test/network-lobby-ui.test.mjs']],
  ['ip-rate-limiting', 'node', ['--test', 'test/ip-rate-limiting.test.mjs']],
  ['match-history', 'node', ['--test', 'test/match-history.test.mjs']],
  ['network-truth-closure', 'node', ['--test', 'test/network-truth-closure.test.mjs']],
  ['ai-official-rules-compliance', 'node', ['--test', 'test/ai-official-rules-compliance.test.mjs']],
  ['grid-layout-invariants', 'node', ['--test', 'test/grid-layout-invariants.test.mjs']],
  // v0.24.2 Truth Closure II tests
  ['replay-privacy-closure', 'node', ['--test', 'test/replay-privacy-closure.test.mjs']],
  ['match-store-participants-truth', 'node', ['--test', 'test/match-store-participants-truth.test.mjs']],
  ['connection-match-binding', 'node', ['--test', 'test/connection-match-binding.test.mjs']],
  ['release-truth-closure', 'node', ['--test', 'test/release-truth-closure.test.mjs']],
  ['canon-scenario-certification', 'node', ['--test', 'test/canon-scenario-certification.test.mjs']],
  ['spectator-projection-hardening', 'node', ['--test', 'test/spectator-projection-hardening.test.mjs']],
  ['dev-cache-truth', 'node', ['--test', 'test/dev-cache-truth.test.mjs']],
  ['regression-score-selection', 'node', ['--test', 'test/regression-score-selection.test.mjs']],
  ['network-chat', 'node', ['--test', 'test/network-chat.test.mjs']],
  ['local-online-parity', 'node', ['--test', 'test/local-online-parity.test.mjs']],
  ['tutorial-guidance-parity', 'node', ['--test', 'test/tutorial-guidance-parity.test.mjs']],
  ['local-vs-ai-full-match', 'node', ['--test', 'test/local-vs-ai-full-match.test.mjs']],
  ['puzzle-mode', 'node', ['--test', 'test/puzzle-mode.test.mjs']],
  ['forensic-phase1-remediation', 'node', ['--test', 'test/forensic-phase1-remediation.test.mjs']],
  ['forensic-phase2-remediation', 'node', ['--test', 'test/forensic-phase2-remediation.test.mjs']],
  ['irx-remediation-tests', 'node', ['--test', 'test/irx-remediation-tests.test.mjs']],
  ['chart-toolkit', 'node', ['--test', 'test/chart-toolkit.test.mjs']],
  ['observatory-charts', 'node', ['--test', 'test/observatory-charts.test.mjs']],
  ['cross-workspace-linking', 'node', ['--test', 'test/cross-workspace-linking.test.mjs']],
  ['matchup-matrix', 'node', ['--test', 'test/matchup-matrix.test.mjs']],
  ['tempo-opening-analysis', 'node', ['--test', 'test/tempo-opening-analysis.test.mjs']],
  ['endgame-section-nav', 'node', ['--test', 'test/endgame-section-nav.test.mjs']],
  ['backup-match-db', 'node', ['--test', 'test/backup-match-db.test.mjs']],
  ['health-monitor', 'node', ['--test', 'test/health-monitor.test.mjs']],
  ['provision-season', 'node', ['--test', 'test/provision-season.test.mjs']],
  ['v0.28-pvp-experience', 'node', ['--test', 'test/v0.28-pvp-experience.test.mjs']],
  ['academy', 'node', ['--test', 'test/academy.test.mjs']],
  ['puzzle-ladder', 'node', ['--test', 'test/puzzle-ladder.test.mjs']],
  ['social-activation', 'node', ['--test', 'test/social-activation.test.mjs']],
  ['competition-formats', 'node', ['--test', 'test/competition-formats.test.mjs']],
  ['intelligence-surfacing', 'node', ['--test', 'test/intelligence-surfacing.test.mjs']],
  ['remaining-work', 'node', ['--test', 'test/remaining-work.test.mjs']],
  ['epoch-7-competitive-loop', 'node', ['--test', 'test/epoch-7-competitive-loop.test.mjs']],
  ['tournament-persistence', 'node', ['--test', 'test/tournament-persistence.test.mjs']],
  ['doc-truth', 'node', ['--test', 'test/doc-truth.test.mjs']],
  ['lint-ratchet', 'node', ['--test', 'test/lint-ratchet.test.mjs']],
  ['competitive-legitimacy', 'node', ['--test', 'test/competitive-legitimacy.test.mjs']],
  ['learning-loop', 'node', ['--test', 'test/learning-loop.test.mjs']],
  ['intelligence-mastery', 'node', ['--test', 'test/intelligence-mastery.test.mjs']],
  ['broadcast-matchmaking', 'node', ['--test', 'test/broadcast-matchmaking.test.mjs']],
  ['engine-refactor', 'node', ['--test', 'test/engine-refactor.test.mjs']],
  ['action-presentation', 'node', ['--test', 'test/action-presentation.test.mjs']],
  ['achievements', 'node', ['--test', 'test/achievements.test.mjs']],
  ['auth-protocol', 'node', ['--test', 'test/auth-protocol.test.mjs']],
  ['auth-server', 'node', ['--test', 'test/auth-server.test.mjs']],
  ['auth-reconnect', 'node', ['--test', 'test/auth-reconnect.test.mjs']],
  ['supabase-schema', 'node', ['--test', 'test/supabase-schema.test.mjs']],
  ['ranked-leaderboard', 'node', ['--test', 'test/ranked-leaderboard.test.mjs']],
  ['match-result-persistence', 'node', ['--test', 'test/match-result-persistence.test.mjs']],
  // Canonical Ranked glyph integration (8 tier assets + presentation registry)
  ['ranked-glyphs', 'node', ['--test', 'test/ranked-glyphs.test.mjs']],
  // Player Profile system (domain contracts, SQL schema, projection builders)
  ['profile-domain', 'node', ['--test', 'test/profile-domain.test.mjs']],
  ['profile-schema', 'node', ['--test', 'test/profile-schema.test.mjs']],
  ['profile-projection', 'node', ['--test', 'test/profile-projection.test.mjs']],
  ['player-directory', 'node', ['--test', 'test/player-directory.test.mjs']],
  ['recent-opponents', 'node', ['--test', 'test/recent-opponents.test.mjs']],
  ['relationships', 'node', ['--test', 'test/relationships.test.mjs']],
  ['sec-01-secret-containment', 'node', ['--test', 'test/sec-01-secret-containment.test.mjs']],
  ['release-identity', 'node', ['--test', 'test/release-identity.test.mjs']],
  ['engine-manifest', 'node', ['--test', 'test/engine-manifest.test.mjs']],
  // Guest→permanent account migration (domain contracts, server execution, E2E)
  ['guest-migration-plan', 'node', ['--test', 'test/guest-migration-plan.test.mjs']],
  ['guest-migration-e2e', 'node', ['--test', 'test/guest-migration-e2e.test.mjs']],
  ['auth-controller-migration', 'node', ['--test', 'test/auth-controller-migration.test.mjs']],
  // Match server production configuration (deployment hardening)
  ['match-server-config', 'node', ['--test', 'test/match-server-config.test.mjs']],
  ['match-server-production', 'node', ['--test', 'test/match-server-production.test.mjs']],
];

let passCount = 0, skipCount = 0, failCount = 0;
const stageNames = [], stageStatuses = [];

function runStep(name, cmd, cmdArgs, envOverride = {}) {
  const started = Date.now();
  const result = spawnSync(cmd, cmdArgs, {
    cwd: root,
    encoding: 'utf8',
    timeout: customTimeout,
    maxBuffer: 50 * 1024 * 1024,
    env: { ...process.env, ...envOverride }
  });
  const elapsed = Date.now() - started;
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  const code = result.status;

  stageNames.push(name);
  if (code === 0) {
    const summary = output.match(/# pass \d+|PASS\b/)?.[0] ?? output.trim().split('\n').pop();
    if (output.includes('SKIP')) {
      skipCount++;
      stageStatuses.push('SKIP');
      console.log(`[SKIP] ${name} (${elapsed}ms) — ${summary}`);
    } else {
      passCount++;
      stageStatuses.push('PASS');
      console.log(`[PASS] ${name} (${elapsed}ms) — ${summary}`);
    }
  } else {
    failCount++;
    stageStatuses.push('FAIL');
    console.error(`[FAIL] ${name} (${elapsed}ms; exit ${code})`);
    console.error(output.slice(-2000));
    if (!noFailFast) {
      writeReport();
      process.exit(code ?? 1);
    }
  }
}

// Filter to single stage if requested
const stagesToRun = singleStage
  ? STAGES.filter(([name]) => name === singleStage)
  : STAGES;

if (singleStage && stagesToRun.length === 0) {
  console.error(`Unknown stage: ${singleStage}. Available: ${STAGES.map(s => s[0]).join(', ')}`);
  process.exit(1);
}

console.log(`CI START: ${stagesToRun.length} stages${noFailFast ? ' (no-fail-fast)' : ''}`);

for (const [name, cmd, cmdArgs, envOverride] of stagesToRun) {
  runStep(name, cmd, cmdArgs, envOverride);
}

async function writeReport() {
  const total = passCount + skipCount + failCount;
  console.log(`CI COMPLETE: ${passCount}/${total} stages (PASS=${passCount}, SKIP=${skipCount}, FAIL=${failCount})`);
  const report = {
    schemaVersion: '1.0.0',
    passCount, skipCount, failCount, totalStages: total,
    stages: stageNames.map((name, i) => ({ name, status: stageStatuses[i] }))
  };
  const reportsDir = path.join(root, 'reports');
  if (!existsSync(reportsDir)) await mkdir(reportsDir, { recursive: true });
  await writeFile(path.join(reportsDir, 'ci-stages.json'), JSON.stringify(report, null, 2) + '\n');
}

await writeReport();
process.exit(failCount > 0 ? 1 : 0);
