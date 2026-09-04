// scripts/generate-effect-power-rankings.mjs
// Final analytical extension for Intrilex Complete Balance Check Pass
// Strictly read-only relative to canonical gameplay; outputs report and CSV/JSON artifacts.

import fs from 'fs';
import path from 'path';

// 1. Definition of the 102 Declaration Routes and their respective Primitives
// Each route captures:
// - id: unique Effect ID
// - name: human-readable name
// - source: card source (rank, exact suit, combination)
// - mode: mode / sub-mode name
// - primitiveId: underlying effect primitive
// - primitiveName: name of the primitive
// - timing: Action, Quick, Instant, Interrupt, Trigger, Passive
// - pointsForgone: PR points sacrificed (number)
// - setup: qualitative setup requirement
// - counterplay: counterability classification
// - reachability: COMMON, PLAUSIBLE, RARE, CONSTRUCTED_ONLY
// - threatValue: HIGH, MODERATE, LOW, NONE
// - status: MATCH, CONFLICT, NOT_IMPLEMENTED, DEFECT_CONTAMINATED, UNRESTRICTED_ONLY
// - confidence: VERY_HIGH, HIGH, MODERATE, LOW, SPECULATIVE
// - healthVerdict: STRONG BUT HEALTHY, HEALTHY, NICHE BUT HEALTHY, WATCHLIST, BLOCKED, INSUFFICIENT
// - rawPotencyScore: relative numeric score [1..100] for sorting Raw Potency
// - practicalScore: relative numeric score [1..100] for sorting Practical Strategic Value
// - efficiencyScore: relative numeric score [1..100] for sorting Efficiency
// - commentary: 1-3 sentences explaining placement

