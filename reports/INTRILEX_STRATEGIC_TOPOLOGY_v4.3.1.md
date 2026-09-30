# Intrilex v4.3.1 — Strategic Topology for Veteran Play

**Audience:** experienced Intrilex players (Deffy, Matt, and peers).
**Scope:** two-player Core, `core-advanced-authority` (default) and `core-unrestricted-authority` (ranked). Optional modules and multiplayer are out of scope.
**Authority:** Product 1.0.0 / Engine 4.2.6 / Rules 4.3.1 (`config/release-identity.json`). Canonical rulebook: `docs/INTRILEX_v4.3.1_COMPLETE_PLAYER_RULEBOOK.md`.
**Method:** rules + verified engine behavior + constructed-state probes + an exploratory 348-game current-runtime policy pilot. No human-meta data exists. Statistical results are policy-conditioned and exploratory, not a global ranking.

---

## 0. How to read this article

Three layers of evidence are kept separate throughout:

1. **Mechanical capability** — what the rules and engine *permit*. Sourced to the rulebook and the constructed-state probe (`reports/intrilex-counter-web-mechanical-probes-complete.json`). This is the strongest layer.
2. **Observed policy behavior** — what the implemented heuristic policies (`score-rush`, `tempo`, `control`, `value`, `hybrix-rusher-hard`) actually did in the pilot. Sourced to `reports/article-policy-pilot-completion-20260907T204650571Z/RESULTS.md`. This is exploratory and policy-specific.
3. **Human strategic value** — inference about what a skilled human should value, traced back to mechanics and reachability. Always marked as inference.

Win rate is treated as an *outcome*, not an explanation. When a policy won or lost, the article traces the result to mechanics, action economy, resource conversion, reachability, timing, and interaction structure — not to a bare "X is strong."

---

## 1. The structural diagnosis

**Intrilex is not rock–paper–scissors. It is not a stable four-way cycle. It is a conditional counter-web with local cycles and soft hierarchies.**

The reasons are mechanical, not statistical:

- **Counter relationships are typed by declaration class**, not by generic card strength. A Base Ace answers ordinary effects and Rank-10 effects; K♠ answers Supers, Queen's Court, and Royal Marriage; ⭐A authority is required for Ultras, Sudden Death, and Board Lock; ordinary Kings answer only single-card Anchors or Goal-Mod plays. The same card can be a hard counter in one class and irrelevant in another.
- **Many lines transform into other lines.** K♠ Wild Sovereignty copies Spade Base effects, converting one card into multiple structural operations. 10♦ copies Rank-10 access into Super effects. 7 and ⭐7 generate nested plays from the top of the deck. 2B+2R Ultra converts four cards into extra actions and cards. A "control" hand can become a "tempo" hand mid-turn.
- **Structural effects bypass ordinary protection.** 4♠ Total Clear bypasses Guard, Aegis, Q♠ protection, and ordinary targeting immunity. ⭐4 Row Exchange changes row ownership structurally. These do not participate in the same counter layer as ordinary effects.
- **Protection is itself conditional.** Aegis blocks many effects but not 4♠. Queen Guard blocks hostile single-target effects but not row-wide or structural operations. Queen's Court is answered directly by K♠, not by ordinary Ace authority. Two-Queen Defense blocks ⭐A but only when the defender controls two untapped ER Queens.
- **The value of a line changes with game state.** The same scoring play, the same counter, and the same anchor shift in value depending on current PR total, opponent's score, available response class, DP depth, GY/Exile density, Queen fortress state, Board Lock status, Exhausted state, hand size, and whether the player has already spent a Mini-Turn.

No single directed graph over "archetypes" captures this. The graph is typed (by declaration class), conditional (by game state), and asymmetric (by reachability). Local cycles exist — for example, score-pressure beats slow control, control beats fortress if it lands disruption before the fortress stabilizes, fortress beats score-pressure if it locks the board — but these cycles are conditional on timing and reachability, not universal.

---

## 2. Authority and version ledger

| Surface | Value | Source |
|---|---|---|
| Product version | 1.0.0 | `config/release-identity.json:4` |
| Product name | Intrilex Simulation Lab | `config/release-identity.json:3` |
| Engine version | 4.2.6 | `config/release-identity.json:7` |
| Rules version | 4.3.1 | `config/release-identity.json:8` |
| Official rules | 4.3.1 | `config/release-identity.json:9` |
| Default profile | `core-advanced-authority` | `config/release-identity.json:18` |
| Ranked profile | `core-unrestricted-authority` | `config/release-identity.json:25` |
| Release date | 2026-09-07 | `config/release-identity.json:33` |
| Canonical rulebook | `docs/INTRILEX_v4.3.1_COMPLETE_PLAYER_RULEBOOK.md` | repo |

