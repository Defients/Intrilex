// Replay verification intentionally runs outside the match server's event
// loop. Replaying a long match is CPU-bound and may take several seconds under
// load; doing it on the socket thread stalls acknowledgements and health checks.
import { parentPort, workerData } from 'node:worker_threads';
import { verifyAuthorityCertifiedReplay } from '@intrilex/engine-adapter';

try {
  verifyAuthorityCertifiedReplay(workerData);
  parentPort?.postMessage({ valid: true });
} catch (error) {
  parentPort?.postMessage({
    valid: false,
    error: error instanceof Error ? error.message : String(error),
  });
}
