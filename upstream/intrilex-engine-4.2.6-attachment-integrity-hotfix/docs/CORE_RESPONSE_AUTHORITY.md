# Intrilex Engine v4.2.2 — Core Response Authority

## Authority boundary

`core-response-authority` is a strict superset of `core-effect-declaration-authority`. Primary Mini-Turn Actions are declared as immutable engine-owned stack items. The next player receives priority, and only responses enumerated from the exact canonical decision frame may be selected.

Every state mutation occurs inside `IntrilexEngine.execute`. Policies see `actionId`, semantic family/mode, timing class, authorized source/target handles, public features, and an opaque command hash. The command vault remains private.

## Root declaration lifecycle

1. Validate the primary Action against the current canonical state.
2. Spend the Mini-Turn at declaration.
3. Move committed sources to `ON_STACK`.
4. Create a typed `CoreStackPayload` with the primary action, action type, and stack class.
5. Open priority to the next player.
6. After two consecutive passes, resolve the top item.
7. Reopen priority while stack items remain.
8. A countered root still consumes the Mini-Turn and enters End.

## Supported responses

| Response | Timing | Authority |
|---|---|---|
| Base Ace | Instant counter | Current eligible ordinary effect, Anchor, or counter |
| Anchor Ace | Instant counter | Opponent eligible play; sacrificed from ER; may recover one negated source |
| A♠ | Exile counter | Current eligible ordinary play/counter; negated sources go to Exile |
| Rank 8 | Scuttle Counter | Current pending ordinary or 8♠ Scuttle |
| King | Specialized counter | Current single-card Anchor play |
| Jack | Disrupt | Opponent current Mini-Turn Action; draws one and records its action type without negating it |
| Nine | Instant Tap | Legal opponent PR target |
| 8♠ | Instant Free Scuttle | Legal opponent PR target |
| Rank 8 | Quick Aegis Field | Controller's Full Turn / held priority |
| Queen | Quick Aegis | Friendly non-Nine OTT target, once resolved per Full Turn |

Counters can counter counters where their authority class allows. J Disrupt modifies the root but never removes it. Quick and Instant items resolve top-down through the same engine stack.

## Protection and lifecycle

- Guard, Aegis, rank immunity, Scuttle immunity, and Q♠ clear immunity remain distinct predicates.
- Board Lock continues to prohibit Scuttle and non-counter effect declarations.
- Scuttle and 8♠ Free Scuttle revalidate and sever Jack Attachment graphs before state validation.
- Nine Tap follows current controller and releases under canonical score timing.
- Aegis expiries retain exact Start-sequence ownership.

## Fail-closed exclusions

The profile does not enumerate private-choice effects, 2 Quick, 4 Natural Quick, 6 Swap Peek Quick, 9 Goal Shift, Rank 10 Interrupt, Supers, Ultras, Voltage, Royal Marriage, modules, or multiplayer. Their absence is machine-readable and tested.
