# RFC: History API Routing Migration

## Status: DEFERRED (not implemented)

## Problem

The app uses hash-based routing (`#/route`). All routes share the same
static `index.html`, so crawlers and social unfurling always see the
homepage metadata regardless of the route. This limits per-route SEO.

## Current Architecture

- **Router:** `apps/lab-web/src/router.js` — parses `location.hash`
- **Navigation:** 39 `location.hash = '#/route'` assignments across 7 files
- **Anchor links:** 50+ `href="#/route"` links in 7 files
- **Listeners:** 2 `hashchange` listeners (app.js, experiment-controls.js)
- **Profile routing:** `profile.js` manually parses hash path for `/player/@handle`
- **Query strings:** stripped by router; only `?player=` exists (unparsed)

## Proposed Approach

1. **Navigation abstraction layer** (`navigate(route, params)`) in a new
   module that wraps `history.pushState` + `dispatchEvent(new PopStateEvent(...))`
2. **Replace all `location.hash = ...`** assignments with `navigate(...)`
3. **Replace all `href="#/..."`** with click handlers using `navigate(...)`
   (or use `<a href="/route" data-navigate>` with a delegated click listener)
4. **Consolidate listeners** — single `popstate` listener replaces dual `hashchange`
5. **Server-side fallback** — configure the static host (Neocities) to serve
   `index.html` for all paths (Neocities does not support this; would need
   a CDN/proxy like Cloudflare Pages in front)
6. **Per-route static metadata** — with server-side fallback, generate
   per-route HTML shells with route-specific `<title>`, `<meta>`, and JSON-LD
7. **Update profile.js** to use `URLSearchParams` instead of manual hash parsing

## Migration Scope

| File | Changes |
|------|---------|
| router.js | Rewrite `route()` to use `location.pathname`; add `navigate()` export |
| app.js | 3 hash writes → `navigate()`; 21 anchor links → `data-navigate` |
| play-app.js | 29 hash writes → `navigate()`; 6 anchor links → `data-navigate` |
| board-events.js | 2 hash writes → `navigate()` |
| observatory.js | 2 hash writes → `navigate()` |
| leaderboard.js | 2 hash writes → `navigate()` |
| experiment-controls.js | 1 hash write → `navigate()`; 1 hashchange → popstate |
| profile.js | Manual hash parsing → URLSearchParams |
| network-lobby-renderer.mjs | 12 anchor links → `data-navigate` |
| legal-pages.js | 4 anchor links → `data-navigate` |
| replay-library.js | 2 anchor links → `data-navigate` |
| index.html | 4 anchor links → `data-navigate` |
| seo-metadata.js | No changes (already route-based) |

## Why Deferred

- **Large surface area:** 10+ files, 90+ touch points
- **Deployment constraint:** Neocities (static host) does not support
  path-based fallback — would require migrating to Cloudflare Pages or
  adding a proxy layer
- **Backward compatibility:** All existing `#/route` bookmarks and shared
  links must continue to work (requires a hash-to-path redirect shim)
- **Risk:** High — routing is the application's spine; a bug here breaks
  every navigation flow
- **Enhancement-first principle:** This is a new feature (per-route SEO),
  not a polish of existing behavior

## Prerequisites

1. Migrate static hosting from Neocities to Cloudflare Pages (or add
   a Cloudflare Worker proxy that rewrites all paths to `/index.html`)
2. Implement and test the navigation abstraction layer in isolation
3. Add a hash-to-path redirect shim for backward compatibility
4. Generate per-route HTML shells with route-specific metadata

## When to Implement

When per-route SEO becomes a business priority (e.g., needing separate
search results for `/rules`, `/privacy`, `/terms`).
