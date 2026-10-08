export const persistenceLabel = state => ({ PENDING: 'Save pending', LOCALLY_COMMITTED: 'Saved locally', FAILED: 'Save failed', SESSION_ONLY: 'Session only' })[state] ?? 'Not saved';

/** Transaction acknowledgement owns save state; execution completion does not. */
export async function acknowledgedSave(save, onState, { sessionOnly = false } = {}) {
  onState('PENDING');
  try {
    const result = await save();
    onState(sessionOnly ? 'SESSION_ONLY' : 'LOCALLY_COMMITTED');
    return result;
  } catch (error) { onState('FAILED'); throw error; }
}