The rulebook records the v4.1.1 Interrupt clarification, v4.1.2 Pass/Priority clarification, v4.2.0 Queen's Court update, v4.3.0 K♠ Wild Sovereignty, and v4.3.1 BJ Board Lock Quick update.

**Implementation divergence flag (as-executed vs as-written):** A static audit of the current runtime identified that `super-ace` and `ultra-three-red` declarations do not call the target-class validator at declaration time, so in the current engine a Star Ace or 3-Red Ultra can target stack items the rulebook says they cannot (including point plays, draws, and swaps, which the engine places on the stack). The predicate matrix in the probe correctly records `super` as answerable by `base-ace`/`spade-ace`/`king-spade` and *not* by `super-ace`/`ultra-three-red`, but the declaration-time gate is missing. This is an implementation defect, not a strategic fact. The article describes rules-faithful behavior as the primary layer and flags the divergence where it matters for current-runtime play.

---

## 3. Unit definitions

To avoid the common error of treating a card list as a strategy, the following units are distinguished:

- **Physical card:** a single deck card (e.g., the 4♠).
- **Effect:** what a card or play does when declared (e.g., Total Clear, Tap, Dig).
- **Policy:** an implemented heuristic that selects legal actions (e.g., `score-rush`). Policies are not players and not optimal play.
- **Sequence:** a specific ordered set of declarations within a turn (e.g., 10♥ → score → score).
- **Strategic line:** a coherent priority set and sequencing logic (e.g., "score-pressure / race").
- **Archetype:** a cluster of lines sharing a primary axis (e.g., "tempo-compression").
- **Statistical profile:** the observed behavior and outcome pattern of a policy under pilot conditions.

A card list alone does not define a line. Each line below includes priorities, sequencing, resource conversion, response patterns, interaction structure, failure conditions, and pivot logic.

---

## 4. The counter matrix (mechanical, rules-faithful)

The constructed-state probe (`reports/intrilex-counter-web-mechanical-probes-complete.json:1457-1528`) exported the declaration-class counter predicate from the current runtime. This is the *predicate* layer; the declaration-time gate divergence is noted above.

| Declaration class → Counter | Base Ace | A♠ | ⭐A | 3-Red | K♠ |
|---|---|---|---|---|---|
| ordinary-effect | ✓ | ✓ | ✓ | ✓ | ✗ |
| rank10 | ✓ | ✓ | ✓ | ✓ | ✗ |
| super | ✓ | ✓ | ✗ (predicate) | ✗ (predicate) | ✓ |
| ultra | ✗ | ✗ | ✗ (predicate) | ✗ (predicate) | ✗ |
| sudden-death | ✗ | ✗ | ✗ (predicate) | ✗ (predicate) | ✗ |
| anchor | ✗ | ✗ | ✗ | ✗ | ✗ |
| queens-court | ✗ | ✗ | ✗ | ✗ | ✓ |
| royal-marriage | ✗ | ✗ | ✗ | ✗ | ✓ |
| points | ✗ | ✗ | ✗ | ✗ | ✗ |
| scuttle | ✗ | ✗ | ✗ | ✗ | ✗ |

Reading the matrix:

- **Ordinary Kings** answer single-card Anchor or Goal-Mod plays only (not shown in the matrix above; this is a separate declaration path).
- **K♠** is the only standard direct counter to Queen's Court and Royal Marriage. This counter scarcity is strategically central.
- **Ultras and Sudden Death** have no standard counter in the predicate matrix. Rulebook-faithful counter authority for these is ⭐A and 3-Red Ultra; the predicate matrix reflects the current runtime's exported logic, and the declaration-time divergence means ⭐A/3-Red can in practice target them in the current engine.
- **Points and Scuttle** are not counterable by any Ace or King in the predicate layer. (The declaration-time divergence means ⭐A/3-Red can currently target point plays in the engine; rules-faithfully they cannot.)

**Why this matters strategically:** counter access is not symmetric. A player who needs to answer a Queen's Court must hold K♠ or accept the play. A player who needs to answer an Ultra must hold ⭐A-class authority (or, in the current engine, exploit the declaration-time divergence). A player who needs to answer a point play has no direct counter in rules-faithful play — the answer is to score back, to disrupt before the point play lands, or to use structural resets after the fact.

---

## 5. Reachability — why the matrix is not the whole story

Counter capability is worthless without counter *access*. The hypergeometric reachability values from the mechanical interaction inventory (sourced to `reports/balance-check/03_INTERACTION_GRAPH.md`, computed against the 54-card deck) are not win probabilities — they are the probability of *having the card* by a given point:

