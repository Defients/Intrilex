// ═══════════════════════════════════════════════════════════════
// terminal-outbox.mjs — Durable terminal lifecycle outbox (DATA-01)
//
// Implements a durable outbox for terminal match effects:
//   - match result persistence (rating, history, stats)
//   - achievement unlock persistence
//
// Properties:
//   1. Persist the terminal job BEFORE telling clients the match is durably terminal
//   2. Retry transient failures with bounded backoff
//   3. Recover pending/in-progress jobs on restart
//   4. Stable idempotency keys: matchId for result, matchId+accountId+achievementId for unlocks
//   5. Track partial completion — result success + achievement failure → retryable without re-rating
//   6. Bound shutdown drain time, persist unfinished work, then close cleanly
//   7. At-least-once delivery → exactly-once effects (via persistor idempotency gates)
//
// Storage:
//   - Durable mode: SQLite (node:sqlite) — survives restart
//   - Dev mode: in-memory Map — no persistence across restart
// ═══════════════════════════════════════════════════════════════

import { DatabaseSync } from 'node:sqlite';

/**
 * @typedef {Object} TerminalJob
 * @property {string} jobId - Stable idempotency key (matchId for result, matchId:ach:accountId for achievements)
 * @property {string} matchId
 * @property {'result'|'achievements'} jobType
 * @property {string} status - 'pending'|'in_progress'|'completed'|'failed'
 * @property {object} payload - The record to persist
 * @property {number} attempts - Number of delivery attempts
 * @property {number} maxAttempts - Maximum retry attempts
 * @property {number} nextRetryAt - Unix timestamp (ms) for next retry (0 = immediate)
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {string|null} lastError - Last error message (sanitized)
 */

const DEFAULT_MAX_ATTEMPTS = 10;
const BASE_BACKOFF_MS = 1000; // 1s initial backoff
const MAX_BACKOFF_MS = 60000; // 1 min max backoff
const SHUTDOWN_DRAIN_MS = 5000; // 5s shutdown drain budget

/**
 * In-memory outbox storage (dev/test mode).
 */
class InMemoryOutboxStorage {
  constructor() {
    /** @type {Map<string, TerminalJob>} */
    this._jobs = new Map();
  }

  put(job) {
    this._jobs.set(job.jobId, { ...job });
  }

  get(jobId) {
    return this._jobs.get(jobId) ?? null;
  }

  update(jobId, updates) {
    const job = this._jobs.get(jobId);
    if (job) {
      this._jobs.set(jobId, { ...job, ...updates, updatedAt: Date.now() });
    }
  }

  listPending() {
    const now = Date.now();
    return [...this._jobs.values()].filter(
      j => (j.status === 'pending' || j.status === 'failed') && j.nextRetryAt <= now
    );
  }

  listAll() {
    return [...this._jobs.values()];
  }

  close() { /* no-op */ }
}

/**
 * SQLite outbox storage (durable mode — survives restart).
 */
class SqliteOutboxStorage {
  /**
   * @param {object} opts
   * @param {string} opts.path - SQLite database path
   */
  constructor({ path }) {
    this._db = new DatabaseSync(path);
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS terminal_outbox (
        jobId TEXT PRIMARY KEY,
        matchId TEXT NOT NULL,
        jobType TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        payload TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        maxAttempts INTEGER NOT NULL DEFAULT ${DEFAULT_MAX_ATTEMPTS},
        nextRetryAt INTEGER NOT NULL DEFAULT 0,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        lastError TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_outbox_status_retry ON terminal_outbox(status, nextRetryAt);
    `);
  }

  put(job) {
    this._db.prepare(
      `INSERT OR REPLACE INTO terminal_outbox (jobId, matchId, jobType, status, payload, attempts, maxAttempts, nextRetryAt, createdAt, updatedAt, lastError)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      job.jobId, job.matchId, job.jobType, job.status,
      JSON.stringify(job.payload), job.attempts, job.maxAttempts, job.nextRetryAt,
      job.createdAt, job.updatedAt, job.lastError ?? null
    );
  }

  get(jobId) {
    const row = this._db.prepare('SELECT * FROM terminal_outbox WHERE jobId = ?').get(jobId);
    if (!row) return null;
    return { ...row, payload: JSON.parse(row.payload) };
  }

  update(jobId, updates) {
    const job = this.get(jobId);
    if (!job) return;
    const merged = { ...job, ...updates, updatedAt: Date.now() };
    this._db.prepare(
      `UPDATE terminal_outbox SET status = ?, attempts = ?, nextRetryAt = ?, updatedAt = ?, lastError = ? WHERE jobId = ?`
    ).run(merged.status, merged.attempts, merged.nextRetryAt, merged.updatedAt, merged.lastError ?? null, jobId);
  }

