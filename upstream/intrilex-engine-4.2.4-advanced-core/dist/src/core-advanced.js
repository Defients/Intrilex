import { canonicalClone } from "./canonical-json.js";
import { applyAegis, hasAegis, markExileBound, revealUntilStart } from "./lifecycle.js";
import { evaluateProtection, revalidateAttachments } from "./interactions.js";
import { cardPointValue, parseIdentity } from "./ranks.js";
import { moveCard } from "./state.js";
import { enumerateCoreEffectCandidates, resolveCoreEffect } from "./core-effects.js";
import { isCorePrivateChoiceEffect } from "./core-private-choice.js";
import { phase8Runtime } from "./phase8.js";
export const CORE_ADVANCED_AUTHORITY_PROFILE = Object.freeze({
    id: "core-advanced-authority",
    displayName: "Advanced Core Authority — Audited Public Supers, Rank 10, Ultras, Voltage & Royal Marriage",
    rulesVersion: "4.1",
    engineVersion: "4.2.4",
    playerCount: 2,
    enabledModules: [],
    supportedFamilies: [
        "royal-marriage", "super-two-score", "super-four-exchange", "super-eight", "super-jack",
        "rank10-heart", "rank10-spade-recovery", "rank10-stack-theft",
        "super-ace", "king-spade-counter", "ultra-three-black-public", "ultra-three-red",
        "ultra-two-black-two-red", "voltage-five-gy-bottom"
    ],
    excludedSystems: [
        "ten-club-foundation-trigger", "ten-diamond-mimic", "super-two-hold-child",
        "super-three-private", "super-five-private", "super-six-private", "super-seven-sequential",
        "rank10-generated-effect-copy", "voltage-three-choice", "voltage-four-private-prediction",
        "voltage-five-refine-private", "special-scoring-riders-seven-ten-club-black-joker",
        "sudden-death-autonomy", "optional-modules", "multiplayer"
    ],
    rationale: "Engine-owned advanced public Core slice. Every advertised mode is complete; copied effects, hidden continuations, Start-child control, and special scoring riders remain fail-closed."
});
const fail = (code, message, details) => details === undefined ? { ok: false, code, message } : { ok: false, code, message, details };
const rank = (s, id) => parseIdentity(s.cards[id]?.identity ?? "")?.rank;
const suit = (s, id) => parseIdentity(s.cards[id]?.identity ?? "")?.suit;
const inHand = (s, id, p) => s.cards[id]?.controllerId === p && s.cards[id]?.zone === `${p}_HAND`;
const profile = (s) => s.metadata.coreAuthority?.profileId === CORE_ADVANCED_AUTHORITY_PROFILE.id;
const sourceSet = (ids) => new Set(ids).size === ids.length;
const futureStart = (s, p) => ({ playerId: p, startSequence: (s.startPhaseSequenceByPlayer[p] ?? 0) + 1 });
function color(s, id) { const x = suit(s, id); return x === "♣" || x === "♠" ? "black" : x === "♦" || x === "♥" ? "red" : null; }
function allRank(s, ids, r, p) { return sourceSet(ids) && ids.every(id => inHand(s, id, p) && rank(s, id) === r); }
function exileBoundDestination(s, id) { return s.cards[id]?.state.exileBound === true ? "EXILE" : "GY"; }
function consumeRank10(s, p, id) { if (!inHand(s, id, p) || rank(s, id) !== "10")
    return "Rank-10 source must be controlled in hand"; if (s.players[p].limits.rank10PlayedThisFT)
    return "Rank-10 effect limit already used"; s.players[p].limits.rank10PlayedThisFT = true; markExileBound(s.cards[id]); return null; }
function consumeUltra(s, p, ids, recipe) { if (s.players[p].limits.ultraPlayedThisFT)
    return "Ultra limit already used"; if (!sourceSet(ids) || !ids.every(id => inHand(s, id, p)))
    return "Ultra sources must be distinct controlled hand cards"; const cs = ids.map(id => color(s, id)); if (recipe === "3-black" && (ids.length !== 3 || cs.some(c => c !== "black")))
    return "3 Black requires exactly three black cards"; if (recipe === "3-red" && (ids.length !== 3 || cs.some(c => c !== "red")))
    return "3 Red requires exactly three red cards"; if (recipe === "2-black-2-red" && (ids.length !== 4 || cs.filter(c => c === "black").length !== 2 || cs.filter(c => c === "red").length !== 2))
    return "2 Black + 2 Red requires two of each color"; s.players[p].limits.ultraPlayedThisFT = true; return null; }
