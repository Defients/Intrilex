import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CARD_ART_REGISTRY_META,
  getCardArt,
  getCardArtCode,
  getCardArtAlt,
  getCardArtBoardPath,
  getCardArtBoardPosition,
  listCardArtEntries,
} from '../apps/lab-web/src/card-art-registry.js';
import { getCardDefinition } from '../apps/lab-web/src/card-face-data.js';
import { renderCardFace } from '../apps/lab-web/src/card-face-renderer.js';
import { renderTcgCard } from '../apps/lab-web/src/play/play-card-component.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetDir = path.join(root, 'apps/lab-web/src/assets/card-art');

const ALL_IDENTITIES = [
  'A♣','A♦','A♥','A♠','2♣','2♦','2♥','2♠','3♣','3♦','3♥','3♠','4♣','4♦','4♥','4♠',
  '5♣','5♦','5♥','5♠','6♣','6♦','6♥','6♠','7♣','7♦','7♥','7♠','8♣','8♦','8♥','8♠',
  '9♣','9♦','9♥','9♠','10♣','10♦','10♥','10♠','J♣','J♦','J♥','J♠','Q♣','Q♦','Q♥','Q♠',
  'K♣','K♦','K♥','K♠','RJ','BJ',
];

// ── Manifest completeness ──────────────────────────────────────────────────
test('card-art: registry maps all 54 canonical card identities', () => {
  assert.equal(CARD_ART_REGISTRY_META.exactCards, 54);
  assert.equal(listCardArtEntries().length, 54, 'registry must contain exactly 54 entries');
  for (const identity of ALL_IDENTITIES) {
    const entry = getCardArt(identity);
    assert.ok(entry.code, `${identity} must have an art code`);
    assert.ok(entry.board.endsWith('.webp'), `${identity} board path must be .webp`);
    assert.ok(entry.alt, `${identity} must have alt text`);
    assert.ok(entry.boardPosition && typeof entry.boardPosition.x === 'number', `${identity} must have a focal position`);
  }
});

test('card-art: no duplicate logical identities in the registry', () => {
  const identities = listCardArtEntries().map(e => e.identity);
  const dupes = identities.filter((id, i) => identities.indexOf(id) !== i);
  assert.deepEqual(dupes, [], `duplicate registry identities: ${dupes.join(', ')}`);
});

test('card-art: no duplicate art codes in the registry', () => {
  const codes = listCardArtEntries().map(e => e.code);
  const dupes = codes.filter((c, i) => codes.indexOf(c) !== i);
  assert.deepEqual(dupes, [], `duplicate art codes: ${dupes.join(', ')}`);
});

// ── File existence ──────────────────────────────────────────────────────────
test('card-art: every registry board path resolves to a real generated asset', async () => {
  for (const entry of listCardArtEntries()) {
    const file = path.join(assetDir, path.basename(entry.board));
    assert.ok(existsSync(file), `${entry.identity} board asset missing: ${file}`);
    const stat = statSync(file);
    assert.ok(stat.size > 1000, `${entry.identity} board asset suspiciously small: ${stat.size} bytes`);
  }
});

test('card-art: exactly 54 webp files exist in the asset directory', async () => {
  const webpFiles = (await readdir(assetDir)).filter(f => f.endsWith('.webp'));
  assert.equal(webpFiles.length, 54, `expected 54 webp files, found ${webpFiles.length}`);
});

test('card-art: generated manifest.json is present and reports 54 entries', async () => {
  const manifestPath = path.join(assetDir, 'manifest.json');
  assert.ok(existsSync(manifestPath), 'manifest.json must exist in asset directory');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.count, 54);
  assert.equal(manifest.entries.length, 54);
  assert.equal(manifest.boardSize.width, 720);
  assert.equal(manifest.boardSize.height, 1000);
});

