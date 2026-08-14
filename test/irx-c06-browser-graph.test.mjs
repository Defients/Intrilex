// ═══════════════════════════════════════════════════════════════
// irx-c06-browser-graph.test.mjs — IRX-C06: Browser graph backedge repair
//
// Proves:
//   1. No workspace module dynamically imports app.js
//   2. A rerender.js bus module exists
//   3. app.js registers its render function with the bus
//   4. Workspace modules import rerender from the bus, not app.js
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const workspacesDir = join(root, 'apps/lab-web/src/workspaces');

test('IRX-C06: rerender.js bus module exists', () => {
  assert.ok(
    existsSync(join(root, 'apps/lab-web/src/rerender.js')),
    'rerender.js bus module must exist'
  );
  const src = readFileSync(join(root, 'apps/lab-web/src/rerender.js'), 'utf8');
  assert.ok(src.includes('export function setRenderer'), 'must export setRenderer');
  assert.ok(src.includes('export function rerender'), 'must export rerender');
});

test('IRX-C06: app.js registers render with the bus', () => {
  const src = readFileSync(join(root, 'apps/lab-web/src/app.js'), 'utf8');
  assert.ok(
    src.includes("from './rerender.js'") && src.includes('setRenderer'),
    'app.js must import setRenderer and register render with the bus'
  );
});

test('IRX-C06: no workspace module dynamically imports app.js', () => {
  const files = readdirSync(workspacesDir).filter(f => f.endsWith('.js'));
  let violations = [];
  for (const file of files) {
    const src = readFileSync(join(workspacesDir, file), 'utf8');
    // Check for dynamic import of app.js (excluding comments)
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('//')) continue; // Skip comment lines
      if (line.includes("import('../app.js')") || line.includes('import("../app.js")')) {
        violations.push(`${file}:${i + 1}`);
      }
    }
  }
  assert.equal(violations.length, 0,
    `No workspace module should dynamically import app.js (found: ${violations.join(', ')})`
  );
});

test('IRX-C06: workspace modules import rerender from the bus', () => {
  const files = readdirSync(workspacesDir).filter(f => f.endsWith('.js'));
  let modulesUsingRerender = 0;
  for (const file of files) {
    const src = readFileSync(join(workspacesDir, file), 'utf8');
    if (src.includes("from '../rerender.js'")) {
      modulesUsingRerender++;
    }
  }
  // At least observatory.js, branches.js, tournament.js, ranks.js, evidence.js, diagnostics.js
  assert.ok(modulesUsingRerender >= 5,
    `At least 5 workspace modules should import from rerender.js (found ${modulesUsingRerender})`
  );
});

test('IRX-C06: rerender bus has no backedge to app.js', () => {
  const src = readFileSync(join(root, 'apps/lab-web/src/rerender.js'), 'utf8');
  // Check for actual import statements (not comments)
  const importLines = src.split('\n').filter(l => l.trim().startsWith('import '));
  for (const line of importLines) {
    assert.ok(
      !line.includes('app.js'),
      `rerender.js must NOT import app.js (found: ${line.trim()})`
    );
  }
});

// ── IRX-C06 residual: fail-safe diagnostics and replay ──

test('IRX-C06: rerender bus warns when called before registration', () => {
  const src = readFileSync(join(root, 'apps/lab-web/src/rerender.js'), 'utf8');
  assert.ok(
    src.includes('console.warn') && src.includes('before setRenderer'),
    'rerender() must emit a diagnostic warning when called before setRenderer()'
  );
});

test('IRX-C06: rerender bus replays missed calls on registration', () => {
  const src = readFileSync(join(root, 'apps/lab-web/src/rerender.js'), 'utf8');
  assert.ok(
    src.includes('_missedCount'),
    'rerender bus must track missed calls before registration'
  );
  assert.ok(
    src.includes('_missedCount > 0') && src.includes('fn()'),
    'setRenderer must replay a render call if calls were missed during boot'
  );
});

test('IRX-C06: rerender bus warning fires only once to avoid console spam', () => {
  const src = readFileSync(join(root, 'apps/lab-web/src/rerender.js'), 'utf8');
  assert.ok(
    src.includes('_warned'),
    'rerender bus must track whether the warning has already fired'
  );
  assert.ok(
    src.includes('if (!_warned)'),
    'warning must only fire once (rate-limited by _warned flag)'
  );
});

test('IRX-C06: clearRenderer resets diagnostic state for testing', () => {
  const src = readFileSync(join(root, 'apps/lab-web/src/rerender.js'), 'utf8');
  assert.ok(
    src.includes('_missedCount = 0') && src.includes('_warned = false'),
    'clearRenderer must reset _missedCount and _warned for clean test isolation'
  );
});
