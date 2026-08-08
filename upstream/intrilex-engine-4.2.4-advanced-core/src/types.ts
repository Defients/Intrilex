export type PlayerId = string;
export type CardId = string;
export type StackItemId = string;
export type CommandId = string;
export type EventId = string;

export type Phase = "Setup" | "Start" | "Action" | "End" | "BetweenTurns";
export type ZoneName = "DP" | "GY" | "EXILE" | "SWAP_BAR" | "STAGING" | "ON_STACK" | "VOID" | `${PlayerId}_HAND` | `${PlayerId}_PR` | `${PlayerId}_ER`;
export type Visibility = "public" | "private" | "authorized";

export interface StartEventRef {
  playerId: PlayerId;
  startSequence: number;
}

export interface AegisState {
  sourceRef: string;
  expiresAt: StartEventRef;
}

export type TapState =
  | { kind: "nine-score"; sourceRef: string }
  | { kind: "start-phase"; sourceRef: string; expiresAt: StartEventRef }
  | { kind: "explicit-event"; sourceRef: string; eventKey: string }
  | { kind: "manual-only"; sourceRef: string };

export interface CardState {
  tapped?: boolean;
  tapState?: TapState;
  /** Boolean is retained only for Phase 2-4 fixture compatibility. New engine writes use AegisState. */
  aegis?: boolean | AegisState;
  lockedBy?: StackItemId;
  revealedUntil?: StartEventRef;
  playedForEffect?: boolean;
  exileBound?: boolean;
  pointValue?: number;
  [key: string]: unknown;
}

export interface CardInstance {
  id: CardId;
  identity: string;
  originalOwnerId: PlayerId;
  controllerId: PlayerId;
  zone: ZoneName;
  state: CardState;
}

export interface PlayerLimits {
  miniTurnsUsed: number;
  miniTurnsRemaining: number;
  swapBarUsedThisFT: boolean;
  rank10PlayedThisFT: boolean;
  ultraPlayedThisFT: boolean;
  pendingFullTurnSkips: number;
  pendingActionPhaseSkips: number;
}

export interface PlayerState {
  id: PlayerId;
  teamId?: string | null;
  goal: number;
  hand: CardId[];
  pr: CardId[];
  er: CardId[];
  limits: PlayerLimits;
}

export interface GlobalZones {
  dp: CardId[];
  gy: CardId[];
  exile: CardId[];
  swapBar: CardId[];
  staging: CardId[];
}

export type RevalidationClass =
  | "none"
  | "single-required-target"
  | "independent-targets"
  | "all-or-nothing"
  | "structural";

export type Requirement =
  | { kind: "other-hand-cards"; playerId: PlayerId; minimum: number; excludingSourceIds: CardId[] }
  | { kind: "card-in-zone"; cardId: CardId; zone: ZoneName }
  | { kind: "target-unprotected"; cardId: CardId }
  | { kind: "hand-cost-available"; playerId: PlayerId; cardIds: CardId[] }
  | { kind: "stack-item-exists"; stackItemId: StackItemId };

export type Instruction =
  | { op: "discard"; playerId: PlayerId; cardIds: CardId[]; requiredMinimum: number }
  | { op: "draw-keep-return"; playerId: PlayerId; drawCount: number; keepIds: CardId[]; returnIds: CardId[] }
  | { op: "change-goal"; playerId: PlayerId; delta: number }
  | { op: "take-card"; cardId: CardId; playerId: PlayerId; revealUntilStart?: boolean }
  | { op: "move-card"; cardId: CardId; zone: ZoneName; controllerId?: PlayerId }
  | { op: "remove-target"; cardId: CardId; destination: ZoneName }
  | { op: "enqueue-trigger"; trigger: TriggerEvent }
  | { op: "set-marker"; cardId: CardId; key: string; value: unknown }
  | { op: "rebind-stack-item"; stackItemId: StackItemId; controllerId: PlayerId; replacementInstructions?: Instruction[]; replacementTargetIds?: CardId[] }
  | { op: "record"; label: string; data?: unknown };

export interface PlayDefinition {
  kind: string;
  controllerId: PlayerId;
  sourceCardIds: CardId[];
  targetCardIds: CardId[];
  requirements: Requirement[];
  revalidationClass: RevalidationClass;
  instructions: Instruction[];
  sourceDestination?: ZoneName;
  tags?: string[];
}


export type FirstContactMiniTurnActionType = "draw" | "play-for-points" | "play-for-effect" | "scuttle" | "pass";
export type FirstContactStackClass = "draw" | "points" | "ordinary-effect" | "private-choice-effect" | "anchor" | "goal-mod" | "scuttle" | "pass" | "counter" | "disrupt" | "trigger";

export type FirstContactPrimaryAction =
  | { kind: "autonomy-draw" }
  | { kind: "autonomy-score"; cardId: CardId }
  | { kind: "autonomy-scuttle"; sourceCardId: CardId; targetCardId: CardId }
  | { kind: "autonomy-four-clear"; sourceCardId: CardId; targetPlayerId: PlayerId; row: "pr" | "er" }
  | { kind: "autonomy-nine-tap"; sourceCardId: CardId; targetCardId: CardId }
  | { kind: "autonomy-nine-goal-shift"; sourceCardId: CardId; targetPlayerId: PlayerId; delta: 3 | 5; discardCardId?: CardId }
  | { kind: "autonomy-jack-pr-attachment"; sourceCardId: CardId; targetCardId: CardId }
  | { kind: "autonomy-queen-anchor"; sourceCardId: CardId }
  | { kind: "autonomy-king-anchor"; sourceCardId: CardId }
  | { kind: "autonomy-red-joker"; sourceCardId: CardId; mode: "hand-swap" | "self-reset" | "opponent-attack" | "shuffle-reset"; targetPlayerId?: PlayerId }
  | { kind: "autonomy-black-joker-board-lock"; sourceCardId: CardId }
  | { kind: "autonomy-three-hand-raid"; sourceCardId: CardId; targetPlayerId: PlayerId; mode: "present-take" | "force-discard" }
  | { kind: "autonomy-three-bounce"; sourceCardId: CardId; targetCardId: CardId; destination: "top" | "bottom" }
  | { kind: "autonomy-five-recycle"; sourceCardId: CardId }
  | { kind: "autonomy-six-dig"; sourceCardId: CardId }
  | { kind: "autonomy-seven-topdeck"; sourceCardId: CardId }
  | { kind: "autonomy-nine-anchor"; sourceCardId: CardId; targetPlayerId: PlayerId }
  | { kind: "autonomy-pass" };

