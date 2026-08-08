# Deffy Mode — Phase 14

## Authority boundary

Deffy Mode replaces normal starting-hand dealing. It is a deterministic setup reducer and never uses the gameplay Stack, priority windows, Mini-Turns, or Trap placement.

## Runtime state

`metadata.phase14` records:

- selected sub-mode and status;
- target hand size per player;
- ordered drafters and assignment permutation;
- public/hidden orientation per pool card;
- drafted card IDs per recipient;
- face-up and face-down pick counters;
- enabled add-ons;
- serialized RNG audit entries;
- whether BattleRealm Specs may now be revealed.

Pool cards occupy `STAGING` only while `phase14.status === "drafting"`. Runtime validation rejects any other orphaned staging state.

## Canonical sub-modes

| Mode | Pool |
|---|---|
| Classic 21 | 16 face-up + 5 face-down |
| ICU | 12 face-up |
| Soda | two private eight-card pools; exactly two players; six-card targets |
| Mystery Mix | 6 face-up + 8 face-down; each drafter must take at least one face-up card |
| Deffy Moment | every legal DP card face-up |

## Pick legality

- the first drafter's first pick cannot be face-down;
- ordinary modes allow at most two face-down picks per drafter;
- players that reach their recipient's target are skipped;
- every recipient must finish at the exact configured target size;
- a failed pick returns the canonical before-image and emits no event.

## Add-ons

- **Speed Run:** timeout selection uses serialized xorshift RNG and only legal face-up cards.
- **That's Urz:** the default assignment is the next player in turn order; any override must be self-free and bijective.
- **Third-Partied:** retained as configuration state for later integration procedures.
- **Mirror Me:** a hidden pick is revealed, one legal same-rank mirror is moved from DP to the pool face-up, and the remaining DP is deterministically shuffled. Jokers mirror the opposite Joker.

## Leftovers and refill

An empty pool refills with up to three face-up cards from the top of DP. At completion, leftovers return to DP through deterministic shuffle unless all players unanimously choose Scrap.

## Module boundaries

BattleRealm selections occur only after drafting. Trap placement is gameplay-only. A drafted Queen has no Time Bomb state until it is later scored face-up into PR.