const routes = [
  // Rank A
  {
    id: "A_BASE_COUNTER",
    name: "Base Ace Counter",
    source: "A♣ / A♦ / A♥",
    mode: "Base Counter",
    primitiveId: "BASE_COUNTER",
    primitiveName: "Negate Ordinary Effect / Counter",
    timing: "Instant",
    pointsForgone: 4,
    setup: "Low (pending effect/counter)",
    counterplay: "ROBUST (Ace-family, 3-Red)",
    reachability: "COMMON",
    threatValue: "VERY_HIGH",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "STRONG BUT HEALTHY",
    rawPotencyScore: 68,
    practicalScore: 92,
    efficiencyScore: 88,
    commentary: "Universal reactive response against ordinary effect plays. Available in 3 copies, it establishes the fundamental counter threat that shapes all sequencing, held in check by the 4-point PR scoring sacrifice."
  },
  {
    id: "A_SPADE_EXILE_COUNTER",
    name: "A♠ Exile Counter",
    source: "A♠",
    mode: "Exile Counter",
    primitiveId: "EXILE_COUNTER",
    primitiveName: "Negate & Exile Source Cards",
    timing: "Instant",
    pointsForgone: 4,
    setup: "Low (pending effect/counter)",
    counterplay: "NARROW (⭐A or 3-Red only)",
    reachability: "RARE",
    threatValue: "VERY_HIGH",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "STRONG BUT HEALTHY",
    rawPotencyScore: 78,
    practicalScore: 97,
    efficiencyScore: 94,
    commentary: "Functionally superior to Base Ace as an answer: it exiles the countered card (denying Graveyard recursion) and is not answerable by Base Ace counter-counters. Its singleton scarcity (1 copy vs. 3 copies) prevents it from distorting general play."
  },
  {
    id: "A_ANCHOR_ENTRY",
    name: "Anchor Ace",
    source: "Any Ace",
    mode: "Anchor Entry & Sacrifice",
    primitiveId: "ANCHOR_COUNTER",
    primitiveName: "ER Delayed Counter & Source Steal",
    timing: "Action",
    pointsForgone: 4,
    setup: "Requires ER deployment",
    counterplay: "ADEQUATE (Kings counter entry; Aces counter resolution)",
    reachability: "COMMON",
    threatValue: "HIGH",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "STRONG BUT HEALTHY",
    rawPotencyScore: 72,
    practicalScore: 79,
    efficiencyScore: 74,
    commentary: "Publicly visible threat deterrence that converts a sacrificed Ace into a stolen opponent card (revealed until Start). Consumes an Action Mini-Turn upfront, trading tempo for future card advantage."
  },
  {
    id: "A_PURGE_SCRAP_AEGIS",
    name: "Ace Purge (Scrap Aegis)",
    source: "Any Ace",
    mode: "Purge Mode 1",
    primitiveId: "PURGE_SCRAP_AEGIS",
    primitiveName: "Scrap Aegised Card",
    timing: "Action",
    pointsForgone: 4,
    setup: "Aegised card OTT",
    counterplay: "ROBUST (Aces)",
    reachability: "COMMON",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 65,
    practicalScore: 61,
    efficiencyScore: 58,
    commentary: "Specific targeted answer that explicitly pierces Aegis immunity. Highly valuable in Aegis-heavy boards (e.g. against 8-Quick or ⭐4), but narrow when no Aegis is active."
  },
  {
    id: "A_PURGE_BOUNCE_ANCHOR",
    name: "Ace Purge (Bounce Anchor)",
    source: "Any Ace",
    mode: "Purge Mode 2",
    primitiveId: "PURGE_BOUNCE_ANCHOR",
    primitiveName: "Bounce Vulnerable Anchor",
    timing: "Action",
    pointsForgone: 4,
    setup: "Vulnerable enemy Anchor, no Aegised cards OTT",
    counterplay: "ROBUST (Aces, Guard)",
    reachability: "COMMON",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 58,
    practicalScore: 56,
    efficiencyScore: 54,
    commentary: "Fallback mode when no Aegis exists, bouncing an enemy Anchor to hand. Conditional on zero Aegis existing OTT, limiting its tactical flexibility."
  },
  {
    id: "A_SUPER_COUNTER",
    name: "⭐A Super Counter",
    source: "⭐A (2 Aces)",
    mode: "Super Counter",
    primitiveId: "SUPER_COUNTER",
    primitiveName: "Absolute Counter Authority",
    timing: "Instant",
    pointsForgone: 8,
    setup: "2 Aces in hand, pending play, <2 enemy Queens",
    counterplay: "NARROW (Blocked by Two-Queen Defense)",
    reachability: "RARE",
    threatValue: "VERY_HIGH",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "STRONG BUT HEALTHY",
    rawPotencyScore: 91,
    practicalScore: 84,
    efficiencyScore: 66,
    commentary: "Absolute counter authority capable of shutting down Ultras, Board Lock, and Sudden Death. Extremely powerful but heavily taxed by committing two Aces (8 forgone PR points) and blocked by Two-Queen Defense."
  },

  // Rank 2
  {
    id: "TWO_QUICK_SCORE_DISCARD",
    name: "2 Quick Score+Discard",
    source: "Any Two",
    mode: "Quick Score & Discard",
    primitiveId: "QUICK_SCORE_DISCARD",
    primitiveName: "Score 2 & Force Discard",
    timing: "Quick",
    pointsForgone: 0,
    setup: "Own Full Turn",
    counterplay: "ROBUST (Aces counter effect)",
    reachability: "COMMON",
    threatValue: "MODERATE",
    status: "NOT_IMPLEMENTED",
    confidence: "LOW",
    healthVerdict: "WATCHLIST",
    rawPotencyScore: 52,
    practicalScore: 83,
    efficiencyScore: 96,
    commentary: "In written rules, grants zero-cost PR points while attacking opponent hand size without spending a Mini-Turn. Extremely efficient positive-sum play; completely fail-closed in Engine 4.2.6."
  },
  {
    id: "TWO_SOLO_WILD_BOUNCE",
    name: "2 Solo Wild -> 3-Bounce",
    source: "Any suited Two",
    mode: "Solo Wild (3-Bounce)",
    primitiveId: "BOUNCE_OTT_TOP_DP",
    primitiveName: "Bounce OTT Card to Top DP",
    timing: "Action",
    pointsForgone: 2,
    setup: "OTT target",
    counterplay: "ROBUST (Aces, Guard)",
    reachability: "COMMON",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 54,
    practicalScore: 58,
    efficiencyScore: 64,
    commentary: "Copies rank-3 bounce for only 2 points forgone rather than 3. Decent tempo tool against exposed enemy cards, though subject to standard Guard and Ace counterplay."
  },
  {
    id: "TWO_SOLO_WILD_ROW_CLEAR",
    name: "2 Solo Wild -> 4-Row Clear",
    source: "Any suited Two",
    mode: "Solo Wild (4-Row Clear)",
    primitiveId: "ROW_CLEAR_PR",
    primitiveName: "Clear Enemy PR / ER",
    timing: "Action",
    pointsForgone: 2,
    setup: "Enemy row present",
    counterplay: "ROBUST (Aces)",
    reachability: "COMMON",
    threatValue: "MODERATE",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 74,
    practicalScore: 77,
    efficiencyScore: 82,
    commentary: "Enables any Two to wipe an enemy row for only 2 points sacrificed. Excellent efficiency and comeback potential, respecting Aegis and effect immunities."
  },
  {
    id: "TWO_SPADE_SOLO_WILD_TOTAL_CLEAR",
    name: "2♠ Solo Wild -> 4♠ Total Clear",
    source: "2♠",
    mode: "Solo Wild (Total Clear)",
    primitiveId: "TOTAL_CLEAR",
    primitiveName: "Global OTT Structural Reset",
    timing: "Action",
    pointsForgone: 2,
    setup: "OTT cards present",
    counterplay: "ROBUST (Aces)",
    reachability: "RARE",
    threatValue: "HIGH",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "WATCHLIST",
    rawPotencyScore: 94,
    practicalScore: 93,
    efficiencyScore: 95,
    commentary: "Provides a single-card global board reset for only 2 points forgone and zero extra discard cost. Highest efficiency board wipe in the game, turning 2♠ into a second natural 4♠."
  },
  {
    id: "TWO_SOLO_WILD_RECYCLE",
    name: "2 Solo Wild -> 5-Recycle",
    source: "Any suited Two",
    mode: "Solo Wild (5-Recycle)",
    primitiveId: "RECYCLE",
    primitiveName: "Mill 2, GY Rummage, Draw Bottom",
    timing: "Action",
    pointsForgone: 2,
    setup: "DP >= 2",
    counterplay: "ROBUST (Aces)",
    reachability: "COMMON",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 60,
    practicalScore: 66,
    efficiencyScore: 72,
    commentary: "Card advantage engine yielding net +1 card for a 2-point sacrifice. Solid mid-game value play when the Graveyard is populated."
  },
  {
    id: "TWO_SPADE_SOLO_WILD_DEEP_DRAW",
    name: "2♠ Solo Wild -> 6♠ Deep Draw",
    source: "2♠",
    mode: "Solo Wild (Deep Draw)",
    primitiveId: "DEEP_DRAW",
    primitiveName: "Discard 1-2, Draw 6, Keep 3-4",
    timing: "Action",
    pointsForgone: 2,
    setup: ">=1 other hand card",
    counterplay: "ROBUST (Aces)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 75,
    practicalScore: 81,
    efficiencyScore: 78,
    commentary: "Massive hand sculpting tool that lets 2♠ dig 6 cards deep into the deck. Exceptional for assembling combo pieces or lethal scoring lines late in the game."
  },
  {
    id: "TWO_SOLO_WILD_TOPDECK",
    name: "2 Solo Wild -> 7-Topdeck",
    source: "Any suited Two",
    mode: "Solo Wild (Topdeck)",
    primitiveId: "TOPDECK_CASTING",
    primitiveName: "Topdeck Casting: Hand + Generated Play",
    timing: "Action",
    pointsForgone: 2,
    setup: "DP >= 2",
    counterplay: "ROBUST (Aces)",
    reachability: "COMMON",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 66,
    practicalScore: 63,
    efficiencyScore: 67,
    commentary: "Gambit play that reveals 2 cards from DP, adding one to hand and generating an immediate play. High variance, but cheaper than playing a Seven."
  },
  {
    id: "TWO_SUPER_COMMANDEER_HOLD",
    name: "⭐2 Commandeer (Hold)",
    source: "⭐2 (2 Twos)",
    mode: "Commandeer Hold",
    primitiveId: "COMMANDEER_HOLD",
    primitiveName: "Steal OTT Card, Tap to Start",
    timing: "Action",
    pointsForgone: 4,
    setup: "Enemy OTT card (non-Aegis)",
    counterplay: "NARROW (K♠, Aegis)",
    reachability: "RARE",
    threatValue: "MODERATE",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "NICHE BUT HEALTHY",
    rawPotencyScore: 83,
    practicalScore: 78,
    efficiencyScore: 71,
    commentary: "Steals any enemy OTT card, bypassing Guard and rank immunity. Hold mode taps it until Start, allowing the caster to deploy its effect for free or keep it as an anchor."
  },
  {
    id: "TWO_SUPER_COMMANDEER_SCORE",
    name: "⭐2 Commandeer (Score)",
    source: "⭐2 (2 Twos)",
    mode: "Commandeer Score",
    primitiveId: "COMMANDEER_SCORE",
    primitiveName: "Steal OTT Card, Score to PR",
    timing: "Action",
    pointsForgone: 4,
    setup: "Enemy OTT card (non-Aegis)",
    counterplay: "NARROW (K♠, Aegis)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "NICHE BUT HEALTHY",
    rawPotencyScore: 80,
    practicalScore: 70,
    efficiencyScore: 68,
    commentary: "Immediately transfers an enemy card into the caster's PR as points. Generally inferior to Hold mode in practice, because Hold allows scoring at next Start while preserving effect options. However, Score mode provides immediate, undisruptable PR points — the tapped card in Hold mode can be answered by K♠ or other removal before Start."
  },

  // Rank 3
  {
    id: "THREE_BASE_HAND_RAID",
    name: "3 Hand Raid",
    source: "Any Three",
    mode: "Hand Raid (present-take)",
    primitiveId: "HAND_RAID_PRESENT_TAKE",
    primitiveName: "Opponent Presents <=3, Take <=2",
    timing: "Action",
    pointsForgone: 3,
    setup: "Opponent has hand cards",
    counterplay: "ROBUST (Aces)",
    reachability: "COMMON",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 56,
    practicalScore: 62,
    efficiencyScore: 63,
    commentary: "Forces opponent to present cards and steals up to 2 (revealed until Start). Direct hand disruption that simultaneously expands the caster's hand."
  },
  {
    id: "THREE_BASE_FORCE_DISCARD",
    name: "3 Force Discard",
    source: "Any Three",
    mode: "Force Discard",
    primitiveId: "FORCE_DISCARD",
    primitiveName: "Opponent Discards <=2",
    timing: "Action",
    pointsForgone: 3,
    setup: "Opponent has hand cards",
    counterplay: "ROBUST (Aces)",
    reachability: "COMMON",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 52,
    practicalScore: 54,
    efficiencyScore: 57,
    commentary: "Forces opponent to discard up to 2 cards of their choice. Pure card attrition, useful against opponents hoarding combos or responses."
  },
  {
    id: "THREE_BASE_BOUNCE",
    name: "3 Bounce",
    source: "Any Three",
    mode: "Bounce OTT",
    primitiveId: "BOUNCE_OTT_TOP_DP",
    primitiveName: "Bounce OTT Card to Top DP",
    timing: "Action",
    pointsForgone: 3,
    setup: "Vulnerable OTT target",
    counterplay: "ROBUST (Aces, Guard)",
    reachability: "COMMON",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 54,
    practicalScore: 57,
    efficiencyScore: 59,
    commentary: "Removes an exposed enemy card to the top of the Draw Pile. Disrupts tempo, but gives the opponent the card back on their next draw."
  },
  {
    id: "THREE_INSTANT_BOUNCE",
    name: "3 Instant Bounce",
    source: "Any Three",
    mode: "Instant Bounce",
    primitiveId: "INSTANT_BOUNCE",
    primitiveName: "Instant Bounce to Top/Bottom DP",
    timing: "Instant",
    pointsForgone: 3,
    setup: "Response window, OTT target",
    counterplay: "ROBUST (Aces, Guard)",
    reachability: "COMMON",
    threatValue: "MODERATE",
    status: "NOT_IMPLEMENTED",
    confidence: "LOW",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 64,
    practicalScore: 74,
    efficiencyScore: 81,
    commentary: "Written as an Instant-speed bounce to top or bottom of DP. Highly potent reactive disruption, but absent from executable Core authority."
  },
  {
    id: "THREE_SPADE_ENHANCEMENT",
    name: "3♠ Enhancement",
    source: "3♠",
    mode: "Hand Raid Enhancement",
    primitiveId: "ENHANCEMENT_RAID",
    primitiveName: "Present <=2, Score or Cast 1",
    timing: "Action",
    pointsForgone: 3,
    setup: "Opponent has hand cards",
    counterplay: "ROBUST (Aces)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "NOT_IMPLEMENTED",
    confidence: "LOW",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 68,
    practicalScore: 69,
    efficiencyScore: 73,
    commentary: "Written as forcing presentation of 2 cards and immediately scoring or casting one under your control. High ceiling, but fail-closed in Engine 4.2.6."
  },
  {
    id: "THREE_SUPER_RAID",
    name: "⭐3 Super Raid",
    source: "⭐3 (2 Threes)",
    mode: "Super Raid",
    primitiveId: "SUPER_RAID",
    primitiveName: "Steal Opponent Hand Card",
    timing: "Action",
    pointsForgone: 6,
    setup: "Opponent has hand cards",
    counterplay: "NARROW (K♠)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "UNRESTRICTED_ONLY",
    confidence: "MODERATE",
    healthVerdict: "INSUFFICIENT",
    rawPotencyScore: 67,
    practicalScore: 60,
    efficiencyScore: 51,
    commentary: "Commits two Threes to strip a card directly from the opponent's hand. High card investment for a single hand steal, limited to Unrestricted profile."
  },

  // Rank 4
  {
    id: "FOUR_BASE_ROW_CLEAR_PR",
    name: "4 Row Clear PR",
    source: "Any Four",
    mode: "Row Clear PR",
    primitiveId: "ROW_CLEAR_PR",
    primitiveName: "Clear Enemy PR",
    timing: "Action",
    pointsForgone: 4,
    setup: "Enemy PR cards present",
    counterplay: "ROBUST (Aces, Aegis)",
    reachability: "COMMON",
    threatValue: "HIGH",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 74,
    practicalScore: 82,
    efficiencyScore: 80,
    commentary: "Wipes all vulnerable enemy PR cards to the Graveyard for 1 Action. Major comeback equalizer that prevents opponents from running away with point leads, stopped cleanly by Aegis."
  },
  {
    id: "FOUR_BASE_ROW_CLEAR_ER",
    name: "4 Row Clear ER",
    source: "Any Four",
    mode: "Row Clear ER",
    primitiveId: "ROW_CLEAR_ER",
    primitiveName: "Clear Enemy ER",
    timing: "Action",
    pointsForgone: 4,
    setup: "Enemy ER Anchors present",
    counterplay: "ROBUST (Aces, Aegis)",
    reachability: "COMMON",
    threatValue: "HIGH",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 72,
    practicalScore: 80,
    efficiencyScore: 79,
    commentary: "Wipes all enemy ER Anchors (except Q♠ and Aegised cards) to the Graveyard. Essential tool for breaking Queen Guard fortresses and King anchor totals."
  },
  {
    id: "FOUR_QUICK_NATURAL",
    name: "4 Quick Natural",
    source: "Any Four",
    mode: "Quick Natural",
    primitiveId: "QUICK_NATURAL",
    primitiveName: "Reorder Top 4 DP, Draw 1",
    timing: "Quick",
    pointsForgone: 4,
    setup: "DP >= 4",
    counterplay: "ROBUST (Aces)",
    reachability: "COMMON",
    threatValue: "LOW",
    status: "NOT_IMPLEMENTED",
    confidence: "LOW",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 50,
    practicalScore: 71,
    efficiencyScore: 85,
    commentary: "Written as a Quick reorder of top 4 DP cards and drawing 1 without spending a Mini-Turn. Excellent deck manipulation, but unimplemented in executable Core."
  },
  {
    id: "FOUR_SPADE_TOTAL_CLEAR",
    name: "4♠ Total Clear",
    source: "4♠ natural",
    mode: "Total Clear",
    primitiveId: "TOTAL_CLEAR",
    primitiveName: "Global OTT Structural Reset",
    timing: "Action",
    pointsForgone: 4,
    setup: "OTT cards present",
    counterplay: "ROBUST (Aces)",
    reachability: "RARE",
    threatValue: "HIGH",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "WATCHLIST",
    rawPotencyScore: 94,
    practicalScore: 94,
    efficiencyScore: 90,
    commentary: "The ultimate board reset: clears every card from PR and ER across all players, hard-bypassing Guard, Aegis, Q♠, and all immunities. Wipes own board too, enforcing fair comeback symmetry."
  },
  {
    id: "FOUR_SUPER_ROW_EXCHANGE_PR",
    name: "⭐4 Row Exchange PR",
    source: "⭐4 (2 Fours)",
    mode: "Row Exchange PR",
    primitiveId: "ROW_EXCHANGE_PR",
    primitiveName: "Swap PR Rows, Grant Aegis",
    timing: "Action",
    pointsForgone: 8,
    setup: "PR rows present",
    counterplay: "NARROW (K♠)",
    reachability: "RARE",
    threatValue: "HIGH",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "NICHE BUT HEALTHY",
    rawPotencyScore: 88,
    practicalScore: 81,
    efficiencyScore: 69,
    commentary: "Structurally swaps PR rows between players and grants Aegis to all exchanged cards. Can produce a massive instant 20+ point swing when trailing, but requires 2 Fours and is countered by K♠."
  },
  {
    id: "FOUR_SUPER_ROW_EXCHANGE_ER",
    name: "⭐4 Row Exchange ER",
    source: "⭐4 (2 Fours)",
    mode: "Row Exchange ER",
    primitiveId: "ROW_EXCHANGE_ER",
    primitiveName: "Swap ER Rows, Grant Aegis",
    timing: "Action",
    pointsForgone: 8,
    setup: "ER rows present",
    counterplay: "NARROW (K♠)",
    reachability: "RARE",
    threatValue: "MODERATE",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "NICHE BUT HEALTHY",
    rawPotencyScore: 84,
    practicalScore: 75,
    efficiencyScore: 65,
    commentary: "Swaps Enduring Rows, seizing an opponent's entire anchor fortress and granting them Aegis. High setup requirement and niche application compared to PR exchange."
  },

  // Rank 5
  {
    id: "FIVE_BASE_RECYCLE",
    name: "5 Recycle",
    source: "Any Five",
    mode: "Recycle Line",
    primitiveId: "RECYCLE",
    primitiveName: "Mill 2, GY Rummage, Draw Bottom",
    timing: "Action",
    pointsForgone: 5,
    setup: "DP >= 2",
    counterplay: "ROBUST (Aces)",
    reachability: "COMMON",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 60,
    practicalScore: 67,
    efficiencyScore: 68,
    commentary: "Mills 2 cards, rummages 1 from Graveyard into hand, and draws the bottom Graveyard card. Generates net +1 card advantage while recycling spent resources."
  },
  {
    id: "FIVE_CLUB_EXILE_RUMMAGE",
    name: "5♣ Exile Rummage",
    source: "5♣",
    mode: "Suit Rummage (Newest 2)",
    primitiveId: "EXILE_RUMMAGE_WINDOW",
    primitiveName: "Rummage Exile by Position",
    timing: "Action",
    pointsForgone: 5,
    setup: "Exile >= 1",
    counterplay: "ROBUST (Aces)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "NOT_IMPLEMENTED",
    confidence: "LOW",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 58,
    practicalScore: 59,
    efficiencyScore: 60,
    commentary: "Written as rummaging from the newest 2 cards in Exile. Entirely unimplemented in code, collapsing into generic 5 Recycle."
  },
  {
    id: "FIVE_DIAMOND_EXILE_RUMMAGE",
    name: "5♦ Exile Rummage",
    source: "5♦",
    mode: "Suit Rummage (Middle, >=5)",
    primitiveId: "EXILE_RUMMAGE_WINDOW",
    primitiveName: "Rummage Exile by Position",
    timing: "Action",
    pointsForgone: 5,
    setup: "Exile >= 5",
    counterplay: "ROBUST (Aces)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "NOT_IMPLEMENTED",
    confidence: "LOW",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 55,
    practicalScore: 52,
    efficiencyScore: 55,
    commentary: "Written as rummaging from middle Exile cards when Exile has ≥5 cards. Restrictive condition; unimplemented in executable engine."
  },
  {
    id: "FIVE_HEART_EXILE_RUMMAGE",
    name: "5♥ Exile Rummage",
    source: "5♥",
    mode: "Suit Rummage (Oldest 2)",
    primitiveId: "EXILE_RUMMAGE_WINDOW",
    primitiveName: "Rummage Exile by Position",
    timing: "Action",
    pointsForgone: 5,
    setup: "Exile >= 1",
    counterplay: "ROBUST (Aces)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "NOT_IMPLEMENTED",
    confidence: "LOW",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 58,
    practicalScore: 58,
    efficiencyScore: 59,
    commentary: "Written as rummaging from the oldest 2 cards in Exile. Unimplemented in engine."
  },
  {
    id: "FIVE_SPADE_EXILE_RUMMAGE",
    name: "5♠ Exile Rummage",
    source: "5♠",
    mode: "Suit Rummage (Any Card)",
    primitiveId: "EXILE_RUMMAGE_WINDOW",
    primitiveName: "Rummage Exile by Position",
    timing: "Action",
    pointsForgone: 5,
    setup: "Exile >= 1",
    counterplay: "ROBUST (Aces)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "NOT_IMPLEMENTED",
    confidence: "LOW",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 66,
    practicalScore: 68,
    efficiencyScore: 66,
    commentary: "Written as accessing any card in Exile without positional restrictions. Most flexible written Exile rummage; fail-closed in Engine 4.2.6."
  },
  {
    id: "FIVE_SUPER_RECYCLE",
    name: "⭐5 Super Recycle",
    source: "⭐5 (2 Fives)",
    mode: "Super Recycle",
    primitiveId: "SUPER_RECYCLE",
    primitiveName: "Mill 4, Rummage GY, Draw 2 Bottom",
    timing: "Action",
    pointsForgone: 10,
    setup: "DP >= 4",
    counterplay: "NARROW (K♠)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "UNRESTRICTED_ONLY",
    confidence: "MODERATE",
    healthVerdict: "INSUFFICIENT",
    rawPotencyScore: 70,
    practicalScore: 64,
    efficiencyScore: 52,
    commentary: "Mills 4 and draws 2 from bottom of GY. High resource cost (2 Fives = 10 PR points sacrificed) for modest card advantage."
  },

  // Rank 6
  {
    id: "SIX_BASE_DIG_RETURN",
    name: "6 Dig (Return to DP)",
    source: "Any Six",
    mode: "Dig Mode 1",
    primitiveId: "DIG",
    primitiveName: "Draw 3, Keep 2, Return 1",
    timing: "Action",
    pointsForgone: 6,
    setup: "DP >= 3",
    counterplay: "ROBUST (Aces)",
    reachability: "COMMON",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 58,
    practicalScore: 72,
    efficiencyScore: 69,
    commentary: "Draws 3 cards, keeps 2, and returns 1 to top/bottom of DP. Net +1 card and clean selection, competing against a strong 6-point PR score."
  },
  {
    id: "SIX_BASE_DIG_DISCARD",
    name: "6 Dig (Discard)",
    source: "Any Six",
    mode: "Dig Mode 2",
    primitiveId: "DIG",
    primitiveName: "Draw 3, Keep 3, Discard 1",
    timing: "Action",
    pointsForgone: 6,
    setup: "DP >= 3",
    counterplay: "ROBUST (Aces)",
    reachability: "COMMON",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 58,
    practicalScore: 70,
    efficiencyScore: 67,
    commentary: "Draws 3 and discards 1 from hand to GY. Fuels Graveyard strategies while netting +1 card in hand."
  },
  {
    id: "SIX_QUICK_SWAP_BAR_PEEK",
    name: "6 Quick Swap Bar Peek",
    source: "Any Six",
    mode: "Quick Swap Bar Peek",
    primitiveId: "QUICK_SWAP_BAR_PEEK",
    primitiveName: "Look Face-Down Bar, Take/Cast",
    timing: "Quick",
    pointsForgone: 6,
    setup: "Face-down Swap Bar card exists",
    counterplay: "ROBUST (Aces on cast)",
    reachability: "COMMON",
    threatValue: "LOW",
    status: "NOT_IMPLEMENTED",
    confidence: "LOW",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 55,
    practicalScore: 65,
    efficiencyScore: 76,
    commentary: "Written as inspecting face-down Swap Bar cards and taking or immediately casting one without spending a Mini-Turn. Unimplemented in Core engine."
  },
  {
    id: "SIX_SPADE_DEEP_DRAW",
    name: "6♠ Deep Draw",
    source: "6♠ natural",
    mode: "Deep Draw",
    primitiveId: "DEEP_DRAW",
    primitiveName: "Discard 1-2, Draw 6, Keep 3-4",
    timing: "Action",
    pointsForgone: 6,
    setup: ">=1 other hand card",
    counterplay: "ROBUST (Aces)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 75,
    practicalScore: 85,
    efficiencyScore: 75,
    commentary: "Exceptional card sculpting tool that discards 1–2 cards, draws 6, and keeps 3–4. Gives 6♠ tremendous mid-to-late game value for assembling lethal lines."
  },
  {
    id: "SIX_SUPER_DIG",
    name: "⭐6 Super Dig",
    source: "⭐6 (2 Sixes)",
    mode: "Super Dig",
    primitiveId: "SUPER_DIG",
    primitiveName: "Discard 1-2, Draw 8, Keep 5-6",
    timing: "Action",
    pointsForgone: 12,
    setup: ">=1 other hand card",
    counterplay: "NARROW (K♠)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "DEFECT_CONTAMINATED",
    confidence: "MODERATE",
    healthVerdict: "INSUFFICIENT",
    rawPotencyScore: 78,
    practicalScore: 35,
    efficiencyScore: 30,
    commentary: "Designed as an 8-card draw engine. Defect-contaminated in Unrestricted (enumerator forces keep list empty, resulting in pure card loss)."
  },

  // Rank 7
  {
    id: "SEVEN_BASE_TOPDECK",
    name: "7 Topdeck Casting",
    source: "Any Seven",
    mode: "Topdeck Casting",
    primitiveId: "TOPDECK_CASTING",
    primitiveName: "Topdeck: 1 Hand + 1 Generated Play",
    timing: "Action",
    pointsForgone: 7,
    extraCostNote: "AS-EXECUTED: 7-pt scoring blocked by IMPL-01",
    setup: "DP >= 2",
    counterplay: "ROBUST (Aces)",
    reachability: "COMMON",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "BLOCKED",
    rawPotencyScore: 66,
    practicalScore: 65,
    efficiencyScore: 70,
    commentary: "Reveals top 2 DP cards: 1 added to hand (revealed), 1 declared immediately as a generated play. Value is heavily distorted in executable game by missing 7-point scoring fallback."
  },
  {
    id: "SEVEN_SCORING_TRIGGER",
    name: "7 Scoring Trigger",
    source: "Any Seven scored",
    mode: "Scoring Trigger",
    primitiveId: "SCORING_TRIGGER_SEVEN",
    primitiveName: "When Scored: Reveal 2, Take 1",
    timing: "Trigger",
    pointsForgone: 0,
    setup: "Seven scored for Points",
    counterplay: "NARROW (Triggers don't use effect counters)",
    reachability: "COMMON",
    threatValue: "MODERATE",
    status: "NOT_IMPLEMENTED",
    confidence: "LOW",
    healthVerdict: "BLOCKED",
    rawPotencyScore: 62,
    practicalScore: 86,
    efficiencyScore: 97,
    commentary: "In written design, scoring a Seven grants 7 PR points AND reveals 2 cards to take 1 into hand. Massive card-plus-point value; completely blocked in Engine 4.2.6 by IMPL-01."
  },
  {
    id: "SEVEN_SPADE_TOPDECK",
    name: "7♠ Topdeck Casting",
    source: "7♠",
    mode: "Topdeck Casting (Reveal 3)",
    primitiveId: "TOPDECK_CASTING_REVEAL_3",
    primitiveName: "Topdeck: Reveal 3, Assign Hand/Effect",
    timing: "Action",
    pointsForgone: 7,
    setup: "DP >= 3",
    counterplay: "ROBUST (Aces)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "NOT_IMPLEMENTED",
    confidence: "LOW",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 70,
    practicalScore: 69,
    efficiencyScore: 72,
    commentary: "Written as revealing 3 cards from DP for greater assignment choice. Unimplemented in executable engine."
  },
  {
    id: "SEVEN_RECURSIVE_TOPDECK",
    name: "7 Recursive Topdeck",
    source: "Physical Seven revealed",
    mode: "Recursive Topdeck",
    primitiveId: "TOPDECK_RECURSION",
    primitiveName: "Chain Nested Topdeck Casting",
    timing: "Action",
    pointsForgone: 0,
    setup: "Topdeck casting active, physical 7 revealed",
    counterplay: "ROBUST (Aces)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "NOT_IMPLEMENTED",
    confidence: "LOW",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 72,
    practicalScore: 73,
    efficiencyScore: 80,
    commentary: "Written as allowing chained Topdeck Casting when a physical Seven is revealed. Recursion helper is dead code in the engine."
  },
  {
    id: "SEVEN_SUPER_TOPDECK",
    name: "⭐7 Super Topdeck",
    source: "⭐7 (2 Sevens)",
    mode: "Sequential Topdeck",
    primitiveId: "SUPER_TOPDECK",
    primitiveName: "Sequential Independent Topdecks",
    timing: "Action",
    pointsForgone: 14,
    setup: "DP >= 4",
    counterplay: "NARROW (K♠)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "DEFECT_CONTAMINATED",
    confidence: "MODERATE",
    healthVerdict: "INSUFFICIENT",
    rawPotencyScore: 82,
    practicalScore: 32,
    efficiencyScore: 28,
    commentary: "Designed as sequential independent Topdeck casting across multiple revealed cards. Defect-contaminated in Unrestricted (empty assignment lists)."
  },

  // Rank 8
  {
    id: "EIGHT_QUICK_AEGIS_FIELD",
    name: "8 Quick Aegis Field",
    source: "Any Eight",
    mode: "Quick Aegis Field",
    primitiveId: "QUICK_AEGIS_FIELD",
    primitiveName: "Aegis to All Friendly OTT Cards",
    timing: "Quick",
    pointsForgone: 8,
    setup: "Friendly OTT cards",
    counterplay: "NARROW (Cannot be countered by Base Ace)",
    reachability: "COMMON",
    threatValue: "HIGH",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "STRONG BUT HEALTHY",
    rawPotencyScore: 81,
    practicalScore: 91,
    efficiencyScore: 87,
    commentary: "Grants hard Aegis immunity to all friendly PR and ER cards (except Nines) until next Start without spending a Mini-Turn. Critical protection tool that locks in a point lead before passing the turn."
  },
  {
    id: "EIGHT_INSTANT_SCUTTLE_COUNTER",
    name: "8 Scuttle Counter",
    source: "Any Eight",
    mode: "Instant Scuttle Counter",
    primitiveId: "SCUTTLE_COUNTER",
    primitiveName: "Counter Pending Scuttle",
    timing: "Instant",
    pointsForgone: 8,
    setup: "Pending Scuttle on stack",
    counterplay: "ROBUST (Counter-counters)",
    reachability: "COMMON",
    threatValue: "HIGH",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "STRONG BUT HEALTHY",
    rawPotencyScore: 61,
    practicalScore: 78,
    efficiencyScore: 77,
    commentary: "The sole designated counter to Scuttle attempts. Preserves high-value PR cards and creates latent defensive threat merely by sitting in hand."
  },
  {
    id: "EIGHT_SCUTTLE_BONUS",
    name: "8 Scuttle Bonus",
    source: "Any Eight",
    mode: "Scuttle Bonus Draw",
    primitiveId: "SCUTTLE_BONUS",
    primitiveName: "Draw GY upon Successful Scuttle",
    timing: "Trigger",
    pointsForgone: 8,
    setup: "Resolve ordinary Scuttle with 8",
    counterplay: "None (Trigger)",
    reachability: "COMMON",
    threatValue: "LOW",
    status: "NOT_IMPLEMENTED",
    confidence: "LOW",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 51,
    practicalScore: 76,
    efficiencyScore: 86,
    commentary: "Written as drawing 1 from top/bottom of Graveyard when resolving an ordinary Scuttle using an Eight. Unimplemented in engine."
  },
  {
    id: "EIGHT_SPADE_FREE_SCUTTLE",
    name: "8♠ Free Scuttle",
    source: "8♠ natural",
    mode: "Instant Free Scuttle",
    primitiveId: "FREE_SCUTTLE",
    primitiveName: "Instant Free Scuttle Any Rank/Suit",
    timing: "Instant",
    pointsForgone: 8,
    setup: "Enemy PR card (non-Aegis, non-immune)",
    counterplay: "ADEQUATE (8 Scuttle Counter, Aegis)",
    reachability: "RARE",
    threatValue: "VERY_HIGH",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "STRONG BUT HEALTHY",
    rawPotencyScore: 77,
    practicalScore: 96,
    efficiencyScore: 98,
    commentary: "Zero Mini-Turn tactical removal at Instant response speed, completely ignoring rank and suit requirements. Exceptional tempo weapon that punishes unguarded high-value PR cards (88.9% conversion in telemetry)."
  },
  {
    id: "EIGHT_SUPER_ABSOLUTE_SCUTTLE",
    name: "⭐8 Absolute Scuttle",
    source: "⭐8 (2 Eights)",
    mode: "Absolute Scuttle",
    primitiveId: "ABSOLUTE_SCUTTLE",
    primitiveName: "Scuttle Ignoring Immunity & Rank",
    timing: "Action",
    pointsForgone: 16,
    setup: "Enemy PR card (non-Aegis)",
    counterplay: "NARROW (K♠, Aegis)",
    reachability: "RARE",
    threatValue: "MODERATE",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "NICHE BUT HEALTHY",
    rawPotencyScore: 80,
    practicalScore: 72,
    efficiencyScore: 56,
    commentary: "Destroys any enemy PR card, bypassing ordinary Scuttle immunity (e.g. against Aces, Fives, Red Joker). Stopped by Aegis and carries a massive 16-point opportunity cost."
  },

  // Rank 9
  {
    id: "NINE_INSTANT_TAP",
    name: "9 Instant Tap",
    source: "Any Nine",
    mode: "Instant Tap",
    primitiveId: "INSTANT_TAP",
    primitiveName: "Tap Enemy PR (Untaps on Score)",
    timing: "Instant",
    pointsForgone: 9,
    setup: "Enemy PR card",
    counterplay: "ROBUST (Aces, Guard, Scoring untaps)",
    reachability: "COMMON",
    threatValue: "HIGH",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 64,
    practicalScore: 82,
    efficiencyScore: 84,
    commentary: "Instant-speed point denial that reduces an enemy PR card's contribution to 0 until that player scores again. Highly effective for denying lethal victory at End Phase."
  },
  {
    id: "NINE_INSTANT_GOAL_SHIFT_THREE",
    name: "9 Goal Shift (+3)",
    source: "Any Nine",
    mode: "Goal Shift +3",
    primitiveId: "GOAL_SHIFT_THREE",
    primitiveName: "Increase Opponent Goal by 3",
    timing: "Instant",
    pointsForgone: 9,
    setup: "Opponent target",
    counterplay: "ROBUST (Aces, Kings)",
    reachability: "COMMON",
    threatValue: "LOW",
    status: "NOT_IMPLEMENTED",
    confidence: "LOW",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 53,
    practicalScore: 55,
    efficiencyScore: 53,
    commentary: "Written as permanently raising opponent's Goal by 3 at Instant speed. Unenumerated in Core authority."
  },
  {
    id: "NINE_INSTANT_GOAL_SHIFT_FIVE",
    name: "9 Goal Shift (+5 Discard)",
    source: "Any Nine",
    mode: "Goal Shift +5",
    primitiveId: "GOAL_SHIFT_FIVE",
    primitiveName: "Increase Opponent Goal by 5, Discard 1",
    timing: "Instant",
    pointsForgone: 9,
    extraCostNote: "+1 discard",
    setup: ">=1 other hand card",
    counterplay: "ROBUST (Aces, Kings)",
    reachability: "COMMON",
    threatValue: "LOW",
    status: "NOT_IMPLEMENTED",
    confidence: "LOW",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 63,
    practicalScore: 61,
    efficiencyScore: 55,
    commentary: "Written as raising opponent's Goal by 5 at the cost of discarding an additional card. Unenumerated in Core."
  },
  {
    id: "NINE_SPADE_GOAL_SHIFT",
    name: "9♠ Goal Shift",
    source: "9♠",
    mode: "Goal Shift (+5, Discard, Own -2)",
    primitiveId: "GOAL_SHIFT_SPADE",
    primitiveName: "Opponent Goal +5, Own Goal -2",
    timing: "Instant",
    pointsForgone: 9,
    extraCostNote: "+1 discard",
    setup: ">=1 other hand card",
    counterplay: "ROBUST (Aces, Kings)",
    reachability: "RARE",
    threatValue: "MODERATE",
    status: "NOT_IMPLEMENTED",
    confidence: "LOW",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 73,
    practicalScore: 75,
    efficiencyScore: 65,
    commentary: "Written as a 7-point net goal swing (+5 to opponent, -2 to self). Major strategic lever, but unenumerated in Core."
  },
  {
    id: "NINE_ANCHOR",
    name: "Nine Anchor",
    source: "Any Nine",
    mode: "Anchor Entry & Hand Discard",
    primitiveId: "NINE_ANCHOR_DISCARD",
    primitiveName: "Reveal Hand, Discard 1",
    timing: "Action",
    pointsForgone: 9,
    setup: "Opponent has hand cards",
    counterplay: "ROBUST (Aces, Kings)",
    reachability: "COMMON",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 62,
    practicalScore: 67,
    efficiencyScore: 61,
    commentary: "Enters ER as an anchor, reveals opponent's complete hand, and forces 1 discard. Only 1 active Nine Anchor allowed at a time."
  },

  // Rank 10
  {
    id: "TEN_CLUB_FOUNDATION",
    name: "10♣ Foundation",
    source: "10♣ natural",
    mode: "Foundation Entry & Bonus Score",
    primitiveId: "FOUNDATION_SCORING_SURGE",
    primitiveName: "10 Pts + Entry Aegis (+Bonus Score if 0 Pts)",
    timing: "Action",
    pointsForgone: 10,
    setup: "Best at 0 PR points",
    counterplay: "NARROW (⭐A, 3-Red only via IMPL-12)",
    reachability: "RARE",
    threatValue: "HIGH",
    status: "CONFLICT",
    confidence: "VERY_HIGH",
    healthVerdict: "WATCHLIST",
    rawPotencyScore: 82,
    practicalScore: 87,
    efficiencyScore: 89,
    commentary: "Scores 10 points with immediate Aegis; if starting at 0 points, allows scoring a bonus card for free. Enables rare Turn-1 21-point wins with Black Joker; counterplay is currently narrowed by IMPL-12."
  },
  {
    id: "TEN_DIAMOND_SOLO_MIMIC_ROW_EXCHANGE_PR",
    name: "10♦ Solo Mimic ⭐4 PR",
    source: "10♦ natural",
    mode: "Solo Mimic ⭐4 PR",
    primitiveId: "ROW_EXCHANGE_PR",
    primitiveName: "Swap PR Rows, Grant Aegis",
    timing: "Action",
    pointsForgone: 10,
    setup: "PR rows present",
    counterplay: "NARROW (⭐A, 3-Red only via IMPL-12)",
    reachability: "RARE",
    threatValue: "HIGH",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "WATCHLIST",
    rawPotencyScore: 88,
    practicalScore: 85,
    efficiencyScore: 76,
    commentary: "Single-card Row Exchange executed through 10♦ without needing a second Four. Inverts points boards while granting Aegis, currently protected from Base Ace by IMPL-12."
  },
  {
    id: "TEN_DIAMOND_SOLO_MIMIC_ROW_EXCHANGE_ER",
    name: "10♦ Solo Mimic ⭐4 ER",
    source: "10♦ natural",
    mode: "Solo Mimic ⭐4 ER",
    primitiveId: "ROW_EXCHANGE_ER",
    primitiveName: "Swap ER Rows, Grant Aegis",
    timing: "Action",
    pointsForgone: 10,
    setup: "ER rows present",
    counterplay: "NARROW (⭐A, 3-Red only via IMPL-12)",
    reachability: "RARE",
    threatValue: "MODERATE",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "NICHE BUT HEALTHY",
    rawPotencyScore: 84,
    practicalScore: 76,
    efficiencyScore: 70,
    commentary: "Single-card Enduring Row swap executed via 10♦, stealing an enemy anchor setup."
  },
  {
    id: "TEN_DIAMOND_PAIRED_MIMIC_ROW_EXCHANGE",
    name: "10♦ Paired Mimic ⭐4",
    source: "10♦ + any Two",
    mode: "Paired Mimic ⭐4",
    primitiveId: "ROW_EXCHANGE_PR",
    primitiveName: "Swap Rows (Paired)",
    timing: "Action",
    pointsForgone: 12,
    setup: "Rows present",
    counterplay: "NARROW (K♠, ⭐A)",
    reachability: "RARE",
    threatValue: "MODERATE",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "NICHE BUT HEALTHY",
    rawPotencyScore: 88,
    practicalScore: 73,
    efficiencyScore: 62,
    commentary: "Cross-card inferior to Solo Mimic ⭐4 because it consumes 10♦ PLUS an extra Two for the exact same result. The additional Two card commitment yields zero additional effect."
  },
  {
    id: "TEN_DIAMOND_PAIRED_MIMIC_ABSOLUTE_SCUTTLE",
    name: "10♦ Paired Mimic ⭐8",
    source: "10♦ + any Two",
    mode: "Paired Mimic ⭐8",
    primitiveId: "ABSOLUTE_SCUTTLE",
    primitiveName: "Absolute Scuttle (Paired)",
    timing: "Action",
    pointsForgone: 12,
    setup: "Enemy PR card",
    counterplay: "NARROW (K♠, Aegis)",
    reachability: "RARE",
    threatValue: "MODERATE",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "NICHE BUT HEALTHY",
    rawPotencyScore: 80,
    practicalScore: 71,
    efficiencyScore: 59,
    commentary: "Destroys any enemy PR card ignoring Scuttle immunity by combining 10♦ and a Two. Heavy 12-point commitment."
  },
  {
    id: "TEN_DIAMOND_PAIRED_MIMIC_SUPER_J_TEMPO",
    name: "10♦ Paired Mimic ⭐J",
    source: "10♦ + any Two",
    mode: "Paired Mimic ⭐J",
    primitiveId: "TEMPO_FORCE",
    primitiveName: "+2 Mini-Turns (Paired)",
    timing: "Action",
    pointsForgone: 12,
    setup: "Action phase",
    counterplay: "NARROW (K♠)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "NICHE BUT HEALTHY",
    rawPotencyScore: 76,
    practicalScore: 68,
    efficiencyScore: 57,
    commentary: "Converts 10♦ and a Two into +2 Mini-Turns (net +1 action). Inferior to 10♥ which does this as a single card and draws 1."
  },
  {
    id: "TEN_DIAMOND_PAIRED_MIMIC_SUPER_ACE",
    name: "10♦ Paired Mimic ⭐A",
    source: "10♦ + any Two",
    mode: "Paired Mimic ⭐A",
    primitiveId: "SUPER_COUNTER",
    primitiveName: "Absolute Counter Authority (Mimic)",
    timing: "Instant",
    pointsForgone: 12,
    setup: "Pending play, <2 Queens",
    counterplay: "NARROW (Two-Queen Defense)",
    reachability: "RARE",
    threatValue: "HIGH",
    status: "NOT_IMPLEMENTED",
    confidence: "LOW",
    healthVerdict: "WATCHLIST",
    rawPotencyScore: 91,
    practicalScore: 82,
    efficiencyScore: 64,
    commentary: "Written as allowing 10♦ + Two to mimic ⭐A counter authority at Instant speed. Absent from executable Core authority."
  },
  {
    id: "TEN_DIAMOND_PAIRED_MIMIC_SUPER_THREE",
    name: "10♦ Paired Mimic ⭐3",
    source: "10♦ + any Two",
    mode: "Paired Mimic ⭐3",
    primitiveId: "SUPER_RAID",
    primitiveName: "Super Raid (Mimic)",
    timing: "Action",
    pointsForgone: 12,
    setup: "Opponent hand cards",
    counterplay: "NARROW (K♠)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "NOT_IMPLEMENTED",
    confidence: "LOW",
    healthVerdict: "INSUFFICIENT",
    rawPotencyScore: 67,
    practicalScore: 53,
    efficiencyScore: 46,
    commentary: "Written as mimicking ⭐3 Super Raid with 10♦ + Two. Unimplemented in Core."
  },
  {
    id: "TEN_DIAMOND_PAIRED_MIMIC_SUPER_FIVE",
    name: "10♦ Paired Mimic ⭐5",
    source: "10♦ + any Two",
    mode: "Paired Mimic ⭐5",
    primitiveId: "SUPER_RECYCLE",
    primitiveName: "Super Recycle (Mimic)",
    timing: "Action",
    pointsForgone: 12,
    setup: "DP >= 4",
    counterplay: "NARROW (K♠)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "NOT_IMPLEMENTED",
    confidence: "LOW",
    healthVerdict: "INSUFFICIENT",
    rawPotencyScore: 70,
    practicalScore: 57,
    efficiencyScore: 48,
    commentary: "Written as mimicking ⭐5 Super Recycle. Unimplemented in Core."
  },
  {
    id: "TEN_DIAMOND_PAIRED_MIMIC_SUPER_SIX",
    name: "10♦ Paired Mimic ⭐6",
    source: "10♦ + any Two",
    mode: "Paired Mimic ⭐6",
    primitiveId: "SUPER_DIG",
    primitiveName: "Super Dig (Mimic)",
    timing: "Action",
    pointsForgone: 12,
    extraCostNote: "+1-2 discards for Deep Draw",
    setup: "Hand cards",
    counterplay: "NARROW (K♠)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "NOT_IMPLEMENTED",
    confidence: "LOW",
    healthVerdict: "INSUFFICIENT",
    rawPotencyScore: 78,
    practicalScore: 50,
    efficiencyScore: 42,
    commentary: "Written as mimicking ⭐6 Super Dig. Unimplemented in Core."
  },
  {
    id: "TEN_DIAMOND_PAIRED_MIMIC_SUPER_SEVEN",
    name: "10♦ Paired Mimic ⭐7",
    source: "10♦ + any Two",
    mode: "Paired Mimic ⭐7",
    primitiveId: "SUPER_TOPDECK",
    primitiveName: "Super Topdeck (Mimic)",
    timing: "Action",
    pointsForgone: 12,
    setup: "DP >= 4",
    counterplay: "NARROW (K♠)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "NOT_IMPLEMENTED",
    confidence: "LOW",
    healthVerdict: "INSUFFICIENT",
    rawPotencyScore: 82,
    practicalScore: 48,
    efficiencyScore: 40,
    commentary: "Written as mimicking ⭐7 Sequential Topdeck. Unimplemented in Core."
  },
  {
    id: "TEN_HEART_TEMPO_SPIKE",
    name: "10♥ Tempo Spike",
    source: "10♥ natural",
    mode: "Tempo Spike",
    primitiveId: "TEMPO_SPIKE",
    primitiveName: "+2 Mini-Turns, Draw 1, Exile Source",
    timing: "Action",
    pointsForgone: 10,
    setup: "Action phase",
    counterplay: "NARROW (⭐A, 3-Red only via IMPL-12)",
    reachability: "RARE",
    threatValue: "HIGH",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "WATCHLIST",
    rawPotencyScore: 84,
    practicalScore: 90,
    efficiencyScore: 84,
    commentary: "Massive action surge granting +2 Mini-Turns (net +1) and drawing 1 card. Sacrifices 10 points and exiles itself, currently nearly uncounterable due to IMPL-12 Base Ace immunity."
  },
  {
    id: "TEN_SPADE_STACK_THEFT",
    name: "10♠ Stack Theft",
    source: "10♠ natural",
    mode: "Stack Theft (Interrupt)",
    primitiveId: "STACK_THEFT",
    primitiveName: "Seize Single Effect, Both Players Skip FT",
    timing: "Interrupt",
    pointsForgone: 10,
    extraCostNote: "+1 Full-Turn skip",
    setup: "Pending single effect",
    counterplay: "NARROW (⭐A, 3-Red only via IMPL-12)",
    reachability: "RARE",
    threatValue: "VERY_HIGH",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "NICHE BUT HEALTHY",
    rawPotencyScore: 86,
    practicalScore: 80,
    efficiencyScore: 71,
    commentary: "Interrupt-speed effect theft that seizes an opponent's pending play, imposes a Full-Turn skip on both players, and exiles 10♠. High drama, balanced by severe self-skip penalty."
  },
  {
    id: "TEN_SPADE_EXILE_RECOVERY",
    name: "10♠ Exile Recovery",
    source: "10♠ natural",
    mode: "Exile Recovery",
    primitiveId: "EXILE_RECOVERY",
    primitiveName: "Recover 1 Card from Exile (Revealed)",
    timing: "Action",
    pointsForgone: 10,
    setup: "Non-empty Exile",
    counterplay: "NARROW (⭐A, 3-Red only via IMPL-12)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 68,
    practicalScore: 64,
    efficiencyScore: 60,
    commentary: "The sole targeted single-card Exile recovery in the game. Swaps 10♠ for any exiled card (revealed until Start), exiling 10♠ in the process."
  },

  // Rank J
  {
    id: "JACK_INSTANT_DISRUPT",
    name: "Jack Instant Disrupt",
    source: "Any Jack",
    mode: "Instant Disrupt",
    primitiveId: "DISRUPT",
    primitiveName: "Draw 1, Prohibit Action Type Repeat",
    timing: "Instant",
    pointsForgone: 3,
    setup: "Opponent Action declaration",
    counterplay: "ROBUST (Aces)",
    reachability: "COMMON",
    threatValue: "HIGH",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 57,
    practicalScore: 88,
    efficiencyScore: 97,
    commentary: "Zero net card cost: draws 1 card immediately while preventing the active player from repeating their chosen Action type this turn. Exceptional tactical limiter (160 executions in corpus)."
  },
  {
    id: "JACK_PR_ATTACHMENT",
    name: "Jack PR Attachment",
    source: "Any Jack",
    mode: "PR Attachment",
    primitiveId: "ATTACHMENT_PR",
    primitiveName: "Attach to Enemy PR Card (+1, Control)",
    timing: "Action",
    pointsForgone: 3,
    setup: "Vulnerable enemy PR card",
    counterplay: "ROBUST (Aces, Guard, Aegis, Severance)",
    reachability: "COMMON",
    threatValue: "MODERATE",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 71,
    practicalScore: 76,
    efficiencyScore: 79,
    commentary: "Seizes control of an enemy PR card and adds +1 point to it. Creates substantial 2-way point swings (e.g. stealing a 10 swings 21 points), but vulnerable to Jack severance."
  },
  {
    id: "JACK_SPADE_ER_ATTACHMENT",
    name: "J♠ ER Attachment",
    source: "J♠ natural",
    mode: "ER Attachment",
    primitiveId: "ATTACHMENT_ER",
    primitiveName: "Attach to Enemy Anchor, Gain Control",
    timing: "Action",
    pointsForgone: 3,
    setup: "Enemy ER Anchor",
    counterplay: "ROBUST (Aces, Aegis, Severance)",
    reachability: "RARE",
    threatValue: "HIGH",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 79,
    practicalScore: 82,
    efficiencyScore: 83,
    commentary: "Steals an enemy ER Anchor (including Queens and Kings). Stealing a Queen transfers her Guard to the caster, flipping board protection upside down."
  },
  {
    id: "JACK_SUPER_TEMPO_FORCE",
    name: "⭐J Tempo Force",
    source: "⭐J (2 Jacks)",
    mode: "Tempo Force",
    primitiveId: "TEMPO_FORCE",
    primitiveName: "+2 Mini-Turns (Cap 3)",
    timing: "Action",
    pointsForgone: 6,
    setup: "Action phase",
    counterplay: "NARROW (K♠)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "NICHE BUT HEALTHY",
    rawPotencyScore: 76,
    practicalScore: 74,
    efficiencyScore: 70,
    commentary: "Commits 2 Jacks to gain +2 Mini-Turns (net +1 action). Clean action accelerator, though requiring a true pair of Jacks."
  },

  // Rank Q
  {
    id: "QUEEN_ER_GUARD_ANCHOR",
    name: "Queen ER Guard Anchor",
    source: "Any Queen",
    mode: "ER Anchor (Guard)",
    primitiveId: "GUARD_PROTECTION",
    primitiveName: "Provide Guard to Other Friendly OTT Cards",
    timing: "Action",
    pointsForgone: 2,
    setup: "Action phase",
    counterplay: "ADEQUATE (Clears, ⭐2, J♠, Kings on entry)",
    reachability: "COMMON",
    threatValue: "VERY_HIGH",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "STRONG BUT HEALTHY",
    rawPotencyScore: 76,
    practicalScore: 89,
    efficiencyScore: 88,
    commentary: "Enters ER with protected-entry Aegis and establishes Guard, shielding all other friendly cards from enemy single-target effects. The defensive foundation of control decks."
  },
  {
    id: "QUEEN_QUICK_AEGIS",
    name: "Queen Quick Aegis",
    source: "Any Queen",
    mode: "Quick Aegis",
    primitiveId: "QUICK_AEGIS_TARGET",
    primitiveName: "Grant Aegis to 1 Friendly OTT Card",
    timing: "Quick",
    pointsForgone: 2,
    setup: "Friendly OTT card",
    counterplay: "NARROW (Cannot be countered by Base Ace)",
    reachability: "COMMON",
    threatValue: "HIGH",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "STRONG BUT HEALTHY",
    rawPotencyScore: 65,
    practicalScore: 84,
    efficiencyScore: 91,
    commentary: "Grants hard Aegis immunity to one friendly card until next Start without spending a Mini-Turn (once per FT). Shields critical high-value PR points from removal."
  },
  {
    id: "QUEEN_COURT",
    name: "Queen's Court",
    source: "2 Queens from hand",
    mode: "Queen's Court",
    primitiveId: "QUEENS_COURT_DOUBLE_ANCHOR",
    primitiveName: "Commit 2 Queens to ER with Aegis",
    timing: "Action",
    pointsForgone: 4,
    setup: "2 Queens in hand",
    counterplay: "NARROW (K♠ only standard counter)",
    reachability: "RARE",
    threatValue: "VERY_HIGH",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "STRONG BUT HEALTHY",
    rawPotencyScore: 85,
    practicalScore: 86,
    efficiencyScore: 77,
    commentary: "Commits two Queens to ER simultaneously for 1 Mini-Turn. Both gain entry Aegis, establishing mutual Guard and activating Two-Queen Defense against ⭐A."
  },
  {
    id: "QUEEN_SPADE_CLEAR_IMMUNITY",
    name: "Q♠ Clear Immunity",
    source: "Q♠ OTT",
    mode: "Passive Clear Immunity",
    primitiveId: "Q_SPADE_CLEAR_IMMUNITY",
    primitiveName: "Immunity to Non-Total Clears",
    timing: "Passive",
    pointsForgone: 2,
    setup: "Q♠ deployed OTT",
    counterplay: "NARROW (4♠, ⭐2, J♠)",
    reachability: "RARE",
    threatValue: "HIGH",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "WATCHLIST",
    rawPotencyScore: 73,
    practicalScore: 79,
    efficiencyScore: 82,
    commentary: "Passive ability making Q♠ immune to 4 Row Clear ER. Allows Queen fortresses to survive ordinary row sweeps; only 4♠ Total Clear or control theft can dislodge it."
  },
  {
    id: "ROYAL_SHIELD_PROTECTION",
    name: "Royal Shield Protection",
    source: "Queen count advantage",
    mode: "Royal Shield Snapshot",
    primitiveId: "ROYAL_SHIELD_PROTECTION",
    primitiveName: "Block Base/Anchor Ace Counters",
    timing: "Passive",
    pointsForgone: 0,
    setup: "Friendly Queens > enemy Queens",
    counterplay: "A♠, K♠, ⭐A",
    reachability: "PLAUSIBLE",
    threatValue: "HIGH",
    status: "NOT_IMPLEMENTED",
    confidence: "LOW",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 63,
    practicalScore: 75,
    efficiencyScore: 89,
    commentary: "Written as shielding protected plays from Base Ace counters when controlling more Queens than the opponent. Completely unasserted in executable code (IMPL-08)."
  },

  // Rank K
  {
    id: "KING_INSTANT_ANCHOR_COUNTER",
    name: "King Anchor Counter",
    source: "Any non-♠ King",
    mode: "Instant Anchor Counter",
    primitiveId: "ANCHOR_COUNTER_KING",
    primitiveName: "Counter Single-Card Anchor / Goal-Mod",
    timing: "Instant",
    pointsForgone: 8,
    setup: "Pending single-card Anchor play",
    counterplay: "ROBUST (Counter-counters)",
    reachability: "COMMON",
    threatValue: "HIGH",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "STRONG BUT HEALTHY",
    rawPotencyScore: 65,
    practicalScore: 81,
    efficiencyScore: 78,
    commentary: "Instant counter targeting single-card Anchor plays (Queens, Kings, Ace Anchors). Keeps opponent anchor engines in check, balanced by sacrificing 8 PR points."
  },
  {
    id: "KING_SPADE_INSTANT_MULTI_COUNTER",
    name: "K♠ Counter Multi-Play",
    source: "K♠ natural",
    mode: "Counter Multi-Play",
    primitiveId: "COUNTER_MULTI_PLAY",
    primitiveName: "Counter Any Multi-Card Play (Supers, QC, RM)",
    timing: "Instant",
    pointsForgone: 8,
    setup: "Pending multi-card play",
    counterplay: "ROBUST (Counter-counters, cannot counter Ultras)",
    reachability: "RARE",
    threatValue: "VERY_HIGH",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "STRONG BUT HEALTHY",
    rawPotencyScore: 85,
    practicalScore: 95,
    efficiencyScore: 91,
    commentary: "The sole standard direct counter to Queen's Court, Royal Marriage, Supers, and paired 10♦. Massive latent deterrence that forces opponents to hold multi-card combos until K♠ is exhausted."
  },
  {
    id: "KING_BASE_ANCHOR",
    name: "King Base Anchor",
    source: "Any non-♠ King",
    mode: "ER Anchor (7 pts)",
    primitiveId: "ANCHOR_PASSIVE_SCORE",
    primitiveName: "Provide ER Anchor Value (7 pts)",
    timing: "Action",
    pointsForgone: 8,
    setup: "Action phase",
    counterplay: "ADEQUATE (Kings counter, Clears, J♠)",
    reachability: "COMMON",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "STRONG BUT HEALTHY",
    rawPotencyScore: 60,
    practicalScore: 73,
    efficiencyScore: 71,
    commentary: "Deploys into ER providing 7 anchor points (61 executions in corpus). Decisive for winning Exhausted tiebreakers while keeping PR safe from Scuttle."
  },
  {
    id: "KING_SPADE_ANCHOR",
    name: "K♠ Anchor",
    source: "K♠ natural",
    mode: "ER Anchor (9 pts)",
    primitiveId: "ANCHOR_PASSIVE_SCORE",
    primitiveName: "Provide ER Anchor Value (9 pts)",
    timing: "Action",
    pointsForgone: 8,
    setup: "Action phase",
    counterplay: "ADEQUATE (Kings counter, Clears, J♠)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "STRONG BUT HEALTHY",
    rawPotencyScore: 66,
    practicalScore: 77,
    efficiencyScore: 76,
    commentary: "Deploys into ER providing 9 anchor points. Highest single anchor value in the game, but sacrifices K♠'s multi-play counter and Wild Sovereignty."
  },
  {
    id: "ROYAL_MARRIAGE",
    name: "Royal Marriage",
    source: "Same-suit King + Queen",
    mode: "Royal Marriage",
    primitiveId: "ROYAL_MARRIAGE_ENTRY",
    primitiveName: "Deploy King + Queen to ER simultaneously",
    timing: "Action",
    pointsForgone: 10,
    setup: "Same-suit K + Q in hand",
    counterplay: "NARROW (K♠ only standard counter)",
    reachability: "RARE",
    threatValue: "HIGH",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "STRONG BUT HEALTHY",
    rawPotencyScore: 82,
    practicalScore: 83,
    efficiencyScore: 72,
    commentary: "Deploys both King and Queen to ER simultaneously for 1 Mini-Turn; Queen enters with protected Aegis. Establishes anchor value (7 or 9) and Guard in a single action, counterable only by K♠."
  },
  {
    id: "KING_SPADE_WILD_BOUNCE",
    name: "K♠ Wild -> 3-Bounce",
    source: "K♠ natural",
    mode: "Wild Sovereignty (3-Bounce)",
    primitiveId: "BOUNCE_OTT_TOP_DP",
    primitiveName: "Bounce OTT Card to Top DP",
    timing: "Action",
    pointsForgone: 8,
    setup: "OTT target",
    counterplay: "ROBUST (Aces, Guard)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "NICHE BUT HEALTHY",
    rawPotencyScore: 54,
    practicalScore: 45,
    efficiencyScore: 41,
    commentary: "Copies 3-Bounce through Wild Sovereignty, exiling K♠ permanently. Poor trade of a premium 8-point counter for a minor bounce."
  },
  {
    id: "KING_SPADE_WILD_ROW_CLEAR",
    name: "K♠ Wild -> 4-Row Clear",
    source: "K♠ natural",
    mode: "Wild Sovereignty (4-Row Clear)",
    primitiveId: "ROW_CLEAR_PR",
    primitiveName: "Clear Enemy Row",
    timing: "Action",
    pointsForgone: 8,
    setup: "Enemy row present",
    counterplay: "ROBUST (Aces)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "NICHE BUT HEALTHY",
    rawPotencyScore: 74,
    practicalScore: 66,
    efficiencyScore: 55,
    commentary: "Wipes an enemy row using K♠, exiling K♠ afterward. Useful emergency reset when no Four is held."
  },
  {
    id: "KING_SPADE_WILD_TOTAL_CLEAR",
    name: "K♠ Wild -> 4♠ Total Clear",
    source: "K♠ natural",
    mode: "Wild Sovereignty (Total Clear)",
    primitiveId: "TOTAL_CLEAR",
    primitiveName: "Global OTT Structural Reset",
    timing: "Action",
    pointsForgone: 8,
    extraCostNote: "+1 discard, K♠ exiled",
    setup: ">=1 other hand card, OTT cards present",
    counterplay: "ROBUST (Aces)",
    reachability: "RARE",
    threatValue: "HIGH",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "STRONG BUT HEALTHY",
    rawPotencyScore: 94,
    practicalScore: 89,
    efficiencyScore: 74,
    commentary: "Executes 4♠ Total Clear via K♠ at the steep cost of discarding an additional card and exiling K♠ permanently. Crucial third access route to Total Clear."
  },
  {
    id: "KING_SPADE_WILD_RECYCLE",
    name: "K♠ Wild -> 5-Recycle",
    source: "K♠ natural",
    mode: "Wild Sovereignty (5-Recycle)",
    primitiveId: "RECYCLE",
    primitiveName: "Mill 2, GY Rummage, Draw Bottom",
    timing: "Action",
    pointsForgone: 8,
    setup: "DP >= 2",
    counterplay: "ROBUST (Aces)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "NICHE BUT HEALTHY",
    rawPotencyScore: 60,
    practicalScore: 49,
    efficiencyScore: 45,
    commentary: "Copies 5-Recycle, permanently exiling K♠ for net +1 card advantage. Generally inferior to holding K♠ for counterplay."
  },
  {
    id: "KING_SPADE_WILD_DEEP_DRAW",
    name: "K♠ Wild -> 6♠ Deep Draw",
    source: "K♠ natural",
    mode: "Wild Sovereignty (Deep Draw)",
    primitiveId: "DEEP_DRAW",
    primitiveName: "Discard 1-2, Draw 6, Keep 3-4",
    timing: "Action",
    pointsForgone: 8,
    extraCostNote: "+1-2 discards, K♠ exiled",
    setup: ">=1 other hand card",
    counterplay: "ROBUST (Aces)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "NICHE BUT HEALTHY",
    rawPotencyScore: 75,
    practicalScore: 68,
    efficiencyScore: 53,
    commentary: "Enables K♠ to sculpt the hand 6 cards deep, exiling K♠. High-commitment digging tool when searching for game-winning lines."
  },
  {
    id: "KING_SPADE_WILD_TOPDECK",
    name: "K♠ Wild -> 7-Topdeck",
    source: "K♠ natural",
    mode: "Wild Sovereignty (Topdeck)",
    primitiveId: "TOPDECK_CASTING",
    primitiveName: "Topdeck: 1 Hand + 1 Generated Play",
    timing: "Action",
    pointsForgone: 8,
    setup: "DP >= 2",
    counterplay: "ROBUST (Aces)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "NICHE BUT HEALTHY",
    rawPotencyScore: 66,
    practicalScore: 50,
    efficiencyScore: 47,
    commentary: "Gambit play that exiles K♠ to cast from top of deck. Rarely justified given K♠'s defensive counter value."
  },

  // Rank RJ
  {
    id: "RED_JOKER_HAND_SWAP",
    name: "Red Joker Hand Swap",
    source: "Red Joker",
    mode: "Hand Swap",
    primitiveId: "HAND_SWAP",
    primitiveName: "Exchange Entire Hands with Opponent",
    timing: "Action",
    pointsForgone: 5,
    setup: "Opponent has hand cards",
    counterplay: "ROBUST (Aces)",
    reachability: "RARE",
    threatValue: "MODERATE",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 87,
    practicalScore: 78,
    efficiencyScore: 76,
    commentary: "Completely swaps hands with an opponent. Devastating when caster has an empty or depleted hand and opponent has hoarded high-value cards."
  },
  {
    id: "RED_JOKER_SELF_RESET",
    name: "Red Joker Self Reset",
    source: "Red Joker",
    mode: "Self Reset",
    primitiveId: "SELF_RESET",
    primitiveName: "Discard Hand, Draw Size + 3",
    timing: "Action",
    pointsForgone: 5,
    setup: "Action phase",
    counterplay: "ROBUST (Aces)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 74,
    practicalScore: 77,
    efficiencyScore: 78,
    commentary: "Discards hand and draws new hand containing discarded count + 3. Superb hand refresh when holding dead cards."
  },
  {
    id: "RED_JOKER_OPPONENT_ATTACK",
    name: "Red Joker Opponent Attack",
    source: "Red Joker",
    mode: "Opponent Attack",
    primitiveId: "OPPONENT_ATTACK",
    primitiveName: "Opponent Discards Hand, Redraws -2",
    timing: "Action",
    pointsForgone: 5,
    setup: "Opponent has large hand",
    counterplay: "ROBUST (Aces)",
    reachability: "RARE",
    threatValue: "MODERATE",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 76,
    practicalScore: 76,
    efficiencyScore: 75,
    commentary: "Forces opponent to discard hand and redraw size - 2. Severe resource stripping against opponents holding large hands."
  },
  {
    id: "RED_JOKER_SHUFFLE_RESET",
    name: "Red Joker Shuffle Reset",
    source: "Red Joker",
    mode: "Shuffle Reset",
    primitiveId: "SHUFFLE_RESET",
    primitiveName: "Shuffle DP + GY into DP, Draw 2",
    timing: "Action",
    pointsForgone: 5,
    setup: "Rich Graveyard",
    counterplay: "ROBUST (Aces)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 69,
    practicalScore: 68,
    efficiencyScore: 69,
    commentary: "Shuffles Graveyard back into Draw Pile and draws 2 cards. Refills exhausted deck and recycles all spent power cards."
  },

  // Rank BJ
  {
    id: "BLACK_JOKER_BOARD_LOCK",
    name: "Black Joker Board Lock",
    source: "Black Joker",
    mode: "Quick Board Lock",
    primitiveId: "BOARD_LOCK",
    primitiveName: "2-Turn Global Effect/Scuttle Lockdown",
    timing: "Quick",
    pointsForgone: 11,
    extraCostNote: "AS-EXECUTED: 11-pt scoring blocked by IMPL-01",
    setup: "Empty stack and queue",
    counterplay: "NARROW (⭐A, 3-Red only)",
    reachability: "RARE",
    threatValue: "VERY_HIGH",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "WATCHLIST",
    rawPotencyScore: 89,
    practicalScore: 92,
    efficiencyScore: 92,
    commentary: "Free Quick play activating a 2-turn global lockdown that prohibits all non-counter effect plays, Scuttles, and Traps. Tremendous game-sealing tool when holding a points lead."
  },
  {
    id: "BLACK_JOKER_EXILE_RECYCLE",
    name: "Black Joker Exile Recycle",
    source: "Black Joker scored",
    mode: "Scoring Trigger (Exile Recycle)",
    primitiveId: "EXILE_RECYCLE_TRIGGER",
    primitiveName: "When Scored: Move <=2 Exile to DP",
    timing: "Trigger",
    pointsForgone: 0,
    setup: "Non-empty Exile",
    counterplay: "None (Trigger)",
    reachability: "RARE",
    threatValue: "LOW",
    status: "NOT_IMPLEMENTED",
    confidence: "LOW",
    healthVerdict: "BLOCKED",
    rawPotencyScore: 59,
    practicalScore: 78,
    efficiencyScore: 90,
    commentary: "Written as recycling up to 2 cards from Exile back into DP when Black Joker is scored. Blocked in Engine 4.2.6 by IMPL-01 scoring refusal."
  },

  // Ultras
  {
    id: "ULTRA_THREE_BLACK",
    name: "3 Black Ultra",
    source: "3 Black cards (♣/♠)",
    mode: "3 Black Ultra",
    primitiveId: "ULTRA_THREE_BLACK",
    primitiveName: "Score 1 + Cast 1 + Exile 1",
    timing: "Action",
    pointsForgone: 12,
    extraCostNote: "3 cards committed",
    setup: "3 black cards in hand",
    counterplay: "NARROW (⭐A, 3-Red only)",
    reachability: "COMMON",
    threatValue: "MODERATE",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 80,
    practicalScore: 76,
    efficiencyScore: 66,
    commentary: "Tri-modal composite action: scores 1 card, resolves 1 card's effect internally (uncounterable sub-cast), and exiles 1 card. High flexibility, but consumes 3 dedicated black cards."
  },
  {
    id: "ULTRA_THREE_RED_COUNTER",
    name: "3 Red Ultra Counter",
    source: "3 Red cards (♦/♥)",
    mode: "3 Red Ultra Counter",
    primitiveId: "ULTRA_THREE_RED",
    primitiveName: "⭐A Counter Authority + Draw Bottom GY",
    timing: "Instant",
    pointsForgone: 10,
    setup: "3 red cards in hand, pending play",
    counterplay: "NARROW (Blocked by Two-Queen Defense)",
    reachability: "COMMON",
    threatValue: "VERY_HIGH",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "POLICY_SENSITIVE",
    rawPotencyScore: 92,
    practicalScore: 88,
    efficiencyScore: 73,
    commentary: "Instant counter possessing ⭐A authority that also draws 1 card from bottom of Graveyard even if countered. Readily accessible in red-heavy hands, over-activated by heuristic AI (97 executions in corpus)."
  },
  {
    id: "ULTRA_2B2R_DRAW",
    name: "2B+2R Ultra (Draw 2)",
    source: "2 Black + 2 Red cards",
    mode: "2B+2R Draw",
    primitiveId: "ULTRA_2B2R_TEMPO_DRAW",
    primitiveName: "+2 Mini-Turns, Draw 2 Cards",
    timing: "Action",
    pointsForgone: 14,
    setup: "2 Black + 2 Red in hand",
    counterplay: "NARROW (⭐A, 3-Red only)",
    reachability: "COMMON",
    threatValue: "HIGH",
    status: "MATCH",
    confidence: "VERY_HIGH",
    healthVerdict: "WATCHLIST",
    rawPotencyScore: 85,
    practicalScore: 89,
    efficiencyScore: 76,
    commentary: "Primary tempo engine in the game: grants +2 Mini-Turns (net +1 action) and draws 2 cards. Available in 60.1–77.3% of opening hands; policy over-activation inflates perceived dominance."
  },
  {
    id: "ULTRA_2B2R_RUMMAGE_EXILE",
    name: "2B+2R Ultra (Rummage Exile)",
    source: "2 Black + 2 Red cards",
    mode: "2B+2R Rummage",
    primitiveId: "ULTRA_2B2R_TEMPO_RUMMAGE",
    primitiveName: "+2 Mini-Turns, Rummage 1 from Exile",
    timing: "Action",
    pointsForgone: 14,
    setup: "2 Black + 2 Red in hand, non-empty Exile",
    counterplay: "NARROW (⭐A, 3-Red only)",
    reachability: "COMMON",
    threatValue: "MODERATE",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 83,
    practicalScore: 77,
    efficiencyScore: 68,
    commentary: "Alternative branch of 2B+2R granting +2 Mini-Turns and recovering 1 key card from Exile. Highly situational compared to the Draw 2 branch."
  },

  // Voltage
  {
    id: "VOLTAGE_THREE_SLEIGHT",
    name: "Voltage ⚡3 Sleight",
    source: "Start Snapshot (PR Threes >= 3)",
    mode: "Voltage 3 Sleight",
    primitiveId: "VOLTAGE_THREE_SLEIGHT",
    primitiveName: "Take Top DP to Hand or PR",
    timing: "Instant Start",
    pointsForgone: 0,
    setup: "PR Threes >= 3 at Start",
    counterplay: "None (Start trigger)",
    reachability: "PLAUSIBLE",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 50,
    practicalScore: 69,
    efficiencyScore: 92,
    commentary: "Free Start-phase trigger allowing the player to add the top DP card to hand or score it directly. Zero card commitment once the threshold is met."
  },
  {
    id: "VOLTAGE_FOUR_PREDICTABLE",
    name: "Voltage ⚡4 Predictable",
    source: "Start Snapshot (PR Fours >= 4)",
    mode: "Voltage 4 Predictable",
    primitiveId: "VOLTAGE_FOUR_PREDICTABLE",
    primitiveName: "Predict Rank+Suit of Top DP",
    timing: "Instant Start",
    pointsForgone: 0,
    setup: "PR Fours >= 4 at Start",
    counterplay: "None (Start trigger)",
    reachability: "PLAUSIBLE",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 48,
    practicalScore: 51,
    efficiencyScore: 75,
    commentary: "Free Start-phase guess: if both rank and suit match the top DP card, scores it immediately. Low probability of success (~1.9%) without deck inspection."
  },
  {
    id: "VOLTAGE_FIVE_REFINEMENT",
    name: "Voltage ⚡5 Refinement",
    source: "Start Snapshot (PR Fives >= 5)",
    mode: "Voltage 5 Refinement",
    primitiveId: "VOLTAGE_FIVE_REFINEMENT",
    primitiveName: "Draw GY Bottom or Refine Hand",
    timing: "Instant Start",
    pointsForgone: 0,
    setup: "PR Fives >= 5 at Start",
    counterplay: "None (Start trigger)",
    reachability: "PLAUSIBLE",
    threatValue: "LOW",
    status: "MATCH",
    confidence: "HIGH",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 52,
    practicalScore: 71,
    efficiencyScore: 93,
    commentary: "Free Start-phase trigger allowing the player to draw the bottom Graveyard card or discard 1 and draw 1. High utility resource smoothing."
  },

  // Sudden Death
  {
    id: "SUDDEN_DEATH_ACTIVATION",
    name: "Sudden Death Activation",
    source: "RJ+BJ or 4-of-a-kind",
    mode: "Sudden Death Activation",
    primitiveId: "SUDDEN_DEATH",
    primitiveName: "Scrap 1 OTT, 2-Turn Countdown to Win",
    timing: "Action",
    pointsForgone: 16,
    extraCostNote: "Multi-card combo (RJ+BJ or 4-of-a-kind)",
    setup: "RJ+BJ or 4-of-a-kind, vulnerable enemy OTT",
    counterplay: "NARROW (⭐A only)",
    reachability: "CONSTRUCTED_ONLY",
    threatValue: "VERY_HIGH",
    status: "NOT_IMPLEMENTED",
    confidence: "LOW",
    healthVerdict: "HEALTHY",
    rawPotencyScore: 98,
    practicalScore: 46,
    efficiencyScore: 44,
    commentary: "Written as an alternate win condition: scraps an enemy card and begins an inexorable 2-turn victory countdown. Extremely rare (<0.1% reachability), unrepresented in executable play."
  },
  {
    id: "SUDDEN_DEATH_ACTION_DEFECT",
    name: "Sudden Death Defect Action",
    source: "Zero cards (Engine Bug)",
    mode: "Defective Action",
    primitiveId: "SUDDEN_DEATH_DEAD_ACTION",
    primitiveName: "Wastes Mini-Turn, Never Advances",
    timing: "Action",
    pointsForgone: 0,
    setup: "Action phase in Unrestricted",
    counterplay: "None",
    reachability: "COMMON",
    threatValue: "NONE",
    status: "DEFECT_CONTAMINATED",
    confidence: "VERY_HIGH",
    healthVerdict: "INSUFFICIENT",
    rawPotencyScore: 1,
    practicalScore: 1,
    efficiencyScore: 1,
    commentary: "Engine defect DEG-01 in Unrestricted: enumerated with zero cards, consumes a Mini-Turn, and sets a timer that never ticks. Strictly harmful trap option."
  }
];

