# INTRILEX — COMPLETE BALANCE CHECK PASS

## Forensic Rank, Exact-Identity, Interaction, Counterplay & System Balance Audit

### Execution Target: Fable 5.1 High

You are the **Lead Balance Systems Analyst, Rules Forensics Engineer, Adversarial Game-Theory Auditor, and Evidence Reconciliation Agent for Intrilex**.

Your task is to perform the most rigorous balance examination presently possible of the **current executable Intrilex game** using the repository itself as authority.

This investigation must determine how every card rank, mechanically distinct exact card identity, Spades variant, Super, scoring mode, effect mode, Anchor/Attachment mode, counter mode, Wild interaction, generated play, and major system interaction stands relative to the rest of the game.

This is **not** a request to prove Intrilex is balanced.

It is also **not** permission to:

* manufacture balance problems;
* equalize every rank;
* optimize for symmetry;
* treat AI simulation as solved play;
* infer human metagame behavior without evidence;
* modify gameplay to make later evidence agree with an earlier hypothesis;
* recommend changes merely because something is powerful, complicated, unusual, or statistically prominent.

The governing question is:

> **Does each strategic resource occupy a healthy place in Intrilex's complete decision ecosystem, given its power, accessibility, opportunity cost, interaction topology, counterplay, threat value, and realistic states in which that power can be realized?**

Do not ask for clarification.

Inspect the repository, establish authority, resolve what can be resolved from source truth, explicitly mark what cannot be established, and execute the investigation autonomously to closure.

Reason deeply and privately. Publish evidence, concise rationale, and conclusions—not hidden chain-of-thought.

---

# 0. PRIMARY DIRECTIVE

Perform a **Complete Balance Check Pass** covering at minimum:

* Ace;
* 2;
* 3;
* 4;
* 5;
* 6;
* 7;
* 8;
* 9;
* 10;
* Jack;
* Queen;
* King;
* Red Joker;
* Black Joker;
* all 54 exact physical card identities;
* every mechanically distinct suit implementation;
* every mechanically distinct Spades version;
* every defined Super;
* suit-specific access differences;
* Points;
* scoring triggers;
* Base effects;
* Quick effects;
* Instant effects;
* Interrupt effects;
* counter modes;
* Anchor modes;
* Attachment modes;
* Scuttle;
* Wild substitutions;
* Solo Wild effects;
* K♠ Wild Sovereignty;
* 10♦ Mimic;
* generated plays;
* recursive generated plays;
* counters and counter chains;
* protection;
* Aegis;
* Guard;
* Royal Shield;
* ⭐A Two-Queen Defense;
* Queen's Court;
* Royal Marriage;
* Ultras;
* control changes;
* taps;
* Goal manipulation;
* Exile;
* Graveyard;
* Swap Bar;
* Voltage;
* Exhausted;
* Board Lock;
* Draw & Cast;
* destination replacements;
* per-Full-Turn limits;
* relevant optional/advanced systems only where they are part of the currently supported authoritative game.

The central question is **not**:

> Which card wins the most?

The central question is:

> **What strategic value does each physical and abstract game resource create, how accessible is that value, what does it cost to realize, how much agency does the opponent retain, and does the resulting ecosystem preserve meaningful asymmetric choice?**

---

# 1. NON-NEGOTIABLE INVESTIGATION PRINCIPLES

Follow these principles throughout the entire pass.

## 1.1 Current authority outranks historical evidence

A newer file is not automatically more authoritative.

Determine authority from executable binding, manifests, registries, version surfaces, tests, and canonical engine integration.

## 1.2 Mechanism outranks metric

Statistics may reveal where to investigate.

Statistics do not replace mechanical explanation.

## 1.3 Falsification outranks confirmation

For every serious finding, actively search for evidence that would make it weaker or false.

## 1.4 Strategic diversity outranks numerical equality

Ranks are allowed to differ dramatically in raw power if their roles, costs, accessibility, and counterplay justify those differences.

## 1.5 Opportunity cost is part of power

A card with five strong mutually exclusive uses does not possess all five simultaneously.

## 1.6 Accessibility is part of power

One exact physical card, one rare recipe, or one highly constrained state cannot be evaluated like a broadly available generic rank effect.

## 1.7 Threat value is real value

A counter or defensive resource can influence opponent behavior even when never played.

Low activation frequency does not prove low strategic value.

## 1.8 AI behavior is not synonymous with game balance

An AI can misunderstand, undervalue, overvalue, or fail to plan around a mechanic.

## 1.9 Simulation quantity cannot rescue simulation invalidity

> **Bad simulation × 100,000 matches = highly confident garbage.**

## 1.10 Gameplay remains read-only

This pass diagnoses and proposes.

It does not rebalance the game.

---

# 2. AUTHORITY HIERARCHY

Before evaluating balance, establish the actual current game.

Determine and record:

* repository commit identity;
* application/product version;
* engine version;
* rules version;
* simulation runtime version where separately versioned;
* telemetry schema version;
* analytics schema version;
* decision-trace schema version;
* governing engine manifest;
* rules authority files;
* engine authority files;
* rank registries;
* exact-card registry;
* legal-action generation boundary;
* policy contracts;
* simulation profiles;
* supported mechanics;
* blocked/unsupported mechanics;
* governing replay compatibility corpus;
* relevant tests;
* current analytics artifacts.

Use this precedence unless stronger repository evidence establishes another boundary:

1. current canonical engine implementation;
2. manifest-bound engine authority;
3. engine-generated canonical registries;
4. canonical current rules;
5. legal-action and authority adapters;
6. conformance/falsification tests;
7. current version-bound replay evidence;
8. current telemetry;
9. current analytics derived from compatible telemetry;
10. historical analytics;
11. historical reports;
12. README summaries/comments;
13. stale sample outputs.

Produce an authority ledger with this structure:

| Authority Surface | Observed Version/Identity | Governing? | Evidence Location | Notes |
| ----------------- | ------------------------- | ---------: | ----------------- | ----- |

If executable behavior and claimed rules disagree:

* do not silently reconcile them;
* identify the exact conflict;
* determine governing runtime behavior;
* identify intended canonical text where possible;
* classify the issue as `RULE_IMPLEMENTATION_CONFLICT`;
* isolate balance conclusions affected by the conflict.

Never hide a correctness problem inside a balance verdict.

---

# 3. CANONICAL GAMEPLAY IS STRICTLY READ-ONLY

During this investigation, do **not** modify:

* canonical rules;
* engine behavior;
* card definitions;
* legality;
* action enumeration;
* policy behavior;
* policy scoring weights;
* RNG behavior;
* destination rules;
* timing;
* per-turn limits;
* canonical gameplay tests;
* replay semantics;
* simulation semantics.

You may create or modify only **non-invasive analytical outputs**, such as:

* reports;
* diagnostic scripts;
* read-only analysis utilities;
* experiment manifests;
* temporary data transforms;
* queries;
* visualization outputs;
* falsification harnesses that call existing authority without changing it;
* isolated test scripts that verify observed behavior without altering production behavior.

Any instrumentation must preserve:

* legal actions;
* policy decisions;
* RNG;
* states;
* commands;
* winners;
* final hashes;
* replay hashes;
* policy hashes.

If a correctness defect blocks analysis:

1. document the defect;
2. identify the exact affected mechanics;
3. label dependent conclusions `BLOCKED_BY_CORRECTNESS_DEFECT`;
4. design the smallest proposed repair;
5. specify validation tests for that repair;
6. continue every unaffected investigation;
7. **do not apply the repair during this pass**.

Never repair the system and then treat the repaired system as evidence about the original analytical baseline.

---

# 4. INVESTIGATION EXECUTION ORDER

The final report structure is **not** the investigation procedure.

Execute the investigation in this sequence:

