// ═══════════════════════════════════════════════════════════════
// network-session.mjs — Browser-side network play adapter
//
// Connects to the match authority server via WebSocket.
// Exposes a view/interaction contract similar to local PlaySession
// so existing rendering can be reused.
//
// NEVER owns: engine state, command vault, RNG, seed, raw commands.
// Only receives authorized views and submits action IDs.
// ═══════════════════════════════════════════════════════════════

import {
  createMatch, joinMatch, resumeMatch, ready, submitAction,
  requestSync, leaveMatch, sendChat, chatVisibility,
  authenticate, authRefresh,
  PROTOCOL_VERSION,
} from './network-protocol-client.mjs';

// ── localStorage key for match reconnection ──
const RECONNECT_KEY = 'intrilex:network-match';

// ── Versioned reconnect-record schema ──
const RECONNECT_RECORD_SCHEMA_VERSION = 2;
const RECONNECT_TTL_MS = 1800000; // 30 minutes

// States that must never regress to READY or IN_LOBBY
const TERMINAL_STATES = new Set([
  'RUNNING',
  'TERMINAL',
  'ERROR',
]);

// Session states — mirror PlaySession for renderer compatibility
export const NetworkSessionState = Object.freeze({
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  CREATING: 'CREATING',
  JOINING: 'JOINING',
  IN_LOBBY: 'IN_LOBBY',
  READY: 'READY',
  RUNNING: 'RUNNING',
  TERMINAL: 'TERMINAL',
  ERROR: 'ERROR',
  RECONNECTING: 'RECONNECTING',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
});

/**
 * Allowed client state transitions.
 * Key = from state, Value = set of allowed target states.
 */
const ALLOWED_TRANSITIONS = {
  DISCONNECTED: new Set(['CONNECTING', 'ERROR', 'EXPIRED']),
  CONNECTING: new Set(['DISCONNECTED', 'CREATING', 'JOINING', 'RECONNECTING', 'ERROR', 'IN_LOBBY', 'READY', 'RUNNING']),
  CREATING: new Set(['IN_LOBBY', 'ERROR', 'DISCONNECTED']),
  JOINING: new Set(['IN_LOBBY', 'ERROR', 'DISCONNECTED', 'REJECTED']),
  RECONNECTING: new Set(['IN_LOBBY', 'READY', 'RUNNING', 'TERMINAL', 'ERROR', 'DISCONNECTED', 'EXPIRED']),
  IN_LOBBY: new Set(['READY', 'RUNNING', 'DISCONNECTED', 'ERROR', 'EXPIRED']),
  READY: new Set(['RUNNING', 'DISCONNECTED', 'ERROR', 'EXPIRED']),
  RUNNING: new Set(['TERMINAL', 'DISCONNECTED', 'ERROR']),
  TERMINAL: new Set(['DISCONNECTED']),
  ERROR: new Set(['DISCONNECTED', 'CONNECTING']),
  REJECTED: new Set(['DISCONNECTED']),
  EXPIRED: new Set(['DISCONNECTED']),
};

/**
 * NetworkPlaySession — browser-side network adapter.
 *
 * Usage:
 *   const session = new NetworkPlaySession('ws://localhost:3099');
 *   await session.connect();
 *   await session.createDuel('core-unrestricted-authority');
 *   // Share session.inviteCode with opponent
 *   // When opponent joins and both ready, match starts
 *   // session.submitAction(actionId, clientCommandId)
 */
export class NetworkPlaySession {
  constructor(url) {
    this._url = url;
    this._ws = null;
    this._requestId = 0;
    this._pending = new Map(); // requestId → { resolve, reject, timer }
    this._reconnectTimer = null;
    this._connectSettled = false; // Guard: connect() settles exactly once
    this._disposed = false;

    // v2 auth-pending state — when connect() awaits AUTHENTICATED
    this._authResolve = null;
    this._authReject = null;
    this._authTimeout = null;

    // Public state
    this.status = NetworkSessionState.DISCONNECTED;
    this.matchId = null;
    this.inviteCode = null;
    this.participantToken = null;
    this.participantId = null;
    this.playerId = null;
    this.opponentPlayerId = null;
    this.opponentConnectionState = null;

    // v2 auth state
    this.accessToken = null;       // Set before connect() for authenticated sessions
    this.authenticatedAccount = null;  // Set when AUTHENTICATED is received
    this.tokenExpiresAt = null;

    // Participant profiles (populated from AUTHENTICATED + match views)
    this.localProfile = null;      // { displayName, handle, avatarUrl, rating, rank }
    this.opponentProfile = null;   // { displayName, handle, avatarUrl, rating, rank }
    this.matchMode = null;         // 'private' | 'casual' | 'ranked'
    this.queueId = null;           // 'private' | 'casual' | 'ranked' | null

    // Chat visibility state (local player's preference)
    this.chatHidden = false;
    // Chat messages (network matches) — initialized early so the renderer
    // can read state.networkSession.chatMessages before any message arrives
    this.chatMessages = [];
    // Dedup set for exactly-once chat message delivery (NET-UX-01)
    this._seenChatMessageIds = new Set();
    // Game log system events (chat visibility changes from opponent, etc.)
    this.systemEvents = [];

    // Replay download metadata (set when REPLAY_AVAILABLE is received)
    this.replayUrl = null;
    this.replayHash = null;

    // Current authorized view (latest from server)
    this.currentView = null;

    // Pending submission tracking
    this._pendingAction = null;
    this._lastClientCommandId = null;

    // Error
    this.error = null;

    // Callbacks
    this.onStateChange = null; // (session) => void
    this.onError = null;       // (error) => void
  }

