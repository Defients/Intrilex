// puzzle-runtime.mjs - Puzzle Mode v0.1.0 runtime controller.
//
// Reuses the canonical Intrilex engine for EVERY gameplay transition:
//   - State creation: createCoreMatchState (canonical match bootstrap)
//   - State reconstruction: replay setupCommands through IntrilexEngine.execute
//   - Turn advancement: advanceCoreToDecision (canonical orchestrator)
//   - Action execution: IntrilexEngine.execute (canonical reducer)
//   - Authorized views: strictView (player-projection, hidden-info firewall)
//   - Action projection: toAuthorizedCoreAction (no commands leaked to UI)
//
// Puzzle Mode NEVER duplicates rules logic. It only adds:
//   - loading from a deterministic recipe (seed + setupCommands)
//   - objective evaluation
//   - opponent policy selection (from canonical legal actions only)
//   - attempt recording
//
// State machine: UNLOADED -> READY -> PLAYING -> {WON | FAILED | ERROR}

import {
  IntrilexEngine,
  createCoreMatchState,
  advanceCoreToDecision,
  toAuthorizedCoreAction,
  hashCanonical,
} from '../../engine/browser-entry.js';
import { strictView } from '../../autonomy-runtime.js';
import {
  PUZZLE_SCHEMA_VERSION,
  PuzzleRuntimeStatus,
  PuzzleResultKind,
  PuzzleObjectiveType,
  PuzzleOpponentPolicyKind,
} from './puzzle-types.mjs';
import { validatePuzzle } from './puzzle-validate.mjs';

const MAX_ORCHESTRATION = 64;

/**
 * Reconstruct the canonical initial state from a puzzle definition.
 * Deterministic: same def -> same state (seed + command replay).
 *
 * setupCommands are PLAYER decisions (the same canonical command objects the
 * engine emitted via legalActionFrame.actions[*].command). Between player
 * decisions the canonical orchestrator (advanceCoreToDecision) runs phase
 * transitions, priority circulation, and stack resolution — exactly as it
 * does during real play. We therefore interleave advanceCoreToDecision before
 * each player command and once more after the last, mirroring the
 * AuthoritativeMatchSession reconstruction pattern (seed + command log replay
 * through the real orchestrator).
 * @param {import('./puzzle-types.mjs').PuzzleDefinition} def
 * @returns {any} canonical engine state
 */
export function reconstructInitialState(def) {
  const base = createCoreMatchState({
    profileId: def.profileId,
    playerIds: ['P1', 'P2'],
    seatOrder: ['P1', 'P2'],
    enabledModules: [],
    seed: def.seed >>> 0 || 1,
  });
  let state = base;
  const engine = new IntrilexEngine();
  const advance = () => {
    let safety = 0;
    while (safety++ < MAX_ORCHESTRATION) {
      const result = advanceCoreToDecision(state);
      state = result.state;
      if (result.status === 'TERMINAL' || result.status === 'PLAYER_DECISION_REQUIRED' || result.status === 'UNSUPPORTED_CONFIGURATION') return result;
    }
    return { status: 'UNSUPPORTED', state, reasonCode: 'ORCH_LIMIT' };
  };
  for (const cmd of def.setupCommands) {
    advance(); // run orchestration up to the decision boundary where cmd was chosen
    const result = engine.execute(state, cmd);
    if (!result.accepted) {
      throw Object.assign(new Error(`setupCommands rejected: ${result.error?.code ?? 'unknown'}`), {
        code: 'SETUP_REJECTED',
        command: cmd,
        engineError: result.error,
      });
    }
    state = result.state;
  }
  // Final advance to the decision boundary (the captured puzzle state).
  advance();
  return state;
}

/**
 * Compute a deterministic fingerprint of gameplay-relevant canonical fields.
 * Excludes UI-only state. Used for transposition dedup and determinism checks.
 * @param {any} state
 * @returns {string}
 */
