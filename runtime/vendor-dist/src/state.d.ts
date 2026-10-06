import type { CardId, EngineState, PlayerId, PlayerState, ZoneName } from "./types.js";
export declare function createPlayer(id: PlayerId, goal?: number): PlayerState;
export declare function createEmptyState(playerIds?: PlayerId[]): EngineState;
export declare function zoneList(state: EngineState, zone: ZoneName): CardId[];
export declare function removeFromCurrentZone(state: EngineState, cardId: CardId): void;
export declare function moveCard(state: EngineState, cardId: CardId, destination: ZoneName, controllerId?: PlayerId): ZoneName;
export declare function addCard(state: EngineState, card: {
    id: CardId;
    identity: string;
    originalOwnerId: PlayerId;
    controllerId?: PlayerId;
    zone: ZoneName;
    state?: Record<string, unknown>;
}): void;
export declare function deriveSecuredPoints(state: EngineState, playerId: PlayerId): number;
