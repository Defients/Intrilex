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
    assert.equal(publicView.cards["CT-095-P2-TRAP"], undefined);
    assert.equal(opponentView.cards["CT-095-P2-TRAP"], undefined);
    assert.ok(Object.values(publicView.cards).some((card) => card.identity === "HIDDEN" && card.state.faceDownTrap === true));
    assert.ok(Object.values(opponentView.cards).some((card) => card.identity === "HIDDEN" && card.state.faceDownTrap === true));
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
test("v4.1.1 hotfix: Courageous Assault is finite, uses Interrupt timing without a turn tax, and respects Aegis", async () => {
    const fixture = (await battleRealmFixtures()).find((entry) => entry.id === "CT-106");
    assert.ok(fixture);
    const completed = runCommands(fixture.initialState, fixture.commands).state;
    assert.equal(completed.cards["CT106-T"].zone, "GY");
    assert.equal(completed.players.P1.limits.pendingFullTurnSkips, 0);
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
const autonomySetup = {
    profileId: "first-contact-baseline",
    playerIds: ["P1", "P2"],
    enabledModules: [],
    eventApprovedModules: [],
    seed: 0x12345678,
    seatOrder: ["P1", "P2"]
};
test("4.1.1 autonomy constructor is deterministic and deals canonical First Contact hands", async () => {
    const { createMatchState } = await import("../src/index.js");
    const a = createMatchState(autonomySetup);
    const b = createMatchState(autonomySetup);
    assert.equal(hashCanonical(a), hashCanonical(b));
    assert.equal(a.players.P1?.hand.length, 5);
    assert.equal(a.players.P2?.hand.length, 6);
    assert.equal(a.zones.dp.length, 43);
    assert.equal(a.phase, "Start");
    assert.deepEqual(validateState(a), []);
});
test("4.1.1 legal action enumeration is sound and hides command payloads from policy view", async () => {
    const { advanceToDecision, authorizedLegalActionView } = await import("../src/index.js");
    const state = (await import("../src/index.js")).createMatchState(autonomySetup);
    const advanced = advanceToDecision(state);
    assert.equal(advanced.status, "PLAYER_DECISION_REQUIRED");
    assert.ok(advanced.legalActionFrame);
    assert.ok(advanced.legalActionFrame.actions.length >= 7);
    const engine = new IntrilexEngine();
    for (const action of advanced.legalActionFrame.actions) {
        assert.equal(engine.execute(advanced.state, action.command).accepted, true, action.actionId);
        const policyView = authorizedLegalActionView(action);
        assert.equal("command" in policyView, false);
        assert.equal(policyView.engineCommandHash, hashCanonical(action.command));
    }
});
test("4.1.1 action frame does not expose opponent hand identities or ids", async () => {
    const { advanceToDecision, createMatchState } = await import("../src/index.js");
    const state = createMatchState(autonomySetup);
    const opponentHand = new Set(state.players.P2.hand);
    const advanced = advanceToDecision(state);
    assert.ok(advanced.legalActionFrame);
    const text = canonicalize(advanced.legalActionFrame.actions.map((action) => ({
        actionId: action.actionId,
        sourceCardIds: action.sourceCardIds,
        targetCardIds: action.targetCardIds,
        publicSummaryCode: action.publicSummaryCode,
        featureVector: action.featureVector
    })));
    for (const id of opponentHand)
        assert.doesNotMatch(text, new RegExp(id));
    for (const id of opponentHand)
        assert.doesNotMatch(text, new RegExp(state.cards[id].identity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
test("4.1.1 Random Legal produces deterministic normal victories", async () => {
    const { runRandomLegalMatch } = await import("../src/index.js");
    const first = runRandomLegalMatch(autonomySetup, 500);
    const second = runRandomLegalMatch(autonomySetup, 500);
    assert.equal(first.terminationReason, "NORMAL_VICTORY");
    assert.equal(hashCanonical({ state: first.state, commands: first.commands, decisions: first.decisions }), hashCanonical({ state: second.state, commands: second.commands, decisions: second.decisions }));
    assert.ok(first.state.winner === "P1" || first.state.winner === "P2");
    assert.ok(first.decisions.length > 0);
});
const essentialsSetup = { ...autonomySetup, profileId: "first-contact-essentials", seed: 0x51e77a1 };
async function placeIdentity(state, identity, destination, controllerId) {
    const { moveCard } = await import("../src/index.js");
    const card = Object.values(state.cards).find((entry) => entry.identity === identity);
    assert.ok(card, identity);
    moveCard(state, card.id, destination, controllerId);
    return card.id;
}
test("4.1.2 Essentials enumerates only engine-accepted effects and Anchors", async () => {
    const { advanceToDecision, createMatchState } = await import("../src/index.js");
    let state = createMatchState(essentialsSetup);
    const initial = advanceToDecision(state);
    assert.equal(initial.status, "PLAYER_DECISION_REQUIRED");
    state = initial.state;
    for (const identity of ["4♣", "9♣", "J♣", "Q♣", "K♣", "RJ", "BJ"])
        await placeIdentity(state, identity, "P1_HAND", "P1");
    for (const identity of ["3♦", "5♦"]) {
        const id = await placeIdentity(state, identity, "P2_PR", "P2");
        state.cards[id].state.pointValue = Number(identity[0]);
    }
    const advanced = advanceToDecision(state);
    assert.equal(advanced.status, "PLAYER_DECISION_REQUIRED");
    assert.ok(advanced.legalActionFrame);
    const families = new Set(advanced.legalActionFrame.actions.map((entry) => entry.family));
    for (const family of ["effect-row-clear", "effect-tap", "effect-goal-shift", "effect-jack-control", "anchor-guard", "anchor", "effect-red-joker", "effect-board-lock"])
        assert.ok(families.has(family), family);
    const engine = new IntrilexEngine();
    for (const action of advanced.legalActionFrame.actions) {
        const result = engine.execute(advanced.state, action.command);
        assert.equal(result.accepted, true, `${action.actionId}: ${result.error?.code ?? ""}`);
        assert.deepEqual(validateState(result.state), [], action.actionId);
    }
});
test("4.1.2 Guard removes illegal Nine Tap and Jack actions before policy selection", async () => {
    const { advanceToDecision, createMatchState, enumerateLegalActions } = await import("../src/index.js");
    let state = advanceToDecision(createMatchState(essentialsSetup)).state;
    await placeIdentity(state, "9♣", "P1_HAND", "P1");
    await placeIdentity(state, "J♣", "P1_HAND", "P1");
    await placeIdentity(state, "4♣", "P1_HAND", "P1");
    const targetId = await placeIdentity(state, "3♦", "P2_PR", "P2");
    state.cards[targetId].state.pointValue = 3;
    const queenId = await placeIdentity(state, "Q♦", "P2_ER", "P2");
    state.cards[queenId].state.firstContactAnchor = true;
    state.cards[queenId].state.providesGuard = true;
    const frame = enumerateLegalActions(state, { actorId: "P1", visibility: "PLAYER_AUTHORIZED", profileId: "first-contact-essentials", enabledModules: [] });
    assert.equal(frame.actions.some((entry) => entry.family === "effect-tap" && entry.targetCardIds.includes(targetId)), false);
    assert.equal(frame.actions.some((entry) => entry.family === "effect-jack-control" && entry.targetCardIds.includes(targetId)), false);
    assert.equal(frame.actions.some((entry) => entry.family === "effect-row-clear"), true);
});
test("4.1.2 Board Lock fail-closes Scuttle, effects, and Anchor plays", async () => {
    const { advanceToDecision, createMatchState, enumerateLegalActions } = await import("../src/index.js");
    const state = advanceToDecision(createMatchState(essentialsSetup)).state;
    await placeIdentity(state, "9♣", "P1_HAND", "P1");
    await placeIdentity(state, "Q♣", "P1_HAND", "P1");
    const targetId = await placeIdentity(state, "3♦", "P2_PR", "P2");
    state.cards[targetId].state.pointValue = 3;
    state.metadata.boardLock = { turnsRemaining: 2, activationFullTurnId: state.fullTurnSequence - 1, activatorId: "P2" };
    const frame = enumerateLegalActions(state, { actorId: "P1", visibility: "PLAYER_AUTHORIZED", profileId: "first-contact-essentials", enabledModules: [] });
    assert.deepEqual([...new Set(frame.actions.map((entry) => entry.family))].sort(), ["draw", "pass", "play-for-points"]);
});
test("4.1.2 Essentials Random Legal is deterministic and reaches a normal victory", async () => {
    const { runRandomLegalMatch } = await import("../src/index.js");
    const first = runRandomLegalMatch(essentialsSetup, 800);
    const second = runRandomLegalMatch(essentialsSetup, 800);
    assert.equal(first.terminationReason, "NORMAL_VICTORY");
    assert.equal(hashCanonical({ state: first.state, commands: first.commands, decisions: first.decisions }), hashCanonical({ state: second.state, commands: second.commands, decisions: second.decisions }));
});
test("4.1.2 autonomy capabilities are explicit and fail closed outside teaching overrides", async () => {
    const { autonomousCapabilities, createMatchState } = await import("../src/index.js");
    assert.deepEqual(autonomousCapabilities(), [{
            profileId: "first-contact-baseline",
            playerCounts: [2],
            moduleSets: [[]],
            completeActionFamilies: ["draw", "play-for-points", "scuttle", "pass"],
            status: "SUPPORTED",
            reasonCodes: ["FORMAL_FIRST_CONTACT_TEACHING_OVERRIDE", "GENERIC_EFFECT_ALLOWLIST_EMPTY"]
        }, {
            profileId: "first-contact-response",
            playerCounts: [2],
            moduleSets: [[]],
            completeActionFamilies: ["draw", "play-for-points", "play-for-effect", "scuttle", "pass", "A-base-counter", "8-scuttle-counter", "J-disrupt", "K-anchor-goal-counter"],
            status: "SUPPORTED",
            reasonCodes: ["FORMAL_FIRST_CONTACT_TEACHING_OVERRIDE", "ENGINE_OWNED_PRIORITY", "ENGINE_OWNED_COUNTER_AUTHORITY", "PRIVATE_CHOICE_EFFECTS_EXCLUDED"]
        }, {
            profileId: "first-contact-private-choice",
            playerCounts: [2],
            moduleSets: [[]],
            completeActionFamilies: ["draw", "play-for-points", "play-for-effect", "scuttle", "pass", "A-base-counter", "8-scuttle-counter", "J-disrupt", "K-anchor-goal-counter", "3-opponent-presentation", "3-opponent-discard", "3-caster-take", "5-rummage", "6-private-draw", "7-topdeck-assignment", "7-generated-effect", "9-anchor-opponent-discard"],
            status: "SUPPORTED",
            reasonCodes: ["FORMAL_FIRST_CONTACT_TEACHING_OVERRIDE", "ENGINE_OWNED_PRIORITY", "ENGINE_OWNED_COUNTER_AUTHORITY", "SEALED_PRIVATE_CHOICE_TOKENS", "VIEWER_AUTHORIZED_CHOICE_FRAMES", "SEVEN_SCORING_TRIGGER_EXCLUDED"]
        }, {
            profileId: "first-contact-trigger-closure",
            playerCounts: [2],
            moduleSets: [[]],
            completeActionFamilies: ["draw", "play-for-points", "play-for-effect", "scuttle", "pass", "A-base-counter", "8-scuttle-counter", "J-disrupt", "K-anchor-goal-counter", "3-opponent-presentation", "3-opponent-discard", "3-caster-take", "5-rummage", "6-private-draw", "7-topdeck-assignment", "7-generated-effect", "7-scoring-trigger-take-return", "9-anchor-opponent-discard"],
            status: "SUPPORTED",
            reasonCodes: ["FORMAL_FIRST_CONTACT_TEACHING_OVERRIDE", "ENGINE_OWNED_PRIORITY", "ENGINE_OWNED_COUNTER_AUTHORITY", "SEALED_PRIVATE_CHOICE_TOKENS", "VIEWER_AUTHORIZED_CHOICE_FRAMES", "ENGINE_OWNED_TRIGGER_QUEUE", "SEVEN_SCORING_TRIGGER_SUPPORTED"]
        }, {
            profileId: "first-contact-essentials",
            playerCounts: [2],
            moduleSets: [[]],
            completeActionFamilies: ["draw", "play-for-points", "play-for-effect", "scuttle", "pass"],
            status: "SUPPORTED",
            reasonCodes: ["FORMAL_FIRST_CONTACT_TEACHING_OVERRIDE", "EXPLICIT_GENERIC_EFFECT_ALLOWLIST", "RESPONSE_WINDOW_EFFECTS_EXCLUDED"]
        }]);
    let blocked = false;
    try {
        createMatchState({ ...autonomySetup, profileId: "first-contact" });
    }
    catch (error) {
        blocked = /Unsupported autonomous profile/.test(String(error));
    }
    assert.equal(blocked, true);
});
const responseSetup = { ...autonomySetup, profileId: "first-contact-response", seed: 0x413c0de };
async function executeActionBy(engine, state, frame, predicate) {
    const selected = frame.actions.find((entry) => predicate(entry.actionId));
    assert.ok(selected, `missing action: ${frame.actions.map((entry) => entry.actionId).join(", ")}`);
    const result = engine.execute(state, selected.command);
    assert.equal(result.accepted, true, result.error?.code ?? selected.actionId);
    return result.state;
}
async function passCurrentPriority(engine, state) {
    const { advanceToDecision } = await import("../src/index.js");
    const advanced = advanceToDecision(state);
    assert.equal(advanced.status, "PLAYER_DECISION_REQUIRED");
    assert.ok(advanced.legalActionFrame);
    return executeActionBy(engine, advanced.state, advanced.legalActionFrame, (id) => id.startsWith("pass-priority:"));
}
test("4.1.3 Response Authority seals every root action behind engine-owned priority", async () => {
    const { advanceToDecision, createMatchState } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    const initial = advanceToDecision(createMatchState(responseSetup));
    assert.equal(initial.status, "PLAYER_DECISION_REQUIRED");
    assert.ok(initial.legalActionFrame);
    for (const action of initial.legalActionFrame.actions) {
        assert.equal(action.command.type, "RESOLVE_PHASE9_ACTION");
        if (action.command.type !== "RESOLVE_PHASE9_ACTION")
            throw new Error("unexpected command type");
        assert.equal(action.command.action.kind, "autonomy-declare-response-action");
    }
    const declared = await executeActionBy(engine, initial.state, initial.legalActionFrame, (id) => id.startsWith("draw:"));
    assert.equal(declared.stack.length, 1);
    assert.equal(declared.stack[0].firstContactAuthority?.kind, "primary");
    assert.equal(declared.priority?.open, true);
    assert.equal(declared.priority?.order[declared.priority.index], "P2");
    const response = advanceToDecision(declared);
    assert.equal(response.decisionActorId, "P2");
    assert.ok(response.legalActionFrame?.actions.every((entry) => entry.command.type === "RESOLVE_PHASE9_ACTION" && entry.command.action.kind !== "autonomy-declare-response-action"));
});
test("4.1.3 Base Ace counter chains preserve the root until the winning counter resolves", async () => {
    const { advanceToDecision, createMatchState, enumerateLegalActions } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = advanceToDecision(createMatchState(responseSetup)).state;
    const four = await placeIdentity(state, "4♣", "P1_HAND", "P1");
    const p2Ace = await placeIdentity(state, "A♣", "P2_HAND", "P2");
    const p1Ace = await placeIdentity(state, "A♦", "P1_HAND", "P1");
    const target = await placeIdentity(state, "3♦", "P2_PR", "P2");
    state.cards[target].state.pointValue = 3;
    const rootFrame = enumerateLegalActions(state, { actorId: "P1", visibility: "PLAYER_AUTHORIZED", profileId: "first-contact-response", enabledModules: [] });
    state = await executeActionBy(engine, state, rootFrame, (id) => id.startsWith(`effect-row-clear:pr:${four}`));
    let response = advanceToDecision(state);
    assert.ok(response.legalActionFrame);
    state = await executeActionBy(engine, response.state, response.legalActionFrame, (id) => id.includes(`counter:ace-base:${p2Ace}`));
    response = advanceToDecision(state);
    assert.equal(response.decisionActorId, "P1");
    assert.ok(response.legalActionFrame);
    state = await executeActionBy(engine, response.state, response.legalActionFrame, (id) => id.includes(`counter:ace-base:${p1Ace}`));
    state = await passCurrentPriority(engine, state);
    state = await passCurrentPriority(engine, state);
    response = advanceToDecision(state);
    state = response.state;
    assert.equal(state.stack.length, 1);
    assert.equal(state.cards[p1Ace].zone, "GY");
    assert.equal(state.cards[p2Ace].zone, "GY");
    assert.equal(state.cards[four].zone, "ON_STACK");
    state = await passCurrentPriority(engine, state);
    state = await passCurrentPriority(engine, state);
    state = advanceToDecision(state).state;
    assert.equal(state.cards[four].zone, "GY");
    assert.equal(state.cards[target].zone, "GY");
});
test("4.1.3 Eight counters only a pending Scuttle and preserves its target", async () => {
    const { advanceToDecision, createMatchState, enumerateLegalActions } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = advanceToDecision(createMatchState(responseSetup)).state;
    const source = await placeIdentity(state, "K♣", "P1_HAND", "P1");
    const eight = await placeIdentity(state, "8♣", "P2_HAND", "P2");
    const target = await placeIdentity(state, "3♣", "P2_PR", "P2");
    state.cards[target].state.pointValue = 3;
    const rootFrame = enumerateLegalActions(state, { actorId: "P1", visibility: "PLAYER_AUTHORIZED", profileId: "first-contact-response", enabledModules: [] });
    state = await executeActionBy(engine, state, rootFrame, (id) => id.startsWith(`scuttle:ordinary:${source}:${target}`));
    const response = advanceToDecision(state);
    assert.ok(response.legalActionFrame);
    assert.equal(response.legalActionFrame.actions.some((entry) => entry.actionId.includes(`eight-scuttle:${eight}`)), true);
    state = await executeActionBy(engine, response.state, response.legalActionFrame, (id) => id.includes(`eight-scuttle:${eight}`));
    state = await passCurrentPriority(engine, state);
    state = await passCurrentPriority(engine, state);
    state = advanceToDecision(state).state;
    assert.equal(state.cards[source].zone, "GY");
    assert.equal(state.cards[eight].zone, "GY");
    assert.equal(state.cards[target].zone, "P2_PR");
});
test("4.1.3 King counter is limited to single-card Anchor and Goal-Mod plays", async () => {
    const { advanceToDecision, createMatchState, enumerateLegalActions } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = advanceToDecision(createMatchState(responseSetup)).state;
    const queen = await placeIdentity(state, "Q♣", "P1_HAND", "P1");
    const king = await placeIdentity(state, "K♦", "P2_HAND", "P2");
    let rootFrame = enumerateLegalActions(state, { actorId: "P1", visibility: "PLAYER_AUTHORIZED", profileId: "first-contact-response", enabledModules: [] });
    state = await executeActionBy(engine, state, rootFrame, (id) => id.startsWith(`anchor-guard:queen:${queen}`));
    let response = advanceToDecision(state);
    assert.ok(response.legalActionFrame);
    assert.equal(response.legalActionFrame.actions.some((entry) => entry.actionId.includes(`king-specialized:${king}`)), true);
    state = await executeActionBy(engine, response.state, response.legalActionFrame, (id) => id.includes(`king-specialized:${king}`));
    state = await passCurrentPriority(engine, state);
    state = await passCurrentPriority(engine, state);
    state = advanceToDecision(state).state;
    assert.equal(state.cards[queen].zone, "GY");
    assert.equal(state.cards[king].zone, "GY");
    state = advanceToDecision(createMatchState({ ...responseSetup, seed: 0x413c0df })).state;
    const four = await placeIdentity(state, "4♣", "P1_HAND", "P1");
    const otherKing = await placeIdentity(state, "K♦", "P2_HAND", "P2");
    rootFrame = enumerateLegalActions(state, { actorId: "P1", visibility: "PLAYER_AUTHORIZED", profileId: "first-contact-response", enabledModules: [] });
    state = await executeActionBy(engine, state, rootFrame, (id) => id.startsWith(`effect-row-clear:pr:${four}`));
    response = advanceToDecision(state);
    assert.ok(response.legalActionFrame);
    assert.equal(response.legalActionFrame.actions.some((entry) => entry.actionId.includes(`king-specialized:${otherKing}`)), false);
});
test("4.1.3 Jack Disrupt records the action type, draws one, and never counters the root", async () => {
    const { advanceToDecision, createMatchState, enumerateLegalActions } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = advanceToDecision(createMatchState(responseSetup)).state;
    const jack = await placeIdentity(state, "J♣", "P2_HAND", "P2");
    const beforeHandCount = state.players.P2.hand.length;
    const rootFrame = enumerateLegalActions(state, { actorId: "P1", visibility: "PLAYER_AUTHORIZED", profileId: "first-contact-response", enabledModules: [] });
    state = await executeActionBy(engine, state, rootFrame, (id) => id.startsWith("draw:"));
    let response = advanceToDecision(state);
    assert.ok(response.legalActionFrame);
    state = await executeActionBy(engine, response.state, response.legalActionFrame, (id) => id.includes(`disrupt:jack:${jack}`));
    state = await passCurrentPriority(engine, state);
    state = await passCurrentPriority(engine, state);
    response = advanceToDecision(state);
    state = response.state;
    assert.equal(state.stack.length, 1);
    assert.equal(state.cards[jack].zone, "GY");
    assert.equal(state.players.P2.hand.length, beforeHandCount);
    const runtime = state.metadata.autonomy;
    assert.deepEqual(runtime.disruptedActionTypesByPlayer?.P1, ["draw"]);
    state = await passCurrentPriority(engine, state);
    state = await passCurrentPriority(engine, state);
    state = advanceToDecision(state).state;
    assert.equal(state.stack.length, 0);
    assert.equal(state.phase, "Action");
    assert.deepEqual(state.metadata.autonomy.disruptedActionTypesByPlayer?.P1, []);
});
test("4.1.3 Response Authority Random Legal is deterministic and terminal", async () => {
    const { runRandomLegalMatch } = await import("../src/index.js");
    const first = runRandomLegalMatch(responseSetup, 1400);
    const second = runRandomLegalMatch(responseSetup, 1400);
    assert.ok(["NORMAL_VICTORY", "EXHAUSTED_RESOLUTION", "CANONICAL_DRAW"].includes(first.terminationReason));
    assert.equal(hashCanonical({ state: first.state, commands: first.commands, decisions: first.decisions }), hashCanonical({ state: second.state, commands: second.commands, decisions: second.decisions }));
    assert.ok(first.decisions.some((entry) => entry.actionId.startsWith("pass-priority:")));
});
test("4.1.3 every enumerated response is accepted from its exact decision frame", async () => {
    const { advanceToDecision, createMatchState, enumerateLegalActions } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = advanceToDecision(createMatchState(responseSetup)).state;
    const four = await placeIdentity(state, "4♣", "P1_HAND", "P1");
    await placeIdentity(state, "A♣", "P2_HAND", "P2");
    await placeIdentity(state, "J♣", "P2_HAND", "P2");
    const target = await placeIdentity(state, "3♦", "P2_PR", "P2");
    state.cards[target].state.pointValue = 3;
    const rootFrame = enumerateLegalActions(state, { actorId: "P1", visibility: "PLAYER_AUTHORIZED", profileId: "first-contact-response", enabledModules: [] });
    state = await executeActionBy(engine, state, rootFrame, (id) => id.startsWith(`effect-row-clear:pr:${four}`));
    const response = advanceToDecision(state);
    assert.ok(response.legalActionFrame);
    assert.ok(response.legalActionFrame.actions.length >= 3);
    for (const action of response.legalActionFrame.actions) {
        const result = engine.execute(response.state, action.command);
        assert.equal(result.accepted, true, `${action.actionId}: ${result.error?.code ?? "rejected"}`);
        assert.deepEqual(validateState(result.state), [], action.actionId);
    }
});
test("4.1.3 rejected response authority commands preserve the exact before-image and emit zero events", async () => {
    const { advanceToDecision, createMatchState, enumerateLegalActions } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = advanceToDecision(createMatchState(responseSetup)).state;
    const four = await placeIdentity(state, "4♣", "P1_HAND", "P1");
    const ace = await placeIdentity(state, "A♣", "P2_HAND", "P2");
    const target = await placeIdentity(state, "3♦", "P2_PR", "P2");
    state.cards[target].state.pointValue = 3;
    const rootFrame = enumerateLegalActions(state, { actorId: "P1", visibility: "PLAYER_AUTHORIZED", profileId: "first-contact-response", enabledModules: [] });
    state = await executeActionBy(engine, state, rootFrame, (id) => id.startsWith(`effect-row-clear:pr:${four}`));
    const before = hashCanonical(state);
    const topId = state.stack.at(-1).id;
    const wrongHolder = engine.execute(state, {
        id: "ADVERSARIAL-WRONG-HOLDER",
        type: "RESOLVE_PHASE9_ACTION",
        actorId: "P1",
        action: { kind: "autonomy-declare-ace-counter", sourceCardId: ace, targetStackItemId: topId }
    });
    assert.equal(wrongHolder.accepted, false);
    assert.equal(hashCanonical(wrongHolder.state), before);
    assert.equal(wrongHolder.events.length, 0);
    const wrongTarget = engine.execute(state, {
        id: "ADVERSARIAL-WRONG-TARGET",
        type: "RESOLVE_PHASE9_ACTION",
        actorId: "P2",
        action: { kind: "autonomy-declare-ace-counter", sourceCardId: ace, targetStackItemId: "FC-NOT-TOP" }
    });
    assert.equal(wrongTarget.accepted, false);
    assert.equal(hashCanonical(wrongTarget.state), before);
    assert.equal(wrongTarget.events.length, 0);
});
test("4.1.3 authorized response views expose semantic handles but never the private command vault", async () => {
    const { advanceToDecision, authorizedLegalActionView, createMatchState, enumerateLegalActions } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = advanceToDecision(createMatchState(responseSetup)).state;
    const four = await placeIdentity(state, "4♣", "P1_HAND", "P1");
    await placeIdentity(state, "A♣", "P2_HAND", "P2");
    const target = await placeIdentity(state, "3♦", "P2_PR", "P2");
    state.cards[target].state.pointValue = 3;
    const rootFrame = enumerateLegalActions(state, { actorId: "P1", visibility: "PLAYER_AUTHORIZED", profileId: "first-contact-response", enabledModules: [] });
    state = await executeActionBy(engine, state, rootFrame, (id) => id.startsWith(`effect-row-clear:pr:${four}`));
    const response = advanceToDecision(state);
    assert.ok(response.legalActionFrame);
    for (const action of response.legalActionFrame.actions) {
        const authorized = authorizedLegalActionView(action);
        const text = JSON.stringify(authorized);
        assert.doesNotMatch(text, /"command"|RESOLVE_PHASE9_ACTION|autonomy-declare-|targetStackItemId/);
        assert.match(text, /engineCommandHash/);
        assert.equal("command" in authorized, false);
    }
});
const privateChoiceSetup = { ...autonomySetup, profileId: "first-contact-private-choice", seed: 0x414c001 };
async function resolveRootToNextDecision(engine, state) {
    state = await passCurrentPriority(engine, state);
    state = await passCurrentPriority(engine, state);
    return (await import("../src/index.js")).advanceToDecision(state);
}
test("4.1.4 Private Choice profile enumerates engine-accepted Three, Five, Six, Seven, and Nine Anchor roots", async () => {
    const { advanceToDecision, createMatchState, enumerateLegalActions } = await import("../src/index.js");
    let state = advanceToDecision(createMatchState(privateChoiceSetup)).state;
    for (const identity of ["3♣", "5♣", "6♣", "7♣", "9♣"])
        await placeIdentity(state, identity, "P1_HAND", "P1");
    const target = await placeIdentity(state, "4♦", "P2_PR", "P2");
    state.cards[target].state.pointValue = 4;
    const frame = enumerateLegalActions(state, { actorId: "P1", visibility: "PLAYER_AUTHORIZED", profileId: "first-contact-private-choice", enabledModules: [] });
    const modes = new Set(frame.actions.map((entry) => `${entry.family}:${entry.mode}`));
    for (const expected of ["effect-private-choice:three-present-take", "effect-private-choice:three-force-discard", "effect-private-choice:five-recycle", "effect-private-choice:six-dig", "effect-private-choice:seven-topdeck", "anchor-private-choice:nine"])
        assert.ok(modes.has(expected), expected);
    const engine = new IntrilexEngine();
    for (const action of frame.actions) {
        const result = engine.execute(state, action.command);
        assert.equal(result.accepted, true, `${action.actionId}: ${result.error?.code ?? "rejected"}`);
        assert.deepEqual(validateState(result.state), [], action.actionId);
    }
});
test("4.1.4 every enumerated private-choice action is engine-accepted from its exact frame", async () => {
    const { advanceToDecision, createMatchState, nextIndex } = await import("../src/index.js");
    const required = new Set(["rank3-present", "rank3-take", "rank3-discard", "rank5-rummage", "rank6-dig", "rank7-assign", "rank7-generated-effect", "nine-anchor-discard"]);
    const seen = new Set();
    const engine = new IntrilexEngine();
    for (let ordinal = 0; ordinal <= 10 && seen.size < required.size; ordinal += 1) {
        const seed = ((0x41400000 + Math.imul(ordinal, 0x9e3779b1)) >>> 0) || 1;
        let state = createMatchState({ ...privateChoiceSetup, seed });
        const policyRng = { algorithm: "xorshift32", seed: ((seed ^ 0xa5a5a5a5) >>> 0) || 1, cursor: 0 };
        for (let decisionIndex = 0; decisionIndex < 5000; decisionIndex += 1) {
            const advanced = advanceToDecision(state);
            state = advanced.state;
            if (advanced.status === "TERMINAL")
                break;
            assert.equal(advanced.status, "PLAYER_DECISION_REQUIRED", advanced.reasonCode);
            assert.ok(advanced.legalActionFrame);
            const choice = state.metadata.autonomy.privateChoice;
            if (choice && required.has(choice.kind) && !seen.has(choice.kind)) {
                for (const action of advanced.legalActionFrame.actions) {
                    const probe = engine.execute(state, action.command);
                    assert.equal(probe.accepted, true, `${choice.kind}:${action.actionId}:${probe.error?.code ?? "rejected"}`);
                    assert.deepEqual(validateState(probe.state), [], `${choice.kind}:${action.actionId}`);
                }
                seen.add(choice.kind);
            }
            const selected = advanced.legalActionFrame.actions[nextIndex(policyRng, advanced.legalActionFrame.actions.length)];
            const result = engine.execute(state, selected.command);
            assert.equal(result.accepted, true, result.error?.code);
            state = result.state;
        }
    }
    assert.deepEqual([...seen].sort(), [...required].sort());
});
test("4.1.4 Three presentation is a sealed opponent choice followed by a caster-only take", async () => {
    const { advanceToDecision, createMatchState, enumerateLegalActions, privateStateView, publicStateView } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = advanceToDecision(createMatchState(privateChoiceSetup)).state;
    const three = await placeIdentity(state, "3♣", "P1_HAND", "P1");
    const root = enumerateLegalActions(state, { actorId: "P1", visibility: "PLAYER_AUTHORIZED", profileId: "first-contact-private-choice", enabledModules: [] });
    state = await executeActionBy(engine, state, root, (id) => id.startsWith(`effect-private-choice:three-present-take:${three}`));
    let decision = await resolveRootToNextDecision(engine, state);
    assert.equal(decision.decisionActorId, "P2");
    assert.ok(decision.legalActionFrame?.actions.every((entry) => entry.actionId.startsWith("private-choice:rank3-present:")));
    const runtimeChoice = decision.state.metadata.autonomy.privateChoice;
    const publicText = JSON.stringify(publicStateView(decision.state));
    assert.doesNotMatch(publicText, new RegExp(runtimeChoice.token));
    assert.doesNotMatch(publicText, /optionCardIds|optionsHash/);
    const p1Text = JSON.stringify(privateStateView(decision.state, "P1"));
    assert.doesNotMatch(p1Text, /optionCardIds|optionsHash/);
    const present = decision.legalActionFrame.actions.find((entry) => entry.targetCardIds.length === 1);
    const presentedCardId = present.targetCardIds[0];
    let result = engine.execute(decision.state, present.command);
    assert.equal(result.accepted, true);
    decision = advanceToDecision(result.state);
    assert.equal(decision.decisionActorId, "P1");
    assert.ok(decision.legalActionFrame?.actions.every((entry) => entry.actionId.startsWith("private-choice:rank3-take:")));
    result = engine.execute(decision.state, decision.legalActionFrame.actions[0].command);
    assert.equal(result.accepted, true);
    assert.equal(result.state.cards[presentedCardId].controllerId, "P1");
    assert.equal(result.state.cards[presentedCardId].zone, "P1_HAND");
    assert.equal(result.state.metadata.autonomy.privateChoice, null);
    assert.equal(result.state.phase, "End");
});
test("4.1.4 Six private draw identities are visible only to the authorized chooser", async () => {
    const { advanceToDecision, createMatchState, enumerateLegalActions, privateStateView, publicStateView } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = advanceToDecision(createMatchState({ ...privateChoiceSetup, seed: 0x4146001 })).state;
    const six = await placeIdentity(state, "6♣", "P1_HAND", "P1");
    const root = enumerateLegalActions(state, { actorId: "P1", visibility: "PLAYER_AUTHORIZED", profileId: "first-contact-private-choice", enabledModules: [] });
    state = await executeActionBy(engine, state, root, (id) => id.startsWith(`effect-private-choice:six-dig:${six}`));
    const decision = await resolveRootToNextDecision(engine, state);
    assert.equal(decision.decisionActorId, "P1");
    const choice = decision.state.metadata.autonomy.privateChoice;
    assert.equal(choice.kind, "rank6-dig");
    const secretIdentities = choice.context.drawnCardIds.map((id) => decision.state.cards[id].identity);
    const publicText = JSON.stringify(publicStateView(decision.state));
    const opponentText = JSON.stringify(privateStateView(decision.state, "P2"));
    const chooserText = JSON.stringify(privateStateView(decision.state, "P1"));
    for (const identity of secretIdentities) {
        assert.doesNotMatch(publicText, new RegExp(identity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        assert.doesNotMatch(opponentText, new RegExp(identity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        assert.match(chooserText, new RegExp(identity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
});
test("4.1.4 private-choice secrets never enter public state, events, or replay commands", async () => {
    const { advanceToDecision, createCertifiedReplay, createMatchState, enumerateLegalActions, privateStateView, publicCertifiedReplayView, publicEventView, publicStateView } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = advanceToDecision(createMatchState({ ...privateChoiceSetup, seed: 0x4146CAFE })).state;
    const six = await placeIdentity(state, "6♣", "P1_HAND", "P1");
    const root = enumerateLegalActions(state, { actorId: "P1", visibility: "PLAYER_AUTHORIZED", profileId: "first-contact-private-choice", enabledModules: [] });
    state = await executeActionBy(engine, state, root, (id) => id.startsWith(`effect-private-choice:six-dig:${six}`));
    const decision = await resolveRootToNextDecision(engine, state);
    const choice = decision.state.metadata.autonomy.privateChoice;
    assert.equal(choice.kind, "rank6-dig");
    const secretIds = [...choice.optionCardIds];
    const secretIdentities = secretIds.map((id) => decision.state.cards[id].identity);
    const command = decision.legalActionFrame.actions[0].command;
    const result = engine.execute(decision.state, command);
    assert.equal(result.accepted, true, result.error?.code);
    const publicText = canonicalize(publicStateView(decision.state));
    const opponentText = canonicalize(privateStateView(decision.state, "P2"));
    const chooserText = canonicalize(privateStateView(decision.state, "P1"));
    const publicEventsText = canonicalize(publicEventView(result.events));
    const replay = createReplay("PRIVATE-CHOICE-CANARY", decision.state, [command], { state: result.state, events: result.events, accepted: [true] });
    const publicReplayText = canonicalize(publicReplayView(replay));
    const certifiedReplayText = canonicalize(publicCertifiedReplayView(createCertifiedReplay("PRIVATE-CHOICE-CANARY-V2", decision.state, [command], "4.1.4")));
    assert.doesNotMatch(certifiedReplayText, new RegExp(choice.token));
    assert.match(certifiedReplayText, /REDACTED/);
    assert.doesNotMatch(publicText, /privateChoiceHeldBy|privateChoicePublicReveal|privateChoiceSource/);
    assert.doesNotMatch(opponentText, /privateChoiceHeldBy|privateChoicePublicReveal|privateChoiceSource/);
    assert.match(chooserText, /rank6-dig/);
    assert.doesNotMatch(publicReplayText, new RegExp(choice.token));
    assert.match(publicReplayText, /REDACTED/);
    assert.match(publicEventsText, /redacted/);
    for (const secretId of secretIds) {
        const pattern = new RegExp(`"${String(secretId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`);
        assert.doesNotMatch(publicText, pattern);
        assert.doesNotMatch(opponentText, pattern);
        assert.doesNotMatch(publicEventsText, pattern);
        assert.doesNotMatch(publicReplayText, pattern);
        assert.doesNotMatch(certifiedReplayText, pattern);
    }
    for (const identity of secretIdentities) {
        const pattern = new RegExp(`"identity":"${String(identity).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`);
        assert.doesNotMatch(publicText, pattern);
        assert.doesNotMatch(opponentText, pattern);
        assert.doesNotMatch(publicEventsText, pattern);
        assert.doesNotMatch(publicReplayText, pattern);
        assert.doesNotMatch(certifiedReplayText, pattern);
    }
});
test("4.1.4 Seven generated effect becomes a response-stack child play", async () => {
    const { advanceToDecision, createMatchState, enumerateLegalActions, moveCard } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = advanceToDecision(createMatchState({ ...privateChoiceSetup, seed: 0x4147001 })).state;
    const seven = await placeIdentity(state, "7♣", "P1_HAND", "P1");
    const generatedFive = Object.values(state.cards).find((entry) => entry.identity === "5♦");
    moveCard(state, generatedFive.id, "DP");
    const index = state.zones.dp.indexOf(generatedFive.id);
    state.zones.dp.splice(index, 1);
    state.zones.dp.unshift(generatedFive.id);
    const other = state.zones.dp[1];
    const root = enumerateLegalActions(state, { actorId: "P1", visibility: "PLAYER_AUTHORIZED", profileId: "first-contact-private-choice", enabledModules: [] });
    state = await executeActionBy(engine, state, root, (id) => id.startsWith(`effect-private-choice:seven-topdeck:${seven}`));
    let decision = await resolveRootToNextDecision(engine, state);
    assert.equal(decision.state.metadata.autonomy.privateChoice.kind, "rank7-assign");
    const assignment = decision.legalActionFrame.actions.find((entry) => entry.actionId.includes(`effect-${generatedFive.id}`));
    assert.ok(assignment);
    let result = engine.execute(decision.state, assignment.command);
    assert.equal(result.accepted, true);
    decision = advanceToDecision(result.state);
    assert.equal(decision.state.metadata.autonomy.privateChoice.kind, "rank7-generated-effect");
    const generated = decision.legalActionFrame.actions.find((entry) => entry.actionId.includes("autonomy-five-recycle"));
    assert.ok(generated, `${decision.legalActionFrame.actions.map((entry) => entry.actionId).join(", ")}; other=${other}`);
    result = engine.execute(decision.state, generated.command);
    assert.equal(result.accepted, true, result.error?.code);
    assert.equal(result.state.stack.length, 1);
    assert.equal(result.state.stack[0].sourceCardIds[0], generatedFive.id);
    assert.equal(result.state.priority?.open, true);
    assert.equal(result.state.cards[seven].zone, "GY");
});
test("4.1.4 stale, tampered, and wrong-viewer private choice commands rewind exactly", async () => {
    const { advanceToDecision, createMatchState, enumerateLegalActions } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = advanceToDecision(createMatchState({ ...privateChoiceSetup, seed: 0x4149001 })).state;
    const nine = await placeIdentity(state, "9♣", "P1_HAND", "P1");
    const root = enumerateLegalActions(state, { actorId: "P1", visibility: "PLAYER_AUTHORIZED", profileId: "first-contact-private-choice", enabledModules: [] });
    state = await executeActionBy(engine, state, root, (id) => id.startsWith(`anchor-private-choice:nine:${nine}`));
    const decision = await resolveRootToNextDecision(engine, state);
    assert.equal(decision.decisionActorId, "P2");
    const valid = decision.legalActionFrame.actions[0].command;
    assert.equal(valid.type, "RESOLVE_PHASE9_ACTION");
    if (valid.type !== "RESOLVE_PHASE9_ACTION" || valid.action.kind !== "autonomy-submit-private-choice")
        throw new Error("unexpected choice command");
    const before = hashCanonical(decision.state);
    for (const command of [{ ...valid, id: "WRONG-VIEWER", actorId: "P1" }, { ...valid, id: "BAD-TOKEN", action: { ...valid.action, token: `00${valid.action.token.slice(2)}` } }]) {
        const result = engine.execute(decision.state, command);
        assert.equal(result.accepted, false);
        assert.equal(hashCanonical(result.state), before);
        assert.equal(result.events.length, 0);
    }
});
test("4.1.4 response-window exhaustion and attachment-bounce regression seeds terminate canonically", async () => {
    const { runRandomLegalMatch } = await import("../src/index.js");
    for (const seed of [1877508867, 1603237266]) {
        const result = runRandomLegalMatch({ ...privateChoiceSetup, seed }, 5000);
        assert.ok(["NORMAL_VICTORY", "EXHAUSTED_RESOLUTION", "CANONICAL_DRAW"].includes(result.terminationReason), `${seed}: ${result.terminationReason}`);
        assert.deepEqual(validateState(result.state), [], String(seed));
    }
});
test("4.1.4 Private Choice Random Legal is deterministic and terminal", async () => {
    const { runRandomLegalMatch } = await import("../src/index.js");
    const first = runRandomLegalMatch(privateChoiceSetup, 5000);
    const second = runRandomLegalMatch(privateChoiceSetup, 5000);
    assert.ok(["NORMAL_VICTORY", "EXHAUSTED_RESOLUTION", "CANONICAL_DRAW"].includes(first.terminationReason), first.terminationReason);
    assert.equal(hashCanonical({ state: first.state, commands: first.commands, decisions: first.decisions }), hashCanonical({ state: second.state, commands: second.commands, decisions: second.decisions }));
    assert.ok(first.decisions.some((entry) => entry.actionId.startsWith("private-choice:")));
});
const triggerClosureSetup = { ...autonomySetup, profileId: "first-contact-trigger-closure", seed: 9 };
async function prepareSevenScoringTrigger() {
    const { advanceToDecision, createMatchState, enumerateLegalActions, moveCard } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = advanceToDecision(createMatchState(triggerClosureSetup)).state;
    const seven = await placeIdentity(state, "7♣", "P1_HAND", "P1");
    const revealA = Object.values(state.cards).find((entry) => entry.identity === "2♦");
    const revealB = Object.values(state.cards).find((entry) => entry.identity === "5♦");
    moveCard(state, revealA.id, "DP");
    moveCard(state, revealB.id, "DP");
    state.zones.dp = [revealA.id, revealB.id, ...state.zones.dp.filter((id) => id !== revealA.id && id !== revealB.id)];
    for (const identity of ["A♦", "8♦", "J♦", "K♦"])
        await placeIdentity(state, identity, "P2_HAND", "P2");
    const frame = enumerateLegalActions(state, { actorId: "P1", visibility: "PLAYER_AUTHORIZED", profileId: "first-contact-trigger-closure", enabledModules: [] });
    state = await executeActionBy(engine, state, frame, (id) => id.startsWith(`play-for-points:score-pr:${seven}`));
    state = await passCurrentPriority(engine, state);
    state = await passCurrentPriority(engine, state);
    const triggerPriority = advanceToDecision(state);
    return { engine, state: triggerPriority.state, triggerPriority, seven, revealA, revealB };
}
test("4.1.5 scoring Seven queues and flushes an engine-owned non-play trigger", async () => {
    const { triggerPriority, seven } = await prepareSevenScoringTrigger();
    assert.equal(triggerPriority.status, "PLAYER_DECISION_REQUIRED");
    assert.equal(triggerPriority.state.triggerQueue.length, 0);
    assert.equal(triggerPriority.state.stack.length, 1);
    assert.equal(triggerPriority.state.stack[0].firstContactAuthority?.kind, "seven-scoring-trigger");
    assert.equal(triggerPriority.state.cards[seven].zone, "P1_PR");
    assert.ok(triggerPriority.executedCommands.some((command) => command.type === "RESOLVE_PHASE9_ACTION" && command.action.kind === "autonomy-flush-trigger-queue"));
    assert.ok(triggerPriority.events.some((event) => event.type === "AUTONOMY_SEVEN_SCORING_TRIGGER_QUEUED"));
    assert.ok(triggerPriority.events.some((event) => event.type === "AUTONOMY_TRIGGER_QUEUE_FLUSHED"));
});
test("4.1.5 Seven scoring trigger exposes pass only and rejects every play-response family", async () => {
    const { engine, state, triggerPriority } = await prepareSevenScoringTrigger();
    assert.ok(triggerPriority.legalActionFrame);
    assert.deepEqual(triggerPriority.legalActionFrame.actions.map((entry) => entry.family), ["pass-priority"]);
    const top = state.stack.at(-1);
    const before = hashCanonical(state);
    const sources = Object.fromEntries(Object.values(state.cards).filter((card) => card.zone === "P2_HAND").map((card) => [card.identity, card.id]));
    const commands = [
        { id: "BAD-ACE", type: "RESOLVE_PHASE9_ACTION", actorId: "P2", action: { kind: "autonomy-declare-ace-counter", sourceCardId: sources["A♦"], targetStackItemId: top.id } },
        { id: "BAD-EIGHT", type: "RESOLVE_PHASE9_ACTION", actorId: "P2", action: { kind: "autonomy-declare-eight-scuttle-counter", sourceCardId: sources["8♦"], targetStackItemId: top.id } },
        { id: "BAD-KING", type: "RESOLVE_PHASE9_ACTION", actorId: "P2", action: { kind: "autonomy-declare-king-counter", sourceCardId: sources["K♦"], targetStackItemId: top.id } },
        { id: "BAD-JACK", type: "RESOLVE_PHASE9_ACTION", actorId: "P2", action: { kind: "autonomy-declare-jack-disrupt", sourceCardId: sources["J♦"], targetStackItemId: top.id } }
    ];
    for (const command of commands) {
        const result = engine.execute(state, command);
        assert.equal(result.accepted, false, command.id);
        assert.equal(hashCanonical(result.state), before, command.id);
        assert.equal(result.events.length, 0, command.id);
    }
});
test("4.1.5 Seven trigger seals take/return choice and applies First Contact hidden-hand override", async () => {
    const { advanceToDecision, privateStateView, publicStateView } = await import("../src/index.js");
    const prepared = await prepareSevenScoringTrigger();
    let state = await passCurrentPriority(prepared.engine, prepared.state);
    state = await passCurrentPriority(prepared.engine, state);
    const decision = advanceToDecision(state);
    assert.equal(decision.decisionActorId, "P1");
    assert.equal(decision.state.metadata.autonomy.privateChoice.kind, "rank7-scoring-trigger");
    assert.equal(decision.legalActionFrame?.actions.length, 2);
    const revealedPublicText = canonicalize(publicStateView(decision.state));
    assert.match(revealedPublicText, /2♦/);
    assert.match(revealedPublicText, /5♦/);
    const selected = decision.legalActionFrame.actions.find((entry) => entry.targetCardIds.includes(prepared.revealA.id));
    const result = prepared.engine.execute(decision.state, selected.command);
    assert.equal(result.accepted, true, result.error?.code);
    assert.equal(result.state.cards[prepared.revealA.id].zone, "P1_HAND");
    assert.equal(result.state.cards[prepared.revealA.id].state.revealedUntil, undefined);
    assert.equal(result.state.zones.dp[0], prepared.revealB.id);
    assert.equal(result.state.metadata.autonomy.privateChoice, null);
    const publicText = canonicalize(publicStateView(result.state));
    const opponentText = canonicalize(privateStateView(result.state, "P2"));
    assert.doesNotMatch(publicText, new RegExp(prepared.revealA.id));
    assert.doesNotMatch(publicText, /2♦/);
    assert.doesNotMatch(opponentText, /2♦/);
});
test("4.1.5 stale, tampered, and wrong-viewer Seven trigger choices exact-rewind", async () => {
    const { advanceToDecision } = await import("../src/index.js");
    const prepared = await prepareSevenScoringTrigger();
    let state = await passCurrentPriority(prepared.engine, prepared.state);
    state = await passCurrentPriority(prepared.engine, state);
    const decision = advanceToDecision(state);
    const valid = decision.legalActionFrame.actions[0].command;
    assert.equal(valid.type, "RESOLVE_PHASE9_ACTION");
    if (valid.type !== "RESOLVE_PHASE9_ACTION" || valid.action.kind !== "autonomy-submit-private-choice")
        throw new Error("unexpected Seven choice command");
    const before = hashCanonical(decision.state);
    const badCommands = [
        { ...valid, id: "WRONG-ACTOR", actorId: "P2" },
        { ...valid, id: "BAD-TOKEN", action: { ...valid.action, token: `00${valid.action.token.slice(2)}` } },
        { ...valid, id: "BAD-SELECTION", action: { ...valid.action, submission: { kind: "rank7-scoring-trigger", selectedCardIds: [prepared.seven] } } }
    ];
    for (const command of badCommands) {
        const result = prepared.engine.execute(decision.state, command);
        assert.equal(result.accepted, false, command.id);
        assert.equal(hashCanonical(result.state), before, command.id);
        assert.equal(result.events.length, 0, command.id);
    }
});
test("4.1.5 Trigger Closure Random Legal is deterministic, terminal, and exercises Seven scoring", async () => {
    const { runRandomLegalMatch } = await import("../src/index.js");
    const first = runRandomLegalMatch(triggerClosureSetup, 5000);
    const second = runRandomLegalMatch(triggerClosureSetup, 5000);
    assert.ok(["NORMAL_VICTORY", "EXHAUSTED_RESOLUTION", "CANONICAL_DRAW"].includes(first.terminationReason), first.terminationReason);
    assert.equal(hashCanonical({ state: first.state, commands: first.commands, decisions: first.decisions }), hashCanonical({ state: second.state, commands: second.commands, decisions: second.decisions }));
    assert.ok(first.events.some((event) => event.type === "AUTONOMY_SEVEN_SCORING_TRIGGER_QUEUED"));
    assert.ok(first.events.some((event) => event.type === "AUTONOMY_SEVEN_SCORING_TRIGGER_RESOLVED"));
    assert.ok(first.decisions.some((entry) => entry.actionId.startsWith("private-choice:rank7-scoring-trigger:")));
});
test("4.1.5 Trigger Closure declares the complete canonical First Contact generic surface", async () => {
    const { FIRST_CONTACT_TRIGGER_CLOSURE_PROFILE } = await import("../src/index.js");
    assert.deepEqual([...FIRST_CONTACT_TRIGGER_CLOSURE_PROFILE.enabledGenericEffects], [
        "3-hand-raid", "3-bounce", "4-row-clear", "5-recycle", "6-dig", "7-topdeck-cast",
        "9-tap", "9-goal-shift", "9-anchor", "J-pr-attachment", "Q-anchor-guard", "K-anchor",
        "RJ-hand-swap", "RJ-self-reset", "RJ-opponent-attack", "RJ-shuffle-reset", "BJ-board-lock"
    ]);
    assert.deepEqual([...FIRST_CONTACT_TRIGGER_CLOSURE_PROFILE.enabledResponses], ["A-base-counter", "8-scuttle-counter", "J-disrupt", "K-anchor-goal-counter"]);
    assert.deepEqual([...FIRST_CONTACT_TRIGGER_CLOSURE_PROFILE.enabledTriggeredEffects], ["7-scoring-trigger"]);
    assert.deepEqual([...FIRST_CONTACT_TRIGGER_CLOSURE_PROFILE.excludedGenericEffects], []);
    assert.deepEqual([...FIRST_CONTACT_TRIGGER_CLOSURE_PROFILE.excludedTriggeredEffects], []);
});
test("4.2.0 Core Foundation creates canonical two-player setup and mixed Swap Bar", async () => {
    const { createCoreMatchState, CORE_FOUNDATION_AUTHORITY_PROFILE } = await import("../src/index.js");
    const state = createCoreMatchState({ profileId: CORE_FOUNDATION_AUTHORITY_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 420 });
    assert.equal(Object.keys(state.cards).length, 54);
    assert.equal(state.players.P1.hand.length, 5);
    assert.equal(state.players.P2.hand.length, 6);
    assert.equal(state.zones.dp.length, 40);
    assert.equal(state.zones.swapBar.length, 3);
    assert.equal(state.zones.swapBar.filter((id) => state.cards[id].state.swapBarFaceDown === true).length, 2);
    assert.equal(state.zones.swapBar.filter((id) => state.cards[id].state.swapBarFaceUp === true).length, 1);
    assert.equal(state.players.P1.goal, 21);
    assert.equal(state.players.P2.goal, 21);
    assert.equal(state.phase, "Start");
    assert.equal(state.activePlayerId, "P1");
});
test("4.2.0 Core public projection hides face-down Swap Bar identity and stable id", async () => {
    const { createCoreMatchState, CORE_FOUNDATION_AUTHORITY_PROFILE, publicStateView } = await import("../src/index.js");
    const state = createCoreMatchState({ profileId: CORE_FOUNDATION_AUTHORITY_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 421 });
    const faceDownId = state.zones.swapBar.find((id) => state.cards[id].state.swapBarFaceDown === true);
    const faceDownIdentity = state.cards[faceDownId].identity;
    const faceUpId = state.zones.swapBar.find((id) => state.cards[id].state.swapBarFaceUp === true);
    const faceUpIdentity = state.cards[faceUpId].identity;
    const text = canonicalize(publicStateView(state));
    assert.doesNotMatch(text, new RegExp(faceDownId));
    assert.doesNotMatch(text, new RegExp(faceDownIdentity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(text, new RegExp(faceUpIdentity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
test("4.2.0 Core legal action frame is engine-sound and authorized view hides commands", async () => {
    const { advanceCoreToDecision, createCoreMatchState, CORE_FOUNDATION_AUTHORITY_PROFILE, toAuthorizedCoreAction } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = createCoreMatchState({ profileId: CORE_FOUNDATION_AUTHORITY_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 422 });
    let decision = advanceCoreToDecision(state);
    assert.equal(decision.status, "PLAYER_DECISION_REQUIRED");
    assert.ok(decision.legalActionFrame.actions.some((entry) => entry.family === "swap-bar"));
    for (const entry of decision.legalActionFrame.actions)
        assert.equal(engine.execute(decision.state, entry.command).accepted, true, entry.actionId);
    const enter = decision.legalActionFrame.actions.find((entry) => entry.mode === "enter-action");
    state = engine.execute(decision.state, enter.command).state;
    decision = advanceCoreToDecision(state);
    assert.ok(decision.legalActionFrame.actions.some((entry) => entry.family === "draw"));
    assert.ok(decision.legalActionFrame.actions.some((entry) => entry.family === "score"));
    assert.ok(decision.legalActionFrame.actions.some((entry) => entry.family === "pass"));
    for (const entry of decision.legalActionFrame.actions)
        assert.equal(engine.execute(decision.state, entry.command).accepted, true, entry.actionId);
    const authorized = toAuthorizedCoreAction(decision.legalActionFrame.actions[0]);
    assert.equal("command" in authorized, false);
    assert.equal(typeof authorized.engineCommandHash, "string");
});
test("4.2.0 Core Swap Bar use is once per FT and Core Start does not auto-untap", async () => {
    const { advanceCoreToDecision, createCoreMatchState, CORE_FOUNDATION_AUTHORITY_PROFILE } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = createCoreMatchState({ profileId: CORE_FOUNDATION_AUTHORITY_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 423 });
    const scored = state.players.P1.hand[0];
    state.cards[scored].state.pointValue = 3;
    state.players.P1.hand.splice(state.players.P1.hand.indexOf(scored), 1);
    state.players.P1.pr.push(scored);
    state.cards[scored].zone = "P1_PR";
    state.cards[scored].state.tapped = true;
    let decision = advanceCoreToDecision(state);
    assert.equal(decision.state.cards[scored].state.tapped, true);
    const swap = decision.legalActionFrame.actions.find((entry) => entry.mode === "face-down");
    state = engine.execute(decision.state, swap.command).state;
    decision = advanceCoreToDecision(state);
    assert.equal(decision.legalActionFrame.actions.some((entry) => entry.mode === "face-down"), false);
    const enter = decision.legalActionFrame.actions.find((entry) => entry.mode === "enter-action");
    state = engine.execute(decision.state, enter.command).state;
    decision = advanceCoreToDecision(state);
    assert.equal(decision.legalActionFrame.actions.some((entry) => entry.mode === "face-up-draw"), false);
});
test("4.2.0 Core Foundation Random Legal is deterministic and terminal", async () => {
    const { runCoreRandomLegalMatch, CORE_FOUNDATION_AUTHORITY_PROFILE } = await import("../src/index.js");
    const setup = { profileId: CORE_FOUNDATION_AUTHORITY_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 4242 };
    const first = runCoreRandomLegalMatch(setup, 2000);
    const second = runCoreRandomLegalMatch(setup, 2000);
    assert.ok(["NORMAL_VICTORY", "EXHAUSTED_RESOLUTION", "CANONICAL_DRAW"].includes(first.terminationReason), first.terminationReason);
    assert.equal(hashCanonical({ state: first.state, commands: first.commands, decisions: first.decisions }), hashCanonical({ state: second.state, commands: second.commands, decisions: second.decisions }));
    assert.equal(first.terminationReason, "NORMAL_VICTORY");
});
test("4.2.1 Core Effect profile exposes only audited public single-card effects", async () => {
    const { CORE_EFFECT_DECLARATION_PROFILE, coreAuthorityCapabilities } = await import("../src/index.js");
    assert.deepEqual([...CORE_EFFECT_DECLARATION_PROFILE.supportedEffects], [
        "A-purge", "A-anchor", "3-bounce", "4-row-clear", "4-spade-total-clear", "J-attachment", "Q-anchor", "K-anchor", "RJ-four-modes", "BJ-board-lock"
    ]);
    assert.deepEqual([...CORE_EFFECT_DECLARATION_PROFILE.excludedSystems], [
        "private-choice-effects", "quick-timing", "instant-timing", "response-windows", "supers", "rank10", "voltage", "ultras", "royal-marriage", "optional-modules", "multiplayer"
    ]);
    const capability = coreAuthorityCapabilities().find((entry) => entry.profileId === CORE_EFFECT_DECLARATION_PROFILE.id);
    assert.equal(capability.status, "SUPPORTED");
    assert.ok(capability.reasonCodes.includes("PRIVATE_CHOICE_EFFECTS_FAIL_CLOSED"));
});
test("4.2.1 every enumerated Core effect declaration is engine-accepted and command-vault isolated", async () => {
    const { advanceCoreToDecision, createCoreMatchState, CORE_EFFECT_DECLARATION_PROFILE, moveCard, applyAegis, toAuthorizedCoreAction } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = createCoreMatchState({ profileId: CORE_EFFECT_DECLARATION_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 42101 });
    let frame = advanceCoreToDecision(state);
    state = engine.execute(frame.state, frame.legalActionFrame.actions.find((entry) => entry.mode === "enter-action").command).state;
    const byIdentity = Object.fromEntries(Object.values(state.cards).map((card) => [card.identity, card.id]));
    for (const identity of ["A♣", "3♣", "4♣", "4♠", "J♣", "J♠", "Q♣", "K♠", "RJ", "BJ"])
        moveCard(state, byIdentity[identity], "P1_HAND", "P1");
    moveCard(state, byIdentity["2♣"], "P2_PR", "P2");
    state.cards[byIdentity["2♣"]].state.pointValue = 2;
    moveCard(state, byIdentity["K♣"], "P2_ER", "P2");
    state.cards[byIdentity["K♣"]].state.anchorValue = 7;
    applyAegis(state.cards[byIdentity["K♣"]], "TEST", { playerId: "P2", startSequence: 99 });
    frame = advanceCoreToDecision(state);
    const families = new Set(frame.legalActionFrame.actions.map((entry) => entry.family));
    for (const required of ["effect-ace", "effect-three", "effect-four", "attachment", "anchor", "effect-red-joker", "effect-board-lock"])
        assert.equal(families.has(required), true, required);
    for (const entry of frame.legalActionFrame.actions)
        assert.equal(engine.execute(frame.state, entry.command).accepted, true, `${entry.family}:${entry.mode}`);
    const authorized = frame.legalActionFrame.actions.map(toAuthorizedCoreAction);
    assert.equal(authorized.some((entry) => "command" in entry), false);
    const serialized = canonicalize(authorized);
    assert.doesNotMatch(serialized, /core-resolve-effect|sourceCardId|targetPlayerId/);
    assert.equal(frame.legalActionFrame.actions.some((entry) => ["five", "six", "seven", "rank10", "super", "quick", "instant"].some((token) => `${entry.family}:${entry.mode}`.includes(token))), false);
});
test("4.2.1 Guard, Aegis, rank immunity, and Q-spade clear immunity prune effect targets before policy selection", async () => {
    const { advanceCoreToDecision, createCoreMatchState, CORE_EFFECT_DECLARATION_PROFILE, moveCard, applyAegis } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = createCoreMatchState({ profileId: CORE_EFFECT_DECLARATION_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 42102 });
    let decision = advanceCoreToDecision(state);
    state = engine.execute(decision.state, decision.legalActionFrame.actions.find((entry) => entry.mode === "enter-action").command).state;
    const by = Object.fromEntries(Object.values(state.cards).map((card) => [card.identity, card.id]));
    for (const identity of ["3♣", "4♣", "J♣"])
        moveCard(state, by[identity], "P1_HAND", "P1");
    moveCard(state, by["Q♥"], "P2_ER", "P2");
    state.cards[by["Q♥"]].state.anchorValue = 0;
    moveCard(state, by["4♦"], "P2_PR", "P2");
    state.cards[by["4♦"]].state.pointValue = 4;
    moveCard(state, by["Q♠"], "P2_ER", "P2");
    state.cards[by["Q♠"]].state.anchorValue = 0;
    moveCard(state, by["2♥"], "P2_PR", "P2");
    state.cards[by["2♥"]].state.pointValue = 2;
    applyAegis(state.cards[by["2♥"]], "TEST", { playerId: "P2", startSequence: 99 });
    decision = advanceCoreToDecision(state);
    const actions = decision.legalActionFrame.actions;
    assert.equal(actions.some((entry) => entry.family === "effect-three" && entry.targetCardIds.includes(by["4♦"])), false, "Guard/rank immunity blocks bounce");
    assert.equal(actions.some((entry) => entry.family === "attachment" && entry.targetCardIds.includes(by["4♦"])), false, "Guard/rank immunity blocks Jack");
    const clear = actions.find((entry) => entry.family === "effect-four" && entry.mode === "clear-er");
    const result = engine.execute(decision.state, clear.command);
    assert.equal(result.accepted, true);
    assert.equal(result.state.cards[by["Q♠"]].zone, "P2_ER");
    assert.equal(result.state.cards[by["Q♥"]].zone, "GY");
});
test("4.2.1 Board Lock removes effects and Scuttle while preserving allowed Core actions and expires canonically", async () => {
    const { advanceCoreToDecision, createCoreMatchState, CORE_EFFECT_DECLARATION_PROFILE, moveCard } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = createCoreMatchState({ profileId: CORE_EFFECT_DECLARATION_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 42103 });
    let decision = advanceCoreToDecision(state);
    state = engine.execute(decision.state, decision.legalActionFrame.actions.find((entry) => entry.mode === "enter-action").command).state;
    const bj = Object.values(state.cards).find((card) => card.identity === "BJ");
    moveCard(state, bj.id, "P1_HAND", "P1");
    decision = advanceCoreToDecision(state);
    const lock = decision.legalActionFrame.actions.find((entry) => entry.family === "effect-board-lock");
    state = engine.execute(decision.state, lock.command).state;
    decision = advanceCoreToDecision(state);
    assert.equal(decision.legalActionFrame.actions.some((entry) => entry.family.startsWith("effect") || entry.family === "attachment" || entry.family === "anchor" || entry.family === "scuttle"), false);
    assert.equal(decision.legalActionFrame.actions.some((entry) => entry.family === "phase" && entry.mode === "enter-action"), true);
    state = engine.execute(decision.state, decision.legalActionFrame.actions.find((entry) => entry.family === "phase" && entry.mode === "enter-action").command).state;
    decision = advanceCoreToDecision(state);
    assert.equal(decision.legalActionFrame.actions.some((entry) => entry.family === "pass"), true);
    assert.equal(decision.legalActionFrame.actions.some((entry) => entry.family === "draw" || entry.family === "score"), true);
});
test("4.2.1 Core Effect Random Legal is deterministic, terminal, and exercises effect declarations", async () => {
    const { runCoreRandomLegalMatch, CORE_EFFECT_DECLARATION_PROFILE } = await import("../src/index.js");
    const setup = { profileId: CORE_EFFECT_DECLARATION_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 42104 };
    const first = runCoreRandomLegalMatch(setup, 3000), second = runCoreRandomLegalMatch(setup, 3000);
    assert.ok(["NORMAL_VICTORY", "EXHAUSTED_RESOLUTION", "CANONICAL_DRAW"].includes(first.terminationReason), first.terminationReason);
    assert.equal(hashCanonical({ state: first.state, commands: first.commands, decisions: first.decisions }), hashCanonical({ state: second.state, commands: second.commands, decisions: second.decisions }));
    assert.ok(first.events.some((event) => event.type.startsWith("CORE_") && /PURGE|BOUNCE|CLEAR|ANCHOR|ATTACHMENT|JOKER/.test(event.type)));
});
test("4.2.2 Core Response profile declares the audited timing surface and fail-closed exclusions", async () => {
    const { CORE_RESPONSE_AUTHORITY_PROFILE, coreAuthorityCapabilities } = await import("../src/index.js");
    assert.deepEqual([...CORE_RESPONSE_AUTHORITY_PROFILE.supportedResponses], [
        "A-base-counter", "A-anchor-counter", "A-spade-exile-counter", "8-scuttle-counter",
        "8-spade-free-scuttle", "8-aegis-field-quick", "9-tap", "J-disrupt",
        "Q-aegis-quick", "K-anchor-counter"
    ]);
    assert.deepEqual([...CORE_RESPONSE_AUTHORITY_PROFILE.excludedSystems], [
        "private-choice-effects", "two-quick", "four-natural-quick", "six-swap-peek-quick",
        "nine-goal-shift", "rank10-interrupt", "supers", "ultras", "voltage",
        "royal-marriage", "optional-modules", "multiplayer"
    ]);
    const capability = coreAuthorityCapabilities().find((entry) => entry.profileId === CORE_RESPONSE_AUTHORITY_PROFILE.id);
    assert.equal(capability.status, "SUPPORTED");
    assert.ok(capability.reasonCodes.includes("ENGINE_OWNED_PRIORITY_CIRCULATION"));
    assert.ok(capability.reasonCodes.includes("COUNTER_ON_COUNTER_CHAINS"));
    assert.ok(capability.reasonCodes.includes("PRIVATE_CHOICE_AND_INTERRUPT_FAMILIES_FAIL_CLOSED"));
});
test("4.2.2 root effects are sealed on stack and every enumerated response is engine-accepted without command-vault leakage", async () => {
    const { advanceCoreToDecision, createCoreMatchState, CORE_RESPONSE_AUTHORITY_PROFILE, moveCard, toAuthorizedCoreAction } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = createCoreMatchState({ profileId: CORE_RESPONSE_AUTHORITY_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 42201 });
    let decision = advanceCoreToDecision(state);
    state = engine.execute(decision.state, decision.legalActionFrame.actions.find((entry) => entry.mode === "enter-action").command).state;
    const by = Object.fromEntries(Object.values(state.cards).map((card) => [card.identity, card.id]));
    for (const identity of ["3♣", "A♣", "8♠", "9♣", "J♣", "K♣", "Q♣"])
        moveCard(state, by[identity], identity === "3♣" ? "P1_HAND" : "P2_HAND", identity === "3♣" ? "P1" : "P2");
    moveCard(state, by["2♣"], "P2_PR", "P2");
    state.cards[by["2♣"]].state.pointValue = 2;
    moveCard(state, by["4♣"], "P2_PR", "P2");
    state.cards[by["4♣"]].state.pointValue = 4;
    moveCard(state, by["2♦"], "P1_PR", "P1");
    state.cards[by["2♦"]].state.pointValue = 2;
    decision = advanceCoreToDecision(state);
    const root = decision.legalActionFrame.actions.find((entry) => entry.family === "effect-three" && entry.targetCardIds.includes(by["2♣"]));
    assert.ok(root);
    const declared = engine.execute(decision.state, root.command);
    assert.equal(declared.accepted, true);
    assert.equal(declared.state.stack.length, 1);
    assert.equal(declared.state.stack[0].coreAuthority?.kind, "primary");
    assert.equal(declared.state.priority?.open, true);
    const response = advanceCoreToDecision(declared.state);
    assert.equal(response.decisionActorId, "P2");
    const families = new Set(response.legalActionFrame.actions.map((entry) => `${entry.family}:${entry.mode}`));
    for (const expected of ["pass-priority:pass", "counter:ace-base", "instant:eight-spade-free-scuttle", "instant:nine-tap", "disrupt:jack"])
        assert.equal(families.has(expected), true, expected);
    assert.equal(families.has("counter:eight-scuttle"), false, "Eight counter is restricted to Scuttle");
    assert.equal(families.has("counter:king-anchor"), false, "King counter is restricted to Anchor plays");
    for (const entry of response.legalActionFrame.actions)
        assert.equal(engine.execute(response.state, entry.command).accepted, true, `${entry.family}:${entry.mode}`);
    const authorized = response.legalActionFrame.actions.map(toAuthorizedCoreAction);
    assert.equal(authorized.some((entry) => "command" in entry), false);
    assert.doesNotMatch(canonicalize(authorized), /core-declare-|targetStackItemId|sourceCardId/);
});
test("4.2.2 Base Ace counter-on-counter chain preserves the root effect", async () => {
    const { advanceCoreToDecision, createCoreMatchState, CORE_RESPONSE_AUTHORITY_PROFILE, moveCard } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = createCoreMatchState({ profileId: CORE_RESPONSE_AUTHORITY_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 42202 });
    let d = advanceCoreToDecision(state);
    state = engine.execute(d.state, d.legalActionFrame.actions.find((entry) => entry.mode === "enter-action").command).state;
    const by = Object.fromEntries(Object.values(state.cards).map((card) => [card.identity, card.id]));
    moveCard(state, by["3♣"], "P1_HAND", "P1");
    moveCard(state, by["A♦"], "P1_HAND", "P1");
    moveCard(state, by["A♣"], "P2_HAND", "P2");
    moveCard(state, by["2♣"], "P2_PR", "P2");
    state.cards[by["2♣"]].state.pointValue = 2;
    d = advanceCoreToDecision(state);
    state = engine.execute(d.state, d.legalActionFrame.actions.find((entry) => entry.family === "effect-three" && entry.targetCardIds.includes(by["2♣"])).command).state;
    d = advanceCoreToDecision(state);
    state = engine.execute(d.state, d.legalActionFrame.actions.find((entry) => entry.family === "counter" && entry.mode === "ace-base").command).state;
    d = advanceCoreToDecision(state);
    state = engine.execute(d.state, d.legalActionFrame.actions.find((entry) => entry.family === "counter" && entry.mode === "ace-base").command).state;
    const events = [];
    for (let i = 0; i < 16 && (state.stack.length > 0 || state.priority?.open); i++) {
        d = advanceCoreToDecision(state);
        events.push(...d.events.map((event) => event.type));
        state = d.state;
        if (d.status === "PLAYER_DECISION_REQUIRED") {
            const pass = d.legalActionFrame.actions.find((entry) => entry.family === "pass-priority");
            if (!pass)
                break;
            const result = engine.execute(state, pass.command);
            assert.equal(result.accepted, true);
            events.push(...result.events.map((event) => event.type));
            state = result.state;
        }
    }
    assert.equal(state.cards[by["2♣"]].zone, "DP", "Three root resolves after the counter to the counter");
    assert.equal(state.cards[by["A♣"]].zone, "GY");
    assert.equal(state.cards[by["A♦"]].zone, "GY");
    assert.ok(events.includes("CORE_COUNTER_RESOLVED"));
    assert.ok(events.includes("CORE_ROOT_RESOLVED"));
});
test("4.2.2 Jack Disrupt resolves without negating the root and records the action restriction", async () => {
    const { advanceCoreToDecision, createCoreMatchState, CORE_RESPONSE_AUTHORITY_PROFILE, moveCard } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = createCoreMatchState({ profileId: CORE_RESPONSE_AUTHORITY_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 42203 });
    let d = advanceCoreToDecision(state);
    state = engine.execute(d.state, d.legalActionFrame.actions.find((entry) => entry.mode === "enter-action").command).state;
    const by = Object.fromEntries(Object.values(state.cards).map((card) => [card.identity, card.id]));
    moveCard(state, by["3♣"], "P1_HAND", "P1");
    moveCard(state, by["J♣"], "P2_HAND", "P2");
    moveCard(state, by["2♣"], "P2_PR", "P2");
    state.cards[by["2♣"]].state.pointValue = 2;
    d = advanceCoreToDecision(state);
    state = engine.execute(d.state, d.legalActionFrame.actions.find((entry) => entry.family === "effect-three" && entry.targetCardIds.includes(by["2♣"])).command).state;
    d = advanceCoreToDecision(state);
    state = engine.execute(d.state, d.legalActionFrame.actions.find((entry) => entry.family === "disrupt").command).state;
    const types = [];
    for (let i = 0; i < 16 && (state.stack.length > 0 || state.priority?.open); i++) {
        d = advanceCoreToDecision(state);
        types.push(...d.events.map((event) => event.type));
        state = d.state;
        if (d.status === "PLAYER_DECISION_REQUIRED") {
            const pass = d.legalActionFrame.actions.find((entry) => entry.family === "pass-priority");
            if (!pass)
                break;
            const r = engine.execute(state, pass.command);
            types.push(...r.events.map((event) => event.type));
            state = r.state;
        }
    }
    assert.equal(state.cards[by["2♣"]].zone, "DP");
    assert.ok(types.includes("CORE_JACK_DISRUPT_RESOLVED"));
    const runtime = state.metadata.coreAuthority;
    assert.ok((runtime.disruptedActionTypesByPlayer?.P1 ?? []).includes("play-for-effect"));
});
test("4.2.2 audited Quick and Instant responses resolve through stack authority", async () => {
    const { advanceCoreToDecision, createCoreMatchState, CORE_RESPONSE_AUTHORITY_PROFILE, moveCard } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = createCoreMatchState({ profileId: CORE_RESPONSE_AUTHORITY_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 42204 });
    let d = advanceCoreToDecision(state);
    state = engine.execute(d.state, d.legalActionFrame.actions.find((entry) => entry.mode === "enter-action").command).state;
    const by = Object.fromEntries(Object.values(state.cards).map((card) => [card.identity, card.id]));
    moveCard(state, by["2♣"], "P1_HAND", "P1");
    for (const identity of ["8♠", "9♣"])
        moveCard(state, by[identity], "P2_HAND", "P2");
    moveCard(state, by["4♣"], "P2_PR", "P2");
    state.cards[by["4♣"]].state.pointValue = 4;
    moveCard(state, by["5♣"], "P1_PR", "P1");
    state.cards[by["5♣"]].state.pointValue = 5;
    d = advanceCoreToDecision(state);
    state = engine.execute(d.state, d.legalActionFrame.actions.find((entry) => entry.family === "draw").command).state;
    d = advanceCoreToDecision(state);
    const instant = d.legalActionFrame.actions.find((entry) => entry.family === "instant" && entry.mode === "nine-tap" && entry.targetCardIds.includes(by["5♣"]));
    assert.ok(instant);
    state = engine.execute(d.state, instant.command).state;
    for (let i = 0; i < 10 && (state.stack.length > 0 || state.priority?.open); i++) {
        d = advanceCoreToDecision(state);
        state = d.state;
        if (d.status === "PLAYER_DECISION_REQUIRED") {
            const pass = d.legalActionFrame.actions.find((entry) => entry.family === "pass-priority");
            if (!pass)
                break;
            state = engine.execute(state, pass.command).state;
        }
    }
    assert.equal(state.cards[by["5♣"]].state.tapped, true);
    assert.equal(state.cards[by["9♣"]].zone, "GY");
});
test("4.2.2 malformed or non-holder responses exact-rewind with zero events", async () => {
    const { advanceCoreToDecision, createCoreMatchState, CORE_RESPONSE_AUTHORITY_PROFILE, moveCard } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = createCoreMatchState({ profileId: CORE_RESPONSE_AUTHORITY_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 42205 });
    let d = advanceCoreToDecision(state);
    state = engine.execute(d.state, d.legalActionFrame.actions.find((entry) => entry.mode === "enter-action").command).state;
    const by = Object.fromEntries(Object.values(state.cards).map((card) => [card.identity, card.id]));
    moveCard(state, by["3♣"], "P1_HAND", "P1");
    moveCard(state, by["A♦"], "P1_HAND", "P1");
    moveCard(state, by["2♣"], "P2_PR", "P2");
    state.cards[by["2♣"]].state.pointValue = 2;
    d = advanceCoreToDecision(state);
    state = engine.execute(d.state, d.legalActionFrame.actions.find((entry) => entry.family === "effect-three").command).state;
    const before = hashCanonical(state), target = state.stack.at(-1).id;
    const wrong = { id: "WRONG-ACTOR", type: "RESOLVE_CORE_AUTHORITY_ACTION", actorId: "P1", action: { kind: "core-declare-base-ace-counter", sourceCardId: by["A♦"], targetStackItemId: target, sourceMode: "hand" } };
    const rejected = engine.execute(state, wrong);
    assert.equal(rejected.accepted, false);
    assert.equal(rejected.events.length, 0);
    assert.equal(hashCanonical(rejected.state), before);
});
test("4.2.2 Core Response Random Legal is deterministic, terminal, and exercises response declarations", async () => {
    const { runCoreRandomLegalMatch, CORE_RESPONSE_AUTHORITY_PROFILE } = await import("../src/index.js");
    const setup = { profileId: CORE_RESPONSE_AUTHORITY_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 42206 };
    const first = runCoreRandomLegalMatch(setup, 5000), second = runCoreRandomLegalMatch(setup, 5000);
    assert.ok(["NORMAL_VICTORY", "EXHAUSTED_RESOLUTION", "CANONICAL_DRAW"].includes(first.terminationReason), first.terminationReason);
    assert.equal(hashCanonical({ state: first.state, commands: first.commands, decisions: first.decisions }), hashCanonical({ state: second.state, commands: second.commands, decisions: second.decisions }));
    assert.ok(first.events.some((event) => /CORE_(COUNTER|JACK_DISRUPT|NINE_TAP|EIGHT_|QUEEN_AEGIS)/.test(event.type)), "seed must exercise at least one response resolution");
});
test("4.2.2 Scuttle severs Jack attachment graphs before state validation", async () => {
    const { runCoreRandomLegalMatch, CORE_RESPONSE_AUTHORITY_PROFILE, validateState } = await import("../src/index.js");
    const result = runCoreRandomLegalMatch({ profileId: CORE_RESPONSE_AUTHORITY_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 1940449866 }, 5000);
    assert.ok(["NORMAL_VICTORY", "EXHAUSTED_RESOLUTION", "CANONICAL_DRAW"].includes(result.terminationReason), result.terminationReason);
    assert.deepEqual(validateState(result.state), []);
    assert.ok(result.events.some((event) => event.type === "ATTACHMENT_SEVERED"));
});
test("v4.1.1 Interrupt hotfix removes generic skips while preserving printed exceptions", async () => {
    const engine = new IntrilexEngine();
    let state = createEmptyState();
    let result = engine.execute(state, { id: "HOTFIX-CONFIG", type: "RESOLVE_PHASE12_ACTION", actorId: "P1", action: { kind: "configure-battle-realm", specs: { P1: "Brilliance", P2: "Balance" } } });
    assert.equal(result.accepted, true);
    state = result.state;
    result = engine.execute(state, { id: "HOTFIX-GOAL-SHOCK", type: "RESOLVE_PHASE12_ACTION", actorId: "P1", action: { kind: "goal-shock", enemyPlayerIds: ["P2"] } });
    assert.equal(result.accepted, true);
    assert.equal(result.state.players.P2.goal, 28);
    assert.equal(result.state.players.P1.limits.pendingFullTurnSkips, 0);
    assert.equal(result.events.some((event) => event.type === "FULL_TURN_SKIP_ADDED"), false);
    const rankFixture = (await rankFixtures()).find((entry) => entry.id === "CT-076");
    assert.ok(rankFixture);
    const stackTheft = runCommands(rankFixture.initialState, rankFixture.commands).state;
    assert.equal(stackTheft.players.P1.limits.pendingFullTurnSkips, 1);
    assert.equal(stackTheft.players.P2.limits.pendingFullTurnSkips, 1);
    const bombFixture = (await timeBombFixtures()).find((entry) => entry.id === "CT-113");
    assert.ok(bombFixture);
    const declaredDefuse = runCommands(bombFixture.initialState, bombFixture.commands.slice(0, 1));
    assert.equal(declaredDefuse.state.players.P1.limits.pendingActionPhaseSkips, 1);
    assert.ok(declaredDefuse.events.some((event) => event.type === "ACTION_PHASE_SKIP_ADDED"));
});
test("4.2.3 Core Private Choice profile declares sealed ordinary hidden-choice scope", async () => {
    const { CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE, coreAuthorityCapabilities } = await import("../src/index.js");
    assert.equal(CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.engineVersion, "4.2.3");
    assert.deepEqual([...CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.supportedChoices], ["3-present-take", "3-force-discard", "5-recycle-rummage", "6-deep-dig", "7-topdeck-casting", "9-anchor-discard"]);
    const capability = coreAuthorityCapabilities().find((entry) => entry.profileId === CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.id);
    assert.equal(capability?.status, "SUPPORTED");
    assert.ok(capability?.reasonCodes.includes("SEALED_PRIVATE_CHOICE_TOKENS"));
    for (const blocked of ["two-quick", "six-swap-peek-quick", "supers", "rank10", "voltage", "ultras"])
        assert.ok(CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.excludedSystems.includes(blocked));
});
test("4.2.3 every enumerated private-choice root is engine-accepted and command-vault isolated", async () => {
    const { advanceCoreToDecision, createCoreMatchState, CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE, moveCard, toAuthorizedCoreAction } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = createCoreMatchState({ profileId: CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 42301 });
    let decision = advanceCoreToDecision(state);
    state = engine.execute(decision.state, decision.legalActionFrame.actions.find((entry) => entry.mode === "enter-action").command).state;
    const by = Object.fromEntries(Object.values(state.cards).map((card) => [card.identity, card.id]));
    for (const identity of ["3♣", "5♣", "6♣", "7♣", "9♣"])
        moveCard(state, by[identity], "P1_HAND", "P1");
    for (const identity of ["A♦", "K♦", "Q♦", "2♦"])
        moveCard(state, by[identity], "P2_HAND", "P2");
    decision = advanceCoreToDecision(state);
    const roots = decision.legalActionFrame.actions.filter((entry) => entry.family === "effect-private-choice" || entry.family === "anchor-private-choice");
    const modes = new Set(roots.map((entry) => entry.mode));
    for (const mode of ["three-present-take", "three-force-discard", "five-recycle", "six-dig", "seven-topdeck", "nine"])
        assert.equal(modes.has(mode), true, mode);
    for (const entry of roots)
        assert.equal(engine.execute(decision.state, entry.command).accepted, true, entry.mode);
    const authorized = roots.map(toAuthorizedCoreAction);
    assert.equal(authorized.some((entry) => "command" in entry), false);
    assert.doesNotMatch(canonicalize(authorized), /core-submit-private-choice|token|sourceCardId/);
});
test("4.2.3 Three enforces exact discard-to-two and permits taking up to two presented cards", async () => {
    const { advanceCoreToDecision, createCoreMatchState, CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE, moveCard } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    const settleToChoice = (start) => {
        let state = start;
        for (let i = 0; i < 20; i++) {
            const d = advanceCoreToDecision(state);
            state = d.state;
            if (state.metadata.coreAuthority?.privateChoice)
                return { state, decision: d };
            if (d.status === "PLAYER_DECISION_REQUIRED") {
                const pass = d.legalActionFrame.actions.find((entry) => entry.family === "pass-priority");
                if (!pass)
                    throw new Error("Expected priority pass");
                const r = engine.execute(state, pass.command);
                assert.equal(r.accepted, true);
                state = r.state;
            }
        }
        throw new Error("Choice did not open");
    };
    let state = createCoreMatchState({ profileId: CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 42302 });
    let d = advanceCoreToDecision(state);
    state = engine.execute(d.state, d.legalActionFrame.actions.find((entry) => entry.mode === "enter-action").command).state;
    const by = Object.fromEntries(Object.values(state.cards).map((card) => [card.identity, card.id]));
    moveCard(state, by["3♣"], "P1_HAND", "P1");
    for (const id of [...state.players.P2.hand])
        moveCard(state, id, "DP");
    for (const identity of ["A♦", "K♦", "Q♦", "2♦", "4♦"])
        moveCard(state, by[identity], "P2_HAND", "P2");
    d = advanceCoreToDecision(state);
    const force = d.legalActionFrame.actions.find((entry) => entry.mode === "three-force-discard");
    state = engine.execute(d.state, force.command).state;
    let opened = settleToChoice(state);
    state = opened.state;
    d = opened.decision;
    assert.equal(d.decisionActorId, "P2");
    assert.ok(d.legalActionFrame.actions.length > 0);
    assert.ok(d.legalActionFrame.actions.every((entry) => entry.targetCardIds.length === 3));
    state = engine.execute(state, d.legalActionFrame.actions[0].command).state;
    assert.equal(state.players.P2.hand.length, 2);
    state = createCoreMatchState({ profileId: CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 42303 });
    d = advanceCoreToDecision(state);
    state = engine.execute(d.state, d.legalActionFrame.actions.find((entry) => entry.mode === "enter-action").command).state;
    const by2 = Object.fromEntries(Object.values(state.cards).map((card) => [card.identity, card.id]));
    moveCard(state, by2["3♣"], "P1_HAND", "P1");
    for (const id of [...state.players.P2.hand])
        moveCard(state, id, "DP");
    for (const identity of ["A♦", "K♦", "Q♦"])
        moveCard(state, by2[identity], "P2_HAND", "P2");
    d = advanceCoreToDecision(state);
    state = engine.execute(d.state, d.legalActionFrame.actions.find((entry) => entry.mode === "three-present-take").command).state;
    opened = settleToChoice(state);
    state = opened.state;
    d = opened.decision;
    const present = d.legalActionFrame.actions.find((entry) => entry.targetCardIds.length === 3);
    state = engine.execute(state, present.command).state;
    d = advanceCoreToDecision(state);
    assert.equal(d.decisionActorId, "P1");
    const takeTwo = d.legalActionFrame.actions.find((entry) => entry.targetCardIds.length === 2);
    assert.ok(takeTwo);
    const taken = [...takeTwo.targetCardIds];
    state = engine.execute(d.state, takeTwo.command).state;
    assert.ok(taken.every((id) => state.players.P1.hand.includes(id)));
    assert.ok(taken.every((id) => state.cards[id].state.revealedUntil !== undefined));
});
test("4.2.3 Six choices are chooser-private and public projections expose no stable hidden IDs", async () => {
    const { advanceCoreToDecision, createCoreMatchState, CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE, moveCard, privateStateView, publicStateView } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = createCoreMatchState({ profileId: CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 42304 });
    let d = advanceCoreToDecision(state);
    state = engine.execute(d.state, d.legalActionFrame.actions.find((entry) => entry.mode === "enter-action").command).state;
    const by = Object.fromEntries(Object.values(state.cards).map((card) => [card.identity, card.id]));
    moveCard(state, by["6♣"], "P1_HAND", "P1");
    d = advanceCoreToDecision(state);
    state = engine.execute(d.state, d.legalActionFrame.actions.find((entry) => entry.mode === "six-dig").command).state;
    for (let i = 0; i < 12; i++) {
        d = advanceCoreToDecision(state);
        state = d.state;
        if (state.metadata.coreAuthority?.privateChoice)
            break;
        const pass = d.legalActionFrame.actions.find((entry) => entry.family === "pass-priority");
        assert.ok(pass);
        state = engine.execute(state, pass.command).state;
    }
    const choice = state.metadata.coreAuthority.privateChoice;
    assert.equal(choice.kind, "core-rank6-dig");
    const secretIds = [...choice.context.drawnCardIds];
    const secretIdentities = secretIds.map((id) => state.cards[id].identity);
    const publicText = canonicalize(publicStateView(state));
    const opponentText = canonicalize(privateStateView(state, "P2"));
    const chooserText = canonicalize(privateStateView(state, "P1"));
    for (const id of secretIds) {
        assert.doesNotMatch(publicText, new RegExp(id));
        assert.doesNotMatch(opponentText, new RegExp(id));
    }
    for (const identity of secretIdentities) {
        assert.doesNotMatch(publicText, new RegExp(identity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        assert.match(chooserText, new RegExp(identity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.doesNotMatch(publicText, /token|optionsHash/);
});
test("4.2.3 Seven generated effect becomes a normal response-stack child declaration", async () => {
    const { advanceCoreToDecision, createCoreMatchState, CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE, moveCard } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = createCoreMatchState({ profileId: CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 42305 });
    let d = advanceCoreToDecision(state);
    state = engine.execute(d.state, d.legalActionFrame.actions.find((entry) => entry.mode === "enter-action").command).state;
    const by = Object.fromEntries(Object.values(state.cards).map((card) => [card.identity, card.id]));
    moveCard(state, by["7♣"], "P1_HAND", "P1");
    moveCard(state, by["3♦"], "DP");
    moveCard(state, by["4♦"], "DP");
    for (const id of [by["4♦"], by["3♦"]]) {
        const i = state.zones.dp.indexOf(id);
        state.zones.dp.splice(i, 1);
        state.zones.dp.unshift(id);
    } // 3♦ then 4♦ on top
    moveCard(state, by["2♣"], "P2_PR", "P2");
    state.cards[by["2♣"]].state.pointValue = 2;
    d = advanceCoreToDecision(state);
    state = engine.execute(d.state, d.legalActionFrame.actions.find((entry) => entry.mode === "seven-topdeck").command).state;
    for (let i = 0; i < 12; i++) {
        d = advanceCoreToDecision(state);
        state = d.state;
        if (state.metadata.coreAuthority?.privateChoice)
            break;
        const pass = d.legalActionFrame.actions.find((entry) => entry.family === "pass-priority");
        assert.ok(pass);
        state = engine.execute(state, pass.command).state;
    }
    d = advanceCoreToDecision(state);
    const assign = d.legalActionFrame.actions.find((entry) => entry.mode === "rank7-hand-and-effect" && entry.targetCardIds[1] === by["3♦"]);
    assert.ok(assign);
    state = engine.execute(d.state, assign.command).state;
    d = advanceCoreToDecision(state);
    const generated = d.legalActionFrame.actions.find((entry) => entry.mode.includes("three-bounce") && entry.command.action?.submission?.generatedEffect?.targetCardId === by["2♣"]);
    assert.ok(generated);
    state = engine.execute(d.state, generated.command).state;
    assert.equal(state.stack.length, 1);
    assert.equal(state.priority?.open, true);
    assert.equal(state.stack[0].sourceCardIds[0], by["3♦"]);
});
test("4.2.3 stale, tampered, and wrong-viewer private choices exact-rewind", async () => {
    const { advanceCoreToDecision, createCoreMatchState, CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE, moveCard } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = createCoreMatchState({ profileId: CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 42306 });
    let d = advanceCoreToDecision(state);
    state = engine.execute(d.state, d.legalActionFrame.actions.find((entry) => entry.mode === "enter-action").command).state;
    const by = Object.fromEntries(Object.values(state.cards).map((card) => [card.identity, card.id]));
    moveCard(state, by["5♣"], "P1_HAND", "P1");
    d = advanceCoreToDecision(state);
    state = engine.execute(d.state, d.legalActionFrame.actions.find((entry) => entry.mode === "five-recycle").command).state;
    for (let i = 0; i < 12; i++) {
        d = advanceCoreToDecision(state);
        state = d.state;
        if (state.metadata.coreAuthority?.privateChoice)
            break;
        const pass = d.legalActionFrame.actions.find((entry) => entry.family === "pass-priority");
        assert.ok(pass);
        state = engine.execute(state, pass.command).state;
    }
    const choice = state.metadata.coreAuthority.privateChoice;
    const selected = choice.optionCardIds[0];
    const before = hashCanonical(state);
    for (const cmd of [
        { id: "BAD-TOKEN", type: "RESOLVE_CORE_AUTHORITY_ACTION", actorId: "P1", action: { kind: "core-submit-private-choice", token: "BAD", submission: { kind: "core-rank5-rummage", selectedCardIds: [selected] } } },
        { id: "BAD-ACTOR", type: "RESOLVE_CORE_AUTHORITY_ACTION", actorId: "P2", action: { kind: "core-submit-private-choice", token: choice.token, submission: { kind: "core-rank5-rummage", selectedCardIds: [selected] } } },
        { id: "BAD-OPTION", type: "RESOLVE_CORE_AUTHORITY_ACTION", actorId: "P1", action: { kind: "core-submit-private-choice", token: choice.token, submission: { kind: "core-rank5-rummage", selectedCardIds: ["NOPE"] } } }
    ]) {
        const r = engine.execute(state, cmd);
        assert.equal(r.accepted, false);
        assert.equal(r.events.length, 0);
        assert.equal(hashCanonical(r.state), before);
    }
});
test("4.2.3 Core Private Choice Random Legal is deterministic, terminal, and exercises sealed choices", async () => {
    const { runCoreRandomLegalMatch, CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE } = await import("../src/index.js");
    const setup = { profileId: CORE_PRIVATE_CHOICE_AUTHORITY_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 42307 };
    const first = runCoreRandomLegalMatch(setup, 7000), second = runCoreRandomLegalMatch(setup, 7000);
    assert.ok(["NORMAL_VICTORY", "EXHAUSTED_RESOLUTION", "CANONICAL_DRAW"].includes(first.terminationReason), first.terminationReason);
    assert.equal(hashCanonical({ state: first.state, commands: first.commands, decisions: first.decisions }), hashCanonical({ state: second.state, commands: second.commands, decisions: second.decisions }));
    assert.ok(first.events.some((event) => event.type === "CORE_PRIVATE_CHOICE_OPENED"));
    assert.ok(first.commands.some((command) => command.type === "RESOLVE_CORE_AUTHORITY_ACTION" && command.action.kind === "core-submit-private-choice"));
});
test("4.2.4 Advanced profile declares a bounded public authority surface and fail-closed exclusions", async () => {
    const { CORE_ADVANCED_AUTHORITY_PROFILE } = await import("../src/index.js");
    for (const family of [
        "royal-marriage", "super-two-score", "super-four-exchange", "super-eight", "super-jack",
        "rank10-heart", "rank10-spade-recovery", "rank10-stack-theft", "super-ace",
        "king-spade-counter", "ultra-three-black-public", "ultra-three-red",
        "ultra-two-black-two-red", "voltage-five-gy-bottom"
    ])
        assert.ok(CORE_ADVANCED_AUTHORITY_PROFILE.supportedFamilies.includes(family), family);
    for (const blocked of [
        "ten-club-foundation-trigger", "ten-diamond-mimic", "super-two-hold-child",
        "super-three-private", "super-five-private", "super-six-private", "super-seven-sequential",
        "voltage-three-choice", "voltage-four-private-prediction", "voltage-five-refine-private",
        "special-scoring-riders-seven-ten-club-black-joker"
    ])
        assert.ok(CORE_ADVANCED_AUTHORITY_PROFILE.excludedSystems.includes(blocked), blocked);
    assert.equal(CORE_ADVANCED_AUTHORITY_PROFILE.engineVersion, "4.2.4");
});
test("4.2.4 advanced legal frame exposes engine-accepted Royal Marriage, Supers, Rank 10, and Ultras without command leakage", async () => {
    const { advanceCoreToDecision, createCoreMatchState, CORE_ADVANCED_AUTHORITY_PROFILE, moveCard, toAuthorizedCoreAction } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = createCoreMatchState({ profileId: CORE_ADVANCED_AUTHORITY_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 42401 });
    let d = advanceCoreToDecision(state);
    state = engine.execute(d.state, d.legalActionFrame.actions.find((x) => x.mode === "enter-action").command).state;
    const by = Object.fromEntries(Object.values(state.cards).map((c) => [c.identity, c.id]));
    for (const identity of ["K♣", "Q♣", "2♣", "2♦", "4♣", "4♦", "8♣", "8♦", "J♣", "J♦", "10♥", "A♣", "3♣", "5♠", "6♥", "7♠"])
        moveCard(state, by[identity], "P1_HAND", "P1");
    moveCard(state, by["9♦"], "EXILE");
    moveCard(state, by["A♦"], "P2_PR", "P2");
    state.cards[by["A♦"]].state.pointValue = 4;
    d = advanceCoreToDecision(state);
    const advanced = d.legalActionFrame.actions.filter((x) => ["royal-marriage", "super", "rank10", "ultra"].includes(x.family));
    const modes = new Set(advanced.map((x) => x.mode));
    for (const mode of ["♣", "two-score", "four-exchange-pr", "eight-absolute-scuttle", "jack-tempo", "heart-tempo", "2-black-2-red-draw"])
        assert.equal(modes.has(mode), true, mode);
    for (const entry of advanced.slice(0, 80))
        assert.equal(engine.execute(d.state, entry.command).accepted, true, `${entry.family}:${entry.mode}`);
    const authorized = advanced.slice(0, 20).map(toAuthorizedCoreAction);
    assert.doesNotMatch(canonicalize(authorized), /core-resolve-advanced|sourceCardIds|command"/);
});
test("4.2.4 Stack Theft transfers resolution authority but charges only its two printed skips", async () => {
    const { advanceCoreToDecision, createCoreMatchState, CORE_ADVANCED_AUTHORITY_PROFILE, moveCard } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = createCoreMatchState({ profileId: CORE_ADVANCED_AUTHORITY_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 42402 });
    let d = advanceCoreToDecision(state);
    state = engine.execute(d.state, d.legalActionFrame.actions.find((x) => x.mode === "enter-action").command).state;
    const by = Object.fromEntries(Object.values(state.cards).map((c) => [c.identity, c.id]));
    moveCard(state, by["3♣"], "P1_HAND", "P1");
    moveCard(state, by["10♠"], "P2_HAND", "P2");
    moveCard(state, by["2♣"], "P2_PR", "P2");
    state.cards[by["2♣"]].state.pointValue = 2;
    d = advanceCoreToDecision(state);
    const root = d.legalActionFrame.actions.find((x) => x.mode === "bounce-top" && x.targetCardIds.includes(by["2♣"]));
    state = engine.execute(d.state, root.command).state;
    d = advanceCoreToDecision(state);
    const theft = d.legalActionFrame.actions.find((x) => x.mode === "rank10-stack-theft");
    assert.ok(theft);
    state = engine.execute(d.state, theft.command).state;
    for (let i = 0; i < 20 && state.stack.length; i++) {
        if (state.priority?.open === true) {
            d = advanceCoreToDecision(state);
            state = d.state;
            const pass = d.legalActionFrame.actions.find((x) => x.family === "pass-priority");
            assert.ok(pass);
            state = engine.execute(state, pass.command).state;
        }
        else {
            const r = engine.execute(state, { id: `RESOLVE-42402-${i}`, type: "RESOLVE_CORE_AUTHORITY_ACTION", actorId: state.activePlayerId, action: { kind: "core-resolve-response-top" } });
            assert.equal(r.accepted, true);
            state = r.state;
        }
    }
    assert.equal(state.stack.length, 0);
    assert.equal(state.cards[by["10♠"]].zone, "EXILE");
    assert.equal(state.players.P1.limits.pendingFullTurnSkips, 1);
    assert.equal(state.players.P2.limits.pendingFullTurnSkips, 1);
    assert.equal(state.players.P1.limits.miniTurnsUsed, 1);
    assert.equal(state.players.P2.limits.miniTurnsUsed, 0);
    const end = engine.execute(state, { id: "END-42402", type: "RESOLVE_CORE_AUTHORITY_ACTION", actorId: "P1", action: { kind: "core-complete-turn" } });
    assert.equal(end.accepted, true);
    assert.equal(end.state.players.P1.limits.pendingFullTurnSkips, 0);
    assert.equal(end.state.players.P2.limits.pendingFullTurnSkips, 0);
    assert.equal(end.state.activePlayerId, "P2");
});
test("4.2.4 3 Red Ultra counters a root and preserves its bottom-GY draw rider", async () => {
    const { advanceCoreToDecision, createCoreMatchState, CORE_ADVANCED_AUTHORITY_PROFILE, moveCard } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = createCoreMatchState({ profileId: CORE_ADVANCED_AUTHORITY_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 42403 });
    let d = advanceCoreToDecision(state);
    state = engine.execute(d.state, d.legalActionFrame.actions.find((x) => x.mode === "enter-action").command).state;
    const by = Object.fromEntries(Object.values(state.cards).map((c) => [c.identity, c.id]));
    moveCard(state, by["3♣"], "P1_HAND", "P1");
    moveCard(state, by["2♣"], "P2_PR", "P2");
    state.cards[by["2♣"]].state.pointValue = 2;
    for (const x of ["A♦", "4♥", "6♦"])
        moveCard(state, by[x], "P2_HAND", "P2");
    state.zones.gy = [];
    d = advanceCoreToDecision(state);
    const rootAction = d.legalActionFrame.actions.find((x) => x.mode === "bounce-top" && x.targetCardIds.includes(by["2♣"]));
    const rootSourceId = rootAction.sourceCardIds[0];
    state = engine.execute(d.state, rootAction.command).state;
    d = advanceCoreToDecision(state);
    const ultra = d.legalActionFrame.actions.find((x) => x.mode === "three-red-counter");
    assert.ok(ultra);
    const ultraSources = [...ultra.sourceCardIds];
    state = engine.execute(d.state, ultra.command).state;
    for (let i = 0; i < 20 && state.stack.length; i++) {
        if (state.priority?.open === true) {
            d = advanceCoreToDecision(state);
            state = d.state;
            const pass = d.legalActionFrame.actions.find((x) => x.family === "pass-priority");
            assert.ok(pass);
            state = engine.execute(state, pass.command).state;
        }
        else {
            const r = engine.execute(state, { id: `RESOLVE-42403-${i}`, type: "RESOLVE_CORE_AUTHORITY_ACTION", actorId: state.activePlayerId, action: { kind: "core-resolve-response-top" } });
            assert.equal(r.accepted, true);
            state = r.state;
        }
    }
    assert.equal(state.stack.length, 0);
    assert.equal(state.players.P2.limits.ultraPlayedThisFT, true);
    assert.equal(ultraSources.filter((id) => state.players.P2.hand.includes(id)).length, 1);
    assert.equal(state.cards[rootSourceId].zone, "GY");
    assert.equal(state.phase, "End");
});
test("4.2.4 Voltage exposes only the complete public Five GY-bottom branch and remains single-use", async () => {
    const { advanceCoreToDecision, createCoreMatchState, CORE_ADVANCED_AUTHORITY_PROFILE, moveCard } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = createCoreMatchState({ profileId: CORE_ADVANCED_AUTHORITY_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 42404 });
    const by = Object.fromEntries(Object.values(state.cards).map((c) => [c.identity, c.id]));
    for (const identity of ["3♣", "4♣", "5♣"]) {
        moveCard(state, by[identity], "P1_PR", "P1");
        state.cards[by[identity]].state.pointValue = Number(identity[0]);
    }
    moveCard(state, by["A♣"], "GY");
    let d = advanceCoreToDecision(state);
    assert.equal(d.legalActionFrame.actions.some((x) => x.family === "voltage" && x.mode.startsWith("three-")), false);
    assert.equal(d.legalActionFrame.actions.some((x) => x.family === "voltage" && x.mode.startsWith("four-")), false);
    const v = d.legalActionFrame.actions.find((x) => x.family === "voltage" && x.mode === "five-gy-bottom");
    assert.ok(v);
    state = engine.execute(d.state, v.command).state;
    assert.ok(state.players.P1.hand.includes(by["A♣"]));
    d = advanceCoreToDecision(state);
    assert.equal(d.legalActionFrame.actions.some((x) => x.family === "voltage"), false);
});
test("4.2.4 Advanced Random Legal is deterministic and terminal", async () => {
    const { runCoreRandomLegalMatch, CORE_ADVANCED_AUTHORITY_PROFILE } = await import("../src/index.js");
    const setup = { profileId: CORE_ADVANCED_AUTHORITY_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 42406 };
    const a = runCoreRandomLegalMatch(setup, 12000), b = runCoreRandomLegalMatch(setup, 12000);
    assert.ok(["NORMAL_VICTORY", "EXHAUSTED_RESOLUTION", "CANONICAL_DRAW"].includes(a.terminationReason), a.terminationReason);
    assert.equal(hashCanonical({ state: a.state, commands: a.commands, decisions: a.decisions }), hashCanonical({ state: b.state, commands: b.commands, decisions: b.decisions }));
    assert.ok(a.events.some((e) => e.type.startsWith("CORE_ADVANCED_")));
});
test("4.2.4 incomplete advanced declarations fail closed with exact rewind", async () => {
    const { advanceCoreToDecision, createCoreMatchState, CORE_ADVANCED_AUTHORITY_PROFILE, moveCard } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = createCoreMatchState({ profileId: CORE_ADVANCED_AUTHORITY_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 42407 });
    let d = advanceCoreToDecision(state);
    state = engine.execute(d.state, d.legalActionFrame.actions.find((x) => x.mode === "enter-action").command).state;
    const by = Object.fromEntries(Object.values(state.cards).map((c) => [c.identity, c.id]));
    for (const identity of ["2♣", "2♦", "10♣"])
        moveCard(state, by[identity], "P1_HAND", "P1");
    moveCard(state, by["3♣"], "P2_PR", "P2");
    state.cards[by["3♣"]].state.pointValue = 3;
    for (const advanced of [
        { kind: "advanced-super-two", sourceCardIds: [by["2♣"], by["2♦"]], targetCardId: by["3♣"], disposition: "hold" },
        { kind: "advanced-rank10-club-foundation", sourceCardId: by["10♣"] }
    ]) {
        const before = hashCanonical(state);
        const r = engine.execute(state, { id: `REJECT-${advanced.kind}`, type: "RESOLVE_CORE_AUTHORITY_ACTION", actorId: "P1", action: { kind: "core-declare-primary", action: { kind: "core-resolve-advanced", advanced } } });
        assert.equal(r.accepted, false);
        assert.equal(r.events.length, 0);
        assert.equal(hashCanonical(r.state), before);
    }
});
test("4.2.4 special scoring riders are absent and direct declarations exact-rewind", async () => {
    const { advanceCoreToDecision, createCoreMatchState, CORE_ADVANCED_AUTHORITY_PROFILE, moveCard } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = createCoreMatchState({ profileId: CORE_ADVANCED_AUTHORITY_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 42408 });
    let d = advanceCoreToDecision(state);
    state = engine.execute(d.state, d.legalActionFrame.actions.find((x) => x.mode === "enter-action").command).state;
    const by = Object.fromEntries(Object.values(state.cards).map((c) => [c.identity, c.id]));
    for (const identity of ["7♣", "10♣", "BJ"])
        moveCard(state, by[identity], "P1_HAND", "P1");
    d = advanceCoreToDecision(state);
    for (const identity of ["7♣", "10♣", "BJ"]) {
        assert.equal(d.legalActionFrame.actions.some((x) => x.family === "score" && x.sourceCardIds.includes(by[identity])), false, identity);
        const before = hashCanonical(d.state);
        const r = engine.execute(d.state, { id: `SCORE-${identity}`, type: "RESOLVE_CORE_AUTHORITY_ACTION", actorId: "P1", action: { kind: "core-declare-primary", action: { kind: "core-score", cardId: by[identity] } } });
        assert.equal(r.accepted, false);
        assert.equal(r.events.length, 0);
        assert.equal(hashCanonical(r.state), before);
    }
});
test("4.2.4 Super Eight prunes object Aegis and Super Four preserves tap state while replacing Aegis", async () => {
    const { advanceCoreToDecision, applyAegis, createCoreMatchState, CORE_ADVANCED_AUTHORITY_PROFILE, moveCard } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = createCoreMatchState({ profileId: CORE_ADVANCED_AUTHORITY_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 42409 });
    let d = advanceCoreToDecision(state);
    state = engine.execute(d.state, d.legalActionFrame.actions.find((x) => x.mode === "enter-action").command).state;
    const by = Object.fromEntries(Object.values(state.cards).map((c) => [c.identity, c.id]));
    for (const identity of ["8♣", "8♦", "4♣", "4♦"])
        moveCard(state, by[identity], "P1_HAND", "P1");
    moveCard(state, by["6♣"], "P2_PR", "P2");
    state.cards[by["6♣"]].state.pointValue = 6;
    applyAegis(state.cards[by["6♣"]], "OBJECT-AEGIS", { playerId: "P2", startSequence: 9 });
    moveCard(state, by["9♣"], "P1_PR", "P1");
    state.cards[by["9♣"]].state.pointValue = 9;
    state.cards[by["9♣"]].state.tapped = true;
    state.cards[by["9♣"]].state.tapState = { kind: "explicit-event", sourceRef: "KEEP-TAP", eventKey: "SCORE" };
    d = advanceCoreToDecision(state);
    assert.equal(d.legalActionFrame.actions.some((x) => x.mode === "eight-absolute-scuttle" && x.targetCardIds.includes(by["6♣"])), false);
    const exchange = d.legalActionFrame.actions.find((x) => x.mode === "four-exchange-pr");
    assert.ok(exchange);
    state = engine.execute(d.state, exchange.command).state;
    for (let i = 0; i < 20 && state.stack.length; i++) {
        if (state.priority?.open) {
            d = advanceCoreToDecision(state);
            state = d.state;
            const pass = d.legalActionFrame.actions.find((x) => x.family === "pass-priority");
            assert.ok(pass);
            state = engine.execute(state, pass.command).state;
        }
        else {
            const r = engine.execute(state, { id: `RESOLVE-EXCHANGE-${i}`, type: "RESOLVE_CORE_AUTHORITY_ACTION", actorId: state.activePlayerId, action: { kind: "core-resolve-response-top" } });
            assert.equal(r.accepted, true);
            state = r.state;
        }
    }
    assert.equal(state.cards[by["9♣"]].controllerId, "P2");
    assert.equal(state.cards[by["9♣"]].state.tapped, true);
    assert.equal(state.cards[by["9♣"]].state.tapState?.sourceRef, "KEEP-TAP");
    assert.equal(state.cards[by["9♣"]].state.aegis, undefined, "Nines never gain Aegis");
});
test("4.2.4 Jack declarations prune already Jacked hosts and exact-rewind direct attempts", async () => {
    const { advanceCoreToDecision, createCoreMatchState, CORE_ADVANCED_AUTHORITY_PROFILE, moveCard } = await import("../src/index.js");
    const engine = new IntrilexEngine();
    let state = createCoreMatchState({ profileId: CORE_ADVANCED_AUTHORITY_PROFILE.id, playerIds: ["P1", "P2"], seatOrder: ["P1", "P2"], enabledModules: [], seed: 42410 });
    let d = advanceCoreToDecision(state);
    state = engine.execute(d.state, d.legalActionFrame.actions.find((x) => x.mode === "enter-action").command).state;
    const by = Object.fromEntries(Object.values(state.cards).map((c) => [c.identity, c.id]));
    moveCard(state, by["J♣"], "P1_HAND", "P1");
    moveCard(state, by["J♦"], "P2_ER", "P2");
    moveCard(state, by["A♦"], "P2_PR", "P2");
    state.cards[by["J♦"]].state.attachmentGraph = { kind: "jack-pr", hostCardId: by["A♦"], originalHostZone: "P2_PR", originalHostControllerId: "P1", pointBonus: 1 };
    state.cards[by["A♦"]].state.attachedByJackId = by["J♦"];
    state.cards[by["A♦"]].state.jackPointBonus = 1;
    d = advanceCoreToDecision(state);
    assert.equal(d.legalActionFrame.actions.some((x) => x.mode === "jack-pr" && x.targetCardIds.includes(by["A♦"])), false);
    const before = hashCanonical(d.state);
    const r = engine.execute(d.state, { id: "DOUBLE-JACK", type: "RESOLVE_CORE_AUTHORITY_ACTION", actorId: "P1", action: { kind: "core-declare-primary", action: { kind: "core-resolve-effect", effect: { kind: "jack-attach", sourceCardId: by["J♣"], targetCardId: by["A♦"], row: "pr" } } } });
    assert.equal(r.accepted, false);
    assert.equal(r.events.length, 0);
    assert.equal(hashCanonical(r.state), before);
});
//# sourceMappingURL=engine.test.js.map