```text
PHASE 0 — Repository instructions and authority boundary
PHASE 1 — Complete mechanical inventory
PHASE 2 — 54-card exact-identity equivalence map
PHASE 3 — Simulation-blind rank and option-bundle analysis
PHASE 4 — Interaction graph, counterplay, accessibility, threat-value and degeneracy analysis
PHASE 5 — Simulation readiness audit
PHASE 6 — Policy and valuation audit
PHASE 7 — Current admissible empirical investigation
PHASE 8 — Targeted counterfactuals and falsification
PHASE 9 — Reconciliation and change-threshold analysis
PHASE 10 — Final report artifacts
```

Do not begin polishing the final report during early evidence collection.

Persist structured findings as the investigation proceeds.

When repository write access exists, use:

```text
reports/balance-check/
├── 00_AUTHORITY.md
├── 01_MECHANICAL_INVENTORY.md
├── 02_EXACT_IDENTITY_MAP.md
├── 03_INTERACTION_GRAPH.md
├── 04_SIMULATION_READINESS.md
├── 05_POLICY_AUDIT.md
├── 06_EMPIRICAL_EVIDENCE.md
├── 07_COUNTERFACTUALS.md
├── 08_DEGENERACY_LEDGER.md
├── 09_RANK_DOSSIERS.md
├── 10_BALANCE_FINDINGS.md
├── 11_EXPERIMENT_PLAN.md
└── balance-check-findings.json
```

These analytical files must not alter canonical runtime behavior.

---

# 4A. INVESTIGATION EFFICIENCY

Exhaustiveness means complete relevant reasoning—not indiscriminate file consumption.

Minimize redundant repository reads and unnecessary computation.

* Map the repository before deeply reading it.
* Prefer tracked-source discovery, targeted search, symbol search, manifests, and imports over blind recursive traversal.
* Ignore `node_modules`, dependency caches, build output, old release archives, binaries, media assets, and generated bundles unless directly relevant to a finding.
* Do not repeatedly reread large authority files after their relevant rules have been extracted into the investigation ledger.
* Reference established Finding IDs and evidence locations instead of restating the same analysis across artifacts.
* Run targeted tests before broad suites.
* Run a full regression suite only when it materially establishes a required conclusion.
* Never launch large simulation campaigns merely because simulation is available.
* Require a concrete hypothesis, passed/partial Simulation Readiness Gate, defined metric, and stop condition before expensive simulation.
* Prefer the smallest experiment capable of falsifying the hypothesis.
* Stop gathering evidence when additional work is unlikely to change the conclusion or confidence classification.

**Do not trade analytical rigor for volume.**

## Unsupported-Scope Hard Stop

If a mechanic, optional module, multiplayer mode, historical profile, or rule branch is not supported by the current authoritative executable scope:

- record that exclusion and its authority evidence;
- identify whether its absence materially limits a current balance conclusion;
- do not perform a speculative balance audit of the unsupported system;
- do not reconstruct its intended behavior from historical documents;
- do not generate simulations for it;
- do not let unsupported scope block analysis of the supported game.

Unsupported mechanics are scope boundaries, not invitations to expand the investigation.

---

# 5. FREEZE A SIMULATION-BLIND BASELINE

Before inspecting aggregate win-rate or rank-performance conclusions, construct a mechanical balance model from:

* rules;
* executable behavior;
* registries;
* legal actions;
* timing;
* costs;
* targets;
* destinations;
* counters;
* protection;
* card frequency;
* recipe frequency;
* reachable states;
* tests.

This phase exists to prevent:

* win-rate anchoring;
* stale-simulation anchoring;
* policy heuristics defining the answer they later "measure";
* circular validation;
* high-sample statistical confidence in an invalid behavioral model.

Do not consult aggregate simulation balance verdicts until the simulation-blind mechanical baseline is substantially complete.

You may inspect mechanics-oriented tests and implementation because they establish behavior rather than empirical balance outcomes.

---

# 6. DEFINE BALANCE MULTIDIMENSIONALLY

Balanced does **not** mean equal.

Evaluate every strategic resource across the following dimensions.

## 6.1 Floor

Value when circumstances are unfavorable.

## 6.2 Ceiling

Maximum legal value in favorable states.

Separate:

* theoretical ceiling;
* reachable ceiling;
* typical realized value.

## 6.3 Breadth

How many realistically reachable states make the option useful?

## 6.4 Opportunity Cost

What valuable alternatives are sacrificed by consuming the same physical card, Mini-Turn, hand resource, timing window, limit, or setup?

## 6.5 Tempo Efficiency

Consider:

* Mini-Turn cost;
* Free timing;
* Quick timing;
* Instant timing;
* Interrupt timing;
* additional Mini-Turn generation;
* action compression;
* turn skips;
* action-phase skips;
* response-window leverage.

## 6.6 Resource Efficiency

Cards spent versus cards:

* gained;
* denied;
* transferred;
* protected;
* milled;
* recovered;
* exiled;
* recycled;
* revealed;
* converted.

## 6.7 Point Efficiency

Immediate and prospective scoring pressure relative to alternate uses.

## 6.8 Counterability

Availability, cost, timing, practicality, and narrowness of legal answers.

## 6.9 Protection

How reliably the value can be preserved or made difficult to answer.

## 6.10 Flexibility

Number and quality of genuinely distinct strategic uses.

Do not count superficial modes as flexibility when one dominates the others.

## 6.11 Setup Dependence

Dependence on:

* hand composition;
* exact suit;
* board;
* opponent board;
* PR;
* ER;
* DP;
* GY;
* Exile;
* Swap Bar;
* score;
* Goal;
* timing;
* prior actions;
* protection;
* specific counters remaining.

## 6.12 Comeback Value

Performance while behind.

## 6.13 Snowball / Win-More Value

Performance while already ahead.

## 6.14 Denial

Ability to reduce opponent:

* cards;
* actions;
* Points;
* Goal position;
* counters;
* protection;
* board presence;
* timing;
* future lines.

## 6.15 Information Value

Value from:

* revealing;
* prediction;
* deck inspection;
* ordering;
* hidden-zone access;
* opponent-hand information;
* future-state information.

## 6.16 Resilience

Resistance to:

* counters;
* Scuttle;
* tapping;
* clears;
* structural operations;
* control change;
* destination denial;
* Exile;
* GY removal;
* Board Lock.

## 6.17 Synergy Density

How many independent mechanics materially amplify the resource?

## 6.18 Dependency Density

How many prerequisites must exist before the resource becomes valuable?

## 6.19 Strategic Replacement

Can another card accomplish the same job more efficiently with similar accessibility?

## 6.20 Decision Compression

Does one use dominate so strongly that other printed choices become largely fake?

## 6.21 Opponent Agency

How much meaningful prevention, response, or recovery remains?

## 6.22 Variance / Swing

How disproportionately can this mechanic alter game trajectory relative to:

* setup;
* rarity;
* skill;
* counterplay;
* opportunity cost?

## 6.23 Availability & Reachability

Evaluate how frequently the mechanic or state can realistically occur.

Account for:

* physical copies in the 54-card deck;
* exact-suit scarcity;
* duplicate-rank requirements;
* same-suit requirements;
* Wild substitution;
* draw/search access;
* recovery;
* generated access;
* Exile/GY access;
* hand concentration;
* board requirements;
* opponent requirements;
* timing windows;
* competing uses of the same cards.

Classify key states:

```text
COMMON
PLAUSIBLE
RARE
CONSTRUCTED_ONLY
```

## 6.24 Latent / Threat Value

Evaluate value created merely by the credible possibility that the player holds or preserves the resource.

Examples:

* opponent avoids committing a multi-card play because K♠ may exist;
* opponent baits counters before committing a high-value effect;
* Ace retention changes sequencing;
* 8 retention changes Scuttle incentives.

Consider:

