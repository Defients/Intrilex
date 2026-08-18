// ═══════════════════════════════════════════════════════════════
// commentary-validator.mjs — Parse, validate, and spoiler-lint model
// output. This is the boundary that accepts or rejects LLM JSON.
//
// Malformed output fails safely (never crashes). The spoiler firewall
// performs a lightweight post-generation sanity check for obvious
// leakage. The PRIMARY protection is prompt/data separation and
// projection discipline — this lint is defense-in-depth, not a proof
// of perfect semantic secrecy.
// ═══════════════════════════════════════════════════════════════

import { validateCommentaryRecord, SPOILER_CHECK } from './schemas.mjs';

/**
 * Parse raw model text, validate the JSON shape, and run the spoiler
 * firewall lint against the input's FUTURE-private context.
 *
 * @param {string} raw - raw model output text
 * @param {object} input - the commentary input (for spoiler lint)
 * @returns {{ accepted: boolean, record: CommentaryRecord, error: string|null }}
 */
export function validateAndAccept(raw, input) {
  const parsed = parseJsonLoose(raw);
  if (!parsed.ok) {
    return { accepted: false, record: emptySafe(), error: parsed.error };
  }
  const { valid, errors, normalized } = validateCommentaryRecord(parsed.value);
  if (!valid) {
    return { accepted: false, record: emptySafe(), error: `SCHEMA: ${errors.join('; ')}` };
  }
  // Spoiler firewall: lint commentary text against future-private facts.
  const lint = spoilerLint(normalized, input);
  if (lint.failed) {
    // Reject the line rather than displaying potential spoilers.
    const rejected = { ...normalized, spoilerCheck: SPOILER_CHECK.FAIL };
    return { accepted: false, record: rejected, error: `SPOILER_LINT: ${lint.reason}` };
  }
  normalized.spoilerCheck = SPOILER_CHECK.PASS;
  return { accepted: true, record: normalized, error: null };
}

/**
 * Lightweight spoiler firewall lint.
 *
 * Checks the commentary text for direct mentions of:
 *   - future beat IDs from the private FUTURE channel
 *   - the eventual winner seat (when it would not yet be public)
 *   - obvious future-action family spoilers
 *
 * This is a coarse string-match guard. It does NOT prove semantic
 * secrecy. The primary protection is prompt/data separation.
 */
export function spoilerLint(record, input) {
  const text = (record?.commentary || '').toLowerCase();
  const headline = (record?.headline || '').toLowerCase();
  const combined = `${text} ${headline}`;
  if (!combined.trim()) return { failed: false };

  const future = input?.futureContext;
  if (!future || future.visibleToViewer !== false) {
    // No private future context to lint against — nothing to check.
    return { failed: false };
  }

  // 1. Future beat IDs should never appear in commentary.
  const futureBeatIds = (future.upcomingBeats || []).map(b => b.beatId).filter(Boolean);
  for (const id of futureBeatIds) {
    if (id && combined.includes(id.toLowerCase())) {
      return { failed: true, reason: `commentary references future beat id ${id}` };
    }
  }

  // 2. Eventual winner seat should not be stated as certainty before
  //    it is public. We only flag explicit "seat X wins" / "winner is X"
  //    phrasing combined with the private matchOutcome winner.
  const winner = future.matchOutcome?.winnerSeat;
  if (winner) {
    const winPhrases = [
      `seat ${winner} wins`, `winner is seat ${winner}`, `seat ${winner} will win`,
      `seat ${winner} is going to win`, `seat ${winner} takes the match`
    ];
    for (const p of winPhrases) {
      if (combined.includes(p.toLowerCase())) {
        return { failed: true, reason: `commentary states future winner seat ${winner}` };
      }
    }
  }

  return { failed: false };
}

// ── JSON parsing (tolerant) ───────────────────────────────────────

/**
 * Parse JSON from raw model text. Tolerates leading/trailing prose and
 * markdown code fences. Never throws.
 */
export function parseJsonLoose(raw) {
  if (!raw || typeof raw !== 'string') return { ok: false, error: 'EMPTY_RESPONSE', value: null };
  const trimmed = raw.trim();
  // Direct parse first.
  try { return { ok: true, value: JSON.parse(trimmed) }; } catch { /* continue */ }
  // Strip markdown fences.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try { return { ok: true, value: JSON.parse(fenced[1].trim()) }; } catch { /* continue */ }
  }
  // Extract the first {...} block.
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return { ok: true, value: JSON.parse(trimmed.slice(start, end + 1)) }; } catch { /* continue */ }
  }
  return { ok: false, error: 'MALFORMED_JSON', value: null };
}

function emptySafe() {
  return validateCommentaryRecord({ commentary: '' }).normalized;
}
