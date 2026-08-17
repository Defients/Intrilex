// ═══════════════════════════════════════════════════════════════
// save-integrity.js — Canonical save integrity payload builder
// Extracted from play-controller.js so tests import the PRODUCTION
// function, not duplicated test logic.
// ═══════════════════════════════════════════════════════════════

import { hashCanonical } from '../engine/browser-entry.js?v=4f30833b427f';

// ── Release identity (single source — Gate 4 canonical location) ──
export const PRODUCT_VERSION = '0.28.0';
export const PLAYER_RUNTIME_VERSION = '1.2.0';
export const ENGINE_VERSION = '4.2.6';
export const RULES_VERSION = '4.3.1';
export const SAVE_FORMAT_VERSION = 2;

// Trusted profile registry — only profiles in this set may be restored
export const SUPPORTED_PROFILES = new Set([
  'core-advanced-authority',
  'core-unrestricted-authority',
  'first-contact-trigger-closure',
]);

// Required fields for v2 saves
export const REQUIRED_SAVE_FIELDS = [
  'saveId', 'sessionId', 'profileId', 'mode', 'setup',
  'decisionJournal', 'commandLog',
  'initialStateHash', 'commandLogHash', 'expectedStateHash',
  'contentHash',
];

// Reason codes for structured error handling
export const SAVE_REASON_CODES = Object.freeze({
  INVALID_SAVE_ENVELOPE: 'INVALID_SAVE_ENVELOPE',
  INVALID_SAVE_FORMAT: 'INVALID_SAVE_FORMAT',
  UNSUPPORTED_SAVE_VERSION: 'UNSUPPORTED_SAVE_VERSION',
  LEGACY_UNBOUND_AUTHORITY: 'LEGACY_UNBOUND_AUTHORITY',
  MISSING_SAVE_FIELD: 'MISSING_SAVE_FIELD',
  SAVE_HASH_MISMATCH: 'SAVE_HASH_MISMATCH',
  INCOMPATIBLE_ENGINE_VERSION: 'INCOMPATIBLE_ENGINE_VERSION',
  INCOMPATIBLE_RULES_VERSION: 'INCOMPATIBLE_RULES_VERSION',
  INCOMPATIBLE_PLAYER_RUNTIME: 'INCOMPATIBLE_PLAYER_RUNTIME',
  INCOMPATIBLE_PRODUCT_VERSION: 'INCOMPATIBLE_PRODUCT_VERSION',
  UNSUPPORTED_PROFILE: 'UNSUPPORTED_PROFILE',
  PROFILE_MODE_MISMATCH: 'PROFILE_MODE_MISMATCH',
  INITIAL_STATE_HASH_MISMATCH: 'INITIAL_STATE_HASH_MISMATCH',
  COMMAND_LOG_HASH_MISMATCH: 'COMMAND_LOG_HASH_MISMATCH',
  EXPECTED_STATE_HASH_MISMATCH: 'EXPECTED_STATE_HASH_MISMATCH',
  STABLE_BOUNDARY_MISMATCH: 'STABLE_BOUNDARY_MISMATCH',
  RESTORE_FRAME_HASH_MISMATCH: 'RESTORE_FRAME_HASH_MISMATCH',
  MIGRATION_REQUIRED: 'MIGRATION_REQUIRED',
  MIGRATION_FAILED: 'MIGRATION_FAILED',
  MIGRATED_FROM_V1: 'MIGRATED_FROM_V1',
  MIGRATED_VERSION_MISMATCH: 'MIGRATED_VERSION_MISMATCH',
});

/**
 * Check if a save envelope can be migrated to the current format/version.
 * Returns the migration type or null if migration is not applicable.
 *
 * @param {object} save - The save envelope to check
 * @returns {{ canMigrate: boolean, migrationType?: 'V1_TO_V2' | 'VERSION_MISMATCH', reasonCode?: string }}
 */
