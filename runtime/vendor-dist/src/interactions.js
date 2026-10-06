import { canonicalClone } from "./canonical-json.js";
import { hasAegis } from "./lifecycle.js";
import { compareScuttle, hasOrdinaryScuttleImmunity, parseIdentity, rankDefinition } from "./ranks.js";
import { moveCard } from "./state.js";
function fail(code, message, details) {
    return details === undefined ? { ok: false, code, message } : { ok: false, code, message, details };
}
function isOtt(card) { return card.zone.endsWith("_PR") || card.zone.endsWith("_ER"); }
function isQueen(card) { return parseIdentity(card.identity)?.rank === "Q"; }
function isUntapped(card) { return card.state.tapped !== true; }
function isEffectTargetImmune(card) { return card.zone.endsWith("_PR") && rankDefinition(card).prEffectTargetImmune === true; }
function isQSpade(card) { const p = parseIdentity(card.identity); return p?.rank === "Q" && p.suit === "♠"; }
function bypassed(profile, protection) { return profile.bypasses.includes(protection); }
export function guardProviderIds(state, target) {
    const player = state.players[target.controllerId];
    if (!player)
        return [];
    return player.er.filter((id) => {
        const provider = state.cards[id];
        return provider !== undefined && provider.id !== target.id && provider.controllerId === target.controllerId && isQueen(provider) && isUntapped(provider);
    });
}
export function evaluateProtection(state, actorId, targetCardId, profile) {
    const target = state.cards[targetCardId];
    if (!target || !isOtt(target))
        return { legal: false, blockedBy: [], guardProviderIds: [] };
    const blockedBy = [];
    const providers = guardProviderIds(state, target);
    const hostile = profile.hostile && actorId !== target.controllerId;
    if (hasAegis(target) && !bypassed(profile, "aegis"))
        blockedBy.push("aegis");
    if (profile.channel === "effect" && profile.shape === "single-target" && hostile && providers.length > 0 && !bypassed(profile, "guard"))
        blockedBy.push("guard");
    if (profile.channel === "effect" && profile.shape !== "structural" && isEffectTargetImmune(target) && !bypassed(profile, "rank-effect-immunity"))
        blockedBy.push("rank-effect-immunity");
    if (profile.operation === "clear" && profile.shape === "multi-target" && isQSpade(target) && profile.totalClear !== true && !bypassed(profile, "q-spade-clear-immunity"))
        blockedBy.push("q-spade-clear-immunity");
    if (profile.operation === "scuttle" && hasOrdinaryScuttleImmunity(target) && !bypassed(profile, "scuttle-immunity"))
        blockedBy.push("scuttle-immunity");
    return { legal: blockedBy.length === 0, blockedBy, guardProviderIds: providers };
}
function untappedQueenCount(state, playerId) {
    const player = state.players[playerId];
    if (!player)
        return 0;
    return player.er.filter((id) => {
        const card = state.cards[id];
        return card !== undefined && card.controllerId === playerId && isQueen(card) && isUntapped(card);
    }).length;
}
export function evaluateCounterAuthority(state, actorId, authority, target) {
    const item = state.stack.find((entry) => entry.id === target.stackItemId);
    if (!item)
        return { legal: false, reason: "stack-item-missing", blockedByRoyalShield: false, blockedByTwoQueenDefense: false };
    const targetClass = target.class;
    const defendingQueens = untappedQueenCount(state, item.controllerId);
    let classAllowed = false;
    switch (authority) {
        case "base-ace":
        case "anchor-ace":
            classAllowed = ["ordinary-effect", "counter", "single-anchor", "single-goal", "multi-play", "royal-marriage"].includes(targetClass);
            break;
        case "ace-spade":
            classAllowed = !["ace-spade", "ultra", "sudden-death", "scuttle", "triggered-ability"].includes(targetClass);
            break;
        case "super-ace":
            classAllowed = targetClass !== "scuttle";
            break;
        case "king":
            classAllowed = targetClass === "single-anchor" || targetClass === "single-goal";
            break;
        case "king-spade":
            classAllowed = targetClass === "multi-play" || targetClass === "royal-marriage";
            break;
        case "eight-scuttle":
            classAllowed = targetClass === "scuttle";
            break;
    }
    if (!classAllowed)
        return { legal: false, reason: "counter-class-not-authorized", blockedByRoyalShield: false, blockedByTwoQueenDefense: false };
    const shieldBlocked = target.royalShieldProtected && (authority === "base-ace" || authority === "anchor-ace");
    if (shieldBlocked)
        return { legal: false, reason: "royal-shield", blockedByRoyalShield: true, blockedByTwoQueenDefense: false };
    const twoQueenBlocked = authority === "super-ace" && defendingQueens >= 2;
    if (twoQueenBlocked)
        return { legal: false, reason: "two-queen-defense", blockedByRoyalShield: false, blockedByTwoQueenDefense: true };
    return { legal: true, reason: null, blockedByRoyalShield: false, blockedByTwoQueenDefense: false };
}
function sourceInHand(state, cardId, actorId) {
    const card = state.cards[cardId];
    return card && card.controllerId === actorId && card.zone === `${actorId}_HAND` ? card : null;
}
function validateCounterSources(state, actorId, authority, sourceIds) {
    if (authority === "anchor-ace") {
        return sourceIds.length === 1 && state.cards[sourceIds[0]]?.controllerId === actorId && state.cards[sourceIds[0]].zone === `${actorId}_ER` && parseIdentity(state.cards[sourceIds[0]].identity)?.rank === "A";
    }
    const cards = sourceIds.map((id) => sourceInHand(state, id, actorId));
    if (cards.some((entry) => entry === null))
        return false;
    if (authority === "super-ace")
        return cards.length === 2 && cards.every((entry) => parseIdentity(entry.identity)?.rank === "A");
    if (sourceIds.length !== 1)
        return false;
    const parsed = parseIdentity(cards[0].identity);
    if (authority === "base-ace")
        return parsed?.rank === "A" && parsed.suit !== "♠";
    if (authority === "ace-spade")
        return parsed?.rank === "A" && parsed.suit === "♠";
    if (authority === "king")
        return parsed?.rank === "K" && parsed.suit !== "♠";
    if (authority === "king-spade")
        return parsed?.rank === "K" && parsed.suit === "♠";
    return authority === "eight-scuttle" && parsed?.rank === "8";
}
function attachmentState(card) {
    const value = card.state.attachmentGraph;
    if (typeof value !== "object" || value === null)
        return null;
    const maybe = value;
    return (maybe.kind === "jack-pr" || maybe.kind === "jack-er") && typeof maybe.hostCardId === "string" && typeof maybe.originalHostZone === "string" && typeof maybe.originalHostControllerId === "string" && typeof maybe.pointBonus === "number" ? maybe : null;
}
export function revalidateAttachments(state, context = {}) {
    const events = [];
    const jacks = Object.values(state.cards).filter((card) => attachmentState(card) !== null).sort((a, b) => a.id.localeCompare(b.id));
    for (const jack of jacks) {
        const link = attachmentState(jack);
        const host = state.cards[link.hostCardId];
        const expectedSuffix = link.kind === "jack-pr" ? "_PR" : "_ER";
        const valid = host !== undefined
            && jack.zone.endsWith("_ER")
            && host.zone.endsWith(expectedSuffix)
            && jack.controllerId === host.controllerId
            && host.state.attachedByJackId === jack.id;
        if (valid)
            continue;
        delete jack.state.attachmentGraph;
        if (jack.zone !== "GY" && jack.zone !== "EXILE")
            moveCard(state, jack.id, "GY");
        if (host) {
            delete host.state.attachedByJackId;
            delete host.state.jackPointBonus;
            const hostStillOtt = host.zone.endsWith("_PR") || host.zone.endsWith("_ER");
            const preserveDestination = context.preserveHostDestinationIds?.has(host.id) === true;
            const preserveController = context.preserveHostControllerIds?.has(host.id) === true;
            if (hostStillOtt && !preserveDestination && !preserveController) {
                const suffix = link.kind === "jack-pr" ? "PR" : "ER";
                moveCard(state, host.id, `${host.originalOwnerId}_${suffix}`, host.originalOwnerId);
            }
        }
        events.push({ type: "ATTACHMENT_SEVERED", payload: { jackCardId: jack.id, hostCardId: link.hostCardId, reason: "relationship-invalid", hostDestinationPreserved: context.preserveHostDestinationIds?.has(link.hostCardId) === true, hostControllerPreserved: context.preserveHostControllerIds?.has(link.hostCardId) === true } });
    }
    return events;
}
function isEligibleAnchor(card) {
    const rank = parseIdentity(card.identity)?.rank;
    return card.zone.endsWith("_ER") && ["A", "9", "Q", "K"].includes(rank ?? "");
}
function resolveScuttle(state, actorId, sourceIds, targetId, profile) {
    const target = state.cards[targetId];
    if (!target || !target.zone.endsWith("_PR") || target.controllerId === actorId)
        return fail("SCUTTLE_TARGET", "Scuttle requires an enemy PR target");
    const sources = sourceIds.map((id) => sourceInHand(state, id, actorId));
    if (sources.some((entry) => entry === null))
        return fail("SCUTTLE_SOURCE", "Every Scuttle source must be controlled in hand");
    if (profile === "ordinary" && sources.length !== 1)
        return fail("SCUTTLE_SOURCE", "Ordinary Scuttle requires one source");
    if (profile === "free-eight-spade" && (sources.length !== 1 || parseIdentity(sources[0].identity)?.rank !== "8" || parseIdentity(sources[0].identity)?.suit !== "♠"))
        return fail("SCUTTLE_SOURCE", "Free Scuttle requires 8♠");
    if (profile === "absolute-eight" && (sources.length !== 2 || !sources.every((entry) => parseIdentity(entry.identity)?.rank === "8")))
        return fail("SCUTTLE_SOURCE", "Absolute Scuttle requires two Eights");
    const bypasses = profile === "absolute-eight" ? ["scuttle-immunity"] : [];
    const protection = evaluateProtection(state, actorId, targetId, { channel: "action", shape: "single-target", hostile: true, operation: "scuttle", bypasses });
    if (!protection.legal)
        return fail(protection.blockedBy[0] === "aegis" ? "AEGIS_BLOCK" : "SCUTTLE_IMMUNITY", `Scuttle blocked by ${protection.blockedBy.join(", ")}`, protection);
    if (profile === "ordinary" && compareScuttle(sources[0], target) <= 0)
        return fail("SCUTTLE_RANK", "Source must outrank target by rank or suit");
    for (const source of sources)
        moveCard(state, source.id, "GY");
    moveCard(state, target.id, "GY");
    const attachmentEvents = revalidateAttachments(state, { preserveHostDestinationIds: new Set([target.id]) });
    return { ok: true, state, events: [{ type: "SCUTTLE_RESOLVED", payload: { profile, sourceCardIds: sourceIds, targetCardId: target.id, bypasses } }, ...attachmentEvents] };
}
export function resolveInteractionAction(input, actorId, action) {
    if (!input.players[actorId])
        return fail("PLAYER_UNKNOWN", `Unknown actor ${actorId}`);
    const state = canonicalClone(input);
    const events = [];
    switch (action.kind) {
        case "attempt-interaction": {
            const target = state.cards[action.targetCardId];
            if (!target)
                return fail("TARGET_UNKNOWN", `Unknown target ${action.targetCardId}`);
            const evaluation = evaluateProtection(state, actorId, action.targetCardId, action.profile);
            if (!evaluation.legal)
                return fail("PROTECTION_BLOCK", `Interaction blocked by ${evaluation.blockedBy.join(", ")}`, evaluation);
            const from = target.zone;
            const actualDestination = moveCard(state, target.id, action.destination, action.controllerId);
            events.push({ type: "INTERACTION_RESOLVED", payload: { targetCardId: target.id, from, requestedDestination: action.destination, actualDestination, profile: action.profile, evaluation } });
            events.push(...revalidateAttachments(state, { preserveHostDestinationIds: new Set([target.id]), preserveHostControllerIds: action.controllerId === undefined ? new Set() : new Set([target.id]) }));
            break;
        }
        case "counter-stack": {
            if (!validateCounterSources(state, actorId, action.authority, action.sourceCardIds))
                return fail("COUNTER_SOURCE", `Invalid source recipe for ${action.authority}`);
            const evaluation = evaluateCounterAuthority(state, actorId, action.authority, action.target);
            if (!evaluation.legal)
                return fail("COUNTER_AUTHORITY", evaluation.reason ?? "Counter not authorized", evaluation);
            const index = state.stack.findIndex((entry) => entry.id === action.target.stackItemId);
            if (index < 0)
                return fail("COUNTER_TARGET", "Pending stack item missing");
            const item = state.stack[index];
            state.stack.splice(index, 1);
            const destination = action.authority === "ace-spade" ? "EXILE" : item.sourceDestination;
            for (const id of item.sourceCardIds)
                if (state.cards[id]?.zone === "ON_STACK")
                    moveCard(state, id, destination);
            for (const id of action.sourceCardIds)
                moveCard(state, id, "GY");
            events.push({ type: "COUNTER_RESOLVED", payload: { authority: action.authority, sourceCardIds: action.sourceCardIds, targetStackItemId: item.id, targetClass: action.target.class, targetDestination: destination, evaluation } });
            break;
        }
        case "scuttle":
            return resolveScuttle(state, actorId, action.sourceCardIds, action.targetCardId, action.profile);
        case "attach-jack-graph": {
            const jack = sourceInHand(state, action.sourceCardId, actorId);
            const target = state.cards[action.targetCardId];
            if (!jack || parseIdentity(jack.identity)?.rank !== "J")
                return fail("ATTACHMENT_SOURCE", "Jack source must be controlled in hand");
            if (!target || target.controllerId === actorId || (action.row === "pr" ? !target.zone.endsWith("_PR") : !isEligibleAnchor(target)))
                return fail("ATTACHMENT_TARGET", "Jack requires an eligible enemy host in the declared row");
            const evaluation = evaluateProtection(state, actorId, target.id, { channel: "effect", shape: "single-target", hostile: true, operation: "attachment", bypasses: [] });
            if (!evaluation.legal)
                return fail("PROTECTION_BLOCK", `Attachment blocked by ${evaluation.blockedBy.join(", ")}`, evaluation);
            const originalHostZone = target.zone;
            const originalHostControllerId = target.controllerId;
            moveCard(state, jack.id, `${actorId}_ER`, actorId);
            moveCard(state, target.id, `${actorId}_${action.row === "pr" ? "PR" : "ER"}`, actorId);
            const link = { kind: action.row === "pr" ? "jack-pr" : "jack-er", hostCardId: target.id, originalHostZone, originalHostControllerId, pointBonus: action.row === "pr" ? 1 : 0 };
            jack.state.attachmentGraph = link;
            target.state.attachedByJackId = jack.id;
            if (link.pointBonus > 0)
                target.state.jackPointBonus = link.pointBonus;
            events.push({ type: "ATTACHMENT_CREATED", payload: { jackCardId: jack.id, hostCardId: target.id, link } });
            break;
        }
        case "move-and-revalidate": {
            const target = state.cards[action.cardId];
            if (!target)
                return fail("CARD_UNKNOWN", `Unknown card ${action.cardId}`);
            const from = target.zone;
            const actualDestination = moveCard(state, target.id, action.destination, action.controllerId);
            events.push({ type: "CARD_MOVED_WITH_ATTACHMENT_REVALIDATION", payload: { cardId: target.id, from, requestedDestination: action.destination, actualDestination } });
            events.push(...revalidateAttachments(state, { preserveHostDestinationIds: new Set([target.id]), preserveHostControllerIds: action.controllerId === undefined ? new Set() : new Set([target.id]) }));
            break;
        }
        case "change-controller-and-revalidate": {
            const target = state.cards[action.cardId];
            if (!target || !state.players[action.controllerId])
                return fail("CONTROLLER_CHANGE", "Card or controller missing");
            const previousControllerId = target.controllerId;
            const previousZone = target.zone;
            const rowSuffix = target.zone.endsWith("_PR") ? "PR" : target.zone.endsWith("_ER") ? "ER" : null;
            if (rowSuffix !== null)
                moveCard(state, target.id, `${action.controllerId}_${rowSuffix}`, action.controllerId);
            else
                target.controllerId = action.controllerId;
            events.push({ type: "CONTROLLER_CHANGED_WITH_ATTACHMENT_REVALIDATION", payload: { cardId: target.id, previousControllerId, controllerId: action.controllerId, previousZone, zone: target.zone } });
            events.push(...revalidateAttachments(state, { preserveHostControllerIds: new Set([target.id]), preserveHostDestinationIds: new Set([target.id]) }));
            break;
        }
        case "revalidate-attachments":
            events.push(...revalidateAttachments(state));
            break;
    }
    return { ok: true, state, events };
}
//# sourceMappingURL=interactions.js.map