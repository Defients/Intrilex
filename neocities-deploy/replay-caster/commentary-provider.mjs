// ═══════════════════════════════════════════════════════════════
// commentary-provider.mjs — CommentaryProvider abstraction + the
// deterministic test double.
//
// Provider contract (all implementations):
//   async generateCommentary(input) -> {
//     ok: boolean,
//     record: CommentaryRecord | null,   // validated provider output
//     error: string | null,              // OLLAMA_ERROR category or null
//     cached: boolean                    // true if served from cache
//   }
//
// The production feature is fully testable without any external model
// via DeterministicCommentaryProvider. It never pretends its output
// came from Ollama.
// ═══════════════════════════════════════════════════════════════

import { validateCommentaryRecord, SPOILER_CHECK } from './schemas.mjs';

/**
 * @interface CommentaryProvider
 * generateCommentary(input) -> { ok, record, error, cached }
 */

/**
 * Deterministic commentary provider for tests and development.
 *
 * Produces concise, evidence-grounded commentary derived ONLY from
 * the structured beat facts in `input`. No RNG, no network. Same
 * input always yields the same output. The output is clearly
 * deterministic (not labelled as Ollama output).
 */
export class DeterministicCommentaryProvider {
  constructor() { this._providerName = 'deterministic'; }

  get name() { return this._providerName; }

  async generateCommentary(input) {
    if (!input || !input.beat) {
      return { ok: false, record: null, error: 'NO_BEAT', cached: false };
    }
    const beat = input.beat;
    const present = input.presentContext ?? {};
    const record = composeDeterministic(beat, present, input.mode, input.diagnostics ?? []);
    return { ok: true, record, error: null, cached: false };
  }
}

/**
 * Compose a deterministic CommentaryRecord from beat facts.
 * Pure function — exported for direct unit testing.
 */
export function composeDeterministic(beat, present, mode, diagnostics) {
  const scores = present.scores ?? beat.publicSummary?.scores ?? {};
  const seat = beat.seat;
  const seatKey = seat ? `P${seat}` : null;
  const score = seatKey ? scores[seatKey] : null;
  const goal = beat.publicSummary?.goals?.[seatKey] ?? null;
  const family = beat.action?.family;
  const margin = beat.decision?.selectionMargin;
  const delta = beat.publicSummary?.scoreDelta ?? 0;

  const parts = [];
  let headline = '';

  if (beat.beatKind === 'MATCH_START') {
    headline = 'Match begins';
    parts.push('Two policies take their seats. The opening decisions will set the tempo.');
  } else if (beat.beatKind === 'MATCH_END') {
    const winner = beat.publicSummary?.winner;
    headline = winner ? `Match goes to seat ${winner}` : 'Match complete';
    parts.push(beat.publicSummary?.terminationReason
      ? `The match ends (${beat.publicSummary.terminationReason}).`
      : 'The match concludes.');
  } else {
    if (delta > 0) {
      parts.push(`Seat ${seat} scores ${delta} point${delta === 1 ? '' : 's'}.`);
      if (score != null && goal != null && score >= goal) {
        parts.push(`That reaches the threshold at ${score}, but the Full Turn still has to complete.`);
      }
    }
    if (family) parts.push(`${family} from seat ${seat}.`);
    if (Number.isFinite(margin) && margin <= 5 && (beat.decision?.legalActionCount ?? 0) > 1) {
      parts.push(`That was a close call — the top two options were nearly tied.`);
    }
    if (parts.length === 0) parts.push(`Seat ${seat} acts in turn ${beat.turn ?? '?'}.`);
    headline = parts[0].replace(/\.$/, '');
  }

  // Dev Observatory: append diagnostic wording using approved language.
  if (mode === 'DEV_OBSERVATORY') {
    const investigates = diagnostics.filter(d => d.verdict === 'INVESTIGATE');
    for (const d of investigates.slice(0, 1)) {
      parts.push(`Worth inspecting: ${d.observed}.`);
    }
    const failures = diagnostics.filter(d => d.verdict === 'CONFIRMED_FAILURE');
    for (const f of failures.slice(0, 1)) {
      parts.push(`Confirmed failure: ${f.observed}.`);
    }
  }

  const importance = beat.importance ?? 0.5;
  return validateCommentaryRecord({
    importance,
    headline,
    commentary: parts.join(' '),
    tone: importance >= 0.8 ? 'EXCITED' : importance >= 0.5 ? 'ANALYTICAL' : 'MEASURED',
    threadActions: [],
    diagnosticReferences: diagnostics
      .filter(d => d.verdict === 'INVESTIGATE' || d.verdict === 'CONFIRMED_FAILURE')
      .map(d => d.diagnosticId),
    spoilerCheck: SPOILER_CHECK.PASS
  }).normalized;
}
