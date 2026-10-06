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
export declare const EXPERIMENTAL_RULE_PARAMETERS: Readonly<Record<string, RuleParameterSpec>>;
export declare const EXPERIMENTAL_RULES_METADATA_KEY = "experimentalRuleOverrides";
/**
 * The sanitized override map carried by a state, or null when the match runs
 * canonical rules. States produced before this feature shipped (or produced by
 * the control arm of an experiment) return null.
 */
export declare function readRuleOverrides(state: Readonly<EngineState>): RuleOverrides | null;
export declare function hasRuleOverrides(state: Readonly<EngineState>): boolean;
/**
 * Strictly validate a caller-supplied override map. Returns a sanitized,
 * insertion-ordered (sorted) plain object containing only declared parameter
 * ids. Throws a coded Error on unknown ids, kind mismatches, non-finite or
 * out-of-range values, and on attempts to override a parameter to its own
 * baseline is ALLOWED (a no-op mutation is still a valid explicit mutation).
 */
export declare function validateRuleOverrides(input: unknown): Record<string, RuleOverrideValue>;
/** Resolve a numeric rule parameter for this state (override → registry baseline → fallback). */
export declare function resolveRuleNumber(state: Readonly<EngineState>, id: string, fallback?: number): number;
/** Resolve a boolean rule parameter for this state (override → registry baseline → fallback). */
export declare function resolveRuleFlag(state: Readonly<EngineState>, id: string, fallback?: boolean): boolean;
