import type { CardId, EngineState, Phase15Action, PlayerId } from "./types.js";
export declare const TOURNAMENT_SEED_BAN_IDENTITIES: readonly ["BJ", "10♥", "8♠", "9♠", "10♣", "Q♠", "J♠", "4♠"];
export declare const CANONICAL_HIGH_IMPACT_POOL: readonly ["A♣", "A♠", "3♠", "5♠", "6♠", "7♠", "8♥", "9♥", "10♦", "10♠", "Q♣", "K♣", "K♠"];
export declare const TOURNAMENT_SEED_DISABLED_SYSTEMS: readonly ["trap", "time-bomb", "ultra-counter-resistant-gy-rider", "reserved-star", "reserved-sparkle", "volatility-icons"];
export type TournamentSeedCategory = 1 | 2 | 3 | 4 | 5 | 6;
export interface TournamentSeedSelection {
    category1?: CardId;
    category2?: CardId;
    category3?: CardId;
    category4?: CardId;
    category5?: CardId;
    category6?: CardId;
}
export interface Phase15Runtime {
    enabled: boolean;
    status: "unconfigured" | "selecting" | "complete";
    seedOrder: PlayerId[];
    eventSheetId: string | null;
    approvedOptionalModules: string[];
    activeHighImpactPool: string[];
    banPileCardIds: CardId[];
    selectionsByPlayer: Record<PlayerId, TournamentSeedSelection>;
    categoryPriority: Record<string, PlayerId[]>;
    highImpactRankings: Record<PlayerId, string[]>;
    highImpactAssignments: Record<PlayerId, CardId>;
    rngAudit: Array<{
        operation: string;
        cursorBefore: number;
        cursorAfter: number;
    }>;
    compatibilityAlias: {
        officialSourceId: "CT-063";
        executableFixtureId: "CT-063@TOURNAMENT-SEED";
    };
    lastResolution: Record<string, unknown> | null;
}
export interface Phase15EventSpec {
    type: string;
    payload: Record<string, unknown>;
    visibility?: "public" | "private" | "authorized";
}
export type Phase15Resolution = {
    ok: true;
    state: EngineState;
    events: Phase15EventSpec[];
} | {
    ok: false;
    code: string;
    message: string;
    details?: unknown;
};
export declare function phase15Runtime(state: EngineState): Phase15Runtime;
export declare function validateTournamentSeedPool(pool: readonly string[], playerCount: number): string | null;
export declare function validateTournamentSeedConfiguration(enabledOptionalModules: readonly string[], eventSheetId?: string, approvedOptionalModules?: readonly string[]): string | null;
export declare function tournamentSeedScuttleLegality(state: EngineState, actorId: PlayerId, sourceCardId: CardId, targetCardId: CardId): {
    legal: boolean;
    reason: string | null;
};
export declare function resolvePhase15Action(input: EngineState, actorId: PlayerId, action: Phase15Action): Phase15Resolution;
