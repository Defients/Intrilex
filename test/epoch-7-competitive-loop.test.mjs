// ═══════════════════════════════════════════════════════════════
// epoch-7-competitive-loop.test.mjs — Tests for Epoch 7 features
//
// 1. Human tournament discovery UI (#/tournaments)
// 2. Tournament protocol builders (client-side)
// 3. Match stats persistence (IndexedDB store)
// 4. Replay branching UI integration (profile match history)
// 5. Fingerprint coverage indicator
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const routerSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/router.js'), 'utf8');
const appSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/app.js'), 'utf8');
const seoSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/seo-metadata.js'), 'utf8');
const cssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/play-v3.css'), 'utf8');
const protocolClientSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/network/network-protocol-client.mjs'), 'utf8');
const networkSessionSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/network/network-session.mjs'), 'utf8');
const humanTournamentsSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/workspaces/human-tournaments.js'), 'utf8');
const persistenceSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/persistence.js'), 'utf8');
const profileSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/workspaces/profile.js'), 'utf8');
const playersCssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/players/players.css'), 'utf8');

// ── 1. Human Tournament Discovery UI ──

test('Tournament UI: /tournaments route in LANDING_MODES', () => {
  assert.ok(routerSrc.includes("'/tournaments'"), 'Router must include /tournaments in LANDING_MODES');
});

test('Tournament UI: /tournaments route handler in app.js', () => {
  assert.ok(appSrc.includes("r === '/tournaments'"), 'App must handle /tournaments route');
  assert.ok(appSrc.includes('renderHumanTournaments'), 'App must call renderHumanTournaments');
});

test('Tournament UI: workspace module exists with correct exports', () => {
  assert.ok(humanTournamentsSrc.includes('export async function renderHumanTournaments'), 'Must export renderHumanTournaments');
  assert.ok(humanTournamentsSrc.includes('export function destroyHumanTournaments'), 'Must export destroyHumanTournaments');
});

test('Tournament UI: has panel and testids', () => {
  assert.ok(humanTournamentsSrc.includes('data-testid="ht-panel"'), 'Must have panel testid');
  assert.ok(humanTournamentsSrc.includes('data-testid="ht-title"'), 'Must have title testid');
  assert.ok(humanTournamentsSrc.includes('data-testid="ht-grid"'), 'Must have grid testid');
  assert.ok(humanTournamentsSrc.includes('data-testid="ht-card"'), 'Must have card testid');
});

test('Tournament UI: handles offline and empty states', () => {
  assert.ok(humanTournamentsSrc.includes('data-testid="ht-offline"'), 'Must have offline state');
  assert.ok(humanTournamentsSrc.includes('data-testid="ht-empty"'), 'Must have empty state');
  assert.ok(humanTournamentsSrc.includes('data-testid="ht-loading"'), 'Must have loading state');
  assert.ok(humanTournamentsSrc.includes('data-testid="ht-error"'), 'Must have error state');
});

test('Tournament UI: uses state.networkSession', () => {
  assert.ok(humanTournamentsSrc.includes('state.networkSession'), 'Must use state.networkSession');
  assert.ok(humanTournamentsSrc.includes('requestTournamentList'), 'Must call requestTournamentList');
  assert.ok(humanTournamentsSrc.includes('requestTournamentGet'), 'Must call requestTournamentGet');
  assert.ok(humanTournamentsSrc.includes('requestTournamentRegister'), 'Must call requestTournamentRegister');
});

test('Tournament UI: has bracket viewer', () => {
  assert.ok(humanTournamentsSrc.includes('data-testid="ht-bracket"'), 'Must have bracket testid');
  assert.ok(humanTournamentsSrc.includes('data-testid="ht-bracket-match"'), 'Must have bracket match testid');
  assert.ok(humanTournamentsSrc.includes('data-testid="ht-participants"'), 'Must have participants testid');
});

test('Tournament UI: has detail view with back button', () => {
  assert.ok(humanTournamentsSrc.includes('data-testid="ht-detail"'), 'Must have detail testid');
  assert.ok(humanTournamentsSrc.includes('data-testid="ht-back-btn"'), 'Must have back button');
  assert.ok(humanTournamentsSrc.includes('data-testid="ht-detail-register-btn"'), 'Must have register button in detail');
});

test('Tournament SEO: /tournaments page has metadata', () => {
  assert.ok(seoSrc.includes("'/tournaments'"), 'SEO must include /tournaments route');
  assert.ok(seoSrc.includes('Tournaments'), 'SEO must mention Tournaments');
});

test('Tournament CSS: styles exist', () => {
  assert.ok(cssSrc.includes('.ht-panel'), 'CSS must have .ht-panel');
  assert.ok(cssSrc.includes('.ht-card'), 'CSS must have .ht-card');
  assert.ok(cssSrc.includes('.ht-bracket-match'), 'CSS must have bracket match');
  assert.ok(cssSrc.includes('.ht-status-badge'), 'CSS must have status badge');
});

// ── 2. Tournament Protocol Builders ──

test('Protocol client: tournamentList builder exists', () => {
  assert.ok(protocolClientSrc.includes('export function tournamentList'), 'Must export tournamentList');
  assert.ok(protocolClientSrc.includes("envelope('TOURNAMENT_LIST'"), 'Must build TOURNAMENT_LIST envelope');
});

test('Protocol client: tournamentGet builder exists', () => {
  assert.ok(protocolClientSrc.includes('export function tournamentGet'), 'Must export tournamentGet');
  assert.ok(protocolClientSrc.includes("envelope('TOURNAMENT_GET'"), 'Must build TOURNAMENT_GET envelope');
});

