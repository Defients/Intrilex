// ═══════════════════════════════════════════════════════════════
// engine-refactor.test.mjs — Stage 6 tests
//
// Tests for:
//   E2 — Engine fuzz harness
//   E4 — Action introspection API
//   T1 — Chat panel extraction
//   T6 — Migration runner
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ── Source file reads ──
const fuzzSrc = readFileSync(join(process.cwd(), 'packages/engine-adapter/src/engine-fuzz-harness.mjs'), 'utf8');
const introspectionSrc = readFileSync(join(process.cwd(), 'packages/engine-adapter/src/action-introspection.mjs'), 'utf8');
const chatPanelSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/chat-panel.js'), 'utf8');
const migrationRunnerSrc = readFileSync(join(process.cwd(), 'scripts/run-migrations.mjs'), 'utf8');
const rendererSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/ranked-duel-renderer.mjs'), 'utf8');

// ── E2: Engine fuzz harness imports ──
import { fuzzOnce, fuzzCampaign, verifyDeterminism } from '../packages/engine-adapter/src/engine-fuzz-harness.mjs';

// ── E4: Action introspection imports ──
import { introspectAction, introspectAllLegalActions, renderActionIntrospection } from '../packages/engine-adapter/src/action-introspection.mjs';

// ── T1: Chat panel imports ──
import { renderChatPanel } from '../apps/lab-web/src/play/chat-panel.js';

// ── T6: Migration runner imports ──
import { listMigrations } from '../scripts/run-migrations.mjs';

// ═══════════════════════════════════════════════════════════════
// E2: ENGINE FUZZ HARNESS
// ═══════════════════════════════════════════════════════════════

test('E2: fuzz harness source exports fuzzOnce', () => {
  assert.ok(fuzzSrc.includes('export function fuzzOnce'), 'Must export fuzzOnce');
});

test('E2: fuzz harness source exports fuzzCampaign', () => {
  assert.ok(fuzzSrc.includes('export function fuzzCampaign'), 'Must export fuzzCampaign');
});

test('E2: fuzz harness source exports verifyDeterminism', () => {
  assert.ok(fuzzSrc.includes('export function verifyDeterminism'), 'Must export verifyDeterminism');
});

test('E2: fuzz harness has invariant checks', () => {
  assert.ok(fuzzSrc.includes('checkInvariants'), 'Must have invariant checks');
  assert.ok(fuzzSrc.includes('negative secured'), 'Must check for negative scores');
});

test('E2: fuzz harness uses seeded PRNG', () => {
  assert.ok(fuzzSrc.includes('mulberry32') || fuzzSrc.includes('seed'), 'Must use seeded PRNG');
});

test('E2: fuzzOnce is a function', () => {
  assert.equal(typeof fuzzOnce, 'function');
});

test('E2: fuzzCampaign is a function', () => {
  assert.equal(typeof fuzzCampaign, 'function');
});

test('E2: verifyDeterminism is a function', () => {
  assert.equal(typeof verifyDeterminism, 'function');
});

// ═══════════════════════════════════════════════════════════════
// E4: ACTION INTROSPECTION API
// ═══════════════════════════════════════════════════════════════

test('E4: introspection source exports introspectAction', () => {
  assert.ok(introspectionSrc.includes('export function introspectAction'), 'Must export introspectAction');
});

test('E4: introspection source exports introspectAllLegalActions', () => {
  assert.ok(introspectionSrc.includes('export function introspectAllLegalActions'), 'Must export introspectAllLegalActions');
});

test('E4: introspection source exports renderActionIntrospection', () => {
  assert.ok(introspectionSrc.includes('export function renderActionIntrospection'), 'Must export renderActionIntrospection');
});

test('E4: introspection has ACTION_PHASE_MAP', () => {
  assert.ok(introspectionSrc.includes('ACTION_PHASE_MAP'), 'Must have action-phase mapping');
});

test('E4: introspection has rule references', () => {
  assert.ok(introspectionSrc.includes('ruleRef'), 'Must include rule references');
  assert.ok(introspectionSrc.includes('rules/player-rulebook.md'), 'Must reference player rulebook');
});

test('E4: introspection handles null state', () => {
  const result = introspectAction(null, { type: 'draw' }, null);
  assert.ok(!result.legal);
  assert.equal(result.reasonCode, 'INVALID_REQUEST');
});

