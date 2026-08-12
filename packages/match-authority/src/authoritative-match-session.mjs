// ═══════════════════════════════════════════════════════════════
// authoritative-match-session.mjs — Server-neutral two-seat authority
//
// Owns: engine state, command vault, decision frames, revision,
//        frame hash, journal, command log, replay generation.
//
// Knows nothing about: DOM, renderer, WebSocket, browser storage,
//                       human vs AI, network transport.
//
// This is the single source of canonical truth for a match.
// ═══════════════════════════════════════════════════════════════

import {
  createSimulationState,
  advanceSimulationToDecision,
  executeSimulationAction,
  privateStateView,
  publicStateView,
  strictPolicyView,
  hashCanonical,
  createAuthorityCertifiedReplay,
  verifyAuthorityCertifiedReplay,
  CORE_UNRESTRICTED_AUTHORITY_PROFILE,
  ENGINE_VERSION,
  RULES_VERSION,
} from '@intrilex/engine-adapter';

import { ReasonCode, PROTOCOL_VERSION } from '@intrilex/network-protocol';
import { createHash } from 'node:crypto';

/**
 * IRX-H15: Hash a participant token for secure storage in snapshots.
 * The plaintext token is never persisted — only its SHA-256 hash.
 * @param {string} token
 * @returns {string}
 */
function _hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

// ── Match status constants ──

export const MatchStatus = Object.freeze({
  WAITING_FOR_OPPONENT: 'WAITING_FOR_OPPONENT',
  READY_CHECK: 'READY_CHECK',
  STARTING: 'STARTING',
  RUNNING: 'RUNNING',
  TERMINAL: 'TERMINAL',
  ABORTED: 'ABORTED',
  EXPIRED: 'EXPIRED',
});

// ── Participant connection state ──

export const ConnectionState = Object.freeze({
  CONNECTED: 'CONNECTED',
  DISCONNECTED: 'DISCONNECTED',
  RECONNECTING: 'RECONNECTING',
});

/**
 * @typedef {'WAITING_FOR_OPPONENT'|'READY_CHECK'|'STARTING'|'RUNNING'|'TERMINAL'|'ABORTED'|'EXPIRED'} MatchStatusValue
 */
/**
 * @typedef {object} LegalAction
 * @property {string} actionId
 * @property {*} [family]
 * @property {*} [mode]
 * @property {*} [timingClass]
 * @property {Array<*>} [sourceCardIds]
 * @property {Array<*>} [targetCardIds]
 * @property {*} [displayLabel]
 * @property {boolean} [isSuper]
 */
/**
 * @typedef {object} LegalActionFrame
 * @property {Array<{ actionId: string, command: object, family?: *, mode?: *, timingClass?: *, sourceCardIds?: Array<*>, targetCardIds?: Array<*>, displayLabel?: *, isSuper?: boolean }>} actions
 */
/**
 * @typedef {object} AdvanceResult
 * @property {object} state
 * @property {string} status
 * @property {object[]} [executedCommands]
 * @property {object[]} [events]
 * @property {string} [reasonCode]
 * @property {LegalActionFrame} legalActionFrame
 * @property {string} decisionActorId
 */
/**
 * @typedef {object} CommandLogEntry
 * @property {*} command
 * @property {boolean} accepted
 * @property {Array<*>} [events]
 * @property {number} commandIndex
 */
/**
 * @typedef {object} SafeEvent
 * @property {string} type
 * @property {string} [controllerId]
 * @property {*} [payload]
 */
/**
 * @typedef {object} VersionBinding
 * @property {string} productVersion
 * @property {*} protocolVersion
 * @property {string} engineVersion
 * @property {string} rulesVersion
 */
/**
 * @typedef {object} MatchSnapshotParticipant
 * @property {string} participantId
 * @property {string} playerId
 * @property {string} [token] - Plaintext token (deprecated — only in old snapshots, IRX-H15)
 * @property {string} [tokenHash] - SHA-256 hash of token (IRX-H15 — new snapshots)
 * @property {string|null} [accountId] - Account ID that owns this participant (v3 — absent in v2 snapshots)
 * @property {{ displayName: string, handle: (string|null), avatarUrl: (string|null), rating: (number|null), rank: (string|null) }|null} [publicProfile] - Public profile for opponent display (v3+ — absent in old snapshots)
 * @property {string} connectionState
 * @property {boolean} ready
 */
/**
 * @typedef {object} MatchSnapshotIdempotencyEntry
 * @property {string} participantId
 * @property {Array<{ clientCommandId: string, actionId: string, expectedRevision: number, decisionFrameHash: string, result: object }>} entries
 */
