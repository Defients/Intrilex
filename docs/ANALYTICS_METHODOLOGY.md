# Analytics Methodology

## Authority and cohort

All metrics derive from accepted engine commands, semantic facts, state deltas, and verified replay checkpoints. Current real cohort: **100 matches**, all 25 ordered policy pairings, zero aborts, compatible Engine 4.2.5 / rules 4.1.2 only.

## Statistical methods

- Wilson 95% intervals for ordinary proportions.
- Deterministic match-clustered bootstrap for complex derived effects.
- Benjamini–Hochberg false-discovery correction for pairwise relationship scans.
- Shrinkage on high-cardinality pair estimates.
- Required stratification by policy pairing, seat, profile, and opportunity context where observable.
- Evidence grades: strong, moderate, weak, insufficient.
- `not-observable` is distinct from zero.

## Interpretation

Associations are not canon changes or causal proof. No black-box balance score is published. Every metric has a version, formula hash, cohort, sample size, uncertainty, limitations, and replay references when retained.

## Synthetic validation

The deterministic fixture suite verifies null, injected positive, injected negative, Simpson-stratification, low-sample suppression, FDR correction, and repeated-run identity. Validation hash: `f7036eed17db4594cf749903bc88534ee140cbaed36f5147c222bdb86626d2cc`.
