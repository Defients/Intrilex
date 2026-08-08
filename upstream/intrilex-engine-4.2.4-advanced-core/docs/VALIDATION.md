# Validation and Release Integrity

`npm run validate` checks:

- required source, fixture, documentation, canon, and report files;
- exact Phase 2–4, Phase 5, and Phase 6 fixture ID sets;
- runtime-valid initial states and unique fixture IDs;
- all fifteen rank definitions and exact Scuttle order;
- preserved earlier aggregate hashes;
- exact Phase 6 and combined aggregate hashes;
- complete authoritative/public replay pairs;
- the Phase 6 implementation-status record;
- engine and manifest version alignment.

It then hashes every payload file into `SHA256SUMS` and emits `MANIFEST.json` with an aggregate payload hash. Generated validation files and the manifest itself are excluded from self-reference.

The ZIP is created only after `npm run ci` passes. An adjacent `.sha256` file records the archive hash. The extracted archive is tested independently before delivery.
