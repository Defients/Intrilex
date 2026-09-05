// ═══════════════════════════════════════════════════════════════
// session-lease.js — Duplicate tab protection via session lease
//
// Prevents two tabs from silently mutating the same match.
// Uses a local session lease via BroadcastChannel + localStorage.
//
// If a second tab opens:
//   "This match is active in another tab.
//    Open read-only, take control, or cancel."
//
// Taking control must be explicit.
// ═══════════════════════════════════════════════════════════════

const LEASE_KEY_PREFIX = 'intrilex-session-lease:';
const LEASE_TTL_MS = 5000; // 5 seconds — renewed by heartbeat

/**
 * Check if a BroadcastChannel is available.
 */
function getBroadcastChannel() {
  if (typeof BroadcastChannel !== 'undefined') {
    return new BroadcastChannel('intrilex-session-lease');
  }
  return null;
}

let _heartbeatTimer = null;
let _currentLease = null;
let _channel = null;
let _pagehideReleaseInstalled = false;

/**
 * Acquire a session lease for a match.
 * Returns true if the lease was acquired, false if another tab holds it.
 *
 * @param {string} sessionId - The session ID to lease
 * @param {string} tabId - A unique tab identifier
 * @returns {Promise<{acquired: boolean, holder: string|null}>}
 */
export async function acquireLease(sessionId, tabId) {
  const key = LEASE_KEY_PREFIX + sessionId;

  // Check for existing lease
  const existing = readLease(key);
  if (existing && existing.tabId !== tabId && !isLeaseExpired(existing)) {
    return { acquired: false, holder: existing.tabId };
  }

  // Acquire the lease
  const lease = {
    tabId,
    sessionId,
    acquiredAt: Date.now(),
    lastHeartbeat: Date.now(),
  };

  try {
    localStorage.setItem(key, JSON.stringify(lease));
  } catch {
    // localStorage may be unavailable — proceed without lease
    return { acquired: true, holder: null };
  }

  _currentLease = lease;

  // Start heartbeat
  startHeartbeat(key, tabId, sessionId);

  // Notify other tabs
  if (!_channel) _channel = getBroadcastChannel();
  if (_channel) {
    _channel.postMessage({ type: 'LEASE_ACQUIRED', sessionId, tabId });
  }

  // Listen for lease challenges from other tabs
  setupLeaseListener(key, tabId, sessionId);
  installPagehideRelease();

  return { acquired: true, holder: null };
}

/**
 * Release a session lease.
 *
 * @param {string} sessionId - The session ID
 * @param {string} tabId - The tab that holds the lease
 */
export function releaseLease(sessionId, tabId) {
  const key = LEASE_KEY_PREFIX + sessionId;
  const existing = readLease(key);

  if (existing && existing.tabId === tabId) {
    try {
      localStorage.removeItem(key);
    } catch { /* ignore */ }
  }

  stopHeartbeat();

  if (_channel) {
    _channel.postMessage({ type: 'LEASE_RELEASED', sessionId, tabId });
    _channel.close();
    _channel = null;
  }

  _currentLease = null;
}

/**
 * Check if a session is leased by another tab.
 *
 * @param {string} sessionId - The session ID to check
 * @param {string} currentTabId - The current tab's ID
 * @returns {{ leased: boolean, holder: string|null }}
 */
export function checkLease(sessionId, currentTabId) {
  const key = LEASE_KEY_PREFIX + sessionId;
  const existing = readLease(key);

  if (!existing) return { leased: false, holder: null };
  if (isLeaseExpired(existing)) return { leased: false, holder: null };
  if (existing.tabId === currentTabId) return { leased: false, holder: null };

  return { leased: true, holder: existing.tabId };
}

/**
 * Force-take a lease from another tab.
 * This should only be called after explicit user confirmation.
 *
 * @param {string} sessionId - The session ID
 * @param {string} tabId - The tab taking control
 */
export async function forceTakeLease(sessionId, tabId) {
  const key = LEASE_KEY_PREFIX + sessionId;

  // Overwrite the lease
  const lease = {
    tabId,
    sessionId,
    acquiredAt: Date.now(),
    lastHeartbeat: Date.now(),
  };

  try {
    localStorage.setItem(key, JSON.stringify(lease));
  } catch { /* ignore */ }

  _currentLease = lease;
  startHeartbeat(key, tabId, sessionId);

  if (!_channel) _channel = getBroadcastChannel();
  if (_channel) {
    _channel.postMessage({ type: 'LEASE_TAKEN', sessionId, tabId });
  }

  return { acquired: true };
}

/**
 * Generate a unique tab ID.
 */
export function generateTabId() {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Internal helpers ───────────────────────────────────────────

/**
 * Release the current lease when this document is actually discarded. A
 * same-tab reload creates a fresh JS realm and tab id; without this release,
 * the restored page mistakes its own still-live lease for another tab until
 * TTL expiry. BFCache navigations retain the document and must retain control.
 */
function installPagehideRelease() {
  if (_pagehideReleaseInstalled || typeof window === 'undefined') return;
  _pagehideReleaseInstalled = true;
  window.addEventListener('pagehide', (event) => {
    if (event.persisted || !_currentLease) return;
    const { sessionId, tabId } = _currentLease;
    releaseLease(sessionId, tabId);
  }, { capture: true });
}

function readLease(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isLeaseExpired(lease) {
  return Date.now() - lease.lastHeartbeat > LEASE_TTL_MS;
}

function startHeartbeat(key, tabId, sessionId) {
  stopHeartbeat();
  _heartbeatTimer = setInterval(() => {
    const lease = readLease(key);
    if (lease && lease.tabId === tabId) {
      lease.lastHeartbeat = Date.now();
      try {
        localStorage.setItem(key, JSON.stringify(lease));
      } catch { /* ignore */ }
    }
  }, 2000); // Heartbeat every 2 seconds
}

function stopHeartbeat() {
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }
}

function setupLeaseListener(key, tabId, sessionId) {
  if (!_channel) _channel = getBroadcastChannel();
  if (!_channel) return;

  _channel.onmessage = (event) => {
    const msg = event.data;
    if (!msg || msg.sessionId !== sessionId) return;

    if (msg.type === 'LEASE_CHALLENGE' && msg.tabId !== tabId) {
      // Another tab is challenging our lease — respond if we still hold it
      const lease = readLease(key);
      if (lease && lease.tabId === tabId && !isLeaseExpired(lease)) {
        _channel.postMessage({ type: 'LEASE_HELD', sessionId, tabId });
      }
    }

    if (msg.type === 'LEASE_TAKEN' && msg.tabId !== tabId) {
      // Another tab took our lease — we should go read-only
      _currentLease = null;
      stopHeartbeat();
      // Dispatch a custom event for the app to handle
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('intrilex:lease-lost', { detail: { sessionId, takenBy: msg.tabId } }));
      }
    }
  };
}
