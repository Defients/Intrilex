import type { EngineState, Phase20Action, PlayerId } from "./types.js";
export interface Phase20EventSpec {
    type: string;
    payload: Record<string, unknown>;
    visibility?: "public" | "private" | "authorized";
}
export type Phase20Resolution = {
    ok: true;
    state: EngineState;
    events: Phase20EventSpec[];
} | {
    ok: false;
    code: string;
    message: string;
    details?: unknown;
};
export declare function resolvePhase20Action(input: EngineState, actorId: PlayerId, action: Phase20Action): Phase20Resolution;