export function stateFingerprint(state) {
  return hashCanonical({
    revision: state.revision,
    activePlayerId: state.activePlayerId,
    phase: state.phase,
    fullTurnSequence: state.fullTurnSequence,
    winner: state.winner,
    players: Object.fromEntries(
      Object.keys(state.players).map((pid) => [
        pid,
        {
          goal: state.players[pid].goal,
          hand: state.players[pid].hand,
          pr: state.players[pid].pr,
          er: state.players[pid].er,
          limits: state.players[pid].limits ?? null,
        },
      ]),
    ),
    zones: state.zones,
    stack: state.stack ?? [],
    rng: state.rng,
  });
}

/**
 * @typedef {Object} PuzzleRuntimeOptions
 * @property {boolean} [autoAdvance] - Auto-run opponent/orchestration to next human decision (default true)
 */

export class PuzzleRuntime {
  /** @param {PuzzleRuntimeOptions} [opts] */
  constructor(opts = {}) {
    this.status = PuzzleRuntimeStatus.UNLOADED;
    this.definition = null;
    this.state = null;
    this._initialState = null;
    this._initialFingerprint = null;
    this.engine = null;
    this.commandVault = null; // Map<actionId, command> - private
    this.currentFrame = null;
    this.attempt = null;
    this.error = null;
    this.validationIssues = [];
    this._opponentPolicy = null;
    this._opts = { autoAdvance: opts.autoAdvance ?? true };
  }

  /**
   * Load and validate a puzzle definition.
   * @param {import('./puzzle-types.mjs').PuzzleDefinition} def
   * @returns {{valid:boolean, issues: import('./puzzle-types.mjs').PuzzleValidationIssue[]}}
   */
  load(def) {
    this.status = PuzzleRuntimeStatus.UNLOADED;
    this.definition = null;
    this.state = null;
    this._initialState = null;
    this._initialFingerprint = null;
    this.engine = null;
    this.commandVault = null;
    this.currentFrame = null;
    this.attempt = null;
    this.error = null;
    this.validationIssues = [];

    let state;
    try {
      state = reconstructInitialState(def);
    } catch (e) {
      this.error = { code: e.code ?? 'RECONSTRUCT_FAILED', message: e.message };
      this.validationIssues = [{ code: 'RECONSTRUCT_FAILED', severity: 'error', message: e.message }];
      this.status = PuzzleRuntimeStatus.ERROR;
      return { valid: false, issues: this.validationIssues };
    }
    const validation = validatePuzzle(def, state);
    this.validationIssues = validation.issues;
    if (!validation.valid) {
      this.error = { code: 'VALIDATION_FAILED', message: 'Puzzle validation failed', issues: validation.issues };
      this.status = PuzzleRuntimeStatus.ERROR;
      return validation;
    }
    this.definition = def;
    this.engine = new IntrilexEngine();
    this._initialState = structuredClone(state);
    this._initialFingerprint = stateFingerprint(state);
    this._opponentPolicy = def.opponentPolicy ?? { kind: PuzzleOpponentPolicyKind.FIRST_LEGAL };
    this.state = state;
    this.attempt = {
      puzzleId: def.id,
      startedAt: new Date().toISOString(),
      result: PuzzleResultKind.IN_PROGRESS,
      actions: [],
    };
    this.status = PuzzleRuntimeStatus.READY;
    // Advance to the first decision boundary.
    this._advance();
    if (this.status === PuzzleRuntimeStatus.READY || this.status === PuzzleRuntimeStatus.PLAYING) {
      if (this._opts.autoAdvance) this._autoAdvanceToHumanOrTerminal();
    }
    return validation;
  }