/**
 * @typedef {object} MatchSnapshot
 * @property {number} schemaVersion
 * @property {string} matchId
 * @property {string} profileId
 * @property {number} seed
 * @property {string[]} seatOrder
 * @property {MatchStatusValue} status
 * @property {MatchSnapshotParticipant[]} participants
 * @property {CommandLogEntry[]} commandLog
 * @property {object[]} decisionJournal
 * @property {SafeEvent[]} recentSafeEvents
 * @property {string|null} [terminalReason]
 * @property {string|null} [winner]
 * @property {MatchSnapshotIdempotencyEntry[]} [idempotency]
 * @property {number} [stateRevision]
 * @property {number} [decisionIndex]
 * @property {number} [createdAt]
 * @property {number} [updatedAt]
 * @property {VersionBinding} [versionBinding]
 * @property {string} [integrity]
 * @property {string} [matchMode] - Server-owned product classification: 'private'|'casual'|'ranked'|'tutorial'|'simulation'|'local-ai' (v3+; absent in old snapshots → defaults to 'private')
 * @property {string|null} [queueId] - Server-recognized matchmaking/rating queue: 'ranked'|'casual'|'private'|null (v3+; absent → null)
 * @property {string|null} [seasonId] - Active server-resolved competitive season (ranked only; null otherwise)
 */

const DEFAULT_PROFILE_ID = CORE_UNRESTRICTED_AUTHORITY_PROFILE?.id ?? 'core-unrestricted-authority';

const MAX_ORCHESTRATION = 128;

/**
 * Create a new AuthoritativeMatchSession.
 *
 * @param {object} opts
 * @param {string} opts.matchId - Unique server-generated match ID
 * @param {string} opts.profileId - Engine profile (default: core-unrestricted-authority)
 * @param {number} opts.seed - CSPRNG-generated seed for the match
 * @param {string[]} opts.seatOrder - ['P1', 'P2'] by default
 * @param {string} [opts.matchMode] - Server-owned product classification: 'private'|'casual'|'ranked'|'tutorial'|'simulation'|'local-ai'
 * @param {string|null} [opts.queueId] - Server-recognized matchmaking/rating queue
 * @param {string|null} [opts.seasonId] - Active server-resolved competitive season (ranked only)
 * @returns {AuthoritativeMatchSession}
 */
export function createAuthoritativeMatch(opts) {
  return new AuthoritativeMatchSession(opts);
}

export class AuthoritativeMatchSession {
  /**
   * @param {object} opts
   * @param {string} [opts.matchId] - Unique server-generated match ID
   * @param {string} [opts.profileId] - Engine profile (default: core-unrestricted-authority)
   * @param {number} [opts.seed] - CSPRNG-generated seed for the match
   * @param {string[]} [opts.seatOrder] - ['P1', 'P2'] by default
   * @param {string} [opts.matchMode] - Server-owned product classification (default: 'private')
   * @param {string|null} [opts.queueId] - Server-recognized matchmaking/rating queue (default: null)
   * @param {string|null} [opts.seasonId] - Active server-resolved competitive season (ranked only)
   */
  constructor({ matchId, profileId, seed, seatOrder, matchMode, queueId, seasonId } = {}) {
    if (!matchId) throw new Error('matchId is required');
    this.matchId = matchId;
    this.profileId = profileId ?? DEFAULT_PROFILE_ID;
    // RANK-01: Server-owned match classification — immutable after creation.
    // The client may request a queue, but the server creates authoritative
    // classification after validation. Never inferred from profileId or UI labels.
    /** @type {string} */
    this.matchMode = matchMode ?? 'private';
    /** @type {string|null} */
    this.queueId = queueId ?? null;
    /** @type {string|null} */
    this.seasonId = seasonId ?? null;
    /** @type {MatchStatusValue} */
    this.status = MatchStatus.WAITING_FOR_OPPONENT;
    this.participants = new Map(); // participantId → { playerId, token, connectionState, ready }
    this.seatOrder = seatOrder ?? ['P1', 'P2'];

    // Authority state
    this.engine = null;
    this.state = null;
    this._initialState = null;
    this._stateRevision = 0;
    this._decisionIndex = 0;

    // Current decision frame
    this.currentDecisionActor = null;
    this.decisionFrameHash = null;
    /** @type {Map<string, object>|null} */
    this.commandVault = null;   // Map<actionId, EngineCommand> — PRIVATE
    /** @type {LegalAction[]|null} */
    this.legalActionFrame = null; // Safe actions for authorized player

    // Journals
    /** @type {object[]} */
    this.decisionJournal = [];
    /** @type {CommandLogEntry[]} */
    this.commandLog = [];
    /** @type {SafeEvent[]} */
    this.recentSafeEvents = [];

    // Terminal
    this.terminalReason = null;
    this.winner = null;

    // Idempotency: participantId → Map<clientCommandId → result>
    this._idempotency = new Map();
    this._idempotencyMaxPerParticipant = 1000; // sliding-window cap to prevent OOM in long matches

    // Serialization lock
    this._actionLock = Promise.resolve();

    // Timestamps
    this.createdAt = Date.now();
    this.updatedAt = Date.now();

    // Seed (generated server-side)
    this._seed = (seed ?? 0) >>> 0 || 1;
  }

  // ── Participant management ──

