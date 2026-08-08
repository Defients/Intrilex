# Intrilex Engine v4.2.4 — Advanced Core Authority

This package preserves the certified Intrilex v4.1 kernel, applies the governing **v4.1.1 Interrupt timing hotfix**, and extends v4.2.3 with a bounded engine-owned advanced Core profile.

> **Timing hotfix:** Interrupt is timing authority only. It never creates a generic Mini-Turn, Action-Phase, or Full-Turn penalty. 10♠ Stack Theft and Time Bomb Defuse retain only their explicitly printed consequences.

## Supported autonomy profile

`core-advanced-authority` supports the complete inherited Core Foundation, public effects, responses, and ordinary sealed choices plus:

- Royal Marriage;
- ⭐2 Score, ⭐4 Row Exchange, ⭐8 Absolute Scuttle, and ⭐J Tempo Force;
- 10♥ Tempo Spike, 10♠ Exile Recovery, and 10♠ Stack Theft;
- ⭐A and K♠ advanced counters;
- 3 Black, 3 Red, and 2 Black + 2 Red Ultras;
- the public Voltage 5 GY-bottom branch.

Incomplete copied-effect, hidden-choice, Start-child, scoring-trigger, and module branches remain fail-closed.

## Verify

```bash
npm ci --offline
npm test
npm run conformance
npm run test:browser-parity
npm run campaign:core-advanced-cert
npm run release:verify-extracted
```

See `docs/ADVANCED_CORE_AUTHORITY.md`, `HOTFIX_NOTICE_v4.1.1_INTERRUPT_TIMING.md`, and `reports/CAPABILITY_MANIFEST_4.2.4.json`.
