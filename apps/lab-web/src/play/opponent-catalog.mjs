// ═══════════════════════════════════════════════════════════════
// opponent-catalog.mjs — Canonical AI opponent configuration model.
//
// The match configurator asks the player TWO independent questions:
//
//     how strong?      → difficulty
//     how does it play → archetype (playstyle)
//
// The engine ships one concrete policyId per (archetype, difficulty) pair
// and not every archetype exists at every difficulty. This module is the
// single source of truth that turns the shipped policy catalog into a
// player-facing model, so no presentation layer has to repeat opponent
// markup or strategy metadata once per difficulty.
//
// Everything here is pure data + pure functions: no DOM, no app state.
// ═══════════════════════════════════════════════════════════════

/** Canonical difficulty order, weakest → strongest. */
export const DIFFICULTY_IDS = Object.freeze(['easy', 'normal', 'hard', 'nightmare']);

/**
 * Difficulty presentation + explanation.
 * `description` is the full factual explanation (also surfaced to assistive
 * tech via aria-describedby and in the Opponent Brief).
 * `modifier` is the one-line framing of how the difficulty scales the
 * opponent — shown in the Opponent Brief for the selected difficulty only.
 */
export const DIFFICULTY_DEFINITIONS = Object.freeze({
  easy: Object.freeze({
    id: 'easy',
    label: 'Easy',
    icon: '◇',
    tagline: 'Forgiving decisions',
    description: 'Forgiving opponent that makes simple decisions and rarely counters. Good for learning card interactions.',
    modifier: 'Forgiving: some decisions are intentionally suboptimal and it adapts slowly.',
  }),
  normal: Object.freeze({
    id: 'normal',
    label: 'Normal',
    icon: '◈',
    tagline: 'Competitive baseline',
    description: 'Balanced opponent that plays competently and responds to your moves. A fair test of your strategy.',
    modifier: 'Balanced: competent decisions with the occasional slip.',
  }),
  hard: Object.freeze({
    id: 'hard',
    label: 'Hard',
    icon: '◆',
    tagline: 'Strong tactical play',
    description: 'Skilled opponent that optimizes plays, counters aggressively, and punishes mistakes. Expect a real challenge.',
    modifier: 'Sharp: near-errorless decisions and fast adaptation to your patterns.',
  }),
  nightmare: Object.freeze({
    id: 'nightmare',
    label: 'Nightmare',
    icon: '✦',
    tagline: 'Near-optimal decisions',
    description: 'Ruthless opponent that plays near-optimally. Every decision matters. For experienced players only.',
    modifier: 'Ruthless: no injected mistakes and maximum adaptation.',
  }),
});

/**
 * Canonical archetype (playstyle) metadata.
 *
 * `playstyle`   — short taxonomy line for the card ("Aggressive · Tempo").
 * `description` — ONE sentence for the card.
 * `brief`       — richer explanation for the selected Opponent Brief panel.
 * `tags`        — short chips shown in the Opponent Brief.
 * `traits` / `aiSummary` — consumed by the in-match personality + banter layer.
 *
 * Behaviour statements are derived from the real implementations:
 *   - HYBRIX archetype trait vectors (packages/game-ai/src/personality.mjs)
 *   - core policy scoring weights (packages/policies/src/scoring.mjs)
 */
