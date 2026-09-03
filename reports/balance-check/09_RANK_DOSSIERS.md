# 09 — Complete Fifteen Rank Dossiers

Phase 10 / Artifact 5 · Formatted strictly per `/BALANCE_CHECK_PASS.md` §41 Artifact 5.  
All dossiers cite verified evidence from `01_MECHANICAL_INVENTORY.md` (`01`), `02_EXACT_IDENTITY_MAP.md` (`02`), `03_INTERACTION_GRAPH.md` (`03`), `05_POLICY_AUDIT.md` (`05`), `06_EMPIRICAL_EVIDENCE.md` (`06`), `07_COUNTERFACTUALS.md` (`07`), and `08_DEGENERACY_LEDGER.md` (`08`).

---

# ⦗A⦘ ACE — Counter Authority

## Identity & Physical Availability
4 physical cards: A♣, A♦, A♥, A♠. Rarity: 4/54. Opening hand presence: 33.0% (5 cards) / 38.5% (6 cards).
## Mechanical Equivalence Classes
Two classes (`02`): `A-BASE` (A♣, A♦, A♥ — 3 cards) and `A-SPADE` (A♠ — 1 card).
## Strategic Roles
`COUNTER`, `PROTECTION`, `CONTROL`, `SCORING`.
## Ordinary Scoring Value
4 Secured PR Points. Immunity: Immune to ordinary Scuttle and Jack attachments while in PR (`ranks.js:6, 51`).
## Primary Effects
Purge (🛠): Scrap an Aegised card; if none, bounce one Vulnerable enemy Anchor (`core-effects.js:116-141`).
## Timing Modes
Instant (Base/A♠/⭐A counter), Action (Purge, Anchor, Play-for-Points).
## Defensive / Counter Modes
* Base Counter (Instant): Negates ordinary effect/counter (`ranks.js:254-278`).
* A♠ Exile Counter (Instant): Negates effect, sends sources to Exile; uncounterable by Base Ace (`ranks.js:272`).
* ⭐A Super Counter (Instant, 2 Aces): Counters any play (Ultras, Board Lock, etc.) unless blocked by Two-Queen Defense (`ranks.js:266-270`).
## Anchor / Attachment Modes
Anchor Ace (⚓): Enters ER (0 pts); can be sacrificed as an Instant counter to negate an effect and take one negated source card into hand (`core-authority.js:1019-1024`).
## Suit Differentials
A♠ exiles countered cards and cannot be countered by Base Ace. A♣/♦/♥ are functionally identical except for Ultra color recipes.
## Spades Variant
A♠ is strictly superior to Base Ace as a reactive response.
## Super
⭐A: Requires 2 Aces in hand. Highest counter authority in the game.
## Wild / Mimic / Generated Interactions
Can be mimicked by paired 10♦+2 AS-WRITTEN (excluded AS-EXECUTED, `01` `IMPL-04`).
## Major Cross-Rank Interactions
Answers 4♠ Total Clear, 10♠ Stack Theft, RJ resets. ⭐A answers BJ Board Lock. Counters all non-Super/non-Rank10 effect plays.
## Opportunity Costs
High internal competition: Scoring 4 points forgoes holding a counter; deploying Anchor Ace forgoes hand flexibility.
## Accessibility & Reachability
COMMON. ≥1 Ace held in 33–38% of openers, 57.1% by 10 cards seen (`03` §3.1).
## Latent / Threat Value
VERY HIGH. Merely holding 1 unknown card deters high-commitment opponent plays.
## Counterplay
Counter-counters (another Ace or 3-Red Ultra). Two-Queen Defense prevents ⭐A.
## Strong States
Opponent attempts multi-card or high-cost effect; player holds board lead.
## Weak States
Opponent plays pure points or Scuttle (Aces cannot counter scoring or Scuttle).
## Mechanical Power
High. The fundamental reactive anchor of the game.
## Policy-Realized Power
High (A-base 29/38 conversion; A♠ 14/17; ⭐A 14/23 in `06` §6.4), but depressed by lack of retention modeling.
## Human-Realizable Power
`INFERRED`: Extremely high. Skilled humans retain Aces for high-leverage threats rather than minor bounces.
## Empirical Evidence
`mechanicCounts`: A-base 29, A♠ 14, ⭐A 14, Anchor Ace 13 (`06`).
## Decision Quality
EXCELLENT. Constant strategic tension between 4 points, anchor value, and defensive retention.
## Degeneracy / Exploit Review
Legal, healthy. Checked and verified in `08` `REJ-02`.
## Contradictory Evidence
Counters do not stop ordinary scoring or Scuttle.
## Verdict
**STRONG BUT HEALTHY**
## Evidence Grade
**A**
## Confidence
**VERY_HIGH**

---

# ⦗2⦘ TWO — Wild Catalyst

