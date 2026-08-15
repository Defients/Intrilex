// ═══════════════════════════════════════════════════════════════
// play-controller.js — Deterministic player session controller
// Owns the authoritative state machine. Rendering never owns state.
// Action IDs resolve through a private command vault.
// ═══════════════════════════════════════════════════════════════

import { hashCanonical } from '../engine/browser-entry.js?v=9ea1c2f9e91d';
import { classifyDecisionKind, presentAction } from './action-presenter.js?v=9ea1c2f9e91d';
import {
  PRODUCT_VERSION,
  PLAYER_RUNTIME_VERSION,
  ENGINE_VERSION,
  RULES_VERSION,
  SAVE_FORMAT_VERSION,
  SUPPORTED_PROFILES,
  buildSaveIntegrityPayload,
  validateSaveEnvelope,
  canMigrateSave,
  migrateSave,
} from './save-integrity.js?v=9ea1c2f9e91d';
import { createPolicyRng, computePlayerStats } from './session-utils.js?v=9ea1c2f9e91d';

// Re-export for backward compatibility (other modules import from play-controller)
export { PRODUCT_VERSION, PLAYER_RUNTIME_VERSION, ENGINE_VERSION, RULES_VERSION, SAVE_FORMAT_VERSION, SUPPORTED_PROFILES, buildSaveIntegrityPayload, validateSaveEnvelope, canMigrateSave, migrateSave };

// Session states
export const SessionState = Object.freeze({
  EMPTY: 'EMPTY',
  SETTING_UP: 'SETTING_UP',
  ADVANCING: 'ADVANCING',
  HUMAN_DECISION: 'HUMAN_DECISION',
  AI_DECISION: 'AI_DECISION',
  TERMINAL: 'TERMINAL',
  SAVING: 'SAVING',
  RESTORING: 'RESTORING',
  ERROR: 'ERROR',
});

// Engine modules — lazily imported to support lazy loading
let _engineModule = null;
async function engine() {
  if (!_engineModule) {
    _engineModule = await import('../engine/browser-entry.js?v=9ea1c2f9e91d');
  }
  return _engineModule;
}

let _autonomyModule = null;
async function autonomy() {
  if (!_autonomyModule) {
    _autonomyModule = await import('../autonomy-runtime.js?v=9ea1c2f9e91d');
  }
  return _autonomyModule;
}

/**
 * Create a new player session.
 * @param {object} setup - { profileId, seed, humanPlayerId, aiPolicyId, mode }
 * @returns {Promise<PlaySession>} A new session controller
 */
export async function createSession(setup) {
  const session = new PlaySession();
  await session.init(setup);
  return session;
}

/**
 * Restore a session from a saved state.
 * @param {object} save - The save envelope from IndexedDB
 * @returns {Promise<PlaySession>} A restored session
 */
export async function restoreSession(save) {
  const session = new PlaySession();
  await session.restore(save);
  return session;
}

/**
 * PlaySession — the authoritative player session controller.
 *
 * State machine:
 *   EMPTY → SETTING_UP → ADVANCING → HUMAN_DECISION / AI_DECISION → ADVANCING → TERMINAL
 *   Any state → SAVING → previous state
 *   Any state → RESTORING → stable decision or TERMINAL
 *   Any state → ERROR
 */
export class PlaySession {
  constructor() {
    this.status = SessionState.EMPTY;
    this.sessionId = null;
    this.setup = null;
    this.state = null;          // authoritative engine state
    this.engine = null;          // IntrilexEngine instance
    this.commandVault = null;   // Map<actionId, EngineCommand> — private, never in UI
    this.currentFrame = null;   // current decision frame
    this.decisionJournal = [];  // [{ decisionIndex, actorId, source, stateRevision, frameHash, selectedActionId, selectedCommandHash, policyId, policyVersion }]
    this.commandLog = [];       // [{ command, accepted, events, commandIndex }]
    this.recentEvents = [];     // recent accepted events for UI display
    this.terminalReason = null;
    this.winner = null;
    this.error = null;
    this._stateRevision = 0;
    this._decisionIndex = 0;
    this._rngByPlayer = null;
    this._policyContext = null;
    this._isAdvancing = false;
    this._achievementConsumer = null; // (events, snapshot) => void — set by play-app
  }

