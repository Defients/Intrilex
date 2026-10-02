import { parentPort, workerData } from 'node:worker_threads';
import { runLabGame } from './evolution-lab.mjs';
import { CLEAN_REASONS } from './evolution-domain.mjs';
parentPort.on('message', ordinal => {
  const evidence = runLabGame(workerData.run, ordinal);
  // Keep transfer volume bounded; every record still carries transcript hashes.
  if (ordinal >= 12 && CLEAN_REASONS.includes(evidence.record.terminationReason)) evidence.replay = null;
  parentPort.postMessage(evidence);
});
