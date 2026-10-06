import type { ConformanceFixture } from "./types.js";
export interface FixtureRunReport {
    id: string;
    title: string;
    status: "PASS" | "FAIL";
    repeatedRuns: number;
    initialStateHash: string;
    finalStateHash: string;
    eventLogHash: string;
    replayHash: string;
    accepted: boolean[];
    failures: string[];
}
export interface ConformanceReport {
    reportVersion: 1;
    rulesVersion: "4.1";
    engineVersion: string;
    fixtureFiles: string[];
    fixtureCount: number;
    repeatCount: number;
    passed: number;
    failed: number;
    deterministic: boolean;
    fixtures: FixtureRunReport[];
    aggregateHash: string;
}
export declare function loadFixtures(fixturePath: string): Promise<ConformanceFixture[]>;
export declare function runConformance(projectRoot: string, repeatCount?: number): Promise<ConformanceReport>;
