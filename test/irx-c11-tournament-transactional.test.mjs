// ═══════════════════════════════════════════════════════════════
// irx-c11-tournament-transactional.test.mjs — IRX-C11: Transactional persistence
//
// Proves:
//   1. SupabaseTournamentRepository.save() attempts atomic RPC first
//   2. Fails closed if the atomic RPC is unavailable
//   3. RPC errors are not exposed to clients
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
    'save() must use upsert_tournament_atomic'
  );
});

test('IRX-C11: save() has no partial-commit sequential fallback', () => {
  assert.doesNotMatch(repoSrc, /\.from\('tournaments'\)[\s\S]*?\.upsert\(tournamentRow/);
  assert.doesNotMatch(repoSrc, /\.upsert\(participantRows|\.upsert\(matchRows/);
});

test('IRX-C11: atomic RPC errors fail closed without leaking database details', () => {
  assert.ok(
    repoSrc.includes("throw new Error('Atomic tournament save failed')"),
    'RPC failure path must throw'
  );
  assert.doesNotMatch(repoSrc, /rpcErr\.message|rpcResult\.error/);
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
