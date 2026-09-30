import { actionLabel, familyLabel, modeLabel, timingLabel } from '../play/action-presenter.js';

export type SemanticCard = Readonly<{
  id: string;
  identity: string | null;
  label: string;
  markers: readonly string[];
}>;

export type SemanticPlayer = Readonly<{
  id: string;
  name: string;
  score: number;
  goal: number;
  handCount: number;
  hand: readonly SemanticCard[];
  points: readonly SemanticCard[];
  enduring: readonly SemanticCard[];
  /** Only fields already authorized in the owning player's projected limits. */
  miniTurnsRemaining?: number | null;
  swapUsed?: boolean | null;
}>;

export type SemanticAction = Readonly<{
  id: string;
  label: string;
  family: string;
  mode: string | null;
  timing: string;
  timingClass?: string;
  sources: readonly string[];
  targets: readonly string[];
  /** Public zero-based position, never a hidden card identity. */
  swapSlot?: number;
  facts: readonly string[];
}>;

export type SemanticEvent = Readonly<{
  id: string;
  type: string;
  label: string;
  actorId: string | null;
  cardRefs: readonly string[];
}>;

export type SemanticGame = Readonly<{
  schemaVersion: 1;
  sessionId: string;
  revision: number | null;
  frameHash: string | null;
  status: 'ready' | 'waiting' | 'completed' | 'unavailable';
  phase: string;
  turn: number;
  activePlayerId: string | null;
  priorityOwnerId: string | null;
  self: SemanticPlayer;
  opponent: SemanticPlayer;
  drawCount: number;
  discardCount: number;
  discardTop: SemanticCard | null;
  exileCount: number;
  swap: readonly SemanticCard[];
  stack: readonly Readonly<{ id: string; label: string; controllerId: string | null }>[];
  actions: readonly SemanticAction[];
  events: readonly SemanticEvent[];
  winner: string | null;
  terminationReason: string | null;
  error: string | null;
  handOrder: readonly string[] | null;
  opponentHandReorderEpoch: number;
  choice: Readonly<{ kind: string; cards: readonly SemanticCard[] }> | null;
  connection: string | null;
}>;

type Options = { readOnly?: boolean; visibility?: 'player' | 'public'; coalesceIdenticalActions?: boolean };
type Data = Record<string, unknown>;

const UNAVAILABLE = 'Game snapshot unavailable.';
const TIMINGS = new Set(['ACTION', 'QUICK', 'INSTANT', 'INTERRUPT', 'SETUP', 'ORDINARY']);
const STATUSES = new Set([
  'HUMAN_DECISION', 'AI_DECISION', 'OPPONENT_DECISION', 'ADVANCING', 'RUNNING',
  'TERMINAL', 'COMPLETED', 'SAVING', 'RESTORING', 'SPECTATING', 'DISCONNECTED',
  'RECONNECTING', 'SETTING_UP', 'READY', 'IN_LOBBY', 'ERROR',
]);
const EVENT_LABELS = new Map([
  ['CORE_ACTION_DECLARED', 'Action declared'],
  ['DECLARATION_COMMITTED', 'Declaration committed'],
  ['CORE_CARD_SCORED', 'Card scored'],
  ['CARD_SCORED', 'Card scored'],
  ['CORE_COUNTER_DECLARED', 'Counter declared'],
  ['COUNTER_DECLARED', 'Counter declared'],
  ['CORE_COUNTER_RESOLVED', 'Counter resolved'],
  ['CORE_RESPONSE_WINDOW_CLOSED', 'Response window closed'],
  ['PRIORITY_CLOSED', 'Priority closed'],
  ['CORE_FULL_TURN_COMPLETED', 'Turn completed'],
  ['CORE_START_PREPARED', 'Turn prepared'],
  ['CORE_FACE_UP_SWAP_DRAW_RESOLVED', 'Face-up swap resolved'],
  ['CORE_ACE_ANCHOR_ENTERED', 'Ace anchor entered'],
  ['CORE_KING_ANCHOR_ENTERED', 'King anchor entered'],
  ['CORE_QUEEN_ANCHOR_ENTERED', 'Queen anchor entered'],
  ['QUEEN_ANCHOR_ENTERED', 'Queen anchor entered'],
  ['CORE_NORMAL_VICTORY', 'Victory recorded'],
  ['CORE_EXHAUSTED_RESOLVED', 'Exhaustion resolved'],
  ['CORE_ROOT_RESOLVED', 'Stack item resolved'],
  ['CORE_ROOT_FIZZLED', 'Stack item fizzled'],
]);

