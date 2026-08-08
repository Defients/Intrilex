# INTRILEX — Complete Player Rulebook v4.1.2

> **Edition:** Player-focused complete rules  
> **Rules basis:** Canonical v4.0 contract plus the accepted July 2026 forensic clarification set, canonized as v4.1; v4.1.1 Interrupt timing hotfix and v4.1.2 Pass/Priority hotfix applied  
> **Deck:** 54 cards — 52 standard cards + Red Joker + Black Joker  
> **Players:** 2 by default; 3–4 with Multiplayer  
> **Default Goal:** 21  
> **First Contact Goal:** 15
>
> **v4.1.1 Timing Hotfix:** **Interrupt is a timing keyword only. It has no inherent turn-skip penalty.** Only an effect that explicitly prints a skip creates one. **10♠ Stack Theft** retains its printed Full-Turn skip consequences; **Time Bomb Defuse** retains its separately printed Action-Phase skip.
>
> **v4.1.2 Pass/Priority Hotfix:** Ordinary Pass is not a generally available Mini-Turn Action. The only gameplay Pass is a forced **Exhausted Pass** when Exhausted is active, DP is empty, and no other legal Mini-Turn Action exists. Declining a response is not an Action; a player with no lawful response is advanced automatically.

Intrilex is a tactical card game about building a public score, disrupting the opponent's engine, and choosing exactly when to spend cards as Points, effects, counters, protection, or advanced combinations.

You win at the **end of your own completed Full Turn** when your **Secured PR Points are at least your current Goal**. Reaching the number earlier is not enough: survive the rest of the turn and complete your End Phase.

This is the complete player rulebook. It contains every Core rule, every card rank, every advanced system, every optional module, and the rulings needed to settle ordinary play without reading implementation notes.

---

## How to Use This Rulebook

**New player:** Read Parts I–III, then play **First Contact**.  
**Core player:** Read Parts I–VI and keep the Rank Codex open.  
**Advanced player:** Add Part VIII modules only when they are enabled.  
**Judge or tournament player:** Also read Part IX.

### Golden Rule

When two rules appear to conflict, the more specific rule wins. A named card, mode, or module exception beats a general rule—but only for the exact thing it mentions.

### Three Table Habits That Prevent Most Disputes

1. Announce the play, mode, source cards, costs, and targets before anyone responds.
2. Keep Aegis, Tap, reveal, skip, Fuse, Disable, and timer markers visible.
3. Finish one resolving effect completely before handling triggers created by it.


## Contents

1. Parts I–IV — objective, setup, turns, stack, scoring, protection, Swap Bar, Scuttle  
2. Part V — Combos, Ultras, Exhausted, Sudden Death, Voltage, Exile  
3. Part VI — complete A-through-Joker card codex  
4. Part VII — First Contact learning game  
5. Part VIII — BattleRealm, Traps, Multiplayer, Deffy, Time Bomb, Tournament Seed, module interplay  
6. Part IX — precedence, matrices, quick reference, glossary, FAQs, tournament play  
7. Part X — player checklist

---

# PART I — THE GAME IN ONE PASS

## 1. Objective

Build Points in your **Point Row (PR)**. At the end of your completed Full Turn, compare your current **Secured PR Points** to your **Goal**.

- If your Points are at least your Goal, you win immediately.
- Only the active player receives the normal End Phase victory check.
- A timer such as Sudden Death or Exhausted may produce a different winner afterward.
- Your Goal can rise, fall, or even become negative unless a mode gives it a floor.
- Your Secured PR Points may also be negative. Use the actual total; never clamp it to 0.

## 2. Setup — Standard Two-Player Core

1. Shuffle all 54 cards into the face-down **Draw Pile (DP)**.
2. Randomly choose Player A. Player A receives 5 cards; Player B receives 6.
3. Player A takes the first turn.
4. Build the **Swap Bar** from the top of the DP: 2 face-down cards and 1 face-up card.
5. Set both Goals to 21.
6. Leave room for each player's PR and **Enduring Row (ER)**, plus shared Graveyard and Exile zones.

## 3. The Table

| Area | What it holds | Visibility |
|---|---|---|
| **DP — Draw Pile** | Cards waiting to be drawn | Face-down |
| **Hand** | Your available cards | Private, unless revealed |
| **PR — Point Row** | Cards scoring your Points | Public |
| **ER — Enduring Row** | Anchors, Attachments, persistent cards | Public |
| **Swap Bar** | Shared side cards | Mixed face-up/face-down |
| **GY — Graveyard** | Spent, discarded, cleared, and countered cards | Public and ordered; newest on top |
| **Exile** | Removed cards available only to effects that name Exile | Public and ordered; newest on top |

**OTT — On The Table** means every player's PR and ER together.

Unless a rule gives another destination:

- spent effect cards go to GY;
- removed PR or ER cards go to GY;
- countered plays go to GY.

## 4. Your Full Turn

A **Full Turn (FT)** has three phases:

1. **Start Phase**
2. **Action Phase**
3. **End Phase**

A skipped turn slot is not a Full Turn. It has no phases, resets nothing, checks no victory, and advances no completed-turn timer.

### 4.1 Start Phase

Resolve these steps in order:

1. **Reset your per-turn limits.** This includes Mini-Turn, Swap Bar, Quick, Voltage, Trap, Ultra, Rank-10, and module limits that reset on your Start.
2. **Check Exhausted.** If the DP is empty and Exhausted is not active, begin Exhausted with a counter of 3.
3. **Take your Voltage Snapshot.** Record qualifying rank-3, rank-4, and rank-5 Points before cards untap or protection expires.
4. **Perform Start maintenance all at once.** Expire due effects and Aegis, and untap cards whose Tap State expires now. Nobody responds during this batch.
5. **Hide your revealed hand cards** whose Revealed-Until-Start marker expires now.
6. **Queue Start abilities, including optional Voltage abilities.**
7. **Choose the order of your simultaneous Start triggers, then resolve them through the normal response system.**
8. **Optional Face-Down Swap.** After the Start stack is empty, you may use your once-per-FT Swap Bar use to perform a Face-Down Swap.
9. Enter Action Phase.

### 4.2 Action Phase

You normally begin with **1 Mini-Turn**. Each Mini-Turn pays for exactly one Action.

Effects can grant more Mini-Turns, but you can never receive or use more than **3 Mini-Turns in one FT**. Extra grants are ignored, and unused Mini-Turns disappear when the phase ends.

If you have a pending **Action-Phase skip**, consume one instead of receiving Mini-Turns. You take no Actions or own-turn Quick plays and proceed to End Phase after pending Start objects finish.

### 4.3 Your Six Ordinary Actions

Each costs 1 Mini-Turn:

1. **Draw** — Draw 1 from the top of DP. If your hand was empty when you declared Draw, draw 2 instead.
2. **Face-Up Swap Bar Draw** — Take 1 face-up Swap Bar card. You cannot do this if you already used Face-Down Swap this FT.
3. **Play for Points** — Put 1 hand card face-up into your PR for its Point value. This normally does not use the stack.
4. **Play for Effect** — Use 1 hand card's legal effect. This uses the stack.
5. **Scuttle** — Attempt to destroy an enemy PR card using rank and suit. This uses the stack.
6. **Draw & Cast** — Only as your first Mini-Turn. Draw and reveal the top DP card, then immediately try to play that exact card for effect.
**Draw & Cast limits:** the drawn card cannot score, Scuttle, enter a Combo/Super/Ultra/Royal Marriage recipe, pay another cost, or become a separate Free play unless its own text explicitly allows it. If it has no legal effect, reveal it and Scrap it. Board Lock forbids Draw & Cast because it would create a non-counter effect play.

Your Action Phase cannot end while a stack item, queued trigger, suspended parent effect, or unresolved Trap declaration window remains pending. Finish every pending object first.

### 4.4 Free Plays

Free plays cost no Mini-Turn but still obey timing and limits:

- **Instant:** during a legal response window.
- **Quick:** during your own FT at a legal timing window.
- **Interrupt:** during any legal response window, including during another player's FT. Interrupt is timing only and carries no inherent Mini-Turn cost, Full-Turn skip, or Action-Phase skip.
- **Special Interrupt:** Interrupt timing plus any additional cost or penalty explicitly printed by that card, ability, or module. The printed text—not the timing keyword—creates that consequence.
- Triggered abilities and module reactions may also be Free.

Free does not mean unlimited. It never bypasses the 3-Mini-Turn cap, the one-Ultra limit, the Rank-10 limit, or another printed restriction. Per-FT limits are tracked per player, even when used during another player's FT, and reset only when that player begins an actual Start Phase.

### 4.5 End Phase

Resolve in this exact order:

1. **Normal victory:** if your Secured PR Points are at least your Goal, you win.
2. **Board Lock:** if active and this is not its activation FT, reduce its counter. End it at 0.
3. **Sudden Death:** if active and this is not its activation FT, reduce its counter. At 0, its activator wins if nobody already won normally.
4. **Exhausted:** if active, reduce its counter. At 0, use the Exhausted tiebreaker.
5. Finish the FT and pass the turn.

If multiple timers reach 0 in one End Phase, resolve them in that listed order. A winner produced by an earlier step ends the phase immediately.

---

# PART II — HOW PLAYS RESOLVE

## 5. Declare First, Resolve Later

Before anyone responds, a player must announce:

- what they are doing;
- every source card;
- the chosen mode;
- every required cost;
- every required target.

Then check whether the play is publicly legal.

### Illegal at Declaration vs. Fizzle

- **Already illegal when declared:** rewind it. Return refundable cards and costs, create no stack item, spend no Mini-Turn, and consume no use limit.
- **Legal when declared, illegal when it resolves:** it **fizzles**. The Mini-Turn and declaration limit stay spent, and committed cards go to their normal failed-play destination.

Never use hidden information to intentionally attempt a play that you know is illegal.

## 6. The Stack and Priority

Effect plays, Scuttle, counters, most triggered abilities, and most Free effects use the **stack**.

When you commit a source card to a pending stack play, it is **On the Stack**. It is no longer in your hand or any table zone and cannot be targeted there.

For a two-player response window:

1. The active player declares the play.
2. The other player may respond with a legal Free play.
3. Players alternate opportunities until both pass consecutively.
4. Resolve the newest pending item first.
5. Finish that item completely.
6. Put triggers created during it onto the stack.
7. Open responses again.
8. Continue until nothing remains.

This is **last in, first out**.

### No Mid-Resolution Interruptions

Once an effect begins resolving:

- every card actively involved becomes **Locked**;
- nobody receives priority;
- follow the instructions in order;
- finish the entire effect;
- then release Locks and handle queued triggers.

A target can still be changed, protected, or removed during the response window before resolution begins.

### Checking Targets Again

Right before an effect resolves, check its required targets again.

- If a single required target is now illegal, the whole effect fizzles.
- If a row-wide or multi-card effect treats cards independently, affect every legal card and skip protected cards.
- A structural operation acts on a whole row or game structure; its own text says what protection it ignores.

### Child Plays

Some effects, especially ⭐7, create a separate card play while the parent effect pauses. Resolve the child play and all triggers it creates, then continue the parent.

If an effect removes or reveals a card specifically to play it but that card has no legal declaration, Scrap it unless the effect says where to return it.

## 7. Counters

A counter negates a pending play before it resolves.

- Countered source cards go to GY unless a specific destination or replacement applies.
- Countering a play does not refund its Mini-Turn or use limits.
- If a counter is itself countered, the first counter fails and the original play remains pending.
- You may counter your own play if the counter is otherwise legal.

Common authority:

| Pending object | Common answers |
|---|---|
| Ordinary effect or counter | Base Ace, Anchor Ace, A♠, ⭐A |
| Single-card Anchor or Goal change | King; legal Aces also work |
| Eligible multi-card play | Base/Anchor Ace when unprotected, A♠, K♠, ⭐A |
| Royal Shield-protected multi-card play | A♠, K♠, ⭐A |
| A♠ | ⭐A only |
| Ultra | ⭐A only, except explicit module text |
| Sudden Death | ⭐A only, except explicit module text |
| Scuttle | 8 Instant |
| Trap trigger | legal Aces or module-3 counter |

The complete card text always controls.

---

# PART III — SCORING, PROTECTION, AND TABLE STATES

## 8. Secured PR Points

Your Secured PR Points equal the current contribution of your PR cards and any explicit outside-PR bonus.

- Tapped PR cards contribute 0.
- Face-down PR Traps contribute 0.
- Cards controlled through Jack count for their current controller.
- Active Jack bonuses count.
- ER normally contributes 0 unless a rule explicitly adds Points from ER.
- Use current values after taps, temporary modifiers, Time Bomb stages, control changes, and Attachments.
- Totals may be negative.

Recalculate before every trigger check and victory check that depends on Points.

## 9. Tapping

A tapped card is rotated 90° and has one current **Tap State**.

- A tapped PR card contributes 0 Points and has no active PR text or PR triggers unless stated otherwise.
- A tapped ER card contributes 0 Anchor value and provides no active text or protection unless stated otherwise.
- Cards do not untap automatically in Core.
- A new tap replaces the old Tap State and its untap condition.
- When a card untaps, erase its Tap State.

Common conditions:

- **Nine:** untap when the card's current controller next scores a card for Points.
- **⭐2 Hold:** untap at the recorded next Start Phase of the new controller.
- Other effects may name an event or require manual untapping.

## 10. Revealed-Until-Start

A card with this marker stays in its holder's hand but remains visible to everyone until that holder's recorded next Start maintenance.

- It can be targeted as a hand card unless an effect requires a hidden card.
- It becomes hidden before Start triggers are put onto the stack.
- If it leaves the hand, remove the marker.
- Returning later does not restore the marker unless a new effect grants it.

## 11. Played for Effect and Exile-Bound

A card is **Played for Effect** when it is used by Play for Effect, Draw & Cast, a Free effect play, or an instruction that tells you to play or resolve it for effect. The marker matters only while that card remains OTT and is removed when it leaves OTT.

A Rank 10 that begins resolving as an effect gains the separate permanent **Exile-Bound** marker. Exile-Bound lasts for the rest of the match and sends that Rank 10 to Exile whenever it would enter GY. A Rank 10 countered before it begins resolving never gains the marker.

