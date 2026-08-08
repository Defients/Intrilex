# Policy Authoring Guide

A policy is deterministic local code that chooses one `actionId` from the supplied immutable legal-action list.

```js
export const policy = createPolicyDefinition({
  policyId: 'example-policy',
  version: '1.0.0',
  traits: { riskTolerance: 0.5 },
  choose(context) {
    const selected = [...context.legalActions]
      .sort((a, b) => a.actionId.localeCompare(b.actionId))[0];
    return {
      actionId: selected.actionId,
      metadata: {
        reasonCode: 'LEXICAL_BASELINE',
        evaluatedCount: context.legalActions.length
      }
    };
  }
});
```

## Allowed inputs

- match and decision identity;
- acting player ID;
- strict player-authorized state projection;
- sanitized `LegalAction[]`;
- deterministic policy RNG stream;
- bounded serialized traits.

## Forbidden behavior

- importing engine commands or state mutators;
- inspecting the command vault;
- accessing opponent hidden hands or unrelated RNG state;
- returning a command rather than an action ID;
- mutating context objects;
- nondeterministic time, host, network, or global-random inputs;
- storing free-form hidden reasoning.

New policies must pass determinism, action-validity, hidden-information, mutation, and behavioral-distinction tests before entering campaigns.
