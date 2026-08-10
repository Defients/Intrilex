// ═══════════════════════════════════════════════════════════════
// security-sanitizer.mjs — Treats all simulation data as untrusted.
// Strips prompt-injection vectors, enforces size limits, and fences
// user/analytics content so it cannot override system instructions.
// ═══════════════════════════════════════════════════════════════

// Hard ceiling on any single string field contributed to the prompt.
export const MAX_FIELD_CHARS = 20000;
// Hard ceiling on the total assembled context payload (pre-token-estimate).
export const MAX_CONTEXT_CHARS = 200000;

// Patterns that commonly indicate prompt-injection attempts. We do not
// rely on these alone — content is always fenced — but we neutralize
// obvious attempts and flag them for the debug panel.
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/gi,
  /disregard\s+(the\s+)?system\s+prompt/gi,
  /you\s+are\s+now\s+(a|an)\s+/gi,
  /new\s+instructions?:/gi,
  /<\/?(system|assistant|prompt|role)>/gi,
  /\[SYSTEM\]/gi,
  /\[INST\]/gi,
  /<<SYS>>/gi,
  /<\|im_start\|>/gi,
  /<\|im_end\|>/gi
];

/**
 * Sanitize a single string value for inclusion in prompt content.
 * - Truncates to MAX_FIELD_CHARS.
 * - Neutralizes known injection patterns by replacing with a marker.
 * - Returns { text, flags } where flags lists the patterns triggered.
 */
export function sanitizePromptContent(value, { maxChars = MAX_FIELD_CHARS } = {}) {
  if (value == null) return { text: '', flags: [] };
  let text = typeof value === 'string' ? value : safeStringify(value);
  const flags = [];
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      flags.push(pattern.source.slice(0, 40));
      text = text.replace(pattern, '[redacted-injection-attempt]');
    }
  }
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars)}…[truncated ${text.length - maxChars} chars]`;
  }
  return { text, flags };
}

/**
 * Recursively sanitize an object destined for the prompt. Returns a
 * deep clone with all string values sanitized and a combined flags list.
 */
export function sanitizeObject(obj, { maxChars = MAX_FIELD_CHARS } = {}) {
  const allFlags = [];
  const walk = (v) => {
    if (v == null) return v;
    if (typeof v === 'string') {
      const { text, flags } = sanitizePromptContent(v, { maxChars });
      for (const f of flags) if (!allFlags.includes(f)) allFlags.push(f);
      return text;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v === 'object') {
      const out = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val);
      return out;
    }
    return v;
  };
  return { data: walk(obj), flags: allFlags };
}

/**
 * Wrap analytics/user content in unambiguous fences so the model cannot
 * mistake it for instructions. The fence uses a rare delimiter unlikely
 * to appear in real data.
 */
export function fenceContent(label, content) {
  const delim = '<<<ANALYTICS_DATA';
  const close = 'ANALYTICS_DATA>>>';
  return `${delim} ${label}\n${content}\n${close}`;
}

/**
 * Enforce a total size limit on the assembled context string. If it
 * exceeds MAX_CONTEXT_CHARS, truncate and append a clear marker so the
 * model knows evidence was omitted.
 */
export function enforceTotalLimit(text, { maxChars = MAX_CONTEXT_CHARS } = {}) {
  if (text.length <= maxChars) return { text, truncated: false, omittedChars: 0 };
  const omitted = text.length - maxChars;
  return {
    text: `${text.slice(0, maxChars)}\n\n[CONTEXT TRUNCATED — ${omitted} characters omitted to stay within budget. Some evidence is incomplete.]`,
    truncated: true,
    omittedChars: omitted
  };
}

function safeStringify(v) {
  try { return JSON.stringify(v); } catch { return String(v); }
}
