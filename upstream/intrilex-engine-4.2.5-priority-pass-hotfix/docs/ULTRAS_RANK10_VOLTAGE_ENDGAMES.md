# Phase 8 — Ultras, Rank 10, Voltage, and Endgames

## Atomic Ultra executor

`RESOLVE_PHASE8_ACTION` accepts exact Ultra recipes only:

- **3 Black:** one declared Score role, one internal Cast role, and one Exile role. The three roles resolve atomically and open zero internal priority windows.
- **3 Red:** resolves against one pending eligible stack item with ⭐A-class authority, then performs its bottom-GY draw rider inside the same authoritative command.
- **2 Black + 2 Red:** grants +2 Mini-Turns while respecting the hard cap of 3, then executes the declared draw-two or Exile-rummage branch.

The player's one-Ultra-per-FT flag is consumed once the recipe is accepted. Invalid recipes, missing role assignments, or a previously consumed limit fail without mutation.

## Rank-10 containment

A Rank-10 effect receives Exile-Bound when resolution begins, not at declaration. The wrapper records the once-per-FT use before applying the requested post-resolution destination. Existing destination replacement then sends a would-be GY Ten to Exile. Royal Shield is not consulted for Rank-10 effect plays.

## Voltage snapshots

Voltage eligibility is captured from the active player's qualifying untapped PR at the Start checkpoint. The snapshot is immutable for that FT: later scoring, tapping, removal, or control changes do not change eligibility.

- rank 3 resolves Sleight from up to two top DP cards;
- rank 4 resolves Predictable with rank-correct precedence over suit-correct;
- rank 5 resolves Refinement through either the draw/discard/draw line or bottom-GY access.

Each rank may resolve at most once for that player during the captured FT.

## Endgame processor

The End Phase processor is strictly ordered:

1. active-player normal victory using raw signed Secured PR Points;
2. Board Lock tick/end;
3. Sudden Death tick and immediate winner short-circuit;
4. Exhausted tick and Anchor-first tiebreak.

Activation Full Turns do not tick their own Board Lock or Sudden Death timer. Exhausted begins only at a Start checkpoint with an empty DP and ends immediately when the DP is refilled. A winner produced by an earlier step ends processing; later timer state is untouched.

## State representation

Phase 8 runtime data is stored under `metadata.phase8` so older fixture state shapes and hashes remain unchanged. The shape is typed and owned by `phase8Runtime`; callers do not mutate it directly.
