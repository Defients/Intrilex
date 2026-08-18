// ═══════════════════════════════════════════════════════════════
// commentary-planner.mjs — Build the three-timeline commentary input,
// construct the versioned prompt, and compute a deterministic cache
// key.
//
// Three knowledge channels:
//   PAST   — viewer-visible prior beats + prior commentary (bounded)
//   PRESENT— authoritative semantic facts for the current beat
//   FUTURE — PRIVATE commentator context for narrative planning only
//
// The FUTURE channel is clearly marked private and is NEVER included
// in the viewer-facing payload. The spoiler firewall is enforced by
// prompt/data separation + the validator's post-generation lint.
//
// Context is bounded (spec §31/§32): recent important beats + compact
// thread state + current beat + bounded future window. The
// commentator never receives a megabyte-scale replay body per call.
// ═══════════════════════════════════════════════════════════════

import { hashCanonical } from '@intrilex/shared';
import {
  COMMENTARY_PROMPT_VERSION, COMMENTARY_MODE, VIEWER_MODE,
  SPOILER_CHECK, makeCommentaryCacheKey
} from './schemas.mjs';
import { PACING_BAND, pacingBand, shouldSpeak } from './importance.mjs';
import {
  viewerThreadState, privateThreadState
} from './narrative-thread.mjs';
import { diagnosticsThroughBeat } from './diagnostics.mjs';

// ── Inlined security-sanitizer helpers ────────────────────────────
// These mirror @intrilex/analytics-ai/security-sanitizer but are
// inlined here so the planner is browser-bundleable without importing
// the analytics-ai package (which is not aliased in the browser
// bundle). Content is always fenced so model output cannot override
// system instructions.
const MAX_FIELD_CHARS = 20000;
const MAX_CONTEXT_CHARS = 200000;
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/gi,
  /disregard\s+(the\s+)?system\s+prompt/gi,
  /you\s+are\s+now\s+(a|an)\s+/gi,
  /new\s+instructions?:/gi,
  /<\/?(system|assistant|prompt|role)>/gi,
  /\[SYSTEM\]/gi, /\[INST\]/gi, /<<SYS>>/gi, /<\|im_start\|>/gi, /<\|im_end\|>/gi
];
function sanitizeString(v) {
  let text = typeof v === 'string' ? v : safeStringify(v);
  for (const p of INJECTION_PATTERNS) text = text.replace(p, '[redacted-injection-attempt]');
  if (text.length > MAX_FIELD_CHARS) text = `${text.slice(0, MAX_FIELD_CHARS)}…[truncated]`;
  return text;
}
function sanitizeObject(obj) {
  const walk = (v) => {
    if (v == null) return v;
    if (typeof v === 'string') return sanitizeString(v);
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v === 'object') { const o = {}; for (const [k, val] of Object.entries(v)) o[k] = walk(val); return o; }
    return v;
  };
  return { data: walk(obj), flags: [] };
}
function fenceContent(label, content) {
  return `<<<ANALYTICS_DATA ${label}\n${content}\nANALYTICS_DATA>>>`;
}
function enforceTotalLimit(text) {
  if (text.length <= MAX_CONTEXT_CHARS) return { text, truncated: false };
  return { text: `${text.slice(0, MAX_CONTEXT_CHARS)}\n\n[CONTEXT TRUNCATED — evidence omitted to stay within budget.]`, truncated: true };
}
function safeStringify(v) { try { return JSON.stringify(v); } catch { return String(v); } }

const PAST_WINDOW = 6;        // recent important beats
const FUTURE_WINDOW = 8;      // bounded future beats for planning
const MAX_PAST_COMMENTARY = 4;

/**
 * Build the complete commentary input for a beat.
 *
 * @param {object} ctx
 * @param {Array} ctx.beats - full beat sequence
 * @param {number} ctx.beatIndex - current beat index
 * @param {string} ctx.mode - COMMENTARY_MODE
 * @param {string} ctx.viewerMode - VIEWER_MODE
 * @param {Array} ctx.threads - narrative thread registry
 * @param {Array} ctx.diagnostics - full diagnostic registry
 * @param {Array} [ctx.commentaryHistory] - prior CommentaryRecords with beatId
 * @param {object} [ctx.matchMeta] - { matchId, policyIds, engineVersion, rulesVersion, profileId, winner, terminationReason }
 * @param {object} [ctx.settings] - { model, density }
 * @returns {object} commentary input (provider-facing)
 */
