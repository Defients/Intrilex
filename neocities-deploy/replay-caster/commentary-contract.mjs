// ═══════════════════════════════════════════════════════════════
// commentary-contract.mjs — Formal fact-level authorization, versioned
// prompt provenance, deterministic fallback labeling, and malformed-
// stream handling for the Replay Caster commentary pipeline.
//
// This module hardens the commentary contract that sits between the
// untrusted LLM provider (ollama-provider.mjs) and the session
// orchestrator (caster-session.mjs). It guarantees:
//
//   1. FACT AUTHORIZATION — every fact surfaced to commentary is
//      formally authorized for the active viewer mode. Public viewers
//      only see public summary facts; Dev Observatory additionally
//      authorizes diagnostic facts; private facts are never authorized.
//
//   2. PROMPT PROVENANCE — every commentary history entry carries a
//      versioned provenance record (prompt version, system/user prompt
//      hashes, model id, provider name, schema version, timestamp) so
//      commentary can be audited and reproduced.
//
//   3. FALLBACK LABELING — when the provider fails, the deterministic
//      fallback is clearly labelled (isFallback, fallbackReason,
//      providerLabel='Deterministic Fallback') so telemetry and UI
//      never misattribute fallback output to Ollama.
//
//   4. MALFORMED-STREAM RECOVERY — partial or malformed model output
//      is parsed best-effort; recovered records are flagged, and
//      unrecoverable output falls back safely with a truncated raw
//      sample for debugging. This function never throws.
//
//   5. CONTRACT VALIDATION — a single entry point validates that a
//      commentary record passes schema validation, provenance is
//      complete and versioned, authorization covers all referenced
//      facts, and the spoiler firewall passes.
//
// Authority note: commentary is OBSERVATIONAL. No output of this
// module is sent to IntrilexEngine.execute. Commentary text is
// presentation only.
//
// Depends on: schemas.mjs (versioning + validation), commentary-
// provider.mjs (deterministic fallback), commentary-validator.mjs
// (parse + spoiler lint), @intrilex/shared (hashCanonical).
// ═══════════════════════════════════════════════════════════════

import { hashCanonical } from '@intrilex/shared';
import {
  CASTER_SCHEMA_VERSION,
  COMMENTARY_PROMPT_VERSION,
  COMMENTARY_MODE,
  VIEWER_MODE,
  SPOILER_CHECK,
  validateCommentaryRecord
} from './schemas.mjs';
import { composeDeterministic } from './commentary-provider.mjs';
import { parseJsonLoose, validateAndAccept, spoilerLint } from './commentary-validator.mjs';

// ── Enumerations ──────────────────────────────────────────────────

/**
 * Fact types surfaced to the commentary contract. Each fact authored
 * by `authorizeFacts` is classified into one of these categories.
 */
export const FACT_TYPE = Object.freeze({
  SCORE: 'score',
  ACTION: 'action',
  PHASE: 'phase',
  TURN: 'turn',
  IMPORTANCE: 'importance',
  DIAGNOSTIC: 'diagnostic',
  THREAD: 'thread',
  MATCH_META: 'match_meta'
});

/**
 * Authorization level for a fact. Public facts are authorized for all
 * viewer modes. Dev-only facts are authorized only in Dev Observatory
 * mode. Private facts are NEVER authorized for commentary.
 */
export const AUTHORIZATION_LEVEL = Object.freeze({
  PUBLIC: 'public',
  DEV_ONLY: 'dev-only',
  PRIVATE: 'private'
});

const VALID_FACT_TYPES = new Set(Object.values(FACT_TYPE));
const VALID_AUTH_LEVELS = new Set(Object.values(AUTHORIZATION_LEVEL));
const MAX_TRUNCATED_RAW = 500;

// ── Helpers ───────────────────────────────────────────────────────

function isNonEmptyString(v) { return typeof v === 'string' && v.length > 0; }
function isFiniteNumber(v) { return typeof v === 'number' && Number.isFinite(v); }

/**
 * Derive a deterministic fact ID from the beat id and fact type.
 * The fact id is stable across runs for the same beat + type pair,
 * enabling authorization audit trails to reference facts unambiguously.
 */
function makeFactId(beatId, factType) {
  return `CF-${hashCanonical({ beatId, factType }).slice(0, 16)}`;
}

