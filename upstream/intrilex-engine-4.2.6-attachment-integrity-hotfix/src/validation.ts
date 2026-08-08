import { canonicalize } from "./canonical-json.js";
import { EngineError } from "./errors.js";
import { zoneList } from "./state.js";
import type { CardId, ConformanceFixture, EngineState, PlayerId, ZoneName } from "./types.js";

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

function issue(path: string, code: string, message: string): ValidationIssue {
  return { path, code, message };
}

function validateStartRef(path: string, value: unknown, state: EngineState, issues: ValidationIssue[]): void {
  if (typeof value !== "object" || value === null) {
    issues.push(issue(path, "START_REF", "Expected an exact Start event reference"));
    return;
  }
  const ref = value as { playerId?: unknown; startSequence?: unknown };
  if (typeof ref.playerId !== "string" || !state.players[ref.playerId]) issues.push(issue(`${path}.playerId`, "PLAYER", "Start reference player must exist"));
  if (!Number.isInteger(ref.startSequence) || (ref.startSequence as number) < 1) issues.push(issue(`${path}.startSequence`, "SEQUENCE", "Start sequence must be a positive integer"));
}

function isOtt(zone: string): boolean {
  return zone.endsWith("_PR") || zone.endsWith("_ER");
}

function isHand(zone: string): boolean {
  return zone.endsWith("_HAND");
}

