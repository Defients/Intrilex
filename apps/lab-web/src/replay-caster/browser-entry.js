// ═══════════════════════════════════════════════════════════════
// browser-entry.js — Browser entry point for @intrilex/replay-caster.
//
// Re-exports the browser-bundleable subset of the package. The source
// modules are copied to dist/replay-caster/ by build.mjs, so imports
// are relative to this file's dist location.
//
// The package imports @intrilex/shared (aliased to the browser shim by
// bundle.mjs) and uses string-concatenated dynamic imports for the
// Node-only simulation-runtime and engine-adapter (so esbuild leaves
// them as runtime dynamic imports, never bundled for the browser).
//
// The browser UI uses CasterSession.loadCompletedMatch() (not
// generateMatch), so the Node-only dynamic imports are never reached
// in the browser.
// ═══════════════════════════════════════════════════════════════

export {
  CasterSession,
  COMMENTARY_MODE,
  VIEWER_MODE,
  CASTER_SCHEMA_VERSION,
  SUPPORTED_SPEEDS
} from './caster-session.mjs';

export {
  DeterministicCommentaryProvider,
  composeDeterministic
} from './commentary-provider.mjs';

export {
  OllamaCommentaryProvider,
  OLLAMA_ERROR
} from './ollama-provider.mjs';

export * from './index.mjs';
