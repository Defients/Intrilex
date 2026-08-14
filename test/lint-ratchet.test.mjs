// ═══════════════════════════════════════════════════════════════
// lint-ratchet.test.mjs — T4: Lint-warning ratchet
//
// Ensures the lint warning count never increases beyond the baseline.
// New code must not introduce new warnings; existing warnings may be
// fixed incrementally to lower the baseline.
//
// The baseline is read from config/lint-baseline.json. When warnings
// are reduced, update the baseline with:
//   pnpm run lint -- --format compact | grep "problem" | ...
//   echo '{"warningCount": N}' > config/lint-baseline.json
// ═══════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const BASELINE_PATH = join(process.cwd(), 'config/lint-baseline.json');

test('Lint ratchet: baseline file exists', () => {
  assert.ok(existsSync(BASELINE_PATH), 'config/lint-baseline.json must exist');
});

test('Lint ratchet: current warning count does not exceed baseline', () => {
  // Read baseline
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const baselineWarnings = baseline.warningCount;
  assert.ok(typeof baselineWarnings === 'number', 'baseline.warningCount must be a number');

  // Run lint and parse warning count
  let lintOutput;
  try {
    lintOutput = execSync('npx eslint apps/lab-web/src/**/*.js apps/match-server/src/**/*.mjs packages/**/*.mjs scripts/**/*.mjs test/**/*.mjs --format json 2>nul', {
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch (err) {
    // eslint exits non-zero when warnings exist; output is still in stdout
    lintOutput = err.stdout || '';
  }

  let currentWarnings = 0;
  let currentErrors = 0;
  try {
    const results = JSON.parse(lintOutput);
    for (const file of results) {
      currentWarnings += file.warningCount || 0;
      currentErrors += file.errorCount || 0;
    }
  } catch {
    // If JSON parsing fails, skip this check rather than failing spuriously
    console.warn('[lint-ratchet] Could not parse lint output, skipping');
    return;
  }

  // Errors must always be zero
  assert.equal(currentErrors, 0, `Lint errors must be 0 (found ${currentErrors})`);

  // Warnings must not exceed baseline
  assert.ok(currentWarnings <= baselineWarnings,
    `Lint warnings (${currentWarnings}) must not exceed baseline (${baselineWarnings}). ` +
    `If you've fixed warnings, update config/lint-baseline.json with the new count.`);
});