## Identity & Physical Availability
4 physical cards: 2♣, 2♦, 2♥, 2♠. 4/54. Opening hand presence: 33.0% / 38.5%.
## Mechanical Equivalence Classes
Two classes (`02`): `2-BASE` (2♣, 2♦, 2♥ — 3 cards) and `2-SPADE` (2♠ — 1 card).
## Strategic Roles
`WILDCARD`, `CONTROL`, `SETUP`.
## Ordinary Scoring Value
2 Secured PR Points. No PR immunities.
## Primary Effects
Solo Wild Copy (🛠): Copies Base effect of rank 3–7 (`ranks.js:237-247, 302-335`).
## Timing Modes
Action (Solo Wild, ⭐2 Commandeer, Scoring, Scuttle). AS-WRITTEN 2 Quick is unimplemented (`01` `IMPL-06`).
## Defensive / Counter Modes
None.
## Anchor / Attachment Modes
None natively. Can commandeer opponent Anchors via ⭐2.
## Suit Differentials
2♠ can copy 4♠ Total Clear and 6♠ Deep Draw. 2♣/♦/♥ copy 3-Bounce, 4-Row Clear, 5-Recycle, 7-Topdeck.
## Spades Variant
2♠ has massive incremental power: it is a functional second copy of 4♠ Total Clear (`02`).
## Super
⭐2 Commandeer: Steal an enemy OTT card, bypassing Guard and rank immunity (respects Aegis). Hold mode taps it until next Start (`core-advanced.js:145-168`).
## Wild / Mimic / Generated Interactions
Enables 10♦ paired Mimic (`core-advanced.js:653-662`). Wild Catalyst for same-suit Supers is unimplemented AS-EXECUTED (`01`).
## Major Cross-Rank Interactions
Pairs with 10♦ to unleash ⭐8 and ⭐J. 2♠ accesses 4♠ board wipe.
## Opportunity Costs
Low scoring fallback (2 pts) means Twos are almost always preserved for effects or recipes.
## Accessibility & Reachability
COMMON for generic Two; RARE for 2♠ singleton (9.3–11.1%). True pair for ⭐2: 3.9–5.7%.
## Latent / Threat Value
Moderate. 2♠ represents a hidden Total Clear threat.
## Counterplay
Aces counter Solo Wild copies. K♠ counters ⭐2. Aegis blocks ⭐2.
## Strong States
Enemy controls a massive Anchor or high-value PR card (⭐2); opponent commits full board (2♠ into 4♠).
## Weak States
Empty enemy board; early game point race.
## Mechanical Power
Moderate for 2-BASE; Very High for 2♠.
## Policy-Realized Power
Artificially suppressed in heuristic policies (`05` §5.2: Solo Wild scored at base 100 default).
## Human-Realizable Power
`INFERRED`: High. Humans leverage 2♠ as a wipe and pair Twos with 10♦ strategically.
## Empirical Evidence
⭐2 Hold: 9/11 conversion (`06`). Solo Wild: 16 executions.
## Decision Quality
HEALTHY.
## Degeneracy / Exploit Review
Legal, healthy. ⭐2 respects Aegis (`08`).
## Contradictory Evidence
2 points is a terrible score; holding Twos without targets clogs hand.
## Verdict
**NICHE BUT HEALTHY** (with `2♠ WATCHLIST`)
## Evidence Grade
**B**
## Confidence
**HIGH**

---

# ⦗3⦘ THREE — Hand Raid / Bounce

## Identity & Physical Availability
4 physical cards: 3♣, 3♦, 3♥, 3♠. 4/54. Opening hand presence: 33.0% / 38.5%.
## Mechanical Equivalence Classes
Single class AS-EXECUTED (`02`): `3-BASE` (4 cards). (3♠ Enhancement unimplemented, `01`).
## Strategic Roles
`DENIAL`, `TEMPO`, `SCORING`.
## Ordinary Scoring Value
3 Secured PR Points. No PR immunities.
## Primary Effects
Choose One (🛠):
1. Hand Raid (present-take): Opponent presents ≤3, caster takes ≤2 (`core-private-choice.js:193-219`).
2. Force Discard: Opponent discards ≤2.
3. Bounce: Return Vulnerable OTT card to top of DP (`core-effects.js:56-59`).
## Timing Modes
Action. Instant Bounce is unimplemented AS-EXECUTED (`01`).
## Defensive / Counter Modes
None.
## Anchor / Attachment Modes
None.
## Suit Differentials
None implemented AS-EXECUTED.
## Spades Variant
3♠ is identical to 3♣/♦/♥ AS-EXECUTED.
## Super
⭐3 Super Raid: Steals 1 opponent hand card (Unrestricted only, `core-advanced.js:213-230`).
## Wild / Mimic / Generated Interactions
Eligible for Solo Wild copy.
## Major Cross-Rank Interactions
Triggers Voltage 3 threshold (≥3 PR points of Threes). Bounces enemy Anchors.
## Opportunity Costs
Low points (3 pts); hand raid reduces opponent options at cost of 1 Mini-Turn.
## Accessibility & Reachability
COMMON.
## Latent / Threat Value
Low.
## Counterplay
Guard blocks single-target bounce. Aces counter all modes.
## Strong States
Opponent has small, high-value hand; opponent deployed unprotected Queen/King.
## Weak States
Opponent hand empty; enemy board protected by Aegis/Guard.
## Mechanical Power
Moderate.
## Policy-Realized Power
Moderate (3-Bounce: 31 executions, Hand-Raid: 12 executions in `06`).
## Human-Realizable Power
`INFERRED`: Moderate. Tactical hand disruption.
## Empirical Evidence
43 total activations in corpus (`06`).
## Decision Quality
HEALTHY.
## Degeneracy / Exploit Review
Legal, healthy (`08`).
## Contradictory Evidence
Low impact against wide boards.
## Verdict
**HEALTHY**
## Evidence Grade
**B**
## Confidence
**HIGH**

---

# ⦗4⦘ FOUR — Clears / Exchanges