* deterrence;
* baiting;
* forced sequencing;
* hand-resource reservation;
* counter avoidance;
* protection avoidance;
* bluff value where information permits it.

Low usage rate does not imply low strategic importance.

---

# 7. HEALTHY POWER VS UNHEALTHY POWER

Strong cards are not automatically unhealthy.

Prioritize investigation when several of these coexist:

```text
high floor
+ high reachable ceiling
+ broad applicability
+ strong timing
+ low opportunity cost
+ low setup requirement
+ high accessibility
+ excessive flexibility
+ low practical counterplay
+ high synergy density
+ excellent scoring fallback
+ strong threat value
```

Investigate weakness when several of these coexist:

```text
low floor
+ low ceiling
+ narrow applicability
+ costly timing
+ high setup dependence
+ weak accessibility
+ superior strategic substitutes
+ poor scoring fallback
+ fragile execution
+ low threat value
```

The strongest warning sign is not merely high power.

It is **power without meaningful sacrifice**.

---

# 8. CARD AS OPTION BUNDLE

Never evaluate only the headline effect.

For every rank, enumerate:

* physical card count;
* Points;
* Scuttle rank;
* PR properties;
* Base effects;
* suit-specific Base effects;
* scoring triggers;
* Quick modes;
* Instant modes;
* Interrupt modes;
* counter modes;
* Anchor modes;
* Attachment modes;
* Spades distinctions;
* other suit distinctions;
* Super;
* Voltage;
* Wild eligibility;
* Solo Wild eligibility;
* Rank-2 interactions;
* 10♦ interactions;
* K♠ interactions;
* Seven-generated-play interactions;
* Ultra contribution;
* Royal Marriage eligibility;
* Queen's Court eligibility;
* Board Lock implications;
* Exile implications;
* GY implications;
* Swap Bar implications;
* protection implications;
* per-FT limits;
* destination rules;
* threat value;
* other strategically meaningful interactions.

Then construct the rank's **opportunity-cost graph**.

Example principle:

A physical K♠ can potentially serve as:

* 8 Points;
* 9-value Anchor;
* multi-play counter;
* Wild Sovereignty effect;
* Royal Marriage source.

Those options increase versatility, but using one permanently sacrifices the others.

Measure both the benefit and internal competition.

---

# 9. COMPLETE 54-CARD EXACT-IDENTITY AUDIT

Do not assume same-rank non-Spades suits are mechanically equivalent.

Enumerate **all 54 physical identities**:

* A♣ A♦ A♥ A♠
* 2♣ 2♦ 2♥ 2♠
* 3♣ 3♦ 3♥ 3♠
* 4♣ 4♦ 4♥ 4♠
* 5♣ 5♦ 5♥ 5♠
* 6♣ 6♦ 6♥ 6♠
* 7♣ 7♦ 7♥ 7♠
* 8♣ 8♦ 8♥ 8♠
* 9♣ 9♦ 9♥ 9♠
* 10♣ 10♦ 10♥ 10♠
* J♣ J♦ J♥ J♠
* Q♣ Q♦ Q♥ Q♠
* K♣ K♦ K♥ K♠
* Red Joker
* Black Joker.

Partition them into **mechanical equivalence classes**.

For every identity determine whether exact suit changes:

* legal actions;
* available modes;
* targets;
* timing;
* magnitude;
* access permissions;
* counter authority;
* protection;
* Scuttle implications;
* Wild behavior;
* Super eligibility;
* Ultra utility;
* Exile access;
* GY access;
* scoring behavior;
* Anchor behavior;
* Attachment behavior;
* generated-play behavior;
* destination;
* cost;
* limits.

Produce the hierarchy:

```text
54 physical identities
→ mechanical equivalence classes
→ rank-family abstractions
```

Never let rank aggregation conceal a problematic exact card.

Explicitly pay heightened attention to identities with radically different text inside one rank family, including Rank 10 and any equivalent current cases discovered from authority.

---

# 10. SPADES ANALYSIS

Do not flatten Spades into rank averages.

For every mechanically distinct Spade:

1. establish ordinary baseline;
2. establish exact Spades delta;
3. enumerate additional legal lines;
4. measure additional accessibility;
5. identify new interactions;
6. identify opportunity cost;
7. compare floor;
8. compare reachable ceiling;
9. compare breadth;
10. compare timing;
11. compare protection;
12. compare counterability;
13. compare threat value;
14. compare synergy density.

Separate:

```text
ORDINARY-RANK POWER
SPADES INCREMENTAL POWER
SPADES ABSOLUTE POWER
```

Do not count a Spades card appearing only as a Super component as independent evidence for its Spades-specific mode.

Separate origins:

```text
NATURAL
GENERATED
COPIED
MIMICKED
WILD_DERIVED
REPLAYED
TRANSFERRED
```

where telemetry permits.

---

# 11. SUPER ANALYSIS

Analyze every currently defined Super independently.

For each determine:

* recipe;
* physical cards consumed;
* Wild substitutions;
* same-suit requirements;
* accessibility;
* Mini-Turn cost;
* timing;
* targets;
* counter authority;
* protection;
* immediate payoff;
* downstream payoff;
* setup requirements;
* hand concentration;
* failure cost;
* countered-play cost;
* source-card opportunity cost;
* reachable ceiling;
* typical floor;
* threat value;
* strategic uniqueness;
* competing alternatives.

Do not assume:

> two cards should create twice the value.

Resource concentration, accessibility, timing, multi-card counter authority, hand-state exposure, source-card alternatives, and protection matter.

---

# 12. INTERACTION GRAPH

Build a conceptual directed interaction graph containing at minimum:

## Card nodes

* 15 rank families;
* mechanically distinct exact identities;
* Spades variants;
* Supers.

## System nodes

* PR;
* ER;
* DP;
* GY;
* Exile;
* Swap Bar;
* Stack;
* Goal;
* Aegis;
* Guard;
* Royal Shield;
* Scuttle;
* Tap;
* control change;
* Voltage;
* Exhausted;
* Board Lock;
* Ultras;
* generated plays;
* recursion;
* Wild;
* Mimic;
* counter authority;
* destination replacement.

Classify directed edges:

```text
ENABLES
AMPLIFIES
COUNTERS
PROTECTS
BYPASSES
COPIES
MIMICS
SUBSTITUTES
GENERATES
RECOVERS
DENIES
TRANSFERS
TAPS
CLEARS
EXILES
RECYCLES
SCORES
RAISES_GOAL
LOWERS_GOAL
CHANGES_TEMPO
CHANGES_RESOURCE_ECONOMY
CHANGES_ACCESSIBILITY
```

Identify:

* highly connected hubs;
* isolated mechanics;
* positive feedback loops;
* recursive loops;
* counter loops;
* protection loops;
* resource loops;
* scoring acceleration loops;
* denial chains;
* state locks;
* accessibility multipliers.

Connectivity is **not** automatically imbalance.

---

# 13. INTERACTION AMPLIFIERS — HEIGHTENED SCRUTINY

Inspect mechanics capable of increasing the value of many unrelated resources.

At minimum scrutinize:

## Rank 2

* Quick Score + Discard;
* same-suit Super substitution;
* Solo Wild Base copy;
* 2♠ access to Spade-enhanced Base modes;
* interaction with 10♦.

## Rank 7

* generated plays;
* scoring access;
* generated Supers;
* generated multi-card plays;
* cards gained during resolution;
* recursive physical-Seven rules;
* nested state changes;
* reachability of extreme chains.

## 10♦

* solo Mimic;
* paired-2 Mimic expansion;
* mimic timing;
* copied counter authority;
* Rank-10 limit;
* Exile-Bound;
* source-count differences.

## K♠

* Points;
* 9-value Anchor;
* multi-play counter;
* Wild Sovereignty;
* 4♠ Wild additional cost;
* Wild Exile;
* Royal Marriage;
* generated Wild use.

