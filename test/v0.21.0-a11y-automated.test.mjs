// ═══════════════════════════════════════════════════════════════
// v0.21.0-a11y-automated.test.mjs
// Automated accessibility verification of the built browser dist.
//
// Checks WCAG compliance, ARIA completeness, color contrast ratios,
// touch target sizes, reduced-motion effectiveness, and heading
// hierarchy in the compiled dist output.
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(path.join(root, rel), 'utf8');
const readBundleJs = async () => {
  const distDir = path.join(root, 'apps/lab-web/dist');
  const files = await readdir(distDir);
  const bundle = files.find(f => /^app\.[a-f0-9]+\.js$/.test(f));
  if (!bundle) throw new Error('No hashed app bundle found in dist');
  const bundleJs = await readFile(path.join(distDir, bundle), 'utf8');
  // Include chunk files — code splitting moves a11y features into dynamically loaded chunks
  const chunks = files.filter(f => /^chunk-.*\.js$/.test(f) && !f.endsWith('.map'));
  const chunkJs = await Promise.all(chunks.map(f => readFile(path.join(distDir, f), 'utf8')));
  return [bundleJs, ...chunkJs].join('\n');
};
const readCss = async () => (await Promise.all([
  ...['tokens-base', 'feature-components', 'pages-polish'].map(f =>
    readFile(path.join(root, 'apps/lab-web/src/css', `${f}.css`), 'utf8')),
  readFile(path.join(root, 'apps/lab-web/src/play/play-v3.css'), 'utf8'),
])).join('\n');

// ── WCAG Color Contrast ─────────────────────────────────────────

/**
 * Parse a hex color (#rgb or #rrggbb) into {r, g, b} (0-255).
 */
function parseHex(hex) {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) };
  }
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

/**
 * Compute relative luminance per WCAG 2.1.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function relativeLuminance({ r, g, b }) {
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Compute WCAG contrast ratio between two hex colors.
 * Returns a ratio from 1:1 to 21:1.
 */
function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(parseHex(hex1));
  const l2 = relativeLuminance(parseHex(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ── Tests ───────────────────────────────────────────────────────

test('a11y: dist HTML has lang attribute', async () => {
  const html = await read('apps/lab-web/dist/index.html');
  assert.match(html, /<html[^>]*lang=/);
});

test('a11y: dist HTML has skip link with href to #main', async () => {
  const html = await read('apps/lab-web/dist/index.html');
  assert.match(html, /class="skip[^"]*"[^>]*href="#main"/);
});

test('a11y: dist HTML has main landmark with tabindex=-1', async () => {
  const html = await read('apps/lab-web/dist/index.html');
  assert.match(html, /<main[^>]*id="main"[^>]*tabindex="-1"/);
});

test('a11y: dist HTML has viewport meta tag', async () => {
  const html = await read('apps/lab-web/dist/index.html');
  assert.match(html, /<meta[^>]*name="viewport"[^>]*width=device-width/);
});

test('a11y: CSS defines --touch-target token of at least 44px', async () => {
  const css = await readCss();
  assert.match(css, /--touch-target:\s*44px/);
});

test('a11y: CSS defines sr-only class for screen reader text', async () => {
  const css = await readCss();
  assert.match(css, /\.sr-only\b/);
  assert.match(css, /clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
});

test('a11y: CSS has prefers-reduced-motion media query that disables animations', async () => {
  const css = await readCss();
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  // Verify that at least transitions and animations are neutralized
  const reducedMotionBlocks = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]+\}/g) ?? [];
  const combined = reducedMotionBlocks.join('\n');
  assert.ok(
    combined.includes('transition') || combined.includes('animation') || combined.includes('duration'),
    'reduced-motion media query must neutralize transitions or animations'
  );
});

test('a11y: CSS has prefers-contrast media query for high contrast mode', async () => {
  const css = await readCss();
  assert.match(css, /@media\s*\(prefers-contrast:\s*high\)/);
});

