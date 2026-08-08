import { canonicalClone } from "./canonical-json.js";
import { deriveSecuredPoints, moveCard } from "./state.js";
function fail(code, message, details) {
    return details === undefined ? { ok: false, code, message } : { ok: false, code, message, details };
}
export function phase11Runtime(state) {
    const current = state.metadata.phase11;
    return {
        mode: current?.mode ?? null,
        teamByPlayer: canonicalClone(current?.teamByPlayer ?? Object.fromEntries(Object.keys(state.players).map((id) => [id, state.players[id]?.teamId ?? null]))),
        swapBarLayout: current?.swapBarLayout ? canonicalClone(current.swapBarLayout) : null,
        thatsUrzAssignments: canonicalClone(current?.thatsUrzAssignments ?? {}),
        tournamentSeedAssignments: canonicalClone(current?.tournamentSeedAssignments ?? {}),
        lastTargetEvaluation: current?.lastTargetEvaluation ? canonicalClone(current.lastTargetEvaluation) : null,
        winningTeamId: current?.winningTeamId ?? null,
        lastTeamTotals: canonicalClone(current?.lastTeamTotals ?? {})
    };
}
function saveRuntime(state, runtime) { state.metadata.phase11 = runtime; }
export function relationBetween(state, sourcePlayerId, targetPlayerId) {
    if (sourcePlayerId === targetPlayerId)
        return "self";
    const sourceTeam = state.players[sourcePlayerId]?.teamId ?? null;
    const targetTeam = state.players[targetPlayerId]?.teamId ?? null;
    return sourceTeam !== null && sourceTeam === targetTeam ? "ally" : "enemy";
}
export function areAllies(state, a, b) { return relationBetween(state, a, b) === "ally"; }
export function areEnemies(state, a, b) { return relationBetween(state, a, b) === "enemy"; }
export function validateMultiplayerTarget(state, sourcePlayerId, targetPlayerId, hostile, allowsAlly = false) {
    if (!state.players[sourcePlayerId] || !state.players[targetPlayerId])
        return "Source and target players must exist";
    const relation = relationBetween(state, sourcePlayerId, targetPlayerId);
    if (hostile && relation === "self")
        return "A hostile opponent interaction cannot target its controller";
    if (hostile && relation === "ally" && !allowsAlly)
        return "Hostile effects cannot target an Ally";
    return null;
}
export function nextPlayerAssignments(turnOrder) {
    if (turnOrder.length < 2 || new Set(turnOrder).size !== turnOrder.length)
        throw new Error("Turn order must contain at least two unique players");
    return Object.fromEntries(turnOrder.map((id, index) => [id, turnOrder[(index + 1) % turnOrder.length]]));
}
export function expectedPriorityOrder(turnOrder, declaringPlayerId) {
    const index = turnOrder.indexOf(declaringPlayerId);
    if (index < 0)
        throw new Error(`Declaring player ${declaringPlayerId} is not in turn order`);
    return [...turnOrder.slice(index + 1), ...turnOrder.slice(0, index + 1)];
}
export function swapBarShape(playerCount) {
    if (playerCount === 2)
        return { capacity: 3, faceDown: 2, faceUp: 1 };
    if (playerCount === 3)
        return { capacity: 4, faceDown: 2, faceUp: 2 };
    if (playerCount === 4)
        return { capacity: 5, faceDown: 3, faceUp: 2 };
    throw new Error("Multiplayer supports exactly three or four players");
}
function activeAnchorCount(state, playerId) {
    return state.players[playerId].er.filter((id) => {
        const card = state.cards[id];
        return card !== undefined && card.controllerId === playerId && card.state.tapped !== true && card.state.faceDownTrap !== true && (card.state.anchor === true || /^(A|9|Q|K)/.test(card.identity));
    }).length;
}
export function teamTotals(state) {
    const totals = {};
    for (const playerId of state.turnOrder) {
        const teamId = state.players[playerId]?.teamId;
        if (!teamId)
            continue;
        const current = totals[teamId] ?? { anchors: 0, points: 0 };
        current.anchors += activeAnchorCount(state, playerId);
        current.points += deriveSecuredPoints(state, playerId);
        totals[teamId] = current;
    }
    return totals;
}
function validateTeams(state, order, assignments) {
    if (order.length !== 4)
        return "Teams mode requires exactly four players";
    if (new Set(order).size !== 4 || order.some((id) => !state.players[id]))
        return "Team turn order must contain four unique existing players";
    const teamIds = order.map((id) => assignments[id]);
    if (teamIds.some((id) => typeof id !== "string" || id.length === 0))
        return "Every player requires a team assignment";
    const counts = new Map();
    for (const teamId of teamIds)
        counts.set(teamId, (counts.get(teamId) ?? 0) + 1);
    if (counts.size !== 2 || [...counts.values()].some((count) => count !== 2))
        return "Teams mode requires exactly two teams of two";
    if (teamIds[0] === teamIds[1] || teamIds[1] === teamIds[2] || teamIds[2] === teamIds[3])
        return "Team turn order must alternate teams";
    return null;
}
function validateSetupAssignments(state, action, mode) {
    const expected = mode === "ffa-3" ? [5, 6, 6] : [5, 5, 5, 5];
    if (action.turnOrder.length !== expected.length)
        return `Expected ${expected.length} players`;
    const all = [...Object.values(action.handAssignments).flat(), ...action.swapBarFaceDownCardIds, ...action.swapBarFaceUpCardIds];
    if (new Set(all).size !== all.length)
        return "Setup assignments cannot reuse a card";
    if (all.some((id) => state.cards[id]?.zone !== "DP"))
        return "Every setup card must begin in DP";
    for (let i = 0; i < action.turnOrder.length; i += 1) {
        const id = action.turnOrder[i];
        if (!state.players[id])
            return `Unknown setup player ${id}`;
        if ((action.handAssignments[id]?.length ?? -1) !== expected[i])
            return `${id} must receive ${expected[i]} cards`;
    }
    const shape = swapBarShape(action.turnOrder.length);
    if (action.swapBarFaceDownCardIds.length !== shape.faceDown || action.swapBarFaceUpCardIds.length !== shape.faceUp)
        return "Swap Bar assignment does not match player-count scaling";
    return null;
}
export function resolvePhase11Action(input, actorId, action) {
    if (!input.players[actorId])
        return fail("PHASE11_PLAYER", `Unknown actor ${actorId}`);
    const state = canonicalClone(input);
    const runtime = phase11Runtime(state);
    const events = [];
    switch (action.kind) {
        case "configure-multiplayer": {
            if (action.mode === "ffa-3") {
                if (action.turnOrder.length !== 3 || new Set(action.turnOrder).size !== 3 || action.turnOrder.some((id) => !state.players[id]))
                    return fail("MULTIPLAYER_CONFIG", "FFA requires three unique existing players");
                for (const id of action.turnOrder)
                    state.players[id].teamId = null;
            }
            else {
                const problem = validateTeams(state, action.turnOrder, action.teamAssignments ?? {});
                if (problem)
                    return fail("MULTIPLAYER_CONFIG", problem);
                for (const id of action.turnOrder)
                    state.players[id].teamId = action.teamAssignments[id];
            }
            state.turnOrder = [...action.turnOrder];
            state.activePlayerId = action.turnOrder[0];
            runtime.mode = action.mode;
            runtime.teamByPlayer = Object.fromEntries(action.turnOrder.map((id) => [id, state.players[id].teamId ?? null]));
            events.push({ type: "MULTIPLAYER_CONFIGURED", payload: { mode: action.mode, turnOrder: action.turnOrder, teamByPlayer: runtime.teamByPlayer } });
            break;
        }
        case "apply-multiplayer-setup": {
            const problem = validateSetupAssignments(state, action, action.mode);
            if (problem)
                return fail("MULTIPLAYER_SETUP", problem);
            if (action.mode === "teams-4") {
                const teamProblem = validateTeams(state, action.turnOrder, action.teamAssignments ?? {});
                if (teamProblem)
                    return fail("MULTIPLAYER_SETUP", teamProblem);
            }
            for (const playerId of action.turnOrder) {
                state.players[playerId].goal = 21;
                state.players[playerId].teamId = action.mode === "teams-4" ? action.teamAssignments[playerId] : null;
                for (const cardId of action.handAssignments[playerId])
                    moveCard(state, cardId, `${playerId}_HAND`, playerId);
            }
            for (const cardId of [...action.swapBarFaceDownCardIds, ...action.swapBarFaceUpCardIds])
                moveCard(state, cardId, "SWAP_BAR");
            state.turnOrder = [...action.turnOrder];
            state.activePlayerId = action.turnOrder[0];
            runtime.mode = action.mode;
            runtime.teamByPlayer = Object.fromEntries(action.turnOrder.map((id) => [id, state.players[id].teamId ?? null]));
            runtime.swapBarLayout = { capacity: action.swapBarFaceDownCardIds.length + action.swapBarFaceUpCardIds.length, faceDownCardIds: [...action.swapBarFaceDownCardIds], faceUpCardIds: [...action.swapBarFaceUpCardIds] };
            events.push({ type: "MULTIPLAYER_SETUP_APPLIED", payload: { mode: action.mode, turnOrder: action.turnOrder, handSizes: Object.fromEntries(action.turnOrder.map((id) => [id, state.players[id].hand.length])), swapBarLayout: runtime.swapBarLayout } });
            break;
        }
        case "assign-thats-urz": {
            const assignments = action.assignments ?? nextPlayerAssignments(action.turnOrder);
            const keys = Object.keys(assignments);
            const recipients = Object.values(assignments);
            if (canonicalClone(keys).sort().join("|") !== canonicalClone(action.turnOrder).sort().join("|") || new Set(recipients).size !== action.turnOrder.length || recipients.some((id) => !action.turnOrder.includes(id)) || action.turnOrder.some((id) => assignments[id] === id))
                return fail("THATS_URZ_ASSIGNMENT", "Assignments must be a self-free bijection over turn order");
            runtime.thatsUrzAssignments = canonicalClone(assignments);
            events.push({ type: "THATS_URZ_ASSIGNMENTS_RECORDED", payload: { assignments } });
            break;
        }
        case "validate-player-target": {
            const problem = validateMultiplayerTarget(state, action.sourcePlayerId, action.targetPlayerId, action.hostile, action.allowsAlly ?? false);
            const relation = relationBetween(state, action.sourcePlayerId, action.targetPlayerId);
            runtime.lastTargetEvaluation = { sourcePlayerId: action.sourcePlayerId, targetPlayerId: action.targetPlayerId, relation, legal: problem === null };
            if (problem)
                return fail("MULTIPLAYER_TARGET", problem, runtime.lastTargetEvaluation);
            events.push({ type: "MULTIPLAYER_TARGET_VALIDATED", payload: runtime.lastTargetEvaluation });
            break;
        }
        case "record-priority-cycle": {
            const expected = expectedPriorityOrder(state.turnOrder, action.declaringPlayerId);
            if (action.passOrder.length !== expected.length || action.passOrder.some((id, index) => id !== expected[index]))
                return fail("MULTIPLAYER_PRIORITY", "Priority must begin with the next player and continue in turn order through the declarer", { expected, actual: action.passOrder });
            events.push({ type: "MULTIPLAYER_PRIORITY_CYCLE_RECORDED", payload: { declaringPlayerId: action.declaringPlayerId, order: expected, allPassedConsecutively: true } });
            break;
        }
        case "assign-tournament-seed": {
            const available = new Set(action.poolCardIds.filter((id) => state.cards[id]?.zone === "DP"));
            const assigned = {};
            for (const playerId of action.priorityOrder) {
                const preferences = action.preferences[playerId] ?? [];
                const chosen = preferences.find((id) => available.has(id));
                if (!chosen)
                    return fail("TOURNAMENT_SEED_POOL", `${playerId} has no available registered High-Impact identity`);
                available.delete(chosen);
                assigned[playerId] = chosen;
            }
            for (const [playerId, cardId] of Object.entries(assigned))
                moveCard(state, cardId, `${playerId}_HAND`, playerId);
            runtime.tournamentSeedAssignments = assigned;
            events.push({ type: "TOURNAMENT_SEED_ASSIGNED", payload: { priorityOrder: action.priorityOrder, assignments: assigned, unique: new Set(Object.values(assigned)).size === action.priorityOrder.length } });
            break;
        }
        case "intercept-generated-play": {
            const item = state.stack.find((entry) => entry.id === action.stackItemId);
            if (!item)
                return fail("MULTIPLAYER_INTERCEPT", `Missing stack item ${action.stackItemId}`);
            item.controllerId = action.interceptorId;
            item.targetCardIds = [...action.replacementTargetIds];
            for (const targetId of item.targetCardIds) {
                const targetController = state.cards[targetId]?.controllerId;
                if (!targetController)
                    return fail("MULTIPLAYER_INTERCEPT_TARGET", `Unknown target ${targetId}`);
                const problem = validateMultiplayerTarget(state, action.interceptorId, targetController, true, false);
                if (problem)
                    return fail("MULTIPLAYER_INTERCEPT_TARGET", problem, { targetId, targetController });
            }
            events.push({ type: "GENERATED_PLAY_INTERCEPTED", payload: { stackItemId: item.id, previousControllerId: action.originalControllerId, controllerId: action.interceptorId, controllerRelativeTextRebound: true, replacementTargetIds: item.targetCardIds } });
            break;
        }
        case "partner-royal-marriage": {
            if (!areAllies(state, action.initiatorId, action.allyId))
                return fail("PARTNER_MARRIAGE", "Partner Royal Marriage requires an Ally");
            const king = state.cards[action.kingCardId];
            const queen = state.cards[action.queenCardId];
            if (!king || !queen || king.zone !== `${action.initiatorId}_HAND` || queen.zone !== `${action.allyId}_HAND` || !king.identity.startsWith("K") || !queen.identity.startsWith("Q") || king.identity.slice(1) !== queen.identity.slice(1))
                return fail("PARTNER_MARRIAGE", "Matching King and Queen must be held by the initiating Allies");
            moveCard(state, king.id, `${action.initiatorId}_ER`, action.initiatorId);
            moveCard(state, queen.id, `${action.allyId}_ER`, action.allyId);
            queen.state.anchor = true;
            king.state.anchor = true;
            events.push({ type: "PARTNER_ROYAL_MARRIAGE_RESOLVED", payload: { initiatorId: action.initiatorId, allyId: action.allyId, kingCardId: king.id, queenCardId: queen.id, oneStackItem: true } });
            break;
        }
        case "resolve-team-endgame": {
            const totals = teamTotals(state);
            runtime.lastTeamTotals = totals;
            let winningTeamId = null;
            if (action.kindOfCheck === "normal") {
                const active = state.players[action.activePlayerId];
                if (!active?.teamId)
                    return fail("TEAM_ENDGAME", "Normal team victory requires an active team player");
                if (deriveSecuredPoints(state, action.activePlayerId) >= active.goal)
                    winningTeamId = active.teamId;
            }
            else if (action.kindOfCheck === "sudden-death") {
                const activator = state.players[action.activatorId ?? ""];
                if (!activator?.teamId)
                    return fail("TEAM_ENDGAME", "Sudden Death activator must belong to a team");
                winningTeamId = activator.teamId;
            }
            else {
                const entries = Object.entries(totals);
                const maxAnchors = Math.max(...entries.map(([, value]) => value.anchors));
                const anchorLeaders = entries.filter(([, value]) => value.anchors === maxAnchors);
                const maxPoints = Math.max(...anchorLeaders.map(([, value]) => value.points));
                const leaders = anchorLeaders.filter(([, value]) => value.points === maxPoints);
                winningTeamId = leaders.length === 1 ? leaders[0][0] : null;
            }
            runtime.winningTeamId = winningTeamId;
            if (winningTeamId) {
                const representative = state.turnOrder.find((id) => state.players[id]?.teamId === winningTeamId) ?? null;
                state.winner = representative;
            }
            events.push({ type: "TEAM_ENDGAME_RESOLVED", payload: { kindOfCheck: action.kindOfCheck, totals, winningTeamId, representativeWinnerId: state.winner } });
            break;
        }
    }
    saveRuntime(state, runtime);
    return { ok: true, state, events };
}
//# sourceMappingURL=phase11.js.map