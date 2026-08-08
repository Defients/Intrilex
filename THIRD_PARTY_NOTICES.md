# Third-Party and Upstream Notices

## Intrilex Headless Engine

- Package: `@intrilex/headless-engine`
- Integrated authority version: `4.2.4`
- Governing rules: Intrilex `4.1.1`
- Original certified base retained separately: `4.1.0`
- Scope used by this Lab: bounded two-player `core-advanced-authority`
- Upstream patch payload: `d1139ecf15cff2496dd134de5c9908b465b21563d067a208cf3c38befbdc5000`

The Lab does not alter the manifest-bound upstream source. It rebuilds that source with the included locked TypeScript toolchain and routes every canonical gameplay mutation through the engine.

## TypeScript

- Version: `5.8.3`
- Included as a locked local build dependency for offline reproducibility.
