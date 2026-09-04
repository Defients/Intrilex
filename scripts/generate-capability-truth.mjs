// ═══════════════════════════════════════════════════════════════
// generate-capability-truth.mjs — Generate product truth from the
// machine-readable capability manifest. Single source of truth for
// README, Known Limitations, feature matrix, and in-app mode badges.
// ═══════════════════════════════════════════════════════════════

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFile(path.join(root, p), 'utf8');
const readJson = async (p) => JSON.parse(await read(p));

async function main() {
  const manifest = await readJson('reports/capability-manifest.json');
  const releaseIdentity = await readJson('config/release-identity.json');
  const selfAudit = existsSync(path.join(root, 'reports/self-audit.json'))
    ? await readJson('reports/self-audit.json')
    : null;
  const pkg = await readJson('package.json');

  // Count test files
  const testDir = path.join(root, 'test');
  const testFiles = (await readdir(testDir)).filter(f => f.endsWith('.test.mjs'));

  // Count CI stages
  let ciStages = 0;
  try {
    const ci = read('scripts/ci.mjs');
    ciStages = (ci.match(/STAGES\s*=\s*\[/) ? (ci.match(/\{[^}]+\}/g) || []).length : 0);
  } catch {}

  const truth = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    source: {
      capabilityManifest: 'reports/capability-manifest.json',
      releaseIdentity: 'config/release-identity.json',
      selfAudit: 'reports/self-audit.json',
      packageJson: 'package.json'
    },
    product: {
      name: releaseIdentity.productName,
      version: releaseIdentity.version,
      releaseTitle: releaseIdentity.releaseTitle,
      engineVersion: releaseIdentity.engineVersion,
      rulesVersion: releaseIdentity.rulesVersion,
      officialRulesVersion: releaseIdentity.officialRulesVersion,
      labVersion: manifest.labVersion,
      schemaVersion: manifest.schemaVersion,
      telemetryVersion: manifest.telemetryVersion,
      analyticsVersion: manifest.analyticsVersion,
      replayVersion: manifest.replayVersion,
      playerRuntimeVersion: releaseIdentity.playerRuntimeVersion,
      saveFormatVersion: releaseIdentity.saveFormatVersion,
      defaultSimulationProfile: manifest.defaultSimulationProfile
    },
    profiles: manifest.profiles.map(p => ({
      id: p.profileId,
      displayName: p.displayName,
      engineProfileId: p.engineProfileId,
      autonomy: p.autonomy,
      playerCounts: p.playerCounts,
      covered: p.actionCoverage.covered,
      replayOnly: p.actionCoverage.replayOnly,
      blocked: p.actionCoverage.blocked
    })),
    surfaces: manifest.surfaces,
    networkAuthority: {
      status: manifest.networkAuthority.status,
      transport: manifest.networkAuthority.transport,
      authority: manifest.networkAuthority.authority,
      features: manifest.networkAuthority.features,
      uxIntegration: manifest.networkAuthority.uxIntegration
    },
    multiplayer: {
      status: manifest.canonicalMultiplayerModule.status,
      reasonCode: manifest.canonicalMultiplayerModule.reasonCode,
      note: manifest.canonicalMultiplayerModule.note
    },
    unsupportedCombinations: manifest.unsupportedCombinations,
    evidence: {
      certifiedReplayCount: manifest.engine.legacyProtocolConformance.fixtureCount,
      semanticHotfixFixtureCount: manifest.engine.semanticHotfixConformance.fixtureCount,
      browserParity: manifest.browserEvidence,
      testFileCount: testFiles.length,
      testCount: selfAudit?.testResults?.totalTests ?? null,
      testPassCount: selfAudit?.testResults?.totalPass ?? null,
      ciStageCount: ciStages || null,
      selfAuditStatus: selfAudit?.status ?? null
    },
    lanes: {
      play: {
        label: 'Play',
        description: 'Local, ranked, tournaments, replays',
        routes: [
          { route: '/play', label: 'Play Hub', description: 'Game start, resume, and new match setup' },
          { route: '/play/new', label: 'New Game', description: 'Configure a match vs AI or online' },
          { route: '/play/academy', label: 'Academy', description: '5 sequential interactive lessons' },
          { route: '/puzzles', label: 'Puzzles', description: 'Progressive puzzle ladder' },
          { route: '/play/replays', label: 'Replay Library', description: 'Browse, watch, and verify replays' },
          { route: '/tournaments', label: 'Tournaments', description: 'AI bracket tournaments' },
          { route: '/seasons', label: 'Ranked Seasons', description: 'Ranked play, placements, and leaderboards' }
        ]
      },
      learn: {
        label: 'Learn',
        description: 'Academy, puzzles, rules, card reference',
        routes: [
          { route: '/rules', label: 'Rulebook', description: 'Complete player rulebook' },
          { route: '/play/academy', label: 'Academy', description: 'Interactive tutorial lessons' },
          { route: '/puzzles', label: 'Puzzles', description: 'Puzzle ladder with progression' },
          { route: '/cards', label: 'Card Reference', description: 'All 54 canonical card faces' }
        ]
      },
      lab: {
        label: 'Lab',
        description: 'Watch, Caster, mechanics, ranks, evidence, traces, branches, diagnostics',
        routes: [
          { route: '/watch', label: 'Watch', description: 'Match theatre' },
          { route: '/caster', label: 'Caster', description: 'Live replay broadcast' },
          { route: '/replays', label: 'Replays', description: 'Verification' },
          { route: '/history', label: 'History', description: 'Match ledger' },
          { route: '/mechanics', label: 'Mechanics', description: 'Atlas' },
          { route: '/synergies', label: 'Synergies', description: 'Relationships' },
          { route: '/ranks', label: 'Ranks', description: 'Power observatory' },
          { route: '/compare', label: 'Compare', description: 'Matched cohorts' },
          { route: '/traces', label: 'Traces', description: 'Decision intelligence' },
          { route: '/branches', label: 'Branches', description: 'Counterfactual lab' },
          { route: '/diagnostics', label: 'Diagnostics', description: 'Policy behavior' },
          { route: '/tournament', label: 'Tournament', description: 'AI bracket' },
          { route: '/evidence', label: 'Evidence', description: 'Integrity and provenance' },
          { route: '/intelligence', label: 'Analytics AI', description: 'Ollama interpretation' }
        ]
      }
    },
    limitations: deriveLimitations(manifest, releaseIdentity)
  };

  // Write the truth file
  const truthPath = path.join(root, 'config', 'capability-truth.json');
  await writeFile(truthPath, JSON.stringify(truth, null, 2) + '\n');
  console.log(`✅ Capability truth written to ${truthPath}`);
  console.log(`   version=${truth.product.version} engine=${truth.product.engineVersion} rules=${truth.product.rulesVersion}`);
  console.log(`   profiles=${truth.profiles.length} lanes=3 limitations=${truth.limitations.length}`);

  // Generate the feature matrix
  await generateFeatureMatrix(truth, root);

  // Generate README sections
  await generateReadmeSections(truth, root);

  // Generate Known Limitations
  await generateKnownLimitations(truth, root);
}

