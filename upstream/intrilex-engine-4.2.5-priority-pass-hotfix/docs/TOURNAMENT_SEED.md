# Tournament Seed — Phase 15

## Scope

Tournament Seed is a deterministic Setup profile over the same Intrilex engine. It replaces normal hand dealing and Core rank-and-suit Scuttle comparison without creating a second gameplay kernel.

## Ban Pile

The exact public Ban Pile is:

`BJ`, `10♥`, `8♠`, `9♠`, `10♣`, `Q♠`, `J♠`, `4♠`.

The compatibility representation moves those instances to `VOID` and records their ordered IDs under `metadata.phase15.banPileCardIds`. Each card carries `tournamentSeedBanPile: true`. This keeps the Phase 2–14 serialized state schema unchanged while ensuring banned cards appear in no gameplay zone, Exile calculation, deck total, or access procedure.

## Starting-hand categories

Each player receives six cards:

1. one red Ace;
2. one 2;
3. one red rank 3–7 card;
4. one red face card;
5. one card from the active High-Impact Pool;
6. one serialized-random card after selections.

Selections for categories 1–4 move the chosen physical card from DP to the player's hand immediately. Category priority rotates from the recorded tournament seed order.

## Canonical High-Impact Pool

`A♣`, `A♠`, `3♠`, `5♠`, `6♠`, `7♠`, `8♥`, `9♥`, `10♦`, `10♠`, `Q♣`, `K♣`, `K♠`.

An alternate published pool must contain exact unique legal identities, exclude Ban Pile cards, avoid category 1–4 identities, and provide at least three distinct identities per player.

Before category 5 resolves, each player supplies at least three ranked identities. Rankings reveal simultaneously. Category priority assigns each player's highest-ranked remaining legal identity. If an entire ranking is exhausted, the command must include three new legal fallback rankings; otherwise the transaction fails without mutation.

## Finalization

After categories 1–5:

1. shuffle remaining DP using serialized `xorshift32` state;
2. deal one random sixth card to each player in seed order;
3. build the normal player-count-scaled Swap Bar;
4. record exact RNG cursor movement and all physical assignments.

## Configuration boundary

Trap and Time Bomb remain disabled even if an event sheet attempts to approve them. Other optional modules require an exact event-sheet ID and explicit approval. Reserved advanced classes and the Ultra counter-resistant GY rider remain disabled.

## Tournament Seed Scuttle

- source rank must be strictly higher;
- suit is irrelevant;
- same-rank Scuttle is illegal;
- Aegis, ordinary Scuttle immunity, ownership, and target-zone rules remain active.

## Fixture provenance

The historical Phase 7 executable corpus already used the local ID `CT-063` for a counter-authority projection. The official v4.1 artifact maps `CT-063` to Tournament Seed configuration rejection. This release preserves the historical file and hashes, and executes the official source case as:

`CT-063@TOURNAMENT-SEED` with `sourceTestId: CT-063`.

The alias is explicit in fixtures, runtime metadata, reports, and the Phase 15 status record. No earlier replay is overwritten.