// ── Identity normalization ─────────────────────────────────────────────────
test('card-art: getCardArtCode normalizes representative identities correctly', () => {
  assert.equal(getCardArtCode('A♠'), 'as');
  assert.equal(getCardArtCode('10♦'), '10d');
  assert.equal(getCardArtCode('Q♣'), 'qc');
  assert.equal(getCardArtCode('K♥'), 'kh');
  assert.equal(getCardArtCode('RJ'), 'rj');
  assert.equal(getCardArtCode('BJ'), 'bj');
});

test('card-art: getCardArtCode handles 10 without truncation', () => {
  for (const suit of ['♣','♦','♥','♠']) {
    assert.equal(getCardArtCode(`10${suit}`), `10${ { '♣':'c','♦':'d','♥':'h','♠':'s' }[suit] }`);
  }
});

test('card-art: getCardArtCode throws for unknown identities (visible failure)', () => {
  assert.throws(() => getCardArtCode('ZZ'), /unresolved card identity/);
  assert.throws(() => getCardArtCode(''), /unresolved card identity/);
  assert.throws(() => getCardArtCode(null), /unresolved card identity/);
});

test('card-art: getCardArt throws for unmapped identities (visible failure)', () => {
  assert.throws(() => getCardArt('ZZ'), /unmapped card identity/);
});

// ── Coverage: every rank and suit ───────────────────────────────────────────
test('card-art: every rank appears once per suit (4×13 = 52 suited cards)', () => {
  const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const suits = ['♣','♦','♥','♠'];
  for (const rank of ranks) {
    for (const suit of suits) {
      const identity = `${rank}${suit}`;
      assert.ok(getCardArt(identity), `${identity} must be in the registry`);
    }
  }
  // Both Jokers
  assert.ok(getCardArt('RJ'));
  assert.ok(getCardArt('BJ'));
});

test('card-art: both Jokers resolve independently', () => {
  const rj = getCardArt('RJ');
  const bj = getCardArt('BJ');
  assert.notEqual(rj.code, bj.code, 'Jokers must have distinct art codes');
  assert.notEqual(rj.board, bj.board, 'Jokers must have distinct board paths');
  assert.equal(rj.code, 'rj');
  assert.equal(bj.code, 'bj');
});

// ── Alt text / accessibility ────────────────────────────────────────────────
test('card-art: alt text is meaningful for representative cards', () => {
  assert.equal(getCardArtAlt('A♠'), 'Ace of Spades artwork');
  assert.equal(getCardArtAlt('10♦'), 'Ten of Diamonds artwork');
  assert.equal(getCardArtAlt('Q♣'), 'Queen of Clubs artwork');
  assert.equal(getCardArtAlt('K♥'), 'King of Hearts artwork');
  assert.equal(getCardArtAlt('RJ'), 'Red Joker artwork');
  assert.equal(getCardArtAlt('BJ'), 'Black Joker artwork');
});

// ── Registry ↔ card-face-data consistency ───────────────────────────────────
test('card-art: card-face-data.js art paths match the canonical registry', () => {
  for (const identity of ALL_IDENTITIES) {
    const def = getCardDefinition(identity);
    const registryPath = getCardArtBoardPath(identity);
    assert.equal(def.art, registryPath, `${identity}: card-face-data art path must match registry`);
  }
});

test('card-art: focal position CSS value is well-formed', () => {
  for (const identity of ALL_IDENTITIES) {
    const pos = getCardArtBoardPosition(identity);
    assert.match(pos, /^\d+% \d+%$/, `${identity} position must be "N% M%" format`);
  }
});

