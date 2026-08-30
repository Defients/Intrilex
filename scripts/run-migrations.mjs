#!/usr/bin/env node
// Safe Supabase migration runner. Database changes are delegated to the
// official CLI; this repository never exposes an arbitrary-SQL RPC.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const MIGRATION_NAME = /^\d+_[a-z0-9_]+\.sql$/;

export function listMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter(name => MIGRATION_NAME.test(name))
    .sort()
    .map(name => ({
      name,
      path: join(MIGRATIONS_DIR, name),
      content: readFileSync(join(MIGRATIONS_DIR, name), 'utf8'),
    }));
}

function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Set(argv);
  const unknown = argv.filter(arg => !['--dry-run', '--local', '--linked'].includes(arg));
  if (unknown.length > 0) throw new Error(`Unknown option: ${unknown[0]}`);
  if (flags.has('--local') && flags.has('--linked')) throw new Error('Choose either --local or --linked, not both.');
  return {
    dryRun: flags.has('--dry-run'),
    target: flags.has('--linked') ? 'linked' : 'local',
  };
}

export function runMigrations(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const migrations = listMigrations();

  if (options.dryRun) {
    console.log(`Validated ${migrations.length} ordered migration files:`);
    for (const migration of migrations) console.log(`  ${migration.name}`);
    console.log(`Target: ${options.target}. No database changes were made.`);
    return 0;
  }

  const result = spawnSync('supabase', ['db', 'push', `--${options.target}`, '--yes'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exitCode = runMigrations();
  } catch (err) {
    console.error(`Migration runner failed: ${err?.message ?? String(err)}`);
    process.exitCode = 1;
  }
}
