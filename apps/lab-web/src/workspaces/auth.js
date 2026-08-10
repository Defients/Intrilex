// ═══════════════════════════════════════════════════════════════
// workspaces/auth.js — Sign In / Authentication workspace
//
// Renders the sign-in page with Discord OAuth and guest options.
// Reflects the current auth state from auth-controller.
// ═══════════════════════════════════════════════════════════════

import { app, esc, showToast } from '../state.js';
import { isSupabaseConfigured } from '../play/network/supabase-client.js';
import {
  getAuthState,
  getProfile,
  signInAnonymously,
  signInWithDiscord,
  signOut,
  subscribe,
} from '../play/network/auth-controller.js';

let _unsub = null;

export function renderAuth() {
  // Subscribe to auth state changes so the page updates live
  if (_unsub) { _unsub(); _unsub = null; }
  _unsub = subscribe(() => renderAuthInner());

  renderAuthInner();
}

function renderAuthInner() {
  const authState = getAuthState();
  const profile = getProfile();
  const configured = isSupabaseConfigured();

  if (!configured) {
    app.innerHTML = `<div class="auth-page">
      <div class="auth-card">
        <div class="auth-header">
          <span class="auth-glyph" aria-hidden="true">IX</span>
          <h2>Sign In</h2>
          <p class="auth-subtitle">Authentication is not configured in this environment.</p>
        </div>
        <div class="auth-body">
          <div class="notice warning">
            <strong>Auth unavailable.</strong>
            <p>Online sign-in requires a configured Supabase backend. You can still play locally against AI — online features require authentication.</p>
          </div>
          <a class="auth-back" href="#/">← Back to home</a>
        </div>
      </div>
    </div>`;
    return;
  }

  if (authState === 'AUTHENTICATED' || authState === 'ANONYMOUS') {
    const isAnon = authState === 'ANONYMOUS';
    app.innerHTML = `<div class="auth-page">
      <div class="auth-card">
        <div class="auth-header">
          <span class="auth-glyph" aria-hidden="true">IX</span>
          <h2>${isAnon ? 'Guest Session' : 'Signed In'}</h2>
          <p class="auth-subtitle">${isAnon ? 'You are playing as a guest.' : 'You are signed in.'}</p>
        </div>
        <div class="auth-body">
          <div class="auth-profile">
            <div class="auth-profile-avatar" aria-hidden="true">
              ${profile?.avatarUrl
                ? `<img src="${esc(profile.avatarUrl)}" alt="" />`
                : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>`}
            </div>
            <div class="auth-profile-info">
              <strong>${esc(profile?.displayName ?? 'Player')}</strong>
              <small>${esc(profile?.publicPlayerId ?? '')}</small>
              ${profile?.handle ? `<small>@${esc(profile.handle)}</small>` : ''}
            </div>
          </div>
          ${isAnon ? `<div class="notice info">
            <strong>Guest account.</strong>
            <p>Sign in with Discord to link your progress, ranked stats, and achievements to a permanent account.</p>
          </div>` : ''}
          <div class="auth-actions">
            ${isAnon ? `<button class="auth-button discord" id="auth-discord-link">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.3.5a18.3 18.3 0 0 1 4.3 1.4c-3.7-1.7-7.8-1.7-11.5 0A18.3 18.3 0 0 1 12 3.5L11.7 3a19.8 19.8 0 0 0-4.9 1.4C2.5 9.7 1.6 14.8 2 19.9a20 20 0 0 0 6 3l.6-1c-.6-.2-1.2-.5-1.7-.8l.4-.3c3.3 1.5 6.8 1.5 10 0l.4.3c-.5.3-1.1.6-1.7.8l.6 1a20 20 0 0 0 6-3c.5-6-1-11-3.3-15.5zM8.5 16.5c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2zm7 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2z"/></svg>
              Link Discord Account
            </button>` : ''}
            <button class="auth-button danger" id="auth-signout">Sign Out</button>
            <a class="auth-back" href="#/">← Back to home</a>
          </div>
        </div>
      </div>
    </div>`;
    wireAuthActions();
    return;
  }

  // SIGNED_OUT or UNCONFIGURED
  app.innerHTML = `<div class="auth-page">
    <div class="auth-card">
      <div class="auth-header">
        <span class="auth-glyph" aria-hidden="true">IX</span>
        <h2>Sign In</h2>
        <p class="auth-subtitle">Sign in to play online, track ranked stats, and earn achievements.</p>
      </div>
      <div class="auth-body">
        <div class="auth-actions">
          <button class="auth-button discord" id="auth-discord">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.3.5a18.3 18.3 0 0 1 4.3 1.4c-3.7-1.7-7.8-1.7-11.5 0A18.3 18.3 0 0 1 12 3.5L11.7 3a19.8 19.8 0 0 0-4.9 1.4C2.5 9.7 1.6 14.8 2 19.9a20 20 0 0 0 6 3l.6-1c-.6-.2-1.2-.5-1.7-.8l.4-.3c3.3 1.5 6.8 1.5 10 0l.4.3c-.5.3-1.1.6-1.7.8l.6 1a20 20 0 0 0 6-3c.5-6-1-11-3.3-15.5zM8.5 16.5c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2zm7 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2z"/></svg>
            Continue with Discord
          </button>
          <div class="auth-divider"><span>or</span></div>
          <button class="auth-button guest" id="auth-guest">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>
            Continue as Guest
          </button>
        </div>
        <div class="auth-info">
          <p><strong>Discord</strong> — Permanent account with ranked stats, achievements, and match history.</p>
          <p><strong>Guest</strong> — Quick anonymous session. Link to Discord later to keep your progress.</p>
        </div>
        <a class="auth-back" href="#/">← Back to home</a>
      </div>
    </div>
  </div>`;
  wireAuthActions();
}

function wireAuthActions() {
  const discordBtn = app.querySelector('#auth-discord, #auth-discord-link');
  const guestBtn = app.querySelector('#auth-guest');
  const signoutBtn = app.querySelector('#auth-signout');

  if (discordBtn) {
    discordBtn.addEventListener('click', async () => {
      discordBtn.disabled = true;
      const original = discordBtn.innerHTML;
      discordBtn.innerHTML = 'Redirecting…';
      try {
        const ok = await signInWithDiscord('/#/auth');
        if (!ok) {
          discordBtn.disabled = false;
          discordBtn.innerHTML = original;
          showToast('Sign-in failed. Please try again.', { type: 'error' });
        }
      } catch (err) {
        discordBtn.disabled = false;
        discordBtn.innerHTML = original;
        showToast(err.message ?? 'Sign-in failed', { type: 'error' });
      }
    });
  }

  if (guestBtn) {
    guestBtn.addEventListener('click', async () => {
      guestBtn.disabled = true;
      const original = guestBtn.innerHTML;
      guestBtn.innerHTML = 'Signing in…';
      try {
        const ok = await signInAnonymously();
        if (ok) {
          showToast('Signed in as guest', { type: 'success' });
        } else {
          guestBtn.disabled = false;
          guestBtn.innerHTML = original;
          showToast('Guest sign-in failed. Please try again.', { type: 'error' });
        }
      } catch (err) {
        guestBtn.disabled = false;
        guestBtn.innerHTML = original;
        showToast(err.message ?? 'Guest sign-in failed', { type: 'error' });
      }
    });
  }

  if (signoutBtn) {
    signoutBtn.addEventListener('click', async () => {
      signoutBtn.disabled = true;
      try {
        const ok = await signOut();
        if (ok) {
          showToast('Signed out', { type: 'info' });
        } else {
          signoutBtn.disabled = false;
          showToast('Sign-out failed. Please try again.', { type: 'error' });
        }
      } catch (err) {
        signoutBtn.disabled = false;
        showToast(err.message ?? 'Sign-out failed', { type: 'error' });
      }
    });
  }
}
