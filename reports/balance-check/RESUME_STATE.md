# RESUME STATE — Balance Check Pass (paused 2026-09-03, budget)

Read this file + 00_AUTHORITY.md §0.5 (Authority Digest) first. Do NOT re-read the rulebook, engine, or aggregate.json — every needed fact is already in 01/03/04/05/08 with file:line citations.

## Completed (persisted)
| Phase | Artifact | Status |
|---|---|---|
| 0 Authority | 00_AUTHORITY.md | DONE (commit e4c22228; engine 4.2.6 byte-verified; findings AUTH-01..04) |
| 1 Mechanical inventory | 01_MECHANICAL_INVENTORY.md | DONE (IMPL-01..13; AS-WRITTEN vs AS-EXECUTED) |
| 2 54-card map | 02_EXACT_IDENTITY_MAP.md | DONE (26 AS-EXECUTED classes / 32 AS-WRITTEN) |
| 3–4 Baseline, graph, counterplay, reachability, degeneracy | 03_INTERACTION_GRAPH.md, 08_DEGENERACY_LEDGER.md | DONE (§3.1 constants recomputed & corrected; CP-V1 closed; DEG-01..10, REJ-01..15) |
| 5 Readiness gate | 04_SIMULATION_READINESS.md | DONE — **SIMULATION READINESS: PARTIAL**; corpus class B |
| 6 Policy audit | 05_POLICY_AUDIT.md | DONE (score provenance 19,395 policy / 18,307 reconstructed; blind spots) |
| Probe | probes/probe-scoring-and-sudden-death.mjs | RUN; output recorded in 01 E-G5 / 08 DEG-01 |

## Facts already extracted for Phase 7 (do not recompute)
- Corpus: 100 matches, 88 NORMAL_VICTORY / 10 EXHAUSTED / 2 DRAW; FT median 11, p10 4, p90 48, min 0, max 65.
- Seat: seat1 wins 37/98 decided (0.378), Wilson95 [0.288, 0.476]. **Confound:** hybrix-support/tank/baseline have 0 seat-1 games (14/24 seat-2 wins); hybrix-sniper 4 vs 8. Other 8 policies 12 seat-1 / 8–9 seat-2. → recompute seat-1 rate on the 8 balanced policies only before any seat verdict (one node one-liner over `sample-data/autonomy/match-summaries.ndjson` filtering both `policyIds` ∉ {hybrix-support,hybrix-tank,hybrix-baseline,hybrix-sniper}).
- Usage/opportunity (aggregate.json): 2B2R 73/135; 3-Red counter 97/152; Board Lock 25/166; 10♥ 29/65; 10♣ Foundation 53/145; 7 Topdeck 30/736; Solo Wild 16/303; Wild Sovereignty 2/72; K♠ counter 2/3; ⭐A 14/23; A-base 29/38; A♠ 14/17; 8♠ free scuttle 24/27; ⭐2 hold 9/11 (score 0/11); ⭐4 0/15; ⭐8 0/3; ⭐J 0/2; QC 0/12; RM 1/8; Scuttle 112/555; Score 587/1631; Draw 776/2104; J Disrupt 160; 9 Tap 80; 8 Quick 76; Q Quick 44; Total Clear 16/123; Voltage 42/405.
- Turn-1 kill observed: match `M-db10a45b83e5e68eb1fd` (hybrix-defender vs hybrix-trickster, seed 2020885632): P1 opened 10♣ Foundation + **BJ as bonus score** (10+11=21) on FT1, 0 completed FTs; P2's 3-Red counter was itself countered by P1's 3-Red. Reachability of 10♣+BJ in 5-card opener ≈ 0.7% (C(52,3)/C(54,5)). Note: Foundation bonus path bypasses the scoring-rider refusal (IMPL-01 nuance — BJ *can* enter PR via 10♣ bonus / 7-generated score / Voltage-3).
- Other fast wins: `M-7856e24c…` tempo>score-rush 2 FT (27–15) via 2× 2B2R + 5 scores; `M-f6d8aa25…` trickster>random 2 FT (21–0) via 10♥.
- Policy scores: 2B2R ≈1600–1770, 10♥ ≈1650, counters ≈1200–1900, 3-Red ≈1000–1400 vs decline 70–330; solo-wild/wild-sovereignty ≈100 (blind); 7 Topdeck ≈900–1050. 32% zero-margin decisions.