export type FirstContactStackPayload =
  | { kind: "primary"; action: FirstContactPrimaryAction; actionType: FirstContactMiniTurnActionType; stackClass: FirstContactStackClass }
  | { kind: "ace-counter"; targetStackItemId: StackItemId }
  | { kind: "eight-scuttle-counter"; targetStackItemId: StackItemId }
  | { kind: "king-counter"; targetStackItemId: StackItemId }
  | { kind: "jack-disrupt"; targetStackItemId: StackItemId; disruptedActionType: FirstContactMiniTurnActionType }
  | { kind: "seven-scoring-trigger"; sourceCardId: CardId };

export type FirstContactPrivateChoiceKind =
  | "rank3-present"
  | "rank3-take"
  | "rank3-discard"
  | "rank5-rummage"
  | "rank6-dig"
  | "rank7-assign"
  | "rank7-generated-effect"
  | "rank7-scoring-trigger"
  | "nine-anchor-discard";

export interface FirstContactPrivateChoiceState {
  schemaVersion: 1;
  choiceId: string;
  token: string;
  kind: FirstContactPrivateChoiceKind;
  chooserId: PlayerId;
  controllerId: PlayerId;
  sourceCardId: CardId;
  createdRevision: number;
  optionCardIds: CardId[];
  optionsHash: string;
  minSelections: number;
  maxSelections: number;
  stage: number;
  context: Record<string, unknown>;
}

export type FirstContactPrivateChoiceSubmission =
  | { kind: "rank3-present"; selectedCardIds: CardId[] }
  | { kind: "rank3-take"; selectedCardIds: CardId[] }
  | { kind: "rank3-discard"; selectedCardIds: CardId[] }
  | { kind: "rank5-rummage"; selectedCardIds: CardId[] }
  | { kind: "rank6-dig"; mode: "keep-return-top" | "keep-return-bottom" | "keep-all-discard"; selectedCardIds: CardId[] }
  | { kind: "rank7-assign"; mode: "hand-only" | "effect-only" | "hand-and-effect"; selectedCardIds: CardId[] }
  | { kind: "rank7-generated-effect"; selectedCardIds: CardId[]; generatedAction?: FirstContactPrimaryAction }
  | { kind: "rank7-scoring-trigger"; selectedCardIds: CardId[] }
  | { kind: "nine-anchor-discard"; selectedCardIds: CardId[] };

export interface StackItem {
  id: StackItemId;
  controllerId: PlayerId;
  sourceCardIds: CardId[];
  targetCardIds: CardId[];
  kind: string;
  revalidationClass: RevalidationClass;
  instructions: Instruction[];
  sourceDestination: ZoneName;
  status: "pending" | "resolving" | "countered" | "resolved" | "fizzled";
  parentStackItemId?: StackItemId;
  counterTargetId?: StackItemId;
  firstContactAuthority?: FirstContactStackPayload;
  coreAuthority?: CoreStackPayload;
}

export interface PendingDeclaration {
  commandId: CommandId;
  beforeImageHash: string;
  play: PlayDefinition;
  stagedSourceIds: CardId[];
  stagedCostIds: CardId[];
}

export interface TriggerEvent {
  id: string;
  controllerId: PlayerId;
  sourceCardId?: CardId;
  kind: string;
  instructions: Instruction[];
}

export interface PriorityState {
  order: PlayerId[];
  index: number;
  consecutivePasses: number;
  open: boolean;
}

export interface RngState {
  algorithm: "xorshift32";
  seed: number;
  cursor: number;
}

export interface EngineState {
  schemaVersion: 1;
  rulesVersion: "4.1";
  revision: number;
  phase: Phase;
  activePlayerId: PlayerId;
  turnOrder: PlayerId[];
  fullTurnSequence: number;
  startPhaseSequenceByPlayer: Record<PlayerId, number>;
  players: Record<PlayerId, PlayerState>;
  cards: Record<CardId, CardInstance>;
  zones: GlobalZones;
  stack: StackItem[];
  triggerQueue: TriggerEvent[];
  suspendedStackItemIds: StackItemId[];
  pendingDeclaration: PendingDeclaration | null;
  priority: PriorityState | null;
  rng: RngState;
  winner: PlayerId | null;
  metadata: Record<string, unknown>;
}



export type CoreFoundationActionType = "draw" | "face-up-swap" | "play-for-points" | "play-for-effect" | "scuttle" | "pass";
export type CoreAuthorityProfileId = "core-foundation-authority" | "core-effect-declaration-authority" | "core-response-authority" | "core-private-choice-authority" | "core-advanced-authority";

