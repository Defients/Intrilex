# Phase 17 — Physical and Judge Tools

The judge layer is observational. It never changes gameplay outcomes.

## Tools

- `buildJudgePacket(state, viewers?)` produces a public state hash, marker checklist, timers, pending-object counts, and optional authorized viewer states.
- `deriveJudgeMarkerChecklist(state)` lists Aegis, Tap, Exile-Bound, Jack, Trap Disable, and Time Bomb markers while redacting face-down Trap identities.
- `classifyJudgeOutcome(command, result)` distinguishes illegal declaration, countered object, fizzle, resolved command, and no-op.
- `explainIllegalVsFizzle(...)` states rollback and source-destination consequences.
- `renderPrintableStateAid(state)` produces table-ready Markdown.

The official Phase 17 gate is evaluated against CT-005, CT-014, CT-022, CT-024, CT-031, CT-094, CT-097, CT-115, and CT-120.