function invalid(): never {
  throw new Error(UNAVAILABLE);
}

function record(value: unknown): Data {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Data;
}

function field(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return undefined;
  if (!Object.hasOwn(descriptor, 'value')) invalid();
  return descriptor.value;
}

function text(value: unknown, max = 512): string {
  // eslint-disable-next-line no-control-regex -- intentional control-character validation for safe display
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) invalid();
  return value;
}

function nullableText(value: unknown): string | null {
  return value == null ? null : text(value);
}

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) invalid();
  return value;
}

function finite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid();
  return value;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 4096) invalid();
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) result.push(field(value, String(index)));
  return result;
}

function flag(value: Data, key: string): boolean {
  const entry = field(value, key);
  if (entry === undefined) return false;
  if (typeof entry !== 'boolean') invalid();
  return entry;
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function parseHandOrder(value: unknown): readonly string[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) return null;
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && entry.length > 0 && entry.length <= 128) {
      result.push(entry);
    }
  }
  return result.length > 0 ? Object.freeze(result) : null;
}

function emptyPlayer(name: string): SemanticPlayer {
  return { id: '', name, score: 0, goal: 0, handCount: 0, hand: [], points: [], enduring: [] };
}

const unavailableGame: SemanticGame = freeze({
  schemaVersion: 1,
  sessionId: '',
  revision: null,
  frameHash: null,
  status: 'unavailable',
  phase: '',
  turn: 0,
  activePlayerId: null,
  priorityOwnerId: null,
  self: emptyPlayer('You'),
  opponent: emptyPlayer('Opponent'),
  drawCount: 0,
  discardCount: 0,
  discardTop: null,
  exileCount: 0,
  swap: [],
  stack: [],
  actions: [],
  events: [],
  winner: null,
  terminationReason: null,
  error: UNAVAILABLE,
  handOrder: null,
  opponentHandReorderEpoch: 0,
  choice: null,
  connection: null,
});

function card(input: unknown, fallbackId: string): SemanticCard {
  const value = record(input);
  const rawId = field(value, 'id');
  const rawIdentity = field(value, 'identity');
  if (rawId === undefined || rawIdentity === undefined) invalid();
  const id = nullableText(rawId);
  const identity = nullableText(rawIdentity);
  const faceDown = flag(value, 'faceDown') || flag(value, 'swapBarFaceDown');
  const hidden = faceDown || identity === null || identity === 'HIDDEN';
  const markers: string[] = [];
  for (const [key, label] of [
    ['tapped', 'Tapped'], ['aegis', 'Aegis'], ['providesGuard', 'Guard'],
    ['exileBound', 'Exile-bound'], ['revealedUntilStart', 'Revealed'],
  ]) {
    if (flag(value, key)) markers.push(label);
  }
  if (flag(value, 'guard') && !markers.includes('Guard')) markers.push('Guard');
  if (nullableText(field(value, 'jackHostId')) !== null || flag(value, 'attached')) markers.push('Attached');
  if (nullableText(field(value, 'jackAttachmentId')) !== null) markers.push('Has attachment');
  if (faceDown) markers.push('Face down');
  return { id: hidden ? fallbackId : id ?? fallbackId, identity: hidden ? null : identity, label: hidden ? 'Hidden card' : identity!, markers };
}

function cards(value: unknown, zone: string): SemanticCard[] {
  const result = list(value).map((entry, index) => card(entry, `hidden:${zone}:${index}`));
  if (new Set(result.map(entry => entry.id)).size !== result.length) invalid();
  return result;
}

function displayName(input: unknown, fallback: string): string {
  if (input == null) return fallback;
  const value = field(record(input), 'displayName');
  return value == null ? fallback : text(value, 128);
}

function knownFamily(value: unknown): string {
  const family = text(value, 128);
  return /^[a-z][a-z0-9-]*$/u.test(family) && typeof familyLabel(family) === 'string' ? family : 'unknown';
}

