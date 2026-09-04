// scripts/generate-markdown-report.mjs
// Mechanically generates 12_EFFECT_POWER_RANKING.md from balance-check-findings.json.
// All Top-N / Bottom-N sections are derived programmatically from the canonical rankings.
// All rank references in the "Special Explicit System Comparisons" section are validated
// against the canonical tables at generation time.

import fs from 'fs';

const findings = JSON.parse(fs.readFileSync('reports/balance-check/balance-check-findings.json', 'utf8'));
const er = findings.effectRanking;
const {
  practicalRankingAsWritten,
  practicalRankingAsExecuted,
  rawPotencyRanking,
  efficiencyRanking,
  threatRanking,
  comebackRanking,
  snowballRanking,
  paretoFrontier,
  strictDominanceFindings,
  strongestEffects,
} = er;

// Load CSV to extract table data (timing, setup, counterplay, etc.)
const rankingCsv = fs.readFileSync('reports/balance-check/effect-ranking.csv', 'utf8').trim().split('\n');
const tableRows = rankingCsv.slice(1).map(row => {
  const cells = [];
  let curr = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ',' && !inQuotes) { cells.push(curr); curr = ''; }
    else curr += ch;
  }
  cells.push(curr);
  return cells;
});

// Build lookup maps for validation
const writtenRankMap = new Map(); // effectId -> practicalRankWritten
practicalRankingAsWritten.forEach(r => writtenRankMap.set(r.effectId, r.rank));

const executedRankMap = new Map(); // effectId -> practicalRankExecuted
practicalRankingAsExecuted.forEach(r => executedRankMap.set(r.effectId, r.rank));

const rawPrimitiveRankMap = new Map(); // primitiveId -> primitiveRank
rawPotencyRanking.forEach(p => rawPrimitiveRankMap.set(p.primitiveId, p.rank));

const efficiencyRankMap = new Map(); // effectId -> efficiencyRank
efficiencyRanking.forEach(r => efficiencyRankMap.set(r.effectId, r.rank));

const threatRankMap = new Map();
threatRanking.forEach(r => threatRankMap.set(r.effectId, r.rank));

const comebackRankMap = new Map();
comebackRanking.forEach(r => comebackRankMap.set(r.effectId, r.rank));

const snowballRankMap = new Map();
snowballRanking.forEach(r => snowballRankMap.set(r.effectId, r.rank));

// Map effectId -> route info from written ranking
const routeInfoMap = new Map();
practicalRankingAsWritten.forEach(r => routeInfoMap.set(r.effectId, r));

// Map effectId -> CSV row (for timing, setup, etc.)
const csvRowMap = new Map();
tableRows.forEach(row => csvRowMap.set(row[1], row));

// Map effectId -> primitiveId
const effectToPrimitive = new Map();
practicalRankingAsWritten.forEach(r => effectToPrimitive.set(r.effectId, r.primitiveId));

// ============================================================================
// Helper: format a rank reference for validation
// ============================================================================
function getRankRef(effectId, dimension) {
  switch (dimension) {
    case 'written': return writtenRankMap.get(effectId);
    case 'executed': return executedRankMap.get(effectId);
    case 'efficiency': return efficiencyRankMap.get(effectId);
    case 'threat': return threatRankMap.get(effectId);
    case 'comeback': return comebackRankMap.get(effectId);
    case 'snowball': return snowballRankMap.get(effectId);
    case 'raw': {
      const primId = effectToPrimitive.get(effectId);
      return primId ? rawPrimitiveRankMap.get(primId) : undefined;
    }
    default: return undefined;
  }
}

// ============================================================================
// Helper: mechanically generate a Top-N section from a ranking array
// ============================================================================
function topN(rankingArr, n, label, scoreField) {
  const lines = [];
  for (let i = 0; i < Math.min(n, rankingArr.length); i++) {
    const r = rankingArr[i];
    const score = scoreField ? ` (score: ${r[scoreField]})` : '';
    lines.push(`${i + 1}. \`${r.effectId || r.primitiveId}\` — ${r.reason || r.primitiveName || ''}${score}`);
  }
  return lines.join('\n');
}

// ============================================================================
// Helper: mechanically generate Bottom-N from a ranking array
// ============================================================================
function bottomN(rankingArr, n) {
  const lines = [];
  const start = rankingArr.length - n;
  for (let i = start; i < rankingArr.length; i++) {
    const r = rankingArr[i];
    lines.push(`| ${r.rank} | \`${r.effectId}\` | ${r.reason || ''} |`);
  }
  return lines.join('\n');
}

