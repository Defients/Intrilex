// ═══════════════════════════════════════════════════════════════
// guided-controller.mjs — Guided Exhibition orchestration controller
//
// Sits between the headless runtime and the game UI, managing:
//   - Checkpoint tracking and scripted action execution
//   - Commentary display timing
//   - Hint escalation (H1 visual → H2 conceptual → H3 explicit)
//   - Card glow/highlight states
//   - Player decision gating (auto-execute rival, wait for player)
//   - Divergence handling (off-script player actions)
//   - Replay with reduced/no guidance
//   - Debrief transition
//
// This module is importable both in Node.js (for testing) and in the
// browser (for UI). It has no DOM dependencies.
// ═══════════════════════════════════════════════════════════════

import {
  IntrilexEngine,
  advanceCoreToDecision,
} from '../../engine/browser-entry.js';

import {
  reconstructInitialState,
  executeScriptedAction,
  matchIntent,
} from './guided-runtime.mjs';

import {
  GuidedStatus,
  GuidanceLevel,
  HintStage,
  GlowLevel,
} from './guided-types.mjs';

const MAX_ORCHESTRATION = 64;

/**
 * Guided Exhibition orchestration controller.
 *
 * Manages the real-time flow of a guided match, executing scripted
 * actions in order, displaying commentary and hints, and gating
 * player decisions.
 */
export class GuidedController {
  /**
   * @param {import('./guided-types.mjs').GuidedScenario} scenario
   * @param {object} [opts] - Callbacks and configuration
   * @param {string} [opts.guidanceLevel] - Initial guidance level
   * @param {function} [opts.onStateChange] - Called when engine state changes
   * @param {function} [opts.onCommentary] - Called when a commentary cue is shown
   * @param {function} [opts.onHint] - Called when hint stage changes
   * @param {function} [opts.onGlow] - Called when glow state changes
   * @param {function} [opts.onCheckpoint] - Called when checkpoint advances
   * @param {function} [opts.onTerminal] - Called when match reaches terminal state
   * @param {function} [opts.onDebrief] - Called when debrief should be shown
   * @param {function} [opts.onWaitingForPlayer] - Called when player input is needed
   * @param {function} [opts.onError] - Called on errors
   */
  constructor(scenario, opts = {}) {
    this._scenario = scenario;
    this._engine = new IntrilexEngine();
    this._state = null;
    this._status = GuidedStatus.UNLOADED;
    this._guidanceLevel = opts.guidanceLevel ?? GuidanceLevel.FULL;
    this._checkpointIndex = 0;
    this._scriptedActionIndex = 0;
    this._commentaryQueue = [];
    this._activeCommentary = null;
    this._hintStage = HintStage.H0_SILENCE;
    this._glowIdentities = [];
    this._glowLevel = GlowLevel.AMBIENT;
    this._legalActionFrame = null;
    this._waitingForPlayer = false;
    this._pendingScripted = null;
    this._commands = [];
    this._events = [];
    this._commentaryHistory = [];
    this._elapsedMs = 0;
    this._checkpointStartTime = 0;
    this._replayCount = 0;

    // Callbacks — accept both canonical names and short aliases
    this.onStateChange = opts.onStateChange ?? opts.onState ?? null;
    this.onCommentary = opts.onCommentary ?? null;
    this.onHint = opts.onHint ?? null;
    this.onGlow = opts.onGlow ?? null;
    this.onCheckpoint = opts.onCheckpoint ?? null;
    this.onTerminal = opts.onTerminal ?? null;
    this.onDebrief = opts.onDebrief ?? null;
    this.onWaitingForPlayer = opts.onWaitingForPlayer ?? opts.onWaiting ?? null;
    this.onError = opts.onError ?? null;
  }

  // ── Public API ──────────────────────────────────────────

  /**
   * Start the guided exhibition. Reconstructs the initial state
   * and processes the first checkpoint.
   */
  async start() {
    try {
      this._state = reconstructInitialState(this._scenario);
    } catch (err) {
      this._status = GuidedStatus.ERROR;
      this._emitError(`Reconstruction failed: ${err.message}`);
      return;
    }
    this._status = GuidedStatus.PLAYING;
    this._checkpointIndex = 0;
    this._scriptedActionIndex = 0;
    this._commands = [];
    this._events = [];
    this._commentaryHistory = [];
    this._elapsedMs = 0;
    this._checkpointStartTime = Date.now();
    this._emitStateChange();
    this._processCurrentCheckpoint();
  }

