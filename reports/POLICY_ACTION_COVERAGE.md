# Profile action wiring audit

Status: **PASS**. Generated: 2026-10-03T19:25:41.482Z.

120 authority declaration sites; 31 potential families; 30 families and 185 modes observed in 35 constructed authority frames.
875 selected actions executed successfully; 840 Node/browser choices agree. 48 held-out seat-paired games completed canonically.

Implementation fingerprint: `df88437ceb9249207eda53363b47007969d01b97051715024511f2685d34947c`.

## Repairs

- Optional Start actions compete with phase advancement; face-down swaps preserve valuable recipes and immediate winning cards.
- Face-up swaps use the actual face-up-draw mode and known card/recipe value.
- Private takes, ordered assignments, discard costs, return order and generated effects use their actual roles.
- Seven exposes advanced generated plays already accepted by the engine resolver.
- Public effect targets, copied effects, whole-board losses, goal shifts, usable tempo, premium responses and Stack Theft receive contextual estimates.
- HybriX uses current engine modes and authorized hand/row/stack schemas.
- Lab reports available and selected windows by family, mode, timing, Super and Ultra; old runs have unavailable coverage.
- Tactical versions are 4.0.0 and HybriX versions are 2.0.0. Implementation fingerprints invalidate stale campaign caches.

## Coverage boundaries

- Authority declarations are classified; this does not prove every state/target permutation has been executed.
- effect-board-lock is a legacy Mini-Turn declaration rejected by current authority; Quick Board Lock is the reachable path.
- Legacy v2 baselines and weighted-heuristic-v1 retain their original scoring contracts.
- Opportunity counts describe legal decision windows. Selected declarations are not guaranteed resolutions.
- No optimal-play or general strength claim follows from this bounded integration campaign.

## Family inventory

| Family | Purpose | Declaration sites | Observed modes |
| --- | --- | ---: | ---: |
| anchor | defense | 3 | 3 |
| anchor-private-choice | hand-pressure | 1 | 1 |
| attachment | control | 2 | 2 |
| counter | response | 6 | 7 |
| disrupt | response | 1 | 1 |
| draw | resource | 1 | 1 |
| effect-ace | protection-removal | 2 | 1 |
| effect-board-lock | lock | 1 | 0 |
| effect-four | board | 2 | 3 |
| effect-private-choice | resource-or-hand-pressure | 6 | 6 |
| effect-red-joker | hand-or-deck | 4 | 4 |
| effect-three | removal | 1 | 1 |
| exhausted-pass | progress | 1 | 1 |
| instant | response | 5 | 5 |
| interrupt | response | 1 | 1 |
| phase | progress | 1 | 1 |
| private-choice | choice | 23 | 23 |
| queens-court | defense | 1 | 1 |
| quick | defense | 5 | 3 |
| rank10 | composite | 16 | 10 |
| response-decline | progress | 1 | 1 |
| royal-marriage | defense | 1 | 1 |
| score | points | 1 | 1 |
| scuttle | removal | 1 | 1 |
| solo-wild | copied-effect | 6 | 17 |
| sudden-death | terminal-risk | 1 | 1 |
| super | composite | 9 | 10 |
| swap-bar | resource | 2 | 2 |
| ultra | composite | 4 | 13 |
| voltage | free-resource | 5 | 56 |
| wild-sovereignty | copied-effect | 6 | 7 |

## Reproduce

```powershell
pnpm run build
pnpm run audit:policy-actions
pnpm run test:evolution
```

The companion JSON contains every declaration source/line, mode sample, fixture selection, integration result and opportunity count.
