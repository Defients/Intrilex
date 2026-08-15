// ═══════════════════════════════════════════════════════════════
// workspaces/settings.js — Settings workspace
//
// User-configurable app settings:
//   - Display: reduced motion, sensory reduction, FX toggle
//   - Network: match authority server URL
//   - Account: auth state, sign-in / sign-out link
//   - Data: clear local saves, reset settings
// ═══════════════════════════════════════════════════════════════

import { app, esc, state, showToast, persistSetting } from '../state.js?v=9ea1c2f9e91d';
import { getAuthState, getProfile, signOut, subscribe } from '../play/network/auth-controller.js?v=9ea1c2f9e91d';
import { isSupabaseConfigured } from '../play/network/supabase-client.js?v=9ea1c2f9e91d';
import { validateMatchServerUrl } from '../play/network/match-server-config.js?v=9ea1c2f9e91d';

let _unsub = null;

/**
 * Render a human-readable auth-provider label for the account badge.
 * @param {string|null|undefined} provider
 * @returns {string}
 */
function providerLabel(provider) {
  if (!provider) return 'Verified';
  const map = { discord: 'Discord', google: 'Google' };
  return map[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

export function renderSettings(container = app) {
  if (_unsub) { _unsub(); _unsub = null; }
  _unsub = subscribe(() => renderSettingsInner(container));
  renderSettingsInner(container);
}

function renderSettingsInner(container) {
  const authState = getAuthState();
  const profile = getProfile();
  const configured = isSupabaseConfigured();

  let networkServerUrl = '';
  try { networkServerUrl = localStorage.getItem('intrilex:network-server-url') || ''; } catch { /* ignore */ }

  container.innerHTML = `<div class="settings-page">
    <section class="settings-section">
      <h2>Display & Accessibility</h2>
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
      <div class="settings-row">
        <label class="settings-toggle">
          <input type="checkbox" id="settings-haptics" ${state.haptics ? 'checked' : ''} />
          <span class="settings-toggle-label">
            <strong>Haptic Feedback</strong>
            <small>Vibration on key game events (mobile only)</small>
          </span>
        </label>
      </div>
      <div class="settings-row">
        <label class="settings-toggle">
          <input type="checkbox" id="settings-high-contrast" ${state.highContrast ? 'checked' : ''} />
          <span class="settings-toggle-label">
            <strong>High Contrast</strong>
            <small>Maximize color contrast for readability</small>
          </span>
        </label>
      </div>
      <div class="settings-row">
        <label class="settings-toggle">
          <input type="checkbox" id="settings-seasonal" ${state.seasonalThemes ? 'checked' : ''} />
          <span class="settings-toggle-label">
            <strong>Seasonal Themes</strong>
            <small>Adjust ambient colors for the current season</small>
          </span>
        </label>
      </div>
    </section>

    <section class="settings-section">
      <h2>Network</h2>
      <div class="settings-row">
        <label class="settings-field">
          <span class="settings-field-label"><strong>Match Authority Server</strong><small>WebSocket URL for online duels. Leave blank for auto-detection.</small></span>
          <input type="text" id="settings-server-url" value="${esc(networkServerUrl)}" placeholder="auto" />
        </label>
      </div>
    </section>

    <section class="settings-section">
      <h2>Account</h2>
      <div class="settings-account">
        ${renderAccountSection(authState, profile, configured)}
      </div>
    </section>

    <section class="settings-section">
      <h2>Data</h2>
      <div class="settings-row">
        <button class="settings-button danger" id="settings-clear-saves">Clear Local Match Saves</button>
        <button class="settings-button" id="settings-reset">Reset Settings to Defaults</button>
      </div>
    </section>
  </div>`;

  wireSettingsActions(container);
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
        <span class="settings-account-badge ${isAnon ? 'guest' : 'verified'}">${isAnon ? 'Guest' : providerLabel(profile?.provider)}</span>
      </div>
      <div class="settings-account-actions">
        ${isAnon ? `<a class="settings-button primary" href="#/auth">Link Account →</a>` : ''}
        <button class="settings-button danger" id="settings-signout">Sign Out</button>
      </div>
    </div>`;
  }
  return `<div class="settings-account-signedout">
    <p>You are not signed in.</p>
    <a class="settings-button primary" href="#/auth">Sign In →</a>
  </div>`;
}

function wireSettingsActions(container) {
  const reducedMotion = container.querySelector('#settings-reduced-motion');
  const reducedSensory = container.querySelector('#settings-reduced-sensory');
  const fxToggle = container.querySelector('#settings-fx');
  const hapticsToggle = container.querySelector('#settings-haptics');
  const highContrastToggle = container.querySelector('#settings-high-contrast');
  const seasonalToggle = container.querySelector('#settings-seasonal');
  const serverUrlInput = container.querySelector('#settings-server-url');
  const clearSavesBtn = container.querySelector('#settings-clear-saves');
  const resetBtn = container.querySelector('#settings-reset');
  const signoutBtn = container.querySelector('#settings-signout');

  if (reducedMotion) {
    reducedMotion.addEventListener('change', () => {
      state.reducedMotion = reducedMotion.checked;
      document.body.classList.toggle('reduced-motion', state.reducedMotion);
      persistSetting('reducedMotion', state.reducedMotion);
      showToast(`Reduced motion ${state.reducedMotion ? 'enabled' : 'disabled'}`, { type: 'info' });
    });
  }

  if (reducedSensory) {
    reducedSensory.addEventListener('change', () => {
      state.reducedSensory = reducedSensory.checked;
      document.body.classList.toggle('reduced-sensory', state.reducedSensory);
      persistSetting('reducedSensory', state.reducedSensory);
      showToast(`Reduced sensory ${state.reducedSensory ? 'enabled' : 'disabled'}`, { type: 'info' });
    });
  }

  if (fxToggle) {
    fxToggle.addEventListener('change', () => {
      state.fx = fxToggle.checked;
      document.body.classList.toggle('fx-off', !state.fx);
      persistSetting('fx', state.fx);
      showToast(`Frame effects ${state.fx ? 'enabled' : 'disabled'}`, { type: 'info' });
    });
  }

  if (hapticsToggle) {
    hapticsToggle.addEventListener('change', () => {
      state.haptics = hapticsToggle.checked;
      persistSetting('haptics', state.haptics);
      try { import('../play/touch/haptics.js?v=9ea1c2f9e91d').then(m => m.setHapticsEnabled(state.haptics)); } catch { /* ignore */ }
      showToast(`Haptic feedback ${state.haptics ? 'enabled' : 'disabled'}`, { type: 'info' });
    });
  }

  if (highContrastToggle) {
    highContrastToggle.addEventListener('change', () => {
      state.highContrast = highContrastToggle.checked;
      document.body.classList.toggle('high-contrast', state.highContrast);
      persistSetting('highContrast', state.highContrast);
      showToast(`High contrast ${state.highContrast ? 'enabled' : 'disabled'}`, { type: 'info' });
    });
  }

  if (seasonalToggle) {
    seasonalToggle.addEventListener('change', () => {
      state.seasonalThemes = seasonalToggle.checked;
      persistSetting('seasonalThemes', state.seasonalThemes);
      if (state.seasonalThemes) {
        import('../landing/seasonal-theme.js?v=9ea1c2f9e91d').then(m => m.applySeasonalTheme()).catch(() => {});
      } else {
        document.documentElement.removeAttribute('data-season');
      }
      showToast(`Seasonal themes ${state.seasonalThemes ? 'enabled' : 'disabled'}`, { type: 'info' });
    });
  }

  if (serverUrlInput) {
    serverUrlInput.addEventListener('change', () => {
      const val = serverUrlInput.value.trim();
      try {
        if (val) {
          // IRX-M11: Validate the URL before saving to prevent invalid/ineffective URLs
          const check = validateMatchServerUrl(val);
          if (!check.valid) {
            showToast(`Invalid server URL: ${check.reason}`, { type: 'error' });
            // Reset the input to the current stored value
            const current = localStorage.getItem('intrilex:network-server-url') || '';
            serverUrlInput.value = current;
            return;
          }
          localStorage.setItem('intrilex:network-server-url', val);
          showToast('Network server URL saved', { type: 'success' });
        } else {
          localStorage.removeItem('intrilex:network-server-url');
          showToast('Network server URL cleared', { type: 'info' });
        }
      } catch {
        showToast('Could not save setting', { type: 'error' });
      }
    });
  }

  if (clearSavesBtn) {
    clearSavesBtn.addEventListener('click', async () => {
      if (!confirm('Clear all local match saves? This cannot be undone.')) return;
      try {
        const { isIndexedDBAvailable, listSaves, deleteSave } = await import('../play/persistence.js?v=9ea1c2f9e91d');
        if (!isIndexedDBAvailable()) { showToast('No local saves found', { type: 'info' }); return; }
        const saves = await listSaves();
        if (!saves || saves.length === 0) { showToast('No local saves found', { type: 'info' }); return; }
        // Delete each save from IndexedDB
        for (const save of saves) {
          try { await deleteSave(save.saveId); } catch { /* ignore individual errors */ }
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
      state.haptics = true;
      state.highContrast = false;
      state.seasonalThemes = true;
      state.layout = 'observatory';
      state.visibility = 'public';
      document.body.classList.remove('reduced-motion', 'reduced-sensory', 'fx-off', 'high-contrast');
      try { localStorage.removeItem('intrilex:settings'); } catch { /* ignore */ }
      try { localStorage.removeItem('intrilex:network-server-url'); } catch { /* ignore */ }
      renderSettingsInner(container);
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
