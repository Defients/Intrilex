import { canonicalize } from "./canonical-json.js";
import { hashCanonical } from "./hash.js";
export const MODULES = ["first-contact", "battle-realm", "traps", "multiplayer", "deffy-mode", "time-bomb", "tournament-seed"];
function result(status, reason, ruleRefs) { return { status, reason, ruleRefs }; }
export function modulePairCompatibility(a, b) {
    if (a === b)
        return result("compatible", "Same module identity; no pair interaction.", []);
    const set = new Set([a, b]);
    if (set.has("first-contact"))
        return result("prohibited", "First Contact disables every optional module unless a dedicated teaching variant explicitly overrides it.", ["§15.1", "§22.2"]);
    if (set.has("tournament-seed") && (set.has("traps") || set.has("time-bomb")))
        return result("prohibited", "Tournament Seed explicitly disables Traps and Time Bomb.", ["§26.2", "§22.10"]);
    if (set.has("tournament-seed"))
        return result("requires-event-approval", "Tournament Seed disables unapproved optional modules; an event sheet must approve this combination.", ["§26.2", "§22.10"]);
    if (set.has("battle-realm") && set.has("traps"))
        return result("compatible-with-rule", "Trap context does not count as the card resolving as a play; Spec modifiers apply only when relevant.", ["§22.3"]);
    if (set.has("battle-realm") && set.has("multiplayer"))
        return result("compatible-with-rule", "Specs remain per player; opponent means Enemy and team aggregation is explicit.", ["§22.4"]);
    if (set.has("traps") && set.has("multiplayer"))
        return result("compatible-with-rule", "Trap caps are per player while the module-3 counter limit remains global.", ["§22.5"]);
    if (set.has("time-bomb"))
        return result("compatible-with-rule", "Time Bomb interactions preserve face-up/face-down exclusivity, signed scoring, and current-controller Fuse timing.", ["§22.6"]);
    if (set.has("deffy-mode"))
        return result("compatible-with-rule", "Deffy Mode completes setup before gameplay modules become active.", ["§22.7", "§22.8", "§22.9"]);
    return result("compatible", "No special conflict; Core precedence and all module limits remain active.", ["§22.1"]);
}
export function validateModuleConfiguration(enabled, eventApproved = []) {
    const unique = [...new Set(enabled)];
    const approvals = new Set(eventApproved);
    const problems = [];
    for (let i = 0; i < unique.length; i += 1)
        for (let j = i + 1; j < unique.length; j += 1) {
            const a = unique[i];
            const b = unique[j];
            const compatibility = modulePairCompatibility(a, b);
            if (compatibility.status === "prohibited" || (compatibility.status === "requires-event-approval" && !(approvals.has(a) && approvals.has(b))))
                problems.push({ pair: [a, b], result: compatibility });
        }
    return { legal: problems.length === 0, problems };
}
export function buildCompatibilityMatrix() {
    return Object.fromEntries(MODULES.map((a) => [a, Object.fromEntries(MODULES.map((b) => [b, modulePairCompatibility(a, b)]))]));
}
export function runIntegrationScenarios(scenarios) {
    const results = scenarios.map((scenario) => {
        const validation = validateModuleConfiguration(scenario.modules, scenario.eventApproved ?? []);
        return { ...scenario, legal: validation.legal, status: validation.legal === scenario.expectedLegal ? "PASS" : "FAIL", configurationHash: hashCanonical({ modules: [...new Set(scenario.modules)].sort(), approvals: [...new Set(scenario.eventApproved ?? [])].sort() }), problems: validation.problems };
    });
    return { results, aggregateHash: hashCanonical(results.map(({ id, status, configurationHash, preservedProperties }) => ({ id, status, configurationHash, preservedProperties }))) };
}
export const DEFAULT_INTEGRATION_SCENARIOS = [
    { id: "IM-001", modules: ["first-contact", "traps"], expectedLegal: false, preservedProperties: ["configuration rejected before setup"] },
    { id: "IM-002", modules: ["battle-realm", "traps"], expectedLegal: true, preservedProperties: ["Trap reveal is not an Eight play", "Spec uses remain per player"] },
    { id: "IM-003", modules: ["battle-realm", "multiplayer"], expectedLegal: true, preservedProperties: ["opponent means Enemy", "continuous bonuses aggregate only at team endgame"] },
    { id: "IM-004", modules: ["traps", "multiplayer"], expectedLegal: true, preservedProperties: ["per-player Trap cap", "global module-3 counter cap"] },
    { id: "IM-005", modules: ["battle-realm", "time-bomb"], expectedLegal: true, preservedProperties: ["stage contribution separate from Calculated Court", "tapped Fuse advances"] },
    { id: "IM-006", modules: ["deffy-mode", "time-bomb"], expectedLegal: true, preservedProperties: ["drafted Queen is not a Bomb until scored"] },
    { id: "IM-007", modules: ["tournament-seed", "traps"], expectedLegal: false, preservedProperties: ["no Ban Pile or partial hand on rejection"] },
    { id: "IM-008", modules: ["tournament-seed", "battle-realm"], eventApproved: ["tournament-seed", "battle-realm"], expectedLegal: true, preservedProperties: ["Tournament Seed setup controls", "BattleRealm caps remain absolute"] },
    { id: "IM-009", modules: ["battle-realm", "traps", "multiplayer"], expectedLegal: true, preservedProperties: ["multiplayer priority", "Trap visibility", "Spec modifier ownership"] },
    { id: "IM-010", modules: ["battle-realm", "traps", "multiplayer", "time-bomb"], expectedLegal: true, preservedProperties: ["signed score", "hidden Trap identity", "per-player limits", "current-controller Fuse"] }
];
export function renderCompatibilityMatrixMarkdown() {
    const matrix = buildCompatibilityMatrix();
    const labels = MODULES;
    const icon = (status) => status === "compatible" ? "OK" : status === "compatible-with-rule" ? "RULE" : status === "requires-event-approval" ? "APPROVAL" : "NO";
    const rows = labels.map((a) => `| ${a} | ${labels.map((b) => icon(matrix[a][b].status)).join(" | ")} |`).join("\n");
    return `# Intrilex Module Compatibility Matrix\n\n| Module | ${labels.join(" | ")} |\n|---|${labels.map(() => "---").join("|")}|\n${rows}\n\nLegend: OK = compatible; RULE = compatible with explicit interaction rule; APPROVAL = event approval required; NO = prohibited.\n\nCanonical digest: \`${hashCanonical(canonicalize(matrix))}\`\n`;
}
//# sourceMappingURL=phase18.js.map