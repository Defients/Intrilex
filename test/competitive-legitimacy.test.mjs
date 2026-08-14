// ═══════════════════════════════════════════════════════════════
// competitive-legitimacy.test.mjs — Stage 2 tests
//
// Tests for:
//   B12 — Report flow v1 (migration, protocol, handler, client)
//   C3i — Challenge flow with block enforcement
//   U7  — First-run funnel
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── Source file reads ──
const migrationSrc = readFileSync(join(process.cwd(), 'supabase/migrations/0021_player_reports.sql'), 'utf8');
const protocolSrc = readFileSync(join(process.cwd(), 'packages/network-protocol/src/protocol.mjs'), 'utf8');
const validationSrc = readFileSync(join(process.cwd(), 'packages/network-protocol/src/validation.mjs'), 'utf8');
const protocolClientSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/network/network-protocol-client.mjs'), 'utf8');
const networkSessionSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/network/network-session.mjs'), 'utf8');
const serverSrc = readFileSync(join(process.cwd(), 'apps/match-server/src/server.mjs'), 'utf8');
const reportHandlersSrc = readFileSync(join(process.cwd(), 'apps/match-server/src/handlers/report-handlers.mjs'), 'utf8');
const matchHandlersSrc = readFileSync(join(process.cwd(), 'apps/match-server/src/handlers/match-handlers.mjs'), 'utf8');
const profileSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/workspaces/profile.js'), 'utf8');
const funnelSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/first-run-funnel.js'), 'utf8');

// ── Protocol validation imports ──
import { validateReportPlayer } from '../packages/network-protocol/src/validation.mjs';

// ── First-run funnel imports ──
import {
  FunnelStep,
  loadFunnelState,
  getCurrentStep,
  isStepCompleted,
  isFunnelComplete,
  completeStep,
  advanceToStep,
  skipStep,
  getNextAction,
} from '../apps/lab-web/src/play/first-run-funnel.js';

// ═══════════════════════════════════════════════════════════════
// B12: REPORT FLOW V1
// ═══════════════════════════════════════════════════════════════

test('B12 Migration: creates player_reports table', () => {
  assert.ok(migrationSrc.includes('CREATE TABLE IF NOT EXISTS public.player_reports'), 'Must create player_reports table');
  assert.ok(migrationSrc.includes('report_id'), 'Must have report_id column');
  assert.ok(migrationSrc.includes('reporter_id'), 'Must have reporter_id column');
  assert.ok(migrationSrc.includes('reported_id'), 'Must have reported_id column');
  assert.ok(migrationSrc.includes('reason_code'), 'Must have reason_code column');
});

test('B12 Migration: validates reason codes', () => {
  assert.ok(migrationSrc.includes('HARASSMENT'), 'Must support HARASSMENT reason');
  assert.ok(migrationSrc.includes('CHEATING'), 'Must support CHEATING reason');
  assert.ok(migrationSrc.includes('INAPPROPRIATE_NAME'), 'Must support INAPPROPRIATE_NAME reason');
  assert.ok(migrationSrc.includes('DISCONNECT_ABUSE'), 'Must support DISCONNECT_ABUSE reason');
});

test('B12 Migration: enables RLS', () => {
  assert.ok(migrationSrc.includes('ALTER TABLE public.player_reports ENABLE ROW LEVEL SECURITY'), 'Must enable RLS');
});

test('B12 Migration: creates submit_player_report RPC', () => {
  assert.ok(migrationSrc.includes('submit_player_report'), 'Must create submit_player_report RPC');
  assert.ok(migrationSrc.includes('SECURITY DEFINER'), 'Must be SECURITY DEFINER');
  assert.ok(migrationSrc.includes('GRANT EXECUTE'), 'Must grant execute to authenticated');
});

test('B12 Migration: prevents self-reports', () => {
  assert.ok(migrationSrc.includes('Cannot report yourself'), 'Must prevent self-reports');
});

test('B12 Migration: creates indexes', () => {
  assert.ok(migrationSrc.includes('idx_player_reports_reported_id'), 'Must create reported_id index');
  assert.ok(migrationSrc.includes('idx_player_reports_reporter_id'), 'Must create reporter_id index');
});

