// ═══════════════════════════════════════════════════════════════
// migration-runner.mjs — SQLite migration framework with rollback
//
// Provides a versioned migration system for the match-server's SQLite
// database (better-sqlite3). Each migration has an `up` and `down`
// function and runs inside a transaction for atomicity.
//
// Features:
//   - Version-ordered migration application
//   - Per-migration transactional safety (auto-rollback on failure)
//   - Rollback support (single version or rollback-to-target)
//   - Status introspection (applied, pending, current version)
//   - Duplicate-version detection
//   - Pure validation helper for migration objects
//
// The `db` parameter is a better-sqlite3 Database instance exposing
// `.exec()`, `.prepare()`, and `.transaction()` methods.
// ═══════════════════════════════════════════════════════════════

/**
 * A single database migration definition.
 *
 * @typedef {Object} Migration
 * @property {string} id - Unique human-readable identifier (e.g. '001-create-players').
 * @property {number} version - Monotonically increasing version number (primary key).
 * @property {string} description - Short human-readable description of the migration.
 * @property {(db: import('better-sqlite3').Database) => void} up - Forward migration function.
 * @property {(db: import('better-sqlite3').Database) => void} down - Reverse migration function.
 */

/**
 * Configuration for {@link createMigrationRunner}.
 *
 * @typedef {Object} MigrationRunnerConfig
 * @property {string} [migrationsTable='_migrations'] - Table name used to track applied migrations.
 * @property {boolean} [allowRollback=true] - Whether rollback operations are permitted.
 */

/**
 * Result of {@link MigrationRunner.runPending}.
 *
 * @typedef {Object} RunPendingResult
 * @property {number} applied - Number of migrations applied.
 * @property {number[]} versions - Version numbers of applied migrations, in order.
 */

/**
 * Result of {@link MigrationRunner.rollback}.
 *
 * @typedef {Object} RollbackResult
 * @property {boolean} rolledBack - Whether a rollback was performed.
 * @property {number} version - The version that was rolled back.
 */

/**
 * Result of {@link MigrationRunner.rollbackTo}.
 *
 * @typedef {Object} RollbackToResult
 * @property {number[]} rolledBack - Version numbers rolled back, in reverse-applied order.
 * @property {number} fromVersion - The highest version before rollback.
 * @property {number} toVersion - The target version after rollback.
 */

/**
 * Status snapshot returned by {@link MigrationRunner.getStatus}.
 *
 * @typedef {Object} MigrationStatus
 * @property {number} currentVersion - Highest applied migration version, or 0 if none.
 * @property {number} pendingCount - Number of registered migrations not yet applied.
 * @property {Array<{version: number, id: string, description: string, applied_at: string}>} appliedMigrations
 *   Records of all applied migrations, ordered by version ascending.
 */

/**
 * An applied-migration record as stored in the migrations table.
 *
 * @typedef {Object} AppliedMigrationRecord
 * @property {number} version
 * @property {string} id
 * @property {string} description
 * @property {string} applied_at - ISO timestamp of when the migration was applied.
 */

/**
 * Validate that a migration object has all required fields with correct types.
 *
 * This is a pure function — it does not touch the database and has no side effects.
 *
 * @param {Migration} migration - The migration object to validate.
 * @returns {{ valid: boolean, errors: string[] }} Validation result with a list of error messages.
 */