  /**
   * Add a participant to the match.
   * @param {string} participantId
   * @param {string} token
   * @param {string|null} [accountId] - Account ID that owns this participant (for account-bound reconnect)
   * @param {{ displayName: string, handle: (string|null), avatarUrl: (string|null), rating: (number|null), rank: (string|null) }|null} [publicProfile] - Public profile for opponent display
   * @returns {{ participantId: string, token: string, playerId: string, accountId: string|null }}
   */
  addParticipant(participantId, token, accountId = null, publicProfile = null) {
    if (this.participants.size >= 2) {
      throw Object.assign(new Error('Match is full'), { code: ReasonCode.MATCH_FULL });
    }
    if (this.participants.has(participantId)) {
      throw Object.assign(new Error('Participant already in match'), { code: ReasonCode.MATCH_ALREADY_JOINED });
    }
    const playerId = this.seatOrder[this.participants.size];
    this.participants.set(participantId, {
      playerId,
      token,
      // IRX-H15: Store hash for token validation. The plaintext token is kept
      // in memory for the live session (returned to the client) but only the
      // hash is persisted in snapshots.
      tokenHash: _hashToken(token),
      accountId: accountId ?? null,
      publicProfile: publicProfile ?? null,
      connectionState: ConnectionState.CONNECTED,
      ready: false,
    });
    this.updatedAt = Date.now();

    if (this.participants.size === 2) {
      this.status = MatchStatus.READY_CHECK;
    }

    return { participantId, token, playerId, accountId: accountId ?? null };
  }

  /**
   * Mark a participant as ready.
   * @param {string} participantId
   */
  setReady(participantId) {
    const p = this._getParticipant(participantId);
    p.ready = true;
    this.updatedAt = Date.now();
  }

  /**
   * Check if all participants are ready.
   */
  allReady() {
    if (this.participants.size < 2) return false;
    for (const p of this.participants.values()) {
      if (!p.ready) return false;
    }
    return true;
  }

  /**
   * Start the match — creates engine state and advances to first decision.
   */
  start() {
    if (this.status !== MatchStatus.READY_CHECK) {
      throw Object.assign(new Error('Match not in READY_CHECK'), { code: ReasonCode.MATCH_NOT_RUNNING });
    }
    if (!this.allReady()) {
      throw Object.assign(new Error('Not all participants ready'), { code: ReasonCode.MATCH_NOT_RUNNING });
    }

    this.status = MatchStatus.STARTING;

    const stateSetup = {
      profileId: this.profileId,
      playerIds: ['P1', 'P2'],
      enabledModules: [],
      seed: this._seed,
      seatOrder: this.seatOrder,
    };

    this.state = createSimulationState(stateSetup);
    this._initialState = structuredClone(this.state);
    this._stateRevision = 0;
    this._decisionIndex = 0;

    // Advance to first decision
    this._advanceToDecision();

    this.status = MatchStatus.RUNNING;
    this.updatedAt = Date.now();
  }

  // ── Decision advancement ──

  _advanceToDecision() {
    let safetyCounter = 0;

    while (safetyCounter++ < MAX_ORCHESTRATION) {
      const result = advanceSimulationToDecision(this.state);

      // Record executed commands
      if (result.executedCommands) {
        for (const cmd of result.executedCommands) {
          this.commandLog.push({ command: cmd, accepted: true, events: [], commandIndex: this.commandLog.length });
        }
      }
      if (result.events) {
        this.recentSafeEvents = [...this.recentSafeEvents, ...result.events].slice(-20);
      }

      this.state = result.state;
      this._stateRevision = this.state.revision ?? this._stateRevision + 1;

      // Terminal
      if (result.status === 'TERMINAL') {
        this.status = MatchStatus.TERMINAL;
        this.terminalReason = result.reasonCode;
        this.winner = this.state.winner;
        this.currentDecisionActor = null;
        this.decisionFrameHash = null;
        this.commandVault = null;
        this.legalActionFrame = null;
        return;
      }

      // Unsupported
      if (result.status === 'UNSUPPORTED_CONFIGURATION') {
        this.status = MatchStatus.ABORTED;
        this.terminalReason = result.reasonCode;
        this.currentDecisionActor = null;
        this.commandVault = null;
        this.legalActionFrame = null;
        return;
      }

      // Decision required
      if (result.status === 'PLAYER_DECISION_REQUIRED') {
        this._buildDecisionFrame(result);
        return;
      }
    }

    // Safety limit exceeded
    this.status = MatchStatus.ABORTED;
    this.terminalReason = 'ORCHESTRATION_LIMIT';
    this.commandVault = null;
    this.legalActionFrame = null;
  }

