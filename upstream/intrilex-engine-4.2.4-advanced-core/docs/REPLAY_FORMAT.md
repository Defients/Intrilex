# Replay Format

Intrilex supports two replay envelopes.

## Version 1 — immutable legacy replay

Version 1 preserves the historical Phase 2–15 replay hashes. It contains the initial state, command stream, authoritative events, and initial/final/event hashes.

## Version 2 — certified replay

Version 2 is canonical-JSON encoded and adds one checkpoint per command:

- acceptance result;
- before/after revision;
- before/after state hash;
- event range and event-range hash;
- before/after serialized xorshift32 state.

The envelope includes event, checkpoint, RNG-trace, content, and integrity hashes. Verification rebuilds the entire envelope and rejects any mismatch.

## Public projection

Public certified replay includes only redacted public state, commands, events, and non-authoritative checkpoint ranges. It excludes private card identities, hidden choices, raw RNG state, and authoritative state hashes.
