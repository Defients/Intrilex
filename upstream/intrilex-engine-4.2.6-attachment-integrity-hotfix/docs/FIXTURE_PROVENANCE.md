# Fixture Provenance and Collision Policy

## Rule

A conformance fixture has two identifiers:

- `id`: unique executable/replay namespace inside this package;
- `sourceTestId`: canonical upstream test identifier.

When an earlier certified release used an executable ID that later conflicts with the authoritative upstream artifact, the engine must not rewrite or delete the old replay. It creates a namespaced executable alias and records the upstream ID separately.

## Phase 15 collision

| Meaning | Executable ID | Canonical source ID | Status |
|---|---|---|---|
| historical Phase 7 counter projection | `CT-063` | historical local mapping | preserved byte-for-byte |
| official Tournament Seed configuration rejection | `CT-063@TOURNAMENT-SEED` | `CT-063` | current authoritative projection |

This is a provenance repair, not a rules amendment. Canonical rules and the current upstream test artifact control semantic meaning; the alias protects immutable release history.
