-- ═══════════════════════════════════════════════════════════════
-- 0026_fix_tournament_atomic_search_path.sql
--
-- Phase 5: Fix SECURITY DEFINER function missing search_path.
--
-- The upsert_tournament_atomic function (migration 0024) was created
-- with SECURITY DEFINER but without an explicit search_path. This is
-- a search-path injection vulnerability. This migration sets
-- search_path = public to close the gap.
-- ═══════════════════════════════════════════════════════════════

ALTER FUNCTION public.upsert_tournament_atomic(JSONB, JSONB, JSONB)
  SET search_path = public;