  /**
   * Initialize a new session from setup.
   */
  async init(setup) {
    this.status = SessionState.SETTING_UP;
    this.sessionId = `S-${hashCanonical({ setup, created: Date.now() }).slice(0, 16)}`;
    this.setup = setup;

    const auto = await autonomy();
    const engineMod = await engine();

    this.engine = new engineMod.IntrilexEngine();

    // Create initial state
    const stateSetup = {
      profileId: setup.profileId,
      playerIds: ['P1', 'P2'],
      enabledModules: [],
      eventApprovedModules: [],
      seed: setup.seed >>> 0 || 1,
      seatOrder: ['P1', 'P2'],
    };
    this.state = auto.createState(stateSetup);
    this._initialState = structuredClone(this.state);

    // Initialize per-player policy RNG (same as autonomy-runtime)
    const PolicyRng = auto.PolicyRng ?? createPolicyRng;
    const uint32FromHash = (v) => Number.parseInt(hashCanonical(v).slice(0, 8), 16) >>> 0 || 1;
    this._rngByPlayer = Object.fromEntries(
      ['P1', 'P2'].map((playerId, index) => [
        playerId,
        new PolicyRng(uint32FromHash({ seed: stateSetup.seed, playerId, policyId: setup.aiPolicyId, stream: 'POLICY_V4' })),
      ])
    );

    this._decisionIndex = 0;
    this._stateRevision = 0;
    this.status = SessionState.ADVANCING;
    await this._advance();
  }

  /**
   * Register an achievement consumer callback.
   * Called after each batch of engine events with (events, snapshot).
   * @param {(events: object[], snapshot: object|null) => void} consumer
   */
  setAchievementConsumer(consumer) {
    this._achievementConsumer = consumer;
  }

  /**
   * Build a compact snapshot for achievement checkpoint facts.
   * @returns {object}
   */
  _buildAchievementSnapshot() {
    const humanId = this.setup.humanPlayerId;
    const opponentId = humanId === 'P1' ? 'P2' : 'P1';
    const state = this.state;
    if (!state) return null;
    const humanPlayer = state.players?.[humanId];
    const opponentPlayer = state.players?.[opponentId];
    return {
      humanScore: humanPlayer?.securedPoints ?? 0,
      opponentScore: opponentPlayer?.securedPoints ?? 0,
      humanHandCount: humanPlayer?.hand?.length ?? 0,
      opponentHandCount: opponentPlayer?.hand?.length ?? 0,
      stackDepth: state.stack?.length ?? 0,
      fullTurnSequence: state.fullTurnSequence ?? 0,
      stateRevision: this._stateRevision,
      isTerminal: this.status === SessionState.TERMINAL,
      winner: this.winner,
      isDraw: this.winner === null && this.status === SessionState.TERMINAL,
    };
  }

  /**
   * Notify the achievement consumer of new events.
   * @param {object[]} events
   */
  _notifyAchievementConsumer(events) {
    if (!this._achievementConsumer || !events || events.length === 0) return;
    try {
      const snapshot = this._buildAchievementSnapshot();
      this._achievementConsumer(events, snapshot);
    } catch {
      // Achievement consumer errors are non-fatal — never break the game
    }
  }