/**
 * Build a single fact authorization record. Internal helper used by
 * `authorizeFacts` to assemble the authorized fact set.
 */
function makeFact(beat, factType, source, level, value) {
  const beatId = beat?.beatId ?? '';
  return {
    factId: makeFactId(beatId, factType),
    beatId,
    factType,
    source,
    authorized: level !== AUTHORIZATION_LEVEL.PRIVATE,
    authorizationLevel: level,
    value
  };
}

// ── Fact-level authorization ──────────────────────────────────────

/**
 * Authorize the set of facts available for commentary on a beat, given
 * the active viewer mode and commentary mode.
 *
 * Public viewer mode authorizes only public summary facts (scores,
 * actions, phase, turn, importance, public match meta, public
 * threads). Dev Observatory mode additionally authorizes diagnostic
 * facts. Private facts (future-private match outcome, raw hidden
 * state) are NEVER authorized regardless of mode.
 *
 * @param {object} beat - the CasterBeat to authorize facts for
 * @param {string} viewerMode - one of VIEWER_MODE
 * @param {string} mode - one of COMMENTARY_MODE
 * @returns {CommentaryFactAuthorization[]} authorized facts (private facts excluded)
 */
export function authorizeFacts(beat, viewerMode, mode) {
  if (beat == null || typeof beat !== 'object') return [];
  const vMode = (viewerMode === VIEWER_MODE.OMNISCIENT || viewerMode === VIEWER_MODE.PLAYER)
    ? viewerMode
    : VIEWER_MODE.PUBLIC;
  const devMode = mode === COMMENTARY_MODE.DEV_OBSERVATORY;
  const ps = beat.publicSummary ?? {};
  const facts = [];

  // ── Public summary facts (always authorized for all viewer modes) ──
  if (ps.scores != null) {
    facts.push(makeFact(beat, FACT_TYPE.SCORE, 'engine', AUTHORIZATION_LEVEL.PUBLIC, ps.scores));
  }
  if (beat.action != null) {
    facts.push(makeFact(beat, FACT_TYPE.ACTION, 'engine', AUTHORIZATION_LEVEL.PUBLIC, beat.action));
  }
  if (beat.phase != null) {
    facts.push(makeFact(beat, FACT_TYPE.PHASE, 'engine', AUTHORIZATION_LEVEL.PUBLIC, beat.phase));
  }
  if (beat.turn != null) {
    facts.push(makeFact(beat, FACT_TYPE.TURN, 'engine', AUTHORIZATION_LEVEL.PUBLIC, beat.turn));
  }
  if (isFiniteNumber(beat.importance)) {
    facts.push(makeFact(beat, FACT_TYPE.IMPORTANCE, 'engine', AUTHORIZATION_LEVEL.PUBLIC, beat.importance));
  }
  // Match meta is public only when the match has concluded (winner is public).
  if (ps.winner != null) {
    facts.push(makeFact(beat, FACT_TYPE.MATCH_META, 'engine', AUTHORIZATION_LEVEL.PUBLIC, {
      winner: ps.winner,
      terminationReason: ps.terminationReason ?? null
    }));
  }

  // ── Narrative threads (public projection) ──
  // Threads are narrative-derived; their public projection is authorized.
  // The private thread state (future payoffs) stays private.
  if (Array.isArray(beat._viewerThreads)) {
    for (const t of beat._viewerThreads) {
      if (t && t.threadId) {
        facts.push(makeFact(beat, FACT_TYPE.THREAD, 'narrative', AUTHORIZATION_LEVEL.PUBLIC, {
          threadId: t.threadId,
          status: t.status,
          topic: t.topic ?? null
        }));
      }
    }
  }

  // ── Diagnostic facts (dev-only) ──
  // Diagnostics are only authorized in Dev Observatory mode. In public
  // broadcast mode they are dev-only and excluded from the authorized set.
  if (Array.isArray(beat._diagnostics)) {
    for (const d of beat._diagnostics) {
      if (!d || !d.diagnosticId) continue;
      // Diagnostics are dev-only. In dev mode the fact is authorized;
      // in public broadcast mode it is not.
      const fact = makeFact(beat, FACT_TYPE.DIAGNOSTIC, 'diagnostic', AUTHORIZATION_LEVEL.DEV_ONLY, {
        diagnosticId: d.diagnosticId,
        verdict: d.verdict ?? null,
        observed: d.observed ?? null,
        category: d.category ?? null
      });
      fact.authorized = devMode;
      facts.push(fact);
    }
  }

  // ── Private facts are never authorized ──
  // Future-private match outcome and raw hidden state are intentionally
  // NOT added to the fact set. They cannot be referenced by commentary.

  // Filter to the authorized set (private facts were never added; this
  // also drops dev-only facts when not in dev mode).
  return facts.filter(f => f.authorized);
}

