export interface SimulationBaselineReport {
    reportVersion: 2;
    rulesVersion: "4.1";
    engineVersion: string;
    scenarioBaseline: Record<string, unknown>;
    fullMatchCampaign: Record<string, unknown>;
    deterministicReproduction: {
        campaignHashA: string;
        campaignHashB: string;
        matched: boolean;
    };
    catalogHash: string;
}
export declare function runSimulationBaseline(projectRoot: string): Promise<SimulationBaselineReport>;