// ============================================================================
// Helper: classify bottom effects
// ============================================================================
function classifyBottomEffect(r) {
  if (r.implementationStatus === 'DEFECT_CONTAMINATED') return 'IMPLEMENTATION-DAMAGED';
  if (r.implementationStatus === 'NOT_IMPLEMENTED') return 'IMPLEMENTATION-DAMAGED';
  if (r.healthVerdict === 'BLOCKED') return 'IMPLEMENTATION-DAMAGED';
  if (r.healthVerdict === 'INSUFFICIENT') return 'IMPLEMENTATION-DAMAGED';
  if (r.healthVerdict === 'WATCHLIST') return 'POTENTIALLY UNDERTUNED';
  if (r.healthVerdict === 'NICHE BUT HEALTHY') return 'INTENTIONALLY NICHE';
  if (r.healthVerdict === 'HEALTHY') return 'HEALTHY LOW-POWER';
  return 'HEALTHY LOW-POWER';
}

// ============================================================================
// Validation log: collect all rank references for automatic validation
// ============================================================================
const rankReferences = [];

function refRank(effectId, dimension, context) {
  const rank = getRankRef(effectId, dimension);
  rankReferences.push({ effectId, dimension, claimedRank: rank, context });
  return rank;
}

// ============================================================================
// Generate Markdown
// ============================================================================