## Remaining work (Phases 7–10) — planned content, no new simulation required
1. **06_EMPIRICAL_EVIDENCE.md** (Phase 7): tabulate the usage/opportunity facts above with cohort/n/grade B; seat analysis with the balanced-policy filter; termination mix; fast-win cohort (≤4 FT) description; explicitly mark NOT_OBSERVABLE (Unrestricted families) ≠ zero.
2. **07_COUNTERFACTUALS.md** (Phase 8): no batch runs — record the trace-based counterfactuals already available (turn-1 kill alternatives from `legalOptions`; 2B2R "hold vs fire" as EXP-01 spec) as policy-conditioned estimates; list `packages/simulation-runtime/src/counterfactual.mjs` as the tool for follow-ups.
3. **Phase 9 red-team** the five most consequential findings: (a) IMPL-12 Rank-10/Super counter immunity; (b) DEG-06 2B2R tempo burst + 10♥ (COMMON, ⭐A/3-Red-only answers); (c) 10♣+BJ turn-1 kill (RARE 0.7%, but uncounterable by Aces); (d) IMPL-01 7/BJ no scoring (AS-EXECUTED strict subset; not a balance problem but invalidates 7/BJ verdicts); (e) DEG-01 Sudden Death dead action in ranked profile. Record STRENGTHENED/UNCHANGED/WEAKENED per spec §44.
4. **09_RANK_DOSSIERS.md** — 15 dossiers using the exact §41 Artifact-5 headings; sources: 01 (modes), 02 (classes), 03 (bundles, reachability, counterplay), 05 (policy-realized), facts above (empirical). Provisional verdicts (to be red-teamed): A STRONG BUT HEALTHY · 2 NICHE BUT HEALTHY (2♠ WATCHLIST) · 3 HEALTHY/SHALLOW · 4 HEALTHY (4♠ WATCHLIST) · 5 HEALTHY (suit split BLOCKED) · 6 HEALTHY · 7 **BLOCKED BY CORRECTNESS DEFECT** (IMPL-01) · 8 STRONG BUT HEALTHY (8♠ watch) · 9 HEALTHY (Goal Shift BLOCKED) · 10 → per card: 10♥ **WATCHLIST/POTENTIALLY OVERTUNED AS-EXECUTED** (IMPL-12), 10♣ WATCHLIST (turn-1 kill), 10♦ INSUFFICIENT/BLOCKED (IMPL-04), 10♠ NICHE BUT HEALTHY · J HEALTHY · Q STRONG BUT HEALTHY (fortress DEG-09 watch) · K STRONG BUT HEALTHY (K♠ hub; Wild Sovereignty POLICY-SENSITIVE) · RJ HEALTHY/INSUFFICIENT · BJ **BLOCKED BY CORRECTNESS DEFECT** (scoring) + Board Lock WATCHLIST (DEG-07). Ultras: 2B2R **WATCHLIST → change candidate only if EXP-01 confirms**; 3-Red POLICY-SENSITIVE; 3-Black HEALTHY. Supers ⭐2/⭐4/⭐8/⭐J NICHE BUT HEALTHY (RARE pairs; K♠-only counter noted); ⭐3/5/6/7 INSUFFICIENT/DEFECT.
5. **10_BALANCE_FINDINGS.md** — Artifacts 1,2,4,6,7,8 (15×15 matrix), 9,10,13,14,15,16 consolidated; change recommendations expected: **0 gameplay changes**; A-list = correctness/documentation/policy work (IMPL-01/02/03/04/12 repair specs, AUTH-04 manifest truth, policy blind spots, seat-balanced campaign); C-list = 2B2R, 10♥, Board Lock, Q♠ fortress pending experiments.
6. **11_EXPERIMENT_PLAN.md** — EXP-01 2B2R hold-vs-fire; EXP-02 Board Lock ahead/behind; EXP-03 10♥ effect-vs-score & counter exposure; EXP-04 Queen-fortress uncounterable windows; EXP-05 Total Clear swing; EXP-06 seat-balanced 12×12 round-robin on **core-unrestricted-authority** (competitive profile) with Sudden Death/⭐6/⭐7 defects flagged; EXP-07 Ace/K♠ retention counterfactual via `counterfactual.mjs`.
7. **balance-check-findings.json** — schema in spec §41 Artifact 17; populate from 09/10.
8. Final handoff message per spec "FINAL DELIVERY DISCIPLINE".

## Open verification debts (optional, cheap)
- CP-V2 / AMB-01: 8 Instant vs pending ⭐8 (grep `targetAcceptsEight` in core-authority.js).
- IMPL-11: RJ Shuffle Reset counter authority.
- Gate #14: `deep-draw` opportunity over-count for non-♠ Sixes (telemetry key derivation in `packages/telemetry/src/rank-telemetry.mjs`).

## Constraints still in force
Canonical gameplay read-only (nothing modified; probe writes nothing). No new campaigns. Single lead agent. Reuse IDs: E-G*, IMPL-*, AUTH-*, DEG-*, REJ-*, POL-*, CP-V*, AMB-*, EXP-*.
