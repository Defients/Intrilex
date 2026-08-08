import type { EngineState, FirstContactAction, FirstContactDeclarationClass, FirstContactOptionalModule, PlayerId, Visibility } from "./types.js";
type OptionalModule = FirstContactOptionalModule;
export interface FirstContactProfile {
    id: "first-contact";
    goal: 15;
    playerCount: 2;
    miniTurnsPerCompletedFullTurn: 1;
    allowedActions: readonly ["draw", "play-for-points", "play-for-effect", "scuttle", "pass"];
    disabledSystems: readonly string[];
    allowedGenericRanks: readonly string[];
}
export declare const FIRST_CONTACT_PROFILE: FirstContactProfile;
export interface FirstContactRuntime {
    active: true;
    profileId: "first-contact";
    teachingOverrideId: string | null;
    allowedActions: string[];
    disabledSystems: string[];
}
export interface Phase9EventSpec {
    type: string;
    payload: Record<string, unknown>;
    visibility?: Visibility;
}
export type Phase9Resolution = {
    ok: true;
    state: EngineState;
    events: Phase9EventSpec[];
} | {
    ok: false;
    code: string;
    message: string;
    details?: unknown;
};
export declare function isFirstContact(state: EngineState): boolean;
export declare function validateFirstContactConfiguration(enabledModules: OptionalModule[], teachingOverrideId?: string): string | null;
export declare function validateFirstContactDeclaration(declarationClass: FirstContactDeclarationClass, rank?: string, effectKey?: string): string | null;
export declare function resolvePhase9Action(input: EngineState, actorId: PlayerId, action: FirstContactAction): Phase9Resolution;
export {};
