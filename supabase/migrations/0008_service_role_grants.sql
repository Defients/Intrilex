-- ═══════════════════════════════════════════════════════════════
-- Migration 0008: Service role grants
--
-- Newer Supabase projects (2025+) use a stricter default where the
-- service_role does NOT automatically bypass RLS. Explicit GRANT
-- statements are required for the server to read/write tables.
--
-- This grants ALL privileges on all account infrastructure tables
-- to the service_role so the match server can:
--   - Read/write match results (matches, match_participants)
--   - Read/write ratings (player_ratings, player_stats)
--   - Read/write achievements (account_achievements, achievement_progress)
--   - Read profiles and settings
--   - Write migration records (account_migrations)
-- ═══════════════════════════════════════════════════════════════

-- Grant privileges on all public tables to service_role
GRANT ALL PRIVILEGES ON TABLE public.profiles TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.account_settings TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.player_ratings TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.player_stats TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.matches TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.match_participants TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.account_achievements TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.achievement_progress TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.account_migrations TO service_role;

-- Also grant on sequences (for any AUTOINCREMENT columns, if added later)
-- Currently all tables use text/uuid PKs, but this is future-proofing.
DO $$
BEGIN
  -- Grant on any sequences that exist in the public schema
  EXECUTE (
    SELECT string_agg(
      format('GRANT ALL PRIVILEGES ON SEQUENCE %I TO service_role', sequence_name),
      '; '
    )
    FROM (
      SELECT sequence_name FROM information_schema.sequences
      WHERE sequence_schema = 'public'
    ) seqs
  );
EXCEPTION WHEN OTHERS THEN
  -- No sequences exist yet — safe to ignore
  NULL;
END $$;

-- Grant usage on the public schema
GRANT USAGE ON SCHEMA public TO service_role;