## Identity & Physical Availability
4 physical cards: 4♣, 4♦, 4♥, 4♠. 4/54.
## Mechanical Equivalence Classes
Two classes (`02`): `4-BASE` (4♣, 4♦, 4♥ — 3 cards) and `4-SPADE` (4♠ — 1 card).
## Strategic Roles
`BOARD_RESET`, `SCORING`, `PROTECTION`.
## Ordinary Scoring Value
4 Secured PR Points. PR Immunity: **Immune to Effect targeting** while in PR (`ranks.js:9`).
## Primary Effects
* 4-BASE (🛠): Row Clear — Clear all enemy PR cards OR all enemy ER Anchors (`ranks.js:139-161`).
* 4♠ (🛠): Total Clear — Clear all OTT cards across all players. Hard bypass of Guard, Aegis, Q♠ (`ranks.js:382-391`).
## Timing Modes
Action. Quick Natural unimplemented (`01`).
## Defensive / Counter Modes
None.
## Anchor / Attachment Modes
None.
## Suit Differentials
4♠ is Total Clear; 4♣/♦/♥ are Row Clear.
## Spades Variant
4♠ is the premier board wipe in Intrilex (`02`).
## Super
⭐4 Row Exchange: Swap your PR with opponent PR, or ER with opponent ER. Exchanged cards gain Aegis until next Start (`core-advanced.js:170-188`).
## Wild / Mimic / Generated Interactions
4♠ can be copied by 2♠ (Solo Wild) and K♠ (Wild Sovereignty + 1 discard). ⭐4 can be mimicked solo by 10♦ (`01`).
## Major Cross-Rank Interactions
Triggers Voltage 4. 4♠ resets Queen fortresses. ⭐4 provides comeback PR swing.
## Opportunity Costs
Row Clear spares Aegis; 4♠ wipes your own board too.
## Accessibility & Reachability
4-BASE is COMMON. 4♠ singleton is RARE (9.3–11.1%), but Total Clear concept has **63.2% reachability by 15 cards seen** across 4♠/2♠/K♠ (`03` §3.1).
## Latent / Threat Value
HIGH. Fear of Row Clear or Total Clear forces opponents to stagger commitments.
## Counterplay
Aces counter 4 Row Clear and 4♠ Total Clear (both are single-card effects). K♠ counters ⭐4.
## Strong States
Opponent has extensive PR points or ER anchor fortresses.
## Weak States
Early empty board.
## Mechanical Power
Very High (especially 4♠).
## Policy-Realized Power
Moderate (Row Clear: 11, Total Clear: 16 in `06`).
## Human-Realizable Power
`INFERRED`: Extremely High. Total Clear timing defines competitive pacing.
## Empirical Evidence
16 Total Clear executions out of 123 opportunities (`06`).
## Decision Quality
EXCELLENT.
## Degeneracy / Exploit Review
Legal, healthy (`08` `REJ-12`). ⭐4 Aegis prevents instant double-swap.
## Contradictory Evidence
Aces counter Total Clear cleanly; self-wipe limits snowball usage.
## Verdict
**HEALTHY** (with `4♠ WATCHLIST`)
## Evidence Grade
**A**
## Confidence
**VERY_HIGH**

---

# ⦗5⦘ FIVE — Recycle / Rummage

## Identity & Physical Availability
4 physical cards: 5♣, 5♦, 5♥, 5♠. 4/54.
## Mechanical Equivalence Classes
Single class AS-EXECUTED (`02`): `5-BASE` (4 cards). (Suit rummage windows unimplemented, `01`).
## Strategic Roles
`RECOVERY`, `RECURSION`, `SCORING`.
## Ordinary Scoring Value
5 Secured PR Points. PR Immunity: **Scuttle Immune** (`ranks.js:10`).
## Primary Effects
Recycle (🛠): Mill 2 from DP → GY, rummage 1 from GY to hand (revealed), draw bottom GY card (`ranks.js:403-424`). Net +1 card.
## Timing Modes
Action.
## Defensive / Counter Modes
None.
## Anchor / Attachment Modes
None.
## Suit Differentials
None AS-EXECUTED (`01` `IMPL-07`).
## Spades Variant
5♠ has no executable delta.
## Super
⭐5 Super Recycle: Mill 4, draw 2 bottom GY (Unrestricted only, `core-advanced.js:232-259`).
## Wild / Mimic / Generated Interactions
Copied by 2 (Solo Wild) and K♠ (Wild Sovereignty).
## Major Cross-Rank Interactions
Triggers Voltage 5 (GY bottom draw or refine).
## Opportunity Costs
Scoring 5 points provides un-scuttleable PR value vs. digging for resources.
## Accessibility & Reachability
COMMON.
## Latent / Threat Value
Low.
## Counterplay
Aces counter Recycle.
## Strong States
Rich Graveyard; card advantage war.
## Weak States
Empty Graveyard; early game.
## Mechanical Power
Moderate. Solid value engine.
## Policy-Realized Power
Moderate (Recycle: 11 executions in `06`).
## Human-Realizable Power
`INFERRED`: Moderate-High.
## Empirical Evidence
11 executions in corpus (`06`).
## Decision Quality
HEALTHY.
## Degeneracy / Exploit Review
Legal, healthy (`08` `REJ-04`). Source moves to GY after rummage, preventing infinite self-loop.
## Contradictory Evidence
Milling can accidentally discard key singletons.
## Verdict
**HEALTHY AS-EXECUTED** (Suit differentiation blocked by `IMPL-07`)
## Evidence Grade
**B**
## Confidence
**HIGH**

---

# ⦗6⦘ SIX — Deep Dig