  // ── State transition guard ──

  /**
   * Transition to a new status, enforcing monotonicity rules.
   * RUNNING and TERMINAL never regress to READY or IN_LOBBY.
   */
  _transition(newStatus) {
    if (this.status === newStatus) return;
    // Never regress from RUNNING/TERMINAL to READY/IN_LOBBY
    if (TERMINAL_STATES.has(this.status) && !TERMINAL_STATES.has(newStatus) && newStatus !== 'DISCONNECTED' && newStatus !== 'ERROR') {
      return; // Block regression
    }
    // Check allowed transitions
    const allowed = ALLOWED_TRANSITIONS[this.status];
    if (allowed && !allowed.has(newStatus)) {
      return; // Block disallowed transition
    }
    this.status = newStatus;
  }

  // ── Connection ──

  connect() {
    return new Promise((resolve, reject) => {
      if (this._disposed) {
        reject(new Error('Session disposed'));
        return;
      }
      this._connectSettled = false;
      this._transition(NetworkSessionState.CONNECTING);
      try {
        this._ws = new WebSocket(this._url);
      } catch (err) {
        this.status = NetworkSessionState.ERROR;
        this.error = err.message;
        this._connectSettled = true;
        reject(err);
        return;
      }

      // Connection timeout (10s)
      const connectTimeout = setTimeout(() => {
        if (!this._connectSettled) {
          this._connectSettled = true;
          this.status = NetworkSessionState.ERROR;
          this.error = 'Connection timeout';
          try { this._ws.close(); } catch { /* ignore */ }
          reject(new Error('Connection timeout'));
        }
      }, 10000);

      this._ws.onopen = () => {
        if (this._connectSettled) return;
        clearTimeout(connectTimeout);
        // v2: Send AUTHENTICATE immediately on connect if we have an access token.
        // The server gates privileged commands (CREATE_MATCH, JOIN_MATCH, etc.)
        // behind successful authentication when authMode='required'.
        // When authMode='disabled' (dev), the server accepts this as a no-op.
        const sent = this._sendAuthenticate();
        if (sent) {
          // Wait for AUTHENTICATED before resolving — the server's
          // handleAuthenticate is async (verifies the token with Supabase),
          // so any privileged command sent before AUTHENTICATED arrives
          // would be rejected by the auth gate.
          this._authResolve = resolve;
          this._authReject = reject;
          this._authTimeout = setTimeout(() => {
            if (this._authResolve) {
              this._authResolve = null;
              this._authReject = null;
              this._authTimeout = null;
              this._connectSettled = true;
              this.status = NetworkSessionState.ERROR;
              this.error = 'Authentication timeout';
              reject(new Error('Authentication timeout'));
            }
          }, 10000);
        } else {
          // No token (dev mode) — resolve immediately
          this._connectSettled = true;
          resolve();
        }
      };

      this._ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this._handleMessage(msg);
        } catch {
          // Ignore malformed server messages
          if (this.onError) this.onError({ code: 'MALFORMED_JSON', message: 'Received malformed JSON from server' });
        }
      };

      this._ws.onclose = () => {
        clearTimeout(connectTimeout);
        if (this._authTimeout) {
          clearTimeout(this._authTimeout);
          this._authTimeout = null;
        }
        // Reject all pending requests immediately on terminal socket close
        this._rejectAllPending('Connection closed');
        if (!this._connectSettled) {
          // close-before-open
          this._connectSettled = true;
          this.status = NetworkSessionState.ERROR;
          this.error = 'Connection closed before open';
          reject(new Error('Connection closed before open'));
          return;
        }
        // Only transition to DISCONNECTED if not already in a terminal state
        if (this.status !== NetworkSessionState.TERMINAL && this.status !== NetworkSessionState.ERROR) {
          this._transition(NetworkSessionState.DISCONNECTED);
          this._notifyStateChange();
        }
      };

      this._ws.onerror = () => {
        // onclose will fire after this — don't settle here to avoid double-settle
        if (!this._connectSettled) {
          // If error fires before open, let onclose handle the rejection
        }
      };
    });
  }

  disconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._authTimeout) {
      clearTimeout(this._authTimeout);
      this._authTimeout = null;
    }
    this._authResolve = null;
    this._authReject = null;
    this._rejectAllPending('Session disconnected');
    if (this._ws) {
      // Remove listeners to prevent stale callbacks
      this._ws.onopen = null;
      this._ws.onmessage = null;
      this._ws.onclose = null;
      this._ws.onerror = null;
      try { this._ws.close(); } catch { /* ignore */ }
      this._ws = null;
    }
    this._transition(NetworkSessionState.DISCONNECTED);
  }

  /**
   * Dispose the session — clears all timers, listeners, and pending requests.
   * Called when the session is permanently removed (not for reconnect).
   */
  dispose() {
    this._disposed = true;
    this.disconnect();
  }

  // ── Lobby ──

  async createDuel(profileId = 'core-unrestricted-authority') {
    this._transition(NetworkSessionState.CREATING);
    const resp = await this._request(createMatch(profileId));
    if (resp.type === 'ERROR') {
      this._transition(NetworkSessionState.ERROR);
      this.error = resp.payload?.message ?? 'Create failed';
      this._notifyStateChange();
      return { error: this.error };
    }
    this.matchId = resp.payload.matchId;
    this.inviteCode = resp.payload.inviteCode;
    this.participantToken = resp.payload.participantToken;
    this.playerId = 'P1'; // Creator is always P1
    this.opponentPlayerId = 'P2';
    this._transition(NetworkSessionState.IN_LOBBY);
    this._saveReconnectInfo();
    this._notifyStateChange();
    return { matchId: this.matchId, inviteCode: this.inviteCode };
  }

  async joinDuel(inviteCode) {
    this._transition(NetworkSessionState.JOINING);
    const resp = await this._request(joinMatch(inviteCode));
    if (resp.type === 'ERROR') {
      this._transition(NetworkSessionState.REJECTED);
      this.error = resp.payload?.message ?? 'Join failed';
      this._notifyStateChange();
      return { error: this.error };
    }
    this.matchId = resp.payload.matchId;
    this.participantToken = resp.payload.participantToken;
    this.playerId = resp.payload.seat;
    this.opponentPlayerId = this.playerId === 'P1' ? 'P2' : 'P1';
    // Fallback: assume the opponent (creator) is connected. The server sends
    // a PARTICIPANT_STATUS message immediately after MATCH_JOINED that will
    // set the correct state. This default prevents the lobby UI from
    // flashing "Waiting for opponent…" when the opponent is already there.
    // If the opponent is actually disconnected, the server's
    // PARTICIPANT_STATUS(DISCONNECTED) will correct this.
    if (this.opponentConnectionState === null) {
      this.opponentConnectionState = 'CONNECTED';
    }
    this._transition(NetworkSessionState.IN_LOBBY);
    this._saveReconnectInfo();
    this._notifyStateChange();
    return { matchId: this.matchId, playerId: this.playerId };
  }

  async markReady() {
    const resp = await this._request(ready(this.matchId, this.participantToken));
    if (resp.type === 'ERROR') {
      this.error = resp.payload?.message ?? 'Ready failed';
      this._notifyStateChange();
      return { error: this.error };
    }
    // Apply the view — this may transition to RUNNING if MATCH_STARTED
    // was already received via broadcast
    if (resp.payload?.view) {
      this._applyView(resp.payload.view);
    }
    // Only set READY if we haven't already transitioned to RUNNING/TERMINAL
    // via a broadcast MATCH_STARTED that arrived before this response
    if (this.status !== NetworkSessionState.RUNNING &&
        this.status !== NetworkSessionState.TERMINAL) {
      this._transition(NetworkSessionState.READY);
    }
    this._notifyStateChange();
  }

  async reconnect() {
    if (!this.matchId || !this.participantToken) return;
    this._transition(NetworkSessionState.RECONNECTING);
    const resp = await this._request(resumeMatch(this.matchId, this.participantToken));
    if (resp.type === 'ERROR') {
      this._transition(NetworkSessionState.ERROR);
      this.error = resp.payload?.message ?? 'Reconnect failed';
      this._notifyStateChange();
      return;
    }
    if (resp.payload?.view) {
      this._applyView(resp.payload.view);
    }
    this._notifyStateChange();
  }

  // ── Gameplay ──

  async submitAction(actionId, clientCommandId, overrides = {}) {
    if (!this.currentView?.decision) {
      return { accepted: false, error: 'NO_DECISION_PENDING', reasonCode: 'NO_DECISION_PENDING' };
    }
    // Only the authorized actor can submit, and only when running
    if (this.status !== NetworkSessionState.RUNNING) {
      return { accepted: false, error: 'Match not running', reasonCode: 'MATCH_NOT_RUNNING' };
    }
    // No duplicate pending request
    if (this._pendingAction) {
      return { accepted: false, error: 'Request already pending', reasonCode: 'REQUEST_PENDING' };
    }
    // Verify action exists in the latest authorized action list
    const dec = this.currentView.decision;
    if (dec.legalActions && !dec.legalActions.some(a => a.actionId === actionId)) {
      return { accepted: false, error: 'Action not in legal action list', reasonCode: 'ACTION_ID_INVALID' };
    }

    this._pendingAction = { actionId, clientCommandId };
    this._lastClientCommandId = clientCommandId;

    try {
      const resp = await this._request(submitAction(
        this.matchId, this.participantToken, clientCommandId,
        overrides.expectedRevision ?? dec.stateRevision,
        overrides.decisionFrameHash ?? dec.frameHash,
        actionId,
      ));

      this._pendingAction = null;
      const result = resp.payload;
      if (result.view) {
        this._applyView(result.view);
      }
      this._notifyStateChange();
      return { accepted: result.accepted, error: result.error, reasonCode: result.reasonCode };
    } catch (err) {
      this._pendingAction = null;
      return { accepted: false, error: err.message, reasonCode: 'CONNECTION_ERROR' };
    }
  }

  /**
   * Submit a human action — board-events.js compatibility shim.
   * Accepts the same submission shape as PlaySession.submitHumanAction()
   * and delegates to submitAction() with a generated clientCommandId.
   * @param {object} submission — { actionId, stateRevision, decisionFrameHash, ... }
   * @returns {Promise<{accepted: boolean, error?: string, reasonCode?: string}>}
   */
  async submitHumanAction(submission) {
    const actionId = submission.actionId;
    const clientCommandId = `cmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    // Pass through revision and frame hash from the submission so the
    // server receives the exact values the client used when building the
    // submission. This prevents stale-frame mismatches if the current
    // view was updated between the snapshot read and the submit.
    return this.submitAction(actionId, clientCommandId, {
      expectedRevision: submission.stateRevision,
      decisionFrameHash: submission.decisionFrameHash,
    });
  }

  async requestSync() {
    const resp = await this._request(requestSync(this.matchId, this.participantToken));
    if (resp.payload?.view) {
      this._applyView(resp.payload.view);
    }
    this._notifyStateChange();
  }

  async leave() {
    this._clearReconnectInfo();
    try {
      await this._request(leaveMatch(this.matchId, this.participantToken));
    } catch { /* ignore — server may be unreachable */ }
    this.disconnect();
  }

  // ── Chat ──

  /**
   * Send a chat message to the match participants via the server.
   * The message is validated (1-200 chars), sent via SEND_CHAT protocol
   * message, and the server broadcasts it to all participants.
   * @param {string} text - Chat message text (1-200 chars)
   * @returns {Promise<boolean>} true if sent successfully
   */
  async sendChatMessage(text) {
    if (!this.matchId || !this.participantToken) return false;
    if (typeof text !== 'string' || text.length === 0 || text.length > 200) return false;
    try {
      // NET-UX-01: Generate a client-side message ID for exactly-once delivery.
      // The optimistic local echo uses this ID, and the server broadcast
      // is deduplicated against it to prevent duplicate display.
      const messageId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timestamp = new Date().toISOString();
      const msg = sendChat(this.matchId, this.participantToken, text);
      // Chat is fire-and-forget — the server broadcasts CHAT_MESSAGE back.
      // We don't wait for a response (there is no ACK for SEND_CHAT).
      if (this._ws && this._ws.readyState === WebSocket.OPEN) {
        this._ws.send(JSON.stringify(msg));
      }
      // Add to local chat messages immediately (optimistic) with messageId
      this.chatMessages = this.chatMessages || [];
      // NET-UX-01: Track seen message IDs for exactly-once display
      this._seenChatMessageIds = this._seenChatMessageIds || new Set();
      this._seenChatMessageIds.add(messageId);
      this.chatMessages.push({
        messageId,
        participantId: this.participantId,
        text,
        timestamp,
        isHuman: true,
        isNetwork: true,
        isOptimistic: true,
        time: new Date().toLocaleTimeString(),
      });
      this._notifyStateChange();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Send a chat visibility change to the server.
   * The server broadcasts a CHAT_VISIBILITY_CHANGE system event to the
   * other participant's Game Log. This is a presence/UI-state event,
   * NOT a chat message.
   * @param {boolean} hidden - True if chat is hidden, false if restored
   * @returns {boolean} true if sent successfully
   */
  sendChatVisibility(hidden) {
    if (!this.matchId || !this.participantToken) return false;
    if (typeof hidden !== 'boolean') return false;
    try {
      this.chatHidden = hidden;
      const msg = chatVisibility(this.matchId, this.participantToken, hidden);
      if (this._ws && this._ws.readyState === WebSocket.OPEN) {
        this._ws.send(JSON.stringify(msg));
      }
      this._notifyStateChange();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Forfeit the current match — sends LEAVE_MATCH to the server and
   * cleans up local state. The server determines the authoritative
   * match outcome (opponent wins by forfeit).
   * Prevents double-submit with a guard flag.
   * @returns {Promise<void>}
   */
  async forfeit() {
    if (this._forfeitSubmitted) return; // Prevent double-submit
    this._forfeitSubmitted = true;
    try {
      await this.leave();
    } finally {
      this._forfeitSubmitted = false;
    }
  }

  // ── Auth handshake (v2) ──

  /**
   * Send AUTHENTICATE with the current access token.
   * Called automatically on WebSocket open. Can also be called manually
   * to re-authenticate after a token refresh.
   * @returns {boolean} true if sent, false if no token or socket not open
   */
  _sendAuthenticate() {
    if (!this.accessToken) return false;
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return false;
    try {
      const msg = authenticate(this.accessToken);
      this._ws.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Update the access token and send AUTH_REFRESH to the server.
   * Called when the Supabase session refreshes the token.
   * @param {string} newToken - New access token from Supabase
   * @returns {boolean} true if sent
   */
  refreshAccessToken(newToken) {
    this.accessToken = newToken;
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return false;
    try {
      const msg = authRefresh(newToken);
      this._ws.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  // ── Replay download ──

  /**
   * Request the certified replay for the current (completed) match.
   * Verifies the replay hash against the REPLAY_AVAILABLE hash if available.
   * Returns the replay object, or null if the match isn't terminal or hash verification fails.
   * @returns {Promise<object|null>}
   */
  async getReplay() {
    if (this.status !== NetworkSessionState.TERMINAL) return null;
    if (!this.matchId || !this.participantToken) return null;
    const msg = { protocolVersion: 2, type: 'GET_REPLAY', payload: { matchId: this.matchId, participantToken: this.participantToken } };
    const resp = await this._request(msg);
    if (resp.type === 'ERROR') return null;
    const replay = resp.payload?.replay ?? null;
    if (!replay) return null;
    // Verify replay hash if we received one in REPLAY_AVAILABLE
    const expectedHash = resp.payload?.replayHash ?? this.replayHash;
    if (expectedHash) {
      const actualHash = await this._computeReplayHash(replay);
      if (actualHash !== expectedHash) {
        console.warn(`[NetworkPlaySession] Replay hash mismatch: expected=${expectedHash}, actual=${actualHash}`);
        return null;
      }
    }
    return replay;
  }

  /**
   * Compute SHA-256 hash of a replay object for integrity verification.
   * Uses the Web Crypto API (crypto.subtle.digest).
   * @param {object} replay - The replay object to hash
   * @returns {Promise<string>} Hex-encoded SHA-256 hash
   */
  async _computeReplayHash(replay) {
    const data = new TextEncoder().encode(JSON.stringify(replay));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ── Reconnection persistence ──

  /**
   * Persist match info to localStorage so we can reconnect after refresh.
   * Uses a versioned schema with a consistent `url` field.
   * Called after a successful create/join.
   */
  _saveReconnectInfo() {
    try {
      const data = {
        schemaVersion: RECONNECT_RECORD_SCHEMA_VERSION,
        url: this._url, // Canonical field name — must match getSavedMatch()
        matchId: this.matchId,
        participantToken: this.participantToken,
        playerId: this.playerId,
        inviteCode: this.inviteCode,
        savedAt: Date.now(),
      };
      localStorage.setItem(RECONNECT_KEY, JSON.stringify(data));
    } catch { /* localStorage may be unavailable */ }
  }

  /**
   * Clear saved reconnect info — called on leave/forfeit/terminal.
   */
  _clearReconnectInfo() {
    try {
      localStorage.removeItem(RECONNECT_KEY);
    } catch { /* ignore */ }
  }

  /**
   * Check if there is a saved match to reconnect to.
   * Validates the schema version and required fields.
   * @returns {{ url, matchId, participantToken, playerId, inviteCode, savedAt, schemaVersion } | null}
   */
  static getSavedMatch() {
    try {
      const raw = localStorage.getItem(RECONNECT_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      // Validate schema version — clear corrupt/expired records
      if (!data || typeof data !== 'object') {
        localStorage.removeItem(RECONNECT_KEY);
        return null;
      }
      // Support both legacy `serverUrl` and canonical `url` field
      const url = data.url ?? data.serverUrl ?? null;
      if (!data.matchId || !data.participantToken || !url) {
        localStorage.removeItem(RECONNECT_KEY);
        return null;
      }
      // Expire after 30 min
      if (Date.now() - (data.savedAt ?? 0) > RECONNECT_TTL_MS) {
        localStorage.removeItem(RECONNECT_KEY);
        return null;
      }
      // Return normalized record with canonical `url` field
      return { ...data, url, schemaVersion: RECONNECT_RECORD_SCHEMA_VERSION };
    } catch {
      // Corrupt JSON — clear it
      try { localStorage.removeItem(RECONNECT_KEY); } catch { /* ignore */ }
      return null;
    }
  }

  // ── Internal ──

  /**
   * Send a request and await its response.
   * Validates socket readyState before sending.
   * Rejects on timeout (15s) or terminal socket close.
   */
  _request(msg) {
    return new Promise((resolve, reject) => {
      const requestId = msg.requestId;

      // Validate socket readyState before sending
      if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Socket not open'));
        return;
      }

      // Timeout after 15s — cleared on resolve/reject or on close
      const timer = setTimeout(() => {
        if (this._pending.has(requestId)) {
          this._pending.delete(requestId);
          reject(new Error('Request timeout'));
        }
      }, 15000);

      this._pending.set(requestId, { resolve, reject, timer });

      try {
        this._ws.send(JSON.stringify(msg));
      } catch (err) {
        clearTimeout(timer);
        this._pending.delete(requestId);
        reject(err);
      }
    });
  }

  /**
   * Reject all pending requests — called on terminal socket close or disposal.
   */
  _rejectAllPending(reason) {
    for (const [requestId, { reject, timer }] of this._pending) {
      clearTimeout(timer);
      this._pending.delete(requestId);
      reject(new Error(reason));
    }
  }

  /**
   * Validate an incoming envelope before processing.
   * Rejects malformed, unknown, oversized, or mismatched messages.
   */
  _validateIncoming(msg) {
    if (!msg || typeof msg !== 'object') return false;
    if (typeof msg.type !== 'string') return false;
    if (msg.protocolVersion && msg.protocolVersion !== PROTOCOL_VERSION) {
      // Version mismatch — reject
      if (this.onError) this.onError({ code: 'PROTOCOL_VERSION_UNSUPPORTED', message: `Server protocol version ${msg.protocolVersion} does not match client ${PROTOCOL_VERSION}` });
      return false;
    }
    return true;
  }

  _handleMessage(msg) {
    // Validate incoming envelope
    if (!this._validateIncoming(msg)) return;

    // Resolve pending request
    if (msg.requestId && this._pending.has(msg.requestId)) {
      const { resolve, timer } = this._pending.get(msg.requestId);
      clearTimeout(timer);
      this._pending.delete(msg.requestId);
      if (msg.type === 'ERROR') {
        // Structured error: { code, message, requestId, retryable }
        resolve({
          type: 'ERROR',
          payload: {
            code: msg.payload?.code ?? 'UNKNOWN',
            message: msg.payload?.message ?? 'Unknown error',
            requestId: msg.requestId,
            retryable: msg.payload?.code ? !['AUTH_TOKEN_INVALID', 'MATCH_NOT_FOUND', 'MATCH_EXPIRED', 'PARTICIPANT_NOT_AUTHORIZED'].includes(msg.payload.code) : false,
          },
        });
      } else {
        resolve(msg);
      }
      return;
    }

    // Handle server-pushed messages (no requestId or unmatched requestId)
    switch (msg.type) {
      case 'AUTHENTICATED':
        // v2 auth handshake — server confirmed our identity
        this.authenticatedAccount = msg.payload?.account ?? null;
        this.tokenExpiresAt = msg.payload?.expiresAt ?? null;
        // Store local profile for display in the match UI
        if (this.authenticatedAccount) {
          this.localProfile = {
            displayName: this.authenticatedAccount.displayName ?? 'Player',
            handle: this.authenticatedAccount.handle ?? null,
            avatarUrl: this.authenticatedAccount.avatarUrl ?? null,
            rating: this.authenticatedAccount.rating ?? null,
            rank: this.authenticatedAccount.rank ?? null,
          };
        }
        // Resolve connect() if it's waiting for authentication
        if (this._authResolve) {
          clearTimeout(this._authTimeout);
          const resolve = this._authResolve;
          this._authResolve = null;
          this._authReject = null;
          this._authTimeout = null;
          this._connectSettled = true;
          resolve();
        }
        this._notifyStateChange();
        break;
      case 'MATCH_VIEW':
        if (msg.payload?.view) {
          this._applyView(msg.payload.view);
          this._notifyStateChange();
        }
        break;
      case 'MATCH_STARTED':
        if (msg.payload?.view) {
          this._applyView(msg.payload.view);
          // Use transition guard — never regress from RUNNING
          this._transition(NetworkSessionState.RUNNING);
          this._notifyStateChange();
        }
        break;
      case 'PARTICIPANT_STATUS':
        if (msg.payload?.status?.status === 'DISCONNECTED') {
          this.opponentConnectionState = 'DISCONNECTED';
          this._notifyStateChange();
        } else if (msg.payload?.status?.status === 'CONNECTED') {
          this.opponentConnectionState = 'CONNECTED';
          this._notifyStateChange();
        }
        break;
      case 'MATCH_ENDED':
        this._transition(NetworkSessionState.TERMINAL);
        if (this.currentView) {
          this.currentView.match = this.currentView.match || {};
          this.currentView.match.winner = msg.payload?.winner ?? null;
          this.currentView.match.terminationReason = msg.payload?.reason ?? null;
        }
        this._clearReconnectInfo();
        this._notifyStateChange();
        break;
      case 'REPLAY_AVAILABLE':
        // Store replay metadata so the UI can offer a download button
        this.replayUrl = msg.payload?.replayUrl ?? null;
        this.replayHash = msg.payload?.replayHash ?? null;
        this._notifyStateChange();
        break;
      case 'ACHIEVEMENTS_EARNED':
        // Server-authoritative achievement unlocks for this participant
        this.achievementUnlocks = msg.payload?.unlocks ?? [];
        this.achievementProgressUpdates = msg.payload?.progressUpdates ?? {};
        this._notifyStateChange();
        break;
      case 'CHAT_MESSAGE':
        // v0.25: Network chat — received from server after participant broadcast.
        // NET-UX-01: Exactly-once delivery with deduplication using server messageId.
        // The server broadcasts CHAT_MESSAGE to all participants INCLUDING the sender.
        // The sender already has the message from optimistic local echo, so we
        // deduplicate using the server-generated messageId.
        if (msg.payload?.text) {
          this.chatMessages = this.chatMessages || [];
          this._seenChatMessageIds = this._seenChatMessageIds || new Set();
          const serverMessageId = msg.payload.messageId ?? null;
          const isFromSelf = msg.payload.participantId === this.participantId;

          // Dedup by server messageId if available
          if (serverMessageId) {
            if (this._seenChatMessageIds.has(serverMessageId)) {
              // Already have this message — skip
              break;
            }
            this._seenChatMessageIds.add(serverMessageId);
          }

          if (isFromSelf) {
            // Check if we already have this message from optimistic echo
            // Match on participantId + text within a 5-second window
            const existing = this.chatMessages.find(m =>
              m.participantId === msg.payload.participantId &&
              m.text === msg.payload.text &&
              m.isOptimistic &&
              Math.abs(new Date(m.timestamp).getTime() - new Date(msg.payload.timestamp).getTime()) < 5000
            );
            if (existing) {
              // Update the existing message with server-confirmed timestamp
              // and mark it as confirmed (no longer optimistic)
              existing.timestamp = msg.payload.timestamp;
              existing.isOptimistic = false;
              existing.messageId = serverMessageId ?? existing.messageId;
              this._notifyStateChange();
              break;
            }
            // If no match found, fall through and add as a new message
            // (this can happen if the optimistic echo was evicted)
          }

          // Add the message from server broadcast
          this.chatMessages.push({
            messageId: serverMessageId,
            participantId: msg.payload.participantId,
            text: msg.payload.text,
            timestamp: msg.payload.timestamp,
            isHuman: isFromSelf,
            isNetwork: true,
            isOptimistic: false,
            time: msg.payload.timestamp,
          });
          this._notifyStateChange();
        }
        break;
      case 'CHAT_VISIBILITY_CHANGE':
        // System event: opponent hid or restored Match Chat.
        // This goes into the Game Log, NOT the chat message list.
        if (msg.payload && typeof msg.payload.hidden === 'boolean') {
          this.systemEvents = this.systemEvents || [];
          const evtId = `vis-${msg.payload.participantId}-${msg.payload.hidden ? 'hide' : 'show'}-${Date.now()}`;
          // Dedup: don't add if we already have a recent visibility event from this participant
          const recent = this.systemEvents.find(e =>
            e.participantId === msg.payload.participantId &&
            e.type === 'CHAT_VISIBILITY' &&
            Math.abs(new Date(e.timestamp).getTime() - Date.now()) < 2000
          );
          if (!recent) {
            this.systemEvents.push({
              id: evtId,
              type: 'CHAT_VISIBILITY',
              participantId: msg.payload.participantId,
              displayName: msg.payload.displayName ?? 'Opponent',
              hidden: msg.payload.hidden,
              timestamp: new Date().toISOString(),
            });
            // Keep only last 20 system events
            if (this.systemEvents.length > 20) {
              this.systemEvents = this.systemEvents.slice(-20);
            }
            this._notifyStateChange();
          }
        }
        break;
      case 'LEFT_MATCH':
        // Server acknowledged leave — clean up
        this._clearReconnectInfo();
        break;
      case 'ERROR':
        // If auth is pending, reject connect() with the auth error
        if (this._authReject && !this._connectSettled) {
          clearTimeout(this._authTimeout);
          const reject = this._authReject;
          this._authResolve = null;
          this._authReject = null;
          this._authTimeout = null;
          this._connectSettled = true;
          this.status = NetworkSessionState.ERROR;
          this.error = msg.payload?.message ?? 'Authentication failed';
          reject(new Error(this.error));
          return;
        }
        // Server-pushed error (no requestId match)
        if (msg.payload?.code === 'CONNECTION_SUPERSEDED') {
          this.disconnect();
        }
        if (msg.payload?.code === 'MATCH_EXPIRED') {
          this._transition(NetworkSessionState.EXPIRED);
          this._clearReconnectInfo();
        }
        // Categorize errors: non-critical errors (e.g., MESSAGE_TYPE_UNKNOWN
        // from an older server that doesn't recognize a newer client message
        // like CHAT_VISIBILITY) should be logged as warnings, NOT passed to
        // onError which triggers the fatal "Reconnect Failed" UI. Only
        // connection-fatal errors (auth, match state, rate limit) should
        // trigger the error callback.
        {
          const code = msg.payload?.code ?? '';
          const isNonCritical = code === 'MESSAGE_TYPE_UNKNOWN' ||
            code === 'INVALID_FIELD_TYPE' ||
            code === 'MISSING_REQUIRED_FIELD';
          if (isNonCritical) {
            // Log as a warning — the match continues despite the server
            // not understanding this particular message type
            console.warn('[intrilex:network] Non-critical server error:', msg.payload?.message ?? code);
            break;
          }
          if (this.onError) this.onError(msg.payload);
        }
        break;
    }
  }

  _applyView(view) {
    if (!view) return;
    // Stale view guard: skip if the incoming view has an older revision than
    // the current view. This prevents race conditions where an older
    // MATCH_VIEW (e.g. from a sync response) overwrites a newer ACTION_RESULT
    // view, which would cause both clients to display incorrect turn state.
    const incomingRev = view.playerView?.revision ?? view.decision?.stateRevision ?? 0;
    const currentRev = this.currentView?.playerView?.revision
      ?? this.currentView?.decision?.stateRevision ?? 0;
    if (this.currentView && incomingRev > 0 && currentRev > 0 && incomingRev < currentRev) {
      return;
    }
    this.currentView = view;
    if (view.participantId) {
      this.participantId = view.participantId;
    }
    if (view.playerId) {
      this.playerId = view.playerId;
      this.opponentPlayerId = view.playerId === 'P1' ? 'P2' : 'P1';
    }
    if (view.opponent) {
      this.opponentConnectionState = view.opponent.connectionState;
      // Store opponent's public profile for display
      if (view.opponent.publicProfile) {
        this.opponentProfile = view.opponent.publicProfile;
      }
    }
    // Store match classification for header label
    if (view.matchMode) {
      this.matchMode = view.matchMode;
    }
    if (view.queueId !== undefined) {
      this.queueId = view.queueId;
    }
    if (view.match) {
      if (view.match.winner) {
        this._transition(NetworkSessionState.TERMINAL);
        this._clearReconnectInfo();
      }
    }
    // Drive state from authoritative views — use transition guard
    if (view.status === 'TERMINAL') {
      this._transition(NetworkSessionState.TERMINAL);
      this._clearReconnectInfo();
    } else if (view.status === 'RUNNING') {
      // Only transition to RUNNING — never regress from TERMINAL
      this._transition(NetworkSessionState.RUNNING);
    } else if (view.status === 'READY_CHECK' || view.status === 'WAITING_FOR_OPPONENT') {
      // Match exists but hasn't started — show the waiting room so players
      // can mark ready. This covers queue-matched sessions that reconnect
      // via RESUME_MATCH before either player has sent READY.
      this._transition(NetworkSessionState.IN_LOBBY);
    }
  }

  _notifyStateChange() {
    if (this.onStateChange) {
      try { this.onStateChange(this); } catch { /* ignore */ }
    }
  }

  /**
   * Get a UI snapshot compatible with the existing renderer.
   * Mirrors PlaySession.getSnapshot() structure.
   */
  getSnapshot() {
    const view = this.currentView;
    if (!view) {
      return { schemaVersion: '1.0.0', sessionId: this.matchId, status: this.status, error: this.error };
    }
    // Build local player profile from authenticated account
    const localProfile = this.localProfile ?? {};
    const opponentProfile = this.opponentProfile ?? {};
    return {
      schemaVersion: '1.0.0',
      sessionId: this.matchId,
      status: this._mapStatus(),
      mode: 'network-direct-duel',
      // Server-authoritative match classification for header label
      matchMode: this.matchMode ?? 'private',
      queueId: this.queueId ?? null,
      isNetworkMatch: true,
      profileId: view.profileId,
      human: {
        playerId: this.playerId,
        seat: this.playerId === 'P1' ? 1 : 2,
        displayName: localProfile.displayName ?? 'You',
        rating: localProfile.rating ?? null,
        rank: localProfile.rank ?? null,
        isHuman: true,
      },
      opponent: {
        displayName: opponentProfile.displayName ?? 'Opponent',
        rating: opponentProfile.rating ?? null,
        rank: opponentProfile.rank ?? null,
        policyId: 'human',
        archetype: '',
        difficulty: '',
        isHuman: true,
        connectionState: this.opponentConnectionState ?? 'CONNECTED',
      },
      match: view.match || {},
      decision: view.decision ? {
        actorId: view.decision.actorId,
        kind: 'ACTION',
        stateRevision: view.decision.stateRevision,
        frameHash: view.decision.frameHash,
        legalActions: (view.decision.legalActions || []).map(a => ({
          actionId: a.actionId,
          family: a.family,
          mode: a.mode,
          timingClass: a.timingClass,
          sourceHandles: a.sourceCardIds,
          targetHandles: a.targetCardIds,
        })),
        isHuman: view.decision.isMyDecision,
      } : null,
      playerView: view.playerView,
      recentEvents: view.recentEvents || [],
      systemEvents: this.systemEvents || [],
      viewHash: view.viewHash,
      pendingAction: this._pendingAction,
      chatHidden: this.chatHidden,
      chat: (this.chatMessages || []).slice(-30),
    };
  }

  _mapStatus() {
    switch (this.status) {
      case NetworkSessionState.RUNNING:
        // Map to HUMAN_DECISION or OPPONENT_DECISION (not AI_DECISION) —
        // network matches are human-vs-human. The viewmodel's deriveStatus()
        // also uses OPPONENT_DECISION for network matches when isMyDecision
        // is false, so this keeps the snapshot status consistent.
        return this.currentView?.decision?.isMyDecision ? 'HUMAN_DECISION' : 'OPPONENT_DECISION';
      case NetworkSessionState.TERMINAL:
        return 'TERMINAL';
      case NetworkSessionState.ERROR:
        return 'ERROR';
      default:
        return this.status;
    }
  }

  /**
   * Check if the network session is awaiting the local player's human action.
   * This bridges the gap between the internal NetworkSessionState.RUNNING
   * status and the SessionState.HUMAN_DECISION status that board-events.js
   * checks via `state.session.status`.
   * @returns {boolean}
   */
  isAwaitingHumanAction() {
    return this.status === NetworkSessionState.RUNNING &&
           this.currentView?.decision?.isMyDecision === true;
  }
}
