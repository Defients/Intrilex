// Layout invariant test — verifies CSS Grid topology for the ranked duel interface.
// Ensures every major grid cell has an explicit named area in grid-template-areas.
// This test would have caught the "swap missing from grid-template-areas" bug.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const cssSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/ranked-duel.css'), 'utf8');
const rendererSrc = readFileSync(join(process.cwd(), 'apps/lab-web/src/play/ranked-duel-renderer.mjs'), 'utf8');

// ── Required grid areas ──────────────────────────────────────────
// Every direct child of the duel grid MUST have one of these named areas.
// v0.25: Removed scoreSpine — score integrated into prestige banners
const requiredAreas = {
  '.rd-header': 'header',
  '.rd-enemy-enduring': 'enemyE',
  '.rd-enemy-points': 'enemyP',
  '.rd-enemy-profile': 'enemyProfile',
  '.rd-piles': 'piles',
  '.rd-swap': 'swap',
  '.rd-stage': 'stage',
  '.rd-stack': 'stack',
  '.rd-chat': 'chat',
  '.rd-gamelog': 'gamelog',
  '.rd-player-enduring': 'playerE',
  '.rd-player-points': 'playerP',
  '.rd-player-profile': 'playerPro',
  '.rd-player-hand': 'playerH',
  '.rd-actions': 'actions',
};

// ── Tests ────────────────────────────────────────────────────────

test('CSS: grid-template-areas contains all required area names', () => {
  const areasBlock = cssSrc.match(/grid-template-areas:\s*([\s\S]*?)!/);
  assert.ok(areasBlock, 'grid-template-areas must exist in CSS');
  const areasText = areasBlock[1];

  for (const [selector, areaName] of Object.entries(requiredAreas)) {
    assert.ok(
      areasText.includes(areaName),
      `grid-template-areas must contain "${areaName}" (for ${selector}) — was missing`
    );
  }
});

test('CSS: swap area exists in grid-template-areas (regression: was missing)', () => {
  const areasBlock = cssSrc.match(/grid-template-areas:\s*([\s\S]*?)!/);
  assert.ok(areasBlock, 'grid-template-areas must exist');
  assert.ok(areasBlock[1].includes('swap'), 'swap MUST be in grid-template-areas');
});

test('CSS: every required selector has an explicit grid-area assignment', () => {
  for (const [selector, areaName] of Object.entries(requiredAreas)) {
    const pattern = new RegExp(
      `${selector.replace(/\./g, '\\.')}\\s*\\{[^}]*grid-area:\\s*${areaName}\\s*!important`,
      's'
    );
    assert.ok(
      pattern.test(cssSrc),
      `${selector} must have grid-area: ${areaName} — was missing or set to auto`
    );
  }
});

test('CSS: no grid cell has grid-area: auto', () => {
  // Check that no .rd-* selector resolves to auto
  const autoPattern = /\.rd-[\w-]+\s*\{[^}]*grid-area:\s*auto/s;
  assert.ok(
    !autoPattern.test(cssSrc),
    'No .rd-* grid cell should have grid-area: auto — all must have explicit named areas'
  );
});

test('CSS: enemyE and enemyP have equal column span (7 each, v0.25)', () => {
  const areasBlock = cssSrc.match(/grid-template-areas:\s*([\s\S]*?)!/);
  assert.ok(areasBlock);
  const lines = areasBlock[1].split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Find the enemy row (contains enemyE and enemyP but not enemyProfile)
  const enemyRow = lines.find(l => l.includes('enemyE') && l.includes('enemyP'));
  assert.ok(enemyRow, 'Must have a row with both enemyE and enemyP');

  // Use word-boundary matching to avoid enemyP matching inside enemyProfile
  const enemyECount = (enemyRow.match(/\benemyE\b/g) || []).length;
  const enemyPCount = (enemyRow.match(/\benemyP\b/g) || []).length;
  assert.equal(enemyECount, enemyPCount, `enemyE (${enemyECount}) and enemyP (${enemyPCount}) should have equal span`);
});

test('CSS: playerE and playerP have equal column span (7 each, v0.25)', () => {
  const areasBlock = cssSrc.match(/grid-template-areas:\s*([\s\S]*?)!/);
  assert.ok(areasBlock);
  const lines = areasBlock[1].split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const playerRow = lines.find(l => l.includes('playerE') && l.includes('playerP'));
  assert.ok(playerRow, 'Must have a row with both playerE and playerP');

  const playerECount = (playerRow.match(/\bplayerE\b/g) || []).length;
  const playerPCount = (playerRow.match(/\bplayerP\b/g) || []).length;
  assert.equal(playerECount, playerPCount, `playerE (${playerECount}) and playerP (${playerPCount}) should have equal span`);
});