export type CoreAdvancedAction =
  | { kind: "advanced-royal-marriage"; kingCardId: CardId; queenCardId: CardId }
  | { kind: "advanced-super-two"; sourceCardIds: [CardId, CardId]; targetCardId: CardId; disposition: "score" | "hold" }
  | { kind: "advanced-super-four-exchange"; sourceCardIds: [CardId, CardId]; targetPlayerId: PlayerId; row: "pr" | "er" }
  | { kind: "advanced-super-eight-scuttle"; sourceCardIds: [CardId, CardId]; targetCardId: CardId }
  | { kind: "advanced-super-j-tempo"; sourceCardIds: [CardId, CardId] }
  | { kind: "advanced-rank10-club-foundation"; sourceCardId: CardId; bonusScoreCardId?: CardId }
  | { kind: "advanced-rank10-heart-tempo"; sourceCardId: CardId }
  | { kind: "advanced-rank10-spade-recovery"; sourceCardId: CardId; recoverCardId: CardId }
  | { kind: "advanced-ultra-three-black"; sourceCardIds: [CardId, CardId, CardId]; scoreCardId: CardId; castCardId: CardId; exileCardId: CardId; castEffect: CoreEffectAction }
  | { kind: "advanced-ultra-two-black-two-red"; sourceCardIds: [CardId, CardId, CardId, CardId]; branch: "draw-two" | "rummage-exile"; rummageCardId?: CardId }
  | { kind: "advanced-voltage-three"; chosenCardId?: CardId; disposition: "hand" | "points" }
  | { kind: "advanced-voltage-four"; guessRank: string; guessSuit: string; rankMatchDisposition: "points" }
  | { kind: "advanced-voltage-five"; branch: "refine" | "gy-bottom"; discardCardId?: CardId };

export type CorePrimaryAction =
  | { kind: "core-draw" }
  | { kind: "core-face-up-swap-draw"; swapCardId: CardId }
  | { kind: "core-score"; cardId: CardId }
  | { kind: "core-scuttle"; sourceCardId: CardId; targetCardId: CardId }
  | { kind: "core-resolve-effect"; effect: CoreEffectAction }
  | { kind: "core-resolve-generated-effect"; effect: CoreEffectAction; parentChoiceId: string }
  | { kind: "core-resolve-advanced"; advanced: CoreAdvancedAction }
  | { kind: "core-pass" };

export type CoreResponseKind =
  | "base-ace-counter"
  | "anchor-ace-counter"
  | "spade-ace-counter"
  | "eight-scuttle-counter"
  | "king-anchor-counter"
  | "jack-disrupt"
  | "nine-tap"
  | "eight-spade-free-scuttle"
  | "eight-aegis-field"
  | "queen-aegis-quick"
  | "super-ace-counter"
  | "king-spade-counter"
  | "rank10-stack-theft"
  | "ultra-three-red";

export type CoreStackPayload =
  | { kind: "primary"; action: CorePrimaryAction; declaringPlayerId: PlayerId; actionType: CoreFoundationActionType; stackClass: "draw" | "swap" | "points" | "ordinary-effect" | "anchor" | "scuttle" | "pass" | "super" | "ultra" | "royal-marriage" | "rank10" | "voltage" }
  | { kind: "response"; responseKind: CoreResponseKind; targetStackItemId?: StackItemId; disruptedActionType?: CoreFoundationActionType; counterDestination?: "GY" | "EXILE"; targetCardId?: CardId };

export type CoreEffectAction =
  | { kind: "ace-purge"; sourceCardId: CardId; targetCardId: CardId; mode: "scrap-aegis" | "bounce-anchor" }
  | { kind: "ace-anchor"; sourceCardId: CardId }
  | { kind: "three-bounce"; sourceCardId: CardId; targetCardId: CardId }
  | { kind: "four-row-clear"; sourceCardId: CardId; targetPlayerId: PlayerId; row: "pr" | "er" }
  | { kind: "four-total-clear"; sourceCardId: CardId }
  | { kind: "jack-attach"; sourceCardId: CardId; targetCardId: CardId; row: "pr" | "er" }
  | { kind: "queen-anchor"; sourceCardId: CardId }
  | { kind: "king-anchor"; sourceCardId: CardId }
  | { kind: "red-joker"; sourceCardId: CardId; mode: "hand-swap" | "self-reset" | "opponent-attack" | "shuffle-reset"; targetPlayerId?: PlayerId }
  | { kind: "black-joker-board-lock"; sourceCardId: CardId }
  | { kind: "three-hand-raid"; sourceCardId: CardId; targetPlayerId: PlayerId; mode: "present-take" | "force-discard" }
  | { kind: "five-recycle"; sourceCardId: CardId }
  | { kind: "six-dig"; sourceCardId: CardId }
  | { kind: "seven-topdeck"; sourceCardId: CardId }
  | { kind: "nine-anchor"; sourceCardId: CardId; targetPlayerId: PlayerId };

export type CorePrivateChoiceKind =
  | "core-rank3-present"
  | "core-rank3-take"
  | "core-rank3-discard"
  | "core-rank5-rummage"
  | "core-rank6-dig"
  | "core-rank7-assign"
  | "core-rank7-generated-effect"
  | "core-nine-anchor-discard";

export interface CorePrivateChoiceState {
  schemaVersion: 1;
  choiceId: string;
  token: string;
  kind: CorePrivateChoiceKind;
  chooserId: PlayerId;
  controllerId: PlayerId;
  sourceCardId: CardId;
  createdRevision: number;
  optionCardIds: CardId[];
  optionsHash: string;
  minSelections: number;
  maxSelections: number;
  stage: number;
  context: Record<string, unknown>;
}

