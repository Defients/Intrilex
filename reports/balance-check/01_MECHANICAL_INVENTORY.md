# 01 — Complete Mechanical Inventory (Rulebook v4.3.1 vs Executable Engine 4.2.6)

Phase 1 · read-only · Evidence IDs `E-*` are reused by all later artifacts. `RB:` = rulebook line in `docs/INTRILEX_v4.3.1_COMPLETE_PLAYER_RULEBOOK.md`; engine paths are relative to `runtime/autonomy-engine-dist/src/`. Worker reports (W1 = ranks A–7 / Two / Ultras / Voltage, W2 = ranks 8–BJ / systems) were reconciled by the lead against primary source before acceptance; two W1 claims were downgraded (see E-2.3, E-INV-N).

**Governing distinction used everywhere below:**
- **AS-WRITTEN** = rulebook 4.3.1 text (intended game).
- **AS-EXECUTED** = what `core-advanced-authority` (Local-vs-AI default; sim corpus) and `core-unrestricted-authority` (online ranked) actually enumerate and resolve. Balance verdicts for the *current executable game* are AS-EXECUTED; AS-WRITTEN deltas are recorded as `RULE_IMPLEMENTATION_CONFLICT` or `NOT_IMPLEMENTED (FAIL_CLOSED)` and isolated.

## 1.0 Global economy (SOURCE FACTS)

| ID | Fact | Evidence |
|---|---|---|
| E-G1 | 1 Mini-Turn per FT by default; hard cap 3; bonus grants use `Math.min(3, x+2)` | `core-authority.js:74,338-339`; `core-advanced.js:209,353,416`; `ranks.js:571`; RB:121-123 MATCH |
| E-G2 | Six ordinary Actions AS-WRITTEN (Draw, Face-Up Swap Draw, Play for Points, Play for Effect, Scuttle, Draw & Cast). **Draw & Cast is NOT implemented** in any core profile (`excludedSystems: "draw-and-cast"`) | `core-authority.js:13-23`; `core-autonomy.js:252-297`; manifest `completeActionFamilies` | 
| E-G3 | Draw = 1 (2 if hand empty) | `core-autonomy.js:254` MATCH RB:131 |
| E-G4 | Swap Bar: 2 FD + 1 FU; one use per FT (`swapBarUsedThisFT`); Face-Down Swap is a Start-phase SETUP action; Face-Up Draw is an Action | `core-autonomy.js:241-246,255-257`; MATCH RB:376-393 |
| E-G5 | **Play for Points is REFUSED for rank 7, 10♣ and BJ in both Advanced and Unrestricted** (`CORE_SCORING_RIDER_UNSUPPORTED`); the enumerator also hides these score actions. Probe-verified. | `core-authority.js:440-441`; `core-autonomy.js:260-261`; `reports/balance-check/probes/probe-scoring-and-sudden-death.mjs` output | 
| E-G6 | Victory: end of own FT only, `securedPoints >= goal`; goal has no floor (negative allowed) | `core-authority.js:1055-1060` MATCH RB:157 |
| E-G7 | End-phase order AS-EXECUTED: victory → **Exhausted** → **Board Lock** → skip consumption. AS-WRITTEN: victory → Board Lock → Sudden Death → Exhausted. Sudden Death never ticks in the core path. | `core-authority.js:1062-1080`; RB:155-163 → `RULE_IMPLEMENTATION_CONFLICT` (edge: both timers hit 0 same End Phase) |
| E-G8 | Exhausted: begins at Start with empty DP, counter 3, ticks per completed FT, tiebreak anchors → points → draw; Exhausted Pass forced only when no other legal action | `core-autonomy.js:299-303`; `phase8.js:81-88` (per W2) MATCH RB:596-651 |
| E-G9 | Primary actions in Response+ profiles are wrapped in `core-declare-primary` → stack item → response window (Ace/8/9/J/K/K♠/10♠/3-Red responses) → resolution. Voltage resolves directly (no stack). | `core-autonomy.js:21-29`; `core-authority.js:507-529` |
| E-G10 | Board Lock: Quick, no Mini-Turn, only with empty stack/queue; counter 2; blocks Scuttle and all non-counter effect/rank/advanced plays; only ⭐A authority counters | `core-autonomy.js:292-293`; `core-authority.js:454-455,479-483,523-524,535-539,750-776,778-793,1072-1080` MATCH RB:2098-2350 |
| E-G11 | Guard (untapped ER Queen protects *other* OTT cards vs hostile single-target effects), Aegis (expires at recorded future Start; Nines never), Two-Queen Defense vs ⭐A — implemented. **Royal Shield is NOT implemented** (`royalShieldProtected` never set). | `interactions.js:14-37,81-86`; `lifecycle.js:32-41,65-91`; `core-authority.js:788-790` |
| E-G12 | Scuttle: rank order per `scuttleOrder`, suit ♣<♦<♥<♠; PR immunity A/5/RJ; Aegis blocks all Scuttle; ⭐8 ignores immunity not Aegis; enemy-PR-only (Jacked own cards untargetable). **8 Scuttle Bonus (GY draw) NOT implemented.** | `ranks.js:46-60,729-759`; `core-authority.js:450-473` |
| E-G13 | Exile: entered only by explicit effect / Exile-Bound replacement; 10♥ and 10♠ sources go straight to EXILE; K♠ Wild Sovereignty → EXILE; A♠ counter sends countered sources to EXILE; 3-Black Ultra exile role. **10♦ Mimic source is `markExileBound` then moved to GY** (should be Exile) | `core-advanced.js:351,370,405`; `ranks.js:272,360,542-546` → 10♦ = `RULE_IMPLEMENTATION_CONFLICT` |
| E-G14 | Per-FT limits in code: `miniTurnsRemaining`, `swapBarUsedThisFT`, `rank10PlayedThisFT`, `ultraPlayedThisFT`, `queensCourtPlayedThisFT`, Q-Quick once/FT, `voltageUsedThisFT[3/4/5]`, `disruptedActionTypesByPlayer`, `pendingFullTurnSkips` (consumed at turn advance) | `core-authority.js:73-78,109,336-346,736-739,1085-1092` |
| E-G15 | Enumeration truncation (legal-action completeness): 3-Black Ultra ≤12 combos × ≤4 effects; 2B2R ≤20 combos, ≤4 Exile targets; 10♠ recovery ≤12 Exile cards; ⭐3 raid ≤6 opp hand ids; Voltage-4 52 guesses (no Joker) | `core-advanced.js:647,667,674,679,682,708` → policies/humans never see the truncated tail |

