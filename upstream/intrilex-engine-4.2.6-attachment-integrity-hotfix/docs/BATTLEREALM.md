# BattleRealm — Phase 12

## Scope

Phase 12 implements BattleRealm as bounded modifier data and reusable hooks over the certified Core engine. It does not clone rank handlers or create a separate BattleRealm reducer.

## Spec registry

Each player selects exactly one immutable Spec before the first Start Phase:

- **Bravery** — Courageous Assault, Iron Advance, pressure modifiers.
- **Balance** — Rejuvenation, Harmonized Mimic, stabilization modifiers.
- **Beauty** — Extra Lucky, Chromatic Ten, fortune and Marriage modifiers.
- **Brilliance** — Mastermind, Calculated Court, Goal Shock, Counter Distortion.

Selections are revealed simultaneously and cannot change during a match.

## Absolute constraints

BattleRealm never permits:

- more than three Mini-Turns in a Full Turn;
- more than one Ultra per player per Full Turn;
- more than one Rank-10 effect per player per Full Turn;
- a Goal below five;
- override of Exhausted;
- permanent suppression of protection or counters;
- a reserved 🌟 or ✨ combine without complete executable text.

## Continuous scoring

Calculated Court is a single derived controller-level contribution:

- zero qualifying Queens: `0`;
- one or more qualifying Queens: `queenCount + 1`.

It is added after each Queen's own signed contribution. It never mutates a Time Bomb's Fuse Stage or stage value. Tapped Queens and face-down Traps do not qualify.

Beauty Marriage is also derived. A valid unattached same-suit King and Queen pair contributes the canonical suit bonus while the pair remains legal.

## Finite use

Signature and Ultimate use is stored per player. Beauty Extra Lucky starts with three game uses and remains limited to one use per Full Turn. Other Signatures begin with one use. Rejected actions return the canonical before-image and create no event.

## Cross-module preservation

A lawful Source Intercept changes the generated play controller and rebinds controller-relative language without erasing applicable Spec modifier keys. Multiplayer priority remains unchanged.

## Gate

Phase 12 gate:

`CT-001–CT-003`, `CT-106–CT-110`, `CT-117–CT-118`.

The Phase 12 fixture file contains nine unique projections; `CT-109` is reused from the certified Phase 11 suite.