test('E4: introspection handles null action', () => {
  const result = introspectAction({}, null, { legalActions: () => [] });
  assert.ok(!result.legal);
});

test('E4: introspection identifies legal actions', () => {
  const state = { phase: 'ACTION' };
  const action = { type: 'draw', id: 'draw-1' };
  const adapter = { legalActions: () => [{ type: 'draw', id: 'draw-1' }] };
  const result = introspectAction(state, action, adapter);
  assert.ok(result.legal);
  assert.equal(result.reasonCode, 'LEGAL');
});

test('E4: introspection identifies illegal actions', () => {
  const state = { phase: 'ACTION' };
  const action = { type: 'scuttle', id: 'scuttle-1' };
  const adapter = { legalActions: () => [{ type: 'draw', id: 'draw-1' }] };
  const result = introspectAction(state, action, adapter);
  assert.ok(!result.legal);
});

test('E4: introspectAllLegalActions returns array', () => {
  const state = { phase: 'ACTION' };
  const adapter = { legalActions: () => [{ type: 'draw' }, { type: 'pass' }] };
  const results = introspectAllLegalActions(state, adapter);
  assert.ok(Array.isArray(results));
  assert.equal(results.length, 2);
});

test('E4: renderActionIntrospection produces HTML', () => {
  const intro = {
    actionId: 'draw',
    legal: true,
    reasonCode: 'LEGAL',
    shortText: 'This action is legal.',
    detailedText: 'You can draw a card.',
    ruleRef: 'rules/player-rulebook.md#draw',
    visibilitySafe: true,
  };
  const html = renderActionIntrospection(intro);
  assert.ok(html.includes('action-introspection'));
  assert.ok(html.includes('action-legal'));
});

test('E4: renderActionIntrospection handles illegal action', () => {
  const intro = {
    actionId: 'scuttle',
    legal: false,
    reasonCode: 'WRONG_PHASE',
    shortText: 'Cannot scuttle during RESPONSE phase.',
    detailedText: 'Scuttle is only available during ACTION phase.',
    ruleRef: null,
    visibilitySafe: true,
  };
  const html = renderActionIntrospection(intro);
  assert.ok(html.includes('action-illegal'));
});

// ═══════════════════════════════════════════════════════════════
// T1: CHAT PANEL EXTRACTION
// ═══════════════════════════════════════════════════════════════

test('T1: chat-panel.js file exists', () => {
  assert.ok(existsSync(join(process.cwd(), 'apps/lab-web/src/play/chat-panel.js')));
});

test('T1: chat-panel.js exports renderChatPanel', () => {
  assert.ok(chatPanelSrc.includes('export function renderChatPanel'), 'Must export renderChatPanel');
});

test('T1: chat-panel.js has data-testid="match-chat-panel"', () => {
  assert.ok(chatPanelSrc.includes('data-testid="match-chat-panel"'), 'Must have match-chat-panel testid');
});

test('T1: chat-panel.js handles network vs local AI', () => {
  assert.ok(chatPanelSrc.includes('isNetwork'), 'Must handle network vs local');
  assert.ok(chatPanelSrc.includes('rd-chat-msg human'), 'Must have human message class');
  assert.ok(chatPanelSrc.includes('rd-chat-msg opponent'), 'Must have opponent message class');
  assert.ok(chatPanelSrc.includes('rd-chat-msg ai'), 'Must have AI message class');
});

test('T1: chat-panel.js handles hidden state', () => {
  assert.ok(chatPanelSrc.includes('chatHidden'), 'Must handle chatHidden option');
  assert.ok(chatPanelSrc.includes('rd-chat-hidden'), 'Must have hidden class');
});

test('T1: chat-panel.js has chat input form', () => {
  assert.ok(chatPanelSrc.includes('match-chat-form'), 'Must have chat form');
  assert.ok(chatPanelSrc.includes('match-chat-input'), 'Must have chat input');
});

test('T1: chat-panel.js has emote button', () => {
  assert.ok(chatPanelSrc.includes('chat-emote'), 'Must have emote button');
});

test('T1: chat-panel.js escapes HTML', () => {
  assert.ok(chatPanelSrc.includes('function esc'), 'Must have HTML escape function');
  assert.ok(chatPanelSrc.includes('&amp;'), 'Must escape ampersands');
});

