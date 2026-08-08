#!/usr/bin/env bash
# CI pipeline — delegates to scripts/ci.mjs (the canonical pipeline definition).
# This ensures ci.sh and ci.mjs always run the same stages.
# All stage definitions live in ci.mjs to avoid drift.
#
# Key gates included in the pipeline (defined in ci.mjs):
#   vendor-integrity, engine-patch-integrity, engine-patch-build, engine-patch-tests,
#   production-build, unit, integration, telemetry, analytics, observatory,
#   privacy, privacy-matrix, hidden-information, determinism,
#   rank-anatomy, rank-attribution, rank-telemetry, rank-counterfactual, rank-power,
#   rank-integration, rank7-scoring, full-rank-legality-resolution-ai,
#   package-graph, package-smoke-tests, manifest-verify,
#   browser-parity, browser-ui-smoke, browser-e2e-certification,
#   self-audit-generate, truth-drift-check,
#   v0.21.0-board-lock, v0.20.0-queens-court-canon,
#   release-package, release-verify-extracted
exec node scripts/ci.mjs "$@"
