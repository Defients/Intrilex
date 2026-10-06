import { cleanupForZoneTransition, resolveDestination } from "./lifecycle.js";
export function createPlayer(id, goal = 21) {
    return {
        id,
        teamId: null,
        goal,
        hand: [],
        pr: [],
        er: [],
        limits: {
            miniTurnsUsed: 0,
            miniTurnsRemaining: 1,
            swapBarUsedThisFT: false,
            rank10PlayedThisFT: false,
            ultraPlayedThisFT: false,
            pendingFullTurnSkips: 0,
            pendingActionPhaseSkips: 0
        }
    };
}
export function createEmptyState(playerIds = ["P1", "P2"]) {
    const players = Object.fromEntries(playerIds.map((id) => [id, createPlayer(id)]));
    return {
        schemaVersion: 1,
        rulesVersion: "4.1",
        revision: 0,
        phase: "Action",
        activePlayerId: playerIds[0] ?? "P1",
        turnOrder: [...playerIds],
        fullTurnSequence: 1,
        startPhaseSequenceByPlayer: Object.fromEntries(playerIds.map((id) => [id, 0])),
        players,
        cards: {},
        zones: { dp: [], gy: [], exile: [], swapBar: [], staging: [] },
        stack: [],
        triggerQueue: [],
        suspendedStackItemIds: [],
        pendingDeclaration: null,
        priority: null,
        rng: { algorithm: "xorshift32", seed: 0x1a2b3c4d, cursor: 0 },
        winner: null,
        metadata: {}
    };
}
export function zoneList(state, zone) {
    if (zone === "DP")
        return state.zones.dp;
    if (zone === "GY")
        return state.zones.gy;
    if (zone === "EXILE")
        return state.zones.exile;
    if (zone === "SWAP_BAR")
        return state.zones.swapBar;
    if (zone === "STAGING")
        return state.zones.staging;
    if (zone === "ON_STACK" || zone === "VOID")
        return [];
    const match = /^(.*)_(HAND|PR|ER)$/.exec(zone);
    if (!match)
        throw new Error(`Unknown zone: ${zone}`);
    const player = state.players[match[1]];
    if (!player)
        throw new Error(`Unknown player in zone: ${zone}`);
    if (match[2] === "HAND")
        return player.hand;
    if (match[2] === "PR")
        return player.pr;
    return player.er;
}
export function removeFromCurrentZone(state, cardId) {
    const card = state.cards[cardId];
    if (!card)
        throw new Error(`Unknown card: ${cardId}`);
    if (card.zone === "ON_STACK" || card.zone === "VOID")
        return;
    const list = zoneList(state, card.zone);
    const index = list.indexOf(cardId);
    if (index >= 0)
        list.splice(index, 1);
}
export function moveCard(state, cardId, destination, controllerId) {
    const card = state.cards[cardId];
    if (!card)
        throw new Error(`Unknown card: ${cardId}`);
    const from = card.zone;
    const actualDestination = resolveDestination(card, destination);
    removeFromCurrentZone(state, cardId);
    cleanupForZoneTransition(card, from, actualDestination);
    card.zone = actualDestination;
    if (controllerId !== undefined)
        card.controllerId = controllerId;
    if (actualDestination !== "ON_STACK" && actualDestination !== "VOID")
        zoneList(state, actualDestination).push(cardId);
    return actualDestination;
}
export function addCard(state, card) {
    if (state.cards[card.id])
        throw new Error(`Duplicate card id: ${card.id}`);
    state.cards[card.id] = {
        id: card.id,
        identity: card.identity,
        originalOwnerId: card.originalOwnerId,
        controllerId: card.controllerId ?? card.originalOwnerId,
        zone: card.zone,
        state: { ...(card.state ?? {}) }
    };
    if (card.zone !== "ON_STACK" && card.zone !== "VOID")
        zoneList(state, card.zone).push(card.id);
}
export function deriveSecuredPoints(state, playerId) {
    const player = state.players[playerId];
    if (!player)
        throw new Error(`Unknown player: ${playerId}`);
    let total = 0;
    for (const cardId of player.pr) {
        const card = state.cards[cardId];
        if (!card || card.controllerId !== playerId || card.state.tapped === true)
            continue;
        const pointValue = card.state.pointValue;
        const jackPointBonus = card.state.jackPointBonus;
        total += (typeof pointValue === "number" ? pointValue : 0) + (typeof jackPointBonus === "number" ? jackPointBonus : 0);
    }
    const phase12 = state.metadata.phase12;
    const spec = phase12?.enabled === true ? phase12.selectedSpecByPlayer?.[playerId] : undefined;
    if (spec === "Brilliance") {
        const qualifyingQueens = [...player.pr, ...player.er].filter((cardId) => {
            const card = state.cards[cardId];
            return card !== undefined
                && card.controllerId === playerId
                && /^Q[♣♦♥♠]$/.test(card.identity)
                && card.state.tapped !== true
                && card.state.faceDownTrap !== true;
        }).length;
        if (qualifyingQueens > 0)
            total += qualifyingQueens + 1;
    }
    else if (spec === "Beauty") {
        const controlled = [...player.pr, ...player.er].map((id) => state.cards[id]).filter((card) => card !== undefined && card.controllerId === playerId && card.state.tapped !== true && card.state.faceDownTrap !== true && card.state.attachedByJackId === undefined && card.state.attachmentGraph === undefined);
        const marriageBonus = { "♣": 6, "♦": 7, "♥": 8, "♠": 9 };
        for (const suit of ["♣", "♦", "♥", "♠"]) {
            if (controlled.some((card) => card.identity === `K${suit}`) && controlled.some((card) => card.identity === `Q${suit}`))
                total += marriageBonus[suit] ?? 0;
        }
    }
    return total;
}
//# sourceMappingURL=state.js.map