# Trap Module — Phase 10

## Scope

Phase 10 implements the hidden Trap substrate over the existing declaration, priority, lifecycle, interaction, and view services.

## Engine rules

- Trap placement is a Quick non-stack declaration.
- Any hand card may be placed face-down in PR or ER when the module is enabled.
- A player may control at most two face-down Traps OTT.
- Face-down Traps contribute zero Points and zero Anchor value.
- Public and enemy-private views redact face-down identities; the controller retains an authorized view.
- Declaration triggers are detected before a pending non-stack Action completes.
- Ineligible, Disabled, atomic-resolution, and Board-Lock-suppressed Traps do not reveal.
- One Trap trigger per player per active FT is tracked independently.
- Module-3 counters use a global pending/used guard, leave the Trap face-down, and attach a public Disable Token.
- Disable Tokens expire after the countering player's next completed Full Turn.

## Named behavior in the Phase 10 gate

- `4♠` revealed as a Trap uses Total Pressure and does not use Core Total Clear.
- `4♥` Combo Breaker observes only a legal defined Combo. Royal Marriage and undefined recipes do not qualify.
- `5♣` Jacked Points operates against a held pending scoring declaration and rewinds it before an alternative Action or Pass.
- `5♥` Source Intercept remains backed by the existing controller-rebinding transaction fixture.
- Revealing an Eight as a Trap is not an Eight resolving as a play.

## Fail-closed boundary

The service refuses unsupported trigger conditions rather than revealing a hidden card speculatively. Later module phases may extend the Trap registry without changing placement or view semantics.
