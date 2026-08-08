import type { CardId, CardInstance, CounterAuthority, CounterEvaluation, CounterTargetProfile, EngineState, InteractionAction, InteractionProfile, PlayerId, ProtectionEvaluation } from "./types.js";
export interface InteractionEventSpec {
    type: string;
    payload: Record<string, unknown>;
}
export type InteractionResolution = {
    ok: true;
    state: EngineState;
    events: InteractionEventSpec[];
} | {
    ok: false;
    code: string;
    message: string;
    details?: unknown;
};
export declare function guardProviderIds(state: EngineState, target: CardInstance): CardId[];
export declare function evaluateProtection(state: EngineState, actorId: PlayerId, targetCardId: CardId, profile: InteractionProfile): ProtectionEvaluation;
export declare function evaluateCounterAuthority(state: EngineState, actorId: PlayerId, authority: CounterAuthority, target: CounterTargetProfile): CounterEvaluation;
export interface RevalidationContext {
    preserveHostDestinationIds?: ReadonlySet<CardId>;
    preserveHostControllerIds?: ReadonlySet<CardId>;
}
export declare function revalidateAttachments(state: EngineState, context?: RevalidationContext): InteractionEventSpec[];
export declare function resolveInteractionAction(input: EngineState, actorId: PlayerId, action: InteractionAction): InteractionResolution;
