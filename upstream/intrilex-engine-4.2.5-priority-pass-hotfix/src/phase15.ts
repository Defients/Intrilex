import { canonicalClone } from "./canonical-json.js";
import { hasAegis } from "./lifecycle.js";
import { nextIndex } from "./rng.js";
import { parseIdentity, rankDefinition, hasOrdinaryScuttleImmunity } from "./ranks.js";
import { moveCard } from "./state.js";
import type { CardId, EngineState, Phase15Action, PlayerId } from "./types.js";

export const TOURNAMENT_SEED_BAN_IDENTITIES = Object.freeze([
  "BJ", "10♥", "8♠", "9♠", "10♣", "Q♠", "J♠", "4♠"
] as const);

export const CANONICAL_HIGH_IMPACT_POOL = Object.freeze([
  "A♣", "A♠", "3♠", "5♠", "6♠", "7♠", "8♥", "9♥", "10♦", "10♠", "Q♣", "K♣", "K♠"
] as const);

export const TOURNAMENT_SEED_DISABLED_SYSTEMS = Object.freeze([
  "trap", "time-bomb", "ultra-counter-resistant-gy-rider", "reserved-star", "reserved-sparkle", "volatility-icons"
] as const);

export type TournamentSeedCategory = 1 | 2 | 3 | 4 | 5 | 6;

export interface TournamentSeedSelection {
  category1?: CardId;
  category2?: CardId;
  category3?: CardId;
  category4?: CardId;
  category5?: CardId;
  category6?: CardId;
}

export interface Phase15Runtime {
  enabled: boolean;
  status: "unconfigured" | "selecting" | "complete";
  seedOrder: PlayerId[];
  eventSheetId: string | null;
  approvedOptionalModules: string[];
  activeHighImpactPool: string[];
  banPileCardIds: CardId[];
  selectionsByPlayer: Record<PlayerId, TournamentSeedSelection>;
  categoryPriority: Record<string, PlayerId[]>;
  highImpactRankings: Record<PlayerId, string[]>;
  highImpactAssignments: Record<PlayerId, CardId>;
  rngAudit: Array<{ operation: string; cursorBefore: number; cursorAfter: number }>;
  compatibilityAlias: { officialSourceId: "CT-063"; executableFixtureId: "CT-063@TOURNAMENT-SEED" };
  lastResolution: Record<string, unknown> | null;
}

export interface Phase15EventSpec {
  type: string;
  payload: Record<string, unknown>;
  visibility?: "public" | "private" | "authorized";
}

export type Phase15Resolution =
  | { ok: true; state: EngineState; events: Phase15EventSpec[] }
  | { ok: false; code: string; message: string; details?: unknown };

function fail(code: string, message: string, details?: unknown): Phase15Resolution {
  return details === undefined ? { ok: false, code, message } : { ok: false, code, message, details };
}

export function phase15Runtime(state: EngineState): Phase15Runtime {
  const current = state.metadata.phase15 as Partial<Phase15Runtime> | undefined;
  return {
    enabled: current?.enabled ?? false,
    status: current?.status ?? "unconfigured",
    seedOrder: canonicalClone(current?.seedOrder ?? []),
    eventSheetId: current?.eventSheetId ?? null,
    approvedOptionalModules: canonicalClone(current?.approvedOptionalModules ?? []),
    activeHighImpactPool: canonicalClone(current?.activeHighImpactPool ?? [...CANONICAL_HIGH_IMPACT_POOL]),
    banPileCardIds: canonicalClone(current?.banPileCardIds ?? []),
    selectionsByPlayer: canonicalClone(current?.selectionsByPlayer ?? {}),
    categoryPriority: canonicalClone(current?.categoryPriority ?? {}),
    highImpactRankings: canonicalClone(current?.highImpactRankings ?? {}),
    highImpactAssignments: canonicalClone(current?.highImpactAssignments ?? {}),
    rngAudit: canonicalClone(current?.rngAudit ?? []),
    compatibilityAlias: current?.compatibilityAlias ?? { officialSourceId: "CT-063", executableFixtureId: "CT-063@TOURNAMENT-SEED" },
    lastResolution: current?.lastResolution ? canonicalClone(current.lastResolution) : null
  };
}

