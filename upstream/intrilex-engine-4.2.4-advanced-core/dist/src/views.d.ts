import type { EngineEvent, EngineState, PlayerId, ReplayEnvelope } from "./types.js";
export interface PublicCardView {
    id: string;
    identity?: string;
    originalOwnerId: PlayerId;
    controllerId: PlayerId;
    zone: string;
    state: Record<string, unknown>;
}
export declare function publicStateView(state: EngineState): unknown;
export declare function privateStateView(state: EngineState, viewerId: PlayerId): unknown;
export declare function publicEventView(events: EngineEvent[]): EngineEvent[];
export declare function publicReplayView(replay: ReplayEnvelope): Omit<ReplayEnvelope, "initialState" | "commands" | "events"> & {
    initialState: unknown;
    commands: unknown[];
    events: EngineEvent[];
};
