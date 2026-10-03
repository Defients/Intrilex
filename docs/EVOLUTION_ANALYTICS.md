# Evolution Lab analytical visuals

The October 3, 2026 analytical pass adds eight Arena plots and nine research plots. Presentation reads accepted game records and committed research records. It does not alter the engine, policies, RNG, scientific fingerprint, checkpoint identities, saved artifacts or evaluation definitions.

## Turn counting correction

The existing hashed `turns` field is `max(0, fullTurnSequence - 1)`. Core victory, sudden-death resolution and exhaustion resolve the final End phase before the engine increments that sequence. The old “Avg turns” metric therefore omits the terminal full turn.

The browser now labels the metric **Avg full turns · incl. End** and derives it from `CORE_FULL_TURN_COMPLETED` events plus exactly one terminal End event (`CORE_NORMAL_VICTORY`, `CORE_SUDDEN_DEATH_RESOLVED` or `CORE_EXHAUSTED_RESOLVED`). Skipped turn slots are excluded. Only clean Core records with compatible terminal telemetry qualify. Unknown profiles or historical records without those events display unavailable values instead of a guessed correction. The original counter average remains available in the metric definition; original records and result hashes are preserved.

A full turn is one player's Start → Action → End cycle, not a two-player round. It may contain several mini-turns. Policy decisions also include response, phase and private-choice decisions; automatic engine commands are separate.

The Value versus Tempo, Advanced Core, seed 1337, mirrored 1,100-game reproduction matched the screenshot: 573 A wins / 527 B wins; raw mean 4.52909; mean score margin 0.77273. The corrected mean is 5.52909 full turns, median 5, P90 9, mean mini-turns 8.22727, and mean policy decisions 16.66364. The first certified replay contains 3 full turns, 7 mini-turns and 5 scored cards, with a goal of 21. These observations describe this frozen-policy sample; they do not establish a human-play average.

## Arena plots

1. **Outcome convergence:** cumulative A/B wins against actual game ordinals; selectable rolling A score; conservative 95% complete-seed-pair score bounds. Draws score half in paired/rolling scores, while win curves retain their win-rate meaning.
2. **Full-turn distribution:** stacked outcomes, terminal End included, mean marker and separately reported median/P90.
3. **Length × score margin:** deterministic sample of at most 300 games, exact game/seed/seat/decision telemetry and linked game inspection. Overlapping marks can be inspected by keyboard or accessible data.
4. **Policy × seating:** AB/BA outcome proportions with explicit denominators and incomplete-pair coverage.
5. **Score-margin distribution:** both seats normalized to A minus B.
6. **Decision-count distribution:** policy decisions per clean game.
7. **Observed decision mix:** A/B action-family rates, mapped by policy under mirrored seats; denominators are recorded candidate decisions.
8. **Termination & evidence coverage:** recorded endings with accepted/requested coverage and a separate execution-failure explanation.

The rolling window and ordinal range are view filters. They do not change execution or records. The header averages describe the whole accepted clean sample; chart statistics describe the selected range. A range that cuts a seed pair exposes an unpaired game and excludes it from paired uncertainty. The conservative interval uses the existing Hoeffding construction on complete clean AB/BA pairs, assuming independent sampled seeds. A fixed seed catalog describes that catalog; it does not establish a universal rating.

All statistical calculations use every qualifying record. Plot convergence marks are bounded to approximately 240 points, scatter marks to 300, and distribution bins to 24. Point reduction never changes histogram counts or summary statistics. Live updates occur on the existing 500 ms cadence; plots are cached, preserve legend visibility and defer replacement while keyboard focus is inside them.

## Research plots

- **Committed lineage graph:** actual parent links, roots and committed selections; filled/hollow nodes distinguish complete matching held-out evidence from missing evidence.
- **Selection fitness × held-out performance:** TRAINING selection fitness and separate EVALUATION all-opponent means. Missing observations break paths; no pooled uncertainty is invented.
- **Residual parameter landscape:** absolute recorded feature weights on the authority's fixed ±bound scale. It describes parameters, not performance.
- **Held-out matchup landscape:** committed roots/selections against every frozen opponent, latest complete matching suite and held-out pack only; missing cells remain gaps.
- **Before / after uncertainty:** separate conservative score bounds per opponent. These are not confidence intervals for the difference.
- **Opponent score comparison:** measured before/after paired scores.
- **Matchup changes:** signed descriptive differences in percentage points.
- **Decision frequencies:** measured before/after action-family and mechanic-tag rates on a matching pack/opponent.
- **Behavioral divergence:** centered, signed differences in those measured rates. Mechanic tags can overlap.

The previous held-out control trend and detailed evidence tables remain available. Rank/suit usage and direct resource expenditure are not captured by current telemetry and are not inferred.

## Interaction, accessibility and export

Plots expose native SVG titles, named focusable marks, exact-value readouts, accessible chart-data tables and standalone SVG downloads. Enter or Space on linked game/checkpoint/evaluation marks opens the evidence inspector. An empty inspector collapses on analytical surfaces to give graphs more width. Closing inspection restores that space. Existing mobile dialog focus handling remains in place.

SVG exports contain explicit colors, labels and measured values. Tables are bounded to 300 rows; the complete run remains exportable in Ledger. A slim game record does not imply that a full command replay was retained. Its inspector explains retention and preserves the seed, ordinal and state/action hashes.

## Partial runs and timeout evidence

A worker timeout can stop execution before that game contributes an accepted record. Consequently zero *recorded game faults* does not mean execution succeeded. Charts now show status, accepted/requested coverage, missing-record count and the execution error explicitly; uncommitted games do not enter means as zeros.

The screenshot's seed 1872215845 completed in Node and in real browser workers using the same frozen policies/profile. The isolated browser paired run completed in approximately 0.35 seconds. The original timeout was not reproduced, so its root cause remains unresolved. No timeout limit or scientific execution behavior was changed to hide it.

## Verification

- `pnpm run build`
- `pnpm run test:evolution` (includes analytical model, a certified replay and 10,000-record bounds)
- `pnpm run test:evolution:browser` (existing execution/interaction checks, followed by analytics checks)
- `pnpm test`
- `pnpm run lint`, plus explicit lint on the two new browser `.mjs` modules
- `pnpm exec tsc --noEmit`

Current local evidence lives under `reports/local/evolution-analytics/`, including reproduction output, logs, browser scenarios and chart captures. These local checks do not imply deployment or remote CI approval.
