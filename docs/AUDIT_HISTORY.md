# Audit History — Intrilex Simulation Lab

This document consolidates all forensic audits, reconciliation reports, and
development-state reviews performed on the Intrilex Simulation Lab project.
Each entry summarizes the audit scope, key findings, and current disposition.

## Active Audits

### v0.14.0 Forensic Inspection (current)
- **Scope:** Full structural, architectural, code quality, UX, security,
  performance, and maturity audit of v0.14.0.
- **Findings:** Strong core determinism and statistical methodology.
  Weak engineering controls (no CI, no bundler, no linter). Dependency cycle
  between analytics and simulation-runtime. Self-audit truth binding was
  static-only. 883 MB of stale release zips in working tree.
- **Disposition:** IN PROGRESS — see Recommendation Roadmap below.
- **Artifacts:** This document; `reports/self-audit.json` (regenerated).

## Historical Audits (chronological)

### v0.7.0 Rules & AI Audit
- **File:** `reports/RULES_AND_AI_AUDIT_v0.7.0.md` (6.3 KB)
- **Scope:** Rules conformance and AI policy behavior under Engine v4.1.x.
- **Status:** SUPERSEDED — rules have since advanced to v4.1.2 and engine
  to v4.2.5. Retained for historical provenance.

### v0.10.0 Audit Reconciliation
- **File:** `reports/V0.10.0_AUDIT_RECONCILIATION.md` (7.5 KB)
- **Scope:** Reconciliation of v0.10.0 release against claimed capabilities.
- **Status:** SUPERSEDED by v0.10.1 disposition.

### v0.10.0 Forensic Reconciliation (iterations 2-4)
- **Files:**
  - `reports/V0.10.0_CURRENT2_FORENSIC_RECONCILIATION.md` (6.5 KB)
  - `reports/V0.10.0_CURRENT3_FORENSIC_RECONCILIATION.md` (4.8 KB)
  - `reports/V0.10.0_CURRENT4_FORENSIC_RECONCILIATION.md` (6.8 KB)
- **Scope:** Iterative forensic reconciliation of v0.10.0, addressing
  findings from each prior iteration.
- **Status:** SUPERSEDED by v0.10.1 disposition.

### v0.10.1 Audit Disposition
- **File:** `reports/V0.10.1_AUDIT_DISPOSITION.md` (10.6 KB)
- **Scope:** Disposition of all findings from v0.10.0 audit iterations.
- **Status:** SUPERSEDED by v0.10.2 disposition.

### v0.10.2 Audit Disposition
- **File:** `reports/V0.10.2_AUDIT_DISPOSITION.md` (8.9 KB)
- **Scope:** Disposition of v0.10.1 findings and new v0.10.2 changes.
- **Status:** SUPERSEDED by v0.11.0 development state audit.

### v0.11.0 Development State Audit
- **File:** `reports/V0.11.0_DEVELOPMENT_STATE_AUDIT.md` (34.3 KB)
- **Scope:** Comprehensive development-state audit at v0.11.0, covering
  architecture, determinism, analytics, privacy, UX, and release integrity.
- **Status:** SUPERSEDED by v0.14.0 forensic inspection.

### Build Proof
- **Files:** `reports/BUILD_PROOF.md` (1.9 KB), `release/BUILD_PROOF.md` (1.9 KB, duplicate)
- **Scope:** Build verification proof — confirms the build is reproducible
  and all modules are present.
- **Status:** ACTIVE — regenerated on each build.

## Recommendation Roadmap (v0.14.0)

### Immediate (completed)
1. **Break dependency cycle** — Extract `@intrilex/statistics` leaf package
   to break analytics ↔ simulation-runtime cycle. ✅
2. **Fix self-audit truth binding** — Rewrite test to verify real execution;
   regenerate `self-audit.json` from actual test run via
   `scripts/generate-self-audit.mjs`. ✅
3. **Add real CI runner** — GitHub Actions workflow + cross-platform
   `scripts/ci.mjs` (Node port of `ci.sh`). ✅
4. **Clean stale release artifacts** — Delete 883 MB of stale zips. ✅

### Short-term (completed)
1. **Consolidate version strings** — Single source of truth from
   `package.json` via `scripts/generate-version.mjs`. ✅
2. **Delete unreferenced `styles.pretty.css`**. ✅
3. **ESLint setup + fix unescaped innerHTML** — `eslint.config.mjs` with
   browser globals; fixed XSS-surface innerHTML injections. ✅
4. **Bundler (esbuild)** — Minify, hash, cache headers via
   `scripts/bundle.mjs`. ✅
5. **Port `ci.sh` to `ci.mjs`** — Windows-compatible CI runner. ✅

### Medium-term
3. **Parameterize SCORING_WEIGHTS** — `createScoringWeights()` factory +
   sensitivity tests. ✅
4. **Consolidate audit documentation** — This document. ✅
1. **Eliminate dual Node/browser implementation** — Use esbuild bundling
   to share Node packages in browser instead of duplicating logic. (PENDING)
2. **Decompose `app.js`** — Split 134 KB monolith into per-workspace
   modules. (PENDING)

### Long-term
1. **Replace vendored TS toolchain** — Use npm-pinned `typescript` instead
   of `vendor/typescript-5.8.3`. (PENDING)
2. **Playwright E2E browser tests** — Real browser-level interaction
   tests. (PENDING)
3. **Replay-file integrity signing** — HMAC signatures on replay files
   to detect tampering. (PENDING)
