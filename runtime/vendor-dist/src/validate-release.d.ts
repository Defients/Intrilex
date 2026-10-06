type Check = {
    name: string;
    status: "PASS" | "FAIL";
    detail: string;
};
export declare function validateRelease(projectRoot: string): Promise<{
    verdict: "PASS" | "FAIL";
    checks: Check[];
}>;
export {};