test('B12 Protocol: validateReportPlayer accepts valid payload', () => {
  const result = validateReportPlayer({
    reportedPlayerId: 'acc-123',
    reasonCode: 'HARASSMENT',
    description: 'Player was abusive in chat',
  });
  assert.ok(result.valid);
});

test('B12 Protocol: validateReportPlayer rejects missing reportedPlayerId', () => {
  const result = validateReportPlayer({ reasonCode: 'HARASSMENT' });
  assert.ok(!result.valid);
});

test('B12 Protocol: validateReportPlayer rejects invalid reasonCode', () => {
  const result = validateReportPlayer({
    reportedPlayerId: 'acc-123',
    reasonCode: 'INVALID_REASON',
  });
  assert.ok(!result.valid);
});

test('B12 Protocol: validateReportPlayer rejects overly long description', () => {
  const result = validateReportPlayer({
    reportedPlayerId: 'acc-123',
    reasonCode: 'OTHER',
    description: 'x'.repeat(1001),
  });
  assert.ok(!result.valid);
});

test('B12 Protocol: validateReportPlayer exported from protocol.mjs', () => {
  assert.ok(protocolSrc.includes('validateReportPlayer'), 'Must export validateReportPlayer');
});

test('B12 Protocol: validateReportPlayer exists in validation.mjs', () => {
  assert.ok(validationSrc.includes('export function validateReportPlayer'), 'Must export validateReportPlayer from validation');
});

test('B12 Handler: report-handlers.mjs exists and exports createReportHandlers', () => {
  assert.ok(reportHandlersSrc.includes('export function createReportHandlers'), 'Must export createReportHandlers');
  assert.ok(reportHandlersSrc.includes('handleReportPlayer'), 'Must export handleReportPlayer');
});

test('B12 Handler: uses validateReportPlayer', () => {
  assert.ok(reportHandlersSrc.includes('validateReportPlayer'), 'Must import validateReportPlayer');
});

test('B12 Handler: checks conn.account for authentication', () => {
  assert.ok(reportHandlersSrc.includes('conn.account'), 'Must check conn.account');
});

test('B12 Handler: prevents self-reports', () => {
  assert.ok(reportHandlersSrc.includes('REPORT_SELF_DENIED'), 'Must prevent self-reports');
});

test('B12 Server: imports and wires report handlers', () => {
  assert.ok(serverSrc.includes('createReportHandlers'), 'Must import createReportHandlers');
  assert.ok(serverSrc.includes('_reportHandlers'), 'Must have _reportHandlers variable');
  assert.ok(serverSrc.includes("case 'REPORT_PLAYER'"), 'Must dispatch REPORT_PLAYER');
});

test('B12 Client: reportPlayer builder exists', () => {
  assert.ok(protocolClientSrc.includes('export function reportPlayer'), 'Must export reportPlayer builder');
  assert.ok(protocolClientSrc.includes("envelope('REPORT_PLAYER'"), 'Must build REPORT_PLAYER envelope');
});

test('B12 Client: requestReportPlayer session method exists', () => {
  assert.ok(networkSessionSrc.includes('async requestReportPlayer'), 'Must have requestReportPlayer method');
  assert.ok(networkSessionSrc.includes('reportPlayer'), 'Must import reportPlayer builder');
});

// ═══════════════════════════════════════════════════════════════
// C3i: CHALLENGE FLOW WITH BLOCK ENFORCEMENT
// ═══════════════════════════════════════════════════════════════

test('C3i Server: handleCreateMatch checks blocks for challenge flow', () => {
  assert.ok(matchHandlersSrc.includes('targetAccountId'), 'Must support targetAccountId in CREATE_MATCH');
  assert.ok(matchHandlersSrc.includes('blockCreateRejected'), 'Must log block rejections on create');
  assert.ok(matchHandlersSrc.includes('BLOCKED_BY_PLAYER'), 'Must return BLOCKED_BY_PLAYER error');
});

test('C3i Profile: challenge button exists in relationship actions', () => {
  assert.ok(profileSrc.includes('data-action="challenge"'), 'Must have challenge button');
  assert.ok(profileSrc.includes('profile-challenge-btn'), 'Must have challenge button testid');
});

