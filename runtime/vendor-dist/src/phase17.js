import { canonicalize } from "./canonical-json.js";
import { hashCanonical } from "./hash.js";
import { deriveSecuredPoints } from "./state.js";
import { publicStateView, privateStateView } from "./views.js";
const PUBLIC_MARKER_KEYS = [
    "aegis", "tapped", "tapState", "playedForEffect", "exileBound", "attachedByJackId", "attachmentGraph",
    "faceDownTrap", "disabledTrap", "timeBomb", "timeBombStage", "jackPointBonus"
];
function markerSubset(state) {
    const out = {};
    for (const key of PUBLIC_MARKER_KEYS)
        if (Object.prototype.hasOwnProperty.call(state, key))
            out[key] = state[key];
    return out;
}
export function deriveJudgeMarkerChecklist(state) {
    return Object.values(state.cards)
        .filter((card) => card.zone.endsWith("_PR") || card.zone.endsWith("_ER"))
        .map((card) => ({ cardId: card.id, identity: card.state.faceDownTrap === true ? "FACE_DOWN_TRAP" : card.identity, controllerId: card.controllerId, zone: card.zone, markers: markerSubset(card.state) }))
        .filter((entry) => Object.keys(entry.markers).length > 0)
        .sort((a, b) => a.zone.localeCompare(b.zone) || a.cardId.localeCompare(b.cardId));
}
export function buildJudgePacket(state, includePrivateFor = []) {
    const packet = {
        rulesVersion: "4.1",
        revision: state.revision,
        phase: state.phase,
        activePlayerId: state.activePlayerId,
        publicStateHash: hashCanonical(publicStateView(state)),
        markerChecklist: deriveJudgeMarkerChecklist(state),
        timers: {
            boardLock: state.metadata.boardLock ?? null,
            suddenDeath: state.metadata.suddenDeath ?? null,
            exhausted: state.metadata.exhausted ?? null,
            fullTurnSequence: state.fullTurnSequence,
            startPhaseSequenceByPlayer: state.startPhaseSequenceByPlayer
        },
        pendingObjects: {
            stackDepth: state.stack.length,
            triggerQueueDepth: state.triggerQueue.length,
            pendingDeclaration: state.pendingDeclaration !== null,
            priorityOpen: state.priority?.open === true
        }
    };
    if (includePrivateFor.length > 0)
        packet.privateFactsByViewer = Object.fromEntries(includePrivateFor.map((id) => [id, privateStateView(state, id)]));
    return packet;
}
export function classifyJudgeOutcome(command, result) {
    if (!result.accepted)
        return "illegal-declaration";
    const types = result.events.map((event) => event.type.toUpperCase());
    if (types.some((type) => type.includes("FIZZLE")))
        return "fizzled";
    if (types.some((type) => type.includes("COUNTER") && !type.includes("COUNTER_DECLARED")))
        return "countered";
    if (command.type === "NOOP" || result.events.length === 0)
        return "no-op";
    return "resolved";
}
export function explainIllegalVsFizzle(command, result) {
    const classification = classifyJudgeOutcome(command, result);
    if (classification === "illegal-declaration")
        return { classification, explanation: result.error?.message ?? "The declaration failed public legality and never existed.", rollbackRequired: true, sourceDisposition: "Return every staged source/cost to the exact before-image; spend no Mini-Turn or limit." };
    if (classification === "fizzled")
        return { classification, explanation: "The declaration was legal, but a required target or condition failed revalidation at resolution.", rollbackRequired: false, sourceDisposition: "Committed sources follow failed-play destinations and destination replacements; paid limits remain spent." };
    if (classification === "countered")
        return { classification, explanation: "A legal pending object was negated before resolution.", rollbackRequired: false, sourceDisposition: "Committed sources follow counter destinations and replacements; costs and limits are not refunded." };
    return { classification, explanation: "The command resolved under the recorded event sequence.", rollbackRequired: false, sourceDisposition: "Use the recorded resolved destinations." };
}
export function renderPrintableStateAid(state) {
    const lines = ["# Intrilex Judge State Aid", "", `- Revision: ${state.revision}`, `- Phase: ${state.phase}`, `- Active player: ${state.activePlayerId}`, `- Full Turn: ${state.fullTurnSequence}`, "", "## Scores and Goals", ""];
    for (const playerId of state.turnOrder)
        lines.push(`- ${playerId}: ${deriveSecuredPoints(state, playerId)} / Goal ${state.players[playerId]?.goal ?? "?"}`);
    lines.push("", "## Pending Objects", "", `- Stack: ${state.stack.length}`, `- Trigger queue: ${state.triggerQueue.length}`, `- Declaration window: ${state.pendingDeclaration === null ? "closed" : "open"}`, `- Priority: ${state.priority?.open === true ? `open (${state.priority.consecutivePasses} consecutive passes)` : "closed"}`, "", "## Marker Checklist", "");
    const markers = deriveJudgeMarkerChecklist(state);
    if (markers.length === 0)
        lines.push("- None");
    for (const marker of markers)
        lines.push(`- ${marker.cardId} · ${marker.identity} · ${marker.zone} · ${canonicalize(marker.markers)}`);
    lines.push("", "## Table Procedure", "", "1. Verify mode, sources, costs, and targets before commitment.", "2. Distinguish illegal declaration from later fizzle.", "3. Resolve LIFO; no priority inside an atomic resolution.", "4. Queue generated triggers before returning to older stack items.", "5. Revalidate Attachments and signed score after every relevant change.", "6. Process End Phase: victory → Board Lock → Sudden Death → Exhausted.", "");
    return lines.join("\n");
}
export function judgeEventDigest(events) {
    return hashCanonical(events.map((event) => ({ sequence: event.sequence, type: event.type, visibility: event.visibility, payload: event.visibility === "public" ? event.payload : { redacted: true } })));
}
//# sourceMappingURL=phase17.js.map