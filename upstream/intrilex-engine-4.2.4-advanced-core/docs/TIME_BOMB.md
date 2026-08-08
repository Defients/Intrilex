# Time Bomb Service

## Scope

Phase 13 implements Time Bomb Mode as a module over the certified Core, lifecycle, BattleRealm, Trap, and Multiplayer services.

## Queen Bomb state

A suited Queen scored face-up into PR receives one structured marker:

```ts
interface TimeBombMarker {
  suit: "♣" | "♦" | "♥" | "♠";
  stage: number;
  peak: number;
}
```

The marker belongs to the card instance. Controller changes preserve it. Leaving PR removes it. A face-down Trap is never simultaneously a Time Bomb.

## Signed tracks

| Suit | Stage values |
|---|---|
| ♣ | 0, 2, 4, 7 |
| ♦ | 0, 2, 4, 7 |
| ♥ | 0, -2, -4, -7 |
| ♠ | 0, 3, 6, 9, 12, 15, 21 |

Fuse advancement is mandatory during the current controller's Start-trigger window. A tapped Bomb advances normally but contributes zero Points. A Peak Bomb remains at Peak and repeats its Peak effect on each later Fuse trigger.

## Peak effects

- **Q♣:** take the newest and oldest available GY cards into the controller's hand as Revealed-Until-Start. A singleton is taken once.
- **Q♦:** require the next Enemy in turn order to Draw as the first Action of their next actual Action Phase. If Draw is illegal, Pass is required. Skipped turns and skipped Action Phases do not consume the requirement.
- **Q♥:** every Enemy with cards in hand discards one recorded choice.
- **Q♠:** has no additional branch beyond its signed Point track.

## Defuse

Defuse is a Special Interrupt and requires a legal response window.

- below Peak: discard exactly two legal hand cards;
- at Peak: discard exactly one legal hand card;
- Aegis blocks the target;
- declaration cost is never refunded;
- whether Defuse resolves or is countered, its controller gains one pending Action-Phase skip;
- a legal resolution Scraps the Bomb;
- a resolution-time illegal target fizzles without removing the skip.

## Action-Phase skip

A pending Action-Phase skip is consumed only when that player reaches an actual Action Phase. It creates no Mini-Turns, ignores grants, and proceeds directly to End Phase. A Full-Turn skip does not consume it.

## BattleRealm arithmetic

Time Bomb stage value is Core signed contribution. Calculated Court is computed once afterward as a controller-level derived bonus. Court never mutates the Bomb stage or its track value.

## Determinism

Enemy discard choices, private GY retrieval facts, and every generated forced-Draw obligation are serialized in authoritative state/events. Public projections expose only information legally public at that point.
