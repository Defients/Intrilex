import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashCanonical } from '@intrilex/shared';
import { ENGINE_VERSION, RULES_VERSION } from '@intrilex/engine-adapter';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Reviewed behavior roots, recursively followed through literal imports.
// Instrumentation and experiment contracts form an explicit analysis boundary.
export const IDENTITY_DEPENDENCIES = Object.freeze({
  execution: ['packages/simulation-runtime/src/runtime.mjs', 'apps/lab-web/src/autonomy-runtime.js',
    'packages/simulation-runtime/src/campaign.mjs', 'packages/simulation-runtime/src/evidence-identity.mjs'],
  analysis: ['packages/simulation-runtime/src/profile-science.mjs', 'packages/simulation-runtime/src/profile-contracts.mjs',
    'packages/simulation-runtime/src/evolution-lab.mjs', 'packages/simulation-runtime/src/evolution-session.mjs',
    'packages/simulation-runtime/src/evolution-node-worker.mjs', 'packages/simulation-runtime/src/experiment-domain.mjs'],
  analysisBoundary: ['strategic-telemetry.mjs', 'combo-telemetry.mjs', 'strategy-contracts.mjs', 'rank-attribution.mjs',
    'browser-analytics.js', 'evolution-domain.mjs', 'evolution-research.mjs', 'evolution-training.mjs', 'evolution-evaluation.mjs'],
});

/** Injected reader permits perturbation tests without changing source files.
 * Unresolved local imports fail generation; legacy archives remain untouched. */
export async function evolutionIdentity({ readSource = name => readFile(path.join(root, name), 'utf8') } = {}) {
  const policies = (await readdir(path.join(root, 'packages/game-ai/src'))).filter(n => n.endsWith('.mjs')).map(n => `packages/game-ai/src/${n}`);
  const engine = (await readdir(path.join(root, 'runtime/autonomy-engine-dist/src'))).filter(n => n.endsWith('.js')).map(n => `runtime/autonomy-engine-dist/src/${n}`);
  const boundary = new Set(IDENTITY_DEPENDENCIES.analysisBoundary), instrumentation = [];
  const normalize = name => path.posix.normalize(name.replaceAll(String.fromCharCode(92), '/'));
  const resolveImport = async (name, specifier) => {
    if (specifier.startsWith('node:')) return null;
    if (specifier.startsWith('@intrilex/')) {
      const [pkg, ...sub] = specifier.slice('@intrilex/'.length).split('/');
      const metadata = JSON.parse(await readSource(`packages/${pkg}/package.json`));
      const target = typeof metadata.exports === 'string' ? metadata.exports : metadata.exports?.[sub.length ? `./${sub.join('/')}` : '.'];
      if (typeof target !== 'string') throw new Error(`IDENTITY_IMPORT_UNRESOLVED:${specifier}`);
      return normalize(`packages/${pkg}/${target}`);
    }
    if (!specifier.startsWith('.')) return null;
    if (name.startsWith('apps/lab-web/src/')) {
      if (specifier.includes('/evolution/identity.mjs')) return null;
      if (specifier.startsWith('./evolution/')) return `packages/simulation-runtime/src/${specifier.slice('./evolution/'.length)}`;
      if (specifier.startsWith('./engine/')) return `runtime/autonomy-engine-dist/src/${specifier.slice('./engine/'.length)}`;
    }
    return normalize(path.posix.join(path.posix.dirname(name), specifier));
  };
  const closure = async (roots, execution = false) => {
    const files = new Map(), queue = [...roots];
    while (queue.length) {
      const name = normalize(queue.pop()); if (files.has(name)) continue;
      if (execution && (boundary.has(path.posix.basename(name)) || name.startsWith('packages/telemetry/') || name.startsWith('packages/decision-intelligence/'))) { instrumentation.push(name); continue; }
      const source = await readSource(name); files.set(name, hashCanonical(source));
      const imports = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/g)].map(m => m[1]);
      for (const specifier of imports) { const target = await resolveImport(name, specifier); if (target) queue.push(target); }
    }
    return [...files].sort(([a], [b]) => a.localeCompare(b));
  };
  const execution = await closure([...IDENTITY_DEPENDENCIES.execution, ...policies, ...engine, 'pnpm-lock.yaml', 'scripts/build-engine-patch.mjs'], true);
  const analysis = await closure([...IDENTITY_DEPENDENCIES.analysis, ...instrumentation]);
  const engineHash = hashCanonical(execution.filter(([n]) => n.startsWith('runtime/autonomy-engine-dist/')));
  const policyImplementationHash = hashCanonical(execution.filter(([n]) => /^packages\/(policies|game-ai|policy-sdk)\//.test(n)));
  const runtimeHash = hashCanonical(execution);
  const fingerprint = hashCanonical({ engineHash, policyImplementationHash, runtimeHash, engineVersion: ENGINE_VERSION, rulesVersion: RULES_VERSION });
  const analysisHash = hashCanonical(analysis);
  return { schemaVersion: 1, identityContract: 'intrilex-implementation@2', engineVersion: ENGINE_VERSION, rulesVersion: RULES_VERSION,
    engineHash, policyImplementationHash, runtimeHash, fingerprint, analysisHash,
    analysisFingerprint: hashCanonical({ fingerprint, analysisHash }), dependencyManifest: { execution, analysis } };
}