## 12. Attachments and Jacked Cards

A Jack Attachment must always remain connected to a legal host.

After a row, zone, controller, protection, or state change, check every affected Jack immediately. If the relationship is no longer legal:

1. sever the Jack;
2. remove Jacked state and Point bonus;
3. Scrap the Jack;
4. return the former host to its original owner's matching row unless the resolving effect established another destination or controller.

A severed Jack never sits in ER as an inactive Anchor.

## 13. Guard

You have **Guard** while you control at least one untapped Queen in ER.

Guard protects your **other** OTT cards from enemy single-target Effects.

Guard does not:

- protect the Queen providing it;
- block Scuttle;
- block friendly effects;
- block multi-target, row-wide, global, or structural effects;
- stop an effect that explicitly bypasses Guard.

## 14. Aegis

Aegis is hard immunity. A card with Aegis cannot be targeted or affected by Actions, Effects, Attachments, triggers, control changes, taps, bounces, clears, Scrap, or Scuttle unless the interaction explicitly bypasses Aegis or says protection does not prevent its structural operation.

Aegis:

- applies even to friendly interactions;
- does not stack;
- records the exact future Start Phase that removes it;
- keeps that recorded expiry even if control changes;
- is fully replaced when the card gains a new Aegis.

Nines can never gain Aegis. A failed grant does nothing.

## 15. Royal Shield

When you declare a protected Base, Quick, Super, or other explicitly protected play, compare Queen counts immediately.

If you control more Queens OTT than the relevant opponent:

- that opponent cannot use Base Ace or Anchor Ace against the play;
- A♠, legal K♠, and ⭐A still follow their own text;
- later Queen-count changes do not alter the snapshot.

In Multiplayer, compare separately against each enemy.

## 16. ⭐A Two-Queen Defense

An opponent cannot declare ⭐A against your play if you control at least two untapped Queens in ER when they attempt to declare it. Check this once at declaration.

## 17. Vulnerable

A card is **Vulnerable to a particular interaction** only when it is a legal target, has no Aegis, has no relevant rank/state immunity, and—against an enemy single-target Effect—is not protected by Guard.

Only effects that explicitly require a Vulnerable card apply that full test.

---

# PART IV — SWAP BAR AND SCUTTLE

## 18. Swap Bar

The Swap Bar is a shared, finite side zone. In a two-player game it starts with 2 face-down cards and 1 face-up card. It is not replenished unless an effect explicitly refills it.

Each player may use the Swap Bar **once per FT**, choosing one method:

### Face-Down Swap — Quick, Start Phase

Requirement: at least one face-down Swap Bar card.

1. Take 1 face-down card into your hand.
2. Put 1 card from your hand into the Swap Bar face-up.

This happens after Start triggers and before Mini-Turn Actions.

### Face-Up Draw — Action

Requirement: at least one face-up Swap Bar card.

Take 1 face-up card into your hand. No replacement is added.

Effects that merely move or inspect Swap Bar cards do not consume your normal use unless they explicitly say they do.

## 19. Scuttle

Scuttle spends one Mini-Turn and uses a hand card to attempt to destroy one enemy PR card.

A normal Scuttle is legal when:

- the target is in an enemy PR;
- the target has no Aegis;
- the target has no Scuttle immunity;
- no rule forbids the attempt;
- your source has a higher rank, or the same rank with a higher suit.

### Scuttle Rank Order

**A < 2 < 3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < RJ < BJ**

Equal standard ranks use:

**♣ < ♦ < ♥ < ♠**

Point value does not determine Scuttle rank.

### Result

- **Successful:** target → GY; source → GY.
- **Countered or fizzled after legal declaration:** target remains; source → GY.
- **Illegal from the beginning:** rewind; source stays in hand; no Mini-Turn is spent.

Guard never blocks Scuttle because Scuttle is an Action, not an Effect.

You cannot Scuttle a card you currently control, including a Jacked card.

### Overrides

- **8♠ Free Scuttle:** no Mini-Turn; ignores rank and suit only. It still respects Aegis and Scuttle immunity.
- **⭐8 Absolute Scuttle:** ignores rank, suit, and ordinary Scuttle immunity. It still respects Aegis.

---

# PART V — ADVANCED CORE SYSTEMS

## 20. Comboing *(Canonical §8)*

Comboing exists only when an effect explicitly enables it.

### 8.1 Combo Definition

A Combo is one declared multi-card play that chains committed source cards into a composite resolution.

- costs 1 Mini-Turn unless the enabling effect says otherwise;
- creates one stack item;
- all committed cards enter On the Stack;
- the Combo's complete recipe, mode, order, and targets are chosen at declaration.

### 8.2 Eligibility

Only cards explicitly allowed by the enabling effect may be committed. Unless that effect says otherwise, eligible cards must be in your hand when declared.

Committed cards are no longer considered in hand or any former zone while the Combo is pending.

### 8.3 Effect Classes

- **🛠 Base:** a rank's defined base effect.
- **⭐ Super:** a rank's defined two-card Super effect.
- **🌟 Super-Duper:** reserved explicit-effect class. It has no universal multiplier.
- **✨ Super-Dee-Duper:** reserved explicit-effect class. It has no universal multiplier.
- **👑 Royal Marriage:** a specific King–Queen play, not a generic Combo tier.
- **🌠 Ultra:** a separate official multi-card play class governed by Section 9.

A 🌟 or ✨ declaration is illegal unless the enabling rule explicitly defines its recipe, effect, targets, resolution order, counter permissions, destinations, and limits.

### 8.4 Pre-Resolution Validation

Immediately before a Combo resolves:

1. confirm every committed source remains on that Combo stack item;
2. confirm the declared recipe remains legal;
3. revalidate every mandatory target and condition;
4. confirm no active rule now prohibits the Combo.

If any mandatory component is illegal, the entire Combo fails before resolution:

- no component resolves;
- all remaining committed cards go to GY unless an explicit destination replacement applies;
- cards already moved by a legal external response remain where that response sent them.

### 8.5 Atomic Combo Resolution

Once Combo resolution begins:

- its committed components are Locked;
- no external play can interrupt it;
- resolve the Combo in the order defined by its enabling text;
- triggers are queued until the current Combo stack item finishes.

Do not attempt to roll back a partially resolved Combo because an internal optional instruction produced no result. Mandatory internal failure follows the Combo's explicit text.

### 8.6 Combo Breaker Exception

The 4♥ Combo Breaker Trap is the only current Core-module exception:

- the Combo fails;
- non-initiating committed cards go to GY;
- the initiating card resolves only as its Base effect through the Trap's stated procedure.

Specific Trap text controls over the general Combo Failure Rule.

## 21. Effect Tiers and Ultras *(Canonical §9)*

### 9.1 Base (🛠)

One card played for its defined Base effect.

### 9.2 Super (⭐)

Two cards of the same rank played together as one declared play, except where a Wild or card text explicitly supplies the second component.

### 9.3 Reserved Advanced Classes

🌟 Super-Duper and ✨ Super-Dee-Duper are classification tags only. They have no default doubling, tripling, or prestige behavior. An effect using either class must define its complete executable rules.

### 9.4 Ultras (🌠) — Official

An Ultra is a declared multi-card play consisting of exactly one recipe:

- **3 Black:** three cards whose suits are ♣ or ♠;
- **3 Red:** three cards whose suits are ♦ or ♥;
- **2 Black + 2 Red:** exactly two Black and two Red cards.

General Ultra rules:

- one stack item;
- costs 1 Mini-Turn unless its own timing says otherwise;
- limit: 1 Ultra per player per FT;
- Royal Shield does not protect an Ultra;
- all component assignments, modes, choices, and required targets are declared up front;
- only ⭐A may counter an Ultra unless another rule explicitly says it can;
- an Ultra cannot be stolen, redirected, or retargeted unless an effect explicitly names Ultras;
- if countered, all committed Ultra cards go to GY unless an Ultra rider says otherwise.

#### Ultra Atomicity

Once an Ultra begins resolving:

- all Ultra components are Locked;
- no priority window opens between steps;
- a card played by an internal Ultra instruction resolves as an internal Ultra sub-effect, not a separate counterable play;
- this recursive internal-casting rule continues through effects generated by those internal cards;
- triggers generated during the Ultra are queued until the Ultra stack item finishes;
- if one internal step has no legal target or result, that step fizzles and later steps continue unless they explicitly depend on it.

#### 3 Black Ultra

Assign one committed card to each role at declaration:

1. **Score:** score that card into PR with no effect play.
2. **Cast:** resolve that card's Base effect as an internal Ultra sub-effect.
3. **Exile:** send the remaining card to Exile.

Resolve those roles in that order.

#### 3 Red Ultra — Instant Counter Ultra

3 Red is an **Instant Ultra**:

- it may be declared during any legal response window;
- it does not spend a Mini-Turn;
- it still consumes the player's one-Ultra-per-FT limit.

Choose one pending play that ⭐A could legally counter. Resolve the 3 Red Ultra as ⭐A against that play, then draw 1 card from the bottom of GY.

**Counter-resistant draw rider:** if the 3 Red Ultra itself is countered:

1. finish resolving the opposing counter;
2. send the three Ultra cards to GY;
3. then its original controller draws 1 from the bottom of GY, if available.

This draw rider does not use the stack and cannot be separately countered.

#### 2 Black + 2 Red Ultra

Gain +2 Mini-Turns this FT, still respecting the 3-Mini-Turn hard cap. Then choose one:

- draw 2 from DP; or
- rummage 1 card from Exile.

If the chosen branch has no legal result, that branch does nothing.

### 9.5 Multi-Card Control Changes

If an effect explicitly takes control of an eligible multi-card play:

- change the stack item's controller;
- preserve its sources, declared mode, paid costs, and tier;
- use the new controller for controller-relative text;
- preserve or retarget only as the takeover effect explicitly permits.

Ultras remain ineligible unless the takeover effect explicitly names Ultras.

## 22. Exhausted *(Canonical §10)*

### 10.1 Entering Exhausted

Emptying DP during an Action, effect, or End Phase does not immediately begin Exhausted.

At the beginning of any actual Start Phase:

- if DP is empty and Exhausted is inactive, enter Exhausted;
- set Exhaust Counter to 3.

If DP was refilled before that Start Phase, Exhausted never begins.

### 10.2 Restrictions While Active

While Exhausted is active and DP is empty:

- Draw and Draw & Cast cannot be declared;
- instructions that draw from DP do as much as legally possible;
- Face-Up Swap Bar Draw is unavailable;
- Face-Down Swap remains legal;
- Swap Bar access through explicit effects remains legal;
- Exile and GY access remain legal.

If the active player reaches a Mini-Turn while Exhausted is active, DP is empty, and no other legal Mini-Turn Action exists, the engine requires an **Exhausted Pass**. Exhausted Pass consumes that Mini-Turn. It is not a response decline, automatic priority transition, or skipped turn. It is illegal in every other circumstance.

### 10.3 Countdown

Exhaust Counter is one game-level counter.

After every **completed FT** while Exhausted remains active, reduce it by 1.

- It counts three total completed FTs, not three per player.
- A skipped turn slot is not a completed FT and does not tick it.
- The FT whose Start Phase began Exhausted counts when that FT ends.

At 0, if nobody won normally, resolve:

1. most active, untapped Anchors in ER;
2. if tied, higher Secured PR Points;
3. if tied, draw.

Face-down Traps, tapped ER cards, invalid Attachments, and non-Anchor ER cards do not count as Anchors.

### 10.4 Recovery

If one or more cards enter an empty DP while Exhausted is active:

- Exhausted ends immediately;
- clear Exhaust Counter;
- all Exhausted restrictions lift immediately, including during the current Action Phase;
- do not tick the cleared counter at that FT's End Phase.

If DP later becomes empty again, a new Exhausted instance may begin at a later Start Phase.

Exhausted cannot begin more than once during the same FT.

### 10.5 Team Play

In 4-player Teams, compare combined active Anchors and then combined Secured PR Points for each team.

## 23. Sudden Death *(Canonical §11)*

### 11.1 Declaration

Declare Sudden Death as one multi-card play using either:

- Red Joker + Black Joker; or
- four cards of the same rank.

Choose one Vulnerable enemy OTT card as the Scrap target.

Only ⭐A may counter the activation unless another effect explicitly names Sudden Death.

### 11.2 Resolution

If the activation resolves:

1. Scrap the chosen Vulnerable enemy OTT card;
2. set Sudden Counter to 2;
3. record the current FT as the activation FT;
4. record the activator.

If the target became illegal, the Scrap step fizzles but the timer still begins unless the activation itself was countered.

### 11.3 Timer

Do not reduce Sudden Counter at the end of the activation FT.

At the end of each following completed FT:

1. perform the active player's normal victory check first;
2. reduce Sudden Counter by 1;
3. when it reaches 0, if nobody has won normally, the activator wins immediately.

Skipped turn slots do not tick Sudden Counter.

In team play, the activator's team wins when the timer expires.

## 24. Voltage and Rank-10 Exile-Bound *(Canonical §12)*

### 12.1 Voltage Snapshot

After per-FT state resets and before Start maintenance:

1. record the active player's qualifying Voltage Points for ranks 3, 4, and 5;
2. lock that eligibility for the current FT.

Later scoring, tapping, untapping, removal, or control changes do not create or remove eligibility during that FT.

### 12.2 Voltage Points

For a named rank, Voltage Points equal the current Point contribution of face-up, untapped cards of that rank in your PR at the snapshot.

- tapped cards contribute 0;
- face-down Traps contribute 0;
- controlled Jacked cards count for their current controller;
- active Jack Point bonuses count;
- ER does not count;
- cards of another rank never contribute, even if a bonus raises their value.

### 12.3 Voltage Window

After Start maintenance and before Face-Down Swap:

- each eligible Voltage ability becomes an optional Start ability;
- the active player orders it with their other Start triggers;
- it uses the stack;
- it costs no Mini-Turn;
- it is not a card play;
- each rank's Voltage ability may resolve at most once that FT;
- an unused Voltage ability expires when Start Phase ends.

A counter that only counters a **play** cannot counter Voltage unless it explicitly includes triggered abilities.

### 12.4 ⦗3⦘ — ⚡ Sleight