  /**
   * Called periodically (e.g. via requestAnimationFrame or setInterval)
   * to update hint timers and commentary timing.
   * @param {number} deltaMs - Milliseconds since last tick
   */
  tick(deltaMs = 16) {
    if (this._status !== GuidedStatus.PLAYING && this._status !== GuidedStatus.CHECKPOINT) return;
    this._elapsedMs += deltaMs;

    // Hint escalation
    if (this._waitingForPlayer && this._guidanceLevel !== GuidanceLevel.NONE) {
      const cp = this._scenario.checkpoints[this._checkpointIndex];
      if (cp && cp.hint) {
        const sinceCheckpoint = Date.now() - this._checkpointStartTime;
        if (sinceCheckpoint >= cp.hint.h3DelayMs && this._hintStage !== HintStage.H3_EXPLICIT) {
          this._hintStage = HintStage.H3_EXPLICIT;
          this._emitHint(HintStage.H3_EXPLICIT, cp.hint.h3Text);
        } else if (sinceCheckpoint >= cp.hint.h2DelayMs && this._hintStage !== HintStage.H2_CONCEPTUAL && this._hintStage !== HintStage.H3_EXPLICIT) {
          this._hintStage = HintStage.H2_CONCEPTUAL;
          this._emitHint(HintStage.H2_CONCEPTUAL, cp.hint.h2Text);
        } else if (sinceCheckpoint >= cp.hint.h1DelayMs && this._hintStage === HintStage.H0_SILENCE) {
          this._hintStage = HintStage.H1_VISUAL;
          this._emitHint(HintStage.H1_VISUAL, null);
          if (cp.hint.glowIdentities && this._guidanceLevel === GuidanceLevel.FULL) {
            this._glowIdentities = cp.hint.glowIdentities;
            this._glowLevel = cp.hint.glowLevel ?? GlowLevel.SUGGESTED;
            this._emitGlow();
          }
        }
      }
    }
  }

  /**
   * Player submits an action. The controller matches it against the
   * pending scripted intent. If it matches, the action is executed.
   * If it doesn't match, divergence handling kicks in.
   *
   * @param {object} action - The legal action selected by the player
   * @returns {{ accepted: boolean, divergence?: string }}
   */
  playerAction(action) {
    if (!this._waitingForPlayer) return { accepted: false };
    const cp = this._scenario.checkpoints[this._checkpointIndex];
    if (!cp) return { accepted: false };

    // Check if the action matches the pending scripted intent
    const scripted = cp.scriptedActions?.[this._scriptedActionIndex];
    if (!scripted) return { accepted: false };

    const matches = matchIntent(scripted.intent, [action], this._state);
    if (matches) {
      // On-script: execute the action
      this._waitingForPlayer = false;
      this._pendingScripted = null;
      this._clearHintStage();
      // Defer to the event loop so the browser can repaint before the
      // synchronous chain of auto-execute actions (rival turns) runs.
      setTimeout(() => {
        try {
          this._executeScriptedAction(scripted);
        } catch (err) {
          this._status = GuidedStatus.ERROR;
          this._emitError(`Action execution error: ${err.message}`);
        }
      }, 0);
      return { accepted: true };
    }

    // Off-script: in guided mode, reject the action and let the player
    // try again. The guided exhibition is a scripted experience —
    // diverging would corrupt the checkpoint sequence.
    return { accepted: false, reason: 'off-script' };
  }

  /**
   * Skip the current commentary cue.
   */
  skipCommentary() {
    if (this._activeCommentary) {
      this._activeCommentary = null;
      this._processCommentaryQueue();
    }
  }

  /**
   * Skip directly to the explicit hint (H3).
   */
  skipHints() {
    const cp = this._scenario.checkpoints[this._checkpointIndex];
    if (cp && cp.hint && this._waitingForPlayer) {
      this._hintStage = HintStage.H3_EXPLICIT;
      this._emitHint(HintStage.H3_EXPLICIT, cp.hint.h3Text);
    }
  }

  /**
   * Set the guidance level (FULL, LIGHT, or NONE).
   * @param {string} level
   */
  setGuidanceLevel(level) {
    this._guidanceLevel = level;
  }

  /**
   * Replay the scenario from the beginning with the current guidance level.
   */
  replay() {
    this._replayCount++;
    // Reduce guidance on replay
    if (this._replayCount === 1) {
      this._guidanceLevel = GuidanceLevel.LIGHT;
    } else if (this._replayCount >= 2) {
      this._guidanceLevel = GuidanceLevel.NONE;
    }
    this.start();
  }

  /**
   * Get the current engine state for rendering.
   * @returns {object|null}
   */
  getState() {
    return this._state;
  }

