// ═══════════════════════════════════════════════════════════════
// provenance.mjs — Deterministic provenance primitives for release truth
//
// Implements the identity-hash chain required by Gate 2:
//   releaseIdentityHash
//     = hashCanonical(release identity without volatile fields)
//
//   simulationSourceHash
//     = hash(sorted relative path + SHA-256 bytes of simulation/analytics
//        authority inputs)
//
//   experimentHash
//     = hashCanonical(full semantic experiment identity)
//
//   segmentCacheKey
//     = hashCanonical(experimentHash + workerCount + ordinal range
//        + segment schema)
//
//   buildHash
//     = hashCanonical(releaseIdentityHash + source hash + deterministic
//        bundle manifest)
// ═══════════════════════════════════════════════════════════════
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashCanonical } from './canonical.mjs';
import { loadReleaseIdentity, releaseIdentityHash } from './release-identity.mjs';

export { releaseIdentityHash };

/**
 * Walk a directory tree and collect file paths matching a predicate.
 * @param {string} dir - Directory to walk
 * @param {(relPath: string) => boolean} predicate - Filter function
 * @returns {Promise<string[]>} Sorted array of relative paths
 */
async function walkSourceTree(dir, predicate) {
  const results = /** @type {string[]} */ ([]);
  async function walk(/** @type {string} */ d) {
    if (!existsSync(d)) return;
    const entries = await readdir(d, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' ||
          entry.name === 'dist' || entry.name === 'release' ||
          entry.name === 'runtime' || entry.name === 'upstream' ||
          entry.name === 'vendor' || entry.name === '.windsurf' ||
          entry.name === '.github' || entry.name === 'reports' ||
          entry.name === 'sample-data' || entry.name === 'pnpm-store') continue;
      const fullPath = path.join(d, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else if (entry.isFile()) {
        const rel = path.relative(dir, fullPath).replace(/\\/g, '/');
        if (predicate(rel)) results.push(fullPath);
      }
    }
  }
  await walk(dir);
  return results.sort();
}

/**
 * Source roots that affect simulation/analytics behavior.
 * These are the authority inputs for simulationSourceHash.
 */
const SIMULATION_SOURCE_ROOTS = [
  'packages/engine-adapter/src',
  'packages/simulation-runtime/src',
  'packages/policies/src',
  'packages/policy-sdk/src',
  'packages/telemetry/src',
  'packages/analytics/src',
  'packages/statistics/src',
  'packages/decision-intelligence/src',
  'packages/game-ai/src',
  'packages/shared/src',
  'packages/browser-crypto-shim/src',
  'config/release-identity.json',
  'canonical-v4.1.2-pass-priority-hotfix.json',
];

/**
 * File extensions included in the simulation source hash.
 */
const SOURCE_EXTENSIONS = /\.(mjs|js|json)$/;

/**
 * Compute the simulation source hash — SHA-256 over the sorted
 * relative paths and file contents of all simulation/analytics
 * authority inputs.
 * @param {string} [rootDir] - Project root (defaults to derived root)
 * @returns {Promise<string>} 64-char hex SHA-256
 */
export async function simulationSourceHash(rootDir) {
  const root = rootDir ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const hash = createHash('sha256');
  for (const root2 of SIMULATION_SOURCE_ROOTS) {
    const fullPath = path.join(root, root2);
    if (!existsSync(fullPath)) continue;
    const isFile = (await stat(fullPath).catch(() => null))?.isFile();
    if (isFile) {
      const rel = root2;
      const data = await readFile(fullPath);
      hash.update(rel);
      hash.update(createHash('sha256').update(data).digest('hex'));
    } else {
      const files = await walkSourceTree(fullPath, (rel) => SOURCE_EXTENSIONS.test(rel));
      for (const file of files) {
        const rel = path.relative(root, file).replace(/\\/g, '/');
        const data = await readFile(file);
        hash.update(rel);
        hash.update(createHash('sha256').update(data).digest('hex'));
      }
    }
  }
  return hash.digest('hex');
}

