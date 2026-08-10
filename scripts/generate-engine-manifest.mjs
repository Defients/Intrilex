// ═══════════════════════════════════════════════════════════════
// generate-engine-manifest.mjs — Phase 2B: Engine authority manifest
//
// Generates config/engine-manifest.json from the actual engine-adapter
// exports — the canonical source of truth for:
//   - Engine/rules version
//   - Supported profile IDs and their capabilities
//   - Canonical rank authority (rank definitions, scuttle order, modes)
//   - Capability list
//
// This manifest is the single declarative artifact that proves the
// engine's authority surface is complete, versioned, and verifiable.
// It is generated (not hand-maintained) to prevent drift.
// ═══════════════════════════════════════════════════════════════

import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

async function generateEngineManifest() {
  // Import the engine-adapter to get canonical values
  const adapter = await import('../packages/engine-adapter/src/adapter.mjs');

  const {
    ENGINE_VERSION,
    RULES_VERSION,
    OFFICIAL_RULES_VERSION,
    DEFAULT_SIMULATION_PROFILE,
    SUPPORTED_PROFILE_IDS,
    CANONICAL_RANKS,
    canonicalRankAuthority,
    simulationCapabilities,
  } = adapter;

  // Build the rank authority artifact
  const rankAuthority = canonicalRankAuthority();

  // Get capabilities
  const capabilities = simulationCapabilities();

  // Build profile list from the supported set
  const profileIds = [...SUPPORTED_PROFILE_IDS].sort();

  // Construct the manifest
  const manifest = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    rulesVersion: RULES_VERSION,
    officialRulesVersion: OFFICIAL_RULES_VERSION,
    defaultSimulationProfile: DEFAULT_SIMULATION_PROFILE,
    supportedProfileIds: profileIds,
    canonicalRanks: CANONICAL_RANKS,
    rankAuthority,
    capabilities,
  };

  // Compute integrity hash over the canonical content
  const hashInput = JSON.stringify({
    engineVersion: manifest.engineVersion,
    rulesVersion: manifest.rulesVersion,
    supportedProfileIds: manifest.supportedProfileIds,
    canonicalRanks: manifest.canonicalRanks,
    rankAuthorityHash: manifest.rankAuthority.authorityHash,
  });
  manifest.integrityHash = createHash('sha256').update(hashInput).digest('hex').slice(0, 32);

  return manifest;
}

// ── CLI ──

const args = process.argv.slice(2);
const verifyOnly = args.includes('--verify');

const manifest = await generateEngineManifest();

if (verifyOnly) {
  const existingPath = join(ROOT, 'config/engine-manifest.json');
  if (!existsSync(existingPath)) {
    console.error('❌ config/engine-manifest.json does not exist — run with --generate first');
    process.exit(1);
  }
  const existing = JSON.parse(readFileSync(existingPath, 'utf8'));
  const drift = [];
  for (const key of ['engineVersion', 'rulesVersion', 'officialRulesVersion', 'defaultSimulationProfile', 'supportedProfileIds', 'canonicalRanks']) {
    if (JSON.stringify(existing[key]) !== JSON.stringify(manifest[key])) {
      drift.push(`  ${key}: existing=${JSON.stringify(existing[key])?.slice(0, 80)} vs generated=${JSON.stringify(manifest[key])?.slice(0, 80)}`);
    }
  }
  if (existing.rankAuthority?.authorityHash !== manifest.rankAuthority?.authorityHash) {
    drift.push(`  rankAuthority.authorityHash: existing=${existing.rankAuthority?.authorityHash} vs generated=${manifest.rankAuthority?.authorityHash}`);
  }
  if (drift.length > 0) {
    console.error('❌ Engine manifest drift detected:');
    for (const d of drift) console.error(d);
    process.exit(1);
  }
  console.log('✅ Engine manifest verified — no drift');
} else {
  const outPath = join(ROOT, 'config/engine-manifest.json');
  writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`✅ Engine manifest written to ${outPath}`);
  console.log(`   engine=${manifest.engineVersion} rules=${manifest.rulesVersion}`);
  console.log(`   profiles=[${manifest.supportedProfileIds.join(', ')}]`);
  console.log(`   ranks=[${manifest.canonicalRanks.join(', ')}]`);
  console.log(`   rankAuthorityHash=${manifest.rankAuthority.authorityHash}`);
  console.log(`   integrityHash=${manifest.integrityHash}`);
  console.log(`   capabilities=${manifest.capabilities.length}`);
}
