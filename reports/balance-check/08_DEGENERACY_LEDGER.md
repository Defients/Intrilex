# 08 — Degeneracy & Exploit Ledger

Phase 4 (updated through Phase 9). Every entry has step-by-step legality against the **executable** engine (01 evidence IDs). Classes: LEGAL_HEALTHY · LEGAL_SUSPICIOUS · LEGAL_DEGENERATE · RULE_AMBIGUITY · IMPLEMENTATION_DEFECT · POLICY_ARTIFACT · ILLEGAL_SEQUENCE · INSUFFICIENT_EVIDENCE.

## Confirmed

| ID | Case | Legality proof | Class | Impact |
|---|---|---|---|---|
| DEG-01 | **Free Sudden Death declaration (Unrestricted)** | (1) Action phase, Mini-Turn available; (2) `enumerateAdvancedCoreCandidates` emits `sudden-death/declare` with `sourceCardIds: []` whenever `!rt.suddenDeath` (`core-advanced.js:732-733`); (3) `enumerateCoreLegalActions` surfaces INTERRUPT candidates lacking `targetStackItemId` (`core-autonomy.js:273`); (4) `core-resolve-advanced` consumes the Mini-Turn (`core-authority.js:528`); (5) `core-complete-turn` never decrements `phase8.suddenDeath` (`core-authority.js:1049-1100`). Probe: after 12 FTs `remaining` = 3, winner null. | **IMPLEMENTATION_DEFECT** (dead action; no win path) | Mini-Turn sink offered to humans in ranked profile and to `random-legal`; no degenerate win. Repair sketch in 10 §C. |
| DEG-02 | **⭐6 / ⭐7 enumerated as zero-keep / zero-assign (Unrestricted)** | `core-advanced.js:713-719`: `keepCardIds: []`, `handCardIds/effectCardIds/scoreCardIds: []`; resolver honours the empty sets → ⭐6 = discard 1 + cycle 8 + keep 0; ⭐7 = reveal 4 + return 4. | **IMPLEMENTATION_DEFECT** (negative-value actions) | Hidden Supers ⭐6/⭐7 are traps AS-EXECUTED; empirical usage of them would be pure policy artifact. |
| DEG-03 | **Solo Rank-10 effects immune to Base Ace / A♠** | IMPL-12 proof. 10♥ (+2 MT, +1 card) can be answered only by ⭐A (two Aces held: 4–15%) or 3-Red Ultra. | **RULE_IMPLEMENTATION_CONFLICT** (engine narrower than rulebook) | 10♥ effectively uncounterable; inflates Rank-10 practical power. Not a loop. |
| DEG-04 | **7 / BJ have no scoring path; 10♣ only via Rank-10 slot** | IMPL-01 proof + probe. | **IMPLEMENTATION_DEFECT (fail-closed by design; manifest truth drift)** | Rank 7 floor collapses to effect-only; BJ collapses to Board Lock. Not exploitable, but distorts every 7/BJ verdict. |
| DEG-05 | **Manifest advertises unsupported modes** | `RANK_REGISTRY.modes` + `config/engine-manifest.json` list 12+ modes with no code path (AUTH-04); `special-scoring-riders` listed as supported while `core-score` refuses (E-G5). | **IMPLEMENTATION_DEFECT (documentation/analytics truth)** | Any analytics keyed on registry modes over-counts "opportunity" for dead modes. |

## Plausible / Requires Targeted Testing

