# Direct Manipulation — final local validation

Date: September 30, 2026 (America/New_York). Repository: `H:\myProjects\Intrilex-MASTER\Intrilex_dev-current`. Changes remain uncommitted alongside the pre-existing Homecoming work. No public deployment was performed.

| Check | Final result |
| --- | --- |
| Full self-audit generator | PASS: 5,239 tests, 5,225 passed, 0 failed, 14 skipped; 203 files completed |
| Excluded self-audit truth checks | PASS: 16/16; completes coverage of all 204 test files |
| Combined comprehensive test execution | 5,255 tests, 5,241 passed, 0 failed, 14 skipped |
| New drag unit/integration checks | PASS: 10/10, included in the full execution |
| Direct Manipulation browser | PASS: 10 scenarios, 0 page errors |
| Existing Homecoming browser plus new live network drag | PASS: 19 scenarios, 0 page errors |
| Existing Action Composer/rail browser | PASS: 7 scenarios |
| Root and strict client typechecks | PASS |
| Lint | PASS: 0 errors; 423 existing warnings |
| Lint warning ratchet | PASS |
| Production build | PASS |
| Quick clean-room reproduction | PASS; includes build, containment scan, manifests and 106 focused tests |
| Release identity and engine manifest | PASS: no drift |
| Git whitespace check | PASS |

The full audit excludes its own truth test to avoid recursion. Those 16 checks were executed separately after the canonical report was regenerated. The final test execution was performed after build outputs stabilized. Earlier failing attempts remain clearly named `initial-default-test-attempt.log` and `initial-browser-failure.png`; their issues were resolved before this record.

The browser harness uses the actual React board, GameStore and seeded match authority. Its King interaction previews without mutation, submits the original legal action, respects the ordinary response window, and ultimately places the King in the Enduring Row with the normal semantic events. Only the ambiguity scenario supplies an explicitly controlled UI variant. A separate Homecoming scenario uses a real local WebSocket server and two browser sessions: one ordinary request is sent by the drag, and both authorized projections show the same placed public card.

Evidence: `validation.json`, `browser-report.json`, `self-audit-generation.log`, `self-audit-truth.log`, `build.log`, `lint.log`, `lint-ratchet.log`, `clean-room.log`, `homecoming-browser.log`, `action-rail.log`, the screenshots in this folder, and the standard `reports/homecoming/` browser reports. The regenerated canonical audit is `reports/self-audit.json`.

Touch drag is deferred to preserve native mobile scrolling. Desktop pointer interaction was exercised in Chrome; physical trackpad/stylus hardware and production deployment were not verified.
