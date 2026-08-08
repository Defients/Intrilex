# Phase 5 Lifecycle Services

## Exact Start references

Start-based state never stores a label such as `nextStart`. It stores:

```ts
interface StartEventRef {
  playerId: PlayerId;
  startSequence: number;
}
```

Changing controller does not rewrite the reference. Reapplying Aegis or a Tap State replaces the complete prior record.

## Aegis

New Aegis writes use `{ sourceRef, expiresAt }`. The Phase 2–4 boolean form remains readable only for frozen fixture compatibility. A new grant replaces the old source and expiration. Rank Nine rejects the grant. Structured Aegis expires only when its exact Start event occurs.

## Tap State

Tap State is a discriminated record:

- `nine-score`: releases when the card's **current controller** next scores;
- `start-phase`: releases at one exact future Start event;
- `explicit-event`: reserved for a named deterministic event;
- `manual-only`: does not auto-expire.

Applying another Tap State replaces the old record completely. Untapping removes both `tapped` and `tapState`.

## Revealed-Until-Start

Reveal visibility records one exact Start event. It expires at that event, survives unrelated Starts, and is deleted immediately when the card leaves hand. Later hand re-entry does not restore it.

## Played-for-Effect

The marker persists through controller changes and movement between PR and ER. It is deleted when the card leaves OTT.

## Exile-Bound

Exile-Bound is match-persistent. It survives every zone and controller change. Whenever its requested destination is GY, the movement service replaces GY with Exile. Other requested destinations are not changed.

## Deterministic cleanup order

At a Start event, cards are inspected by sorted instance ID. For each card, due Aegis, Start-based Tap, and Reveal state are cleaned in that order. Every cleanup emits an owned event containing the exact expiry reference.
