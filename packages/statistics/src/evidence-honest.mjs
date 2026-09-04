// ═══════════════════════════════════════════════════════════════
// evidence-honest.mjs — Evidence-honest player intelligence labels (pure)
//
// Ensures that every player-intelligence display surfaces the truth
// about its evidence base: how many samples back it, how confident we
// are, which season/version boundary the data lives in, and whether
// the subject is a human or an AI. Intelligence without honesty is
// just confident-sounding noise.
//
// Five pillars:
//   1. Uncertainty labels  — sample-size → confidence band
//   2. Sample disclaimers  — context-specific minimum-sample gates
//   3. Season boundaries    — mark data that crosses season/version edges
//   4. Human vs AI          — never aggregate across the human/AI divide
//   5. Aggregation guard    — refuse invalid cross-boundary merges
//
// This module is PURE: no I/O, no side effects, no DB, no UI.
// It is consumed by:
//   - apps/lab-web/src/workspaces/intelligence.js
//   - apps/lab-web/src/analytics-ai/intelligence-panel.js
//   - packages/account-domain/src/relationships.mjs (rivalry intensity)
//
// All functions are deterministic and total: bad input yields a
// safe "INSUFFICIENT_DATA" / "shouldSuppressDisplay: true" result
// rather than throwing. The only exceptions are TypeError for
// non-object args where the contract would be silently violated.
// ═══════════════════════════════════════════════════════════════

/**
 * @readonly
 * @enum {string} Confidence band for a statistics object, derived
 * primarily from sample size. Ordered from least to most evidence.
 */
export const CONFIDENCE_LEVEL = Object.freeze({
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
  VERY_LOW_CONFIDENCE: 'VERY_LOW_CONFIDENCE',
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',
  MODERATE_CONFIDENCE: 'MODERATE_CONFIDENCE',
  HIGH_CONFIDENCE: 'HIGH_CONFIDENCE',
});

/**
 * @readonly
 * @enum {string} Player type for human/AI distinction.
 */
export const PLAYER_TYPE = Object.freeze({
  HUMAN: 'HUMAN',
  AI: 'AI',
});

/**
 * @readonly
 * @enum {number} Minimum sample size required for a statistic to be
 * considered meaningful in a given display context. Below the
 * threshold a disclaimer (or suppression) is required.
 */
export const SAMPLE_SIZE_THRESHOLDS = Object.freeze({
  WIN_RATE: 30,
  RATING_TREND: 10,
  HEAD_TO_HEAD: 5,
  MECHANIC_USAGE: 50,
});

/**
 * Maps a context string (as passed to buildSampleSizeDisclaimer and
 * buildEvidenceHonestSummary) to its threshold. Aliases are accepted
 * so callers may use either the kebab-case UI context or the
 * SCREAMING_SNAKE enum key.
 */
/** @type {Record<string, number>} */
const CONTEXT_THRESHOLD_MAP = Object.freeze({
  'win-rate': SAMPLE_SIZE_THRESHOLDS.WIN_RATE,
  'WIN_RATE': SAMPLE_SIZE_THRESHOLDS.WIN_RATE,
  'rating-trend': SAMPLE_SIZE_THRESHOLDS.RATING_TREND,
  'RATING_TREND': SAMPLE_SIZE_THRESHOLDS.RATING_TREND,
  'head-to-head': SAMPLE_SIZE_THRESHOLDS.HEAD_TO_HEAD,
  'HEAD_TO_HEAD': SAMPLE_SIZE_THRESHOLDS.HEAD_TO_HEAD,
  'mechanic-usage': SAMPLE_SIZE_THRESHOLDS.MECHANIC_USAGE,
  'MECHANIC_USAGE': SAMPLE_SIZE_THRESHOLDS.MECHANIC_USAGE,
});

/**
 * Human-readable descriptions for each confidence band, used by
 * computeUncertaintyLabel's `humanReadable` field and by UI tooltips.
 */