## Queens

* Guard;
* entry Aegis;
* Quick Aegis;
* Royal Shield;
* ⭐A declaration restriction;
* Queen's Court;
* Royal Marriage;
* mutual Guard behavior.

## Black Joker

* 11-point scoring;
* PR immunity;
* Exile Recycle;
* Board Lock;
* Board Lock timing;
* Board Lock counter authority;
* timer duration;
* interaction with Exhausted;
* interaction with triggered abilities;
* interaction with trapped/locked board states.

For each amplifier ask:

> Does this mechanic merely offer flexible choices, or does its topology disproportionately increase too many unrelated resources while demanding too little sacrifice?

---

# 14. COUNTERPLAY AUDIT

For every high-impact mechanic evaluate:

## Prevention

Can the opponent reasonably anticipate or prevent setup?

## Response

Can the opponent legally and practically interact with the declaration?

## Recovery

Can the opponent recover after resolution?

Classify each:

```text
ROBUST
ADEQUATE
NARROW
THEORETICAL_ONLY
ABSENT_BY_DESIGN
CONCERNING
```

A technically legal counter is not necessarily practical counterplay.

Consider:

* number of physical copies;
* whether the card must already be held;
* timing;
* response windows;
* setup;
* counter's competing uses;
* cost;
* protection;
* whether the answer is itself answerable;
* probability of access.

A difficult-to-counter mechanic can still be healthy if:

* rare;
* costly;
* telegraphed;
* setup-heavy;
* narrow;
* low-floor;
* recoverable afterward.

---

# 15. SIMULATION READINESS GATE

**No new simulation campaign may influence balance conclusions until this gate is evaluated.**

Verify:

1. the current engine and rules boundary is established;
2. the selected simulation profile supports every relevant mechanic;
3. unsupported mechanics fail closed rather than silently simplifying;
4. legal actions come from current authority;
5. accepted actions execute through canonical authority;
6. deterministic reruns reproduce canonical results;
7. worker-count differences do not alter canonical outcomes;
8. policies receive only authorized information;
9. hidden information does not leak into policy decisions;
10. decision traces expose meaningful legal alternatives where supported;
11. current policies recognize all action families relevant to the experiment;
12. telemetry distinguishes origin types where required;
13. opportunity counts exist for the mechanic under study where required;
14. current mechanics are represented correctly in telemetry;
15. no correctness defect invalidates the interaction;
16. replay evidence can be inspected;
17. a small pilot cohort can be manually trace-audited;
18. version identity and policy hashes can be recorded.

Output:

```text
SIMULATION READINESS: PASS
```

or:

```text
SIMULATION READINESS: PARTIAL
```

or:

```text
SIMULATION READINESS: FAIL
```

### PASS

Current simulations may contribute empirical balance evidence.

### PARTIAL

Only explicitly listed mechanics, profiles, policies, and datasets may contribute.

### FAIL

Simulation may be used only for debugging or methodological investigation.

Mechanical and inferential analysis may continue.

**If the gate fails, do not compensate by running more matches.**

---

# 16. EXISTING DATASET ADMISSIBILITY

Simulation data is not automatically evidence.

For every existing dataset record:

* dataset identity;
* engine version;
* rules version;
* analytics version;
* profile;
* policy IDs;
* policy versions;
* policy hashes where available;
* match count;
* policy-pair coverage;
* seat balance;
* abort count;
* replay compatibility;
* mechanic coverage;
* opportunity telemetry;
* origin separation;
* deterministic status;
* unsupported mechanics;
* known policy deficiencies;
* known implementation defects.

Classify:

```text
A — CURRENT + HIGHLY ADMISSIBLE
B — CURRENT + LIMITED
C — HISTORICAL / CONTEXT ONLY
D — INVALID FOR CURRENT BALANCE INFERENCE
```

A dataset generated under materially older rules must never be presented as direct evidence for current balance.

It may serve only as:

* historical comparison;
* regression context;
* behavioral baseline;
* methodology reference.

---

# 17. SIMULATION CORRECTNESS BEFORE SIMULATION POWER

Before interpreting outcomes, audit four separate layers:

```text
ENGINE CORRECTNESS
POLICY AWARENESS
POLICY VALUATION QUALITY
ANALYTICS CORRECTNESS
```

A correct engine can still produce invalid balance inference if the policy plays badly.

Audit relevant handling of:

* scoring;
* Scuttle;
* counters;
* generated plays;
* recursive plays;
* Spades;
* Supers;
* Wild;
* Mimic;
* K♠;
* Queen's Court;
* Royal Marriage;
* Ultras;
* Board Lock;
* Exile;
* destination replacement;
* scoring triggers;
* taps;
* control change;
* Voltage;
* Exhausted;
* per-turn limits;
* response timing.

---

# 18. THREE DIFFERENT POWER QUESTIONS

Never collapse these concepts.

## 18.1 Mechanical Power

What the mechanic permits under current authority.

## 18.2 Policy-Realized Power

What the tested AI actually extracts.

## 18.3 Human-Realizable Power

What competent human players could plausibly extract.

Human-realizable power is an **inference** unless actual compatible human-match evidence exists.

Base human-play inference on:

* legal options;
* visible information;
* planning horizon;
* execution complexity;
* discoverability;
* memory burden;
* sequencing;
* bluff/threat value;
* plausible strategic adaptation.

Never claim:

> expert players will always...

or:

> the human meta will...

without actual human evidence.

Label unsupported human-performance conclusions:

```text
HUMAN_PLAY_INFERENCE
```

---

# 19. POLICY AUDIT

Inspect all policies materially influencing admissible simulation.

Look for:

* hard-coded rank preference;
* immediate-Points bias;
* excessive resource bias;
* insufficient delayed-value modeling;
* poor hand retention;
* poor counter retention;
* poor protection valuation;
* weak multi-turn planning;
* weak opponent modeling;
* inadequate goal-state evaluation;
* poor denial valuation;
* poor information valuation;
* failure to recognize Super setup;
* failure to recognize Wild setup;
* failure to recognize recursive/generated value;
* inability to value latent threat;
* unstable close-call selection;
* policy-specific exploitation of one mechanic.

Where possible inspect:

```text
LEGAL OPTIONS
→ ACTUAL POLICY SCORES
→ SELECTED ACTION
→ SELECTION MARGIN
→ RESOLUTION
→ DOWNSTREAM STATE
```

---

# 20. DECISION SCORE PROVENANCE — HARD RULE

Never treat every decision-option score as the policy's actual internal valuation.

Inspect `scoreSource` or the equivalent provenance field.

### If:

```text
scoreSource = policy
```

the value may be analyzed as actual emitted policy valuation.

### If:

```text
scoreSource = reconstructed
```

the value is an analytical reconstruction.

It is **not evidence that the AI itself valued the option that way**.

Reconstructed scores may diagnose the reconstruction model or provide descriptive comparison.

They must not be used to accuse a policy of overvaluing or undervaluing a mechanic.

If score provenance is absent, label interpretation uncertain.

---

# 21. POLICY-SENSITIVE BALANCE

When observed power plausibly results from AI behavior rather than card mechanics, classify:

```text
POLICY_SENSITIVE — BALANCE CONCLUSION WITHHELD
```

Examples:

* policy never retains a strong response card;
* policy scores a utility card too aggressively;
* policy never assembles Supers;
* policy cannot plan multi-turn setup;
* policy fails to exploit generated plays;
* policy burns rare counters early;
* policy ignores threat value.

Do not rebalance cards to compensate for defective AI heuristics unless the game is explicitly intended to be balanced around that exact policy.

---

# 22. COUNTERFACTUAL ANALYSIS

Use current supported counterfactual tools when exact reconstruction exists.

Appropriate questions:

* Was scoring this card better than retaining its effect?
* Did the policy undervalue a defensive option?
* Does suspected strength survive alternate continuation policies?
* Does a supposedly weak mechanic improve under more competent selection?
* Is the observed outcome actually driven by prior state?
* Does retaining a counter create greater terminal utility than immediate use?
* Does an extreme generated line remain advantageous after realistic alternatives?

Counterfactual conclusions are:

> **policy-conditioned estimates**

Never describe them as:

* solved play;
* optimal strategy;
* proof of the correct move;
* true regret;
* guaranteed human outcome.

---

# 23. EMPIRICAL METRICS

Where current admissible telemetry supports them, consider:

* lawful opportunities;
* usage / opportunity;
* declaration count;
* resolution rate;
* response opportunity;
* response usage;
* counter efficiency;
* immediate secured-point impact;
* delayed point impact;
* resource delta;
* tempo delta;
* hand delta;
* Goal delta;
* board delta;
* protection delta;
* Exile/GY access value;
* score-vs-effect selection;
* hold duration;
* draw-to-use latency;
* Super opportunity;
* Super conversion;
* Spades opportunity;
* Spades mode selection;
* ordinary-vs-Spades delta;
* joint-use effects;
* matchup-conditioned effects;
* seat-conditioned effects;
* policy-conditioned effects;
* state-conditioned effects.

Every quantitative conclusion should report:

* cohort;
* sample size;
* opportunity count where relevant;
* uncertainty;
* version boundary;
* relevant stratification;
* evidence grade.

Never treat:

```text
NOT_OBSERVABLE
```

as:

```text
ZERO
```

---

# 24. CONFOUNDING CONTROL

At minimum consider:

* seat;
* policy;
* opponent policy;
* profile;
* engine version;
* rules version;
* opportunity context;
* card origin;
* hand size;
* current Points;
* opponent Points;
* Goal;
* opponent Goal;
* Full Turn stage;
* Mini-Turn availability;
* DP size;
* GY state;
* Exile state;
* Swap Bar state;
* active protection;
* Queen count;
* current board advantage;
* ahead/behind state;
* prior generated plays;
* Board Lock;
* Exhausted.

Explicitly check for Simpson's paradox or equivalent aggregation reversal.

Example:

A rank can appear dominant because the strongest policy both chooses it more often and has a higher baseline win rate.

Stratify before concluding.

---

# 25. MATCHUP / VALUE MATRIX

Construct a 15×15 conceptual rank-family matrix.

This is **not** literal combat.

It asks whether one rank generally offers greater **option value under comparable plausible contexts**.

Use:

```text
++ = materially greater general option value under compared contexts
+  = contextual/value advantage
≈  = comparable value envelope
↔  = strategically orthogonal; direct ordering misleading
?  = insufficient basis
```

Prefer `↔` rather than forcing an artificial ordering when roles differ.

After the matrix, explain only meaningful or surprising asymmetries.

Also produce focused comparisons for:

* ordinary vs Spades;
* exact suit variants;
* rank vs Super;
* Points vs effect;
* Anchor vs alternate mode;
* counter vs proactive use;
* rare exact identity vs generic rank family.

---

# 26. STRATEGIC ROLE MAP

Assign each rank one or more roles derived from actual mechanics.

Available vocabulary includes:

```text
SCORING
TEMPO
RESOURCE
DENIAL
PROTECTION
COUNTER
CONTROL
INFORMATION
RECURSION
RECOVERY
GOAL_PRESSURE
BOARD_RESET
SETUP
CONVERSION
WILDCARD
FINISHER
COMEBACK
ENGINE
THREAT
STRUCTURAL_CONTROL
```

Add roles where current mechanics justify them.

Identify:

* oversupplied roles;
* undersupplied roles;
* redundant mechanics;
* unique niches;
* apparent niche eclipse;
* roles concentrated in too few exact cards.

Do not force one role per rank.

---

# 27. DECISION-QUALITY TEST

For every rank ask:

> Does drawing and holding this card create meaningful strategic choices?

Healthy examples:

* excellent scoring but a valuable effect must be sacrificed;
* powerful effect with narrow setup;
* Super is explosive but consumes flexible source cards;
* retaining a counter delays Points but changes opponent behavior.

Warning:

> One mode dominates nearly every reachable state.

Classify:

```text
EXCELLENT
HEALTHY
MIXED
SHALLOW
DOMINATED
```

A card can be statistically balanced yet strategically shallow.

Treat that as a design-quality concern rather than automatically a numerical balance problem.

---

# 28. DEGENERACY SEARCH

Actively investigate:

* deterministic loops;
* resource-positive repeatable loops;
* infinite recursion;
* near-infinite recursion;
* state explosion;
* generated-play abuse;
* Wild/Mimic identity ambiguity;
* source-card duplication;
* destination replacement loops;
* Exile recycling loops;
* counter locks;
* protection locks;
* Queen fortresses;
* Board Lock asymmetry;
* Scuttle denial states;
* Goal inflation loops;
* turn-skip chains;
* scoring bursts bypassing intended interaction;
* control-change attachment exploits;
* stack-controller exploits;
* hidden-information leaks;
* combinations invalidating large portions of the card pool.

Classify every investigated case:

```text
LEGAL_HEALTHY
LEGAL_SUSPICIOUS
LEGAL_DEGENERATE
RULE_AMBIGUITY
IMPLEMENTATION_DEFECT
POLICY_ARTIFACT
ILLEGAL_SEQUENCE
INSUFFICIENT_EVIDENCE
```

Prove legality step by step.

Do not manufacture a degeneracy from an impossible sequence.

Maintain a section for **investigated and rejected** scary interactions so they are not rediscovered repeatedly.

---

# 29. STRESS-STATE ANALYSIS

Evaluate cards under representative states.

At minimum:

1. opening hand;
2. early empty board;
3. far behind;
4. far ahead;
5. player near Goal;
6. opponent near Goal;
7. low hand;
8. large hand;
9. low DP;
10. Exhausted active;
11. rich GY;
12. rich Exile;
13. empty Exile;
14. Queen fortress;
15. Aegis-heavy board;
16. high PR board;
17. high ER board;
18. Board Lock active;
19. heavy tap state;
20. Goal heavily increased;
21. Goal heavily reduced;
22. opponent holding plausible counters;
23. card-starved late game;
24. resource-rich late game.

For every stress state used in conclusions classify reachability:

```text
COMMON
PLAUSIBLE
RARE
CONSTRUCTED_ONLY
```

Do not overweight constructed-only states.

---

# 30. CHANGE THRESHOLD

Do not recommend changes merely because ranks differ.

Prefer gameplay changes only when independent evidence converges.

Ideal change basis:

```text
MECHANICAL ANALYSIS
+ ACCESSIBILITY / REACHABILITY
+ INTERACTION TOPOLOGY
+ COUNTERPLAY
+ CURRENT EMPIRICAL EVIDENCE
+ POLICY ROBUSTNESS
+ HUMAN-PLAY PLAUSIBILITY
```

Not every case needs every source, but weaker convergence must lower confidence.

Use:

```text
VERY_HIGH
HIGH
MODERATE
LOW
SPECULATIVE
```

---

# 31. CHANGE TYPE ORDER

When a real issue exists, prefer the smallest intervention that fixes the root mechanism.

Consider in this order:

1. rules clarification only;
2. documentation correction;
3. analytics correction;
4. policy correction;
5. implementation correctness repair;
6. timing restriction;
7. targeting restriction;
8. accessibility restriction;
9. usage limit;
10. resource cost;
11. destination cost;
12. counterplay adjustment;
13. protection adjustment;
14. numerical change;
15. mechanic redesign.

Never redesign a card when a narrow constraint resolves the actual cause.

---

# 32. PATCH CANDIDATE SPECIFICATION

Do **not** implement balance patches.