export const ARCHETYPE_DEFINITIONS = Object.freeze({
  rusher: Object.freeze({
    id: 'rusher',
    label: 'Rusher',
    icon: '⚡',
    playstyle: 'Aggressive · Tempo',
    description: 'Forces early scoring windows and trades safety for tempo.',
    brief: 'High-initiative pressure player. It pushes scoring opportunities early and willingly gives up defensive stability to keep tempo on its side — punish the openings it leaves behind.',
    tags: ['Aggressive', 'Tempo', 'Risk-taking'],
    traits: ['aggressive', 'fast', 'risk-taking'],
    aiSummary: 'Aggressive tempo player that scores early and often, sacrificing defense for speed.',
  }),
  defender: Object.freeze({
    id: 'defender',
    label: 'Defender',
    icon: '🛡',
    playstyle: 'Reactive · Patient',
    description: 'Absorbs pressure, protects position, then punishes mistakes.',
    brief: 'Patient reactive strategist. It holds position, defends its own board, and waits for you to overextend — then converts the mistake into points. Beat it by forcing it to act first.',
    tags: ['Reactive', 'Counterplay', 'Patient'],
    traits: ['reactive', 'patient', 'counter-focused'],
    aiSummary: 'Reactive strategist that counters opponent plays and builds late-game advantage.',
  }),
  trickster: Object.freeze({
    id: 'trickster',
    label: 'Trickster',
    icon: '🌀',
    playstyle: 'Misdirection · Effect-heavy',
    description: 'Uses unusual sequencing and effect interactions to stay unpredictable.',
    brief: 'High-variance misdirection specialist. It favours effect-heavy lines and non-obvious sequencing over straight scoring, so its intent is hard to read. Play around what it can do, not what it usually does.',
    tags: ['Misdirection', 'Tactical'],
    traits: ['cunning', 'unpredictable', 'effect-focused'],
    aiSummary: 'Misdirection specialist that manipulates the swap bar and leverages effect-heavy plays.',
  }),
  sniper: Object.freeze({
    id: 'sniper',
    label: 'Sniper',
    icon: '🎯',
    playstyle: 'Precision · Removal',
    description: 'Waits out the position, then removes your highest-value cards.',
    brief: 'Precise removal player. It is patient with its answers and spends them on the cards that matter most, so a single high-value threat is a liability against it. Spread your value across several cards.',
    tags: ['Precision', 'Removal'],
    traits: ['precise', 'efficient', 'targeting'],
    aiSummary: 'Precision remover that targets key cards and maximizes resource efficiency.',
  }),
  support: Object.freeze({
    id: 'support',
    label: 'Support',
    icon: '🧰',
    playstyle: 'Utility · Manipulation',
    description: 'Manipulates draws and the stack, and protects its own cards.',
    brief: 'Utility controller. It invests in protective and indirect advantages — draws, stack manipulation, and covering its own board — rather than raw pressure. Deny its setup and the payoff never arrives.',
    tags: ['Utility', 'Manipulation'],
    traits: ['supportive', 'protective', 'stack-focused'],
    aiSummary: 'Utility-focused controller that manipulates the stack and protects own cards.',
  }),
  tank: Object.freeze({
    id: 'tank',
    label: 'Tank',
    icon: '🧱',
    playstyle: 'Defense · Endurance',
    description: 'Builds a resilient position and wins through endurance.',
    brief: 'Endurance grinder. It refuses to trade downward, holds a sturdy board, and aims to outlast you into a long game. Race it early, or accept a war of attrition.',
    tags: ['Defense', 'Endurance'],
    traits: ['defensive', 'endurance', 'grinding'],
    aiSummary: 'Endurance grinder that relies on high-defense plays and grinds out value over long games.',
  }),
  baseline: Object.freeze({
    id: 'baseline',
    label: 'Baseline',
    icon: '◈',
    playstyle: 'Balanced · Generalist',
    description: 'Plays straightforward Intrilex without a strong strategic bias.',
    brief: 'Neutral reference opponent. With no personality bias at all, every decision is pure expected-value — the cleanest way to measure your own play.',
    tags: ['Balanced', 'Generalist'],
    traits: ['balanced', 'adaptive'],
    aiSummary: 'Balanced generalist that adapts to the game state without a strong preference.',
  }),
  'score-rush': Object.freeze({
    id: 'score-rush',
    label: 'Score Rush',
    icon: '💥',
    playstyle: 'Scoring · Tempo',
    description: 'Prioritizes immediate scoring progress over long-term setup.',
    brief: 'Immediate-scoring specialist. It favors score progress, takes available wins, and weighs useful denial when an opponent approaches their goal.',
    tags: ['Scoring', 'Tempo'],
    traits: ['aggressive', 'scoring'],
    aiSummary: 'Immediate scoring pressure with public-threat defense and selective counters.',
  }),
  control: Object.freeze({
    id: 'control',
    label: 'Control',
    icon: '🔒',
    playstyle: 'Control · Denial',
    description: 'Restricts your options and dictates how the board develops.',
    brief: 'Board-control specialist. It favors useful disruption and removal, avoids empty or fully protected row clears, and takes available scoring wins.',
    tags: ['Control', 'Denial'],
    traits: ['disruptive', 'counter-focused'],
    aiSummary: 'Disruption-focused play that weighs public material and conserves counters.',
  }),
  tempo: Object.freeze({
    id: 'tempo',
    label: 'Tempo',
    icon: '⏱',
    playstyle: 'Initiative · Pressure',
    description: 'Keeps the initiative and repeatedly forces you to respond.',
    brief: 'Initiative-keeper. It values advanced plays and sustained pressure, answers meaningful threats, and preserves counters when a response offers little benefit.',
    tags: ['Initiative', 'Pressure'],
    traits: ['proactive', 'pressing'],
    aiSummary: 'Maintains initiative and forces continuous responses.',
  }),
  value: Object.freeze({
    id: 'value',
    label: 'Value',
    icon: '💎',
    playstyle: 'Efficiency · Resources',
    description: 'Optimizes resource efficiency and builds a long-term advantage.',
    brief: 'Resource optimizer. It weighs hand preservation and efficient trades, accounts for its own material in board clears, and takes available scoring wins.',
    tags: ['Efficiency', 'Resources'],
    traits: ['conservative', 'efficient'],
    aiSummary: 'Maximizes expected value through hand preservation and efficient trades.',
  }),
  'random-legal': Object.freeze({
    id: 'random-legal',
    label: 'Random Legal',
    icon: '🎲',
    playstyle: 'Unpredictable · Legal-first',
    description: 'Makes valid plays without committing to a strategic identity.',
    brief: 'Uniform-random legal play. It has no plan to read and no bias to exploit, which makes it an honest test of whether your own line holds up against anything.',
    tags: ['Unpredictable', 'Legal-first'],
    traits: ['random', 'neutral'],
    aiSummary: 'Uniform random selection from every legal action.',
  }),

});

