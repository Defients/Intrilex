// ═══════════════════════════════════════════════════════════════
// workspaces/auth.js — Sign In / Authentication workspace
//
// Renders the sign-in page with Discord OAuth and guest options.
// Reflects the current auth state from auth-controller.
// ═══════════════════════════════════════════════════════════════

import { app, esc, showToast } from '../state.js?v=75c53031ef21';
import { isSupabaseConfigured } from '../play/network/supabase-client.js?v=75c53031ef21';
import {
  getAuthState,
  getProfile,
  signInAnonymously,
  signInWithDiscord,
  signInWithGoogle,
  signOut,
  subscribe,
} from '../play/network/auth-controller.js?v=75c53031ef21';
import { legalAcknowledgmentHtml } from '../legal-pages.js?v=75c53031ef21';

let _unsub = null;

export function renderAuth(container = app) {
  // Subscribe to auth state changes so the page updates live
  if (_unsub) { _unsub(); _unsub = null; }
  _unsub = subscribe(() => renderAuthInner(container));

  renderAuthInner(container);
}

function renderAuthInner(container) {
  const authState = getAuthState();
  const profile = getProfile();
  const configured = isSupabaseConfigured();

  if (!configured) {
    container.innerHTML = `<div class="auth-page">
      <div class="auth-card">
        <div class="auth-header">
          <span class="auth-glyph" aria-hidden="true"><img src="assets/intrilex-icon.png" alt="" width="56" height="56" class="auth-glyph-icon" /></span>
          <h2>Sign In</h2>
          <p class="auth-subtitle">Authentication is not configured in this environment.</p>
        </div>
        <div class="auth-body">
          <div class="notice warning">
            <strong>Auth unavailable.</strong>
            <p>Online sign-in requires a configured Supabase backend. You can still play locally against AI — online features require authentication.</p>
          </div>
        </div>
      </div>
    </div>`;
    return;
  }

  if (authState === 'AUTHENTICATED' || authState === 'ANONYMOUS') {
    const isAnon = authState === 'ANONYMOUS';
    container.innerHTML = `<div class="auth-page">
      <div class="auth-card">
        <div class="auth-header">
          <span class="auth-glyph" aria-hidden="true"><img src="assets/intrilex-icon.png" alt="" width="56" height="56" class="auth-glyph-icon" /></span>
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
            <p>Link a Discord or Google account to keep your progress, ranked stats, and achievements on a permanent account.</p>
          </div>` : ''}
          <div class="auth-actions">
            ${isAnon ? `<button class="auth-button discord" id="auth-discord-link">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.3.5a18.3 18.3 0 0 1 4.3 1.4c-3.7-1.7-7.8-1.7-11.5 0A18.3 18.3 0 0 1 12 3.5L11.7 3a19.8 19.8 0 0 0-4.9 1.4C2.5 9.7 1.6 14.8 2 19.9a20 20 0 0 0 6 3l.6-1c-.6-.2-1.2-.5-1.7-.8l.4-.3c3.3 1.5 6.8 1.5 10 0l.4.3c-.5.3-1.1.6-1.7.8l.6 1a20 20 0 0 0 6-3c.5-6-1-11-3.3-15.5zM8.5 16.5c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2zm7 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2z"/></svg>
              Link Discord Account
            </button>
            <button class="auth-button google" id="auth-google-link">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Link Google Account
            </button>` : ''}
            <button class="auth-button" id="auth-continue">Continue to Lobby</button>
            <button class="auth-button danger" id="auth-signout">Sign Out</button>
          </div>
        </div>
      </div>
    </div>`;
    wireAuthActions(container);
    return;
  }

  // SIGNED_OUT or UNCONFIGURED
  container.innerHTML = `<div class="auth-page">
    <div class="auth-card">
      <div class="auth-header">
        <span class="auth-glyph" aria-hidden="true"><img src="assets/intrilex-icon.png" alt="" width="56" height="56" class="auth-glyph-icon" /></span>
        <h2>Sign In</h2>
        <p class="auth-subtitle">Sign in to play online, track ranked stats, and earn achievements.</p>
      </div>
      <div class="auth-body">
        <div class="auth-actions">
          <button class="auth-button discord" id="auth-discord">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.3.5a18.3 18.3 0 0 1 4.3 1.4c-3.7-1.7-7.8-1.7-11.5 0A18.3 18.3 0 0 1 12 3.5L11.7 3a19.8 19.8 0 0 0-4.9 1.4C2.5 9.7 1.6 14.8 2 19.9a20 20 0 0 0 6 3l.6-1c-.6-.2-1.2-.5-1.7-.8l.4-.3c3.3 1.5 6.8 1.5 10 0l.4.3c-.5.3-1.1.6-1.7.8l.6 1a20 20 0 0 0 6-3c.5-6-1-11-3.3-15.5zM8.5 16.5c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2zm7 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2z"/></svg>
            Continue with Discord
          </button>
          <button class="auth-button google" id="auth-google">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>
          <div class="auth-divider"><span>or</span></div>
          <button class="auth-button guest" id="auth-guest">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>
            Continue as Guest
          </button>
        </div>
        <div class="auth-info">
          <p><strong>Discord</strong> — Permanent account with ranked stats, achievements, and match history.</p>
          <p><strong>Google</strong> — Permanent account using your Google identity.</p>
          <p><strong>Guest</strong> — Quick anonymous session. Link to Discord or Google later to keep your progress.</p>
        </div>
        ${legalAcknowledgmentHtml()}
      </div>
    </div>
  </div>`;
  wireAuthActions(container);
}

function wireAuthActions(container) {
  const discordBtn = container.querySelector('#auth-discord, #auth-discord-link');
  const googleBtn = container.querySelector('#auth-google, #auth-google-link');
  const guestBtn = container.querySelector('#auth-guest');
  const continueBtn = container.querySelector('#auth-continue');
  const signoutBtn = container.querySelector('#auth-signout');

  if (discordBtn) {
    discordBtn.addEventListener('click', async () => {
      discordBtn.disabled = true;
      const original = discordBtn.innerHTML;
      discordBtn.innerHTML = 'Redirecting…';
      try {
        const ok = await signInWithDiscord();
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

  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      googleBtn.disabled = true;
      const original = googleBtn.innerHTML;
      googleBtn.innerHTML = 'Redirecting…';
      try {
        const ok = await signInWithGoogle();
        if (!ok) {
          googleBtn.disabled = false;
          googleBtn.innerHTML = original;
          showToast('Sign-in failed. Please try again.', { type: 'error' });
        }
      } catch (err) {
        googleBtn.disabled = false;
        googleBtn.innerHTML = original;
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

  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      // Navigate to the online play lobby. If this card is rendered inside
      // the auth overlay, openAuthOverlay in app.js will also close it.
      window.location.hash = '/play/online';
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
