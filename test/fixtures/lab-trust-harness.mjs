/* global queueMicrotask */
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import * as domain from '../../packages/simulation-runtime/src/experiment-domain.mjs';
import * as portability from '../../packages/simulation-runtime/src/experiment-portability.mjs';
import { ExperimentStore } from '../../apps/lab-web/src/experiments/experiment-store.mjs';
import { hashCanonical } from '../../packages/shared/src/canonical.mjs';

export const config = { profileId: 'core-advanced-authority', policyIds: ['control', 'tempo'], matchCount: 6, ordinalStart: 0, ordinalEnd: 6, ordinalBase: 0, seedStrategy: 'ordinal-hash' };
export const summaries = (start, n) => Array.from({ length: n }, (_, i) => ({ matchId: `trust-${start + i}`, matchOrdinal: start + i, matchResultHash: hashCanonical({ ordinal: start + i }), terminationReason: 'NORMAL_VICTORY', winningSeat: 1, policyIds: config.policyIds }));

// Only UI/worker dependencies are stubbed. Domain, storage and controller
// logic are real. Native IndexedDB proof is a separate browser command.
export async function controller(store) {
  const src = (await readFile(new URL('../../apps/lab-web/src/experiments/experiment-controller.mjs', import.meta.url), 'utf8'))
    .replace(/import\s[^;]*?from\s*'[^']*';/gs, '').replace(/^export /gm, '');
  const sandbox = { ...domain, ...portability, ExperimentStore, hashCanonical, structuredClone, TextEncoder, setTimeout, queueMicrotask,
    console: { warn() {} }, Worker: class { constructor() { throw Error('No worker in controlled regression'); } },
    state: { bootState: null, observatory: {}, aggregate: {}, evidenceBasis: null }, showToast() {}, updateRailContext() {}, rerender() {},
    RULES_VERSION: '4.3.1', ENGINE_VERSION: '4.2.6', LAB_VERSION: 'wave0-test' };
  const api = runInNewContext(src + '\n({initExperiments,beginExperimentRun,commitExperimentBatch,resumeExperimentRun,registerRunExecutor,storePersisted})', sandbox);
  await api.initExperiments({ store });
  return api;
}

export async function diagnosticStore() {
  const store = new ExperimentStore(null);
  await store.open();
  // Explicit diagnostic backend: bypass only the storage-availability gate
  // to reproduce controller defects. This is NOT a durability/concurrency proof.
  store.persisted = true;
  return store;
}