export function canMigrateSave(save) {
  if (!save || typeof save !== 'object') return { canMigrate: false };
  if (save.format !== 'intrilex-player-save') return { canMigrate: false };

  // v1 saves can be migrated to v2 if they have a commandLog and setup
  if (save.version === 1) {
    if (!save.commandLog || !save.setup || !save.profileId) {
      return { canMigrate: false, reasonCode: 'MIGRATION_FAILED' };
    }
    return { canMigrate: true, migrationType: 'V1_TO_V2' };
  }

  // v2 saves with version mismatch can be migrated if they have valid content hash
  // (proving they were created by a trusted prior version)
  if (save.version === SAVE_FORMAT_VERSION) {
    const computedHash = buildSaveIntegrityPayload(save);
    if (computedHash === save.contentHash) {
      const versionMismatch =
        save.engineVersion !== ENGINE_VERSION ||
        save.rulesVersion !== RULES_VERSION ||
        save.playerRuntimeVersion !== PLAYER_RUNTIME_VERSION ||
        save.productVersion !== PRODUCT_VERSION;
      if (versionMismatch) {
        return { canMigrate: true, migrationType: 'VERSION_MISMATCH' };
      }
    }
  }

  return { canMigrate: false };
}

/**
 * Migrate a save envelope to the current format and version.
 *
 * For v1 saves: reconstructs the authority-bound fields (initialStateHash,
 * commandLogHash, expectedStateHash, contentHash) by replaying the command
 * log against the current engine.
 *
 * For version mismatches: re-derives the state hashes against the current
 * engine and stamps the current version fields.
 *
 * The migration is DESTRUCTIVE to the save envelope — it produces a new
 * v2 envelope with current version fields. The original save should be
 * preserved by the caller for audit purposes.
 *
 * @param {object} save - The save envelope to migrate
 * @param {object} engineModule - The engine module (IntrilexEngine, hashCanonical)
 * @param {object} autonomyModule - The autonomy module (createState)
 * @returns {Promise<{ ok: boolean, save?: object, migrationType?: string, error?: string }>}
 */
export async function migrateSave(save, engineModule, autonomyModule) {
  const migration = canMigrateSave(save);
  if (!migration.canMigrate) {
    return { ok: false, error: migration.reasonCode ?? 'MIGRATION_FAILED' };
  }

  try {
    const { IntrilexEngine, hashCanonical: hashFn } = engineModule;
    const { createState } = autonomyModule;

    // Reconstruct initial state from setup
    const stateSetup = {
      profileId: save.profileId,
      playerIds: ['P1', 'P2'],
      enabledModules: [],
      eventApprovedModules: [],
      seed: save.setup.seed >>> 0 || 1,
      seatOrder: save.setup.seatOrder,
    };
    const initialState = structuredClone(createState(stateSetup));
    const initialStateHash = hashFn(initialState);

    // Replay the command log to derive expectedStateHash
    const engine = new IntrilexEngine();
    let candidateState = initialState;
    for (const command of save.commandLog) {
      const result = engine.execute(candidateState, command);
      if (!result.accepted) {
        return { ok: false, error: `MIGRATION_FAILED: command rejected during replay at index ${save.commandLog.indexOf(command)}` };
      }
      candidateState = result.state;
    }
    const expectedStateHash = hashFn(candidateState);
    const commandLogHash = hashFn(save.commandLog);

    // Build the migrated v2 envelope
    const migrated = {
      format: 'intrilex-player-save',
      version: SAVE_FORMAT_VERSION,
      saveId: save.saveId ?? `migrated-${Date.now()}`,
      sessionId: save.sessionId,
      productVersion: PRODUCT_VERSION,
      playerRuntimeVersion: PLAYER_RUNTIME_VERSION,
      engineVersion: ENGINE_VERSION,
      rulesVersion: RULES_VERSION,
      profileId: save.profileId,
      mode: save.mode,
      setup: save.setup,
      decisionJournal: save.decisionJournal ?? [],
      commandLog: save.commandLog,
      initialStateHash,
      commandLogHash,
      expectedStateHash,
      stableBoundary: save.stableBoundary ?? null,
      tutorial: save.tutorial ?? null,
      migratedFrom: migration.migrationType,
      migratedAt: new Date().toISOString(),
    };

    // Compute the content hash binding all authority-critical fields
    migrated.contentHash = buildSaveIntegrityPayload(migrated);

    return { ok: true, save: migrated, migrationType: migration.migrationType };
  } catch (error) {
    return { ok: false, error: `MIGRATION_FAILED: ${error?.message ?? String(error)}` };
  }
}

