# Intrilex v4.1.2 — Pass and Priority Canon Hotfix

**Authority:** Direct project-owner ruling, July 2026  
**Supersedes:** every older Action list, policy frame, UI label, telemetry field, or example that treated ordinary Pass or priority decline as the same gameplay Action.

## Governing ruling

1. **Ordinary Pass is not a generally available Mini-Turn Action.**
2. **Exhausted Pass** is the only gameplay Pass. It is a forced Mini-Turn Action only when Exhausted is active, the Draw Pile is empty, and the active player has no other legal Mini-Turn Action.
3. **Declining a response** is not an Action. It spends no Mini-Turn, creates no skip, and is offered only when at least one lawful response exists.
4. If a priority holder has no lawful response, the engine performs an **Automatic Priority Advance** without policy input.
5. A response window closes after the required consecutive decline/no-response condition. Older wording such as “both players pass priority” means that response opportunities were declined or unavailable; it never means either player took a Pass Action.
6. The v4.1.1 Interrupt hotfix remains governing: Interrupt is timing authority only. Only explicitly printed text creates a Full-Turn or Action-Phase skip.

## Canonical semantic identities

- `ACTION_EXHAUSTED_PASS` — the sole gameplay Pass.
- `DECLINE_RESPONSE` — a policy decision only when lawful responses exist.
- `AUTOMATIC_PRIORITY_ADVANCE` — engine orchestration when none exist.
- `RESPONSE_WINDOW_CLOSED` — engine transition allowing stack resolution.

Raw compatibility commands such as `PASS_PRIORITY` may remain inside the private engine boundary and historical replay protocol. They must not appear in policy APIs, ordinary UI narration, action metrics, or public analytics as Pass.

## Direct answers

**Can a player Pass during an ordinary Action Phase?** No.

**Does declining a response spend a Mini-Turn?** No.

**What happens when nobody has a legal response?** Priority advances and the window closes automatically without asking a policy to choose a no-op.

**Does Exhausted create the only legal gameplay Pass?** Yes, and only when its exact forced condition is satisfied.

**Does Interrupt cost a turn?** No. Stack Theft and Time Bomb Defuse retain only their separately printed penalties.