function deriveLimitations(manifest, releaseIdentity) {
  const limits = [];

  // Multiplayer
  if (manifest.canonicalMultiplayerModule.status === 'BLOCKED') {
    limits.push({
      id: 'MULTIPLAYER-01',
      severity: 'by-design',
      title: 'Canonical 3-4 player Multiplayer module is not available',
      detail: manifest.canonicalMultiplayerModule.note,
      reasonCode: manifest.canonicalMultiplayerModule.reasonCode
    });
  }

  // Optional modules
  const optionalModules = manifest.unsupportedCombinations.find(u => u.kind === 'OPTIONAL_MODULE_AUTONOMY');
  if (optionalModules && optionalModules.status === 'BLOCKED') {
    limits.push({
      id: 'OPTMODULES-01',
      severity: 'by-design',
      title: 'Optional modules are not available',
      detail: 'Optional game modules are blocked by scope freeze. The engine authority for optional modules is unavailable.',
      reasonCode: optionalModules.reasonCode
    });
  }

  // Event-level state stepping
  const eventStepping = manifest.unsupportedCombinations.find(u => u.kind === 'EVENT_LEVEL_STATE_STEPPING');
  if (eventStepping && eventStepping.status === 'BLOCKED') {
    limits.push({
      id: 'EVENTSTEP-01',
      severity: 'technical',
      title: 'Event-level state stepping is not available',
      detail: 'The engine does not expose event-level state snapshots. Replay stepping operates at the command level.',
      reasonCode: eventStepping.reasonCode
    });
  }

  // Advanced Core replay-only items
  const advanced = manifest.profiles.find(p => p.profileId === 'CORE_ADVANCED_2P');
  if (advanced && advanced.actionCoverage.replayOnly.length > 0) {
    limits.push({
      id: 'ADVANCED-REPLAY-ONLY',
      severity: 'profile-scope',
      title: 'Advanced Core has replay-only systems',
      detail: `In Advanced Core, the following systems are replay-only (not autonomously playable): ${advanced.actionCoverage.replayOnly.join(', ')}. Use Unrestricted Core for full autonomous play of these systems.`,
      items: advanced.actionCoverage.replayOnly
    });
  }

  // Browser-dependent tests
  limits.push({
    id: 'BROWSER-TESTS-01',
    severity: 'environment',
    title: 'Browser UI smoke and E2E certification require Chromium',
    detail: 'scripts/browser-ui-smoke.mjs and scripts/browser-e2e-certification.mjs require a Chromium binary. Without it, they write FAIL reports. Do not leave orphaned processes running.'
  });

  // Vendor engine directory
  limits.push({
    id: 'VENDOR-01',
    severity: 'environment',
    title: 'Vendor engine directory may not be present in all workspaces',
    detail: 'The integration test for 121 certified replays skips gracefully when vendor/intrilex-engine-4.1.0/ is absent.'
  });

  // Secret containment (pre-existing)
  limits.push({
    id: 'SEC-01-HISTORY',
    severity: 'security-debt',
    title: 'Git history contains a credential-bearing path (scripts/upload-key.cjs)',
    detail: 'The secret containment scan detects a credential-bearing path in 2 reachable commits. This requires Git history rewriting to fully resolve. The current working tree does not contain the credential.'
  });

  // Policy strength tiers not yet established
  limits.push({
    id: 'POLICY-TIER-01',
    severity: 'evidence',
    title: 'Lookahead, Tournament, and Human-meta-proxy policy tiers are not yet established',
    detail: 'All 20 policies are classified as Fixture, Baseline, or Heuristic. No policy has been benchmarked to Lookahead, Tournament, or Human-meta-proxy tier. Claims are qualified by the highest established tier.'
  });

  // Balance changes
  limits.push({
    id: 'BALANCE-01',
    severity: 'design',
    title: 'No numerical card balance changes have been introduced',
    detail: 'The balance investigation found that engine correctness and policy quality must be established before balance tuning. No card values, costs, or effects have been changed for balance reasons.'
  });

  // Spectator mode
  limits.push({
    id: 'SPECTATOR-01',
    severity: 'technical',
    title: 'Spectator mode uses NEUTRAL projection with a 50-spectator limit',
    detail: 'Spectators see a NEUTRAL projection of the game state — they do not see either player\'s authorized view. Spectator capacity is limited to 50 spectators per match.'
  });

  return limits;
}

