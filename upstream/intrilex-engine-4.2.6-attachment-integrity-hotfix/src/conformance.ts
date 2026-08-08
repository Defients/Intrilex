import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalize } from "./canonical-json.js";
import { hashCanonical, sha256Text } from "./hash.js";
import { createReplay, replayAndVerify, runCommands } from "./replay.js";
import { createCertifiedReplay, publicCertifiedReplayView, verifyCertifiedReplay } from "./phase16.js";
import { publicReplayView } from "./views.js";
import { parseFixtures, roundTripState, validateState } from "./validation.js";
import { deriveSecuredPoints } from "./state.js";
import type { ConformanceFixture, EngineState, ReplayEnvelope } from "./types.js";

export interface FixtureRunReport {
  id: string;
  title: string;
  status: "PASS" | "FAIL";
  repeatedRuns: number;
  initialStateHash: string;
  finalStateHash: string;
  eventLogHash: string;
  replayHash: string;
  accepted: boolean[];
  failures: string[];
}

export interface ConformanceReport {
  reportVersion: 1;
  rulesVersion: "4.1";
  engineVersion: string;
  fixtureFiles: string[];
  fixtureCount: number;
  repeatCount: number;
  passed: number;
  failed: number;
  deterministic: boolean;
  fixtures: FixtureRunReport[];
  aggregateHash: string;
}

const ENGINE_VERSION = "4.1.0";

function equal(a: unknown, b: unknown): boolean {
  return canonicalize(a) === canonicalize(b);
}