console.log(`Loaded ${routes.length} declaration routes.`);

// ============================================================================
// 2. Post-process routes: add extraCostNote defaults, asExecuted/asWritten
//    classification, profileAvailability, and derived dimension scores.
// ============================================================================

// Extra cost notes for routes with implicit extra costs not yet annotated
const extraCostOverrides = {
  KING_SPADE_WILD_BOUNCE: "K♠ exiled",
  KING_SPADE_WILD_ROW_CLEAR: "K♠ exiled",
  KING_SPADE_WILD_RECYCLE: "K♠ exiled",
  KING_SPADE_WILD_TOPDECK: "K♠ exiled",
  KING_SPADE_WILD_DEEP_DRAW: "+1-2 discards, K♠ exiled",
  KING_SPADE_WILD_TOTAL_CLEAR: "+1 discard, K♠ exiled",
  TEN_DIAMOND_SOLO_MIMIC_ROW_EXCHANGE_PR: "10♦ Exile-Bound",
  TEN_DIAMOND_SOLO_MIMIC_ROW_EXCHANGE_ER: "10♦ Exile-Bound",
  TEN_DIAMOND_PAIRED_MIMIC_ROW_EXCHANGE: "10♦ Exile-Bound, +1 Two card",
  TEN_DIAMOND_PAIRED_MIMIC_ABSOLUTE_SCUTTLE: "10♦ Exile-Bound, +1 Two card",
  TEN_DIAMOND_PAIRED_MIMIC_SUPER_J_TEMPO: "10♦ Exile-Bound, +1 Two card",
  TEN_DIAMOND_PAIRED_MIMIC_SUPER_ACE: "10♦ Exile-Bound, +1 Two card",
  TEN_DIAMOND_PAIRED_MIMIC_SUPER_THREE: "10♦ Exile-Bound, +1 Two card",
  TEN_DIAMOND_PAIRED_MIMIC_SUPER_FIVE: "10♦ Exile-Bound, +1 Two card",
  TEN_DIAMOND_PAIRED_MIMIC_SUPER_SIX: "10♦ Exile-Bound, +1 Two card",
  TEN_DIAMOND_PAIRED_MIMIC_SUPER_SEVEN: "10♦ Exile-Bound, +1 Two card",
  TEN_HEART_TEMPO_SPIKE: "10♥ exiled",
  TEN_SPADE_STACK_THEFT: "+1 Full-Turn skip, 10♠ exiled",
  TEN_SPADE_EXILE_RECOVERY: "10♠ exiled",
  ULTRA_THREE_BLACK: "3 cards committed",
  ULTRA_THREE_RED_COUNTER: "3 cards committed",
  ULTRA_2B2R_DRAW: "4 cards committed",
  ULTRA_2B2R_RUMMAGE_EXILE: "4 cards committed",
  SUDDEN_DEATH_ACTIVATION: "Multi-card combo (RJ+BJ or 4-of-a-kind)",
  SUDDEN_DEATH_ACTION_DEFECT: "Engine defect: zero-card enumeration",
  A_SUPER_COUNTER: "2 Aces committed",
  TWO_SUPER_COMMANDEER_HOLD: "2 Twos committed",
  TWO_SUPER_COMMANDEER_SCORE: "2 Twos committed",
  THREE_SUPER_RAID: "2 Threes committed",
  FOUR_SUPER_ROW_EXCHANGE_PR: "2 Fours committed",
  FOUR_SUPER_ROW_EXCHANGE_ER: "2 Fours committed",
  FIVE_SUPER_RECYCLE: "2 Fives committed",
  SIX_SUPER_DIG: "2 Sixes committed",
  SEVEN_SUPER_TOPDECK: "2 Sevens committed",
  EIGHT_SUPER_ABSOLUTE_SCUTTLE: "2 Eights committed",
  JACK_SUPER_TEMPO_FORCE: "2 Jacks committed",
  QUEEN_COURT: "2 Queens committed",
  ROYAL_MARRIAGE: "Same-suit K+Q committed",
};