  /**
   * @param {AdvanceResult} result
   */
  _buildDecisionFrame(result) {
    const frame = result.legalActionFrame;
    const actorId = result.decisionActorId;

    // Build command vault (PRIVATE — never exposed to clients)
    this.commandVault = new Map();
    for (const action of frame.actions) {
      this.commandVault.set(action.actionId, action.command);
    }

    // Build safe legal action frame (no commands)
    const safeActions = frame.actions.map(action => ({
      actionId: action.actionId,
      family: action.family ?? null,
      mode: action.mode ?? null,
      timingClass: action.timingClass ?? null,
      sourceCardIds: action.sourceCardIds ?? [],
      targetCardIds: action.targetCardIds ?? [],
      displayLabel: action.displayLabel ?? null,
    }));
    this.legalActionFrame = safeActions;

    // Compute frame hash
    this.decisionFrameHash = hashCanonical({
      stateRevision: this._stateRevision,
      actorId,
      actions: safeActions.map(a => a.actionId),
    });

    this.currentDecisionActor = actorId;
    this.updatedAt = Date.now();
  }

  // ── Action submission ──

  /**
   * Submit an action from a participant.
   * This is the critical authority path — validates, resolves, executes, commits.
   *
   * @param {string} participantId
   * @param {object} submission
   * @param {string} submission.clientCommandId
   * @param {number} submission.expectedRevision
   * @param {string} submission.decisionFrameHash
   * @param {string} submission.actionId
   * @returns {Promise<object>} { accepted, error?, reasonCode? }
   */
  async submitAction(participantId, submission) {
    // Serialize all submissions for this match
    return new Promise((resolve) => {
      this._actionLock = this._actionLock
        .then(() => this._executeSubmission(participantId, submission))
        .then(resolve)
        .catch(err => resolve({ accepted: false, error: err.message, reasonCode: err.code ?? ReasonCode.INTERNAL_ERROR }));
    });
  }

  /**
   * @param {string} participantId
   * @param {object} submission
   * @param {string} submission.clientCommandId
   * @param {number} submission.expectedRevision
   * @param {string} submission.decisionFrameHash
   * @param {string} submission.actionId
   * @returns {Promise<object>}
   */
  async _executeSubmission(participantId, submission) {
    const { clientCommandId, expectedRevision, decisionFrameHash, actionId } = submission;

    // Authenticate participant
    const participant = this._getParticipant(participantId);
    if (!participant) {
      return { accepted: false, error: 'Participant not found', reasonCode: ReasonCode.PARTICIPANT_NOT_FOUND };
    }

    // Verify match is running
    if (this.status !== MatchStatus.RUNNING) {
      return { accepted: false, error: 'Match is not running', reasonCode: ReasonCode.MATCH_NOT_RUNNING };
    }

    // Check idempotency
    const idemKey = `${participantId}:${clientCommandId}`;
    if (!this._idempotency.has(participantId)) {
      this._idempotency.set(participantId, new Map());
    }
    const participantIdempotency = this._idempotency.get(participantId);
    // Sliding-window cleanup: prune oldest entries when cap exceeded (prevents OOM in long matches)
    if (participantIdempotency.size >= this._idempotencyMaxPerParticipant) {
      const toDelete = participantIdempotency.size - Math.floor(this._idempotencyMaxPerParticipant / 2);
      let deleted = 0;
      for (const [key] of participantIdempotency) {
        if (deleted >= toDelete) break;
        participantIdempotency.delete(key);
        deleted++;
      }
    }
    if (participantIdempotency.has(clientCommandId)) {
      const prior = participantIdempotency.get(clientCommandId);
      // Verify the submission matches (same actionId, same revision, same frame)
      if (prior.actionId === actionId && prior.expectedRevision === expectedRevision && prior.decisionFrameHash === decisionFrameHash) {
        return prior.result;
      }
      return { accepted: false, error: 'Idempotency conflict: same clientCommandId with different payload', reasonCode: ReasonCode.IDEMPOTENCY_CONFLICT };
    }

    // Verify actor
    if (participant.playerId !== this.currentDecisionActor) {
      const result = { accepted: false, error: 'Not the current decision actor', reasonCode: ReasonCode.NOT_DECISION_ACTOR };
      participantIdempotency.set(clientCommandId, { actionId, expectedRevision, decisionFrameHash, result });
      return result;
    }

    // Verify revision
    if (expectedRevision !== this._stateRevision) {
      const result = { accepted: false, error: 'Stale state revision', reasonCode: ReasonCode.STALE_REVISION };
      participantIdempotency.set(clientCommandId, { actionId, expectedRevision, decisionFrameHash, result });
      return result;
    }

    // Verify frame hash
    if (decisionFrameHash !== this.decisionFrameHash) {
      const result = { accepted: false, error: 'Stale decision frame', reasonCode: ReasonCode.STALE_DECISION_FRAME };
      participantIdempotency.set(clientCommandId, { actionId, expectedRevision, decisionFrameHash, result });
      return result;
    }

    // Verify action ID exists in vault
    if (!this.commandVault || !this.commandVault.has(actionId)) {
      const result = { accepted: false, error: 'Unknown or stale action ID', reasonCode: ReasonCode.ACTION_ID_INVALID };
      participantIdempotency.set(clientCommandId, { actionId, expectedRevision, decisionFrameHash, result });
      return result;
    }

    // Resolve command from vault (SERVER-SIDE ONLY)
    const command = this.commandVault.get(actionId);
    const commandHash = hashCanonical(command);

    // Record in decision journal BEFORE execution
    const presentedAction = this.legalActionFrame?.find(a => a.actionId === actionId);
    const journalEntry = {
      decisionIndex: this._decisionIndex++,
      actorId: this.currentDecisionActor,
      source: 'human',
      stateRevision: this._stateRevision,
      frameHash: this.decisionFrameHash,
      selectedActionId: actionId,
      selectedCommandHash: commandHash,
      policyId: 'human',
      policyVersion: '1.0.0',
      family: presentedAction?.family ?? null,
      isSuper: presentedAction?.isSuper ?? false,
    };
    this.decisionJournal.push(journalEntry);

    // Execute through the engine
    const result = executeSimulationAction(this.state, command);
    if (!result.accepted) {
      // Engine rejected — rollback journal entry
      this.decisionJournal.pop();
      this._decisionIndex--;
      const errorResult = { accepted: false, error: 'Engine rejected command', reasonCode: ReasonCode.ENGINE_REJECTION, engineError: result.error };
      participantIdempotency.set(clientCommandId, { actionId, expectedRevision, decisionFrameHash, result: errorResult });
      return errorResult;
    }

    // Commit: record command and events
    this.commandLog.push({
      command,
      accepted: true,
      events: result.events,
      commandIndex: this.commandLog.length,
    });
    this.recentSafeEvents = [...this.recentSafeEvents, ...result.events].slice(-20);
    this.state = result.state;
    this._stateRevision = this.state.revision ?? this._stateRevision + 1;

    // Clear current frame
    this.commandVault = null;
    this.legalActionFrame = null;
    this.currentDecisionActor = null;
    this.decisionFrameHash = null;

    // Advance to next decision
    this._advanceToDecision();
    this.updatedAt = Date.now();

    const successResult = { accepted: true };
    participantIdempotency.set(clientCommandId, { actionId, expectedRevision, decisionFrameHash, result: successResult });
    return successResult;
  }