## 1.1 Rank-by-rank inventory (AS-WRITTEN → AS-EXECUTED)

Legend: **M** match · **C** RULE_IMPLEMENTATION_CONFLICT · **N** NOT_IMPLEMENTED (fail-closed) · **U** unrestricted-only · **X** implementation defect

### A — Ace (4 pts; PR: Scuttle+Jack immune)
| Mode | AS-WRITTEN (RB:890-966) | AS-EXECUTED | Class | Evidence |
|---|---|---|---|---|
| Base Counter (Instant) | A♣/♦/♥ counter ordinary effect/counter; not A♠/Ultra/SD/Royal-Shield/Anchor/Goal-Mod | implemented; A♠ excluded from base authority; Royal Shield check present but never triggers (E-G11) | M | `ranks.js:254-278`; `core-authority.js:599-617` |
| Purge (🛠) | Scrap Aegised card, else bounce Vulnerable enemy Anchor to hand | both modes implemented | M | `core-effects.js:116-141` |
| Anchor Counter (⚓) | ER Anchor; sacrifice later as Base Ace; take one negated source to hand | implemented (anchor value 0) | M | `core-effects.js:142-149`; `core-authority.js:1019-1024` |
| A♠ Exile Counter | as Base but sources → Exile; only ⭐A counters it | implemented | M | `ranks.js:258-261,272` |
| ⭐A Super Counter | counters anything incl. A♠/Ultra/SD/Board Lock; blocked by 2 untapped Queens | implemented (`superOnly` targets; Two-Queen check) | M | `ranks.js:266-270`; `core-authority.js:778-793` |
| Score 4 | — | offered | M | |

