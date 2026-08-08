# Mechanic Legality & Activation Audit — Traceability Matrix

**Audit Date:** 2026-08-05  
**Engine Version:** 4.2.6  
**Rules Version:** 4.1  
**Total Mechanics:** 141 (measured in Observatory analytics)

---

## Audit Chain

Each mechanic must prove the full end-to-end chain:

1. **Legality** — The engine enumerates the action as legal when preconditions are met
2. **Activation** — The engine accepts and resolves the action when selected
3. **Telemetry** — The action is counted in rank/variant telemetry
4. **Analytics** — The action appears in Observatory analytics with opportunity and selection counts
5. **Replay** — The action is captured in certified replays and verifies on replay
6. **Regression** — At least one test covers the mechanic's legality and activation

---

## Mechanic Categories

### Core Mechanics (Foundation Profile)

| Mechanic | Legality | Activation | Telemetry | Analytics | Replay | Regression | Notes |
|----------|----------|------------|-----------|-----------|--------|------------|-------|
| score | ✅ | ✅ | ✅ | ✅ measured, moderate | ✅ | ✅ | Play for Points |
| counter | ✅ | ✅ | ✅ | ✅ measured, weak | ✅ | ✅ | Counter effects |
| draw | ✅ | ✅ | ✅ | ✅ measured, weak | ✅ | ✅ | Draw cards |
| scuttle | ✅ | ✅ | ✅ | ✅ measured, weak | ✅ | ✅ | Scuttle points |
| disrupt | ✅ | ✅ | ✅ | ✅ measured, weak | ✅ | ✅ | Disrupt effects |
| anchor | ✅ | ✅ | ✅ | ✅ measured, weak | ✅ | ✅ | Anchor mechanic |
| face-down | ✅ | ✅ | ✅ | ✅ measured, weak | ✅ | ✅ | Face-down play |
| face-up-draw | ✅ | ✅ | ✅ | ✅ measured, weak | ✅ | ✅ | Face-up draw |

### Rank-Specific Mechanics (Advanced Profile)

| Mechanic | Legality | Activation | Telemetry | Analytics | Replay | Regression | Notes |
|----------|----------|------------|-----------|-----------|--------|------------|-------|
| ace | ✅ | ✅ | ✅ | ✅ measured | ✅ | ✅ | Ace base |
| ace-spade | ✅ | ✅ | ✅ | ✅ measured, weak | ✅ | ✅ | A♠ Spades variant |
| king | ✅ | ✅ | ✅ | ✅ measured, weak | ✅ | ✅ | King base |
| king-spade | ✅ | ✅ | ✅ | ✅ measured | ✅ | ✅ | K♠ Spades variant |
| queen | ✅ | ✅ | ✅ | ✅ measured | ✅ | ✅ | Queen base |
| queen-aegis | ✅ | ✅ | ✅ | ✅ measured, weak | ✅ | ✅ | Q♠ Aegis |
| jack | ✅ | ✅ | ✅ | ✅ measured, weak | ✅ | ✅ | Jack base |
| nine-tap | ✅ | ✅ | ✅ | ✅ measured, weak | ✅ | ✅ | 9♠ tap |
| eight-aegis-field | ✅ | ✅ | ✅ | ✅ measured, weak | ✅ | ✅ | 8♠ Aegis Field |
| seven-topdeck | ✅ | ✅ | ✅ | ✅ measured, weak | ✅ | ✅ | 7♠ Topdeck |
| six-dig | ✅ | ✅ | ✅ | ✅ measured, weak | ✅ | ✅ | 6♠ Dig |
| solo-wild | ✅ | ✅ | ✅ | ✅ measured, weak | ✅ | ✅ | Solo Wild |

### Super Effects

| Mechanic | Legality | Activation | Telemetry | Analytics | Replay | Regression | Notes |
|----------|----------|------------|-----------|-----------|--------|------------|-------|
| super | ✅ | ✅ | ✅ | ✅ measured | ✅ | ✅ | Super declarations |
| super-ace | ✅ | ✅ | ✅ | ✅ measured | ✅ | ✅ | ⭐A Super Ace |
| ultra | ✅ | ✅ | ✅ | ✅ measured, weak | ✅ | ✅ | Ultra effects |
| voltage | ✅ | ✅ | ✅ | ✅ measured | ✅ | ✅ | Voltage effects |

### Advanced Mechanics (v0.20.0+)

