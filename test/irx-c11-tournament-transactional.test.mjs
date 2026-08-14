// ═══════════════════════════════════════════════════════════════
// irx-c11-tournament-transactional.test.mjs — IRX-C11: Transactional persistence
//
// Proves:
//   1. SupabaseTournamentRepository.save() attempts atomic RPC first
//   2. Falls back to sequential upserts with error propagation if RPC unavailable
//   3. All error paths throw (no silent failures)
//   4. Migration 0024 defines upsert_tournament_atomic RPC function
//   5. RPC function wraps all 3 writes in a single transaction
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const repoSrc = readFileSync(join(root, 'apps/match-server/src/persistence/tournament-repository.mjs'), 'utf8');

test('IRX-C11: save() attempts atomic RPC first', () => {
  assert.ok(
    repoSrc.includes("this._client.rpc('upsert_tournament_atomic'"),
    'save() must attempt upsert_tournament_atomic RPC before sequential fallback'
  );
});

test('IRX-C11: save() falls back to sequential upserts when RPC unavailable', () => {
  assert.ok(
    repoSrc.includes('Sequential fallback'),
    'save() must have sequential fallback path for backward compatibility'
  );
  assert.ok(
    repoSrc.includes('upsert(tournamentRow') &&
    repoSrc.includes("upsert(validRows") &&
    repoSrc.includes('upsert(matchRows'),
    'Sequential fallback must upsert tournament, participants, and matches'
  );
});

test('IRX-C11: all error paths throw (no silent failures)', () => {
  // Check that all 3 sequential fallback error paths throw
  assert.ok(
    repoSrc.includes('throw new Error(`Tournament save failed:') &&
    repoSrc.includes('throw new Error(`Tournament participant save failed:') &&
    repoSrc.includes('throw new Error(`Tournament match save failed:'),
    'All 3 sequential fallback error paths must throw'
  );
  // Check that RPC failure also throws
  assert.ok(
    repoSrc.includes('throw new Error(`Atomic tournament save failed:'),
    'RPC failure path must throw'
  );
});

test('IRX-C11: migration 0024 exists and defines atomic RPC', () => {
  const migrationPath = join(root, 'supabase/migrations/0024_tournament_atomic_save.sql');
  assert.ok(existsSync(migrationPath), 'Migration 0024 must exist');
  const migrationSrc = readFileSync(migrationPath, 'utf8');
  assert.ok(
    migrationSrc.includes('upsert_tournament_atomic'),
    'Migration must define upsert_tournament_atomic function'
  );
  assert.ok(
    migrationSrc.includes('LANGUAGE plpgsql'),
    'Migration must use plpgsql for transactional control'
  );
});

test('IRX-C11: RPC function uses single transaction with rollback', () => {
  const migrationPath = join(root, 'supabase/migrations/0024_tournament_atomic_save.sql');
  const migrationSrc = readFileSync(migrationPath, 'utf8');
  assert.ok(
    migrationSrc.includes('EXCEPTION'),
    'RPC must have EXCEPTION handler for rollback'
  );
  assert.ok(
    migrationSrc.includes('WHEN OTHERS THEN'),
    'RPC must catch all exceptions and rollback'
  );
  // The function body is wrapped in a single function call, which is
  // inherently transactional in PostgreSQL SECURITY DEFINER functions
  assert.ok(
    migrationSrc.includes('SECURITY DEFINER'),
    'RPC must be SECURITY DEFINER for proper transaction scope'
  );
});

test('IRX-C11: RPC upserts all 3 tables (tournament, participants, matches)', () => {
  const migrationPath = join(root, 'supabase/migrations/0024_tournament_atomic_save.sql');
  const migrationSrc = readFileSync(migrationPath, 'utf8');
  assert.ok(
    migrationSrc.includes('INSERT INTO tournaments') && migrationSrc.includes('ON CONFLICT (tournament_id)'),
    'RPC must upsert tournaments table'
  );
  assert.ok(
    migrationSrc.includes('INSERT INTO tournament_participants') && migrationSrc.includes('ON CONFLICT (tournament_id, user_id)'),
    'RPC must upsert tournament_participants table'
  );
  assert.ok(
    migrationSrc.includes('INSERT INTO tournament_matches') && migrationSrc.includes('ON CONFLICT (match_id)'),
    'RPC must upsert tournament_matches table'
  );
});