function saveRuntime(state: EngineState, runtime: Phase15Runtime): void {
  state.metadata.phase15 = runtime;
}

function canonicalIdentitySet(state: EngineState): Map<string, CardId> {
  const byIdentity = new Map<string, CardId>();
  for (const cardId of state.zones.dp) {
    const identity = state.cards[cardId]?.identity;
    if (identity !== undefined) byIdentity.set(identity, cardId);
  }
  return byIdentity;
}

function categoryPriority(seedOrder: PlayerId[], category: 1 | 2 | 3 | 4 | 5): PlayerId[] {
  if (seedOrder.length === 0) return [];
  const offset = (category - 1) % seedOrder.length;
  return [...seedOrder.slice(offset), ...seedOrder.slice(0, offset)];
}

function isCategoryIdentity(identity: string, category: 1 | 2 | 3 | 4): boolean {
  const parsed = parseIdentity(identity);
  if (!parsed) return false;
  if (category === 1) return parsed.rank === "A" && (parsed.suit === "♦" || parsed.suit === "♥");
  if (category === 2) return parsed.rank === "2";
  if (category === 3) return ["3", "4", "5", "6", "7"].includes(parsed.rank) && (parsed.suit === "♦" || parsed.suit === "♥");
  return ["J", "Q", "K"].includes(parsed.rank) && (parsed.suit === "♦" || parsed.suit === "♥");
}

function identityRequiredByCategoriesOneToFour(identity: string): boolean {
  return [1, 2, 3, 4].some((category) => isCategoryIdentity(identity, category as 1 | 2 | 3 | 4));
}

export function validateTournamentSeedPool(pool: readonly string[], playerCount: number): string | null {
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 4) return "Tournament Seed supports two to four players";
  if (new Set(pool).size !== pool.length) return "High-Impact Pool identities must be unique";
  if (pool.length < playerCount * 3) return "High-Impact Pool requires at least three legal identities per player";
  for (const identity of pool) {
    if (parseIdentity(identity) === null) return `Unknown High-Impact identity ${identity}`;
    if ((TOURNAMENT_SEED_BAN_IDENTITIES as readonly string[]).includes(identity)) return `${identity} is in the Ban Pile`;
    if (identityRequiredByCategoriesOneToFour(identity)) return `${identity} is categorically required by starting-hand categories 1–4`;
  }
  return null;
}

export function validateTournamentSeedConfiguration(
  enabledOptionalModules: readonly string[],
  eventSheetId?: string,
  approvedOptionalModules: readonly string[] = []
): string | null {
  const normalized = enabledOptionalModules.map((value) => value.toLowerCase());
  const alwaysDisabled = new Set(["trap", "time-bomb"]);
  for (const module of normalized) if (alwaysDisabled.has(module)) return `Tournament Seed disables ${module}`;
  const tournamentSeedOnly = new Set(["tournament-seed"]);
  const extra = normalized.filter((module) => !tournamentSeedOnly.has(module));
  if (extra.length === 0) return null;
  if (!eventSheetId) return "Tournament Seed optional-module overrides require an exact event sheet";
  const approved = new Set(approvedOptionalModules.map((value) => value.toLowerCase()));
  const unapproved = extra.filter((module) => !approved.has(module));
  return unapproved.length === 0 ? null : `Event sheet does not approve: ${unapproved.join(", ")}`;
}

export function tournamentSeedScuttleLegality(state: EngineState, actorId: PlayerId, sourceCardId: CardId, targetCardId: CardId): { legal: boolean; reason: string | null } {
  const source = state.cards[sourceCardId];
  const target = state.cards[targetCardId];
  if (!source || !target) return { legal: false, reason: "Scuttle requires existing source and target cards" };
  if (source.zone !== `${actorId}_HAND`) return { legal: false, reason: "Scuttle source must be in the actor's hand" };
  if (!target.zone.endsWith("_PR") || target.controllerId === actorId) return { legal: false, reason: "Scuttle target must be an enemy PR card" };
  if (hasAegis(target)) return { legal: false, reason: "Aegis blocks Scuttle" };
  if (hasOrdinaryScuttleImmunity(target)) return { legal: false, reason: "Target has ordinary Scuttle immunity" };
  const sourceOrder = rankDefinition(source).scuttleOrder;
  const targetOrder = rankDefinition(target).scuttleOrder;
  return sourceOrder > targetOrder
    ? { legal: true, reason: null }
    : { legal: false, reason: "Tournament Seed requires a strictly higher source rank; suit is irrelevant" };
}