  /**
   * Get the current legal action frame (for player decision points).
   * @returns {object|null}
   */
  getLegalActionFrame() {
    return this._legalActionFrame;
  }

  /**
   * Get the current checkpoint.
   * @returns {import('./guided-types.mjs').Checkpoint|null}
   */
  getCurrentCheckpoint() {
    return this._scenario.checkpoints[this._checkpointIndex] ?? null;
  }

  /**
   * Get the commentary history.
   * @returns {import('./guided-types.mjs').CommentaryCue[]}
   */
  getCommentaryHistory() {
    return [...this._commentaryHistory];
  }

  /**
   * Get the current status.
   * @returns {string}
   */
  getStatus() {
    return this._status;
  }

  /**
   * Get the current hint stage.
   * @returns {string}
   */
  getHintStage() {
    return this._hintStage;
  }

  /**
   * Get the current glow identities and level.
   * @returns {{ identities: string[], level: string }}
   */
  getGlow() {
    return { identities: [...this._glowIdentities], level: this._glowLevel };
  }

  /**
   * Get the replay count.
   * @returns {number}
   */
  getReplayCount() {
    return this._replayCount;
  }

  /**
   * Get the current guidance level.
   * @returns {string}
   */
  getGuidanceLevel() {
    return this._guidanceLevel;
  }

  /**
   * Whether the controller is waiting for a player decision.
   * @returns {boolean}
   */
  isWaitingForPlayer() {
    return this._waitingForPlayer;
  }

  /**
   * Get the pending scripted action that the player must match.
   * Returns null when not waiting for player input.
   * @returns {object|null}
   */
  getPendingScripted() {
    return this._waitingForPlayer ? this._pendingScripted : null;
  }

  // ── Save / Resume ────────────────────────────────────────

  /**
   * Serialize the controller state for persistence.
   * Returns a plain object that can be JSON.stringify'd.
   * @returns {object}
   */
  serialize() {
    return {
      status: this._status,
      guidanceLevel: this._guidanceLevel,
      checkpointIndex: this._checkpointIndex,
      scriptedActionIndex: this._scriptedActionIndex,
      commentaryQueue: structuredClone(this._commentaryQueue),
      commentaryHistory: structuredClone(this._commentaryHistory),
      hintStage: this._hintStage,
      glowIdentities: [...this._glowIdentities],
      glowLevel: this._glowLevel,
      waitingForPlayer: this._waitingForPlayer,
      commands: structuredClone(this._commands),
      events: structuredClone(this._events),
      elapsedMs: this._elapsedMs,
      replayCount: this._replayCount,
      // Engine state is serializable via structuredClone
      engineState: this._state ? structuredClone(this._state) : null,
    };
  }

  /**
   * Restore the controller state from a serialized snapshot.
   * @param {object} snapshot - The serialized state from serialize()
   * @param {import('./guided-types.mjs').GuidedScenario} scenario
   */
  deserialize(snapshot, scenario) {
    this._scenario = scenario;
    this._engine = new IntrilexEngine();
    this._state = snapshot.engineState ?? null;
    this._status = snapshot.status ?? GuidedStatus.UNLOADED;
    this._guidanceLevel = snapshot.guidanceLevel ?? GuidanceLevel.FULL;
    this._checkpointIndex = snapshot.checkpointIndex ?? 0;
    this._scriptedActionIndex = snapshot.scriptedActionIndex ?? 0;
    this._commentaryQueue = snapshot.commentaryQueue ?? [];
    this._commentaryHistory = snapshot.commentaryHistory ?? [];
    this._hintStage = snapshot.hintStage ?? HintStage.H0_SILENCE;
    this._glowIdentities = snapshot.glowIdentities ?? [];
    this._glowLevel = snapshot.glowLevel ?? GlowLevel.AMBIENT;
    this._waitingForPlayer = snapshot.waitingForPlayer ?? false;
    this._commands = snapshot.commands ?? [];
    this._events = snapshot.events ?? [];
    this._elapsedMs = snapshot.elapsedMs ?? 0;
    this._replayCount = snapshot.replayCount ?? 0;
    this._legalActionFrame = null;
    this._activeCommentary = null;
    this._checkpointStartTime = Date.now();
    this._emitStateChange();
  }

  // ── Internal processing ─────────────────────────────────

