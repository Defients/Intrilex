import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { runConformance } from "./conformance.js";
import { replayAndVerify } from "./replay.js";
import { parseCertifiedReplay, publicCertifiedReplayView, verifyCertifiedReplay } from "./phase16.js";
import { buildJudgePacket, renderPrintableStateAid } from "./phase17.js";
import { DEFAULT_INTEGRATION_SCENARIOS, renderCompatibilityMatrixMarkdown, runIntegrationScenarios } from "./phase18.js";
import { runSimulationBaseline } from "./simulation.js";
import { runReleaseCandidateCertification } from "./certification.js";
import { validateRelease } from "./validate-release.js";
import type { CertifiedReplayEnvelope, ReplayEnvelope } from "./types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const command = process.argv[2] ?? "conformance";

if (command === "conformance") {
  const report = await runConformance(root, 7);
  console.log(`CONFORMANCE ${report.failed === 0 ? "PASS" : "FAIL"}: ${report.passed}/${report.fixtureCount}; aggregate=${report.aggregateHash}`);
  process.exitCode = report.failed === 0 ? 0 : 1;
} else if (command === "validate") {
  const report = await validateRelease(root);
  console.log(`VALIDATION ${report.verdict}: ${report.checks.filter((check) => check.status === "PASS").length}/${report.checks.length}`);
  process.exitCode = report.verdict === "PASS" ? 0 : 1;
} else if (command === "replay") {
  const file = process.argv[3] ?? path.join(root, "replays", "CT-120.certified.replay.json");
  const text = await readFile(file, "utf8");
  const parsed = JSON.parse(text) as ReplayEnvelope | CertifiedReplayEnvelope;
  if (parsed.version === 2) {
    const replay = parseCertifiedReplay(text);
    const result = verifyCertifiedReplay(replay);
    console.log(`CERTIFIED REPLAY PASS: ${replay.fixtureId}; events=${result.events.length}; final=${replay.finalStateHash}; public=${publicCertifiedReplayView(replay).publicContentHash}`);
  } else {
    const result = replayAndVerify(parsed as ReplayEnvelope);
    console.log(`REPLAY PASS: ${parsed.fixtureId}; events=${result.events.length}; final=${parsed.finalStateHash}`);
  }
} else if (command === "judge") {
  const replayFile = process.argv[3] ?? path.join(root, "replays", "CT-094.certified.replay.json");
  const replay = parseCertifiedReplay(await readFile(replayFile, "utf8"));
  const state = verifyCertifiedReplay(replay).state;
  console.log(renderPrintableStateAid(state));
  console.log(`JUDGE PACKET HASH: ${JSON.stringify(buildJudgePacket(state)).length} bytes`);
} else if (command === "integration") {
  const report = runIntegrationScenarios(DEFAULT_INTEGRATION_SCENARIOS);
  console.log(renderCompatibilityMatrixMarkdown());
  console.log(`INTEGRATION ${report.results.every((entry) => entry.status === "PASS") ? "PASS" : "FAIL"}: ${report.results.filter((entry) => entry.status === "PASS").length}/${report.results.length}; aggregate=${report.aggregateHash}`);
  process.exitCode = report.results.every((entry) => entry.status === "PASS") ? 0 : 1;
} else if (command === "simulate") {
  const report = await runSimulationBaseline(root);
  console.log(`SIMULATION PASS: scenarios=${String((report.scenarioBaseline as Record<string, unknown>).scenarioCount)}; matches=${String((report.fullMatchCampaign as Record<string, unknown>).matchCount)}; catalog=${report.catalogHash}`);
} else if (command === "certify") {
  const report = await runReleaseCandidateCertification(root);
  console.log(`FINAL CERTIFICATION ${report.verdict}: replays=${report.certifiedReplayCount}; fuzz=${report.invariantFuzzCases}; sourceIds=${report.sourceTestCoverage.uniqueSourceIds}/120; python=${report.independentRuntime.verifiedPairCount}; aggregate=${report.aggregateHash}`);
  process.exitCode = report.verdict === "PASS" ? 0 : 1;
} else {
  console.error(`Unknown command: ${command}`);
  process.exitCode = 2;
}
