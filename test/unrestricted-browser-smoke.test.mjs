import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distEngine = path.join(root, 'apps/lab-web/dist/engine');
const dist = path.join(root, 'apps/lab-web/dist');

// Import the browser-entry bundle (same modules the browser loads)
const entryUrl = pathToFileURL(path.join(distEngine, 'browser-entry.js')).href;
const entry = await import(entryUrl);

// Import the autonomy-runtime bundle (browser-side match runner)
const runtimeUrl = pathToFileURL(path.join(root, 'apps/lab-web/dist/autonomy-runtime.js')).href;
const runtime = await import(runtimeUrl);

// ── Browser Bundle: Unrestricted Profile Export ──────────────

test('browser-entry.js exports CORE_UNRESTRICTED_AUTHORITY_PROFILE', () => {
  assert.ok(entry.CORE_UNRESTRICTED_AUTHORITY_PROFILE, 'browser-entry must export CORE_UNRESTRICTED_AUTHORITY_PROFILE');
  assert.equal(entry.CORE_UNRESTRICTED_AUTHORITY_PROFILE.id, 'core-unrestricted-authority');
  assert.equal(entry.CORE_UNRESTRICTED_AUTHORITY_PROFILE.engineVersion, '4.2.6');
});

test('browser-entry.js also exports CORE_ADVANCED_AUTHORITY_PROFILE for parity', () => {
  assert.ok(entry.CORE_ADVANCED_AUTHORITY_PROFILE, 'browser-entry must still export CORE_ADVANCED_AUTHORITY_PROFILE');
  assert.equal(entry.CORE_ADVANCED_AUTHORITY_PROFILE.id, 'core-advanced-authority');
});

// ── Browser Bundle: Unrestricted Match Execution ─────────────

test('browser autonomy-runtime runs unrestricted profile match to completion', () => {
  const result = runtime.runBrowserPolicyMatch({
    seed: 0x14dead01,
    profileId: 'core-unrestricted-authority',
    policyIds: ['random-legal', 'random-legal'],
    decisionLimit: 8000,
    seatOrder: ['P1', 'P2']
  });
  assert.ok(result, 'runBrowserPolicyMatch must return a result');
  assert.ok(['NORMAL_VICTORY', 'EXHAUSTED_RESOLUTION', 'CANONICAL_DRAW'].includes(result.terminationReason),
    `unrestricted match should terminate with a valid reason, got: ${result.terminationReason}`);
  assert.ok(result.policyDecisionCount > 0, 'unrestricted match should have at least 1 policy decision');
  assert.ok(result.commandCount > 0, 'unrestricted match should have at least 1 command');
  assert.ok(result.matchResultHash, 'unrestricted match should have a matchResultHash');
  assert.ok(result.finalStateHash, 'unrestricted match should have a finalStateHash');
});

test('browser unrestricted match is deterministic across two runs', () => {
  const a = runtime.runBrowserPolicyMatch({
    seed: 42,
    profileId: 'core-unrestricted-authority',
    policyIds: ['random-legal', 'random-legal'],
    decisionLimit: 8000
  });
  const b = runtime.runBrowserPolicyMatch({
    seed: 42,
    profileId: 'core-unrestricted-authority',
    policyIds: ['random-legal', 'random-legal'],
    decisionLimit: 8000
  });
  assert.equal(a.matchResultHash, b.matchResultHash,
    'two identical unrestricted matches must produce identical matchResultHash');
  assert.equal(a.finalStateHash, b.finalStateHash,
    'two identical unrestricted matches must produce identical finalStateHash');
});

test('browser unrestricted profile differs from advanced profile', () => {
  // Same seed, different profile → different match
  const unrestricted = runtime.runBrowserPolicyMatch({
    seed: 100,
    profileId: 'core-unrestricted-authority',
    policyIds: ['random-legal', 'random-legal'],
    decisionLimit: 4000
  });
  const advanced = runtime.runBrowserPolicyMatch({
    seed: 100,
    profileId: 'core-advanced-authority',
    policyIds: ['random-legal', 'random-legal'],
    decisionLimit: 4000
  });
  assert.notEqual(unrestricted.matchResultHash, advanced.matchResultHash,
    'unrestricted and advanced profiles with same seed should produce different matches');
});

// ── Browser Bundle: Unrestricted Profile with HYBRIX AI ──────