function configure(input: EngineState, action: Extract<Phase15Action, { kind: "configure-tournament-seed" }>): Phase15Resolution {
  const state = canonicalClone(input);
  if (state.phase !== "Setup") return fail("TS_PHASE", "Tournament Seed configuration occurs only during Setup");
  if (state.stack.length > 0 || state.pendingDeclaration !== null || state.priority?.open === true) return fail("TS_PENDING", "Tournament Seed cannot configure while gameplay objects are pending");
  if (action.seedOrder.length < 2 || action.seedOrder.length > 4 || new Set(action.seedOrder).size !== action.seedOrder.length || action.seedOrder.some((id) => !state.players[id])) return fail("TS_PLAYERS", "Seed order must contain two to four unique existing players");
  const configFailure = validateTournamentSeedConfiguration(action.enabledOptionalModules ?? ["tournament-seed"], action.eventSheetId, action.approvedOptionalModules ?? []);
  if (configFailure) return fail("TS_CONFIG", configFailure);
  const pool = action.alternateHighImpactPool ?? [...CANONICAL_HIGH_IMPACT_POOL];
  const poolFailure = validateTournamentSeedPool(pool, action.seedOrder.length);
  if (poolFailure) return fail("TS_POOL", poolFailure);

  const byIdentity = canonicalIdentitySet(state);
  const missingBan = (TOURNAMENT_SEED_BAN_IDENTITIES as readonly string[]).filter((identity) => !byIdentity.has(identity));
  if (missingBan.length > 0) return fail("TS_BAN_MISSING", `Ban Pile identities missing from DP: ${missingBan.join(", ")}`);
  const banPileCardIds: CardId[] = [];
  for (const identity of TOURNAMENT_SEED_BAN_IDENTITIES) {
    const cardId = byIdentity.get(identity)!;
    moveCard(state, cardId, "VOID");
    state.cards[cardId]!.state.tournamentSeedBanPile = true;
    banPileCardIds.push(cardId);
  }

  const runtime: Phase15Runtime = {
    enabled: true,
    status: "selecting",
    seedOrder: [...action.seedOrder],
    eventSheetId: action.eventSheetId ?? null,
    approvedOptionalModules: [...(action.approvedOptionalModules ?? [])],
    activeHighImpactPool: [...pool],
    banPileCardIds,
    selectionsByPlayer: Object.fromEntries(action.seedOrder.map((id) => [id, {}])),
    categoryPriority: Object.fromEntries(([1, 2, 3, 4, 5] as const).map((category) => [String(category), categoryPriority(action.seedOrder, category)])),
    highImpactRankings: {},
    highImpactAssignments: {},
    rngAudit: [],
    compatibilityAlias: { officialSourceId: "CT-063", executableFixtureId: "CT-063@TOURNAMENT-SEED" },
    lastResolution: { kind: "configured", banPileCardIds: [...banPileCardIds] }
  };
  saveRuntime(state, runtime);
  state.metadata.tournamentSeedDisabledSystems = [...TOURNAMENT_SEED_DISABLED_SYSTEMS];
  return { ok: true, state, events: [{ type: "TOURNAMENT_SEED_CONFIGURED", payload: { seedOrder: action.seedOrder, banPileCardIds, highImpactPool: pool } }] };
}

