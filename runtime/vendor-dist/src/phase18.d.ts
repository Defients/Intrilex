import type { ModuleCompatibilityResult, ModuleKey } from "./types.js";
export declare const MODULES: readonly ModuleKey[];
export declare function modulePairCompatibility(a: ModuleKey, b: ModuleKey): ModuleCompatibilityResult;
export declare function validateModuleConfiguration(enabled: ModuleKey[], eventApproved?: ModuleKey[]): {
    legal: boolean;
    problems: Array<{
        pair: [ModuleKey, ModuleKey];
        result: ModuleCompatibilityResult;
    }>;
};
export declare function buildCompatibilityMatrix(): Record<ModuleKey, Record<ModuleKey, ModuleCompatibilityResult>>;
export interface IntegrationScenario {
    id: string;
    modules: ModuleKey[];
    eventApproved?: ModuleKey[];
    expectedLegal: boolean;
    preservedProperties: string[];
}
export interface IntegrationScenarioResult extends IntegrationScenario {
    legal: boolean;
    status: "PASS" | "FAIL";
    configurationHash: string;
    problems: ReturnType<typeof validateModuleConfiguration>["problems"];
}
export declare function runIntegrationScenarios(scenarios: IntegrationScenario[]): {
    results: IntegrationScenarioResult[];
    aggregateHash: string;
};
export declare const DEFAULT_INTEGRATION_SCENARIOS: IntegrationScenario[];
export declare function renderCompatibilityMatrixMarkdown(): string;