function safeModeFor(family: string, mode: string | null): string | null {
  if (family === 'unknown' || mode === null) return null;
  const translated: unknown = modeLabel(family, mode);
  if (typeof translated === 'string' && translated !== mode && !mode.startsWith('four-guess-')) return mode;
  if (/^four-guess-(?:[2-9]|10|[AJQK])-(?:[SHDC\u2660\u2665\u2666\u2663]|spades|hearts|diamonds|clubs)$/u.test(mode)) return mode;
  return null;
}

function labelFor(family: string, mode: string | null): string {
  if (family === 'unknown') return 'Action';
  return actionLabel({ family, mode: safeModeFor(family, mode) });
}

function handles(value: Data, primary: string, alternate: string): string[] {
  const preferred = field(value, primary);
  return list(preferred === undefined ? field(value, alternate) : preferred).map(entry => text(entry));
}

function actions(input: unknown, revision: number, frameHash: string, swapIds: readonly (string | null)[], coalesce: boolean): SemanticAction[] {
  const descriptions = new Map<string, string>();
  const entries = list(input).flatMap(entry => {
    const value = record(entry);
    const id = text(field(value, 'actionId'));
    const family = knownFamily(field(value, 'family'));
    const mode = nullableText(field(value, 'mode'));
    const timingClass = text(field(value, 'timingClass'), 32);
    if (!TIMINGS.has(timingClass)) invalid();
    const timing: string = timingLabel(timingClass);
    const safeMode = safeModeFor(family, mode);
    const sources = handles(value, 'sourceHandles', 'sourceCardIds');
    const targets = handles(value, 'targetHandles', 'targetCardIds');
    const rawSlot = field(value, 'swapSlot');
    let swapSlot: number | undefined;
    if (family === 'swap-bar') {
      if (rawSlot !== undefined) {
        swapSlot = count(rawSlot);
        if (swapSlot >= swapIds.length) invalid();
      } else {
        const index = swapIds.findIndex(id => id !== null && targets.includes(id));
        if (index >= 0) swapSlot = index;
      }
    }
    // Replace hidden swap handles with public positions at the semantic boundary.
    // The action ID still identifies the exact command in the authority's vault.
    const safeTargets = family === 'swap-bar' && swapSlot !== undefined ? [`hidden:swap:${swapSlot}`] : targets;
    if (coalesce) {
      // The canonical enumerator can repeat one action ID through multiple
      // discovery paths. Coalesce only identical structured descriptions,
      // including untranslated metadata. A conflicting duplicate fails closed.
      // This never changes the supplied frame hash or the vault's original ID.
      const description = JSON.stringify([field(value, 'family'), mode, timingClass, sources, targets, swapSlot]);
      const previous = descriptions.get(id);
      if (previous !== undefined) { if (previous !== description) invalid(); return []; }
      descriptions.set(id, description);
    }
    return [{ id, family, mode: safeMode, label: labelFor(family, mode), timing, timingClass, sources, targets: safeTargets, ...(swapSlot !== undefined ? { swapSlot } : {}) }];
  });
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) invalid();
  const alternativeSample = entries.slice(0, 9);
  return entries.map(entry => {
    const alternatives = alternativeSample.filter(other => other.id !== entry.id).slice(0, 8);
    const alternativeScope = entries.length > 9 ? ` (first 8 of ${entries.length - 1})` : '';
    return {
      ...entry,
      facts: [
        `Enumerated action: ${entry.id}`,
        `Revision: ${revision}`,
        `Decision frame: ${frameHash}`,
        `Timing: ${entry.timing}`,
        `Sources: ${entry.sources.length}`,
        `Targets: ${entry.targets.length}`,
        `Alternative action IDs${alternativeScope}: ${alternatives.map(other => other.id).join(', ') || 'none'}`,
      ],
    };
  });
}

function seat(value: unknown, ids: readonly string[]): string | null {
  if (value == null) return null;
  const id = text(value);
  if (!ids.includes(id)) invalid();
  return id;
}

function publicEntry(value: Data): boolean {
  const visibility = field(value, 'visibility');
  return (visibility === undefined || visibility === 'public') && !flag(value, 'private');
}

