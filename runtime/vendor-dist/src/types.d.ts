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
export type TapState = {
    kind: "nine-score";
    sourceRef: string;
} | {
    kind: "start-phase";
    sourceRef: string;
    expiresAt: StartEventRef;
} | {
    kind: "explicit-event";
    sourceRef: string;
    eventKey: string;
} | {
    kind: "manual-only";
    sourceRef: string;
};
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
export type RevalidationClass = "none" | "single-required-target" | "independent-targets" | "all-or-nothing" | "structural";
export type Requirement = {
    kind: "other-hand-cards";
    playerId: PlayerId;
    minimum: number;
    excludingSourceIds: CardId[];
} | {
    kind: "card-in-zone";
    cardId: CardId;
    zone: ZoneName;
} | {
    kind: "target-unprotected";
    cardId: CardId;
} | {
    kind: "hand-cost-available";
    playerId: PlayerId;
    cardIds: CardId[];
} | {
    kind: "stack-item-exists";
    stackItemId: StackItemId;
};
export type Instruction = {
    op: "discard";
    playerId: PlayerId;
    cardIds: CardId[];
    requiredMinimum: number;
} | {
    op: "draw-keep-return";
    playerId: PlayerId;
    drawCount: number;
    keepIds: CardId[];
    returnIds: CardId[];
} | {
    op: "change-goal";
    playerId: PlayerId;
    delta: number;
} | {
    op: "take-card";
    cardId: CardId;
    playerId: PlayerId;
    revealUntilStart?: boolean;
} | {
    op: "move-card";
    cardId: CardId;
    zone: ZoneName;
    controllerId?: PlayerId;
} | {
    op: "remove-target";
    cardId: CardId;
    destination: ZoneName;
} | {
    op: "enqueue-trigger";
    trigger: TriggerEvent;
} | {
    op: "set-marker";
    cardId: CardId;
    key: string;
    value: unknown;
} | {
    op: "rebind-stack-item";
    stackItemId: StackItemId;
    controllerId: PlayerId;
    replacementInstructions?: Instruction[];
    replacementTargetIds?: CardId[];
} | {
    op: "record";
    label: string;
    data?: unknown;
};
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
export type EngineCommand = {
    id: CommandId;
    type: "DECLARE_PLAY";
    actorId: PlayerId;
    play: PlayDefinition;
    stagedCostIds?: CardId[];
} | {
    id: CommandId;
    type: "PASS_PRIORITY";
    actorId: PlayerId;
} | {
    id: CommandId;
    type: "RESOLVE_TOP";
    actorId: PlayerId;
} | {
    id: CommandId;
    type: "RESPOND_WITH_PLAY";
    actorId: PlayerId;
    play: PlayDefinition;
    stagedCostIds?: CardId[];
} | {
    id: CommandId;
    type: "COUNTER_TOP";
    actorId: PlayerId;
    sourceCardIds: CardId[];
} | {
    id: CommandId;
    type: "HIDDEN_CHOICE";
    actorId: PlayerId;
    choiceId: string;
    payload: unknown;
    visibility: Visibility;
} | {
    id: CommandId;
    type: "NOOP";
    actorId: PlayerId;
    label: string;
} | {
    id: CommandId;
    type: "APPLY_AEGIS";
    actorId: PlayerId;
    cardId: CardId;
    sourceRef: string;
    expiresAt: StartEventRef;
} | {
    id: CommandId;
    type: "APPLY_TAP";
    actorId: PlayerId;
    cardId: CardId;
    tapState: TapState;
} | {
    id: CommandId;
    type: "CLEAR_TAP";
    actorId: PlayerId;
    cardId: CardId;
    reason: string;
} | {
    id: CommandId;
    type: "GRANT_REVEAL_UNTIL_START";
    actorId: PlayerId;
    cardId: CardId;
    expiresAt: StartEventRef;
} | {
    id: CommandId;
    type: "SET_PLAYED_FOR_EFFECT";
    actorId: PlayerId;
    cardId: CardId;
    value: boolean;
} | {
    id: CommandId;
    type: "SET_EXILE_BOUND";
    actorId: PlayerId;
    cardId: CardId;
} | {
    id: CommandId;
    type: "CHANGE_CONTROLLER";
    actorId: PlayerId;
    cardId: CardId;
    controllerId: PlayerId;
} | {
    id: CommandId;
    type: "MOVE_CARD";
    actorId: PlayerId;
    cardId: CardId;
    destination: ZoneName;
    controllerId?: PlayerId;
} | {
    id: CommandId;
    type: "BEGIN_START_PHASE";
    actorId: PlayerId;
    playerId: PlayerId;
} | {
    id: CommandId;
    type: "SCORE_CARD";
    actorId: PlayerId;
    playerId: PlayerId;
    cardId: CardId;
} | {
    id: CommandId;
    type: "RESOLVE_RANK_ACTION";
    actorId: PlayerId;
    action: RankAction;
} | {
    id: CommandId;
    type: "RESOLVE_INTERACTION_ACTION";
    actorId: PlayerId;
    action: InteractionAction;
} | {
    id: CommandId;
    type: "RESOLVE_PHASE8_ACTION";
    actorId: PlayerId;
    action: Phase8Action;
} | {
    id: CommandId;
    type: "RESOLVE_PHASE9_ACTION";
    actorId: PlayerId;
    action: FirstContactAction;
} | {
    id: CommandId;
    type: "RESOLVE_PHASE10_ACTION";
    actorId: PlayerId;
    action: Phase10Action;
} | {
    id: CommandId;
    type: "RESOLVE_PHASE11_ACTION";
    actorId: PlayerId;
    action: Phase11Action;
} | {
    id: CommandId;
    type: "RESOLVE_PHASE12_ACTION";
    actorId: PlayerId;
    action: Phase12Action;
} | {
    id: CommandId;
    type: "RESOLVE_PHASE13_ACTION";
    actorId: PlayerId;
    action: Phase13Action;
} | {
    id: CommandId;
    type: "RESOLVE_PHASE14_ACTION";
    actorId: PlayerId;
    action: Phase14Action;
} | {
    id: CommandId;
    type: "RESOLVE_PHASE15_ACTION";
    actorId: PlayerId;
    action: Phase15Action;
} | {
    id: CommandId;
    type: "RESOLVE_PHASE20_ACTION";
    actorId: PlayerId;
    action: Phase20Action;
};
export type RankAction = {
    kind: "ace-counter";
    sourceCardIds: CardId[];
    stackItemId: StackItemId;
    authority: "base" | "spade" | "super";
} | {
    kind: "commandeer";
    sourceCardIds: [CardId, CardId];
    targetCardId: CardId;
    disposition: "score" | "hold";
} | {
    kind: "total-clear";
    sourceCardId: CardId;
} | {
    kind: "row-exchange";
    sourceCardIds: [CardId, CardId];
    targetPlayerId: PlayerId;
    row: "pr" | "er";
} | {
    kind: "recycle-five";
    sourceCardId: CardId;
    rummageCardId?: CardId;
} | {
    kind: "deep-draw-six-spade";
    sourceCardId: CardId;
    discardCardIds: CardId[];
    keepCardIds: CardId[];
} | {
    kind: "topdeck-seven";
    sourceCardId: CardId;
    handCardId?: CardId;
    effectCardId?: CardId;
} | {
    kind: "aegis-field-eight";
    sourceCardId: CardId;
} | {
    kind: "goal-shift-nine";
    sourceCardId: CardId;
    targetPlayerId: PlayerId;
    delta: 3 | 5;
    discardCardId?: CardId;
    ownGoalDelta?: -2;
} | {
    kind: "mimic-ten-diamond";
    sourceCardId: CardId;
    pairedTwoId?: CardId;
    mimickedRank: string;
    effectKey: string;
} | {
    kind: "foundation-ten-club";
    sourceCardId: CardId;
    bonusScoreCardId?: CardId;
} | {
    kind: "stack-theft-ten-spade";
    sourceCardId: CardId;
    stackItemId: StackItemId;
    replacementTargetIds?: CardId[];
} | {
    kind: "attach-jack";
    sourceCardId: CardId;
    targetCardId: CardId;
    row: "pr" | "er";
} | {
    kind: "queen-anchor";
    sourceCardId: CardId;
} | {
    kind: "royal-marriage";
    kingCardId: CardId;
    queenCardId: CardId;
} | {
    kind: "red-joker-self-reset";
    sourceCardId: CardId;
} | {
    kind: "black-joker-board-lock";
    sourceCardId: CardId;
} | {
    kind: "ordinary-scuttle";
    sourceCardId: CardId;
    targetCardId: CardId;
} | {
    kind: "absolute-scuttle";
    sourceCardIds: [CardId, CardId];
    targetCardId: CardId;
};
export type Phase8Action = {
    kind: "resolve-ultra";
    recipe: "3-black";
    sourceCardIds: CardId[];
    scoreCardId: CardId;
    castCardId: CardId;
    exileCardId: CardId;
} | {
    kind: "resolve-ultra";
    recipe: "3-red";
    sourceCardIds: CardId[];
    targetStackItemId: StackItemId;
} | {
    kind: "resolve-ultra";
    recipe: "2-black-2-red";
    sourceCardIds: CardId[];
    branch: "draw-two" | "rummage-exile";
    rummageCardId?: CardId;
} | {
    kind: "begin-rank10-resolution";
    cardId: CardId;
    destinationAfterResolution?: ZoneName;
} | {
    kind: "capture-voltage";
    playerId: PlayerId;
} | {
    kind: "resolve-voltage";
    playerId: PlayerId;
    rank: "3";
    disposition: "hand" | "points" | "effect";
    chosenCardId?: CardId;
} | {
    kind: "resolve-voltage";
    playerId: PlayerId;
    rank: "4";
    guessRank: string;
    guessSuit: string;
    rankMatchDisposition: "points" | "effect";
} | {
    kind: "resolve-voltage";
    playerId: PlayerId;
    rank: "5";
    branch: "refine" | "gy-bottom";
    discardCardId?: CardId;
} | {
    kind: "activate-board-lock";
} | {
    kind: "activate-sudden-death";
} | {
    kind: "begin-start-checkpoint";
    playerId: PlayerId;
} | {
    kind: "recover-exhausted";
    cardIds: CardId[];
} | {
    kind: "process-end-phase";
};
export type FirstContactOptionalModule = "battle-realm" | "trap" | "multiplayer" | "deffy-mode" | "time-bomb" | "tournament-seed";
export type FirstContactDeclarationClass = "generic-effect" | "suit-specific-effect" | "super" | "reserved-advanced" | "ultra" | "combo" | "draw-and-cast" | "aegis" | "royal-shield" | "exile-access" | "swap-bar" | "sudden-death" | "optional-module";
export type FirstContactAction = {
    kind: "validate-profile-configuration";
    enabledModules: FirstContactOptionalModule[];
    teachingOverrideId?: string;
} | {
    kind: "validate-declaration";
    declarationClass: FirstContactDeclarationClass;
    sourceCardIds?: CardId[];
    rank?: string;
    effectKey?: string;
} | {
    kind: "apply-setup";
    playerIds: [PlayerId, PlayerId];
    teachingOverrideId?: string;
} | {
    kind: "begin-start";
    playerId: PlayerId;
} | {
    kind: "route-destination";
    cardId: CardId;
    requestedDestination: ZoneName;
    controllerId?: PlayerId;
} | {
    kind: "grant-mini-turns";
    playerId: PlayerId;
    amount: number;
} | {
    kind: "enter-hand";
    cardId: CardId;
    playerId: PlayerId;
};
export type Phase10Action = {
    kind: "place-trap";
    cardId: CardId;
    row: "pr" | "er";
} | {
    kind: "check-trigger";
    trapCardId: CardId;
    eventKey: string;
    qualifyingEvent: boolean;
    duringAtomicResolution?: boolean;
} | {
    kind: "resolve-total-pressure";
    trapCardId: CardId;
    opponentId: PlayerId;
} | {
    kind: "declare-combo";
    sourceCardIds: CardId[];
    initiatorCardId: CardId;
    recipeDefined: boolean;
} | {
    kind: "reveal-trap-as-effect";
    trapCardId: CardId;
} | {
    kind: "module3-counter";
    counterCardId: CardId;
    trapCardId: CardId;
} | {
    kind: "complete-full-turn";
    playerId: PlayerId;
} | {
    kind: "resolve-jacked-points";
    trapCardId: CardId;
    pendingScoreCardId: CardId;
    scoringPlayerId: PlayerId;
    hasAlternativeAction: boolean;
};
export type Phase11Action = {
    kind: "configure-multiplayer";
    mode: "ffa-3" | "teams-4";
    turnOrder: PlayerId[];
    teamAssignments?: Record<PlayerId, string>;
} | {
    kind: "apply-multiplayer-setup";
    mode: "ffa-3" | "teams-4";
    turnOrder: PlayerId[];
    teamAssignments?: Record<PlayerId, string>;
    handAssignments: Record<PlayerId, CardId[]>;
    swapBarFaceDownCardIds: CardId[];
    swapBarFaceUpCardIds: CardId[];
} | {
    kind: "assign-thats-urz";
    turnOrder: PlayerId[];
    assignments?: Record<PlayerId, PlayerId>;
} | {
    kind: "validate-player-target";
    sourcePlayerId: PlayerId;
    targetPlayerId: PlayerId;
    hostile: boolean;
    allowsAlly?: boolean;
} | {
    kind: "record-priority-cycle";
    declaringPlayerId: PlayerId;
    passOrder: PlayerId[];
} | {
    kind: "assign-tournament-seed";
    priorityOrder: PlayerId[];
    poolCardIds: CardId[];
    preferences: Record<PlayerId, CardId[]>;
} | {
    kind: "intercept-generated-play";
    stackItemId: StackItemId;
    originalControllerId: PlayerId;
    interceptorId: PlayerId;
    replacementTargetIds: CardId[];
} | {
    kind: "partner-royal-marriage";
    initiatorId: PlayerId;
    allyId: PlayerId;
    kingCardId: CardId;
    queenCardId: CardId;
} | {
    kind: "resolve-team-endgame";
    kindOfCheck: "normal" | "sudden-death" | "exhausted";
    activePlayerId: PlayerId;
    activatorId?: PlayerId;
};
export type BattleRealmSpec = "Bravery" | "Balance" | "Beauty" | "Brilliance";
export type ReservedBattleRealmCombine = "bravery-three-clubs" | "balance-same-color-jqk" | "brilliance-two-spades";
export type Phase12Action = {
    kind: "configure-battle-realm";
    specs: Record<PlayerId, BattleRealmSpec>;
} | {
    kind: "recalculate-continuous-bonuses";
} | {
    kind: "validate-reserved-combine";
    combine: ReservedBattleRealmCombine;
    sourceCardIds: CardId[];
} | {
    kind: "apply-goal-delta";
    playerId: PlayerId;
    delta: number;
} | {
    kind: "grant-mini-turns";
    playerId: PlayerId;
    amount: number;
} | {
    kind: "register-limited-play";
    playerId: PlayerId;
    playClass: "ultra" | "rank10";
} | {
    kind: "courageous-assault";
    targetCardId: CardId;
} | {
    kind: "extra-lucky";
    drawnCardId: CardId;
    sourcePosition: "dp-top" | "dp-bottom" | "unavailable";
} | {
    kind: "mastermind";
    inspectedCardIds: CardId[];
    drawCardIds: CardId[];
    returnOrder: CardId[];
    viewerId?: PlayerId;
} | {
    kind: "counter-distortion";
    defendingPlayerId: PlayerId;
    jackControllerId: PlayerId;
    discardJackId?: CardId;
} | {
    kind: "goal-shock";
    enemyPlayerIds: PlayerId[];
} | {
    kind: "hard-jack";
    jackCardId: CardId;
    hostCardId: CardId;
} | {
    kind: "harmonized-mimic";
    drawnCardIds: CardId[];
    keepCardIds: CardId[];
} | {
    kind: "chromatic-ten";
    cardId: CardId;
    asSuit: "♣" | "♦" | "♠";
} | {
    kind: "preserve-intercepted-play";
    stackItemId: StackItemId;
    originalControllerId: PlayerId;
    interceptorId: PlayerId;
    replacementTargetIds: CardId[];
    preservedModifierKeys: string[];
} | {
    kind: "complete-full-turn";
    playerId: PlayerId;
};
export type Phase13Action = {
    kind: "configure-time-bomb";
} | {
    kind: "score-queen-as-bomb";
    playerId: PlayerId;
    cardId: CardId;
} | {
    kind: "queue-fuse-triggers";
    playerId: PlayerId;
} | {
    kind: "resolve-fuse";
    cardId: CardId;
    enemyDiscardChoices?: Record<PlayerId, CardId>;
} | {
    kind: "declare-defuse";
    targetCardId: CardId;
    costCardIds: CardId[];
    responseWindow: boolean;
    countered?: boolean;
    targetLegalAtResolution?: boolean;
} | {
    kind: "consume-action-phase-skip";
    playerId: PlayerId;
} | {
    kind: "enforce-forced-draw";
    playerId: PlayerId;
    declaredAction: "draw" | "pass" | "other";
    drawLegal: boolean;
    actionPhaseSkipped?: boolean;
} | {
    kind: "change-bomb-controller";
    cardId: CardId;
    controllerId: PlayerId;
} | {
    kind: "move-time-bomb";
    cardId: CardId;
    destination: ZoneName;
    controllerId?: PlayerId;
};
export type DeffySubMode = "classic" | "icu" | "soda" | "mystery-mix" | "deffy-moment";
export type Phase14Action = {
    kind: "configure-deffy";
    subMode: DeffySubMode;
    turnOrder: PlayerId[];
    targetHandSizes?: Record<PlayerId, number>;
    addOns?: Partial<{
        speedRun: boolean;
        thatsUrz: boolean;
        thirdPartied: boolean;
        mirrorMe: boolean;
    }>;
    assignments?: Record<PlayerId, PlayerId>;
} | {
    kind: "initialize-draft-pool";
    poolCardIds: CardId[];
    faceDownCardIds: CardId[];
} | {
    kind: "draft-pick";
    drafterId: PlayerId;
    cardId: CardId;
} | {
    kind: "speed-run-timeout";
    drafterId: PlayerId;
} | {
    kind: "refill-pool";
} | {
    kind: "complete-draft";
    leftoverDisposition?: "shuffle" | "scrap";
    unanimous?: boolean;
} | {
    kind: "mirror-me-pick";
    drafterId: PlayerId;
    cardId: CardId;
    mirrorCardId: CardId;
} | {
    kind: "validate-assignment";
    turnOrder: PlayerId[];
    assignments: Record<PlayerId, PlayerId>;
};
export type Phase15Action = {
    kind: "configure-tournament-seed";
    seedOrder: PlayerId[];
    enabledOptionalModules?: string[];
    eventSheetId?: string;
    approvedOptionalModules?: string[];
    alternateHighImpactPool?: string[];
} | {
    kind: "select-tournament-category";
    playerId: PlayerId;
    category: 1 | 2 | 3 | 4;
    cardId: CardId;
} | {
    kind: "resolve-high-impact";
    rankingsByPlayer: Record<PlayerId, string[]>;
    fallbackRankingsByPlayer?: Record<PlayerId, string[]>;
} | {
    kind: "finalize-tournament-seed";
} | {
    kind: "validate-tournament-scuttle";
    sourceCardId: CardId;
    targetCardId: CardId;
};
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
export type InteractionAction = {
    kind: "attempt-interaction";
    targetCardId: CardId;
    destination: ZoneName;
    profile: InteractionProfile;
    controllerId?: PlayerId;
} | {
    kind: "counter-stack";
    sourceCardIds: CardId[];
    authority: CounterAuthority;
    target: CounterTargetProfile;
} | {
    kind: "scuttle";
    sourceCardIds: CardId[];
    targetCardId: CardId;
    profile: ScuttleProfile;
} | {
    kind: "attach-jack-graph";
    sourceCardId: CardId;
    targetCardId: CardId;
    row: "pr" | "er";
} | {
    kind: "move-and-revalidate";
    cardId: CardId;
    destination: ZoneName;
    controllerId?: PlayerId;
} | {
    kind: "change-controller-and-revalidate";
    cardId: CardId;
    controllerId: PlayerId;
} | {
    kind: "revalidate-attachments";
};
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
    checkpoints: Array<{
        commandIndex: number;
        commandId: CommandId;
        accepted: boolean;
        eventStartIndex: number;
        eventEndIndex: number;
        eventRangeHash: string;
    }>;
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
    pendingObjects: {
        stackDepth: number;
        triggerQueueDepth: number;
        pendingDeclaration: boolean;
        priorityOpen: boolean;
    };
    privateFactsByViewer?: Record<PlayerId, unknown>;
}
export type ModuleKey = "first-contact" | "battle-realm" | "traps" | "multiplayer" | "deffy-mode" | "time-bomb" | "tournament-seed";
export type CompatibilityStatus = "compatible" | "compatible-with-rule" | "requires-event-approval" | "prohibited";
export interface ModuleCompatibilityResult {
    status: CompatibilityStatus;
    reason: string;
    ruleRefs: string[];
}
export type Phase20Action = {
    kind: "resolve-super-seven-single";
    sourceCardIds: [CardId, CardId];
    childCardId: CardId;
} | {
    kind: "resolve-super-five";
    sourceCardIds: [CardId, CardId];
    chosenCardId: CardId;
    disposition: "points" | "effect";
} | {
    kind: "consume-skipped-turn-slot";
};
export interface FixtureExpectation {
    accepted?: boolean[];
    finalStateHash?: string;
    final: {
        zones?: Partial<GlobalZones>;
        hands?: Record<PlayerId, CardId[]>;
        playerZones?: Record<PlayerId, {
            hand?: CardId[];
            pr?: CardId[];
            er?: CardId[];
        }>;
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
