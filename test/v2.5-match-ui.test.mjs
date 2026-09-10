// v2.5 Match UI — focused tests for the Intrilex Match UI v2.5 upgrade.
// Tests behavior, not cosmetic trivia. Verifies:
//   §4A: viewport ownership (max-width cap on ultra-wide)
//   §4G: draw pile depletion visual tiers
//   §4J: AI opponent displayName no longer leaks raw policyId; difficulty chip
//   §4F: event log actor labels rewritten to You/opponent name
//   §4E: resolution stack empty-state copy (calm, focal)
//   §4D: action rail legal-action count prompt
//   §4L: submission error shows shortText + detailedText with icon
//   Privacy: depletion tiers and difficulty chip don't leak hidden info
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const cssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/ranked-duel.css'), 'utf8');
const rendererSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/ranked-duel-renderer.mjs'), 'utf8');
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

// ── §4G: Draw pile depletion visual ──────────────────────────────

test('§4G: renderPileCard emits data-depletion attribute on draw pile', () => {
  assert.ok(
    rendererSrc.includes('data-depletion='),
    'Renderer must emit data-depletion attribute on draw pile'
  );
  assert.ok(
    /depletionTier = 'depleted'/.test(rendererSrc),
    'Renderer must classify depleted (0 cards) tier'
  );
  assert.ok(
    /depletionTier = 'low'/.test(rendererSrc),
    'Renderer must classify low (≤4) tier'
  );
  assert.ok(
    /depletionTier = 'medium'/.test(rendererSrc),
    'Renderer must classify medium (≤12) tier'
  );
  assert.ok(
    /depletionTier = 'high'/.test(rendererSrc),
    'Renderer must classify high (>12) tier'
  );
});

test('§4G: draw pile exhaustion shows explicit "Exhausted" text cue', () => {
  assert.ok(
    rendererSrc.includes('rd-pile-exhausted'),
    'Renderer must emit exhausted text cue for depleted draw pile'
  );
  assert.ok(
    rendererSrc.includes('Draw pile exhausted'),
    'Exhausted cue must have accessible label'
  );
});

test('§4G: CSS has depletion tier border accents', () => {
  assert.ok(cssSrc.includes('[data-depletion="low"]'), 'CSS must style low depletion tier');
  assert.ok(cssSrc.includes('[data-depletion="depleted"]'), 'CSS must style depleted tier');
  assert.ok(cssSrc.includes('.rd-pile-stack'), 'CSS must style the stacked cardback layers');
  assert.ok(cssSrc.includes('.rd-pile-exhausted'), 'CSS must style the exhausted cue');
});

