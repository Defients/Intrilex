// ═══════════════════════════════════════════════════════════════
// workspaces/settings.js — Settings workspace
//
// User-configurable app settings:
//   - Display: reduced motion, sensory reduction, FX toggle
//   - Network: match authority server URL
//   - Account: auth state, sign-in / sign-out link
//   - Data: clear local saves, reset settings
// ═══════════════════════════════════════════════════════════════

import { app, esc, state, showToast } from '../state.js';
import { getAuthState, getProfile, signOut, subscribe } from '../play/network/auth-controller.js';
import { isSupabaseConfigured } from '../play/network/supabase-client.js';

let _unsub = null;

export function renderSettings() {
  if (_unsub) { _unsub(); _unsub = null; }
  _unsub = subscribe(() => renderSettingsInner());
  renderSettingsInner();
}

function renderSettingsInner() {
  const authState = getAuthState();
  const profile = getProfile();
  const configured = isSupabaseConfigured();

  let networkServerUrl = '';
  try { networkServerUrl = localStorage.getItem('intrilex:network-server-url') || ''; } catch { /* ignore */ }

  app.innerHTML = `<div class="settings-page">
    <section class="settings-section">
      <h3>Display & Accessibility</h3>
      <div class="settings-row">
        <label class="settings-toggle">
          <input type="checkbox" id="settings-reduced-motion" ${state.reducedMotion ? 'checked' : ''} />
          <span class="settings-toggle-label">
            <strong>Reduced Motion</strong>
            <small>Disable particle effects, screen flashes, and animations</small>
          </span>
        </label>
      </div>
      <div class="settings-row">
        <label class="settings-toggle">
          <input type="checkbox" id="settings-reduced-sensory" ${state.reducedSensory ? 'checked' : ''} />
          <span class="settings-toggle-label">
            <strong>Reduced Sensory</strong>
            <small>Minimize color intensity and visual noise</small>
          </span>
        </label>
      </div>
      <div class="settings-row">
        <label class="settings-toggle">
          <input type="checkbox" id="settings-fx" ${state.fx ? 'checked' : ''} />
          <span class="settings-toggle-label">
            <strong>Frame Effects</strong>
            <small>Show contextual FX overlays during match playback</small>
          </span>
        </label>
      </div>
    </section>

    <section class="settings-section">
      <h3>Network</h3>
      <div class="settings-row">
        <label class="settings-field">
          <span class="settings-field-label"><strong>Match Authority Server</strong><small>WebSocket URL for online duels. Leave blank for auto-detection.</small></span>
          <input type="text" id="settings-server-url" value="${esc(networkServerUrl)}" placeholder="auto" />
        </label>
      </div>
    </section>

    <section class="settings-section">
      <h3>Account</h3>
      <div class="settings-account">
        ${renderAccountSection(authState, profile, configured)}
      </div>
    </section>

    <section class="settings-section">
      <h3>Data</h3>
      <div class="settings-row">
        <button class="settings-button danger" id="settings-clear-saves">Clear Local Match Saves</button>
        <button class="settings-button" id="settings-reset">Reset Settings to Defaults</button>
      </div>
    </section>
  </div>`;

  wireSettingsActions();
}

