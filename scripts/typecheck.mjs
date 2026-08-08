#!/usr/bin/env node
/**
 * typecheck.mjs — TypeScript type checking wrapper for CI.
 * Runs `tsc --noEmit` using the project tsconfig.json.
 * Exits with tsc's exit code (0 = pass, non-zero = type errors found).
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync('npx', ['tsc', '--noEmit'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
});
process.exit(result.status ?? 1);
