# Gate 0 — Artifact, Integrity, API, and Capability Reconnaissance

## Verdict

`PASS` for original artifact integrity and replay capability reconnaissance. The original v4.1.0 autonomy gap was later resolved for complete generic two-player First Contact by the separately certified v4.1.5 Trigger Closure authority patch; Core remains open.

## Verified identity

- Outer ZIP SHA-256: `fa5609e11370d674e6e2f20042997901ce3f3cfadcbf642f7c273983d2cc1e0f`
- Package: `@intrilex/headless-engine` `4.1.0`
- Rules: `4.1`
- Manifest files: `651`
- Payload hash: `707377ea9fa94f449c293b6a4dcd8dc4b40dd058bcd6f9e5dd874339859cf168`
- Archive entries: `667`; unsafe paths: `0`; links: `0`; conflicting duplicates: `0`
- Inner checksums: `651/651 PASS`

## Executed local evidence

Environment: Node `22.16.0`, npm `10.9.2`, global TypeScript `5.8.3`, Python `3.13.5`.

- Unit tests: `117/117 PASS`
- Conformance: `121/121 PASS`; aggregate `05f67133eab3f8e92d526db17b25407842204e0eeea3a605bd417d0479805547`
- Integration: `10/10 PASS`
- Release validation: `59/59 PASS`
- Certified replay pairs independently verified: `121/121 PASS`
- Final certification: replays `121`, fuzz probes `605`, source IDs `120/120`

The unmodified package CI succeeded only because `tsc` was globally available. The package has no dependency lock or declared TypeScript dependency.

## Engine boundary

`IntrilexEngine.execute(state, command)` is the canonical transition authority. Rejected commands return the unchanged before-image and zero events. The command union also exposes privileged primitives and caller-authored instruction arrays that are not safe policy inputs.

## Capability gap

No exported complete legal-action enumerator or complete match scheduler exists. `src/phase9.ts` describes First Contact allowed actions but does not implement Draw, Play-for-Points, Scuttle, Pass scheduling as a complete player-action bridge. `src/simulation.ts` implements those actions in a separate hand-written 54-card model rather than through `IntrilexEngine.execute`.

Therefore autonomous policy matches cannot be completed without duplicating rules/scheduling outside the certified authority. The Lab marks them `REPLAY_ONLY`/`BLOCKED` with `COMPLETE_LEGAL_ACTION_SURFACE_UNAVAILABLE`.


## Post-Gate resolution

The immutable certified 4.1.0 payload remains unchanged. The Lab now uses a separately hashed v4.1.5 authority patch for complete generic two-player First Contact. This does not retroactively alter Gate 0 facts about the supplied archive. See `reports/capability-manifest.json` and `reports/AUTONOMY_DETERMINISM_CERTIFICATION.md`.
