// ═══════════════════════════════════════════════════════════════
// migration-controller.js — Guest→permanent account migration controller
//
// When a guest (anonymous) player links their Discord account, this
// controller transfers their local achievements to the permanent account
// via the match authority server's MIGRATE_GUEST protocol message.
//
// Flow:
//   1. Auth controller detects ANONYMOUS→AUTHENTICATED transition
//   2. This controller reads local achievements from IndexedDB
//   3. Opens a short-lived WebSocket to the match server
//   4. Authenticates with the current access token
//   5. Sends MIGRATE_GUEST with source/target identity + achievements
//   6. Waits for MIGRATION_RESULT
//   7. Closes the WebSocket and notifies the UI
//   8. Marks local achievements as migrated (Commit 5)
//
// The controller is self-contained and does not require an active
// NetworkPlaySession — it opens its own connection.
// ═══════════════════════════════════════════════════════════════

import { getAchievementState, markAchievementsMigrated } from '../persistence.js';
import { migrateGuest, authenticate } from './network-protocol-client.mjs';
import {
  isMigrationPending,
  getGuestIdentity,
  getAccountId,
  getAccessToken,
  clearMigrationPending,
} from './auth-controller.js';
import { getMatchServerUrl } from './match-server-config.js';

/** @typedef {'IDLE'|'CONNECTING'|'AUTHENTICATING'|'MIGRATING'|'DONE'|'ERROR'} MigrationStatus */

let _status = 'IDLE';
let _lastResult = null;
const _listeners = new Set();

/**
 * Get the current migration status.
 * @returns {MigrationStatus}
 */
export function getMigrationStatus() {
  return _status;
}

/**
 * Get the last migration result.
 * @returns {{ success: boolean, migrationId: string, achievementsTransferred: number, alreadyMigrated: boolean } | null}
 */
export function getMigrationResult() {
  return _lastResult;
}

/**
 * Subscribe to migration status changes.
 * @param {(status: MigrationStatus, result: object|null) => void} listener
 * @returns {() => void} Unsubscribe function
 */
export function onMigrationStatusChange(listener) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

function setStatus(status, result = null) {
  _status = status;
  _lastResult = result;
  for (const listener of _listeners) {
    try { listener(status, result); } catch { /* ignore */ }
  }
}

/**
 * Extract achievement unlocks from the local achievement profile state.
 * @param {object} state - Achievement profile state from IndexedDB
 * @returns {Array<{ achievementId: string, unlockedAt: string, provenance: string }>}
 */
function extractAchievements(state) {
  if (!state || !state.unlocks) return [];
  const unlocks = [];
  for (const [achievementId, info] of Object.entries(state.unlocks)) {
    if (info && info.unlockedAt) {
      unlocks.push({
        achievementId,
        unlockedAt: typeof info.unlockedAt === 'string' ? info.unlockedAt : new Date(info.unlockedAt).toISOString(),
        provenance: info.provenance ?? 'LOCAL_DEVICE',
      });
    }
  }
  return unlocks;
}

/**
 * Attempt to run the guest→permanent migration if pending.
 * This is called after auth state changes to AUTHENTICATED.
 *
 * @param {object} [opts]
 * @param {string} [opts.serverUrl] - Override match server URL
 * @param {number} [opts.timeoutMs=15000] - WebSocket timeout
 * @returns {Promise<{ success: boolean, migrationId: string, achievementsTransferred: number, alreadyMigrated: boolean } | null>}
 *   Returns null if no migration is pending.
 */
export async function runMigrationIfPending(opts = {}) {
  if (!isMigrationPending()) return null;
  if (_status === 'CONNECTING' || _status === 'AUTHENTICATING' || _status === 'MIGRATING') return null;

  const sourceIdentity = getGuestIdentity();
  const targetIdentity = getAccountId();
  const accessToken = getAccessToken();

  if (!sourceIdentity || !targetIdentity || !accessToken) {
    clearMigrationPending();
    return null;
  }

  // Read local achievements from IndexedDB
  let achievements = [];
  try {
    const achState = await getAchievementState();
    achievements = extractAchievements(achState);
  } catch {
    // If we can't read achievements, still try the migration with an empty array
    // — the migration record will be written for idempotency
    achievements = [];
  }

  const serverUrl = opts.serverUrl ?? getMatchServerUrl();
  if (!serverUrl) {
    setStatus('ERROR', { success: false, error: 'Match server not configured' });
    return Promise.resolve(_lastResult);
  }
  const timeoutMs = opts.timeoutMs ?? 15000;

  setStatus('CONNECTING');

  return new Promise((resolve) => {
    let ws = null;
    let timeoutTimer = null;
    let settled = false;

    function cleanup() {
      if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null; }
      if (ws) {
        try { ws.close(); } catch { /* ignore */ }
        ws = null;
      }
    }

    function finish(result) {
      if (settled) return;
      settled = true;
      cleanup();
      clearMigrationPending();
      if (result && result.success) {
        // Mark local achievements as migrated (backup — data is not deleted)
        if (result.migrationId) {
          markAchievementsMigrated(result.migrationId).catch(() => {
            // Non-fatal — the cloud data is already written
          });
        }
        setStatus('DONE', result);
      } else {
        setStatus('ERROR', result);
      }
      resolve(result);
    }

    timeoutTimer = setTimeout(() => {
      finish(null);
    }, timeoutMs);

    try {
      ws = new WebSocket(serverUrl);
    } catch {
      finish(null);
      return;
    }

    ws.addEventListener('error', () => {
      finish(null);
    });

    ws.addEventListener('open', () => {
      setStatus('AUTHENTICATING');
      // Send AUTHENTICATE with the current access token
      try {
        ws.send(JSON.stringify(authenticate(accessToken)));
      } catch {
        finish(null);
      }
    });

    ws.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return; // Ignore malformed messages
      }

      if (msg.type === 'AUTHENTICATED') {
        // Authentication confirmed — send the migration request
        setStatus('MIGRATING');
        try {
          ws.send(JSON.stringify(migrateGuest(sourceIdentity, targetIdentity, achievements)));
        } catch {
          finish(null);
        }
      } else if (msg.type === 'MIGRATION_RESULT') {
        // Migration complete — close and return
        finish(msg.payload ?? null);
      } else if (msg.type === 'ERROR') {
        // Server returned an error
        finish({
          success: false,
          error: msg.payload?.message ?? 'Migration failed',
          migrationId: null,
          achievementsTransferred: 0,
          alreadyMigrated: false,
        });
      }
    });

    ws.addEventListener('close', () => {
      // If we haven't settled yet, the connection closed unexpectedly
      if (!settled) finish(null);
    });
  });
}

/**
 * Reset the migration controller state (for testing).
 */
export function _resetMigrationState() {
  _status = 'IDLE';
  _lastResult = null;
}