Requirement: at least 3 qualifying ⦗3⦘ Voltage Points.

Reveal up to the top 2 cards of DP. Choose one revealed card:

- play it for effect;
- score it for Points;
- add it to your hand.

Return every other revealed card to the bottom of DP. If no card is revealed, the ability resolves with no effect.

A generated effect play creates its normal response window unless another resolving effect explicitly makes it internal.

### 12.5 ⦗4⦘ — ⚡ Predictable

Requirement: at least 4 qualifying ⦗4⦘ Voltage Points.

Privately record a rank and suit guess for the top DP card, then reveal that card.

- if rank is correct, you may immediately score it for Points or declare it as an effect play;
- otherwise, if suit is correct, draw it;
- otherwise, return it to the top of DP.

If both are correct, use the rank-correct branch.

### 12.6 ⦗5⦘ — ⚡ Refinement

Requirement: at least 5 qualifying ⦗5⦘ Voltage Points.

Choose one:

- draw 1, discard 1, then draw 1; or
- draw the bottom card of GY.

This Voltage ability does not stack with another ⦗5⦘ Voltage resolution during the same FT.

### 12.7 Rank-10 Exile-Bound Marker

When a Rank 10 played for effect **begins resolving**, it gains the permanent Exile-Bound marker for the remainder of the match.

- A Rank 10 countered before resolution never becomes Exile-Bound and goes to GY normally.
- A Rank 10 that begins resolving remains Exile-Bound even if its effect later fizzles.
- Whenever an Exile-Bound Rank 10 would enter GY for any reason, send it to Exile instead.
- A Rank 10 scored only for Points is not Exile-Bound.
- Exile-Bound is independent of the Played-for-Effect tag.

This destination replacement controls unless another effect explicitly overrides Exile-Bound.

---

## 25. Exile *(Canonical §14)*

Exile is one public, shared, ordered removal zone.

Cards in Exile remain face-up and retain original ownership. They are inaccessible unless an effect explicitly names Exile.

### 14.1 Entering Exile

A card enters Exile only when:

- an effect explicitly sends it there;
- a rule or destination replacement mandates Exile;
- an Exile-Bound Rank 10 would enter GY.

Cards never enter Exile by default. `Remove` or `Scrap` without explicit Exile text sends the card toward GY.

### 14.2 Visibility and Order

- Every Exile card is face-up.
- Players may inspect Exile at any time.
- Exile is ordered by arrival.
- **Top:** newest card.
- **Bottom:** oldest card.

Do not reorder Exile unless an effect explicitly says so.

### 14.3 Accessing Exile

Only effects that explicitly name Exile may inspect, move, recover, rummage, recycle, or otherwise interact with its cards.

Current Core access methods:

| Method | Access |
|---|---|
| 5♣ Exile rummage | newest 2 |
| 5♦ Exile rummage | all except newest 2 and oldest 2; requires at least 5 cards |
| 5♥ Exile rummage | oldest 2 |
| 5♠ Exile rummage | any card |
| 10♠ Exile Recovery | any 1 card → hand as Revealed-Until-Start |
| 2B+2R Ultra | rummage any 1 card |
| BJ Exile Recycle | up to 2 cards → top or bottom of DP |

No other method may access Exile unless a module explicitly adds one.

### 14.4 Exile Immunity

Cards in Exile:

- cannot be targeted by effects that do not explicitly name Exile;
- cannot be Scuttled, Jacked, tapped, bounced, Scrapped, or granted Aegis;
- do not count as OTT, in hand, in GY, or in DP;
- retain original ownership even when another player exiled them.

### 14.5 Exile and Exhausted

Exile access remains legal while DP is empty.

If at least one card moves from Exile into an empty DP while Exhausted is active:

- Exhausted ends immediately;
- clear Exhaust Counter.

If DP empties again, a new Exhausted instance may begin at a later Start Phase.

### 14.6 Multiplayer

Exile remains one shared zone regardless of player count.

Positional access uses the same shared order. “Your card in Exile” means a card you originally owned, regardless of who controlled or exiled it.

---

# PART VI — COMPLETE CARD CODEX

Every physical card can be used for Points, and many ranks can instead be used for effects, counters, Anchors, Attachments, Supers, or suit-specific abilities.

### Reading the Codex

- **Points** is the card's ordinary PR value.
- **🛠 Base** is a standard one-card effect.
- **⭐ Super** normally uses two cards of the same rank as one play.
- **⚓ Anchor / Attachment** places the card in ER.
- **Instant / Quick / Interrupt** define when the play is legal.
- Suit text applies only to that exact suit unless another rule copies it.

The card's complete entry controls over summaries and quick-reference tables.

## 26. Rank System — A through Jokers *(Canonical §13)*

Each rank includes (as applicable):
- **Points (PR)**
- **PR Immunity**
- **Base Effect (🛠)**
- **Super Effect (⭐)**
- **Suit variants**
- **Anchor / Attachment modes**
- **Timing**
- **Limits**

### Timing Keywords

- **Instant:** playable during any legal response window without spending a Mini-Turn.
- **Quick:** playable during your own FT at a legal timing window without spending a Mini-Turn.
- **Interrupt:** playable during any legal response window, including during another player's FT, without spending a Mini-Turn. Interrupt is a timing permission only and has no inherent skip penalty.
- **Special Interrupt:** uses Interrupt timing and also applies any additional cost or penalty explicitly printed on that card or module.

A Full-Turn skip exists only when an effect explicitly creates one. Pending Full-Turn skips stack, and each consumes the next scheduled turn slot of that player that has not already begun.

## ⦗A⦘ ACE — Counter Authority

**Points:** 4  
**PR Immunity:** when scored for Points, cannot be Scuttled or Jacked.

A physical A♣, A♦, or A♥ using the generic counter ability is a **Base Ace counter**. A♠ uses its special Exile Counter text.

### A (Instant) — Base Counter

Counter one pending ordinary effect play or counter.

Base Ace cannot counter:

- A♠;
- Ultras;
- Sudden Death activations;
- a play protected from Base Ace by Royal Shield;
- anything whose text explicitly excludes Base Ace.

A legal Base Ace may counter an eligible multi-card effect unless a narrower rule says otherwise.

### A (🛠 Purge)

Choose one:

1. Scrap one card that currently has Aegis; or
2. if no card has Aegis, bounce one Vulnerable enemy Anchor from ER to its owner's hand.

Purge's first mode specifically targets an Aegised card, explicitly bypasses that Aegis for the Scrap, and does not require Vulnerable.

### A (⚓ Anchor Counter)

Place Ace in ER as an Anchor.

During a later response window, you may sacrifice it to counter one eligible opponent play using Base Ace authority.

It cannot counter Ultras, Sudden Death, A♠, or a Royal Shield-protected play unless another effect explicitly expands it.

If its counter succeeds:

- take one negated source card into your hand as Revealed-Until-Start;
- send the other negated source cards to their normal destinations.

The Anchor remains in ER until sacrificed or removed. It has no expiration timer.

### A♠ (Instant) — Exile Counter

Counter one eligible pending ordinary play.

A♠ cannot counter an Ultra or Sudden Death activation.

- Base Ace and Anchor Ace cannot counter A♠.
- Only ⭐A may counter A♠.
- Cards countered by A♠ go to Exile instead of GY.
- Royal Shield does not prohibit A♠ unless another rule explicitly says so.

### ⭐A (Instant) — Super Counter

⭐A may counter anything Base Ace can, plus:

- A♠;
- Royal Shield-protected plays;
- eligible multi-card plays;
- Ultras;
- Sudden Death activations.

When declared, check the controller of the play ⭐A is attempting to counter.

If that defending player controls two or more untapped Queens in ER, ⭐A cannot be declared against that play. This is checked once at declaration.

If ⭐A counters an Ultra, all Ultra source cards go to GY and any explicit counter-resistant rider still resolves.

**Limit:** none.

## ⦗2⦘ TWO — Wild Catalyst

**Points:** 2

### 2 (Quick) — Score + Discard

Score this 2 into PR for 2 Points. Then the chosen opponent discards 1 card of their choice.

##### Limit

- You may have only one 2 Quick you control pending at a time.
- After one of your 2 Quicks resolves, you cannot declare another 2 Quick during that FT.
- A countered 2 Quick does not consume the resolved-use limit.
- If the opponent has no card to discard, the 2 Quick still counts as resolved.

### 2 Wild Rule — Ranks 3–7, Same Suit Only

A 2 may act as the second card for the ⭐ Super effect of a rank 3–7 card only when both cards have the same suit.

- 2 + same-suit rank 3–7 is one Super play.
- A mismatched suit is illegal.
- This does not create ⭐2.
- Two actual 2s are required for ⭐2.

### 2 (Solo Wild) — Same-Suit Base Effect Copy

A single 2 may be played alone as a wild copy of one same-suit rank 3–7 card's Base (🛠) effect.

- The 2 must match the suit of the chosen rank 3–7 card (e.g., 2♥ → 3♥/4♥/5♥/6♥/7♥).
- The 2 adopts the chosen rank's Base (🛠) effect only; Super effects still require a second same-rank card.
- This costs 1 Mini-Turn and the 2 goes to GY after resolution.
- This is wild for effect only — the 2 cannot be scored as the chosen rank for Points.
- This does not create ⭐2.
- The copied effect opens its normal response window and obeys all timing, target, and per-FT limits.
- Suit-specific enhanced Base modes (3♠ Enhancement, 4♠ Total Clear, 6♠ Deep Draw, 7♠ enhancement) require the 2 to be 2♠.

### ⭐2 — Commandeer

Take control of one opponent OTT card.

⭐2:

- bypasses Guard and ordinary rank-based control protection;
- does not bypass Aegis;
- cannot legally target an Aegised card;
- counts as affecting and changing control.

After control changes, revalidate every Attachment involving that card.

The taken card receives a new Tap State that replaces any prior Tap State and expires at the new controller's recorded next Start Phase.

Choose one:

- **Score it:** move it to your PR untapped. Remove its Tap State.
- **Hold it:** leave it in its corresponding row under your control, tapped. At the recorded Start Phase it untaps. You may then either leave it OTT normally or remove it from that row and declare one of its legal effects as a Start child play without spending a Mini-Turn. If used for that effect, it proceeds to its normal effect destination afterward.

If ⭐2 targets a Jacked host, the existing Jack normally severs and goes to GY unless the resolving control change explicitly preserves a legal Attachment.

If ⭐2 targets the Jack Attachment itself, change the Jack's controller, then revalidate whether its host can legally follow that control relationship. If not, sever the Jack.

## ⦗3⦘ THREE — Hand Raid / Bounce

**Points:** 3

### 3 (🛠) — Choose One

1. An opponent presents up to 3 cards from their hand, choosing the cards. Take 1 presented card into your hand as Revealed-Until-Start and return the rest.
2. That opponent discards up to 2 cards of their choice.
3. Bounce 1 Vulnerable OTT card to the top of DP.

If the opponent has fewer cards than requested, they present or discard as many as possible.

### 3 (Instant) — Bounce

Bounce 1 Vulnerable OTT card to the top or bottom of DP, chosen by the caster.

The target is revalidated when resolving. It becomes Locked only when the Bounce begins resolving.

### 3♠ (🛠) — Enhancement

For a hand-presentation mode, have the opponent present up to 2 cards instead.

Choose 1 presented card:

- score it for Points; or
- declare it as a separate effect play under your control.

Return every other presented card. A generated effect play opens its normal response window.

### ⭐3 — Super Raid

Choose one:

- opponent presents up to 3 cards; take up to 2 into your hand as Revealed-Until-Start and return the rest; or
- opponent discards until only 2 cards remain in their hand.

---

## ⦗4⦘ FOUR — Clears / Exchanges

**Points:** 4  
**PR Immunity:** if scored for Points, cannot be targeted by Effects. It may still be Scuttled and may be affected by legal zone-wide, global, or structural operations.

### 4 (🛠) — Row Clear

Choose one:

- clear every opponent PR card that this effect can legally affect; or
- clear every opponent Anchor in ER that this effect can legally affect.

This is a zone-wide, independent-card effect:

- Guard does not apply;
- Aegised cards are skipped;
- applicable rank or state immunity is honored;
- if no card can be affected, the effect resolves with no board impact.

Q♠ survives the ordinary ER clear because it is immune to non-total multi-target clears.

### 4 (Quick) — Natural

Look at the top 4 cards of DP, reorder them, then optionally draw 1 of them from the top.

### 4♠ (🛠) — Total Clear

Clear every OTT card from every player's PR and ER to GY.

4♠ is a structural Hard Bypass:

- bypasses Guard;
- bypasses Aegis;
- bypasses Q♠ special protection;
- bypasses ordinary rank targeting and clear immunity.

Destination replacements such as Exile-Bound still apply.

### ⭐4 — Row Exchange

Choose one:

- exchange your PR with one opponent's PR; or
- exchange your ER with one opponent's ER.

Row Exchange is structural:

- it does not target the cards individually;
- existing Guard, Aegis, and rank target immunity do not stop the exchange;
- Attachments are revalidated after the exchange;
- cards remain controlled by the player whose row they enter unless a legal Attachment or effect explicitly says otherwise.

An exchange with an empty row is legal: all cards in the nonempty row move across, while zero cards move back. After the exchange, every card in each exchanged row gains new Aegis until its current controller's recorded next Start Phase. This replaces any previous Aegis. Nines do not gain Aegis.

## ⦗5⦘ FIVE — Recycle / Rummage

**Points:** 5  
**PR Immunity:** if scored for Points, immune to ordinary Scuttle.

### 5 (🛠) — Recycle Line

Mill up to 2 cards from the top of DP to GY. Then:

1. rummage 1 legal card from GY into your hand as Revealed-Until-Start;
2. draw the bottom card of GY, if one remains.

### 5 Suit Rummage — Exile Access

When a 5 effect explicitly permits Exile rummage:

- **5♣:** access the newest 2 Exile cards;
- **5♦:** access every card except the newest 2 and oldest 2;
- **5♥:** access the oldest 2 Exile cards;
- **5♠:** access any Exile card.

5♦ requires at least 5 cards in Exile. With 4 or fewer cards, its Exile-access mode is unavailable.

