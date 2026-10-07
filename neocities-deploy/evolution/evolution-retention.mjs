import { CLEAN_REASONS } from './evolution-domain.mjs';

/** Artifact retention is operational: every slim record/hash stays intact.
 * Selection series persist one ordinary transcript plus failures/bookmarks;
 * held-out evaluation keeps the existing bounded sample. */
export function researchRunEvidence(run,purpose) {
  if(!['TRAINING','EVALUATION'].includes(purpose))throw new Error('INVALID_RESEARCH_PURPOSE');
  const copy=structuredClone(run);
  copy.researchPurpose=purpose; // Paired-series admission kind is separate from scientific use.
  if(purpose==='TRAINING'){
    const ordered=[...copy.replays].sort((a,b)=>a.ordinal-b.ordinal),sample=ordered.find(r=>CLEAN_REASONS.includes(copy.records.find(g=>g.ordinal===r.ordinal)?.terminationReason));
    copy.replays=ordered.filter(r=>r.replayId===sample?.replayId || copy.bookmarks.includes(r.replayId) || !CLEAN_REASONS.includes(copy.records.find(g=>g.ordinal===r.ordinal)?.terminationReason));
  }
  return copy;
}
