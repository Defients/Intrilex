# Engine Adapter Contract

- The v4.2.5 source patch is rebuilt offline with locked TypeScript 5.8.3.
- Only `packages/engine-adapter` may import generated engine runtime modules.
- Policies receive authorized state projections and semantic actions, never raw engine commands.
- Raw command payloads remain in a private per-frame vault.
- All accepted actions execute through `IntrilexEngine.execute`.
- Public projections replace unauthorized hidden identities and stable card IDs with replay-scoped opaque handles.
- `core-advanced-authority` and `first-contact-trigger-closure` are explicit profile IDs. Unsupported profile combinations fail closed.
- Interrupt has no inherent tax under v4.1.2; only printed exceptions create skips.
