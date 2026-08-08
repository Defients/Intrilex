# Determinism Certification

## Original replay corpus

The 121 original certified authorized replay envelopes verify identically in Node, Chromium main thread, and Chromium Worker.

- Browser/Node replay proof: `f7cd65a7f766265c569ef10571923cee8f34d1b3da5418a69d27a145a95ae322`
- Original conformance aggregate: `05f67133eab3f8e92d526db17b25407842204e0eeea3a605bd417d0479805547`

## Complete First Contact autonomous campaign

The same 10,000-match semantic experiment was executed at worker counts 1, 2, and 4 plus a clean four-worker rerun. Global ordinals, seed derivation, canonical merge order, and every match-result hash remained identical across deterministic 100-ordinal segments.

- Profile: `first-contact-trigger-closure`
- Experiment: `17f2c4026369d53545e6fcb602c1f4ad1f905a37d4ddea74d001780ac59d050a`
- Canonical result: `ca19a170be8a0848d3171cc1424c33125e95b74f3344565ebc1d1e58cd98caaf`
- Aggregate: `78fe48cc9bfed11e7969e9ad23e8327c8684cfa2d904c720bf07bc71b862a8cb`
- Complete matches per execution: **10,000**
- Aborts per execution: **0**
- Worker-count and clean-rerun parity: **PASS**

## Build determinism

See `reports/build-determinism.json`. The final release gate rebuilds production output twice and requires byte-identical `dist` and sample-data tree hashes.
