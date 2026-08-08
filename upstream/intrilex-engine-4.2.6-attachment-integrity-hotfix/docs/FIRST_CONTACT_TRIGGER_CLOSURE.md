# First Contact Trigger Closure Authority — v4.1.5

## Authority objective

Close Seven's scoring-trigger gap without duplicating game consequences outside the certified engine transition boundary.

## Canonical interpretation

The global Seven rule says a taken card enters hand as Revealed-Until-Start. First Contact §15.3 is the narrower profile rule: reveal markers are ignored and cards entering hand are hidden. Therefore the cards are public while revealed for the trigger choice, then the selected card becomes hidden when it enters hand.

## Lifecycle

1. `autonomy-score` moves Seven to PR and completes the Mini-Turn.
2. The engine appends a typed `first-contact-seven-scoring` entry to `triggerQueue`.
3. `advanceToDecision` emits the audited `autonomy-flush-trigger-queue` orchestration command.
4. The engine converts the queue entry into a `seven-scoring-trigger` stack item without moving the scored Seven out of PR.
5. Priority opens after the trigger controller.
6. Response enumeration offers Pass only. The trigger is neither an effect play, Scuttle, Anchor/Goal-Mod play, nor Mini-Turn Action declaration.
7. After all players pass, the engine reveals up to two DP cards into a public sealed choice pool.
8. The controller submits one token-bound selection.
9. The selected card enters hand hidden; the remainder returns to DP top.
10. Any older stack item regains priority; otherwise the turn continues from End.

## Safety properties

- Trigger source remains in PR and is referenced by typed payload, preventing duplicate zone ownership.
- Trigger queue flush is impossible while priority, stack, or another private choice is pending.
- Choice token binds kind, chooser, controller, source, revision, options hash, selection bounds, stage, and context.
- Wrong actor, stale token, unavailable card, duplicate selection, and malformed selection exact-rewind with zero events.
- Policies cannot inspect engine commands through authorized action views.
- Existing Base Ace, Eight, King, and Jack reducers reject the non-play trigger.
- Public projection reveals choice options only during the reveal window, then hides the selected hand card under First Contact §15.3.

## Complete First Contact statement

The versioned `first-contact-trigger-closure` profile contains the complete generic First Contact action/effect surface listed by §15.7: Three, Four, Five, Six, Seven effect and scoring trigger, Eight Scuttle Counter, Nine, Jack, Queen, King, Red Joker generic modes, Black Joker Board Lock, scoring, Draw, Scuttle, and Pass.

This does not enable systems First Contact explicitly disables: suit-specific text, Swap Bar, Combo, Supers, Ultras, Aegis, Royal Shield, Exile, optional modules, or multiplayer.