async function generateFeatureMatrix(truth, root) {
  const lines = [];
  lines.push('# Feature Matrix');
  lines.push('');
  lines.push('> **AUTO-GENERATED** by `scripts/generate-capability-truth.mjs` from `config/capability-truth.json`.');
  lines.push(`> Generated: ${truth.generatedAt}`);
  lines.push(`> Version: ${truth.product.version} (${truth.product.releaseTitle})`);
  lines.push('');

  // Profiles
  lines.push('## Simulation Profiles');
  lines.push('');
  lines.push('| Profile | Engine ID | Autonomy | Players | Covered | Replay-Only | Blocked |');
  lines.push('|---------|-----------|----------|---------|---------|------------|---------|');
  for (const p of truth.profiles) {
    lines.push(`| ${p.displayName} | ${p.engineProfileId} | ${p.autonomy} | ${p.playerCounts.join(',')} | ${p.covered.length} systems | ${p.replayOnly.length ? p.replayOnly.join(', ') : '—'} | ${p.blocked.join(', ')} |`);
  }
  lines.push('');

  // Network
  lines.push('## Online Play');
  lines.push('');
  const n = truth.networkAuthority;
  lines.push(`- **Status:** ${n.status}`);
  lines.push(`- **Transport:** ${n.transport}`);
  lines.push(`- **Authority:** ${n.authority}`);
  lines.push(`- **Profiles:** ${manifest_profiles(truth)}`);
  lines.push('');
  lines.push('### Features');
  lines.push('');
  for (const [key, value] of Object.entries(n.features)) {
    if (typeof value === 'boolean') {
      lines.push(`- ${value ? '✅' : '❌'} ${key}`);
    } else if (typeof value === 'object') {
      lines.push(`- ${value.supported ? '✅' : '❌'} ${key} (enabled by default: ${value.enabledByDefault})`);
    }
  }
  lines.push('');

  // Lanes
  lines.push('## Product Lanes');
  lines.push('');
  for (const [laneId, lane] of Object.entries(truth.lanes)) {
    lines.push(`### ${lane.label} — ${lane.description}`);
    lines.push('');
    for (const r of lane.routes) {
      lines.push(`- [${r.label}](#${r.route}) — ${r.description}`);
    }
    lines.push('');
  }

  // Limitations
  lines.push('## Limitations');
  lines.push('');
  for (const l of truth.limitations) {
    lines.push(`### ${l.title}`);
    lines.push('');
    lines.push(`- **ID:** ${l.id}`);
    lines.push(`- **Severity:** ${l.severity}`);
    lines.push(`- **Detail:** ${l.detail}`);
    if (l.reasonCode) lines.push(`- **Reason code:** ${l.reasonCode}`);
    lines.push('');
  }

  const matrixPath = path.join(root, 'docs', 'FEATURE_MATRIX.md');
  await writeFile(matrixPath, lines.join('\n'));
  console.log(`✅ Feature matrix written to ${matrixPath}`);
}

