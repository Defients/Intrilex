// ═══════════════════════════════════════════════════════════════
// engine-manifest.test.mjs — Phase 2B: Engine authority manifest truth
//
// Verifies that config/engine-manifest.json is consistent with the
// actual engine-adapter exports. Fails closed on any drift.
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

test('Phase 2B: engine-manifest.json exists and is valid', () => {
  const manifestPath = join(ROOT, 'config/engine-manifest.json');
  assert.ok(existsSync(manifestPath), 'config/engine-manifest.json must exist');

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.ok(manifest.schemaVersion, 'must have schemaVersion');
  assert.ok(manifest.engineVersion, 'must have engineVersion');
  assert.ok(manifest.rulesVersion, 'must have rulesVersion');
  assert.ok(manifest.supportedProfileIds, 'must have supportedProfileIds');
  assert.ok(manifest.canonicalRanks, 'must have canonicalRanks');
  assert.ok(manifest.rankAuthority, 'must have rankAuthority');
  assert.ok(manifest.integrityHash, 'must have integrityHash');
});

test('Phase 2B: engine-manifest supportedProfileIds match engine-adapter exports', async () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'config/engine-manifest.json'), 'utf8'));
  const adapter = await import('@intrilex/engine-adapter');

  assert.deepEqual(
    [...manifest.supportedProfileIds].sort(),
    [...adapter.SUPPORTED_PROFILE_IDS].sort(),
    'manifest supportedProfileIds must match engine-adapter SUPPORTED_PROFILE_IDS'
  );
});

test('Phase 2B: engine-manifest canonical ranks match engine-adapter', async () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'config/engine-manifest.json'), 'utf8'));
  const adapter = await import('@intrilex/engine-adapter');

  assert.deepEqual(
    manifest.canonicalRanks,
    adapter.CANONICAL_RANKS,
    'manifest canonicalRanks must match engine-adapter CANONICAL_RANKS'
  );
});

test('Phase 2B: engine-manifest rank authority hash is stable', async () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'config/engine-manifest.json'), 'utf8'));
  const adapter = await import('@intrilex/engine-adapter');

  const currentAuthority = adapter.canonicalRankAuthority();
  assert.equal(
    manifest.rankAuthority.authorityHash,
    currentAuthority.authorityHash,
    'rank authority hash must match — engine rank definitions have changed'
  );
});

test('Phase 2B: engine-manifest versions match engine-adapter', async () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'config/engine-manifest.json'), 'utf8'));
  const adapter = await import('@intrilex/engine-adapter');

  assert.equal(manifest.engineVersion, adapter.ENGINE_VERSION, 'engineVersion must match');
  assert.equal(manifest.rulesVersion, adapter.RULES_VERSION, 'rulesVersion must match');
  assert.equal(manifest.officialRulesVersion, adapter.OFFICIAL_RULES_VERSION, 'officialRulesVersion must match');
  assert.equal(manifest.defaultSimulationProfile, adapter.DEFAULT_SIMULATION_PROFILE, 'defaultSimulationProfile must match');
});

test('Phase 2B: supabase migrations 0001-0012 are present', () => {
  const migrationsDir = join(ROOT, 'supabase/migrations');
  assert.ok(existsSync(migrationsDir), 'supabase/migrations directory must exist');

  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
  const expectedMigrations = [
    '0001_profiles.sql',
    '0002_account_settings.sql',
    '0003_competitive.sql',
    '0004_match_history.sql',
    '0005_achievements.sql',
    '0006_moderation.sql',
    '0007_migration_meta.sql',
    '0008_service_role_grants.sql',
    '0009_ranked_leaderboard.sql',
    '0010_profile_customization.sql',
    '0011_tier_helpers_and_indexes.sql',
    '0012_atomic_persist_match_result.sql',
  ];

  for (const expected of expectedMigrations) {
    assert.ok(
      files.includes(expected),
      `migration ${expected} must exist in supabase/migrations/`
    );
  }
});

test('Phase 2B: ranked glyph manifest is complete (8 tiers, 3 sizes)', () => {
  const glyphManifestPath = join(ROOT, 'apps/lab-web/src/assets/ranked/glyphs/manifest.json');
  assert.ok(existsSync(glyphManifestPath), 'ranked glyph manifest must exist');

  const glyphManifest = JSON.parse(readFileSync(glyphManifestPath, 'utf8'));
  assert.equal(glyphManifest.tierCount, 8, 'must have 8 tiers');
  assert.equal(glyphManifest.tiers.length, 8, 'tiers array must have 8 entries');
  assert.equal(glyphManifest.entries.length, 24, 'must have 24 glyph entries (8 tiers × 3 sizes)');

  // Verify all 3 sizes are present for each tier
  const sizes = [64, 128, 256];
  for (const tier of glyphManifest.tiers) {
    for (const size of sizes) {
      const entry = glyphManifest.entries.find(e => e.tier === tier && e.size === size);
      assert.ok(entry, `glyph for tier=${tier} size=${size} must exist`);
      assert.ok(entry.hash, `glyph for tier=${tier} size=${size} must have a hash`);
    }
  }
});