### 2 — Two (2 pts)
| Mode | AS-WRITTEN (RB:968-1027) | AS-EXECUTED | Class | Evidence |
|---|---|---|---|---|
| 2 Quick Score+Discard | score 2, opponent discards 1; once/FT | **absent** (registry mode `quick-score-discard` has no resolver/enumeration) | **N** | `ranks.js:7`; `core-autonomy.js:233-312` (W1, lead-verified by grep) |
| Wild Catalyst (2 as ⭐ 3–7 second card, same suit) | legal | **absent**; all ⭐3–7 require two same-rank cards | **N** | `core-advanced.js:allRank` checks |
| Solo Wild Copy (🛠 3–7 same suit) | 2 adopts same-suit rank 3–7 Base; ♠ enhancements need 2♠ | implemented: any suited 2 copies 3-bounce/4-row-clear/5-recycle/7-topdeck; 2♠ additionally copies 4♠ total-clear and 6♠ deep-draw. Non-♠ Base texts are suit-identical, so "same suit" is vacuous → effectively M. **6 (non-♠ Dig) is not copyable** (SOLO_WILD_EFFECT_RANKS has no `dig`) | M (minor N for 6-Dig copy) | `ranks.js:237-247,302-335`; `core-autonomy.js:124-178` |
| ⭐2 Commandeer | take control of enemy OTT; bypass Guard + rank immunity, not Aegis; score or hold (tapped until next Start) | implemented via `evaluateProtection` bypasses `["guard","rank-effect-immunity"]` | M | `core-advanced.js:145-168,563-605` |
| 2 + 10♦ paired Mimic | expands mimic menu | implemented (see 10♦) | M/C | `core-advanced.js:653-663` |

### 3 — Three (3 pts)
| Mode | AS-WRITTEN (RB:1028-1063) | AS-EXECUTED | Class |
|---|---|---|---|
| 🛠 choose: present-up-to-3-take-1 / discard-up-to-2 / bounce Vulnerable OTT to top DP | present-take (opponent presents ≤3, caster takes 0–2 per private-choice min/max) and force-discard implemented as private choices; bounce implemented as effect | M (present-take **more generous**: up to 2 taken vs 1 written → C minor) | `core-private-choice.js:193-219`; `core-effects.js:56-64` |
| Instant Bounce (top or bottom DP) | Instant | **not offered as response**; only Action-timed bounce to top of DP | N (Instant timing), C (bottom option) | `ranks.js:129-138`; `core-autonomy.js:330-379` no 3 |
| 3♠ Enhancement | present ≤2, score or cast one | **absent** | **N** | registry `spade-enhancement` dead |
| ⭐3 Super Raid | present ≤3 take ≤2, or discard-to-2 | U: caster picks **1** opponent hand card by id (≤6 ids), no discard mode | **U + C** | `core-advanced.js:213-230,705-710` |

### 4 — Four (4 pts; PR: effect-target immune, Scuttleable)
| Mode | AS-WRITTEN (RB:1066-1118) | AS-EXECUTED | Class |
|---|---|---|---|
| 🛠 Row Clear (opp PR or ER; skips Aegis + rank immunity; Guard n/a; Q♠ survives) | implemented; Q♠ survives via `evaluateProtection` (non-total clear) | M | `ranks.js:139-161`; `interactions.js:36-37` |
| 4 Quick Natural (look 4, reorder, draw 1) | **absent** | **N** | registry `natural` dead |
| 4♠ Total Clear (structural; bypasses everything; destination replacements apply) | implemented; all OTT → GY (Exile-Bound honored by `moveCard`) | M | `ranks.js:382-391` |
| ⭐4 Row Exchange (PR or ER; structural; Aegis to all exchanged non-9s; Jack revalidation) | implemented | M | `core-advanced.js:170-188` |

### 5 — Five (5 pts; PR: Scuttle immune)
| Mode | AS-WRITTEN (RB:1120-1152) | AS-EXECUTED | Class |
|---|---|---|---|
| 🛠 Recycle (mill ≤2 → GY; rummage 1 GY card to hand revealed; draw GY bottom) | implemented (private choice for rummage) | M | `core-private-choice.js:220-248`; `ranks.js:403-424` |
| Suit Rummage — Exile access 5♣ newest 2 / 5♦ middle (≥5) / 5♥ oldest 2 / 5♠ any | **absent** — all Fives identical, GY only | **N** (removes the only non-♠ suit differentiation in ranks 3–7) | registry `suit-rummage` dead |
| ⭐5 Super Recycle (mill ≤3, play one milled card for points/effect) | U: mill **4**, rummage list (enumerated empty), draw **2** from GY bottom | **U + C** | `core-advanced.js:232-259,711-712` |