/** Preferred display order for archetype cards. Unknown ids sort last. */
export const ARCHETYPE_ORDER = Object.freeze([
  'rusher', 'defender', 'trickster', 'sniper', 'support', 'tank', 'baseline',
  'score-rush', 'control', 'tempo', 'value', 'random-legal',
]);

/** Fallback descriptor for an archetype the catalog does not describe yet. */
export function getArchetypeDefinition(archetypeId) {
  const known = ARCHETYPE_DEFINITIONS[archetypeId];
  if (known) return known;
  const id = String(archetypeId ?? 'unknown');
  const label = id.split('-').filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'Unknown';
  return Object.freeze({
    id,
    label,
    icon: '◈',
    playstyle: 'AI opponent',
    description: 'Plays legal actions with no catalogued strategic identity.',
    brief: 'This opponent has no catalogued playstyle description yet.',
    tags: ['Uncatalogued'],
    traits: [],
    aiSummary: 'Uncatalogued AI policy.',
  });
}

const DIFFICULTY_SUFFIX = /-(hard|easy|nightmare|normal)$/;

/**
 * Derive { archetype, difficulty } from a shipped policyId.
 *   hybrix-rusher-easy → { archetype: 'rusher',     difficulty: 'easy' }
 *   hybrix-baseline    → { archetype: 'baseline',   difficulty: 'normal' }
 *   score-rush         → { archetype: 'score-rush', difficulty: 'normal' }
 * @param {string} policyId
 * @returns {{archetype: string, difficulty: string}}
 */
export function policyTraitsFromId(policyId) {
  const id = String(policyId ?? '');
  const tactical = id.match(/^(score-rush|control|tempo|value)-tactical$/);
  if (tactical) return {archetype:tactical[1], difficulty:'normal'};
  if (!id.startsWith('hybrix-')) return { archetype: id, difficulty: 'normal' };
  const rest = id.slice('hybrix-'.length);
  const suffix = rest.match(DIFFICULTY_SUFFIX);
  if (!suffix) return { archetype: rest, difficulty: 'normal' };
  return { archetype: rest.slice(0, rest.length - suffix[0].length), difficulty: suffix[1] };
}

function archetypeSortIndex(archetypeId) {
  const index = ARCHETYPE_ORDER.indexOf(archetypeId);
  return index === -1 ? ARCHETYPE_ORDER.length : index;
}

/** Weakest difficulty that actually ships an archetype, else 'normal'. */
function pickDefaultDifficulty(archetypes) {
  for (const difficulty of DIFFICULTY_IDS) {
    if (archetypes.some(a => a.availableDifficulties.includes(difficulty))) return difficulty;
  }
  return 'normal';
}

/**
 * Archetypes that exist as a concrete policy at the given difficulty.
 * @param {object} model - Result of buildOpponentModel
 * @param {string} difficultyId
 * @returns {Array} archetype entries
 */
export function compatibleArchetypes(model, difficultyId) {
  return (model?.archetypes ?? []).filter(a => a.availableDifficulties.includes(difficultyId));
}

/**
 * Build the player-facing opponent model from the shipped policy catalog.
 *
 * The catalog is the engine truth: one entry per concrete policyId. The
 * model inverts it into archetypes with their available difficulties, so a
 * given archetype is presented once instead of once per difficulty group.
 *
 * @param {Array<{policyId: string, traits?: {archetype?: string, difficulty?: string}}>} policyCatalog
 * @returns {{difficulties: Array, archetypes: Array, defaultDifficulty: string, defaultArchetype: string|null}}
 */