export function isAdvancedProfile(s) { return s.metadata.coreAuthority?.profileId === CORE_ADVANCED_AUTHORITY_PROFILE.id; }
export function advancedSourceIds(a) {
    switch (a.kind) {
        case "advanced-royal-marriage": return [a.kingCardId, a.queenCardId];
        case "advanced-super-two":
        case "advanced-super-four-exchange":
        case "advanced-super-eight-scuttle":
        case "advanced-super-j-tempo":
        case "advanced-ultra-three-black":
        case "advanced-ultra-two-black-two-red": return [...a.sourceCardIds];
        case "advanced-rank10-club-foundation":
        case "advanced-rank10-heart-tempo":
        case "advanced-rank10-spade-recovery": return [a.sourceCardId];
        default: return [];
    }
}
export function advancedTargetIds(a) { switch (a.kind) {
    case "advanced-super-two":
    case "advanced-super-eight-scuttle": return [a.targetCardId];
    case "advanced-rank10-spade-recovery": return [a.recoverCardId];
    default: return [];
} }
export function advancedStackClass(a) { if (a.kind === "advanced-royal-marriage")
    return "royal-marriage"; if (a.kind.startsWith("advanced-super"))
    return "super"; if (a.kind.startsWith("advanced-ultra"))
    return "ultra"; if (a.kind.startsWith("advanced-rank10"))
    return "rank10"; return "voltage"; }
