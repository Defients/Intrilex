# Tactical Core Profiles

This change improves policy decisions while preserving the authoritative Intrilex engine (4.2.6) and player rules (4.3.1). It does not set a desired game length. A stronger contest may take longer because useful defenses actually get played; a useful defense must still help the policy compete and finish games.

## Select the version explicitly

All four core personalities ship deterministic, static tactical policies, version **3.0.0**, at generation zero:

| Personality | Current policy | Frozen comparison |
|---|---|---|
| Score Rush | `score-rush-tactical` | `score-rush` v2 |
| Control | `control-tactical` | `control` v2 |
| Tempo | `tempo-tactical` | `tempo` v2 |
| Value | `value-tactical` | `value` v2 |

Evolution Lab defaults to `tempo-tactical` versus `value-tactical`. All four are available as Tactical v3 in Arena, Watch and Caster. At Normal difficulty, New Match resolves the four named personality cards to these current policies without duplicate tactical personality cards. Difficulty and personality remain separate controls. These policies are not trained checkpoints or search-based agents.

The original `score-rush`, `control`, `tempo` and `value` remain version **2.0.0**, with unchanged ranking behavior. They are labeled Frozen v2. The original five-policy research benchmark suite remains unchanged; the new policies do not silently replace its opponents.

## What the tactical layer changes

- Values public scoring material removed by scuttles, bounces, taps and row clears. Opponent proximity to their goal increases the priority of useful denial; hidden hand identities are never consulted.
- Values the scoring swing from Jack attachments and other public control changes, and recognizes immediate scoring opportunities from ordinary scoring, anchors and goal reduction.
- Includes the policy's own material loss when considering total clears and row exchanges. Protected or already tapped cards do not count as useful row-clear or tap targets.
- Resolves counter decisions against the hostile **top** of the stack, including hostile counters to the policy's own root. Declines responses to its own top and avoids spending counters on ordinary, unthreatening draws.
- Prefers a cheaper sufficient legal counter over a multi-card or premium counter. Discounts generic combo bonuses when they consume multiple useful cards.
- Prevents Control's generic effect preference from rewarding an empty or entirely Aegis-protected row clear; useful zero-point effect-row targets still count.
- Ranks Core Nine tap targets by useful public scoring material instead of selecting them by action-ID order.

The authoritative engine still enumerates legal actions and executes every selected command. The shared tactical module runs in Node and browser workers. The added module participates in the scientific implementation fingerprint and the browser build/cache asset inventory.

## Evidence and existing runs

Adding a new policy implementation changes the Evolution scientific fingerprint. It does not rewrite prior runs, checkpoint IDs, record hashes, commands or exported content.

Loading a run saved under an older fingerprint opens read-only historical inspection. The original run's analytics remain available. Export returns the preserved original envelope. Current execution, resume, policy evaluation and bookmark edits are not admitted for that archived run. Return to current work to run the new policies.

Historic command sequences remain available in exports; replay verification through the current implementation is not admitted in the historical view. A current fingerprint mismatch is never silently treated as a reproducible current execution.

## Reproduce the comparison

```powershell
pnpm run build
pnpm run test:evolution
pnpm run benchmark:tactics --games 400 --seed 20261005 --output reports/local/evolution-four-profiles/benchmark
```

The default `four-profiles` benchmark runs each tactical personality against its own frozen v2 counterpart: four matchups, using the same deal sequence in every matchup and both seat assignments per deal. Use `--suite tempo-value` for the earlier eight-matchup Tempo/Value comparison. Each matchup has 200 complete seed pairs. It checks initial-state equality across matchups, rejects game faults, writes full artifact envelopes, reports game length with the terminal End included, and provides conservative 95% pair-score bounds. Draws receive half credit. The two games of a pair are not treated as independent samples.

Use a different `--seed` for further assessment and `--output` to preserve multiple runs. Benchmark results depend on the exact fingerprint, opponent and seed suite; they are not a universal strength rating or proof of optimal play.

### Current four-profile results - October 3, 2026

Current fingerprint: `2e53dc3e8481da2c418af36482db7d77d645aecc4c5b590ad9e78fbb1bd218cc`.

Advanced Core, base seed `20261005`, 400 games per matchup, same deals and both seats for each personality versus its own frozen v2 counterpart. All 1,600 requested games have accepted records: 1,598 clean endings and two recorded faults. This is a separate suite from the earlier Tempo/Value comparison below.

