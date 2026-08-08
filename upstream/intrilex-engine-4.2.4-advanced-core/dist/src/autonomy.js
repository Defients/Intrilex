import { canonicalClone } from "./canonical-json.js";
import { IntrilexEngine } from "./engine.js";
import { hashCanonical } from "./hash.js";
import { evaluateProtection } from "./interactions.js";
import { compareScuttle, cardPointValue, hasOrdinaryScuttleImmunity, parseIdentity, rankDefinition } from "./ranks.js";
import { nextIndex } from "./rng.js";
import { addCard, createEmptyState, moveCard } from "./state.js";
import { assertValidState } from "./validation.js";
export const FIRST_CONTACT_AUTONOMY_BASELINE_PROFILE = Object.freeze({
    id: "first-contact-baseline",
    displayName: "First Contact Baseline — Score/Scuttle",
    rulesVersion: "4.1",
    teachingOverrideId: "AUTONOMY_BASELINE_V1",
    playerCount: 2,
    goal: 15,
    enabledGenericEffects: [],
    allowedActions: ["draw", "play-for-points", "scuttle", "pass"],
    rationale: "Canonical First Contact teaching override with a smaller explicit generic-effect allowlist (empty)."
});
export const FIRST_CONTACT_AUTONOMY_ESSENTIALS_PROFILE = Object.freeze({
    id: "first-contact-essentials",
    displayName: "First Contact Essentials — Effects & Guard",
    rulesVersion: "4.1",
    teachingOverrideId: "AUTONOMY_ESSENTIALS_V1",
    playerCount: 2,
    goal: 15,
    enabledGenericEffects: [
        "4-row-clear", "9-tap", "9-goal-shift", "J-pr-attachment", "Q-anchor-guard", "K-anchor",
        "RJ-hand-swap", "RJ-self-reset", "RJ-opponent-attack", "RJ-shuffle-reset", "BJ-board-lock"
    ],
    excludedGenericEffects: [
        "3-opponent-choice", "5-post-mill-choice", "6-private-draw-choice", "7-generated-effect-play",
        "8-scuttle-counter", "9-anchor-opponent-choice", "J-disrupt-response", "K-counter-response"
    ],
    allowedActions: ["draw", "play-for-points", "play-for-effect", "scuttle", "pass"],
    rationale: "Canonical First Contact teaching override using a smaller explicit generic-effect allowlist. Every enabled consequence is engine-owned; response-window and mid-resolution choice effects remain excluded."
});
export const FIRST_CONTACT_RESPONSE_AUTHORITY_PROFILE = Object.freeze({
    id: "first-contact-response",
    displayName: "First Contact Response Authority — Effects, Guard & Counters",
    rulesVersion: "4.1",
    teachingOverrideId: "AUTONOMY_RESPONSE_AUTHORITY_V1",
    playerCount: 2,
    goal: 15,
    enabledGenericEffects: [
        "4-row-clear", "9-tap", "9-goal-shift", "J-pr-attachment", "Q-anchor-guard", "K-anchor",
        "RJ-hand-swap", "RJ-self-reset", "RJ-opponent-attack", "RJ-shuffle-reset", "BJ-board-lock"
    ],
    enabledResponses: ["A-base-counter", "8-scuttle-counter", "J-disrupt", "K-anchor-goal-counter"],
    excludedGenericEffects: [
        "3-opponent-choice", "5-post-mill-choice", "6-private-draw-choice", "7-generated-effect-play",
        "9-anchor-opponent-choice"
    ],
    allowedActions: ["draw", "play-for-points", "play-for-effect", "scuttle", "pass"],
    rationale: "Canonical First Contact teaching override with engine-owned priority circulation and generic response authority. Private-choice continuations remain excluded."
});
export const FIRST_CONTACT_PRIVATE_CHOICE_AUTHORITY_PROFILE = Object.freeze({
    id: "first-contact-private-choice",
    displayName: "First Contact Private Choice Authority — Choices, Effects & Responses",
    rulesVersion: "4.1",
    teachingOverrideId: "AUTONOMY_PRIVATE_CHOICE_AUTHORITY_V1",
    playerCount: 2,
    goal: 15,
    enabledGenericEffects: [
        "3-hand-raid", "3-bounce", "4-row-clear", "5-recycle", "6-dig", "7-topdeck-cast",
        "9-tap", "9-goal-shift", "9-anchor", "J-pr-attachment", "Q-anchor-guard", "K-anchor",
        "RJ-hand-swap", "RJ-self-reset", "RJ-opponent-attack", "RJ-shuffle-reset", "BJ-board-lock"
    ],
    enabledResponses: ["A-base-counter", "8-scuttle-counter", "J-disrupt", "K-anchor-goal-counter"],
    enabledPrivateChoices: ["3-opponent-presentation", "3-opponent-discard", "3-caster-take", "5-rummage", "6-private-draw", "7-topdeck-assignment", "7-generated-effect", "9-anchor-opponent-discard"],
    excludedGenericEffects: [],
    excludedTriggeredEffects: ["7-scoring-trigger"],
    allowedActions: ["draw", "play-for-points", "play-for-effect", "scuttle", "pass"],
    rationale: "Canonical First Contact teaching override with engine-owned response and sealed private-choice continuations. Seven's scoring trigger, optional modules, suit-specific effects, Supers, Ultras, and Core-only systems remain excluded."
});
export const FIRST_CONTACT_TRIGGER_CLOSURE_PROFILE = Object.freeze({
    id: "first-contact-trigger-closure",
    displayName: "First Contact Trigger Closure — Seven Scoring Authority",
    rulesVersion: "4.1",
    teachingOverrideId: "AUTONOMY_TRIGGER_CLOSURE_V1",
    playerCount: 2,
    goal: 15,
    enabledGenericEffects: [
        "3-hand-raid", "3-bounce", "4-row-clear", "5-recycle", "6-dig", "7-topdeck-cast",
        "9-tap", "9-goal-shift", "9-anchor", "J-pr-attachment", "Q-anchor-guard", "K-anchor",
        "RJ-hand-swap", "RJ-self-reset", "RJ-opponent-attack", "RJ-shuffle-reset", "BJ-board-lock"
    ],
    enabledResponses: ["A-base-counter", "8-scuttle-counter", "J-disrupt", "K-anchor-goal-counter"],
    enabledPrivateChoices: ["3-opponent-presentation", "3-opponent-discard", "3-caster-take", "5-rummage", "6-private-draw", "7-topdeck-assignment", "7-generated-effect", "7-scoring-trigger-take-return", "9-anchor-opponent-discard"],
    enabledTriggeredEffects: ["7-scoring-trigger"],
    excludedGenericEffects: [],
    excludedTriggeredEffects: [],
    allowedActions: ["draw", "play-for-points", "play-for-effect", "scuttle", "pass"],
    rationale: "Canonical First Contact teaching override with engine-owned response, sealed private-choice continuations, and Seven scoring trigger through the trigger queue and response stack."
});
const PROFILES = Object.freeze({
    [FIRST_CONTACT_AUTONOMY_BASELINE_PROFILE.id]: FIRST_CONTACT_AUTONOMY_BASELINE_PROFILE,
    [FIRST_CONTACT_AUTONOMY_ESSENTIALS_PROFILE.id]: FIRST_CONTACT_AUTONOMY_ESSENTIALS_PROFILE,
    [FIRST_CONTACT_RESPONSE_AUTHORITY_PROFILE.id]: FIRST_CONTACT_RESPONSE_AUTHORITY_PROFILE,
    [FIRST_CONTACT_PRIVATE_CHOICE_AUTHORITY_PROFILE.id]: FIRST_CONTACT_PRIVATE_CHOICE_AUTHORITY_PROFILE,
    [FIRST_CONTACT_TRIGGER_CLOSURE_PROFILE.id]: FIRST_CONTACT_TRIGGER_CLOSURE_PROFILE
});
const SUITS = ["♣", "♦", "♥", "♠"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
function profileFor(profileId) {
    const profile = PROFILES[profileId];
    if (!profile)
        throw new Error(`Unsupported autonomous profile: ${profileId}`);
    return profile;
}
function requireSetup(setup) {
    const profile = profileFor(setup.profileId);
    if (setup.playerIds.length !== 2 || new Set(setup.playerIds).size !== 2)
        throw new Error(`${profile.displayName} requires exactly two distinct players`);
    if (setup.seatOrder.length !== 2 || setup.seatOrder.some((id) => !setup.playerIds.includes(id)) || new Set(setup.seatOrder).size !== 2)
        throw new Error("seatOrder must contain both players exactly once");
    if (setup.enabledModules.length > 0 || setup.eventApprovedModules.length > 0)
        throw new Error(`${profile.displayName} does not permit optional modules`);
    if (!Number.isInteger(setup.seed) || (setup.seed >>> 0) === 0)
        throw new Error("seed must be a nonzero uint32");
    return profile;
}
function shuffledDeck(seed) {
    const identities = RANKS.flatMap((rank) => SUITS.map((suit) => `${rank}${suit}`));
    identities.push("RJ", "BJ");
    const rng = { algorithm: "xorshift32", seed: seed >>> 0, cursor: 0 };
    for (let index = identities.length - 1; index > 0; index -= 1) {
        const selected = nextIndex(rng, index + 1);
        [identities[index], identities[selected]] = [identities[selected], identities[index]];
    }
    return { identities, rng };
}
export function createMatchState(setup) {
    const profile = requireSetup(setup);
    const playerIds = [...setup.seatOrder];
    const state = createEmptyState(playerIds);
    const { identities, rng } = shuffledDeck(setup.seed);
    state.rng = rng;
    state.turnOrder = playerIds;
    state.activePlayerId = playerIds[0];
    state.phase = "Start";
    state.fullTurnSequence = 1;
    state.metadata.firstContact = {
        active: true,
        profileId: "first-contact",
        teachingOverrideId: profile.teachingOverrideId,
        allowedActions: [...profile.allowedActions],
        disabledSystems: ["all-optional-modules", "all-suit-specific-effects", "all-advanced-effects", ...(profile.id === FIRST_CONTACT_AUTONOMY_BASELINE_PROFILE.id ? ["all-generic-effects"] : ["unlisted-generic-effects"])]
    };
    state.metadata.autonomy = {
        profileId: profile.id,
        profileVersion: profile.id === FIRST_CONTACT_AUTONOMY_BASELINE_PROFILE.id ? "1.0.0" : profile.id === FIRST_CONTACT_AUTONOMY_ESSENTIALS_PROFILE.id ? "1.1.0" : profile.id === FIRST_CONTACT_RESPONSE_AUTHORITY_PROFILE.id ? "1.2.0" : profile.id === FIRST_CONTACT_PRIVATE_CHOICE_AUTHORITY_PROFILE.id ? "1.4.0" : "1.5.0",
        setupSeed: setup.seed >>> 0,
        enabledGenericEffects: [...profile.enabledGenericEffects],
        actionFamilies: [...profile.allowedActions],
        excludedGenericEffects: "excludedGenericEffects" in profile ? [...profile.excludedGenericEffects] : [],
        enabledResponses: "enabledResponses" in profile ? [...profile.enabledResponses] : [],
        enabledPrivateChoices: "enabledPrivateChoices" in profile ? [...profile.enabledPrivateChoices] : [],
        privateChoice: null,
        disruptedActionTypesByPlayer: Object.fromEntries(playerIds.map((id) => [id, []])),
        exhausted: null,
        terminalReason: null
    };
    for (const player of Object.values(state.players))
        player.goal = profile.goal;
    for (const [index, identity] of identities.entries()) {
        const id = `C-${String(index + 1).padStart(3, "0")}`;
        addCard(state, { id, identity, originalOwnerId: playerIds[index % 2], zone: "DP" });
    }
    for (const [playerIndex, count] of [5, 6].entries()) {
        const playerId = playerIds[playerIndex];
        for (let draw = 0; draw < count; draw += 1) {
            const cardId = state.zones.dp[0];
            moveCard(state, cardId, `${playerId}_HAND`, playerId);
        }
    }
    assertValidState(state);
    return state;
}
function commandId(state, actorId, suffix) {
    return `AUTO-${String(state.revision).padStart(6, "0")}-${actorId}-${suffix}`;
}
function makeAction(state, actorId, family, mode, sourceCardIds, targetCardIds, publicSummaryCode, featureVector, action, timingClass = "ACTION") {
    const actionId = [family, mode, ...sourceCardIds, ...targetCardIds].join(":");
    const commandAction = isResponseProfile(state)
        ? { kind: "autonomy-declare-response-action", action: action }
        : action;
    const command = { id: commandId(state, actorId, hashCanonical(actionId).slice(0, 12)), type: "RESOLVE_PHASE9_ACTION", actorId, action: commandAction };
    return { actionId, actorId, family, mode, timingClass, sourceCardIds, targetCardIds, publicSummaryCode, featureVector, command, commandHash: hashCanonical(command) };
}
function autonomyProfileId(state) {
    const value = state.metadata.autonomy;
    return typeof value === "object" && value !== null && typeof value.profileId === "string" ? value.profileId : null;
}
function isResponseProfile(state) { const id = autonomyProfileId(state); return id === FIRST_CONTACT_RESPONSE_AUTHORITY_PROFILE.id || id === FIRST_CONTACT_PRIVATE_CHOICE_AUTHORITY_PROFILE.id || id === FIRST_CONTACT_TRIGGER_CLOSURE_PROFILE.id; }
function isPrivateChoiceProfile(state) { const id = autonomyProfileId(state); return id === FIRST_CONTACT_PRIVATE_CHOICE_AUTHORITY_PROFILE.id || id === FIRST_CONTACT_TRIGGER_CLOSURE_PROFILE.id; }
function isSupportedAutonomyState(state) {
    const id = autonomyProfileId(state);
    return id !== null && id in PROFILES;
}
function boardLockActive(state) {
    const value = state.metadata.boardLock;
    return typeof value === "object" && value !== null && Number(value.turnsRemaining) > 0;
}
function inRank(cardIdentity, rank) { return parseIdentity(cardIdentity)?.rank === rank; }
function opponentIds(state, actorId) { return state.turnOrder.filter((id) => id !== actorId); }
export function enumerateLegalActions(state, query) {
    assertValidState(state);
    const profile = profileFor(query.profileId);
    if (query.enabledModules.length > 0 || autonomyProfileId(state) !== profile.id)
        throw new Error("UNSUPPORTED_CONFIGURATION");
    if (state.phase !== "Action" || state.activePlayerId !== query.actorId || state.winner !== null)
        throw new Error("PLAYER_DECISION_NOT_AVAILABLE");
    const actor = state.players[query.actorId];
    if (!actor)
        throw new Error("UNKNOWN_ACTOR");
    const actions = [];
    const locked = boardLockActive(state);
    if (state.zones.dp.length > 0) {
        const drawCount = actor.hand.length === 0 ? Math.min(2, state.zones.dp.length) : 1;
        actions.push(makeAction(state, query.actorId, "draw", "top-dp", [], [], "DRAW", { drawCount, progress: true }, { kind: "autonomy-draw" }));
    }
    for (const cardId of [...actor.hand].sort()) {
        const card = state.cards[cardId];
        actions.push(makeAction(state, query.actorId, "play-for-points", "score-pr", [cardId], [], "PLAY_FOR_POINTS", { immediateScore: cardPointValue(card), progress: true }, { kind: "autonomy-score", cardId }));
    }
    const opponents = opponentIds(state, query.actorId);
    if (!locked) {
        for (const sourceCardId of [...actor.hand].sort()) {
            const source = state.cards[sourceCardId];
            for (const opponentId of opponents) {
                for (const targetCardId of [...state.players[opponentId].pr].sort()) {
                    const target = state.cards[targetCardId];
                    if (target.state.aegis === true || typeof target.state.aegis === "object")
                        continue;
                    if (hasOrdinaryScuttleImmunity(target))
                        continue;
                    if (compareScuttle(source, target) <= 0)
                        continue;
                    actions.push(makeAction(state, query.actorId, "scuttle", "ordinary", [sourceCardId], [targetCardId], "SCUTTLE", { targetPointValue: cardPointValue(target), sourcePointValue: cardPointValue(source), disruption: true, progress: true }, { kind: "autonomy-scuttle", sourceCardId, targetCardId }));
                }
            }
        }
    }
    if (profile.id !== FIRST_CONTACT_AUTONOMY_BASELINE_PROFILE.id && !locked) {
        for (const sourceCardId of [...actor.hand].sort()) {
            const source = state.cards[sourceCardId];
            const rank = parseIdentity(source.identity)?.rank;
            if (isPrivateChoiceProfile(state)) {
                if (rank === "5")
                    actions.push(makeAction(state, query.actorId, "effect-private-choice", "five-recycle", [sourceCardId], [], "FIVE_RECYCLE", { privateChoice: true, progress: true }, { kind: "autonomy-five-recycle", sourceCardId }));
                if (rank === "6")
                    actions.push(makeAction(state, query.actorId, "effect-private-choice", "six-dig", [sourceCardId], [], "SIX_DIG", { privateChoice: true, drawCount: Math.min(3, state.zones.dp.length), progress: state.zones.dp.length > 0 }, { kind: "autonomy-six-dig", sourceCardId }));
                if (rank === "7")
                    actions.push(makeAction(state, query.actorId, "effect-private-choice", "seven-topdeck", [sourceCardId], [], "SEVEN_TOPDECK", { privateChoice: true, revealCount: Math.min(2, state.zones.dp.length), progress: state.zones.dp.length > 0 }, { kind: "autonomy-seven-topdeck", sourceCardId }));
            }
            for (const opponentId of opponents) {
                if (isPrivateChoiceProfile(state) && rank === "3") {
                    actions.push(makeAction(state, query.actorId, "effect-private-choice", "three-present-take", [sourceCardId], [], "THREE_PRESENT_TAKE", { privateChoice: true, opponentHandCount: state.players[opponentId].hand.length, progress: state.players[opponentId].hand.length > 0 }, { kind: "autonomy-three-hand-raid", sourceCardId, targetPlayerId: opponentId, mode: "present-take" }));
                    actions.push(makeAction(state, query.actorId, "effect-private-choice", "three-force-discard", [sourceCardId], [], "THREE_FORCE_DISCARD", { privateChoice: true, opponentHandCount: state.players[opponentId].hand.length, disruption: true, progress: state.players[opponentId].hand.length > 0 }, { kind: "autonomy-three-hand-raid", sourceCardId, targetPlayerId: opponentId, mode: "force-discard" }));
                    for (const targetCardId of [...state.players[opponentId].pr, ...state.players[opponentId].er].sort()) {
                        const target = state.cards[targetCardId];
                        const protection = evaluateProtection(state, query.actorId, targetCardId, { channel: "effect", shape: "single-target", hostile: true, operation: "bounce", bypasses: [] });
                        if (!protection.legal)
                            continue;
                        for (const destination of ["top", "bottom"])
                            actions.push(makeAction(state, query.actorId, "effect-bounce", destination, [sourceCardId], [targetCardId], "THREE_BOUNCE", { targetPointValue: cardPointValue(target), disruption: true, progress: true }, { kind: "autonomy-three-bounce", sourceCardId, targetCardId, destination }));
                    }
                }
                const opponent = state.players[opponentId];
                if (rank === "4") {
                    const prAffected = opponent.pr.filter((id) => rankDefinition(state.cards[id]).prEffectTargetImmune !== true).length;
                    const erAffected = opponent.er.filter((id) => state.cards[id].state.firstContactAnchor === true).length;
                    actions.push(makeAction(state, query.actorId, "effect-row-clear", "pr", [sourceCardId], [], "FOUR_CLEAR_PR", { affectedCount: prAffected, disruption: true, progress: prAffected > 0 }, { kind: "autonomy-four-clear", sourceCardId, targetPlayerId: opponentId, row: "pr" }));
                    actions.push(makeAction(state, query.actorId, "effect-row-clear", "er", [sourceCardId], [], "FOUR_CLEAR_ER", { affectedCount: erAffected, disruption: true, progress: erAffected > 0 }, { kind: "autonomy-four-clear", sourceCardId, targetPlayerId: opponentId, row: "er" }));
                }
                if (rank === "9") {
                    for (const targetCardId of [...opponent.pr].sort()) {
                        const protection = evaluateProtection(state, query.actorId, targetCardId, { channel: "effect", shape: "single-target", hostile: true, operation: "tap", bypasses: [] });
                        if (!protection.legal)
                            continue;
                        actions.push(makeAction(state, query.actorId, "effect-tap", "nine", [sourceCardId], [targetCardId], "NINE_TAP", { targetPointValue: cardPointValue(state.cards[targetCardId]), disruption: true, progress: true }, { kind: "autonomy-nine-tap", sourceCardId, targetCardId }, "INSTANT"));
                    }
                    actions.push(makeAction(state, query.actorId, "effect-goal-shift", "plus-3", [sourceCardId], [], "NINE_GOAL_PLUS_3", { goalDelta: 3, disruption: true, progress: true }, { kind: "autonomy-nine-goal-shift", sourceCardId, targetPlayerId: opponentId, delta: 3 }, "INSTANT"));
                    for (const discardCardId of [...actor.hand].filter((id) => id !== sourceCardId).sort()) {
                        actions.push(makeAction(state, query.actorId, "effect-goal-shift", `plus-5-discard-${discardCardId}`, [sourceCardId, discardCardId], [], "NINE_GOAL_PLUS_5", { goalDelta: 5, discardPointValue: cardPointValue(state.cards[discardCardId]), disruption: true, progress: true }, { kind: "autonomy-nine-goal-shift", sourceCardId, targetPlayerId: opponentId, delta: 5, discardCardId }, "INSTANT"));
                    }
                    if (isPrivateChoiceProfile(state))
                        actions.push(makeAction(state, query.actorId, "anchor-private-choice", "nine", [sourceCardId], [], "NINE_ANCHOR", { privateChoice: true, opponentHandCount: opponent.hand.length, anchorValue: 0, progress: true }, { kind: "autonomy-nine-anchor", sourceCardId, targetPlayerId: opponentId }));
                }
                if (rank === "J") {
                    for (const targetCardId of [...opponent.pr].sort()) {
                        const target = state.cards[targetCardId];
                        if (parseIdentity(target.identity)?.rank === "RJ" || target.state.attachedByJackId !== undefined || target.state.attachmentGraph !== undefined)
                            continue;
                        const protection = evaluateProtection(state, query.actorId, targetCardId, { channel: "effect", shape: "single-target", hostile: true, operation: "attachment", bypasses: [] });
                        if (!protection.legal)
                            continue;
                        actions.push(makeAction(state, query.actorId, "effect-jack-control", "pr-attachment", [sourceCardId], [targetCardId], "JACK_PR_ATTACHMENT", { targetPointValue: cardPointValue(target), immediateScore: cardPointValue(target) + 1, disruption: true, progress: true }, { kind: "autonomy-jack-pr-attachment", sourceCardId, targetCardId }));
                    }
                }
                if (rank === "RJ") {
                    actions.push(makeAction(state, query.actorId, "effect-red-joker", "hand-swap", [sourceCardId], [], "RED_JOKER_HAND_SWAP", { ownHandCount: actor.hand.length - 1, opponentHandCount: opponent.hand.length, handDelta: opponent.hand.length - (actor.hand.length - 1), progress: true }, { kind: "autonomy-red-joker", sourceCardId, mode: "hand-swap", targetPlayerId: opponentId }));
                    actions.push(makeAction(state, query.actorId, "effect-red-joker", "opponent-attack", [sourceCardId], [], "RED_JOKER_OPPONENT_ATTACK", { opponentDiscardCount: opponent.hand.length, opponentRedrawCount: Math.max(0, opponent.hand.length - 2), disruption: true, progress: opponent.hand.length > 0 }, { kind: "autonomy-red-joker", sourceCardId, mode: "opponent-attack", targetPlayerId: opponentId }));
                }
            }
            if (rank === "Q")
                actions.push(makeAction(state, query.actorId, "anchor-guard", "queen", [sourceCardId], [], "QUEEN_ANCHOR_GUARD", { guardGain: true, anchorValue: 0, progress: true }, { kind: "autonomy-queen-anchor", sourceCardId }));
            if (rank === "K")
                actions.push(makeAction(state, query.actorId, "anchor", "king", [sourceCardId], [], "KING_ANCHOR", { anchorValue: 7, progress: true }, { kind: "autonomy-king-anchor", sourceCardId }));
            if (rank === "RJ") {
                actions.push(makeAction(state, query.actorId, "effect-red-joker", "self-reset", [sourceCardId], [], "RED_JOKER_SELF_RESET", { discardedCount: actor.hand.length - 1, requestedDrawCount: actor.hand.length + 2, handDelta: 3, progress: true }, { kind: "autonomy-red-joker", sourceCardId, mode: "self-reset" }));
                actions.push(makeAction(state, query.actorId, "effect-red-joker", "shuffle-reset", [sourceCardId], [], "RED_JOKER_SHUFFLE_RESET", { drawCount: Math.min(2, state.zones.dp.length + state.zones.gy.length), recycleCount: state.zones.gy.length, progress: true }, { kind: "autonomy-red-joker", sourceCardId, mode: "shuffle-reset" }));
            }
            if (rank === "BJ")
                actions.push(makeAction(state, query.actorId, "effect-board-lock", "black-joker", [sourceCardId], [], "BLACK_JOKER_BOARD_LOCK", { turnsRemaining: 2, disruption: true, progress: true }, { kind: "autonomy-black-joker-board-lock", sourceCardId }));
        }
    }
    actions.push(makeAction(state, query.actorId, "pass", "end-action", [], [], "PASS", { progress: false }, { kind: "autonomy-pass" }));
    actions.sort((a, b) => a.actionId.localeCompare(b.actionId));
    const frameCore = { stateRevision: state.revision, actorId: query.actorId, actionHashes: actions.map((entry) => ({ actionId: entry.actionId, commandHash: entry.commandHash })) };
    return { stateRevision: state.revision, actorId: query.actorId, actions, frameHash: hashCanonical(frameCore) };
}
function makeResponseAction(state, actorId, family, mode, sourceCardIds, target, summary, featureVector, action) {
    const targetIds = target ? [target.id] : [];
    const actionId = [family, mode, ...sourceCardIds, ...targetIds].join(":");
    const command = { id: commandId(state, actorId, hashCanonical(actionId).slice(0, 12)), type: "RESOLVE_PHASE9_ACTION", actorId, action };
    return { actionId, actorId, family, mode, timingClass: family === "pass-priority" ? "INSTANT" : "INSTANT", sourceCardIds, targetCardIds: [], publicSummaryCode: summary, featureVector, command, commandHash: hashCanonical(command) };
}
function targetAcceptsBaseAce(target) {
    const payload = target.firstContactAuthority;
    if (!payload)
        return false;
    if (payload.kind === "seven-scoring-trigger")
        return false;
    if (payload.kind !== "primary")
        return true;
    if (payload.action.kind === "autonomy-red-joker" && payload.action.mode === "shuffle-reset")
        return false;
    return ["ordinary-effect", "anchor", "goal-mod"].includes(payload.stackClass);
}
export function enumerateResponseActions(state, query) {
    assertValidState(state);
    if (!isResponseProfile(state) || query.profileId !== autonomyProfileId(state) || query.enabledModules.length > 0)
        throw new Error("UNSUPPORTED_CONFIGURATION");
    const priority = state.priority;
    if (!priority?.open || priority.order[priority.index] !== query.actorId)
        throw new Error("RESPONSE_DECISION_NOT_AVAILABLE");
    const actor = state.players[query.actorId];
    if (!actor)
        throw new Error("UNKNOWN_ACTOR");
    const target = state.stack.at(-1) ?? null;
    const actions = [];
    actions.push(makeResponseAction(state, query.actorId, "pass-priority", "pass", [], target, "PASS_PRIORITY", { progress: false }, { kind: "autonomy-pass-priority" }));
    if (target) {
        for (const cardId of [...actor.hand].sort()) {
            const rank = parseIdentity(state.cards[cardId].identity)?.rank;
            if (rank === "A" && targetAcceptsBaseAce(target))
                actions.push(makeResponseAction(state, query.actorId, "counter", "ace-base", [cardId], target, "ACE_BASE_COUNTER", { counter: true, targetClass: target.firstContactAuthority?.kind ?? "unknown", progress: true }, { kind: "autonomy-declare-ace-counter", sourceCardId: cardId, targetStackItemId: target.id }));
            if (rank === "8" && target.firstContactAuthority?.kind === "primary" && target.firstContactAuthority.stackClass === "scuttle")
                actions.push(makeResponseAction(state, query.actorId, "counter", "eight-scuttle", [cardId], target, "EIGHT_SCUTTLE_COUNTER", { counter: true, scuttleCounter: true, progress: true }, { kind: "autonomy-declare-eight-scuttle-counter", sourceCardId: cardId, targetStackItemId: target.id }));
            if (rank === "K" && target.firstContactAuthority?.kind === "primary" && ["anchor", "goal-mod"].includes(target.firstContactAuthority.stackClass) && target.sourceCardIds.length === 1)
                actions.push(makeResponseAction(state, query.actorId, "counter", "king-specialized", [cardId], target, "KING_ANCHOR_GOAL_COUNTER", { counter: true, specialized: true, progress: true }, { kind: "autonomy-declare-king-counter", sourceCardId: cardId, targetStackItemId: target.id }));
            if (rank === "J" && target.firstContactAuthority?.kind === "primary" && target.controllerId !== query.actorId)
                actions.push(makeResponseAction(state, query.actorId, "disrupt", "jack", [cardId], target, "JACK_DISRUPT", { drawCount: state.zones.dp.length > 0 ? 1 : 0, targetActionType: target.firstContactAuthority.actionType, progress: true }, { kind: "autonomy-declare-jack-disrupt", sourceCardId: cardId, targetStackItemId: target.id }));
        }
    }
    actions.sort((a, b) => a.actionId.localeCompare(b.actionId));
    const frameCore = { stateRevision: state.revision, actorId: query.actorId, priorityIndex: priority.index, stackTopId: target?.id ?? null, actionHashes: actions.map((entry) => ({ actionId: entry.actionId, commandHash: entry.commandHash })) };
    const frame = { stateRevision: state.revision, actorId: query.actorId, actions, frameHash: hashCanonical(frameCore) };
    if (actions.length === 1)
        frame.forcedActionId = actions[0].actionId;
    return frame;
}
function pendingPrivateChoice(state) {
    const runtime = state.metadata.autonomy;
    return runtime?.privateChoice ?? null;
}
function combinations(values, min, max) {
    const output = [];
    const visit = (start, current) => {
        if (current.length >= min && current.length <= max)
            output.push([...current]);
        if (current.length === max)
            return;
        for (let index = start; index < values.length; index += 1) {
            current.push(values[index]);
            visit(index + 1, current);
            current.pop();
        }
    };
    visit(0, []);
    return output;
}
function makePrivateChoiceAction(state, choice, mode, selectedCardIds, submission, summary, featureVector) {
    const actionId = ["private-choice", choice.kind, mode, ...selectedCardIds].join(":");
    const command = { id: commandId(state, choice.chooserId, hashCanonical(actionId).slice(0, 12)), type: "RESOLVE_PHASE9_ACTION", actorId: choice.chooserId, action: { kind: "autonomy-submit-private-choice", token: choice.token, submission } };
    return { actionId, actorId: choice.chooserId, family: "private-choice", mode, timingClass: "INSTANT", sourceCardIds: [], targetCardIds: [...selectedCardIds], publicSummaryCode: summary, featureVector, command, commandHash: hashCanonical(command) };
}
function generatedEffectCandidates(state, actorId, cardId) {
    const card = state.cards[cardId];
    if (!card)
        return [];
    const rank = parseIdentity(card.identity)?.rank;
    const opponents = opponentIds(state, actorId);
    const result = [];
    for (const opponentId of opponents) {
        const opponent = state.players[opponentId];
        if (rank === "3") {
            result.push({ kind: "autonomy-three-hand-raid", sourceCardId: cardId, targetPlayerId: opponentId, mode: "present-take" });
            result.push({ kind: "autonomy-three-hand-raid", sourceCardId: cardId, targetPlayerId: opponentId, mode: "force-discard" });
            for (const targetCardId of [...opponent.pr, ...opponent.er].sort()) {
                const protection = evaluateProtection(state, actorId, targetCardId, { channel: "effect", shape: "single-target", hostile: true, operation: "bounce", bypasses: [] });
                if (!protection.legal)
                    continue;
                result.push({ kind: "autonomy-three-bounce", sourceCardId: cardId, targetCardId, destination: "top" });
                result.push({ kind: "autonomy-three-bounce", sourceCardId: cardId, targetCardId, destination: "bottom" });
            }
        }
        if (rank === "4") {
            result.push({ kind: "autonomy-four-clear", sourceCardId: cardId, targetPlayerId: opponentId, row: "pr" });
            result.push({ kind: "autonomy-four-clear", sourceCardId: cardId, targetPlayerId: opponentId, row: "er" });
        }
        if (rank === "9") {
            for (const targetCardId of [...opponent.pr].sort()) {
                const protection = evaluateProtection(state, actorId, targetCardId, { channel: "effect", shape: "single-target", hostile: true, operation: "tap", bypasses: [] });
                if (protection.legal)
                    result.push({ kind: "autonomy-nine-tap", sourceCardId: cardId, targetCardId });
            }
            result.push({ kind: "autonomy-nine-goal-shift", sourceCardId: cardId, targetPlayerId: opponentId, delta: 3 });
            for (const discardCardId of [...state.players[actorId].hand].sort())
                result.push({ kind: "autonomy-nine-goal-shift", sourceCardId: cardId, targetPlayerId: opponentId, delta: 5, discardCardId });
            result.push({ kind: "autonomy-nine-anchor", sourceCardId: cardId, targetPlayerId: opponentId });
        }
        if (rank === "J") {
            for (const targetCardId of [...opponent.pr].sort()) {
                const target = state.cards[targetCardId];
                if (parseIdentity(target.identity)?.rank === "RJ" || target.state.attachedByJackId !== undefined || target.state.attachmentGraph !== undefined)
                    continue;
                const protection = evaluateProtection(state, actorId, targetCardId, { channel: "effect", shape: "single-target", hostile: true, operation: "attachment", bypasses: [] });
                if (protection.legal)
                    result.push({ kind: "autonomy-jack-pr-attachment", sourceCardId: cardId, targetCardId });
            }
        }
        if (rank === "RJ") {
            result.push({ kind: "autonomy-red-joker", sourceCardId: cardId, mode: "hand-swap", targetPlayerId: opponentId });
            result.push({ kind: "autonomy-red-joker", sourceCardId: cardId, mode: "opponent-attack", targetPlayerId: opponentId });
        }
    }
    if (rank === "5")
        result.push({ kind: "autonomy-five-recycle", sourceCardId: cardId });
    if (rank === "6")
        result.push({ kind: "autonomy-six-dig", sourceCardId: cardId });
    if (rank === "7")
        result.push({ kind: "autonomy-seven-topdeck", sourceCardId: cardId });
    if (rank === "Q")
        result.push({ kind: "autonomy-queen-anchor", sourceCardId: cardId });
    if (rank === "K")
        result.push({ kind: "autonomy-king-anchor", sourceCardId: cardId });
    if (rank === "RJ") {
        result.push({ kind: "autonomy-red-joker", sourceCardId: cardId, mode: "self-reset" });
        result.push({ kind: "autonomy-red-joker", sourceCardId: cardId, mode: "shuffle-reset" });
    }
    if (rank === "BJ")
        result.push({ kind: "autonomy-black-joker-board-lock", sourceCardId: cardId });
    return result;
}
export function enumeratePrivateChoiceActions(state, query) {
    assertValidState(state);
    if (!isPrivateChoiceProfile(state) || query.profileId !== autonomyProfileId(state) || query.enabledModules.length > 0)
        throw new Error("UNSUPPORTED_CONFIGURATION");
    const choice = pendingPrivateChoice(state);
    if (!choice || choice.chooserId !== query.actorId)
        throw new Error("PRIVATE_CHOICE_DECISION_NOT_AVAILABLE");
    const actions = [];
    if (choice.kind === "rank3-present" || choice.kind === "rank3-discard") {
        for (const selected of combinations(choice.optionCardIds, choice.minSelections, choice.maxSelections)) {
            const submission = choice.kind === "rank3-present" ? { kind: "rank3-present", selectedCardIds: selected } : { kind: "rank3-discard", selectedCardIds: selected };
            actions.push(makePrivateChoiceAction(state, choice, `select-${selected.join("-") || "none"}`, selected, submission, choice.kind === "rank3-present" ? "THREE_PRESENT_SELECTION" : "THREE_DISCARD_SELECTION", { selectedCount: selected.length, privateChoice: true, progress: selected.length > 0 }));
        }
    }
    else if (["rank3-take", "rank5-rummage", "nine-anchor-discard"].includes(choice.kind)) {
        for (const cardId of choice.optionCardIds) {
            const submission = choice.kind === "rank3-take" ? { kind: "rank3-take", selectedCardIds: [cardId] } : choice.kind === "rank5-rummage" ? { kind: "rank5-rummage", selectedCardIds: [cardId] } : { kind: "nine-anchor-discard", selectedCardIds: [cardId] };
            actions.push(makePrivateChoiceAction(state, choice, `select-${cardId}`, [cardId], submission, choice.kind.toUpperCase().replaceAll("-", "_"), { selectedCount: 1, privateChoice: true, progress: true }));
        }
    }
    else if (choice.kind === "rank6-dig") {
        const context = choice.context;
        const drawn = context.drawnCardIds ?? [];
        const keepCount = Math.min(2, drawn.length);
        for (const keep of combinations(drawn, keepCount, keepCount)) {
            for (const mode of ["keep-return-top", "keep-return-bottom"])
                actions.push(makePrivateChoiceAction(state, choice, `${mode}-${keep.join("-")}`, keep, { kind: "rank6-dig", mode, selectedCardIds: keep }, "SIX_DIG_KEEP_RETURN", { keptCount: keep.length, returnedCount: drawn.length - keep.length, privateChoice: true, progress: true }));
        }
        for (const discardCardId of context.discardOptionCardIds ?? [])
            actions.push(makePrivateChoiceAction(state, choice, `keep-all-discard-${discardCardId}`, [discardCardId], { kind: "rank6-dig", mode: "keep-all-discard", selectedCardIds: [discardCardId] }, "SIX_DIG_KEEP_ALL_DISCARD", { keptCount: drawn.length, discardCount: 1, privateChoice: true, progress: true }));
    }
    else if (choice.kind === "rank7-assign") {
        if (choice.optionCardIds.length === 1) {
            const cardId = choice.optionCardIds[0];
            actions.push(makePrivateChoiceAction(state, choice, `hand-${cardId}`, [cardId], { kind: "rank7-assign", mode: "hand-only", selectedCardIds: [cardId] }, "SEVEN_ASSIGN_HAND", { handCount: 1, effectCount: 0, privateChoice: true, progress: true }));
            actions.push(makePrivateChoiceAction(state, choice, `effect-${cardId}`, [cardId], { kind: "rank7-assign", mode: "effect-only", selectedCardIds: [cardId] }, "SEVEN_ASSIGN_EFFECT", { handCount: 0, effectCount: 1, privateChoice: true, progress: true }));
        }
        else {
            const [a, b] = choice.optionCardIds;
            actions.push(makePrivateChoiceAction(state, choice, `hand-${a}-effect-${b}`, [a, b], { kind: "rank7-assign", mode: "hand-and-effect", selectedCardIds: [a, b] }, "SEVEN_ASSIGN_HAND_EFFECT", { handCount: 1, effectCount: 1, privateChoice: true, progress: true }));
            actions.push(makePrivateChoiceAction(state, choice, `hand-${b}-effect-${a}`, [b, a], { kind: "rank7-assign", mode: "hand-and-effect", selectedCardIds: [b, a] }, "SEVEN_ASSIGN_HAND_EFFECT", { handCount: 1, effectCount: 1, privateChoice: true, progress: true }));
        }
    }
    else if (choice.kind === "rank7-scoring-trigger") {
        for (const cardId of choice.optionCardIds) {
            actions.push(makePrivateChoiceAction(state, choice, `take-${cardId}`, [cardId], { kind: "rank7-scoring-trigger", selectedCardIds: [cardId] }, "SEVEN_SCORING_TRIGGER_TAKE", { privateChoice: true, triggeredAbility: true, takeCount: 1, returnCount: Math.max(0, choice.optionCardIds.length - 1), progress: true }));
        }
    }
    else if (choice.kind === "rank7-generated-effect") {
        const generatedCardId = choice.optionCardIds[0];
        const candidates = generatedEffectCandidates(state, choice.controllerId, generatedCardId);
        if (candidates.length === 0)
            actions.push(makePrivateChoiceAction(state, choice, "no-legal-effect", [generatedCardId], { kind: "rank7-generated-effect", selectedCardIds: [generatedCardId] }, "SEVEN_GENERATED_EFFECT_UNAVAILABLE", { privateChoice: true, progress: false }));
        for (const generatedAction of candidates) {
            const mode = `${generatedAction.kind}-${hashCanonical(generatedAction).slice(0, 10)}`;
            actions.push(makePrivateChoiceAction(state, choice, mode, [generatedCardId], { kind: "rank7-generated-effect", selectedCardIds: [generatedCardId], generatedAction }, "SEVEN_GENERATED_EFFECT", { privateChoice: true, generatedActionKind: generatedAction.kind, progress: true }));
        }
    }
    actions.sort((a, b) => a.actionId.localeCompare(b.actionId));
    const frameCore = { stateRevision: state.revision, choiceId: choice.choiceId, token: choice.token, chooserId: choice.chooserId, actionHashes: actions.map((entry) => ({ actionId: entry.actionId, commandHash: entry.commandHash })) };
    const frame = { stateRevision: state.revision, actorId: choice.chooserId, actions, frameHash: hashCanonical(frameCore) };
    if (actions.length === 1)
        frame.forcedActionId = actions[0].actionId;
    return frame;
}
export function authorizedLegalActionView(action) {
    return {
        actionId: action.actionId,
        actorId: action.actorId,
        family: action.family,
        mode: action.mode,
        timingClass: action.timingClass,
        sourceHandles: [...action.sourceCardIds],
        targetHandles: [...action.targetCardIds],
        publicSummaryCode: action.publicSummaryCode,
        featureVector: canonicalClone(action.featureVector),
        engineCommandHash: action.commandHash
    };
}
export function advanceToDecision(input, limits = {}) {
    const maxCommands = limits.maxCommands ?? 32;
    const engine = new IntrilexEngine();
    let state = canonicalClone(input);
    const events = [];
    const executedCommands = [];
    if (!isSupportedAutonomyState(state))
        return { status: "UNSUPPORTED_CONFIGURATION", state, events, executedCommands, reasonCode: "AUTONOMY_PROFILE_UNAVAILABLE" };
    for (let count = 0; count < maxCommands; count += 1) {
        const terminalReason = state.metadata.autonomy?.terminalReason;
        if (state.winner !== null || terminalReason === "CANONICAL_DRAW")
            return { status: "TERMINAL", state, events, executedCommands, reasonCode: terminalReason ?? "NORMAL_VICTORY" };
        if (state.pendingDeclaration !== null)
            return { status: "UNSUPPORTED_CONFIGURATION", state, events, executedCommands, reasonCode: "AUTONOMY_PENDING_DECLARATION_UNEXPECTED" };
        const privateChoice = pendingPrivateChoice(state);
        if (privateChoice) {
            if (!isPrivateChoiceProfile(state))
                return { status: "UNSUPPORTED_CONFIGURATION", state, events, executedCommands, reasonCode: "PRIVATE_CHOICE_PROFILE_MISMATCH" };
            const legalActionFrame = enumeratePrivateChoiceActions(state, { actorId: privateChoice.chooserId, visibility: "PLAYER_AUTHORIZED", profileId: autonomyProfileId(state), enabledModules: [] });
            return { status: "PLAYER_DECISION_REQUIRED", state, events, executedCommands, decisionActorId: privateChoice.chooserId, legalActionFrame };
        }
        if (autonomyProfileId(state) === FIRST_CONTACT_TRIGGER_CLOSURE_PROFILE.id && state.triggerQueue.length > 0) {
            const controllerId = state.triggerQueue[0].controllerId;
            const command = { id: commandId(state, controllerId, `ORCH-${count}-TRIGGER`), type: "RESOLVE_PHASE9_ACTION", actorId: controllerId, action: { kind: "autonomy-flush-trigger-queue" } };
            const result = engine.execute(state, command);
            if (!result.accepted)
                return { status: "UNSUPPORTED_CONFIGURATION", state, events, executedCommands, reasonCode: `ORCHESTRATION_REJECTED:${result.error?.code ?? "UNKNOWN"}` };
            state = result.state;
            events.push(...result.events);
            executedCommands.push(command);
            continue;
        }
        if (isResponseProfile(state) && state.priority?.open === true) {
            const priorityActorId = state.priority.order[state.priority.index];
            const legalActionFrame = enumerateResponseActions(state, { actorId: priorityActorId, visibility: "PLAYER_AUTHORIZED", profileId: autonomyProfileId(state), enabledModules: [] });
            return { status: "PLAYER_DECISION_REQUIRED", state, events, executedCommands, decisionActorId: priorityActorId, legalActionFrame };
        }
        if (isResponseProfile(state) && state.stack.length > 0 && state.priority?.open !== true) {
            const command = { id: commandId(state, state.activePlayerId, `ORCH-${count}-RESOLVE`), type: "RESOLVE_PHASE9_ACTION", actorId: state.activePlayerId, action: { kind: "autonomy-resolve-response-top" } };
            const result = engine.execute(state, command);
            if (!result.accepted)
                return { status: "UNSUPPORTED_CONFIGURATION", state, events, executedCommands, reasonCode: `ORCHESTRATION_REJECTED:${result.error?.code ?? "UNKNOWN"}` };
            state = result.state;
            events.push(...result.events);
            executedCommands.push(command);
            continue;
        }
        if (state.stack.length > 0 || state.priority?.open === true)
            return { status: "UNSUPPORTED_CONFIGURATION", state, events, executedCommands, reasonCode: "AUTONOMY_STACK_STATE_UNEXPECTED" };
        if (state.phase === "Action") {
            const profileId = autonomyProfileId(state);
            const legalActionFrame = enumerateLegalActions(state, { actorId: state.activePlayerId, visibility: "PLAYER_AUTHORIZED", profileId, enabledModules: [] });
            return { status: "PLAYER_DECISION_REQUIRED", state, events, executedCommands, decisionActorId: state.activePlayerId, legalActionFrame };
        }
        const actions = state.phase === "Start"
            ? [{ kind: "begin-start", playerId: state.activePlayerId }, { kind: "autonomy-enter-action" }]
            : state.phase === "End"
                ? [{ kind: "autonomy-complete-turn" }]
                : [{ kind: "autonomy-enter-action" }];
        for (const [step, action] of actions.entries()) {
            const command = { id: commandId(state, state.activePlayerId, `ORCH-${count}-${step}`), type: "RESOLVE_PHASE9_ACTION", actorId: state.activePlayerId, action };
            const result = engine.execute(state, command);
            if (!result.accepted)
                return { status: "UNSUPPORTED_CONFIGURATION", state, events, executedCommands, reasonCode: `ORCHESTRATION_REJECTED:${result.error?.code ?? "UNKNOWN"}` };
            state = result.state;
            events.push(...result.events);
            executedCommands.push(command);
        }
    }
    return { status: "UNSUPPORTED_CONFIGURATION", state, events, executedCommands, reasonCode: "ORCHESTRATION_COMMAND_LIMIT" };
}
export function autonomousCapabilities() {
    return [
        {
            profileId: FIRST_CONTACT_AUTONOMY_BASELINE_PROFILE.id,
            playerCounts: [2], moduleSets: [[]], completeActionFamilies: [...FIRST_CONTACT_AUTONOMY_BASELINE_PROFILE.allowedActions], status: "SUPPORTED",
            reasonCodes: ["FORMAL_FIRST_CONTACT_TEACHING_OVERRIDE", "GENERIC_EFFECT_ALLOWLIST_EMPTY"]
        },
        {
            profileId: FIRST_CONTACT_RESPONSE_AUTHORITY_PROFILE.id,
            playerCounts: [2], moduleSets: [[]], completeActionFamilies: [...FIRST_CONTACT_RESPONSE_AUTHORITY_PROFILE.allowedActions, ...FIRST_CONTACT_RESPONSE_AUTHORITY_PROFILE.enabledResponses], status: "SUPPORTED",
            reasonCodes: ["FORMAL_FIRST_CONTACT_TEACHING_OVERRIDE", "ENGINE_OWNED_PRIORITY", "ENGINE_OWNED_COUNTER_AUTHORITY", "PRIVATE_CHOICE_EFFECTS_EXCLUDED"]
        },
        {
            profileId: FIRST_CONTACT_PRIVATE_CHOICE_AUTHORITY_PROFILE.id,
            playerCounts: [2], moduleSets: [[]], completeActionFamilies: [...FIRST_CONTACT_PRIVATE_CHOICE_AUTHORITY_PROFILE.allowedActions, ...FIRST_CONTACT_PRIVATE_CHOICE_AUTHORITY_PROFILE.enabledResponses, ...FIRST_CONTACT_PRIVATE_CHOICE_AUTHORITY_PROFILE.enabledPrivateChoices], status: "SUPPORTED",
            reasonCodes: ["FORMAL_FIRST_CONTACT_TEACHING_OVERRIDE", "ENGINE_OWNED_PRIORITY", "ENGINE_OWNED_COUNTER_AUTHORITY", "SEALED_PRIVATE_CHOICE_TOKENS", "VIEWER_AUTHORIZED_CHOICE_FRAMES", "SEVEN_SCORING_TRIGGER_EXCLUDED"]
        },
        {
            profileId: FIRST_CONTACT_TRIGGER_CLOSURE_PROFILE.id,
            playerCounts: [2], moduleSets: [[]], completeActionFamilies: [...FIRST_CONTACT_TRIGGER_CLOSURE_PROFILE.allowedActions, ...FIRST_CONTACT_TRIGGER_CLOSURE_PROFILE.enabledResponses, ...FIRST_CONTACT_TRIGGER_CLOSURE_PROFILE.enabledPrivateChoices], status: "SUPPORTED",
            reasonCodes: ["FORMAL_FIRST_CONTACT_TEACHING_OVERRIDE", "ENGINE_OWNED_PRIORITY", "ENGINE_OWNED_COUNTER_AUTHORITY", "SEALED_PRIVATE_CHOICE_TOKENS", "VIEWER_AUTHORIZED_CHOICE_FRAMES", "ENGINE_OWNED_TRIGGER_QUEUE", "SEVEN_SCORING_TRIGGER_SUPPORTED"]
        },
        {
            profileId: FIRST_CONTACT_AUTONOMY_ESSENTIALS_PROFILE.id,
            playerCounts: [2], moduleSets: [[]], completeActionFamilies: [...FIRST_CONTACT_AUTONOMY_ESSENTIALS_PROFILE.allowedActions], status: "SUPPORTED",
            reasonCodes: ["FORMAL_FIRST_CONTACT_TEACHING_OVERRIDE", "EXPLICIT_GENERIC_EFFECT_ALLOWLIST", "RESPONSE_WINDOW_EFFECTS_EXCLUDED"]
        }
    ];
}
export function runRandomLegalMatch(setup, decisionLimit = 500) {
    let state = createMatchState(setup);
    const commands = [];
    const events = [];
    const decisions = [];
    const policyRng = { algorithm: "xorshift32", seed: ((setup.seed ^ 0xa5a5a5a5) >>> 0) || 1, cursor: 0 };
    const engine = new IntrilexEngine();
    for (let index = 0; index < decisionLimit; index += 1) {
        const advanced = advanceToDecision(state);
        state = advanced.state;
        commands.push(...advanced.executedCommands);
        events.push(...advanced.events);
        if (advanced.status === "TERMINAL")
            return { state, commands, events, decisions, terminationReason: (advanced.reasonCode === "CANONICAL_DRAW" ? "CANONICAL_DRAW" : advanced.reasonCode === "EXHAUSTED_RESOLUTION" ? "EXHAUSTED_RESOLUTION" : "NORMAL_VICTORY") };
        if (advanced.status !== "PLAYER_DECISION_REQUIRED" || !advanced.legalActionFrame)
            return { state, commands, events, decisions, terminationReason: "UNSUPPORTED_CONFIGURATION" };
        const actions = advanced.legalActionFrame.actions;
        const selected = actions[nextIndex(policyRng, actions.length)];
        decisions.push({ actorId: selected.actorId, actionId: selected.actionId, frameHash: advanced.legalActionFrame.frameHash });
        const result = engine.execute(state, selected.command);
        commands.push(selected.command);
        events.push(...result.events);
        if (!result.accepted)
            return { state, commands, events, decisions, terminationReason: "ENGINE_REJECTION" };
        state = result.state;
    }
    return { state, commands, events, decisions, terminationReason: "DECISION_LIMIT" };
}
//# sourceMappingURL=autonomy.js.map