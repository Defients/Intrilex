# Intrilex Engine v4.2.2 — Core Response Authority Certification

## Verdict

`PASS` for the declared `core-response-authority` scope.

## Constitutional boundary

- Canonical state transitions execute only through `IntrilexEngine.execute`.
- Policies receive semantic authorized actions, never raw `EngineCommand` objects or the command vault.
- Primary Mini-Turn Actions are sealed as typed stack roots before responses.
- Priority circulation, consecutive passes, response declaration, counter chains, stack resolution, fizzle handling, and Mini-Turn spending are engine-owned.
- Unsupported private-choice and advanced timing families fail closed.

## Executed evidence

- Engine tests: 168/168.
- Original certified conformance fixtures: 121/121.
- Preserved conformance aggregate: `05f67133eab3f8e92d526db17b25407842204e0eeea3a605bd417d0479805547`.
- Real Chromium replay parity: 121/121 in main thread and Web Worker.
- Browser replay aggregate: `f7cd65a7f766265c569ef10571923cee8f34d1b3da5418a69d27a145a95ae322`.
- Browser seeded response match final state: `5c929b3f7070970221e4e96500235c284dfe8d8af562956ab3bd4ba06f1ef6f8`.
- Stress campaign: 500/500 canonical terminations, zero engine rejections, zero unsupported configurations.
- Stress result hash: `162bd613d5df63180d288dd4a6ba229b59ef86d23a21bab47c29f128b5657cf2`.

## Stress coverage

| Declaration | Count |
|---|---:|
| Root Actions | 14,522 |
| Base Ace | 320 |
| Anchor Ace | 63 |
| A♠ Exile Counter | 118 |
| Eight Scuttle Counter | 42 |
| King Counter | 92 |
| Jack Disrupt | 627 |
| Nine Tap | 576 |
| 8♠ Free Scuttle | 58 |
| Eight Aegis Field | 572 |
| Queen Aegis Quick | 379 |

Terminations: 497 normal victories and 3 Exhausted resolutions.

## Adversarial proofs

- Every enumerated response is accepted from its exact decision frame.
- A response from the wrong priority holder exact-rewinds with zero events.
- Base Ace counter-on-counter chains preserve a surviving root Action.
- Jack Disrupt records action restrictions without negating the root.
- Guard, Aegis, rank protection, Board Lock, and specialized counter classes are evaluated before policy selection.
- Scuttle and 8♠ Free Scuttle sever invalid Jack Attachment graphs before state validation.
- Authorized action serialization contains no private command payload.

## Excluded systems

Private-choice Core effects, 2 Quick, 4 Natural Quick, 6 Swap Peek Quick, 9 Goal Shift, Rank 10 Interrupt, Supers, Ultras, Voltage, Royal Marriage, optional modules, and multiplayer are not certified by this profile.
