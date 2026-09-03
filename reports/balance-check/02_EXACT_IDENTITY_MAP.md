# 02 — 54-Card Exact-Identity Equivalence Map

Phase 2 · Authority: `ranks.js` (`parseIdentity`, `SUIT_ORDER`, resolvers), `core-advanced.js`, `core-effects.js`, `core-autonomy.js`, `interactions.js` (see 01 for line refs). Two classifications are given per card: **AS-EXECUTED** (governing for current balance) and **AS-WRITTEN** (rulebook 4.3.1) where they differ.

Universal suit effect (all 52 suited cards): Scuttle tiebreak ♣<♦<♥<♠ (`ranks.js:22,49-60`) and Ultra colour (♣♠ black, ♦♥ red — `core-advanced.js:60`). Royal Marriage requires K/Q suit match. These are recorded once and not repeated per row. Jokers: no suit, no colour (cannot join Ultras; ties on Scuttle rank vs each other → `compareScuttle` = 0, so RJ cannot Scuttle RJ… trivially irrelevant).

## 2.1 Table — all 54 identities

| Exact Card | Rank Family | Equivalence Class (AS-EXECUTED) | Distinct Mechanics | Balance-Relevant Difference |
|---|---|---|---|---|
| A♣ | A | `A-BASE` | Base counter, Purge, Anchor Ace, ⭐A component, 4 pts | Lowest Scuttle tiebreak among Aces (irrelevant: A is rank 1) |
| A♦ | A | `A-BASE` | same | red for Ultras |
| A♥ | A | `A-BASE` | same | red for Ultras |
| **A♠** | A | **`A-SPADE`** | Exile Counter (sources → Exile); only ⭐A counters it; **cannot** use Base authority; still Purge/Anchor/⭐A component | Unique counter-of-counter immunity + Exile denial; loses nothing vs Base except being un-counterable by Base/Anchor Ace (strictly stronger as a counter) |
| 2♣ | 2 | `2-BASE` | 2 pts; Solo Wild copies 3-bounce/4-row-clear/5-recycle/7-topdeck; ⭐2 component; 10♦ pairing | AS-WRITTEN also: 2 Quick, Wild Catalyst for same-suit ⭐3–7 (both N) |
| 2♦ | 2 | `2-BASE` | same | red |
| 2♥ | 2 | `2-BASE` | same | red |
| **2♠** | 2 | **`2-SPADE`** | additionally Solo-Wild copies **4♠ Total Clear** and **6♠ Deep Draw** | Only 2 that accesses a structural board wipe for 1 card + 1 Mini-Turn (`ranks.js:247`). Highest-leverage Two by far. |
| 3♣ 3♦ 3♥ | 3 | `3-BASE` | 3 pts; present-take (≤2), force-discard, bounce (Action, top DP); ⭐3 component (U) | AS-WRITTEN Instant Bounce N |
| 3♠ | 3 | `3-BASE` (AS-EXECUTED) / `3-SPADE` (AS-WRITTEN) | **no** implemented delta; Wild Sovereignty's "3♠" = plain 3 | Written 3♠ Enhancement (score or cast a presented card) is N → 3♠ is mechanically a 3-BASE today |
| 4♣ 4♦ 4♥ | 4 | `4-BASE` | 4 pts (PR effect-target immune); Row Clear PR/ER; ⭐4 component; 3-Black Ultra black (♣) / red (♦♥) | AS-WRITTEN Quick Natural N |
| **4♠** | 4 | **`4-SPADE`** | **Total Clear** (structural hard bypass of Guard/Aegis/Q♠/immunity) | Only single-card global board reset; also reachable via 2♠ Solo Wild and K♠ Wild (+1 discard). One physical copy. |
| 5♣ 5♦ 5♥ 5♠ | 5 | `5-BASE` (all four) | 5 pts (PR Scuttle immune); Recycle (mill 2, rummage GY, GY bottom draw); ⭐5 component (U) | **AS-WRITTEN each suit has a different Exile window** (♣ newest 2 / ♦ middle / ♥ oldest 2 / ♠ any) — entirely N, so the written 4-class split collapses to 1 class. 5♠ written = strongest Five. |
| 6♣ 6♦ 6♥ | 6 | `6-BASE` | 6 pts; Dig (draw 3 keep 2/3); ⭐6 component (U, defective) | AS-WRITTEN Quick Swap Bar Peek N |
| **6♠** | 6 | **`6-SPADE`** | **Deep Draw** (discard 1–2, draw 6, keep 3/4); requires another hand card; copyable by 2♠ and K♠ | Best raw card-selection engine among singles |
| 7♣ 7♦ 7♥ | 7 | `7-BASE` | Topdeck (reveal 2: hand + generated effect/score); **no scoring**; ⭐7 component (U, defective); K♠/2 can copy | AS-WRITTEN: 7 pts + scoring trigger (N) |
| 7♠ | 7 | `7-BASE` (AS-EXECUTED) / `7-SPADE` (AS-WRITTEN) | no implemented delta | Written reveal-3 is N |
| 8♣ 8♦ 8♥ | 8 | `8-BASE` | 8 pts (PR effect-immune, Scuttleable); Quick Aegis Field; Instant Scuttle Counter; ⭐8 component | AS-WRITTEN Scuttle Bonus N |
| **8♠** | 8 | **`8-SPADE`** | **Free Scuttle** (Instant, no Mini-Turn, ignores rank/suit; respects Aegis + A/5/RJ immunity) | Only free removal in the game; response-window timing gives it Interrupt-like tempo |
| 9♣ 9♦ 9♥ | 9 | `9-BASE` | 9 pts (never Aegis); Instant Tap; Nine Anchor (reveal + discard) | AS-WRITTEN Goal Shift N |
| 9♠ | 9 | `9-BASE` (AS-EXECUTED) / `9-SPADE` (AS-WRITTEN) | no delta (Goal Shift absent → −2 rider unreachable) | |
| **10♣** | 10 | **`10-CLUB`** | Foundation: Rank-10 effect → enters PR at 10 with Aegis; if points were 0, free bonus score of one hand card; consumes Rank-10 limit; Exile-Bound | Cannot be plain-scored (IMPL-01/09). Only 10 that "scores" at all. |
| **10♦** | 10 | **`10-DIAMOND`** | Mimic: solo ⭐4 exchange; +2: ⭐8 absolute scuttle, ⭐J tempo (+U: Base-7/Base-5 no-choice); Exile-Bound marker but GY destination | Cannot score for points at all AS-EXECUTED? — **No: 10♦/♥/♠ CAN be plain-scored** (only 7/10♣/BJ refused, E-G5). So 10♦ = 10 pts OR narrow mimic. |
| **10♥** | 10 | **`10-HEART`** | Tempo Spike +2 MT (cap 3) + draw 1; source → Exile | Only single-card Mini-Turn generator besides ⭐J/2B2R |
| **10♠** | 10 | **`10-SPADE`** | Stack Theft (Interrupt; steal single pending effect; both +1 FT skip); Exile Recovery (Action) | Only control-of-stack effect; only single-card Exile access |
| J♣ J♦ J♥ | J | `J-BASE` | 3 pts; Instant Disrupt (+draw 1); PR Attachment (+1, control); ⭐J component | Scuttle rank 11 despite 3 pts |
| **J♠** | J | **`J-SPADE`** | additionally **ER Attachment** (steal an enemy Anchor incl. Queen → steals Guard) | Only anti-Anchor control-change outside ⭐2 |
| Q♣ Q♦ Q♥ | Q | `Q-BASE` | 2 pts; ER Anchor Guard + entry Aegis; Quick Aegis; Queen's Court; Royal Marriage w/ same-suit K | |
| **Q♠** | Q | **`Q-SPADE`** | immune to non-total multi-target clears (survives 4 Row Clear) | Fortress keystone; only 4♠ / ⭐2 / J♠ / Scuttle-N/A (ER) answer it |
| K♣ K♦ K♥ | K | `K-BASE` | 8 pts; Instant counter single-card Anchor play; Anchor 7; Royal Marriage w/ same-suit Q | Goal-Mod counter authority vacuous (IMPL-05) |
| **K♠** | K | **`K-SPADE`** | Anchor 9; **Counter Multi-Play** (Supers, RM, QC, paired 10♦); **Wild Sovereignty** (3/4-row/4♠-total(+discard)/5/6♠/7 Base; → Exile) | Most modes of any physical card; sole direct answer to Queen's Court / Royal Marriage |
| RJ | RJ | `RJ` | 5 pts (PR Scuttle+Jack immune); 4 hand-reset modes | No suit → never an Ultra component; Scuttle rank 14 |
| BJ | BJ | `BJ` | **Board Lock** (Quick, free, 2-turn global lockdown; only ⭐A authority counters); top Scuttle rank | **11 pts unreachable AS-EXECUTED** (IMPL-01); Exile Recycle N |

