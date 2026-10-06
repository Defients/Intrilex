import type { EngineState } from "./types.js";

/**
 * Experimental rule parameters — scoped per-match overrides used by the Rule
 * Mutation Chamber. Overrides are carried inside EngineState.metadata under
 * the "experimentalRuleOverrides" key so they are:
 *
 *   - part of the initial state (hashed into replays and state hashes),
 *   - cloned with every command resolution (no cross-match leakage),
 *   - absent in normal play (canonical defaults apply, byte-identical behavior).
 *
 * The override map is the ONLY injection seam. It is validated at match setup
 * (createCoreMatchState) and consulted at a small set of explicitly patched
 * resolution/enumeration sites. Unlisted rule constants remain hardcoded and
 * are not mutable.
 */

export type RuleOverrideValue = number | boolean;
export type RuleOverrides = Readonly<Record<string, RuleOverrideValue>>;

export interface RuleParameterSpec {
  readonly id: string;
  readonly kind: "number" | "flag";
  readonly baseline: number | boolean;
  readonly min?: number;
  readonly max?: number;
  readonly label: string;
}

const num = (id: string, baseline: number, min: number, max: number, label: string): RuleParameterSpec =>
  Object.freeze({ id, kind: "number", baseline, min, max, label });
const flag = (id: string, label: string): RuleParameterSpec =>
  Object.freeze({ id, kind: "flag", baseline: true, label });

const rankPoint = (rank: string, baseline: number): RuleParameterSpec =>
  num(`rank.${rank}.prPoints`, baseline, 0, 15, `${rank} Points value`);

export const EXPERIMENTAL_RULE_PARAMETERS: Readonly<Record<string, RuleParameterSpec>> = Object.freeze(
  Object.fromEntries([
    num("match.goal", 21, 5, 54, "Victory goal (secured points)"),
    num("setup.hand.first", 5, 0, 10, "Opening hand — first player"),
    num("setup.hand.second", 6, 0, 10, "Opening hand — second player"),
    num("miniTurns.perTurn", 1, 0, 4, "Mini-Turns granted each Full Turn"),
    num("miniTurns.hardCap", 3, 1, 9, "Mini-Turn hard cap"),
    num("draw.emptyHand", 2, 1, 3, "Draw count when hand is empty"),
    num("rank10.heartTempo.miniTurns", 2, 0, 4, "10♥ Tempo Spike Mini-Turn grant"),
    num("rank10.heartTempo.draw", 1, 0, 3, "10♥ Tempo Spike draw"),
    num("super.jackTempo.miniTurns", 2, 0, 4, "⭐J Tempo Mini-Turn grant"),
    num("ultra.twoBlackTwoRed.miniTurns", 2, 0, 4, "Ultra 2B+2R Mini-Turn grant"),
    num("ultra.twoBlackTwoRed.draw", 2, 0, 4, "Ultra 2B+2R draw"),
    rankPoint("A", 4), rankPoint("2", 2), rankPoint("3", 3), rankPoint("4", 4), rankPoint("5", 5),
    rankPoint("6", 6), rankPoint("7", 7), rankPoint("8", 8), rankPoint("9", 9), rankPoint("10", 10),
    rankPoint("J", 3), rankPoint("Q", 2), rankPoint("K", 8), rankPoint("RJ", 5), rankPoint("BJ", 11),
    flag("combo.supers.enabled", "Super Combos (⭐ paired plays)"),
    flag("combo.ultras.enabled", "Ultra Combos (3-4 card recipes)"),
    flag("voltage.enabled", "Voltage declarations"),
    flag("royalMarriage.enabled", "Royal Marriage"),
    flag("queensCourt.enabled", "Queen's Court"),
    flag("royalShield.enabled", "Royal Shield (Queen-count counter protection)"),
    flag("foundation.bonus.enabled", "10♣ Foundation bonus score"),
    flag("suddenDeath.enabled", "Sudden Death declarations"),
  ].map((spec) => [spec.id, spec]))
);

export const EXPERIMENTAL_RULES_METADATA_KEY = "experimentalRuleOverrides";

