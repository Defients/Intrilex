// ═══════════════════════════════════════════════════════════════
// vendor/supabase-js.js — Single choke point for the Supabase SDK
//
// This is the ONLY module in apps/lab-web/src that references the bare
// '@supabase/supabase-js' specifier. Every other browser module imports
// from here via a relative path, so no browser-served file ever contains
// a bare package specifier that the browser cannot resolve.
//
// esbuild resolves the bare specifier at bundle time. scripts/build.mjs
// additionally overwrites the raw dist copy of this file with a
// standalone esbuild bundle, so even if a stale service worker serves
// the raw module tree instead of the hashed bundle, the import resolves.
// ═══════════════════════════════════════════════════════════════

export { createClient } from '@supabase/supabase-js';

// Re-export the SDK types so JSDoc references that the build rewrites to
// point at this shim (e.g. `import("../../vendor/supabase-js.js").User`)
// continue to resolve.
/** @typedef {import('@supabase/supabase-js').SupabaseClient} SupabaseClient */
/** @typedef {import('@supabase/supabase-js').User} User */
/** @typedef {import('@supabase/supabase-js').Session} Session */
/** @typedef {import('@supabase/supabase-js').AuthChangeEvent} AuthChangeEvent */
export {};
