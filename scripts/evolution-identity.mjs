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
  const policyFiles = ['packages/policies/src/index.mjs', 'packages/policies/src/scoring.mjs', 'packages/policies/src/tactics.mjs', 'packages/policies/src/action-evaluation.mjs', 'packages/policies/src/weighted-heuristic.mjs', 'packages/policy-sdk/src/contracts.mjs'];
  policyFiles.push('packages/policies/src/control-conversion.mjs');
  policyFiles.push(...(await readdir(path.join(root,'packages/game-ai/src'))).filter(n=>n.endsWith('.mjs')).sort().map(n=>`packages/game-ai/src/${n}`));
  const policyImplementationHash = hashCanonical(await Promise.all(policyFiles.map(async name => [name, hashCanonical(await readFile(path.join(root, name), 'utf8'))])));
  const runners = ['packages/simulation-runtime/src/runtime.mjs', 'packages/simulation-runtime/src/evolution-lab.mjs', 'packages/simulation-runtime/src/evolution-session.mjs', 'packages/simulation-runtime/src/evolution-node-worker.mjs', 'apps/lab-web/src/autonomy-runtime.js', 'packages/simulation-runtime/src/evolution-domain.mjs', 'packages/simulation-runtime/src/evolution-research.mjs', 'packages/simulation-runtime/src/evolution-evaluation.mjs', 'packages/simulation-runtime/src/evolution-training.mjs', 'packages/engine-adapter/src/adapter.mjs', 'packages/engine-adapter/src/action-composition.mjs', 'packages/engine-adapter/src/action-semantics.mjs'];
  runners.push('packages/simulation-runtime/src/strategic-telemetry.mjs','packages/simulation-runtime/src/matchup-lab.mjs','packages/simulation-runtime/src/batch-matrix.mjs');
  runners.push('packages/simulation-runtime/src/strategy-contracts.mjs','packages/simulation-runtime/src/strategy-branch.mjs');
  runners.push('apps/lab-web/src/strategy/strategy-player.js');
  runners.push('packages/simulation-runtime/src/strategy-evidence.mjs','packages/simulation-runtime/src/strategy-analysis.mjs','packages/simulation-runtime/src/strategy-synthesis.mjs','packages/simulation-runtime/src/strategy-information.mjs','packages/simulation-runtime/src/strategy-live.mjs');
  const runtimeHash = hashCanonical(await Promise.all(runners.map(async name => [name, hashCanonical(await readFile(path.join(root, name), 'utf8'))])));
  const engineHash = hashCanonical(engine);
  return { schemaVersion: 1, engineVersion: ENGINE_VERSION, rulesVersion: RULES_VERSION,
    engineHash, policyImplementationHash, runtimeHash,
    fingerprint: hashCanonical({ engineHash, policyImplementationHash, runtimeHash, engineVersion: ENGINE_VERSION, rulesVersion: RULES_VERSION }) };
}