/**
 * Build the canonical integrity payload for a save envelope.
 * Binds EVERY authority-critical field. Used for both save creation
 * and save validation. Must remain stable across save format versions.
 *
 * This is the SINGLE canonical function. Save creation, save export,
 * save import validation, local restore, IndexedDB restore, quarantine
 * diagnostics, and tests ALL use this function.
 *
 * @param {object} save - The save envelope (without contentHash)
 * @returns {string} Canonical SHA-256 hex hash
 */
export function buildSaveIntegrityPayload(save) {
  return hashCanonical({
    format: save.format,
    version: save.version,
    saveId: save.saveId,
    sessionId: save.sessionId,
    productVersion: save.productVersion,
    playerRuntimeVersion: save.playerRuntimeVersion,
    engineVersion: save.engineVersion,
    rulesVersion: save.rulesVersion,
    profileId: save.profileId,
    mode: save.mode,
    setup: save.setup,
    decisionJournal: save.decisionJournal,
    commandLog: save.commandLog,
    initialStateHash: save.initialStateHash,
    commandLogHash: save.commandLogHash,
    expectedStateHash: save.expectedStateHash,
    stableBoundary: save.stableBoundary,
    tutorial: save.tutorial,
  });
}

/**
 * Validate a save envelope's schema and content hash.
 * Returns { valid: true } or { valid: false, reasonCode, message }.
 *
 * This is the production validation path used by restore() before
 * any session mutation occurs.
 *
 * @param {object} save - The save envelope to validate
 * @returns {{ valid: boolean, reasonCode?: string, message?: string }}
 */
export function validateSaveEnvelope(save) {
  // Phase 1 — Schema & shape validation
  if (!save || typeof save !== 'object') {
    return { valid: false, reasonCode: 'INVALID_SAVE_ENVELOPE', message: 'Save envelope must be an object' };
  }
  if (save.format !== 'intrilex-player-save') {
    return { valid: false, reasonCode: 'INVALID_SAVE_FORMAT', message: 'Unsupported save format' };
  }

  // v1 handling — explicit and distrustful
  if (save.version !== SAVE_FORMAT_VERSION) {
    if (save.version === 1) {
      return { valid: false, reasonCode: 'LEGACY_UNBOUND_AUTHORITY', message: 'Save version 1 requires trusted authority migration.' };
    }
    return { valid: false, reasonCode: 'UNSUPPORTED_SAVE_VERSION', message: `Unsupported save version: ${save.version}` };
  }

  // Required fields
  for (const field of REQUIRED_SAVE_FIELDS) {
    if (save[field] === undefined || save[field] === null) {
      return { valid: false, reasonCode: 'MISSING_SAVE_FIELD', message: `Missing required save field: ${field}`, field };
    }
  }

  // Phase 2 — Content hash verification
  const computedHash = buildSaveIntegrityPayload(save);
  if (computedHash !== save.contentHash) {
    return { valid: false, reasonCode: 'SAVE_HASH_MISMATCH', message: 'Save content hash mismatch — save may be tampered' };
  }

  // Phase 3 — Version compatibility
  if (save.engineVersion !== ENGINE_VERSION) {
    return { valid: false, reasonCode: 'INCOMPATIBLE_ENGINE_VERSION', message: `Incompatible engine: ${save.engineVersion}` };
  }
  if (save.rulesVersion !== RULES_VERSION) {
    return { valid: false, reasonCode: 'INCOMPATIBLE_RULES_VERSION', message: `Incompatible rules: ${save.rulesVersion}` };
  }
  if (save.playerRuntimeVersion !== PLAYER_RUNTIME_VERSION) {
    return { valid: false, reasonCode: 'INCOMPATIBLE_PLAYER_RUNTIME', message: `Incompatible player runtime: ${save.playerRuntimeVersion}` };
  }
  if (save.productVersion !== PRODUCT_VERSION) {
    return { valid: false, reasonCode: 'INCOMPATIBLE_PRODUCT_VERSION', message: `Incompatible product: ${save.productVersion}` };
  }

  // Phase 4 — Profile validation
  if (!SUPPORTED_PROFILES.has(save.profileId)) {
    return { valid: false, reasonCode: 'UNSUPPORTED_PROFILE', message: `Unsupported profile: ${save.profileId}` };
  }

  return { valid: true };
}