## Identity & Physical Availability
4 physical cards: 6♣, 6♦, 6♥, 6♠. 4/54.
## Mechanical Equivalence Classes
Two classes (`02`): `6-BASE` (6♣, 6♦, 6♥ — 3 cards) and `6-SPADE` (6♠ — 1 card).
## Strategic Roles
`RESOURCE`, `SELECTION`, `SCORING`.
## Ordinary Scoring Value
6 Secured PR Points. No PR immunities.
## Primary Effects
* 6-BASE (🛠): Dig — Draw 3, keep 2 (return 1 to DP) OR keep 3 (discard 1) (`core-private-choice.js:250-279`). Net +1 card.
* 6♠ (🛠): Deep Draw — Discard 1–2 cards, draw 6, keep 3–4 (`ranks.js:426-450`).
## Timing Modes
Action. Quick Swap Bar Peek unimplemented (`01`).
## Defensive / Counter Modes
None.
## Anchor / Attachment Modes
None.
## Suit Differentials
6♠ provides Deep Draw (6-card lookahead); 6♣/♦/♥ provide 3-card Dig.
## Spades Variant
6♠ is the strongest card-sculpting engine in the game.
## Super
⭐6 Super Dig: Enumerated defective with empty keep list in Unrestricted (`01` `IMPL-03`).
## Wild / Mimic / Generated Interactions
6♠ Deep Draw can be copied by 2♠ (Solo Wild) and K♠ (Wild Sovereignty).
## Major Cross-Rank Interactions
Filters hand for Ultras, Supers, and Total Clear pieces.
## Opportunity Costs
6 points is a substantial score (28.6% of goal).
## Accessibility & Reachability
6-BASE is COMMON; 6♠ singleton is RARE (9.3–11.1%).
## Latent / Threat Value
Low.
## Counterplay
Aces counter Dig and Deep Draw.
## Strong States
Looking for specific answers or lethal combos.
## Weak States
Hand empty (6♠ requires other hand cards).
## Mechanical Power
Moderate for 6-BASE; High for 6♠.
## Policy-Realized Power
High (Dig: 37 executions; Deep Draw: 1 execution in `06`).
## Human-Realizable Power
`INFERRED`: Very High for 6♠.
## Empirical Evidence
38 executions in corpus (`06`).
## Decision Quality
HEALTHY.
## Degeneracy / Exploit Review
Legal, healthy (`08`).
## Contradictory Evidence
Discard cost on 6♠ prevents runaway card advantage.
## Verdict
**HEALTHY**
## Evidence Grade
**B**
## Confidence
**HIGH**

---

# ⦗7⦘ SEVEN — Topdeck Casting

## Identity & Physical Availability
4 physical cards: 7♣, 7♦, 7♥, 7♠. 4/54.
## Mechanical Equivalence Classes
Single class AS-EXECUTED (`02`): `7-BASE` (4 cards). (7♠ reveal-3 unimplemented, `01`).
## Strategic Roles
`GENERATION`, `TEMPO`, `ENGINE`.
## Ordinary Scoring Value
**0 Points AS-EXECUTED** (Blocked by `CORE_SCORING_RIDER_UNSUPPORTED`, `01` `IMPL-01`). AS-WRITTEN: 7 Points.
## Primary Effects
Topdeck Casting (🛠): Reveal top 2 DP cards; assign 1 to hand (revealed) and 1 as generated effect or score (`core-private-choice.js:280-307`).
## Timing Modes
Action.
## Defensive / Counter Modes
None.
## Anchor / Attachment Modes
None.
## Suit Differentials
None implemented AS-EXECUTED.
## Spades Variant
7♠ has no executable delta.
## Super
⭐7: Unrestricted only; enumerated defective (`01` `IMPL-03`).
## Wild / Mimic / Generated Interactions
Generated plays can score or cast a Core effect. Recursion is unimplemented (`01`). Copied by 2 and K♠.
## Major Cross-Rank Interactions
Generated card can be 4♠, 10♥, Queen, etc.
## Opportunity Costs
No scoring fallback exists AS-EXECUTED; must be played for Topdeck.
## Accessibility & Reachability
COMMON.
## Latent / Threat Value
Low.
## Counterplay
Aces counter the initial Topdeck play; generated child effects create their own response window.
## Strong States
DP is rich and un-depleted.
## Weak States
DP near empty; player needs direct PR points to win.
## Mechanical Power
Artificially crippled AS-EXECUTED by missing scoring fallback and missing recursion.
## Policy-Realized Power
Very Low (30 executions / 736 opportunities = 4.1% in `06`).
## Human-Realizable Power
`INFERRED`: High AS-WRITTEN; crippled AS-EXECUTED.
## Empirical Evidence
30 executions (`06`).
## Decision Quality
SHALLOW AS-EXECUTED (only one playable mode).
## Degeneracy / Exploit Review
Recursion investigated and rejected (`08` `REJ-01`).
## Contradictory Evidence
High unpredictability of topdeck cards.
## Verdict
**BLOCKED BY CORRECTNESS DEFECT** (`IMPL-01`)
## Evidence Grade
**X**
## Confidence
**HIGH**

---

# ⦗8⦘ EIGHT — Aegis Engine / Scuttle Control

## Identity & Physical Availability
4 physical cards: 8♣, 8♦, 8♥, 8♠. 4/54.
## Mechanical Equivalence Classes
Two classes (`02`): `8-BASE` (8♣, 8♦, 8♥ — 3 cards) and `8-SPADE` (8♠ — 1 card).
## Strategic Roles
`PROTECTION`, `COUNTER`, `REMOVAL`, `SCORING`.
## Ordinary Scoring Value
8 Secured PR Points. PR Immunity: **Immune to Effect targeting** (`ranks.js:13`). Still Scuttleable.
## Primary Effects
None (Utility rank).
## Timing Modes
Quick (Aegis Field), Instant (Scuttle Counter, 8♠ Free Scuttle), Action (⭐8, Scoring, Scuttle).
## Defensive / Counter Modes
* Aegis Field (Quick, Free): Grants Aegis to all friendly OTT cards until next Start (`core-authority.js:714-726`).
* Scuttle Counter (Instant): Negates a pending Scuttle attempt (`core-authority.js:634-648`).
## Anchor / Attachment Modes
None.
## Suit Differentials
8♠ provides Free Scuttle without spending a Mini-Turn. 8♣/♦/♥ provide standard Scuttle.
## Spades Variant
8♠ is the premier zero-cost tactical removal card in Intrilex.
## Super
⭐8 Absolute Scuttle: Scuttle any enemy PR card, ignoring rank, suit, and Scuttle immunity (stopped by Aegis) (`core-advanced.js:190-201`).
## Wild / Mimic / Generated Interactions
⭐8 can be mimicked by paired 10♦+2 (`core-advanced.js:660-662`).
## Major Cross-Rank Interactions
Aegis Field protects PR points from 4 Row Clear, J Attachments, and 9 Tap. Scuttle bonus is unimplemented (`01`).
## Opportunity Costs
HIGH. Scoring 8 points (38% of goal) permanently sacrifices Aegis Field and Scuttle defense.
## Accessibility & Reachability
8-BASE is COMMON; 8♠ is RARE (9.3–11.1%).
## Latent / Threat Value
HIGH. Holding an Eight protects PR cards from opponent Scuttles by threat alone.
## Counterplay
Aces cannot counter 8 Quick Aegis Field (Quick play). K♠ counters ⭐8.
## Strong States
Player has built a large PR and needs to lock in points before End Phase.
## Weak States
Player is far behind and needs board-clearing effects.
## Mechanical Power
Very High.
## Policy-Realized Power
High (8 Quick: 76, 8♠ Free: 24, Scuttle Counter: 5 in `06`).
## Human-Realizable Power
`INFERRED`: Extremely High. Dual timing and protection.
## Empirical Evidence
105 total activations across modes in corpus (`06`).
## Decision Quality
EXCELLENT.
## Degeneracy / Exploit Review
Legal, healthy (`08`).
## Contradictory Evidence
8-Quick does not protect Nines (Nines can never gain Aegis).
## Verdict
**STRONG BUT HEALTHY** (with `8♠ WATCHLIST`)
## Evidence Grade
**A**
## Confidence
**VERY_HIGH**

