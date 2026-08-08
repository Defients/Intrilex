import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// --- Helpers ---

const DRAW_PILE_ZONES = new Set(['DP', 'dp']);
const HAND_ZONE_RE = /_HAND$/;
const SWAP_BAR_ZONES = new Set(['SWAP_BAR', 'swapBar']);


function isDrawPile(card) { return card && DRAW_PILE_ZONES.has(card.zone); }
function isHand(card) { return card && HAND_ZONE_RE.test(card.zone ?? ''); }
function isSwapBar(card) { return card && SWAP_BAR_ZONES.has(card.zone); }
function isHiddenIdentity(identity) { return !identity || identity === 'HIDDEN'; }

/** Collect all card identities from an object by walking its structure. */
function collectIdentities(obj, found = []) {
  if (!obj || typeof obj !== 'object') return found;
  if (typeof obj.identity === 'string' && obj.identity !== 'HIDDEN' && obj.zone) {
    found.push({ identity: obj.identity, zone: obj.zone, id: obj.id });
  }
  for (const value of Object.values(obj)) {
    if (typeof value === 'object') collectIdentities(value, found);
  }
  return found;
}

/** Check if any sensitive keys (rng, seed, etc.) are present in a serialized object. */
function hasSensitiveKeys(obj) {
  const text = JSON.stringify(obj);
  return /"(rng|seed|setupSeed|rngTraceHash|integrityHash|initialStateHash|finalStateHash|authoritativeStateHash|authorizedStateHash|eventLogHash|checkpointLogHash)"\s*:/i.test(text);
}

// --- Frame-based artifact directories (lab-replays and replays) ---

const frameBasedDirs = [
  { public: 'sample-data/replays/public', authorized: 'sample-data/replays/authorized', label: 'corpus' },
  { public: 'sample-data/autonomy/lab-replays/public', authorized: 'sample-data/autonomy/lab-replays/authorized', label: 'lab-replays' },
];

// --- Certified replay artifact directories ---

const certifiedDirs = [
  { public: 'sample-data/autonomy/replays/public', authorized: 'sample-data/autonomy/replays/authorized', label: 'autonomy-replays' },
];

// =============================================================================
// PUBLIC ARTIFACTS: Draw pile must not reveal card identities
// =============================================================================

test('Privacy matrix: public frame-based artifacts hide draw-pile card identities in every frame', async () => {
  let checkedArtifacts = 0;
  let checkedFrames = 0;
  let dpCardsFound = 0;
  for (const dir of frameBasedDirs) {
    const files = (await readdir(path.join(root, dir.public))).filter(f => f.endsWith('.json')).sort();
    assert.ok(files.length > 0, `${dir.public} has no files`);
    for (const file of files) {
      const artifact = JSON.parse(await readFile(path.join(root, dir.public, file), 'utf8'));
      assert.ok(artifact.frames, `${file} has no frames`);
      for (const frame of artifact.frames) {
        const state = frame.state ?? frame.publicState ?? frame.omniscientState;
        if (!state?.cards) continue;
        checkedFrames++;
        for (const card of Object.values(state.cards)) {
          if (isDrawPile(card)) {
            dpCardsFound++;
            assert.equal(isHiddenIdentity(card.identity), true,
              `${dir.public}/${file} frame ${frame.commandIndex}: draw-pile card ${card.id} leaks identity "${card.identity}"`);
          }
        }
      }
      checkedArtifacts++;
    }
  }
  assert.ok(checkedArtifacts > 0, 'No public frame-based artifacts checked');
  assert.ok(checkedFrames > 0, 'No frames checked');
  assert.ok(dpCardsFound > 0, 'No draw-pile cards found in any public artifact — test is vacuous');
});