export function buildOpponentModel(policyCatalog = []) {
  const byArchetype = new Map();

  for (const entry of Array.isArray(policyCatalog) ? policyCatalog : []) {
    const policyId = entry?.policyId;
    if(entry?.traits?.researchOnly)continue;
    if (!policyId) continue;
    const derived = policyTraitsFromId(policyId);
    const archetype = entry.traits?.archetype ?? derived.archetype;
    if (!archetype) continue;
    const difficulty = DIFFICULTY_IDS.includes(entry.traits?.difficulty)
      ? entry.traits.difficulty
      : derived.difficulty;
    if (!byArchetype.has(archetype)) byArchetype.set(archetype, { policyIdByDifficulty: {} });
    byArchetype.get(archetype).policyIdByDifficulty[difficulty] = policyId;
  }

  const archetypes = [...byArchetype.entries()]
    .map(([id, entry]) => Object.freeze({
      id,
      definition: getArchetypeDefinition(id),
      policyIdByDifficulty: Object.freeze({ ...entry.policyIdByDifficulty }),
      availableDifficulties: Object.freeze(DIFFICULTY_IDS.filter(d => entry.policyIdByDifficulty[d])),
    }))
    .sort((a, b) => archetypeSortIndex(a.id) - archetypeSortIndex(b.id) || a.id.localeCompare(b.id));

  const defaultDifficulty = pickDefaultDifficulty(archetypes);
  const compatible = compatibleArchetypes({ archetypes }, defaultDifficulty);

  return Object.freeze({
    difficulties: Object.freeze(DIFFICULTY_IDS.map(id => DIFFICULTY_DEFINITIONS[id])),
    archetypes: Object.freeze(archetypes),
    defaultDifficulty,
    defaultArchetype: compatible[0]?.id ?? archetypes[0]?.id ?? null,
  });
}

/**
 * Resolve a (difficulty, archetype) pair into the concrete shipped policy.
 *
 * This is the single guard against invalid combinations persisting: an
 * archetype that does not exist at the requested difficulty falls back to
 * the first compatible archetype, and an unknown difficulty falls back to
 * the model default.
 *
 * @param {object} model - Result of buildOpponentModel
 * @param {string} difficultyId
 * @param {string} archetypeId
 * @returns {{difficulty: string, difficultyDefinition: object|null, archetype: string|null,
 *            archetypeDefinition: object|null, policyId: string|null, compatibleArchetypes: Array}}
 */
export function resolveOpponent(model, difficultyId, archetypeId) {
  const difficulty = DIFFICULTY_DEFINITIONS[difficultyId]
    ? difficultyId
    : model?.defaultDifficulty ?? 'normal';
  const compatible = compatibleArchetypes(model, difficulty);
  const selected = compatible.find(a => a.id === archetypeId) ?? compatible[0] ?? null;
  return {
    difficulty,
    difficultyDefinition: DIFFICULTY_DEFINITIONS[difficulty] ?? null,
    archetype: selected ? selected.id : null,
    archetypeDefinition: selected ? selected.definition : null,
    policyId: selected ? selected.policyIdByDifficulty[difficulty] ?? null : null,
    compatibleArchetypes: compatible,
  };
}

/**
 * Choose which archetype stays selected when the difficulty changes: keep
 * the player's current archetype when it exists at the new difficulty,
 * otherwise fall back to the default archetype, otherwise the first one.
 * @param {object} model
 * @param {string} difficultyId
 * @param {string} preferredArchetypeId
 * @returns {string|null}
 */
export function archetypeForDifficulty(model, difficultyId, preferredArchetypeId) {
  const compatible = compatibleArchetypes(model, difficultyId);
  if (!compatible.length) return null;
  if (compatible.some(a => a.id === preferredArchetypeId)) return preferredArchetypeId;
  if (compatible.some(a => a.id === model?.defaultArchetype)) return model.defaultArchetype;
  return compatible[0].id;
}

/**
 * Player-facing summary of a difficulty/archetype combination, used as the
 * heading of the Opponent Brief and the Match Brief ("Normal · Rusher").
 * @param {string} difficultyId
 * @param {string} archetypeId
 * @returns {string}
 */
export function describeOpponent(difficultyId, archetypeId) {
  const difficulty = DIFFICULTY_DEFINITIONS[difficultyId];
  if (!difficulty) return '';
  if (!archetypeId) return difficulty.label;
  return `${difficulty.label} · ${getArchetypeDefinition(archetypeId).label}`;
}