### 6 — Six (6 pts)
| Mode | AS-WRITTEN (RB:1154-1196) | AS-EXECUTED | Class |
|---|---|---|---|
| 🛠 Dig (draw 3; keep 2 return 1 top/bottom, or keep 3 discard 1) | implemented (private choice) | M | `core-private-choice.js:250-279`; `core-autonomy.js:80-90` |
| 6 Quick Swap Bar Peek | **absent** | **N** | registry `swap-bar-peek` dead |
| 6♠ Deep Draw (discard 1–2 others; draw 6; keep 3/4) | implemented (requires ≥1 other hand card) | M | `ranks.js:426-450` |
| ⭐6 Super Dig (draw ≤7 keep ≤4) | U: discard 1–2, draw 8, keep ≤5/6 — **but enumerator fixes `keepCardIds: []`** → as offered, ⭐6 = discard 1 + cycle 8 + keep 0 (pure card loss) | **U + X** | `core-advanced.js:261-288,713-717` |

### 7 — Seven (7 pts AS-WRITTEN; **0 scoring access AS-EXECUTED**)
| Mode | AS-WRITTEN (RB:1198-1396) | AS-EXECUTED | Class |
|---|---|---|---|
| Score 7 + Scoring Trigger (reveal 2, take 1) | legal | **refused** (`CORE_SCORING_RIDER_UNSUPPORTED`); no trigger | **N** (E-G5) |
| 🛠 Topdeck Casting (reveal 2; 1 to hand revealed, other = generated play: effect / score / Super component) | reveal 2 (or 1); assignments hand-only/effect-only/score-only/hand+effect/hand+score; generated card may be scored or declared as one Core effect (`generatedCoreEffectCandidates`) | M (core), N (Super-component branch) | `core-autonomy.js:91-117`; `core-private-choice.js:280-307,342-351,541-571` |
| Recursive generated Sevens | legal only for physical 7 | `canRecurseTopdeck` exported but **never called** → no recursion | **N** | `core-autonomy.js:49-58` |
| 7♠ (reveal 3) | legal | **absent**; all Sevens reveal 2 | **N** |
| ⭐7 Sequential Topdeck (reveal 2, independent generated plays) | U: reveal **4**, assign hand/effect/score sets — **enumerator fixes all sets empty** → reveal 4, return 4, zero value | **U + X + C** | `core-advanced.js:290-320,718-719` |
| 7 as generated effect via K♠/2 copy | K♠→`topdeck-seven`, 2→`topdeck-seven` implemented (reveal 2, hand/effect/score ids supplied at declaration) | M | `ranks.js:211-236` |

### 8 — Eight (8 pts; PR: effect-target immune except 4♠/⭐2)
| Mode | AS-WRITTEN (RB:1397-1434) | AS-EXECUTED | Class |
|---|---|---|---|
| Quick Aegis Field (all own OTT, not Nines) | implemented, QUICK, no Mini-Turn | M | `core-authority.js:714-726` |
| Instant Scuttle Counter | implemented (targets pending Scuttle / 8♠ free scuttle) | M | `core-authority.js:634-648` |
| Scuttle Bonus (draw GY after 8 scuttle) | **absent** | **N** |
| 8♠ Free Scuttle (Instant; ignores rank/suit; respects Aegis + immunity) | implemented as INSTANT during response window (any enemy PR non-Aegis non-immune) | M | `core-autonomy.js:337-340`; `core-authority.js:700-712` |
| ⭐8 Absolute Scuttle | implemented (ACTION, 1 Mini-Turn) | M | `core-advanced.js:190-201` |

### 9 — Nine (9 pts; never Aegis)
| Mode | AS-WRITTEN (RB:1435-1475) | AS-EXECUTED | Class |
|---|---|---|---|
| Instant Tap (untap when controller next scores) | implemented; respects Guard/Aegis; released by `releaseNineTapsForScoring` | M | `core-authority.js:683-698,937-946` |
| Instant Goal Shift (+3 / +5 & discard; 9♠ also −2 own) | resolver exists (`goal-shift-nine`) but **never enumerated in core profiles** | **N** (the entire Goal-manipulation axis is absent from the executable game) | `ranks.js:497-514`; W2 |
| ⚓ Anchor (reveal opp hand; opp discards 1; one active Nine Anchor) | implemented as private-choice; previous Nine Anchor scrapped | M (hand reveal not modelled as information event — U) | `core-private-choice.js:309-338` |

