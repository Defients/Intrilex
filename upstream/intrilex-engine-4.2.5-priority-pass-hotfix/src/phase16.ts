import { canonicalClone, canonicalize } from "./canonical-json.js";
import { IntrilexEngine } from "./engine.js";
import { EngineError } from "./errors.js";
import { hashCanonical, sha256Text } from "./hash.js";
import { publicEventView, publicStateView } from "./views.js";
import type {
  CertifiedReplayEnvelope,
  EngineCommand,
  EngineEvent,
  EngineState,
  PublicCertifiedReplayEnvelope,
  ReplayCommandCheckpoint,
  RngState
} from "./types.js";

export const PHASE16_ENGINE_VERSION = "4.1.0";

function cloneRng(rng: RngState): RngState {
  return { algorithm: "xorshift32", seed: rng.seed >>> 0, cursor: rng.cursor };
}

function checkpointRngTrace(checkpoints: ReplayCommandCheckpoint[]): unknown {
  return checkpoints.map((checkpoint) => ({
    commandIndex: checkpoint.commandIndex,
    commandId: checkpoint.commandId,
    before: checkpoint.rngBefore,
    after: checkpoint.rngAfter
  }));
}

function certifiedContent(envelope: Omit<CertifiedReplayEnvelope, "contentHash" | "integrityHash">): unknown {
  return envelope;
}

export function createCertifiedReplay(fixtureId: string, initialState: EngineState, commands: EngineCommand[], engineVersion = PHASE16_ENGINE_VERSION): CertifiedReplayEnvelope {
  const engine = new IntrilexEngine();
  let state = canonicalClone(initialState);
  const events: EngineEvent[] = [];
  const accepted: boolean[] = [];
  const checkpoints: ReplayCommandCheckpoint[] = [];

  commands.forEach((command, commandIndex) => {
    const revisionBefore = state.revision;
    const stateHashBefore = hashCanonical(state);
    const rngBefore = cloneRng(state.rng);
    const eventStartIndex = events.length;
    const result = engine.execute(state, command);
    accepted.push(result.accepted);
    events.push(...result.events);
    state = result.state;
    const eventEndIndex = events.length;
    const range = events.slice(eventStartIndex, eventEndIndex);
    checkpoints.push({
      commandIndex,
      commandId: command.id,
      accepted: result.accepted,
      revisionBefore,
      revisionAfter: state.revision,
      stateHashBefore,
      stateHashAfter: hashCanonical(state),
      eventStartIndex,
      eventEndIndex,
      eventRangeHash: sha256Text(canonicalize(range)),
      rngBefore,
      rngAfter: cloneRng(state.rng)
    });
  });

  const base: Omit<CertifiedReplayEnvelope, "contentHash" | "integrityHash"> = {
    format: "intrilex-replay",
    version: 2,
    codec: "canonical-json-v1",
    rulesVersion: "4.1",
    engineVersion,
    fixtureId,
    initialState: canonicalClone(initialState),
    commands: canonicalClone(commands),
    accepted,
    events: canonicalClone(events),
    checkpoints: canonicalClone(checkpoints),
    initialStateHash: hashCanonical(initialState),
    finalStateHash: hashCanonical(state),
    eventLogHash: sha256Text(canonicalize(events)),
    checkpointLogHash: sha256Text(canonicalize(checkpoints)),
    rngTraceHash: sha256Text(canonicalize(checkpointRngTrace(checkpoints)))
  };
  const contentHash = hashCanonical(certifiedContent(base));
  return { ...base, contentHash, integrityHash: sha256Text(`intrilex-certified-replay-v2:${contentHash}`) };
}

export function verifyCertifiedReplay(replay: CertifiedReplayEnvelope): { state: EngineState; events: EngineEvent[]; accepted: boolean[] } {
  if (replay.format !== "intrilex-replay" || replay.version !== 2 || replay.codec !== "canonical-json-v1" || replay.rulesVersion !== "4.1") {
    throw new EngineError("REPLAY_FORMAT", "Unsupported certified replay envelope");
  }
  const { contentHash, integrityHash, ...base } = replay;
  const expectedContentHash = hashCanonical(certifiedContent(base));
  if (contentHash !== expectedContentHash) throw new EngineError("REPLAY_CONTENT_HASH", "Certified replay content hash mismatch");
  if (integrityHash !== sha256Text(`intrilex-certified-replay-v2:${contentHash}`)) throw new EngineError("REPLAY_INTEGRITY_HASH", "Certified replay integrity hash mismatch");
  if (hashCanonical(replay.initialState) !== replay.initialStateHash) throw new EngineError("REPLAY_INITIAL_HASH", "Initial state hash mismatch");

  const rebuilt = createCertifiedReplay(replay.fixtureId, replay.initialState, replay.commands, replay.engineVersion);
  const exactFields: Array<keyof CertifiedReplayEnvelope> = [
    "accepted", "events", "checkpoints", "initialStateHash", "finalStateHash", "eventLogHash",
    "checkpointLogHash", "rngTraceHash", "contentHash", "integrityHash"
  ];
  for (const field of exactFields) {
    if (canonicalize(rebuilt[field]) !== canonicalize(replay[field])) throw new EngineError("REPLAY_MISMATCH", `Certified replay mismatch at ${String(field)}`);
  }
  return { state: runFinalState(replay.initialState, replay.commands), events: rebuilt.events, accepted: rebuilt.accepted };
}

