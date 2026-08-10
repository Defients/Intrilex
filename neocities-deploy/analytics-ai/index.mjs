// ═══════════════════════════════════════════════════════════════
// index.mjs — Public entry point for @intrilex/analytics-ai.
// Re-exports the full surface so consumers can import from one place.
// ═══════════════════════════════════════════════════════════════

export * from './config.mjs';
export * from './ollama-client.mjs';
export * from './model-discovery.mjs';
export * from './security-sanitizer.mjs';
export * from './deterministic-statistics.mjs';
export { buildContext, ANALYSIS_MODE, ALL_MODES } from './analytics-context-builder.mjs';
export * from './response-schema.mjs';
export { validateAnalysisResponse } from './response-validator.mjs';
export { repairResponse, extractAndRepair } from './response-repair.mjs';
export { buildMessages, buildSystemPrompt, buildUserPrompt } from './prompt-builder.mjs';
export { AnalysisCache, computeCacheKey, deriveDatasetId } from './analysis-cache.mjs';
export { AnalysisController, ANALYSIS_STATUS } from './analysis-controller.mjs';
