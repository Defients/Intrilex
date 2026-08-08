# Archived Scripts

These scripts are no longer referenced by CI, package.json, build pipeline, or tests.
They are preserved here for historical reference and can be safely deleted once no
longer needed for audit trail purposes.

## Orphaned Build/Release Scripts

| Script | Status | Reason for Archival |
|--------|--------|---------------------|
| `_phase0-inventory.mjs` | Obsolete | One-time audit tool with hardcoded path to `H:/myProjects/Intrilex-dev2` |
| `generate-release.mjs` | Superseded | Replaced by `release-package.mjs` and `package-release.mjs` |
| `generate-release-truth.mjs` | Obsolete | Only referenced in extracted-verification source package.json, not main package.json |
| `generate-unrestricted-replays.mjs` | Obsolete | Not referenced in CI, package.json, or build scripts |
| `migrate-campaign-semantic-hashes.mjs` | Obsolete | One-time migration script for campaign semantic hash format change |
| `probe-anchor-inversion.mjs` | Research | Adversarial probe for anchor inversion issue — investigation complete |
| `probe-decision-command-mapping.mjs` | Research | Probe for decision-command mapping — investigation complete |
| `verify-extracted-independent.mjs` | Superseded | Consolidated into `verify-extracted.mjs` |

## Debug/Dev Scripts

| Script | Status | Reason for Archival |
|--------|--------|---------------------|
| `debug-browser.mjs` | Debug | Quick debug script for browser loading inspection |
| `debug-browser2.mjs` | Debug | Browser debug variant |
| `debug-browser3.mjs` | Debug | Browser debug variant |
| `debug-check.mjs` | Debug | Debug script for checking dist dependencies |
| `debug-check2.mjs` | Debug | Debug script variant for state.js inspection |

## Archived: v0.21.0 cleanup (P1.4)

These scripts were archived during the P1.4 cleanup task in v0.21.0 development.
See `docs/AUDIT_HISTORY.md` for the full development state audit that identified them.

## Archived: v0.21.0 P2 cleanup

| Script | Status | Reason for Archival |
|--------|--------|---------------------|
| `release-package.mjs` | Superseded | Legacy 3-archive packager; replaced by `package-release.mjs` (single-archive deterministic packager) |
| `browser-certification-v0161.mjs` | Obsolete | v0.16.1-specific browser certification; superseded by `browser-e2e-certification.mjs` |
| `browser-ui-smoke-server.mjs` | Obsolete | Server helper for browser UI smoke test; no longer referenced by CI or package.json |
