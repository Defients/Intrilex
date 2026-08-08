# Intrilex v4.1 Final Headless Engine Certification

## Release class

`@intrilex/headless-engine` **4.1.0** is the stable certified headless-engine release for Roadmap Phases 2–20.

## Required gates

- Complete canon-locked source coverage: **120/120**
- Executable fixture corpus: **121**
- Deterministic repetitions: **7 per fixture**
- Certified authorized replay pairs: **121**
- Certified public replay pairs: **121**
- Invalid-command invariant probes: **605**
- Public hidden-information leaks: **0**
- Independent Python replay verification: **121/121**
- Full-match Phase 19 campaign: **10,800 matches**, deterministic rerun match
- Clean extracted archive CI: required before publication

## Preserved history

The stable release retains the Phase 2–18 gameplay aggregate:

`994faf051dfa9441dd6511d360caa79a8b534b9db90908055e9692d6952f896a`

The five source-closure fixtures are additive. They do not rewrite the historical 116-fixture corpus.

## Final corpus

Final conformance aggregate:

`05f67133eab3f8e92d526db17b25407842204e0eeea3a605bd417d0479805547`

## Independent runtime meaning

The Python verifier independently implements canonical JSON hashing, replay-envelope integrity, checkpoint range hashing, event hash-chain continuity, RNG trace commitments, and public replay hashes. It shares no TypeScript runtime code.

It is not presented as a second gameplay implementation. Gameplay semantics remain certified through exact TypeScript command replay, conformance fixtures, invariant validation, and clean extracted-package CI.