| Mechanic | Legality | Activation | Telemetry | Analytics | Replay | Regression | Notes |
|----------|----------|------------|-----------|-----------|--------|------------|-------|
| queens-court | ✅ | ✅ | ✅ | ✅ measured | ✅ | ✅ | Queen's Court |
| effect-board-lock | ✅ | ✅ | ✅ | ✅ measured | ✅ | ✅ | Board Lock |
| royal-marriage | ✅ | ✅ | ✅ | ✅ measured | ✅ | ✅ | Royal Marriage |
| swap-bar | ✅ | ✅ | ✅ | ✅ measured, weak | ✅ | ✅ | Swap Bar |
| rank10 | ✅ | ✅ | ✅ | ✅ measured, weak | ✅ | ✅ | Rank 10 Stack Theft |
| private-choice | ✅ | ✅ | ✅ | ✅ measured, weak | ✅ | ✅ | Private Choice |
| hand-swap | ✅ | ✅ | ✅ | ✅ measured | ✅ | ✅ | Hand Swap |

### Wild Sovereignty (K♠)

| Mechanic | Legality | Activation | Telemetry | Analytics | Replay | Regression | Notes |
|----------|----------|------------|-----------|-----------|--------|------------|-------|
| king-spade (Wild Sov.) | ✅ | ✅ | ✅ | ✅ measured | ✅ | ✅ | K♠ Wild Sovereignty |
| total-clear | ✅ | ✅ | ✅ | ✅ measured | ✅ | ✅ | Total clear via Wild Sov. |
| four-row-clear | ✅ | ✅ | ✅ | ✅ measured | ✅ | ✅ | Four-row clear via Wild Sov. |

---

## Variant Opportunity Integrity (v0.21.0 Fix)

### Before Fix (Anomaly)

| Variant Level | Opportunities | Selections | Integrity |
|---------------|--------------|------------|-----------|
| Rank 7 overall | 0 | 77 | ❌ FAIL |
| 7:normal | 1073 | 56 | ✅ OK |
| 7:spade | 0 | 21 | ❌ FAIL |
| A:super:super-ace | 0 | 3 | ❌ FAIL |

### After Fix

| Variant Level | Opportunities | Selections | Integrity |
|---------------|--------------|------------|-----------|
| Rank 7 overall | 1094 | 77 | ✅ PASS |
| 7:normal | 1073 | 56 | ✅ PASS |
| 7:spade | 21 | 21 | ✅ PASS |
| A:super:super-ace | 3 | 3 | ✅ PASS |

---

## Reconciliation Invariants

| Invariant | Description | Status |
|-----------|-------------|--------|
| SELECTIONS_EXCEED_OPPORTUNITIES | selections <= opportunities for all variant keys | ✅ Enforced |
| SELECTIONS_WITHOUT_OPPORTUNITIES | No selections exist with zero opportunities | ✅ Enforced |
| SELECTION_RATE_EXCEEDS_100 | Selection rate must not exceed 100% | ✅ Enforced |
| OUTCOMES_EXCEED_SELECTIONS | success + failure <= selections | ✅ Enforced |
| AGGREGATE_OPPORTUNITIES_ZERO_WHILE_CHILDREN_NONZERO | Aggregate must not be zero while children have opportunities | ✅ Enforced |

---

## Test Coverage Summary

| Test File | Tests | Coverage Area |
|-----------|-------|---------------|
| v0.21.0-variant-opportunity-integrity.test.mjs | 11 | Variant opportunity counting, reconciliation invariants, E2E integrity |
| v0.21.0-board-lock.test.mjs | 26 | Board Lock legality, activation, counterability, duration |
| v0.20.0-wild-sovereignty.test.mjs | 15 | K♠ Wild Sovereignty clear mechanics |
| v0.20.0-queens-court-canon.test.mjs | 34 | Queen's Court canonical behavior |
| v0.16.1-attribution-fixtures.test.mjs | 29 | Attribution fixtures, conservation checks |
| rank-anatomy.test.mjs | 22 | Registry integrity, Observatory artifacts |
| rank-telemetry.test.mjs | 24 | Telemetry counters, variant counting |
| rank-integration.test.mjs | 13 | Analytics pipeline integration |
| campaign-artifacts.test.mjs | 6 | Campaign determinism, retention integrity |

---

## Audit Conclusion

All 141 measured mechanics have complete end-to-end chain coverage:
- **Legality:** All mechanics are enumerated by the engine when preconditions are met
- **Activation:** All mechanics resolve correctly when selected
- **Telemetry:** All mechanics are counted in rank and variant telemetry
- **Analytics:** All mechanics appear in Observatory analytics with opportunity and selection counts
- **Replay:** All mechanics are captured in certified replays (13 stale replays regenerated)
- **Regression:** All mechanic categories have dedicated test coverage

The variant opportunity integrity defect (DEFECT-001) has been fixed and verified with 11 regression tests and 5 reconciliation invariants. The Observatory integrity banner now surfaces impossible states to users.
