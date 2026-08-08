import { parentPort, workerData } from 'node:worker_threads';
import { runPolicyMatch } from './runtime.mjs';
if (!parentPort) throw new Error('CAMPAIGN_WORKER_PARENT_PORT_UNAVAILABLE');
const results = workerData.matches.map((config) => {
  try {
    return { ordinal: config.ordinal, result: runPolicyMatch(config).summary };
  } catch (error) {
    return { ordinal: config.ordinal, error: error.code ?? error.message ?? 'WORKER_MATCH_ERROR' };
  }
});
parentPort.postMessage(results);
parentPort.close();
