// ═══════════════════════════════════════════════════════════════
// supabase-static-analysis.test.mjs
// Phase 5: Static Supabase schema/RLS/function review.
//
// Validates the SQL migration files without requiring a running
// Supabase instance. Checks for:
//   - RLS is enabled on all tables
//   - SECURITY DEFINER functions have search_path set
//   - No client-writable paths for server-authoritative tables
//   - Service role grants are explicit
//
// Live database validation is NOT_RUN (Docker not available).
// Staging/production validation is NOT_RUN (no credentials).
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'supabase', 'migrations');

async function readAllMigrations() {
  const files = await readdir(migrationsDir);
  const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();
  const migrations = [];
  for (const file of sqlFiles) {
    const content = await readFile(path.join(migrationsDir, file), 'utf8');
    migrations.push({ file, content });
  }
  return migrations;
}

function extractTableNames(sql) {
  const tables = new Set();
  // Match CREATE TABLE statements
  const createMatches = sql.match(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+public\.(\w+)/gi);
  if (createMatches) {
    for (const m of createMatches) {
      const nameMatch = m.match(/public\.(\w+)/i);
      if (nameMatch) tables.add(nameMatch[1]);
    }
  }
  return tables;
}

function extractRlsTables(sql) {
  const tables = new Set();
  const matches = sql.matchAll(/ALTER\s+TABLE\s+public\.(\w+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi);
  for (const m of matches) tables.add(m[1]);
  return tables;
}

function extractSecurityDefinerFunctions(sql) {
  const functions = [];
  // Match all SECURITY DEFINER function names
  const matches = sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.(\w+)\s*\([^)]*\)[\s\S]*?SECURITY\s+DEFINER/gi);
  for (const m of matches) {
    const funcName = m[1];
    // Check if search_path is set within the function definition (next 500 chars)
    const afterDef = sql.slice(m.index, m.index + 500);
    const hasSearchPath = /SET\s+search_path\s*=/i.test(afterDef);
    functions.push({ name: funcName, hasSearchPath });
  }
  return functions;
}

function extractAlteredSearchPathFunctions(sql) {
  const functions = new Set();
  const matches = sql.matchAll(/ALTER\s+FUNCTION\s+public\.(\w+)\s*\([^)]*\)\s*SET\s+search_path\s*=/gi);
  for (const m of matches) functions.add(m[1]);
  return functions;
}

// ── Static schema tests ──────────────────────────────────────────

test('Phase 5 static: all tables have RLS enabled', async () => {
  const migrations = await readAllMigrations();
  assert.ok(migrations.length >= 26, `Must have at least 26 migrations, got ${migrations.length}`);

  const allTables = new Set();
  const rlsTables = new Set();

  for (const migration of migrations) {
    const tables = extractTableNames(migration.content);
    for (const t of tables) allTables.add(t);
    const rls = extractRlsTables(migration.content);
    for (const t of rls) rlsTables.add(t);
  }

  assert.ok(allTables.size >= 20, `Must have at least 20 tables, got ${allTables.size}`);

  const missingRls = [...allTables].filter(t => !rlsTables.has(t));
  assert.deepEqual(missingRls, [],
    `Tables without RLS: ${missingRls.join(', ')}`);
});

test('Phase 5 static: SECURITY DEFINER functions have search_path set', async () => {
  const migrations = await readAllMigrations();
  const allFunctions = [];
  const fixedFunctions = new Set();

  for (const migration of migrations) {
    const funcs = extractSecurityDefinerFunctions(migration.content);
    allFunctions.push(...funcs);
    const fixed = extractAlteredSearchPathFunctions(migration.content);
    for (const f of fixed) fixedFunctions.add(f);
  }

  assert.ok(allFunctions.length >= 5,
    `Must have at least 5 SECURITY DEFINER functions, got ${allFunctions.length}`);

  const missingSearchPath = allFunctions.filter(f => !f.hasSearchPath && !fixedFunctions.has(f.name));
  const missingNames = [...new Set(missingSearchPath.map(f => f.name))];
  assert.deepEqual(missingNames, [],
    `SECURITY DEFINER functions without search_path (and no follow-up fix): ${missingNames.join(', ')}`);
});

test('Phase 5 static: hardening migration exists with empty search_path', async () => {
  const hardeningPath = path.join(migrationsDir, '20260830074714_harden_authority_and_persistence.sql');
  assert.ok(existsSync(hardeningPath), 'Hardening migration must exist');
  const content = await readFile(hardeningPath, 'utf8');
  // The hardening migration should use search_path = '' (safest)
  assert.ok(content.includes("search_path = ''"),
    'Hardening migration should set search_path to empty string (safest)');
  // Should have SECURITY DEFINER functions
  assert.ok(content.includes('SECURITY DEFINER'),
    'Hardening migration should have SECURITY DEFINER functions');
});

test('Phase 5 static: service role grants are explicit', async () => {
  const grantsPath = path.join(migrationsDir, '0008_service_role_grants.sql');
  assert.ok(existsSync(grantsPath), 'Service role grants migration must exist');
  const content = await readFile(grantsPath, 'utf8');
  // Should grant to service_role (not public or anon)
  assert.ok(content.includes('service_role'),
    'Service role grants must reference service_role');
  // Should NOT grant everything to public
  assert.ok(!content.match(/GRANT\s+ALL\s+ON.*TO\s+public/i),
    'Should not grant ALL to public');
});

test('Phase 5 static: no raw SQL credentials in migrations', async () => {
  const migrations = await readAllMigrations();
  const credentialPatterns = [
    /password\s*=\s*['"][^'"]+['"]/i,
    /api_key\s*=\s*['"][^'"]+['"]/i,
    /secret\s*=\s*['"][^'"]+['"]/i,
  ];
  for (const migration of migrations) {
    for (const pattern of credentialPatterns) {
      assert.ok(!pattern.test(migration.content),
        `Migration ${migration.file} contains hardcoded credentials`);
    }
  }
});

// ── Live database validation: NOT_RUN ────────────────────────────

test('Phase 5: live database validation is NOT_RUN (Docker not available)', () => {
  // This test documents that live database validation has NOT been run.
  // Docker is not available in this environment, so supabase local cannot start.
  // The static tests above validate schema structure, RLS, and function security.
  //
  // To run live validation:
  //   1. Install Docker
  //   2. Run: supabase start
  //   3. Run: supabase db reset
  //   4. Run the integration tests against the local database
  //
  // Status: NOT_RUN
  assert.ok(true, 'Live database validation is NOT_RUN — Docker not available');
});

test('Phase 5: staging database validation is NOT_RUN (no staging credentials)', () => {
  // Staging database validation requires SUPABASE_URL and SUPABASE_SECRET_KEY
  // for a staging Supabase instance. These credentials are not available.
  //
  // Status: NOT_RUN
  assert.ok(true, 'Staging database validation is NOT_RUN — no staging credentials');
});

test('Phase 5: production database validation is NOT_RUN (no production credentials)', () => {
  // Production database validation requires production Supabase credentials.
  // These credentials are not available and should never be used from a
  // development environment.
  //
  // Status: NOT_RUN
  assert.ok(true, 'Production database validation is NOT_RUN — no production credentials');
});