| ID | Case | Legality | Class | What would settle it |
|---|---|---|---|---|
| DEG-06 | **2B+2R Ultra tempo compression** — 4 hand cards → +2 Mini-Turns + draw 2, once/FT, COMMON (60.1% of 5-card / 77.3% of 6-card opening hands, Jokers excluded as colourless) | Legal: `core-advanced.js:409-430,679-685`; counter only ⭐A/3-Red. Net: hand −2, actions +2 in the same FT (e.g. score 3 cards in one FT from turn 1). Not repeatable-infinite (hand shrinks; Ultra once/FT). | **LEGAL_SUSPICIOUS** | EXP-01 (07/11): usage/opportunity + win-association stratified by seat/policy; counterfactual "hold vs fire". Verdict withheld pending policy audit (policies may under/over-use). |
| DEG-07 | **Board Lock by the leader** — BJ Quick while ahead freezes Scuttle/effects for 2 FTs; scoring continues | Legal (E-G10). Answers: ⭐A pair or 3-Red at declaration only. | **LEGAL_SUSPICIOUS** (asymmetric snowball tool; but 1 copy, 9–11% opening, and the trailing player still scores) | EXP-02: Board-Lock activations stratified by point differential at activation; win rate conditional on being ahead vs behind. |
| DEG-08 | **10♥ Tempo Spike un-counterable + 3-action finish** | Legal (DEG-03). 10 pts forgone. | LEGAL_SUSPICIOUS | EXP-03: 10♥ effect-vs-score selection and terminal-turn frequency. |
| DEG-09 | **Queen fortress + Two-Queen ⭐A denial** — 2 untapped ER Queens (Queen's Court 1 MT, or two anchors) → mutual Guard + ⭐A/3-Red cannot target owner's plays → owner's Ultras/Board Lock/Rank-10 become **fully uncounterable** (Aces excluded by class, ⭐A by Queens, K♠ only ≥2-source) | Legal chain: QC (`core-advanced.js:129-143`) → next FT Ultra/10♥/Board Lock with no legal counter. Break: 4 Row Clear ER after entry Aegis lapses (any 4; Q♠ survives), 4♠, ⭐2 (bypasses Guard), ordinary K vs the *anchor* plays only if single-card (QC needs K♠). | **LEGAL_SUSPICIOUS** — bounded by 4s (4 copies, 33–38% held) and by Queens' 2-pt/0-pt cost. Terminates, not a lock. | EXP-04: frequency of ≥2 untapped ER Queens at opponent's Ultra/Board Lock declaration; opponent Row-Clear availability at that moment. |
| DEG-10 | **4♠ Total Clear triple access** (4♠ / 2♠ / K♠+discard) after opponent commits a big PR | Legal; single-card ordinary effect → Ace-counterable (57–64% of hands hold A or 8, ~35% an Ace). Also wipes own board. | **LEGAL_HEALTHY** leaning WATCH (comeback tool, high variance; sacrifices K♠ forever via Exile) | EXP-05: Total Clear resolution rate vs counter rate; point swing at resolution; behind/ahead stratification. |

## Correctness Defects (see 01 §1.2 for full list)
DEG-01, DEG-02, DEG-04, DEG-05 above; plus IMPL-04 (10♦ mimic menu & GY destination), IMPL-05 (Goal Shift absent), IMPL-06 (2 Quick / Wild Catalyst absent), IMPL-07 (suit modes absent), IMPL-08 (Royal Shield absent), IMPL-09 (10♣ as Rank-10 effect), IMPL-10 (timer order; Voltage simplifications), IMPL-12/13 (counter class mapping). **None applied during this pass.**

## Rule Ambiguities
| ID | Question | Status |
|---|---|---|
| AMB-01 | Does the 8 Instant Scuttle Counter target a pending ⭐8 Absolute Scuttle (class `super`) or only `scuttle`-class items? Rulebook: "Counter one pending Scuttle attempt"; ⭐8 is titled "Absolute Scuttle". | RULE_AMBIGUITY / engine UNVERIFIED (CP-V2) |
| AMB-02 | Rulebook "Base Ace may counter an eligible multi-card Effect when no narrower rule prevents it" vs Counter Authority matrix "Super → K♠". Engine chose K♠-only. | RULE_AMBIGUITY resolved by engine = K♠-only (IMPL-12) |
| AMB-03 | 10♠ Stack Theft countered: rulebook gives thief a skip, no skip to caster; engine applies both skips only at resolution (countered → no skips at all?) | UNVERIFIED, low impact |

## Policy Artifacts (populated in Phase 6/7 — see 05/06)
| ID | Artifact | Class |
|---|---|---|
| POL-A1 | `random-legal` selects `sudden-death/declare`, ⭐6, ⭐7 in Unrestricted (dead/negative actions) | POLICY_ARTIFACT (only if Unrestricted sims exist; none in current corpus) |
| (further entries in 05_POLICY_AUDIT) | | |

## Investigated and Rejected (mandatory)

| ID | Scary interaction | Why rejected |
|---|---|---|
| REJ-01 | Infinite Topdeck recursion (7 → 7 → 7…) | Recursion is not implemented (`canRecurseTopdeck` never called; generated card may only score or resolve one Core effect). AS-WRITTEN recursion is bounded by physical Sevens (4) and DP. **ILLEGAL_SEQUENCE AS-EXECUTED.** |
| REJ-02 | Mini-Turn stacking beyond 3 (10♥ + ⭐J + 2B2R) | Every grant clamps `Math.min(3, …)` (E-G1). Redundant grants are wasted. |
| REJ-03 | Repeated Queen's Court / multiple Ultras / multiple Rank-10 per FT | Per-FT flags `queensCourtPlayedThisFT`, `ultraPlayedThisFT`, `rank10PlayedThisFT` (E-G14). |
| REJ-04 | 5 Recycle self-loop (mill, rummage the Five back, repeat) | Rummage happens *after* the Five's own move? No — source moves to GY **after** rummage (`ranks.js:411-422`), so the Five cannot rummage itself; each Recycle costs 1 MT; bounded. LEGAL_HEALTHY (+1 net card, GY-dependent). |
| REJ-05 | Exile recycling loop (10♠ Recovery ↔ Exile) | 10♠ goes to Exile itself; recovering it back requires another Exile-access (2B2R rummage / another 10♠ — only 1 exists). Bounded. |
| REJ-06 | Jack attachment control-change exploit (Jack a card, then ⭐2 the Jack, …) | `revalidateAttachments` severs any illegal Jack/host pair on every relevant state change (`interactions.js:122-145`); severed Jack → GY. |
| REJ-07 | Stack-controller exploit via 10♠ (steal a Super/Ultra) | Stack Theft excludes Ultra/SuddenDeath; stealing requires a pending item; both players skip → symmetric tempo. |
| REJ-08 | Hidden-information leak through card ids in ⭐3 raid / Nine Anchor targets | Ids are `CORE-001…054` = shuffled deck position; identity is not encoded (`core-authority.js:54-55`). A revealed-then-returned card is trackable by id — equivalent to human memory. |
| REJ-09 | Negative Goal instant win | Goal Shift absent (IMPL-05); Goal is constant 21 AS-EXECUTED. |
| REJ-10 | Board Lock lock-out of the scoring race | Play for Points, Draw, Swap remain legal under lock; a Board-Locked trailing player can still win by scoring. Snowball concern kept as DEG-07, but not a lock. |
| REJ-11 | Wild Sovereignty as a "free" 4♠ | Requires K♠ (1 copy) + 1 extra discard + K♠ exiled permanently + single-card ordinary effect → Ace-counterable. Cost is high; healthy. |
| REJ-12 | ⭐4 PR exchange when far behind as an uncounterable swing | Counterable by K♠ only (NARROW), but requires a true pair of 4s (RARE–PLAUSIBLE), exchanged cards get Aegis for one Start (delays re-swap), and the opponent may re-exchange with own ⭐4 / 10♦. Kept on WATCHLIST via 10♦ access (10♦ solo = ⭐4). |
| REJ-13 | Voltage abuse | Payoffs are tiny (one card), require rank-3/4/5 PR presence at Start, once per rank per FT, no stack. |
| REJ-14 | Exhausted anchor race exploit (spam Anchors when DP low) | Anchors cost Mini-Turns and cards; K counters single anchors; Row Clear ER answers. Legal, healthy endgame texture. |
| REJ-15 | Sudden Death as a win path | Never ticks (DEG-01) — not exploitable in either direction. |
