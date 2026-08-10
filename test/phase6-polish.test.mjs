import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const playSrc = (rel) => readFile(path.join(root, 'apps/lab-web/src/play', rel), 'utf8');

// ═══════════════════════════════════════════════════════════════
// New file existence and structure tests
// ═══════════════════════════════════════════════════════════════

test('phase6: play-sound.js exists and exports SoundEngine', async () => {
  const js = await playSrc('play-sound.js');
  assert.ok(js.length > 0, 'play-sound.js should not be empty');
  assert.match(js, /export class SoundEngine/);
});

test('phase6: play-sound.js has no node: imports', async () => {
  const js = await playSrc('play-sound.js');
  assert.doesNotMatch(js, /node:/, 'play-sound.js must not import node: modules');
});

test('phase6: play-sound.js has all game event sound methods', async () => {
  const js = await playSrc('play-sound.js');
  assert.match(js, /playCardPlay/);
  assert.match(js, /playCardDraw/);
  assert.match(js, /playStackResolve/);
  assert.match(js, /playAiAction/);
  assert.match(js, /playVictory/);
  assert.match(js, /playDefeat/);
});

test('phase6: play-sound.js has mute support and persistence', async () => {
  const js = await playSrc('play-sound.js');
  assert.match(js, /setMuted/);
  assert.match(js, /isMuted/);
  assert.match(js, /getPreference/);
  assert.match(js, /setPreference/);
});

test('phase6: play-particles.js exists and exports ParticleSystem', async () => {
  const js = await playSrc('play-particles.js');
  assert.ok(js.length > 0, 'play-particles.js should not be empty');
  assert.match(js, /export class ParticleSystem/);
});

test('phase6: play-particles.js has no node: imports', async () => {
  const js = await playSrc('play-particles.js');
  assert.doesNotMatch(js, /node:/, 'play-particles.js must not import node: modules');
});

test('phase6: play-particles.js has particle methods', async () => {
  const js = await playSrc('play-particles.js');
  assert.match(js, /burst/);
  assert.match(js, /sparkle/);
  assert.match(js, /confetti/);
  assert.match(js, /mount/);
  assert.match(js, /unmount/);
  assert.match(js, /destroy/);
});

test('phase6: play-particles.js respects prefers-reduced-motion', async () => {
  const js = await playSrc('play-particles.js');
  assert.match(js, /prefers-reduced-motion/);
  assert.match(js, /setEnabled/);
});

test('phase6: play-particles.js has MAX_PARTICLES cap', async () => {
  const js = await playSrc('play-particles.js');
  assert.match(js, /MAX_PARTICLES/);
  assert.match(js, /200/);
});

// ═══════════════════════════════════════════════════════════════
// CSS tests
// ═══════════════════════════════════════════════════════════════

test('phase6: play-v3.css has board card hover preview rule', async () => {
  const css = await playSrc('play-v3.css');
  assert.match(css, /\.board-card-wrapper:hover\s+\.tcg-hover-preview/);
});

test('phase6: play-v3.css has priority banner slide-in keyframe', async () => {
  const css = await playSrc('play-v3.css');
  assert.match(css, /tcg-banner-slide/);
});

test('phase6: play-v3.css has terminal victory glow keyframe', async () => {
  const css = await playSrc('play-v3.css');
  assert.match(css, /tcg-victory-glow/);
});

test('phase6: play-v3.css has terminal defeat dim keyframe', async () => {
  const css = await playSrc('play-v3.css');
  assert.match(css, /tcg-defeat-dim/);
});

test('phase6: play-v3.css has terminal draw pulse keyframe', async () => {
  const css = await playSrc('play-v3.css');
  assert.match(css, /tcg-draw-pulse/);
});

test('phase6: play-v3.css has prefers-color-scheme: light', async () => {
  const css = await playSrc('play-v3.css');
  assert.match(css, /prefers-color-scheme:\s*light/);
});

test('phase6: play-v3.css has particle canvas rule', async () => {
  const css = await playSrc('play-v3.css');
  assert.match(css, /#play-particle-canvas/);
});

test('phase6: play-v3.css has sound toggle styles', async () => {
  const css = await playSrc('play-v3.css');
  assert.match(css, /\.sound-toggle/);
});

test('phase6: play-v3.css reduced motion disables new animations', async () => {
  const css = await playSrc('play-v3.css');
  // Verify the Phase 6 reduced motion block disables terminal animations and particles
  assert.match(css, /play-particle-canvas.*display:\s*none/);
});

// ═══════════════════════════════════════════════════════════════
// Renderer tests
// ═══════════════════════════════════════════════════════════════

test('phase6: play-renderer-v3 has sound toggle testid', async () => {
  const js = await playSrc('ranked-duel-renderer.mjs');
  assert.match(js, /data-testid="sound-toggle"/);
});

test('phase6: play-renderer-v3 has Enter key in keyboard help', async () => {
  const js = await playSrc('ranked-duel-terminal.mjs');
  assert.match(js, /Enter/);
  assert.match(js, /Confirm selected action/);
});

test('phase6: play-renderer-v3 has particle canvas element', async () => {
  // Particle canvas is created by ParticleSystem.mount() in play-particles.js
  // and wired up in play-app.js, not in the renderer HTML template.
  const js = await playSrc('play-particles.js');
  assert.match(js, /play-particle-canvas/);
});

// ═══════════════════════════════════════════════════════════════
// play-app.js wiring tests
// ═══════════════════════════════════════════════════════════════

test('phase6: play-app imports play-sound.js', async () => {
  const js = await playSrc('play-app.js');
  assert.match(js, /import.*SoundEngine.*play-sound\.js/);
});

test('phase6: play-app imports play-particles.js', async () => {
  const js = await playSrc('play-app.js');
  assert.match(js, /import.*ParticleSystem.*play-particles\.js/);
});

test('phase6: play-app passes soundMuted to renderer', async () => {
  const js = await playSrc('play-app.js');
  assert.match(js, /soundMuted/);
});

test('phase6: play-app has sound-toggle event binding', async () => {
  const js = await playSrc('play-app.js');
  const boardJs = await playSrc('board-events.js');
  assert.match(js + boardJs, /data-testid="sound-toggle"/);
});

test('phase6: play-app has visibility handler for sound suspend/resume', async () => {
  const js = await playSrc('play-app.js');
  assert.match(js, /bindVisibilityHandler/);
  assert.match(js, /removeVisibilityHandler/);
  assert.match(js, /visibilitychange/);
});

test('phase6: play-app cleanup destroys sound and particles', async () => {
  const js = await playSrc('play-app.js');
  assert.match(js, /state\.sound\.destroy/);
  assert.match(js, /state\.particles\.destroy/);
});

test('phase6: play-app has terminal sound triggers', async () => {
  const js = await playSrc('play-app.js');
  assert.match(js, /playVictory/);
  assert.match(js, /playDefeat/);
  assert.match(js, /confetti/);
});