  /**
   * Advance the session to the next decision boundary or terminal state.
   * This is the core loop that processes automatic orchestration commands
   * and stops at human decisions, AI decisions, or terminal.
   */
  async _advance() {
    if (this.status === SessionState.TERMINAL || this.status === SessionState.ERROR) return;
    if (this._isAdvancing) return; // prevent concurrent orchestration
    this._isAdvancing = true;

    this.status = SessionState.ADVANCING;
    const auto = await autonomy();

    let safetyCounter = 0;
    const MAX_ORCHESTRATION = 64;

    try {
      while (safetyCounter++ < MAX_ORCHESTRATION) {
        // Use the autonomy-runtime's advance function
        const result = auto.advance(this.state);

        // Append any executed commands and events
        if (result.executedCommands) {
          for (const cmd of result.executedCommands) {
            this.commandLog.push({ command: cmd, accepted: true, events: [], commandIndex: this.commandLog.length });
          }
        }
        if (result.events) {
          this.recentEvents = [...this.recentEvents, ...result.events].slice(-20);
        }

        // Update state
        this.state = result.state;
        this._stateRevision = this.state.revision ?? this._stateRevision + 1;

        // Notify achievement consumer of new events
        if (result.events && result.events.length > 0) {
          this._notifyAchievementConsumer(result.events);
        }

        // Check terminal
        if (result.status === 'TERMINAL') {
          this.status = SessionState.TERMINAL;
          this.terminalReason = result.reasonCode;
          this.winner = this.state.winner;
          this.currentFrame = null;
          this.commandVault = null;
          // Final checkpoint notification for terminal state
          this._notifyAchievementConsumer([]);
          return;
        }

        // Check unsupported/error
        if (result.status === 'UNSUPPORTED_CONFIGURATION') {
          this.status = SessionState.ERROR;
          this.error = { code: result.reasonCode, message: `Unsupported configuration: ${result.reasonCode}` };
          this.currentFrame = null;
          this.commandVault = null;
          return;
        }

        // Player decision required
        if (result.status === 'PLAYER_DECISION_REQUIRED') {
          const actorId = result.decisionActorId;
          const isHuman = actorId === this.setup.humanPlayerId;

          // Build the decision frame
          await this._buildDecisionFrame(result, actorId, isHuman);

          if (isHuman) {
            this.status = SessionState.HUMAN_DECISION;
          } else {
            this.status = SessionState.AI_DECISION;
            // AI decision will be handled by the caller via stepAI()
          }
          return;
        }

        // Unknown status — treat as error
        this.status = SessionState.ERROR;
        this.error = { code: 'UNKNOWN_STATUS', message: `Unknown advance status: ${result.status}` };
        return;
      }

      // Safety counter exceeded
      this.status = SessionState.ERROR;
      this.error = { code: 'ORCHESTRATION_LIMIT', message: 'Orchestration limit exceeded' };
    } catch (error) {
      this.status = SessionState.ERROR;
      this.error = { code: 'ADVANCE_EXCEPTION', message: error.message };
    } finally {
      this._isAdvancing = false;
    }
  }

  /**
   * Build the decision frame for the current decision.
   * Creates the command vault (private) and the authorized view (public).
   */
  async _buildDecisionFrame(result, actorId, isHuman) {
    const auto = await autonomy();
    const frame = result.legalActionFrame;
    const profileId = this.setup.profileId;

    // Create command vault — maps actionId to EngineCommand
    // This is PRIVATE and never exposed to the UI snapshot
    this.commandVault = new Map();
    for (const action of frame.actions) {
      this.commandVault.set(action.actionId, action.command);
    }

    // Build authorized action views (no commands)
    const policyActions = frame.actions.map(action => auto.actionView(action, profileId));

    // Build the player-authorized view for the human
    const playerView = isHuman ? auto.strictView(this.state, this.setup.humanPlayerId) : null;

    // Compute frame hash for staleness checking
    const frameHash = hashCanonical({
      stateRevision: this._stateRevision,
      actorId,
      actions: policyActions.map(a => a.actionId),
    });

    // Classify decision kind
    const firstAction = policyActions[0];
    const kind = classifyDecisionKind(firstAction);

    this.currentFrame = {
      stateRevision: this._stateRevision,
      actorId,
      isHuman,
      kind,
      frameHash,
      legalActions: policyActions.map(a => presentAction(a, null)),
      forcedActionId: frame.forcedActionId ?? null,
      playerView,
    };
  }