  // ── Views ──

  /**
   * Get the authorized view for a specific participant.
   * Returns only what that player is allowed to see.
   * @param {string} participantId
   */
  getAuthorizedView(participantId) {
    const participant = this.participants.get(participantId);
    if (!participant) return null;

    const playerId = participant.playerId;
    // Use strictPolicyView to produce the canonical {own, opponents, ...} DTO
    // that the browser renderer expects. This avoids sending raw engine state
    // (cards, zones, metadata) over the wire.
    const playerView = this.state ? strictPolicyView(this.state, playerId) : null;

    // Build opponent info (safe — no hidden identities)
    const opponentId = playerId === 'P1' ? 'P2' : 'P1';
    const opponentParticipant = [...this.participants.values()].find(p => p.playerId === opponentId);

    return {
      matchId: this.matchId,
      status: this.status,
      profileId: this.profileId,
      participantId,
      playerId,
      // RANK-01: Server-owned match classification — included in view so
      // the client can derive the correct header label (not hardcoded).
      matchMode: this.matchMode,
      queueId: this.queueId,
      // Local participant's ready status — lets the client show the correct
      // ready button state after reconnecting to a READY_CHECK match.
      ready: participant.ready ?? false,
      opponent: opponentParticipant ? {
        playerId: opponentId,
        connectionState: opponentParticipant.connectionState,
        // Opponent ready status — lets the client show "Opponent is ready"
        ready: opponentParticipant.ready ?? false,
        // Public profile for opponent display (displayName, rating, rank, etc.)
        publicProfile: opponentParticipant.publicProfile ?? null,
      } : null,
      match: {
        fullTurnSequence: this.state?.fullTurnSequence ?? 0,
        phase: this.state?.phase ?? '',
        activePlayerId: this.state?.activePlayerId ?? '',
        winner: this.winner,
        terminationReason: this.terminalReason,
      },
      decision: (this.status === MatchStatus.RUNNING && this.currentDecisionActor) ? {
        actorId: this.currentDecisionActor,
        stateRevision: this._stateRevision,
        frameHash: this.decisionFrameHash,
        isMyDecision: this.currentDecisionActor === playerId,
        legalActions: this.currentDecisionActor === playerId ? this.legalActionFrame : [],
      } : null,
      playerView,
      recentEvents: this.recentSafeEvents.slice(-10).map(e => ({
        type: e.type,
        controllerId: e.controllerId ?? e.payload?.controllerId ?? null,
      })),
      viewHash: playerView ? hashCanonical(playerView).slice(0, 16) : null,
      seed: undefined, // explicitly undefined — never sent to client
    };
  }

  /**
   * Get the full authoritative state (for server-side use only).
   * Never send this to a client.
   */
  getAuthoritativeState() {
    return this.state;
  }

