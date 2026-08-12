-- ═══════════════════════════════════════════════════════════════
-- Migration 0014: Authenticated table grants
--
-- Newer Supabase projects (2025+) use stricter default privileges
-- where the authenticated role does NOT automatically get SELECT
-- access to public tables. RLS policies alone are not enough —
-- the role must also have table-level privileges.
--
-- This grants SELECT to authenticated on all tables that the
-- browser client needs to read directly (profiles, profile_privacy
-- for directory_visible toggle, player_ratings for leaderboard).
-- Writes and sensitive reads are still gated by RLS policies.
--
-- The service_role already has full grants from migration 0008.
-- ═══════════════════════════════════════════════════════════════

-- Profiles: authenticated users can SELECT their own row (RLS-gated)
GRANT SELECT ON public.profiles TO authenticated;

-- Profile privacy: authenticated users can SELECT/UPDATE their own row (RLS-gated)
GRANT SELECT, UPDATE ON public.profile_privacy TO authenticated;

-- Player ratings: authenticated users can SELECT (RLS-gated to own row if needed)
GRANT SELECT ON public.player_ratings TO authenticated;

-- Account settings: authenticated users can SELECT/UPDATE their own row (RLS-gated)
GRANT SELECT, UPDATE ON public.account_settings TO authenticated;

-- Player stats: authenticated users can SELECT (RLS-gated)
GRANT SELECT ON public.player_stats TO authenticated;

-- Matches: authenticated users can SELECT (RLS-gated to participant)
GRANT SELECT ON public.matches TO authenticated;

-- Match participants: authenticated users can SELECT (RLS-gated to participant)
GRANT SELECT ON public.match_participants TO authenticated;

-- Account achievements: authenticated users can SELECT their own (RLS-gated)
GRANT SELECT ON public.account_achievements TO authenticated;

-- Achievement progress: authenticated users can SELECT their own (RLS-gated)
GRANT SELECT ON public.achievement_progress TO authenticated;
