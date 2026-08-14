#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// run-migrations.mjs — T6: Automated Supabase migration runner
//
// Applies all SQL migrations in supabase/migrations/ in order to a
// target Supabase instance. Uses the Supabase management API or
// direct psql connection, depending on configuration.
//
// Usage:
//   node scripts/run-migrations.mjs [--dry-run] [--supabase-url=URL] [--service-key=KEY]
//
// In dry-run mode, lists the migrations that would be applied without
// executing them. In live mode, applies each migration in order and
// tracks applied migrations in a _migrations table.
// ═══════════════════════════════════════════════════════════════

import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const MIGRATIONS_TABLE = '_migrations';

/**
 * Parse command-line arguments.
 * @returns {{ dryRun: boolean, supabaseUrl: string|null, serviceKey: string|null }}
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dryRun: false, supabaseUrl: null, serviceKey: null };
  for (const arg of args) {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg.startsWith('--supabase-url=')) opts.supabaseUrl = arg.slice(15);
    else if (arg.startsWith('--service-key=')) opts.serviceKey = arg.slice(13);
  }
  // Fall back to env vars
  opts.supabaseUrl = opts.supabaseUrl ?? process.env.SUPABASE_URL ?? null;
  opts.serviceKey = opts.serviceKey ?? process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? null;
  return opts;
}

/**
 * List all migration files in order.
 * @returns {Array<{ name: string, path: string, content: string }>}
 */
export function listMigrations() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort(); // Lexical sort ensures 0001_ before 0002_ etc.
  return files.map(f => ({
    name: f,
    path: join(MIGRATIONS_DIR, f),
    content: readFileSync(join(MIGRATIONS_DIR, f), 'utf8'),
  }));
}

/**
 * Ensure the _migrations tracking table exists.
 * @param {object} supabase - Supabase client
 */
async function ensureMigrationsTable(supabase) {
  const sql = `CREATE TABLE IF NOT EXISTS public.${MIGRATIONS_TABLE} (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE public.${MIGRATIONS_TABLE} ENABLE ROW LEVEL SECURITY;
  -- Service role bypasses RLS`;
  const { error } = await supabase.rpc('exec_sql', { sql_text: sql }).maybeSingle();
  if (error) {
    // exec_sql RPC may not be deployed. The _migrations table must be created
    // manually (or via the Supabase dashboard) before running migrations.
    console.warn(`Warning: could not create _migrations table via RPC: ${error.message}`);
    console.warn('The table may need to be created manually before running migrations.');
  }
}

/**
 * Get the list of already-applied migrations.
 * @param {object} supabase - Supabase client
 * @returns {Set<string>}
 */
async function getAppliedMigrations(supabase) {
  const { data, error } = await supabase
    .from(MIGRATIONS_TABLE)
    .select('name');
  if (error) return new Set();
  return new Set((data ?? []).map(r => r.name));
}

/**
 * Apply a single migration.
 * @param {object} supabase - Supabase client
 * @param {{ name: string, content: string }} migration
 * @returns {{ success: boolean, error?: string }}
 */
async function applyMigration(supabase, migration) {
  const { error } = await supabase.rpc('exec_sql', { sql_text: migration.content });
  if (error) {
    return { success: false, error: error.message };
  }
  // Record the migration
  await supabase
    .from(MIGRATIONS_TABLE)
    .insert({ name: migration.name });
  return { success: true };
}

/**
 * Main entry point.
 */
async function main() {
  const opts = parseArgs();
  const migrations = listMigrations();

  console.log(`Found ${migrations.length} migration files in ${MIGRATIONS_DIR}`);

  if (opts.dryRun) {
    console.log('\n[Dry Run] Migrations that would be applied:');
    for (const m of migrations) {
      console.log(`  ${m.name} (${m.content.length} bytes)`);
    }
    return;
  }

  if (!opts.supabaseUrl || !opts.serviceKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SECRET_KEY are required for live migration.');
    console.error('Set them via environment variables or --supabase-url=URL --service-key=KEY');
    process.exit(1);
  }

  const supabase = createClient(opts.supabaseUrl, opts.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await ensureMigrationsTable(supabase);
  const applied = await getAppliedMigrations(supabase);

  let appliedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const migration of migrations) {
    if (applied.has(migration.name)) {
      console.log(`  SKIP  ${migration.name} (already applied)`);
      skippedCount++;
      continue;
    }

    console.log(`  APPLY ${migration.name}...`);
    const result = await applyMigration(supabase, migration);
    if (result.success) {
      console.log(`  OK    ${migration.name}`);
      appliedCount++;
    } else {
      console.error(`  FAIL  ${migration.name}: ${result.error}`);
      failedCount++;
      // Stop on first failure to preserve migration order
      break;
    }
  }

  console.log(`\nMigration summary: ${appliedCount} applied, ${skippedCount} skipped, ${failedCount} failed`);
  process.exit(failedCount > 0 ? 1 : 0);
}

// Run if invoked directly
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch(err => {
    console.error('Migration runner error:', err);
    process.exit(1);
  });
}

export { main as runMigrations };