test('CSS: stack spans both middle rows (utility + battlefield)', () => {
  const areasBlock = cssSrc.match(/grid-template-areas:\s*([\s\S]*?)!/);
  assert.ok(areasBlock);
  const lines = areasBlock[1].split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const stackRows = lines.filter(l => l.includes('stack'));
  assert.ok(stackRows.length >= 2, 'stack should span at least 2 rows');
});

test('CSS: gamelog is in the battlefield row (same row as stage)', () => {
  const areasBlock = cssSrc.match(/grid-template-areas:\s*([\s\S]*?)!/);
  assert.ok(areasBlock);
  const lines = areasBlock[1].split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const gamelogRow = lines.find(l => l.includes('gamelog') && l.includes('stage'));
  assert.ok(gamelogRow, 'gamelog should be in the same row as stage (battlefield row)');
});

test('CSS: playerPro is in the bottom row (same row as playerH)', () => {
  const areasBlock = cssSrc.match(/grid-template-areas:\s*([\s\S]*?)!/);
  assert.ok(areasBlock);
  const lines = areasBlock[1].split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const bottomRow = lines.find(l => l.includes('playerPro') && l.includes('playerH'));
  assert.ok(bottomRow, 'playerPro should be in the bottom row with playerH');
});

test('CSS: no dynamic :has() grid reorganization', () => {
  // The :has() selector that changes grid-template-areas was removed
  // because it caused the entire board to reorganize when stack content changed
  const hasPattern = /\.ranked-duel-shell:has\([^)]*\)\s*\{[^}]*grid-template-areas/s;
  assert.ok(
    !hasPattern.test(cssSrc),
    'No dynamic :has() grid reorganization — stack should have a stable home'
  );
});

test('CSS: scoreSpine removed from grid (v0.25 — integrated into prestige banners)', () => {
  const areasBlock = cssSrc.match(/grid-template-areas:\s*([\s\S]*?)!/);
  assert.ok(areasBlock, 'grid-template-areas must exist in CSS');
  assert.ok(!areasBlock[1].includes('scoreSpine'),
    'grid-template-areas must NOT contain "scoreSpine" — removed v0.25 (score in banners)');
});

test('CSS: prestige banner styles exist (v0.25)', () => {
  assert.ok(cssSrc.includes('rd-prestige-banner'), 'Must have .rd-prestige-banner class');
  assert.ok(cssSrc.includes('rd-prestige-banner-score'), 'Must have score in banner');
});

test('CSS: responsive card size variables exist', () => {
  assert.ok(cssSrc.includes('--hand-card-w'), 'Must have --hand-card-w variable');
  assert.ok(cssSrc.includes('--board-card-w'), 'Must have --board-card-w variable');
  assert.ok(cssSrc.includes('--active-card-w'), 'Must have --active-card-w variable');
  assert.ok(cssSrc.includes('clamp('), 'Card sizes must use clamp() for responsive scaling');
});

test('Renderer: all 14 grid cells are emitted with data-grid attributes (v0.25: scoreSpine removed)', () => {
  const expectedDataGrids = [
    'enemyE', 'enemyP', 'enemyProfile',
    'piles', 'swap', 'stage', 'stack', 'chat',
    'playerE', 'playerP', 'gamelog',
    'playerPro', 'playerH', 'actions',
  ];
  for (const area of expectedDataGrids) {
    assert.ok(
      rendererSrc.includes(`data-grid="${area}"`),
      `Renderer must emit data-grid="${area}" for grid cell`
    );
  }
});

test('Renderer: scoreSpine removed, score integrated into prestige banners (v0.25)', () => {
  assert.ok(
    !rendererSrc.includes('class="rd-cell rd-score-spine"'),
    'Score spine grid cell must be removed (v0.25 — score in prestige banners)'
  );
  assert.ok(
    rendererSrc.includes('rd-prestige-banner'),
    'Prestige banner must be rendered in profile blocks'
  );
});

test('Renderer: swap bar is rendered as a grid cell (not auto-placed)', () => {
  assert.ok(
    rendererSrc.includes('class="rd-cell rd-swap"'),
    'Swap bar must be rendered as rd-cell rd-swap with explicit grid area'
  );
});

test('Renderer: actions panel shows meaningful prompt during human turn with no selection', () => {
  assert.ok(
    rendererSrc.includes('rd-stage-board-context'),
    'Active stage must show board context when no card is selected'
  );
  assert.ok(
    rendererSrc.includes('intent') && rendererSrc.includes('available'),
    'Actions panel must show available intent count as a prompt'
  );
});

test('Renderer: active stage shows phase info during human turn', () => {
  assert.ok(
    rendererSrc.includes('rd-stage-phase'),
    'Active stage must show current phase info'
  );
});

test('Renderer: active stage shows selected card preview when a card is selected', () => {
  assert.ok(
    rendererSrc.includes('selectedSourceCardId'),
    'Active stage must check selectedSourceCardId for card preview'
  );
});
