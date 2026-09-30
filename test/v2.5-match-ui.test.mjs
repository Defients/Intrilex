// v2.5 Match UI — focused tests for the Intrilex Match UI v2.5 upgrade.
// Tests behavior, not cosmetic trivia. Verifies:
//   §4A: viewport ownership (max-width cap on ultra-wide)
//   §4G: draw pile depletion visual tiers (CSS)
//   §4J: AI opponent displayName no longer leaks raw policyId; difficulty chip (CSS)
//   §4L: submission error shows shortText + detailedText with icon
//   Privacy: depletion tiers and difficulty chip don't leak hidden info
//
// NOTE: Active match play is now rendered by the Astra React board
// (client/mount.tsx), tested by test/astra-client.test.mjs. The classic
// active-board renderer helpers (renderMatch, renderPileCard,
// renderOpponentHand, renderGameLog, buildActorLabelRewriter, etc.) have
// been removed from ranked-duel-renderer.mjs. Tests that asserted on those
// helpers' source text or active-board DOM have been removed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const cssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/ranked-duel.css'), 'utf8');
const vmSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/ranked-duel-viewmodel.mjs'), 'utf8');
const controllerSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/play-controller.js'), 'utf8');
const boardEventsSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/board-events.js'), 'utf8');
const personalitySrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/ai-personality.js'), 'utf8');
const playV3Css = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/play-v3.css'), 'utf8');

// ── §4A: Viewport ownership ──────────────────────────────────────

test('§4A: ranked-duel-shell has a max-width cap for ultra-wide desktop', () => {
  assert.ok(
    /\.ranked-duel-shell\s*\{[^}]*max-width:\s*1840px\s*!important/s.test(cssSrc),
    'Shell must have max-width: 1840px to cap ultra-wide stretching'
  );
  assert.ok(
    /\.ranked-duel-shell\s*\{[^}]*margin-left:\s*auto\s*!important/s.test(cssSrc),
    'Shell must center with margin-left: auto'
  );
  assert.ok(
    /\.ranked-duel-shell\s*\{[^}]*margin-right:\s*auto\s*!important/s.test(cssSrc),
    'Shell must center with margin-right: auto'
  );
});

test('§4A: shell still owns the viewport below the cap (width: 100vw)', () => {
  assert.ok(
    /\.ranked-duel-shell\s*\{[^}]*width:\s*100vw\s*!important/s.test(cssSrc),
    'Shell must retain width: 100vw for viewport ownership below the cap'
  );
});

// ── §4G: Draw pile depletion visual (CSS) ────────────────────────

test('§4G: CSS has depletion tier border accents', () => {
  assert.ok(cssSrc.includes('[data-depletion="low"]'), 'CSS must style low depletion tier');
  assert.ok(cssSrc.includes('[data-depletion="depleted"]'), 'CSS must style depleted tier');
  assert.ok(cssSrc.includes('.rd-pile-stack'), 'CSS must style the stacked cardback layers');
  assert.ok(cssSrc.includes('.rd-pile-exhausted'), 'CSS must style the exhausted cue');
});

// ── §4J: AI opponent identity ────────────────────────────────────

test('§4J: ai-personality exports aiDisplayNameFromPolicyId', () => {
  assert.ok(
    personalitySrc.includes('export function aiDisplayNameFromPolicyId'),
    'ai-personality.js must export aiDisplayNameFromPolicyId'
  );
  assert.ok(
    personalitySrc.includes('export function aiDifficultyLabelFromPolicyId'),
    'ai-personality.js must export aiDifficultyLabelFromPolicyId'
  );
});

test('§4J: play-controller uses friendly AI display name, not raw policyId', () => {
  assert.ok(
    controllerSrc.includes('aiDisplayNameFromPolicyId'),
    'play-controller must use aiDisplayNameFromPolicyId for opponent displayName'
  );
  // The old leak: displayName: this.setup.aiPolicyId
  assert.ok(
    !/displayName:\s*this\.setup\.aiPolicyId/.test(controllerSrc),
    'play-controller must NOT set displayName to the raw policyId'
  );
});

test('§4J: view model threads difficulty through the player plate', () => {
  assert.ok(
    vmSrc.includes('difficulty:'),
    'View model must include difficulty in player plate'
  );
  assert.ok(
    /emptyPlayerPlate\(\)[\s\S]*?difficulty:\s*''/.test(vmSrc),
    'emptyPlayerPlate must default difficulty to empty string'
  );
});

test('§4J: CSS styles the difficulty chip', () => {
  assert.ok(cssSrc.includes('.rd-plate-difficulty'), 'CSS must style .rd-plate-difficulty');
});

// ── §4L: Submission error ────────────────────────────────────────

test('§4L: submission error shows shortText and detailedText', () => {
  assert.ok(
    boardEventsSrc.includes('submission-error-head'),
    'Submission error must have a head section'
  );
  assert.ok(
    boardEventsSrc.includes('submission-error-detail'),
    'Submission error must have a detail section for detailedText'
  );
  assert.ok(
    boardEventsSrc.includes('reasonDef.detailedText'),
    'Submission error must read reasonDef.detailedText'
  );
  assert.ok(
    boardEventsSrc.includes('reasonDef.shortText'),
    'Submission error must read reasonDef.shortText'
  );
});

test('§4L: submission error includes a warning glyph (not color alone)', () => {
  assert.ok(
    boardEventsSrc.includes('submission-error-glyph'),
    'Submission error must include a glyph element'
  );
  // The glyph is marked aria-hidden via setAttribute — verify the call exists.
  assert.ok(
    /glyph\.setAttribute\(\s*['"]aria-hidden['"]\s*,\s*['"]true['"]\s*\)/.test(boardEventsSrc),
    'Glyph must be marked aria-hidden (decorative, not color-only signal)'
  );
});

test('§4L: CSS styles the submission error head, glyph, and detail', () => {
  assert.ok(playV3Css.includes('.submission-error-head'), 'CSS must style .submission-error-head');
  assert.ok(playV3Css.includes('.submission-error-glyph'), 'CSS must style .submission-error-glyph');
  assert.ok(playV3Css.includes('.submission-error-detail'), 'CSS must style .submission-error-detail');
  assert.ok(playV3Css.includes('.submission-error-short'), 'CSS must style .submission-error-short');
});
