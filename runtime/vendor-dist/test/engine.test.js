import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { addCard, canonicalize, createEmptyState, deriveSecuredPoints, FIRST_CONTACT_PROFILE, hashCanonical, IntrilexEngine, loadFixtures, publicReplayView, replayAndVerify, runCommands, createReplay, roundTripState, validateState } from "../src/index.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixturePath = path.join(root, "fixtures", "phase2-4-conformance.json");
const lifecycleFixturePath = path.join(root, "fixtures", "phase5-lifecycle-conformance.json");
async function fixtures() {
    return loadFixtures(fixturePath);
}
test("empty state is valid and round-trips canonically", () => {
    const state = createEmptyState();
    assert.deepEqual(validateState(state), []);
    assert.equal(canonicalize(roundTripState(state)), canonicalize(state));
});
test("illegal declaration is byte-equivalent after rewind", async () => {
    const fixture = (await fixtures()).find((entry) => entry.id === "CT-026");
    assert.ok(fixture);
    const before = hashCanonical(fixture.initialState);
    const result = new IntrilexEngine().execute(fixture.initialState, fixture.commands[0]);
    assert.equal(result.accepted, false);
    assert.equal(hashCanonical(result.state), before);
    assert.equal(result.events.length, 0);
});
test("fixture corpus contains exactly the phase 2-4 gate", async () => {
    const ids = (await fixtures()).map((fixture) => fixture.id);
    assert.deepEqual(ids, ["CT-006", "CT-007", "CT-008", "CT-009", "CT-010", "CT-011", "CT-026", "CT-027", "CT-028", "CT-029", "CT-030", "CT-031", "CT-032", "CT-043", "CT-044", "CT-045", "CT-046", "CT-047", "CT-048", "CT-049", "CT-050", "CT-120"]);
});
test("every fixture deterministically replays", async () => {
    for (const fixture of await fixtures()) {
        const first = runCommands(fixture.initialState, fixture.commands);
        const second = runCommands(fixture.initialState, fixture.commands);
        assert.equal(canonicalize(first), canonicalize(second), fixture.id);
        const replay = createReplay(fixture.id, fixture.initialState, fixture.commands, first);
        const replayed = replayAndVerify(replay);
        assert.equal(hashCanonical(replayed.state), replay.finalStateHash, fixture.id);
    }
});
test("CT-120 public replay redacts hidden choice and identities", async () => {
    const fixture = (await fixtures()).find((entry) => entry.id === "CT-120");
    assert.ok(fixture);
    const result = runCommands(fixture.initialState, fixture.commands);
    const replay = createReplay(fixture.id, fixture.initialState, fixture.commands, result);
    const publicText = canonicalize(publicReplayView(replay));
    assert.doesNotMatch(publicText, /selectedCardId/);
    assert.doesNotMatch(publicText, /A♠|K♣/);
    assert.match(publicText, /redacted/);
});
test("fixture file is valid JSON without replacement characters", async () => {
    const text = await readFile(fixturePath, "utf8");
    assert.doesNotMatch(text, /�/);
    assert.doesNotThrow(() => JSON.parse(text));
});
async function lifecycleFixtures() {
    return loadFixtures(lifecycleFixturePath);
}
function finalOf(fixture) {
    return runCommands(fixture.initialState, fixture.commands).state;
}
test("fixture corpus contains exactly the Phase 5 lifecycle gate", async () => {
    const ids = (await lifecycleFixtures()).map((fixture) => fixture.id);
    assert.deepEqual(ids, ["CT-025", "CT-036", "CT-037", "CT-038", "CT-051", "CT-052", "CT-053", "CT-054"]);
});
test("every Phase 5 lifecycle fixture deterministically replays", async () => {
    for (const fixture of await lifecycleFixtures()) {
        const first = runCommands(fixture.initialState, fixture.commands);
        const second = runCommands(fixture.initialState, fixture.commands);
        assert.equal(canonicalize(first), canonicalize(second), fixture.id);
        const replay = createReplay(fixture.id, fixture.initialState, fixture.commands, first);
        assert.equal(hashCanonical(replayAndVerify(replay).state), replay.finalStateHash, fixture.id);
    }
});
test("CT-025 Start-based Tap expiry does not follow controller", async () => {
    const fixture = (await lifecycleFixtures()).find((entry) => entry.id === "CT-025");
    assert.ok(fixture);
    const state = finalOf(fixture);
    assert.equal(state.cards["CT025-C1"]?.controllerId, "P1");
    assert.equal(state.cards["CT025-C1"]?.state.tapped, undefined);
    assert.equal(state.cards["CT025-C1"]?.state.tapState, undefined);
    assert.deepEqual(state.startPhaseSequenceByPlayer, { P1: 1, P2: 1 });
});
test("CT-037 Aegis replacement keeps exact expiry ownership", async () => {
    const fixture = (await lifecycleFixtures()).find((entry) => entry.id === "CT-037");
    assert.ok(fixture);
    const state = finalOf(fixture);
    assert.equal(state.cards["CT037-C1"]?.controllerId, "P1");
    assert.equal(state.cards["CT037-C1"]?.state.aegis, undefined);
    assert.deepEqual(state.startPhaseSequenceByPlayer, { P1: 1, P2: 2 });
});
test("CT-038 Exile-Bound replaces GY after OTT cleanup", async () => {
    const fixture = (await lifecycleFixtures()).find((entry) => entry.id === "CT-038");
    assert.ok(fixture);
    const state = finalOf(fixture);
    assert.deepEqual(state.zones.gy, []);
    assert.deepEqual(state.zones.exile, ["CT038-C1"]);
    assert.equal(state.cards["CT038-C1"]?.state.exileBound, true);
    assert.equal(state.cards["CT038-C1"]?.state.playedForEffect, undefined);
});
test("CT-051 Nine Tap follows current controller at score time", async () => {
    const fixture = (await lifecycleFixtures()).find((entry) => entry.id === "CT-051");
    assert.ok(fixture);
    const state = finalOf(fixture);
    assert.equal(state.cards["CT051-C1"]?.controllerId, "P1");
    assert.equal(state.cards["CT051-C1"]?.state.tapped, undefined);
    assert.deepEqual(state.players.P1?.pr, ["CT051-C2"]);
});
test("CT-052 reveal marker never resurrects after hand re-entry", async () => {
    const fixture = (await lifecycleFixtures()).find((entry) => entry.id === "CT-052");
    assert.ok(fixture);
    const state = finalOf(fixture);
    assert.deepEqual(state.players.P1?.hand, ["CT052-C1"]);
    assert.equal(state.cards["CT052-C1"]?.state.revealedUntil, undefined);
});
test("CT-053 Played-for-Effect clears only when leaving OTT", async () => {
    const fixture = (await lifecycleFixtures()).find((entry) => entry.id === "CT-053");
    assert.ok(fixture);
    const state = finalOf(fixture);
    assert.deepEqual(state.zones.gy, ["CT053-C1"]);
    assert.equal(state.cards["CT053-C1"]?.state.playedForEffect, undefined);
});
test("CT-054 Exile-Bound remains permanent across zone changes", async () => {
    const fixture = (await lifecycleFixtures()).find((entry) => entry.id === "CT-054");
    assert.ok(fixture);
    const state = finalOf(fixture);
    assert.deepEqual(state.zones.exile, ["CT054-C1"]);
    assert.equal(state.cards["CT054-C1"]?.state.exileBound, true);
});
const rankFixturePath = path.join(root, "fixtures", "phase6-rank-conformance.json");
async function rankFixtures() {
    return loadFixtures(rankFixturePath);
}
test("rank registry contains the canonical fifteen ranks in Scuttle order", async () => {
    const { allRankDefinitions } = await import("../src/index.js");
    const definitions = allRankDefinitions();
    assert.deepEqual(definitions.map((entry) => entry.rank), ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "RJ", "BJ"]);
    assert.deepEqual(definitions.map((entry) => entry.scuttleOrder), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    assert.ok(definitions.every((entry) => entry.modes.length > 0));
});
test("fixture corpus contains exactly the Phase 6 rank gate", async () => {
    const ids = (await rankFixtures()).map((fixture) => fixture.id);
    assert.deepEqual(ids, ["CT-064", "CT-065", "CT-066", "CT-067", "CT-068", "CT-069", "CT-070", "CT-071", "CT-072", "CT-073", "CT-074", "CT-075", "CT-076", "CT-077", "CT-078", "CT-079", "CT-080", "CT-081"]);
});
test("every Phase 6 rank fixture deterministically replays", async () => {
    for (const fixture of await rankFixtures()) {
        const first = runCommands(fixture.initialState, fixture.commands);
        const second = runCommands(fixture.initialState, fixture.commands);
        assert.equal(canonicalize(first), canonicalize(second), fixture.id);
        const replay = createReplay(fixture.id, fixture.initialState, fixture.commands, first);
        assert.equal(hashCanonical(replayAndVerify(replay).state), replay.finalStateHash, fixture.id);
    }
});
test("CT-064 Aegis rewinds Commandeer without spending sources", async () => {
    const fixture = (await rankFixtures()).find((entry) => entry.id === "CT-064");
    assert.ok(fixture);
    const result = runCommands(fixture.initialState, fixture.commands);
    assert.deepEqual(result.accepted, [false]);
    assert.deepEqual(result.state.players.P1?.hand, ["CT064-C1", "CT064-C2"]);
    assert.equal(result.state.cards["CT064-C3"]?.controllerId, "P2");
});
test("CT-065 Total Clear bypasses Aegis but Exile-Bound replaces GY", async () => {
    const fixture = (await rankFixtures()).find((entry) => entry.id === "CT-065");
    assert.ok(fixture);
    const state = runCommands(fixture.initialState, fixture.commands).state;
    assert.deepEqual(state.zones.gy, ["CT065-C1"]);
    assert.deepEqual(state.zones.exile, ["CT065-C2"]);
    assert.equal(state.cards["CT065-C2"]?.state.exileBound, true);
});
test("CT-073 Mimic remains Rank 10 and becomes Exile-Bound", async () => {
    const fixture = (await rankFixtures()).find((entry) => entry.id === "CT-073");
    assert.ok(fixture);
    const state = runCommands(fixture.initialState, fixture.commands).state;
    assert.deepEqual(state.zones.exile, ["CT073-10"]);
    assert.equal(state.cards["CT073-10"]?.identity, "10♦");
    assert.equal(state.players.P1?.limits.rank10PlayedThisFT, true);
});
test("CT-076 Stack Theft fizzles stolen source to GY and applies both skips", async () => {
    const fixture = (await rankFixtures()).find((entry) => entry.id === "CT-076");
    assert.ok(fixture);
    const state = runCommands(fixture.initialState, fixture.commands).state;
    assert.deepEqual(state.zones.gy, ["CT076-3"]);
    assert.deepEqual(state.zones.exile, ["CT076-10"]);
    assert.equal(state.players.P1?.limits.pendingFullTurnSkips, 1);
    assert.equal(state.players.P2?.limits.pendingFullTurnSkips, 1);
});
test("CT-079 Royal Marriage is not classified as Combo", async () => {
    const fixture = (await rankFixtures()).find((entry) => entry.id === "CT-079");
    assert.ok(fixture);
    const state = runCommands(fixture.initialState, fixture.commands).state;
    assert.equal(state.metadata.lastPlayClass, "RoyalMarriage");
    assert.deepEqual(state.players.P1?.er, ["CT079-K", "CT079-Q"]);
});
test("CT-080 and CT-081 separate ordinary immunity from ⭐8 bypass", async () => {
    const ordinary = (await rankFixtures()).find((entry) => entry.id === "CT-080");
    const absolute = (await rankFixtures()).find((entry) => entry.id === "CT-081");
    assert.ok(ordinary && absolute);
    assert.deepEqual(runCommands(ordinary.initialState, ordinary.commands).accepted, [false]);
    const result = runCommands(absolute.initialState, absolute.commands);
    assert.deepEqual(result.accepted, [true]);
    assert.deepEqual(result.state.zones.gy, ["CT081-RJ", "CT081-8A", "CT081-8B"]);
});
const interactionFixturePath = path.join(root, "fixtures", "phase7-interactions-conformance.json");
async function interactionFixtures() {
    return loadFixtures(interactionFixturePath);
}
test("fixture corpus contains the unique Phase 7 interaction additions", async () => {
    const ids = (await interactionFixtures()).map((fixture) => fixture.id);
    assert.deepEqual(ids, ["CT-020", "CT-022", "CT-039", "CT-040", "CT-041", "CT-042", "CT-055", "CT-056", "CT-057", "CT-058", "CT-059", "CT-060", "CT-061", "CT-062", "CT-063"]);
});
test("every Phase 7 interaction fixture deterministically replays", async () => {
    for (const fixture of await interactionFixtures()) {
        const first = runCommands(fixture.initialState, fixture.commands);
        const second = runCommands(fixture.initialState, fixture.commands);
        assert.equal(canonicalize(first), canonicalize(second), fixture.id);
        const replay = createReplay(fixture.id, fixture.initialState, fixture.commands, first);
        assert.equal(hashCanonical(replayAndVerify(replay).state), replay.finalStateHash, fixture.id);
    }
});
test("Guard, Aegis, and rank immunity remain separate predicates", async () => {
    const fixtures = await interactionFixtures();
    for (const id of ["CT-041", "CT-055", "CT-056", "CT-057"]) {
        const fixture = fixtures.find((entry) => entry.id === id);
        assert.ok(fixture);
        assert.deepEqual(runCommands(fixture.initialState, fixture.commands).accepted, [false], id);
    }
    const structural = fixtures.find((entry) => entry.id === "CT-058");
    assert.ok(structural);
    assert.deepEqual(runCommands(structural.initialState, structural.commands).accepted, [true]);
});
test("Scuttle profiles bypass only their named checks", async () => {
    const fixtures = await interactionFixtures();
    const outcomes = Object.fromEntries(["CT-020", "CT-059", "CT-060", "CT-061"].map((id) => {
        const fixture = fixtures.find((entry) => entry.id === id);
        assert.ok(fixture);
        return [id, runCommands(fixture.initialState, fixture.commands).accepted];
    }));
    assert.deepEqual(outcomes, { "CT-020": [false], "CT-059": [true], "CT-060": [true], "CT-061": [false] });
});
test("Attachment graph severs immediately and removes reciprocal state", async () => {
    const fixtures = await interactionFixtures();
    for (const id of ["CT-022", "CT-040"]) {
        const fixture = fixtures.find((entry) => entry.id === id);
        assert.ok(fixture);
        const result = runCommands(fixture.initialState, fixture.commands);
        assert.deepEqual(result.accepted, [true]);
        assert.ok(result.events.some((event) => event.type === "ATTACHMENT_SEVERED"));
        assert.deepEqual(validateState(result.state), []);
    }
});
test("Royal Shield and King counter authority use the canonical matrix", async () => {
    const fixtures = await interactionFixtures();
    for (const id of ["CT-062", "CT-063"]) {
        const fixture = fixtures.find((entry) => entry.id === id);
        assert.ok(fixture);
        assert.deepEqual(runCommands(fixture.initialState, fixture.commands).accepted, [false, true], id);
    }
});
const phase8FixturePath = path.join(root, "fixtures", "phase8-ultras-rank10-voltage-endgames.json");
async function phase8Fixtures() {
    return loadFixtures(phase8FixturePath);
}
test("fixture corpus contains the unique Phase 8 additions", async () => {
    assert.deepEqual((await phase8Fixtures()).map((fixture) => fixture.id), ["CT-015", "CT-017", "CT-018", "CT-019", "CT-033", "CT-082", "CT-083", "CT-084", "CT-085", "CT-086", "CT-087", "CT-088", "CT-089", "CT-090", "CT-091", "CT-092"]);
});
test("every Phase 8 fixture deterministically replays", async () => {
    for (const fixture of await phase8Fixtures()) {
        const first = runCommands(fixture.initialState, fixture.commands);
        const second = runCommands(fixture.initialState, fixture.commands);
        assert.equal(canonicalize(first), canonicalize(second), fixture.id);
        const replay = createReplay(fixture.id, fixture.initialState, fixture.commands, first);
        assert.equal(hashCanonical(replayAndVerify(replay).state), replay.finalStateHash, fixture.id);
    }
});
test("Ultras remain atomic and consume exactly one per-FT use", async () => {
    const fixtures = await phase8Fixtures();
    for (const id of ["CT-019", "CT-033", "CT-082", "CT-083"]) {
        const fixture = fixtures.find((entry) => entry.id === id);
        assert.ok(fixture);
        const result = runCommands(fixture.initialState, fixture.commands);
        assert.deepEqual(result.accepted, [true], id);
        assert.equal(result.state.players.P1?.limits.ultraPlayedThisFT, true, id);
        assert.ok(result.events.some((event) => event.type.startsWith("ULTRA_")), id);
    }
});
test("Rank-10 containment applies before destination and limit checks fail closed", async () => {
    const fixtures = await phase8Fixtures();
    const replacement = fixtures.find((entry) => entry.id === "CT-084");
    const limit = fixtures.find((entry) => entry.id === "CT-085");
    assert.ok(replacement && limit);
    const a = runCommands(replacement.initialState, replacement.commands);
    assert.deepEqual(a.state.zones.exile, ["CT084-T"]);
    assert.equal(a.state.cards["CT084-T"]?.state.exileBound, true);
    const b = runCommands(limit.initialState, limit.commands);
    assert.deepEqual(b.accepted, [true, false]);
    assert.deepEqual(b.state.players.P1?.hand, ["CT085-T2"]);
});
test("Voltage eligibility is fixed at snapshot and each rank resolves once", async () => {
    const fixture = (await phase8Fixtures()).find((entry) => entry.id === "CT-088");
    assert.ok(fixture);
    const result = runCommands(fixture.initialState, fixture.commands);
    assert.deepEqual(result.accepted, [true, true, true]);
    assert.deepEqual(result.state.players.P1?.hand, ["CT088-D1"]);
    const phase8 = result.state.metadata.phase8;
    assert.equal(phase8.voltageUsedThisFT?.P1?.["3"], true);
});
test("End Phase timer order short-circuits before Exhausted after Sudden Death", async () => {
    const fixtures = await phase8Fixtures();
    for (const id of ["CT-015", "CT-086"]) {
        const fixture = fixtures.find((entry) => entry.id === id);
        assert.ok(fixture);
        const result = runCommands(fixture.initialState, fixture.commands);
        assert.equal(result.state.winner, "P2", id);
        const phase8 = result.state.metadata.phase8;
        assert.equal(phase8.exhausted?.remaining, 1, id);
    }
});
test("signed scoring and Exhausted tiebreaks use raw canonical values", async () => {
    const fixtures = await phase8Fixtures();
    const signed = fixtures.find((entry) => entry.id === "CT-087");
    const exhausted = fixtures.find((entry) => entry.id === "CT-092");
    assert.ok(signed && exhausted);
    const signedState = runCommands(signed.initialState, signed.commands).state;
    assert.equal(deriveSecuredPoints(signedState, "P1"), -7);
    assert.equal(signedState.winner, null);
    assert.equal(runCommands(exhausted.initialState, exhausted.commands).state.winner, "P1");
});
const phase9FixturePath = path.join(root, "fixtures", "phase9-first-contact-profile.json");
async function phase9Fixtures() {
    return loadFixtures(phase9FixturePath);
}
test("fixture corpus contains exactly the Phase 9 First Contact gate", async () => {
    assert.deepEqual((await phase9Fixtures()).map((fixture) => fixture.id), ["CT-093", "CT-119"]);
});
test("every Phase 9 fixture deterministically replays", async () => {
    for (const fixture of await phase9Fixtures()) {
        const first = runCommands(fixture.initialState, fixture.commands);
        const second = runCommands(fixture.initialState, fixture.commands);
        assert.equal(canonicalize(first), canonicalize(second), fixture.id);
        const replay = createReplay(fixture.id, fixture.initialState, fixture.commands, first);
        assert.equal(hashCanonical(replayAndVerify(replay).state), replay.finalStateHash, fixture.id);
    }
});
test("CT-093 rejects suit text before source commitment with byte-equivalent rollback", async () => {
    const fixture = (await phase9Fixtures()).find((entry) => entry.id === "CT-093");
    assert.ok(fixture);
    const before = hashCanonical(fixture.initialState);
    const result = runCommands(fixture.initialState, fixture.commands);
    assert.deepEqual(result.accepted, [false]);
    assert.equal(hashCanonical(result.state), before);
    assert.equal(result.events.length, 0);
    assert.deepEqual(result.state.players.P1?.hand, ["CT-093-P1_HAND-01"]);
});
test("CT-119 rejects every optional module combination without a teaching override", async () => {
    const fixture = (await phase9Fixtures()).find((entry) => entry.id === "CT-119");
    assert.ok(fixture);
    const before = hashCanonical(fixture.initialState);
    const result = runCommands(fixture.initialState, fixture.commands);
    assert.deepEqual(result.accepted, [false]);
    assert.equal(hashCanonical(result.state), before);
    assert.equal(result.events.length, 0);
});
test("First Contact setup is a profile over the same state kernel", () => {
    const state = createEmptyState(["P1", "P2"]);
    const result = new IntrilexEngine().execute(state, {
        id: "FC-SETUP", type: "RESOLVE_PHASE9_ACTION", actorId: "P1",
        action: { kind: "apply-setup", playerIds: ["P1", "P2"] }
    });
    assert.equal(result.accepted, true);
    assert.equal(result.state.players.P1?.goal, 15);
    assert.equal(result.state.players.P2?.goal, 15);
    assert.equal(result.state.players.P1?.limits.miniTurnsRemaining, 1);
    assert.equal(result.state.metadata.firstContact.active, true);
    assert.deepEqual(result.state.metadata.firstContact.allowedActions, [...FIRST_CONTACT_PROFILE.allowedActions]);
});
test("First Contact Start automatically untaps every controlled OTT card", () => {
    const state = createEmptyState(["P1", "P2"]);
    addCard(state, { id: "FC-TAPPED-PR", identity: "7♣", originalOwnerId: "P1", zone: "P1_PR", state: { tapped: true, tapState: { kind: "manual-only", sourceRef: "probe" }, pointValue: 7 } });
    addCard(state, { id: "FC-TAPPED-ER", identity: "Q♦", originalOwnerId: "P1", zone: "P1_ER", state: { tapped: true, tapState: { kind: "nine-score", sourceRef: "probe" } } });
    const engine = new IntrilexEngine();
    const setup = engine.execute(state, { id: "FC-S1", type: "RESOLVE_PHASE9_ACTION", actorId: "P1", action: { kind: "apply-setup", playerIds: ["P1", "P2"] } });
    assert.equal(setup.accepted, true);
    const start = engine.execute(setup.state, { id: "FC-S2", type: "RESOLVE_PHASE9_ACTION", actorId: "P1", action: { kind: "begin-start", playerId: "P1" } });
    assert.equal(start.accepted, true);
    assert.equal(start.state.cards["FC-TAPPED-PR"]?.state.tapped, false);
    assert.equal(start.state.cards["FC-TAPPED-ER"]?.state.tapped, false);
    assert.equal(Object.hasOwn(start.state.cards["FC-TAPPED-PR"].state, "tapState"), false);
    assert.equal(start.state.players.P1?.limits.miniTurnsRemaining, 1);
});
test("First Contact replaces Exile destinations with GY", () => {
    const state = createEmptyState(["P1", "P2"]);
    addCard(state, { id: "FC-EXILE-ROUTE", identity: "A♠", originalOwnerId: "P1", zone: "P1_HAND", state: { exileBound: true } });
    const engine = new IntrilexEngine();
    const setup = engine.execute(state, { id: "FC-D1", type: "RESOLVE_PHASE9_ACTION", actorId: "P1", action: { kind: "apply-setup", playerIds: ["P1", "P2"] } });
    const routed = engine.execute(setup.state, { id: "FC-D2", type: "RESOLVE_PHASE9_ACTION", actorId: "P1", action: { kind: "route-destination", cardId: "FC-EXILE-ROUTE", requestedDestination: "EXILE" } });
    assert.equal(routed.accepted, true);
    assert.equal(routed.state.cards["FC-EXILE-ROUTE"]?.zone, "GY");
    assert.deepEqual(routed.state.zones.exile, []);
    assert.deepEqual(routed.state.zones.gy, ["FC-EXILE-ROUTE"]);
});
test("First Contact ignores Mini-Turn grants and reveal markers", () => {
    const state = createEmptyState(["P1", "P2"]);
    addCard(state, { id: "FC-HAND-ENTRY", identity: "3♣", originalOwnerId: "P1", zone: "P1_HAND", state: { revealedUntil: { playerId: "P1", startSequence: 9 } } });
    const engine = new IntrilexEngine();
    const setup = engine.execute(state, { id: "FC-M1", type: "RESOLVE_PHASE9_ACTION", actorId: "P1", action: { kind: "apply-setup", playerIds: ["P1", "P2"] } });
    const grant = engine.execute(setup.state, { id: "FC-M2", type: "RESOLVE_PHASE9_ACTION", actorId: "P1", action: { kind: "grant-mini-turns", playerId: "P1", amount: 2 } });
    assert.equal(grant.state.players.P1?.limits.miniTurnsRemaining, 1);
    const entered = engine.execute(grant.state, { id: "FC-M3", type: "RESOLVE_PHASE9_ACTION", actorId: "P1", action: { kind: "enter-hand", cardId: "FC-HAND-ENTRY", playerId: "P1" } });
    assert.equal(entered.state.cards["FC-HAND-ENTRY"]?.zone, "P1_HAND");
    assert.equal(Object.hasOwn(entered.state.cards["FC-HAND-ENTRY"].state, "revealedUntil"), false);
});
test("First Contact generic allowlist accepts base effects but rejects advanced classes", () => {
    const state = createEmptyState(["P1", "P2"]);
    addCard(state, { id: "FC-GENERIC-3", identity: "3♣", originalOwnerId: "P1", zone: "P1_HAND" });
    const engine = new IntrilexEngine();
    const legal = engine.execute(state, { id: "FC-A1", type: "RESOLVE_PHASE9_ACTION", actorId: "P1", action: { kind: "validate-declaration", declarationClass: "generic-effect", sourceCardIds: ["FC-GENERIC-3"], rank: "3", effectKey: "generic-three" } });
    assert.equal(legal.accepted, true);
    const illegal = engine.execute(legal.state, { id: "FC-A2", type: "RESOLVE_PHASE9_ACTION", actorId: "P1", action: { kind: "validate-declaration", declarationClass: "ultra" } });
    assert.equal(illegal.accepted, false);
});
const trapFixturePath = path.join(root, "fixtures", "phase10-trap-module.json");
async function trapFixtures() {
    return loadFixtures(trapFixturePath);
}
test("fixture corpus contains exactly the Phase 10 unique Trap gate", async () => {
    assert.deepEqual((await trapFixtures()).map((fixture) => fixture.id), ["CT-016", "CT-024", "CT-094", "CT-095", "CT-096", "CT-097", "CT-098", "CT-099"]);
});
test("every Phase 10 Trap fixture deterministically replays", async () => {
    for (const fixture of await trapFixtures()) {
        const first = runCommands(fixture.initialState, fixture.commands);
        const second = runCommands(fixture.initialState, fixture.commands);
        assert.equal(canonicalize(first), canonicalize(second), fixture.id);
        const replay = createReplay(fixture.id, fixture.initialState, fixture.commands, first);
        assert.equal(hashCanonical(replayAndVerify(replay).state), replay.finalStateHash, fixture.id);
    }
});
test("CT-094 uses 4-spade Trap identity without clearing ER", async () => {
    const fixture = (await trapFixtures()).find((entry) => entry.id === "CT-094");
    assert.ok(fixture);
    const state = runCommands(fixture.initialState, fixture.commands).state;
    assert.deepEqual(state.players.P2?.pr, []);
    assert.deepEqual(state.players.P2?.er, ["CT-094-P2-ER"]);
    assert.deepEqual(state.zones.gy, ["CT-094-P2-PR", "CT-094-P1-TRAP"]);
});
test("CT-095 rejects undefined Combo before hidden Trap detection", async () => {
    const fixture = (await trapFixtures()).find((entry) => entry.id === "CT-095");
    assert.ok(fixture);
    const before = hashCanonical(fixture.initialState);
    const result = runCommands(fixture.initialState, fixture.commands);
    assert.deepEqual(result.accepted, [false]);
    assert.equal(hashCanonical(result.state), before);
    assert.equal(result.state.cards["CT-095-P2-TRAP"]?.state.faceDownTrap, true);
});
test("CT-097 Board Lock suppresses rather than spends Trap trigger", async () => {
    const fixture = (await trapFixtures()).find((entry) => entry.id === "CT-097");
    assert.ok(fixture);
    const result = runCommands(fixture.initialState, fixture.commands);
    assert.deepEqual(result.accepted, [false]);
    assert.equal(result.state.cards["CT-097-P2-TRAP"]?.state.faceDownTrap, true);
    assert.equal(result.state.metadata.phase10?.triggerUsedThisActiveFT?.P2, undefined);
});
test("CT-098 and CT-099 disable then re-enable the same face-down Trap", async () => {
    const disabledFixture = (await trapFixtures()).find((entry) => entry.id === "CT-098");
    const expiryFixture = (await trapFixtures()).find((entry) => entry.id === "CT-099");
    assert.ok(disabledFixture && expiryFixture);
    const disabled = runCommands(disabledFixture.initialState, disabledFixture.commands).state.cards["CT-098-P2-TRAP"]?.state;
    assert.deepEqual(disabled?.disabledTrap, { counteringPlayerId: "P1", expiresAfterCompletedFullTurnSequence: 1 });
    const enabled = runCommands(expiryFixture.initialState, expiryFixture.commands).state.cards["CT-099-P2-TRAP"]?.state;
    assert.equal(enabled?.faceDownTrap, true);
    assert.equal(enabled?.disabledTrap, undefined);
});
test("public and opponent views redact face-down Trap identities", async () => {
    const { publicStateView, privateStateView } = await import("../src/index.js");
    const fixture = (await trapFixtures()).find((entry) => entry.id === "CT-095");
    assert.ok(fixture);
    const publicView = publicStateView(fixture.initialState);
    const ownerView = privateStateView(fixture.initialState, "P2");
    const opponentView = privateStateView(fixture.initialState, "P1");
    assert.equal(publicView.cards["CT-095-P2-TRAP"]?.identity, "HIDDEN");
    assert.equal(opponentView.cards["CT-095-P2-TRAP"]?.identity, "HIDDEN");
    assert.equal(ownerView.cards["CT-095-P2-TRAP"]?.identity, "4♥");
});
test("Trap placement is non-stack, capped at two, and Board Lock rejects it", async () => {
    const { validateTrapPlacement } = await import("../src/index.js");
    const state = createEmptyState();
    addCard(state, { id: "T1", identity: "2♣", originalOwnerId: "P1", zone: "P1_HAND" });
    assert.equal(validateTrapPlacement(state, "P1", "T1", "pr"), null);
    state.metadata.phase8 = { boardLock: { remaining: 1, activationFullTurnSequence: 0 } };
    assert.match(validateTrapPlacement(state, "P1", "T1", "pr") ?? "", /Board Lock/);
});
const multiplayerFixturePath = path.join(root, "fixtures", "phase11-multiplayer-teams.json");
async function multiplayerFixtures() {
    return loadFixtures(multiplayerFixturePath);
}
test("fixture corpus contains exactly the Phase 11 Multiplayer and Teams gate", async () => {
    assert.deepEqual((await multiplayerFixtures()).map((fixture) => fixture.id), ["CT-014", "CT-100", "CT-101", "CT-102", "CT-103", "CT-104", "CT-105", "CT-109", "CT-114"]);
});
test("every Phase 11 multiplayer fixture deterministically replays", async () => {
    for (const fixture of await multiplayerFixtures()) {
        const first = runCommands(fixture.initialState, fixture.commands);
        const second = runCommands(fixture.initialState, fixture.commands);
        assert.equal(canonicalize(first), canonicalize(second), fixture.id);
        const replay = createReplay(fixture.id, fixture.initialState, fixture.commands, first);
        assert.equal(hashCanonical(replayAndVerify(replay).state), replay.finalStateHash, fixture.id);
    }
});
test("multiplayer relation helpers separate Ally, Enemy, and self", async () => {
    const { areAllies, areEnemies, relationBetween, validateMultiplayerTarget } = await import("../src/index.js");
    const state = createEmptyState(["P1", "P2", "P3", "P4"]);
    state.players.P1.teamId = "A";
    state.players.P3.teamId = "A";
    state.players.P2.teamId = "B";
    state.players.P4.teamId = "B";
    assert.equal(relationBetween(state, "P1", "P1"), "self");
    assert.equal(areAllies(state, "P1", "P3"), true);
    assert.equal(areEnemies(state, "P1", "P2"), true);
    assert.match(validateMultiplayerTarget(state, "P1", "P3", true) ?? "", /Ally/);
    assert.equal(validateMultiplayerTarget(state, "P1", "P2", true), null);
});
test("multiplayer priority order starts after declarer and wraps once", async () => {
    const { expectedPriorityOrder } = await import("../src/index.js");
    assert.deepEqual(expectedPriorityOrder(["P1", "P2", "P3", "P4"], "P3"), ["P4", "P1", "P2", "P3"]);
});
test("Swap Bar scaling is exact for two through four players", async () => {
    const { swapBarShape } = await import("../src/index.js");
    assert.deepEqual(swapBarShape(2), { capacity: 3, faceDown: 2, faceUp: 1 });
    assert.deepEqual(swapBarShape(3), { capacity: 4, faceDown: 2, faceUp: 2 });
    assert.deepEqual(swapBarShape(4), { capacity: 5, faceDown: 3, faceUp: 2 });
});
test("CT-104 illegal Ally target leaves the before-image unchanged", async () => {
    const fixture = (await multiplayerFixtures()).find((entry) => entry.id === "CT-104");
    assert.ok(fixture);
    const before = hashCanonical(fixture.initialState);
    const result = new IntrilexEngine().execute(fixture.initialState, fixture.commands[0]);
    assert.equal(result.accepted, false);
    assert.equal(hashCanonical(result.state), before);
    assert.equal(result.events.length, 0);
});
test("CT-105 closes four-player priority only after all four consecutive passes", async () => {
    const fixture = (await multiplayerFixtures()).find((entry) => entry.id === "CT-105");
    assert.ok(fixture);
    let state = fixture.initialState;
    for (let index = 0; index < 4; index += 1)
        state = new IntrilexEngine().execute(state, fixture.commands[index]).state;
    assert.equal(state.priority?.open, true);
    state = new IntrilexEngine().execute(state, fixture.commands[4]).state;
    assert.equal(state.priority?.open, false);
});
test("CT-114 aggregates team Anchors before signed Points", async () => {
    const fixture = (await multiplayerFixtures()).find((entry) => entry.id === "CT-114");
    assert.ok(fixture);
    const state = runCommands(fixture.initialState, fixture.commands).state;
    const phase11 = state.metadata.phase11;
    assert.equal(phase11.winningTeamId, "A");
    assert.deepEqual(phase11.lastTeamTotals, { A: { anchors: 2, points: 4 }, B: { anchors: 1, points: 10 } });
    assert.equal(state.winner, "P1");
});
const battleRealmFixturePath = path.join(root, "fixtures", "phase12-battlerealm.json");
async function battleRealmFixtures() {
    return loadFixtures(battleRealmFixturePath);
}
test("fixture corpus contains exactly the Phase 12 BattleRealm unique projections", async () => {
    assert.deepEqual((await battleRealmFixtures()).map((fixture) => fixture.id), ["CT-001", "CT-002", "CT-003", "CT-106", "CT-107", "CT-108", "CT-110", "CT-117", "CT-118"]);
});
test("every Phase 12 BattleRealm fixture deterministically replays", async () => {
    for (const fixture of await battleRealmFixtures()) {
        const first = runCommands(fixture.initialState, fixture.commands);
        const second = runCommands(fixture.initialState, fixture.commands);
        assert.equal(canonicalize(first), canonicalize(second), fixture.id);
        const replay = createReplay(fixture.id, fixture.initialState, fixture.commands, first);
        assert.equal(hashCanonical(replayAndVerify(replay).state), replay.finalStateHash, fixture.id);
    }
});
test("BattleRealm registry contains four immutable bounded Specs", async () => {
    const { BATTLE_REALM_REGISTRY } = await import("../src/index.js");
    assert.deepEqual(Object.keys(BATTLE_REALM_REGISTRY).sort(), ["Balance", "Beauty", "Bravery", "Brilliance"]);
    assert.equal(BATTLE_REALM_REGISTRY.Beauty.signatureUses, 3);
    assert.equal(BATTLE_REALM_REGISTRY.Bravery.signatureUses, 1);
    assert.ok(BATTLE_REALM_REGISTRY.Brilliance.absoluteCaps.includes("goal>=5"));
});
test("Calculated Court adds one controller-level signed bonus without mutating Bomb stage", async () => {
    const fixture = (await battleRealmFixtures()).find((entry) => entry.id === "CT-001");
    assert.ok(fixture);
    const state = runCommands(fixture.initialState, fixture.commands).state;
    assert.equal(state.cards["CT001-QH"].state.pointValue, -2);
    assert.equal(state.cards["CT001-QH"].state.timeBombStage, 1);
    assert.equal(deriveSecuredPoints(state, "P1"), 0);
});
test("tapped Time Bomb is excluded from Calculated Court qualification", async () => {
    const fixture = (await battleRealmFixtures()).find((entry) => entry.id === "CT-003");
    assert.ok(fixture);
    const state = runCommands(fixture.initialState, fixture.commands).state;
    assert.equal(deriveSecuredPoints(state, "P1"), 2);
});
test("Courageous Assault is finite, adds its Interrupt skip, and respects Aegis", async () => {
    const fixture = (await battleRealmFixtures()).find((entry) => entry.id === "CT-106");
    assert.ok(fixture);
    const completed = runCommands(fixture.initialState, fixture.commands).state;
    assert.equal(completed.cards["CT106-T"].zone, "GY");
    assert.equal(completed.players.P1.limits.pendingFullTurnSkips, 1);
    const state = createEmptyState();
    addCard(state, { id: "AEGIS-T", identity: "5♠", originalOwnerId: "P2", zone: "P2_ER", state: { aegis: { sourceRef: "probe", expiresAt: { playerId: "P2", startSequence: 1 } } } });
    const engine = new IntrilexEngine();
    const configured = engine.execute(state, { id: "BR-P1", type: "RESOLVE_PHASE12_ACTION", actorId: "P1", action: { kind: "configure-battle-realm", specs: { P1: "Bravery", P2: "Balance" } } });
    const blocked = engine.execute(configured.state, { id: "BR-P2", type: "RESOLVE_PHASE12_ACTION", actorId: "P1", action: { kind: "courageous-assault", targetCardId: "AEGIS-T" } });
    assert.equal(blocked.accepted, false);
    assert.equal(blocked.state.cards["AEGIS-T"].zone, "P2_ER");
});
test("BattleRealm absolute caps and reserved combines fail closed", async () => {
    const fixture = (await battleRealmFixtures()).find((entry) => entry.id === "CT-108");
    assert.ok(fixture);
    const result = runCommands(fixture.initialState, fixture.commands);
    assert.deepEqual(result.accepted, [true, true, true, false, false]);
    assert.equal(result.state.players.P1.limits.miniTurnsRemaining, 3);
    assert.equal(result.state.players.P1.limits.ultraPlayedThisFT, true);
});
test("BattleRealm Goal floor never drops below five", () => {
    const state = createEmptyState();
    const engine = new IntrilexEngine();
    const configured = engine.execute(state, { id: "GF-1", type: "RESOLVE_PHASE12_ACTION", actorId: "P1", action: { kind: "configure-battle-realm", specs: { P1: "Balance", P2: "Beauty" } } });
    const changed = engine.execute(configured.state, { id: "GF-2", type: "RESOLVE_PHASE12_ACTION", actorId: "P1", action: { kind: "apply-goal-delta", playerId: "P1", delta: -999 } });
    assert.equal(changed.accepted, true);
    assert.equal(changed.state.players.P1.goal, 5);
});
test("CT-117 preserves modifiers while rebinding controller-relative terms", async () => {
    const fixture = (await battleRealmFixtures()).find((entry) => entry.id === "CT-117");
    assert.ok(fixture);
    const state = runCommands(fixture.initialState, fixture.commands).state;
    const item = state.stack.find((entry) => entry.id === "CT117-SI");
    assert.equal(item?.controllerId, "P2");
    assert.deepEqual(item?.targetCardIds, ["CT117-T"]);
    assert.deepEqual(state.metadata.interceptedPlayProperties, {
        stackItemId: "CT117-SI", originalControllerId: "P1", controllerId: "P2",
        preservedModifierKeys: ["seven-bottom-reveal", "trap-source-intercept"], controllerRelativeTermsUse: "P2"
    });
});
test("Mastermind logs private order as authorized rather than public", () => {
    const state = createEmptyState();
    for (const [id, identity] of [["M1", "A♣"], ["M2", "2♣"], ["M3", "3♣"], ["M4", "4♣"], ["M5", "5♣"]])
        addCard(state, { id, identity, originalOwnerId: "P1", zone: "DP" });
    const engine = new IntrilexEngine();
    const configured = engine.execute(state, { id: "M-0", type: "RESOLVE_PHASE12_ACTION", actorId: "P1", action: { kind: "configure-battle-realm", specs: { P1: "Brilliance", P2: "Balance" } } });
    const resolved = engine.execute(configured.state, { id: "M-1", type: "RESOLVE_PHASE12_ACTION", actorId: "P1", action: { kind: "mastermind", inspectedCardIds: ["M1", "M2", "M3", "M4", "M5"], drawCardIds: ["M1", "M5"], returnOrder: ["M3", "M2", "M4"], viewerId: "P2" } });
    assert.equal(resolved.accepted, true);
    assert.equal(resolved.events.some((event) => event.visibility === "authorized"), true);
    assert.deepEqual(resolved.state.players.P1.hand, ["M1", "M5"]);
    assert.deepEqual(resolved.state.zones.dp, ["M3", "M2", "M4"]);
});
const timeBombFixturePath = path.join(root, "fixtures", "phase13-time-bomb.json");
async function timeBombFixtures() {
    return loadFixtures(timeBombFixturePath);
}
test("fixture corpus contains the four unique Phase 13 Time Bomb projections", async () => {
    assert.deepEqual((await timeBombFixtures()).map((fixture) => fixture.id), ["CT-012", "CT-111", "CT-112", "CT-113"]);
});
test("every unique Phase 13 Time Bomb fixture deterministically replays", async () => {
    for (const fixture of await timeBombFixtures()) {
        const first = runCommands(fixture.initialState, fixture.commands);
        const second = runCommands(fixture.initialState, fixture.commands);
        assert.equal(canonicalize(first), canonicalize(second), fixture.id);
        const replay = createReplay(fixture.id, fixture.initialState, fixture.commands, first);
        assert.equal(hashCanonical(replayAndVerify(replay).state), replay.finalStateHash, fixture.id);
    }
});
test("Time Bomb stage tracks are signed and exact", async () => {
    const { stageValue } = await import("../src/index.js");
    assert.deepEqual([0, 1, 2, 3].map((stage) => stageValue("♥", stage)), [0, -2, -4, -7]);
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((stage) => stageValue("♠", stage)), [0, 3, 6, 9, 12, 15, 21]);
});
test("scoring a Queen creates Stage 0 Time Bomb state", () => {
    const state = createEmptyState();
    addCard(state, { id: "TB-SCORE", identity: "Q♣", originalOwnerId: "P1", zone: "P1_HAND" });
    const engine = new IntrilexEngine();
    const configured = engine.execute(state, { id: "TB-S-0", type: "RESOLVE_PHASE13_ACTION", actorId: "P1", action: { kind: "configure-time-bomb" } });
    const scored = engine.execute(configured.state, { id: "TB-S-1", type: "RESOLVE_PHASE13_ACTION", actorId: "P1", action: { kind: "score-queen-as-bomb", playerId: "P1", cardId: "TB-SCORE" } });
    assert.equal(scored.accepted, true);
    assert.equal(scored.state.cards["TB-SCORE"].zone, "P1_PR");
    assert.deepEqual(scored.state.cards["TB-SCORE"].state.timeBomb, { suit: "♣", stage: 0, peak: 3 });
});
test("tapping never stops Fuse advancement", async () => {
    const fixture = (await timeBombFixtures()).find((entry) => entry.id === "CT-112");
    assert.ok(fixture);
    const state = runCommands(fixture.initialState, fixture.commands).state;
    assert.equal(state.cards["CT112-QS"].state.tapped, true);
    assert.equal(state.cards["CT112-QS"].state.timeBombStage, 6);
    assert.equal(deriveSecuredPoints(state, "P1"), 0);
});
test("Time Bomb control changes preserve Fuse Stage and relocate PR authority", () => {
    const state = createEmptyState();
    addCard(state, { id: "TB-CONTROL", identity: "Q♥", originalOwnerId: "P1", zone: "P1_PR", state: { pointValue: -4, timeBombStage: 2, timeBomb: { suit: "♥", stage: 2, peak: 3 } } });
    state.metadata.phase13 = { enabled: true, forcedDrawByPlayer: {}, queuedFuseCardIds: [], lastResolution: null };
    const result = new IntrilexEngine().execute(state, { id: "TB-C-1", type: "RESOLVE_PHASE13_ACTION", actorId: "P2", action: { kind: "change-bomb-controller", cardId: "TB-CONTROL", controllerId: "P2" } });
    assert.equal(result.accepted, true);
    assert.equal(result.state.cards["TB-CONTROL"].controllerId, "P2");
    assert.equal(result.state.cards["TB-CONTROL"].state.timeBombStage, 2);
    assert.deepEqual(result.state.players.P1.pr, []);
    assert.deepEqual(result.state.players.P2.pr, ["TB-CONTROL"]);
});
test("Q♦ Peak targets the next Enemy rather than the next Ally", () => {
    const state = createEmptyState(["P1", "P2", "P3", "P4"]);
    state.players.P1.teamId = "A";
    state.players.P3.teamId = "A";
    state.players.P2.teamId = "B";
    state.players.P4.teamId = "B";
    addCard(state, { id: "TB-QD", identity: "Q♦", originalOwnerId: "P1", zone: "P1_PR", state: { pointValue: 4, timeBombStage: 2, timeBomb: { suit: "♦", stage: 2, peak: 3 } } });
    state.metadata.phase13 = { enabled: true, forcedDrawByPlayer: {}, queuedFuseCardIds: [], lastResolution: null };
    const result = new IntrilexEngine().execute(state, { id: "TB-QD-1", type: "RESOLVE_PHASE13_ACTION", actorId: "P1", action: { kind: "resolve-fuse", cardId: "TB-QD" } });
    const runtime = result.state.metadata.phase13;
    assert.equal(result.accepted, true);
    assert.deepEqual(Object.keys(runtime.forcedDrawByPlayer), ["P2"]);
});
test("Q♦ requirement survives a skipped Action Phase and rejects another first Action", () => {
    const state = createEmptyState();
    state.metadata.phase13 = { enabled: true, forcedDrawByPlayer: { P2: { sourceBombId: "Q", createdOnFullTurnSequence: 1 } }, queuedFuseCardIds: [], lastResolution: null };
    const engine = new IntrilexEngine();
    const skipped = engine.execute(state, { id: "FD-1", type: "RESOLVE_PHASE13_ACTION", actorId: "P2", action: { kind: "enforce-forced-draw", playerId: "P2", declaredAction: "pass", drawLegal: true, actionPhaseSkipped: true } });
    assert.equal(skipped.accepted, false);
    const illegal = engine.execute(state, { id: "FD-2", type: "RESOLVE_PHASE13_ACTION", actorId: "P2", action: { kind: "enforce-forced-draw", playerId: "P2", declaredAction: "other", drawLegal: true } });
    assert.equal(illegal.accepted, false);
    const legal = engine.execute(state, { id: "FD-3", type: "RESOLVE_PHASE13_ACTION", actorId: "P2", action: { kind: "enforce-forced-draw", playerId: "P2", declaredAction: "draw", drawLegal: true } });
    assert.equal(legal.accepted, true);
});
test("Q♣ Peak retrieves newest and oldest GY cards as Revealed-Until-Start", () => {
    const state = createEmptyState();
    addCard(state, { id: "TB-QC", identity: "Q♣", originalOwnerId: "P1", zone: "P1_PR", state: { pointValue: 4, timeBombStage: 2, timeBomb: { suit: "♣", stage: 2, peak: 3 } } });
    addCard(state, { id: "GY-N", identity: "A♣", originalOwnerId: "P1", zone: "GY" });
    addCard(state, { id: "GY-M", identity: "2♣", originalOwnerId: "P1", zone: "GY" });
    addCard(state, { id: "GY-O", identity: "3♣", originalOwnerId: "P1", zone: "GY" });
    state.zones.gy = ["GY-N", "GY-M", "GY-O"];
    state.metadata.phase13 = { enabled: true, forcedDrawByPlayer: {}, queuedFuseCardIds: [], lastResolution: null };
    const result = new IntrilexEngine().execute(state, { id: "QC-1", type: "RESOLVE_PHASE13_ACTION", actorId: "P1", action: { kind: "resolve-fuse", cardId: "TB-QC" } });
    assert.deepEqual(result.state.players.P1.hand, ["GY-N", "GY-O"]);
    assert.deepEqual(result.state.zones.gy, ["GY-M"]);
    assert.deepEqual(result.state.cards["GY-N"].state.revealedUntil, { playerId: "P1", startSequence: 1 });
});
test("countered Defuse keeps the Bomb but never refunds cost or Action-Phase skip", () => {
    const state = createEmptyState();
    addCard(state, { id: "TB-D", identity: "Q♠", originalOwnerId: "P2", zone: "P2_PR", state: { pointValue: 21, timeBombStage: 6, timeBomb: { suit: "♠", stage: 6, peak: 6 } } });
    addCard(state, { id: "TB-COST", identity: "3♦", originalOwnerId: "P1", zone: "P1_HAND" });
    state.metadata.phase13 = { enabled: true, forcedDrawByPlayer: {}, queuedFuseCardIds: [], lastResolution: null };
    const result = new IntrilexEngine().execute(state, { id: "D-1", type: "RESOLVE_PHASE13_ACTION", actorId: "P1", action: { kind: "declare-defuse", targetCardId: "TB-D", costCardIds: ["TB-COST"], responseWindow: true, countered: true } });
    assert.equal(result.accepted, true);
    assert.equal(result.state.cards["TB-D"].zone, "P2_PR");
    assert.equal(result.state.cards["TB-COST"].zone, "GY");
    assert.equal(result.state.players.P1.limits.pendingActionPhaseSkips, 1);
});
test("illegal Defuse cost is a total before-image rollback", () => {
    const state = createEmptyState();
    addCard(state, { id: "TB-D2", identity: "Q♦", originalOwnerId: "P2", zone: "P2_PR", state: { pointValue: 2, timeBombStage: 1, timeBomb: { suit: "♦", stage: 1, peak: 3 } } });
    addCard(state, { id: "ONLY", identity: "3♦", originalOwnerId: "P1", zone: "P1_HAND" });
    state.metadata.phase13 = { enabled: true, forcedDrawByPlayer: {}, queuedFuseCardIds: [], lastResolution: null };
    const before = hashCanonical(state);
    const result = new IntrilexEngine().execute(state, { id: "D-2", type: "RESOLVE_PHASE13_ACTION", actorId: "P1", action: { kind: "declare-defuse", targetCardId: "TB-D2", costCardIds: ["ONLY"], responseWindow: true } });
    assert.equal(result.accepted, false);
    assert.equal(hashCanonical(result.state), before);
    assert.equal(result.events.length, 0);
});
test("moving a Time Bomb out of PR removes its Fuse state", () => {
    const state = createEmptyState();
    addCard(state, { id: "TB-MOVE", identity: "Q♣", originalOwnerId: "P1", zone: "P1_PR", state: { pointValue: 2, timeBombStage: 1, timeBomb: { suit: "♣", stage: 1, peak: 3 } } });
    state.metadata.phase13 = { enabled: true, forcedDrawByPlayer: {}, queuedFuseCardIds: [], lastResolution: null };
    const result = new IntrilexEngine().execute(state, { id: "MV-1", type: "RESOLVE_PHASE13_ACTION", actorId: "P1", action: { kind: "move-time-bomb", cardId: "TB-MOVE", destination: "GY" } });
    assert.equal(result.accepted, true);
    assert.equal(Object.prototype.hasOwnProperty.call(result.state.cards["TB-MOVE"].state, "timeBomb"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(result.state.cards["TB-MOVE"].state, "timeBombStage"), false);
});
const deffyFixturePath = path.join(root, "fixtures", "phase14-deffy-mode.json");
async function deffyFixtures() {
    return loadFixtures(deffyFixturePath);
}
test("fixture corpus contains the two unique Phase 14 Deffy projections", async () => {
    assert.deepEqual((await deffyFixtures()).map((fixture) => fixture.id), ["CT-115", "CT-116"]);
});
test("every unique Phase 14 Deffy fixture deterministically replays", async () => {
    for (const fixture of await deffyFixtures()) {
        const first = runCommands(fixture.initialState, fixture.commands);
        const second = runCommands(fixture.initialState, fixture.commands);
        assert.equal(canonicalize(first), canonicalize(second), fixture.id);
        const replay = createReplay(fixture.id, fixture.initialState, fixture.commands, first);
        assert.equal(hashCanonical(replayAndVerify(replay).state), replay.finalStateHash, fixture.id);
    }
});
test("CT-115 Classic draft reaches exact 5/6 hands without gameplay Stack use", async () => {
    const fixture = (await deffyFixtures()).find((entry) => entry.id === "CT-115");
    assert.ok(fixture);
    const result = runCommands(fixture.initialState, fixture.commands);
    assert.ok(result.accepted.every(Boolean));
    assert.deepEqual(result.state.players.P1.hand, ["CT115-P01", "CT115-P03", "CT115-P05", "CT115-P07", "CT115-P09"]);
    assert.deepEqual(result.state.players.P2.hand, ["CT115-P02", "CT115-P04", "CT115-P06", "CT115-P08", "CT115-P10", "CT115-P11"]);
    assert.equal(result.state.stack.length, 0);
    assert.equal(result.state.pendingDeclaration, null);
    const runtime = result.state.metadata.phase14;
    assert.equal(runtime.status, "complete");
    assert.equal(runtime.specsMayBeRevealed, true);
    assert.deepEqual(runtime.faceDownPicksByDrafter, { P1: 1, P2: 2 });
});
test("CT-116 Mirror Me reveals one pick, adds one legal mirror, and creates no Time Bomb", async () => {
    const fixture = (await deffyFixtures()).find((entry) => entry.id === "CT-116");
    assert.ok(fixture);
    const result = runCommands(fixture.initialState, fixture.commands);
    assert.deepEqual(result.accepted, [true]);
    assert.deepEqual(result.state.players.P1.hand, ["CT116-QH"]);
    assert.deepEqual(result.state.zones.staging, ["CT116-QS"]);
    assert.deepEqual(result.state.zones.dp, ["CT116-AC", "CT116-KD"]);
    assert.equal(result.state.cards["CT116-QS"].state.draftFaceUp, true);
    assert.equal(Object.prototype.hasOwnProperty.call(result.state.cards["CT116-QH"].state, "timeBomb"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(result.state.cards["CT116-QS"].state, "timeBomb"), false);
});
test("face-down Deffy pool identities are redacted before selection", async () => {
    const { publicStateView, privateStateView } = await import("../src/index.js");
    const fixture = (await deffyFixtures()).find((entry) => entry.id === "CT-116");
    assert.ok(fixture);
    assert.doesNotMatch(canonicalize(publicStateView(fixture.initialState)), /Q♥/);
    assert.doesNotMatch(canonicalize(privateStateView(fixture.initialState, "P1")), /Q♥/);
});
test("Deffy sub-mode shapes are canonical and Soda is two-player only", async () => {
    const { deffyPoolShape } = await import("../src/index.js");
    assert.deepEqual(deffyPoolShape("classic", 2), { total: 21, faceUp: 16, faceDown: 5, privatePools: false });
    assert.deepEqual(deffyPoolShape("icu", 2), { total: 12, faceUp: 12, faceDown: 0, privatePools: false });
    assert.deepEqual(deffyPoolShape("mystery-mix", 4), { total: 14, faceUp: 6, faceDown: 8, privatePools: false });
    assert.deepEqual(deffyPoolShape("soda", 2), { total: 16, faceUp: 14, faceDown: 2, privatePools: true });
    let sodaError = "";
    try {
        deffyPoolShape("soda", 3);
    }
    catch (error) {
        sodaError = error instanceof Error ? error.message : String(error);
    }
    assert.match(sodaError, /exactly two players/);
});
test("That's Urz assignment validation is self-free and bijective", async () => {
    const { validateAssignmentBijection } = await import("../src/index.js");
    assert.equal(validateAssignmentBijection(["P1", "P2", "P3"], { P1: "P2", P2: "P3", P3: "P1" }), null);
    assert.match(validateAssignmentBijection(["P1", "P2", "P3"], { P1: "P2", P2: "P2", P3: "P1" }) ?? "", /bijective|self-free/);
    assert.match(validateAssignmentBijection(["P1", "P2"], { P1: "P1", P2: "P2" }) ?? "", /self-free/);
});
test("starting player's first face-down pick is a total rollback", () => {
    const state = createEmptyState();
    for (let index = 0; index < 21; index += 1)
        addCard(state, { id: `DF-${index}`, identity: index === 0 ? "A♣" : "2♣", originalOwnerId: "P1", zone: "DP" });
    const engine = new IntrilexEngine();
    const configured = engine.execute(state, { id: "DF-C", type: "RESOLVE_PHASE14_ACTION", actorId: "P1", action: { kind: "configure-deffy", subMode: "classic", turnOrder: ["P1", "P2"] } });
    const pooled = engine.execute(configured.state, { id: "DF-P", type: "RESOLVE_PHASE14_ACTION", actorId: "P1", action: { kind: "initialize-draft-pool", poolCardIds: Array.from({ length: 21 }, (_, i) => `DF-${i}`), faceDownCardIds: ["DF-0", "DF-1", "DF-2", "DF-3", "DF-4"] } });
    const before = hashCanonical(pooled.state);
    const rejected = engine.execute(pooled.state, { id: "DF-R", type: "RESOLVE_PHASE14_ACTION", actorId: "P1", action: { kind: "draft-pick", drafterId: "P1", cardId: "DF-0" } });
    assert.equal(rejected.accepted, false);
    assert.equal(hashCanonical(rejected.state), before);
    assert.equal(rejected.events.length, 0);
});
test("Speed Run timeout consumes serialized RNG and selects only face-up pool cards", () => {
    const state = createEmptyState();
    for (let i = 0; i < 12; i += 1)
        addCard(state, { id: `SR-${i}`, identity: `${(i % 9) + 1}♣`, originalOwnerId: "P1", zone: "DP" });
    const engine = new IntrilexEngine();
    const configured = engine.execute(state, { id: "SR-C", type: "RESOLVE_PHASE14_ACTION", actorId: "P1", action: { kind: "configure-deffy", subMode: "icu", turnOrder: ["P1", "P2"], addOns: { speedRun: true } } });
    const pooled = engine.execute(configured.state, { id: "SR-P", type: "RESOLVE_PHASE14_ACTION", actorId: "P1", action: { kind: "initialize-draft-pool", poolCardIds: Array.from({ length: 12 }, (_, i) => `SR-${i}`), faceDownCardIds: [] } });
    const result = engine.execute(pooled.state, { id: "SR-T", type: "RESOLVE_PHASE14_ACTION", actorId: "P1", action: { kind: "speed-run-timeout", drafterId: "P1" } });
    assert.equal(result.accepted, true);
    assert.equal(result.state.players.P1.hand.length, 1);
    assert.equal(result.state.rng.cursor, 1);
    const runtime = result.state.metadata.phase14;
    assert.equal(runtime.rngAudit.at(-1)?.operation, "speed-run-timeout");
});
test("pool exhaustion refills exactly three face-up cards when available", () => {
    const state = createEmptyState();
    for (let i = 0; i < 4; i += 1)
        addCard(state, { id: `RF-${i}`, identity: `A♣`, originalOwnerId: "P1", zone: "DP" });
    state.phase = "Setup";
    state.metadata.phase14 = { enabled: true, subMode: "classic", status: "drafting", targetHandSizes: { P1: 5, P2: 6 }, draftOrder: ["P1", "P2"], nextDrafterIndex: 0, assignmentByDrafter: { P1: "P1", P2: "P2" }, poolFaceUpByCard: {}, draftedFor: { P1: [], P2: [] }, faceDownPicksByDrafter: { P1: 0, P2: 0 }, faceUpPicksByDrafter: { P1: 0, P2: 0 }, addOns: { speedRun: false, thatsUrz: false, thirdPartied: false, mirrorMe: false }, rngAudit: [], specsMayBeRevealed: false, trapPlacementDuringDraft: false, lastResolution: null };
    const result = new IntrilexEngine().execute(state, { id: "RF-1", type: "RESOLVE_PHASE14_ACTION", actorId: "P1", action: { kind: "refill-pool" } });
    assert.equal(result.accepted, true);
    assert.deepEqual(result.state.zones.staging, ["RF-0", "RF-1", "RF-2"]);
    assert.deepEqual(result.state.zones.dp, ["RF-3"]);
    assert.ok(result.state.zones.staging.every((id) => result.state.cards[id].state.draftFaceUp === true));
});
const tournamentSeedFixturePath = path.join(root, "fixtures", "phase15-tournament-seed.json");
async function tournamentSeedFixtures() {
    return loadFixtures(tournamentSeedFixturePath);
}
test("Phase 15 fixture namespace preserves official CT-063 without overwriting historical CT-063", async () => {
    const fixtures = await tournamentSeedFixtures();
    assert.deepEqual(fixtures.map((fixture) => [fixture.id, fixture.sourceTestId]), [
        ["CT-004", "CT-004"],
        ["CT-005", "CT-005"],
        ["CT-063@TOURNAMENT-SEED", "CT-063"]
    ]);
});
test("every Phase 15 fixture deterministically replays", async () => {
    for (const fixture of await tournamentSeedFixtures()) {
        const first = runCommands(fixture.initialState, fixture.commands);
        const second = runCommands(fixture.initialState, fixture.commands);
        assert.equal(canonicalize(first), canonicalize(second), fixture.id);
        const replay = createReplay(fixture.id, fixture.initialState, fixture.commands, first);
        assert.equal(hashCanonical(replayAndVerify(replay).state), replay.finalStateHash, fixture.id);
    }
});
test("CT-004 constructs the exact Ban Pile, six-card hands, and Swap Bar", async () => {
    const fixture = (await tournamentSeedFixtures()).find((entry) => entry.id === "CT-004");
    assert.ok(fixture);
    const result = runCommands(fixture.initialState, fixture.commands);
    assert.ok(result.accepted.every(Boolean));
    assert.equal(result.state.players.P1.hand.length, 6);
    assert.equal(result.state.players.P2.hand.length, 6);
    assert.equal(result.state.zones.swapBar.length, 3);
    const runtime = result.state.metadata.phase15;
    assert.equal(runtime.banPileCardIds.length, 8);
    assert.equal(runtime.activeHighImpactPool.length, 13);
    assert.equal(runtime.status, "complete");
    assert.ok(runtime.banPileCardIds.every((id) => result.state.cards[id].zone === "VOID" && result.state.cards[id].state.tournamentSeedBanPile === true));
});
test("CT-005 resolves a High-Impact collision through ranked backup", async () => {
    const fixture = (await tournamentSeedFixtures()).find((entry) => entry.id === "CT-005");
    assert.ok(fixture);
    const result = runCommands(fixture.initialState, fixture.commands);
    const runtime = result.state.metadata.phase15;
    assert.equal(result.state.cards[runtime.highImpactAssignments.P1].identity, "10♠");
    assert.equal(result.state.cards[runtime.highImpactAssignments.P2].identity, "K♠");
});
test("official CT-063 Tournament Seed configuration rejection is total rollback", async () => {
    const fixture = (await tournamentSeedFixtures()).find((entry) => entry.id === "CT-063@TOURNAMENT-SEED");
    assert.ok(fixture);
    const before = hashCanonical(fixture.initialState);
    const result = new IntrilexEngine().execute(fixture.initialState, fixture.commands[0]);
    assert.equal(result.accepted, false);
    assert.equal(hashCanonical(result.state), before);
    assert.equal(result.events.length, 0);
});
test("Tournament Seed pool validator rejects banned, categorical, duplicate, and undersized pools", async () => {
    const { validateTournamentSeedPool, CANONICAL_HIGH_IMPACT_POOL } = await import("../src/index.js");
    assert.equal(validateTournamentSeedPool(CANONICAL_HIGH_IMPACT_POOL, 2), null);
    assert.match(validateTournamentSeedPool(["4♠", "A♣", "A♠", "3♠", "5♠", "6♠"], 2) ?? "", /Ban Pile/);
    assert.match(validateTournamentSeedPool(["A♦", "A♣", "A♠", "3♠", "5♠", "6♠"], 2) ?? "", /categories 1–4/);
    assert.match(validateTournamentSeedPool(["A♣", "A♣", "A♠", "3♠", "5♠", "6♠"], 2) ?? "", /unique/);
    assert.match(validateTournamentSeedPool(["A♣", "A♠", "3♠"], 2) ?? "", /three legal identities per player/);
});
test("Tournament Seed configuration rejects Trap and Time Bomb unconditionally", async () => {
    const { validateTournamentSeedConfiguration } = await import("../src/index.js");
    assert.match(validateTournamentSeedConfiguration(["tournament-seed", "trap"], "EVENT-1", ["trap"]) ?? "", /disables trap/);
    assert.match(validateTournamentSeedConfiguration(["tournament-seed", "time-bomb"]) ?? "", /disables time-bomb/);
    assert.match(validateTournamentSeedConfiguration(["tournament-seed", "battlerealm"]) ?? "", /event sheet/);
    assert.equal(validateTournamentSeedConfiguration(["tournament-seed", "battlerealm"], "EVENT-1", ["battlerealm"]), null);
});
test("Tournament Seed Scuttle ignores suit but requires strictly higher rank", async () => {
    const { tournamentSeedScuttleLegality } = await import("../src/index.js");
    const state = createEmptyState();
    addCard(state, { id: "TS-S7S", identity: "7♠", originalOwnerId: "P1", zone: "P1_HAND" });
    addCard(state, { id: "TS-T7C", identity: "7♣", originalOwnerId: "P2", zone: "P2_PR" });
    addCard(state, { id: "TS-S8C", identity: "8♣", originalOwnerId: "P1", zone: "P1_HAND" });
    assert.equal(tournamentSeedScuttleLegality(state, "P1", "TS-S7S", "TS-T7C").legal, false);
    assert.equal(tournamentSeedScuttleLegality(state, "P1", "TS-S8C", "TS-T7C").legal, true);
});
test("banned Tournament Seed cards are outside all gameplay zones", async () => {
    const fixture = (await tournamentSeedFixtures()).find((entry) => entry.id === "CT-004");
    assert.ok(fixture);
    const result = runCommands(fixture.initialState, [fixture.commands[0]]);
    const runtime = result.state.metadata.phase15;
    const containers = [result.state.zones.dp, result.state.zones.gy, result.state.zones.exile, result.state.zones.swapBar, result.state.zones.staging, ...Object.values(result.state.players).flatMap((p) => [p.hand, p.pr, p.er])].flat();
    assert.ok(runtime.banPileCardIds.every((id) => !containers.includes(id)));
});
test("certified replay v2 verifies checkpoints and detects tampering", async () => {
    const { createCertifiedReplay, verifyCertifiedReplay } = await import("../src/index.js");
    const fixture = (await fixtures()).find((entry) => entry.id === "CT-120");
    assert.ok(fixture);
    const replay = createCertifiedReplay(fixture.id, fixture.initialState, fixture.commands);
    const verified = verifyCertifiedReplay(replay);
    assert.equal(hashCanonical(verified.state), replay.finalStateHash);
    assert.equal(replay.checkpoints.length, fixture.commands.length);
    const tampered = JSON.parse(JSON.stringify(replay));
    tampered.accepted[0] = !tampered.accepted[0];
    let rejected = false;
    try {
        verifyCertifiedReplay(tampered);
    }
    catch {
        rejected = true;
    }
    assert.equal(rejected, true);
});
test("public certified replay strips hidden identity, RNG, and authoritative state hashes", async () => {
    const { createCertifiedReplay, publicCertifiedReplayView } = await import("../src/index.js");
    const fixture = (await fixtures()).find((entry) => entry.id === "CT-120");
    assert.ok(fixture);
    const publicText = canonicalize(publicCertifiedReplayView(createCertifiedReplay(fixture.id, fixture.initialState, fixture.commands)));
    assert.doesNotMatch(publicText, /selectedCardId|rngBefore|rngAfter|stateHashBefore|stateHashAfter|initialStateHash|finalStateHash/);
    assert.doesNotMatch(publicText, /A♠|K♣/);
    assert.match(publicText, /redacted/);
});
test("certified replay serialization is canonical and round-trips", async () => {
    const { createCertifiedReplay, parseCertifiedReplay, serializeCertifiedReplay } = await import("../src/index.js");
    const fixture = (await fixtures())[0];
    assert.ok(fixture);
    const replay = createCertifiedReplay(fixture.id, fixture.initialState, fixture.commands);
    const text = serializeCertifiedReplay(replay);
    assert.equal(serializeCertifiedReplay(parseCertifiedReplay(text)), text);
});
test("Phase 16 RNG vectors freeze unsigned xorshift behavior", async () => {
    const { runRngVector } = await import("../src/index.js");
    const vectors = JSON.parse(await readFile(path.join(root, "fixtures", "phase16-rng-vectors.json"), "utf8"));
    assert.equal(vectors.length, 4);
    for (const vector of vectors) {
        const result = runRngVector(vector);
        assert.deepEqual(result.uint32, vector.expectedUint32, vector.name);
        assert.deepEqual(result.indices, vector.expectedIndices, vector.name);
    }
});
test("judge packet redacts face-down Trap identity but preserves public Disable marker", async () => {
    const { buildJudgePacket } = await import("../src/index.js");
    const trapFixtures = await loadFixtures(path.join(root, "fixtures", "phase10-trap-module.json"));
    const fixture = trapFixtures.find((entry) => entry.id === "CT-098");
    assert.ok(fixture);
    const state = runCommands(fixture.initialState, fixture.commands).state;
    const packet = buildJudgePacket(state);
    const trap = packet.markerChecklist.find((entry) => entry.markers.faceDownTrap === true);
    assert.ok(trap);
    assert.equal(trap.identity, "FACE_DOWN_TRAP");
    assert.ok(trap.markers.disabledTrap !== undefined);
});
test("judge assistant distinguishes illegal declaration from later fizzle", async () => {
    const { explainIllegalVsFizzle } = await import("../src/index.js");
    const illegalFixture = (await fixtures()).find((entry) => entry.id === "CT-026");
    assert.ok(illegalFixture);
    const illegal = new IntrilexEngine().execute(illegalFixture.initialState, illegalFixture.commands[0]);
    assert.equal(explainIllegalVsFizzle(illegalFixture.commands[0], illegal).classification, "illegal-declaration");
    const fizzleFixture = (await fixtures()).find((entry) => entry.id === "CT-047");
    assert.ok(fizzleFixture);
    const fizzleResult = runCommands(fizzleFixture.initialState, fizzleFixture.commands);
    const synthetic = { accepted: true, state: fizzleResult.state, events: [...fizzleResult.events, { id: "J-FIZZLE", sequence: 999, commandId: "J", type: "PLAY_FIZZLED", visibility: "public", payload: {}, previousStateHash: "x", stateHash: "y" }] };
    assert.equal(explainIllegalVsFizzle(fizzleFixture.commands.at(-1), synthetic).classification, "fizzled");
});
test("module compatibility matrix rejects prohibited profiles and preserves explicit combinations", async () => {
    const { modulePairCompatibility, validateModuleConfiguration } = await import("../src/index.js");
    assert.equal(modulePairCompatibility("first-contact", "traps").status, "prohibited");
    assert.equal(modulePairCompatibility("tournament-seed", "time-bomb").status, "prohibited");
    assert.equal(modulePairCompatibility("battle-realm", "traps").status, "compatible-with-rule");
    assert.equal(validateModuleConfiguration(["battle-realm", "traps", "multiplayer", "time-bomb"]).legal, true);
    assert.equal(validateModuleConfiguration(["tournament-seed", "battle-realm"]).legal, false);
    assert.equal(validateModuleConfiguration(["tournament-seed", "battle-realm"], ["tournament-seed", "battle-realm"]).legal, true);
});
test("integration scenario catalog is deterministic and entirely green", async () => {
    const { DEFAULT_INTEGRATION_SCENARIOS, runIntegrationScenarios } = await import("../src/index.js");
    const first = runIntegrationScenarios(DEFAULT_INTEGRATION_SCENARIOS);
    const second = runIntegrationScenarios(DEFAULT_INTEGRATION_SCENARIOS);
    assert.equal(first.aggregateHash, second.aggregateHash);
    assert.ok(first.results.every((entry) => entry.status === "PASS"));
});
const canonicalClosurePath = path.join(root, "fixtures", "phase20-canonical-closure.json");
async function canonicalClosureFixtures() { return loadFixtures(canonicalClosurePath); }
test("canon-lock closure contains the five previously missing source IDs", async () => {
    assert.deepEqual((await canonicalClosureFixtures()).map((fixture) => fixture.sourceTestId), ["CT-013", "CT-021", "CT-023", "CT-034", "CT-035"]);
});
test("every canon-lock closure fixture deterministically replays", async () => {
    for (const fixture of await canonicalClosureFixtures()) {
        const first = runCommands(fixture.initialState, fixture.commands);
        const second = runCommands(fixture.initialState, fixture.commands);
        assert.equal(canonicalize(first), canonicalize(second), fixture.id);
        assert.ok(first.accepted.every(Boolean), fixture.id);
    }
});
test("CT-013 transfers both cards but Nine rejects fresh Aegis", async () => {
    const fixture = (await canonicalClosureFixtures()).find((entry) => entry.id === "CT-013");
    assert.ok(fixture);
    const state = runCommands(fixture.initialState, fixture.commands).state;
    assert.equal(state.cards["CT-013-P1_PR-01"].controllerId, "P2");
    assert.ok(state.cards["CT-013-P1_PR-01"].state.aegis);
    assert.equal(state.cards["CT-013-P1_PR-02"].state.aegis, undefined);
});
test("CT-034 consumes only the pending skip and performs no Full Turn reset", async () => {
    const fixture = (await canonicalClosureFixtures()).find((entry) => entry.id === "CT-034");
    assert.ok(fixture);
    const state = runCommands(fixture.initialState, fixture.commands).state;
    assert.equal(state.fullTurnSequence, 12);
    assert.equal(state.startPhaseSequenceByPlayer.P1, 5);
    assert.equal(state.players.P1.limits.rank10PlayedThisFT, true);
    assert.equal(state.players.P1.limits.pendingFullTurnSkips, 0);
    assert.equal(state.metadata.phase8.boardLock.remaining, 2);
});
test("CT-035 changes controller and row without changing original owner", async () => {
    const fixture = (await canonicalClosureFixtures()).find((entry) => entry.id === "CT-035");
    assert.ok(fixture);
    const state = runCommands(fixture.initialState, fixture.commands).state;
    assert.equal(state.cards["CT-035-P1_PR-01"].controllerId, "P2");
    assert.equal(state.cards["CT-035-P1_PR-01"].originalOwnerId, "P2");
    assert.equal(state.cards["CT-035-P1_PR-01"].zone, "P2_PR");
});
test("Phase 19 simulation campaign is deterministic and uses complete matches", async () => {
    const { runSimulationBaseline } = await import("../src/index.js");
    const report = await runSimulationBaseline(root);
    assert.equal(report.deterministicReproduction.matched, true);
    assert.equal(report.fullMatchCampaign.matchCount, 10800);
    assert.equal(report.scenarioBaseline.scenarioCount, 121);
});
//# sourceMappingURL=engine.test.js.map