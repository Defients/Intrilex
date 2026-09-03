# 05 — Policy & Valuation Audit

Phase 6 · Policies materially influencing the admissible corpus: core v2.0.0 (`random-legal`, `score-rush`, `control`, `tempo`, `value`; `packages/policies/src/scoring.mjs`) and Hybrix (`packages/game-ai/src/rank-strategy.mjs`, `cognition.mjs`, `policy-adapter.mjs`). Score provenance rule (spec §20) applied: only `scoreSource='policy'` options are treated as emitted valuation.

## 5.1 Score provenance (SOURCE FACT)
- `decision-trace.mjs:94-111`: option `score` = policy `actualTotal` when the policy emitted a candidate score (`scoreSource='policy'`), else the causal-decomposition reconstruction (`scoreSource='reconstructed'`); residual recorded.
- Corpus: 37,702 options — **19,395 policy / 18,307 reconstructed**. `random-legal`: 100% reconstructed (never emits scores). Strategic core policies emit **top-8 only** (`policies/index.mjs:19`), so lower-ranked alternatives are always reconstructed. Hybrix emits candidate scores (mixed ratios, e.g. defender 3,258 policy / 2,689 reconstructed).
- `selectionMargin`: median 94, **32.2% of decisions have margin 0** (exact ties broken deterministically by actionId order) → unstable close-call selection is systemic.
- Consequence: any statement "policy X valued action Y at S" below is restricted to `policy`-scored options; reconstructed values are used only descriptively.

## 5.2 Core strategic policies — structure and blind spots (SOURCE FACTS from `scoring.mjs:7-21,81-148`)

One-ply additive scorer; no lookahead, no opponent model, no hand-retention model (`traits` such as `counterConservation` are declared in `index.mjs:33-36` but **never read** by `scoring.mjs`).