function selectCategory(input: EngineState, action: Extract<Phase15Action, { kind: "select-tournament-category" }>): Phase15Resolution {
  const state = canonicalClone(input);
  const runtime = phase15Runtime(state);
  if (!runtime.enabled || runtime.status !== "selecting") return fail("TS_STATUS", "Tournament Seed selection is not active");
  if (action.category < 1 || action.category > 4) return fail("TS_CATEGORY", "Direct category selection supports categories 1–4");
  const priority = runtime.categoryPriority[String(action.category)] ?? [];
  if (!priority.includes(action.playerId)) return fail("TS_PLAYER", "Player is not in category priority");
  const key = `category${action.category}` as keyof TournamentSeedSelection;
  if (runtime.selectionsByPlayer[action.playerId]?.[key] !== undefined) return fail("TS_SELECTED", `${action.playerId} already selected category ${action.category}`);
  const card = state.cards[action.cardId];
  if (!card || card.zone !== "DP") return fail("TS_CARD", "Selected card must remain in DP");
  if (!isCategoryIdentity(card.identity, action.category)) return fail("TS_IDENTITY", `${card.identity} is illegal for category ${action.category}`);
  moveCard(state, action.cardId, `${action.playerId}_HAND`, action.playerId);
  runtime.selectionsByPlayer[action.playerId]![key] = action.cardId;
  runtime.lastResolution = { kind: "category-selection", playerId: action.playerId, category: action.category, cardId: action.cardId };
  saveRuntime(state, runtime);
  return { ok: true, state, events: [{ type: "TOURNAMENT_CATEGORY_SELECTED", payload: { playerId: action.playerId, category: action.category, cardId: action.cardId } }] };
}

function resolveHighImpact(input: EngineState, action: Extract<Phase15Action, { kind: "resolve-high-impact" }>): Phase15Resolution {
  const state = canonicalClone(input);
  const runtime = phase15Runtime(state);
  if (!runtime.enabled || runtime.status !== "selecting") return fail("TS_STATUS", "Tournament Seed selection is not active");
  const priority = runtime.categoryPriority["5"] ?? [];
  if (priority.some((playerId) => !Array.isArray(action.rankingsByPlayer[playerId]) || action.rankingsByPlayer[playerId]!.length < 3)) return fail("TS_RANKINGS", "Every player must rank at least three High-Impact identities");
  const byIdentity = canonicalIdentitySet(state);
  const assignments: Record<PlayerId, CardId> = {};
  const used = new Set<string>();
  for (const playerId of priority) {
    const rankings = action.rankingsByPlayer[playerId]!;
    if (new Set(rankings).size !== rankings.length || rankings.some((identity) => !runtime.activeHighImpactPool.includes(identity))) return fail("TS_RANKINGS", `${playerId} rankings must be distinct identities in the active High-Impact Pool`);
    let selectedIdentity = rankings.find((identity) => !used.has(identity) && byIdentity.has(identity));
    if (!selectedIdentity) {
      const fallback = action.fallbackRankingsByPlayer?.[playerId];
      if (!fallback || fallback.length < 3 || new Set(fallback).size !== fallback.length || fallback.some((identity) => !runtime.activeHighImpactPool.includes(identity))) return fail("TS_FALLBACK", `${playerId} requires three legal fallback rankings`);
      selectedIdentity = fallback.find((identity) => !used.has(identity) && byIdentity.has(identity));
    }
    if (!selectedIdentity) return fail("TS_EXHAUSTED", `No legal High-Impact identity remains for ${playerId}`);
    const cardId = byIdentity.get(selectedIdentity)!;
    moveCard(state, cardId, `${playerId}_HAND`, playerId);
    runtime.selectionsByPlayer[playerId]!.category5 = cardId;
    runtime.highImpactAssignments[playerId] = cardId;
    assignments[playerId] = cardId;
    used.add(selectedIdentity);
    byIdentity.delete(selectedIdentity);
  }
  runtime.highImpactRankings = canonicalClone(action.rankingsByPlayer);
  runtime.lastResolution = { kind: "high-impact", assignments: canonicalClone(assignments) };
  saveRuntime(state, runtime);
  return {
    ok: true,
    state,
    events: [
      { type: "HIGH_IMPACT_RANKINGS_REVEALED", payload: { rankingsByPlayer: action.rankingsByPlayer } },
      { type: "HIGH_IMPACT_ASSIGNED", payload: { assignments } }
    ]
  };
}