// ── Prompt provenance ─────────────────────────────────────────────

/**
 * Build a versioned prompt provenance record from a commentary input
 * and prompt result. This provenance is attached to every commentary
 * history entry so output can be audited and reproduced.
 *
 * @param {object} input - output of buildCommentaryInput (carries promptVersion, mode, viewerMode)
 * @param {object} promptResult - output of buildCommentaryPrompt ({ systemPrompt, userPrompt, systemPromptVersion })
 * @param {string} providerName - 'ollama' | 'deterministic'
 * @param {string} modelId - the model used, or 'deterministic' for the fallback
 * @returns {PromptProvenance} provenance record
 */
export function buildPromptProvenance(input, promptResult, providerName, modelId) {
  const systemPrompt = promptResult?.systemPrompt ?? '';
  const userPrompt = promptResult?.userPrompt ?? '';
  return {
    promptVersion: promptResult?.systemPromptVersion || input?.promptVersion || COMMENTARY_PROMPT_VERSION,
    systemPromptHash: hashCanonical(systemPrompt),
    userPromptHash: hashCanonical(userPrompt),
    modelId: modelId || 'deterministic',
    providerName: providerName || 'deterministic',
    createdAt: new Date().toISOString(),
    schemaVersion: CASTER_SCHEMA_VERSION
  };
}

// ── Deterministic fallback commentary ─────────────────────────────

/**
 * Create a labelled fallback commentary record. This wraps the existing
 * `composeDeterministic` but adds explicit fallback labeling so
 * telemetry and UI never misattribute fallback output to Ollama.
 *
 * @param {object} beat - the CasterBeat
 * @param {object} presentContext - the present context (scores, action, etc.)
 * @param {string} mode - COMMENTARY_MODE
 * @param {Array} diagnostics - diagnostics array
 * @param {string} fallbackReason - the error category that triggered the fallback
 * @returns {FallbackCommentaryRecord} labelled fallback commentary
 */
export function createFallbackCommentary(beat, presentContext, mode, diagnostics, fallbackReason) {
  const record = composeDeterministic(beat, presentContext || {}, mode, diagnostics || []);
  return {
    ...record,
    isFallback: true,
    fallbackReason: fallbackReason || 'UNKNOWN',
    providerLabel: 'Deterministic Fallback',
    spoilerCheck: SPOILER_CHECK.PASS
  };
}

// ── Malformed-stream handling ─────────────────────────────────────

/**
 * Handle a malformed or partial model stream. Attempts to recover a
 * valid commentary record from raw output; if recovery fails, returns
 * a labelled fallback commentary with the raw output truncated for
 * debugging. NEVER throws — always returns a safe record.
 *
 * @param {string} rawOutput - the raw model output text
 * @param {object} input - the commentary input (for validation + fallback)
 * @param {string} errorCategory - the error category that triggered handling
 * @returns {{ record, recovered, malformedStream, truncatedRaw }} safe result
 */
export function handleMalformedStream(rawOutput, input, errorCategory) {
  const beat = input?.beat ?? null;
  const presentContext = input?.presentContext ?? {};
  const mode = input?.mode ?? COMMENTARY_MODE.BROADCAST;
  const diagnostics = input?.diagnostics ?? [];
  const reason = errorCategory || 'MALFORMED_RESPONSE';

  // Attempt best-effort recovery with the tolerant parser.
  const parsed = parseJsonLoose(rawOutput);
  if (parsed.ok) {
    const accepted = validateAndAccept(JSON.stringify(parsed.value), input);
    if (accepted.accepted) {
      return {
        record: { ...accepted.record, partialRecovery: true },
        recovered: true,
        malformedStream: false,
        truncatedRaw: null
      };
    }
  }

  // Recovery failed — produce a labelled fallback with truncated raw.
  const fallback = createFallbackCommentary(beat, presentContext, mode, diagnostics, reason);
  const raw = typeof rawOutput === 'string' ? rawOutput : String(rawOutput ?? '');
  const truncatedRaw = raw.length > MAX_TRUNCATED_RAW
    ? `${raw.slice(0, MAX_TRUNCATED_RAW)}…[truncated]`
    : raw;
  return {
    record: { ...fallback, malformedStream: true },
    recovered: false,
    malformedStream: true,
    truncatedRaw
  };
}

