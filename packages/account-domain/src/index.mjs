// ═══════════════════════════════════════════════════════════════
// index.mjs — @intrilex/account-domain public API
// ═══════════════════════════════════════════════════════════════

export {
  generatePublicPlayerId,
  isValidPublicPlayerId,
  isValidAccountId,
  hashParticipantToken,
  verifyParticipantTokenHash,
  toSafePublicProfile,
  AuthState,
  ConnectionAuthState,
  AuthProvider,
  AccountStatus,
  AuthMode,
} from './identity.mjs';

export {
  anonymousCapabilities,
  permanentCapabilities,
  devModeCapabilities,
  resolveCapabilities,
  can,
  requireCapability,
} from './capabilities.mjs';

export {
  validateHandle,
  normalizeHandle,
  isReservedHandle,
  sanitizeDisplayName,
  defaultDisplayName,
  sanitizeAvatarUrl,
} from './validation.mjs';

export {
  DEFAULT_RATING,
  MIN_RATING,
  MAX_RATING,
  K_ESTABLISHED,
  K_PROVISIONAL,
  PROVISIONAL_THRESHOLD,
  clampRating,
  resolveKFactor,
  expectedScore,
  computeRatingUpdate,
  computeEloUpdate,
  deriveOutcome,
  initialRatingState,
  resultToScore,
} from './rating.mjs';

export {
  GLICKO2_SCALE,
  GLICKO2_ORIGIN,
  GLICKO2_TAU,
  DEFAULT_RATING_DEVIATION,
  DEFAULT_VOLATILITY,
  INACTIVE_RATING_DEVIATION,
  glicko2Update,
  initialGlicko2State,
  applyInactivity,
} from './glicko2.mjs';

export {
  SeasonStatus,
  RANKED_QUEUE_ID,
  DEFAULT_SEASON_DURATION_MS,
  SEASON_SOFT_RESET_RD_MULTIPLIER,
  isSeasonActive,
  activeSeasonForQueue,
  countActiveSeasons,
  sortSeasonsForPicker,
  applySeasonSoftReset,
  seasonIdFromOrdinal,
  seasonNameFromOrdinal,
} from './seasons.mjs';

export {
  AchievementProvenance,
  computeSyncDelta,
  resolveConflict,
  toCloudRow,
  fromCloudRow,
  mergeAchievements,
} from './achievement-sync.mjs';

export {
  migrationId,
  buildMigrationPlan,
  validateMigrationPlan,
  isMigrationCompleted,
  describeMigrationStep,
} from './guest-migration.mjs';

export {
  LeaderboardType,
  DEFAULT_LEADERBOARD_LIMIT,
  MAX_LEADERBOARD_LIMIT,
  LEADERBOARD_PAGE_SIZE,
  MAX_SEARCH_RESULTS,
  MIN_SEARCH_LENGTH,
  MAX_SEARCH_LENGTH,
  DEFAULT_SEASON_ID,
  computeWinRate,
  leaderboardComparator,
  toLeaderboardEntry,
  processLeaderboardRows,
  findPlayerRank,
  normalizeSearchQuery,
  validateTierFilter,
  apexLabel,
} from './leaderboard.mjs';

export {
  PLACEMENTS_REQUIRED,
  RankTier,
  Division,
  RANK_LADDER,
  DIVISION_LADDER,
  tierOrdinal,
  divisionOrdinal,
  isApexTier,
  tierHasDivisions,
  ratingToTierDivision,
  compareRank,
} from './rank-tier.mjs';

export {
  Visibility,
  ShowcaseItemType,
  DEFAULT_PRIVACY,
  DEFAULT_LOADOUT,
  MAX_FEATURED_ACHIEVEMENTS,
  MAX_FEATURED_BADGES,
  MAX_SHOWCASE_SLOTS,
  TITLE_CATALOG,
  PROFILE_FRAME_CATALOG,
  CARD_BACK_CATALOG,
  BADGE_CATALOG,
  getTitleDefinition,
  getFrameDefinition,
  getCardBackDefinition,
  getBadgeDefinition,
  isKnownBadge,
  validateCatalogConsistency,
  ownsTitle,
  ownsFrame,
  ownsCardBack,
  validatePrivacySettings,
  coercePrivacy,
  validateShowcaseSlot,
  validateShowcase,
  validateLoadout,
  validateShowcaseOwnership,
  buildPublicProfile,
  buildSelfProfile,
  buildRankedSummary,
  emptyRankedSummary,
} from './profile-domain.mjs';