function runFinalState(initialState: EngineState, commands: EngineCommand[]): EngineState {
  const engine = new IntrilexEngine();
  let state = canonicalClone(initialState);
  for (const command of commands) state = engine.execute(state, command).state;
  return state;
}

function redactCommand(command: EngineCommand): unknown {
  if (command.type === "HIDDEN_CHOICE") {
    return { id: command.id, type: command.type, actorId: command.actorId, choiceId: command.choiceId, payload: { redacted: true }, visibility: command.visibility };
  }
  if (command.type === "RESOLVE_PHASE9_ACTION" && command.action.kind === "autonomy-submit-private-choice") {
    return {
      id: command.id,
      type: command.type,
      actorId: command.actorId,
      action: {
        kind: command.action.kind,
        token: "REDACTED",
        submission: { kind: command.action.submission.kind, redacted: true }
      }
    };
  }
  if (command.type === "RESOLVE_CORE_AUTHORITY_ACTION" && command.action.kind === "core-submit-private-choice") {
    return {
      id: command.id,
      type: command.type,
      actorId: command.actorId,
      action: {
        kind: command.action.kind,
        token: "REDACTED",
        submission: { kind: command.action.submission.kind, redacted: true }
      }
    };
  }
  return canonicalClone(command);
}

export function publicCertifiedReplayView(replay: CertifiedReplayEnvelope): PublicCertifiedReplayEnvelope {
  const events = publicEventView(replay.events);
  const projection: Omit<PublicCertifiedReplayEnvelope, "publicContentHash"> = {
    format: "intrilex-public-replay",
    version: 2,
    codec: "canonical-json-v1",
    rulesVersion: "4.1",
    engineVersion: replay.engineVersion,
    fixtureId: replay.fixtureId,
    initialState: publicStateView(replay.initialState),
    commands: replay.commands.map(redactCommand),
    accepted: [...replay.accepted],
    events,
    checkpoints: replay.checkpoints.map((checkpoint) => ({
      commandIndex: checkpoint.commandIndex,
      commandId: checkpoint.commandId,
      accepted: checkpoint.accepted,
      eventStartIndex: checkpoint.eventStartIndex,
      eventEndIndex: checkpoint.eventEndIndex,
      eventRangeHash: sha256Text(canonicalize(events.slice(checkpoint.eventStartIndex, checkpoint.eventEndIndex)))
    })),
    publicEventLogHash: sha256Text(canonicalize(events))
  };
  return { ...projection, publicContentHash: hashCanonical(projection) };
}

export function serializeCertifiedReplay(replay: CertifiedReplayEnvelope): string {
  return canonicalize(replay);
}

export function parseCertifiedReplay(text: string): CertifiedReplayEnvelope {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch (error) { throw new EngineError("REPLAY_PARSE", "Replay is not valid JSON", error instanceof Error ? error.message : String(error)); }
  if (typeof parsed !== "object" || parsed === null) throw new EngineError("REPLAY_PARSE", "Replay root must be an object");
  const replay = parsed as CertifiedReplayEnvelope;
  verifyCertifiedReplay(replay);
  if (serializeCertifiedReplay(replay) !== canonicalize(JSON.parse(text))) throw new EngineError("REPLAY_CANONICAL", "Replay does not round-trip canonically");
  return replay;
}

export interface RngVector {
  name: string;
  seed: number;
  cursor: number;
  draws: number;
  lengths: number[];
  expectedUint32: number[];
  expectedIndices: number[];
}

export function runRngVector(vector: RngVector): { uint32: number[]; indices: number[]; final: RngState } {
  // Imported lazily by static code to keep this module observational.
  const state: RngState = { algorithm: "xorshift32", seed: vector.seed >>> 0, cursor: vector.cursor };
  const uint32: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < vector.draws; i += 1) {
    let x = state.seed >>> 0;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    state.seed = x >>> 0; state.cursor += 1; uint32.push(state.seed);
  }
  for (const length of vector.lengths) {
    if (!Number.isInteger(length) || length <= 0) throw new RangeError("length must be a positive integer");
    let x = state.seed >>> 0;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    state.seed = x >>> 0; state.cursor += 1; indices.push(state.seed % length);
  }
  return { uint32, indices, final: state };
}