| Action family | Score formula (key terms) | Typical value | Bias produced |
|---|---|---|---|
| play-for-points | base 650–1300 + pts×34 (control ×12); **6000 if it wins** | 8-pointer: 922 (control) … 1572 (score-rush) | Immediate-points bias for score-rush/value; win detection is correct |
| advanced (`royal-marriage`,`super`,`rank10`,`ultra`,`voltage`,`sudden-death`) | base 900–1120 + modeBonus (ultra 300, **sudden-death 280 + 300**, rank10 240, RM 220, super 180, voltage 160) + miniTurns×120 + draw×55 + control 200 + recovery 140 + anchor×16 + mimic 180 + hold 150 − source×(3 multi / 1) | 2B2R-draw (tempo): ≈1120+300+240+110−src ≈ **1600–1770**; 10♥: ≈1120+240+240+55 ≈ 1650 | **Ultras and 10♥ outrank scoring any ≤13-pt card** → fired whenever legal (2B2R 73/135 opps, 10♥ 29/65). In Unrestricted these policies would fire the dead Sudden Death (≈1500–1700) on turn 1 → POL-A1. |
| counter | base 900–1250 + premium (super 360, K♠ 300, A♠ 240) + 320 if opponent root (−500 own) + depth×18 | ≈1200–1900 | **Counters fire whenever available**; no conservation → Aces/K♠ are burned on the first eligible target (A-base 29/38 opps, ⭐A 14/23, K♠ 2/3) |
| ultra as response (3-Red) | advancedScore → ≈1000–1400 vs decline 70–330 | | **3-Red Ultra fired 97× in 100 games** (152 opps): three red cards spent to counter almost anything |
| disrupt / instant / quick | base 760–1080 + special (stack-theft 600, scuttle 280, tap 220, aegis 180, default 100) + 240 hostile / 80 quick / −280 | ≈1100–1700 | J Disrupt fired **160×**, 9 Tap 80×, 8 Quick Aegis 76×, Q Quick 44× — Free plays used almost whenever legal |
| scuttle | base 820–1080 + target×28 − source×7 (+240 absolute) | 10-pt target: ≈1100–1360 | Scuttle preferred over scoring low cards; 112/555 opps |
| effect-* / anchor | base 760–1050 + target×22 + affected×60 + draw×50 + anchor×25 + structural 180 | 4♠ Total Clear affecting 6: ≈1300+; 7 Topdeck ≈ 900–1050 | 7 Topdeck loses to scoring an 8+ → **30/736 opps (4%)** |
| draw | 510–620; **1100 if hand ≤2** | | Draw only when hand is short |
| swap-bar | face-down 620–900 − source×3; face-up 700 + target×12 | | face-down 157/525; face-up 51/1726 |
| **solo-wild, wild-sovereignty** | **not matched → `default`: 100 + target×8 − source×2** | ≈100 | **BLIND**: chosen only by `random-legal` (solo-wild 16/303, wild-sovereignty 2/72) |
| response-decline | 70–330 (opponent's item) / 720–820 (+900 own top) | | Declining is almost never preferred when any response exists |
| phase (enter action) | 5000 | | correct |
| exhausted-pass | −100 | | correct |

### Hard-coded rank preferences
None by rank symbol in core scoring; preference is by **family** (ultra > rank10 > royal-marriage > super > voltage) and by feature counts (miniTurns, draw). This is an *architectural* preference: all multi-card advanced families receive a flat bonus regardless of board state.

## 5.3 Hybrix (`packages/game-ai`) — capabilities (SOURCE FACTS, grep-level)
- `rank-strategy.mjs`: `MODE_CATEGORY` map (L37+), rank-specific mode valuation incl. Rank-10 differentiation (L184-236) and Ace/King counter modes (L237-260); `counterConservation()` (L164) and `conservationPenalty()` (L170) exist; `combinationAwareness()` (L167) recognises Super setup at one ply; `PREMIUM_COUNTER_RANKS = {A}` (L32).
- Still one-ply over the same `authorizedView`; personality (`personality.mjs`) and difficulty (`difficulty.mjs`) modulate weights. No multi-turn planning, no opponent-hand inference.
- Corpus behaviour: Hybrix policies are the top performers (rusher/trickster 65%, sniper 67%, baseline/tank 63%) — but three of them never sat in seat 1 (04 §4.2), so their win rates are seat-confounded.

## 5.4 Policy-bias register (ARTIFACT 12 format)

| Policy behavior | Affected cards | Likely distortion | Score provenance | Evidence | Severity |
|---|---|---|---|---|---|
| Flat +300 Ultra bonus, +120/Mini-Turn, +55/draw → 2B2R fires whenever legal | all colours (Ultra components), indirectly every card in hand | Overstates policy-realized power of 2B2R; understates hand-retention value of the 4 consumed cards | policy | `scoring.mjs:9,99`; usage 73/135 | HIGH |
| 3-Red Ultra used as a generic counter (97/152) | red cards; every effect play (over-countered) | Depresses resolution rate of *all* effects under Advanced sims; inflates "counter" telemetry; understates Ace threat value (3-Red substitutes) | policy | `mechanicCounts.three-red-counter=97` | HIGH |
| Counters fire on first eligible target, no conservation | A, A♠, ⭐A, K, K♠, 8 | Understates latent/threat value; overstates early counter usage | policy | counter base 900–1250 + 320 | HIGH |
| Free plays (J Disrupt 160, 9 Tap 80, 8 Quick 76, Q Quick 44) used near-maximally | J, 9, 8, Q | Overstates realized value of Free timing modes; J Disrupt's +1 card is treated as pure upside | policy | `scoring.mjs:126-131` | MEDIUM |
| `solo-wild` / `wild-sovereignty` fall to default scorer (≈100) | all Twos, K♠ | **Zero policy-realized power** for Solo Wild and Wild Sovereignty; their usage (16, 2) is `random-legal` noise | policy (blind) | `scoring.mjs:148`; usage/opps | HIGH (verdict withheld for these modes) |
| 7 Topdeck scored ≈900–1050 vs 8+ point scores ≈1300+ | all Sevens | Sevens are almost never played (30/736); combined with IMPL-01 (no scoring), Sevens are near-dead in sims | policy | usage/opps | HIGH |
| 10♣ Foundation +bonus scored ≈1500 (rank10 240 + target) | 10♣ | Used 53/145 — likely appropriate; but the BJ-as-bonus turn-1 kill is policy-discovered (06 §6.4) | policy | trace `M-db10a45b…` | INFO |
| Sudden Death family bonus 280 + 300 (Unrestricted only) | — | Would fire the dead Sudden Death immediately in any Unrestricted campaign | policy (weights) | `scoring.mjs:9,96-99`; DEG-01 | HIGH (latent) |
| 32% zero-margin ties | all | Deterministic tiebreak by actionId hash → pseudo-random choice among equals; not a valuation | policy | traces | MEDIUM |
| `random-legal` uniform | all | pure exploration baseline; all its options reconstructed | reconstructed | `policies/index.mjs:24-31` | n/a |
| Hybrix seat imbalance (3 policies never seat 1) | — | confounds seat-1 win-rate and policy win-rates | — | 04 §4.2 | HIGH for seat inference |

## 5.5 Policy-sensitivity classifications (feed 09/10)

`POLICY_SENSITIVE — BALANCE CONCLUSION WITHHELD` for: Solo Wild (2), K♠ Wild Sovereignty, 7 Topdeck realized value, Ace/K♠/8 threat value (retention never modelled), 3-Red Ultra frequency, 2B2R frequency, all Free-timing usage rates, all Unrestricted-only families (no data).

Mechanical verdicts in 09/10 therefore rest primarily on Phases 1–4 (executable mechanics + reachability + interaction topology), with the corpus used only to (a) confirm reachability of specific states (turn-1 kill, 3-Red over-countering, tempo bursts) and (b) bound policy-realized usage.