export type CorePrivateChoiceSubmission =
  | { kind: "core-rank3-present"; selectedCardIds: CardId[] }
  | { kind: "core-rank3-take"; selectedCardIds: CardId[] }
  | { kind: "core-rank3-discard"; selectedCardIds: CardId[] }
  | { kind: "core-rank5-rummage"; selectedCardIds: CardId[] }
  | { kind: "core-rank6-dig"; mode: "keep-return-top" | "keep-return-bottom" | "keep-all-discard"; selectedCardIds: CardId[] }
  | { kind: "core-rank7-assign"; mode: "hand-only" | "effect-only" | "hand-and-effect"; selectedCardIds: CardId[] }
  | { kind: "core-rank7-generated-effect"; selectedCardIds: CardId[]; generatedEffect?: CoreEffectAction }
  | { kind: "core-nine-anchor-discard"; selectedCardIds: CardId[] };

export type CoreAuthorityAction =
  | { kind: "core-apply-setup"; playerIds: [PlayerId, PlayerId]; profileId?: CoreAuthorityProfileId }
  | { kind: "core-begin-start"; playerId: PlayerId }
  | { kind: "core-face-down-swap"; handCardId: CardId; swapCardId: CardId }
  | { kind: "core-enter-action" }
  | { kind: "core-draw" }
  | { kind: "core-face-up-swap-draw"; swapCardId: CardId }
  | { kind: "core-score"; cardId: CardId }
  | { kind: "core-scuttle"; sourceCardId: CardId; targetCardId: CardId }
  | { kind: "core-pass" }
  | { kind: "core-resolve-effect"; effect: CoreEffectAction }
  | { kind: "core-resolve-generated-effect"; effect: CoreEffectAction; parentChoiceId: string }
  | { kind: "core-resolve-advanced"; advanced: CoreAdvancedAction }
  | { kind: "core-declare-primary"; action: CorePrimaryAction }
  | { kind: "core-pass-priority" }
  | { kind: "core-declare-base-ace-counter"; sourceCardId: CardId; targetStackItemId: StackItemId; sourceMode: "hand" | "anchor" }
  | { kind: "core-declare-spade-ace-counter"; sourceCardId: CardId; targetStackItemId: StackItemId }
  | { kind: "core-declare-eight-scuttle-counter"; sourceCardId: CardId; targetStackItemId: StackItemId }
  | { kind: "core-declare-king-counter"; sourceCardId: CardId; targetStackItemId: StackItemId }
  | { kind: "core-declare-jack-disrupt"; sourceCardId: CardId; targetStackItemId: StackItemId }
  | { kind: "core-declare-nine-tap"; sourceCardId: CardId; targetCardId: CardId }
  | { kind: "core-declare-eight-spade-free-scuttle"; sourceCardId: CardId; targetCardId: CardId }
  | { kind: "core-declare-eight-aegis-field"; sourceCardId: CardId }
  | { kind: "core-declare-queen-aegis-quick"; sourceCardId: CardId; targetCardId: CardId }
  | { kind: "core-declare-super-ace-counter"; sourceCardIds: [CardId, CardId]; targetStackItemId: StackItemId }
  | { kind: "core-declare-king-spade-counter"; sourceCardId: CardId; targetStackItemId: StackItemId }
  | { kind: "core-declare-rank10-stack-theft"; sourceCardId: CardId; targetStackItemId: StackItemId }
  | { kind: "core-declare-ultra-three-red"; sourceCardIds: [CardId, CardId, CardId]; targetStackItemId: StackItemId }
  | { kind: "core-resolve-response-top" }
  | { kind: "core-submit-private-choice"; token: string; submission: CorePrivateChoiceSubmission }
  | { kind: "core-complete-turn" };

export type EngineCommand =
  | { id: CommandId; type: "DECLARE_PLAY"; actorId: PlayerId; play: PlayDefinition; stagedCostIds?: CardId[] }
  | { id: CommandId; type: "PASS_PRIORITY"; actorId: PlayerId }
  | { id: CommandId; type: "RESOLVE_TOP"; actorId: PlayerId }
  | { id: CommandId; type: "RESPOND_WITH_PLAY"; actorId: PlayerId; play: PlayDefinition; stagedCostIds?: CardId[] }
  | { id: CommandId; type: "COUNTER_TOP"; actorId: PlayerId; sourceCardIds: CardId[] }
  | { id: CommandId; type: "HIDDEN_CHOICE"; actorId: PlayerId; choiceId: string; payload: unknown; visibility: Visibility }
  | { id: CommandId; type: "NOOP"; actorId: PlayerId; label: string }
  | { id: CommandId; type: "APPLY_AEGIS"; actorId: PlayerId; cardId: CardId; sourceRef: string; expiresAt: StartEventRef }
  | { id: CommandId; type: "APPLY_TAP"; actorId: PlayerId; cardId: CardId; tapState: TapState }
  | { id: CommandId; type: "CLEAR_TAP"; actorId: PlayerId; cardId: CardId; reason: string }
  | { id: CommandId; type: "GRANT_REVEAL_UNTIL_START"; actorId: PlayerId; cardId: CardId; expiresAt: StartEventRef }
  | { id: CommandId; type: "SET_PLAYED_FOR_EFFECT"; actorId: PlayerId; cardId: CardId; value: boolean }
  | { id: CommandId; type: "SET_EXILE_BOUND"; actorId: PlayerId; cardId: CardId }
  | { id: CommandId; type: "CHANGE_CONTROLLER"; actorId: PlayerId; cardId: CardId; controllerId: PlayerId }
  | { id: CommandId; type: "MOVE_CARD"; actorId: PlayerId; cardId: CardId; destination: ZoneName; controllerId?: PlayerId }
  | { id: CommandId; type: "BEGIN_START_PHASE"; actorId: PlayerId; playerId: PlayerId }
  | { id: CommandId; type: "SCORE_CARD"; actorId: PlayerId; playerId: PlayerId; cardId: CardId }
  | { id: CommandId; type: "RESOLVE_RANK_ACTION"; actorId: PlayerId; action: RankAction }
  | { id: CommandId; type: "RESOLVE_INTERACTION_ACTION"; actorId: PlayerId; action: InteractionAction }
  | { id: CommandId; type: "RESOLVE_PHASE8_ACTION"; actorId: PlayerId; action: Phase8Action }
  | { id: CommandId; type: "RESOLVE_PHASE9_ACTION"; actorId: PlayerId; action: FirstContactAction }
  | { id: CommandId; type: "RESOLVE_PHASE10_ACTION"; actorId: PlayerId; action: Phase10Action }
  | { id: CommandId; type: "RESOLVE_PHASE11_ACTION"; actorId: PlayerId; action: Phase11Action }
  | { id: CommandId; type: "RESOLVE_PHASE12_ACTION"; actorId: PlayerId; action: Phase12Action }
  | { id: CommandId; type: "RESOLVE_PHASE13_ACTION"; actorId: PlayerId; action: Phase13Action }
  | { id: CommandId; type: "RESOLVE_PHASE14_ACTION"; actorId: PlayerId; action: Phase14Action }
  | { id: CommandId; type: "RESOLVE_PHASE15_ACTION"; actorId: PlayerId; action: Phase15Action }
  | { id: CommandId; type: "RESOLVE_PHASE20_ACTION"; actorId: PlayerId; action: Phase20Action }
  | { id: CommandId; type: "RESOLVE_CORE_AUTHORITY_ACTION"; actorId: PlayerId; action: CoreAuthorityAction };


