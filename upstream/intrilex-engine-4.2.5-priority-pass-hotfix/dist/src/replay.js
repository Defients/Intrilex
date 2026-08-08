import { canonicalize, canonicalClone } from "./canonical-json.js";
import { IntrilexEngine } from "./engine.js";
import { EngineError } from "./errors.js";
import { hashCanonical, sha256Text } from "./hash.js";
import { assertValidState } from "./validation.js";
export function runCommands(initialState, commands) {
    const engine = new IntrilexEngine();
    let state = canonicalClone(initialState);
    const events = [];
    const accepted = [];
    for (const command of commands) {
        const result = engine.execute(state, command);
        accepted.push(result.accepted);
        events.push(...result.events);
        state = result.state;
    }
    assertValidState(state);
    return { state, events, accepted };
}
export function createReplay(fixtureId, initialState, commands, result) {
    return {
        format: "intrilex-replay",
        version: 1,
        rulesVersion: "4.1",
        fixtureId,
        initialState: canonicalClone(initialState),
        commands: canonicalClone(commands),
        events: canonicalClone(result.events),
        initialStateHash: hashCanonical(initialState),
        finalStateHash: hashCanonical(result.state),
        eventLogHash: sha256Text(canonicalize(result.events))
    };
}
export function replayAndVerify(replay) {
    if (replay.format !== "intrilex-replay" || replay.version !== 1 || replay.rulesVersion !== "4.1") {
        throw new EngineError("REPLAY_FORMAT", "Unsupported replay envelope");
    }
    if (hashCanonical(replay.initialState) !== replay.initialStateHash)
        throw new EngineError("REPLAY_INITIAL_HASH", "Initial state hash mismatch");
    const result = runCommands(replay.initialState, replay.commands);
    if (hashCanonical(result.state) !== replay.finalStateHash)
        throw new EngineError("REPLAY_FINAL_HASH", "Final state hash mismatch");
    if (sha256Text(canonicalize(result.events)) !== replay.eventLogHash)
        throw new EngineError("REPLAY_EVENT_HASH", "Event log hash mismatch");
    if (canonicalize(result.events) !== canonicalize(replay.events))
        throw new EngineError("REPLAY_EVENTS", "Replayed events differ from recorded events");
    return result;
}
//# sourceMappingURL=replay.js.map