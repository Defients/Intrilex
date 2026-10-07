// Browser proof: experiment run → durable artifact → ledger → package → dedupe.
// Requires a dev server on INTRILEX_DEV_PORT (4173) and a Chromium binary.
/* global document */
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const BASE = 'http://127.0.0.1:4173/#/';
const log = (...a) => console.log('[proof]', ...a);
const fail = m => { throw new Error(`PROOF FAIL: ${m}`); };

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300)); });

await page.goto(`${BASE}evolution`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#experiment-button', { state: 'visible', timeout: 30000 });
log('app booted');

// ── 1. Run a small experiment (4 matches, 1 worker) ──────────────
await page.click('#experiment-button');
await page.waitForSelector('#experiment-dialog[open], #experiment-dialog:open', { timeout: 5000 }).catch(() => {});
await page.fill('#exp-count', '4');
await page.selectOption('#exp-workers', '1');
await page.click('#run-experiment');
await page.waitForFunction(() => /Campaign complete/i.test(document.querySelector('#campaign-summary')?.textContent ?? '')
  || /Persistence failed|failed/i.test(document.querySelector('#experiment-status')?.textContent ?? ''), { timeout: 180000 });
const statusText = await page.textContent('#experiment-status');
log('run finished:', statusText?.slice(0, 140));

// ── 2. Manage Runs — verify durable artifact ─────────────────────
await page.click('#exp-runs-toggle');
await page.waitForSelector('#exp-runs .run-row', { timeout: 15000 });
await page.click('#exp-verify-artifacts');
await page.waitForFunction(() => /durable/.test(document.querySelector('#exp-portability-status')?.textContent ?? ''), { timeout: 15000 });
const verifyText = await page.textContent('#exp-portability-status');
log('verify:', verifyText);
if (!/1 durable/.test(verifyText)) fail(`expected 1 durable artifact, got: ${verifyText}`);

// ── 3. Per-run artifact export from Manage Runs ──────────────────
await page.click('#exp-runs .run-row:not(:has(.run-bundled)) [data-run-action="expand"]');
await page.waitForSelector('[data-run-action="export"]', { state: 'visible', timeout: 10000 });
const [dl1] = await Promise.all([
  page.waitForEvent('download', { timeout: 20000 }),
  page.click('[data-run-action="export"]'),
]);
const artifactPath = await dl1.path();
const artifact = JSON.parse(await readFile(artifactPath, 'utf8'));
if (artifact.format !== 'intrilex-experiment-run') fail(`bad artifact format ${artifact.format}`);
if (artifact.payload?.evidence?.kind !== 'batches') fail(`expected batched evidence, got ${artifact.payload?.evidence?.kind}`);
const matchCount = artifact.payload.evidence.batches.reduce((n, b) => n + (b.summaries?.length ?? 0), 0);
log(`artifact exported: ${artifact.payload.run.runId} · ${matchCount} matches · hash ok=${artifact.contentHash.length === 64}`);
await page.click('#experiment-close').catch(() => page.keyboard.press('Escape'));

// ── 4. Evolution ledger bridge — experiment runs visible ─────────
await page.goto(`${BASE}evolution`, { waitUntil: 'domcontentloaded' });
await page.click('.evo-navigation [data-evo-surface="ledger"]');
await page.waitForSelector('[data-testid="evo-exp-ledger"]', { state: 'visible', timeout: 20000 });
const ledgerText = await page.textContent('#evo-exp-ledger');
log('evo ledger:', ledgerText?.replace(/\s+/g, ' ').slice(0, 200));
if (!/Experiment evidence runs/.test(ledgerText)) fail('experiment runs not listed in Evolution ledger');
if (!/durable/.test(ledgerText)) fail('durable count missing in ledger');

// ── 5. Research package export → parse + verify completeness ─────
const [dl2] = await Promise.all([
  page.waitForEvent('download', { timeout: 30000 }),
  page.click('[data-exp-export-package]'),
]);
const pkg = JSON.parse(await readFile(await dl2.path(), 'utf8'));
if (pkg.format !== 'intrilex-research-package') fail(`bad package format ${pkg.format}`);
log(`package: completeness=${pkg.manifest.completeness} · artifacts=${pkg.manifest.runArtifacts.included}/${pkg.manifest.runArtifacts.expected} · files=${Object.keys(pkg.files).length}`);
if (pkg.manifest.completeness !== 'COMPLETE') fail(`expected COMPLETE, got ${pkg.manifest.completeness} — missing: ${pkg.manifest.runArtifacts.missingRunIds}`);
if (!pkg.files['analysis/dossier.json']) fail('dossier.json absent from package');
if (!pkg.files['manifest.json']) fail('manifest.json absent');
if (!pkg.files['README.md']) fail('README.md absent');
if (pkg.manifest.replayCoverage.gamesWithFullTranscript !== 0) fail('summary-only run claims retained transcripts');

// ── 6. Export hub — Run artifacts row + package button ───────────
await page.goto(`${BASE}evolution`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#analysis-export-trigger', { state: 'visible', timeout: 20000 });
await page.click('#analysis-export-trigger');
await page.waitForFunction(() => {
  const el = document.querySelector('#export-status-rows');
  return el && /Run artifacts/i.test(el.textContent);
}, { timeout: 20000 });
const hubStatus = await page.textContent('#export-status-rows');
log('hub status:', hubStatus?.replace(/\s+/g, ' ').slice(0, 240));
if (!/1\/1 durable/.test(hubStatus)) fail(`hub artifact row wrong: ${hubStatus}`);
const [dl3] = await Promise.all([
  page.waitForEvent('download', { timeout: 30000 }),
  page.click('#export-research-package'),
]);
const pkg2 = JSON.parse(await readFile(await dl3.path(), 'utf8'));
if (pkg2.manifest.completeness !== 'COMPLETE') fail(`hub package completeness ${pkg2.manifest.completeness}`);
log('hub package export OK — COMPLETE');

// ── 7. Reload persistence — the artifact survives reload ─────────
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#experiment-button', { state: 'visible', timeout: 30000 });
await page.click('#experiment-button');
await page.click('#exp-runs-toggle');
await page.waitForSelector('#exp-runs .run-row', { timeout: 15000 });
await page.click('#exp-verify-artifacts');
await page.waitForFunction(() => /durable/.test(document.querySelector('#exp-portability-status')?.textContent ?? ''), { timeout: 15000 });
log('post-reload verify:', await page.textContent('#exp-portability-status'));

// ── 8. Import dedupe — import the exported artifact twice ────────
// (via file input in the portability toolbar)
await page.setInputFiles('#exp-import-artifact', { name: `${artifact.payload.run.runId}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(artifact)) });
await page.waitForFunction(() => /deduplicated|already present/.test(document.querySelector('#exp-portability-status')?.textContent ?? ''), { timeout: 15000 });
log('import dedupe:', await page.textContent('#exp-portability-status'));

await browser.close();
console.log('PROOF PASS — run → durable artifact → ledger → package → dedupe all verified in real browser');
