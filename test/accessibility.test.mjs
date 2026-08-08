import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const readCss = async () => (await Promise.all(['tokens-base','feature-components','pages-polish'].map(f => readFile(`apps/lab-web/src/css/${f}.css`, 'utf8')))).join('\n');

test('document has language, skip link and main landmark',async()=>{
  const html=await readFile('apps/lab-web/src/index.html','utf8');
  assert.match(html,/<html lang="en">/);
  assert.match(html,/class="[^"]*\bskip(?:-link)?\b[^"]*"/);
  assert.match(html,/<main id="main"/);
});

test('controls expose labels',async()=>{
  const [html,js]=await Promise.all([
    readFile('apps/lab-web/src/index.html','utf8'),
    readFile('apps/lab-web/src/app.js','utf8')
  ]);
  assert.match(js,/title="Previous frame"/);
  assert.match(html,/aria-label="Visibility mode"/);
  assert.match(js,/aria-label="Back to landing"/);
});

test('focus-visible styling exists',async()=>assert.match(await readCss(),/:focus-visible/));
test('statuses are encoded in text and not color alone',async()=>{const js=await readFile('apps/lab-web/src/app.js','utf8');const evidence=await readFile('apps/lab-web/src/workspaces/evidence.js','utf8');assert.match(evidence,/SUPPORTED/);assert.match(js,/BLOCKED|REPLAY_ONLY|danger|warning/);});
test('landing page has skip link in renderLanding',async()=>{const js=await readFile('apps/lab-web/src/app.js','utf8');assert.match(js,/class="skip skip-link" href="#landing-main"/);});
test('landing cards have focus-visible styling',async()=>{const css=await readCss();assert.match(css,/\.landing-card:focus-visible/);});
test('landing page respects reduced-motion for aurora animation',async()=>{const css=await readCss();assert.match(css,/\.landing-aurora\{animation:none\}/);});
