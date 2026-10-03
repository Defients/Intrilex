import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashCanonical } from '@intrilex/shared';
import { ENGINE_VERSION, RULES_VERSION } from '@intrilex/engine-adapter';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function evolutionIdentity() {
  const engineDir = path.join(root, 'runtime/autonomy-engine-dist/src');
  const engine = await Promise.all((await readdir(engineDir)).filter(n => n.endsWith('.js')).sort()
    .map(async name => [name, hashCanonical(await readFile(path.join(engineDir, name), 'utf8'))]));
  const policyFiles = ['packages/policies/src/index.mjs', 'packages/policies/src/scoring.mjs', 'packages/policies/src/weighted-heuristic.mjs', 'packages/policy-sdk/src/contracts.mjs'];
  const policyImplementationHash = hashCanonical(await Promise.all(policyFiles.map(async name => [name, hashCanonical(await readFile(path.join(root, name), 'utf8'))])));
  const runners = ['packages/simulation-runtime/src/runtime.mjs', 'packages/simulation-runtime/src/evolution-lab.mjs', 'packages/simulation-runtime/src/evolution-session.mjs', 'packages/simulation-runtime/src/evolution-node-worker.mjs', 'apps/lab-web/src/autonomy-runtime.js', 'packages/simulation-runtime/src/evolution-domain.mjs', 'packages/simulation-runtime/src/evolution-research.mjs', 'packages/simulation-runtime/src/evolution-evaluation.mjs', 'packages/simulation-runtime/src/evolution-training.mjs', 'packages/engine-adapter/src/adapter.mjs', 'packages/engine-adapter/src/action-composition.mjs'];
  const runtimeHash = hashCanonical(await Promise.all(runners.map(async name => [name, hashCanonical(await readFile(path.join(root, name), 'utf8'))])));
  const engineHash = hashCanonical(engine);
  return { schemaVersion: 1, engineVersion: ENGINE_VERSION, rulesVersion: RULES_VERSION,
    engineHash, policyImplementationHash, runtimeHash,
    fingerprint: hashCanonical({ engineHash, policyImplementationHash, runtimeHash, engineVersion: ENGINE_VERSION, rulesVersion: RULES_VERSION }) };
}