  /**
   * Submit a human action.
   * @param {object} submission - { sessionId, stateRevision, decisionFrameHash, actionId }
   * @returns {object} { accepted, error } — never returns a command
   */
  async submitHumanAction(submission) {
    // Validate submission
    if (this.status !== SessionState.HUMAN_DECISION) {
      return { accepted: false, error: 'NOT_HUMAN_DECISION', message: 'No human decision is pending.' };
    }
    if (submission.sessionId !== this.sessionId) {
      return { accepted: false, error: 'SESSION_MISMATCH', message: 'Session ID does not match.' };
    }
    if (submission.stateRevision !== this._stateRevision) {
      return { accepted: false, error: 'STALE_REVISION', message: 'Stale state revision. Re-rendering current frame.' };
    }
    if (submission.decisionFrameHash !== this.currentFrame.frameHash) {
      return { accepted: false, error: 'STALE_FRAME', message: 'Stale decision frame. Re-rendering current frame.' };
    }
    if (!this.commandVault || !this.commandVault.has(submission.actionId)) {
      return { accepted: false, error: 'UNKNOWN_ACTION', message: `Unknown or stale action ID: ${submission.actionId}` };
    }

    // Resolve the action through the vault
    const command = this.commandVault.get(submission.actionId);
    const commandHash = hashCanonical(command);

    // Record in decision journal BEFORE execution
    const presentedAction = this.currentFrame.legalActions.find(a => a.actionId === submission.actionId);
    const journalEntry = {
      decisionIndex: this._decisionIndex++,
      actorId: this.currentFrame.actorId,
      source: 'human',
      stateRevision: this._stateRevision,
      frameHash: this.currentFrame.frameHash,
      selectedActionId: submission.actionId,
      selectedCommandHash: commandHash,
      policyId: 'human',
      policyVersion: '1.0.0',
      family: presentedAction?.family ?? null,
      isSuper: presentedAction?.isSuper ?? false,
    };
    this.decisionJournal.push(journalEntry);

    // Execute through the engine
    const result = this.engine.execute(this.state, command);
    if (!result.accepted) {
      this.status = SessionState.ERROR;
      this.error = { code: 'ENGINE_REJECTION', message: `Engine rejected command: ${result.error?.code ?? 'unknown'}` };
      return { accepted: false, error: 'ENGINE_REJECTION', message: this.error.message };
    }

    // Record command and events
    this.commandLog.push({
      command,
      accepted: true,
      events: result.events,
      commandIndex: this.commandLog.length,
    });
    this.recentEvents = [...this.recentEvents, ...result.events].slice(-20);
    this.state = result.state;
    this._stateRevision = this.state.revision ?? this._stateRevision + 1;

    // Notify achievement consumer of human action events
    this._notifyAchievementConsumer(result.events);

    // Clear the current frame
    this.commandVault = null;
    this.currentFrame = null;

    // Advance to next decision
    await this._advance();

    return { accepted: true };
  }

  /**
   * Step the AI to its next decision.
   * The AI receives only the strict authorized view and legal actions.
   * @returns {object} { stepped, error }
   */
  async stepAI() {
    if (this.status !== SessionState.AI_DECISION) {
      return { stepped: false, error: 'NOT_AI_DECISION' };
    }

    const auto = await autonomy();
    const actorId = this.currentFrame.actorId;
    const policyId = this.setup.aiPolicyId;

    // Build the AI's authorized view (strict — no hidden info)
    const aiView = auto.strictView(this.state, actorId);

    // Get the raw legal actions (with commands) for the vault
    const frame = this.currentFrame;
    const legalActions = Array.from(this.commandVault.entries()).map(([actionId, command]) => {
      // Find the action in the frame
      const presented = frame.legalActions.find(a => a.actionId === actionId);
      return {
        actionId,
        actorId,
        family: presented.family,
        mode: presented.mode,
        timingClass: presented.timingClass,
        sourceCardIds: presented.sourceHandles,
        targetCardIds: presented.targetHandles,
        featureVector: presented.featureVector,
        command,
        commandHash: presented.commandHash,
      };
    });

    // Build AI context — only authorized view, no hidden info
    const context = {
      matchId: this.sessionId,
      runInstanceId: this.sessionId,
      decisionIndex: this._decisionIndex,
      actorId,
      authorizedView: aiView,
      legalActions,
      rng: this._rngByPlayer[actorId],
      profileId: this.setup.profileId,
      engineVersion: auto.ENGINE_VERSION,
      rulesVersion: RULES_VERSION,
    };

    // Select action through the policy
    let selected;
    try {
      selected = auto.choosePolicy(policyId, context);
    } catch (error) {
      this.status = SessionState.ERROR;
      this.error = { code: 'AI_POLICY_EXCEPTION', message: `AI policy threw: ${error.message}` };
      return { stepped: false, error: 'AI_POLICY_EXCEPTION' };
    }
    if (!selected) {
      this.status = SessionState.ERROR;
      this.error = { code: 'AI_NO_SELECTION', message: 'AI policy returned no selection.' };
      return { stepped: false, error: 'AI_NO_SELECTION' };
    }

    const commandHash = hashCanonical(selected.command);

    // Record in decision journal
    const aiPresentedAction = frame.legalActions.find(a => a.actionId === selected.actionId);
    const journalEntry = {
      decisionIndex: this._decisionIndex++,
      actorId,
      source: 'ai',
      stateRevision: this._stateRevision,
      frameHash: this.currentFrame.frameHash,
      selectedActionId: selected.actionId,
      selectedCommandHash: commandHash,
      policyId,
      policyVersion: '1.0.0',
      family: aiPresentedAction?.family ?? null,
      isSuper: aiPresentedAction?.isSuper ?? false,
    };
    this.decisionJournal.push(journalEntry);

    // Execute through the engine
    const result = this.engine.execute(this.state, selected.command);
    if (!result.accepted) {
      this.status = SessionState.ERROR;
      this.error = { code: 'ENGINE_REJECTION', message: `Engine rejected AI command: ${result.error?.code ?? 'unknown'}` };
      return { stepped: false, error: 'ENGINE_REJECTION' };
    }

    // Record command and events
    this.commandLog.push({
      command: selected.command,
      accepted: true,
      events: result.events,
      commandIndex: this.commandLog.length,
    });
    this.recentEvents = [...this.recentEvents, ...result.events].slice(-20);
    this.state = result.state;
    this._stateRevision = this.state.revision ?? this._stateRevision + 1;

    // Notify achievement consumer of AI action events
    this._notifyAchievementConsumer(result.events);

    // Clear the current frame
    this.commandVault = null;
    this.currentFrame = null;

    // Advance to next decision
    await this._advance();

    return { stepped: true };
  }