function events(input: unknown, ids: readonly string[]): SemanticEvent[] {
  if (input === undefined) return [];
  const result: SemanticEvent[] = [];
  list(input).forEach((entry, index) => {
    const value = record(entry);
    if (!publicEntry(value)) return;
    const type = text(field(value, 'type'), 128);
    const label = EVENT_LABELS.get(type);
    if (!label) return;
    const actor = field(value, 'controllerId') ?? field(value, 'actorId');
    // Safely extract card references from payload without triggering hostile
    // getters. If payload is absent, a getter, or non-record, skip it.
    const cardRefs: string[] = [];
    const payloadDesc = Object.getOwnPropertyDescriptor(value, 'payload');
    if (payloadDesc && Object.hasOwn(payloadDesc, 'value') && payloadDesc.value !== null && typeof payloadDesc.value === 'object' && !Array.isArray(payloadDesc.value)) {
      const payload = payloadDesc.value as Data;
      for (const key of ['cardId', 'targetId', 'sourceCardId', 'jackCardId', 'hostCardId']) {
        const ref = nullableText(field(payload, key));
        if (ref !== null) cardRefs.push(ref);
      }
    }
    result.push({ id: `event:${index}`, type, label, actorId: seat(actor, ids), cardRefs });
  });
  return result;
}

