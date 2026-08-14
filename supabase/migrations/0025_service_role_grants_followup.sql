-- ═══════════════════════════════════════════════════════════════
-- Migration 0025: service_role grants followup
--
-- Fixes missing GRANT statements on server-owned tables that were
-- created without explicit service_role privileges. On newer Supabase
-- projects (2025+), the service_role does NOT automatically bypass
-- RLS — it needs explicit table-level GRANTs even though it ignores
-- RLS policies.
--
-- Affected tables:
--   account_moderation     (migration 0006 — caused production outage)
--   tournaments            (migration 0020)
--   tournament_participants (migration 0020)
--   tournament_matches     (migration 0020)
--
-- The original migrations (0006, 0020) have also been fixed for fresh
-- installs. This migration ensures existing installs that already ran
-- those migrations get the missing grants.
--
-- Also grants on player_reports and player_relationships for
-- defense-in-depth, even though the server currently accesses those
-- via SECURITY DEFINER RPCs rather than direct table queries.
-- ═══════════════════════════════════════════════════════════════

-- ── Critical: tables the match server accesses directly ──

-- account_moderation: read by SupabaseIdentityVerifier on every auth
-- and by the startup moderation probe (IRX-H04).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_moderation TO service_role;

-- Tournament tables: read/written by SupabaseTournamentRepository
-- for tournament lifecycle (creation, registration, brackets, results).
GRANT ALL PRIVILEGES ON TABLE public.tournaments TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.tournament_participants TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.tournament_matches TO service_role;

-- ── Defense-in-depth: tables accessed via RPC but may be queried
--    directly in the future (e.g. blockChecker for player_relationships) ──

-- player_reports: server may read/update report status for moderation.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_reports TO service_role;

-- player_relationships: server may read for block enforcement.
GRANT SELECT ON public.player_relationships TO service_role;

-- achievement_catalog: server may read to validate achievement IDs.
GRANT SELECT ON public.achievement_catalog TO service_role;

-- ── EXECUTE grant on the atomic tournament save RPC ──
-- Migration 0024 created upsert_tournament_atomic (SECURITY DEFINER)
-- but did not grant EXECUTE to service_role.
GRANT EXECUTE ON FUNCTION public.upsert_tournament_atomic(JSONB, JSONB, JSONB) TO service_role;