function manifest_profiles(truth) {
  return truth.profiles.filter(p => p.autonomy === 'SUPPORTED').map(p => p.engineProfileId).join(', ');
}

async function generateReadmeSections(truth, root) {
  // Generate a JSON file with README sections that can be verified by tests
  const sections = {
    schemaVersion: '1.0.0',
    productSummary: `${truth.product.name} v${truth.product.version} — ${truth.product.releaseTitle}. Built on Intrilex Engine v${truth.product.engineVersion} under Official Rules v${truth.product.rulesVersion}.`,
    keyFacts: {
      version: truth.product.version,
      engineVersion: truth.product.engineVersion,
      rulesVersion: truth.product.rulesVersion,
      profileCount: truth.profiles.length,
      supportedProfiles: truth.profiles.filter(p => p.autonomy === 'SUPPORTED').map(p => p.displayName),
      networkStatus: truth.networkAuthority.status,
      multiplayerStatus: truth.multiplayer.status,
      testFileCount: truth.evidence.testFileCount,
      certifiedReplayCount: truth.evidence.certifiedReplayCount
    },
    lanes: truth.lanes,
    limitations: truth.limitations.map(l => ({ id: l.id, title: l.title, severity: l.severity }))
  };

  const sectionsPath = path.join(root, 'config', 'readme-truth.json');
  await writeFile(sectionsPath, JSON.stringify(sections, null, 2) + '\n');
  console.log(`✅ README truth sections written to ${sectionsPath}`);
}

async function generateKnownLimitations(truth, root) {
  const lines = [];
  lines.push(`# Known Limitations — ${truth.product.name} v${truth.product.version}`);
  lines.push('');
  lines.push('> **AUTO-GENERATED** by `scripts/generate-capability-truth.mjs` from `config/capability-truth.json`.');
  lines.push(`> Generated: ${truth.generatedAt}`);
  lines.push(`> Do not edit manually — run \`pnpm run capability:generate\` to regenerate.`);
  lines.push('');

  // Group by severity
  const bySeverity = {};
  for (const l of truth.limitations) {
    bySeverity[l.severity] = bySeverity[l.severity] || [];
    bySeverity[l.severity].push(l);
  }

  const severityOrder = ['by-design', 'technical', 'environment', 'security-debt', 'evidence', 'design', 'profile-scope'];
  const severityLabels = {
    'by-design': 'By Design (Scope Freeze)',
    'technical': 'Technical Limitations',
    'environment': 'Environment Limitations',
    'security-debt': 'Security Debt',
    'evidence': 'Evidence Limitations',
    'design': 'Design Decisions',
    'profile-scope': 'Profile Scope'
  };

  for (const sev of severityOrder) {
    if (!bySeverity[sev]) continue;
    lines.push(`## ${severityLabels[sev]}`);
    lines.push('');
    for (const l of bySeverity[sev]) {
      lines.push(`### ${l.title}`);
      lines.push('');
      lines.push(`- **ID:** ${l.id}`);
      lines.push(`- **Detail:** ${l.detail}`);
      if (l.reasonCode) lines.push(`- **Reason code:** \`${l.reasonCode}\``);
      if (l.items) lines.push(`- **Items:** ${l.items.join(', ')}`);
      lines.push('');
    }
  }

  // Browser-dependent tests note
  lines.push('## Browser-Dependent Tests');
  lines.push('');
  lines.push('Some tests require a Chromium binary:');
  lines.push('');
  lines.push('- `scripts/browser-ui-smoke.mjs` — writes a FAIL report without Chromium');
  lines.push('- `scripts/browser-e2e-certification.mjs` — requires Chrome/Chromium');
  lines.push('- Do not leave orphaned browser-smoke processes running');
  lines.push('');

  const klPath = path.join(root, 'KNOWN_LIMITATIONS.md');
  await writeFile(klPath, lines.join('\n'));
  console.log(`✅ Known Limitations written to ${klPath}`);
}

main().catch(err => {
  console.error('❌ Capability truth generation failed:', err);
  process.exit(1);
});