  listPending() {
    const now = Date.now();
    const rows = this._db.prepare(
      `SELECT * FROM terminal_outbox WHERE (status = 'pending' OR status = 'failed') AND nextRetryAt <= ?`
    ).all(now);
    return rows.map(r => ({ ...r, payload: JSON.parse(r.payload) }));
  }

  listAll() {
    const rows = this._db.prepare('SELECT * FROM terminal_outbox').all();
    return rows.map(r => ({ ...r, payload: JSON.parse(r.payload) }));
  }

  close() {
    try { this._db.close(); } catch { /* ignore */ }
  }
}

/**
 * Durable terminal outbox — manages terminal effect persistence with
 * retry, idempotency, and restart recovery.
 */
export class TerminalOutbox {
  /**
   * @param {object} opts
   * @param {boolean} [opts.durable=true] - Use SQLite (true) or in-memory (false)
   * @param {string} [opts.path] - SQLite database path (required if durable)
   * @param {import('./match-result-persistor.mjs').MatchResultPersistor} opts.persistor - Result persistor
   * @param {import('../ranked/rating-service.mjs').RatingService} [opts.ratingService] - Rating service for ranked matches
   * @param {object} [opts.logger] - Logger with debug(event, data)
   */
  constructor({ durable = true, path, persistor, ratingService, logger = console }) {
    this._storage = durable
      ? new SqliteOutboxStorage({ path: path ?? 'runtime/match-server/terminal-outbox.sqlite' })
      : new InMemoryOutboxStorage();
    this._persistor = persistor;
    this._ratingService = ratingService;
    this._logger = logger;
    this._drainTimer = null;
    this._shuttingDown = false;
  }

  /**
   * Enqueue a match result persistence job.
   * Idempotency key: matchId (the persistor's isMatchPersisted gate ensures exactly-once).
   * @param {object} record - MatchResultRecord
   */
  enqueueResult(record) {
    const jobId = `result:${record.matchId}`;
    const existing = this._storage.get(jobId);
    if (existing && (existing.status === 'completed' || existing.status === 'in_progress')) {
      return; // Already done or being processed
    }
    /** @type {TerminalJob} */
    const job = {
      jobId,
      matchId: record.matchId,
      jobType: 'result',
      status: 'pending',
      payload: record,
      attempts: 0,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      nextRetryAt: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastError: null,
    };
    this._storage.put(job);
    this._log('outboxEnqueued', { jobId, matchId: record.matchId, jobType: 'result' });
  }

  /**
   * Enqueue an achievement unlock persistence job.
   * Idempotency key: matchId:ach:accountId (per-account per-match).
   * @param {Array} unlocks - Achievement unlock records
   * @param {string} matchId
   */
  enqueueAchievements(unlocks, matchId) {
    if (!unlocks || unlocks.length === 0) return;
    // Group by accountId for per-account idempotency
    const byAccount = new Map();
    for (const u of unlocks) {
      const key = `${u.accountId}`;
      if (!byAccount.has(key)) byAccount.set(key, []);
      byAccount.get(key).push(u);
    }
    for (const [accountId, accountUnlocks] of byAccount) {
      const jobId = `ach:${matchId}:${accountId}`;
      const existing = this._storage.get(jobId);
      if (existing && (existing.status === 'completed' || existing.status === 'in_progress')) {
        continue; // Already done or being processed
      }
      const job = {
        jobId,
        matchId,
        jobType: 'achievements',
        status: 'pending',
        payload: accountUnlocks,
        attempts: 0,
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
        nextRetryAt: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastError: null,
      };
      this._storage.put(job);
      this._log('outboxEnqueued', { jobId, matchId, jobType: 'achievements', count: accountUnlocks.length });
    }
  }

  /**
   * Start the drain loop — processes pending jobs with bounded backoff.
   * @param {number} [intervalMs=2000] - Drain check interval
   */
  startDrain(intervalMs = 2000) {
    if (this._drainTimer) return;
    this._drainTimer = setInterval(() => this._drainOnce(), intervalMs);
    // Don't keep the process alive solely for the drain timer
    if (this._drainTimer.unref) this._drainTimer.unref();
  }

  /**
   * Stop the drain loop.
   */
  stopDrain() {
    if (this._drainTimer) {
      clearInterval(this._drainTimer);
      this._drainTimer = null;
    }
  }

  /**
   * Process one batch of pending jobs.
   * @returns {Promise<number>} Number of jobs processed
   */
  async _drainOnce() {
    const pending = this._storage.listPending();
    let processed = 0;
    for (const job of pending) {
      if (this._shuttingDown) break;
      await this._processJob(job);
      processed++;
    }
    return processed;
  }

