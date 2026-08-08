import type { CertifiedReplayEnvelope, EngineCommand, EngineEvent, EngineState, PublicCertifiedReplayEnvelope, RngState } from "./types.js";
export declare const PHASE16_ENGINE_VERSION = "4.1.0";
export declare function createCertifiedReplay(fixtureId: string, initialState: EngineState, commands: EngineCommand[], engineVersion?: string): CertifiedReplayEnvelope;
export declare function verifyCertifiedReplay(replay: CertifiedReplayEnvelope): {
    state: EngineState;
    events: EngineEvent[];
    accepted: boolean[];
};
export declare function publicCertifiedReplayView(replay: CertifiedReplayEnvelope): PublicCertifiedReplayEnvelope;
export declare function serializeCertifiedReplay(replay: CertifiedReplayEnvelope): string;
export declare function parseCertifiedReplay(text: string): CertifiedReplayEnvelope;
export interface RngVector {
    name: string;
    seed: number;
    cursor: number;
    draws: number;
    lengths: number[];
    expectedUint32: number[];
    expectedIndices: number[];
}
export declare function runRngVector(vector: RngVector): {
    uint32: number[];
    indices: number[];
    final: RngState;
};
