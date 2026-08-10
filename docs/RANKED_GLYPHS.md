# Ranked Glyphs — Canonical Visual Vocabulary

This document defines the canonical Ranked tier glyph system for Intrilex. It
is the authoritative reference for the visual ladder, asset locations,
division behavior, and usage rules. It protects the visual system from future
drift.

## Visual Ladder

```
UNRANKED      (placement period — no earned glyph)

INITIATE      fragment
CIPHER        pattern
WARDEN        structure / shield
VANGUARD      weapon / forward motion
ASCENDANT     expansion / ascent
PARAGON       royal perfection
SOVEREIGN     supremacy / throne
INTRILEX      completed transcendent glyph (apex)
```

The hierarchy is: **fragment → pattern → structure → weapon → ascent →
perfection → supremacy → transcendence**.

## Canonical Assets

The 8 canonical glyphs are 1024×1024 RGBA PNGs with transparent backgrounds.
They are the **canonical immutable source artwork** — never repaint, recolor,
crop destructively, flatten onto a background, or overwrite the masters.

| Tier       | Master file                  | Production filename |
|------------|------------------------------|---------------------|
| Initiate   | `ranked-glyphs/initiate.png`   | `initiate.png`      |
| Cipher     | `ranked-glyphs/cipher.png`     | `cipher.png`        |
| Warden     | `ranked-glyphs/warden.png`     | `warden.png`        |
| Vanguard   | `ranked-glyphs/vanguard.png`   | `vanguard.png`      |
| Ascendant  | `ranked-glyphs/ascendant.png`  | `ascendant.png`     |
| Paragon    | `ranked-glyphs/paragon.png`    | `paragon.png`       |
| Sovereign  | `ranked-glyphs/sovereign.png`  | `sovereign.png`     |
| Intrilex   | `ranked-glyphs/intrilex.png`   | `intrilex.png`      |

The upper three (PARAGON, SOVEREIGN, INTRILEX) contain the approved
differentiation patch and **must never be swapped**.

## Asset Location

- **Masters (1024 RGBA):** `<root>/ranked-glyphs/<tier>.png` — canonical source.
  These are NOT shipped to the browser dist (they are ~1.5MB each).
- **Derivatives (alpha-preserving PNG):**
  `apps/lab-web/src/assets/ranked/glyphs/{256,128,64}/<tier>.png`
  - `256/` — default production asset (profile, result, versus)
  - `128/` — small UI
  - `64/`  — compact plates / leaderboards
- **Manifest:** `apps/lab-web/src/assets/ranked/glyphs/manifest.json`

Derivative generation is automated by `scripts/build-ranked-glyphs.mjs`
(deterministic, skip-unchanged, preserves alpha). It runs as part of
`pnpm run build`. Masters are never modified by the build.

## Architecture

```
Glicko/Elo rating
   ↓
RankTier enum + Division            (packages/account-domain/src/rank-tier.mjs)
   ↓
RANK_TIER_PRESENTATION registry     (apps/lab-web/src/play/rank/rank-presentation.mjs)
   ↓
renderRankGlyph() component         (apps/lab-web/src/play/rank/rank-glyph.js)
   ↓
canonical glyph asset
```

### Rank domain (pure, no presentation)

`packages/account-domain/src/rank-tier.mjs` is the single source of truth for
tier identity, ordering, and rating→tier mapping. It contains NO image paths.

- `RankTier` enum: `UNRANKED`, `INITIATE`, …, `INTRILEX`
- `Division` enum: `III`, `II`, `I`, `NONE`
- `RANK_LADDER`: ordered 8 earned tiers (lowest → highest)
- `ratingToTierDivision(rating, { ratedMatches })`: maps a rating to
  `{ tier, division, isPlacement, tierOrdinal, … }`
- `PLACEMENTS_REQUIRED = 5`: matches needed to exit UNRANKED
- `isApexTier()`, `tierHasDivisions()`, `compareRank()`

Rating thresholds (Intrilex Rating):

| Tier       | Range          | Divisions         |
|------------|----------------|-------------------|
| UNRANKED   | placement      | none              |
| INITIATE   | [0, 1200)      | III / II / I      |
| CIPHER     | [1200, 1400)   | III / II / I      |
| WARDEN     | [1400, 1600)   | III / II / I      |
| VANGUARD   | [1600, 1800)   | III / II / I      |
| ASCENDANT  | [1800, 2000)   | III / II / I      |
| PARAGON    | [2000, 2200)   | III / II / I      |
| SOVEREIGN  | [2200, 2400)   | III / II / I      |
| INTRILEX   | [2400, ∞)      | none (apex)       |

