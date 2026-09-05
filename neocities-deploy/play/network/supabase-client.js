// ═══════════════════════════════════════════════════════════════
// supabase-client.js — Browser-side Supabase client factory
//
// Creates a singleton Supabase client using browser-safe publishable
// credentials. NEVER import the service role key in the browser.
//
// Configuration is read from window.__INTRILEX_CONFIG__ (injected by
// the dev server or build pipeline) or falls back to localStorage
// for local development.
// ═══════════════════════════════════════════════════════════════

import { createClient } from '../../vendor/supabase-js.js?v=75c53031ef21';

let _client = null;

/**
 * Read browser-safe Supabase configuration.
 * Priority: window.__INTRILEX_CONFIG__ > import.meta.env > localStorage
 * @returns {{ url: string, publishableKey: string } | null}
 */
function readConfig() {
  // Injected by dev server / build pipeline
  if (typeof window !== 'undefined' && window.__INTRILEX_CONFIG__?.supabase) {
    const { url, publishableKey } = window.__INTRILEX_CONFIG__.supabase;
    if (url && publishableKey) return { url, publishableKey };
  }
  // Vite-style env (future-proofing)
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (url && key) return { url, publishableKey: key };
  }
  // Local dev fallback (localStorage)
  if (typeof localStorage !== 'undefined') {
    const url = localStorage.getItem('intrilex:supabase:url');
    const key = localStorage.getItem('intrilex:supabase:publishableKey');
    if (url && key) return { url, publishableKey: key };
  }
  return null;
}

/**
 * Get or create the singleton Supabase browser client.
 * Uses the publishable (anon) key — never the service role key.
 *
 * @returns {import("../../vendor/supabase-js.js").SupabaseClient | null}
 *   Returns null when Supabase is not configured (offline/local-only mode).
 */
export function getSupabaseClient() {
  if (_client) return _client;
  const config = readConfig();
  if (!config) return null;
  _client = createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // Use PKCE for OAuth instead of implicit grant. This gives a proper
      // long-lived refresh token and avoids the implicit-flow sign-out bug
      // where the short refresh token fails validation immediately.
      flowType: 'pkce',
    },
  });
  return _client;
}

/**
 * Check if Supabase auth is available in this environment.
 * @returns {boolean}
 */
export function isSupabaseConfigured() {
  return readConfig() !== null;
}

/**
 * Reset the cached client (for testing or config change).
 */
export function _resetSupabaseClient() {
  _client = null;
}