export type RankAction =
  | { kind: "ace-counter"; sourceCardIds: CardId[]; stackItemId: StackItemId; authority: "base" | "spade" | "super" }
  | { kind: "commandeer"; sourceCardIds: [CardId, CardId]; targetCardId: CardId; disposition: "score" | "hold" }
  | { kind: "total-clear"; sourceCardId: CardId }
  | { kind: "row-exchange"; sourceCardIds: [CardId, CardId]; targetPlayerId: PlayerId; row: "pr" | "er" }
  | { kind: "recycle-five"; sourceCardId: CardId; rummageCardId?: CardId }
  | { kind: "deep-draw-six-spade"; sourceCardId: CardId; discardCardIds: CardId[]; keepCardIds: CardId[] }
  | { kind: "topdeck-seven"; sourceCardId: CardId; handCardId?: CardId; effectCardId?: CardId }
  | { kind: "aegis-field-eight"; sourceCardId: CardId }
  | { kind: "goal-shift-nine"; sourceCardId: CardId; targetPlayerId: PlayerId; delta: 3 | 5; discardCardId?: CardId; ownGoalDelta?: -2 }
  | { kind: "mimic-ten-diamond"; sourceCardId: CardId; pairedTwoId?: CardId; mimickedRank: string; effectKey: string }
  | { kind: "foundation-ten-club"; sourceCardId: CardId; bonusScoreCardId?: CardId }
  | { kind: "stack-theft-ten-spade"; sourceCardId: CardId; stackItemId: StackItemId; replacementTargetIds?: CardId[] }
  | { kind: "attach-jack"; sourceCardId: CardId; targetCardId: CardId; row: "pr" | "er" }
  | { kind: "queen-anchor"; sourceCardId: CardId }
  | { kind: "royal-marriage"; kingCardId: CardId; queenCardId: CardId }
  | { kind: "red-joker-self-reset"; sourceCardId: CardId }
  | { kind: "black-joker-board-lock"; sourceCardId: CardId }
  | { kind: "ordinary-scuttle"; sourceCardId: CardId; targetCardId: CardId }
  | { kind: "absolute-scuttle"; sourceCardIds: [CardId, CardId]; targetCardId: CardId };


export type Phase8Action =
  | { kind: "resolve-ultra"; recipe: "3-black"; sourceCardIds: CardId[]; scoreCardId: CardId; castCardId: CardId; exileCardId: CardId }
  | { kind: "resolve-ultra"; recipe: "3-red"; sourceCardIds: CardId[]; targetStackItemId: StackItemId }
  | { kind: "resolve-ultra"; recipe: "2-black-2-red"; sourceCardIds: CardId[]; branch: "draw-two" | "rummage-exile"; rummageCardId?: CardId }
  | { kind: "begin-rank10-resolution"; cardId: CardId; destinationAfterResolution?: ZoneName }
  | { kind: "capture-voltage"; playerId: PlayerId }
  | { kind: "resolve-voltage"; playerId: PlayerId; rank: "3"; disposition: "hand" | "points" | "effect"; chosenCardId?: CardId }
  | { kind: "resolve-voltage"; playerId: PlayerId; rank: "4"; guessRank: string; guessSuit: string; rankMatchDisposition: "points" | "effect" }
  | { kind: "resolve-voltage"; playerId: PlayerId; rank: "5"; branch: "refine" | "gy-bottom"; discardCardId?: CardId }
  | { kind: "activate-board-lock" }
  | { kind: "activate-sudden-death" }
  | { kind: "begin-start-checkpoint"; playerId: PlayerId }
  | { kind: "recover-exhausted"; cardIds: CardId[] }
  | { kind: "process-end-phase" };


export type FirstContactOptionalModule = "battle-realm" | "trap" | "multiplayer" | "deffy-mode" | "time-bomb" | "tournament-seed";
export type FirstContactDeclarationClass = "generic-effect" | "suit-specific-effect" | "super" | "reserved-advanced" | "ultra" | "combo" | "draw-and-cast" | "aegis" | "royal-shield" | "exile-access" | "swap-bar" | "sudden-death" | "optional-module";