Each non-apex tier spans 200 rating points split into three ~67-point
divisions: III (lowest), II (middle), I (highest).

### Presentation registry (single source for tier → image)

`apps/lab-web/src/play/rank/rank-presentation.mjs` maps each tier to its
`{ label, glyphFile, glowClass, meaning }`. UI components MUST NOT define
their own tier→image mappings. They call `renderRankGlyph()` or
`rankLabel()` / `resolveGlyphPath()`.

### Glyph component

`apps/lab-web/src/play/rank/rank-glyph.js` exports:
- `renderRankGlyph({ tier, division, size, showDivision, decorative, altText })`
- `renderRankChip({ tier, division, rating, size })` — compact plate/list chip

The component renders a normalized bounding box (`object-fit: contain` — no
stretching), resolves the size-appropriate derivative, applies tier-aware CSS
halos and division ornamentation, and handles accessibility semantics.

## Division Behavior

A glyph represents a **tier family**, not an individual division. Vanguard III,
Vanguard II, and Vanguard I all use `vanguard.png`. Division differentiation is
handled by CSS ornamentation (subtle inner ring for II, stronger ring for I) —
never by manipulating the PNG or generating per-division images.

Division ornamentation never masks the central silhouette/core.

## Unranked

UNRANKED uses a neutral outlined placeholder with a subtle `?` mark — never the
Initiate glyph. Text: `UNRANKED · 0/5 Placements`.

## INTRILEX Apex

The apex glyph receives slightly stronger surrounding UI treatment (spectral
cyan-violet-white halo via CSS). The glyph silhouette must remain
recognizable. At apex, division is none; leaderboard rank presentation is
`INTRILEX #47` (via the `leaderboardPosition` option on `renderRankGlyph`).

## Usage Rules

1. **One canonical registry.** Never duplicate tier→image mappings in
   `profile.js`, `ranked-duel-renderer.mjs`, `network-lobby-renderer.mjs`,
   `ranked-duel-terminal.mjs`, or leaderboards.
2. **No rating logic in image components.** Tier is resolved by the rank
   domain; the component only renders.
3. **No rank logic from filenames.** The `01_`…`08_` numbered prefixes are
   packaging aids only. Runtime order comes from `RANK_LADDER`.
4. **Preserve transparency.** Never flatten glyphs onto a background. Use PNG
   (or WebP/AVIF with alpha where tooling supports it). Never JPEG.
5. **Masters are immutable.** Derivatives are regenerated by the build; the
   1024 masters are never overwritten.
6. **Promotion swaps glyphs only after the authoritative result.** Never
   predict the promoted tier on the client before server confirmation.
7. **Small-size readability.** Glyphs work at 128/64/48/40/32/24px via
   `object-fit: contain` and the normalized bounding box.

## Integration Points

- **Profile** (`apps/lab-web/src/workspaces/profile.js`): rank card with the
  current tier glyph (128px), tier label, IR, and a smaller season-peak glyph.
- **Player plate** (`ranked-duel-renderer.mjs`): compact 32px glyph on human
  plates; rank label in the prestige banner.
- **Ranked result** (`ranked-duel-terminal.mjs`): rank result block with
  glyph + rating delta + promotion swap (when `rankResult` is supplied).
- **Matchmaking/versus** (`network-lobby-renderer.mjs`): versus card with both
  players' glyphs in the waiting rooms.
- **Service worker** (`sw.js`): caches `.png` assets via stale-while-revalidate.

## Tests

`test/ranked-glyphs.test.mjs` (34 tests) verifies:
- Domain ladder, placement, apex, ordering, division progression
- Registry: exactly 8 mappings, no missing tier, no duplicate image, no
  upper-ladder swap (Paragon/Sovereign/Intrilex)
- File existence: all 8 masters + all derivatives (256/128/64) + manifest
- Presentation: path resolution, labels, glyph rendering, accessibility
- UI: lobby versus card, terminal rank result block, promotion swap
- Source-text wiring: profile, renderer, styles.css, sw.js, build.mjs