test('§4G: draw pile depletion tiers do not expose card identities', () => {
  // The depletion tier is derived from the public draw count only — it never
  // reads or exposes individual card identities from the draw pile.
  const tierBlock = rendererSrc.match(/let depletionTier = ''[\s\S]*?depletionAttr/);
  assert.ok(tierBlock, 'Depletion tier block must exist');
  // The tier logic only branches on `count` and `dataPile`, never on card content.
  assert.ok(
    !tierBlock[0].includes('topCard') && !tierBlock[0].includes('.identity'),
    'Depletion tier must not read card identities'
  );
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

test('§4J: renderer shows difficulty chip in profile meta line', () => {
  assert.ok(
    rendererSrc.includes('rd-plate-difficulty'),
    'Renderer must emit rd-plate-difficulty chip'
  );
  assert.ok(
    rendererSrc.includes('difficultyChip'),
    'Renderer must compute a difficultyChip variable'
  );
  assert.ok(
    /rd-prestige-banner-meta.*difficultyChip/.test(rendererSrc),
    'Difficulty chip must appear in the prestige banner meta line'
  );
});

test('§4J: CSS styles the difficulty chip', () => {
  assert.ok(cssSrc.includes('.rd-plate-difficulty'), 'CSS must style .rd-plate-difficulty');
});

test('§4J: difficulty chip does not leak hidden information', () => {
  // The difficulty is a public attribute of the AI policy, not hidden info.
  // Verify the chip only renders for AI opponents (not local player, not network human).
  const chipMatch = rendererSrc.match(/difficultyChip[\s\S]*?`/);
  assert.ok(chipMatch, 'difficultyChip must be defined');
  assert.ok(
    chipMatch[0].includes('!isLocal') && chipMatch[0].includes('!plate.isHuman'),
    'Difficulty chip must only render for AI opponents'
  );
});

// ── §4F: Event log actor labels ──────────────────────────────────

test('§4F: renderer has buildActorLabelRewriter function', () => {
  assert.ok(
    rendererSrc.includes('function buildActorLabelRewriter'),
    'Renderer must have buildActorLabelRewriter to rewrite Player 1/2 → You/opponent'
  );
  assert.ok(
    rendererSrc.includes("'Player 1'"),
    'Rewriter must map Player 1 label'
  );
  assert.ok(
    rendererSrc.includes("'Player 2'"),
    'Rewriter must map Player 2 label'
  );
});

test('§4F: renderGameLog accepts actor label rewriter and humanPlayerId', () => {
  assert.ok(
    /renderGameLog[\s\S]*?rewriteActorLabel/.test(rendererSrc),
    'renderGameLog must use the rewriteActorLabel argument'
  );
  assert.ok(
    /renderGameLog[\s\S]*?humanPlayerId/.test(rendererSrc),
    'renderGameLog must use the humanPlayerId argument for actor badges'
  );
});

test('§4F: actor badge shows YOU for the human player', () => {
  assert.ok(
    rendererSrc.includes("'YOU'"),
    'Actor badge must show YOU for the human player'
  );
});

test('§4F: renderMatch passes the rewriter to renderGameLog', () => {
  assert.ok(
    /renderGameLog\([^)]*buildActorLabelRewriter/.test(rendererSrc),
    'renderMatch must pass buildActorLabelRewriter to renderGameLog'
  );
});

// ── §4E: Resolution stack empty state ────────────────────────────

test('§4E: empty resolution stack uses calm focal copy, not "Stack is empty"', () => {
  assert.ok(
    !rendererSrc.includes('>Stack is empty<'),
    'Empty stack must not say "Stack is empty" — use calmer focal language'
  );
  assert.ok(
    rendererSrc.includes('No pending effects'),
    'Empty stack must say "No pending effects" or similar focal copy'
  );
  assert.ok(
    rendererSrc.includes('focalLine'),
    'Empty stack must compute a focalLine based on priority owner'
  );
});

// ── §4D: Action rail legal-action count prompt ───────────────────

test('§4D: action rail overview shows legal action count prompt', () => {
  assert.ok(
    rendererSrc.includes('rd-action-prompt'),
    'Action rail must emit rd-action-prompt element'
  );
  assert.ok(
    rendererSrc.includes('legal action'),
    'Prompt must use "legal action(s)" copy'
  );
  assert.ok(
    /legalCount\s*=\s*groups\.filter/.test(rendererSrc),
    'Legal count must be derived from action groups'
  );
});

test('§4D: prompt uses "legal actions" not "actions offered"', () => {
  const promptMatch = rendererSrc.match(/rd-action-prompt[^`]*`/);
  assert.ok(promptMatch, 'Prompt must exist');
  assert.ok(
    promptMatch[0].includes('legal action'),
    'Prompt copy must say "legal action(s)"'
  );
  assert.ok(
    !promptMatch[0].includes('offered'),
    'Prompt must not use "offered" copy'
  );
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

// ── Privacy audit ────────────────────────────────────────────────

test('Privacy: opponent hand still renders card backs, not identities', () => {
  assert.ok(
    rendererSrc.includes('rd-card-back'),
    'Opponent hand must render card backs'
  );
  assert.ok(
    /renderOpponentHand[\s\S]*?aria-hidden="true"/.test(rendererSrc),
    'Opponent hand card backs must be aria-hidden'
  );
});

test('Privacy: depletion tier derives from public count only', () => {
  // The tier thresholds (0/4/12) are based on the public draw count,
  // which is already authorized for the viewing player. No card identities
  // from the draw pile are read by the depletion logic.
  const tierBlock = rendererSrc.match(/let depletionTier = ''[\s\S]*?depletionAttr/);
  assert.ok(tierBlock, 'Depletion tier block must exist');
  assert.ok(
    !tierBlock[0].includes('topCard') && !tierBlock[0].includes('.identity'),
    'Depletion tier must not read card identities from the draw pile'
  );
});

test('Privacy: difficulty chip only renders for AI opponents, not network humans', () => {
  // Verified in §4J test above; this is a redundant privacy assertion.
  const chipSrc = rendererSrc.match(/difficultyChip = [\s\S]*?`/);
  assert.ok(chipSrc, 'difficultyChip must be defined');
  assert.ok(
    chipSrc[0].includes('!plate.isHuman'),
    'Difficulty chip must not render for human opponents (no difficulty concept)'
  );
});