---

# ⦗9⦘ NINE — Tap / Goal Warfare

## Identity & Physical Availability
4 physical cards: 9♣, 9♦, 9♥, 9♠. 4/54.
## Mechanical Equivalence Classes
Single class AS-EXECUTED (`02`): `9-BASE` (4 cards). (Goal Shift unimplemented in Core, `01` `IMPL-05`).
## Strategic Roles
`DENIAL`, `SCORING`, `CONTROL`.
## Ordinary Scoring Value
9 Secured PR Points. **Special: Nines can never receive Aegis** (`ranks.js:14, lifecycle.js:32-34`).
## Primary Effects
None (Instant / Anchor rank).
## Timing Modes
Instant (Tap), Action (Anchor, Scoring, Scuttle). Goal Shift is unoffered in Core (`01`).
## Defensive / Counter Modes
None.
## Anchor / Attachment Modes
Nine Anchor (⚓): Place in ER; opponent reveals hand and discards 1 card. Only 1 active Nine Anchor allowed (`core-private-choice.js:309-338`).
## Suit Differentials
None AS-EXECUTED.
## Spades Variant
9♠ has no executable delta in Core.
## Super
None defined.
## Wild / Mimic / Generated Interactions
None.
## Major Cross-Rank Interactions
Tap (Instant): Taps an enemy PR card (points reduced to 0 until that player scores) (`core-authority.js:683-698`). Tapped cards release upon scoring.
## Opportunity Costs
Scoring 9 points (42.9% of goal) is enormous, but Nines can never gain Aegis, leaving them vulnerable to Scuttle and clears.
## Accessibility & Reachability
COMMON.
## Latent / Threat Value
Moderate (threat of Instant Tap during opponent turn).
## Counterplay
Guard blocks Tap. Aces counter Tap and Nine Anchor. Scoring any card untaps tapped cards.
## Strong States
Opponent relies on 1 or 2 high PR cards to reach 21.
## Weak States
Opponent has wide multi-card PR.
## Mechanical Power
Moderate-High AS-EXECUTED (High AS-WRITTEN with Goal Shift).
## Policy-Realized Power
High (Tap: 80 activations; Nine Anchor: 6 activations in `06`).
## Human-Realizable Power
`INFERRED`: High.
## Empirical Evidence
86 total activations (`06`).
## Decision Quality
HEALTHY.
## Degeneracy / Exploit Review
Negative Goal exploit rejected (`08` `REJ-09`).
## Contradictory Evidence
Vulnerability to Scuttle balances the 9-point PR value.
## Verdict
**HEALTHY AS-EXECUTED** (Goal Shift blocked by `IMPL-05`)
## Evidence Grade
**B**
## Confidence
**HIGH**

---

# ⦗10⦘ TEN — Exile-Grade Spike