function assertExpectation(fixture: ConformanceFixture, state: EngineState, accepted: boolean[]): string[] {
  const failures: string[] = [];
  const exp = fixture.expectation;
  if (exp.accepted !== undefined && !equal(exp.accepted, accepted)) failures.push(`accepted mismatch: expected ${canonicalize(exp.accepted)}, got ${canonicalize(accepted)}`);
  const final = exp.final;
  if (final.hands !== undefined) {
    for (const [playerId, expected] of Object.entries(final.hands)) {
      const actual = state.players[playerId]?.hand;
      if (!equal(expected, actual)) failures.push(`hand ${playerId}: expected ${canonicalize(expected)}, got ${canonicalize(actual)}`);
    }
  }
  if (final.playerZones !== undefined) {
    for (const [playerId, expectedZones] of Object.entries(final.playerZones)) {
      const player = state.players[playerId];
      if (!player) { failures.push(`missing player ${playerId}`); continue; }
      for (const field of ["hand", "pr", "er"] as const) {
        const expected = expectedZones[field];
        if (expected !== undefined && !equal(expected, player[field])) failures.push(`${playerId}.${field}: expected ${canonicalize(expected)}, got ${canonicalize(player[field])}`);
      }
    }
  }
  if (final.goals !== undefined) {
    for (const [playerId, expected] of Object.entries(final.goals)) {
      const actual = state.players[playerId]?.goal;
      if (actual !== expected) failures.push(`goal ${playerId}: expected ${expected}, got ${actual}`);
    }
  }
  if (final.securedPoints !== undefined) {
    for (const [playerId, expected] of Object.entries(final.securedPoints)) {
      const actual = deriveSecuredPoints(state, playerId);
      if (actual !== expected) failures.push(`secured points ${playerId}: expected ${expected}, got ${actual}`);
    }
  }
  if (final.playerLimits !== undefined) {
    for (const [playerId, expected] of Object.entries(final.playerLimits)) {
      const actual = state.players[playerId]?.limits;
      if (!actual) { failures.push(`missing limits for ${playerId}`); continue; }
      for (const [key, value] of Object.entries(expected)) {
        if (!equal(actual[key as keyof typeof actual], value)) failures.push(`limit ${playerId}.${key}: expected ${canonicalize(value)}, got ${canonicalize(actual[key as keyof typeof actual])}`);
      }
    }
  }
  if (final.zones !== undefined) {
    for (const [zone, expected] of Object.entries(final.zones)) {
      const actual = state.zones[zone as keyof typeof state.zones];
      if (!equal(expected, actual)) failures.push(`zone ${zone}: expected ${canonicalize(expected)}, got ${canonicalize(actual)}`);
    }
  }
  if (final.cardZones !== undefined) {
    for (const [cardId, expected] of Object.entries(final.cardZones)) {
      const actual = state.cards[cardId]?.zone;
      if (actual !== expected) failures.push(`card zone ${cardId}: expected ${expected}, got ${actual}`);
    }
  }
  if (final.controllers !== undefined) {
    for (const [cardId, expected] of Object.entries(final.controllers)) {
      const actual = state.cards[cardId]?.controllerId;
      if (actual !== expected) failures.push(`controller ${cardId}: expected ${expected}, got ${actual}`);
    }
  }
  if (final.originalOwners !== undefined) {
    for (const [cardId, expected] of Object.entries(final.originalOwners)) {
      const actual = state.cards[cardId]?.originalOwnerId;
      if (actual !== expected) failures.push(`original owner ${cardId}: expected ${expected}, got ${actual}`);
    }
  }
  if (final.activePlayerId !== undefined && state.activePlayerId !== final.activePlayerId) failures.push(`active player: expected ${final.activePlayerId}, got ${state.activePlayerId}`);
  if (final.fullTurnSequence !== undefined && state.fullTurnSequence !== final.fullTurnSequence) failures.push(`full turn sequence: expected ${final.fullTurnSequence}, got ${state.fullTurnSequence}`);
  if (final.startPhaseSequenceByPlayer !== undefined) {
    for (const [playerId, expected] of Object.entries(final.startPhaseSequenceByPlayer)) {
      const actual = state.startPhaseSequenceByPlayer[playerId];
      if (actual !== expected) failures.push(`start sequence ${playerId}: expected ${expected}, got ${actual}`);
    }
  }
  if (final.phase !== undefined && state.phase !== final.phase) failures.push(`phase: expected ${final.phase}, got ${state.phase}`);
  if (final.winner !== undefined && state.winner !== final.winner) failures.push(`winner: expected ${final.winner}, got ${state.winner}`);
  if (final.stackDepth !== undefined && state.stack.length !== final.stackDepth) failures.push(`stackDepth: expected ${final.stackDepth}, got ${state.stack.length}`);
  if (final.triggerQueueDepth !== undefined && state.triggerQueue.length !== final.triggerQueueDepth) failures.push(`triggerQueueDepth: expected ${final.triggerQueueDepth}, got ${state.triggerQueue.length}`);
  if (final.markers !== undefined) {
    for (const [cardId, expected] of Object.entries(final.markers)) {
      const actual = state.cards[cardId]?.state;
      for (const [key, value] of Object.entries(expected)) {
        if (!equal(actual?.[key], value)) failures.push(`marker ${cardId}.${key}: expected ${canonicalize(value)}, got ${canonicalize(actual?.[key])}`);
      }
    }
  }
  if (final.absentMarkers !== undefined) {
    for (const [cardId, keys] of Object.entries(final.absentMarkers)) {
      const actual = state.cards[cardId]?.state;
      for (const key of keys) {
        if (actual !== undefined && Object.prototype.hasOwnProperty.call(actual, key)) failures.push(`marker ${cardId}.${key}: expected absent, got ${canonicalize(actual[key])}`);
      }
    }
  }
  if (final.metadata !== undefined) {
    for (const [key, value] of Object.entries(final.metadata)) {
      if (!equal(state.metadata[key], value)) failures.push(`metadata ${key}: expected ${canonicalize(value)}, got ${canonicalize(state.metadata[key])}`);
    }
  }
  return failures;
}

function assertCt120PublicRedaction(replay: ReplayEnvelope): string[] {
  if (replay.fixtureId !== "CT-120") return [];
  const text = canonicalize(publicReplayView(replay));
  const failures: string[] = [];
  if (text.includes("selectedCardId")) failures.push("CT-120 public replay leaked hidden choice key selectedCardId");
  if (text.includes('"A♠"') || text.includes('"K♣"')) failures.push("CT-120 public replay leaked a private hand identity");
  if (!text.includes("redacted")) failures.push("CT-120 public replay contains no redaction marker");
  return failures;
}

export async function loadFixtures(fixturePath: string): Promise<ConformanceFixture[]> {
  const raw = await readFile(fixturePath, "utf8");
  return parseFixtures(JSON.parse(raw) as unknown);
}