const CONFIDENCE_HUMAN_READABLE = Object.freeze({
  INSUFFICIENT_DATA: 'Insufficient data — no meaningful conclusion yet',
  VERY_LOW_CONFIDENCE: 'Very low confidence — directional signal only',
  LOW_CONFIDENCE: 'Low confidence — treat as preliminary',
  MODERATE_CONFIDENCE: 'Moderate confidence — reasonably reliable',
  HIGH_CONFIDENCE: 'High confidence — robust estimate',
});

/**
 * Numeric confidence (0–1) mapped from each band. Used for sorting,
 * progress bars, and aggregation-weight heuristics. These are
 * conservative midpoints, not statistical guarantees.
 */
/** @type {Record<string, number>} */
const CONFIDENCE_NUMERIC = Object.freeze({
  INSUFFICIENT_DATA: 0,
  VERY_LOW_CONFIDENCE: 0.2,
  LOW_CONFIDENCE: 0.4,
  MODERATE_CONFIDENCE: 0.7,
  HIGH_CONFIDENCE: 0.9,
});

/**
 * Known AI policy-id prefixes. A player whose policyId starts with
 * one of these (or equals one of the known archetypes) is classified
 * as AI. Human players carry a Supabase account UUID instead.
 */
const AI_POLICY_PREFIXES = Object.freeze(['hybrix-', 'ai-', 'bot-']);

/**
 * Known AI archetypes, extracted from the canonical policy IDs
 * (hybrix-baseline, hybrix-rusher, …). Used to populate
 * buildPlayerTypeLabel's `aiArchetype` field.
 */
/** @type {Record<string, string>} */
const AI_ARCHETYPE_BY_POLICY = Object.freeze({
  'hybrix-baseline': 'baseline',
  'hybrix-rusher': 'rusher',
  'hybrix-defender': 'defender',
  'hybrix-balanced': 'balanced',
  'hybrix-opportunist': 'opportunist',
  'ai-easy': 'baseline',
  'ai-hard': 'balanced',
  'bot-easy': 'baseline',
  'bot-hard': 'balanced',
});

/**
 * Resolve a sample size from a loose stats object. Accepts
 * `sampleSize`, `n`, `games`, or `count`. Returns 0 for
 * missing/non-finite values so downstream logic always sees a number.
 * @param {any} stats
 * @returns {number}
 */