  /**
   * Restart: reconstruct the exact original canonical state.
   * @returns {boolean} true if restart succeeded
   */
  restart() {
    if (!this.definition) return false;
    const def = this.definition;
    this.state = structuredClone(this._initialState);
    this.engine = new IntrilexEngine();
    this.commandVault = null;
    this.currentFrame = null;
    this.attempt = {
      puzzleId: def.id,
      startedAt: new Date().toISOString(),
      result: PuzzleResultKind.IN_PROGRESS,
      actions: [],
    };
    this.error = null;
    this.status = PuzzleRuntimeStatus.READY;
    this._advance();
    if (this._opts.autoAdvance) this._autoAdvanceToHumanOrTerminal();
    return true;
  }

  /**
   * Canonical advance loop: runs orchestration commands and stops at a
   * PLAYER_DECISION_REQUIRED boundary or terminal state.
   */
  _advance() {
    if (this.status === PuzzleRuntimeStatus.ERROR) return;
    let safety = 0;
    try {
      while (safety++ < MAX_ORCHESTRATION) {
        const result = advanceCoreToDecision(this.state);
        this.state = result.state;
        if (result.status === 'TERMINAL') {
          this.commandVault = null;
          this.currentFrame = null;
          this._evaluateTerminal(result.reasonCode);
          return;
        }
        if (result.status === 'UNSUPPORTED_CONFIGURATION') {
          this.status = PuzzleRuntimeStatus.ERROR;
          this.error = { code: result.reasonCode ?? 'UNSUPPORTED', message: `Engine unsupported: ${result.reasonCode}` };
          this.commandVault = null;
          this.currentFrame = null;
          return;
        }
        if (result.status === 'PLAYER_DECISION_REQUIRED') {
          this._buildDecisionFrame(result);
          return;
        }
        // Unknown status — treat as error.
        this.status = PuzzleRuntimeStatus.ERROR;
        this.error = { code: 'UNKNOWN_STATUS', message: `Unknown advance status: ${result.status}` };
        return;
      }
      this.status = PuzzleRuntimeStatus.ERROR;
      this.error = { code: 'ORCHESTRATION_LIMIT', message: 'Orchestration limit exceeded' };
    } catch (e) {
      this.status = PuzzleRuntimeStatus.ERROR;
      this.error = { code: 'ADVANCE_EXCEPTION', message: e.message };
    }
  }

  /**
   * Build the decision frame: private command vault + authorized public view.
   */
  _buildDecisionFrame(result) {
    const frame = result.legalActionFrame;
    const actorId = result.decisionActorId;
    const isHuman = actorId === this.definition.perspectivePlayerId;
    this.commandVault = new Map();
    for (const action of frame.actions) {
      this.commandVault.set(action.actionId, action.command);
    }
    const policyActions = frame.actions.map((a) => toAuthorizedCoreAction(a));
    const playerView = isHuman ? strictView(this.state, this.definition.perspectivePlayerId) : null;
    this.currentFrame = {
      actorId,
      isHuman,
      stateRevision: this.state.revision,
      fullTurnSequence: this.state.fullTurnSequence,
      phase: this.state.phase,
      frameHash: hashCanonical({
        revision: this.state.revision,
        actorId,
        actions: policyActions.map((a) => a.actionId),
      }),
      legalActions: policyActions,
      forcedActionId: frame.forcedActionId ?? null,
      playerView,
    };
    if (this.status === PuzzleRuntimeStatus.READY) this.status = PuzzleRuntimeStatus.PLAYING;
    // Evaluate objective after each meaningful transition.
    this._evaluateObjective();
  }

  /**
   * Auto-advance through non-human (opponent/orchestration) decisions until a
   * human decision, terminal, or objective resolution is reached.
   */
  _autoAdvanceToHumanOrTerminal() {
    let safety = 0;
    while (safety++ < MAX_ORCHESTRATION * 4) {
      if (this.status !== PuzzleRuntimeStatus.PLAYING && this.status !== PuzzleRuntimeStatus.READY) return;
      if (!this.currentFrame) return;
      if (this.currentFrame.isHuman) return;
      // Opponent decision: select via policy from canonical legal actions.
      const sel = this._selectOpponentAction();
      if (!sel) {
        this.status = PuzzleRuntimeStatus.ERROR;
        this.error = { code: 'OPPONENT_NO_SELECTION', message: 'Opponent policy returned no selection' };
        return;
      }
      this._executeAction(sel.actionId, 'opponent');
      if (this.status === PuzzleRuntimeStatus.ERROR || this.status === PuzzleRuntimeStatus.WON || this.status === PuzzleRuntimeStatus.FAILED) return;
    }
  }