## Identity & Physical Availability
4 physical cards: 10♣, 10♦, 10♥, 10♠. Rarity: 1 of each (4 singletons).
## Mechanical Equivalence Classes
Four distinct classes (`02`): `10-CLUB`, `10-DIAMOND`, `10-HEART`, `10-SPADE`.
## Strategic Roles
* 10♣: `SCORING`, `PROTECTION`.
* 10♦: `WILDCARD`, `FLEXIBILITY`.
* 10♥: `TEMPO`, `RESOURCE`.
* 10♠: `CONTROL`, `RECOVERY`.
## Ordinary Scoring Value
10 Secured PR Points for 10♦, 10♥, 10♠. 10♣ can only be scored via Foundation effect (`01` `IMPL-01/09`).
## Primary Effects
Each suit has a unique, non-overlapping effect:
* 10♣ Foundation: Enters PR with Aegis; if points were 0, scores a bonus hand card (`core-advanced.js:322-343`).
* 10♦ Mimic: Solo mimics ⭐4; paired with 2 mimics ⭐4, ⭐8, ⭐J (`core-advanced.js:649-663`).
* 10♥ Tempo Spike: +2 Mini-Turns, draw 1 (`core-advanced.js:345-358`).
* 10♠ Stack Theft / Recovery: Steal single effect play (both skip FT) OR recover 1 Exile card (`core-advanced.js:360-372; ranks.js:643-663`).
## Timing Modes
Action (all); Interrupt (10♠ Stack Theft).
## Defensive / Counter Modes
10♠ Stack Theft acts as an aggressive disruption response.
## Anchor / Attachment Modes
None.
## Suit Differentials
Maximal. No shared rank text exists across Tens.
## Spades Variant
10♠ is Stack Theft and Exile Recovery.
## Super
None defined.
## Wild / Mimic / Generated Interactions
10♦ is the Mimic engine. All Tens become Exile-Bound upon effect resolution (`ranks.js:543`).
## Major Cross-Rank Interactions
10♣ enables Turn-1 kill with BJ (`06`, `07`). 10♦ pairs with any Two. 10♥ stacks with 2B2R up to 3 MT cap.
## Opportunity Costs
Maximal: Consumes the shared 1-per-FT Rank-10 limit. Playing 10♥/♠ for effect forgoes 10 PR points and Exiles the card.
## Accessibility & Reachability
Each card is a singleton: RARE (9.3–11.1% opening hand).
## Latent / Threat Value
HIGH for 10♠ (threat of Stack Theft suppresses opponent effect plays).
## Counterplay
**NARROW AS-EXECUTED (`IMPL-12`): Immune to Base Ace and A♠!** Only ⭐A or 3-Red Ultra can counter them.
## Strong States
10♣: empty PR; 10♥: hand full of scoring cards; 10♠: opponent declares big effect.
## Weak States
Opponent has counter advantage; 10♠ when Exile is empty.
## Mechanical Power
Extremely High across all 4 cards.
## Policy-Realized Power
Very High (Foundation: 39, Tempo: 29, Theft: 11, Recovery: 8 in `06`).
## Human-Realizable Power
`INFERRED`: Extremely High.
## Empirical Evidence
87 total activations across Tens in corpus (`06`).
## Decision Quality
EXCELLENT.
## Degeneracy / Exploit Review
Turn-1 kill (`08` `DEG-03`, `07` `CF-01`). Stack theft skips are symmetric (`REJ-07`).
## Verdict
* 10♣: **WATCHLIST**
* 10♦: **INSUFFICIENT / BLOCKED** (`IMPL-04`)
* 10♥: **WATCHLIST** (Strong but healthy, counterplay narrowed by `IMPL-12`)
* 10♠: **NICHE BUT HEALTHY**
## Evidence Grade
**A**
## Confidence
**VERY_HIGH**

---

# ⦗J⦘ JACK — Disrupt / Attach

## Identity & Physical Availability
4 physical cards: J♣, J♦, J♥, J♠. 4/54. Scuttle rank: 11.
## Mechanical Equivalence Classes
Two classes (`02`): `J-BASE` (J♣, J♦, J♥ — 3 cards) and `J-SPADE` (J♠ — 1 card).
## Strategic Roles
`CONTROL`, `DENIAL`, `TEMPO`.
## Ordinary Scoring Value
3 Secured PR Points.
## Primary Effects
* J (⚓ Attachment): Jack PR — Attach to enemy PR card; gain control and +1 point (`core-effects.js:193-214`).
* J♠ (⚓ Attachment): Jack ER — Attach to enemy Anchor (Queens, Kings, etc.); gain control (`core-effects.js:83-85`).
* J (Instant): Disrupt — Respond to Action declaration; draw 1; restrict actor from repeating that Action type (`core-authority.js:915-934`).
## Timing Modes
Instant (Disrupt), Action (Attachment, ⭐J, Scoring, Scuttle).
## Defensive / Counter Modes
Disrupt disrupts action economy.
## Anchor / Attachment Modes
Attachments must revalidate; severed Jacks go to GY (`interactions.js:122-145`).
## Suit Differentials
J♠ can attach to ER Anchors; J♣/♦/♥ attach to PR cards only.
## Spades Variant
J♠ steals Queens (and their Guard) or Kings.
## Super
⭐J Tempo Force: +2 Mini-Turns (cap 3) (`core-advanced.js:203-211`).
## Wild / Mimic / Generated Interactions
⭐J can be mimicked by paired 10♦+2 (`core-advanced.js:662`).
## Major Cross-Rank Interactions
Scuttle rank 11 allows Jacks to scuttle 10s, 9s, 8s, 7s, 6s, 5s, 4s, 3s, 2s. Severance triggers on 4 Row Clear.
## Opportunity Costs
3 PR points is low; Jacks are almost always spent on Disrupt, Attachment, or Scuttle.
## Accessibility & Reachability
COMMON for J-BASE; RARE for J♠ (9.3–11.1%).
## Latent / Threat Value
High (Scuttle threat due to high rank 11).
## Counterplay
Aces counter Disrupt and Attachment. Guard blocks PR attachment. Aegis blocks attachment.
## Strong States
Enemy has high-value PR card (e.g. 10 or 9) without Guard/Aegis; enemy ER has Queen.
## Weak States
Enemy board protected by Guard/Aegis.
## Mechanical Power
High. Exceptional utility.
## Policy-Realized Power
High (Disrupt: 160 executions in `06`).
## Human-Realizable Power
`INFERRED`: Very High.
## Empirical Evidence
160 Disrupt activations (`06`).
## Decision Quality
HEALTHY.
## Degeneracy / Exploit Review
Attachment exploit checked and rejected (`08` `REJ-06`).
## Contradictory Evidence
Vulnerability to severance when host leaves row.
## Verdict
**HEALTHY**
## Evidence Grade
**A**
## Confidence
**VERY_HIGH**

---

# ⦗Q⦘ QUEEN — Protection Engine