If the access set becomes empty before resolution, that rummage step fizzles. No suit receives a fallback range.

### ⭐5 — Super Recycle

Mill up to 3 cards from DP to GY. Choose one of the cards milled by this effect and play it immediately:

- for Points; or
- for effect, respecting all timing, target, and per-FT limits.

If no card was milled, no card can be played.

## ⦗6⦘ SIX — Deep Dig

**Points:** 6

### 6 (🛠) — Dig

Draw 3 privately. Choose one:

- keep 2 and return 1 to the top or bottom of DP; or
- keep all 3 and discard 1 card from your hand to GY.

If fewer than 3 cards can be drawn, resolve using the cards actually drawn.

### 6 (Quick) — Swap Bar Peek

Requirement: at least one face-down Swap Bar card exists.

Privately look at up to two face-down Swap Bar cards. Choose one looked-at card:

- take it into hand as Revealed-Until-Start; or
- play it immediately for effect only.

This is effect access, not a Swap Bar Use:

- no exchange is required;
- no replenishment occurs;
- it does not consume your once-per-FT Swap Bar Use;
- the immediate effect creates its normal response window and obeys all limits.

### 6♠ (🛠) — Deep Draw

You must have at least 1 other card in hand to declare this effect. Discard 1 or 2 cards, then draw up to 6 privately.

- If you discarded 1, keep up to 3 drawn cards.
- If you discarded 2, keep up to 4 drawn cards.

Return every other drawn card to DP in any order.

If DP contains fewer cards, do as much as possible.

### ⭐6 — Super Dig

Draw up to 7 privately. Keep up to 4. Return every remaining drawn card to DP and/or GY in any distribution you choose.

## ⦗7⦘ SEVEN — Topdeck Casting

**Points:** 7

### 7 (🛠)

Reveal up to the top 2 cards of DP.

- With two cards, add 1 to your hand as Revealed-Until-Start and play the other immediately for effect.
- With one card, choose to add it to hand as Revealed-Until-Start or play it for effect.
- With no card, resolve with no effect.

The generated effect play creates its normal response window unless it is being resolved as an internal Ultra sub-effect.

### 7 — Scoring Trigger

When scored for Points:

1. reveal up to the top 2 cards of DP;
2. take 1 revealed card into hand as Revealed-Until-Start;
3. return every other revealed card to the top in any order.

This trigger uses the stack. If Seven is scored during another atomic effect, queue the trigger until that stack item finishes.

### 7♠ (🛠)

Reveal up to the top 3 cards of DP. Assign as many different available cards as possible:

- up to 1 to hand as Revealed-Until-Start;
- up to 1 to play for effect;
- return every remaining revealed card to the top in any order.

### ⭐7 — Sequential Topdeck Casting

Reveal up to the top 2 cards of DP and choose their order.

For each revealed card, one at a time:

1. suspend ⭐7;
2. declare that card as a separate effect play;
3. open a normal response window;
4. resolve that play and every trigger it generates;
5. resume ⭐7 and continue to the next card.

Both cards are played for effect only.

If one revealed card has no legal effect declaration, Scrap it and continue to the other card. Its failure does not cancel ⭐7.

## ⦗8⦘ EIGHT — Aegis Engine / Scuttle Control

**Points:** 8  
**PR Immunity:** while scored in PR, cannot be targeted by Effects except 4♠ and ⭐2. This does not grant Scuttle immunity; ordinary Scuttle rules still apply.

### 8 (Quick) — Aegis Field

Grant Aegis to all your OTT cards until your recorded next Start Phase.

- new Aegis replaces old Aegis;
- Nines do not gain Aegis.

### 8 (Instant) — Scuttle Counter

Counter one pending Scuttle attempt.

The countered Scuttle source card goes to GY. The target remains where it is.

### 8 — Scuttle Bonus

After you successfully resolve an ordinary Scuttle using an 8 as the Scuttle source, draw 1 from the top or bottom of GY.

### 8♠ (Instant) — Free Scuttle

Declare a Scuttle without spending a Mini-Turn and ignore rank and suit requirements.

It still respects:

- Aegis;
- ordinary Scuttle immunity;
- ownership and PR-target requirements.

### ⭐8 — Absolute Scuttle

Scuttle any enemy PR card, ignoring rank, suit, and ordinary Scuttle immunity.

Aegis still blocks ⭐8 unless another effect explicitly bypasses it.

## ⦗9⦘ NINE — Tap / Goal Warfare

**Points:** 9  
**Special:** can never receive Aegis.

### 9 (Instant) — Tap

Tap one opponent PR card.

Replace that card's current Tap State with:

> Untap when its current controller next scores a card for Points.

When that controller scores:

1. the new Points card enters PR;
2. every card they control with this Nine condition untaps simultaneously;
3. recalculate Secured PR Points;
4. place or queue the newly scored card's trigger.

Cards tapped under another condition do not untap.

### 9 (Instant) — Goal Shift

Choose one:

- increase one opponent's Goal by 3; or
- increase one opponent's Goal by 5, then you discard 1 card.

### 9♠ (Instant)

When using the +5 Goal Shift mode, you may also reduce your own Goal by 2.

### 9 (⚓ Anchor)

Place Nine in ER. Reveal one opponent's hand; that opponent discards 1 card of their choice.

You may control only one active Nine Anchor at a time.

When a new Nine Anchor enters under your control, Scrap your previous Nine Anchor before the new one becomes active.

## ⦗10⦘ TEN — Exile-Grade Spike

**Points:** 10  
**Limit:** 1 Rank-10 effect play per player per FT.  
**Royal Shield:** does not protect Rank-10 effect plays.

Any Rank 10 played immediately for effect through another effect still consumes this limit.

When a Rank-10 effect begins resolving, apply the Exile-Bound marker from Section 12.7.

### 10♣ — Foundation

When scored for Points, 10♣ enters PR with Aegis until its controller's recorded next Start Phase.

Immediately before it enters PR, record that player's Secured PR Points.

If the recorded total was 0, queue an optional scoring trigger:

> Score one legal card from your hand into PR without spending a Mini-Turn.

The bonus card:

- is scored for Points only;
- can release Nine-conditioned taps;
- creates its normal scoring trigger;
- cannot be used as an effect, Scuttle source, Combo, Super, Ultra, cost, or Royal Marriage component for this instruction.

### 10♦ — Mimic

10♦ always remains a Rank-10 play for limits, Royal Shield, identity, and Exile-Bound.

#### Played alone

Mimic one ⭐ effect from ranks 3–7.

#### Played with any 2

Commit 10♦ and one 2 as one multi-card Rank-10 play. Mimic one ⭐ effect from:

- ranks 3–8;
- Ace;
- Jack.

Excluded:

- ⭐2;
- Rank 10;
- Jokers;
- the undefined ⭐9.

The paired 2 is consumed as a source card and goes to GY after resolution. It does not count as ⭐2 or trigger ⭐2 rules.

#### Mimic Definition

Copy the chosen effect's:

- instructions;
- legal targets;
- timing keyword;
- effect-specific bypasses;
- effect-specific restrictions.

For the copied effect's own counter, target, and bypass authority, treat the play as using that mimicked effect. Thus a copied ⭐A may answer a play that ⭐A could answer and uses the same two-Queen restriction.

Do not copy the mimicked card's:

- rank, suit, Points, immunity, ownership, source-card count, or identity for any other check.

If mimicking an Instant such as ⭐A, 10♦ may be declared in that Instant timing window while still counting as the player's Rank-10 effect play.

### 10♥ — Tempo Spike

Gain +2 Mini-Turns this FT, still capped at 3 total. Then draw 1.

### 10♠ (Interrupt) — Stack Theft

**Printed exception:** Stack Theft explicitly creates Full-Turn skips. That penalty comes from this card's text, not from the Interrupt keyword.

Target one pending single effect play, excluding Ultras and Sudden Death activations.

If Stack Theft resolves:

1. change that stack item's controller to you;
2. preserve its source cards, chosen mode, paid costs, tier, and declaration history;
3. you may keep or replace any or all targets with new legal targets;
4. controller-relative words such as “you,” “your,” and “opponent” use you as the new controller;
5. resolve the stolen effect under your control;
6. after that effect finishes or fizzles, both you and the original caster gain one pending Full-Turn skip.

The stolen play is not redeclared. Its mode and paid costs cannot be changed.

If it has no legal required target after control changes, it fizzles; its committed source cards go to GY, the theft still resolved, and both skips apply.

If 10♠ itself is countered:

- its controller still gains one pending Full-Turn skip from Stack Theft's printed penalty;
- the original caster gains no skip;
- the original effect remains under its original controller.

Pending Full-Turn skips stack. Each consumes that player's next scheduled turn slot that has not already begun.

### 10♠ (🛠) — Exile Recovery

Recover one card from Exile into your hand as Revealed-Until-Start.

This is a Rank-10 effect play and consumes the once-per-FT limit.

## ⦗J⦘ JACK — Disrupt / Attach

**Points:** 3

### J (Instant) — Disrupt

Respond to an opponent's Mini-Turn Action declaration.

If J resolves:

1. record the triggering Action type as disrupted for that acting player for the rest of the current FT;
2. draw 1.

The triggering Action is not countered and continues normally.

For the rest of that FT, the affected player cannot repeat a disrupted Action type if at least one different Action is currently legal. If no different Action is legal, repeating it is allowed.

Disrupt applies to the seven Mini-Turn Action types, not to Free plays, counters, triggered abilities, or module reactions.

Multiple J effects may disrupt different Action types. Clear all such restrictions when that FT ends.

### J (⚓ Attachment) — Jack PR

Attach to one Vulnerable opponent PR card.

While attached:

- you control the host card;
- the host remains in PR and counts toward your Secured PR Points;
- it gains +1 Point;
- it is Jacked.

If the host leaves PR or the Attachment otherwise becomes invalid, sever the Jack under Section 1.4.

#### J♠ (⚓ Attachment) — Jack ER

Attach to one Vulnerable enemy Anchor in ER.

While attached:

- you control that Anchor;
- it remains in ER;
- its active text, Anchor value, Guard, and Start triggers benefit you;
- changing control does not make it leave and re-enter ER;
- entry abilities do not trigger again;
- it cannot be Jacked again.

Eligible hosts include face-up Queens, Kings, Ace Anchors, Nine Anchors, and other cards explicitly functioning as Anchors. Attachments, Traps, and non-Anchor ER cards are ineligible.

If J♠ leaves or the relationship becomes invalid, sever it under Section 1.4.

### ⭐J — Tempo Force

Gain +2 Mini-Turns this FT, still capped at 3.

## ⦗Q⦘ QUEEN — Protection Engine

### Queen in PR

A Queen scored into PR is worth 2 Points.

### Queen in ER

A Queen in ER is an Anchor worth 0 Points and provides Guard while untapped.

### Q (Quick)

Grant Aegis to one friendly OTT card until your recorded next Start Phase.

- limit: 1 resolved Q Quick per FT;
- a pending Q Quick prevents another from being declared;
- Nines cannot receive Aegis.

### Protected ER Entry

A Queen enters ER with Aegis until its controller's recorded next Start Phase.

This is part of entry:

- it does not use the stack;
- it cannot be separately responded to;
- opponents may still respond to the play before the Queen enters;
- control changes without re-entry do not retrigger it.

#### Q♠ — Special Protection

While OTT, Q♠ is immune to non-total multi-target clears.

It is still affected by:

- 4♠ Total Clear;
- ⭐2 where legal;
- K♠ where applicable;
- any effect explicitly bypassing Q♠.

All Guard and Royal Shield rules otherwise remain unchanged.

## ⦗K⦘ KING — Specialized Counter / Marriage

**Points:** 8 in PR  
**ER Anchor Value:** 7; K♠ is worth 9 as an Anchor.

### K (Instant) — Counter Anchor or Goal

Counter one pending **single-card**:

- Anchor Play; or
- Goal-Mod Play.

Regular K cannot counter:

- Royal Marriage;
- another multi-card Anchor or Goal-Mod play;
- a triggered ability that is not a card play.

General Ace counters may also answer these plays when legal.

### K♠ (Instant) — Counter Multi-Play

Counter one eligible multi-card play, including:

- Supers;
- Combos;
- Royal Marriage;
- paired 10♦;
- another defined multi-card stack item.

K♠ cannot counter:

- Ultras;
- Sudden Death;
- anything whose text says only another counter may interact with it.

K♠ bypasses protection on the play it is countering as specified, but K♠ itself may be countered normally.

### K (⚓ Anchor)

Place King in ER as an Anchor:

- 7 Anchor value;
- 9 if K♠.

### Royal Marriage

Declare King + Queen of the same suit as one multi-card Anchor Play.

- both enter ER;
- the Queen enters with Aegis;
- regular K cannot counter the Marriage;
- K♠ and ⭐A may counter when legal;
- Base Ace may counter when Royal Shield does not prevent it.

Royal Marriage is a specific play class, not a generic effect tier.

## ⦗RJ⦘ RED JOKER — Regime Change

**Points:** 5  
**PR Immunity:** cannot be Scuttled or Jacked while scored for Points.

When played for effect, choose one:

1. **Hand Swap:** exchange complete hands with one opponent.
2. **Self Reset:** discard your hand, then draw a new hand containing 3 more cards than you discarded.
3. **Opponent Attack:** chosen opponent discards their hand, then redraws 2 fewer cards than they discarded, minimum 0.
4. **Shuffle Reset:** shuffle DP and GY together into a new DP, then draw 2. Only ⭐A may counter this mode.

When a card leaves a hand during a hand swap or reset, remove its Revealed-Until-Start marker. Cards entering the new hand are hidden unless this effect explicitly reveals them.

## ⦗BJ⦘ BLACK JOKER — Lockdown

**Points:** 11

When played for effect, choose one:

### 1. Board Lock

When Board Lock resolves:

- set Board Lock Counter to 2;
- record the current FT as its activation FT.

While active:

- no player may declare a non-counter effect play;
- no player may Scuttle;
- no player may place a Trap;
- Trap triggers are suppressed and do not trigger;
- Players may still Draw, use legal Swap Bar Actions, Play for Points, Pass, and declare legal counters;
- ordinary PR triggers, ER Start triggers, Voltage abilities, and non-Trap triggers remain active.

