import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadFixtures } from "./conformance.js";
import { hashCanonical } from "./hash.js";
import { runCommands } from "./replay.js";
import { deriveSecuredPoints } from "./state.js";
import { compareScuttle, hasOrdinaryScuttleImmunity, parseIdentity, rankDefinition } from "./ranks.js";
import type { CardInstance, RngState, ZoneName } from "./types.js";
import { nextIndex } from "./rng.js";

const FIXTURE_FILES = [
  "phase2-4-conformance.json", "phase5-lifecycle-conformance.json", "phase6-rank-conformance.json",
  "phase7-interactions-conformance.json", "phase8-ultras-rank10-voltage-endgames.json",
  "phase9-first-contact-profile.json", "phase10-trap-module.json", "phase11-multiplayer-teams.json",
  "phase12-battlerealm.json", "phase13-time-bomb.json", "phase14-deffy-mode.json", "phase15-tournament-seed.json",
  "phase20-canonical-closure.json"
];

function wilson(successes: number, total: number, z = 1.96): [number, number] {
  if (total === 0) return [0, 0];
  const p = successes / total;
  const d = 1 + z * z / total;
  const c = (p + z * z / (2 * total)) / d;
  const m = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total) / d;
  return [Math.max(0, c - m), Math.min(1, c + m)];
}

const SUITS = ["♣", "♦", "♥", "♠"] as const;
const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"] as const;
type Policy = "score-first" | "balanced" | "control-first";
const POLICIES: Policy[] = ["score-first", "balanced", "control-first"];