### 10 — Ten (10 pts; 1 Rank-10 effect/FT; Exile-Bound on resolution)
| Card | AS-WRITTEN (RB:1476-1582) | AS-EXECUTED | Class |
|---|---|---|---|
| 10♣ Foundation | **scored for Points** → Aegis until next Start; if prior points 0, optional free score of one hand card | implemented as a **Rank-10 effect play** (consumes `rank10PlayedThisFT`, marks Exile-Bound); ordinary score refused; bonus offered when points=0 | **C** (10♣ can never be a plain 10-point score; costs the Rank-10 limit; becomes Exile-Bound while in PR) | `core-advanced.js:322-343,633-643`; E-G5 |
| 10♦ Mimic solo | mimic any ⭐ of ranks 3–7 | Advanced: **only ⭐4 Row Exchange**; Unrestricted adds "⭐7"/"⭐5" but resolved as **Base 7 topdeck (no assignments → reveal 2 return 2)** and **Base 5 recycle (no rummage)** | **C** |
| 10♦ Mimic paired with 2 | ⭐ of 3–8, A, J | ⭐4 exchange, ⭐8 absolute scuttle, ⭐J tempo (+U: 7/5 as above). **No ⭐A mimic** (so 10♦ never counters), no ⭐3/⭐6 | **C** | `core-advanced.js:649-663,721-729`; `ranks.js:516-623` |
| 10♦ destination | Exile-Bound → Exile | marked Exile-Bound then moved to **GY** | **C** (E-G13) |
| 10♥ Tempo Spike (+2 MT cap 3; draw 1) | implemented; source → Exile | M | `core-advanced.js:345-358` |
| 10♠ Stack Theft (Interrupt; steal single pending effect; both players +1 FT skip; if countered only thief skips) | implemented as INTERRUPT response; both skips applied at resolution | M (countered-case nuance U) | `core-authority.js:814-830,896-912`; `ranks.js:643-663` |
| 10♠ Exile Recovery (🛠) | implemented; ≤12 Exile targets enumerated | M | `core-advanced.js:360-372,646-648` |
| Royal Shield does not protect Rank-10 | n/a (Royal Shield absent) | — |

### J — Jack (3 pts)
| Mode | AS-WRITTEN (RB:1583-1637) | AS-EXECUTED | Class |
|---|---|---|---|
| Instant Disrupt (record disrupted Action type for rest of FT; draw 1) | implemented; filter in enumerator lets repeat only if no other type legal | M | `core-authority.js:668-680,915-934`; `core-autonomy.js:304-310` |
| ⚓ Jack PR Attachment (control host; +1 pt; Vulnerable target) | implemented (Aegis/Guard via `evaluateProtection` in core-effects) | M | `core-effects.js:79-85,193-214` |
| J♠ ER Attachment (control enemy Anchor) | implemented, J♠ only | M | `core-effects.js:83-85` |
| ⭐J Tempo Force (+2 MT) | implemented | M | `core-advanced.js:203-211` |

### Q — Queen (2 pts PR / 0 ER Anchor)
| Mode | AS-WRITTEN (RB:1638-1753) | AS-EXECUTED | Class |
|---|---|---|---|
| ER Anchor with Guard; protected entry Aegis | implemented | M | `core-effects.js:216-223`; `ranks.js:682-689` |
| Quick Aegis to one friendly OTT (once/FT) | implemented | M | `core-authority.js:728-748` |
| Q♠ special protection vs non-total clears | implemented | M | `interactions.js:36-37` |
| Queen's Court (2 hand Queens, 1 MT, once/FT, only K♠ counters) | implemented | M | `core-advanced.js:129-143,560-562`; `core-authority.js:807` |
| Royal Shield / ⭐A Two-Queen Defense | Two-Queen: M; Royal Shield: **N** | | E-G11 |