for (const r of routes) {
  if (!r.extraCostNote) {
    r.extraCostNote = extraCostOverrides[r.id] || "None";
  }
  // asExecuted: route is functional in the engine (MATCH, CONFLICT, or UNRESTRICTED_ONLY)
  // DEFECT_CONTAMINATED is enumerated but broken; NOT_IMPLEMENTED is absent
  r.asExecuted = (r.status === 'MATCH' || r.status === 'CONFLICT' || r.status === 'UNRESTRICTED_ONLY');
  r.asWritten = (r.id !== 'SUDDEN_DEATH_ACTION_DEFECT'); // The defect is not a written route
  // Profile availability
  if (r.status === 'UNRESTRICTED_ONLY' || r.status === 'DEFECT_CONTAMINATED') {
    r.profileAvailability = 'core-unrestricted-only';
  } else if (r.status === 'NOT_IMPLEMENTED') {
    r.profileAvailability = 'written-only';
  } else {
    r.profileAvailability = 'core-advanced-and-unrestricted';
  }
}

// ============================================================================
// 3. Derive threatScore, comebackScore, snowballScore mechanically.
//    These use the existing analytical scores plus primitive-category
//    multipliers to produce ordinally strict dimension scores.
// ============================================================================

// Primitive category lookup for comeback/snowball weighting
const primitiveCategory = {
  // Board resets
  TOTAL_CLEAR: 'BOARD_RESET', ROW_EXCHANGE_PR: 'BOARD_RESET', ROW_EXCHANGE_ER: 'BOARD_RESET',
  ROW_CLEAR_PR: 'BOARD_RESET', ROW_CLEAR_ER: 'BOARD_RESET',
  // Control lock
  BOARD_LOCK: 'CONTROL_LOCK', STACK_THEFT: 'CONTROL_LOCK',
  // Counters
  BASE_COUNTER: 'COUNTER', EXILE_COUNTER: 'COUNTER', ANCHOR_COUNTER: 'COUNTER',
  SUPER_COUNTER: 'COUNTER', ANCHOR_COUNTER_KING: 'COUNTER', COUNTER_MULTI_PLAY: 'COUNTER',
  SCUTTLE_COUNTER: 'COUNTER', ULTRA_THREE_RED: 'COUNTER',
  // Protection
  QUICK_AEGIS_FIELD: 'PROTECTION', QUICK_AEGIS_TARGET: 'PROTECTION',
  GUARD_PROTECTION: 'PROTECTION', QUEENS_COURT_DOUBLE_ANCHOR: 'PROTECTION',
  ROYAL_MARRIAGE_ENTRY: 'PROTECTION', ROYAL_SHIELD_PROTECTION: 'PROTECTION',
  Q_SPADE_CLEAR_IMMUNITY: 'PROTECTION',
  // Removal / denial
  FREE_SCUTTLE: 'REMOVAL', ABSOLUTE_SCUTTLE: 'REMOVAL', INSTANT_TAP: 'REMOVAL',
  // Tempo
  TEMPO_SPIKE: 'TEMPO', TEMPO_FORCE: 'TEMPO', ULTRA_2B2R_TEMPO_DRAW: 'TEMPO',
  ULTRA_2B2R_TEMPO_RUMMAGE: 'TEMPO', QUICK_SCORE_DISCARD: 'TEMPO',
  // Draw / sculpting
  DIG: 'DRAW', DEEP_DRAW: 'DRAW', SUPER_DIG: 'DRAW', RECYCLE: 'DRAW',
  SUPER_RECYCLE: 'DRAW', HAND_RAID_PRESENT_TAKE: 'DRAW', FORCE_DISCARD: 'DRAW',
  SUPER_RAID: 'DRAW', SELF_RESET: 'DRAW', OPPONENT_ATTACK: 'DRAW',
  SHUFFLE_RESET: 'DRAW', QUICK_NATURAL: 'DRAW', QUICK_SWAP_BAR_PEEK: 'DRAW',
  // Hand disruption
  HAND_SWAP: 'HAND_DISRUPT', DISRUPT: 'HAND_DISRUPT',
  BOUNCE_OTT_TOP_DP: 'HAND_DISRUPT', INSTANT_BOUNCE: 'HAND_DISRUPT',
  // Control transfer
  ATTACHMENT_PR: 'CONTROL_TRANSFER', ATTACHMENT_ER: 'CONTROL_TRANSFER',
  COMMANDEER_HOLD: 'CONTROL_TRANSFER', COMMANDEER_SCORE: 'CONTROL_TRANSFER',
  // Goal warfare
  GOAL_SHIFT_THREE: 'GOAL_WARFARE', GOAL_SHIFT_FIVE: 'GOAL_WARFARE',
  GOAL_SHIFT_SPADE: 'GOAL_WARFARE',
  // Exile recursion
  EXILE_RECOVERY: 'EXILE_RECURSION', EXILE_RECYCLE_TRIGGER: 'EXILE_RECURSION',
  EXILE_RUMMAGE_WINDOW: 'EXILE_RECURSION',
  // Topdeck
  TOPDECK_CASTING: 'TOPDECK', TOPDECK_CASTING_REVEAL_3: 'TOPDECK',
  TOPDECK_RECURSION: 'TOPDECK', SUPER_TOPDECK: 'TOPDECK',
  SCORING_TRIGGER_SEVEN: 'TOPDECK',
  // Alt-win
  SUDDEN_DEATH: 'ALT_WIN', FOUNDATION_SCORING_SURGE: 'ALT_WIN',
  // Voltage
  VOLTAGE_THREE_SLEIGHT: 'VOLTAGE', VOLTAGE_FOUR_PREDICTABLE: 'VOLTAGE',
  VOLTAGE_FIVE_REFINEMENT: 'VOLTAGE',
  // Purge
  PURGE_SCRAP_AEGIS: 'PURGE', PURGE_BOUNCE_ANCHOR: 'PURGE',
  // Anchor
  ANCHOR_PASSIVE_SCORE: 'ANCHOR', NINE_ANCHOR_DISCARD: 'ANCHOR',
  // Enhancement
  ENHANCEMENT_RAID: 'DRAW',
  // Misc
  SCUTTLE_BONUS: 'MISC', SUDDEN_DEATH_DEAD_ACTION: 'MISC',
};

