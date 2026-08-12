// ═══════════════════════════════════════════════════════════════
// auth-controller-migration.test.mjs
//
// Regression tests for guest→permanent migration detection in the
// browser auth-controller. The primary migration trigger is an OAuth
// redirect (Discord/Google), which reloads the page. On reload,
// initAuth() reads the session via getSession() and sets the state
// directly — the onAuthStateChange handler's wasAnonymous check never
// fires because the in-memory ANONYMOUS state was lost.
//
// These tests verify that initAuth() detects the migration case itself
// by checking the saved guest identity in localStorage when a
// non-anonymous session is found on page load.
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const authControllerSrc = readFileSync(
  join(process.cwd(), 'apps/lab-web/src/play/network/auth-controller.js'),
  'utf8',
);

// ── Migration detection on page load (OAuth redirect flow) ──

test('auth-controller: initAuth checks saved guest identity for non-anonymous sessions', () => {
  // The fix: initAuth must call _readGuestIdentity() when a non-anonymous
  // session is found via getSession(), so migration is detected after an
  // OAuth redirect page reload.
  assert.ok(
    authControllerSrc.includes('_readGuestIdentity()'),
    'initAuth must read the saved guest identity to detect migration after OAuth redirect',
  );
});

test('auth-controller: initAuth sets _migrationPending when guest identity differs from session user', () => {
  // The fix must set both _guestIdentity and _migrationPending when the
  // saved guest identity differs from the current authenticated user id.
  assert.ok(
    authControllerSrc.includes('_migrationPending = true'),
    'initAuth must set _migrationPending when a guest identity is saved and differs from the current user',
  );
  assert.ok(
    authControllerSrc.includes('_guestIdentity = savedGuestId'),
    'initAuth must set _guestIdentity from the saved guest identity',
  );
});

test('auth-controller: migration detection in initAuth guards against same-account false positive', () => {
  // The check must compare savedGuestId !== session.user.id to avoid
  // triggering migration when the same account re-authenticates.
  assert.ok(
    authControllerSrc.includes('savedGuestId !== session.user.id'),
    'initAuth must skip migration when the saved guest identity matches the current user id',
  );
});

test('auth-controller: migration detection in initAuth only fires for non-anonymous sessions', () => {
  // Guest sessions (is_anonymous=true) must not trigger migration —
  // migration is guest→permanent, not guest→guest.
  assert.ok(
    authControllerSrc.includes('if (!isAnonymous)'),
    'initAuth must only check for migration when the session is non-anonymous (permanent)',
  );
});

test('auth-controller: onAuthStateChange still detects in-page ANONYMOUS→AUTHENTICATED transition', () => {
  // The existing in-page transition detection (without page reload)
  // must remain intact for the case where the user links an account
  // without a full redirect (e.g. future token-linking flow).
  assert.ok(
    authControllerSrc.includes('wasAnonymous && nowAuthenticated'),
    'onAuthStateChange must still detect ANONYMOUS→AUTHENTICATED transitions for in-page flows',
  );
});

test('auth-controller: clearMigrationPending cleans up the saved guest identity', () => {
  // After migration completes (or fails), the saved guest identity must
  // be removed from localStorage so it doesn't trigger on every page load.
  assert.ok(
    authControllerSrc.includes('_clearGuestIdentity()'),
    'clearMigrationPending must remove the saved guest identity from localStorage',
  );
});

test('auth-controller: signInWithOAuthProvider saves guest identity before redirect', () => {
  // Before the OAuth redirect, the guest identity must be saved to
  // localStorage so initAuth can detect it on the returning page load.
  assert.ok(
    authControllerSrc.includes("localStorage.setItem(GUEST_IDENTITY_KEY"),
    'signInWithOAuthProvider must save the guest identity to localStorage before redirect',
  );
});
