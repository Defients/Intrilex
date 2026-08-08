import type { CardInstance, EngineState, PlayerId, StartEventRef, TapState, ZoneName } from "./types.js";
export interface LifecycleTransition {
    type: string;
    payload: Record<string, unknown>;
}
export declare function isHandZone(zone: ZoneName): boolean;
export declare function isOttZone(zone: ZoneName): boolean;
export declare function hasAegis(card: CardInstance): boolean;
export declare function startRefEqual(a: StartEventRef, b: StartEventRef): boolean;
export declare function resolveDestination(card: CardInstance, requested: ZoneName): ZoneName;
export declare function cleanupForZoneTransition(card: CardInstance, from: ZoneName, to: ZoneName): void;
export declare function canReceiveAegis(card: CardInstance): boolean;
export declare function applyAegis(card: CardInstance, sourceRef: string, expiresAt: StartEventRef): boolean;
export declare function applyTap(card: CardInstance, tapState: TapState): void;
export declare function clearTap(card: CardInstance): void;
export declare function revealUntilStart(card: CardInstance, expiresAt: StartEventRef): void;
export declare function markPlayedForEffect(card: CardInstance, value: boolean): void;
export declare function markExileBound(card: CardInstance): void;
export declare function changeController(card: CardInstance, controllerId: PlayerId): void;
export declare function processStartPhaseLifecycles(state: EngineState, playerId: PlayerId): LifecycleTransition[];
export declare function releaseNineTapsForScoring(state: EngineState, scoringPlayerId: PlayerId): LifecycleTransition[];
