// ═══════════════════════════════════════════════════════════════
// response-repair.mjs — Constrained repair for malformed model output.
// Extracts JSON from prose/markdown, closes truncated objects, removes
// trailing commas, and retries parse. Never claims a repair that does
// not yield valid JSON.
// ═══════════════════════════════════════════════════════════════

/**
 * Attempt to extract a JSON object from a raw model response.
 * @returns {{ json: object|null, raw: string, method: string, attempts: Array }}
 */
export function extractAndRepair(rawText) {
  const raw = typeof rawText === 'string' ? rawText : String(rawText ?? '');
  const attempts = [];
  const record = (method, ok, detail) => attempts.push({ method, ok, detail });

  // 1. Direct parse
  try { const j = JSON.parse(raw); record('direct-parse', true, 'parsed cleanly'); return { json: j, raw, method: 'direct-parse', attempts }; }
  catch (e) { record('direct-parse', false, e.message); }

  // 2. Strip markdown code fences ```json ... ```
  const fenced = stripCodeFences(raw);
  if (fenced !== raw) {
    try { const j = JSON.parse(fenced); record('strip-fences', true, 'parsed after fence removal'); return { json: j, raw, method: 'strip-fences', attempts }; }
    catch (e) { record('strip-fences', false, e.message); }
  }

  // 3. Extract the largest balanced { ... } region
  const extracted = extractLargestObject(fenced);
  if (extracted) {
    try { const j = JSON.parse(extracted); record('extract-object', true, 'parsed after object extraction'); return { json: j, raw, method: 'extract-object', attempts }; }
    catch (e) { record('extract-object', false, e.message); }
  }

  // 4. Trailing comma removal
  const noCommas = removeTrailingCommas(extracted || fenced);
  if (noCommas !== (extracted || fenced)) {
    try { const j = JSON.parse(noCommas); record('remove-trailing-commas', true, 'parsed after trailing-comma removal'); return { json: j, raw, method: 'remove-trailing-commas', attempts }; }
    catch (e) { record('remove-trailing-commas', false, e.message); }
  }

  // 5. Close truncated objects (unbalanced braces)
  const closed = closeBraces(noCommas);
  if (closed !== noCommas) {
    try { const j = JSON.parse(closed); record('close-braces', true, 'parsed after brace closure'); return { json: j, raw, method: 'close-braces', attempts }; }
    catch (e) { record('close-braces', false, e.message); }
  }

  // 6. Final attempt: close braces + remove trailing commas together
  const combined = closeBraces(removeTrailingCommas(extracted || fenced));
  if (combined !== (extracted || fenced)) {
    try { const j = JSON.parse(combined); record('combined-repair', true, 'parsed after combined repair'); return { json: j, raw, method: 'combined-repair', attempts }; }
    catch (e) { record('combined-repair', false, e.message); }
  }

  return { json: null, raw, method: 'failed', attempts };
}

export function stripCodeFences(text) {
  // Match ```json ... ``` or ``` ... ```
  const m = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i);
  if (m && m[1]) return m[1].trim();
  // Sometimes only an opening fence is present
  const open = text.match(/```(?:json)?\s*\n?([\s\S]*)/i);
  if (open && open[1]) return open[1].trim();
  return text.trim();
}

export function extractLargestObject(text) {
  const start = text.indexOf('{');
  if (start < 0) return null;
  // Walk forward tracking string state and brace depth.
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end > start) return text.slice(start, end + 1);
  // No balanced close — return from start to end of string for later repair.
  return text.slice(start);
}

export function removeTrailingCommas(text) {
  // Remove commas that precede a } or ] (with optional whitespace).
  return text.replace(/,\s*([}\]])/g, '$1');
}

export function closeBraces(text) {
  // Track open containers on a stack so closers are emitted in the correct
  // (LIFO) order — e.g. an object opened inside an array needs `}` before `]`.
  const stack = [];
  let inString = false, escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') {
      // Pop matching opener; ignore stray closers.
      for (let j = stack.length - 1; j >= 0; j--) {
        if (stack[j] === ch) { stack.splice(j, 1); break; }
      }
    }
  }
  let out = text;
  // If we're mid-string, close it first.
  if (inString) out += '"';
  // Close remaining openers in reverse order.
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i];
  return out;
}

/**
 * One-shot repair pass used by the controller. Returns the parsed
 * object or null, plus diagnostics for the debug panel.
 */
export function repairResponse(rawText) {
  const result = extractAndRepair(rawText);
  return {
    json: result.json,
    method: result.method,
    attempts: result.attempts,
    repaired: result.json != null && result.method !== 'direct-parse'
  };
}
