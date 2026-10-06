import type { CardInstance, EngineState, PlayerId, RankAction } from "./types.js";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "RJ" | "BJ";
export type Suit = "♣" | "♦" | "♥" | "♠";
export interface RankDefinition {
    rank: Rank;
    prPoints: number;
    scuttleOrder: number;
    modes: readonly string[];
    prScuttleImmune?: boolean;
    prEffectTargetImmune?: boolean;
    notes: readonly string[];
}
export declare const RANK_REGISTRY: Readonly<Record<Rank, RankDefinition>>;
export interface ParsedIdentity {
    rank: Rank;
    suit: Suit | null;
}
export interface RankEventSpec {
    type: string;
    payload: Record<string, unknown>;
}
export type RankResolution = {
    ok: true;
    state: EngineState;
    events: RankEventSpec[];
} | {
    ok: false;
    code: string;
    message: string;
    details?: unknown;
};
export declare function parseIdentity(identity: string): ParsedIdentity | null;
export declare function rankDefinition(cardOrIdentity: CardInstance | string): RankDefinition;
export declare function allRankDefinitions(): RankDefinition[];
export declare function cardPointValue(card: CardInstance): number;
export declare function hasOrdinaryScuttleImmunity(card: CardInstance): boolean;
export declare function compareScuttle(source: CardInstance, target: CardInstance): number;
export declare function resolveRankAction(input: EngineState, actorId: PlayerId, action: RankAction): RankResolution;