Do not reduce the counter at the end of the activation FT.

At the end of each following completed FT, reduce it by 1. Board Lock ends at 0.

Skipped turn slots do not tick it.

### 2. Exile Recycle — Scoring Rider

When BJ is successfully scored for Points, you may move up to 2 cards from Exile to DP, placing each on the top or bottom.

If this places at least one card into an empty DP while Exhausted is active, Exhausted ends immediately under Section 10.4.

If Exile is empty, the rider does nothing.

---

# PART VII — FIRST CONTACT

First Contact is the recommended learning format. It removes most advanced timing, suit, protection, and module systems while preserving Intrilex's central decisions: score, use effects, establish Guard, Scuttle, and race to a Goal.

## 27. First Contact — Introductory Rules *(Canonical §15)*

*Every empire starts with a single card.*

First Contact teaches Intrilex's basic turn, scoring, effect, Guard, and Scuttle systems. Use it for a player's first 1–3 games, then graduate toward Core.

### 15.1 Disabled Systems

First Contact disables:

- Swap Bar;
- Comboing;
- Supers;
- reserved 🌟 and ✨ classes;
- Ultras;
- Sudden Death;
- Aegis;
- Royal Shield;
- Exile;
- Revealed-Until-Start;
- every optional module;
- every suit-specific ability, enhancement, protection, and timing play.

Card suits still exist for identity and equal-rank Scuttle comparison.

### 15.2 Exile Replacement

Exile does not exist.

- any card that would enter Exile enters GY instead;
- any effect mode whose purpose is to access, recover, inspect, rummage, or recycle Exile is unavailable;
- if every mode of an effect requires Exile, that effect cannot be declared.

Do not redirect Exile access to the bottom of GY.

### 15.3 Simplified Rules

| Core system | First Contact |
|---|---|
| Goal | 15 |
| Mini-Turns | exactly 1 per completed FT |
| +Mini-Turn effects | ignored |
| Protection | Guard only |
| Tap | every tapped card untaps during its controller's Start maintenance |
| Hand reveal markers | ignored; cards entering hand are hidden |
| Effect profile | only generic rank effects explicitly enabled below |
| Win check | active player's End Phase |

The automatic Start untap intentionally weakens Nine. Core replaces it with source-specific Tap States.

### 15.4 Setup

1. Shuffle the 54-card deck into DP.
2. Player A receives 5 cards.
3. Player B receives 6 cards.
4. Player A goes first.
5. Each Goal is 15.
6. No Swap Bar or Exile zone is created.

### 15.5 Start Phase

1. reset the active player's per-FT state;
2. untap all cards they control atomically;
3. resolve legal ER Start triggers;
4. enter Action Phase.

Voltage Thresholds are disabled in First Contact unless a teaching session explicitly adds them later.

### 15.6 Actions

Take exactly one legal ordinary Action:

1. Draw;
2. Play for Points;
3. Play for Effect using an enabled generic rank effect;
4. Scuttle.

If Exhausted is active, DP is empty, and none of those Actions is legal, take the forced Exhausted Pass.

Draw & Cast is disabled.

### 15.7 First Contact Effect Profile

Generic rank text remains legal only when it does not depend on a disabled system.

Examples:

- generic 3 effects: enabled;
- generic 4 clear: enabled;
- generic 5 recycle: enabled, except Exile branches;
- generic 6 Dig: enabled;
- generic 7 effect and scoring trigger: enabled;
- 8 Scuttle Counter: enabled;
- 8 Aegis Field: disabled;
- generic 9 Tap and Goal Shift: enabled;
- Rank-10 suit effects: disabled;
- generic Jack Disrupt and PR Attachment: enabled;
- Queen ER Guard: enabled; Queen Aegis text disabled;
- generic King Counter and Anchor: enabled;
- Red Joker generic modes: enabled except any Exile implication;
- Black Joker may score for 11 or use Board Lock; its Exile Recycle rider is disabled.

Tournament organizers may publish a smaller explicit allowlist, but no suit-specific effect becomes legal.

### 15.8 Graduation Path

Introduce systems in this order:

1. suit-specific abilities and Supers;
2. Swap Bar;
3. full Mini-Turn economy;
4. Aegis, Royal Shield, and reveal markers;
5. Voltage Thresholds;
6. Comboing and Ultras;
7. optional modules.

---

# PART VIII — OPTIONAL GAME MODES

Optional modules are disabled unless the players or event enable them before setup. Write down the active module list before the game begins.

First Contact cannot be combined with optional modules unless a dedicated teaching variant explicitly says otherwise.

## 28. BattleRealm — Specs and Tournament Powers *(Canonical §17)*

BattleRealm grants each player one persistent combat specialization (**Spec**) for the match.

It is intended for experienced players, tournament formats, and simulation. It is disabled by default.

### 17.1 Global BattleRealm Rules

### Spec Selection

- Each player secretly chooses one Spec before the first Start Phase.
- Reveal all Specs simultaneously.
- A Spec cannot change during a game.
- Tournament format determines whether it stays locked across multiple games.

### Ability Limits

- Each Signature: 1 use per game unless its text gives another number.
- Each Ultimate: 1 use per game.
- Multi-use abilities track their own remaining uses.
- A declaration must be fully executable under Core and module rules.

### Absolute Restrictions

A Spec cannot:

- raise the 3-Mini-Turn hard cap;
- permit more than 1 Ultra per player per FT;
- permit more than 1 Rank-10 effect play per player per FT;
- override Exhausted's endgame;
- permanently suppress counters or protection;
- create a 🌟 or ✨ play without complete effect text.

In BattleRealm, no player's Goal may be reduced below 5.

If a Spec conflicts with an absolute restriction, ignore the conflicting instruction.

### Reserved Bonus Combines

The following concepts are preserved but **disabled** until their complete executable effects are designed:

- Bravery: three Clubs → 🌟;
- Balance: same-color J + Q + K → ✨;
- Brilliance: two Spades → 🌟.

They cannot be declared in ranked, physical, simulated, or digital play.

---

### 17.2 BRAVERY — Pressure / Aggression

### Signature — Courageous Assault

**Interrupt, 1× per game**

Perform a special Scuttle against one enemy OTT card that has no Aegis and is otherwise a legal card for this Signature:

- may target PR or ER;
- ignores rank, suit, Guard, and rank-based Scuttle immunity;
- does not bypass Aegis;
- is uncounterable;
- uses no source card.

Interrupt is only this Signature's timing permission. Courageous Assault creates no turn skip unless another effect explicitly says it does.

### Rank-3 Modification — Ruthless Read

After your rank-3 effect successfully steals a card from an opponent's hand:

1. that opponent reveals every remaining hand card except one of their choice until the end of the current FT;
2. if the stolen card was not ♠, that opponent discards 1 card of their choice;
3. declare one rank;
4. reveal the one hidden card;
5. if its rank matches, take it into your hand as Revealed-Until-Start.

### Nine Anchor Modification — Dangerous Leverage

When you place Nine as an Anchor:

1. reveal one opponent's hand;
2. take one card from it into your hand as Revealed-Until-Start instead of making that opponent discard;
3. set your Goal to the greater of:
   - your current Goal +5; or
   - that opponent's current Goal.

No additional discard occurs.

### Jack Modification — Hard Jack

Your PR Jack bonus is +2 instead of +1.

A host controlled through one of your Jacks cannot be Jacked again while your Attachment remains legal.

### Black Joker Modification

When you score BJ for Points, draw 1 after its Exile Recycle rider resolves.

### Ultimate — Iron Advance

**1× per game**

When you score 10♣, treat its pre-entry Secured PR total as 0 for its Foundation trigger, regardless of your actual total.

The resulting bonus-score trigger cannot be cancelled, redirected, or replaced by J Disrupt. This does not grant protection from an effect that explicitly counters triggered abilities.

---

### 17.3 BALANCE — Control / Stabilization

### Signature — Rejuvenation

**Interrupt, 1× per game**

Refill the Swap Bar toward its normal full capacity for the current player count.

- You may first Scrap up to 1 existing Swap Bar card.
- Add cards from the top of DP until capacity is reached or DP is empty.
- Choose each added card's face-up or face-down orientation.
- Until the end of your next completed FT, after you perform a Face-Down Swap, you may immediately take one face-up Swap Bar card without spending a Mini-Turn and without violating the normal one-use rule.

Interrupt is only this Signature's timing permission. Rejuvenation creates no turn skip unless another effect explicitly says it does.

### Five Modification

After one of your rank-5 effects resolves, draw 1 additional card from the bottom of GY if available.

### Six Modification

After one of your rank-6 draw effects resolves, if your hand contains fewer than 6 cards, draw from DP until you have 6 or DP is empty.

There is no general hand limit.

### ⭐4 Modification — Clean Exchange

Before exchanging the selected rows:

1. remove Aegis, Tap States, and other temporary modifiers from cards in those rows;
2. sever every Jack Attachment involving either selected row;
3. Scrap those Jacks;
4. return former hosts to their original owners' corresponding rows unless another resolving effect establishes control;
5. perform the row exchange;
6. grant the normal fresh ⭐4 Aegis after the exchange.

### Ultimate — Harmonized Mimic

**1× per game**

When 10♦ legally mimics ⭐6, keep 5 of the drawn cards instead of 4.

The play remains a Rank-10 effect, consumes the normal Rank-10 limit, and becomes Exile-Bound when it begins resolving.

---

### 17.4 BEAUTY — Variance / Fortune Sculpting

### Signature — Extra Lucky

**Quick; 3 uses per game; max 1 use per FT**

Immediately after you draw a card, you may Scrap that drawn card and redraw from the same source position when possible.

### 2 Quick Modification

The once-resolved-per-FT limit on your 2 Quick is removed.

- You may still have only one 2 Quick pending at a time.
- The opponent-discard rider occurs only on the first 2 Quick you resolve each FT.
- Later 2 Quicks that FT still score the 2 but do not force another discard.

### Five Modification

When a rank-5 effect rummages GY, you may choose any GY card unless that effect explicitly restricts its access to another zone.

### Seven Modification

For your rank-7 effects:

- every natural Seven is treated as ♠ while resolving effect text;
- whenever the effect would reveal cards from the top of DP, you may reveal the same number from the bottom instead;
- if at least one card revealed by that Seven is ♠, draw 1, maximum once per Seven resolution.

### Red Joker Modification

When resolving Red Joker Hand Swap, choose one:

- discard 2 cards after the swap; or
- gain +1 Mini-Turn this FT, still capped at 3.

If you cannot discard 2, you must choose the Mini-Turn branch.

### Ultimate — Chromatic Ten

**1× per game**

When declaring 10♥ for Points or effect, you may treat it as 10♣, 10♦, or 10♠ for that play's legal modes and instructions. Choosing 10♣ permits the Foundation scoring mode; choosing 10♦ or 10♠ permits their legal effect modes.

It remains the physical 10♥ for ownership and later identity checks, and remains subject to the Rank-10 limit and Exile-Bound.

### Beauty Royal Marriage

When you control an unattached King and Queen of the same suit OTT, the pair becomes a Beauty Marriage.

While the pair remains valid, add this continuous bonus to your Secured PR Points even if either card is in ER:

- ♣: +6
- ♦: +7
- ♥: +8
- ♠: +9

When a valid pair first forms, trigger the corresponding rider, maximum once per FT:

- ♣: draw 1;
- ♦: one opponent discards 1;
- ♥: gain +1 Mini-Turn, capped at 3;
- ♠: both cards gain Aegis until your recorded next Start Phase.

If the pair breaks, its continuous bonus ends. It must reform during a later FT to trigger again.

---

### 17.5 BRILLIANCE — Foresight / Punishment

### Signature — Mastermind

**Quick, 1× per game**

Privately inspect the top 5 cards of DP.

- Rearrange them in any order.
- Draw 2 total from the top and/or bottom of that inspected group.
- Return all remaining inspected cards to the top of DP in any order.
- You choose one opponent; that opponent may view one random card from the original inspected group that remains available.

If DP has fewer than 5 cards, use all available cards.

### Eight Modification — Overreach Punish

After one of your Eights resolves as a play, you may perform one special Scuttle against a Vulnerable enemy OTT card of higher rank.

- uses no Mini-Turn;
- ignores the normal PR-only restriction;
- does not bypass Guard or Aegis;
- uses no source card.

### Red Nine Modification — Goal Shock

A red Nine may be declared as an Interrupt:

- increase every enemy player's Goal by 7.

Interrupt is only this modification's timing permission. Goal Shock creates no turn skip unless another effect explicitly says it does.

### Queen Modification — Calculated Court

Your Queens add bonus Secured PR while OTT.

Recalculate continuously:

- if you control at least one Queen OTT, total bonus = number of Queens you control OTT +1;
- conceptually one Queen contributes +2 and every additional Queen contributes +1.

These bonuses apply even while Queens are in ER. Tapped Queens provide no Spec bonus because tapped cards have no active text.

### Passive — Counter Distortion

The first enemy J Disrupt that resolves against you each game is replaced:

- it does not restrict your Action type;
- instead, discard one Jack from your hand if able;
- the J controller still draws 1.

Mark this passive used after replacement, even if you had no Jack to discard.

---

## 29. Trap Module *(Canonical §19)*

The Trap Module adds face-down reactive cards to PR and ER.

It is disabled by default and may be enabled by mutual agreement or tournament rules.

### 19.1 Trap Identity

A Trap is a card placed face-down into your PR or ER.

- It is OTT.
- Its identity is hidden.
- It is not an Anchor.
- It has no active printed rank text until revealed as a Trap trigger.
- A face-down Trap in PR contributes 0 Points.
- A face-down Trap in ER contributes 0 Anchor value.
- Placement is not an ordinary stack item.

Any face-down card placed OTT under this module is a Trap unless another enabled rule explicitly defines a different face-down state.

### 19.2 Placement

Trap placement is a Quick declaration during your own FT.

1. choose PR or ER;
2. commit one hand card face-down;
3. open the Trap-placement declaration window;
4. if not intercepted, place it in the chosen row.

Trap placement:

- costs no Mini-Turn;
- cannot occur during Board Lock;
- can be intercepted only by text that explicitly counters or steals Trap placement;
- cannot occur during another atomic resolution.

