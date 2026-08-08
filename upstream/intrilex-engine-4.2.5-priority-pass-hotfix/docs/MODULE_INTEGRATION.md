# Phase 18 — Module Integration

The integration layer centralizes pair and multi-module configuration rather than scattering module checks through card handlers.

## Hard exclusions

- First Contact + any optional module: prohibited without a dedicated teaching override.
- Tournament Seed + Traps: prohibited.
- Tournament Seed + Time Bomb: prohibited.
- Tournament Seed + another optional module: requires explicit event approval.

## Explicit compatible combinations

BattleRealm, Traps, Multiplayer, Time Bomb, and Deffy Mode may combine under §22's specific interaction rules. Every relevant cap remains independently enforced; no module silently erases another module's ownership, visibility, targeting, scoring, or timing behavior.

The package contains a complete pair matrix and ten high-risk pair/triple/quad scenarios. The official Phase 18 regression gate reuses CT-001–005, CT-014, CT-017, CT-025, CT-089, CT-103–105, and CT-117–119.
