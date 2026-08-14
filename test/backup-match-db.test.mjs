// ═══════════════════════════════════════════════════════════════
// backup-match-db.test.mjs — Tests for the SQLite backup script
//
// Proves:
//   - VACUUM INTO creates a valid backup from a live database
//   - The backup is readable and contains the same data
//   - Retention pruning removes old backups
//   - Compression produces a .gz file
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function createTestDb(path) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE matches (match_id TEXT PRIMARY KEY, snapshot TEXT, created_at INTEGER, updated_at INTEGER, status TEXT);
    INSERT INTO matches VALUES ('M-test1', '{"foo":1}', 1000, 1000, 'RUNNING');
    INSERT INTO matches VALUES ('M-test2', '{"bar":2}', 2000, 2000, 'TERMINAL');
  `);
  db.close();
}

test('backup: VACUUM INTO creates a valid backup', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'intrilex-backup-'));
  try {
    const dbPath = join(tmpDir, 'matches.sqlite');
    const backupDir = join(tmpDir, 'backups');
    createTestDb(dbPath);

    const result = spawnSync(process.execPath, [
      'scripts/backup-match-db.mjs',
      '--db-path', dbPath,
      '--backup-dir', backupDir,
      '--retention', '3',
    ], {
      cwd: process.cwd(),
      stdio: 'pipe',
      timeout: 30000,
    });

    assert.equal(result.status, 0, `Backup script should exit 0, got ${result.status}. stderr: ${result.stderr?.toString()}`);

    const backups = readdirSync(backupDir).filter(f => f.endsWith('.sqlite'));
    assert.equal(backups.length, 1, 'Should create exactly one backup file');

    // Verify the backup is readable and contains the same data
    const { DatabaseSync } = require('node:sqlite');
    const backupDb = new DatabaseSync(join(backupDir, backups[0]), { readOnly: true });
    const rows = backupDb.prepare('SELECT match_id, status FROM matches ORDER BY match_id').all();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].match_id, 'M-test1');
    assert.equal(rows[0].status, 'RUNNING');
    assert.equal(rows[1].match_id, 'M-test2');
    assert.equal(rows[1].status, 'TERMINAL');
    backupDb.close();
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('backup: retention prunes old backups', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'intrilex-backup-ret-'));
  try {
    const dbPath = join(tmpDir, 'matches.sqlite');
    const backupDir = join(tmpDir, 'backups');
    createTestDb(dbPath);

    // Run backup 5 times with retention=2
    for (let i = 0; i < 5; i++) {
      const result = spawnSync(process.execPath, [
        'scripts/backup-match-db.mjs',
        '--db-path', dbPath,
        '--backup-dir', backupDir,
        '--retention', '2',
      ], {
        cwd: process.cwd(),
        stdio: 'pipe',
        timeout: 30000,
      });
      assert.equal(result.status, 0, `Backup ${i} should succeed. stderr: ${result.stderr?.toString()}`);
      // Small delay so timestamps differ
      spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},200)'], { stdio: 'pipe' });
    }

    const backups = readdirSync(backupDir).filter(f => f.endsWith('.sqlite'));
    assert.equal(backups.length, 2, `Should retain only 2 backups, found ${backups.length}`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('backup: compression produces .gz file', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'intrilex-backup-gz-'));
  try {
    const dbPath = join(tmpDir, 'matches.sqlite');
    const backupDir = join(tmpDir, 'backups');
    createTestDb(dbPath);

    const result = spawnSync(process.execPath, [
      'scripts/backup-match-db.mjs',
      '--db-path', dbPath,
      '--backup-dir', backupDir,
      '--compress',
    ], {
      cwd: process.cwd(),
      stdio: 'pipe',
      timeout: 30000,
    });

    assert.equal(result.status, 0, `Backup with --compress should exit 0. stderr: ${result.stderr?.toString()}`);

    const files = readdirSync(backupDir);
    const gzFiles = files.filter(f => f.endsWith('.sqlite.gz'));
    const rawFiles = files.filter(f => f.endsWith('.sqlite') && !f.endsWith('.gz'));
    assert.equal(gzFiles.length, 1, 'Should create one .gz backup');
    assert.equal(rawFiles.length, 0, 'Should not leave uncompressed file');

    const gzPath = join(backupDir, gzFiles[0]);
    const gzSize = statSync(gzPath).size;
    assert.ok(gzSize > 0, 'Compressed file should not be empty');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('backup: fails gracefully when source DB does not exist', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'intrilex-backup-missing-'));
  try {
    const result = spawnSync(process.execPath, [
      'scripts/backup-match-db.mjs',
      '--db-path', join(tmpDir, 'nonexistent.sqlite'),
      '--backup-dir', join(tmpDir, 'backups'),
    ], {
      cwd: process.cwd(),
      stdio: 'pipe',
      timeout: 10000,
    });

    assert.equal(result.status, 1, 'Should exit 1 when source DB is missing');
    const stderr = result.stderr?.toString() ?? '';
    assert.ok(stderr.includes('not found'), 'Should report missing DB');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
