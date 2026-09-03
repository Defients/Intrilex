# 04 — Simulation Readiness Gate & Dataset Admissibility

Phase 5 · evaluated against the 18 gate criteria of the specification. Evidence: `reports/autonomy-determinism.json`, `sample-data/autonomy/*`, `sample-data/observatory/*`, `packages/engine-adapter/src/adapter.mjs`, `packages/policies/src/scoring.mjs`, `packages/decision-intelligence/src/decision-trace.mjs`, 01 (IMPL-*), 03.

## 4.1 Gate evaluation

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Engine & rules boundary established | **PASS** | 00 §0.2 (engine 4.2.6 byte-verified; AS-EXECUTED ≠ AS-WRITTEN mapped in 01) |
| 2 | Selected profile supports every relevant mechanic | **FAIL for AS-WRITTEN; PARTIAL for AS-EXECUTED** | Profile `core-advanced-authority` (corpus) fails closed on ⭐3/5/6/7, 10♦ generated copy, Sudden Death; both profiles lack 7/BJ scoring, Goal Shift, 2 Quick, Wild Catalyst, suit-5 Exile, 3♠/7♠, Royal Shield (IMPL-01…13). Competitive profile (`core-unrestricted-authority`) has **no** corpus. |
| 3 | Unsupported mechanics fail closed (no silent simplification) | **PARTIAL** | Fail-closed: hidden Supers/Sudden Death in Advanced; scoring riders. **Silent simplification**: Voltage 3/4, ⭐3/⭐5 numeric changes, 10♦ "⭐7/⭐5" mimic resolving as Base, 10♦ → GY, ⭐6/⭐7 empty-set enumeration (Unrestricted), dead Sudden Death (Unrestricted). |
| 4 | Legal actions from current authority | **PASS** (with truncation caveat) | `enumerateCoreLegalActions` filters by `engine.execute(...).accepted` (`core-autonomy.js:298`); truncation E-G15 means the frame is *sound* but not *complete* for Ultras/Exile targets. |
| 5 | Accepted actions execute through canonical authority | **PASS** | `executeSimulationAction` → `IntrilexEngine.execute` (`adapter.mjs:225-227`); policies choose `actionId`, command vaulted (`adapter.mjs:196-217`). |
| 6 | Deterministic reruns reproduce canonical results | **PASS** | `reports/autonomy-determinism.json`: status PASS, `canonicalResultHash f4f45403…` identical for workers-1/2/4 and clean rerun. |
| 7 | Worker-count independence | **PASS** | same file. |
| 8 | Policies receive only authorized information | **PASS** | `strictPolicyView` (`adapter.mjs:283-375`): opponent `handCount` only, swap-bar face-down = `HIDDEN`, no seed/RNG/DP order. Card ids are deck-position indices (REJ-08). |
| 9 | No hidden-information leak | **PASS (not re-audited)** | Existing `test/hidden-info.test.mjs`, `privacy*.test.mjs`, `reports/HIDDEN_INFORMATION_CERTIFICATION.md`; Hybrix consumes the same `authorizedView`. Not re-run this pass (budget). |
| 10 | Decision traces expose legal alternatives | **PASS** | 100 traces / 4,867 decisions with `legalOptions[]`, `selectedActionId`, `selectionMargin` (`sample-data/autonomy/decision-traces/`). |
| 11 | Policies recognize all relevant action families | **FAIL** | Core policies route `solo-wild`, `wild-sovereignty`, `anchor-private-choice`(partly) to the `default` scorer (base 100) → effectively blind (05 §5.2). Hybrix has rank-mode valuation but no multi-turn planning. |
| 12 | Telemetry distinguishes origin types | **PARTIAL** | Mode strings separate `solo-wild:*-♠` and `wild-sovereignty:*` from natural plays and `rank7-generated-*` from hand plays; no unified `origin` field; MIMICKED/COPIED separable only by mode prefix. |
| 13 | Opportunity counts exist for mechanics under study | **PASS** | `mechanicOpportunityCounts` (195 keys) incl. `board-lock`, `wild-sovereignty`, `queens-court`, `royal-marriage`, `2-black-2-red-draw`, `three-red-counter`, `seven-topdeck`, `solo-wild`, `heart-tempo`, `total-clear`, `king-spade`, `super-ace`. |
| 14 | Current mechanics represented correctly in telemetry | **PARTIAL** | Registry-mode-derived opportunity keys include dead modes (AUTH-04); `deep-draw` opportunity 66 vs `deep-draw-♠` 69 suggests non-♠ Deep-Draw opportunities are being counted for a mode that only 6♠/2♠/K♠ can perform → over-count risk (UNVERIFIED). |
| 15 | No correctness defect invalidates the interaction | **FAIL for specific mechanics** | IMPL-01 (7/10♣/BJ scoring), IMPL-12 (counter class), IMPL-04 (10♦), Sudden Death/⭐6/⭐7 (Unrestricted only — not in corpus). |
| 16 | Replay evidence inspectable | **PASS** | 100 certified replays (`runtime/campaign-replays-v070/`, `sample-data/autonomy/replays/`), `reconstructAuthorityCheckpoints` available. |
| 17 | Pilot cohort trace-auditable | **PASS** | Demonstrated: match `M-db10a45b83e5e68eb1fd` traced decision-by-decision (06 §6.4). |
| 18 | Version identity & policy hashes recorded | **PASS** | traces carry `policyId/policyVersion/policyHash`, `engineVersion/rulesVersion/labVersion`, `provenanceHash`, `scoringWeightsHash` available. |