export function buildCommentaryInput(ctx) {
  const beats = ctx.beats;
  const beatIndex = ctx.beatIndex;
  const beat = beats[beatIndex];
  const mode = ctx.mode === COMMENTARY_MODE.DEV_OBSERVATORY ? ctx.mode : COMMENTARY_MODE.BROADCAST;
  const viewerMode = ctx.viewerMode ?? VIEWER_MODE.PUBLIC;

  const pastBeats = collectPastBeats(beats, beatIndex);
  const pastCommentary = collectPastCommentary(ctx.commentaryHistory, beats, beatIndex);
  const viewerThreads = viewerThreadState(ctx.threads, beatIndex);
  const privateThreads = privateThreadState(ctx.threads, beatIndex, beats);
  const visibleDiagnostics = diagnosticsThroughBeat(ctx.diagnostics, beatIndex)
    .map(stripPrivateDiagnosticFields);

  const present = buildPresentContext(beat, viewerMode);
  const future = buildFutureContext(beats, beatIndex, ctx.matchMeta, privateThreads);

  const beatProjectionHash = hashCanonical({
    beatId: beat.beatId, kind: beat.beatKind, publicSummary: beat.publicSummary,
    action: beat.action, decision: beat.decision, importance: beat.importance
  });

  const threadDigest = hashCanonical(viewerThreads.map(t => [t.threadId, t.status]));
  const cacheKey = makeCommentaryCacheKey({
    promptVersion: COMMENTARY_PROMPT_VERSION,
    model: ctx.settings?.model || '',
    mode, beatProjectionHash, viewerMode, threadDigest
  });

  return {
    promptVersion: COMMENTARY_PROMPT_VERSION,
    mode,
    viewerMode,
    beat: viewerSafeBeat(beat),
    pastContext: {
      visibleToViewer: true,
      recentBeats: pastBeats.map(viewerSafeBeat),
      priorCommentary: pastCommentary,
      narrativeThreads: viewerThreads
    },
    presentContext: { visibleToViewer: true, ...present },
    futureContext: future, // { visibleToViewer: false, ... }
    diagnostics: visibleDiagnostics,
    cacheKey,
    eligible: beat.commentaryEligible !== false && shouldSpeak(beat.importance, { density: ctx.settings?.density })
  };
}

/**
 * Build the versioned system + user prompt messages for an Ollama
 * chat request. Reuses the analytics-ai security sanitizer to fence
 * content and neutralize injection vectors.
 *
 * @param {object} input - output of buildCommentaryInput
 * @returns {{ messages: Array, systemPromptVersion: string, userPrompt: string }}
 */
export function buildCommentaryPrompt(input) {
  const systemPrompt = buildSystemPrompt(input.mode);
  const userPrompt = buildUserPrompt(input);
  return {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    systemPromptVersion: COMMENTARY_PROMPT_VERSION,
    systemPrompt,
    userPrompt
  };
}

// ── System prompt (the commentator contract) ──────────────────────

function buildSystemPrompt(mode) {
  const modeIntent = mode === COMMENTARY_MODE.DEV_OBSERVATORY
    ? `MODE: Dev Observatory
Prioritize debugging signal, decision oddities, evidence links, and unusual state transitions.
You may say "this deserves inspection" or "the trace deserves a closer look".
You MUST NOT say "the engine is broken" unless a diagnostic verdict is CONFIRMED_FAILURE.
For INVESTIGATE diagnostics, use language such as "worth inspecting" or "this looks unusual".`
    : `MODE: Broadcast
Prioritize understandable play-by-play, excitement, and concise strategic context.
Avoid developer jargon. Keep rule explanations brief and only when relevant.`;

  return `You are an Intrilex colour commentator.

You receive three channels:
1. PAST — viewer-known events and prior commentary.
2. PRESENT — current authoritative semantic facts.
3. FUTURE PRIVATE — future replay information for planning only. Marked visibleToViewer: false.

NEVER reveal future-private information directly or indirectly. Do not mention future draws, future actions, or the eventual winner before it becomes public through legal play.
Treat structured engine facts as authoritative. Never invent legal actions, card identities, targets, scores, rules, or hidden information.
When evidence is insufficient, say so. Do not declare a bug unless a diagnostic verdict is CONFIRMED_FAILURE.
A policy score is evidence about that policy's evaluation, not solved strategy. Never say a move was "objectively best".
Keep commentary conversational and concise. Avoid repetition and esports filler.

${modeIntent}

Return ONLY a JSON object with this shape:
{
  "importance": <number 0..1>,
  "headline": "<short string>",
  "commentary": "<one or two sentences>",
  "tone": "<ANALYTICAL|EXCITED|MEASURED|NEUTRAL>",
  "threadActions": [],
  "diagnosticReferences": ["<diagnosticId>", ...],
  "spoilerCheck": "PASS"
}

No prose before or after. No markdown fences.`;
}