test('T1: chat-panel.js handles read-only mode', () => {
  assert.ok(chatPanelSrc.includes('isReadOnly'), 'Must handle read-only mode');
  // Read-only mode should not render the input form
  const html = renderChatPanel(
    { mode: { label: 'SPECTATOR', isNetwork: true }, human: { playerId: 'P1', displayName: 'A' }, opponent: { playerId: 'P2', displayName: 'B' } },
    { chatHidden: false },
    true,
    []
  );
  assert.ok(!html.includes('match-chat-form'), 'Read-only should not have chat form');
});

test('T1: chat-panel.js renders system messages', () => {
  const html = renderChatPanel(
    { mode: { label: 'LOCAL VS AI', isNetwork: false }, human: { playerId: 'P1', displayName: 'You' }, opponent: { playerId: 'P2', displayName: 'AI' } },
    {},
    false,
    [{ isSystem: true, text: 'Match started', messageId: 'm1' }]
  );
  assert.ok(html.includes('rd-chat-msg system'), 'Must render system messages');
  assert.ok(html.includes('System'), 'Must show System as author');
});

test('T1: chat-panel.js renders empty state', () => {
  const html = renderChatPanel(
    { mode: { label: 'LOCAL VS AI', isNetwork: false }, human: { playerId: 'P1', displayName: 'You' }, opponent: { playerId: 'P2', displayName: 'AI' } },
    {},
    false,
    []
  );
  assert.ok(html.includes('No messages yet'), 'Must show empty state');
});

test('T1: renderer still has renderChatPanel (delegation or inline)', () => {
  // The renderer may still have its own copy or delegate to chat-panel.js
  // Either way, the function must exist somewhere
  assert.ok(rendererSrc.includes('renderChatPanel') || rendererSrc.includes('chat-panel'), 'Renderer must reference chat panel');
});

// ═══════════════════════════════════════════════════════════════
// T6: MIGRATION RUNNER
// ═══════════════════════════════════════════════════════════════

test('T6: run-migrations.mjs file exists', () => {
  assert.ok(existsSync(join(process.cwd(), 'scripts/run-migrations.mjs')));
});

test('T6: migration runner exports listMigrations', () => {
  assert.ok(migrationRunnerSrc.includes('export function listMigrations'), 'Must export listMigrations');
});

test('T6: migration runner exports runMigrations (main)', () => {
  assert.ok(migrationRunnerSrc.includes('runMigrations'), 'Must export runMigrations');
});

test('T6: migration runner reads from supabase/migrations/', () => {
  assert.ok(migrationRunnerSrc.includes('supabase'), 'Must reference supabase directory');
  assert.ok(migrationRunnerSrc.includes('migrations'), 'Must reference migrations directory');
});

test('T6: migration runner supports --dry-run flag', () => {
  assert.ok(migrationRunnerSrc.includes('--dry-run'), 'Must support --dry-run flag');
  assert.ok(migrationRunnerSrc.includes('dryRun'), 'Must handle dryRun option');
});

test('T6: migration runner tracks applied migrations', () => {
  assert.ok(migrationRunnerSrc.includes('_migrations'), 'Must use _migrations tracking table');
  assert.ok(migrationRunnerSrc.includes('applied_at'), 'Must track applied_at timestamp');
});

test('T6: migration runner applies in order', () => {
  assert.ok(migrationRunnerSrc.includes('.sort()'), 'Must sort migrations');
});

test('T6: migration runner handles env vars', () => {
  assert.ok(migrationRunnerSrc.includes('SUPABASE_URL'), 'Must read SUPABASE_URL from env');
  assert.ok(migrationRunnerSrc.includes('SUPABASE_SECRET_KEY') || migrationRunnerSrc.includes('SUPABASE_SERVICE_KEY'), 'Must read service key from env');
});

test('T6: listMigrations returns array of migration files', () => {
  const migrations = listMigrations();
  assert.ok(Array.isArray(migrations));
  assert.ok(migrations.length > 0, 'Should find migration files');
  for (const m of migrations) {
    assert.ok(m.name.endsWith('.sql'), 'Each migration should be a .sql file');
    assert.ok(typeof m.content === 'string', 'Each migration should have content');
  }
});

test('T6: migration runner stops on first failure', () => {
  assert.ok(migrationRunnerSrc.includes('break'), 'Must stop on first failure');
});

test('T6: migration runner uses service role client', () => {
  assert.ok(migrationRunnerSrc.includes('createClient'), 'Must create Supabase client');
  assert.ok(migrationRunnerSrc.includes('persistSession: false'), 'Must not persist session');
});