### 19.3 Hard Limits

- maximum 2 Traps OTT per player;
- maximum 1 Trap trigger per player during each active FT;
- only one module-3 “No Thank You” Trap counter globally per FT;
- these limits cannot be bypassed.

A player cannot declare Trap placement while already controlling 2 Traps OTT.

### 19.4 Trigger Windows

#### Declaration Triggers

A Trap whose condition uses “plays,” “declares,” “attempts,” or names a pending Action triggers after that declaration is announced but before it resolves.

This includes all eight current named Traps.

For non-stack Actions:

- hold the Action as a pending declaration;
- place the Trap effect on the stack;
- after the Trap stack resolves, complete, replace, redirect, or cancel the Action as instructed.

#### After-Resolution Triggers

A future Trap using “after,” “successful,” “enters,” “leaves,” or a completed board-state condition triggers only after the current atomic resolution finishes and before the next Mini-Turn declaration.

#### Atomic Restriction

A Trap cannot trigger during:

- another effect's atomic resolution;
- an Ultra's internal resolution;
- a Combo's locked resolution;

unless its own text explicitly overrides that restriction.

### 19.5 Simultaneous and Missed Triggers

If several of one player's Traps qualify simultaneously:

- that player chooses one to reveal;
- all others remain face-down and do not trigger from that event.

If the owner fails to identify an optional trigger before the next game object is declared, the trigger is missed. Do not rewind.

Mandatory tournament triggers may use judge policy, but physical players remain responsible for their own hidden Traps.

### 19.6 Trap Resolution and Destination

When a Trap triggers:

1. reveal it;
2. place its Trap Effect on the stack;
3. it is Locked while resolving.

After its Trap Effect resolves or fizzles, Scrap the revealed Trap to GY unless its text explicitly keeps it OTT.

If a normal counter counters the Trap Effect, Scrap the revealed Trap to GY.

The module-3 “No Thank You” procedure is an explicit exception: that Trap remains OTT face-down and becomes Disabled.

### 19.7 Removal

- row and global clears affect Traps in the cleared row;
- Aegis on another card does not protect a Trap;
- a face-down Trap cannot normally be selected by identity-dependent text;
- Jack Trap-removal extensions apply as written below;
- removed Traps go to their normal destination, usually GY.

### 19.8 Module-3 Counter — “No Thank You”

Any non-Spade 3 may be declared as an Instant to counter one pending Trap trigger.

3♠ may instead intercept Trap placement as described in Section 19.11.

#### Disable Procedure

When a module-3 counter resolves against a Trap trigger:

1. negate that Trap Effect;
2. turn the Trap face-down again;
3. leave it in its current row;
4. place a public Disable Token on it.

While Disabled:

- it cannot trigger;
- it contributes 0 Points and 0 Anchor value;
- it cannot be targeted by single-target effects;
- zone-wide, global, and structural clears still affect it.

Remove the Disable Token at the end of the countering player's next completed FT.

#### Limit

Only one module-3 Trap counter may resolve globally during each FT.

A pending module-3 counter prevents another from being declared for the same global limit.

### 19.9 Specific Traps

When a card is placed as a Trap, the Trap text in this section is the text it uses when revealed. Its normal Core effect text applies only when it is played normally for effect.

#### 4♠ — Total Pressure

**Trigger:** an opponent declares a Super, defined 🌟/✨ play, or Ultra effect.

**Effect:** clear every card in that opponent's PR that this Trap can legally affect.

This does not affect ER.

#### 4♥ — Combo Breaker

**Trigger:** an opponent declares a Combo.

**Effect:**

1. counter and break the Combo;
2. send every non-initiating committed Combo card to GY;
3. convert the initiating card into a new Base-effect play under its original controller;
4. open a normal response window for that Base play.

This overrides the general no-partial-Combo rule only for the initiating card.

#### 4♦ — Anchor / Scuttle Response

**Trigger:** an opponent declares an Anchor Play or Scuttle.

Use the Trap's placement row:

- **Trap in PR:** counter that pending Anchor Play or Scuttle.
- **Trap in ER:** draw 2.

#### 4♣ — Engine Pressure

**Trigger:** an opponent declares Play for Points or another instruction that would score a card.

**Effect:** that opponent chooses one Anchor they control in ER; Scrap it.

If they control no legal Anchor, the effect resolves with no board impact. The pending score then continues.

#### 5♠ — Super Snare

**Trigger:** an opponent declares a Super, defined 🌟/✨ play, or Ultra effect.

**Effect:**

1. counter that Effect; 5♠ explicitly has authority to counter Ultras while Trap Module is enabled;
2. inspect the bottom 5 cards of DP, or all cards if fewer than 5;
3. take 1 inspected card into hand as Revealed-Until-Start;
4. return the others to the bottom in any order.

This is an explicit exception to the default rule that only ⭐A counters an Ultra.

#### 5♥ — Source Intercept

**Trigger:** an opponent declares an effect that will play or take a specific card from DP or the Swap Bar.

**Effect:** replace that card's recipient with you.

- If the card was to enter a hand, it enters your hand as Revealed-Until-Start.
- If it was to be played, you become the controller of that generated play and may choose new legal targets. Words such as “you,” “your,” and “opponent” now refer to you as the interceptor.
- If a Swap Bar exchange was part of the pending Action, take every card the effect explicitly identifies as involved; then cancel the opponent's exchange.

If replacement is impossible when resolving, this Trap fizzles.

#### 5♦ — Jacked Anchor

**Trigger:** an opponent declares a single-card Anchor Play.

**Effect:**

1. cancel and rewind that Anchor declaration;
2. the acting player must choose a different legal Mini-Turn Action if one exists;
3. if none exists, that Mini-Turn becomes Pass;
4. draw 1 from the top or bottom of DP or take one face-up Swap Bar card.

A card taken from Swap Bar through this effect does not consume your normal Swap Bar Use.

#### 5♣ — Jacked Points

**Trigger:** an opponent declares Play for Points.

**Effect:**

1. cancel and rewind that scoring declaration;
2. the acting player must choose a different legal Mini-Turn Action if one exists;
3. if none exists, that Mini-Turn becomes Pass;
4. draw 1 from the top or bottom of DP or take one face-up Swap Bar card.

If no legal alternative exists, the forced-action part becomes Pass rather than causing an illegal loop.

### 19.10 Countering Trap Effects

Because Trap Effects use the stack, any counter with legal authority may respond.

Module extensions:

- 3♥, 3♦, and 3♣ may use “No Thank You” against a Trap trigger.
- 3♠ may intercept Trap placement once per game per player.

#### 3♠ Trap Placement Intercept

When an opponent declares Trap placement:

1. counter that placement;
2. take the would-be Trap card into your control;
3. place it face-down as your Trap in the same legal row or another legal row you choose;
4. it retains its printed Trap identity for your future trigger;
5. respect your 2-Trap OTT cap.

If you cannot legally place it, the intercepted card goes to GY.

### 19.11 Jack Trap Extensions

While Trap Module is enabled, Jacks gain:

#### J♠

Scrap all opponent Traps OTT.

#### J♥

Scrap all opponent Traps OTT, then place J♥ face-up in ER as an Anchor.

While this J♥ remains untapped, face-up, and unattached, no player may place Traps.

#### J♦

Scrap all opponent Traps in ER.

#### J♣

Scrap all opponent Traps in PR.

These are module-specific effect modes, not Attachments unless their text explicitly says so.

### 19.12 Board Lock

During Board Lock:

- Trap placement is illegal;
- Trap triggers are suppressed rather than missed;
- existing Traps remain OTT;
- Disabled timers continue to use completed-FT timing.

When Board Lock ends, existing Traps may trigger only from new qualifying events.

### 19.13 Trap Judge Logic

Resolve Trap conflicts in this order:

1. specific Trap text;
2. Trap timing and limit rules;
3. enabled module interplay;
4. Core.

If a hidden Trap's trigger remains genuinely ambiguous after this order, it does not trigger.

## 30. Multiplayer — 3-Player FFA and 4-Player Teams *(Canonical §21)*

This module supports 3-player free-for-all and 4-player Teams.

Unless this section changes a rule, Core remains active.

### 21.1 Definitions

- **Ally:** your teammate in 4-player Teams.
- **Enemy:** any player not on your team.
- **Opponent:** in Multiplayer, an Enemy unless text explicitly includes Allies.
- **Team win:** when one teammate wins normally or through a timer, the team wins.
- **Turn order:** fixed clockwise order chosen at setup.

Hostile effects cannot target an Ally unless they explicitly allow it.

When singular text says “an opponent” and you have multiple Enemies, choose one Enemy at declaration. Text saying “all opponents” affects every Enemy.

### 21.2 Priority

When a stackable object is declared:

1. the next player in turn order receives priority;
2. continue in turn order;
3. when all players pass consecutively, resolve the top object;
4. place generated triggers;
5. resume priority after the resolving player's position.

Allies may respond with legal Free plays.

### 21.3 Swap Bar Scaling

| Players | Capacity | Face-down at setup | Face-up at setup |
|---:|---:|---:|---:|
| 2 | 3 | 2 | 1 |
| 3 | 4 | 2 | 2 |
| 4 | 5 | 3 | 2 |

Each player tracks their own once-per-FT Swap Bar Use.

Teammates act independently. No rule prohibits both teammates from using the shared Swap Bar during separate FTs.

### 21.4 Three-Player Free-for-All

#### Setup

- starting player: 5 cards;
- other players: 6 cards;
- Goal: 21 each;
- turn order proceeds clockwise.

#### Win

At the active player's End Phase, check only that player. The first legal winner wins immediately.

Sudden Death belongs to its individual activator. Exhausted compares each player's active Anchors, then Secured PR Points.

### 21.5 Four-Player Teams

#### Seating and Turn Order

Partners sit opposite.

Recommended order:

**A1 → B1 → A2 → B2**

#### Setup

- each player receives 5 cards;
- the team that lost the previous game chooses which teammate acts first;
- in the first game, determine first team randomly;
- each player has an individual Goal of 21 unless event rules say otherwise.

#### Normal Team Victory

At End Phase:

1. check only the active player's Secured PR against their Goal;
2. if they win, their team wins immediately;
3. do not check the Ally's board until the Ally's own End Phase.

A Goal change that resolves before End Phase affects that check normally.

#### Team Sudden Death

Track the individual activator. When its timer expires, that activator's team wins.

#### Team Exhausted

At Exhaust Counter 0:

1. compare each team's combined active, untapped Anchors;
2. if tied, compare combined Secured PR Points;
3. if tied, draw.

### 21.6 Team Card Interactions

#### 21.6A Seven Partner Grant

When your 7 or 7♠ effect would add a card to your hand, you may instead place it into your Ally's hand as Revealed-Until-Start for the Ally.

This does not bypass per-FT limits or change the controller of any child effect play.

#### 21.6B Nine Goal Isolation

A Nine Goal Shift affects one chosen enemy player only. It never automatically changes that enemy's Ally's Goal.

#### 21.6C 10♥ Partner Mini-Turn Grant

When resolving 10♥, choose one:

- gain +2 Mini-Turns this FT, capped at 3; or
- give your Ally +1 Mini-Turn at the start of their next actual Action Phase.

Only one pending partner Mini-Turn grant may exist per team.

A skipped Full Turn does not consume the grant. It waits for the Ally's next actual Action Phase.

#### 21.6D Partner Jacking

You may attach a Jack to your own eligible card to transfer its control to your Ally.

- PR Jack targets an eligible card in your PR.
- J♠ targets an eligible Anchor in your ER.
- Guard does not apply because this is not an enemy effect.
- Aegis still blocks the Attachment.
- Jack immunity still applies.
- Enemy players may respond normally.

The Ally controls the host. The initiating player controls the Jack Attachment.

If the relationship becomes illegal, sever the Jack; restore the host under the Attachment Validity rule unless another resolving effect established control.

#### 21.6E Partner Royal Marriage

A team may declare Royal Marriage using one matching card from each teammate's hand.

1. active player commits a King or Queen;
2. Ally immediately commits the matching opposite rank of the same suit;
3. both source cards form one stack item;
4. if the Ally cannot legally commit the matching card, the declaration is illegal;
5. on resolution, each card enters its committing player's ER unless the declaration states one shared controller and an event rule permits it.

For Core team play, each card remains controlled by the teammate who committed it. The pair still counts as one Team Royal Marriage for effects that recognize it.

The initiating player's play protections and counter checks govern declaration. Each Queen enters with Aegis under its own controller.

### 21.7 Per-Player Limits

Unless text says “per team,” track separately:

- Mini-Turns;
- Ultras;
- Rank-10 effects;
- Swap Bar Use;
- Trap count and triggers;
- Spec Signature and Ultimate;
- pending skips;
- Voltage eligibility.

Team aggregation never merges individual hands, PRs, ERs, Goals, or per-player limits.

## 31. Deffy Mode — Pregame Draft *(Canonical §24)*

Deffy Mode replaces normal starting-hand dealing.

Unless a sub-mode says otherwise, it is a 2-player module.

### 24.1 Target Hands

- Player A: 5 cards.
- Player B: 6 cards.

For Multiplayer, use Section 22.8 and the event's published target sizes.

### 24.2 Procedure

1. Shuffle the full legal deck into DP.
2. Determine starting player and turn order.
3. Create the chosen draft pool.
4. Alternate legal picks.
5. Resolve leftover pool cards.
6. Build Swap Bar from the top of remaining DP.
7. Begin Player A's Start Phase.

### 24.3 Core Draft Rules

- Shared pool unless the sub-mode creates private pools.
- Player A picks first.
- Player A's first pick cannot be face-down.
- Each player may take at most 2 face-down cards unless the sub-mode says otherwise.
- A drafted face-down card is viewed privately immediately.
- Stop when all players reach target size.

### 24.4 Pool Exhaustion

If the pool empties before targets are reached, deal 3 face-up DP cards into the pool. Repeat as needed.

### 24.5 Leftovers

Players jointly choose:

- shuffle leftovers into DP; or
- Scrap them to GY.

Without unanimous agreement, shuffle them into DP.

### 24.6 Sub-Modes

#### Classic Deffy

- 21-card pool;
- 16 face-up;
- 5 face-down.

#### ICU

