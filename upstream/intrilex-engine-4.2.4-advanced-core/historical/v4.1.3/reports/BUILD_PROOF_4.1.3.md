# Intrilex Engine v4.1.3 Build Proof

- Runtime: Node.js >=22
- Compiler: locked local TypeScript 5.8.3 file dependency
- Install: `npm ci --offline`
- Build: `npm run build`
- Tests: `npm test`
- Conformance: `npm run conformance`
- Browser authority: `npm run test:browser-parity`
- Manifest verification: `npm run patch:manifest:verify`

The certified v4.1.0 payload identity is preserved in `BASE_MANIFEST_4.1.0.json` and `BASE_SHA256SUMS_4.1.0`. v4.1.3 is an explicit derivative authority surface with its own immutable patch manifest; it is not represented as byte-equivalent to v4.1.0.
