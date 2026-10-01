/** Owns the autosave timer and prevents old sessions replacing the Continue target. */
export function createSessionAutosave(state, { putSave, buildSaveIntegrityPayload, timers = globalThis, saveContinue = id => sessionStorage.setItem('intrilex-continue-save', id) }) {
  let inFlight = false;
  let generation = 0;
  function stopAutosave() {
    generation++;
    if (state.autosaveTimer) timers.clearInterval(state.autosaveTimer);
    state.autosaveTimer = null;
  }
  function startAutosave() {
    stopAutosave();
    const owner = generation;
    state.autosaveTimer = timers.setInterval(async () => {
      const session = state.session;
      if (inFlight || !session || session.status === 'TERMINAL') return;
      inFlight = true;
      try {
        const envelope = session.getSaveEnvelope();
        envelope.saveId = `AUTOSAVE-${session.sessionId}`;
        envelope.contentHash = buildSaveIntegrityPayload(envelope);
        await putSave(envelope);
        if (owner === generation && session === state.session) {
          try { saveContinue(envelope.saveId); } catch { /* unavailable storage */ }
        }
      } catch (error) { console.warn('Autosave failed:', error.message); }
      finally { inFlight = false; }
    }, 5000);
  }
  return { startAutosave, stopAutosave };
}