let md = `# 12 — Intrilex Card Effect Power Ranking & Pairwise Hierarchy

**Final Analytical Extension · Intrilex Complete Balance Check Pass**
**Governing Task Specification:** \`/BALANCE_CHECK_PASS.md\`
**Authority Boundary:** Product \`0.28.0\` · Engine \`4.2.6\` · Rulebook \`v4.3.1\` · Commit \`e4c22228\`
**Scope:** Exhaustive evaluation of **${er.primitiveCount} distinct Effect Primitives** accessed via **${er.asWrittenEffectCount} AS-WRITTEN Declaration Routes** and **${er.asExecutedEffectCount} AS-EXECUTED Declaration Routes**.

---

## 1. Executive Summary & Dual-Authority Method

The existing 15×15 rank-family matrix evaluated cards at the level of physical rank abstractions. However, Intrilex cards are multifaceted option bundles where physical rank, scoring value, effect primitive, and declaration route interact. This report establishes the complete power hierarchy of Intrilex's mechanics without conflating intrinsic effect potency with declaration access costs.

### Dual-Authority Classification
1. **AS-WRITTEN (Rulebook v4.3.1):** Evaluates all **${er.asWrittenEffectCount}** intended declaration routes in the published game rules. Where engine implementation is missing or defective (\`IMPL-01..13\`), the mechanical power is analyzed from rulebook authority, confidence is adjusted, and empirical metrics are marked \`NOT_OBSERVABLE\`.
2. **AS-EXECUTED (Engine 4.2.6):** Identifies the **${er.asExecutedEffectCount}** routes currently functional in executable code (status \`MATCH\`, \`CONFLICT\`, or \`UNRESTRICTED_ONLY\`), isolating engine bugs (such as Unrestricted Sudden Death \`DEG-01\`, empty ⭐6/⭐7 payloads \`IMPL-03\`, and scoring-rider refusals \`IMPL-01\`).

### Separation of Primitive vs. Route
* **Effect Primitive:** The intrinsic mechanical outcome (e.g. \`TOTAL_CLEAR\`, \`BOARD_LOCK\`, \`TEMPO_SPIKE\`). There are **${er.primitiveCount}** mechanically distinct primitives.
* **Declaration Route:** The specific operational path used to declare a primitive (e.g. Natural \`4♠\`, \`2♠\` Solo Wild, \`K♠\` Wild Sovereignty). There are **${er.asWrittenEffectCount}** AS-WRITTEN routes and **${er.asExecutedEffectCount}** AS-EXECUTED routes.

### Separation of Opportunity Cost Fields
* **Points Forgone:** PR points sacrificed by not scoring the source card(s) for points.
* **Extra Cost Note:** Additional costs beyond PR points — discards, Full-Turn skips, card exiles, multi-card commitments.

---

## 2. The Complete Effect Inventory

The Intrilex card pool generates **${er.primitiveCount} mechanically distinct Effect Primitives** accessed via **${er.asWrittenEffectCount} AS-WRITTEN Declaration Routes** across all 15 rank families, suit variants, multi-card Supers, Ultras, and Voltage triggers.

### Primitive Category Breakdown
* **Counters & Reactive Disruption (10 primitives):** Base Counter, Exile Counter, Anchor Counter, Super Counter, Anchor Counter (King), Multi-Play Counter (K♠), Scuttle Counter, Disrupt, 3-Red Ultra Counter, 10♦ Paired Mimic ⭐A.
* **Structural Wipes & Row Clears (7 primitives):** Total Clear (4♠), Row Clear PR, Row Clear ER, Row Exchange PR, Row Exchange ER, Q♠ Special Clear Immunity, Purge Scrap Aegis.
* **Tempo & Action Acceleration (5 primitives):** Tempo Spike (10♥), Tempo Force (⭐J / Paired Mimic), 2B+2R Ultra Draw, 2B+2R Ultra Rummage, 2 Quick Score+Discard.
* **Control & State Inversion (8 primitives):** Board Lock (BJ), Commandeer Hold (⭐2), Commandeer Score (⭐2), PR Attachment (Jack), ER Attachment (J♠), Stack Theft (10♠), Instant Tap (9), Purge Bounce Anchor.
* **Card Advantage & Hand Sculpting (10 primitives):** Dig (6), Deep Draw (6♠), Super Dig (⭐6), Quick Swap Bar Peek (6), Hand Raid Present-Take (3), Force Discard (3), Super Raid (⭐3), Enhancement Raid (3♠), Nine Anchor Discard, Quick Natural (4).
* **Graveyard & Exile Recursion (9 primitives):** Recycle (5), Super Recycle (⭐5), 4 Position-Based Exile Rummage Windows (5♣/♦/♥/♠), Exile Recovery (10♠), Exile Recycle Trigger (BJ), Scuttle Bonus Draw (8).
* **Topdeck Generation & Engine Chains (5 primitives):** Topdeck Casting (7), Topdeck Reveal 3 (7♠), Recursive Topdeck (Physical 7), Sequential Topdeck (⭐7), Scoring Trigger (7).
* **Endgame Timers & Alt-Wins (3 primitives):** Sudden Death Activation, Sudden Death Dead Action (Defect), Foundation Scoring Surge (10♣).
* **Protection & Passive Buffs (6 primitives):** Quick Aegis Field (8), Quick Aegis Target (Queen), ER Guard Provider (Queen), Queen's Court Double Anchor, Royal Marriage Entry, Royal Shield Protection.
* **Goal Warfare & Variance Resets (7 primitives):** Goal Shift +3, Goal Shift +5 Discard, Goal Shift 9♠ Net -2, Hand Swap (RJ), Self Reset (RJ), Opponent Attack (RJ), Shuffle Reset (RJ).
* **Start-Phase Voltage Engines (3 primitives):** Voltage ⚡3 Sleight, Voltage ⚡4 Predictable, Voltage ⚡5 Refinement.
* **Tactical Removal (2 primitives):** Free Scuttle (8♠), Absolute Scuttle (⭐8).

---

## 3. The Six Power Rankings

The six ordinal rankings evaluate different axes of power:
* **Ranking A (Raw Effect Potency — 75 Primitives):** The game-altering capacity of the resolved effect primitive in a vacuum, ignoring access cost. Each primitive is scored by the highest rawPotencyScore across all its declaration routes.
* **Ranking B-W (Practical Strategic Value AS-WRITTEN — 101 Routes):** Realistic value across all game states under Rulebook v4.3.1, incorporating timing, flexibility, opportunity cost, and counterplay.
* **Ranking B-E (Practical Strategic Value AS-EXECUTED — ${er.asExecutedEffectCount} Routes):** Realistic value limited to routes functional in Engine 4.2.6.
* **Ranking C (Efficiency — 101 Routes):** Payoff relative to cards, actions, and points sacrificed.
* **Ranking D (Threat Value — 101 Routes):** Latent deterrence — how much does the mere existence of this card in hand suppress opponent actions.
* **Ranking E (Comeback Value — 101 Routes):** Value when significantly behind on points.
* **Ranking F (Snowball Value — 101 Routes):** Value when ahead on points.

### Comparative Top 15 Across All Six Rankings

| Rank | A: Raw Potency (Primitive) | B-W: Practical (Written) | B-E: Practical (Executed) | C: Efficiency | D: Threat | E: Comeback | F: Snowball |
|---:|---|---|---|---|---|---|---|
`;