test('Privacy matrix: public frame-based artifacts do not contain rng/seed in any frame state', async () => {
  let checkedFrames = 0;
  for (const dir of frameBasedDirs) {
    const files = (await readdir(path.join(root, dir.public))).filter(f => f.endsWith('.json')).sort();
    for (const file of files) {
      const artifact = JSON.parse(await readFile(path.join(root, dir.public, file), 'utf8'));
      for (const frame of artifact.frames ?? []) {
        const state = frame.state ?? frame.publicState;
        if (!state) continue;
        checkedFrames++;
        assert.equal(hasSensitiveKeys(state), false,
          `${dir.public}/${file} frame ${frame.commandIndex}: public state contains sensitive keys (rng/seed)`);
      }
    }
  }
  assert.ok(checkedFrames > 0, 'No frames checked for sensitive keys');
});

test('Privacy matrix: public frame-based artifacts hide opponent hand identities', async () => {
  let checkedCards = 0;
  for (const dir of frameBasedDirs) {
    const files = (await readdir(path.join(root, dir.public))).filter(f => f.endsWith('.json')).sort();
    for (const file of files) {
      const artifact = JSON.parse(await readFile(path.join(root, dir.public, file), 'utf8'));
      for (const frame of artifact.frames ?? []) {
        const state = frame.state ?? frame.publicState;
        if (!state?.cards) continue;
        for (const card of Object.values(state.cards)) {
          if (isHand(card)) {
            checkedCards++;
            assert.equal(isHiddenIdentity(card.identity), true,
              `${dir.public}/${file} frame ${frame.commandIndex}: hand card ${card.id} leaks identity "${card.identity}" in public view`);
          }
        }
      }
    }
  }
  assert.ok(checkedCards > 0, 'No hand cards found in public artifacts — test is vacuous');
});

test('Privacy matrix: public frame-based artifacts do not contain playerViews or omniscientState', async () => {
  let checkedFrames = 0;
  for (const dir of frameBasedDirs) {
    const files = (await readdir(path.join(root, dir.public))).filter(f => f.endsWith('.json')).sort();
    for (const file of files) {
      const artifact = JSON.parse(await readFile(path.join(root, dir.public, file), 'utf8'));
      for (const frame of artifact.frames ?? []) {
        checkedFrames++;
        assert.equal(frame.playerViews ?? null, null,
          `${dir.public}/${file} frame ${frame.commandIndex}: public artifact contains playerViews`);
        assert.equal(frame.omniscientState ?? null, null,
          `${dir.public}/${file} frame ${frame.commandIndex}: public artifact contains omniscientState`);
      }
    }
  }
  assert.ok(checkedFrames > 0, 'No frames checked for playerViews/omniscientState absence');
});

// =============================================================================
// AUTHORIZED ARTIFACTS: Player views must hide draw-pile and opponent data
// =============================================================================

test('Privacy matrix: authorized player views hide draw-pile card identities in every frame', async () => {
  let checkedViews = 0;
  let dpCardsFound = 0;
  for (const dir of frameBasedDirs) {
    const files = (await readdir(path.join(root, dir.authorized))).filter(f => f.endsWith('.json')).sort();
    assert.ok(files.length > 0, `${dir.authorized} has no files`);
    for (const file of files) {
      const artifact = JSON.parse(await readFile(path.join(root, dir.authorized, file), 'utf8'));
      assert.ok(artifact.frames, `${file} has no frames`);
      for (const frame of artifact.frames) {
        const playerViews = frame.playerViews;
        if (!playerViews) continue;
        for (const [viewerId, view] of Object.entries(playerViews)) {
          if (!view?.cards) continue;
          checkedViews++;
          for (const card of Object.values(view.cards)) {
            if (isDrawPile(card)) {
              dpCardsFound++;
              assert.equal(isHiddenIdentity(card.identity), true,
                `${dir.authorized}/${file} frame ${frame.commandIndex} viewer ${viewerId}: draw-pile card ${card.id} leaks identity "${card.identity}"`);
            }
          }
        }
      }
    }
  }
  assert.ok(checkedViews > 0, 'No player views checked — test is vacuous');
  assert.ok(dpCardsFound > 0, 'No draw-pile cards found in any player view — test is vacuous');
});