  /**
   * Process a single job with retry logic.
   * @param {TerminalJob} job
   */
  async _processJob(job) {
    // Mark in_progress
    this._storage.update(job.jobId, { status: 'in_progress', attempts: job.attempts + 1 });

    try {
      if (job.jobType === 'result') {
        await this._processResultJob(job);
      } else if (job.jobType === 'achievements') {
        await this._processAchievementsJob(job);
      }
      // Success — mark completed
      this._storage.update(job.jobId, { status: 'completed', lastError: null });
      this._log('outboxJobCompleted', { jobId: job.jobId, matchId: job.matchId, jobType: job.jobType, attempts: job.attempts });
    } catch (err) {
      const errorMsg = err?.message ?? String(err);
      const attempts = job.attempts + 1;
      if (attempts >= job.maxAttempts) {
        // Exhausted retries — mark failed permanently
        this._storage.update(job.jobId, { status: 'failed', lastError: errorMsg });
        this._log('outboxJobExhausted', { jobId: job.jobId, matchId: job.matchId, jobType: job.jobType, attempts, error: errorMsg });
      } else {
        // Schedule retry with exponential backoff
        const backoff = Math.min(BASE_BACKOFF_MS * Math.pow(2, attempts - 1), MAX_BACKOFF_MS);
        this._storage.update(job.jobId, { status: 'pending', nextRetryAt: Date.now() + backoff, lastError: errorMsg });
        this._log('outboxJobRetry', { jobId: job.jobId, matchId: job.matchId, jobType: job.jobType, attempts, nextRetryIn: backoff, error: errorMsg });
      }
    }
  }

  /**
   * Process a result job — persist match result and apply rating if ranked.
   * The persistor's isMatchPersisted gate ensures exactly-once application.
   * @param {TerminalJob} job
   */
  async _processResultJob(job) {
    const record = job.payload;
    // RANK-01/3C: Use RatingService for ranked matches, direct persistor for others.
    // RatingService.isRateable() fails closed for ineligible ranked records.
    if (record.queueId === 'ranked' && this._ratingService) {
      const result = await this._ratingService.applyRatedResult(record);
      if (!result.success) {
        throw new Error(`RatingService apply failed: ${result.error ?? 'unknown'}`);
      }
    } else {
      // Non-ranked: persist for history only (no rating mutation)
      const result = await this._persistor.persistMatchResult(record);
      if (!result.success) {
        throw new Error(`Persist failed: ${result.error ?? 'unknown'}`);
      }
    }
  }

  /**
   * Process an achievements job — persist achievement unlocks.
   * The persistor's idempotency (Set of accountId:achievementId) ensures exactly-once.
   * @param {TerminalJob} job
   */
  async _processAchievementsJob(job) {
    const unlocks = job.payload;
    const result = await this._persistor.persistAchievementUnlocks(unlocks);
    if (!result.success) {
      throw new Error(`Achievement persist failed: ${result.error ?? 'unknown'}`);
    }
  }

  /**
   * Recover pending jobs on restart — called once at startup.
   * Resets any 'in_progress' jobs to 'pending' (they may have been interrupted).
   * @returns {number} Number of jobs recovered
   */
  recoverPending() {
    const all = this._storage.listAll();
    let recovered = 0;
    for (const job of all) {
      if (job.status === 'in_progress') {
        // Interrupted — reset to pending for retry
        this._storage.update(job.jobId, { status: 'pending', nextRetryAt: 0 });
        recovered++;
      }
    }
    if (recovered > 0) {
      this._log('outboxRecovered', { recovered });
    }
    return recovered;
  }

  /**
   * Graceful shutdown — drain pending jobs with a bounded time budget.
   * @param {number} [timeoutMs=5000] - Maximum drain time
   * @returns {Promise<number>} Number of jobs remaining (unprocessed)
   */
  async shutdown(timeoutMs = SHUTDOWN_DRAIN_MS) {
    this._shuttingDown = true;
    this.stopDrain();
    const deadline = Date.now() + timeoutMs;
    let remaining = 0;
    // Drain as many jobs as possible within the time budget
    while (Date.now() < deadline) {
      const pending = this._storage.listPending();
      if (pending.length === 0) break;
      for (const job of pending) {
        if (Date.now() >= deadline) break;
        await this._processJob(job);
      }
    }
    remaining = this._storage.listPending().length;
    if (remaining > 0) {
      this._log('outboxShutdownWithPending', { remaining });
    }
    this._storage.close();
    return remaining;
  }

  /**
   * Get all jobs (for inspection/testing).
   * @returns {TerminalJob[]}
   */
  listJobs() {
    return this._storage.listAll();
  }

  /** @param {string} event @param {object} data */
  _log(event, data) {
    if (this._logger && typeof this._logger.debug === 'function') {
      this._logger.debug({ event, ...data });
    }
  }
}
