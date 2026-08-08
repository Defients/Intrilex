# Build Proof — Intrilex Engine v4.1.5

## Environment

- Node: v22.16.0
- npm: 10.9.2
- TypeScript: 5.8.3, vendored and lockfile-pinned
- Python: 3.13.5
- Chromium: 144.0.7559.96
- Runtime dependencies: none

## Certified base

- Original ZIP SHA-256: `fa5609e11370d674e6e2f20042997901ce3f3cfadcbf642f7c273983d2cc1e0f`
- Original payload hash: `707377ea9fa94f449c293b6a4dcd8dc4b40dd058bcd6f9e5dd874339859cf168`
- Original conformance: 121/121
- Preserved aggregate: `05f67133eab3f8e92d526db17b25407842204e0eeea3a605bd417d0479805547`

## Patch gates

- `npm test`: 150/150
- `npm run conformance`: 121/121
- `npm run ci`: PASS through tests, conformance, judge, integration, simulation, independent Python replay verification, certification, and release validation
- `npm run test:browser-parity`: PASS in real Chromium main thread and Worker
- Trigger stress: 500/500 canonical terminations, zero engine rejections
- Dependency audit: performed during release freeze