async function executeFixture(projectRoot: string, fixture: ConformanceFixture, repeatCount: number): Promise<FixtureRunReport> {
  const failures: string[] = [];
  const initialValidation = validateState(fixture.initialState);
  if (initialValidation.length > 0) failures.push(`initial validation failed: ${canonicalize(initialValidation)}`);
  const roundTripped = roundTripState(fixture.initialState);
  if (!equal(roundTripped, fixture.initialState)) failures.push("round-trip serialization changed initial state");

  const first = runCommands(fixture.initialState, fixture.commands);
  failures.push(...assertExpectation(fixture, first.state, first.accepted));
  const replay = createReplay(fixture.id, fixture.initialState, fixture.commands, first);
  try { replayAndVerify(replay); } catch (error) { failures.push(`replay verification failed: ${error instanceof Error ? error.message : String(error)}`); }
  failures.push(...assertCt120PublicRedaction(replay));

  const signature = canonicalize({
    accepted: first.accepted,
    finalState: first.state,
    events: first.events,
    finalStateHash: replay.finalStateHash,
    eventLogHash: replay.eventLogHash
  });
  for (let run = 2; run <= repeatCount; run += 1) {
    const current = runCommands(fixture.initialState, fixture.commands);
    const currentReplay = createReplay(fixture.id, fixture.initialState, fixture.commands, current);
    const currentSignature = canonicalize({
      accepted: current.accepted,
      finalState: current.state,
      events: current.events,
      finalStateHash: currentReplay.finalStateHash,
      eventLogHash: currentReplay.eventLogHash
    });
    if (currentSignature !== signature) failures.push(`run ${run} diverged from run 1`);
  }

  await writeFile(path.join(projectRoot, "replays", `${fixture.id}.replay.json`), JSON.stringify(replay, null, 2) + "\n", "utf8");
  await writeFile(path.join(projectRoot, "replays", `${fixture.id}.public.replay.json`), JSON.stringify(publicReplayView(replay), null, 2) + "\n", "utf8");
  const certified = createCertifiedReplay(fixture.id, fixture.initialState, fixture.commands);
  try { verifyCertifiedReplay(certified); } catch (error) { failures.push(`certified replay verification failed: ${error instanceof Error ? error.message : String(error)}`); }
  await writeFile(path.join(projectRoot, "replays", `${fixture.id}.certified.replay.json`), JSON.stringify(certified, null, 2) + "\n", "utf8");
  await writeFile(path.join(projectRoot, "replays", `${fixture.id}.public.certified.replay.json`), JSON.stringify(publicCertifiedReplayView(certified), null, 2) + "\n", "utf8");

  return {
    id: fixture.id,
    title: fixture.title,
    status: failures.length === 0 ? "PASS" : "FAIL",
    repeatedRuns: repeatCount,
    initialStateHash: replay.initialStateHash,
    finalStateHash: replay.finalStateHash,
    eventLogHash: replay.eventLogHash,
    replayHash: hashCanonical(replay),
    accepted: first.accepted,
    failures
  };
}

function buildReport(fixtureFiles: string[], reports: FixtureRunReport[], repeatCount: number): ConformanceReport {
  const aggregateBody = reports.map(({ id, status, initialStateHash, finalStateHash, eventLogHash, replayHash }) => ({ id, status, initialStateHash, finalStateHash, eventLogHash, replayHash }));
  return {
    reportVersion: 1,
    rulesVersion: "4.1",
    engineVersion: ENGINE_VERSION,
    fixtureFiles,
    fixtureCount: reports.length,
    repeatCount,
    passed: reports.filter((entry) => entry.status === "PASS").length,
    failed: reports.filter((entry) => entry.status === "FAIL").length,
    deterministic: reports.every((entry) => entry.status === "PASS"),
    fixtures: reports,
    aggregateHash: sha256Text(canonicalize(aggregateBody))
  };
}

async function writeReport(projectRoot: string, report: ConformanceReport, basename: string, title: string): Promise<void> {
  await writeFile(path.join(projectRoot, "reports", `${basename}.json`), JSON.stringify(report, null, 2) + "\n", "utf8");
  const rows = report.fixtures.map((entry) => `| ${entry.id} | ${entry.status} | \`${entry.finalStateHash}\` | \`${entry.eventLogHash}\` |`).join("\n");
  const markdown = `# ${title}\n\n- Verdict: **${report.failed === 0 ? "PASS" : "FAIL"}**\n- Engine: \`${report.engineVersion}\`\n- Fixtures: ${report.passed}/${report.fixtureCount} passed\n- Repetitions per fixture: ${report.repeatCount}\n- Aggregate hash: \`${report.aggregateHash}\`\n\n| Fixture | Status | Final state SHA-256 | Event log SHA-256 |\n|---|---|---|---|\n${rows}\n`;
  await writeFile(path.join(projectRoot, "reports", `${basename}.md`), markdown, "utf8");
}