  /**
   * Build the UI snapshot for the current state.
   * This is what the renderer receives — never includes commands or hidden info.
   */
  getSnapshot() {
    const auto = _autonomyModule;
    if (!auto) return { schemaVersion: '1.0.0', sessionId: this.sessionId, status: this.status, error: 'MODULES_NOT_LOADED' };
    const frame = this.currentFrame;
    const isHuman = frame?.isHuman ?? false;
    const playerView = isHuman ? frame.playerView : (auto ? auto.strictView(this.state, this.setup.humanPlayerId) : null);

    // Compute post-match stats from the decision journal
    const humanStats = computePlayerStats(this.decisionJournal, this.setup.humanPlayerId);
    const opponentStats = computePlayerStats(this.decisionJournal, this.setup.humanPlayerId === 'P1' ? 'P2' : 'P1');

    return {
      schemaVersion: '1.0.0',
      sessionId: this.sessionId,
      status: this.status,
      mode: this.setup.mode,
      profileId: this.setup.profileId,
      human: {
        playerId: this.setup.humanPlayerId,
        seat: this.setup.humanPlayerId === 'P1' ? 1 : 2,
      },
      opponent: {
        displayName: this.setup.aiPolicyId,
        policyId: this.setup.aiPolicyId,
        archetype: this.setup.aiArchetype ?? '',
        difficulty: this.setup.aiDifficulty ?? '',
      },
      match: {
        fullTurnSequence: this.state?.fullTurnSequence ?? 0,
        phase: this.state?.phase ?? '',
        activePlayerId: this.state?.activePlayerId ?? '',
        winner: this.winner,
        terminationReason: this.terminalReason,
      },
      decision: frame ? {
        actorId: frame.actorId,
        kind: frame.kind,
        stateRevision: frame.stateRevision,
        frameHash: frame.frameHash,
        legalActions: frame.legalActions,
        isHuman,
      } : null,
      playerView,
      recentEvents: this.recentEvents.slice(-10).map(e => ({
        type: e.type,
        controllerId: e.controllerId ?? e.payload?.controllerId ?? null,
        payload: e.payload ?? null,
      })),
      viewHash: playerView ? hashCanonical(playerView).slice(0, 16) : null,
      humanStats,
      opponentStats,
    };
  }

