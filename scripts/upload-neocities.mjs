/**
 * Upload the prepared neocities-deploy/ directory using the official
 * Neocities multipart API. Credentials are accepted from the environment
 * only; no JavaScript credential/config file is loaded.
 *
 * Preferred authentication:
 *   NEOCITIES_API_KEY=<site API key>
 *
 * Legacy fallback (supported by the upstream API, but avoid when possible):
 *   NEOCITIES_USERNAME=<site name>
 *   NEOCITIES_PASSWORD=<site password>
 *
 * Usage:
 *   node scripts/upload-neocities.mjs --dry-run
 *   node scripts/upload-neocities.mjs
 */
import { existsSync, openAsBlob } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deployDir = path.join(root, 'neocities-deploy');
const uploadUrl = 'https://neocities.org/api/upload';
const dryRun = process.argv.includes('--dry-run');
const maxBatchFiles = 50;
const maxBatchBytes = 25 * 1024 * 1024;

/** @param {string} directory @returns {Promise<string[]>} */
async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

function authorizationHeader() {
  const apiKey = process.env.NEOCITIES_API_KEY?.trim();
  if (apiKey) return `Bearer ${apiKey}`;

  const username = process.env.NEOCITIES_USERNAME?.trim();
  const password = process.env.NEOCITIES_PASSWORD;
  if (username && password) {
    return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
  }
  throw new Error(
    'Neocities credentials are not configured. Set NEOCITIES_API_KEY (preferred), '
    + 'or both NEOCITIES_USERNAME and NEOCITIES_PASSWORD.',
  );
}

/**
 * Bound multipart request size and publish index.html last. If an asset batch
 * fails, the old entry point continues referencing the old asset graph rather
 * than exposing a half-deployed release.
 * @param {{ file: string, remotePath: string, size: number }[]} entries
 */
function createBatches(entries) {
  const indexEntry = entries.find(entry => entry.remotePath === 'index.html');
  const assets = entries.filter(entry => entry !== indexEntry);
  const batches = [];
  let batch = [];
  let bytes = 0;

  for (const entry of assets) {
    if (batch.length > 0 && (batch.length >= maxBatchFiles || bytes + entry.size > maxBatchBytes)) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(entry);
    bytes += entry.size;
  }
  if (batch.length > 0) batches.push(batch);
  if (indexEntry) batches.push([indexEntry]);
  return batches;
}

async function uploadBatch(batch, authorization, number, total) {
  const form = new FormData();
  for (const entry of batch) {
    const blob = await openAsBlob(entry.file);
    // Neocities uses the multipart field name as the destination path.
    form.append(entry.remotePath, blob, path.basename(entry.remotePath));
  }

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: { Authorization: authorization },
    body: form,
    redirect: 'error',
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.result !== 'success') {
    const reason = body?.message ?? body?.error_type ?? `HTTP ${response.status}`;
    throw new Error(`Neocities upload batch ${number}/${total} failed: ${reason}`);
  }
  console.log(`[neocities] Batch ${number}/${total} accepted (${batch.length} files).`);
}

async function main() {
  if (!existsSync(deployDir)) {
    throw new Error('neocities-deploy/ does not exist. Run pnpm run build:neocities first.');
  }
  if (!existsSync(path.join(deployDir, 'index.html'))) {
    throw new Error('neocities-deploy/index.html is missing; refusing an incomplete upload.');
  }

  const files = await listFiles(deployDir);
  const entries = await Promise.all(files.map(async (file) => ({
    file,
    remotePath: path.relative(deployDir, file).replace(/\\/g, '/'),
    size: (await stat(file)).size,
  })));
  const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  const batches = createBatches(entries);
  console.log(`[neocities] Prepared ${files.length} files (${(totalBytes / 1024 / 1024).toFixed(2)} MiB).`);
  console.log(`[neocities] Upload plan: ${batches.length} bounded batches; index.html publishes last.`);

  if (dryRun) {
    console.log('[neocities] DRY RUN PASS — no network request made and no credentials required.');
    return;
  }

  const authorization = authorizationHeader();
  for (let i = 0; i < batches.length; i++) {
    await uploadBatch(batches[i], authorization, i + 1, batches.length);
  }
  console.log(`[neocities] UPLOAD PASS — ${files.length} files accepted by Neocities.`);
}

main().catch((error) => {
  console.error(`[neocities] UPLOAD FAIL: ${error.message}`);
  process.exitCode = 1;
});
