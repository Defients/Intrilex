// ═══════════════════════════════════════════════════════════════
// index.mjs — Public entry point for @intrilex/achievements
// Re-exports all public API surface.
// ═══════════════════════════════════════════════════════════════

// Constants
export {
  RARITY,
  CATEGORY,
  PROGRESS_TYPE,
  PROVENANCE,
  AP_BY_RARITY,
  RARITY_SYMBOL,
  LAUNCH_CONSTRAINTS,
  HIDDEN_ACHIEVEMENT_IDS,
  ACHIEVEMENT_SCHEMA_VERSION,
  CATALOG_VERSION,
  ACHIEVEMENT_PRODUCT_VERSION,
  ACHIEVEMENT_RULES_VERSION,
  ACHIEVEMENT_ENGINE_VERSION,
  FACT_KIND,
  ELIGIBILITY_SCOPE,
  ZONE,
  LAUNCH_ZONE_SET,
  CLEAN_SWEEP_ZONES,
  LAUNCH_SPADES_EFFECTS,
  LAUNCH_SPADES_EFFECT_COUNT,
  CARD_MASTERY_ACHIEVEMENT_IDS,
} from './constants.mjs';

// Catalog
export {
  buildCatalog,
  getCatalog,
  getCatalogById,
  getDefinition,
  getAllIds,
} from './catalog.mjs';

// Validation
export {
  validateCatalog,
  assertCatalogValid,
} from './validation.mjs';

// Eligibility
export {
  isQualifyingMatch,
  isEligible,
  localVsAIContext,
  networkMatchContext,
} from './eligibility.mjs';

// Facts
export {
  FACT_SCHEMA_VERSION,
  buildFactId,
  deriveAchievementFacts,
  createCheckpointFact,
} from './facts.mjs';

// Progress / Trackers
export {
  createMatchTracker,
  serializeMatchTracker,
  deserializeMatchTracker,
  createCareerTracker,
  serializeCareerTracker,
  deserializeCareerTracker,
  createAchievementProfileState,
  getProgress,
  isEarned,
  computeTotalAP,
  countEarned,
} from './progress.mjs';

// Reducer
export {
  reduceFact,
  reduceFacts,
  createTrackers,
} from './reducer.mjs';

// Evaluator
export {
  evaluateAchievements,
  applyUnlocks,
} from './evaluator.mjs';

// Migration
export {
  migrateLegacyData,
  isMigrated,
} from './migration.mjs';