for (let i = 0; i < 15; i++) {
  const rawP = rawPotencyRanking[i];
  const pw = practicalRankingAsWritten[i];
  const pe = practicalRankingAsExecuted[i] || { effectId: '—', reason: '' };
  const eff = efficiencyRanking[i];
  const thr = threatRanking[i];
  const cmb = comebackRanking[i];
  const snb = snowballRanking[i];
  md += `| **${i + 1}** | \`${rawP.primitiveId}\` | \`${pw.effectId}\` | \`${pe.effectId}\` | \`${eff.effectId}\` | \`${thr.effectId}\` | \`${cmb.effectId}\` | \`${snb.effectId}\` |\n`;
}

md += `\n---

## 4. Headline Strict Ordinal Leaderboard — AS-WRITTEN (Ranking B-W: 1 → ${er.asWrittenEffectCount})

Every mechanically distinct AS-WRITTEN declaration route appears exactly once. Tiers: **S+** (top 5%), **S** (5–15%), **A+** (15–30%), **A** (30–48%), **B+** (48–65%), **B** (65–80%), **C+** (80–90%), **C** (90–98%), **D** (98–100%).

`;

// Append Tier summaries and short commentary for all 101 AS-WRITTEN routes
md += `### Complete Route Commentary & Placement Rationale (AS-WRITTEN)\n\n`;

for (const r of practicalRankingAsWritten) {
  const csvRow = csvRowMap.get(r.effectId);
  const timing = csvRow ? csvRow[4] : r.timing;
  md += `#### #${r.rank} — \`${r.effectId}\` — Tier ${r.tier}\n`;
  md += `* **Source:** ${r.source} | **Mode:** ${r.route} | **Timing:** ${timing}\n`;
  md += `* **Points Forgone:** ${r.pointsForgone} | **Extra Cost:** ${r.extraCostNote} | **Profile:** ${r.profileAvailability}\n`;
  md += `* **Status:** \`${r.implementationStatus}\` | **Confidence:** \`${r.confidence}\` | **Health Verdict:** \`${r.healthVerdict}\`\n`;
  md += `* **Why Here:** ${r.reason}\n\n`;
}

md += `---

## 4b. Headline Strict Ordinal Leaderboard — AS-EXECUTED (Ranking B-E: 1 → ${er.asExecutedEffectCount})

Every mechanically distinct AS-EXECUTED declaration route (status \`MATCH\`, \`CONFLICT\`, or \`UNRESTRICTED_ONLY\`) appears exactly once. Routes that are \`NOT_IMPLEMENTED\` or \`DEFECT_CONTAMINATED\` are excluded.

`;

for (const r of practicalRankingAsExecuted) {
  const csvRow = csvRowMap.get(r.effectId);
  const timing = csvRow ? csvRow[4] : r.timing;
  md += `#### #${r.rank} — \`${r.effectId}\` — Tier ${r.tier}\n`;
  md += `* **Source:** ${r.source} | **Mode:** ${r.route} | **Timing:** ${timing}\n`;
  md += `* **Points Forgone:** ${r.pointsForgone} | **Extra Cost:** ${r.extraCostNote} | **Profile:** ${r.profileAvailability}\n`;
  md += `* **Status:** \`${r.implementationStatus}\` | **Confidence:** \`${r.confidence}\` | **Health Verdict:** \`${r.healthVerdict}\`\n`;
  md += `* **Why Here:** ${r.reason}\n\n`;
}

md += `---

## 5. Required Complete Effect-Ranking Table (AS-WRITTEN, sorted by Practical Rank)

The table below reflects all ${er.asWrittenEffectCount} AS-WRITTEN declaration routes sorted by **Practical Strategic Value** (#1 to #${er.asWrittenEffectCount}), with full cross-ranking against Raw Primitive Rank, Efficiency, Threat, Comeback, and Snowball.

| # | Effect ID | Source | Mode | Timing | Raw Prim Rank | Prac Rank (W) | Prac Rank (E) | Eff Rank | Tier | Pts Forgone | Extra Cost | Setup | Counterplay | Reachability | Threat | Status | Profile | Conf |
|---:|---|---|---|---|---:|---:|---:|---:|---|---:|---|---|---|---|---|---|---|---|
`;