### K — King (8 pts; Anchor 7 / K♠ 9)
| Mode | AS-WRITTEN (RB:1754-2003) | AS-EXECUTED | Class |
|---|---|---|---|
| Instant Counter single-card Anchor/Goal-Mod (non-♠) | implemented (Anchor plays; Goal-Mod absent since Goal Shift absent) | M | `core-authority.js:650-666` |
| K♠ Counter Multi-Play (Super/Combo/RM/QC/paired 10♦; not Ultra/SD) | implemented (≥2 sources or classes royal-marriage/queens-court); cannot counter Board Lock | M | `core-authority.js:795-812`; `interactions.js:72-74` |
| K♠ Wild Sovereignty (copy 3♠/4♠/5♠/6♠/7♠ Base; 4♠ costs 1 extra discard; K♠ → Exile always) | implemented; menu = 3-bounce, 4-row-clear, 4♠-total-clear(+discard), 5-recycle, 6♠-deep-draw, 7-topdeck. Since 3♠/5♠/7♠ enhancements are absent, K♠ copies **plain** 3/5/7 Base | M (with inherited N) | `ranks.js:336-380`; `core-autonomy.js:180-231` |
| ⚓ Anchor (7 / K♠ 9) | implemented | M | `core-effects.js:225-231` |
| Royal Marriage (same-suit K+Q; both ER; only K♠ counters) | implemented | M | `core-advanced.js:118-127,556-559` |

### RJ — Red Joker (5 pts; PR Scuttle+Jack immune)
Four modes (Hand Swap / Self Reset +3 / Opponent Attack −2 / Shuffle Reset draw 2) implemented as Action effects, counterable by Ace family. Shuffle-Reset "⭐A only" restriction: **UNVERIFIED** (W2 reports ordinary Ace authority accepted) → flagged C-candidate `RJ-SHUFFLE-COUNTER`. `core-effects.js:94-99,233-283`.

### BJ — Black Joker (11 pts AS-WRITTEN; **0 scoring access AS-EXECUTED**)
| Mode | AS-WRITTEN (RB:2018-2503) | AS-EXECUTED | Class |
|---|---|---|---|
| Score 11 + Exile Recycle trigger; PR Scuttle/Jack immune | **refused** (`CORE_SCORING_RIDER_UNSUPPORTED`); Exile Recycle absent | **N** (E-G5) |
| Quick Board Lock | implemented fully (E-G10) | M |
| Scuttle source (top rank) | offered (BJ outranks everything) | M |

### Sudden Death (RB:657-693) — Unrestricted only
AS-WRITTEN: RJ+BJ or four-of-a-kind multi-card play, Scrap a Vulnerable enemy OTT card, counter 2, ⭐A only. AS-EXECUTED: `sudden-death/declare` is enumerated on **every Action Mini-Turn with zero source cards**, consumes the Mini-Turn, sets `remaining: 3`, performs no Scrap, and **never ticks or wins** (probe: after 12 FTs `remaining` still 3, winner null). → **X IMPLEMENTATION_DEFECT: dead Mini-Turn sink offered to humans and policies in the ranked profile.** `core-advanced.js:521-535,732-733`; `core-autonomy.js:273`; `core-authority.js:1049-1100`; probe output.

### Ultras (RB:518-583)
3 Black (score/cast/exile; score role forbids 7 & BJ; cast limited to public non-private effects), 3 Red (Instant counter with ⭐A authority + GY-bottom draw; Ultra limit; Two-Queen), 2B+2R (+2 MT cap 3; draw 2 or rummage 1 Exile) — **M** with enumeration truncation (E-G15). `core-advanced.js:383-430,666-685`; `core-autonomy.js:371-375`.

### Voltage (RB:695-767)
| | AS-WRITTEN | AS-EXECUTED | Class |
|---|---|---|---|
| ⚡3 Sleight | reveal ≤2, choose one: effect / points / hand | take **top card** only → hand or points (no effect option) | C |
| ⚡4 Predictable | rank right → score/effect; suit right → draw | only rank+suit both right → score; otherwise nothing (52 guess actions) | C |
| ⚡5 Refinement | draw-discard-draw, or GY bottom | discard 1 then draw 1, or GY bottom | C (minor) |
Thresholds 3/4/5 PR points of that rank at Start snapshot: M. `core-advanced.js:432-520,686-702`.

## 1.2 Consolidated conflict/defect ledger (feeds 08_DEGENERACY_LEDGER + 10_BALANCE_FINDINGS)