function renderAccountSection(authState, profile, configured) {
  if (!configured) {
    return `<div class="notice warning"><strong>Auth not configured.</strong><p>Sign-in is not available in this environment.</p></div>`;
  }
  if (authState === 'AUTHENTICATED' || authState === 'ANONYMOUS') {
    const isAnon = authState === 'ANONYMOUS';
    return `<div class="settings-account-info">
      <div class="settings-account-avatar" aria-hidden="true">
        ${profile?.avatarUrl
          ? `<img src="${esc(profile.avatarUrl)}" alt="" />`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>`}
      </div>
      <div class="settings-account-details">
        <strong>${esc(profile?.displayName ?? 'Player')}</strong>
        <small>${esc(profile?.publicPlayerId ?? '')}</small>
        <span class="settings-account-badge ${isAnon ? 'guest' : 'verified'}">${isAnon ? 'Guest' : 'Discord'}</span>
      </div>
      <button class="settings-button danger" id="settings-signout">Sign Out</button>
    </div>`;
  }
  return `<div class="settings-account-signedout">
    <p>You are not signed in.</p>
    <a class="settings-button primary" href="#/auth">Sign In →</a>
  </div>`;
}

function wireSettingsActions() {
  const reducedMotion = app.querySelector('#settings-reduced-motion');
  const reducedSensory = app.querySelector('#settings-reduced-sensory');
  const fxToggle = app.querySelector('#settings-fx');
  const serverUrlInput = app.querySelector('#settings-server-url');
  const clearSavesBtn = app.querySelector('#settings-clear-saves');
  const resetBtn = app.querySelector('#settings-reset');
  const signoutBtn = app.querySelector('#settings-signout');

  if (reducedMotion) {
    reducedMotion.addEventListener('change', () => {
      state.reducedMotion = reducedMotion.checked;
      document.body.classList.toggle('reduced-motion', state.reducedMotion);
      showToast(`Reduced motion ${state.reducedMotion ? 'enabled' : 'disabled'}`, { type: 'info' });
    });
  }

  if (reducedSensory) {
    reducedSensory.addEventListener('change', () => {
      state.reducedSensory = reducedSensory.checked;
      showToast(`Reduced sensory ${state.reducedSensory ? 'enabled' : 'disabled'}`, { type: 'info' });
    });
  }

  if (fxToggle) {
    fxToggle.addEventListener('change', () => {
      state.fx = fxToggle.checked;
      showToast(`Frame effects ${state.fx ? 'enabled' : 'disabled'}`, { type: 'info' });
    });
  }

  if (serverUrlInput) {
    serverUrlInput.addEventListener('change', () => {
      const val = serverUrlInput.value.trim();
      try {
        if (val) localStorage.setItem('intrilex:network-server-url', val);
        else localStorage.removeItem('intrilex:network-server-url');
        showToast('Network server URL saved', { type: 'success' });
      } catch {
        showToast('Could not save setting', { type: 'error' });
      }
    });
  }

  if (clearSavesBtn) {
    clearSavesBtn.addEventListener('click', async () => {
      if (!confirm('Clear all local match saves? This cannot be undone.')) return;
      try {
        const { isIndexedDBAvailable, listSaves } = await import('../play/persistence.js');
        if (!isIndexedDBAvailable()) { showToast('No local saves found', { type: 'info' }); return; }
        const saves = await listSaves();
        if (!saves || saves.length === 0) { showToast('No local saves found', { type: 'info' }); return; }
        // Clear each save via the persistence module
        for (const save of saves) {
          try { localStorage.removeItem(`intrilex-save:${save.saveId}`); } catch { /* ignore */ }
        }
        showToast(`Cleared ${saves.length} local save(s)`, { type: 'success' });
      } catch (err) {
        showToast(err.message ?? 'Failed to clear saves', { type: 'error' });
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (!confirm('Reset all settings to defaults?')) return;
      state.reducedMotion = false;
      state.reducedSensory = false;
      state.fx = true;
      document.body.classList.remove('reduced-motion');
      try { localStorage.removeItem('intrilex:network-server-url'); } catch { /* ignore */ }
      renderSettingsInner();
      showToast('Settings reset to defaults', { type: 'success' });
    });
  }

  if (signoutBtn) {
    signoutBtn.addEventListener('click', async () => {
      signoutBtn.disabled = true;
      try {
        const ok = await signOut();
        if (ok) showToast('Signed out', { type: 'info' });
        else { signoutBtn.disabled = false; showToast('Sign-out failed', { type: 'error' }); }
      } catch (err) {
        signoutBtn.disabled = false;
        showToast(err.message ?? 'Sign-out failed', { type: 'error' });
      }
    });
  }
}
