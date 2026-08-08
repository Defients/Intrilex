# Intrilex Engine v4.2.2 Build Proof

- Package: `@intrilex/headless-engine` 4.2.2
- Rules line: Intrilex 4.1
- Certified base: 4.1.0
- Runtime: Node.js >=22
- Locked compiler: vendored TypeScript 5.8.3
- Package manager lock: npm lockfile v3

## Executed gates

- `npm ci --offline --ignore-scripts`
- `npm test` — 168/168
- `npm run conformance` — 121/121, aggregate `05f67133…05547`
- `npm run ci` — inherited test, conformance, judge, integration, simulation, Python replay verification, certification, and release validation
- `npm run test:browser-parity` — 121 replays and one seeded response match in Chromium main thread and Web Worker
- 500-match deterministic stress corpus — zero rejections and zero aborts
- manifest generation followed by read-only manifest verification
- deterministic ZIP packaging executed twice with byte-identical output
- clean extraction into separate immutable and disposable execution trees

## Authority guarantees

- No policy receives raw commands or mutation helpers.
- Every primary and response consequence executes inside `IntrilexEngine.execute`.
- Rejected response commands preserve the exact before-image and emit zero events.
- Original certified conformance evidence remains unchanged.
