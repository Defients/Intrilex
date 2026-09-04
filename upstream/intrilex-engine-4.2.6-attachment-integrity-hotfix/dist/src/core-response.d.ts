import type { CoreFoundationActionType, CorePrimaryAction, CoreResponseKind, CoreStackPayload, EngineState, PlayerId, StackItem } from "./types.js";
export declare const CORE_RESPONSE_AUTHORITY_PROFILE: Readonly<{
    id: "core-response-authority";
    displayName: "Core Response Authority — Quick, Instant & Counter Stack";
    rulesVersion: "4.1";
    engineVersion: "4.2.2";
    playerCount: 2;
    enabledModules: readonly [];
    supportedRootActions: readonly ["draw", "face-up-swap", "play-for-points", "play-for-effect", "scuttle", "exhausted-pass"];
    supportedResponses: readonly ["A-base-counter", "A-anchor-counter", "A-spade-exile-counter", "8-scuttle-counter", "8-spade-free-scuttle", "8-aegis-field-quick", "9-tap", "J-disrupt", "Q-aegis-quick", "K-anchor-counter"];
    excludedSystems: readonly ["private-choice-effects", "two-quick", "four-natural-quick", "six-swap-peek-quick", "nine-goal-shift", "rank10-interrupt", "supers", "ultras", "voltage", "royal-marriage", "optional-modules", "multiplayer"];
    rationale: "Engine-owned Core priority circulation and audited public Quick/Instant responses. Private-choice and advanced multi-card timing remains fail-closed.";
}>;
export declare function isCoreResponseProfile(state: Readonly<EngineState>): boolean;
export declare function primaryDescriptor(action: CorePrimaryAction): {
    actionType: CoreFoundationActionType;
    stackClass: Extract<CoreStackPayload, {
        kind: "primary";
    }>["stackClass"];
};
export declare function currentPriorityActor(state: Readonly<EngineState>): PlayerId | null;
export declare function currentCoreStackTarget(state: Readonly<EngineState>): StackItem | null;
/**
 * Declaration class for a primary stack payload.
 * Maps the existing `stackClass` to a finer-grained classification
 * that the counter authority matrix can reason about.
 */
export type DeclarationClass = "draw" | "swap" | "points" | "ordinary-effect" | "anchor" | "scuttle" | "pass" | "super" | "ultra" | "royal-marriage" | "queens-court" | "rank10" | "voltage";
/**
 * Derive the declaration class of a primary stack payload.
 * For response payloads, returns null (responses are counters, not
 * declarable plays — counter-counter chains are handled separately).
 */
export declare function declarationClassOf(payload: CoreStackPayload): DeclarationClass | null;
/**
 * Counter authority matrix: maps each counter kind to the set of
 * declaration classes it is authorized to counter (for primary targets).
 *
 * Counters not listed here (super-ace-counter, ultra-three-red, jack-disrupt,
 * nine-tap, eight-spade-free-scuttle, eight-aegis-field, queen-aegis-quick,
 * board-lock-quick) have special handling:
 * - super-ace-counter / ultra-three-red: can counter any target (Queen defense
 *   check is separate).
 * - jack-disrupt: can counter any opponent primary mini-turn action.
 * - nine-tap / eight-spade-free-scuttle: target PR cards, not stack items.
 * - eight-aegis-field / queen-aegis-quick / board-lock-quick: Quick effects,
 *   not stack counters.
 */
export declare const COUNTER_AUTHORITY_MATRIX: Partial<Record<CoreResponseKind, DeclarationClass[]>>;
/**
 * Check whether a counter kind is authorized to target a stack item
 * based on the declaration-class × counter-authority matrix.
 *
 * This replaces the ad hoc `targetAcceptsBaseAce` and `targetAcceptsSpadeAce`
 * functions with a centralized, data-driven check.
 */
export declare function targetAcceptsCounter(target: StackItem, counterKind: CoreResponseKind): boolean;