// Comeback and snowball multipliers per category
const comebackMultiplier = {
  BOARD_RESET: 1.15, CONTROL_LOCK: 0.40, COUNTER: 0.60, PROTECTION: 0.30,
  REMOVAL: 0.70, TEMPO: 0.60, DRAW: 0.65, HAND_DISRUPT: 0.60,
  CONTROL_TRANSFER: 0.80, GOAL_WARFARE: 0.50, EXILE_RECURSION: 0.50,
  TOPDECK: 0.60, ALT_WIN: 0.80, VOLTAGE: 0.40, PURGE: 0.50,
  ANCHOR: 0.30, MISC: 0.50,
};

const snowballMultiplier = {
  BOARD_RESET: 0.30, CONTROL_LOCK: 1.30, COUNTER: 0.80, PROTECTION: 1.20,
  REMOVAL: 0.70, TEMPO: 0.90, DRAW: 0.60, HAND_DISRUPT: 0.50,
  CONTROL_TRANSFER: 0.60, GOAL_WARFARE: 0.70, EXILE_RECURSION: 0.40,
  TOPDECK: 0.50, ALT_WIN: 0.80, VOLTAGE: 0.50, PURGE: 0.40,
  ANCHOR: 0.70, MISC: 0.50,
};

const threatBase = { VERY_HIGH: 85, HIGH: 65, MODERATE: 45, LOW: 25, NONE: 5 };

