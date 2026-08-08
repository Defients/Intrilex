# Renderer/CSS Dead-Code Audit — v0.24.2

**Audit date:** 2026-08-08
**Auditor:** Devin (automated evidence-driven audit)

## Summary

A static analysis of the renderer and CSS files identified dead code in the
duel board renderer. However, the dead code is referenced by existing tests,
so it cannot be removed without breaking the test suite. This audit documents
the findings for future cleanup.

## Findings

### 1. Dead Renderer Functions (ranked-duel-renderer.mjs)

The following 7 functions are defined but never called from the live render path:

| Function | Line | Status |
|----------|------|--------|
| `renderPriorityStrip` | 287 | Dead — 0 call sites |
| `renderEnemyBoard` | 302 | Dead — 0 call sites |
| `renderPlayerBoard` | 331 | Dead — 0 call sites |
| `renderSharedBattlefield` | 411 | Dead — 0 call sites |
| `renderRightRail` | 731 | Dead — 0 call sites |
| `renderLeftRail` | 864 | Dead — 0 call sites |
| `renderRightRailLegacy` | 1113 | Dead — 0 call sites |

**Cannot remove:** These functions are referenced by tests:
- `test/play-module.test.mjs` (5 references)
- `test/phase6-polish.test.mjs` (18 references)
- `test/network-ux-integration.test.mjs` (6 references)
- `test/v0.21.0-a11y-automated.test.mjs` (1 reference)
- `test/v0.17.0-accessibility.test.mjs` (1 reference)
- `test/v0.17.0-play-interface.test.mjs` (1 reference)

### 2. Legacy CSS Compatibility Block (ranked-duel.css lines 2421-2443)

The `display: none !important` block for legacy classes is **correct behavior**,
not a bug. It serves as a safety net — the classes are used in dead renderer
functions (see above), and the CSS block ensures any accidentally-emitted HTML
from those dead functions is hidden.

### 3. play-v3.css (1,276 lines)

The `play-v3.css` file appears to be largely unused by the current JavaScript
codebase, except for `.play-hub-back` which is used in `replay-library.js`.

**Cannot remove:** Referenced by tests (`test/play-module.test.mjs`,
`test/v0.17.0-play-interface.test.mjs`).

### 4. `.rd-header-btn` (ranked-duel.css line 387)

Marked as "Legacy header button (kept for compatibility)" — not found in any
JS renderer files. Could be removed if no tests reference it.

## Recommendation

The dead code should be removed in a future release that also updates the
tests that reference it. For v0.24.2, the dead code is documented but left
in place to avoid breaking the test suite.