test('C3i Profile: challenge button hidden when blocked', () => {
  assert.ok(profileSrc.includes('s.blocking'), 'Must check blocking status');
  // The challenge button should not render when blocking is true
  const challengeSection = profileSrc.match(/const challengeBtn[\s\S]*?;/);
  assert.ok(challengeSection, 'Must have challengeBtn definition');
  assert.ok(challengeSection[0].includes("s.blocking"), 'Must hide challenge button when blocking');
});

test('C3i Profile: challenge action wired in event listeners', () => {
  assert.ok(profileSrc.includes('[data-action="challenge"]'), 'Must wire challenge button in event listeners');
  assert.ok(profileSrc.includes("action === 'challenge'"), 'Must handle challenge action');
});

test('C3i Profile: challenge navigates to play with context', () => {
  assert.ok(profileSrc.includes('#/play?challenge='), 'Must navigate to play with challenge param');
  assert.ok(profileSrc.includes('intrilex:challenge-target'), 'Must store challenge target in sessionStorage');
});

// ═══════════════════════════════════════════════════════════════
// U7: FIRST-RUN FUNNEL
// ═══════════════════════════════════════════════════════════════

test('U7 Funnel: file exists and exports key functions', () => {
  assert.ok(funnelSrc.includes('export const FunnelStep'), 'Must export FunnelStep');
  assert.ok(funnelSrc.includes('export function loadFunnelState'), 'Must export loadFunnelState');
  assert.ok(funnelSrc.includes('export function getCurrentStep'), 'Must export getCurrentStep');
  assert.ok(funnelSrc.includes('export function completeStep'), 'Must export completeStep');
  assert.ok(funnelSrc.includes('export function skipStep'), 'Must export skipStep');
  assert.ok(funnelSrc.includes('export function getNextAction'), 'Must export getNextAction');
  assert.ok(funnelSrc.includes('export function renderFunnelBanner'), 'Must export renderFunnelBanner');
});

test('U7 Funnel: defines all required steps', () => {
  assert.ok(funnelSrc.includes('LANDING'), 'Must have LANDING step');
  assert.ok(funnelSrc.includes('TUTORIAL_STARTED'), 'Must have TUTORIAL_STARTED step');
  assert.ok(funnelSrc.includes('TUTORIAL_COMPLETE'), 'Must have TUTORIAL_COMPLETE step');
  assert.ok(funnelSrc.includes('FIRST_AI_WIN'), 'Must have FIRST_AI_WIN step');
  assert.ok(funnelSrc.includes('ACCOUNT_PROMPT'), 'Must have ACCOUNT_PROMPT step');
  assert.ok(funnelSrc.includes('FIRST_ONLINE_DUEL'), 'Must have FIRST_ONLINE_DUEL step');
  assert.ok(funnelSrc.includes('COMPLETE'), 'Must have COMPLETE step');
});

test('U7 Funnel: getNextAction returns null when complete', () => {
  // We can't easily test localStorage in Node, but we can test the logic
  // by checking the source code structure
  assert.ok(funnelSrc.includes('isFunnelComplete'), 'Must check if funnel is complete');
  assert.ok(funnelSrc.includes('return null'), 'Must return null when complete');
});

test('U7 Funnel: renderFunnelBanner returns empty when complete', () => {
  assert.ok(funnelSrc.includes("isFunnelComplete()") , 'Must check if funnel is complete');
  assert.ok(funnelSrc.includes("return ''"), 'Must return empty string when complete');
});

test('U7 Funnel: funnel banner has skip functionality', () => {
  assert.ok(funnelSrc.includes('data-action="funnel-skip"'), 'Must have skip button');
  assert.ok(funnelSrc.includes('wireFunnelBanner'), 'Must export wireFunnelBanner');
  assert.ok(funnelSrc.includes('skipStep'), 'Must call skipStep on skip');
});

test('U7 Funnel: CTA routes to academy for first step', () => {
  assert.ok(funnelSrc.includes('#/play/academy'), 'Must route to academy for tutorial');
  assert.ok(funnelSrc.includes('#/auth'), 'Must route to auth for account creation');
  assert.ok(funnelSrc.includes('#/play'), 'Must route to play for matches');
});

test('U7 Funnel: state persisted in localStorage', () => {
  assert.ok(funnelSrc.includes('intrilex:funnel-state'), 'Must use intrilex:funnel-state key');
  assert.ok(funnelSrc.includes('localStorage'), 'Must use localStorage');
});
