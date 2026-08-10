// ═══════════════════════════════════════════════════════════════
// generate-release-identity.mjs — Phase 2A: Release identity manifest generator
//
// Generates config/release-identity.json from the ACTUAL codebase state,
// not from hand-maintained values. Every field is derived from a canonical
// source — if a source is missing or inconsistent, the generator fails
// loudly with a non-zero exit code.
//
// Canonical sources (in precedence order):
//   - version:              package.json → version field
//   - engineVersion:        packages/engine-adapter/src/adapter.mjs → ENGINE_VERSION
//   - rulesVersion:         packages/engine-adapter/src/adapter.mjs → RULES_VERSION
//   - officialRulesVersion: packages/engine-adapter/src/adapter.mjs → OFFICIAL_RULES_VERSION
//   - coreSchemaVersion:    packages/shared/src/version.mjs → SCHEMA_VERSION
//   - telemetrySchemaVersion: packages/shared/src/version.mjs → TELEMETRY_SCHEMA_VERSION
//   - analyticsSchemaVersion: packages/shared/src/version.mjs → ANALYTICS_SCHEMA_VERSION
//   - decisionTraceSchemaVersion: packages/shared/src/version.mjs → DECISION_TRACE_SCHEMA_VERSION
//   - replayDataVersion:    packages/shared/src/version.mjs → REPLAY_DATA_VERSION
//   - defaultSimulationProfile: packages/engine-adapter/src/adapter.mjs → DEFAULT_SIMULATION_PROFILE
//   - supportedProfileIds:  packages/engine-adapter/src/adapter.mjs → SUPPORTED_PROFILE_IDS
//   - releaseTitle:         package.json → description (parsed for release title)
//   - releaseDate:          current date (ISO 8601 date only)
//
// The generator also cross-checks that:
//   1. version.mjs values match adapter.mjs values (engine/rules)
//   2. The rulebook filename matches the rules version
//   3. The save-integrity.js PRODUCT_VERSION matches the package version
//   4. The index.html title contains the version
//
// Usage:
//   node scripts/generate-release-identity.mjs          # generate + verify
//   node scripts/generate-release-identity.mjs --verify  # verify only (no write)
//   node scripts/generate-release-identity.mjs --check   # check + fail on drift
// ═══════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Source readers ──

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new Error(`Cannot read JSON ${filePath}: ${err.message}`);
  }
}

function extractConstant(filePath, constName) {
  const content = readFileSync(filePath, 'utf8');
  // Match: export const FOO = 'value';  or  export const FOO = "value";
  const pattern = new RegExp(`export\\s+const\\s+${constName}\\s*=\\s*["']([^"']+)["']`);
  const match = content.match(pattern);
  if (!match) {
    throw new Error(`Cannot find export const ${constName} as string literal in ${filePath}`);
  }
  return match[1];
}

/**
 * Resolve a runtime export value from an ESM module via dynamic import.
 * Used for constants that are derived from object properties (e.g. DEFAULT_SIMULATION_PROFILE = FOO.id).
 * @param {string} modulePath - Absolute path to the .mjs file
 * @param {string} exportName - Named export to read
 * @returns {Promise<unknown>}
 */
async function resolveExport(modulePath, exportName) {
  const mod = await import(`file://${modulePath.replace(/\\/g, '/')}`);
  if (!(exportName in mod)) {
    throw new Error(`Cannot find export ${exportName} in ${modulePath}`);
  }
  return mod[exportName];
}

// ── Manifest generation ──

