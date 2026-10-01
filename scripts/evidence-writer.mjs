import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { captureProvenance } from './release-provenance.mjs';

/** Diagnostic output never refreshes a tracked historical report. */
export function createEvidenceWriter(root) {
  const initial = captureProvenance(root);
  const outputRoot = path.resolve(root, 'reports/local') + path.sep;
  return async (target, bytes, ...options) => {
    if (!path.resolve(String(target)).startsWith(outputRoot)) throw new Error('EVIDENCE_OUTPUT_OUTSIDE_LOCAL_REPORTS');
    if (String(target).endsWith('.json') && typeof bytes === 'string') {
      const value = JSON.parse(bytes);
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const completed = captureProvenance(root);
        const changed = ['gitCommit', 'gitTree', 'lockfileSha256', 'enginePayloadHash'].some(key => initial[key] !== completed[key]);
        bytes = JSON.stringify({ ...value, ...(changed ? { status: 'FAIL', provenanceError: 'Inputs changed during control' } : {}),
          provenance: { ...initial, mode: 'full' }, completedProvenance: completed }, null, 2) + '\n';
      }
    }
    return writeFile(target, bytes, ...options);
  };
}