test('Protocol client: tournamentRegister builder exists', () => {
  assert.ok(protocolClientSrc.includes('export function tournamentRegister'), 'Must export tournamentRegister');
  assert.ok(protocolClientSrc.includes("envelope('TOURNAMENT_REGISTER'"), 'Must build TOURNAMENT_REGISTER envelope');
});

// ── 3. NetworkPlaySession Tournament Methods ──

test('NetworkSession: imports tournament builders', () => {
  assert.ok(networkSessionSrc.includes('tournamentList'), 'Must import tournamentList');
  assert.ok(networkSessionSrc.includes('tournamentGet'), 'Must import tournamentGet');
  assert.ok(networkSessionSrc.includes('tournamentRegister'), 'Must import tournamentRegister');
});

test('NetworkSession: requestTournamentList method exists', () => {
  assert.ok(networkSessionSrc.includes('async requestTournamentList'), 'Must have requestTournamentList method');
});

test('NetworkSession: requestTournamentGet method exists', () => {
  assert.ok(networkSessionSrc.includes('async requestTournamentGet'), 'Must have requestTournamentGet method');
});

test('NetworkSession: requestTournamentRegister method exists', () => {
  assert.ok(networkSessionSrc.includes('async requestTournamentRegister'), 'Must have requestTournamentRegister method');
});

// ── 4. Match Stats Collection ──

test('Persistence: DB_VERSION bumped to 5', () => {
  assert.ok(persistenceSrc.includes('DB_VERSION = 5'), 'DB_VERSION must be 5 for match-stats store');
});

test('Persistence: MATCH_STATS store defined', () => {
  assert.ok(persistenceSrc.includes("MATCH_STATS: 'match-stats'"), 'Must define MATCH_STATS store');
});

test('Persistence: match-stats object store created on upgrade', () => {
  assert.ok(persistenceSrc.includes("STORES.MATCH_STATS"), 'Must create match-stats store on upgrade');
});

test('Persistence: putMatchStats function exists', () => {
  assert.ok(persistenceSrc.includes('export async function putMatchStats'), 'Must export putMatchStats');
});

test('Persistence: getMatchStats function exists', () => {
  assert.ok(persistenceSrc.includes('export async function getMatchStats'), 'Must export getMatchStats');
});

test('Persistence: listMatchStats function exists', () => {
  assert.ok(persistenceSrc.includes('export async function listMatchStats'), 'Must export listMatchStats');
});

test('Persistence: deleteMatchStats function exists', () => {
  assert.ok(persistenceSrc.includes('export async function deleteMatchStats'), 'Must export deleteMatchStats');
});

test('NetworkSession: _collectMatchStats method exists', () => {
  assert.ok(networkSessionSrc.includes('_collectMatchStats'), 'Must have _collectMatchStats method');
});

test('NetworkSession: calls _collectMatchStats on MATCH_ENDED', () => {
  assert.ok(networkSessionSrc.includes("this._collectMatchStats(msg.payload)"), 'Must call _collectMatchStats on MATCH_ENDED');
});

test('NetworkSession: _collectMatchStats persists to IndexedDB', () => {
  assert.ok(networkSessionSrc.includes("putMatchStats"), 'Must persist match stats via putMatchStats');
});

// ── 5. Replay Branching UI Integration ──

test('Profile: branch button in match items', () => {
  assert.ok(profileSrc.includes('data-action="branch-match-replay"'), 'Must have branch-match-replay action');
  assert.ok(profileSrc.includes('profile-match-branch-btn'), 'Must have branch button class');
});

test('Profile: wireMatchBranchButtons function exists', () => {
  assert.ok(profileSrc.includes('function wireMatchBranchButtons'), 'Must have wireMatchBranchButtons function');
  assert.ok(profileSrc.includes('wireMatchBranchButtons()'), 'Must call wireMatchBranchButtons in wireHeroActions');
});

test('Profile: branch button uses buildReplayBranchSummary', () => {
  assert.ok(profileSrc.includes('buildReplayBranchSummary'), 'Must use buildReplayBranchSummary from domain');
});

test('Profile: branch button navigates to /branches', () => {
  assert.ok(profileSrc.includes("location.hash = '#/branches'"), 'Must navigate to /branches');
});

test('Profile: branch context stored in state.branchContext', () => {
  assert.ok(profileSrc.includes('state.branchContext'), 'Must store branch context in state');
  assert.ok(profileSrc.includes("source: 'player'"), 'Must label source as player');
});

// ── 6. Fingerprint Coverage Indicator ──

test('Profile: fingerprint coverage indicator exists', () => {
  assert.ok(profileSrc.includes('data-testid="profile-fingerprint-coverage"'), 'Must have coverage testid');
  assert.ok(profileSrc.includes('coverageCount'), 'Must compute coverage count');
  assert.ok(profileSrc.includes('Based on'), 'Must show "Based on N matches" label');
  assert.ok(profileSrc.includes('Estimated from ranked record'), 'Must show fallback label');
});

test('Profile: loads match stats from IndexedDB', () => {
  assert.ok(profileSrc.includes('listMatchStats'), 'Must call listMatchStats from persistence');
  assert.ok(profileSrc.includes('replayStats'), 'Must store replayStats on localProfile');
});

test('Players CSS: fingerprint coverage style exists', () => {
  assert.ok(playersCssSrc.includes('.profile-fingerprint-coverage'), 'CSS must have .profile-fingerprint-coverage');
});
