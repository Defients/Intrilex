# Intrilex Rules and AI Audit — v0.7.0

Date: 2026-07-29  
Engine: 4.2.5  
Rules: 4.1.2  
Audited profile: `core-advanced-authority`

## Outcome

The bounded Advanced Core AI now passes explicit runtime checks for the audited official rules. Two real declaration-authority defects were corrected, the Control policy no longer counters its own top stack item, and the analytics pipeline now attributes mechanics and outcomes to the participant who actually used them.

The official rulebook remains the authority. This audit does not expand autonomous support beyond Complete First Contact and bounded two-player Advanced Core.

## Official-rule corrections

### 10♠ Stack Theft

Official text: target one pending single effect play, excluding Ultras and Sudden Death activations.

Previous behavior accepted any one-source primary stack item outside a short exclusion list. That incorrectly included non-effect roots such as playing for Points, Draw, Swap Bar, and Scuttle.

Corrected behavior:

- enumeration exposes Stack Theft only against `ordinary-effect`, `anchor`, or `rank10` stack classes;
- execution independently rejects every other target class;
- the source count must be exactly one;
- the printed skip behavior is unchanged: two Full-Turn skips if Stack Theft resolves, or one for its controller if Stack Theft itself is countered.

Regression coverage proves that a score root is neither offered nor accepted as a Stack Theft target.

### 3 Red Ultra

Official text: choose a pending play that ⭐A could legally counter.

Because ⭐A cannot be declared against a play whose controller has at least two untapped Queens in ER, 3 Red inherits the same declaration prohibition. The prior 3 Red path omitted that check.

Corrected behavior:

- enumeration withholds 3 Red when the target controller has two or more untapped Queen Anchors;
- execution applies the same check before accepting the declaration;
- the counter-resistant bottom-GY draw rider is unchanged.

### Pass, priority, and Interrupt

The inspected implementation already matched the governing hotfix:

- ordinary Pass is unavailable;
- `exhausted-pass` is the only gameplay Pass;
- response decline does not consume a Mini-Turn;
- automatic priority advance is engine orchestration;
- Quick is restricted to the active player;
- Interrupt creates no generic turn tax;
- only printed exceptions create skips.

The stale response capability label `pass` was corrected to `exhausted-pass`.

## AI-policy correction

The Control policy used the root controller to value response decline. After Control placed a response on top of an opponent root, it still treated the stack as hostile and frequently countered or disrupted its own pending response.

Response conservation now uses the current top stack controller. All strategic policies receive a strong decline bonus when their own item is on top, while they remain free to answer a new opponent response placed above it.

This is a correctness and resource-conservation improvement, not a balance claim.

## Analytics corrections

The supplied 500-match extract combined both players' mechanic counts, then associated that combined row with Seat 1's result. It also treated structural labels and timing classes as mechanics. This produced directionless associations and many tautological synergy pairs.

The corrected pipeline:

- records response opportunities per participant;
- records cleaned mechanic counts per participant;
- associates usage with that participant's own win/loss result;
- stratifies by profile, policy, and seat;
- records one primary mechanic per decision for synergy analysis;
- excludes phases, timing labels, suits, generic modes, score, and pass bookkeeping from synergy candidates;
- deduplicates representative match references;
- exposes the analysis unit in the browser and exported extract.

## Validation evidence

| Gate | Result |
|---|---:|
| Engine authority tests | 188/188 PASS |
| Lab tests | 90/90 PASS |
| Legacy conformance replays | 121/121 PASS |
| Pass/Priority semantic fixtures | 25/25 PASS |
| Source CI | 26/26 PASS |
| Browser parity | 121 replays + seeded policy match PASS |
| Browser UI journey | 7 workspaces + live Worker match PASS |
| Regenerated sample cohort | 100/100 complete, 0 aborts, 0 rule violations |
| Focused Control-vs-Tempo cohort | 500/500 complete, 0 aborts, 0 rule violations |

### Supplied versus corrected 500-match evidence

| Measure | Supplied extract | Corrected run |
|---|---:|---:|
| Completed matches | 500 | 500 |
| Draws | 9 | 3 |
| Control wins | 68 (13.6%) | 58 (11.6%) |
| Tempo wins | 423 (84.6%) | 439 (87.8%) |
| Control response conservation | 0.0% | 17.7% |
| Canonical mechanic labels | 121 | 96 |
| Synergy estimates | 256 | 261 |
| Significant synergy estimates | 240 | 88 |
| Flagged anomalies | 428 | 381 |
| Rule-audit violations | not recorded | 0 |

Hashes for the corrected 500-match run:

- experiment: `2722009d02e639db38c544dccb79f11ba9ae3c4357d378a589e8b523015fba98`
- result: `7c0ebc45d70c2413eb033aad03b4d3ab2835c2d4e8e08e419cc088bd9eafe38b`
- aggregate: `f0356cf340778db65c2d32fb6e2461b64a723300ea90938fbe6e2c51d3324302`

## Remaining limitations and recommended next work

- Control remains substantially weaker than Tempo. The self-counter fix improved conservation but did not improve win rate. Any balance tuning should be a separate preregistered policy experiment, not mixed into rule-authority changes.
- `ORCHESTRATION_DENSITY` remains a frequent informational anomaly. It measures engine bookkeeping density, not a rule violation; its threshold should be recalibrated against canonical match length.
- Complete unrestricted Core remains replay-only because advanced continuations and 10♦ Mimic are not closed.
- Optional modules and multiplayer remain blocked.
- The old supplied extract cannot be repaired perfectly without its raw per-decision participant facts. New runs emit the corrected schema.

## Primary changed surfaces

- Engine: `core-authority.ts`, `core-autonomy.ts`, `core-response.ts`
- Policy: `packages/policies/src/scoring.mjs`
- Runtime: Node and browser match runners
- Analytics: participant-level mechanics and primary-mechanic synergy analysis
- UI/extract: analysis-unit labels and v0.7 version consistency
- Tests: official-rule negatives, self-response conservation, participant attribution, and canon-audit assertions