function deck54(): string[] {
  return [...RANKS.flatMap((rank) => SUITS.map((suit) => `${rank}${suit}`)), "RJ", "BJ"];
}
function shuffle<T>(values: T[], rng: RngState): T[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = nextIndex(rng, i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
function card(identity: string, zone: ZoneName): CardInstance {
  return { id: identity, identity, originalOwnerId: "SIM", controllerId: "SIM", zone, state: { pointValue: rankDefinition(identity).prPoints } };
}
function points(pr: string[]): number { return pr.reduce((sum, identity) => sum + rankDefinition(identity).prPoints, 0); }
function scuttleLegal(source: string, target: string): boolean {
  const targetCard = card(target, "P2_PR");
  return !hasOrdinaryScuttleImmunity(targetCard) && compareScuttle(card(source, "P1_HAND"), targetCard) > 0;
}

interface MatchResult {
  seed: number;
  policyP1: Policy;
  policyP2: Policy;
  startingSeat: "P1" | "P2";
  winner: "P1" | "P2" | null;
  turns: number;
  actions: { draw: number; score: number; scuttle: number; pass: number };
  finalPoints: { P1: number; P2: number };
  deckRemaining: number;
  reason: "goal" | "exhausted-subset" | "turn-cap";
}

function chooseAction(policy: Policy, hand: string[], ownPr: string[], enemyPr: string[], deckLength: number): { kind: "draw" | "score" | "scuttle" | "pass"; source?: string; target?: string } {
  const scoreCandidates = [...hand].sort((a,b) => rankDefinition(b).prPoints - rankDefinition(a).prPoints || a.localeCompare(b));
  const scuttles: Array<{ source: string; target: string; swing: number }> = [];
  for (const source of hand) for (const target of enemyPr) if (scuttleLegal(source, target)) scuttles.push({ source, target, swing: rankDefinition(target).prPoints - rankDefinition(source).prPoints });
  scuttles.sort((a,b) => b.swing - a.swing || rankDefinition(b.target).prPoints - rankDefinition(a.target).prPoints || a.source.localeCompare(b.source));
  const own = points(ownPr);
  const bestScore = scoreCandidates[0];
  const bestScuttle = scuttles[0];
  if (bestScore && own + rankDefinition(bestScore).prPoints >= 15) return { kind:"score", source:bestScore };
  if (policy === "control-first" && bestScuttle && bestScuttle.swing >= -1) return { kind:"scuttle", source:bestScuttle.source, target:bestScuttle.target };
  if (policy === "balanced" && bestScuttle && bestScuttle.swing >= 3 && points(enemyPr) >= own) return { kind:"scuttle", source:bestScuttle.source, target:bestScuttle.target };
  if (bestScore) return { kind:"score", source:bestScore };
  if (deckLength > 0) return { kind:"draw" };
  if (bestScuttle) return { kind:"scuttle", source:bestScuttle.source, target:bestScuttle.target };
  return { kind:"pass" };
}

function simulateMatch(seed: number, policyP1: Policy, policyP2: Policy, startingSeat: "P1" | "P2"): MatchResult {
  const rng: RngState = { algorithm:"xorshift32", seed: seed >>> 0 || 1, cursor:0 };
  const dp = shuffle(deck54(), rng);
  const hands: Record<"P1"|"P2", string[]> = { P1: dp.splice(0,5), P2: dp.splice(0,6) };
  // First Contact creates no Swap Bar; the reduced policy campaign uses only its legal Draw/Points/Scuttle subset.
  const pr: Record<"P1"|"P2", string[]> = { P1:[], P2:[] };
  const actions = { draw:0, score:0, scuttle:0, pass:0 };
  let active: "P1"|"P2" = startingSeat;
  for (let turn=1; turn<=200; turn+=1) {
    const enemy: "P1"|"P2" = active === "P1" ? "P2" : "P1";
    const policy = active === "P1" ? policyP1 : policyP2;
    const choice = chooseAction(policy, hands[active], pr[active], pr[enemy], dp.length);
    if (choice.kind === "draw") {
      const count = hands[active].length === 0 ? Math.min(2, dp.length) : Math.min(1, dp.length);
      hands[active].push(...dp.splice(0,count)); actions.draw += 1;
    } else if (choice.kind === "score" && choice.source) {
      hands[active].splice(hands[active].indexOf(choice.source),1); pr[active].push(choice.source); actions.score += 1;
    } else if (choice.kind === "scuttle" && choice.source && choice.target) {
      hands[active].splice(hands[active].indexOf(choice.source),1); pr[enemy].splice(pr[enemy].indexOf(choice.target),1); actions.scuttle += 1;
    } else actions.pass += 1;
    if (points(pr[active]) >= 15) return { seed, policyP1, policyP2, startingSeat, winner:active, turns:turn, actions, finalPoints:{P1:points(pr.P1),P2:points(pr.P2)}, deckRemaining:dp.length, reason:"goal" };
    if (dp.length === 0 && hands.P1.length === 0 && hands.P2.length === 0) {
      const p1=points(pr.P1), p2=points(pr.P2); const winner=p1===p2?null:(p1>p2?"P1":"P2");
      return { seed, policyP1, policyP2, startingSeat, winner, turns:turn, actions, finalPoints:{P1:p1,P2:p2}, deckRemaining:0, reason:"exhausted-subset" };
    }
    active = enemy;
  }
  return { seed, policyP1, policyP2, startingSeat, winner:null, turns:200, actions, finalPoints:{P1:points(pr.P1),P2:points(pr.P2)}, deckRemaining:dp.length, reason:"turn-cap" };
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length-1, Math.floor((sorted.length-1)*q))]!;
}
function runCampaign(matchesPerPair = 1200): Record<string, unknown> {
  const matches: MatchResult[]=[];
  let serial=1;
  for (const p1 of POLICIES) for (const p2 of POLICIES) for (let i=0;i<matchesPerPair;i+=1) {
    const starter: "P1"|"P2" = i%2===0?"P1":"P2";
    matches.push(simulateMatch((0x9e3779b9 ^ (serial*0x45d9f3b))>>>0,p1,p2,starter)); serial+=1;
  }
  const turns=matches.map(m=>m.turns).sort((a,b)=>a-b);
  const firstWins=matches.filter(m=>m.winner===m.startingSeat).length;
  const decisive=matches.filter(m=>m.winner!==null).length;
  const policy = Object.fromEntries(POLICIES.map(name=>{
    let games=0,wins=0;
    for(const m of matches){ if(m.policyP1===name){games++;if(m.winner==='P1')wins++;} if(m.policyP2===name){games++;if(m.winner==='P2')wins++;} }
    return [name,{games,wins,winRate:games?wins/games:0,win95:wilson(wins,games)}];
  }));
  const actionTotals=matches.reduce((a,m)=>({draw:a.draw+m.actions.draw,score:a.score+m.actions.score,scuttle:a.scuttle+m.actions.scuttle,pass:a.pass+m.actions.pass}),{draw:0,score:0,scuttle:0,pass:0});
  const compact=matches.map(({seed,policyP1,policyP2,startingSeat,winner,turns,finalPoints,reason})=>({seed,policyP1,policyP2,startingSeat,winner,turns,finalPoints,reason}));
  return {
    rulesProfile:"First Contact legal-action subset: Draw, Play for Points, Scuttle, Pass",
    policyVersion:"intrilex-policy-campaign-v1",
    matchCount:matches.length,
    matchesPerPolicyPair:matchesPerPair,
    deterministicSeedFormula:"(0x9e3779b9 XOR serial*0x45d9f3b) uint32",
    decisiveMatches:decisive,
    draws:matches.length-decisive,
    firstPlayerWins:firstWins,
    firstPlayerWinRate:decisive?firstWins/decisive:0,
    firstPlayerWin95:wilson(firstWins,decisive),
    turns:{mean:turns.reduce((a,b)=>a+b,0)/turns.length,median:percentile(turns,.5),p95:percentile(turns,.95),max:turns.at(-1)??0},
    actionTotals,
    policy,
    campaignHash:hashCanonical(compact),
    interpretationBoundary:"These are complete deterministic matches for a legal First Contact action subset under three explicit policies. They provide reproducible balance telemetry, not a claim that perfect play or the complete advanced-module metagame is solved."
  };
}