function timingBonus(t) {
  if (t === 'Instant' || t === 'Interrupt') return 15;
  if (t === 'Trigger' || t === 'Instant Start') return 12;
  if (t === 'Quick') return 10;
  if (t === 'Passive') return 8;
  return 0; // Action
}

function counterplayBonus(cp) {
  if (cp.startsWith('NARROW')) return 8;
  if (cp.startsWith('ADEQUATE')) return 0;
  if (cp.startsWith('ROBUST')) return -5;
  if (cp.startsWith('None')) return 0;
  return 0;
}

for (const r of routes) {
  const cat = primitiveCategory[r.primitiveId] || 'MISC';
  // Threat: base from threatValue enum + timing reactivity + counterplay narrowness
  r.threatScore = threatBase[r.threatValue] + timingBonus(r.timing) + counterplayBonus(r.counterplay);
  // Comeback: practical score weighted by category multiplier + small raw potency contribution
  r.comebackScore = Math.round(r.practicalScore * (comebackMultiplier[cat] || 0.5) + r.rawPotencyScore * 0.15);
  // Snowball: practical score weighted by category multiplier + timing bonus contribution
  r.snowballScore = Math.round(r.practicalScore * (snowballMultiplier[cat] || 0.5) + timingBonus(r.timing) * 0.4);
  // Clamp threat to [1, 100] (it's enum-derived); leave comeback/snowball unclamped
  // so actual computed values break ties rather than alphabetical order
  r.threatScore = Math.max(1, Math.min(100, r.threatScore));
  r.comebackScore = Math.max(1, r.comebackScore);
  r.snowballScore = Math.max(1, r.snowballScore);
}