| ID | Class | Mechanic | Impact on balance analysis |
|---|---|---|---|
| **IMPL-01** | N (fail-closed, documented as "uncertified scoring rider") | 7 / 10♣ / BJ cannot be scored for Points | Removes 7-pt fallback from rank 7 (4 cards), 11-pt primary from BJ, plain 10 from 10♣. Rank 7 and BJ verdicts must be split AS-WRITTEN vs AS-EXECUTED. Manifest lists `special-scoring-riders` as supported → **truth drift** (`config/engine-manifest.json` L702; `test/advanced-continuations.test.mjs:120` only checks the label). |
| **IMPL-02** | X | Sudden Death (Unrestricted) zero-cost dead action | Mini-Turn sink; policy artifact risk; human trap option in ranked profile. |
| **IMPL-03** | X | ⭐6 / ⭐7 enumerated with empty keep/assign sets (Unrestricted) | As offered, both Supers are strictly negative-value; hidden-Super coverage in ranked play is illusory. |
| **IMPL-04** | C | 10♦ Mimic menu: solo = ⭐4 only; "⭐7/⭐5" resolve as Base with no choices; no ⭐A mimic; source to GY not Exile | 10♦ AS-EXECUTED ≈ a 10-pointer with a narrow ⭐4/⭐8/⭐J side-menu; counter-mimic axis absent. |
| **IMPL-05** | N | Goal Shift (all Nines) + 9♠ rider absent | Goal manipulation axis absent; K ordinary counter's Goal-Mod authority is vacuous. |
| **IMPL-06** | N | 2 Quick, Wild Catalyst (2 as Super component) absent | Two loses its two most flexible modes; Super accessibility is lower than written (needs true pairs). |
| **IMPL-07** | N | 5 suit Exile rummage; 3♠ Enhancement; 7♠ reveal-3; 4 Quick Natural; 6 Quick Peek; 3 Instant Bounce; 8 Scuttle Bonus; 7 recursion; generated Super components; BJ Exile Recycle | Suit differentiation collapses for ranks 3, 5, 7; Free-timing utility of 3/4/6 absent. |
| **IMPL-08** | N | Royal Shield | Queen-count declaration protection absent; only Guard/Aegis/Two-Queen remain. |
| **IMPL-09** | C | 10♣ Foundation = Rank-10 effect (limit + Exile-Bound) instead of scoring | 10♣ competes with 10♦/♥/♠ for the one Rank-10 slot. |
| **IMPL-10** | C | End-phase timer order; ⭐3 (1 card, actor-chosen), ⭐5 (mill 4, draw 2), Voltage 3/4 simplifications; 3 present-take takes ≤2 | Minor numeric/ordering deltas; verdicts note them. |
| **IMPL-11** | U | RJ Shuffle Reset counter authority may accept ordinary Ace | Unverified; low balance impact. |
| **IMPL-12** | **C (major)** | Counter authority by stack class: Base Ace / A♠ accept only `stackClass === "ordinary-effect"` primaries (`core-authority.js:258-275`; classes from `core-response.js:26-41` + `core-advanced.js:107-112`). Therefore **solo Rank-10 effects (10♣ Foundation, 10♦ solo Mimic, 10♥ Tempo, 10♠ Exile Recovery) and all Supers are immune to Base Ace and A♠**; K♠ answers only ≥2-source items (`core-authority.js:807`). Solo Rank-10 plays are counterable **only by ⭐A / 3-Red Ultra**. AS-WRITTEN (RB:940,949-956,1480) Rank-10 effects are ordinary effect plays counterable by Aces and Base Ace may counter unprotected multi-card Effects. | Rank 10 (esp. 10♥) and Supers gain large practical counter-immunity AS-EXECUTED. Feeds verdicts for 10♥, 10♠, ⭐2, ⭐4, ⭐8, ⭐J. |
| **IMPL-13** | C | ⭐A (`core-declare-super-ace-counter`, `core-authority.js:778-793`) and 3-Red Ultra accept **any** pending stack item — including single-card Anchor plays, Queen's Court and Royal Marriage, which AS-WRITTEN (RB:958,1749,1954) ⭐A cannot counter. | ⭐A over-broad AS-EXECUTED; Two-Queen Defense is the only limit. Minor impact (⭐A is RARE). |
| **AUTH-04** | Truth drift | `RANK_REGISTRY.modes` advertises 20+ modes with no code path (quick-score-discard, wild-catalyst, spade-enhancement, natural, suit-rummage, swap-bar-peek, scoring-trigger, spade-topdeck, sequential-topdeck(Adv), goal-shift, spade-goal-shift, exile-recycle) and the engine manifest inherits them | Documentation/analytics correction candidate (Change Type 2–3). |

**Consequence for scope:** the AS-EXECUTED game is a strict subset of 4.3.1. All balance verdicts in 09/10 are stated for AS-EXECUTED with an explicit AS-WRITTEN delta where the missing mode would plausibly change the verdict.