test('Privacy matrix: authorized player views do not contain rng/seed', async () => {
  let checkedViews = 0;
  for (const dir of frameBasedDirs) {
    const files = (await readdir(path.join(root, dir.authorized))).filter(f => f.endsWith('.json')).sort();
    for (const file of files) {
      const artifact = JSON.parse(await readFile(path.join(root, dir.authorized, file), 'utf8'));
      for (const frame of artifact.frames) {
        const playerViews = frame.playerViews;
        if (!playerViews) continue;
        for (const [viewerId, view] of Object.entries(playerViews)) {
          checkedViews++;
          assert.equal(hasSensitiveKeys(view), false,
            `${dir.authorized}/${file} frame ${frame.commandIndex} viewer ${viewerId}: player view contains sensitive keys (rng/seed)`);
        }
      }
    }
  }
  assert.ok(checkedViews > 0, 'No player views checked for sensitive keys — test is vacuous');
});

test('Privacy matrix: authorized player views hide opponent hand identities', async () => {
  let checkedCards = 0;
  for (const dir of frameBasedDirs) {
    const files = (await readdir(path.join(root, dir.authorized))).filter(f => f.endsWith('.json')).sort();
    for (const file of files) {
      const artifact = JSON.parse(await readFile(path.join(root, dir.authorized, file), 'utf8'));
      for (const frame of artifact.frames) {
        const playerViews = frame.playerViews;
        if (!playerViews) continue;
        for (const [viewerId, view] of Object.entries(playerViews)) {
          if (!view?.cards) continue;
          for (const card of Object.values(view.cards)) {
            if (isHand(card) && card.controllerId !== viewerId) {
              checkedCards++;
              assert.equal(isHiddenIdentity(card.identity), true,
                `${dir.authorized}/${file} frame ${frame.commandIndex} viewer ${viewerId}: opponent hand card ${card.id} leaks identity "${card.identity}"`);
            }
          }
        }
      }
    }
  }
  assert.ok(checkedCards > 0, 'No opponent hand cards found in player views — test is vacuous');
});

test('Privacy matrix: authorized player views show own hand identities', async () => {
  let checkedCards = 0;
  for (const dir of frameBasedDirs) {
    const files = (await readdir(path.join(root, dir.authorized))).filter(f => f.endsWith('.json')).sort().slice(0, 10);
    for (const file of files) {
      const artifact = JSON.parse(await readFile(path.join(root, dir.authorized, file), 'utf8'));
      for (const frame of artifact.frames) {
        const playerViews = frame.playerViews;
        if (!playerViews) continue;
        for (const [viewerId, view] of Object.entries(playerViews)) {
          if (!view?.cards) continue;
          for (const card of Object.values(view.cards)) {
            if (isHand(card) && card.controllerId === viewerId) {
              checkedCards++;
              assert.equal(isHiddenIdentity(card.identity), false,
                `${dir.authorized}/${file} viewer ${viewerId}: own hand card ${card.id} should show identity but is HIDDEN`);
            }
          }
        }
      }
    }
  }
  assert.ok(checkedCards > 0, 'No own-hand cards found in player views — test is vacuous');
});

// =============================================================================
// OMNISCIENT STATE: Must contain full identities (judge view is correct)
// =============================================================================

test('Privacy matrix: authorized omniscient state contains real draw-pile identities (judge view)', async () => {
  let dpCardsFound = 0;
  for (const dir of frameBasedDirs) {
    const files = (await readdir(path.join(root, dir.authorized))).filter(f => f.endsWith('.json')).sort().slice(0, 10);
    for (const file of files) {
      const artifact = JSON.parse(await readFile(path.join(root, dir.authorized, file), 'utf8'));
      for (const frame of artifact.frames) {
        const omni = frame.omniscientState;
        if (!omni?.cards) continue;
        for (const card of Object.values(omni.cards)) {
          if (isDrawPile(card)) {
            dpCardsFound++;
            assert.equal(isHiddenIdentity(card.identity), false,
              `${dir.authorized}/${file}: omniscient draw-pile card ${card.id} should have real identity but is HIDDEN`);
          }
        }
      }
    }
  }
  assert.ok(dpCardsFound > 0, 'No draw-pile cards found in omniscient state — test is vacuous');
});