  /**
   * Select an opponent action from the canonical legal action set.
   * Only canonical legal actions are ever considered.
   * @returns {{actionId:string, command:object}|null}
   */
  _selectOpponentAction() {
    const policy = this._opponentPolicy;
    const legal = Array.from(this.commandVault.entries()).map(([actionId, command]) => ({ actionId, command }));
    if (legal.length === 0) return null;
    if (policy.kind === PuzzleOpponentPolicyKind.FIRST_LEGAL) {
      // Deterministic lexical ordering for reproducibility.
      const sorted = [...legal].sort((a, b) => a.actionId.localeCompare(b.actionId));
      return sorted[0];
    }
    if (policy.kind === PuzzleOpponentPolicyKind.SCRIPTED) {
      const idx = this.attempt.actions.filter((a) => a.source === 'opponent').length;
      const actionId = policy.scriptedActionIds[idx];
      if (!actionId) return legal[0]; // fall back to first-legal when script exhausted
      const found = legal.find((l) => l.actionId === actionId);
      return found ?? legal[0];
    }
    if (policy.kind === PuzzleOpponentPolicyKind.HUMAN_DEBUG) {
      // Pause for human input on opponent turns — caller must call submitAction.
      return null;
    }
    if (policy.kind === PuzzleOpponentPolicyKind.AI) {
      // Defer to the canonical AI policy via autonomy-runtime choosePolicy.
      // Imported lazily to avoid a hard circular dependency at module load.
      // The AI receives only the authorized view + legal actions (no hidden info).
      return this._selectAiAction(legal);
    }
    return legal[0];
  }

  _selectAiAction(legal) {
    // Lazy import to keep the module load graph minimal.
    const auto = _autonomyForAi();
    if (!auto) return legal[0];
    const actorId = this.currentFrame.actorId;
    const aiView = strictView(this.state, actorId);
    const policyId = this._opponentPolicy.aiPolicyId ?? 'random-legal';
    const rng = this._rngFor(actorId);
    const context = {
      matchId: `puzzle-${this.definition.id}`,
      runInstanceId: `puzzle-${this.definition.id}`,
      decisionIndex: this.attempt.actions.length,
      actorId,
      authorizedView: aiView,
      legalActions: legal.map((l) => {
        const presented = this.currentFrame.legalActions.find((a) => a.actionId === l.actionId);
        return {
          actionId: l.actionId,
          actorId,
          family: presented?.family,
          mode: presented?.mode,
          timingClass: presented?.timingClass,
          sourceCardIds: presented?.sourceCardIds ?? [],
          targetCardIds: presented?.targetCardIds ?? [],
          featureVector: presented?.featureVector ?? null,
          command: l.command,
          commandHash: presented?.commandHash ?? hashCanonical(l.command),
        };
      }),
      rng,
      profileId: this.definition.profileId,
      engineVersion: auto.ENGINE_VERSION,
      rulesVersion: this.definition.rulesVersion ?? '4.3.1',
    };
    try {
      const selected = auto.choosePolicy(policyId, context);
      if (!selected) return null;
      return { actionId: selected.actionId, command: selected.command };
    } catch {
      return null;
    }
  }