export interface SimulationBaselineReport {
  reportVersion: 2;
  rulesVersion: "4.1";
  engineVersion: string;
  scenarioBaseline: Record<string, unknown>;
  fullMatchCampaign: Record<string, unknown>;
  deterministicReproduction: { campaignHashA: string; campaignHashB: string; matched: boolean };
  catalogHash: string;
}

export async function runSimulationBaseline(projectRoot: string): Promise<SimulationBaselineReport> {
  const scenarios: Array<Record<string, unknown>>=[];
  for (const file of FIXTURE_FILES) for (const fixture of await loadFixtures(path.join(projectRoot,"fixtures",file))) {
    const initialPoints=Object.fromEntries(fixture.initialState.turnOrder.map(id=>[id,deriveSecuredPoints(fixture.initialState,id)]));
    const result=runCommands(fixture.initialState,fixture.commands);
    const pointDelta=result.state.turnOrder.reduce((sum,id)=>sum+deriveSecuredPoints(result.state,id)-(initialPoints[id]??0),0);
    scenarios.push({id:fixture.id,sourceTestId:fixture.sourceTestId,commands:fixture.commands.length,accepted:result.accepted.filter(Boolean).length,rejected:result.accepted.filter(v=>!v).length,events:result.events.length,winner:result.state.winner,pointDelta,resultHash:hashCanonical({state:result.state,events:result.events,accepted:result.accepted})});
  }
  const commandCount=scenarios.reduce((sum,e)=>sum+Number(e.commands),0);
  const accepted=scenarios.reduce((sum,e)=>sum+Number(e.accepted),0);
  const campaignA=runCampaign(); const campaignB=runCampaign();
  const hashA=String(campaignA.campaignHash), hashB=String(campaignB.campaignHash);
  const scenarioBaseline={scenarioCount:scenarios.length,commandCount,acceptedCommands:accepted,rejectedCommands:commandCount-accepted,eventCount:scenarios.reduce((s,e)=>s+Number(e.events),0),catalogHash:hashCanonical(scenarios.map(e=>({id:e.id,resultHash:e.resultHash}))),scenarios};
  const core={reportVersion:2 as const,rulesVersion:"4.1" as const,engineVersion:"4.1.0",scenarioBaseline,fullMatchCampaign:campaignA,deterministicReproduction:{campaignHashA:hashA,campaignHashB:hashB,matched:hashA===hashB}};
  const report:SimulationBaselineReport={...core,catalogHash:hashCanonical(core)};
  await mkdir(path.join(projectRoot,"reports"),{recursive:true});
  await writeFile(path.join(projectRoot,"reports","simulation-baseline.json"),JSON.stringify(report,null,2)+"\n","utf8");
  const c=campaignA as any;
  const md=`# Intrilex Phase 19 Deterministic Balance Campaign\n\n**Verdict: ${report.deterministicReproduction.matched?"PASS":"FAIL"}**\n\n## Conformance scenario instrumentation\n\n- Scenarios: **${(scenarioBaseline as any).scenarioCount}**\n- Commands: **${commandCount}**\n- Scenario catalog: \`${(scenarioBaseline as any).catalogHash}\`\n\n## Full-match campaign\n\n- Complete matches: **${c.matchCount}**\n- Profile: ${c.rulesProfile}\n- Decisive: **${c.decisiveMatches}**; draws: **${c.draws}**\n- First-player win rate: **${(c.firstPlayerWinRate*100).toFixed(2)}%** (95% Wilson ${(c.firstPlayerWin95[0]*100).toFixed(2)}–${(c.firstPlayerWin95[1]*100).toFixed(2)}%)\n- Turns: mean **${c.turns.mean.toFixed(2)}**, median **${c.turns.median}**, p95 **${c.turns.p95}**, max **${c.turns.max}**\n- Campaign hash: \`${c.campaignHash}\`\n- Independent deterministic rerun: **${report.deterministicReproduction.matched?"MATCH":"MISMATCH"}**\n\n> ${c.interpretationBoundary}\n\n- Report catalog hash: \`${report.catalogHash}\`\n`;
  await writeFile(path.join(projectRoot,"reports","simulation-baseline.md"),md,"utf8");
  await writeFile(path.join(projectRoot,"reports","phase19-balance-simulation-report.json"),JSON.stringify(report,null,2)+"\n","utf8");
  await writeFile(path.join(projectRoot,"reports","phase19-balance-simulation-report.md"),md,"utf8");
  return report;
}
