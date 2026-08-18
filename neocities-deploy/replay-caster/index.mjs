// ═══════════════════════════════════════════════════════════════
// index.mjs — Public entry point for @intrilex/replay-caster.
//
// Replay Caster v0.1 — an observability instrument disguised as a
// broadcast experience. Replays a completed deterministic AI-vs-AI
// Intrilex match with live-style pacing and optional Ollama
// commentary. Pure observational layer; never mutates gameplay,
// replay data, or engine authority.
// ═══════════════════════════════════════════════════════════════

export * from './schemas.mjs';
export { buildBeats } from './beat-builder.mjs';
export { computeImportance, shouldSpeak, pacingBand, PACING_BAND } from './importance.mjs';
export { PlaybackDirector, SUPPORTED_SPEEDS } from './playback-director.mjs';
export { buildThreadRegistry, viewerThreadState, privateThreadState } from './narrative-thread.mjs';
export { runDiagnostics, diagnosticsThroughBeat } from './diagnostics.mjs';
export { buildCommentaryInput, buildCommentaryPrompt } from './commentary-planner.mjs';
export { DeterministicCommentaryProvider, composeDeterministic } from './commentary-provider.mjs';
export { OllamaCommentaryProvider, OLLAMA_ERROR } from './ollama-provider.mjs';
export { validateAndAccept, spoilerLint, parseJsonLoose } from './commentary-validator.mjs';
export { captureWaitWhat } from './wait-what.mjs';
export { CasterSession } from './caster-session.mjs';
