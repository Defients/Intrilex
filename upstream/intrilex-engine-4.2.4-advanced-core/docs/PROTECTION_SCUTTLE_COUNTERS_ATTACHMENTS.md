# Phase 7 Interaction Authority

## Protection evaluator

`evaluateProtection(state, actorId, targetCardId, profile)` evaluates independent predicates. It never collapses protection into one boolean rule.

- **Guard** applies only to hostile, single-target Effects and requires another untapped Queen in the target controller's ER.
- **Aegis** blocks both friendly and hostile Actions and Effects unless the interaction explicitly names an Aegis bypass.
- **Rank effect immunity** is distinct from Aegis and applies only in its printed scope.
- **Q♠ clear immunity** is a separate non-total multi-target clear predicate.
- **Scuttle immunity** is independent of rank and suit comparison.

Every interaction carries an explicit shape, channel, operation, and named bypass set. A bypass affects only its matching predicate.

## Scuttle profiles

- `ordinary`: checks enemy PR relation, Aegis, Scuttle immunity, rank, and suit.
- `free-eight-spade`: ignores rank and suit only; still checks Aegis and Scuttle immunity.
- `absolute-eight`: ignores rank, suit, and ordinary Scuttle immunity; still checks Aegis.

## Counter matrix

`evaluateCounterAuthority` separates source recipe from target authority.

- Base/Anchor Ace: ordinary eligible plays; Royal Shield blocks them.
- A♠: expanded ordinary authority and Exile destination; not A♠, Ultra, or Sudden Death.
- ⭐A: broad authority, subject to the defending two-Queen declaration check.
- K: single-card Anchor or Goal-Mod plays only.
- K♠: eligible multi-card plays and Royal Marriage; not Ultra or Sudden Death.
- 8 Instant: Scuttle only.

## Attachment graph

A canonical Jack Attachment is reciprocal:

- the Jack owns `attachmentGraph`;
- the host owns `attachedByJackId`;
- both share a controller;
- the host remains in the required row;
- the Jack remains in ER.

`revalidateAttachments` runs after relevant movement or control changes. An invalid graph is severed immediately. The Jack is Scrapped, bonuses and reciprocal markers are removed, and the host is restored unless the resolving operation explicitly established another destination or controller.

Runtime validation rejects any committed orphan, controller mismatch, wrong-row host, or non-Jack graph owner.