| Target | Opening 5 | Opening 6 | 10 cards seen | 15 cards seen |
|---|---|---|---|---|
| Specific singleton | 9.3% | 11.1% | — | — |
| At least one of a rank | 33.0% | 38.5% | 57.1% | 74.0% |
| Specific-rank pair | 3.9% | 5.7% | 15.2% | 30.6% |
| Any same-rank pair | 46.2% | 61.9% | 96.8% | — |
| 2B+2R Ultra | 60.1% | 77.3% | 98.4% | — |
| One of {4♠, 2♠, K♠} (Total Clear access) | 25.7% | 30.3% | 46.6% | 63.2% |
| Any Ace or Eight response | 56.7% | 63.7% | 83.0% | 94.1% |

The strategic consequence: **a player commonly has *some* Super recipe but rarely the *exact* pair that answers the current board.** Total Clear access (4♠, 2♠, or K♠ Wild) is only ~30% in the opening hand and ~47% by 10 cards seen. This is why structural resets are high-value but unreliable — you cannot plan a deck around always having 4♠, but you can plan around *when to spend it if you draw it*.

---

## 6. The major strategic lines

Each line is defined by its priority set, sequencing, resource conversion, response patterns, interaction structure, failure conditions, and pivot logic. These are *strategic lines*, not deck archetypes — a single hand can shift between lines mid-game.

### 6.1 Score-pressure / race

**Priorities:** secure high-value points (BJ=11, 10=10, 9=9, 8=8, K=8) as fast as possible; use tempo only when it materially accelerates victory.
**Sequencing:** score on consecutive Mini-Turns; if 10♥ or 2B+2R is available, spend it only when the extra actions convert directly into secured points.
**Resource conversion:** cards → PR points. Minimal hand preservation.
**Response patterns:** counter only what threatens the race (a 4♠, a Board Lock, a Sudden Death on a key PR card); ignore disruption that does not reduce secured points below the Goal.
**Interaction structure:** forces the opponent to answer points rather than build. Opponent must spend responses on a clock they did not choose.
**Failure conditions:** structural reset (4♠, ⭐4) erases the PR lead; Tap/Scuttle removes key cards; Board Lock suppresses non-scoring tools; the opponent scores back faster.
**Pivot:** if the opponent holds a reset, shift to preserving a second wave of scoring cards rather than overcommitting to the first wave.

### 6.2 Tempo-compression

**Priorities:** convert 10♥ (+2 Mini-Turns, capped at 3, then draw 1) and 2B+2R Ultra (+2 Mini-Turns, draw 2 or rummage 1 Exile) into extra actions and cards.
**Sequencing:** accelerator → setup/draw → scoring or disruption within the same Full Turn.
**Resource conversion:** hand cards + accelerator → action economy → secured points or board control.
**Response patterns:** counter the opponent's counter to the accelerator; if the accelerator is spent without terminal conversion, the line fails.
**Interaction structure:** compresses multiple turns of value into one Full Turn. Strong when the opponent cannot answer the acceleration or when extra actions convert directly into secured points.
**Failure conditions:** acceleration spent without a terminal conversion; added hand value stranded; opponent answers the key scoring play that the acceleration was building toward.
**Pivot:** if the accelerator is countered or fizzled, fall back to a value/conversion line rather than forcing a second accelerator.

### 6.3 Control / suppression

**Priorities:** 9 Tap, Jack Disrupt, counters, 4 clears, Queen Anchors, Board Lock, 10♠ Stack Theft.
**Sequencing:** disrupt the opponent's key plays; lock the board; win the long game on accumulated advantage.
**Resource conversion:** cards → denied opponent value → eventual scoring advantage.
**Response patterns:** hold counters for the highest-value opponent plays; use structural resets at peak opponent commitment.
**Interaction structure:** suppresses the opponent's plan rather than executing its own. Strong when the opponent cannot simply score through the disruption.
**Failure conditions:** the opponent scores through the disruption; the control player falls behind in PR and cannot recover; control cards are spent without reducing the opponent's secured points.
**Pivot:** if behind in PR, abandon control and race; if the opponent's hand is empty, shift to hand-attack or direct scoring.

### 6.4 Value / conversion

**Priorities:** preserve flexible cards; use Dig/Recycle/Deep Draw (5, 6, 6♠, ⭐6) to find higher-value conversions; wait for the right window.
**Sequencing:** draw/filter → accumulate flexible resources → convert at peak value.
**Resource conversion:** low-value cards → draw/filter → high-value cards → secured points or board control.
**Response patterns:** hold counters; respond only when the opponent threatens a terminal play.
**Interaction structure:** trades early tempo for late-game card quality and flexibility.
**Failure conditions:** immediate score pressure kills before saved resources convert; the window closes before the value line can deploy.
**Pivot:** if under lethal pressure, convert saved resources into immediate scoring or a structural reset rather than continuing to filter.