// =============================================================================
// CERTIFIED REPLAY PUBLIC ARTIFACTS: Must hide draw-pile identities and rng
// =============================================================================

test('Privacy matrix: certified replay public artifacts hide draw-pile identities in initialState', async () => {
  let checkedArtifacts = 0;
  let dpCardsFound = 0;
  for (const dir of certifiedDirs) {
    let files;
    try { files = (await readdir(path.join(root, dir.public))).filter(f => f.endsWith('.json')).sort(); }
    catch { continue; }
    assert.ok(files.length > 0, `${dir.public} has no files`);
    for (const file of files) {
      const artifact = JSON.parse(await readFile(path.join(root, dir.public, file), 'utf8'));
      const cards = artifact.initialState?.cards;
      if (!cards) continue;
      checkedArtifacts++;
      for (const card of Object.values(cards)) {
        if (isDrawPile(card)) {
          dpCardsFound++;
          assert.equal(isHiddenIdentity(card.identity), true,
            `${dir.public}/${file}: initialState draw-pile card ${card.id} leaks identity "${card.identity}"`);
        }
      }
    }
  }
  assert.ok(checkedArtifacts > 0, 'No certified replay public artifacts checked');
  assert.ok(dpCardsFound > 0, 'No draw-pile cards found in certified replay public artifacts — test is vacuous');
});

test('Privacy matrix: certified replay public artifacts do not contain rng/seed in initialState', async () => {
  let checkedArtifacts = 0;
  for (const dir of certifiedDirs) {
    let files;
    try { files = (await readdir(path.join(root, dir.public))).filter(f => f.endsWith('.json')).sort(); }
    catch { continue; }
    for (const file of files) {
      const artifact = JSON.parse(await readFile(path.join(root, dir.public, file), 'utf8'));
      if (!artifact.initialState) continue;
      checkedArtifacts++;
      assert.equal(hasSensitiveKeys(artifact.initialState), false,
        `${dir.public}/${file}: initialState contains sensitive keys (rng/seed)`);
    }
  }
  assert.ok(checkedArtifacts > 0, 'No certified replay public artifacts checked for sensitive keys');
});

// =============================================================================
// BROWSER APP: Draw pile rendering must not show identities in public/player mode
// =============================================================================

test('Privacy matrix: browser app.js does not render draw-pile identities without viewer-role check', async () => {
  const appSource = await readFile(path.join(root, 'apps/lab-web/src/app.js'), 'utf8');
  // The zone function renders all cards in a zone using cardToken.
  // The cardToken function renders card.identity if it's not HIDDEN.
  // The board function passes s.zones?.dp to zone() for the Draw Pile.
  // There must be a viewer-role check that prevents draw-pile identity rendering in public/player mode.
  // Check that the board function or cardToken function has awareness of visibility/role for the draw pile.
  const hasVisibilityCheck = /state\.visibility/.test(appSource);
  const hasDrawPileZone = /zones\?\.\s*dp|Draw Pile|card\.zone\s*===\s*['"]DP['"]/i.test(appSource);
  assert.ok(hasVisibilityCheck, 'app.js must have visibility/role awareness');
  assert.ok(hasDrawPileZone, 'app.js must render the draw pile zone');
  // The cardToken function must not render real identities for draw-pile cards when visibility is not judge
  // Look for evidence that cardToken or zone checks the viewer role for hidden zones
  const cardTokenSource = appSource.match(/function cardToken[\s\S]*?return\s*`/);
  assert.ok(cardTokenSource, 'cardToken function not found');
  // Currently cardToken only checks if identity is HIDDEN/empty — it does not check the zone or viewer role
  // This test will fail until cardToken or zone() filters draw-pile identities based on visibility
  const hasRoleAwareCardRendering = /visibility.*(?:judge|omniscient)|(?:judge|omniscient).*visibility/.test(cardTokenSource[0]) ||
    /zone.*(?:DP|draw|pile)|(?:DP|draw|pile).*zone/.test(cardTokenSource[0]);
  assert.ok(hasRoleAwareCardRendering,
    'cardToken must check viewer role or zone before rendering draw-pile identities — currently renders any non-HIDDEN identity');
});
