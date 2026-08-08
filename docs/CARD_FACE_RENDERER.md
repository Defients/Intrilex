# Intrilex Card Face Renderer v1

## Purpose

The Card Face Renderer is the digital card presentation authority for Intrilex Simulation Lab. It separates card artwork from rules-bearing interface layers so values, timing, restrictions, and canonical text remain deterministic and editable.

## Shipped Views

Each exact card identity can render in three views:

1. **Board Face** — normal play, exact rank/suit, values, and mechanic reminders.
2. **Lite Reference** — hover/select summary with concise executable text.
3. **Full Zoom Dossier** — complete registered rules, restrictions, shared rank authority, and runtime state.

## Registry Coverage

- 54 exact card identities are renderable through deterministic scaffolding.
- All 15 rank families are canonically registered (v1.1): A, 2, 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, RJ, BJ.
- Every exact card identity (54 of 54) has a canonical definition with abilities sourced from the rulebook.
- All 54 cards have suit-specific art asset paths (placeholder WebP stubs for cards without final artwork).
- The generic scaffold remains as a true fallback for unknown identities only; no known card falls through to it.

## Canonical Authority

Rules text for registered cards is sourced from `INTRILEX_v4.2.0_COMPLETE_PLAYER_RULEBOOK.md`.

Critical preserved distinctions include:

- Every King has PR value 8.
- K♣, K♦, and K♥ have ER Anchor value 7.
- K♠ has ER Anchor value 9 and the eligible multi-play counter mode.
- K♠ cannot counter Ultras or Sudden Death.
- Rank-10 effect plays are limited to one per player per Full Turn.
- Rank-10 effect plays are not protected by Royal Shield.
- Exile-Bound begins when a Rank-10 effect begins resolving.
- 10♠ Stack Theft's Full-Turn skips come from its printed text, not from Interrupt timing.

## Runtime Integration

- New `Card Faces` workspace under `#/cards`.
- Family switcher for all 14 canonical families (Ace through Joker), browsable in the `/cards` workspace.
- Board/Lite/Full Zoom view switcher.
- Exact-card gallery.
- Card inspector dialog.
- Replay board cards open the deterministic inspector when their identity is visible.
- Runtime markers include Tap, Aegis, Guard, Exile-Bound, Anchor value, and Attachment.

## Source Files

- `apps/lab-web/src/card-face-data.js`
- `apps/lab-web/src/card-face-renderer.js`
- `apps/lab-web/src/assets/card-art/`
- `apps/lab-web/src/app.js`
- `apps/lab-web/src/styles.css`
- `test/card-face-renderer.test.mjs`

## Design Contract

- Exact suit is encoded by primary index, one watermark, color, and shape language.
- Timing labels are attached to the ability they modify.
- Artwork never carries canonical rules authority.
- Unregistered rules are disclosed, never inferred.
- Family comparison sheets are QA outputs, not playable assets.