## Identity & Physical Availability
4 physical cards: Q♣, Q♦, Q♥, Q♠. 4/54. Scuttle rank: 12.
## Mechanical Equivalence Classes
Two classes (`02`): `Q-BASE` (Q♣, Q♦, Q♥ — 3 cards) and `Q-SPADE` (Q♠ — 1 card).
## Strategic Roles
`PROTECTION`, `SETUP`.
## Ordinary Scoring Value
2 Secured PR Points. (ER Anchor value: 0).
## Primary Effects
Queen in ER provides **Guard** (protects other friendly OTT cards from enemy single-target effects) while untapped (`interactions.js:14-33`).
## Timing Modes
Quick (Aegis to 1 friendly card, once/FT), Action (Anchor, Queen's Court, Scoring, Scuttle).
## Defensive / Counter Modes
Two untapped Queens establish the **Two-Queen Defense**, preventing opponent from declaring ⭐A (`core-authority.js:788-790`).
## Anchor / Attachment Modes
Enters ER with protected-entry Aegis until next Start (`ranks.js:686-688`).
## Suit Differentials
Q♠ is immune to non-total multi-target clears (`interactions.js:36-37`).
## Spades Variant
Q♠ survives 4 Row Clear ER.
## Super
None defined. Replaced by Queen's Court.
## Multi-Card System
Queen's Court: 2 Queens from hand committed for 1 Mini-Turn; both enter ER with Aegis; counterable ONLY by K♠ (`core-advanced.js:129-143`).
## Major Cross-Rank Interactions
Pairs with King for Royal Marriage. Enables Guard and Two-Queen defense.
## Opportunity Costs
2 PR points is negligible; Queens are built to live in ER.
## Accessibility & Reachability
COMMON for generic Queen; true pair for Queen's Court is RARE opening (3.9–5.7%), PLAUSIBLE by turn 3 (15.2%).
## Latent / Threat Value
HIGH. Guard completely shuts off enemy single-target removal (3-Bounce, J Attach, 9 Tap, ⭐2).
## Counterplay
4 Row Clear ER (after Aegis lapses), 4♠ Total Clear, ⭐2 Commandeer (bypasses Guard), K♠ (counters Queen's Court).
## Strong States
Paired with high PR points or another Queen.
## Weak States
Enemy holds 4♠ Total Clear or K♠.
## Mechanical Power
Very High.
## Policy-Realized Power
High (Quick Aegis: 44, Queen Anchor: 4 in `06`).
## Human-Realizable Power
`INFERRED`: Extremely High. Fortress building is central to control archetypes.
## Empirical Evidence
48 activations in corpus (`06`).
## Decision Quality
HEALTHY.
## Degeneracy / Exploit Review
Queen fortress investigated (`08` `DEG-09`). Terminates when Aegis expires; Row Clear ER breaks non-Spade Queens.
## Contradictory Evidence
Zero PR scoring value in ER; contributes 0 to 21-point goal.
## Verdict
**STRONG BUT HEALTHY** (with Queen Fortress `WATCHLIST`)
## Evidence Grade
**A**
## Confidence
**VERY_HIGH**

---

# ⦗K⦘ KING — Specialized Counter / Marriage

## Identity & Physical Availability
4 physical cards: K♣, K♦, K♥, K♠. 4/54. Scuttle rank: 13.
## Mechanical Equivalence Classes
Two classes (`02`): `K-BASE` (K♣, K♦, K♥ — 3 cards) and `K-SPADE` (K♠ — 1 card).
## Strategic Roles
`COUNTER`, `SCORING`, `WILDCARD` (K♠), `ANCHOR`.
## Ordinary Scoring Value
8 Secured PR Points. (ER Anchor value: 7; K♠ Anchor value: 9) (`ranks.js:18`).
## Primary Effects
* K-BASE (Instant): Counter single-card Anchor play (`core-authority.js:650-666`).
* K♠ (Instant): Counter Multi-Play — Negates Supers, Combos, Royal Marriage, Queen's Court, paired 10♦ (`core-authority.js:795-812`).
* K♠ Wild Sovereignty (🛠): Copy 3♠, 4♠ (+1 discard), 5♠, 6♠, or 7♠ Base effect; source to Exile (`ranks.js:336-380`).
## Timing Modes
Instant (Counters), Action (Anchor, Marriage, Wild Sovereignty, Scoring, Scuttle).
## Defensive / Counter Modes
K counters anchors; K♠ counters all multi-card plays.
## Anchor / Attachment Modes
Anchor value 7 (9 for K♠). Royal Marriage: King + same-suit Queen enter ER (`core-advanced.js:118-127`).
## Suit Differentials
K♠ possesses Counter Multi-Play and Wild Sovereignty. K♣/♦/♥ counter single-card anchors only.
## Spades Variant
K♠ is the highest-connectivity card in Intrilex (`03` §3.3).
## Super
None defined.
## Wild / Mimic / Generated Interactions
K♠ Wild Sovereignty accesses 4♠ Total Clear.
## Major Cross-Rank Interactions
K♠ is the sole direct standard counter to Queen's Court and Royal Marriage (`01`).
## Opportunity Costs
MAXIMAL on K♠: 8 PR points vs 9 Anchor vs hold as multi-counter vs Wild Sovereignty (Exiled forever).
## Accessibility & Reachability
COMMON for K-BASE; K♠ singleton is RARE (9.3–11.1%).
## Latent / Threat Value
EXTREMELY HIGH for K♠. Threat of K♠ forces opponents to delay Queen's Court and Supers.
## Counterplay
Aces counter Wild Sovereignty. Aces counter a pending K or K♠ response (countering the counter).
## Strong States
Opponent attempts multi-card plays; player needs 8 points to close out game.
## Weak States
Opponent plays purely single-card non-anchor plays.
## Mechanical Power
High for K-BASE; Top-Tier for K♠.
## Policy-Realized Power
K Anchor: 61, K-counter: 3, K♠ counter: 2, Royal Marriage: 1 in `06`.
## Human-Realizable Power
`INFERRED`: Top-Tier.
## Empirical Evidence
67 total activations in corpus (`06`).
## Decision Quality
EXCELLENT.
## Degeneracy / Exploit Review
Wild Sovereignty investigated and rejected as degenerate (`08` `REJ-11`).
## Contradictory Evidence
Wild Sovereignty exiles K♠ permanently and costs an extra discard for 4♠.
## Verdict
**STRONG BUT HEALTHY**
## Evidence Grade
**A**
## Confidence
**VERY_HIGH**

---

# ⦗RJ⦘ RED JOKER — Regime Change

## Identity & Physical Availability
1 physical card. Rarity: 1/54 (Singleton). Scuttle rank: 14.
## Mechanical Equivalence Classes
Single class (`02`): `RJ` (1 card).
## Strategic Roles
`BOARD_RESET`, `RESOURCE`, `VARIANCE`, `SCORING`.
## Ordinary Scoring Value
5 Secured PR Points. PR Immunity: **Immune to Scuttle and Jack attachments** (`ranks.js:19, 47`).
## Primary Effects
Choose One (🛠) (`core-effects.js:233-283`):
1. Hand Swap: Swap hands with opponent.
2. Self Reset: Discard hand, draw hand size + 3.
3. Opponent Attack: Opponent discards hand, redraws hand size - 2.
4. Shuffle Reset: Shuffle DP + GY into new DP, draw 2.
## Timing Modes
Action.
## Defensive / Counter Modes
None.
## Anchor / Attachment Modes
None.
## Suit Differentials
None (Suitless). Cannot be used in color-based Ultra recipes.
## Spades Variant
None.
## Super
None.
## Wild / Mimic / Generated Interactions
Can be used in Sudden Death recipe AS-WRITTEN (Unrestricted dead, `01`).
## Major Cross-Rank Interactions
Scuttle rank 14 scuttles any card except Black Joker. Hand Swap reverses resource disparity.
## Opportunity Costs
5 un-scuttleable PR points vs. game-resetting hand attack.
## Accessibility & Reachability
RARE opening (9.3–11.1%); 27.8% by 15 cards seen.
## Latent / Threat Value
Moderate. Opponent holding large hand risks Opponent Attack.
## Counterplay
Aces counter all 4 modes.
## Strong States
Player has empty hand (Self Reset draws 3); opponent has massive hand (Opponent Attack).
## Weak States
Both players have parity hands.
## Mechanical Power
High variance / High impact.
## Policy-Realized Power
Low (Opponent Attack: 8 activations in `06`).
## Human-Realizable Power
`INFERRED`: High comeback tool.
## Empirical Evidence
8 activations in corpus (`06`).
## Decision Quality
HEALTHY.
## Degeneracy / Exploit Review
Legal, healthy (`08`).
## Contradictory Evidence
Aces cleanly counter the declaration.
## Verdict
**HEALTHY / INSUFFICIENT EVIDENCE**
## Evidence Grade
**B**
## Confidence
**MODERATE**

---

# ⦗BJ⦘ BLACK JOKER — Lockdown

## Identity & Physical Availability
1 physical card. Rarity: 1/54 (Singleton). Scuttle rank: 15 (Top Scuttle).
## Mechanical Equivalence Classes
Single class (`02`): `BJ` (1 card).
## Strategic Roles
`DENIAL`, `STRUCTURAL_CONTROL`, `SCORING` (AS-WRITTEN).
## Ordinary Scoring Value
**0 Points AS-EXECUTED** (Blocked by `CORE_SCORING_RIDER_UNSUPPORTED`, `01` `IMPL-01`). AS-WRITTEN: 11 Points.
## Primary Effects
Board Lock (Quick, Free): Activates global 2-turn lockdown (`core-authority.js:750-776`).
## Timing Modes
Quick (Board Lock), Action (Scuttle). Scoring blocked AS-EXECUTED.
## Defensive / Counter Modes
Board Lock Counter Authority: **Only ⭐A authority (physical ⭐A, 3-Red Ultra) can directly counter Board Lock** (`core-authority.js:778-793`).
## Anchor / Attachment Modes
None.
## Suit Differentials
None (Suitless). Cannot be used in Ultra recipes.
## Spades Variant
None.
## Super
None.
## Wild / Mimic / Generated Interactions
Can enter PR via 10♣ Foundation bonus scoring (`06`, `07` `CF-01`).
## Major Cross-Rank Interactions
Board Lock suppresses all non-counter effect plays, all Scuttles, and all Trap triggers across both players for 2 Full Turns. Scoring and drawing remain legal.
## Opportunity Costs
AS-EXECUTED: None (only Board Lock or Scuttle). AS-WRITTEN: 11 PR points sacrificed for Board Lock.
## Accessibility & Reachability
RARE (9.3–11.1% opening).
## Latent / Threat Value
HIGH. Threat of Board Lock prevents opponent from counting on effect-based comebacks.
## Counterplay
NARROW. Only ⭐A or 3-Red Ultra at declaration. Trailing player can still win by scoring points.
## Strong States
Player is ahead on points and wants to seal the victory without interference.
## Weak States
Player is far behind and needs removal/effects to catch up (Board Lock locks own effects too).
## Mechanical Power
Top-Tier AS-EXECUTED.
## Policy-Realized Power
High (Board Lock: 25 executions / 166 opportunities in `06`).
## Human-Realizable Power
`INFERRED`: Extremely High. Symmetrical lock that favors the leader.
## Empirical Evidence
25 Board Lock activations in corpus (`06`).
## Decision Quality
DOMINATED AS-EXECUTED (Board Lock is the only playable mode). HEALTHY AS-WRITTEN.
## Degeneracy / Exploit Review
Investigated in `08` `DEG-07`. Symmetrical effect; does not prevent point scoring.
## Contradictory Evidence
Symmetrical lock; freezes activator's own effect engine as well.
## Verdict
**BLOCKED BY CORRECTNESS DEFECT** (`IMPL-01`) (Board Lock independently: `WATCHLIST`)
## Evidence Grade
**A**
## Confidence
**VERY_HIGH**