// ============================================================================
// 4. Build 75-Primitive Raw Potency Ranking
//    Collapse routes to primitives; each primitive takes the max rawPotencyScore
//    across all its declaration routes.
// ============================================================================

const primitiveMap = new Map();
for (const r of routes) {
  // Include all routes in primitive collection (including defect) to reach 75 primitives
  if (!primitiveMap.has(r.primitiveId)) {
    primitiveMap.set(r.primitiveId, {
      primitiveId: r.primitiveId,
      primitiveName: r.primitiveName,
      maxRawPotencyScore: r.rawPotencyScore,
      bestRouteId: r.id,
      bestRouteName: r.name,
      routes: [r.id],
    });
  } else {
    const p = primitiveMap.get(r.primitiveId);
    p.routes.push(r.id);
    if (r.rawPotencyScore > p.maxRawPotencyScore) {
      p.maxRawPotencyScore = r.rawPotencyScore;
      p.bestRouteId = r.id;
      p.bestRouteName = r.name;
    }
  }
}

const primitives = [...primitiveMap.values()];
const sortedPrimitives = primitives.sort((a, b) =>
  b.maxRawPotencyScore - a.maxRawPotencyScore || a.primitiveId.localeCompare(b.primitiveId)
);
sortedPrimitives.forEach((p, idx) => { p.primitiveRank = idx + 1; });

console.log(`Computed ${primitives.length} distinct primitives for Raw Potency ranking.`);

// ============================================================================
// 5. Build AS-WRITTEN and AS-EXECUTED Practical Rankings
// ============================================================================

// AS-WRITTEN: all routes except the engine defect
const asWrittenRoutes = routes.filter(r => r.asWritten);
const sortedPracticalWritten = [...asWrittenRoutes].sort((a, b) =>
  b.practicalScore - a.practicalScore || a.id.localeCompare(b.id)
);
sortedPracticalWritten.forEach((r, idx) => { r.practicalRankWritten = idx + 1; });

// AS-EXECUTED: routes functional in the engine (MATCH, CONFLICT, UNRESTRICTED_ONLY)
const asExecutedRoutes = routes.filter(r => r.asExecuted);
const sortedPracticalExecuted = [...asExecutedRoutes].sort((a, b) =>
  b.practicalScore - a.practicalScore || a.id.localeCompare(b.id)
);
sortedPracticalExecuted.forEach((r, idx) => { r.practicalRankExecuted = idx + 1; });

// Efficiency ranking (all written routes)
const sortedEfficiency = [...asWrittenRoutes].sort((a, b) =>
  b.efficiencyScore - a.efficiencyScore || a.id.localeCompare(b.id)
);
sortedEfficiency.forEach((r, idx) => { r.efficiencyRank = idx + 1; });

// Threat, Comeback, Snowball rankings (all written routes)
const sortedThreat = [...asWrittenRoutes].sort((a, b) =>
  b.threatScore - a.threatScore || a.id.localeCompare(b.id)
);
sortedThreat.forEach((r, idx) => { r.threatRank = idx + 1; });

const sortedComeback = [...asWrittenRoutes].sort((a, b) =>
  b.comebackScore - a.comebackScore || a.id.localeCompare(b.id)
);
sortedComeback.forEach((r, idx) => { r.comebackRank = idx + 1; });

const sortedSnowball = [...asWrittenRoutes].sort((a, b) =>
  b.snowballScore - a.snowballScore || a.id.localeCompare(b.id)
);
sortedSnowball.forEach((r, idx) => { r.snowballRank = idx + 1; });

// Assign tiers based on AS-WRITTEN practical rank
function tierForRank(rank, total) {
  const pct = rank / total;
  if (pct <= 0.05) return "S+";
  if (pct <= 0.15) return "S";
  if (pct <= 0.30) return "A+";
  if (pct <= 0.48) return "A";
  if (pct <= 0.65) return "B+";
  if (pct <= 0.80) return "B";
  if (pct <= 0.90) return "C+";
  if (pct <= 0.98) return "C";
  return "D";
}

for (const r of asWrittenRoutes) {
  r.tier = tierForRank(r.practicalRankWritten, asWrittenRoutes.length);
}

// Also assign tiers for AS-EXECUTED
for (const r of asExecutedRoutes) {
  r.tierExecuted = tierForRank(r.practicalRankExecuted, asExecutedRoutes.length);
}

console.log(`AS-WRITTEN practical ranking: ${asWrittenRoutes.length} routes.`);
console.log(`AS-EXECUTED practical ranking: ${asExecutedRoutes.length} routes.`);

// ============================================================================
// 6. Build Effect CSV: effect-ranking.csv (AS-WRITTEN, sorted by practical rank)
// ============================================================================

const csvHeader = "#,Effect ID,Source,Mode,Timing,Raw Primitive Rank,Practical Rank (Written),Practical Rank (Executed),Efficiency Rank,Tier,Points Forgone,Extra Cost,Setup,Counterplay,Reachability,Threat Value,Status,Profile Availability,Confidence\n";
const csvRows = sortedPracticalWritten.map(r => {
  const execRank = r.practicalRankExecuted || 'N/A';
  return `${r.practicalRankWritten},${r.id},\"${r.source}\",\"${r.mode}\",${r.timing},${r.primitiveRank || 'N/A'},${r.practicalRankWritten},${execRank},${r.efficiencyRank},${r.tier},${r.pointsForgone},\"${r.extraCostNote}\",\"${r.setup}\",\"${r.counterplay}\",${r.reachability},${r.threatValue},${r.status},${r.profileAvailability},${r.confidence}`;
}).join('\n');

fs.writeFileSync('reports/balance-check/effect-ranking.csv', csvHeader + csvRows + '\n');
console.log('Wrote reports/balance-check/effect-ranking.csv');

// ============================================================================
// 7. Build N x N Pairwise Matrix (on AS-WRITTEN route set)
// ============================================================================

