# First Contact Private Choice Authority v4.1.4

## Authority objective

v4.1.4 adds the smallest engine-owned continuation system capable of resolving First Contact's generic private-choice effects without exposing hidden information or duplicating card consequences outside the certified transition boundary.

Canonical mutation remains:

```ts
const result = new IntrilexEngine().execute(state, command);
```

The autonomy bridge enumerates semantic choices and stores the corresponding command in a private decision-frame vault. It does not independently move cards, resolve effects, alter score, advance turns, resolve responses, or determine victory.

## Profile identity

```text
profileId: first-contact-private-choice
teachingOverrideId: AUTONOMY_PRIVATE_CHOICE_AUTHORITY_V1
players: 2
modules: none
```

The profile is a strict superset of `first-contact-response`. Existing priority, counter, Guard, Board Lock, scoring, endgame, and turn-lifecycle authority remains engine-owned.

## Sealed continuation contract

1. A root action is selected from an authorized legal-action frame.
2. The private command vault resolves its action ID to an engine command.
3. The root enters the existing response stack and resolves only after canonical priority closes.
4. When resolution requires a choice, the engine creates a `PrivateChoiceState` containing:
   - choice ID and kind;
   - controller and authorized chooser;
   - source card and stage;
   - legal option IDs and selection bounds;
   - a canonical options hash;
   - a sealed token bound to the complete decision frame.
5. Only the authorized chooser receives option identities through `privateStateView` and the private-choice action frame.
6. The policy selects a semantic action ID. The private vault submits the token and typed selection to `IntrilexEngine.execute`.
7. The engine revalidates actor, token, revision, stage, option membership, selection count, zones, and source availability.
8. Any mismatch rejects with the exact before-image and zero events.
9. A successful submission applies consequences through engine-owned resolvers and either closes the choice or opens the next sealed stage.

Tokens are authority proofs, not bearer secrets exported to policy or public telemetry.

## Supported private-choice families

### Rank 3 — Hand Raid

- **Present / take:** the opponent privately presents up to the legal count; the caster then receives a caster-only sealed choice over those presented cards.
- **Force discard:** the opponent chooses the required cards from their hand for discard.
- Every stage revalidates that selected cards remain in the expected hand.

### Rank 5 — Recycle

- The engine mills/resolves the root effect first.
- The caster receives a sealed authorized choice over the legal GY candidates.
- The selected card is revalidated in GY before engine-owned movement.

### Rank 6 — Dig

- Drawn cards are placed in an engine-owned sealed holding state.
- Only the caster can see their identities.
- The caster chooses a legal keep/return or keep-all/discard branch.
- Returned cards use deterministic engine-owned ordering; no hidden option or stable card ID enters public projections.

### Rank 7 — Topdeck Casting

- Revealed cards enter a sealed assignment choice.
- With two cards, the caster assigns one to hand and one to effect.
- The generated effect card becomes a genuine child stack declaration.
- Its normal response window opens; it may be countered or disrupted through v4.1.3 authority.
- Unsupported generated identities fail closed to the canonical destination rather than receiving fabricated semantics.

### Rank 9 — Anchor discard

- The affected opponent receives the sealed discard choice.
- Only cards still present in that opponent's hand may be selected.

## Visibility contract

### Public

- Hidden identities are `HIDDEN`.
- Unauthorized hidden card IDs are replaced by deterministic opaque handles.
- Option arrays, context, options hashes, tokens, and typed selections are absent or redacted.
- Authorized-only events expose only `{ redacted: true, visibility: "authorized" }`.

### Selected player

- A player sees their own hand and choice options only when they are the authorized chooser.
- Other players' hidden cards retain opaque handles and no stable private IDs.
- Choice metadata for a non-chooser contains only public stage, chooser/controller, source, option count, and `sealed: true`.

### Replays

Both legacy and certified-v2 public projections redact:

- private-choice tokens;
- selected card IDs and modes;
- hidden option identities and stable IDs;
- authoritative private events and state hashes.

Authorized replays retain canonical commands and hashes for judge verification.

## Edge-case closure

- A Draw whose pile empties during its response window canonically fizzles rather than causing orchestration rejection.
- Rank 3 Bounce immediately revalidates attachment graphs after moving a host.
- Seven generated effects revalidate the sealed card and descriptor before declaration.
- Exhausted resolution remains the canonical endgame for depleted non-winning matches; aborts are never converted to draws.

## Deliberate exclusions

v4.1.4 does **not** claim complete First Contact autonomy. The remaining base-profile gap is:

- Seven's scoring trigger: reveal up to two, privately take one, deterministically return the remainder, using the stack or trigger queue when scored inside another atomic effect.

Also excluded:

- suit-specific effects;
- Supers and Ultras;
- optional modules;
- three/four-player autonomous choice and priority;
- Core-only action systems.

## Required proof set

- every enumerated private-choice action is accepted from its exact decision frame;
- all eight private-choice kinds are exercised in deterministic campaign evidence;
- stale, tampered, malformed, and wrong-viewer commands exact-rewind with zero events;
- hidden canaries are absent from public state, events, legacy replay, and certified-v2 replay;
- Seven generated effect opens the normal child response stack;
- original 121 conformance fixtures preserve their certified aggregate;
- Node, Chromium main thread, and Chromium Worker produce identical replay and private-choice match hashes;
- a bounded 500-match cohort terminates canonically with zero engine rejections.
