function normalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new TypeError("Canonical JSON cannot encode non-finite numbers");
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(normalize);
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort()) {
    const current = input[key];
    if (current !== undefined) output[key] = normalize(current);
  }
  return output;
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function canonicalClone<T>(value: T): T {
  return JSON.parse(canonicalize(value)) as T;
}
