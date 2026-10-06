import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalize } from "./canonical-json.js";
import { loadFixtures } from "./conformance.js";
import { IntrilexEngine } from "./engine.js";
import { hashCanonical } from "./hash.js";
import { parseCertifiedReplay, publicCertifiedReplayView, verifyCertifiedReplay } from "./phase16.js";
const FIXTURE_FILES = [
    "phase2-4-conformance.json", "phase5-lifecycle-conformance.json", "phase6-rank-conformance.json",
    "phase7-interactions-conformance.json", "phase8-ultras-rank10-voltage-endgames.json",
    "phase9-first-contact-profile.json", "phase10-trap-module.json", "phase11-multiplayer-teams.json",
    "phase12-battlerealm.json", "phase13-time-bomb.json", "phase14-deffy-mode.json", "phase15-tournament-seed.json",
    "phase20-canonical-closure.json"
];
function invalidProbe(id) {
    return { id: `FUZZ-${id}`, type: "DECLARE_PLAY", actorId: "__UNKNOWN_PLAYER__", play: { kind: "fuzz-invalid", controllerId: "__UNKNOWN_PLAYER__", sourceCardIds: [], targetCardIds: [], requirements: [], revalidationClass: "none", instructions: [] } };
}
async function readJson(file) { return JSON.parse(await readFile(file, "utf8")); }
export async function runReleaseCandidateCertification(projectRoot) {
    const replayFiles = (await readdir(path.join(projectRoot, "replays"))).filter(name => name.endsWith(".certified.replay.json") && !name.endsWith(".public.certified.replay.json")).sort();
    const publicLeakFailures = [];
    for (const name of replayFiles) {
        const replay = parseCertifiedReplay(await readFile(path.join(projectRoot, "replays", name), "utf8"));
        verifyCertifiedReplay(replay);
        const publicText = canonicalize(publicCertifiedReplayView(replay));
        for (const token of ["rngBefore", "rngAfter", "stateHashBefore", "stateHashAfter", "initialStateHash", "finalStateHash", "selectedCardId"])
            if (publicText.includes(token))
                publicLeakFailures.push(`${name}: leaked ${token}`);
        if (replay.fixtureId === "CT-120" && (publicText.includes("A♠") || publicText.includes("K♣")))
            publicLeakFailures.push(`${name}: leaked CT-120 private identity`);
    }
    const engine = new IntrilexEngine();
    const invariantFuzzFailures = [];
    let invariantFuzzCases = 0;
    const sourceIds = [];
    for (const file of FIXTURE_FILES)
        for (const fixture of await loadFixtures(path.join(projectRoot, "fixtures", file))) {
            sourceIds.push(fixture.sourceTestId);
            for (let repeat = 0; repeat < 5; repeat += 1) {
                invariantFuzzCases += 1;
                const before = hashCanonical(fixture.initialState);
                const result = engine.execute(fixture.initialState, invalidProbe(`${fixture.id}-${repeat}`));
                if (result.accepted || result.events.length !== 0 || hashCanonical(result.state) !== before)
                    invariantFuzzFailures.push(`${fixture.id}#${repeat}`);
            }
        }
    const counts = new Map();
    sourceIds.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1));
    const canonical = Array.from({ length: 120 }, (_, i) => `CT-${String(i + 1).padStart(3, "0")}`);
    const sourceSet = new Set(sourceIds);
    const missingSourceIds = canonical.filter(id => !sourceSet.has(id));
    const duplicateSourceIds = [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id).sort();
    const independent = await readJson(path.join(projectRoot, "reports", "independent-python-replay-verification.json"));
    const preserved = await readJson(path.join(projectRoot, "reports", "phase2-18-regression-report.json"));
    const combined = await readJson(path.join(projectRoot, "reports", "conformance-report.json"));
    const simulation = await readJson(path.join(projectRoot, "reports", "simulation-baseline.json"));
    const boundaries = [
        "The Phase 19 campaign is a reproducible legal First Contact action-subset study under declared policies; it is not a claim of solved optimal play or complete advanced-module metagame balance.",
        "CT-063 intentionally has two provenance-separated executable projections because historical engine certification and the canon-locked upstream suite reused that identifier for different semantics.",
        "The Python verifier is an independent runtime and hash/checkpoint implementation; gameplay semantics remain authoritative in the TypeScript engine and are reproduced from every certified command stream there."
    ];
    const core = {
        engineVersion: "4.1.0", certifiedReplayCount: replayFiles.length, publicLeakFailures, invariantFuzzCases, invariantFuzzFailures,
        sourceTestCoverage: { canonicalTotal: 120, uniqueSourceIds: sourceSet.size, missingSourceIds, duplicateSourceIds },
        independentRuntime: { runtime: independent.runtime, verifiedPairCount: independent.verifiedPairCount, failureCount: independent.failureCount, aggregateHash: independent.aggregateHash },
        preservedPhase218Aggregate: preserved.aggregateHash, finalConformanceAggregate: combined.aggregateHash,
        simulationCampaignHash: simulation.fullMatchCampaign?.campaignHash ?? "missing", interpretationBoundaries: boundaries
    };
    const pass = replayFiles.length === 121 && publicLeakFailures.length === 0 && invariantFuzzFailures.length === 0 && sourceSet.size === 120 && missingSourceIds.length === 0 && independent.verdict === "PASS" && independent.verifiedPairCount === 121 && independent.failureCount === 0 && simulation.deterministicReproduction?.matched === true;
    const report = { verdict: pass ? "PASS" : "FAIL", ...core, aggregateHash: hashCanonical(core) };
    await mkdir(path.join(projectRoot, "reports"), { recursive: true });
    for (const base of ["final-release-certification", "release-candidate-certification"]) {
        await writeFile(path.join(projectRoot, "reports", `${base}.json`), JSON.stringify(report, null, 2) + "\n", "utf8");
        const md = `# Intrilex v4.1 Final Headless Engine Certification\n\n**Verdict: ${report.verdict}**\n\n- Engine: \`${report.engineVersion}\`\n- Certified authorized replays: **${report.certifiedReplayCount}/121**\n- Canonical source IDs: **${report.sourceTestCoverage.uniqueSourceIds}/120**\n- Missing source IDs: **${report.sourceTestCoverage.missingSourceIds.length}**\n- Invalid-command invariant probes: **${report.invariantFuzzCases}**\n- Public leak failures: **${report.publicLeakFailures.length}**\n- Independent runtime: \`${report.independentRuntime.runtime}\`, **${report.independentRuntime.verifiedPairCount}/121** pairs\n- Preserved Phase 2–18 aggregate: \`${report.preservedPhase218Aggregate}\`\n- Final conformance aggregate: \`${report.finalConformanceAggregate}\`\n- Simulation campaign: \`${report.simulationCampaignHash}\`\n- Certification aggregate: \`${report.aggregateHash}\`\n\n## Interpretation boundaries\n\n${boundaries.map(x => `- ${x}`).join("\n")}\n`;
        await writeFile(path.join(projectRoot, "reports", `${base}.md`), md, "utf8");
    }
    return report;
}
//# sourceMappingURL=certification.js.map