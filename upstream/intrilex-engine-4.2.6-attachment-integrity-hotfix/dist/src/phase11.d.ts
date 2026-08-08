import type { CardId, EngineState, Phase11Action, PlayerId } from "./types.js";
export type MultiplayerMode = "ffa-3" | "teams-4";
export interface Phase11Runtime {
    mode: MultiplayerMode | null;
    teamByPlayer: Record<PlayerId, string | null>;
    swapBarLayout: {
        capacity: number;
        faceDownCardIds: CardId[];
        faceUpCardIds: CardId[];
    } | null;
    thatsUrzAssignments: Record<PlayerId, PlayerId>;
    tournamentSeedAssignments: Record<PlayerId, CardId>;
    lastTargetEvaluation: {
        sourcePlayerId: PlayerId;
        targetPlayerId: PlayerId;
        relation: "self" | "ally" | "enemy";
        legal: boolean;
    } | null;
    winningTeamId: string | null;
    lastTeamTotals: Record<string, {
        anchors: number;
        points: number;
    }>;
}
export interface Phase11EventSpec {
    type: string;
    payload: Record<string, unknown>;
    visibility?: "public" | "private" | "authorized";
}
export type Phase11Resolution = {
    ok: true;
    state: EngineState;
    events: Phase11EventSpec[];
} | {
    ok: false;
    code: string;
    message: string;
    details?: unknown;
};
export declare function phase11Runtime(state: EngineState): Phase11Runtime;
export declare function relationBetween(state: EngineState, sourcePlayerId: PlayerId, targetPlayerId: PlayerId): "self" | "ally" | "enemy";
export declare function areAllies(state: EngineState, a: PlayerId, b: PlayerId): boolean;
export declare function areEnemies(state: EngineState, a: PlayerId, b: PlayerId): boolean;
export declare function validateMultiplayerTarget(state: EngineState, sourcePlayerId: PlayerId, targetPlayerId: PlayerId, hostile: boolean, allowsAlly?: boolean): string | null;
export declare function nextPlayerAssignments(turnOrder: PlayerId[]): Record<PlayerId, PlayerId>;
export declare function expectedPriorityOrder(turnOrder: PlayerId[], declaringPlayerId: PlayerId): PlayerId[];
export declare function swapBarShape(playerCount: number): {
    capacity: number;
    faceDown: number;
    faceUp: number;
};
export declare function teamTotals(state: EngineState): Record<string, {
    anchors: number;
    points: number;
}>;
export declare function resolvePhase11Action(input: EngineState, actorId: PlayerId, action: Phase11Action): Phase11Resolution;