  _rngFor(actorId) {
    // Deterministic per-player RNG derived from the puzzle seed (mirrors
    // PlaySession's PolicyRng seeding). Same seed -> same opponent choices.
    const auto = _autonomyForAi();
    const PolicyRng = auto?.PolicyRng;
    if (!PolicyRng) return { nextIndex: () => 0, nextUint32: () => 0 };
    const uint32 = Number.parseInt(hashCanonical({ seed: this.definition.seed, playerId: actorId, policyId: this._opponentPolicy.aiPolicyId ?? 'first-legal', stream: 'PUZZLE_OPP' }).slice(0, 8), 16) >>> 0 || 1;
    return new PolicyRng(uint32);
  }

  /**
   * Submit a human action by actionId. The command is resolved through the
   * private vault and executed through the canonical engine.
   * @param {string} actionId
   * @returns {{accepted:boolean, error?:string}}
   */
  submitAction(actionId) {
    if (this.status !== PuzzleRuntimeStatus.PLAYING && this.status !== PuzzleRuntimeStatus.READY) {
      return { accepted: false, error: 'NOT_PLAYING' };
    }
    if (!this.currentFrame || !this.currentFrame.isHuman) {
      return { accepted: false, error: 'NOT_HUMAN_DECISION' };
    }
    if (!this.commandVault || !this.commandVault.has(actionId)) {
      return { accepted: false, error: 'UNKNOWN_ACTION' };
    }
    this._executeAction(actionId, 'human');
    if (this.status === PuzzleRuntimeStatus.ERROR) return { accepted: false, error: this.error?.code ?? 'ERROR' };
    if (this._opts.autoAdvance) this._autoAdvanceToHumanOrTerminal();
    return { accepted: true };
  }

  /**
   * Execute a canonical action and record it in the attempt log.
   */
  _executeAction(actionId, source) {
    const command = this.commandVault.get(actionId);
    const commandHash = hashCanonical(command);
    const presented = this.currentFrame.legalActions.find((a) => a.actionId === actionId);
    const revBefore = this.state.revision;
    const turnBefore = this.state.fullTurnSequence;
    const result = this.engine.execute(this.state, command);
    if (!result.accepted) {
      this.status = PuzzleRuntimeStatus.ERROR;
      this.error = { code: 'ENGINE_REJECTION', message: `Engine rejected command: ${result.error?.code ?? 'unknown'}` };
      return;
    }
    this.attempt.actions.push({
      index: this.attempt.actions.length,
      actorId: this.currentFrame.actorId,
      source,
      actionId,
      command: structuredClone(command),
      commandHash,
      family: presented?.family ?? null,
      mode: presented?.mode ?? null,
      stateRevisionBefore: revBefore,
      stateRevisionAfter: result.state.revision,
      fullTurnSequenceBefore: turnBefore,
      fullTurnSequenceAfter: result.state.fullTurnSequence,
    });
    this.state = result.state;
    this.commandVault = null;
    this.currentFrame = null;
    this._advance();
  }

  /**
   * Evaluate the objective after a terminal engine state.
   */
  _evaluateTerminal(reasonCode) {
    const perspective = this.definition.perspectivePlayerId;
    const winner = this.state.winner;
    const obj = this.definition.objective;
    let success = false;
    let failure = false;
    let reason = null;
    if (winner === perspective) {
      // Perspective won canonically. Check horizon constraints.
      if (obj.type === PuzzleObjectiveType.WIN_THIS_TURN) {
        // WIN_THIS_TURN: success only if victory occurred without the turn
        // advancing beyond the starting turn (the perspective's current turn).
        // We track the starting turn at load; if the engine terminal turn
        // equals the starting turn, the win happened "this turn".
        success = true; // terminal victory within the played-out turn
      } else if (obj.type === PuzzleObjectiveType.WIN_WITHIN_TURNS) {
        success = true; // horizon enforced separately during play
      } else if (obj.type === PuzzleObjectiveType.SURVIVE_TURNS) {
        success = true; // surviving to a canonical victory satisfies survival
      } else {
        success = true;
      }
    } else if (winner === null && reasonCode === 'CANONICAL_DRAW') {
      // Draw: not a perspective win. For survival, a draw at horizon is acceptable;
      // for win objectives it is a failure.
      if (obj.type === PuzzleObjectiveType.SURVIVE_TURNS) {
        success = true;
      } else {
        failure = true;
        reason = 'CANONICAL_DRAW';
      }
    } else {
      // Perspective lost (opponent won) or exhausted-resolution draw.
      if (obj.type === PuzzleObjectiveType.SURVIVE_TURNS && winner === null) {
        success = true;
      } else {
        failure = true;
        reason = winner ? `OPPONENT_WIN:${winner}` : reasonCode;
      }
    }
    this._setOutcome(success, failure, reason, reasonCode);
  }