function finalizeSetup(input: EngineState): Phase15Resolution {
  const state = canonicalClone(input);
  const runtime = phase15Runtime(state);
  if (!runtime.enabled || runtime.status !== "selecting") return fail("TS_STATUS", "Tournament Seed selection is not active");
  for (const playerId of runtime.seedOrder) {
    const selected = runtime.selectionsByPlayer[playerId] ?? {};
    if ([selected.category1, selected.category2, selected.category3, selected.category4, selected.category5].some((id) => id === undefined)) return fail("TS_INCOMPLETE", `${playerId} is missing a category 1–5 selection`);
  }
  const cursorBefore = state.rng.cursor;
  for (let index = state.zones.dp.length - 1; index > 0; index -= 1) {
    const other = nextIndex(state.rng, index + 1);
    [state.zones.dp[index], state.zones.dp[other]] = [state.zones.dp[other]!, state.zones.dp[index]!];
  }
  for (const playerId of runtime.seedOrder) {
    const cardId = state.zones.dp[0];
    if (!cardId) return fail("TS_DP", "DP exhausted before random sixth cards were dealt");
    moveCard(state, cardId, `${playerId}_HAND`, playerId);
    runtime.selectionsByPlayer[playerId]!.category6 = cardId;
  }
  const swapShape = runtime.seedOrder.length === 2 ? { faceDown: 2, faceUp: 1 } : runtime.seedOrder.length === 3 ? { faceDown: 2, faceUp: 2 } : { faceDown: 3, faceUp: 2 };
  const swapCount = swapShape.faceDown + swapShape.faceUp;
  if (state.zones.dp.length < swapCount) return fail("TS_DP", "DP exhausted before Swap Bar construction");
  const swapCardIds = state.zones.dp.slice(0, swapCount);
  for (const cardId of swapCardIds) moveCard(state, cardId, "SWAP_BAR");
  swapCardIds.forEach((cardId, index) => { state.cards[cardId]!.state.swapBarFaceUp = index >= swapShape.faceDown; });
  runtime.rngAudit.push({ operation: "shuffle-before-random-sixth", cursorBefore, cursorAfter: state.rng.cursor });
  runtime.status = "complete";
  runtime.status = "complete";
  const randomSixthByPlayer = Object.fromEntries(
    runtime.seedOrder.map((id) => [id, runtime.selectionsByPlayer[id]!.category6])
  );
  runtime.lastResolution = { kind: "complete", randomSixthByPlayer, swapCardIds };
  saveRuntime(state, runtime);
  return {
    ok: true,
    state,
    events: [{
      type: "TOURNAMENT_SEED_SETUP_COMPLETE",
      payload: { randomSixthByPlayer, swapCardIds },
      visibility: "authorized"
    }]
  };
}

export function resolvePhase15Action(input: EngineState, actorId: PlayerId, action: Phase15Action): Phase15Resolution {
  if (!input.players[actorId]) return fail("TS_ACTOR", `Unknown actor ${actorId}`);
  switch (action.kind) {
    case "configure-tournament-seed": return configure(input, action);
    case "select-tournament-category": return selectCategory(input, action);
    case "resolve-high-impact": return resolveHighImpact(input, action);
    case "finalize-tournament-seed": return finalizeSetup(input);
    case "validate-tournament-scuttle": {
      const result = tournamentSeedScuttleLegality(input, actorId, action.sourceCardId, action.targetCardId);
      if (!result.legal) return fail("TS_SCUTTLE", result.reason ?? "Illegal Tournament Seed Scuttle");
      const state = canonicalClone(input);
      const target = state.cards[action.targetCardId]!;
      moveCard(state, action.targetCardId, "GY");
      moveCard(state, action.sourceCardId, "GY");
      const runtime = phase15Runtime(state);
      runtime.lastResolution = { kind: "scuttle", sourceCardId: action.sourceCardId, targetCardId: action.targetCardId };
      saveRuntime(state, runtime);
      return { ok: true, state, events: [{ type: "TOURNAMENT_SCUTTLE_RESOLVED", payload: { sourceCardId: action.sourceCardId, targetCardId: action.targetCardId, targetIdentity: target.identity } }] };
    }
  }
}
