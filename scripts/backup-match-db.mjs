#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// backup-match-db.mjs — Automated SQLite backup for the match server
//
// Creates a point-in-time consistent backup of the match database using
// SQLite's VACUUM INTO command. This works safely on a live WAL-mode
// database without blocking writes.
//
// Usage:
//   node scripts/backup-match-db.mjs [options]
//
// Options (via CLI flags or environment variables):
//   --db-path <path>       Source database path (default: runtime/match-server/matches.sqlite)
//   --backup-dir <path>    Backup output directory (default: runtime/match-server/backups)
//   --retention <n>        Number of daily backups to retain (default: 7)
//   --offsite-cmd <cmd>    Shell command to copy backup offsite (e.g. rclone, aws s3 cp)
//                          The backup file path is appended to the command.
//   --compress             Gzip the backup file
//
// Environment variables (used by systemd timer):
//   INTRILEX_DB_PATH        Same as --db-path
//   INTRILEX_BACKUP_DIR     Same as --backup-dir
//   INTRILEX_BACKUP_RETENTION  Same as --retention
//   INTRILEX_OFFSITE_CMD    Same as --offsite-cmd
//   INTRILEX_BACKUP_COMPRESS  Same as --compress (set to "1" to enable)
//
// Exit codes:
//   0 — success
//   1 — backup failed (source DB missing, VACUUM INTO error, etc.)
//   2 — offsite copy failed (backup succeeded but offsite copy failed)
//
// Recommended cron schedule (daily at 3 AM):
//   0 3 * * * /usr/bin/node /opt/intrilex/scripts/backup-match-db.mjs
//
// Or via systemd timer (see deploy/intrilex-match-backup.timer):
//   sudo cp deploy/intrilex-match-backup.service /etc/systemd/system/
//   sudo cp deploy/intrilex-match-backup.timer /etc/systemd/system/
//   sudo systemctl enable --now intrilex-match-backup.timer
// ═══════════════════════════════════════════════════════════════

import { createRequire } from 'node:module';
import { mkdirSync, existsSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createGzip } from 'node:zlib';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

const require = createRequire(import.meta.url);

// ── Parse CLI args and environment ──

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    dbPath: process.env.INTRILEX_DB_PATH ?? 'runtime/match-server/matches.sqlite',
    backupDir: process.env.INTRILEX_BACKUP_DIR ?? 'runtime/match-server/backups',
    retention: parseInt(process.env.INTRILEX_BACKUP_RETENTION ?? '7', 10),
    offsiteCmd: process.env.INTRILEX_OFFSITE_CMD ?? null,
    compress: process.env.INTRILEX_BACKUP_COMPRESS === '1' || false,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--db-path': opts.dbPath = args[++i]; break;
      case '--backup-dir': opts.backupDir = args[++i]; break;
      case '--retention': opts.retention = parseInt(args[++i], 10); break;
      case '--offsite-cmd': opts.offsiteCmd = args[++i]; break;
      case '--compress': opts.compress = true; break;
      case '--help':
        console.log('Usage: node scripts/backup-match-db.mjs [--db-path <path>] [--backup-dir <path>] [--retention <n>] [--offsite-cmd <cmd>] [--compress]');
        process.exit(0);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dbBasename = basename(opts.dbPath, extname(opts.dbPath));
  // Add a short random suffix to avoid collisions when multiple backups
  // run in the same second (VACUUM INTO fails if the output file exists)
  const suffix = Math.random().toString(36).slice(2, 6);

  // ── Validate source database exists ──
  if (!existsSync(opts.dbPath)) {
    console.error(`[backup] ERROR: Source database not found: ${opts.dbPath}`);
    process.exit(1);
  }

  // ── Ensure backup directory exists ──
  try {
    mkdirSync(opts.backupDir, { recursive: true });
  } catch (err) {
    console.error(`[backup] ERROR: Cannot create backup directory ${opts.backupDir}: ${err.message}`);
    process.exit(1);
  }

  // ── Create backup via VACUUM INTO ──
  // VACUUM INTO creates a consistent snapshot of the database into a new file.
  // It works on a live WAL-mode database without blocking writes.
  const backupName = `${dbBasename}-${timestamp}-${suffix}.sqlite`;
  const backupPath = join(opts.backupDir, backupName);

  console.log(`[backup] Starting backup of ${opts.dbPath} → ${backupPath}`);

  let db;
  try {
    const { DatabaseSync } = require('node:sqlite');
    // Open the source database read-only to avoid interfering with the live server
    db = new DatabaseSync(opts.dbPath, { readOnly: true });
    // VACUUM INTO creates a new database file with a consistent snapshot
    db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
    db.close();
    db = null;
  } catch (err) {
    if (db) try { db.close(); } catch {}
    console.error(`[backup] ERROR: VACUUM INTO failed: ${err.message}`);
    process.exit(1);
  }

  const stats = statSync(backupPath);
  console.log(`[backup] Backup created: ${backupPath} (${(stats.size / 1024).toFixed(1)} KB)`);

  // ── Compress if requested ──
  let finalPath = backupPath;
  if (opts.compress) {
    const gzPath = backupPath + '.gz';
    console.log(`[backup] Compressing → ${gzPath}`);
    try {
      await pipeline(
        createReadStream(backupPath),
        createGzip(),
        createWriteStream(gzPath),
      );
      unlinkSync(backupPath);
      finalPath = gzPath;
      const gzStats = statSync(gzPath);
      console.log(`[backup] Compressed: ${gzPath} (${(gzStats.size / 1024).toFixed(1)} KB)`);
    } catch (err) {
      console.error(`[backup] WARNING: Compression failed: ${err.message} — keeping uncompressed backup`);
    }
  }

  // ── Offsite copy ──
  if (opts.offsiteCmd) {
    console.log(`[backup] Copying offsite: ${opts.offsiteCmd} ${finalPath}`);
    try {
      const result = spawnSync(opts.offsiteCmd + ' ' + JSON.stringify(finalPath), {
        shell: true,
        stdio: 'inherit',
        timeout: 300000, // 5 min timeout for offsite copy
      });
      if (result.status !== 0) {
        console.error(`[backup] ERROR: Offsite copy failed with exit code ${result.status}`);
        // Don't delete the local backup — it's still valid
        process.exit(2);
      }
      console.log(`[backup] Offsite copy complete`);
    } catch (err) {
      console.error(`[backup] ERROR: Offsite copy failed: ${err.message}`);
      process.exit(2);
    }
  }

  // ── Retention: prune old backups ──
  try {
    const files = readdirSync(opts.backupDir)
      .filter(f => f.startsWith(`${dbBasename}-`) && (f.endsWith('.sqlite') || f.endsWith('.sqlite.gz')))
      .map(f => ({ name: f, path: join(opts.backupDir, f), mtime: statSync(join(opts.backupDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime); // newest first

    if (files.length > opts.retention) {
      const toDelete = files.slice(opts.retention);
      for (const f of toDelete) {
        unlinkSync(f.path);
        console.log(`[backup] Pruned old backup: ${f.name}`);
      }
    }
  } catch (err) {
    console.error(`[backup] WARNING: Retention prune failed: ${err.message}`);
  }

  console.log(`[backup] Done.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`[backup] FATAL: ${err.message}`);
  process.exit(1);
});