### 6.5 Fortress / anchor

**Priorities:** Queen Anchors, Queen's Court, Guard, Aegis (8/Q/10♣ Foundation), protected ER accumulation.
**Sequencing:** establish Queen protection → anchor key cards → accumulate protected ER → win on durability.
**Resource conversion:** Queens + Aegis sources → protected board state → long-term scoring advantage.
**Response patterns:** Two-Queen Defense blocks ⭐A; Guard blocks hostile single-target effects; Aegis blocks many effects.
**Interaction structure:** makes the board expensive to attack. The opponent must find K♠ (for Queen's Court/Royal Marriage), 4♠ (for Total Clear), ⭐4 (for Row Exchange), or ⭐2 (for Commandeer) to breach.
**Failure conditions:** K♠ answers Queen's Court/Royal Marriage; 4♠ bypasses all ordinary protection; ⭐4 exchanges rows; ⭐2 commandeers anchors; the opponent wins before the fortress stabilizes.
**Pivot:** if the opponent holds K♠ or 4♠, do not overcommit to Queen's Court; shift to scoring or tempo.

### 6.6 Reset / structural

**Priorities:** 4♠ Total Clear, K♠ Wild Sovereignty (copying Spade Base effects), ⭐4 Row Exchange, ordinary 4 Row Clear.
**Sequencing:** wait for peak opponent commitment → reset → rebuild.
**Resource conversion:** a single high-value card → full board state change.
**Response patterns:** none directly (structural effects are not counterable by ordinary Ace/King authority); the opponent's answer is to not overcommit.
**Interaction structure:** erases the opponent's board investment. Particularly valuable against high-PR boards, Aegis-heavy states, and Queen fortresses.
**Failure conditions:** the reset erases the user's own progress; the reset is spent at low opponent commitment; the opponent rebuilds faster.
**Pivot:** if the reset would erase more of the user's board than the opponent's, hold it; if behind, use it to equalize rather than to gain advantage.

### 6.7 Late-resource / Exhausted

**Priorities:** Anchors, GY/Exile access (5 Recycle, Exile recovery), non-DP resources.
**Sequencing:** track DP depth → preserve anchor/point capacity → convert non-DP resources as DP empties.
**Resource conversion:** GY/Exile cards → playable cards when DP is empty.
**Response patterns:** anchor lines remain live when Draw is constrained; Recycle and Exile recovery bypass DP.
**Interaction structure:** gains value as DP approaches empty. Can turn a resource deficit into a race around Exhausted tiebreaks.
**Failure conditions:** the opponent wins before Exhausted; the anchor/point capacity is insufficient to close the game.
**Pivot:** if the opponent is racing and DP is not yet empty, do not wait for Exhausted; score or disrupt now.

### 6.8 Niche hand/board attack

**Priorities:** 3 hand raid, force discard, ⭐3 Super Raid, 9 Anchor discard, RJ opponent attack.
**Sequencing:** identify the opponent's key component (Ace, K♠, Queen pair, Ultra ingredient) → attack it → exploit the gap.
**Resource conversion:** attack cards → denied opponent components → exploitable window.
**Response patterns:** none directly; the opponent's answer is to play the component before it is discarded.
**Interaction structure:** denies exact components, not generic value. The strategic job is to prevent a specific play, not to deal "control damage."
**Failure conditions:** the opponent's hand is already small; the attack fails to prevent a meaningful conversion; the attack card is worth more than the denied component.
**Pivot:** if the opponent's hand is empty or the attack misses the key component, do not repeat the attack; shift to scoring or structural play.

---

## 7. How the lines interact

The interaction structure is a typed, conditional counter-web. The major axes are:

1. **Scoring vs. disruption.** Score-pressure forces the opponent to answer points. Control answers plays but does not score. The race wins if disruption cannot keep pace; control wins if it can deny the terminal scoring play.
2. **Tempo vs. resource conservation.** Tempo-compression spends cards for extra actions. Value/conversion preserves cards for higher-value later plays. Tempo wins if the extra actions convert to secured points; value wins if the tempo player strands their hand.
3. **Fortress vs. structural reset.** Fortress makes the board expensive to attack. Reset erases the board. Fortress wins if the opponent lacks K♠/4♠/⭐4; reset wins if it catches the fortress at peak commitment.
4. **Action economy vs. response retention.** Spending an accelerator reduces the hand. Holding a counter preserves the hand. The player who spends first wins if the spend converts to a terminal play; the player who holds wins if the spend fails to convert.
5. **Hand attack vs. exact-component reachability.** Hand attack denies specific components. Its value is not generic "control" — it is the denial of the exact card the opponent needs (an Ace, a K♠, a Queen pair, an Ultra ingredient).
6. **Late-game resource conversion vs. DP exhaustion.** As DP empties, anchor lines and GY/Exile access become more valuable. The player who can convert non-DP resources wins the Exhausted race.

**Local cycles exist but are conditional:**

- Score-pressure → beats slow control (if it scores through disruption) → control beats fortress (if it lands disruption before stabilization) → fortress beats score-pressure (if it locks the board). This is a conditional three-cycle, not a universal one.
- Tempo → beats control (if acceleration converts to points) → value beats tempo (if tempo strands its hand) → tempo beats score-pressure (if acceleration outpaces the race). Another conditional cycle.

**No universal dominance order exists.** The "best" line is multidimensional and state-dependent. A soft hierarchy exists in specific local states — for example, a fortress with two untapped Queens and Aegis on key PR cards is locally dominant against ordinary effects — but no line is globally dominant.

---

## 8. Statistical profiles (exploratory, policy-conditioned)

The 348-game pilot (`reports/article-policy-pilot-completion-20260907T204650571Z/RESULTS.md`) compared five heuristic policies in `core-advanced-authority` only. **These are not human players, not optimized policies, and not a global ranking.** They are exploratory, policy-conditioned results with 16 seed clusters per pairing.

### 8.1 Pairwise results

| A | B | A win % | Wilson95 | Paired bootstrap95 | Holm p |
|---|---|---|---|---|---|
| score-rush | tempo | 56.3% | 39.3–71.8% | 43.8–68.8% | 1.00 |
| score-rush | control | 87.5% | 71.9–95.0% | 75.0–96.9% | 0.00439 |
| score-rush | value | 56.3% | 39.3–71.8% | 50.0–65.6% | 1.00 |
| score-rush | hybrix-rusher-hard | 53.1% | 36.4–69.1% | 40.6–65.6% | 1.00 |
| tempo | control | 87.5% | 71.9–95.0% | 75.0–96.9% | 0.00439 |
| tempo | value | 40.6% | 25.5–57.7% | 28.1–53.1% | 1.00 |
| tempo | hybrix-rusher-hard | 34.4% | 20.4–51.7% | 18.8–50.0% | 1.00 |
| control | value | 18.8% | 8.9–35.3% | 6.3–34.4% | 0.0444 |
| control | hybrix-rusher-hard | 6.3% | 1.7–20.1% | 0.0–15.6% | 0.00122 |
| value | hybrix-rusher-hard | 50.0% | 33.6–66.4% | 34.4–65.6% | 1.00 |

### 8.2 What the numbers say — and what they do not say

**What they say (policy-conditioned, exploratory):**

- The implemented `control` policy performed very poorly against `score-rush`, `tempo`, `value`, and `hybrix-rusher-hard` in this pilot. The Holm-adjusted sign-test p-values for `score-rush` vs `control` (0.00439) and `control` vs `hybrix-rusher-hard` (0.00122) are the only comparisons that survive multiplicity correction.
- `tempo` performed well against `control` (87.5%, Holm p = 0.00439) but poorly against `value` (40.6%) and `hybrix-rusher-hard` (34.4%).
- `score-rush` was close to even against `tempo`, `value`, and `hybrix-rusher-hard`.
- `value` was close to even against `hybrix-rusher-hard`.

**What they do not say:**

- They do not say that "control is weak in Intrilex." They say the implemented `control` policy, under this runtime, against these specific opponents, with 16 seed clusters, lost heavily. The control policy made 1,412 decisions (vs ~830–880 for the others), selected Board Lock 22 times, Queen Aegis 48 times, and Jack Disrupt 32 times — but spent cards and Mini-Turns on disruption without keeping pace in PR. This is a policy-behavior observation, not a strategic-line verdict.
- They do not say that "scoring always beats control in human play." A human control player who times disruption against the terminal scoring play, rather than spending it on early low-value targets, may perform very differently.
- They do not establish a global ranking. No broad, stable three-way cycle was established. The only robust finding is that the implemented control policy underperformed in this specific pilot.

### 8.3 Mirror diagnostics

Mirrors were incomplete (5–6 games per policy, not the planned 16). They are diagnostics, not cross-policy comparisons:

| Policy | Games | P1 wins | P2 wins | Draws | Mean turns |
|---|---|---|---|---|---|
| score-rush | 6 | 4 | 2 | 0 | 4.00 |
| tempo | 6 | 2 | 4 | 0 | 6.33 |
| control | 6 | 3 | 2 | 1 | 46.83 |
| value | 5 | 4 | 1 | 0 | 5.00 |
| hybrix-rusher-hard | 5 | 3 | 2 | 0 | 4.40 |

The `control` mirror mean of 46.83 turns (vs 4–6 for the others) is consistent with the policy spending many turns on disruption without closing. This is a policy-behavior signature, not a strategic-line property.

### 8.4 Pilot integrity

348/348 canonical terminations. Zero capped games. Zero invalid games. Zero errors. Zero rejected commands. Zero compliance violations. 8,788 total policy decisions. 30,012 total commands. Maximum 142 decisions per game (cap 1800). The pilot is clean *as a runtime execution*; its limitation is the policy set and sample size, not the harness.

---

## 9. The Pareto frontier

Across six strategic dimensions — immediate scoring, action economy, disruption, resilience, response retention, and late-game reach — no single line dominates. The frontier is approximately:

| Line | Immediate scoring | Action economy | Disruption | Resilience | Response retention | Late-game reach |
|---|---|---|---|---|---|---|
| Score-pressure | High | Low | Low | Low | Low | Low |
| Tempo-compression | Medium | High | Medium | Low | Low | Medium |
| Control / suppression | Low | Low | High | Low | High | Medium |
| Value / conversion | Medium | Low | Low | Medium | High | Medium |
| Fortress / anchor | Medium | Low | Medium | High | Medium | High |
| Reset / structural | Low | Low | High | Low | Low | Medium |
| Late-resource / Exhausted | Low | Low | Low | Medium | Medium | High |
| Niche hand/board attack | Low | Low | Medium | Low | Low | Low |

No line is high on all six. The frontier is the set of lines that are not dominated on any axis by another line: score-pressure (highest immediate scoring), tempo-compression (highest action economy), control (highest disruption and response retention), fortress (highest resilience and late-game reach), and value (high response retention and resilience). Reset and late-resource are on the frontier for specific axes but are dominated in some dimensions by fortress or control.

**The strategic implication:** line choice is a bet on which dimensions will matter in the current game state. There is no "best line"; there is the line that best matches the current PR total, opponent's score, board state, DP depth, and hand composition.

---

## 10. Niche lines — when and why

Niche lines are not "weak strategies." They are strategies with a specific job, justified only under specific conditions. Each niche line below states its purpose, target, conditions, cost, failure signal, and pivot.

### 10.1 Hand raid (3, ⭐3 Super Raid, 9 Anchor discard, RJ opponent attack)

- **Purpose:** deny the opponent's exact component (Ace, K♠, Queen pair, Ultra ingredient).
- **Target:** a large or overcommitted opponent hand that holds a specific card.
- **Conditions:** the opponent's hand is large (≥5 cards); the denied component is identifiable; the attack card is worth less than the denied play.
- **Cost:** a card and a Mini-Turn that do not directly score.
- **Failure signal:** the opponent's hand is already small, or the attack misses the key component.
- **Pivot:** if the attack misses, do not repeat; shift to scoring or structural play.

### 10.2 Board Lock (BJ Quick)

- **Purpose:** suppress non-counter effects, Scuttle, and Trap for one Full Turn.
- **Target:** an opponent who depends on effects/Scuttle/Trap to answer the board.
- **Conditions:** the opponent's plan relies on effects rather than scoring; the BJ is not needed for its 11-point scoring value; the opponent lacks ⭐A or 3-Red to answer the Board Lock.
- **Cost:** the BJ (11 points) is spent on disruption rather than scoring.
- **Failure signal:** the opponent scores through the lock, or holds ⭐A/3-Red.
- **Pivot:** if the opponent scores through, abandon Board Lock and race; if the opponent holds ⭐A, do not commit BJ to Board Lock.

### 10.3 Sudden Death (RJ+BJ or four-of-a-kind, Unrestricted only)

- **Purpose:** scrap a Vulnerable enemy OTT card and start a 2-turn countdown to GY.
- **Target:** a high-value enemy PR or ER card that is not Aegis-protected (and, rules-faithfully, not Guard-protected).
- **Conditions:** Unrestricted profile; the target is Vulnerable; the opponent cannot answer with ⭐A; the countdown will complete before the opponent can recover.
- **Cost:** RJ+BJ (or four cards of a rank) — a substantial resource investment.
- **Failure signal:** the target has Aegis; the opponent holds ⭐A; the countdown will not complete before the opponent wins.
- **Pivot:** if the target is Aegis-protected, do not commit; if the opponent holds ⭐A, hold Sudden Death for a window after ⭐A is spent.

### 10.4 ⭐4 Row Exchange

- **Purpose:** swap rows with the opponent, taking their PR/ER and giving them yours, plus Aegis on non-Nines.
- **Target:** an opponent with a superior board (high PR, strong ER, Queen fortress).
- **Conditions:** the opponent's board is strictly better; the user's board is expendable; two 4s are available.
- **Cost:** two 4s and the user's current board.
- **Failure signal:** the opponent's board is not better than the user's; the opponent can immediately reset or score back.
- **Pivot:** if the exchange does not clearly improve position, hold the 4s for Total Clear or ordinary Row Clear instead.

### 10.5 10♠ Stack Theft

- **Purpose:** steal the top of the opponent's stack mid-resolution.
- **Target:** a high-value opponent effect or scoring play on the stack.
- **Conditions:** the opponent has committed a valuable card to the stack; the 10♠ is available; the stolen card is worth more than the 10♠.
- **Cost:** the 10♠ (10 points if scored) is spent on theft rather than scoring.
- **Failure signal:** the stack is empty or low-value; the opponent can counter the theft.
- **Pivot:** if the stack is low-value, score the 10♠ instead.

---

## 11. Globally strong, reliable, matchup-dominant, and niche — the distinction

- **Globally strong:** a line that performs well against most opponents in most states. The pilot suggests `score-rush` and `hybrix-rusher-hard` are candidates, but the evidence is exploratory and policy-conditioned. Mechanically, score-pressure is globally strong because it forces the opponent to answer a clock — but it is not universally dominant.
- **Broadly reliable:** a line that rarely loses badly and adapts to many states. `value` is the pilot candidate: close to even against `score-rush`, `hybrix-rusher-hard`, and `tempo`. Mechanically, value/conversion is reliable because it preserves flexibility — but it can lose to immediate pressure.
- **Matchup-dominant:** a line that dominates specific matchups but not others. `tempo` dominated `control` (87.5%) but lost to `value` (40.6%) and `hybrix-rusher-hard` (34.4%). Mechanically, tempo-compression is matchup-dominant when the opponent cannot answer acceleration.
- **Niche:** a line with a specific job under specific conditions. Hand raid, Board Lock, Sudden Death, ⭐4 Row Exchange, and 10♠ Stack Theft are niche. They are not weak; they are conditional.

The distinction matters because a globally strong line is not the same as a matchup-dominant line, and a niche line is not a weak line. The pilot's `control` results illustrate the risk of confusing policy weakness with strategic-line weakness: the control *policy* underperformed, but control as a strategic line — timed disruption, structural resets, board locks — remains mechanically potent when deployed by a player who can identify the terminal play to disrupt.

---

## 12. What a veteran should take away

1. **Do not impose a taxonomy.** Intrilex is not RPS, not a four-way cycle, not a hierarchy. It is a typed, conditional counter-web. Counter access depends on declaration class, game state, and reachability — not on "which archetype beats which."
2. **Track declaration class, not just card strength.** A Base Ace and a ⭐A are different tools. A K♠ and an ordinary King are different tools. Knowing which counter class the opponent holds — and which class your play requires — is more important than knowing "they have an Ace."
3. **Time structural resets at peak opponent commitment.** 4♠, ⭐4, and K♠ Wild are the most powerful single-card plays in the game, but they are reachability-limited (~30% in the opening hand) and opportunity-cost-heavy. Do not waste them on low-commitment boards.
4. **Do not overcommit to Queen's Court without reading K♠.** Queen's Court is answered only by K♠. If the opponent might hold K♠, Queen's Court is a bet, not a guarantee.
5. **Spend acceleration only when it converts to a terminal play.** 10♥ and 2B+2R are powerful but finite. If the extra actions do not secure points or deny the opponent's terminal play, the line fails.
6. **The Exhausted game is a different game.** As DP empties, anchor lines, GY/Exile access, and non-DP resources become the primary value. A player who has spent all their anchors and GY access before Exhausted will lose the late game even with a PR lead.
7. **The pilot's control results are about the policy, not the line.** A human control player who times disruption against the terminal scoring play — rather than spending it on early low-value targets — should perform very differently from the implemented `control` policy.
8. **No current evidence establishes a human metagame.** The pilot is exploratory and policy-conditioned. Human validation, unrestricted-profile comparisons, and larger paired-seed studies are needed before any metagame claim.

---

## 13. Unresolved questions

1. **Human validation.** No human play data exists. The pilot's policy-conditioned results may not reflect human strategic value. A human-vs-human or human-vs-policy study is needed.
2. **Unrestricted-profile comparisons.** The pilot studied `core-advanced-authority` only. Sudden Death, ⭐3/⭐5/⭐6/⭐7, and other Unrestricted-only tools were not tested in paired play.
3. **Adaptation ablation.** The HYBRIX adapter calls `choose` only, not `notifyOutcome`/`recordEnemyAction`. Opponent-learning is not validated. An ablation that enables full adaptation would test whether HYBRIX's memory improves performance.
4. **Larger paired-seed studies.** 16 seed clusters per pairing is exploratory. A 32-seed or 64-seed study would narrow the bootstrap intervals and allow stronger matchup claims.
5. **Exact counter-retention experiments.** How often does a player who holds the right counter class actually use it before it is discarded or stolen? This is a reachability-plus-timing question, not a win-rate question.
6. **Queen fortress breach experiments.** State-injection experiments that place a Queen fortress against various breach tools (K♠, 4♠, ⭐4, ⭐2, Sudden Death) would measure breach probability and cost.
7. **Board Lock and 4♠ state-injection experiments.** Inject Board Lock and 4♠ into controlled states and measure their effect on opponent conversion rates.
8. **10♥ opportunity-cost counterfactuals.** When is spending 10♥ on tempo worse than scoring it for 10 points? A counterfactual study would measure the opportunity cost.
9. **2B+2R hold/fire ablations.** When is holding 2B+2R for a later turn better than firing it immediately? An ablation that forces hold vs fire would test this.
10. **Exhausted-state experiments.** Inject Exhausted states and measure the value of anchor lines, GY/Exile access, and non-DP resources.

---

## 14. Implementation divergences to flag (not strategic evidence)

The static audit identified divergences between the rulebook and the current runtime. These are implementation defects, not strategic facts. They are flagged here so veterans know what the current engine does vs what the rules say:

- **⭐A and 3-Red declaration-time target gate missing.** The predicate matrix correctly restricts these counters, but the declaration path does not call the predicate. In the current engine, ⭐A and 3-Red can target any stack item, including point plays and draws. Rules-faithfully, they cannot.
- **Royal Shield not enforced in Core.** No `royalShieldProtected` flag is set. Base/Anchor Aces can counter Royal Shield-protected ordinary effects as if unprotected.
- **Voltage 4 uses exact rank+suit match and publishes the guess.** The rulebook specifies rank-only and suit-only branches and private recording. The current engine requires both to match and leaks the guess in the public event.
- **Generated Seven / Topdeck Casting truncated.** The current engine supports one generated effect card, no hand components, no Super/Combo, and no physical-Seven recursion. ⭐7 scraps chosen effect cards instead of resolving them.
- **BJ Exile Recycle trigger missing on score.** Scoring BJ gives 11 points with no Exile Recycle follow-up.
- **Seven scoring trigger missing.** Scoring a Seven gives 7 points with no "reveal top 2, take one" trigger.
- **10♣ score Aegis missing.** Only the 10♣ Foundation effect grants Aegis, not the point play.
- **Goal 9 absent from Core.** The legacy `ranks.js` path still resolves `goal-shift-nine`, but the Core effect/autonomy paths do not enumerate it.
- **Natural 4 not implemented.** Listed in `ranks.js` modes and profile exclusions but no resolver or autonomy candidate exists.
- **Sudden Death target check is Aegis-only.** The rulebook's "Vulnerable" should also respect Guard and rank/state immunity; the engine currently checks only Aegis.

These do not change the strategic topology — they change what the current engine *permits* in specific edge cases. A veteran playing on the current runtime should know that ⭐A and 3-Red are broader than the rules intend, and that Voltage 4, generated Seven, and several scoring riders are not rules-faithful.

---

## 15. Confidence summary

| Claim | Evidence tier | Confidence | Type |
|---|---|---|---|
| Intrilex is a conditional counter-web, not RPS or a four-way cycle | A (mechanics + probe) | 0.9 | Inference from mechanical evidence |
| Counter relationships are typed by declaration class | A (rulebook + probe) | 0.95 | Source fact |
| K♠ is the only standard direct counter to Queen's Court and Royal Marriage | A (probe) | 0.95 | Source fact |
| 4♠ Total Clear bypasses Guard, Aegis, Q♠, and ordinary immunity | A (rulebook + engine) | 0.9 | Source fact |
| Score-pressure forces the opponent to answer a clock | B (mechanics + pilot) | 0.8 | Inference |
| The implemented control policy underperformed in the pilot | A (pilot) | 0.95 | Policy-conditioned observation |
| Control as a strategic line is weak | D (pilot only) | 0.3 | Not supported — policy weakness ≠ line weakness |
| Tempo-compression is matchup-dominant against slow control | B (pilot + mechanics) | 0.75 | Inference |
| No human metagame is established | A (no human data) | 1.0 | Source fact |
| ⭐A/3-Red declaration-time gate is missing in the current engine | A (static audit) | 0.85 | Source fact (implementation) |
| Royal Shield is not enforced in Core | A (static audit) | 0.85 | Source fact (implementation) |

---

*Article end. The JSON appendix follows in the companion file `reports/INTRILEX_STRATEGIC_TOPOLOGY_v4.3.1_APPENDIX.json`.*