export type FirstContactAction =
  | { kind: "validate-profile-configuration"; enabledModules: FirstContactOptionalModule[]; teachingOverrideId?: string }
  | { kind: "validate-declaration"; declarationClass: FirstContactDeclarationClass; sourceCardIds?: CardId[]; rank?: string; effectKey?: string }
  | { kind: "apply-setup"; playerIds: [PlayerId, PlayerId]; teachingOverrideId?: string }
  | { kind: "begin-start"; playerId: PlayerId }
  | { kind: "route-destination"; cardId: CardId; requestedDestination: ZoneName; controllerId?: PlayerId }
  | { kind: "grant-mini-turns"; playerId: PlayerId; amount: number }
  | { kind: "enter-hand"; cardId: CardId; playerId: PlayerId }
  | { kind: "autonomy-enter-action" }
  | FirstContactPrimaryAction
  | { kind: "autonomy-declare-response-action"; action: FirstContactPrimaryAction }
  | { kind: "autonomy-declare-ace-counter"; sourceCardId: CardId; targetStackItemId: StackItemId }
  | { kind: "autonomy-declare-eight-scuttle-counter"; sourceCardId: CardId; targetStackItemId: StackItemId }
  | { kind: "autonomy-declare-king-counter"; sourceCardId: CardId; targetStackItemId: StackItemId }
  | { kind: "autonomy-declare-jack-disrupt"; sourceCardId: CardId; targetStackItemId: StackItemId }
  | { kind: "autonomy-pass-priority" }
  | { kind: "autonomy-resolve-response-top" }
  | { kind: "autonomy-flush-trigger-queue" }
  | { kind: "autonomy-submit-private-choice"; token: string; submission: FirstContactPrivateChoiceSubmission }
  | { kind: "autonomy-complete-turn" };


export type Phase10Action =
  | { kind: "place-trap"; cardId: CardId; row: "pr" | "er" }
  | { kind: "check-trigger"; trapCardId: CardId; eventKey: string; qualifyingEvent: boolean; duringAtomicResolution?: boolean }
  | { kind: "resolve-total-pressure"; trapCardId: CardId; opponentId: PlayerId }
  | { kind: "declare-combo"; sourceCardIds: CardId[]; initiatorCardId: CardId; recipeDefined: boolean }
  | { kind: "reveal-trap-as-effect"; trapCardId: CardId }
  | { kind: "module3-counter"; counterCardId: CardId; trapCardId: CardId }
  | { kind: "complete-full-turn"; playerId: PlayerId }
  | { kind: "resolve-jacked-points"; trapCardId: CardId; pendingScoreCardId: CardId; scoringPlayerId: PlayerId; hasAlternativeAction: boolean };


export type Phase11Action =
  | { kind: "configure-multiplayer"; mode: "ffa-3" | "teams-4"; turnOrder: PlayerId[]; teamAssignments?: Record<PlayerId, string> }
  | { kind: "apply-multiplayer-setup"; mode: "ffa-3" | "teams-4"; turnOrder: PlayerId[]; teamAssignments?: Record<PlayerId, string>; handAssignments: Record<PlayerId, CardId[]>; swapBarFaceDownCardIds: CardId[]; swapBarFaceUpCardIds: CardId[] }
  | { kind: "assign-thats-urz"; turnOrder: PlayerId[]; assignments?: Record<PlayerId, PlayerId> }
  | { kind: "validate-player-target"; sourcePlayerId: PlayerId; targetPlayerId: PlayerId; hostile: boolean; allowsAlly?: boolean }
  | { kind: "record-priority-cycle"; declaringPlayerId: PlayerId; passOrder: PlayerId[] }
  | { kind: "assign-tournament-seed"; priorityOrder: PlayerId[]; poolCardIds: CardId[]; preferences: Record<PlayerId, CardId[]> }
  | { kind: "intercept-generated-play"; stackItemId: StackItemId; originalControllerId: PlayerId; interceptorId: PlayerId; replacementTargetIds: CardId[] }
  | { kind: "partner-royal-marriage"; initiatorId: PlayerId; allyId: PlayerId; kingCardId: CardId; queenCardId: CardId }
  | { kind: "resolve-team-endgame"; kindOfCheck: "normal" | "sudden-death" | "exhausted"; activePlayerId: PlayerId; activatorId?: PlayerId };


export type BattleRealmSpec = "Bravery" | "Balance" | "Beauty" | "Brilliance";
export type ReservedBattleRealmCombine = "bravery-three-clubs" | "balance-same-color-jqk" | "brilliance-two-spades";

export type Phase12Action =
  | { kind: "configure-battle-realm"; specs: Record<PlayerId, BattleRealmSpec> }
  | { kind: "recalculate-continuous-bonuses" }
  | { kind: "validate-reserved-combine"; combine: ReservedBattleRealmCombine; sourceCardIds: CardId[] }
  | { kind: "apply-goal-delta"; playerId: PlayerId; delta: number }
  | { kind: "grant-mini-turns"; playerId: PlayerId; amount: number }
  | { kind: "register-limited-play"; playerId: PlayerId; playClass: "ultra" | "rank10" }
  | { kind: "courageous-assault"; targetCardId: CardId }
  | { kind: "extra-lucky"; drawnCardId: CardId; sourcePosition: "dp-top" | "dp-bottom" | "unavailable" }
  | { kind: "mastermind"; inspectedCardIds: CardId[]; drawCardIds: CardId[]; returnOrder: CardId[]; viewerId?: PlayerId }
  | { kind: "counter-distortion"; defendingPlayerId: PlayerId; jackControllerId: PlayerId; discardJackId?: CardId }
  | { kind: "goal-shock"; enemyPlayerIds: PlayerId[] }
  | { kind: "hard-jack"; jackCardId: CardId; hostCardId: CardId }
  | { kind: "harmonized-mimic"; drawnCardIds: CardId[]; keepCardIds: CardId[] }
  | { kind: "chromatic-ten"; cardId: CardId; asSuit: "♣" | "♦" | "♠" }
  | { kind: "preserve-intercepted-play"; stackItemId: StackItemId; originalControllerId: PlayerId; interceptorId: PlayerId; replacementTargetIds: CardId[]; preservedModifierKeys: string[] }
  | { kind: "complete-full-turn"; playerId: PlayerId };