// ── Renderer behavior ───────────────────────────────────────────────────────
test('card-art: representative cards from each suit + both Jokers render with art', () => {
  const reps = ['as', '10s', 'qh', 'kd', 'qc', 'joker1', 'joker2'];
  const identityForCode = {
    as: 'A♠', '10s': '10♠', qh: 'Q♥', kd: 'K♦', qc: 'Q♣',
    joker1: 'RJ', joker2: 'BJ',
  };
  for (const rep of reps) {
    const identity = identityForCode[rep];
    const html = renderCardFace(identity, { view: 'board' });
    assert.match(html, /ix-card-art/, `${rep} (${identity}) must render an art surface`);
    assert.match(html, /data-card-identity="/, `${rep} (${identity}) must carry identity attribute`);
    // The art CSS variable must reference the correct webp path
    const entry = getCardArt(identity);
    assert.ok(html.includes(`--card-art:url("${entry.board}")`), `${rep} must reference ${entry.board}`);
  }
});

test('card-art: board view applies per-card focal position via CSS variable', () => {
  const html = renderCardFace('A♠', { view: 'board' });
  const pos = getCardArtBoardPosition('A♠');
  assert.ok(html.includes(`--card-art-position:${pos}`), 'renderer must emit --card-art-position from registry');
});

test('card-art: portrait aria-label uses registry alt text', () => {
  const html = renderCardFace('K♥', { view: 'board' });
  assert.ok(html.includes('King of Hearts artwork'), 'portrait aria-label must use canonical alt text');
});

test('card-art: play-card-component resolves art through the registry', () => {
  const html = renderTcgCard({ id: 'test-as', identity: 'A♠', pointValue: 4 });
  assert.match(html, /tcg-art/);
  assert.ok(html.includes("url('assets/card-art/as.webp')"), 'play card must reference canonical as.webp');
});

test('card-art: play-card-component renders Joker art distinctly', () => {
  const rj = renderTcgCard({ id: 'test-rj', identity: 'RJ', pointValue: 5 });
  const bj = renderTcgCard({ id: 'test-bj', identity: 'BJ', pointValue: 11 });
  assert.ok(rj.includes("url('assets/card-art/rj.webp')"), 'RJ must reference rj.webp');
  assert.ok(bj.includes("url('assets/card-art/bj.webp')"), 'BJ must reference bj.webp');
});

// ── Broken asset behavior ───────────────────────────────────────────────────
test('card-art: unresolved identity produces explicit diagnostic, not silent fallback', () => {
  assert.throws(
    () => renderCardFace('ZZ', { view: 'board' }),
    // getCardArt is called via cardVars → throws for unmapped identity
    /unmapped card identity|unresolved card identity/,
  );
});

// ── No contact sheets / unrelated images in the asset directory ─────────────
test('card-art: asset directory contains only canonical card webp files + manifest', async () => {
  const allowed = new Set([
    ...ALL_IDENTITIES.map(id => {
      try { return path.basename(getCardArtBoardPath(id)); } catch { return null; }
    }).filter(Boolean),
    'manifest.json',
  ]);
  const files = await readdir(assetDir);
  const unexpected = files.filter(f => !allowed.has(f));
  assert.deepEqual(unexpected, [], `unexpected files in asset dir: ${unexpected.join(', ')}`);
});

// ── Source archive integrity ────────────────────────────────────────────────
test('card-art: source PNG archive contains exactly 54 canonical files', async () => {
  const sourceDir = path.join(root, 'card-art');
  const canonical = new Set([
    ...['a','2','3','4','5','6','7','8','9','10','j','q','k'].flatMap(r =>
      ['s','h','d','c'].map(s => `${r}${s}.png`)),
    'joker1.png', 'joker2.png',
  ]);
  const pngs = (await readdir(sourceDir)).filter(f => f.endsWith('.png'));
  assert.equal(pngs.length, 54, `source archive must have 54 PNGs, found ${pngs.length}`);
  const missing = [...canonical].filter(f => !pngs.includes(f));
  assert.deepEqual(missing, [], `missing source PNGs: ${missing.join(', ')}`);
  const extra = pngs.filter(f => !canonical.has(f));
  assert.deepEqual(extra, [], `unexpected source PNGs: ${extra.join(', ')}`);
});
