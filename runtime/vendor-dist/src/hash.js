import { createHash } from "node:crypto";
import { canonicalize } from "./canonical-json.js";
export function sha256Text(text) {
    return createHash("sha256").update(text, "utf8").digest("hex");
}
export function hashCanonical(value) {
    return sha256Text(canonicalize(value));
}
//# sourceMappingURL=hash.js.map