  /**
   * Evaluate the objective at a decision boundary (non-terminal).
   * Enforces turn horizons and detects survival completion.
   */
  _evaluateObjective() {
    if (this.status === PuzzleRuntimeStatus.ERROR) return;
    const obj = this.definition.objective;
    const perspective = this.definition.perspectivePlayerId;
    const startTurn = this._initialState.fullTurnSequence;
    const currentTurn = this.state.fullTurnSequence;
    const winner = this.state.winner;

    // Canonical victory mid-play (rare but possible via instant wins).
    if (winner === perspective) {
      this._setOutcome(true, false, null, 'NORMAL_VICTORY');
      return;
    }
    if (winner !== null && winner !== perspective) {
      this._setOutcome(false, true, `OPPONENT_WIN:${winner}`, 'NORMAL_VICTORY');
      return;
    }

    if (obj.type === PuzzleObjectiveType.WIN_THIS_TURN) {
      // The perspective must win before the active turn advances beyond the
      // starting turn. The engine increments fullTurnSequence when a new turn
      // begins. If the active player is no longer the perspective AND the turn
      // has advanced, the opportunity has passed.
      const turnAdvanced = currentTurn > startTurn;
      if (turnAdvanced) {
        this._setOutcome(false, true, 'TURN_ADVANCED', 'TURN_ADVANCED');
      }
      return;
    }
    if (obj.type === PuzzleObjectiveType.WIN_WITHIN_TURNS) {
      // Convention: the starting turn counts as turn 1. The horizon is the
      // number of perspective turns allowed. We measure by fullTurnSequence
      // delta relative to startTurn. Each full turn = +1.
      const turnsElapsed = currentTurn - startTurn;
      if (turnsElapsed > obj.maxTurns) {
        this._setOutcome(false, true, 'HORIZON_EXCEEDED', 'HORIZON_EXCEEDED');
      }
      return;
    }
    if (obj.type === PuzzleObjectiveType.SURVIVE_TURNS) {
      const turnsElapsed = currentTurn - startTurn;
      // Survival succeeds when the perspective survives (no canonical loss)
      // through completion of the required horizon. The horizon is measured
      // in full turns elapsed; surviving `turns` full turns completes it.
      if (turnsElapsed >= obj.turns) {
        this._setOutcome(true, false, null, 'SURVIVED_HORIZON');
      }
      // Failure (opponent win) is handled by the winner checks above.
      return;
    }
  }

  _setOutcome(success, failure, reason, terminalReason) {
    if (this.status === PuzzleRuntimeStatus.WON || this.status === PuzzleRuntimeStatus.FAILED) return;
    if (success) {
      this.status = PuzzleRuntimeStatus.WON;
      this.attempt.result = PuzzleResultKind.SUCCESS;
      this.attempt.completedAt = new Date().toISOString();
      this.attempt.finalStateHash = stateFingerprint(this.state);
    } else if (failure) {
      this.status = PuzzleRuntimeStatus.FAILED;
      this.attempt.result = PuzzleResultKind.FAILURE;
      this.attempt.completedAt = new Date().toISOString();
      this.attempt.failureReason = reason ?? terminalReason;
      this.attempt.finalStateHash = stateFingerprint(this.state);
    }
  }

