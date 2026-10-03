import { writeFile as writeFileRaw } from 'node:fs/promises';

const RETRYABLE_CODES = new Set(['UNKNOWN', 'EPERM', 'EBUSY', 'EACCES', 'ENOENT']);
const MAX_ATTEMPTS = 12;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Windows transient filesystem stalls (antivirus/indexer locks, async
 * directory-commit races) surface as UNKNOWN (errno -4094), EPERM, or EBUSY
 * on open(). Retries with linear backoff (~16s worst case) before failing.
 */
export async function withRetry(operation, attempts = MAX_ATTEMPTS) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!RETRYABLE_CODES.has(error?.code) || attempt >= attempts) throw error;
      await sleep(Math.min(250 * attempt, 2000));
    }
  }
}

/** Drop-in replacement for fs/promises.writeFile with transient-failure retry. */
export function writeFile(file, data, options) {
  return withRetry(() => writeFileRaw(file, data, options));
}