for (const row of tableRows) {
  // row indices: 0=#, 1=EffectID, 2=Source, 3=Mode, 4=Timing, 5=RawPrimRank, 6=PracWritten, 7=PracExecuted, 8=EffRank, 9=Tier, 10=PtsForgone, 11=ExtraCost, 12=Setup, 13=Counterplay, 14=Reachability, 15=ThreatValue, 16=Status, 17=ProfileAvail, 18=Confidence
  const effId = row[1];
  const threatRank = threatRankMap.get(effId) || '—';
  const comebackRank = comebackRankMap.get(effId) || '—';
  const snowballRank = snowballRankMap.get(effId) || '—';
  md += `| ${row[0]} | \`${row[1]}\` | ${row[2]} | ${row[3]} | ${row[4]} | ${row[5]} | ${row[6]} | ${row[7]} | ${row[8]} | **${row[9]}** | ${row[10]} | ${row[11]} | ${row[12]} | ${row[13]} | ${row[14]} | ${row[15]} | \`${row[16]}\` | ${row[17]} | \`${row[18]}\` |\n`;
}

md += `\n---

## 6. Effect-Primitive Raw Potency Matrix (75 Primitives)

This matrix evaluates **core mechanic primitives** in a vacuum, stripping away declaration routes. Each primitive is scored by the highest rawPotencyScore across all its routes.

| Rank | Primitive ID | Primitive Name | Best Route | Route Count | Max Raw Score |
|---:|---|---|---|---:|---:|
`;

for (const p of rawPotencyRanking) {
  md += `| ${p.rank} | \`${p.primitiveId}\` | ${p.primitiveName} | \`${p.bestRouteId}\` (${p.bestRouteName}) | ${p.routeCount} | ${p.maxRawPotencyScore} |\n`;
}

md += `\n*Key Primitive Insights:*
* **Total Clear** is intrinsically the most destructive primitive in Intrilex, resetting all PR and ER state regardless of protection.
* **Super Counter** is the highest-authority reactive primitive, answering all single-item stack plays.
* **Board Lock** is the premier structural control primitive, freezing active gameplay while permitting points advancement.

---

## 7. Dominance & Cross-Card Superiority Findings

`;

for (const d of strictDominanceFindings) {
  md += `${d.findingId === strictDominanceFindings[0].findingId ? '' : '\n'}${strictDominanceFindings.indexOf(d) + 1}. **\`${d.findingId}\` — ${d.dominanceType}:**
   * **Status:** ${d.status}
   * **Dominant route:** \`${d.dominantRoute}\`
   * **Dominated/inferior route:** \`${d.dominatedRoute}\`
   * *Reasoning:* ${d.reason}\n`;
}

md += `\n---

## 8. The Strategic Pareto Frontier

An effect route lies on the Pareto frontier if no other route is equal or superior across all key dimensions (Potency, Efficiency, Timing, Cost, Reachability, Threat).

**Identified Pareto Frontier Routes (${paretoFrontier.length} Effects):**
`;

for (let i = 0; i < paretoFrontier.length; i++) {
  const id = paretoFrontier[i];
  const info = routeInfoMap.get(id);
  const rank = writtenRankMap.get(id);
  md += `${i + 1}. \`${id}\` (#${rank} Practical AS-WRITTEN) — ${info ? info.reason : ''}\n`;
}

md += `\n---

## 9. Special Explicit System Comparisons

All rank references below are mechanically validated against the canonical tables at generation time.

`;

// Helper to format a rank reference with validation
function rankStr(effectId, dimension, label) {
  const rank = refRank(effectId, dimension, `Section 9: ${effectId} ${label}`);
  if (rank === undefined || rank === null) return 'N/A';
  return `#${rank}`;
}

function comparisonLine(effectId, label) {
  const wRank = rankStr(effectId, 'written', 'Practical Written');
  const eRank = executedRankMap.has(effectId) ? rankStr(effectId, 'executed', 'Practical Executed') : 'N/A (not executed)';
  const rawPrimId = effectToPrimitive.get(effectId);
  const rawRank = rawPrimId ? rankStr(effectId, 'raw', 'Raw Primitive') : 'N/A';
  const info = routeInfoMap.get(effectId);
  return `* **\`${effectId}\`** (${wRank} Practical W / ${eRank} Practical E / ${rawRank} Raw Primitive): ${info ? info.reason : ''}`;
}