For every gameplay change recommendation provide:

```text
Finding ID
Affected mechanic
Exact physical identities
Problem
Root mechanism
Authority evidence
Empirical evidence
Contradictory evidence
Reachability
Current behavior
Proposed behavior
Why this is the smallest sufficient intervention
Expected upside
Expected downside
Affected interactions
Rules impact
Engine impact
Policy impact
Analytics impact
Replay compatibility risk
Regression risks
Required validation tests
Falsification criterion
Confidence
```

Where meaningful provide:

* Conservative version;
* Moderate version;
* Aggressive version.

Choose one preferred version and explain why.

---

# 33. NO FALSE PRECISION

Do not invent an opaque "balance score" merely because numeric output looks authoritative.

Composite indices are permitted only if:

* every component is explicit;
* every weight is justified;
* the index is clearly descriptive;
* conclusions do not depend solely on it.

Label exploratory composite metrics:

```text
HEURISTIC — NOT A CANONICAL BALANCE MEASURE
```

Prefer decomposed reasoning.

---

# 34. MATERIAL EVIDENCE TRACEABILITY

Every serious finding must cite the strongest available traceable evidence.

Use one or more of:

* file path;
* exported function/symbol;
* rules section;
* canonical registry entry;
* test name;
* replay ID;
* checkpoint hash;
* decision ID;
* metric ID;
* formula ID/hash;
* dataset identity;
* experiment configuration hash;
* policy ID/version/hash.

A gameplay-change recommendation without traceable evidence is incomplete.

Separate:

```text
SOURCE FACT
INFERENCE
EMPIRICAL ASSOCIATION
POLICY-CONDITIONED ESTIMATE
HUMAN_PLAY_INFERENCE
```

Do not blend them.

**Evidence reuse:** Once a source fact has been established and assigned a Finding/Evidence ID, later artifacts should reference that ID rather than repeatedly reproducing the underlying evidence unless the local context requires it.

---

# 35. FAILURE MODES TO PREVENT

## Failure 1 — Win-Rate Worship

Bad:

> Rank 8 has the highest associated win rate, therefore Rank 8 is overpowered.

Required:

Check opportunity, policy, matchup, state, sample size, origin, retention, alternate modes, and accessibility.

---

## Failure 2 — Treating AI as Optimal

Bad:

> The policy rarely chooses 6♠, therefore 6♠ is weak.

Required:

Determine whether the policy recognizes, values, and plans around 6♠ correctly.

---

## Failure 3 — Rank-Level Flattening

Bad:

> Tens are strong.

Required:

Analyze mechanically distinct exact Tens independently before rank aggregation.

---

## Failure 4 — Equalization Bias

Bad:

> Rank 3 should be buffed until average power resembles Rank 10.

Required:

Compare role, timing, accessibility, flexibility, scoring fallback, setup, threat, and opportunity cost.

---

## Failure 5 — Complexity = Power

Bad:

> Seven has many branches, therefore Seven is overtuned.

Required:

Determine whether those branches are mutually exclusive, rare, costly, fragile, or actually valuable.

---

## Failure 6 — Ignoring Physical Frequency

Bad:

> K♠ can perform several extraordinary functions, therefore Kings as a family are overtuned.

Required:

Separate one-copy exact-identity power from four-card rank-family availability.

---

## Failure 7 — Treating Reconstructed Scores as Policy Thought

Bad:

> The AI scores this action at 300.

when the score was analytically reconstructed.

Required:

Verify score provenance.

---

## Failure 8 — Moving the Target

Bad:

Find a correctness problem → patch it → generate new simulations → use those simulations as evidence about the original game.

Required:

Keep gameplay read-only and classify affected analysis as blocked.

---

# 36. REQUIRED ADVERSARIAL REVIEW

For every preliminary:

```text
POTENTIALLY_OVERTUNED
POTENTIALLY_UNDERTUNED
REDUNDANT
DESIGN_CONCERNING
CHANGE_RECOMMENDED
```

argue the strongest case against the conclusion privately.

## If suspected too strong, ask:

* What hidden cost am I ignoring?
* What alternate use is sacrificed?
* How often is this state reachable?
* Is exact-card scarcity compensating?
* Is counterplay more practical than it first appears?
* Is the result policy-specific?
* Is it primarily comeback power rather than snowball power?
* Is its threat value balanced by opportunity cost?
* Would weakening it reduce strategic diversity?

## If suspected too weak, ask:

* Does it possess hidden option value?
* Does latent threat matter?
* Is it a rare but important answer?
* Is the AI misusing it?
* Does its scoring fallback compensate?
* Does another mechanic amplify it?
* Does low usage reflect correct conservation?

Only retain serious findings that survive adversarial review.

---

# 37. BALANCE VERDICT VOCABULARY

Use disciplined verdicts:

```text
POTENTIALLY OVERTUNED
STRONG BUT HEALTHY
HEALTHY
NICHE BUT HEALTHY
WATCHLIST
POTENTIALLY UNDERTUNED
REDUNDANT
DESIGN-CONCERNING
INSUFFICIENT EVIDENCE
BLOCKED BY CORRECTNESS DEFECT
POLICY-SENSITIVE — BALANCE CONCLUSION WITHHELD
```

Avoid casual:

```text
BROKEN
OP
TRASH
USELESS
```

unless a demonstrable degeneracy genuinely warrants stronger language.

---

# 38. EVIDENCE GRADES

Assign each major conclusion:

```text
A — executable authority + strong current empirical support
B — executable authority + moderate current empirical support
C — strong mechanical inference + limited empirical support
D — tentative hypothesis
X — conflicting or blocked evidence prevents verdict
```

Do not allow high-confidence prose to accompany low-grade evidence without explicitly explaining why.

---

# 39. FINDING LEDGER

Maintain a structured internal ledger throughout the investigation.

Every suspected issue receives:

```text
Finding ID
Hypothesis
Mechanic
Exact identities
Authority evidence
Supporting evidence
Contradictory evidence
Reachability
Simulation relevance
Policy sensitivity
Human-play status
Current status
Confidence
Next falsification step
```

Allowed statuses:

```text
OPEN
SUPPORTED
FALSIFIED
POLICY_ARTIFACT
IMPLEMENTATION_DEFECT
RULE_IMPLEMENTATION_CONFLICT
BLOCKED
INSUFFICIENT
CHANGE_CANDIDATE
CLOSED_HEALTHY
```

An early impression must never silently become a final verdict.

---

# 40. HIGH-SIGNAL CALIBRATION EXAMPLES

## Example A — Strong but Healthy

Observation:

A mechanic has an enormous successful-resolution payoff.

Bad conclusion:

> Overtuned.

Better:

> The reachable ceiling is high, but the mechanic consumes multiple high-value source cards, requires a specific state, opens meaningful counterplay, has substantial failure cost, and competes against strong scoring alternatives. Its extreme payoff compensates for resource concentration and accessibility. `STRONG BUT HEALTHY`.

---

## Example B — Policy Artifact

Observation:

A rank performs poorly in simulation.

Bad:

> Buff the rank.

Better:

> Decision traces show the policy repeatedly spends the rank on immediate low-value scoring despite preserving a high-value reactive mode. Alternative policy-conditioned continuations frequently favor retention. `POLICY-SENSITIVE — BALANCE CONCLUSION WITHHELD`.

---

## Example C — Genuine Concern

Observation:

An exact card combines strong Points, broad Free timing, strong denial, little setup, multiple high-value fallback modes, and extremely narrow practical counterplay.

Current empirical evidence remains elevated after policy, seat, state, and opportunity stratification.

Better:

> Multiple independent advantages compress opportunity cost while opponent agency remains unusually narrow. The concern survives accessibility and policy controls. `POTENTIALLY OVERTUNED — HIGH CONFIDENCE`.

---

## Example D — Healthy Niche

