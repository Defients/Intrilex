# Metric Dictionary

All formulas are version **4.0.0** and hash-bound.

| Metric | Formula | Uncertainty | Formula hash |
|---|---|---|---|
| `win-rate` | wins / decisive completed matches | Wilson 95% interval | `ec429969658fee3c08d9cfdec77f90801c757b37bb15a4b401e5fe13c083bef6` |
| `usage-rate` | selected declarations / lawful opportunities | Wilson 95% interval; not-observable when opportunity facts unavailable | `175b25dbbf73cd7cc371ebc7c1fd54d87cd6958698bf28673cd195f0cf763e0b` |
| `resolution-rate` | resolved declarations / accepted declarations | Wilson 95% interval | `d50cc705225a7c42270b0f2ffe6769ac9872f9546b54ce0aa585c48d0bffc833` |
| `response-play-rate` | response plays / lawful response opportunities | Wilson 95% interval | `ad799f7a62e3c512e65005a52c6b336acf858d24f7c00395b8b77b340e6653c9` |
| `counter-efficiency` | opponent value prevented / own card and tempo cost | match-clustered deterministic bootstrap | `804b7710884afcc05130f6ef907cfad293514de6408f4879df56f6524577bc53` |
| `synergy-interaction` | stratified joint outcome rate - mean stratified component-only outcome rate | match-clustered deterministic bootstrap + BH FDR | `c1e958135b828ec3d1b7644906f6d8dd0049ebefb1e732ca17c7ea3ccec78d0d` |
| `immediate-point-impact` | sum secured point delta in declaration state transition / declarations | match-clustered deterministic bootstrap | `4dbde133fb3b9886ce8503b5b7731ec35bcef1e48f7d8d12e04f037e80900964` |
| `policy-fingerprint` | policy event/action count / policy games | descriptive; no optimality claim | `24b168c29d3e7069f9218717ca5ad35a008abb3249c97f4bd0cf6ba3e584f286` |

## Semantic counters

| Counter | Meaning |
|---|---|
| `miniTurnActionCount` | Canonical Mini-Turn Actions only |
| `exhaustedPassActionCount` | Forced Exhausted Pass Actions only |
| `responseOpportunityCount` | Policy frames containing at least one lawful response plus decline |
| `responsePlayedCount` | Free response plays selected |
| `responseDeclinedWithOptionsCount` | Meaningful declines when responses existed |
| `automaticPriorityAdvanceCount` | Engine advances with no policy input |
| `responseWindowClosedCount` | Closed response windows |
| `policyDecisionCount` | All meaningful policy decisions |
| `policyActionCount` | Excludes response decline and orchestration |