- 12-card pool;
- all face-up.

#### Soda — 2 Players Only

Each player receives a private 8-card pool:

- 7 face-up;
- 1 face-down.

Each player:

1. drafts 4 from their own pool;
2. drafts 1 from the opponent's pool;
3. receives a final card chosen by that opponent from the player's original pool.

Each ends with 6.

#### Mystery Mix

- 14-card pool;
- 6 face-up;
- 8 face-down;
- no face-down maximum;
- each player must take at least 1 face-up card.

#### Deffy Moment

- display all legal deck cards face-up;
- alternate picks to target size;
- shuffle all unpicked cards into DP.

### 24.7 Add-Ons

#### Speed Run

Use a 5–10 second pick clock. On timeout, assign a random legal face-up pool card.

#### That's Urz

Players draft another player's eventual hand. In Multiplayer, each player drafts for the player to their left unless the event sheet states a different assignment. Assign completed hands after drafting.

#### Third-Partied

A neutral selector makes picks according to the event's public method.

#### Mirror Me

When a face-down card is drafted, reveal it publicly.

If another card of the same rank remains in DP:

1. search DP for one legal mirror;
2. add it face-up to the pool;
3. shuffle DP.

A Joker mirrors to the opposite Joker.

## 32. Time Bomb — Queen Fuse Module *(Canonical §25)*

When enabled, every Queen scored face-up into PR becomes a **Time Bomb**.

A Queen placed in ER remains an ordinary Queen Anchor.

### 25.1 Bomb State

Each Time Bomb records:

- suit;
- current Fuse Stage;
- current controller.

It remains a Queen and PR card.

- Tapping sets its current Point contribution to 0.
- Tapping does not stop Fuse advancement.
- A control change preserves Fuse Stage.
- If it leaves PR, remove its Time Bomb state.

### 25.2 Fuse Advancement

During the current controller's Start-trigger window, each Time Bomb creates a mandatory Fuse trigger.

When it resolves:

1. increase Fuse Stage by 1, up to that Bomb's Peak;
2. apply the effect of the resulting stage.

A Bomb already at Peak remains there and reapplies its Peak effect each time its Fuse trigger resolves.

The controller orders simultaneous Bomb triggers with their other Start triggers.

### 25.3 Bomb Tracks

#### Q♣

- Stage 1: value 2
- Stage 2: value 4
- Stage 3 Peak: value 7; take the newest and oldest GY cards into hand as Revealed-Until-Start

If GY has one card, take it once. If empty, take none.

#### Q♦

- Stage 1: value 2
- Stage 2: value 4
- Stage 3 Peak: value 7; the next enemy in turn order must use Draw as their first Action of their next actual FT

If the player reaches an Action Phase in which they are allowed to act but Draw is illegal, the requirement becomes Pass and expires.

A skipped Full Turn or skipped Action Phase does not consume the requirement; it waits for the next Action Phase in which that player may take an Action.

Only one pending Q♦ forced-Draw requirement may apply to a player; a new one replaces the old.

#### Q♥

- Stage 1: value −2
- Stage 2: value −4
- Stage 3 Peak: value −7; every enemy discards 1 card of their choice

Negative Point contribution reduces Secured PR Points.

#### Q♠

- Stage 1: value 3
- Stage 2: value 6
- Stage 3: value 9
- Stage 4: value 12
- Stage 5: value 15
- Stage 6 Peak: value 21

### 25.4 Defuse — Special Interrupt

Any player may declare Defuse during a response window targeting one legal Time Bomb.

Defuse respects Aegis and other applicable protection.

#### Declaration Cost

- Bomb at Peak: discard 1 card.
- Bomb below Peak: discard 2 cards.

You must have enough cards to pay the full discard cost. Pay it when declared. It is not refunded if Defuse is countered.

#### Penalty

Whether Defuse resolves or is countered, its controller gains one pending Action-Phase skip.

This is Defuse's explicitly printed Special Interrupt penalty. Ordinary Interrupts have no default penalty.

#### Resolution

If the target remains a legal Time Bomb, Scrap it to GY.

If it became illegal, Defuse fizzles; the Action-Phase skip still applies.

### 25.5 Action-Phase Skips

At the player's next actual Action Phase:

1. consume one pending Action-Phase skip;
2. create no Mini-Turns;
3. ignore pending Mini-Turn grants for that phase;
4. proceed to End Phase.

The player still receives Start Phase and End Phase.

Pending Action-Phase skips stack.

A Full-Turn skip does not consume an Action-Phase skip because no actual Action Phase occurred.

## 33. Tournament Seed *(Canonical §26)*

Tournament Seed creates standardized, lower-volatility starts.

It overrides normal hand dealing and Scuttle comparison.

### 26.1 Ban Pile

Before shuffling, remove:

- Black Joker
- 10♥
- 8♠
- 9♠
- 10♣
- Q♠
- J♠
- 4♠

Place them face-up in a Ban Pile outside the match.

Ban Pile cards:

- are not Exile;
- cannot be accessed, referenced, or returned;
- do not count toward deck or zone totals.

### 26.2 Disabled Systems

- Trap Module
- Time Bomb Mode
- Ultra counter-resistant GY draw riders
- reserved 🌟/✨ effects
- event-defined volatility icons

Other optional modules are disabled unless the tournament sheet explicitly approves them.

### 26.3 Starting Hands

Each player builds a 6-card starting hand by selecting:

1. one red Ace;
2. one 2;
3. one red rank 3–7 card;
4. one red face card;
5. one non-banned card from the event's published high-impact list, or any non-banned card if the event sheet publishes no such list;
6. one random card from DP after selections.

#### Selection Procedure

1. Higher tournament seed selects first for category 1.
2. Alternate selection priority by category.
3. Remove each selected card from DP immediately.
4. If both players want the same unique card, the player with priority keeps it.
5. The other player chooses a legal backup.
6. Each player must pre-register one high-impact backup.
7. Shuffle remaining DP thoroughly.
8. Deal each random sixth card.
9. Build Swap Bar normally.

### 26.4 Scuttle Modification

Replace Core rank-and-suit Scuttle comparison:

- Scuttle source rank must be strictly higher;
- suit is irrelevant;
- same-rank Scuttle is illegal.

Aegis, Scuttle immunity, ⭐8, 8♠, ownership, and all other Scuttle rules remain active unless the Tournament Seed ban or event sheet disables them.

## 34. Combining Modules *(Canonical §22)*

Event or match rules must list every enabled module before setup.

### 22.1 General Priority

When several enabled modules interact:

1. specific resolving effect;
2. this section's explicit interaction;
3. persistent Spec modifier;
4. specific module rules;
5. Core.

All applicable limits stack; the most restrictive legal limit controls.

### 22.2 First Contact

First Contact disables every optional module. It cannot be combined with BattleRealm, Traps, Multiplayer, Deffy Mode, Time Bomb, or Tournament Seed unless a teaching document explicitly creates a new variant.

### 22.3 BattleRealm + Traps

- A Spec modifies a Trap source card only when the Spec text is relevant to the Trap's actual trigger or resolution.
- A Trap trigger is a triggered ability, not the original card being “played.”
- Brilliance's “after an Eight resolves as a play” does not trigger from merely revealing an Eight as a Trap.
- Signature and Ultimate abilities cannot be placed as Traps.
- Reserved BattleRealm Bonus Combines remain disabled.
- J Trap-removal modes use the printed Jack's controller and any applicable Spec modifiers that explicitly modify that mode.

### 22.4 BattleRealm + Multiplayer

- Every player chooses a Spec independently.
- Teammates may choose the same Spec.
- “Opponent” in Spec text means Enemy.
- Bravery's Hard Jack applies only to Jacks controlled by the Bravery player.
- Beauty's Marriage continuous bonus belongs to the Beauty player whose valid pair satisfies the condition.
- A Partner Royal Marriage can satisfy Beauty Marriage only for a player who controls both qualifying cards, unless event rules explicitly define team-shared pair control.
- Brilliance's Counter Distortion tracks J Disrupt used against that player personally.
- Continuous Spec Points aggregate normally for Team Exhausted tiebreakers.

### 22.5 Traps + Multiplayer

- Trap caps and trigger limits are per player.
- Any enemy declaration may satisfy your Trap.
- Allies' Traps are independent.
- Priority follows multiplayer turn order.
- The global one-module-3-counter-per-FT limit remains global across all players.
- J♥ Trap lockdown prevents every player from placing Traps.
- A Disable Token expires at the end of the player who countered that Trap's next completed FT.

### 22.6 Time Bomb + Other Modules

#### Time Bomb + Traps

A Queen can be either:

- scored face-up as a Time Bomb; or
- placed face-down as a Trap.

It cannot be both simultaneously.

Trap and global clears remove Time Bombs normally when they can legally affect them.

#### Time Bomb + BattleRealm

- Brilliance Queen Point bonuses add separately to that Time Bomb's Secured PR Point contribution while it is OTT and controlled by the Brilliance player; they do not rewrite its printed Fuse Stage value.
- Beauty Marriage may use a face-up Time Bomb Queen if all pair conditions are met.
- A tapped Time Bomb contributes 0 despite Spec Point bonuses, but its Fuse still advances.
- A control change preserves Fuse Stage; future advancement occurs during the new controller's Start Phase.

#### Time Bomb + Multiplayer

- Fuse advancement occurs during the current controller's Start Phase.
- Q♦ Peak forces the next enemy in turn order to Draw first.
- Team victory still checks only the active player.

### 22.7 Deffy Mode + BattleRealm

- Complete Deffy drafting before Specs are revealed.
- Specs cannot influence card selection.
- “That's Urz” assignments occur before Spec reveal.

### 22.8 Deffy Mode + Multiplayer

- 3-player drafting proceeds in turn order.
- 4-player drafting follows A1 → B1 → A2 → B2.
- Soda is unavailable outside exactly 2 players.
- Multiplayer event rules must state target hand size before the draft.
- If not stated, use normal multiplayer setup hand sizes.

### 22.9 Deffy Mode + Traps

No Trap is placed during drafting. A drafted card may later become a Trap through normal gameplay.

### 22.10 Tournament Seed Compatibility

Tournament Seed overrides normal starting-hand and Scuttle setup and disables the modules named in Section 26.

Any module not explicitly compatible with Tournament Seed is disabled for that event.

### 22.11 Triple-Module Games

When three or more modules are active:

- resolve each explicit interaction above;
- apply every remaining legal limit;
- never infer an undefined 🌟 or ✨ effect;
- organizers should publish a module checklist and disabled-effect list.

---

# PART IX — RULINGS, TOURNAMENT PLAY, AND REFERENCE

These sections settle conflicts, define table conduct, and provide compact lookup tools. They do not replace complete card text.

## 35. Rule Precedence and Dispute Logic *(Canonical §18)*

When rules conflict, apply this order:

1. an explicit exception in the specific resolving card, ability, or module effect;
2. the enabled module rule specifically governing that interaction;
3. the rank's complete card text;
4. Core timing, protection, zone, and destination rules;
5. default destinations;
6. active player chooses only when all higher rules genuinely leave multiple legal outcomes.

A quick-reference table, FAQ example, flavor label, or simulation note never overrides complete rules text.

### 18.1 Specificity Limits

Specific text overrides only the rule it actually addresses.

Examples:

- “ignore rank restriction” does not imply “ignore Aegis”;
- “bypass Guard” does not imply “bypass Scuttle immunity”;
- “cannot be countered by Base Ace” does not imply “uncounterable.”

### 18.2 Module Priority

When multiple modules are enabled:

1. specific resolving module effect;
2. persistent BattleRealm Spec modifier;
3. Trap rules;
4. Time Bomb rules;
5. Deffy Mode pregame rules;
6. Multiplayer rules;
7. Core.

Absolute Core caps remain binding unless an enabled rule explicitly and legally overrides them.

### 18.3 Illegal or Incomplete Declarations

A declaration is illegal when it lacks:

- a defined effect;
- a complete recipe;
- a legal timing window;
- required source cards;
- a legal required target;
- required costs.

Reserved 🌟 and ✨ concepts without complete text cannot be declared.

### 18.4 Loop Prevention

A player cannot voluntarily repeat a deterministic sequence that returns the complete game state to the same state without advancing a counter, consuming a finite resource, changing hidden information, or creating a new legal branch.

The active player must choose a different legal line. Repeated no-state-change loops are illegal.

## 36. Interaction Matrices *(Canonical §16)*

This is a reference aid, not an independent rules source. Full card and Core text controls.

### 16.1 Counter Authority

| Pending item | Common legal counters |
|---|---|
| Ordinary effect play | Base Ace, Anchor Ace, A♠, ⭐A |
| Ordinary counter | Base Ace, Anchor Ace, A♠, ⭐A |
| Single-card Anchor Play | K; general Ace counters when legal |
| Single-card Goal-Mod Play | K; general Ace counters when legal |
| Eligible multi-card play | Base Ace when not protected, K♠, A♠, ⭐A |
| Royal Shield-protected multi-card play | K♠ or ⭐A |
| A♠ | ⭐A only |
| Ultra | ⭐A only unless explicit exception |
| Sudden Death activation | ⭐A only unless explicit exception |
| Scuttle | 8 Instant |
| Trap trigger | Trap-module 3 counter, Ace where legal |
| Trap placement | 3♠ Trap-module interception |

### 16.2 Protection Summary

| Protection | Blocks |
|---|---|
| Guard | enemy single-target Effects against other friendly OTT cards |
| Aegis | targeting and affecting by Actions, Effects, Scuttle, Attachments, and control changes |
| Royal Shield | Base Ace and Anchor Ace counters against the snapshotted protected play |
| Q♠ | non-total multi-target clears |

### 16.3 Selected Bypasses

| Interaction | Bypasses | Still respects |
|---|---|---|
| 4♠ | Guard, Aegis, Q♠, ordinary clear immunity | destination replacements |
| ⭐2 | Guard, ordinary control protection | Aegis |
| 8♠ Free Scuttle | rank and suit requirements | Aegis, Scuttle immunity |
| ⭐8 | rank, suit, ordinary Scuttle immunity | Aegis |
| K♠ | protection on eligible multi-card play as written | Ultra/Sudden exclusions |
| Rank-10 effect | Royal Shield | Aegis and other target rules unless copied effect bypasses |

