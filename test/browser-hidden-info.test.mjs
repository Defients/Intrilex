import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// BL-10: Smoke test must require opponent zone to exist and use correct card selector
test('BL-10: smoke test requires P2 board and hand zone to exist', async () => {
  const src = await readFile(path.join(root, 'scripts/browser-ui-smoke.mjs'), 'utf8');
  assert.ok(src.includes('NO_P2_BOARD'),
    'smoke test must fail if P2 board is not found');
  assert.ok(src.includes('NO_HAND_ZONE'),
    'smoke test must fail if hand zone is not found');
  assert.ok(src.includes('NO_CARDS_IN_HAND'),
    'smoke test must report if no cards in hand');
  assert.ok(src.includes('.card-token'),
    'smoke test must use .card-token selector, not .card b');
  // Old selector pattern was `.card b` used in querySelectorAll — comment mentions it but doesn't use it
  assert.ok(!src.includes("querySelectorAll('.card b')") && !src.includes('querySelectorAll(".card b")'),
    'smoke test must not use stale .card b selector (BL-10)');
  // Must set viewer to player-authorized (P1 perspective) so P2 is the opponent
  assert.ok(src.includes("el.value='player'"),
    'smoke test must set viewer to player-authorized so P2 is the opponent');
});

// BL-23: Integrity badges must be conditional, not unconditional
test('BL-23: Watch view verified badge is conditional on certified hash', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/integrity.js'), 'utf8');
  assert.ok(src.includes('hasCapabilityHash'),
    'Integrity dialog must check for capability hash before showing verified status');
  assert.ok(src.includes('statusLabel'),
    'Integrity dialog must use conditional statusLabel variable');
  assert.ok(src.includes('NOT_VERIFIED'),
    'Integrity dialog must show NOT_VERIFIED badge when no certified hash');
  // Must not have unconditional Verified badge (i.e., hardcoded without a conditional)
  // The conditional form uses template variables: status-badge ${statusClass}">${statusLabel}
  assert.ok(!/status-badge supported">PASS<\/span>/.test(src),
    'Integrity dialog must not have unconditional hardcoded PASS badge (BL-23)');
});

// BL-23: Integrity dialog must show conditional verified status
test('BL-23: Integrity dialog shows conditional verified status', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/integrity.js'), 'utf8');
  assert.ok(src.includes('hasCapabilityHash'),
    'Integrity dialog must check capability hash');
  assert.ok(src.includes('hasObservatoryHash'),
    'Integrity dialog must check observatory hash');
  assert.ok(src.includes('NOT_VERIFIED'),
    'Integrity dialog must show NOT_VERIFIED when hashes absent');
  assert.ok(src.includes('PASS'),
    'Integrity dialog must show PASS when all hashes present');
});

// BL-12: Integrity dialog must not hardcode version 0.10.0
test('BL-12: Integrity dialog uses capability manifest version, not hardcoded 0.10.0', async () => {
  const src = await readFile(path.join(root, 'apps/lab-web/src/integrity.js'), 'utf8');
  assert.ok(!src.includes("'0.10.0 Decision Intelligence'"),
    'Integrity dialog must not hardcode 0.10.0 version (BL-12)');
  assert.ok(src.includes('labVersion'),
    'Integrity dialog must use labVersion from capability manifest');
});