export type Phase13Action =
  | { kind: "configure-time-bomb" }
  | { kind: "score-queen-as-bomb"; playerId: PlayerId; cardId: CardId }
  | { kind: "queue-fuse-triggers"; playerId: PlayerId }
  | { kind: "resolve-fuse"; cardId: CardId; enemyDiscardChoices?: Record<PlayerId, CardId> }
  | { kind: "declare-defuse"; targetCardId: CardId; costCardIds: CardId[]; responseWindow: boolean; countered?: boolean; targetLegalAtResolution?: boolean }
  | { kind: "consume-action-phase-skip"; playerId: PlayerId }
  | { kind: "enforce-forced-draw"; playerId: PlayerId; declaredAction: "draw" | "pass" | "other"; drawLegal: boolean; actionPhaseSkipped?: boolean }
  | { kind: "change-bomb-controller"; cardId: CardId; controllerId: PlayerId }
  | { kind: "move-time-bomb"; cardId: CardId; destination: ZoneName; controllerId?: PlayerId };


export type DeffySubMode = "classic" | "icu" | "soda" | "mystery-mix" | "deffy-moment";

export type Phase14Action =
  | { kind: "configure-deffy"; subMode: DeffySubMode; turnOrder: PlayerId[]; targetHandSizes?: Record<PlayerId, number>; addOns?: Partial<{ speedRun: boolean; thatsUrz: boolean; thirdPartied: boolean; mirrorMe: boolean }>; assignments?: Record<PlayerId, PlayerId> }
  | { kind: "initialize-draft-pool"; poolCardIds: CardId[]; faceDownCardIds: CardId[] }
  | { kind: "draft-pick"; drafterId: PlayerId; cardId: CardId }
  | { kind: "speed-run-timeout"; drafterId: PlayerId }
  | { kind: "refill-pool" }
  | { kind: "complete-draft"; leftoverDisposition?: "shuffle" | "scrap"; unanimous?: boolean }
  | { kind: "mirror-me-pick"; drafterId: PlayerId; cardId: CardId; mirrorCardId: CardId }
  | { kind: "validate-assignment"; turnOrder: PlayerId[]; assignments: Record<PlayerId, PlayerId> };


export type Phase15Action =
  | { kind: "configure-tournament-seed"; seedOrder: PlayerId[]; enabledOptionalModules?: string[]; eventSheetId?: string; approvedOptionalModules?: string[]; alternateHighImpactPool?: string[] }
  | { kind: "select-tournament-category"; playerId: PlayerId; category: 1 | 2 | 3 | 4; cardId: CardId }
  | { kind: "resolve-high-impact"; rankingsByPlayer: Record<PlayerId, string[]>; fallbackRankingsByPlayer?: Record<PlayerId, string[]> }
  | { kind: "finalize-tournament-seed" }
  | { kind: "validate-tournament-scuttle"; sourceCardId: CardId; targetCardId: CardId };

export type ProtectionKind = "guard" | "aegis" | "rank-effect-immunity" | "q-spade-clear-immunity" | "scuttle-immunity";
export type InteractionChannel = "effect" | "action";
export type InteractionShape = "single-target" | "multi-target" | "structural";

export interface InteractionProfile {
  channel: InteractionChannel;
  shape: InteractionShape;
  hostile: boolean;
  operation: "generic" | "clear" | "scuttle" | "attachment" | "control-change" | "tap" | "bounce" | "scrap";
  bypasses: ProtectionKind[];
  totalClear?: boolean;
}

export interface ProtectionEvaluation {
  legal: boolean;
  blockedBy: ProtectionKind[];
  guardProviderIds: CardId[];
}

export type CounterAuthority = "base-ace" | "anchor-ace" | "ace-spade" | "super-ace" | "king" | "king-spade" | "eight-scuttle";
export type CounterTargetClass = "ordinary-effect" | "counter" | "single-anchor" | "single-goal" | "multi-play" | "royal-marriage" | "ace-spade" | "ultra" | "sudden-death" | "scuttle" | "triggered-ability";

export interface CounterTargetProfile {
  stackItemId: StackItemId;
  class: CounterTargetClass;
  royalShieldProtected: boolean;
}

export interface CounterEvaluation {
  legal: boolean;
  reason: string | null;
  blockedByRoyalShield: boolean;
  blockedByTwoQueenDefense: boolean;
}

export type ScuttleProfile = "ordinary" | "free-eight-spade" | "absolute-eight";

export interface JackAttachmentState {
  kind: "jack-pr" | "jack-er";
  hostCardId: CardId;
  originalHostZone: ZoneName;
  originalHostControllerId: PlayerId;
  pointBonus: number;
}