### 16.4 Scuttle Reference

| Target | Ordinary Scuttle |
|---|---|
| A in PR | immune |
| 4 in PR | legal if rank/suit passes; its immunity is Effect-targeting only |
| 5 in PR | immune |
| 8 in PR | legal if rank/suit passes; its immunity is Effect-targeting only |
| RJ in PR | immune |
| Any Aegised PR card | illegal |
| Your currently controlled PR card | illegal |

⭐8 may Scuttle ordinary immune PR cards but remains blocked by Aegis.

### 16.5 Declaration vs Fizzle

| State | Result |
|---|---|
| target visibly illegal before declaration | rewind; source stays in prior zone; no cost |
| target becomes illegal after legal declaration | play fizzles; committed source uses failed-play destination |

### 16.6 Approximate Card Advantage

| Effect | Approximate net |
|---|---:|
| Draw Action | +1; +2 when hand was empty |
| 5 Recycle | variable |
| 6 Dig | +1 to +2 |
| 6♠ Deep Draw | variable by discard choice |
| ⭐6 | approximately +3 after source cost |
| 7 Base | one to hand plus one effect cast |
| 10♥ | +1 card plus tempo |
| RJ resets | variable |

## 37. Quick Reference *(Canonical §23)*

### Full Turn

```text
TURN SLOT
  Pending Full-Turn skip? → consume it; no FT occurs.

START PHASE
  1. Reset per-FT state
  2. If DP empty, begin Exhausted
  3. Capture Voltage Snapshot
  4. Expire Aegis/effects and resolve due untaps atomically
  5. Hide Revealed-Until-Start cards
  6. Queue and resolve Start + Voltage abilities
  7. Optional Face-Down Swap

ACTION PHASE
  1–3 Mini-Turns
  Draw | Face-Up Swap Draw | Play for Points |
  Play for Effect | Scuttle | Draw & Cast
  Exhausted Pass only when its forced condition applies

END PHASE
  1. Active-player victory
  2. Board Lock tick
  3. Sudden Death tick
  4. Exhausted tick; resolve the tiebreaker at 0
```

### Point Values

| Rank | PR Points | Notes |
|---|---:|---|
| A | 4 | Scuttle/Jack immune in PR |
| 2 | 2 | same-suit Wild for ranks 3–7; solo wild copy of same-suit rank 3–7 Base effect |
| 3 | 3 | |
| 4 | 4 | Effect-target immune in PR |
| 5 | 5 | Scuttle immune in PR |
| 6 | 6 | |
| 7 | 7 | scoring trigger |
| 8 | 8 | Effect-target immune in PR; still ordinarily Scuttleable |
| 9 | 9 | cannot receive Aegis |
| 10 | 10 | effect resolution creates Exile-Bound |
| J | 3 | |
| Q | 2 PR / 0 ER | ER Guard |
| K | 8 PR / 7 ER | K♠ Anchor value 9 |
| RJ | 5 | Scuttle/Jack immune in PR |
| BJ | 11 | |

### Scuttle Order

**A < 2 < 3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < RJ < BJ**

Equal standard rank: **♣ < ♦ < ♥ < ♠**

### Protection

```text
GUARD
  Enemy single-target Effects only.
  Does not block Scuttle.

AEGIS
  Blocks Actions, Effects, Scuttle, Jacking,
  targeting, affecting, and control changes.

ROYAL SHIELD
  Declaration snapshot.
  Blocks Base Ace and Anchor Ace.

Q♠
  Survives non-total multi-target clears.
```

### Core Caps

| Limit | Cap |
|---|---:|
| Mini-Turns | 3 per FT |
| Ultra | 1 per player per FT |
| Rank-10 effect | 1 per player per FT |
| Swap Bar Use | 1 per player per FT |
| Traps OTT | 2 per player |
| Trap trigger | 1 per player per active FT |

### Declaration Check

```text
Visible target already illegal?
  → rewind; source stays; no cost.

Target becomes illegal after legal declaration?
  → fizzle; source uses failed-play destination.
```

### Stack

1. Declare.
2. Check declaration Traps.
3. Pass priority in turn order.
4. Resolve top item atomically.
5. Queue generated triggers.
6. Put triggers on stack.
7. Repeat.

## 38. Glossary, Tournament Formats, and Common Questions *(Canonical §20)*

### 20.1 Glossary

- **Action:** one Mini-Turn choice: Draw, Face-Up Swap Bar Draw, Play for Points, Play for Effect, Scuttle, or Draw & Cast. Exhausted Pass is a special forced Mini-Turn Action available only under its exact Exhausted condition.
- **Affect:** change a card's state, zone, controller, value, Attachment, or legal relationship.
- **Aegis:** non-stacking hard immunity.
- **Ally:** teammate in 4-player Teams.
- **Anchor:** face-up ER card explicitly functioning as an Anchor.
- **Anchor Play:** a declared card play whose chosen mode places a source card into ER as an Anchor.
- **Attachment:** an ER card linked to a host card.
- **Clear:** move cards from a row to a stated destination.
- **Committed card:** source card placed On the Stack as part of a pending play.
- **Completed FT:** a Full Turn that reached and resolved End Phase. A skipped slot is not completed.
- **Controller:** player currently receiving a card's Points, text, triggers, or control rights.
- **DP:** Draw Pile.
- **ER:** Enduring Row.
- **Enemy:** player not on your team.
- **Exile-Bound:** persistent Rank-10 destination marker.
- **Fizzle:** legally declared play resolves without effect because a requirement became illegal.
- **FT:** Full Turn.
- **Goal-Mod Play:** declared card play whose chosen mode changes a Goal.
- **Guard:** Queen-based protection from enemy single-target Effects.
- **GY:** Graveyard.
- **Decline Response:** choosing no response despite having at least one lawful response. It is not an Action, spends no Mini-Turn, and creates no skip.
- **Automatic Priority Advance:** engine orchestration when the priority holder has no lawful response; no policy decision occurs.
- **Exhausted Pass:** the only gameplay Pass, forced only while Exhausted is active, DP is empty, and no other legal Mini-Turn Action exists.
- **Instant:** Free play during a legal response window.
- **Interrupt:** Free play during any legal response window, including another player's FT. It is a timing keyword only and carries no inherent skip penalty.
- **Jack / Jacked:** control relationship created by a Jack Attachment.
- **Locked:** unavailable to outside interaction during atomic resolution.
- **Mill:** move cards from top of DP to GY.
- **Mini-Turn:** one Action during Action Phase.
- **OTT:** every PR and ER.
- **Original owner:** player whose deck ownership the card began with.
- **On the Stack:** pending-play state for committed source cards.
- **PR:** Point Row.
- **Quick:** Free play during your own FT.
- **Remove:** leave the current row or relationship; defaults to Scrap if no destination is given.
- **Revealed-Until-Start:** hand card publicly visible until a recorded Start Phase.
- **Rummage:** choose a card from a permitted zone or range and move it as instructed.
- **Scrap:** send toward GY, subject to destination replacement.
- **Scuttle immunity:** rank-specific protection that prevents ordinary Scuttle. ⭐8 bypasses ordinary Scuttle immunity; 8♠ does not.
- **Scuttle:** Action using rank and suit to remove an enemy PR card.
- **Secured PR Points:** current scoring total from PR plus explicit outside-PR bonuses.
- **Structural operation:** whole-row or whole-game operation rather than individual targeting.
- **Tap State:** one current source and untap condition attached to a tapped card.
- **Target:** specifically chosen subject of an interaction.
- **Trigger queue:** abilities generated during resolution waiting to enter the stack.
- **Ultra:** official atomic multi-card effect class.
- **Vulnerable:** legal and unprotected relative to a specific interaction.
- **Voltage Snapshot:** Start Phase record determining Voltage eligibility for that FT.

### 20.2 Tournament Formats

#### A. Standard Match

- Best of 3.
- Core rules only unless event sheet says otherwise.
- 25-minute game clock.
- If external time expires after the active stack finishes:
  1. normal victory;
  2. higher Secured PR Points;
  3. active Anchors;
  4. draw.

#### B. BattleRealm Match

- Best of 3.
- Core + BattleRealm.
- Specs locked for the match unless event sheet permits switching.
- Reserved 🌟/✨ combines remain disabled.
- 30-minute game clock.

#### C. Full Module Match

- Best of 3 or 5.
- Event sheet must list every enabled module.
- Recommended clock: 35 minutes.
- Undefined or reserved module effects remain illegal.

#### D. Multiplayer Tournament

- 3-player free-for-all or 4-player Teams.
- Event sheet defines advancement and draw policy.
- Recommended clock: 40 minutes.

#### E. Chess Clock

A player's clock runs during:

- their Start and Action Phases;
- their own decision windows;
- their response priority.

Optional increment: +5 seconds per declared Mini-Turn Action.

A player whose personal clock reaches 0 loses unless tournament policy uses a shared team clock.

#### F. Conduct

- Keep every public zone and marker visible.
- State hand count truthfully when asked.
- Announce modes, targets, and source cards clearly.
- Do not conceal mandatory public state such as Disable Tokens, Tap States, or Aegis duration.
- Three slow-play warnings may become a game loss.
- Call a judge before revealing hidden information during a dispute.

### 20.3 Common Clarifications


#### What is the difference between Pass and declining priority?

Exhausted Pass is a forced Mini-Turn Action under the exact Exhausted condition. Declining priority is a response decision that costs no Mini-Turn and creates no skip.

#### Can a policy Pass during an ordinary Action Phase?

No. Ordinary Pass is not legal.

#### What happens when nobody has a legal response?

The engine advances priority automatically and closes the window when the closure condition is met. No policy no-op frame is created.

#### Does declining a response spend a Mini-Turn?

No.

#### Does Exhausted create the only legal gameplay Pass?

Yes, only when Exhausted is active, DP is empty, and no other legal Mini-Turn Action exists.

#### Can I counter my own play?

Yes, during a response window, if the counter is otherwise legal.

#### Can two players win simultaneously?

Normal victory is checked only for the active player during that player's End Phase. A global timer may produce a winner afterward.

#### What happens if a target is already protected?

If public protection makes it illegal, the play cannot be declared. If protection appears only after a legal declaration, revalidate and fizzle as required.

#### Does Guard block Scuttle?

No. Guard blocks enemy single-target Effects. Scuttle is an Action.

#### Does Aegis block friendly effects?

Yes, unless that interaction explicitly bypasses Aegis or says protection does not prevent its structural operation.

#### Can ⭐2 take a Jacked card?

Yes, if it has no Aegis. Revalidate and normally sever the existing Jack.

#### Can ⭐2 target the Jack itself?

Yes, if the Jack is a legal unprotected OTT target. Change its controller, then revalidate the host relationship.

#### Does 4♠ remove Traps?

Yes. Traps are OTT and 4♠ clears all OTT.

#### Does ordinary 4 clear Aegised cards?

No. Its zone-wide clear skips cards it cannot legally affect.

#### If an effect plays a Rank 10, when does Exile-Bound apply?

When that Rank-10 effect begins resolving. Countered-before-resolution Rank 10s go to GY.

#### Can Anchor Ace counter a Trap trigger?

Yes, when the Trap Effect is an eligible ordinary play and Royal Shield or another exception does not prevent it.

#### What happens to existing Aegis during ⭐4?

The row exchange occurs structurally. Then new Aegis replaces old Aegis using each card's post-exchange controller.

#### Can I Scuttle a card I Jacked?

No. You currently control it.

#### Does Board Lock suppress Trap triggers?

Yes. It also prohibits Trap placement, Scuttle, and non-counter effect plays.

#### Does a skipped Full Turn tick timers?

No. It is a skipped turn slot, not a completed FT.

#### Does a Full-Turn skip consume an Action-Phase skip?

No. An Action-Phase skip waits for the next actual Action Phase.

#### What distinguishes Quick from Interrupt?

Quick is playable only during your own FT at a legal timing window. Interrupt is playable during any legal response window, including during another player's FT. Neither keyword inherently spends a Mini-Turn or creates a skip.

#### Does an Interrupt inherently cost a turn?

No. Interrupt is a timing keyword only. It creates no skip unless the card, ability, or module explicitly prints one. In Core, 10♠ Stack Theft is the effect that explicitly creates Full-Turn skips.

#### Can 10♠ change targets?

Yes. It may preserve or replace legal targets, but cannot change the stolen play's mode or paid costs.

#### Do tapped cards count for Voltage?

No. Voltage uses current visible Point contribution at the snapshot.

#### Do face-down Traps count for Voltage?

No.

#### Does a Queen stolen by J♠ gain new entry Aegis?

No. Control changed without leaving and re-entering ER.

#### Can a triggered ability be countered by Base Ace?

Only if the Ace text or another enabled rule explicitly grants authority over that trigger. Base Ace normally counters effect plays and counters, not non-play triggers.

#### What does “owner” mean in older effect text?

Unless a rule explicitly checks original ownership, use **controller** for gameplay benefits and expiration grants. Original ownership remains relevant for Exile and Attachment restoration.

---

# PART X — PLAYER CHECKLIST

Before the first turn:

- [ ] Confirm player count and turn order.
- [ ] Confirm Goal and starting hand sizes.
- [ ] List every enabled optional module.
- [ ] Build the correct-size Swap Bar.
- [ ] Prepare visible markers for Aegis, Tap State, Revealed-Until-Start, Exile-Bound, pending skips, timers, Trap Disable, and Time Bomb Fuse if relevant.
- [ ] Confirm any tournament clock, ban pile, Spec, or draft procedure.

During play:

- [ ] Declare mode, source cards, costs, and targets before responses.
- [ ] Distinguish illegal declarations from later fizzles.
- [ ] Resolve the newest stack item first.
- [ ] Do not interrupt an effect after it begins resolving.
- [ ] Queue triggers created during resolution.
- [ ] Check Attachments immediately after state or control changes.
- [ ] Recalculate Secured PR Points after every relevant change.
- [ ] Process End Phase timers in the printed order.

## Canonical Source Note

This player edition is a usability layer over the canonical rules contract. Its purpose is to preserve all gameplay while replacing implementation-oriented organization with a table-first reading order. Where a future official canon update explicitly changes a rule, the newer official canon controls.
