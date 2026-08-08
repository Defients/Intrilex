import { createHash } from "node:crypto";
import { canonicalize } from "./canonical-json.js";

export function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function hashCanonical(value: unknown): string {
  return sha256Text(canonicalize(value));
}