export function resolveAdvancedCoreAction(input, actorId, a) {
    if (!profile(input))
        return fail("CORE_ADVANCED_PROFILE", "Advanced Core Authority profile is not active");
    const s = canonicalClone(input), events = [];
    switch (a.kind) {
        case "advanced-royal-marriage": {
            if (!inHand(s, a.kingCardId, actorId) || !inHand(s, a.queenCardId, actorId) || rank(s, a.kingCardId) !== "K" || rank(s, a.queenCardId) !== "Q" || suit(s, a.kingCardId) !== suit(s, a.queenCardId))
                return fail("ROYAL_MARRIAGE", "Royal Marriage requires same-suit King and Queen in hand");
            moveCard(s, a.kingCardId, `${actorId}_ER`, actorId);
            moveCard(s, a.queenCardId, `${actorId}_ER`, actorId);
            s.cards[a.kingCardId].state.anchorValue = suit(s, a.kingCardId) === "♠" ? 9 : 7;
            s.cards[a.queenCardId].state.anchorValue = 0;
            applyAegis(s.cards[a.queenCardId], "Royal-Marriage-entry", futureStart(s, actorId));
            events.push({ type: "CORE_ADVANCED_ROYAL_MARRIAGE_RESOLVED", payload: { kingCardId: a.kingCardId, queenCardId: a.queenCardId, suit: suit(s, a.kingCardId), isCombo: false } });
            break;
        }
        case "advanced-super-two": {
            if (a.disposition !== "score")
                return fail("SUPER_TWO_HOLD_UNSUPPORTED", "⭐2 Hold requires a separately certified Start-child continuation");
            if (!allRank(s, a.sourceCardIds, "2", actorId))
                return fail("SUPER_TWO_SOURCE", "⭐2 requires two Twos in hand");
            const t = s.cards[a.targetCardId];
            if (!t || t.controllerId === actorId || (!t.zone.endsWith("_PR") && !t.zone.endsWith("_ER")))
                return fail("SUPER_TWO_TARGET", "⭐2 requires enemy OTT target");
            const ev = evaluateProtection(s, actorId, t.id, { channel: "effect", shape: "single-target", hostile: true, operation: "control-change", bypasses: ["guard", "rank-effect-immunity"] });
            if (!ev.legal)
                return fail("PROTECTION_BLOCK", `⭐2 blocked by ${ev.blockedBy.join(", ")}`, ev);
            const row = t.zone.endsWith("_PR") ? "PR" : "ER";
            for (const id of a.sourceCardIds)
                moveCard(s, id, "GY");
            moveCard(s, t.id, `${actorId}_${row}`, actorId);
            if (row !== "PR")
                moveCard(s, t.id, `${actorId}_PR`, actorId);
            delete t.state.tapped;
            delete t.state.tapState;
            events.push(...revalidateAttachments(s).map(e => ({ type: e.type, payload: e.payload })));
            events.push({ type: "CORE_ADVANCED_SUPER_TWO_RESOLVED", payload: { sourceCardIds: a.sourceCardIds, targetCardId: t.id, disposition: a.disposition } });
            break;
        }
        case "advanced-super-four-exchange": {
            if (!allRank(s, a.sourceCardIds, "4", actorId))
                return fail("SUPER_FOUR_SOURCE", "⭐4 requires two Fours in hand");
            const opp = s.players[a.targetPlayerId];
            if (!opp || a.targetPlayerId === actorId)
                return fail("SUPER_FOUR_TARGET", "⭐4 requires opponent row");
            for (const id of a.sourceCardIds)
                moveCard(s, id, "GY");
            const own = [...(a.row === "pr" ? s.players[actorId].pr : s.players[actorId].er)], theirs = [...(a.row === "pr" ? opp.pr : opp.er)];
            for (const id of own)
                moveCard(s, id, `${a.targetPlayerId}_${a.row.toUpperCase()}`, a.targetPlayerId);
            for (const id of theirs)
                moveCard(s, id, `${actorId}_${a.row.toUpperCase()}`, actorId);
            for (const id of [...own, ...theirs])
                if (rank(s, id) !== "9")
                    applyAegis(s.cards[id], "Super-Four-exchange", futureStart(s, s.cards[id].controllerId));
            events.push(...revalidateAttachments(s).map(e => ({ type: e.type, payload: e.payload })));
            events.push({ type: "CORE_ADVANCED_SUPER_FOUR_RESOLVED", payload: { sourceCardIds: a.sourceCardIds, row: a.row, targetPlayerId: a.targetPlayerId, actorCards: own, opponentCards: theirs } });
            break;
        }
        case "advanced-super-eight-scuttle": {
            if (!allRank(s, a.sourceCardIds, "8", actorId))
                return fail("SUPER_EIGHT_SOURCE", "⭐8 requires two Eights in hand");
            const t = s.cards[a.targetCardId];
            if (!t || t.controllerId === actorId || !t.zone.endsWith("_PR") || hasAegis(t))
                return fail("SUPER_EIGHT_TARGET", "⭐8 requires enemy non-Aegis PR target");
            for (const id of a.sourceCardIds)
                moveCard(s, id, "GY");
            moveCard(s, t.id, "GY");
            events.push(...revalidateAttachments(s).map(e => ({ type: e.type, payload: e.payload })));
            events.push({ type: "CORE_ADVANCED_SUPER_EIGHT_RESOLVED", payload: { sourceCardIds: a.sourceCardIds, targetCardId: t.id } });
            break;
        }
        case "advanced-super-j-tempo": {
            if (!allRank(s, a.sourceCardIds, "J", actorId))
                return fail("SUPER_J_SOURCE", "⭐J requires two Jacks in hand");
            for (const id of a.sourceCardIds)
                moveCard(s, id, "GY");
            const p = s.players[actorId];
            p.limits.miniTurnsRemaining = Math.min(3, p.limits.miniTurnsRemaining + 2);
            events.push({ type: "CORE_ADVANCED_SUPER_J_RESOLVED", payload: { sourceCardIds: a.sourceCardIds, miniTurnsRemaining: p.limits.miniTurnsRemaining } });
            break;
        }
        case "advanced-rank10-club-foundation": {
            return fail("RANK10_CLUB_UNSUPPORTED", "10♣ requires an engine-owned queued scoring trigger");
        }
        case "advanced-rank10-heart-tempo": {
            if (suit(s, a.sourceCardId) !== "♥")
                return fail("RANK10_SOURCE", "Tempo Spike requires 10♥");
            const problem = consumeRank10(s, actorId, a.sourceCardId);
            if (problem)
                return fail("RANK10_LIMIT", problem);
            moveCard(s, a.sourceCardId, "EXILE");
            const p = s.players[actorId];
            p.limits.miniTurnsRemaining = Math.min(3, p.limits.miniTurnsRemaining + 2);
            const drawn = s.zones.dp[0];
            if (drawn)
                moveCard(s, drawn, `${actorId}_HAND`, actorId);
            events.push({ type: "CORE_ADVANCED_TEN_HEART_RESOLVED", payload: { sourceCardId: a.sourceCardId, drawnCardId: drawn ?? null, miniTurnsRemaining: p.limits.miniTurnsRemaining } });
            break;
        }
        case "advanced-rank10-spade-recovery": {
            if (suit(s, a.sourceCardId) !== "♠")
                return fail("RANK10_SOURCE", "Exile Recovery requires 10♠");
            const problem = consumeRank10(s, actorId, a.sourceCardId);
            if (problem)
                return fail("RANK10_LIMIT", problem);
            if (s.cards[a.recoverCardId]?.zone !== "EXILE")
                return fail("RANK10_TARGET", "Exile Recovery target must be in Exile");
            moveCard(s, a.recoverCardId, `${actorId}_HAND`, actorId);
            revealUntilStart(s.cards[a.recoverCardId], futureStart(s, actorId));
            moveCard(s, a.sourceCardId, "EXILE");
            events.push({ type: "CORE_ADVANCED_TEN_SPADE_RECOVERY_RESOLVED", payload: { sourceCardId: a.sourceCardId, recoverCardId: a.recoverCardId } });
            break;
        }
        case "advanced-ultra-three-black": {
            const problem = consumeUltra(s, actorId, a.sourceCardIds, "3-black");
            if (problem)
                return fail("ULTRA_RECIPE", problem);
            if (new Set([a.scoreCardId, a.castCardId, a.exileCardId]).size !== 3 || ![a.scoreCardId, a.castCardId, a.exileCardId].every(id => a.sourceCardIds.includes(id)))
                return fail("ULTRA_ROLES", "3 Black roles must partition the sources");
            const scoreIdentity = s.cards[a.scoreCardId].identity;
            if (rank(s, a.scoreCardId) === "7" || scoreIdentity === "10♣" || scoreIdentity === "BJ")
                return fail("ULTRA_SCORE_RIDER_UNSUPPORTED", "3 Black score role cannot use a card with an uncertified scoring rider");
            moveCard(s, a.scoreCardId, `${actorId}_PR`, actorId);
            s.cards[a.scoreCardId].state.pointValue = cardPointValue(s.cards[a.scoreCardId]);
            let castResolved = false;
            if (a.castEffect.sourceCardId === a.castCardId) {
                const cast = resolveCoreEffect(s, actorId, a.castEffect);
                if (cast.ok) {
                    Object.assign(s, cast.state);
                    events.push(...cast.events);
                    castResolved = true;
                }
            }
            if (!castResolved && s.cards[a.castCardId]?.zone === `${actorId}_HAND`)
                moveCard(s, a.castCardId, "GY");
            moveCard(s, a.exileCardId, "EXILE");
            events.push({ type: "CORE_ADVANCED_ULTRA_THREE_BLACK_RESOLVED", payload: { sourceCardIds: a.sourceCardIds, scoreCardId: a.scoreCardId, castCardId: a.castCardId, exileCardId: a.exileCardId, castResolved, castFizzled: !castResolved, priorityWindowsInside: 0 } });
            break;
        }
        case "advanced-ultra-two-black-two-red": {
            const problem = consumeUltra(s, actorId, a.sourceCardIds, "2-black-2-red");
            if (problem)
                return fail("ULTRA_RECIPE", problem);
            for (const id of a.sourceCardIds)
                moveCard(s, id, "GY");
            const p = s.players[actorId];
            p.limits.miniTurnsRemaining = Math.min(3, p.limits.miniTurnsRemaining + 2);
            let moved = [];
            if (a.branch === "draw-two") {
                for (let i = 0; i < 2 && s.zones.dp.length; i++) {
                    const id = s.zones.dp[0];
                    moveCard(s, id, `${actorId}_HAND`, actorId);
                    moved.push(id);
                }
            }
            else if (a.rummageCardId && s.cards[a.rummageCardId]?.zone === "EXILE") {
                moveCard(s, a.rummageCardId, `${actorId}_HAND`, actorId);
                moved = [a.rummageCardId];
            }
            events.push({ type: "CORE_ADVANCED_ULTRA_2B2R_RESOLVED", payload: { sourceCardIds: a.sourceCardIds, branch: a.branch, movedCardIds: moved, miniTurnsRemaining: p.limits.miniTurnsRemaining } });
            break;
        }
        case "advanced-voltage-three":
        case "advanced-voltage-four": {
            return fail("VOLTAGE_MODE_UNSUPPORTED", "Voltage Three and Four require sealed hidden-choice continuations");
        }
        case "advanced-voltage-five": {
            if (a.branch !== "gy-bottom") {
                return fail("VOLTAGE_MODE_UNSUPPORTED", "Voltage Five refine requires a sealed post-draw discard continuation");
            }
            const rt = phase8Runtime(s);
            const snap = rt.voltageSnapshots[actorId];
            if (!snap)
                return fail("VOLTAGE_SNAPSHOT", "Voltage snapshot is missing");
            const rank5Value = snap.rank5 ?? 0;
            const used = rt.voltageUsedThisFT[actorId] ?? { "3": false, "4": false, "5": false };
            if (used["5"])
                return fail("VOLTAGE_LIMIT", "Voltage 5 already used");
            if (rank5Value < 5)
                return fail("VOLTAGE_THRESHOLD", "Voltage 5 threshold not met");
            const bottom = s.zones.gy[0];
            if (!bottom)
                return fail("VOLTAGE_TARGET", "Voltage Five GY-bottom branch requires a GY card");
            used["5"] = true;
            rt.voltageUsedThisFT[actorId] = used;
            s.metadata.phase8 = rt;
            moveCard(s, bottom, `${actorId}_HAND`, actorId);
            events.push({
                type: "CORE_ADVANCED_VOLTAGE_FIVE_RESOLVED",
                payload: { branch: a.branch, cardId: bottom }
            });
            break;
        }
    }
    return { ok: true, state: s, events };
}
function combos(v, n) { const out = []; const walk = (i, c) => { if (c.length === n) {
    out.push([...c]);
    return;
} for (let x = i; x < v.length; x++) {
    c.push(v[x]);
    walk(x + 1, c);
    c.pop();
} }; walk(0, []); return out; }
export function enumerateAdvancedCoreCandidates(state, actorId) {
    if (!isAdvancedProfile(state))
        return [];
    const s = state, p = s.players[actorId];
    if (!p)
        return [];
    const out = [];
    const byRank = (r) => p.hand.filter(id => rank(s, id) === r).sort();
    const opponents = s.turnOrder.filter(id => id !== actorId);
    for (const k of byRank("K"))
        for (const q of byRank("Q"))
            if (suit(s, k) === suit(s, q))
                out.push({ family: "royal-marriage", mode: String(suit(s, k)), timingClass: "ACTION", sourceCardIds: [k, q], targetCardIds: [], advanced: { kind: "advanced-royal-marriage", kingCardId: k, queenCardId: q }, featureVector: { multiCard: true, anchorValue: suit(s, k) === "♠" ? 9 : 7, guard: true } });
    for (const pair of combos(byRank("2"), 2)) {
        for (const oid of opponents) {
            for (const targetId of [...s.players[oid].pr, ...s.players[oid].er]) {
                const legality = evaluateProtection(s, actorId, targetId, {
                    channel: "effect",
                    shape: "single-target",
                    hostile: true,
                    operation: "control-change",
                    bypasses: ["guard", "rank-effect-immunity"]
                });
                if (!legality.legal)
                    continue;
                out.push({
                    family: "super",
                    mode: "two-score",
                    timingClass: "ACTION",
                    sourceCardIds: [...pair],
                    targetCardIds: [targetId],
                    advanced: {
                        kind: "advanced-super-two",
                        sourceCardIds: pair,
                        targetCardId: targetId,
                        disposition: "score"
                    },
                    featureVector: { controlChange: true, disposition: "score" }
                });
            }
        }
    }
    for (const pair of combos(byRank("4"), 2))
        for (const oid of opponents)
            for (const row of ["pr", "er"])
                out.push({ family: "super", mode: `four-exchange-${row}`, timingClass: "ACTION", sourceCardIds: [...pair], targetCardIds: [], advanced: { kind: "advanced-super-four-exchange", sourceCardIds: pair, targetPlayerId: oid, row }, featureVector: { structural: true, row } });
    for (const pair of combos(byRank("8"), 2)) {
        for (const oid of opponents) {
            for (const targetId of s.players[oid].pr) {
                if (hasAegis(s.cards[targetId]))
                    continue;
                out.push({
                    family: "super",
                    mode: "eight-absolute-scuttle",
                    timingClass: "ACTION",
                    sourceCardIds: [...pair],
                    targetCardIds: [targetId],
                    advanced: {
                        kind: "advanced-super-eight-scuttle",
                        sourceCardIds: pair,
                        targetCardId: targetId
                    },
                    featureVector: { scuttle: true, absolute: true }
                });
            }
        }
    }
    for (const pair of combos(byRank("J"), 2))
        out.push({ family: "super", mode: "jack-tempo", timingClass: "ACTION", sourceCardIds: [...pair], targetCardIds: [], advanced: { kind: "advanced-super-j-tempo", sourceCardIds: pair }, featureVector: { miniTurns: 2 } });
    for (const id of byRank("10")) {
        const su = suit(s, id);
        if (su === "♥")
            out.push({ family: "rank10", mode: "heart-tempo", timingClass: "ACTION", sourceCardIds: [id], targetCardIds: [], advanced: { kind: "advanced-rank10-heart-tempo", sourceCardId: id }, featureVector: { miniTurns: 2, draw: 1 } });
        if (su === "♠")
            for (const x of s.zones.exile.slice(0, 12))
                out.push({ family: "rank10", mode: "spade-recovery", timingClass: "ACTION", sourceCardIds: [id], targetCardIds: [x], advanced: { kind: "advanced-rank10-spade-recovery", sourceCardId: id, recoverCardId: x }, featureVector: { recovery: true } });
    }
    const hand = [...p.hand].sort();
    for (const set of combos(hand.filter(id => color(s, id) === "black"), 3).slice(0, 12)) {
        for (const castCardId of set) {
            const remaining = set.filter(id => id !== castCardId);
            for (const scoreCardId of remaining) {
                if (rank(s, scoreCardId) === "7" || s.cards[scoreCardId].identity === "10♣" || s.cards[scoreCardId].identity === "BJ")
                    continue;
                const exileCardId = remaining.find(id => id !== scoreCardId);
                for (const effect of enumerateCoreEffectCandidates(s, actorId).filter(c => c.effect.sourceCardId === castCardId && !isCorePrivateChoiceEffect(c.effect)).slice(0, 4))
                    out.push({ family: "ultra", mode: `three-black-${effect.mode}`, timingClass: "ACTION", sourceCardIds: [...set], targetCardIds: [...effect.targetCardIds], advanced: { kind: "advanced-ultra-three-black", sourceCardIds: set, scoreCardId, castCardId, exileCardId, castEffect: effect.effect }, featureVector: { atomic: true, score: true, internalCast: true, exile: true } });
            }
        }
    }
    for (const set of combos(hand.filter(id => color(s, id) !== null), 4).slice(0, 20)) {
        if (set.filter(id => color(s, id) === "black").length === 2 && set.filter(id => color(s, id) === "red").length === 2) {
            out.push({ family: "ultra", mode: "2-black-2-red-draw", timingClass: "ACTION", sourceCardIds: [...set], targetCardIds: [], advanced: { kind: "advanced-ultra-two-black-two-red", sourceCardIds: set, branch: "draw-two" }, featureVector: { miniTurns: 2, draw: 2 } });
            for (const x of s.zones.exile.slice(0, 4))
                out.push({ family: "ultra", mode: "2-black-2-red-rummage", timingClass: "ACTION", sourceCardIds: [...set], targetCardIds: [x], advanced: { kind: "advanced-ultra-two-black-two-red", sourceCardIds: set, branch: "rummage-exile", rummageCardId: x }, featureVector: { miniTurns: 2, recovery: true } });
        }
    }
    const phase8 = phase8Runtime(s), snap = phase8.voltageSnapshots[actorId], used = phase8.voltageUsedThisFT[actorId];
    if (s.phase === "Start" && (snap?.rank5 ?? 0) >= 5 && !used?.["5"] && s.zones.gy.length)
        out.push({ family: "voltage", mode: "five-gy-bottom", timingClass: "INSTANT", sourceCardIds: [], targetCardIds: [], advanced: { kind: "advanced-voltage-five", branch: "gy-bottom" }, featureVector: { rank: 5, recovery: true, publicBranch: true } });
    return out;
}
//# sourceMappingURL=core-advanced.js.map