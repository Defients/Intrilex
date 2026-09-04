# Third-Party Notices

This file lists third-party software included in or used by Intrilex.

## Upstream Engine

### Intrilex Headless Engine

- Package: `@intrilex/headless-engine`
- Integrated authority version: `4.2.6` (attachment integrity hotfix)
- Governing rules: Intrilex `4.3.1`
- Original certified base retained separately: `4.1.0`
- Scope used by this Lab: bounded two-player `core-advanced-authority` and `core-unrestricted-authority`
- Upstream patch payload: `d787262e0a037439a89413e36361a58982a554556f692705dfe123c1693aaf75`

The Lab does not alter the manifest-bound upstream source. It rebuilds that source with the included locked TypeScript toolchain and routes every canonical gameplay mutation through the engine.

## Runtime Dependencies

| Package | Version | License |
|---------|---------|---------|
| @supabase/supabase-js | 2.112.2 | MIT |
| ws | ^8.21.3 | MIT |
| three | ^0.185.1 | MIT |

## Development Dependencies

| Package | Version | License |
|---------|---------|---------|
| @eslint/js | 9.39.5 | MIT |
| @types/node | ^26.2.0 | MIT |
| esbuild | 0.28.2 | MIT |
| eslint | 9.39.5 | MIT |
| form-data | ^4.0.6 | MIT |
| sharp | 0.35.4 | Apache 2.0 |
| typescript | 5.8.3 (vendored) | Apache 2.0 |

## Vendored Software

### TypeScript 5.8.3
- Source: https://www.typescriptlang.org/
- License: Apache 2.0
- Location: `vendor/toolchain/typescript-5.8.3/`
- See `vendor/toolchain/typescript-5.8.3/LICENSE.txt` for the full license text.

## Workspace Packages (Internal)

The following packages are part of the Intrilex monorepo and are not third-party:

- @intrilex/account-domain
- @intrilex/achievements
- @intrilex/analytics
- @intrilex/analytics-ai
- @intrilex/browser-crypto-shim
- @intrilex/decision-intelligence
- @intrilex/engine-adapter
- @intrilex/game-ai
- @intrilex/match-authority
- @intrilex/network-protocol
- @intrilex/policies
- @intrilex/policy-sdk
- @intrilex/replay-caster
- @intrilex/shared
- @intrilex/simulation-runtime
- @intrilex/statistics
- @intrilex/telemetry

## License

Intrilex is proprietary software. See the project repository for licensing details.