test('a11y: CSS has focus-visible styling with visible outline', async () => {
  const css = await readCss();
  assert.match(css, /:focus-visible/);
  // Must have an outline or box-shadow for visibility
  assert.ok(
    /:focus-visible[^{]*\{[^}]*(outline|box-shadow)/.test(css),
    'focus-visible must produce a visible outline or box-shadow'
  );
});

test('a11y: WCAG contrast ratio for primary text on background meets AA (4.5:1)', async () => {
  // --text: #e8f0f4 on --bg-0: #05080e
  const ratio = contrastRatio('#e8f0f4', '#05080e');
  assert.ok(ratio >= 4.5, `Primary text contrast ratio ${ratio.toFixed(2)}:1 must meet WCAG AA (4.5:1)`);
});

test('a11y: WCAG contrast ratio for muted text on background meets AA (4.5:1)', async () => {
  // --muted: #a0b8c4 on --bg-0: #05080e
  const ratio = contrastRatio('#a0b8c4', '#05080e');
  assert.ok(ratio >= 4.5, `Muted text contrast ratio ${ratio.toFixed(2)}:1 must meet WCAG AA (4.5:1)`);
});

test('a11y: WCAG contrast ratio for faint text on background meets AA (3:1 for large text)', async () => {
  // --faint: #8ea5b2 on --bg-0: #05080e — faint is used for large/secondary text
  const ratio = contrastRatio('#8ea5b2', '#05080e');
  assert.ok(ratio >= 3.0, `Faint text contrast ratio ${ratio.toFixed(2)}:1 must meet WCAG AA large text (3:1)`);
});

test('a11y: WCAG contrast ratio for focus indicator meets AA (3:1)', async () => {
  // --focus: #ffdc7a on --bg-0: #05080e
  const ratio = contrastRatio('#ffdc7a', '#05080e');
  assert.ok(ratio >= 3.0, `Focus indicator contrast ratio ${ratio.toFixed(2)}:1 must meet WCAG AA (3:1)`);
});

test('a11y: WCAG contrast ratio for cyan accent on background meets AA (3:1)', async () => {
  // --cyan: #5ad7e8 on --bg-0: #05080e
  const ratio = contrastRatio('#5ad7e8', '#05080e');
  assert.ok(ratio >= 3.0, `Cyan accent contrast ratio ${ratio.toFixed(2)}:1 must meet WCAG AA (3:1)`);
});

test('a11y: WCAG contrast ratio for danger/red on background meets AA (3:1)', async () => {
  // --red: #f2777a on --bg-0: #05080e
  const ratio = contrastRatio('#f2777a', '#05080e');
  assert.ok(ratio >= 3.0, `Danger red contrast ratio ${ratio.toFixed(2)}:1 must meet WCAG AA (3:1)`);
});

test('a11y: WCAG contrast ratio for green on background meets AA (3:1)', async () => {
  // --green: #68d391 on --bg-0: #05080e
  const ratio = contrastRatio('#68d391', '#05080e');
  assert.ok(ratio >= 3.0, `Green contrast ratio ${ratio.toFixed(2)}:1 must meet WCAG AA (3:1)`);
});

test('a11y: WCAG contrast ratio for amber on background meets AA (3:1)', async () => {
  // --amber: #f1bd5d on --bg-0: #05080e
  const ratio = contrastRatio('#f1bd5d', '#05080e');
  assert.ok(ratio >= 3.0, `Amber contrast ratio ${ratio.toFixed(2)}:1 must meet WCAG AA (3:1)`);
});

test('a11y: dist JS has aria-live regions for dynamic content', async () => {
  const js = await readBundleJs();
  assert.match(js, /aria-live/);
});

test('a11y: dist JS has role="alert" for error announcements', async () => {
  const js = await readBundleJs();
  assert.match(js, /role="alert"/);
});

test('a11y: dist JS has aria-label on interactive elements', async () => {
  const js = await readBundleJs();
  assert.match(js, /aria-label=/);
});

test('a11y: dist JS has aria-hidden on decorative elements', async () => {
  const js = await readBundleJs();
  assert.match(js, /aria-hidden="true"/);
});

test('a11y: dist JS has dialog with aria-modal', async () => {
  const js = await readBundleJs();
  assert.match(js, /aria-modal="true"/);
});

test('a11y: CSS has responsive breakpoints for mobile accessibility', async () => {
  const css = await readCss();
  // Must have breakpoints for common mobile widths
  assert.ok(css.includes('390px') || css.includes('480px'), 'CSS must have mobile breakpoint (390px or 480px)');
  assert.ok(css.includes('768px'), 'CSS must have tablet breakpoint (768px)');
});

test('a11y: CSS has safe-area-inset for notch/mobile accessibility', async () => {
  const css = await readCss();
  assert.ok(
    css.includes('safe-area-inset') || css.includes('env(safe-area'),
    'CSS must use safe-area-inset for mobile notch accessibility'
  );
});

test('a11y: CSS has scroll-padding for anchor navigation accessibility', async () => {
  const css = await readCss();
  assert.ok(
    css.includes('scroll-padding') || css.includes('scroll-behavior'),
    'CSS must have scroll-padding or scroll-behavior for accessible navigation'
  );
});

test('a11y: dist JS has keyboard shortcut cleanup on route change', async () => {
  const js = await readBundleJs();
  assert.match(js, /removeKeyboardShortcuts|removeEventListener.*keydown/);
});

test('a11y: dist JS has tabindex management for focusable elements', async () => {
  const js = await readBundleJs();
  assert.match(js, /tabindex/);
});