| Candidate vs its frozen v2 counterpart | Wins / losses / draws | Complete seed pairs | Paired score | Conservative 95% bounds | Recorded faults |
|---|---:|---:|---:|---:|---:|
| Score Rush v3 | 284 / 116 / 0 | 200 | 71.00% | 61.40-80.60% | 0 |
| Control v3 | 242 / 109 / 47 | 198 | 66.67% | 57.02-76.32% | 2 |
| Tempo v3 | 271 / 129 / 0 | 200 | 67.75% | 58.15-77.35% | 0 |
| Value v3 | 258 / 142 / 0 | 200 | 64.50% | 54.90-74.10% | 0 |

Draws receive half credit; fault games and incomplete seat pairs are excluded from paired-score estimates. Faults remain in the exported records and termination coverage. These are individual comparison bounds, not simultaneous catalog-wide confidence intervals.

**The zero-fault benchmark gate is FAIL.** Control's two faults reproduced at seeds `693402852` and `2020632460`, both in the swapped seat assignment. The active policy was frozen `control` v2, with an empty hand, empty draw pile and one Mini-Turn remaining in Action. Every replay command was accepted, then the authoritative frame returned `CORE_NO_LEGAL_ACTION`. This is an exposed engine endgame limitation, not an illegal command selected by the tactical candidate. Engine semantics and the frozen policy remain unchanged in this profile update. The faults must not be relabeled as draws or normal endings.

Current artifacts: `reports/local/evolution-four-profiles/benchmark-final/report.json` and its four full envelopes. Exact fault reproduction: `reports/local/evolution-four-profiles/fault-analysis.json`. Validation: build, 5,286 passing full-suite tests (14 skipped; zero failures), 82 focused tests, 33 browser scenarios without page errors, lint (zero errors), scoped type checking, release identity and engine manifest checks. These passing checks do not override the failed zero-fault benchmark gate.

### Earlier Tempo/Value results — October 3, 2026

Earlier implementation fingerprint: `233424bfbe1f007e17e8ea083ab4d6485a46f26060476ebad3c419148ec55302`.

The earlier Tempo/Value run used seed strategy base `20261003`, Advanced Core, 400 games per matchup, and both seats on each of 200 deals. Across eight matchups, all **3,200 games** produced clean records with **zero recorded faults**. Original frozen Tempo/Value behavior also reproduced an additional 80 pre-change games with identical initial-state, action-sequence and final-state hashes, outcomes, turn/decision counts and telemetry. The engine implementation hash remained unchanged.

| Candidate | Opponent | Candidate wins | Candidate win rate | Conservative 95% pair-score bounds |
|---|---|---:|---:|---:|
| Tempo Tactical v3 | Tempo v2 | 265 / 400 | 66.25% | 56.65–75.85% |
| Tempo Tactical v3 | Value v2 | 271 / 400 | 67.75% | 58.15–77.35% |
| Value Tactical v3 | Tempo v2 | 266 / 400 | 66.50% | 56.90–76.10% |
| Value Tactical v3 | Value v2 | 280 / 400 | 70.00% | 60.40–79.60% |
| Tempo Tactical v3 | Control v2 | 366 / 400 | 91.50% | 81.90–100.00% |
| Value Tactical v3 | Control v2 | 365 / 400 | 91.25% | 81.65–100.00% |

On those same deals, frozen Tempo versus frozen Value averaged **5.64 full turns**. Tactical Tempo versus Tactical Value averaged **25.13 full turns**, with median **23.5** and P90 **43**. Of the 400 tactical head-to-head games, **393 ended by normal victory**, **7 by exhausted resolution**, and **none drew**. Tempo won 197 and Value won 203; their pair-score interval includes 50%, so this comparison does not establish one tactical personality as stronger than the other.

These are within-suite measurements. Pair bounds describe each comparison individually; they are not a universal ranking or a simultaneous confidence guarantee for the whole catalog.

These earlier raw artifacts and the machine-readable report are preserved under `reports/local/evolution-tactics/final-heldout/`. The regression suite includes real engine legal-action positions, cross-worker determinism, Node/browser choices, hidden-hand isolation and read-only historical admission.

## Practical limits

This is a bounded public-information heuristic, with no hidden-hand inference, rollouts or multi-turn search. Public proximity is a risk signal, not proof that an opponent holds a winning card. Estimates of advanced material swings do not fully model every attachment, scoring rider, protection or deferred effect. Direct scoring, legal-action admission and terminal results remain engine-owned.

Short matches remain legitimate when the deal and available responses favor a fast win. Conversely, longer matches and exhaustion alone do not prove better play. Assess outcome performance, normal/exhausted endings, recorded faults and distributions together.