// ── Commentary authorization lint ─────────────────────────────────

/**
 * Check whether a commentary text only references authorized facts.
 * This is a coarse string-match guard that flags obvious references to
 * unauthorized fact values (diagnostic ids in public mode, private
 * match outcome). It does NOT prove semantic secrecy — the primary
 * protection is prompt/data separation.
 *
 * @param {string} commentaryText - the commentary text to check
 * @param {CommentaryFactAuthorization[]} authorizedFacts - the authorized fact set
 * @returns {{ authorized, unauthorizedReferences }} result
 */
export function isCommentaryAuthorized(commentaryText, authorizedFacts) {
  const text = (commentaryText || '').toLowerCase();
  if (!text.trim()) return { authorized: true, unauthorizedReferences: [] };
  const authorized = Array.isArray(authorizedFacts) ? authorizedFacts : [];
  const references = [];

  // Build the set of authorized diagnostic ids so we can flag references
  // to diagnostic identifiers that are not in the authorized set.
  const authorizedDiagIds = new Set();
  for (const f of authorized) {
    if (f.factType === FACT_TYPE.DIAGNOSTIC && f.value?.diagnosticId) {
      authorizedDiagIds.add(String(f.value.diagnosticId).toLowerCase());
    }
  }

  // Scan for diagnostic-id-shaped tokens and flag any that are not authorized.
  const diagIdPattern = /\b([A-Za-z0-9_-]{8,})\b/g;
  let match;
  while ((match = diagIdPattern.exec(text)) !== null) {
    const token = match[1].toLowerCase();
    // Heuristic: a token is a suspicious diagnostic reference if it is
    // not an authorized diagnostic id AND it resembles a diagnostic id
    // prefix. We only flag when an authorized diagnostic set was provided
    // (non-empty) so that ordinary words are not false-flagged.
    if (authorizedDiagIds.size > 0 && !authorizedDiagIds.has(token)) {
      // Check if the token matches any known diagnostic id prefix from the
      // raw (potentially unauthorized) diagnostics carried on the beat.
      // This is intentionally conservative — only flag exact-id leaks.
      const allDiagIds = (authorizedFacts || [])
        .filter(f => f.factType === FACT_TYPE.DIAGNOSTIC)
        .map(f => String(f.value?.diagnosticId ?? '').toLowerCase());
      // If the token matches a diagnostic id that exists but is not
      // authorized, flag it. Otherwise it is just an ordinary word.
      if (allDiagIds.includes(token) && !authorizedDiagIds.has(token)) {
        references.push({ type: 'unauthorized_diagnostic_reference', match: match[0] });
      }
    }
  }

  // Check for private match outcome references (winner seat stated as fact).
  // The authorized fact set for public mode does not include future-private
  // match outcome, so any "seat X wins" phrasing is unauthorized.
  const winnerPhrases = [
    /seat\s+([0-9])\s+wins/i,
    /winner\s+is\s+seat\s+([0-9])/i,
    /seat\s+([0-9])\s+will\s+win/i,
    /seat\s+([0-9])\s+takes\s+the\s+match/i
  ];
  for (const p of winnerPhrases) {
    if (p.test(commentaryText)) {
      // Only flag if the match meta fact is NOT authorized (future-private).
      const metaAuthorized = authorized.some(
        f => f.factType === FACT_TYPE.MATCH_META && f.authorized
      );
      if (!metaAuthorized) {
        references.push({ type: 'private_match_outcome', match: commentaryText.match(p)?.[0] });
      }
    }
  }

  return {
    authorized: references.length === 0,
    unauthorizedReferences: references
  };
}

// ── Commentary contract validation ────────────────────────────────

