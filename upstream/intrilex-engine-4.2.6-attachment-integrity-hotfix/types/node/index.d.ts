declare module "node:crypto" {
  export interface Hash { update(data: string | Uint8Array, encoding?: string): Hash; digest(encoding: "hex"): string; }
  export function createHash(algorithm: string): Hash;
}
declare module "node:fs/promises" {
  export function readFile(path: string, encoding?: "utf8"): Promise<any>;
  export function writeFile(path: string, data: string | Uint8Array, encoding?: "utf8"): Promise<void>;
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>;
  export function readdir(path: string): Promise<string[]>;
  export function readdir(path: string, options: { withFileTypes: true }): Promise<Array<{ name: string; isDirectory(): boolean }>>;
  export function stat(path: string): Promise<{ size: number }>;
}
declare module "node:path" {
  const path: {
    join(...parts: string[]): string;
    resolve(...parts: string[]): string;
    dirname(input: string): string;
    relative(from: string, to: string): string;
    sep: string;
  };
  export default path;
}
declare module "node:url" { export function fileURLToPath(url: string | URL): string; }
declare module "node:test" { const test: (name: string, fn: () => void | Promise<void>) => void; export default test; }
declare module "node:assert/strict" {
  const assert: {
    ok(value: unknown, message?: string): asserts value;
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    doesNotMatch(value: string, regexp: RegExp, message?: string): void;
    match(value: string, regexp: RegExp, message?: string): void;
    doesNotThrow(fn: () => unknown, message?: string): void;
  };
  export default assert;
}
declare const process: {
  argv: string[];
  exitCode?: number;
};