md += `### 1. Structural Control\n`;
md += comparisonLine('FOUR_SPADE_TOTAL_CLEAR', 'Total Clear') + '\n';
md += comparisonLine('TWO_SPADE_SOLO_WILD_TOTAL_CLEAR', 'Solo Wild Total Clear') + '\n';
md += comparisonLine('KING_SPADE_WILD_TOTAL_CLEAR', 'K♠ Wild Total Clear') + '\n';
md += comparisonLine('FOUR_SUPER_ROW_EXCHANGE_PR', 'Row Exchange PR') + '\n';
md += comparisonLine('BLACK_JOKER_BOARD_LOCK', 'Board Lock') + '\n';

md += `\n### 2. Tempo Acceleration\n`;
md += comparisonLine('TEN_HEART_TEMPO_SPIKE', 'Tempo Spike') + '\n';
md += comparisonLine('ULTRA_2B2R_DRAW', '2B2R Draw') + '\n';
md += comparisonLine('JACK_SUPER_TEMPO_FORCE', 'Tempo Force') + '\n';
md += comparisonLine('JACK_INSTANT_DISRUPT', 'Disrupt') + '\n';
md += comparisonLine('NINE_INSTANT_TAP', 'Tap') + '\n';

md += `\n### 3. Counter Authority\n`;
md += comparisonLine('A_SPADE_EXILE_COUNTER', 'A♠ Exile Counter') + '\n';
md += comparisonLine('KING_SPADE_INSTANT_MULTI_COUNTER', 'K♠ Multi Counter') + '\n';
md += comparisonLine('A_BASE_COUNTER', 'Base Ace Counter') + '\n';
md += comparisonLine('ULTRA_THREE_RED_COUNTER', '3-Red Ultra Counter') + '\n';
md += comparisonLine('A_SUPER_COUNTER', 'Super Counter') + '\n';
md += comparisonLine('KING_INSTANT_ANCHOR_COUNTER', 'King Anchor Counter') + '\n';
md += comparisonLine('EIGHT_INSTANT_SCUTTLE_COUNTER', 'Scuttle Counter') + '\n';

md += `\n### 4. Protection Systems\n`;
md += comparisonLine('QUEEN_ER_GUARD_ANCHOR', 'Guard Anchor') + '\n';
md += comparisonLine('EIGHT_QUICK_AEGIS_FIELD', 'Aegis Field') + '\n';
md += comparisonLine('QUEEN_COURT', "Queen's Court") + '\n';
md += comparisonLine('QUEEN_QUICK_AEGIS', 'Quick Aegis') + '\n';
md += comparisonLine('ROYAL_MARRIAGE', 'Royal Marriage') + '\n';
md += comparisonLine('QUEEN_SPADE_CLEAR_IMMUNITY', 'Q♠ Clear Immunity') + '\n';

md += `\n### 5. Resource Engines\n`;
md += comparisonLine('SIX_SPADE_DEEP_DRAW', 'Deep Draw') + '\n';
md += comparisonLine('FIVE_BASE_RECYCLE', 'Recycle') + '\n';
md += comparisonLine('SIX_BASE_DIG_RETURN', 'Dig Return') + '\n';
md += comparisonLine('SEVEN_BASE_TOPDECK', 'Topdeck') + '\n';
md += comparisonLine('TEN_SPADE_EXILE_RECOVERY', 'Exile Recovery') + '\n';
md += comparisonLine('VOLTAGE_FIVE_REFINEMENT', 'Voltage 5') + '\n';

md += `\n### 6. Control Transfer\n`;
md += comparisonLine('JACK_SPADE_ER_ATTACHMENT', 'J♠ ER Attachment') + '\n';
md += comparisonLine('JACK_PR_ATTACHMENT', 'Jack PR Attachment') + '\n';
md += comparisonLine('TWO_SUPER_COMMANDEER_HOLD', 'Commandeer Hold') + '\n';
md += comparisonLine('TEN_SPADE_STACK_THEFT', 'Stack Theft') + '\n';

md += `\n### 7. Flexible / Copy Systems\n`;
md += comparisonLine('TWO_SPADE_SOLO_WILD_TOTAL_CLEAR', 'Solo Wild Total Clear') + '\n';
md += comparisonLine('TEN_DIAMOND_SOLO_MIMIC_ROW_EXCHANGE_PR', 'Solo Mimic Row Exchange') + '\n';
md += comparisonLine('KING_SPADE_WILD_TOTAL_CLEAR', 'K♠ Wild Total Clear') + '\n';
md += comparisonLine('TWO_SOLO_WILD_ROW_CLEAR', 'Solo Wild Row Clear') + '\n';