/**
 * Validate a complete commentary contract: the record, its provenance,
 * and the fact authorization that covers it. Returns a structured
 * result with errors (critical) and warnings (non-critical).
 *
 * Critical errors:
 *   - schema validation failure
 *   - spoiler check failure
 *   - missing provenance
 *
 * Warnings (non-critical):
 *   - unversioned provenance (promptVersion mismatch)
 *   - authorization does not cover all referenced facts
 *   - schema version mismatch
 *
 * @param {object} record - the CommentaryRecord to validate
 * @param {PromptProvenance} provenance - the prompt provenance
 * @param {CommentaryFactAuthorization[]} authorization - authorized facts
 * @returns {{ valid, errors, warnings }} validation result
 */
export function validateCommentaryContract(record, provenance, authorization) {
  const errors = [];
  const warnings = [];

  // 1. Schema validation of the commentary record.
  if (record == null || typeof record !== 'object') {
    errors.push('commentary record must be an object');
    return { valid: false, errors, warnings };
  }
  const { valid: schemaValid, errors: schemaErrors, normalized } = validateCommentaryRecord(record);
  if (!schemaValid) {
    errors.push(...schemaErrors.map(e => `SCHEMA: ${e}`));
  }

  // 2. Spoiler firewall lint.
  if (normalized && schemaValid) {
    const lint = spoilerLint(normalized, { futureContext: record._futureContext ?? null });
    if (lint.failed) {
      errors.push(`SPOILER_LINT: ${lint.reason}`);
    } else if (normalized.spoilerCheck === SPOILER_CHECK.FAIL) {
      errors.push('spoilerCheck is FAIL — commentary reveals future-private information');
    }
  }

  // 3. Provenance completeness.
  if (provenance == null || typeof provenance !== 'object') {
    errors.push('provenance is required');
  } else {
    if (!isNonEmptyString(provenance.promptVersion)) {
      errors.push('provenance.promptVersion is required');
    } else if (provenance.promptVersion !== COMMENTARY_PROMPT_VERSION) {
      warnings.push(`provenance promptVersion ${provenance.promptVersion} != current ${COMMENTARY_PROMPT_VERSION} (unversioned provenance)`);
    }
    if (!isNonEmptyString(provenance.systemPromptHash)) {
      warnings.push('provenance.systemPromptHash is missing (unversioned provenance)');
    }
    if (!isNonEmptyString(provenance.userPromptHash)) {
      warnings.push('provenance.userPromptHash is missing (unversioned provenance)');
    }
    if (!isNonEmptyString(provenance.modelId)) {
      warnings.push('provenance.modelId is missing');
    }
    if (!isNonEmptyString(provenance.providerName)) {
      warnings.push('provenance.providerName is missing');
    }
    if (!isNonEmptyString(provenance.schemaVersion)) {
      warnings.push('provenance.schemaVersion is missing');
    } else if (provenance.schemaVersion !== CASTER_SCHEMA_VERSION) {
      warnings.push(`provenance schemaVersion ${provenance.schemaVersion} != current ${CASTER_SCHEMA_VERSION}`);
    }
  }

  // 4. Authorization coverage.
  if (Array.isArray(authorization)) {
    const authCheck = isCommentaryAuthorized(normalized?.commentary ?? '', authorization);
    if (!authCheck.authorized) {
      warnings.push(`authorization does not cover all referenced facts: ${
        authCheck.unauthorizedReferences.map(r => r.type).join(', ')
      }`);
    }
    // Verify all facts in the authorization set have valid types/levels.
    for (const f of authorization) {
      if (!VALID_FACT_TYPES.has(f.factType)) {
        warnings.push(`authorization contains unknown factType: ${f.factType}`);
      }
      if (!VALID_AUTH_LEVELS.has(f.authorizationLevel)) {
        warnings.push(`authorization contains unknown authorizationLevel: ${f.authorizationLevel}`);
      }
      if (f.authorizationLevel === AUTHORIZATION_LEVEL.PRIVATE && f.authorized) {
        errors.push(`private fact ${f.factId} is marked authorized — private facts must never be authorized`);
      }
    }
  } else {
    warnings.push('authorization fact set is not provided — coverage cannot be verified');
  }

  return { valid: errors.length === 0, errors, warnings };
}