function resolveSampleSize(stats) {
  if (!stats || typeof stats !== 'object') return 0;
  const candidate = stats.sampleSize ?? stats.n ?? stats.games ?? stats.count ?? stats.total;
  const n = Number(candidate);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

/**
 * Compute an evidence-honest uncertainty label for a statistics object.
 *
 * The band is derived primarily from sample size. If the caller
 * supplies an explicit `confidence` (0–1) or `variance`, those refine
 * the numeric `confidence` returned but do not override the band —
 * the band is the public contract; the numeric value is a hint.
 *
 * @param {{ sampleSize?: number, n?: number, games?: number, count?: number, confidence?: number, variance?: number }} stats
 *   Statistics object. Any of `sampleSize`/`n`/`games`/`count`/`total`
 *   is accepted as the sample-size field.
 * @returns {{ level: string, label: string, confidence: number, humanReadable: string }}
 *   `level` is a CONFIDENCE_LEVEL key; `label` is the same string
 *   (kept for API symmetry with other modules); `confidence` is a
 *   numeric 0–1 score; `humanReadable` is a UI-ready description.
 */
export function computeUncertaintyLabel(stats) {
  if (!stats || typeof stats !== 'object') {
    return {
      level: CONFIDENCE_LEVEL.INSUFFICIENT_DATA,
      label: CONFIDENCE_LEVEL.INSUFFICIENT_DATA,
      confidence: 0,
      humanReadable: CONFIDENCE_HUMAN_READABLE.INSUFFICIENT_DATA,
    };
  }
  const n = resolveSampleSize(stats);

  let level;
  if (n === 0) level = CONFIDENCE_LEVEL.INSUFFICIENT_DATA;
  else if (n < 10) level = CONFIDENCE_LEVEL.VERY_LOW_CONFIDENCE;
  else if (n < 30) level = CONFIDENCE_LEVEL.LOW_CONFIDENCE;
  else if (n < 100) level = CONFIDENCE_LEVEL.MODERATE_CONFIDENCE;
  else level = CONFIDENCE_LEVEL.HIGH_CONFIDENCE;

  // Refine the numeric confidence with caller-supplied hints, but
  // never let a hint push the number above the band's ceiling.
  let confidence = CONFIDENCE_NUMERIC[level] || 0;
  const statsConf = /** @type {number} */ (stats.confidence);
  if (Number.isFinite(statsConf)) {
    confidence = Math.min(confidence, Math.max(0, Math.min(1, statsConf)));
  }
  // High variance drags confidence down toward the band floor.
  const statsVar = /** @type {number} */ (stats.variance);
  if (Number.isFinite(statsVar) && statsVar > 0) {
    const variancePenalty = Math.min(0.15, statsVar * 0.05);
    confidence = Math.max(0, confidence - variancePenalty);
  }

  return {
    level,
    label: level,
    confidence: Math.round(confidence * 1000) / 1000,
    humanReadable: CONFIDENCE_HUMAN_READABLE[level],
  };
}

/**
 * Build a structured sample-size disclaimer for a given display context.
 *
 * Different intelligence surfaces need different amounts of evidence
 * before a number is worth showing. A win rate needs ~30 games; a
 * head-to-head record needs only ~5; mechanic-usage patterns need
 * ~50. This function centralises that policy so every surface agrees.
 *
 * @param {{ sampleSize?: number, n?: number, games?: number, count?: number }} stats
 *   Statistics object whose sample size is to be checked.
 * @param {string} context
 *   Display context: 'win-rate', 'rating-trend', 'head-to-head', or
 *   'mechanic-usage' (case-insensitive, kebab or SCREAMING_SNAKE).
 * @returns {{ disclaimerText: string, shouldDisplay: boolean, threshold: number, actualSize: number, context: string }}
 *   `shouldDisplay` is true when the sample size is BELOW the
 *   threshold (i.e. the disclaimer SHOULD be shown). When the
 *   threshold is met, `shouldDisplay` is false and `disclaimerText`
 *   is an empty string.
 */
export function buildSampleSizeDisclaimer(stats, context) {
  const actualSize = resolveSampleSize(stats);
  const ctx = String(context ?? '').toLowerCase();
  const threshold = CONTEXT_THRESHOLD_MAP[ctx] ?? CONTEXT_THRESHOLD_MAP[context] ?? 0;

  if (threshold === 0 || actualSize >= threshold) {
    return {
      disclaimerText: '',
      shouldDisplay: false,
      threshold,
      actualSize,
      context: ctx || String(context ?? ''),
    };
  }

  const deficit = threshold - actualSize;
  const disclaimerText =
    actualSize === 0
      ? `No data yet for ${ctx} — at least ${threshold} samples required before this statistic is shown.`
      : `Only ${actualSize} sample${actualSize === 1 ? '' : 's'} for ${ctx} — ${deficit} more needed (minimum ${threshold}) before this statistic is reliable.`;

  return {
    disclaimerText,
    shouldDisplay: true,
    threshold,
    actualSize,
    context: ctx || String(context ?? ''),
  };
}

/**
 * Build a season/version boundary descriptor for a statistics object.
 *
 * Intelligence displays must never silently aggregate data across a
 * season reset or an engine/rules version change. This function
 * inspects the stats and the supplied season metadata and returns
 * the labels and warnings a UI needs to mark the boundary honestly.
 *
 * @param {{ seasonId?: string, seasonIds?: string[], versionIds?: string[], engineVersion?: string, rulesVersion?: string, spansSeasons?: boolean, spansVersions?: boolean }} stats
 *   Statistics object. May carry `seasonId` (single) or `seasonIds`
 *   (array) and likewise for versions.
 * @param {{ id?: string, seasonId?: string, label?: string, name?: string, status?: string, startDate?: string, endDate?: string, isCurrent?: boolean, finalized?: boolean, currentSeasonId?: string, engineVersion?: string, rulesVersion?: string }} [seasonInfo]
 *   Metadata for the season the data belongs to (or the current
 *   season, for comparison). All fields optional.
 * @returns {{ seasonId: string | null, seasonLabel: string, isCurrentSeason: boolean, isPartialSeason: boolean, boundaryWarning: string, versionBoundaryWarning: string }}
 *   Descriptor for UI rendering. Warnings are empty strings when no
 *   boundary is crossed.
 */
export function buildSeasonBoundary(stats, seasonInfo) {
  const safeStats = stats && typeof stats === 'object' ? stats : {};
  const info = seasonInfo && typeof seasonInfo === 'object' ? seasonInfo : {};

  const seasonId = String(safeStats.seasonId ?? info.seasonId ?? info.id ?? '') || null;
  const seasonIds = Array.isArray(safeStats.seasonIds) ? safeStats.seasonIds.map(String) : [];
  const versionIds = Array.isArray(safeStats.versionIds) ? safeStats.versionIds.map(String) : [];

  const rawLabel = info.label ?? info.name;
  const seasonLabel = rawLabel
    ? String(rawLabel)
    : seasonId
      ? `Season ${seasonId}`
      : 'Unknown season';

  const currentSeasonId = String(info.currentSeasonId ?? info.id ?? info.seasonId ?? '') || null;
  const isCurrentSeason = seasonId !== null && currentSeasonId !== null && seasonId === currentSeasonId;
  const finalized = info.finalized === true || String(info.status ?? '').toUpperCase() === 'ARCHIVED';
  const isPartialSeason = !finalized && (info.status === undefined || ['ACTIVE', 'FINALIZING', 'UPCOMING'].includes(String(info.status ?? '').toUpperCase()));

  // Season-boundary detection: either an explicit flag, multiple
  // season IDs, or a mismatch between the data's season and the
  // current season when the data is labelled as historical.
  const spansSeasons =
    safeStats.spansSeasons === true ||
    seasonIds.length > 1 ||
    (seasonId !== null && currentSeasonId !== null && seasonId !== currentSeasonId && finalized);

  const boundaryWarning = spansSeasons
    ? seasonIds.length > 1
      ? `Data spans ${seasonIds.length} seasons (${seasonIds.join(', ')}). Aggregating across seasons may obscure rating resets — consider filtering to a single season.`
      : `Data is from a previous season (${seasonLabel}) and may not reflect current ratings.`
    : '';

  // Version-boundary detection: explicit flag, multiple version IDs,
  // or a mismatch between the data's engine/rules version and the
  // current one supplied via seasonInfo.
  const dataEngineVersion = String(safeStats.engineVersion ?? '').trim();
  const dataRulesVersion = String(safeStats.rulesVersion ?? '').trim();
  const currentEngineVersion = String(info.engineVersion ?? '').trim();
  const currentRulesVersion = String(info.rulesVersion ?? '').trim();

  const versionMismatch =
    (dataEngineVersion && currentEngineVersion && dataEngineVersion !== currentEngineVersion) ||
    (dataRulesVersion && currentRulesVersion && dataRulesVersion !== currentRulesVersion);

  const spansVersions =
    safeStats.spansVersions === true || versionIds.length > 1 || versionMismatch;

  const versionBoundaryWarning = spansVersions
    ? versionIds.length > 1
      ? `Data spans ${versionIds.length} engine/rules versions (${versionIds.join(', ')}). Mechanic balance may differ across versions — do not compare directly.`
      : `Data was recorded under engine/rules version ${dataEngineVersion || dataRulesVersion || 'unknown'} which differs from the current version. Balance changes may make comparisons misleading.`
    : '';

  return {
    seasonId,
    seasonLabel,
    isCurrentSeason,
    isPartialSeason,
    boundaryWarning,
    versionBoundaryWarning,
  };
}

/**
 * Build a human/AI player-type label.
 *
 * AI players (policy-driven bots such as hybrix-rusher) have
 * fundamentally different decision patterns from human players.
 * Their stats must never be silently mixed. This function classifies
 * a player info blob and returns the label + separation directive.
 *
 * @param {{ policyId?: string, isAI?: boolean, aiArchetype?: string, aiDifficulty?: string, accountId?: string, accountType?: string }} playerInfo
 *   Player info. AI players carry a `policyId` (e.g. 'hybrix-rusher')
 *   or an explicit `isAI: true`. Humans carry a Supabase `accountId`.
 * @returns {{ playerType: string, label: string, aiArchetype: string | null, aiDifficulty: string | null, policyId: string | null, shouldSeparate: boolean, separationReason: string }}
 *   Classification result. `shouldSeparate` is always true — the
 *   human/AI divide is a hard boundary, not a soft preference.
 */
export function buildPlayerTypeLabel(playerInfo) {
  if (!playerInfo || typeof playerInfo !== 'object') {
    return {
      playerType: PLAYER_TYPE.HUMAN,
      label: 'Human Player',
      aiArchetype: null,
      aiDifficulty: null,
      policyId: null,
      shouldSeparate: true,
      separationReason: 'AI and human players have fundamentally different decision patterns',
    };
  }

  const policyId = String(playerInfo.policyId ?? '').trim() || null;
  const explicitAI = playerInfo.isAI === true || String(playerInfo.accountType ?? '').toLowerCase() === 'ai';

  const isAI = explicitAI || (policyId !== null && AI_POLICY_PREFIXES.some((p) => policyId.startsWith(p)));

  if (!isAI) {
    return {
      playerType: PLAYER_TYPE.HUMAN,
      label: 'Human Player',
      aiArchetype: null,
      aiDifficulty: null,
      policyId: null,
      shouldSeparate: true,
      separationReason: 'AI and human players have fundamentally different decision patterns',
    };
  }

  const aiArchetype =
    String(playerInfo.aiArchetype ?? '').trim() ||
    AI_ARCHETYPE_BY_POLICY[policyId ?? ''] ||
    (policyId ? policyId.replace(/^(hybrix|ai|bot)-/, '') : 'unknown') ||
    'unknown';

  const aiDifficulty =
    String(playerInfo.aiDifficulty ?? '').trim() ||
    (policyId && policyId.includes('easy') ? 'easy' : policyId && policyId.includes('hard') ? 'hard' : 'standard') ||
    'standard';

  return {
    playerType: PLAYER_TYPE.AI,
    label: `AI: ${aiArchetype}`,
    aiArchetype,
    aiDifficulty,
    policyId,
    shouldSeparate: true,
    separationReason: 'AI and human players have fundamentally different decision patterns',
  };
}

/**
 * Build a compact, UI-ready display label that bakes in the headline
 * statistic, its confidence band, its sample size, and its season.
 * @param {any} rawStats
 * @param {string} context
 * @param {{ headline?: string, seasonLabel?: string }} [pieces]
 * @returns {string}
 */
function buildDisplayLabel(rawStats, context, pieces) {
  const { level } = computeUncertaintyLabel(rawStats);
  const n = resolveSampleSize(rawStats);
  const headline = pieces?.headline ?? contextHeadline(context, rawStats);
  const season = pieces?.seasonLabel ? `, ${pieces.seasonLabel}` : '';
  return `${headline} (${level}, n=${n}${season})`;
}

/**
 * Produce a human-readable headline statistic for a context.
 * @param {string} context
 * @param {any} stats
 * @returns {string}
 */
function contextHeadline(context, stats) {
  const ctx = String(context ?? '').toLowerCase();
  const safe = stats && typeof stats === 'object' ? stats : {};
  switch (ctx) {
    case 'win-rate':
    case 'win_rate': {
      const rate = Number.isFinite(safe.winRate) ? Math.round(safe.winRate * 100) : Number.isFinite(safe.value) ? Math.round(safe.value * 100) : null;
      return rate !== null ? `Win Rate: ${rate}%` : 'Win Rate';
    }
    case 'rating-trend':
    case 'rating_trend': {
      const trend = Number.isFinite(safe.trend) ? safe.trend : Number.isFinite(safe.value) ? safe.value : null;
      return trend !== null ? `Rating Trend: ${trend > 0 ? '+' : ''}${Math.round(trend)}` : 'Rating Trend';
    }
    case 'head-to-head':
    case 'head_to_head': {
      const wins = Number(safe.wins) || 0;
      const losses = Number(safe.losses) || 0;
      return `Head-to-Head: ${wins}-${losses}`;
    }
    case 'mechanic-usage':
    case 'mechanic_usage': {
      const usage = Number.isFinite(safe.usageRate) ? Math.round(safe.usageRate * 100) : null;
      return usage !== null ? `Mechanic Usage: ${usage}%` : 'Mechanic Usage';
    }
    default:
      return 'Statistic';
  }
}

/**
 * Combine all evidence-honest primitives into a single summary that a
 * UI can render in one pass.
 *
 * @param {any} rawStats
 *   The raw statistics object (win rate, rating trend, etc.).
 * @param {string} context
 *   Display context — see SAMPLE_SIZE_THRESHOLDS keys.
 * @param {{ seasonInfo?: any, playerInfo?: any, suppressThreshold?: number }} [options]
 *   Optional season metadata, player metadata, and the sample-size
 *   below which `shouldSuppressDisplay` becomes true (default 1 —
 *   suppress only when there is literally no data).
 * @returns {{ stats: any, uncertaintyLabel: any, sampleSizeDisclaimer: any, seasonBoundary: any | null, playerTypeLabel: any | null, displayWarnings: string[], shouldSuppressDisplay: boolean, confidenceLevel: number, displayLabel: string }}
 *   The complete evidence-honest summary.
 */
export function buildEvidenceHonestSummary(rawStats, context, options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const suppressThreshold = Number.isFinite(opts.suppressThreshold) ? /** @type {number} */(opts.suppressThreshold) : 1;

  const uncertaintyLabel = computeUncertaintyLabel(rawStats);
  const sampleSizeDisclaimer = buildSampleSizeDisclaimer(rawStats, context);

  const seasonBoundary = opts.seasonInfo ? buildSeasonBoundary(rawStats, opts.seasonInfo) : null;
  const playerTypeLabel = opts.playerInfo ? buildPlayerTypeLabel(opts.playerInfo) : null;

  const displayWarnings = [];
  if (sampleSizeDisclaimer.shouldDisplay) displayWarnings.push(sampleSizeDisclaimer.disclaimerText);
  if (seasonBoundary?.boundaryWarning) displayWarnings.push(seasonBoundary.boundaryWarning);
  if (seasonBoundary?.versionBoundaryWarning) displayWarnings.push(seasonBoundary.versionBoundaryWarning);
  if (seasonBoundary?.isPartialSeason) displayWarnings.push(`${seasonBoundary.seasonLabel} is still in progress — final standings may change.`);

  const n = resolveSampleSize(rawStats);
  const shouldSuppressDisplay = n < suppressThreshold || uncertaintyLabel.level === CONFIDENCE_LEVEL.INSUFFICIENT_DATA;

  const displayLabel = buildDisplayLabel(rawStats, context, {
    seasonLabel: seasonBoundary?.seasonLabel && seasonBoundary.seasonLabel !== 'Unknown season' ? seasonBoundary.seasonLabel : undefined,
  });

  return {
    stats: rawStats,
    uncertaintyLabel,
    sampleSizeDisclaimer,
    seasonBoundary,
    playerTypeLabel,
    displayWarnings,
    shouldSuppressDisplay,
    confidenceLevel: uncertaintyLabel.confidence,
    displayLabel,
  };
}

/**
 * Default aggregation rules. Callers may override individual fields
 * via the `rules` parameter to validateAggregation.
 */
const DEFAULT_AGGREGATION_RULES = Object.freeze({
  allowCrossSeason: false,
  allowCrossVersion: false,
  allowCrossPlayerType: false,
});

/**
 * Validate whether a set of datasets may be safely aggregated.
 *
 * Hard boundaries (always enforced unless explicitly allowed):
 *   - Human vs AI player types must not mix.
 *   - Different seasons must not mix (unless `allowCrossSeason`).
 *   - Different engine/rules versions must not mix (unless
 *     `allowCrossVersion`).
 *
 * @param {Array<{ playerInfo?: any, seasonId?: string, seasonIds?: string[], engineVersion?: string, rulesVersion?: string, playerType?: string }>} datasets
 *   The datasets under consideration for aggregation.
 * @param {{ allowCrossSeason?: boolean, allowCrossVersion?: boolean, allowCrossPlayerType?: boolean }} [rules]
 *   Override flags. Any field not supplied defaults to false.
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 *   `valid` is true only when `errors` is empty. `warnings` carries
 *   soft concerns (e.g. a partial season) that do not block aggregation.
 */
export function validateAggregation(datasets, rules) {
  /** @type {string[]} */ const errors = [];
  /** @type {string[]} */ const warnings = [];
  if (!Array.isArray(datasets) || datasets.length === 0) {
    return { valid: false, errors: ['No datasets provided for aggregation.'], warnings };
  }
  const cfg = { ...DEFAULT_AGGREGATION_RULES, ...(rules && typeof rules === 'object' ? rules : {}) };

  // Classify each dataset's player type.
  const types = new Set();
  const seasons = new Set();
  const versions = new Set();

  for (let i = 0; i < datasets.length; i++) {
    const ds = /** @type {Record<string, any>} */ (datasets[i] && typeof datasets[i] === 'object' ? datasets[i] : {});

    const playerType =
      ds.playerType ?? buildPlayerTypeLabel(ds.playerInfo ?? {}).playerType;
    types.add(playerType);

    const dsSeasons = Array.isArray(ds.seasonIds) ? ds.seasonIds.map(String) : ds.seasonId ? [String(ds.seasonId)] : [];
    for (const s of dsSeasons) seasons.add(s);

    const dsVersions = Array.isArray(ds.versionIds)
      ? ds.versionIds.map(String)
      : ds.engineVersion || ds.rulesVersion
        ? [String(ds.engineVersion ?? ds.rulesVersion)]
        : [];
    for (const v of dsVersions) versions.add(v);
  }

  if (types.size > 1 && !cfg.allowCrossPlayerType) {
    errors.push(`Cannot aggregate across player types: found ${[...types].join(', ')}. AI and human players have fundamentally different decision patterns.`);
  } else if (types.size > 1 && cfg.allowCrossPlayerType) {
    warnings.push('Aggregating across player types (human + AI). Results should be interpreted with caution and clearly labelled.');
  }

  if (seasons.size > 1 && !cfg.allowCrossSeason) {
    errors.push(`Cannot aggregate across seasons: found ${[...seasons].join(', ')}. Rating resets make cross-season aggregation misleading.`);
  } else if (seasons.size > 1 && cfg.allowCrossSeason) {
    warnings.push(`Aggregating across ${seasons.size} seasons (${[...seasons].join(', ')}). Rating-reset artifacts may distort trends.`);
  }

  if (versions.size > 1 && !cfg.allowCrossVersion) {
    errors.push(`Cannot aggregate across engine/rules versions: found ${[...versions].join(', ')}. Balance changes make cross-version comparison misleading.`);
  } else if (versions.size > 1 && cfg.allowCrossVersion) {
    warnings.push(`Aggregating across ${versions.size} engine/rules versions (${[...versions].join(', ')}). Mechanic balance may differ across versions.`);
  }

  if (datasets.length === 1) {
    warnings.push('Only one dataset provided — aggregation is trivially valid but yields no cross-dataset signal.');
  }

  return { valid: errors.length === 0, errors, warnings };
}