/**
 * @typedef {Object} ExperimentIdentityParams
 * @property {string} labVersion
 * @property {string} engineVersion
 * @property {string} rulesVersion
 * @property {string} coreSchemaVersion
 * @property {string} telemetrySchemaVersion
 * @property {string} analyticsSchemaVersion
 * @property {string} profileId
 * @property {string[]} [enabledModules]
 * @property {number} matchCount
 * @property {Array<[string, string]>} policyPairs
 * @property {Record<string, string>} policyVersions
 * @property {number} decisionLimit
 * @property {object} [seedDerivation]
 * @property {object} [seatOrderAlgorithm]
 * @property {string} simulationSourceHash
 * @property {string} releaseIdentityHash
 */

/**
 * Build the semantic experiment identity object.
 * This is the canonical semantic core that determines experiment
 * reproducibility. Worker count, timestamps, OS, and run IDs are
 * excluded — they must not affect the experiment hash.
 * @param {ExperimentIdentityParams} params - Experiment parameters
 * @returns {Record<string, unknown>} Semantic identity object
 */
export function buildExperimentIdentity(params) {
  return {
    labVersion: params.labVersion,
    engineVersion: params.engineVersion,
    rulesVersion: params.rulesVersion,
    coreSchemaVersion: params.coreSchemaVersion,
    telemetrySchemaVersion: params.telemetrySchemaVersion,
    analyticsSchemaVersion: params.analyticsSchemaVersion,
    profileId: params.profileId,
    enabledModules: params.enabledModules ?? [],
    matchCount: params.matchCount,
    policyPairs: params.policyPairs,
    policyVersions: params.policyVersions,
    decisionLimit: params.decisionLimit,
    seedDerivation: params.seedDerivation ?? { kind: 'HASH_DERIVED_UINT32_NONZERO', version: '1.0.0' },
    seatOrderAlgorithm: params.seatOrderAlgorithm ?? { kind: 'ROUND_ROBIN_SWAP', version: '1.0.0' },
    simulationSourceHash: params.simulationSourceHash,
    releaseIdentityHash: params.releaseIdentityHash,
  };
}

/**
 * Compute the experiment hash from semantic identity.
 * @param {Record<string, unknown>} semantic - Semantic identity (from buildExperimentIdentity)
 * @returns {string} 64-char hex SHA-256
 */
export function experimentHash(semantic) {
  return hashCanonical(semantic);
}

/**
 * Compute the segment cache key — includes experiment hash plus
 * worker count and ordinal range. Different worker counts produce
 * different cache keys but the same experiment hash.
 * @param {{ experimentHash: string, workerCount: number, ordinalStart: number, ordinalEnd: number, segmentSchema?: string }} params
 * @returns {string} 64-char hex SHA-256
 */
export function segmentCacheKey(params) {
  return hashCanonical({
    experimentHash: params.experimentHash,
    workerCount: params.workerCount,
    ordinalStart: params.ordinalStart,
    ordinalEnd: params.ordinalEnd,
    segmentSchema: params.segmentSchema ?? '1.1',
  });
}

/**
 * Build hash — hash of release identity + source hash + bundle manifest.
 * @param {{ releaseIdentityHash: string, simulationSourceHash: string, bundleManifestHash: string }} params
 * @returns {string} 64-char hex SHA-256
 */
export function buildHash(params) {
  return hashCanonical({
    releaseIdentityHash: params.releaseIdentityHash,
    simulationSourceHash: params.simulationSourceHash,
    bundleManifestHash: params.bundleManifestHash,
  });
}

