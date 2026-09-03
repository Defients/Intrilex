// ═══════════════════════════════════════════════════════════════
// irx-c12-route-lifecycle.test.mjs — IRX-C12 route lifecycle cleanup
//
// Proves:
//   1. render() tracks the previous route
//   2. render() calls cleanupPlay() when transitioning from play → non-play
//   3. render() does NOT call cleanupPlay() when staying in play routes
//   4. cleanupPlay() exists and cleans up resources
//   5. app.js imports or lazy-loads cleanupPlay
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const appSrc = readFileSync(join(root, 'apps/lab-web/src/app.js'), 'utf8');
const playAppSrc = readFileSync(join(root, 'apps/lab-web/src/play/play-app.js'), 'utf8');

test('IRX-C12: app.js tracks previous route for lifecycle cleanup', () => {
  assert.ok(
    appSrc.includes('_previousRoute'),
    'app.js must track _previousRoute for route lifecycle cleanup'
  );
});

test('IRX-C12: render() calls cleanupPlay when transitioning from play to non-play', () => {
  assert.ok(
    appSrc.includes('isPlayRoute(_previousRoute)') &&
    appSrc.includes('!isPlayRoute(r)'),
    'render() must detect play → non-play transitions'
  );
  assert.ok(
    appSrc.includes('cleanupPlay'),
    'render() must call cleanupPlay on play → non-play transition'
  );
});

test('IRX-C12: cleanupPlay call is wrapped in try/catch for safety', () => {
  assert.ok(
    appSrc.includes('try { _playModule.cleanupPlay()') ||
    appSrc.match(/try\s*\{[^}]*cleanupPlay[^}]*\}/),
    'cleanupPlay call must be wrapped in try/catch to avoid breaking navigation on cleanup error'
  );
});

test('IRX-C12: cleanupPlay function exists in play-app.js', () => {
  assert.ok(
    playAppSrc.includes('export function cleanupPlay'),
    'play-app.js must export cleanupPlay function'
  );
});

test('IRX-C12: cleanupPlay cleans up critical resources', () => {
  // Verify cleanupPlay addresses the key resource leaks
  assert.ok(playAppSrc.includes('stopAutosave'), 'cleanupPlay must stop autosave timers');
  assert.ok(playAppSrc.includes('removeKeyboardShortcuts'), 'cleanupPlay must remove keyboard listeners');
  assert.ok(playAppSrc.includes('removeVisibilityHandler'), 'cleanupPlay must remove visibility handler');
  assert.ok(
    playAppSrc.includes('state.sound') && playAppSrc.includes('destroy'),
    'cleanupPlay must destroy sound engine'
  );
  assert.ok(
    playAppSrc.includes('state.particles') && playAppSrc.includes('destroy'),
    'cleanupPlay must destroy particle engine'
  );
  assert.ok(
    playAppSrc.includes('state.session = null'),
    'cleanupPlay must clear session reference'
  );
});

test('IRX-C12: _previousRoute is updated on every render() call', () => {
  // The _previousRoute must be set to the current route at the end of the
  // transition check, so the next render() call can compare against it.
  assert.ok(
    appSrc.includes('_previousRoute = r'),
    'render() must update _previousRoute to current route'
  );
});

// ── IRX-C12 residual: play-to-play sub-route cleanup ──

test('IRX-C12: handlePlayRoute tracks previous play sub-route', () => {
  assert.ok(
    playAppSrc.includes('_previousPlaySub'),
    'play-app.js must track _previousPlaySub for sub-route lifecycle cleanup'
  );
});

test('IRX-C12: handlePlayRoute cleans up resources on sub-route change', () => {
  assert.ok(
    playAppSrc.includes('_previousPlaySub !== sub') &&
    playAppSrc.includes('cleanupPlayResources'),
    'handlePlayRoute must call cleanupPlayResources when the sub-route changes'
  );
  assert.ok(
    playAppSrc.includes('_previousPlaySub = sub'),
    'handlePlayRoute must update _previousPlaySub after cleanup check'
  );
});

test('IRX-C12: cleanupPlayResources cleans up resources but preserves session', () => {
  assert.ok(
    playAppSrc.includes('function cleanupPlayResources'),
    'play-app.js must define cleanupPlayResources function'
  );
  // Extract the function body using a brace-matching approach
  const startIdx = playAppSrc.indexOf('function cleanupPlayResources()');
  assert.ok(startIdx >= 0, 'cleanupPlayResources function must exist');
  let braceStart = playAppSrc.indexOf('{', startIdx);
  let depth = 0;
  let endIdx = braceStart;
  for (let i = braceStart; i < playAppSrc.length; i++) {
    if (playAppSrc[i] === '{') depth++;
    else if (playAppSrc[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
  }
  const body = playAppSrc.slice(braceStart, endIdx);
  assert.ok(body.includes('stopAutosave'), 'cleanupPlayResources must stop autosave');
  assert.ok(body.includes('removeKeyboardShortcuts'), 'cleanupPlayResources must remove keyboard shortcuts');
  assert.ok(body.includes('removeVisibilityHandler'), 'cleanupPlayResources must remove visibility handler');
  assert.ok(body.includes('state.sound') && body.includes('destroy'), 'cleanupPlayResources must destroy sound engine');
  assert.ok(body.includes('state.particles') && body.includes('destroy'), 'cleanupPlayResources must destroy particle engine');
  // Must NOT clear state.session — that's cleanupPlay's job
  assert.ok(!body.includes('state.session = null'), 'cleanupPlayResources must NOT clear session reference');
});

test('IRX-C12: cleanupPlay delegates to cleanupPlayResources then clears session', () => {
  assert.ok(
    playAppSrc.includes('export function cleanupPlay'),
    'play-app.js must still export cleanupPlay function'
  );
  const cleanupMatch = playAppSrc.match(/export function cleanupPlay\(\)\s*\{([\s\S]*?)\}/);
  assert.ok(cleanupMatch, 'cleanupPlay must have a function body');
  const body = cleanupMatch[1];
  assert.ok(body.includes('cleanupPlayResources'), 'cleanupPlay must call cleanupPlayResources');
  assert.ok(body.includes('state.session = null'), 'cleanupPlay must clear session reference');
  assert.ok(body.includes('_previousPlaySub = null'), 'cleanupPlay must reset _previousPlaySub');
});

test('IRX-C12: sub-route cleanup is wrapped in try/catch for safety', () => {
  assert.ok(
    playAppSrc.match(/try\s*\{\s*cleanupPlayResources\s*\(\)/),
    'cleanupPlayResources call in handlePlayRoute must be wrapped in try/catch'
  );
});

test('IRX-C12: entering the canonical local match route re-arms persistence resources', () => {
  const matchBranch = playAppSrc.match(/else if \(sub === '\/match'\) \{([\s\S]*?)\n\s*await renderActiveMatch\(container\);/);
  assert.ok(matchBranch, 'handlePlayRoute must have a /match branch');
  const body = matchBranch[1];
  assert.ok(
    body.includes("state.leaseMode === 'CONTROLLED'"),
    'only the tab controlling the local session may re-arm persistence resources'
  );
  assert.ok(body.includes('startHeartbeat()'), '/match must re-arm the session lease heartbeat after sub-route cleanup');
  assert.ok(body.includes('startAutosave()'), '/match must re-arm rolling autosave after sub-route cleanup');
});