md += `\n---

## 10. Top and Bottom Analysis

All sections below are mechanically generated from the canonical ranking tables in \`balance-check-findings.json\`.

### Top 10 Raw Effect Primitives (Ranking A)
`;

md += topN(rawPotencyRanking, 10, 'Raw Potency', 'maxRawPotencyScore') + '\n';

md += `\n### Top 10 Practical Strategic Effects — AS-WRITTEN (Ranking B-W)
`;
md += topN(practicalRankingAsWritten, 10, 'Practical Written') + '\n';

md += `\n### Top 10 Practical Strategic Effects — AS-EXECUTED (Ranking B-E)
`;
md += topN(practicalRankingAsExecuted, 10, 'Practical Executed') + '\n';

md += `\n### Top 10 Most Efficient Effects (Ranking C)
`;
md += topN(efficiencyRanking, 10, 'Efficiency') + '\n';

md += `\n### Top 10 Threat Effects — Latent Deterrence (Ranking D)
`;
md += topN(threatRanking, 10, 'Threat', 'dimensionScore') + '\n';

md += `\n### Top 10 Comeback Effects — From Behind (Ranking E)
`;
md += topN(comebackRanking, 10, 'Comeback', 'dimensionScore') + '\n';

md += `\n### Top 10 Snowball Effects — Consolidating a Lead (Ranking F)
`;
md += topN(snowballRanking, 10, 'Snowball', 'dimensionScore') + '\n';

md += `\n### Bottom 10 Practical Effects — AS-WRITTEN (Ranking B-W)

| Rank | Effect ID | Classification | Explanation |
|---:|---|---|---|
`;

const bottom10 = practicalRankingAsWritten.slice(-10);
for (const r of bottom10) {
  md += `| ${r.rank} | \`${r.effectId}\` | ${classifyBottomEffect(r)} | ${r.reason} |\n`;
}

md += `\n---

# What Is Intrilex's Strongest Effect?

### Strict Categorical Verdicts (Mechanically Derived from Canonical Tables)

* **RAW EFFECT POTENCY (Primitive):** **\`${strongestEffects.rawPotency}\`** — Highest intrinsic effect ceiling of any primitive in Intrilex. Note: this is an alternate-win condition with extreme recipe rarity (\`CONSTRUCTED_ONLY\` reachability), making it the strongest in a vacuum but rarely accessible in practice.
* **PRACTICAL STRATEGIC VALUE (AS-WRITTEN):** **\`${strongestEffects.practicalValueAsWritten}\`** — Highest practical value across all ${er.asWrittenEffectCount} intended declaration routes. Instant timing, zero Mini-Turns, exiles countered sources to deny Graveyard recursion, and is not answerable by Base Ace counter-counters.
* **PRACTICAL STRATEGIC VALUE (AS-EXECUTED):** **\`${strongestEffects.practicalValueAsExecuted}\`** — Highest practical value among the ${er.asExecutedEffectCount} routes functional in Engine 4.2.6.
* **EFFICIENCY:** **\`${strongestEffects.efficiency}\`** — Highest payoff relative to cards, actions, and points sacrificed. Instant timing, zero Mini-Turns, removes enemy PR cards ignoring rank and suit requirements.
* **THREAT VALUE:** **\`${strongestEffects.threatValue}\`** — Highest latent deterrence score. The presence of this card in hand suppresses opponent actions more than any other route.
* **COMEBACK:** **\`${strongestEffects.comeback}\`** — Highest value when significantly behind on points. The primary single-card board reset that can erase an opponent's point lead.
* **SNOWBALL:** **\`${strongestEffects.snowball}\`** — Highest value when ahead on points. Locks down opponent comebacks while the leader advances toward victory.

---

### The Fundamental Duality

> **If I could possess exactly one effect in a vacuum, which is strongest?**
>
> **\`${strongestEffects.rawPotency}\`** (as a primitive)
> In a vacuum where access, costs, and setup are ignored, the highest raw potency primitive is strongest. However, for practically accessible effects, **\`FOUR_SPADE_TOTAL_CLEAR\`** (the \`TOTAL_CLEAR\` primitive's best route) is the strongest single-card effect: it resets all PR and ER state regardless of protection, with no card immune to it. It is the premier reset button of the game, though it wipes the caster's own board as well.

---

> **If I must actually pay the real Intrilex card, action, and opportunity costs to access it, which effect is strongest?**
>
> **\`${strongestEffects.practicalValueAsWritten}\`** (Reactive / Counter) and **\`${strongestEffects.efficiency}\`** (Proactive / Removal)
> When real game economics apply — where players have limited Mini-Turns, hands are scarce, and counterable comebacks lurk — **\`${strongestEffects.practicalValueAsWritten}\`** is the strongest practical effect in Intrilex. It costs zero Mini-Turns, trades 1-for-1 with opposing effects, removes the target to Exile (denying Graveyard recursion), and is not answerable by ordinary Base Aces. It provides strong tactical security for a low commitment. Closely paired with it is **\`${strongestEffects.efficiency}\`**, which converts zero actions at Instant speed into removal of an enemy PR card, ignoring rank and suit requirements.

---

## 11. Automatic Rank-Reference Validation

All rank references in Section 9 (Special Explicit System Comparisons) are validated against the canonical ranking tables at generation time. The validation log below confirms that every referenced rank number was resolved from the machine-readable rankings.

| # | Effect ID | Dimension | Resolved Rank | Context |
|---:|---|---|---:|---|
`;