export function validateState(state: EngineState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (state.schemaVersion !== 1) issues.push(issue("schemaVersion", "SCHEMA", "Expected schemaVersion 1"));
  if (state.rulesVersion !== "4.1") issues.push(issue("rulesVersion", "RULES_VERSION", "Expected rulesVersion 4.1"));
  if (!Number.isInteger(state.revision) || state.revision < 0) issues.push(issue("revision", "REVISION", "Revision must be a non-negative integer"));
  if (!state.players[state.activePlayerId]) issues.push(issue("activePlayerId", "PLAYER", "Active player must exist"));
  if (new Set(state.turnOrder).size !== state.turnOrder.length) issues.push(issue("turnOrder", "DUPLICATE", "Turn order contains duplicates"));
  for (const playerId of Object.keys(state.players)) {
    const sequence = state.startPhaseSequenceByPlayer[playerId];
    if (!Number.isInteger(sequence) || (sequence ?? -1) < 0) issues.push(issue(`startPhaseSequenceByPlayer.${playerId}`, "SEQUENCE", "Start sequence must be a non-negative integer"));
  }

  const locations = new Map<CardId, string[]>();
  const record = (cardId: CardId, location: string) => {
    const list = locations.get(cardId) ?? [];
    list.push(location);
    locations.set(cardId, list);
  };

  for (const [playerId, player] of Object.entries(state.players)) {
    if (player.id !== playerId) issues.push(issue(`players.${playerId}.id`, "IDENTITY", "Player map key must equal player.id"));
    for (const [field, list] of [["hand", player.hand], ["pr", player.pr], ["er", player.er]] as const) {
      for (const cardId of list) record(cardId, `players.${playerId}.${field}`);
      if (new Set(list).size !== list.length) issues.push(issue(`players.${playerId}.${field}`, "DUPLICATE", "Zone contains duplicate card ids"));
    }
  }
  for (const [field, list] of Object.entries(state.zones)) {
    for (const cardId of list) record(cardId, `zones.${field}`);
    if (new Set(list).size !== list.length) issues.push(issue(`zones.${field}`, "DUPLICATE", "Zone contains duplicate card ids"));
  }
  for (const item of state.stack) {
    for (const cardId of item.sourceCardIds) record(cardId, `stack.${item.id}`);
  }

  for (const [cardId, card] of Object.entries(state.cards)) {
    if (card.id !== cardId) issues.push(issue(`cards.${cardId}.id`, "IDENTITY", "Card map key must equal card.id"));
    if (!state.players[card.originalOwnerId]) issues.push(issue(`cards.${cardId}.originalOwnerId`, "PLAYER", "Original owner must exist"));
    if (!state.players[card.controllerId]) issues.push(issue(`cards.${cardId}.controllerId`, "PLAYER", "Controller must exist"));
    const found = locations.get(cardId) ?? [];
    if (card.zone === "VOID") {
      if (found.length !== 0) issues.push(issue(`cards.${cardId}.zone`, "ZONE", "VOID card cannot appear in a container"));
    } else if (card.zone === "ON_STACK") {
      if (found.length !== 1 || !found[0]?.startsWith("stack.")) issues.push(issue(`cards.${cardId}.zone`, "ZONE", "ON_STACK card must appear in exactly one stack item"));
    } else {
      if (found.length !== 1) issues.push(issue(`cards.${cardId}.zone`, "ZONE_COUNT", `Card must appear in exactly one zone container; found ${found.length}`));
      try {
        const expected = zoneList(state, card.zone as ZoneName);
        if (!expected.includes(cardId)) issues.push(issue(`cards.${cardId}.zone`, "ZONE_MISMATCH", `Card zone ${card.zone} does not match its container`));
      } catch (error) {
        issues.push(issue(`cards.${cardId}.zone`, "ZONE_UNKNOWN", String(error)));
      }
    }
    if (card.state.lockedBy !== undefined && !state.stack.some((item) => item.id === card.state.lockedBy && item.status === "resolving")) {
      issues.push(issue(`cards.${cardId}.state.lockedBy`, "LOCK", "Lock must point to a resolving stack item"));
    }
    if (card.state.revealedUntil !== undefined) {
      validateStartRef(`cards.${cardId}.state.revealedUntil`, card.state.revealedUntil, state, issues);
      if (!isHand(card.zone)) issues.push(issue(`cards.${cardId}.state.revealedUntil`, "REVEAL_ZONE", "Reveal marker may exist only in hand"));
    }
    if (typeof card.state.aegis === "object" && card.state.aegis !== null) {
      const aegis = card.state.aegis as { sourceRef?: unknown; expiresAt?: unknown };
      if (typeof aegis.sourceRef !== "string" || aegis.sourceRef.length === 0) issues.push(issue(`cards.${cardId}.state.aegis.sourceRef`, "AEGIS_SOURCE", "Aegis sourceRef must be non-empty"));
      validateStartRef(`cards.${cardId}.state.aegis.expiresAt`, aegis.expiresAt, state, issues);
      if (!isOtt(card.zone)) issues.push(issue(`cards.${cardId}.state.aegis`, "AEGIS_ZONE", "Aegis may exist only while OTT"));
    }
    if (card.state.tapState !== undefined) {
      const tap = card.state.tapState;
      if (card.state.tapped !== true) issues.push(issue(`cards.${cardId}.state.tapState`, "TAP_FLAG", "Tap State requires tapped=true"));
      if (!isOtt(card.zone)) issues.push(issue(`cards.${cardId}.state.tapState`, "TAP_ZONE", "Tap State may exist only while OTT"));
      if (typeof tap.sourceRef !== "string" || tap.sourceRef.length === 0) issues.push(issue(`cards.${cardId}.state.tapState.sourceRef`, "TAP_SOURCE", "Tap sourceRef must be non-empty"));
      if (tap.kind === "start-phase") validateStartRef(`cards.${cardId}.state.tapState.expiresAt`, tap.expiresAt, state, issues);
      if (tap.kind === "explicit-event" && tap.eventKey.length === 0) issues.push(issue(`cards.${cardId}.state.tapState.eventKey`, "TAP_EVENT", "Explicit event key must be non-empty"));
    }
    if (card.state.playedForEffect === true && !isOtt(card.zone)) issues.push(issue(`cards.${cardId}.state.playedForEffect`, "PFE_ZONE", "Played-for-Effect marker persists only while OTT"));
    if (card.state.exileBound !== undefined && typeof card.state.exileBound !== "boolean") issues.push(issue(`cards.${cardId}.state.exileBound`, "EXILE_BOUND", "Exile-Bound must be boolean"));
    if (card.state.faceDownTrap === true) {
      if (!isOtt(card.zone)) issues.push(issue(`cards.${cardId}.state.faceDownTrap`, "TRAP_ZONE", "A face-down Trap must remain OTT"));
      if (card.state.pointValue !== undefined && card.state.pointValue !== 0) issues.push(issue(`cards.${cardId}.state.pointValue`, "TRAP_POINTS", "A face-down Trap contributes 0 Points"));
    }
    if (card.state.timeBomb !== undefined) {
      const bomb = card.state.timeBomb as { suit?: unknown; stage?: unknown; peak?: unknown };
      if (!/^Q[♣♦♥♠]$/.test(card.identity)) issues.push(issue(`cards.${cardId}.state.timeBomb`, "TIME_BOMB_IDENTITY", "Only a suited Queen may carry Time Bomb state"));
      if (!card.zone.endsWith("_PR")) issues.push(issue(`cards.${cardId}.state.timeBomb`, "TIME_BOMB_ZONE", "A Time Bomb must remain face-up in PR"));
      if (card.state.faceDownTrap === true) issues.push(issue(`cards.${cardId}.state.timeBomb`, "TIME_BOMB_TRAP", "A Queen cannot be a Time Bomb and a face-down Trap simultaneously"));
      if (!["♣","♦","♥","♠"].includes(String(bomb.suit))) issues.push(issue(`cards.${cardId}.state.timeBomb.suit`, "TIME_BOMB_SUIT", "Time Bomb suit must be canonical"));
      if (!Number.isInteger(bomb.stage) || !Number.isInteger(bomb.peak) || (bomb.stage as number) < 0 || (bomb.stage as number) > (bomb.peak as number)) issues.push(issue(`cards.${cardId}.state.timeBomb`, "TIME_BOMB_STAGE", "Time Bomb stage must be an integer from zero through Peak"));
      if (card.state.timeBombStage !== bomb.stage) issues.push(issue(`cards.${cardId}.state.timeBombStage`, "TIME_BOMB_STAGE_MIRROR", "Compatibility stage mirror must match structured Time Bomb state"));
    }
    if (card.state.disabledTrap !== undefined) {
      const disabled = card.state.disabledTrap as { counteringPlayerId?: unknown; expiresAfterCompletedFullTurnSequence?: unknown };
      if (card.state.faceDownTrap !== true) issues.push(issue(`cards.${cardId}.state.disabledTrap`, "TRAP_DISABLED_FACE", "A Disabled Trap must remain face-down"));
      if (typeof disabled.counteringPlayerId !== "string" || !state.players[disabled.counteringPlayerId]) issues.push(issue(`cards.${cardId}.state.disabledTrap.counteringPlayerId`, "TRAP_DISABLED_PLAYER", "Disabled Trap countering player must exist"));
      if (!Number.isInteger(disabled.expiresAfterCompletedFullTurnSequence) || (disabled.expiresAfterCompletedFullTurnSequence as number) < 1) issues.push(issue(`cards.${cardId}.state.disabledTrap.expiresAfterCompletedFullTurnSequence`, "TRAP_DISABLED_EXPIRY", "Disabled Trap expiry must be a positive completed-FT sequence"));
    }
    const attachment = card.state.attachmentGraph as { kind?: unknown; hostCardId?: unknown } | undefined;
    if (attachment !== undefined) {
      if (!/^J(?:♣|♦|♥|♠)$/.test(card.identity)) issues.push(issue(`cards.${cardId}.state.attachmentGraph`, "ATTACHMENT_SOURCE", "Only a Jack may own a Jack Attachment graph"));
      if (!card.zone.endsWith("_ER")) issues.push(issue(`cards.${cardId}.state.attachmentGraph`, "ATTACHMENT_ZONE", "A Jack Attachment must remain in ER"));
      if ((attachment.kind !== "jack-pr" && attachment.kind !== "jack-er") || typeof attachment.hostCardId !== "string") {
        issues.push(issue(`cards.${cardId}.state.attachmentGraph`, "ATTACHMENT_SHAPE", "Attachment graph must identify a kind and host"));
      } else {
        const host = state.cards[attachment.hostCardId];
        const suffix = attachment.kind === "jack-pr" ? "_PR" : "_ER";
        if (!host) issues.push(issue(`cards.${cardId}.state.attachmentGraph.hostCardId`, "ATTACHMENT_HOST", "Attachment host must exist"));
        else {
          if (!host.zone.endsWith(suffix)) issues.push(issue(`cards.${cardId}.state.attachmentGraph`, "ATTACHMENT_ROW", "Attachment host is not in the required row"));
          if (host.controllerId !== card.controllerId) issues.push(issue(`cards.${cardId}.state.attachmentGraph`, "ATTACHMENT_CONTROLLER", "Jack and host controllers must agree"));
          if (host.state.attachedByJackId !== cardId) issues.push(issue(`cards.${attachment.hostCardId}.state.attachedByJackId`, "ATTACHMENT_RECIPROCAL", "Host must point back to its Jack"));
        }
      }
    }
    if (card.state.attachedByJackId !== undefined) {
      const jackId = card.state.attachedByJackId;
      const jack = typeof jackId === "string" ? state.cards[jackId] : undefined;
      const graph = jack?.state.attachmentGraph as { hostCardId?: unknown } | undefined;
      if (!jack || graph?.hostCardId !== cardId) issues.push(issue(`cards.${cardId}.state.attachedByJackId`, "ATTACHMENT_ORPHAN", "Host Attachment marker must reference a reciprocal Jack graph"));
    }
  }
  for (const cardId of locations.keys()) {
    if (!state.cards[cardId]) issues.push(issue(`locations.${cardId}`, "MISSING_CARD", "Zone references an unknown card"));
  }
  if (state.pendingDeclaration !== null && state.zones.staging.length === 0) {
    issues.push(issue("pendingDeclaration", "STAGING", "Pending declaration requires staged cards"));
  }
  if (state.pendingDeclaration === null && state.zones.staging.length > 0) {
    const phase14 = state.metadata.phase14 as { status?: string; poolFaceUpByCard?: Record<string, boolean> } | undefined;
    const draftPoolActive = phase14?.status === "drafting"
      && state.zones.staging.every((cardId) => Object.prototype.hasOwnProperty.call(phase14.poolFaceUpByCard ?? {}, cardId));
    if (!draftPoolActive) issues.push(issue("zones.staging", "ORPHAN_STAGING", "Staging cannot contain cards without a pending declaration or active Deffy draft pool"));
  }
  const phase13 = state.metadata.phase13 as { forcedDrawByPlayer?: Record<string, unknown>; queuedFuseCardIds?: unknown } | undefined;
  if (phase13?.forcedDrawByPlayer !== undefined) {
    for (const playerId of Object.keys(phase13.forcedDrawByPlayer)) if (!state.players[playerId]) issues.push(issue(`metadata.phase13.forcedDrawByPlayer.${playerId}`, "TIME_BOMB_PLAYER", "Forced Draw target player must exist"));
  }
  if (phase13?.queuedFuseCardIds !== undefined && !Array.isArray(phase13.queuedFuseCardIds)) issues.push(issue("metadata.phase13.queuedFuseCardIds", "TIME_BOMB_QUEUE", "Fuse queue must be an array"));
  return issues;
}