  /**
   * Process the current checkpoint: execute scripted actions,
   * show commentary, and advance.
   */
  _processCurrentCheckpoint() {
    const cp = this._scenario.checkpoints[this._checkpointIndex];
    if (!cp) {
      this._handleTerminal();
      return;
    }

    this._checkpointStartTime = Date.now();
    this._hintStage = HintStage.H0_SILENCE;
    this._scriptedActionIndex = 0;

    // Set glow from checkpoint definition
    if (cp.glowIdentities && this._guidanceLevel === GuidanceLevel.FULL) {
      this._glowIdentities = cp.glowIdentities;
      this._glowLevel = cp.glowLevel ?? GlowLevel.AMBIENT;
      this._emitGlow();
    } else {
      this._glowIdentities = [];
      this._glowLevel = GlowLevel.AMBIENT;
      this._emitGlow();
    }

    // Emit checkpoint event
    this._emitCheckpoint(cp);

    // Process scripted actions
    this._processNextScriptedAction();
  }

  /**
   * Process the next scripted action for the current checkpoint.
   * If it's an auto-execute action, execute it immediately.
   * If it's a player-decision action, wait for player input.
   */
  _processNextScriptedAction() {
    const cp = this._scenario.checkpoints[this._checkpointIndex];
    if (!cp) {
      this._handleTerminal();
      return;
    }

    const scripted = cp.scriptedActions?.[this._scriptedActionIndex];

    if (!scripted) {
      // No more scripted actions for this checkpoint
      this._advanceAfterScriptedActions();
      return;
    }

    if (scripted.autoExecute) {
      // Auto-execute (rival action or non-decision player action)
      this._executeScriptedAction(scripted);
    } else {
      // Player decision — wait for player input
      this._waitForPlayerDecision(scripted);
    }
  }

  /**
   * Execute a scripted action and advance to the next one.
   */
  _executeScriptedAction(scripted) {
    try {
      const result = executeScriptedAction(this._state, scripted, this._engine);
      if (result.command) this._commands.push(result.command);
      this._events.push(...result.events);
      this._state = result.state;

      if (result.error) {
        this._status = GuidedStatus.ERROR;
        this._emitError(`Scripted action failed: ${result.error}`);
        return;
      }
    } catch (err) {
      this._status = GuidedStatus.ERROR;
      this._emitError(`Action execution error: ${err.message}`);
      return;
    }

    this._emitStateChange();
    this._scriptedActionIndex++;
    this._processNextScriptedAction();
  }

  /**
   * Wait for the player to make a decision. Present the legal actions
   * and set up hint timers.
   *
   * If the scripted action is phase/enter-action, auto-execute it and
   * advance to the next scripted action — the player should never be
   * asked to "enter the action phase" as a decision.
   */
  _waitForPlayerDecision(scripted) {
    // Auto-execute phase/enter-action — it's a mechanical step, not a
    // meaningful player decision
    if (scripted.intent.family === 'phase' && scripted.intent.mode === 'enter-action') {
      this._waitingForPlayer = false;
      this._executeScriptedAction(scripted);
      return;
    }

    // Advance to the decision boundary
    const adv = advanceCoreToDecision(this._state, MAX_ORCHESTRATION);
    this._state = adv.state;
    this._events.push(...adv.events);

    if (adv.status === 'TERMINAL') {
      this._handleTerminal();
      return;
    }

    if (adv.status !== 'PLAYER_DECISION_REQUIRED' || !adv.legalActionFrame) {
      this._status = GuidedStatus.ERROR;
      this._emitError(`Expected player decision but got ${adv.status}`);
      return;
    }

    this._legalActionFrame = adv.legalActionFrame;
    this._waitingForPlayer = true;
    this._pendingScripted = scripted;
    this._checkpointStartTime = Date.now();
    this._hintStage = HintStage.H0_SILENCE;
    this._emitStateChange();
    if (this.onWaitingForPlayer) {
      // Find the matching legal action so the view can highlight it
      const matchingAction = matchIntent(scripted.intent, adv.legalActionFrame.actions, this._state);
      this.onWaitingForPlayer(adv.legalActionFrame, scripted, matchingAction);
    }
  }