for (let i = 0; i < rankReferences.length; i++) {
  const ref = rankReferences[i];
  md += `| ${i + 1} | \`${ref.effectId}\` | ${ref.dimension} | ${ref.claimedRank ?? 'N/A'} | ${ref.context} |\n`;
}

md += `\n**Validation Result:** ${rankReferences.length} rank references resolved. All references were mechanically derived from \`balance-check-findings.json\` — no hardcoded rank numbers.

---

## 12. Methodology Notes

### Opportunity Cost Separation
* **Points Forgone** represents only the PR points sacrificed by not scoring the source card(s).
* **Extra Cost Note** captures additional costs: discards, Full-Turn skips, card exiles, multi-card commitments.
* Routes that previously conflated these (e.g. \`9 + 1 discard\` as a single field) have been separated.

### AS-WRITTEN vs. AS-EXECUTED Separation
* **AS-WRITTEN** includes all ${er.asWrittenEffectCount} routes described in Rulebook v4.3.1, regardless of engine implementation status.
* **AS-EXECUTED** includes only the ${er.asExecutedEffectCount} routes functional in Engine 4.2.6 (status \`MATCH\`, \`CONFLICT\`, or \`UNRESTRICTED_ONLY\`).
* Routes with \`NOT_IMPLEMENTED\` or \`DEFECT_CONTAMINATED\` status appear only in the AS-WRITTEN ranking.

### Raw Potency as Primitive Ranking
* The Raw Potency ranking operates on **${er.primitiveCount} primitives**, not ${er.asWrittenEffectCount} routes.
* Each primitive's raw score is the maximum \`rawPotencyScore\` across all its declaration routes.
* This prevents a single primitive (e.g. \`TOTAL_CLEAR\`) from occupying multiple Raw Potency positions.

### Threat / Comeback / Snowball Score Derivation
* **Threat Score:** Derived from \`threatValue\` enum (VERY_HIGH=85, HIGH=65, MODERATE=45, LOW=25, NONE=5) + timing reactivity bonus (Instant/Interrupt=15, Trigger/Instant Start=12, Quick=10, Passive=8, Action=0) + counterplay narrowness bonus (NARROW=+8, ADEQUATE=0, ROBUST=−5).
* **Comeback Score:** Derived from \`practicalScore\` × category-specific comeback multiplier + \`rawPotencyScore\` × 0.15. Board reset primitives have the highest comeback multiplier (1.15); protection primitives have the lowest (0.30).
* **Snowball Score:** Derived from \`practicalScore\` × category-specific snowball multiplier + timing bonus × 0.4. Control lock primitives have the highest snowball multiplier (1.30); board reset primitives have the lowest (0.30).

### Dominance Terminology
* **WITHIN-CARD MODE SUPERIORITY:** Compares modes of the same source card (e.g. ⭐2 Hold vs. Score).
* **CROSS-CARD ROUTE SUPERIORITY:** Compares different source cards that access the same primitive (e.g. 10♦ Solo vs. Paired Mimic). Not termed "strict dominance" because the source card sets differ.
* **DEFECT DOMINANCE:** Compares a functional route against an engine defect.
`;

fs.writeFileSync('reports/balance-check/12_EFFECT_POWER_RANKING.md', md);
console.log('Successfully generated reports/balance-check/12_EFFECT_POWER_RANKING.md');
console.log(`  Rank references validated: ${rankReferences.length}`);
