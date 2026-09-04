import { advancedStackClass } from "./core-advanced.js";
import type { CoreFoundationActionType, CorePrimaryAction, CoreResponseKind, CoreStackPayload, EngineState, PlayerId, StackItem } from "./types.js";

export const CORE_RESPONSE_AUTHORITY_PROFILE = Object.freeze({
  id: "core-response-authority",
  displayName: "Core Response Authority — Quick, Instant & Counter Stack",
  rulesVersion: "4.1",
  engineVersion: "4.2.2",
  playerCount: 2,
  enabledModules: [] as const,
  supportedRootActions: ["draw", "face-up-swap", "play-for-points", "play-for-effect", "scuttle", "exhausted-pass"] as const,
  supportedResponses: [
    "A-base-counter", "A-anchor-counter", "A-spade-exile-counter", "8-scuttle-counter",
    "8-spade-free-scuttle", "8-aegis-field-quick", "9-tap", "J-disrupt",
    "Q-aegis-quick", "K-anchor-counter"
  ] as const,
  excludedSystems: [
    "private-choice-effects", "two-quick", "four-natural-quick", "six-swap-peek-quick",
    "nine-goal-shift", "rank10-interrupt", "supers", "ultras", "voltage",
    "royal-marriage", "optional-modules", "multiplayer"
  ] as const,
  rationale: "Engine-owned Core priority circulation and audited public Quick/Instant responses. Private-choice and advanced multi-card timing remains fail-closed."
});

export function isCoreResponseProfile(state: Readonly<EngineState>): boolean {
  const runtime = state.metadata.coreAuthority as { profileId?: string } | undefined;
  return runtime?.profileId === CORE_RESPONSE_AUTHORITY_PROFILE.id || runtime?.profileId === "core-private-choice-authority" || runtime?.profileId === "core-advanced-authority";
}

export function primaryDescriptor(action: CorePrimaryAction): { actionType: CoreFoundationActionType; stackClass: Extract<CoreStackPayload, {kind:"primary"}>["stackClass"] } {
  switch (action.kind) {
    case "core-draw": return { actionType: "draw", stackClass: "draw" };
    case "core-face-up-swap-draw": return { actionType: "face-up-swap", stackClass: "swap" };
    case "core-score": return { actionType: "play-for-points", stackClass: "points" };
    case "core-scuttle": return { actionType: "scuttle", stackClass: "scuttle" };
    case "core-exhausted-pass": return { actionType: "exhausted-pass", stackClass: "pass" };
    case "core-resolve-advanced": return { actionType: "play-for-effect", stackClass: advancedStackClass(action.advanced) };
    case "core-resolve-rank-action": return { actionType: "play-for-effect", stackClass: "ordinary-effect" };
    case "core-resolve-effect":
    case "core-resolve-generated-effect": {
      const k = action.effect.kind;
      return { actionType: "play-for-effect", stackClass: k.endsWith("-anchor") ? "anchor" : "ordinary-effect" };
    }
  }
}

export function currentPriorityActor(state: Readonly<EngineState>): PlayerId | null {
  return state.priority?.open === true ? state.priority.order[state.priority.index] ?? null : null;
}

export function currentCoreStackTarget(state: Readonly<EngineState>): StackItem | null {
  return state.stack.at(-1) ?? null;
}

// ── Declaration-Class × Counter-Authority Matrix (IMPL-12) ─────────
//
// Per rulebook v4.3.1:
//   RB:940,949-956,1480 — Rank-10 effects are ordinary effect plays
//   counterable by Aces (Base Ace and A♠).
//   RB:936-945 — A♠ counters ordinary effect plays including Rank-10.
//   RB:1480 — Base Ace counters eligible effect plays including Supers.
//
// The previous code used ad hoc `stackClass === "ordinary-effect"` checks
// that incorrectly blocked Rank-10 effects and Supers from being countered
// by Base Ace and A♠. This matrix centralizes the authority as data.

/**
 * Declaration class for a primary stack payload.
 * Maps the existing `stackClass` to a finer-grained classification
 * that the counter authority matrix can reason about.
 */
export type DeclarationClass =
  | "draw" | "swap" | "points" | "ordinary-effect" | "anchor" | "scuttle" | "pass"
  | "super" | "ultra" | "royal-marriage" | "queens-court" | "rank10" | "voltage";

