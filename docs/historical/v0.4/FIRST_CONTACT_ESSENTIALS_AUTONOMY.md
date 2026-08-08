# First Contact Essentials — Effects & Guard

## Status

`SUPPORTED` as an engine-owned historical regression profile in `@intrilex/headless-engine` `4.1.5`.

## Complete declared action surface

- Draw, Play for Points, Scuttle, Pass
- Four row clear over PR or ER
- Nine Tap
- Nine Goal Shift, including the declared discard-cost mode
- Jack PR control attachment
- Queen Guard anchor
- King anchor
- Red Joker hand swap, self reset, opponent attack, and shuffle reset modes
- Black Joker Board Lock
- Canonical Exhausted resolution and genuine draws
- Engine-owned turn progression and victory

## Fail-closed exclusions

- Rank 3 opponent choice
- Rank 5 post-mill choice
- Rank 6 private draw choice
- Rank 7 generated effect play
- Rank 8 Scuttle Counter
- Nine-anchor opponent discard choice
- Jack Disrupt response
- King Counter response
- Optional modules and multiplayer

Policies receive semantic action IDs only. Every consequence above is resolved inside the engine patch and accepted by `IntrilexEngine.execute`.