## 2.2 Equivalence classes → rank-family abstractions

**AS-EXECUTED: 26 mechanical equivalence classes**

| Class | Cards | Size |
|---|---|---|
| A-BASE | A♣ A♦ A♥ | 3 |
| A-SPADE | A♠ | 1 |
| 2-BASE | 2♣ 2♦ 2♥ | 3 |
| 2-SPADE | 2♠ | 1 |
| 3-BASE | 3♣ 3♦ 3♥ 3♠ | 4 |
| 4-BASE | 4♣ 4♦ 4♥ | 3 |
| 4-SPADE | 4♠ | 1 |
| 5-BASE | 5♣ 5♦ 5♥ 5♠ | 4 |
| 6-BASE | 6♣ 6♦ 6♥ | 3 |
| 6-SPADE | 6♠ | 1 |
| 7-BASE | 7♣ 7♦ 7♥ 7♠ | 4 |
| 8-BASE | 8♣ 8♦ 8♥ | 3 |
| 8-SPADE | 8♠ | 1 |
| 9-BASE | 9♣ 9♦ 9♥ 9♠ | 4 |
| 10-CLUB / 10-DIAMOND / 10-HEART / 10-SPADE | one each | 4×1 |
| J-BASE | J♣ J♦ J♥ | 3 |
| J-SPADE | J♠ | 1 |
| Q-BASE | Q♣ Q♦ Q♥ | 3 |
| Q-SPADE | Q♠ | 1 |
| K-BASE | K♣ K♦ K♥ | 3 |
| K-SPADE | K♠ | 1 |
| RJ | RJ | 1 |
| BJ | BJ | 1 |