/**
 * Derive the declaration class of a primary stack payload.
 * For response payloads, returns null (responses are counters, not
 * declarable plays — counter-counter chains are handled separately).
 */
export function declarationClassOf(payload: CoreStackPayload): DeclarationClass | null {
  if (payload.kind === "primary") return payload.stackClass;
  return null;
}

/**
 * Counter authority matrix: maps each counter kind to the set of
 * declaration classes it is authorized to counter (for primary targets).
 *
 * Counters not listed here (super-ace-counter, ultra-three-red, jack-disrupt,
 * nine-tap, eight-spade-free-scuttle, eight-aegis-field, queen-aegis-quick,
 * board-lock-quick) have special handling:
 * - super-ace-counter / ultra-three-red: can counter any target (Queen defense
 *   check is separate).
 * - jack-disrupt: can counter any opponent primary mini-turn action.
 * - nine-tap / eight-spade-free-scuttle: target PR cards, not stack items.
 * - eight-aegis-field / queen-aegis-quick / board-lock-quick: Quick effects,
 *   not stack counters.
 */
export const COUNTER_AUTHORITY_MATRIX: Partial<Record<CoreResponseKind, DeclarationClass[]>> = {
  "base-ace-counter": ["ordinary-effect", "rank10", "super"],
  "anchor-ace-counter": ["ordinary-effect", "rank10", "super"],
  "spade-ace-counter": ["ordinary-effect", "rank10", "super"],
  "eight-scuttle-counter": ["scuttle"],
  "king-anchor-counter": ["anchor"],
  "king-spade-counter": ["super", "queens-court", "royal-marriage"],
  "rank10-stack-theft": ["ordinary-effect", "rank10", "anchor"],
};

/**
 * Responses that CANNOT be countered by each counter kind (counter-counter chains).
 * Any response NOT in this blocklist for the given counter kind is counterable.
 * Board Lock is handled separately — only ⭐A and 3-Red Ultra can counter it.
 */
const COUNTER_CHAIN_BLOCKLIST: Partial<Record<CoreResponseKind, CoreResponseKind[]>> = {
  "base-ace-counter": ["spade-ace-counter", "eight-spade-free-scuttle", "ultra-three-red", "board-lock-quick"],
  "anchor-ace-counter": ["spade-ace-counter", "eight-spade-free-scuttle", "ultra-three-red", "board-lock-quick"],
  "spade-ace-counter": ["spade-ace-counter", "eight-spade-free-scuttle", "ultra-three-red", "board-lock-quick"],
  "king-spade-counter": ["board-lock-quick", "ultra-three-red"],
};

/**
 * Check whether a counter kind is authorized to target a stack item
 * based on the declaration-class × counter-authority matrix.
 *
 * This replaces the ad hoc `targetAcceptsBaseAce` and `targetAcceptsSpadeAce`
 * functions with a centralized, data-driven check.
 */
export function targetAcceptsCounter(target: StackItem, counterKind: CoreResponseKind): boolean {
  const payload = target.coreAuthority;
  if (!payload) return false;

  // ⭐A and 3-Red Ultra can counter any target (Queen defense check is separate)
  if (counterKind === "super-ace-counter" || counterKind === "ultra-three-red") return true;

  // Jack Disrupt can counter any opponent primary mini-turn action
  if (counterKind === "jack-disrupt") return payload.kind === "primary";

  // Board Lock may only be countered by ⭐A / 3-Red Ultra authority
  if (payload.kind === "response" && payload.responseKind === "board-lock-quick") return false;

  // For response targets (counter-counter chains), use the blocklist
  if (payload.kind === "response") {
    const blocklist = COUNTER_CHAIN_BLOCKLIST[counterKind];
    if (!blocklist) return true; // No blocklist → can counter any response
    return !blocklist.includes(payload.responseKind);
  }

  // For primary targets, use the declaration-class matrix
  const acceptable = COUNTER_AUTHORITY_MATRIX[counterKind];
  if (!acceptable || acceptable.length === 0) return false;

  const declClass = declarationClassOf(payload);
  if (!declClass) return false;

  return acceptable.includes(declClass);
}