  /**
   * Get match status summary.
   */
  getStatus() {
    return {
      matchId: this.matchId,
      status: this.status,
      profileId: this.profileId,
      participantCount: this.participants.size,
      currentDecisionActor: this.currentDecisionActor,
      stateRevision: this._stateRevision,
      winner: this.winner,
      terminalReason: this.terminalReason,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  // ── Connection management ──

  /**
   * Mark a participant as disconnected.
   * @param {string} participantId
   */
  disconnectParticipant(participantId) {
    const p = this._getParticipant(participantId);
    p.connectionState = ConnectionState.DISCONNECTED;
    this.updatedAt = Date.now();
  }

  /**
   * Mark a participant as reconnected.
   * @param {string} participantId
   */
  reconnectParticipant(participantId) {
    const p = this._getParticipant(participantId);
    p.connectionState = ConnectionState.CONNECTED;
    this.updatedAt = Date.now();
  }

  // ── Replay ──

  /**
   * Collect all engine events from the command log (for achievement evaluation).
   * Returns a flat array of all events emitted during the match.
   * @returns {object[]}
   */
  getAllEvents() {
    const events = [];
    for (const entry of this.commandLog) {
      if (entry.events && entry.events.length > 0) {
        events.push(...entry.events);
      }
    }
    return events;
  }

  /**
   * Generate a certified replay from the authoritative command log.
   */
  getReplay() {
    if (this.status !== MatchStatus.TERMINAL) {
      return null;
    }
    const commands = this.commandLog.map(c => c.command);
    return createAuthorityCertifiedReplay(this.matchId, this._initialState, commands, '4.2.6');
  }

  /**
   * Verify the generated replay.
   */
  verifyReplay() {
    const replay = this.getReplay();
    if (!replay) return { valid: false, error: 'Not terminal' };
    try {
      const result = verifyAuthorityCertifiedReplay(replay);
      return { valid: true, state: result.state, events: result.events };
    } catch (err) {
      return { valid: false, error: /** @type {Error} */ (err).message };
    }
  }

  // ── Cleanup ──

  /**
   * Forfeit the match due to a participant disconnect timeout.
   * The remaining (connected) participant is declared the winner.
   * IRX-H10: Without this, a player about to lose can simply disconnect
   * and avoid the rating loss — the match never terminalizes.
   * @param {string} forfeitingParticipantId - The participant who forfeited
   * @returns {boolean} true if the match was terminalized by this call
   */
  forfeit(forfeitingParticipantId) {
    if (this.status === MatchStatus.TERMINAL || this.status === MatchStatus.ABORTED) {
      return false; // Already terminal
    }
    if (this.status !== MatchStatus.RUNNING && this.status !== MatchStatus.STARTING) {
      return false; // Can only forfeit an active match
    }
    // Find the winner — the other participant
    const winnerId = [...this.participants.keys()]
      .find(pid => pid !== forfeitingParticipantId);
    if (!winnerId) return false;

    this.status = MatchStatus.TERMINAL;
    this.terminalReason = 'FORFEIT';
    this.winner = this.participants.get(winnerId)?.playerId ?? null;
    this.updatedAt = Date.now();
    this.commandVault = null;
    this.legalActionFrame = null;
    return true;
  }

  close() {
    this.commandVault = null;
    this.legalActionFrame = null;
    this._idempotency.clear();
    this.participants.clear();
    this.status = MatchStatus.ABORTED;
  }

  // ── Snapshot (for persistence) ──

  /**
   * Serialize the match to a plain JSON-safe snapshot.
   *
   * The snapshot contains everything needed to reconstruct the match:
   * - Match metadata (matchId, profileId, seed, seatOrder, status)
   * - Participants (as array, not Map)
   * - Command log (the deterministic replay record)
   * - Decision journal, recent events, terminal info
   * - Idempotency records
   * - Timestamps
   *
   * The engine state itself is NOT serialized — it is reconstructed
   * deterministically from seed + command log on restore.
   *
   * @returns {MatchSnapshot} JSON-safe snapshot
   */
  toSnapshot() {
    /** @type {MatchSnapshot} */
    const snapshot = {
      schemaVersion: 3,
      matchId: this.matchId,
      profileId: this.profileId,
      seed: this._seed,
      seatOrder: this.seatOrder,
      status: this.status,
      // RANK-01: Server-owned match classification — survives snapshot/reconnect/restart
      matchMode: this.matchMode,
      queueId: this.queueId,
      seasonId: this.seasonId,
      participants: [...this.participants.entries()].map(([pid, p]) => ({
        participantId: pid,
        playerId: p.playerId,
        // IRX-H15: Store SHA-256 hash of token instead of plaintext.
        // The token itself is never persisted — only its hash. On reconnect,
        // the server hashes the presented token and compares it to the stored hash.
        tokenHash: p.tokenHash ?? _hashToken(p.token),
        // Account ID that owns this participant (v3 — absent in v2 snapshots)
        accountId: p.accountId ?? null,
        // Public profile for opponent display (v3+ — absent in old snapshots → null)
        publicProfile: p.publicProfile ?? null,
        connectionState: p.connectionState,
        ready: p.ready,
      })),
      commandLog: this.commandLog.map(entry => ({
        command: entry.command,
        accepted: entry.accepted,
        events: entry.events ?? [],
        commandIndex: entry.commandIndex,
      })),
      decisionJournal: this.decisionJournal,
      recentSafeEvents: this.recentSafeEvents,
      terminalReason: this.terminalReason,
      winner: this.winner,
      idempotency: [...this._idempotency.entries()].map(([pid, entries]) => ({
        participantId: pid,
        entries: [...entries.entries()].map(([cmdId, record]) => ({
          clientCommandId: cmdId,
          actionId: record.actionId,
          expectedRevision: record.expectedRevision,
          decisionFrameHash: record.decisionFrameHash,
          result: record.result,
        })),
      })),
      stateRevision: this._stateRevision,
      decisionIndex: this._decisionIndex,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      // Version binding — fail closed on mismatch
      versionBinding: {
        productVersion: '0.24.1',
        protocolVersion: PROTOCOL_VERSION,
        engineVersion: ENGINE_VERSION,
        rulesVersion: RULES_VERSION,
      },
    };
    // Compute integrity hash over the canonical content (excluding the hash itself)
    snapshot.integrity = hashCanonical({
      matchId: snapshot.matchId,
      seed: snapshot.seed,
      status: snapshot.status,
      stateRevision: snapshot.stateRevision,
      commandLog: snapshot.commandLog,
      versionBinding: snapshot.versionBinding,
    }).slice(0, 32);
    return snapshot;
  }

  /**
   * Reconstruct a match from a snapshot.
   *
   * This replays the command log deterministically from the seed to
   * rebuild the engine state, then restores all metadata.
   *
   * @param {MatchSnapshot} snapshot - Snapshot from toSnapshot()
   * @returns {AuthoritativeMatchSession}
   */
  static fromSnapshot(snapshot) {
    // Validate schema version — fail closed on mismatch
    if (!snapshot || typeof snapshot !== 'object') {
      throw new Error('Snapshot is not an object');
    }
    if (snapshot.schemaVersion !== 3 && snapshot.schemaVersion !== 2 && snapshot.schemaVersion !== 1) {
      throw new Error(`Unsupported snapshot schema version: ${snapshot.schemaVersion}`);
    }

    // Validate version binding (schema v2+ only)
    if (snapshot.schemaVersion >= 2 && snapshot.versionBinding) {
      const vb = snapshot.versionBinding;
      if (vb.engineVersion !== ENGINE_VERSION) {
        throw new Error(`Engine version mismatch: snapshot=${vb.engineVersion} current=${ENGINE_VERSION}`);
      }
      if (vb.rulesVersion !== RULES_VERSION) {
        throw new Error(`Rules version mismatch: snapshot=${vb.rulesVersion} current=${RULES_VERSION}`);
      }
    }

    // Validate integrity hash (schema v2+ only)
    if (snapshot.schemaVersion >= 2 && snapshot.integrity) {
      const expectedHash = hashCanonical({
        matchId: snapshot.matchId,
        seed: snapshot.seed,
        status: snapshot.status,
        stateRevision: snapshot.stateRevision,
        commandLog: snapshot.commandLog,
        versionBinding: snapshot.versionBinding,
      }).slice(0, 32);
      if (expectedHash !== snapshot.integrity) {
        throw new Error('Snapshot integrity hash mismatch — data may be corrupted');
      }
    }

    const match = new AuthoritativeMatchSession({
      matchId: snapshot.matchId,
      profileId: snapshot.profileId,
      seed: snapshot.seed,
      seatOrder: snapshot.seatOrder,
      // RANK-01: Restore server-owned classification. Old snapshots (v1/v2)
      // lack these fields → default conservatively to non-ranked 'private'.
      // Never infer ranked from a profile string.
      matchMode: snapshot.matchMode ?? 'private',
      queueId: snapshot.queueId ?? null,
      seasonId: snapshot.seasonId ?? null,
    });

    // Restore participants
    match.participants = new Map();
    for (const p of snapshot.participants ?? []) {
      match.participants.set(p.participantId, {
        playerId: p.playerId,
        // IRX-H15: New snapshots store tokenHash; old snapshots store plaintext token.
        // For new snapshots, store the hash directly. For old snapshots, hash the
        // plaintext token at restore time so we never keep plaintext in memory after
        // restore.
        token: p.tokenHash ?? (p.token ? _hashToken(p.token) : null),
        tokenHash: p.tokenHash ?? (p.token ? _hashToken(p.token) : null),
        // accountId is v3 — absent in v2 snapshots, tolerate null
        accountId: p.accountId ?? null,
        // publicProfile is v3+ — absent in old snapshots, tolerate null
        publicProfile: p.publicProfile ?? null,
        // IRX-M36: After a server restart, no participant is actually
        // connected, even if the snapshot says they were. Force DISCONNECTED
        // so the reconnect grace / forfeit logic applies correctly.
        connectionState: ConnectionState.DISCONNECTED,
        ready: p.ready ?? false,
      });
    }

    // Restore timestamps
    match.createdAt = snapshot.createdAt ?? Date.now();
    match.updatedAt = snapshot.updatedAt ?? Date.now();

    // If the match was RUNNING or TERMINAL, reconstruct engine state by replaying
    if (snapshot.status === MatchStatus.RUNNING || snapshot.status === MatchStatus.TERMINAL) {
      // Rebuild initial state from seed (deterministic)
      const stateSetup = {
        profileId: match.profileId,
        playerIds: ['P1', 'P2'],
        enabledModules: [],
        seed: match._seed,
        seatOrder: match.seatOrder,
      };
      match.state = createSimulationState(stateSetup);
      match._initialState = structuredClone(match.state);

      // Replay all accepted commands from the command log
      for (const entry of snapshot.commandLog ?? []) {
        if (!entry.accepted) continue;
        const result = executeSimulationAction(match.state, entry.command);
        if (!result.accepted) {
          // Fail closed on rejected replay command — data is corrupt
          throw new Error(`Replay rejected command at index ${entry.commandIndex}: ${result.error ?? 'unknown'}`);
        }
        match.state = result.state;
      }

      // Verify reconstructed revision matches stored revision
      const reconstructedRevision = match.state.revision ?? match.commandLog.length;
      if (snapshot.stateRevision !== undefined && reconstructedRevision !== snapshot.stateRevision) {
        throw new Error(`Revision mismatch after replay: expected=${snapshot.stateRevision} actual=${reconstructedRevision}`);
      }

      // Restore command log (after replay, to avoid duplication from _advanceToDecision)
      match.commandLog = snapshot.commandLog ?? [];

      match._stateRevision = snapshot.stateRevision ?? match.state.revision ?? 0;
      match._decisionIndex = snapshot.decisionIndex ?? 0;

      // If running, rebuild the current decision frame
      if (snapshot.status === MatchStatus.RUNNING) {
        match.status = MatchStatus.RUNNING;
        match._advanceToDecision();
      } else {
        // Terminal — restore terminal info
        match.status = MatchStatus.TERMINAL;
        match.terminalReason = snapshot.terminalReason;
        match.winner = snapshot.winner ?? match.state.winner;
      }
    } else {
      // Not started yet — just restore status
      match.status = snapshot.status ?? MatchStatus.WAITING_FOR_OPPONENT;
    }

    // Restore journals
    match.decisionJournal = snapshot.decisionJournal ?? [];
    match.recentSafeEvents = snapshot.recentSafeEvents ?? [];

    // Restore idempotency records
    match._idempotency = new Map();
    for (const p of snapshot.idempotency ?? []) {
      const entries = new Map();
      for (const e of p.entries ?? []) {
        entries.set(e.clientCommandId, {
          actionId: e.actionId,
          expectedRevision: e.expectedRevision,
          decisionFrameHash: e.decisionFrameHash,
          result: e.result,
        });
      }
      match._idempotency.set(p.participantId, entries);
    }

    return match;
  }

  // ── Internal helpers ──

  /**
   * @param {string} participantId
   */
  _getParticipant(participantId) {
    const p = this.participants.get(participantId);
    if (!p) {
      throw Object.assign(new Error('Participant not found'), { code: ReasonCode.PARTICIPANT_NOT_FOUND });
    }
    return p;
  }

  /**
   * Validate that a token matches the participant.
   * IRX-H15: Compares the hash of the presented token against the stored hash.
   * For live sessions (before snapshot), the stored value IS the hash of the
   * original token, so we hash the incoming token first.
   * @param {string} participantId
   * @param {string} token
   */
  validateToken(participantId, token) {
    const p = this.participants.get(participantId);
    if (!p) return false;
    if (typeof token !== 'string' || !p.tokenHash) return false;
    const hashedInput = _hashToken(token);
    // Constant-time-ish comparison on the hash
    if (hashedInput.length !== p.tokenHash.length) return false;
    let diff = 0;
    for (let i = 0; i < hashedInput.length; i++) {
      diff |= hashedInput.charCodeAt(i) ^ p.tokenHash.charCodeAt(i);
    }
    return diff === 0;
  }

  /**
   * Find participant ID by token.
   * IRX-H15: Hashes the incoming token and compares against stored hashes.
   * @param {string} token
   */
  findParticipantByToken(token) {
    if (typeof token !== 'string') return null;
    const hashedInput = _hashToken(token);
    for (const [pid, p] of this.participants) {
      if (p.tokenHash && hashedInput.length === p.tokenHash.length) {
        let diff = 0;
        for (let i = 0; i < hashedInput.length; i++) {
          diff |= hashedInput.charCodeAt(i) ^ p.tokenHash.charCodeAt(i);
        }
        if (diff === 0) return pid;
      }
    }
    return null;
  }
}