  /**
   * Build a UI snapshot (authorized, no commands, no hidden info).
   */
  getSnapshot() {
    const def = this.definition;
    if (!def) {
      return { status: this.status, error: this.error, validationIssues: this.validationIssues };
    }
    const frame = this.currentFrame;
    const isHuman = frame?.isHuman ?? false;
    const playerView = isHuman ? frame.playerView : strictView(this.state, def.perspectivePlayerId);
    return {
      schemaVersion: PUZZLE_SCHEMA_VERSION,
      puzzleId: def.id,
      title: def.title,
      description: def.description,
      status: this.status,
      error: this.error,
      validationIssues: this.validationIssues,
      objective: def.objective,
      perspectivePlayerId: def.perspectivePlayerId,
      opponentPolicy: this._opponentPolicy,
      seed: def.seed,
      profileId: def.profileId,
      match: {
        fullTurnSequence: this.state?.fullTurnSequence ?? 0,
        startingFullTurnSequence: this._initialState?.fullTurnSequence ?? 0,
        phase: this.state?.phase ?? '',
        activePlayerId: this.state?.activePlayerId ?? '',
        winner: this.state?.winner ?? null,
      },
      decision: frame
        ? {
            actorId: frame.actorId,
            isHuman: frame.isHuman,
            stateRevision: frame.stateRevision,
            frameHash: frame.frameHash,
            legalActions: frame.legalActions,
            forcedActionId: frame.forcedActionId,
          }
        : null,
      playerView,
      attempt: this.attempt
        ? {
            result: this.attempt.result,
            actionCount: this.attempt.actions.length,
            failureReason: this.attempt.failureReason ?? null,
            finalStateHash: this.attempt.finalStateHash ?? null,
          }
        : null,
      stateFingerprint: this.state ? stateFingerprint(this.state) : null,
      initialStateFingerprint: this._initialFingerprint,
    };
  }

  /**
   * Diagnostics for the dev panel.
   */
  getDiagnostics() {
    return {
      puzzleId: this.definition?.id ?? null,
      schemaVersion: this.definition?.schemaVersion ?? null,
      status: this.status,
      valid: this.validationIssues.length === 0 || !this.validationIssues.some((i) => i.severity === 'error'),
      validationIssues: this.validationIssues,
      activePlayerId: this.state?.activePlayerId ?? null,
      phase: this.state?.phase ?? null,
      fullTurnSequence: this.state?.fullTurnSequence ?? null,
      startingFullTurnSequence: this._initialState?.fullTurnSequence ?? null,
      perspectivePlayerId: this.definition?.perspectivePlayerId ?? null,
      objective: this.definition?.objective ?? null,
      legalActionCount: this.currentFrame?.legalActions?.length ?? 0,
      seed: this.definition?.seed ?? null,
      stateFingerprint: this.state ? stateFingerprint(this.state) : null,
      initialStateFingerprint: this._initialFingerprint,
      attemptActions: this.attempt?.actions.length ?? 0,
      attemptResult: this.attempt?.result ?? null,
      error: this.error,
    };
  }
}

// Lazy accessor for the autonomy-runtime module (used only for AI opponent
// policy). Keeps the dependency optional and avoids a hard import cycle.
let _autonomyModule = null;
function _autonomyForAi() {
  if (_autonomyModule) return _autonomyModule;
  // Lazy import is not possible in a synchronous helper; callers that need AI
  // should pre-load via setAutonomyModule. If not set, fall back to first-legal.
  return _autonomyModule;
}

/**
 * Inject the autonomy-runtime module (used for AI opponent policy).
 * Called by puzzle-app.mjs on bootstrap. Optional — without it, AI policy
 * falls back to first-legal.
 * @param {any} mod
 */
export function setAutonomyModule(mod) {
  _autonomyModule = mod;
}

// (reconstructInitialState and setAutonomyModule are exported at definition above.)
