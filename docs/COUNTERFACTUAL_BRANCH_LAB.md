# Counterfactual Branch Lab

## Overview

The Counterfactual Branch Lab provides deterministic, analysis-only branch evaluation from command checkpoints. It answers: "What would have happened if a different action had been chosen at this decision point?"

## Key Principles

1. **Analysis-only**: All branches are marked `analysisOnly: true` and are excluded from canonical replay, win-rate, and rules-compliance cohorts.
2. **Policy-conditioned**: Results are estimates under specified continuation policies, not proof of optimal play.
3. **Deterministic**: Continuation seeds derive from `matchId + checkpointHash + alternativeActionId + rolloutIndex + analysisVersion`.
4. **Fail-closed**: If exact reconstruction is not available, the lab returns `NOT_SUPPORTED` with the precise missing authority.

## API

### `runCounterfactualBranch(config)`

Runs a counterfactual branch from a checkpoint with an alternative action.

```javascript
const result = runCounterfactualBranch({
  matchId: 'M-test',
  checkpointHash: 'abc123',
  baseSeed: 12345,
  seatOrder: ['P1', 'P2'],
  policyIds: ['tempo', 'control'],
  profileId: 'core-advanced-authority',
  alternativeActionId: 'alt-1',
  continuationPolicyIds: ['tempo', 'control'],
  rolloutCount: 32
});
```

Returns:
- `schemaVersion`: `1.0.0`
- `analysisOnly`: `true`
- `status`: `COMPLETED` or `NOT_SUPPORTED`
- `configHash`: Hash of experiment configuration
- `resultHash`: Hash of results
- `summary`: Win rates, score margins, completion counts
- `interpretation`: "policy-conditioned counterfactual estimate"
- `limitations`: Explicit boundaries on interpretation

### `compareCounterfactual(selected, alternative)`

Compares two branch results and produces an estimated difference with interpretation and limitations.

## Terminology

- **Correct**: "Across 64 deterministic policy-conditioned continuations from checkpoint 7b9…, Alternative B produced a mean terminal utility 0.11 above the selected action (95% interval: -0.02 to 0.24). Evidence is suggestive, not conclusive."
- **Incorrect**: "The AI made the wrong move. Alternative B wins."

This is never called "solved play," "true regret," "optimality," or "proof of what should have happened."
