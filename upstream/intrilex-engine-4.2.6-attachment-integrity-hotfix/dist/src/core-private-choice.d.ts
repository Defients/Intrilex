import type { CardId, CoreEffectAction, CorePrivateChoiceState, CorePrivateChoiceSubmission, CorePrimaryAction, EngineState, PlayerId, Visibility } from "./types.js";
export declare const CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE: Readonly<{
    id: "core-private-choice-authority";
    displayName: "Core Private Choice Authority — Sealed Hidden Decisions";
    rulesVersion: "4.1";
    engineVersion: "4.2.3";
    playerCount: 2;
    enabledModules: readonly [];
    supportedChoices: readonly ["3-present-take", "3-force-discard", "5-recycle-rummage", "6-deep-dig", "7-topdeck-casting", "9-anchor-discard"];
    excludedSystems: readonly ["two-quick", "four-natural-quick", "six-swap-peek-quick", "three-spade-enhancement", "five-suit-exile-access", "six-spade-deep-draw", "seven-spade-enhancement", "supers", "rank10", "voltage", "ultras", "royal-marriage", "optional-modules", "multiplayer"];
    rationale: "Engine-owned sealed continuation layer for ordinary Core hidden-choice effects. Quick/private suit enhancements and advanced Core families fail closed.";
}>;
export interface CorePrivateChoiceTransition {
    ok: true;
    state: EngineState;
    events: {
        type: string;
        payload: Record<string, unknown>;
        visibility?: Visibility;
    }[];
    generatedPrimary?: CorePrimaryAction;
}
export interface CorePrivateChoiceFailure {
    ok: false;
    code: string;
    message: string;
    details?: unknown;
}
export declare function isCorePrivateChoiceProfile(state: Readonly<EngineState>): boolean;
export declare function activeCorePrivateChoice(state: Readonly<EngineState>): CorePrivateChoiceState | null;
export declare function beginChoice(state: EngineState, input: Omit<CorePrivateChoiceState, "schemaVersion" | "choiceId" | "token" | "createdRevision" | "optionsHash">, events: CorePrivateChoiceTransition["events"]): CorePrivateChoiceState;
export declare function isCorePrivateChoiceEffect(effect: CoreEffectAction): boolean;
export declare function resolveCorePrivateChoiceRoot(input: EngineState, actorId: PlayerId, effect: CoreEffectAction): CorePrivateChoiceTransition | CorePrivateChoiceFailure;
export declare function generatedCoreEffectCandidates(state: Readonly<EngineState>, actorId: PlayerId, cardId: CardId): CoreEffectAction[];
export declare function resolveCorePrivateChoiceSubmission(input: EngineState, actorId: PlayerId, token: string, submission: CorePrivateChoiceSubmission): CorePrivateChoiceTransition | CorePrivateChoiceFailure;
