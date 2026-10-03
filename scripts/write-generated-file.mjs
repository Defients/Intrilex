import { readFile } from 'node:fs/promises';
import { writeFile } from './lib/write-with-retry.mjs';

/** Preserve metadata on a no-op so source watchers do not trigger another build. */
export async function writeGeneratedFile(file, content) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
  let previous;
  try { previous = await readFile(file); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previous?.equals(bytes)) return false;
  await writeFile(file, bytes);
  return true;
}