/**
 * The sanitized override map carried by a state, or null when the match runs
 * canonical rules. States produced before this feature shipped (or produced by
 * the control arm of an experiment) return null.
 */
export function readRuleOverrides(state: Readonly<EngineState>): RuleOverrides | null {
  const value = state.metadata?.[EXPERIMENTAL_RULES_METADATA_KEY];
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) return null;
  return value as RuleOverrides;
}

export function hasRuleOverrides(state: Readonly<EngineState>): boolean {
  return readRuleOverrides(state) !== null;
}

/**
 * Strictly validate a caller-supplied override map. Returns a sanitized,
 * insertion-ordered (sorted) plain object containing only declared parameter
 * ids. Throws a coded Error on unknown ids, kind mismatches, non-finite or
 * out-of-range values, and on attempts to override a parameter to its own
 * baseline is ALLOWED (a no-op mutation is still a valid explicit mutation).
 */
export function validateRuleOverrides(input: unknown): Record<string, RuleOverrideValue> {
  if (input === null || input === undefined) return {};
  if (typeof input !== "object" || Array.isArray(input)) {
    throw Object.assign(new Error("RULE_OVERRIDES_NOT_AN_OBJECT"), { code: "RULE_OVERRIDES_NOT_AN_OBJECT" });
  }
  const out: Record<string, RuleOverrideValue> = {};
  for (const key of Object.keys(input as Record<string, unknown>).sort()) {
    const spec = EXPERIMENTAL_RULE_PARAMETERS[key];
    if (!spec) {
      throw Object.assign(new Error(`Unknown experimental rule parameter: ${key}`), { code: "RULE_OVERRIDE_UNKNOWN_PARAMETER", parameter: key });
    }
    const value = (input as Record<string, unknown>)[key];
    if (spec.kind === "number") {
      if (typeof value !== "number" || !Number.isInteger(value)) {
        throw Object.assign(new Error(`Rule parameter ${key} requires an integer value`), { code: "RULE_OVERRIDE_KIND_MISMATCH", parameter: key });
      }
      if ((spec.min !== undefined && value < spec.min) || (spec.max !== undefined && value > spec.max)) {
        throw Object.assign(new Error(`Rule parameter ${key} value ${value} outside permitted range ${spec.min}–${spec.max}`), { code: "RULE_OVERRIDE_OUT_OF_RANGE", parameter: key });
      }
    } else {
      if (typeof value !== "boolean") {
        throw Object.assign(new Error(`Rule parameter ${key} requires a boolean value`), { code: "RULE_OVERRIDE_KIND_MISMATCH", parameter: key });
      }
    }
    out[key] = value;
  }
  return out;
}

/** Resolve a numeric rule parameter for this state (override → registry baseline → fallback). */
export function resolveRuleNumber(state: Readonly<EngineState>, id: string, fallback?: number): number {
  const overrides = readRuleOverrides(state);
  const direct = overrides?.[id];
  if (typeof direct === "number") return direct;
  const spec = EXPERIMENTAL_RULE_PARAMETERS[id];
  if (spec && spec.kind === "number") return spec.baseline as number;
  if (fallback !== undefined) return fallback;
  throw Object.assign(new Error(`Unknown numeric rule parameter: ${id}`), { code: "RULE_PARAMETER_UNKNOWN", parameter: id });
}

/** Resolve a boolean rule parameter for this state (override → registry baseline → fallback). */
export function resolveRuleFlag(state: Readonly<EngineState>, id: string, fallback?: boolean): boolean {
  const overrides = readRuleOverrides(state);
  const direct = overrides?.[id];
  if (typeof direct === "boolean") return direct;
  const spec = EXPERIMENTAL_RULE_PARAMETERS[id];
  if (spec && spec.kind === "flag") return spec.baseline as boolean;
  if (fallback !== undefined) return fallback;
  throw Object.assign(new Error(`Unknown boolean rule parameter: ${id}`), { code: "RULE_PARAMETER_UNKNOWN", parameter: id });
}