function compareRoutes(a, b) {
  if (a.id === b.id) return '≈';

  // Defective items dominate nothing
  if (a.status === 'DEFECT_CONTAMINATED' && b.status !== 'DEFECT_CONTAMINATED') return '--';
  if (b.status === 'DEFECT_CONTAMINATED' && a.status !== 'DEFECT_CONTAMINATED') return '++';
  if (a.status === 'DEFECT_CONTAMINATED' && b.status === 'DEFECT_CONTAMINATED') return '≈';

  const scoreDiff = a.practicalScore - b.practicalScore;

  if (Math.abs(scoreDiff) <= 1.5) {
    if ((a.timing === 'Instant' && b.timing === 'Action') || (a.timing === 'Action' && b.timing === 'Instant')) {
      return '↔';
    }
    return '≈';
  }

  if (scoreDiff >= 18) return '++';
  if (scoreDiff > 1.5) return '+';
  if (scoreDiff <= -18) return '--';
  if (scoreDiff < -1.5) return '-';

  return '≈';
}

const N = sortedPracticalWritten.length;
const matrix = [];
for (let i = 0; i < N; i++) {
  matrix[i] = [];
  for (let j = 0; j < N; j++) {
    matrix[i][j] = '≈';
  }
}

for (let i = 0; i < N; i++) {
  for (let j = i + 1; j < N; j++) {
    const res = compareRoutes(sortedPracticalWritten[i], sortedPracticalWritten[j]);
    matrix[i][j] = res;
    if (res === '++') matrix[j][i] = '--';
    else if (res === '--') matrix[j][i] = '++';
    else if (res === '+') matrix[j][i] = '-';
    else if (res === '-') matrix[j][i] = '+';
    else if (res === '≈') matrix[j][i] = '≈';
    else if (res === '↔') matrix[j][i] = '↔';
    else if (res === '?') matrix[j][i] = '?';
  }
}

// Verify antisymmetry
let validAntisymmetry = true;
for (let i = 0; i < N; i++) {
  if (matrix[i][i] !== '≈') { validAntisymmetry = false; console.error(`Diagonal failure at ${i}`); }
  for (let j = 0; j < N; j++) {
    const c1 = matrix[i][j];
    const c2 = matrix[j][i];
    if (c1 === '++' && c2 !== '--') validAntisymmetry = false;
    if (c1 === '--' && c2 !== '++') validAntisymmetry = false;
    if (c1 === '+' && c2 !== '-') validAntisymmetry = false;
    if (c1 === '-' && c2 !== '+') validAntisymmetry = false;
    if (c1 === '≈' && c2 !== '≈') validAntisymmetry = false;
    if (c1 === '↔' && c2 !== '↔') validAntisymmetry = false;
    if (c1 === '?' && c2 !== '?') validAntisymmetry = false;
  }
}

console.log(`Pairwise matrix validation: ${validAntisymmetry ? 'PASS (Strictly Antisymmetric)' : 'FAIL'}`);
console.log(`Pairwise matrix dimension: ${N} x ${N} = ${N * N} cells.`);

// Write effect-pairwise-matrix.csv
const matrixHeader = 'Effect ID,' + sortedPracticalWritten.map(r => r.id).join(',') + '\n';
const matrixLines = sortedPracticalWritten.map((r, i) => {
  return r.id + ',' + matrix[i].join(',');
}).join('\n');

fs.writeFileSync('reports/balance-check/effect-pairwise-matrix.csv', matrixHeader + matrixLines + '\n');
console.log('Wrote reports/balance-check/effect-pairwise-matrix.csv');

// ============================================================================
// 8. Pareto Frontier Determination
// ============================================================================

function timingVal(t) {
  if (t === 'Instant' || t === 'Trigger' || t === 'Passive' || t === 'Instant Start' || t === 'Interrupt') return 3;
  if (t === 'Quick') return 2;
  return 1;
}

function reachVal(r) {
  if (r === 'COMMON') return 3;
  if (r === 'PLAUSIBLE') return 2;
  if (r === 'RARE') return 1;
  return 0;
}

function threatVal(tv) {
  if (tv === 'VERY_HIGH') return 3;
  if (tv === 'HIGH') return 2;
  if (tv === 'MODERATE') return 1;
  return 0;
}

const paretoFrontier = [];
for (const r of sortedPracticalWritten) {
  let dominated = false;
  for (const other of sortedPracticalWritten) {
    if (other.id === r.id) continue;
    const betterOrEqual =
      other.rawPotencyScore >= r.rawPotencyScore &&
      other.efficiencyScore >= r.efficiencyScore &&
      timingVal(other.timing) >= timingVal(r.timing) &&
      other.pointsForgone <= r.pointsForgone &&
      reachVal(other.reachability) >= reachVal(r.reachability) &&
      threatVal(other.threatValue) >= threatVal(r.threatValue);

    const strictlyBetter =
      other.rawPotencyScore > r.rawPotencyScore ||
      other.efficiencyScore > r.efficiencyScore ||
      timingVal(other.timing) > timingVal(r.timing) ||
      other.pointsForgone < r.pointsForgone ||
      reachVal(other.reachability) > reachVal(r.reachability) ||
      threatVal(other.threatValue) > threatVal(r.threatValue);

    if (betterOrEqual && strictlyBetter) {
      dominated = true;
      break;
    }
  }
  if (!dominated && r.status !== 'DEFECT_CONTAMINATED') {
    paretoFrontier.push(r.id);
  }
}
console.log(`Identified ${paretoFrontier.length} effects on the Pareto Frontier:`, paretoFrontier.slice(0, 10).join(', '));

// ============================================================================
// 9. Dominance / Superiority Findings
//    DOM-01 downgraded from STRICTLY DOMINATED to NEARLY DOMINATED because
//    Score mode provides immediate, undisruptable PR points, while Hold mode's
//    future optionality can be disrupted (K♠ counter, Aegis re-activation,
//    or the tapped card being removed before Start).
//    Cross-card comparisons renamed from "DOMINATED" to "CROSS-CARD ROUTE
//    SUPERIORITY" because they compare different source cards, not modes of
//    the same card — strict dominance requires identical input cost.
// ============================================================================

const strictDominanceFindings = [
  {
    findingId: "DOM-01",
    dominantRoute: "TWO_SUPER_COMMANDEER_HOLD",
    dominatedRoute: "TWO_SUPER_COMMANDEER_SCORE",
    dominanceType: "WITHIN-CARD MODE SUPERIORITY",
    status: "NEARLY DOMINATED",
    reason: "Hold mode seizes the card tapped until Start, retaining the option to score it OR cast its effect for free. Score mode immediately scores it into PR. Hold mode's optionality is usually superior, but Score mode provides immediate, undisruptable PR points — the tapped card in Hold mode can be answered by K♠, Aegis re-activation, or other removal before Start. Hold is the stronger default but does not strictly dominate Score in all states."
  },
  {
    findingId: "DOM-02",
    dominantRoute: "TEN_DIAMOND_SOLO_MIMIC_ROW_EXCHANGE_PR",
    dominatedRoute: "TEN_DIAMOND_PAIRED_MIMIC_ROW_EXCHANGE",
    dominanceType: "CROSS-CARD ROUTE SUPERIORITY",
    status: "CROSS-CARD SUPERIOR (same primitive, lower input cost)",
    reason: "Solo Mimic achieves the identical Row Exchange effect using only 10♦. Paired Mimic requires 10♦ PLUS an extra Two card. Both routes share the 10♦ component, but Paired Mimic pays an additional card for zero additional effect. This is cross-card route superiority rather than strict dominance because the source card sets differ."
  },
  {
    findingId: "DOM-03",
    dominantRoute: "A_SPADE_EXILE_COUNTER",
    dominatedRoute: "A_BASE_COUNTER",
    dominanceType: "CROSS-CARD ROUTE SUPERIORITY",
    status: "CROSS-CARD SUPERIOR (same cost, enhanced effect)",
    reason: "A♠ has identical timing (Instant), identical card cost (1 card), and identical points forgone (4 pts), but adds source-exile (denying Graveyard recursion) and immunity to Base Ace counter-counters. A♠ is functionally superior to Base Ace in reactive trades, balanced only by 1-copy rarity. Cross-card superiority rather than strict dominance because the source cards are different identities."
  },
  {
    findingId: "DOM-04",
    dominantRoute: "TWO_SPADE_SOLO_WILD_TOTAL_CLEAR",
    dominatedRoute: "KING_SPADE_WILD_TOTAL_CLEAR",
    dominanceType: "CROSS-CARD ROUTE SUPERIORITY",
    status: "CROSS-CARD SUPERIOR (same primitive, lower cost)",
    reason: "Both routes execute Total Clear, but 2♠ costs 2 points forgone with zero extra discard and goes to Graveyard, while K♠ costs 8 points forgone, requires an additional discard, and exiles K♠ permanently. 2♠ is vastly more efficient. Cross-card superiority because the source cards are different identities with different opportunity costs."
  },
  {
    findingId: "DOM-05",
    dominantRoute: "FOUR_SPADE_TOTAL_CLEAR",
    dominatedRoute: "SUDDEN_DEATH_ACTION_DEFECT",
    dominanceType: "DEFECT DOMINANCE",
    status: "STRICTLY DOMINATED (defect vs functional route)",
    reason: "Sudden Death in Unrestricted consumes a Mini-Turn and never advances, achieving zero game effect. Any functional action strictly dominates this defect."
  }
];

// ============================================================================
// 10. Validate route rank contiguity
// ============================================================================

function validateContiguity(sortedArr, rankField, label, idField = 'id') {
  const issues = [];
  for (let i = 0; i < sortedArr.length; i++) {
    const expected = i + 1;
    if (sortedArr[i][rankField] !== expected) {
      issues.push(`${label}: rank ${expected} has ${rankField}=${sortedArr[i][rankField]} (${sortedArr[i][idField]})`);
    }
  }
  // Check uniqueness
  const ids = sortedArr.map(r => r[idField]);
  const unique = new Set(ids);
  if (ids.length !== unique.size) {
    issues.push(`${label}: duplicate ${idField}s detected`);
  }
  return issues;
}

const validationIssues = [
  ...validateContiguity(sortedPracticalWritten, 'practicalRankWritten', 'AS-WRITTEN Practical'),
  ...validateContiguity(sortedPracticalExecuted, 'practicalRankExecuted', 'AS-EXECUTED Practical'),
  ...validateContiguity(sortedEfficiency, 'efficiencyRank', 'Efficiency'),
  ...validateContiguity(sortedThreat, 'threatRank', 'Threat'),
  ...validateContiguity(sortedComeback, 'comebackRank', 'Comeback'),
  ...validateContiguity(sortedSnowball, 'snowballRank', 'Snowball'),
  ...validateContiguity(sortedPrimitives, 'primitiveRank', 'Raw Primitive', 'primitiveId'),
];

if (validationIssues.length > 0) {
  console.error('VALIDATION FAILURES:');
  for (const issue of validationIssues) console.error(`  ${issue}`);
  process.exit(1);
} else {
  console.log('Rank contiguity validation: PASS (all rankings contiguous and unique)');
}

// ============================================================================
// 11. Update balance-check-findings.json
// ============================================================================

const findingsPath = 'reports/balance-check/balance-check-findings.json';
const findings = JSON.parse(fs.readFileSync(findingsPath, 'utf8'));

// Helper: map a route to its ranking entry
function routeToRankEntry(r, rankField) {
  return {
    rank: r[rankField],
    effectId: r.id,
    source: r.source,
    route: r.mode,
    primitiveId: r.primitiveId,
    primitiveName: r.primitiveName,
    timing: r.timing,
    pointsForgone: r.pointsForgone,
    extraCostNote: r.extraCostNote,
    tier: r.tier || r.tierExecuted,
    implementationStatus: r.status,
    profileAvailability: r.profileAvailability,
    confidence: r.confidence,
    healthVerdict: r.healthVerdict,
    reason: r.commentary
  };
}

findings.effectRanking = {
  asWrittenEffectCount: asWrittenRoutes.length,
  asExecutedEffectCount: asExecutedRoutes.length,
  primitiveCount: primitives.length,
  totalAuditedRoutes: routes.length,
  practicalRankingAsWritten: sortedPracticalWritten.map(r => routeToRankEntry(r, 'practicalRankWritten')),
  practicalRankingAsExecuted: sortedPracticalExecuted.map(r => routeToRankEntry(r, 'practicalRankExecuted')),
  rawPotencyRanking: sortedPrimitives.map(p => ({
    rank: p.primitiveRank,
    primitiveId: p.primitiveId,
    primitiveName: p.primitiveName,
    bestRouteId: p.bestRouteId,
    bestRouteName: p.bestRouteName,
    maxRawPotencyScore: p.maxRawPotencyScore,
    routeCount: p.routes.length,
    routes: p.routes,
  })),
  efficiencyRanking: sortedEfficiency.map(r => routeToRankEntry(r, 'efficiencyRank')),
  threatRanking: sortedThreat.map(r => ({ ...routeToRankEntry(r, 'threatRank'), dimensionScore: r.threatScore })),
  comebackRanking: sortedComeback.map(r => ({ ...routeToRankEntry(r, 'comebackRank'), dimensionScore: r.comebackScore })),
  snowballRanking: sortedSnowball.map(r => ({ ...routeToRankEntry(r, 'snowballRank'), dimensionScore: r.snowballScore })),
  paretoFrontier: paretoFrontier,
  strictDominanceFindings: strictDominanceFindings,
  strongestEffects: {
    rawPotency: sortedPrimitives[0]?.primitiveId || "UNKNOWN",
    practicalValueAsWritten: sortedPracticalWritten[0]?.id || "UNKNOWN",
    practicalValueAsExecuted: sortedPracticalExecuted[0]?.id || "UNKNOWN",
    efficiency: sortedEfficiency[0]?.id || "UNKNOWN",
    threatValue: sortedThreat[0]?.id || "UNKNOWN",
    comeback: sortedComeback[0]?.id || "UNKNOWN",
    snowball: sortedSnowball[0]?.id || "UNKNOWN",
  }
};

fs.writeFileSync(findingsPath, JSON.stringify(findings, null, 2) + '\n');
console.log('Updated reports/balance-check/balance-check-findings.json');

// ============================================================================
// 12. Output script completed message
// ============================================================================

console.log('Finished ranking computation and JSON/CSV generation.');
console.log(`  Primitives: ${primitives.length}`);
console.log(`  AS-WRITTEN routes: ${asWrittenRoutes.length}`);
console.log(`  AS-EXECUTED routes: ${asExecutedRoutes.length}`);
console.log(`  Pareto frontier: ${paretoFrontier.length}`);
console.log(`  Dominance findings: ${strictDominanceFindings.length}`);