  /**
   * Build the save envelope for persistence.
   */
  getSaveEnvelope() {
    const initialStateHash = hashCanonical(this._initialState ?? this.state);
    const commandLogHash = hashCanonical(this.commandLog.map(c => hashCanonical(c.command)));
    const expectedStateHash = hashCanonical(this.state);

    const envelope = {
      format: 'intrilex-player-save',
      version: SAVE_FORMAT_VERSION,
      saveId: `SAVE-${this.sessionId}-${this._decisionIndex}`,
      sessionId: this.sessionId,
      productVersion: PRODUCT_VERSION,
      playerRuntimeVersion: PLAYER_RUNTIME_VERSION,
      engineVersion: ENGINE_VERSION,
      rulesVersion: RULES_VERSION,
      profileId: this.setup.profileId,
      mode: this.setup.mode,
      setup: {
        seed: this.setup.seed,
        seatOrder: ['P1', 'P2'],
        humanPlayerId: this.setup.humanPlayerId,
        aiPolicyId: this.setup.aiPolicyId,
        aiPolicyVersion: '1.0.0',
        aiConfigHash: hashCanonical({ policyId: this.setup.aiPolicyId }),
      },
      decisionJournal: this.decisionJournal.map(e => ({ ...e })),
      commandLog: this.commandLog.map(c => structuredClone(c.command)),
      initialStateHash,
      commandLogHash,
      expectedStateHash,
      stableBoundary: this.currentFrame ? {
        stateRevision: this._stateRevision,
        decisionFrameHash: this.currentFrame.frameHash,
      } : { stateRevision: this._stateRevision, decisionFrameHash: null },
      summary: this._buildSaveSummary(),
      tutorial: this.setup.tutorial ?? null,
    };
    // Content hash binds EVERY authority-critical field (v2)
    envelope.contentHash = buildSaveIntegrityPayload(envelope);
    return envelope;
  }

  /**
   * Build a lightweight summary for the Continue Duel card on the landing page.
   * Contains only public, non-authority-critical display data (turn, scores, opponent).
   * @returns {{ turn: number, humanScore: number, opponentScore: number, opponentLabel: string, mode: string } | null}
   */
  _buildSaveSummary() {
    const auto = _autonomyModule;
    if (!auto || !this.state || !this.setup) return null;
    const humanId = this.setup.humanPlayerId;
    const oppId = humanId === 'P1' ? 'P2' : 'P1';
    const humanView = auto.strictView(this.state, humanId);
    const oppView = auto.strictView(this.state, oppId);
    const modeLabel = this.setup.mode ? String(this.setup.mode).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : 'Local vs AI';
    const opponentRaw = this.setup.aiPolicyId ?? '';
    const opponentLabel = opponentRaw ? opponentRaw.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'AI';
    return {
      turn: this.state.fullTurnSequence ?? 0,
      humanScore: humanView?.own?.securedPoints ?? 0,
      opponentScore: oppView?.own?.securedPoints ?? 0,
      opponentLabel,
      mode: modeLabel,
    };
  }

