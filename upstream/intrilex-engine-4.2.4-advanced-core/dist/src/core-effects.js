import { canonicalClone } from "./canonical-json.js";
import { applyAegis, hasAegis } from "./lifecycle.js";
import { evaluateProtection, revalidateAttachments } from "./interactions.js";
import { nextIndex } from "./rng.js";
import { moveCard } from "./state.js";
import { parseIdentity } from "./ranks.js";
export const CORE_EFFECT_DECLARATION_PROFILE = Object.freeze({
    id: "core-effect-declaration-authority",
    displayName: "Core Effect Declaration Authority — Public Single-Card Effects",
    rulesVersion: "4.1",
    engineVersion: "4.2.1",
    playerCount: 2,
    enabledModules: [],
    supportedEffects: ["A-purge", "A-anchor", "3-bounce", "4-row-clear", "4-spade-total-clear", "J-attachment", "Q-anchor", "K-anchor", "RJ-four-modes", "BJ-board-lock"],
    excludedSystems: ["private-choice-effects", "quick-timing", "instant-timing", "response-windows", "supers", "rank10", "voltage", "ultras", "royal-marriage", "optional-modules", "multiplayer"],
    rationale: "Engine-owned public single-card declaration slice. Every target and mode is enumerated and resolved by the engine; hidden-choice and response families fail closed."
});
const fail = (code, message, details) => details === undefined ? { ok: false, code, message } : { ok: false, code, message, details };
const rank = (state, id) => parseIdentity(state.cards[id]?.identity ?? "")?.rank;
const suit = (state, id) => parseIdentity(state.cards[id]?.identity ?? "")?.suit;
const inHand = (state, id, actor) => state.cards[id]?.zone === `${actor}_HAND` && state.cards[id]?.controllerId === actor;
const isAnchor = (state, id) => { const c = state.cards[id]; const r = c ? rank(state, id) : undefined; return !!c && c.zone.endsWith("_ER") && (["A", "9", "Q", "K"].includes(r ?? "") || typeof c.state.anchorValue === "number"); };
function clearReveal(state, id) { delete state.cards[id]?.state.revealedUntil; }
function shuffle(state, ids) { for (let i = ids.length - 1; i > 0; i--) {
    const j = nextIndex(state.rng, i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
} }
function draw(state, playerId, count) { const out = []; for (let i = 0; i < count && state.zones.dp.length; i++) {
    const id = state.zones.dp[0];
    moveCard(state, id, `${playerId}_HAND`, playerId);
    out.push(id);
} return out; }
function profileActive(state) { const profileId = state.metadata.coreAuthority?.profileId; return profileId === CORE_EFFECT_DECLARATION_PROFILE.id || profileId === "core-response-authority" || profileId === "core-private-choice-authority" || profileId === "core-advanced-authority"; }
function privateChoiceProfile(state) { const profileId = state.metadata.coreAuthority?.profileId; return profileId === "core-private-choice-authority" || profileId === "core-advanced-authority"; }
export function enumerateCoreEffectCandidates(state, actorId) {
    if (!profileActive(state))
        return [];
    const s = state, out = [];
    const actor = s.players[actorId];
    if (!actor)
        return out;
    const opponents = s.turnOrder.filter(id => id !== actorId);
    const aegised = Object.values(s.cards).filter(c => hasAegis(c));
    for (const sourceCardId of actor.hand) {
        const r = rank(s, sourceCardId), su = suit(s, sourceCardId);
        if (r === "A") {
            if (aegised.length)
                for (const t of aegised)
                    out.push({ family: "effect-ace", mode: "purge-aegis", sourceCardIds: [sourceCardId], targetCardIds: [t.id], effect: { kind: "ace-purge", sourceCardId, targetCardId: t.id, mode: "scrap-aegis" }, featureVector: { disruption: true } });
            else
                for (const oid of opponents)
                    for (const t of s.players[oid].er.filter(id => isAnchor(s, id)))
                        out.push({ family: "effect-ace", mode: "purge-anchor-bounce", sourceCardIds: [sourceCardId], targetCardIds: [t], effect: { kind: "ace-purge", sourceCardId, targetCardId: t, mode: "bounce-anchor" }, featureVector: { disruption: true } });
            out.push({ family: "anchor", mode: "ace", sourceCardIds: [sourceCardId], targetCardIds: [], effect: { kind: "ace-anchor", sourceCardId }, featureVector: { anchor: true } });
        }
        if (r === "3") {
            for (const p of Object.values(s.players))
                for (const t of [...p.pr, ...p.er])
                    out.push({ family: "effect-three", mode: "bounce-top", sourceCardIds: [sourceCardId], targetCardIds: [t], effect: { kind: "three-bounce", sourceCardId, targetCardId: t }, featureVector: { disruption: p.id !== actorId } });
            if (privateChoiceProfile(s))
                for (const oid of opponents) {
                    out.push({ family: "effect-private-choice", mode: "three-present-take", sourceCardIds: [sourceCardId], targetCardIds: [], effect: { kind: "three-hand-raid", sourceCardId, targetPlayerId: oid, mode: "present-take" }, featureVector: { privateChoice: true, disruption: true } });
                    out.push({ family: "effect-private-choice", mode: "three-force-discard", sourceCardIds: [sourceCardId], targetCardIds: [], effect: { kind: "three-hand-raid", sourceCardId, targetPlayerId: oid, mode: "force-discard" }, featureVector: { privateChoice: true, disruption: true } });
                }
        }
        if (r === "4") {
            for (const oid of opponents)
                for (const row of ["pr", "er"])
                    out.push({ family: "effect-four", mode: `clear-${row}`, sourceCardIds: [sourceCardId], targetCardIds: [], effect: { kind: "four-row-clear", sourceCardId, targetPlayerId: oid, row }, featureVector: { disruption: true } });
            if (su === "♠")
                out.push({ family: "effect-four", mode: "total-clear", sourceCardIds: [sourceCardId], targetCardIds: [], effect: { kind: "four-total-clear", sourceCardId }, featureVector: { structural: true } });
        }
        if (privateChoiceProfile(s) && r === "5")
            out.push({ family: "effect-private-choice", mode: "five-recycle", sourceCardIds: [sourceCardId], targetCardIds: [], effect: { kind: "five-recycle", sourceCardId }, featureVector: { privateChoice: true, millCount: Math.min(2, s.zones.dp.length) } });
        if (privateChoiceProfile(s) && r === "6")
            out.push({ family: "effect-private-choice", mode: "six-dig", sourceCardIds: [sourceCardId], targetCardIds: [], effect: { kind: "six-dig", sourceCardId }, featureVector: { privateChoice: true, drawCount: Math.min(3, s.zones.dp.length) } });
        if (privateChoiceProfile(s) && r === "7")
            out.push({ family: "effect-private-choice", mode: "seven-topdeck", sourceCardIds: [sourceCardId], targetCardIds: [], effect: { kind: "seven-topdeck", sourceCardId }, featureVector: { privateChoice: true, revealCount: Math.min(2, s.zones.dp.length) } });
        if (r === "J")
            for (const oid of opponents) {
                for (const t of s.players[oid].pr.filter(id => !s.cards[id].state.attachedByJackId))
                    out.push({ family: "attachment", mode: "jack-pr", sourceCardIds: [sourceCardId], targetCardIds: [t], effect: { kind: "jack-attach", sourceCardId, targetCardId: t, row: "pr" }, featureVector: { controlChange: true } });
                if (su === "♠")
                    for (const t of s.players[oid].er.filter(id => isAnchor(s, id) && !s.cards[id].state.attachedByJackId))
                        out.push({ family: "attachment", mode: "jack-er", sourceCardIds: [sourceCardId], targetCardIds: [t], effect: { kind: "jack-attach", sourceCardId, targetCardId: t, row: "er" }, featureVector: { controlChange: true } });
            }
        if (r === "Q")
            out.push({ family: "anchor", mode: "queen", sourceCardIds: [sourceCardId], targetCardIds: [], effect: { kind: "queen-anchor", sourceCardId }, featureVector: { guard: true } });
        if (r === "K")
            out.push({ family: "anchor", mode: "king", sourceCardIds: [sourceCardId], targetCardIds: [], effect: { kind: "king-anchor", sourceCardId }, featureVector: { anchorValue: su === "♠" ? 9 : 7 } });
        if (privateChoiceProfile(s) && r === "9")
            for (const oid of opponents)
                out.push({ family: "anchor-private-choice", mode: "nine", sourceCardIds: [sourceCardId], targetCardIds: [], effect: { kind: "nine-anchor", sourceCardId, targetPlayerId: oid }, featureVector: { privateChoice: true, anchorValue: 0, disruption: true } });
        if (r === "RJ") {
            out.push({ family: "effect-red-joker", mode: "self-reset", sourceCardIds: [sourceCardId], targetCardIds: [], effect: { kind: "red-joker", sourceCardId, mode: "self-reset" }, featureVector: { handDelta: 3 } });
            out.push({ family: "effect-red-joker", mode: "shuffle-reset", sourceCardIds: [sourceCardId], targetCardIds: [], effect: { kind: "red-joker", sourceCardId, mode: "shuffle-reset" }, featureVector: { recycle: s.zones.gy.length } });
            for (const oid of opponents) {
                out.push({ family: "effect-red-joker", mode: "hand-swap", sourceCardIds: [sourceCardId], targetCardIds: [], effect: { kind: "red-joker", sourceCardId, mode: "hand-swap", targetPlayerId: oid }, featureVector: { disruption: true } });
                out.push({ family: "effect-red-joker", mode: "opponent-attack", sourceCardIds: [sourceCardId], targetCardIds: [], effect: { kind: "red-joker", sourceCardId, mode: "opponent-attack", targetPlayerId: oid }, featureVector: { disruption: true } });
            }
        }
        if (r === "BJ")
            out.push({ family: "effect-board-lock", mode: "black-joker", sourceCardIds: [sourceCardId], targetCardIds: [], effect: { kind: "black-joker-board-lock", sourceCardId }, featureVector: { turnsRemaining: 2 } });
    }
    return out;
}
export function resolveCoreEffect(input, actorId, effect) {
    if (!profileActive(input))
        return fail("CORE_EFFECT_PROFILE", "Core Effect Declaration Authority profile is not active");
    const state = canonicalClone(input), events = [];
    const sourceId = effect.sourceCardId;
    if (!inHand(state, sourceId, actorId))
        return fail("CORE_EFFECT_SOURCE", "Effect source must be controlled in hand");
    const r = rank(state, sourceId), su = suit(state, sourceId);
    switch (effect.kind) {
        case "ace-purge": {
            if (r !== "A")
                return fail("CORE_EFFECT_SOURCE", "Purge requires Ace");
            const target = state.cards[effect.targetCardId];
            if (!target)
                return fail("CORE_EFFECT_TARGET", "Unknown Purge target");
            if (effect.mode === "scrap-aegis") {
                if (!hasAegis(target))
                    return fail("CORE_EFFECT_TARGET", "Purge scrap requires Aegis");
                moveCard(state, target.id, "GY");
            }
            else {
                if (Object.values(state.cards).some(hasAegis))
                    return fail("CORE_EFFECT_MODE", "Anchor bounce is unavailable while any Aegis exists");
                if (target.controllerId === actorId || !isAnchor(state, target.id))
                    return fail("CORE_EFFECT_TARGET", "Purge bounce requires enemy Anchor");
                const ev = evaluateProtection(state, actorId, target.id, { channel: "effect", shape: "single-target", hostile: true, operation: "bounce", bypasses: [] });
                if (!ev.legal)
                    return fail("PROTECTION_BLOCK", `Purge blocked by ${ev.blockedBy.join(", ")}`, ev);
                moveCard(state, target.id, `${target.originalOwnerId}_HAND`, target.originalOwnerId);
            }
            moveCard(state, sourceId, "GY");
            events.push({ type: "CORE_ACE_PURGE_RESOLVED", payload: { sourceCardId: sourceId, targetCardId: target.id, mode: effect.mode } });
            events.push(...revalidateAttachments(state));
            break;
        }
        case "ace-anchor":
            if (r !== "A")
                return fail("CORE_EFFECT_SOURCE", "Ace Anchor requires Ace");
            moveCard(state, sourceId, `${actorId}_ER`, actorId);
            state.cards[sourceId].state.playedForEffect = true;
            state.cards[sourceId].state.anchorValue = 0;
            events.push({ type: "CORE_ACE_ANCHOR_ENTERED", payload: { sourceCardId: sourceId } });
            break;
        case "three-bounce": {
            if (r !== "3")
                return fail("CORE_EFFECT_SOURCE", "Bounce requires Three");
            const target = state.cards[effect.targetCardId];
            if (!target || (!target.zone.endsWith("_PR") && !target.zone.endsWith("_ER")))
                return fail("CORE_EFFECT_TARGET", "Bounce requires OTT target");
            const ev = evaluateProtection(state, actorId, target.id, { channel: "effect", shape: "single-target", hostile: target.controllerId !== actorId, operation: "bounce", bypasses: [] });
            if (!ev.legal)
                return fail("PROTECTION_BLOCK", `Bounce blocked by ${ev.blockedBy.join(", ")}`, ev);
            moveCard(state, target.id, "DP");
            state.zones.dp.splice(state.zones.dp.indexOf(target.id), 1);
            state.zones.dp.unshift(target.id);
            moveCard(state, sourceId, "GY");
            events.push({ type: "CORE_THREE_BOUNCE_RESOLVED", payload: { sourceCardId: sourceId, targetCardId: target.id, destination: "DP_TOP" } });
            events.push(...revalidateAttachments(state, { preserveHostDestinationIds: new Set([target.id]) }));
            break;
        }
        case "four-row-clear": {
            if (r !== "4")
                return fail("CORE_EFFECT_SOURCE", "Row Clear requires Four");
            const p = state.players[effect.targetPlayerId];
            if (!p || effect.targetPlayerId === actorId)
                return fail("CORE_EFFECT_TARGET", "Row Clear requires opponent");
            const ids = [...(effect.row === "pr" ? p.pr : p.er)];
            const affected = ids.filter(id => evaluateProtection(state, actorId, id, { channel: "effect", shape: "multi-target", hostile: true, operation: "clear", bypasses: [] }).legal);
            moveCard(state, sourceId, "GY");
            for (const id of affected)
                moveCard(state, id, "GY");
            events.push({ type: "CORE_FOUR_ROW_CLEAR_RESOLVED", payload: { sourceCardId: sourceId, targetPlayerId: effect.targetPlayerId, row: effect.row, affectedCardIds: affected, skippedCardIds: ids.filter(id => !affected.includes(id)) } });
            events.push(...revalidateAttachments(state, { preserveHostDestinationIds: new Set(affected) }));
            break;
        }
        case "four-total-clear": {
            if (r !== "4" || su !== "♠")
                return fail("CORE_EFFECT_SOURCE", "Total Clear requires 4♠");
            const ids = Object.values(state.players).flatMap(p => [...p.pr, ...p.er]);
            moveCard(state, sourceId, "GY");
            for (const id of ids)
                moveCard(state, id, "GY");
            events.push({ type: "CORE_FOUR_TOTAL_CLEAR_RESOLVED", payload: { sourceCardId: sourceId, targetCardIds: ids } });
            events.push(...revalidateAttachments(state, { preserveHostDestinationIds: new Set(ids) }));
            break;
        }
        case "jack-attach": {
            if (r !== "J")
                return fail("CORE_EFFECT_SOURCE", "Attachment requires Jack");
            if (effect.row === "er" && su !== "♠")
                return fail("CORE_EFFECT_SOURCE", "ER Attachment requires J♠");
            const target = state.cards[effect.targetCardId];
            if (!target || target.controllerId === actorId || target.state.attachedByJackId || (effect.row === "pr" ? !target.zone.endsWith("_PR") : !isAnchor(state, target.id)))
                return fail("CORE_EFFECT_TARGET", "Invalid or already Jacked host");
            const ev = evaluateProtection(state, actorId, target.id, { channel: "effect", shape: "single-target", hostile: true, operation: "attachment", bypasses: [] });
            if (!ev.legal)
                return fail("PROTECTION_BLOCK", `Attachment blocked by ${ev.blockedBy.join(", ")}`, ev);
            const originalHostZone = target.zone, originalHostControllerId = target.controllerId;
            moveCard(state, sourceId, `${actorId}_ER`, actorId);
            moveCard(state, target.id, `${actorId}_${effect.row === "pr" ? "PR" : "ER"}`, actorId);
            const jack = state.cards[sourceId];
            jack.state.playedForEffect = true;
            jack.state.attachmentGraph = { kind: effect.row === "pr" ? "jack-pr" : "jack-er", hostCardId: target.id, originalHostZone, originalHostControllerId, pointBonus: effect.row === "pr" ? 1 : 0 };
            target.state.attachedByJackId = jack.id;
            if (effect.row === "pr")
                target.state.jackPointBonus = 1;
            events.push({ type: "CORE_JACK_ATTACHMENT_RESOLVED", payload: { jackCardId: jack.id, hostCardId: target.id, row: effect.row } });
            break;
        }
        case "queen-anchor":
            if (r !== "Q")
                return fail("CORE_EFFECT_SOURCE", "Queen Anchor requires Queen");
            moveCard(state, sourceId, `${actorId}_ER`, actorId);
            state.cards[sourceId].state.playedForEffect = true;
            state.cards[sourceId].state.anchorValue = 0;
            applyAegis(state.cards[sourceId], "Queen-entry", { playerId: actorId, startSequence: (state.startPhaseSequenceByPlayer[actorId] ?? 0) + 1 });
            events.push({ type: "CORE_QUEEN_ANCHOR_ENTERED", payload: { sourceCardId: sourceId } });
            break;
        case "king-anchor":
            if (r !== "K")
                return fail("CORE_EFFECT_SOURCE", "King Anchor requires King");
            moveCard(state, sourceId, `${actorId}_ER`, actorId);
            state.cards[sourceId].state.playedForEffect = true;
            state.cards[sourceId].state.anchorValue = su === "♠" ? 9 : 7;
            events.push({ type: "CORE_KING_ANCHOR_ENTERED", payload: { sourceCardId: sourceId, anchorValue: state.cards[sourceId].state.anchorValue } });
            break;
        case "red-joker": {
            if (r !== "RJ")
                return fail("CORE_EFFECT_SOURCE", "Red Joker mode requires RJ");
            moveCard(state, sourceId, "VOID");
            let payload = { sourceCardId: sourceId, mode: effect.mode };
            if (effect.mode === "hand-swap") {
                const t = effect.targetPlayerId ? state.players[effect.targetPlayerId] : undefined;
                if (!t || effect.targetPlayerId === actorId)
                    return fail("CORE_EFFECT_TARGET", "Hand Swap requires opponent");
                const own = [...state.players[actorId].hand], theirs = [...t.hand];
                for (const id of [...own, ...theirs])
                    moveCard(state, id, "VOID");
                for (const id of own) {
                    clearReveal(state, id);
                    const targetPlayerId = effect.targetPlayerId;
                    moveCard(state, id, `${targetPlayerId}_HAND`, targetPlayerId);
                }
                for (const id of theirs) {
                    clearReveal(state, id);
                    moveCard(state, id, `${actorId}_HAND`, actorId);
                }
                payload = { ...payload, targetPlayerId: effect.targetPlayerId, actorSent: own, actorReceived: theirs };
            }
            else if (effect.mode === "self-reset") {
                const discarded = [...state.players[actorId].hand];
                for (const id of discarded)
                    moveCard(state, id, "GY");
                payload = { ...payload, discarded, drawn: draw(state, actorId, discarded.length + 3) };
            }
            else if (effect.mode === "opponent-attack") {
                const t = effect.targetPlayerId ? state.players[effect.targetPlayerId] : undefined;
                if (!t || effect.targetPlayerId === actorId)
                    return fail("CORE_EFFECT_TARGET", "Opponent Attack requires opponent");
                const discarded = [...t.hand];
                for (const id of discarded)
                    moveCard(state, id, "GY");
                payload = { ...payload, targetPlayerId: effect.targetPlayerId, discarded, drawn: draw(state, effect.targetPlayerId, Math.max(0, discarded.length - 2)) };
            }
            else {
                const pool = [...state.zones.dp, ...state.zones.gy];
                state.zones.dp = [];
                state.zones.gy = [];
                for (const id of pool)
                    state.cards[id].zone = "DP";
                shuffle(state, pool);
                state.zones.dp = pool;
                payload = { ...payload, shuffledCount: pool.length, drawn: draw(state, actorId, 2) };
            }
            moveCard(state, sourceId, "GY");
            events.push({ type: "CORE_RED_JOKER_RESOLVED", payload });
            break;
        }
        case "black-joker-board-lock":
            if (r !== "BJ")
                return fail("CORE_EFFECT_SOURCE", "Board Lock requires BJ");
            moveCard(state, sourceId, "GY");
            state.metadata.boardLock = { turnsRemaining: 2, activationFullTurnId: state.fullTurnSequence, activatorId: actorId };
            events.push({ type: "CORE_BLACK_JOKER_BOARD_LOCK_RESOLVED", payload: state.metadata.boardLock });
            break;
    }
    return { ok: true, state, events };
}
//# sourceMappingURL=core-effects.js.map