### Verdict

```text
SIMULATION READINESS: PARTIAL
```

**Admissible contributions (only these):**
- Profile `core-advanced-authority`, dataset `mechanics-observatory-twelve-policy-100` (experimentHash `ae0759d6…`, canonicalResultHash `f4f45403…`), engine 4.2.6 / rules-label 4.3.1 / lab 0.28.0.
- Mechanics: Play-for-Points, Draw, Swap Bar, ordinary Scuttle, Ace family counters (Base/A♠/⭐A/Anchor), 8 (Quick Aegis, Scuttle counter, 8♠ free scuttle), 9 Tap & Nine Anchor, J Disrupt / attachments, Q Anchor / Quick / Queen's Court, K anchors / counters / K♠ / Wild Sovereignty, Royal Marriage, ⭐2 / ⭐4 / ⭐8 / ⭐J, 10♣ Foundation (as effect), 10♦ (⭐4 / paired menu), 10♥, 10♠, 3-Black / 3-Red / 2B2R Ultras, Voltage (as implemented), 3/4/5/6/7 Base effects (as implemented), RJ, BJ Board Lock, Exhausted.
- Metrics: opportunity/usage ratios, response-window behaviour, termination mix, match length, score-vs-effect selection, seat outcome (with the Simpson caveat in 06), decision-trace `scoreSource='policy'` options for the 11 non-random policies.
- Purpose: **policy-realized power under one-ply heuristic policies**; descriptive only. Sample n≈1 per ordered pair → no matchup-level inference; overall n=100 → wide intervals.

**Inadmissible:** anything about ⭐3/⭐5/⭐6/⭐7, 10♦ generated copy, Sudden Death, 7/BJ scoring value, Goal Shift, 2 Quick, Wild Catalyst, suit-specific Fives, 3♠/7♠, Royal Shield, Exhausted-vs-Board-Lock ordering; any claim about the **competitive Unrestricted profile** (zero matches); any claim about human play.

**If the gate fails for a mechanic, no additional simulation is run to compensate** (spec §15). No new campaign was launched in this pass (budget directive + spec §4A); the recommended experiments are specified in 11.

## 4.2 Dataset admissibility register

| Dataset | Identity | Engine / rules / analytics | Profile | Policies | n | Seat balance | Aborts | Determinism | Class | Reason |
|---|---|---|---|---|---|---|---|---|---|---|
| Autonomy campaign | `mechanics-observatory-twelve-policy-100`, experimentHash `ae0759d6…`, aggregateHash `b69e06b2…` | 4.2.6 / 4.3.1 / telemetry 4.1.0, aggregate stamps analytics 4.1.0 (observatory README 4.2.0) | core-advanced-authority | 12 (5 core v2.0.0 + 7 Hybrix) | 100 matches, 68 unordered pairs (32 with both seat orders), 100 ordered pairs | **UNBALANCED**: hybrix-support/tank/baseline 0 games in seat 1; hybrix-sniper 4/8; others 12/8–9 | 0 | PASS (1/2/4 workers + rerun) | **B — CURRENT + LIMITED** | Current engine & profile; tiny n; seat imbalance; policy blind spots; AS-EXECUTED defects; Advanced ≠ competitive Unrestricted. |
| Observatory extracts | `sample-data/observatory/*` (hash `9bcbb4b9…`), 157 decision facts (143 with `policyScores`), 12 detailed semantic-fact matches | derived from the above | same | same | subset | same | — | inherits | **B** | Derived; same limits. |
| Decision traces | `sample-data/autonomy/decision-traces/` 100 files, 4,867 decisions, 37,702 options (`policy` 19,395 / `reconstructed` 18,307) | 2.0.0 | same | same | full | same | — | inherits | **B** (policy-scored options), **C** (reconstructed options: descriptive only) | Provenance labelled per option. |
| 121 certified replays `CT-001…CT-120`(+TS) | `sample-data/replays/`, `replay-index.json` | engine conformance fixtures, rules label 4.1.2 | mixed legacy | scripted | 121 | n/a | — | conformance PASS | **D for balance** (C as regression/methodology context) | Scripted protocol fixtures, not play. |
| Historical ledgers / reports (v0.7–v0.17 rank audits, `reports/full-rank-audit.json`, `AI_OFFICIAL_RULES_COMPLIANCE_AUDIT`) | various | older engine/rules | various | older policy versions | — | — | — | — | **C / D** | Materially older rules; context only. |
| Human match data | none present (Supabase `matches` table not in repo; no replays of human play) | — | Unrestricted | humans | 0 | — | — | — | **N/A** | Human-realizable power is INFERRED throughout. |

## 4.3 Four-layer correctness summary (spec §17)

| Layer | Status | Key items |
|---|---|---|
| ENGINE CORRECTNESS | Defects isolated (01 §1.2) | IMPL-01/02/03/04/12 affect 7, BJ, 10♣, 10♦, 10♥, Supers, Unrestricted-only families |
| POLICY AWARENESS | Deficient | blind to solo-wild & wild-sovereignty; no hold/retention model in core policies; Hybrix partial (05) |
| POLICY VALUATION QUALITY | One-ply, additive weights, 32% zero-margin ties | hard-coded family bonuses (ultra +300, sudden-death +580 total) (05) |
| ANALYTICS CORRECTNESS | Mostly sound; opportunity keys include dead registry modes; analytics-version stamp mismatch (4.1.0 vs 4.2.0) | AUTH-04; minor |
