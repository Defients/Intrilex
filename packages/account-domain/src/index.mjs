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
  deriveOutcome,
  initialRatingState,
} from './rating.mjs';

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
  DEFAULT_SEASON_ID,
  buildLeaderboardQuery,
  computeWinRate,
  processLeaderboardRows,
  findPlayerRank,
} from './leaderboard.mjs';