export function buildSemanticGame(input: unknown, options: Options = {}): SemanticGame {
  try {
    const policy = record(options);
    const visibility = field(policy, 'visibility');
    if (visibility !== undefined && visibility !== 'player' && visibility !== 'public') invalid();
    const publicOnly = flag(policy, 'readOnly') || visibility === 'public';
    const snapshot = record(input);
    const sessionId = text(field(snapshot, 'sessionId'));
    const status = text(field(snapshot, 'status'), 32);
    if (!STATUSES.has(status) || status === 'ERROR') invalid();
    const view = record(field(snapshot, 'playerView'));
    const human = record(field(snapshot, 'human'));
    const selfId = text(field(view, 'actorId'));
    const humanId = nullableText(field(human, 'playerId'));
    if ((!publicOnly || humanId !== null) && humanId !== selfId) invalid();
    const own = record(field(view, 'own'));
    const opponents = list(field(view, 'opponents'));
    if (opponents.length !== 1) invalid();
    const other = record(opponents[0]);
    const opponentId = text(field(other, 'playerId'));
    if (selfId === opponentId) invalid();
    const ids = [selfId, opponentId];
    const revision = count(field(view, 'revision'));
    const phase = text(field(view, 'phase'), 64);
    const turn = count(field(view, 'fullTurnSequence'));
    const activePlayerId = seat(field(view, 'activePlayerId'), ids);
    const priority = field(view, 'priority');
    const priorityOwnerId = priority == null ? null : seat(field(record(priority), 'ownerId'), ids);
    const match = record(field(snapshot, 'match'));
    const winner = seat(field(match, 'winner'), ids);
    const terminationReason = nullableText(field(match, 'terminationReason'));
    const completed = status === 'TERMINAL' || status === 'COMPLETED';
    if (!completed && (winner !== null || terminationReason !== null)) invalid();
    const ownHand = field(own, 'hand');
    const hand = publicOnly ? [] : cards(ownHand, `${selfId}:hand`);
    const ownHandCount = field(own, 'handCount');
    const handCount = ownHandCount === undefined ? list(ownHand).length : count(ownHandCount);
    if (!publicOnly && handCount !== hand.length) invalid();
    const ownLimits = record(field(own, 'limits') ?? {});
    const rawMiniTurns = publicOnly ? undefined : field(ownLimits, 'miniTurnsRemaining');
    const rawSwapUsed = publicOnly ? undefined : field(ownLimits, 'swapBarUsedThisFT');
    if (rawSwapUsed !== undefined && typeof rawSwapUsed !== 'boolean') invalid();
    const self: SemanticPlayer = {
      id: selfId, name: displayName(human, publicOnly ? selfId : 'You'),
      score: finite(field(own, 'securedPoints')), goal: finite(field(own, 'goal')),
      handCount, hand, points: cards(field(own, 'pr'), `${selfId}:points`), enduring: cards(field(own, 'er'), `${selfId}:enduring`),
      miniTurnsRemaining: rawMiniTurns === undefined ? null : count(rawMiniTurns),
      swapUsed: rawSwapUsed === undefined ? null : rawSwapUsed,
    };
    const opponent: SemanticPlayer = {
      id: opponentId, name: displayName(field(snapshot, 'opponent'), publicOnly ? opponentId : 'Opponent'),
      score: finite(field(other, 'securedPoints')), goal: finite(field(other, 'goal')),
      handCount: count(field(other, 'handCount')), hand: [],
      points: cards(field(other, 'pr'), `${opponentId}:points`), enduring: cards(field(other, 'er'), `${opponentId}:enduring`),
    };
    let frameHash: string | null = null;
    let legalActions: readonly SemanticAction[] = [];
    const rawSwap = list(field(view, 'swapBar'));
    const swapIds = rawSwap.map(entry => nullableText(field(record(entry), 'id')));
    const decision = field(snapshot, 'decision');
    if (decision !== null) {
      const value = record(decision);
      const actorId = seat(field(value, 'actorId'), ids);
      if (actorId === null || count(field(value, 'stateRevision')) !== revision) invalid();
      const isHuman = field(value, 'isHuman');
      if (typeof isHuman !== 'boolean') invalid();
      const hash = field(value, 'frameHash');
      if (!publicOnly || hash != null) frameHash = text(hash);
      if (!publicOnly && !completed && (status === 'HUMAN_DECISION' || status === 'RUNNING') && isHuman && actorId === humanId) {
        legalActions = actions(field(value, 'legalActions'), revision, frameHash!, swapIds, flag(policy, 'coalesceIdenticalActions'));
      }
    }
    const stack = list(field(view, 'stack')).flatMap(entry => {
      const value = record(entry);
      if (!publicEntry(value)) return [];
      const actionType = field(value, 'actionType');
      return [{
        id: text(field(value, 'id')),
        label: actionType == null ? 'Stack item' : labelFor(knownFamily(actionType), null),
        controllerId: seat(field(value, 'controllerId'), ids),
      }];
    });
    if (new Set(stack.map(entry => entry.id)).size !== stack.length) invalid();
    const discardCount = count(field(view, 'gyCount'));
    const top = field(view, 'gyTopCard');
    if (top === undefined || (discardCount === 0 && top !== null) || (discardCount > 0 && top === null)) invalid();
    let choice: SemanticGame['choice'] = null;
    const pendingChoice = publicOnly ? null : field(view, 'pendingChoice');
    if (pendingChoice != null) {
      const value = record(pendingChoice);
      const kind = field(value, 'kind');
      const allowed = new Set(['core-rank3-present', 'core-rank3-take', 'core-rank3-discard', 'core-rank5-rummage', 'core-rank6-dig', 'core-rank7-assign', 'core-rank7-generated-effect', 'core-nine-anchor-discard', 'core-natural-four-reorder', 'core-bj-exile-recycle', 'core-seven-scoring-trigger', 'rank3-present', 'rank3-take', 'rank3-discard', 'rank5-rummage', 'rank6-dig', 'rank7-assign', 'rank7-generated-effect', 'nine-anchor-discard', 'rank7-scoring-trigger']);
      // Do not read an arbitrary pending-choice context or knownCards registry.
      if (typeof kind === 'string' && allowed.has(kind)) {
        choice = { kind, cards: cards(field(value, 'optionCards'), 'choice') };
      }
    }
    const rawConnection = field(record(field(snapshot, 'opponent') ?? {}), 'connectionState');
    const connection = typeof rawConnection === 'string' && ['CONNECTED', 'DISCONNECTED', 'RECONNECTING'].includes(rawConnection) ? rawConnection : null;
    return freeze({
      schemaVersion: 1, sessionId, revision, frameHash: publicOnly ? null : frameHash,
      status: completed ? 'completed' : legalActions.length > 0 ? 'ready' : 'waiting',
      phase, turn, activePlayerId, priorityOwnerId, self, opponent,
      drawCount: count(field(view, 'dpCount')), discardCount,
      discardTop: top === null ? null : card(top, 'hidden:discard:top'),
      exileCount: count(field(view, 'exileCount')), swap: cards(field(view, 'swapBar'), 'swap'),
      stack, actions: legalActions, events: events(field(snapshot, 'recentEvents'), ids),
      winner, terminationReason, error: null,
      handOrder: parseHandOrder(field(snapshot, 'handOrder')),
      opponentHandReorderEpoch: field(snapshot, 'opponentHandReorderEpoch') === undefined
        ? 0
        : count(field(snapshot, 'opponentHandReorderEpoch')),
      choice, connection,
    });
  } catch (error) {
    console.warn('[buildSemanticGame] snapshot rejected:', (error as Error)?.message ?? error);
    return unavailableGame;
  }
}