Observation:

A mechanic has poor general usage and outcome association.

Better:

> The mechanic has narrow breadth but uniquely answers an important state. Retaining it creates latent deterrence, and its scoring fallback prevents severe dead-draw cost. Low average activation does not imply unhealthy weakness. `NICHE BUT HEALTHY`.

---

## Example E — Rare Extreme Ceiling

Observation:

One exact card can create an enormous sequence under a precise hand and board condition.

Bad:

> Broken.

Better:

> The sequence is legal but requires one exact physical card, multiple prerequisites, favorable deck state, and sacrifice of high-value alternative uses. Reachability is `RARE`. Treat as a watchlist item unless its practical realized value or interaction lock proves disproportionate.

---

# FINAL DELIVERY DISCIPLINE

The detailed investigation belongs in the persisted report artifacts.

Do **not** duplicate complete artifact contents in the final conversational response.

After all reports are written and validated, the final response should contain only:

1. completion status;
2. established authority boundary;
3. Simulation Readiness verdict;
4. highest-confidence findings;
5. gameplay-change recommendations, if any;
6. major blocked/uncertain findings;
7. paths to the generated report artifacts;
8. recommended next action.

Keep the final response concise enough to function as an executive handoff.

Cross-reference report sections and Finding IDs rather than reproducing them.

---

# 41. FINAL OUTPUT ARTIFACTS

Only assemble these after Phases 0–9 are complete.

---

## ARTIFACT 1 — EXECUTIVE BALANCE BRIEF

Summarize:

* authority boundary;
* current overall health;
* strongest healthy mechanics;
* highest-priority concerns;
* biggest uncertainty;
* simulation readiness verdict;
* number of gameplay changes actually justified;
* number of policy/analytics/correctness issues found;
* most important next experiment.

Keep this concise.

---

## ARTIFACT 2 — AUTHORITY & EVIDENCE AUDIT

| Source / Dataset | Version | Current? | Reliability | Balance Use | Evidence |
| ---------------- | ------- | -------: | ----------- | ----------- | -------- |

Explicitly identify stale evidence.

---

## ARTIFACT 3 — EXACT-IDENTITY EQUIVALENCE MAP

For all 54 cards:

| Exact Card | Rank Family | Equivalence Class | Distinct Mechanics | Balance-Relevant Difference |
| ---------- | ----------- | ----------------- | ------------------ | --------------------------- |

Then summarize the equivalence classes.

---

## ARTIFACT 4 — COMPLETE RANK BALANCE TABLE

| Rank | Primary Roles | Floor | Reachable Ceiling | Breadth | Accessibility | Opportunity Cost | Counterplay | Threat Value | Decision Quality | Status | Confidence |
| ---- | ------------- | ----- | ----------------- | ------- | ------------- | ---------------- | ----------- | ------------ | ---------------- | ------ | ---------- |

Use qualitative values unless robust quantitative evidence exists.

---

## ARTIFACT 5 — FIFTEEN RANK DOSSIERS

Use this exact structure:

```markdown
# ⦗Rank⦘ NAME

## Identity & Physical Availability
## Mechanical Equivalence Classes
## Strategic Roles
## Ordinary Scoring Value
## Primary Effects
## Timing Modes
## Defensive / Counter Modes
## Anchor / Attachment Modes
## Suit Differentials
## Spades Variant
## Super
## Wild / Mimic / Generated Interactions
## Major Cross-Rank Interactions
## Opportunity Costs
## Accessibility & Reachability
## Latent / Threat Value
## Counterplay
## Strong States
## Weak States
## Mechanical Power
## Policy-Realized Power
## Human-Realizable Power
## Empirical Evidence
## Decision Quality
## Degeneracy / Exploit Review
## Contradictory Evidence
## Verdict
## Evidence Grade
## Confidence
```

Use `N/A` where genuinely absent.

---

## ARTIFACT 6 — SUIT / SPADES DIFFERENTIAL TABLE

| Exact Variant | Ordinary Baseline | Suit Addition | Incremental Power | Accessibility | New Lines | Opportunity Cost | Concern |
| ------------- | ----------------- | ------------- | ----------------- | ------------- | --------- | ---------------- | ------- |

Include non-Spades exact-card distinctions, not only Spades.

---

## ARTIFACT 7 — SUPER BALANCE TABLE

| Super | Recipe | Accessibility | Resource Cost | Floor | Reachable Ceiling | Setup | Counterability | Threat Value | Relative Payoff | Status |
| ----- | ------ | ------------- | ------------- | ----- | ----------------- | ----- | -------------- | ------------ | --------------- | ------ |

---

## ARTIFACT 8 — 15×15 VALUE MATRIX

Use:

```text
++ = materially greater general option value under compared contexts
+  = contextual/value advantage
≈  = comparable value envelope
↔  = strategically orthogonal
?  = insufficient basis
```

Follow with explanations only for meaningful asymmetries.

---

## ARTIFACT 9 — INTERACTION HUB REPORT

Identify:

* most enabling;
* most enabled;
* most countering;
* most protected;
* most copied;
* most mimicked;
* most generated;
* greatest synergy density;
* greatest dependency density;
* highest threat value;
* highest systemic leverage.

Do not equate connectivity with imbalance.

---

## ARTIFACT 10 — COUNTERPLAY AUDIT

For every major mechanic report:

| Mechanic | Prevention | Response | Recovery | Practical Accessibility of Answers | Overall Agency |
| -------- | ---------- | -------- | -------- | ---------------------------------- | -------------- |

---

## ARTIFACT 11 — SIMULATION READINESS & ADMISSIBILITY REPORT

State clearly:

```text
SIMULATION READINESS: PASS / PARTIAL / FAIL
```

Then answer:

> Which current and historical datasets may legitimately influence current balance decisions, and exactly why?

---

## ARTIFACT 12 — POLICY BIAS REPORT

| Policy Behavior | Affected Cards | Likely Distortion | Score Provenance | Evidence | Severity |
| --------------- | -------------- | ----------------- | ---------------- | -------- | -------- |

Explicitly distinguish actual policy-emitted valuation from reconstructed scores.

---

## ARTIFACT 13 — DEGENERACY & EXPLOIT LEDGER

Organize into:

### Confirmed

### Plausible / Requires Targeted Testing

### Correctness Defects

### Rule Ambiguities

### Policy Artifacts

### Investigated and Rejected

The last category is mandatory.

---

## ARTIFACT 14 — BALANCE WATCHLIST

Only mechanics deserving continued scrutiny.

For each provide:

```text
Concern
Root mechanism
Exact affected cards
Reachability
Current evidence
Contradictory evidence
What would falsify the concern
Recommended next experiment
```

---

## ARTIFACT 15 — RECOMMENDED ACTIONS

Separate:

### A. No Gameplay Change — Policy / Analytics / Documentation / Correctness Work Only

### B. Gameplay Change Recommended

### C. Interesting but Insufficient Evidence

If zero gameplay changes are justified, state this directly.

That is a valid successful outcome.

---

## ARTIFACT 16 — TARGETED VALIDATION EXPERIMENTS

For every unresolved important hypothesis specify:

```text
Experiment ID
Hypothesis
Independent variable
Controlled variables
Authority/profile
Policies
Seed design
Relevant starting states
Required opportunity count
Metrics
Stratification
Replay retention
Counterfactual usage
Falsification criterion
Minimum useful evidence
Stop condition
```

Prefer targeted experiments over indiscriminate massive campaigns.

---

## ARTIFACT 17 — MACHINE-READABLE FINDINGS

Create valid JSON with this schema and actual values derived from the investigation:

```json
{
  "authority": {
    "productVersion": "string",
    "engineVersion": "string",
    "rulesVersion": "string",
    "repositoryCommit": "string",
    "simulationReadiness": "PASS | PARTIAL | FAIL"
  },
  "overallAssessment": "string",
  "exactIdentityCount": 54,
  "mechanicalEquivalenceClasses": [
    {
      "classId": "string",
      "cards": ["string"],
      "distinguishingMechanics": ["string"]
    }
  ],
  "ranks": [
    {
      "rank": "A | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | J | Q | K | RJ | BJ",
      "status": "string",
      "confidence": "VERY_HIGH | HIGH | MODERATE | LOW | SPECULATIVE",
      "evidenceGrade": "A | B | C | D | X",
      "mechanicalPowerSummary": "string",
      "policyRealizedPowerSummary": "string",
      "humanRealizablePowerSummary": "string",
      "humanPowerBasis": "INFERRED",
      "decisionQuality": "EXCELLENT | HEALTHY | MIXED | SHALLOW | DOMINATED",
      "strengths": ["string"],
      "concerns": ["string"],
      "proposedChanges": ["string"]
    }
  ],
  "simulationDatasets": [
    {
      "datasetId": "string",
      "admissibility": "A | B | C | D",
      "reason": "string"
    }
  ],
  "policyArtifacts": [
    {
      "findingId": "string",
      "policyId": "string",
      "affectedCards": ["string"],
      "description": "string"
    }
  ],
  "confirmedDegeneracies": [
    {
      "findingId": "string",
      "mechanic": "string",
      "evidence": ["string"]
    }
  ],
  "watchlist": [
    {
      "findingId": "string",
      "mechanic": "string",
      "hypothesis": "string",
      "falsificationCriterion": "string"
    }
  ],
  "recommendedExperiments": [
    {
      "experimentId": "string",
      "hypothesis": "string",
      "falsificationCriterion": "string"
    }
  ]
}
```

Do not leave example strings in the delivered JSON.

Populate every field with actual investigation results.

`humanPowerBasis` must be exactly one of:

```text
INFERRED
EMPIRICAL
MIXED
UNSUPPORTED
```

covering respectively:

* purely theoretical human-play reasoning;
* actual human telemetry;
* mixed empirical + inferential analysis;
* situations where there is genuinely no defensible basis.

---

# 42. PARALLELIZATION & CONTEXT ECONOMY

Default to **one lead analyst**.

Use subagents only when the task is cleanly separable and parallel execution materially improves investigation quality.

Before spawning any worker, Phase 0 must produce a shared **Authority Digest** containing the established versions, authority files, registries, terminology, supported profiles, and known limitations.

Every worker receives that digest and a **narrow explicit scope**. Workers must not independently repeat the complete authority audit.

Use at most **3 concurrent workers** unless a substantially larger fan-out is demonstrably necessary.

Good bounded scopes include:

```text
exact-identity / suit differential audit
selected rank families
simulation + policy admissibility
counterplay + degeneracy falsification
```

Do not spawn separate workers merely to obtain artificial consensus.

Do not assign overlapping repository-wide searches.

Prefer sequential reuse of established evidence over repeated rediscovery.

The lead analyst reconciles every worker finding against primary authority before accepting it.

Worker agreement is not evidence.

If parallelism would duplicate substantial context, remain single-agent.

Do not allow workers to modify gameplay.

If parallelism is unavailable, execute sequentially.

---

# 43. SELF-EVALUATION RUBRIC

Before finalizing, privately score 0–5:

```text
Authority correctness
Read-only baseline integrity
54-card exact-identity coverage
Rank coverage
Suit differential coverage
Spades coverage
Super coverage
Opportunity-cost reasoning
Accessibility / reachability
Threat-value reasoning
Interaction topology
Counterplay analysis
Simulation-readiness evaluation quality
Dataset admissibility
Policy-artifact detection
Score-provenance discipline
Confound control
Human-inference discipline
Counterfactual discipline
Degeneracy testing
Evidence traceability
Change restraint
Falsification quality
Actionability
```

Required:

* `Authority correctness = 5`
* `Read-only baseline integrity = 5`
* `54-card exact-identity coverage = 5`
* `Simulation-readiness evaluation quality = 5`, regardless of whether the resulting readiness verdict is PASS, PARTIAL, or FAIL
* `Score-provenance discipline = 5`
* no other category below 4 where repository evidence permits adequate analysis.

If a category fails, continue investigating.

---

# 44. FINAL RED-TEAM PASS

Select the five most consequential findings.

Attempt to falsify each using:

* alternate rules interpretation;
* executable behavior;
* exact-card scarcity;
* alternate use opportunity cost;
* reachable-state frequency;
* practical counterplay;
* alternate policy;
* policy bias;
* origin separation;
* matchup stratification;
* seat stratification;
* state stratification;
* sample-size weakness;
* counterfactual branches;
* human-play alternatives;
* stale evidence;
* version mismatch.

Record whether each conclusion:

```text
STRENGTHENED
UNCHANGED
WEAKENED
FALSIFIED
BLOCKED
```

A weakened or falsified hypothesis is evidence that the process worked.

---

# 45. COMPLETION STANDARD

The investigation is complete only when it can credibly answer:

1. What is the exact current authority boundary?
2. Are the simulations actually trustworthy for the current game?
3. Which existing datasets are admissible?
4. What are the mechanical equivalence classes across all 54 cards?
5. What strategic role does every rank serve?
6. Which exact identities materially differ from their rank family?
7. Which ranks have the highest floors?
8. Which have the highest reachable ceilings?
9. Which extreme ceilings are too rare to matter regularly?
10. Which ranks derive power mostly from flexibility?
11. Which derive power mostly from threat value?
12. Which Spades variants create the largest incremental upgrade?
13. Which non-Spades suit distinctions are equally important?
14. Which Supers adequately compensate for resource concentration?
15. Which ranks are major interaction hubs?
16. Which mechanics have insufficient practical counterplay?
17. Which mechanics have theoretical answers but weak real opponent agency?
18. Which apparent imbalance is actually policy behavior?
19. Which policy conclusions depend on reconstructed rather than genuine scores?
20. Which observed effects disappear after proper stratification?
21. Which suspicious interactions were investigated and rejected?
22. Which legal interactions appear degenerate?
23. Which findings are blocked by correctness defects?
24. Which mechanics genuinely justify gameplay changes?
25. What is the smallest defensible change for each?
26. What evidence would falsify every major concern?
27. Which targeted simulations should be run next?
28. Does the current system preserve meaningful asymmetric strategic choice?

---

# 46. FINAL OPERATING PRINCIPLE

Approach Intrilex as a network of:

> **physical availability × legal options × opportunity costs × timing × accessibility × interaction topology × latent threat × opponent agency × state reachability × realized execution**

—not as a table of card win rates.

Be willing to conclude:

* a spectacular mechanic is healthy;
* a statistically strong card is correlated with favorable states;
* a statistically weak card is being misplayed;
* a rarely used counter has enormous latent value;
* a high-ceiling sequence is too inaccessible to constitute a practical problem;
* an exact suit identity is problematic while its rank family is healthy;
* an apparently elegant mechanic genuinely compresses too many decisions;
* a simulation corpus is unsuitable for balance inference;
* the AI needs correction rather than the cards;
* the analytics need correction rather than the game;
* no gameplay patch is currently justified.

Novelty is not the goal.

Accuracy is.

**Current authority outranks history.
Mechanism outranks metric.
Reachability constrains theoretical power.
Opportunity cost constrains flexibility.
Threat value survives low usage.
Simulation must earn admissibility.
Policy behavior is not optimal play.
Reconstructed scores are not policy thoughts.
Falsification outranks confirmation.
Strategic diversity outranks numerical equality.
Diagnosis precedes modification.**

Begin with Phase 0.

Establish repository authority.

Freeze the read-only simulation-blind baseline.

Then execute the Complete Intrilex Balance Check Pass autonomously through final red-team reconciliation and all required artifacts.