export async function runConformance(projectRoot: string, repeatCount = 5): Promise<ConformanceReport> {
  const suiteFiles = ["fixtures/phase2-4-conformance.json", "fixtures/phase5-lifecycle-conformance.json", "fixtures/phase6-rank-conformance.json", "fixtures/phase7-interactions-conformance.json", "fixtures/phase8-ultras-rank10-voltage-endgames.json", "fixtures/phase9-first-contact-profile.json", "fixtures/phase10-trap-module.json", "fixtures/phase11-multiplayer-teams.json", "fixtures/phase12-battlerealm.json", "fixtures/phase13-time-bomb.json", "fixtures/phase14-deffy-mode.json", "fixtures/phase15-tournament-seed.json", "fixtures/phase20-canonical-closure.json"];
  await mkdir(path.join(projectRoot, "replays"), { recursive: true });
  await mkdir(path.join(projectRoot, "reports"), { recursive: true });

  const suiteReports: { file: string; reports: FixtureRunReport[] }[] = [];
  for (const file of suiteFiles) {
    const fixtures = await loadFixtures(path.join(projectRoot, file));
    const reports: FixtureRunReport[] = [];
    for (const fixture of fixtures) reports.push(await executeFixture(projectRoot, fixture, repeatCount));
    suiteReports.push({ file, reports });
  }

  const phase24 = buildReport([suiteFiles[0]!], suiteReports[0]!.reports, repeatCount);
  const phase5 = buildReport([suiteFiles[1]!], suiteReports[1]!.reports, repeatCount);
  const phase25 = buildReport(suiteFiles.slice(0, 2), suiteReports.slice(0, 2).flatMap((suite) => suite.reports), repeatCount);
  const phase6 = buildReport([suiteFiles[2]!], suiteReports[2]!.reports, repeatCount);
  const phase26 = buildReport(suiteFiles.slice(0, 3), suiteReports.slice(0, 3).flatMap((suite) => suite.reports), repeatCount);
  const phase7Order = ["CT-020","CT-022","CT-039","CT-040","CT-041","CT-042","CT-055","CT-056","CT-057","CT-058","CT-059","CT-060","CT-061","CT-062","CT-063","CT-071"];
  const phase7Map = new Map([...suiteReports[3]!.reports, ...suiteReports[2]!.reports.filter((entry) => entry.id === "CT-071")].map((entry) => [entry.id, entry]));
  const phase7Reports = phase7Order.map((id) => phase7Map.get(id)).filter((entry): entry is FixtureRunReport => entry !== undefined);
  const phase7 = buildReport([suiteFiles[3]!, `${suiteFiles[2]}#CT-071`], phase7Reports, repeatCount);
  const phase8Order = ["CT-015","CT-017","CT-018","CT-019","CT-033","CT-073","CT-074","CT-075","CT-076","CT-077","CT-078","CT-079","CT-080","CT-081","CT-082","CT-083","CT-084","CT-085","CT-086","CT-087","CT-088","CT-089","CT-090","CT-091","CT-092"];
  const phase8Map = new Map([...suiteReports[4]!.reports, ...suiteReports[2]!.reports.filter((entry) => phase8Order.includes(entry.id))].map((entry) => [entry.id, entry]));
  const phase8Reports = phase8Order.map((id) => phase8Map.get(id)).filter((entry): entry is FixtureRunReport => entry !== undefined);
  const phase8 = buildReport([suiteFiles[4]!, `${suiteFiles[2]}#CT-073-CT-081`], phase8Reports, repeatCount);
  const phase27 = buildReport(suiteFiles.slice(0, 4), suiteReports.slice(0, 4).flatMap((suite) => suite.reports), repeatCount);
  const phase28 = buildReport(suiteFiles.slice(0, 5), suiteReports.slice(0, 5).flatMap((suite) => suite.reports), repeatCount);
  const phase9 = buildReport([suiteFiles[5]!], suiteReports[5]!.reports, repeatCount);
  const phase29 = buildReport(suiteFiles.slice(0, 6), suiteReports.slice(0, 6).flatMap((suite) => suite.reports), repeatCount);
  const phase10Order = ["CT-011","CT-016","CT-024","CT-031","CT-094","CT-095","CT-096","CT-097","CT-098","CT-099"];
  const phase10Map = new Map([...suiteReports[6]!.reports, ...suiteReports[0]!.reports.filter((entry) => phase10Order.includes(entry.id))].map((entry) => [entry.id, entry]));
  const phase10Reports = phase10Order.map((id) => phase10Map.get(id)).filter((entry): entry is FixtureRunReport => entry !== undefined);
  const phase10 = buildReport([suiteFiles[6]!, `${suiteFiles[0]}#CT-011-CT-031`], phase10Reports, repeatCount);
  const phase210 = buildReport(suiteFiles.slice(0, 7), suiteReports.slice(0, 7).flatMap((suite) => suite.reports), repeatCount);
  const phase11 = buildReport([suiteFiles[7]!], suiteReports[7]!.reports, repeatCount);
  const phase211 = buildReport(suiteFiles.slice(0, 8), suiteReports.slice(0, 8).flatMap((suite) => suite.reports), repeatCount);
  const phase12Order = ["CT-001","CT-002","CT-003","CT-106","CT-107","CT-108","CT-109","CT-110","CT-117","CT-118"];
  const phase12Map = new Map([...suiteReports[8]!.reports, ...suiteReports[7]!.reports.filter((entry) => entry.id === "CT-109")].map((entry) => [entry.id, entry]));
  const phase12Reports = phase12Order.map((id) => phase12Map.get(id)).filter((entry): entry is FixtureRunReport => entry !== undefined);
  const phase12 = buildReport([suiteFiles[8]!, `${suiteFiles[7]}#CT-109`], phase12Reports, repeatCount);
  const phase13Order = ["CT-001","CT-002","CT-003","CT-012","CT-111","CT-112","CT-113","CT-114","CT-118"];
  const phase13Map = new Map([
    ...suiteReports[9]!.reports,
    ...suiteReports[8]!.reports.filter((entry) => ["CT-001","CT-002","CT-003","CT-118"].includes(entry.id)),
    ...suiteReports[7]!.reports.filter((entry) => entry.id === "CT-114")
  ].map((entry) => [entry.id, entry]));
  const phase13Reports = phase13Order.map((id) => phase13Map.get(id)).filter((entry): entry is FixtureRunReport => entry !== undefined);
  const phase13 = buildReport([suiteFiles[9]!, `${suiteFiles[8]}#CT-001-CT-003,CT-118`, `${suiteFiles[7]}#CT-114`], phase13Reports, repeatCount);
  const phase212 = buildReport(suiteFiles.slice(0, 9), suiteReports.slice(0, 9).flatMap((suite) => suite.reports), repeatCount);
  const phase213 = buildReport(suiteFiles.slice(0, 10), suiteReports.slice(0, 10).flatMap((suite) => suite.reports), repeatCount);
  const phase14Order = ["CT-014","CT-115","CT-116"];
  const phase14Map = new Map([
    ...suiteReports[10]!.reports,
    ...suiteReports[7]!.reports.filter((entry) => entry.id === "CT-014")
  ].map((entry) => [entry.id, entry]));
  const phase14Reports = phase14Order.map((id) => phase14Map.get(id)).filter((entry): entry is FixtureRunReport => entry !== undefined);
  const phase14 = buildReport([suiteFiles[10]!, `${suiteFiles[7]}#CT-014`], phase14Reports, repeatCount);
  const phase214 = buildReport(suiteFiles.slice(0, 11), suiteReports.slice(0, 11).flatMap((suite) => suite.reports), repeatCount);
  const phase15 = buildReport([suiteFiles[11]!], suiteReports[11]!.reports, repeatCount);
  const phase218Regression = buildReport(suiteFiles.slice(0, 12), suiteReports.slice(0, 12).flatMap((suite) => suite.reports), repeatCount);
  const phase20 = buildReport([suiteFiles[12]!], suiteReports[12]!.reports, repeatCount);
  const allReports = suiteReports.flatMap((suite) => suite.reports);
  const allMap = new Map(allReports.map((entry) => [entry.id, entry]));
  const phase16Order = ["CT-091","CT-109","CT-116","CT-120"];
  const phase17Order = ["CT-005","CT-014","CT-022","CT-024","CT-031","CT-094","CT-097","CT-115","CT-120"];
  const phase18Order = ["CT-001","CT-002","CT-003","CT-004","CT-005","CT-014","CT-017","CT-025","CT-089","CT-103","CT-104","CT-105","CT-117","CT-118","CT-119"];
  const select = (ids: string[]) => ids.map((id) => allMap.get(id)).filter((entry): entry is FixtureRunReport => entry !== undefined);
  const phase16 = buildReport(["certified replay gate over existing fixture corpus"], select(phase16Order), repeatCount);
  const phase17 = buildReport(["judge-tools gate over existing fixture corpus"], select(phase17Order), repeatCount);
  const phase18 = buildReport(["cross-module integration gate over existing fixture corpus"], select(phase18Order), repeatCount);
  const combined = buildReport(suiteFiles, allReports, repeatCount);
  await writeReport(projectRoot, phase24, "phase2-4-regression-report", "Intrilex v4.1 Phase 2–4 Regression Report");
  await writeReport(projectRoot, phase5, "phase5-lifecycle-conformance-report", "Intrilex v4.1 Phase 5 Lifecycle Conformance Report");
  await writeReport(projectRoot, phase25, "phase2-5-regression-report", "Intrilex v4.1 Phase 2–5 Regression Report");
  await writeReport(projectRoot, phase6, "phase6-rank-conformance-report", "Intrilex v4.1 Phase 6 Core Rank Regression Report");
  await writeReport(projectRoot, phase26, "phase2-6-regression-report", "Intrilex v4.1 Phase 2–6 Regression Report");
  await writeReport(projectRoot, phase7, "phase7-interaction-conformance-report", "Intrilex v4.1 Phase 7 Protection, Scuttle, Counter, and Attachment Conformance Report");
  await writeReport(projectRoot, phase27, "phase2-7-regression-report", "Intrilex v4.1 Phase 2–7 Regression Report");
  await writeReport(projectRoot, phase8, "phase8-ultras-rank10-voltage-endgames-report", "Intrilex v4.1 Phase 8 Ultras, Rank 10, Voltage, and Endgames Conformance Report");
  await writeReport(projectRoot, phase28, "phase2-8-regression-report", "Intrilex v4.1 Phase 2–8 Regression Report");
  await writeReport(projectRoot, phase9, "phase9-first-contact-profile-report", "Intrilex v4.1 Phase 9 First Contact Profile Conformance Report");
  await writeReport(projectRoot, phase29, "phase2-9-regression-report", "Intrilex v4.1 Phase 2–9 Regression Report");
  await writeReport(projectRoot, phase10, "phase10-trap-module-report", "Intrilex v4.1 Phase 10 Trap Module Conformance Report");
  await writeReport(projectRoot, phase210, "phase2-10-regression-report", "Intrilex v4.1 Phase 2–10 Regression Report");
  await writeReport(projectRoot, phase11, "phase11-multiplayer-teams-report", "Intrilex v4.1 Phase 11 Multiplayer and Teams Conformance Report");
  await writeReport(projectRoot, phase211, "phase2-11-regression-report", "Intrilex v4.1 Phase 2–11 Regression Report");
  await writeReport(projectRoot, phase12, "phase12-battlerealm-report", "Intrilex v4.1 Phase 12 BattleRealm Conformance Report");
  await writeReport(projectRoot, phase212, "phase2-12-regression-report", "Intrilex v4.1 Phase 2–12 Regression Report");
  await writeReport(projectRoot, phase13, "phase13-time-bomb-report", "Intrilex v4.1 Phase 13 Time Bomb Conformance Report");
  await writeReport(projectRoot, phase213, "phase2-13-regression-report", "Intrilex v4.1 Phase 2–13 Regression Report");
  await writeReport(projectRoot, phase14, "phase14-deffy-mode-report", "Intrilex v4.1 Phase 14 Deffy Mode Conformance Report");
  await writeReport(projectRoot, phase214, "phase2-14-regression-report", "Intrilex v4.1 Phase 2–14 Regression Report");
  await writeReport(projectRoot, phase15, "phase15-tournament-seed-report", "Intrilex v4.1 Phase 15 Tournament Seed Conformance Report");
  await writeReport(projectRoot, phase218Regression, "phase2-18-regression-report", "Intrilex v4.1 Phase 2–18 Preserved Regression Report");
  await writeReport(projectRoot, phase20, "phase20-canonical-closure-report", "Intrilex v4.1 Phase 20 Canon-Locked Fixture Closure Report");
  await writeReport(projectRoot, phase16, "phase16-replay-serialization-rng-report", "Intrilex v4.1 Phase 16 Replay, Serialization, and RNG Gate Report");
  await writeReport(projectRoot, phase17, "phase17-judge-tools-report", "Intrilex v4.1 Phase 17 Physical and Judge Tools Gate Report");
  await writeReport(projectRoot, phase18, "phase18-integration-report", "Intrilex v4.1 Phase 18 Cross-Module Integration Gate Report");
  await writeReport(projectRoot, combined, "conformance-report", "Intrilex v4.1 Final Phase 2–20 Combined Gameplay Conformance Report");
  return combined;
}