  /**
   * Restore a session from a save envelope.
   * Reconstructs by replaying the decision journal and verifying hashes.
   */
  async restore(save) {
    // ═══════════════════════════════════════════════════════════
    // Phase 1–3 — Schema, content hash, version & profile validation
    // Delegated to the canonical validateSaveEnvelope() function.
    // No mutation occurs before validation passes.
    // ═══════════════════════════════════════════════════════════
    const validation = validateSaveEnvelope(save);
    if (!validation.valid) {
      // Attempt migration for v1 saves and version mismatches before rejecting
      const migration = canMigrateSave(save);
      if (migration.canMigrate) {
        const auto = await autonomy();
        const engineMod = await engine();
        const migrationResult = await migrateSave(save, engineMod, auto);
        if (migrationResult.ok) {
          // Re-validate the migrated save
          const reValidation = validateSaveEnvelope(migrationResult.save);
          if (reValidation.valid) {
            save = migrationResult.save;
          } else {
            throw Object.assign(new Error(`Migration produced invalid save: ${reValidation.message}`), { reasonCode: 'MIGRATION_FAILED', field: reValidation.field });
          }
        } else {
          throw Object.assign(new Error(`Save migration failed: ${migrationResult.error}`), { reasonCode: 'MIGRATION_FAILED' });
        }
      } else {
        throw Object.assign(new Error(validation.message), { reasonCode: validation.reasonCode, field: validation.field });
      }
    }

    // ═══════════════════════════════════════════════════════════
    // Phase 4 — Isolated candidate reconstruction
    // ═══════════════════════════════════════════════════════════
    const auto = await autonomy();
    const engineMod = await engine();
    const candidateEngine = new engineMod.IntrilexEngine();

    const stateSetup = {
      profileId: save.profileId,
      playerIds: ['P1', 'P2'],
      enabledModules: [],
      eventApprovedModules: [],
      seed: save.setup.seed >>> 0 || 1,
      seatOrder: save.setup.seatOrder,
    };
    let candidateState = auto.createState(stateSetup);
    const candidateInitialState = structuredClone(candidateState);

    // Verify initialStateHash
    const candidateInitialHash = hashCanonical(candidateInitialState);
    if (candidateInitialHash !== save.initialStateHash) {
      throw Object.assign(new Error('Initial state hash mismatch'), { reasonCode: 'INITIAL_STATE_HASH_MISMATCH' });
    }

    // Initialize policy RNG for candidate
    const PolicyRng = createPolicyRng;
    const uint32FromHash = (v) => Number.parseInt(hashCanonical(v).slice(0, 8), 16) >>> 0 || 1;
    const candidateRngByPlayer = Object.fromEntries(
      ['P1', 'P2'].map((playerId) => [
        playerId,
        new PolicyRng(uint32FromHash({ seed: stateSetup.seed, playerId, policyId: save.setup.aiPolicyId, stream: 'POLICY_V4' })),
      ])
    );

    // Replay the decision journal in the candidate session





    // We need a temporary session-like object for _advance to work
    // Save the current session state and temporarily use candidate
    const savedStatus = this.status;
    const savedState = this.state;
    const savedEngine = this.engine;
    const savedCommandVault = this.commandVault;
    const savedCurrentFrame = this.currentFrame;
    const savedDecisionJournal = this.decisionJournal;
    const savedCommandLog = this.commandLog;
    const savedRecentEvents = this.recentEvents;
    const savedDecisionIndex = this._decisionIndex;
    const savedStateRevision = this._stateRevision;
    const savedRngByPlayer = this._rngByPlayer;
    const savedSessionId = this.sessionId;
    const savedSetup = this.setup;
    const savedInitialState = this._initialState;

    // Wire candidate into the session temporarily for replay
    this.status = SessionState.ADVANCING;
    this.sessionId = save.sessionId;
    this.setup = { profileId: save.profileId, seed: save.setup.seed, humanPlayerId: save.setup.humanPlayerId, aiPolicyId: save.setup.aiPolicyId, aiArchetype: save.setup.aiArchetype ?? '', aiDifficulty: save.setup.aiDifficulty ?? '', mode: save.mode, tutorial: save.tutorial };
    this.engine = candidateEngine;
    this.state = candidateState;
    this._decisionIndex = 0;
    this._stateRevision = 0;
    this._rngByPlayer = candidateRngByPlayer;
    this.decisionJournal = [];
    this.commandLog = [];
    this.recentEvents = [];
    this.commandVault = null;
    this.currentFrame = null;

    try {
      for (const entry of save.decisionJournal) {
        await this._advance();

        if (this.status !== SessionState.HUMAN_DECISION && this.status !== SessionState.AI_DECISION) {
          throw Object.assign(new Error(`RESTORE_MISMATCH at decision ${entry.decisionIndex}: expected decision, got ${this.status}`), { reasonCode: 'RESTORE_FRAME_HASH_MISMATCH' });
        }
        if (this.currentFrame.actorId !== entry.actorId) {
          throw Object.assign(new Error(`RESTORE_MISMATCH: expected actor ${entry.actorId}, got ${this.currentFrame.actorId}`), { reasonCode: 'RESTORE_FRAME_HASH_MISMATCH' });
        }
        if (this.currentFrame.frameHash !== entry.frameHash) {
          throw Object.assign(new Error(`RESTORE_FRAME_HASH_MISMATCH at decision ${entry.decisionIndex}`), { reasonCode: 'RESTORE_FRAME_HASH_MISMATCH' });
        }

        if (!this.commandVault.has(entry.selectedActionId)) {
          throw Object.assign(new Error(`RESTORE_ACTION_NOT_FOUND: ${entry.selectedActionId}`), { reasonCode: 'RESTORE_FRAME_HASH_MISMATCH' });
        }
        const command = this.commandVault.get(entry.selectedActionId);
        const commandHash = hashCanonical(command);
        if (commandHash !== entry.selectedCommandHash) {
          throw Object.assign(new Error(`RESTORE_COMMAND_HASH_MISMATCH at decision ${entry.decisionIndex}`), { reasonCode: 'COMMAND_LOG_HASH_MISMATCH' });
        }

        if (entry.source === 'ai') {
          const aiView = auto.strictView(this.state, entry.actorId);
          const legalActions = Array.from(this.commandVault.entries()).map(([actionId, cmd]) => {
            const presented = this.currentFrame.legalActions.find(a => a.actionId === actionId);
            return { actionId, actorId: entry.actorId, family: presented.family, mode: presented.mode, timingClass: presented.timingClass, sourceCardIds: presented.sourceHandles, targetCardIds: presented.targetHandles, featureVector: presented.featureVector, command: cmd, commandHash: presented.commandHash };
          });
          const context = { matchId: this.sessionId, runInstanceId: this.sessionId, decisionIndex: this._decisionIndex, actorId: entry.actorId, authorizedView: aiView, legalActions, rng: this._rngByPlayer[entry.actorId], profileId: this.setup.profileId, engineVersion: auto.ENGINE_VERSION, rulesVersion: RULES_VERSION };
          const aiSelected = auto.choosePolicy(this.setup.aiPolicyId, context);
          if (!aiSelected || aiSelected.actionId !== entry.selectedActionId) {
            throw Object.assign(new Error(`RESTORE_AI_DIVERGENCE at decision ${entry.decisionIndex}`), { reasonCode: 'RESTORE_FRAME_HASH_MISMATCH' });
          }
        }

        const result = this.engine.execute(this.state, command);
        if (!result.accepted) {
          throw Object.assign(new Error(`RESTORE_ENGINE_REJECTION at decision ${entry.decisionIndex}`), { reasonCode: 'RESTORE_FRAME_HASH_MISMATCH' });
        }

        this.decisionJournal.push(entry);
        this.commandLog.push({ command, accepted: true, events: result.events, commandIndex: this.commandLog.length });
        this.recentEvents = [...this.recentEvents, ...result.events].slice(-20);
        this.state = result.state;
        this._stateRevision = this.state.revision ?? this._stateRevision + 1;
        this._decisionIndex++;
      }

      // Advance to stable boundary
      await this._advance();

      // Verify commandLogHash
      const replayedCommandLogHash = hashCanonical(this.commandLog.map(c => hashCanonical(c.command)));
      if (replayedCommandLogHash !== save.commandLogHash) {
        throw Object.assign(new Error('Command log hash mismatch after replay'), { reasonCode: 'COMMAND_LOG_HASH_MISMATCH' });
      }

      // Verify expectedStateHash — strict in v2
      const finalHash = hashCanonical(this.state);
      if (save.expectedStateHash && finalHash !== save.expectedStateHash) {
        throw Object.assign(new Error('Expected state hash mismatch after replay'), { reasonCode: 'EXPECTED_STATE_HASH_MISMATCH' });
      }

      // ═══════════════════════════════════════════════════════════
      // Phase 5 — All checks passed. Candidate becomes active.
      // ═══════════════════════════════════════════════════════════
      // The session state is already wired with the candidate's values.
      // Commit the restored initial state so future saves/replays bind correctly.
      this._initialState = candidateInitialState;
      // Just update the status to the correct decision state.
      this.status = this.status === SessionState.TERMINAL ? SessionState.TERMINAL :
                    this.currentFrame?.isHuman ? SessionState.HUMAN_DECISION : SessionState.AI_DECISION;

    } catch (error) {
      // ═══════════════════════════════════════════════════════════
      // Rollback — restore the saved session state
      // ═══════════════════════════════════════════════════════════
      this.status = savedStatus;
      this.state = savedState;
      this.engine = savedEngine;
      this.commandVault = savedCommandVault;
      this.currentFrame = savedCurrentFrame;
      this.decisionJournal = savedDecisionJournal;
      this.commandLog = savedCommandLog;
      this.recentEvents = savedRecentEvents;
      this._decisionIndex = savedDecisionIndex;
      this._stateRevision = savedStateRevision;
      this._rngByPlayer = savedRngByPlayer;
      this.sessionId = savedSessionId;
      this.setup = savedSetup;
      this._initialState = savedInitialState;
      throw error;
    }
  }

  /**
   * Create a certified replay from the current command log.
   */
  async createCertifiedReplay() {
    const engineMod = await engine();
    const commands = this.commandLog.map(c => c.command);
    const initialState = this._initialState ?? this.state; // fallback
    return engineMod.createCertifiedReplay(this.sessionId, initialState, commands, '4.2.6');
  }

  /**
   * Verify a certified replay.
   */
  async verifyReplay(replay) {
    const engineMod = await engine();
    return engineMod.verifyCertifiedReplay(replay);
  }

  /**
   * Create a public (sanitized) replay view.
   */
  async createPublicReplay(replay) {
    const engineMod = await engine();
    return engineMod.publicCertifiedReplayView(replay);
  }
}


