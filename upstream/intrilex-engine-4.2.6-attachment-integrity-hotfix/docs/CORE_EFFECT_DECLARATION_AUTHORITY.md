# Intrilex Engine v4.2.1 — Core Effect Declaration Authority

## Constitutional boundary

`core-effect-declaration-authority` is a strict superset of `core-foundation-authority`. It adds only public, single-card Core effects whose complete modes and targets can be enumerated from the acting player's authorized state without opening a response window or hidden continuation.

Policies receive semantic actions. A private immutable command vault maps each selected action to `RESOLVE_CORE_AUTHORITY_ACTION`. All state changes occur inside `IntrilexEngine.execute`.

## Supported declarations

- **Ace:** Purge an Aegised card, bounce an enemy Anchor only when no Aegis exists, or enter ER as an Ace Anchor.
- **Three:** bounce one currently legal OTT target to the top of DP.
- **Four:** independently clear a chosen opponent row; 4♠ performs structural Total Clear.
- **Jack:** attach to a Vulnerable opponent PR card; J♠ may attach to a legal enemy Anchor in ER.
- **Queen:** enter ER with entry Aegis and provide Guard while untapped.
- **King:** enter ER with Anchor value 7, or 9 for K♠.
- **Red Joker:** Hand Swap, Self Reset, Opponent Attack, or Shuffle Reset.
- **Black Joker:** activate Board Lock for two following completed Full Turns.

## Protection and lifecycle

The candidate bridge evaluates Guard, Aegis, PR effect immunity, Q♠ clear immunity, row legality, Attachment legality, and Board Lock before exposing an action. Effects revalidate again inside the engine. Invalid declarations exact-rewind with zero events.

Board Lock removes non-counter effect plays and Scuttle while preserving Draw, Swap Bar, scoring, and Pass. Attachment graphs are revalidated immediately after bounce and clear operations.

## Explicit exclusions

Ranks 5, 6, and 7 ordinary effects; Nine Anchor discard; Quick, Instant, and Interrupt timing; response/counter chains; Supers; Rank 10; Voltage; Ultras; Royal Marriage; optional modules; multiplayer; and Teams remain unavailable in this profile.