export function validateMigration(migration) {
  const errors = [];

  if (migration === null || migration === undefined || typeof migration !== 'object') {
    return { valid: false, errors: ['Migration must be a non-null object.'] };
  }

  if (typeof migration.id !== 'string' || migration.id.trim().length === 0) {
    errors.push('Migration "id" must be a non-empty string.');
  }

  if (typeof migration.version !== 'number' || !Number.isInteger(migration.version) || migration.version <= 0) {
    errors.push('Migration "version" must be a positive integer.');
  }

  if (typeof migration.description !== 'string' || migration.description.trim().length === 0) {
    errors.push('Migration "description" must be a non-empty string.');
  }

  if (typeof migration.up !== 'function') {
    errors.push('Migration "up" must be a function.');
  }

  if (typeof migration.down !== 'function') {
    errors.push('Migration "down" must be a function.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Create a validated {@link Migration} object.
 *
 * @param {string} id - Unique human-readable identifier.
 * @param {number} version - Positive integer version number.
 * @param {string} description - Short description of the migration.
 * @param {(db: import('better-sqlite3').Database) => void} upFn - Forward migration function.
 * @param {(db: import('better-sqlite3').Database) => void} downFn - Reverse migration function.
 * @returns {Migration} The validated migration object.
 * @throws {Error} If the resulting migration object fails validation.
 */
export function createMigration(id, version, description, upFn, downFn) {
  const migration = { id, version, description, up: upFn, down: downFn };
  const { valid, errors } = validateMigration(migration);
  if (!valid) {
    throw new Error(`Invalid migration: ${errors.join(' ')}`);
  }
  return migration;
}

/**
 * MigrationRunner — manages registration, application, and rollback of migrations.
 */
class MigrationRunner {
  /**
   * @param {import('better-sqlite3').Database} db - A better-sqlite3 Database instance.
   * @param {MigrationRunnerConfig} [config] - Runner configuration.
   */
  constructor(db, config = {}) {
    if (!db || typeof db.exec !== 'function' || typeof db.prepare !== 'function' || typeof db.transaction !== 'function') {
      throw new Error('MigrationRunner requires a better-sqlite3 Database instance with exec/prepare/transaction methods.');
    }

    this._db = db;
    this._migrationsTable = config.migrationsTable ?? '_migrations';
    this._allowRollback = config.allowRollback ?? true;

    /** @type {Map<number, Migration>} */
    this._registry = new Map();

    this._ensureMigrationsTable();
  }

  /**
   * Create the migrations tracking table if it does not already exist.
   * @private
   */
  _ensureMigrationsTable() {
    const table = this._migrationsTable;
    // Table name is controlled by the host and is not user input; safe to interpolate.
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS ${table} (
        version     INTEGER PRIMARY KEY,
        id          TEXT NOT NULL,
        description TEXT NOT NULL,
        applied_at  TEXT NOT NULL
      );
    `);
  }

  /**
   * Read all applied migration records from the database, ordered by version ascending.
   *
   * @returns {AppliedMigrationRecord[]}
   * @private
   */
  _readApplied() {
    const rows = this._db.prepare(`SELECT version, id, description, applied_at FROM ${this._migrationsTable} ORDER BY version ASC`).all();
    return rows.map(r => ({
      version: r.version,
      id: r.id,
      description: r.description,
      applied_at: r.applied_at,
    }));
  }

  /**
   * Insert a migration record into the tracking table.
   *
   * @param {Migration} migration
   * @param {string} appliedAt - ISO timestamp.
   * @private
   */
  _insertRecord(migration, appliedAt) {
    this._db.prepare(
      `INSERT INTO ${this._migrationsTable} (version, id, description, applied_at) VALUES (?, ?, ?, ?)`
    ).run(migration.version, migration.id, migration.description, appliedAt);
  }

  /**
   * Delete a migration record from the tracking table.
   *
   * @param {number} version
   * @private
   */
  _deleteRecord(version) {
    this._db.prepare(`DELETE FROM ${this._migrationsTable} WHERE version = ?`).run(version);
  }

  /**
   * Register a single migration.
   *
   * @param {Migration} migration - The migration to register.
   * @returns {void}
   * @throws {Error} If the migration fails validation or a duplicate version is already registered.
   */
  registerMigration(migration) {
    const { valid, errors } = validateMigration(migration);
    if (!valid) {
      throw new Error(`Cannot register invalid migration: ${errors.join(' ')}`);
    }
    if (this._registry.has(migration.version)) {
      throw new Error(`Duplicate migration version ${migration.version} (id="${this._registry.get(migration.version).id}") is already registered.`);
    }
    this._registry.set(migration.version, migration);
  }

  /**
   * Register multiple migrations at once.
   *
   * @param {Migration[]} migrations - Migrations to register.
   * @returns {void}
   * @throws {Error} If any migration is invalid or a duplicate version is encountered.
   */
  registerMigrations(migrations) {
    if (!Array.isArray(migrations)) {
      throw new Error('registerMigrations expects an array of Migration objects.');
    }
    for (const m of migrations) {
      this.registerMigration(m);
    }
  }

  /**
   * Run all pending migrations in ascending version order.
   *
   * Each migration executes inside its own transaction. If a migration's `up`
   * function throws, that migration's transaction is rolled back and the error
   * propagates — no subsequent migrations are attempted and already-applied
   * migrations remain untouched.
   *
   * @returns {RunPendingResult} Summary of applied migrations.
   * @throws {Error} If a migration fails; the failing transaction is rolled back.
   */
  runPending() {
    const applied = this._readApplied();
    const appliedVersions = new Set(applied.map(r => r.version));

    const pending = [...this._registry.values()]
      .filter(m => !appliedVersions.has(m.version))
      .sort((a, b) => a.version - b.version);

    const appliedNow = [];
    for (const migration of pending) {
      const runOne = this._db.transaction(() => {
        migration.up(this._db);
        this._insertRecord(migration, new Date().toISOString());
      });
      try {
        runOne();
        appliedNow.push(migration.version);
      } catch (err) {
        // The transaction is automatically rolled back by better-sqlite3 on throw.
        const wrapped = new Error(
          `Migration ${migration.version} ("${migration.id}") failed during runPending: ${err.message}`
        );
        wrapped.cause = err;
        wrapped.appliedBeforeFailure = appliedNow;
        throw wrapped;
      }
    }

    return { applied: appliedNow.length, versions: appliedNow };
  }

  /**
   * Roll back a single applied migration by running its `down` function.
   *
   * The `down` function and the record deletion run inside a single transaction.
   *
   * @param {number} version - The version to roll back.
   * @returns {RollbackResult} Result indicating whether a rollback occurred.
   * @throws {Error} If rollbacks are disabled, the version is not applied, the
   *   migration is not registered, or the `down` function fails.
   */
  rollback(version) {
    if (!this._allowRollback) {
      throw new Error('Rollback is disabled (allowRollback=false).');
    }
    if (!Number.isInteger(version)) {
      throw new Error(`rollback(version) expects an integer, received: ${String(version)}`);
    }

    const applied = this._readApplied();
    const appliedRecord = applied.find(r => r.version === version);
    if (!appliedRecord) {
      return { rolledBack: false, version };
    }

    const migration = this._registry.get(version);
    if (!migration) {
      throw new Error(`Cannot roll back version ${version}: migration is not registered (no down function available).`);
    }

    const runDown = this._db.transaction(() => {
      migration.down(this._db);
      this._deleteRecord(version);
    });

    try {
      runDown();
    } catch (err) {
      const wrapped = new Error(
        `Rollback of migration ${version} ("${migration.id}") failed: ${err.message}`
      );
      wrapped.cause = err;
      throw wrapped;
    }

    return { rolledBack: true, version };
  }

  /**
   * Roll back all applied migrations whose version is strictly greater than
   * `targetVersion`, in reverse (descending) version order.
   *
   * Each rollback runs in its own transaction. If any rollback fails, execution
   * stops immediately and the error propagates — migrations already rolled back
   * remain rolled back.
   *
   * @param {number} targetVersion - The version to roll back to (inclusive — this version stays applied).
   * @returns {RollbackToResult} Summary of the rollback batch.
   * @throws {Error} If rollbacks are disabled or a rollback fails mid-batch.
   */
  rollbackTo(targetVersion) {
    if (!this._allowRollback) {
      throw new Error('Rollback is disabled (allowRollback=false).');
    }
    if (!Number.isInteger(targetVersion) || targetVersion < 0) {
      throw new Error(`rollbackTo(targetVersion) expects a non-negative integer, received: ${String(targetVersion)}`);
    }

    const applied = this._readApplied();
    const fromVersion = applied.length > 0 ? applied[applied.length - 1].version : 0;

    const toRollBack = applied
      .filter(r => r.version > targetVersion)
      .map(r => r.version)
      .sort((a, b) => b - a); // descending — roll back newest first

    const rolledBack = [];
    for (const version of toRollBack) {
      // rollback() throws on failure; let it propagate to halt the batch.
      this.rollback(version);
      rolledBack.push(version);
    }

    return { rolledBack, fromVersion, toVersion: targetVersion };
  }

  /**
   * Return a status snapshot of the migration system.
   *
   * @returns {MigrationStatus}
   */
  getStatus() {
    const applied = this._readApplied();
    const appliedVersions = new Set(applied.map(r => r.version));
    const currentVersion = applied.length > 0 ? applied[applied.length - 1].version : 0;
    const pendingCount = [...this._registry.keys()].filter(v => !appliedVersions.has(v)).length;
    return { currentVersion, pendingCount, appliedMigrations: applied };
  }

  /**
   * Return all applied migration records ordered by version ascending.
   *
   * @returns {AppliedMigrationRecord[]}
   */
  getAppliedMigrations() {
    return this._readApplied();
  }

  /**
   * Return all registered migrations that have not yet been applied,
   * ordered by version ascending.
   *
   * @returns {Migration[]}
   */
  getPendingMigrations() {
    const appliedVersions = new Set(this._readApplied().map(r => r.version));
    return [...this._registry.values()]
      .filter(m => !appliedVersions.has(m.version))
      .sort((a, b) => a.version - b.version);
  }
}

/**
 * Create a {@link MigrationRunner} instance bound to the given database.
 *
 * @param {import('better-sqlite3').Database} db - A better-sqlite3 Database instance.
 * @param {MigrationRunnerConfig} [config] - Optional configuration.
 * @returns {MigrationRunner} A new migration runner.
 */
export function createMigrationRunner(db, config) {
  return new MigrationRunner(db, config);
}

export { MigrationRunner };
