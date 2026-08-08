# Intrilex v4.1 Final Release Validation

**Verdict: PASS**

| Check | Status | Detail |
|---|---|---|
| exists:README.md | PASS | 1163 bytes |
| exists:package.json | PASS | 2364 bytes |
| exists:tsconfig.json | PASS | 581 bytes |
| exists:src/engine.ts | PASS | 32682 bytes |
| exists:src/phase20.ts | PASS | 6782 bytes |
| exists:src/replay.ts | PASS | 2410 bytes |
| exists:src/phase16.ts | PASS | 9124 bytes |
| exists:src/phase17.ts | PASS | 6200 bytes |
| exists:src/phase18.ts | PASS | 7329 bytes |
| exists:src/simulation.ts | PASS | 12772 bytes |
| exists:src/certification.ts | PASS | 7686 bytes |
| exists:tools/independent_replay_verifier.py | PASS | 7351 bytes |
| exists:fixtures/phase16-rng-vectors.json | PASS | 1188 bytes |
| exists:fixtures/phase20-canonical-closure.json | PASS | 13440 bytes |
| exists:docs/INTRILEX_v4.1_COMPLETE_PLAYER_RULEBOOK.md | PASS | 115747 bytes |
| exists:canonical/INTRILEX_v4.1_COMPLETE_PLAYER_RULEBOOK.md | PASS | 115747 bytes |
| exists:docs/REPLAY_FORMAT.md | PASS | 922 bytes |
| exists:docs/JUDGE_TOOLS.md | PASS | 840 bytes |
| exists:docs/MODULE_INTEGRATION.md | PASS | 957 bytes |
| exists:docs/CANONICAL_FIXTURE_PROVENANCE.md | PASS | 1525 bytes |
| exists:docs/BALANCE_SIMULATION.md | PASS | 1756 bytes |
| exists:docs/FINAL_RELEASE_CERTIFICATION.md | PASS | 1557 bytes |
| exists:docs/ROADMAP_COMPLETION_STATUS.md | PASS | 1256 bytes |
| exists:canonical/INTRILEX_v4.1_CANON_LOCK.json | PASS | 2886 bytes |
| exists:canonical/IMPLEMENTATION_STATUS_PHASE_16.json | PASS | 714 bytes |
| exists:canonical/IMPLEMENTATION_STATUS_PHASE_17.json | PASS | 666 bytes |
| exists:canonical/IMPLEMENTATION_STATUS_PHASE_18.json | PASS | 816 bytes |
| exists:canonical/IMPLEMENTATION_STATUS_PHASE_19.json | PASS | 1051 bytes |
| exists:canonical/IMPLEMENTATION_STATUS_PHASE_20.json | PASS | 1029 bytes |
| exists:reports/conformance-report.json | PASS | 73378 bytes |
| exists:reports/phase2-18-regression-report.json | PASS | 70391 bytes |
| exists:reports/phase20-canonical-closure-report.json | PASS | 3292 bytes |
| exists:reports/phase16-replay-serialization-rng-report.json | PASS | 2715 bytes |
| exists:reports/phase17-judge-tools-report.json | PASS | 5812 bytes |
| exists:reports/phase18-integration-report.json | PASS | 9531 bytes |
| exists:reports/phase19-balance-simulation-report.json | PASS | 39109 bytes |
| exists:reports/independent-python-replay-verification.json | PASS | 420 bytes |
| exists:reports/final-release-certification.json | PASS | 1575 bytes |
| exists:reports/BUILD_PROOF.md | PASS | 973 bytes |
| exists:HOTFIX_NOTICE_v4.1.1_INTERRUPT_TIMING.md | PASS | 1059 bytes |
| exists:canonical/INTRILEX_v4.1.1_INTERRUPT_TIMING_HOTFIX.json | PASS | 666 bytes |
| package-rules-line-version | PASS | @intrilex/headless-engine@4.2.4; certified-base=4.1.0; rules-authority=4.1.1 |
| ci-gate-shape | PASS | npm run test && npm run conformance && npm run judge && npm run integration && npm run simulate && npm run verify:python && npm run certify && npm run validate |
| phase2-18-regression-preserved | PASS | fixtures=116; aggregate=e754dfc25e171bdd60a6d41025b42afd3e8120e0ae210c68b02d51d11bfeb211; engine=4.1.0 |
| final-conformance | PASS | fixtures=121; aggregate=8c91e8194e7fa3ab6bbb3eaa6946a97efd70343c36d5e5953ee8e1c0357013df; engine=4.1.0 |
| phase16-gate | PASS | fixtures=4; ids=CT-091,CT-109,CT-116,CT-120; aggregate=2c582b3e3cdfc60cb49605246c6ee4a77badaad8b6a887f4aca1daf3bbfd78c0 |
| phase17-gate | PASS | fixtures=9; ids=CT-005,CT-014,CT-022,CT-024,CT-031,CT-094,CT-097,CT-115,CT-120; aggregate=412dab8f92ec37d31c2063dffaf487ff17f2034c879a12d2591a248dee7e49e2 |
| phase18-gate | PASS | fixtures=15; ids=CT-001,CT-002,CT-003,CT-004,CT-005,CT-014,CT-017,CT-025,CT-089,CT-103,CT-104,CT-105,CT-117,CT-118,CT-119; aggregate=788dc0fa3af805d40c3ad27166a6bc6d9ec2f68d35dfba06d158677e06ae0b7d |
| phase20-gate | PASS | fixtures=5; ids=CT-013,CT-021,CT-023,CT-034,CT-035; aggregate=36ba5e9f83d3587b38e8d647af76fab532cec9bc7eb98e6d483df084f7952f5a |
| replay-corpus | PASS | legacy=121+121; certified=121+121; verified=121 |
| integration-matrix | PASS | 10/10; 962be61a6a7d044d65b64c4e0f705b0624ecb91f12642b310ebd9a3cb6c72d5d |
| phase19-simulation | PASS | scenarios=121; matches=10800; deterministic=true; campaign=1883275f3a68356c991217e29b610076313d95595cf2c26515ea44ea93e60fb3 |
| independent-python-runtime | PASS | runtime=Python 3.13.5; pairs=121; failures=0; aggregate=60fa842b90024a6d5f51eb7e114347eb024f7b7a6f34016a2f80a8c46de47da3 |
| final-certification | PASS | replays=121; fuzz=605; source=120/120; missing= |
| fixture-count | PASS | 121 executable fixtures |
| phase16-status-record | PASS | engine=4.1.0; status=complete; phases=[2,3,4,5,6,7,8,9,10,11,12,13,14,15,16] |
| phase17-status-record | PASS | engine=4.1.0; status=complete; phases=[2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17] |
| phase18-status-record | PASS | engine=4.1.0; status=complete; phases=[2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18] |
| phase19-status-record | PASS | engine=4.1.0; status=complete; phases=[2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19] |
| phase20-status-record | PASS | engine=4.1.0; status=complete; phases=[2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20] |
| manifest-generated | PASS | 973 payload files; 8b1e85354d77745d8c728ef2b29db0b502c9722ac843e652a4971e4668df4e0e |
