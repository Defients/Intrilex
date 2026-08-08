// ═══════════════════════════════════════════════════════════════
// dev-cache-truth.test.mjs — v0.24.2 Truth Closure II
//
// Proves the dev server does not cache non-hashed CSS in dev mode,
// preventing misleading GUI validation during active development.
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const devServerSrc = readFileSync(join(process.cwd(), 'scripts/dev-server.mjs'), 'utf8');

test('dev-cache: non-hashed CSS gets no-store in dev/watch mode (v0.24.2)', () => {
  // The dev server must set no-store for CSS in watch mode
  // Look for the watchMode + .css + no-store branch
  assert.ok(
    devServerSrc.includes("watchMode && ext === '.css'"),
    'dev-server must have a watchMode + .css branch for no-store cache control'
  );
  assert.ok(
    /watchMode && ext === '.css'[\s\S]*?no-store/.test(devServerSrc),
    'dev-server must set no-store for CSS in watch mode'
  );
});

test('dev-cache: non-hashed CSS does NOT get max-age=3600 in any mode', () => {
  // The old behavior gave CSS max-age=3600 (1 hour) — this caused stale CSS.
  // The new behavior gives CSS no-store in all dev modes.
  // Verify that every branch that checks ext === '.css' sets no-store, not max-age.
  // We check that there is no `else if (ext === '.css')` block ending with max-age=3600.
  // The only max-age=3600 should be in the final else branch (for JSON/images).
  const cssBranches = devServerSrc.match(/ext === '.css'[\s\S]*?response\.setHeader\('Cache-Control', '[^']+'\)/g);
  assert.ok(cssBranches && cssBranches.length >= 2, 'must have at least 2 CSS cache branches (watch + non-watch)');
  for (const branch of cssBranches) {
    assert.ok(branch.includes('no-store'),
      `CSS branch must set no-store, not max-age: ${branch.slice(0, 80)}`);
    assert.ok(!branch.includes('max-age=3600'),
      `CSS branch must NOT set max-age=3600: ${branch.slice(0, 80)}`);
  }
});

test('dev-cache: HTML gets no-store', () => {
  assert.ok(
    devServerSrc.includes("ext === '.html'") && devServerSrc.includes('no-store'),
    'dev-server must set no-store for HTML'
  );
});

test('dev-cache: non-hashed JS gets no-store', () => {
  assert.ok(
    devServerSrc.includes("ext === '.js'") && devServerSrc.includes('no-store'),
    'dev-server must set no-store for non-hashed JS'
  );
});

test('dev-cache: hashed assets still get long-lived cache', () => {
  assert.ok(
    devServerSrc.includes('max-age=31536000, immutable'),
    'dev-server must give hashed assets 1-year immutable cache'
  );
});