function buildUserPrompt(input) {
  const past = sanitizeObject(input.pastContext).data;
  const present = sanitizeObject(input.presentContext).data;
  const future = sanitizeObject(input.futureContext).data;
  const diags = sanitizeObject(input.diagnostics).data;

  const blocks = [
    fenceContent('PAST (viewer-visible)', JSON.stringify(past, null, 2)),
    fenceContent('PRESENT (authoritative current facts)', JSON.stringify(present, null, 2)),
    fenceContent('FUTURE PRIVATE COMMENTATOR CONTEXT — NEVER REVEAL',
      JSON.stringify(future, null, 2)),
    fenceContent('DIAGNOSTICS (deterministic; treat as ground truth)',
      JSON.stringify(diags, null, 2))
  ];
  let userPrompt = `Commentate on the current beat below. Return the JSON object only.\n\n${blocks.join('\n\n')}`;
  const limited = enforceTotalLimit(userPrompt);
  return limited.text;
}

// ── Context builders ──────────────────────────────────────────────

function buildPresentContext(beat, viewerMode) {
  const ps = beat.publicSummary ?? {};
  return {
    beatId: beat.beatId,
    beatKind: beat.beatKind,
    sequence: beat.sequence,
    seat: beat.seat,
    turn: beat.turn,
    phase: beat.phase,
    scores: ps.scores ?? {},
    scoresBefore: ps.scoresBefore ?? null,
    goals: ps.goals ?? {},
    scoreDelta: ps.scoreDelta ?? 0,
    stackDepth: ps.stackDepth ?? 0,
    action: beat.action ?? null,
    decision: beat.decision ?? null,
    viewerMode
  };
}

function buildFutureContext(beats, beatIndex, matchMeta, privateThreads) {
  const upcoming = [];
  for (let i = beatIndex + 1; i < beats.length && upcoming.length < FUTURE_WINDOW; i += 1) {
    const b = beats[i];
    // Only surface compact, planning-relevant signals — never raw state.
    upcoming.push({
      beatId: b.beatId,
      beatKind: b.beatKind,
      sequence: b.sequence,
      importance: b.importance,
      scoreDelta: b.publicSummary?.scoreDelta ?? 0,
      family: b.action?.family ?? null
    });
  }
  const nextMajor = upcoming.find(b => pacingBand(b.importance) === PACING_BAND.HIGHLIGHT) ?? upcoming[0] ?? null;
  return {
    visibleToViewer: false,
    nextMajorBeat: nextMajor ? nextMajor.beatId : null,
    upcomingBeats: upcoming,
    narrativeThreads: privateThreads,
    matchOutcome: matchMeta ? {
      winnerSeat: matchMeta.winner ?? null,
      terminationReason: matchMeta.terminationReason ?? null
    } : null
  };
}

function collectPastBeats(beats, beatIndex) {
  const important = [];
  for (let i = beatIndex - 1; i >= 0 && important.length < PAST_WINDOW; i -= 1) {
    const b = beats[i];
    if (pacingBand(b.importance) !== PACING_BAND.SILENT || b.beatKind === 'MATCH_START') {
      important.unshift(b);
    }
  }
  return important;
}

function collectPastCommentary(history, beats, beatIndex) {
  if (!Array.isArray(history)) return [];
  const out = [];
  for (let i = history.length - 1; i >= 0 && out.length < MAX_PAST_COMMENTARY; i -= 1) {
    const h = history[i];
    if (!h || !h.beatId) continue;
    const idx = beats.findIndex(b => b.beatId === h.beatId);
    if (idx >= 0 && idx < beatIndex) {
      out.unshift({ beatId: h.beatId, commentary: h.commentary, mode: h.mode });
    }
  }
  return out;
}

// ── Viewer-safety projections ─────────────────────────────────────

/** Strip a beat to viewer-safe fields (no hidden state, no commands). */
function viewerSafeBeat(beat) {
  if (!beat) return null;
  return {
    beatId: beat.beatId,
    sequence: beat.sequence,
    beatKind: beat.beatKind,
    seat: beat.seat,
    turn: beat.turn,
    phase: beat.phase,
    publicSummary: beat.publicSummary,
    action: beat.action,
    decision: beat.decision,
    importance: beat.importance
  };
}

function stripPrivateDiagnosticFields(d) {
  if (!d) return d;
  const { _beatIndex, ...rest } = d;
  return rest;
}