(Within-class residual differences: colour for Ultras and Royal-Marriage suit pairing — these are *recipe* differences, not *text* differences, and are handled in the Super/Ultra analysis.)

**AS-WRITTEN: 32 classes** — adds 3-SPADE (3♠), 7-SPADE (7♠), 9-SPADE (9♠) and splits 5 into four singleton classes (5♣/5♦/5♥/5♠). Rank 10 is the only family with four fully distinct identities in both views (spec §9 heightened-attention case confirmed).

## 2.3 Where exact suit changes each audited dimension (AS-EXECUTED)

| Dimension | Suits that change it |
|---|---|
| Legal actions / modes | A♠, 2♠, 4♠, 6♠, 8♠, 10♣/♦/♥/♠, J♠, K♠ |
| Timing | 8♠ (Instant free scuttle), 10♠ (Interrupt), A♠ (n/a same Instant) |
| Targets | 4♠ (all OTT), J♠ (enemy Anchors), 10♠ (stack items / Exile), 2♠ (via copied 4♠/6♠) |
| Magnitude | K♠ Anchor 9 vs 7; 6♠ keep 3–4 vs Dig keep 2–3 |
| Access permissions | 10♠ (Exile), 2♠/K♠ (spade Base copy) |
| Counter authority | A♠ (Exile destination; only ⭐A counters), K♠ (multi-play) |
| Protection | Q♠ (clear immunity); 4♠ (bypasses all) |
| Scuttle | every suited card (tiebreak); 8♠ (free) |
| Wild behavior | 2♠ (spade copies), K♠ (Wild Sovereignty) |
| Super eligibility | none (same-rank pairs only; 2-as-wild N) |
| Ultra utility | colour only (♣♠ vs ♦♥) |
| Exile access | 10♠ only (+ 2B2R Ultra, any colours) |
| Scoring behavior | 10♣ (Aegis entry + bonus) ; 7/BJ (none, all suits) |
| Anchor behavior | K♠ (9), J♠ (attach to Anchor), Q♠ (clear immunity) |
| Generated-play behavior | none differentiated (7♠ N) |
| Destination | A♠ (Exile), 10♥/10♠/K♠-Wild (Exile) |
| Cost | K♠ Wild-4♠ (+1 discard), 6♠ (1–2 discards) |
| Limits | 10♣/♦/♥/♠ share the Rank-10 slot |

## 2.4 Identities requiring heightened scrutiny (carried to Phases 3–4)

1. **Rank 10** — four radically different texts; 10♣ vs 10♦ vs 10♥ vs 10♠ evaluated independently (never "Tens are strong").
2. **K♠** — five-mode singleton; sole answer to Queen's Court/Royal Marriage; Wild Sovereignty accesses 4♠ Total Clear.
3. **2♠** — the only 2 that reaches Total Clear / Deep Draw for one card.
4. **4♠** — the only structural reset; three access routes (natural, 2♠, K♠).
5. **8♠** — the only free removal; Instant timing.
6. **Q♠** — fortress keystone; answers restricted to 4♠ / ⭐2 / J♠.
7. **A♠** — strictly-dominant counter variant.
8. **BJ** — AS-EXECUTED a pure Board-Lock / top-Scuttle card; AS-WRITTEN an 11-point scorer (largest single AS-WRITTEN/AS-EXECUTED gap of any identity).
9. **Sevens (all four)** — no scoring access AS-EXECUTED.
10. **Fives (all four)** — written suit split entirely absent.