export type InteractionAction =
  | { kind: "attempt-interaction"; targetCardId: CardId; destination: ZoneName; profile: InteractionProfile; controllerId?: PlayerId }
  | { kind: "counter-stack"; sourceCardIds: CardId[]; authority: CounterAuthority; target: CounterTargetProfile }
  | { kind: "scuttle"; sourceCardIds: CardId[]; targetCardId: CardId; profile: ScuttleProfile }
  | { kind: "attach-jack-graph"; sourceCardId: CardId; targetCardId: CardId; row: "pr" | "er" }
  | { kind: "move-and-revalidate"; cardId: CardId; destination: ZoneName; controllerId?: PlayerId }
  | { kind: "change-controller-and-revalidate"; cardId: CardId; controllerId: PlayerId }
  | { kind: "revalidate-attachments" };

export interface EngineEvent<T = unknown> {
  id: EventId;
  sequence: number;
  commandId: CommandId;
  type: string;
  visibility: Visibility;
  payload: T;
  previousStateHash: string;
  stateHash: string;
}

export interface CommandResult {
  accepted: boolean;
  state: EngineState;
  events: EngineEvent[];
  error?: EngineErrorData;
}

export interface EngineErrorData {
  code: string;
  message: string;
  details?: unknown;
}

export interface ReplayEnvelope {
  format: "intrilex-replay";
  version: 1;
  rulesVersion: "4.1";
  fixtureId: string;
  initialState: EngineState;
  commands: EngineCommand[];
  events: EngineEvent[];
  initialStateHash: string;
  finalStateHash: string;
  eventLogHash: string;
}


export interface ReplayCommandCheckpoint {
  commandIndex: number;
  commandId: CommandId;
  accepted: boolean;
  revisionBefore: number;
  revisionAfter: number;
  stateHashBefore: string;
  stateHashAfter: string;
  eventStartIndex: number;
  eventEndIndex: number;
  eventRangeHash: string;
  rngBefore: RngState;
  rngAfter: RngState;
}

export interface CertifiedReplayEnvelope {
  format: "intrilex-replay";
  version: 2;
  codec: "canonical-json-v1";
  rulesVersion: "4.1";
  engineVersion: string;
  fixtureId: string;
  initialState: EngineState;
  commands: EngineCommand[];
  accepted: boolean[];
  events: EngineEvent[];
  checkpoints: ReplayCommandCheckpoint[];
  initialStateHash: string;
  finalStateHash: string;
  eventLogHash: string;
  checkpointLogHash: string;
  rngTraceHash: string;
  contentHash: string;
  integrityHash: string;
}

export interface PublicCertifiedReplayEnvelope {
  format: "intrilex-public-replay";
  version: 2;
  codec: "canonical-json-v1";
  rulesVersion: "4.1";
  engineVersion: string;
  fixtureId: string;
  initialState: unknown;
  commands: unknown[];
  accepted: boolean[];
  events: EngineEvent[];
  checkpoints: Array<{ commandIndex: number; commandId: CommandId; accepted: boolean; eventStartIndex: number; eventEndIndex: number; eventRangeHash: string }>;
  publicEventLogHash: string;
  publicContentHash: string;
}

export type ReplayRecord = ReplayEnvelope | CertifiedReplayEnvelope;

export type JudgeOutcomeClass = "illegal-declaration" | "countered" | "fizzled" | "resolved" | "no-op";

export interface JudgeMarkerEntry {
  cardId: CardId;
  identity: string;
  controllerId: PlayerId;
  zone: ZoneName;
  markers: Record<string, unknown>;
}

export interface JudgePacket {
  rulesVersion: "4.1";
  revision: number;
  phase: Phase;
  activePlayerId: PlayerId;
  publicStateHash: string;
  markerChecklist: JudgeMarkerEntry[];
  timers: Record<string, unknown>;
  pendingObjects: { stackDepth: number; triggerQueueDepth: number; pendingDeclaration: boolean; priorityOpen: boolean };
  privateFactsByViewer?: Record<PlayerId, unknown>;
}

export type ModuleKey = "first-contact" | "battle-realm" | "traps" | "multiplayer" | "deffy-mode" | "time-bomb" | "tournament-seed";
export type CompatibilityStatus = "compatible" | "compatible-with-rule" | "requires-event-approval" | "prohibited";
export interface ModuleCompatibilityResult {
  status: CompatibilityStatus;
  reason: string;
  ruleRefs: string[];
}

export type Phase20Action =
  | { kind: "resolve-super-seven-single"; sourceCardIds: [CardId, CardId]; childCardId: CardId }
  | { kind: "resolve-super-five"; sourceCardIds: [CardId, CardId]; chosenCardId: CardId; disposition: "points" | "effect" }
  | { kind: "consume-skipped-turn-slot" };


export interface FixtureExpectation {
  accepted?: boolean[];
  finalStateHash?: string;
  final: {
    zones?: Partial<GlobalZones>;
    hands?: Record<PlayerId, CardId[]>;
    playerZones?: Record<PlayerId, { hand?: CardId[]; pr?: CardId[]; er?: CardId[] }>;
    goals?: Record<PlayerId, number>;
    securedPoints?: Record<PlayerId, number>;
    playerLimits?: Record<PlayerId, Partial<PlayerLimits>>;
    stackDepth?: number;
    triggerQueueDepth?: number;
    markers?: Record<CardId, Record<string, unknown>>;
    absentMarkers?: Record<CardId, string[]>;
    cardZones?: Record<CardId, ZoneName>;
    controllers?: Record<CardId, PlayerId>;
    originalOwners?: Record<CardId, PlayerId>;
    activePlayerId?: PlayerId;
    fullTurnSequence?: number;
    startPhaseSequenceByPlayer?: Record<PlayerId, number>;
    phase?: Phase;
    winner?: PlayerId | null;
    metadata?: Record<string, unknown>;
  };
}

export interface ConformanceFixture {
  id: string;
  title: string;
  sourceTestId: string;
  purpose: string;
  initialState: EngineState;
  commands: EngineCommand[];
  expectation: FixtureExpectation;
}