/**
 * Validate a segment against the expected identity.
 * A segment is reusable only when ALL of these match exactly:
 *   - segment schema
 *   - experiment hash
 *   - release identity hash
 *   - simulation source hash
 *   - semantic configuration hash
 *   - worker count
 *   - ordinal start/end
 *   - expected record count
 *   - segment result hash
 *   - accounting invariant
 * @param {Record<string, unknown> & { records?: Array<{ ordinal: number }>, schemaVersion?: string, experimentHash?: string, releaseIdentityHash?: string, simulationSourceHash?: string, workerCount?: number, ordinalRange?: [number, number], segmentResultHash?: string, accountingInvariant?: boolean }} segment - The cached segment to validate
 * @param {{ segmentSchema?: string, experimentHash: string, releaseIdentityHash: string, simulationSourceHash: string, workerCount: number, ordinalStart: number, ordinalEnd: number, expectedResultHash: string }} expected - The expected identity values
 * @returns {{valid: boolean, reason: string|null}} Validation result
 */
export function validateSegmentAgainstExpectedIdentity(segment, expected) {
  if (!segment || typeof segment !== 'object') {
    return { valid: false, reason: 'SEGMENT_NULL_OR_INVALID' };
  }
  if (segment.schemaVersion !== (expected.segmentSchema ?? '1.1')) {
    return { valid: false, reason: `SEGMENT_SCHEMA_MISMATCH:expected=${expected.segmentSchema ?? '1.1'},actual=${segment.schemaVersion}` };
  }
  if (segment.experimentHash !== expected.experimentHash) {
    return { valid: false, reason: `EXPERIMENT_HASH_MISMATCH:expected=${expected.experimentHash},actual=${segment.experimentHash}` };
  }
  if (segment.releaseIdentityHash !== expected.releaseIdentityHash) {
    return { valid: false, reason: `RELEASE_IDENTITY_HASH_MISMATCH:expected=${expected.releaseIdentityHash},actual=${segment.releaseIdentityHash}` };
  }
  if (segment.simulationSourceHash !== expected.simulationSourceHash) {
    return { valid: false, reason: `SIMULATION_SOURCE_HASH_MISMATCH:expected=${expected.simulationSourceHash},actual=${segment.simulationSourceHash}` };
  }
  if (segment.workerCount !== expected.workerCount) {
    return { valid: false, reason: `WORKER_COUNT_MISMATCH:expected=${expected.workerCount},actual=${segment.workerCount}` };
  }
  const [segStart, segEnd] = segment.ordinalRange ?? [null, null];
  if (segStart !== expected.ordinalStart || segEnd !== expected.ordinalEnd) {
    return { valid: false, reason: `ORDINAL_RANGE_MISMATCH:expected=[${expected.ordinalStart},${expected.ordinalEnd}],actual=[${segStart},${segEnd}]` };
  }
  const expectedRecords = expected.ordinalEnd - expected.ordinalStart;
  if (!segment.records || segment.records.length !== expectedRecords) {
    return { valid: false, reason: `RECORD_COUNT_MISMATCH:expected=${expectedRecords},actual=${segment.records?.length ?? 0}` };
  }
  if (segment.segmentResultHash !== expected.expectedResultHash) {
    return { valid: false, reason: `SEGMENT_RESULT_HASH_MISMATCH:expected=${expected.expectedResultHash},actual=${segment.segmentResultHash}` };
  }
  if (segment.accountingInvariant !== true) {
    return { valid: false, reason: 'ACCOUNTING_INVARIANT_FALSE' };
  }
  // Check for duplicate or missing ordinals
  const ordinals = segment.records.map(r => r.ordinal).sort((a, b) => a - b);
  for (let i = 0; i < ordinals.length; i++) {
    if (ordinals[i] !== expected.ordinalStart + i) {
      return { valid: false, reason: `ORDINAL_GAP_OR_DUPLICATE:expected=${expected.ordinalStart + i},actual=${ordinals[i]}` };
    }
  }
  return { valid: true, reason: null };
}

export {
  loadReleaseIdentity,
  SIMULATION_SOURCE_ROOTS,
};