  /**
   * After all scripted actions for a checkpoint are done, show commentary
   * and advance to the next checkpoint.
   *
   * The next checkpoint is processed in a deferred task (setTimeout 0) so
   * the browser can repaint between checkpoints. Without this, the entire
   * chain of auto-executed rival turns runs synchronously inside a single
   * setTimeout callback, which can leave the DOM stale or swallow
   * exceptions in deep recursion.
   */
  _advanceAfterScriptedActions() {
    const cp = this._scenario.checkpoints[this._checkpointIndex];

    // Show commentary
    if (cp?.commentary && this._guidanceLevel !== GuidanceLevel.NONE) {
      this._commentaryQueue = [...cp.commentary];
      this._processCommentaryQueue();
    }

    // Auto-advance through response windows and End phase if needed
    const nextCp = this._scenario.checkpoints[this._checkpointIndex + 1];
    const sameTurnNext = nextCp && nextCp.fullTurn === cp?.fullTurn;

    if (!sameTurnNext && cp?.scriptedActions?.length > 0) {
      this._autoAdvanceToEndOfTurn();
    }

    // Advance to the next checkpoint
    this._checkpointIndex++;
    if (this._checkpointIndex >= this._scenario.checkpoints.length) {
      this._handleTerminal();
      return;
    }

    // Check for terminal state
    if (this._state.winner !== null) {
      this._handleTerminal();
      return;
    }

    // Defer the next checkpoint so the browser can repaint between
    // auto-executed turns. This also flattens the recursion that would
    // otherwise build up through _processCurrentCheckpoint →
    // _processNextScriptedAction → _executeScriptedAction → ...
    setTimeout(() => {
      try {
        if (this._status === GuidedStatus.ERROR) return;
        this._processCurrentCheckpoint();
      } catch (err) {
        this._status = GuidedStatus.ERROR;
        this._emitError(`Checkpoint advance error: ${err.message}`);
      }
    }, 0);
  }

  /**
   * Auto-advance through response windows and End phase to reach
   * the next turn's Start phase.
   */
  _autoAdvanceToEndOfTurn() {
    let advState = this._state;
    for (let attempt = 0; attempt < MAX_ORCHESTRATION; attempt++) {
      const adv = advanceCoreToDecision(advState, MAX_ORCHESTRATION);
      advState = adv.state;
      this._events.push(...adv.events);
      if (adv.status === 'TERMINAL') break;
      if (adv.status !== 'PLAYER_DECISION_REQUIRED' || !adv.legalActionFrame) break;
      const frameActions = adv.legalActionFrame.actions;
      const isResponseWindow = frameActions.length > 0 && frameActions.every((a) =>
        a.timingClass === 'INSTANT' && (a.family === 'response-decline' || a.family === 'counter' || a.family === 'ultra')
      );
      if (!isResponseWindow) break;
      const declineAction = frameActions.find((a) => a.family === 'response-decline') ??
                            frameActions.find((a) => a.family === 'counter' && a.mode === 'decline');
      if (!declineAction) break;
      const declineResult = this._engine.execute(advState, declineAction.command);
      this._events.push(...declineResult.events);
      if (!declineResult.accepted) break;
      advState = declineResult.state;
    }
    this._state = advState;
    this._emitStateChange();
  }

  /**
   * Process the commentary queue. Show the next cue if available.
   */
  _processCommentaryQueue() {
    if (this._commentaryQueue.length === 0) {
      this._activeCommentary = null;
      return;
    }

    const cue = this._commentaryQueue.shift();

    // Skip light-guidance-only cues when not in FULL mode
    if (cue.lightGuidanceOnly && this._guidanceLevel !== GuidanceLevel.FULL) {
      this._processCommentaryQueue();
      return;
    }

    // Skip low-importance cues in LIGHT mode
    if (this._guidanceLevel === GuidanceLevel.LIGHT && (cue.importance ?? 3) < 4) {
      this._processCommentaryQueue();
      return;
    }

    this._activeCommentary = cue;
    if (cue.persistInHistory !== false) {
      this._commentaryHistory.push(cue);
    }
    this._emitCommentary(cue);
  }

  /**
   * Handle terminal state — emit terminal event and trigger debrief.
   */
  _handleTerminal() {
    this._status = GuidedStatus.TERMINAL;
    this._waitingForPlayer = false;
    this._clearHintStage();
    this._emitStateChange();
    if (this.onTerminal) {
      this.onTerminal(this._state);
    }
    if (this.onDebrief && this._scenario.debrief) {
      this.onDebrief(this._scenario.debrief);
    }
  }

  // ── Hint stage management ────────────────────────────────

  _clearHintStage() {
    this._hintStage = HintStage.H0_SILENCE;
  }

  // ── Emission helpers ────────────────────────────────────

  _emitStateChange() {
    if (this.onStateChange) {
      this.onStateChange(this._state);
    }
  }

  _emitCommentary(cue) {
    if (this.onCommentary) {
      this.onCommentary(cue);
    }
  }

  _emitHint(stage, text) {
    if (this.onHint) {
      this.onHint(stage, text);
    }
  }

  _emitGlow() {
    if (this.onGlow) {
      this.onGlow([...this._glowIdentities], this._glowLevel);
    }
  }

  _emitCheckpoint(cp) {
    if (this.onCheckpoint) {
      this.onCheckpoint(cp);
    }
  }

  _emitError(message) {
    if (this.onError) {
      this.onError(message);
    }
  }
}
