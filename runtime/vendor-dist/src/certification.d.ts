export interface FinalReleaseCertification {
    verdict: "PASS" | "FAIL";
    engineVersion: "4.1.0";
    certifiedReplayCount: number;
    publicLeakFailures: string[];
    invariantFuzzCases: number;
    invariantFuzzFailures: string[];
    sourceTestCoverage: {
        canonicalTotal: 120;
        uniqueSourceIds: number;
        missingSourceIds: string[];
        duplicateSourceIds: string[];
    };
    independentRuntime: {
        runtime: string;
        verifiedPairCount: number;
        failureCount: number;
        aggregateHash: string;
    };
    preservedPhase218Aggregate: string;
    finalConformanceAggregate: string;
    simulationCampaignHash: string;
    interpretationBoundaries: string[];
    aggregateHash: string;
}
export declare function runReleaseCandidateCertification(projectRoot: string): Promise<FinalReleaseCertification>;