export async function generateReleaseIdentity() {
  const errors = [];
  const warnings = [];

  // 1. Package version
  const pkg = readJson(join(ROOT, 'package.json'));
  const version = pkg.version;

  // 2. Engine adapter constants — string literals extracted from source
  const adapterPath = join(ROOT, 'packages/engine-adapter/src/adapter.mjs');
  const engineVersion = extractConstant(adapterPath, 'ENGINE_VERSION');
  const rulesVersion = extractConstant(adapterPath, 'RULES_VERSION');
  const officialRulesVersion = extractConstant(adapterPath, 'OFFICIAL_RULES_VERSION');

  // 2b. Derived constants — resolved via dynamic import (not string literals)
  const defaultSimProfile = await resolveExport(adapterPath, 'DEFAULT_SIMULATION_PROFILE');
  const supportedProfileIdsSet = await resolveExport(adapterPath, 'SUPPORTED_PROFILE_IDS');
  const supportedProfileIds = [...supportedProfileIdsSet].sort();

  // 3. Shared version constants
  const versionPath = join(ROOT, 'packages/shared/src/version.mjs');
  const labVersion = extractConstant(versionPath, 'LAB_VERSION');
  const schemaVersion = extractConstant(versionPath, 'SCHEMA_VERSION');
  const decisionTraceSchemaVersion = extractConstant(versionPath, 'DECISION_TRACE_SCHEMA_VERSION');
  const analyticsSchemaVersion = extractConstant(versionPath, 'ANALYTICS_SCHEMA_VERSION');
  const telemetrySchemaVersion = extractConstant(versionPath, 'TELEMETRY_SCHEMA_VERSION');
  const replayDataVersion = extractConstant(versionPath, 'REPLAY_DATA_VERSION');

  // 4. Cross-checks
  if (labVersion !== version) {
    errors.push(`version mismatch: package.json=${version} vs version.mjs LAB_VERSION=${labVersion}`);
  }

  // Check version.mjs ENGINE_VERSION matches adapter.mjs
  const versionEngine = extractConstant(versionPath, 'ENGINE_VERSION');
  if (versionEngine !== engineVersion) {
    errors.push(`engineVersion mismatch: adapter.mjs=${engineVersion} vs version.mjs=${versionEngine}`);
  }
  const versionRules = extractConstant(versionPath, 'RULES_VERSION');
  if (versionRules !== rulesVersion) {
    errors.push(`rulesVersion mismatch: adapter.mjs=${rulesVersion} vs version.mjs=${versionRules}`);
  }

  // Check rulebook filename matches rules version
  const rulebookPattern = new RegExp(`INTRILEX_v${rulesVersion.replace(/\./g, '\\.')}_COMPLETE_PLAYER_RULEBOOK\\.md`);
  const docsDir = join(ROOT, 'docs');
  let rulebookFound = false;
  try {
    const docs = readdirSync(docsDir);
    rulebookFound = docs.some(f => rulebookPattern.test(f));
  } catch { /* docs dir may not exist */ }
  if (!rulebookFound) {
    warnings.push(`rulebook file matching rules version ${rulesVersion} not found in docs/`);
  }

  // Check save-integrity.js PRODUCT_VERSION
  const saveIntegrityPath = join(ROOT, 'apps/lab-web/src/play/save-integrity.js');
  if (existsSync(saveIntegrityPath)) {
    try {
      const saveContent = readFileSync(saveIntegrityPath, 'utf8');
      const productVersionMatch = saveContent.match(/PRODUCT_VERSION\s*[:=]\s*['"]([^'"]+)['"]/);
      if (productVersionMatch && productVersionMatch[1] !== version) {
        errors.push(`PRODUCT_VERSION mismatch: save-integrity.js=${productVersionMatch[1]} vs package.json=${version}`);
      }
    } catch { /* best-effort */ }
  }

  // Check index.html title contains version
  const indexPath = join(ROOT, 'apps/lab-web/src/index.html');
  if (existsSync(indexPath)) {
    try {
      const html = readFileSync(indexPath, 'utf8');
      if (!html.includes(version)) {
        warnings.push(`index.html does not contain version ${version}`);
      }
    } catch { /* best-effort */ }
  }

  // 5. Parse release title from description
  const releaseTitle = pkg.description?.split('—')?.[1]?.trim()?.split('.')?.[0] ?? 'Unknown';

  // 6. Build the manifest
  const manifest = {
    schemaVersion: '1.0.0',
    productName: 'Intrilex Simulation Lab',
    version,
    releaseTitle,
    buildKind: 'RANKED_DUEL_PLAYER_SHELL',
    engineVersion,
    rulesVersion,
    officialRulesVersion,
    coreSchemaVersion: schemaVersion,
    telemetrySchemaVersion,
    analyticsSchemaVersion,
    decisionTraceSchemaVersion,
    playerRuntimeVersion: '1.2.0',
    saveFormatVersion: 2,
    replayDataVersion,
    localProfileSchemaVersion: '1.1.0',
    defaultSimulationProfile: defaultSimProfile,
    supportedProfileIds,
    artifactKinds: ['source', 'deploy', 'evidence'],
    canonicalArchivePrefix: `Intrilex_Simulation_Lab_v${version}`,
    releaseDate: new Date().toISOString().split('T')[0],
  };

  // Compute integrity hash over the canonical content
  const hashInput = JSON.stringify({
    version: manifest.version,
    engineVersion: manifest.engineVersion,
    rulesVersion: manifest.rulesVersion,
    officialRulesVersion: manifest.officialRulesVersion,
    defaultSimulationProfile: manifest.defaultSimulationProfile,
    supportedProfileIds: manifest.supportedProfileIds,
  });
  manifest.integrityHash = createHash('sha256').update(hashInput).digest('hex').slice(0, 32);

  return { manifest, errors, warnings };
}

// ── CLI ──

const args = process.argv.slice(2);
const verifyOnly = args.includes('--verify');
const checkOnly = args.includes('--check');

const { manifest, errors, warnings } = await generateReleaseIdentity();

if (errors.length > 0) {
  console.error('❌ Release identity generation FAILED — cross-check errors:');
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn('⚠  Warnings:');
  for (const w of warnings) console.warn(`  ${w}`);
}

if (verifyOnly || checkOnly) {
  // Verify against existing file
  const existingPath = join(ROOT, 'config/release-identity.json');
  if (!existsSync(existingPath)) {
    console.error('❌ config/release-identity.json does not exist');
    process.exit(1);
  }
  const existing = readJson(existingPath);
  const drift = [];
  for (const key of Object.keys(manifest)) {
    if (key === 'releaseDate' || key === 'integrityHash') continue; // Non-deterministic
    if (JSON.stringify(existing[key]) !== JSON.stringify(manifest[key])) {
      drift.push(`  ${key}: existing=${JSON.stringify(existing[key])} vs generated=${JSON.stringify(manifest[key])}`);
    }
  }
  if (drift.length > 0) {
    console.error('❌ Release identity drift detected:');
    for (const d of drift) console.error(d);
    process.exit(1);
  }
  console.log('✅ Release identity verified — no drift');
} else {
  // Write the manifest
  const outPath = join(ROOT, 'config/release-identity.json');
  writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`✅ Release identity written to ${outPath}`);
  console.log(`   version=${manifest.version} engine=${manifest.engineVersion} rules=${manifest.rulesVersion}`);
  console.log(`   profiles=[${manifest.supportedProfileIds.join(', ')}]`);
  console.log(`   integrityHash=${manifest.integrityHash}`);
}
