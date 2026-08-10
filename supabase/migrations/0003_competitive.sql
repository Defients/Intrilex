-- ═══════════════════════════════════════════════════════════════
-- Migration 0003: player_ratings + player_stats
--
-- Server-authoritative competitive state.
-- Clients may SELECT (for leaderboard/profile display) but NEVER
-- INSERT/UPDATE/DELETE. Only the match server (service role) writes.
-- ═══════════════════════════════════════════════════════════════

-- ── player_ratings ──
CREATE TABLE IF NOT EXISTS public.player_ratings (
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  queue_id        text NOT NULL DEFAULT 'casual',
  season_id       text NOT NULL DEFAULT 'season-0',
  rating          integer NOT NULL DEFAULT 1200
    CHECK (rating >= 0 AND rating <= 5000),
  provisional     boolean NOT NULL DEFAULT true,
  rated_matches   integer NOT NULL DEFAULT 0,
  wins            integer NOT NULL DEFAULT 0,
  losses          integer NOT NULL DEFAULT 0,
  draws           integer NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, queue_id, season_id)
);

ALTER TABLE public.player_ratings ENABLE ROW LEVEL SECURITY;

-- Public leaderboard: anyone authenticated can see ratings
CREATE POLICY player_ratings_select ON public.player_ratings
  FOR SELECT TO authenticated
  USING (true);

-- NO INSERT/UPDATE/DELETE policies for authenticated role.
-- Only the service role (server) can write — RLS blocks all client writes.

-- ── player_stats ──
CREATE TABLE IF NOT EXISTS public.player_stats (
  user_id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  online_matches       integer NOT NULL DEFAULT 0,
  online_wins          integer NOT NULL DEFAULT 0,
  online_losses        integer NOT NULL DEFAULT 0,
  online_draws         integer NOT NULL DEFAULT 0,
  ranked_matches       integer NOT NULL DEFAULT 0,
  ranked_wins          integer NOT NULL DEFAULT 0,
  ranked_losses        integer NOT NULL DEFAULT 0,
  current_win_streak   integer NOT NULL DEFAULT 0,
  best_win_streak      integer NOT NULL DEFAULT 0,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.player_stats ENABLE ROW LEVEL SECURITY;

-- Owner can read their own stats; public can see stats for leaderboard
CREATE POLICY player_stats_owner_select ON public.player_stats
  FOR SELECT TO authenticated
  USING (true);

-- NO INSERT/UPDATE/DELETE policies for authenticated role.
-- Only the service role (server) can write.