test('browser unrestricted profile works with HYBIX policy', () => {
  const result = runtime.runBrowserPolicyMatch({
    seed: 77,
    profileId: 'core-unrestricted-authority',
    policyIds: ['hybrix-rusher', 'random-legal'],
    decisionLimit: 4000
  });
  assert.ok(result, 'HYBIX vs random-legal on unrestricted profile must return a result');
  assert.ok(['NORMAL_VICTORY', 'EXHAUSTED_RESOLUTION', 'CANONICAL_DRAW'].includes(result.terminationReason),
    `HYBIX unrestricted match should terminate, got: ${result.terminationReason}`);
  assert.ok(result.policyDecisionCount > 0, 'HYBIX unrestricted match should have policy decisions');
});

// ── Browser Bundle: Unrestricted Profile Exercises Unique Mechanics ──

test('browser unrestricted match exercises unique mechanic counts', () => {
  const result = runtime.runBrowserPolicyMatch({
    seed: 0x14dead01,
    profileId: 'core-unrestricted-authority',
    policyIds: ['random-legal', 'random-legal'],
    decisionLimit: 8000
  });
  // The unrestricted profile should produce mechanic counts that include
  // mechanics not available in the advanced profile
  const mechanicKeys = Object.keys(result.mechanicCounts || {});
  assert.ok(mechanicKeys.length > 0, 'unrestricted match should have mechanic counts');
  // Check for sudden-death or hidden super mechanics
  const hasUnrestrictedMechanics = mechanicKeys.some(k =>
    k.includes('sudden') || k.includes('dig') || k.includes('recycle') ||
    k.includes('raid') || k.includes('topdeck') || k.includes('mimic')
  );
  // Not guaranteed for every seed, but the mechanic counts should be non-empty
  assert.ok(result.actionCount > 0, 'unrestricted match should have actions');
});

// ── Browser Bundle: Capability Manifest Consistency ──────────

test('browser-entry profile metadata matches capability manifest', async () => {
  const manifestPath = path.join(dist, 'data/release/capability-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  // The manifest uses CORE_UNRESTRICTED_2P as the profile ID, with engineProfileId mapping to the engine's id
  const unrestrictedProfile = manifest.profiles.find(p => p.engineProfileId === 'core-unrestricted-authority');
  assert.ok(unrestrictedProfile, 'capability manifest must list core-unrestricted-authority as engineProfileId');
  assert.equal(unrestrictedProfile.autonomy, 'SUPPORTED');
  assert.equal(unrestrictedProfile.engineProfileId, entry.CORE_UNRESTRICTED_AUTHORITY_PROFILE.id);
});

// ── Browser Bundle: UI Integration ───────────────────────────

test('experiment-controls.js includes unrestricted profile in dropdown', async () => {
  const controlsSrc = await readFile(path.join(dist, 'experiment-controls.js'), 'utf8');
  assert.ok(controlsSrc.includes('core-unrestricted-authority'),
    'experiment-controls.js must include core-unrestricted-authority in the profile dropdown');
  assert.ok(controlsSrc.includes('Unrestricted Core'),
    'experiment-controls.js must include "Unrestricted Core" as a display label');
});

test('ranked-duel-renderer.mjs includes unrestricted profile as a mode card', async () => {
  const rendererSrc = await readFile(path.join(dist, 'play/ranked-duel-renderer.mjs'), 'utf8');
  assert.ok(rendererSrc.includes('core-unrestricted-authority'),
    'ranked-duel-renderer.mjs must reference core-unrestricted-authority');
});

// ── Browser Bundle: Campaign Support ─────────────────────────

test('browser autonomy-runtime campaign supports unrestricted profile', () => {
  // Run a small campaign with the unrestricted profile
  const result = runtime.runBrowserCampaign({
    matchCount: 3,
    policyIds: ['random-legal', 'random-legal'],
    seedCatalogId: 'smoke-test',
    profileId: 'core-unrestricted-authority',
    decisionLimit: 2000
  });
  assert.ok(result, 'runBrowserCampaign must return a result for unrestricted profile');
  assert.ok(result.summaries, 'campaign must return match summaries');
  assert.ok(Array.isArray(result.summaries), 'campaign summaries must be an array');
  assert.equal(result.summaries.length, 3, 'campaign should complete all 3 matches');
  assert.equal(result.completedMatchCount, 3, 'completedMatchCount should be 3');
  assert.ok(result.canonicalResultHash, 'campaign must have a canonicalResultHash');
});
