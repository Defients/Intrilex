# Intrilex Engine v4.1.4 — Build Proof

## Toolchain

- Node.js: `v22.16.0`
- npm: `10.9.2`
- TypeScript: `5.8.3`, vendored and lockfile-pinned
- Python: `3.13.5`
- Chromium: `144.0.7559.96`
- Runtime dependencies: none

## Certified base identity

- Base release: `@intrilex/headless-engine` `4.1.0`
- Outer ZIP SHA-256: `fa5609e11370d674e6e2f20042997901ce3f3cfadcbf642f7c273983d2cc1e0f`
- Base payload files: `651`
- Base payload hash: `707377ea9fa94f449c293b6a4dcd8dc4b40dd058bcd6f9e5dd874339859cf168`
- Preserved conformance aggregate: `05f67133eab3f8e92d526db17b25407842204e0eeea3a605bd417d0479805547`

## Required build and verification commands

```bash
npm ci --offline
npm run build
npm test
npm run conformance
npm run test:browser-parity
npm run campaign:private-choice-cert
npm run patch:manifest:verify
```

## Evidence requirements

A release is valid only when:

1. the immutable private-choice manifest verifies read-only;
2. 144/144 engine tests pass;
3. 121/121 original conformance fixtures pass with the preserved aggregate;
4. the real Chromium main thread and Worker match Node hashes;
5. the 500-match segmented campaign covers all eight choice kinds with no rejection or safety abort;
6. public legacy and certified-v2 replay canary tests expose no private token, selection, identity, or stable hidden card ID;
7. the final deterministic ZIP hash matches its companion file;
8. the clean-extraction verifier repeats installation, tests, conformance, browser parity, manifest verification, and an operator-level private-choice match.
