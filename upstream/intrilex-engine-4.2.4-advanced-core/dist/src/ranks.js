import { canonicalClone } from "./canonical-json.js";
import { applyAegis, applyTap, hasAegis, markExileBound, revealUntilStart } from "./lifecycle.js";
import { deriveSecuredPoints, moveCard } from "./state.js";
export const RANK_REGISTRY = Object.freeze({
    A: { rank: "A", prPoints: 4, scuttleOrder: 1, modes: ["base-counter", "purge", "anchor-counter", "spade-exile-counter", "super-counter"], prScuttleImmune: true, notes: ["A♠ and ⭐A use expanded counter authority."] },
    "2": { rank: "2", prPoints: 2, scuttleOrder: 2, modes: ["quick-score-discard", "wild-catalyst", "commandeer"], notes: ["⭐2 bypasses Guard and rank control protection, never Aegis."] },
    "3": { rank: "3", prPoints: 3, scuttleOrder: 3, modes: ["hand-raid", "instant-bounce", "spade-enhancement", "super-raid"], notes: ["Generated effect plays open their own response window."] },
    "4": { rank: "4", prPoints: 4, scuttleOrder: 4, modes: ["row-clear", "natural", "total-clear", "row-exchange"], prEffectTargetImmune: true, notes: ["4♠ and ⭐4 are structural operations."] },
    "5": { rank: "5", prPoints: 5, scuttleOrder: 5, modes: ["recycle", "suit-rummage", "super-recycle"], prScuttleImmune: true, notes: ["Exile access is suit-position dependent."] },
    "6": { rank: "6", prPoints: 6, scuttleOrder: 6, modes: ["dig", "swap-bar-peek", "deep-draw", "super-dig"], notes: ["6♠ requires at least one other hand card at declaration."] },
    "7": { rank: "7", prPoints: 7, scuttleOrder: 7, modes: ["topdeck-cast", "scoring-trigger", "spade-topdeck", "sequential-topdeck"], notes: ["⭐7 uses suspended child plays."] },
    "8": { rank: "8", prPoints: 8, scuttleOrder: 8, modes: ["aegis-field", "scuttle-counter", "free-scuttle", "absolute-scuttle"], prEffectTargetImmune: true, notes: ["8♠ respects Scuttle immunity; ⭐8 ignores ordinary Scuttle immunity."] },
    "9": { rank: "9", prPoints: 9, scuttleOrder: 9, modes: ["tap", "goal-shift", "spade-goal-shift", "anchor"], notes: ["Nines can never receive Aegis."] },
    "10": { rank: "10", prPoints: 10, scuttleOrder: 10, modes: ["club-foundation", "diamond-mimic", "heart-tempo", "spade-stack-theft", "spade-exile-recovery"], notes: ["Effect-play Tens become permanently Exile-Bound when resolution begins."] },
    J: { rank: "J", prPoints: 3, scuttleOrder: 11, modes: ["disrupt", "pr-attachment", "er-attachment", "tempo-force"], notes: ["Attachment validity is rechecked after relevant state changes."] },
    Q: { rank: "Q", prPoints: 2, scuttleOrder: 12, modes: ["pr-score", "guard-anchor", "quick-aegis", "spade-protection"], notes: ["A Queen entering ER receives exact future-Start Aegis."] },
    K: { rank: "K", prPoints: 8, scuttleOrder: 13, modes: ["anchor-goal-counter", "spade-multi-counter", "anchor", "royal-marriage"], notes: ["Royal Marriage is not a Combo."] },
    RJ: { rank: "RJ", prPoints: 5, scuttleOrder: 14, modes: ["hand-swap", "self-reset", "opponent-attack", "shuffle-reset"], prScuttleImmune: true, notes: ["Shuffle Reset has narrow counter authority."] },
    BJ: { rank: "BJ", prPoints: 11, scuttleOrder: 15, modes: ["board-lock", "exile-recycle"], notes: ["Board Lock uses completed-FT timing."] }
});
const SUIT_ORDER = Object.freeze({ "♣": 1, "♦": 2, "♥": 3, "♠": 4 });
export function parseIdentity(identity) {
    if (identity === "RJ" || identity === "BJ")
        return { rank: identity, suit: null };
    const match = /^(A|[2-9]|10|J|Q|K)(♣|♦|♥|♠)$/.exec(identity);
    if (!match)
        return null;
    return { rank: match[1], suit: match[2] };
}
export function rankDefinition(cardOrIdentity) {
    const identity = typeof cardOrIdentity === "string" ? cardOrIdentity : cardOrIdentity.identity;
    const parsed = parseIdentity(identity);
    if (!parsed)
        throw new Error(`Unknown Intrilex card identity: ${identity}`);
    return RANK_REGISTRY[parsed.rank];
}
export function allRankDefinitions() {
    return ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "RJ", "BJ"].map((rank) => canonicalClone(RANK_REGISTRY[rank]));
}
export function cardPointValue(card) {
    if (typeof card.state.pointValue === "number")
        return card.state.pointValue;
    return rankDefinition(card).prPoints;
}
export function hasOrdinaryScuttleImmunity(card) {
    return card.zone.endsWith("_PR") && rankDefinition(card).prScuttleImmune === true;
}
export function compareScuttle(source, target) {
    const a = parseIdentity(source.identity);
    const b = parseIdentity(target.identity);
    if (!a || !b)
        throw new Error("Scuttle comparison requires canonical identities");
    const rankDelta = RANK_REGISTRY[a.rank].scuttleOrder - RANK_REGISTRY[b.rank].scuttleOrder;
    if (rankDelta !== 0)
        return rankDelta;
    if (a.suit === null || b.suit === null)
        return 0;
    return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
}
function futureStart(state, playerId) {
    return { playerId, startSequence: (state.startPhaseSequenceByPlayer[playerId] ?? 0) + 1 };
}
function card(state, id) { return state.cards[id] ?? null; }
function playerExists(state, id) { return state.players[id] !== undefined; }
function inHandOf(state, id, playerId) {
    const value = card(state, id);
    return value !== null && value.controllerId === playerId && value.zone === `${playerId}_HAND`;
}
function isRank(state, id, rank, suit) {
    const value = card(state, id);
    const parsed = value ? parseIdentity(value.identity) : null;
    return parsed !== null && parsed.rank === rank && (suit === undefined || parsed.suit === suit);
}
function fail(code, message, details) {
    return details === undefined ? { ok: false, code, message } : { ok: false, code, message, details };
}
function removeSources(state, sourceIds, destination = "GY") {
    for (const id of sourceIds)
        moveCard(state, id, destination);
}
function currentRowOwner(zone) {
    const match = /^(.*)_(PR|ER)$/.exec(zone);
    return match ? match[1] : null;
}
function enemyPrTarget(state, actorId, targetId) {
    const target = card(state, targetId);
    if (!target || !target.zone.endsWith("_PR") || target.controllerId === actorId)
        return null;
    return target;
}
export function resolveRankAction(input, actorId, action) {
    if (!playerExists(input, actorId))
        return fail("RANK_PLAYER", `Unknown actor ${actorId}`);
    const state = canonicalClone(input);
    const events = [];
    switch (action.kind) {
        case "ace-counter": {
            const expectedCount = action.authority === "super" ? 2 : 1;
            if (action.sourceCardIds.length !== expectedCount || !action.sourceCardIds.every((id) => inHandOf(state, id, actorId) && isRank(state, id, "A")))
                return fail("COUNTER_SOURCE", `Ace ${action.authority} counter requires ${expectedCount} Ace source card(s)`);
            if (action.authority === "spade" && !isRank(state, action.sourceCardIds[0], "A", "♠"))
                return fail("COUNTER_SOURCE", "Spade authority requires A♠");
            if (action.authority === "base" && isRank(state, action.sourceCardIds[0], "A", "♠"))
                return fail("COUNTER_SOURCE", "A♠ uses spade authority, not Base Ace authority");
            const index = state.stack.findIndex((item) => item.id === action.stackItemId);
            if (index < 0)
                return fail("COUNTER_TARGET", "Ace counter requires a pending stack item");
            const target = state.stack[index];
            const superOnly = target.kind === "A-spade-counter" || target.kind === "Ultra" || target.kind === "SuddenDeath";
            if (superOnly && action.authority !== "super")
                return fail("COUNTER_AUTHORITY", `${target.kind} may be countered only by ⭐A`);
            if (target.kind.startsWith("royal-shield") && action.authority === "base")
                return fail("ROYAL_SHIELD", "Royal Shield blocks Base Ace authority");
            state.stack.splice(index, 1);
            const targetDestination = action.authority === "spade" ? "EXILE" : target.sourceDestination;
            for (const id of target.sourceCardIds)
                if (state.cards[id]?.zone === "ON_STACK")
                    moveCard(state, id, targetDestination);
            removeSources(state, action.sourceCardIds);
            events.push({ type: "ACE_COUNTER_RESOLVED", payload: { sourceCardIds: action.sourceCardIds, authority: action.authority, targetStackItemId: target.id, targetDestination } });
            break;
        }
        case "commandeer": {
            if (action.sourceCardIds.length !== 2 || !action.sourceCardIds.every((id) => inHandOf(state, id, actorId) && isRank(state, id, "2")))
                return fail("RANK_SOURCE", "⭐2 requires two Twos controlled in hand");
            const target = card(state, action.targetCardId);
            if (!target || (!target.zone.endsWith("_PR") && !target.zone.endsWith("_ER")) || target.controllerId === actorId)
                return fail("RANK_TARGET", "⭐2 requires an enemy OTT target");
            if (hasAegis(target))
                return fail("AEGIS_BLOCK", "⭐2 does not bypass Aegis");
            removeSources(state, [...action.sourceCardIds]);
            const oldController = target.controllerId;
            const row = target.zone.endsWith("_ER") ? "ER" : "PR";
            target.controllerId = actorId;
            moveCard(state, target.id, `${actorId}_${row}`, actorId);
            if (action.disposition === "hold")
                applyTap(target, { kind: "start-phase", sourceRef: "⭐2", expiresAt: futureStart(state, actorId) });
            else {
                delete target.state.tapped;
                delete target.state.tapState;
            }
            events.push({ type: "COMMANDEER_RESOLVED", payload: { sourceCardIds: action.sourceCardIds, targetCardId: target.id, oldController, controllerId: actorId, disposition: action.disposition } });
            break;
        }
        case "total-clear": {
            if (!inHandOf(state, action.sourceCardId, actorId) || !isRank(state, action.sourceCardId, "4", "♠"))
                return fail("RANK_SOURCE", "Total Clear requires 4♠ in hand");
            const targets = Object.values(state.players).flatMap((p) => [...p.pr, ...p.er]);
            moveCard(state, action.sourceCardId, "GY");
            const destinations = {};
            for (const id of targets)
                destinations[id] = moveCard(state, id, "GY");
            events.push({ type: "TOTAL_CLEAR_RESOLVED", payload: { sourceCardId: action.sourceCardId, targetCardIds: targets, destinations } });
            break;
        }
        case "row-exchange": {
            if (action.sourceCardIds.length !== 2 || !action.sourceCardIds.every((id) => inHandOf(state, id, actorId) && isRank(state, id, "4")))
                return fail("RANK_SOURCE", "⭐4 requires two Fours in hand");
            if (!playerExists(state, action.targetPlayerId) || action.targetPlayerId === actorId)
                return fail("RANK_TARGET", "Row Exchange requires an opponent");
            removeSources(state, [...action.sourceCardIds]);
            const own = state.players[actorId];
            const other = state.players[action.targetPlayerId];
            const ownCards = [...own[action.row]];
            const otherCards = [...other[action.row]];
            own[action.row] = otherCards;
            other[action.row] = ownCards;
            const suffix = action.row === "pr" ? "PR" : "ER";
            for (const id of otherCards) {
                const value = state.cards[id];
                value.zone = `${actorId}_${suffix}`;
                value.controllerId = actorId;
                applyAegis(value, "⭐4", futureStart(state, actorId));
            }
            for (const id of ownCards) {
                const value = state.cards[id];
                value.zone = `${action.targetPlayerId}_${suffix}`;
                value.controllerId = action.targetPlayerId;
                applyAegis(value, "⭐4", futureStart(state, action.targetPlayerId));
            }
            events.push({ type: "ROW_EXCHANGE_RESOLVED", payload: { row: action.row, actorId, targetPlayerId: action.targetPlayerId, actorReceived: otherCards, opponentReceived: ownCards } });
            break;
        }
        case "recycle-five": {
            if (!inHandOf(state, action.sourceCardId, actorId) || !isRank(state, action.sourceCardId, "5"))
                return fail("RANK_SOURCE", "Recycle requires a Five in hand");
            const milled = state.zones.dp.splice(0, Math.min(2, state.zones.dp.length));
            for (const id of milled) {
                state.cards[id].zone = "VOID";
                moveCard(state, id, "GY");
            }
            if (action.rummageCardId !== undefined) {
                if (!state.zones.gy.includes(action.rummageCardId))
                    return fail("RANK_CHOICE", "Rummage card must be in GY after milling");
                moveCard(state, action.rummageCardId, `${actorId}_HAND`, actorId);
                revealUntilStart(state.cards[action.rummageCardId], futureStart(state, actorId));
            }
            let bottomDraw = null;
            if (state.zones.gy.length > 0) {
                bottomDraw = state.zones.gy[0];
                moveCard(state, bottomDraw, `${actorId}_HAND`, actorId);
            }
            moveCard(state, action.sourceCardId, "GY");
            events.push({ type: "FIVE_RECYCLE_RESOLVED", payload: { sourceCardId: action.sourceCardId, milled, rummaged: action.rummageCardId ?? null, bottomDraw } });
            break;
        }
        case "deep-draw-six-spade": {
            if (!inHandOf(state, action.sourceCardId, actorId) || !isRank(state, action.sourceCardId, "6", "♠"))
                return fail("RANK_SOURCE", "Deep Draw requires 6♠ in hand");
            if (action.discardCardIds.length < 1 || action.discardCardIds.length > 2 || action.discardCardIds.some((id) => id === action.sourceCardId || !inHandOf(state, id, actorId)))
                return fail("RANK_COST", "6♠ requires one or two other hand cards to discard");
            const maxKeep = action.discardCardIds.length === 1 ? 3 : 4;
            if (action.keepCardIds.length > maxKeep)
                return fail("RANK_CHOICE", `6♠ may keep at most ${maxKeep}`);
            for (const id of action.discardCardIds)
                moveCard(state, id, "GY");
            const drawn = state.zones.dp.splice(0, Math.min(6, state.zones.dp.length));
            for (const id of drawn)
                state.cards[id].zone = "VOID";
            const keepSet = new Set(action.keepCardIds);
            if (action.keepCardIds.some((id) => !drawn.includes(id)))
                return fail("RANK_CHOICE", "Every kept card must be among the drawn cards");
            for (const id of drawn) {
                if (keepSet.has(id))
                    moveCard(state, id, `${actorId}_HAND`, actorId);
                else
                    moveCard(state, id, "DP");
            }
            moveCard(state, action.sourceCardId, "GY");
            events.push({ type: "SIX_DEEP_DRAW_RESOLVED", payload: { sourceCardId: action.sourceCardId, discarded: action.discardCardIds, drawn, kept: action.keepCardIds } });
            break;
        }
        case "topdeck-seven": {
            if (!inHandOf(state, action.sourceCardId, actorId) || !isRank(state, action.sourceCardId, "7"))
                return fail("RANK_SOURCE", "Topdeck Casting requires a Seven in hand");
            const revealed = state.zones.dp.splice(0, Math.min(2, state.zones.dp.length));
            for (const id of revealed)
                state.cards[id].zone = "VOID";
            const chosen = [action.handCardId, action.effectCardId].filter((id) => id !== undefined);
            if (new Set(chosen).size !== chosen.length || chosen.some((id) => !revealed.includes(id)))
                return fail("RANK_CHOICE", "Seven choices must be distinct revealed cards");
            for (const id of revealed) {
                if (id === action.handCardId) {
                    moveCard(state, id, `${actorId}_HAND`, actorId);
                    revealUntilStart(state.cards[id], futureStart(state, actorId));
                }
                else if (id === action.effectCardId) {
                    moveCard(state, id, "GY", actorId);
                    state.metadata.lastGeneratedEffectCardId = id;
                }
                else
                    moveCard(state, id, "DP");
            }
            moveCard(state, action.sourceCardId, "GY");
            events.push({ type: "SEVEN_TOPDECK_RESOLVED", payload: { sourceCardId: action.sourceCardId, revealed, handCardId: action.handCardId ?? null, effectCardId: action.effectCardId ?? null } });
            break;
        }
        case "aegis-field-eight": {
            if (!inHandOf(state, action.sourceCardId, actorId) || !isRank(state, action.sourceCardId, "8"))
                return fail("RANK_SOURCE", "Aegis Field requires an Eight in hand");
            moveCard(state, action.sourceCardId, "GY");
            const affected = [];
            const failed = [];
            const expiry = futureStart(state, actorId);
            for (const id of [...state.players[actorId].pr, ...state.players[actorId].er]) {
                if (applyAegis(state.cards[id], "8-Quick", expiry))
                    affected.push(id);
                else
                    failed.push(id);
            }
            events.push({ type: "EIGHT_AEGIS_FIELD_RESOLVED", payload: { sourceCardId: action.sourceCardId, affected, failed, expiresAt: expiry } });
            break;
        }
        case "goal-shift-nine": {
            if (!inHandOf(state, action.sourceCardId, actorId) || !isRank(state, action.sourceCardId, "9"))
                return fail("RANK_SOURCE", "Goal Shift requires a Nine in hand");
            if (!playerExists(state, action.targetPlayerId) || action.targetPlayerId === actorId || ![3, 5].includes(action.delta))
                return fail("RANK_TARGET", "Goal Shift requires an opponent and +3 or +5");
            if (action.ownGoalDelta !== undefined && (!isRank(state, action.sourceCardId, "9", "♠") || action.delta !== 5 || action.ownGoalDelta !== -2))
                return fail("RANK_MODE", "Only 9♠ +5 may also reduce its controller's Goal by 2");
            state.players[action.targetPlayerId].goal += action.delta;
            let discarded = null;
            if (action.delta === 5 && action.discardCardId !== undefined && inHandOf(state, action.discardCardId, actorId) && action.discardCardId !== action.sourceCardId) {
                discarded = action.discardCardId;
                moveCard(state, discarded, "GY");
            }
            if (action.ownGoalDelta !== undefined)
                state.players[actorId].goal += action.ownGoalDelta;
            moveCard(state, action.sourceCardId, "GY");
            events.push({ type: "NINE_GOAL_SHIFT_RESOLVED", payload: { sourceCardId: action.sourceCardId, targetPlayerId: action.targetPlayerId, delta: action.delta, controllerDiscarded: discarded, ownGoalDelta: action.ownGoalDelta ?? 0 } });
            break;
        }
        case "mimic-ten-diamond": {
            if (!inHandOf(state, action.sourceCardId, actorId) || !isRank(state, action.sourceCardId, "10", "♦"))
                return fail("RANK_SOURCE", "Mimic requires 10♦ in hand");
            if (state.players[actorId].limits.rank10PlayedThisFT)
                return fail("RANK_LIMIT", "Rank-10 effect limit already used");
            if (action.pairedTwoId !== undefined && (!inHandOf(state, action.pairedTwoId, actorId) || !isRank(state, action.pairedTwoId, "2")))
                return fail("RANK_SOURCE", "Paired Mimic source must be a Two");
            const allowed = action.pairedTwoId === undefined ? ["3", "4", "5", "6", "7"] : ["A", "3", "4", "5", "6", "7", "8", "J"];
            if (!allowed.includes(action.mimickedRank))
                return fail("RANK_MODE", `10♦ cannot mimic rank ${action.mimickedRank} with this recipe`);
            state.players[actorId].limits.rank10PlayedThisFT = true;
            const ten = state.cards[action.sourceCardId];
            markExileBound(ten);
            if (action.pairedTwoId !== undefined)
                moveCard(state, action.pairedTwoId, "GY");
            moveCard(state, action.sourceCardId, "GY");
            state.metadata.lastMimic = { controllerId: actorId, mimickedRank: action.mimickedRank, effectKey: action.effectKey, paired: action.pairedTwoId ?? null };
            events.push({ type: "TEN_DIAMOND_MIMIC_RESOLVED", payload: state.metadata.lastMimic });
            break;
        }
        case "foundation-ten-club": {
            if (!inHandOf(state, action.sourceCardId, actorId) || !isRank(state, action.sourceCardId, "10", "♣"))
                return fail("RANK_SOURCE", "Foundation requires 10♣ in hand");
            const before = deriveSecuredPoints(state, actorId);
            moveCard(state, action.sourceCardId, `${actorId}_PR`, actorId);
            state.cards[action.sourceCardId].state.pointValue = 10;
            applyAegis(state.cards[action.sourceCardId], "10♣-entry", futureStart(state, actorId));
            let bonus = null;
            if (before === 0 && action.bonusScoreCardId !== undefined) {
                if (!inHandOf(state, action.bonusScoreCardId, actorId))
                    return fail("RANK_CHOICE", "Foundation bonus card must be in hand");
                bonus = action.bonusScoreCardId;
                moveCard(state, bonus, `${actorId}_PR`, actorId);
                state.cards[bonus].state.pointValue = cardPointValue(state.cards[bonus]);
            }
            events.push({ type: "TEN_CLUB_FOUNDATION_RESOLVED", payload: { sourceCardId: action.sourceCardId, preEntryPoints: before, bonusScoreCardId: bonus } });
            break;
        }
        case "stack-theft-ten-spade": {
            if (!inHandOf(state, action.sourceCardId, actorId) || !isRank(state, action.sourceCardId, "10", "♠"))
                return fail("RANK_SOURCE", "Stack Theft requires 10♠ in hand");
            if (state.players[actorId].limits.rank10PlayedThisFT)
                return fail("RANK_LIMIT", "Rank-10 effect limit already used");
            const item = state.stack.find((entry) => entry.id === action.stackItemId);
            if (!item || ["Ultra", "SuddenDeath"].includes(item.kind))
                return fail("RANK_TARGET", "Stack Theft requires an eligible pending single effect play");
            const originalControllerId = item.controllerId;
            item.controllerId = actorId;
            if (action.replacementTargetIds !== undefined)
                item.targetCardIds = [...action.replacementTargetIds];
            state.players[actorId].limits.rank10PlayedThisFT = true;
            state.players[actorId].limits.pendingFullTurnSkips += 1;
            state.players[originalControllerId].limits.pendingFullTurnSkips += 1;
            const ten = state.cards[action.sourceCardId];
            markExileBound(ten);
            moveCard(state, action.sourceCardId, "GY");
            events.push({ type: "TEN_SPADE_STACK_THEFT_RESOLVED", payload: { sourceCardId: action.sourceCardId, stackItemId: item.id, originalControllerId, controllerId: actorId, targetCardIds: item.targetCardIds } });
            break;
        }
        case "attach-jack": {
            if (!inHandOf(state, action.sourceCardId, actorId) || !isRank(state, action.sourceCardId, "J"))
                return fail("RANK_SOURCE", "Jack Attachment requires a Jack in hand");
            const target = card(state, action.targetCardId);
            const correctRow = action.row === "pr" ? target?.zone.endsWith("_PR") : target?.zone.endsWith("_ER");
            if (!target || !correctRow || target.controllerId === actorId || hasAegis(target))
                return fail("RANK_TARGET", "Jack requires an unprotected enemy target in the declared row");
            const oldController = target.controllerId;
            moveCard(state, action.sourceCardId, `${actorId}_ER`, actorId);
            const jack = state.cards[action.sourceCardId];
            jack.state.attachmentHostId = target.id;
            target.state.attachedJackId = jack.id;
            target.state.jackPointBonus = action.row === "pr" ? 1 : 0;
            target.controllerId = actorId;
            moveCard(state, target.id, `${actorId}_${action.row === "pr" ? "PR" : "ER"}`, actorId);
            events.push({ type: "JACK_ATTACHED", payload: { jackCardId: jack.id, hostCardId: target.id, row: action.row, oldController, controllerId: actorId } });
            break;
        }
        case "queen-anchor": {
            if (!inHandOf(state, action.sourceCardId, actorId) || !isRank(state, action.sourceCardId, "Q"))
                return fail("RANK_SOURCE", "Queen Anchor requires a Queen in hand");
            moveCard(state, action.sourceCardId, `${actorId}_ER`, actorId);
            const expiry = futureStart(state, actorId);
            applyAegis(state.cards[action.sourceCardId], "Queen-entry", expiry);
            events.push({ type: "QUEEN_ANCHOR_ENTERED", payload: { sourceCardId: action.sourceCardId, controllerId: actorId, aegisExpiresAt: expiry } });
            break;
        }
        case "royal-marriage": {
            if (!inHandOf(state, action.kingCardId, actorId) || !inHandOf(state, action.queenCardId, actorId) || !isRank(state, action.kingCardId, "K") || !isRank(state, action.queenCardId, "Q"))
                return fail("RANK_SOURCE", "Royal Marriage requires a King and Queen in hand");
            const king = parseIdentity(state.cards[action.kingCardId].identity);
            const queen = parseIdentity(state.cards[action.queenCardId].identity);
            if (king.suit !== queen.suit)
                return fail("RANK_RECIPE", "Royal Marriage requires matching suits");
            moveCard(state, action.kingCardId, `${actorId}_ER`, actorId);
            moveCard(state, action.queenCardId, `${actorId}_ER`, actorId);
            applyAegis(state.cards[action.queenCardId], "Royal-Marriage-entry", futureStart(state, actorId));
            state.metadata.lastPlayClass = "RoyalMarriage";
            events.push({ type: "ROYAL_MARRIAGE_RESOLVED", payload: { kingCardId: action.kingCardId, queenCardId: action.queenCardId, suit: king.suit, playClass: "RoyalMarriage", isCombo: false } });
            break;
        }
        case "red-joker-self-reset": {
            if (!inHandOf(state, action.sourceCardId, actorId) || !isRank(state, action.sourceCardId, "RJ"))
                return fail("RANK_SOURCE", "Self Reset requires Red Joker in hand");
            const other = state.players[actorId].hand.filter((id) => id !== action.sourceCardId);
            for (const id of other)
                moveCard(state, id, "GY");
            moveCard(state, action.sourceCardId, "GY");
            const drawCount = other.length + 3;
            const drawn = state.zones.dp.splice(0, Math.min(drawCount, state.zones.dp.length));
            for (const id of drawn) {
                state.cards[id].zone = "VOID";
                moveCard(state, id, `${actorId}_HAND`, actorId);
            }
            events.push({ type: "RED_JOKER_SELF_RESET_RESOLVED", payload: { sourceCardId: action.sourceCardId, discarded: other, requestedDrawCount: drawCount, drawn } });
            break;
        }
        case "black-joker-board-lock": {
            if (!inHandOf(state, action.sourceCardId, actorId) || !isRank(state, action.sourceCardId, "BJ"))
                return fail("RANK_SOURCE", "Board Lock requires Black Joker in hand");
            moveCard(state, action.sourceCardId, "GY");
            state.metadata.boardLock = { turnsRemaining: 2, activationFullTurnId: state.fullTurnSequence, activatorId: actorId };
            events.push({ type: "BLACK_JOKER_BOARD_LOCK_RESOLVED", payload: state.metadata.boardLock });
            break;
        }
        case "ordinary-scuttle": {
            if (!inHandOf(state, action.sourceCardId, actorId))
                return fail("SCUTTLE_SOURCE", "Scuttle source must be controlled in hand");
            const source = state.cards[action.sourceCardId];
            const target = enemyPrTarget(state, actorId, action.targetCardId);
            if (!target)
                return fail("SCUTTLE_TARGET", "Ordinary Scuttle requires an enemy PR target");
            if (hasAegis(target))
                return fail("AEGIS_BLOCK", "Aegis blocks Scuttle");
            if (hasOrdinaryScuttleImmunity(target))
                return fail("SCUTTLE_IMMUNITY", `${target.identity} has ordinary Scuttle immunity`);
            if (compareScuttle(source, target) <= 0)
                return fail("SCUTTLE_RANK", "Scuttle source must have higher rank or equal rank with higher suit");
            moveCard(state, target.id, "GY");
            moveCard(state, source.id, "GY");
            events.push({ type: "ORDINARY_SCUTTLE_RESOLVED", payload: { sourceCardId: source.id, targetCardId: target.id } });
            break;
        }
        case "absolute-scuttle": {
            if (action.sourceCardIds.length !== 2 || !action.sourceCardIds.every((id) => inHandOf(state, id, actorId) && isRank(state, id, "8")))
                return fail("SCUTTLE_SOURCE", "⭐8 requires two Eights in hand");
            const target = enemyPrTarget(state, actorId, action.targetCardId);
            if (!target)
                return fail("SCUTTLE_TARGET", "⭐8 requires an enemy PR target");
            if (hasAegis(target))
                return fail("AEGIS_BLOCK", "Aegis blocks ⭐8");
            const ignoredOrdinaryImmunity = hasOrdinaryScuttleImmunity(target);
            moveCard(state, target.id, "GY");
            removeSources(state, [...action.sourceCardIds]);
            events.push({ type: "ABSOLUTE_SCUTTLE_RESOLVED", payload: { sourceCardIds: action.sourceCardIds, targetCardId: target.id, ignoredOrdinaryImmunity } });
            break;
        }
    }
    return { ok: true, state, events };
}
//# sourceMappingURL=ranks.js.map