export function assertValidState(state: EngineState): void {
  const issues = validateState(state);
  if (issues.length > 0) throw new EngineError("STATE_INVALID", "Game state failed runtime validation", issues);
}

export function parseState(value: unknown): EngineState {
  if (typeof value !== "object" || value === null) throw new EngineError("STATE_PARSE", "State must be an object");
  const state = value as EngineState;
  assertValidState(state);
  return state;
}

export function roundTripState(state: EngineState): EngineState {
  return parseState(JSON.parse(canonicalize(state)) as unknown);
}

export function parseFixtures(value: unknown): ConformanceFixture[] {
  if (!Array.isArray(value)) throw new EngineError("FIXTURE_PARSE", "Fixture document must be an array");
  const seen = new Set<string>();
  return value.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) throw new EngineError("FIXTURE_PARSE", `Fixture ${index} must be an object`);
    const fixture = entry as ConformanceFixture;
    if (typeof fixture.id !== "string" || fixture.id.length === 0) throw new EngineError("FIXTURE_PARSE", `Fixture ${index} has no id`);
    if (seen.has(fixture.id)) throw new EngineError("FIXTURE_DUPLICATE", `Duplicate fixture id ${fixture.id}`);
    seen.add(fixture.id);
    assertValidState(fixture.initialState);
    if (!Array.isArray(fixture.commands)) throw new EngineError("FIXTURE_PARSE", `Fixture ${fixture.id} commands must be an array`);
    return fixture;
  });
}
